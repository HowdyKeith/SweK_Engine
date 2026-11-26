// WebGLEngine/tools/ship/headToHead33.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead33Cmd.mjs; the gate is tools/ship/headToHead33-selfcheck.mjs)
//
// ROUND H33 of brain/HEAD_TO_HEAD.md (registered before this file existed): A SECOND AUDIT OF H32'S NETWORKS ON FRESH IDS. No search: the ten arms (autopilot, law0, c02, q02, m02, x02_2400 and H32's four champions s02_900 / s02_1200 / s02_1500 / s02_1800) are flown dark and lit on the
// 200 ids 33200-33399, 160 s, read once, at the price 0.02 on H27's penalised priced score; the 1800 champion is paired against c02, the law of the price and its two neighbours, and against c02 pooled with H32's stored audit (400 pairs); a re-fly of ten of H32's ids
// licenses the pooling. Reads and writes nothing itself (the command hands in the stored results).
"use strict";
import * as H15 from "./headToHead15.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X29 from "./headToHead29.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 33200, to: 33399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, REFLY = Object.freeze({ from: 32200, to: 32209 });
export const S_IDS = Object.freeze(["s02_900", "s02_1200", "s02_1500", "s02_1800"]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", "m02", "x02_2400", ...S_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, flyPen = X32.flyPen;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
/** The ten arms' audit on `range` (default the ids 33200-33399); `arms` (default all ten; the autopilot is always flown) names a subset. h27 = { laws: [q02], nets: [m02] }, h29 = { nets: [x02_2400] }, h30 = { nets: [y02_900] }, fresh = { nets: [s02_900 .. s02_1800] } (H32's champions). */
export function audit(wip, h27, h29, h30, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, original = null, original29 = null, original30 = null, h32 = null, prior = null, refly = null, fixture = null } = {}) {
    for (const a of arms) if (!ARM_IDS.includes(a)) throw new Error(`headToHead33.audit: no arm ${a}`);
    const all = X32.armsOf(wip, h27, h29, h30, fresh), want = [...new Set(["autopilot", ...arms])], dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, h29, h30, fresh, original, original29, original30, h32, prior, refly, fixture, c02: all.c02.entry().weights };
}
/** The re-fly of H32's first ids with c02 and s02_1800 (the command flies it; the check compares it with H32's stored runs). */
export function reflyOf(wip, h27, h29, h30, fresh, { range = REFLY, seconds = SECONDS, flyFn = flyPen } = {}) {
    const a = X32.audit(wip, h27, h29, h30, fresh, { range, seconds, arms: ["c02", "s02_1800"], flyFn });
    return { range, seconds, dark: { c02: a.dark.c02, s02_1800: a.dark.s02_1800 }, lit: { c02: a.lit.c02, s02_1800: a.lit.s02_1800 } };
}
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
/** The audit as { dark, lit } of the pooled ids: H32's stored runs of the arms named, then this audit's, in that order. */
export const pooledOf = (au, arms) => { const o = { dark: {}, lit: {} }; for (const a of [...new Set(["autopilot", ...arms])]) for (const c of ["dark", "lit"]) o[c][a] = [...au.prior[c][a], ...au[c][a]]; return o; };
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** The registered verdict, seven parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const lost = S_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), rd = (b) => word(pen(au, "s02_1800", b).reading), pool = pooledOf(au, ["c02", "s02_1800"]);
    const g = pen(au, "s02_1500", "c02").reading === "WORSE" && pen(au, "s02_1800", "c02").reading !== "WORSE";
    return [`THE 1800 CHAMPION ${rd("c02")} C02`, `THE 1800 CHAMPION ${rd("q02")} THE LAW OF THE PRICE`, `THE 1800 CHAMPION ${rd("s02_1500")} THE 1500 CHAMPION`, `THE 1800 CHAMPION ${rd("s02_1200")} THE 1200 CHAMPION`,
        `LOST SUBS IN THE S02 NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`, `POOLED OVER 400 IDS THE 1800 CHAMPION ${word(penPair(pool, "s02_1800", "c02", PRICE).reading)} C02`, `THE 1500 CHAMPION IS BEHIND C02 AND THE 1800 CHAMPION IS NOT: ${g ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
/** The largest absolute difference between the re-fly and H32's stored runs over score, power and thrust (0 when identical). */
export const reflyGap = (au) => { let m = 0; for (const c of ["dark", "lit"]) for (const a of ["c02", "s02_1800"]) au.refly[c][a].forEach((r, i) => { const s = au.prior[c][a][i]; for (const k of ["score", "watts", "thrust"]) m = Math.max(m, Math.abs(r[k] - s[k])); }); return m; };
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", "m02", "x02_2400", ...S_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`;
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((c) => au[c][a].filter((r) => r.bad).map((r) => `${a} ${c} ${r.key}`)));
    const pairs = [...["c02", "q02", "m02", "x02_2400", "s02_1500", "s02_1200", "s02_900"].map((b) => `s02_1800 minus ${b} at 0.02 ${fmt(pen(au, "s02_1800", b))}`), ...S_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`)];
    const pool = pooledOf(au, ["c02", "s02_1800"]), p0 = { dark: au.prior.dark, lit: au.prior.lit }, old = (a) => fmt(penPair(p0, a, "c02", PRICE));
    return [
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score at 0.02, the new ids): ${pairs.join("; ")}`,
        `POOLED (400 pairs, H32's 200 ids then these 200): s02_1800 minus c02 at 0.02 ${fmt(penPair(pool, "s02_1800", "c02", PRICE))}; H32's ids alone, as stored: s02_1800 minus c02 ${old("s02_1800")}; the new ids alone ${fmt(pen(au, "s02_1800", "c02"))}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}; H32's stored audit alone against c02 for the other checkpoints: ${["s02_1500", "s02_1200"].map((a) => `${a} ${old(a)}`).join("; ")}; the re-fly of ${au.refly.range.to - au.refly.range.from + 1} of H32's ids differs from its stored runs by at most ${reflyGap(au).toExponential(1)}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
const same = (r, s) => ["key", "score", "bad", "watts", "thrust"].every((k) => r[k] === s[k]);
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const aligned = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids are the same in every arm and condition: ${aligned}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const ident = ["dark", "lit"].every((c) => au[c].law0 && au[c].law0.every((r, i) => au[c].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[c].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const h = au.h32, fr = au.fresh, stored = !!h && Array.isArray(h.search) && !!fr && Array.isArray(fr.nets) && fr.nets.length === 4 && fr.nets.every(wOk) && (() => { try { return X32.CHECKPOINTS.every((it, k) => J(Array.from(X32.champion(h.search, it).weights)) === J(Array.from(fr.nets[k]))); } catch (e) { return false; } })();
    rows.push({ name: "THE FOUR S02 NETWORKS ARE H32'S STORED CHAMPIONS", ok: !!stored, text: `s02_900, s02_1200, s02_1500 and s02_1800 are the champions of H32's stored search at 900, 1200, 1500 and 1800 by H32's rule: ${!!stored}` });
    const y = !!au.h30 && Array.isArray(au.h30.nets) && au.h30.nets.length === 1 && !!fr && Array.isArray(fr.nets) && !!fr.nets[0] && J(Array.from(au.h30.nets[0])) === J(Array.from(fr.nets[0]));
    rows.push({ name: "S02_900 IS H30'S 900-ITERATION CHAMPION", ok: !!y, text: `s02_900 has exactly the weights of H30's 900-iteration champion: ${!!y}` });
    const c02 = J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02 AND WIP ARE THE REGISTERED ONES", ok: !!c02, text: `c02 is the registered law and wip has the shipped fingerprint: ${!!c02}` });
    const o = au.original, o9 = au.original29, o30 = au.original30, k = au.h27, k9 = au.h29;
    const reg = !!o && Array.isArray(o.search) && !!o9 && Array.isArray(o9.search) && !!o30 && Array.isArray(o30.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && Array.isArray(k.nets) && k.nets.length === 1 && !!k9 && Array.isArray(k9.nets) && k9.nets.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]) && J(Array.from(X27.netChampion(o.search, "M02").weights)) === J(Array.from(k.nets[0])) && J(Array.from(X29.champion(o9.search, "L02", 2400).weights)) === J(Array.from(k9.nets[0])) && J(Array.from(X30.champion(o30.search, "P02", 900).weights)) === J(Array.from(au.h30.nets[0])); } catch (e) { return false; } })();
    rows.push({ name: "Q02, M02 AND X02_2400 ARE THE STORED CHAMPIONS", ok: !!reg, text: `q02, m02, x02_2400 (and y02_900) are the champions of H27's, H29's and H30's stored searches by their rounds' rules: ${!!reg}` });
    const ids = au.range, dj = [...TRAIN, HELD].every((a) => disjoint(a, ids)) && ids.from > 32399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the train ids 26000-26023 and 30000-30047 or the held-out ids 26100-26139, and start after H32's audit (to 32399): ${dj}` });
    const rf = au.refly, pr = au.prior;
    const reflown = !!rf && !!pr && !!rf.range && rf.range.from === 32200 && rf.range.to === 32209 && ["dark", "lit"].every((c) => ["c02", "s02_1800"].every((a) => rf[c] && rf[c][a] && rf[c][a].length === 10 && pr[c] && pr[c][a] && rf[c][a].every((r, i) => same(r, pr[c][a][i]))));
    rows.push({ name: "THE SAME NETWORK ON THE SAME IDS GIVES THE SAME RUNS", ok: reflown, text: `c02 and s02_1800 re-flown on H32's ids 32200-32209 (dark and lit) equal H32's stored runs in key, score, lost flag, power and thrust to the last digit: ${reflown}` });
    const have = !!pr && !!pr.range && pr.range.from === 32200 && pr.range.to === 32399 && ["dark", "lit"].every((c) => ["autopilot", "c02", "s02_1800"].every((a) => pr[c] && pr[c][a] && pr[c][a].length === 200 && pr[c][a].every((r, i) => r.key === "sb-" + (32200 + i)))) && ["dark", "lit"].every((c) => pr[c].c02.every((r) => !r.bad));
    rows.push({ name: "H32'S STORED AUDIT HOLDS THE SAME 200 IDS AND NO LOST C02 RUN", ok: have, text: `H32's stored audit has the ids sb-32200 to sb-32399 for the autopilot, c02 and s02_1800 in both conditions, and c02 lost no run there: ${have}` });
    const pooled = have && sizes && (() => { const p = pooledOf(au, ["c02", "s02_1800"]); return penRunsAt(p, "s02_1800", PRICE).length === 400 && new Set(p.dark.c02.map((r) => r.key)).size === 400; })();
    rows.push({ name: "THE POOLED PAIRING HAS 400 DISTINCT PAIRS", ok: !!pooled, text: `the pooled pairing of s02_1800 and c02 has 400 pairs with 400 distinct ids: ${!!pooled}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H33: a second audit of H32's networks on fresh ids. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
