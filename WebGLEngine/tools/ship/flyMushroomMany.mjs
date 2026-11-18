// WebGLEngine/tools/ship/flyMushroomMany.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// SEVERAL MEANINGS AT ONCE, AS ARITHMETIC (registered in brain/FLY_MUSHROOM_MANY_WIP.md before this file existed): DOES THE TEACHERS' PAIRING MATTER WHEN EIGHT ODOURS MUST BE KEPT APART?
// The task is brain/rl/manyPnOdorEnv.mjs (eight odours a life, half bad, 120 trials) on the real projection-neuron wiring (tools/ship/flyMushroomOdours.mjs's WIRING, read from
// vendor/male-cns/pn-kc-circuit.json); the fly, teachers, recipe and hand rule are the mushroom round's (tools/ship/flyMushroom.mjs). Two arms, 12 draws each:
//   PLASTIC  the real teachers
//   PFAM     the mushroom round's PFAM teachers (permuted among the output neurons, seed 6000 + draw)
// Readings: T2 (PLASTIC against PFAM), an exact rank sum; H (PLASTIC against the hand rule), a sign test; counted: USES (the score less the score with p_a at 0, above 0.01). Described: the
// rates, and the overlap of a life's odours' Kenyon-cell sets. The command is tools/ship/takeFlyMushroomMany.mjs.
//
//   RECIPE, SEEDS, ARMS, LEAD, AUDIT, ALPHA, USES_BY, N, RESULTS, MUSHROOM, MUSHROOM_SHA256, ODOURS, ODOURS_SHA256, FILES, WORDS
//   envOf(), flyOf(arm, s)
//   auditScore(fly, lives)              the mean return of a fly over lives of the eight-odour task on the real wiring
//   overlapOf(lives)                    the mean, over lives and ordered pairs of a life's odours, of the share of one odour's Kenyon cells the other makes fire too (without noise)
//   trainOne(arm, s, recipe, audit)     { kind: "draw", arm, s, recipe, teachHash, weightCount, weights, weightsHash, rate, ratesOff, score, history }
//   floors(audit)                       { kind: "floors", start, hand, overlap } -- the untrained fly, the hand rule and the odours' overlap on the audit
//   fileOf(bytes), uses(r), parseArgs(argv), checkRecords(lines, F, wiringSha), reading(lines, F), readingLines(R)   (F: { mushroom, odours }, each fileOf its committed file)
// NOT HERE: the 24 trainings (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { ManyPnOdorEnv, N_ODOURS, PER_ODOUR } from "../../brain/rl/manyPnOdorEnv.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as M from "./flyMushroom.mjs";
import * as O from "./flyMushroomOdours.mjs";

export const RECIPE = M.RECIPE, SEEDS = M.SEEDS, ALPHA = 0.01, USES_BY = M.USES_BY, N = N_ODOURS;
export const ARMS = Object.freeze(["PLASTIC", "PFAM"]), LEAD = "PLASTIC";
export const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 14000001 + 7919 * k));
export const RESULTS = "brain/flyMushroomManyRound.jsonl", MUSHROOM = M.RESULTS, MUSHROOM_SHA256 = O.MUSHROOM_SHA256, ODOURS = O.RESULTS, ODOURS_SHA256 = "d45d35df2f7ccbbf36b6a081bbc34a1353c1abf637dd14ca0651e5403bbdbbfd";
export const FILES = Object.freeze({ mushroom: MUSHROOM, odours: ODOURS });
const three = (a, b) => Object.freeze([`${a} LEARNS EIGHT ODOURS BETTER THAN ${b}`, `${a} LEARNS EIGHT ODOURS WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b} AT LEARNING EIGHT ODOURS`]);
const REAL = "THE FLY TAUGHT BY ITS REAL TEACHERS";
export const WORDS = Object.freeze({ T2: three(REAL, "ONE WHOSE TEACHERS ARE PERMUTED"), H: three(REAL, "THE RULE SET BY HAND") });

const armOk = (arm, s, who) => {
    if (!ARMS.includes(arm)) throw new Error(`flyMushroomMany.${who}: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyMushroomMany.${who}: a draw is a whole number from 1 (got ${s})`);
};
/** See the header: the eight-odour task on the real wiring. */
export function envOf() { const W = O.WIRING; return new ManyPnOdorEnv({ nk: W.nk, ng: W.ng, pnGlom: W.pnGlom, wiring: W.real, n: N }); }
/** See the header: the mushroom round's fly with the arm's teachers. */
export function flyOf(arm, s) { armOk(arm, s, "flyOf"); return M.policyOf(arm, s); }
/** See the header. */
export function auditScore(fly, lives = AUDIT) {
    const env = envOf(); let sum = 0;
    for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { const r = env.step(fly.act(o)); o = r.obs; done = r.done; } sum += env.ret; }
    return sum / lives.length;
}
/** See the header. */
export function overlapOf(lives = AUDIT) {
    const env = envOf(); let sum = 0, n = 0;
    for (const seed of lives) { env.reset(seed); const ks = env.odors.map((g) => env.kcsOf(g)), sets = ks.map((k) => new Set(k));
        for (let i = 0; i < ks.length; i++) for (let j = 0; j < ks.length; j++) if (i !== j) { let c = 0; for (const k of ks[i]) if (sets[j].has(k)) c++; sum += c / Math.max(1, ks[i].length); n++; } }
    return sum / n;
}
/** See the header. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    armOk(arm, s, "trainOne");
    const res = trainDockES({ envFactory: () => envOf(), obsDim: 1, actDim: 1, maxSteps: PER_ODOUR * N, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => flyOf(arm, s), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    const fly = flyOf(arm, s).setParams(res.params);
    return { kind: "draw", arm, s, recipe: { ...recipe }, teachHash: M.teachHash(M.teachFor(arm, s)), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rate: fly.rate(), ratesOff: auditScore(M.ratesOff(arm, s, res.params), audit), score: auditScore(fly, audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header. */
export function floors(audit = AUDIT) { return { kind: "floors", start: auditScore(M.policyOf("PLASTIC", 1), audit), hand: auditScore(M.policyOf("PLASTIC", 1).setParams(M.HAND), audit), overlap: overlapOf(audit) }; }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export const uses = (r) => r.score - r.ratesOff > USES_BY;
/** See the header. `job` takes a registered arm and draw only; `run` at least one process. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && ARMS.includes(rest[0]) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), FIRST = SEEDS[0], fin = (v) => Number.isFinite(v);
/** See the header. `wiringSha` is the vendored wiring's sha256 as read (a gate gives another to see the check fail). */
export function checkRecords(lines, F, wiringSha = O.WIRING.sha256) {
    const bad = [];
    if (wiringSha !== O.PNKC_SHA256) bad.push(`the vendored projection-neuron wiring is not the file committed (sha256 ${O.PNKC_SHA256.slice(0, 16)}...)`);
    if (!F || !F.mushroom || F.mushroom.sha256 !== MUSHROOM_SHA256) bad.push(`the mushroom round's file is not the one committed (sha256 ${MUSHROOM_SHA256.slice(0, 16)}...)`);
    else { const mb = M.checkRecords(F.mushroom.lines); if (mb.length) bad.push(`the mushroom round's file fails its own checks: ${mb[0]}`); }
    if (!F || !F.odours || F.odours.sha256 !== ODOURS_SHA256) bad.push(`the odour round's file is not the one committed (sha256 ${ODOURS_SHA256.slice(0, 16)}...)`);
    else if (F.mushroom) { const ob = O.checkRecords(F.odours.lines, F.mushroom, wiringSha); if (ob.length) bad.push(`the odour round's file fails its own checks: ${ob[0]}`); }
    if (bad.length) return bad;
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== ARMS.length * SEEDS.length) bad.push(`${draws.length} draws (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.arm} draw ${r.s}`;
        if (!ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} was trained with another recipe`);
        // the mushroom round's file passes its own checks above, and they hold its every record's teachers to teachFor: so teachFor's are its committed ones
        if (r.teachHash !== M.teachHash(M.teachFor(r.arm, r.s))) bad.push(`${id}'s teachers are not the mushroom round's ${r.arm} draw ${r.s}'s`);
        if (r.weightCount !== M.WEIGHTS[r.arm]) bad.push(`${id} has ${r.weightCount} weights (the fly has ${M.WEIGHTS[r.arm]})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!(fin(r.score) && r.score >= -1 && r.score <= 1)) bad.push(`${id} has no score from -1 to 1`);
        if (!(fin(r.rate) && r.rate >= 0)) bad.push(`${id}'s rate is not finite and 0 or more`);
        if (!fin(r.ratesOff)) bad.push(`${id} has no score with its rate at 0`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !fin(fl[0].start) || !fin(fl[0].hand) || !(fin(fl[0].overlap) && fl[0].overlap >= 0 && fl[0].overlap <= 1)) bad.push("the floors are not there once");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), draws = lines.filter((r) => r && r.kind === "draw"), fl = lines.find((r) => r && r.kind === "floors") || null;
    const of = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score), arms = {}, avg = (v, f) => v.reduce((n, r) => n + f(r), 0) / v.length;
    for (const arm of ARMS) { const v = of(arm); if (!v.length) continue; arms[arm] = { ...stats(scores(arm)), rate: avg(v, (r) => r.rate), uses: v.filter(uses).length, ratesOff: avg(v, (r) => r.ratesOff) };
        if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
    const out = { checks, arms, floors: fl, T2: null, H: null };
    if (checks.length) return out;
    const t = rankSum(scores(LEAD), scores("PFAM")), w = WORDS.T2; out.T2 = { ...t, a: LEAD, b: "PFAM", word: t.p <= ALPHA && t.pHigher < t.pLower ? w[0] : t.p <= ALPHA && t.pLower < t.pHigher ? w[1] : w[2] };
    const h = signTest(scores(LEAD), fl.hand), w2 = WORDS.H; out.H = { ...h, a: LEAD, ref: fl.hand, word: h.p <= ALPHA && h.above > h.below ? w2[0] : h.p <= ALPHA && h.below > h.above ? w2[1] : w2[2] };
    return out;
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: the vendored wiring and the mushroom and odour rounds' files as committed, both passing their own checks; ${ARMS.length * SEEDS.length} draws, each once, the registered recipe, the mushroom round's teachers, a score with the rate at 0 and a history in every record; ${LEAD} draw ${FIRST} the same twice; the floors there`);
    out.push("", `eight odours a life through the projection neurons (the mean of 12 flies; ${AUDIT.length} audit lives):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(8)} ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${f(s.rate)} | USES ${s.uses} of ${s.n} | with p_a at 0 ${f(s.ratesOff)}`);
    if (R.floors) out.push(`  the start ${f(R.floors.start)}, the hand rule ${f(R.floors.hand)}, the odours' Kenyon-cell overlap ${f(R.floors.overlap)}`);
    for (const [arm, a] of Object.entries(R.arms)) if (a.history) out.push(`  ${arm.padEnd(8)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
    if (R.T2) out.push("", `T2 (${R.T2.a} against ${R.T2.b}): ${R.T2.a}'s ranks sum to ${R.T2.sumA} (the middle is ${R.T2.n * (R.T2.n + R.T2.m + 1) / 2}), ties ${R.T2.ties}; exact two-sided p ${R.T2.p.toExponential(3)}`, `  ${R.T2.word}`);
    if (R.H) out.push("", `H (${R.H.a} against the hand rule ${f(R.H.ref)}): above ${R.H.above}, below ${R.H.below}, ties ${R.H.ties}; exact two-sided p ${R.H.p.toExponential(3)}`, `  ${R.H.word}`);
    return out;
}
