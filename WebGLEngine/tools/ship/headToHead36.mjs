// WebGLEngine/tools/ship/headToHead36.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead36Cmd.mjs; the gate is tools/ship/headToHead36-selfcheck.mjs)
//
// ROUND H36 of brain/HEAD_TO_HEAD.md (registered before this file existed): A POPULATION SEARCH AT 0.02. A (4+16) evolution strategy with crossover from network-Wip on the 72 train ids (H27's penalised priced objective at 0.02, H28's flyPen, 160 s): four parents, sixteen
// offspring a generation (half the time a copy of one parent, otherwise a uniform crossover of two different parents; then PS.mutate, 1 to 4 weights sigma 0.3), survivors the best four of the twenty by train value with parents first among equals; 112 generations = 1792 candidate evaluations
// (H32's 1800), checkpoints after generations 56 / 75 / 94 / 112; the network at a checkpoint is the best parent. State (the whole population) saved every 5 generations and at every checkpoint, resumable (the counted generator of H32). Four seeds (H32's, group V02);
// a champion per checkpoint by held-out value; the four final networks are audited each by itself on 200 fresh ids against c02, the law of the price, H32's four 1800-iteration networks and H32's champion. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 37200, to: 37399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, SIGMA = X30.SIGMA, MAXK = X30.MAXK;
export const MU = 4, LAMBDA = 16, CROSS_P = 0.5, GENERATIONS = 112, CHECKPOINTS = Object.freeze([56, 75, 94, 112]), STATE_EVERY = 5;
export const GROUPS = Object.freeze(["V02"]), SEEDS = Object.freeze({ V02: [26011, 26012, 26013, 26014] });
export const S_IDS = Object.freeze(SEEDS.V02.map((s) => "s02_" + s)), V_IDS = Object.freeze(SEEDS.V02.map((s) => "v02_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...V_IDS]);
export const STATE_VERSION = 1;
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
/** Refuses a state that is not exactly a saved state of THIS search (named by the first fault): version, seed, group, generations, the generation, the population (four parents of 963 finite weights and finite values), the counts, the resumes and the checkpoints recorded (exactly those at or before the generation). */
export function validateState(s, { seed, group, gens = GENERATIONS, checkpoints = CHECKPOINTS, mu = MU } = {}) {
    const bad = (why) => { throw new Error(`headToHead36.validateState: ${why}`); };
    if (!s || typeof s !== "object" || Array.isArray(s)) bad("the state is not an object");
    if (s.version !== STATE_VERSION) bad(`the state's version is ${J(s.version)}, not ${STATE_VERSION}`);
    if (s.seed !== seed) bad(`the state is of seed ${J(s.seed)}, not ${seed}`);
    if (s.group !== group) bad(`the state is of group ${J(s.group)}, not ${J(group)}`);
    if (s.gens !== gens) bad(`the state is of a search of ${J(s.gens)} generations, not ${gens}`);
    if (!isInt(s.gen, 0, gens)) bad(`the generation ${J(s.gen)} is not an integer from 0 to ${gens}`);
    if (!Array.isArray(s.parents) || s.parents.length !== mu || !s.parents.every((p) => p && wOk(p.weights) && Number.isFinite(p.value))) bad(`the population is not ${mu} parents of ${WEIGHT_COUNT} finite weights with finite values`);
    if (!Number.isFinite(s.startTrain)) bad("the start value is not a finite number");
    if (!isInt(s.accepted, 0, s.gen * LAMBDA) || !isInt(s.crossAccepted, 0, s.accepted)) bad(`the accepted count ${J(s.accepted)} or the crossover count ${J(s.crossAccepted)} is not an integer in range`);
    if (!isInt(s.lost, 0, 1e9)) bad(`the lost-flight count ${J(s.lost)} is not a non-negative integer`);
    if (!isInt(s.draws, 0, 1e12)) bad(`the draw count ${J(s.draws)} is not a non-negative integer`);
    if (!Array.isArray(s.resumes) || !s.resumes.every((x) => isInt(x, 0, gens))) bad("the resumes are not a list of generations");
    if (!Array.isArray(s.checkpoints) || J(s.checkpoints.map((k) => k && k.iter)) !== J(checkpoints.filter((c) => c <= s.gen))) bad("the checkpoints recorded are not exactly those at or before the generation");
    for (const k of s.checkpoints) if (!wOk(k.weights) || !Number.isFinite(k.trainScore) || !Number.isFinite(k.heldScore) || !isInt(k.accepted, 0, k.iter * LAMBDA) || !isInt(k.crossAccepted, 0, k.accepted) || !Number.isFinite(k.diversity)) bad(`the checkpoint at ${k.iter} is malformed`);
    return s;
}
/** Reads and validates a state file of a V02 search (null when there is none); `io` is { existsSync, readFileSync }. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead36.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    return validateState(s, { gens: GENERATIONS, checkpoints: CHECKPOINTS, ...ctx, group: "V02" });
}
const diversityOf = (ps) => { let t = 0, n = 0; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { let d = 0; for (let k = 0; k < ps[i].w.length; k++) d += Math.abs(ps[i].w[k] - ps[j].w[k]); t += d; n++; } return n ? t / n : 0; };
/**
 * One RESUMABLE population search of the group V02 from `start`: `mu` parents (all the start, scored once), `lambda` offspring a generation, each (when mu > 1 and crossP > 0, by a draw below crossP) a uniform crossover of two different parents or (otherwise) a copy of one parent (chosen by a draw when mu > 1),
 * then PS.mutate; survivors the best `mu` of the parents and offspring by value, parents first among equals. `save(state)` after every `stateEvery` generations and every checkpoint; `state` resumes; `onGeneration(g)` after generation g. Returns { seed, group, startTrain, lostFlights, gens,
 * checkpoints: [{ iter (the generation), weights (the best parent), trainScore, heldScore, accepted, crossAccepted, diversity }], draws, finalWeights, resumes }.
 */
export function longSearch(seed, group, start, { gens = GENERATIONS, checkpoints = CHECKPOINTS, stateEvery = STATE_EVERY, mu = MU, lambda = LAMBDA, crossP = CROSS_P, sigma = SIGMA, maxK = MAXK, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = flyPen, state = null, save = null, onGeneration = null } = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead36: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    if (!wOk(start)) throw new Error(`headToHead36.longSearch: the start must be ${WEIGHT_COUNT} finite weights`);
    if (!isInt(stateEvery, 1, 1e9)) throw new Error("headToHead36.longSearch: stateEvery must be a positive integer");
    if (!isInt(mu, 1, 1e3) || !isInt(lambda, 1, 1e4) || !(crossP >= 0 && crossP <= 1)) throw new Error("headToHead36.longSearch: mu and lambda must be positive integers and crossP a number from 0 to 1");
    const c = { lost: 0 }, f = (arm, range, secs, ev) => { const out = flyFn(arm, range, secs, ev); if (out.some((r) => r.bad)) c.lost++; return out; }, score = (w) => X30.netObj(w, train, PRICE, seconds, f);
    let pop, accepted, crossAccepted, draws, cps, startTrain, resumes, first;
    if (state) { validateState(state, { seed, group, gens, checkpoints, mu }); pop = state.parents.map((p) => ({ w: Float32Array.from(p.weights), v: p.value })); accepted = state.accepted; crossAccepted = state.crossAccepted; draws = state.draws; cps = state.checkpoints.map((k) => ({ ...k })); startTrain = state.startTrain; c.lost = state.lost; resumes = [...state.resumes, state.gen]; first = state.gen; }
    else { const w0 = Float32Array.from(start), v0 = score(w0); pop = Array.from({ length: mu }, () => ({ w: Float32Array.from(w0), v: v0 })); accepted = 0; crossAccepted = 0; draws = 0; cps = []; startTrain = v0; resumes = []; first = 0; }
    const gen = generatorAfter(seed, draws), rng = () => { draws++; return gen(); };
    for (let g = first; g < gens; g++) {
        const kids = [];
        for (let j = 0; j < lambda; j++) {
            let child, cross = false;
            if (mu > 1 && crossP > 0 && rng() < crossP) {
                const a = Math.floor(rng() * mu); let b = Math.floor(rng() * (mu - 1)); if (b >= a) b++;
                child = new Float32Array(pop[a].w.length); for (let k = 0; k < child.length; k++) child[k] = rng() < 0.5 ? pop[a].w[k] : pop[b].w[k]; cross = true;
            } else { const a = mu > 1 ? Math.floor(rng() * mu) : 0; child = Float32Array.from(pop[a].w); }
            const w = PS.mutate(child, sigma, rng, maxK); kids.push({ w, v: score(w), cross, order: mu + j, kid: true });
        }
        const all = [...pop.map((p, i) => ({ ...p, order: i, kid: false, cross: false })), ...kids].sort((p, q) => (q.v - p.v) || (p.order - q.order)).slice(0, mu);
        for (const p of all) if (p.kid) { accepted++; if (p.cross) crossAccepted++; }
        pop = all.map((p) => ({ w: p.w, v: p.v }));
        const n = g + 1; let cp = false;
        if (checkpoints.includes(n)) { cps.push({ iter: n, weights: Array.from(pop[0].w), trainScore: pop[0].v, heldScore: X30.netObj(pop[0].w, [held], PRICE, seconds, f), accepted, crossAccepted, diversity: diversityOf(pop) }); cp = true; }
        if (save && (cp || n % stateEvery === 0)) save({ version: STATE_VERSION, seed, group, gens, gen: n, parents: pop.map((p) => ({ weights: Array.from(p.w), value: p.v })), accepted, crossAccepted, lost: c.lost, draws, startTrain, resumes: [...resumes], checkpoints: cps.map((k) => ({ ...k })) });
        if (onGeneration) onGeneration(n);
    }
    return { seed, group, startTrain, lostFlights: c.lost, gens, checkpoints: cps, draws, finalWeights: Array.from(pop[0].w), resumes };
}
/** The train evaluations a scripted search makes: counts the flights of the first train range (one dark flight per evaluation) and the held-out flights; returns { evaluations, perGeneration (evaluations made in each generation), heldFlights, checkpointGenerations } over the whole of `gens`. */
export function evaluationProbe({ gens = GENERATIONS, checkpoints = CHECKPOINTS, lambda = LAMBDA, mu = MU } = {}) {
    let evals = 0, held = 0, last = 1; const per = [], cpg = [];
    const fly = (arm, range, secs, ev) => { if (range.from === TRAIN[0].from && ev === "dropout") evals++; if (range.from === HELD.from && ev === "dropout") held++; return Array.from({ length: range.to - range.from + 1 }, (_, i) => ({ key: "k" + i, score: 0.5, bad: false, watts: 1000, thrust: 0 })); };
    longSearch(1, "V02", Array.from({ length: WEIGHT_COUNT }, () => 0.01), { gens, checkpoints, mu, lambda, flyFn: fly, onGeneration: (g) => { per.push(evals - last); last = evals; if (checkpoints.includes(g)) cpg.push(g); } });
    return { evaluations: evals, perGeneration: per, heldFlights: held, checkpointGenerations: cpg };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the best held-out penalised value of the four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.V02, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "V02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead36.champion: group V02 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 12 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's 1800-iteration networks of the four seeds in seed order] }; `fresh` = { nets: [the four final population networks in seed order] }. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead36.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead36.armsOf: h27 is { laws: one 4-weight law }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk)) throw new Error("headToHead36.armsOf: s32 is { nets: four 963-weight vectors }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead36.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); V_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 12; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, earlier = null, startVal = null, startVal32 = null, probe = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead36.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, h32, earlier, startVal, startVal32, probe, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the 72 train ids at 0.02 (the first parent's value in every search). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => X32.startVal(wip, { seconds, flyFn, train });
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
/** The arm id of the group champion at the last checkpoint (the best held-out value of the four searches). */
export const champArm = (au) => "v02_" + champion(au.search, LAST).seed;
/** H32's champion's generalisation gap at 1800 (train minus held-out value of the champion of its stored search). */
export const gap32 = (au) => { const k = X32.champion(au.h32.search, 1800); return k.trainScore - k.heldScore; };
/** The twin counts: each v02_<seed> against s02_<seed> at 0.02: { ahead, behind, tied }. */
export function twinsOf(au) { let ahead = 0, behind = 0, tied = 0; for (const s of SEEDS.V02) { const r = pen(au, "v02_" + s, "s02_" + s).reading; if (r === "BETTER") ahead++; else if (r === "WORSE") behind++; else tied++; } return { ahead, behind, tied }; }
/** The registered verdict, seven parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const c = champArm(au), rd = (b) => word(pen(au, c, b).reading), lost = V_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), t = twinsOf(au);
    const k = champion(au.search, LAST), notBehind = V_IDS.filter((a) => pen(au, a, "c02").reading !== "WORSE").length;
    return [`THE POPULATION CHAMPION ${rd("c02")} C02`, `THE POPULATION CHAMPION ${rd("q02")} THE LAW OF THE PRICE`, `THE POPULATION CHAMPION ${rd("s02_26011")} H32'S CHAMPION`, `TWINS: ${t.ahead} AHEAD, ${t.behind} BEHIND, ${t.tied} TIED`, `LOST SUBS IN THE V02 NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `THE CHAMPION'S GAP IS SMALLER THAN H32'S: ${k.trainScore - k.heldScore < gap32(au) ? "YES" : "NO"}`, `POPULATION NETWORKS NOT BEHIND C02: ${notBehind} OF 4`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per population network: its L1 distance from wip and from its (1+1) twin. */
export const distances = (au) => V_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1Twin: l1(au.fresh.nets[i], au.s32.nets[i]) }));
/** The generalisation gap (train value minus held-out value) of the group champion at each checkpoint, of every seed at the last checkpoint, and H32's champion's at 1800: { champ: [56..112], seeds: [26011..26014], h32 }. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore;
    return { champ: CHECKPOINTS.map((it) => g(champion(au.search, it))), seeds: SEEDS.V02.map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === "V02"), LAST))), h32: gap32(au) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...S_IDS, ...V_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "V02").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted} cross ${k.crossAccepted} div ${k.diversity.toFixed(2)}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `V02 champion ${gp.champ.map((x) => x.toFixed(4)).join(" / ")} at generations 56 / 75 / 94 / 112; each seed at 112 ${SEEDS.V02.map((s, i) => `${s} ${gp.seeds[i].toFixed(4)}`).join(", ")} (H32's champion at 1800 ${gp.h32.toFixed(4)})`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairs = [...["c02", "q02", "s02_26011"].map((b) => `${c} minus ${b} at 0.02 ${fmt(pen(au, c, b))}`), ...V_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`), ...SEEDS.V02.map((s) => `v02_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "v02_" + s, "s02_" + s))}`)];
    const rank = [...S_IDS, ...V_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Twin.toFixed(2)} from its twin`).join("; ");
    return [
        `SEARCH V02 (the first parent's start value on the 72 train ids, then train / held-out penalised value, accepted offspring, accepted by crossover and parent diversity (mean pairwise L1) at each checkpoint): ${search}`,
        `RESUMES: ${au.search.filter((r) => r.group === "V02").map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at generation 112 is ${c} (the best on the audit: ${[...V_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]})`,
        `GENERALISATION GAP (train value minus held-out value): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; audit means in rank order (penalised priced score at 0.02) ${rank}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
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
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.V02.every((q) => s.filter((r) => r.group === "V02" && r.seed === q).length === 1) && s.every((r) => r.group === "V02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && SEEDS.V02.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(cpOf(s.find((r) => r.seed === q), LAST).weights)) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 population searches (the four seeds of V02), each with checkpoints after generations 56, 75, 94 and 112 of 963 finite weights, and the 4 flown networks are the seeds' generation-112 best parents in seed order: ${!!counted}` });
    const pb = au.probe, probeOk = !!pb && pb.evaluations === 1793 && Array.isArray(pb.perGeneration) && pb.perGeneration.length === 112 && pb.perGeneration.every((x) => x === 16) && J(pb.checkpointGenerations) === "[56,75,94,112]" && pb.heldFlights === 4;
    rows.push({ name: "THE EVALUATION COUNTS ARE AS REGISTERED", ok: probeOk, text: `a scripted search counted by its flights makes 1793 train evaluations (the first parent's and 16 a generation over 112 generations: 1792 candidates) with held-out flights at the four checkpoints (generations 56, 75, 94, 112): ${probeOk}` });
    const first = !!counted && Number.isFinite(au.startVal) && Number.isFinite(au.startVal32) && au.startVal === au.startVal32 && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST PARENT IS WIP ON THE 72 IDS", ok: first, text: `every search's first parent has exactly wip's penalised value on the 72 train ids at 0.02 (computed in this round), which equals H32's stored value to the last digit: ${first}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => r.checkpoints.every((k) => k.iter !== LAST || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT PENALISED OF THE FOUR AT GENERATION 112", ok: !!(counted && bestAt), text: `the group champion at generation 112 has the largest held-out penalised value of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const cnt = !!counted && s.every((r) => r.checkpoints.every((k, i) => isInt(k.accepted, 0, k.iter * LAMBDA) && isInt(k.crossAccepted, 0, k.accepted) && Number.isFinite(k.diversity) && k.diversity >= 0 && (i === 0 || (k.accepted >= r.checkpoints[i - 1].accepted && k.crossAccepted >= r.checkpoints[i - 1].crossAccepted))));
    rows.push({ name: "THE ACCEPTED COUNTS ARE CONSISTENT", ok: !!cnt, text: `every checkpoint's accepted count is at most 16 times its generation, its crossover count at most its accepted count, both never fall from one checkpoint to the next, and the diversity is not negative: ${!!cnt}` });
    const h = au.h32, sn = au.s32, nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && J(Array.from(sn.nets[0])) === J(Array.from(X32.champion(h.search, 1800).weights)) && X32.champion(h.search, 1800).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE FOUR S02 ARMS ARE H32'S 1800-ITERATION NETWORKS, S02_26011 ITS CHAMPION", ok: !!nets32, text: `s02_26011 to s02_26014 are the weights at 1800 of the four searches of H32's stored result, and s02_26011 is H32's champion by H32's rule: ${!!nets32}` });
    const o = au.original, k = au.h27, reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint and q02 is the champion law of H27's stored search: ${!!reg}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48;
    const dj = trainOk && [...TRAIN, HELD, { from: 36000, to: 36215 }].every((a) => disjoint(a, au.range)) && au.range.from > 36215;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the 72 train ids (26000-26023 and 30000-30047), the held-out ids 26100-26139 or H35's rotating pool 36000-36215, and start after it (36215): ${dj}` });
    const seedsOk = J(SEEDS.V02) === J(X32.SEEDS.S02) && Array.isArray(au.earlier) && SEEDS.V02.every((q) => au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.V02.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H36: a (4+16) population search with crossover at 0.02 (group V02, seeds 26011-26014, 112 generations of 16 offspring = 1792 candidate evaluations, checkpoints after generations 56 / 75 / 94 / 112). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
