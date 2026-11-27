// WebGLEngine/tools/ship/headToHead30.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead30Cmd.mjs; the gate is tools/ship/headToHead30-selfcheck.mjs)
//
// ROUND H30 of brain/HEAD_TO_HEAD.md (registered before this file existed): THE LARGER TRAIN SET. H29's checkpointed network search (963 weights from network-Wip, (1+1)-ES, the penalised priced objective, H27's seeds) with ONE change:
// the TRAIN ids are H27's 24 (26000-26023) plus 48 new ones (30000-30047), 72 in all, and the search runs 900 iterations with checkpoints at 300, 600 and 900 (groups P02 at 0.02 and P04 at 0.04, four seeds each). The held-out ids are H27's, H28's and H29's
// (26100-26139). A champion per checkpoint by held-out penalised value; audited on 200 fresh ids with c02, H27's q and m champions, H29's 2400 champions and the six new ones. Reads nothing from disk (the command hands in the weights and the stored results).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X28 from "./headToHead28.mjs";
import * as X29 from "./headToHead29.mjs";

export const IDS = Object.freeze({ from: 30200, to: 30399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02;
export const TRAIN_OLD = X27.NET_TRAIN, TRAIN_NEW = Object.freeze({ from: 30000, to: 30047 }), TRAIN = Object.freeze([TRAIN_OLD, TRAIN_NEW]), HELD = X27.NET_HELD, SIGMA = X27.NET_SIGMA, MAXK = X27.NET_MAXK;
export const GROUPS = Object.freeze(["P02", "P04"]), PRICES = Object.freeze([0.02, 0.04]);
export const SEEDS = Object.freeze({ P02: [26011, 26012, 26013, 26014], P04: [26021, 26022, 26023, 26024] });
export const LAMBDAS = Object.freeze({ P02: 0.02, P04: 0.04 });
export const CHECKPOINTS = Object.freeze([300, 600, 900]), ITERS = 900;
export const Q_IDS = Object.freeze(["q02", "q04"]), M_IDS = Object.freeze(["m02", "m04"]), X_IDS = Object.freeze(["x02_2400", "x04_2400"]);
export const Y_IDS = Object.freeze(["y02_300", "y02_600", "y02_900", "y04_300", "y04_600", "y04_900"]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", ...Q_IDS, ...M_IDS, ...X_IDS, ...Y_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X28.flyPen;
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
/**
 * The PENALISED priced objective of a network on a LIST of id ranges at a price: the means of the penalised scores and of the powers are taken over ALL the ids of all the ranges (dark and lit pooled apiece), so that with one range it IS H27's
 * penObjective to the last digit. Flown range by range, dark then lit.
 */
export function netObj(w, ranges, price, seconds = SECONDS, flyFn = flyPen) {
    if (!(price >= 0)) throw new Error(`headToHead30.netObj: the price must be a number of 0 or more, got ${JSON.stringify(price)}`);
    if (!Array.isArray(ranges) || !ranges.length) throw new Error("headToHead30.netObj: the ranges must be a non-empty list");
    const arm = netArm("net", w), d = [], l = [];
    for (const r of ranges) { d.push(...flyFn(arm, r, seconds, "dropout")); l.push(...flyFn(arm, r, seconds, null)); }
    return 0.5 * (avg(d.map(X27.penScore)) + avg(l.map(X27.penScore))) - price * 0.5 * (avg(d.map((r) => r.watts)) + avg(l.map((r) => r.watts))) / 1000;
}
const counting = (flyFn) => { const c = { lost: 0 }; const f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }; return { f, c }; };
/**
 * One checkpointed network search of a group from `start` on the train RANGES (default the 72 ids): H27's loop and generator stream exactly, recording at every iteration in `checkpoints` the weights, the train value, the accepted count and the held-out
 * penalised value. Returns { seed, group, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }] }.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead30: the group must be one of ${GROUPS.join(", ")}, got ${JSON.stringify(group)}`);
    if (!wOk(start)) throw new Error(`headToHead30.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    const price = LAMBDAS[group], rng = PS.mulberry(seed), { f, c } = counting(flyFn);
    let w = Float32Array.from(start), best = netObj(w, train, price, seconds, f), accepted = 0;
    const startTrain = best, cps = [];
    for (let it = 0; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = netObj(cand, train, price, seconds, f);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        if (checkpoints.includes(it + 1)) cps.push({ iter: it + 1, weights: Array.from(w), trainScore: best, heldScore: netObj(w, [held], price, seconds, f), accepted });
    }
    return { seed, group, startTrain, lostFlights: c.lost, iters, checkpoints: cps };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of a group at a checkpoint: the search with the best held-out penalised value among the four at that checkpoint, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, group, iter) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || !CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead30.champion: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
/** The 15 arms as { id: arm }: `h27` = { laws: [q02, q04], nets: [m02, m04] }; `h29` = { nets: [x02_2400, x04_2400] }; `fresh` = { nets: [y02_300, y02_600, y02_900, y04_300, y04_600, y04_900] }. */
export function armsOf(wip, h27, h29, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead30.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 2 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite)) || !Array.isArray(h27.nets) || h27.nets.length !== 2 || !h27.nets.every(wOk)) throw new Error("headToHead30.armsOf: h27 is { laws: two 4-weight laws, nets: two 963-weight vectors }");
    if (!h29 || !Array.isArray(h29.nets) || h29.nets.length !== 2 || !h29.nets.every(wOk) || !fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 6 || !fresh.nets.every(wOk)) throw new Error("headToHead30.armsOf: h29 is { nets: two 963-weight vectors } and fresh is { nets: six 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02) };
    Q_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, h27.laws[i]); }); M_IDS.forEach((id, i) => { out[id] = netArm(id, h27.nets[i]); }); X_IDS.forEach((id, i) => { out[id] = netArm(id, h29.nets[i]); }); Y_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 15; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, h29, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, original29 = null, fixture = null, startVals = null } = {}) {
    const all = armsOf(wip, h27, h29, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead30.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, h29, fresh, search, original, original29, fixture, startVals, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the train ranges (the 72 ids) at each price (the first scored candidate of every search): { 0.02: v, 0.04: v }. */
export function startVals(wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) {
    const out = {}; for (const p of PRICES) out[p] = netObj(wip, train, p, seconds, flyFn); return out;
}
export const fixtureOf = X27.fixtureOf;
// ---- the readings
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penRunsAt = X27.penRunsAt, penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const Y900 = ["y02_900", "y04_900"];
/** The prices at which the group champion's held-out value is strictly larger at 600 than at 300 and at 900 than at 600. */
export const risesAt = (search) => GROUPS.filter((g) => CHECKPOINTS.slice(1).every((it, k) => champion(search, g, it).heldScore > champion(search, g, CHECKPOINTS[k]).heldScore)).map((g) => PRICES[GROUPS.indexOf(g)]);
/** The registered verdict, ten parts joined by "; ". */
export function verdictOf(au) {
    const lost = Y_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), rise = risesAt(au.search);
    return [...PRICES.map((p, i) => `AT ${p} THE 900 CHAMPION ${word(penPair(au, Y900[i], M_IDS[i], p).reading)} H27'S 600 CHAMPION`),
        ...PRICES.map((p, i) => `AT ${p} THE 900 CHAMPION ${word(penPair(au, Y900[i], X_IDS[i], p).reading)} H29'S 2400 CHAMPION`),
        ...PRICES.map((p, i) => `AT ${p} THE 900 CHAMPION ${word(penPair(au, Y900[i], Q_IDS[i], p).reading)} THE LAW OF THE PRICE`),
        ...PRICES.map((p, i) => `AT ${p} THE 900 CHAMPION ${word(penPair(au, Y900[i], "c02", p).reading)} C02`),
        `LOST SUBS IN THE LARGER-SET CHAMPIONS: ${lost.length ? lost.join(", ") : "NONE"}`, `HELD-OUT VALUE RISES AT EVERY CHECKPOINT AT ${rise.length ? rise.join(", ") : "NONE"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, g) => (au.search || []).filter((r) => r.group === g);
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new champion: its L1 distance from wip and from H27's 600-iteration champion of its group. */
export function distances(au) {
    return Y_IDS.map((id, i) => { const w = au.fresh.nets[i]; return { id, l1Wip: l1(w, au.wip), l1M: l1(w, au.h27.nets[i < 3 ? 0 : 1]) }; });
}
/** The generalisation gap (train value minus held-out value) of the group champion at each checkpoint, and of H29's 2400 champion of the group (from its stored searches): { P02: [gap at 300, 600, 900], P04: [...], h29: [gap02, gap04] }. */
export function gapsOf(au) {
    const out = {}; for (const g of GROUPS) out[g] = CHECKPOINTS.map((it) => { const c = champion(au.search, g, it); return c.trainScore - c.heldScore; });
    out.h29 = ["L02", "L04"].map((g) => { const c = X29.champion(au.original29.search, g, 2400); return c.trainScore - c.heldScore; });
    return out;
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", ...Q_IDS, ...M_IDS, ...X_IDS, ...Y_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`;
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = GROUPS.map((g) => `${g}: ${rowsOf(au, g).map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ")}`).join("; ");
    const champs = GROUPS.map((g) => `${g} ${CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, g, it).seed} held ${champion(au.search, g, it).heldScore.toFixed(4)}`).join(", ")}`).join("; ");
    const gp = gapsOf(au), gaps = `P02 ${gp.P02.map((x) => x.toFixed(4)).join(" / ")} at 300 / 600 / 900 (H29's 2400 champion ${gp.h29[0].toFixed(4)}); P04 ${gp.P04.map((x) => x.toFixed(4)).join(" / ")} (H29's ${gp.h29[1].toFixed(4)})`;
    const pairs = [...PRICES.map((p, i) => `${Y900[i]} minus ${M_IDS[i]} at ${p} ${fmt(penPair(au, Y900[i], M_IDS[i], p))}`), ...PRICES.map((p, i) => `${Y900[i]} minus ${X_IDS[i]} at ${p} ${fmt(penPair(au, Y900[i], X_IDS[i], p))}`),
        ...PRICES.map((p, i) => `${Y900[i]} minus ${Q_IDS[i]} at ${p} ${fmt(penPair(au, Y900[i], Q_IDS[i], p))}`), ...PRICES.map((p, i) => `${Y900[i]} minus c02 at ${p} ${fmt(penPair(au, Y900[i], "c02", p))}`),
        ...Y_IDS.map((a, i) => `${a} minus c02 at ${PRICES[i < 3 ? 0 : 1]} ${fmt(penPair(au, a, "c02", PRICES[i < 3 ? 0 : 1]))}`)];
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1M.toFixed(2)} from H27's 600-iteration champion`).join("; ");
    return [
        `SEARCH (start value on the 72 train ids, then train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}`,
        `GENERALISATION GAP (train minus held-out value of the group champion): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score; the last six each at its own price): ${pairs.join("; ")}`,
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
    const counted = Array.isArray(s) && s.length === 8 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => GROUPS.includes(r.group) && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 6 && au.fresh.nets.every(wOk) && wOk(au.wip);
    rows.push({ name: "8 SEARCHES, EACH SEED ONCE, EACH WITH THREE CHECKPOINTS OF 963 FINITE WEIGHTS", ok: counted, text: `8 network searches (four seeds in each of two groups), each with checkpoints at 300, 600 and 900 of 963 finite weights, and the 6 new champions: ${counted}` });
    const ids = (r) => r.to - r.from + 1, tr = TRAIN, trainOk = tr.length === 2 && J(tr[0]) === J(X27.NET_TRAIN) && ids(tr[0]) === 24 && ids(tr[1]) === 48 && ids(tr[0]) + ids(tr[1]) === 72 && disjoint(tr[0], tr[1]);
    rows.push({ name: "THE TRAIN SET IS 72 IDS, H27'S 24 AND 48 NEW ONES", ok: trainOk, text: `the train ids are H27's 26000-26023 and the new 30000-30047, 72 in all, with no id twice: ${trainOk}` });
    const sv = au.startVals, first = counted && !!sv && s.every((r) => r.startTrain === sv[LAMBDAS[r.group]]);
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS WIP", ok: first, text: `every search's first scored candidate has exactly wip's penalised value on the 72 train ids at the group's price (computed in this round): ${first}` });
    const dj = [...tr, HELD].every((a, i, all) => disjoint(a, au.range) && all.every((b, j) => i === j || disjoint(a, b))) && disjoint(au.range, { from: 22200, to: 29399 });
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train (both ranges), held-out and audit ids do not overlap, and the audit ids are past every earlier audit (22200-29399): ${dj}` });
    const bestAt = (g, it, w) => { try { return J(Array.from(champion(s, g, it).weights)) === J(Array.from(w || [])); } catch (e) { return false; } };
    const champs = counted && !!au.fresh && Array.isArray(au.fresh.nets) && GROUPS.every((g, gi) => CHECKPOINTS.every((it, k) => bestAt(g, it, au.fresh.nets[gi * 3 + k])));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT PENALISED OF ITS GROUP AT ITS CHECKPOINT", ok: !!champs, text: `the six new champions are the best held-out penalised of their group at 300, 600 and 900: ${!!champs}` });
    const o = au.original, h = au.h27, o9 = au.original29, h9 = au.h29;
    const reg = !!o && Array.isArray(o.search) && !!h && Array.isArray(h.laws) && h.laws.length === 2 && Array.isArray(h.nets) && h.nets.length === 2 && !!o9 && Array.isArray(o9.search) && !!h9 && Array.isArray(h9.nets) && h9.nets.length === 2 && (() => { try { return ["Q02", "Q04"].every((g, i) => J(X27.lawChampion(o.search, g).law) === J(h.laws[i])) && ["M02", "M04"].every((g, i) => J(Array.from(X27.netChampion(o.search, g).weights)) === J(Array.from(h.nets[i]))) && ["L02", "L04"].every((g, i) => J(Array.from(X29.champion(o9.search, g, 2400).weights)) === J(Array.from(h9.nets[i]))); } catch (e) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP, H27'S AND H29'S CHAMPIONS ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, the q and m champions are those of H27's stored searches and the x champions those of H29's stored searches at 2400, by their rounds' rules: ${!!reg}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H30: the larger train set (72 ids, 900 iterations, checkpoints at 300 / 600 / 900). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
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
