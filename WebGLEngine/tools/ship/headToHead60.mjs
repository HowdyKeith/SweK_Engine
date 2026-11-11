// WebGLEngine/tools/ship/headToHead60.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead60Cmd.mjs; the gate is tools/ship/headToHead60-selfcheck.mjs)
//
// ROUND H60 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT HELD-OUT SET FOR THE SEARCHES THAT EXIST. The 32 stored checkpoint networks of H32's four seeds (group S02) and H34's four (group T02) at 900, 1200, 1500 and 1800 are
// re-scored by H27's penalised priced objective at 0.02 on two NEW held-out sets: HA (40 ids, 81000-81039) and HB (200 ids, 81100-81299); the stored held-out values (the set 26100-26139) are read from the stored rows. The eight 1800-iteration networks, c02, q02, law0 and the
// autopilot are flown on an audit of 200 ids (81400-81599). Reads and writes nothing itself (the command hands in the stored rows and the flights).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";
import * as X51 from "./headToHead51.mjs";

export const SETS = Object.freeze({ HS: Object.freeze({ from: 26100, to: 26139 }), HA: Object.freeze({ from: 81000, to: 81039 }), HB: Object.freeze({ from: 81100, to: 81299 }), AUD: Object.freeze({ from: 81400, to: 81599 }) });
export const SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02, TRAIN = X32.TRAIN;
export const CHECKPOINTS = Object.freeze([900, 1200, 1500, 1800]), LAST = 1800;
export const SEEDS = Object.freeze({ S02: Object.freeze([26011, 26012, 26013, 26014]), T02: Object.freeze([26031, 26032, 26033, 26034]) });
export const GROUPS = Object.freeze(["S02", "T02"]);
/** The id of a checkpoint network: s02_26011_900 ... t02_26034_1800. */
export const netId = (g, s, it) => `${g.toLowerCase()}_${s}_${it}`;
export const NET_IDS = Object.freeze(GROUPS.flatMap((g) => SEEDS[g].flatMap((s) => CHECKPOINTS.map((it) => netId(g, s, it)))));
export const LAST_IDS = Object.freeze(GROUPS.flatMap((g) => SEEDS[g].map((s) => netId(g, s, LAST))));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...NET_IDS]);
export const AUDIT_ARMS = Object.freeze(["autopilot", "law0", "c02", "q02", ...LAST_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
const ids = (r) => r.to - r.from + 1;

/** The 32 stored checkpoint networks in the order S02 then T02, seeds in order, checkpoints 900 .. 1800: [{ id, group, seed, iter, weights, stored }]. `rows` = { S02: [H32's four search rows], T02: [H34's four] }. */
export function netsOf(rows) {
    if (!rows || !Array.isArray(rows.S02) || !Array.isArray(rows.T02)) throw new Error("headToHead60.netsOf: rows is { S02: [four search rows], T02: [four search rows] }");
    const out = [];
    for (const g of GROUPS) for (const s of SEEDS[g]) {
        const mine = rows[g].filter((r) => r && r.seed === s);
        if (mine.length !== 1) throw new Error(`headToHead60.netsOf: group ${g} needs one search row for seed ${s}, got ${mine.length}`);
        for (const it of CHECKPOINTS) {
            const k = cpOf(mine[0], it);
            if (!k || !wOk(k.weights) || !Number.isFinite(k.heldScore)) throw new Error(`headToHead60.netsOf: ${g} seed ${s} needs a checkpoint at ${it} of ${WEIGHT_COUNT} finite weights and a finite held-out value`);
            out.push({ id: netId(g, s, it), group: g, seed: s, iter: it, weights: Array.from(k.weights), stored: k.heldScore });
        }
    }
    return out;
}
/** The arms as { id: arm }: `h27` = { laws: [q02] }; `nets` = netsOf's list. */
export function armsOf(h27, nets) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead60.armsOf: h27 is { laws: one 4-weight law }");
    if (!Array.isArray(nets) || nets.length !== 32 || !nets.every((n, i) => n && n.id === NET_IDS[i] && wOk(n.weights))) throw new Error(`headToHead60.armsOf: nets is the 32 checkpoint networks ${NET_IDS[0]} ... ${NET_IDS[31]} of ${WEIGHT_COUNT} finite weights each`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    nets.forEach((n) => { out[n.id] = netArm(n.id, n.weights); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The flights of `arms` (the autopilot and law0 only on the audit): { HA: { dark, lit }, HB: { dark, lit }, AUD: { dark, lit } }. A network is flown on HA and HB (all 32), on the audit only when it is a 1800-iteration network. */
export function fly(h27, nets, { sets = SETS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen } = {}) {
    const all = armsOf(h27, nets), want = [...new Set(arms)];
    for (const a of want) if (!all[a]) throw new Error(`headToHead60.fly: no arm ${a}`);
    const out = { HA: { dark: {}, lit: {} }, HB: { dark: {}, lit: {} }, AUD: { dark: {}, lit: {} } };
    for (const a of want) {
        const isNet = NET_IDS.includes(a), onSets = isNet ? ["HA", "HB"] : [], onAudit = !isNet || LAST_IDS.includes(a);
        for (const k of onSets) { out[k].dark[a] = flyFn(all[a], sets[k], seconds, "dropout"); out[k].lit[a] = flyFn(all[a], sets[k], seconds, null); }
        if (onAudit) { out.AUD.dark[a] = flyFn(all[a], sets.AUD, seconds, "dropout"); out.AUD.lit[a] = flyFn(all[a], sets.AUD, seconds, null); }
    }
    return out;
}
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
/** The flown runs of a set as an object penRunsAt reads: { dark, lit } of that set. */
const setOf = (au, k) => au.flights[k];
/** An arm's mean penalised priced score at 0.02 over the ids of a set (HA, HB or AUD): its held-out value there. */
export const valueOn = (au, k, a) => avg(penRunsAt(setOf(au, k), a, PRICE).map((r) => r.score));
const pen = (au, a, b) => penPair(setOf(au, "AUD"), a, b, PRICE);
/** The stored held-out value of a network (the set 26100-26139, as stored in the search rows). */
export const storedOf = (au, id) => au.nets.find((n) => n.id === id).stored;
/** The value of a network on a set name: HS (stored), HA, HB or AUD. */
export const value = (au, k, id) => (k === "HS" ? storedOf(au, id) : valueOn(au, k, id));
const sv = (xs) => { const m = avg(xs); return xs.reduce((p, q) => p + (q - m) * (q - m), 0) / (xs.length - 1); };
/** The seed that is the best of a group at a checkpoint on a set (the first of a tie in seed order). */
export function pickOn(au, k, g, it) { let b = null; for (const s of SEEDS[g]) { const v = value(au, k, netId(g, s, it)); if (b === null || v > b.v) b = { seed: s, v }; } return b.seed; }
/** The seed that is the audit-best of a group at 1800 (the first of a tie in seed order). */
export const auditBest = (au, g) => pickOn(au, "AUD", g, LAST);
const ranks = (xs) => xs.map((x) => { const lt = xs.filter((y) => y < x).length, eq = xs.filter((y) => y === x).length; return lt + (eq + 1) / 2; });
/** Spearman's rho: the Pearson correlation of the ranks, ties averaged (NaN for a constant list). */
export function spearman(a, b) { const ra = ranks(a), rb = ranks(b), ma = avg(ra), mb = avg(rb); let sab = 0, saa = 0, sbb = 0; ra.forEach((x, i) => { sab += (x - ma) * (rb[i] - mb); saa += (x - ma) ** 2; sbb += (rb[i] - mb) ** 2; }); return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb); }
/** The registered readings: { picks: { [g_it]: { HS, HA, HB } }, equal1800: { HA, HB }, differ: { HA, HB }, rho: { HA, HB }, auditBestIsPick: { HS, HA, HB }, meanAbs: { HA, HB }, meanHA, meanHS }. */
export function readAll(au) {
    const picks = {}; for (const g of GROUPS) for (const it of CHECKPOINTS) picks[g + "_" + it] = { HS: pickOn(au, "HS", g, it), HA: pickOn(au, "HA", g, it), HB: pickOn(au, "HB", g, it) };
    const cnt = (f) => ({ HA: f("HA"), HB: f("HB") });
    const equal1800 = cnt((k) => GROUPS.filter((g) => picks[g + "_" + LAST][k] === picks[g + "_" + LAST].HS).length);
    const differ = cnt((k) => Object.values(picks).filter((p) => p[k] !== p.HS).length);
    const rho = cnt((k) => spearman(LAST_IDS.map((id) => storedOf(au, id)), LAST_IDS.map((id) => valueOn(au, k, id))));
    const auditBestIsPick = { HS: GROUPS.filter((g) => auditBest(au, g) === picks[g + "_" + LAST].HS).length, HA: GROUPS.filter((g) => auditBest(au, g) === picks[g + "_" + LAST].HA).length, HB: GROUPS.filter((g) => auditBest(au, g) === picks[g + "_" + LAST].HB).length };
    const meanAbs = cnt((k) => avg(LAST_IDS.map((id) => Math.abs(valueOn(au, k, id) - valueOn(au, "AUD", id)))));
    return { picks, equal1800, differ, rho, auditBestIsPick, meanAbs, meanHA: avg(LAST_IDS.map((id) => valueOn(au, "HA", id))), meanHS: avg(LAST_IDS.map((id) => storedOf(au, id))) };
}
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const R = readAll(au), p = (g) => R.picks[g + "_" + LAST], rho = (x) => (Number.isFinite(x) ? x.toFixed(2) : "NaN");
    return [`S02 PICK AT 1800: STORED ${p("S02").HS}, HA ${p("S02").HA}, HB ${p("S02").HB}`, `T02 PICK AT 1800: STORED ${p("T02").HS}, HA ${p("T02").HA}, HB ${p("T02").HB}`,
        `PICKS AT 1800 EQUAL TO THE STORED: HA ${R.equal1800.HA} OF 2, HB ${R.equal1800.HB} OF 2`, `PICKS DIFFERENT FROM THE STORED OVER THE EIGHT GROUP-CHECKPOINTS: HA ${R.differ.HA} OF 8, HB ${R.differ.HB} OF 8`,
        `RANK CORRELATION WITH THE STORED HELD-OUT VALUES OVER THE EIGHT 1800 NETWORKS: HA ${rho(R.rho.HA)}, HB ${rho(R.rho.HB)}`,
        `AUDIT-BEST OF A GROUP IS THE PICK: STORED ${R.auditBestIsPick.HS} OF 2, HA ${R.auditBestIsPick.HA} OF 2, HB ${R.auditBestIsPick.HB} OF 2`,
        `HB IS CLOSER TO THE AUDIT THAN HA: ${R.meanAbs.HB < R.meanAbs.HA ? "YES" : "NO"}`, `HA IS HARDER THAN THE STORED SET: ${R.meanHA < R.meanHS ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.flights.AUD.dark[a].map((r) => r.thrust));
export function bottomLines(au) {
    const R = readAll(au), arm = (a) => `${a} ${scoreMean(setOf(au, "AUD"), a, "dark").toFixed(4)} / ${scoreMean(setOf(au, "AUD"), a, "lit").toFixed(4)}, ${kwOf(setOf(au, "AUD"), a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const shown = ["c02", "q02", ...LAST_IDS];
    const sets = `SETS: HS (stored) ids ${SETS.HS.from}-${SETS.HS.to} (${ids(SETS.HS)}), HA ids ${SETS.HA.from}-${SETS.HA.to} (${ids(SETS.HA)}), HB ids ${SETS.HB.from}-${SETS.HB.to} (${ids(SETS.HB)}), audit ids ${SETS.AUD.from}-${SETS.AUD.to} (${ids(SETS.AUD)})`;
    const svh = NET_IDS.map((id) => `${id} ${storedOf(au, id).toFixed(4)} / ${valueOn(au, "HA", id).toFixed(4)} / ${valueOn(au, "HB", id).toFixed(4)}`).join("; ");
    const picks = Object.entries(R.picks).map(([k, v]) => `${k.toUpperCase().replace("_", " ")}: stored ${v.HS}, HA ${v.HA}, HB ${v.HB}`).join("; ");
    const lostIds = AUDIT_ARMS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au.flights.AUD[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const paired = LAST_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`).join("; ");
    const ranks_ = `RANKS: Spearman with the stored values over the eight 1800 networks HA ${R.rho.HA.toFixed(2)}, HB ${R.rho.HB.toFixed(2)}; mean absolute difference from the audit means HA ${R.meanAbs.HA.toFixed(4)}, HB ${R.meanAbs.HB.toFixed(4)}`;
    const rep = `means over the eight 1800 networks: stored ${R.meanHS.toFixed(4)}, HA ${R.meanHA.toFixed(4)}, HB ${avg(LAST_IDS.map((id) => valueOn(au, "HB", id))).toFixed(4)}, audit ${avg(LAST_IDS.map((id) => valueOn(au, "AUD", id))).toFixed(4)}; extra power ${shown.map((a) => `${a} ${f2(extraPower(setOf(au, "AUD"), a))}`).join(", ")}`;
    return [sets, `STORED VS HA VS HB (held-out value at 0.02 of each checkpoint network): ${svh}`, `PICKS (per group and checkpoint): ${picks}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${["autopilot", ...shown].map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${AUDIT_ARMS.slice(1).map((a) => `${a} ${lostBoth(setOf(au, "AUD"), a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `PAIRED (penalised priced score at 0.02, the audit): ${paired}`, ranks_, `VERDICT: ${verdictOf(au)}`, `REPORTED, NOT IN THE VERDICT: ${rep}`];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
export function checksOf(au) {
    const rows = [], F = au.flights, cond = ["dark", "lit"];
    const expect = (k) => (k === "AUD" ? AUDIT_ARMS : NET_IDS);
    const sizes = !!F && ["HA", "HB", "AUD"].every((k) => F[k] && cond.every((q) => F[k][q] && expect(k).every((a) => F[k][q][a] && F[k][q][a].length === ids(SETS[k])) && Object.keys(F[k][q]).length === expect(k).length));
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew its ids in both conditions (the 32 networks on HA's 40 and HB's 200, the 12 audit arms on 200): ${sizes}` });
    const aligned = sizes && ["HA", "HB", "AUD"].every((k) => cond.every((q) => expect(k).every((a) => F[k][q][a].every((r, i) => r.key === F[k].dark[expect(k)[0]][i].key))));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids are the same in every arm and condition of a set: ${aligned}` });
    const inside = sizes && ["HA", "HB", "AUD"].every((k) => cond.every((q) => expect(k).every((a) => F[k][q][a].every((r) => r.score > 0 && r.score < 1))));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = sizes && ["HA", "HB", "AUD"].every((k) => cond.every((q) => expect(k).every((a) => F[k][q][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)))));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!F && !!F.AUD.dark.autopilot && F.AUD.dark.autopilot.some((r, i) => r.score !== F.AUD.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one audit id: ${event}` });
    const ident = !!F && cond.every((q) => F.AUD[q].law0 && F.AUD[q].law0.every((r, i) => F.AUD[q].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - F.AUD[q].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every audit id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.nets) && ref.length === 32 && ref.every((r, i) => au.nets[i] && au.nets[i].id === r.id && au.nets[i].stored === r.stored && J(Array.from(au.nets[i].weights)) === J(r.weights)); } catch (e) { return false; } })();
    rows.push({ name: "THE 32 NETWORKS ARE THE STORED CHECKPOINT WEIGHTS", ok: !!stored, text: `the 32 networks are the weights at 900, 1200, 1500 and 1800 of H32's seeds 26011-26014 and H34's seeds 26031-26034 (963 finite weights each, every group all four seeds at all four checkpoints), read again from the stored search rows: ${!!stored}` });
    const finiteSt = !!stored && au.nets.every((n) => Number.isFinite(n.stored));
    rows.push({ name: "THE STORED HELD-OUT VALUES ARE READ FROM THE SAME ROWS", ok: finiteSt, text: `each network's stored held-out value (the set 26100-26139) is the finite heldScore of the same checkpoint in the same row: ${finiteSt}` });
    const sets = J(SETS.HS) === '{"from":26100,"to":26139}' && J(SETS.HA) === '{"from":81000,"to":81039}' && J(SETS.HB) === '{"from":81100,"to":81299}' && J(SETS.AUD) === '{"from":81400,"to":81599}';
    const dj = sets && ["HA", "HB", "AUD"].every((a, i, arr) => [...TRAIN, SETS.HS, { from: 50000, to: 50071 }, { from: 52000, to: 52299 }, { from: 53000, to: 53799 }, ...arr.filter((b) => b !== a).map((b) => SETS[b])].every((q) => disjoint(q, SETS[a])) && SETS[a].from > 80399);
    rows.push({ name: "THE SETS ARE AS REGISTERED AND DISJOINT, PAST EVERY EARLIER AUDIT", ok: dj, text: `HA is 81000-81039, HB 81100-81299 and the audit 81400-81599; they do not overlap one another, the stored set 26100-26139, the train ids 26000-26023 and 30000-30047, 50000-50071, 52000-52299 or 53000-53799, and start after 80399: ${dj}` });
    const pk = (() => { try { return GROUPS.every((g) => CHECKPOINTS.every((it) => ["HS", "HA", "HB"].every((k) => { const p = pickOn(au, k, g, it), vs = SEEDS[g].map((s) => value(au, k, netId(g, s, it))); return value(au, k, netId(g, p, it)) === Math.max(...vs) && SEEDS[g].find((s) => value(au, k, netId(g, s, it)) === Math.max(...vs)) === p; }))); } catch (e) { return false; } })();
    rows.push({ name: "A PICK IS THE BEST HELD-OUT VALUE OF ITS GROUP ON ITS SET", ok: !!(stored && sizes && pk), text: `the pick of each group at each checkpoint on the stored set, HA and HB is the seed with the largest held-out value, the first of a tie in seed order: ${!!(stored && sizes && pk)}` });
    const rec = (() => { try { return NET_IDS.every((a) => ["HA", "HB"].every((k) => { const v = penRunsAt(F[k], a, PRICE); return v.length === ids(SETS[k]) && v.every((s, i) => { const r = F[k].dark[a][i], l = F[k].lit[a][i]; return Math.abs(s.score - (0.5 * ((r.bad ? 0 : r.score) + (l.bad ? 0 : l.score)) - 0.02 * 0.5 * (r.watts + l.watts) / 1000)) < 1e-12; }); })); } catch (e) { return false; } })();
    rows.push({ name: "THE HA AND HB VALUES ARE THE OBJECTIVE RECOMPUTED FROM THE RAW RUNS", ok: !!rec, text: `every network's per-id penalised priced score on HA and HB equals 0.5 x (dark' + lit') - 0.02 x 0.5 x (dark kW + lit kW), a lost run scoring 0, recomputed here from the raw runs, to 1e-12: ${!!rec}` });
    const o = au.original, k = au.h27;
    const reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const same = (() => { try { const h51 = X51.netsOf(au.rows); return stored && h51.length === 8 && h51.every((n) => { const m = au.nets.find((q) => q.id === netId(n.group, n.seed, LAST)); return m && m.stored === n.stored && J(m.weights) === J(Array.from(n.weights)); }); } catch (e) { return false; } })();
    rows.push({ name: "THE 1800 NETWORKS ARE THE ONES H44 AND H51 READ", ok: !!same, text: `the eight 1800-iteration networks and their stored held-out values equal what H51's library reads from the same rows: ${!!same}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H60: a different held-out set for the searches that exist (the 32 stored checkpoint networks of H32's and H34's eight searches re-scored on HA, ids 81000-81039, and HB, ids 81100-81299; the eight 1800 networks audited on ids 81400-81599). ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("audit means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of AUDIT_ARMS) R.push(`  ${a.padEnd(15)} ${scoreMean(setOf(au, "AUD"), a, "dark").toFixed(4)} / ${scoreMean(setOf(au, "AUD"), a, "lit").toFixed(4)}   ${kwOf(setOf(au, "AUD"), a).toFixed(2)}   ${kwOf(setOf(au, "AUD"), a, "lit").toFixed(2)}   ${lostBoth(setOf(au, "AUD"), a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.005 / 0.02 / 0.04 (the audit):`);
    for (const a of AUDIT_ARMS.slice(1)) R.push(`  ${a.padEnd(15)} ${f4(gainOf(setOf(au, "AUD"), a))} / ${f4(gainOf(setOf(au, "AUD"), a, "lit"))}  ${f3(extraKw(setOf(au, "AUD"), a))} / ${f3(extraKw(setOf(au, "AUD"), a, "lit"))}  ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(setOf(au, "AUD"), a, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
