// FILE: render/grassModel.mjs
// VERSION: v4172 -- the CPU half of the grass port, and the reference render/grassField.js is graded against.
//
// Ported from boona13/threejs-grass-water-shaders (MIT, "do whatever you want with the code, attribution
// appreciated but not required"). THE WATER HALF IS DELIBERATELY NOT PORTED: shaders/waterReflectRefract.
// frag.glsl already exists, and a second water shader would be two declarations of one thing -- the defect
// this tree finds more often than any other. Grass is a genuine gap; water is not.
//
// *** THE PORT'S REAL RISK IS NOT THE LIGHTING, IT IS THIRTY-TWO BITS -- AND ONLY ONE OF THE TWO OBVIOUS
// TRAPS IS ACTUALLY A TRAP, WHICH TOOK A SWEEP TO FIND OUT. *** windHash is a Wang-style integer hash, and
// GLSL's `uint` arithmetic wraps at 2^32 while JavaScript's does not. Two candidates, both plausible:
//
//   1. `h >> 6u` is a LOGICAL shift in GLSL because h is unsigned. JS `>>` is ARITHMETIC and sign-extends, so
//      any h with the top bit set shifts in ones instead of zeros. *** THIS ONE IS REAL AND IT IS ENORMOUS:
//      swept over a 121x121 lattice spanning negative and positive coordinates (14641 points), 12809 of them -- 87.5% -- come out different. ***
//      And it is silent: the wrong values are still in [0,1) and still look exactly like noise.
//
//   2. `h + (h << 15u)` overflows and wraps in GLSL, where JS `+` promotes to float64 and keeps going. This
//      LOOKS like the same class of bug and is NOT one: measured over the same 14641 points, it differs on
//      ZERO of them. Every addition in this hash is immediately consumed by `^` or by Math.imul, and BOTH
//      coerce to int32 -- so the wrap still happens, one operation later than it was written. Verified
//      directly: (2**33 + 5) ^ 0 is 5, and Math.imul(2**33 + 5, 1) is 5.
//
// *** THAT IS THE THIRD TIME THIS SESSION A TRAP THAT FIT THE REASONING TURNED OUT TO BE A NO-OP ONCE
// MEASURED *** -- after the fmod hue example that saturated to one colour anyway, and the hash collisions
// that were zero on the config whose numbers moved furthest. THE ARGUMENT FOR A BUG IS NOT THE BUG.
//
// Both are written the careful way regardless: every step ends `>>> 0`, every right shift is `>>>`, and the
// multiplies use Math.imul. Costing nothing and being right for a stated reason beats being right by luck --
// but the COMMENT now says which of the two is load-bearing, so a later reader tidying this file knows that
// the `>>> 0`s are belt-and-braces and the `>>>`s are the belt.
"use strict";

/** uint32 coercion, applied after every step rather than at the end -- wrapping is the semantics, not a tidy-up. */
const u32 = (x) => x >>> 0;

// uintBitsToFloat, done the only way JS can: reinterpret the bits through a shared buffer.
const _bits = new ArrayBuffer(4);
const _u32v = new Uint32Array(_bits);
const _f32v = new Float32Array(_bits);
/** GLSL uintBitsToFloat(u). */
export function uintBitsToFloat(u) { _u32v[0] = u32(u); return _f32v[0]; }

/**
 * The Wang-style hash, step for step with windNoise.glsl.ts.
 *
 * The tail -- `(h & 8388607u) | 1065353216u` then `- 1.0` -- is the standard trick for a float in [0,1):
 * 8388607 is the 23-bit mantissa mask and 1065353216 is the bit pattern of 1.0f, so the result is a float in
 * [1,2) and subtracting one lands it in [0,1) with a uniform mantissa. It is NOT a division, and replacing it
 * with `h / 4294967296.0` would give a different sequence that still looks like noise.
 *
 * @param {number} px @param {number} py  lattice coordinates, taken as uint32 (negatives WRAP, on purpose --
 *   `uvec2(ivec2(-1))` is 4294967295 in GLSL and the shader relies on that for negative world coordinates)
 */
export function windHash(px, py) {
    const y = u32(py);
    let h = u32(y + u32(y << 10));
    h = u32(h ^ (h >>> 6));
    h = u32(h + u32(h << 3));
    h = u32(h ^ (h >>> 11));
    const x = u32(px);
    // Math.imul, not `*`: 4294967295 * 1664525 is ~7.1e15, inside 2^53 but the SUM below is not, and the
    // habit of using imul for every uint32 multiply is what stops the one that overflows going unnoticed.
    h = u32(Math.imul(u32(Math.imul(x, 1664525) + u32(h + u32(h << 15)) + 1013904223), 1664525));
    h = u32(h ^ (h >>> 11));
    h = u32(h ^ u32((h << 7) & 2636928640));
    h = u32(h ^ u32((h << 15) & 4022730752));
    h = u32(h ^ (h >>> 18));
    return uintBitsToFloat(u32((h & 8388607) | 1065353216)) - 1.0;
}

const smoothstep01 = (f) => f * f * (3 - 2 * f);
const mix = (a, b, t) => a + (b - a) * t;

/**
 * Bilinear lattice noise over the hash, matching windNoise() exactly.
 * @param {number} wx @param {number} wz  world XZ
 * @param {number} t  the shader's uTime argument (already multiplied by a speed by the caller)
 */
export function windNoise(wx, wz, t) {
    const ux = wx * 0.1 + t * 1.2, uy = wz * 0.1;
    const ix = Math.floor(ux), iy = Math.floor(uy);
    const fx = ux - ix, fy = uy - iy;
    const sx = smoothstep01(fx), sy = smoothstep01(fy);
    const n00 = windHash(ix, iy), n10 = windHash(ix + 1, iy);
    const n01 = windHash(ix, iy + 1), n11 = windHash(ix + 1, iy + 1);
    return mix(mix(n00, n10, sx), mix(n01, n11, sx), sy);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstepEdge = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/**
 * *** WHETHER A BLADE IS DRAWN AT ALL, WHICH THE SHADER DECIDES WITH TWO EARLY RETURNS. ***
 *
 * The upstream vertex shader culls by writing gl_Position = vec4(2,2,2,1) -- outside the clip volume, so the
 * blade is discarded. That is a RENDERING trick for a LOGICAL decision, and the decision is the part worth
 * having on the CPU: it is what makes "no grass on cliffs" checkable without a GPU.
 *
 * Two independent reasons a blade vanishes, and they are NOT the same rule:
 *   - a hard slope cut at 0.65, which is geometry;
 *   - a stochastic thinning across the shoulder from 0.28 to 0.65, which is a per-blade coin weighted by the
 *     same slope. Without it the grass would end on a visible contour line.
 *
 * @returns {{ drawn: boolean, reason: string, slopeSuppress: number, bladeHash: number }}
 */
export function bladeVisibility(slopeMag, originX, originZ) {
    if (slopeMag > 0.65) return { drawn: false, reason: "slope", slopeSuppress: 1, bladeHash: NaN };
    const slopeSuppress = smoothstepEdge(0.28, 0.65, slopeMag);
    // the shader's own per-blade hash -- sin/dot/fract, NOT windHash. Kept as written: it is a different
    // hash for a different job, and unifying them would change which blades disappear.
    const bladeHash = fractSin(originX * 127.1 + originZ * 311.7);
    if (bladeHash < slopeSuppress) return { drawn: false, reason: "thinned", slopeSuppress, bladeHash };
    return { drawn: true, reason: "drawn", slopeSuppress, bladeHash };
}

/** fract(sin(x) * 43758.545), the GLSL idiom. Float64 here against float32 on the GPU -- see the gate's note. */
export function fractSin(x) { const v = Math.sin(x) * 43758.545; return v - Math.floor(v); }

/**
 * The blade's deformation at one vertex: sway, gust, bend, growth and the push field.
 * Mirrors the vertex shader's arithmetic in order, so the two can be compared term by term.
 *
 * @param {object} o
 * @param {number} o.gradient   uv.y along the blade, 0 at the root and 1 at the tip
 * @param {number} o.viewDist   distance from camera to the tuft origin
 */
export function bladeDeform({
    gradient = 1, originX = 0, originZ = 0, viewDist = 0, time = 0, birthTime = 0,
    windSpeed = 1, windStrength = 1, gustStrength = 1, bendStrength = 1, growthDuration = 1,
    pushEnabled = false, pushCenterX = 0, pushCenterZ = 0, pushRadius = 0, pushStrength = 0,
} = {}) {
    const tipWeight = gradient * gradient;
    const distWidthBoost = 1 + smoothstepEdge(8, 24, viewDist) * 1.5;
    const windDamping = 1 - smoothstepEdge(12, 24, viewDist) * 0.55;

    let growth = clamp01((time - birthTime) / Math.max(growthDuration, 1e-4));
    growth = growth * growth * (3 - 2 * growth);

    // TWO OCTAVES, and the second is offset in BOTH space and rate -- (13.7,-9.1) and a 0.73/0.21 speed
    // remap. Sampling the same lattice twice at one rate would give a scaled copy of the first octave, not
    // a gust, and the picture would breathe in lockstep instead of gusting.
    const windA = Math.sin(windNoise(originX, originZ, time * windSpeed) * Math.PI - 1.5708 + 0.3)
        * 0.0735 * windStrength;
    const windB = Math.sin(windNoise(originX + 13.7, originZ - 9.1, time * (windSpeed * 0.73 + 0.21)) * Math.PI - 1.5708 + 0.3)
        * 0.0735 * gustStrength;
    const sway = (windA + windB) * windDamping;
    const bend = bendStrength
        * (0.65 + windNoise(originX - 4.3, originZ + 7.1, time * (windSpeed * 0.41 + 0.13)) * 0.7)
        * windDamping;

    let pushOffsetX = 0, pushOffsetZ = 0, pushFlatten = 0;
    if (pushEnabled && pushRadius > 1e-4) {
        const ax = originX - pushCenterX, az = originZ - pushCenterZ;
        const distSq = ax * ax + az * az;
        if (distSq < pushRadius * pushRadius) {
            const dist = Math.sqrt(Math.max(distSq, 1e-8));
            // AT THE EXACT CENTRE THE DIRECTION IS A CHOICE, NOT A LIMIT: away/dist is 0/0 there, and the
            // shader picks (0,1). Reproduced rather than "improved" -- a different fallback would push the
            // blade under a footfall in a different direction, which is visible and would not be a bug here.
            const pushDirX = dist > 1e-4 ? ax / dist : 0;
            const pushDirZ = dist > 1e-4 ? az / dist : 1;
            let field = 1 - smoothstepEdge(0, pushRadius, dist);
            field *= field;
            pushOffsetX = pushDirX * (pushStrength * field * tipWeight);
            pushOffsetZ = pushDirZ * (pushStrength * field * tipWeight);
            pushFlatten = field * tipWeight;
        }
    }

    const widthGrowth = 0.24 + (1 - 0.24) * growth;
    return {
        growth, sway, bend, tipWeight, distWidthBoost, windDamping,
        pushOffsetX, pushOffsetZ, pushFlatten,
        scaleX: (1 + (0.42 - 1) * (gradient * 0.88)) * widthGrowth * distWidthBoost,
        scaleY: growth * (1 - pushFlatten * 0.22),
        scaleZ: growth,
        offsetX: sway * tipWeight + pushOffsetX,
        offsetZ: (bend + sway * 0.9) * tipWeight + pushOffsetZ,
    };
}
