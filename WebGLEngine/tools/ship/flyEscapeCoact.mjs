// WebGLEngine/tools/ship/flyEscapeCoact.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES, ROUND 10, AS ARITHMETIC (registered in brain/FLY_ESCAPE_COACT_WIP.md before this file existed): A FLY WHOSE ESCAPE RUNS THROUGH FIBRES WHOSE INPUTS WEAKEN WITH CO-ACTIVITY.
// Round 9's lives, audit, recipe, floors and FROZEN fly (tools/ship/flyEscapeHabituate.mjs, used as it is); three arms, 12 draws each, draws 13 to 24:
//   FROZEN   round 9's FROZEN fly, its code unchanged (round 5's real Giant Fiber circuit fly inside the reflex wrapper)
//   COACT    brain/rl/coactReflex.mjs round the same network (two more weights, first; at the start it is FROZEN to the bit)
//   CSHUF    COACT with round 5's free shuffle of the connections (shuffledEdges(42, 369, 7000 + draw))
// Readings: P (COACT against FROZEN, rank sum), T1 (COACT against CSHUF, rank sum), H (COACT against the hand habituating reflex, sign test); counted: USES (the score less the score with the two
// rates at 0 above 0.01) and ACROSS (in decoy lives the fourth episode's mean return less the first's at least 0.1); described: decoy and ordinary lives, the rates, the flies that never flee, the floors.
// The command is tools/ship/takeFlyEscapeCoact.mjs.
//
//   RECIPE, SEEDS, ARMS, LEAD, WEIGHTS, AUDIT, ALPHA, RESULTS, NEVER_FLEES, USES_BY, ACROSS_BY, WORDS
//   circuitOf(arm, s), policyOf(arm, s)    an arm's wiring and its untrained fly for draw s (the reflex)
//   ratesOff(arm, s, weights)              the fly of those weights with its two rates set to 0 (every other weight kept)
//   trainOne(arm, s, recipe, audit)        { kind: "draw", arm, s, recipe, units, edges, edgesHash, weightCount, weights, weightsHash, rates, ratesOff (score), ...auditScore, history }
//   floors(audit)                          round 9's floors, with this round's untrained arms
//   uses(r), across(r), parseArgs(argv), checkRecords(lines), reading(lines), readingLines(R)
// NOT HERE: the 36 trainings (the command runs them; the gate never does).
"use strict";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { RULES } from "../../brain/rl/escapeEnv.mjs";
import { LifeEnv, EPISODES, handFly, told } from "../../brain/rl/lifeEnv.mjs";
import { MaskedCircuitPolicy } from "../../brain/rl/maskedCircuitPolicy.mjs";
import { CoactReflex } from "../../brain/rl/coactReflex.mjs";
import { shuffledEdges } from "../../brain/rl/paintCircuitPolicy.mjs";
import { CELLS, VISUAL_INPUTS, EDGE_START, SHUFFLE_SEED } from "./flyEscapeVision.mjs";
import * as R9 from "./flyEscapeHabituate.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights, hashEdges } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";

export const RECIPE = R9.RECIPE, AUDIT = R9.AUDIT, NEVER_FLEES = R9.NEVER_FLEES, auditScore = R9.auditScore;
export const SEEDS = Object.freeze(Array.from({ length: 12 }, (_, k) => k + 13));
export const ARMS = Object.freeze(["FROZEN", "COACT", "CSHUF"]), LEAD = "COACT";
export const WEIGHTS = Object.freeze({ FROZEN: R9.WEIGHTS.FROZEN, COACT: R9.WEIGHTS.FROZEN + 2, CSHUF: R9.WEIGHTS.FROZEN + 2 });
export const ALPHA = 0.01, RESULTS = "brain/flyEscapeCoactRound.jsonl", USES_BY = 0.01, ACROSS_BY = 0.1;
const three = (a, b) => Object.freeze([`${a} BETTER THAN ${b}`, `${a} WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`]);
const FLY = "A FLY WHOSE ESCAPE RUNS THROUGH FIBRES WHOSE INPUTS WEAKEN WITH CO-ACTIVITY";
export const WORDS = Object.freeze({
    P: three(`${FLY} DOES`, "ONE WHOSE CANNOT").map((w) => w.replace("DOES CANNOT", "CANNOT")),
    T1: three("THE REAL WIRING DOES", "A SHUFFLE OF IT").map((w) => w.replace("DOES CANNOT", "CANNOT")),
    H: three(`${FLY} DOES`, "THE HABITUATING REFLEX WRITTEN BY HAND").map((w) => w.replace("DOES CANNOT", "CANNOT")),
});

const REAL = Object.freeze(T.EDGES.map((e) => [e[0], e[1]]));
/** See the header. */
export function circuitOf(arm, s) {
    if (!ARMS.includes(arm)) throw new Error(`flyEscapeCoact.circuitOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    return { units: CELLS, edges: arm === "CSHUF" ? shuffledEdges(CELLS, REAL.length, SHUFFLE_SEED + s) : REAL.map((e) => [...e]) };
}
/** See the header: FROZEN is round 9's own; COACT and CSHUF the co-activity fly round the network, its output layer at zero. */
export function policyOf(arm, s) {
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyEscapeCoact.policyOf: a draw is a whole number from 1 (got ${s})`);
    if (arm === "FROZEN") return R9.policyOf("FROZEN", s);
    const c = circuitOf(arm, s), inner = new MaskedCircuitPolicy({ obsDim: 13, units: c.units, inputs: VISUAL_INPUTS.map((e) => [...e]), edges: c.edges, outputs: [...T.GF], edgeStart: [...EDGE_START], seed: s });
    return new CoactReflex(inner, { rule: RULES.reflex, tail: T.GF.length + 1 });
}
const flyOf = (p) => () => (o) => p.act(o);
/** See the header. */
export function ratesOff(arm, s, weights) {
    if (arm === "FROZEN") throw new Error("flyEscapeCoact.ratesOff: the FROZEN fly has no rates");
    const w = Float32Array.from(weights); w[0] = 0; w[1] = 0; return policyOf(arm, s).setParams(w);
}
/** See the header. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    const fly = policyOf(arm, s), c = circuitOf(arm, s);
    const res = trainDockES({ envFactory: () => new LifeEnv(), obsDim: 13, actDim: 1, maxSteps: recipe.maxSteps, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s, policyFactory: () => policyOf(arm, s),
        ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    fly.setParams(res.params);
    const plastic = fly instanceof CoactReflex;
    return { kind: "draw", arm, s, recipe: { ...recipe }, units: c.units, edges: c.edges.length, edgesHash: hashEdges(c.edges), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rates: plastic ? fly.rates() : null, ratesOff: plastic ? auditScore(flyOf(ratesOff(arm, s, res.params)), audit).score : null, ...auditScore(flyOf(fly), audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header. */
export function floors(audit = AUDIT) {
    const out = { kind: "floors", reflex: auditScore(() => RULES.reflex, audit), freeze: auditScore(() => RULES.freeze, audit), hand: auditScore(handFly, audit), told: auditScore(() => told, audit), untrained: {} };
    for (const arm of ARMS) out.untrained[arm] = auditScore(flyOf(policyOf(arm, SEEDS[0])), audit).score;
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
        if (![r.score, r.decoy, r.ordinary].every(fin) || !Number.isInteger(r.nDecoy) || Math.abs(r.score - (r.decoy * r.nDecoy + r.ordinary * (AUDIT.length - r.nDecoy)) / AUDIT.length) > 1e-9 || !["decoy", "ordinary"].every((k) => Array.isArray(r.ep && r.ep[k]) && r.ep[k].length === EPISODES && r.ep[k].every(fin))) bad.push(`${id} has no score that is its decoy and ordinary lives'`);
        if ((r.arm === "FROZEN") !== (r.rates === null) || (r.rates && !(fin(r.rates.a) && fin(r.rates.b) && r.rates.a >= 0 && r.rates.b >= 0))) bad.push(`${id}'s rates are not its arm's`);
        if ((r.arm === "FROZEN") !== (r.ratesOff === null) || (r.ratesOff !== null && !fin(r.ratesOff))) bad.push(`${id} has no score with its rates at 0 (or has one and is FROZEN)`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
        const c = circuitOf(r.arm, r.s);
        if (r.edgesHash !== hashEdges(c.edges) || r.edges !== c.edges.length || r.units !== c.units) bad.push(`${id}'s wiring is not its arm's`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !["reflex", "freeze", "hand", "told"].every((k) => fl[0][k] && fin(fl[0][k].score))) bad.push("the floors are not there once");
    else for (const a of ARMS) if (!(fl[0].untrained && fl[0].untrained[a] === fl[0].reflex.score)) bad.push(`the untrained ${a} fly does not score the reflex's number: the start is not the reflex`);
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (words, more, less) => words[more ? 0 : less ? 1 : 2];
/** USES, as registered: the score less the score with the two rates at 0 is above 0.01 (a FROZEN fly has no rates and does not use them). */
export const uses = (r) => r.ratesOff !== null && r.score - r.ratesOff > USES_BY;
/** ACROSS, as registered: in decoy lives the fourth episode's mean return less the first's is at least 0.1. */
export const across = (r) => r.ep.decoy[EPISODES - 1] - r.ep.decoy[0] >= ACROSS_BY;
/** See the header. With a failed check no test is made. */
export function reading(lines) {
    const checks = checkRecords(lines), draws = lines.filter((r) => r && r.kind === "draw"), of = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score);
    const arms = {};
    for (const arm of ARMS) { const v = of(arm); if (!v.length) continue; const mean = (f) => v.reduce((n, r) => n + f(r), 0) / v.length;
        arms[arm] = { ...stats(v.map((r) => r.score)), decoy: mean((r) => r.decoy), ordinary: mean((r) => r.ordinary), signature: mean((r) => r.ep.decoy[EPISODES - 1] - r.ep.decoy[0]), neverFlee: v.filter((r) => r.ordinary < NEVER_FLEES).length,
            uses: v.filter(uses).length, across: v.filter(across).length, a: v[0].rates ? mean((r) => r.rates.a) : null, b: v[0].rates ? mean((r) => r.rates.b) : null, ratesOff: v[0].ratesOff !== null ? mean((r) => r.ratesOff) : null };
        if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
    const fl = lines.find((r) => r && r.kind === "floors") || null;
    if (checks.length) return { checks, arms, floors: fl, P: null, T1: null, H: null };
    const rs = (name, other) => { const t = rankSum(scores(LEAD), scores(other)); return { ...t, word: pick(WORDS[name], t.p <= ALPHA && t.pHigher < t.pLower, t.p <= ALPHA && t.pLower < t.pHigher) }; };
    const h = signTest(scores(LEAD), fl.hand.score);
    return { checks, arms, floors: fl, P: rs("P", "FROZEN"), T1: rs("T1", "CSHUF"), H: { ...h, ref: fl.hand.score, word: pick(WORDS.H, h.p <= ALPHA && h.above > h.below, h.p <= ALPHA && h.below > h.above) } };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: ${ARMS.length * SEEDS.length} draws, each once, the registered recipe, each arm's weight count and wiring, a score with the rates at 0 for every plastic fly, ${LEAD} draw ${FIRST} the same twice, a history in every record, the floors, and every untrained fly the reflex`);
    out.push("", `the arms (the mean of 12 flies; 200 audit lives, ${R.floors ? R.floors.reflex.nDecoy : "?"} of them decoy lives):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(7)} ${f(s.mean)}  decoy lives ${f(s.decoy)}  ordinary lives ${f(s.ordinary)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | in decoy lives the 4th episode less the 1st ${f(s.signature)} | never flee ${s.neverFlee} of ${s.n}${s.a === null ? "" : ` | USES ${s.uses} of ${s.n}, ACROSS ${s.across} of ${s.n} | with the rates at 0 ${f(s.ratesOff)} | rates a ${f(s.a)} b ${f(s.b)}`}`);
    if (R.floors) { out.push("", "the floors:"); for (const [k, name] of [["reflex", "the reflex"], ["freeze", "never flees"], ["hand", "habituating reflex"], ["told", "told the kind"]]) { const x = R.floors[k]; out.push(`${name.padEnd(19)} ${f(x.score)}  decoy lives ${f(x.decoy)}  ordinary lives ${f(x.ordinary)}  | in decoy lives the 4th episode less the 1st ${f(x.ep.decoy[EPISODES - 1] - x.ep.decoy[0])}`); } }
    for (const [arm, a] of Object.entries(R.arms)) if (a.history) out.push(`${arm.padEnd(7)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
    for (const [name, t] of [[`P (${LEAD} against FROZEN)`, R.P], [`T1 (${LEAD} against CSHUF)`, R.T1]]) if (t) out.push("", `${name}: ${LEAD}'s ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`);
    if (R.H) out.push("", `H (${LEAD} against the habituating reflex): of ${R.H.n}, ${R.H.above} above its ${f(R.H.ref)}, ${R.H.below} below, ${R.H.ties} equal; exact two-sided p ${R.H.p.toExponential(3)}`, `  ${R.H.word}`);
    return out;
}
