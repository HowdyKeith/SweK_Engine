// WebGLEngine/tools/ship/flyEscapeFibreOnly.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES, ROUND 11, AS ARITHMETIC (registered in brain/FLY_ESCAPE_FIBRE_ONLY_WIP.md before this file existed): A FLY WHOSE NETWORK CANNOT OVERRULE ITS HABITUATING FIBRES.
// Round 9's lives, audit, recipe and floors (tools/ship/flyEscapeHabituate.mjs, through tools/ship/flyEscapeCoact.mjs, used as they are); two arms, 12 draws each, draws 25 to 36:
//   FIBRE    brain/rl/fibreOnlyReflex.mjs round round 5's real Giant Fiber circuit (round 10's COACT fly with nothing added to its action)
//   FSHUF    FIBRE with round 5's free shuffle of the connections (shuffledEdges(42, 369, 7000 + draw))
// NO FROZEN ARM: a frozen fly that cannot veto is the reflex whatever it is trained to. P weighs FIBRE against never fleeing (0.6348), where every frozen fly of rounds 9 and 10 went (24 of 24).
// Readings: P (FIBRE against never fleeing, sign test), T1 (FIBRE against FSHUF, rank sum), H (FIBRE against the hand habituating reflex, sign test). A CHECK, not a count: every record's score with
// its two rates at 0 is the reflex's to the bit. Counted: ACROSS (round 10's) and the flies that never flee. The command is tools/ship/takeFlyEscapeFibreOnly.mjs.
//
//   RECIPE, SEEDS, ARMS, LEAD, WEIGHTS, AUDIT, ALPHA, RESULTS, NEVER_FLEES, ACROSS_BY, WORDS
//   circuitOf(arm, s), policyOf(arm, s)    an arm's wiring and its untrained fly for draw s (the reflex)
//   ratesOff(arm, s, weights)              the fly of those weights with its two rates set to 0 (every other weight kept)
//   trainOne(arm, s, recipe, audit)        { kind: "draw", arm, s, recipe, units, edges, edgesHash, weightCount, weights, weightsHash, rates, ratesOff (score), ...auditScore, history }
//   floors(audit)                          round 9's floors, with this round's untrained arms
//   across(r), parseArgs(argv), checkRecords(lines), reading(lines), readingLines(R)
// NOT HERE: the 24 trainings (the command runs them; the gate never does).
"use strict";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { RULES } from "../../brain/rl/escapeEnv.mjs";
import { LifeEnv, EPISODES, handFly, told } from "../../brain/rl/lifeEnv.mjs";
import { MaskedCircuitPolicy } from "../../brain/rl/maskedCircuitPolicy.mjs";
import { FibreOnlyReflex } from "../../brain/rl/fibreOnlyReflex.mjs";
import { shuffledEdges } from "../../brain/rl/paintCircuitPolicy.mjs";
import { CELLS, VISUAL_INPUTS, EDGE_START, SHUFFLE_SEED } from "./flyEscapeVision.mjs";
import * as R10 from "./flyEscapeCoact.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights, hashEdges } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";

export const RECIPE = R10.RECIPE, AUDIT = R10.AUDIT, NEVER_FLEES = R10.NEVER_FLEES, auditScore = R10.auditScore, ACROSS_BY = R10.ACROSS_BY, ALPHA = R10.ALPHA;
export const SEEDS = Object.freeze(Array.from({ length: 12 }, (_, k) => k + 25));
export const ARMS = Object.freeze(["FIBRE", "FSHUF"]), LEAD = "FIBRE";
export const WEIGHTS = Object.freeze({ FIBRE: R10.WEIGHTS.COACT, FSHUF: R10.WEIGHTS.CSHUF });
export const RESULTS = "brain/flyEscapeFibreOnlyRound.jsonl";
const three = (a, b) => Object.freeze([`${a} BETTER THAN ${b}`, `${a} WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`]);
const FLY = "A FLY WHOSE NETWORK CANNOT OVERRULE ITS HABITUATING FIBRES";
const words = (a, b) => three(`${a} DOES`, b).map((w) => w.replace("DOES CANNOT", "CANNOT"));
export const WORDS = Object.freeze({ P: words(FLY, "A FLY THAT NEVER FLEES"), T1: words("THE REAL WIRING", "A SHUFFLE OF IT"), H: words(FLY, "THE HABITUATING REFLEX WRITTEN BY HAND") });

const REAL = Object.freeze(T.EDGES.map((e) => [e[0], e[1]]));
/** See the header. */
export function circuitOf(arm, s) {
    if (!ARMS.includes(arm)) throw new Error(`flyEscapeFibreOnly.circuitOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    return { units: CELLS, edges: arm === "FSHUF" ? shuffledEdges(CELLS, REAL.length, SHUFFLE_SEED + s) : REAL.map((e) => [...e]) };
}
/** See the header. */
export function policyOf(arm, s) {
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyEscapeFibreOnly.policyOf: a draw is a whole number from 1 (got ${s})`);
    const c = circuitOf(arm, s), inner = new MaskedCircuitPolicy({ obsDim: 13, units: c.units, inputs: VISUAL_INPUTS.map((e) => [...e]), edges: c.edges, outputs: [...T.GF], edgeStart: [...EDGE_START], seed: s });
    return new FibreOnlyReflex(inner, { rule: RULES.reflex, tail: T.GF.length + 1 });
}
const flyOf = (p) => () => (o) => p.act(o);
/** See the header. */
export function ratesOff(arm, s, weights) { const w = Float32Array.from(weights); w[0] = 0; w[1] = 0; return policyOf(arm, s).setParams(w); }
/** See the header. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    const fly = policyOf(arm, s), c = circuitOf(arm, s);
    const res = trainDockES({ envFactory: () => new LifeEnv(), obsDim: 13, actDim: 1, maxSteps: recipe.maxSteps, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s, policyFactory: () => policyOf(arm, s),
        ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    fly.setParams(res.params);
    return { kind: "draw", arm, s, recipe: { ...recipe }, units: c.units, edges: c.edges.length, edgesHash: hashEdges(c.edges), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rates: fly.rates(), ratesOff: auditScore(flyOf(ratesOff(arm, s, res.params)), audit).score, ...auditScore(flyOf(fly), audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
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
    const fl = lines.filter((r) => r && r.kind === "floors"), floorsOk = fl.length === 1 && ["reflex", "freeze", "hand", "told"].every((k) => fl[0][k] && fin(fl[0][k].score));
    for (const r of draws) {
        const id = `${r.arm} draw ${r.s}`;
        if (!ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} was trained with another recipe`);
        if (r.weightCount !== WEIGHTS[r.arm]) bad.push(`${id} has ${r.weightCount} weights (its arm has ${WEIGHTS[r.arm]})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (![r.score, r.decoy, r.ordinary].every(fin) || !Number.isInteger(r.nDecoy) || Math.abs(r.score - (r.decoy * r.nDecoy + r.ordinary * (AUDIT.length - r.nDecoy)) / AUDIT.length) > 1e-9 || !["decoy", "ordinary"].every((k) => Array.isArray(r.ep && r.ep[k]) && r.ep[k].length === EPISODES && r.ep[k].every(fin))) bad.push(`${id} has no score that is its decoy and ordinary lives'`);
        if (!(r.rates && fin(r.rates.a) && fin(r.rates.b) && r.rates.a >= 0 && r.rates.b >= 0)) bad.push(`${id}'s rates are not two numbers from 0`);
        if (!floorsOk || r.ratesOff !== fl[0].reflex.score) bad.push(`${id}'s score with its rates at 0 is not the reflex's: the network overrules the fibres`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
        const c = circuitOf(r.arm, r.s);
        if (r.edgesHash !== hashEdges(c.edges) || r.edges !== c.edges.length || r.units !== c.units) bad.push(`${id}'s wiring is not its arm's`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    if (!floorsOk) bad.push("the floors are not there once");
    else for (const a of ARMS) if (!(fl[0].untrained && fl[0].untrained[a] === fl[0].reflex.score)) bad.push(`the untrained ${a} fly does not score the reflex's number: the start is not the reflex`);
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (words, more, less) => words[more ? 0 : less ? 1 : 2];
/** ACROSS, as round 10 registered it: in decoy lives the fourth episode's mean return less the first's is at least 0.1. */
export const across = (r) => r.ep.decoy[EPISODES - 1] - r.ep.decoy[0] >= ACROSS_BY;
/** See the header. With a failed check no test is made. */
export function reading(lines) {
    const checks = checkRecords(lines), draws = lines.filter((r) => r && r.kind === "draw"), of = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score);
    const arms = {};
    for (const arm of ARMS) { const v = of(arm); if (!v.length) continue; const mean = (f) => v.reduce((n, r) => n + f(r), 0) / v.length;
        arms[arm] = { ...stats(v.map((r) => r.score)), decoy: mean((r) => r.decoy), ordinary: mean((r) => r.ordinary), signature: mean((r) => r.ep.decoy[EPISODES - 1] - r.ep.decoy[0]), neverFlee: v.filter((r) => r.ordinary < NEVER_FLEES).length,
            across: v.filter(across).length, a: mean((r) => r.rates.a), b: mean((r) => r.rates.b) };
        if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
    const fl = lines.find((r) => r && r.kind === "floors") || null;
    if (checks.length) return { checks, arms, floors: fl, P: null, T1: null, H: null };
    const sign = (name, ref) => { const h = signTest(scores(LEAD), ref); return { ...h, ref, word: pick(WORDS[name], h.p <= ALPHA && h.above > h.below, h.p <= ALPHA && h.below > h.above) }; };
    const t = rankSum(scores(LEAD), scores("FSHUF"));
    return { checks, arms, floors: fl, P: sign("P", fl.freeze.score), T1: { ...t, word: pick(WORDS.T1, t.p <= ALPHA && t.pHigher < t.pLower, t.p <= ALPHA && t.pLower < t.pHigher) }, H: sign("H", fl.hand.score) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: ${ARMS.length * SEEDS.length} draws, each once, the registered recipe, each arm's weight count and wiring, every fly the reflex with its rates at 0, ${LEAD} draw ${FIRST} the same twice, a history in every record, the floors, and every untrained fly the reflex`);
    out.push("", `the arms (the mean of 12 flies; 200 audit lives, ${R.floors ? R.floors.reflex.nDecoy : "?"} of them decoy lives):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(7)} ${f(s.mean)}  decoy lives ${f(s.decoy)}  ordinary lives ${f(s.ordinary)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | in decoy lives the 4th episode less the 1st ${f(s.signature)} | never flee ${s.neverFlee} of ${s.n} | ACROSS ${s.across} of ${s.n} | rates a ${f(s.a)} b ${f(s.b)}`);
    if (R.floors) { out.push("", "the floors:"); for (const [k, name] of [["reflex", "the reflex"], ["freeze", "never flees"], ["hand", "habituating reflex"], ["told", "told the kind"]]) { const x = R.floors[k]; out.push(`${name.padEnd(19)} ${f(x.score)}  decoy lives ${f(x.decoy)}  ordinary lives ${f(x.ordinary)}  | in decoy lives the 4th episode less the 1st ${f(x.ep.decoy[EPISODES - 1] - x.ep.decoy[0])}`); } }
    for (const [arm, a] of Object.entries(R.arms)) if (a.history) out.push(`${arm.padEnd(7)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
    for (const [name, h] of [[`P (${LEAD} against never fleeing)`, R.P], [`H (${LEAD} against the habituating reflex)`, R.H]]) if (h) out.push("", `${name}: of ${h.n}, ${h.above} above its ${f(h.ref)}, ${h.below} below, ${h.ties} equal; exact two-sided p ${h.p.toExponential(3)}`, `  ${h.word}`);
    if (R.T1) out.push("", `T1 (${LEAD} against FSHUF): ${LEAD}'s ranks sum to ${R.T1.sumA} (the middle is ${R.T1.n * (R.T1.n + R.T1.m + 1) / 2}), ties ${R.T1.ties}; exact two-sided p ${R.T1.p.toExponential(3)}`, `  ${R.T1.word}`);
    return out;
}
