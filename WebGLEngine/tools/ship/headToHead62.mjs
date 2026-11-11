// WebGLEngine/tools/ship/headToHead62.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead62Cmd.mjs; the gate is tools/ship/headToHead62-selfcheck.mjs)
//
// ROUND H62 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT HELD-OUT SET -- FAR IDS. The eight stored 1800-iteration networks (H32's S02, H34's T02), c02, q02, law0 and the autopilot are flown dark and lit on 200 ids far from every id the series used
// (900000-900199) and read at 0.02 on H27's penalised priced score, paired by id. Reads and writes nothing itself (the command hands in the stored rows and the flights).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";
import * as X51 from "./headToHead51.mjs";

export const IDS = Object.freeze({ from: 900000, to: 900199 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const OLD_IDS = X51.OLD_IDS, ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...OLD_IDS]);
export const STORED_PICK = "s02_26011";
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, netsOf = X51.netsOf;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
/** The arms as { id: arm }: `h27` = { laws: [q02] }; `old` = netsOf's eight networks. */
export function armsOf(h27, old) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead62.armsOf: h27 is { laws: one 4-weight law }");
    if (!Array.isArray(old) || old.length !== 8 || !old.every((n, i) => n && n.id === OLD_IDS[i] && wOk(n.weights))) throw new Error(`headToHead62.armsOf: old is the eight networks ${OLD_IDS.join(", ")} of ${WEIGHT_COUNT} finite weights each`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    old.forEach((n) => { out[n.id] = netArm(n.id, n.weights); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 12; the autopilot is always flown) on `range` ids, dark and lit. */
export function fly(h27, old, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen } = {}) {
    const all = armsOf(h27, old), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead62.fly: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit };
}
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the far ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
/** The stored held-out values of the eight (from their stored rows), in OLD_IDS order. */
export const storedOf = (au) => au.old.map((n) => n.stored);
/** The index of the best value in a list (the first on a tie). */
export const bestIdx = (xs) => xs.reduce((b, v, i) => (v > xs[b] ? i : b), 0);
const ranks = (xs) => xs.map((x) => { const lt = xs.filter((y) => y < x).length, eq = xs.filter((y) => y === x).length; return lt + (eq + 1) / 2; });
/** Spearman's rho: the Pearson correlation of the ranks, ties averaged (NaN for a constant list). */
export function spearman(a, b) { const ra = ranks(a), rb = ranks(b), ma = avg(ra), mb = avg(rb); let sab = 0, saa = 0, sbb = 0; ra.forEach((x, i) => { sab += (x - ma) * (rb[i] - mb); saa += (x - ma) ** 2; sbb += (rb[i] - mb) ** 2; }); return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb); }
/** The readings: { beat, tie, trail } of the eight against c02; the far-id best of the eight; the stored pick; rho; the group bests; the number that beat q02; the mean gain of the eight and c02's. */
export function readAll(au) {
    const cnt = { beat: 0, tie: 0, trail: 0 }; for (const a of OLD_IDS) { const r = pen(au, a, "c02").reading; if (r === "BETTER") cnt.beat++; else if (r === "WORSE") cnt.trail++; else cnt.tie++; }
    const means = OLD_IDS.map((a) => penMean(au, a)), st = storedOf(au);
    const gb = (ids) => ids[bestIdx(ids.map((a) => penMean(au, a)))];
    return { ...cnt, best: OLD_IDS[bestIdx(means)], storedPick: OLD_IDS[bestIdx(st)], rho: spearman(st, means), bestS02: gb(OLD_IDS.slice(0, 4)), bestT02: gb(OLD_IDS.slice(4)), beatQ02: OLD_IDS.filter((a) => pen(au, a, "q02").reading === "BETTER").length, gainEight: avg(OLD_IDS.map((a) => penGainAt(au, a, PRICE))), gainC02: penGainAt(au, "c02", PRICE) };
}
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const R = readAll(au), lost = OLD_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`);
    return [`NETWORKS AGAINST C02 ON THE FAR IDS: ${R.beat} BEAT, ${R.tie} TIE, ${R.trail} TRAIL`, `H32'S CHAMPION ${word(pen(au, "s02_26011", "c02").reading)} C02`, `FAR-ID BEST OF THE EIGHT: ${R.best}; THE STORED PICK IS ${R.storedPick}: ${R.best === R.storedPick ? "SAME" : "DIFFERENT"}`,
        `RANK CORRELATION WITH THE STORED HELD-OUT VALUES: ${Number.isFinite(R.rho) ? R.rho.toFixed(2) : "NaN"}`, `THE EIGHT'S MEAN GAIN OVER THE AUTOPILOT IS ABOVE C02'S: ${R.gainEight > R.gainC02 ? "YES" : "NO"}`,
        `LOST SUBS IN THE EIGHT: ${lost.length ? lost.join(", ") : "NONE"}`, `GROUP BESTS: S02 ${R.bestS02}, T02 ${R.bestT02}`, `NETWORKS THAT BEAT Q02: ${R.beatQ02} OF 8`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
export const distances = (au) => OLD_IDS.map((id, i) => ({ id, l1Wip: l1(au.old[i].weights, au.wip) }));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...OLD_IDS], mean = (a) => penMean(au, a), st = storedOf(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const paired = [...OLD_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`), ...OLD_IDS.map((a) => `${a} minus q02 at 0.02 ${fmt(pen(au, a, "q02"))}`)].join("; ");
    const rs = ranks(st), rf = ranks(OLD_IDS.map(mean)), svf = OLD_IDS.map((a, i) => `${a} stored ${st[i].toFixed(4)} (rank ${rs[i]}) far ${mean(a).toFixed(4)} (rank ${rf[i]})`).join("; ");
    const sv = (xs) => { const m = avg(xs); return xs.reduce((p, q) => p + (q - m) * (q - m), 0) / (xs.length - 1); }, sd = (xs) => Math.sqrt(sv(xs));
    const grp = (ids) => { const xs = ids.map(mean); return `mean ${avg(xs).toFixed(4)} sd ${sd(xs).toFixed(4)} best ${ids[bestIdx(xs)]} ${Math.max(...xs).toFixed(4)}`; };
    return [`AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => `${a} ${[0.005, 0.02, 0.04].map((q) => f4(penGainAt(au, a, q))).join(" / ")}`).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${paired}`, `STORED VS FAR (the stored held-out value on 26100-26139 and the far-id mean, with ranks, ties averaged): ${svf}`,
        `GROUPS (far-id means at 0.02): S02 ${grp(OLD_IDS.slice(0, 4))}; T02 ${grp(OLD_IDS.slice(4))}`, `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: extra power ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join(", ")}; distances of the eight from wip ${distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)}`).join(", ")}`];
}
const near = (a, b) => Math.abs(a - b) < 1e-9;
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
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.old) && ref.length === 8 && ref.every((r, i) => au.old[i] && au.old[i].id === r.id && au.old[i].stored === r.stored && J(Array.from(au.old[i].weights)) === J(Array.from(r.weights))); } catch (e) { return false; } })();
    rows.push({ name: "THE EIGHT ARE THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the eight networks are the weights at 1800 of H32's seeds 26011-26014 and H34's seeds 26031-26034 (963 finite weights each), equal to what H51's library reads from the same stored rows: ${!!stored}` });
    const o = au.original, k = au.h27, reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const dj = au.range.from === 900000 && au.range.to === 900199 && au.range.from > 83000;
    rows.push({ name: "THE AUDIT IS 900000-900199, FAR FROM EVERY EARLIER ID", ok: dj, text: `the audit ids are exactly 900000-900199, and every id the series used (all rounds to H61 and the train and held-out ids) is below 83000: ${dj}` });
    const rec = (() => { try { return ARM_IDS.every((a) => { const v = penRunsAt(au, a, PRICE); return v.length === n && v.every((s, i) => { const r = au.dark[a][i], l = au.lit[a][i]; return Math.abs(s.score - (0.5 * ((r.bad ? 0 : r.score) + (l.bad ? 0 : l.score)) - 0.02 * 0.5 * (r.watts + l.watts) / 1000)) < 1e-12; }); }); } catch (e) { return false; } })();
    rows.push({ name: "THE PER-ID SCORES ARE THE OBJECTIVE RECOMPUTED FROM THE RAW RUNS", ok: !!rec, text: `every arm's per-id penalised priced score at 0.02 equals 0.5 x (dark' + lit') - 0.02 x 0.5 x (dark kW + lit kW), a lost run scoring 0, recomputed here from the raw runs, to 1e-12: ${!!rec}` });
    const finite = !!stored && au.old.every((q) => Number.isFinite(q.stored)) && OLD_IDS[bestIdx(au.old.map((q) => q.stored))] === STORED_PICK;
    rows.push({ name: "THE STORED HELD-OUT VALUES ARE FINITE AND THE STORED PICK IS S02_26011", ok: finite, text: `each network's stored held-out value is finite and the best of the eight by stored value (the first on a tie) is s02_26011, as H44 read it: ${finite}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H62: a different held-out set (far ids ${au.range.from}-${au.range.to}, ${au.range.to - au.range.from + 1} ids; the eight stored 1800-iteration networks, c02, q02, law0 and the autopilot), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
