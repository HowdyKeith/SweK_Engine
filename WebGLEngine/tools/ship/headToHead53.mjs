// WebGLEngine/tools/ship/headToHead53.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead53Cmd.mjs; the gate is tools/ship/headToHead53-selfcheck.mjs)
//
// ROUND H53 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT TRAIN SET SEED -- FOUR TRAIN SETS, ONE SEARCH SEED. H32's search (the 963 weights of network-Wip, the (1+1)-ES, PS.mutate of 1 to 4 weights sigma 0.3, H28's flyPen, 160 s, 1800 iterations at 0.02, checkpoints 900 / 1200 / 1500 / 1800, resumable; H32's loop
// is written out here because the train set is handed in per search; the generator stream, the state and the counting are its) run with search seed 26011 on each of four new 72-id train sets (a to d, group Z02). The four 1800-iteration networks are flown each by itself, with the eight stored seed networks (H32's S02, H34's T02), c02, the law of the
// price, the autopilot and law0, on 200 fresh ids (74200-74399). Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 74200, to: 74399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02, SEED = 26011;
export const HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK, ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY, STATE_VERSION = X32.STATE_VERSION, LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
const mk = (a, b) => Object.freeze([Object.freeze({ from: a, to: a + 23 }), Object.freeze({ from: b, to: b + 47 })]);
export const TRAIN_SETS = Object.freeze({ a: mk(70000, 70100), b: mk(71000, 71100), c: mk(72000, 72100), d: mk(73000, 73100) });
export const LABELS = Object.freeze(["a", "b", "c", "d"]), GROUPS = Object.freeze(["Z02"]);
export const SEEDS = Object.freeze({ S02: Object.freeze([26011, 26012, 26013, 26014]), T02: Object.freeze([26031, 26032, 26033, 26034]) });
export const OLD_IDS = Object.freeze([...SEEDS.S02.map((s) => "s02_" + s), ...SEEDS.T02.map((s) => "t02_" + s)]), Z_IDS = Object.freeze(LABELS.map((l) => "z02_" + l));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...OLD_IDS, ...Z_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** Reads and validates a state file of a Z02 search (null when there is none): H32's validation and the state must carry the label (and the train set) of this search. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead53.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    const { label, ...rest } = ctx;
    X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...rest, group: "Z02" });
    if (label !== undefined && s.label !== label) throw new Error(`headToHead53.loadState: the state is of train set ${J(s.label)}, not ${J(label)}`);
    return s;
}
/**
 * One RESUMABLE network search of the group Z02 from `start` on the train set `label` (a to d; `opts.train` overrides the ranges for the gate): H32's loop and generator stream exactly. `save(state)` after every `stateEvery` iterations and every checkpoint (each state carries the label); `state` resumes (it must carry the same label);
 * `onIteration(n)` after iteration n. Returns { seed, label, group, train, startTrain, lostFlights, iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, label, start, { iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = SIGMA, maxK = MAXK, train = null, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!LABELS.includes(label)) throw new Error(`headToHead53: the train set must be one of ${LABELS.join(", ")}, got ${J(label)}`);
    if (!wOk(start)) throw new Error(`headToHead53.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead53.longSearch: stateEvery must be a positive integer");
    if (state && state.label !== label) throw new Error(`headToHead53.longSearch: the state is of train set ${J(state.label)}, not ${J(label)}`);
    const tr = train || TRAIN_SETS[label], c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }, obj = (w, r) => X30.netObj(w, r, PRICE, seconds, f);
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { X32.validateState(state, { seed, group: "Z02", iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = obj(w, tr); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = obj(cand, tr);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(w), trainScore: best, heldScore: obj(w, [held]), accepted }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group: "Z02", label, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })) });
        if (onIteration) onIteration(n);
    }
    return { seed, label, group: "Z02", train: tr.map((r) => ({ from: r.from, to: r.to })), startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
/** The pick of the group at a checkpoint: the best held-out value of the four train-set searches (the first of a tie in the order a, b, c, d); { label, ...checkpoint }. */
export function champion(rows, iter) {
    const mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "Z02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== LABELS.length || !LABELS.every((l) => mine.filter((r) => r.label === l).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead53.champion: group Z02 needs one search for each of the train sets ${LABELS.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const l of LABELS) { const r = mine.find((q) => q.label === l), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { label: l, ...k }; } return b;
}
/** The eight stored 1800-iteration networks s02_26011 ... t02_26034: [{ id, group, seed, weights, stored }]. `rows` = { S02: [H32's four search rows], T02: [H34's four] }. */
export function netsOf(rows) {
    if (!rows || !Array.isArray(rows.S02) || !Array.isArray(rows.T02)) throw new Error("headToHead53.netsOf: rows is { S02: [four search rows], T02: [four search rows] }");
    const out = [];
    for (const g of ["S02", "T02"]) for (const s of SEEDS[g]) {
        const mine = rows[g].filter((r) => r && r.seed === s);
        if (mine.length !== 1) throw new Error(`headToHead53.netsOf: group ${g} needs one search row for seed ${s}, got ${mine.length}`);
        const k = cpOf(mine[0], LAST);
        if (!k || !wOk(k.weights) || !Number.isFinite(k.heldScore)) throw new Error(`headToHead53.netsOf: ${g} seed ${s} needs a checkpoint at ${LAST} of ${WEIGHT_COUNT} finite weights and a finite held-out value`);
        out.push({ id: g.toLowerCase() + "_" + s, group: g, seed: s, weights: Array.from(k.weights), stored: k.heldScore });
    }
    return out;
}
/** The 17 arms as { id: arm }: `h27` = { laws: [q02] }; `old` = the eight stored networks (netsOf's order); `fresh` = { nets: [the four Z02 1800-iteration weight vectors in the order a to d] }. */
export function armsOf(h27, old, fresh) {
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead53.armsOf: h27 is { laws: one 4-weight law }");
    if (!Array.isArray(old) || old.length !== 8 || !old.every((n, i) => n && n.id === OLD_IDS[i] && wOk(n.weights))) throw new Error(`headToHead53.armsOf: old is the eight networks ${OLD_IDS.join(", ")} of ${WEIGHT_COUNT} finite weights each`);
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead53.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    old.forEach((n) => { out[n.id] = netArm(n.id, n.weights); }); Z_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 17; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(h27, old, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, wip = null, search = null, original = null, rows = null, earlier = null, startVals = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(h27, old, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead53.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, h27, old, fresh, wip, search, original, rows, earlier, startVals, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value at 0.02 on each train set: { a, b, c, d } (the first parent of each search). */
export const startVals = (wip, { seconds = SECONDS, flyFn = flyPen } = {}) => Object.fromEntries(LABELS.map((l) => [l, X30.netObj(wip, TRAIN_SETS[l], PRICE, seconds, flyFn)]));
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
const sv = (xs) => { const m = avg(xs); return xs.reduce((p, q) => p + (q - m) * (q - m), 0) / (xs.length - 1); };
/** The arm id of the group pick at 1800 (the best held-out value of the four searches). */
export const champArm = (au) => "z02_" + champion(au.search, LAST).label;
/** The group comparison: { z, old, diff, se, within, sdZ, sdOld } (diff = train-set mean minus seed mean; se = sqrt(var_z / 4 + var_old / 8), sample variances). */
export function groupsOf(au) {
    const z = Z_IDS.map((a) => penMean(au, a)), old = OLD_IDS.map((a) => penMean(au, a)), diff = avg(z) - avg(old), se = Math.sqrt(sv(z) / 4 + sv(old) / 8);
    return { z, old, diff, se, within: Math.abs(diff) <= 2 * se, sdZ: Math.sqrt(sv(z)), sdOld: Math.sqrt(sv(old)) };
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
/** The registered verdict, eight parts joined by "; " (part D holds a "; " inside), every reading at 0.02. */
export function verdictOf(au) {
    const g = groupsOf(au), c = champArm(au), rd = (a, b = "c02") => word(pen(au, a, b).reading), nb = (ids) => ids.filter((a) => pen(au, a, "c02").reading !== "WORSE").length, lost = Z_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`);
    const lo = Math.min(...g.z), hi = Math.max(...g.z), s26 = penMean(au, "s02_26011"), best = Z_IDS.reduce((b, a) => (penMean(au, a) > penMean(au, b) ? a : b), Z_IDS[0]);
    return [`THE BEST TRAIN-SET NETWORK ${rd(c)} C02`, `THE BEST TRAIN-SET NETWORK ${rd(c, "s02_26011")} H32'S CHAMPION`, `NOT BEHIND C02: TRAIN SETS ${nb(Z_IDS)} OF 4, SEEDS ${nb(OLD_IDS)} OF 8`, `SD OF AUDIT MEANS: TRAIN SETS ${g.sdZ.toFixed(4)}, SEEDS ${g.sdOld.toFixed(4)}; TRAIN SETS LARGER: ${g.sdZ > g.sdOld ? "YES" : "NO"}`,
        `TRAIN-SET MINUS SEED MEAN AUDIT VALUE: ${f4(g.diff)} (se ${g.se.toFixed(4)}); WITHIN 2 SE OF ZERO: ${g.within ? "YES" : "NO"}`, `S02_26011 IS INSIDE THE RANGE OF THE FOUR: ${s26 >= lo && s26 <= hi ? "YES" : "NO"}`, `LOST SUBS IN THE TRAIN-SET NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`, `THE HELD-OUT PICK IS THE BEST OF THE FOUR ON THE AUDIT: ${c === best ? "YES" : "NO"}`].join("; ");
}
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per train-set network: its L1 distance from wip and from s02_26011 (the same seed on the original train set). */
export const distances = (au) => Z_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1S: l1(au.fresh.nets[i], au.old[0].weights) }));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...OLD_IDS, ...Z_IDS], c = champArm(au), g = groupsOf(au), mean = (a) => penMean(au, a);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "Z02").map((r) => `${r.label} [train ${r.train.map((q) => `${q.from}-${q.to}`).join(" and ")}; start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost flights)`).join("; ");
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const paired = [...OLD_IDS, ...Z_IDS].map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`).join("; ");
    const sd = (xs) => Math.sqrt(sv(xs)), grp = `TRAIN SETS mean ${avg(g.z).toFixed(4)} sd ${sd(g.z).toFixed(4)} min ${Math.min(...g.z).toFixed(4)} max ${Math.max(...g.z).toFixed(4)}; SEEDS mean ${avg(g.old).toFixed(4)} sd ${sd(g.old).toFixed(4)} min ${Math.min(...g.old).toFixed(4)} max ${Math.max(...g.old).toFixed(4)}`;
    const twins = Z_IDS.map((a) => `${a} minus s02_26011 at 0.02 ${fmt(pen(au, a, "s02_26011"))}`).join("; "), dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1S.toFixed(2)} from s02_26011`).join("; ");
    const rank = [...OLD_IDS, ...Z_IDS].map((a) => [a, mean(a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    return [
        `SEARCH Z02 (the train set, start value on it, then train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.filter((r) => r.group === "Z02").map((r) => `${r.label} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `PICKS: the pick is ${c} (held-out ${champion(au.search, LAST).heldScore.toFixed(4)}; the best on the audit: ${Z_IDS.reduce((b, a) => (mean(a) > mean(b) ? a : b), Z_IDS[0])})`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(au, a, p))).join(" / ")}`).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${paired}`, `GROUPS (audit means at 0.02): ${grp}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: pairings against the same seed on the original train set: ${twins}; distances ${dist}; audit means in rank order ${rank}`,
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
    const counted = Array.isArray(s) && s.length === 4 && LABELS.every((l) => s.filter((r) => r.group === "Z02" && r.label === l).length === 1) && s.every((r) => r.group === "Z02" && J(r.train) === J(TRAIN_SETS[r.label]) && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && LABELS.every((l, i) => J(Array.from(au.fresh.nets[i])) === J(Array.from(cpOf(s.find((r) => r.label === l), LAST).weights)));
    rows.push({ name: "4 SEARCHES, EACH TRAIN SET ONCE, EACH ON ITS OWN RANGES WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 network searches (the four train sets a to d of Z02), each record carrying its own train ranges, each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 4 flown networks are the 1800-iteration weights in the order a to d: ${!!counted}` });
    const stored = (() => { try { const ref = netsOf(au.rows); return Array.isArray(au.old) && ref.length === 8 && ref.every((r, i) => au.old[i] && au.old[i].id === r.id && au.old[i].stored === r.stored && J(Array.from(au.old[i].weights)) === J(r.weights)); } catch (e) { return false; } })();
    rows.push({ name: "THE EIGHT SEED NETWORKS ARE THE STORED 1800-ITERATION WEIGHTS", ok: !!stored, text: `the eight seed networks are the weights at 1800 of H32's seeds 26011-26014 and H34's seeds 26031-26034 (963 finite weights each), read again from the stored search rows: ${!!stored}` });
    const sv0 = au.startVals, first = !!counted && !!sv0 && LABELS.every((l) => Number.isFinite(sv0[l])) && s.every((r) => r.startTrain === sv0[r.label]);
    rows.push({ name: "THE FIRST PARENT OF EACH SEARCH IS WIP ON ITS OWN TRAIN SET", ok: first, text: `every search's first parent has exactly wip's penalised value at 0.02 on its own 72 train ids (computed in this round, one value per train set): ${first}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => r.group !== "Z02" || r.checkpoints.every((k) => k.iter !== LAST || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.label === c.label), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE PICK IS THE BEST HELD-OUT PENALISED OF THE FOUR AT 1800", ok: !!(counted && bestAt), text: `the group pick at 1800 has the largest held-out penalised value of the four train-set searches (the first of a tie in the order a, b, c, d): ${!!(counted && bestAt)}` });
    const o = au.original, k = au.h27;
    const reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const seedOk = Array.isArray(s) && s.length === 4 && s.every((r) => r.seed === SEED);
    rows.push({ name: "THE SEARCH SEED IS 26011 IN EVERY RECORD", ok: seedOk, text: `every search record carries the search seed 26011 (H32's first): ${seedOk}` });
    const ids = (r) => r.to - r.from + 1, tsets = LABELS.map((l) => TRAIN_SETS[l]), flat = tsets.flat();
    const shape = tsets.every((t) => t.length === 2 && ids(t[0]) === 24 && ids(t[1]) === 48);
    const dj = shape && flat.every((a, i) => flat.every((b, j) => i === j || disjoint(a, b))) && [...flat, HELD].every((a) => disjoint(a, au.range)) && flat.every((a) => X32.TRAIN.every((b) => disjoint(a, b)) && disjoint(a, HELD)) && au.range.from > 47399;
    rows.push({ name: "TRAIN SETS DISJOINT FROM EACH OTHER, FROM H27'S 72 IDS, THE HELD-OUT IDS AND THE AUDIT", ok: dj, text: `the four train sets are pairs of ranges of 24 and 48 ids (70000-70023 and 70100-70147, 71000-71023 and 71100-71147, 72000-72023 and 72100-72147, 73000-73023 and 73100-73147), disjoint from each other, from H27's 26000-26023 and 30000-30047, from the held-out ids 26100-26139 and from the audit ids, which start after H47's audit (47399): ${dj}` });
    const pr = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pr && !!pr.straight && !!pr.resumed && pr.killedAt === 6 && pr.resumedFrom === 4 && !!pr.config && pr.config.iters === 12 && F(pr.straight) === F(pr.resumed) && J(pr.straight.resumes) === "[]" && J(pr.resumed.resumes) === "[4]" && pr.resumed.draws > 0;
    rows.push({ name: "THE SEARCH CODE HAS H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H53: a different train set seed (four new 72-id train sets, search seed 26011, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800, group Z02; against the eight stored seed networks). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
