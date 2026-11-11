// WebGLEngine/tools/ship/headToHead48.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead48Cmd.mjs; the gate is tools/ship/headToHead48-selfcheck.mjs)
//
// ROUND H48 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT HELD-OUT SET -- TWENTY OF THEM. NO new search. The eight stored 1800-iteration networks (H32's S02 seeds 26011-26014, H34's T02 seeds 26031-26034) and the autopilot are flown ONCE on 800 fresh
// ids (53000-53799); the 800 ids are twenty disjoint 40-id held-out sets (HC_k = 53000+40k .. 53039+40k). For each group of four the pick of a 40-id set (the best mean penalised priced score at 0.02, the first on a tie in seed order, H32's rule) is compared with the pick on all 800.
// Reads and writes nothing itself (the command hands in the stored rows).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 53000, to: 53799 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, PRICE = 0.02, N_IDS_COUNT = 800, SET_SIZE = 40, N_SETS = 20;
export const SEEDS = Object.freeze({ S02: Object.freeze([26011, 26012, 26013, 26014]), T02: Object.freeze([26031, 26032, 26033, 26034]) });
export const NET_IDS = Object.freeze([...SEEDS.S02.map((s) => "s02_" + s), ...SEEDS.T02.map((s) => "t02_" + s)]);
export const ARM_IDS = Object.freeze(["autopilot", ...NET_IDS]);
export const GROUPS = Object.freeze({ S02: Object.freeze(NET_IDS.slice(0, 4)), T02: Object.freeze(NET_IDS.slice(4)) });
export const H42_HB = Object.freeze({ S02: "s02_26011", T02: "t02_26032" });
export const LAST = X32.CHECKPOINTS[X32.CHECKPOINTS.length - 1];
export const netArm = X27.netArm, flyPen = X32.flyPen;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The twenty held-out sets as [[i0, i1], ...] offsets from the first audit id (40 ids each, consecutive). */
export const SETS = Object.freeze(Array.from({ length: N_SETS }, (_, k) => Object.freeze([k * SET_SIZE, (k + 1) * SET_SIZE])));
/** The id range of set k: { from, to }. */
export const setRange = (k) => { if (!Number.isInteger(k) || k < 0 || k >= N_SETS) throw new Error(`headToHead48.setRange: k is 0 to ${N_SETS - 1}, got ${J(k)}`); return { from: IDS.from + SET_SIZE * k, to: IDS.from + SET_SIZE * k + SET_SIZE - 1 }; };
/** The eight stored 1800-iteration networks in the order s02_26011 ... t02_26034: [{ id, group, seed, weights, stored }]. `rows` = { S02: [H32's four search rows], T02: [H34's four] }. */
export function netsOf(rows) {
    if (!rows || !Array.isArray(rows.S02) || !Array.isArray(rows.T02)) throw new Error("headToHead48.netsOf: rows is { S02: [four search rows], T02: [four search rows] }");
    const out = [];
    for (const g of ["S02", "T02"]) for (const s of SEEDS[g]) {
        const mine = rows[g].filter((r) => r && r.seed === s);
        if (mine.length !== 1) throw new Error(`headToHead48.netsOf: group ${g} needs one search row for seed ${s}, got ${mine.length}`);
        const k = cpOf(mine[0], LAST);
        if (!k || !wOk(k.weights) || !Number.isFinite(k.heldScore)) throw new Error(`headToHead48.netsOf: ${g} seed ${s} needs a checkpoint at ${LAST} of ${WEIGHT_COUNT} finite weights and a finite held-out value`);
        out.push({ id: g.toLowerCase() + "_" + s, group: g, seed: s, weights: Array.from(k.weights), stored: k.heldScore });
    }
    return out;
}
/** The 9 arms as { id: arm }: the autopilot and the eight networks (netsOf's order). */
export function armsOf(nets) {
    if (!Array.isArray(nets) || nets.length !== 8 || !nets.every((n, i) => n && n.id === NET_IDS[i] && wOk(n.weights))) throw new Error(`headToHead48.armsOf: nets is the eight networks ${NET_IDS.join(", ")} of ${WEIGHT_COUNT} finite weights each`);
    const out = { autopilot: B.flyingArms({})[0] };
    nets.forEach((n) => { out[n.id] = netArm(n.id, n.weights); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 9; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, rows = null, fixture = null, means = null } = {}) {
    const all = armsOf(nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead48.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets, rows, fixture, means };
}
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf;
export const penGainAt = X27.penGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
/** The per-id penalised priced score at 0.02 of an arm (a lost run scores 0). */
export const perId = (au, a) => penRunsAt(au, a, PRICE).map((r) => r.score);
/** The mean of the per-id scores of an arm over the ids i0 .. i1 - 1. */
export function meanOn(au, a, i0, i1) {
    const v = perId(au, a);
    if (!Number.isInteger(i0) || !Number.isInteger(i1) || i0 < 0 || i1 <= i0 || i1 > v.length) throw new Error(`headToHead48.meanOn: ids ${J(i0)} to ${J(i1)} are not a block of the ${v.length} audit ids`);
    return avg(v.slice(i0, i1));
}
/** The pick of a group on ids i0 .. i1 - 1: { pick, means: [four], best, second } (the best mean; the first on a tie in the group's seed order). */
export function pickOn(au, group, i0, i1) {
    const ids = GROUPS[group]; if (!ids) throw new Error(`headToHead48.pickOn: group is S02 or T02, got ${J(group)}`);
    const means = ids.map((a) => meanOn(au, a, i0, i1)); let b = 0; means.forEach((m, i) => { if (m > means[b]) b = i; });
    const rest = means.filter((m, i) => i !== b);
    return { pick: ids[b], means, best: means[b], second: Math.max(...rest), tie: rest.some((m) => m === means[b]) };
}
/** The worst of a group's four on ids i0 .. i1 - 1 (the first on a tie). */
export function worstOn(au, group, i0, i1) { const ids = GROUPS[group]; if (!ids) throw new Error(`headToHead48.worstOn: group is S02 or T02, got ${J(group)}`); const means = ids.map((a) => meanOn(au, a, i0, i1)); let w = 0; means.forEach((m, i) => { if (m < means[w]) w = i; }); return ids[w]; }
const sd = (xs) => { const m = avg(xs); return Math.sqrt(xs.reduce((p, q) => p + (q - m) * (q - m), 0) / (xs.length - 1)); };
const ranks = (xs) => xs.map((x) => { const lt = xs.filter((y) => y < x).length, eq = xs.filter((y) => y === x).length; return lt + (eq + 1) / 2; });
/** Pearson correlation of the ranks (ties averaged) of two lists of four. */
export function rankCorr(a, b) { const ra = ranks(a), rb = ranks(b), ma = avg(ra), mb = avg(rb); let sab = 0, saa = 0, sbb = 0; ra.forEach((x, i) => { sab += (x - ma) * (rb[i] - mb); saa += (x - ma) ** 2; sbb += (rb[i] - mb) ** 2; }); return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb); }
/** Everything the verdict reads, per group: { full, perSet: [{ pick, margin, own, on800, tie, worst, corr }], agree, gap, curse, worst, ties, se }. */
export function readGroup(au, group) {
    const full = pickOn(au, group, 0, N_IDS_COUNT), worst800 = worstOn(au, group, 0, N_IDS_COUNT), fullMeans = full.means;
    const perSet = SETS.map(([i0, i1]) => { const s = pickOn(au, group, i0, i1), pi = GROUPS[group].indexOf(s.pick); return { pick: s.pick, margin: s.best - s.second, own: s.best, on800: fullMeans[pi], tie: s.tie, corr: rankCorr(s.means, fullMeans), same: s.pick === full.pick }; });
    const bestId = full.pick, secondId = GROUPS[group].filter((a) => a !== bestId).reduce((p, q) => (meanOn(au, q, 0, 800) > meanOn(au, p, 0, 800) ? q : p));
    const diffs = SETS.map(([i0, i1]) => avg(perId(au, bestId).slice(i0, i1).map((v, i) => v - perId(au, secondId)[i0 + i])));
    return { full, perSet, agree: perSet.filter((s) => s.same).length, gap: full.best - full.second, curse: avg(perSet.map((s) => s.own - s.on800)), worstPicks: perSet.filter((s) => s.pick === worst800).length, ties: perSet.filter((s) => s.tie).length, se: sd(diffs), second: secondId, corr: avg(perSet.map((s) => s.corr).filter(Number.isFinite)) };
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), v4 = (x) => x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const seedOf = (id) => id.split("_")[1];
/** The registered verdict, seven parts joined by "; " (parts A, B, C hold a "; " inside). */
export function verdictOf(au) {
    const S = readGroup(au, "S02"), T = readGroup(au, "T02"), same = S.full.pick === H42_HB.S02 && T.full.pick === H42_HB.T02;
    return [`S02 20 SETS AGREE WITH 800: ${S.agree} OF 20; T02 20 SETS AGREE WITH 800: ${T.agree} OF 20`, `800-ID PICKS: S02 ${seedOf(S.full.pick)}, T02 ${seedOf(T.full.pick)}; SAME AS H42'S HB: ${same ? "YES" : "NO"}`,
        `800-ID GAP (BEST MINUS SECOND): S02 ${v4(S.gap)}, T02 ${v4(T.gap)}; AGREEMENT: S02 ${S.agree}, T02 ${T.agree}`, `WINNER'S CURSE: S02 mean (own-set value minus 800-id value of the picked network) ${f4(S.curse)}, T02 ${f4(T.curse)}`,
        `SETS THAT PICK THE WORST OF THEIR FOUR ON 800: S02 ${S.worstPicks}, T02 ${T.worstPicks}`, `SETS WITH A TIE AT THE BEST: ${S.ties + T.ties}`, `SE OF A 40-ID SET'S MEAN DIFFERENCE BETWEEN THE BEST TWO ON 800: S02 ${v4(S.se)}, T02 ${v4(T.se)}`].join("; ");
}
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
export function bottomLines(au) {
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const G = { S02: readGroup(au, "S02"), T02: readGroup(au, "T02") };
    const per = (g) => G[g].perSet.map((s, k) => `${k}:${seedOf(s.pick)}${s.same ? "" : "*"} ${v4(s.margin)}`).join(", ");
    return [
        `SETS: twenty held-out sets HC_0 to HC_19 of 40 ids, ids ${IDS.from}-${IDS.to}, set k = ${IDS.from}+40k to ${IDS.from}+40k+39`,
        `MEANS ON 800 (dark / lit mean score, dark mean power, mean dark thrust; penalised priced score at 0.02): ${ARM_IDS.map((a) => `${arm(a)} pen ${v4(a === "autopilot" ? avg(perId(au, a)) : avg(perId(au, a)))}`).join("; ")}`,
        `LOST (runs lost of 1600): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `PICKS PER SET (set: seed picked, * where it differs from the 800-id pick, and the margin of the best over the second on that set): S02 800-id pick ${seedOf(G.S02.full.pick)}: ${per("S02")}; T02 800-id pick ${seedOf(G.T02.full.pick)}: ${per("T02")}`,
        `AGREEMENT: S02 ${G.S02.agree} OF 20, T02 ${G.T02.agree} OF 20`, `GAPS: S02 ${v4(G.S02.gap)} (second ${G.S02.second}), T02 ${v4(G.T02.gap)} (second ${G.T02.second}); means on 800 S02 ${G.S02.full.means.map(v4).join(" ")}, T02 ${G.T02.full.means.map(v4).join(" ")}`,
        `WINNER'S CURSE: S02 ${f4(G.S02.curse)}, T02 ${f4(G.T02.curse)}`, `WORST PICKS: S02 ${G.S02.worstPicks}, T02 ${G.T02.worstPicks}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: mean rank correlation of a set's four means with the 800-id means (ties averaged): S02 ${G.S02.corr.toFixed(3)}, T02 ${G.T02.corr.toFixed(3)}; sets whose pick differs from the 800-id pick are marked * above`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
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
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.nets) && ref.length === 8 && ref.every((r, i) => au.nets[i] && au.nets[i].id === r.id && au.nets[i].stored === r.stored && J(Array.from(au.nets[i].weights)) === J(r.weights)); } catch (e) { return false; } })();
    rows.push({ name: "THE EIGHT NETWORKS ARE THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the eight networks are the weights at 1800 of H32's seeds 26011-26014 and H34's seeds 26031-26034 (963 finite weights each), read again from the stored search rows: ${!!stored}` });
    const others = [...X32.TRAIN, X32.HELD, { from: 50000, to: 50071 }, { from: 52000, to: 52299 }, { from: 27200, to: 47399 }].concat([{ from: 60000, to: 61047 }]);
    const setsOk = (() => { try { const rs = SETS.map((_, k) => setRange(k)); return rs.length === 20 && rs.every((r) => r.to - r.from + 1 === 40) && rs.every((r, i) => rs.every((s, j) => i === j || disjoint(r, s))) && rs[0].from === au.range.from && rs[19].to === au.range.to && rs.every((r) => others.every((t) => disjoint(t, r))); } catch (e) { return false; } })();
    rows.push({ name: "THE TWENTY SETS ARE DISJOINT 40-ID SETS PAST EVERY EARLIER ID", ok: setsOk, text: `the twenty sets 53000-53799 are 40 ids each, pairwise disjoint, cover the audit range exactly, and are disjoint from the train ids (26000-26023, 30000-30047, 50000-50071, 60000-61047), the held-out sets (26100-26139, 52000-52299) and every earlier audit (to 47399): ${setsOk}` });
    const m = au.means, means = (() => { try { return !!m && ARM_IDS.every((a) => Number.isFinite(m[a]) && Math.abs(m[a] - avg(perId(au, a))) < 1e-12); } catch (e) { return false; } })();
    rows.push({ name: "THE MEANS ON 800 ARE RECOMPUTED FROM THE RUNS", ok: !!means, text: `the mean penalised priced score at 0.02 of every arm recomputed in the command from the raw runs equals the library's to 1e-12: ${!!means}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H48: a different held-out set (twenty 40-id sets; the eight stored 1800-iteration networks of H32 and H34 flown once on 800 ids; no search). Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
