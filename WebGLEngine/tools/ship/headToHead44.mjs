// WebGLEngine/tools/ship/headToHead44.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead44Cmd.mjs; the gate is tools/ship/headToHead44-selfcheck.mjs)
//
// ROUND H44 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT SEED COUNT. NO new search. The eight stored 1800-iteration networks (H32's S02 seeds 26011-26014 and H34's T02 seeds 26031-26034: eight draws of one search) are flown on ONE fresh audit (ids 44200-44399) with c02, q02, the autopilot and law0,
// and the best of N seeds is read by resampling the eight: the mean audit value of the pick of N, over all C(8, N) subsets (8, 28, 70, 1), with the pick made on the series' 40 held-out ids (HO: the value the search wrote) or on H42's 200 ids (HB: its stored flight); the oracle (the best audit mean in the subset) as the ceiling.
// Reads and writes nothing itself (the command hands in the stored rows, H42's stored values and H27's search).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 44200, to: 44399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const SEEDS = Object.freeze({ S02: Object.freeze([26011, 26012, 26013, 26014]), T02: Object.freeze([26031, 26032, 26033, 26034]) });
export const NET_IDS = Object.freeze([...SEEDS.S02.map((s) => "s02_" + s), ...SEEDS.T02.map((s) => "t02_" + s)]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...NET_IDS]);
export const NS = Object.freeze([1, 2, 4, 8]);
export const LAST = X32.CHECKPOINTS[X32.CHECKPOINTS.length - 1];
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The eight stored 1800-iteration networks in the order s02_26011 ... s02_26014, t02_26031 ... t02_26034: [{ id, group, seed, weights, stored }] (`stored` = the held-out value the search wrote, HO). `rows` = { S02: [H32's four search rows], T02: [H34's four] }. */
export function netsOf(rows) {
    if (!rows || !Array.isArray(rows.S02) || !Array.isArray(rows.T02)) throw new Error("headToHead44.netsOf: rows is { S02: [four search rows], T02: [four search rows] }");
    const out = [];
    for (const g of ["S02", "T02"]) for (const s of SEEDS[g]) {
        const mine = rows[g].filter((r) => r && r.seed === s);
        if (mine.length !== 1) throw new Error(`headToHead44.netsOf: group ${g} needs one search row for seed ${s}, got ${mine.length}`);
        const k = cpOf(mine[0], LAST);
        if (!k || !wOk(k.weights) || !Number.isFinite(k.heldScore)) throw new Error(`headToHead44.netsOf: ${g} seed ${s} needs a checkpoint at ${LAST} of ${WEIGHT_COUNT} finite weights and a finite held-out value`);
        out.push({ id: g.toLowerCase() + "_" + s, group: g, seed: s, weights: Array.from(k.weights), stored: k.heldScore });
    }
    return out;
}
/** H42's stored values of the eight 1800 networks: { HO: [8], HB: [8] } in network order, from H42's evals ([{ id: "S02:26011:1800", values: { HO, HA, HB }, stored }]); refuses a missing network or a value that is not finite. */
export function h42Values(evals) {
    if (!Array.isArray(evals)) throw new Error("headToHead44.h42Values: evals is H42's list of flown networks");
    const out = { HO: [], HB: [] };
    for (const id of NET_IDS) {
        const g = id.slice(0, 3).toUpperCase(), s = Number(id.slice(4)), e = evals.filter((x) => x && x.group === g && x.seed === s && x.iter === LAST);
        if (e.length !== 1 || !e[0].values || !Number.isFinite(e[0].values.HO) || !Number.isFinite(e[0].values.HB)) throw new Error(`headToHead44.h42Values: H42 needs one flown network for ${g} seed ${s} at ${LAST} with finite HO and HB values`);
        out.HO.push(e[0].values.HO); out.HB.push(e[0].values.HB);
    }
    return out;
}
/** The 8 + 4 arms as { id: arm }: `h27` = { laws: [q02] }; `nets` = the eight networks (netsOf's order). */
export function armsOf(h27, nets) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead44.armsOf: h27 is { laws: one 4-weight law }");
    if (!Array.isArray(nets) || nets.length !== 8 || !nets.every((n, i) => n && n.id === NET_IDS[i] && wOk(n.weights))) throw new Error(`headToHead44.armsOf: nets is the eight networks ${NET_IDS.join(", ")} of ${WEIGHT_COUNT} finite weights each`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    nets.forEach((n) => { out[n.id] = netArm(n.id, n.weights); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 12; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(h27, nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, wip = null, original = null, rows = null, h42 = null, fixture = null, means = null } = {}) {
    const all = armsOf(h27, nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead44.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, h27, nets, wip, original, rows, h42, fixture, means, c02: all.c02.entry().weights };
}
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
/** An arm's mean penalised priced score at a price (default 0.02) over the audit ids. */
export const penMean = (au, a, p = PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
const pen = (au, a, b, p = PRICE) => penPair(au, a, b, p);
/** The audit means at 0.02 of the eight networks in network order. */
export const auditMeans = (au) => NET_IDS.map((a) => penMean(au, a));
/** All subsets of size n of the indices 0..7 as lists in increasing order (C(8, n) of them, in the order of the bit masks). */
export function subsets(n) {
    if (!Number.isInteger(n) || n < 1 || n > 8) throw new Error(`headToHead44.subsets: n must be an integer from 1 to 8, got ${J(n)}`);
    const out = []; for (let m = 1; m < 256; m++) { const s = []; for (let i = 0; i < 8; i++) if (m & (1 << i)) s.push(i); if (s.length === n) out.push(s); } return out;
}
/** The pick of a subset on a list of eight values: the member with the largest value, the first in network order on a tie. */
export function pickOf(values, subset) { let b = -1; for (const i of subset) if (b < 0 || values[i] > values[b]) b = i; return b; }
/** The mean over all C(8, n) subsets of the audit mean of the subset's pick on `values` (`audit` = the eight audit means); `oracle: true` gives the mean of the best audit mean in the subset. */
export function meanPick(values, audit, n, { oracle = false } = {}) {
    if (!Array.isArray(values) || !Array.isArray(audit) || values.length !== 8 || audit.length !== 8 || ![...values, ...audit].every(Number.isFinite)) throw new Error("headToHead44.meanPick: two lists of eight finite numbers");
    return avg(subsets(n).map((s) => (oracle ? Math.max(...s.map((i) => audit[i])) : audit[pickOf(values, s)])));
}
export function spearman(x, y) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2 || ![...x, ...y].every(Number.isFinite)) throw new Error("headToHead44.spearman: two lists of the same length (at least 2) of finite numbers");
    const rank = (v) => v.map((a) => v.filter((b) => b < a).length + (v.filter((b) => b === a).length + 1) / 2), rx = rank(x), ry = rank(y), mx = avg(rx), my = avg(ry); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < rx.length; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
    return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}
/** The values the picks read: HO (the stored held-out values), HB (H42's), the audit means; and the picks among all eight. */
export function tables(au) {
    const v = h42Values(au.h42), ho = au.nets.map((n) => n.stored), aud = auditMeans(au);
    return { ho, hb: v.HB, h42Ho: v.HO, aud, pickHB: pickOf(v.HB, [0, 1, 2, 3, 4, 5, 6, 7]), pickHO: pickOf(ho, [0, 1, 2, 3, 4, 5, 6, 7]), pickAud: pickOf(aud, [0, 1, 2, 3, 4, 5, 6, 7]) };
}
/** The mean audit value of the pick of N for N = 1 to 8 by HB, by HO and the oracle's: { hb: [8], ho: [8], oracle: [8] } (index n - 1). */
export function pickByN(au) {
    const t = tables(au), ns = [1, 2, 3, 4, 5, 6, 7, 8];
    return { hb: ns.map((n) => meanPick(t.hb, t.aud, n)), ho: ns.map((n) => meanPick(t.ho, t.aud, n)), oracle: ns.map((n) => meanPick(t.hb, t.aud, n, { oracle: true })) };
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), v4 = (x) => x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
/** The registered verdict, eight parts joined by "; " (part E holds a "; " inside, as registered). */
export function verdictOf(au) {
    const t = tables(au), p = pickByN(au), rd = (i) => word(pen(au, NET_IDS[i], "c02").reading), lost = NET_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`);
    const q = (arr) => NS.map((n) => `${n} ${v4(arr[n - 1])}`).join(", "), hb = p.hb.map(Number).map((x) => Number(x.toFixed(4)));
    const rises = hb[0] < hb[1] && hb[1] < hb[3] && hb[3] < hb[7], four = Number((p.hb[3] - p.ho[3]).toFixed(10)) > 0.0005;
    return [`THE BEST OF 8 BY HB ${rd(t.pickHB)} C02`, `THE BEST OF 8 BY HO ${rd(t.pickHO)} C02`, `THE BEST OF 8 ON THE AUDIT ${rd(t.pickAud)} C02`, `HB PICKS ${NET_IDS[t.pickHB]}, HO PICKS ${NET_IDS[t.pickHO]}`,
        `MEAN AUDIT VALUE OF THE PICK OF N BY HB: ${q(p.hb)}; BY HO: ${q(p.ho)}`, `THE PICK BY HB RISES WITH N: ${rises ? "YES" : "NO"}`, `THE HB PICK BEATS THE HO PICK ON THE 70 SUBSETS OF FOUR: ${four ? "YES" : "NO"}`, `LOST SUBS IN THE EIGHT: ${lost.length ? lost.join(", ") : "NONE"}`].join("; ");
}
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
export const sd = (xs) => { const m = avg(xs); return Math.sqrt(avg(xs.map((a) => (a - m) ** 2))); };
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...NET_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((x) => f4(f(au, a, x))).join(" / ")}`, t = tables(au), p = pickByN(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const values = NET_IDS.map((a, i) => `${a} HO ${v4(t.ho[i])}, HB ${v4(t.hb[i])}, audit ${v4(t.aud[i])}`).join("; ");
    const picks = `HB picks ${NET_IDS[t.pickHB]} (audit ${v4(t.aud[t.pickHB])}), HO picks ${NET_IDS[t.pickHO]} (audit ${v4(t.aud[t.pickHO])}), the oracle ${NET_IDS[t.pickAud]} (audit ${v4(t.aud[t.pickAud])}); the mean of the eight ${v4(avg(t.aud))}`;
    const byN = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `N ${n} (${subsets(n).length} subsets): by HB ${v4(p.hb[n - 1])}, by HO ${v4(p.ho[n - 1])}, oracle ${v4(p.oracle[n - 1])}`).join("; ");
    const pairsOf = (a) => `${a} minus c02 ${fmt(pen(au, a, "c02"))}; ${a} minus q02 ${fmt(pen(au, a, "q02"))}`;
    const pairs = [...new Set([NET_IDS[t.pickHB], NET_IDS[t.pickHO], NET_IDS[t.pickAud]])].map(pairsOf).join("; ") + "; " + NET_IDS.map((a) => `${a} minus c02 ${fmt(pen(au, a, "c02"))}`).join("; ");
    const rep = NET_IDS.map((a) => `${a} minus c02 at 0.04 ${fmt(pen(au, a, "c02", 0.04))}; ${a} minus c02 at 0.005 ${fmt(pen(au, a, "c02", 0.005))}`).join("; ");
    return [
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `EXTRA POWER (mean of dark and lit extra kW over the autopilot): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `VALUES (each network's value on HO, on HB and its audit mean at 0.02): ${values}`, `PICKS: ${picks}`, `PICK BY N (mean audit value of the pick over all subsets of size N): ${byN}`, `PAIRED (penalised priced score at 0.02): ${pairs}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: the standard deviation of the eight audit means ${sd(t.aud).toFixed(4)}; Spearman rank correlation over the eight of HO with the audit ${spearman(t.ho, t.aud).toFixed(2)}, of HB with the audit ${spearman(t.hb, t.aud).toFixed(2)}; pairings at 0.04 and 0.005: ${rep}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
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
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.nets) && ref.length === 8 && ref.every((r, i) => au.nets[i] && au.nets[i].id === r.id && au.nets[i].stored === r.stored && J(Array.from(au.nets[i].weights)) === J(r.weights)); } catch (e) { return false; } })();
    rows.push({ name: "THE EIGHT NETWORKS ARE THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the eight networks are the weights at 1800 of H32's seeds 26011-26014 and H34's seeds 26031-26034 (963 finite weights each), read again from the stored search rows: ${!!stored}` });
    const h42 = (() => { try { const v = h42Values(au.h42), ev = au.h42; return v.HO.every((x, i) => x === au.nets[i].stored) && v.HB.every(Number.isFinite) && ev.length === 32 && ev.every((e) => e.values.HO === e.stored); } catch (e) { return false; } })();
    rows.push({ name: "H42'S STORED VALUES ARE PRESENT, ITS HO RE-FLY EQUALS THE STORED VALUES, HB IS FINITE", ok: !!h42, text: `H42's flight holds the eight 1800 networks with finite HO and HB values, its HO value of every one of its 32 networks equals the value the search wrote to the last digit, and the eight HO values equal the stored ones: ${!!h42}` });
    const hoRows = !!au.rows && Array.isArray(au.nets) && au.nets.length === 8 && au.nets.every((nn) => { const r = au.rows[nn.group] && au.rows[nn.group].filter((q) => q && q.seed === nn.seed); return !!r && r.length === 1 && !!cpOf(r[0], LAST) && cpOf(r[0], LAST).heldScore === nn.stored && Number.isFinite(nn.stored); });
    rows.push({ name: "THE STORED HO VALUES ARE THE SEARCH ROWS' HELD-OUT VALUES AT 1800", ok: hoRows, text: `each of the eight networks' HO value is the held-out value the search wrote at iteration 1800 in H32's or H34's stored search row, finite, to the last digit: ${hoRows}` });
    const o = au.original, k = au.h27, regc = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!regc}` });
    const tr = [...X32.TRAIN, { from: 50000, to: 50071 }, { from: 52000, to: 52039 }, { from: 52100, to: 52299 }, X32.HELD], dj = tr.every((t) => disjoint(t, au.range)) && au.range.from > 43399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the train ids (26000-26023 and 30000-30047), HO (26100-26139), HA and HB (52000-52039, 52100-52299) or 50000-50071, and start after H43's audit (43399): ${dj}` });
    const hand = (() => { const v = [3, 1, 4, 1, 5, 9, 2, 6], a = [10, 20, 30, 40, 50, 60, 70, 80]; let ok = J(NS.map((x) => subsets(x).length)) === "[8,28,70,1]" && subsets(3).length === 56 && near(meanPick(v, a, 8), 60) && near(meanPick(a, a, 1), avg(a)) && near(meanPick(a, a, 8), 80) && near(meanPick(v, a, 8, { oracle: true }), 80) && near(meanPick(v, a, 1, { oracle: true }), avg(a)) && pickOf([1, 5, 5, 2], [0, 1, 2, 3]) === 1 && pickOf([1, 5, 5, 2], [2, 3]) === 2; const rev = a.map((x) => -x); ok = ok && near(meanPick(rev, a, 2), (() => { let s = 0, c = 0; for (const sub of subsets(2)) { s += a[Math.min(...sub)]; c++; } return s / c; })()); return ok; })();
    rows.push({ name: "THE SUBSET RESAMPLING IS RIGHT ON HAND-WORKED CASES", ok: hand, text: `there are 8, 28, 70 and 1 subsets of size 1, 2, 4 and 8 (56 of size 3), the pick of all eight on [3,1,4,1,5,9,2,6] has audit 60, the pick by the audit value itself over N = 8 is the maximum, ties go to the first in order, and the oracle at N = 1 is the mean of the eight: ${hand}` });
    const cnt = J(NS.map((x) => subsets(x).length)) === "[8,28,70,1]" && J(NS) === "[1,2,4,8]";
    rows.push({ name: "THE SUBSET COUNTS ARE 8, 28, 70 AND 1", ok: cnt, text: `there are 8, 28, 70 and 1 subsets of the eight for N = 1, 2, 4 and 8: ${cnt}` });
    const m = au.means, means = (() => { try { return !!m && NET_IDS.every((a) => Number.isFinite(m[a]) && Math.abs(m[a] - penMean(au, a)) < 1e-12) && ["c02", "q02"].every((a) => Math.abs(m[a] - penMean(au, a)) < 1e-12); } catch (e) { return false; } })();
    rows.push({ name: "THE AUDIT MEANS ARE RECOMPUTED FROM THE RUNS", ok: !!means, text: `the audit mean at 0.02 of each of the eight networks, c02 and q02 recomputed in the command from the raw runs equals the library's to 1e-12: ${!!means}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H44: a different seed count (the eight stored 1800-iteration networks of H32 and H34 flown on one audit; the best of N seeds read by resampling; no search). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
