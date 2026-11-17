// WebGLEngine/tools/ship/flyCompass.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMPASS LEARNS, AS ARITHMETIC (registered in brain/FLY_COMPASS_LEARNS_WIP.md before this file existed): A FLY WHOSE RING-TO-COMPASS CONNECTIONS TIE THE SCENE TO ITS HEADING.
// The task is brain/rl/compassEnv.mjs and the fly brain/rl/compassFly.mjs; three arms, 12 draws each, draws 1 to 12:
//   FROZEN   the fly with a and b held at 0, its one weight p_c starting at 1 (vision on, the anatomy's map)
//   PLASTIC  the fly on the real ring-to-compass connections, weights [p_a, p_b, p_c] starting at [0, 0, 1]
//   PSHUF    PLASTIC with the connections shuffled (as many, the same synapse counts, onto pairs drawn without repeats; seed 7000 + draw)
// Readings: P (PLASTIC against path integration alone, sign test), P2 (PLASTIC against FROZEN, rank sum), T1 (PLASTIC against PSHUF, rank sum), H (PLASTIC against the plastic fly by hand,
// sign test); counted: USES (the score less the score with a and b at 0, c kept, above 0.01). The command is tools/ship/takeFlyCompass.mjs.
//
//   RECIPE, SEEDS, ARMS, LEAD, WEIGHTS, AUDIT, ALPHA, RESULTS, USES_BY, HAND, WORDS
//   shuffled(edges, seed), edgesOf(arm, s), policyOf(arm, s), ratesOff(arm, s, weights)
//   auditScore(fly, lives, told)          the mean return of a fly over lives (told: its phi set to the true heading before each tick)
//   trainOne(arm, s, recipe, audit)       { kind: "draw", arm, s, recipe, edges, edgesHash, weightCount, weights, weightsHash, rates, ratesOff (score, or null for FROZEN), score, history }
//   floors(audit)                         { kind: "floors", off, start, hand, told, untrained: { arm: score } } -- FROZEN's and PLASTIC's untrained fly is the start; PSHUF's has the shuffle's map
//   uses(r), parseArgs(argv), checkRecords(lines), reading(lines), readingLines(R)
// NOT HERE: the 36 trainings (the command runs them; the gate never does).
"use strict";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { CompassEnv, stream, NR } from "../../brain/rl/compassEnv.mjs";
import { CompassFly, REAL, NE } from "../../brain/rl/compassFly.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights, hashEdges } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";

export const RECIPE = Object.freeze({ iters: 60, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 4, fresh: true, battery: 16 });
export const SEEDS = Object.freeze(Array.from({ length: 12 }, (_, k) => k + 1));
export const ARMS = Object.freeze(["FROZEN", "PLASTIC", "PSHUF"]), LEAD = "PLASTIC";
export const WEIGHTS = Object.freeze({ FROZEN: 1, PLASTIC: 3, PSHUF: 3 });
export const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 900001 + 7919 * k));
export const ALPHA = 0.01, RESULTS = "brain/flyCompassRound.jsonl", USES_BY = 0.01, SHUFFLE_SEED = 7000;
export const HAND = Object.freeze([1, 0, 1]);
const three = (a, b) => Object.freeze([`${a} BETTER THAN ${b}`, `${a} WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`]);
const FLY = "A FLY WHOSE RING-TO-COMPASS CONNECTIONS WEAKEN WITH CO-ACTIVITY";
const words = (a, b) => three(`${a} DOES`, b).map((w) => w.replace("DOES CANNOT", "CANNOT"));
export const WORDS = Object.freeze({ P: words(FLY, "A FLY THAT STEERS BY ITS TURNS ALONE"), P2: words(FLY, "ONE WHOSE CANNOT"), T1: words("THE REAL WIRING", "A SHUFFLE OF IT"), H: words(FLY, "THE SAME RULE SET BY HAND") });

/** As many connections, with the same synapse counts in the same order, onto ring-compass pairs drawn without repeats. */
export function shuffled(edges, seed) { const r = stream(seed), seen = new Set(), out = []; for (const e of edges) { let j, k; do { j = Math.floor(r() * NR); k = Math.floor(r() * NE); } while (seen.has(j * NE + k)); seen.add(j * NE + k); out.push([j, k, e[2]]); } return out; }
/** See the header. */
export function edgesOf(arm, s) {
    if (!ARMS.includes(arm)) throw new Error(`flyCompass.edgesOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyCompass.edgesOf: a draw is a whole number from 1 (got ${s})`);
    return arm === "PSHUF" ? shuffled(REAL, SHUFFLE_SEED + s) : REAL.map((e) => [...e]);
}
/** See the header. */
export function policyOf(arm, s) { return new CompassFly({ edges: edgesOf(arm, s), plastic: arm !== "FROZEN" }); }
/** See the header. */
export function ratesOff(arm, s, weights) { if (arm === "FROZEN") throw new Error("flyCompass.ratesOff: the FROZEN fly has no rates"); const w = Float32Array.from(weights); w[0] = 0; w[1] = 0; return policyOf(arm, s).setParams(w); }
/** See the header. */
export function auditScore(fly, lives = AUDIT, told = false) {
    const env = new CompassEnv(); let sum = 0;
    for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { if (told) fly.phi = env.th; const r = env.step(fly.act(o)); o = r.obs; done = r.done; } sum += env.ret; }
    return sum / lives.length;
}
/** See the header. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    const edges = edgesOf(arm, s);
    const res = trainDockES({ envFactory: () => new CompassEnv(), obsDim: NR + 2, actDim: 1, maxSteps: 1500, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => policyOf(arm, s), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    const fly = policyOf(arm, s).setParams(res.params);
    return { kind: "draw", arm, s, recipe: { ...recipe }, edges: edges.length, edgesHash: hashEdges(edges), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rates: fly.rates(), ratesOff: arm === "FROZEN" ? null : auditScore(ratesOff(arm, s, res.params), audit), score: auditScore(fly, audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header. */
export function floors(audit = AUDIT) {
    const out = { kind: "floors", off: auditScore(policyOf("FROZEN", 1).setParams([0]), audit), start: auditScore(policyOf("FROZEN", 1), audit), hand: auditScore(policyOf("PLASTIC", 1).setParams(HAND), audit), told: auditScore(policyOf("FROZEN", 1).setParams([0]), audit, true), untrained: {} };
    for (const arm of ARMS) out.untrained[arm] = auditScore(policyOf(arm, SEEDS[0]), audit);
    return out;
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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), FIRST = SEEDS[0], fin = (v) => Number.isFinite(v);
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
        if (!fin(r.score)) bad.push(`${id} has no score`);
        if (!(r.rates && fin(r.rates.a) && fin(r.rates.b) && fin(r.rates.c) && r.rates.a >= 0 && r.rates.b >= 0 && r.rates.c >= 0) || (r.arm === "FROZEN" && (r.rates.a !== 0 || r.rates.b !== 0))) bad.push(`${id}'s rates are not its arm's`);
        if ((r.arm === "FROZEN") !== (r.ratesOff === null) || (r.ratesOff !== null && !fin(r.ratesOff))) bad.push(`${id} has no score with its rates at 0 (or has one and is FROZEN)`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
        const e = edgesOf(r.arm, r.s);
        if (r.edgesHash !== hashEdges(e) || r.edges !== e.length) bad.push(`${id}'s wiring is not its arm's`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !["off", "start", "hand", "told"].every((k) => fin(fl[0][k]))) bad.push("the floors are not there once");
    else { for (const a of ["FROZEN", "PLASTIC"]) if (!(fl[0].untrained && fl[0].untrained[a] === fl[0].start)) bad.push(`the untrained ${a} fly does not score the start's number: the start is not the registered one`);
        if (!(fl[0].untrained && fin(fl[0].untrained.PSHUF))) bad.push("the untrained PSHUF fly (vision on, the shuffle's map) has no score"); }
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (words, more, less) => words[more ? 0 : less ? 1 : 2];
/** USES, as registered: the score less the score with a and b at 0 (c kept) is above 0.01; a FROZEN fly has no rates. */
export const uses = (r) => r.ratesOff !== null && r.score - r.ratesOff > USES_BY;
/** See the header. With a failed check no test is made. */
export function reading(lines) {
    const checks = checkRecords(lines), draws = lines.filter((r) => r && r.kind === "draw"), of = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score);
    const arms = {};
    for (const arm of ARMS) { const v = of(arm); if (!v.length) continue; const mean = (f) => v.reduce((n, r) => n + f(r), 0) / v.length;
        arms[arm] = { ...stats(v.map((r) => r.score)), uses: v.filter(uses).length, a: mean((r) => r.rates.a), b: mean((r) => r.rates.b), c: mean((r) => r.rates.c), ratesOff: v[0].ratesOff !== null ? mean((r) => r.ratesOff) : null };
        if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
    const fl = lines.find((r) => r && r.kind === "floors") || null;
    if (checks.length) return { checks, arms, floors: fl, P: null, P2: null, T1: null, H: null };
    const sign = (name, ref) => { const h = signTest(scores(LEAD), ref); return { ...h, ref, word: pick(WORDS[name], h.p <= ALPHA && h.above > h.below, h.p <= ALPHA && h.below > h.above) }; };
    const rs = (name, other) => { const t = rankSum(scores(LEAD), scores(other)); return { ...t, word: pick(WORDS[name], t.p <= ALPHA && t.pHigher < t.pLower, t.p <= ALPHA && t.pLower < t.pHigher) }; };
    return { checks, arms, floors: fl, P: sign("P", fl.off), P2: rs("P2", "FROZEN"), T1: rs("T1", "PSHUF"), H: sign("H", fl.hand) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4)), g = (x) => (x === null || x === undefined ? "-" : x.toExponential(2));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: ${ARMS.length * SEEDS.length} draws, each once, the registered recipe, each arm's weight count and wiring, a score with the rates at 0 for every plastic fly, ${LEAD} draw ${FIRST} the same twice, a history in every record, the floors, and the untrained FROZEN and PLASTIC flies the start`);
    out.push("", `the arms (the mean of 12 flies; ${AUDIT.length} audit lives):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(8)} ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${g(s.a)} b ${g(s.b)} c ${g(s.c)}${s.ratesOff === null ? "" : ` | USES ${s.uses} of ${s.n} | with a and b at 0 ${f(s.ratesOff)}`}`);
    if (R.floors) { out.push("", "the floors:"); for (const [k, name] of [["told", "told the heading"], ["hand", "plastic, by hand"], ["off", "vision off"], ["start", "the start"]]) out.push(`${name.padEnd(17)} ${f(R.floors[k])}`); if (R.floors.untrained) out.push(`${"PSHUF's start".padEnd(17)} ${f(R.floors.untrained.PSHUF)} (vision on, the shuffle's map; draw ${FIRST})`); }
    for (const [arm, a] of Object.entries(R.arms)) if (a.history) out.push(`${arm.padEnd(8)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
    for (const [name, h] of [[`P (${LEAD} against path integration alone)`, R.P], [`H (${LEAD} against the rule by hand)`, R.H]]) if (h) out.push("", `${name}: of ${h.n}, ${h.above} above its ${f(h.ref)}, ${h.below} below, ${h.ties} equal; exact two-sided p ${h.p.toExponential(3)}`, `  ${h.word}`);
    for (const [name, t] of [[`P2 (${LEAD} against FROZEN)`, R.P2], [`T1 (${LEAD} against PSHUF)`, R.T1]]) if (t) out.push("", `${name}: ${LEAD}'s ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`);
    return out;
}
