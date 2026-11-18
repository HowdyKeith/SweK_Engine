// WebGLEngine/tools/ship/flyMushroomRecover.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE MUSHROOM BODY RECOVERS, AS ARITHMETIC (registered in brain/FLY_MUSHROOM_RECOVER_WIP.md before this file existed): DOES A FLY THAT CAN UNDO ITS LESSONS DO BETTER WHEN THE MEANINGS SWAP?
// The fly is brain/rl/mushroomRecoverFly.mjs on the real teachers; the tasks, recipe, draws and audit are the mushroom round's (tools/ship/flyMushroom.mjs). One new arm, 12 draws on each task:
//   RECOV  the mushroom fly with a recovery rate it may learn (b = 0.05 max(0, p_b), starting at 0)
// weighed against PLASTIC, the mushroom round's as committed in brain/flyMushroomRound.jsonl. Readings on each task: R (RECOV against PLASTIC, exact rank sum), H (RECOV against the hand
// rule, sign test); counted: USES (the score less the score with p_b at 0, above 0.01) and how many flies end with b at 0. The command is tools/ship/takeFlyMushroomRecover.mjs.
//
//   RECIPE, SEEDS, TASKS, AUDIT, ALPHA, USES_BY, HAND (the mushroom round's), ARMS, LEAD, WEIGHTS, B_SCALE, HAND_B, RESULTS, MUSHROOM, MUSHROOM_SHA256, WORDS
//   policyOf(s), recoveryOff(s, weights), trainOne(task, s, recipe, audit), floors(audit), fileOf(bytes), uses(r)
//   parseArgs(argv), checkRecords(lines, mushroom), reading(lines, mushroom), readingLines(R)
// NOT HERE: the 24 trainings (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { OdorEnv, TRIALS } from "../../brain/rl/odorEnv.mjs";
import { MushroomRecoverFly, B_SCALE as BS } from "../../brain/rl/mushroomRecoverFly.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as M from "./flyMushroom.mjs";

export const RECIPE = M.RECIPE, SEEDS = M.SEEDS, TASKS = M.TASKS, AUDIT = M.AUDIT, ALPHA = M.ALPHA, USES_BY = M.USES_BY, HAND = M.HAND;
export const ARMS = Object.freeze(["RECOV"]), LEAD = "RECOV", WEIGHTS = M.CIRCUIT.nm + 3, B_SCALE = BS;
export const RESULTS = "brain/flyMushroomRecoverRound.jsonl", MUSHROOM = M.RESULTS, MUSHROOM_SHA256 = "b4d8db8d8139598765767921a7e43d97ec3e183889a929f4df60653f75e9cc31";
/** The hand rule with a recovery of 0.1 (described only). */
export const HAND_B = Object.freeze([...M.HAND, 0.1 / BS]);
const three = (a, b) => Object.freeze([`${a} DOES BETTER THAN ${b}`, `${a} DOES WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`]);
export const WORDS = Object.freeze({ R: three("THE FLY THAT CAN RECOVER", "THE MUSHROOM ROUND'S FLY"), H: three("THE FLY THAT CAN RECOVER", "THE RULE SET BY HAND") });

const sOk = (s, who) => { if (!Number.isInteger(s) || s < 1) throw new Error(`flyMushroomRecover.${who}: a draw is a whole number from 1 (got ${s})`); };
/** See the header: the fly on the real teachers. */
export function policyOf(s) { sOk(s, "policyOf"); return new MushroomRecoverFly({ nk: M.CIRCUIT.nk, nm: M.CIRCUIT.nm, edges: M.CIRCUIT.edges, teach: M.teachFor("PLASTIC", 1) }); }
/** See the header: the same weights with p_b at 0. */
export function recoveryOff(s, weights) { const w = Float32Array.from(weights); w[M.CIRCUIT.nm + 2] = 0; return policyOf(s).setParams(w); }
/** See the header. */
export function trainOne(task, s, recipe = RECIPE, audit = AUDIT) {
    sOk(s, "trainOne"); if (!TASKS.includes(task)) throw new Error(`flyMushroomRecover.trainOne: the task is ONE or REV (got ${task})`);
    const res = trainDockES({ envFactory: () => new OdorEnv({ task, nk: M.CIRCUIT.nk }), obsDim: 1, actDim: 1, maxSteps: TRIALS, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => policyOf(s), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    const fly = policyOf(s).setParams(res.params);
    return { kind: "draw", task, arm: "RECOV", s, recipe: { ...recipe }, weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rate: fly.rate(), recovery: fly.recovery(), ratesOff: M.auditScore(recoveryOff(s, res.params), task, audit), score: M.auditScore(fly, task, audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header: the untrained fly and the hand rule on each task (both must be the mushroom round's to the bit), and the hand rule with a recovery of 0.1. */
export function floors(audit = AUDIT) {
    const on = (f) => Object.fromEntries(TASKS.map((t) => [t, f(t)]));
    return { kind: "floors", start: on((t) => M.auditScore(policyOf(1), t, audit)), hand: on((t) => M.auditScore(policyOf(1).setParams([...HAND, 0]), t, audit)), handB: on((t) => M.auditScore(policyOf(1).setParams(HAND_B), t, audit)) };
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export const uses = (r) => Number.isFinite(r.ratesOff) && r.score - r.ratesOff > USES_BY;
/** See the header. `job` takes a registered task and draw only; `run` at least one process. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && TASKS.includes(rest[0]) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, task: rest[0], s: Number(rest[1]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), FIRST = SEEDS[0], fin = (v) => Number.isFinite(v);
/** See the header. `mushroom` is fileOf(the mushroom round's file). */
export function checkRecords(lines, mushroom) {
    const bad = [];
    if (!mushroom || mushroom.sha256 !== MUSHROOM_SHA256) bad.push(`the mushroom round's file is not the one committed (sha256 ${MUSHROOM_SHA256.slice(0, 16)}...)`);
    else { const mb = M.checkRecords(mushroom.lines); if (mb.length) bad.push(`the mushroom round's file fails its own checks: ${mb[0]}`); }
    if (bad.length) return bad;
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = `${r.task}/${r.s}`; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const t of TASKS) for (const s of SEEDS) { const c = seen.get(`${t}/${s}`) || 0; if (c !== 1) bad.push(`${t} RECOV draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== TASKS.length * SEEDS.length) bad.push(`${draws.length} draws (registered: ${TASKS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.task} ${r.arm} draw ${r.s}`;
        if (!TASKS.includes(r.task) || r.arm !== "RECOV" || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} was trained with another recipe`);
        if (r.weightCount !== WEIGHTS) bad.push(`${id} has ${r.weightCount} weights (the fly has ${WEIGHTS})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!fin(r.score)) bad.push(`${id} has no score`);
        if (!(fin(r.rate) && r.rate >= 0 && fin(r.recovery) && r.recovery >= 0)) bad.push(`${id}'s rates are not finite and 0 or more`);
        if (!fin(r.ratesOff)) bad.push(`${id} has no score with its recovery at 0`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.task === "REV" && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].task !== "REV" || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`REV ${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors"), mfl = mushroom.lines.find((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !TASKS.every((t) => fl[0].start && fin(fl[0].start[t]) && fl[0].hand && fin(fl[0].hand[t]) && fl[0].handB && fin(fl[0].handB[t]))) bad.push("the floors are not there once");
    else if (!mfl || !TASKS.every((t) => fl[0].start[t] === mfl.start[t] && fl[0].hand[t] === mfl.hand[t])) bad.push("the start and the hand rule are not the mushroom round's to the bit: the fly, task or audit is not the same");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
/** See the header. PLASTIC is the mushroom round's; a failed check leaves every reading null. */
export function reading(lines, mushroom) {
    const checks = checkRecords(lines, mushroom), fl = lines.find((r) => r && r.kind === "floors") || null, out = { checks, floors: fl, tasks: {} };
    for (const task of TASKS) {
        const rec = lines.filter((r) => r && r.kind === "draw" && r.task === task).sort((a, b) => a.s - b.s), pl = mushroom ? mushroom.lines.filter((r) => r && r.kind === "draw" && r.task === task && r.arm === "PLASTIC").sort((a, b) => a.s - b.s) : [];
        const arms = {};
        if (rec.length) arms.RECOV = { ...stats(rec.map((r) => r.score)), rate: rec.reduce((n, r) => n + r.rate, 0) / rec.length, recovery: rec.reduce((n, r) => n + r.recovery, 0) / rec.length, ratesOff: rec.reduce((n, r) => n + r.ratesOff, 0) / rec.length, uses: rec.filter(uses).length, bZero: rec.filter((r) => r.recovery === 0).length,
            history: rec.every((r) => Array.isArray(r.history) && r.history.length === rec[0].history.length) ? rec[0].history.map((h, k) => ({ it: h.it, ret: rec.reduce((n, r) => n + r.history[k].ret, 0) / rec.length })) : null };
        if (pl.length) arms.PLASTIC = { ...stats(pl.map((r) => r.score)), rate: pl.reduce((n, r) => n + r.rate, 0) / pl.length };
        const t = { arms, R: null, H: null };
        if (!checks.length) {
            const h = rankSum(rec.map((r) => r.score), pl.map((r) => r.score)), w = WORDS.R; t.R = { ...h, a: "RECOV", b: "PLASTIC", word: h.p <= ALPHA && h.pHigher < h.pLower ? w[0] : h.p <= ALPHA && h.pLower < h.pHigher ? w[1] : w[2] };
            const g = signTest(rec.map((r) => r.score), fl.hand[task]), w2 = WORDS.H; t.H = { ...g, a: "RECOV", ref: fl.hand[task], word: g.p <= ALPHA && g.above > g.below ? w2[0] : g.p <= ALPHA && g.below > g.above ? w2[1] : w2[2] };
        }
        out.tasks[task] = t;
    }
    return out;
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: the mushroom round's file as committed and passing its own checks; ${TASKS.length * SEEDS.length} draws, each once, the registered recipe and weight count, a score with the recovery at 0 for every fly, REV ${LEAD} draw ${FIRST} the same twice, and the start and the hand rule the mushroom round's to the bit`);
    for (const task of TASKS) {
        const T = R.tasks[task]; out.push("", `${task} (the mean of 12 flies; ${AUDIT.length} audit lives; PLASTIC is the mushroom round's as committed):`);
        if (T.arms.RECOV) { const s = T.arms.RECOV; out.push(`  RECOV    ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${f(s.rate)} b ${f(s.recovery)} | USES ${s.uses} of ${s.n}, b at 0 in ${s.bZero} | with b at 0 ${f(s.ratesOff)}`); }
        if (T.arms.PLASTIC) { const s = T.arms.PLASTIC; out.push(`  PLASTIC  ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${f(s.rate)}`); }
        if (R.floors) out.push(`  the start ${f(R.floors.start[task])}, the hand rule ${f(R.floors.hand[task])}, the hand rule with a recovery of 0.1 ${f(R.floors.handB[task])}`);
        if (T.arms.RECOV && T.arms.RECOV.history) out.push(`  RECOV    the trainer's own battery, mean return at iteration ${T.arms.RECOV.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
        if (T.R) out.push(`  R (RECOV against PLASTIC): RECOV's ranks sum to ${T.R.sumA} (the middle is ${T.R.n * (T.R.n + T.R.m + 1) / 2}), ties ${T.R.ties}; exact two-sided p ${T.R.p.toExponential(3)}`, `    ${T.R.word}`);
        if (T.H) out.push(`  H (RECOV against the hand rule ${f(T.H.ref)}): above ${T.H.above}, below ${T.H.below}, ties ${T.H.ties}; exact two-sided p ${T.H.p.toExponential(3)}`, `    ${T.H.word}`);
    }
    return out;
}
