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
//
// v4327 -- THE NOISE AND THE CUBE GEOMETRY LEFT THIS FILE, and this file is the reason they had to. They were
// written here because the sky needed them first, and by v3843 the star, the planet's surface, the greeble and
// the hit-burst were all importing them FROM THE BACKDROP GENERATOR. They now live at render/valueNoise.js and
// render/cubeBake.js, which is where a reader would look. Nothing about the bake changed: the digests in
// render/cubeBake-selfcheck.mjs were measured before the move and hold after it. This file is no longer the
// owner of anything but the sky, and it deliberately does NOT re-export what it used to own -- a re-export
// would leave the old wrong import path working and the graph still saying the sky owns the noise.

import { hash3, fbm, lerp } from "./valueNoise.js";       // v4327 -- the noise's own file
import { bakeCubemap } from "./cubeBake.js";            // v4327 -- the cube's own file (the six-face walk)

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
// The six-face walk is cubeBake's (v4327); what is left here is the one line that is actually about the sky.
export function bakeNebulaCubemap(opts = {}) {
    const P = makeParams(opts);
    return bakeCubemap(opts.size || 128, 3, (dir) => shadeDirection(dir, P));
}
