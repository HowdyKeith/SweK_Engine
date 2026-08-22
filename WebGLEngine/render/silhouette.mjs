// WebGLEngine/render/silhouette.mjs — v3337
// ---------------------------------------------------------------------------------------------------------------
// THE HARD GATES: SILHOUETTE IoU AND SCALE DELTA, AND THE RULE THAT A SOFT AVERAGE CANNOT WASH THEM OUT.
//
// perceptual.mjs adds signals that say "does it look like the same thing". This adds the two that say "is it the
// same SHAPE, at the same SIZE" -- and those are treated differently on purpose. Every soft signal is a number in
// [0,1] that gets averaged; a hard gate is a veto. A render that agrees on brightness, tone, edge density and
// structure while occupying the wrong region of the frame is not 85% correct, IT IS WRONG, and an ensemble that
// averaged it to 0.87 would be reporting a number that means nothing.
//
// That distinction is the idea worth taking from img2threejs's stage-4 evaluator: "HARD gates (a fail cannot be
// averaged away)". The implementation here is this tree's own.
//
// *** WHAT IS DELIBERATELY NOT TAKEN: THEIR NUMBERS. *** Their thresholds are IoU < 0.85 and scale delta > 0.08,
// tuned against photographs of knives rendered by a different pipeline. Adopting them would mean shipping a
// tolerance that nobody in this tree ever measured, which is exactly the failure this session found in the
// promptCost multiplier, the "MEASURED" gate headers and the airy control. The defaults below are therefore
// NULL: a caller must pass a threshold, and the gate earns one from a measured floor on this tree's own
// rasteriser rather than inheriting one from a photograph.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { dims } from "./perceptual.mjs";   // one place that knows both image shapes

/**
 * Occupancy mask: which pixels are covered by a body rather than background. The rasteriser writes bodies as
 * shaded RGB over a black-with-alpha background, so "anything non-black" is the silhouette -- no colour matching
 * and no dependence on which shade a body happened to get from its index.
 */
// *** THIS ASSUMES A DARK BACKGROUND, WHICH IS TRUE OF THIS RASTERISER AND IS NOT A GENERAL FACT. ***
// backendVisualDiff writes bodies as shaded RGB onto a zero-filled buffer, so "brighter than 8" is exactly
// "covered by a body". Point it at an image whose background is 20 and EVERY PIXEL reads as occupied -- IoU
// comes back 1.0000 for two shapes that do not overlap at all, and the gate reports perfect agreement between a
// box and a different box somewhere else. That is not hypothetical: the first run of the gate did exactly that,
// on three checks at once, because its synthetic fixtures used 20 for background.
//
// The threshold is kept ABSOLUTE rather than made adaptive, because an adaptive one would silently segment
// something on any input and this should instead be obviously wrong when misused. `thresh` is a parameter so a
// caller with a different background states it rather than discovering it.
export function mask(img, { thresh = 8 } = {}) {
    const { data, w, h } = dims(img);
    const m = new Uint8Array(w * h);
    for (let i = 0, p = 0; p < w * h; i += 4, p++) {
        m[p] = (data[i] > thresh || data[i + 1] > thresh || data[i + 2] > thresh) ? 1 : 0;
    }
    return { m, w, h };
}

/** Intersection over union of two occupancy masks. Two empty frames agree exactly, which is correct. */
export function iou(a, b) {
    const A = mask(a), B = mask(b);
    let inter = 0, union = 0, ca = 0, cb = 0;
    const n = Math.min(A.m.length, B.m.length);
    for (let i = 0; i < n; i++) {
        if (A.m[i]) ca++;
        if (B.m[i]) cb++;
        if (A.m[i] && B.m[i]) inter++;
        if (A.m[i] || B.m[i]) union++;
    }
    return { iou: union === 0 ? 1 : inter / union, areaA: ca, areaB: cb, intersection: inter, union };
}

/**
 * Scale delta: the relative difference in occupied area. Separate from IoU on purpose -- two shapes can overlap
 * poorly while being the same size (a translation), or overlap well while one is systematically larger (a
 * mis-scaled camera). Those are different faults and they want different names.
 */
export function scaleDelta(a, b) {
    const r = iou(a, b);
    const denom = (r.areaA + r.areaB) / 2;
    return denom === 0 ? 0 : Math.abs(r.areaA - r.areaB) / denom;
}

/** Centroid offset in pixels, reported because a pure translation is the fault IoU is worst at describing. */
export function centroidShift(a, b) {
    const A = mask(a), B = mask(b);
    const cen = (M) => {
        let sx = 0, sy = 0, c = 0;
        for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (M.m[y * M.w + x]) { sx += x; sy += y; c++; }
        return c ? [sx / c, sy / c] : [0, 0];
    };
    const [ax, ay] = cen(A), [bx, by] = cen(B);
    return Math.hypot(ax - bx, ay - by);
}

/**
 * THE COMBINER, AND THE WHOLE POINT OF IT.
 *
 * Soft signals are averaged. Hard gates are NOT: if one fails, the verdict is REJECT no matter what the average
 * says, and the returned object records BOTH -- the soft score is still reported, so a reader can see exactly how
 * good the thing looked while being wrong. Hiding the soft score would make the rejection unarguable; hiding the
 * veto would make the average a lie.
 *
 * `hard` thresholds MUST be supplied. There is no default, because a default would be a number nobody measured.
 */
export function combine({ soft = {}, hard = {} } = {}) {
    const names = Object.keys(soft);
    const softScore = names.length ? names.reduce((s, k) => s + soft[k], 0) / names.length : null;
    const failures = [];
    for (const [name, { value, limit, direction }] of Object.entries(hard)) {
        if (limit == null) throw new Error(`combine: hard gate "${name}" has no limit -- a threshold must be measured, never defaulted`);
        const bad = direction === "min" ? value < limit : value > limit;
        if (bad) failures.push({ name, value, limit, direction });
    }
    return {
        verdict: failures.length ? "REJECT" : "ACCEPT",
        failures,
        softScore,
        soft,
        // NAMED so the two can never be confused for one another in a report
        rejectedDespiteSoftScore: failures.length > 0 && softScore != null && softScore > 0.8,
    };
}
