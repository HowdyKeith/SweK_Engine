// WebGLEngine/tools/ship/headToHead72.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead72Cmd.mjs; the gate is tools/ship/headToHead72-selfcheck.mjs)
//
// ROUND H72 of brain/HEAD_TO_HEAD.md (registered before this file existed): UNSEEN DISTURBANCES. The twelve stored 1800-iteration networks of H68, c02, q02, law0 and the autopilot are flown on six compass conditions on 200 fresh ids (92200-92399), 160 s, DARK RUN ONLY:
// D1 (the series' schedule 40 / 10 / 16, the control), D2 (40 / 10 / 28), D3 (40 / 10 / 8), D4 (20 / 5 / 8), D5 (80 / 20 / 32) and N1 (the tank's "navigator" event on D1). The score of an id is the dark score (heading error in the dark ticks) priced at 0.02 on the dark run alone,
// a lost run scoring 0, paired by id at 2 se. No search. The schedules go to the tank through setEvent's optional third argument (render/subAquariumSim.mjs, its own gate); the flights, arms and stored networks are H68's code. Reads and writes nothing itself.
"use strict";
import * as A from "../../render/subAquariumSim.mjs";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X68 from "./headToHead68.mjs";

export const IDS = Object.freeze({ from: 92200, to: 92399 }), SECONDS = 160, PRICE = 0.02, EARLIER_AUDIT_END = 91399, CONTROL = "D1";
export const SCHEDULES = Object.freeze({
    D1: Object.freeze({ event: "dropout", spec: Object.freeze({ period: 40, darkFrom: 10, darkLen: 16 }) }), D2: Object.freeze({ event: "dropout", spec: Object.freeze({ period: 40, darkFrom: 10, darkLen: 28 }) }),
    D3: Object.freeze({ event: "dropout", spec: Object.freeze({ period: 40, darkFrom: 10, darkLen: 8 }) }), D4: Object.freeze({ event: "dropout", spec: Object.freeze({ period: 20, darkFrom: 5, darkLen: 8 }) }),
    D5: Object.freeze({ event: "dropout", spec: Object.freeze({ period: 80, darkFrom: 20, darkLen: 32 }) }), N1: Object.freeze({ event: "navigator", spec: Object.freeze({ period: 40, darkFrom: 10, darkLen: 16 }) }) });
export const CONDITIONS = Object.freeze(["D1", "D2", "D3", "D4", "D5", "N1"]), OTHERS = Object.freeze(["D2", "D3", "D4", "D5", "N1"]);
export const ARM_IDS = X68.ARM_IDS, NET_IDS = X68.NET_IDS, LAW_C02 = X68.LAW_C02, WEIGHT_COUNT = X68.WEIGHT_COUNT;
export const netsOf = X68.netsOf, armsOf = X68.armsOf, fingerprint = X68.fingerprint, WIP_FINGERPRINT = X68.WIP_FINGERPRINT, flyPen = X68.flyPen, fixtureOf = X27.fixtureOf, spearman = X68.spearman, bestIdx = X68.bestIdx;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, penRunsAt = X27.penRunsAt, kwOf = H15.kwOf, scoreMean = H15.meanOf;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, near = (a, b) => Math.abs(a - b) < 1e-9;
/** A tank maker whose setEvent hands the schedule of `cond` as the third argument (`spy`, when given, is called with (id, event, spec) on every setEvent: the gate and the command read what the tank was handed). */
export function tankFor(cond, spy = null, makeTank = A.createTank) {
    const sc = SCHEDULES[cond]; if (!sc) throw new Error(`headToHead72.tankFor: no condition ${J(cond)}`);
    return () => { const q = makeTank(), se = q.setEvent.bind(q); q.setEvent = (id, ev) => { if (spy) spy(id, ev, sc.spec); return se(id, ev, sc.spec); }; return q; };
}
/** The arms of `arms` (default all 16; the autopilot always) on `range` ids in ONE condition, dark run only: { [arm]: runs }. `event` is the condition's event name. */
export function flyCondition(h27, nets, cond, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, spy = null, makeTank = A.createTank } = {}) {
    const sc = SCHEDULES[cond]; if (!sc) throw new Error(`headToHead72.flyCondition: no condition ${J(cond)}`);
    const all = armsOf(h27, nets), want = [...new Set(["autopilot", ...arms])], dark = {};
    for (const a of want) if (!all[a]) throw new Error(`headToHead72.flyCondition: no arm ${a}`);
    for (const a of want) dark[a] = flyFn(all[a], range, seconds, sc.event, tankFor(cond, spy, makeTank));
    return dark;
}
/** What the tank is handed in each condition: { cond: { event, spec } }, read from the setEvent calls a real tank receives through the wrapper (no step is taken). */
export function probeSchedules(makeTank = A.createTank) {
    const out = {}, arm = B.flyingArms({})[0];
    for (const c of CONDITIONS) { const got = []; const q = tankFor(c, (id, ev, spec) => got.push({ event: ev, spec }), makeTank)(); q.sync([{ id: "sb-1", name: "probe", hue: 100, from: "board", local: true, theta: null, ...arm.entry("sb-1") }]); q.setEvent("sb-1", SCHEDULES[c].event); out[c] = got.length === 1 ? got[0] : { event: null, spec: null }; }
    return out;
}
/** The control's proof: the autopilot and c02 on `range` flown 40 s by "dropout" with no schedule (`plain`) and through the D1 schedule path (`spec`): { plain, spec }, each { arm: runs }. */
export function controlOf(h27, nets, { range = { from: IDS.from, to: IDS.from + 1 }, seconds = 40, flyFn = flyPen } = {}) {
    const all = armsOf(h27, nets), plain = {}, spec = {};
    for (const a of ["autopilot", "c02"]) { plain[a] = flyFn(all[a], range, seconds, "dropout"); spec[a] = flyFn(all[a], range, seconds, "dropout", tankFor("D1")); }
    return { plain, spec };
}
/** The audit as H27's helpers read it in condition `cond`: lit is set to the dark runs, so the priced score (the mean of dark' and lit' minus the price on the mean power) is the DARK-RUN-ONLY priced score. */
export function view(au, cond) { if (!au.c || !au.c[cond]) throw new Error(`headToHead72.view: no flight in condition ${J(cond)}`); return { ...au, dark: au.c[cond], lit: au.c[cond] }; }
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, cond, a, b) => penPair(view(au, cond), a, b, PRICE);
export const penMean = (au, cond, a) => avg(penRunsAt(view(au, cond), a, PRICE).map((r) => r.score));
const lostIn = (au, cond, a) => au.c[cond][a].filter((r) => r.bad).length;
export const meanPower = (au, cond, a) => avg(au.c[cond][a].map((r) => r.watts)) / 1000;
const notBehind = (au, cond) => NET_IDS.filter((a) => pen(au, cond, a, "c02").reading !== "WORSE").length;
const bestOf = (au, cond) => NET_IDS[bestIdx(NET_IDS.map((a) => penMean(au, cond, a)))];
const rho = (au, cond) => spearman(NET_IDS.map((a) => penMean(au, cond, a)), NET_IDS.map((a) => penMean(au, CONTROL, a)));
const marginOf = (au, cond) => avg(NET_IDS.map((a) => pen(au, cond, a, "c02").mean));
const rd = (x) => (Number.isFinite(x) ? x.toFixed(2) : "NaN");
/** The networks whose reading against c02 in another condition differs from their reading in D1: [{ id, cond, a, b }] in network then condition order. */
export function changes(au) { const out = []; for (const id of NET_IDS) for (const c of OTHERS) { const a = pen(au, CONTROL, id, "c02").reading, b = pen(au, c, id, "c02").reading; if (a !== b) out.push({ id, cond: c, a, b }); } return out; }
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
/** The registered verdict, eight parts joined by "; ", every reading at 0.02 on the dark run. */
export function verdictOf(au) {
    const C = CONDITIONS, ch = changes(au), per = (f) => C.map((c) => `${c} ${f(c)}`).join(", ");
    const lost = (c) => { const l = NET_IDS.filter((a) => lostIn(au, c, a) > 0).map((a) => `${a} ${lostIn(au, c, a)}`); return l.length ? l.join(" ") : "NONE"; };
    return [`NETWORKS NOT BEHIND C02: ${per((c) => notBehind(au, c))} (OF 12)`, `BEST OF THE TWELVE: ${per((c) => bestOf(au, c))}`, `RANK CORRELATION OF THE TWELVE WITH THEIR D1 RANKING: ${OTHERS.map((c) => `${c} ${rd(rho(au, c))}`).join(", ")}`,
        `MEAN MARGIN OVER C02 OF THE TWELVE: ${per((c) => f4(marginOf(au, c)))}`, `LOST SUBS: ${per(lost)}`, `MEAN POWER OF THE TWELVE (KW): ${per((c) => avg(NET_IDS.map((a) => meanPower(au, c, a))).toFixed(2))}`,
        `C02 MINUS THE AUTOPILOT: ${per((c) => word(pen(au, c, "c02", "autopilot").reading))}`, `NETWORKS WHOSE READING AGAINST C02 CHANGES FROM D1: ${ch.length ? ch.map((x) => `${x.id} ${x.cond} ${word(x.a)} -> ${word(x.b)}`).join(", ") : "NONE"}`].join("; ");
}
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function bottomLines(au) {
    const lines = [], C = CONDITIONS;
    lines.push(`MEANS PER CONDITION (dark score / dark mean power kW / runs lost of 200): ${C.map((c) => `${c} ${["autopilot", "c02", "q02", ...NET_IDS].map((a) => `${a} ${scoreMean(view(au, c), a, "dark").toFixed(4)} / ${meanPower(au, c, a).toFixed(2)} / ${lostIn(au, c, a)}`).join("; ")}`).join(" || ")}`);
    for (const c of C) lines.push(`PAIRED AGAINST C02 IN ${c} (dark-only priced score at 0.02): ${NET_IDS.map((a) => `${a} ${fmt(pen(au, c, a, "c02"))}`).join("; ")}`);
    for (const c of ["D1", "N1"]) lines.push(`RANKING IN ${c} (audit mean at 0.02): ${[...NET_IDS].sort((x, y) => penMean(au, c, y) - penMean(au, c, x)).map((a) => `${a} ${penMean(au, c, a).toFixed(4)}`).join(", ")}`);
    lines.push(`VERDICT: ${verdictOf(au)}`);
    lines.push(`REPORTED, NOT IN THE VERDICT: unpriced dark score of every arm in each condition: ${C.map((c) => `${c} ${["autopilot", "c02", "q02", ...NET_IDS].map((a) => `${a} ${scoreMean(view(au, c), a, "dark").toFixed(4)}`).join(", ")}`).join(" || ")}`);
    lines.push(`REPORTED, NOT IN THE VERDICT: per-network margin over c02 in D1 / D2 / D3 / D4 / D5 / N1 and the change from D1: ${NET_IDS.map((a) => { const m = C.map((c) => pen(au, c, a, "c02").mean); return `${a} ${m.map(f4).join(" / ")} (changes ${m.slice(1).map((x) => f4(x - m[0])).join(" / ")})`; }).join("; ")}`);
    return lines;
}
const sameRun = (a, b) => a.length === b.length && a.every((r, i) => J(r) === J(b[i]));
export function checksOf(au) {
    const rows = [], N = IDS.to - IDS.from + 1, n = au.range.to - au.range.from + 1, has = (c) => au.c && au.c[c], cells = CONDITIONS.flatMap((c) => ARM_IDS.map((a) => [c, a])), all6 = CONDITIONS.every(has);
    const sizes = n === N && all6 && cells.every(([c, a]) => au.c[c][a] && au.c[c][a].length === N);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${N} ids in each of the six conditions: ${sizes}` });
    const aligned = all6 && cells.every(([c, a]) => au.c[c][a] && au.c[c][a].every((r, i) => au.c[c].autopilot[i] && r.key === au.c[c].autopilot[i].key && r.key === au.c.D1.autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids are the same in every arm and condition: ${aligned}` });
    const inside = all6 && cells.every(([c, a]) => au.c[c][a] && au.c[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no dark score outside (0, 1): ${inside}` });
    const watts = all6 && cells.every(([c, a]) => au.c[c][a] && au.c[c][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const differ = all6 && OTHERS.every((c) => au.c[c].autopilot.some((r, i) => r.score !== au.c.D1.autopilot[i].score));
    rows.push({ name: "EACH OTHER CONDITION CHANGES THE FLIGHT", ok: differ, text: `the autopilot's score in each of D2, D3, D4, D5 and N1 differs from its D1 score on at least one id: ${differ}` });
    const ident = all6 && CONDITIONS.every((c) => au.c[c].law0 && au.c[c].law0.every((r, i) => au.c[c].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au.c[c].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT IN EVERY CONDITION", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in every condition (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.nets) && ref.length === 12 && ref.every((r, i) => au.nets[i] && au.nets[i].id === r.id && au.nets[i].stored === r.stored && J(Array.from(au.nets[i].weights)) === J(Array.from(r.weights))) && J(ref.map((r) => r.id)) === J(NET_IDS); } catch (e) { return false; } })();
    rows.push({ name: "THE TWELVE ARE THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the twelve networks are the weights at 1800 of H32's seeds 26011-26014, H34's 26031-26034 and H45's 26011-26014 (963 finite weights each), equal to what netsOf reads from the same stored rows: ${!!stored}` });
    const o = au.original, k = au.h27, reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && Array.isArray(au.wip) && au.wip.length === WEIGHT_COUNT && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const dj = au.range.from === IDS.from && au.range.to === IDS.to && au.range.from > EARLIER_AUDIT_END;
    rows.push({ name: "THE AUDIT IS 92200-92399, PAST EVERY EARLIER AUDIT", ok: dj, text: `the audit ids are exactly 92200-92399, and every earlier audit ended at ${EARLIER_AUDIT_END} or below: ${dj}` });
    const rec = (() => { try { return all6 && CONDITIONS.every((c) => ARM_IDS.every((a) => { const v = penRunsAt(view(au, c), a, PRICE); return v.length === N && v.every((s, i) => { const r = au.c[c][a][i]; return Math.abs(s.score - ((r.bad ? 0 : r.score) - 0.02 * r.watts / 1000)) < 1e-12; }); })); } catch (e) { return false; } })();
    rows.push({ name: "THE PER-ID SCORES ARE THE DARK-ONLY OBJECTIVE RECOMPUTED FROM THE RAW RUNS", ok: !!rec, text: `every arm's per-id priced score at 0.02 in every condition equals the dark score (a lost run scoring 0) minus 0.02 x the dark kW, recomputed here from the raw runs, to 1e-12: ${!!rec}` });
    const tab = J(Object.fromEntries(CONDITIONS.map((c) => [c, SCHEDULES[c]]))) === J({ D1: { event: "dropout", spec: { period: 40, darkFrom: 10, darkLen: 16 } }, D2: { event: "dropout", spec: { period: 40, darkFrom: 10, darkLen: 28 } }, D3: { event: "dropout", spec: { period: 40, darkFrom: 10, darkLen: 8 } }, D4: { event: "dropout", spec: { period: 20, darkFrom: 5, darkLen: 8 } }, D5: { event: "dropout", spec: { period: 80, darkFrom: 20, darkLen: 32 } }, N1: { event: "navigator", spec: { period: 40, darkFrom: 10, darkLen: 16 } } });
    const fr = CONDITIONS.map((c) => SCHEDULES[c].spec.darkLen / SCHEDULES[c].spec.period), handed = !!au.probe && CONDITIONS.every((c) => au.probe[c] && au.probe[c].event === SCHEDULES[c].event && J(au.probe[c].spec) === J(SCHEDULES[c].spec));
    const sched = tab && Object.isFrozen(SCHEDULES) && CONDITIONS.every((c) => Object.isFrozen(SCHEDULES[c]) && Object.isFrozen(SCHEDULES[c].spec)) && J(fr) === J([0.4, 0.7, 0.2, 0.4, 0.4, 0.4]) && handed;
    rows.push({ name: "THE SCHEDULE TABLE IS AS REGISTERED AND THE TANK IS HANDED EXACTLY IT", ok: !!sched, text: `the five schedules and the navigator are the frozen table (dark fractions 0.4, 0.7, 0.2, 0.4, 0.4, 0.4), and the setEvent calls of one flight per condition carried exactly its event and numbers: ${!!sched}` });
    const c = au.control, ctl = !!c && ["autopilot", "c02"].every((a) => c.plain && c.spec && c.plain[a] && c.spec[a] && c.plain[a].length > 0 && sameRun(c.plain[a], c.spec[a]));
    rows.push({ name: "THE CONTROL IS THE SERIES' FLIGHT", ok: ctl, text: `D1 flown through the schedule path equals the same ids flown by "dropout" with no schedule, on every field of every run (the autopilot and c02 on the control's ids): ${ctl}` });
    const once = !!au.reads && CONDITIONS.every((x) => au.reads[x] === 1);
    rows.push({ name: "THE AUDIT IS READ ONCE PER CONDITION", ok: once, text: `each condition's flight was handed in and read exactly once: ${once}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H72: unseen disturbances (ids ${au.range.from}-${au.range.to}, ${au.range.to - au.range.from + 1} ids, ${SECONDS} s, dark run only, conditions D1 (the series' schedule 40 / 10 / 16), D2 40 / 10 / 28, D3 40 / 10 / 8, D4 20 / 5 / 8, D5 80 / 20 / 32 and N1 (the navigator on D1); the twelve stored 1800-iteration networks, c02, q02, law0 and the autopilot); dark-only priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    for (const c of CONDITIONS) {
        const v = view(au, c);
        R.push(`means in ${c} (dark score; dark mean power kW; lost runs of 200):`);
        for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(v, a, "dark").toFixed(4)}   ${kwOf(v, a).toFixed(2)}   ${lostIn(au, c, a)}`);
    }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
