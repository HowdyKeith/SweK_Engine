// WebGLEngine/tools/ship/headToHead45.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead45Cmd.mjs; the gate is tools/ship/headToHead45-selfcheck.mjs)
//
// ROUND H45 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT TRAIN SET SEED. H32's search (the 963 weights of network-Wip, the (1+1)-ES, PS.mutate of 1 to 4 weights sigma 0.3, H28's flyPen, 160 s, price 0.02, 1800 iterations, checkpoints 900 / 1200 / 1500 / 1800, resumable, H32's seeds 26011-26014, held-out ids 26100-26139)
// with ONLY the train ids changed: a new draw of 72 (60000-60023 and 61000-61047). H32's loop is written out here because its train set is fixed (the generator stream, the state and the checkpoints are its). Group N72. The four 1800-iteration networks are audited each by itself on 200 fresh ids together with H32's four and H34's four
// (the stored 1800 weights), c02 and q02, so that the spread between train draws can be read against the spread between search seeds. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 45200, to: 45399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const NEW_TRAIN = Object.freeze([Object.freeze({ from: 60000, to: 60023 }), Object.freeze({ from: 61000, to: 61047 })]), OLD_TRAIN = X32.TRAIN;
export const HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK;
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION;
export const GROUPS = Object.freeze(["N72"]), SEEDS = Object.freeze({ N72: [26011, 26012, 26013, 26014] });
export const S_IDS = Object.freeze(X32.SEEDS.S02.map((s) => "s02_" + s)), T_IDS = Object.freeze([26031, 26032, 26033, 26034].map((s) => "t02_" + s)), N_IDS = Object.freeze(SEEDS.N72.map((s) => "n72_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...T_IDS, ...N_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const idCount = (rs) => rs.reduce((n, r) => n + r.to - r.from + 1, 0);
/** Reads and validates a state file of an N72 search (null when there is none): H32's validation, and the state must carry the train ranges of the group. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead45.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: "N72" });
    if (J(s.train) !== J(NEW_TRAIN)) throw new Error(`headToHead45.loadState: the state's train ids are ${J(s.train)}, not ${J(NEW_TRAIN)}`);
    return s;
}
/**
 * One RESUMABLE network search of group N72 from `start`: H32's loop and generator stream exactly with the train ranges handed in (`opts.train`, default the new 72 ids; the gate hands in H32's to compare with H32's) at price 0.02. `save(state)` after every `stateEvery` iterations and every checkpoint (each state carries the train ranges);
 * `state` resumes (it must carry the train ranges used); `onIteration(n)` after iteration n. Returns { seed, group, price, train, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = NEW_TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead45: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead45.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead45.longSearch: stateEvery must be a positive integer");
    if (state && J(state.train) !== J(train)) throw new Error(`headToHead45.longSearch: the state's train ids are ${J(state.train)}, not ${J(train)}`);
    const c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }, obj = (w, r) => X30.netObj(w, r, PRICE, seconds, f);
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { X32.validateState(state, { seed, group, iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = obj(w, train); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = obj(cand, train);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(w), trainScore: best, heldScore: obj(w, [held]), accepted }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })), train });
        if (onIteration) onIteration(n);
    }
    return { seed, group, price: PRICE, train, startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the best held-out (HO) penalised value of its four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.N72, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "N72") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead45.champion: group N72 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 16 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's four 1800 networks] }; `t34` = { nets: [H34's four] }; `fresh` = { nets: [the four new networks in seed order] }. */
export function armsOf(wip, h27, s32, t34, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead45.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead45.armsOf: h27 is { laws: one 4-weight law }");
    for (const [nm, x] of [["s32", s32], ["t34", t34], ["fresh", fresh]]) if (!x || !Array.isArray(x.nets) || x.nets.length !== 4 || !x.nets.every(wOk)) throw new Error(`headToHead45.armsOf: ${nm} is { nets: four 963-weight vectors }`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); T_IDS.forEach((id, i) => { out[id] = netArm(id, t34.nets[i]); }); N_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 16; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, t34, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, h34 = null, earlier = null, startVal = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, t34, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead45.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, t34, fresh, search, original, h32, h34, earlier, startVal, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value at 0.02 on the train ids (the first parent of every search): the new 72 by default. */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = NEW_TRAIN } = {}) => X30.netObj(wip, train, PRICE, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b, p = PRICE) => penPair(au, a, b, p);
export const penMean = (au, a, p = PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
export const meanPower = (au, a) => (avg(au.dark[a].map((r) => r.watts)) + avg(au.lit[a].map((r) => r.watts))) / 2000;
export const champArm = (au) => "n72_" + champion(au.search, LAST).seed;
/** The mean audit value at 0.02 of a group's four networks. */
export const groupMean = (au, ids) => avg(ids.map((a) => penMean(au, a)));
const sdOf = (xs) => { const m = avg(xs); return Math.sqrt(avg(xs.map((a) => (a - m) ** 2))); };
export const groupSd = (au, ids) => sdOf(ids.map((a) => penMean(au, a)));
/** The twelve networks' id with the largest audit mean (the first in the order s02, t02, n72 on a tie). */
export const bestOfTwelve = (au) => { let b = null; for (const a of [...S_IDS, ...T_IDS, ...N_IDS]) { const v = penMean(au, a); if (b === null || v > b.v) b = { a, v }; } return b.a; };
/** The registered verdict, eight parts joined by "; ". */
export function verdictOf(au) {
    const c = champArm(au), rd = (b) => word(pen(au, c, b).reading), lost = N_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), nb = N_IDS.filter((a) => pen(au, a, "c02").reading !== "WORSE").length;
    const mN = groupMean(au, N_IDS), mS = groupMean(au, S_IDS), mT = groupMean(au, T_IDS);
    return [`THE CHAMPION ${rd("c02")} C02`, `THE CHAMPION ${rd("q02")} THE LAW OF THE PRICE`, `THE CHAMPION ${rd("s02_26011")} H32'S CHAMPION`, `MEANS OF THE FOUR: N72 ${mN.toFixed(4)}, S02 ${mS.toFixed(4)}, T02 ${mT.toFixed(4)}`, `THE N72 MEAN IS ABOVE THE T02 MEAN: ${mN > mT ? "YES" : "NO"}`,
        `NETWORKS NOT BEHIND C02: ${nb} OF 4`, `LOST SUBS IN THE N72 NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`, `THE BEST OF THE TWELVE ON THE AUDIT: ${bestOfTwelve(au)}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
export const distances = (au) => N_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1Twin: l1(au.fresh.nets[i], au.s32.nets[i]) }));
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore, k = X32.champion(au.h32.search, 1800);
    return { champ: CHECKPOINTS.map((it) => g(champion(au.search, it))), seeds: SEEDS.N72.map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === "N72"), LAST))), h32: k.trainScore - k.heldScore };
}
export function bottomLines(au) {
    const twelve = [...S_IDS, ...T_IDS, ...N_IDS], shown = ["autopilot", "c02", "q02", ...twelve], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "N72").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `N72 champion ${gp.champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800, each seed at 1800 ${SEEDS.N72.map((s, i) => `${s} ${gp.seeds[i].toFixed(4)}`).join(", ")} (H32's champion at 1800: ${gp.h32.toFixed(4)})`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const values = twelve.map((a) => { const hoV = a.startsWith("s02") ? au.h32.search.find((r) => r.seed === Number(a.slice(4))) : a.startsWith("t02") ? au.h34.search.find((r) => r.seed === Number(a.slice(4))) : au.search.find((r) => r.seed === Number(a.slice(4))); return `${a} audit ${penMean(au, a).toFixed(4)}, HO ${cpOf(hoV, LAST).heldScore.toFixed(4)}`; }).join("; ");
    const pairs = [...["c02", "q02", "s02_26011"].map((b) => `${c} minus ${b} ${fmt(pen(au, c, b))}`), ...N_IDS.map((a) => `${a} minus c02 ${fmt(pen(au, a, "c02"))}`)];
    const rep = [`${c} minus c02 at 0.005 ${fmt(pen(au, c, "c02", 0.005))}`, `${c} minus c02 at 0.04 ${fmt(pen(au, c, "c02", 0.04))}`];
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Twin.toFixed(2)} from its H32 twin`).join("; ");
    const power = ARM_IDS.slice(1).map((a) => `${a} ${meanPower(au, a).toFixed(2)}`).join(", ");
    return [
        `SEARCH N72 (train ids 60000-60023 and 61000-61047; start value, then train / HO penalised value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at 1800 is ${c}`, `GENERALISATION GAP (train value minus HO value): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `EXTRA POWER (mean of dark and lit extra kW over the autopilot): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `VALUES (each of the twelve networks' audit mean at 0.02 and its HO value at 1800): ${values}`,
        `PAIRED (penalised priced score at 0.02): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: the standard deviation of the audit means within N72 ${groupSd(au, N_IDS).toFixed(4)}, S02 ${groupSd(au, S_IDS).toFixed(4)}, T02 ${groupSd(au, T_IDS).toFixed(4)} and of the twelve ${sdOf(twelve.map((a) => penMean(au, a))).toFixed(4)}; pairings of the champion at 0.005 and 0.04: ${rep.join("; ")}; distances ${dist}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
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
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.N72.every((q) => s.filter((r) => r.group === "N72" && r.seed === q).length === 1) && s.every((r) => r.group === "N72" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && SEEDS.N72.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(cpOf(s.find((r) => r.seed === q), LAST).weights)) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 network searches (the four seeds of N72), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 4 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const ids = (r) => r.to - r.from + 1, tr = NEW_TRAIN, flat = tr.flatMap((r) => Array.from({ length: ids(r) }, (_, i) => r.from + i));
    const trainOk = tr.length === 2 && tr[0].from === 60000 && tr[0].to === 60023 && tr[1].from === 61000 && tr[1].to === 61047 && ids(tr[0]) === 24 && ids(tr[1]) === 48 && idCount(tr) === 72 && new Set(flat).size === 72 && Array.isArray(s) && s.length > 0 && s.every((r) => J(r.train) === J(NEW_TRAIN) && r.price === 0.02);
    rows.push({ name: "THE TRAIN IDS ARE AS REGISTERED", ok: !!trainOk, text: `every search record carries the group's train ids 60000-60023 (24) and 61000-61047 (48), 72 distinct ids, and the price 0.02: ${!!trainOk}` });
    const first = !!counted && Number.isFinite(au.startVal) && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST PARENT IS WIP ON THE NEW 72 IDS", ok: first, text: `every search's first parent has exactly wip's penalised value at 0.02 on the new 72 train ids (computed in this round): ${first}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => r.checkpoints.every((k) => k.iter !== LAST || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HO VALUE OF THE FOUR AT 1800", ok: !!(counted && bestAt), text: `the group champion at 1800 has the largest held-out (HO) penalised value of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const h = au.h32, sn = au.s32, hh = au.h34, tn = au.t34;
    const nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && !!hh && Array.isArray(hh.search) && !!tn && Array.isArray(tn.nets) && tn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && X32.champion(h.search, 1800).seed === 26011 && [26031, 26032, 26033, 26034].every((q, i) => J(Array.from(tn.nets[i])) === J(cpOf(hh.search.find((r) => r.seed === q), 1800).weights)); } catch (e) { return false; } })();
    rows.push({ name: "H32'S AND H34'S FOUR ARE THEIR STORED 1800-ITERATION NETWORKS, S02_26011 H32'S CHAMPION", ok: !!nets32, text: `s02_26011 to s02_26014 and t02_26031 to t02_26034 are the weights at 1800 of the stored searches of H32 and H34, and s02_26011 is H32's champion by H32's rule: ${!!nets32}` });
    const o = au.original, k = au.h27, regc = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!regc}` });
    const seedsOk = J(SEEDS.N72) === J(X32.SEEDS.S02) && Array.isArray(au.earlier) && SEEDS.N72.every((q) => au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.N72.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const old = [...OLD_TRAIN, { from: 50000, to: 50071 }, { from: 52000, to: 52039 }, { from: 52100, to: 52299 }, HELD], dj = old.every((q) => disjoint(q, au.range)) && NEW_TRAIN.every((q) => old.every((p) => disjoint(q, p)) && disjoint(q, au.range)) && au.range.from > 44399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the old train ids (26000-26023 and 30000-30047), HO (26100-26139), 50000-50071 or 52000-52299 and start after H44's audit (44399), and the new train ids (60000-60023, 61000-61047) overlap none of them nor the audit: ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H45: a different train set seed (H32's search on a new draw of 72 train ids, 60000-60023 and 61000-61047: seeds 26011-26014, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800, price 0.02). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
