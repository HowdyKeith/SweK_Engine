// WebGLEngine/tools/ship/flyMushroomTrainer.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE MUSHROOM TRAINER, AS ARITHMETIC (registered in brain/FLY_MUSHROOM_TRAINER_WIP.md before this file existed): IS THE MUSHROOM FLY'S SHORTFALL BELOW THE HAND RULE THE TRAINER'S CHOICE OF
// POINT, OR ITS WALK? The fly, tasks, recipe, draws and audit are the mushroom round's PLASTIC (tools/ship/flyMushroom.mjs). Two new arms, 12 draws each, on each task:
//   LONG   a walk of LONG_ITERS iterations (the recipe's 60 otherwise), the best on the fixed 16 kept: its first 60 iterations are the mushroom round's walk
//   BAT64  the recipe's 60 iterations, the best on 64 lives of the draw's own (seeds BAT_BASE + BAT_STEP s + 17 k): trainDockES's batteryEps and batteryBase
// weighed against KEEP16, the mushroom round's PLASTIC as committed in brain/flyMushroomRound.jsonl. Readings on each task (exact two-sided sign tests, ties against): G LONG against KEEP16
// and K BAT64 against KEEP16, draw for draw; HG and HK against the hand rule. The command is tools/ship/takeFlyMushroomTrainer.mjs.
//
//   RECIPE, SEEDS, TASKS, AUDIT, ALPHA, HAND (the mushroom round's), ARMS, LEAD, LONG_ITERS, RECIPES, RESULTS, MUSHROOM, MUSHROOM_SHA256, BAT_EPS, BAT_BASE, BAT_STEP, WORDS
//   batteryOf(arm, s), optionsOf(arm, s), trainOne(arm, task, s, recipe, audit), floors(audit), fileOf(bytes)
//   parseArgs(argv), checkRecords(lines, mushroom), reading(lines, mushroom), readingLines(R)
// NOT HERE: the 48 trainings (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { OdorEnv, TRIALS } from "../../brain/rl/odorEnv.mjs";
import { hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as M from "./flyMushroom.mjs";

export const RECIPE = M.RECIPE, SEEDS = M.SEEDS, TASKS = M.TASKS, AUDIT = M.AUDIT, ALPHA = M.ALPHA, HAND = M.HAND;
export const ARMS = Object.freeze(["LONG", "BAT64"]), LEAD = "LONG", LONG_ITERS = 240;
export const RECIPES = Object.freeze({ LONG: Object.freeze({ ...M.RECIPE, iters: LONG_ITERS }), BAT64: M.RECIPE });
export const RESULTS = "brain/flyMushroomTrainerRound.jsonl", MUSHROOM = M.RESULTS, MUSHROOM_SHA256 = "b4d8db8d8139598765767921a7e43d97ec3e183889a929f4df60653f75e9cc31";
export const BAT_EPS = 64, BAT_BASE = 70000000, BAT_STEP = 10007;
const three = (a, b) => Object.freeze([`${a} DOES BETTER THAN ${b}`, `${a} DOES WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`]);
const LW = "A WALK FOUR TIMES LONGER", B64 = "KEEPING THE BEST ON 64 LIVES OF THE DRAW'S OWN", HR = "THE RULE SET BY HAND";
export const WORDS = Object.freeze({ G: three(LW, "THE MUSHROOM ROUND'S WALK"), K: three(B64, "KEEPING THE BEST ON THE FIXED 16 LIVES"), HG: three(LW, HR), HK: three(B64, HR) });

const armOk = (arm, s, who) => {
    if (!ARMS.includes(arm)) throw new Error(`flyMushroomTrainer.${who}: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyMushroomTrainer.${who}: a draw is a whole number from 1 (got ${s})`);
};
/** See the header: the lives an arm keeps its point on (base null: the trainer's fixed 5000). */
export function batteryOf(arm, s) { armOk(arm, s, "batteryOf"); return arm === "BAT64" ? { eps: BAT_EPS, base: BAT_BASE + BAT_STEP * s } : { eps: RECIPE.battery, base: null }; }
/** See the header: the trainDockES options the arm adds to its recipe's. */
export function optionsOf(arm, s) { const b = batteryOf(arm, s); return arm === "BAT64" ? { batteryEps: b.eps, batteryBase: b.base } : {}; }
/** See the header. The fly is the mushroom round's PLASTIC; keptAt is the iteration whose point is handed back. */
export function trainOne(arm, task, s, recipe = RECIPES[arm], audit = AUDIT) {
    armOk(arm, s, "trainOne"); if (!TASKS.includes(task)) throw new Error(`flyMushroomTrainer.trainOne: the task is ONE or REV (got ${task})`);
    let keptAt = -1, prev = -Infinity;
    const res = trainDockES({ envFactory: () => new OdorEnv({ task, nk: M.CIRCUIT.nk }), obsDim: 1, actDim: 1, maxSteps: TRIALS, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => M.policyOf("PLASTIC", s), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}), ...optionsOf(arm, s),
        onIter: ({ it, bestScore }) => { if (bestScore > prev) { keptAt = it; prev = bestScore; } } });
    const fly = M.policyOf("PLASTIC", s).setParams(res.params);
    return { kind: "draw", task, arm, s, recipe: { ...recipe }, battery: batteryOf(arm, s), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rate: fly.rate(), keptAt, score: M.auditScore(fly, task, audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header: the start and the hand rule on each task, which must be the mushroom round's to the bit. */
export function floors(audit = AUDIT) { const f = M.floors(audit); return { kind: "floors", start: f.start, hand: f.hand }; }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. `job` takes a registered task, arm and draw only; `run` at least one process. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 3 && TASKS.includes(rest[0]) && ARMS.includes(rest[1]) && /^[1-9]\d*$/.test(rest[2]) && SEEDS.includes(Number(rest[2]))) return { cmd, task: rest[0], arm: rest[1], s: Number(rest[2]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), FIRST = SEEDS[0], fin = (v) => Number.isFinite(v);
const keepOf = (mushroom, task, s) => mushroom.lines.find((r) => r && r.kind === "draw" && r.task === task && r.arm === "PLASTIC" && r.s === s) || null;
/** See the header. `mushroom` is fileOf(the mushroom round's file). */
export function checkRecords(lines, mushroom) {
    const bad = [];
    if (!mushroom || mushroom.sha256 !== MUSHROOM_SHA256) bad.push(`the mushroom round's file is not the one committed (sha256 ${MUSHROOM_SHA256.slice(0, 16)}...)`);
    else { const mb = M.checkRecords(mushroom.lines); if (mb.length) bad.push(`the mushroom round's file fails its own checks: ${mb[0]}`); }
    if (bad.length) return bad;
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = `${r.task}/${r.arm}/${r.s}`; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const t of TASKS) for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(`${t}/${arm}/${s}`) || 0; if (c !== 1) bad.push(`${t} ${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== TASKS.length * ARMS.length * SEEDS.length) bad.push(`${draws.length} draws (registered: ${TASKS.length * ARMS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.task} ${r.arm} draw ${r.s}`;
        if (!TASKS.includes(r.task) || !ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        const rc = RECIPES[r.arm];
        if (!same(r.recipe, rc)) bad.push(`${id} was trained with another recipe`);
        if (!same(r.battery, batteryOf(r.arm, r.s))) bad.push(`${id} kept its point on other lives than its arm's`);
        if (r.weightCount !== M.WEIGHTS.PLASTIC) bad.push(`${id} has ${r.weightCount} weights (the fly has ${M.WEIGHTS.PLASTIC})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!fin(r.score)) bad.push(`${id} has no score`);
        if (!(fin(r.rate) && r.rate >= 0)) bad.push(`${id}'s rate is not finite and 0 or more`);
        if (!(Number.isInteger(r.keptAt) && r.keptAt >= 0 && r.keptAt < rc.iters)) bad.push(`${id} does not say which iteration it kept`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === rc.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${rc.iters - 1}`);
        else if (r.arm === "LONG") { const k = keepOf(mushroom, r.task, r.s); if (!k || !same(r.history[0], k.history[0])) bad.push(`${id}'s walk does not start as its draw's committed one`); }
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.task === "ONE" && r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].task !== "ONE" || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`ONE ${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors"), mfl = mushroom.lines.find((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !TASKS.every((t) => fl[0].start && fin(fl[0].start[t]) && fl[0].hand && fin(fl[0].hand[t]))) bad.push("the floors are not there once");
    else if (!mfl || !TASKS.every((t) => fl[0].start[t] === mfl.start[t] && fl[0].hand[t] === mfl.hand[t])) bad.push("the start and the hand rule are not the mushroom round's to the bit: the fly, task or audit is not the same");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (w, better, worse) => (better ? w[0] : worse ? w[1] : w[2]);
/** See the header. KEEP16 is the mushroom round's PLASTIC; a failed check leaves every reading null. */
export function reading(lines, mushroom) {
    const checks = checkRecords(lines, mushroom), fl = lines.find((r) => r && r.kind === "floors") || null, out = { checks, floors: fl, tasks: {} };
    for (const task of TASKS) {
        const all = [...lines.filter((r) => r && r.kind === "draw" && r.task === task), ...(mushroom ? mushroom.lines.filter((r) => r && r.kind === "draw" && r.task === task && r.arm === "PLASTIC").map((r) => ({ ...r, arm: "KEEP16" })) : [])];
        const of = (arm) => all.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score), arms = {};
        for (const arm of [...ARMS, "KEEP16"]) { const v = of(arm); if (!v.length) continue; arms[arm] = { ...stats(v.map((r) => r.score)), rate: v.reduce((n, r) => n + r.rate, 0) / v.length };
            if (v.every((r) => Number.isInteger(r.keptAt))) arms[arm].keptAt = v.map((r) => r.keptAt);
            if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
        const t = { arms, G: null, K: null, HG: null, HK: null };
        if (!checks.length) {
            const word = (name, h) => pick(WORDS[name], h.p <= ALPHA && h.above > h.below, h.p <= ALPHA && h.below > h.above);
            const paired = (name, arm) => { const d = SEEDS.map((s, i) => scores(arm)[i] - scores("KEEP16")[i]), h = signTest(d, 0); return { ...h, a: arm, b: "KEEP16", ref: 0, diffs: d, word: word(name, h) }; };
            const hand = (name, arm) => { const h = signTest(scores(arm), fl.hand[task]); return { ...h, a: arm, b: "the hand rule", ref: fl.hand[task], word: word(name, h) }; };
            Object.assign(t, { G: paired("G", "LONG"), K: paired("K", "BAT64"), HG: hand("HG", "LONG"), HK: hand("HK", "BAT64") });
        }
        out.tasks[task] = t;
    }
    return out;
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: the mushroom round's file as committed and passing its own checks; ${TASKS.length * ARMS.length * SEEDS.length} draws, each once, each arm's recipe, lives and weight count, the iteration kept, each LONG walk starting as its draw's committed one, ONE ${LEAD} draw ${FIRST} the same twice, and the start and the hand rule the mushroom round's to the bit`);
    for (const task of TASKS) {
        const T = R.tasks[task]; out.push("", `${task} (the mean of 12 flies; ${AUDIT.length} audit lives; KEEP16 is the mushroom round's PLASTIC as committed):`);
        for (const [arm, s] of Object.entries(T.arms)) out.push(`  ${arm.padEnd(7)} ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${f(s.rate)}${s.keptAt ? ` | kept at iterations ${s.keptAt.join(" ")}` : ""}`);
        if (R.floors) out.push(`  the start ${f(R.floors.start[task])}, the hand rule ${f(R.floors.hand[task])}`);
        for (const [arm, a] of Object.entries(T.arms)) if (a.history) out.push(`  ${arm.padEnd(7)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
        for (const name of ["G", "K", "HG", "HK"]) { const t = T[name]; if (t) out.push(`  ${name} (${t.a} against ${t.b}${t.ref === 0 ? ", draw for draw" : ` ${f(t.ref)}`}): above ${t.above}, below ${t.below}, ties ${t.ties} of ${t.n}; exact two-sided p ${t.p.toExponential(3)}`, `    ${t.word}`); }
    }
    return out;
}
