// WebGLEngine/tools/ship/headToHead24.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead24Cmd.mjs; the gate is tools/ship/headToHead24-selfcheck.mjs)
//
// ROUND H24 of brain/HEAD_TO_HEAD.md (registered before this file existed): s WIDENED, c02-big AGAINST c02 ON FRESH IDS, AND l02 AGAINST c02 ON THE DARK TANK. No search: thirteen fixed arms flown dark and lit on 200 fresh ids --
// the autopilot, law0, c02, c02-big (H20's mixed arm: c02's thrust only above 0.2 rad of heading error), l02 (H23's lit-only champion) and eight arms that are c02 with only `s` replaced (-8, -6, -4, -3, -2.5, -1.5, -1, 0).
// Read as the priced score (dark + lit, 0.02 per kW), the plain dark score and the dark priced score. Reads nothing from disk.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as H20 from "./headToHead20.mjs";
import * as X21 from "./headToHead21.mjs";
import * as X22 from "./headToHead22.mjs";
import * as X23 from "./headToHead23.mjs";

export const IDS = Object.freeze({ from: 24200, to: 24399 }), SECONDS = 160, PRICE = 0.02, BAND = H20.BAND;
export const LAW_C02 = X21.LAW_C02;
export const LAW_L02 = Object.freeze([1.5285188545844506, 0.14215273999243602, -0.5822553986190563, -0.6377199326759313]);
export const S_SCAN = Object.freeze([-8, -6, -4, -3, -2.5, -1.5, -1, 0]);
export const SCAN_IDS = Object.freeze(["s-8", "s-6", "s-4", "s-3", "s-2.5", "s-1.5", "s-1", "s0"]);
export const MORE_IDS = Object.freeze(["s-8", "s-6", "s-4", "s-3", "s-2.5"]), LESS_IDS = Object.freeze(["s-1.5", "s-1", "s0"]);
export const ORDER9 = Object.freeze(["s-8", "s-6", "s-4", "s-3", "s-2.5", "c02", "s-1.5", "s-1", "s0"]);
export const S_OF = Object.freeze({ "s-8": -8, "s-6": -6, "s-4": -4, "s-3": -3, "s-2.5": -2.5, c02: -2, "s-1.5": -1.5, "s-1": -1, s0: 0 });
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "c02-big", "l02", ...SCAN_IDS]);
/** The scan law for an `s`: c02's c, d, k and the s handed in. */
export const scanLaw = (s) => [LAW_C02[0], LAW_C02[1], LAW_C02[2], s];
const bigArm = () => { const kind = H20.mixKind("c02-big", {}, { law: LAW_C02 }, "big"); return { id: "c02-big", layer: "flying", controls: ["autopilot"], note: "mixed pilot c02-big", entry: () => ({ pilot: "network", circuit: kind.circuit, weights: [0] }), register: (tank) => tank.registerPilotKind(kind.circuit, kind) }; };
/** The 13 arms as { id: arm }. */
export function armsOf() {
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), "c02-big": bigArm(), l02: H16.lawArm("l02", LAW_L02) };
    SCAN_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, scanLaw(S_SCAN[i])); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 13; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, scanLaws (as built), fixed (c02 and l02 as built), band }. */
export function audit({ range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly } = {}) {
    const all = armsOf(), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead24.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, scanLaws: SCAN_IDS.map((id) => all[id].entry().weights), fixed: [all.c02.entry().weights, all.l02.entry().weights], band: BAND };
}
// ---- the readings
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, efficiencyOf = H15.efficiencyOf, scoreMean = H15.meanOf;
/** The per-id PRICED score of an arm: (dark + lit score)/2 - PRICE x (dark + lit kW)/2. */
export const pricedRuns = (au, a) => au.dark[a].map((r, i) => ({ key: r.key, score: 0.5 * (r.score + au.lit[a][i].score) - PRICE * 0.5 * (r.watts + au.lit[a][i].watts) / 1000, bad: false }));
/** The per-id DARK priced score of an arm: the dark score - PRICE x the dark kW. */
export const darkPricedRuns = (au, a) => au.dark[a].map((r) => ({ key: r.key, score: r.score - PRICE * r.watts / 1000, bad: false }));
export const pricedGain = (au, a) => { const p = pricedRuns(au, a), q = pricedRuns(au, "autopilot"); return avg(p.map((r, i) => r.score - q[i].score)); };
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
export const pairP = (au, a, b) => mk(B.paired(pricedRuns(au, a), pricedRuns(au, b)));
export const pairDarkScore = (au, a, b) => H15.pairOf(au, a, b, "dark");
export const pairDarkPriced = (au, a, b) => mk(B.paired(darkPricedRuns(au, a), darkPricedRuns(au, b)));
export const pairLitScore = (au, a, b) => H15.pairOf(au, a, b, "lit");
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
/** The arm among `ids` with the largest priced gain, the first of a tie in the order given. */
export function bestOf(au, ids) { let b = null, bg = -Infinity; for (const a of ids) { const g = pricedGain(au, a); if (g > bg) { b = a; bg = g; } } return b; }
/** The registered verdict, seven parts joined by "; ". */
export function verdictOf(au) {
    const bm = bestOf(au, MORE_IDS), bl = bestOf(au, LESS_IDS), b9 = bestOf(au, ORDER9);
    return [`THE BEST OF THE MORE NEGATIVE s (${S_OF[bm]}) ${word(pairP(au, bm, "c02").reading)} C02`, `THE BEST OF THE LESS NEGATIVE s (${S_OF[bl]}) ${word(pairP(au, bl, "c02").reading)} C02`, `THE BEST s OF THE SCAN IS ${S_OF[b9]}`,
        `C02-BIG ${word(pairP(au, "c02-big", "c02").reading)} C02`, `C02-BIG ${word(pairDarkScore(au, "c02-big", "c02").reading)} C02 ON THE DARK SCORE`,
        `L02 ${word(pairDarkScore(au, "l02", "c02").reading)} C02 ON THE DARK SCORE`, `L02 ${word(pairDarkPriced(au, "l02", "c02").reading)} C02 ON THE DARK PRICED SCORE`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), effText = (e) => (e === null ? "n/a" : e.toFixed(3));
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "c02-big", "l02", ...SCAN_IDS], bm = bestOf(au, MORE_IDS), bl = bestOf(au, LESS_IDS);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const order = [...ORDER9].sort((p, q) => pricedGain(au, q) - pricedGain(au, p) || ORDER9.indexOf(p) - ORDER9.indexOf(q));
    const row = (a) => `s ${S_OF[a]}: dark ${f4(gainOf(au, a))}, lit ${f4(gainOf(au, a, "lit"))}, extra kW ${f2(extraKw(au, a))} / ${f2(extraKw(au, a, "lit"))}, priced ${f4(pricedGain(au, a))}`;
    const share = gainOf(au, "c02") === 0 ? "n/a" : (gainOf(au, "c02-big") / gainOf(au, "c02")).toFixed(3);
    const dl = (a) => f4(pricedGain(au, a));
    return [
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `PRICED GAIN AT ${PRICE}: ${shown.slice(1).map((a) => `${a} ${dl(a)}`).join("; ")}`,
        `SCAN (dark gain, lit gain, dark / lit extra kW, priced gain; c02 is s -2): ${ORDER9.map(row).join("; ")}; ORDER BY PRICED GAIN: ${order.map((a) => S_OF[a]).join(", ")}`,
        `PAIRED: best more negative s (${S_OF[bm]}) minus c02, priced ${fmt(pairP(au, bm, "c02"))}; best less negative s (${S_OF[bl]}) minus c02, priced ${fmt(pairP(au, bl, "c02"))}; c02-big minus c02, priced ${fmt(pairP(au, "c02-big", "c02"))}; c02-big minus c02, dark score ${fmt(pairDarkScore(au, "c02-big", "c02"))}; l02 minus c02, dark score ${fmt(pairDarkScore(au, "l02", "c02"))}; l02 minus c02, dark priced ${fmt(pairDarkPriced(au, "l02", "c02"))}`,
        `POWER (dark extra kW, efficiency): ${["c02", "c02-big", "l02", ...SCAN_IDS].map((a) => `${a} ${f2(extraKw(au, a))}, ${effText(efficiencyOf(au, a))}`).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, c02 ${lostBoth(au, "c02")}, c02-big ${lostBoth(au, "c02-big")}, l02 ${lostBoth(au, "l02")}, scan ${SCAN_IDS.map((a) => lostBoth(au, a)).join(" / ")}`,
        `REPORTED, NOT IN THE VERDICT: l02 minus c02, dark-and-lit priced ${fmt(pairP(au, "l02", "c02"))}; lit tank: c02-big minus c02 ${fmt(pairLitScore(au, "c02-big", "c02"))}, l02 minus c02 ${fmt(pairLitScore(au, "l02", "c02"))}; c02-big's share of c02's dark gain ${share}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, J = JSON.stringify;
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const ident = ["dark", "lit"].every((c) => au[c].law0 && au[c].law0.every((r, i) => au[c].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[c].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const sl = Array.isArray(au.scanLaws) && au.scanLaws.length === SCAN_IDS.length && au.scanLaws.every((w, i) => J(w) === J(scanLaw(S_SCAN[i])));
    rows.push({ name: "SCAN LAWS ARE C02 WITH ONLY s CHANGED", ok: sl, text: `the eight scan arms fly c02's c, d, k with s = ${S_SCAN.join(", ")} in order: ${sl}` });
    const fx = Array.isArray(au.fixed) && au.fixed.length === 2 && J(au.fixed[0]) === J(LAW_C02) && J(au.fixed[1]) === J(LAW_L02) && au.band === 0.2 && !!au.dark.c02 && !!au.dark["c02-big"] && !!au.dark.l02;
    rows.push({ name: "C02, C02-BIG AND L02 ARE THE REGISTERED ONES", ok: fx, text: `c02 and l02 fly the registered laws and c02-big's band is 0.2 rad: ${fx}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|");
    const bigDiff = !!au.dark["c02-big"] && key("c02-big") !== key("c02") && key("c02-big") !== key("autopilot");
    rows.push({ name: "C02-BIG DIFFERS FROM C02 AND THE AUTOPILOT", ok: bigDiff, text: `c02-big's dark runs differ from c02's and the autopilot's: ${bigDiff}` });
    const nine = new Set(ORDER9.map(key)).size === ORDER9.length;
    rows.push({ name: "THE NINE s ARMS ARE DISTINCT", ok: nine, text: `the eight scan arms and c02 are pairwise different in the dark: ${nine}` });
    const idsOk = J(au.range) === J(IDS);
    const dj = disjoint(IDS, X21.IDS) && disjoint(IDS, X22.IDS) && disjoint(IDS, X23.IDS) && disjoint(au.range, X21.IDS) && disjoint(au.range, X22.IDS) && disjoint(au.range, X23.IDS) && disjoint(au.range, X21.TRAIN) && disjoint(au.range, X22.HELD) && disjoint(au.range, X23.HELD);
    rows.push({ name: "AUDIT IDS ARE THE REGISTERED ONES AND NEW", ok: idsOk && dj, text: `the audit ids are the registered ones and overlap none of H21's, H22's or H23's: ${idsOk && dj}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H24: s widened, c02-big against c02, l02 against c02 on the dark tank. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}`);
    R.push("per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), priced gain:");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${f4(pricedGain(au, a))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
