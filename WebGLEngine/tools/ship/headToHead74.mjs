// WebGLEngine/tools/ship/headToHead74.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead74Cmd.mjs; the gate is tools/ship/headToHead74-selfcheck.mjs)
//
// ROUND H74 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT SEED SET -- FOUR NEW SEEDS (32001-32004) OF H32'S SEARCH AT 72 IDS. H32's search byte for byte (the 963 weights of network-Wip, the (1+1)-ES, PS.mutate of 1 to 4 weights sigma 0.3, H28's flyPen, price 0.02, 160 s, 1800 iterations,
// checkpoints at 900 / 1200 / 1500 / 1800, resumable, H32's 72 train ids, held-out ids 26100-26139) with only the seeds changed. Group N02. The champion per checkpoint by held-out value; the four 1800-iteration networks are audited each by itself on 200 fresh ids, read at 0.02 on the penalised priced score,
// against c02, q02 and H32's four stored networks s02_<seed>. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 94200, to: 94399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK;
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION;
export const GROUPS = Object.freeze(["N02"]), SEEDS = Object.freeze({ N02: [32001, 32002, 32003, 32004] }), TRAIN_SIZE = 72, EARLIER_AUDIT = 93399;
export const S_IDS = Object.freeze(X32.SEEDS.S02.map((s) => "s02_" + s)), N_IDS = Object.freeze(SEEDS.N02.map((s) => "n02_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...N_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const idCount = (rs) => rs.reduce((n, r) => n + r.to - r.from + 1, 0);
/** The flights of one full search over a train set of `size` ids: (iterations + 1) evaluations of 2 x size flights and four held-out evaluations of 2 x 40 flights (259664 at 72 ids). */
export const flightsOf = (size) => (ITERS + 1) * 2 * size + CHECKPOINTS.length * 2 * (HELD.to - HELD.from + 1);
/** Reads and validates a state file of an N02 search (null when there is none): H32's validation, and the state must carry the price 0.02 and the train size 72. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead74.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: "N02" });
    if (s.price !== PRICE) throw new Error(`headToHead74.loadState: the state's price is ${J(s.price)}, not ${PRICE}`);
    if (s.trainSize !== TRAIN_SIZE) throw new Error(`headToHead74.loadState: the state's train size is ${J(s.trainSize)}, not ${TRAIN_SIZE}`);
    return s;
}
/**
 * One RESUMABLE network search of the group N02 from `start`: H32's loop and generator stream exactly with the price and the train set handed in (`opts.price`, default 0.02; `opts.train`, default H32's 72 ids; the gate hands in 0.02 to compare with H32's). `save(state)` after every `stateEvery` iterations and every checkpoint (each state carries the price and the train size);
 * `state` resumes (it must carry the price and the train size used); `onIteration(n)` after iteration n. Returns { seed, group, price, trainSize, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { price = PRICE, iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead74: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead74.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead74.longSearch: stateEvery must be a positive integer");
    if (!(typeof price === "number" && price >= 0)) throw new Error(`headToHead74.longSearch: the price must be a number of 0 or more, got ${J(price)}`);
    const size = idCount(train);
    if (state && state.price !== price) throw new Error(`headToHead74.longSearch: the state's price is ${J(state.price)}, not ${price}`);
    if (state && state.trainSize !== size) throw new Error(`headToHead74.longSearch: the state's train size is ${J(state.trainSize)}, not ${size}`);
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
/** The champion of the group at a checkpoint: the best held-out penalised value (at 0.02) of its four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.N02, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "N02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead74.champion: group N02 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
const lawOk = (w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite);
/** The 12 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's four 1800-iteration networks in seed order] }; `fresh` = { nets: [the four new networks in seed order] }. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead74.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every(lawOk)) throw new Error("headToHead74.armsOf: h27 is { laws: [the 4-weight law of 0.02] }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk)) throw new Error("headToHead74.armsOf: s32 is { nets: four 963-weight vectors }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead74.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); N_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 12; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, earlier = null, startVal = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead74.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, h32, earlier, startVal, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value at the price on the 72 train ids (the first parent of every search). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN, price = PRICE } = {}) => X30.netObj(wip, train, price, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b, p = PRICE) => penPair(au, a, b, p);
/** An arm's mean penalised priced score at the price (default 0.02) over the audit ids. */
export const penMean = (au, a, p = PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
/** An arm's mean power in kW over the audit ids: the mean of its dark and lit mean powers. */
export const meanPower = (au, a) => (avg(au.dark[a].map((r) => r.watts)) + avg(au.lit[a].map((r) => r.watts))) / 2000;
/** The arm id of the new group's champion at 1800, and of H32's champion (H32's rule on H32's stored search). */
export const champArm = (au) => "n02_" + champion(au.search, LAST).seed;
export const champ32 = (au) => "s02_" + X32.champion(au.h32.search, LAST).seed;
/** The index twins: the k-th new network against the k-th H32 network at 0.02: { ahead, behind, tied }. */
export function twinsOf(au) { let ahead = 0, behind = 0, tied = 0; N_IDS.forEach((id, k) => { const r = pen(au, id, S_IDS[k]).reading; if (r === "BETTER") ahead++; else if (r === "WORSE") behind++; else tied++; }); return { ahead, behind, tied }; }
const sd = (xs) => { const m = avg(xs); return Math.sqrt(xs.reduce((p, q) => p + (q - m) ** 2, 0) / (xs.length - 1)); };
/** The group comparison: { diff, se, within } for the mean audit value of the new four minus H32's four (se = sqrt of the sum of the two groups' variances of four, each over four; within = |diff| < 2 se). */
export function groupDiff(au) {
    const a = N_IDS.map((id) => penMean(au, id)), b = S_IDS.map((id) => penMean(au, id)), se = Math.sqrt(sd(a) ** 2 / 4 + sd(b) ** 2 / 4), diff = avg(a) - avg(b);
    return { diff, se, within: Math.abs(diff) <= 2 * se };
}
/** The generalisation gap (train minus held-out value at 1800, on the 72 ids) of the new champion and of H32's champion (as stored). */
export function gapsNow(au) { const g = (c) => c.trainScore - c.heldScore; return { champ: g(champion(au.search, LAST)), h32: g(X32.champion(au.h32.search, LAST)) }; }
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const c = champArm(au), c32 = champ32(au), rd = (b) => word(pen(au, c, b).reading), lost = N_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), t = twinsOf(au);
    const nb = (ids) => ids.filter((a) => pen(au, a, "c02").reading !== "WORSE").length, d = groupDiff(au), g = gapsNow(au);
    const best = [...N_IDS, ...S_IDS].reduce((p, q) => (penMean(au, q) > penMean(au, p) ? q : p));
    return [`THE NEW CHAMPION ${rd("c02")} C02`, `THE NEW CHAMPION ${rd(c32)} H32'S CHAMPION`, `NOT BEHIND C02: NEW ${nb(N_IDS)} OF 4, H32 ${nb(S_IDS)} OF 4`, `LOST SUBS IN THE NEW NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `NEW MINUS H32 MEAN AUDIT VALUE: ${d.diff.toFixed(4)} (se ${d.se.toFixed(4)}); WITHIN 2 SE OF ZERO: ${d.within ? "YES" : "NO"}`, `INDEX TWINS: ${t.ahead} AHEAD, ${t.behind} BEHIND, ${t.tied} TIED`,
        `THE CHAMPION'S GAP IS SMALLER THAN H32'S: ${g.champ < g.h32 ? "YES" : "NO"}`, `ALL EIGHT: ${nb(N_IDS) + nb(S_IDS)} OF 8 NOT BEHIND C02; THE BEST ON THE AUDIT IS ${N_IDS.includes(best) ? "NEW" : "H32'S"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from wip and from its index twin (H32's network of the same index). */
export const distances = (au) => N_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1Twin: l1(au.fresh.nets[i], au.s32.nets[i]) }));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...S_IDS, ...N_IDS], priceRow = (a, f) => `${a} ${[0.02, 0.03, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au), c32 = champ32(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "N02").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsNow(au), seedGaps = SEEDS.N02.map((s) => { const k = cpOf(au.search.find((r) => r.seed === s && r.group === "N02"), LAST); return `${s} ${(k.trainScore - k.heldScore).toFixed(4)}`; }).join(", ");
    const gaps = `N02 champion ${gp.champ.toFixed(4)} at 1800, each seed at 1800 ${seedGaps} (H32's champion at 1800: ${gp.h32.toFixed(4)})`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairs = [...["c02", "q02", c32].map((b) => `${c} minus ${b} ${fmt(pen(au, c, b))}`), ...N_IDS.map((id, k) => `${id} minus ${S_IDS[k]} ${fmt(pen(au, id, S_IDS[k]))}`)];
    const grp = (ids) => { const v = ids.map((a) => penMean(au, a)); return `mean ${avg(v).toFixed(4)}, min ${Math.min(...v).toFixed(4)}, max ${Math.max(...v).toFixed(4)}`; };
    const rank = [...S_IDS, ...N_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Twin.toFixed(2)} from its index twin`).join("; ");
    const power = ARM_IDS.slice(1).map((a) => `${a} ${meanPower(au, a).toFixed(2)}`).join(", ");
    return [
        `SEARCH N02 (price 0.02, 72 train ids; start value, then train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at 1800 is ${c} (the best new network on the audit: ${[...N_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]}); H32's champion is ${c32}`,
        `GENERALISATION GAP (train value minus held-out value): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `POWER (mean of the dark and lit mean powers, kW): ${power}; the champion ${meanPower(au, c).toFixed(2)} against H32's champion ${meanPower(au, c32).toFixed(2)} (${f2(meanPower(au, c) - meanPower(au, c32))})`,
        `EXTRA POWER (mean of dark and lit extra kW over the autopilot): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.02 / 0.03 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED AT 0.02 (penalised priced score): ${pairs.join("; ")}`,
        `GROUPS (audit mean of the four networks of each group at 0.02): NEW ${grp(N_IDS)}; H32 ${grp(S_IDS)}`,
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
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.N02.every((q) => s.filter((r) => r.group === "N02" && r.seed === q).length === 1) && s.every((r) => r.group === "N02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && SEEDS.N02.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(cpOf(s.find((r) => r.group === "N02" && r.seed === q), LAST).weights)) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 network searches (the four seeds of N02), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 4 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const priceOk = PRICE === 0.02 && Array.isArray(s) && s.length === 4 && s.every((r) => r.price === 0.02) && J(TRAIN) === J(X32.TRAIN) && idCount(TRAIN) === 72 && s.every((r) => r.trainSize === 72);
    rows.push({ name: "THE PRICE IS 0.02 AND THE TRAIN SET H32'S 72 IDS", ok: !!priceOk, text: `the price of the loop and of every reading is 0.02, the train set is H32's 72 ids (26000-26023 and 30000-30047), and every search record carries both: ${!!priceOk}` });
    const h = au.h32, first = !!counted && Number.isFinite(au.startVal) && s.every((r) => r.startTrain === au.startVal) && !!h && Array.isArray(h.search) && h.search.every((r) => near(r.startTrain, au.startVal));
    rows.push({ name: "THE FIRST PARENT IS WIP ON THE 72 IDS, H32'S START VALUE", ok: !!first, text: `every search's first parent has exactly wip's penalised value at 0.02 on the 72 train ids (computed in this round) and H32's stored searches start at the same value: ${!!first}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => c.heldScore >= cpOf(r, LAST).heldScore) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT PENALISED OF THE FOUR AT 1800", ok: !!(counted && bestAt), text: `the group champion at 1800 has the largest held-out penalised value (at 0.02) of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const sn = au.s32;
    const stored32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), LAST).weights)) && J(Array.from(sn.nets[0])) === J(Array.from(X32.champion(h.search, LAST).weights)) && X32.champion(h.search, LAST).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE S02 ARMS ARE H32'S 1800-ITERATION NETWORKS", ok: !!stored32, text: `s02_26011 to s02_26014 are the weights at 1800 of H32's stored search (s02_26011 its champion by H32's rule): ${!!stored32}` });
    const o = au.original, k = au.h27, lawOkRow = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })();
    const regc = lawOkRow && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!regc}` });
    const seedsOk = J(SEEDS.N02) === "[32001,32002,32003,32004]" && Array.isArray(au.earlier) && SEEDS.N02.every((q) => !au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.N02.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE 32001-32004 AND NEW", ok: seedsOk, text: `the four seeds are 32001-32004 and none of them is in any earlier round's stored search: ${seedsOk}` });
    const dj = [...TRAIN, HELD].every((q) => disjoint(q, au.range)) && au.range.from > EARLIER_AUDIT;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap any train id (26000-26023 and 30000-30047) or the held-out ids 26100-26139, and start after H73's audit (${EARLIER_AUDIT}): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H74: a different seed set (H32's search at 72 ids with new seeds 32001-32004: 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.02 / 0.03 / 0.04:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${[0.02, 0.03, 0.04].map((p) => f4(penGainAt(au, a, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
