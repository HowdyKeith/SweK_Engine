// WebGLEngine/tools/ship/headToHead83.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead83Cmd.mjs; the gate is tools/ship/headToHead83-selfcheck.mjs)
//
// ROUND H83 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT PRICE -- THE SEARCH AT 0.24, WHERE THE ONE-KILOWATT PILOT MEETS ITS FLOOR. H32's search (the 963 weights of network-Wip, the (1+1)-ES, PS.mutate of 1 to 4 weights sigma 0.3, H28's flyPen, 160 s, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800,
// resumable, H32's 72 train ids, held-out ids 26100-26139, seeds 26011-26014) with ONLY the price changed: 0.24. Group P24. The champion per checkpoint by held-out value (at 0.24); the four 1800-iteration networks are audited each by itself on 200 fresh ids, read at 0.24 on the penalised priced score,
// against c02, q04 (H27's champion law of 0.04, a law of a sixth of this price), H32's champion s02_26011 and H61's champion p16_26012 (price 0.16, read from H61's stored search). Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";
import * as X61 from "./headToHead61.mjs";

export const IDS = Object.freeze({ from: 103200, to: 103399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.24;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK;
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION;
export const GROUPS = Object.freeze(["P24"]), SEEDS = Object.freeze({ P24: [26011, 26012, 26013, 26014] }), TRAIN_SIZE = 72, EARLIER_AUDIT = 102399;
export const P16_ID = "p16_26012", O_IDS = Object.freeze([P16_ID]), N_IDS = Object.freeze(SEEDS.P24.map((s) => "p24_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q04", "s02_26011", ...O_IDS, ...N_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const idCount = (rs) => rs.reduce((n, r) => n + r.to - r.from + 1, 0);
/** The flights of one full search over a train set of `size` ids: (iterations + 1) evaluations of 2 x size flights and four held-out evaluations of 2 x 40 flights (259664 at 72 ids). */
export const flightsOf = (size) => (ITERS + 1) * 2 * size + CHECKPOINTS.length * 2 * (HELD.to - HELD.from + 1);
/** Reads and validates a state file of an P24 search (null when there is none): H32's validation, and the state must carry the price 0.24 and the train size 72. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead83.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: "P24" });
    if (s.price !== PRICE) throw new Error(`headToHead83.loadState: the state's price is ${J(s.price)}, not ${PRICE}`);
    if (s.trainSize !== TRAIN_SIZE) throw new Error(`headToHead83.loadState: the state's train size is ${J(s.trainSize)}, not ${TRAIN_SIZE}`);
    return s;
}
/**
 * One RESUMABLE network search of the group P24 from `start`: H32's loop and generator stream exactly with the price and the train set handed in (`opts.price`, default 0.24; `opts.train`, default H32's 72 ids; the gate hands in 0.02 to compare with H32's). `save(state)` after every `stateEvery` iterations and every checkpoint (each state carries the price and the train size);
 * `state` resumes (it must carry the price and the train size used); `onIteration(n)` after iteration n. Returns { seed, group, price, trainSize, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { price = PRICE, iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead83: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead83.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead83.longSearch: stateEvery must be a positive integer");
    if (!(typeof price === "number" && price >= 0)) throw new Error(`headToHead83.longSearch: the price must be a number of 0 or more, got ${J(price)}`);
    const size = idCount(train);
    if (state && state.price !== price) throw new Error(`headToHead83.longSearch: the state's price is ${J(state.price)}, not ${price}`);
    if (state && state.trainSize !== size) throw new Error(`headToHead83.longSearch: the state's train size is ${J(state.trainSize)}, not ${size}`);
    const c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }, obj = (w, r) => X30.netObj(w, r, price, seconds, f);
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { X32.validateState(state, { seed, group, iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = obj(w, train); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = obj(cand, train);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(w), trainScore: best, heldScore: obj(w, [held]), accepted }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })), price, trainSize: size });
        if (onIteration) onIteration(n);
    }
    return { seed, group, price, trainSize: size, startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the best held-out penalised value (at 0.24) of its four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.P24, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "P24") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead83.champion: group P24 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
const lawOkW = (w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite);
/** The 10 arms as { id: arm }: `h27` = { laws: [q04] }; `old` = { s02: H32's champion network (the 1800 weights of s02_26011), p16: H61's champion network (p16_26012) }; `fresh` = { nets: [the four new networks in seed order] }. */
export function armsOf(wip, h27, old, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead83.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every(lawOkW)) throw new Error("headToHead83.armsOf: h27 is { laws: [the 4-weight law of 0.04] }");
    if (!old || !wOk(old.s02) || !wOk(old.p16)) throw new Error("headToHead83.armsOf: old is { s02, p16: each one 963-weight vector }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead83.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q04: H16.lawArm("q04", h27.laws[0]), s02_26011: netArm("s02_26011", old.s02) };
    out[P16_ID] = netArm(P16_ID, old.p16); N_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 10; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, old, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, h61 = null, earlier = null, startVal = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, old, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead83.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, old, fresh, search, original, h32, h61, earlier, startVal, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value at the price on the 72 train ids (the first parent of every search). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN, price = PRICE } = {}) => X30.netObj(wip, train, price, seconds, flyFn);
/** H27's fixtures (at 0.02) and a scripted lost run at 0.24: { real, scripted, scripted24: { pen, expected } } (one of four dark runs lost scores 0: 0.5 x (0.6 + 0.9) - 0.04 x 5). */
export function fixtureOf(o = {}) {
    const f = X27.fixtureOf(o), script = (arm, r, s, ev) => Array.from({ length: 4 }, (_, i) => ({ key: "k" + i, score: ev === "dropout" ? 0.8 : 0.9, bad: ev === "dropout" && i === 0, watts: 5000, thrust: 0 }));
    return { ...f, scripted24: { pen: X27.penObjective(H16.lawArm("c02", LAW_C02), { from: 1, to: 4 }, 0.24, 10, script), expected: 0.5 * (0.6 + 0.9) - 0.24 * 5 } };
}
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b, p = PRICE) => penPair(au, a, b, p);
/** An arm's mean penalised priced score at a price (default 0.24) over the audit ids. */
export const penMean = (au, a, p = PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
/** An arm's mean power in kW over the audit ids: the mean of its dark and lit mean powers. */
export const meanPower = (au, a) => (avg(au.dark[a].map((r) => r.watts)) + avg(au.lit[a].map((r) => r.watts))) / 2000;
/** The arm id of the group champion at 1800 (the best held-out value of the four searches). */
export const champArm = (au) => "p24_" + champion(au.search, LAST).seed;
/** The lowest mean power (W) of any audit run among the four new networks: per audit id the mean of a network's dark and lit powers, the lowest over the four networks and the ids. */
export const lowestRun = (au) => Math.min(...N_IDS.map((id) => lowestOf(au, id)));
export const lowestOf = (au, id) => Math.min(...au.dark[id].map((r, i) => (r.watts + au.lit[id][i].watts) / 2));
/** The number of audit runs (of two conditions x ids) of a network at or below 400 W. */
export const runsAtFloor = (au, id) => [...au.dark[id], ...au.lit[id]].filter((r) => r.watts <= 400).length;
/** The registered verdict, eight parts joined by "; "; parts A to F and H are read at 0.24, part G at 0.16 (against H61's champion) and at 0.02 (against c02). */
export function verdictOf(au) {
    const c = champArm(au), rd = (b, p = PRICE) => word(pen(au, c, b, p).reading), lost = N_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), notBehind = N_IDS.filter((a) => pen(au, a, "c02").reading !== "WORSE").length;
    return [`THE CHAMPION ${rd("c02")} C02`, `THE CHAMPION ${rd("q04")} THE LAW OF PRICE 0.04`, `THE CHAMPION ${rd(P16_ID)} H61'S CHAMPION`, `NETWORKS NOT BEHIND C02: ${notBehind} OF 4`, `LOST SUBS IN THE P24 NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `THE CHAMPION'S MEAN POWER IS BELOW H61'S CHAMPION'S: ${meanPower(au, c) < meanPower(au, P16_ID) ? "YES" : "NO"}`, `AT 0.16 THE CHAMPION ${rd(P16_ID, 0.16)} H61'S CHAMPION, AT 0.02 THE CHAMPION ${rd("c02", 0.02)} C02`, `THE LOWEST MEAN POWER OF ANY AUDIT RUN AMONG THE FOUR IS ${lowestRun(au) > 400 ? "ABOVE" : "AT OR BELOW"} 400 W`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from wip and from H61's champion. */
export const distances = (au) => N_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1P16: l1(au.fresh.nets[i], au.old.p16) }));
/** The generalisation gap (train minus held-out value, each at its own price) of the group champion at each checkpoint, of every seed at 1800, and of H61's champion at 1800 (at 0.16, as stored). */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore;
    return { champ: CHECKPOINTS.map((it) => g(champion(au.search, it))), seeds: SEEDS.P24.map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === "P24"), LAST))), h61: g(X61.champion(au.h61.search, LAST)) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q04", "s02_26011", ...O_IDS, ...N_IDS], PR = [0.02, 0.16, 0.24], priceRow = (a, f) => `${a} ${PR.map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "P24").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `P24 champion ${gp.champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800, each seed at 1800 ${SEEDS.P24.map((s, i) => `${s} ${gp.seeds[i].toFixed(4)}`).join(", ")} (H61's champion at 1800, at 0.16: ${gp.h61.toFixed(4)})`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairsAt = (p) => ["c02", "q04", "s02_26011", P16_ID].map((b) => `${c} minus ${b} at ${p} ${fmt(pen(au, c, b, p))}`);
    const rank = [...O_IDS, ...N_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1P16.toFixed(2)} from H61's champion`).join("; ");
    const power = ["autopilot", "c02", "q04", "s02_26011", P16_ID, ...N_IDS].map((a) => `${a} ${meanPower(au, a).toFixed(2)}`).join(", ");
    const floor = N_IDS.map((id) => `${id} lowest ${lowestOf(au, id).toFixed(0)} W, ${runsAtFloor(au, id)} runs of 800 at or below 400 W`).join("; ");
    return [
        `SEARCH P24 (price 0.24, 72 train ids; start value, then train / held-out penalised value (at 0.24) and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at 1800 is ${c} (the best on the audit at 0.24: ${[...N_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]})`,
        `GENERALISATION GAP (train value minus held-out value): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `POWER (the descent: mean of the dark and lit mean powers, kW): ${power}; the champion ${meanPower(au, c).toFixed(2)} against H61's champion ${meanPower(au, P16_ID).toFixed(2)} (${f2(meanPower(au, c) - meanPower(au, P16_ID))}); the lowest audit-run power among the four ${lowestRun(au).toFixed(0)} W`,
        `EXTRA POWER (mean of dark and lit extra kW over the autopilot): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.02 / 0.16 / 0.24): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED AT 0.24 (penalised priced score): ${pairsAt(0.24).join("; ")}`,
        `PAIRED AT 0.16 (REPORTED): ${pairsAt(0.16).join("; ")}`,
        `PAIRED AT 0.02 (REPORTED): ${pairsAt(0.02).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; audit means at 0.24 in rank order ${rank}; each network's own lowest audit-run power and runs at or below 400 W ${floor}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((q) => ARM_IDS.map((a) => [q, a]));
    const sizes = cells.every(([q, a]) => au[q][a] && au[q][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const aligned = cells.every(([q, a]) => au[q][a] && au[q][a].every((r, i) => au[q].autopilot[i] && r.key === au[q].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids are the same in every arm and condition: ${aligned}` });
    const inside = cells.every(([q, a]) => au[q][a] && au[q][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([q, a]) => au[q][a] && au[q][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const ident = ["dark", "lit"].every((q) => au[q].law0 && au[q].law0.every((r, i) => au[q].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[q].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && !!fx.scripted24 && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12 && Number.isFinite(fx.scripted24.pen) && Math.abs(fx.scripted24.pen - fx.scripted24.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 at 0.02 (0.65 expected) and at 0.24 (-0.45 expected): ${fixOk}` });
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.P24.every((q) => s.filter((r) => r.group === "P24" && r.seed === q).length === 1) && s.every((r) => r.group === "P24" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && SEEDS.P24.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(cpOf(s.find((r) => r.group === "P24" && r.seed === q), LAST).weights)) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 network searches (the four seeds of P24), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 4 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const priceOk = PRICE === 0.24 && Array.isArray(s) && s.length === 4 && s.every((r) => r.price === 0.24) && J(TRAIN) === J(X32.TRAIN) && idCount(TRAIN) === 72 && s.every((r) => r.trainSize === 72);
    rows.push({ name: "THE PRICE IS 0.24 AND THE TRAIN SET H32'S 72 IDS", ok: !!priceOk, text: `the price of the loop and of every reading is 0.24, the train set is H32's 72 ids (26000-26023 and 30000-30047), and every search record carries both: ${!!priceOk}` });
    const first = !!counted && Number.isFinite(au.startVal) && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST PARENT IS WIP ON THE 72 IDS", ok: first, text: `every search's first parent has exactly wip's penalised value at 0.24 on the 72 train ids (computed in this round): ${first}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => c.heldScore >= cpOf(r, LAST).heldScore) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT PENALISED OF THE FOUR AT 1800", ok: !!(counted && bestAt), text: `the group champion at 1800 has the largest held-out penalised value (at 0.24) of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const h6 = au.h61, ol = au.old, h3 = au.h32;
    const stored = !!h6 && Array.isArray(h6.search) && !!ol && !!h3 && Array.isArray(h3.search) && (() => { try { const a6 = X61.champion(h6.search, LAST); return a6.seed === 26012 && J(Array.from(ol.p16)) === J(a6.weights) && J(Array.from(ol.s02)) === J(Array.from(X32.champion(h3.search, LAST).weights)) && X32.champion(h3.search, LAST).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE FLOWN OLD CHAMPIONS ARE THE STORED ONES", ok: !!stored, text: `p16_26012 is the champion of H61's stored search by H61's rule and s02_26011 that of H32's (each its 1800-iteration weights): ${!!stored}` });
    const o = au.original, k = au.h27, lawRow = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q04").law) === J(k.laws[0]); } catch (er) { return false; } })();
    const regc = lawRow && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q04 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint, and q04 is the champion law of H27's stored Q04 search by H27's rule: ${!!regc}` });
    const seedsOk = J(SEEDS.P24) === J(X32.SEEDS.S02) && Array.isArray(au.earlier) && SEEDS.P24.every((q) => au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.P24.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const dj = [...TRAIN, HELD].every((q) => disjoint(q, au.range)) && au.range.from > EARLIER_AUDIT;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap any train id (26000-26023 and 30000-30047) or the held-out ids 26100-26139, and start after H82's audit (${EARLIER_AUDIT}): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H83: a different price (H32's search at 0.24: seeds 26011-26014, 72 train ids, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.24`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.02 / 0.16 / 0.24:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${[0.02, 0.16, 0.24].map((p) => f4(penGainAt(au, a, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
