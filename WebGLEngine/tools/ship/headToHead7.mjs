// WebGLEngine/tools/ship/headToHead7.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead7Cmd.mjs; the gate is tools/ship/headToHead7-selfcheck.mjs)
//
// ROUND H7 of brain/HEAD_TO_HEAD.md (registered before this file existed): RECIPE OR LUCK. Ten champions of the base recipe (H5's recipe on the Giant Fiber Circuit: four (1+1)-ES searches of 400 iterations, pruned) and ten of the robust-hull recipe
// (tools/trainSubRobust.mjs as a library: four searches of 200 iterations scored over five vessels, no prune), each from the hand weights, flown with the autopilot and the two shipped networks on the tank's compass dropout (200 fresh ids, dark and lit)
// through the switchboard, read as paired differences with a registered verdict. Reads nothing from disk (the command hands the champion records and the two shipped weight vectors in). THE IDS ARE READ ONLY BY audit().
// No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as T from "../../brain/subTask.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as H5 from "./headToHead5.mjs";

export const IDS = Object.freeze({ from: 7000, to: 7199 }), SECONDS = 160;
export const BASE_RECIPE = H5.RECIPE, ROBUST_RECIPE = Object.freeze({ runs: 4, iters: 200, sigma: 0.3, maxK: 4 });
export const REPLICATES = 10, LEARN_MARGIN = 0.02, LEARN_MIN = 8, Z = 2;
export const RECIPES = Object.freeze(["base", "robust"]);
export const BASE_IDS = Object.freeze(Array.from({ length: REPLICATES }, (_, r) => "base-" + r)), ROBUST_IDS = Object.freeze(Array.from({ length: REPLICATES }, (_, r) => "robust-" + r));
export const REF_IDS = Object.freeze(["network-Wip", "network-Robust"]);
export const REPLICATE_IDS = Object.freeze([...BASE_IDS, ...ROBUST_IDS]);
export const ARM_IDS = Object.freeze(["autopilot", ...BASE_IDS, ...ROBUST_IDS, ...REF_IDS]);
export const idsOf = (recipe) => { if (recipe === "base") return BASE_IDS; if (recipe === "robust") return ROBUST_IDS; throw new Error(`headToHead7.idsOf: recipe must be "base" or "robust", got ${JSON.stringify(recipe)}`); };
const recipeOf = (recipe) => (recipe === "base" ? BASE_RECIPE : recipe === "robust" ? ROBUST_RECIPE : idsOf(recipe));
/** The seed of search k of replicate r: base 7100 + 10 r + k, robust 7300 + 10 r + k. */
export const searchSeed = (recipe, rep, k) => (recipeOf(recipe) === BASE_RECIPE ? 7100 : 7300) + 10 * rep + k;
const E = S.EXPLORER;
/** The five vessels of the robust recipe, as tools/trainSubRobust.mjs builds them. */
export const VARIANTS = Object.freeze([{}, { munk: 3000 }, { munk: 0 }, { finArea: E.finArea * 0.6 }, { bg: E.bg * 2.5 }].map((d) => Object.freeze(d)));
let models = null;
const modelsOf = () => (models = models || VARIANTS.map((d) => S.createSubModel(Object.freeze({ ...E, ...d }))));
/** The robust objective of weights `w` over `set`: the mean score over the five vessels. */
export const robustScore = (w, set, ms = modelsOf()) => ms.reduce((a, m) => a + PS.evaluate(w, set, { model: m }).score, 0) / ms.length;
/** The dives the robust recipe trains on: every other TRAIN_SET dive. */
export const robustTrainSet = () => T.TRAIN_SET.filter((_, i) => i % 2 === 0);
function checkIndex(recipe, rep, k) {
    const rc = recipeOf(recipe);
    if (!Number.isInteger(rep) || rep < 0 || rep >= REPLICATES) throw new Error(`headToHead7: replicate must be 0..${REPLICATES - 1}, got ${JSON.stringify(rep)}`);
    if (!Number.isInteger(k) || k < 0 || k >= rc.runs) throw new Error(`headToHead7: search k must be 0..${rc.runs - 1}, got ${JSON.stringify(k)}`);
}
/** One base search (`opts` for the gate: { iters, sigma, maxK, trainSet, heldSet, seed }): { recipe, rep, k, seed, weights, trainScore, heldScore, improved, neutral }. Deterministic. */
export function searchBase(rep, k, opts = {}) {
    checkIndex("base", rep, k);
    const o = { iters: BASE_RECIPE.iters, sigma: BASE_RECIPE.sigma, maxK: BASE_RECIPE.maxK, ...opts }, seed = o.seed === undefined ? searchSeed("base", rep, k) : o.seed, trainSet = o.trainSet || T.TRAIN_SET;
    const found = PS.train({ seed, iters: o.iters, sigma: o.sigma, maxK: o.maxK, trainSet }), out = PS.prune(found.weights, { trainSet }), held = PS.evaluate(out.weights, o.heldSet || T.HELD_OUT_SET);
    return { recipe: "base", rep, k, seed, weights: Array.from(out.weights), trainScore: out.trainScore, heldScore: held.score, improved: found.improved, neutral: found.neutral };
}
/** One robust search, the loop of tools/trainSubRobust.mjs (`opts`: { iters, sigma, maxK, trainSet, heldSet, seed, models }): same fields. Deterministic. */
export function searchRobust(rep, k, opts = {}) {
    checkIndex("robust", rep, k);
    const o = { iters: ROBUST_RECIPE.iters, sigma: ROBUST_RECIPE.sigma, maxK: ROBUST_RECIPE.maxK, ...opts }, seed = o.seed === undefined ? searchSeed("robust", rep, k) : o.seed, ms = o.models || modelsOf(), trainSet = o.trainSet || robustTrainSet();
    const score = (w) => robustScore(w, trainSet, ms), rng = PS.mulberry(seed);
    let best = PS.handWeights(), bestScore = score(best), improved = 0, neutral = 0;
    for (let i = 1; i <= o.iters; i++) {
        const cand = PS.mutate(best, o.sigma, rng, o.maxK), s = score(cand);
        if (s > bestScore + 1e-9) { best = cand; bestScore = s; improved++; } else if (s >= bestScore - 1e-9) { best = cand; neutral++; }
    }
    return { recipe: "robust", rep, k, seed, weights: Array.from(best), trainScore: bestScore, heldScore: robustScore(best, o.heldSet || T.HELD_OUT_SET, ms), improved, neutral };
}
/** The champion of a replicate's searches: the best heldScore, ties to the smaller k; throws unless there are exactly the recipe's runs searches of that recipe and replicate with distinct k. */
export function championOf(recipe, rep, runs) {
    const rc = recipeOf(recipe) === BASE_RECIPE ? BASE_RECIPE : ROBUST_RECIPE;
    if (!Array.isArray(runs) || runs.length !== rc.runs) throw new Error(`headToHead7.championOf: ${recipe} replicate ${rep} needs exactly ${rc.runs} searches, got ${Array.isArray(runs) ? runs.length : JSON.stringify(runs)}`);
    if (runs.some((r) => r.recipe !== recipe || r.rep !== rep) || new Set(runs.map((r) => r.k)).size !== rc.runs) throw new Error(`headToHead7.championOf: the searches of ${recipe} replicate ${rep} must be of that recipe and replicate and have distinct k`);
    const best = [...runs].sort((a, b) => b.heldScore - a.heldScore || a.k - b.k)[0];
    return { recipe, rep, weights: best.weights, heldScore: best.heldScore, seed: best.seed, k: best.k, searches: runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldScore: r.heldScore })).sort((a, b) => a.k - b.k) };
}
const arm = (id, weights, note) => ({ id, layer: "flying", controls: ["autopilot"], note, entry: () => ({ pilot: "network", circuit: "gfc", weights: Array.from(weights) }) });
const need963 = (w, what) => { if (!Array.isArray(w || null) || w.length !== 963) throw new Error(`headToHead7.boardOf: ${what} must be an array of 963 numbers`); };
/** The board: the dropout task, the autopilot, the twenty champions (Maps rep -> champion) and the two shipped networks (`refs` = { Wip, Robust }: 963 numbers each). */
export function boardOf(base, robust, refs) {
    for (const [recipe, m] of [["base", base], ["robust", robust]]) for (let r = 0; r < REPLICATES; r++) { if (!m || typeof m.get !== "function" || !m.get(r)) throw new Error(`headToHead7.boardOf: no ${recipe} champion for replicate ${r}`); need963(m.get(r).weights, `${recipe}-${r}'s weights`); }
    need963(refs && refs.Wip, "refs.Wip"); need963(refs && refs.Robust, "refs.Robust");
    const b = B.createBoard().addTask(B.dropoutTask);
    b.addArm(B.flyingArms({})[0]);
    for (let r = 0; r < REPLICATES; r++) b.addArm(arm("base-" + r, base.get(r).weights, `base recipe replicate ${r}`));
    for (let r = 0; r < REPLICATES; r++) b.addArm(arm("robust-" + r, robust.get(r).weights, `robust recipe replicate ${r}`));
    b.addArm(arm("network-Wip", refs.Wip, "the shipped base-recipe network (Wip)")); b.addArm(arm("network-Robust", refs.Robust, "the shipped robust-recipe network"));
    return b;
}
/** EVERY arm once, dark and lit, on `range` ids: { dark, lit, range, seconds, base, robust (the champion Maps, for the checks and the report) }. */
export function audit(base, robust, refs, { range = IDS, seconds = SECONDS } = {}) {
    const b = boardOf(base, robust, refs);
    return { dark: b.run("dropout", [...ARM_IDS], range, { seconds }).runs, lit: b.run("dropout", [...ARM_IDS], range, { seconds, event: null }).runs, range, seconds, base, robust };
}
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` in the condition ("dark" or "lit"), pooled and paired. */
export const pairOf = (au, a, b, cond) => mk(B.paired(au[cond][a], au[cond][b]));
export const meanOf = (au, a, cond) => au[cond][a].reduce((s, r) => s + r.score, 0) / au[cond][a].length;
/** An arm's gain over the autopilot in the condition. */
export const gainOf = (au, a, cond) => pairOf(au, a, "autopilot", cond).mean;
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length, varOf = (xs) => { const m = avg(xs); return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1); };
/** The gains of a recipe's ten champions in the condition, in replicate order. */
export const gainsOf = (au, recipe, cond = "dark") => idsOf(recipe).map((a) => gainOf(au, a, cond));
/** Pearson correlation of two equal-length lists (NaN when either has no spread). */
export function pearson(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) throw new Error("headToHead7.pearson: two lists of the same length, at least 2");
    const mx = avg(xs), my = avg(ys); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return sxy / Math.sqrt(sxx * syy);
}
/** The rank of `v` among `others` and itself: 1 + the number of others above it (1 = highest). */
export const rankIn = (v, others) => 1 + others.filter((x) => x > v).length;
/** How many of a recipe's champions beat the autopilot in the dark by more than LEARN_MARGIN. */
export const learnedCount = (au, recipe) => gainsOf(au, recipe).filter((g) => g > LEARN_MARGIN).length;
/** The statistics the verdict reads, in the condition: { gb, gr (the gains), mb, mr (means), d (robust minus base), se, sw }. */
export function statsOf(au, cond = "dark") {
    const gb = gainsOf(au, "base", cond), gr = gainsOf(au, "robust", cond), mb = avg(gb), mr = avg(gr), vb = varOf(gb), vr = varOf(gr);
    return { gb, gr, mb, mr, d: mr - mb, se: Math.sqrt(vb / gb.length + vr / gr.length), sw: Math.sqrt((vb + vr) / 2) };
}
/** The registered verdict. */
export function verdictOf(au) {
    if (learnedCount(au, "base") < LEARN_MIN || learnedCount(au, "robust") < LEARN_MIN) return "NOT ASSESSED: A RECIPE DID NOT LEARN";
    const s = statsOf(au), a = Math.abs(s.d);
    if (a <= Z * s.se) return "LUCK: THE RECIPES ARE NOT TOLD APART";
    if (a <= s.sw) return `A SMALL RECIPE EFFECT, INSIDE THE SPREAD OF A RECIPE: ROBUST ${s.d > 0 ? "ABOVE" : "BELOW"}`;
    return s.d > 0 ? "THE RECIPE MATTERS: ROBUST IS BETTER" : "THE RECIPE MATTERS: ROBUST IS WORSE";
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const spread = (g) => `${f4(avg(g))} (sd ${Math.sqrt(varOf(g)).toFixed(4)}, range ${f4(Math.min(...g))} to ${f4(Math.max(...g))})`;
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "TH" : ["TH", "ST", "ND", "RD"][n % 10 < 4 ? n % 10 : 0]);
/** The held-out score of each champion in replicate order. */
export const heldOf = (au, recipe) => Array.from({ length: REPLICATES }, (_, r) => au[recipe].get(r).heldScore);
export function bottomLines(au) {
    const s = statsOf(au), l = statsOf(au, "lit"), wip = gainOf(au, "network-Wip", "dark"), rob = gainOf(au, "network-Robust", "dark");
    const lb = BASE_IDS.map((a) => lostBoth(au, a)), lr = ROBUST_IDS.map((a) => lostBoth(au, a)), sum = (a) => a.reduce((x, y) => x + y, 0);
    return [
        `LEARNED: ${learnedCount(au, "base")} OF ${REPLICATES} BASE AND ${learnedCount(au, "robust")} OF ${REPLICATES} ROBUST CHAMPIONS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN ${LEARN_MARGIN}`,
        `DARK GAIN OVER THE AUTOPILOT: BASE ${spread(s.gb)}; ROBUST ${spread(s.gr)}; DIFFERENCE ${f4(s.d)} (se ${s.se.toFixed(4)}), SPREAD INSIDE A RECIPE ${s.sw.toFixed(4)}`,
        `WHERE THE SHIPPED NETWORKS FALL: network-Wip ${f4(wip)} IS THE ${ordinal(rankIn(wip, s.gb))} OF ${REPLICATES + 1} BASE GAINS; network-Robust ${f4(rob)} IS THE ${ordinal(rankIn(rob, s.gr))} OF ${REPLICATES + 1} ROBUST GAINS`,
        `LIT TANK: BASE ${f4(l.mb)}, ROBUST ${f4(l.mr)}, DIFFERENCE ${f4(l.d)}`,
        `DOES THE TRAINING SCORE PREDICT THE DROPOUT: BASE r = ${pearson(heldOf(au, "base"), s.gb).toFixed(2)}, ROBUST r = ${pearson(heldOf(au, "robust"), s.gr).toFixed(2)}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, base ${sum(lb)} (${Math.max(...lb)} in the worst), robust ${sum(lr)} (${Math.max(...lr)} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const champ = (m, recipe) => Array.from({ length: REPLICATES }, (_, r) => { const c = m && m.get && m.get(r); return !!c && c.weights && c.weights.length === 963 && c.weights.every(Number.isFinite) && c.searches && c.searches.length === (recipe === "base" ? BASE_RECIPE : ROBUST_RECIPE).runs; }).every(Boolean);
    const champs = champ(au.base, "base") && champ(au.robust, "robust");
    rows.push({ name: "CHAMPIONS OF FOUR SEARCHES", ok: champs, text: `every one of the ${2 * REPLICATES} champions is the champion of exactly ${BASE_RECIPE.runs} searches with 963 finite weights: ${champs}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(REPLICATE_IDS.map(key)).size === REPLICATE_IDS.length;
    rows.push({ name: "REPLICATES DISTINCT", ok: distinct, text: `the ${REPLICATE_IDS.length} replicate arms are pairwise different in the dark: ${distinct}` });
    return rows;
}
const fmt = (p) => `${(p.mean >= 0 ? "+" : "") + p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const L = [`ROUND H7: recipe or luck. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    L.push("means (dark / lit; held-out score and the four searches' held-out scores of each champion):");
    for (const a of ARM_IDS) {
        const rc = a.startsWith("base-") ? "base" : a.startsWith("robust-") ? "robust" : null, c = rc ? au[rc].get(Number(a.split("-")[1])) : null;
        L.push(`  ${a.padEnd(15)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}${c ? `   held-out ${c.heldScore.toFixed(4)} (searches ${c.searches.map((x) => x.heldScore.toFixed(3)).join(" ")})` : ""}`);
    }
    L.push("gains over the autopilot, dark / lit:");
    for (const a of ARM_IDS.filter((x) => x !== "autopilot")) L.push(`${a}:`, `   dark ${fmt(pairOf(au, a, "autopilot", "dark"))}`, `   lit  ${fmt(pairOf(au, a, "autopilot", "lit"))}`);
    for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
