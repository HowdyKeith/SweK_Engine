// WebGLEngine/tools/ship/headToHead69.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead69Cmd.mjs; the gate is tools/ship/headToHead69-selfcheck.mjs)
//
// ROUND H69 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT TRAIN SET -- THE 72 HARDEST IDS AND THE 72 EASIEST, NOT A RANDOM 72. H32's search (the 963 weights of network-Wip, the (1+1)-ES, PS.mutate of 1 to 4 weights, sigma 0.3, H28's flyPen, 160 s, price 0.02,
// 1800 iterations, checkpoints 900 / 1200 / 1500 / 1800, held-out ids 26100-26139, seeds 26011-26014) with ONLY the train set changed: group H72 trains on the 72 ids of H48's 800 (53000-53799) with the lowest `d`, group E72 on the 72 with the highest, `d` being the autopilot's penalised priced
// score at 0.02 on the id (H48's stored autopilot runs), ties by the smaller id first. H32's `longSearch` is called with the train ranges (72 single-id ranges) handed in. A champion per group per checkpoint by held-out value; the eight 1800-iteration networks flown on 200 fresh ids at 0.02
// against c02, q02 and H32's four random-72 networks. The audit's own difficulty (the autopilot's score on the audit ids) splits it into its 50 hardest and 50 easiest ids for part G. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 89200, to: 89399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const POOL = Object.freeze({ from: 53000, to: 53799 }), SET_SIZE = 72, SPLIT = 50, EARLIER_AUDIT_END = 88399;
export const HELD = X32.HELD, MAXK = X30.MAXK, SIGMA = X30.SIGMA, H32_TRAIN = X32.TRAIN;
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY;
export const GROUPS = Object.freeze(["H72", "E72"]), SEEDS = Object.freeze({ H72: [26011, 26012, 26013, 26014], E72: [26011, 26012, 26013, 26014] });
export const S_IDS = Object.freeze(X32.SEEDS.S02.map((s) => "s02_" + s)), H_IDS = Object.freeze(SEEDS.H72.map((s) => "h72_" + s)), E_IDS = Object.freeze(SEEDS.E72.map((s) => "e72_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...H_IDS, ...E_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const need = (group) => { if (!GROUPS.includes(group)) throw new Error(`headToHead69: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`); return group; };
const idOf = (key) => Number(String(key).replace(/^sb-/, ""));
/**
 * The difficulty sets from H48's stored autopilot runs `h48` = { range, dark: { autopilot }, lit: { autopilot } } (one run per id, 800 ids): d per id = the autopilot's penalised priced score at 0.02 (a lost run scoring 0), then the 72 lowest (H72) and the 72 highest (E72),
 * ties by the smaller id first; { d: [{ id, d }] in id order, H72: [ids ascending], E72: [ids ascending] }.
 */
export function setsOf(h48) {
    const n = POOL.to - POOL.from + 1;
    if (!h48 || !h48.range || h48.range.from !== POOL.from || h48.range.to !== POOL.to || !h48.dark || !h48.lit || !Array.isArray(h48.dark.autopilot) || !Array.isArray(h48.lit.autopilot) || h48.dark.autopilot.length !== n || h48.lit.autopilot.length !== n) throw new Error(`headToHead69.setsOf: h48 is H48's stored result, ids ${POOL.from}-${POOL.to} (${n}), the autopilot's dark and lit runs`);
    const runs = X27.penRunsAt({ dark: { autopilot: h48.dark.autopilot }, lit: { autopilot: h48.lit.autopilot } }, "autopilot", PRICE), d = runs.map((r) => ({ id: idOf(r.key), d: r.score }));
    if (!d.every((q, i) => q.id === POOL.from + i && Number.isFinite(q.d))) throw new Error("headToHead69.setsOf: the runs are not the ids in order with finite values");
    const asc = d.slice().sort((a, b) => a.d - b.d || a.id - b.id), desc = d.slice().sort((a, b) => b.d - a.d || a.id - b.id);
    return { d, H72: asc.slice(0, SET_SIZE).map((q) => q.id).sort((a, b) => a - b), E72: desc.slice(0, SET_SIZE).map((q) => q.id).sort((a, b) => a - b) };
}
/** The ids as the one-id ranges X30.netObj takes. */
export const rangesOf = (ids) => ids.map((id) => ({ from: id, to: id }));
/** Reads and validates a state file of a search of `ctx.group` on `ctx.train` (null when there is none): H32's validation, and the state must carry this group's label and train ranges. */
export function loadState(io, file, ctx = {}) {
    const group = need(ctx.group);
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead69.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    const { group: g, train, ...rest } = ctx; X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...rest, group: "S02" });
    if (s.label !== group) throw new Error(`headToHead69.loadState: the state is of group ${J(s.label)}, not ${J(group)}`);
    if (J(s.train) !== J(train)) throw new Error("headToHead69.loadState: the state's train ranges are not this group's");
    return s;
}
/**
 * One RESUMABLE search of `group` (H72 or E72) from `start` on the train ranges `opts.train` (REQUIRED: the group's 72 one-id ranges): X32.longSearch with that train set and the group relabelled; every saved state carries { label: group, train }, and a state handed in must carry them.
 * Returns what X32.longSearch returns with group and { train }.
 */
export function longSearch(seed, group, start, { train = null, save = null, state = null, ...opts } = {}) {
    need(group);
    if (!Array.isArray(train) || train.length === 0) throw new Error("headToHead69.longSearch: the train ranges are required");
    if (state && (state.label !== group || J(state.train) !== J(train))) throw new Error(`headToHead69.longSearch: the state is of group ${J(state.label)} on other train ranges, not ${J(group)} on these`);
    const r = X32.longSearch(seed, "S02", start, { ...opts, train, state, save: save ? (s) => save({ ...s, label: group, train }) : null });
    return { ...r, group, train };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of `group` at a checkpoint: the best held-out penalised value of its four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, group, iter) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) && seeds ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || !CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead69.champion: group ${group} needs one search for each of the seeds ${seeds ? seeds.join(", ") : "(none: no such group)"}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 16 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's four 1800-iteration networks in seed order] }; `fresh` = { H72: [four networks], E72: [four networks] } in seed order. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead69.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead69.armsOf: h27 is { laws: one 4-weight law }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk)) throw new Error("headToHead69.armsOf: s32 is { nets: four 963-weight vectors }");
    for (const g of GROUPS) if (!fresh || !Array.isArray(fresh[g]) || fresh[g].length !== 4 || !fresh[g].every(wOk)) throw new Error(`headToHead69.armsOf: fresh.${g} is four 963-weight vectors`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); H_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.H72[i]); }); E_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.E72[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 16; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, h48 = null, sets = null, earlier = null, startVals = null, startVal32 = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead69.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, h32, h48, sets, earlier, startVals, startVal32, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value at 0.02 on the train ranges handed in (the first parent of every search of that group). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = null } = {}) => { if (!Array.isArray(train) || !train.length) throw new Error("headToHead69.startVal: the train ranges are required"); return X32.startVal(wip, { seconds, flyFn, train }); };
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
/** The arm id of a group's champion at 1800 (h72_<seed> or e72_<seed>). */
export const champArm = (au, group) => (group === "H72" ? "h72_" : "e72_") + champion(au.search, group, LAST).seed;
/** The audit's difficulty split by the autopilot's penalised score on the audit ids: { hard: [the 50 lowest indices], easy: [the 50 highest] } (indices into the audit's runs; ties by the smaller index first). */
export function splitOf(au) {
    const d = penRunsAt(au, "autopilot", PRICE).map((r, i) => ({ i, d: r.score })), asc = d.slice().sort((a, b) => a.d - b.d || a.i - b.i), desc = d.slice().sort((a, b) => b.d - a.d || a.i - b.i);
    return { hard: asc.slice(0, SPLIT).map((q) => q.i).sort((a, b) => a - b), easy: desc.slice(0, SPLIT).map((q) => q.i).sort((a, b) => a - b) };
}
/** An arm's mean paired difference from c02 at 0.02 over the audit's hardest and easiest ids: { hard, easy }. */
export function marginSplit(au, a) {
    const s = splitOf(au), x = penRunsAt(au, a, PRICE), y = penRunsAt(au, "c02", PRICE), m = (idx) => avg(idx.map((i) => x[i].score - y[i].score));
    return { hard: m(s.hard), easy: m(s.easy) };
}
/** The twin counts: each h72_<seed> against e72_<seed> at the audit mean: ahead = the hard-set network's audit mean is higher. */
export const twinsAhead = (au) => SEEDS.H72.filter((s) => penMean(au, "h72_" + s) > penMean(au, "e72_" + s)).length;
/** The mean held-out value at 1800 of a group's four seeds (H32's for RANDOM, from its stored search). */
export const heldMean = (rows, group) => avg(SEEDS[group].map((s) => cpOf(rows.find((r) => r.seed === s && r.group === group), LAST).heldScore));
export const heldMean32 = (h32) => avg(X32.SEEDS.S02.map((s) => cpOf(h32.search.find((r) => r.seed === s), 1800).heldScore));
const notBehind = (au, ids) => ids.filter((x) => pen(au, x, "c02").reading !== "WORSE").length;
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const a = champArm(au, "H72"), b = champArm(au, "E72"), rd = (x, y) => word(pen(au, x, y).reading), lost = [...H_IDS, ...E_IDS].filter((q) => lostBoth(au, q) > 0).map((q) => `${q} ${lostBoth(au, q)}`), f = (x) => x.toFixed(4), sg = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), ma = marginSplit(au, a), mb = marginSplit(au, b);
    return [`HARD-SET CHAMPION ${rd(a, "c02")} C02, EASY-SET CHAMPION ${rd(b, "c02")} C02`, `HARD-SET CHAMPION ${rd(a, "s02_26011")} H32'S CHAMPION, EASY-SET CHAMPION ${rd(b, "s02_26011")} H32'S CHAMPION`, `HARD-SET CHAMPION ${rd(a, b)} EASY-SET CHAMPION`,
        `NETWORKS NOT BEHIND C02: HARD ${notBehind(au, H_IDS)} OF 4, EASY ${notBehind(au, E_IDS)} OF 4, RANDOM (H32'S) ${notBehind(au, S_IDS)} OF 4`, `LOST SUBS IN THE NEW NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `MEAN HELD-OUT VALUE AT 1800: HARD ${f(heldMean(au.search, "H72"))}, EASY ${f(heldMean(au.search, "E72"))}, RANDOM ${f(heldMean32(au.h32))}`,
        `MARGIN OVER C02 ON THE AUDIT'S ${SPLIT} HARDEST IDS / ${SPLIT} EASIEST: HARD-SET CHAMPION ${sg(ma.hard)} / ${sg(ma.easy)}, EASY-SET CHAMPION ${sg(mb.hard)} / ${sg(mb.easy)}`, `HARD-SET NETWORKS AHEAD OF THEIR EASY-SET TWINS: ${twinsAhead(au)} OF 4`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from wip, group by group: { H72: [{ id, l1Wip }], E72: [...] }. */
export const distances = (au) => ({ H72: H_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.H72[i], au.wip) })), E72: E_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.E72[i], au.wip) })) });
/** The generalisation gap (train minus held-out value) of each group's champion at each checkpoint, and of every seed at 1800 (NOT comparable across groups: the train sets differ in difficulty). */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore, one = (grp) => ({ champ: CHECKPOINTS.map((it) => g(champion(au.search, grp, it))), seeds: SEEDS[grp].map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === grp), LAST))) });
    return { H72: one("H72"), E72: one("E72") };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...S_IDS, ...H_IDS, ...E_IDS], priceRow = (x, f) => `${x} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, x, p))).join(" / ")}`, a = champArm(au, "H72"), b = champArm(au, "E72");
    const arm = (x) => `${x} ${scoreMean(au, x, "dark").toFixed(4)} / ${scoreMean(au, x, "lit").toFixed(4)}, ${kwOf(au, x).toFixed(2)} kW, thrust ${meanThrust(au, x).toFixed(2)}`;
    const searchOf = (g) => au.search.filter((r) => r.group === g).map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = GROUPS.map((g) => `${g} ${CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, g, it).seed} held ${champion(au.search, g, it).heldScore.toFixed(4)}`).join(", ")}`).join("; ");
    const gp = gapsOf(au), gapText = (g) => `${g} champion ${gp[g].champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800, each seed at 1800 ${SEEDS[g].map((s, i) => `${s} ${gp[g].seeds[i].toFixed(4)}`).join(", ")}`;
    const lostIds = ARM_IDS.slice(1).flatMap((x) => ["dark", "lit"].flatMap((q) => au[q][x].filter((r) => r.bad).map((r) => `${x} ${q} ${r.key}`)));
    const pairs = [...["c02", "q02", "s02_26011", b].map((x) => `${a} minus ${x} at 0.02 ${fmt(pen(au, a, x))}`), ...["c02", "q02", "s02_26011"].map((x) => `${b} minus ${x} at 0.02 ${fmt(pen(au, b, x))}`), ...SEEDS.H72.map((s) => `h72_${s} minus e72_${s} at 0.02 ${fmt(pen(au, "h72_" + s, "e72_" + s))}`)];
    const rank = [...S_IDS, ...H_IDS, ...E_IDS].map((x) => [x, penMean(au, x)]).sort((p, q) => q[1] - p[1]).map(([x, v]) => `${x} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au), dtext = [...dist.H72, ...dist.E72].map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip`).join("; ");
    const dv = au.sets.d.map((q) => q.d), setMean = (ids) => avg(ids.map((id) => au.sets.d[id - POOL.from].d)), cut = (ids) => ids.map((id) => au.sets.d[id - POOL.from].d);
    const sp = splitOf(au), splitMean = (x, idx) => avg(idx.map((i) => penRunsAt(au, x, PRICE)[i].score));
    return [
        `SEARCH H72 (the 72 hardest ids; start value, then train / held-out penalised value and accepted count at each checkpoint): ${searchOf("H72")}`,
        `SEARCH E72 (the 72 easiest ids; the same): ${searchOf("E72")}`,
        `DIFFICULTY SETS (d = the autopilot's penalised score at 0.02 on H48's ${POOL.to - POOL.from + 1} ids; mean d of all ${avg(dv).toFixed(4)}): H72 ids ${au.sets.H72[0]}-${au.sets.H72[SET_SIZE - 1]}, d from ${Math.min(...cut(au.sets.H72)).toFixed(4)} to ${Math.max(...cut(au.sets.H72)).toFixed(4)}, mean ${setMean(au.sets.H72).toFixed(4)}; E72 ids ${au.sets.E72[0]}-${au.sets.E72[SET_SIZE - 1]}, d from ${Math.min(...cut(au.sets.E72)).toFixed(4)} to ${Math.max(...cut(au.sets.E72)).toFixed(4)}, mean ${setMean(au.sets.E72).toFixed(4)}`,
        `RESUMES: ${au.search.map((r) => `${r.group} ${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champions at 1800 are ${a} and ${b} (the best hard-set on the audit: ${[...H_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]}, the best easy-set: ${[...E_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]})`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((x) => `${x} ${lostBoth(au, x)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((x) => `${x} ${f2(extraPower(au, x))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((x) => priceRow(x, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${pairs.join("; ")}`,
        `AUDIT BY DIFFICULTY (mean penalised priced score at 0.02 on the audit's ${SPLIT} hardest / ${SPLIT} easiest ids by the autopilot's own score): ${shown.map((x) => `${x} ${splitMean(x, sp.hard).toFixed(4)} / ${splitMean(x, sp.easy).toFixed(4)}`).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dtext}; generalisation gaps (train minus held-out; NOT comparable across the groups) ${gapText("H72")}; ${gapText("E72")}; audit means in rank order (penalised priced score at 0.02) ${rank}; unpenalised priced gain ${shown.slice(1).map((x) => priceRow(x, unpenGainAt)).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((q) => ARM_IDS.map((x) => [q, x]));
    const sizes = cells.every(([q, x]) => au[q][x] && au[q][x].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const aligned = cells.every(([q, x]) => au[q][x] && au[q][x].every((r, i) => au[q].autopilot[i] && r.key === au[q].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids are the same in every arm and condition: ${aligned}` });
    const inside = cells.every(([q, x]) => au[q][x] && au[q][x].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([q, x]) => au[q][x] && au[q][x].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const ident = ["dark", "lit"].every((q) => au[q].law0 && au[q].law0.every((r, i) => au[q].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[q].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 8 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && GROUPS.every((g) => Array.isArray(au.fresh[g]) && au.fresh[g].length === 4 && SEEDS[g].every((q, i) => J(Array.from(au.fresh[g][i])) === J(cpOf(s.find((r) => r.group === g && r.seed === q), LAST).weights)));
    rows.push({ name: "8 SEARCHES, EACH SEED OF EACH GROUP ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `8 network searches (the four seeds of H72 and of E72), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 8 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const dsOk = (() => { try {
        const ref = setsOf(au.h48), st = au.sets;
        const same = !!st && J(st.H72) === J(ref.H72) && J(st.E72) === J(ref.E72) && st.d.length === ref.d.length && st.d.every((q, i) => q.id === ref.d[i].id && Math.abs(q.d - ref.d[i].d) < 1e-12);
        const sizes72 = ref.H72.length === SET_SIZE && ref.E72.length === SET_SIZE && new Set(ref.H72).size === SET_SIZE && new Set(ref.E72).size === SET_SIZE && ref.H72.every((id) => !ref.E72.includes(id));
        const apart = [...ref.H72, ...ref.E72].every((id) => H32_TRAIN.every((r) => id < r.from || id > r.to) && (id < HELD.from || id > HELD.to));
        const used = Array.isArray(s) && s.every((r) => J(r.train) === J(rangesOf(r.group === "H72" ? ref.H72 : ref.E72)));
        return same && sizes72 && apart && used;
    } catch (e) { return false; } })();
    rows.push({ name: "THE DIFFICULTY SETS ARE AS REGISTERED", ok: dsOk, text: `recomputed here from H48's stored autopilot runs, d is the penalised priced score at 0.02, H72 is the 72 lowest and E72 the 72 highest (ties by the smaller id), 72 distinct ids each, disjoint from each other, from H32's 72 train ids and the held-out ids, and every search's train ranges are its group's: ${dsOk}` });
    const sv = au.startVals, first = !!counted && !!sv && GROUPS.every((g) => Number.isFinite(sv[g])) && s.every((r) => r.startTrain === sv[r.group]);
    rows.push({ name: "THE FIRST PARENT IS WIP ON EACH GROUP'S 72 IDS", ok: first, text: `every search's first parent has exactly wip's penalised value at 0.02 on its group's own 72 ids (computed in this round): ${first}` });
    const bestAt = (g) => { try { const c = champion(s, g, LAST); return s.every((r) => r.group !== g || r.checkpoints.every((k) => k.iter !== LAST || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.group === g && r.seed === c.seed), LAST).weights); } catch (e) { return false; } };
    rows.push({ name: "EACH GROUP'S CHAMPION IS THE BEST HELD-OUT PENALISED OF ITS FOUR AT 1800", ok: !!(counted && bestAt("H72") && bestAt("E72")), text: `each group's champion at 1800 has the largest held-out penalised value of its four seeds (the first of a tie in seed order): ${!!(counted && bestAt("H72") && bestAt("E72"))}` });
    const h = au.h32, sn = au.s32, nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && J(Array.from(sn.nets[0])) === J(Array.from(X32.champion(h.search, 1800).weights)) && X32.champion(h.search, 1800).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE S02 ARMS ARE H32'S 1800-ITERATION NETWORKS", ok: !!nets32, text: `s02_26011 to s02_26014 are the weights at 1800 of H32's stored search (s02_26011 its champion by H32's rule): ${!!nets32}` });
    const o = au.original, k = au.h27, regc = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint and q02 is the champion law of H27's stored search: ${!!regc}` });
    const seedsOk = J(SEEDS.H72) === J(X32.SEEDS.S02) && J(SEEDS.E72) === J(X32.SEEDS.S02) && Array.isArray(au.earlier) && SEEDS.H72.every((q) => au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.H72.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds of each group are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const sets = au.sets, trainIds = sets ? [...sets.H72, ...sets.E72] : [], dj = !!sets && trainIds.every((id) => id < au.range.from || id > au.range.to) && disjoint(HELD, au.range) && H32_TRAIN.every((q) => disjoint(q, au.range)) && au.range.from > EARLIER_AUDIT_END;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap either group's 72 train ids, H32's train ids (26000-26023 and 30000-30047) or the held-out ids 26100-26139, and start after H68's audit (${EARLIER_AUDIT_END}): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    const stored = (() => { try { const h8 = au.h48; return !!h8 && h8.range.from === POOL.from && h8.range.to === POOL.to && ["dark", "lit"].every((q) => Array.isArray(h8[q].autopilot) && h8[q].autopilot.length === POOL.to - POOL.from + 1 && h8[q].autopilot.every((r, i) => r.key === "sb-" + (POOL.from + i) && r.score > 0 && r.score < 1 && Number.isFinite(r.watts))) && Array.isArray(h.search) && X32.SEEDS.S02.every((q) => !!cpOf(h.search.find((r) => r.seed === q), 1800)); } catch (e) { return false; } })();
    rows.push({ name: "H48'S AND H32'S STORED RESULTS ARE IN THE CHECKOUT", ok: !!stored, text: `H48's stored autopilot runs cover ids ${POOL.from}-${POOL.to} in both conditions, in id order, scores inside (0, 1) and powers finite, and H32's stored search gives the four 1800-iteration networks: ${!!stored}` });
    const split = (() => { try { const sp = splitOf(au); return sp.hard.length === SPLIT && sp.easy.length === SPLIT && new Set(sp.hard).size === SPLIT && new Set(sp.easy).size === SPLIT && sp.hard.every((i) => !sp.easy.includes(i)) && n >= 2 * SPLIT; } catch (e) { return false; } })();
    rows.push({ name: "THE AUDIT'S DIFFICULTY SPLIT IS 50 AND 50 DISTINCT IDS", ok: split, text: `the audit's 50 hardest and 50 easiest ids by the autopilot's own score are 50 distinct ids each and do not overlap: ${split}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H69: a different train set (group H72 trains on the 72 hardest ids of H48's 800 and group E72 on the 72 easiest, by the autopilot's penalised score; H32's search otherwise: sigma 0.3, seeds 26011-26014, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const x of ARM_IDS) R.push(`  ${x.padEnd(10)} ${scoreMean(au, x, "dark").toFixed(4)} / ${scoreMean(au, x, "lit").toFixed(4)}   ${kwOf(au, x).toFixed(2)}   ${kwOf(au, x, "lit").toFixed(2)}   ${lostBoth(au, x)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.005 / 0.02 / 0.04:`);
    for (const x of ARM_IDS.slice(1)) R.push(`  ${x.padEnd(10)} ${f4(gainOf(au, x))} / ${f4(gainOf(au, x, "lit"))}  ${f3(extraKw(au, x))} / ${f3(extraKw(au, x, "lit"))}  ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(au, x, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
