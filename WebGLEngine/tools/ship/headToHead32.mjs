// WebGLEngine/tools/ship/headToHead32.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead32Cmd.mjs; the gate is tools/ship/headToHead32-selfcheck.mjs)
//
// ROUND H32 of brain/HEAD_TO_HEAD.md (registered before this file existed): RESUMABLE SEARCHES, USED ON THE 0.02 PRICE. H30's and H31's checkpointed network search (963 weights from network-Wip, (1+1)-ES, the penalised priced objective on the 72
// train ids, H27's seeds) written out here with a STATE that can be saved every 50 iterations and at every checkpoint and RESUMED to the last digit (the generator is counted, and a mulberry generator seeded with seed + n x 0x6D2B79F5 continues exactly after n draws),
// run for 1800 iterations at price 0.02 (group S02, four seeds), checkpoints at 900, 1200, 1500 and 1800. The first 900 iterations ARE H30's P02 search of the seed. A champion per checkpoint by held-out penalised value; audited on 200 fresh ids with c02, the law of
// the price, H27's 600-iteration, H29's 2400-iteration and H30's 900-iteration champions and the four new ones; a real kill-and-resume proof is read by a check. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X28 from "./headToHead28.mjs";
import * as X29 from "./headToHead29.mjs";
import * as X30 from "./headToHead30.mjs";

export const IDS = Object.freeze({ from: 32200, to: 32399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X30.TRAIN, HELD = X30.HELD;
export const GROUPS = Object.freeze(["S02"]), SEEDS = Object.freeze({ S02: [26011, 26012, 26013, 26014] });
export const CHECKPOINTS = Object.freeze([900, 1200, 1500, 1800]), ITERS = 1800;
export const R_IDS = Object.freeze(["s02_900", "s02_1200", "s02_1500", "s02_1800"]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", "m02", "x02_2400", "y02_900", ...R_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X28.flyPen;
const J = JSON.stringify;
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
export const STATE_VERSION = 1, STATE_EVERY = 50, MULBERRY_STEP = 0x6D2B79F5;
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
/** The generator after `n` draws of a mulberry generator seeded with `seed`: mulberry's state moves by a constant at every draw, so a generator seeded with seed + n x step carries on exactly where the first stopped. */
export const generatorAfter = (seed, n) => PS.mulberry(Number((BigInt(seed >>> 0) + BigInt(n) * BigInt(MULBERRY_STEP)) & 0xFFFFFFFFn));
/** Refuses a state that is not exactly a saved state of THIS search (named by the first fault): version, seed, group, iterations, the iteration, the weights, the numbers, the resumes and the checkpoints recorded (exactly those at or before the iteration). */
export function validateState(s, { seed, group, iters = ITERS, checkpoints = CHECKPOINTS } = {}) {
    const bad = (why) => { throw new Error(`headToHead32.validateState: ${why}`); };
    if (!s || typeof s !== "object" || Array.isArray(s)) bad("the state is not an object");
    if (s.version !== STATE_VERSION) bad(`the state's version is ${JSON.stringify(s.version)}, not ${STATE_VERSION}`);
    if (s.seed !== seed) bad(`the state is of seed ${JSON.stringify(s.seed)}, not ${seed}`);
    if (s.group !== group) bad(`the state is of group ${JSON.stringify(s.group)}, not ${JSON.stringify(group)}`);
    if (s.iters !== iters) bad(`the state is of a search of ${JSON.stringify(s.iters)} iterations, not ${iters}`);
    if (!isInt(s.iter, 0, iters)) bad(`the iteration ${JSON.stringify(s.iter)} is not an integer from 0 to ${iters}`);
    if (!wOk(s.weights)) bad(`the weights are not ${WEIGHT_COUNT} finite numbers`);
    if (!Number.isFinite(s.best) || !Number.isFinite(s.startTrain)) bad("the best value or the start value is not a finite number");
    if (!isInt(s.accepted, 0, s.iter)) bad(`the accepted count ${JSON.stringify(s.accepted)} is not an integer from 0 to the iteration`);
    if (!isInt(s.lost, 0, 1e9)) bad(`the lost-flight count ${JSON.stringify(s.lost)} is not a non-negative integer`);
    if (!isInt(s.draws, 0, 1e12)) bad(`the draw count ${JSON.stringify(s.draws)} is not a non-negative integer`);
    if (!Array.isArray(s.resumes) || !s.resumes.every((x) => isInt(x, 0, iters))) bad("the resumes are not a list of iterations");
    if (!Array.isArray(s.checkpoints) || J(s.checkpoints.map((k) => k && k.iter)) !== J(checkpoints.filter((c) => c <= s.iter))) bad("the checkpoints recorded are not exactly those at or before the iteration");
    for (const k of s.checkpoints) if (!wOk(k.weights) || !Number.isFinite(k.trainScore) || !Number.isFinite(k.heldScore) || !isInt(k.accepted, 0, k.iter)) bad(`the checkpoint at ${k.iter} is malformed`);
    return s;
}
/** Saves a state by writing a temporary file and renaming it over the state file, so a kill between the two leaves the previous state readable; `io` is { writeFileSync, renameSync }. */
export function saveStateAtomic(io, file, state) { io.writeFileSync(file + ".tmp", JSON.stringify(state)); io.renameSync(file + ".tmp", file); }
/** Reads and validates a state file (null when there is none); a file that is not JSON or not a state of this search is refused by name; `io` is { existsSync, readFileSync }. */
export function loadState(io, file, ctx) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead32.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    return validateState(s, ctx);
}
/**
 * One RESUMABLE network search of the group from `start`: H30's loop and generator stream exactly, under the price 0.02, for 1800 iterations with checkpoints at 900 / 1200 / 1500 / 1800 by default. `save(state)` is called after every `stateEvery`
 * iterations and every checkpoint; `state` (from a previous save) resumes the search from the iteration it records; `onIteration(n)` is called after iteration n (the proof kills the process there). Returns { seed, group, startTrain, lostFlights,
 * iters, checkpoints: [{ iter, weights, trainScore, heldScore, accepted }], draws, finalWeights, resumes } -- the same for a search stopped and resumed as for one run straight through, but for `resumes`.
 */
export function longSearch(seed, group, start, { iters = ITERS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, sigma = X30.SIGMA, maxK = X30.MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onIteration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead32: the group must be one of ${GROUPS.join(", ")}, got ${JSON.stringify(group)}`);
    if (!wOk(start)) throw new Error(`headToHead32.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead32.longSearch: stateEvery must be a positive integer");
    const c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; };
    let w, best, accepted, draws, cps, startTrain, resumes, first;
    if (state) { validateState(state, { seed, group, iters, checkpoints }); w = Float32Array.from(state.weights); best = state.best; accepted = state.accepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.iter]; first = state.iter; }
    else { w = Float32Array.from(start); best = X30.netObj(w, train, PRICE, seconds, f); accepted = 0; draws = 0; cps = []; startTrain = best; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let it = first; it < iters; it++) {
        const cand = PS.mutate(w, sigma, rng, maxK), sc = X30.netObj(cand, train, PRICE, seconds, f);
        if (sc >= best) { w = cand; best = sc; accepted++; }
        const n = it + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(w), trainScore: best, heldScore: X30.netObj(w, [held], PRICE, seconds, f), accepted }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group, iters, iter: n, weights: Array.from(w), best, accepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })) });
        if (onIteration) onIteration(n);
    }
    return { seed, group, startTrain, lostFlights: c.lost, iters, checkpoints: cps, draws, finalWeights: Array.from(w), resumes };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the search with the best held-out penalised value among the four at that checkpoint, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.S02, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "S02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead32.champion: group S02 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
/** The 11 arms as { id: arm }: `h27` = { laws: [q02], nets: [m02] }; `h29` = { nets: [x02_2400] }; `h30` = { nets: [y02_900] }; `fresh` = { nets: [s02_900, s02_1200, s02_1500, s02_1800] }. */
export function armsOf(wip, h27, h29, h30, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead32.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    const one = (x) => !!x && Array.isArray(x.nets) && x.nets.length === 1 && x.nets.every(wOk);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite)) || !one(h27)) throw new Error("headToHead32.armsOf: h27 is { laws: one 4-weight law, nets: one 963-weight vector }");
    if (!one(h29) || !one(h30)) throw new Error("headToHead32.armsOf: h29 and h30 are { nets: one 963-weight vector }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead32.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]), m02: netArm("m02", h27.nets[0]), x02_2400: netArm("x02_2400", h29.nets[0]), y02_900: netArm("y02_900", h30.nets[0]) };
    R_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 11; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, h29, h30, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, original29 = null, original30 = null, fixture = null, startVal = null, proof = null } = {}) {
    const all = armsOf(wip, h27, h29, h30, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead32.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, h29, h30, fresh, search, original, original29, original30, fixture, startVal, proof, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the 72 train ids at 0.02 (the first scored candidate of every search). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => X30.netObj(wip, train, PRICE, seconds, flyFn);
export const fixtureOf = X27.fixtureOf;
// ---- the readings
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
/** Whether the group champion's held-out value is strictly larger at 1200 than at 900, at 1500 than at 1200 and at 1800 than at 1500. */
export const rises = (search) => CHECKPOINTS.slice(1).every((it, k) => champion(search, it).heldScore > champion(search, CHECKPOINTS[k]).heldScore);
/** The registered verdict, seven parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const lost = R_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), rd = (b) => word(penPair(au, "s02_1800", b, PRICE).reading);
    return [`THE 1800 CHAMPION ${rd("y02_900")} H30'S 900 CHAMPION`, `THE 1800 CHAMPION ${rd("m02")} H27'S 600 CHAMPION`, `THE 1800 CHAMPION ${rd("x02_2400")} H29'S 2400 CHAMPION`, `THE 1800 CHAMPION ${rd("q02")} THE LAW OF THE PRICE`, `THE 1800 CHAMPION ${rd("c02")} C02`,
        `LOST SUBS IN THE S02 CHAMPIONS: ${lost.length ? lost.join(", ") : "NONE"}`, `HELD-OUT VALUE RISES AT EVERY CHECKPOINT: ${rises(au.search) ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new champion: its L1 distance from wip and from H30's 900-iteration champion. */
export const distances = (au) => R_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1Y: l1(au.fresh.nets[i], au.h30.nets[0]) }));
/** The generalisation gap (train value minus held-out value) of the group champion at each checkpoint, and of H29's L02 champion at 2400 and H30's P02 champion at 900 (from their stored searches): { s02: [gap at 900, 1200, 1500, 1800], h29, h30 }. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore;
    return { s02: CHECKPOINTS.map((it) => g(champion(au.search, it))), h29: g(X29.champion(au.original29.search, "L02", 2400)), h30: g(X30.champion(au.original30.search, "P02", 900)) };
}
const F2 = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", "m02", "x02_2400", "y02_900", ...R_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`;
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "S02").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `S02 ${gp.s02.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800 (H30's 900 champion ${gp.h30.toFixed(4)}, H29's 2400 champion ${gp.h29.toFixed(4)})`;
    const pairs = [...["y02_900", "m02", "x02_2400", "q02", "c02"].map((b) => `s02_1800 minus ${b} at 0.02 ${fmt(penPair(au, "s02_1800", b, PRICE))}`), ...R_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(penPair(au, a, "c02", PRICE))}`)];
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Y.toFixed(2)} from H30's 900-iteration champion`).join("; ");
    return [
        `RESUME PROOF: ${au.proof.straight.draws} draws straight through against ${au.proof.resumed.draws} resumed; final weights ${F2(au.proof.straight) === F2(au.proof.resumed) ? "identical" : "DIFFERENT"}; the child was killed after iteration ${au.proof.killedAt} and resumed from the state at ${au.proof.resumedFrom}`,
        `SEARCH S02 (start value on the 72 train ids, then train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.filter((r) => r.group === "S02").map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}`,
        `GENERALISATION GAP (train minus held-out value of the group champion): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const ident = ["dark", "lit"].every((c) => au[c].law0 && au[c].law0.every((r, i) => au[c].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[c].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.S02.every((q) => s.filter((r) => r.group === "S02" && r.seed === q).length === 1) && s.every((r) => r.group === "S02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: counted, text: `4 network searches (the four seeds of S02), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 4 new champions: ${counted}` });
    const o30 = au.original30, o900 = counted && !!o30 && Array.isArray(o30.search) && s.every((r) => { const q = o30.search.find((x) => x.seed === r.seed && x.group === "P02"), k = cpOf(r, 900), q9 = q && cpOf(q, 900); return !!q9 && J(Array.from(q9.weights)) === J(k.weights) && q9.trainScore === k.trainScore && q9.heldScore === k.heldScore && q9.accepted === k.accepted; });
    rows.push({ name: "THE 900-ITERATION CHECKPOINT IS H30'S SEARCH", ok: !!o900, text: `the weights, train and held-out values and accepted count at iteration 900 of every search equal H30's stored P02 search of the same seed to the last digit: ${!!o900}` });
    const first = counted && Number.isFinite(au.startVal) && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS WIP ON THE 72 IDS", ok: first, text: `every search's first scored candidate has exactly wip's penalised value on the 72 train ids at 0.02 (computed in this round): ${first}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48 && ids(TRAIN[0]) + ids(TRAIN[1]) === 72;
    const dj = trainOk && [...TRAIN, HELD].every((a, i, all) => disjoint(a, au.range) && all.every((b, j) => i === j || disjoint(a, b))) && disjoint(au.range, { from: 22200, to: 31399 });
    rows.push({ name: "ID SETS DISJOINT, THE TRAIN SET BEING THE 72 IDS", ok: dj, text: `the train ids are H27's 26000-26023 and 30000-30047 (72 in all), and they, the held-out ids and the audit ids do not overlap, the audit ids being past every earlier audit (22200-31399): ${dj}` });
    const bestAt = (it, w) => { try { return J(Array.from(champion(s, it).weights)) === J(Array.from(w || [])); } catch (e) { return false; } };
    const champs = counted && !!au.fresh && Array.isArray(au.fresh.nets) && CHECKPOINTS.every((it, k) => bestAt(it, au.fresh.nets[k]));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT PENALISED OF THE GROUP AT ITS CHECKPOINT", ok: !!champs, text: `the four new champions are the best held-out penalised of the group at 900, 1200, 1500 and 1800: ${!!champs}` });
    const o = au.original, o9 = au.original29, h = au.h27, h9 = au.h29, h0 = au.h30;
    const reg = !!o && Array.isArray(o.search) && !!o9 && Array.isArray(o9.search) && !!o30 && Array.isArray(o30.search) && !!h && Array.isArray(h.laws) && h.laws.length === 1 && Array.isArray(h.nets) && h.nets.length === 1 && !!h9 && Array.isArray(h9.nets) && h9.nets.length === 1 && !!h0 && Array.isArray(h0.nets) && h0.nets.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(h.laws[0]) && J(Array.from(X27.netChampion(o.search, "M02").weights)) === J(Array.from(h.nets[0])) && J(Array.from(X29.champion(o9.search, "L02", 2400).weights)) === J(Array.from(h9.nets[0])) && J(Array.from(X30.champion(o30.search, "P02", 900).weights)) === J(Array.from(h0.nets[0])); } catch (e) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND THE STORED CHAMPIONS ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, and q02, m02, x02_2400 and y02_900 are the champions of H27's, H29's and H30's stored searches by their rounds' rules: ${!!reg}` });
    const pr = au.proof, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pr && !!pr.straight && !!pr.resumed && pr.killedAt === 6 && pr.resumedFrom === 4 && pr.config && pr.config.iters === 12 && J(pr.config.checkpoints) === "[8,12]" && pr.config.stateEvery === 4 && F(pr.straight) === F(pr.resumed) && J(pr.straight.resumes) === "[]" && J(pr.resumed.resumes) === "[4]" && pr.resumed.draws > 0 && wOk(pr.straight.finalWeights) && pr.straight.checkpoints.length === 2;
    rows.push({ name: "A RESUMED SEARCH EQUALS AN UNINTERRUPTED ONE", ok: !!proofOk, text: `on the real pair (12 iterations, state every 4, a child killed after iteration 6 and resumed from the state at 4) the start value, lost flights, draws, final weights and both checkpoints are identical to the search run straight through, and the resumed one records the resume from 4: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H32: the longer search on 72 ids at 0.02 (1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
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
