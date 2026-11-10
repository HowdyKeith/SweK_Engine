// WebGLEngine/tools/ship/headToHead15.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead15Cmd.mjs; the gate is tools/ship/headToHead15-selfcheck.mjs)
//
// ROUND H15 of brain/HEAD_TO_HEAD.md (registered before this file existed): DOES THE NETWORKS' ADVANTAGE SURVIVE A PRICE ON SPEED? 44 arms (the autopilot, the identity thr+0, H13's eight constants, H14's six scheduled arms, the 28 networks of H9 as
// built-in gfc networks) flown on the tank's compass dropout (200 fresh ids, dark and lit) by this file's own flight, which scores EXACTLY as switchboard.dropout does (the gate holds it to the board) and also records the mean electrical power of the flight
// (subNeeds.mjs's power formula). Reads nothing from disk (the command hands the weights in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as N from "../../physics/mechanics/subNeeds.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as A from "../../render/subAquariumSim.mjs";
import * as H13 from "./headToHead13.mjs";
import * as H14 from "./headToHead14.mjs";
import * as H9 from "./headToHead9.mjs";

export const IDS = Object.freeze({ from: 15000, to: 15199 }), SECONDS = 160, TICK = 1 / 30, SETTLE = 12;
export const LEARN_MARGIN = 0.02, MIN_EXTRA_KW = 0.1, MORE = 1.25, LESS = 0.8, MIN_WATTS = 200, PRICES = Object.freeze([0.05, 0.1, 0.2]);
export const THRUST_MAX = S.createSubModel().spec.thrustMax, REVERSE = S.createSubModel().spec.reverseFraction;
export const CONSTANT_IDS = H13.SIMPLE_IDS, SCHEDULED_IDS = H14.SCHEDULED_IDS, NET_IDS = H9.NET_IDS, IDENT_ID = "thr+0";
export const ARM_IDS = Object.freeze(["autopilot", IDENT_ID, ...CONSTANT_IDS, ...SCHEDULED_IDS, ...NET_IDS]);
const TWO_PI = 2 * Math.PI, wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
/** The electrical power (W) of a thrust command at a speed through the water: subNeeds.mjs's `power` of the screw's thrust (the model's thrustMax x the command, x the reverse fraction when reversing; submerged fraction 1). */
export const wattsOf = (thrustCmd, speed) => N.power(THRUST_MAX * (thrustCmd >= 0 ? thrustCmd : thrustCmd * REVERSE), speed);
/** The 44 arms as { id: arm } (`nets` = a Map or object id -> 963 numbers). Networks are the built-in gfc ones (H13's), the scheduled arms H14's. */
export function armsOf(nets) {
    const a13 = H13.armsOf(nets), a14 = H14.armsOf(nets), out = {};
    for (const id of ARM_IDS) out[id] = SCHEDULED_IDS.includes(id) ? a14[id] : a13[id];
    return out;
}
/**
 * One arm on `range` ids in one condition ("dark": the compass dropout event; "lit": none): [{ key, score (as switchboard.dropout scores it), bad (the sub was lost), watts (the mean power over every tick), speed, thrust }]. `makeTank` is for the gate.
 */
export function fly(arm, range, seconds, event, makeTank = A.createTank) {
    const out = [];
    for (let n = range.from; n <= range.to; n++) {
        const id = "sb-" + n, q = makeTank();
        if (arm.register) arm.register(q);
        q.sync([{ id, name: "H15 " + arm.id, hue: 100, from: "board", local: true, theta: null, ...arm.entry(id) }]);
        if (event) q.setEvent(id, event);
        let target = null, age = 0, sum = 0, cnt = 0, sumAll = 0, cntAll = 0, w = 0, sp = 0, th = 0, ticks = 0;
        for (let i = 0, m = Math.round(seconds / TICK); i < m; i++) {
            q.step(TICK); const s = q.snapshot()[0];
            if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
            const dark = !!(s.compass && s.compass.valid === false), e = Math.abs(wrap(s.target.heading - s.heading));
            if (event ? dark : true) { sumAll += e; cntAll++; if (age >= SETTLE) { sum += e; cnt++; } }
            w += wattsOf(s.cmd.thrust, s.speed); sp += s.speed; th += s.cmd.thrust; ticks++;
        }
        const last = q.snapshot()[0], err = cnt ? sum / cnt : cntAll ? sumAll / cntAll : NaN;
        if (!Number.isFinite(err)) throw new Error(`headToHead15.fly: arm ${arm.id} id ${id} has no ticks in the bucket it is scored on`);
        out.push({ key: id, score: 1 - err / Math.PI, bad: !!last.lost, watts: w / ticks, speed: sp / ticks, thrust: th / ticks });
    }
    return out;
}
/** The arms of `arms` (default all 44; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets }. `flyFn` is the flight (the gate hands in a fake). */
export function audit(nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = fly } = {}) {
    const all = armsOf(nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead15.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets };
}
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, sum = (xs) => xs.reduce((p, q) => p + q, 0);
export const pairOf = (au, a, b, cond) => mk(B.paired(au[cond][a], au[cond][b]));
export const meanOf = (au, a, cond, field = "score") => avg(au[cond][a].map((r) => r[field]));
export const gainOf = (au, a, cond = "dark") => pairOf(au, a, "autopilot", cond).mean;
export const gainsOf = (au, ids, cond = "dark") => ids.map((a) => gainOf(au, a, cond));
/** The arm's extra power over the autopilot in kW (the mean of the per-id differences), in the condition. */
export const extraKw = (au, a, cond = "dark") => avg(au[cond][a].map((r, i) => r.watts - au[cond].autopilot[i].watts)) / 1000;
/** The mean power of the arm in kW, in the condition. */
export const kwOf = (au, a, cond = "dark") => meanOf(au, a, cond, "watts") / 1000;
/** Dark gain / extra kW, or null when the extra power is below MIN_EXTRA_KW. */
export const efficiencyOf = (au, a, cond = "dark") => { const x = extraKw(au, a, cond); return x >= MIN_EXTRA_KW ? gainOf(au, a, cond) / x : null; };
/** The networks' mean dark gain, mean extra power (kW) and power efficiency (null below MIN_EXTRA_KW). */
export function netEfficiency(au) { const g = avg(gainsOf(au, NET_IDS)), x = avg(NET_IDS.map((a) => extraKw(au, a))); return { gain: g, extra: x, eff: x >= MIN_EXTRA_KW ? g / x : null }; }
/** The best (largest) defined efficiency among `ids` (with, when `minGain` is given, a gain above it): { name, eff } or null; the first of a tie. */
export function bestEfficiency(au, ids, minGain = -Infinity) {
    let b = null; for (const a of ids) { const e = efficiencyOf(au, a); if (e !== null && gainOf(au, a) > minGain && (b === null || e > b.eff)) b = { name: a, eff: e }; } return b;
}
/** The priced gain of an arm at a price (score per kW): its dark gain less the price x its extra kW. */
export const pricedGain = (au, a, price) => gainOf(au, a) - price * extraKw(au, a);
/** { name, g } the network with the largest dark gain (the first of a tie). */
export function bestNetwork(au) { const g = gainsOf(au, NET_IDS); let b = 0; g.forEach((v, i) => { if (v > g[b]) b = i; }); return { name: NET_IDS[b], g: g[b] }; }
const ratioWord = (r, more, less, same) => (r >= MORE ? more : r <= LESS ? less : same);
/** The registered verdict, three parts joined by "; ". */
export function verdictOf(au) {
    const net = netEfficiency(au), c = bestEfficiency(au, CONSTANT_IDS), s = bestEfficiency(au, SCHEDULED_IDS, LEARN_MARGIN);
    let a;
    if (net.gain <= LEARN_MARGIN) a = "NOT ASSESSED: THE NETWORKS DID NOT GAIN";
    else if (net.eff === null) a = "NOT ASSESSED: THE NETWORKS' EXTRA POWER IS BELOW 0.1 kW";
    else a = ratioWord(net.eff / (c ? c.eff : 0), "THE NETWORKS ARE MORE POWER-EFFICIENT THAN EVERY CONSTANT", "THE NETWORKS ARE LESS POWER-EFFICIENT THAN THE BEST CONSTANT", "THE NETWORKS ARE ABOUT AS POWER-EFFICIENT AS THE BEST CONSTANT");
    const b = net.eff === null || net.gain <= LEARN_MARGIN ? "NOT ASSESSED" : ratioWord((s ? s.eff : 0) / net.eff, "A SCHEDULED LAW IS MORE POWER-EFFICIENT THAN THE NETWORKS", "A SCHEDULED LAW IS LESS POWER-EFFICIENT THAN THE NETWORKS", "A SCHEDULED LAW IS ABOUT AS POWER-EFFICIENT AS THE NETWORKS");
    const p = avg(au.dark.autopilot.map((r) => r.watts)) / 1000, cPart = `THE NETWORKS DRAW ${Math.abs(net.extra).toFixed(2)} kW ${net.extra >= 0 ? "MORE" : "LESS"} THAN THE AUTOPILOT (${Math.round(Math.abs(net.extra) / p * 100)} PERCENT)`;
    return `${a}; ${b}; ${cPart}`;
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), effText = (e) => (e === null ? "n/a" : e.toFixed(3));
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const rangeOf = (xs, f) => `${f(Math.min(...xs))} to ${f(Math.max(...xs))}`;
export function bottomLines(au) {
    const G = gainsOf(au, NET_IDS), net = netEfficiency(au), nk = NET_IDS.map((a) => kwOf(au, a)), cb = bestEfficiency(au, CONSTANT_IDS), bn = bestNetwork(au);
    const lc = CONSTANT_IDS.map((a) => lostBoth(au, a)), ls = SCHEDULED_IDS.map((a) => lostBoth(au, a)), ln = NET_IDS.map((a) => lostBoth(au, a));
    const priced = (a) => PRICES.map((p) => f4(pricedGain(au, a, p))).join(" / "), netPriced = PRICES.map((p) => f4(avg(NET_IDS.map((a) => pricedGain(au, a, p))))).join(" / ");
    return [
        `LEARNED: ${G.filter((g) => g > LEARN_MARGIN).length} OF ${NET_IDS.length} NETWORKS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN ${LEARN_MARGIN}; MEAN GAIN ${f4(net.gain)}`,
        `MEAN POWER (kW, dark): AUTOPILOT ${kwOf(au, "autopilot").toFixed(2)}; CONSTANTS ${CONSTANT_IDS.map((a) => kwOf(au, a).toFixed(2)).join(", ")}; SCHEDULED ${SCHEDULED_IDS.map((a) => kwOf(au, a).toFixed(2)).join(", ")}; THE NETWORKS ${avg(nk).toFixed(2)} (${rangeOf(nk, (x) => x.toFixed(2))})`,
        `EXTRA POWER (kW over the autopilot): CONSTANTS ${CONSTANT_IDS.map((a) => f2(extraKw(au, a))).join(", ")}; SCHEDULED ${SCHEDULED_IDS.map((a) => f2(extraKw(au, a))).join(", ")}; THE NETWORKS ${f2(net.extra)}`,
        `POWER EFFICIENCY (dark gain per extra kW): THE NETWORKS ${effText(net.eff)}; BEST CONSTANT ${cb ? `${cb.name} ${cb.eff.toFixed(3)}` : "n/a"}; SCHEDULED ${SCHEDULED_IDS.map((a) => `${a} ${effText(efficiencyOf(au, a))}`).join(", ")}`,
        `PRICED GAIN (dark gain less the price x extra kW) AT ${PRICES.map((p) => p.toFixed(2)).join(" / ")} PER kW: THE NETWORKS ${netPriced}; BEST NETWORK ${bn.name} ${priced(bn.name)}; thr+0.1 ${priced("thr+0.1")}; sched*1 ${priced("sched*1")}; sched*2 ${priced("sched*2")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, constants ${sum(lc)}, scheduled ${sum(ls)} (${Math.max(...ls)} in the worst), networks ${sum(ln)} (${Math.max(...ln)} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.watts) && r.watts >= MIN_WATTS));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${MIN_WATTS} W (the hotel load): ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET_IDS.every((id) => { const w = get(id); return !!w && w.length === 963 && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is 963 finite weights: ${nets}` });
    const ident = ["dark", "lit"].every((c) => au[c][IDENT_ID] && au[c][IDENT_ID].every((r, i) => au[c].autopilot[i] && Math.abs(r.score - au[c].autopilot[i].score) < 1e-6 && Math.abs(r.watts - au[c].autopilot[i].watts) < 1e-6));
    rows.push({ name: "IDENTITY ARM IS THE AUTOPILOT", ok: ident, text: `thr+0 equals the autopilot in score and in power on every id in both conditions (within 1e-6): ${ident}` });
    const t = H13.THR_IDS, w = (a) => (au.dark[a] ? kwOf(au, a) : NaN), draws = w(t[t.length - 1]) > w("autopilot");
    rows.push({ name: "LARGEST OFFSET DRAWS MORE POWER", ok: draws, text: `the largest thrust offset draws more power than the autopilot: ${draws}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET_IDS.map(key)).size === NET_IDS.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET_IDS.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const R = [`ROUND H15: does the networks' advantage survive a price on speed. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}`);
    R.push("per arm, dark / lit: gain over the autopilot, extra power (kW), power efficiency:");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a))} ${f3(extraKw(au, a))} ${effText(efficiencyOf(au, a)).padStart(6)}  |  ${f4(gainOf(au, a, "lit"))} ${f3(extraKw(au, a, "lit"))} ${effText(efficiencyOf(au, a, "lit")).padStart(6)}`);
    R.push("gains over the autopilot of the identity arm and the scheduled arms:");
    for (const a of [IDENT_ID, ...SCHEDULED_IDS]) R.push(`${a}:`, `   dark ${fmt(pairOf(au, a, "autopilot", "dark"))}`, `   lit  ${fmt(pairOf(au, a, "autopilot", "lit"))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
