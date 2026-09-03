"use strict";
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
