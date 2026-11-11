// WebGLEngine/tools/ship/headToHead54.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead54Cmd.mjs; the gate is tools/ship/headToHead54-selfcheck.mjs)
//
// ROUND H54 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT HELD-OUT SET BY DIFFICULTY. NO search and NO flight: H48's stored runs of the autopilot and the eight stored 1800-iteration networks on ids 53000-53799 are cut by the autopilot's own penalised score on each id (its difficulty) into four quartiles of 200 ids
// and each quartile into five sets of 40 ids; the pick of a group (the best mean of its four networks, the first on a tie in seed order) on each set and on each quartile is compared with the 800-id pick and with H48's twenty random sets. Reads and writes nothing itself (the command hands in H48's stored result, re-assembled as H48's library reads it).
"use strict";
import * as X48 from "./headToHead48.mjs";

export const IDS = X48.IDS, GROUPS = X48.GROUPS, NET_IDS = X48.NET_IDS, ARM_IDS = X48.ARM_IDS, SET_SIZE = 40, N_IDS = 800;
export const Q_NAMES = Object.freeze(["Q1", "Q2", "Q3", "Q4"]);
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const seedOf = (id) => id.split("_")[1];
/** An id's difficulty list: the autopilot's per-id penalised priced score at 0.02 (800 values). */
export const difficulty = (au) => X48.perId(au, "autopilot");
/** The four quartiles as lists of id offsets (0 to 799), each in increasing id order: the 800 ids sorted ascending by difficulty (ties by the smaller id first) cut into 200 each (Q1 the hardest). */
export function quartiles(au) {
    const d = difficulty(au);
    if (d.length !== N_IDS) throw new Error(`headToHead54.quartiles: the autopilot must have ${N_IDS} per-id scores, got ${d.length}`);
    const order = d.map((v, i) => [v, i]).sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1])).map((x) => x[1]);
    return [0, 1, 2, 3].map((q) => order.slice(q * 200, q * 200 + 200).sort((a, b) => a - b));
}
/** The five sets of 40 of a quartile (consecutive in increasing id order). */
export const setsOf = (ids) => Array.from({ length: ids.length / SET_SIZE | 0 }, (_, k) => ids.slice(k * SET_SIZE, (k + 1) * SET_SIZE));
/** The mean per-id penalised score of an arm over the id offsets given. */
export const meanOver = (au, a, idxs) => { if (!Array.isArray(idxs) || !idxs.length) throw new Error("headToHead54.meanOver: idxs is a non-empty list of id offsets"); const v = X48.perId(au, a); return avg(idxs.map((i) => v[i])); };
/** The pick of a group on a set of id offsets: { pick, means: [four], best, second } (the best mean; the first on a tie in seed order). */
export function pickOver(au, group, idxs) {
    const ids = GROUPS[group]; if (!ids) throw new Error(`headToHead54.pickOver: group is S02 or T02, got ${J(group)}`);
    const means = ids.map((a) => meanOver(au, a, idxs)); let b = 0; means.forEach((m, i) => { if (m > means[b]) b = i; });
    return { pick: ids[b], means, best: means[b], second: Math.max(...means.filter((m, i) => i !== b)) };
}
/** Everything the verdict reads: { full, quart, sets, agree, randomAgree, tercileInfo }. */
export function readAll(au) {
    const Q = quartiles(au), all800 = Array.from({ length: N_IDS }, (_, i) => i), out = { Q, groups: {} };
    for (const g of Object.keys(GROUPS)) {
        const full = pickOver(au, g, all800), quart = Q.map((ids) => pickOver(au, g, ids)), sets = Q.map((ids) => setsOf(ids).map((s) => pickOver(au, g, s)));
        out.groups[g] = { full, quart, sets, agree: sets.map((ss) => ss.filter((p) => p.pick === full.pick).length), differs: quart.filter((p) => p.pick !== full.pick).length, randomAgree: X48.readGroup(au, g).agree, randomPick: X48.readGroup(au, g).full.pick };
    }
    return out;
}
/** Spearman correlation of ranks with ties averaged (H48's). */
export const rankCorr = X48.rankCorr;
/** The registered verdict, eight parts joined by "; " (parts A, B, C hold a "; " inside). */
export function verdictOf(au) {
    const R = readAll(au), G = R.groups, S = G.S02, T = G.T02, f4 = (x) => x.toFixed(4);
    const corr = (g) => avg(R.Q.map((ids, q) => { const m = G[g].quart[q].means, f = G[g].full.means; return rankCorr(m, f); }).filter(Number.isFinite));
    const margins = Q_NAMES.map((n, q) => avg(["S02", "T02"].flatMap((g) => G[g].sets[q].map((p) => p.best - p.second))));
    const apQ = R.Q.map((ids) => meanOver(au, "autopilot", ids)), rnd = (x) => (Number.isFinite(x) ? x.toFixed(2) : "NaN");
    const sumDiff = (g) => G[g].agree.reduce((p, q) => p + q, 0);
    return [`QUARTILE PICKS (200 IDS): S02 ${Q_NAMES.map((n, q) => `${n} ${seedOf(S.quart[q].pick)}`).join(", ")}; T02 ${Q_NAMES.map((n, q) => `${n} ${seedOf(T.quart[q].pick)}`).join(", ")}; 800-ID PICKS: S02 ${seedOf(S.full.pick)}, T02 ${seedOf(T.full.pick)}`,
        `40-ID SETS THAT AGREE WITH 800, BY QUARTILE (OF 5): S02 ${S.agree.join(" ")}, T02 ${T.agree.join(" ")}`, `RANDOM SETS AGREE: S02 ${S.randomAgree} OF 20, T02 ${T.randomAgree} OF 20; DIFFICULTY SETS AGREE: S02 ${sumDiff("S02")} OF 20, T02 ${sumDiff("T02")} OF 20`,
        `QUARTILES WHOSE 200-ID PICK DIFFERS FROM THE 800-ID PICK: S02 ${S.differs} OF 4, T02 ${T.differs} OF 4`, `RANK CORRELATION OF A QUARTILE'S FOUR MEANS WITH THE 800-ID MEANS, MEAN OVER QUARTILES: S02 ${rnd(corr("S02"))}, T02 ${rnd(corr("T02"))}`,
        `MEAN MARGIN OF THE BEST OVER THE SECOND (40-ID SETS): ${Q_NAMES.map((n, q) => `${n} ${f4(margins[q])}`).join(", ")}`, `AUTOPILOT MEAN PENALISED SCORE BY QUARTILE: ${Q_NAMES.map((n, q) => `${n} ${f4(apQ[q])}`).join(", ")}`,
        `HARD SETS (Q1) AGREE LESS THAN EASY SETS (Q4): ${S.agree[0] + T.agree[0] < S.agree[3] + T.agree[3] ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), v4 = (x) => x.toFixed(4);
const pearson = (x, y) => { const mx = avg(x), my = avg(y); let a = 0, b = 0, c = 0; x.forEach((_, i) => { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; }); return b === 0 || c === 0 ? NaN : a / Math.sqrt(b * c); };
/** Difficulty terciles of 266, 267 and 267 ids cut into sets of 40 (the remainder dropped): { picks per group per tercile: [{ pick, agree of N sets }] }. */
export function terciles(au) {
    const d = difficulty(au), order = d.map((v, i) => [v, i]).sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1])).map((x) => x[1]), cuts = [[0, 266], [266, 533], [533, 800]], out = {};
    for (const g of Object.keys(GROUPS)) { const full = pickOver(au, g, Array.from({ length: N_IDS }, (_, i) => i)).pick; out[g] = cuts.map(([a, b]) => { const ids = order.slice(a, b).sort((p, q) => p - q), ss = setsOf(ids), agree = ss.filter((s) => pickOver(au, g, s).pick === full).length; return { n: ids.length, sets: ss.length, agree, pick: pickOver(au, g, ids).pick }; }); }
    return out;
}
export function bottomLines(au) {
    const R = readAll(au), G = R.groups, d = difficulty(au), apQ = R.Q.map((ids) => meanOver(au, "autopilot", ids)), sorted = d.slice().sort((a, b) => a - b);
    const cut = [0, 1, 2, 3].map((q) => `${Q_NAMES[q]} ${v4(sorted[q * 200])} to ${v4(sorted[q * 200 + 199])}`).join(", ");
    const means = NET_IDS.map((a) => `${a} ${R.Q.map((ids, q) => `${Q_NAMES[q]} ${v4(meanOver(au, a, ids))}`).join(" ")} all ${v4(meanOver(au, a, Array.from({ length: N_IDS }, (_, i) => i)))}`).join("; ");
    const picks = Object.keys(GROUPS).map((g) => `${g}: ${Q_NAMES.map((n, q) => `${n} 200-id ${seedOf(G[g].quart[q].pick)} (sets ${G[g].sets[q].map((p) => seedOf(p.pick)).join(" ")})`).join("; ")}`).join("; ");
    const agr = Object.keys(GROUPS).map((g) => `${g}: ${G[g].agree.map((a, q) => `${Q_NAMES[q]} ${a} OF 5`).join(", ")}`).join("; ");
    const mar = Q_NAMES.map((n, q) => `${n} ${["S02", "T02"].map((g) => `${g} ${v4(avg(G[g].sets[q].map((p) => p.best - p.second)))}`).join(", ")}`).join("; ");
    const rv = Object.keys(GROUPS).map((g) => `${g}: random ${G[g].randomAgree} OF 20 (800-id pick ${seedOf(G[g].randomPick)}), difficulty ${G[g].agree.reduce((p, q) => p + q, 0)} OF 20`).join("; ");
    const T3 = terciles(au), ter = Object.keys(GROUPS).map((g) => `${g}: ${T3[g].map((t, k) => `T${k + 1} (${t.n} ids) pick ${seedOf(t.pick)}, ${t.agree} OF ${t.sets}`).join("; ")}`).join("; ");
    const cor = NET_IDS.map((a) => `${a} ${(() => { const r = pearson(X48.perId(au, a), d); return Number.isFinite(r) ? r.toFixed(2) : "NaN"; })()}`).join(", ");
    return [`QUARTILES (the cut values of the autopilot's per-id penalised score at 0.02, the ids per quartile 200 each, the autopilot's mean per quartile): ${cut}; means ${apQ.map((x, q) => `${Q_NAMES[q]} ${v4(x)}`).join(", ")}`, `MEANS BY QUARTILE (each network's mean per quartile and on 800): ${means}`, `PICKS (per group and quartile, the 200-id pick and the five 40-id picks): ${picks}`, `AGREEMENT (40-id sets that pick what all 800 ids pick): ${agr}`, `MARGINS (mean margin of the best over the second on a 40-id set): ${mar}`, `RANDOM VS DIFFICULTY (H48's twenty random sets against the twenty difficulty sets): ${rv}`, `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: difficulty terciles (sets of 40, remainder dropped): ${ter}; Pearson correlation of each network's per-id score with the autopilot's over the 800 ids: ${cor}`];
}
const near = (a, b) => Math.abs(a - b) < 1e-9;
export function checksOf(au) {
    const rows = [], n = au && au.range ? au.range.to - au.range.from + 1 : 0;
    let h48 = false; try { h48 = !!au && J(au.range) === '{"from":53000,"to":53799}' && n === 800 && J(Object.keys(au.dark)) === J(ARM_IDS) && J(Object.keys(au.lit)) === J(ARM_IDS) && X48.checksOf(au).every((c) => c.ok); } catch (e) { h48 = false; }
    rows.push({ name: "H48'S STORED RESULT IS THE REGISTERED ONE", ok: h48, text: `H48's stored runs are ids 53000-53799 (800), the nine arms (the autopilot and the eight networks) in both conditions, and every one of H48's own checks passes on them (sizes, alignment, scores inside (0, 1), powers, the penalised objective, the stored networks, the twenty sets): ${h48}` });
    let part = false; try { const Q = quartiles(au), seen = new Array(800).fill(0), d = difficulty(au); Q.forEach((ids) => ids.forEach((i) => { seen[i]++; })); part = Q.length === 4 && Q.every((ids) => ids.length === 200) && seen.every((c) => c === 1) && Q.every((ids, q) => q === 0 || Math.max(...Q[q - 1].map((i) => d[i])) <= Math.min(...ids.map((i) => d[i]))) && Q.every((ids) => ids.every((v, i) => i === 0 || ids[i - 1] < v)); } catch (e) { part = false; }
    rows.push({ name: "THE QUARTILES PARTITION THE 800 IDS BY THE AUTOPILOT'S SCORE", ok: part, text: `the four quartiles hold 200 ids each, every id once, in increasing id order within a quartile, and the largest difficulty of a quartile is at most the smallest of the next (ties by the smaller id first): ${part}` });
    let sets = false; try { const Q = quartiles(au); sets = Q.every((ids) => { const ss = setsOf(ids), flat = ss.flat(); return ss.length === 5 && ss.every((s) => s.length === 40) && J(flat) === J(ids); }); } catch (e) { sets = false; }
    rows.push({ name: "EVERY QUARTILE SET IS 40 IDS OF ONE QUARTILE AND THE FIVE PARTITION IT", ok: sets, text: `each quartile is cut into five sets of 40 consecutive ids (in id order) that together are the quartile exactly: ${sets}` });
    let rnd = false; try { rnd = X48.SETS.length === 20 && X48.SETS.every(([a, b], k) => a === 40 * k && b === 40 * k + 40); } catch (e) { rnd = false; }
    rows.push({ name: "H48'S TWENTY RANDOM SETS ARE THE REGISTERED CONSECUTIVE ONES", ok: rnd, text: `H48's twenty sets are the consecutive 40-id blocks 0-39, 40-79, ..., 760-799 of the 800 ids: ${rnd}` });
    let rec = false; try { rec = ARM_IDS.every((a) => { const v = X48.perId(au, a); return v.length === 800 && v.every((s, i) => { const r = (au.dark[a][i].bad ? 0 : au.dark[a][i].score), l = (au.lit[a][i].bad ? 0 : au.lit[a][i].score); return Math.abs(s - (0.5 * (r + l) - 0.02 * 0.5 * (au.dark[a][i].watts + au.lit[a][i].watts) / 1000)) < 1e-12; }); }); } catch (e) { rec = false; }
    rows.push({ name: "THE PER-ID SCORES ARE THE OBJECTIVE RECOMPUTED FROM THE STORED RUNS", ok: rec, text: `every arm's 800 per-id penalised priced scores at 0.02 equal 0.5 x (dark' + lit') - 0.02 x 0.5 x (dark kW + lit kW), a lost run scoring 0, recomputed here from the raw runs, to 1e-12: ${rec}` });
    let pk = false; try { const R = readAll(au); pk = Object.keys(GROUPS).every((g) => R.groups[g].full.pick === X48.readGroup(au, g).full.pick); } catch (e) { pk = false; }
    rows.push({ name: "THE 800-ID PICKS ARE H48'S OWN", ok: pk, text: `each group's pick on all 800 ids equals the 800-id pick H48's library reads from the same runs: ${pk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H54: a different held-out set by difficulty (H48's stored runs of the autopilot and the eight networks on ids 53000-53799, cut into four quartiles of the autopilot's own penalised score and into sets of 40; no search, no flight). Penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
