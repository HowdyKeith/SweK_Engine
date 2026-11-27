// WebGLEngine/tools/ship/headToHead47.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead47Cmd.mjs; the gate is tools/ship/headToHead47-selfcheck.mjs)
//
// ROUND H47 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT PRICE PAIR. H32's search (the 963 weights of network-Wip, the (1+1)-ES, PS.mutate of 1 to 4 weights sigma 0.3, H28's flyPen, 160 s, the 72 train ids, 1800 iterations, checkpoints 900 / 1200 / 1500 / 1800, resumable, H32's seeds)
// with ONLY the objective changed: the SMALLER OF TWO MARGINS, min(V(0.01) - L01, V(0.02) - L02), where V(p) = 0.5 (mean dark score' + mean lit score') - p x 0.5 (mean dark kW + mean lit kW) (X30.netObj's expression to the last operation) of ONE set of flights, and L01, L02 are the values of H27's two law champions (q01, q02) at their price on the SAME ids
// (constants of the id set, handed in). Group R12. The four 1800-iteration networks are audited each by itself on 200 fresh ids, read at 0.005, 0.02 and 0.04 against c02, q01, q02 and H32's four 0.02 networks. Reads and writes nothing itself (the command hands in the weights, the constants, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 47200, to: 47399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE_LO = 0.01, PRICE_HI = 0.02, H32_PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK;
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION;
export const GROUPS = Object.freeze(["R12"]), SEEDS = Object.freeze({ R12: [26011, 26012, 26013, 26014] });
export const S_IDS = Object.freeze(X32.SEEDS.S02.map((s) => "s02_" + s)), R_IDS = Object.freeze(SEEDS.R12.map((s) => "r12_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q01", "q02", ...S_IDS, ...R_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const lawOk = (w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const constOk = (c) => !!c && Number.isFinite(c.lo) && Number.isFinite(c.hi);
const constsOk = (c) => !!c && constOk(c.train) && constOk(c.held);
/** The flights' means of one arm on a list of id ranges: { S, Wd, Wl, P } with S = 0.5 (mean dark penalised score + mean lit penalised score), Wd and Wl the mean dark and lit watts and P = 0.5 (Wd + Wl) / 1000 kW (a lost run scoring 0, H27's penScore). */
export function spOf(arm, ranges, seconds = SECONDS, flyFn = flyPen) {
    if (!Array.isArray(ranges) || !ranges.length) throw new Error("headToHead47.spOf: the ranges must be a non-empty list");
    const d = [], l = []; for (const r of ranges) { d.push(...flyFn(arm, r, seconds, "dropout")); l.push(...flyFn(arm, r, seconds, null)); }
    const Wd = avg(d.map((r) => r.watts)), Wl = avg(l.map((r) => r.watts));
    return { S: 0.5 * (avg(d.map(X27.penScore)) + avg(l.map(X27.penScore))), Wd, Wl, P: 0.5 * (Wd + Wl) / 1000 };
}
/** The value at a price of the means: X30.netObj's expression with its operations in its order (score - price x 0.5 x (dark W + lit W) / 1000). */
export const valueAt = (sp, price) => sp.S - price * 0.5 * (sp.Wd + sp.Wl) / 1000;
/** The objective of a network `w` on `ranges` against the constants `c` = { lo, hi } of that id set: min(V(0.01) - lo, V(0.02) - hi). ONE set of flights. */
export function objective(w, ranges, c, seconds = SECONDS, flyFn = flyPen) {
    if (!constOk(c)) throw new Error("headToHead47.objective: the constants are { lo, hi } of finite numbers");
    const sp = spOf(netArm("net", w), ranges, seconds, flyFn); return Math.min(valueAt(sp, PRICE_LO) - c.lo, valueAt(sp, PRICE_HI) - c.hi);
}
/** The constants of the registered id sets: the values of q01 at 0.01 and q02 at 0.02 on the train ranges and on the held-out ids: { train: { lo, hi }, held: { lo, hi } }. `laws` = { q01, q02 } (four weights each). */
export function lawConstants(laws, { train = TRAIN, held = [HELD], seconds = SECONDS, flyFn = flyPen } = {}) {
    if (!laws || !lawOk(laws.q01) || !lawOk(laws.q02)) throw new Error("headToHead47.lawConstants: laws is { q01, q02 } of four finite weights each");
    const a = H16.lawArm("q01", laws.q01), b = H16.lawArm("q02", laws.q02), at = (ranges) => ({ lo: valueAt(spOf(a, ranges, seconds, flyFn), PRICE_LO), hi: valueAt(spOf(b, ranges, seconds, flyFn), PRICE_HI) });
    return { train: at(train), held: at(held) };
}
/** Reads and validates a state file of an R12 search (null when there is none): H32's validation, the prices and the constants. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead47.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: "R12" });
    if (J(s.prices) !== J([PRICE_LO, PRICE_HI])) throw new Error(`headToHead47.loadState: the state's prices are ${J(s.prices)}, not ${J([PRICE_LO, PRICE_HI])}`);
    if (!constsOk(s.consts)) throw new Error("headToHead47.loadState: the state carries no constants");
    return s;
}
/**
 * One RESUMABLE network search of group R12 from `start`: H32's loop and generator stream exactly with the objective of the price pair (`opts.consts` = { train: { lo, hi }, held: { lo, hi } }, required). `save(state)` after every `stateEvery` iterations and every checkpoint (each state carries the prices and the constants);
 * `state` resumes (its constants must be the ones handed in); `onIteration(n)` after iteration n. Returns { seed, group, prices, consts, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { consts = null, iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead47: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead47.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead47.longSearch: stateEvery must be a positive integer");
    if (!constsOk(consts)) throw new Error("headToHead47.longSearch: the constants are { train: { lo, hi }, held: { lo, hi } } of finite numbers");
    if (state && J(state.consts) !== J(consts)) throw new Error(`headToHead47.longSearch: the state's constants are ${J(state.consts)}, not ${J(consts)}`);
    const c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }, obj = (w, r, k) => objective(w, r, k, seconds, f);
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { X32.validateState(state, { seed, group, iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = obj(w, train, consts.train); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = obj(cand, train, consts.train);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(w), trainScore: best, heldScore: obj(w, [held], consts.held), accepted }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })), prices: [PRICE_LO, PRICE_HI], consts });
        if (onIteration) onIteration(n);
    }
    return { seed, group, prices: [PRICE_LO, PRICE_HI], consts, startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the best held-out objective of its four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.R12, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "R12") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead47.champion: group R12 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 13 arms as { id: arm }: `h27` = { laws: [q01, q02] }; `s32` = { nets: [H32's four 1800-iteration networks in seed order] }; `fresh` = { nets: [the four new networks in seed order] }. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead47.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 2 || !h27.laws.every(lawOk)) throw new Error("headToHead47.armsOf: h27 is { laws: [q01, q02] of four finite weights each }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk)) throw new Error("headToHead47.armsOf: s32 is { nets: four 963-weight vectors }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead47.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q01: H16.lawArm("q01", h27.laws[0]), q02: H16.lawArm("q02", h27.laws[1]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); R_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 14; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, earlier = null, constants = null, constantsAgain = null, startVal = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead47.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, h32, earlier, constants, constantsAgain, startVal, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's objective on the 72 train ids (the first parent of every search) against the train constants. */
export const startVal = (wip, consts, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => objective(wip, train, consts.train, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b, p) => penPair(au, a, b, p);
export const penMean = (au, a, p = H32_PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
/** An arm's mean power in kW over the audit ids: the mean of its dark and lit mean powers. */
export const meanPower = (au, a) => (avg(au.dark[a].map((r) => r.watts)) + avg(au.lit[a].map((r) => r.watts))) / 2000;
export const champArm = (au) => "r12_" + champion(au.search, LAST).seed;
/** The champion's two mean paired margins on the audit: over q01 at 0.01 and over q02 at 0.02. */
export const marginsOf = (au, a = champArm(au)) => ({ lo: pen(au, a, "q01", PRICE_LO).mean, hi: pen(au, a, "q02", PRICE_HI).mean });
const bothNotBehind = (au, a) => pen(au, a, "q01", PRICE_LO).reading !== "WORSE" && pen(au, a, "q02", PRICE_HI).reading !== "WORSE";
/** The registered verdict, eight parts joined by "; ". */
export function verdictOf(au) {
    const c = champArm(au), rd = (b, p) => word(pen(au, c, b, p).reading), lost = R_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), m = marginsOf(au), nb = R_IDS.filter((a) => bothNotBehind(au, a)).length, mp = meanPower(au, c);
    const between = mp >= Math.min(meanPower(au, "q01"), meanPower(au, "q02")) && mp <= Math.max(meanPower(au, "q01"), meanPower(au, "q02"));
    return [`THE CHAMPION ${rd("q01", PRICE_LO)} THE LAW OF 0.01 AT 0.01`, `THE CHAMPION ${rd("q02", PRICE_HI)} THE LAW OF 0.02 AT 0.02`, `THE CHAMPION ${rd("c02", H32_PRICE)} C02 AT 0.02`, `THE CHAMPION ${rd("s02_26011", H32_PRICE)} H32'S CHAMPION AT 0.02`,
        `THE CHAMPION'S WORSE MARGIN IS ABOVE ZERO: ${Math.min(m.lo, m.hi) > 0 ? "YES" : "NO"}`, `LOST SUBS IN THE R12 NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`, `NETWORKS NOT BEHIND EITHER LAW: ${nb} OF 4`, `THE CHAMPION'S MEAN POWER IS BETWEEN THE TWO LAWS': ${between ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
export const distances = (au) => R_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1Twin: l1(au.fresh.nets[i], au.s32.nets[i]) }));
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore, k = X32.champion(au.h32.search, 1800);
    return { champ: CHECKPOINTS.map((it) => g(champion(au.search, it))), seeds: SEEDS.R12.map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === "R12"), LAST))) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q01", "q02", ...S_IDS, ...R_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const k = au.constants, cst = `train L01 ${k.train.lo.toFixed(4)} and L02 ${k.train.hi.toFixed(4)}, held-out L01 ${k.held.lo.toFixed(4)} and L02 ${k.held.hi.toFixed(4)}`;
    const search = au.search.filter((r) => r.group === "R12").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((q) => `${q.iter}: train ${q.trainScore.toFixed(4)} held ${q.heldScore.toFixed(4)} acc ${q.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `R12 champion ${gp.champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800, each seed at 1800 ${SEEDS.R12.map((s, i) => `${s} ${gp.seeds[i].toFixed(4)}`).join(", ")}`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const margins = R_IDS.map((a) => { const m = marginsOf(au, a); return `${a} over q01 at 0.01 ${f4(m.lo)}, over q02 at 0.02 ${f4(m.hi)}`; }).join("; ");
    const pairs = [`${c} minus q01 at 0.01 ${fmt(pen(au, c, "q01", PRICE_LO))}`, `${c} minus q02 at 0.02 ${fmt(pen(au, c, "q02", PRICE_HI))}`, `${c} minus c02 at 0.02 ${fmt(pen(au, c, "c02", H32_PRICE))}`, `${c} minus s02_26011 at 0.02 ${fmt(pen(au, c, "s02_26011", H32_PRICE))}`, ...SEEDS.R12.map((s) => `r12_${s} minus q01 at 0.01 ${fmt(pen(au, "r12_" + s, "q01", PRICE_LO))}; r12_${s} minus q02 at 0.02 ${fmt(pen(au, "r12_" + s, "q02", PRICE_HI))}`)];
    const rep = [`${c} minus q01 at 0.02 ${fmt(pen(au, c, "q01", H32_PRICE))}`, `${c} minus q02 at 0.02 ${fmt(pen(au, c, "q02", H32_PRICE))}`];
    const rank = [...S_IDS, ...R_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Twin.toFixed(2)} from its 0.02 twin`).join("; ");
    const power = ARM_IDS.slice(1).map((a) => `${a} ${meanPower(au, a).toFixed(2)}`).join(", ");
    return [
        `SEARCH R12 (objective: the smaller of the margins over q01 at 0.01 and q02 at 0.02; constants ${cst}; start objective, then train / held-out objective and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at 1800 is ${c} (the best on the audit at the worse margin: ${[...R_IDS].sort((p, q) => Math.min(...Object.values(marginsOf(au, q))) - Math.min(...Object.values(marginsOf(au, p))))[0]})`,
        `GENERALISATION GAP (train objective minus held-out objective): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `POWER (mean of the dark and lit mean powers, kW): ${power}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `MARGINS (mean paired margin on the audit): ${margins}`,
        `PAIRED (each at its price): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: pairings at 0.02: ${rep.join("; ")}; distances ${dist}; audit means at 0.02 in rank order ${rank}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
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
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.R12.every((q) => s.filter((r) => r.group === "R12" && r.seed === q).length === 1) && s.every((r) => r.group === "R12" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && SEEDS.R12.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(cpOf(s.find((r) => r.seed === q), LAST).weights)) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 network searches (the four seeds of R12), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 4 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const probe = (() => { const c = { lo: 0.3, hi: 0.1 }, fly = (arm, r, secs, ev) => Array.from({ length: r.to - r.from + 1 }, () => ({ key: "k", score: ev ? 0.8 : 0.7, bad: false, watts: 5000, thrust: 0 })), v = objective(Array.from({ length: WEIGHT_COUNT }, () => 0.01), [{ from: 1, to: 2 }], c, 5, fly), S = 0.75, P = 5; return near(v, Math.min(S - 0.01 * P - 0.3, S - 0.02 * P - 0.1)) && near(v, Math.min(0.7 - 0.3, 0.65 - 0.1)); })();
    const objOk = !!counted && probe && s.every((r) => J(r.prices) === J([PRICE_LO, PRICE_HI]) && constsOk(r.consts) && J(r.consts) === J(au.constants)) && PRICE_LO === 0.01 && PRICE_HI === 0.02 && H32_PRICE === 0.02;
    rows.push({ name: "THE OBJECTIVE IS AS REGISTERED", ok: !!objOk, text: `every search record carries the prices 0.01 and 0.02 and the four constants of the file, and the objective of a scripted candidate (0.75 score at 5 kW, constants 0.3 and 0.1) equals min(V(0.01) - L01, V(0.02) - L02) to the last digit: ${!!objOk}` });
    const k = au.constants, again = au.constantsAgain, consOk = constsOk(k) && constsOk(again) && J(k) === J(again) && k.train.lo === again.train.lo && k.train.hi === again.train.hi;
    rows.push({ name: "THE CONSTANTS ARE THE LAWS' VALUES ON THE STATED IDS, RECOMPUTED", ok: !!consOk, text: `L01 (q01 at 0.01) and L02 (q02 at 0.02) on the 72 train ids and on the 40 held-out ids, flown again in this round, equal the constants the searches carry to the last digit: ${!!consOk}` });
    const first = !!counted && Number.isFinite(au.startVal) && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST PARENT IS WIP ON THE 72 IDS", ok: first, text: `every search's first parent has exactly wip's objective (the smaller margin against the train constants) on the 72 train ids (computed in this round): ${first}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => r.checkpoints.every((q) => q.iter !== LAST || c.heldScore >= q.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT OBJECTIVE OF THE FOUR AT 1800", ok: !!(counted && bestAt), text: `the group champion at 1800 has the largest held-out objective of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const h = au.h32, sn = au.s32, nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && X32.champion(h.search, 1800).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE FOUR S02 ARMS ARE H32'S 1800-ITERATION NETWORKS, S02_26011 ITS CHAMPION", ok: !!nets32, text: `s02_26011 to s02_26014 are the weights at 1800 of the four searches of H32's stored result, and s02_26011 is H32's champion by H32's rule: ${!!nets32}` });
    const o = au.original, kk = au.h27, regc = !!o && Array.isArray(o.search) && !!kk && Array.isArray(kk.laws) && kk.laws.length === 2 && (() => { try { return J(X27.lawChampion(o.search, "Q01").law) === J(kk.laws[0]) && J(X27.lawChampion(o.search, "Q02").law) === J(kk.laws[1]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP, Q01 AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint, and q01 and q02 are the champion laws of H27's stored Q01 and Q02 searches by H27's rule: ${!!regc}` });
    const seedsOk = J(SEEDS.R12) === J(X32.SEEDS.S02) && Array.isArray(au.earlier) && SEEDS.R12.every((q) => au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.R12.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48;
    const dj = trainOk && [...TRAIN, HELD].every((q) => disjoint(q, au.range)) && au.range.from > 46999;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the 72 train ids (26000-26023 and 30000-30047) or the held-out ids 26100-26139, and start after H46's audit (46999): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H47: a different price pair (H32's search with the smaller of the margins over the laws of 0.01 and 0.02 as its objective: seeds 26011-26014, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.005, 0.02 and 0.04`];
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
