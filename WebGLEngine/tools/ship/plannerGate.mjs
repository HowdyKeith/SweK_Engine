// WebGLEngine/tools/ship/plannerGate.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerGateCmd.mjs; the gate is tools/ship/plannerGate-selfcheck.mjs)
//
// ROUND 21 of brain/NEEDS_AND_LIMITS.md ("can a rule on the scenario say when to plan?", registered before this file existed): a single-feature gate (plan iff feature >= c, or < c) fitted on the 1,056 far-and-both dives of
// Rounds 13-17 (twin and tuned rule under the same conditions) and judged ONCE on the 192 far-and-both dives of Round 20, which the fit never sees. The library reads no file; the command hands it the per-dive scores
// and rebuilds the scenarios. NO NEW DIVE. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";

export const SE_FACTOR = 2, KEEP_SHARE = 0.7, DECILES = Object.freeze([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
export const FEATURES = Object.freeze(["frac0", "damage0", "depth0", "kindIsBoth", "nearest", "farthest", "spread", "deepest", "unreachable"]);
/** Where the training dives live: the arm directory, the twin and tuned arm names and the sets with their seed ranges (far and both, 96 dives a set, kind-major). */
export const TRAIN = Object.freeze([
    Object.freeze({ round: "R13", dir: "tolerance-arms", twin: "TWIN-EXACT", tuned: "TUNED-R8", sets: Object.freeze({ V1: [1101, 1148], V2: [1161, 1208] }) }),
    Object.freeze({ round: "R14", dir: "budget-arms", twin: "TWIN-FULL", tuned: "TUNED-R8", sets: Object.freeze({ W1: [1221, 1268], W2: [1281, 1328] }) }),
    Object.freeze({ round: "R15", dir: "noise-arms", twin: "TWIN-FULL@0.1", tuned: "TUNED-R8@0.1", sets: Object.freeze({ U1: [1341, 1388], U2: [1401, 1448] }) }),
    Object.freeze({ round: "R16", dir: "stations-arms", twin: "TWIN-FULL@3", tuned: "TUNED-R8@3", sets: Object.freeze({ T1: [1461, 1508], T2: [1521, 1568] }) }),
    Object.freeze({ round: "R17", dir: "events-arms", twin: "TWIN-FULL", tuned: "TUNED-R8", sets: Object.freeze({ S1: [1601, 1648], S2: [1661, 1708], S3: [1721, 1768] }) }),
]);
/** The test dives: Round 20's two sets of all four kinds (kind-major); only far and both are used. */
export const TEST = Object.freeze({ round: "R20", dir: "easy-arms", twin: "TWIN-FULL", tuned: "TUNED-R8", sets: Object.freeze({ R1: [2201, 2248], R2: [2261, 2308] }), kinds: Object.freeze(T.KINDS), use: Object.freeze(["far", "both"]) });
export const TRAIN_COUNT = 1056, TEST_COUNT = 192;
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const seOf = (a) => { if (a.length < 2) return 0; const m = meanOf(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1) / a.length); };
/** A scenario's features. Distances are from the origin, where every dive starts. */
export function featuresOf(sc) {
    const d = sc.stations.map((q) => Math.hypot(q.x, q.y));
    let spread = 0; for (let i = 0; i < sc.stations.length; i++) for (let j = i + 1; j < sc.stations.length; j++) spread = Math.max(spread, Math.hypot(sc.stations[i].x - sc.stations[j].x, sc.stations[i].y - sc.stations[j].y));
    return { frac0: sc.frac0, damage0: sc.damage0, depth0: sc.depth0, kindIsBoth: sc.kind === "both" ? 1 : 0, nearest: Math.min(...d), farthest: Math.max(...d), spread, deepest: Math.max(...sc.stations.map((q) => q.depth)), unreachable: sc.stations.filter((q) => q.unreachable).length };
}
/** One row from a scenario and the twin's and the tuned rule's runs of it. */
export function rowOf(sc, twinRun, tunedRun) {
    if (twinRun.kind !== sc.kind || tunedRun.kind !== sc.kind) throw new Error(`plannerGate.rowOf: the runs are ${twinRun.kind}/${tunedRun.kind}, the scenario ${sc.kind}`);
    return { f: featuresOf(sc), twin: twinRun.score, tuned: tunedRun.score, gain: twinRun.score - tunedRun.score };
}
/** The decile cut points of a feature over rows: the distinct values at the nine deciles of the sorted feature (ties collapsed, ascending). */
export function cutsOf(rows, feature) {
    const v = rows.map((r) => r.f[feature]).sort((a, b) => a - b), cuts = [];
    for (const q of DECILES) { const c = v[Math.min(v.length - 1, Math.floor(q * v.length))]; if (!cuts.includes(c)) cuts.push(c); }
    return cuts;
}
/** Every candidate rule in the registered order: the two trivial ones, then for each feature (in FEATURES order) both directions of every cut. */
export function candidates(rows) {
    const out = [{ name: "always", trivial: true, plans: () => true }, { name: "never", trivial: true, plans: () => false }];
    for (const feature of FEATURES) for (const c of cutsOf(rows, feature)) for (const dir of [">=", "<"]) out.push({ name: `${feature} ${dir} ${+c.toPrecision(6)}`, feature, dir, cut: c, plans: (r) => (dir === ">=" ? r.f[feature] >= c : r.f[feature] < c) });
    return out;
}
export const gatedScore = (rule, r) => (rule.plans(r) ? r.twin : r.tuned);
/** The candidates scored on `rows`, best first; a tie goes to the earlier candidate. */
export function fit(rows) {
    const cs = candidates(rows).map((rule, order) => ({ rule, order, mean: meanOf(rows.map((r) => gatedScore(rule, r))), plans: rows.filter((r) => rule.plans(r)).length }));
    cs.sort((a, b) => (b.mean - a.mean > 1e-12 ? 1 : a.mean - b.mean > 1e-12 ? -1 : a.order - b.order));
    return cs;
}
/** The judgement of a rule on rows: gated minus always-twin, gated minus tuned, always-twin minus tuned (pooled means and se), the share that plans. */
export function judge(rule, rows) {
    const g = rows.map((r) => gatedScore(rule, r)), pair = (a) => ({ mean: meanOf(a), se: seOf(a) });
    return { n: rows.length, vsAlways: pair(rows.map((r, i) => g[i] - r.twin)), vsTuned: pair(rows.map((r, i) => g[i] - r.tuned)), alwaysVsTuned: pair(rows.map((r) => r.twin - r.tuned)), planShare: rows.length ? rows.filter((r) => rule.plans(r)).length / rows.length : 0 };
}
export const isReal = (p) => p.mean > 0 && p.mean > SE_FACTOR * p.se;
/** The correlation of a feature with the gain over rows (0 when either has no variance). */
export function correlation(rows, feature) {
    const x = rows.map((r) => r.f[feature]), y = rows.map((r) => r.gain), mx = meanOf(x), my = meanOf(y);
    const sxx = x.reduce((a, v) => a + (v - mx) ** 2, 0), syy = y.reduce((a, v) => a + (v - my) ** 2, 0), sxy = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0);
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
export function bottomLines(rule, testRows) {
    const j = judge(rule, testRows);
    const keeps = j.alwaysVsTuned.mean > 0 && j.vsTuned.mean >= KEEP_SHARE * j.alwaysVsTuned.mean;
    return [
        isReal(j.vsAlways) ? "A RULE ON THE SCENARIO IMPROVES ON ALWAYS PLANNING" : "NO RULE ON THE SCENARIO IMPROVES ON ALWAYS PLANNING",
        `${keeps ? "THE FITTED RULE KEEPS THE TWIN'S GAIN" : "THE FITTED RULE LOSES THE TWIN'S GAIN"} (it plans on ${(100 * j.planShare).toFixed(0)}% of the test dives)`,
    ];
}
export function checksOf(train, test) {
    return [
        { name: "TRAIN COUNT", ok: train.length === TRAIN_COUNT, text: `${train.length} training dives, ${TRAIN_COUNT} expected: ${train.length === TRAIN_COUNT}` },
        { name: "TEST COUNT", ok: test.length === TEST_COUNT, text: `${test.length} test dives, ${TEST_COUNT} expected: ${test.length === TEST_COUNT}` },
        { name: "FEATURES FINITE", ok: [...train, ...test].every((r) => FEATURES.every((f) => Number.isFinite(r.f[f]))) && [...train, ...test].every((r) => Number.isFinite(r.gain)), text: "every feature and gain is a finite number" },
    ];
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)})`;
export function report(train, test) {
    const L = [`ROUND 21: can a rule on the scenario say when to plan? fitted on ${train.length} dives of Rounds 13-17, judged once on ${test.length} far-and-both dives of Round 20; NO NEW DIVE`];
    const checks = checksOf(train, test), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const ranked = fit(train), best = ranked[0];
    const base = judge(candidates(train)[0], train);
    L.push(`training: always planning ${fmt(base.alwaysVsTuned)} over the tuned rule; the best five candidates (training gain over always planning, dives that plan):`);
    for (const c of ranked.slice(0, 5)) L.push(`  ${c.rule.name.padEnd(26)} ${(c.mean - meanOf(train.map((r) => r.twin))) >= 0 ? "+" : ""}${(c.mean - meanOf(train.map((r) => r.twin))).toFixed(4)}  plans on ${c.plans} of ${train.length}`);
    L.push("training correlation of each feature with the gain: " + FEATURES.map((f) => `${f} ${correlation(train, f).toFixed(3)}`).join(", "));
    const j = judge(best.rule, test), opt = fit(test)[0];
    L.push(`FITTED RULE: ${best.rule.name}`, `test: gated minus always-twin ${fmt(j.vsAlways)}; gated minus tuned ${fmt(j.vsTuned)}; always-twin minus tuned ${fmt(j.alwaysVsTuned)}; plans on ${(100 * j.planShare).toFixed(0)}% of the test dives`);
    const oj = judge(opt.rule, test);
    L.push(`optimistic bound (the same fit made ON the test dives): ${opt.rule.name}, gated minus always-twin ${fmt(oj.vsAlways)}`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(best.rule, test)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
