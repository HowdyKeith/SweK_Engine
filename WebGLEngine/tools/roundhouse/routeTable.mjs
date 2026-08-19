// WebGLEngine/tools/roundhouse/routeTable.mjs -- v3039
//
// TURNS THE CALL LOG INTO A CHAIN ORDER FOR escalateRoute. This is the step frugon Pro sells as "a routing
// policy derived from your own logged traffic" -- and the reason it can be built here instead of bought is that
// SweK has the one thing frugon structurally cannot: A VERIFIER. Frugon reads someone else's logs and must
// INFER whether a cheaper model would have sufficed, from difficulty heuristics and quality tiers.
// escalateRoute ran a real gate. It does not infer; it knows, and callLog wrote the answer down.
//
// WE STILL NEVER PRICE. Cost per model is an INPUT, taken from frugon's own output, because frugon re-syncs the
// LiteLLM registry weekly and a second price table here would be stale the first time a model changed. If no
// cost is supplied, this refuses to rank rather than ranking on accept-rate alone -- a table that ordered
// models by accuracy while calling itself a COST routing policy would be the wrong answer, confidently.
//
// THE THING THIS FILE EXISTS TO PREVENT: 3/3 verified reading as a better model than 40/50. A raw proportion
// says 100% vs 80% and is wrong -- three samples is not a measurement. That is the tolerance-line lesson
// (gain is not monotone; a cell with three samples cannot show you that) made arithmetic.
"use strict";

/** Below this, a cell is reported but NEVER ranked. Thin cells are the failure mode, so the floor is explicit. */
export const MIN_SAMPLES = 12;

/**
 * Wilson score lower bound at ~95%. Chosen over the raw proportion deliberately: it penalises small n by
 * construction, so 3/3 lands BELOW 40/50 instead of above it, and no separate "is this enough data" hack is
 * needed on top. The floor above is still kept, because a lower bound that is merely pessimistic is not the
 * same as refusing to answer.
 */
export function wilsonLower(passed, total) {
    if (!total) return 0;
    const z = 1.96, p = passed / total, d = 1 + (z * z) / total;
    const c = p + (z * z) / (2 * total);
    const m = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
    return Math.max(0, (c - m) / d);
}

/** Per-model counts straight off the callLog rows. No judgement, just tallying. */
export function tally(rows) {
    const by = new Map();
    for (const r of rows || []) {
        if (!r || !r.model) continue;
        let t = by.get(r.model);
        if (!t) { t = { model: r.model, calls: 0, verified: 0, judged: 0, escalated: 0, unpriceable: 0, inTok: 0, outTok: 0 }; by.set(r.model, t); }
        t.calls++;
        const u = r.usage || {};
        if (u.input_tokens === null || u.output_tokens === null) t.unpriceable++;
        else { t.inTok += u.input_tokens; t.outTok += u.output_tokens; }
        // A call with verified === null was never gated. It must not count as a PASS or a FAIL -- an ungated
        // call is an absence of evidence, and folding it into either bucket invents data.
        const v = r.swek && r.swek.verified;
        if (v === true || v === false) { t.judged++; if (v === true) t.verified++; }
        if (r.swek && r.swek.escalated === true) t.escalated++;
    }
    return [...by.values()];
}

/**
 * Rank models for escalateRoute's chain. costPerCall MUST come from frugon.
 * Returns { ranked, insufficient, refused } -- thin cells are surfaced, never silently dropped, because a table
 * that looks complete over a sample it never had is worse than one that admits the gap.
 */
export function rank(tallies, costPerCall) {
    if (!costPerCall || typeof costPerCall !== "object") {
        return { ranked: [], insufficient: [], refused: "no per-model cost supplied -- run frugon and pass its figures. Ranking on accept-rate alone would be an ACCURACY order wearing a COST order's name." };
    }
    const ranked = [], insufficient = [];
    for (const t of tallies) {
        const cost = costPerCall[t.model];
        const row = { ...t, cost: typeof cost === "number" ? cost : null, accept: t.judged ? t.verified / t.judged : null, lower: wilsonLower(t.verified, t.judged) };
        if (t.judged < MIN_SAMPLES) { row.why = t.judged + " gated calls, floor is " + MIN_SAMPLES + " -- reported, not ranked"; insufficient.push(row); continue; }
        if (row.cost === null) { row.why = "frugon returned no price for this model"; insufficient.push(row); continue; }
        if (row.cost <= 0) { row.why = "a cost of " + row.cost + " would divide to infinity and pin this model at the top of the chain forever"; insufficient.push(row); continue; }
        // KNOWN LIMIT, found by the gate contradicting my own intuition. merit prices the SUCCESSES and ignores
        // the retries: escalateRoute does not stop when a cheap model fails, it escalates, so a failure costs the
        // cheap call AND the dear one. A coin-flip model can therefore top this ranking on headline
        // verified-per-dollar while saving almost nothing once the failed attempt is paid for. Modelling the
        // chain (cost_a + (1-p_a)*cost_b) is the next step; until then this RANKS models, it does not cost chains,
        // and calling it a chain cost would be the confident wrong answer this file was written to avoid.
        row.merit = row.lower / row.cost;      // verified-per-dollar, on the PESSIMISTIC rate
        ranked.push(row);
    }
    ranked.sort((a, b) => b.merit - a.merit);
    return { ranked, insufficient, refused: null };
}

/** The chain escalateRoute consumes: cheapest-effective first. Empty is a legitimate answer and says why. */
export function chain(result) {
    if (!result || result.refused || !result.ranked.length) return { chain: [], why: (result && result.refused) || "no model cleared the sample floor -- the existing DEFAULT_CHAIN stands, because an unmeasured order is not an improvement on a considered one" };
    return { chain: result.ranked.map((r) => r.model), why: "ordered by verified-per-dollar on the Wilson lower bound of " + result.ranked.length + " models" };
}

/**
 * EXPECTED COST PER VERIFIED ANSWER for a cheap-first chain -- the fix for the limit recorded above.
 *
 * merit ranks models on the successes and ignores the retries. escalateRoute does not stop when a cheap model
 * fails; it escalates, so a failure costs the cheap call AND everything after it. The real bill is
 *   cost_a + (1-p_a) * (cost_b + (1-p_b) * (cost_c + ...))
 * and the tail is the strongest model, which is assumed to succeed because if it does not there is nowhere left
 * to escalate to and the run returns FLAGGED-unverified either way.
 *
 * This is why a coin-flip model topping the merit ranking is not automatically the right chain head: at 30/60
 * and a 4x price gap the headline says 4x cheaper and this says about 1.3x.
 */
export function chainCost(ranked) {
    if (!ranked || !ranked.length) return { perAnswer: null, why: "no ranked models -- nothing to cost" };
    let total = 0, reach = 1;                       // reach = probability we still need this link
    for (const r of ranked) {
        if (typeof r.cost !== "number") return { perAnswer: null, why: "model " + r.model + " has no price, so the chain cannot be costed" };
        total += reach * r.cost;
        reach *= (1 - r.lower);                     // PESSIMISTIC pass rate, so the estimate errs expensive
    }
    const strongestOnly = ranked[ranked.length - 1].cost;
    return {
        perAnswer: total,
        strongestOnly,
        saving: strongestOnly > 0 ? 1 - total / strongestOnly : null,
        residual: reach,
        why: "escalation priced in on the Wilson lower bound, so the estimate errs EXPENSIVE -- a chain that looks cheap here is cheap",
    };
}
