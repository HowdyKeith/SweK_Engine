// WebGLEngine/tools/ship/headToHead21.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead21Cmd.mjs; the gate is tools/ship/headToHead21-selfcheck.mjs)
//
// ROUND H21 of brain/HEAD_TO_HEAD.md (registered before this file existed): IS THE c, d, s CORE ENOUGH? A PRICED SEARCH OVER THE REDUCED LAW. H16's law (thrust = clamp(autopilot's thrust + c |heading error|/pi + d + k speedErr + s V/3)) searched at the price of 0.02 per kW (H18's
// priced objective) in a box with s widened to [-4, 2], by three groups of four (1+1)-ES searches: F4 (all four weights free), K0 (c, d, s free, k held at 0), KC (c, d, s free, k held at c02's -0.6433501233386668); each group's champion chosen on 40 held-out ids; then 200 audit ids,
// dark and lit, against the autopilot, c02, h16, sched*2 and the 8 shipped networks, read as the priced score. The flight is H15's and the law's tank kind is H16's. Reads nothing from disk (the command hands the weights in). THE AUDIT IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H14 from "./headToHead14.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as H18 from "./headToHead18.mjs";
import * as H9 from "./headToHead9.mjs";

export const TRAIN = Object.freeze({ from: 21000, to: 21023 }), HELD = Object.freeze({ from: 21100, to: 21139 }), IDS = Object.freeze({ from: 21200, to: 21399 });
export const SECONDS = 160, ITERS = 300, SIGMA_FRAC = 0.1, LAMBDA = 0.02, FULL_THROTTLE = 0.9, EDGE_FRAC = 0.01, WEIGHT_NAMES = H16.WEIGHT_NAMES;
export const GROUPS = Object.freeze(["F4", "K0", "KC"]);
export const SEEDS = Object.freeze({ F4: Object.freeze([21001, 21002, 21003, 21004]), K0: Object.freeze([21011, 21012, 21013, 21014]), KC: Object.freeze([21021, 21022, 21023, 21024]) });
export const FIXED_K = Object.freeze({ F4: null, K0: 0, KC: -0.6433501233386668 });
export const BOX = Object.freeze([Object.freeze([0, 16]), Object.freeze([-0.4, 1.0]), Object.freeze([-1.5, 2]), Object.freeze([-4, 2])]);
export const LAW_C02 = Object.freeze([2.2035859388880334, 0.8758638340144, -0.6433501233386668, -2]);
export const LAW_H16 = Object.freeze([1.2322693581401742, -0.061415416013719054, -0.6, -0.15850584538981266]);
export const CHAMP_IDS = Object.freeze(["f4", "k0", "kc"]), NET8 = Object.freeze(H9.SHIPPED.map((n) => "network-" + n));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "h16", "sched*2", ...CHAMP_IDS, ...NET8]);
const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const checkGroup = (g) => { if (!GROUPS.includes(g)) throw new Error(`headToHead21: the group must be one of ${GROUPS.join(", ")}, got ${JSON.stringify(g)}`); };
/** Whether a law lies inside the box. */
export const insideBox = (w) => Array.isArray(w) && w.length === 4 && w.every((v, i) => Number.isFinite(v) && v >= BOX[i][0] && v <= BOX[i][1]);
/** Whether a weight `s` lies within EDGE_FRAC of the s-range's width of an edge of the box's s range. */
export const sAtEdge = (s) => { const wd = BOX[3][1] - BOX[3][0]; return s <= BOX[3][0] + EDGE_FRAC * wd || s >= BOX[3][1] - EDGE_FRAC * wd; };
/** The priced objective of a law (H18's at LAMBDA): the mean of the dark and lit scores less LAMBDA x the mean power in kW, on `range` ids. */
export const objective = (w, range, seconds = SECONDS, flyFn = H15.fly) => H18.objective(w, range, LAMBDA, seconds, flyFn);
/** One (1+1)-ES search of a group from the zero law (with the group's held k): one to all FREE weights changed by a Gaussian step of SIGMA_FRAC x the weight's box width (clamped), kept when the TRAIN priced objective is at least the parent's. Returns { seed, group, law, trainScore, heldScore, accepted, iters }. */
export function searchOne(seed, group, { iters = ITERS, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = H15.fly } = {}) {
    checkGroup(group);
    const rng = PS.mulberry(seed), fixed = FIXED_K[group], free = fixed === null ? [0, 1, 2, 3] : [0, 1, 3];
    let law = [0, 0, fixed === null ? 0 : fixed, 0], best = objective(law, train, seconds, flyFn), accepted = 0;
    for (let it = 0; it < iters; it++) {
        const m = 1 + Math.floor(rng() * free.length), cand = law.slice(), idx = free.slice();
        for (let j = 0; j < m; j++) { const pick = j + Math.floor(rng() * (free.length - j)); [idx[j], idx[pick]] = [idx[pick], idx[j]]; }
        for (let j = 0; j < m; j++) { const i = idx[j]; cand[i] = clampTo(cand[i] + gauss(rng) * SIGMA_FRAC * (BOX[i][1] - BOX[i][0]), BOX[i][0], BOX[i][1]); }
        const sc = objective(cand, train, seconds, flyFn);
        if (sc >= best) { law = cand; best = sc; accepted++; }
    }
    return { seed, group, law, trainScore: best, heldScore: objective(law, held, seconds, flyFn), accepted, iters };
}
/** The champion of one group among `rows` (all twelve or the group's four): the row of the group with the best held-out priced value (the first of a tie); refuses a group that is not exactly its four registered seeds, once each. */
export function championOf(rows, group) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) ? rows.filter((r) => r.group === group) : [];
    if (!seeds || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1)) throw new Error(`headToHead21.championOf: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}`);
    let b = mine[0]; for (const r of mine) if (r.heldScore > b.heldScore) b = r; return b;
}
const schedArm = () => { const kind = H14.kindOf("sched"); return { id: "sched*2", layer: "flying", controls: ["autopilot"], note: "autopilot with a thrust law (sched) 2", entry: () => ({ pilot: "network", circuit: kind.circuit, weights: [2] }), register: (tank) => tank.registerPilotKind(kind.circuit, kind) }; };
const netArm = (id, w) => ({ id, layer: "flying", controls: ["autopilot"], note: `network ${id}`, entry: () => ({ pilot: "network", circuit: "gfc", weights: Array.from(w) }) });
/** The 15 arms as { id: arm } (`nets` = a Map or object id -> 963 numbers for the 8 shipped networks, ids network-<name>; `laws` = [f4, k0, kc] champions' laws). */
export function armsOf(nets, laws) {
    if (!Array.isArray(laws) || laws.length !== 3) throw new Error("headToHead21.armsOf: laws is the three champions' laws (f4, k0, kc)");
    const get = (id) => (nets && typeof nets.get === "function" ? nets.get(id) : nets ? nets[id] : undefined);
    for (const id of NET8) { const w = get(id); if (w === undefined || w === null) throw new Error(`headToHead21.armsOf: no network ${id}`); if (!(Array.isArray(w) || ArrayBuffer.isView(w)) || w.length !== 963) throw new Error(`headToHead21.armsOf: network ${id} must be an array of 963 numbers`); }
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), h16: H16.lawArm("h16", LAW_H16), "sched*2": schedArm() };
    CHAMP_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, laws[i]); });
    for (const id of NET8) out[id] = netArm(id, get(id));
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 15; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets, laws (the champions'), fixed (the c02 and h16 laws as built), search }. */
export function audit(nets, laws, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null } = {}) {
    const all = armsOf(nets, laws), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead21.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets, laws, search, fixed: [all.c02.entry().weights, all.h16.entry().weights] };
}
// ---- the readings
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, sum = (xs) => xs.reduce((p, q) => p + q, 0);
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, efficiencyOf = H15.efficiencyOf, scoreMean = H15.meanOf;
/** The per-id priced score of an arm at LAMBDA, as a run list. */
export const pricedRuns = (au, a) => H18.pricedRuns(au, a, LAMBDA);
/** An arm's priced gain: the mean over the ids of its priced score less the autopilot's. */
export const pricedGain = (au, a) => H18.pricedGain(au, a, LAMBDA);
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` on the per-id priced score, paired by id. */
export const pairP = (au, a, b) => mk(B.paired(pricedRuns(au, a), pricedRuns(au, b)));
/** The per-id mean over the 8 shipped networks of the priced score, as a run list. */
export const netMeanRuns = (au) => pricedRuns(au, "autopilot").map((r, i) => ({ key: r.key, score: avg(NET8.map((a) => pricedRuns(au, a)[i].score)), bad: false }));
const word = (r, beat, behind, tie) => (r === "BETTER" ? beat : r === "WORSE" ? behind : tie);
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
/** The registered verdict, seven parts joined by "; ". */
export function verdictOf(au) {
    const w3 = (r) => word(r, "BEATS", "IS BEHIND", "TIES"), p = (a, b) => pairP(au, a, b).reading;
    const pa = [`THE C,D,S LAW WITH k = 0 ${w3(p("k0", "f4"))} THE FOUR-WEIGHT LAW`, `THE C,D,S LAW WITH k AT C02'S ${w3(p("kc", "f4"))} THE FOUR-WEIGHT LAW`];
    const pb = [`THE C,D,S LAW WITH k = 0 ${w3(p("k0", "c02"))} C02`, `THE C,D,S LAW WITH k AT C02'S ${w3(p("kc", "c02"))} C02`, `A FRESH FOUR-WEIGHT SEARCH ${w3(p("f4", "c02"))} C02`];
    const edge = CHAMP_IDS.filter((c, i) => sAtEdge(au.laws[i][3])), ft = CHAMP_IDS.filter((c) => meanThrust(au, c) >= FULL_THROTTLE);
    return [...pa, ...pb, `S AT THE BOX EDGE: ${edge.length ? edge.join(", ") : "NONE"}`, `FULL THROTTLE AT: ${ft.length ? ft.join(", ") : "NONE"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), effText = (e) => (e === null ? "n/a" : e.toFixed(3));
const lawText = (w) => WEIGHT_NAMES.map((n, i) => `${n} ${f3(w[i])}`).join(" ");
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, g) => (au.search || []).filter((r) => r.group === g);
const edges = (w) => WEIGHT_NAMES.filter((n, i) => { const wd = BOX[i][1] - BOX[i][0]; return w[i] <= BOX[i][0] + EDGE_FRAC * wd || w[i] >= BOX[i][1] - EDGE_FRAC * wd; });
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "h16", "sched*2", ...CHAMP_IDS], nets = (c) => avg(NET8.map((a) => scoreMean(au, a, c))), ln = NET8.map((a) => lostBoth(au, a));
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const pg = (a) => f4(pricedGain(au, a)), netPg = f4(avg(NET8.map((a) => pricedGain(au, a))));
    const pr = { a1: pairP(au, "k0", "f4"), a2: pairP(au, "kc", "f4"), b1: pairP(au, "k0", "c02"), b2: pairP(au, "kc", "c02"), b3: pairP(au, "f4", "c02") };
    const lines = GROUPS.map((g, gi) => `SEARCH ${g}: ${rowsOf(au, g).map((r) => `seed ${r.seed} [${r.law.map((v) => v.toFixed(3)).join(" ")}] train ${r.trainScore.toFixed(4)} held ${r.heldScore.toFixed(4)} acc ${r.accepted}`).join("; ")}; CHAMPION ${lawText(au.laws[gi])}`);
    const spread = GROUPS.map((g) => { const h = rowsOf(au, g).map((r) => r.heldScore); return (Math.max(...h) - Math.min(...h)).toFixed(4); }).join(" / ");
    return [
        ...lines,
        `SPREAD (largest minus smallest held-out priced value, F4 / K0 / KC): ${spread}`,
        `AUDIT (dark / lit mean score, dark mean power, dark mean thrust): ${shown.map(arm).join("; ")}; THE NETWORKS ${nets("dark").toFixed(4)} / ${nets("lit").toFixed(4)}, ${avg(NET8.map((a) => kwOf(au, a))).toFixed(2)} kW`,
        `PRICED GAIN AT ${LAMBDA}: ${shown.slice(1).map((a) => `${a} ${pg(a)}`).join("; ")}; THE NETWORKS ${netPg}`,
        `PAIRED (priced score): k0 minus f4 ${fmt(pr.a1)}; kc minus f4 ${fmt(pr.a2)}; k0 minus c02 ${fmt(pr.b1)}; kc minus c02 ${fmt(pr.b2)}; f4 minus c02 ${fmt(pr.b3)}`,
        `EDGE: ${CHAMP_IDS.map((c, i) => `${c} ${lawText(au.laws[i])} (at an edge: ${edges(au.laws[i]).join(", ") || "none"})`).join("; ")}`,
        `POWER (mean kW, extra kW, efficiency; dark / lit gain): ${CHAMP_IDS.map((c) => `${c} ${kwOf(au, c).toFixed(2)}, ${f2(extraKw(au, c))}, ${effText(efficiencyOf(au, c))}, gain ${f4(gainOf(au, c))} / ${f4(gainOf(au, c, "lit"))}`).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, c02 ${lostBoth(au, "c02")}, champions ${CHAMP_IDS.map((c) => lostBoth(au, c)).join(" / ")}, h16 ${lostBoth(au, "h16")}, sched*2 ${lostBoth(au, "sched*2")}, networks ${sum(ln)} (${Math.max(...ln)} in the worst)`,
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
    const s = au.search, inBox = Array.isArray(s) && s.length === 12 && s.every((r) => insideBox(r.law)) && Array.isArray(au.laws) && au.laws.length === 3 && au.laws.every(insideBox);
    rows.push({ name: "LAWS INSIDE THE BOX", ok: inBox, text: `the twelve searches' laws and the three champions lie inside the box: ${inBox}` });
    const heldOk = Array.isArray(s) && s.every((r) => FIXED_K[r.group] === null || r.law[2] === FIXED_K[r.group]) && Array.isArray(au.laws) && au.laws.length === 3 && au.laws[1][2] === 0 && au.laws[2][2] === FIXED_K.KC;
    rows.push({ name: "HELD WEIGHTS ARE HELD", ok: !!heldOk, text: `k is exactly 0 in every K0 search and its champion and exactly ${FIXED_K.KC} in every KC search and its champion: ${!!heldOk}` });
    const dj = disjoint(TRAIN, HELD) && disjoint(TRAIN, au.range) && disjoint(HELD, au.range);
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap: ${dj}` });
    const champ = (g, law) => Array.isArray(s) && Array.isArray(law) && rowsOf(au, g).length > 0 && rowsOf(au, g).some((r) => J(r.law) === J(law) && r.heldScore === Math.max(...rowsOf(au, g).map((q) => q.heldScore))), champs = Array.isArray(au.laws) && GROUPS.every((g, i) => !!champ(g, au.laws[i]));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT OF ITS GROUP", ok: champs, text: `each champion's law is a law of its own group with that group's largest held-out priced value: ${champs}` });
    const fixed = Array.isArray(au.fixed) && au.fixed.length === 2 && J(au.fixed[0]) === J(LAW_C02) && J(au.fixed[1]) === J(LAW_H16) && !!au.dark.c02 && !!au.dark.h16;
    rows.push({ name: "C02 AND H16 ARE THE REGISTERED LAWS", ok: fixed, text: `the c02 and h16 arms fly the laws written in the registration: ${fixed}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET8.map(key)).size === NET8.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET8.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H21: is the c, d, s core enough. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}`);
    R.push("per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), priced gain:");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${f4(pricedGain(au, a))}`);
    for (const g of GROUPS) { R.push(`the four searches of group ${g}:`); for (const r of rowsOf(au, g)) R.push(`  seed ${r.seed}: law [${r.law.map((v) => v.toFixed(4)).join(", ")}], train ${r.trainScore.toFixed(4)}, held-out ${r.heldScore.toFixed(4)}, ${r.accepted} of ${r.iters} accepted`); }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
