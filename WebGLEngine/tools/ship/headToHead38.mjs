// WebGLEngine/tools/ship/headToHead38.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead38Cmd.mjs; the gate is tools/ship/headToHead38-selfcheck.mjs)
//
// ROUND H38 of brain/HEAD_TO_HEAD.md (registered before this file existed): A SMALLER NETWORK. The fly circuit cut to 17 of its 34 hidden neurons in two ways: X02 PRUNED BY A RULE (the 17 neurons that carry the most weight OUT of the circuit in network-Wip: their four output weights and their outgoing recurrent edges, a tie to the lower index)
// and Y02 AT RANDOM (17 of 34 by a partial Fisher-Yates shuffle from PS.mulberry(4244)), each kept in its original order, with the fly's edges that have both ends kept, renumbered. Each start carries network-Wip's weights on what is kept (a damaged pilot: its value is read). The pilots are createSubPolicy of the
// topologies, registered with the tank (registerPilotKind) as H37's larger circuit is. H32's (1+1)-ES (1800 iterations, 72 train ids, 0.02, checkpoints at 900 / 1200 / 1500 / 1800, resumable) runs on each with H32's seeds; a champion per group and checkpoint by held-out value; the eight 1800-iteration networks are audited each by itself
// on 200 fresh ids against c02, the law of the price and H32's four 963-weight networks. The topologies depend on network-Wip's weights, so the library holds them in a module state that `prepare(wip)` fills (the command and the gate hand wip in); nothing is read from disk here.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as GFC from "../../brain/gfcTopology.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 39200, to: 39399 }), SECONDS = X27.SECONDS, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK, OLD_COUNT = GFC.NEURON_ORDER.length, KEEP = 17, RANDOM_SEED = 4244;
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION;
export const GROUPS = Object.freeze(["X02", "Y02"]), SEEDS = Object.freeze({ X02: [26011, 26012, 26013, 26014], Y02: [26011, 26012, 26013, 26014] });
export const S_IDS = Object.freeze(SEEDS.X02.map((s) => "s02_" + s)), X_IDS = Object.freeze(SEEDS.X02.map((s) => "x02_" + s)), Y_IDS = Object.freeze(SEEDS.Y02.map((s) => "y02_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...X_IDS, ...Y_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
export const FEATURES = PS.FEATURES, OUTPUTS = PS.OUTPUTS;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const wOkN = (w, n) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === n && Array.from(w).every(Number.isFinite);
const wOk963 = (w) => wOkN(w, X27.WEIGHT_COUNT);
const E0 = GFC.EDGES.length, WIP_B1 = FEATURES * OLD_COUNT, WIP_REC = WIP_B1 + OLD_COUNT, WIP_W2 = WIP_REC + E0, WIP_B2 = WIP_W2 + OUTPUTS * OLD_COUNT;
/** The importance of each of the fly circuit's 34 hidden neurons in `wip`: the sum of the absolute values of its four output weights and of the weights of its outgoing recurrent edges. */
export function importanceOf(wip) {
    if (!wOk963(wip)) throw new Error(`headToHead38.importanceOf: wip must be ${X27.WEIGHT_COUNT} finite weights`);
    const imp = new Array(OLD_COUNT).fill(0);
    for (let o = 0; o < OUTPUTS; o++) for (let j = 0; j < OLD_COUNT; j++) imp[j] += Math.abs(wip[WIP_W2 + o * OLD_COUNT + j]);
    GFC.EDGES.forEach(([, from], k) => { imp[from] += Math.abs(wip[WIP_REC + k]); });
    return imp;
}
/** The `keep` neurons of greatest importance (a tie to the lower index), in their original order. */
export const keptPruned = (wip, keep = KEEP) => { const imp = importanceOf(wip); return Array.from({ length: OLD_COUNT }, (_, j) => j).sort((a, b) => (imp[b] - imp[a]) || (a - b)).slice(0, keep).sort((a, b) => a - b); };
/** `keep` of the 34 neurons by a partial Fisher-Yates shuffle (step i swaps position i with i + floor(draw x (34 - i))), in their original order. */
export function keptRandom(seed = RANDOM_SEED, keep = KEEP) {
    const g = PS.mulberry(seed), a = Array.from({ length: OLD_COUNT }, (_, j) => j);
    for (let i = 0; i < keep; i++) { const j = i + Math.floor(g() * (OLD_COUNT - i)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, keep).sort((p, q) => p - q);
}
/** The fly's edges that have both ends in `kept`, renumbered to the kept neurons' new indexes: { edges, index: the original index of each kept edge }. */
export function filterEdges(edges, kept) {
    const map = new Map(kept.map((j, i) => [j, i])), out = [], index = [];
    edges.forEach(([to, from], k) => { if (map.has(to) && map.has(from)) { out.push([map.get(to), map.get(from)]); index.push(k); } });
    return { edges: out, index };
}
/** The topology of the kept neurons: the real body ids in their original order and the filtered edges; with the original index of every kept edge. */
export function topologyOf(kept) {
    const f = filterEdges(GFC.EDGES, kept);
    return { topo: Object.freeze({ NEURON_ORDER: Object.freeze(kept.map((j) => GFC.NEURON_ORDER[j])), EDGES: Object.freeze(f.edges) }), edgeIndex: f.index };
}
/** network-Wip's weights on the kept neurons and edges, laid out for the smaller circuit: W1 (neuron-major), b1, the kept edges, W2 (output-major), b2. */
export function startOf(wip, kept, edgeIndex) {
    const K = kept.length, w = new Float32Array(FEATURES * K + K + edgeIndex.length + OUTPUTS * K + OUTPUTS), rec = FEATURES * K + K, w2 = rec + edgeIndex.length, b2 = w2 + OUTPUTS * K;
    kept.forEach((j, i) => { for (let f = 0; f < FEATURES; f++) w[i * FEATURES + f] = wip[j * FEATURES + f]; w[FEATURES * K + i] = wip[WIP_B1 + j]; for (let o = 0; o < OUTPUTS; o++) w[w2 + o * K + i] = wip[WIP_W2 + o * OLD_COUNT + j]; });
    edgeIndex.forEach((k, i) => { w[rec + i] = wip[WIP_REC + k]; });
    for (let o = 0; o < OUTPUTS; o++) w[b2 + o] = wip[WIP_B2 + o];
    return w;
}
/** The two smaller circuits, filled by prepare(wip): { X02: { kept, topo, edgeIndex, policy, weightCount, kind, start }, Y02: {...} }. */
let SMALL = null;
export function prepare(wip) {
    if (!wOk963(wip)) throw new Error(`headToHead38.prepare: wip must be ${X27.WEIGHT_COUNT} finite weights`);
    const mk = (group, kept) => { const t = topologyOf(kept), policy = PS.createSubPolicy(t.topo, group === "X02" ? "the pruned Giant Fiber Circuit" : "the random-subset Giant Fiber Circuit"), circuit = "h38-" + group.toLowerCase();
        const kind = Object.freeze({ circuit, label: "H38 " + group, weightCount: policy.WEIGHT_COUNT, persist: false, build: (w) => policy.pilotFor(w) });
        return Object.freeze({ group, kept: Object.freeze([...kept]), topo: t.topo, edgeIndex: Object.freeze(t.edgeIndex), policy, weightCount: policy.WEIGHT_COUNT, kind, start: startOf(wip, kept, t.edgeIndex) }); };
    SMALL = Object.freeze({ X02: mk("X02", keptPruned(wip)), Y02: mk("Y02", keptRandom()) });
    return SMALL;
}
export const small = (group) => { if (!SMALL) throw new Error("headToHead38: prepare(wip) has not been called"); if (!SMALL[group]) throw new Error(`headToHead38: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`); return SMALL[group]; };
/** An arm that flies a smaller network of `group` with weights `w`. */
export function smallArm(id, group, w) {
    const sm = small(group);
    if (!wOkN(w, sm.weightCount)) throw new Error(`headToHead38.smallArm: a ${group} network is ${sm.weightCount} finite weights`);
    return { id, layer: "flying", controls: ["autopilot"], note: `smaller network ${id}`, entry: () => ({ pilot: "network", circuit: sm.kind.circuit, weights: Array.from(w) }), register: (tank) => tank.registerPilotKind(sm.kind.circuit, sm.kind) };
}
/** The penalised priced objective of a smaller network of `group` on a list of id ranges at a price (X30.netObj with the smaller arm). */
export function netObj(w, ranges, price, seconds = SECONDS, flyFn = flyPen, group = "X02") {
    if (!(price >= 0)) throw new Error(`headToHead38.netObj: the price must be a number of 0 or more, got ${J(price)}`);
    if (!Array.isArray(ranges) || !ranges.length) throw new Error("headToHead38.netObj: the ranges must be a non-empty list");
    const arm = smallArm("net", group, w), d = [], l = [];
    for (const r of ranges) { d.push(...flyFn(arm, r, seconds, "dropout")); l.push(...flyFn(arm, r, seconds, null)); }
    return 0.5 * (avg(d.map(X27.penScore)) + avg(l.map(X27.penScore))) - price * 0.5 * (avg(d.map((r) => r.watts)) + avg(l.map((r) => r.watts))) / 1000;
}
/** Refuses a state that is not exactly a saved state of THIS search (named by the first fault). */
export function validateState(s, { seed, group, iters = ITERS, checkpoints = CHECKPOINTS } = {}) {
    const bad = (why) => { throw new Error(`headToHead38.validateState: ${why}`); }, n = small(group).weightCount;
    if (!s || typeof s !== "object" || Array.isArray(s)) bad("the state is not an object");
    if (s.version !== STATE_VERSION) bad(`the state's version is ${J(s.version)}, not ${STATE_VERSION}`);
    if (s.seed !== seed) bad(`the state is of seed ${J(s.seed)}, not ${seed}`);
    if (s.group !== group) bad(`the state is of group ${J(s.group)}, not ${J(group)}`);
    if (s.iters !== iters) bad(`the state is of a search of ${J(s.iters)} iterations, not ${iters}`);
    if (!isInt(s.iter, 0, iters)) bad(`the iteration ${J(s.iter)} is not an integer from 0 to ${iters}`);
    if (!wOkN(s.weights, n)) bad(`the weights are not ${n} finite numbers`);
    if (!Number.isFinite(s.best) || !Number.isFinite(s.startTrain)) bad("the best value or the start value is not a finite number");
    if (!isInt(s.accepted, 0, s.iter)) bad(`the accepted count ${J(s.accepted)} is not an integer from 0 to the iteration`);
    if (!isInt(s.lost, 0, 1e9)) bad(`the lost-flight count ${J(s.lost)} is not a non-negative integer`);
    if (!isInt(s.draws, 0, 1e12)) bad(`the draw count ${J(s.draws)} is not a non-negative integer`);
    if (!Array.isArray(s.resumes) || !s.resumes.every((x) => isInt(x, 0, iters))) bad("the resumes are not a list of iterations");
    if (!Array.isArray(s.checkpoints) || J(s.checkpoints.map((k) => k && k.iter)) !== J(checkpoints.filter((c) => c <= s.iter))) bad("the checkpoints recorded are not exactly those at or before the iteration");
    for (const k of s.checkpoints) if (!wOkN(k.weights, n) || !Number.isFinite(k.trainScore) || !Number.isFinite(k.heldScore) || !isInt(k.accepted, 0, k.iter)) bad(`the checkpoint at ${k.iter} is malformed`);
    return s;
}
/** Reads and validates a state file of a search of `ctx.group` (null when there is none); `io` is { existsSync, readFileSync }. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead38.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    return validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx });
}
/**
 * One RESUMABLE network search of `group` (X02 or Y02) from `start` (the group's start): H32's loop and generator stream exactly on the smaller weight vector (PS.mutate of 1 to maxK weights, sigma), the objective with the group's arm. `save(state)` after every `stateEvery` iterations and every checkpoint;
 * `state` resumes; `onIteration(n)` after iteration n. Returns { seed, group, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead38: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    const sm = small(group);
    if (!wOkN(start, sm.weightCount)) throw new Error(`headToHead38.longSearch: the start must be ${sm.weightCount} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead38.longSearch: stateEvery must be a positive integer");
    const c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }, obj = (w, r) => netObj(w, r, PRICE, seconds, f, group);
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { validateState(state, { seed, group, iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = obj(w, train); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = obj(cand, train);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(w), trainScore: best, heldScore: obj(w, [held]), accepted }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })) });
        if (onIteration) onIteration(n);
    }
    return { seed, group, startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
/** The probe of the starts: whether each start carries network-Wip's weights on what is kept, read back by position (feature weights, bias, kept edges, output weights, output biases, and nothing else nonzero that is not Wip's), and the counts. */
export function startProbe(wip) {
    const out = {};
    for (const g of GROUPS) {
        const sm = small(g), K = sm.kept.length, w = sm.start, rec = FEATURES * K + K, w2 = rec + sm.edgeIndex.length, b2 = w2 + OUTPUTS * K; let ok = w.length === sm.weightCount && w.every(Number.isFinite);
        sm.kept.forEach((j, i) => { for (let f = 0; f < FEATURES; f++) if (w[i * FEATURES + f] !== Math.fround(wip[j * FEATURES + f])) ok = false; if (w[FEATURES * K + i] !== Math.fround(wip[WIP_B1 + j])) ok = false; for (let o = 0; o < OUTPUTS; o++) if (w[w2 + o * K + i] !== Math.fround(wip[WIP_W2 + o * OLD_COUNT + j])) ok = false; });
        sm.edgeIndex.forEach((k, i) => { if (w[rec + i] !== Math.fround(wip[WIP_REC + k])) ok = false; });
        for (let o = 0; o < OUTPUTS; o++) if (w[b2 + o] !== Math.fround(wip[WIP_B2 + o])) ok = false;
        out[g] = { positionsOk: ok, neurons: K, edges: sm.edgeIndex.length, weights: sm.weightCount };
    }
    return out;
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of `group` at a checkpoint: the best held-out penalised value of its four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, group, iter) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) && seeds ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || !CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead38.champion: group ${group} needs one search for each of the seeds ${seeds ? seeds.join(", ") : "(none: no such group)"}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 16 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's four 1800-iteration networks in seed order] }; `fresh` = { X02: [four pruned networks], Y02: [four random-subset networks] } in seed order. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk963(wip)) throw new Error(`headToHead38.armsOf: wip must be ${X27.WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead38.armsOf: h27 is { laws: one 4-weight law }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk963)) throw new Error("headToHead38.armsOf: s32 is { nets: four 963-weight vectors }");
    for (const g of GROUPS) if (!fresh || !Array.isArray(fresh[g]) || fresh[g].length !== 4 || !fresh[g].every((w) => wOkN(w, small(g).weightCount))) throw new Error(`headToHead38.armsOf: fresh.${g} is four ${small(g).weightCount}-weight vectors`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); X_IDS.forEach((id, i) => { out[id] = smallArm(id, "X02", fresh.X02[i]); }); Y_IDS.forEach((id, i) => { out[id] = smallArm(id, "Y02", fresh.Y02[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 16; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, earlier = null, startVals = null, startVal32 = null, probe = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead38.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, h32, earlier, startVals, startVal32, probe, proof32, fixture, c02: all.c02.entry().weights };
}
/** The penalised value of each smaller start on the 72 train ids at 0.02, and how many flights lost a run: { X02: { value, lost }, Y02: {...} }; and wip's own (H32's start value). */
export function startValues(wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) {
    const out = {}; for (const g of GROUPS) { let lost = 0; const f = (arm, range, secs, ev) => { const o = flyFn(arm, range, secs, ev); if (o.some((r) => r.bad)) lost++; return o; }; out[g] = { value: netObj(small(g).start, train, PRICE, seconds, f, g), lost }; }
    return out;
}
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => X32.startVal(wip, { seconds, flyFn, train });
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
/** The arm id of a group's champion at 1800 (x02_<seed> or y02_<seed>). */
export const champArm = (au, group) => (group === "X02" ? "x02_" : "y02_") + champion(au.search, group, LAST).seed;
/** H32's champion's generalisation gap at 1800 (train minus held-out value of the champion of its stored search). */
export const gap32 = (au) => { const k = X32.champion(au.h32.search, 1800); return k.trainScore - k.heldScore; };
/** The twin counts: each x02_<seed> against s02_<seed> at 0.02: { ahead, behind, tied }. */
export function twinsOf(au) { let ahead = 0, behind = 0, tied = 0; for (const s of SEEDS.X02) { const r = pen(au, "x02_" + s, "s02_" + s).reading; if (r === "BETTER") ahead++; else if (r === "WORSE") behind++; else tied++; } return { ahead, behind, tied }; }
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const c = champArm(au, "X02"), d = champArm(au, "Y02"), rd = (b) => word(pen(au, c, b).reading), lost = [...X_IDS, ...Y_IDS].filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), t = twinsOf(au);
    const k = champion(au.search, "X02", LAST), notBehind = X_IDS.filter((a) => pen(au, a, "c02").reading !== "WORSE").length;
    return [`THE PRUNED CHAMPION ${rd("c02")} C02`, `THE PRUNED CHAMPION ${rd("q02")} THE LAW OF THE PRICE`, `THE PRUNED CHAMPION ${rd("s02_26011")} H32'S CHAMPION`, `TWINS: ${t.ahead} AHEAD, ${t.behind} BEHIND, ${t.tied} TIED`, `LOST SUBS IN THE SMALLER NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `THE PRUNED CHAMPION'S GAP IS SMALLER THAN H32'S: ${k.trainScore - k.heldScore < gap32(au) ? "YES" : "NO"}`, `PRUNED NETWORKS NOT BEHIND C02: ${notBehind} OF 4`, `THE PRUNED CHAMPION ${rd(d)} THE RANDOM CHAMPION`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
/** The generalisation gap (train minus held-out value) of each group's champion at each checkpoint, of every seed at 1800, and H32's champion's at 1800: { X02: { champ: [..], seeds: [..] }, Y02: {...}, h32 }. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore, one = (grp) => ({ champ: CHECKPOINTS.map((it) => g(champion(au.search, grp, it))), seeds: SEEDS[grp].map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === grp), LAST))) });
    return { X02: one("X02"), Y02: one("Y02"), h32: gap32(au) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...S_IDS, ...X_IDS, ...Y_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au, "X02"), d = champArm(au, "Y02");
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const searchOf = (g) => au.search.filter((r) => r.group === g).map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = GROUPS.map((g) => `${g} ${CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, g, it).seed} held ${champion(au.search, g, it).heldScore.toFixed(4)}`).join(", ")}`).join("; ");
    const gp = gapsOf(au), gapText = (g) => `${g} champion ${gp[g].champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800, each seed at 1800 ${SEEDS[g].map((s, i) => `${s} ${gp[g].seeds[i].toFixed(4)}`).join(", ")}`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairs = [...["c02", "q02", "s02_26011", d].map((b) => `${c} minus ${b} at 0.02 ${fmt(pen(au, c, b))}`), ...X_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`), ...SEEDS.X02.map((s) => `x02_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "x02_" + s, "s02_" + s))}`), ...SEEDS.Y02.map((s) => `y02_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "y02_" + s, "s02_" + s))}`)];
    const rank = [...S_IDS, ...X_IDS, ...Y_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const rec = au.search.map((r) => `${r.group} ${r.seed} ${r.startTrain.toFixed(4)} to ${cpOf(r, LAST).trainScore.toFixed(4)}`).join("; ");
    const sm = (g) => small(g), topo = GROUPS.map((g) => `${g}: ${sm(g).kept.length} neurons (the fly's ${sm(g).kept.join(" ")}), ${sm(g).edgeIndex.length} edges, ${sm(g).weightCount} weights`).join("; ");
    const imp = importanceOf(au.wip), kept = sm("X02").kept, others = Array.from({ length: OLD_COUNT }, (_, j) => j).filter((j) => !kept.includes(j));
    const sv = au.startVals;
    return [
        `TOPOLOGY (the smaller circuits): ${topo}; X02 kept the 17 of greatest importance (smallest kept ${Math.min(...kept.map((j) => imp[j])).toFixed(3)}, largest dropped ${Math.max(...others.map((j) => imp[j])).toFixed(3)}); Y02 drawn by the partial shuffle seeded ${RANDOM_SEED}`,
        `STARTS (penalised value on the 72 train ids at 0.02; network-Wip's is ${au.startVal32.toFixed(4)}): X02 ${sv.X02.value.toFixed(4)} (${sv.X02.lost} flights lost a run), Y02 ${sv.Y02.value.toFixed(4)} (${sv.Y02.lost} flights lost a run)`,
        `SEARCH X02 (start value, then train / held-out penalised value and accepted count at each checkpoint): ${searchOf("X02")}`,
        `SEARCH Y02 (the same): ${searchOf("Y02")}`,
        `RESUMES: ${au.search.map((r) => `${r.group} ${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champions at 1800 are ${c} and ${d} (the best pruned on the audit: ${[...X_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]}, the best random: ${[...Y_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]})`,
        `GENERALISATION GAP (train value minus held-out value): ${gapText("X02")}; ${gapText("Y02")} (H32's champion at 1800 ${gp.h32.toFixed(4)})`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: recovery (start value to the 1800 train value) ${rec}; audit means in rank order (penalised priced score at 0.02) ${rank}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
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
    const s = au.search, wn = (g) => small(g).weightCount;
    const counted = Array.isArray(s) && s.length === 8 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOkN(k.weights, wn(r.group)) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && GROUPS.every((g) => Array.isArray(au.fresh[g]) && au.fresh[g].length === 4 && au.fresh[g].every((w) => wOkN(w, wn(g))) && SEEDS[g].every((q, i) => J(Array.from(au.fresh[g][i])) === J(cpOf(s.find((r) => r.group === g && r.seed === q), LAST).weights))) && wOk963(au.wip);
    rows.push({ name: "8 SEARCHES, EACH SEED OF EACH GROUP ONCE, EACH WITH FOUR CHECKPOINTS OF THE GROUP'S WEIGHTS", ok: !!counted, text: `8 network searches (the four seeds of X02 and of Y02), each with checkpoints at 900, 1200, 1500 and 1800 of the group's finite weights, and the 8 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const imp = wOk963(au.wip) ? importanceOf(au.wip) : new Array(OLD_COUNT).fill(NaN), order = Array.from({ length: OLD_COUNT }, (_, j) => j).sort((a, b) => (imp[b] - imp[a]) || (a - b)).slice(0, 17).sort((a, b) => a - b), g2 = PS.mulberry(4244), arr = Array.from({ length: 34 }, (_, j) => j);
    for (let i = 0; i < 17; i++) { const j = i + Math.floor(g2() * (34 - i)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    const regY = arr.slice(0, 17).sort((a, b) => a - b), topoOf = (g) => { const k = small(g).kept, set = new Set(k), idx = new Map(k.map((j, i) => [j, i])), exp = GFC.EDGES.filter(([t, f]) => set.has(t) && set.has(f)).map(([t, f]) => [idx.get(t), idx.get(f)]); const E = small(g).topo.EDGES; return k.length === 17 && J(small(g).topo.NEURON_ORDER) === J(k.map((j) => GFC.NEURON_ORDER[j])) && J(E) === J(exp) && new Set(E.map(([t, f]) => t * 100 + f)).size === E.length && E.every(([t, f]) => t !== f && t < 17 && f < 17) && small(g).weightCount === 14 * 17 + 17 + E.length + 17 * 4 + 4; };
    const topoOk = wOk963(au.wip) && J(small("X02").kept) === J(order) && J(small("Y02").kept) === J(regY) && topoOf("X02") && topoOf("Y02") && J(small("X02").kept) !== J(small("Y02").kept);
    rows.push({ name: "THE TOPOLOGIES ARE AS REGISTERED", ok: topoOk, text: `X02 keeps the 17 neurons of greatest importance in network-Wip (computed again independently), Y02 the 17 of the registered draw (generator seeded 4244, read again independently), each with the fly's edges that have both ends kept renumbered (${small("X02").edgeIndex.length} and ${small("Y02").edgeIndex.length}), no self-loop or repeat, ${small("X02").weightCount} and ${small("Y02").weightCount} weights: ${topoOk}` });
    const sp = au.probe, startOk = !!sp && GROUPS.every((g) => !!sp[g] && sp[g].positionsOk === true && sp[g].neurons === 17 && sp[g].edges === small(g).edgeIndex.length && sp[g].weights === small(g).weightCount);
    rows.push({ name: "THE STARTS ARE NETWORK-WIP'S WEIGHTS ON WHAT IS KEPT", ok: startOk, text: `each start carries network-Wip's feature weights, biases, kept edges, output weights and output biases at their own places (read back by position): ${startOk}` });
    const sv = au.startVals, flyOk = !!sv && GROUPS.every((g) => !!sv[g] && Number.isFinite(sv[g].value) && isInt(sv[g].lost, 0, 1e6));
    rows.push({ name: "THE STARTS FLY THROUGH THE TANK", ok: flyOk, text: `each start flown through the tank (registered with registerPilotKind) on the 72 train ids at 0.02 gives a finite value and a count of flights that lost a run: ${flyOk}` });
    const first = !!counted && flyOk && Number.isFinite(au.startVal32) && s.every((r) => r.startTrain === sv[r.group].value);
    rows.push({ name: "THE FIRST PARENT IS THE START ON THE 72 IDS", ok: first, text: `every search's first parent has exactly its group's start value on the 72 train ids at 0.02 (computed in this round): ${first}` });
    const bestAt = (g) => { try { const c = champion(s, g, LAST); return s.every((r) => r.group !== g || r.checkpoints.every((k) => k.iter !== LAST || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.group === g && r.seed === c.seed), LAST).weights); } catch (e) { return false; } };
    rows.push({ name: "EACH GROUP'S CHAMPION IS THE BEST HELD-OUT PENALISED OF ITS FOUR AT 1800", ok: !!(counted && bestAt("X02") && bestAt("Y02")), text: `each group's champion at 1800 has the largest held-out penalised value of its four seeds (the first of a tie in seed order): ${!!(counted && bestAt("X02") && bestAt("Y02"))}` });
    const h = au.h32, sn = au.s32, nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && J(Array.from(sn.nets[0])) === J(Array.from(X32.champion(h.search, 1800).weights)) && X32.champion(h.search, 1800).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE FOUR S02 ARMS ARE H32'S 1800-ITERATION NETWORKS, S02_26011 ITS CHAMPION", ok: !!nets32, text: `s02_26011 to s02_26014 are the weights at 1800 of the four searches of H32's stored result, and s02_26011 is H32's champion by H32's rule: ${!!nets32}` });
    const o = au.original, k = au.h27, regc = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk963(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint and q02 is the champion law of H27's stored search: ${!!regc}` });
    const seedsOk = J(SEEDS.X02) === J(X32.SEEDS.S02) && J(SEEDS.Y02) === J(X32.SEEDS.S02) && Array.isArray(au.earlier) && SEEDS.X02.every((q) => au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.X02.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds of each group are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48;
    const dj = trainOk && [...TRAIN, HELD].every((a) => disjoint(a, au.range)) && au.range.from > 38399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the 72 train ids (26000-26023 and 30000-30047) or the held-out ids 26100-26139, and start after H37's audit (38399): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H38: a smaller network (17 of the fly circuit's 34 hidden neurons, pruned by a rule (X02) and drawn at random (Y02), starting as network-Wip's weights on what is kept) searched as H32's was (seeds 26011-26014, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
