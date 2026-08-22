// FILE: world/structureBuilder.js
// VERSION: v1
//
// Expands an array of high-level "structure primitives" into explicit
// voxel writes. Used by demo files that include a `structures` field
// instead of (or in addition to) raw `voxels`. Primitives let an LLM
// describe a tower as one ring × N heights instead of N×ring-cells of
// individual voxel writes — same result, far fewer tokens.
//
// Hard caps + value validation here so a malformed or hostile demo
// can't dump millions of voxel writes through the command router. If
// you need to lift the cap for legitimate use cases, do it explicitly
// per-call rather than globally.

const MAX_VOXELS_PER_BUILD = 2000;

// Mirror of VOXEL ids in world/voxelFormat.js — anything not here is
// rejected. Keep this in sync if voxelFormat grows.
const ALLOWED_MATERIALS = new Set([
    0,   // AIR (carving)
    1,   // STONE
    2,   // DIRT
    3,   // GRASS
    4,   // SAND
    10,  // WATER
    11,  // FLOWING_WATER
    12,  // LAVA
    20,  // SCREEN
    30,  // MEMORY
]);

const COORD_MAX = 200;       // ±200 horizontal range
const Y_MAX     = 63;        // chunkHeight - 1
const RADIUS_MAX = 30;

export function expandStructures(structures) {
    if (!Array.isArray(structures)) return [];
    const voxels = [];
    for (const s of structures) {
        if (voxels.length >= MAX_VOXELS_PER_BUILD) break;
        const m = +s?.material;
        if (!ALLOWED_MATERIALS.has(m)) continue;
        const sub = _expandOne(s, m);
        for (const v of sub) {
            if (voxels.length >= MAX_VOXELS_PER_BUILD) break;
            voxels.push(v);
        }
    }
    return voxels;
}

function _expandOne(s, m) {
    switch (s.kind) {
        case "box":    return _box(s, m);
        case "column": return _column(s, m);
        case "ring":   return _ring(s, m);
        case "disk":   return _disk(s, m);
        case "line":   return _line(s, m);
        default:       return [];
    }
}

// ---- primitives --------------------------------------------------

function _box(s, m) {
    const x0 = _clampX(s.x0), x1 = _clampX(s.x1);
    const y0 = _clampY(s.y0), y1 = _clampY(s.y1);
    const z0 = _clampX(s.z0), z1 = _clampX(s.z1);
    const lo = { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) };
    const hi = { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) };
    const hollow = s.hollow === true;
    const out = [];
    for (let y = lo.y; y <= hi.y; y++) {
        for (let z = lo.z; z <= hi.z; z++) {
            for (let x = lo.x; x <= hi.x; x++) {
                if (hollow) {
                    const onShell = x === lo.x || x === hi.x ||
                                    y === lo.y || y === hi.y ||
                                    z === lo.z || z === hi.z;
                    if (!onShell) continue;
                }
                out.push({ x, y, z, v: m });
            }
        }
    }
    return out;
}

function _column(s, m) {
    const x  = _clampX(s.x);
    const z  = _clampX(s.z);
    const y0 = _clampY(s.y0);
    const y1 = _clampY(s.y1);
    const out = [];
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        out.push({ x, y, z, v: m });
    }
    return out;
}

// Midpoint-circle ring at one fixed Y. Eight-way symmetry from a single
// octant walk; produces an evenly-distributed approximation of a circle.
function _ring(s, m) {
    const cx = _clampX(s.cx);
    const cy = _clampY(s.cy);
    const cz = _clampX(s.cz);
    const r  = _clampRadius(s.radius);
    if (r < 1) return [];
    const seen = new Set();
    const push = (dx, dz) => {
        const key = `${dx},${dz}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ x: cx + dx, y: cy, z: cz + dz, v: m });
    };
    const out = [];
    let x = r, z = 0, err = 0;
    while (x >= z) {
        push( x,  z); push(-x,  z); push( x, -z); push(-x, -z);
        push( z,  x); push(-z,  x); push( z, -x); push(-z, -x);
        z++;
        if (err <= 0) err += 2 * z + 1;
        if (err > 0)  { x--; err -= 2 * x + 1; }
    }
    return out;
}

function _disk(s, m) {
    const cx = _clampX(s.cx);
    const cy = _clampY(s.cy);
    const cz = _clampX(s.cz);
    const r  = _clampRadius(s.radius);
    if (r < 1) return [];
    const r2 = r * r;
    const out = [];
    for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dz * dz <= r2) {
                out.push({ x: cx + dx, y: cy, z: cz + dz, v: m });
            }
        }
    }
    return out;
}

// 3D Bresenham line. Picks the axis with the largest delta as the
// driving axis and steps the other two on integer error accumulation.
// Last endpoint is added explicitly — the loop stops one cell short.
function _line(s, m) {
    const x0 = _clampX(s.x0), y0 = _clampY(s.y0), z0 = _clampX(s.z0);
    const x1 = _clampX(s.x1), y1 = _clampY(s.y1), z1 = _clampX(s.z1);
    const out = [];
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), dz = Math.abs(z1 - z0);
    const xs = x0 < x1 ? 1 : -1;
    const ys = y0 < y1 ? 1 : -1;
    const zs = z0 < z1 ? 1 : -1;
    let x = x0, y = y0, z = z0;
    if (dx >= dy && dx >= dz) {
        let p1 = 2 * dy - dx, p2 = 2 * dz - dx;
        while (x !== x1) {
            out.push({ x, y, z, v: m });
            if (p1 >= 0) { y += ys; p1 -= 2 * dx; }
            if (p2 >= 0) { z += zs; p2 -= 2 * dx; }
            p1 += 2 * dy; p2 += 2 * dz;
            x += xs;
        }
    } else if (dy >= dx && dy >= dz) {
        let p1 = 2 * dx - dy, p2 = 2 * dz - dy;
        while (y !== y1) {
            out.push({ x, y, z, v: m });
            if (p1 >= 0) { x += xs; p1 -= 2 * dy; }
            if (p2 >= 0) { z += zs; p2 -= 2 * dy; }
            p1 += 2 * dx; p2 += 2 * dz;
            y += ys;
        }
    } else {
        let p1 = 2 * dy - dz, p2 = 2 * dx - dz;
        while (z !== z1) {
            out.push({ x, y, z, v: m });
            if (p1 >= 0) { y += ys; p1 -= 2 * dz; }
            if (p2 >= 0) { x += xs; p2 -= 2 * dz; }
            p1 += 2 * dy; p2 += 2 * dx;
            z += zs;
        }
    }
    out.push({ x: x1, y: y1, z: z1, v: m });
    return out;
}

// ---- helpers ----------------------------------------------------

function _clampX(v) {
    return Math.max(-COORD_MAX, Math.min(COORD_MAX, Math.floor(+v) || 0));
}
function _clampY(v) {
    return Math.max(0, Math.min(Y_MAX, Math.floor(+v) || 0));
}
function _clampRadius(v) {
    return Math.max(0, Math.min(RADIUS_MAX, Math.floor(+v) || 0));
}
