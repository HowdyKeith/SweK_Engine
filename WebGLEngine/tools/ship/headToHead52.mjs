// WebGLEngine/tools/ship/headToHead52.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead52Cmd.mjs; the gate is tools/ship/headToHead52-selfcheck.mjs)
//
// ROUND H52 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT HELD-OUT SET FOR PICKING THE STOPPING POINT. H32's search (the 963 weights of network-Wip, the (1+1)-ES, PS.mutate of 1 to 4 weights sigma 0.3, H28's flyPen, 160 s, 1800 iterations on the 72 train ids at 0.02, resumable; H32's
// loop is written out here because it needs the extra evaluations; the generator stream, the state and the counting are its) with ONE change: nine checkpoints (every 200 iterations) and at each TWO held-out values, on HO (the series' 40 ids) and on HX (200 new ids). Four new seeds (28001-28004, group W02). All 36 checkpoint networks are flown each by
// itself, with c02, the law of the price, the autopilot and law0, on 200 fresh ids (56200-56399); the stopping point picked by HO and the one picked by HX are compared on the audit. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 56200, to: 56399 }), HX = Object.freeze({ from: 55000, to: 55199 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK, ITERS = X32.ITERS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION;
export const CHECKPOINTS = Object.freeze([200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800]), LAST = 1800;
export const GROUPS = Object.freeze(["W02"]), SEEDS = Object.freeze({ W02: Object.freeze([28001, 28002, 28003, 28004]) });
export const netId = (seed, iter) => `w02_${seed}_${iter}`;
export const NET_IDS = Object.freeze(SEEDS.W02.flatMap((s) => CHECKPOINTS.map((c) => netId(s, c))));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...NET_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** Reads and validates a state file of a W02 search (null when there is none): H32's validation and every recorded checkpoint must carry a finite HX value. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead52.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...ctx, group: "W02" });
    if (ctx.hx !== null && !s.checkpoints.every((k) => Number.isFinite(k.hxScore))) throw new Error("headToHead52.loadState: a recorded checkpoint carries no finite HX value");
    return s;
}
/**
 * One RESUMABLE network search of the group W02 from `start`: H32's loop and generator stream exactly, with checkpoints at `checkpoints` (default every 200 iterations) and at each checkpoint two held-out values: `heldScore` on `held` and `hxScore` on `hx` (default HX; `hx: null` switches the second evaluation off and the records carry no hxScore: the gate
 * shows the loop then equal to H32's longSearch). `save(state)` after every `stateEvery` iterations and every checkpoint; `state` resumes; `onIteration(n)` after iteration n. Returns { seed, group, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, hxScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, hx = HX, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead52: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead52.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead52.longSearch: stateEvery must be a positive integer");
    const c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }, obj = (w, r) => X30.netObj(w, r, PRICE, seconds, f);
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { X32.validateState(state, { seed, group, iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = obj(w, train); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = obj(cand, train);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { const k = { iter: n, weights: Array.from(w), trainScore: best, heldScore: obj(w, [held]), accepted }; if (hx) k.hxScore = obj(w, [hx]); cps.push(k); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })) });
        if (onIteration) onIteration(n);
    }
    return { seed, group, startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
/** The arms as { id: arm }: `h27` = { laws: [q02] }; `fresh` = { nets: [the 36 checkpoint weight vectors in the order of NET_IDS (seed by seed, iteration by iteration)] }. */
export function armsOf(h27, fresh) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead52.armsOf: h27 is { laws: one 4-weight law }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 36 || !fresh.nets.every(wOk)) throw new Error("headToHead52.armsOf: fresh is { nets: 36 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    NET_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The 36 checkpoint weight vectors in NET_IDS order from the search rows (each seed once, each with all nine checkpoints). */
export function netsOf(rows) {
    if (!Array.isArray(rows)) throw new Error("headToHead52.netsOf: rows is a list of search rows");
    return SEEDS.W02.flatMap((s) => { const mine = rows.filter((r) => r && r.group === "W02" && r.seed === s); if (mine.length !== 1) throw new Error(`headToHead52.netsOf: group W02 needs one search row for seed ${s}, got ${mine.length}`); return CHECKPOINTS.map((c) => { const k = cpOf(mine[0], c); if (!k || !wOk(k.weights)) throw new Error(`headToHead52.netsOf: seed ${s} needs a checkpoint at ${c} of ${WEIGHT_COUNT} finite weights`); return Array.from(k.weights); }); });
}
/** The arms of `arms` (default all 40; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(h27, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, wip = null, search = null, original = null, earlier = null, startVal = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(h27, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead52.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, h27, fresh, wip, search, original, earlier, startVal, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the 72 train ids at 0.02 (the first scored candidate of every search). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => X30.netObj(wip, train, PRICE, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
const ranks = (xs) => xs.map((x) => { const lt = xs.filter((y) => y < x).length, eq = xs.filter((y) => y === x).length; return lt + (eq + 1) / 2; });
/** Spearman's rho: the Pearson correlation of the ranks, ties averaged (NaN for a constant list). */
export function spearman(a, b) { const ra = ranks(a), rb = ranks(b), ma = avg(ra), mb = avg(rb); let sab = 0, saa = 0, sbb = 0; ra.forEach((x, i) => { sab += (x - ma) * (rb[i] - mb); saa += (x - ma) ** 2; sbb += (rb[i] - mb) ** 2; }); return saa === 0 || sbb === 0 ? NaN : sab / Math.sqrt(saa * sbb); }
const sd = (xs) => { const m = avg(xs); return Math.sqrt(xs.reduce((p, q) => p + (q - m) * (q - m), 0) / (xs.length - 1)); };
/** The curves of a seed: { ho: [9], hx: [9], audit: [9] } (the stored values at the nine checkpoints and the audit means of the nine networks). */
export function curveOf(au, seed) {
    const r = au.search.find((q) => q.group === "W02" && q.seed === seed);
    return { ho: CHECKPOINTS.map((c) => cpOf(r, c).heldScore), hx: CHECKPOINTS.map((c) => cpOf(r, c).hxScore), audit: CHECKPOINTS.map((c) => penMean(au, netId(seed, c))) };
}
/** The index (0 to 8) of the best value (the first, i.e. the earliest checkpoint, on a tie). */
export const bestIdx = (xs) => xs.reduce((b, v, i) => (v > xs[b] ? i : b), 0);
/** Per seed: the HO pick, the HX pick (checkpoint indexes), their audit values, the 1800 network's, the oracle's, and the curves. */
export function picksOf(au) {
    return SEEDS.W02.map((s) => { const c = curveOf(au, s), io = bestIdx(c.ho), ix = bestIdx(c.hx), oi = bestIdx(c.audit); return { seed: s, iO: io, iX: ix, oracle: oi, ho: netId(s, CHECKPOINTS[io]), hx: netId(s, CHECKPOINTS[ix]), last: netId(s, LAST), auHo: c.audit[io], auHx: c.audit[ix], auLast: c.audit[8], auOracle: c.audit[oi], hoVal: c.ho[io], hxVal: c.hx[ix], rhoHo: spearman(c.ho, c.audit), rhoHx: spearman(c.hx, c.audit), rhoIter: spearman(CHECKPOINTS.slice(), c.audit), curve: c }; });
}
const meanFinite = (xs) => { const f = xs.filter(Number.isFinite); return f.length ? avg(f) : NaN; };
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), r2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "NaN");
/** The registered verdict, eight parts joined by "; ". */
export function verdictOf(au) {
    const P = picksOf(au), rd = (a) => word(pen(au, a, "c02").reading), lost = NET_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`);
    const dA = avg(P.map((p) => p.auHx - p.auHo)), higher = P.filter((p) => p.auHx > p.auHo).length, equal = P.filter((p) => p.auHx === p.auHo).length;
    const bx = P.reduce((b, p) => (p.hxVal > b.hxVal ? p : b), P[0]), bo = P.reduce((b, p) => (p.hoVal > b.hoVal ? p : b), P[0]);
    return [`HX PICK MINUS HO PICK MEAN AUDIT VALUE: ${f4(dA)}`, `SEEDS WHERE THE HX PICK IS HIGHER ON THE AUDIT: ${higher} OF 4 (EQUAL: ${equal})`, `PICK MINUS THE 1800 NETWORK, MEAN OVER SEEDS: HX ${f4(avg(P.map((p) => p.auHx - p.auLast)))}, HO ${f4(avg(P.map((p) => p.auHo - p.auLast)))}`,
        `RANK CORRELATION OVER THE NINE CHECKPOINTS WITH THE AUDIT, MEAN OVER SEEDS: HX ${r2(meanFinite(P.map((p) => p.rhoHx)))}, HO ${r2(meanFinite(P.map((p) => p.rhoHo)))}`, `THE BEST HX-PICKED NETWORK ${rd(bx.hx)} C02`, `THE BEST HO-PICKED NETWORK ${rd(bo.ho)} C02`,
        `LOST SUBS IN THE 36: ${lost.length ? lost.join(", ") : "NONE"}`, `AUDIT VALUE RISES WITH ITERATIONS: ${meanFinite(P.map((p) => p.rhoIter)) > 0.5 ? "YES" : "NO"}`].join("; ");
}
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function bottomLines(au) {
    const P = picksOf(au), shown = ["autopilot", "c02", "q02", ...NET_IDS], arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "W02").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} HO ${k.heldScore.toFixed(4)} HX ${k.hxScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost flights)`).join("; ");
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const picks = P.map((p) => `${p.seed}: HO pick ${CHECKPOINTS[p.iO]} (HO ${p.hoVal.toFixed(4)}, audit ${p.auHo.toFixed(4)}), HX pick ${CHECKPOINTS[p.iX]} (HX ${p.hxVal.toFixed(4)}, audit ${p.auHx.toFixed(4)}), 1800 audit ${p.auLast.toFixed(4)}`).join("; ");
    const curves = P.map((p) => `${p.seed}: ${CHECKPOINTS.map((c, i) => `${c} HO ${p.curve.ho[i].toFixed(4)} HX ${p.curve.hx[i].toFixed(4)} audit ${p.curve.audit[i].toFixed(4)}`).join(", ")}`).join("; ");
    const paired = [...new Set(P.flatMap((p) => [p.ho, p.hx, p.last]))].map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`).join("; ");
    const hoAll = P.flatMap((p) => p.curve.ho), hxAll = P.flatMap((p) => p.curve.hx), diff = hoAll.map((v, i) => v - hxAll[i]);
    return [
        `SEARCH W02 (start value on the 72 train ids, then train value, HO value, HX value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.filter((r) => r.group === "W02").map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `PICKS (per seed: the checkpoint the held-out set picks, its held-out value and its audit value): ${picks}`, `CURVES (per seed and checkpoint: HO, HX and audit values): ${curves}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `PAIRED (the picks and the 1800 networks against c02, penalised priced score at 0.02): ${paired}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: the oracle pick per seed ${P.map((p) => `${p.seed}: ${CHECKPOINTS[p.oracle]} (${p.auOracle.toFixed(4)})`).join(", ")}; correlation of HO with HX over the 36 ${r2(spearman(hoAll, hxAll))}; standard deviation of HO minus HX ${sd(diff).toFixed(4)}; the mean over seeds of the rank correlation of the iteration with the audit ${r2(meanFinite(P.map((p) => p.rhoIter)))}; extra power of the 1800 networks ${P.map((p) => `${p.last} ${f2(extraPower(au, p.last))}`).join(", ")}`,
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
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.W02.every((q) => s.filter((r) => r.group === "W02" && r.seed === q).length === 1) && s.every((r) => r.group === "W02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore) && Number.isFinite(k.hxScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 36 && au.fresh.nets.every(wOk) && (() => { try { const ref = netsOf(s); return ref.every((w, i) => J(Array.from(au.fresh.nets[i])) === J(w)); } catch (e) { return false; } })();
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH NINE CHECKPOINTS OF 963 FINITE WEIGHTS AND TWO HELD-OUT VALUES", ok: !!counted, text: `4 network searches (the four seeds of W02), each with checkpoints at 200, 400, ..., 1800 of 963 finite weights, finite train, HO and HX values, and the 36 flown networks are the checkpoints' weights in seed and iteration order: ${!!counted}` });
    const first = !!counted && Number.isFinite(au.startVal) && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS WIP ON THE 72 IDS", ok: first, text: `every search's first scored candidate has exactly wip's penalised value on the 72 train ids at 0.02 (computed in this round): ${first}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48 && ids(HELD) === 40 && ids(HX) === 200;
    const dj = trainOk && [...TRAIN, { from: 50000, to: 50071 }, { from: 52000, to: 52299 }, { from: 53000, to: 53799 }].every((a) => disjoint(a, au.range) && disjoint(a, HX)) && disjoint(HELD, HX) && disjoint(HELD, au.range) && disjoint(HX, au.range) && au.range.from > 47399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `HO (26100-26139, 40 ids), HX (55000-55199, 200 ids) and the audit ids are pairwise disjoint, disjoint from the train ids (26000-26023 and 30000-30047), 50000-50071, 52000-52299 and H48's 53000-53799, and the audit starts after H47's audit (to 47399): ${dj}` });
    const e = au.earlier, newSeeds = Array.isArray(e) && e.length > 0 && e.includes(26011) && e.includes(26031) && SEEDS.W02.every((q) => !e.includes(q));
    rows.push({ name: "THE SEEDS ARE NEW", ok: newSeeds, text: `the four seeds 28001-28004 appear in no stored search of H27, H29, H30, H31, H32 or H34 (their seeds read: ${Array.isArray(e) ? e.length : 0}): ${newSeeds}` });
    const o = au.original, k = au.h27;
    const reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const pr = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pr && !!pr.straight && !!pr.resumed && pr.killedAt === 6 && pr.resumedFrom === 4 && !!pr.config && pr.config.iters === 12 && F(pr.straight) === F(pr.resumed) && J(pr.straight.resumes) === "[]" && J(pr.resumed.resumes) === "[4]" && pr.resumed.draws > 0;
    rows.push({ name: "THE SEARCH CODE HAS H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H52: a different held-out set for picking the stopping point (four searches of H32's recipe, group W02, seeds 28001-28004, nine checkpoints every 200 iterations, HO 40 ids and HX 200 ids at each; 36 networks flown). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(18)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.005 / 0.02 / 0.04:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(18)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(au, a, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
