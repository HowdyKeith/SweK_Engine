// FILE: world/realTerrainStamp.js
// VERSION: v1096 — Stage 2 voxelizer for the Real Terrain demo.
//
// Turns fetched real-world data (world/realTerrainData.js) into actual voxel
// terrain, then paints the OSM streets onto the ground.
//
// Strategy (robust for this engine's FIXED-GRID world):
//   1. Install world._heightOverride(wx,wz): inside a square region centered on
//      the origin it returns a voxel height bilinearly sampled from the real
//      elevation grid (scaled to a visible band); outside it returns null so the
//      normal procedural terrain takes over. (world.js _heightAt consults this.)
//   2. world.regenerate() rebuilds every chunk from _heightAt — so the real
//      heightmap becomes solid terrain with the engine's own biome-aware surface
//      materials (grass / dirt / stone / sand), auto-remeshed.
//   3. Paint streets: rasterize each road polyline to world columns and set the
//      surface voxel to STONE (gray asphalt). All chunks are loaded post-regen,
//      so setVoxel lands.
//
//   import { applyRealTerrain, clearRealTerrain } from "./world/realTerrainStamp.js";
//   const summary = applyRealTerrain(world, data, { baseY: 12, amp: 34 });

const STONE = 1;          // gray concrete (buildings)
const ASH   = 6;          // warm dark gray (asphalt) — distinct from buildings
const RUBBLE = 7;         // muted dark brown-gray (roof caps)
const WATER  = 10;        // blue, rendered by WaterRenderer
const ROAD_VOXEL     = ASH;
const BUILDING_VOXEL = STONE;
const ROOF_VOXEL     = RUBBLE;
const WATER_VOXEL    = WATER;

// Region (in voxels) the elevation grid is mapped onto — defaults to the full
// loaded grid so the real terrain fills the playfield.
function regionVoxels(world, opts) {
    if (opts && Number.isFinite(opts.region)) return opts.region;
    const r = (world.gridRadius || 8) * (world.chunkSize || 16) * 2;
    return Math.max(64, r - (world.chunkSize || 16)); // small margin inside the edge
}

// Bilinear sample of the elevation grid at fractional (col,row).
function sampleGrid(heights, grid, col, row) {
    const c0 = Math.max(0, Math.min(grid - 1, Math.floor(col)));
    const r0 = Math.max(0, Math.min(grid - 1, Math.floor(row)));
    const c1 = Math.min(grid - 1, c0 + 1);
    const r1 = Math.min(grid - 1, r0 + 1);
    const fc = Math.max(0, Math.min(1, col - c0));
    const fr = Math.max(0, Math.min(1, row - r0));
    const h00 = heights[r0 * grid + c0], h10 = heights[r0 * grid + c1];
    const h01 = heights[r1 * grid + c0], h11 = heights[r1 * grid + c1];
    const a = h00 + (h10 - h00) * fc;
    const b = h01 + (h11 - h01) * fc;
    return a + (b - a) * fr;
}

// Build the (wx,wz) -> voxel-height override for the region.
function makeHeightOverride(data, R, baseY, amp) {
    const { heights, grid, min, max } = data;
    const span = (max - min) || 1;
    const half = R / 2;
    return function heightOverride(wx, wz) {
        if (wx < -half || wx > half || wz < -half || wz > half) return null; // procedural outside
        const fx = wx / R + 0.5;           // west(-x)=0 .. east(+x)=1
        const fy = wz / R + 0.5;           // north(-z)=0 .. south(+z)=1
        const col = fx * (grid - 1);
        const row = fy * (grid - 1);
        const h = sampleGrid(heights, grid, col, row);
        const t = (h - min) / span;        // 0..1 normalized elevation
        return baseY + t * amp;            // visible voxel band
    };
}

// lat/lon -> world (x,z), matching the height mapping (north=-z, west=-x).
function latlonToWorld(lat, lon, bbox, R) {
    const fx = (lon - bbox.west) / ((bbox.east - bbox.west) || 1);
    const fy = (bbox.north - lat) / ((bbox.north - bbox.south) || 1);
    return { x: (fx - 0.5) * R, z: (fy - 0.5) * R };
}

// Paint one road as STONE along the surface. major=true widens it by 1 voxel.
// raised=true lifts the roadbed one voxel proud of the ground (curb/causeway look).
function paintRoad(world, road, bbox, R, major, raised) {
    const half = R / 2;
    let painted = 0;
    const setSurface = (x, z) => {
        if (x < -half || x > half || z < -half || z > half) return;
        const xi = Math.round(x), zi = Math.round(z);
        let h;
        try { h = world._heightAt(xi, zi); } catch { return; }
        if (!Number.isFinite(h)) return;
        const y = h - 1;                  // top solid voxel
        try { world.setVoxel(xi, y, zi, ROAD_VOXEL); painted++; } catch {}
        if (raised) { try { world.setVoxel(xi, y + 1, zi, ROAD_VOXEL); painted++; } catch {} }   // proud roadbed
        if (major) {
            try { const hx = world._heightAt(xi + 1, zi); world.setVoxel(xi + 1, hx - 1, zi, ROAD_VOXEL); if (raised) world.setVoxel(xi + 1, hx, zi, ROAD_VOXEL); } catch {}
            try { const hz = world._heightAt(xi, zi + 1); world.setVoxel(xi, hz - 1, zi + 1, ROAD_VOXEL); if (raised) world.setVoxel(xi, hz, zi + 1, ROAD_VOXEL); } catch {}
        }
    };
    for (let i = 1; i < road.pts.length; i++) {
        const a = latlonToWorld(road.pts[i - 1][0], road.pts[i - 1][1], bbox, R);
        const b = latlonToWorld(road.pts[i][0], road.pts[i][1], bbox, R);
        const dx = b.x - a.x, dz = b.z - a.z;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz)));   // ~1 voxel/step
        for (let s = 0; s <= steps; s++) setSurface(a.x + dx * (s / steps), a.z + dz * (s / steps));
    }
    return painted;
}

// Ray-cast point-in-polygon over a world-space polygon ([{x,z},...]).
function pointInPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
        const hit = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
        if (hit) inside = !inside;
    }
    return inside;
}

// Extrude OSM building footprints as STONE boxes from the ground up.
function paintBuildings(world, buildings, bbox, R, metersPerVoxel, caps) {
    const half = R / 2;
    const maxBuildings = (caps && Number.isFinite(caps.maxBuildings)) ? caps.maxBuildings : 1200;
    const maxVox       = (caps && Number.isFinite(caps.maxVox))       ? caps.maxVox       : 400000;
    let count = 0, vox = 0, clipped = 0;
    for (let bi = 0; bi < buildings.length; bi++) {
        if (count >= maxBuildings || vox >= maxVox) { clipped = buildings.length - bi; break; }
        const b = buildings[bi];
        if (!b.poly || b.poly.length < 3) continue;
        const wp = b.poly.map(([la, lo]) => latlonToWorld(la, lo, bbox, R));
        let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
        for (const p of wp) { if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.z < minz) minz = p.z; if (p.z > maxz) maxz = p.z; }
        minx = Math.max(minx, -half); maxx = Math.min(maxx, half);
        minz = Math.max(minz, -half); maxz = Math.min(maxz, half);
        if (maxx <= minx || maxz <= minz) continue;
        if ((maxx - minx) * (maxz - minz) > 4000) continue;   // skip enormous footprints (safety)
        const hVox = Math.max(2, Math.round((b.heightM || 6) / metersPerVoxel));
        let painted = false;
        for (let xi = Math.floor(minx); xi <= Math.ceil(maxx); xi++) {
            for (let zi = Math.floor(minz); zi <= Math.ceil(maxz); zi++) {
                if (!pointInPoly(xi + 0.5, zi + 0.5, wp)) continue;
                let h; try { h = world._heightAt(xi, zi); } catch { continue; }
                if (!Number.isFinite(h)) continue;
                for (let dy = 0; dy < hVox; dy++) { const mat = (dy === hVox - 1) ? ROOF_VOXEL : BUILDING_VOXEL; try { world.setVoxel(xi, h - 1 + dy, zi, mat); vox++; } catch {} }
                painted = true;
            }
        }
        if (painted) count++;
    }
    return { count, vox, clipped, total: buildings.length };
}

// Paint OSM water: fill area polygons + trace waterway lines as WATER at the surface.
function paintWater(world, water, bbox, R) {
    const half = R / 2;
    let cells = 0;
    const setW = (x, z) => {
        if (x < -half || x > half || z < -half || z > half) return;
        const xi = Math.round(x), zi = Math.round(z);
        let h; try { h = world._heightAt(xi, zi); } catch { return; }
        if (!Number.isFinite(h)) return;
        try { world.setVoxel(xi, h - 1, zi, WATER_VOXEL); cells++; } catch {}
    };
    for (const a of (water.areas || [])) {
        if (!a.poly || a.poly.length < 3) continue;
        const wp = a.poly.map(([la, lo]) => latlonToWorld(la, lo, bbox, R));
        let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
        for (const p of wp) { if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.z < minz) minz = p.z; if (p.z > maxz) maxz = p.z; }
        minx = Math.max(minx, -half); maxx = Math.min(maxx, half); minz = Math.max(minz, -half); maxz = Math.min(maxz, half);
        if (maxx <= minx || maxz <= minz) continue;
        if ((maxx - minx) * (maxz - minz) > 20000) continue;   // skip enormous bodies (e.g. open bay)
        for (let xi = Math.floor(minx); xi <= Math.ceil(maxx); xi++)
            for (let zi = Math.floor(minz); zi <= Math.ceil(maxz); zi++)
                if (pointInPoly(xi + 0.5, zi + 0.5, wp)) setW(xi, zi);
    }
    for (const w of (water.ways || [])) {
        if (!w.pts || w.pts.length < 2) continue;
        for (let i = 1; i < w.pts.length; i++) {
            const a = latlonToWorld(w.pts[i - 1][0], w.pts[i - 1][1], bbox, R);
            const b = latlonToWorld(w.pts[i][0], w.pts[i][1], bbox, R);
            const dx = b.x - a.x, dz = b.z - a.z, steps = Math.max(1, Math.ceil(Math.hypot(dx, dz)));
            for (let s = 0; s <= steps; s++) { const x = a.x + dx * (s / steps), z = a.z + dz * (s / steps); setW(x, z); setW(x + 1, z); }
        }
    }
    return { cells };
}

export function applyRealTerrain(world, data, opts = {}) {
    if (!world || !data || !Array.isArray(data.heights)) throw new Error("applyRealTerrain: bad world/data");
    const baseY = Number.isFinite(opts.baseY) ? opts.baseY : 12;   // >= 10 keeps streets above WATER_LEVEL(8)
    const amp   = Number.isFinite(opts.amp)   ? opts.amp   : 34;
    const R = regionVoxels(world, opts);

    // 1) height override + regenerate
    world._heightOverride = makeHeightOverride(data, R, baseY, amp);
    try { world.regenerate(); } catch (e) { console.warn("[realTerrain] regenerate:", e?.message || e); }

    // 2) water (OSM areas + waterways) — painted before roads so bridges sit on top
    let waterCells = 0;
    if (data.water && ((data.water.areas && data.water.areas.length) || (data.water.ways && data.water.ways.length))) {
        waterCells = paintWater(world, data.water, data.bbox, R).cells;
    }

    // 3) streets
    let roadsPainted = 0, roadVox = 0;
    const raised = !!opts.raisedRoads;
    if (Array.isArray(data.roads) && data.roads.length) {
        const major = (cls) => /motorway|trunk|primary|secondary/.test(cls || "");
        for (const road of data.roads) {
            if (!road.pts || road.pts.length < 2) continue;
            roadVox += paintRoad(world, road, data.bbox, R, major(road.cls), raised);
            roadsPainted++;
        }
    }

    // 4) buildings (OSM footprints extruded as concrete + roof caps)
    let buildingsPainted = 0, buildingVox = 0, buildingsClipped = 0, buildingsTotal = 0;
    if (Array.isArray(data.buildings) && data.buildings.length) {
        const mpv = Number.isFinite(opts.metersPerVoxel) ? opts.metersPerVoxel : 3;
        const caps = { maxBuildings: opts.maxBuildings, maxVox: opts.maxBuildingVox };
        const r = paintBuildings(world, data.buildings, data.bbox, R, mpv, caps);
        buildingsPainted = r.count; buildingVox = r.vox; buildingsClipped = r.clipped; buildingsTotal = r.total;
    }

    const centerSurface = (() => { try { return world._heightAt(0, 0); } catch { return baseY; } })();
    const summary = { region: R, baseY, amp, raisedRoads: raised, roadsPainted, roadVoxels: roadVox, waterCells,
                      buildingsPainted, buildingVoxels: buildingVox, buildingsClipped, buildingsTotal,
                      centerSurface, heightBand: [baseY, baseY + amp], grid: data.grid,
                      elevation: [data.min, data.max], lat: data.lat, lon: data.lon };
    console.log("[realTerrain] applied:", JSON.stringify(summary));
    return summary;
}

export function clearRealTerrain(world) {
    if (!world) return;
    world._heightOverride = null;
    try { world.regenerate(); } catch (e) { console.warn("[realTerrain] clear regenerate:", e?.message || e); }
    console.log("[realTerrain] cleared — back to procedural terrain");
}
