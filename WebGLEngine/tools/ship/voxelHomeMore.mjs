// WebGLEngine/tools/ship/voxelHomeMore.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE VOXEL HOME, ROUND 7, AS ARITHMETIC (registered in brain/VOXEL_HOME_MORE_WIP.md before this file existed): round 5's two findings, each taken further. Round 2's builders from a random start, two
// arms (FLY and PLAIN), two settings:
//   HUGE   pop 384 for round 5's 96                       read against round 5's MANY cell of the same arm (brain/voxelHomeStepsRound.jsonl)
//   SLOW   lr 0.0125 for 600 iterations (round 5: 150)    read against round 2's own arm (brain/voxelHomeDrawnRound.jsonl)
// Each setting is tools/ship/voxelHome.mjs's makeRound() with round 2's cfg and its keys, so a training here is that code's; this file holds the cells, the checks, the four rank-sums and their words.
// The command is tools/ship/takeVoxelHomeMore.mjs.
//
//   SETTINGS, CELLS, ARMS, SEEDS, RECIPES, WEIGHTS, AUDIT, ALPHA, RESULTS, BEFORES ({ setting: { file, setting } }: where a setting's control is), WORDS
//   policyOf(arm, s), auditScore(policy, seeds, maxSteps)   round 2's
//   trainOne(setting, arm, s, recipe, audit)
//   parseArgs(argv)                       run [--jobs N] | read | job SETTING ARM S
//   checkRecords(lines, befores)          befores is { HUGE: round 5's lines, SLOW: round 2's lines }
//   reading(lines, befores)               { checks, cells, control: { "HUGE FLY": stats, ... }, tests: { "H-FLY": ... }, floors (round 2's) }; with a failed check no test is made
//   readingLines(R)
"use strict";
import { makeRound } from "./voxelHome.mjs";
import { ROUND2 } from "./voxelHomeDrawn.mjs";
import { RESULTS as STEPS_RESULTS } from "./voxelHomeSteps.mjs";
import { rankSum, hashWeights, unpackWeights, hashEdges } from "./paintingFly.mjs";

export const RESULTS = "brain/voxelHomeMoreRound.jsonl";
export const BEFORES = Object.freeze({ HUGE: Object.freeze({ file: STEPS_RESULTS, setting: "MANY" }), SLOW: Object.freeze({ file: ROUND2.results, setting: null }) });
const base = { ...ROUND2, history: true, results: RESULTS };
const ROUNDS = Object.freeze({ HUGE: makeRound({ ...base, pop: 384 }), SLOW: makeRound({ ...base, lr: 0.0125, iters: 600 }) }), R2 = makeRound(ROUND2);
export const SETTINGS = Object.freeze(["HUGE", "SLOW"]), ARMS = Object.freeze(["FLY", "PLAIN"]);
export const CELLS = Object.freeze(SETTINGS.flatMap((x) => ARMS.map((a) => Object.freeze([x, a]))));
export const SEEDS = R2.SEEDS, AUDIT = R2.AUDIT, ALPHA = R2.ALPHA, WEIGHTS = Object.freeze({ FLY: R2.WEIGHTS.FLY, PLAIN: R2.WEIGHTS.PLAIN });
export const RECIPES = Object.freeze({ HUGE: ROUNDS.HUGE.RECIPE, SLOW: ROUNDS.SLOW.RECIPE });
export const policyOf = R2.policyOf, auditScore = R2.auditScore;
export const WORDS = Object.freeze({
    HUGE: ["FOUR TIMES THE BUILDERS AGAIN BUILDS MORE OF A HOME", "FOUR TIMES THE BUILDERS AGAIN BUILDS LESS OF A HOME", "FOUR TIMES THE BUILDERS AGAIN CANNOT BE TOLD APART FROM 96"],
    SLOW: ["A SMALLER STEP FOR FOUR TIMES AS LONG BUILDS MORE OF A HOME", "A SMALLER STEP FOR FOUR TIMES AS LONG BUILDS LESS OF A HOME", "A SMALLER STEP FOR FOUR TIMES AS LONG CANNOT BE TOLD APART FROM ROUND 2'S"],
});
const LETTER = Object.freeze({ HUGE: "H", SLOW: "L" }), testName = (setting, arm) => `${LETTER[setting]}-${arm}`;

/** See the header. `recipe` and `audit` are the registration's unless a gate hands in its own. */
export function trainOne(setting, arm, s, recipe, audit) {
    if (!SETTINGS.includes(setting)) throw new Error(`voxelHomeMore.trainOne: no setting ${setting} (the settings are ${SETTINGS.join(", ")})`);
    if (!ARMS.includes(arm)) throw new Error(`voxelHomeMore.trainOne: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    const R = ROUNDS[setting];
    return { ...R.trainOne(arm, s, recipe === undefined ? R.RECIPE : recipe, audit === undefined ? R.AUDIT : audit), setting };
}

/** See the header. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 3 && SETTINGS.includes(rest[0]) && ARMS.includes(rest[1]) && /^[1-9]\d*$/.test(rest[2]) && SEEDS.includes(Number(rest[2]))) return { cmd, setting: rest[0], arm: rest[1], s: Number(rest[2]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** A setting's control draws of an arm, by draw: the file its BEFORES names, and of that file the setting it names (round 5's records carry one; round 2's do not). */
const controlOf = (befores, setting, arm) => { const B = BEFORES[setting], lines = (befores && befores[setting]) || []; return lines.filter((r) => r && r.kind === "draw" && r.arm === arm && Number.isFinite(r.score) && (B.setting === null ? r.setting === undefined : r.setting === B.setting)).sort((a, b) => a.s - b.s); };
/** See the header. */
export function checkRecords(lines, befores = null) {
    const bad = [], draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = `${r.setting}/${r.arm}/${r.s}`; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const [x, a] of CELLS) for (const s of SEEDS) { const c = seen.get(`${x}/${a}/${s}`) || 0; if (c !== 1) bad.push(`${x} ${a} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== CELLS.length * SEEDS.length) bad.push(`${draws.length} draws (registered: ${CELLS.length * SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.setting} ${r.arm} draw ${r.s}`;
        if (!SETTINGS.includes(r.setting) || !ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered draw`); continue; }
        const R = ROUNDS[r.setting];
        if (!same(r.recipe, R.RECIPE)) bad.push(`${id} was trained with another recipe`);
        if (r.weightCount !== WEIGHTS[r.arm]) bad.push(`${id} has ${r.weightCount} weights (its arm has ${WEIGHTS[r.arm]})`);
        let w = null; try { w = unpackWeights(r.weights); } catch { /* said below */ }
        if (!w || w.length !== r.weightCount || hashWeights(w) !== r.weightsHash || !w.every(Number.isFinite)) bad.push(`${id}'s weights are not ${r.weightCount} finite numbers with its hash`);
        if (!Number.isFinite(r.score) || r.score < 0 || r.score > 1) bad.push(`${id} has no score that is a share`);
        if (!Number.isInteger(r.homes) || r.homes < 0 || r.homes > AUDIT.length) bad.push(`${id} has no count of homes`);
        if (!(Array.isArray(r.history) && r.history.length >= 2 && r.history.every((h) => h && Number.isInteger(h.it) && Number.isFinite(h.missing)) && r.history[0].it === 0 && r.history[r.history.length - 1].it === R.RECIPE.iters - 1)) bad.push(`${id} has no history from iteration 0 to ${R.RECIPE.iters - 1}`);
        const c = R.circuitOf(r.arm, r.s);
        if (r.edgesHash !== hashEdges(c.edges) || r.edges !== c.edges.length || r.units !== c.units) bad.push(`${id}'s wiring is not its arm's`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.setting === "SLOW" && r.arm === "FLY" && r.s === 1);
    if (re.length !== 1 || !first || re[0].setting !== "SLOW" || re[0].arm !== "FLY" || re[0].s !== 1 || re[0].weightsHash !== first.weightsHash) bad.push("SLOW FLY draw 1 trained a second time is not there once with the same weights");
    for (const x of SETTINGS) for (const arm of ARMS) if (!same(controlOf(befores, x, arm).map((r) => r.s), [...SEEDS])) bad.push(`${x}'s control (${BEFORES[x].file}${BEFORES[x].setting ? ", its " + BEFORES[x].setting + " cell" : ""}) does not hold its 16 ${arm} draws, each once`);
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
/** See the header. */
export function reading(lines, befores = null) {
    const checks = checkRecords(lines, befores), draws = lines.filter((r) => r && r.kind === "draw");
    const of = (x, a) => draws.filter((r) => r.setting === x && r.arm === a).sort((p, q) => p.s - q.s);
    const cells = {}, control = {}, tests = {};
    for (const [x, a] of CELLS) {
        const v = of(x, a), name = `${x} ${a}`; tests[testName(x, a)] = null;
        if (v.length) { const c = { ...stats(v.map((r) => r.score)), homes: v.reduce((n, r) => n + (r.homes || 0), 0), bestHomes: Math.max(...v.map((r) => r.homes || 0)) };
            if (v.every((r) => Array.isArray(r.history) && r.history.length === v[0].history.length)) c.history = v[0].history.map((h, k) => ({ it: h.it, missing: v.reduce((n, r) => n + r.history[k].missing, 0) / v.length }));
            cells[name] = c; }
        const k = controlOf(befores, x, a); if (k.length) control[name] = { ...stats(k.map((r) => r.score)), homes: k.reduce((n, r) => n + (r.homes || 0), 0) };
    }
    const floors = ((befores && befores.SLOW) || []).find((r) => r && r.kind === "floors") || null;
    if (checks.length) return { checks, cells, control, tests, floors };
    for (const [x, a] of CELLS) { const t = rankSum(of(x, a).map((r) => r.score), controlOf(befores, x, a).map((r) => r.score)), [more, less, apart] = WORDS[x]; tests[testName(x, a)] = { ...t, setting: x, arm: a, word: t.p <= ALPHA && t.pHigher < t.pLower ? more : t.p <= ALPHA && t.pLower < t.pHigher ? less : apart }; }
    return { checks, cells, control, tests, floors };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4), against = { HUGE: "round 5's MANY", SLOW: "round 2's" };
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push("the checks hold: 64 draws, each once, each setting's recipe, each arm's weight count and wiring, SLOW FLY draw 1 the same twice, a history in every record, each setting's 16 control draws an arm");
    out.push("", "cell          n   mean    sd      least   most    homes (of 16 x 200)  best draw's homes   its control (mean, homes)");
    for (const [name, s] of Object.entries(R.cells)) { const k = R.control[name]; out.push(`${name.padEnd(13)} ${String(s.n).padStart(2)}  ${f(s.mean)}  ${f(s.sd)}  ${f(s.min)}  ${f(s.max)}  ${String(s.homes).padStart(6)}               ${String(s.bestHomes).padStart(3)}                 ${k ? `${f(k.mean)}, ${k.homes}` : "none"}`); }
    if (R.floors && Array.isArray(R.floors.random)) out.push("", `round 2's floors: 16 random builders ${f(stats(R.floors.random).mean)}; the lean, no network ${f(R.floors.lean)}, homes ${R.floors.leanHomes} of ${AUDIT.length}`);
    for (const [name, c] of Object.entries(R.cells)) if (c.history) out.push(`${name.padEnd(13)} the trainer's own battery, share missing at iteration ${c.history.map((h) => `${h.it}: ${f(h.missing)}`).join(", ")}`);
    for (const [name, t] of Object.entries(R.tests)) if (t) out.push("", `${name} (${t.setting}'s ${t.arm} against ${against[t.setting]} ${t.arm}): the ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`);
    return out;
}
