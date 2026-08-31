// WebGLEngine/render/solidTexture.mjs -- v4243
//
// TEXTURE A SURFACE THAT DID NOT EXIST WHEN THE MESH WAS UNWRAPPED.
//
// The idea is boytchev/tsl-textures (MIT, Pavel Boytchev 2024): procedural texture as a function evaluated
// on the GPU rather than an image fetched from a file. That library is written in TSL against a
// WebGPURenderer and this tree has neither, so nothing is ported -- the ALGORITHM is what travels, and it
// is written here twice, once in JS and once in GLSL, because that is how every shader in this tree is
// graded (render/crtModel.js against render/crtPass.js, and so on).
//
// ---- WHY THIS ROUND EXISTS, AND IT IS A HOLE THIS TREE DUG ITSELF ------------------------------------------
//
// v4235 gave the engine real mesh booleans: physics/mesh/meshCSG.mjs subtracts a jagged blast shape from a
// wall and returns a watertight, gap-free solid with a hole in it. What it returns is POSITIONS ONLY --
// toTriangleBuffer is nine floats per triangle, and the word "uv" does not appear anywhere in the file.
//
// *** SO THE HOLE IS GEOMETRICALLY PERFECT AND CANNOT BE TEXTURED. *** Every face of the cut is a polygon
// that did not exist when the wall was authored, so no unwrap ever assigned it a coordinate, and there is no
// sensible way to invent one: the cut is a different shape every time and its faces meet at angles nobody
// chose. A UV-based pipeline has nothing to offer here.
//
// ---- TWO ANSWERS, AND THE DIFFERENCE BETWEEN THEM IS THE MEASUREMENT ----------------------------------------
//
// TRIPLANAR MAPPING samples a 2D image three times -- once down each axis -- and blends the three by the
// absolute value of the surface normal. It needs no UVs and it is the answer usually given. It is also
// still a SURFACE technique: it projects a picture onto a skin.
//
// SOLID TEXTURING evaluates a function of the 3D POINT. The material is defined throughout the volume, so a
// cut face is not "textured" at all -- it is simply seen, and what is seen is whatever the concrete was
// already made of at those coordinates.
//
// *** AND THE DIFFERENCE IS NOT AESTHETIC, IT IS A DISCONTINUITY AT THE ONE PLACE THAT MATTERS. *** Along the
// rim of a blast hole, an original face and a cut face share an edge, and their NORMALS DIFFER -- that is
// what an edge is. Triplanar's weights come from the normal, so its output jumps across that rim even though
// the position did not move. A solid texture consults only the position, so it cannot jump: equal inputs,
// equal outputs, and the rim disappears. The gate measures both, and the triplanar seam is not small.
//
// Triplanar is kept, exported and gated anyway, because it is the right answer when the only asset available
// is a photograph. What it is not is the right answer HERE, and having both is what lets that be shown
// rather than argued.
//
// ---- THE BLEND EXPONENT, WHICH IS A REAL KNOB AND NOT A CONSTANT ---------------------------------------------
//
// The naive triplanar weight is abs(n) normalised to sum 1. On a face whose normal is diagonal that gives all
// three projections a near-equal say, and the result is visibly DOUBLED detail across a wide band -- ghosting.
// Raising the weights to a power sharpens the transition. The exponent trades ghosting against a hard line at
// the axis crossings, so it is measured here (band width and doubling, off a rendered image) rather than set
// to whatever number a tutorial used.
"use strict";
import { snoise3 } from "../shaders/ashimaNoise.mjs";

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;

/** Fractal noise: octaves of snoise3, each finer and quieter. A plain function of the point, like everything here. */
export function fbm3(x, y, z, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let f = 1, a = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += a * snoise3(x * f, y * f, z * f);
        norm += a;
        f *= lacunarity; a *= gain;
    }
    return norm > 0 ? sum / norm : 0;
}

/** The defaults, exported so a caller and the gate cannot drift apart on what "concrete" means. */
export const CONCRETE = Object.freeze({
    scale: 0.55,            // world units -> noise units
    aggregate: 0.34,        // threshold above which a stone sits rather than cement
    stoneLight: 0.42,       // how much lighter a stone is than the matrix
    grain: 0.06,            // fine speckle amplitude
    cement: [0.63, 0.62, 0.60],
    stone:  [0.52, 0.50, 0.47],
    weather: [0.34, 0.33, 0.31],   // the streaked darkening that only an exposed surface has
});

/**
 * *** CONCRETE AS A FUNCTION OF WHERE YOU ARE, NOT OF WHICH FACE YOU ARE ON. ***
 *
 * Two scales, because that is what the material is: coarse aggregate suspended in a fine cement matrix. The
 * aggregate is a thresholded low-frequency field, so a stone is a connected blob with an edge; the matrix
 * gets a high-frequency speckle. Neither reads a UV, a normal or a face index -- only x, y, z.
 *
 * `weathered` is the ONE thing a surface has that an interior does not, and it is the caller's business
 * rather than the function's: the outside of a wall is stained and the inside of a fresh break is not. Pass
 * it true for the SKIN faces meshCSG tags and false for the CUT faces, and the hole reads as broken rather
 * than as the same picture folded inward.
 */
export function concreteAt(x, y, z, opts = {}) {
    const o = { ...CONCRETE, ...opts };
    const s = o.scale;
    const agg = fbm3(x * s, y * s, z * s, 3);
    const fine = fbm3(x * s * 9, y * s * 9, z * s * 9, 2);
    const isStone = agg > o.aggregate;
    // A stone's own shade varies stone to stone, so the aggregate does not read as one flat grey.
    const shade = isStone ? o.stoneLight * (0.5 + 0.5 * fbm3(x * s * 2.3 + 11, y * s * 2.3, z * s * 2.3, 2)) : 0;
    const base = isStone ? o.stone : o.cement;
    const g = fine * o.grain;
    const out = [
        clamp01(base[0] + shade * 0.25 + g),
        clamp01(base[1] + shade * 0.25 + g),
        clamp01(base[2] + shade * 0.25 + g),
    ];
    if (opts.weathered) {
        // Streaks run DOWN, so the noise is stretched in y -- gravity is the only direction a stain knows.
        const w = clamp01(fbm3(x * s * 1.7, y * s * 0.4, z * s * 1.7, 3) * 0.5 + 0.5);
        for (let i = 0; i < 3; i++) out[i] = clamp01(mix(out[i], o.weather[i], w * 0.55));
    }
    return out;
}

/**
 * Triplanar blend weights from a normal.
 *
 * `k` is the sharpening exponent. k = 1 is the naive weighting every tutorial prints; larger values narrow
 * the band in which more than one projection contributes, which is the band where the texture ghosts.
 */
export function blendWeights(nx, ny, nz, k = 1) {
    let a = Math.abs(nx), b = Math.abs(ny), c = Math.abs(nz);
    if (k !== 1) { a = Math.pow(a, k); b = Math.pow(b, k); c = Math.pow(c, k); }
    const s = a + b + c;
    return s > 0 ? [a / s, b / s, c / s] : [1 / 3, 1 / 3, 1 / 3];
}

/**
 * Triplanar sample: project the point onto the three axis planes, sample a 2D function on each, blend.
 *
 * `sample2` is (u, v) -> [r, g, b]. Passing a real image sampler is the point of the technique; the gate
 * passes a deterministic 2D pattern so the comparison is reproducible.
 */
export function triplanarAt(sample2, x, y, z, nx, ny, nz, k = 1, scale = 1) {
    const [wx, wy, wz] = blendWeights(nx, ny, nz, k);
    const sx = sample2(y * scale, z * scale);
    const sy = sample2(z * scale, x * scale);
    const sz = sample2(x * scale, y * scale);
    return [
        sx[0] * wx + sy[0] * wy + sz[0] * wz,
        sx[1] * wx + sy[1] * wy + sz[1] * wz,
        sx[2] * wx + sy[2] * wy + sz[2] * wz,
    ];
}

/**
 * *** HOW MUCH DOES A TECHNIQUE JUMP ACROSS AN EDGE? *** Sample both sides of a shared point, using each
 * side's own normal, and return the largest channel difference.
 *
 * This is the number the whole round turns on. For a position-only function it is exactly zero by
 * construction and the check is nearly circular -- which is why it is asked of BOTH techniques over the SAME
 * points and the same edge: the comparison is what carries the meaning, not either number alone.
 */
export function seamJump(f, p, nA, nB) {
    const a = f(p[0], p[1], p[2], nA[0], nA[1], nA[2]);
    const b = f(p[0], p[1], p[2], nB[0], nB[1], nB[2]);
    let worst = 0;
    for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    return worst;
}

// ---- THE GLSL, WHICH MUST AGREE WITH THE JS ABOVE ----------------------------------------------------------
//
// Pulled in after shaders/ashimaNoise.js's NOISE_COMMON + SNOISE3, which declare snoise(vec3). The constants
// are written as literals here and read from CONCRETE there, so the gate compares them rather than trusting
// that two copies of 0.34 stayed equal.

export const FBM3_FN = [
    "float fbm3(vec3 p, int octaves) {",
    "    float f = 1.0, a = 1.0, sum = 0.0, norm = 0.0;",
    "    for (int i = 0; i < 8; i++) {",
    "        if (i >= octaves) break;",
    "        sum += a * snoise(p * f);",
    "        norm += a;",
    "        f *= 2.0; a *= 0.5;",
    "    }",
    "    return norm > 0.0 ? sum / norm : 0.0;",
    "}",
].join("\n");

export const CONCRETE_FN = [
    "uniform float uScale;",
    "uniform float uAggregate;",
    "uniform float uStoneLight;",
    "uniform float uGrain;",
    "uniform vec3  uCement;",
    "uniform vec3  uStone;",
    "uniform vec3  uWeather;",
    "vec3 concreteAt(vec3 p, float weathered) {",
    "    float s = uScale;",
    "    float agg  = fbm3(p * s, 3);",
    "    float fine = fbm3(p * s * 9.0, 2);",
    "    bool isStone = agg > uAggregate;",
    "    float shade = isStone ? uStoneLight * (0.5 + 0.5 * fbm3(vec3(p.x * s * 2.3 + 11.0, p.y * s * 2.3, p.z * s * 2.3), 2)) : 0.0;",
    "    vec3 base = isStone ? uStone : uCement;",
    "    float g = fine * uGrain;",
    "    vec3 outc = clamp(base + shade * 0.25 + g, 0.0, 1.0);",
    "    if (weathered > 0.5) {",
    "        float w = clamp(fbm3(vec3(p.x * s * 1.7, p.y * s * 0.4, p.z * s * 1.7), 3) * 0.5 + 0.5, 0.0, 1.0);",
    "        outc = clamp(mix(outc, uWeather, w * 0.55), 0.0, 1.0);",
    "    }",
    "    return outc;",
    "}",
].join("\n");

export const TRIPLANAR_FN = [
    "vec3 blendWeights(vec3 n, float k) {",
    "    vec3 a = abs(n);",
    "    if (k != 1.0) a = pow(a, vec3(k));",
    "    float s = a.x + a.y + a.z;",
    "    return s > 0.0 ? a / s : vec3(1.0 / 3.0);",
    "}",
].join("\n");
