// WebGLEngine/tools/ship/headToHead84.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead84Cmd.mjs; the gate is tools/ship/headToHead84-selfcheck.mjs)
//
// ROUND H84 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT SEED SET -- FOUR NEW SEEDS (38001-38004) OF H38'S TWO SMALLER NETWORKS, the one pruned by a rule (group Z02: H38's X02 topology) and the one drawn at random (group W02: H38's Y02 topology, the draw of seed 4244 held fixed).
// THIS FILE IS A LAYER ON H38'S LIBRARY (headToHead38.mjs): the topologies, their starts, the smaller arms, the objective, the validation and H32's loop are H38's, called, not copied; a Z02 search IS an X02 search of H38 and a W02 search IS a Y02 search with the labels changed in the records. What is new here: the groups' names and seeds,
// the arms (H38's two stored champions on their stored topologies beside the eight new networks), the audit ids, the pruned-against-random group comparison and the verdict. The topologies depend on network-Wip's weights: the command and the gate call prepare(wip) first. Reads and writes nothing itself.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";
import * as X38 from "./headToHead38.mjs";

export const IDS = Object.freeze({ from: 104200, to: 104399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = X38.PRICE, EARLIER_AUDIT = 103399;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION, TRAIN_SIZE = 72;
export const GROUPS = Object.freeze(["Z02", "W02"]), BASE = Object.freeze({ Z02: "X02", W02: "Y02" }), BACK = Object.freeze({ X02: "Z02", Y02: "W02" });
export const SEEDS = Object.freeze({ Z02: [38001, 38002, 38003, 38004], W02: [38001, 38002, 38003, 38004] });
export const Z_IDS = Object.freeze(SEEDS.Z02.map((s) => "z02_" + s)), W_IDS = Object.freeze(SEEDS.W02.map((s) => "w02_" + s)), X38C = "x02_26014", Y38C = "y02_26011";
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", "s02_26011", X38C, Y38C, ...Z_IDS, ...W_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const idCount = (rs) => rs.reduce((n, r) => n + r.to - r.from + 1, 0);
const need = (g) => { if (!GROUPS.includes(g)) throw new Error(`headToHead84: the group must be one of ${GROUPS.join(", ")}, got ${J(g)}`); return BASE[g]; };
/** Fills H38's two topologies from wip (H38's prepare): the pruned X02 and the drawn Y02. Must be called before anything below that flies or validates. */
export const prepare = X38.prepare;
/** The smaller circuit of a group (Z02 or W02): H38's { kept, topo, edgeIndex, policy, weightCount, kind, start }. */
export const small = (group) => X38.small(need(group));
/** The record H38 writes for a search of the base group, with the group label of this round. */
const relabel = (r) => ({ ...r, group: BACK[r.group] || r.group });
/** Reads and validates a state file of a Z02 or W02 search (null when there is none): H38's validation on the base group, the state labelled with this round's group, and it must carry the price and train size of this round. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead84.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    const { group, ...rest } = ctx;
    if (group !== undefined) need(group);
    X38.validateState({ ...s, group: BASE[s.group] }, { iters: ITERS, checkpoints: CHECKPOINTS, ...rest, group: group === undefined ? undefined : BASE[group] });
    if (s.price !== PRICE) throw new Error(`headToHead84.loadState: the state's price is ${J(s.price)}, not ${PRICE}`);
    if (s.trainSize !== TRAIN_SIZE) throw new Error(`headToHead84.loadState: the state's train size is ${J(s.trainSize)}, not ${TRAIN_SIZE}`);
    return s;
}
/**
 * One RESUMABLE search of `group` (Z02 or W02) from `start` (the group's start): H38's longSearch on the base group; every saved state and the result carry this round's group label, the price and the train size; `state` resumes
 * (it must carry this round's label, the price and the train size). Returns what H38's longSearch returns with group relabelled and { price, trainSize }.
 */
export function longSearch(seed, group, start, { state = null, save = null, ...opts } = {}) {
    const base = need(group);
    if (state && state.group !== group) throw new Error(`headToHead84.longSearch: the state is of group ${J(state.group)}, not ${J(group)}`);
    if (state && state.price !== PRICE) throw new Error(`headToHead84.longSearch: the state's price is ${J(state.price)}, not ${PRICE}`);
    if (state && state.trainSize !== TRAIN_SIZE) throw new Error(`headToHead84.longSearch: the state's train size is ${J(state.trainSize)}, not ${TRAIN_SIZE}`);
    const r = X38.longSearch(seed, base, start, { ...opts, state: state ? { ...state, group: base } : null, save: save ? (s) => save({ ...s, group, price: PRICE, trainSize: TRAIN_SIZE }) : null });
    return { ...r, group, price: PRICE, trainSize: TRAIN_SIZE };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of a group at a checkpoint: the best held-out penalised value of its four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, group, iter) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) && seeds ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || !CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead84.champion: group ${group} needs one search for each of the seeds ${seeds ? seeds.join(", ") : "(none: not a group)"}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
const lawOkW = (w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite);
/** The 13 arms as { id: arm }: `h27` = { laws: [q02] }; `old` = { s02: H32's champion's weights, x02: H38's pruned champion's (481), y02: H38's random champion's (413) }; `fresh` = { Z02: [four], W02: [four] } in seed order. */
export function armsOf(wip, h27, old, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead84.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every(lawOkW)) throw new Error("headToHead84.armsOf: h27 is { laws: [the 4-weight law of 0.02] }");
    const nZ = small("Z02").weightCount, nW = small("W02").weightCount, ok = (w, n) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === n && Array.from(w).every(Number.isFinite);
    if (!old || !wOk(old.s02) || !ok(old.x02, nZ) || !ok(old.y02, nW)) throw new Error(`headToHead84.armsOf: old is { s02: 963 weights, x02: ${nZ} weights, y02: ${nW} weights }`);
    if (!fresh || !Array.isArray(fresh.Z02) || fresh.Z02.length !== 4 || !fresh.Z02.every((w) => ok(w, nZ)) || !Array.isArray(fresh.W02) || fresh.W02.length !== 4 || !fresh.W02.every((w) => ok(w, nW))) throw new Error(`headToHead84.armsOf: fresh is { Z02: four ${nZ}-weight vectors, W02: four ${nW}-weight vectors }`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]), s02_26011: netArm("s02_26011", old.s02), [X38C]: X38.smallArm(X38C, "X02", old.x02), [Y38C]: X38.smallArm(Y38C, "Y02", old.y02) };
    Z_IDS.forEach((id, i) => { out[id] = X38.smallArm(id, "X02", fresh.Z02[i]); }); W_IDS.forEach((id, i) => { out[id] = X38.smallArm(id, "Y02", fresh.W02[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 13; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, old, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, h38 = null, earlier = null, startVals = null, startVal32 = null, probe = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, old, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead84.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, old, fresh, search, original, h32, h38, earlier, startVals, startVal32, probe, proof32, fixture, c02: all.c02.entry().weights };
}
/** The penalised value of each smaller start on the 72 train ids at 0.02 and how many flights lost a run: { Z02: { value, lost }, W02: { value, lost } } (H38's startValues, relabelled). */
export function startValues(wip, opts = {}) { const v = X38.startValues(wip, opts); return { Z02: v.X02, W02: v.Y02 }; }
export const startVal = X38.startVal;
export const startProbe = (wip) => { const p = X38.startProbe(wip); return { Z02: p.X02, W02: p.Y02 }; };
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b, p = PRICE) => penPair(au, a, b, p);
/** An arm's mean penalised priced score at a price (default 0.02) over the audit ids. */
export const penMean = (au, a, p = PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
/** An arm's mean power in kW over the audit ids: the mean of its dark and lit mean powers. */
export const meanPower = (au, a) => (avg(au.dark[a].map((r) => r.watts)) + avg(au.lit[a].map((r) => r.watts))) / 2000;
/** The arm id of a group's champion at 1800 (z02_<seed> or w02_<seed>). */
export const champArm = (au, group) => (group === "Z02" ? "z02_" : "w02_") + champion(au.search, group, LAST).seed;
/** H32's champion's generalisation gap at 1800 (train minus held-out value of the champion of its stored search). */
export const gap32 = (au) => { const k = X32.champion(au.h32.search, LAST); return k.trainScore - k.heldScore; };
const sd = (xs) => { const m = avg(xs); return Math.sqrt(xs.reduce((p, q) => p + (q - m) ** 2, 0) / (xs.length - 1)); };
/** The group comparison: { diff, se, within } for the mean audit value of the pruned four minus the random four (se = sqrt of the sum of the two groups' variances of four, each over four; within = |diff| <= 2 se). */
export function groupDiff(au) {
    const a = Z_IDS.map((id) => penMean(au, id)), b = W_IDS.map((id) => penMean(au, id)), se = Math.sqrt(sd(a) ** 2 / 4 + sd(b) ** 2 / 4), diff = avg(a) - avg(b);
    return { diff, se, within: Math.abs(diff) <= 2 * se };
}
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const c = champArm(au, "Z02"), d = champArm(au, "W02"), rd = (b) => word(pen(au, c, b).reading), nb = (ids) => ids.filter((a) => pen(au, a, "c02").reading !== "WORSE").length;
    const lost = [...Z_IDS, ...W_IDS].filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), k = champion(au.search, "Z02", LAST), g = groupDiff(au);
    return [`THE NEW PRUNED CHAMPION ${rd("c02")} C02`, `THE NEW PRUNED CHAMPION ${rd("q02")} Q02`, `THE NEW PRUNED CHAMPION ${rd(X38C)} H38'S PRUNED CHAMPION`, `THE NEW PRUNED CHAMPION ${rd(d)} THE NEW RANDOM CHAMPION`, `NOT BEHIND C02: PRUNED ${nb(Z_IDS)} OF 4, RANDOM ${nb(W_IDS)} OF 4`,
        `LOST SUBS: ${lost.length ? lost.join(", ") : "NONE"}`, `THE PRUNED CHAMPION'S GAP IS SMALLER THAN H32'S: ${k.trainScore - k.heldScore < gap32(au) ? "YES" : "NO"}`, `PRUNED MINUS RANDOM MEAN AUDIT VALUE: ${g.diff.toFixed(4)} (se ${g.se.toFixed(4)}); WITHIN 2 SE OF ZERO: ${g.within ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
/** The generalisation gap (train minus held-out value) of each group's champion at each checkpoint and of every seed at 1800, and H32's champion's: { Z02: { champ, seeds }, W02: {...}, h32 }. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore, one = (grp) => ({ champ: CHECKPOINTS.map((it) => g(champion(au.search, grp, it))), seeds: SEEDS[grp].map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === grp), LAST))) });
    return { Z02: one("Z02"), W02: one("W02"), h32: gap32(au) };
}
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from its topology's start and from the same index of H38's own champion of the group (the stored x02 / y02 champion weights). */
export const distances = (au) => [...Z_IDS.map((id, i) => ({ id, l1Start: l1(au.fresh.Z02[i], small("Z02").start), l1Old: l1(au.fresh.Z02[i], au.old.x02) })), ...W_IDS.map((id, i) => ({ id, l1Start: l1(au.fresh.W02[i], small("W02").start), l1Old: l1(au.fresh.W02[i], au.old.y02) }))];
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", "s02_26011", X38C, Y38C, ...Z_IDS, ...W_IDS], priceRow = (a, f) => `${a} ${[0.01, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au, "Z02"), d = champArm(au, "W02");
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const searchOf = (g) => au.search.filter((r) => r.group === g).map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = GROUPS.map((g) => `${g} ${CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, g, it).seed} held ${champion(au.search, g, it).heldScore.toFixed(4)}`).join(", ")}`).join("; ");
    const gp = gapsOf(au), gapText = (g) => `${g} champion ${gp[g].champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800, each seed at 1800 ${SEEDS[g].map((s, i) => `${s} ${gp[g].seeds[i].toFixed(4)}`).join(", ")}`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairsAt = (p) => [...["c02", "q02", X38C, d].map((b) => `${c} minus ${b} at ${p} ${fmt(pen(au, c, b, p))}`), ...Z_IDS.map((id) => `${id} minus c02 at ${p} ${fmt(pen(au, id, "c02", p))}`), ...W_IDS.map((id) => `${id} minus ${Y38C} at ${p} ${fmt(pen(au, id, Y38C, p))}`)];
    const grp = (ids) => { const v = ids.map((a) => penMean(au, a)); return `mean ${avg(v).toFixed(4)}, min ${Math.min(...v).toFixed(4)}, max ${Math.max(...v).toFixed(4)}`; };
    const rank = [...Z_IDS, ...W_IDS, X38C, Y38C].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au).map((x) => `${x.id} L1 ${x.l1Start.toFixed(2)} from its start, ${x.l1Old.toFixed(2)} from H38's champion of its topology`).join("; ");
    const power = ["autopilot", "c02", "q02", "s02_26011", X38C, Y38C, ...Z_IDS, ...W_IDS].map((a) => `${a} ${meanPower(au, a).toFixed(2)}`).join(", ");
    const sv = au.startVals, topo = GROUPS.map((g) => `${g}: ${small(g).kept.length} neurons (the fly's ${small(g).kept.join(" ")}), ${small(g).edgeIndex.length} edges, ${small(g).weightCount} weights`).join("; ");
    return [
        `TOPOLOGY (H38's two smaller circuits, unchanged): ${topo}`,
        `STARTS (penalised value on the 72 train ids at 0.02; network-Wip's is ${au.startVal32.toFixed(4)}): Z02 ${sv.Z02.value.toFixed(4)} (${sv.Z02.lost} flights lost a run), W02 ${sv.W02.value.toFixed(4)} (${sv.W02.lost} flights lost a run)`,
        `SEARCH Z02 (start value, then train / held-out penalised value and accepted count at each checkpoint): ${searchOf("Z02")}`,
        `SEARCH W02 (the same): ${searchOf("W02")}`,
        `RESUMES: ${au.search.map((r) => `${r.group} ${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champions at 1800 are ${c} and ${d} (the best pruned on the audit: ${[...Z_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]}, the best random: ${[...W_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]})`,
        `GENERALISATION GAP (train value minus held-out value): ${gapText("Z02")}; ${gapText("W02")} (H32's champion at 1800 ${gp.h32.toFixed(4)})`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `POWER (mean of the dark and lit mean powers, kW): ${power}`,
        `EXTRA POWER (mean of dark and lit extra kW over the autopilot): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.01 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED AT 0.02 (penalised priced score): ${pairsAt(0.02).join("; ")}`,
        `PAIRED AT 0.01 (REPORTED): ${pairsAt(0.01).join("; ")}`,
        `PAIRED AT 0.04 (REPORTED): ${pairsAt(0.04).join("; ")}`,
        `GROUPS (audit mean of the four networks of each group at 0.02): PRUNED ${grp(Z_IDS)}; RANDOM ${grp(W_IDS)}; H38's pruned champion ${penMean(au, X38C).toFixed(4)}, H38's random champion ${penMean(au, Y38C).toFixed(4)}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; audit means at 0.02 in rank order ${rank}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
const KEPT_Z = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 21, 23, 25, 28, 31, 32, 33]), KEPT_W = Object.freeze([1, 2, 4, 5, 6, 7, 10, 11, 13, 17, 22, 23, 26, 27, 30, 31, 33]);
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((q) => ARM_IDS.map((a) => [q, a]));
    const sizes = cells.every(([q, a]) => au[q][a] && au[q][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const aligned = cells.every(([q, a]) => au[q][a] && au[q][a].every((r, i) => au[q].autopilot[i] && r.key === au[q].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids are the same in every arm and condition: ${aligned}` });
    const inside = cells.every(([q, a]) => au[q][a] && au[q][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([q, a]) => au[q][a] && au[q][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const ident = ["dark", "lit"].every((q) => au[q].law0 && au[q].law0.every((r, i) => au[q].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[q].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const topoOk = (() => { try { return J(small("Z02").kept) === J(KEPT_Z) && J(small("W02").kept) === J(KEPT_W) && small("Z02").weightCount === 481 && small("W02").weightCount === 413 && !!au.probe && au.probe.Z02.positionsOk === true && au.probe.W02.positionsOk === true && au.probe.Z02.weights === 481 && au.probe.W02.weights === 413; } catch (e) { return false; } })();
    rows.push({ name: "THE TOPOLOGIES ARE H38'S, BUILT FROM WIP", ok: topoOk, text: `the pruned circuit keeps exactly the fly's neurons 0-9, 21, 23, 25, 28, 31, 32, 33 (481 weights) and the random one exactly 1, 2, 4, 5, 6, 7, 10, 11, 13, 17, 22, 23, 26, 27, 30, 31, 33 (413), each start carries network-Wip's weights on what is kept (read back by position): ${topoOk}` });
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 8 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => GROUPS.includes(r.group) && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => Array.isArray(k.weights) && k.weights.length === small(r.group).weightCount && k.weights.every(Number.isFinite) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && GROUPS.every((g) => Array.isArray(au.fresh[g]) && au.fresh[g].length === 4 && SEEDS[g].every((q, i) => J(Array.from(au.fresh[g][i])) === J(cpOf(s.find((r) => r.group === g && r.seed === q), LAST).weights))) && wOk(au.wip);
    rows.push({ name: "8 SEARCHES, EACH (GROUP, SEED) ONCE, EACH WITH FOUR CHECKPOINTS OF ITS TOPOLOGY'S LENGTH", ok: !!counted, text: `8 searches (the four seeds of each of Z02 and W02), each with checkpoints at 900, 1200, 1500 and 1800 of finite weights of its topology's length, and the 8 flown networks are the searches' 1800-iteration weights in seed order: ${!!counted}` });
    const priceOk = PRICE === 0.02 && Array.isArray(s) && s.length === 8 && s.every((r) => r.price === 0.02) && J(TRAIN) === J(X32.TRAIN) && idCount(TRAIN) === 72 && s.every((r) => r.trainSize === 72);
    rows.push({ name: "THE PRICE IS 0.02 AND THE TRAIN SET H32'S 72 IDS", ok: !!priceOk, text: `the price of the loop and of every reading is 0.02, the train set is H32's 72 ids (26000-26023 and 30000-30047), and every search record carries both: ${!!priceOk}` });
    const sv = au.startVals, h8 = au.h38, first = !!counted && !!sv && !!sv.Z02 && !!sv.W02 && Number.isFinite(sv.Z02.value) && Number.isFinite(sv.W02.value) && s.every((r) => r.startTrain === sv[r.group].value) && !!h8 && Array.isArray(h8.search) && h8.search.every((r) => near(r.startTrain, sv[BACK[r.group]].value));
    rows.push({ name: "THE FIRST PARENTS ARE THE SMALLER STARTS, H38'S STORED STARTS", ok: !!first, text: `every Z02 search's first parent has exactly the pruned start's penalised value at 0.02 on the 72 train ids and every W02 search's the random start's (computed in this round), and H38's stored searches start at the same values: ${!!first}` });
    const bestAt = (g) => { try { const c = champion(s, g, LAST); return s.filter((r) => r.group === g).every((r) => c.heldScore >= cpOf(r, LAST).heldScore) && J(c.weights) === J(cpOf(s.find((r) => r.group === g && r.seed === c.seed), LAST).weights); } catch (e) { return false; } };
    rows.push({ name: "EACH GROUP'S CHAMPION IS THE BEST HELD-OUT PENALISED OF ITS FOUR AT 1800", ok: !!(counted && bestAt("Z02") && bestAt("W02")), text: `each group's champion at 1800 has the largest held-out penalised value (at 0.02) of its four seeds (the first of a tie in seed order): ${!!(counted && bestAt("Z02") && bestAt("W02"))}` });
    const ol = au.old, h3 = au.h32;
    const stored = !!ol && !!h8 && Array.isArray(h8.search) && !!h3 && Array.isArray(h3.search) && (() => { try { const cx = X38.champion(h8.search, "X02", LAST), cy = X38.champion(h8.search, "Y02", LAST), c3 = X32.champion(h3.search, LAST); return cx.seed === 26014 && cy.seed === 26011 && c3.seed === 26011 && J(Array.from(ol.x02)) === J(Array.from(cx.weights)) && J(Array.from(ol.y02)) === J(Array.from(cy.weights)) && J(Array.from(ol.s02)) === J(Array.from(c3.weights)); } catch (e) { return false; } })();
    rows.push({ name: "THE FLOWN OLD CHAMPIONS ARE THE STORED ONES", ok: !!stored, text: `x02_26014 is the champion of H38's stored X02 search by H38's rule and y02_26011 that of its Y02 (each its 1800-iteration weights on its stored topology), and s02_26011 is the champion of H32's by H32's rule: ${!!stored}` });
    const o = au.original, k = au.h27, lawRow = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })();
    const regc = lawRow && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!regc}` });
    const seedsOk = J(SEEDS.Z02) === "[38001,38002,38003,38004]" && J(SEEDS.W02) === "[38001,38002,38003,38004]" && Array.isArray(au.earlier) && SEEDS.Z02.every((q) => !au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS[r.group] && SEEDS[r.group].includes(r.seed));
    rows.push({ name: "THE SEEDS ARE 38001-38004 AND NEW", ok: seedsOk, text: `the four seeds of each group are 38001-38004 and none of them is in any earlier round's stored search: ${seedsOk}` });
    const dj = [...TRAIN, HELD].every((q) => disjoint(q, au.range)) && au.range.from > EARLIER_AUDIT;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap any train id (26000-26023 and 30000-30047) or the held-out ids 26100-26139, and start after H83's audit (${EARLIER_AUDIT}): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H84: a different seed set (H38's two smaller networks, the pruned Z02 and the drawn W02, with new seeds 38001-38004: 72 train ids, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.01 / 0.02 / 0.04:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${[0.01, 0.02, 0.04].map((p) => f4(penGainAt(au, a, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
