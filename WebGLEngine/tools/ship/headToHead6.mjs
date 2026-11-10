// WebGLEngine/tools/ship/headToHead6.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead6Cmd.mjs; the gate is tools/ship/headToHead6-selfcheck.mjs)
//
// ROUND H6 of brain/HEAD_TO_HEAD.md (registered before this file existed): is the trained networks' gain over the PD autopilot a TUNING GAP? Five tuned autopilots (the autopilot's eleven gains searched by the networks' own recipe: four (1+1)-ES searches
// of 400 iterations, a champion picked on HELD_OUT_SET) flown with the autopilot, the eight 963-weight networks and the twenty H5 controls on the tank's compass dropout (200 fresh ids, dark and lit) through the switchboard, and read as paired
// differences with a registered verdict. Reads nothing from disk (the command hands the champion records, the weights and H5's records in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as T from "../../brain/subTask.mjs";
import * as H5 from "./headToHead5.mjs";
import { NETWORK_NAMES } from "./headToHead.mjs";

export const IDS = Object.freeze({ from: 6000, to: 6199 }), SECONDS = 160;
export const RECIPE = H5.RECIPE, REPLICATES = 5, GAIN_BOUND = 8, TUNED_FACTOR = 1.5, LEARN_MARGIN = 0.02, LEARN_MIN = 4;
export const GAIN_NAMES = Object.freeze(["kDepth", "vzMax", "maxPitch", "kTheta", "kQ", "kBalD", "kBalV", "kHdg", "kR", "kBeta", "kSpd"]);
export const DEFAULT_GAINS = Object.freeze(GAIN_NAMES.map((n) => AS.AUTOPILOT_SUB[n]));
export const TUNED_IDS = Object.freeze(Array.from({ length: REPLICATES }, (_, r) => "tuned-" + r));
export const NET_IDS = Object.freeze(NETWORK_NAMES.map((n) => "network-" + n));
export const CONTROL_IDS = Object.freeze(H5.SPECS.map(H5.armIdOf));
export const ARM_IDS = Object.freeze(["autopilot", ...TUNED_IDS, ...NET_IDS, ...CONTROL_IDS]);
/** The 28 networks the verdict reads: the eight of H1 and H2 and the twenty H5 controls. */
export const NETWORK_ARMS = Object.freeze([...NET_IDS, ...CONTROL_IDS]);
const TRAINED_IDS = Object.freeze(ARM_IDS.filter((a) => a !== "autopilot"));

/** The gains object of a vector of eleven numbers (a throw naming the fault when it is not eleven finite positive numbers). */
export function gainsOf(vec) {
    if (!Array.isArray(vec) && !ArrayBuffer.isView(vec)) throw new Error("headToHead6.gainsOf: the gains are an array of 11 numbers");
    if (vec.length !== GAIN_NAMES.length) throw new Error(`headToHead6.gainsOf: ${GAIN_NAMES.length} gains are needed, got ${vec.length}`);
    const out = {}; GAIN_NAMES.forEach((n, i) => { if (!(Number.isFinite(vec[i]) && vec[i] > 0)) throw new Error(`headToHead6.gainsOf: gain ${n} must be a finite number above 0, got ${JSON.stringify(vec[i])}`); out[n] = vec[i]; });
    return out;
}
/** The pilot function of a gains vector (the autopilot with those gains). */
export const pilotOf = (vec) => AS.pilot(gainsOf(vec));
/** A gains vector flown over a set of dives (brain/subTask.mjs evaluate): { score, ... }. */
export const evaluateGains = (vec, set = T.TRAIN_SET) => T.evaluate(pilotOf(vec), set);
/** The seed of search k of replicate r: 6700 + 10 r + k. */
export const searchSeed = (rep, k) => 6700 + 10 * rep + k;
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (rng) => { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
/** A child of `vec`: 1..maxK randomly chosen gains multiplied by exp(sigma z), each kept within [default/GAIN_BOUND, default x GAIN_BOUND]. */
export function mutate(vec, sigma, rng, maxK = 4) {
    const o = Array.from(vec), k = 1 + Math.floor(rng() * maxK);
    for (let j = 0; j < k; j++) { const i = Math.floor(rng() * o.length), lo = DEFAULT_GAINS[i] / GAIN_BOUND, hi = DEFAULT_GAINS[i] * GAIN_BOUND; o[i] = Math.min(hi, Math.max(lo, o[i] * Math.exp(sigma * gauss(rng)))); }
    return o;
}
/** One search of replicate `rep` (or by `opts` for the gate: { iters, sigma, maxK, trainSet, heldSet }): { rep, k, seed, gains, trainScore, heldScore, improved, neutral }. Deterministic for (rep, k, opts). */
export function searchOne(rep, k, opts = {}) {
    if (!Number.isInteger(rep) || rep < 0 || rep >= REPLICATES) throw new Error(`headToHead6.searchOne: replicate must be 0..${REPLICATES - 1}, got ${JSON.stringify(rep)}`);
    if (!Number.isInteger(k) || k < 0 || k >= RECIPE.runs) throw new Error(`headToHead6.searchOne: search k must be 0..${RECIPE.runs - 1}, got ${JSON.stringify(k)}`);
    const o = { iters: RECIPE.iters, sigma: RECIPE.sigma, maxK: RECIPE.maxK, ...opts }, seed = searchSeed(rep, k), rng = mulberry(seed), trainSet = o.trainSet || T.TRAIN_SET;
    let best = Array.from(DEFAULT_GAINS), bestScore = evaluateGains(best, trainSet).score, improved = 0, neutral = 0;
    for (let i = 1; i <= o.iters; i++) {
        const cand = mutate(best, o.sigma, rng, o.maxK), score = evaluateGains(cand, trainSet).score;
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
    }
    return { rep, k, seed, gains: best, trainScore: bestScore, heldScore: evaluateGains(best, o.heldSet || T.HELD_OUT_SET).score, improved, neutral };
}
/** The champion of a replicate's searches: the best heldScore, ties to the smaller k; throws unless there are exactly RECIPE.runs searches of that replicate with distinct k. */
export function championOf(rep, runs) {
    if (!Array.isArray(runs) || runs.length !== RECIPE.runs) throw new Error(`headToHead6.championOf: replicate ${rep} needs exactly ${RECIPE.runs} searches, got ${Array.isArray(runs) ? runs.length : JSON.stringify(runs)}`);
    if (runs.some((r) => r.rep !== rep) || new Set(runs.map((r) => r.k)).size !== RECIPE.runs) throw new Error(`headToHead6.championOf: the searches of replicate ${rep} must be of that replicate and have distinct k`);
    const best = [...runs].sort((a, b) => b.heldScore - a.heldScore || a.k - b.k)[0];
    return { rep, gains: best.gains, heldScore: best.heldScore, seed: best.seed, k: best.k, searches: runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldScore: r.heldScore })).sort((a, b) => a.k - b.k) };
}
/** The tank kind of the tuned autopilots: circuit `h6-tuned`, eleven weights (the gains), the autopilot with those gains as the pilot. */
export const KIND = Object.freeze({ circuit: "h6-tuned", label: "H6 tuned autopilot", weightCount: GAIN_NAMES.length, persist: false, build: (weights) => pilotOf(Array.from(weights)) });
/** The board arm of a tuned champion `tuned-<rep>`: controls the autopilot. */
export function armOf(rep, gains) {
    gainsOf(gains);
    return { id: "tuned-" + rep, layer: "flying", controls: ["autopilot"], note: `H6 tuned autopilot ${rep}`, entry: () => ({ pilot: "tuned", circuit: KIND.circuit, weights: Array.from(gains) }), register: (tank) => tank.registerPilotKind(KIND.circuit, KIND) };
}
/** The board: the dropout task; the autopilot; the five tuned champions (a Map rep -> champion record); the eight networks (`networks` = { Wip, Actuators, ...: 963 numbers }); the twenty H5 controls (`controls` = a Map spec -> record with weights). */
export function boardOf(tuned, networks, controls) {
    for (let r = 0; r < REPLICATES; r++) if (!tuned || typeof tuned.get !== "function" || !tuned.get(r)) throw new Error(`headToHead6.boardOf: no tuned champion for replicate ${r}`);
    for (const n of NETWORK_NAMES) if (!networks || !Array.isArray(networks[n] || null) || networks[n].length !== 963) throw new Error(`headToHead6.boardOf: networks.${n} must be an array of 963 numbers`);
    for (const s of H5.SPECS) if (!controls || typeof controls.get !== "function" || !controls.get(s)) throw new Error(`headToHead6.boardOf: no H5 control ${s}`);
    const b = B.createBoard().addTask(B.dropoutTask);
    for (const a of B.flyingArms(Object.fromEntries(NETWORK_NAMES.map((n) => [n, networks[n]])))) { if (a.id !== "autopilot") a.controls = ["autopilot"]; b.addArm(a); }
    for (let r = 0; r < REPLICATES; r++) b.addArm(armOf(r, tuned.get(r).gains));
    for (const s of H5.SPECS) { const a = H5.armOf(s, controls.get(s).weights); a.controls = ["autopilot"]; b.addArm(a); }
    return b;
}
/** EVERY arm once, dark and lit, on `range` ids: { dark, lit, range, seconds, tuned (the records, for the checks and the report) }. */
export function audit(tuned, networks, controls, { range = IDS, seconds = SECONDS } = {}) {
    const b = boardOf(tuned, networks, controls);
    return { dark: b.run("dropout", [...ARM_IDS], range, { seconds }).runs, lit: b.run("dropout", [...ARM_IDS], range, { seconds, event: null }).runs, range, seconds, tuned };
}
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` in the condition ("dark" or "lit"), pooled and paired. */
export const pairOf = (au, a, b, cond) => mk(B.paired(au[cond][a], au[cond][b]));
export const meanOf = (au, a, cond) => au[cond][a].reduce((s, r) => s + r.score, 0) / au[cond][a].length;
/** An arm's gain over the autopilot in the condition (the mean paired difference). */
export const gainOf = (au, a, cond) => pairOf(au, a, "autopilot", cond).mean;
const sorted = (xs) => [...xs].sort((a, b) => a - b), avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sdOf = (xs) => { const m = avg(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1)); };
/** The statistics the verdict reads, over the 28 networks' gains in the condition: { median (mean of the 14th and 15th smallest), q1 (the 7th smallest), q3 (the 7th largest), lo, hi }. */
export function networkStats(au, cond = "dark") {
    const g = sorted(NETWORK_ARMS.map((a) => gainOf(au, a, cond)));
    return { median: (g[13] + g[14]) / 2, q1: g[6], q3: g[21], lo: g[0], hi: g[27], n: g.length };
}
/** How many of the five tuned autopilots beat the autopilot in the dark by more than LEARN_MARGIN. */
export const foundCount = (au) => TUNED_IDS.filter((a) => gainOf(au, a, "dark") > LEARN_MARGIN).length;
/** The mean dark gain of the five tuned autopilots. */
export const tunedMean = (au, cond = "dark") => avg(TUNED_IDS.map((a) => gainOf(au, a, cond)));
/** The registered verdict. */
export function verdictOf(au) {
    if (foundCount(au) < LEARN_MIN) return "NOT ASSESSED: TUNING FOUND NOTHING";
    const m = tunedMean(au), s = networkStats(au);
    return m >= s.median ? "THE LEARNED GAIN IS A TUNING GAP" : m < s.q1 ? "THE LEARNED GAIN IS NOT A TUNING GAP" : "THE LEARNED GAIN IS PARTLY A TUNING GAP";
}
/** The median over the five champions of (gain / default) for each gain, in GAIN_NAMES order. */
export function medianFactors(tuned) {
    return GAIN_NAMES.map((n, i) => { const f = sorted(Array.from({ length: REPLICATES }, (_, r) => tuned.get(r).gains[i] / DEFAULT_GAINS[i])); return f[2]; });
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
export function bottomLines(au) {
    const found = foundCount(au), tg = TUNED_IDS.map((a) => gainOf(au, a, "dark")), s = networkStats(au), sl = networkStats(au, "lit");
    const pairs = TUNED_IDS.flatMap((t) => NETWORK_ARMS.map((n) => pairOf(au, t, n, "dark").reading)), count = (w) => pairs.filter((x) => x === w).length;
    const moved = medianFactors(au.tuned).map((f, i) => [GAIN_NAMES[i], f]).filter(([, f]) => f > TUNED_FACTOR || f < 1 / TUNED_FACTOR).map(([n, f]) => `${n} x${f.toFixed(2)}`);
    const lostT = TUNED_IDS.map((a) => lostBoth(au, a)), lostN = NETWORK_ARMS.map((a) => lostBoth(au, a)), sum = (a) => a.reduce((x, y) => x + y, 0);
    return [
        `TUNING ${found >= LEARN_MIN ? "FOUND" : "FOUND NOTHING"}: ${found} OF ${REPLICATES} TUNED AUTOPILOTS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN ${LEARN_MARGIN}`,
        `DARK GAIN OVER THE AUTOPILOT: TUNED ${f4(avg(tg))} (sd ${sdOf(tg).toFixed(4)}, range ${f4(Math.min(...tg))} to ${f4(Math.max(...tg))}); THE ${s.n} NETWORKS median ${f4(s.median)} (quartiles ${f4(s.q1)} to ${f4(s.q3)}, range ${f4(s.lo)} to ${f4(s.hi)})`,
        `THE TUNED AUTOPILOTS BEAT ${count("BETTER")} OF ${pairs.length} PAIRS WITH THE ${s.n} NETWORKS IN THE DARK, TIE ${count("TIES")}, ARE BELOW ${count("WORSE")}`,
        `LIT TANK: TUNED GAIN ${f4(tunedMean(au, "lit"))}; THE ${sl.n} NETWORKS median ${f4(sl.median)}`,
        `WHAT TUNING MOVED (median factor over the ${REPLICATES} champions, gains moved by more than ${TUNED_FACTOR}x either way): ${moved.join(", ") || "none"}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, tuned ${sum(lostT)} (${Math.max(...lostT)} in the worst), networks ${sum(lostN)} (${Math.max(...lostN)} in the worst)`,
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
    const champs = Array.from({ length: REPLICATES }, (_, r) => { const c = au.tuned && au.tuned.get(r); return !!c && Array.isArray(c.gains) && c.gains.length === GAIN_NAMES.length && c.searches && c.searches.length === RECIPE.runs && c.gains.every((g, i) => Number.isFinite(g) && g >= DEFAULT_GAINS[i] / GAIN_BOUND - 1e-12 && g <= DEFAULT_GAINS[i] * GAIN_BOUND + 1e-12); }).every(Boolean);
    rows.push({ name: "TUNED CHAMPIONS OF FOUR SEARCHES", ok: champs, text: `every tuned autopilot is the champion of exactly ${RECIPE.runs} searches with ${GAIN_NAMES.length} finite gains inside [default/${GAIN_BOUND}, default x ${GAIN_BOUND}]: ${champs}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), tunedDistinct = new Set(TUNED_IDS.map(key)).size === REPLICATES && TUNED_IDS.every((a) => key(a) !== key("autopilot"));
    rows.push({ name: "TUNED ARMS DISTINCT", ok: tunedDistinct, text: `the ${REPLICATES} tuned autopilots are pairwise different in the dark and each differs from the autopilot: ${tunedDistinct}` });
    const distinct = new Set(TRAINED_IDS.map(key)).size === TRAINED_IDS.length;
    rows.push({ name: "ARMS DISTINCT", ok: distinct, text: `the ${TRAINED_IDS.length} trained arms are pairwise different in the dark: ${distinct}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const L = [`ROUND H6: is the learned gain a tuning gap? Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    L.push("means (dark / lit):");
    for (const a of ARM_IDS) L.push(`  ${a.padEnd(18)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}`);
    L.push("the tuned champions (gains; held-out score; the four searches' held-out scores):");
    for (let r = 0; r < REPLICATES; r++) { const c = au.tuned.get(r); L.push(`  tuned-${r}: ${GAIN_NAMES.map((n, i) => `${n} ${c.gains[i].toFixed(3)}`).join(", ")}`, `            held-out ${c.heldScore.toFixed(4)} (searches ${c.searches.map((x) => x.heldScore.toFixed(3)).join(" ")})`); }
    L.push(`  defaults: ${GAIN_NAMES.map((n, i) => `${n} ${DEFAULT_GAINS[i]}`).join(", ")}`);
    L.push("gains over the autopilot, dark / lit:");
    for (const a of TUNED_IDS) L.push(`${a}:`, `   dark ${fmt(pairOf(au, a, "autopilot", "dark"))}`, `   lit  ${fmt(pairOf(au, a, "autopilot", "lit"))}`);
    L.push("tuned against the networks, dark (better / ties / below of the 28 for each tuned autopilot):");
    for (const t of TUNED_IDS) { const rs = NETWORK_ARMS.map((n) => pairOf(au, t, n, "dark").reading); L.push(`   ${t}: ${rs.filter((x) => x === "BETTER").length} / ${rs.filter((x) => x === "TIES").length} / ${rs.filter((x) => x === "WORSE").length}`); }
    for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
