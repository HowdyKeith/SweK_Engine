// WebGLEngine/tools/ship/headToHead70.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead70Cmd.mjs; the gate is tools/ship/headToHead70-selfcheck.mjs)
//
// ROUND H70 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT AUDIT SET SIZE. The twelve stored 1800-iteration networks of H68 (H32's S02, H34's T02, H45's N72), c02, q02, law0 and the autopilot are flown ONCE, dark and lit, 160 s, on 800 fresh ids (90200-90999),
// and read at 0.02 on H27's penalised priced score, paired by id, on the first 50, 100, 200, 400 and all 800 ids (nested prefixes N50 .. N800) and on four disjoint blocks of 200 (B0 .. B3, B0 being N200). No search. The flights, the arms and the stored networks are H68's own code (headToHead68.mjs).
// Reads and writes nothing itself (the command hands in the flights).
"use strict";
import * as X68 from "./headToHead68.mjs";
import * as X27 from "./headToHead27.mjs";
import * as H15 from "./headToHead15.mjs";

export const IDS = Object.freeze({ from: 90200, to: 90999 }), SIZES = Object.freeze([50, 100, 200, 400, 800]), BLOCK = 200, BLOCKS = 4, PRICE = 0.02, EARLIER_AUDIT_END = 89399, CONTROL = 200;
export const ARM_IDS = X68.ARM_IDS, NET_IDS = X68.NET_IDS, LAW_C02 = X68.LAW_C02, WEIGHT_COUNT = X68.WEIGHT_COUNT, SECONDS = 160;
export const netsOf = X68.netsOf, armsOf = X68.armsOf, fingerprint = X68.fingerprint, WIP_FINGERPRINT = X68.WIP_FINGERPRINT, flyPen = X68.flyPen, fixtureOf = X27.fixtureOf, spearman = X68.spearman, bestIdx = X68.bestIdx;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, penGainAt = X27.penGainAt, penPair = X27.penPair, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, near = (a, b) => Math.abs(a - b) < 1e-9;
/** The arms of `arms` (default all 16; the autopilot always) on `range` ids at 160 s, dark and lit: H68's fly at one horizon. */
export const fly = (h27, nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen } = {}) => X68.fly(h27, nets, { range, seconds, arms, flyFn });
/** The audit as H27's helpers read it on ids `start` to `start + n - 1` of the one flight (the first n by default). */
export function view(au, n, start = 0) {
    const cut = (g) => Object.fromEntries(Object.entries(g).map(([a, runs]) => [a, runs.slice(start, start + n)]));
    if (!au.dark || !au.lit || !Number.isInteger(n) || n < 1 || start < 0 || start + n > au.dark.autopilot.length) throw new Error(`headToHead70.view: no ${n} ids from ${start}`);
    return { ...au, dark: cut(au.dark), lit: cut(au.lit) };
}
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, n, a, b, start = 0) => penPair(view(au, n, start), a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over `n` ids from `start`. */
export const penMean = (au, n, a, start = 0) => avg(penRunsAt(view(au, n, start), a, PRICE).map((r) => r.score));
const notBehind = (au, n, start = 0) => NET_IDS.filter((a) => pen(au, n, a, "c02", start).reading !== "WORSE").length;
const bestOf = (au, n) => NET_IDS[bestIdx(NET_IDS.map((a) => penMean(au, n, a)))];
const rho = (au, n) => spearman(NET_IDS.map((a) => penMean(au, n, a)), NET_IDS.map((a) => penMean(au, IDS.to - IDS.from + 1, a)));
const meanSe = (au, n) => avg(NET_IDS.map((a) => pen(au, n, a, "c02").se));
const rd = (x) => (Number.isFinite(x) ? x.toFixed(2) : "NaN");
/** The networks whose reading against c02 at N200 differs from their reading at N800: [{ id, a, b }]. */
export const changes = (au) => NET_IDS.map((id) => ({ id, a: pen(au, 200, id, "c02").reading, b: pen(au, 800, id, "c02").reading })).filter((x) => x.a !== x.b);
/** The smallest registered size whose prefix holds a lost run of any of the twelve, or null. */
export const firstLoss = (au) => SIZES.find((n) => NET_IDS.some((a) => lostBoth(view(au, n), a) > 0)) || null;
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const S = SIZES, k = (n) => `N${n}`, ch = changes(au), v8 = view(au, 800), lost = NET_IDS.filter((a) => lostBoth(v8, a) > 0).map((a) => `${a} ${lostBoth(v8, a)}`), fl = firstLoss(au);
    return [`NETWORKS NOT BEHIND C02 AT ${S.map((n) => `${k(n)} ${notBehind(au, n)}`).join(", ")} (OF 12)`, `BEST OF THE TWELVE AT ${S.map((n) => `${k(n)} ${bestOf(au, n)}`).join(", ")}`,
        `RANK CORRELATION OF THE TWELVE WITH THEIR N800 RANKING: ${S.slice(0, 4).map((n) => `${k(n)} ${rd(rho(au, n))}`).join(", ")}`,
        `NETWORKS NOT BEHIND C02 IN THE FOUR 200-ID BLOCKS: ${[0, 1, 2, 3].map((b) => `B${b} ${notBehind(au, BLOCK, b * BLOCK)}`).join(", ")} (OF 12)`,
        `NETWORKS WHOSE READING AGAINST C02 CHANGES BETWEEN N200 AND N800: ${ch.length ? ch.map((x) => `${x.id} ${word(x.a)} -> ${word(x.b)}`).join(", ") : "NONE"}`,
        `MEAN STANDARD ERROR OF THE TWELVE'S PAIRED MARGIN OVER C02: ${S.map((n) => `${k(n)} ${meanSe(au, n).toFixed(5)}`).join(", ")}`,
        `LOST SUBS IN THE TWELVE AT N800: ${lost.length ? lost.join(", ") : "NONE"}; FIRST LOSS AT: ${fl === null ? "NONE" : k(fl)}`, `C02 MINUS THE AUTOPILOT AT ${S.map((n) => `${k(n)} ${word(pen(au, n, "c02", "autopilot").reading)}`).join(", ")}`].join("; ");
}
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function bottomLines(au) {
    const lines = [], v8 = view(au, 800), meanLine = ["autopilot", "c02", "q02", ...NET_IDS].map((a) => `${a} ${scoreMean(v8, a, "dark").toFixed(4)} / ${scoreMean(v8, a, "lit").toFixed(4)}, ${kwOf(v8, a).toFixed(2)} kW, lost ${lostBoth(v8, a)}`).join("; ");
    lines.push(`MEANS AT N800 (dark / lit mean score, dark mean power, runs lost of 1600): ${meanLine}`);
    for (const n of SIZES) lines.push(`PAIRED AGAINST C02 AT N${n} (penalised priced score at 0.02): ${NET_IDS.map((a) => `${a} ${fmt(pen(au, n, a, "c02"))}`).join("; ")}`);
    for (const n of [50, 800]) lines.push(`RANKING AT N${n} (audit mean at 0.02): ${[...NET_IDS].sort((x, y) => penMean(au, n, y) - penMean(au, n, x)).map((a) => `${a} ${penMean(au, n, a).toFixed(4)}`).join(", ")}`);
    lines.push(`BLOCKS (each network's reading against c02 in B0 / B1 / B2 / B3): ${NET_IDS.map((a) => `${a} ${[0, 1, 2, 3].map((b) => word(pen(au, BLOCK, a, "c02", b * BLOCK).reading)).join(" / ")}`).join("; ")}`);
    lines.push(`VERDICT: ${verdictOf(au)}`);
    lines.push(`REPORTED, NOT IN THE VERDICT: unpenalised-free gain over the autopilot at 0.005 / 0.02 / 0.04 at N800: ${["c02", "q02", ...NET_IDS].map((a) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(v8, a, p))).join(" / ")}`).join("; ")}`);
    lines.push(`REPORTED, NOT IN THE VERDICT: per-network paired margin over c02 at N50 / N200 / N800: ${NET_IDS.map((a) => `${a} ${[50, 200, 800].map((n) => f4(pen(au, n, a, "c02").mean)).join(" / ")}`).join("; ")}`);
    return lines;
}
export function checksOf(au) {
    const rows = [], N = IDS.to - IDS.from + 1, n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((q) => ARM_IDS.map((a) => [q, a]));
    const sizes = n === N && cells.every(([q, a]) => au[q][a] && au[q][a].length === N);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${N} ids in both conditions: ${sizes}` });
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
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.nets) && ref.length === 12 && ref.every((r, i) => au.nets[i] && au.nets[i].id === r.id && au.nets[i].stored === r.stored && J(Array.from(au.nets[i].weights)) === J(Array.from(r.weights))) && J(ref.map((r) => r.id)) === J(NET_IDS); } catch (e) { return false; } })();
    rows.push({ name: "THE TWELVE ARE THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the twelve networks are the weights at 1800 of H32's seeds 26011-26014, H34's 26031-26034 and H45's 26011-26014 (963 finite weights each), equal to what netsOf reads from the same stored rows: ${!!stored}` });
    const o = au.original, k = au.h27, reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && Array.isArray(au.wip) && au.wip.length === WEIGHT_COUNT && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const dj = au.range.from === IDS.from && au.range.to === IDS.to && au.range.from > EARLIER_AUDIT_END;
    rows.push({ name: "THE AUDIT IS 90200-90999, PAST EVERY EARLIER AUDIT", ok: dj, text: `the audit ids are exactly 90200-90999, and every earlier audit ended at ${EARLIER_AUDIT_END} or below: ${dj}` });
    const rec = (() => { try { return ARM_IDS.every((a) => { const v = penRunsAt(au, a, PRICE); return v.length === N && v.every((s, i) => { const r = au.dark[a][i], l = au.lit[a][i]; return Math.abs(s.score - (0.5 * ((r.bad ? 0 : r.score) + (l.bad ? 0 : l.score)) - 0.02 * 0.5 * (r.watts + l.watts) / 1000)) < 1e-12; }); }); } catch (e) { return false; } })();
    rows.push({ name: "THE PER-ID SCORES ARE THE OBJECTIVE RECOMPUTED FROM THE RAW RUNS", ok: !!rec, text: `every arm's per-id penalised priced score at 0.02 equals 0.5 x (dark' + lit') - 0.02 x 0.5 x (dark kW + lit kW), a lost run scoring 0, recomputed here from the raw runs, to 1e-12: ${!!rec}` });
    const nested = (() => { try { const v8 = view(au, 800); return ARM_IDS.every((a) => { const full = penRunsAt(v8, a, PRICE).map((r) => r.score); return SIZES.every((m) => J(penRunsAt(view(au, m), a, PRICE).map((r) => r.score)) === J(full.slice(0, m))) && near(avg([0, 1, 2, 3].map((b) => penMean(au, BLOCK, a, b * BLOCK))), avg(full)) && penMean(au, BLOCK, a, 0) === penMean(au, 200, a); }); } catch (e) { return false; } })();
    rows.push({ name: "THE SIZES ARE NESTED PREFIXES OF THE ONE FLIGHT AND THE BLOCKS PARTITION IT", ok: nested, text: `each of N50, N100, N200 and N400 is the first n ids of N800 (their per-id scores equal the first n of N800's), the mean of the four 200-id blocks equals the N800 mean (1e-9) and B0 is N200: ${nested}` });
    const once = au.reads === 1;
    rows.push({ name: "THE AUDIT IS READ ONCE", ok: once, text: `the one flight was handed in and read exactly once: ${once}` });
    const ctl = (() => { try { const x = au.dark.s02_26011.slice(0, CONTROL), y = au.dark.c02.slice(0, CONTROL), xl = au.lit.s02_26011.slice(0, CONTROL), yl = au.lit.c02.slice(0, CONTROL); const d = x.map((r, i) => 0.5 * ((r.bad ? 0 : r.score) + (xl[i].bad ? 0 : xl[i].score)) - 0.02 * 0.5 * (r.watts + xl[i].watts) / 1000 - (0.5 * ((y[i].bad ? 0 : y[i].score) + (yl[i].bad ? 0 : yl[i].score)) - 0.02 * 0.5 * (y[i].watts + yl[i].watts) / 1000)); return Math.abs(pen(au, CONTROL, "s02_26011", "c02").mean - avg(d)) < 1e-12; } catch (e) { return false; } })();
    rows.push({ name: "THE N200 CONTROL: THE PREFIX READING EQUALS A DIRECT COMPUTATION ON THE FIRST 200 IDS", ok: ctl, text: `the N200 paired mean of s02_26011 minus c02 equals the same mean computed directly from the first 200 raw runs (1e-12): ${ctl}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H70: a different audit set size (ids ${au.range.from}-${au.range.to}, ${au.range.to - au.range.from + 1} ids flown once at ${SECONDS} s, dark and lit, read at N50, N100, N200, N400 and N800 and in four blocks of 200; the twelve stored 1800-iteration networks, c02, q02, law0 and the autopilot); penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    const v8 = view(au, 800);
    R.push("means at N800 (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 1600):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(v8, a, "dark").toFixed(4)} / ${scoreMean(v8, a, "lit").toFixed(4)}   ${kwOf(v8, a).toFixed(2)}   ${kwOf(v8, a, "lit").toFixed(2)}   ${lostBoth(v8, a)}`);
    R.push("per arm at N800: dark / lit gain over the autopilot, extra power (kW, dark / lit):");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(v8, a))} / ${f4(gainOf(v8, a, "lit"))}  ${f3(extraKw(v8, a))} / ${f3(extraKw(v8, a, "lit"))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
