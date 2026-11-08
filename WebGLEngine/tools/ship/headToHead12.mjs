// WebGLEngine/tools/ship/headToHead12.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead12Cmd.mjs; the gate is tools/ship/headToHead12-selfcheck.mjs)
//
// ROUND H12 of brain/HEAD_TO_HEAD.md (registered before this file existed): THE WIDER BOX. H6's search of the PD autopilot's eleven gains, with the box widened from [default/8, default x 8] to [default/64, default x 64] and, for a second group, scored
// on the dive score UNDER THE COMPASS DROPOUT (tools/subDropout.mjs) instead of the plain dive score; five champions of each, H6's five narrow-box champions and the 28 trained networks flown on the tank's compass dropout (200 fresh ids, dark and lit)
// through the switchboard and read as paired differences with a registered verdict. Reads nothing from disk (the command hands the champion records and the weights in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as T from "../../brain/subTask.mjs";
import * as SD from "../subDropout.mjs";
import * as H6 from "./headToHead6.mjs";
import * as H9 from "./headToHead9.mjs";

export const IDS = Object.freeze({ from: 12000, to: 12199 }), SECONDS = 160;
export const RECIPE = H6.RECIPE, REPLICATES = 5, GAIN_BOUND = 64, LEARN_MARGIN = 0.02, LEARN_MIN = 4;
export const GAIN_NAMES = H6.GAIN_NAMES, DEFAULT_GAINS = H6.DEFAULT_GAINS;
export const GROUPS = Object.freeze(["A", "B"]);
export const A_IDS = Object.freeze(Array.from({ length: REPLICATES }, (_, r) => "wideA-" + r)), B_IDS = Object.freeze(Array.from({ length: REPLICATES }, (_, r) => "wideB-" + r)), NARROW_IDS = Object.freeze(Array.from({ length: REPLICATES }, (_, r) => "box8-" + r));
export const NET_IDS = H9.NET_IDS;
export const ARM_IDS = Object.freeze(["autopilot", ...A_IDS, ...B_IDS, ...NARROW_IDS, ...NET_IDS]);
/** The tuned arms of a group: wideA-r for A, wideB-r for B. */
export const idsOf = (group) => { if (group === "A") return A_IDS; if (group === "B") return B_IDS; throw new Error(`headToHead12.idsOf: group must be "A" or "B", got ${JSON.stringify(group)}`); };
/** The seed of search k of replicate r of a group: 12000 + 100 g + 10 r + k (g = 0 for A, 1 for B). */
export const searchSeed = (group, rep, k) => 12000 + 100 * GROUPS.indexOf(group) + 10 * rep + k;
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** A child of `vec`: 1..maxK randomly chosen gains multiplied by exp(sigma z), each kept within [default/GAIN_BOUND, default x GAIN_BOUND]. */
export function mutate(vec, sigma, rng, maxK = 4) {
    const o = Array.from(vec), k = 1 + Math.floor(rng() * maxK);
    for (let j = 0; j < k; j++) { const i = Math.floor(rng() * o.length), lo = DEFAULT_GAINS[i] / GAIN_BOUND, hi = DEFAULT_GAINS[i] * GAIN_BOUND; o[i] = Math.min(hi, Math.max(lo, o[i] * Math.exp(sigma * gauss(rng)))); }
    return o;
}
/** A gains vector flown over a set of dives: group A the plain dive score, group B every dive flown through the compass dropout (a fresh wrapper, the default windows, seed 1). */
export const evaluateGains = (group, vec, set = T.TRAIN_SET) => T.evaluate(group === "B" ? SD.dropout(H6.pilotOf(vec), {}, 1) : H6.pilotOf(vec), set);
/** One search (`opts` for the gate: { iters, sigma, maxK, trainSet, heldSet, seed }): { group, rep, k, seed, gains, trainScore, heldScore, improved, neutral }. Deterministic. */
export function searchOne(group, rep, k, opts = {}) {
    idsOf(group);
    if (!Number.isInteger(rep) || rep < 0 || rep >= REPLICATES) throw new Error(`headToHead12.searchOne: replicate must be 0..${REPLICATES - 1}, got ${JSON.stringify(rep)}`);
    if (!Number.isInteger(k) || k < 0 || k >= RECIPE.runs) throw new Error(`headToHead12.searchOne: search k must be 0..${RECIPE.runs - 1}, got ${JSON.stringify(k)}`);
    const o = { iters: RECIPE.iters, sigma: RECIPE.sigma, maxK: RECIPE.maxK, ...opts }, seed = o.seed === undefined ? searchSeed(group, rep, k) : o.seed, rng = PS.mulberry(seed), trainSet = o.trainSet || T.TRAIN_SET;
    let best = Array.from(DEFAULT_GAINS), bestScore = evaluateGains(group, best, trainSet).score, improved = 0, neutral = 0;
    for (let i = 1; i <= o.iters; i++) {
        const cand = mutate(best, o.sigma, rng, o.maxK), score = evaluateGains(group, cand, trainSet).score;
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
    }
    return { group, rep, k, seed, gains: best, trainScore: bestScore, heldScore: evaluateGains(group, best, o.heldSet || T.HELD_OUT_SET).score, improved, neutral };
}
/** The champion of a replicate's searches: the best heldScore, ties to the smaller k; throws unless there are exactly RECIPE.runs searches of that group and replicate with distinct k. */
export function championOf(group, rep, runs) {
    idsOf(group);
    if (!Array.isArray(runs) || runs.length !== RECIPE.runs) throw new Error(`headToHead12.championOf: group ${group} replicate ${rep} needs exactly ${RECIPE.runs} searches, got ${Array.isArray(runs) ? runs.length : JSON.stringify(runs)}`);
    if (runs.some((r) => r.group !== group || r.rep !== rep) || new Set(runs.map((r) => r.k)).size !== RECIPE.runs) throw new Error(`headToHead12.championOf: the searches of group ${group} replicate ${rep} must be of that group and replicate and have distinct k`);
    const best = [...runs].sort((a, b) => b.heldScore - a.heldScore || a.k - b.k)[0];
    return { group, rep, gains: best.gains, heldScore: best.heldScore, seed: best.seed, k: best.k, searches: runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldScore: r.heldScore })).sort((a, b) => a.k - b.k) };
}
/** The tank kind of the tuned autopilots: circuit `h12-tuned`, eleven weights (the gains). */
export const KIND = Object.freeze({ circuit: "h12-tuned", label: "H12 tuned autopilot", weightCount: H6.GAIN_NAMES.length, persist: false, build: (weights) => H6.pilotOf(Array.from(weights)) });
const tunedArm = (id, gains, note) => { H6.gainsOf(gains); return { id, layer: "flying", controls: ["autopilot"], note, entry: () => ({ pilot: "tuned", circuit: KIND.circuit, weights: Array.from(gains) }), register: (tank) => tank.registerPilotKind(KIND.circuit, KIND) }; };
const netArm = (id, weights) => ({ id, layer: "flying", controls: ["autopilot"], note: `network ${id}`, entry: () => ({ pilot: "network", circuit: "gfc", weights: Array.from(weights) }) });
/** The board: the dropout task, the autopilot, the champions of group A and B and the narrow box (Maps rep -> record with gains) and the 28 networks (a Map or object id -> 963 numbers). */
export function boardOf(a, b, narrow, nets) {
    for (const [name, m] of [["wideA", a], ["wideB", b], ["box8", narrow]]) for (let r = 0; r < REPLICATES; r++) if (!m || typeof m.get !== "function" || !m.get(r)) throw new Error(`headToHead12.boardOf: no ${name} champion for replicate ${r}`);
    const get = (id) => (nets && typeof nets.get === "function" ? nets.get(id) : nets ? nets[id] : undefined);
    for (const id of NET_IDS) { const w = get(id); if (!(Array.isArray(w || null) || ArrayBuffer.isView(w || null)) || w.length !== PS.WEIGHT_COUNT) throw new Error(`headToHead12.boardOf: network ${id} must be an array of ${PS.WEIGHT_COUNT} numbers`); }
    const bd = B.createBoard().addTask(B.dropoutTask);
    bd.addArm(B.flyingArms({})[0]);
    for (let r = 0; r < REPLICATES; r++) bd.addArm(tunedArm("wideA-" + r, a.get(r).gains, `wide box, dive score, replicate ${r}`));
    for (let r = 0; r < REPLICATES; r++) bd.addArm(tunedArm("wideB-" + r, b.get(r).gains, `wide box, dive score under the dropout, replicate ${r}`));
    for (let r = 0; r < REPLICATES; r++) bd.addArm(tunedArm("box8-" + r, narrow.get(r).gains, `H6 narrow box, replicate ${r}`));
    for (const id of NET_IDS) bd.addArm(netArm(id, get(id)));
    return bd;
}
/** EVERY arm once, dark and lit, on `range` ids: { dark, lit, range, seconds, a, b, narrow, nets }. */
export function audit(a, b, narrow, nets, { range = IDS, seconds = SECONDS } = {}) {
    const bd = boardOf(a, b, narrow, nets);
    return { dark: bd.run("dropout", [...ARM_IDS], range, { seconds }).runs, lit: bd.run("dropout", [...ARM_IDS], range, { seconds, event: null }).runs, range, seconds, a, b, narrow, nets };
}
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
export const pairOf = (au, x, y, cond) => mk(B.paired(au[cond][x], au[cond][y]));
export const meanOf = (au, x, cond) => au[cond][x].reduce((s, r) => s + r.score, 0) / au[cond][x].length;
export const gainOf = (au, x, cond) => pairOf(au, x, "autopilot", cond).mean;
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, sorted = (xs) => [...xs].sort((p, q) => p - q), sdOf = (xs) => { const m = avg(xs); return Math.sqrt(xs.reduce((p, q) => p + (q - m) * (q - m), 0) / (xs.length - 1)); };
export const gainsOf = (au, ids, cond = "dark") => ids.map((x) => gainOf(au, x, cond));
/** How many of the arms beat the autopilot in the dark by more than LEARN_MARGIN. */
export const learnedCount = (au, ids) => gainsOf(au, ids).filter((g) => g > LEARN_MARGIN).length;
/** The statistics over the 28 networks' gains in the condition: { median (mean of the 14th and 15th smallest), q1 (7th smallest), q3 (7th largest), lo, hi, n }. */
export function networkStats(au, cond = "dark") {
    const g = sorted(gainsOf(au, NET_IDS, cond));
    return { median: (g[13] + g[14]) / 2, q1: g[6], q3: g[21], lo: g[0], hi: g[27], n: g.length };
}
/** { ids (the group with the larger mean dark gain), name ("A" or "B"), m (that mean), mA, mB }. A tie goes to A. */
export function bestGroup(au) {
    const mA = avg(gainsOf(au, A_IDS)), mB = avg(gainsOf(au, B_IDS));
    return mB > mA ? { ids: B_IDS, name: "B", m: mB, mA, mB } : { ids: A_IDS, name: "A", m: mA, mA, mB };
}
/** The registered verdict. */
export function verdictOf(au) {
    const g = bestGroup(au);
    if (learnedCount(au, g.ids) < LEARN_MIN) return "THE WIDE BOX STILL FINDS NOTHING";
    const s = networkStats(au);
    return g.m >= s.median ? "THE GAIN IS A TUNING GAP AFTER ALL" : g.m < s.q1 ? "A WIDER PD TUNE DOES NOT REACH IT" : "A WIDER PD TUNE REACHES PART OF IT";
}
/** How many gains of the champions of a group (a Map rep -> record with gains) sit on a bound of the box (within 1e-9 relative). */
export function onBound(m) {
    let n = 0;
    for (let r = 0; r < REPLICATES; r++) m.get(r).gains.forEach((g, i) => { if (Math.abs(g / (DEFAULT_GAINS[i] * GAIN_BOUND) - 1) < 1e-9 || Math.abs(g * GAIN_BOUND / DEFAULT_GAINS[i] - 1) < 1e-9) n++; });
    return n;
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, x) => lostOf(au.dark[x]) + lostOf(au.lit[x]);
const spread = (g) => `${f4(avg(g))} (sd ${sdOf(g).toFixed(4)}, range ${f4(Math.min(...g))} to ${f4(Math.max(...g))})`;
export function bottomLines(au) {
    const s = networkStats(au), sl = networkStats(au, "lit"), gA = gainsOf(au, A_IDS), gB = gainsOf(au, B_IDS), gN = gainsOf(au, NARROW_IDS), mN = avg(gN), mA = avg(gA), mB = avg(gB);
    const lt = [...A_IDS, ...B_IDS].map((x) => lostBoth(au, x)), ln = NET_IDS.map((x) => lostBoth(au, x)), sum = (a) => a.reduce((p, q) => p + q, 0);
    return [
        `WIDE BOX: ${learnedCount(au, A_IDS)} OF ${REPLICATES} OBJECTIVE-A AND ${learnedCount(au, B_IDS)} OF ${REPLICATES} OBJECTIVE-B CHAMPIONS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN ${LEARN_MARGIN}`,
        `DARK GAIN OVER THE AUTOPILOT: WIDE A ${spread(gA)}; WIDE B ${spread(gB)}; NARROW BOX (H6) ${f4(mN)}; THE ${s.n} NETWORKS median ${f4(s.median)} (quartiles ${f4(s.q1)} to ${f4(s.q3)}, range ${f4(s.lo)} to ${f4(s.hi)})`,
        `WIDENING THE BOX: A minus the narrow box ${f4(mA - mN)}; B minus the narrow box ${f4(mB - mN)}; B minus A ${f4(mB - mA)}`,
        `GAINS ON A BOUND (champions x gains of ${REPLICATES * GAIN_NAMES.length}, at default x ${GAIN_BOUND} or default / ${GAIN_BOUND}): A ${onBound(au.a)}, B ${onBound(au.b)}`,
        `LIT TANK: WIDE A ${f4(avg(gainsOf(au, A_IDS, "lit")))}, WIDE B ${f4(avg(gainsOf(au, B_IDS, "lit")))}; THE ${sl.n} NETWORKS median ${f4(sl.median)}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, tuned ${sum(lt)} (${Math.max(...lt)} in the worst), networks ${sum(ln)} (${Math.max(...ln)} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((x) => [c, x]));
    const sizes = cells.every(([c, x]) => au[c][x] && au[c][x].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, x]) => au[c][x] && au[c][x].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, x]) => au[c][x] && au[c][x].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const champ = (m) => Array.from({ length: REPLICATES }, (_, r) => { const c = m && m.get && m.get(r); return !!c && Array.isArray(c.gains) && c.gains.length === GAIN_NAMES.length && !!c.searches && c.searches.length === RECIPE.runs && c.gains.every((g, i) => Number.isFinite(g) && g >= DEFAULT_GAINS[i] / GAIN_BOUND * (1 - 1e-9) && g <= DEFAULT_GAINS[i] * GAIN_BOUND * (1 + 1e-9)); }).every(Boolean);
    const champs = champ(au.a) && champ(au.b);
    rows.push({ name: "WIDE CHAMPIONS OF FOUR SEARCHES", ok: champs, text: `every wide champion is the champion of exactly ${RECIPE.runs} searches with ${GAIN_NAMES.length} finite gains inside [default/${GAIN_BOUND}, default x ${GAIN_BOUND}]: ${champs}` });
    const key = (x) => (au.dark[x] || []).map((r) => r.score).join("|"), wide = [...A_IDS, ...B_IDS], distinct = new Set(wide.map(key)).size === wide.length && wide.every((x) => key(x) !== key("autopilot"));
    rows.push({ name: "WIDE ARMS DISTINCT", ok: distinct, text: `the ${wide.length} wide champions are pairwise different in the dark and each differs from the autopilot: ${distinct}` });
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET_IDS.every((id) => { const w = get(id); return !!w && w.length === PS.WEIGHT_COUNT && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is ${PS.WEIGHT_COUNT} finite weights: ${nets}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const R = [`ROUND H12: the wider box for the PD tune. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark / lit):");
    for (const x of ARM_IDS) R.push(`  ${x.padEnd(20)} ${meanOf(au, x, "dark").toFixed(4)} / ${meanOf(au, x, "lit").toFixed(4)}`);
    R.push("the wide champions (gains as factors of the defaults; held-out score; the four searches' held-out scores):");
    for (const [name, m] of [["wideA", au.a], ["wideB", au.b]]) for (let r = 0; r < REPLICATES; r++) { const c = m.get(r); R.push(`  ${name}-${r}: ${GAIN_NAMES.map((nm, i) => `${nm} x${(c.gains[i] / DEFAULT_GAINS[i]).toFixed(2)}`).join(", ")}`, `            held-out ${c.heldScore.toFixed(4)} (searches ${c.searches.map((q) => q.heldScore.toFixed(3)).join(" ")})`); }
    R.push("gains over the autopilot, dark / lit:");
    for (const x of [...A_IDS, ...B_IDS, ...NARROW_IDS]) R.push(`${x}:`, `   dark ${fmt(pairOf(au, x, "autopilot", "dark"))}`, `   lit  ${fmt(pairOf(au, x, "autopilot", "lit"))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
