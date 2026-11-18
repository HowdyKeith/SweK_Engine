// WebGLEngine/tools/ship/flyMushroom.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE MUSHROOM BODY LEARNS, AS ARITHMETIC (registered in brain/FLY_MUSHROOM_BODY_WIP.md before this file existed): DOES EACH OUTPUT NEURON'S OWN DOPAMINE TEACHER MATTER?
// The circuit is vendor/male-cns/mushroom-body-circuit.json, read here: the 4,064 Kenyon cells, the 91 output neurons with Kenyon-cell input (in the file's order), the 340 dopamine neurons and
// their families (PPL1 punishes, PAM feeds). The task is brain/rl/odorEnv.mjs (ONE and REV) and the fly brain/rl/mushroomFly.mjs. Four arms, 12 draws each, on each task:
//   FROZEN   no teaching (a 0): weights [v, bias]
//   PLASTIC  the real dopamine-to-output connections teach
//   PFAM     the 91 neurons' teacher sets permuted among them (seed 6000 + draw): as pure as before, but another neuron's
//   PSHUF    each real dopamine-to-output connection, with its synapses, onto a neuron drawn at random among the 91 (seed 5000 + draw)
// Readings on each task: P (PLASTIC against FROZEN), T1 (PLASTIC against PSHUF), T2 (PLASTIC against PFAM), exact rank sums; H (PLASTIC against the hand rule), a sign test; counted: USES (the
// score less the score with p_a at 0, above 0.01). The command is tools/ship/takeFlyMushroom.mjs.
//
//   RECIPE, SEEDS, ARMS, TASKS, LEAD, WEIGHTS, AUDIT, ALPHA, USES_BY, RESULTS, PFAM_SEED, PSHUF_SEED, CIRCUIT, HAND, WORDS
//   teachOf(dmEdges), dmEdgesOf(arm, s), teachFor(arm, s), teachHash(teach), policyOf(arm, s), ratesOff(arm, s, weights)
//   auditScore(fly, task, lives)          the mean return of a fly over lives
//   trainOne(arm, task, s, recipe, audit) { kind: "draw", task, arm, s, recipe, teachHash, weightCount, weights, weightsHash, rate, ratesOff (null for FROZEN), score, history }
//   floors(audit)                         { kind: "floors", start: { ONE, REV }, hand: { ONE, REV } } -- the untrained fly, and the hand rule
//   uses(r), parseArgs(argv), checkRecords(lines), reading(lines), readingLines(R)
// NOT HERE: the 96 trainings (the command runs them; the gate never does).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { trainDockES } from "../../brain/rl/dockPolicy.js";
import { OdorEnv, TRIALS, stream } from "../../brain/rl/odorEnv.mjs";
import { MushroomFly } from "../../brain/rl/mushroomFly.mjs";
import { rankSum, hashWeights, packWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RECIPE = Object.freeze({ iters: 60, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 4, fresh: true, battery: 16 });
export const SEEDS = Object.freeze(Array.from({ length: 12 }, (_, k) => k + 1));
export const ARMS = Object.freeze(["FROZEN", "PLASTIC", "PFAM", "PSHUF"]), TASKS = Object.freeze(["ONE", "REV"]), LEAD = "PLASTIC";
export const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 9000001 + 7919 * k)), ALPHA = 0.01, USES_BY = 0.01;
export const RESULTS = "brain/flyMushroomRound.jsonl", PFAM_SEED = 6000, PSHUF_SEED = 5000;

/** The circuit from the vendored file (see the header). edges: Kenyon cell -> output neuron [k, m, n]; dm: dopamine neuron -> output neuron [d, m, n]; fam: 1 PPL1, 2 PAM, 0 another. */
export const CIRCUIT = (() => {
    const d = JSON.parse(fs.readFileSync(path.join(ENG, "vendor/male-cns/mushroom-body-circuit.json"), "utf8")), C = d.cells;
    const of = (g) => C.map((c, i) => i).filter((i) => C[i].group === g), kc = of("KC"), dan = of("DAN"), kpos = new Map(kc.map((i, p) => [i, p])), dpos = new Map(dan.map((i, p) => [i, p]));
    const fed = new Set(); for (const [i, j] of d.edges) if (kpos.has(i) && C[j].group === "MBON") fed.add(j);
    const mbon = of("MBON").filter((j) => fed.has(j)), mpos = new Map(mbon.map((i, p) => [i, p])), km = new Map(), dm = new Map();
    for (const [i, j, n] of d.edges) { if (kpos.has(i) && mpos.has(j)) { const k = kpos.get(i) * 1000 + mpos.get(j); km.set(k, (km.get(k) || 0) + n); } else if (dpos.has(i) && mpos.has(j)) { const k = dpos.get(i) * 1000 + mpos.get(j); dm.set(k, (dm.get(k) || 0) + n); } }
    const list = (M) => Object.freeze([...M].sort((a, b) => a[0] - b[0]).map(([k, n]) => Object.freeze([Math.floor(k / 1000), k % 1000, n])));
    const fam = Object.freeze(dan.map((i) => (C[i].type.startsWith("PPL1") ? 1 : C[i].type.startsWith("PAM") ? 2 : 0)));
    return Object.freeze({ nk: kc.length, nm: mbon.length, nd: dan.length, types: Object.freeze(mbon.map((i) => C[i].type)), edges: list(km), dm: list(dm), fam });
})();
export const WEIGHTS = Object.freeze({ FROZEN: CIRCUIT.nm + 1, PLASTIC: CIRCUIT.nm + 2, PFAM: CIRCUIT.nm + 2, PSHUF: CIRCUIT.nm + 2 });

/** Each output neuron's teachers from dopamine-to-output connections: [its share of dopamine synapses from PPL1, from PAM] ([0, 0] with none). */
export function teachOf(dmEdges) {
    const T = Array.from({ length: CIRCUIT.nm }, () => [0, 0, 0]); for (const [dd, m, n] of dmEdges) T[m][CIRCUIT.fam[dd]] += n;
    return T.map((t) => { const s = t[0] + t[1] + t[2]; return s ? [t[1] / s, t[2] / s] : [0, 0]; });
}
const armOk = (arm, s, who) => {
    if (!ARMS.includes(arm)) throw new Error(`flyMushroom.${who}: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (!Number.isInteger(s) || s < 1) throw new Error(`flyMushroom.${who}: a draw is a whole number from 1 (got ${s})`);
};
/** See the header: the dopamine-to-output connections an arm's teaching comes from (FROZEN's are the real ones, unused). A copy each call. */
export function dmEdgesOf(arm, s) {
    armOk(arm, s, "dmEdgesOf");
    if (arm === "PSHUF") { const r = stream(PSHUF_SEED + s); return CIRCUIT.dm.map(([dd, , n]) => [dd, Math.floor(r() * CIRCUIT.nm), n]); }
    if (arm === "PFAM") { const r = stream(PFAM_SEED + s), q = [...Array(CIRCUIT.nm).keys()]; for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; } return CIRCUIT.dm.map(([dd, m, n]) => [dd, q[m], n]); }
    return CIRCUIT.dm.map((e) => [...e]);
}
const MEMO = new Map();
/** See the header: an arm's teachers, made once a draw. */
export function teachFor(arm, s) { armOk(arm, s, "teachFor"); const k = arm === "PFAM" || arm === "PSHUF" ? `${arm}/${s}` : "REAL"; if (!MEMO.has(k)) MEMO.set(k, teachOf(dmEdgesOf(arm, s))); return MEMO.get(k); }
/** A short hash of teachers. */
export function teachHash(teach) { return createHash("sha256").update(JSON.stringify(teach)).digest("hex").slice(0, 16); }
/** See the header. */
export function policyOf(arm, s) { return new MushroomFly({ nk: CIRCUIT.nk, nm: CIRCUIT.nm, edges: CIRCUIT.edges, teach: teachFor(arm, s), plastic: arm !== "FROZEN" }); }
/** See the header: the same weights with p_a at 0. */
export function ratesOff(arm, s, weights) { const w = Float32Array.from(weights); w[CIRCUIT.nm + 1] = 0; return policyOf(arm, s).setParams(w); }
/** The hand rule: v +1/88 for each PPL1-taught neuron, -1/88 for each PAM-taught one (0 for the 3 with neither), bias 0.1, p_a 2. */
export const HAND = (() => { const T = teachOf(CIRCUIT.dm), sg = T.map(([p, f]) => (p > f ? 1 : f > p ? -1 : 0)), n = sg.filter((x) => x !== 0).length, w = new Float32Array(CIRCUIT.nm + 2);
    sg.forEach((x, m) => (w[m] = x / n)); w[CIRCUIT.nm] = 0.1; w[CIRCUIT.nm + 1] = 2; return Object.freeze(Array.from(w)); })();
/** See the header. */
export function auditScore(fly, task, lives = AUDIT) {
    const env = new OdorEnv({ task, nk: CIRCUIT.nk }); let sum = 0;
    for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { const r = env.step(fly.act(o)); o = r.obs; done = r.done; } sum += env.ret; }
    return sum / lives.length;
}
/** See the header. */
export function trainOne(arm, task, s, recipe = RECIPE, audit = AUDIT) {
    armOk(arm, s, "trainOne"); if (!TASKS.includes(task)) throw new Error(`flyMushroom.trainOne: the task is ONE or REV (got ${task})`);
    const res = trainDockES({ envFactory: () => new OdorEnv({ task, nk: CIRCUIT.nk }), obsDim: 1, actDim: 1, maxSteps: TRIALS, iters: recipe.iters, pop: recipe.pop, sigma: recipe.sigma, lr: recipe.lr, trainEps: recipe.trainEps, seed: s,
        policyFactory: () => policyOf(arm, s), ...(recipe.fresh === true ? { freshEpisodes: true } : {}), ...(recipe.battery ? { batteryEps: recipe.battery } : {}) });
    const fly = policyOf(arm, s).setParams(res.params);
    return { kind: "draw", task, arm, s, recipe: { ...recipe }, teachHash: teachHash(teachFor(arm, s)), weightCount: res.params.length, weights: packWeights(res.params), weightsHash: hashWeights(res.params),
        rate: fly.rate(), ratesOff: arm === "FROZEN" ? null : auditScore(ratesOff(arm, s, res.params), task, audit), score: auditScore(fly, task, audit), history: res.history.map((h) => ({ it: h.it, ret: h.avgReturn })) };
}
/** See the header. */
export function floors(audit = AUDIT) {
    const on = (f) => Object.fromEntries(TASKS.map((t) => [t, f(t)]));
    return { kind: "floors", start: on((t) => auditScore(policyOf("PLASTIC", 1), t, audit)), hand: on((t) => auditScore(policyOf("PLASTIC", 1).setParams(HAND), t, audit)) };
}
/** See the header. `job` takes a registered task, arm and draw only; `run` at least one process. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 3 && TASKS.includes(rest[0]) && ARMS.includes(rest[1]) && /^[1-9]\d*$/.test(rest[2]) && SEEDS.includes(Number(rest[2]))) return { cmd, task: rest[0], arm: rest[1], s: Number(rest[2]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), FIRST = SEEDS[0], fin = (v) => Number.isFinite(v);
/** See the header. */
export function checkRecords(lines) {
    const bad = [], draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = `${r.task}/${r.arm}/${r.s}`; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const t of TASKS) for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(`${t}/${arm}/${s}`) || 0; if (c !== 1) bad.push(`${t} ${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== TASKS.length * ARMS.length * SEEDS.length) bad.push(`${draws.length} draws (registered: ${TASKS.length * ARMS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.task} ${r.arm} draw ${r.s}`;
        if (!TASKS.includes(r.task) || !ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        if (!same(r.recipe, RECIPE)) bad.push(`${id} was trained with another recipe`);
        if (r.teachHash !== teachHash(teachFor(r.arm, r.s))) bad.push(`${id}'s teachers are not its arm's`);
        if (r.weightCount !== WEIGHTS[r.arm]) bad.push(`${id} has ${r.weightCount} weights (its arm has ${WEIGHTS[r.arm]})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!fin(r.score)) bad.push(`${id} has no score`);
        if (!(fin(r.rate) && r.rate >= 0 && (r.arm !== "FROZEN" || r.rate === 0))) bad.push(`${id}'s rate is not finite and 0 or more (0 for FROZEN)`);
        if (r.arm === "FROZEN" ? r.ratesOff !== null : !fin(r.ratesOff)) bad.push(`${id} has ${r.arm === "FROZEN" ? "a" : "no"} score with its rate at 0`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && fin(h.ret)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${RECIPE.iters - 1}`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.task === "ONE" && r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].task !== "ONE" || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash) bad.push(`ONE ${LEAD} draw ${FIRST} trained a second time is not there once with the same weights`);
    const fl = lines.filter((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !TASKS.every((t) => fl[0].start && fin(fl[0].start[t]) && fl[0].hand && fin(fl[0].hand[t]))) bad.push("the floors are not there once");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
/** See the header. */
export const uses = (r) => r.ratesOff !== null && r.score - r.ratesOff > USES_BY;
const three = (a, b) => Object.freeze([`${a} DOES BETTER THAN ${b}`, `${a} DOES WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b}`]);
const REAL = "THE FLY TAUGHT BY ITS REAL DOPAMINE CONNECTIONS";
export const WORDS = Object.freeze({ P: three(REAL, "THE SAME FLY WITHOUT THE TEACHING"), T1: three(REAL, "ONE TAUGHT BY MIXED TEACHERS"), T2: three(REAL, "ONE WHOSE PURE TEACHERS ARE OTHER NEURONS'"), H: three(REAL, "THE RULE SET BY HAND") });
const VS = Object.freeze({ P: "FROZEN", T1: "PSHUF", T2: "PFAM" });
/** See the header. A failed check leaves every reading null. */
export function reading(lines) {
    const checks = checkRecords(lines), draws = lines.filter((r) => r && r.kind === "draw"), fl = lines.find((r) => r && r.kind === "floors") || null, out = { checks, floors: fl, tasks: {} };
    for (const task of TASKS) {
        const of = (arm) => draws.filter((r) => r.task === task && r.arm === arm).sort((a, b) => a.s - b.s), scores = (arm) => of(arm).map((r) => r.score), arms = {};
        for (const arm of ARMS) { const v = of(arm); if (!v.length) continue; arms[arm] = { ...stats(v.map((r) => r.score)), rate: v.reduce((n, r) => n + r.rate, 0) / v.length, uses: arm === "FROZEN" ? null : v.filter(uses).length, ratesOff: arm === "FROZEN" ? null : v.reduce((n, r) => n + r.ratesOff, 0) / v.length };
            if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) arms[arm].history = v[0].history.map((h, k) => ({ it: h.it, ret: v.reduce((n, r) => n + r.history[k].ret, 0) / v.length })); }
        const t = { arms, P: null, T1: null, T2: null, H: null };
        if (!checks.length) {
            for (const [name, b] of Object.entries(VS)) { const h = rankSum(scores(LEAD), scores(b)), w = WORDS[name]; t[name] = { ...h, a: LEAD, b, word: h.p <= ALPHA && h.pHigher < h.pLower ? w[0] : h.p <= ALPHA && h.pLower < h.pHigher ? w[1] : w[2] }; }
            const h = signTest(scores(LEAD), fl.hand[task]), w = WORDS.H; t.H = { ...h, a: LEAD, b: "the hand rule", ref: fl.hand[task], word: h.p <= ALPHA && h.above > h.below ? w[0] : h.p <= ALPHA && h.below > h.above ? w[1] : w[2] };
        }
        out.tasks[task] = t;
    }
    return out;
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: ${TASKS.length * ARMS.length * SEEDS.length} draws, each once, the registered recipe, each arm's teachers and weight count, a score with the rate at 0 for every plastic fly, ONE ${LEAD} draw ${FIRST} the same twice, a history in every record, the floors`);
    for (const task of TASKS) {
        const T = R.tasks[task]; out.push("", `${task} (the mean of 12 flies; ${AUDIT.length} audit lives):`);
        for (const [arm, s] of Object.entries(T.arms)) out.push(`  ${arm.padEnd(8)} ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | a ${f(s.rate)}${s.uses === null ? "" : ` | USES ${s.uses} of ${s.n} | with p_a at 0 ${f(s.ratesOff)}`}`);
        if (R.floors) out.push(`  the start ${f(R.floors.start[task])}, the hand rule ${f(R.floors.hand[task])}`);
        for (const [arm, a] of Object.entries(T.arms)) if (a.history) out.push(`  ${arm.padEnd(8)} the trainer's own battery, mean return at iteration ${a.history.map((h) => `${h.it}: ${f(h.ret)}`).join(", ")}`);
        for (const name of ["P", "T1", "T2"]) { const t = T[name]; if (t) out.push(`  ${name} (${t.a} against ${t.b}): ${t.a}'s ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `    ${t.word}`); }
        if (T.H) out.push(`  H (${T.H.a} against the hand rule ${f(T.H.ref)}): above ${T.H.above}, below ${T.H.below}, ties ${T.H.ties}; exact two-sided p ${T.H.p.toExponential(3)}`, `    ${T.H.word}`);
    }
    return out;
}
