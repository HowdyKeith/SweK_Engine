// FILE: tools/wadVoxelizer.js
// VERSION: v1 — round 366
//
// Stamp a parsed Doom WAD map into the engine's voxel world. Walls
// become vertical columns; sector floors fill the interior (when
// available — falls back to walls-only if SECTORS/SIDEDEFS lumps are
// absent).
//
// Scale: 1 voxel = WAD_UNITS_PER_VOXEL WAD map units (default 16).
// Doom maps are typically ~3000 units across; at 1/16 scale that's
// ~190 voxels, which fits in the engine's grid (gridRadius=7 chunks
// × 16 = ±112 from camera-centered origin = 224 across).
//
// Coordinate mapping:
//   WAD x → voxel x  (positive east)
//   WAD y → voxel z  (positive north, Doom's "forward")
//
// The map is centered on the player_start (Thing type 1) by default,
// so the camera sees walls around it on spawn. If you want raw WAD
// coords, pass centerOnPlayerStart=false.

import { VOXEL } from "../world/voxelFormat.js";

const DEFAULT_UNITS_PER_VOXEL = 16;
const DEFAULT_WALL_HEIGHT     = 8;
const DEFAULT_BASE_Y          = 2;     // floors sit at this voxel Y by default

/** Bresenham line iteration over voxel grid. Yields each (x, z) cell. */
export function* _rasterLine(x0, z0, x1, z1) {
    let dx = Math.abs(x1 - x0);
    let dz = Math.abs(z1 - z0);
    let sx = x0 < x1 ? 1 : -1;
    let sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    let x = x0, z = z0;
    while (true) {
        yield [x, z];
        if (x === x1 && z === z1) break;
        const e2 = 2 * err;
        if (e2 > -dz) { err -= dz; x += sx; }
        if (e2 <  dx) { err += dx; z += sz; }
    }
}

/** Point-in-polygon via ray-casting. polygon is [[x,z], ...]. */
export function pointInPolygon(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], zi = polygon[i][1];
        const xj = polygon[j][0], zj = polygon[j][1];
        const intersect = ((zi > z) !== (zj > z)) &&
                          (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Build per-sector polygon hulls by walking right-sidedef chains. Doom
 * maps don't ship explicit sector polygons — they're implicit in the
 * linedef/sidedef → sector graph. We approximate by collecting all
 * linedefs whose right or left sidedef belongs to a given sector and
 * walking them into closed loops.
 *
 * For an MVP this is good enough; perfectly-correct sector boundaries
 * would need full BSP traversal (NODES/SSECTORS), which is a project.
 *
 * @returns {Map<number, Array<Array<[number, number]>>>} sectorIdx → array of polys
 */
/**
 * v382 — Walk the Doom BSP tree from the root to find which subsector
 * contains the point (px, py) (WAD coords). Returns the subsector
 * index, or -1 if the map has no NODES (caller falls back to
 * heuristic).
 *
 * Partition convention: a point is on the FRONT side of a partition
 * line if (px - x) * dy - (py - y) * dx <= 0 (the original Doom
 * P_PointOnPartitionSide convention — front = right child). The
 * "right child" is then descended into for the front-side test, the
 * "left child" for the back side.
 *
 * Subsector references have the high bit set; clear it (& 0x7FFF) to
 * get the subsector index. Internal node references don't have the
 * flag set and are descended further.
 */
const SUBSECTOR_FLAG = 0x8000;
export function pointToSubsector(parsedMap, px, py) {
    const nodes = parsedMap.nodes;
    if (!nodes || nodes.length === 0) return -1;
    let nodeIdx = parsedMap.rootNodeIdx ?? (nodes.length - 1);
    let safety = 0;
    while (safety++ < nodes.length + 1) {
        const n = nodes[nodeIdx];
        if (!n) return -1;
        const cross = (px - n.partX) * n.partDY - (py - n.partY) * n.partDX;
        // cross <= 0 → front side → right child
        const child = cross <= 0 ? n.rightChild : n.leftChild;
        if (child & SUBSECTOR_FLAG) {
            return child & 0x7FFF;
        }
        nodeIdx = child;
    }
    return -1;
}

/**
 * v382 — Resolve a subsector's parent sector. Each subsector's first
 * seg references a linedef; the linedef's sidedef (selected by the
 * seg's side flag) points to the sector. Returns -1 on a malformed
 * subsector.
 */
export function subsectorToSector(parsedMap, ssIdx) {
    const ss = parsedMap.subsectors?.[ssIdx];
    if (!ss || ss.segCount === 0) return -1;
    const segs = parsedMap.segs;
    const linedefs = parsedMap.linedefs;
    const sidedefs = parsedMap.sidedefs;
    if (!segs || !linedefs || !sidedefs) return -1;
    const seg = segs[ss.firstSeg];
    if (!seg) return -1;
    const ld = linedefs[seg.linedef];
    if (!ld) return -1;
    const sdIdx = seg.side === 0 ? ld.rightSide : ld.leftSide;
    if (sdIdx === 0xFFFF) return -1;
    const sd = sidedefs[sdIdx];
    return sd ? sd.sector : -1;
}

/**
 * v382 — Returns true if the parsed map has the lumps needed for the
 * exact BSP-based floor reconstruction. Falls back to the old
 * heuristic chain walk when false (PWADs that lack nodes etc).
 */
export function hasBSPData(parsedMap) {
    return !!(parsedMap?.nodes?.length &&
              parsedMap?.subsectors?.length &&
              parsedMap?.segs?.length);
}

export function buildSectorPolys(parsedMap) {
    if (!parsedMap.sectors || !parsedMap.sidedefs || !parsedMap.linedefs) return new Map();
    const sectors = parsedMap.sectors;
    const sidedefs = parsedMap.sidedefs;
    const linedefs = parsedMap.linedefs;
    const verts = parsedMap.vertices;

    const getVert = (i) => [verts[i * 2], verts[i * 2 + 1]];
    const sectorOf = (sideIdx) => (sideIdx !== 0xFFFF && sidedefs[sideIdx]) ? sidedefs[sideIdx].sector : -1;

    // For each sector, collect undirected edges (vert pairs) that
    // border it. An edge is a sector boundary if right OR left sidedef
    // belongs to that sector. We orient the edge so the sector is on
    // the right (Doom convention) when possible.
    const sectorEdges = new Map();
    for (const ld of linedefs) {
        const rs = sectorOf(ld.rightSide);
        const ls = sectorOf(ld.leftSide);
        // Right-side sector: edge oriented v1 → v2
        if (rs >= 0) {
            if (!sectorEdges.has(rs)) sectorEdges.set(rs, []);
            sectorEdges.get(rs).push([ld.v1, ld.v2]);
        }
        // Left-side sector: edge oriented v2 → v1 (reversed)
        if (ls >= 0 && ls !== rs) {
            if (!sectorEdges.has(ls)) sectorEdges.set(ls, []);
            sectorEdges.get(ls).push([ld.v2, ld.v1]);
        }
    }

    // Build closed loops per sector via greedy edge-chaining
    const result = new Map();
    for (const [sIdx, edges] of sectorEdges) {
        const remaining = new Set(edges.map((_, i) => i));
        const polys = [];
        while (remaining.size > 0) {
            // Start from any remaining edge
            const startIdx = remaining.values().next().value;
            remaining.delete(startIdx);
            const [a, b] = edges[startIdx];
            const loop = [a, b];
            let head = b;
            let safety = 1000;
            while (safety-- > 0) {
                // Find an edge starting at `head`
                let nextIdx = -1;
                for (const i of remaining) {
                    if (edges[i][0] === head) { nextIdx = i; break; }
                }
                if (nextIdx < 0) break;
                remaining.delete(nextIdx);
                head = edges[nextIdx][1];
                if (head === loop[0]) break;   // closed
                loop.push(head);
            }
            if (loop.length >= 3) {
                polys.push(loop.map(getVert));
            }
        }
        if (polys.length > 0) result.set(sIdx, polys);
    }
    return result;
}

/**
 * Voxelize a parsed WAD map into the engine's voxel world.
 *
 * @param {Object} world             VoxelWorld instance (must expose setVoxel)
 * @param {Object} parsedMap         output of WAD.parseMap (with full geometry)
 * @param {Object} [opts]
 * @param {number} [opts.unitsPerVoxel=16]   WAD units per voxel
 * @param {number} [opts.wallHeight=8]       voxel height of walls
 * @param {number} [opts.baseY=2]             floors land at this voxel Y
 * @param {number} [opts.wallMaterial=STONE]
 * @param {number} [opts.floorMaterial=DIRT]
 * @param {boolean} [opts.centerOnPlayerStart=true]
 * @param {Object|Function} [opts.wallTextureMap]   v378 — sidedef texture
 *   name → voxel material id. Two forms:
 *     - Object: { "BIGDOOR1": VOXEL.STONE, "STARTAN3": VOXEL.SAND, ... }
 *     - Function: (textureName, sidedef, linedef) => materialId
 *   Texture name is taken from the right sidedef's middle texture
 *   (the most common Doom convention for one-sided walls). Falls back
 *   to opts.wallMaterial when the map is missing or returns undefined.
 * @param {Object|Function} [opts.floorTextureMap]  v378 — sector
 *   floor-texture name → voxel material id (or function). Falls back
 *   to opts.floorMaterial.
 * @returns {Object} { playerStart, wallVoxelsWritten, floorVoxelsWritten, mapBounds, textureLookups }
 */
/**
 * v3738 -- THE MAP'S EXTENT, DERIVED WHEN THE PARSER DID NOT SUPPLY IT.
 *
 * *** WHY THIS EXISTS: `parsedMap.bounds` WAS READ IN THREE PLACES AND REQUIRED BY NO GUARD. hasBSPData()
 * checks nodes + subsectors + segs and returns TRUE without it, after which the BSP floor fill reads
 * parsedMap.bounds.minX and throws a TypeError -- and a crash prints no FAIL line, so it reads like a gate
 * that did not fire rather than a defect. v3737's gate hit exactly that and reported it rather than repairing
 * it, because the obvious repair was wrong. ***
 *
 * THE OBVIOUS REPAIR -- widen hasBSPData to require bounds -- WOULD HAVE MADE A NODES-BUT-NO-BOUNDS MAP TAKE
 * THE HEURISTIC FALLBACK SILENTLY. That trades a loud crash for a quiet downgrade to the less exact path,
 * which is the worse failure: the map still renders, slightly wrong, and nothing says so.
 *
 * SO IT IS DERIVED INSTEAD. The extent of a map is a fact about its vertices, and voxelizeWadMap ALREADY
 * REQUIRES parsedMap.vertices -- so there was never anything to guard, only something to compute. A
 * caller-supplied bounds still wins, because a caller may deliberately pass a clipped region.
 */
export function mapBounds(parsedMap) {
    if (parsedMap?.bounds) return parsedMap.bounds;
    const v = parsedMap?.vertices;
    if (!v || v.length < 2) return null;      // NOT a default box: an empty map has no extent, and inventing
                                              // one would put a floor where there is no geometry.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < v.length; i += 2) {
        if (v[i] < minX) minX = v[i];
        if (v[i] > maxX) maxX = v[i];
        if (v[i + 1] < minY) minY = v[i + 1];
        if (v[i + 1] > maxY) maxY = v[i + 1];
    }
    return { minX, maxX, minY, maxY };
}

export function voxelizeWadMap(world, parsedMap, opts = {}) {
    if (!world || typeof world.setVoxel !== "function") {
        throw new Error("voxelizeWadMap: world.setVoxel required");
    }
    if (!parsedMap?.vertices || !parsedMap?.lines) {
        throw new Error("voxelizeWadMap: parsedMap must have vertices+lines");
    }
    // v3738 -- derived ONCE and used at every site that used to read parsedMap.bounds directly.
    const bounds = mapBounds(parsedMap);
    const ups = opts.unitsPerVoxel ?? DEFAULT_UNITS_PER_VOXEL;
    const wallH = opts.wallHeight  ?? DEFAULT_WALL_HEIGHT;
    const baseY = opts.baseY        ?? DEFAULT_BASE_Y;
    const wallMat  = opts.wallMaterial  ?? VOXEL.STONE;
    const floorMat = opts.floorMaterial ?? VOXEL.DIRT;
    const center  = opts.centerOnPlayerStart !== false;

    // v378 — normalize wallTextureMap to a lookup function. Supports
    // both object-map and function forms uniformly.
    const wallTexLookup = _normalizeTextureLookup(opts.wallTextureMap);
    const floorTexLookup = _normalizeTextureLookup(opts.floorTextureMap);

    // v395 — sector-light tint callback. Signature:
    //   (matId, sector, sectorIdx) → newMatId
    // Caller decides how a given sector's light level (sector.light,
    // 0..255) maps to a tinted material. The typical implementation
    // uses wadPaletteSwap.mixWithLight + closestPaletteIndex to pick
    // a dimmer entry from PLAYPAL. Optional; null/undefined keeps
    // the unmodified per-sector material.
    const sectorLightTint = (typeof opts.sectorLightTint === "function")
        ? opts.sectorLightTint : null;

    // Find player_start (Thing type 1). Fallback to map center.
    let cx = 0, cz = 0, playerAngle = 0;
    const playerThing = parsedMap.things?.find(t => t.type === 1);
    if (playerThing && center) {
        cx = playerThing.x;
        cz = playerThing.y;
        playerAngle = playerThing.angle;
    } else if (center && bounds) {
        cx = (bounds.minX + bounds.maxX) / 2;
        cz = (bounds.minY + bounds.maxY) / 2;
    }

    const wadToVox = (wx, wy) => {
        const vx = Math.round((wx - cx) / ups);
        const vz = Math.round((wy - cz) / ups);
        return [vx, vz];
    };

    // 1) Walls: rasterize every linedef as a vertical column of voxels.
    const verts = parsedMap.vertices;
    let wallCount = 0;
    let textureLookups = 0;       // v378 — count of successful per-linedef lookups
    const seenCells = new Set();
    // v383 — hoist the texture-map availability check out of the inner
    // loop. When wallTexLookup is null (the common case), we avoid the
    // 5-condition branch per linedef.
    const wallTexEnabled = !!wallTexLookup && !!parsedMap.linedefs && !!parsedMap.sidedefs;
    const linedefs = wallTexEnabled ? parsedMap.linedefs : null;
    const sidedefs = wallTexEnabled ? parsedMap.sidedefs : null;
    for (let i = 0; i < parsedMap.lines.length / 3; i++) {
        const v1 = parsedMap.lines[i * 3];
        const v2 = parsedMap.lines[i * 3 + 1];
        const twoSided = parsedMap.lines[i * 3 + 2];
        const [x0, z0] = wadToVox(verts[v1 * 2], verts[v1 * 2 + 1]);
        const [x1, z1] = wadToVox(verts[v2 * 2], verts[v2 * 2 + 1]);
        const height = twoSided ? Math.max(1, Math.floor(wallH / 4)) : wallH;

        let thisWallMat = wallMat;
        if (wallTexEnabled) {
            const ld = linedefs[i];
            if (ld && ld.rightSide !== 0xFFFF) {
                const sd = sidedefs[ld.rightSide];
                if (sd && sd.middle && sd.middle !== "-") {
                    const looked = wallTexLookup(sd.middle, sd, ld);
                    if (looked !== undefined && looked !== null) {
                        thisWallMat = looked;
                        textureLookups++;
                    }
                }
            }
        }

        for (const [x, z] of _rasterLine(x0, z0, x1, z1)) {
            const key = x + "," + z;
            if (!seenCells.has(key)) {
                seenCells.add(key);
                for (let dy = 0; dy < height; dy++) {
                    world.setVoxel(x, baseY + dy, z, thisWallMat);
                    wallCount++;
                }
            }
        }
    }

    // 2) Floors: fill the interior of each sector.
    //
    // v382 — when the map has NODES + SSECTORS + SEGS, walk every cell
    // in the map's bounding box through the BSP tree to find which
    // subsector contains it; that exactly answers which sector to use,
    // including overlapping/nested sector cases that the heuristic
    // chain walk in buildSectorPolys gets wrong on complex Doom 2 maps.
    //
    // Without BSP lumps we fall back to the heuristic.
    let floorCount = 0;
    let usedBSP = false;
    if (hasBSPData(parsedMap)) {
        usedBSP = true;
        const sectors = parsedMap.sectors;
        // Pre-compute per-sector floor Y + material so the inner loop
        // doesn't repeat the texture lookup per cell.
        const floorYBySector = new Array(sectors.length);
        const matBySector    = new Array(sectors.length);
        for (let si = 0; si < sectors.length; si++) {
            const s = sectors[si];
            floorYBySector[si] = baseY + Math.max(0, Math.floor(s.floorH / ups));
            let m = floorMat;
            if (floorTexLookup && s.floorTex && s.floorTex !== "-") {
                const looked = floorTexLookup(s.floorTex, s, si);
                if (looked !== undefined && looked !== null) m = looked;
            }
            // v395 — sector light tint. Cheap when caller didn't
            // supply the callback; otherwise routes to a dim variant.
            if (sectorLightTint) {
                const tinted = sectorLightTint(m, s, si);
                if (tinted !== undefined && tinted !== null) m = tinted;
            }
            matBySector[si] = m;
        }
        // Iterate the map's voxel-space bounding box. Center-of-cell
        // sampling avoids edge-flicker on the BSP partition lines.
        const wmin = bounds.minX, wmax = bounds.maxX;
        const wzmin = bounds.minY, wzmax = bounds.maxY;
        const [vMinX, vMinZ] = wadToVox(wmin, wzmin);
        const [vMaxX, vMaxZ] = wadToVox(wmax, wzmax);
        for (let z = vMinZ; z <= vMaxZ; z++) {
            // Convert voxel cell center back to WAD coords for the BSP probe
            const wy = cz + (z + 0.5) * ups;
            for (let x = vMinX; x <= vMaxX; x++) {
                const wx = cx + (x + 0.5) * ups;
                const ssIdx = pointToSubsector(parsedMap, wx, wy);
                if (ssIdx < 0) continue;
                const sIdx = subsectorToSector(parsedMap, ssIdx);
                if (sIdx < 0 || !sectors[sIdx]) continue;
                // Count texture lookups exactly once per *cell*, only
                // when the sector has a non-"-" floorTex and a lookup
                // function is set.
                if (floorTexLookup && sectors[sIdx].floorTex && sectors[sIdx].floorTex !== "-") {
                    textureLookups++;
                }
                world.setVoxel(x, floorYBySector[sIdx], z, matBySector[sIdx]);
                floorCount++;
            }
        }
    } else if (parsedMap.sectors && parsedMap.sidedefs && parsedMap.linedefs) {
        // Heuristic fallback (pre-v382 behavior) — used for PWADs
        // without rebuilt BSP nodes, and for the unit-test paths that
        // construct synthetic maps without SSECTORS.
        const sectorPolys = buildSectorPolys(parsedMap);
        for (const [sIdx, polys] of sectorPolys) {
            const sector = parsedMap.sectors[sIdx];
            if (!sector) continue;
            const floorY = baseY + Math.max(0, Math.floor(sector.floorH / ups));

            let thisFloorMat = floorMat;
            if (floorTexLookup && sector.floorTex && sector.floorTex !== "-") {
                const looked = floorTexLookup(sector.floorTex, sector, sIdx);
                if (looked !== undefined && looked !== null) {
                    thisFloorMat = looked;
                    textureLookups++;
                }
            }
            // v395 — sector light tint (same path as BSP branch above)
            if (sectorLightTint) {
                const tinted = sectorLightTint(thisFloorMat, sector, sIdx);
                if (tinted !== undefined && tinted !== null) thisFloorMat = tinted;
            }

            let bMinX =  Infinity, bMaxX = -Infinity, bMinZ =  Infinity, bMaxZ = -Infinity;
            const voxPolys = polys.map(p => p.map(([wx, wy]) => {
                const [vx, vz] = wadToVox(wx, wy);
                bMinX = Math.min(bMinX, vx); bMaxX = Math.max(bMaxX, vx);
                bMinZ = Math.min(bMinZ, vz); bMaxZ = Math.max(bMaxZ, vz);
                return [vx, vz];
            }));
            for (let z = bMinZ; z <= bMaxZ; z++) {
                for (let x = bMinX; x <= bMaxX; x++) {
                    let inside = false;
                    for (const p of voxPolys) {
                        if (pointInPolygon(x + 0.5, z + 0.5, p)) {
                            inside = !inside;
                        }
                    }
                    if (inside) {
                        world.setVoxel(x, floorY, z, thisFloorMat);
                        floorCount++;
                    }
                }
            }
        }
    }

    return {
        playerStart: { x: 0, y: baseY + 1, z: 0, angle: playerAngle },
        wallVoxelsWritten:  wallCount,
        floorVoxelsWritten: floorCount,
        mapBounds: bounds,
        unitsPerVoxel: ups,
        wallHeight: wallH,
        textureLookups,
        usedBSP,
    };
}

/**
 * v378 — normalize a texture-name-to-material lookup into a function.
 * Accepts Object (map), Function, or null/undefined.
 */
function _normalizeTextureLookup(spec) {
    if (!spec) return null;
    if (typeof spec === "function") return spec;
    if (typeof spec === "object") {
        // Case-insensitive object lookup. Build a Map up front so we
        // don't case-fold on every linedef.
        const m = new Map();
        for (const [k, v] of Object.entries(spec)) {
            m.set(k.toUpperCase(), v);
        }
        return (texName) => m.get(texName.toUpperCase());
    }
    return null;
}
