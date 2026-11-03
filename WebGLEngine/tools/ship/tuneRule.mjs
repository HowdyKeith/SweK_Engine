// WebGLEngine/tools/ship/tuneRule.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/tuneRuleCmd.mjs; the gate is tools/ship/tuneRule-selfcheck.mjs)
//
// ROUND 8 of brain/NEEDS_AND_LIMITS.md ("tune the rule's own parameters, and does it hold when the gauge noise changes?"), registered before this file existed. Searches brain/tunedRule.mjs's five parameters with the (1+1)-ES of Round 6, picks the champion on VALIDATION,
// flies the arms once on the three fresh audits and again under two other gauge noises, and reads the verdicts. THE AUDITS (481-552) ARE READ ONLY BY audits() and robustness(). Pure: no clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as R from "../../brain/residualAdvisor.mjs";
import * as U from "../../brain/tunedRule.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";
import { judge, verdictOf } from "./trainResidual.mjs";
import { constWeights } from "./constShift.mjs";
/** Flight options for every flight this library makes (the gate shortens the dives with { seconds } for the rows that do not depend on their length; the real runs never call this). */
let FLIGHT = {};
export const setFlight = (o) => { FLIGHT = { ...o }; };

export const RECIPE = Object.freeze({ runs: 3, iters: 300, sigma: 0.15, maxChange: 2, checkpointEvery: 30 });
export const SEARCH_BASE = 63000, CONST_SHIFT = 0.07, NOISES = Object.freeze([0.05, 0.2]);
export const TRAIN = T.setOf(T.KINDS, 241, 246), VALIDATION = T.setOf(T.KINDS, 271, 282);
export const AUDIT_RANGES = Object.freeze({ U1: [481, 492], U2: [521, 532], U3: [541, 552] }), AUDIT_NAMES = Object.freeze(["U1", "U2", "U3"]);
export const ARMS = Object.freeze(["ALONE", "RULE-GF", "CONST-TUNED", "TUNED-RULE", "RESIDUAL"]), ROBUST_ARMS = Object.freeze(["RULE-GF", "CONST-TUNED", "TUNED-RULE"]);
const brainSeat = (ctx) => T.ruleSeat("obs")(ctx), vet = (advisor) => A.advisedPilot(brainSeat, advisor, "VETO");

/** The pilot of one arm. `params` are the tuned parameters, `champion` the frozen Round 6 weights. */
export function pilotOf(arm, { params = null, champion = null } = {}) {
    if (arm === "ALONE") return T.GUARDED_OBS;
    if (arm === "RULE-GF") return vet(A.ADVISORS["GUARDED-FILTER"]);
    if (arm === "CONST-TUNED") return vet(R.residualSeat(constWeights(CONST_SHIFT)));
    if (arm === "TUNED-RULE") { if (!params) throw new Error("tuneRule.pilotOf: TUNED-RULE needs the parameters"); return vet(U.tunedSeat(params)); }
    if (arm === "RESIDUAL") { if (!champion) throw new Error("tuneRule.pilotOf: RESIDUAL needs the champion weights"); return vet(R.residualSeat(Float64Array.from(champion))); }
    throw new Error(`tuneRule.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
export const scoreOf = (arm, opts, set, gauge = T.GAUGE) => T.evaluate(pilotOf(arm, opts), set, { gauge, ...FLIGHT });

const gauss = (rng) => { let s = 0; for (let i = 0; i < 6; i++) s += rng(); return (s - 3) * Math.SQRT2; };
/** One search from the defaults; returns { seed, best, bestScore, trace, checkpoints: [{ iter, params, trainScore }] }. */
export function search(seed, recipe = RECIPE, trainSet = TRAIN) {
    const rng = mulberry(seed), ev = (p) => T.evaluate(vet(U.tunedSeat(p)), trainSet, { gauge: T.GAUGE, ...FLIGHT }).score;
    let best = U.normalise({}), bestScore = ev(best), held = bestScore;
    const trace = [bestScore], checkpoints = [{ iter: 0, params: { ...best }, trainScore: bestScore }];
    for (let it = 1; it <= recipe.iters; it++) {
        const child = { ...best }, k = 1 + Math.floor(rng() * recipe.maxChange);
        for (let j = 0; j < k; j++) { const name = U.NAMES[Math.floor(rng() * U.NAMES.length)], [lo, hi] = U.BOUNDS[name]; child[name] += recipe.sigma * (hi - lo) * gauss(rng); }
        const c = U.normalise(child), s = ev(c);
        if (s >= bestScore) { if (s > bestScore) bestScore = s; best = c; held = s; }
        trace.push(held);
        if (it % recipe.checkpointEvery === 0) checkpoints.push({ iter: it, params: { ...best }, trainScore: bestScore });
    }
    return { seed, best, bestScore, trace, checkpoints };
}
/** The champion: over every checkpoint of every search the best VALIDATION score; the defaults stand unless a checkpoint beats them there. */
export function champion(searches, validation = VALIDATION) {
    const sc = (p) => T.evaluate(vet(U.tunedSeat(p)), validation, { gauge: T.GAUGE, ...FLIGHT }).score, start = U.normalise({}), startScore = sc(start);
    let best = { params: start, validation: startScore, from: "defaults", iter: 0 };
    for (const s of searches) for (const c of s.checkpoints) { if (c.iter === 0) continue; const v = sc(c.params); if (v > best.validation) best = { params: U.normalise(c.params), validation: v, from: `search ${s.seed}`, iter: c.iter }; }
    return { ...best, startValidation: startScore };
}
/** THE AUDITS: every arm once on the three fresh sets at the training noise. */
export function audits(opts, { ranges = AUDIT_RANGES, kinds = T.KINDS } = {}) {
    const out = {};
    for (const n of AUDIT_NAMES) { const set = T.setOf(kinds, ranges[n][0], ranges[n][1]); out[n] = Object.fromEntries(ARMS.map((a) => [a, scoreOf(a, opts, set)])); }
    return out;
}
/** ROBUSTNESS: ROBUST_ARMS on the same three sets at each other noise (nothing re-tuned). Returns { [sd]: { U1: { arm: result } } }. */
export function robustness(opts, { ranges = AUDIT_RANGES, noises = NOISES, kinds = T.KINDS } = {}) {
    const out = {};
    for (const sd of noises) { out[sd] = {}; for (const n of AUDIT_NAMES) { const set = T.setOf(kinds, ranges[n][0], ranges[n][1]); out[sd][n] = Object.fromEntries(ROBUST_ARMS.map((a) => [a, scoreOf(a, opts, set, { ...T.GAUGE, sd })])); } }
    return out;
}
/** HOLDS iff the arm beats RULE-GF on all three audits at EVERY noise; BREAKS iff RULE-GF beats it on all three at ANY noise; else PARTLY. `rob` is robustness()'s result. */
export function holdsOf(rob, arm) {
    const per = Object.keys(rob).map((sd) => verdictOf(AUDIT_NAMES.map((n) => judge(rob[sd][n][arm], rob[sd][n]["RULE-GF"]))));
    return per.every((v) => v === "BEATS") ? "HOLDS" : per.some((v) => v === "LOSES") ? "BREAKS" : "PARTLY";
}
/** The reading of section 5 for question (a). */
export function jointLine(tunedVsConst, tunedVsRule) {
    if (tunedVsRule !== "BEATS") return "NOT ASSESSED (the tuned rule does not beat the original rule)";
    if (tunedVsConst === "BEATS") return "JOINT TUNING BEATS THE ONE NUMBER";
    if (tunedVsConst === "NONE") return "ONE NUMBER IS ENOUGH";
    return "MIXED";
}
export const noneOrMore = (js) => { const w = js.filter((j) => j.wins).length; return w === js.length ? "BEATS" : w === 0 ? "NONE" : "MIXED"; };

export function checksOf(au, { identityParams = {} } = {}) {
    const rows = [], one = [T.scenario(241, "far"), T.scenario(241, "both")];
    const a = scoreOf("TUNED-RULE", { params: identityParams }, one), b = scoreOf("RULE-GF", {}, one);
    rows.push({ name: "IDENTITY", ok: a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint), text: "the defaults equal RULE-GF dive for dive" });
    for (const n of AUDIT_NAMES) {
        const x = au[n], idx = x.ALONE.runs.map((r, i) => (r.kind === "far" || r.kind === "both" ? i : -1)).filter((i) => i >= 0), sub = (res) => ({ runs: idx.map((i) => res.runs[i]) }), j = judge(sub(x["RULE-GF"]), sub(x.ALONE));
        rows.push({ name: `RULE NOT TRIVIAL ${n}`, ok: j.wins, text: `RULE-GF beats ALONE on far and both on ${n} by ${j.diff.toFixed(3)} (margin ${j.margin.toFixed(3)})` });
    }
    return rows;
}
export function report(au, rob, champ, searches = []) {
    const L = [`ROUND 8: tune the rule's five parameters; noisy gauge sd 0.1, brain GUARDED-OBS, VETO; audits ${AUDIT_NAMES.map((n) => `${n} ${AUDIT_RANGES[n][0]}-${AUDIT_RANGES[n][1]}`).join(", ")} (48 dives each, read once)`];
    const pstr = (p) => U.NAMES.map((k) => `${k} ${Number(p[k]).toPrecision(3)}`).join(", ");
    L.push(`champion: ${champ.from}${champ.iter ? ` at iteration ${champ.iter}` : ""}: ${pstr(champ.params)}; validation ${champ.validation.toFixed(4)} against the defaults' ${champ.startValidation.toFixed(4)}; ${searches.length} searches; chosen BEFORE the audits were flown`);
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("means " + AUDIT_NAMES.join(" | "));
    for (const arm of ARMS) L.push(`  ${arm.padEnd(12)} ${AUDIT_NAMES.map((n) => au[n][arm].score.toFixed(3)).join(" | ")}   crushed ${AUDIT_NAMES.map((n) => au[n][arm].crashed).join("/")}  stranded ${AUDIT_NAMES.map((n) => au[n][arm].stranded).join("/")}`);
    for (const sd of Object.keys(rob)) { L.push(`robustness, gauge noise sd ${sd} (nothing re-tuned):`); for (const arm of ROBUST_ARMS) L.push(`  ${arm.padEnd(12)} ${AUDIT_NAMES.map((n) => rob[sd][n][arm].score.toFixed(3)).join(" | ")}`); }
    const v = (a, b) => AUDIT_NAMES.map((n) => judge(au[n][a], au[n][b])), show = (js) => js.map((j) => `${j.diff >= 0 ? "+" : ""}${j.diff.toFixed(3)} ${j.wins ? "WINS" : j.loses ? "LOSES" : "tie"}`).join(" | ");
    const tr = v("TUNED-RULE", "RULE-GF"), tc = v("TUNED-RULE", "CONST-TUNED"), cr = v("CONST-TUNED", "RULE-GF"), rt = v("TUNED-RULE", "RESIDUAL");
    L.push(`TUNED-RULE against RULE-GF: ${show(tr)} = ${verdictOf(tr)}`, `TUNED-RULE against CONST-TUNED: ${show(tc)} = ${verdictOf(tc)} (wins on ${tc.filter((j) => j.wins).length} of 3)`, `CONST-TUNED against RULE-GF: ${show(cr)} = ${verdictOf(cr)}`, `TUNED-RULE against RESIDUAL (reported): ${show(rt)}`);
    L.push(`QUESTION (a): ${bad.length ? "NOT WEIGHED (a check failed)" : jointLine(noneOrMore(tc), verdictOf(tr))}`);
    L.push(`QUESTION (b): TUNED-RULE ${bad.length ? "NOT WEIGHED" : holdsOf(rob, "TUNED-RULE")} under other gauge noise; CONST-TUNED ${bad.length ? "NOT WEIGHED" : holdsOf(rob, "CONST-TUNED")}`);
    return L;
}
