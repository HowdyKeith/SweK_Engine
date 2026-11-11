// WebGLEngine/tools/ship/headToHead59.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead59Cmd.mjs; the gate is tools/ship/headToHead59-selfcheck.mjs)
//
// ROUND H59 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT SEED COUNT AT EQUAL COST. H32's resumable search (X32.longSearch, called, not copied) with two seeds, H32's 26011 and 26012 (group L02), and 3600 iterations (checkpoints 900, 1800, 2700 and 3600) instead of 1800: the same 7200 iterations as H32's or H34's four 1800-iteration searches.
// The two 3600-iteration networks and the eight stored long ones (H32's S02, H34's T02) are flown each by itself, with c02, the law of the price, the autopilot and law0, on 200 fresh ids (80200-80399) at 160 s. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 80200, to: 80399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, ITERS = 3600, CHECKPOINTS = Object.freeze([900, 1800, 2700, 3600]), OLD_LAST = 1800;
export const GROUPS = Object.freeze(["L02"]), SEEDS = Object.freeze({ S02: Object.freeze([26011, 26012, 26013, 26014]), T02: Object.freeze([26031, 26032, 26033, 26034]), L02: Object.freeze([26011, 26012]) });
export const OLD_IDS = Object.freeze([...SEEDS.S02.map((s) => "s02_" + s), ...SEEDS.T02.map((s) => "t02_" + s)]), L_IDS = Object.freeze(SEEDS.L02.map((s) => "l02_" + s)), NET_IDS = Object.freeze([...OLD_IDS, ...L_IDS]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...NET_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen;
export const STATE_VERSION = X32.STATE_VERSION, STATE_EVERY = X32.STATE_EVERY, saveStateAtomic = X32.saveStateAtomic;
export const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
/** Reads and validates a state file of a L02 search (the state records H32's group label S02, which is what the search runs as). */
export const loadState = (io, file, ctx) => X32.loadState(io, file, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: "S02" });
/** One resumable search of the group L02: H32's longSearch, with the group relabelled; everything else (state, resume, counting) is H32's. */
export function longSearch(seed, group, start, opts = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead59: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    return { ...X32.longSearch(seed, "S02", start, { iters: ITERS, checkpoints: CHECKPOINTS, ...opts }), group: "L02" };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The pick of the group L02 at a checkpoint: the best held-out penalised value of the two seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.L02, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "L02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead59.champion: group L02 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
/** The eight stored 1800-iteration networks s02_26011 ... t02_26034: [{ id, group, seed, weights, stored }]. `rows` = { S02: [H32's four search rows], T02: [H34's four] }. */
export function netsOf(rows) {
    if (!rows || !Array.isArray(rows.S02) || !Array.isArray(rows.T02)) throw new Error("headToHead59.netsOf: rows is { S02: [four search rows], T02: [four search rows] }");
    const out = [];
    for (const g of ["S02", "T02"]) for (const s of SEEDS[g]) {
        const mine = rows[g].filter((r) => r && r.seed === s);
        if (mine.length !== 1) throw new Error(`headToHead59.netsOf: group ${g} needs one search row for seed ${s}, got ${mine.length}`);
        const k = cpOf(mine[0], OLD_LAST);
        if (!k || !wOk(k.weights) || !Number.isFinite(k.heldScore)) throw new Error(`headToHead59.netsOf: ${g} seed ${s} needs a checkpoint at ${OLD_LAST} of ${WEIGHT_COUNT} finite weights and a finite held-out value`);
        out.push({ id: g.toLowerCase() + "_" + s, group: g, seed: s, weights: Array.from(k.weights), stored: k.heldScore });
    }
    return out;
}
/** The 14 arms as { id: arm }: `h27` = { laws: [q02] }; `old` = the eight stored long networks (netsOf's order); `fresh` = { nets: [the two short 450-iteration weight vectors in seed order] }. */
export function armsOf(h27, old, fresh) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead59.armsOf: h27 is { laws: one 4-weight law }");
    if (!Array.isArray(old) || old.length !== 8 || !old.every((n, i) => n && n.id === OLD_IDS[i] && wOk(n.weights))) throw new Error(`headToHead59.armsOf: old is the eight networks ${OLD_IDS.join(", ")} of ${WEIGHT_COUNT} finite weights each`);
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 2 || !fresh.nets.every(wOk)) throw new Error("headToHead59.armsOf: fresh is { nets: two 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    old.forEach((n) => { out[n.id] = netArm(n.id, n.weights); }); L_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 14; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(h27, old, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, wip = null, search = null, original = null, rows = null, earlier = null, startVal = null, startVal32 = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(h27, old, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead59.audit: no arm ${a}`);
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
/** The stored held-out values: the eight long networks at 1800 (from their stored rows, in the order s02, t02) and the two short at 450 (from the L02 search): { long: [8], short: [16] }. */
export function hoValues(au) { return { long: au.old.map((n) => n.stored), short: SEEDS.L02.map((s) => cpOf(au.search.find((r) => r.group === "L02" && r.seed === s), LAST).heldScore) }; }
/** The index of the best held-out value in a list (the first on a tie), restricted to the indexes given (default all). */
export const bestHo = (ho, idx = ho.map((_, i) => i)) => idx.reduce((b, i) => (ho[i] > ho[b] ? i : b), idx[0]);
const sv = (xs) => { const m = avg(xs); return xs.reduce((p, q) => p + (q - m) * (q - m), 0) / (xs.length - 1); };
/** The short pick (the best held-out value at 3600 of the two, the first on a tie) and the long pick (the best stored held-out value of the eight at 1800, the first on a tie, s02 before t02): arm ids. */
export const picks = (au) => { const h = hoValues(au); return { short: L_IDS[bestHo(h.short)], long: OLD_IDS[bestHo(h.long)] }; };
/** The group comparison: { long, short, diff, se, within } of the audit means (diff = short mean minus long mean; se = sqrt(var_short / 2 + var_long / 8), sample variances). */
export function groupsOf(au) {
    const long = OLD_IDS.map((a) => penMean(au, a)), short = L_IDS.map((a) => penMean(au, a)), diff = avg(short) - avg(long), se = Math.sqrt(sv(short) / 2 + sv(long) / 8);
    return { long, short, diff, se, within: Math.abs(diff) <= 2 * se };
}
/** The arm id of the short pick. */
export const champArm = (au) => "l02_" + champion(au.search, LAST).seed;
/** The twin counts: each l02_<seed> against s02_<seed> at 0.02: { ahead, behind, tied } (a + b + c = 2). */
export function twinsOf(au) { let ahead = 0, behind = 0, tied = 0; for (const s of SEEDS.L02) { const r = pen(au, "l02_" + s, "s02_" + s).reading; if (r === "BETTER") ahead++; else if (r === "WORSE") behind++; else tied++; } return { ahead, behind, tied }; }
/** The generalisation gaps (train minus held-out value) of the new searches: { at3600: mean over the two seeds at 3600, at1800: mean at the searches' own 1800 checkpoint }. */
export function gapsOf(au) {
    const g = (it) => avg(SEEDS.L02.map((s) => { const k = cpOf(au.search.find((r) => r.group === "L02" && r.seed === s), it); return k.trainScore - k.heldScore; }));
    return { at3600: g(LAST), at1800: g(OLD_LAST) };
}
/** The held-out value at 3600 of each new search against H32's stored held-out value at 1800 of the same seed: the number of seeds strictly above. */
export function heldAbove(au) { const h = hoValues(au); return SEEDS.L02.filter((s, i) => h.short[i] > h.long[i]).length; }
/** The registered verdict, eight parts joined by "; " (part E holds a "; " inside), every reading at 0.02. */
export function verdictOf(au) {
    const g = groupsOf(au), c = champArm(au), rd = (a, b = "c02") => word(pen(au, a, b).reading), t = twinsOf(au), gp = gapsOf(au);
    const nb = (ids) => ids.filter((a) => pen(au, a, "c02").reading !== "WORSE").length, lost = L_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`);
    return [`THE 3600 PICK ${rd(c)} C02`, `THE 3600 PICK ${rd(c, "s02_26011")} H32'S CHAMPION`, `TWINS: ${t.ahead} AHEAD, ${t.behind} BEHIND, ${t.tied} TIED`, `NOT BEHIND C02: 3600 ${nb(L_IDS)} OF 2, 1800 ${nb(OLD_IDS)} OF 8`,
        `3600 MINUS 1800 MEAN AUDIT VALUE: ${(g.diff >= 0 ? "+" : "") + g.diff.toFixed(4)} (se ${g.se.toFixed(4)}); WITHIN 2 SE OF ZERO: ${g.within ? "YES" : "NO"}`,
        `LOST SUBS IN THE 3600 NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`, `HELD-OUT AT 3600 ABOVE AT 1800: ${heldAbove(au)} OF 2`, `GAP LARGER AT 3600 THAN AT 1800: ${gp.at3600 > gp.at1800 ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from wip and from its 1800-iteration twin. */
export const distances = (au) => L_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1Twin: l1(au.fresh.nets[i], au.old[i].weights) }));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...NET_IDS], c = champArm(au), h = hoValues(au), g = groupsOf(au), mean = (a) => penMean(au, a), p = picks(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const mine = au.search.filter((r) => r.group === "L02");
    const search = mine.map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost flights)`).join("; ");
    const same = SEEDS.L02.map((s, i) => { const k = cpOf(mine.find((r) => r.seed === s), OLD_LAST); return `${s} ${J(Array.from(k.weights)) === J(Array.from(au.old[i].weights)) ? "identical" : "different (L1 " + l1(k.weights, au.old[i].weights).toFixed(4) + ")"}`; }).join(", ");
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const paired = [...NET_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`), ...SEEDS.L02.map((s) => `l02_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "l02_" + s, "s02_" + s))}`)].join("; ");
    const sd = (xs) => Math.sqrt(sv(xs)), best = (xs, ids) => ids[xs.indexOf(Math.max(...xs))];
    const grp = `1800 EIGHT mean ${avg(g.long).toFixed(4)} sd ${sd(g.long).toFixed(4)} best ${best(g.long, OLD_IDS)} ${Math.max(...g.long).toFixed(4)}; 3600 PAIR mean ${avg(g.short).toFixed(4)} sd ${sd(g.short).toFixed(4)} best ${best(g.short, L_IDS)} ${Math.max(...g.short).toFixed(4)}`;
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Twin.toFixed(2)} from its twin`).join(", ");
    return [
        `SEARCH L02 (start value on the 72 train ids, then train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${mine.map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `STORED 1800 VS NEW 1800 (REPORTED: the new search's checkpoint at 1800 against H32's stored 1800-iteration weights of the same seed): ${same}`,
        `PICKS: the 3600 pick is ${c} (held-out ${h.short[bestHo(h.short)].toFixed(4)} at 3600; the better 3600 network on the audit: ${L_IDS.reduce((b, a) => (mean(a) > mean(b) ? a : b), L_IDS[0])}); the best 1800 network by stored held-out value is ${p.long} (held-out ${h.long[bestHo(h.long)].toFixed(4)} at 1800)`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => `${a} ${[0.005, 0.02, 0.04].map((q) => f4(penGainAt(au, a, q))).join(" / ")}`).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${paired}`, `GROUPS (audit means at 0.02): ${grp}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances of the new networks ${dist}; extra power ${shown.slice(3).map((a) => `${a} ${f2(extraPower(au, a))}`).join(", ")}`,
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
    const counted = Array.isArray(s) && s.length === 2 && SEEDS.L02.every((q) => s.filter((r) => r.group === "L02" && r.seed === q).length === 1) && s.every((r) => r.group === "L02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 2 && au.fresh.nets.every(wOk) && SEEDS.L02.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(Array.from(cpOf(s.find((r) => r.seed === q), LAST).weights)));
    rows.push({ name: "2 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `2 network searches (the two seeds of L02), each with checkpoints at 900, 1800, 2700 and 3600 of 963 finite weights, and the 2 flown networks are the seeds' 3600-iteration weights in seed order: ${!!counted}` });
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.old) && ref.length === 8 && ref.every((r, i) => au.old[i] && au.old[i].id === r.id && au.old[i].stored === r.stored && J(Array.from(au.old[i].weights)) === J(r.weights)); } catch (e) { return false; } })();
    rows.push({ name: "THE LONG EIGHT ARE THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the eight long networks are the weights at 1800 of H32's seeds 26011-26014 and H34's seeds 26031-26034 (963 finite weights each), read again from the stored search rows: ${!!stored}` });
    const first = !!counted && Number.isFinite(au.startVal) && Number.isFinite(au.startVal32) && au.startVal === au.startVal32 && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS WIP ON THE 72 IDS", ok: first, text: `every search's first scored candidate has exactly wip's penalised value on the 72 train ids at 0.02 (computed in this round), which equals H32's stored value to the last digit: ${first}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48;
    const dj = trainOk && [...TRAIN, HELD, { from: 50000, to: 50071 }, { from: 52000, to: 52299 }, { from: 53000, to: 53799 }].every((a) => disjoint(a, au.range)) && au.range.from > 79399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the train ids are H27's 26000-26023 and 30000-30047 (72 in all) and they, the held-out ids, 50000-50071, 52000-52299 and H48's 53000-53799 do not overlap the audit ids, which start after H58's audit (to 79399): ${dj}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => r.group !== "L02" || r.checkpoints.every((k) => k.iter !== LAST || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE PICK IS THE BEST HELD-OUT PENALISED OF THE TWO AT 3600", ok: !!(counted && bestAt), text: `the group pick at 3600 has the largest held-out penalised value of the two seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const e = au.earlier, newSeeds = Array.isArray(e) && e.length > 0 && J(SEEDS.L02) === J(X32.SEEDS.S02.slice(0, 2)) && SEEDS.L02.every((q) => e.includes(q)) && Array.isArray(au.search) && au.search.every((r) => SEEDS.L02.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S 26011 AND 26012", ok: newSeeds, text: `the two seeds are H32's first two, 26011 and 26012, and H32's stored search holds both (the seeds read: ${Array.isArray(e) ? e.length : 0}): ${newSeeds}` });
    const o = au.original, k = au.h27;
    const reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const pr = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pr && !!pr.straight && !!pr.resumed && pr.killedAt === 6 && pr.resumedFrom === 4 && !!pr.config && pr.config.iters === 12 && F(pr.straight) === F(pr.resumed) && J(pr.straight.resumes) === "[]" && J(pr.resumed.resumes) === "[4]" && pr.resumed.draws > 0;
    rows.push({ name: "THE SEARCH CODE HAS H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the searches ran H32's code: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H59: a different seed count at equal cost (two seeds of 3600 iterations, group L02, seeds 26011 and 26012, checkpoints at 900 / 1800 / 2700 / 3600, against the eight stored 1800-iteration networks). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
