// WebGLEngine/render/nebulaSkybox.js — v3833 (Long Silence: a baked nebula/star skybox)
//
// The 3D dogfight sat under a flat #03060d fill and 700 scattered points. This bakes a real backdrop instead: a
// six-face cubemap whose every texel is a pure function of the DIRECTION it faces -- a vertical colour gradient,
// fractal-noise nebula clouds, and a sparse star field quantised on a direction lattice. Because the shading
// depends only on direction, the six faces agree at every shared edge for free: the cubemap is seamless by
// construction, not by a fudge factor, and that is the property the gate pins.
//
// PURE: no Three, no GPU, no DOM, no Math.random. Same seed -> byte-identical faces. The generator returns raw
// RGB byte buffers; uploading them to a THREE.CubeTexture and setting scene.background is the browser half, thin
// and Keith's to see. The SAME generator feeds the next round's procedural star. Gated headless in
// render/nebulaSkybox-selfcheck.mjs.

// Deterministic hash of an integer lattice cell -> [0, 1). Integer math only, so it is identical across engines.
export function hash3(ix, iy, iz, seed) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(iz | 0, 1610612741) + Math.imul(seed | 0, 362437)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);   // smoothstep fade for value-noise interpolation
const lerp = (a, b, t) => a + (b - a) * t;

// Trilinear value noise at a 3D point, in [0, 1].
function valueNoise(x, y, z, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
    const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz, seed);
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), fx), x10 = lerp(c(0, 1, 0), c(1, 1, 0), fx);
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), fx), x11 = lerp(c(0, 1, 1), c(1, 1, 1), fx);
    return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

// Fractal Brownian motion in [0, 1]: octaves of value noise, lacunarity 2, gain 0.5, normalised by amplitude sum.
export function fbm(x, y, z, seed, octaves) {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
        sum += amp * valueNoise(x * f, y * f, z * f, seed + o * 1013);
        norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
}

// The six cubemap faces, in GL order. Each maps (u, v) in [-1, 1] to a 3D direction (pre-normalisation).
const FACES = [
    (u, v) => [1, -v, -u],   // +X
    (u, v) => [-1, -v, u],   // -X
    (u, v) => [u, 1, v],     // +Y
    (u, v) => [u, -1, -v],   // -Y
    (u, v) => [u, -v, 1],    // +Z
    (u, v) => [-u, -v, -1],  // -Z
];

// Unit direction for texel (i, j) of face `f` in a size x size face. Texel CENTRES, so (i+0.5)/size.
export function faceTexelDir(f, i, j, size) {
    const u = ((i + 0.5) / size) * 2 - 1;
    const v = ((j + 0.5) / size) * 2 - 1;
    const d = FACES[f](u, v);
    const inv = 1 / Math.hypot(d[0], d[1], d[2]);
    return [d[0] * inv, d[1] * inv, d[2] * inv];
}

const DEFAULTS = {
    seed: 1337,
    octaves: 5,
    nebulaFreq: 2.2,
    nebulaLo: 0.55, nebulaHi: 0.95,      // smoothstep window that carves clouds out of the noise
    nebulaIntensity: 1.0,
    nebulaTint: [0.35, 0.20, 0.55],      // violet
    lowColor: [0.010, 0.020, 0.050],     // horizon (dir.y = -1)
    highColor: [0.020, 0.045, 0.090],    // zenith  (dir.y = +1)
    starGrid: 180,                        // direction-lattice resolution for star cells
    starDensity: 0.006,                   // fraction of cells that hold a star
    starMin: 0.5,                         // dimmest star brightness
    // v4129 -- HOW FAR A STAR REACHES FROM ITS CELL CENTRE, in cell units. *** 1.0 WAS MEASURED, NOT PICKED. ***
    // At the page's real bake size (256) a lattice cell is about 1.4 texels, so the value decides whether a star
    // is shaded across the texels it covers or is a flat block. Swept at seed 7: radius 0 leaves 2313 lit texels
    // with only 11% of adjacent lit pairs differing -- flat tops, which is the square. 0.42 shrinks the star
    // BELOW one texel (659 lit, 5 adjacent pairs left): rounder in principle, but it thins the star field, which
    // is a different look rather than a fix. 1.0 keeps the ORIGINAL footprint (2313 lit, 342 pairs) and takes
    // adjacent-pair variation to 99% -- same stars, now shaded centre to edge. It also reaches exactly zero AT
    // the cell boundary, so a star cannot spill into its neighbour and there is no edge to read as a seam.
    // 0 restores the old hard-edged behaviour exactly, which is what the gate uses to prove this does the work.
    starRadius: 1.0,
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a, b, x) => { if (a === b) return x < a ? 0 : 1; const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// The colour of the sky in a given unit direction, as [r, g, b] in [0, 1]. A PURE FUNCTION OF DIRECTION -- this is
// what makes the cubemap seamless. `P` is a full, defaulted parameter object (use makeParams).
export function shadeDirection(dir, P) {
    const [x, y, z] = dir;
    // 1) vertical gradient
    const t = (y + 1) * 0.5;
    let r = lerp(P.lowColor[0], P.highColor[0], t);
    let g = lerp(P.lowColor[1], P.highColor[1], t);
    let b = lerp(P.lowColor[2], P.highColor[2], t);
    // 2) nebula clouds from fbm, windowed
    if (P.nebulaIntensity > 0) {
        const n = fbm(x * P.nebulaFreq, y * P.nebulaFreq, z * P.nebulaFreq, P.seed, P.octaves);
        const cloud = smoothstep(P.nebulaLo, P.nebulaHi, n) * P.nebulaIntensity;
        r += P.nebulaTint[0] * cloud; g += P.nebulaTint[1] * cloud; b += P.nebulaTint[2] * cloud;
    }
    // 3) stars quantised on a direction lattice (so a star spans the same cell on any face -> seamless)
    if (P.starDensity > 0) {
        const gx = x * P.starGrid, gy = y * P.starGrid, gz = z * P.starGrid;
        const cx = Math.round(gx), cy = Math.round(gy), cz = Math.round(gz);
        if (hash3(cx, cy, cz, P.seed ^ 0x9e37) < P.starDensity) {
            const bright = P.starMin + hash3(cx, cy, cz, P.seed ^ 0x5151) * (1 - P.starMin);
            // v4129 -- *** THE STARS WERE SQUARE BECAUSE EVERY DIRECTION IN A CELL GOT THE SAME BRIGHTNESS. ***
            // Keith: "the stars in Escape velocity Nebula are square voxels, can they be stars?" The test above
            // rounds a direction to a lattice cell, and the old code then added FULL brightness for any
            // direction landing in that cell -- so a star was a filled cube with a hard edge, which is exactly
            // what a blocky voxel looks like on a skybox face. Nothing was drawing a square; the flat fill was.
            // The falloff is a continuous function of the SAME direction the cell test uses, so the seamless
            // property this lattice exists for is untouched: two faces meeting at an edge evaluate the same
            // direction and get the same value. starRadius:0 collapses this to the old behaviour exactly.
            const dx = gx - cx, dy = gy - cy, dz = gz - cz;
            // *** null/undefined MEANS "NOT SPECIFIED", NOT ZERO. *** makeParams spreads opts over DEFAULTS, and
            // a spread copies an EXPLICITLY undefined key -- so { starRadius: undefined }, which is what any
            // caller building opts from an optional field produces, would otherwise wipe the default and
            // silently restore the flat square this exists to remove. Caught by the gate asking for the shipped
            // default that way. Zero still means zero, because 0 == null is false.
            const R = (P.starRadius == null) ? DEFAULTS.starRadius : P.starRadius;
            const d2 = (dx * dx + dy * dy + dz * dz) / (R * R || 1e-9);
            // (1 - d^2)^2: 1 at the centre, 0 at the radius, and smooth at both ends -- no rim to read as an edge.
            const fall = R > 0 ? (d2 >= 1 ? 0 : (1 - d2) * (1 - d2)) : 1;
            if (fall > 0) { r += bright * fall; g += bright * fall; b += bright * fall; }
        }
    }
    return [clamp01(r), clamp01(g), clamp01(b)];
}

export function makeParams(opts = {}) { return { ...DEFAULTS, ...opts }; }

// Bake all six faces at `size` x `size`. Returns { size, faces:[Uint8ClampedArray×6] } with 3 bytes/texel (RGB).
export function bakeNebulaCubemap(opts = {}) {
    const P = makeParams(opts);
    const size = opts.size || 128;
    const faces = [];
    for (let f = 0; f < 6; f++) {
        const buf = new Uint8ClampedArray(size * size * 3);
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const c = shadeDirection(faceTexelDir(f, i, j, size), P);
                const o = (j * size + i) * 3;
                buf[o] = c[0] * 255; buf[o + 1] = c[1] * 255; buf[o + 2] = c[2] * 255;
            }
        }
        faces.push(buf);
    }
    return { size, faces };
}
