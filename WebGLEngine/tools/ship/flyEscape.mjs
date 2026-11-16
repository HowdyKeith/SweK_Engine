// WebGLEngine/tools/ship/flyEscape.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY ESCAPES TO ITS HOME, AS ARITHMETIC (registered in brain/FLY_ESCAPE_WIP.md before this file existed): five arms -- the Giant Fiber Circuit's wiring, a shuffle of it, a plain net of its
// size, the zebrafish circuit's, a small MLP -- each trained 16 times on brain/rl/escapeEnv.mjs (a fly that feeds in the yard of its voxel house and runs home from what is on a collision course) and
// read against two flies written by hand and against each other. The command is tools/ship/takeFlyEscape.mjs.
//
//   RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS (the registration's five numbers), WORDS
//   circuitOf(arm, s), policyOf(arm, s)    an arm's wiring and its untrained fly for draw s
//   auditScore(act, seeds, maxSteps)       { score (the mean return), alive, fed (the mean share of the time fed), strikes, caught, passes, fledPass }; act is act(obs, env)
//   trainOne(arm, s, recipe, audit)        one training: { kind: "draw", arm, s, recipe, units, edges, edgesHash, weightCount, weights, weightsHash, score, alive, fed, strikes, caught, passes, fledPass, history }
//   floors(audit, maxSteps)                { kind: "floors", freeze, hide, fleeAll, reflex, told }: the four flies written by hand and the one that is told each mover's kind
//   parseArgs(argv)                        run [--jobs N] | read | job ARM S
//   checkRecords(lines)                    the registration's checks, as lines; [] when they hold
//   reading(lines)                         { checks, arms, floors, T0, T1, T2, T3 }; with a failed check no test is made
//   readingLines(R)
// ONE CODE, TWO ROUNDS (2026-11-15): everything below is makeEscapeRound(cfg). Round 1 is cfg { results }; round 2 (brain/FLY_ESCAPE_REFLEX_WIP.md, tools/ship/flyEscapeReflex.mjs) adds
// start: "reflex" (the fly is the reflex plus its network, brain/rl/reflexStart.mjs; T0 and T3 are then both against the reflex, the floors carry every arm's untrained fly, and the reading
// says whether T1 is asked of flies that do the task) and report: "return" (the trainer keeps the best return: brain/rl/escapeEnv.mjs REPORT). Round 3 adds fresh: true and
// battery: 200 (the trainer's own episodes: brain/rl/dockPolicy.js). Round 4 adds memory: true (brain/rl/carryCircuit.mjs: four arms, the MLP not among them).
// NOT HERE: the 80 trainings (the command runs them; tools/ship/flyEscape-selfcheck.mjs never does). Pure but for what trainOne costs.
"use strict";
import { trainDockES, FlightPolicy } from "../../brain/rl/dockPolicy.js";
import { EscapeEnv, OBS_DIM, ACT_DIM, RULES } from "../../brain/rl/escapeEnv.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights, hashEdges } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import { ReflexStart } from "../../brain/rl/reflexStart.mjs";
import { CarryCircuitPolicy } from "../../brain/rl/carryCircuit.mjs";

/** See the header: a round's whole arithmetic for a cfg { results, start: "reflex" (optional), report: "lived" | "return" (optional) }. */
export function makeEscapeRound(cfg) {
if (!cfg || typeof cfg.results !== "string" || (cfg.start !== undefined && cfg.start !== "reflex") || (cfg.report !== undefined && cfg.report !== "lived" && cfg.report !== "return") ||
    (cfg.fresh !== undefined && cfg.fresh !== true) || (cfg.battery !== undefined && !(Number.isInteger(cfg.battery) && cfg.battery >= 24)) || (cfg.memory !== undefined && cfg.memory !== true)) throw new Error("flyEscape.makeEscapeRound: a cfg is { results, start: \"reflex\" (optional), report: \"lived\" | \"return\" (optional) }");
const RECIPE = Object.freeze({ maxSteps: 160, iters: 150, pop: 96, sigma: 0.14, lr: 0.05, trainEps: 8, ...(cfg.fresh ? { fresh: true } : {}), ...(cfg.battery ? { battery: cfg.battery } : {}) });   // round 3: the trainer's fresh episodes and its battery's size (brain/rl/dockPolicy.js), carried in the recipe so a record says how it was trained
// 2026-11-16 -- A ROUND MAY NAME ITS OWN DRAWS (cfg.seeds: distinct whole numbers above 0, at least two; round 6 uses 17 to 48). Without it nothing changes: draws 1 to 16. The draw trained a second
// time is the first of them.
if (cfg.seeds !== undefined && !(Array.isArray(cfg.seeds) && cfg.seeds.length >= 2 && cfg.seeds.every((s) => Number.isInteger(s) && s > 0) && new Set(cfg.seeds).size === cfg.seeds.length)) throw new Error("flyEscape.makeEscapeRound: cfg.seeds is a list of distinct whole numbers above 0, at least two");
const SEEDS = Object.freeze(cfg.seeds === undefined ? Array.from({ length: 16 }, (_, k) => k + 1) : [...cfg.seeds]), FIRST = SEEDS[0];
const MEMORY = cfg.memory === true;   // round 4: a unit's activity is carried from one tick to the next (brain/rl/carryCircuit.mjs); the MLP has nothing to carry and is not in such a round
// 2026-11-16 -- A ROUND MAY BRING ITS OWN ARMS (cfg.arms: { NAME: { weights, under, circuit(s) -> { units, edges }, make(s) -> ({ obsDim, actDim, seed }) -> policy } }; `under` is how many weights its
// output reads, so the reflex start can zero them and the bias). Then cfg.lead is the arm T0 and the recheck are of (the first unless given), cfg.versus the arms T1 and T2 set it against, and
// cfg.words may give T1's and T2's words. Without cfg.arms nothing changes: the five arms below, FLY the lead, against SHUF and PLAIN.
const CUSTOM = cfg.arms || null;
if (CUSTOM && !(Object.keys(CUSTOM).length >= 2 && Object.values(CUSTOM).every((a) => a && Number.isInteger(a.weights) && Number.isInteger(a.under) && typeof a.circuit === "function" && typeof a.make === "function"))) throw new Error("flyEscape.makeEscapeRound: cfg.arms is { NAME: { weights, under, circuit(s), make(s) } } for at least two arms");
const ARMS = Object.freeze(CUSTOM ? Object.keys(CUSTOM) : MEMORY ? ["FLY", "SHUF", "PLAIN", "FISH"] : ["FLY", "SHUF", "PLAIN", "FISH", "MLP"]);
const LEAD = cfg.lead === undefined ? (CUSTOM ? ARMS[0] : "FLY") : cfg.lead, VERSUS = Object.freeze(cfg.versus === undefined ? (CUSTOM ? ARMS.slice(1, 3) : ["SHUF", "PLAIN"]) : [...cfg.versus]);
if (!ARMS.includes(LEAD) || VERSUS.length < 1 || VERSUS.length > 2 || !VERSUS.every((a) => ARMS.includes(a) && a !== LEAD)) throw new Error("flyEscape.makeEscapeRound: cfg.lead is one of the arms and cfg.versus one or two others");
const MLP_HIDDEN = Object.freeze([16, 16]), PLAIN_UNITS = 55;
const WEIGHTS = Object.freeze(CUSTOM ? Object.fromEntries(ARMS.map((a) => [a, CUSTOM[a].weights])) : { FLY: 824, SHUF: 824, PLAIN: 826, FISH: 664, MLP: 513 });
const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 900001 + 7919 * k));
const ALPHA = 0.01, RESULTS = cfg.results;
const START = cfg.start === undefined ? null : cfg.start, REPORT = cfg.report === undefined ? "lived" : cfg.report;   // round 2: the fly is the reflex plus its network (brain/rl/reflexStart.mjs), and the trainer keeps the best return
const FLOORS = Object.freeze({ freeze: 0.2840, hide: 0.5000, fleeAll: 0.5395, reflex: 0.6465, told: 0.8351 });
const WORDS = Object.freeze({
    T0: ["A FLY-WIRED FLY ESCAPES BETTER THAN THE REFLEX WRITTEN BY HAND", "A FLY-WIRED FLY ESCAPES WORSE THAN THE REFLEX WRITTEN BY HAND", "A FLY-WIRED FLY CANNOT BE TOLD APART FROM THE REFLEX WRITTEN BY HAND"],
    T1: ["THE FLY'S WIRING ESCAPES BETTER THAN A SHUFFLE OF IT", "THE FLY'S WIRING ESCAPES WORSE THAN A SHUFFLE OF IT", "THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT"],
    T2: ["THE FLY'S WIRING ESCAPES BETTER THAN A PLAIN NET OF ITS SIZE", "THE FLY'S WIRING ESCAPES WORSE THAN A PLAIN NET OF ITS SIZE", "THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE"],
    T3: ["A TRAINED FLY ESCAPES BETTER THAN FLEEING FROM EVERYTHING", "A TRAINED FLY ESCAPES WORSE THAN FLEEING FROM EVERYTHING", "A TRAINED FLY CANNOT BE TOLD APART FROM FLEEING FROM EVERYTHING"],
    ...(START === "reflex" ? {
        T0: ["A FLY-WIRED FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX", "A FLY-WIRED FLY STARTED AT THE REFLEX ESCAPES WORSE THAN THE REFLEX", "A FLY-WIRED FLY STARTED AT THE REFLEX CANNOT BE TOLD APART FROM THE REFLEX"],
        T3: ["A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX", "A FLY STARTED AT THE REFLEX ESCAPES WORSE THAN THE REFLEX", "A FLY STARTED AT THE REFLEX CANNOT BE TOLD APART FROM THE REFLEX"],
    } : {}),
    ...(cfg.words || {}),
});

/** See the header. */
function circuitOf(arm, s) {
    if (CUSTOM) { if (!Object.hasOwn(CUSTOM, arm)) throw new Error(`flyEscape.circuitOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`); return CUSTOM[arm].circuit(s); }
    if (arm === "PLAIN") return { units: PLAIN_UNITS, edges: [] };
    if (arm === "FLY" || arm === "SHUF" || arm === "FISH") return P.ARMS[arm](s);
    throw new Error(`flyEscape.circuitOf: no circuit arm ${arm} (FLY, SHUF, PLAIN, FISH)`);
}
const CLOCK = 10;
const started = (inner, under) => (START === "reflex" ? new ReflexStart(inner, { rule: RULES.reflex, tail: under + 1 }) : inner);   // the output layer of a one-output net: `under` weights and a bias
const factoryOf = (arm, s) => {
    if (CUSTOM) { const make = CUSTOM[arm].make(s), under = CUSTOM[arm].under; return (dims = {}) => started(make(dims), under); }
    if (arm === "MLP") return ({ obsDim, actDim, seed } = {}) => started(new FlightPolicy({ hidden: [...MLP_HIDDEN], obsDim, actDim, seed: seed ?? 3 }), MLP_HIDDEN[MLP_HIDDEN.length - 1]);
    const c = circuitOf(arm, s), Circuit = MEMORY ? CarryCircuitPolicy : P.CircuitPolicy;   // the clock is the environment's eleventh number, the step over maxSteps: 0 at an episode's first tick
    return ({ obsDim, actDim, seed } = {}) => started(new Circuit({ obsDim, actDim, units: c.units, edges: c.edges, seed: seed ?? 1234, ...(MEMORY ? { clock: CLOCK } : {}) }), c.units);
};
/** See the header. */
function policyOf(arm, s) {
    if (!ARMS.includes(arm)) throw new Error(`flyEscape.policyOf: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    return factoryOf(arm, s)({ obsDim: OBS_DIM, actDim: ACT_DIM, seed: s });
}
/** See the header. `act` is act(obs, env) -> [number]; a policy is given as (o) => policy.act(o). */
function auditScore(act, seeds = AUDIT, maxSteps = RECIPE.maxSteps) {
    const env = new EscapeEnv({ maxSteps }); let sum = 0, alive = 0, fed = 0, strikes = 0, caught = 0, passes = 0, fledPass = 0;
    for (const seed of seeds) {
        let o = env.reset(seed), done = false, ret = 0; while (!done) { const r = env.step(act(o, env)); ret += r.reward; o = r.obs; done = r.done; }
        sum += ret; fed += env.fed / maxSteps; if (!env.caught) alive++;
        for (const m of env.log) { if (m.kind === "strike") { strikes++; if (m.caught) caught++; } else { passes++; if (m.fled) fledPass++; } }
    }
    return { score: sum / seeds.length, alive, fed: fed / seeds.length, strikes, caught, passes, fledPass };
}
/** See the header. `recipe` and `audit` are the registration's unless a gate hands in its own. */
function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyEscape.trainOne: a draw is a whole number from 1 (got ${s})`);
    const fly = policyOf(arm, s), circuit = !CUSTOM && arm === "MLP" ? null : circuitOf(arm, s);
    const res = trainDockES({ envFactory: (o = {}) => new EscapeEnv({ maxSteps: recipe.maxSteps, report: REPORT, ...o }), obsDim: OBS_DIM, actDim: ACT_DIM, maxSteps: recipe.maxSteps, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s, policyFactory: factoryOf(arm, s),
        ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    fly.setParams(res.params);
    const a = auditScore((o) => fly.act(o), audit, recipe.maxSteps);
    return { kind: "draw", arm, s, recipe: { ...recipe }, units: circuit ? circuit.units : null, edges: circuit ? circuit.edges.length : null, edgesHash: circuit ? hashEdges(circuit.edges) : null,
        weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params), ...a, history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn, lived: h.dockRate })) };
}
const TOLD = (o, env) => [env.mover && env.mover.kind === "strike" ? 1 : -1];
/** See the header. */
function floors(audit = AUDIT, maxSteps = RECIPE.maxSteps) {
    const out = { kind: "floors" }; for (const [name, act] of Object.entries(RULES)) out[name] = auditScore(act, audit, maxSteps);
    out.told = auditScore(TOLD, audit, maxSteps);
    if (START) { out.untrained = {}; for (const arm of ARMS) { const fly = policyOf(arm, 1); out.untrained[arm] = auditScore((o) => fly.act(o), audit, maxSteps).score; } }   // the start: every arm's untrained fly
    return out;
}

/** See the header. `job` takes a registered arm and draw only; `run` at least one process. */
function parseArgs(argv) {
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
function checkRecords(lines) {
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
        if (!Number.isInteger(r.alive) || r.alive < 0 || r.alive > AUDIT.length) bad.push(`${id} has no count of episodes lived`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && Number.isFinite(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
        if (CUSTOM || r.arm !== "MLP") {
            const c = circuitOf(r.arm, r.s);
            if (r.edgesHash !== hashEdges(c.edges) || r.edges !== c.edges.length || r.units !== c.units) bad.push(`${id}'s wiring is not its arm's`);
            if (!CUSTOM && r.arm === "SHUF") {
                const set = new Set(c.edges.map((e) => e[0] * c.units + e[1]));
                if (c.edges.length !== 313 || set.size !== 313 || c.edges.some((e) => e[0] === e[1])) bad.push(`${id}'s shuffle is not 313 distinct off-diagonal pairs`);
                if (r.edgesHash === hashEdges(P.ARMS.FLY().edges)) bad.push(`${id}'s shuffle is the fly's own wiring`);
            }
        }
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), fly1 = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !fly1 || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== fly1.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !Object.keys(FLOORS).every((k) => fl[0][k] && Number.isFinite(fl[0][k].score) && Math.abs(fl[0][k].score - FLOORS[k]) < 5e-5)) bad.push("the floors are not there once with the registration's five numbers (freeze 0.2840, hide 0.5000, fleeAll 0.5395, reflex 0.6465, told 0.8351)");
    if (START === "reflex" && fl.length === 1) for (const a of ARMS) if (!(fl[0].untrained && fl[0].reflex && fl[0].untrained[a] === fl[0].reflex.score)) bad.push(`the untrained ${a} fly does not score the reflex's number: the start is not the reflex`);
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (three, more, less) => three[more ? 0 : less ? 1 : 2];
/** See the header. */
function reading(lines) {
    const checks = checkRecords(lines), draws = lines.filter((r) => r && r.kind === "draw"), of = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score);
    const arms = {}; for (const arm of ARMS) { const v = of(arm); if (!v.length) continue; const mean = (k) => v.reduce((n, r) => n + (r[k] || 0), 0) / v.length;
        arms[arm] = { ...stats(v.map((r) => r.score)), alive: mean("alive"), fed: mean("fed"), fledPass: v.reduce((n, r) => n + (r.fledPass || 0), 0) / Math.max(1, v.reduce((n, r) => n + (r.passes || 0), 0)), caught: v.reduce((n, r) => n + (r.caught || 0), 0) / Math.max(1, v.reduce((n, r) => n + (r.strikes || 0), 0)) };
        if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
    const fl = lines.find((r) => r && r.kind === "floors") || null;
    if (checks.length) return { checks, arms, floors: fl, T0: null, T1: null, T2: null, T3: null, ...(START ? { asked: null } : {}) };
    const sg = (name, values, ref) => { const t = signTest(values, ref); return { ...t, sign: true, ref, word: pick(WORDS[name], t.p <= ALPHA && t.above > t.below, t.p <= ALPHA && t.below > t.above) }; };
    const rs = (name, other) => { const t = rankSum(scores(LEAD), other); return { ...t, word: pick(WORDS[name], t.p <= ALPHA && t.pHigher < t.pLower, t.p <= ALPHA && t.pLower < t.pHigher) }; };
    return { checks, arms, floors: fl, T0: sg("T0", scores(LEAD), fl.reflex.score), T1: rs("T1", scores(VERSUS[0])), T2: VERSUS.length > 1 ? rs("T2", scores(VERSUS[1])) : null, T3: sg("T3", ARMS.flatMap((a) => scores(a)), START === "reflex" ? fl.reflex.score : fl.fleeAll.score),
        ...(START === "reflex" ? { asked: arms[LEAD].mean >= fl.reflex.score && arms[VERSUS[0]].mean >= fl.reflex.score } : {}) };   // round 2: is T1 asked of flies that do the task (registered: both arms' means at or above the reflex)
}
/** See the header. */
function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: ${ARMS.length * SEEDS.length} draws, each once, the registered recipe, each arm's weight count and wiring, ${LEAD} draw ${FIRST} the same twice, a history in every record, the registration's floors`);
    out.push("", "arm     n   mean    sd      least   most    lives (of 200)  feeds   leaves for a pass  caught by a strike");
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(7)} ${String(s.n).padStart(2)}  ${f(s.mean)}  ${f(s.sd)}  ${f(s.min)}  ${f(s.max)}  ${s.alive.toFixed(1).padStart(6)}          ${s.fed.toFixed(3)}   ${s.fledPass.toFixed(3)}              ${s.caught.toFixed(3)}`);
    if (R.floors) { out.push(""); for (const k of Object.keys(FLOORS)) { const x = R.floors[k]; if (x) out.push(`${(k === "told" ? "told the kind" : k).padEnd(14)} ${f(x.score)}  lives ${String(x.alive).padStart(3)}  feeds ${x.fed.toFixed(3)}   leaves for a pass ${(x.fledPass / Math.max(1, x.passes)).toFixed(3)}   caught by a strike ${(x.caught / Math.max(1, x.strikes)).toFixed(3)}`); } }
    for (const [arm, a] of Object.entries(R.arms)) if (a.history) out.push(`${arm.padEnd(7)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
    for (const [name, t] of [[START === "reflex" ? "T3 (all the flies against the reflex)" : "T3 (all the trained flies against fleeAll)", R.T3], [`T0 (${LEAD} against the reflex)`, R.T0]]) if (t) out.push("", `${name}: of ${t.n}, ${t.above} above its ${f(t.ref)}, ${t.below} below, ${t.ties} equal; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`);
    if (R.asked !== undefined && R.asked !== null) out.push("", R.asked ? `T1 IS ASKED OF FLIES THAT DO THE TASK: the ${LEAD} arm's mean and the ${VERSUS[0]} arm's are both at or above the reflex's` : `T1 IS NOT ASKED OF FLIES THAT DO THE TASK: the ${LEAD} arm's mean or the ${VERSUS[0]} arm's is below the reflex's`);
    for (const [name, t] of [[`T1 (${LEAD} against ${VERSUS[0]})`, R.T1], [`T2 (${LEAD} against ${VERSUS[1]})`, R.T2]]) if (t) out.push("", `${name}: the fly's ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`);
    return out;
}
return Object.freeze({ LEAD, VERSUS, MEMORY, START, REPORT, RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, WORDS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords, reading, readingLines });
}

/** Round 1 (brain/FLY_ESCAPE_WIP.md): a random start, and the trainer told which episodes LIVED. */
export const ROUND1 = Object.freeze({ results: "brain/flyEscapeRound.jsonl" });
export const { RECIPE, SEEDS, ARMS, MLP_HIDDEN, PLAIN_UNITS, WEIGHTS, AUDIT, ALPHA, RESULTS, FLOORS, WORDS, circuitOf, policyOf, auditScore, trainOne, floors, parseArgs, checkRecords, reading, readingLines } = makeEscapeRound(ROUND1);
