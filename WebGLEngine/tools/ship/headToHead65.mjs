// WebGLEngine/tools/ship/headToHead65.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead65Cmd.mjs; the gate is tools/ship/headToHead65-selfcheck.mjs)
//
// ROUND H65 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT SEED SET AT 144 IDS -- DOES H41'S TIE REPLICATE? H41's search at 144 ids (H32's loop on the 963 weights of network-Wip: the (1+1)-ES, PS.mutate of 1 to 4 weights sigma 0.3, H28's flyPen, 160 s, price 0.02, 1800 iterations, checkpoints 900 / 1200 / 1500 / 1800, resumable)
// on H41's 144 train ids (H32's 72 plus 50000-50071) with FOUR NEW SEEDS 26071-26074 (group R144). H32's loop is written out here because its train set is fixed (the generator stream, the state and the checkpoints are its). The group's champion per checkpoint by held-out value; the four 1800-iteration networks are audited each by itself
// on 200 fresh ids at 0.02 against c02, q02 (H27's law of that price), H32's four 72-id networks and H41's four 144-id networks (read from H41's stored search). Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";
import * as X41 from "./headToHead41.mjs";

export const IDS = Object.freeze({ from: 85200, to: 85399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK;
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION;
export const TRAIN_OF = Object.freeze({ R144: X41.TRAIN_OF.D144 });
export const SIZES = Object.freeze({ R144: 144 });
export const GROUPS = Object.freeze(["R144"]), SEEDS = Object.freeze({ R144: [26071, 26072, 26073, 26074] });
export const S_IDS = Object.freeze(X32.SEEDS.S02.map((s) => "s02_" + s)), D144_IDS = Object.freeze(X41.SEEDS.D144.map((s) => "d144_" + s)), R144_IDS = Object.freeze(SEEDS.R144.map((s) => "r144_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...D144_IDS, ...R144_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
/** The flights of one full search over a train set of `size` ids: (iterations + 1) evaluations of 2 x size flights and four held-out evaluations of 2 x 40 flights (H32's 72-id searches did not count theirs; this is the same loop). */
export const flightsOf = (size) => (ITERS + 1) * 2 * size + CHECKPOINTS.length * 2 * (HELD.to - HELD.from + 1);
const idCount = (rs) => rs.reduce((n, r) => n + r.to - r.from + 1, 0);
/** Reads and validates a state file of a R144 search (null when there is none): H32's validation, and the state must carry the group's train size. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead65.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    if (!GROUPS.includes(s && s.group)) throw new Error(`headToHead65.loadState: the state's group must be one of ${GROUPS.join(", ")}, got ${J(s && s.group)}`);
    X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: s.group });
    if (s.trainSize !== SIZES[s.group]) throw new Error(`headToHead65.loadState: the state's train size is ${J(s.trainSize)}, not ${SIZES[s.group]}`);
    if (!isInt(s.flights, 0, 1e12)) throw new Error(`headToHead65.loadState: the state's flight count is ${J(s.flights)}`);
    return s;
}
/**
 * One RESUMABLE network search of group R144 from `start`: H32's loop and generator stream exactly with the train set of the group (`opts.train` overrides it: the gate hands in H32's 72 and H41's 144 to compare with theirs) at price 0.02. `save(state)` after every `stateEvery` iterations and every checkpoint (each state carries the train size and the flight count);
 * `state` resumes; `onIteration(n)` after iteration n. Returns { seed, group, price, trainSize, flights, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = null, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead65: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead65.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead65.longSearch: stateEvery must be a positive integer");
    const set = train || TRAIN_OF[group], size = idCount(set);
    if (state && state.trainSize !== size) throw new Error(`headToHead65.longSearch: the state's train size is ${J(state.trainSize)}, not ${size}`);
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
    if (!seeds || !CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead65.champion: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 16 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's four 1800-iteration networks in seed order] }; `s41` = { nets: [H41's four 144-id 1800-iteration networks in seed order] }; `fresh` = { R144: [four networks] }. */
export function armsOf(wip, h27, s32, s41, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead65.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead65.armsOf: h27 is { laws: one 4-weight law }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk)) throw new Error("headToHead65.armsOf: s32 is { nets: four 963-weight vectors }");
    if (!s41 || !Array.isArray(s41.nets) || s41.nets.length !== 4 || !s41.nets.every(wOk)) throw new Error("headToHead65.armsOf: s41 is { nets: four 963-weight vectors }");
    for (const g of GROUPS) if (!fresh || !Array.isArray(fresh[g]) || fresh[g].length !== 4 || !fresh[g].every(wOk)) throw new Error(`headToHead65.armsOf: fresh.${g} is four 963-weight vectors`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); D144_IDS.forEach((id, i) => { out[id] = netArm(id, s41.nets[i]); }); R144_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.R144[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 16; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, s41, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, h41 = null, earlier = null, startVal = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, s41, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead65.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, s41, fresh, search, original, h32, h41, earlier, startVal, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value at 0.02 on the group's train set (the first parent of every search): `startVal(wip)` or with `train` ranges. */
export const startVal = (wip, { train = null, seconds = SECONDS, flyFn = flyPen } = {}) => X30.netObj(wip, train || TRAIN_OF.R144, PRICE, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b, p = PRICE) => penPair(au, a, b, p);
/** An arm's mean penalised priced score at a price (default 0.02) over the audit ids. */
export const penMean = (au, a, p = PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
/** An arm's mean power in kW: the mean of its dark and lit mean powers. */
export const meanPower = (au, a) => (avg(au.dark[a].map((r) => r.watts)) + avg(au.lit[a].map((r) => r.watts))) / 2000;
/** The arm id of the new group's champion at 1800, and of H41's 144-id champion (H41's rule on H41's stored search). */
export const champArm = (au) => "r144_" + champion(au.search, "R144", LAST).seed;
export const champ41 = (au) => "d144_" + X41.champion(au.h41.search, "D144", LAST).seed;
const sv = (xs) => { const m = avg(xs); return xs.reduce((p, q) => p + (q - m) * (q - m), 0) / (xs.length - 1); };
/**
 * The group comparisons of the audit means at 0.02 (each the mean over a group's four networks, `penMean`): { newM, h41M, s02M, d41, se41, w41, d72, se72, w72 } with d41 = new minus H41's four, d72 = new minus H32's four;
 * se = sqrt(var_a / 4 + var_b / 4) from the sample variances over the four networks of each group; within = |difference| <= 2 se.
 */
export function groupsOf(au) {
    const m = (ids) => ids.map((a) => penMean(au, a)), n = m(R144_IDS), h = m(D144_IDS), o = m(S_IDS), se = (a, b) => Math.sqrt(sv(a) / 4 + sv(b) / 4);
    const d41 = avg(n) - avg(h), d72 = avg(n) - avg(o), s41 = se(n, h), s72 = se(n, o);
    return { n, h, o, d41, se41: s41, w41: Math.abs(d41) <= 2 * s41, d72, se72: s72, w72: Math.abs(d72) <= 2 * s72 };
}
/** The champion's generalisation gap (train value on the 144 ids minus held-out value at 1800) and H32's champion's (its stored search, on its 72 ids): { mine, h32 }. */
export function gapOf(au) {
    const c = champion(au.search, "R144", LAST), k = X32.champion(au.h32.search, LAST);
    return { mine: c.trainScore - c.heldScore, h32: k.trainScore - k.heldScore };
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const a = champArm(au), c41 = champ41(au), rd = (x, y) => word(pen(au, x, y).reading), lost = R144_IDS.filter((x) => lostBoth(au, x) > 0).map((x) => `${x} ${lostBoth(au, x)}`);
    const nb = (ids) => ids.filter((x) => pen(au, x, "c02").reading !== "WORSE").length, g = groupsOf(au), gp = gapOf(au);
    return [`THE NEW CHAMPION ${rd(a, "c02")} C02`, `THE NEW CHAMPION ${rd(a, c41)} H41'S 144-ID CHAMPION`, `THE NEW CHAMPION ${rd(a, "s02_26011")} H32'S CHAMPION`,
        `NOT BEHIND C02: NEW ${nb(R144_IDS)} OF 4, H41 ${nb(D144_IDS)} OF 4, 72-ID ${nb(S_IDS)} OF 4`, `LOST SUBS IN THE NEW NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `NEW MINUS H41 MEAN AUDIT VALUE: ${f4(g.d41)} (se ${g.se41.toFixed(4)}); WITHIN 2 SE OF ZERO: ${g.w41 ? "YES" : "NO"}`, `NEW MINUS 72-ID MEAN AUDIT VALUE: ${f4(g.d72)} (se ${g.se72.toFixed(4)}); WITHIN 2 SE OF ZERO: ${g.w72 ? "YES" : "NO"}`,
        `THE CHAMPION'S GAP IS SMALLER THAN H32'S: ${gp.mine < gp.h32 ? "YES" : "NO"}`].join("; ");
}
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from wip and from H41's 144-id network of the same position (the twin by seed index). */
export const distances = (au) => R144_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.R144[i], au.wip), l1Twin: l1(au.fresh.R144[i], au.s41.nets[i]) }));
/** The generalisation gap of the champion at each checkpoint, of every seed at 1800, and H32's champion's. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore;
    return { champ: CHECKPOINTS.map((it) => g(champion(au.search, "R144", it))), seeds: SEEDS.R144.map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === "R144"), LAST))), h32: gapOf(au).h32 };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...S_IDS, ...D144_IDS, ...R144_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, ca = champArm(au), cb = champ41(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const srch = au.search.map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights, ${r.flights} flights)`).join(", ");
    const champs = `R144 ${CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, "R144", it).seed} held ${champion(au.search, "R144", it).heldScore.toFixed(4)}`).join(", ")}`;
    const gp = gapsOf(au), gaps = `R144 champion ${gp.champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800, each seed at 1800 ${SEEDS.R144.map((s, i) => `${s} ${gp.seeds[i].toFixed(4)}`).join(", ")}; H32's champion at 1800 ${gp.h32.toFixed(4)} (on its 72 train ids; the new gaps are on the 144 ids)`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairs = [...["c02", "q02", "s02_26011", cb].map((b) => `${ca} minus ${b} at 0.02 ${fmt(pen(au, ca, b))}`), ...SEEDS.R144.map((s, i) => `r144_${s} minus d144_${X41.SEEDS.D144[i]} at 0.02 ${fmt(pen(au, "r144_" + s, "d144_" + X41.SEEDS.D144[i]))}`)];
    const rank = [...S_IDS, ...D144_IDS, ...R144_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const g = groupsOf(au), grp = `NEW mean ${avg(g.n).toFixed(4)} sd ${Math.sqrt(sv(g.n)).toFixed(4)}; H41 mean ${avg(g.h).toFixed(4)} sd ${Math.sqrt(sv(g.h)).toFixed(4)}; 72-ID mean ${avg(g.o).toFixed(4)} sd ${Math.sqrt(sv(g.o)).toFixed(4)}`;
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Twin.toFixed(2)} from H41's network of the same index`).join("; ");
    const power = ARM_IDS.slice(1).map((a) => `${a} ${meanPower(au, a).toFixed(2)}`).join(", ");
    return [
        `SEARCH R144 (144 train ids, the new seeds; start value, then train / held-out penalised value (at 0.02) and accepted count at each checkpoint): ${srch}`,
        `RESUMES: ${au.search.map((r) => `${r.group} ${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at 1800 is ${ca}; H41's 144-id champion is ${cb}`,
        `GENERALISATION GAP (train value minus held-out value): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `POWER (mean of the dark and lit mean powers, kW): ${power}`,
        `EXTRA POWER (mean of dark and lit extra kW over the autopilot): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED AT 0.02 (penalised priced score): ${pairs.join("; ")}`,
        `GROUPS (audit means at 0.02 of the four networks of each group): ${grp}`,
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
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.R144.every((q) => s.filter((r) => r.group === "R144" && r.seed === q).length === 1) && s.every((r) => Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.R144) && au.fresh.R144.length === 4 && SEEDS.R144.every((q, i) => J(Array.from(au.fresh.R144[i])) === J(cpOf(s.find((r) => r.group === "R144" && r.seed === q), LAST).weights)) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 network searches (the four seeds of R144), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 4 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const t144 = TRAIN_OF.R144, setsOk = J(t144) === J(X41.TRAIN_OF.D144) && J(t144.slice(0, 2)) === J(X32.TRAIN) && t144.length === 3 && t144[2].from === 50000 && t144[2].to === 50071 && idCount(t144) === 144 && Array.isArray(s) && s.every((r) => r.trainSize === 144 && r.price === 0.02);
    rows.push({ name: "THE TRAIN SET IS H41'S", ok: !!setsOk, text: `R144 trains on H41's 144 ids (H32's 72: 26000-26023 and 30000-30047, plus 50000-50071), and every search record carries train size 144 and the price 0.02: ${!!setsOk}` });
    const sv0 = au.startVal, h4s = au.h41 && Array.isArray(au.h41.search) ? au.h41.search.filter((r) => r.group === "D144") : [], first = !!counted && !!sv0 && Number.isFinite(sv0.R144) && s.every((r) => r.startTrain === sv0.R144) && h4s.length === 4 && h4s.every((r) => r.startTrain === sv0.R144);
    rows.push({ name: "THE FIRST PARENT IS WIP ON THE 144 TRAIN IDS, AS IN H41", ok: first, text: `every search's first parent has exactly wip's penalised value at 0.02 on the 144 train ids, computed in this round, and equal to the start value of each of H41's four 144-id searches: ${first}` });
    const bestAt = (() => { try { const c = champion(s, "R144", LAST); return s.every((r) => c.heldScore >= cpOf(r, LAST).heldScore) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT PENALISED OF THE FOUR AT 1800", ok: !!(counted && bestAt), text: `the group's champion at 1800 has the largest held-out penalised value (at 0.02) of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const h = au.h32, sn = au.s32, nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && X32.champion(h.search, 1800).seed === 26011; } catch (e) { return false; } })();
    const h4 = au.h41, s4 = au.s41, nets41 = !!h4 && Array.isArray(h4.search) && !!s4 && Array.isArray(s4.nets) && s4.nets.length === 4 && (() => { try { return X41.SEEDS.D144.every((q, i) => J(Array.from(s4.nets[i])) === J(cpOf(h4.search.find((r) => r.group === "D144" && r.seed === q), 1800).weights)) && X41.champion(h4.search, "D144", 1800).seed === 26013; } catch (e) { return false; } })();
    rows.push({ name: "THE S02 ARMS ARE H32'S 1800-ITERATION NETWORKS AND THE D144 ARMS H41'S", ok: !!(nets32 && nets41), text: `s02_26011 to s02_26014 are the weights at 1800 of H32's stored search (s02_26011 its champion by H32's rule) and d144_26011 to d144_26014 those of H41's stored D144 search (d144_26013 its champion by H41's rule): ${!!(nets32 && nets41)}` });
    const o = au.original, k = au.h27, regc = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!regc}` });
    const seedsOk = J(SEEDS.R144) === "[26071,26072,26073,26074]" && Array.isArray(au.earlier) && SEEDS.R144.every((q) => !au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.R144.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE NEW: 26071-26074 AND NONE IN AN EARLIER ROUND'S STORED SEARCHES", ok: seedsOk, text: `the four seeds are 26071-26074 and none of them appears in the stored searches of any earlier round (${Array.isArray(au.earlier) ? au.earlier.length : 0} seeds read): ${seedsOk}` });
    const dj = [...TRAIN_OF.R144, HELD].every((q) => disjoint(q, au.range)) && au.range.from > 84399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap any train id (26000-26023, 30000-30047 and 50000-50071) or the held-out ids 26100-26139, and start after H64's audit (84399): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H65: a different seed set at 144 ids (H41's search on four new seeds 26071-26074: 144 train ids, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800, price 0.02). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.005 / 0.02 / 0.04:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${[0.005, 0.02, 0.04].map((p) => penGainAt(au, a, p)).map(f4).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
