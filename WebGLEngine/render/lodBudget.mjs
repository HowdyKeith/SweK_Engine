"use strict";
import { LOD_RECORD } from "./lodRecord.mjs";
/**
 * LOD THRESHOLDS DERIVED FROM A MEASUREMENT, NOT TYPED.
 *
 * render/gpuDriven.mjs's ladder is driven by angular size: an instance whose radius-over-distance falls below
 * thresholds[k] drops to rung k+1. Every threshold in this tree is a number somebody chose -- 0.012 in
 * orrery-gpu.html, [0.004, 0.012] in universe-gpu.html, [0.025, 0.04] in gpu-rig-check.html -- and v4373 measured,
 * for the first time, what a rung actually COSTS at a given angular size. This module is the other half: a policy,
 * stated once, and the arithmetic that turns a priced ladder into thresholds.
 *
 * *** THE POLICY IS A CHOICE, AND THE FIRST ONE THIS FILE STATED WAS MEASURED WRONG. *** The draft said: a rung may
 * be used wherever the pixels it changes are at most a FRACTION of the pixels the subject covers -- of the subject
 * and not of the frame, on the reasoning that a frame budget "is satisfied trivially by anything far enough away".
 * Measured over a 7.5x range of angular size (0.0167 to 0.125), the fraction does not move: rung 1 costs 56.5% to
 * 75.0% of its own covered pixels and rung 2 costs 83.3% to 90.5%, a spread of 1.33x and 1.09x against 7.5x of
 * distance. It is SCALE-INVARIANT, and the reason is not subtle -- a coarser rung shades differently across the
 * whole subject rather than only at its outline, so the changed count and the covered count scale together.
 *
 * A scale-invariant cost expresses NO PREFERENCE ABOUT DISTANCE, so no threshold can be derived from it at any
 * budget. And the sentence written against the frame policy turns out to be the argument FOR it: a distant model
 * may use a coarse rung precisely BECAUSE its error is trivially small in absolute terms. That is what "you cannot
 * see it from there" means. So the default policy is ABSOLUTE -- a rung may change at most `budget` pixels of the
 * frame -- and the fraction mode stays, exported and measurable, because measuring it is what settled the question.
 *
 * *** AND IT FAILS CLOSED, on the pattern tools/roundhouse/costRecord.mjs sweepBudgetFor set at v4361. *** A rung
 * the record never priced returns NO threshold and says so; a rung that is never cheap enough at any metric
 * measured returns no threshold and says that instead. A caller that must have a number brings its own floor
 * through lodThresholdsOr and gets it back marked `typed`, so a hand-chosen threshold stays visible as one.
 */

/** The default policy: a rung may change at most this many pixels of the frame. A CHOICE, stated in one place. */
export const COST_PIXELS = 64;
/** The policy that was tried first and measured scale-invariant. Kept because the measurement is the finding. */
export const COST_FRACTION = 0.02;
/** A policy is a budget and what it is a budget OF: "frame" (absolute pixels) or "covered" (a fraction of the subject). */
export const FRAME = (budget = COST_PIXELS) => ({ budget, of: "frame" });
export const COVERED = (budget = COST_FRACTION) => ({ budget, of: "covered" });
const costOf = (s, of) => (of === "covered" ? (s.covered > 0 ? s.changed / s.covered : Infinity) : s.changed);
const show = (v, of) => (of === "covered" ? (100 * v).toFixed(2) + "%" : v.toFixed(0) + " px");

/**
 * Price one rung: samples are [{ metric, changed, covered }] -- the angular size the subject was measured at, the
 * pixels that rung changed against rung 0, and the pixels rung 0 covered. Returns the samples sorted by metric with
 * their cost, and whether cost RISES with metric, which it must: a rung is cheaper the further away it is, and a
 * record that says otherwise is a measurement to look at rather than to interpolate through.
 */
export function priceRung(samples, { of = "frame" } = {}) {
    const rows = [...samples].map((s) => ({ metric: s.metric, changed: s.changed, covered: s.covered,
        cost: costOf(s, of) })).sort((a, b) => a.metric - b.metric);
    let monotone = true;
    for (let i = 1; i < rows.length; i++) if (rows[i].cost < rows[i - 1].cost) monotone = false;
    return { rows, monotone };
}

/**
 * The angular size below which a rung is within policy: the largest metric whose cost is at or under the budget,
 * interpolated between the two measured samples that bracket the crossing. Returns { metric, why, bracket } with
 * `metric` null whenever it cannot be derived, and a reason that names which of the three ways it failed.
 */
export function crossingFor(samples, policy = FRAME()) {
    const { budget, of } = typeof policy === "number" ? { budget: policy, of: "covered" } : policy;
    const { rows, monotone } = priceRung(samples, { of });
    if (!rows.length) return { metric: null, monotone, why: "no samples: this rung was never priced" };
    const under = rows.filter((r) => r.cost <= budget);
    if (!under.length) return { metric: null, monotone, rows,
        why: `never within ${show(budget, of)} at any metric measured (cheapest ${show(rows[0].cost, of)} at metric ${rows[0].metric.toPrecision(3)})` };
    const lo = under[under.length - 1];                       // the largest metric that is still within budget
    const hiIdx = rows.indexOf(lo) + 1;
    if (hiIdx >= rows.length) return { metric: lo.metric, monotone, rows, bracket: [lo, null],
        why: `within ${show(budget, of)} at every metric measured, so the crossing is above the sweep; the largest measured (${lo.metric.toPrecision(3)}) is returned as a BOUND and not as the crossing`, bounded: true };
    const hi = rows[hiIdx];
    const span = hi.cost - lo.cost;
    const t = span > 0 ? (budget - lo.cost) / span : 0;
    return { metric: lo.metric + t * (hi.metric - lo.metric), monotone, rows, bracket: [lo, hi], bounded: false,
             why: `interpolated between measured samples at metric ${lo.metric.toPrecision(3)} (${show(lo.cost, of)}) and ${hi.metric.toPrecision(3)} (${show(hi.cost, of)})` };
}

/**
 * The whole ladder's thresholds, derived. `record` is [{ rung, samples }] for rungs 1..n-1 (rung 0 is the
 * reference and is never priced against itself). Returns { thresholds, derived, why } where `thresholds` is null
 * unless EVERY rung derived one -- a partly-derived ladder is a ladder with a typed number hiding in it.
 */
export function lodThresholdsFor(record, { policy = FRAME() } = {}) {
    const per = record.map((r) => ({ rung: r.rung, ...crossingFor(r.samples, policy) }));
    const missing = per.filter((p) => p.metric == null);
    const notMonotone = per.filter((p) => !p.monotone).map((p) => p.rung);
    if (missing.length) return { thresholds: null, per, policy, notMonotone,
        why: `rung(s) ${missing.map((p) => p.rung).join(", ")} could not be derived: ${missing.map((p) => `rung ${p.rung} ${p.why}`).join("; ")}` };
    // gpuDriven's ladder tests `metric < thresholds[k]` in order, so the thresholds must FALL as the rungs coarsen
    const thresholds = per.map((p) => p.metric);
    let ordered = true; for (let i = 1; i < thresholds.length; i++) if (!(thresholds[i] < thresholds[i - 1])) ordered = false;
    if (!ordered) return { thresholds: null, per, policy, notMonotone,
        why: `derived thresholds ${thresholds.map((t) => t.toPrecision(3)).join(", ")} do not fall, so the ladder would skip a rung; that is a measurement to read, not a list to sort` };
    return { thresholds, per, policy, notMonotone, ordered,
             why: `derived at ${show(policy.budget, policy.of)} per rung` };
}

/** The caller's floor when a ladder cannot be derived, marked so a typed number stays visible as one. */
export function lodThresholdsOr(record, typed, opts = {}) {
    const d = lodThresholdsFor(record, opts);
    if (d.thresholds) return { ...d, typed: false };
    return { ...d, thresholds: [...typed], typed: true, why: d.why + `; the caller's typed thresholds (${typed.join(", ")}) used instead` };
}

/**
 * v4375 -- WHAT KIND OF LADDER IS THIS? A rung can differ from rung 0 in two quite different ways, and a threshold
 * means something different for each. An APPROXIMATION rung is a coarser build of the same thing: its error is
 * geometry, it falls with distance, and a fidelity budget can choose where to switch. A TELL rung differs on
 * purpose so a viewer can SEE the ladder work -- a different colour per level, which this tree's shipped pages use
 * -- and its cost is not an approximation error at all. No fidelity policy can price a tell, because nothing about
 * it gets better as the object recedes except the number of pixels wearing the wrong colour.
 *
 * `shipped` and `geometry` are the same rungs priced twice: as they ship, and with one colour across every rung so
 * only the geometry can differ. The line is the POLICY's rather than an exact zero -- measured, a subdivided flat
 * quad rasterises its INTERIOR EDGES a few pixels differently at some sizes (5, 20 and 63 across the two shipped
 * ladders), which is the rasteriser and not the shape. Geometry that never leaves the budget at any metric measured
 * has no fidelity threshold to derive; a shipped cost far beyond it is a tell, and is named as one rather than
 * handed a number that would read as a fidelity claim.
 */
export function ladderKind(shipped, geometry, { policy = FRAME() } = {}) {
    const worst = (rec) => Math.max(0, ...rec.flatMap((r) => r.samples.map((x) => x.changed)));
    const g = worst(geometry), sh = worst(shipped);
    const budget = policy.of === "frame" ? policy.budget : Infinity;
    if (g <= budget && sh > budget) return { kind: "tell", geometryWorst: g, shippedWorst: sh, budget,
        why: `every rung draws the same geometry to within ${g} pixels -- inside the ${budget}-pixel budget at every metric measured -- while the ladder as shipped differs by up to ${sh}, so the visible difference is the colour and there is no fidelity to price` };
    if (g <= budget && sh <= budget) return { kind: "identical", geometryWorst: g, shippedWorst: sh, budget,
        why: `no rung leaves the ${budget}-pixel budget at any metric measured, coloured or not; this is one rung wearing several names` };
    return { kind: "approximation", geometryWorst: g, shippedWorst: sh, budget,
        why: `geometry leaves the ${budget}-pixel budget, by up to ${g} pixels, so the ladder approximates and a fidelity budget can choose where to switch` };
}

/**
 * v4377 -- THE COST A RECORD PREDICTS AT ONE ANGULAR SIZE, interpolated between the samples that bracket it. The
 * inverse of crossingFor, and the way a derived threshold can be CHECKED rather than trusted: feed the threshold
 * back in and the cost it implies must be inside the budget it was derived from. Outside the sampled range it
 * returns null, because a record cannot answer for a metric it never measured.
 */
export function costAtMetric(samples, metric, { of = "frame" } = {}) {
    const { rows } = priceRung(samples, { of });
    if (!rows.length || metric < rows[0].metric || metric > rows[rows.length - 1].metric) return null;
    for (let i = 1; i < rows.length; i++) {
        if (metric <= rows[i].metric) { const lo = rows[i - 1], hi = rows[i];
            const span = hi.metric - lo.metric;
            return span > 0 ? lo.cost + ((metric - lo.metric) / span) * (hi.cost - lo.cost) : lo.cost; }
    }
    return rows[rows.length - 1].cost;
}

/**
 * v4377 -- THE DISC LADDER'S THRESHOLDS AT A GIVEN FRAME WIDTH, derived from the frozen record rather than typed.
 *
 * *** WHY A THRESHOLD CANNOT BE ONE CONSTANT, MEASURED RATHER THAN REASONED. *** A rung's cost in PIXELS is an area
 * on the screen, so it grows with the square of the frame width, and a budget stated in pixels is therefore met at a
 * different angular size on a different canvas. Derived at three widths from the same record, the crossings are
 * 0.0625 / 0.0354 / 0.0151 for rung 1 at 128, 256 and 512 -- and metric x width is 8.00 / 9.06 / 7.72, constant to
 * about a tenth over a fourfold change of resolution. So the shape of the law is metric = K / width, and K is what
 * this derives.
 *
 * IT TAKES THE SMALLEST K, not the mean. The policy is a CEILING -- at most `budget` pixels -- so the threshold that
 * honours it at every width measured is the most conservative one, and a mean would exceed the budget at whichever
 * resolution came in below it. A caller at a width far outside 128..512 is extrapolating and is told so.
 */
export function discLadderThresholds(width, { policy = FRAME(), record = LOD_RECORD } = {}) {
    const widths = record.widths.filter((w) => record.byWidth[w]);
    const perWidth = widths.map((w) => ({ w, d: lodThresholdsFor(record.byWidth[w], { policy }) }));
    const failed = perWidth.filter((x) => !x.d.thresholds);
    if (failed.length) return { thresholds: null, k: null, widths,
        why: `the frozen record does not derive at width(s) ${failed.map((x) => x.w).join(", ")}: ${failed[0].d.why}` };
    const rungs = perWidth[0].d.thresholds.length;
    const k = Array.from({ length: rungs }, (_, i) => Math.min(...perWidth.map((x) => x.d.thresholds[i] * x.w)));
    const lo = Math.min(...widths), hi = Math.max(...widths);
    const extrapolating = width < lo || width > hi;
    return { thresholds: k.map((kk) => kk / width), k, widths, width, extrapolating,
             spread: Array.from({ length: rungs }, (_, i) => { const v = perWidth.map((x) => x.d.thresholds[i] * x.w);
                 return Math.max(...v) / Math.min(...v); }),
             why: `metric = K / width with K = ${k.map((x) => x.toFixed(2)).join(", ")}, the smallest of ${widths.length} widths measured (${widths.join(", ")})`
                  + (extrapolating ? `; width ${width} is OUTSIDE that range and this is an extrapolation` : "") };
}
