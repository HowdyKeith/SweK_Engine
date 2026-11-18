// WebGLEngine/tools/ship/flyCompassTrainer.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMPASS TRAINER, AS ARITHMETIC (registered in brain/FLY_COMPASS_TRAINER_WIP.md before this file existed): IS THE COMPASS ROUND'S SHORTFALL BELOW THE HAND RULE THE TRAINER'S
// CHOICE OF POINT? The fly, task, recipe, draws and audit are the compass round's PLASTIC (tools/ship/flyCompass.mjs); the trainer's walk is the same in every arm (the same seed, recipe
// and fresh lives; the battery never steers it), and only the point handed back differs. Two new arms, 12 draws each:
//   BAT64  the best on 64 lives of the draw's own (seeds BAT_BASE + BAT_STEP s + 17 k): trainDockES's batteryEps 64 and batteryBase
//   LAST   the walk's last point: trainDockES's keep "last"
// weighed against KEEP16, the compass round's PLASTIC as committed in brain/flyCompassRound.jsonl (the best on the fixed 16 lives). Readings (exact two-sided sign tests, ties against):
// K BAT64 against KEEP16 draw for draw, L LAST against KEEP16 draw for draw, H64 BAT64 against the hand rule, HL LAST against the hand rule. The command is
// tools/ship/takeFlyCompassTrainer.mjs.
//
//   RECIPE, SEEDS, AUDIT, ALPHA, HAND (the compass round's), ARMS, LEAD, WEIGHTS, RESULTS, COMPASS, COMPASS_SHA256, BAT_EPS, BAT_BASE, BAT_STEP, WORDS
//   batteryOf(arm, s)                     { eps, base } of the lives an arm's training keeps its point on (base null: the trainer's fixed 5000)
//   optionsOf(arm, s)                     the trainDockES options the arm adds to the compass round's
//   trainOne(arm, s, recipe, audit)       { kind: "draw", arm, s, recipe, battery, weightCount, weights, weightsHash, rates, keptAt, score, history }
//   floors(audit)                         { kind: "floors", off, start, hand }: each must be the compass round's to the bit
//   compassOf(bytes)                      { sha256, lines } of the compass round's results file
//   parseArgs(argv), checkRecords(lines, compass), reading(lines, compass), readingLines(R)
// NOT HERE: the 24 trainings (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { CompassEnv, NR } from "../../brain/rl/compassEnv.mjs";
import { hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as C from "./flyCompass.mjs";

export const RECIPE = C.RECIPE, SEEDS = C.SEEDS, AUDIT = C.AUDIT, ALPHA = C.ALPHA, HAND = C.HAND;
export const ARMS = Object.freeze(["BAT64", "LAST"]), LEAD = "LAST";
export const WEIGHTS = Object.freeze({ BAT64: 3, LAST: 3 });
export const RESULTS = "brain/flyCompassTrainerRound.jsonl", COMPASS = "brain/flyCompassRound.jsonl", COMPASS_SHA256 = "363cdbf5147d4137ad2b6d3de26e0e14ca7709a75e77aaad9317c15cad6c0527";
export const BAT_EPS = 64, BAT_BASE = 40000000, BAT_STEP = 10007;
const three = (a, b) => Object.freeze([`${a} DOES BETTER THAN ${b}`, `${a} DOES WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`]);
const B64 = "KEEPING THE BEST ON 64 LIVES OF THE DRAW'S OWN", LST = "KEEPING THE WALK'S LAST POINT", K16 = "KEEPING THE BEST ON THE FIXED 16 LIVES", HR = "THE RULE SET BY HAND";
export const WORDS = Object.freeze({ K: three(B64, K16), L: three(LST, K16), H64: three(B64, HR), HL: three(LST, HR) });

const armOk = (arm, s, who) => {
    if (!ARMS.includes(arm)) throw new Error(`flyCompassTrainer.${who}: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyCompassTrainer.${who}: a draw is a whole number from 1 (got ${s})`);
};
/** See the header. */
export function batteryOf(arm, s) { armOk(arm, s, "batteryOf"); return arm === "BAT64" ? { eps: BAT_EPS, base: BAT_BASE + BAT_STEP * s } : { eps: RECIPE.battery, base: null }; }
/** See the header. */
export function optionsOf(arm, s) { const b = batteryOf(arm, s); return arm === "BAT64" ? { batteryEps: b.eps, batteryBase: b.base } : { keep: "last" }; }
/** See the header. The fly is the compass round's PLASTIC (the real wiring); `keptAt` is the iteration whose point is handed back. */
export function trainOne(arm, s, recipe = RECIPE, audit = AUDIT) {
    armOk(arm, s, "trainOne");
    let keptAt = -1, prev = -Infinity, last = -1;
    const res = trainDockES({ envFactory: () => new CompassEnv(), obsDim: NR + 2, actDim: 1, maxSteps: 1500, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => C.policyOf("PLASTIC", s), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}), ...optionsOf(arm, s),
        onIter: ({ it, bestScore }) => { if (bestScore > prev) { keptAt = it; prev = bestScore; } last = it; } });
    const fly = C.policyOf("PLASTIC", s).setParams(res.params);
    return { kind: "draw", arm, s, recipe: { ...recipe }, battery: batteryOf(arm, s), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rates: fly.rates(), keptAt: arm === "LAST" ? last : keptAt, score: C.auditScore(fly, audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header: vision off, the start and the hand rule, each of which must be the compass round's to the bit. */
export function floors(audit = AUDIT) {
    return { kind: "floors", off: C.auditScore(C.policyOf("FROZEN", 1).setParams([0]), audit), start: C.auditScore(C.policyOf("FROZEN", 1), audit), hand: C.auditScore(C.policyOf("PLASTIC", 1).setParams(HAND), audit) };
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
        if (!same(r.battery, batteryOf(r.arm, r.s))) bad.push(`${id} kept its point on other lives than its arm's`);
        if (r.weightCount !== WEIGHTS[r.arm]) bad.push(`${id} has ${r.weightCount} weights (its arm has ${WEIGHTS[r.arm]})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!fin(r.score)) bad.push(`${id} has no score`);
        if (!(r.rates && fin(r.rates.a) && fin(r.rates.b) && fin(r.rates.c) && r.rates.a >= 0 && r.rates.b >= 0 && r.rates.c >= 0)) bad.push(`${id}'s rates are not finite and 0 or more`);
        if (!(Number.isInteger(r.keptAt) && r.keptAt >= 0 && r.keptAt < RECIPE.iters && (r.arm !== "LAST" || r.keptAt === RECIPE.iters - 1))) bad.push(`${id} does not say which iteration it kept`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors"), cfl = compass && compass.lines.find((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !["off", "start", "hand"].every((k) => fin(fl[0][k]))) bad.push("the floors are not there once");
    else if (!cfl || fl[0].off !== cfl.off || fl[0].start !== cfl.start || fl[0].hand !== cfl.hand) bad.push("vision off, the start and the hand rule are not the compass round's to the bit: the fly, task or audit is not the same");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (w, better, worse) => (better ? w[0] : worse ? w[1] : w[2]);
/** See the header. KEEP16 is the compass round's PLASTIC; a failed check leaves every reading null. */
export function reading(lines, compass) {
    const checks = checkRecords(lines, compass), all = [...lines.filter((r) => r && r.kind === "draw"), ...(compass ? compass.lines.filter((r) => r && r.kind === "draw" && r.arm === "PLASTIC").map((r) => ({ ...r, arm: "KEEP16" })) : [])];
    const of = (arm) => all.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score), arms = {};
    for (const arm of [...ARMS, "KEEP16"]) { const v = of(arm); if (!v.length) continue; const mean = (f) => v.reduce((n, r) => n + f(r), 0) / v.length;
        arms[arm] = { ...stats(v.map((r) => r.score)), a: mean((r) => r.rates.a), b: mean((r) => r.rates.b), c: mean((r) => r.rates.c) };
        if (v.every((r) => Number.isInteger(r.keptAt))) arms[arm].keptAt = v.map((r) => r.keptAt);
        if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
    const fl = lines.find((r) => r && r.kind === "floors") || null, out = { checks, arms, floors: fl, K: null, L: null, H64: null, HL: null };
    if (checks.length) return out;
    const word = (name, h) => pick(WORDS[name], h.p <= ALPHA && h.above > h.below, h.p <= ALPHA && h.below > h.above);
    const paired = (name, arm) => { const d = SEEDS.map((s, i) => scores(arm)[i] - scores("KEEP16")[i]), h = signTest(d, 0); return { ...h, a: arm, b: "KEEP16", ref: 0, diffs: d, word: word(name, h) }; };
    const hand = (name, arm) => { const h = signTest(scores(arm), fl.hand); return { ...h, a: arm, b: "the hand rule", ref: fl.hand, word: word(name, h) }; };
    return { ...out, K: paired("K", "BAT64"), L: paired("L", "LAST"), H64: hand("H64", "BAT64"), HL: hand("HL", "LAST") };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4)), g = (x) => (x === null || x === undefined ? "-" : x.toExponential(2));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: the compass round's file as committed and passing its own checks; ${ARMS.length * SEEDS.length} draws, each once, the registered recipe, each arm's battery and weight count, the iteration kept, a history in every record, ${LEAD} draw ${FIRST} the same twice, and vision off, the start and the hand rule the compass round's to the bit`);
    out.push("", `the arms (the mean of 12 flies; ${AUDIT.length} audit lives; KEEP16 is the compass round's PLASTIC as committed):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(7)} ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${g(s.a)} b ${g(s.b)} c ${g(s.c)}${s.keptAt ? ` | kept at iterations ${s.keptAt.join(" ")}` : ""}`);
    if (R.floors) out.push("", `the hand rule ${f(R.floors.hand)}, vision off ${f(R.floors.off)}, the start ${f(R.floors.start)}`);
    for (const [arm, a] of Object.entries(R.arms)) if (a.history) out.push(`${arm.padEnd(7)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
    for (const name of ["K", "L", "H64", "HL"]) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${t.b}${t.ref === 0 ? ", draw for draw" : ` ${f(t.ref)}`}): above ${t.above}, below ${t.below}, ties ${t.ties} of ${t.n}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    return out;
}
