// WebGLEngine/tools/ship/headToHead10.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead10Cmd.mjs; the gate is tools/ship/headToHead10-selfcheck.mjs)
//
// ROUND H10 of brain/HEAD_TO_HEAD.md (registered before this file existed): TRAINED WITHOUT THE CORE. Ten champions of H7's base recipe with the 313 recurrent weights frozen at zero (the mutation draws its weights only from the 650 outside the recurrent
// block), flown on the tank's compass dropout (200 fresh ids, dark and lit) with the autopilot, H7's ten base champions (with their cores) and the same base champions with the core zeroed (H9's lesion), through the switchboard, read as paired differences
// with a registered verdict. Reads nothing from disk (the command hands the champion records in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as T from "../../brain/subTask.mjs";
import * as H7 from "./headToHead7.mjs";
import * as H9 from "./headToHead9.mjs";

export const IDS = Object.freeze({ from: 10000, to: 10199 }), SECONDS = 160;
export const RECIPE = H7.BASE_RECIPE, REPLICATES = 10, LEARN_MARGIN = 0.02, LEARN_MIN_MEAN = 0.02, Z = 2;
export const FROZEN_IDS = Object.freeze(Array.from({ length: REPLICATES }, (_, r) => "frozen-" + r));
export const BASE_IDS = H7.BASE_IDS;
export const OFF_IDS = Object.freeze(BASE_IDS.map(H9.offId));
export const ARM_IDS = Object.freeze(["autopilot", ...FROZEN_IDS, ...BASE_IDS, ...OFF_IDS]);
/** The 650 weight indices outside the recurrent block, in order. */
export const FREE = Object.freeze(Array.from({ length: PS.WEIGHT_COUNT }, (_, i) => i).filter((i) => i < H9.REC_FROM || i >= H9.REC_TO));
/** The seed of search k of replicate r: 7500 + 10 r + k. */
export const searchSeed = (rep, k) => 7500 + 10 * rep + k;
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** A child of `w`: 1..maxK of the weights OUTSIDE the recurrent block moved by a gaussian of `sigma` (the sparse mutation of PS.mutate, the core never touched). */
export function maskedMutate(w, sigma, rng, maxK = 4) {
    const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
    for (let j = 0; j < k; j++) o[FREE[Math.floor(rng() * FREE.length)]] += gauss(rng) * sigma;
    return o;
}
/** One frozen-core search (`opts` for the gate: { iters, sigma, maxK, trainSet, heldSet, seed }): { rep, k, seed, weights, trainScore, heldScore, improved, neutral }. The loop of PS.train with maskedMutate, then PS.prune. Deterministic. */
export function searchFrozen(rep, k, opts = {}) {
    if (!Number.isInteger(rep) || rep < 0 || rep >= REPLICATES) throw new Error(`headToHead10.searchFrozen: replicate must be 0..${REPLICATES - 1}, got ${JSON.stringify(rep)}`);
    if (!Number.isInteger(k) || k < 0 || k >= RECIPE.runs) throw new Error(`headToHead10.searchFrozen: search k must be 0..${RECIPE.runs - 1}, got ${JSON.stringify(k)}`);
    const o = { iters: RECIPE.iters, sigma: RECIPE.sigma, maxK: RECIPE.maxK, ...opts }, seed = o.seed === undefined ? searchSeed(rep, k) : o.seed, trainSet = o.trainSet || T.TRAIN_SET, rng = PS.mulberry(seed);
    let best = PS.handWeights(), bestScore = PS.evaluate(best, trainSet).score, improved = 0, neutral = 0;
    for (let i = 1; i <= o.iters; i++) {
        const cand = maskedMutate(best, o.sigma, rng, o.maxK), score = PS.evaluate(cand, trainSet).score;
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
    }
    const out = PS.prune(best, { trainSet }), held = PS.evaluate(out.weights, o.heldSet || T.HELD_OUT_SET);
    return { rep, k, seed, weights: Array.from(out.weights), trainScore: out.trainScore, heldScore: held.score, improved, neutral };
}
/** The champion of a replicate's searches: the best heldScore, ties to the smaller k; throws unless there are exactly RECIPE.runs searches of that replicate with distinct k. */
export function championOf(rep, runs) {
    if (!Array.isArray(runs) || runs.length !== RECIPE.runs) throw new Error(`headToHead10.championOf: replicate ${rep} needs exactly ${RECIPE.runs} searches, got ${Array.isArray(runs) ? runs.length : JSON.stringify(runs)}`);
    if (runs.some((r) => r.rep !== rep) || new Set(runs.map((r) => r.k)).size !== RECIPE.runs) throw new Error(`headToHead10.championOf: the searches of replicate ${rep} must be of that replicate and have distinct k`);
    const best = [...runs].sort((a, b) => b.heldScore - a.heldScore || a.k - b.k)[0];
    return { rep, weights: best.weights, heldScore: best.heldScore, seed: best.seed, k: best.k, searches: runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldScore: r.heldScore })).sort((a, b) => a.k - b.k) };
}
const arm = (id, weights, note) => ({ id, layer: "flying", controls: ["autopilot"], note, entry: () => ({ pilot: "network", circuit: "gfc", weights: Array.from(weights) }) });
const need963 = (w, what) => { if (!(Array.isArray(w || null) || ArrayBuffer.isView(w)) || w.length !== PS.WEIGHT_COUNT) throw new Error(`headToHead10.boardOf: ${what} must be an array of ${PS.WEIGHT_COUNT} numbers`); };
/** The board: the dropout task, the autopilot, the ten frozen champions and the ten base champions (Maps rep -> champion) and each base champion with its core zeroed. */
export function boardOf(frozen, base) {
    for (const [name, m] of [["frozen", frozen], ["base", base]]) for (let r = 0; r < REPLICATES; r++) { if (!m || typeof m.get !== "function" || !m.get(r)) throw new Error(`headToHead10.boardOf: no ${name} champion for replicate ${r}`); need963(m.get(r).weights, `${name}-${r}'s weights`); }
    const b = B.createBoard().addTask(B.dropoutTask);
    b.addArm(B.flyingArms({})[0]);
    for (let r = 0; r < REPLICATES; r++) b.addArm(arm("frozen-" + r, frozen.get(r).weights, `frozen-core replicate ${r}`));
    for (let r = 0; r < REPLICATES; r++) b.addArm(arm("base-" + r, base.get(r).weights, `base recipe replicate ${r}`));
    for (let r = 0; r < REPLICATES; r++) b.addArm(arm(H9.offId("base-" + r), H9.lesion(base.get(r).weights), `base recipe replicate ${r}, core off`));
    return b;
}
/** EVERY arm once, dark and lit, on `range` ids: { dark, lit, range, seconds, frozen, base (the champion Maps, for the checks and the report) }. */
export function audit(frozen, base, { range = IDS, seconds = SECONDS } = {}) {
    const b = boardOf(frozen, base);
    return { dark: b.run("dropout", [...ARM_IDS], range, { seconds }).runs, lit: b.run("dropout", [...ARM_IDS], range, { seconds, event: null }).runs, range, seconds, frozen, base };
}
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` in the condition ("dark" or "lit"), pooled and paired. */
export const pairOf = (au, a, b, cond) => mk(B.paired(au[cond][a], au[cond][b]));
export const meanOf = (au, a, cond) => au[cond][a].reduce((s, r) => s + r.score, 0) / au[cond][a].length;
/** An arm's gain over the autopilot in the condition. */
export const gainOf = (au, a, cond) => pairOf(au, a, "autopilot", cond).mean;
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length, varOf = (xs) => { const m = avg(xs); return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1); };
/** The gains of a list of arm ids in the condition. */
export const gainsOf = (au, ids, cond = "dark") => ids.map((a) => gainOf(au, a, cond));
/** How many of the arms beat the autopilot in the dark by more than LEARN_MARGIN. */
export const learnedCount = (au, ids) => gainsOf(au, ids).filter((g) => g > LEARN_MARGIN).length;
/** { gf, gb, go (the ten gains each), mf, mb, mo (their means), d (frozen minus base), se, sw (spread inside a recipe) } in the condition. */
export function statsOf(au, cond = "dark") {
    const gf = gainsOf(au, FROZEN_IDS, cond), gb = gainsOf(au, BASE_IDS, cond), go = gainsOf(au, OFF_IDS, cond), vf = varOf(gf), vb = varOf(gb);
    return { gf, gb, go, mf: avg(gf), mb: avg(gb), mo: avg(go), d: avg(gf) - avg(gb), se: Math.sqrt(vf / gf.length + vb / gb.length), sw: Math.sqrt((vf + vb) / 2) };
}
/** The registered verdict. */
export function verdictOf(au) {
    const s = statsOf(au);
    if (s.mf <= LEARN_MIN_MEAN) return "THE CORE DOES THE WORK: WITHOUT IT THE NETWORKS DO NOT GAIN";
    if (s.d > Z * s.se) return "A NETWORK TRAINED WITHOUT THE CORE GAINS MORE";
    if (s.d >= -Z * s.se) return "THE CORE IS NOT NEEDED FOR THE GAIN";
    return "THE CORE ADDS TO THE GAIN, BUT A NETWORK WITHOUT IT STILL GAINS";
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const spread = (g) => `${f4(avg(g))} (sd ${Math.sqrt(varOf(g)).toFixed(4)}, range ${f4(Math.min(...g))} to ${f4(Math.max(...g))})`;
/** The held-out score of each champion in replicate order. */
export const heldOf = (au, which) => Array.from({ length: REPLICATES }, (_, r) => au[which].get(r).heldScore);
export function bottomLines(au) {
    const s = statsOf(au), sl = statsOf(au, "lit"), lg = (ids) => ids.map((a) => lostBoth(au, a)), sum = (a) => a.reduce((x, y) => x + y, 0), lf = lg(FROZEN_IDS), lb = lg(BASE_IDS), lo = lg(OFF_IDS);
    return [
        `LEARNED: ${learnedCount(au, FROZEN_IDS)} OF ${REPLICATES} FROZEN-CORE AND ${learnedCount(au, BASE_IDS)} OF ${REPLICATES} BASE CHAMPIONS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN ${LEARN_MARGIN}`,
        `DARK GAIN OVER THE AUTOPILOT: FROZEN CORE ${spread(s.gf)}; BASE ${spread(s.gb)}; BASE WITH THE CORE OFF ${spread(s.go)}; DIFFERENCE FROZEN MINUS BASE ${f4(s.d)} (se ${s.se.toFixed(4)}), SPREAD INSIDE A RECIPE ${s.sw.toFixed(4)}`,
        `FRACTION OF THE BASE GAIN KEPT WITHOUT THE CORE: TRAINED WITHOUT IT ${(s.mf / s.mb).toFixed(2)}; LESIONED ${(s.mo / s.mb).toFixed(2)}`,
        `LIT TANK: FROZEN CORE ${f4(sl.mf)}, BASE ${f4(sl.mb)}, DIFFERENCE ${f4(sl.d)}`,
        `HELD-OUT DIVE SCORE (not in the verdict): FROZEN CORE ${avg(heldOf(au, "frozen")).toFixed(4)}, BASE ${avg(heldOf(au, "base")).toFixed(4)}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, frozen ${sum(lf)} (${Math.max(...lf)} in the worst), base ${sum(lb)} (${Math.max(...lb)}), base core off ${sum(lo)} (${Math.max(...lo)})`,
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
    const getw = (m, r) => (m && typeof m.get === "function" && m.get(r) ? m.get(r) : null);
    const frozen = Array.from({ length: REPLICATES }, (_, r) => { const c = getw(au.frozen, r); return !!c && c.weights && c.weights.length === PS.WEIGHT_COUNT && Array.from(c.weights).every(Number.isFinite) && c.searches && c.searches.length === RECIPE.runs && c.weights.slice(H9.REC_FROM, H9.REC_TO).every((v) => v === 0); }).every(Boolean);
    rows.push({ name: "FROZEN CORES ARE ZERO", ok: frozen, text: `every frozen champion is the champion of exactly ${RECIPE.runs} searches with ${PS.WEIGHT_COUNT} finite weights and exactly zero on [${H9.REC_FROM}, ${H9.REC_TO}): ${frozen}` });
    const base = Array.from({ length: REPLICATES }, (_, r) => { const c = getw(au.base, r); return !!c && c.weights && c.weights.length === PS.WEIGHT_COUNT && Array.from(c.weights).every(Number.isFinite); }).every(Boolean);
    rows.push({ name: "BASE CHAMPIONS", ok: base, text: `every base champion is ${PS.WEIGHT_COUNT} finite weights: ${base}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set([...FROZEN_IDS, ...BASE_IDS].map(key)).size === 2 * REPLICATES;
    rows.push({ name: "CHAMPIONS DISTINCT", ok: distinct, text: `the ${2 * REPLICATES} frozen and base champions are pairwise different in the dark: ${distinct}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const R = [`ROUND H10: trained without the core. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark / lit; held-out score and the four searches' held-out scores of each champion):");
    for (const a of ARM_IDS) {
        const m = a.startsWith("frozen-") ? au.frozen : /^base-\d$/.test(a) ? au.base : null, c = m ? m.get(Number(a.split("-")[1])) : null;
        R.push(`  ${a.padEnd(12)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}${c ? `   held-out ${c.heldScore.toFixed(4)} (searches ${c.searches.map((x) => x.heldScore.toFixed(3)).join(" ")})` : ""}`);
    }
    R.push("gains over the autopilot, dark / lit; each frozen network against the same-numbered base network (dark):");
    for (const a of ARM_IDS.filter((x) => x !== "autopilot")) R.push(`${a}:`, `   dark ${fmt(pairOf(au, a, "autopilot", "dark"))}`, `   lit  ${fmt(pairOf(au, a, "autopilot", "lit"))}`);
    for (let r = 0; r < REPLICATES; r++) R.push(`frozen-${r} minus base-${r}: ${fmt(pairOf(au, "frozen-" + r, "base-" + r, "dark"))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
