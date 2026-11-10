// WebGLEngine/tools/ship/headToHead39.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead39Cmd.mjs; the gate is tools/ship/headToHead39-selfcheck.mjs)
//
// ROUND H39 of brain/HEAD_TO_HEAD.md (registered before this file existed): A DIFFERENT MUTATION STEP SIZE. H32's search (the 963 weights of network-Wip, the (1+1)-ES, PS.mutate of 1 to 4 weights, H27's penalised priced objective at 0.02 on the 72 train ids, H28's flyPen, 160 s, 1800 iterations, checkpoints at
// 900 / 1200 / 1500 / 1800, resumable) called with ONLY the step size changed: group A02 at sigma 0.1 and group B02 at sigma 0.9, H32's four seeds each (H32's sigma is 0.3). The search is X32.longSearch with the sigma handed in and the group relabelled; every state it saves carries the group's label and sigma, and a state whose
// label or sigma is not the group's is refused on load. A champion per group and checkpoint by held-out value; the eight 1800-iteration networks are audited each by itself on 200 fresh ids against c02, the law of the price and H32's four sigma-0.3 networks. Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X30 from "./headToHead30.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 40200, to: 40399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, MAXK = X30.MAXK, H32_SIGMA = X30.SIGMA;
export const ITERS = X32.ITERS, CHECKPOINTS = X32.CHECKPOINTS, STATE_EVERY = X32.STATE_EVERY;
export const GROUPS = Object.freeze(["A02", "B02"]), SEEDS = Object.freeze({ A02: [26011, 26012, 26013, 26014], B02: [26011, 26012, 26013, 26014] }), SIGMAS = Object.freeze({ A02: 0.1, B02: 0.9 });
export const S_IDS = Object.freeze(SEEDS.A02.map((s) => "s02_" + s)), A_IDS = Object.freeze(SEEDS.A02.map((s) => "a02_" + s)), B_IDS = Object.freeze(SEEDS.B02.map((s) => "b02_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", ...S_IDS, ...A_IDS, ...B_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen, saveStateAtomic = X32.saveStateAtomic, generatorAfter = X32.generatorAfter;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const need = (group) => { if (!GROUPS.includes(group)) throw new Error(`headToHead39: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`); return SIGMAS[group]; };
/** Reads and validates a state file of a search of `ctx.group` (null when there is none): H32's validation, and the state must carry this group's label and sigma. */
export function loadState(io, file, ctx = {}) {
    const group = ctx.group, sigma = need(group);
    if (!io.existsSync(file)) return null;
    let s; try { s = JSON.parse(io.readFileSync(file, "utf8")); } catch (e) { throw new Error(`headToHead39.loadState: ${file} is not JSON (${String(e.message).slice(0, 80)})`); }
    const { group: g, ...rest } = ctx; X32.validateState(s, { iters: ITERS, checkpoints: CHECKPOINTS, ...rest, group: "S02" });
    if (s.label !== group) throw new Error(`headToHead39.loadState: the state is of group ${J(s.label)}, not ${J(group)}`);
    if (s.sigma !== sigma) throw new Error(`headToHead39.loadState: the state's step size is ${J(s.sigma)}, not ${sigma}`);
    return s;
}
/**
 * One RESUMABLE search of `group` (A02 at sigma 0.1 or B02 at sigma 0.9) from `start`: X32.longSearch with the group's sigma (`opts.sigma` overrides it, for the gate) and the group relabelled; every saved state carries { label: group, sigma }, and a state handed in must carry them.
 * Returns what X32.longSearch returns with group, and { sigma }.
 */
export function longSearch(seed, group, start, { sigma = null, save = null, state = null, ...opts } = {}) {
    const sg = sigma === null ? need(group) : (need(group), sigma);
    if (state && (state.label !== group || state.sigma !== sg)) throw new Error(`headToHead39.longSearch: the state is of group ${J(state.label)} at step size ${J(state.sigma)}, not ${J(group)} at ${sg}`);
    const r = X32.longSearch(seed, "S02", start, { ...opts, sigma: sg, state, save: save ? (s) => save({ ...s, label: group, sigma: sg }) : null });
    return { ...r, group, sigma: sg };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of `group` at a checkpoint: the best held-out penalised value of its four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, group, iter) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) && seeds ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || !CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead39.champion: group ${group} needs one search for each of the seeds ${seeds ? seeds.join(", ") : "(none: no such group)"}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
const LAST = CHECKPOINTS[CHECKPOINTS.length - 1];
/** The 16 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [H32's four 1800-iteration networks in seed order] }; `fresh` = { A02: [four small-step networks], B02: [four large-step networks] } in seed order. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead39.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead39.armsOf: h27 is { laws: one 4-weight law }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 4 || !s32.nets.every(wOk)) throw new Error("headToHead39.armsOf: s32 is { nets: four 963-weight vectors }");
    for (const g of GROUPS) if (!fresh || !Array.isArray(fresh[g]) || fresh[g].length !== 4 || !fresh[g].every(wOk)) throw new Error(`headToHead39.armsOf: fresh.${g} is four 963-weight vectors`);
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]) };
    S_IDS.forEach((id, i) => { out[id] = netArm(id, s32.nets[i]); }); A_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.A02[i]); }); B_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.B02[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 16; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, h32 = null, earlier = null, startVal = null, startVal32 = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead39.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, h32, earlier, startVal, startVal32, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the 72 train ids at 0.02 (the first parent of every search). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => X32.startVal(wip, { seconds, flyFn, train });
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
/** The arm id of a group's champion at 1800 (a02_<seed> or b02_<seed>). */
export const champArm = (au, group) => (group === "A02" ? "a02_" : "b02_") + champion(au.search, group, LAST).seed;
/** The twin counts: each a02_<seed> (or b02_<seed>) against s02_<seed> at 0.02: { ahead, behind, tied }. */
export function twinsOf(au, group) { let ahead = 0, behind = 0, tied = 0; for (const s of SEEDS[group]) { const r = pen(au, (group === "A02" ? "a02_" : "b02_") + s, "s02_" + s).reading; if (r === "BETTER") ahead++; else if (r === "WORSE") behind++; else tied++; } return { ahead, behind, tied }; }
/** The registered verdict, eight parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const a = champArm(au, "A02"), b = champArm(au, "B02"), rd = (x, y) => word(pen(au, x, y).reading), lost = [...A_IDS, ...B_IDS].filter((q) => lostBoth(au, q) > 0).map((q) => `${q} ${lostBoth(au, q)}`), ta = twinsOf(au, "A02"), tb = twinsOf(au, "B02");
    return [`THE SMALL-STEP CHAMPION ${rd(a, "c02")} C02`, `THE LARGE-STEP CHAMPION ${rd(b, "c02")} C02`, `THE SMALL-STEP CHAMPION ${rd(a, "s02_26011")} H32'S CHAMPION`, `THE LARGE-STEP CHAMPION ${rd(b, "s02_26011")} H32'S CHAMPION`, `SMALL-STEP TWINS: ${ta.ahead} AHEAD, ${ta.behind} BEHIND, ${ta.tied} TIED`, `LARGE-STEP TWINS: ${tb.ahead} AHEAD, ${tb.behind} BEHIND, ${tb.tied} TIED`,
        `LOST SUBS IN THE STEP-SIZE NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`, `THE SMALL-STEP CHAMPION ${rd(a, b)} THE LARGE-STEP CHAMPION`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per step-size network: its L1 distance from wip and from its sigma-0.3 twin, group by group: { A02: [{ id, l1Wip, l1Twin }], B02: [...] }. */
export const distances = (au) => ({ A02: A_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.A02[i], au.wip), l1Twin: l1(au.fresh.A02[i], au.s32.nets[i]) })), B02: B_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.B02[i], au.wip), l1Twin: l1(au.fresh.B02[i], au.s32.nets[i]) })) });
/** The generalisation gap (train minus held-out value) of each group's champion at each checkpoint, of every seed at 1800, and H32's champion's at 1800. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore, one = (grp) => ({ champ: CHECKPOINTS.map((it) => g(champion(au.search, grp, it))), seeds: SEEDS[grp].map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === grp), LAST))) }), k = X32.champion(au.h32.search, 1800);
    return { A02: one("A02"), B02: one("B02"), h32: k.trainScore - k.heldScore };
}
/** The accepted counts at 1800 (of 1800 iterations) of each group's searches and of H32's, with their means: { A02: [...], B02: [...], S02: [...], means }. */
export function acceptance(au) {
    const of = (rows, g) => SEEDS[g].map((s) => cpOf(rows.find((r) => r.seed === s && r.group === g), LAST).accepted), a = of(au.search, "A02"), b = of(au.search, "B02"), s02 = X32.SEEDS.S02.map((s) => cpOf(au.h32.search.find((r) => r.seed === s), 1800).accepted);
    return { A02: a, B02: b, S02: s02, means: { A02: avg(a), B02: avg(b), S02: avg(s02) } };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", ...S_IDS, ...A_IDS, ...B_IDS], priceRow = (x, f) => `${x} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, x, p))).join(" / ")}`, a = champArm(au, "A02"), b = champArm(au, "B02");
    const arm = (x) => `${x} ${scoreMean(au, x, "dark").toFixed(4)} / ${scoreMean(au, x, "lit").toFixed(4)}, ${kwOf(au, x).toFixed(2)} kW, thrust ${meanThrust(au, x).toFixed(2)}`;
    const searchOf = (g) => au.search.filter((r) => r.group === g).map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = GROUPS.map((g) => `${g} ${CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, g, it).seed} held ${champion(au.search, g, it).heldScore.toFixed(4)}`).join(", ")}`).join("; ");
    const gp = gapsOf(au), gapText = (g) => `${g} champion ${gp[g].champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800, each seed at 1800 ${SEEDS[g].map((s, i) => `${s} ${gp[g].seeds[i].toFixed(4)}`).join(", ")}`;
    const lostIds = ARM_IDS.slice(1).flatMap((x) => ["dark", "lit"].flatMap((q) => au[q][x].filter((r) => r.bad).map((r) => `${x} ${q} ${r.key}`)));
    const pairs = [...["c02", "q02", "s02_26011", b].map((x) => `${a} minus ${x} at 0.02 ${fmt(pen(au, a, x))}`), ...["c02", "q02", "s02_26011"].map((x) => `${b} minus ${x} at 0.02 ${fmt(pen(au, b, x))}`), ...SEEDS.A02.map((s) => `a02_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "a02_" + s, "s02_" + s))}`), ...SEEDS.B02.map((s) => `b02_${s} minus s02_${s} at 0.02 ${fmt(pen(au, "b02_" + s, "s02_" + s))}`)];
    const rank = [...S_IDS, ...A_IDS, ...B_IDS].map((x) => [x, penMean(au, x)]).sort((p, q) => q[1] - p[1]).map(([x, v]) => `${x} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au), dtext = [...dist.A02, ...dist.B02].map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1Twin.toFixed(2)} from its twin`).join("; ");
    const ac = acceptance(au), rate = (xs) => xs.map((x) => (x / ITERS).toFixed(3)).join(" ");
    return [
        `SEARCH A02 (sigma ${SIGMAS.A02}; start value, then train / held-out penalised value and accepted count at each checkpoint): ${searchOf("A02")}`,
        `SEARCH B02 (sigma ${SIGMAS.B02}; the same): ${searchOf("B02")}`,
        `ACCEPTANCE (accepted of 1800 iterations at 1800, as rates, in seed order; mean): A02 sigma 0.1 ${ac.A02.join(" ")} (${rate(ac.A02)}; mean ${(ac.means.A02 / ITERS).toFixed(3)}); H32's sigma 0.3 ${ac.S02.join(" ")} (${rate(ac.S02)}; mean ${(ac.means.S02 / ITERS).toFixed(3)}); B02 sigma 0.9 ${ac.B02.join(" ")} (${rate(ac.B02)}; mean ${(ac.means.B02 / ITERS).toFixed(3)})`,
        `RESUMES: ${au.search.map((r) => `${r.group} ${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champions at 1800 are ${a} and ${b} (the best small-step on the audit: ${[...A_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]}, the best large-step: ${[...B_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]})`,
        `GENERALISATION GAP (train value minus held-out value): ${gapText("A02")}; ${gapText("B02")} (H32's champion at 1800 ${gp.h32.toFixed(4)})`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((x) => `${x} ${lostBoth(au, x)}`).join(", ")}; the lost runs: ${lostIds.length ? lostIds.join(", ") : "none"}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((x) => `${x} ${f2(extraPower(au, x))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at 0.005 / 0.02 / 0.04): ${shown.slice(1).map((x) => priceRow(x, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score at 0.02): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dtext}; audit means in rank order (penalised priced score at 0.02) ${rank}; unpenalised priced gain ${shown.slice(1).map((x) => priceRow(x, unpenGainAt)).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, near = (a, b) => Math.abs(a - b) < 1e-9;
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((q) => ARM_IDS.map((x) => [q, x]));
    const sizes = cells.every(([q, x]) => au[q][x] && au[q][x].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const aligned = cells.every(([q, x]) => au[q][x] && au[q][x].every((r, i) => au[q].autopilot[i] && r.key === au[q].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: aligned, text: `the ids are the same in every arm and condition: ${aligned}` });
    const inside = cells.every(([q, x]) => au[q][x] && au[q][x].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const watts = cells.every(([q, x]) => au[q][x] && au[q][x].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS && Number.isFinite(r.thrust)));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W and every mean thrust finite: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const ident = ["dark", "lit"].every((q) => au[q].law0 && au[q].law0.every((r, i) => au[q].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[q].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && !!fx.real && !!fx.scripted && Number.isFinite(fx.real.pen) && fx.real.pen === fx.real.h21 && Number.isFinite(fx.scripted.pen) && Math.abs(fx.scripted.pen - fx.scripted.expected) < 1e-12;
    rows.push({ name: "PENALISED OBJECTIVE IS H18'S WITHOUT A LOST RUN AND SCORES A LOST RUN 0", ok: fixOk, text: `on real flights with no lost run the penalised objective equals H21's (H18's) to the last digit, and a scripted lost run scores 0 (0.65 expected): ${fixOk}` });
    const s = au.search;
    const counted = Array.isArray(s) && s.length === 8 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && GROUPS.every((g) => Array.isArray(au.fresh[g]) && au.fresh[g].length === 4 && au.fresh[g].every(wOk) && SEEDS[g].every((q, i) => J(Array.from(au.fresh[g][i])) === J(cpOf(s.find((r) => r.group === g && r.seed === q), LAST).weights))) && wOk(au.wip);
    rows.push({ name: "8 SEARCHES, EACH SEED OF EACH GROUP ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `8 network searches (the four seeds of A02 and of B02), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 8 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const steps = SIGMAS.A02 === 0.1 && SIGMAS.B02 === 0.9 && H32_SIGMA === 0.3 && Array.isArray(s) && s.length === 8 && s.every((r) => r.sigma === (r.group === "A02" ? 0.1 : 0.9));
    rows.push({ name: "THE STEP SIZES ARE AS REGISTERED", ok: !!steps, text: `every search record carries its group's sigma (0.1 for A02, 0.9 for B02), and H32's is 0.3: ${!!steps}` });
    const first = !!counted && Number.isFinite(au.startVal) && Number.isFinite(au.startVal32) && au.startVal === au.startVal32 && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST PARENT IS WIP ON THE 72 IDS", ok: first, text: `every search's first parent has exactly wip's penalised value on the 72 train ids at 0.02 (computed in this round), which equals H32's stored value to the last digit: ${first}` });
    const bestAt = (g) => { try { const c = champion(s, g, LAST); return s.every((r) => r.group !== g || r.checkpoints.every((k) => k.iter !== LAST || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.group === g && r.seed === c.seed), LAST).weights); } catch (e) { return false; } };
    rows.push({ name: "EACH GROUP'S CHAMPION IS THE BEST HELD-OUT PENALISED OF ITS FOUR AT 1800", ok: !!(counted && bestAt("A02") && bestAt("B02")), text: `each group's champion at 1800 has the largest held-out penalised value of its four seeds (the first of a tie in seed order): ${!!(counted && bestAt("A02") && bestAt("B02"))}` });
    const h = au.h32, sn = au.s32, nets32 = !!h && Array.isArray(h.search) && !!sn && Array.isArray(sn.nets) && sn.nets.length === 4 && (() => { try { return X32.SEEDS.S02.every((q, i) => J(Array.from(sn.nets[i])) === J(cpOf(h.search.find((r) => r.seed === q), 1800).weights)) && J(Array.from(sn.nets[0])) === J(Array.from(X32.champion(h.search, 1800).weights)) && X32.champion(h.search, 1800).seed === 26011; } catch (e) { return false; } })();
    rows.push({ name: "THE FOUR S02 ARMS ARE H32'S 1800-ITERATION NETWORKS, S02_26011 ITS CHAMPION", ok: !!nets32, text: `s02_26011 to s02_26014 are the weights at 1800 of the four searches of H32's stored result, and s02_26011 is H32's champion by H32's rule: ${!!nets32}` });
    const o = au.original, k = au.h27, regc = !!o && Array.isArray(o.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP AND Q02 ARE THE REGISTERED ONES", ok: !!regc, text: `c02 is the registered law, wip has the shipped fingerprint and q02 is the champion law of H27's stored search: ${!!regc}` });
    const seedsOk = J(SEEDS.A02) === J(X32.SEEDS.S02) && J(SEEDS.B02) === J(X32.SEEDS.S02) && Array.isArray(au.earlier) && SEEDS.A02.every((q) => au.earlier.includes(q)) && Array.isArray(s) && s.every((r) => SEEDS.A02.includes(r.seed));
    rows.push({ name: "THE SEEDS ARE H32'S FOUR", ok: seedsOk, text: `the four seeds of each group are 26011-26014, H32's, and H32's stored search holds all four: ${seedsOk}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48;
    const dj = trainOk && [...TRAIN, HELD].every((q) => disjoint(q, au.range)) && au.range.from > 39399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the audit ids do not overlap the 72 train ids (26000-26023 and 30000-30047) or the held-out ids 26100-26139, and start after H38's audit (39399): ${dj}` });
    const pf = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pf && !!pf.straight && !!pf.resumed && pf.killedAt === 6 && pf.resumedFrom === 4 && !!pf.config && pf.config.iters === 12 && F(pf.straight) === F(pf.resumed) && J(pf.straight.resumes) === "[]" && J(pf.resumed.resumes) === "[4]" && pf.resumed.draws > 0;
    rows.push({ name: "THE SEARCH IS RESUMABLE: H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the gate shows this search's own: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H39: a different mutation step size (sigma 0.1 in A02 and 0.9 in B02 against H32's 0.3; H32's search otherwise: seeds 26011-26014, 1800 iterations, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const x of ARM_IDS) R.push(`  ${x.padEnd(10)} ${scoreMean(au, x, "dark").toFixed(4)} / ${scoreMean(au, x, "lit").toFixed(4)}   ${kwOf(au, x).toFixed(2)}   ${kwOf(au, x, "lit").toFixed(2)}   ${lostBoth(au, x)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at 0.005 / 0.02 / 0.04:`);
    for (const x of ARM_IDS.slice(1)) R.push(`  ${x.padEnd(10)} ${f4(gainOf(au, x))} / ${f4(gainOf(au, x, "lit"))}  ${f3(extraKw(au, x))} / ${f3(extraKw(au, x, "lit"))}  ${[0.005, 0.02, 0.04].map((p) => f4(penGainAt(au, x, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
