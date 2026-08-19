// world/autoExtremity.js
//
// Auto-extremity (v2767): the bridge from terrain generation to extremity bounds. You asked -- if we make the
// mountains higher, the extremity bounds should increase accordingly, shaped by voxel type. fitExtremity does
// exactly that: it samples the terrain surface over a footprint, finds the tallest column, and returns the world
// height that FITS it plus headroom. Raise the mountain amplitude and the fitted height rises with it; nothing is
// ever clipped, because the world is sized FROM the content instead of the content being cut to the world.
//
// The height comes from domain-warped fractal noise (SweK already has domain warp in world.js/erosion.js for the
// main terrain; this is a self-contained, integer-hashed, trig-free copy so the whole thing is deterministic and
// fingerprint-fold-ready). Domain warp displaces the sample coordinates by a noise field before sampling the
// height, which bends the ridgelines off the grid and reads as natural rather than woven.

// integer hash -> [0,1], no trig (cross-arch deterministic)
function hash2(ix, iz, seed) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise2(x, z, seed) {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
    const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
    const c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
    const sx = smooth(fx), sz = smooth(fz);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;   // in [0,1]
}
export function fbm2(x, z, seed = 1, octaves = 4) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * valueNoise2(x * freq, z * freq, seed + o); norm += amp; amp *= 0.5; freq *= 2; }
    return sum / norm;   // roughly [0,1]
}
// Domain warp: displace (x,z) by a noise field before sampling. Returns the warped coordinate.
export function domainWarp2(x, z, { seed = 1, warpAmp = 4, warpFreq = 0.04 } = {}) {
    const wx = x + warpAmp * (fbm2(x * warpFreq, z * warpFreq, seed + 31, 3) - 0.5) * 2;
    const wz = z + warpAmp * (fbm2(x * warpFreq, z * warpFreq, seed + 57, 3) - 0.5) * 2;
    return [wx, wz];
}
// Terrain surface height. `amp` is the mountain amplitude -- raise it and the peaks rise.
export function warpedTerrainHeight(x, z, { amp = 8, base = 4, seed = 1, warpAmp = 0, freq = 0.08 } = {}) {
    const [wx, wz] = warpAmp > 0 ? domainWarp2(x, z, { seed, warpAmp, warpFreq: freq * 0.5 }) : [x, z];
    return base + amp * fbm2(wx * freq, wz * freq, seed, 4);
}
// Voxel type by height band -- shaping the logic to voxel type. Snow caps the peaks, water fills the lows.
export function voxelTypeForHeight(h, worldHeight) {
    const f = worldHeight > 0 ? h / worldHeight : 0;
    if (f >= 0.75) return "snow";
    if (f >= 0.50) return "rock";
    if (f >= 0.25) return "grass";
    return "water";
}
// AUTO-EXTREMITY. Sample the terrain over a `size` x `size` footprint, find the tallest column, and return the
// world height that fits it plus headroom -- sized FROM the content. Also reports the tallest voxel type. Taller
// mountains -> taller worldHeight; the tallest column always fits (maxHeight < worldHeight).
export function fitExtremity(heightFn, { size = 16, headroom = 2 } = {}) {
    let maxH = -Infinity, minH = Infinity, tallestAt = null;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
        const h = Math.floor(heightFn(x, z));
        if (h > maxH) { maxH = h; tallestAt = [x, z]; }
        if (h < minH) minH = h;
    }
    const worldHeight = Math.max(1, maxH + 1 + headroom);   // a column of height h fills y=0..h; +headroom of air
    const perType = {};
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
        const h = Math.floor(heightFn(x, z));
        const t = voxelTypeForHeight(h, worldHeight);
        perType[t] = Math.max(perType[t] || 0, h);
    }
    return { maxHeight: maxH, minHeight: minH, worldHeight, tallestAt, tallestType: voxelTypeForHeight(maxH, worldHeight), perType, headroom };
}
