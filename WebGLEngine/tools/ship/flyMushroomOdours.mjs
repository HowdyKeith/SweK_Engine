// WebGLEngine/tools/ship/flyMushroomOdours.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// REAL ODOURS THROUGH THE PROJECTION NEURONS, AS ARITHMETIC (registered in brain/FLY_MUSHROOM_ODOURS_WIP.md before this file existed): DOES THE REAL WIRING CODE THEM BETTER, AND DOES THE
// TEACHERS' PAIRING MATTER NOW?
// The task is brain/rl/pnOdorEnv.mjs (task ONE), given its wiring from vendor/male-cns/pn-kc-circuit.json (read here: the projection neurons, their glomeruli, the 4,064 Kenyon cells in the
// mushroom body file's order); the fly and its teachers are the mushroom round's (tools/ship/flyMushroom.mjs). Three arms, 12 draws each:
//   PLASTIC  the real projection-neuron wiring, the real teachers
//   SHUFPN   the real connections with their projection-neuron ends permuted among them (seed SHUF_SEED + draw), the real teachers
//   PFAM     the real wiring, the mushroom round's PFAM teachers (permuted among the output neurons, seed 6000 + draw)
// Readings: T1 (PLASTIC against SHUFPN) and T2 (PLASTIC against PFAM), exact rank sums; H (PLASTIC against the hand rule), a sign test; counted: USES (the score less the score with p_a at 0,
// above 0.01). Described: the rates, and the Kenyon-cell overlap of a life's two odours on each wiring. The command is tools/ship/takeFlyMushroomOdours.mjs.
//
//   RECIPE, SEEDS, ARMS, LEAD, AUDIT, ALPHA, USES_BY, SHUF_SEED, RESULTS, MUSHROOM, MUSHROOM_SHA256, PNKC, PNKC_SHA256, WIRING, WORDS
//   shuffledPN(seed)                    the real connections with their projection-neuron ends permuted (a Fisher-Yates of odorEnv's stream)
//   wiringOf(arm, s), wiringHash(w), teachArm(arm), flyOf(arm, s), envOf(wiring)
//   auditScore(fly, wiring, lives)      the mean return of a fly over lives of task ONE on the wiring
//   overlapOf(wiring, lives)            the mean share of odour A's Kenyon cells that odour B makes fire too (the life's odours without noise)
//   trainOne(arm, s, recipe, audit)     { kind: "draw", arm, s, recipe, wiringHash, teachHash, weightCount, weights, weightsHash, rate, ratesOff, score, overlap, history }
//   floors(audit)                       { kind: "floors", start, hand } -- the untrained fly and the hand rule, on the real wiring
//   fileOf(bytes), uses(r), parseArgs(argv), checkRecords(lines, mushroom, wiringSha), reading(lines, mushroom), readingLines(R)
// NOT HERE: the 36 trainings (the command runs them; the gate never does).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { TRIALS, stream } from "../../brain/rl/odorEnv.mjs";
import { PnOdorEnv } from "../../brain/rl/pnOdorEnv.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as M from "./flyMushroom.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RECIPE = M.RECIPE, SEEDS = M.SEEDS, ALPHA = 0.01, USES_BY = M.USES_BY, SHUF_SEED = 4000;
export const ARMS = Object.freeze(["PLASTIC", "SHUFPN", "PFAM"]), LEAD = "PLASTIC";
export const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 11000001 + 7919 * k));
export const RESULTS = "brain/flyMushroomOdoursRound.jsonl", MUSHROOM = M.RESULTS, MUSHROOM_SHA256 = "b4d8db8d8139598765767921a7e43d97ec3e183889a929f4df60653f75e9cc31";
export const PNKC = "vendor/male-cns/pn-kc-circuit.json", PNKC_SHA256 = "b885db58c7284b2096a7fcecb6d72d39e0ab9ec65640315ce559023f570af1e7";

/** The wiring from the vendored file (see the header): real is [pn, kc, synapses], pn the projection neuron's place among them, kc the Kenyon cell's in the mushroom body file's order. */
export const WIRING = (() => {
    const bytes = fs.readFileSync(path.join(ENG, PNKC)), d = JSON.parse(bytes.toString("utf8")), C = d.cells, of = (g) => C.map((c, i) => i).filter((i) => C[i].group === g);
    const pn = of("PN"), kc = of("KC"), ppos = new Map(pn.map((i, p) => [i, p])), kpos = new Map(kc.map((i, p) => [i, p]));
    const glomeruli = Object.freeze([...new Set(pn.map((i) => C[i].glomerulus).filter(Boolean))].sort()), pnGlom = Object.freeze(pn.map((i) => (C[i].glomerulus ? glomeruli.indexOf(C[i].glomerulus) : -1)));
    if (!d.edges.every(([i, j]) => ppos.has(i) && kpos.has(j))) throw new Error("flyMushroomOdours.WIRING: a connection of the vendored file is not projection neuron to Kenyon cell");
    const mb = JSON.parse(fs.readFileSync(path.join(ENG, "vendor/male-cns/mushroom-body-circuit.json"), "utf8")).cells.filter((c) => c.group === "KC").map((c) => c.bodyId);
    if (mb.length !== kc.length || !kc.every((i, p) => C[i].bodyId === mb[p])) throw new Error("flyMushroomOdours.WIRING: the two vendored files' Kenyon cells are not the same cells in the same order");
    return Object.freeze({ sha256: createHash("sha256").update(bytes).digest("hex"), npn: pn.length, nk: kc.length, ng: glomeruli.length, glomeruli, pnGlom, real: Object.freeze(d.edges.map(([i, j, n]) => Object.freeze([ppos.get(i), kpos.get(j), n]))) });
})();

const armOk = (arm, s, who) => {
    if (!ARMS.includes(arm)) throw new Error(`flyMushroomOdours.${who}: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyMushroomOdours.${who}: a draw is a whole number from 1 (got ${s})`);
};
/** See the header: every Kenyon cell keeps its claws and their synapse counts, every projection neuron its number of connections. */
export function shuffledPN(seed) {
    const r = stream(seed), pre = WIRING.real.map((e) => e[0]);
    for (let i = pre.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pre[i], pre[j]] = [pre[j], pre[i]]; }
    return WIRING.real.map((e, i) => [pre[i], e[1], e[2]]);
}
const WMEMO = new Map();
/** See the header: an arm's projection-neuron wiring (PLASTIC's and PFAM's the real one). */
export function wiringOf(arm, s) { armOk(arm, s, "wiringOf"); if (arm !== "SHUFPN") return WIRING.real; const k = SHUF_SEED + s; if (!WMEMO.has(k)) WMEMO.set(k, shuffledPN(k)); return WMEMO.get(k); }
/** A short hash of a wiring. */
export function wiringHash(w) { return createHash("sha256").update(JSON.stringify(w)).digest("hex").slice(0, 16); }
/** See the header: the mushroom round's arm whose teachers an arm has. */
export function teachArm(arm) { return arm === "PFAM" ? "PFAM" : "PLASTIC"; }
/** See the header: the mushroom round's fly with the arm's teachers. */
export function flyOf(arm, s) { armOk(arm, s, "flyOf"); return M.policyOf(teachArm(arm), s); }
/** See the header: task ONE on a wiring. */
export function envOf(wiring) { return new PnOdorEnv({ task: "ONE", nk: WIRING.nk, ng: WIRING.ng, pnGlom: WIRING.pnGlom, wiring }); }
/** See the header. */
export function auditScore(fly, wiring, lives = AUDIT) {
    const env = envOf(wiring); let sum = 0;
    for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { const r = env.step(fly.act(o)); o = r.obs; done = r.done; } sum += env.ret; }
    return sum / lives.length;
}
/** See the header. */
export function overlapOf(wiring, lives = AUDIT) {
    const env = envOf(wiring); let sum = 0;
    for (const seed of lives) { env.reset(seed); const a = env.kcsOf(env.odors[0]), b = new Set(env.kcsOf(env.odors[1])); let c = 0; for (const k of a) if (b.has(k)) c++; sum += c / Math.max(1, a.length); }
    return sum / lives.length;
}
/** See the header. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    armOk(arm, s, "trainOne"); const wiring = wiringOf(arm, s), t = teachArm(arm);
    const res = trainDockES({ envFactory: () => envOf(wiring), obsDim: 1, actDim: 1, maxSteps: TRIALS, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => flyOf(arm, s), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    const fly = flyOf(arm, s).setParams(res.params);
    return { kind: "draw", arm, s, recipe: { ...recipe }, wiringHash: wiringHash(wiring), teachHash: M.teachHash(M.teachFor(t, s)), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rate: fly.rate(), ratesOff: auditScore(M.ratesOff(t, s, res.params), wiring, audit), score: auditScore(fly, wiring, audit), overlap: overlapOf(wiring, audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header. */
export function floors(audit = AUDIT) { return { kind: "floors", start: auditScore(M.policyOf("PLASTIC", 1), WIRING.real, audit), hand: auditScore(M.policyOf("PLASTIC", 1).setParams(M.HAND), WIRING.real, audit) }; }
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export const uses = (r) => r.score - r.ratesOff > USES_BY;
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
/** See the header. `mushroom` is fileOf(the mushroom round's committed file); `wiringSha` the vendored wiring's sha256 as read (a gate gives another to see the check fail). */
export function checkRecords(lines, mushroom, wiringSha = WIRING.sha256) {
    const bad = [];
    if (wiringSha !== PNKC_SHA256) bad.push(`the vendored projection-neuron wiring is not the file committed (sha256 ${PNKC_SHA256.slice(0, 16)}...)`);
    if (!mushroom || mushroom.sha256 !== MUSHROOM_SHA256) bad.push(`the mushroom round's file is not the one committed (sha256 ${MUSHROOM_SHA256.slice(0, 16)}...)`);
    else { const mb = M.checkRecords(mushroom.lines); if (mb.length) bad.push(`the mushroom round's file fails its own checks: ${mb[0]}`); }
    if (bad.length) return bad;
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== ARMS.length * SEEDS.length) bad.push(`${draws.length} draws (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.arm} draw ${r.s}`;
        if (!ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        const t = teachArm(r.arm);
        if (!same(r.recipe, RECIPE)) bad.push(`${id} was trained with another recipe`);
        if (r.wiringHash !== wiringHash(wiringOf(r.arm, r.s))) bad.push(`${id}'s projection-neuron wiring is not its arm's`);
        // the mushroom round's file passes its own checks above, and they hold its every record's teachers to teachFor: so teachFor's are its committed ones
        if (r.teachHash !== M.teachHash(M.teachFor(t, r.s))) bad.push(`${id}'s teachers are not the mushroom round's ${t} draw ${r.s}'s`);
        if (r.weightCount !== M.WEIGHTS.PLASTIC) bad.push(`${id} has ${r.weightCount} weights (the fly has ${M.WEIGHTS.PLASTIC})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!(fin(r.score) && r.score >= -1 && r.score <= 1)) bad.push(`${id} has no score from -1 to 1`);
        if (!(fin(r.rate) && r.rate >= 0)) bad.push(`${id}'s rate is not finite and 0 or more`);
        if (!fin(r.ratesOff)) bad.push(`${id} has no score with its rate at 0`);
        if (!(fin(r.overlap) && r.overlap >= 0 && r.overlap <= 1)) bad.push(`${id} has no overlap of its odours from 0 to 1`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !fin(fl[0].start) || !fin(fl[0].hand)) bad.push("the floors are not there once");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const three = (a, b) => Object.freeze([`${a} LEARNS THE ODOURS BETTER THAN ${b}`, `${a} LEARNS THE ODOURS WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b} AT LEARNING THE ODOURS`]);
const REAL = "THE FLY ON THE REAL PROJECTION-NEURON WIRING, TAUGHT BY ITS REAL TEACHERS,";
export const WORDS = Object.freeze({ T1: three(REAL, "ONE ON A SHUFFLE OF THAT WIRING"), T2: three(REAL, "ONE WHOSE PURE TEACHERS ARE OTHER NEURONS'"), H: three(REAL, "THE RULE SET BY HAND") });
const VS = Object.freeze({ T1: "SHUFPN", T2: "PFAM" });
/** See the header. A failed check leaves every reading null. */
export function reading(lines, mushroom) {
    const checks = checkRecords(lines, mushroom), draws = lines.filter((r) => r && r.kind === "draw"), fl = lines.find((r) => r && r.kind === "floors") || null;
    const of = (arm) => draws.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score), arms = {}, avg = (v, f) => v.reduce((n, r) => n + f(r), 0) / v.length;
    for (const arm of ARMS) { const v = of(arm); if (!v.length) continue; arms[arm] = { ...stats(scores(arm)), rate: avg(v, (r) => r.rate), uses: v.filter(uses).length, ratesOff: avg(v, (r) => r.ratesOff), overlap: avg(v, (r) => r.overlap) };
        if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
    const out = { checks, arms, floors: fl, T1: null, T2: null, H: null };
    if (checks.length) return out;
    for (const [name, b] of Object.entries(VS)) { const h = rankSum(scores(LEAD), scores(b)), w = WORDS[name]; out[name] = { ...h, a: LEAD, b, word: h.p <= ALPHA && h.pHigher < h.pLower ? w[0] : h.p <= ALPHA && h.pLower < h.pHigher ? w[1] : w[2] }; }
    const h = signTest(scores(LEAD), fl.hand), w = WORDS.H; out.H = { ...h, a: LEAD, ref: fl.hand, word: h.p <= ALPHA && h.above > h.below ? w[0] : h.p <= ALPHA && h.below > h.above ? w[1] : w[2] };
    return out;
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: the vendored wiring and the mushroom round's file as committed, the latter passing its own checks; ${ARMS.length * SEEDS.length} draws, each once, the registered recipe, each arm's wiring, the mushroom round's teachers, a score with the rate at 0, an overlap and a history in every record; ${LEAD} draw ${FIRST} the same twice; the floors`);
    out.push("", `task ONE through the projection neurons (the mean of 12 flies; ${AUDIT.length} audit lives):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(8)} ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${f(s.rate)} | USES ${s.uses} of ${s.n} | with p_a at 0 ${f(s.ratesOff)} | the odours' Kenyon-cell overlap ${f(s.overlap)}`);
    if (R.floors) out.push(`  the start ${f(R.floors.start)}, the hand rule ${f(R.floors.hand)}`);
    for (const [arm, a] of Object.entries(R.arms)) if (a.history) out.push(`  ${arm.padEnd(8)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
    for (const name of ["T1", "T2"]) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${t.b}): ${t.a}'s ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    if (R.H) out.push("", `H (${R.H.a} against the hand rule ${f(R.H.ref)}): above ${R.H.above}, below ${R.H.below}, ties ${R.H.ties}; exact two-sided p ${R.H.p.toExponential(3)}`, `  ${R.H.word}`);
    return out;
}
