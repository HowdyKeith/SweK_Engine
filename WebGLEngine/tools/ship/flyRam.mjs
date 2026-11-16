// WebGLEngine/tools/ship/flyRam.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY'S ESCAPE CIRCUIT AS A 6-DOF CRAFT'S COLLISION REFLEX, AS ARITHMETIC (registered in brain/FLY_RAM_REFLEX_WIP.md before this file existed): three arms -- round 5's real Giant Fiber visual
// circuit, its free shuffle, a free net on the same two numbers (tools/ship/flyEscapeVision.mjs ARMS_OF, used as they are) -- each trained 12 times on brain/rl/ramEnv.mjs (the Close pilot with a
// break-away reflex over it, against the PD autopilot, joust starts, collisions on) and read against the pilot alone, against a reflex written by hand, and against each other.
// The command is tools/ship/takeFlyRam.mjs.
//
//   RECIPE, SEEDS, ARMS, WEIGHTS, AUDIT, SCOPING, ALPHA, RESULTS, PILOT_FLOOR (the registration's number), WORDS, UNDER_FILE, under()
//   circuitOf(arm, s), policyOf(arm, s)    an arm's wiring and its untrained fly for draw s (output layer zero: the craft is its pilot)
//   auditScore(fly, seeds)                 { score (the mean reward), fight, ramHp (a game), ramGames, wins, losses, breaks (ticks a game), ticks (a game) }
//   trainOne(arm, s, recipe, audit)        one training: { kind: "draw", arm, s, recipe, units, edges, edgesHash, weightCount, weights, weightsHash, ...auditScore, history }
//   floors(audit)                          { kind: "floors", pilot, hand, always, untrained: { arm: score } }
//   parseArgs(argv)                        run [--jobs N] | read | job ARM S
//   checkRecords(lines), reading(lines) -> { checks, arms, floors, P, H, T1, T2, silent }, readingLines(R)
// NOT HERE: the 36 trainings (the command runs them; tools/ship/flyRam-selfcheck.mjs never does). Pure but for the pilot's weights file and what trainOne costs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import { RamEnv, WholeFly, RULES, OBS_DIM, ACT_DIM, fight } from "../../brain/rl/ramEnv.mjs";
import { ARMS_OF as VISION } from "./flyEscapeVision.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights, hashEdges } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const UNDER_FILE = "brain/pilot6dofWeightsClose.json";
let UNDER = null;
/** The pilot the reflex is over: the fruit fly's close-quarters pilot, from its file. */
export function under() {
    if (!UNDER) { const j = JSON.parse(fs.readFileSync(path.resolve(HERE, "..", "..", UNDER_FILE), "utf8")); if (!Array.isArray(j.weights) || j.weights.length !== P6.WEIGHT_COUNT) throw new Error(`flyRam.under: ${UNDER_FILE} has no ${P6.WEIGHT_COUNT} weights`); UNDER = P6.pilotFor(Float32Array.from(j.weights)); }
    return UNDER;
}
export const RECIPE = Object.freeze({ maxSteps: 1, iters: 60, pop: 32, sigma: 0.14, lr: 0.05, trainEps: 12, fresh: true, battery: 100 });
export const SEEDS = Object.freeze(Array.from({ length: 12 }, (_, k) => k + 1));
export const ARMS_OF = Object.freeze({ GF: VISION.GF, GSHUF: VISION.GSHUF, FREE: VISION.FREE });
export const ARMS = Object.freeze(Object.keys(ARMS_OF)), LEAD = "GF";
export const WEIGHTS = Object.freeze(Object.fromEntries(ARMS.map((a) => [a, ARMS_OF[a].weights])));
export const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 900001 + 7919 * k));
export const SCOPING = Object.freeze(Array.from({ length: 60 }, (_, k) => 1000001 + 37 * k));   // flown before the registration (its section 2) and by nothing here
export const ALPHA = 0.01, RESULTS = "brain/flyRamRound.jsonl", PILOT_FLOOR = 16.5092;
const three = (a, b) => Object.freeze([`${a} BETTER THAN ${b}`, `${a} WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`].map((w) => w.replace("FLIES CANNOT", "CANNOT").replace("TRAINS CANNOT", "CANNOT")));
export const WORDS = Object.freeze({
    P: three("A CRAFT WITH THE FLY'S ESCAPE CIRCUIT AS ITS COLLISION REFLEX FLIES", "ITS PILOT ALONE"),
    H: three("A CRAFT WITH THE FLY'S ESCAPE CIRCUIT AS ITS COLLISION REFLEX FLIES", "ONE WITH THE REFLEX WRITTEN BY HAND"),
    T1: three("AS A COLLISION REFLEX THE REAL ESCAPE CIRCUIT'S WIRING TRAINS", "A SHUFFLE OF IT"),
    T2: three("AS A COLLISION REFLEX THE REAL ESCAPE CIRCUIT TRAINS", "A FREE NET ON THE SAME TWO NUMBERS"),
});

/** See the header. */
export function circuitOf(arm, s) { if (!Object.hasOwn(ARMS_OF, arm)) throw new Error(`flyRam.circuitOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`); return ARMS_OF[arm].circuit(s); }
const factoryOf = (arm, s) => { const make = ARMS_OF[arm].make(s), tail = ARMS_OF[arm].under + 1; return (dims = {}) => new WholeFly(make(dims), { tail }); };
/** See the header: the network itself (act(obs) -> [number]), its output layer at zero. */
export function policyOf(arm, s) {
    if (!ARMS.includes(arm)) throw new Error(`flyRam.policyOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    return factoryOf(arm, s)({ obsDim: OBS_DIM, actDim: ACT_DIM, seed: s }).inner;
}
/** See the header. `fly` is anything with act(obs, see) -> [number]. */
export function auditScore(fly, seeds = AUDIT) {
    let score = 0, fgt = 0, ramHp = 0, ramGames = 0, wins = 0, losses = 0, breaks = 0, ticks = 0;
    for (const seed of seeds) { const r = fight(under(), fly, seed); score += r.reward; fgt += r.fight; ramHp += r.ramHp; if (r.rams > 0) ramGames++; if (r.win) wins++; if (r.loss) losses++; breaks += r.breaks; ticks += r.ticks; }
    const n = seeds.length; return { score: score / n, fight: fgt / n, ramHp: ramHp / n, ramGames, wins, losses, breaks: breaks / n, ticks: ticks / n };
}
/** See the header. `recipe` and `audit` are the registration's unless a gate hands in its own. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyRam.trainOne: a draw is a whole number from 1 (got ${s})`);
    const fly = policyOf(arm, s), circuit = circuitOf(arm, s);
    const res = trainDockES({ envFactory: () => new RamEnv({ under: under() }), obsDim: OBS_DIM, actDim: ACT_DIM, maxSteps: recipe.maxSteps, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s, policyFactory: factoryOf(arm, s),
        ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    fly.setParams(res.params);
    return { kind: "draw", arm, s, recipe: { ...recipe }, units: circuit.units, edges: circuit.edges.length, edgesHash: hashEdges(circuit.edges), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        ...auditScore(fly, audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header. */
export function floors(audit = AUDIT) {
    const out = { kind: "floors", pilot: auditScore(RULES.never, audit), hand: auditScore(RULES.hand, audit), always: auditScore(RULES.always, audit), untrained: {} };
    for (const arm of ARMS) out.untrained[arm] = auditScore(policyOf(arm, 1), audit).score;
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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), FIRST = SEEDS[0];
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
        if (![r.score, r.fight, r.ramHp, r.breaks, r.ticks].every(Number.isFinite) || r.ramHp < 0 || r.breaks < 0 || r.breaks > r.ticks || Math.abs(r.fight - r.score - r.ramHp * P6.REWARD.hit / P6.SHOT_DAMAGE) > 1e-9) bad.push(`${id} has no reward that is its fight less the price of its rams`);
        if (![r.ramGames, r.wins, r.losses].every((n) => Number.isInteger(n) && n >= 0 && n <= AUDIT.length) || r.wins + r.losses > AUDIT.length) bad.push(`${id} has no counts of the ${AUDIT.length} audit games`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && Number.isFinite(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
        const c = circuitOf(r.arm, r.s);
        if (r.edgesHash !== hashEdges(c.edges) || r.edges !== c.edges.length || r.units !== c.units) bad.push(`${id}'s wiring is not its arm's`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !["pilot", "hand", "always"].every((k) => fl[0][k] && Number.isFinite(fl[0][k].score)) || Math.abs(fl[0].pilot.score - PILOT_FLOOR) >= 5e-5) bad.push(`the floors are not there once with the registration's number for the pilot alone (${PILOT_FLOOR})`);
    else for (const a of ARMS) if (!(fl[0].untrained && fl[0].untrained[a] === fl[0].pilot.score)) bad.push(`the untrained ${a} craft does not score the pilot's number: the start is not the pilot alone`);
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (words, more, less) => words[more ? 0 : less ? 1 : 2];
/** See the header. `silent` is, an arm, how many craft never break on the audit. With a failed check no test is made. */
export function reading(lines) {
    const checks = checkRecords(lines), draws = lines.filter((r) => r && r.kind === "draw"), of = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score);
    const arms = {}, silent = {}; for (const arm of ARMS) { const v = of(arm); if (!v.length) continue; const mean = (k) => v.reduce((n, r) => n + (r[k] || 0), 0) / v.length;
        arms[arm] = { ...stats(v.map((r) => r.score)), fight: mean("fight"), ramHp: mean("ramHp"), ramGames: mean("ramGames"), wins: mean("wins"), losses: mean("losses"), breaks: mean("breaks") }; silent[arm] = v.filter((r) => r.breaks === 0).length;
        if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
    const fl = lines.find((r) => r && r.kind === "floors") || null;
    if (checks.length) return { checks, arms, floors: fl, silent, P: null, H: null, T1: null, T2: null };
    const sg = (name, ref) => { const t = signTest(scores(LEAD), ref); return { ...t, ref, word: pick(WORDS[name], t.p <= ALPHA && t.above > t.below, t.p <= ALPHA && t.below > t.above) }; };
    const rs = (name, other) => { const t = rankSum(scores(LEAD), scores(other)); return { ...t, word: pick(WORDS[name], t.p <= ALPHA && t.pHigher < t.pLower, t.p <= ALPHA && t.pLower < t.pHigher) }; };
    return { checks, arms, floors: fl, silent, P: sg("P", fl.pilot.score), H: sg("H", fl.hand.score), T1: rs("T1", "GSHUF"), T2: rs("T2", "FREE") };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4), row = (name, x) => `${name.padEnd(16)} ${f(x.score ?? x.mean)}  fight ${f(x.fight)}  W${x.wins.toFixed(1)} / L${x.losses.toFixed(1)}  games with a ram ${x.ramGames.toFixed(1)}  hit points to rams a game ${x.ramHp.toFixed(3)}  ticks breaking a game ${x.breaks.toFixed(1)}`;
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: ${ARMS.length * SEEDS.length} draws, each once, the registered recipe, each arm's weight count and wiring, ${LEAD} draw ${FIRST} the same twice, a history in every record, the registration's floor for the pilot alone, and every untrained craft its pilot`);
    out.push("", "the arms (the mean of 12 craft; 200 audit games each):");
    for (const [arm, s] of Object.entries(R.arms)) out.push(row(arm, s) + `  | reward sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)}; never break: ${R.silent[arm]} of ${s.n}`);
    if (R.floors) { out.push("", "the floors:"); for (const [k, name] of [["pilot", "the pilot alone"], ["hand", "hand reflex"], ["always", "break always"]]) if (R.floors[k]) out.push(row(name, R.floors[k])); }
    if (R.floors && R.floors.pilot) for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(7)} keeps ${(100 * s.ramHp / R.floors.pilot.ramHp).toFixed(1)} percent of the pilot's ram damage (the careful profile's bar is 50)`);
    for (const [arm, a] of Object.entries(R.arms)) if (a.history) out.push(`${arm.padEnd(7)} the trainer's own battery, mean reward at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
    for (const [name, t] of [[`P (${LEAD} against the pilot alone)`, R.P], [`H (${LEAD} against the hand reflex)`, R.H]]) if (t) out.push("", `${name}: of ${t.n}, ${t.above} above its ${f(t.ref)}, ${t.below} below, ${t.ties} equal; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`);
    for (const [name, t] of [[`T1 (${LEAD} against GSHUF)`, R.T1], [`T2 (${LEAD} against FREE)`, R.T2]]) if (t) out.push("", `${name}: ${LEAD}'s ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`);
    return out;
}
