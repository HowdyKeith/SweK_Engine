// WebGLEngine/world/procPlanet.js — v3830 (Long Silence: procedural planets)
//
// A PLANET FROM A SEED, with no Three.js in it so the generation can be pinned by an answer key. Technique
// lifted (not copied) from TheLongSilence (MIT, (c) 2026 Anshu Chimala), which bakes planet surfaces from noise:
// here a seed deterministically picks a type and palette, 3D fBm noise over the sphere gives a height field, and
// a biome rule paints an EQUIRECTANGULAR texture (sea below sea level, a land gradient above, ice at the poles).
// The Three.js half is trivial and lives in the page: a sphere wearing this texture plus a thin atmosphere
// shell -- no custom GLSL to get wrong. Because the bake is a plain RGBA buffer, the whole procedural pipeline
// is deterministic and testable: same seed -> byte-identical planet, every time.

// mulberry32 -- a small, fast, well-distributed seeded PRNG. Deterministic across machines (integer math only).
export function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---- 3D value noise + fBm ----
function hash3(ix, iy, iz, seed) {
    let h = (ix * 374761393) ^ (iy * 668265263) ^ (iz * 2147483647) ^ (seed * 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// value noise in [0,1], trilinear + smootherstep, continuous.
export function valueNoise3(x, y, z, seed = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const u = fade(fx), v = fade(fy), w = fade(fz);
    const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz, seed);
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

// fractional Brownian motion, normalized to [0,1]. opts: { octaves, freq, seed, gain, lacunarity }.
export function fbm3(x, y, z, opts = {}) {
    const octaves = opts.octaves || 5, gain = opts.gain != null ? opts.gain : 0.5, lac = opts.lacunarity || 2;
    let f = opts.freq || 1.6, amp = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += amp * valueNoise3(x * f, y * f, z * f, (opts.seed || 0) + o * 1013);
        norm += amp; amp *= gain; f *= lac;
    }
    return norm ? sum / norm : 0;
}

// ---- planet types + palettes (colors are linear 0..1 [r,g,b]) ----
const TYPES = [
    { name: "terran", w: 30, radius: [120, 260], sea: [0.30, 0.55], atmo: [0.35, 0.55, 1.0], atmoT: [0.03, 0.06],
      pal: { sea: [0.04, 0.12, 0.32], low: [0.16, 0.42, 0.18], high: [0.55, 0.48, 0.30], ice: [0.9, 0.94, 0.98] } },
    { name: "desert", w: 20, radius: [90, 200], sea: [0.0, 0.08], atmo: [0.8, 0.55, 0.3], atmoT: [0.02, 0.04],
      pal: { sea: [0.20, 0.12, 0.06], low: [0.62, 0.42, 0.22], high: [0.82, 0.66, 0.42], ice: [0.86, 0.8, 0.7] } },
    { name: "ice", w: 14, radius: [80, 180], sea: [0.12, 0.35], atmo: [0.6, 0.8, 0.95], atmoT: [0.02, 0.05],
      pal: { sea: [0.10, 0.24, 0.36], low: [0.62, 0.74, 0.82], high: [0.85, 0.92, 0.97], ice: [0.96, 0.98, 1.0] } },
    // *** GAS GIANTS HAVE NO SEA, AND SETTING seaLevel TO 1.0 DID NOT MEAN "ALL SEA" -- IT MEANT NO BANDS. ***
    // heightAt() computes latitudinal banding for these worlds and clamps it to [0,1]; surfaceColor then asks
    // `height < seaLevel`, which at 1.0 is true for EVERY pixel, so every band was overwritten with the flat
    // sea colour. Both gas giants in this tree rendered as the same featureless brown disc -- identical byte
    // for byte at 64x32, 128x64 and 256x128 -- despite having different noise seeds and frequencies. Found by
    // the orrery's seeded planets (v4189): two bodies with distinct commit seeds wearing one world. A gas
    // giant has no sea, so the sea LEVEL is 0 and the low->high ramp covers the whole range, which is what
    // makes the bands visible. Nothing in this file's 419 checks looked at what a gas giant actually painted.
    { name: "gas", w: 16, radius: [260, 460], sea: [0.0, 0.0], atmo: [0.7, 0.6, 0.4], atmoT: [0.06, 0.11],
      pal: { sea: [0.36, 0.28, 0.18], low: [0.6, 0.5, 0.34], high: [0.82, 0.74, 0.56], ice: [0.9, 0.86, 0.74] } },
    { name: "molten", w: 8, radius: [90, 190], sea: [0.35, 0.6], atmo: [1.0, 0.4, 0.2], atmoT: [0.03, 0.06],
      pal: { sea: [0.5, 0.08, 0.02], low: [0.2, 0.08, 0.06], high: [0.7, 0.3, 0.1], ice: [0.9, 0.7, 0.3] } },
];
function pickType(r) {
    const total = TYPES.reduce((s, t) => s + t.w, 0); let x = r() * total;
    for (const t of TYPES) { x -= t.w; if (x <= 0) return t; } return TYPES[0];
}

// Deterministic planet descriptor from a seed.
export function planetSpec(seed) {
    const r = rng(seed >>> 0);
    const t = pickType(r);
    const gas = t.name === "gas";
    return {
        seed: seed >>> 0, type: t.name,
        radius: lerp(t.radius[0], t.radius[1], r()),
        seaLevel: lerp(t.sea[0], t.sea[1], r()),
        palette: t.pal,
        // gas giants get banding (high latitudinal frequency, low positional); rocky worlds get fractal terrain
        noise: { seed: (r() * 1e9) | 0, freq: gas ? lerp(1.2, 2.0, r()) : lerp(1.8, 3.2, r()), octaves: gas ? 3 : 5, banded: gas },
        iceCap: gas ? 0 : lerp(0.68, 0.86, r()),   // |sin(lat)| above this is ice; 0 = none
        atmosphere: { color: t.atmo, thickness: lerp(t.atmoT[0], t.atmoT[1], r()) },
        spin: lerp(0.03, 0.16, r()) * (r() < 0.5 ? 1 : -1),
        tilt: (r() - 0.5) * 0.7,
    };
}

// Height at a surface direction (unit vector). Gas giants are dominated by latitude banding.
export function heightAt(spec, dx, dy, dz) {
    const n = spec.noise;
    if (n.banded) {
        const bands = fbm3(dy * 6, 0.5, 0.5, { ...n, octaves: 3 });   // vary mostly with latitude
        const wob = fbm3(dx * n.freq, dy * n.freq, dz * n.freq, n) * 0.15;
        return clamp01(bands + wob - 0.075);
    }
    return fbm3(dx * n.freq, dy * n.freq, dz * n.freq, n);
}

// THE BIOME RULE, as one function: colour for a height and a latitude sine (sea below sea level, a land gradient
// above, ice blended in past the cap). Extracted from bakeEquirect in v3842 with its behaviour unchanged, so the
// equirect bake and the cube-baked surface (world/planetSurface.js) share ONE owner and cannot drift apart.
export function surfaceColor(spec, height, sinLat) {
    const pal = spec.palette;
    let col;
    if (height < spec.seaLevel) col = pal.sea;
    else {
        const t = clamp01((height - spec.seaLevel) / Math.max(1e-3, 1 - spec.seaLevel));
        col = mix3(pal.low, pal.high, t);
    }
    if (spec.iceCap && Math.abs(sinLat) > spec.iceCap) {
        const t = clamp01((Math.abs(sinLat) - spec.iceCap) / Math.max(1e-3, 1 - spec.iceCap));
        col = mix3(col, pal.ice, t);
    }
    return col;
}

// Bake an equirectangular RGBA texture (Uint8ClampedArray, w*h*4). Deterministic from the spec. Returns
// { rgba, w, h, seaFraction }.
export function bakeEquirect(spec, w = 256, h = 128) {
    const rgba = new Uint8ClampedArray(w * h * 4);
    let seaCount = 0;
    for (let y = 0; y < h; y++) {
        const lat = (0.5 - (y + 0.5) / h) * Math.PI;         // +pi/2 .. -pi/2
        const cl = Math.cos(lat), sl = Math.sin(lat);
        for (let x = 0; x < w; x++) {
            const lon = ((x + 0.5) / w) * Math.PI * 2 - Math.PI;
            const dx = cl * Math.cos(lon), dy = sl, dz = cl * Math.sin(lon);
            const hgt = heightAt(spec, dx, dy, dz);
            if (hgt < spec.seaLevel) seaCount++;
            const col = surfaceColor(spec, hgt, sl);
            const o = (y * w + x) * 4;
            rgba[o] = col[0] * 255; rgba[o + 1] = col[1] * 255; rgba[o + 2] = col[2] * 255; rgba[o + 3] = 255;
        }
    }
    return { rgba, w, h, seaFraction: seaCount / (w * h) };
}
