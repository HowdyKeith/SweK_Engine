// world/worleyBiomes.js
//
// Procedural Worley/Voronoi biomes (v2779). An upgrade over world/biomeMap.js's single-axis noise banding:
//   - WORLEY CELLS: biome regions are Voronoi cells over a jittered grid, giving organic borders instead of
//     noise isolines. worley() returns the nearest AND second-nearest feature points, so we know how close a
//     sample is to a cell border (F2 - F1) -- the natural blend weight.
//   - 2-AXIS CLASSIFICATION: each cell's climate is a (heat, moisture) pair; classify() is a Whittaker-style
//     lookup mapping the 2D climate space to a biome. This is what the old single-axis map couldn't do
//     (desert vs jungle at the same temperature is a moisture distinction).
//   - BLENDING: near a cell border the two nearest biomes' continuous params (height, colour) are lerped by the
//     border proximity, so transitions are smooth rather than hard-cut.
//
// Deterministic: same (x, z, seed) always yields the same result (painters and spawners agree without shared
// state). Pure math, no imports -- browser- and worker-safe.

// --- deterministic hashes (integer lattice -> 0..1), same family as biomeMap._hash2d -----------------
function _hash(ix, iz, seed) {
    let h = (Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
}
const _hashB = (ix, iz, seed) => _hash(ix, iz, seed ^ 0x9e3779b9);

function _valueNoise(x, z, seed) {
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const h00 = _hash(x0, z0, seed), h10 = _hash(x0 + 1, z0, seed);
    const h01 = _hash(x0, z0 + 1, seed), h11 = _hash(x0 + 1, z0 + 1, seed);
    return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
}

// --- Worley: nearest + second-nearest jittered feature points ---------------------------------------
// cellScale = world units per biome cell. Returns { f1, f2, id1, id2, cx1, cz1, cx2, cz2 }.
export function worley(x, z, seed, cellScale = 96) {
    const gx = Math.floor(x / cellScale), gz = Math.floor(z / cellScale);
    let f1 = Infinity, f2 = Infinity, id1 = 0, id2 = 0, cx1 = 0, cz1 = 0, cx2 = 0, cz2 = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const cx = gx + di, cz = gz + dj;
        const jx = (cx + _hash(cx, cz, seed)) * cellScale;      // jittered feature point
        const jz = (cz + _hashB(cx, cz, seed)) * cellScale;
        const dx = x - jx, dz = z - jz, d = Math.sqrt(dx * dx + dz * dz);
        const id = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0;
        if (d < f1) { f2 = f1; id2 = id1; cx2 = cx1; cz2 = cz1; f1 = d; id1 = id; cx1 = cx; cz1 = cz; }
        else if (d < f2) { f2 = d; id2 = id; cx2 = cx; cz2 = cz; }
    }
    return { f1, f2, id1, id2, cx1, cz1, cx2, cz2 };
}

// --- climate at a cell: heat + moisture (0..1), spatially coherent (low-freq noise on the cell) ------
export function cellClimate(cx, cz, seed, cellScale = 96) {
    const heat = _valueNoise(cx * 0.35, cz * 0.35, seed);                    // continents of temperature
    const moisture = _valueNoise(cx * 0.35 + 41.7, cz * 0.35 + 17.3, seed ^ 0x5a5a5a5a);
    return { heat, moisture };
}

// --- biome table: continuous params (baseH, amp, colour) + discrete surface/sub materials ------------
export const BIOMES = {
    tundra:    { id: 1, color: [0.82, 0.85, 0.88], baseH: 6,  amp: 3,  surface: "snow",  sub: "dirt" },
    taiga:     { id: 2, color: [0.40, 0.55, 0.42], baseH: 8,  amp: 6,  surface: "grass", sub: "dirt" },
    shrubland: { id: 3, color: [0.62, 0.60, 0.35], baseH: 7,  amp: 5,  surface: "grass", sub: "dirt" },
    plains:    { id: 4, color: [0.42, 0.72, 0.34], baseH: 6,  amp: 4,  surface: "grass", sub: "dirt" },
    forest:    { id: 5, color: [0.28, 0.58, 0.30], baseH: 9,  amp: 8,  surface: "grass", sub: "dirt" },
    desert:    { id: 6, color: [0.85, 0.78, 0.52], baseH: 5,  amp: 3,  surface: "sand",  sub: "sand" },
    savanna:   { id: 7, color: [0.72, 0.68, 0.34], baseH: 6,  amp: 4,  surface: "grass", sub: "dirt" },
    jungle:    { id: 8, color: [0.20, 0.60, 0.26], baseH: 11, amp: 10, surface: "grass", sub: "dirt" },
};

// Whittaker-style 2D classification: heat x moisture -> biome key. Total coverage of the unit square.
export function classify(heat, moisture) {
    if (heat < 0.25) return moisture < 0.40 ? "tundra" : "taiga";                       // cold
    if (heat < 0.50) return moisture < 0.35 ? "shrubland" : moisture < 0.70 ? "plains" : "forest"; // cool
    if (heat < 0.75) return moisture < 0.30 ? "desert" : moisture < 0.60 ? "savanna" : "forest";   // warm
    return moisture < 0.35 ? "desert" : moisture < 0.65 ? "savanna" : "jungle";         // hot
}

export function biomeForCell(cx, cz, seed, cellScale = 96) {
    const c = cellClimate(cx, cz, seed, cellScale);
    return classify(c.heat, c.moisture);
}

// --- biomeAt: nearest two biomes + border blend + lerped params -------------------------------------
// blend is the weight toward the SECONDARY biome: 0 deep inside a cell, ->0.5 exactly on a border.
export function biomeAt(x, z, seed, opts = {}) {
    const cellScale = opts.cellScale ?? 96;
    const borderBand = (opts.borderBand ?? 0.18) * cellScale;   // width of the blend zone
    const w = worley(x, z, seed, cellScale);
    const primary = biomeForCell(w.cx1, w.cz1, seed, cellScale);
    const secondary = biomeForCell(w.cx2, w.cz2, seed, cellScale);
    // border proximity: (f2 - f1) small -> near a border -> more blend
    const t = Math.max(0, Math.min(1, (w.f2 - w.f1) / borderBand));
    const blend = 0.5 * (1 - t);                                // 0..0.5
    const A = BIOMES[primary], B = BIOMES[secondary];
    const lerp = (a, b) => a + (b - a) * blend;
    const params = {
        color: [lerp(A.color[0], B.color[0]), lerp(A.color[1], B.color[1]), lerp(A.color[2], B.color[2])],
        baseH: lerp(A.baseH, B.baseH),
        amp: lerp(A.amp, B.amp),
        surface: A.surface,   // discrete: dominant cell wins (painter can dither using `blend`)
        sub: A.sub,
    };
    return { primary, secondary, blend, params };
}

// --- heat field for a chunk: quantized heat per column, as a Uint8Array --------------------------------
// This is the JS-native answer to "a Rust TinyVec for heat data": a small, cache-friendly typed array (one
// 0..255 value per column, size*size bytes). Heat is a surface property, so it is 2D; altitude cooling is
// applied at classification time (heat - k*y), not stored. size = chunk size (e.g. 16), cx/cz = chunk coords.
export function biomeHeatField(cx, cz, size, seed, cellScale = 96) {
    const out = new Uint8Array(size * size);
    for (let lz = 0; lz < size; lz++) for (let lx = 0; lx < size; lx++) {
        const wx = cx * size + lx, wz = cz * size + lz;
        const g = Math.floor(wx / cellScale), gh = Math.floor(wz / cellScale);
        const heat = cellClimate(g, gh, seed, cellScale).heat;   // 0..1
        out[lz * size + lx] = Math.max(0, Math.min(255, Math.round(heat * 255)));
    }
    return out;
}
