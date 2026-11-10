// WebGLEngine/tools/ship/headToHead22.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead22Cmd.mjs; the gate is tools/ship/headToHead22-selfcheck.mjs)
//
// ROUND H22 of brain/HEAD_TO_HEAD.md (registered before this file existed): WHERE DOES c02 STAND AMONG TWENTY SEARCHES? Twenty (1+1)-ES searches of H21's full four-weight family at 0.02 per kW (H21's search, objective and box; new ids and
// seeds 22001-22020), ranked by held-out priced value; c02 scored on the same held-out ids; the best (rank 1), median (rank 10) and worst (rank 20) flown against c02 and the autopilot on 200 audit ids, dark and lit, read as the priced score.
// Reads nothing from disk (the command hands the weights and the search rows in).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X from "./headToHead21.mjs";

export const TRAIN = Object.freeze({ from: 22000, to: 22023 }), HELD = Object.freeze({ from: 22100, to: 22139 }), IDS = Object.freeze({ from: 22200, to: 22399 });
export const SECONDS = 160, ITERS = 300, LAMBDA = X.LAMBDA, BASIN_C = Object.freeze([1.2, 4.0]), BASIN_D = 0.3, N_SEARCHES = 20;
export const SEEDS = Object.freeze(Array.from({ length: N_SEARCHES }, (_, i) => 22001 + i));
export const BOX = X.BOX, LAW_C02 = X.LAW_C02, LAW_H16 = X.LAW_H16, WEIGHT_NAMES = X.WEIGHT_NAMES;
export const PICK_IDS = Object.freeze(["best", "median", "worst"]), PICK_RANK = Object.freeze({ best: 1, median: 10, worst: 20 });
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "h16", ...PICK_IDS]);
/** Whether a law is in c02's basin: c in [1.2, 4.0] and d at least 0.3. */
export const inBasin = (w) => Array.isArray(w) && w.length === 4 && w[0] >= BASIN_C[0] && w[0] <= BASIN_C[1] && w[1] >= BASIN_D;
export const insideBox = X.insideBox, sAtEdge = X.sAtEdge;
/** The priced objective of a law (H21's, at 0.02) on `range` ids. */
export const objective = (w, range, seconds = SECONDS, flyFn = H15.fly) => X.objective(w, range, seconds, flyFn);
/** One (1+1)-ES search of the full family (H21's group F4) on this round's ids. */
export const searchOne = (seed, { iters = ITERS, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = H15.fly } = {}) => X.searchOne(seed, "F4", { iters, train, held, seconds, flyFn });
/** The twenty rows ranked by held-out priced value, best first (a tie: the lower seed first); refuses anything but exactly the twenty registered seeds once each. */
export function rankOf(rows) {
    if (!Array.isArray(rows) || rows.length !== N_SEARCHES || !SEEDS.every((s) => rows.filter((r) => r && r.seed === s).length === 1)) throw new Error(`headToHead22.rankOf: needs one search for each of the seeds ${SEEDS[0]}-${SEEDS[N_SEARCHES - 1]} (${N_SEARCHES} rows)`);
    return [...rows].sort((a, b) => (b.heldScore !== a.heldScore ? b.heldScore - a.heldScore : a.seed - b.seed));
}
/** The three picks of the ranking: best (rank 1), median (rank 10), worst (rank 20), as { best, median, worst } rows. */
export function picksOf(rows) { const r = rankOf(rows); return { best: r[PICK_RANK.best - 1], median: r[PICK_RANK.median - 1], worst: r[PICK_RANK.worst - 1] }; }
/** The seven arms as { id: arm } (`laws` = [best, median, worst] laws). */
export function armsOf(laws) {
    if (!Array.isArray(laws) || laws.length !== 3) throw new Error("headToHead22.armsOf: laws is the three picks' laws (best, median, worst)");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), h16: H16.lawArm("h16", LAW_H16) };
    PICK_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, laws[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 7; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, laws, search, c02Held, c02HeldAgain, fixed }. */
export function audit(laws, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null, c02Held = null, c02HeldAgain = null } = {}) {
    const all = armsOf(laws), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead22.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, laws, search, c02Held, c02HeldAgain, fixed: [all.c02.entry().weights, all.h16.entry().weights] };
}
// ---- the readings
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, efficiencyOf = H15.efficiencyOf, scoreMean = H15.meanOf;
export const pricedRuns = X.pricedRuns, pricedGain = X.pricedGain, pairP = X.pairP;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
/** How many of the searches have a held-out priced value at least c02's. */
export const reachedBy = (au) => au.search.filter((r) => r.heldScore >= au.c02Held).length;
/** c02's rank among the searches plus itself: 1 + the number of searches strictly above it. */
export const c02Rank = (au) => 1 + au.search.filter((r) => r.heldScore > au.c02Held).length;
/** The registered verdict: six parts joined by "; " (part E holds one "; " inside). */
export function verdictOf(au) {
    const basin = au.search.filter((r) => inBasin(r.law)).length, edge = au.search.filter((r) => sAtEdge(r.law[3])).length;
    return [`C02'S HELD-OUT VALUE IS REACHED BY ${reachedBy(au)} OF ${N_SEARCHES} SEARCHES`, `THE BEST SEARCH ${word(pairP(au, "best", "c02").reading)} C02`, `THE MEDIAN SEARCH ${word(pairP(au, "median", "c02").reading)} C02`,
        `THE WORST SEARCH ${word(pairP(au, "worst", "autopilot").reading)} THE AUTOPILOT`, `SEARCHES IN C02'S BASIN: ${basin} OF ${N_SEARCHES}; S AT THE BOX EDGE: ${edge} OF ${N_SEARCHES}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), effText = (e) => (e === null ? "n/a" : e.toFixed(3));
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const sortedAsc = (xs) => [...xs].sort((a, b) => a - b), med = (xs) => { const s = sortedAsc(xs); return 0.5 * (s[s.length / 2 - 1] + s[s.length / 2]); };
export function bottomLines(au) {
    const ranked = rankOf(au.search), shown = ["autopilot", "c02", "h16", ...PICK_IDS];
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const held = ranked.map((r) => r.heldScore), pr = { b: pairP(au, "best", "c02"), m: pairP(au, "median", "c02"), w: pairP(au, "worst", "autopilot") };
    const dist = WEIGHT_NAMES.map((n, i) => { const v = au.search.map((r) => r.law[i]); return `${n} ${Math.min(...v).toFixed(3)} / ${med(v).toFixed(3)} / ${Math.max(...v).toFixed(3)}`; }).join("; ");
    return [
        `SEARCHES (rank, seed, law c d k s, train / held-out priced value, accepted): ${ranked.map((r, i) => `${i + 1}. ${r.seed} [${r.law.map((v) => v.toFixed(3)).join(" ")}] ${r.trainScore.toFixed(4)} / ${r.heldScore.toFixed(4)} acc ${r.accepted}`).join("; ")}`,
        `C02 ON THE HELD-OUT IDS: priced value ${au.c02Held.toFixed(4)}, rank ${c02Rank(au)} among the ${N_SEARCHES} searches and itself (${au.search.filter((r) => r.heldScore > au.c02Held).length} searches above it, ${reachedBy(au)} at or above)`,
        `SPREAD (held-out priced value): best minus worst ${(held[0] - held[N_SEARCHES - 1]).toFixed(4)}; rank 5 ${held[4].toFixed(4)}, rank 10 ${held[9].toFixed(4)}, rank 15 ${held[14].toFixed(4)}`,
        `AUDIT (dark / lit mean score, dark mean power, dark mean thrust): ${shown.map(arm).join("; ")}`,
        `PRICED GAIN AT ${X.LAMBDA}: ${shown.slice(1).map((a) => `${a} ${f4(pricedGain(au, a))}`).join("; ")}`,
        `PAIRED (priced score): best minus c02 ${fmt(pr.b)}; median minus c02 ${fmt(pr.m)}; worst minus autopilot ${fmt(pr.w)}`,
        `BASIN (c in [${BASIN_C[0]}, ${BASIN_C[1]}] and d at least ${BASIN_D}): ${ranked.map((r) => `${r.seed} c ${r.law[0].toFixed(2)} d ${r.law[1].toFixed(2)} ${inBasin(r.law) ? "IN" : "out"}`).join("; ")}`,
        `DISTRIBUTION OVER THE ${N_SEARCHES} (min / median / max): ${dist}`,
        `GAINS (dark / lit gain, dark / lit extra kW, dark efficiency): ${PICK_IDS.map((c) => `${c} ${f4(gainOf(au, c))} / ${f4(gainOf(au, c, "lit"))}, ${f2(extraKw(au, c))} / ${f2(extraKw(au, c, "lit"))}, ${effText(efficiencyOf(au, c))}`).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, c02 ${lostBoth(au, "c02")}, picks ${PICK_IDS.map((c) => lostBoth(au, c)).join(" / ")}, h16 ${lostBoth(au, "h16")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, J = JSON.stringify;
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const ident = ["dark", "lit"].every((c) => au[c].law0 && au[c].law0.every((r, i) => au[c].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[c].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const s = au.search, twenty = Array.isArray(s) && s.length === N_SEARCHES && SEEDS.every((q) => s.filter((r) => r.seed === q).length === 1) && s.every((r) => insideBox(r.law)) && Array.isArray(au.laws) && au.laws.length === 3 && au.laws.every(insideBox);
    rows.push({ name: "TWENTY SEARCHES INSIDE THE BOX", ok: twenty, text: `seeds ${SEEDS[0]}-${SEEDS[N_SEARCHES - 1]} each once, every law and the three picks inside the box: ${twenty}` });
    const dj = disjoint(TRAIN, HELD) && disjoint(TRAIN, au.range) && disjoint(HELD, au.range);
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap: ${dj}` });
    let ranks = false; try { const p = picksOf(s); ranks = PICK_IDS.every((id, i) => Array.isArray(au.laws) && J(au.laws[i]) === J(p[id].law)); } catch (e) { ranks = false; }
    rows.push({ name: "PICKS ARE RANKS 1, 10 AND 20", ok: ranks, text: `best, median and worst are the laws at ranks 1, 10 and 20 of the held-out ranking: ${ranks}` });
    const fixed = Array.isArray(au.fixed) && au.fixed.length === 2 && J(au.fixed[0]) === J(LAW_C02) && J(au.fixed[1]) === J(LAW_H16) && !!au.dark.c02 && !!au.dark.h16;
    rows.push({ name: "C02 AND H16 ARE THE REGISTERED LAWS", ok: fixed, text: `the c02 and h16 arms fly the laws written in the registration: ${fixed}` });
    const again = Number.isFinite(au.c02Held) && au.c02Held === au.c02HeldAgain;
    rows.push({ name: "C02 HELD-OUT VALUE RECOMPUTED", ok: again, text: `c02's held-out priced value stored and recomputed from the registered law agree exactly: ${again}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H22: where c02 stands among twenty searches. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}`);
    R.push("per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), priced gain:");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${f4(pricedGain(au, a))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
