// WebGLEngine/tools/ship/flyMushroomLongRecover.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE RECOVERING FLY TRAINED FOUR TIMES LONGER, AS ARITHMETIC (registered in brain/FLY_MUSHROOM_LONG_RECOVER_WIP.md before this file existed): DOES IT REACH THE HAND RULE WHEN THE MEANINGS SWAP?
// The fly is the recovery round's (tools/ship/flyMushroomRecover.mjs, brain/rl/mushroomRecoverFly.mjs); the walk is the mushroom trainer round's LONG recipe (240 iterations, the best on the
// fixed 16); the tasks, teachers and audit are the mushroom round's. One new arm, 12 draws on each task:
//   RLONG  the recovering fly, 240 iterations: its first 60 iterations are the recovery round's RECOV walk
// weighed against RECOV (brain/flyMushroomRecoverRound.jsonl) and LONG (brain/flyMushroomTrainerRound.jsonl), as committed. Readings on each task: G (RLONG against RECOV draw for draw, an
// exact sign test of the differences), L (RLONG against LONG, an exact rank sum), H (RLONG against the hand rule committed for the task, a sign test: on REV the recovery round's with a
// recovery of 0.1, on ONE the mushroom round's); counted: USES and b at 0. The command is tools/ship/takeFlyMushroomLongRecover.mjs.
//
//   RECIPE, SEEDS, TASKS, AUDIT, ALPHA, USES_BY, ARMS, LEAD, WEIGHTS, RESULTS, RECOVER, RECOVER_SHA256, TRAINER, TRAINER_SHA256, FILES, WORDS
//   handOf(floors, task)               the hand rule H is read against: floors.handB.REV on REV, floors.hand.ONE on ONE
//   trainOne(task, s, recipe, audit)   { kind: "draw", task, arm: "RLONG", s, recipe, weightCount, weights, weightsHash, rate, recovery, ratesOff, score, keptAt, history }
//   floors(audit), fileOf(bytes), uses(r)
//   parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: { recover, trainer, mushroom }, each fileOf its committed file)
// NOT HERE: the 24 trainings (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { OdorEnv, TRIALS } from "../../brain/rl/odorEnv.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as M from "./flyMushroom.mjs";
import * as RC from "./flyMushroomRecover.mjs";
import * as MT from "./flyMushroomTrainer.mjs";

export const RECIPE = MT.RECIPES.LONG, SEEDS = M.SEEDS, TASKS = M.TASKS, AUDIT = M.AUDIT, ALPHA = M.ALPHA, USES_BY = M.USES_BY;
export const ARMS = Object.freeze(["RLONG"]), LEAD = "RLONG", WEIGHTS = RC.WEIGHTS;
export const RESULTS = "brain/flyMushroomLongRecoverRound.jsonl", RECOVER = RC.RESULTS, RECOVER_SHA256 = "f49dca61697f1407d5018cafc6835624fd832d0a761bcb51f037d10faea08eba";
export const TRAINER = MT.RESULTS, TRAINER_SHA256 = "b463b5117a486cfca539fd824e0a211c67f937b6a4d91e7ec7b23705fe79b293";
export const FILES = Object.freeze({ recover: RECOVER, trainer: TRAINER, mushroom: M.RESULTS });
const three = (a, b) => Object.freeze([`${a} DOES BETTER THAN ${b}`, `${a} DOES WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`]);
const RL = "THE RECOVERING FLY TRAINED FOUR TIMES LONGER";
export const WORDS = Object.freeze({ G: three(RL, "THE RECOVERY ROUND'S FLY"), L: three(RL, "THE MUSHROOM FLY TRAINED AS LONG WITHOUT RECOVERY"), H: three(RL, "THE RULE SET BY HAND") });

const sOk = (s, who) => { if (!Number.isInteger(s) || s < 1) throw new Error(`flyMushroomLongRecover.${who}: a draw is a whole number from 1 (got ${s})`); };
const tOk = (task, who) => { if (!TASKS.includes(task)) throw new Error(`flyMushroomLongRecover.${who}: the task is ONE or REV (got ${task})`); };
/** See the header. */
export function handOf(floors, task) { tOk(task, "handOf"); return task === "REV" ? floors.handB.REV : floors.hand.ONE; }
/** See the header: the recovery round's training with the long recipe, and the iteration it kept. */
export function trainOne(task, s, recipe = RECIPE, audit = AUDIT) {
    sOk(s, "trainOne"); tOk(task, "trainOne");
    let keptAt = -1, prev = -Infinity;
    const res = trainDockES({ envFactory: () => new OdorEnv({ task, nk: M.CIRCUIT.nk }), obsDim: 1, actDim: 1, maxSteps: TRIALS, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => RC.policyOf(s), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}),
        onIter: ({ it, bestScore }) => { if (bestScore > prev) { keptAt = it; prev = bestScore; } } });
    const fly = RC.policyOf(s).setParams(res.params);
    return { kind: "draw", task, arm: "RLONG", s, recipe: { ...recipe }, weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rate: fly.rate(), recovery: fly.recovery(), ratesOff: M.auditScore(RC.recoveryOff(s, res.params), task, audit), score: M.auditScore(fly, task, audit), keptAt, history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header: the recovery round's floors (they must be its to the bit). */
export function floors(audit = AUDIT) { return RC.floors(audit); }
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
const recovOf = (F, task, s) => F.recover.lines.find((r) => r && r.kind === "draw" && r.task === task && r.arm === "RECOV" && r.s === s) || null;
const longOf = (F, task, s) => F.trainer.lines.find((r) => r && r.kind === "draw" && r.task === task && r.arm === "LONG" && r.s === s) || null;
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.recover || F.recover.sha256 !== RECOVER_SHA256) bad.push(`the recovery round's file is not the one committed (sha256 ${RECOVER_SHA256.slice(0, 16)}...)`);
    else { const rb = RC.checkRecords(F.recover.lines, F.mushroom); if (rb.length) bad.push(`the recovery round's file fails its own checks: ${rb[0]}`); }
    if (!F || !F.trainer || F.trainer.sha256 !== TRAINER_SHA256) bad.push(`the mushroom trainer round's file is not the one committed (sha256 ${TRAINER_SHA256.slice(0, 16)}...)`);
    else { const tb = MT.checkRecords(F.trainer.lines, F.mushroom); if (tb.length) bad.push(`the mushroom trainer round's file fails its own checks: ${tb[0]}`); }
    if (bad.length) return bad;
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = `${r.task}/${r.s}`; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const t of TASKS) for (const s of SEEDS) { const c = seen.get(`${t}/${s}`) || 0; if (c !== 1) bad.push(`${t} RLONG draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== TASKS.length * SEEDS.length) bad.push(`${draws.length} draws (registered: ${TASKS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.task} ${r.arm} draw ${r.s}`;
        if (!TASKS.includes(r.task) || r.arm !== "RLONG" || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} was trained with another recipe`);
        if (r.weightCount !== WEIGHTS) bad.push(`${id} has ${r.weightCount} weights (the fly has ${WEIGHTS})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!fin(r.score) || !fin(r.ratesOff)) bad.push(`${id} has no score, or none with its recovery at 0`);
        if (!(fin(r.rate) && r.rate >= 0 && fin(r.recovery) && r.recovery >= 0)) bad.push(`${id}'s rates are not finite and 0 or more`);
        if (!(Number.isInteger(r.keptAt) && r.keptAt >= 0 && r.keptAt < RECIPE.iters)) bad.push(`${id} does not say which iteration it kept`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) { bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`); continue; }
        // the walk's first 60 iterations are RECOV's: the trainer's battery return at the iterations both histories hold (0 and 40) is the same to the bit
        const rc = recovOf(F, r.task, r.s), at = (h, it) => (h.find((x) => x.it === it) || {}).ret;
        if (!rc || ![0, 40].every((it) => at(r.history, it) !== undefined && at(r.history, it) === at(rc.history, it))) bad.push(`${id}'s walk does not start as its draw's RECOV walk`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.task === "REV" && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].task !== "REV" || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`REV ${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors"), rfl = F.recover.lines.find((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !TASKS.every((t) => fl[0].start && fin(fl[0].start[t]) && fl[0].hand && fin(fl[0].hand[t]) && fl[0].handB && fin(fl[0].handB[t]))) bad.push("the floors are not there once");
    else if (!rfl || !TASKS.every((t) => fl[0].start[t] === rfl.start[t] && fl[0].hand[t] === rfl.hand[t] && fl[0].handB[t] === rfl.handB[t])) bad.push("the floors are not the recovery round's to the bit: the fly, task or audit is not the same");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (w, better, worse) => (better ? w[0] : worse ? w[1] : w[2]);
/** See the header. RECOV and LONG are the committed rounds'; a failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), fl = lines.find((r) => r && r.kind === "floors") || null, out = { checks, floors: fl, tasks: {} };
    for (const task of TASKS) {
        const rl = lines.filter((r) => r && r.kind === "draw" && r.task === task).sort((a, b) => a.s - b.s), arms = {};
        const rc = F && F.recover ? SEEDS.map((s) => recovOf(F, task, s)).filter(Boolean) : [], lg = F && F.trainer ? SEEDS.map((s) => longOf(F, task, s)).filter(Boolean) : [];
        if (rl.length) arms.RLONG = { ...stats(rl.map((r) => r.score)), rate: rl.reduce((n, r) => n + r.rate, 0) / rl.length, recovery: rl.reduce((n, r) => n + r.recovery, 0) / rl.length, ratesOff: rl.reduce((n, r) => n + r.ratesOff, 0) / rl.length,
            uses: rl.filter(uses).length, bZero: rl.filter((r) => r.recovery === 0).length, keptAt: rl.map((r) => r.keptAt) };
        if (rc.length) arms.RECOV = { ...stats(rc.map((r) => r.score)), recovery: rc.reduce((n, r) => n + r.recovery, 0) / rc.length };
        if (lg.length) arms.LONG = { ...stats(lg.map((r) => r.score)), rate: lg.reduce((n, r) => n + r.rate, 0) / lg.length };
        const t = { arms, G: null, L: null, H: null };
        if (!checks.length) {
            const a = rl.map((r) => r.score), word = (name, better, worse) => pick(WORDS[name], better, worse);
            const d = SEEDS.map((s, i) => a[i] - rc[i].score), g = signTest(d, 0); t.G = { ...g, a: "RLONG", b: "RECOV", diffs: d, word: word("G", g.p <= ALPHA && g.above > g.below, g.p <= ALPHA && g.below > g.above) };
            const l = rankSum(a, lg.map((r) => r.score)); t.L = { ...l, a: "RLONG", b: "LONG", word: word("L", l.p <= ALPHA && l.pHigher < l.pLower, l.p <= ALPHA && l.pLower < l.pHigher) };
            const ref = handOf(fl, task), h = signTest(a, ref); t.H = { ...h, a: "RLONG", ref, word: word("H", h.p <= ALPHA && h.above > h.below, h.p <= ALPHA && h.below > h.above) };
        }
        out.tasks[task] = t;
    }
    return out;
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: both committed files as committed and passing their own checks; ${TASKS.length * SEEDS.length} draws, each once, the long recipe and the weight count, the iteration kept, every walk starting as its draw's RECOV walk; REV ${LEAD} draw ${FIRST} the same twice; the floors the recovery round's to the bit`);
    for (const task of TASKS) {
        const T = R.tasks[task]; out.push("", `${task} (the mean of 12 flies; ${AUDIT.length} audit lives; RECOV and LONG as committed):`);
        if (T.arms.RLONG) { const s = T.arms.RLONG; out.push(`  RLONG  ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${f(s.rate)} b ${f(s.recovery)} | USES ${s.uses} of ${s.n}, b at 0 in ${s.bZero} | with b at 0 ${f(s.ratesOff)} | kept at ${s.keptAt.join(" ")}`); }
        if (T.arms.RECOV) { const s = T.arms.RECOV; out.push(`  RECOV  ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | b ${f(s.recovery)}`); }
        if (T.arms.LONG) { const s = T.arms.LONG; out.push(`  LONG   ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${f(s.rate)}`); }
        if (R.floors) out.push(`  the start ${f(R.floors.start[task])}, the hand rule ${f(R.floors.hand[task])}, the hand rule with a recovery of 0.1 ${f(R.floors.handB[task])}`);
        if (T.G) out.push(`  G (RLONG against RECOV, draw for draw): above ${T.G.above}, below ${T.G.below}, ties ${T.G.ties}; exact two-sided p ${T.G.p.toExponential(3)}`, `    ${T.G.word}`);
        if (T.L) out.push(`  L (RLONG against LONG): RLONG's ranks sum to ${T.L.sumA} (the middle is ${T.L.n * (T.L.n + T.L.m + 1) / 2}), ties ${T.L.ties}; exact two-sided p ${T.L.p.toExponential(3)}`, `    ${T.L.word}`);
        if (T.H) out.push(`  H (RLONG against the hand rule ${f(T.H.ref)}): above ${T.H.above}, below ${T.H.below}, ties ${T.H.ties}; exact two-sided p ${T.H.p.toExponential(3)}`, `    ${T.H.word}`);
    }
    return out;
}
