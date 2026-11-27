// WebGLEngine/tools/ship/headToHead49.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead49Cmd.mjs; the gate is tools/ship/headToHead49-selfcheck.mjs)
//
// ROUND H49 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT SEED COUNT -- EIGHT MORE SEEDS OF THE SAME SEARCH. H32's resumable search (X32.longSearch, called, not copied) with eight seeds no earlier round used (26051-26058, group U02): 1800 iterations from network-Wip on the 72
// train ids at 0.02, checkpoints at 900 / 1200 / 1500 / 1800. The eight new 1800-iteration networks and the old eight (H32's S02, H34's T02: stored weights) are flown each by itself, with c02, the law of the price, the autopilot and law0, on 200 fresh ids (49200-49399) at 160 s.
// Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 49200, to: 49399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, CHECKPOINTS = X32.CHECKPOINTS, ITERS = X32.ITERS;
export const GROUPS = Object.freeze(["U02"]), SEEDS = Object.freeze({ S02: Object.freeze([26011, 26012, 26013, 26014]), T02: Object.freeze([26031, 26032, 26033, 26034]), U02: Object.freeze([26051, 26052, 26053, 26054, 26055, 26056, 26057, 26058]) });
export const OLD_IDS = Object.freeze([...SEEDS.S02.map((s) => "s02_" + s), ...SEEDS.T02.map((s) => "t02_" + s)]), U_IDS = Object.freeze(SEEDS.U02.map((s) => "u02_" + s)), NET_IDS = Object.freeze([...OLD_IDS, ...U_IDS]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...NET_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen;
export const STATE_VERSION = X32.STATE_VERSION, STATE_EVERY = X32.STATE_EVERY, saveStateAtomic = X32.saveStateAtomic;
export const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
/** Reads and validates a state file of a U02 search (the state records H32's group label S02, which is what the search runs as). */
export const loadState = (io, file, ctx) => X32.loadState(io, file, { ...ctx, group: "S02" });
/** One resumable search of the group U02: H32's longSearch, with the group relabelled; everything else (state, resume, counting) is H32's. */
export function longSearch(seed, group, start, opts = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead49: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    return { ...X32.longSearch(seed, "S02", start, opts), group: "U02" };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group U02 at a checkpoint: the best held-out penalised value of the eight seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.U02, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "U02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead49.champion: group U02 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
/** The eight stored 1800-iteration networks s02_26011 ... t02_26034: [{ id, group, seed, weights, stored }]. `rows` = { S02: [H32's four search rows], T02: [H34's four] }. */
export function netsOf(rows) {
    if (!rows || !Array.isArray(rows.S02) || !Array.isArray(rows.T02)) throw new Error("headToHead49.netsOf: rows is { S02: [four search rows], T02: [four search rows] }");
    const out = [];
    for (const g of ["S02", "T02"]) for (const s of SEEDS[g]) {
        const mine = rows[g].filter((r) => r && r.seed === s);
        if (mine.length !== 1) throw new Error(`headToHead49.netsOf: group ${g} needs one search row for seed ${s}, got ${mine.length}`);
        const k = cpOf(mine[0], LAST);
        if (!k || !wOk(k.weights) || !Number.isFinite(k.heldScore)) throw new Error(`headToHead49.netsOf: ${g} seed ${s} needs a checkpoint at ${LAST} of ${WEIGHT_COUNT} finite weights and a finite held-out value`);
        out.push({ id: g.toLowerCase() + "_" + s, group: g, seed: s, weights: Array.from(k.weights), stored: k.heldScore });
    }
    return out;
}
/** The 20 arms as { id: arm }: `h27` = { laws: [q02] }; `old` = the eight stored networks (netsOf's order); `fresh` = { nets: [the eight new 1800-iteration weight vectors in seed order] }. */
export function armsOf(h27, old, fresh) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead49.armsOf: h27 is { laws: one 4-weight law }");
    if (!Array.isArray(old) || old.length !== 8 || !old.every((n, i) => n && n.id === OLD_IDS[i] && wOk(n.weights))) throw new Error(`headToHead49.armsOf: old is the eight networks ${OLD_IDS.join(", ")} of ${WEIGHT_COUNT} finite weights each`);
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 8 || !fresh.nets.every(wOk)) throw new Error("headToHead49.armsOf: fresh is { nets: eight 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    old.forEach((n) => { out[n.id] = netArm(n.id, n.weights); }); U_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 20; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(h27, old, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, wip = null, search = null, original = null, rows = null, earlier = null, startVal = null, startVal32 = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(h27, old, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead49.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, h27, old, fresh, wip, search, original, rows, earlier, startVal, startVal32, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the 72 train ids at 0.02 (the first scored candidate of every search). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => X32.startVal(wip, { seconds, flyFn, train });
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
/** The stored held-out value at 1800 of the sixteen networks in the order s02, t02, u02 (the old from their stored rows, the new from the U02 search). */
export function hoValues(au) { return [...au.old.map((n) => n.stored), ...SEEDS.U02.map((s) => cpOf(au.search.find((r) => r.group === "U02" && r.seed === s), LAST).heldScore)]; }
/** The index (0 to 15) of the best held-out value among the networks at the indexes given (the first on a tie). */
export const bestHo = (ho, idx) => idx.reduce((b, i) => (ho[i] > ho[b] ? i : b), idx[0]);
const ranks = (xs) => xs.map((x) => { const lt = xs.filter((y) => y < x).length, eq = xs.filter((y) => y === x).length; return lt + (eq + 1) / 2; });
/** Spearman's rho: the Pearson correlation of the ranks, ties averaged (NaN for a constant list). */
export function spearman(a, b) { const ra = ranks(a), rb = ranks(b), ma = avg(ra), mb = avg(rb); let sab = 0, saa = 0, sbb = 0; ra.forEach((x, i) => { sab += (x - ma) * (rb[i] - mb); saa += (x - ma) ** 2; sbb += (rb[i] - mb) ** 2; }); return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb); }
const sv = (xs) => { const m = avg(xs); return xs.reduce((p, q) => p + (q - m) * (q - m), 0) / (xs.length - 1); };
/** The group comparison: { old, nw, diff, se, within } of the audit means (se = sqrt(var_new / 8 + var_old / 8), sample variances). */
export function groupsOf(au) {
    const old = OLD_IDS.map((a) => penMean(au, a)), nw = U_IDS.map((a) => penMean(au, a)), diff = avg(nw) - avg(old), se = Math.sqrt(sv(nw) / 8 + sv(old) / 8);
    return { old, nw, diff, se, within: Math.abs(diff) <= 2 * se };
}
/** The mean audit value of the held-out best of N networks over all subsets of N of the sixteen: { N: mean }. */
export function pickByN(au, sizes = [1, 2, 4, 8, 16]) {
    const ho = hoValues(au), m = NET_IDS.map((a) => penMean(au, a)), out = {};
    for (const n of sizes) { let t = 0, c = 0; const rec = (start, cur) => { if (cur.length === n) { t += m[bestHo(ho, cur)]; c++; return; } for (let i = start; i < 16; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); } }; rec(0, []); out[n] = t / c; }
    return out;
}
export const champArm = (au) => "u02_" + champion(au.search, LAST).seed;
/** The registered verdict, eight parts joined by "; " (part G holds a "; " inside), every reading at 0.02. */
export function verdictOf(au) {
    const ho = hoValues(au), g = groupsOf(au), c = champArm(au), b16 = NET_IDS[bestHo(ho, [...Array(16).keys()])], bOld = NET_IDS[bestHo(ho, [...Array(8).keys()])];
    const bestNew = U_IDS.reduce((b, a) => (penMean(au, a) > penMean(au, b) ? a : b), U_IDS[0]), rd = (a) => word(pen(au, a, "c02").reading);
    const nb = (ids) => ids.filter((a) => pen(au, a, "c02").reading !== "WORSE").length, lost = NET_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), rho = spearman(ho, NET_IDS.map((a) => penMean(au, a)));
    return [`THE NEW CHAMPION ${rd(c)} C02`, `THE BEST OF 16 BY HO ${rd(b16)} C02`, `THE BEST OF THE NEW 8 ON THE AUDIT ${rd(bestNew)} C02`, `NETWORKS NOT BEHIND C02: NEW ${nb(U_IDS)} OF 8, OLD ${nb(OLD_IDS)} OF 8, ALL ${nb(NET_IDS)} OF 16`,
        `LOST SUBS IN THE SIXTEEN: ${lost.length ? lost.join(", ") : "NONE"}`, `HO RANK VS AUDIT RANK OVER 16: rho ${Number.isFinite(rho) ? rho.toFixed(2) : "NaN"}`,
        `NEW MINUS OLD MEAN AUDIT VALUE: ${(g.diff >= 0 ? "+" : "") + g.diff.toFixed(4)} (se ${g.se.toFixed(4)}); WITHIN 2 SE OF ZERO: ${g.within ? "YES" : "NO"}`, `THE BEST OF 16 BY HO BEATS THE BEST OF THE OLD 8 BY HO ON THE AUDIT: ${penMean(au, b16) > penMean(au, bOld) ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from wip. */
export const distances = (au) => U_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip) }));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...NET_IDS], c = champArm(au), ho = hoValues(au), g = groupsOf(au), mean = (a) => penMean(au, a);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "U02").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost flights)`).join("; ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const paired = NET_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`).join("; ");
    const rk = ranks(ho), ra = ranks(NET_IDS.map(mean)), hov = NET_IDS.map((a, i) => `${a} HO ${ho[i].toFixed(4)} (rank ${rk[i]}) audit ${mean(a).toFixed(4)} (rank ${ra[i]})`).join("; ");
    const sd = (xs) => Math.sqrt(sv(xs)), best = (xs, ids) => ids[xs.indexOf(Math.max(...xs))];
    const grp = `OLD 8 mean ${avg(g.old).toFixed(4)} sd ${sd(g.old).toFixed(4)} best ${best(g.old, OLD_IDS)} ${Math.max(...g.old).toFixed(4)}; NEW 8 mean ${avg(g.nw).toFixed(4)} sd ${sd(g.nw).toFixed(4)} best ${best(g.nw, U_IDS)} ${Math.max(...g.nw).toFixed(4)}`;
    const pn = pickByN(au), dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)}`).join(", ");
    return [
        `SEARCH U02 (start value on the 72 train ids, then train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.filter((r) => r.group === "U02").map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at 1800 is ${c} (the best new network on the audit: ${U_IDS.reduce((b, a) => (mean(a) > mean(b) ? a : b), U_IDS[0])})`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(au, a, p))).join(" / ")}`).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${paired}`, `HO VS AUDIT (stored held-out value at 1800 and audit mean, with ranks, ties averaged): ${hov}`, `GROUPS (audit means at 0.02): ${grp}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: mean audit value of the held-out best of N over all subsets of N of the sixteen: ${Object.entries(pn).map(([n, v]) => `${n} ${v.toFixed(4)}`).join(", ")}; distances of the new networks from wip ${dist}; extra power ${shown.slice(3).map((a) => `${a} ${f2(extraPower(au, a))}`).join(", ")}`,
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
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 8 && SEEDS.U02.every((q) => s.filter((r) => r.group === "U02" && r.seed === q).length === 1) && s.every((r) => r.group === "U02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 8 && au.fresh.nets.every(wOk) && SEEDS.U02.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(Array.from(cpOf(s.find((r) => r.seed === q), LAST).weights)));
    rows.push({ name: "8 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `8 network searches (the eight seeds of U02), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 8 flown new networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.old) && ref.length === 8 && ref.every((r, i) => au.old[i] && au.old[i].id === r.id && au.old[i].stored === r.stored && J(Array.from(au.old[i].weights)) === J(r.weights)); } catch (e) { return false; } })();
    rows.push({ name: "THE OLD EIGHT ARE THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the old eight networks are the weights at 1800 of H32's seeds 26011-26014 and H34's seeds 26031-26034 (963 finite weights each), read again from the stored search rows: ${!!stored}` });
    const first = !!counted && Number.isFinite(au.startVal) && Number.isFinite(au.startVal32) && au.startVal === au.startVal32 && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS WIP ON THE 72 IDS", ok: first, text: `every search's first scored candidate has exactly wip's penalised value on the 72 train ids at 0.02 (computed in this round), which equals H32's stored value to the last digit: ${first}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48;
    const dj = trainOk && [...TRAIN, HELD, { from: 53000, to: 53799 }].every((a) => disjoint(a, au.range)) && au.range.from > 47399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the train ids are H27's 26000-26023 and 30000-30047 (72 in all) and they, the held-out ids and H48's 53000-53799 do not overlap the audit ids, which start after H47's audit (to 47399): ${dj}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => r.group !== "U02" || r.checkpoints.every((k) => k.iter !== LAST || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT PENALISED OF THE EIGHT AT 1800", ok: !!(counted && bestAt), text: `the group champion at 1800 has the largest held-out penalised value of the eight seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const e = au.earlier, newSeeds = Array.isArray(e) && e.length > 0 && e.includes(26011) && e.includes(26031) && SEEDS.U02.every((q) => !e.includes(q));
    rows.push({ name: "THE SEEDS ARE NEW", ok: newSeeds, text: `the eight seeds 26051-26058 appear in no stored search of H27, H29, H30, H31, H32 or H34 (their seeds read: ${Array.isArray(e) ? e.length : 0}): ${newSeeds}` });
    const o = au.original, k = au.h27;
    const reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const pr = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pr && !!pr.straight && !!pr.resumed && pr.killedAt === 6 && pr.resumedFrom === 4 && !!pr.config && pr.config.iters === 12 && F(pr.straight) === F(pr.resumed) && J(pr.straight.resumes) === "[]" && J(pr.resumed.resumes) === "[4]" && pr.resumed.draws > 0;
    rows.push({ name: "THE SEARCH CODE HAS H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the searches ran H32's code: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H49: a different seed count (eight more seeds of the 1800-iteration search at 0.02, group U02, seeds 26051-26058, checkpoints at 900 / 1200 / 1500 / 1800; sixteen networks flown). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
