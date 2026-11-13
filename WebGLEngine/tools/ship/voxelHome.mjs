// WebGLEngine/tools/ship/voxelHome.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE VOXEL HOME, ROUND 1, AS ARITHMETIC (registered in brain/VOXEL_HOME_WIP.md before this file existed): how much of a home does a builder wired as the fruit fly's Giant Fiber Circuit learn to
// build on brain/rl/buildEnv.mjs, and does its wiring matter? Five arms -- FLY, SHUF, PLAIN, FISH (brain/rl/paintCircuitPolicy.mjs's CircuitPolicy) and MLP (brain/rl/dockPolicy.js's FlightPolicy) --
// each trained 16 times by trainDockES with the painting round's recipe, each draw scored on 200 plans no trainer sees. The test is the painting round's (tools/ship/paintingFly.mjs's exact
// rank-sum, gated there). The command is tools/ship/takeVoxelHome.mjs.
//
//   circuitOf(arm, s)            an arm's units and edges for draw s (PLAIN: 41 units, no edge; SHUF: the draw's own shuffle)
//   trainOne(arm, s, recipe)     one training: { kind: "draw", arm, s, recipe, units, edges, edgesHash, weightCount, weights, weightsHash, trainerBest, score (the mean share built), homes (of the audit's plans) }
//   auditScore(policy, seeds)    { score, homes }: the mean share of the plan built in the episode, and how many builds are homes (buildEnv's homeCheck)
//   floors()                     { kind: "floors", random: 16 random builders' scores, randomHomes, untrained: each arm's draw 1 before training }
//   parseArgs(argv)              the command's words, or null
//   checkRecords(lines)          the registration's checks: a list of failures, empty when they hold
//   reading(lines)               { checks, arms: { arm: { n, mean, sd, min, max, homes, bestHomes } }, T0, T1, T2 (each the rank-sum's numbers and `word`), floors }; with a failed check no test is made
//   readingLines(R)              the reading in lines a person reads
//
// NOT HERE: the 80 trainings (the command runs them; tools/ship/voxelHome-selfcheck.mjs never does). Pure but for what trainOne costs.
"use strict";
import { trainDockES, FlightPolicy } from "../../brain/rl/dockPolicy.js";
import { BuildEnv, OBS_DIM, ACT_DIM, homeCheck } from "../../brain/rl/buildEnv.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights, hashEdges } from "./paintingFly.mjs";

export const RECIPE = Object.freeze({ maxSteps: 96, iters: 150, pop: 24, sigma: 0.14, lr: 0.05, trainEps: 8 });
export const SEEDS = Object.freeze(Array.from({ length: 16 }, (_, k) => k + 1));
export const ARMS = Object.freeze(["FLY", "SHUF", "PLAIN", "FISH", "MLP"]);
export const MLP_HIDDEN = Object.freeze([16, 16]), PLAIN_UNITS = 41;
export const WEIGHTS = Object.freeze({ FLY: 1777, SHUF: 1777, PLAIN: 1765, FISH: 1617, MLP: 962 });
export const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 700001 + 7919 * k));
export const RANDOM_SEEDS = Object.freeze(Array.from({ length: 16 }, (_, k) => 1000 + 7919 * k));
export const ALPHA = 0.01;
export const RESULTS = "brain/voxelHomeRound.jsonl";

/** See the header. */
export function circuitOf(arm, s) {
    if (arm === "PLAIN") return { units: PLAIN_UNITS, edges: [] };
    if (arm === "FLY" || arm === "SHUF" || arm === "FISH") return P.ARMS[arm](s);
    throw new Error(`voxelHome.circuitOf: no circuit arm ${arm} (FLY, SHUF, PLAIN, FISH)`);
}
const factoryOf = (arm, s) => { const c = circuitOf(arm, s); return ({ obsDim, actDim, seed } = {}) => new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed: seed ?? 1234 }); };
/** An arm's untrained builder for draw s. */
export function policyOf(arm, s) {
    if (!ARMS.includes(arm)) throw new Error(`voxelHome.policyOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    return arm === "MLP" ? new FlightPolicy({ hidden: [...MLP_HIDDEN], obsDim: OBS_DIM, actDim: ACT_DIM, seed: s }) : factoryOf(arm, s)({ obsDim: OBS_DIM, actDim: ACT_DIM, seed: s });
}

/** See the header. A policy is anything with act(obs). */
export function auditScore(policy, seeds = AUDIT, maxSteps = RECIPE.maxSteps) {
    const env = new BuildEnv({ maxSteps }); let sum = 0, homes = 0;
    for (const seed of seeds) { let o = env.reset(seed), done = false; while (!done) { const r = env.step(policy.act(o)); o = r.obs; done = r.done; } sum += 1 - env.missing(); if (homeCheck(env.world, env.plan, env.at).home) homes++; }
    return { score: sum / seeds.length, homes };
}

/** See the header. `recipe` and `audit` are the registration's unless a gate hands in its own; `auditOf` is auditScore unless a gate hands in one whose answer it knows. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT, auditOf = auditScore) {
    if (!Number.isInteger(s) || s < 1) throw new Error(`voxelHome.trainOne: a draw is a whole number from 1 (got ${s})`);
    const base = policyOf(arm, s), circuit = arm === "MLP" ? null : circuitOf(arm, s);
    const res = trainDockES({ envFactory: (o = {}) => new BuildEnv({ maxSteps: recipe.maxSteps, ...o }), obsDim: OBS_DIM, actDim: ACT_DIM, maxSteps: recipe.maxSteps, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        ...(arm === "MLP" ? { hidden: [...MLP_HIDDEN] } : { policyFactory: factoryOf(arm, s) }) });
    base.setParams(res.params);
    const a = auditOf(base, audit, recipe.maxSteps);
    return { kind: "draw", arm, s, recipe: { ...recipe }, units: circuit ? circuit.units : null, edges: circuit ? circuit.edges.length : null, edgesHash: circuit ? hashEdges(circuit.edges) : null,
        weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params), trainerBest: res.best, score: a.score, homes: a.homes };
}

const lcg = (s) => { let x = s >>> 0 || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };
/** See the header. */
export function floors(audit = AUDIT, maxSteps = RECIPE.maxSteps, randomSeeds = RANDOM_SEEDS) {
    const random = [], randomHomes = [];
    for (const seed of randomSeeds) { const r = lcg(seed), a = auditScore({ act: () => [r() * 2 - 1, r() * 2 - 1] }, audit, maxSteps); random.push(a.score); randomHomes.push(a.homes); }
    const untrained = {}; for (const arm of ARMS) untrained[arm] = auditScore(policyOf(arm, 1), audit, maxSteps).score;
    return { kind: "floors", random, randomHomes, untrained };
}

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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** See the header. */
export function checkRecords(lines) {
    const bad = [], draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== ARMS.length * SEEDS.length) bad.push(`${draws.length} draws (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.arm} draw ${r.s}`;
        if (!ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} was trained with another recipe`);
        if (r.weightCount !== WEIGHTS[r.arm]) bad.push(`${id} has ${r.weightCount} weights (its arm has ${WEIGHTS[r.arm]})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!Number.isFinite(r.score) || r.score < 0 || r.score > 1) bad.push(`${id} has no score that is a share`);
        if (!Number.isInteger(r.homes) || r.homes < 0 || r.homes > AUDIT.length) bad.push(`${id} has no count of homes`);
        if (r.arm !== "MLP") {
            const c = circuitOf(r.arm, r.s);
            if (r.edgesHash !== hashEdges(c.edges) || r.edges !== c.edges.length || r.units !== c.units) bad.push(`${id}'s wiring is not its arm's`);
            if (r.arm === "SHUF") {
                const set = new Set(c.edges.map((e) => e[0] * c.units + e[1]));
                if (c.edges.length !== 313 || set.size !== 313 || c.edges.some((e) => e[0] === e[1])) bad.push(`${id}'s shuffle is not 313 distinct off-diagonal pairs`);
                if (r.edgesHash === hashEdges(P.ARMS.FLY().edges)) bad.push(`${id}'s shuffle is the fly's own wiring`);
            }
        }
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), fly1 = draws.find((r) => r.arm === "FLY" && r.s === 1);
    if (re.length !== 1 || !fly1 || re[0].arm !== "FLY" || re[0].s !== 1 || re[0].weightsHash !== fly1.weightsHash) bad.push("FLY draw 1 trained a second time is not there once with the same weights");
    const fl = lines.filter((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !Array.isArray(fl[0].random) || fl[0].random.length !== RANDOM_SEEDS.length || !fl[0].random.every(Number.isFinite) || !fl[0].untrained || !ARMS.every((a) => Number.isFinite(fl[0].untrained[a]))) bad.push("the 16 random builders and the untrained draws are not there once");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const word3 = (t, better, worse, apart, alpha = ALPHA) => (t.p <= alpha && t.pHigher < t.pLower ? better : t.p <= alpha && t.pLower < t.pHigher ? worse : apart);
/** The registered words of the three tests. */
export const WORDS = Object.freeze({
    T0: ["A FLY-WIRED BUILDER BUILDS MORE OF A HOME THAN A RANDOM ONE", "A FLY-WIRED BUILDER BUILDS LESS OF A HOME THAN A RANDOM ONE", "A FLY-WIRED BUILDER CANNOT BE TOLD APART FROM A RANDOM ONE"],
    T1: ["THE FLY'S WIRING BUILDS BETTER THAN A SHUFFLE OF IT", "THE FLY'S WIRING BUILDS WORSE THAN A SHUFFLE OF IT", "THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT"],
    T2: ["THE FLY'S WIRING BUILDS BETTER THAN A PLAIN NET OF ITS SIZE", "THE FLY'S WIRING BUILDS WORSE THAN A PLAIN NET OF ITS SIZE", "THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE"],
});
/** See the header. */
export function reading(lines) {
    const checks = checkRecords(lines), draws = lines.filter((r) => r && r.kind === "draw"), of = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score);
    const arms = {}; for (const arm of ARMS) { const v = of(arm); if (v.length) arms[arm] = { ...stats(v.map((r) => r.score)), homes: v.reduce((a, r) => a + (r.homes || 0), 0), bestHomes: Math.max(...v.map((r) => r.homes || 0)) }; }
    const fl = lines.find((r) => r && r.kind === "floors") || null;
    if (checks.length) return { checks, arms, T0: null, T1: null, T2: null, floors: fl };
    const mk = (name, other) => { const t = rankSum(scores("FLY"), other); return { ...t, word: word3(t, ...WORDS[name]) }; };
    return { checks, arms, T0: mk("T0", fl.random), T1: mk("T1", scores("SHUF")), T2: mk("T2", scores("PLAIN")), floors: fl };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push("the checks hold: 80 draws, each once, the registered recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the floors");
    out.push("", "arm     n   mean    sd      least   most    homes (of 16 x 200)  best draw's homes");
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(7)} ${String(s.n).padStart(2)}  ${f(s.mean)}  ${f(s.sd)}  ${f(s.min)}  ${f(s.max)}  ${String(s.homes).padStart(6)}               ${s.bestHomes}`);
    if (R.floors) { const r = stats(R.floors.random); out.push("", `16 random builders: ${f(r.mean)} +/- ${f(r.sd)}, homes ${R.floors.randomHomes.reduce((a, b) => a + b, 0)}; the rule: 1.0000, every plan a home`, `untrained draw 1: ${Object.entries(R.floors.untrained).map(([a, v]) => `${a} ${f(v)}`).join(", ")}`); }
    for (const [name, t] of [["T0 (FLY against 16 random builders)", R.T0], ["T1 (FLY against SHUF)", R.T1], ["T2 (FLY against PLAIN)", R.T2]]) if (t) out.push("", `${name}: the fly's ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`);
    return out;
}
