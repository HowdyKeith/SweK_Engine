// ai-bridge/wadGeometry.cjs
//
// Server-side WAD (Doom level archive) parser + 3D geometry builder.
// Loaded by server.js at startup; produces a single JSON-serializable
// geometry struct that the bridge serves to WebGL clients and uses
// for server-side OGRE wall collision.
//
// Two paths:
//   1. parseWADFile(path) → real Doom/Freedoom WAD if available
//   2. buildFallback() → hardcoded procedural test arena, used when
//      no WAD path is configured or parsing fails. Lets the system
//      work out of the box without external assets.
//
// Output schema (geometry struct):
//   {
//     name: "E1M1" | "TEST_ARENA",
//     scale: 0.05,                          // Doom units → world units
//     bounds: { minX, maxX, minZ, maxZ, minY, maxY },
//     floorVerts:   Float32Array(N * 7),    // x,y,z, nx,ny,nz, light per vert
//     floorTriCount: T,
//     ceilingVerts: Float32Array(M * 7),
//     ceilingTriCount: T2,
//     wallVerts:    Float32Array(K * 7),
//     wallTriCount: T3,
//     collisionWalls: [{ x1, z1, x2, z2 }],  // 2D, world coords
//     playerStarts: [{ x, y, z, angle }],
//     info: { source, mapName, ... }
//   }
//
// All Float32Arrays are interleaved per-vertex (stride = 7 floats =
// 28 bytes). Triangle list, no indexing. Ready for upload to a WebGL
// vertex buffer with attribute pointers at offsets 0, 12, 24.
//
// Coordinate convention (matches existing WAD docs):
//   WAD x  →  world X
//   WAD y  →  world Z       (top-down map y becomes ground-plane z)
//   sector h →  world Y     (floor/ceiling heights)
//
// References: existing tools/wadLoader.js (browser parser, simpler);
// vba/wad/README.md (full algorithm doc including the centroid+angle
// sort for subsector polygon recovery).

const fs = require("fs");

// Default scale: Doom rooms are 64–256 units; 0.05 puts a 256-unit
// room at ~12.8 world units. Tune in opts if you want bigger/smaller.
const DEFAULT_SCALE = 0.05;

// ============================================================
// WAD binary parser
// ============================================================

function parseWADFile(path, opts = {}) {
    if (!path || !fs.existsSync(path)) return null;
    try {
        const buf = fs.readFileSync(path);
        const wad = parseWAD(buf);
        if (!wad) return null;
        const mapName = opts.mapName || wad.maps[0]?.name;
        if (!mapName) return null;
        const map = extractMap(wad, mapName);
        if (!map) return null;
        const geom = buildGeometry(map, opts.scale ?? DEFAULT_SCALE);
        geom.info.source = path;
        return geom;
    } catch (e) {
        console.warn("[wadGeometry] parseWADFile failed:", e?.message);
        return null;
    }
}

function parseWAD(buf) {
    if (buf.length < 12) return null;
    const magic = buf.toString("ascii", 0, 4);
    if (magic !== "IWAD" && magic !== "PWAD") return null;
    const numLumps  = buf.readUInt32LE(4);
    const dirOffset = buf.readUInt32LE(8);
    const lumps = [];
    for (let i = 0; i < numLumps; i++) {
        const off  = buf.readUInt32LE(dirOffset + i * 16);
        const size = buf.readUInt32LE(dirOffset + i * 16 + 4);
        const name = buf.toString("ascii", dirOffset + i * 16 + 8, dirOffset + i * 16 + 16)
                        .replace(/\0+$/, "");
        lumps.push({ name, offset: off, size, index: i });
    }
    // Discover maps. Marker lump (size 0) named E#M# or MAP## followed
    // within ~10 lumps by VERTEXES + LINEDEFS.
    const maps = [];
    const re = /^(E\dM\d|MAP\d{2})$/;
    for (let i = 0; i < lumps.length; i++) {
        if (!re.test(lumps[i].name)) continue;
        // Look ahead for VERTEXES + LINEDEFS within 10 lumps
        let hasVerts = false, hasLines = false;
        for (let j = i + 1; j < Math.min(i + 11, lumps.length); j++) {
            if (lumps[j].name === "VERTEXES") hasVerts = true;
            if (lumps[j].name === "LINEDEFS") hasLines = true;
        }
        if (hasVerts && hasLines) {
            maps.push({ name: lumps[i].name, markerIndex: i });
        }
    }
    return { magic, numLumps, lumps, maps, buffer: buf };
}

function extractMap(wad, mapName) {
    const mapEntry = wad.maps.find(m => m.name.toUpperCase() === mapName.toUpperCase());
    if (!mapEntry) return null;
    const lookForward = (name) => {
        for (let j = mapEntry.markerIndex + 1; j < Math.min(mapEntry.markerIndex + 12, wad.lumps.length); j++) {
            if (wad.lumps[j].name === name) return wad.lumps[j];
        }
        return null;
    };
    const buf = wad.buffer;
    const vertsLump = lookForward("VERTEXES");
    const linesLump = lookForward("LINEDEFS");
    const sidesLump = lookForward("SIDEDEFS");
    const sectsLump = lookForward("SECTORS");
    const ssectLump = lookForward("SSECTORS");
    const segsLump  = lookForward("SEGS");
    const thingsLump = lookForward("THINGS");
    if (!vertsLump || !linesLump || !sidesLump || !sectsLump) return null;

    // VERTEXES: int16 x, int16 y (4 bytes each)
    const vertices = [];
    for (let p = vertsLump.offset; p < vertsLump.offset + vertsLump.size; p += 4) {
        vertices.push({ x: buf.readInt16LE(p), y: buf.readInt16LE(p + 2) });
    }
    // LINEDEFS: 14 bytes — v1, v2, flags, special, tag, right_sd, left_sd (all uint16)
    const linedefs = [];
    for (let p = linesLump.offset; p < linesLump.offset + linesLump.size; p += 14) {
        linedefs.push({
            v1:        buf.readUInt16LE(p),
            v2:        buf.readUInt16LE(p + 2),
            flags:     buf.readUInt16LE(p + 4),
            special:   buf.readUInt16LE(p + 6),
            tag:       buf.readUInt16LE(p + 8),
            rightSide: buf.readUInt16LE(p + 10),
            leftSide:  buf.readUInt16LE(p + 12),
        });
    }
    // SIDEDEFS: 30 bytes — xoff, yoff (int16), upper, lower, middle (8 char), sector (uint16)
    const sidedefs = [];
    for (let p = sidesLump.offset; p < sidesLump.offset + sidesLump.size; p += 30) {
        sidedefs.push({
            xOffset: buf.readInt16LE(p),
            yOffset: buf.readInt16LE(p + 2),
            upper:   buf.toString("ascii", p + 4,  p + 12).replace(/\0+$/, ""),
            lower:   buf.toString("ascii", p + 12, p + 20).replace(/\0+$/, ""),
            middle:  buf.toString("ascii", p + 20, p + 28).replace(/\0+$/, ""),
            sector:  buf.readUInt16LE(p + 28),
        });
    }
    // SECTORS: 26 bytes — floorH, ceilH (int16), floorTex, ceilTex (8 char), light, special, tag
    const sectors = [];
    for (let p = sectsLump.offset; p < sectsLump.offset + sectsLump.size; p += 26) {
        sectors.push({
            floorHeight:   buf.readInt16LE(p),
            ceilingHeight: buf.readInt16LE(p + 2),
            floorTex:      buf.toString("ascii", p + 4,  p + 12).replace(/\0+$/, ""),
            ceilingTex:    buf.toString("ascii", p + 12, p + 20).replace(/\0+$/, ""),
            light:         buf.readUInt16LE(p + 20),
            special:       buf.readUInt16LE(p + 22),
            tag:           buf.readUInt16LE(p + 24),
        });
    }
    // SSECTORS: 4 bytes — segCount, firstSeg (both uint16)
    const ssectors = [];
    if (ssectLump) {
        for (let p = ssectLump.offset; p < ssectLump.offset + ssectLump.size; p += 4) {
            ssectors.push({
                segCount: buf.readUInt16LE(p),
                firstSeg: buf.readUInt16LE(p + 2),
            });
        }
    }
    // SEGS: 12 bytes — v1, v2, angle, linedef, side, offset (all uint16/int16)
    const segs = [];
    if (segsLump) {
        for (let p = segsLump.offset; p < segsLump.offset + segsLump.size; p += 12) {
            segs.push({
                v1:      buf.readUInt16LE(p),
                v2:      buf.readUInt16LE(p + 2),
                angle:   buf.readInt16LE(p + 4),
                linedef: buf.readUInt16LE(p + 6),
                side:    buf.readUInt16LE(p + 8),
                offset:  buf.readInt16LE(p + 10),
            });
        }
    }
    // THINGS: 10 bytes — x, y (int16), angle, type, flags (uint16)
    const things = [];
    if (thingsLump) {
        for (let p = thingsLump.offset; p < thingsLump.offset + thingsLump.size; p += 10) {
            things.push({
                x:     buf.readInt16LE(p),
                y:     buf.readInt16LE(p + 2),
                angle: buf.readUInt16LE(p + 4),
                type:  buf.readUInt16LE(p + 6),
                flags: buf.readUInt16LE(p + 8),
            });
        }
    }
    return { name: mapName, vertices, linedefs, sidedefs, sectors, ssectors, segs, things };
}

// ============================================================
// Geometry builder
// ============================================================

// Build the 3D mesh from a parsed map. Mirrors the VBA algorithm from
// modWADGeometry.bas: subsector polygons via centroid+angle sort, then
// floor/ceiling triangulation as a fan around the centroid, then wall
// bands per linedef.
function buildGeometry(map, scale = DEFAULT_SCALE) {
    const s = scale;

    // 1. Recover subsector polygons (centroid + angle sort)
    const subsectorPolys = recoverSubsectorPolygons(map);

    // 2. Resolve each subsector → owning sector (via its first seg's
    //    linedef's sidedef on the relevant side)
    for (const poly of subsectorPolys) {
        poly.sectorId = resolveSubsectorSector(poly, map);
    }

    // 3. Build interleaved floor/ceiling/wall arrays
    const floorTris = [];
    const ceilTris  = [];
    const wallTris  = [];

    for (const poly of subsectorPolys) {
        if (poly.points.length < 3 || poly.sectorId == null) continue;
        const sector = map.sectors[poly.sectorId];
        if (!sector) continue;
        const floorY = sector.floorHeight * s;
        const ceilY  = sector.ceilingHeight * s;
        const light  = sector.light / 255;

        // Floor: fan around centroid, normal (0,1,0)
        const cx = poly.centroid.x * s, cz = poly.centroid.y * s;
        for (let i = 0; i < poly.points.length; i++) {
            const a = poly.points[i];
            const b = poly.points[(i + 1) % poly.points.length];
            const ax = a.x * s, az = a.y * s;
            const bx = b.x * s, bz = b.y * s;
            // Triangle: centroid, a, b — CCW from above (looking down +Y)
            floorTris.push(cx, floorY, cz, 0, 1, 0, light);
            floorTris.push(ax, floorY, az, 0, 1, 0, light);
            floorTris.push(bx, floorY, bz, 0, 1, 0, light);
            // Ceiling: reverse winding so it faces down
            ceilTris.push(cx, ceilY, cz, 0, -1, 0, light);
            ceilTris.push(bx, ceilY, bz, 0, -1, 0, light);
            ceilTris.push(ax, ceilY, az, 0, -1, 0, light);
        }
    }

    // 4. Build walls per linedef
    const collisionWalls = [];
    for (const ld of map.linedefs) {
        const v1 = map.vertices[ld.v1];
        const v2 = map.vertices[ld.v2];
        if (!v1 || !v2) continue;
        const rightSide = ld.rightSide !== 0xFFFF ? map.sidedefs[ld.rightSide] : null;
        const leftSide  = ld.leftSide  !== 0xFFFF ? map.sidedefs[ld.leftSide]  : null;
        if (!rightSide) continue;   // malformed
        const frontSector = map.sectors[rightSide.sector];
        const backSector  = leftSide ? map.sectors[leftSide.sector] : null;

        // Always add to collision walls (server uses for OGRE clip)
        // Note: 2-sided walls between sectors with equal height *could*
        // be passable openings, but we add ALL linedefs to be safe and
        // let the simulation decide. Tighten later if perf matters.
        collisionWalls.push({
            x1: v1.x * s, z1: v1.y * s,
            x2: v2.x * s, z2: v2.y * s,
            twoSided: !!backSector,
            frontFloor:   frontSector ? frontSector.floorHeight * s : 0,
            frontCeil:    frontSector ? frontSector.ceilingHeight * s : 0,
            backFloor:    backSector  ? backSector.floorHeight  * s : null,
            backCeil:     backSector  ? backSector.ceilingHeight * s : null,
        });

        // Compute wall normal (perpendicular to the linedef in the
        // x-z plane, pointing into the front sector — to the right
        // when walking v1→v2 with WAD's y-up-on-paper coords)
        const dx = v2.x - v1.x, dz = v2.y - v1.y;
        const len = Math.hypot(dx, dz) || 1;
        // Right-facing normal: (dz, -dx) normalized
        const nx = dz / len;
        const nz = -dx / len;
        const light = (frontSector?.light ?? 200) / 255;

        const emitQuad = (yLo, yHi, normalX, normalZ) => {
            const x1 = v1.x * s, z1 = v1.y * s;
            const x2 = v2.x * s, z2 = v2.y * s;
            // CCW when viewed from the side the normal points to:
            // bottom-left, bottom-right, top-right; bottom-left, top-right, top-left
            wallTris.push(x1, yLo, z1,  normalX, 0, normalZ, light);
            wallTris.push(x2, yLo, z2,  normalX, 0, normalZ, light);
            wallTris.push(x2, yHi, z2,  normalX, 0, normalZ, light);
            wallTris.push(x1, yLo, z1,  normalX, 0, normalZ, light);
            wallTris.push(x2, yHi, z2,  normalX, 0, normalZ, light);
            wallTris.push(x1, yHi, z1,  normalX, 0, normalZ, light);
        };

        const frontFloorY = frontSector ? frontSector.floorHeight  * s : 0;
        const frontCeilY  = frontSector ? frontSector.ceilingHeight * s : 0;

        if (!backSector) {
            // One-sided wall: full quad floor → ceiling on the front
            emitQuad(frontFloorY, frontCeilY, nx, nz);
        } else {
            // Two-sided: emit lower step + upper lintel for each side
            const backFloorY = backSector.floorHeight  * s;
            const backCeilY  = backSector.ceilingHeight * s;
            // Lower step (front side faces front, when back floor is
            // higher than front floor)
            if (backFloorY > frontFloorY) {
                emitQuad(frontFloorY, backFloorY, nx, nz);
            } else if (frontFloorY > backFloorY) {
                emitQuad(backFloorY, frontFloorY, -nx, -nz);
            }
            // Upper lintel (front faces front, when back ceil is lower)
            if (backCeilY < frontCeilY) {
                emitQuad(backCeilY, frontCeilY, nx, nz);
            } else if (frontCeilY < backCeilY) {
                emitQuad(frontCeilY, backCeilY, -nx, -nz);
            }
        }
    }

    // 5. Bounds
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const v of map.vertices) {
        const x = v.x * s, z = v.y * s;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    for (const sec of map.sectors) {
        const fy = sec.floorHeight * s, cy = sec.ceilingHeight * s;
        if (fy < minY) minY = fy; if (cy > maxY) maxY = cy;
    }

    // 6. Player starts from THINGS (types 1..4 = player 1..4 starts)
    const playerStarts = [];
    if (map.things) {
        for (const t of map.things) {
            if (t.type >= 1 && t.type <= 4) {
                playerStarts.push({
                    x: t.x * s,
                    y: (minY + 4),   // 4 world units above floor
                    z: t.y * s,
                    angle: t.angle,
                });
            }
        }
    }

    // Deathmatch starts (THING type 11)
    const deathmatchStarts = [];
    if (map.things) {
        for (const t of map.things) {
            if (t.type === 11) {
                deathmatchStarts.push({ x: t.x * s, y: (minY + 4), z: t.y * s, angle: t.angle });
            }
        }
    }

    return {
        name: map.name,
        scale: s,
        bounds: { minX, maxX, minZ, maxZ, minY, maxY },
        floorVerts:    new Float32Array(floorTris),
        floorTriCount: floorTris.length / (3 * 7),
        ceilingVerts:    new Float32Array(ceilTris),
        ceilingTriCount: ceilTris.length / (3 * 7),
        wallVerts:    new Float32Array(wallTris),
        wallTriCount: wallTris.length / (3 * 7),
        collisionWalls,
        playerStarts,
        deathmatchStarts,
        info: {
            source: "wad",
            mapName: map.name,
            sectorCount: map.sectors.length,
            linedefCount: map.linedefs.length,
            scale: s,
        },
    };
}

// Subsector polygon recovery: for each SSECTOR, collect all unique
// vertex endpoints from its SEGs, sort by angle around the centroid.
// Works because subsectors are convex by BSP construction.
function recoverSubsectorPolygons(map) {
    const out = [];
    if (!map.ssectors || !map.segs) return out;
    for (let i = 0; i < map.ssectors.length; i++) {
        const ss = map.ssectors[i];
        const verts = new Map();   // key=x,y → {x, y}
        for (let j = 0; j < ss.segCount; j++) {
            const seg = map.segs[ss.firstSeg + j];
            if (!seg) continue;
            const a = map.vertices[seg.v1], b = map.vertices[seg.v2];
            if (a) verts.set(`${a.x},${a.y}`, a);
            if (b) verts.set(`${b.x},${b.y}`, b);
        }
        const points = Array.from(verts.values());
        if (points.length < 3) continue;
        // Centroid + angle sort
        let cx = 0, cy = 0;
        for (const p of points) { cx += p.x; cy += p.y; }
        cx /= points.length; cy /= points.length;
        points.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
        out.push({
            ssectorIdx: i,
            points,
            centroid: { x: cx, y: cy },
        });
    }
    return out;
}

// Resolve which sector a subsector belongs to: look at its first seg's
// linedef, and use the sidedef on the relevant side to find the sector.
function resolveSubsectorSector(poly, map) {
    if (!map.ssectors || !map.segs || !map.sidedefs) return null;
    const ss = map.ssectors[poly.ssectorIdx];
    if (!ss || ss.segCount === 0) return null;
    const seg = map.segs[ss.firstSeg];
    if (!seg) return null;
    const ld = map.linedefs[seg.linedef];
    if (!ld) return null;
    const sideIdx = seg.side === 0 ? ld.rightSide : ld.leftSide;
    if (sideIdx === 0xFFFF) return null;
    const side = map.sidedefs[sideIdx];
    return side?.sector ?? null;
}

// ============================================================
// Procedural fallback: single rectangular room with central pillar
// ============================================================

// Produces a geometry struct of the same shape as a WAD parse, so
// downstream code (server endpoints, OGRE collision, WebGL renderer)
// doesn't care whether the level came from a WAD or the fallback.
function buildFallback(scale = DEFAULT_SCALE) {
    const s = scale;
    const ROOM_MIN = 0, ROOM_MAX = 1024;       // 1024×1024 Doom units
    const PILLAR_MIN = 412, PILLAR_MAX = 612;  // 200-unit pillar in center
    const FLOOR_Y = 0, CEILING_Y = 192;
    const LIGHT = 200 / 255;

    const floorTris = [];
    const ceilTris  = [];
    const wallTris  = [];

    // Floor as 4 strips around the central pillar hole
    // Use raw Doom coords scaled by s
    const strips = [
        // [x0, z0, x1, z1] in Doom units
        [ROOM_MIN, ROOM_MIN, ROOM_MAX, PILLAR_MIN],       // top strip
        [ROOM_MIN, PILLAR_MAX, ROOM_MAX, ROOM_MAX],       // bottom strip
        [ROOM_MIN, PILLAR_MIN, PILLAR_MIN, PILLAR_MAX],   // left strip
        [PILLAR_MAX, PILLAR_MIN, ROOM_MAX, PILLAR_MAX],   // right strip
    ];
    for (const [x0, z0, x1, z1] of strips) {
        const X0 = x0 * s, Z0 = z0 * s, X1 = x1 * s, Z1 = z1 * s;
        // CCW from above for floor (normal +Y)
        floorTris.push(X0, FLOOR_Y * s, Z0,  0, 1, 0, LIGHT);
        floorTris.push(X0, FLOOR_Y * s, Z1,  0, 1, 0, LIGHT);
        floorTris.push(X1, FLOOR_Y * s, Z1,  0, 1, 0, LIGHT);
        floorTris.push(X0, FLOOR_Y * s, Z0,  0, 1, 0, LIGHT);
        floorTris.push(X1, FLOOR_Y * s, Z1,  0, 1, 0, LIGHT);
        floorTris.push(X1, FLOOR_Y * s, Z0,  0, 1, 0, LIGHT);
        // Ceiling: reverse winding (normal -Y)
        ceilTris.push(X0, CEILING_Y * s, Z0,  0, -1, 0, LIGHT);
        ceilTris.push(X1, CEILING_Y * s, Z1,  0, -1, 0, LIGHT);
        ceilTris.push(X0, CEILING_Y * s, Z1,  0, -1, 0, LIGHT);
        ceilTris.push(X0, CEILING_Y * s, Z0,  0, -1, 0, LIGHT);
        ceilTris.push(X1, CEILING_Y * s, Z0,  0, -1, 0, LIGHT);
        ceilTris.push(X1, CEILING_Y * s, Z1,  0, -1, 0, LIGHT);
    }

    // Walls: 4 outer + 4 inner pillar walls
    // Each wall: a Doom segment with outward-facing normal
    const collisionWalls = [];
    const wallDefs = [
        // Outer perimeter, normals pointing INTO the room
        { x1: ROOM_MIN, z1: ROOM_MIN, x2: ROOM_MAX, z2: ROOM_MIN, nx: 0,  nz: 1 },   // top wall
        { x1: ROOM_MAX, z1: ROOM_MIN, x2: ROOM_MAX, z2: ROOM_MAX, nx: -1, nz: 0 },   // right
        { x1: ROOM_MAX, z1: ROOM_MAX, x2: ROOM_MIN, z2: ROOM_MAX, nx: 0,  nz: -1 },  // bottom
        { x1: ROOM_MIN, z1: ROOM_MAX, x2: ROOM_MIN, z2: ROOM_MIN, nx: 1,  nz: 0 },   // left
        // Inner pillar, normals pointing OUTWARD into the room
        { x1: PILLAR_MIN, z1: PILLAR_MIN, x2: PILLAR_MIN, z2: PILLAR_MAX, nx: -1, nz: 0 }, // pillar left
        { x1: PILLAR_MIN, z1: PILLAR_MAX, x2: PILLAR_MAX, z2: PILLAR_MAX, nx: 0,  nz: 1 }, // pillar bot
        { x1: PILLAR_MAX, z1: PILLAR_MAX, x2: PILLAR_MAX, z2: PILLAR_MIN, nx: 1,  nz: 0 }, // pillar right
        { x1: PILLAR_MAX, z1: PILLAR_MIN, x2: PILLAR_MIN, z2: PILLAR_MIN, nx: 0,  nz: -1 },// pillar top
    ];
    for (const w of wallDefs) {
        const X1 = w.x1 * s, Z1 = w.z1 * s;
        const X2 = w.x2 * s, Z2 = w.z2 * s;
        const yLo = FLOOR_Y * s, yHi = CEILING_Y * s;
        // Two triangles forming a quad, CCW when viewed from normal side
        wallTris.push(X1, yLo, Z1,  w.nx, 0, w.nz, LIGHT);
        wallTris.push(X2, yLo, Z2,  w.nx, 0, w.nz, LIGHT);
        wallTris.push(X2, yHi, Z2,  w.nx, 0, w.nz, LIGHT);
        wallTris.push(X1, yLo, Z1,  w.nx, 0, w.nz, LIGHT);
        wallTris.push(X2, yHi, Z2,  w.nx, 0, w.nz, LIGHT);
        wallTris.push(X1, yHi, Z1,  w.nx, 0, w.nz, LIGHT);
        // Collision wall (world coords)
        collisionWalls.push({ x1: X1, z1: Z1, x2: X2, z2: Z2, twoSided: false });
    }

    return {
        name: "TEST_ARENA",
        scale: s,
        bounds: {
            minX: ROOM_MIN * s, maxX: ROOM_MAX * s,
            minZ: ROOM_MIN * s, maxZ: ROOM_MAX * s,
            minY: FLOOR_Y * s,  maxY: CEILING_Y * s,
        },
        floorVerts:    new Float32Array(floorTris),
        floorTriCount: floorTris.length / (3 * 7),
        ceilingVerts:    new Float32Array(ceilTris),
        ceilingTriCount: ceilTris.length / (3 * 7),
        wallVerts:    new Float32Array(wallTris),
        wallTriCount: wallTris.length / (3 * 7),
        collisionWalls,
        deathmatchStarts: [],
        playerStarts: [
            { x: 128 * s, y: (FLOOR_Y + 32) * s, z: 128 * s, angle: 45 },
        ],
        info: {
            source: "fallback",
            mapName: "TEST_ARENA",
            sectorCount: 1,
            linedefCount: 8,
            scale: s,
        },
    };
}

// ============================================================
// Serialization helpers
// ============================================================

// Float32Array → base64 string for JSON transport (faster than
// number-array JSON for large vertex arrays).
function f32ToBase64(arr) {
    return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");
}

// Build a JSON-serializable view of the geometry. Vertex arrays
// become base64 strings; the client decodes back to Float32Array.
function toJSON(geom) {
    return {
        name:  geom.name,
        scale: geom.scale,
        bounds: geom.bounds,
        floorVertsB64:    f32ToBase64(geom.floorVerts),
        floorTriCount:    geom.floorTriCount,
        ceilingVertsB64:  f32ToBase64(geom.ceilingVerts),
        ceilingTriCount:  geom.ceilingTriCount,
        wallVertsB64:     f32ToBase64(geom.wallVerts),
        wallTriCount:     geom.wallTriCount,
        playerStarts:     geom.playerStarts,
        deathmatchStarts: geom.deathmatchStarts || [],
        collisionWalls:   geom.collisionWalls || [],
        info:             geom.info,
    };
}

// ============================================================
// Wall collision — line-segment intersection
// ============================================================

// Given a desired move from (x0,z0) to (x1,z1), return the actual
// endpoint after clipping against walls with a small safety margin.
// Returns { x, z, hitWall: boolean }.
function clipMovement(x0, z0, x1, z1, walls, radius = 0.5) {
    const dx = x1 - x0, dz = z1 - z0;
    if (dx === 0 && dz === 0) return { x: x0, z: z0, hitWall: false };

    let tMin = 1.0;
    let hit = false;
    for (const w of walls) {
        // Skip two-sided walls between same-height sectors (passable)
        if (w.twoSided && w.backFloor === w.frontFloor && w.backCeil === w.frontCeil) {
            continue;
        }
        const t = segmentIntersectT(x0, z0, x1, z1, w.x1, w.z1, w.x2, w.z2);
        if (t !== null && t < tMin) {
            tMin = t;
            hit = true;
        }
    }
    // Pull back slightly so we don't end up exactly on the wall
    const tSafe = hit ? Math.max(0, tMin - 0.05) : 1.0;
    return {
        x: x0 + dx * tSafe,
        z: z0 + dz * tSafe,
        hitWall: hit,
    };
}

// Parametric intersection of segment AB with segment CD.
// Returns t along AB (0..1) at intersection, or null if no hit.
function segmentIntersectT(ax, az, bx, bz, cx, cz, dx, dz) {
    const r0x = bx - ax, r0z = bz - az;
    const r1x = dx - cx, r1z = dz - cz;
    const denom = r0x * r1z - r0z * r1x;
    if (Math.abs(denom) < 1e-9) return null;   // parallel
    const t = ((cx - ax) * r1z - (cz - az) * r1x) / denom;
    const u = ((cx - ax) * r0z - (cz - az) * r0x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
    return null;
}

module.exports = {
    parseWADFile,
    parseWAD,
    extractMap,
    buildGeometry,
    buildFallback,
    toJSON,
    clipMovement,
    DEFAULT_SCALE,
};
