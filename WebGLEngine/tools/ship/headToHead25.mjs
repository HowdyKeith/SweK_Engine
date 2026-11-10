// WebGLEngine/tools/ship/headToHead25.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead25Cmd.mjs; the gate is tools/ship/headToHead25-selfcheck.mjs)
//
// ROUND H25 of brain/HEAD_TO_HEAD.md (registered before this file existed): A PRICE SCAN OF THE WHOLE FAMILY. Four groups of six (1+1)-ES searches of H16's law in H21's box (s in [-4, 2]), one group per price (0.005, 0.01, 0.02, 0.04 per kW),
// the priced objective of H18 on train ids; champions by held-out value at their own price; audited on 200 fresh ids, dark and lit, with c02, h16, sched*2 and the 8 shipped networks, every arm read at every price. Reads nothing from disk.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as H18 from "./headToHead18.mjs";
import * as X from "./headToHead21.mjs";

export const TRAIN = Object.freeze({ from: 25000, to: 25023 }), HELD = Object.freeze({ from: 25100, to: 25139 }), IDS = Object.freeze({ from: 25200, to: 25399 });
export const SECONDS = 160, ITERS = 300, SIGMA_FRAC = 0.1, FULL_THROTTLE = 0.9, WEIGHT_NAMES = X.WEIGHT_NAMES;
export const PRICES = Object.freeze([0.005, 0.01, 0.02, 0.04]);
export const GROUPS = Object.freeze(["P005", "P01", "P02", "P04"]);
export const SEEDS = Object.freeze({ P005: Object.freeze([25001, 25002, 25003, 25004, 25005, 25006]), P01: Object.freeze([25011, 25012, 25013, 25014, 25015, 25016]), P02: Object.freeze([25021, 25022, 25023, 25024, 25025, 25026]), P04: Object.freeze([25031, 25032, 25033, 25034, 25035, 25036]) });
export const LAMBDAS = Object.freeze({ P005: 0.005, P01: 0.01, P02: 0.02, P04: 0.04 });
export const BOX = X.BOX, LAW_C02 = X.LAW_C02, LAW_H16 = X.LAW_H16;
export const CHAMP_IDS = Object.freeze(["p005", "p01", "p02", "p04"]), NET8 = X.NET8;
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "h16", "sched*2", ...CHAMP_IDS, ...NET8]);
/** The candidates for "best at a price", in the order a tie is broken: c02, h16, sched*2, the champions, the networks. */
export const CAND_IDS = Object.freeze(["c02", "h16", "sched*2", ...CHAMP_IDS, ...NET8]);
const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const checkGroup = (g) => { if (!GROUPS.includes(g)) throw new Error(`headToHead25: the group must be one of ${GROUPS.join(", ")}, got ${JSON.stringify(g)}`); };
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
export const insideBox = X.insideBox, sAtEdge = X.sAtEdge;
/** The priced objective of a law at a price (H18's): (dark + lit mean score)/2 - price x (dark + lit mean kW)/2, on `range` ids. */
export const objective = (w, range, price, seconds = SECONDS, flyFn = H15.fly) => H18.objective(w, range, price, seconds, flyFn);
/** One (1+1)-ES search of a group from the zero law, all four weights free, at the group's price. Returns { seed, group, law, trainScore, heldScore, accepted, iters }. */
export function searchOne(seed, group, { iters = ITERS, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = H15.fly } = {}) {
    checkGroup(group);
    const price = LAMBDAS[group], rng = PS.mulberry(seed);
    let law = [0, 0, 0, 0], best = objective(law, train, price, seconds, flyFn), accepted = 0;
    for (let it = 0; it < iters; it++) {
        const m = 1 + Math.floor(rng() * 4), cand = law.slice(), idx = [0, 1, 2, 3];
        for (let j = 0; j < m; j++) { const pick = j + Math.floor(rng() * (4 - j)); [idx[j], idx[pick]] = [idx[pick], idx[j]]; }
        for (let j = 0; j < m; j++) { const i = idx[j]; cand[i] = clampTo(cand[i] + gauss(rng) * SIGMA_FRAC * (BOX[i][1] - BOX[i][0]), BOX[i][0], BOX[i][1]); }
        const sc = objective(cand, train, price, seconds, flyFn);
        if (sc >= best) { law = cand; best = sc; accepted++; }
    }
    return { seed, group, law, trainScore: best, heldScore: objective(law, held, price, seconds, flyFn), accepted, iters };
}
/** The champion of one group among `rows`: the row of the group with the best held-out value (at its price), the first of a tie in the group's seed order; refuses a group that is not exactly its six registered seeds once each. */
export function championOf(rows, group) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1)) throw new Error(`headToHead25.championOf: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s); if (b === null || r.heldScore > b.heldScore) b = r; } return b;
}
/** The 17 arms as { id: arm } (`nets` = a Map or object id -> 963 numbers; `laws` = [p005, p01, p02, p04] champions' laws). */
export function armsOf(nets, laws) {
    if (!Array.isArray(laws) || laws.length !== 4) throw new Error("headToHead25.armsOf: laws is the four champions' laws (p005, p01, p02, p04)");
    const all = X.armsOf(nets, [LAW_C02.slice(), LAW_C02.slice(), LAW_C02.slice()]), out = { autopilot: all.autopilot, law0: all.law0, c02: all.c02, h16: all.h16, "sched*2": all["sched*2"] };
    CHAMP_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, laws[i]); });
    for (const id of NET8) out[id] = all[id];
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 17; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets, laws, search, fixture, fixed (c02 and h16 as built) }. */
export function audit(nets, laws, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null, fixture = null } = {}) {
    const all = armsOf(nets, laws), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead25.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets, laws, search, fixture, fixed: [all.c02.entry().weights, all.h16.entry().weights] };
}
/** The fixture of the objective: c02 on `range` at `seconds`: { at02 (this file's at 0.02), h21 (H21's objective), at0 (this file's at 0), plain (the mean of the dark and lit scores worked out from the flights) }. */
export function fixtureOf({ range = { from: HELD.from, to: HELD.from + 3 }, seconds = 40, flyFn = H15.fly } = {}) {
    const arm = H16.lawArm("c02", LAW_C02), d = flyFn(arm, range, seconds, "dropout"), l = flyFn(arm, range, seconds, null);
    return { at02: objective(LAW_C02, range, 0.02, seconds, flyFn), h21: X.objective(LAW_C02, range, seconds, flyFn), at0: objective(LAW_C02, range, 0, seconds, flyFn), plain: 0.5 * (avg(d.map((r) => r.score)) + avg(l.map((r) => r.score))) };
}
// ---- the readings
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf;
/** The per-id priced score of an arm at a price: (dark + lit score)/2 - price x (dark + lit kW)/2. */
export const pricedRunsAt = (au, a, price) => au.dark[a].map((r, i) => ({ key: r.key, score: 0.5 * (r.score + au.lit[a][i].score) - price * 0.5 * (r.watts + au.lit[a][i].watts) / 1000, bad: false }));
/** An arm's priced gain at a price: the mean of its priced score less the autopilot's. */
export const pricedGainAt = (au, a, price) => { const p = pricedRunsAt(au, a, price), q = pricedRunsAt(au, "autopilot", price); return avg(p.map((r, i) => r.score - q[i].score)); };
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
export const pairAt = (au, a, b, price) => mk(B.paired(pricedRunsAt(au, a, price), pricedRunsAt(au, b, price)));
/** An arm's extra power: the mean of its dark and lit extra kW over the autopilot's. */
export const extraPower = (au, a) => 0.5 * (extraKw(au, a) + extraKw(au, a, "lit"));
/** The arm among `ids` with the largest priced gain at a price (the first of a tie in the order given). */
export function bestAt(au, price, ids = CAND_IDS) { let b = null, bg = -Infinity; for (const a of ids) { const g = pricedGainAt(au, a, price); if (g > bg) { b = a; bg = g; } } return b; }
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
/** The registered verdict, twelve parts joined by "; ". */
export function verdictOf(au) {
    const ex = CHAMP_IDS.map((c) => extraPower(au, c)), falls = ex[0] > ex[1] && ex[1] > ex[2] && ex[2] > ex[3];
    const bn = bestAt(au, 0.005, NET8), ft = CHAMP_IDS.filter((c) => meanThrust(au, c) >= FULL_THROTTLE), edge = CHAMP_IDS.filter((c, i) => sAtEdge(au.laws[i][3]));
    return [`EXTRA POWER FALLS AS THE PRICE RISES: ${falls ? "YES" : "NO"}`,
        ...PRICES.map((p, i) => `AT ${p} THE SEARCHED LAW ${word(pairAt(au, CHAMP_IDS[i], "c02", p).reading)} C02`),
        ...PRICES.map((p) => `BEST AT ${p}: ${bestAt(au, p)}`),
        `AT 0.005 THE BEST NETWORK ${word(pairAt(au, bn, "p005", 0.005).reading)} THE SEARCHED LAW`,
        `FULL THROTTLE AT: ${ft.length ? ft.join(", ") : "NONE"}`, `S AT THE BOX EDGE: ${edge.length ? edge.join(", ") : "NONE"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
const lawText = (w) => WEIGHT_NAMES.map((n, i) => `${n} ${f3(w[i])}`).join(" ");
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, g) => (au.search || []).filter((r) => r.group === g);
const edges = (w) => WEIGHT_NAMES.filter((n, i) => { const wd = BOX[i][1] - BOX[i][0]; return w[i] <= BOX[i][0] + X.EDGE_FRAC * wd || w[i] >= BOX[i][1] - X.EDGE_FRAC * wd; });
/** Mean of the dark and lit gain of an arm. */
const meanGain = (au, a) => 0.5 * (gainOf(au, a) + gainOf(au, a, "lit"));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "h16", "sched*2", ...CHAMP_IDS], nets = (c) => avg(NET8.map((a) => scoreMean(au, a, c))), ln = NET8.map((a) => lostBoth(au, a));
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const bn = bestAt(au, 0.005, NET8);
    const lines = GROUPS.map((g, gi) => `SEARCH ${g} (price ${LAMBDAS[g]}): ${rowsOf(au, g).map((r) => `seed ${r.seed} [${r.law.map((v) => v.toFixed(3)).join(" ")}] train ${r.trainScore.toFixed(4)} held ${r.heldScore.toFixed(4)} acc ${r.accepted}`).join("; ")}; CHAMPION ${lawText(au.laws[gi])}`);
    const spread = GROUPS.map((g) => { const h = rowsOf(au, g).map((r) => r.heldScore); return (Math.max(...h) - Math.min(...h)).toFixed(4); }).join(" / ");
    const row = (a) => `${a} ${PRICES.map((p) => f4(pricedGainAt(au, a, p))).join(" / ")}`;
    const netRange = PRICES.map((p) => { const g = NET8.map((a) => pricedGainAt(au, a, p)); return `${f4(avg(g))} (${f4(Math.min(...g))} to ${f4(Math.max(...g))})`; }).join(" / ");
    const be = [[0, 1], [1, 2], [2, 3]].map(([i, j]) => { const dp = extraPower(au, CHAMP_IDS[i]) - extraPower(au, CHAMP_IDS[j]); return `${CHAMP_IDS[i]} to ${CHAMP_IDS[j]} ${dp >= H15.MIN_EXTRA_KW ? ((meanGain(au, CHAMP_IDS[i]) - meanGain(au, CHAMP_IDS[j])) / dp).toFixed(4) : "n/a"}`; }).join("; ");
    return [
        ...lines,
        `SPREAD (largest minus smallest held-out value, P005 / P01 / P02 / P04): ${spread}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}; THE NETWORKS ${nets("dark").toFixed(4)} / ${nets("lit").toFixed(4)}, ${avg(NET8.map((a) => kwOf(au, a))).toFixed(2)} kW`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}; THE NETWORKS ${f2(avg(NET8.map((a) => extraPower(au, a))))}`,
        `PRICED GAIN (at ${PRICES.join(" / ")}): ${shown.slice(1).map(row).join("; ")}; THE NETWORKS ${netRange}`,
        `PAIRED: ${PRICES.map((p, i) => `${CHAMP_IDS[i]} minus c02 at ${p} ${fmt(pairAt(au, CHAMP_IDS[i], "c02", p))}`).join("; ")}; ${bn} minus p005 at 0.005 ${fmt(pairAt(au, bn, "p005", 0.005))}`,
        `EDGE: ${CHAMP_IDS.map((c, i) => `${c} ${lawText(au.laws[i])} (at an edge: ${edges(au.laws[i]).join(", ") || "none"})`).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, c02 ${lostBoth(au, "c02")}, champions ${CHAMP_IDS.map((c) => lostBoth(au, c)).join(" / ")}, h16 ${lostBoth(au, "h16")}, sched*2 ${lostBoth(au, "sched*2")}, networks ${Math.min(...ln)}-${Math.max(...ln)}`,
        `REPORTED, NOT IN THE VERDICT: dark / lit gain: ${CHAMP_IDS.map((c) => `${c} ${f4(gainOf(au, c))} / ${f4(gainOf(au, c, "lit"))}`).join("; ")}; BREAK-EVEN PRICE between neighbouring champions (gain difference over power difference): ${be}; PATH OF THE WEIGHTS: ${WEIGHT_NAMES.map((n, i) => `${n} ${au.laws.map((w) => w[i].toFixed(3)).join(" -> ")}`).join("; ")}`,
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
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET8.every((id) => { const w = get(id); return !!w && w.length === 963 && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is 963 finite weights: ${nets}` });
    const ident = ["dark", "lit"].every((c) => au[c].law0 && au[c].law0.every((r, i) => au[c].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[c].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && Number.isFinite(fx.at02) && fx.at02 === fx.h21 && Number.isFinite(fx.at0) && Math.abs(fx.at0 - fx.plain) < 1e-12;
    rows.push({ name: "OBJECTIVE AT 0.02 IS H21'S AND AT 0 IS THE PLAIN MEAN", ok: fixOk, text: `the objective at 0.02 equals H21's to the last digit and at 0 the mean of the dark and lit scores: ${fixOk}` });
    const s = au.search, inBox = Array.isArray(s) && s.length === 24 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => insideBox(r.law)) && Array.isArray(au.laws) && au.laws.length === 4 && au.laws.every(insideBox);
    rows.push({ name: "LAWS INSIDE THE BOX", ok: inBox, text: `the 24 searches (six seeds in each of four groups, each once) and the four champions lie inside the box: ${inBox}` });
    const dj = disjoint(TRAIN, HELD) && disjoint(TRAIN, au.range) && disjoint(HELD, au.range);
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap: ${dj}` });
    const champ = (g, law) => Array.isArray(s) && Array.isArray(law) && rowsOf(au, g).length > 0 && rowsOf(au, g).some((r) => J(r.law) === J(law) && r.heldScore === Math.max(...rowsOf(au, g).map((q) => q.heldScore))), champs = Array.isArray(au.laws) && GROUPS.every((g, i) => champ(g, au.laws[i]));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT OF ITS GROUP", ok: champs, text: `each champion's law is a law of its own group with that group's largest held-out value: ${champs}` });
    const fixed = Array.isArray(au.fixed) && au.fixed.length === 2 && J(au.fixed[0]) === J(LAW_C02) && J(au.fixed[1]) === J(LAW_H16) && !!au.dark.c02 && !!au.dark.h16;
    rows.push({ name: "C02 AND H16 ARE THE REGISTERED LAWS", ok: fixed, text: `the c02 and h16 arms fly the laws written in the registration: ${fixed}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET8.map(key)).size === NET8.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET8.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H25: a price scan of the whole family. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), priced gain at ${PRICES.join(" / ")}:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${PRICES.map((p) => f4(pricedGainAt(au, a, p))).join(" / ")}`);
    for (const g of GROUPS) { R.push(`the six searches of group ${g}:`); for (const r of rowsOf(au, g)) R.push(`  seed ${r.seed}: law [${r.law.map((v) => v.toFixed(4)).join(", ")}], train ${r.trainScore.toFixed(4)}, held-out ${r.heldScore.toFixed(4)}, accepted ${r.accepted}`); }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
