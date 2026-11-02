// WebGLEngine/tools/ship/tuneWide.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/tuneWideCmd.mjs; the gate is tools/ship/tuneWide-selfcheck.mjs)
//
// ROUND 9 of brain/NEEDS_AND_LIMITS.md ("the walls: widen alpha and ramp and search again"), registered before this file existed. The Round 8 search with the wide bounds of brain/tunedRule.mjs, starting from the frozen Round 8 champion, alpha moved multiplicatively;
// the champion is picked on VALIDATION and flown once on the fresh audits (561-612) with the Round 8 champion beside it. THE AUDITS ARE READ ONLY BY audits() and robustness(). Pure: no clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as R from "../../brain/residualAdvisor.mjs";
import * as U from "../../brain/tunedRule.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";
import { judge, verdictOf } from "./trainResidual.mjs";
import { constWeights } from "./constShift.mjs";
import { RECIPE, TRAIN, VALIDATION, CONST_SHIFT, NOISES } from "./tuneRule.mjs";
/** Flight options for every flight this library makes (the gate shortens the dives with { seconds } for the rows that do not depend on their length; the real runs never call this). */
let FLIGHT = {};
export const setFlight = (o) => { FLIGHT = { ...o }; };

export { RECIPE, TRAIN, VALIDATION, NOISES };
export const SEARCH_BASE = 64000, ALPHA_SIGMA = 0.5;
export const AUDIT_RANGES = Object.freeze({ W1: [561, 572], W2: [581, 592], W3: [601, 612] }), AUDIT_NAMES = Object.freeze(["W1", "W2", "W3"]);
export const ARMS = Object.freeze(["ALONE", "RULE-GF", "CONST-TUNED", "TUNED-R8", "TUNED-WIDE"]), ROBUST_ARMS = Object.freeze(["RULE-GF", "TUNED-R8", "TUNED-WIDE"]);
const brainSeat = (ctx) => T.ruleSeat("obs")(ctx), vet = (advisor) => A.advisedPilot(brainSeat, advisor, "VETO");

/** The pilot of one arm. `r8` is the frozen Round 8 champion's parameters, `wide` this round's. */
export function pilotOf(arm, { r8 = null, wide = null } = {}) {
    if (arm === "ALONE") return T.GUARDED_OBS;
    if (arm === "RULE-GF") return vet(A.ADVISORS["GUARDED-FILTER"]);
    if (arm === "CONST-TUNED") return vet(R.residualSeat(constWeights(CONST_SHIFT)));
    if (arm === "TUNED-R8") { if (!r8) throw new Error("tuneWide.pilotOf: TUNED-R8 needs the Round 8 parameters"); return vet(U.tunedSeat(r8, U.WIDE_BOUNDS)); }
    if (arm === "TUNED-WIDE") { if (!wide) throw new Error("tuneWide.pilotOf: TUNED-WIDE needs the parameters"); return vet(U.tunedSeat(wide, U.WIDE_BOUNDS)); }
    throw new Error(`tuneWide.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
export const scoreOf = (arm, opts, set, gauge = T.GAUGE) => T.evaluate(pilotOf(arm, opts), set, { gauge, ...FLIGHT });

const gauss = (rng) => { let s = 0; for (let i = 0; i < 6; i++) s += rng(); return (s - 3) * Math.SQRT2; };
/** One search from `start` (the Round 8 champion) under the wide bounds; alpha moves multiplicatively (x exp(ALPHA_SIGMA g)), the others by sigma of their range. */
export function search(seed, start, recipe = RECIPE, trainSet = TRAIN) {
    const rng = mulberry(seed), ev = (p) => T.evaluate(vet(U.tunedSeat(p, U.WIDE_BOUNDS)), trainSet, { gauge: T.GAUGE, ...FLIGHT }).score;
    let best = U.normalise(start, U.WIDE_BOUNDS), bestScore = ev(best), held = bestScore;
    const trace = [bestScore], checkpoints = [{ iter: 0, params: { ...best }, trainScore: bestScore }];
    for (let it = 1; it <= recipe.iters; it++) {
        const child = { ...best }, k = 1 + Math.floor(rng() * recipe.maxChange);
        for (let j = 0; j < k; j++) {
            const name = U.NAMES[Math.floor(rng() * U.NAMES.length)], [lo, hi] = U.WIDE_BOUNDS[name];
            child[name] = name === "alpha" ? child.alpha * Math.exp(ALPHA_SIGMA * gauss(rng)) : child[name] + recipe.sigma * (hi - lo) * gauss(rng);
        }
        const c = U.normalise(child, U.WIDE_BOUNDS), s = ev(c);
        if (s >= bestScore) { if (s > bestScore) bestScore = s; best = c; held = s; }
        trace.push(held);
        if (it % recipe.checkpointEvery === 0) checkpoints.push({ iter: it, params: { ...best }, trainScore: bestScore });
    }
    return { seed, best, bestScore, trace, checkpoints };
}
/** The champion on VALIDATION; `start` (the Round 8 champion) stands unless a checkpoint beats it there. */
export function champion(searches, start, validation = VALIDATION) {
    const sc = (p) => T.evaluate(vet(U.tunedSeat(p, U.WIDE_BOUNDS)), validation, { gauge: T.GAUGE, ...FLIGHT }).score, s0 = U.normalise(start, U.WIDE_BOUNDS), startScore = sc(s0);
    let best = { params: s0, validation: startScore, from: "Round 8 champion", iter: 0 };
    for (const s of searches) for (const c of s.checkpoints) { if (c.iter === 0) continue; const v = sc(c.params); if (v > best.validation) best = { params: U.normalise(c.params, U.WIDE_BOUNDS), validation: v, from: `search ${s.seed}`, iter: c.iter }; }
    return { ...best, startValidation: startScore };
}
export function audits(opts, { ranges = AUDIT_RANGES, kinds = T.KINDS } = {}) {
    const out = {};
    for (const n of AUDIT_NAMES) { const set = T.setOf(kinds, ranges[n][0], ranges[n][1]); out[n] = Object.fromEntries(ARMS.map((a) => [a, scoreOf(a, opts, set)])); }
    return out;
}
export function robustness(opts, { ranges = AUDIT_RANGES, noises = NOISES, kinds = T.KINDS } = {}) {
    const out = {};
    for (const sd of noises) { out[sd] = {}; for (const n of AUDIT_NAMES) { const set = T.setOf(kinds, ranges[n][0], ranges[n][1]); out[sd][n] = Object.fromEntries(ROBUST_ARMS.map((a) => [a, scoreOf(a, opts, set, { ...T.GAUGE, sd })])); } }
    return out;
}
/** The reading of section 4 from the three paired judgements of TUNED-WIDE against TUNED-R8. */
export function wallsLine(js) {
    if (js.every((j) => j.wins)) return "THE WALLS MATTERED";
    if (js.every((j) => j.loses)) return "WORSE";
    if (js.every((j) => !j.wins && !j.loses)) return "THE WALLS DID NOT MATTER";
    return "MIXED";
}
/** The parameters that sit on a bound of `bounds` (within 1e-9, relative for alpha). */
export function onBounds(params, bounds = U.WIDE_BOUNDS) {
    const out = [];
    for (const k of U.NAMES) { const [lo, hi] = bounds[k], tol = 1e-9 * Math.max(1, Math.abs(hi)); if (Math.abs(params[k] - lo) <= tol) out.push(`${k} at its lower bound ${lo}`); else if (Math.abs(params[k] - hi) <= tol) out.push(`${k} at its upper bound ${hi}`); }
    return out;
}
export function checksOf(au, { r8 = {}, identityParams = r8 } = {}) {
    const rows = [], one = [T.scenario(241, "far"), T.scenario(241, "both")];
    const a = scoreOf("TUNED-R8", { r8: identityParams }, one), b = T.evaluate(vet(U.tunedSeat(r8)), one, { gauge: T.GAUGE, ...FLIGHT });
    rows.push({ name: "IDENTITY", ok: a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint), text: "TUNED-R8 under the wide bounds equals the Round 8 seat (narrow bounds) dive for dive" });
    for (const n of AUDIT_NAMES) {
        const x = au[n], idx = x.ALONE.runs.map((r, i) => (r.kind === "far" || r.kind === "both" ? i : -1)).filter((i) => i >= 0), sub = (res) => ({ runs: idx.map((i) => res.runs[i]) }), j = judge(sub(x["RULE-GF"]), sub(x.ALONE));
        rows.push({ name: `RULE NOT TRIVIAL ${n}`, ok: j.wins, text: `RULE-GF beats ALONE on far and both on ${n} by ${j.diff.toFixed(3)} (margin ${j.margin.toFixed(3)})` });
    }
    return rows;
}
export function report(au, rob, champ, searches = [], { r8 = {} } = {}) {
    const L = [`ROUND 9: the walls; noisy gauge sd 0.1, brain GUARDED-OBS, VETO; audits ${AUDIT_NAMES.map((n) => `${n} ${AUDIT_RANGES[n][0]}-${AUDIT_RANGES[n][1]}`).join(", ")} (48 dives each, read once)`];
    const pstr = (p) => U.NAMES.map((k) => `${k} ${Number(p[k]).toPrecision(3)}`).join(", ");
    L.push(`champion: ${champ.from}${champ.iter ? ` at iteration ${champ.iter}` : ""}: ${pstr(champ.params)}; validation ${champ.validation.toFixed(4)} against the Round 8 champion's ${champ.startValidation.toFixed(4)}; ${searches.length} searches; chosen BEFORE the audits were flown`);
    const hits = onBounds(champ.params);
    L.push(`on a bound: ${hits.length ? hits.join("; ") : "none"}`);
    const checks = checksOf(au, { r8 }), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("means " + AUDIT_NAMES.join(" | "));
    for (const arm of ARMS) L.push(`  ${arm.padEnd(12)} ${AUDIT_NAMES.map((n) => au[n][arm].score.toFixed(3)).join(" | ")}   crushed ${AUDIT_NAMES.map((n) => au[n][arm].crashed).join("/")}  stranded ${AUDIT_NAMES.map((n) => au[n][arm].stranded).join("/")}`);
    const show = (js) => js.map((j) => `${j.diff >= 0 ? "+" : ""}${j.diff.toFixed(3)} ${j.wins ? "WINS" : j.loses ? "LOSES" : "tie"}`).join(" | "), v = (src, a, b) => AUDIT_NAMES.map((n) => judge(src[n][a], src[n][b]));
    const ww = v(au, "TUNED-WIDE", "TUNED-R8"), wr = v(au, "TUNED-WIDE", "RULE-GF");
    L.push(`TUNED-WIDE against TUNED-R8: ${show(ww)}`, `TUNED-WIDE against RULE-GF: ${show(wr)} = ${verdictOf(wr)}`);
    for (const sd of Object.keys(rob)) {
        L.push(`robustness, gauge noise sd ${sd} (nothing re-tuned):`);
        for (const arm of ROBUST_ARMS) L.push(`  ${arm.padEnd(12)} ${AUDIT_NAMES.map((n) => rob[sd][n][arm].score.toFixed(3)).join(" | ")}`);
        L.push(`  TUNED-WIDE against TUNED-R8: ${show(v(rob[sd], "TUNED-WIDE", "TUNED-R8"))}`, `  TUNED-WIDE against RULE-GF: ${show(v(rob[sd], "TUNED-WIDE", "RULE-GF"))}`);
    }
    L.push(`BOTTOM LINE: ${bad.length ? "NOT WEIGHED (a check failed)" : wallsLine(ww)}`);
    return L;
}
