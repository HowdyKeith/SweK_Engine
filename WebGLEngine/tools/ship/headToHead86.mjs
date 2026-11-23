// WebGLEngine/tools/ship/headToHead86.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead86Cmd.mjs; the gate is tools/ship/headToHead86-selfcheck.mjs)
//
// ROUND H86 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT SEED SET -- FOUR NEW SEEDS (39001-39004) OF H36'S (4+16) POPULATION SEARCH AT 0.02 (group U02).
// THIS FILE IS A LAYER ON H36'S LIBRARY (headToHead36.mjs): the population loop, its state, its counted generator and its evaluation probe are H36's, called, not copied; a U02 search IS a V02 search of H36 with the group label changed in the records. What is new here: the group's name and seeds,
// the arms (H36's four stored networks beside the four new ones and H32's champion), the audit ids, the new-against-H36 group comparison and the verdict. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";
import * as X36 from "./headToHead36.mjs";

export const IDS = Object.freeze({ from: 106200, to: 106399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = X36.PRICE, EARLIER_AUDIT = 105399;
export const TRAIN = X36.TRAIN, HELD = X36.HELD, MU = X36.MU, LAMBDA = X36.LAMBDA, GENERATIONS = X36.GENERATIONS, CHECKPOINTS = X36.CHECKPOINTS, STATE_EVERY = X36.STATE_EVERY, STATE_VERSION = X36.STATE_VERSION;
export const GROUPS = Object.freeze(["U02"]), SEEDS = Object.freeze({ U02: [39001, 39002, 39003, 39004] });
export const O_IDS = Object.freeze(X36.SEEDS.V02.map((s) => "v02_" + s)), N_IDS = Object.freeze(SEEDS.U02.map((s) => "u02_" + s)), V36C = "v02_26012";
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", "s02_26011", ...O_IDS, ...N_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter, evaluationProbe = X36.evaluationProbe;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const need = (g) => { if (!GROUPS.includes(g)) throw new Error(`headToHead86: the group must be one of ${GROUPS.join(", ")}, got ${J(g)}`); return "V02"; };
/** Reads and validates a state file of a U02 search (null when there is none): H36's validation on the base group with the state labelled U02. */
export function loadState(io, file, ctx = {}) {
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead86.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    if (!s || s.group !== "U02") throw new Error(`headToHead86.loadState: the state is of group ${J(s && s.group)}, not "U02"`);
    X36.validateState({ ...s, group: "V02" }, { gens: GENERATIONS, checkpoints: CHECKPOINTS, ...ctx, group: "V02" });
    return s;
}
/** One RESUMABLE population search of the group U02 from `start`: H36's longSearch on the base group; every saved state and the result carry the label U02; `state` resumes (it must carry the label U02). */
export function longSearch(seed, group, start, { state = null, save = null, ...opts } = {}) {
    const base = need(group);
    if (state && state.group !== group) throw new Error(`headToHead86.longSearch: the state is of group ${J(state.group)}, not ${J(group)}`);
    const r = X36.longSearch(seed, base, start, { ...opts, state: state ? { ...state, group: base } : null, save: save ? (s) => save({ ...s, group }) : null });
    return { ...r, group };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the best held-out penalised value of the four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.U02, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "U02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead86.champion: group U02 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 14 arms as { id: arm }: `h27` = { laws: [q02] }; `old` = { s02: H32's champion network (1800 weights of s02_26011), v02: [H36's four last-checkpoint networks in seed order] }; `fresh` = { nets: [the four new networks in seed order] }. */
export function armsOf(wip, h27, old, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead86.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead86.armsOf: h27 is { laws: [the 4-weight law of 0.02] }");
    if (!old || !wOk(old.s02) || !Array.isArray(old.v02) || old.v02.length !== 4 || !old.v02.every(wOk)) throw new Error("headToHead86.armsOf: old is { s02: one 963-weight vector, v02: four 963-weight vectors }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead86.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]), s02_26011: netArm("s02_26011", old.s02) };
    O_IDS.forEach((id, i) => { out[id] = netArm(id, old.v02[i]); }); N_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 14; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, old, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, h36 = null, earlier = null, startVal = null, startVal32 = null, probe = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, old, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead86.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, old, fresh, search, original, h32, h36, earlier, startVal, startVal32, probe, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the 72 train ids at 0.02 (the first parent's value in every search). */
export const startVal = X36.startVal;
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b, p = PRICE) => penPair(au, a, b, p);
/** An arm's mean penalised priced score at a price (default 0.02) over the audit ids. */
export const penMean = (au, a, p = PRICE) => avg(penRunsAt(au, a, p).map((r) => r.score));
/** An arm's mean power in kW over the audit ids: the mean of its dark and lit mean powers. */
export const meanPower = (au, a) => (avg(au.dark[a].map((r) => r.watts)) + avg(au.lit[a].map((r) => r.watts))) / 2000;
/** The arm id of the group champion at the last checkpoint, and H36's champion (H36's rule on its stored search: seed 26012). */
export const champArm = (au) => "u02_" + champion(au.search, LAST).seed;
export const champ36 = (au) => "v02_" + X36.champion(au.h36.search, LAST).seed;
/** H32's champion's generalisation gap at 1800 (train minus held-out value of the champion of its stored search). */
export const gap32 = (au) => { const k = X32.champion(au.h32.search, 1800); return k.trainScore - k.heldScore; };
const sd = (xs) => { const m = avg(xs); return Math.sqrt(xs.reduce((p, q) => p + (q - m) ** 2, 0) / (xs.length - 1)); };
/** The group comparison: { diff, se, within } for the mean audit value of the new four minus H36's four (se = sqrt of the sum of the two groups' variances of four, each over four; within = |diff| <= 2 se). */
export function groupDiff(au) {
    const a = N_IDS.map((id) => penMean(au, id)), b = O_IDS.map((id) => penMean(au, id)), se = Math.sqrt(sd(a) ** 2 / 4 + sd(b) ** 2 / 4), diff = avg(a) - avg(b);
    return { diff, se, within: Math.abs(diff) <= 2 * se };
}
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const c = champArm(au), c36 = champ36(au), rd = (b) => word(pen(au, c, b).reading), lost = N_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`), k = champion(au.search, LAST);
    const nb = (ids) => ids.filter((a) => pen(au, a, "c02").reading !== "WORSE").length, d = groupDiff(au);
    return [`THE NEW CHAMPION ${rd("c02")} C02`, `THE NEW CHAMPION ${rd("q02")} Q02`, `THE NEW CHAMPION ${rd(c36)} H36'S CHAMPION`, `THE NEW CHAMPION ${rd("s02_26011")} H32'S CHAMPION`, `NOT BEHIND C02: NEW ${nb(N_IDS)} OF 4, H36 ${nb(O_IDS)} OF 4`, `LOST SUBS IN THE NEW NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `NEW MINUS H36 MEAN AUDIT VALUE: ${d.diff.toFixed(4)} (se ${d.se.toFixed(4)}); WITHIN 2 SE OF ZERO: ${d.within ? "YES" : "NO"}`, `THE NEW CHAMPION'S GAP IS SMALLER THAN H32'S: ${k.trainScore - k.heldScore < gap32(au) ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from wip and from H36's champion. */
export const distances = (au) => N_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1P36: l1(au.fresh.nets[i], au.old.v02[1]) }));
/** The generalisation gap (train minus held-out value) of the new champion at each checkpoint, of every seed at the last checkpoint, and of H36's champion and H32's champion at their last. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore;
    return { champ: CHECKPOINTS.map((it) => g(champion(au.search, it))), seeds: SEEDS.U02.map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === "U02"), LAST))), h36: g(X36.champion(au.h36.search, LAST)), h32: gap32(au) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", "s02_26011", ...O_IDS, ...N_IDS], PR = [0.005, 0.02, 0.04], priceRow = (a, f) => `${a} ${PR.map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au), c36 = champ36(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "U02").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted} cross ${k.crossAccepted} div ${k.diversity.toFixed(2)}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `U02 champion ${gp.champ.map((x) => x.toFixed(4)).join(" / ")} at generations 56 / 75 / 94 / 112; each seed at 112 ${SEEDS.U02.map((s, i) => `${s} ${gp.seeds[i].toFixed(4)}`).join(", ")} (H36's champion at 112 ${gp.h36.toFixed(4)}; H32's champion at 1800 ${gp.h32.toFixed(4)})`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairsAt = (p) => [...["c02", "q02", c36, "s02_26011"].map((b) => `${c} minus ${b} at ${p} ${fmt(pen(au, c, b, p))}`), ...N_IDS.map((a) => `${a} minus c02 at ${p} ${fmt(pen(au, a, "c02", p))}`)];
    const rank = [...O_IDS, ...N_IDS].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1P36.toFixed(2)} from H36's champion`).join("; ");
    const power = ["autopilot", "c02", "q02", "s02_26011", ...O_IDS, ...N_IDS].map((a) => `${a} ${meanPower(au, a).toFixed(2)}`).join(", ");
    const grp = (ids) => { const v = ids.map((a) => penMean(au, a)); return `mean ${avg(v).toFixed(4)}, min ${Math.min(...v).toFixed(4)}, max ${Math.max(...v).toFixed(4)}`; };
    const divs = au.search.filter((r) => r.group === "U02").map((r) => `${r.seed} ${r.checkpoints[r.checkpoints.length - 1].diversity.toFixed(2)}`).join(", ");
    return [
        `SEARCH U02 (the first parent's start value on the 72 train ids, then train / held-out penalised value, accepted offspring, accepted by crossover and parent diversity (mean pairwise L1) at each checkpoint): ${search}`,
        `RESUMES: ${au.search.filter((r) => r.group === "U02").map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at generation 112 is ${c} (the best on the audit: ${[...N_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]}); H36's champion is ${c36}`,
        `GENERALISATION GAP (train value minus held-out value): ${gaps}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `POWER (mean of the dark and lit mean powers, kW): ${power}`,
        `EXTRA POWER (mean of dark and lit extra kW over the autopilot): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED AT 0.02 (penalised priced score): ${pairsAt(0.02).join("; ")}`,
        `PAIRED AT 0.005 (REPORTED): ${pairsAt(0.005).join("; ")}`,
        `PAIRED AT 0.04 (REPORTED): ${pairsAt(0.04).join("; ")}`,
        `GROUPS (audit mean of the four networks of each group at 0.02): NEW ${grp(N_IDS)}; H36 ${grp(O_IDS)}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; audit means at 0.02 in rank order ${rank}; parent diversity at generation 112 ${divs}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
const idsOf = (r) => r.to - r.from + 1;
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
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.U02.every((q) => s.filter((r) => r.group === "U02" && r.seed === q).length === 1) && s.every((r) => r.group === "U02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && SEEDS.U02.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(cpOf(s.find((r) => r.seed === q), LAST).weights)) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 population searches (the four seeds of U02), each with checkpoints after generations 56, 75, 94 and 112 of 963 finite weights, and the 4 flown networks are the seeds' generation-112 best parents in seed order: ${!!counted}` });
    const pb = au.probe, probeOk = !!pb && pb.evaluations === 1793 && Array.isArray(pb.perGeneration) && pb.perGeneration.length === 112 && pb.perGeneration.every((x) => x === 16) && J(pb.checkpointGenerations) === "[56,75,94,112]" && pb.heldFlights === 4;
    rows.push({ name: "THE EVALUATION COUNTS ARE AS REGISTERED", ok: probeOk, text: `a scripted search counted by its flights makes 1793 train evaluations (the first parent's and 16 a generation over 112 generations: 1792 candidates) with held-out flights at the four checkpoints (generations 56, 75, 94, 112): ${probeOk}` });
    const first = !!counted && Number.isFinite(au.startVal) && Number.isFinite(au.startVal32) && au.startVal === au.startVal32 && s.every((r) => r.startTrain === au.startVal) && !!au.h36 && Array.isArray(au.h36.search) && au.h36.search.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST PARENT IS WIP ON THE 72 IDS", ok: first, text: `every search's first parent has exactly wip's penalised value on the 72 train ids at 0.02 (computed in this round), which equals H32's and H36's stored values to the last digit: ${first}` });
    const bestAt = (() => { try { const c = champion(s, LAST); return s.every((r) => c.heldScore >= cpOf(r, LAST).heldScore) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), LAST).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT PENALISED OF THE FOUR AT GENERATION 112", ok: !!(counted && bestAt), text: `the group champion at generation 112 has the largest held-out penalised value of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const cnt = !!counted && s.every((r) => r.checkpoints.every((k, i) => isInt(k.accepted, 0, k.iter * LAMBDA) && isInt(k.crossAccepted, 0, k.accepted) && Number.isFinite(k.diversity) && k.diversity >= 0 && (i === 0 || (k.accepted >= r.checkpoints[i - 1].accepted && k.crossAccepted >= r.checkpoints[i - 1].crossAccepted))));
    rows.push({ name: "THE ACCEPTED COUNTS ARE CONSISTENT", ok: !!cnt, text: `every checkpoint's accepted count is at most 16 times its generation, its crossover count at most its accepted count, both never fall from one checkpoint to the next, and the diversity is not negative: ${!!cnt}` });
    const h = au.h36, h3 = au.h32, ol = au.old, stored = !!h && Array.isArray(h.search) && !!h3 && Array.isArray(h3.search) && !!ol && Array.isArray(ol.v02) && ol.v02.length === 4 && (() => { try { const a = X36.champion(h.search, LAST); return X36.SEEDS.V02.every((q, i) => J(Array.from(ol.v02[i])) === J(cpOf(h.search.find((r) => r.group === "V02" && r.seed === q), LAST).weights)) && a.seed === 26012 && J(Array.from(ol.s02)) === J(Array.from(X32.champion(h3.search, 1800).weights)) && X32.champion(h3.search, 1800).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE FLOWN OLD NETWORKS ARE THE STORED ONES", ok: !!stored, text: `v02_26011 to v02_26014 are the generation-112 weights of H36's stored search (v02_26012 its champion by H36's rule) and s02_26011 is the champion of H32's stored search by H32's rule: ${!!stored}` });
    const o = au.original, k = au.h27, reg = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint and q02 is the champion law of H27's stored Q02 search by H27's rule: ${!!reg}` });
    const trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && idsOf(TRAIN[0]) === 24 && idsOf(TRAIN[1]) === 48;
    const dj = trainOk && [...TRAIN, HELD].every((q) => disjoint(q, au.range)) && au.range.from > EARLIER_AUDIT;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the 72 train ids (26000-26023 and 30000-30047) or the held-out ids 26100-26139, and start after H85's audit (${EARLIER_AUDIT}): ${dj}` });
    const seedsOk = J(SEEDS.U02) === "[39001,39002,39003,39004]" && Array.isArray(au.earlier) && SEEDS.U02.every((q) => !au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.U02.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE 39001-39004 AND NEW", ok: seedsOk, text: `the four seeds are 39001-39004 and none of them is in any earlier round's stored search: ${seedsOk}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H86: a different seed set (H36's (4+16) population search at 0.02, group U02, new seeds 39001-39004: 112 generations of 16 offspring = 1792 candidate evaluations, checkpoints after generations 56 / 75 / 94 / 112). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
