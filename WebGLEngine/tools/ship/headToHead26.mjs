// WebGLEngine/tools/ship/headToHead26.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead26Cmd.mjs; the gate is tools/ship/headToHead26-selfcheck.mjs)
//
// ROUND H26 of brain/HEAD_TO_HEAD.md (registered before this file existed): A NETWORK RE-SEARCHED AT A PRICE. Three groups of four (1+1)-ES searches (600 iterations, PS.mutate: 1 to 4 of the 963 weights moved by a gaussian of 0.3) of the weights
// of network-Wip, each scored on the priced compass-dropout objective of H18 (dark + lit, train ids) at one price (0.005, 0.02, 0.04 per kW); champions by held-out value at their own price; audited on 200 fresh ids, dark and lit, with c02, H25's law
// champions p005, p02 and p04, wip itself and the three champions, every arm read at every price. Reads nothing from disk (the command hands Wip's weights and the search rows in).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X21 from "./headToHead21.mjs";
import * as X25 from "./headToHead25.mjs";

export const TRAIN = Object.freeze({ from: 26000, to: 26023 }), HELD = Object.freeze({ from: 26100, to: 26139 }), IDS = Object.freeze({ from: 26200, to: 26399 });
export const SECONDS = 160, ITERS = 600, SIGMA = 0.3, MAXK = 4, FULL_THROTTLE = 0.9, WEIGHT_COUNT = 963;
export const PRICES = Object.freeze([0.005, 0.02, 0.04]);
export const GROUPS = Object.freeze(["N005", "N02", "N04"]);
export const SEEDS = Object.freeze({ N005: Object.freeze([26001, 26002, 26003, 26004]), N02: Object.freeze([26011, 26012, 26013, 26014]), N04: Object.freeze([26021, 26022, 26023, 26024]) });
export const LAMBDAS = Object.freeze({ N005: 0.005, N02: 0.02, N04: 0.04 });
export const LAW_C02 = X21.LAW_C02;
export const LAW_P005 = Object.freeze([3.506463290033553, 0.7292417649335005, -0.6807759855495743, -1.7474764038507211]);
export const LAW_P02 = Object.freeze([2.8823542467207113, 0.5466846692812615, -0.5103716783123562, -1.768174233098625]);
export const LAW_P04 = Object.freeze([2.9973822208171343, 0.08707879301992326, -0.4334428755360097, -1.683318566218874]);
/** The fingerprint of the shipped network-Wip weights (brain/pilotSubWeightsWip.json): the count, the sum and the sum of squares. */
export const WIP_FINGERPRINT = Object.freeze({ count: 963, sum: -3.6107000508345664, sumsq: 276.80561788717506 });
export const CHAMP_IDS = Object.freeze(["n005", "n02", "n04"]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "p005", "p02", "p04", "wip", ...CHAMP_IDS]);
/** The candidates for "best at a price", in the order a tie is broken. */
export const CAND_IDS = Object.freeze(["c02", "p005", "p02", "p04", "wip", ...CHAMP_IDS]);
const checkGroup = (g) => { if (!GROUPS.includes(g)) throw new Error(`headToHead26: the group must be one of ${GROUPS.join(", ")}, got ${JSON.stringify(g)}`); };
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const isW = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
/** The fingerprint of a weight vector (count, sum, sum of squares). */
export const fingerprint = (w) => { let sum = 0, sumsq = 0; for (const v of w) { sum += v; sumsq += v * v; } return { count: w.length, sum, sumsq }; };
/** A network arm (the Giant Fiber Circuit pilot with weights `w`). */
export const netArm = (id, w) => ({ id, layer: "flying", controls: ["autopilot"], note: `network ${id}`, entry: () => ({ pilot: "network", circuit: "gfc", weights: Array.from(w) }) });
/** The priced objective of a network at a price: (dark + lit mean score)/2 - price x (dark + lit mean kW)/2, on `range` ids (H18's objective with a network arm). */
export function netObjective(w, range, price, seconds = SECONDS, flyFn = H15.fly) {
    if (!(price >= 0)) throw new Error(`headToHead26.netObjective: the price must be a number of 0 or more, got ${JSON.stringify(price)}`);
    const arm = netArm("net", w), d = flyFn(arm, range, seconds, "dropout"), l = flyFn(arm, range, seconds, null);
    return 0.5 * (avg(d.map((r) => r.score)) + avg(l.map((r) => r.score))) - price * 0.5 * (avg(d.map((r) => r.watts)) + avg(l.map((r) => r.watts))) / 1000;
}
/** One (1+1)-ES search of a group from the weights `start` (network-Wip's): PS.mutate children, kept when the TRAIN priced objective at the group's price is at least the parent's. The first scored candidate is `start` itself.
 *  Returns { seed, group, weights, startTrain, trainScore, heldScore, accepted, iters, changed } (startTrain = the start's own TRAIN value; changed = how many weights differ from the start). */
export function searchOne(seed, group, start, { iters = ITERS, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = H15.fly } = {}) {
    checkGroup(group);
    if (!isW(start)) throw new Error(`headToHead26.searchOne: the start must be ${WEIGHT_COUNT} finite weights`);
    const price = LAMBDAS[group], rng = PS.mulberry(seed);
    let w = Float32Array.from(start), best = netObjective(w, train, price, seconds, flyFn), accepted = 0;
    const startTrain = best, s0 = Float32Array.from(start);
    for (let it = 0; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = netObjective(cand, train, price, seconds, flyFn);
        if (sc >= best) { w = cand; best = sc; accepted++; }
    }
    let changed = 0; for (let i = 0; i < w.length; i++) if (w[i] !== s0[i]) changed++;
    return { seed, group, weights: Array.from(w), startTrain, trainScore: best, heldScore: netObjective(w, held, price, seconds, flyFn), accepted, iters, changed };
}
/** The champion of one group among `rows`: the row of the group with the best held-out value (at its price), the first of a tie in the group's seed order; refuses a group that is not exactly its four registered seeds once each. */
export function championOf(rows, group) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1)) throw new Error(`headToHead26.championOf: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s); if (b === null || r.heldScore > b.heldScore) b = r; } return b;
}
/** The 10 arms as { id: arm } (`wip` = Wip's weights, `champs` = [n005, n02, n04] weights). */
export function armsOf(wip, champs) {
    if (!isW(wip)) throw new Error(`headToHead26.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!Array.isArray(champs) || champs.length !== 3 || !champs.every(isW)) throw new Error(`headToHead26.armsOf: champs is the three champions' ${WEIGHT_COUNT}-weight vectors (n005, n02, n04)`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), p005: H16.lawArm("p005", LAW_P005), p02: H16.lawArm("p02", LAW_P02), p04: H16.lawArm("p04", LAW_P04), wip: netArm("wip", wip) };
    CHAMP_IDS.forEach((id, i) => { out[id] = netArm(id, champs[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 10; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, wip, champs, search, fixture, start, fixed (c02, p005, p02, p04 as built) }. */
export function audit(wip, champs, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null, fixture = null, start = null } = {}) {
    const all = armsOf(wip, champs), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead26.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, champs, search, fixture, start, fixed: [all.c02.entry().weights, all.p005.entry().weights, all.p02.entry().weights, all.p04.entry().weights] };
}
/** The start's own priced values: { train: {price: v}, held: {price: v} } for each of the three prices (the command computes them; the first scored candidate of every search must equal the train one). */
export function startOf(wip, { seconds = SECONDS, flyFn = H15.fly, train = TRAIN, held = HELD } = {}) {
    const t = {}, h = {}; for (const p of PRICES) { t[p] = netObjective(wip, train, p, seconds, flyFn); h[p] = netObjective(wip, held, p, seconds, flyFn); }
    return { train: t, held: h };
}
// ---- the readings (H25's, which read any arm at any price)
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf;
export const pricedGainAt = X25.pricedGainAt, pairAt = X25.pairAt, extraPower = X25.extraPower;
/** The arm among CAND_IDS (or `ids`) with the largest priced gain at a price, the first of a tie in that order. */
export const bestAt = (au, price, ids = CAND_IDS) => X25.bestAt(au, price, ids);
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
/** The registered verdict, eleven parts joined by "; ". */
export function verdictOf(au) {
    const ex = CHAMP_IDS.map((c) => extraPower(au, c)), falls = ex[0] > ex[1] && ex[1] > ex[2], ft = CHAMP_IDS.filter((c) => meanThrust(au, c) >= FULL_THROTTLE);
    return [...PRICES.map((p, i) => `AT ${p} THE RE-SEARCHED NETWORK ${word(pairAt(au, CHAMP_IDS[i], "wip", p).reading)} ITS START`),
        ...PRICES.map((p, i) => `AT ${p} THE RE-SEARCHED NETWORK ${word(pairAt(au, CHAMP_IDS[i], "c02", p).reading)} C02`),
        `EXTRA POWER FALLS AS THE PRICE RISES: ${falls ? "YES" : "NO"}`, ...PRICES.map((p) => `BEST AT ${p}: ${bestAt(au, p)}`), `FULL THROTTLE AT: ${ft.length ? ft.join(", ") : "NONE"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, g) => (au.search || []).filter((r) => r.group === g);
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "p005", "p02", "p04", "wip", ...CHAMP_IDS], LAWS_AT = ["p005", "p02", "p04"];
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const lines = GROUPS.map((g, gi) => `SEARCH ${g} (price ${LAMBDAS[g]}): ${rowsOf(au, g).map((r) => `seed ${r.seed} train ${r.trainScore.toFixed(4)} held ${r.heldScore.toFixed(4)} acc ${r.accepted} changed ${r.changed}`).join("; ")}; CHAMPION seed ${championOf(au.search, g).seed}, ${championOf(au.search, g).changed} weights changed`);
    const spread = GROUPS.map((g) => { const h = rowsOf(au, g).map((r) => r.heldScore); return (Math.max(...h) - Math.min(...h)).toFixed(4); }).join(" / ");
    const row = (a) => `${a} ${PRICES.map((p) => f4(pricedGainAt(au, a, p))).join(" / ")}`;
    return [
        ...lines,
        `START (wip's priced value at ${PRICES.join(" / ")}: train, held-out): ${PRICES.map((p) => `${p}: ${au.start.train[p].toFixed(4)}, ${au.start.held[p].toFixed(4)}`).join("; ")}`,
        `SPREAD (largest minus smallest held-out value, N005 / N02 / N04): ${spread}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PRICED GAIN (at ${PRICES.join(" / ")}): ${shown.slice(1).map(row).join("; ")}`,
        `PAIRED: ${PRICES.map((p, i) => `${CHAMP_IDS[i]} minus wip at ${p} ${fmt(pairAt(au, CHAMP_IDS[i], "wip", p))}`).join("; ")}; ${PRICES.map((p, i) => `${CHAMP_IDS[i]} minus c02 at ${p} ${fmt(pairAt(au, CHAMP_IDS[i], "c02", p))}`).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, c02 ${lostBoth(au, "c02")}, laws ${LAWS_AT.map((c) => lostBoth(au, c)).join(" / ")}, wip ${lostBoth(au, "wip")}, champions ${CHAMP_IDS.map((c) => lostBoth(au, c)).join(" / ")}`,
        `REPORTED, NOT IN THE VERDICT: dark / lit gain: ${CHAMP_IDS.map((c) => `${c} ${f4(gainOf(au, c))} / ${f4(gainOf(au, c, "lit"))}`).join("; ")}; CHANGE IN EXTRA POWER FROM WIP'S (${f2(extraPower(au, "wip"))}): ${CHAMP_IDS.map((c) => `${c} ${f2(extraPower(au, c) - extraPower(au, "wip"))}`).join("; ")}; THE H25 LAW OF THE SAME PRICE MINUS THE NETWORK CHAMPION, priced: ${PRICES.map((p, i) => `${LAWS_AT[i]} minus ${CHAMP_IDS[i]} at ${p} ${fmt(pairAt(au, LAWS_AT[i], CHAMP_IDS[i], p))}`).join("; ")}`,
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
    const fx = au.fixture, fixOk = !!fx && Number.isFinite(fx.at02) && fx.at02 === fx.h21 && Number.isFinite(fx.at0) && Math.abs(fx.at0 - fx.plain) < 1e-12;
    rows.push({ name: "OBJECTIVE AT 0.02 IS H21'S AND AT 0 IS THE PLAIN MEAN", ok: fixOk, text: `the objective at 0.02 equals H21's to the last digit and at 0 the mean of the dark and lit scores: ${fixOk}` });
    const s = au.search, wipFp = !!au.wip && isW(au.wip) && Math.abs(fingerprint(au.wip).sum - WIP_FINGERPRINT.sum) < 1e-9 && Math.abs(fingerprint(au.wip).sumsq - WIP_FINGERPRINT.sumsq) < 1e-9;
    const searches = Array.isArray(s) && s.length === 12 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => isW(r.weights)) && Array.isArray(au.champs) && au.champs.length === 3 && au.champs.every(isW);
    rows.push({ name: "TWELVE SEARCHES OF 963 FINITE WEIGHTS", ok: searches, text: `the 12 searches (four seeds in each of three groups, each once) and the three champions are 963 finite weights each: ${searches}` });
    const st = au.start, first = searches && !!st && !!st.train && GROUPS.every((g, gi) => s.filter((r) => r.group === g).every((r) => r.startTrain === st.train[PRICES[gi]]));
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS WIP", ok: first, text: `every search's first scored candidate (the start) has exactly the train value of network-Wip at the group's price: ${first}` });
    const dj = disjoint(TRAIN, HELD) && disjoint(TRAIN, au.range) && disjoint(HELD, au.range);
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap: ${dj}` });
    const champ = (g, w) => Array.isArray(s) && isW(w) && rowsOf(au, g).length > 0 && rowsOf(au, g).some((r) => isW(r.weights) && J(Array.from(r.weights)) === J(Array.from(w)) && r.heldScore === Math.max(...rowsOf(au, g).map((q) => q.heldScore))), champs = Array.isArray(au.champs) && GROUPS.every((g, i) => champ(g, au.champs[i]));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT OF ITS GROUP", ok: champs, text: `each champion's weights are a search of its own group with that group's largest held-out value: ${champs}` });
    const fixed = Array.isArray(au.fixed) && au.fixed.length === 4 && J(au.fixed[0]) === J(LAW_C02) && J(au.fixed[1]) === J(LAW_P005) && J(au.fixed[2]) === J(LAW_P02) && J(au.fixed[3]) === J(LAW_P04) && !!au.dark.c02 && !!au.dark.p005 && !!au.dark.p02 && !!au.dark.p04 && wipFp;
    rows.push({ name: "THE LAWS AND WIP ARE THE REGISTERED ONES", ok: fixed, text: `c02 and the H25 laws are the registered ones and wip's weights have the shipped file's count, sum and sum of squares: ${fixed}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H26: a network re-searched at a price. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), priced gain at ${PRICES.join(" / ")}:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${PRICES.map((p) => f4(pricedGainAt(au, a, p))).join(" / ")}`);
    for (const g of GROUPS) { R.push(`the four searches of group ${g}:`); for (const r of rowsOf(au, g)) R.push(`  seed ${r.seed}: train ${r.trainScore.toFixed(4)} (start ${r.startTrain.toFixed(4)}), held-out ${r.heldScore.toFixed(4)}, accepted ${r.accepted}, weights changed ${r.changed}`); }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
