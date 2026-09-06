// WebGLEngine/render/parallaxSampler.mjs -- v4489
//
// THE MIRROR MIRRORS THE MARCH AND NOT THE SAMPLER, AND THAT IS THE WHOLE DISAGREEMENT.
//
// ---- WHAT WAS BEING GRADED, AND WHAT WAS NOT ------------------------------------------------------------------
//
// render/parallaxOcclusion.js ships a GLSL function and a JS one, and names the JS one parallaxUVMirror --
// "the JS model of PARALLAX_GLSL", per its gate's header. The gate proves the mirror converges to a fine
// reference march, behaves correctly on a flat heightmap and at a head-on view, and differs under a sabotage.
// All of that is about THE MARCH. Neither function's height comes from the same place:
//
//     the GLSL       texture(uHeightMap, uv).r     -- 8-bit texels, NEAREST, clamped to the edge
//     the JS         sampleHeight(u, v)            -- a callback, and every caller hands it a continuous function
//
// *** MEASURED ON A REAL DRIVER, 256 POINTS, A STAIRCASE HEIGHTMAP, 16 LAYERS: ***
//
//     mirror fed the CONTINUOUS height     2.855e-3     twelve thousand times the transport floor
//     mirror fed the SAMPLER SIMULATED     2.413e-7     at the 2.380e-7 floor -- exact, to the instrument
//
// So the march is a perfect mirror and the sampler is the entire discrepancy. Simulating the device's
// sampler -- round to 8 bits, pick the nearest texel, clamp at the edge -- collapses a millimetre-scale
// disagreement to nothing. That is not a defect in either function; it is a gate grading half a pair and
// saying, in its own header, that it grades the whole one.
//
// ---- *** AND MORE LAYERS DOES NOT CONVERGE, WHICH IS THE OPPOSITE OF WHAT THE GATE ASSERTS. *** -----------------
//
// The existing gate's header promises "more layers -> closer to the reference", and against a continuous
// reference that is true: the march's own discretisation error falls as 1/numLayers. Against a REAL TEXTURE
// it does not, and the sweep says why -- the sampler error is independent of the layer count while the step
// the march takes is not:
//
//     numLayers        4        8       16       32
//     max error    8.206e-4  8.206e-4  8.206e-4  8.206e-4      the SAME, because it is the texel, not the march
//     one dUV.x    8.750e-3  4.375e-3  2.187e-3  1.094e-3      shrinking as 1/numLayers, as designed
//
// (The first draft of this table took its error row from a DIFFERENT heightScale than its step row -- 0.05
// against 0.1 -- and the gate went red re-deriving it. Two rows of one sweep, read off two lines of the
// printout. Both rows are the shipped heightScale now, and the gate derives both rather than quoting either.)
//
// A fixed error against a shrinking step means the disagreement is worth MORE layers as the march gets finer.
// On the staircase at sixteen layers, 112 of 256 points land more than nine tenths of a step away -- the two
// implementations exit the march on DIFFERENT LAYERS. Refining the march past the texel grid buys nothing and
// makes the mismatch louder, and no row anywhere said so.
//
// ---- *** THE GRAZING GUARD IS WHERE THEY REALLY DIVERGE, AND IT IS 734 UV UNITS. *** ---------------------------
//
// parallaxUVMirror normalises viewTangent and PARALLAX_GLSL does not, which sounds like a divergence and is
// not: the only use of the vector is the ratio xy/z, and normalising leaves a ratio alone. Driving the shader
// with an unnormalised vector and the mirror with the same one reads 2.413e-7 -- identical.
//
// EXCEPT WHERE THE GUARD BITES. Both clamp with max(z, 1e-4) to survive a grazing angle, and one clamps a
// NORMALISED z while the other clamps a RAW one -- so below the clamp the function stops being
// scale-invariant and the two answers separate by the normalisation factor. At viewTangent.z = 2e-5 the
// disagreement is 7.343e+2, in a coordinate whose meaningful range is [0, 1]. Seven hundred UV units.
//
// That is reachable: z near zero is the silhouette of any surface this effect is used on, and it is exactly
// the case the guard was written for. The gate tests a flat heightmap and a head-on view and has never once
// pointed the ray along the surface.
//
// ---- WHAT THIS ROUND DOES AND DOES NOT CHANGE ------------------------------------------------------------------
//
// NOTHING IN EITHER FUNCTION IS EDITED. Three facts are measured and recorded, and the gate that says the
// shader cannot run here is corrected, because this round ran it. Deciding whether the mirror should
// simulate the sampler, whether the guard should clamp the same z on both sides, and whether numLayers should
// be capped at the texel grid are three separate calls about shipping behaviour, and a round that measured
// them for the first time is the wrong round to also make them.
"use strict";

/** The device's sampler, as tools/ship/webgpuHarness.mjs binds it: 8-bit texels, NEAREST, clamp to edge. */
export const DEVICE_SAMPLER = Object.freeze({
    bits: 8, filter: "nearest", wrap: "clamp-to-edge",
    note: "the harness sets TEXTURE_MIN_FILTER and MAG_FILTER to NEAREST and both wraps to CLAMP_TO_EDGE, " +
          "so the simulation below is exact rather than approximate -- a bilinear binding would need a " +
          "different simulation and is its own measurement",
});

/**
 * Reproduce that sampler over a height field given on the texel grid. This is what parallaxUVMirror has to be
 * handed for its answer to be the shader's answer.
 *
 * `height(tx, ty)` takes INTEGER texel coordinates, not uv, because that is what a texture holds.
 */
export function deviceSampleHeight(height, size) {
    const q8 = (h) => Math.round(Math.max(0, Math.min(1, h)) * 255) / 255;
    return (u, v) => {
        const x = Math.min(size - 1, Math.max(0, Math.floor(u * size)));
        const y = Math.min(size - 1, Math.max(0, Math.floor(v * size)));
        return q8(height(x, y));
    };
}

/** The same field read as a continuous function -- what every caller actually passes today. */
export function continuousSampleHeight(height, size) {
    return (u, v) => height(Math.max(0, Math.min(1, u)) * (size - 1),
                            Math.max(0, Math.min(1, v)) * (size - 1));
}

/** The configuration every figure below was measured at. Changing any of it changes the figures. */
export const PROBE = Object.freeze({
    render: 16, texture: 16, layers: 16, heightScale: 0.1,
    viewTangent: Object.freeze([0.35, 0.15, 1.0]),   // normalised before use; see NORMALISE_IS_A_NO_OP
    height: "staircase: 0.2 + 0.6 * floor(tx / 2) / ((size - 1) / 2) -- no transcendental, per v4483's rule",
    transportFloor: 2.38e-7,
});

/** *** THE FINDING. *** Same march, same shader, two samplers. */
export const SAMPLER_GAP = Object.freeze({
    at: "v4489", samples: 256,
    continuousHeight: 2.855e-3,
    samplerSimulated: 2.413e-7,
    ratio: 11830,                       // 2.855e-3 / 2.413e-7, rounded -- how much the sampler is worth
    oneLayerStep: 2.187e-3,             // dUV.x at these settings
    pointsPastNineTenthsOfAStep: 112,
    verdict: "the march is an exact mirror; the sampler is the whole disagreement",
});

/**
 * *** REFINING THE MARCH DOES NOT CONVERGE AGAINST A REAL TEXTURE. *** The sampler error does not depend on
 * numLayers and the step does, so the mismatch grows in units of a step as the march is refined. Measured on
 * the CPU across the sweep and confirmed on the device at the shipped row.
 */
export const LAYER_SWEEP = Object.freeze({
    at: "v4489",
    layers: Object.freeze([4, 8, 16, 32]),
    // A ramp rather than the staircase, because a monotone field makes the invariance unmistakable.
    maxError: Object.freeze([8.206e-4, 8.206e-4, 8.206e-4, 8.206e-4]),
    oneStep: Object.freeze([8.750e-3, 4.375e-3, 2.187e-3, 1.094e-3]),
    // *** THE CLAIM THIS CONTRADICTS IS IN THE OTHER GATE'S OWN HEADER *** -- "more layers -> closer to the
    // reference" -- and it is TRUE of the march against a continuous reference and FALSE of the pair against
    // a texture. Two different questions; the header answers one and reads as though it answered both.
    contradictsFile: "tools/ship/parallaxOcclusion-selfcheck.mjs",
    // Stored WITHOUT surrounding quotes, because the gate greps the file for it and a first draft searched
    // for the apostrophes too and found nothing.
    contradictsQuote: "more layers -> closer to the reference",
    resolution: "true of the march's own discretisation, silent about the sampler, which is what dominates",
});

/**
 * The normalisation is a no-op, EXCEPT under the grazing guard, and there it is worth hundreds of UV units.
 * Both facts are here because the first one alone reads as "no divergence" and would close the question.
 */
export const NORMALISE_IS_A_NO_OP = Object.freeze({
    at: "v4489",
    awayFromTheGuard: 2.413e-7,      // shader given a raw vector, mirror given the same: identical
    why: "the only use of viewTangent is the ratio xy/z, and normalising leaves a ratio alone",
    guardedZ: 1e-4,
    // The existing gate drives these view-z values and no others; every one is far above the guard, so its
    // branch has never been exercised. Derived from that file rather than asserted by keyword -- a first
    // draft looked for the string "1e-4" and found it in the gate's OWN reference march, which mentions the
    // guard without ever reaching it.
    existingGateViewZ: Object.freeze([0.8, 1, 0.6, 0.6]),
    atGrazing: Object.freeze({
        viewTangentZ: 2.0e-5,
        divergence: 7.343e+2,
        why: "below the clamp the function stops being scale-invariant, and the mirror clamps a NORMALISED z " +
             "while the shader clamps a RAW one, so P differs by the normalisation factor",
        reachable: "z near zero is the silhouette of any surface this effect runs on -- the case the guard exists for",
        testedByTheExistingGate: false,
    }),
});

export const MEASURED_AT_V4489 = Object.freeze({
    at: "v4489",
    findings: 3,
    shippingChangesMade: 0,
    // The claim corrected this round. It is NOT one of the fifteen render/deviceReach.mjs counts: its wording
    // puts the noun before the verb, so that module's detector misses it, and this round adds it to the
    // detector's named misses rather than widening a pattern that was hand-verified at v4488.
    claimCorrected: "tools/ship/parallaxOcclusion-selfcheck.mjs",
    stillOpen: Object.freeze(["should the mirror simulate the sampler",
                              "should both sides clamp the same z",
                              "should numLayers be capped at the texel grid"]),
});
