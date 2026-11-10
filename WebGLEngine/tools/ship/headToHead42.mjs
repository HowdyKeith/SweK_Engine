// WebGLEngine/tools/ship/headToHead42.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead42Cmd.mjs; the gate is tools/ship/headToHead42-selfcheck.mjs)
//
// ROUND H42 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT HELD-OUT SET. A search never reads its held-out value (it only writes it at the checkpoints), so H32's and H34's searches are the same whatever set is used and NO SEARCH is run here: the 32 stored checkpoint networks
// (H32's S02 seeds 26011-26014 and H34's T02 seeds 26031-26034, each at 900 / 1200 / 1500 / 1800) are flown dark and lit on the original held-out ids HO (26100-26139, a re-fly check) and on two new sets, HA (52000-52039, 40 ids) and HB (52100-52299, 200 ids), scored by H27's penalised priced objective at 0.02
// through H28's flyPen (X30.netObj, the search's own objective), and the champion pick is re-made on each set. Rank correlations (Spearman, ties averaged) against the audits already stored (H34's; H35's when it exists). Reads and writes nothing itself (the command hands in the stored rows and audits).
"use strict";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const PRICE = 0.02, SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, CHECKPOINTS = X32.CHECKPOINTS, LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
export const SETS = Object.freeze({ HO: X32.HELD, HA: Object.freeze({ from: 52000, to: 52039 }), HB: Object.freeze({ from: 52100, to: 52299 }) });
export const SET_IDS = Object.freeze(["HO", "HA", "HB"]);
export const SEEDS = Object.freeze({ S02: Object.freeze([26011, 26012, 26013, 26014]), T02: Object.freeze([26031, 26032, 26033, 26034]) });
export const GROUPS = Object.freeze(["S02", "T02"]);
export const AUDIT34 = Object.freeze({ from: 34200, to: 34399 }), AUDIT35 = Object.freeze({ from: 35200, to: 35399 });
export const fingerprint = X27.fingerprint, flyPen = X32.flyPen;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
export const netId = (group, seed, iter) => `${group}:${seed}:${iter}`;
export const idsOf = (r) => r.to - r.from + 1;
/** The 32 stored checkpoint networks, in the order group, seed, checkpoint: [{ id, group, seed, iter, weights, stored }] (`stored` = the held-out value the search wrote). `rows` = { S02: [H32's four search rows], T02: [H34's four] }. */
export function netsOf(rows) {
    if (!rows || !Array.isArray(rows.S02) || !Array.isArray(rows.T02)) throw new Error("headToHead42.netsOf: rows is { S02: [four search rows], T02: [four search rows] }");
    const out = [];
    for (const g of GROUPS) for (const s of SEEDS[g]) {
        const mine = rows[g].filter((r) => r && r.seed === s);
        if (mine.length !== 1) throw new Error(`headToHead42.netsOf: group ${g} needs one search row for seed ${s}, got ${mine.length}`);
        for (const it of CHECKPOINTS) {
            const k = cpOf(mine[0], it);
            if (!k || !wOk(k.weights) || !Number.isFinite(k.heldScore)) throw new Error(`headToHead42.netsOf: ${g} seed ${s} needs a checkpoint at ${it} of ${WEIGHT_COUNT} finite weights and a finite held-out value`);
            out.push({ id: netId(g, s, it), group: g, seed: s, iter: it, weights: Array.from(k.weights), stored: k.heldScore });
        }
    }
    return out;
}
/** One network flown on the sets: { values: { HO, HA, HB }, runs: { HO: { dark, lit }, ... } } (the value by X30.netObj, the search's objective, through `flyFn`; `runs` keep key, score, bad, watts, thrust). */
export function evalNet(net, { sets = SETS, seconds = SECONDS, flyFn = flyPen } = {}) {
    if (!net || !wOk(net.weights)) throw new Error(`headToHead42.evalNet: a network is ${WEIGHT_COUNT} finite weights`);
    const values = {}, runs = {};
    for (const k of SET_IDS) {
        const rec = { dark: [], lit: [] }, f = (arm, range, secs, ev) => { const o = flyFn(arm, range, secs, ev); rec[ev === "dropout" ? "dark" : "lit"].push(...o.map((r) => ({ key: r.key, score: r.score, bad: !!r.bad, watts: r.watts, thrust: r.thrust }))); return o; };
        values[k] = X30.netObj(net.weights, [sets[k]], PRICE, seconds, f); runs[k] = rec;
    }
    return { id: net.id, group: net.group, seed: net.seed, iter: net.iter, stored: net.stored, values, runs };
}
/** The pick of a group at a checkpoint on a set: the seed with the best value, the first of a tie in seed order; { seed, value }. `evals` = the flown networks. */
export function pick(evals, group, iter, set) {
    if (!SEEDS[group] || !CHECKPOINTS.includes(iter) || !SET_IDS.includes(set)) throw new Error(`headToHead42.pick: group ${J(group)}, checkpoint ${J(iter)} and set ${J(set)} must be among ${GROUPS.join(", ")}; ${CHECKPOINTS.join(", ")}; ${SET_IDS.join(", ")}`);
    let b = null;
    for (const s of SEEDS[group]) { const e = (evals || []).filter((x) => x.group === group && x.seed === s && x.iter === iter); if (e.length !== 1 || !Number.isFinite(e[0].values[set])) throw new Error(`headToHead42.pick: group ${group} needs one flown network for seed ${s} at ${iter}`); if (b === null || e[0].values[set] > b.value) b = { seed: s, value: e[0].values[set] }; }
    return b;
}
/** The pick of a group at a checkpoint by the STORED held-out values (the search's own champion rule). */
export function storedPick(evals, group, iter) {
    let b = null; for (const s of SEEDS[group]) { const e = evals.find((x) => x.group === group && x.seed === s && x.iter === iter); if (e && (b === null || e.stored > b.value)) b = { seed: s, value: e.stored }; } return b;
}
/** Spearman's rank correlation (ranks with ties averaged, Pearson on the ranks); NaN when either side has no spread. */
export function spearman(x, y) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2 || ![...x, ...y].every(Number.isFinite)) throw new Error("headToHead42.spearman: two lists of the same length (at least 2) of finite numbers");
    const rank = (v) => v.map((a) => { let lt = 0, eq = 0; for (const b of v) { if (b < a) lt++; else if (b === a) eq++; } return lt + (eq + 1) / 2; });
    const rx = rank(x), ry = rank(y), mx = avg(rx), my = avg(ry); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < rx.length; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
    return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}
/** An arm's mean penalised priced score at 0.02 over a stored audit's ids ({ dark, lit } by arm id). */
export const auditMean = (audit, arm) => avg(X27.penRunsAt(audit, arm, PRICE).map((r) => r.score));
const auditArm = (g, s) => (g === "T02" ? "t02_" : "s02_") + s;
/** The 1800 networks' values on a set in seed order for a group. */
const finals = (au, g, set) => SEEDS[g].map((s) => au.evals.find((x) => x.group === g && x.seed === s && x.iter === LAST).values[set]);
export function rhoOf(au, g) {
    const audit = g === "T02" ? au.audit34 : au.audit35;
    if (!audit) return null;
    return spearman(finals(au, g, "HB"), SEEDS[g].map((s) => auditMean(audit, auditArm(g, s))));
}
const f4 = (x) => x.toFixed(4), f2 = (x) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + x.toFixed(2) : "undefined");
/** The registered verdict, seven parts joined by "; " (part E holds the registered "; " inside). */
export function verdictOf(au) {
    const pk = (g, set) => pick(au.evals, g, LAST, set).seed, agree = (set) => GROUPS.flatMap((g) => CHECKPOINTS.map((it) => pick(au.evals, g, it, set).seed === pick(au.evals, g, it, "HO").seed)).filter(Boolean).length;
    const reflyOk = au.evals.every((e) => e.values.HO === e.stored), cv = championValues(au), val = (g, set) => f4(cv[g][set]);
    const rT = rhoOf(au, "T02"), rS = rhoOf(au, "S02"), rf = (r) => (r === null ? "NOT AVAILABLE" : Number.isNaN(r) ? "rho undefined" : "rho " + r.toFixed(2));
    return [`S02 PICK AT 1800: HO ${pk("S02", "HO")}, HA ${pk("S02", "HA")}, HB ${pk("S02", "HB")}`, `T02 PICK AT 1800: HO ${pk("T02", "HO")}, HA ${pk("T02", "HA")}, HB ${pk("T02", "HB")}`,
        `PICKS AT ALL FOUR CHECKPOINTS THAT AGREE WITH HO: HA ${agree("HA")} OF 8, HB ${agree("HB")} OF 8`, `RE-FLY ON HO EQUALS THE STORED VALUES: ${reflyOk ? "YES" : "NO"}`,
        `CHAMPION'S VALUE: S02 HO ${val("S02", "HO")}, HA ${val("S02", "HA")}, HB ${val("S02", "HB")}; T02 HO ${val("T02", "HO")}, HA ${val("T02", "HA")}, HB ${val("T02", "HB")}`,
        `T02 RANK ON HB VS H34'S AUDIT: ${rf(rT)}`, `S02 RANK ON HB VS H35'S AUDIT: ${rf(rS)}`].join("; ");
}
/** The champion's value on each set for the champion of EACH set (the pick on that set), per group: { S02: { HO, HA, HB }, T02: {...} }; and the champion picked on HO valued on each set. */
export function championValues(au) {
    const out = {}; for (const g of GROUPS) { const hoSeed = pick(au.evals, g, LAST, "HO").seed, e = au.evals.find((x) => x.group === g && x.seed === hoSeed && x.iter === LAST); out[g] = { HO: e.values.HO, HA: e.values.HA, HB: e.values.HB, seed: hoSeed }; } return out;
}
const sd = (xs) => { const m = avg(xs); return Math.sqrt(avg(xs.map((a) => (a - m) ** 2))); };
export function differences(au) { const d = (k) => au.evals.map((e) => e.values[k] - e.values.HO); return { HA: avg(d("HA")), HB: avg(d("HB")), sdHA: sd(d("HA")), sdHB: sd(d("HB")) }; }
export function bottomLines(au) {
    const vals = au.evals.map((e) => `${e.id} ${SET_IDS.map((k) => `${k} ${f4(e.values[k])}`).join(", ")}`).join("; ");
    const picks = GROUPS.map((g) => `${g} ${CHECKPOINTS.map((it) => `${it}: ${SET_IDS.map((k) => `${k} ${pick(au.evals, g, it, k).seed}`).join(" ")}`).join("; ")}`).join("; ");
    const cv = championValues(au), champ = GROUPS.map((g) => `${g} (the HO pick ${cv[g].seed}) HO ${f4(cv[g].HO)}, HA ${f4(cv[g].HA)}, HB ${f4(cv[g].HB)}`).join("; ");
    const tab = (g) => { const order = (k) => SEEDS[g].map((s) => [s, au.evals.find((x) => x.group === g && x.seed === s && x.iter === LAST).values[k]]).sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([s]) => s).join(" > "); const audit = g === "T02" ? au.audit34 : au.audit35; const an = audit ? SEEDS[g].map((s) => [s, auditMean(audit, auditArm(g, s))]).sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([s]) => s).join(" > ") : "NOT AVAILABLE"; return `${g} by HO ${order("HO")}; by HA ${order("HA")}; by HB ${order("HB")}; by the audit ${an}`; };
    const d = differences(au);
    return [`HELD-OUT VALUES (penalised priced at 0.02): ${vals}`, `PICKS PER CHECKPOINT (900 / 1200 / 1500 / 1800): ${picks}`, `CHAMPION'S VALUE: ${champ}`, `RANK TABLES (the four 1800 networks, best first): ${tab("S02")}; ${tab("T02")}`, `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: mean difference over the 32 networks HA minus HO ${f2(d.HA)}, HB minus HO ${f2(d.HB)}; the standard deviation of the differences HA minus HO ${d.sdHA.toFixed(4)}, HB minus HO ${d.sdHB.toFixed(4)}`];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from;
const runsOf = (e, k, c) => (e && e.runs && e.runs[k] && Array.isArray(e.runs[k][c]) ? e.runs[k][c] : []);
export function checksOf(au) {
    const rows = [], E = au.evals || [], cells = E.flatMap((e) => SET_IDS.flatMap((k) => ["dark", "lit"].map((c) => [e, k, c])));
    const sizes = E.length === 32 && cells.every(([e, k, c]) => runsOf(e, k, c).length === idsOf(SETS[k]));
    rows.push({ name: "SIZES", ok: sizes, text: `every one of the 32 networks flew every id of HO (40), HA (40) and HB (200) in both conditions: ${sizes}` });
    const aligned = cells.every(([e, k, c]) => runsOf(e, k, c).every((r, i) => r.key === "sb-" + (SETS[k].from + i) && !!runsOf(e, k, "dark")[i] && r.key === runsOf(e, k, "dark")[i].key));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids flown are the set's ids in order, the same in both conditions: ${aligned}` });
    const inside = cells.every(([e, k, c]) => runsOf(e, k, c).every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([e, k, c]) => runsOf(e, k, c).every((r) => Number.isFinite(r.watts) && r.watts >= 200 && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least 200 W and every mean thrust finite: ${watts}` });
    const nets = (() => { try { const ref = netsOf(au.rows); return ref.length === E.length && ref.every((n, i) => E[i].id === n.id && E[i].stored === n.stored && J(Array.from(au.weights[i])) === J(n.weights)); } catch (e) { return false; } })();
    rows.push({ name: "THE 32 NETWORKS ARE THE STORED CHECKPOINT WEIGHTS", ok: !!nets, text: `the 32 networks are the stored checkpoint weights (963 finite weights each) of H32's seeds 26011-26014 and H34's seeds 26031-26034 at 900, 1200, 1500 and 1800, each once, read again from the stored rows: ${!!nets}` });
    const tr = [...X32.TRAIN, { from: 50000, to: 50071 }], sets = SET_IDS.map((k) => SETS[k]);
    const dj = idsOf(SETS.HO) === 40 && idsOf(SETS.HA) === 40 && idsOf(SETS.HB) === 200 && sets.every((a, i) => sets.every((b, j) => i === j || disjoint(a, b))) && [SETS.HA, SETS.HB].every((a) => tr.every((t) => disjoint(a, t)) && a.from > 42399) && tr.every((t) => disjoint(SETS.HO, t));
    rows.push({ name: "HELD-OUT SETS DISJOINT AND SIZED AS REGISTERED", ok: dj, text: `HO (26100-26139, 40 ids), HA (52000-52039, 40) and HB (52100-52299, 200) are pairwise disjoint and disjoint from the train ids (26000-26023, 30000-30047), 50000-50071 and every audit id (up to 42399): ${dj}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const refly = E.length === 32 && E.every((e) => e.values.HO === e.stored);
    rows.push({ name: "THE RE-FLY ON HO EQUALS THE STORED VALUE OF EVERY NETWORK", ok: refly, text: `the value of every one of the 32 networks on the original held-out ids equals the value the search wrote, to the last digit: ${refly}` });
    const rule = E.length === 32 && GROUPS.every((g) => CHECKPOINTS.every((it) => { try { return pick(E, g, it, "HO").seed === storedPick(E, g, it).seed; } catch (e) { return false; } }));
    rows.push({ name: "THE CHAMPION RULE IS H32'S", ok: rule, text: `the pick on HO at every checkpoint of both groups is the seed the stored held-out values name (the best, the first of a tie in seed order): ${rule}` });
    const sp = Math.abs(spearman([1, 2, 3, 4], [1, 2, 3, 4]) - 1) < 1e-12 && Math.abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12 && Math.abs(spearman([1, 2, 3, 4], [2, 1, 4, 3]) - 0.6) < 1e-12 && Math.abs(spearman([1, 1, 3, 4], [1, 2, 3, 4]) - 0.9486832980505138) < 1e-12 && Number.isNaN(spearman([1, 1, 1, 1], [1, 2, 3, 4]));
    rows.push({ name: "SPEARMAN'S RHO IS RIGHT ON HAND-WORKED CASES", ok: sp, text: `rho is 1 for equal ranks, -1 for reversed, 0.6 for [1,2,3,4] against [2,1,4,3], 0.9487 with one tie, undefined with no spread: ${sp}` });
    const a34 = au.audit34, okA = !!a34 && !!au.audit34Range && au.audit34Range.from === AUDIT34.from && au.audit34Range.to === AUDIT34.to && SEEDS.T02.every((s) => a34.dark[auditArm("T02", s)] && a34.lit[auditArm("T02", s)] && a34.dark[auditArm("T02", s)].length === 200 && a34.lit[auditArm("T02", s)].length === 200 && Number.isFinite(auditMean(a34, auditArm("T02", s))));
    rows.push({ name: "H34'S AUDIT MEANS ARE RECOMPUTED FROM ITS STORED RUNS", ok: !!okA, text: `H34's stored audit (ids 34200-34399) holds 200 dark and 200 lit runs for each of t02_26031 to t02_26034 and their means at 0.02 are recomputed here: ${!!okA}` });
    const none = au.searched === false;
    rows.push({ name: "NO SEARCH WAS RUN", ok: none, text: `the networks were flown, not searched (the command has no search mode and no state is read or written): ${none}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H42: a different held-out set (the 32 stored checkpoint networks of H32's S02 and H34's T02 flown on HO 26100-26139, HA 52000-52039 and HB 52100-52299, 160 s, dark and lit, penalised priced score at 0.02; no search)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
