// WebGLEngine/tools/ship/headToHead35.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead35Cmd.mjs; the gate is tools/ship/headToHead35-selfcheck.mjs)
//
// ROUND H35 of brain/HEAD_TO_HEAD.md (registered before this file existed): A ROTATING TRAIN SET AT 0.02. H32's resumable (1+1)-ES (963 weights from network-Wip, PS.mutate 1 to 4 weights sigma 0.3, kept when at least the parent's, H27's penalised priced objective at 0.02,
// H28's flyPen, 160 s, state every 50 iterations and at every checkpoint) with ONE change: the train ids are one range of a pool of twelve 24-id ranges for a block of 150 iterations (block k uses range k mod 12; the old 72 ids are three of the twelve, nine are new, 36000-36215);
// at the start of a block the parent is scored on the block's ids and within the block a candidate is kept when its value on those ids is at least the parent's. 5400 iterations (24 x 5400 = 72 x 1800 flights), checkpoints at 2700 / 3600 / 4500 / 5400; the train value of a checkpoint
// is the network's value on the old 72 ids and the held-out value the 40 held-out ids. Four seeds (H32's, group U02); a champion per checkpoint by held-out value; the four 5400-iteration networks are audited each by itself on 200 fresh ids against c02, the law of the price, H32's four
// 1800-iteration networks and H32's champion. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 35200, to: 35399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const OLD72 = X32.TRAIN, HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK;
const r24 = (from) => Object.freeze({ from, to: from + 23 });
/** The pool: twelve batches (each one range of 24 ids): H27's 26000-26023, H30's two halves 30000-30023 and 30024-30047, and nine new ranges 36000-36215. */
export const POOL = Object.freeze([r24(26000), r24(30000), r24(30024), ...Array.from({ length: 9 }, (_, i) => r24(36000 + 24 * i))].map((r) => Object.freeze([r])));
export const BLOCK = 150, ITERS = 5400, CHECKPOINTS = Object.freeze([2700, 3600, 4500, 5400]), STATE_EVERY = X32.STATE_EVERY;
export const GROUPS = Object.freeze(["U02"]), SEEDS = Object.freeze({ U02: [26011, 26012, 26013, 26014] });
export const S_IDS = Object.freeze(SEEDS.U02.map((s) => "s02_" + s)), U_IDS = Object.freeze(SEEDS.U02.map((s) => "u02_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...U_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter, validateState = X32.validateState;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
/** Reads and validates a state file of a U02 search (null when there is none). */
export const loadState = (io, file, ctx = {}) => X32.loadState(io, file, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: "U02" });
/**
 * One RESUMABLE ROTATING network search of the group U02 from `start`: block k of `block` iterations trains on batch k mod pool.length; at a block's start the parent is re-scored on its ids. `save(state)` after every `stateEvery` iterations and every checkpoint;
 * `state` resumes; `onIteration(n)` after iteration n. Returns { seed, group, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore (value on `old`), heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, block = BLOCK, pool = POOL, old = OLD72, sigma = SIGMA, maxK = MAXK, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead35: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead35.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead35.longSearch: stateEvery must be a positive integer");
    if (!isInt(block, 1, 1e9) || !Array.isArray(pool) || !pool.length) throw new Error("headToHead35.longSearch: the block must be a positive integer and the pool a list of batches");
    const c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }, batchOf = (it) => pool[Math.floor(it / block) % pool.length];
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { validateState(state, { seed, group, iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = X30.netObj(w, batchOf(0), PRICE, seconds, f); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        if (it > 0 && it % block === 0) best = X30.netObj(w, batchOf(it), PRICE, seconds, f);
        const cand = PS.mutate(w, sigma, rng, maxK), sc = X30.netObj(cand, batchOf(it), PRICE, seconds, f);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(w), trainScore: X30.netObj(w, old, PRICE, seconds, f), heldScore: X30.netObj(w, [held], PRICE, seconds, f), accepted }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: X32.STATE_VERSION, seed, group, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })) });
        if (onIteration) onIteration(n);
    }
    return { seed, group, startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
/** The ranges the search trains on, in the order of its blocks, run-length encoded: [{ from, to }]; runs a scripted search through the whole of `iters` (the flights are recorded, nothing is flown). */
export function rotationProbe({ iters = ITERS, block = BLOCK, pool = POOL } = {}) {
    const runs = []; let cur = 0;
    const fly = (arm, range) => { const k = Math.floor(cur / block); if (!runs.length || runs[runs.length - 1].k !== k) runs.push({ from: range.from, to: range.to, k }); return Array.from({ length: range.to - range.from + 1 }, (_, i) => ({ key: "k" + i, score: 0.5, bad: false, watts: 1000, thrust: 0 })); };
    longSearch(1, "U02", Array.from({ length: WEIGHT_COUNT }, () => 0.01), { iters, checkpoints: [], block, pool, flyFn: fly, onIteration: (n) => { cur = n; } });
    return runs.map(({ from, to }) => ({ from, to }));
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the best held-out penalised value of the four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.U02, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "U02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead35.champion: group U02 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
/** The 12 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's 1800-iteration networks of the four seeds in seed order] }; `fresh` = { nets: [the four 5400-iteration networks in seed order] }. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead35.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead35.armsOf: h27 is { laws: one 4-weight law }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk)) throw new Error("headToHead35.armsOf: s32 is { nets: four 963-weight vectors }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead35.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); U_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 12; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, earlier = null, startVal = null, rotation = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead35.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, h32, earlier, startVal, rotation, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the first block's ids (26000-26023) at 0.02: the first scored candidate of every search. */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, batch = POOL[0] } = {}) => X30.netObj(wip, batch, PRICE, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
/** The arm id of the group champion at 5400 (the best held-out value of the four searches). */
export const champArm = (au) => "u02_" + champion(au.search, 5400).seed;
/** H32's champion's generalisation gap at 1800 (train minus held-out value of the champion of its stored search). */
export const gap32 = (au) => { const k = X32.champion(au.h32.search, 1800); return k.trainScore - k.heldScore; };
/** The twin counts: each u02_<seed> against s02_<seed> at 0.02: { ahead, behind, tied }. */
export function twinsOf(au) { let ahead = 0, behind = 0, tied = 0; for (const s of SEEDS.U02) { const r = pen(au, "u02_" + s, "s02_" + s).reading; if (r === "BETTER") ahead++; else if (r === "WORSE") behind++; else tied++; } return { ahead, behind, tied }; }
/** The registered verdict, seven parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const c = champArm(au), rd = (b) => word(pen(au, c, b).reading), lost = U_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), t = twinsOf(au);
    const k = champion(au.search, 5400), notBehind = U_IDS.filter((a) => pen(au, a, "c02").reading !== "WORSE").length;
    return [`THE ROTATING CHAMPION ${rd("c02")} C02`, `THE ROTATING CHAMPION ${rd("q02")} THE LAW OF THE PRICE`, `THE ROTATING CHAMPION ${rd("s02_26011")} H32'S CHAMPION`, `TWINS: ${t.ahead} AHEAD, ${t.behind} BEHIND, ${t.tied} TIED`, `LOST SUBS IN THE U02 NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `THE CHAMPION'S GAP IS SMALLER THAN H32'S: ${k.trainScore - k.heldScore < gap32(au) ? "YES" : "NO"}`, `ROTATING NETWORKS NOT BEHIND C02: ${notBehind} OF 4`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per rotating network: its L1 distance from wip and from its fixed-set twin. */
export const distances = (au) => U_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1Twin: l1(au.fresh.nets[i], au.s32.nets[i]) }));
/** The generalisation gap (train value on the old 72 ids minus held-out value) of the group champion at each checkpoint, of every seed at 5400, and H32's champion's at 1800: { champ: [2700..5400], seeds: [26011..26014 at 5400], h32 }. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore;
    return { champ: CHECKPOINTS.map((it) => g(champion(au.search, it))), seeds: SEEDS.U02.map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === "U02"), 5400))), h32: gap32(au) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...S_IDS, ...U_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "U02").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `U02 champion ${gp.champ.map((x) => x.toFixed(4)).join(" / ")} at 2700 / 3600 / 4500 / 5400; each seed at 5400 ${SEEDS.U02.map((s, i) => `${s} ${gp.seeds[i].toFixed(4)}`).join(", ")} (H32's champion at 1800 ${gp.h32.toFixed(4)})`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairs = [...["c02", "q02", "s02_26011"].map((b) => `${c} minus ${b} at 0.02 ${fmt(pen(au, c, b))}`), ...U_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`), ...SEEDS.U02.map((s) => `u02_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "u02_" + s, "s02_" + s))}`)];
    const rank = [...S_IDS, ...U_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Twin.toFixed(2)} from its twin`).join("; ");
    return [
        `SEARCH U02 (first block's start value on 26000-26023, then train value on the old 72 ids / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.filter((r) => r.group === "U02").map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at 5400 is ${c} (the best on the audit: ${[...U_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]})`,
        `GENERALISATION GAP (train value on the old 72 ids minus held-out value): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; audit means in rank order (penalised priced score at 0.02) ${rank}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
/** The registered rotation as run-length ranges, written out from the registered numbers (not from POOL): 36 blocks over twelve ranges. */
const REG_RANGES = [[26000, 26023], [30000, 30023], [30024, 30047], ...Array.from({ length: 9 }, (_, i) => [36000 + 24 * i, 36023 + 24 * i])];
const REG_ROT = J(Array.from({ length: 36 }, (_, k) => ({ from: REG_RANGES[k % 12][0], to: REG_RANGES[k % 12][1] })));
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
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.U02.every((q) => s.filter((r) => r.group === "U02" && r.seed === q).length === 1) && s.every((r) => r.group === "U02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && SEEDS.U02.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(cpOf(s.find((r) => r.seed === q), 5400).weights)) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 network searches (the four seeds of U02), each with checkpoints at 2700, 3600, 4500 and 5400 of 963 finite weights, and the 4 flown networks are the seeds' 5400-iteration weights in seed order: ${!!counted}` });
    const pr = POOL.map((b) => b[0]), poolOk = pr.length === 12 && pr.every((r, i) => r.from === REG_RANGES[i][0] && r.to === REG_RANGES[i][1] && r.to - r.from === 23) && pr.every((a, i) => pr.every((b, j) => i === j || disjoint(a, b))) && pr.slice(0, 3).map((r) => `${r.from}-${r.to}`).join() === "26000-26023,30000-30023,30024-30047" && J([...OLD72]) === J([{ from: 26000, to: 26023 }, { from: 30000, to: 30047 }]);
    const dj = poolOk && pr.every((r) => disjoint(r, HELD) && disjoint(r, au.range)) && au.range.from > 34399;
    rows.push({ name: "THE POOL IS TWELVE DISJOINT RANGES OF 24 IDS, DISJOINT FROM THE HELD-OUT AND AUDIT IDS", ok: dj, text: `the pool is 26000-26023, 30000-30023, 30024-30047 (the old 72 ids) and nine new ranges 36000-36215 (288 ids in all), disjoint from each other, from the held-out ids 26100-26139 and from the audit ids, which start after H34's audit (to 34399): ${dj}` });
    const rot = !!au.rotation && J(au.rotation) === REG_ROT;
    rows.push({ name: "THE ROTATION IS AS REGISTERED", ok: rot, text: `a scripted search of 5400 iterations trained on 36 blocks, block k on range k mod 12 of the pool in the registered order (150 iterations a block): ${rot}` });
    const first = !!counted && Number.isFinite(au.startVal) && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST BLOCK'S PARENT IS WIP ON 26000-26023", ok: first, text: `every search's first scored candidate has exactly wip's penalised value on 26000-26023 at 0.02 (computed in this round): ${first}` });
    const bestAt = (() => { try { const c = champion(s, 5400); return s.every((r) => r.checkpoints.every((k) => k.iter !== 5400 || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), 5400).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT PENALISED OF THE FOUR AT 5400", ok: !!(counted && bestAt), text: `the group champion at 5400 has the largest held-out penalised value of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const h = au.h32, sn = au.s32, nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && J(Array.from(sn.nets[0])) === J(Array.from(X32.champion(h.search, 1800).weights)) && X32.champion(h.search, 1800).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE FOUR S02 ARMS ARE H32'S 1800-ITERATION NETWORKS, S02_26011 ITS CHAMPION", ok: !!nets32, text: `s02_26011 to s02_26014 are the weights at 1800 of the four searches of H32's stored result, and s02_26011 is H32's champion by H32's rule: ${!!nets32}` });
    const o = au.original, k = au.h27, reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint and q02 is the champion law of H27's stored search: ${!!reg}` });
    const seedsOk = J(SEEDS.U02) === J(X32.SEEDS.S02) && Array.isArray(au.earlier) && SEEDS.U02.every((q) => au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.U02.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H35: a rotating train set at 0.02 (group U02, seeds 26011-26014, 5400 iterations in 36 blocks of 150 over twelve 24-id ranges, checkpoints at 2700 / 3600 / 4500 / 5400). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
