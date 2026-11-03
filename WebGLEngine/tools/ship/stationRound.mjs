// WebGLEngine/tools/ship/stationRound.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/stationRoundCmd.mjs; the gate is tools/ship/stationRound-selfcheck.mjs)
//
// ROUND 10 of brain/NEEDS_AND_LIMITS.md ("a situation-dependent residual on the tuned rule: which station next"), registered before this file existed. Trains brain/stationResidual.mjs's net with the (1+1)-ES of Round 6 on the hard kinds, picks the champion and the
// fixed-preference control on VALIDATION, flies the arms once on the fresh audits (far and both), flies the hindsight oracle as a reference, and reads the verdicts. THE AUDITS (641-744) ARE READ ONLY BY audits(). No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as S from "../../brain/stationResidual.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";
import { judge, verdictOf } from "./trainResidual.mjs";
/** Flight options for every flight this library makes (the gate shortens the dives with { seconds } for the rows that do not depend on their length; the real runs never call this). */
let FLIGHT = {};
export const setFlight = (o) => { FLIGHT = { ...o }; };

export const HARD = Object.freeze(["far", "both"]);
export const RECIPE = Object.freeze({ runs: 3, iters: 300, sigma: 0.3, maxK: 4, checkpointEvery: 30 });
export const SEARCH_BASE = 65000;
export const TRAIN = T.setOf(HARD, 241, 252), VALIDATION = T.setOf(HARD, 271, 294);
export const AUDIT_RANGES = Object.freeze({ X1: [641, 664], X2: [681, 704], X3: [721, 744] }), AUDIT_NAMES = Object.freeze(["X1", "X2", "X3"]);
export const ARMS = Object.freeze(["TUNED-R8", "STATION-RESIDUAL", "STATION-ZERO", "STATION-SHUFFLED", "CONST-LINEAR", "ORACLE-ORDER"]);
export const LIN_GRID = Object.freeze([-1, -0.5, 0, 0.5, 1].flatMap((a) => [-1, -0.5, 0, 0.5, 1].map((b) => ({ a, b }))));
const GAUGE = T.GAUGE;

/** The content control: the hidden units permuted among themselves (rows of W1 and their biases) while the output weights stay, so each output weight listens to the wrong unit. */
export function shuffled(w) {
    const out = Float64Array.from(w), n = S.N_HID;
    for (let j = 0; j < n; j++) { const to = (j + 1) % n; for (let i = 0; i < S.N_IN; i++) out[to * S.N_IN + i] = w[j * S.N_IN + i]; out[S.N_W1 + to] = w[S.N_W1 + j]; }
    return out;
}
/** The flyable pilot of one arm (not the oracle). `r8` the tuned rule's parameters, `weights` the champion's, `lin` the control's {a, b}. */
export function pilotOf(arm, { r8 = null, weights = null, lin = null } = {}) {
    if (!r8) throw new Error("stationRound.pilotOf: the tuned rule's parameters (r8) are needed");
    const fly = (choice) => T.flyDecision(S.stationSeat(r8, choice));
    if (arm === "TUNED-R8") return T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS));
    if (arm === "STATION-ZERO") return fly({ w: S.startWeights() });
    if (arm === "STATION-RESIDUAL") { if (!weights) throw new Error("stationRound.pilotOf: STATION-RESIDUAL needs the champion weights"); return fly({ w: Float64Array.from(weights) }); }
    if (arm === "STATION-SHUFFLED") { if (!weights) throw new Error("stationRound.pilotOf: STATION-SHUFFLED needs the champion weights"); return fly({ w: shuffled(Float64Array.from(weights)) }); }
    if (arm === "CONST-LINEAR") { if (!lin) throw new Error("stationRound.pilotOf: CONST-LINEAR needs its preference {a, b}"); return fly({ lin }); }
    throw new Error(`stationRound.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")}; the oracle is oracleRuns)`);
}
export const scoreOf = (arm, opts, set) => T.evaluate(pilotOf(arm, opts), set, { gauge: GAUGE, ...FLIGHT });

const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
/** The hindsight oracle for one dive: the tuned rule with its next station taken from a fixed visiting order (the first unvisited feasible one in the order), every order tried, nearest-first's own result included; the best run is kept. */
export function oracleRun(r8, sc) {
    const base = U.tunedSeat(r8, U.WIDE_BOUNDS), ordered = (order) => (ctx) => { const s = base(ctx); return (st, obs) => { const d = s(st, obs); if (!d.station) return d; const pick = order.map((i) => obs.stations[i]).find((q) => !q.visited && A.feasible(q, obs.r)); return { ...d, station: pick || null }; }; };
    let best = { kind: sc.kind, ...T.fly(T.flyDecision(base), sc, { gauge: GAUGE, ...FLIGHT }) };
    for (const p of perms(sc.stations.map((_, i) => i))) { const r = T.fly(T.flyDecision(ordered(p)), sc, { gauge: GAUGE, ...FLIGHT }); if (r.score > best.score) best = { kind: sc.kind, ...r }; }
    return best;
}
export function oracleRuns(r8, set) { const runs = set.map((sc) => oracleRun(r8, sc)); return { runs, score: runs.reduce((a, x) => a + x.score, 0) / runs.length, crashed: runs.filter((x) => x.crushed).length, stranded: runs.filter((x) => x.stranded).length }; }

const gauss = (rng) => { let s = 0; for (let i = 0; i < 6; i++) s += rng(); return (s - 3) * Math.SQRT2; };
/** One search from the zero start; returns { seed, best, bestScore, trace, checkpoints: [{ iter, weights, trainScore }] }. */
export function search(seed, r8, recipe = RECIPE, trainSet = TRAIN) {
    const rng = mulberry(seed), ev = (w) => T.evaluate(T.flyDecision(S.stationSeat(r8, { w })), trainSet, { gauge: GAUGE, ...FLIGHT }).score;
    let best = S.startWeights(), bestScore = ev(best), held = bestScore;
    const trace = [bestScore], checkpoints = [{ iter: 0, weights: Float64Array.from(best), trainScore: bestScore }];
    for (let it = 1; it <= recipe.iters; it++) {
        const child = Float64Array.from(best), k = 1 + Math.floor(rng() * recipe.maxK);
        for (let j = 0; j < k; j++) child[Math.floor(rng() * S.N_WEIGHTS)] += recipe.sigma * gauss(rng);
        const s = ev(child);
        if (s >= bestScore) { if (s > bestScore) bestScore = s; best = child; held = s; }
        trace.push(held);
        if (it % recipe.checkpointEvery === 0) checkpoints.push({ iter: it, weights: Float64Array.from(best), trainScore: bestScore });
    }
    return { seed, best, bestScore, trace, checkpoints };
}
/** The champion on VALIDATION: the start stands unless a checkpoint beats it there. */
export function champion(searches, r8, validation = VALIDATION) {
    const sc = (w) => T.evaluate(T.flyDecision(S.stationSeat(r8, { w })), validation, { gauge: GAUGE, ...FLIGHT }).score, start = S.startWeights(), startScore = sc(start);
    let best = { weights: start, validation: startScore, from: "start", iter: 0 };
    for (const s of searches) for (const c of s.checkpoints) { if (c.iter === 0) continue; const v = sc(Float64Array.from(c.weights)); if (v > best.validation) best = { weights: Float64Array.from(c.weights), validation: v, from: `search ${s.seed}`, iter: c.iter }; }
    return { ...best, startValidation: startScore };
}
/** The fixed-preference control: the {a, b} of the grid with the best VALIDATION mean, ties to the earlier grid entry. */
export function tuneLinear(r8, validation = VALIDATION, grid = LIN_GRID) {
    const curve = grid.map((lin) => ({ ...lin, score: T.evaluate(T.flyDecision(S.stationSeat(r8, { lin })), validation, { gauge: GAUGE, ...FLIGHT }).score }));
    let best = curve[0]; for (const c of curve) if (c.score > best.score) best = c;
    return { lin: { a: best.a, b: best.b }, validation: best.score, curve };
}
/** THE AUDITS: every arm once, the oracle too. */
export function audits(opts, { ranges = AUDIT_RANGES } = {}) {
    const out = {};
    for (const n of AUDIT_NAMES) { const set = T.setOf(HARD, ranges[n][0], ranges[n][1]); out[n] = Object.fromEntries(ARMS.filter((a) => a !== "ORACLE-ORDER").map((a) => [a, scoreOf(a, opts, set)])); out[n]["ORACLE-ORDER"] = oracleRuns(opts.r8, set); }
    return out;
}
/** Mean station switches per dive of the champion on `set` (reported). */
export function switchesOf(opts, set) {
    let total = 0;
    for (const sc of set) { let seat = null; T.fly((ctx) => T.flyDecision((c) => (seat = S.stationSeat(opts.r8, { w: Float64Array.from(opts.weights) })(c)))(ctx), sc, { gauge: GAUGE, ...FLIGHT }); total += seat.stats.switches; }
    return total / set.length;
}
export function bottomLine(vsStart, vsShuffled, vsConst) {
    if (vsStart === "LOSES") return "HURTS";
    if (vsStart === "BEATS") { if (vsConst !== "BEATS") return "A SIMPLE PREFERENCE EXPLAINS IT"; if (vsShuffled === "BEATS") return "A SITUATION-DEPENDENT RESIDUAL IMPROVES THE TUNED RULE"; }
    return "NO GAIN OVER THE TUNED RULE";
}
/** The share of the oracle gap closed: (a - base) / (oracle - base), or null when the oracle is no better than the base. */
export const gapShare = (a, base, oracle) => (oracle - base > 1e-9 ? (a - base) / (oracle - base) : null);

export function checksOf(au) {
    const rows = [];
    for (const n of AUDIT_NAMES) {
        const x = au[n], same = x["STATION-ZERO"].runs.every((r, i) => r.fingerprint === x["TUNED-R8"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${n}`, ok: same, text: `STATION-ZERO equals TUNED-R8 dive for dive on ${n}: ${same}` });
        const atLeast = x["ORACLE-ORDER"].runs.every((r, i) => r.score >= x["TUNED-R8"].runs[i].score - 1e-12);
        rows.push({ name: `ORACLE ${n}`, ok: atLeast, text: `the oracle is at least TUNED-R8 on every dive of ${n}: ${atLeast}` });
    }
    return rows;
}
export function report(au, champ, lin, searches = [], { switches = null } = {}) {
    const L = [`ROUND 10: a station-choice residual on the tuned rule, hard kinds (far, both), noisy gauge sd 0.1, no brain beside the seat; audits ${AUDIT_NAMES.map((n) => `${n} ${AUDIT_RANGES[n][0]}-${AUDIT_RANGES[n][1]}`).join(", ")} (48 dives each, read once)`];
    L.push(`champion: ${champ.from}${champ.iter ? ` at iteration ${champ.iter}` : ""}, validation ${champ.validation.toFixed(4)} against the start's ${champ.startValidation.toFixed(4)}; ${searches.length} searches; constant preference a ${lin.lin.a}, b ${lin.lin.b} (validation ${lin.validation.toFixed(4)}); both chosen BEFORE the audits were flown`);
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("means " + AUDIT_NAMES.join(" | "));
    for (const arm of ARMS) L.push(`  ${arm.padEnd(17)} ${AUDIT_NAMES.map((n) => au[n][arm].score.toFixed(3)).join(" | ")}   crushed ${AUDIT_NAMES.map((n) => au[n][arm].crashed).join("/")}  stranded ${AUDIT_NAMES.map((n) => au[n][arm].stranded).join("/")}`);
    const v = (a, b) => AUDIT_NAMES.map((n) => judge(au[n][a], au[n][b])), show = (js) => js.map((j) => `${j.diff >= 0 ? "+" : ""}${j.diff.toFixed(3)} ${j.wins ? "WINS" : j.loses ? "LOSES" : "tie"}`).join(" | ");
    const vs = v("STATION-RESIDUAL", "TUNED-R8"), vh = v("STATION-RESIDUAL", "STATION-SHUFFLED"), vc = v("STATION-RESIDUAL", "CONST-LINEAR"), cs = v("CONST-LINEAR", "TUNED-R8"), os = v("ORACLE-ORDER", "TUNED-R8");
    L.push(`RESIDUAL against TUNED-R8: ${show(vs)} = ${verdictOf(vs)}`, `RESIDUAL against SHUFFLED (reads its features): ${show(vh)} = ${verdictOf(vh)}`, `RESIDUAL against CONST-LINEAR (a fixed preference): ${show(vc)} = ${verdictOf(vc)}`, `CONST-LINEAR against TUNED-R8 (reported): ${show(cs)}`, `ORACLE-ORDER against TUNED-R8 (reported, it sees the future): ${show(os)}`);
    const shares = AUDIT_NAMES.map((n) => gapShare(au[n]["STATION-RESIDUAL"].score, au[n]["TUNED-R8"].score, au[n]["ORACLE-ORDER"].score));
    L.push(`share of the oracle gap closed by RESIDUAL: ${shares.map((s) => (s === null ? "n/a" : s.toFixed(2))).join(" | ")}`);
    if (switches !== null) L.push(`station switches per dive (champion): ${switches.toFixed(2)}`);
    L.push(`BOTTOM LINE: ${bad.length ? "NOT WEIGHED (a check failed)" : bottomLine(verdictOf(vs), verdictOf(vh), verdictOf(vc))}`);
    return L;
}
