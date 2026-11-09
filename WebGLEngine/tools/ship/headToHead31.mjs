// WebGLEngine/tools/ship/headToHead31.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead31Cmd.mjs; the gate is tools/ship/headToHead31-selfcheck.mjs)
//
// ROUND H31 of brain/HEAD_TO_HEAD.md (registered before this file existed): THE LONGER SEARCH ON 72 IDS, AT 0.04. H30's checkpointed network search (963 weights from network-Wip, (1+1)-ES, the penalised priced objective on the 72 train ids,
// H27's seeds) run for 1800 iterations instead of 900 at price 0.04 only (group R04, four seeds), with checkpoints at 900, 1200, 1500 and 1800. The first 900 iterations ARE H30's P04 search of the seed. A champion per checkpoint by held-out
// penalised value; audited on 200 fresh ids with c02, the law of the price, H27's 600-iteration, H29's 2400-iteration and H30's 900-iteration champions and the four new ones. Reads nothing from disk (the command hands in the weights and the stored results).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X28 from "./headToHead28.mjs";
import * as X29 from "./headToHead29.mjs";
import * as X30 from "./headToHead30.mjs";

export const IDS = Object.freeze({ from: 31200, to: 31399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.04;
export const TRAIN = X30.TRAIN, HELD = X30.HELD;
export const GROUPS = Object.freeze(["R04"]), SEEDS = Object.freeze({ R04: [26021, 26022, 26023, 26024] });
export const CHECKPOINTS = Object.freeze([900, 1200, 1500, 1800]), ITERS = 1800;
export const R_IDS = Object.freeze(["r04_900", "r04_1200", "r04_1500", "r04_1800"]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q04", "m04", "x04_2400", "y04_900", ...R_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X28.flyPen;
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
/**
 * One longer network search of the group from `start`: H30's search exactly (its loop, its generator stream, its 72-id objective) under the price 0.04, for 1800 iterations with checkpoints at 900 / 1200 / 1500 / 1800 by default.
 * Returns { seed, group: "R04", startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }] }.
 */
export function longSearch(seed, group, start, opts = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead31: the group must be one of ${GROUPS.join(", ")}, got ${JSON.stringify(group)}`);
    return { ...X30.longSearch(seed, "P04", start, { iters: ITERS, checkpoints: CHECKPOINTS, ...opts }), group };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the search with the best held-out penalised value among the four at that checkpoint, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.R04, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "R04") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead31.champion: group R04 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
/** The 11 arms as { id: arm }: `h27` = { laws: [q04], nets: [m04] }; `h29` = { nets: [x04_2400] }; `h30` = { nets: [y04_900] }; `fresh` = { nets: [r04_900, r04_1200, r04_1500, r04_1800] }. */
export function armsOf(wip, h27, h29, h30, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead31.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    const one = (x) => !!x && Array.isArray(x.nets) && x.nets.length === 1 && x.nets.every(wOk);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite)) || !one(h27)) throw new Error("headToHead31.armsOf: h27 is { laws: one 4-weight law, nets: one 963-weight vector }");
    if (!one(h29) || !one(h30)) throw new Error("headToHead31.armsOf: h29 and h30 are { nets: one 963-weight vector }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead31.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q04: H16.lawArm("q04", h27.laws[0]), m04: netArm("m04", h27.nets[0]), x04_2400: netArm("x04_2400", h29.nets[0]), y04_900: netArm("y04_900", h30.nets[0]) };
    R_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 11; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, h29, h30, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, original29 = null, original30 = null, fixture = null, startVal = null } = {}) {
    const all = armsOf(wip, h27, h29, h30, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead31.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, h29, h30, fresh, search, original, original29, original30, fixture, startVal, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the 72 train ids at 0.04 (the first scored candidate of every search). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => X30.netObj(wip, train, PRICE, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
// ---- the readings
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
/** Whether the group champion's held-out value is strictly larger at 1200 than at 900, at 1500 than at 1200 and at 1800 than at 1500. */
export const rises = (search) => CHECKPOINTS.slice(1).every((it, k) => champion(search, it).heldScore > champion(search, CHECKPOINTS[k]).heldScore);
/** The registered verdict, seven parts joined by "; ", every reading at 0.04. */
export function verdictOf(au) {
    const lost = R_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), rd = (b) => word(penPair(au, "r04_1800", b, PRICE).reading);
    return [`THE 1800 CHAMPION ${rd("y04_900")} H30'S 900 CHAMPION`, `THE 1800 CHAMPION ${rd("m04")} H27'S 600 CHAMPION`, `THE 1800 CHAMPION ${rd("x04_2400")} H29'S 2400 CHAMPION`, `THE 1800 CHAMPION ${rd("q04")} THE LAW OF THE PRICE`, `THE 1800 CHAMPION ${rd("c02")} C02`,
        `LOST SUBS IN THE R04 CHAMPIONS: ${lost.length ? lost.join(", ") : "NONE"}`, `HELD-OUT VALUE RISES AT EVERY CHECKPOINT: ${rises(au.search) ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new champion: its L1 distance from wip and from H30's 900-iteration champion. */
export const distances = (au) => R_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1Y: l1(au.fresh.nets[i], au.h30.nets[0]) }));
/** The generalisation gap (train value minus held-out value) of the group champion at each checkpoint, and of H29's L04 champion at 2400 and H30's P04 champion at 900 (from their stored searches): { r04: [gap at 900, 1200, 1500, 1800], h29, h30 }. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore;
    return { r04: CHECKPOINTS.map((it) => g(champion(au.search, it))), h29: g(X29.champion(au.original29.search, "L04", 2400)), h30: g(X30.champion(au.original30.search, "P04", 900)) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q04", "m04", "x04_2400", "y04_900", ...R_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`;
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "R04").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `R04 ${gp.r04.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800 (H30's 900 champion ${gp.h30.toFixed(4)}, H29's 2400 champion ${gp.h29.toFixed(4)})`;
    const pairs = [...["y04_900", "m04", "x04_2400", "q04", "c02"].map((b) => `r04_1800 minus ${b} at 0.04 ${fmt(penPair(au, "r04_1800", b, PRICE))}`), ...R_IDS.map((a) => `${a} minus c02 at 0.04 ${fmt(penPair(au, a, "c02", PRICE))}`)];
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Y.toFixed(2)} from H30's 900-iteration champion`).join("; ");
    return [
        `SEARCH R04 (start value on the 72 train ids, then train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}`,
        `GENERALISATION GAP (train minus held-out value of the group champion): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score at 0.04): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, J = JSON.stringify, near = (a, b) => Math.abs(a - b) < 1e-9;
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
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.R04.every((q) => s.filter((r) => r.group === "R04" && r.seed === q).length === 1) && s.every((r) => r.group === "R04" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: counted, text: `4 network searches (the four seeds of R04), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 4 new champions: ${counted}` });
    const o30 = au.original30, o900 = counted && !!o30 && Array.isArray(o30.search) && s.every((r) => { const q = o30.search.find((x) => x.seed === r.seed && x.group === "P04"), k = cpOf(r, 900), q9 = q && cpOf(q, 900); return !!q9 && J(Array.from(q9.weights)) === J(k.weights) && q9.trainScore === k.trainScore && q9.heldScore === k.heldScore && q9.accepted === k.accepted; });
    rows.push({ name: "THE 900-ITERATION CHECKPOINT IS H30'S SEARCH", ok: !!o900, text: `the weights, train and held-out values and accepted count at iteration 900 of every search equal H30's stored P04 search of the same seed to the last digit: ${!!o900}` });
    const first = counted && Number.isFinite(au.startVal) && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS WIP ON THE 72 IDS", ok: first, text: `every search's first scored candidate has exactly wip's penalised value on the 72 train ids at 0.04 (computed in this round): ${first}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48 && ids(TRAIN[0]) + ids(TRAIN[1]) === 72;
    const dj = trainOk && [...TRAIN, HELD].every((a, i, all) => disjoint(a, au.range) && all.every((b, j) => i === j || disjoint(a, b))) && disjoint(au.range, { from: 22200, to: 30399 });
    rows.push({ name: "ID SETS DISJOINT, THE TRAIN SET BEING THE 72 IDS", ok: dj, text: `the train ids are H27's 26000-26023 and 30000-30047 (72 in all), and they, the held-out ids and the audit ids do not overlap, the audit ids being past every earlier audit (22200-30399): ${dj}` });
    const bestAt = (it, w) => { try { return J(Array.from(champion(s, it).weights)) === J(Array.from(w || [])); } catch (e) { return false; } };
    const champs = counted && !!au.fresh && Array.isArray(au.fresh.nets) && CHECKPOINTS.every((it, k) => bestAt(it, au.fresh.nets[k]));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT PENALISED OF THE GROUP AT ITS CHECKPOINT", ok: !!champs, text: `the four new champions are the best held-out penalised of the group at 900, 1200, 1500 and 1800: ${!!champs}` });
    const o = au.original, o9 = au.original29, h = au.h27, h9 = au.h29, h0 = au.h30;
    const reg = !!o && Array.isArray(o.search) && !!o9 && Array.isArray(o9.search) && !!o30 && Array.isArray(o30.search) && !!h && Array.isArray(h.laws) && h.laws.length === 1 && Array.isArray(h.nets) && h.nets.length === 1 && !!h9 && Array.isArray(h9.nets) && h9.nets.length === 1 && !!h0 && Array.isArray(h0.nets) && h0.nets.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q04").law) === J(h.laws[0]) && J(Array.from(X27.netChampion(o.search, "M04").weights)) === J(Array.from(h.nets[0])) && J(Array.from(X29.champion(o9.search, "L04", 2400).weights)) === J(Array.from(h9.nets[0])) && J(Array.from(X30.champion(o30.search, "P04", 900).weights)) === J(Array.from(h0.nets[0])); } catch (e) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND THE STORED CHAMPIONS ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q04, m04, x04_2400 and y04_900 are the champions of H27's, H29's and H30's stored searches by their rounds' rules: ${!!reg}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H31: the longer search on 72 ids at 0.04 (1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.005 / 0.02 / 0.04:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(au, a, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
