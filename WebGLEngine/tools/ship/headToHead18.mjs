// WebGLEngine/tools/ship/headToHead18.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead18Cmd.mjs; the gate is tools/ship/headToHead18-selfcheck.mjs)
//
// ROUND H18 of brain/HEAD_TO_HEAD.md (registered before this file existed): WHAT DOES A TUNED THRUST LAW DO WHEN POWER HAS A PRICE? H17's wider box and law family, searched at three prices on power (LAMBDA 0.01, 0.02, 0.04 score per kW) by four (1+1)-ES searches each,
// the objective being the mean of the dark and lit scores less LAMBDA x the mean of the dark and lit power; each price's champion chosen on 40 held-out ids; then 200 audit ids, dark and lit, against the autopilot, H16's law (a constant), sched*2 and the 28 networks, read at each price.
// The flight is H15's and the law's tank kind is H16's. Reads nothing from disk (the command hands the weights in). THE AUDIT IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as H17 from "./headToHead17.mjs";

export const TRAIN = Object.freeze({ from: 18000, to: 18023 }), HELD = Object.freeze({ from: 18100, to: 18139 }), IDS = Object.freeze({ from: 18200, to: 18399 });
export const SECONDS = 160, ITERS = 300, SIGMA_FRAC = 0.1, FULL_THROTTLE = 0.9, LEARN_MARGIN = 0.02, MIN_EXTRA_KW = 0.1;
export const LAMBDAS = Object.freeze([0.01, 0.02, 0.04]);
export const SEEDS = Object.freeze({ "0.01": Object.freeze([18001, 18002, 18003, 18004]), "0.02": Object.freeze([18011, 18012, 18013, 18014]), "0.04": Object.freeze([18021, 18022, 18023, 18024]) });
export const CHAMP_IDS = Object.freeze(["c01", "c02", "c04"]);
export const BOX = H17.BOX, WEIGHT_NAMES = H17.WEIGHT_NAMES, H16_LAW = H17.H16_LAW, insideBox = H17.insideBox, edgeCount = H17.edgeCount, EDGE_FRAC = H17.EDGE_FRAC;
export const NET_IDS = H15.NET_IDS, REFERENCE_ID = "sched*2", IDENT_ID = "law0", H16_ID = "h16";
export const ARM_IDS = Object.freeze(["autopilot", IDENT_ID, ...CHAMP_IDS, H16_ID, REFERENCE_ID, ...NET_IDS]);
const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const meanOf = (runs, f) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
const checkLambda = (l) => { if (!LAMBDAS.includes(l)) throw new Error(`headToHead18: the price must be one of ${LAMBDAS.join(", ")}, got ${JSON.stringify(l)}`); };
/** The priced objective of a law on `range` ids: (the mean dark score + the mean lit score)/2 - lambda x (the mean dark power + the mean lit power)/2 in kW. `flyFn` is for the gate. */
export function objective(w, range, lambda, seconds = SECONDS, flyFn = H15.fly) {
    if (!(lambda >= 0)) throw new Error(`headToHead18.objective: the price must be a number of 0 or more, got ${JSON.stringify(lambda)}`);
    const arm = H16.lawArm("law", w), d = flyFn(arm, range, seconds, "dropout"), l = flyFn(arm, range, seconds, null);
    return 0.5 * (meanOf(d, (r) => r.score) + meanOf(l, (r) => r.score)) - lambda * 0.5 * (meanOf(d, (r) => r.watts) + meanOf(l, (r) => r.watts)) / 1000;
}
/** One (1+1)-ES search at a price from the autopilot's law (0, 0, 0, 0) in H17's wider box: one to four weights changed by a Gaussian step of SIGMA_FRAC x the box width (clamped), kept when the TRAIN priced objective is at least the parent's. Returns { seed, lambda, law, trainScore, heldScore, accepted, iters }. */
export function searchOne(seed, lambda, { iters = ITERS, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = H15.fly } = {}) {
    checkLambda(lambda);
    const rng = PS.mulberry(seed);
    let law = [0, 0, 0, 0], best = objective(law, train, lambda, seconds, flyFn), accepted = 0;
    for (let it = 0; it < iters; it++) {
        const m = 1 + Math.floor(rng() * 4), cand = law.slice(), idx = [0, 1, 2, 3];
        for (let j = 0; j < m; j++) { const pick = j + Math.floor(rng() * (4 - j)); [idx[j], idx[pick]] = [idx[pick], idx[j]]; }
        for (let j = 0; j < m; j++) { const i = idx[j]; cand[i] = clampTo(cand[i] + gauss(rng) * SIGMA_FRAC * (BOX[i][1] - BOX[i][0]), BOX[i][0], BOX[i][1]); }
        const sc = objective(cand, train, lambda, seconds, flyFn);
        if (sc >= best) { law = cand; best = sc; accepted++; }
    }
    return { seed, lambda, law, trainScore: best, heldScore: objective(law, held, lambda, seconds, flyFn), accepted, iters };
}
/** The champion of one price among `rows` (all twelve searches or the price's four): the row of that price with the best held-out priced value (the first of a tie); refuses a price that is not exactly its four registered seeds, once each. */
export function championOf(rows, lambda) {
    const seeds = SEEDS[String(lambda)], mine = Array.isArray(rows) ? rows.filter((r) => r.lambda === lambda) : [];
    if (!seeds || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1)) throw new Error(`headToHead18.championOf: price ${lambda} needs one search for each of the seeds ${(seeds || []).join(", ")}`);
    let b = mine[0]; for (const r of mine) if (r.heldScore > b.heldScore) b = r; return b;
}
/** The arms as { id: arm }: the autopilot, the zero law, the three champions' laws (`laws` = [law at 0.01, at 0.02, at 0.04]), H16's law, H14's sched*2 and the 28 networks (H15's). */
export function armsOf(nets, laws) {
    if (!Array.isArray(laws) || laws.length !== 3) throw new Error("headToHead18.armsOf: laws is the three champions' laws (0.01, 0.02, 0.04)");
    const base = H15.armsOf(nets), out = { autopilot: base.autopilot, [IDENT_ID]: H16.lawArm(IDENT_ID, [0, 0, 0, 0]) };
    CHAMP_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, laws[i]); });
    out[H16_ID] = H16.lawArm(H16_ID, H16_LAW); out[REFERENCE_ID] = base[REFERENCE_ID];
    for (const id of NET_IDS) out[id] = base[id];
    return out;
}
/** The arms of `arms` (default all 35; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets, laws, search, h16Law }. */
export function audit(nets, laws, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null } = {}) {
    const all = armsOf(nets, laws), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead18.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets, laws, search, h16Law: all[H16_ID].entry().weights };
}
// ---- the readings
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, sum = (xs) => xs.reduce((p, q) => p + q, 0);
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, efficiencyOf = H15.efficiencyOf, scoreMean = H15.meanOf;
/** The per-id priced score of an arm at a price, as a run list: (dark + lit score)/2 - lambda x (dark + lit kW)/2. */
export const pricedRuns = (au, a, lambda) => au.dark[a].map((r, i) => ({ key: r.key, score: 0.5 * (r.score + au.lit[a][i].score) - lambda * 0.5 * (r.watts + au.lit[a][i].watts) / 1000, bad: false }));
/** An arm's priced gain at a price: the mean over the ids of its priced score less the autopilot's. */
export const pricedGain = (au, a, lambda) => { const p = pricedRuns(au, a, lambda), q = pricedRuns(au, "autopilot", lambda); return avg(p.map((r, i) => r.score - q[i].score)); };
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** The best other pilot at a price: { name, g }, the arm with the largest priced gain at that price among the autopilot, h16, sched*2, the 28 networks and the OTHER two champions (the first of a tie; law0 is not a candidate). */
export function bestOther(au, lambda) {
    const champ = CHAMP_IDS[LAMBDAS.indexOf(lambda)], cands = ["autopilot", H16_ID, REFERENCE_ID, ...NET_IDS, ...CHAMP_IDS.filter((c) => c !== champ)];
    let b = null; for (const a of cands) { const g = pricedGain(au, a, lambda); if (b === null || g > b.g) b = { name: a, g }; } return b;
}
/** The champion of a price against the best other pilot at that price, paired by id on the per-id priced score: { mean, se ..., reading, other }. */
export function pairAt(au, lambda) {
    checkLambda(lambda);
    const champ = CHAMP_IDS[LAMBDAS.indexOf(lambda)], o = bestOther(au, lambda);
    return { ...mk(B.paired(pricedRuns(au, champ, lambda), pricedRuns(au, o.name, lambda))), other: o.name };
}
const word = (r, beat, behind, tie) => (r === "BETTER" ? beat : r === "WORSE" ? behind : tie);
const meanThrust = (au, a, c = "dark") => avg(au[c][a].map((r) => r.thrust));
/** The registered verdict, five parts joined by "; ". */
export function verdictOf(au) {
    const parts = LAMBDAS.map((l) => { const p = pairAt(au, l); return `AT ${l.toFixed(2)} PER kW THE PRICED LAW ${word(p.reading, "BEATS", "IS BEHIND", "TIES")} THE BEST OTHER PILOT (${p.other})`; });
    const ft = LAMBDAS.filter((l, i) => meanThrust(au, CHAMP_IDS[i]) >= FULL_THROTTLE);
    const k = CHAMP_IDS.map((c) => kwOf(au, c));
    const C = `POWER ${k[0] > k[1] && k[1] > k[2] ? "FALLS" : "DOES NOT FALL"} WITH THE PRICE (${k.map((x) => x.toFixed(2)).join(" / ")} kW)`;
    return [...parts, `FULL THROTTLE AT: ${ft.length ? ft.map((l) => l.toFixed(2)).join("/") : "NONE"}`, C].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), effText = (e) => (e === null ? "n/a" : e.toFixed(3));
const lawText = (w) => WEIGHT_NAMES.map((n, i) => `${n} ${f3(w[i])}`).join(" ");
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, l) => (au.search || []).filter((r) => r.lambda === l);
const edges = (w) => WEIGHT_NAMES.filter((n, i) => { const wd = BOX[i][1] - BOX[i][0]; return w[i] <= BOX[i][0] + EDGE_FRAC * wd || w[i] >= BOX[i][1] - EDGE_FRAC * wd; });
export function bottomLines(au) {
    const pr = LAMBDAS.map((l) => pairAt(au, l)), bn = H15.bestNetwork(au), shown = ["autopilot", H16_ID, ...CHAMP_IDS, REFERENCE_ID];
    const nets = (c) => avg(NET_IDS.map((a) => scoreMean(au, a, c))), ln = NET_IDS.map((a) => lostBoth(au, a));
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const pg = (a) => LAMBDAS.map((l) => f4(pricedGain(au, a, l))).join(" / "), netPg = LAMBDAS.map((l) => f4(avg(NET_IDS.map((a) => pricedGain(au, a, l))))).join(" / ");
    const netRange = LAMBDAS.map((l) => { const g = NET_IDS.map((a) => pricedGain(au, a, l)); return `${f4(Math.min(...g))} to ${f4(Math.max(...g))}`; }).join(" / ");
    const lines = LAMBDAS.map((l) => `SEARCH ${l.toFixed(2)}: ${rowsOf(au, l).map((r) => `seed ${r.seed} [${r.law.map((v) => v.toFixed(3)).join(" ")}] train ${r.trainScore.toFixed(4)} held ${r.heldScore.toFixed(4)} acc ${r.accepted}`).join("; ")}; CHAMPION ${lawText(au.laws[LAMBDAS.indexOf(l)])}`);
    const spread = LAMBDAS.map((l) => { const h = rowsOf(au, l).map((r) => r.heldScore); return (Math.max(...h) - Math.min(...h)).toFixed(4); }).join(" / ");
    return [
        ...lines,
        `SPREAD (largest minus smallest held-out priced value, at 0.01 / 0.02 / 0.04): ${spread}`,
        `AUDIT (dark / lit mean score, dark mean power, dark mean thrust): ${shown.map(arm).join("; ")}; THE NETWORKS ${nets("dark").toFixed(4)} / ${nets("lit").toFixed(4)}, ${avg(NET_IDS.map((a) => kwOf(au, a))).toFixed(2)} kW; BEST NETWORK AT 0.02 ${arm(bestNetworkAt(au, 0.02))}`,
        `PRICED GAIN AT 0.01 / 0.02 / 0.04: ${shown.map((a) => `${a} ${pg(a)}`).join("; ")}; THE NETWORKS ${netPg} (range ${netRange})`,
        `BEST OTHER PILOT: ${LAMBDAS.map((l, i) => `at ${l.toFixed(2)} ${pr[i].other} ${f4(bestOther(au, l).g)}`).join("; ")}`,
        `PAIRED (champion minus the best other pilot, per-id priced score): ${LAMBDAS.map((l, i) => `at ${l.toFixed(2)} ${fmt(pr[i])}`).join("; ")}`,
        `EDGE: ${CHAMP_IDS.map((c, i) => `${c} ${lawText(au.laws[i])} (at an edge: ${edges(au.laws[i]).join(", ") || "none"})`).join("; ")}`,
        `POWER (mean kW, extra kW, efficiency; each champion's dark and lit gain): ${CHAMP_IDS.map((c) => `${c} ${kwOf(au, c).toFixed(2)}, ${f2(extraKw(au, c))}, ${effText(efficiencyOf(au, c))}, gain ${f4(gainOf(au, c))} / ${f4(gainOf(au, c, "lit"))}`).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, champions ${CHAMP_IDS.map((c) => lostBoth(au, c)).join(" / ")}, h16 ${lostBoth(au, H16_ID)}, ${REFERENCE_ID} ${lostBoth(au, REFERENCE_ID)}, networks ${sum(ln)} (${Math.max(...ln)} in the worst)`,
    ];
}
/** The network with the largest priced gain at a price (the first of a tie). */
export function bestNetworkAt(au, lambda) { let b = null; for (const a of NET_IDS) { const g = pricedGain(au, a, lambda); if (b === null || g > b.g) b = { name: a, g }; } return b.name; }
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
    const nets = NET_IDS.every((id) => { const w = get(id); return !!w && w.length === 963 && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is 963 finite weights: ${nets}` });
    const ident = ["dark", "lit"].every((c) => au[c][IDENT_ID] && au[c][IDENT_ID].every((r, i) => au[c].autopilot[i] && Math.abs(r.score - au[c].autopilot[i].score) < 1e-6 && Math.abs(r.watts - au[c].autopilot[i].watts) < 1e-6));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score and in power on every id in both conditions (within 1e-6): ${ident}` });
    const s = au.search, inBox = Array.isArray(s) && s.length === 12 && s.every((r) => insideBox(r.law)) && Array.isArray(au.laws) && au.laws.length === 3 && au.laws.every(insideBox);
    rows.push({ name: "LAWS INSIDE THE BOX", ok: inBox, text: `the twelve searches' laws and the three champions lie inside the wider box: ${inBox}` });
    const dj = disjoint(TRAIN, HELD) && disjoint(TRAIN, au.range) && disjoint(HELD, au.range);
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap: ${dj}` });
    const champ = (l, law) => Array.isArray(s) && Array.isArray(law) && rowsOf(au, l).length > 0 && rowsOf(au, l).some((r) => J(r.law) === J(law) && r.heldScore === Math.max(...rowsOf(au, l).map((q) => q.heldScore))), champs = Array.isArray(au.laws) && LAMBDAS.every((l, i) => !!champ(l, au.laws[i]));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT OF ITS PRICE", ok: champs, text: `each champion's law is a law of its own price with that price's largest held-out priced value: ${champs}` });
    const hOk = Array.isArray(au.h16Law) && J(au.h16Law) === J(H16_LAW) && !!au.dark[H16_ID] && au.dark[H16_ID].length === n;
    rows.push({ name: "H16 LAW IS THE REGISTERED ONE", ok: hOk, text: `the h16 arm flies the law written in the registration: ${hOk}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET_IDS.map(key)).size === NET_IDS.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET_IDS.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H18: tuned thrust laws with a price on power. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}`);
    R.push("per arm, dark / lit: gain over the autopilot, extra power (kW), power efficiency; then the priced gain at 0.01 / 0.02 / 0.04:");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a))} ${f3(extraKw(au, a))} ${effText(efficiencyOf(au, a)).padStart(6)}  |  ${f4(gainOf(au, a, "lit"))} ${f3(extraKw(au, a, "lit"))} ${effText(efficiencyOf(au, a, "lit")).padStart(6)}  |  ${LAMBDAS.map((l) => f4(pricedGain(au, a, l))).join(" ")}`);
    for (const l of LAMBDAS) { R.push(`the four searches at ${l.toFixed(2)} per kW:`); for (const r of rowsOf(au, l)) R.push(`  seed ${r.seed}: law [${r.law.map((v) => v.toFixed(4)).join(", ")}], train ${r.trainScore.toFixed(4)}, held-out ${r.heldScore.toFixed(4)}, ${r.accepted} of ${r.iters} accepted`); }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
