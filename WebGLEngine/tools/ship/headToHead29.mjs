// WebGLEngine/tools/ship/headToHead29.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead29Cmd.mjs; the gate is tools/ship/headToHead29-selfcheck.mjs)
//
// ROUND H29 of brain/HEAD_TO_HEAD.md (registered before this file existed): LONGER SEARCHES. H27's penalised network search from network-Wip (963 weights, (1+1)-ES, a lost run scores 0) run for 2400 iterations instead of 600 with H27's own seeds
// (groups L02 at 0.02 and L04 at 0.04, four seeds each), recording the weights and the train and held-out values at 600, 1200, 1800 and 2400 iterations. The first 600 iterations ARE H27's search of that seed. A champion per checkpoint by
// held-out penalised value; audited on 200 fresh ids with c02, H27's q and m champions and the six longer champions. Reads nothing from disk (the command hands in the weights and H27's stored result).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X28 from "./headToHead28.mjs";

export const IDS = Object.freeze({ from: 29200, to: 29399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02;
export const TRAIN = X27.NET_TRAIN, HELD = X27.NET_HELD, SIGMA = X27.NET_SIGMA, MAXK = X27.NET_MAXK;
export const GROUPS = Object.freeze(["L02", "L04"]), PRICES = Object.freeze([0.02, 0.04]);
export const SEEDS = Object.freeze({ L02: [26011, 26012, 26013, 26014], L04: [26021, 26022, 26023, 26024] });
export const LAMBDAS = Object.freeze({ L02: 0.02, L04: 0.04 });
export const CHECKPOINTS = Object.freeze([600, 1200, 1800, 2400]), ITERS = 2400;
export const Q_IDS = Object.freeze(["q02", "q04"]), M_IDS = Object.freeze(["m02", "m04"]);
export const X_IDS = Object.freeze(["x02_1200", "x02_1800", "x02_2400", "x04_1200", "x04_1800", "x04_2400"]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", ...Q_IDS, ...M_IDS, ...X_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X28.flyPen;
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const netObj = (w, range, price, seconds, flyFn) => X27.penObjective(netArm("net", w), range, price, seconds, flyFn);
const counting = (flyFn) => { const c = { lost: 0 }; const f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }; return { f, c }; };
/**
 * One longer network search of a group from `start`: H27's loop exactly (the same generator stream, PS.mutate, accept when at least the parent's), recording at every iteration in `checkpoints` the weights, the train value, the accepted count and the
 * held-out penalised value. Returns { seed, group, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }] }.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead29: the group must be one of ${GROUPS.join(", ")}, got ${JSON.stringify(group)}`);
    if (!wOk(start)) throw new Error(`headToHead29.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    const price = LAMBDAS[group], rng = PS.mulberry(seed), { f, c } = counting(flyFn);
    let w = Float32Array.from(start), best = netObj(w, train, price, seconds, f), accepted = 0;
    const startTrain = best, cps = [];
    for (let it = 0; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = netObj(cand, train, price, seconds, f);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        if (checkpoints.includes(it + 1)) cps.push({ iter: it + 1, weights: Array.from(w), trainScore: best, heldScore: netObj(w, held, price, seconds, f), accepted });
    }
    return { seed, group, startTrain, lostFlights: c.lost, iters, checkpoints: cps };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of a group at a checkpoint: the search with the best held-out penalised value among the four at that checkpoint, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, group, iter) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || !CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead29.champion: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
/** The 13 arms as { id: arm }: `h27` = { laws: [q02, q04], nets: [m02, m04] }; `fresh` = { nets: [x02_1200, x02_1800, x02_2400, x04_1200, x04_1800, x04_2400] }. */
export function armsOf(wip, h27, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead29.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 2 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite)) || !Array.isArray(h27.nets) || h27.nets.length !== 2 || !h27.nets.every(wOk) || !fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 6 || !fresh.nets.every(wOk)) throw new Error("headToHead29.armsOf: h27 is { laws: two 4-weight laws, nets: two 963-weight vectors } and fresh is { nets: six 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02) };
    Q_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, h27.laws[i]); }); M_IDS.forEach((id, i) => { out[id] = netArm(id, h27.nets[i]); }); X_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 13; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, fixture = null, startVals = null } = {}) {
    const all = armsOf(wip, h27, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead29.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, fresh, search, original, fixture, startVals, c02: all.c02.entry().weights };
}
/** Wip's penalised train value at each price (the first scored candidate of every search): { 0.02: v, 0.04: v }. */
export function startVals(wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) {
    const out = {}; for (const p of PRICES) out[p] = netObj(wip, train, p, seconds, flyFn); return out;
}
export const fixtureOf = X27.fixtureOf;
// ---- the readings
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penRunsAt = X27.penRunsAt, penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const X2400 = ["x02_2400", "x04_2400"], X1200 = ["x02_1200", "x04_1200"];
/** The groups at which the group champion's held-out value is strictly larger at 1200 than at 600, at 1800 than at 1200 and at 2400 than at 1800. */
export const risesAt = (search) => GROUPS.filter((g) => CHECKPOINTS.slice(1).every((it, k) => champion(search, g, it).heldScore > champion(search, g, CHECKPOINTS[k]).heldScore)).map((g) => PRICES[GROUPS.indexOf(g)]);
/** The registered verdict, ten parts joined by "; ". */
export function verdictOf(au) {
    const lost = X_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), rise = risesAt(au.search);
    return [...PRICES.map((p, i) => `AT ${p} THE 2400 CHAMPION ${word(penPair(au, X2400[i], M_IDS[i], p).reading)} THE 600 CHAMPION`),
        ...PRICES.map((p, i) => `AT ${p} THE 2400 CHAMPION ${word(penPair(au, X2400[i], X1200[i], p).reading)} THE 1200 CHAMPION`),
        ...PRICES.map((p, i) => `AT ${p} THE 2400 CHAMPION ${word(penPair(au, X2400[i], Q_IDS[i], p).reading)} THE LAW OF THE PRICE`),
        ...PRICES.map((p, i) => `AT ${p} THE 2400 CHAMPION ${word(penPair(au, X2400[i], "c02", p).reading)} C02`),
        `LOST SUBS IN THE LONGER CHAMPIONS: ${lost.length ? lost.join(", ") : "NONE"}`, `HELD-OUT VALUE RISES AT EVERY CHECKPOINT AT ${rise.length ? rise.join(", ") : "NONE"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, g) => (au.search || []).filter((r) => r.group === g);
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per longer champion: its L1 distance from wip and from the 600-iteration champion of its group. */
export function distances(au) {
    return X_IDS.map((id, i) => { const w = au.fresh.nets[i]; return { id, l1Wip: l1(w, au.wip), l1M: l1(w, au.h27.nets[i < 3 ? 0 : 1]) }; });
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", ...Q_IDS, ...M_IDS, ...X_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`;
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = GROUPS.map((g) => `${g}: ${rowsOf(au, g).map((r) => `${r.seed} [${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ")}`).join("; ");
    const champs = GROUPS.map((g) => `${g} ${CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, g, it).seed} held ${champion(au.search, g, it).heldScore.toFixed(4)}`).join(", ")}`).join("; ");
    const pairs = [...PRICES.map((p, i) => `${X2400[i]} minus ${M_IDS[i]} at ${p} ${fmt(penPair(au, X2400[i], M_IDS[i], p))}`), ...PRICES.map((p, i) => `${X2400[i]} minus ${X1200[i]} at ${p} ${fmt(penPair(au, X2400[i], X1200[i], p))}`),
        ...PRICES.map((p, i) => `${X2400[i]} minus ${Q_IDS[i]} at ${p} ${fmt(penPair(au, X2400[i], Q_IDS[i], p))}`), ...PRICES.map((p, i) => `${X2400[i]} minus c02 at ${p} ${fmt(penPair(au, X2400[i], "c02", p))}`),
        ...X_IDS.map((a, i) => `${a} minus c02 at ${PRICES[i < 3 ? 0 : 1]} ${fmt(penPair(au, a, "c02", PRICES[i < 3 ? 0 : 1]))}`)];
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1M.toFixed(2)} from the 600-iteration champion`).join("; ");
    return [
        `SEARCH (train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score; the last six each at its own price): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, J = JSON.stringify, near = (a, b) => Math.abs(a - b) < 1e-9;
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
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 8 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => GROUPS.includes(r.group) && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 6 && au.fresh.nets.every(wOk) && wOk(au.wip);
    rows.push({ name: "8 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: counted, text: `8 network searches (four seeds in each of two groups), each with checkpoints at 600, 1200, 1800 and 2400 of 963 finite weights, and the 6 longer champions: ${counted}` });
    const o = au.original, h = au.h27, sv = au.startVals;
    const o600 = counted && !!o && Array.isArray(o.search) && s.every((r) => { const q = o.search.find((x) => x.seed === r.seed && x.group === "M" + r.group.slice(1)), k = cpOf(r, 600); return !!q && J(Array.from(q.weights)) === J(k.weights) && q.trainScore === k.trainScore && q.heldScore === k.heldScore && q.accepted === k.accepted; });
    rows.push({ name: "THE 600-ITERATION CHECKPOINT IS H27'S SEARCH", ok: !!o600, text: `the weights, train and held-out values and accepted count at iteration 600 of every search equal H27's stored search of the same seed to the last digit: ${!!o600}` });
    const first = counted && !!sv && s.every((r) => r.startTrain === sv[LAMBDAS[r.group]]);
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS WIP", ok: first, text: `every search's first scored candidate has exactly wip's penalised train value at the group's price: ${first}` });
    const dj = [TRAIN, HELD].every((a, i, all) => disjoint(a, au.range) && all.every((b, j) => i === j || disjoint(a, b))) && disjoint(au.range, { from: 22200, to: 28399 });
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap, and the audit ids are past every earlier audit (22200-28399): ${dj}` });
    const bestAt = (g, it, w) => { try { return J(Array.from(champion(s, g, it).weights)) === J(Array.from(w || [])); } catch (e) { return false; } };
    const champs = counted && !!au.fresh && Array.isArray(au.fresh.nets) && GROUPS.every((g, gi) => [1200, 1800, 2400].every((it, k) => bestAt(g, it, au.fresh.nets[gi * 3 + k]))) && !!h && Array.isArray(h.nets) && GROUPS.every((g, gi) => bestAt(g, 600, h.nets[gi]));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT PENALISED OF ITS GROUP AT ITS CHECKPOINT", ok: !!champs, text: `the six longer champions are the best held-out penalised of their group at 1200, 1800 and 2400, and the 600-iteration champions are H27's m02 and m04: ${!!champs}` });
    const reg = !!o && Array.isArray(o.search) && !!h && Array.isArray(h.laws) && h.laws.length === 2 && Array.isArray(h.nets) && h.nets.length === 2 && (() => { try { return ["Q02", "Q04"].every((g, i) => J(X27.lawChampion(o.search, g).law) === J(h.laws[i])) && ["M02", "M04"].every((g, i) => J(Array.from(X27.netChampion(o.search, g).weights)) === J(Array.from(h.nets[i]))); } catch (e) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND H27'S CHAMPIONS ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint and the q and m champions are the champions of H27's stored searches by H27's rule: ${!!reg}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H29: longer searches (2400 iterations, checkpoints at 600 / 1200 / 1800 / 2400). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
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
