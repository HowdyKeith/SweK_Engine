// WebGLEngine/tools/ship/trainResidual.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/trainResidualCmd.mjs; the gate is tools/ship/trainResidual-selfcheck.mjs)
//
// ROUND 6 of brain/NEEDS_AND_LIMITS.md ("a rule plus a LEARNED RESIDUAL in the advisor seat"), registered before this file existed. Trains brain/residualAdvisor.mjs with the (1+1)-ES of the other needs trainers, picks the champion on VALIDATION seeds, flies the arms once on the three
// fresh audits, and reads the verdicts by the registered margin rule. THE AUDITS (301-352) ARE READ ONLY BY audits(); training and validation use seeds 241-246 and 271-282.
// Pure apart from nothing: no clock, no Math.random, no file (the command reads and writes files).
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as R from "../../brain/residualAdvisor.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";

export const RECIPE = Object.freeze({ runs: 3, iters: 300, sigma: 0.3, maxK: 4, checkpointEvery: 30 });
export const SEARCH_BASE = 62000, MARGIN_MIN = 0.02, SD_FACTOR = 2;
export const TRAIN = T.setOf(T.KINDS, 241, 246), VALIDATION = T.setOf(T.KINDS, 271, 282);
export const AUDIT_RANGES = Object.freeze({ R1: [301, 312], R2: [321, 332], R3: [341, 352] }), AUDIT_NAMES = Object.freeze(["R1", "R2", "R3"]);
export const ARMS = Object.freeze(["ALONE", "CAP-0.50", "CAP-0.65", "CAP-0.75", "RULE-GF", "RULE-G", "RESIDUAL", "RESIDUAL-ZERO", "SHUFFLED-RESIDUAL"]);
export const CAPS = Object.freeze({ "CAP-0.50": 0.5, "CAP-0.65": 0.65, "CAP-0.75": 0.75 });
const GAUGE = T.GAUGE;

/** The brain of every arm. */
const brainSeat = (ctx) => T.ruleSeat("obs")(ctx);
const capSeat = (cap) => () => () => ({ surface: false, station: null, cap, pump: false, repair: false });
/** The pilot for one arm; `w` is the weight vector of the learned arms. */
export function pilotOf(arm, w = null) {
    if (arm === "ALONE") return T.GUARDED_OBS;
    const vet = (advisor) => A.advisedPilot(brainSeat, advisor, "VETO");
    if (CAPS[arm] !== undefined) return vet(capSeat(CAPS[arm]));
    if (arm === "RULE-GF") return vet(A.ADVISORS["GUARDED-FILTER"]);
    if (arm === "RULE-G") return vet(A.ADVISORS["GUARDED"]);
    if (arm === "RESIDUAL") return vet(R.residualSeat(w));
    if (arm === "RESIDUAL-ZERO") return vet(R.residualSeat(R.startWeights()));
    if (arm === "SHUFFLED-RESIDUAL") return vet(R.residualSeat(shuffled(w)));
    throw new Error(`trainResidual.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
/** The content control: the hidden layer's units permuted among themselves while the output weights stay where they are, so each output weight listens to the WRONG hidden unit. A residual that reads its features loses. */
export function shuffled(w) {
    const out = Float64Array.from(w), n = R.N_HID, perm = Array.from({ length: n }, (_, j) => (j + 1) % n);
    for (let j = 0; j < n; j++) { for (let i = 0; i < R.N_IN; i++) out[perm[j] * R.N_IN + i] = w[j * R.N_IN + i]; out[R.N_W1 + perm[j]] = w[R.N_W1 + j]; }
    return out;
}
export const scoreOn = (arm, w, set) => T.evaluate(pilotOf(arm, w), set, { gauge: GAUGE });

/** One search from the start weights; returns { seed, best, bestScore, checkpoints: [{ iter, weights, trainScore }], moved }. */
export function search(seed, recipe = RECIPE, trainSet = TRAIN) {
    const rng = mulberry(seed), ev = (w) => scoreOn("RESIDUAL", w, trainSet).score;
    let best = R.startWeights(), bestScore = ev(best);
    let held = bestScore; const trace = [bestScore], checkpoints = [{ iter: 0, weights: Float64Array.from(best), trainScore: bestScore }];
    for (let it = 1; it <= recipe.iters; it++) {
        const child = Float64Array.from(best), k = 1 + Math.floor(rng() * recipe.maxK);
        for (let j = 0; j < k; j++) { const idx = Math.floor(rng() * R.N_WEIGHTS); child[idx] += recipe.sigma * gauss(rng); }
        const s = ev(child);
        if (s >= bestScore) { if (s > bestScore) bestScore = s; best = child; held = s; }   // equal moves are kept (neutral drift), as in the other ES trainers
        trace.push(held);
        if (it % recipe.checkpointEvery === 0) checkpoints.push({ iter: it, weights: Float64Array.from(best), trainScore: bestScore });
    }
    const moved = best.reduce((a, x, i) => a + (x !== R.startWeights()[i] ? 1 : 0), 0);
    return { seed, best, bestScore, trace, checkpoints, moved };
}
const gauss = (rng) => { let s = 0; for (let i = 0; i < 6; i++) s += rng(); return (s - 3) * Math.SQRT2; };

/** The champion: over every checkpoint of every search, the best VALIDATION score; the start stands unless a checkpoint beats the start's validation score. Validation is not an audit. */
export function champion(searches, validation = VALIDATION) {
    const start = R.startWeights(), startScore = scoreOn("RESIDUAL", start, validation).score;
    let best = { weights: start, validation: startScore, from: "start", iter: 0 };
    for (const s of searches) for (const c of s.checkpoints) {
        const v = scoreOn("RESIDUAL", c.weights, validation).score;
        if (v > best.validation) best = { weights: c.weights, validation: v, from: `search ${s.seed}`, iter: c.iter };
    }
    return { ...best, startValidation: startScore };
}

/** The margin rule: a beats b on an audit iff the paired mean difference exceeds max(0.02, 2 se). */
export function judge(a, b) { const p = T.paired(a, b), m = Math.max(MARGIN_MIN, SD_FACTOR * p.se); return { diff: p.diff, se: p.se, margin: m, wins: p.diff > m, loses: p.diff < -m }; }
export const verdictOf = (js) => (js.every((j) => j.wins) ? "BEATS" : js.every((j) => j.loses) ? "LOSES" : "TIES");
/** The bottom line of section 6 from the three-audit verdicts. */
export function bottomLine(vsStart, vsShuffled) {
    if (vsStart === "LOSES") return "HURTS";
    if (vsStart === "BEATS" && vsShuffled === "BEATS") return "A LEARNED RESIDUAL IMPROVES THE RULE";
    return "NO GAIN OVER THE RULE";
}

/** THE AUDITS: flies every arm once on the three fresh sets. Only the champion's weights `w` reach them. */
export function audits(w, { ranges = AUDIT_RANGES } = {}) {
    const out = {};
    for (const name of AUDIT_NAMES) { const set = T.setOf(T.KINDS, ranges[name][0], ranges[name][1]); out[name] = Object.fromEntries(ARMS.map((arm) => [arm, scoreOn(arm, w, set)])); }
    return out;
}
export const strongestCap = (au) => Object.keys(CAPS).reduce((b, a) => (au[a].score > au[b].score ? a : b));

/** The checks of section 5 that need the audits (the identity and bounds are the gate's and the command's own). */
export function checksOf(au) {
    const rows = [];
    for (const name of AUDIT_NAMES) {
        const a = au[name], same = a["RESIDUAL-ZERO"].runs.every((r, i) => r.fingerprint === a["RULE-GF"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${name}`, ok: same, text: `RESIDUAL-ZERO equals RULE-GF dive for dive on ${name}: ${same}` });
        const idx = a.ALONE.runs.map((r, i) => (r.kind === "far" || r.kind === "both" ? i : -1)).filter((i) => i >= 0);
        const sub = (res) => ({ runs: idx.map((i) => res.runs[i]) }), j = judge(sub(a["RULE-GF"]), sub(a.ALONE));
        rows.push({ name: `RULE NOT TRIVIAL ${name}`, ok: j.wins, text: `RULE-GF beats ALONE on far and both on ${name} by ${j.diff.toFixed(3)} (margin ${j.margin.toFixed(3)})` });
    }
    return rows;
}

/** The report lines: checks first, then means, then the verdicts. */
export function report(au, champ, searches = []) {
    const L = [`ROUND 6: a rule plus a learned residual, noisy gauge, brain GUARDED-OBS, VETO; audits ${AUDIT_NAMES.map((n) => `${n} ${AUDIT_RANGES[n][0]}-${AUDIT_RANGES[n][1]}`).join(", ")} (48 dives each, read once)`];
    L.push(`champion: ${champ.from}${champ.iter ? ` at iteration ${champ.iter}` : ""}, validation ${champ.validation.toFixed(4)} against the start's ${champ.startValidation.toFixed(4)}; ${searches.length} searches; chosen BEFORE the audits were flown`);
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("means " + AUDIT_NAMES.join(" | "));
    for (const arm of ARMS) L.push(`  ${arm.padEnd(18)} ${AUDIT_NAMES.map((n) => au[n][arm].score.toFixed(3)).join(" | ")}   crushed ${AUDIT_NAMES.map((n) => au[n][arm].crashed).join("/")}  stranded ${AUDIT_NAMES.map((n) => au[n][arm].stranded).join("/")}`);
    const v = (a, bf) => AUDIT_NAMES.map((n) => judge(au[n][a], au[n][typeof bf === "function" ? bf(au[n]) : bf]));
    const show = (js) => js.map((j) => `${j.diff >= 0 ? "+" : ""}${j.diff.toFixed(3)} ${j.wins ? "WINS" : j.loses ? "LOSES" : "tie"}`).join(" | ");
    const vsStart = v("RESIDUAL", "RULE-GF"), vsCap = v("RESIDUAL", strongestCap), vsAlone = v("RESIDUAL", "ALONE"), vsShuf = v("RESIDUAL", "SHUFFLED-RESIDUAL");
    L.push(`RESIDUAL against its start RULE-GF: ${show(vsStart)} = ${verdictOf(vsStart)}`, `RESIDUAL against the strongest fixed cap (${AUDIT_NAMES.map((n) => strongestCap(au[n])).join(", ")}): ${show(vsCap)} = ${verdictOf(vsCap)}`, `RESIDUAL against ALONE: ${show(vsAlone)} = ${verdictOf(vsAlone)}`, `RESIDUAL against SHUFFLED-RESIDUAL (reads its features): ${show(vsShuf)} = ${verdictOf(vsShuf)}`);
    L.push(`BOTTOM LINE: ${bad.length ? "NOT WEIGHED (a check failed)" : bottomLine(verdictOf(vsStart), verdictOf(vsShuf))}`);
    return L;
}
