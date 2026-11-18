// WebGLEngine/tools/ship/flyCompassBalanced.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMPASS, BALANCED, AS ARITHMETIC (registered in brain/FLY_COMPASS_BALANCED_WIP.md before this file existed): IS THE REAL WIRING'S HANDICAP IN THE COMPASS ROUND
// ITS UNEVEN SUMMED INPUTS ONTO THE COMPASS NEURONS? The fly, task, recipe, draws and audit are the compass round's (tools/ship/flyCompass.mjs); two new arms, 12 draws each:
//   PSUM   random partners, the real sums: 8,836 connections, the real synapse counts in the real order, onto pairs drawn without repeats from the 260 ring neurons with a real
//          connection x 46 (seed 9000 + draw), then 3,000 sweeps of every ring neuron's strengths scaled to its real summed synapses and then every compass neuron's
//   PEVEN  the real partners, even sums: every real strength times the mean summed input over the 46 compass neurons, over its own compass neuron's (the pull 0)
// weighed against the compass round's PLASTIC and PSHUF as committed in brain/flyCompassRound.jsonl. Readings (exact rank sums): A PSUM against PSHUF, B PEVEN against PLASTIC,
// C PSUM against PLASTIC, D PEVEN against PSHUF; counted: USES. The command is tools/ship/takeFlyCompassBalanced.mjs.
//
//   RECIPE, SEEDS, AUDIT, ALPHA, USES_BY (the compass round's), ARMS, LEAD, WEIGHTS, RESULTS, COMPASS, COMPASS_SHA256, SUM_SEED, SWEEPS, LIVE, SUMS, WORDS
//   summedShuffle(seed), evened(), edgesOf(arm, s), policyOf(arm, s), ratesOff(arm, s, weights), trainOne(arm, s, recipe, audit), floors(audit)
//   compassOf(bytes)                      { sha256, lines } of the compass round's results file
//   parseArgs(argv), checkRecords(lines, compass), reading(lines, compass), readingLines(R)
// NOT HERE: the 24 trainings (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { CompassEnv, stream, NR } from "../../brain/rl/compassEnv.mjs";
import { CompassFly, REAL, NE } from "../../brain/rl/compassFly.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights, hashEdges } from "./paintingFly.mjs";
import * as C from "./flyCompass.mjs";

export const RECIPE = C.RECIPE, SEEDS = C.SEEDS, AUDIT = C.AUDIT, ALPHA = C.ALPHA, USES_BY = C.USES_BY;
export const ARMS = Object.freeze(["PSUM", "PEVEN"]), LEAD = "PSUM";
export const WEIGHTS = Object.freeze({ PSUM: 3, PEVEN: 3 });
export const RESULTS = "brain/flyCompassBalancedRound.jsonl", COMPASS = "brain/flyCompassRound.jsonl", COMPASS_SHA256 = "363cdbf5147d4137ad2b6d3de26e0e14ca7709a75e77aaad9317c15cad6c0527";
export const SUM_SEED = 9000, SWEEPS = 3000;
/** The real wiring's summed synapses: onto each compass neuron (input) and out of each ring neuron (output). */
export const SUMS = (() => { const input = new Float64Array(NE), output = new Float64Array(NR); for (const [j, k, n] of REAL) { input[k] += n; output[j] += n; } return Object.freeze({ input, output }); })();
/** The ring neurons with a real connection onto a core compass neuron (260 of the 282). */
export const LIVE = Object.freeze([...Array(NR).keys()].filter((j) => SUMS.output[j] > 0));
const three = (a, b) => Object.freeze([`${a} DOES BETTER THAN ${b}`, `${a} DOES WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`]);
const SUMMED = "A SHUFFLE GIVEN THE REAL WIRING'S SUMMED INPUTS", EVEN = "THE REAL WIRING WITH ITS SUMMED INPUTS EVENED";
export const WORDS = Object.freeze({ A: three(SUMMED, "A PLAIN SHUFFLE"), B: three(EVEN, "THE REAL WIRING"), C: three(SUMMED, "THE REAL WIRING"), D: three(EVEN, "A PLAIN SHUFFLE") });
const VS = Object.freeze({ A: ["PSUM", "PSHUF"], B: ["PEVEN", "PLASTIC"], C: ["PSUM", "PLASTIC"], D: ["PEVEN", "PSHUF"] });

/** See the header: PSUM's wiring for a seed. */
export function summedShuffle(seed) {
    const r = stream(seed), seen = new Set(), E = [];
    for (const e of REAL) { let j, k; do { j = LIVE[Math.floor(r() * LIVE.length)]; k = Math.floor(r() * NE); } while (seen.has(j * NE + k)); seen.add(j * NE + k); E.push([j, k, e[2]]); }
    for (let t = 0; t < SWEEPS; t++) {
        const out = new Float64Array(NR); for (const e of E) out[e[0]] += e[2]; for (const e of E) e[2] *= SUMS.output[e[0]] / out[e[0]];
        const inp = new Float64Array(NE); for (const e of E) inp[e[1]] += e[2]; for (const e of E) e[2] *= SUMS.input[e[1]] / inp[e[1]];
    }
    return E;
}
/** See the header: PEVEN's wiring. */
export function evened() { const m = SUMS.input.reduce((a, b) => a + b, 0) / NE; return REAL.map(([j, k, n]) => [j, k, n * m / SUMS.input[k]]); }
const MEMO = new Map();
/** See the header. A copy each call; PSUM's fit is made once a draw. */
export function edgesOf(arm, s) {
    if (!ARMS.includes(arm)) throw new Error(`flyCompassBalanced.edgesOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyCompassBalanced.edgesOf: a draw is a whole number from 1 (got ${s})`);
    const key = arm === "PEVEN" ? "PEVEN" : `PSUM/${s}`;
    if (!MEMO.has(key)) MEMO.set(key, arm === "PEVEN" ? evened() : summedShuffle(SUM_SEED + s));
    return MEMO.get(key).map((e) => [...e]);
}
/** See the header. */
export function policyOf(arm, s) { return new CompassFly({ edges: edgesOf(arm, s) }); }
/** See the header: the same weights with a and b at 0, c kept. */
export function ratesOff(arm, s, weights) { const w = Float32Array.from(weights); w[0] = 0; w[1] = 0; return policyOf(arm, s).setParams(w); }
/** See the header. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    const edges = edgesOf(arm, s);
    const res = trainDockES({ envFactory: () => new CompassEnv(), obsDim: NR + 2, actDim: 1, maxSteps: 1500, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => policyOf(arm, s), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    const fly = policyOf(arm, s).setParams(res.params);
    return { kind: "draw", arm, s, recipe: { ...recipe }, edges: edges.length, edgesHash: hashEdges(edges), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rates: fly.rates(), ratesOff: C.auditScore(ratesOff(arm, s, res.params), audit), score: C.auditScore(fly, audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header: vision off and the start (which must be the compass round's to the bit), and each new arm's untrained fly (PSUM's draw 1). */
export function floors(audit = AUDIT) {
    return { kind: "floors", off: C.auditScore(C.policyOf("FROZEN", 1).setParams([0]), audit), start: C.auditScore(C.policyOf("FROZEN", 1), audit),
        untrained: { PSUM: C.auditScore(policyOf("PSUM", SEEDS[0]), audit), PEVEN: C.auditScore(policyOf("PEVEN", SEEDS[0]), audit) } };
}
/** See the header. */
export function compassOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
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
/** See the header. `compass` is compassOf(the compass round's file). */
export function checkRecords(lines, compass) {
    const bad = [];
    if (!compass || compass.sha256 !== COMPASS_SHA256) bad.push(`the compass round's file is not the one committed (sha256 ${COMPASS_SHA256.slice(0, 16)}...)`);
    else { const cb = C.checkRecords(compass.lines); if (cb.length) bad.push(`the compass round's file fails its own checks: ${cb[0]}`); }
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
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
        if (!fin(r.score)) bad.push(`${id} has no score`);
        if (!(r.rates && fin(r.rates.a) && fin(r.rates.b) && fin(r.rates.c) && r.rates.a >= 0 && r.rates.b >= 0 && r.rates.c >= 0)) bad.push(`${id}'s rates are not finite and 0 or more`);
        if (!fin(r.ratesOff)) bad.push(`${id} has no score with its rates at 0`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
        const e = edgesOf(r.arm, r.s);
        if (r.edgesHash !== hashEdges(e) || r.edges !== e.length) bad.push(`${id}'s wiring is not its arm's`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors"), cfl = compass && compass.lines.find((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !fin(fl[0].off) || !fin(fl[0].start) || !(fl[0].untrained && fin(fl[0].untrained.PSUM) && fin(fl[0].untrained.PEVEN))) bad.push("the floors are not there once");
    else if (!cfl || fl[0].off !== cfl.off || fl[0].start !== cfl.start) bad.push("vision off and the start are not the compass round's to the bit: the fly, task or audit is not the same");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
/** See the header. */
export const uses = (r) => r.ratesOff !== null && r.score - r.ratesOff > USES_BY;
/** See the header. */
export function reading(lines, compass) {
    const checks = checkRecords(lines, compass), all = [...lines.filter((r) => r && r.kind === "draw"), ...(compass ? compass.lines.filter((r) => r && r.kind === "draw" && (r.arm === "PLASTIC" || r.arm === "PSHUF")) : [])];
    const of = (arm) => all.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score), arms = {};
    for (const arm of [...ARMS, "PLASTIC", "PSHUF"]) { const v = of(arm); if (!v.length) continue; const mean = (f) => v.reduce((n, r) => n + f(r), 0) / v.length;
        arms[arm] = { ...stats(v.map((r) => r.score)), uses: v.filter(uses).length, a: mean((r) => r.rates.a), b: mean((r) => r.rates.b), c: mean((r) => r.rates.c), ratesOff: mean((r) => r.ratesOff) };
        if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
    const fl = lines.find((r) => r && r.kind === "floors") || null, out = { checks, arms, floors: fl };
    for (const name of Object.keys(VS)) out[name] = null;
    if (checks.length) return out;
    for (const [name, [a, b]] of Object.entries(VS)) { const t = rankSum(scores(a), scores(b)), w = WORDS[name]; out[name] = { ...t, a, b, word: t.p <= ALPHA && t.pHigher < t.pLower ? w[0] : t.p <= ALPHA && t.pLower < t.pHigher ? w[1] : w[2] }; }
    return out;
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4)), g = (x) => (x === null || x === undefined ? "-" : x.toExponential(2));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: the compass round's file as committed and passing its own checks; ${ARMS.length * SEEDS.length} draws, each once, the registered recipe, each arm's weight count and wiring, a score with the rates at 0 for every fly, ${LEAD} draw ${FIRST} the same twice, a history in every record, and vision off and the start the compass round's to the bit`);
    out.push("", `the arms (the mean of 12 flies; ${AUDIT.length} audit lives; PLASTIC and PSHUF as committed by the compass round):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(8)} ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${g(s.a)} b ${g(s.b)} c ${g(s.c)} | USES ${s.uses} of ${s.n} | with a and b at 0 ${f(s.ratesOff)}`);
    if (R.floors) out.push("", `vision off ${f(R.floors.off)}, the start ${f(R.floors.start)}; untrained PSUM (draw ${FIRST}) ${f(R.floors.untrained.PSUM)}, PEVEN ${f(R.floors.untrained.PEVEN)}`);
    for (const [arm, a] of Object.entries(R.arms)) if (a.history) out.push(`${arm.padEnd(8)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
    for (const name of Object.keys(VS)) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${t.b}): ${t.a}'s ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    return out;
}
