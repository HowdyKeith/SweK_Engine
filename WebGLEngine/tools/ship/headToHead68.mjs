// WebGLEngine/tools/ship/headToHead68.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead68Cmd.mjs; the gate is tools/ship/headToHead68-selfcheck.mjs)
//
// ROUND H68 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT HELD-OUT SET -- THE SAME FRESH IDS FLOWN AT TWO OTHER HORIZONS. The twelve stored 1800-iteration networks (H32's S02, H34's T02, H45's N72), c02, q02, law0 and the
// autopilot are flown dark and lit on 200 fresh ids (88200-88399) at 80, 160 (the control) and 320 seconds, and read at 0.02 on H27's penalised priced score, paired by id, once per horizon. No search. Reads and writes nothing itself.
// The audit is { horizons: [80, 160, 320], h: { "80": { seconds, dark, lit }, ... }, reads: { "80": 1, ... }, ... }; every reading of a horizon goes through view(au, s), the audit as H27's helpers read it.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";
import * as X45 from "./headToHead45.mjs";

export const IDS = Object.freeze({ from: 88200, to: 88399 }), HORIZONS = Object.freeze([80, 160, 320]), CONTROL = 160, TICK = H15.TICK, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02, EARLIER_AUDIT_END = 87399;
export const NET_IDS = Object.freeze([...X45.S_IDS, ...X45.T_IDS, ...X45.N_IDS]), ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...NET_IDS]);
export const CHAMPION = "s02_26011", CHECKPOINT = 1800;
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The twelve stored networks from the stored search rows { S02, T02, N72 } (four rows each, seeds as the series ran them), the weights at 1800 in the order S02, T02, N72: [{ id, group, seed, weights, stored }]. */
export function netsOf(rows) {
    if (!rows || !["S02", "T02", "N72"].every((g) => Array.isArray(rows[g]))) throw new Error("headToHead68.netsOf: rows is { S02, T02, N72 }, four search rows each");
    const seeds = { S02: X32.SEEDS.S02, T02: [26031, 26032, 26033, 26034], N72: X45.SEEDS.N72 }, out = [];
    for (const g of ["S02", "T02", "N72"]) for (const s of seeds[g]) {
        const mine = rows[g].filter((r) => r && r.seed === s);
        if (mine.length !== 1) throw new Error(`headToHead68.netsOf: group ${g} needs one search row for seed ${s}, got ${mine.length}`);
        const k = cpOf(mine[0], CHECKPOINT);
        if (!k || !wOk(k.weights) || !Number.isFinite(k.heldScore)) throw new Error(`headToHead68.netsOf: ${g} seed ${s} needs a checkpoint at ${CHECKPOINT} of ${WEIGHT_COUNT} finite weights and a finite held-out value`);
        out.push({ id: g.toLowerCase() + "_" + s, group: g, seed: s, weights: Array.from(k.weights), stored: k.heldScore });
    }
    return out;
}
/** The arms as { id: arm }: `h27` = { laws: [q02] }; `nets` = netsOf's twelve. */
export function armsOf(h27, nets) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead68.armsOf: h27 is { laws: one 4-weight law }");
    if (!Array.isArray(nets) || nets.length !== 12 || !nets.every((n, i) => n && n.id === NET_IDS[i] && wOk(n.weights))) throw new Error(`headToHead68.armsOf: nets is the twelve networks ${NET_IDS.join(", ")} of ${WEIGHT_COUNT} finite weights each`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    nets.forEach((n) => { out[n.id] = netArm(n.id, n.weights); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 16; the autopilot is always flown) on `range` ids at ONE horizon of `seconds`, dark and lit: { dark, lit }. */
export function fly(h27, nets, { range = IDS, seconds = CONTROL, arms = ARM_IDS, flyFn = flyPen } = {}) {
    const all = armsOf(h27, nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead68.fly: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit };
}
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
/** The audit as H27's helpers read it, at horizon `s`: the dark and lit flights of that horizon. */
export const view = (au, s) => { if (!au.h || !au.h[s]) throw new Error(`headToHead68.view: no flight at ${s} s`); return { ...au, dark: au.h[s].dark, lit: au.h[s].lit, seconds: au.h[s].seconds }; };
const pen = (au, s, a, b) => penPair(view(au, s), a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 at horizon s. */
export const penMean = (au, s, a) => avg(penRunsAt(view(au, s), a, PRICE).map((r) => r.score));
/** The mean power of an arm at horizon s, kW (dark and lit). */
export const meanPower = (au, s, a) => (avg(view(au, s).dark[a].map((r) => r.watts)) + avg(view(au, s).lit[a].map((r) => r.watts))) / 2000;
export const bestIdx = (xs) => xs.reduce((b, v, i) => (v > xs[b] ? i : b), 0);
const ranks = (xs) => xs.map((x) => { const lt = xs.filter((y) => y < x).length, eq = xs.filter((y) => y === x).length; return lt + (eq + 1) / 2; });
/** Spearman's rho: the Pearson correlation of the ranks, ties averaged (NaN for a constant list). */
export function spearman(a, b) { const ra = ranks(a), rb = ranks(b), ma = avg(ra), mb = avg(rb); let sab = 0, saa = 0, sbb = 0; ra.forEach((x, i) => { sab += (x - ma) * (rb[i] - mb); saa += (x - ma) ** 2; sbb += (rb[i] - mb) ** 2; }); return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb); }
const notBehind = (au, s) => NET_IDS.filter((a) => pen(au, s, a, "c02").reading !== "WORSE").length;
const bestOf = (au, s) => NET_IDS[bestIdx(NET_IDS.map((a) => penMean(au, s, a)))];
const meansAt = (au, s) => NET_IDS.map((a) => penMean(au, s, a));
const marginAt = (au, s) => avg(NET_IDS.map((a) => pen(au, s, a, "c02").mean));
const lostNames = (au, s) => { const v = view(au, s), l = NET_IDS.filter((a) => lostBoth(v, a) > 0).map((a) => `${a} ${lostBoth(v, a)}`); return l.length ? l.join(", ") : "NONE"; };
const powerAt = (au, s) => avg(NET_IDS.map((a) => meanPower(au, s, a)));
const rho = (au, s) => spearman(meansAt(au, s), meansAt(au, CONTROL));
/** The networks whose reading against c02 at an other horizon differs from their reading at 160 s: [{ id, s, control, other }]. */
export function changes(au) {
    const out = [];
    for (const a of NET_IDS) for (const s of HORIZONS) if (s !== CONTROL) { const c = pen(au, CONTROL, a, "c02").reading, o = pen(au, s, a, "c02").reading; if (c !== o) out.push({ id: a, s, control: c, other: o }); }
    return out;
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const rd = (x) => (Number.isFinite(x) ? x.toFixed(2) : "NaN");
/** The registered verdict, eight parts joined by "; " (part A holds two "; " inside), every reading at 0.02. */
export function verdictOf(au) {
    const H = HORIZONS, [a, b, c] = H, ch = changes(au);
    const reads = (s) => `${word(pen(au, s, "c02", "autopilot").reading)}`;
    return [`AT ${a} S NETWORKS NOT BEHIND C02: ${notBehind(au, a)} OF 12; AT ${b} S: ${notBehind(au, b)} OF 12; AT ${c} S: ${notBehind(au, c)} OF 12`,
        `BEST OF THE TWELVE AT ${a} S: ${bestOf(au, a)}, AT ${b} S: ${bestOf(au, b)}, AT ${c} S: ${bestOf(au, c)}`,
        `RANK CORRELATION OF THE TWELVE WITH THEIR ${b} S RANKING: ${a} S ${rd(rho(au, a))}, ${c} S ${rd(rho(au, c))}`,
        `MEAN MARGIN OVER C02 OF THE TWELVE: ${a} S ${f4(marginAt(au, a))}, ${b} S ${f4(marginAt(au, b))}, ${c} S ${f4(marginAt(au, c))}`,
        `LOST SUBS: ${a} S ${lostNames(au, a)}, ${b} S ${lostNames(au, b)}, ${c} S ${lostNames(au, c)}`,
        `MEAN POWER OF THE TWELVE (KW): ${a} S ${powerAt(au, a).toFixed(2)}, ${b} S ${powerAt(au, b).toFixed(2)}, ${c} S ${powerAt(au, c).toFixed(2)}`,
        `C02 MINUS THE AUTOPILOT: ${a} S ${reads(a)}, ${b} S ${reads(b)}, ${c} S ${reads(c)}`,
        `NETWORKS WHOSE READING AGAINST C02 CHANGES BETWEEN ${b} S AND THE OTHER HORIZONS: ${ch.length ? ch.map((x) => `${x.id} at ${x.s} s ${word(x.control)} -> ${word(x.other)}`).join(", ") : "NONE"}`].join("; ");
}
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function bottomLines(au) {
    const lines = [];
    for (const s of HORIZONS) {
        const v = view(au, s), mean = (a) => penMean(au, s, a), arm = (a) => `${a} ${scoreMean(v, a, "dark").toFixed(4)} / ${scoreMean(v, a, "lit").toFixed(4)}, ${kwOf(v, a).toFixed(2)} kW, lost ${lostBoth(v, a)}`;
        lines.push(`MEANS AT ${s} S (dark / lit mean score, dark mean power, runs lost of 400): ${["autopilot", "c02", "q02", ...NET_IDS].map(arm).join("; ")}`);
        lines.push(`PAIRED AGAINST C02 AT ${s} S (penalised priced score at 0.02): ${NET_IDS.map((a) => `${a} ${fmt(pen(au, s, a, "c02"))}`).join("; ")}`);
        const order = NET_IDS.map((a) => a).sort((x, y) => mean(y) - mean(x));
        lines.push(`RANKING AT ${s} S (audit mean at 0.02): ${order.map((a) => `${a} ${mean(a).toFixed(4)}`).join(", ")}`);
    }
    lines.push(`VERDICT: ${verdictOf(au)}`);
    lines.push(`REPORTED, NOT IN THE VERDICT: unpenalised-free gain over the autopilot at 0.005 / 0.02 / 0.04 per horizon: ${HORIZONS.map((s) => `${s} s ${["c02", "q02", ...NET_IDS].map((a) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(view(au, s), a, p))).join(" / ")}`).join("; ")}`).join(" | ")}`);
    lines.push(`REPORTED, NOT IN THE VERDICT: per-network margin over c02 at ${HORIZONS.join(" / ")} s and the change from 160 s: ${NET_IDS.map((a) => { const m = HORIZONS.map((s) => pen(au, s, a, "c02").mean); return `${a} ${m.map(f4).join(" / ")} (80-160 ${f4(m[0] - m[1])}, 320-160 ${f4(m[2] - m[1])})`; }).join("; ")}`);
    return lines;
}
const near = (a, b) => Math.abs(a - b) < 1e-9;
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, H = au.horizons || [], hs = HORIZONS.filter((s) => au.h && au.h[s]);
    const cells = hs.flatMap((s) => ["dark", "lit"].flatMap((q) => ARM_IDS.map((a) => [s, q, a])));
    const sizes = hs.length === 3 && cells.every(([s, q, a]) => au.h[s][q][a] && au.h[s][q][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids at each of the three horizons in both conditions: ${sizes}` });
    const aligned = hs.length === 3 && cells.every(([s, q, a]) => au.h[s][q][a] && au.h[s][q][a].every((r, i) => au.h[s][q].autopilot[i] && r.key === au.h[s][q].autopilot[i].key && r.key === au.h[CONTROL].dark.autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids are the same in every arm, condition and horizon: ${aligned}` });
    const inside = hs.length === 3 && cells.every(([s, q, a]) => au.h[s][q][a] && au.h[s][q][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = hs.length === 3 && cells.every(([s, q, a]) => au.h[s][q][a] && au.h[s][q][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = hs.length === 3 && hs.every((s) => !!au.h[s].dark.autopilot && au.h[s].dark.autopilot.some((r, i) => r.score !== au.h[s].lit.autopilot[i].score));
    rows.push({ name: "EVENT REACHES THE FLIGHT AT EACH HORIZON", ok: event, text: `the autopilot's dark and lit scores differ on at least one id at each horizon: ${event}` });
    const ident = hs.length === 3 && hs.every((s) => ["dark", "lit"].every((q) => au.h[s][q].law0 && au.h[s][q].law0.every((r, i) => au.h[s][q].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au.h[s][q].autopilot[i][k]) < 1e-6))));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT AT EACH HORIZON", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions at each horizon (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const horiz = J(H) === J(HORIZONS) && hs.length === 3 && hs.every((s) => au.h[s].seconds === s && Number.isInteger(Math.round(s / TICK)) && Math.round(s / TICK) === s * 30) && au.h[80].seconds * 4 === au.h[320].seconds && au.h[160].seconds === CONTROL;
    rows.push({ name: "THE HORIZONS ARE AS REGISTERED: 80, 160 AND 320 S, EACH FLIGHT CARRYING ITS OWN SECONDS", ok: horiz, text: `the horizons are exactly 80, 160 and 320 s, each flight's recorded seconds is its own horizon, and s seconds is s x 30 ticks: ${horiz}` });
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.nets) && ref.length === 12 && ref.every((r, i) => au.nets[i] && au.nets[i].id === r.id && au.nets[i].stored === r.stored && J(Array.from(au.nets[i].weights)) === J(Array.from(r.weights))) && J(ref.map((r) => r.id)) === J(NET_IDS); } catch (e) { return false; } })();
    rows.push({ name: "THE TWELVE ARE THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the twelve networks are the weights at 1800 of H32's seeds 26011-26014, H34's 26031-26034 and H45's 26011-26014 (963 finite weights each), equal to what netsOf reads from the same stored rows: ${!!stored}` });
    const o = au.original, k = au.h27, reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const dj = au.range.from === 88200 && au.range.to === 88399 && au.range.from > EARLIER_AUDIT_END;
    rows.push({ name: "THE AUDIT IS 88200-88399, PAST EVERY EARLIER AUDIT", ok: dj, text: `the audit ids are exactly 88200-88399, and every earlier audit ended at ${EARLIER_AUDIT_END} or below: ${dj}` });
    const rec = (() => { try { return hs.length === 3 && hs.every((s) => ARM_IDS.every((a) => { const v = penRunsAt(view(au, s), a, PRICE); return v.length === n && v.every((q, i) => { const r = au.h[s].dark[a][i], l = au.h[s].lit[a][i]; return Math.abs(q.score - (0.5 * ((r.bad ? 0 : r.score) + (l.bad ? 0 : l.score)) - 0.02 * 0.5 * (r.watts + l.watts) / 1000)) < 1e-12; }); })); } catch (e) { return false; } })();
    rows.push({ name: "THE PER-ID SCORES ARE THE OBJECTIVE RECOMPUTED FROM THE RAW RUNS", ok: !!rec, text: `every arm's per-id penalised priced score at 0.02 at each horizon equals 0.5 x (dark' + lit') - 0.02 x 0.5 x (dark kW + lit kW), a lost run scoring 0, recomputed here from the raw runs, to 1e-12: ${!!rec}` });
    const ctl = (() => { try { return Math.abs(penMean(au, CONTROL, CHAMPION) - penMean(au, CONTROL, "c02")) < 0.02; } catch (e) { return false; } })();
    rows.push({ name: "THE 160 S CONTROL: S02_26011 IS WITHIN 0.02 OF C02", ok: ctl, text: `at 160 s the audit mean of s02_26011 is within 0.02 of c02's, 0.02 being the widest gap any earlier round read for it: ${ctl}` });
    const once = hs.length === 3 && !!au.reads && HORIZONS.every((s) => au.reads[s] === 1);
    rows.push({ name: "THE AUDIT IS READ ONCE PER HORIZON", ok: once, text: `each horizon's flight was handed in and read exactly once: ${once}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H68: a different held-out set (the same fresh ids ${au.range.from}-${au.range.to}, ${au.range.to - au.range.from + 1} ids, flown at ${HORIZONS.join(", ")} s; the twelve stored 1800-iteration networks, c02, q02, law0 and the autopilot), dark and lit; read once per horizon, penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    for (const s of HORIZONS) {
        const v = view(au, s);
        R.push(`means at ${s} s (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):`);
        for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(v, a, "dark").toFixed(4)} / ${scoreMean(v, a, "lit").toFixed(4)}   ${kwOf(v, a).toFixed(2)}   ${kwOf(v, a, "lit").toFixed(2)}   ${lostBoth(v, a)}`);
        R.push(`  per arm at ${s} s: dark / lit gain over the autopilot, extra power (kW, dark / lit):`);
        for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(v, a))} / ${f4(gainOf(v, a, "lit"))}  ${f3(extraKw(v, a))} / ${f3(extraKw(v, a, "lit"))}`);
    }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
