// WebGLEngine/tools/ship/headToHead37.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead37Cmd.mjs; the gate is tools/ship/headToHead37-selfcheck.mjs)
//
// ROUND H37 of brain/HEAD_TO_HEAD.md (registered before this file existed): A LARGER NETWORK. The fly circuit's 34 hidden neurons plus 34 new ones (68), the new ones wired in at the fly core's density by a seeded draw (PS.mulberry(4243): every ordered pair touching a new neuron is an edge with probability 313/1122),
// built with createSubPolicy exactly as the fly's and the fish's circuits are, and STARTING EXACTLY AS network-Wip: every weight that reads a new neuron is zero, every weight that feeds one is N(0, 0.3) from the same generator. H32's (1+1)-ES (1800 iterations, 72 train ids, 0.02, checkpoints at 900 / 1200 / 1500 / 1800, resumable)
// is run on the larger weight vector with H32's seeds (group W02); a champion per checkpoint by held-out value; the four 1800-iteration networks are audited each by itself on 200 fresh ids against c02, the law of the price, H32's four 963-weight networks and H32's champion. The flight registers the larger circuit
// with the tank (registerPilotKind), as H16's law does. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as GFC from "../../brain/gfcTopology.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 38200, to: 38399 }), SECONDS = X27.SECONDS, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK, OLD_COUNT = GFC.NEURON_ORDER.length, NEW_COUNT = 34, TOPO_SEED = 4243, INIT_SIGMA = 0.3, P_EDGE = GFC.EDGES.length / (OLD_COUNT * (OLD_COUNT - 1));
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION;
export const GROUPS = Object.freeze(["W02"]), SEEDS = Object.freeze({ W02: [26011, 26012, 26013, 26014] });
export const S_IDS = Object.freeze(SEEDS.W02.map((s) => "s02_" + s)), W_IDS = Object.freeze(SEEDS.W02.map((s) => "w02_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...W_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
export const FEATURES = PS.FEATURES, OUTPUTS = PS.OUTPUTS;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const HID = OLD_COUNT + NEW_COUNT;
/** The wide topology and the draws of its start, from one generator: the edges (every ordered pair touching a new neuron, in order of target then source, drawn below P_EDGE), then N(0, INIT_SIGMA) for the feature weights of each new neuron (neuron by neuron, feature by feature), then for each edge from an old neuron into a new one (in edge order); an edge between two new neurons READS a new neuron and so starts at zero (the registration's rule that everything that reads a new neuron is zero wins over its wording that incoming edges are drawn). */
export function buildWide(seed = TOPO_SEED) {
    const gen = PS.mulberry(seed), edges = GFC.EDGES.map((e) => [e[0], e[1]]);
    for (let to = 0; to < HID; to++) for (let from = 0; from < HID; from++) { if (to === from || (to < OLD_COUNT && from < OLD_COUNT)) continue; if (gen() < P_EDGE) edges.push([to, from]); }
    const featureDraws = []; for (let j = OLD_COUNT; j < HID; j++) for (let f = 0; f < FEATURES; f++) featureDraws.push(gauss(gen) * INIT_SIGMA);
    const edgeDraws = []; edges.forEach(([to, from], k) => { if (to >= OLD_COUNT && from < OLD_COUNT) edgeDraws.push([k, gauss(gen) * INIT_SIGMA]); });
    const topo = Object.freeze({ NEURON_ORDER: Object.freeze([...GFC.NEURON_ORDER, ...Array.from({ length: NEW_COUNT }, (_, i) => i + 1)]), EDGES: Object.freeze(edges) });
    return { topo, newEdges: edges.length - GFC.EDGES.length, featureDraws, edgeDraws };
}
export const WIDE_BUILD = buildWide(), WIDE = PS.createSubPolicy(WIDE_BUILD.topo, "the Giant Fiber Circuit plus 34 new neurons"), WEIGHT_COUNT = WIDE.WEIGHT_COUNT;
const wOkN = (w, n) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === n && Array.from(w).every(Number.isFinite);
const wOk = (w) => wOkN(w, WEIGHT_COUNT), wOk963 = (w) => wOkN(w, X27.WEIGHT_COUNT);
/** The offsets of the wide weight vector's blocks: W1 (neuron-major, FEATURES a neuron), b1, the recurrent edges, W2 (output-major, HID a row), b2. */
export const OFFS = Object.freeze({ b1: FEATURES * HID, rec: FEATURES * HID + HID, w2: FEATURES * HID + HID + WIDE_BUILD.topo.EDGES.length, b2: FEATURES * HID + HID + WIDE_BUILD.topo.EDGES.length + HID * OUTPUTS });
/** The larger start: network-Wip's weights in their own places, everything that reads a new neuron zero, everything that feeds one the registered draw (its bias zero). */
export function wideStart(wip) {
    if (!wOk963(wip)) throw new Error(`headToHead37.wideStart: wip must be ${X27.WEIGHT_COUNT} finite weights`);
    const w = new Float32Array(WEIGHT_COUNT), E0 = GFC.EDGES.length, o1 = FEATURES * OLD_COUNT, ob1 = o1 + OLD_COUNT, ow2 = ob1 + E0, ob2 = ow2 + OLD_COUNT * OUTPUTS;
    for (let i = 0; i < o1; i++) w[i] = wip[i];
    for (let j = 0; j < OLD_COUNT; j++) w[OFFS.b1 + j] = wip[o1 + j];
    for (let k = 0; k < E0; k++) w[OFFS.rec + k] = wip[ob1 + k];
    for (let o = 0; o < OUTPUTS; o++) for (let j = 0; j < OLD_COUNT; j++) w[OFFS.w2 + o * HID + j] = wip[ow2 + o * OLD_COUNT + j];
    for (let o = 0; o < OUTPUTS; o++) w[OFFS.b2 + o] = wip[ob2 + o];
    WIDE_BUILD.featureDraws.forEach((v, i) => { w[OLD_COUNT * FEATURES + i] = v; });
    for (const [k, v] of WIDE_BUILD.edgeDraws) w[OFFS.rec + k] = v;
    return w;
}
/** The tank kind of the larger circuit (the weights are the larger vector). */
export const KIND = Object.freeze({ circuit: "h37-wide", label: "H37 wide fly circuit", weightCount: WEIGHT_COUNT, persist: false, build: (w) => WIDE.pilotFor(w) });
/** An arm that flies the larger network with weights `w`. */
export function wideArm(id, w) {
    if (!wOk(w)) throw new Error(`headToHead37.wideArm: a larger network is ${WEIGHT_COUNT} finite weights`);
    return { id, layer: "flying", controls: ["autopilot"], note: `larger network ${id}`, entry: () => ({ pilot: "network", circuit: KIND.circuit, weights: Array.from(w) }), register: (tank) => tank.registerPilotKind(KIND.circuit, KIND) };
}
/** The penalised priced objective of a larger network on a list of id ranges at a price (X30.netObj with the larger arm). */
export function netObj(w, ranges, price, seconds = SECONDS, flyFn = flyPen) {
    if (!(price >= 0)) throw new Error(`headToHead37.netObj: the price must be a number of 0 or more, got ${J(price)}`);
    if (!Array.isArray(ranges) || !ranges.length) throw new Error("headToHead37.netObj: the ranges must be a non-empty list");
    const arm = wideArm("net", w), d = [], l = [];
    for (const r of ranges) { d.push(...flyFn(arm, r, seconds, "dropout")); l.push(...flyFn(arm, r, seconds, null)); }
    return 0.5 * (avg(d.map(X27.penScore)) + avg(l.map(X27.penScore))) - price * 0.5 * (avg(d.map((r) => r.watts)) + avg(l.map((r) => r.watts))) / 1000;
}
/** Refuses a state that is not exactly a saved state of THIS search (named by the first fault). */
export function validateState(s, { seed, group, iters = ITERS, checkpoints = CHECKPOINTS } = {}) {
    const bad = (why) => { throw new Error(`headToHead37.validateState: ${why}`); };
    if (!s || typeof s !== "object" || Array.isArray(s)) bad("the state is not an object");
    if (s.version !== STATE_VERSION) bad(`the state's version is ${J(s.version)}, not ${STATE_VERSION}`);
    if (s.seed !== seed) bad(`the state is of seed ${J(s.seed)}, not ${seed}`);
    if (s.group !== group) bad(`the state is of group ${J(s.group)}, not ${J(group)}`);
    if (s.iters !== iters) bad(`the state is of a search of ${J(s.iters)} iterations, not ${iters}`);
    if (!isInt(s.iter, 0, iters)) bad(`the iteration ${J(s.iter)} is not an integer from 0 to ${iters}`);
    if (!wOk(s.weights)) bad(`the weights are not ${WEIGHT_COUNT} finite numbers`);
    if (!Number.isFinite(s.best) || !Number.isFinite(s.startTrain)) bad("the best value or the start value is not a finite number");
    if (!isInt(s.accepted, 0, s.iter)) bad(`the accepted count ${J(s.accepted)} is not an integer from 0 to the iteration`);
    if (!isInt(s.lost, 0, 1e9)) bad(`the lost-flight count ${J(s.lost)} is not a non-negative integer`);
    if (!isInt(s.draws, 0, 1e12)) bad(`the draw count ${J(s.draws)} is not a non-negative integer`);
    if (!Array.isArray(s.resumes) || !s.resumes.every((x) => isInt(x, 0, iters))) bad("the resumes are not a list of iterations");
    if (!Array.isArray(s.checkpoints) || J(s.checkpoints.map((k) => k && k.iter)) !== J(checkpoints.filter((c) => c <= s.iter))) bad("the checkpoints recorded are not exactly those at or before the iteration");
    for (const k of s.checkpoints) if (!wOk(k.weights) || !Number.isFinite(k.trainScore) || !Number.isFinite(k.heldScore) || !isInt(k.accepted, 0, k.iter)) bad(`the checkpoint at ${k.iter} is malformed`);
    return s;
}
/** Reads and validates a state file of a W02 search (null when there is none); `io` is { existsSync, readFileSync }. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead37.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    return validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: "W02" });
}
/**
 * One RESUMABLE network search of the group W02 from `start` (the larger start): H32's loop and generator stream exactly on the larger weight vector (PS.mutate of 1 to maxK weights, sigma), the objective with the larger arm. `save(state)` after every `stateEvery` iterations and every checkpoint;
 * `state` resumes; `onIteration(n)` after iteration n. Returns { seed, group, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead37: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead37.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead37.longSearch: stateEvery must be a positive integer");
    const c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; };
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { validateState(state, { seed, group, iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = netObj(w, train, PRICE, seconds, f); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = netObj(cand, train, PRICE, seconds, f);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(w), trainScore: best, heldScore: netObj(w, [held], PRICE, seconds, f), accepted }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })) });
        if (onIteration) onIteration(n);
    }
    return { seed, group, startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
/** The probe of the start: on `n` random feature vectors (from PS.mulberry(777)) the largest difference between the larger start's outputs and network-Wip's, whether every weight that reads a new neuron is zero, and how many of the weights that feed new neurons are nonzero against the draws. */
export function preserveProbe(wip, n = 50) {
    const w = wideStart(wip), g = PS.mulberry(777); let maxDiff = 0;
    for (let i = 0; i < n; i++) { const x = Array.from({ length: FEATURES }, () => (g() - 0.5) * 4), a = WIDE.forward(w, x), b = PS.FLY.forward(wip, x); for (const k of ["pitch", "yaw", "thrust", "ballast"]) maxDiff = Math.max(maxDiff, Math.abs(a[k] - b[k])); }
    const E = WIDE_BUILD.topo.EDGES; let readZero = true, fed = 0;
    E.forEach(([to, from], k) => { if (from >= OLD_COUNT && w[OFFS.rec + k] !== 0) readZero = false; if (to >= OLD_COUNT && from < OLD_COUNT && w[OFFS.rec + k] !== 0) fed++; });
    for (let o = 0; o < OUTPUTS; o++) for (let j = OLD_COUNT; j < HID; j++) if (w[OFFS.w2 + o * HID + j] !== 0) readZero = false;
    for (let j = OLD_COUNT; j < HID; j++) { if (w[OFFS.b1 + j] !== 0) readZero = false; for (let f = 0; f < FEATURES; f++) if (w[j * FEATURES + f] !== 0) fed++; }
    return { n, maxDiff, readZero, fed, drawn: WIDE_BUILD.featureDraws.length + WIDE_BUILD.edgeDraws.length, dimension: w.length };
}
/** The weights that read or feed a new neuron: { reads: indices of the weights that carry a new neuron's activity (its outgoing edges and its output weights), feeds: the weights into a new neuron (feature weights, bias, incoming edges) }. */
export function newParts() {
    const E = WIDE_BUILD.topo.EDGES, reads = [], feeds = [];
    E.forEach(([to, from], k) => { if (from >= OLD_COUNT) reads.push(OFFS.rec + k); if (to >= OLD_COUNT) feeds.push(OFFS.rec + k); });
    for (let o = 0; o < OUTPUTS; o++) for (let j = OLD_COUNT; j < HID; j++) reads.push(OFFS.w2 + o * HID + j);
    for (let j = OLD_COUNT; j < HID; j++) { feeds.push(OFFS.b1 + j); for (let f = 0; f < FEATURES; f++) feeds.push(j * FEATURES + f); }
    return { reads, feeds };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the best held-out penalised value of the four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.W02, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "W02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead37.champion: group W02 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 12 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's 1800-iteration networks of the four seeds in seed order] }; `fresh` = { nets: [the four larger 1800-iteration networks in seed order] }. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk963(wip)) throw new Error(`headToHead37.armsOf: wip must be ${X27.WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead37.armsOf: h27 is { laws: one 4-weight law }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk963)) throw new Error("headToHead37.armsOf: s32 is { nets: four 963-weight vectors }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error(`headToHead37.armsOf: fresh is { nets: four ${WEIGHT_COUNT}-weight vectors }`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); W_IDS.forEach((id, i) => { out[id] = wideArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 12; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, earlier = null, startVal = null, startValWide = null, startVal32 = null, preserve = null, flyStart = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead37.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, h32, earlier, startVal, startValWide, startVal32, preserve, flyStart, proof32, fixture, c02: all.c02.entry().weights };
}
/** The flights of network-Wip (as H27's arm) and of the larger start (as the larger arm) on `range` ids, dark and lit: { range, seconds, wip: { dark, lit }, wide: { dark, lit } }. */
export function flyStartOf(wip, { range = { from: IDS.from, to: IDS.from + 4 }, seconds = SECONDS, flyFn = flyPen } = {}) {
    const a = netArm("wip", wip), b = wideArm("wide", wideStart(wip));
    return { range, seconds, wip: { dark: flyFn(a, range, seconds, "dropout"), lit: flyFn(a, range, seconds, null) }, wide: { dark: flyFn(b, range, seconds, "dropout"), lit: flyFn(b, range, seconds, null) } };
}
/** Wip's penalised value on the 72 train ids at 0.02 (the first parent of H32's searches), and the larger start's on the same ids. */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => X32.startVal(wip, { seconds, flyFn, train });
export const startValWide = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => netObj(wideStart(wip), train, PRICE, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
/** The arm id of the group champion at 1800 (the best held-out value of the four searches). */
export const champArm = (au) => "w02_" + champion(au.search, LAST).seed;
/** H32's champion's generalisation gap at 1800 (train minus held-out value of the champion of its stored search). */
export const gap32 = (au) => { const k = X32.champion(au.h32.search, 1800); return k.trainScore - k.heldScore; };
/** The twin counts: each w02_<seed> against s02_<seed> at 0.02: { ahead, behind, tied }. */
export function twinsOf(au) { let ahead = 0, behind = 0, tied = 0; for (const s of SEEDS.W02) { const r = pen(au, "w02_" + s, "s02_" + s).reading; if (r === "BETTER") ahead++; else if (r === "WORSE") behind++; else tied++; } return { ahead, behind, tied }; }
/** The registered verdict, seven parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const c = champArm(au), rd = (b) => word(pen(au, c, b).reading), lost = W_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), t = twinsOf(au);
    const k = champion(au.search, LAST), notBehind = W_IDS.filter((a) => pen(au, a, "c02").reading !== "WORSE").length;
    return [`THE LARGER CHAMPION ${rd("c02")} C02`, `THE LARGER CHAMPION ${rd("q02")} THE LAW OF THE PRICE`, `THE LARGER CHAMPION ${rd("s02_26011")} H32'S CHAMPION`, `TWINS: ${t.ahead} AHEAD, ${t.behind} BEHIND, ${t.tied} TIED`, `LOST SUBS IN THE W02 NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `THE CHAMPION'S GAP IS SMALLER THAN H32'S: ${k.trainScore - k.heldScore < gap32(au) ? "YES" : "NO"}`, `LARGER NETWORKS NOT BEHIND C02: ${notBehind} OF 4`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
/** For each larger network: the L1 distance of its weights from the larger start over the weights that feed or read a new neuron and over the old ones, and how many of the weights that READ a new neuron are nonzero (the new neurons opened). */
export function usage(au) {
    const { reads, feeds } = newParts(), start = wideStart(au.wip), isNew = new Set([...reads, ...feeds]);
    return W_IDS.map((id, i) => { const w = au.fresh.nets[i]; let nw = 0, od = 0, opened = 0; for (let k = 0; k < w.length; k++) { const d = Math.abs(w[k] - start[k]); if (isNew.has(k)) nw += d; else od += d; } for (const k of reads) if (w[k] !== 0) opened++; return { id, newL1: nw, oldL1: od, opened }; });
}
/** The generalisation gap (train minus held-out value) of the group champion at each checkpoint, of every seed at 1800, and H32's champion's at 1800: { champ: [900..1800], seeds: [26011..26014], h32 }. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore;
    return { champ: CHECKPOINTS.map((it) => g(champion(au.search, it))), seeds: SEEDS.W02.map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === "W02"), LAST))), h32: gap32(au) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...S_IDS, ...W_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "W02").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `W02 champion ${gp.champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800; each seed at 1800 ${SEEDS.W02.map((s, i) => `${s} ${gp.seeds[i].toFixed(4)}`).join(", ")} (H32's champion at 1800 ${gp.h32.toFixed(4)})`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairs = [...["c02", "q02", "s02_26011"].map((b) => `${c} minus ${b} at 0.02 ${fmt(pen(au, c, b))}`), ...W_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`), ...SEEDS.W02.map((s) => `w02_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "w02_" + s, "s02_" + s))}`)];
    const rank = [...S_IDS, ...W_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const use = usage(au).map((u) => `${u.id} new-neuron weights L1 ${u.newL1.toFixed(2)}, old weights L1 ${u.oldL1.toFixed(2)}, ${u.opened} of ${newParts().reads.length} new-neuron output weights nonzero`).join("; ");
    return [
        `TOPOLOGY (the larger circuit): ${HID} neurons (${OLD_COUNT} the fly's, ${NEW_COUNT} new), ${WIDE_BUILD.topo.EDGES.length} edges (${GFC.EDGES.length} the fly's, ${WIDE_BUILD.newEdges} new, density ${P_EDGE.toFixed(4)}), ${WEIGHT_COUNT} weights; draws of generator seed ${TOPO_SEED}; the start's forward pass differs from network-Wip's by at most ${au.preserve.maxDiff.toExponential(1)} on ${au.preserve.n} random inputs`,
        `SEARCH W02 (the first parent's start value on the 72 train ids, then train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.filter((r) => r.group === "W02").map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at 1800 is ${c} (the best on the audit: ${[...W_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]})`,
        `GENERALISATION GAP (train value minus held-out value): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: use of the new neurons ${use}; audit means in rank order (penalised priced score at 0.02) ${rank}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
/** The registered edge rule, written out again independently of buildWide: every ordered pair touching a new neuron, in order of target then source, below P_EDGE by one generator seeded 4243. */
const REG_NEW_EDGES = () => { const g = PS.mulberry(4243), out = []; for (let to = 0; to < 68; to++) for (let from = 0; from < 68; from++) { if (to === from || (to < 34 && from < 34)) continue; if (g() < 313 / 1122) out.push([to, from]); } return out; };
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
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.W02.every((q) => s.filter((r) => r.group === "W02" && r.seed === q).length === 1) && s.every((r) => r.group === "W02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && SEEDS.W02.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(cpOf(s.find((r) => r.seed === q), LAST).weights)) && wOk963(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF THE LARGER WEIGHTS", ok: !!counted, text: `4 network searches (the four seeds of W02), each with checkpoints at 900, 1200, 1500 and 1800 of ${WEIGHT_COUNT} finite weights, and the 4 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const E = WIDE_BUILD.topo.EDGES, reg = REG_NEW_EDGES(), keys = new Set(E.map(([t, f]) => t * 1000 + f));
    const topoOk = WIDE_BUILD.topo.NEURON_ORDER.length === 68 && J(WIDE_BUILD.topo.NEURON_ORDER.slice(0, 34)) === J(GFC.NEURON_ORDER) && J(E.slice(0, 313)) === J(GFC.EDGES) && keys.size === E.length && E.every(([t, f]) => t !== f && t >= 0 && t < 68 && f >= 0 && f < 68) && E.slice(313).every(([t, f]) => t >= 34 || f >= 34) && J(E.slice(313)) === J(reg) && WIDE_BUILD.newEdges === reg.length && WEIGHT_COUNT === 14 * 68 + 68 + E.length + 68 * 4 + 4;
    rows.push({ name: "THE TOPOLOGY IS AS REGISTERED", ok: topoOk, text: `68 neurons (the fly's 34, then 34 new), the fly's 313 edges first, then ${WIDE_BUILD.newEdges} new edges, each pair touching a new neuron an edge below 313/1122 by the generator seeded 4243 (read again independently), no self-loop or repeat, ${WEIGHT_COUNT} weights: ${topoOk}` });
    const pp = au.preserve, pres = !!pp && pp.n === 50 && Number.isFinite(pp.maxDiff) && pp.maxDiff < 1e-9 && pp.readZero === true && pp.fed === pp.drawn && pp.drawn > 0 && pp.dimension === WEIGHT_COUNT;
    rows.push({ name: "THE START IS FUNCTION-PRESERVING", ok: pres, text: `the larger start's forward pass agrees with network-Wip's to 1e-9 on 50 random feature vectors, every weight that reads a new neuron is zero, and every weight that feeds one is the registered draw (${pp ? pp.drawn : 0} of them): ${pres}` });
    const fs0 = au.flyStart, same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === 5 && b.length === 5 && a.every((r, i) => ["key", "score", "bad", "watts", "thrust"].every((k) => r[k] === b[i][k]));
    const fl = !!fs0 && !!fs0.wip && !!fs0.wide && fs0.seconds === 160 && !!fs0.range && fs0.range.to - fs0.range.from === 4 && same(fs0.wip.dark, fs0.wide.dark) && same(fs0.wip.lit, fs0.wide.lit);
    rows.push({ name: "THE START FLIES AS NETWORK-WIP", ok: fl, text: `the larger start flown through the tank (registered with registerPilotKind) scores exactly as network-Wip does, dark and lit, in key, score, lost flag, power and thrust, on 5 ids at 160 s: ${fl}` });
    const first = !!counted && Number.isFinite(au.startVal) && Number.isFinite(au.startValWide) && Number.isFinite(au.startVal32) && au.startVal === au.startValWide && au.startVal === au.startVal32 && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST PARENT IS WIP ON THE 72 IDS", ok: first, text: `every search's first parent has exactly wip's penalised value on the 72 train ids at 0.02, as the larger start flown in this round does, and as H32's stored value does, to the last digit: ${first}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => r.checkpoints.every((k) => k.iter !== LAST || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT PENALISED OF THE FOUR AT 1800", ok: !!(counted && bestAt), text: `the group champion at 1800 has the largest held-out penalised value of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const h = au.h32, sn = au.s32, nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && J(Array.from(sn.nets[0])) === J(Array.from(X32.champion(h.search, 1800).weights)) && X32.champion(h.search, 1800).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE FOUR S02 ARMS ARE H32'S 1800-ITERATION NETWORKS, S02_26011 ITS CHAMPION", ok: !!nets32, text: `s02_26011 to s02_26014 are the weights at 1800 of the four searches of H32's stored result, and s02_26011 is H32's champion by H32's rule: ${!!nets32}` });
    const o = au.original, k = au.h27, regc = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk963(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint and q02 is the champion law of H27's stored search: ${!!regc}` });
    const seedsOk = J(SEEDS.W02) === J(X32.SEEDS.S02) && Array.isArray(au.earlier) && SEEDS.W02.every((q) => au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.W02.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48;
    const dj = trainOk && [...TRAIN, HELD].every((a) => disjoint(a, au.range)) && au.range.from > 37399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the 72 train ids (26000-26023 and 30000-30047) or the held-out ids 26100-26139, and start after H36's audit (37399): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H37: a larger network (the fly circuit's 34 hidden neurons plus 34 new, starting exactly as network-Wip) searched as H32's was (group W02, seeds 26011-26014, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
