// WebGLEngine/tools/ship/headToHead41.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead41Cmd.mjs; the gate is tools/ship/headToHead41-selfcheck.mjs)
//
// ROUND H41 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT TRAIN SET SIZE. H32's search (the 963 weights of network-Wip, the (1+1)-ES, PS.mutate of 1 to 4 weights sigma 0.3, H28's flyPen, 160 s, price 0.02, 1800 iterations, checkpoints 900 / 1200 / 1500 / 1800, resumable, H32's seeds)
// with ONLY the train set changed: group D24 trains on ids 26000-26023 (24), group D144 on H32's 72 ids plus 50000-50071 (144). H32's loop is written out here because its train set is fixed (the generator stream, the state and the checkpoints are its). A champion per group per checkpoint by held-out value; the eight 1800-iteration networks
// are audited each by itself on 200 fresh ids at 0.02 against c02, q02 (H27's law of that price) and H32's four 72-id networks. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 42200, to: 42399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK;
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION;
export const NEW_TRAIN = Object.freeze({ from: 50000, to: 50071 });
export const TRAIN_OF = Object.freeze({ D24: Object.freeze([Object.freeze({ from: 26000, to: 26023 })]), D144: Object.freeze([...X32.TRAIN, NEW_TRAIN]) });
export const SIZES = Object.freeze({ D24: 24, D144: 144 });
export const GROUPS = Object.freeze(["D24", "D144"]), SEEDS = Object.freeze({ D24: [26011, 26012, 26013, 26014], D144: [26011, 26012, 26013, 26014] });
export const S_IDS = Object.freeze(X32.SEEDS.S02.map((s) => "s02_" + s)), D24_IDS = Object.freeze(SEEDS.D24.map((s) => "d24_" + s)), D144_IDS = Object.freeze(SEEDS.D144.map((s) => "d144_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...D24_IDS, ...D144_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
/** The flights of one full search over a train set of `size` ids: (iterations + 1) evaluations of 2 x size flights and four held-out evaluations of 2 x 40 flights (H32's 72-id searches did not count theirs; this is the same loop). */
export const flightsOf = (size) => (ITERS + 1) * 2 * size + CHECKPOINTS.length * 2 * (HELD.to - HELD.from + 1);
const idCount = (rs) => rs.reduce((n, r) => n + r.to - r.from + 1, 0);
/** Reads and validates a state file of a D24 / D144 search (null when there is none): H32's validation, and the state must carry the group's train size. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead41.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    if (!GROUPS.includes(s && s.group)) throw new Error(`headToHead41.loadState: the state's group must be one of ${GROUPS.join(", ")}, got ${J(s && s.group)}`);
    X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: s.group });
    if (s.trainSize !== SIZES[s.group]) throw new Error(`headToHead41.loadState: the state's train size is ${J(s.trainSize)}, not ${SIZES[s.group]}`);
    if (!isInt(s.flights, 0, 1e12)) throw new Error(`headToHead41.loadState: the state's flight count is ${J(s.flights)}`);
    return s;
}
/**
 * One RESUMABLE network search of group D24 or D144 from `start`: H32's loop and generator stream exactly with the train set of the group (`opts.train` overrides it: the gate hands in H32's 72 to compare with H32's) at price 0.02. `save(state)` after every `stateEvery` iterations and every checkpoint (each state carries the train size and the flight count);
 * `state` resumes; `onIteration(n)` after iteration n. Returns { seed, group, price, trainSize, flights, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = null, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead41: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead41.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead41.longSearch: stateEvery must be a positive integer");
    const set = train || TRAIN_OF[group], size = idCount(set);
    if (state && state.trainSize !== size) throw new Error(`headToHead41.longSearch: the state's train size is ${J(state.trainSize)}, not ${size}`);
    const c = { lost: 0, flights: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); c.flights += out.length; if (out.some((r) => r.bad)) c.lost++; return out; }, obj = (w, r) => X30.netObj(w, r, PRICE, seconds, f);
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { X32.validateState(state, { seed, group, iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; c.flights = state.flights; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = obj(w, set); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = obj(cand, set);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(w), trainScore: best, heldScore: obj(w, [held]), accepted }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })), trainSize: size, flights: c.flights });
        if (onIteration) onIteration(n);
    }
    return { seed, group, price: PRICE, trainSize: size, flights: c.flights, startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of a group at a checkpoint: the best held-out penalised value of its four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, group, iter) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) && seeds ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || !CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead41.champion: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 16 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's four 1800-iteration networks in seed order] }; `fresh` = { D24: [four networks], D144: [four networks] }. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead41.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead41.armsOf: h27 is { laws: one 4-weight law }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk)) throw new Error("headToHead41.armsOf: s32 is { nets: four 963-weight vectors }");
    for (const g of GROUPS) if (!fresh || !Array.isArray(fresh[g]) || fresh[g].length !== 4 || !fresh[g].every(wOk)) throw new Error(`headToHead41.armsOf: fresh.${g} is four 963-weight vectors`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); D24_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.D24[i]); }); D144_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.D144[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 16; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, earlier = null, startVal = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead41.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, h32, earlier, startVal, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value at 0.02 on a group's train set (the first parent of every search of the group): `startVal(wip, { group })` or with `train` ranges. */
export const startVal = (wip, { group = "D24", train = null, seconds = SECONDS, flyFn = flyPen } = {}) => X30.netObj(wip, train || TRAIN_OF[group], PRICE, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b, p = PRICE) => penPair(au, a, b, p);
/** An arm's mean penalised priced score at a price (default 0.02) over the audit ids. */
export const penMean = (au, a, p = PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
/** An arm's mean power in kW: the mean of its dark and lit mean powers. */
export const meanPower = (au, a) => (avg(au.dark[a].map((r) => r.watts)) + avg(au.lit[a].map((r) => r.watts))) / 2000;
/** The arm id of a group's champion at 1800. */
export const champArm = (au, g) => (g === "D24" ? "d24_" : "d144_") + champion(au.search, g, LAST).seed;
/** The twin counts of a group: each <d24|d144>_<seed> against s02_<seed> at 0.02: { ahead, behind, tied }. */
export function twinsOf(au, g) { const pre = g === "D24" ? "d24_" : "d144_"; let ahead = 0, behind = 0, tied = 0; for (const s of SEEDS[g]) { const r = pen(au, pre + s, "s02_" + s).reading; if (r === "BETTER") ahead++; else if (r === "WORSE") behind++; else tied++; } return { ahead, behind, tied }; }
/** The mean over a group's seeds of the 1800-iteration train value minus the held-out value, and H32's (its stored rows): { D24, D144, H72 }. */
export function gapMeans(au) {
    const gap = (rows) => avg(rows.map((r) => { const k = cpOf(r, LAST); return k.trainScore - k.heldScore; }));
    return { D24: gap(au.search.filter((r) => r.group === "D24")), D144: gap(au.search.filter((r) => r.group === "D144")), H72: gap(au.h32.search.filter((r) => r.group === "S02")) };
}
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const a = champArm(au, "D24"), b = champArm(au, "D144"), rd = (x, y) => word(pen(au, x, y).reading), lost = [...D24_IDS, ...D144_IDS].filter((x) => lostBoth(au, x) > 0).map((x) => `${x} ${lostBoth(au, x)}`);
    const nb = (ids) => ids.filter((x) => pen(au, x, "c02").reading !== "WORSE").length, g = gapMeans(au), counts = (G) => au.search.filter((r) => r.group === G).map((r) => r.flights);
    const fl = (G) => Math.round(avg(counts(G))), h72 = flightsOf(72);
    return [`THE 24-ID CHAMPION ${rd(a, "c02")} C02`, `THE 144-ID CHAMPION ${rd(b, "c02")} C02`, `THE 144-ID CHAMPION ${rd(b, a)} THE 24-ID CHAMPION`,
        `THE LARGER-SET CHAMPION ${rd(b, "s02_26011")} H32'S CHAMPION / THE SMALLER-SET CHAMPION ${rd(a, "s02_26011")} H32'S CHAMPION`,
        `GAP ORDER 24 > 72 > 144: ${g.D24 > g.H72 && g.H72 > g.D144 ? "YES" : "NO"}`, `LOST SUBS IN THE SIZE NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `NETWORKS NOT BEHIND C02: ${nb(D24_IDS)} OF 4 (24), ${nb(D144_IDS)} OF 4 (144)`, `FLIGHTS PER SEARCH 24 : 72 : 144 = ${fl("D24")} : ${h72} : ${fl("D144")}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from wip and from its 72-id twin. */
export const distances = (au) => [...D24_IDS.map((id, i) => ({ id, w: au.fresh.D24[i], t: au.s32.nets[i] })), ...D144_IDS.map((id, i) => ({ id, w: au.fresh.D144[i], t: au.s32.nets[i] }))].map((x) => ({ id: x.id, l1Wip: l1(x.w, au.wip), l1Twin: l1(x.w, x.t) }));
/** The generalisation gap of each group's champion at each checkpoint, of every seed at 1800, and the group means with H32's. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore, one = (G) => ({ champ: CHECKPOINTS.map((it) => g(champion(au.search, G, it))), seeds: SEEDS[G].map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === G), LAST))) });
    return { D24: one("D24"), D144: one("D144"), means: gapMeans(au) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...S_IDS, ...D24_IDS, ...D144_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, ca = champArm(au, "D24"), cb = champArm(au, "D144");
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const srch = (G) => au.search.filter((r) => r.group === G).map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights, ${r.flights} flights)`).join(", ");
    const champs = (G) => `${G} ${CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, G, it).seed} held ${champion(au.search, G, it).heldScore.toFixed(4)}`).join(", ")}`;
    const gp = gapsOf(au), gs = (G) => `${G} champion ${gp[G].champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800, each seed at 1800 ${SEEDS[G].map((s, i) => `${s} ${gp[G].seeds[i].toFixed(4)}`).join(", ")}`;
    const gaps = `${gs("D24")}; ${gs("D144")}; mean over seeds at 1800: 24 ids ${gp.means.D24.toFixed(4)}, 72 ids (H32) ${gp.means.H72.toFixed(4)}, 144 ids ${gp.means.D144.toFixed(4)}`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairs = [...[ca, cb].flatMap((c) => ["c02", "q02", "s02_26011"].map((b) => `${c} minus ${b} at 0.02 ${fmt(pen(au, c, b))}`)), `${cb} minus ${ca} at 0.02 ${fmt(pen(au, cb, ca))}`, ...SEEDS.D24.map((s) => `d24_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "d24_" + s, "s02_" + s))}`), ...SEEDS.D144.map((s) => `d144_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "d144_" + s, "s02_" + s))}`)];
    const rank = [...S_IDS, ...D24_IDS, ...D144_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Twin.toFixed(2)} from its 72-id twin`).join("; ");
    const power = ARM_IDS.slice(1).map((a) => `${a} ${meanPower(au, a).toFixed(2)}`).join(", ");
    return [
        `SEARCH D24 (24 train ids; start value, then train / held-out penalised value (at 0.02) and accepted count at each checkpoint): ${srch("D24")}`,
        `SEARCH D144 (144 train ids): ${srch("D144")}`,
        `RESUMES: ${au.search.map((r) => `${r.group} ${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs("D24")}; ${champs("D144")}; the champions at 1800 are ${ca} and ${cb}`,
        `GENERALISATION GAP (train value minus held-out value): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `POWER (mean of the dark and lit mean powers, kW): ${power}`,
        `EXTRA POWER (mean of dark and lit extra kW over the autopilot): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED AT 0.02 (penalised priced score): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; audit means at 0.02 in rank order ${rank}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
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
    const counted = Array.isArray(s) && s.length === 8 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && GROUPS.every((g) => Array.isArray(au.fresh[g]) && au.fresh[g].length === 4 && au.fresh[g].every(wOk) && SEEDS[g].every((q, i) => J(Array.from(au.fresh[g][i])) === J(cpOf(s.find((r) => r.group === g && r.seed === q), LAST).weights))) && wOk(au.wip);
    rows.push({ name: "8 SEARCHES, EACH SEED OF EACH GROUP ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `8 network searches (the four seeds of D24 and of D144), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 8 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const ids = (r) => r.to - r.from + 1, d24 = TRAIN_OF.D24, d144 = TRAIN_OF.D144;
    const setsOk = d24.length === 1 && d24[0].from === 26000 && d24[0].to === 26023 && ids(d24[0]) === 24 && J(d144.slice(0, 2)) === J(X32.TRAIN) && d144.length === 3 && d144[2].from === 50000 && d144[2].to === 50071 && idCount(d144) === 144 && Array.isArray(s) && s.every((r) => r.trainSize === SIZES[r.group] && r.price === 0.02);
    rows.push({ name: "THE TRAIN SETS ARE AS REGISTERED", ok: !!setsOk, text: `D24 trains on ids 26000-26023 (24), D144 on H32's 72 (26000-26023 and 30000-30047) plus 50000-50071 (144 ids), and every search record carries its group's train size and the price 0.02: ${!!setsOk}` });
    const sv = au.startVal, first = !!counted && !!sv && Number.isFinite(sv.D24) && Number.isFinite(sv.D144) && s.every((r) => r.startTrain === sv[r.group]);
    rows.push({ name: "THE FIRST PARENT IS WIP ON EACH GROUP'S TRAIN IDS", ok: first, text: `every search's first parent has exactly wip's penalised value at 0.02 on its group's train ids (24 or 144, computed in this round): ${first}` });
    const bestAt = (() => { try { return GROUPS.every((g) => { const c = champion(s, g, LAST); return s.filter((r) => r.group === g).every((r) => c.heldScore >= cpOf(r, LAST).heldScore) && J(c.weights) === J(cpOf(s.find((r) => r.group === g && r.seed === c.seed), LAST).weights); }); } catch (e) { return false; } })();
    rows.push({ name: "EACH GROUP'S CHAMPION IS THE BEST HELD-OUT PENALISED OF ITS FOUR AT 1800", ok: !!(counted && bestAt), text: `each group's champion at 1800 has the largest held-out penalised value (at 0.02) of its four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const h = au.h32, sn = au.s32, nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && X32.champion(h.search, 1800).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE FOUR S02 ARMS ARE H32'S 1800-ITERATION NETWORKS, S02_26011 ITS CHAMPION", ok: !!nets32, text: `s02_26011 to s02_26014 are the weights at 1800 of the four searches of H32's stored result, and s02_26011 is H32's champion by H32's rule: ${!!nets32}` });
    const o = au.original, k = au.h27, regc = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!regc}` });
    const seedsOk = Array.isArray(au.earlier) && X32.SEEDS.S02.every((q) => au.earlier.includes(q)) && J(SEEDS.D24) === J(X32.SEEDS.S02) && J(SEEDS.D144) === J(X32.SEEDS.S02) && Array.isArray(s) && s.every((r) => X32.SEEDS.S02.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds of each group are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const dj = [...d144, HELD].every((q) => disjoint(q, au.range)) && au.range.from > 41399 && disjoint(NEW_TRAIN, HELD);
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap any train id (26000-26023, 30000-30047 and 50000-50071) or the held-out ids 26100-26139, and start after H40's audit (41399): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H41: a different train set size (H32's search on 24 ids and on 144 ids instead of 72: seeds 26011-26014, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800, price 0.02). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
