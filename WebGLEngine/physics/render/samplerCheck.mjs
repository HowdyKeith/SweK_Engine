// physics/render/samplerCheck.mjs -- v4437 -- a SECOND estimator for the composed BSDF, and what it convicted.
//
// *** v4432 AND v4436 BOTH SHIPPED SAYING THE SAMPLER WAS UNGRADED. "UNGRADED" WAS CARRYING "RETURNS NaN". ***
// principled.sample()'s specular branch read:
//
//     const h = sampleHalfVector(u1, u2, alpha);
//     const cosM = h.cosTheta !== undefined ? h.cosTheta : Math.cos(h.theta);
//
// microfacet.sampleHalfVector returns a THREE-VECTOR WITH Y UP -- [sinH cos(phi), cosH, sinH sin(phi)] -- so
// `h.cosTheta` is undefined, the ternary falls through, `h.theta` is undefined too, and Math.cos(undefined) is
// NaN. Every specular sample since v4432 was NaN. THE TERNARY IS THE TELL: it guards between two GUESSED
// shapes and neither is the real one, and a guess with a fallback is still a guess. Nothing noticed because
// nothing called it, which is what an unexercised path is always free to do.
//
// ---- *** WHY A SECOND ESTIMATOR AND NOT A SECOND DEVICE *** ------------------------------------------------
//
// docs/EXPLAIN-ITSELF.md item 11 asked for a WGSL raygen pass to check quadrature against Monte Carlo, on the
// grounds that the tree had never rendered an image. THAT WAS WRONG AND IT IS THE THIRD ABSENCE CLAIM OF MINE
// IN THREE ROUNDS TO BE WRONG. The tree has had a WGSL path tracer since v4290 (generator, camera, primary ray,
// graded against a real device) and pathTracerGpu.mjs ported the TRANSPORT at v4415, agreeing with the CPU
// BIT FOR BIT on 576 furnace pixels. The item's premise was false.
//
// *** AND v4415 HAD ALREADY RECORDED WHY ITS OWN COMPARISON COULD NOT ANSWER THIS QUESTION. *** Its gate holds
// a row reading "the furnace CERTIFIES a broken cosine sampler, bit-exactly", with a note saying the pass is
// the point and is not good news. GPU-versus-CPU is not two independent paths when both run the SAME sampler:
// a shared sampler bug agrees perfectly and is perfectly wrong. What was missing was never a device. It was an
// estimator that does not share code with the one it checks -- quadrature marches a grid, Monte Carlo draws
// from the pdf, and the only thing they have in common is the BSDF they are both integrating.
//
// ---- *** AND THE SECOND ESTIMATOR CONVICTED THE FIRST ON ITS FIRST OUTING *** -------------------------------
//
// At metallic 1, roughness 0.2, cosO 0.35 the two disagreed by 13%. Refining BOTH says which one was wrong:
//
//     quadrature   N=128: 0.493436   N=256: 0.876913   N=512: 0.987754   N=1024: 0.991338   N=2048: 0.991341
//     Monte Carlo  n=50k:  0.992077   n=200k: 0.992204  n=800k: 0.991645  n=3.2M: 0.991566
//
// THE MONTE CARLO WAS RIGHT FROM FIFTY THOUSAND SAMPLES AND THE QUADRATURE WAS WRONG BY HALF AT ITS DEFAULT
// GRID. directionalAlbedo defaults to N=96, M=48, which is coarser than the 0.493 row. A tight GGX lobe at
// oblique incidence falls between grid lines, and every furnace number this tree has reported at low roughness
// and grazing angles is suspect for that reason.
//
// *** WHAT IS NOT SUSPECT, CHECKED RATHER THAN ASSUMED: v4432'S HEADLINE. *** The 1.0796 was measured at
// roughness 1, where the lobe is broad, and it holds from N=96 to N=2048: 1.079597, 1.079536, 1.079518,
// 1.079516, 1.079516. The instrument fails where the lobe is tight, and that number was not taken there.

import { evaluate, directionalAlbedo, sample } from "./principled.mjs";

"use strict";

/** A deterministic RNG, so a gate that reports a Monte Carlo number reports the SAME one every run. */
export function rng(seed = 1) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The directional albedo, estimated by drawing from sample()'s own pdf.
 * Reports `nan` and `zeroPdf` rather than skipping them silently -- a guard that drops bad samples and then
 * divides by n turns "every sample was NaN" into "the answer is 0", which is v4402's rule and which is
 * exactly what happened while this file was being written.
 */
export function monteCarloAlbedo(params, cosO, { n = 200000, seed = 1, channel = 0 } = {}) {
    const r = rng(seed);
    let sum = 0, nan = 0, zeroPdf = 0, used = 0;
    for (let k = 0; k < n; k++) {
        const s = sample(params, cosO, r(), r(), r());
        if (Number.isNaN(s.pdf) || Number.isNaN(s.cosI) || Number.isNaN(s.cosM)) { nan++; continue; }
        if (!(s.pdf > 0)) { zeroPdf++; continue; }
        const f = evaluate(params, cosO, s.cosI, s.cosM, Math.cos(s.phi), channel);
        if (Number.isNaN(f)) { nan++; continue; }
        sum += (f * s.cosI) / s.pdf;
        used++;
    }
    return { value: sum / n, n, used, nan, zeroPdf };
}

/**
 * *** THE ESTIMATOR'S OWN NOISE, MEASURED, SO A TOLERANCE NEED NOT BE PICKED. *** Runs the same configuration
 * under several seeds and reports the spread. A Monte Carlo check whose bound is a number somebody chose is a
 * check that passes or fails by taste; a bound derived from the estimator's measured standard deviation is a
 * statement about the estimator. The noisiest configuration sets the bound for all of them.
 */
export function noiseOf(params, cosO, { n = 120000, seeds = 8 } = {}) {
    const vals = [];
    for (let s = 1; s <= seeds; s++) vals.push(monteCarloAlbedo(params, cosO, { n, seed: s }).value);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
    return { vals, mean, sd, relSd: sd / mean };
}

/** Both estimators on one configuration, with the ratio derived rather than asserted beside them. */
export function agreement(params, cosO, { n = 200000, seed = 1, N = 512, M = 256 } = {}) {
    const quad = directionalAlbedo(params, cosO, { N, M });
    const mc = monteCarloAlbedo(params, cosO, { n, seed });
    return { quad, mc: mc.value, ratio: mc.value / quad, nan: mc.nan, zeroPdf: mc.zeroPdf, used: mc.used };
}

/**
 * *** THE INSTRUMENT-VERSUS-MODEL TEST, MADE A FUNCTION SO IT STOPS BEING A THING SOMEBODY REMEMBERS TO DO. ***
 * v4432 established the rule: a number that MOVES when you refine the grid is the grid; one that does not is
 * the model. v4436 used it to convict a model. Here it is a callable ladder, returning the value at each grid
 * and the total drift, so a check can assert convergence rather than eyeball it.
 */
export function refineLadder(params, cosO, grids = [[96, 48], [256, 128], [512, 256], [1024, 512], [2048, 1024]]) {
    const values = grids.map(([N, M]) => directionalAlbedo(params, cosO, { N, M }));
    const last = values[values.length - 1];
    return {
        grids, values,
        converged: last,
        drift: Math.max(...values.map((v) => Math.abs(v - last))),
        tailDrift: Math.abs(values[values.length - 2] - last),
    };
}

// *** THE RECORD, FROZEN BY NAME RATHER THAN BY COUNT (v4399's rule), OF WHERE THE TREE'S OWN QUADRATURE
// UNDER-RESOLVES. *** These are not failures of the model. They are the configurations where a furnace number
// from directionalAlbedo's DEFAULT grid should not be believed, and they are recorded so the next round that
// reports one has somewhere to check.
export const GRID_FAILS_AT_V4437 = Object.freeze({
    at: "v4437",
    defaultGrid: Object.freeze({ N: 96, M: 48 }),
    // metallic, roughness, cosO -- and what the default grid reads against the converged value.
    // *** THIS NUMBER WAS HAND-COPIED FROM THE WRONG GRID AND THE GATE CAUGHT IT. *** The first version recorded
    // 0.493436, which is the N=128 rung of the exploratory ladder, not the DEFAULT grid at all. The default is
    // N=96, M=48 and it reads 0.334246 -- WORSE than what was written down. A record that renders a number by
    // hand is item 1's defect, and the row that re-derives it from the tree is why this one lasted an hour.
    worst: Object.freeze({ metallic: 1, roughness: 0.2, cosO: 0.35, converged: 0.991341, atDefaultGrid: 0.334246 }),
    rule: "a TIGHT lobe at an OBLIQUE angle. Both are needed: roughness 0.2 at cosO 0.95 reads correctly, and " +
          "roughness 0.9 at cosO 0.35 reads correctly. It is the product of a narrow lobe and a grazing view " +
          "that puts the lobe between grid lines.",
    headlineStillGood: Object.freeze({
        what: "v4432's uncoupled worst albedo, metallic 0, roughness 1, cosO 0.15",
        values: Object.freeze([1.079597, 1.079536, 1.079518, 1.079516, 1.079516]),
        why: "roughness 1 is a broad lobe, so the coarse grid resolves it. The claim was not taken where the " +
             "instrument fails, which is checked here rather than hoped.",
    }),
});
