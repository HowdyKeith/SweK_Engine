// WebGLEngine/tools/ship/headToHead46.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead46Cmd.mjs; the gate is tools/ship/headToHead46-selfcheck.mjs)
//
// ROUND H46 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT AUDIT SET SIZE. NO new search. The eight stored 1800-iteration networks (H32's S02 seeds 26011-26014 and H34's T02 seeds 26031-26034) with c02, q02, the autopilot and law0 are flown ONCE on 800 fresh ids (46200-46999),
// and the same flights are read on consecutive blocks of 50, 100, 200, 400 and 800 ids: the switchboard's paired reading of each network against c02 at 0.02 on a block, its agreement with the 800-id reading, the standard errors, and the order of two networks on a block against their order on 800.
// Reads and writes nothing itself (the command hands in the stored rows and H27's search).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 46200, to: 46999 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02, N_IDS_COUNT = 800;
export const SEEDS = Object.freeze({ S02: Object.freeze([26011, 26012, 26013, 26014]), T02: Object.freeze([26031, 26032, 26033, 26034]) });
export const NET_IDS = Object.freeze([...SEEDS.S02.map((s) => "s02_" + s), ...SEEDS.T02.map((s) => "t02_" + s)]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...NET_IDS]);
export const SIZES = Object.freeze([50, 100, 200, 400, 800]), SMALL_SIZES = Object.freeze([50, 100, 200, 400]);
export const LAST = X32.CHECKPOINTS[X32.CHECKPOINTS.length - 1];
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The eight stored 1800-iteration networks in the order s02_26011 ... s02_26014, t02_26031 ... t02_26034: [{ id, group, seed, weights, stored }]. `rows` = { S02: [H32's four search rows], T02: [H34's four] }. */
export function netsOf(rows) {
    if (!rows || !Array.isArray(rows.S02) || !Array.isArray(rows.T02)) throw new Error("headToHead46.netsOf: rows is { S02: [four search rows], T02: [four search rows] }");
    const out = [];
    for (const g of ["S02", "T02"]) for (const s of SEEDS[g]) {
        const mine = rows[g].filter((r) => r && r.seed === s);
        if (mine.length !== 1) throw new Error(`headToHead46.netsOf: group ${g} needs one search row for seed ${s}, got ${mine.length}`);
        const k = cpOf(mine[0], LAST);
        if (!k || !wOk(k.weights) || !Number.isFinite(k.heldScore)) throw new Error(`headToHead46.netsOf: ${g} seed ${s} needs a checkpoint at ${LAST} of ${WEIGHT_COUNT} finite weights and a finite held-out value`);
        out.push({ id: g.toLowerCase() + "_" + s, group: g, seed: s, weights: Array.from(k.weights), stored: k.heldScore });
    }
    return out;
}
/** The 12 arms as { id: arm }: `h27` = { laws: [q02] }; `nets` = the eight networks (netsOf's order). */
export function armsOf(h27, nets) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead46.armsOf: h27 is { laws: one 4-weight law }");
    if (!Array.isArray(nets) || nets.length !== 8 || !nets.every((n, i) => n && n.id === NET_IDS[i] && wOk(n.weights))) throw new Error(`headToHead46.armsOf: nets is the eight networks ${NET_IDS.join(", ")} of ${WEIGHT_COUNT} finite weights each`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    nets.forEach((n) => { out[n.id] = netArm(n.id, n.weights); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 12; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(h27, nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, wip = null, original = null, rows = null, fixture = null, means = null } = {}) {
    const all = armsOf(h27, nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead46.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, h27, nets, wip, original, rows, fixture, means, c02: all.c02.entry().weights };
}
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
/** An arm's mean penalised priced score at a price (default 0.02) over all the audit ids. */
export const penMean = (au, a, p = PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
/** The flights cut to the ids i0 .. i1 - 1 (offsets from the first audit id): { dark, lit } of the arms. */
export function sliceAu(au, i0, i1) {
    if (!Number.isInteger(i0) || !Number.isInteger(i1) || i0 < 0 || i1 <= i0 || i1 > au.dark.autopilot.length) throw new Error(`headToHead46.sliceAu: ids ${J(i0)} to ${J(i1)} are not a block of the ${au.dark.autopilot.length} audit ids`);
    const cut = (o) => Object.fromEntries(Object.keys(o).map((a) => [a, o[a].slice(i0, i1)]));
    return { dark: cut(au.dark), lit: cut(au.lit) };
}
/** The consecutive blocks of n ids of the 800: [[i0, i1], ...] (800 / n of them); refuses a size that does not divide 800 or is not one of the sizes. */
export function blocks(n, total = N_IDS_COUNT) {
    if (!SIZES.includes(n) || total % n !== 0) throw new Error(`headToHead46.blocks: n must be one of ${SIZES.join(", ")} and divide ${total}, got ${J(n)}`);
    return Array.from({ length: total / n }, (_, k) => [k * n, (k + 1) * n]);
}
/** The switchboard's paired reading of arm a against arm b at 0.02 on ids i0 .. i1 - 1: { n, mean, se, better, worse, same, reading } (BETTER / WORSE / TIES). */
export const readBlock = (au, a, b, i0, i1) => penPair(sliceAu(au, i0, i1), a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 on ids i0 .. i1 - 1. */
export const meanBlock = (au, a, i0, i1) => avg(penRunsAt(sliceAu(au, i0, i1), a, PRICE).map((r) => r.score));
/** The agreement of the readings of the eight networks against c02 with the 800-id reading: { full: [8 readings], agree: { n: count }, total: { n: count }, perNet: { n: [8 counts] }, allAgree: [n...] }. */
export function agreement(au) {
    const full = NET_IDS.map((a) => readBlock(au, a, "c02", 0, 800).reading), agree = {}, total = {}, perNet = {};
    for (const n of SMALL_SIZES) { const bs = blocks(n); perNet[n] = NET_IDS.map((a, i) => bs.filter(([i0, i1]) => readBlock(au, a, "c02", i0, i1).reading === full[i]).length); agree[n] = perNet[n].reduce((p, q) => p + q, 0); total[n] = bs.length * 8; }
    return { full, agree, total, perNet, allAgree: SMALL_SIZES.filter((n) => perNet[n].every((c) => c === blocks(n).length)) };
}
/** The mean standard error of the pairing against c02 over the eight networks and the blocks, per size (50 to 800). */
export function seBySize(au) { return Object.fromEntries(SIZES.map((n) => [n, avg(blocks(n).flatMap(([i0, i1]) => NET_IDS.map((a) => readBlock(au, a, "c02", i0, i1).se)))])); }
/** The agreement of the orders of the 28 pairs of the eight networks (by mean score on a block, a tie is a disagreement) with their orders on 800: { agree: { n }, total: { n } }. */
export function orders(au) {
    const m800 = NET_IDS.map((a) => meanBlock(au, a, 0, 800)), agree = {}, total = {};
    for (const n of SMALL_SIZES) { let c = 0, t = 0; for (const [i0, i1] of blocks(n)) { const mb = NET_IDS.map((a) => meanBlock(au, a, i0, i1)); for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { t++; if (mb[i] !== mb[j] && (mb[i] > mb[j]) === (m800[i] > m800[j])) c++; } } agree[n] = c; total[n] = t; }
    return { agree, total, m800 };
}
/** The best of the eight on 800 (the first on a tie) and, for a block size, the best of each block: { best, byBlock }. */
export function bestOf(au, n = 200) {
    const pick = (i0, i1) => { let b = null; NET_IDS.forEach((a) => { const v = meanBlock(au, a, i0, i1); if (b === null || v > b.v) b = { a, v }; }); return b.a; };
    return { best: pick(0, 800), byBlock: blocks(n).map(([i0, i1]) => pick(i0, i1)) };
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), v4 = (x) => x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
/** The registered verdict, eight parts joined by "; ". */
export function verdictOf(au) {
    const ag = agreement(au), se = seBySize(au), od = orders(au), bo = bestOf(au, 200), cnt = (w) => ag.full.filter((r) => r === w).length, lost = NET_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`);
    const ratio = se[50] / se[800], within = Math.abs(ratio / 4 - 1) <= 0.2;
    return [`AT 800 IDS AGAINST C02: ${cnt("BETTER")} BEATS, ${cnt("WORSE")} IS BEHIND, ${cnt("TIES")} TIES`, `READINGS THAT AGREE WITH THE 800-ID READING: ${SMALL_SIZES.map((n) => `${n} ${ag.agree[n]} OF ${ag.total[n]}`).join(", ")}`,
        `EVERY BLOCK AGREES FOR ALL EIGHT AT: ${ag.allAgree.length ? ag.allAgree[0] : "NONE"}`, `MEAN SE OF A PAIRING AGAINST C02: ${SIZES.map((n) => `${n} ${v4(se[n])}`).join(", ")}`, `PAIR ORDERS THAT AGREE WITH 800: ${SMALL_SIZES.map((n) => `${n} ${od.agree[n]} OF ${od.total[n]}`).join(", ")}`,
        `BEST OF THE EIGHT ON 800: ${bo.best}; BLOCKS OF 200 THAT NAME IT: ${bo.byBlock.filter((a) => a === bo.best).length} OF 4`, `SE FALLS AS ONE OVER THE SQUARE ROOT OF N WITHIN 20 PERCENT: ${within ? "YES" : "NO"}`, `LOST SUBS IN THE EIGHT: ${lost.length ? lost.join(", ") : "NONE"}`].join("; ");
}
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...NET_IDS], arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const ag = agreement(au), se = seBySize(au), od = orders(au), b200 = bestOf(au, 200), b400 = bestOf(au, 400);
    const read800 = NET_IDS.map((a) => `${a} minus c02 ${fmt(readBlock(au, a, "c02", 0, 800))}; ${a} minus q02 ${fmt(readBlock(au, a, "q02", 0, 800))}`).join("; ");
    const agr = SMALL_SIZES.map((n) => `${n} ids (${blocks(n).length} blocks): ${NET_IDS.map((a, i) => `${a} ${ag.perNet[n][i]}`).join(", ")}`).join("; ");
    const seL = SIZES.map((n) => `${n} ${v4(se[n])}`).join(", "), ord = SMALL_SIZES.map((n) => `${n} ${od.agree[n]} OF ${od.total[n]} (${(100 * od.agree[n] / od.total[n]).toFixed(1)} percent)`).join(", ");
    const best = `on 800 ${bestOf(au, 800).best}; by blocks of 200: ${b200.byBlock.join(", ")}; by blocks of 400: ${b400.byBlock.join(", ")}`;
    const means = NET_IDS.map((a) => `${a} ${v4(penMean(au, a))}`).join(", ");
    const range = SIZES.map((n) => { const mb = blocks(n).map(([i0, i1]) => meanBlock(au, bestOf(au, 800).best, i0, i1)); return `${n} ${v4(Math.min(...mb))} to ${v4(Math.max(...mb))}`; }).join(", ");
    const worse = (() => { let tw = 0, wt = 0, nt = 0, nw = 0; for (const n of SMALL_SIZES) for (const [i0, i1] of blocks(n)) NET_IDS.forEach((a, i) => { const r = readBlock(au, a, "c02", i0, i1).reading; if (ag.full[i] === "TIES") { nt++; if (r === "WORSE") tw++; } if (ag.full[i] === "WORSE") { nw++; if (r === "TIES") wt++; } }); return `block readings WORSE where the 800-id reading is TIES ${tw} OF ${nt}; block readings TIES where it is WORSE ${wt} OF ${nw}`; })();
    return [
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust, on 800 ids): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 1600): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `READINGS AT 800 (penalised priced score at 0.02): ${read800}`, `AGREEMENT (blocks whose reading against c02 equals the 800-id reading, per network): ${agr}`, `SE BY SIZE (mean se of a pairing against c02): ${seL}`, `ORDERS (pair orders that agree with 800): ${ord}`, `BEST: ${best}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: the mean audit values on 800 ${means}; the smallest to the largest block mean of the best network by block size: ${range}; ${worse}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
/** The paired reading on all ids by the registered rule written out: the mean of the per-id differences, their standard error (n - 1) and the 2 se rule, for the penalised priced score at 0.02. */
export function readingByHand(au, a, b) {
    const sc = (x, i) => 0.5 * ((au.dark[x][i].bad ? 0 : au.dark[x][i].score) + (au.lit[x][i].bad ? 0 : au.lit[x][i].score)) - PRICE * 0.5 * (au.dark[x][i].watts + au.lit[x][i].watts) / 1000;
    const n = au.dark[a].length, d = Array.from({ length: n }, (_, i) => sc(a, i) - sc(b, i)), m = avg(d), se = Math.sqrt(d.reduce((p, q) => p + (q - m) * (q - m), 0) / (n - 1) / n);
    return { mean: m, se, reading: Math.abs(m) <= 1e-9 ? "TIES" : m > 0 && m > 2 * se ? "BETTER" : m < 0 && -m > 2 * se ? "WORSE" : "TIES" };
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((q) => ARM_IDS.map((a) => [q, a]));
    const sizes = n === 800 && cells.every(([q, a]) => au[q][a] && au[q][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew 800 ids (${n}) in both conditions: ${sizes}` });
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
    const o = au.original, k = au.h27, regc = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!regc}` });
    const tr = [...X32.TRAIN, X32.HELD, { from: 50000, to: 50071 }, { from: 52000, to: 52039 }, { from: 52100, to: 52299 }, { from: 60000, to: 60023 }, { from: 61000, to: 61047 }], dj = tr.every((t) => disjoint(t, au.range)) && au.range.from > 45399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the train ids (26000-26023, 30000-30047, 50000-50071, 60000-60023, 61000-61047), the held-out sets (26100-26139, 52000-52039, 52100-52299), and start after H45's audit (45399): ${dj}` });
    const part = (() => { try { return SIZES.every((m) => { const bs = blocks(m), seen = new Array(800).fill(0); bs.forEach(([i0, i1]) => { for (let i = i0; i < i1; i++) seen[i]++; }); return bs.length === 800 / m && bs.every(([i0, i1]) => i1 - i0 === m) && seen.every((c) => c === 1); }) && J(SIZES.map((m) => blocks(m).length)) === "[16,8,4,2,1]"; } catch (e) { return false; } })();
    rows.push({ name: "THE BLOCKS OF EVERY SIZE PARTITION THE 800 IDS", ok: part, text: `the blocks of 50, 100, 200, 400 and 800 ids number 16, 8, 4, 2 and 1, each of that size, and every id is in exactly one block of each size: ${part}` });
    const full = (() => { try { return NET_IDS.every((a) => ["c02", "q02"].every((b) => { const p = readBlock(au, a, b, 0, 800), h = readingByHand(au, a, b); return near(p.mean, h.mean) && near(p.se, h.se) && p.reading === h.reading; })); } catch (e) { return false; } })();
    rows.push({ name: "THE 800-ID READINGS ARE THE SWITCHBOARD'S OWN AND EQUAL THE RULE WRITTEN OUT", ok: full, text: `each network's reading against c02 and q02 on all 800 ids equals the registered rule (the mean of the per-id differences of the penalised priced score at 0.02, the 2 se rule) written out again from the raw runs, in mean, se and reading: ${full}` });
    const m = au.means, means = (() => { try { return !!m && NET_IDS.every((a) => Number.isFinite(m[a]) && Math.abs(m[a] - penMean(au, a)) < 1e-12) && ["c02", "q02"].every((a) => Math.abs(m[a] - penMean(au, a)) < 1e-12); } catch (e) { return false; } })();
    rows.push({ name: "THE AUDIT MEANS ARE RECOMPUTED FROM THE RUNS", ok: !!means, text: `the audit mean at 0.02 of each of the eight networks, c02 and q02 recomputed in the command from the raw runs equals the library's to 1e-12: ${!!means}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H46: a different audit set size (the eight stored 1800-iteration networks of H32 and H34 flown once on 800 ids, read on blocks of 50 to 800; no search). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means on 800 ids (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 1600):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.005 / 0.02 / 0.04:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(au, a, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
