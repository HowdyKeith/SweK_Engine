// WebGLEngine/tools/ship/paintingFly.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE PAINTING FLY, ROUND 1, AS ARITHMETIC (registered in brain/PAINTING_FLY_WIP.md before this file existed): does the fruit fly's wiring paint differently from a shuffle of it, or from a plain net of
// its size? Five arms -- FLY, SHUF, PLAIN, FISH (brain/rl/paintCircuitPolicy.mjs) and MLP (the tree's own painter, brain/rl/dockPolicy.js's FlightPolicy) -- each trained 16 times by trainDockES on
// brain/rl/paintEnv.js with the recipe tools/ship/primitiveFit-selfcheck.mjs section 8 already used, each draw scored on 200 pictures no trainer sees. The command is tools/ship/takePaintingFly.mjs.
//
//   trainOne(arm, s, recipe)     one training: { kind: "draw", arm, s, recipe, units, edges, edgesHash, weightCount, weights (base64 of the float32s), weightsHash, trainerBest, score, scoreFrac }
//   auditScore(policy, seeds)    { score: the mean of (distance at the start - distance after the episode), frac: the mean of that over the start }
//   rankSum(A, B)                the exact two-sided rank-sum test, a tie between the arms counted AGAINST each claim: { sumA, sumALow, sumAHigh, pHigher, pLower, p, ties }
//   floors()                     what the arms are described beside: eight random painters, the random search at 90 evaluations a shape, each arm's untrained draw 1
//   checkRecords(lines)          the registration's checks on a results file's records: a list of failures, empty when they hold
//   parseArgs(argv)             the command's words, or null for what it does not know: { cmd: "run", jobs } | { cmd: "read" } | { cmd: "job", arm, s }
//   reading(lines)               { checks, arms: { arm: { n, mean, sd, min, max } }, T1, T2 (each { p, word, ... }), floors }
//
// NOT HERE: the 80 trainings (the command runs them; tools/ship/paintingFly-selfcheck.mjs never does, and trains only at a recipe of its own on seeds the round does not use). Pure but for what
// trainOne costs: no I/O, no clock in any result, no Math.random.
"use strict";
import { createHash } from "node:crypto";
import { trainDockES, FlightPolicy } from "../../brain/rl/dockPolicy.js";
import { PaintEnv, OBS_DIM, ACT_DIM } from "../../brain/rl/paintEnv.js";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import { fitStep, drawShape } from "../../fx/primitiveFit.mjs";

export const RECIPE = Object.freeze({ maxSteps: 20, iters: 150, pop: 24, sigma: 0.14, lr: 0.05, trainEps: 8 });
export const SEEDS = Object.freeze(Array.from({ length: 16 }, (_, k) => k + 1));
export const ARMS = Object.freeze(["FLY", "SHUF", "PLAIN", "FISH", "MLP"]);
export const MLP_HIDDEN = Object.freeze([16, 16]);
export const WEIGHTS = Object.freeze({ FLY: 1202, SHUF: 1202, PLAIN: 1201, FISH: 1042, MLP: 693 });
export const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 700001 + 7919 * k));
export const ALPHA = 0.01;
export const RESULTS = "brain/paintingFlyRound.jsonl";

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
export const hashWeights = (w) => sha(Buffer.from(w.buffer, w.byteOffset, w.byteLength));
export const packWeights = (w) => Buffer.from(w.buffer, w.byteOffset, w.byteLength).toString("base64");
export function unpackWeights(b64) { const b = Buffer.from(b64, "base64"); if (b.length % 4) throw new Error("paintingFly.unpackWeights: not a whole number of float32s"); const out = new Float32Array(b.length / 4); for (let i = 0; i < out.length; i++) out[i] = b.readFloatLE(i * 4); return out; }
export const hashEdges = (edges) => sha(JSON.stringify(edges));

const envOf = (recipe) => (o = {}) => new PaintEnv({ maxSteps: recipe.maxSteps, ...o });
/** An arm's untrained policy for draw s (a circuit arm's wiring is the draw's; the MLP is FlightPolicy 20-16-16-5). */
export function policyOf(arm, s) {
    if (!ARMS.includes(arm)) throw new Error(`paintingFly.policyOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    return arm === "MLP" ? new FlightPolicy({ hidden: [...MLP_HIDDEN], obsDim: OBS_DIM, actDim: ACT_DIM, seed: s }) : P.painterFactory(arm, s)({ obsDim: OBS_DIM, actDim: ACT_DIM, seed: s });
}

/** See the header. A policy is anything with act(obs). */
export function auditScore(policy, seeds = AUDIT, maxSteps = RECIPE.maxSteps) {
    const env = new PaintEnv({ maxSteps }); let sum = 0, frac = 0;
    for (const seed of seeds) { let o = env.reset(seed); for (let t = 0; t < maxSteps; t++) o = env.step(policy.act(o)).obs; const d = env.startDistance - env.distance(); sum += d; frac += env.startDistance > 0 ? d / env.startDistance : 0; }
    return { score: sum / seeds.length, frac: frac / seeds.length };
}

/** See the header. `recipe` and `audit` are the registration's unless a gate hands in its own. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    if (!Number.isInteger(s) || s < 1) throw new Error(`paintingFly.trainOne: a draw is a whole number from 1 (got ${s})`);
    const base = policyOf(arm, s), circuit = arm === "MLP" ? null : P.ARMS[arm](s);
    const res = trainDockES({ envFactory: envOf(recipe), obsDim: OBS_DIM, actDim: ACT_DIM, maxSteps: recipe.maxSteps, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        ...(arm === "MLP" ? { hidden: [...MLP_HIDDEN] } : { policyFactory: P.painterFactory(arm, s) }) });
    base.setParams(res.params);
    const a = auditScore(base, audit, recipe.maxSteps);
    return { kind: "draw", arm, s, recipe: { ...recipe }, units: circuit ? circuit.units : null, edges: circuit ? circuit.edges.length : null, edgesHash: circuit ? hashEdges(circuit.edges) : null,
        weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params), trainerBest: res.best, score: a.score, scoreFrac: a.frac };
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

// ---- the exact rank-sum test -------------------------------------------------------------------------------------------------------------------------------------
const COUNTS = new Map();
/** How many ways n of the ranks 1..N sum to each value: an array indexed by the sum (BigInt counts). */
export function rankSumCounts(n, N) {
    const key = n + "/" + N; if (COUNTS.has(key)) return COUNTS.get(key);
    const top = N * (N + 1) / 2, dp = Array.from({ length: n + 1 }, () => new Array(top + 1).fill(0n)); dp[0][0] = 1n;
    for (let r = 1; r <= N; r++) for (let k = Math.min(n, r); k >= 1; k--) { const row = dp[k], prev = dp[k - 1]; for (let v = top; v >= r; v--) if (prev[v - r]) row[v] += prev[v - r]; }
    COUNTS.set(key, dp[n]); return dp[n];
}
const ratio = (num, den) => Number(num * 1000000000000n / den) / 1e12;
/** See the header. pHigher is the chance, were the arms one population, of A's ranks summing to at least what they do (ties placed BELOW the other arm's); pLower the mirror (ties placed ABOVE). */
export function rankSum(A, B) {
    if (!A.length || !B.length || ![...A, ...B].every(Number.isFinite)) throw new Error("paintingFly.rankSum: two non-empty lists of finite numbers");
    const n = A.length, N = n + B.length, counts = rankSumCounts(n, N), total = counts.reduce((x, y) => x + y, 0n);
    // A's rank sum with every tie against B placed below (low) and above (high); ties inside an arm do not move its sum
    let low = n * (n + 1) / 2, high = low, ties = 0;
    for (const a of A) for (const b of B) { if (a > b) { low++; high++; } else if (a === b) { high++; ties++; } }
    let ge = 0n, le = 0n;
    for (let v = 0; v < counts.length; v++) { if (v >= low) ge += counts[v]; if (v <= high) le += counts[v]; }
    const pHigher = ratio(ge, total), pLower = ratio(le, total);
    return { n, m: B.length, sumALow: low, sumAHigh: high, sumA: (low + high) / 2, ties, pHigher, pLower, p: Math.min(1, 2 * Math.min(pHigher, pLower)) };
}
/** The registered words for a test of the FLY against `what` ("A SHUFFLE OF IT", "A PLAIN NET OF ITS SIZE"). */
export function wordOf(t, what, alpha = ALPHA) {
    if (t.p <= alpha && t.pHigher < t.pLower) return `THE FLY'S WIRING PAINTS BETTER THAN ${what}`;
    if (t.p <= alpha && t.pLower < t.pHigher) return `THE FLY'S WIRING PAINTS WORSE THAN ${what}`;
    return `THE FLY'S WIRING CANNOT BE TOLD APART FROM ${what}`;
}

// ---- what the arms are described beside ----------------------------------------------------------------------------------------------------------------------------
const lcg = (s) => { let x = s >>> 0 || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };
/** See the header: primitiveFit-selfcheck section 8's random painters and its random search, on this round's audit pictures. */
export function floors(audit = AUDIT, maxSteps = RECIPE.maxSteps, searchPictures = 24) {
    const random = [];
    for (let k = 0; k < 8; k++) { const r = lcg(1000 + k * 7919); random.push(auditScore({ act: () => [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1] }, audit, maxSteps).score); }
    let search = 0; const pics = audit.slice(0, searchPictures);
    for (const seed of pics) {
        const e = new PaintEnv({ maxSteps }); e.reset(seed); const rng = P.mulberry32(seed);
        for (let t = 0; t < maxSteps; t++) { const st = fitStep(e.target, e.canvas, { alpha: e.alpha, candidates: 60, mutations: 30, patience: 10, kinds: ["rotatedRect"], rng }); if (st && st.delta < 0) { drawShape(e.canvas, st.spans, st.colour, e.alpha); e.diff += st.delta; } }
        search += e.startDistance - e.distance();
    }
    const untrained = {}; for (const arm of ARMS) untrained[arm] = auditScore(policyOf(arm, 1), audit, maxSteps).score;
    return { kind: "floors", random, search: search / pics.length, searchPictures: pics.length, untrained };
}

// ---- the checks and the reading ------------------------------------------------------------------------------------------------------------------------------------
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** See the header. `lines` are the parsed records of the results file. */
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
        if (!Number.isFinite(r.score)) bad.push(`${id} has no score`);
        if (r.arm !== "MLP") {
            const c = P.ARMS[r.arm](r.s);
            if (r.edgesHash !== hashEdges(c.edges) || r.edges !== c.edges.length || r.units !== c.units) bad.push(`${id}'s wiring is not its arm's`);
            if (r.arm === "SHUF") {
                const set = new Set(c.edges.map((e) => e[0] * c.units + e[1])), gfc = P.ARMS.FLY().edges;
                if (c.edges.length !== 313 || set.size !== 313 || c.edges.some((e) => e[0] === e[1])) bad.push(`${id}'s shuffle is not 313 distinct off-diagonal pairs`);
                if (r.edgesHash === hashEdges(gfc)) bad.push(`${id}'s shuffle is the fly's own wiring`);
            }
        }
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), fly1 = draws.find((r) => r.arm === "FLY" && r.s === 1);
    if (re.length !== 1 || !fly1 || re[0].arm !== "FLY" || re[0].s !== 1 || re[0].weightsHash !== fly1.weightsHash) bad.push("FLY draw 1 trained a second time is not there once with the same weights");
    if (lines.filter((r) => r && r.kind === "floors").length !== 1) bad.push("the floors are not there once");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
/** See the header. With a failed check the tests are NOT made (`T1` and `T2` are null). */
export function reading(lines) {
    const checks = checkRecords(lines), draws = lines.filter((r) => r && r.kind === "draw"), scores = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s).map((r) => r.score);
    const arms = {}; for (const arm of ARMS) { const v = scores(arm); if (v.length) arms[arm] = stats(v); }
    const fl = lines.find((r) => r && r.kind === "floors") || null;
    if (checks.length) return { checks, arms, T1: null, T2: null, floors: fl };
    const t1 = rankSum(scores("FLY"), scores("SHUF")), t2 = rankSum(scores("FLY"), scores("PLAIN"));
    return { checks, arms, T1: { ...t1, word: wordOf(t1, "A SHUFFLE OF IT") }, T2: { ...t2, word: wordOf(t2, "A PLAIN NET OF ITS SIZE") }, floors: fl };
}
/** The reading in lines a person reads. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(5);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push("the checks hold: 80 draws, each once, the registered recipe, each arm's weight count and wiring, FLY draw 1 the same twice");
    out.push("", "arm     n   mean      sd        least     most");
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(7)} ${String(s.n).padStart(2)}  ${f(s.mean)}  ${f(s.sd)}  ${f(s.min)}  ${f(s.max)}`);
    if (R.floors) { const r = stats(R.floors.random); out.push("", `eight random painters: ${f(r.mean)} +/- ${f(r.sd)}; the random search at 90 evaluations a shape (${R.floors.searchPictures} pictures): ${f(R.floors.search)}`, `untrained draw 1: ${Object.entries(R.floors.untrained).map(([a, v]) => `${a} ${f(v)}`).join(", ")}`); }
    for (const [name, t] of [["T1 (FLY against SHUF)", R.T1], ["T2 (FLY against PLAIN)", R.T2]]) if (t) out.push("", `${name}: the fly's ranks sum to ${t.sumA} of ${t.n * (t.n + t.m + 1) / 2} at the middle, ties ${t.ties}; exact two-sided p ${t.p.toFixed(5)}`, `  ${t.word}`);
    return out;
}
