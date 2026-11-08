// WebGLEngine/tools/ship/headToHead27.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead27Cmd.mjs; the gate is tools/ship/headToHead27-selfcheck.mjs)
//
// ROUND H27 of brain/HEAD_TO_HEAD.md (registered before this file existed): A LOST SUB SCORES ZERO. H25's 24 law searches and H26's 12 network searches rerun with the same seeds, ids and loops, but under the PENALISED priced objective:
// a run that loses its sub (`bad`, H15's `last.lost`) scores 0 and every other run is scored as before (with no lost run the objective IS H18's, to the last digit, so a search that never loses a sub reproduces its old result exactly).
// Champions by held-out penalised value at their price; audited on 200 fresh ids with c02, wip, the stored unpenalised champions of H25 and H26 and the new ones, every arm read at three prices on the penalised and the unpenalised score.
// Reads nothing from disk (the command hands in the weights and the stored searches).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X21 from "./headToHead21.mjs";
import * as X25 from "./headToHead25.mjs";
import * as X26 from "./headToHead26.mjs";

export const IDS = Object.freeze({ from: 27200, to: 27399 }), SECONDS = 160, PRICES = X26.PRICES;
export const LAW_TRAIN = X25.TRAIN, LAW_HELD = X25.HELD, NET_TRAIN = X26.TRAIN, NET_HELD = X26.HELD;
export const LAW_ITERS = X25.ITERS, NET_ITERS = X26.ITERS, SIGMA_FRAC = X25.SIGMA_FRAC, NET_SIGMA = X26.SIGMA, NET_MAXK = X26.MAXK, FULL_THROTTLE = X26.FULL_THROTTLE, WEIGHT_COUNT = 963;
export const LAW_GROUPS = Object.freeze(["Q005", "Q01", "Q02", "Q04"]), NET_GROUPS = Object.freeze(["M005", "M02", "M04"]);
const toP = (g) => "P" + g.slice(1), toN = (g) => "N" + g.slice(1);
export const LAW_SEEDS = Object.freeze(Object.fromEntries(LAW_GROUPS.map((g) => [g, X25.SEEDS[toP(g)]])));
export const NET_SEEDS = Object.freeze(Object.fromEntries(NET_GROUPS.map((g) => [g, X26.SEEDS[toN(g)]])));
export const LAMBDAS = Object.freeze({ Q005: 0.005, Q01: 0.01, Q02: 0.02, Q04: 0.04, M005: 0.005, M02: 0.02, M04: 0.04 });
export const BOX = X25.BOX, LAW_C02 = X21.LAW_C02;
export const P_IDS = Object.freeze(["p005", "p01", "p02", "p04"]), Q_IDS = Object.freeze(["q005", "q01", "q02", "q04"]), N_IDS = Object.freeze(["n005", "n02", "n04"]), M_IDS = Object.freeze(["m005", "m02", "m04"]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "wip", ...P_IDS, ...Q_IDS, ...N_IDS, ...M_IDS]);
/** The champions that are searched here, in the order the lost-sub part lists them. */
export const NEW_IDS = Object.freeze([...Q_IDS, ...M_IDS]);
const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
export const fingerprint = X26.fingerprint, WIP_FINGERPRINT = X26.WIP_FINGERPRINT, netArm = X26.netArm;
/** A run's penalised score: 0 when the sub was lost, its score otherwise. */
export const penScore = (r) => (r.bad ? 0 : r.score);
/** The PENALISED priced objective of an arm at a price: (dark score' + lit score')/2 - price x (dark kW + lit kW)/2, a lost run scoring 0, on `range` ids. With no lost run it is H18's objective to the last digit. */
export function penObjective(arm, range, price, seconds = SECONDS, flyFn = H15.fly) {
    if (!(price >= 0)) throw new Error(`headToHead27.penObjective: the price must be a number of 0 or more, got ${JSON.stringify(price)}`);
    const d = flyFn(arm, range, seconds, "dropout"), l = flyFn(arm, range, seconds, null);
    return 0.5 * (avg(d.map(penScore)) + avg(l.map(penScore))) - price * 0.5 * (avg(d.map((r) => r.watts)) + avg(l.map((r) => r.watts))) / 1000;
}
const lawObj = (w, range, price, seconds, flyFn) => penObjective(H16.lawArm("law", w), range, price, seconds, flyFn);
const netObj = (w, range, price, seconds, flyFn) => penObjective(netArm("net", w), range, price, seconds, flyFn);
/** A flight wrapper that counts the flights (dark or lit) with at least one lost run. */
const counting = (flyFn) => { const c = { flights: 0, lost: 0 }; const f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); c.flights++; if (out.some((r) => r.bad)) c.lost++; return out; }; return { f, c }; };
/** One law search of a group (H25's loop with the penalised objective): { seed, group, law, startTrain, trainScore, heldScore, accepted, iters, lostFlights } (lostFlights = the search's TRAIN-or-held flights that had a lost run, start included). */
export function lawSearch(seed, group, { iters = LAW_ITERS, train = LAW_TRAIN, held = LAW_HELD, seconds = SECONDS, flyFn = H15.fly } = {}) {
    if (!LAW_GROUPS.includes(group)) throw new Error(`headToHead27: the law group must be one of ${LAW_GROUPS.join(", ")}, got ${JSON.stringify(group)}`);
    const price = LAMBDAS[group], rng = PS.mulberry(seed), { f, c } = counting(flyFn);
    let law = [0, 0, 0, 0], best = lawObj(law, train, price, seconds, f), accepted = 0;
    const startTrain = best;
    for (let it = 0; it < iters; it++) {
        const m = 1 + Math.floor(rng() * 4), cand = law.slice(), idx = [0, 1, 2, 3];
        for (let j = 0; j < m; j++) { const pick = j + Math.floor(rng() * (4 - j)); [idx[j], idx[pick]] = [idx[pick], idx[j]]; }
        for (let j = 0; j < m; j++) { const i = idx[j]; cand[i] = clampTo(cand[i] + gauss(rng) * SIGMA_FRAC * (BOX[i][1] - BOX[i][0]), BOX[i][0], BOX[i][1]); }
        const sc = lawObj(cand, train, price, seconds, f);
        if (sc >= best) { law = cand; best = sc; accepted++; }
    }
    return { seed, group, law, startTrain, trainScore: best, heldScore: lawObj(law, held, price, seconds, f), accepted, iters, lostFlights: c.lost };
}
/** One network search of a group from the weights `start` (H26's loop with the penalised objective): { seed, group, weights, startTrain, trainScore, heldScore, accepted, iters, changed, lostFlights }. */
export function netSearch(seed, group, start, { iters = NET_ITERS, sigma = NET_SIGMA, maxK = NET_MAXK, train = NET_TRAIN, held = NET_HELD, seconds = SECONDS, flyFn = H15.fly } = {}) {
    if (!NET_GROUPS.includes(group)) throw new Error(`headToHead27: the network group must be one of ${NET_GROUPS.join(", ")}, got ${JSON.stringify(group)}`);
    if (!wOk(start)) throw new Error(`headToHead27.netSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    const price = LAMBDAS[group], rng = PS.mulberry(seed), { f, c } = counting(flyFn);
    let w = Float32Array.from(start), best = netObj(w, train, price, seconds, f), accepted = 0;
    const startTrain = best, s0 = Float32Array.from(start);
    for (let it = 0; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = netObj(cand, train, price, seconds, f);
        if (sc >= best) { w = cand; best = sc; accepted++; }
    }
    let changed = 0; for (let i = 0; i < w.length; i++) if (w[i] !== s0[i]) changed++;
    return { seed, group, weights: Array.from(w), startTrain, trainScore: best, heldScore: netObj(w, held, price, seconds, f), accepted, iters, changed, lostFlights: c.lost };
}
const champ = (rows, group, seedsOf, what) => {
    const seeds = seedsOf[group], mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1)) throw new Error(`headToHead27.${what}: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s); if (b === null || r.heldScore > b.heldScore) b = r; } return b;
};
/** The champion of a law group (six seeds) or of a network group (four): the best held-out PENALISED value, the first of a tie in seed order. */
export const lawChampion = (rows, group) => champ(rows, group, LAW_SEEDS, "lawChampion");
export const netChampion = (rows, group) => champ(rows, group, NET_SEEDS, "netChampion");
/** The 18 arms as { id: arm }. `wip` = Wip's weights; `stored` = { laws: [p005, p01, p02, p04] laws, nets: [n005, n02, n04] weights } (the unpenalised champions of H25 and H26); `fresh` = { laws: [q005, q01, q02, q04], nets: [m005, m02, m04] }. */
export function armsOf(wip, stored, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead27.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    const okLaws = (l, n) => Array.isArray(l) && l.length === n && l.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite)), okNets = (l) => Array.isArray(l) && l.length === 3 && l.every(wOk);
    if (!stored || !okLaws(stored.laws, 4) || !okNets(stored.nets) || !fresh || !okLaws(fresh.laws, 4) || !okNets(fresh.nets)) throw new Error("headToHead27.armsOf: stored and fresh are { laws: four 4-weight laws, nets: three 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), wip: netArm("wip", wip) };
    P_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, stored.laws[i]); }); Q_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, fresh.laws[i]); });
    N_IDS.forEach((id, i) => { out[id] = netArm(id, stored.nets[i]); }); M_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 18; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, stored, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null, original = null, fixture = null, start = null } = {}) {
    const all = armsOf(wip, stored, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead27.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, stored, fresh, search, original, fixture, start, c02: all.c02.entry().weights };
}
/** The fixtures of the penalised objective: { real: { pen, h21 } (c02 on `range` at `seconds` at 0.02: this file's against H21's objective, equal when no run is lost), scripted: { pen, expected } (a scripted flight with one of four dark runs lost: score 0.8, 0.8, 0.8, 0.8 -> 0.6 in the mean, power 5 kW both, lit untouched at 0.9: expected (0.6 + 0.9)/2 - 0.02 x 5 = 0.65) }. */
export function fixtureOf({ range = { from: LAW_HELD.from, to: LAW_HELD.from + 3 }, seconds = 40, flyFn = H15.fly } = {}) {
    const script = (arm, r, s, ev) => Array.from({ length: 4 }, (_, i) => ({ key: "k" + i, score: ev === "dropout" ? 0.8 : 0.9, bad: ev === "dropout" && i === 0, watts: 5000, thrust: 0 }));
    return { real: { pen: lawObj(LAW_C02, range, 0.02, seconds, flyFn), h21: X21.objective(LAW_C02, range, seconds, flyFn) }, scripted: { pen: penObjective(H16.lawArm("c02", LAW_C02), { from: 1, to: 4 }, 0.02, 10, script), expected: 0.5 * (0.6 + 0.9) - 0.02 * 5 } };
}
/** The values of the starts: { laws: {price: penalised value of the zero law on the law TRAIN ids}, nets: {price: of wip on the network TRAIN ids} } (the first scored candidate of every search). */
export function startOf(wip, { seconds = SECONDS, flyFn = H15.fly } = {}) {
    const laws = {}, nets = {}; for (const p of [0.005, 0.01, 0.02, 0.04]) laws[p] = lawObj([0, 0, 0, 0], LAW_TRAIN, p, seconds, flyFn); for (const p of PRICES) nets[p] = netObj(wip, NET_TRAIN, p, seconds, flyFn);
    return { laws, nets };
}
// ---- the readings
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X25.extraPower;
/** The per-id PENALISED priced score of an arm at a price: (dark score' + lit score')/2 - price x (dark kW + lit kW)/2, a lost run scoring 0. */
export const penRunsAt = (au, a, price) => au.dark[a].map((r, i) => ({ key: r.key, score: 0.5 * (penScore(r) + penScore(au.lit[a][i])) - price * 0.5 * (r.watts + au.lit[a][i].watts) / 1000, bad: false }));
export const penGainAt = (au, a, price) => { const p = penRunsAt(au, a, price), q = penRunsAt(au, "autopilot", price); return avg(p.map((r, i) => r.score - q[i].score)); };
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
export const penPair = (au, a, b, price) => mk(B.paired(penRunsAt(au, a, price), penRunsAt(au, b, price)));
export const unpenGainAt = X25.pricedGainAt;
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
export { lostBoth };
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const P3 = ["p005", "p02", "p04"], Q3 = ["q005", "q02", "q04"];
/** How many stored searches have a different final result from the new search of the same seed: { laws, nets } (laws compared by their law, networks by their weights). */
export function changedOf(au) {
    const J = JSON.stringify, o = au.original || { laws: [], nets: [] };
    const laws = au.search.filter((r) => r.law).filter((r) => { const q = o.laws.find((x) => x.seed === r.seed); return !q || J(q.law) !== J(r.law); }).length;
    const nets = au.search.filter((r) => r.weights).filter((r) => { const q = o.nets.find((x) => x.seed === r.seed); return !q || J(Array.from(q.weights)) !== J(Array.from(r.weights)); }).length;
    return { laws, nets };
}
/** The registered verdict, fourteen parts joined by "; ". */
export function verdictOf(au) {
    const lost = NEW_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), ch = changedOf(au);
    return [...PRICES.map((p, i) => `AT ${p} THE PENALISED NETWORK ${word(penPair(au, M_IDS[i], N_IDS[i], p).reading)} THE UNPENALISED ONE`),
        ...PRICES.map((p, i) => `AT ${p} THE PENALISED LAW ${word(penPair(au, Q3[i], P3[i], p).reading)} THE UNPENALISED ONE`),
        ...PRICES.map((p, i) => `AT ${p} THE PENALISED NETWORK ${word(penPair(au, M_IDS[i], Q3[i], p).reading)} THE PENALISED LAW`),
        ...PRICES.map((p, i) => `AT ${p} THE PENALISED NETWORK ${word(penPair(au, M_IDS[i], "c02", p).reading)} C02`),
        `LOST SUBS IN THE PENALISED CHAMPIONS: ${lost.length ? lost.join(", ") : "NONE"}`, `SEARCHES THAT CHANGED: ${ch.laws} OF 24 LAWS, ${ch.nets} OF 12 NETWORKS`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, g) => (au.search || []).filter((r) => r.group === g);
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "wip", ...P_IDS, ...Q_IDS, ...N_IDS, ...M_IDS], priceRow = (a, f) => `${a} ${PRICES.map((p) => f4(f(au, a, p))).join(" / ")}`;
    const ch = (g) => (LAW_GROUPS.includes(g) ? lawChampion(au.search, g) : netChampion(au.search, g));
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const losses = [...LAW_GROUPS, ...NET_GROUPS].map((g) => `${g}: ${rowsOf(au, g).map((r) => `${r.seed} (${r.lostFlights} lost-flights)`).join(", ")}`).join("; ");
    const w = (g) => `${g} champion seed ${ch(g).seed}, held ${ch(g).heldScore.toFixed(4)}`;
    const pairs = [...PRICES.map((p, i) => `${M_IDS[i]} minus ${N_IDS[i]} at ${p} ${fmt(penPair(au, M_IDS[i], N_IDS[i], p))}`), ...PRICES.map((p, i) => `${Q3[i]} minus ${P3[i]} at ${p} ${fmt(penPair(au, Q3[i], P3[i], p))}`), ...PRICES.map((p, i) => `${M_IDS[i]} minus ${Q3[i]} at ${p} ${fmt(penPair(au, M_IDS[i], Q3[i], p))}`), ...PRICES.map((p, i) => `${M_IDS[i]} minus c02 at ${p} ${fmt(penPair(au, M_IDS[i], "c02", p))}`)];
    const path = Q_IDS.map((q, i) => `${q} [${au.fresh.laws[i].map((v) => v.toFixed(3)).join(" ")}]`).join("; ");
    return [
        `LOSSES IN THE SEARCHES (flights with a lost run, among the search's evaluations): ${losses}`,
        `SEARCH LAWS: ${LAW_GROUPS.map((g) => w(g)).join("; ")}`,
        `SEARCH NETWORKS: ${NET_GROUPS.map((g) => `${w(g)}, ${ch(g).changed} weights changed`).join("; ")}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at ${PRICES.join(" / ")}): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `UNPENALISED PRICED GAIN (H25's and H26's score, at ${PRICES.join(" / ")}): ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
        `PAIRED (penalised priced score): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: the unpenalised n02 on the penalised score at 0.02 ${f4(penGainAt(au, "n02", 0.02))} against its unpenalised ${f4(unpenGainAt(au, "n02", 0.02))} (c02 ${f4(penGainAt(au, "c02", 0.02))}); Q01 against p01 at 0.01 ${fmt(penPair(au, "q01", "p01", 0.01))}; the penalised law champions' weights: ${path}`,
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
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const s = au.search, laws = Array.isArray(s) && LAW_GROUPS.every((g) => LAW_SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.filter((r) => LAW_GROUPS.includes(r.group)).every((r) => Array.isArray(r.law) && r.law.length === 4 && X25.insideBox(r.law)), nets = Array.isArray(s) && NET_GROUPS.every((g) => NET_SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.filter((r) => NET_GROUPS.includes(r.group)).every((r) => wOk(r.weights));
    const counted = Array.isArray(s) && s.length === 36 && laws && nets && !!au.fresh && Array.isArray(au.fresh.laws) && au.fresh.laws.length === 4 && au.fresh.laws.every(X25.insideBox) && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 3 && au.fresh.nets.every(wOk) && wOk(au.wip);
    rows.push({ name: "36 SEARCHES, EACH SEED ONCE, LAWS IN THE BOX AND NETWORKS OF 963 FINITE WEIGHTS", ok: counted, text: `24 law searches (six seeds in each of four groups) inside the box and 12 network searches (four in each of three) of 963 finite weights, and the 4 + 3 champions: ${counted}` });
    const st = au.start, first = counted && !!st && !!st.laws && !!st.nets && s.every((r) => (LAW_GROUPS.includes(r.group) ? r.startTrain === st.laws[LAMBDAS[r.group]] : r.startTrain === st.nets[LAMBDAS[r.group]]));
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS THE START", ok: first, text: `every law search starts from the zero law and every network search from Wip, at the group's price, with exactly the start's own train value: ${first}` });
    const dj = [LAW_TRAIN, LAW_HELD, NET_TRAIN, NET_HELD].every((a, i, all) => disjoint(a, au.range) && all.every((b, j) => i === j || disjoint(a, b)));
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the law and network train and held-out ids and the audit ids do not overlap: ${dj}` });
    const bestIn = (g, w, isLaw) => Array.isArray(s) && rowsOf(au, g).length > 0 && rowsOf(au, g).some((r) => J(Array.from(isLaw ? r.law : r.weights || [])) === J(Array.from(w || [])) && r.heldScore === Math.max(...rowsOf(au, g).map((q) => q.heldScore)));
    const champs = !!au.fresh && Array.isArray(au.fresh.laws) && Array.isArray(au.fresh.nets) && LAW_GROUPS.every((g, i) => bestIn(g, au.fresh.laws[i], true)) && NET_GROUPS.every((g, i) => bestIn(g, au.fresh.nets[i], false));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT PENALISED OF ITS GROUP", ok: champs, text: `each of the seven champions is a search of its own group with that group's largest held-out penalised value: ${champs}` });
    const o = au.original, st2 = au.stored, reg = !!o && Array.isArray(o.laws) && Array.isArray(o.nets) && !!st2 && Array.isArray(st2.laws) && st2.laws.length === 4 && Array.isArray(st2.nets) && st2.nets.length === 3 && (() => { try { return ["P005", "P01", "P02", "P04"].every((g, i) => J(X25.championOf(o.laws, g).law) === J(st2.laws[i])) && ["N005", "N02", "N04"].every((g, i) => J(Array.from(X26.championOf(o.nets, g).weights)) === J(Array.from(st2.nets[i]))); } catch (e) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && Math.abs(fingerprint(au.wip).sum - WIP_FINGERPRINT.sum) < 1e-9 && Math.abs(fingerprint(au.wip).sumsq - WIP_FINGERPRINT.sumsq) < 1e-9;
    rows.push({ name: "C02, THE STORED CHAMPIONS AND WIP ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, the stored p and n champions are the champions of H25's and H26's stored searches by their rules and wip has the shipped file's fingerprint: ${!!reg}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H27: a lost sub scores zero. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at ${PRICES.join(" / ")}:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${PRICES.map((p) => f4(penGainAt(au, a, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
