// WebGLEngine/tools/ship/headToHead34.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead34Cmd.mjs; the gate is tools/ship/headToHead34-selfcheck.mjs)
//
// ROUND H34 of brain/HEAD_TO_HEAD.md (registered before this file existed): OTHER SEEDS OF THE 1800-ITERATION SEARCH AT 0.02. H32's resumable search (X32.longSearch, called, not copied) with four seeds no earlier round used (26031-26034, group T02): 1800 iterations from network-Wip on the 72
// train ids at 0.02, checkpoints at 900 / 1200 / 1500 / 1800. The four 1800-iteration networks are flown each by itself, with c02, the law of the price and H32's champion, on 200 fresh ids (34200-34399) at 160 s; the group champion is the best held-out value of the four at 1800.
// Reads and writes nothing itself (the command hands in the weights, the stored results and the file functions).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";
import * as X32 from "./headToHead32.mjs";

export const IDS = Object.freeze({ from: 34200, to: 34399 }), SECONDS = X27.SECONDS, WEIGHT_COUNT = X27.WEIGHT_COUNT, LAW_C02 = X27.LAW_C02, PRICE = 0.02;
export const TRAIN = X32.TRAIN, HELD = X32.HELD, CHECKPOINTS = X32.CHECKPOINTS, ITERS = X32.ITERS;
export const GROUPS = Object.freeze(["T02"]), SEEDS = Object.freeze({ T02: [26031, 26032, 26033, 26034] });
export const T_IDS = Object.freeze(SEEDS.T02.map((s) => "t02_" + s));
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "q02", "s02_1800", ...T_IDS]);
export const fingerprint = X27.fingerprint, WIP_FINGERPRINT = X27.WIP_FINGERPRINT, netArm = X27.netArm, flyPen = X32.flyPen;
export const STATE_VERSION = X32.STATE_VERSION, STATE_EVERY = X32.STATE_EVERY, saveStateAtomic = X32.saveStateAtomic;
const J = JSON.stringify, avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
/** Reads and validates a state file of a T02 search (the state records H32's group label S02, which is what the search runs as). */
export const loadState = (io, file, ctx) => X32.loadState(io, file, { ...ctx, group: "S02" });
/** One resumable search of the group T02: H32's longSearch, with the group relabelled; everything else (state, resume, counting) is H32's. */
export function longSearch(seed, group, start, opts = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead34: the group must be one of ${GROUPS.join(", ")}, got ${J(group)}`);
    return { ...X32.longSearch(seed, "S02", start, opts), group: "T02" };
}
const cpOf = (r, iter) => (r.checkpoints || []).find((q) => q.iter === iter);
/** The champion of the group at a checkpoint: the best held-out penalised value of the four seeds, the first of a tie in seed order; { seed, ...checkpoint }. */
export function champion(rows, iter) {
    const seeds = SEEDS.T02, mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === "T02") : [];
    if (!CHECKPOINTS.includes(iter) || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1) || !mine.every((r) => cpOf(r, iter))) throw new Error(`headToHead34.champion: group T02 needs one search for each of the seeds ${seeds.join(", ")}, each with a checkpoint at ${iter}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s), k = cpOf(r, iter); if (b === null || k.heldScore > b.heldScore) b = { seed: s, ...k }; } return b;
}
/** The 9 arms as { id: arm }: `h27` = { laws: [q02] }; `s32` = { nets: [s02_1800] } (H32's champion); `fresh` = { nets: [the four 1800-iteration networks in seed order] }. */
export function armsOf(wip, h27, s32, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead34.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 1 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite))) throw new Error("headToHead34.armsOf: h27 is { laws: one 4-weight law }");
    if (!s32 || !Array.isArray(s32.nets) || s32.nets.length !== 1 || !s32.nets.every(wOk)) throw new Error("headToHead34.armsOf: s32 is { nets: one 963-weight vector }");
    if (!fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 4 || !fresh.nets.every(wOk)) throw new Error("headToHead34.armsOf: fresh is { nets: four 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), q02: H16.lawArm("q02", h27.laws[0]), s02_1800: netArm("s02_1800", s32.nets[0]) };
    T_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 9; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, s32, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = flyPen, search = null, original = null, earlier = null, startVal = null, startVal32 = null, h32 = null, proof32 = null, fixture = null } = {}) {
    const all = armsOf(wip, h27, s32, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead34.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, s32, fresh, search, original, earlier, startVal, startVal32, h32, proof32, fixture, c02: all.c02.entry().weights };
}
/** Wip's penalised value on the 72 train ids at 0.02 (the first scored candidate of every search). */
export const startVal = (wip, { seconds = SECONDS, flyFn = flyPen, train = TRAIN } = {}) => X32.startVal(wip, { seconds, flyFn, train });
export const fixtureOf = X27.fixtureOf;
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth, penRunsAt = X27.penRunsAt;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const pen = (au, a, b) => penPair(au, a, b, PRICE);
/** An arm's mean penalised priced score at 0.02 over the audit ids. */
export const penMean = (au, a) => avg(penRunsAt(au, a, PRICE).map((r) => r.score));
/** The arm id of the group champion at 1800 (the best held-out value of the four searches). */
export const champArm = (au) => "t02_" + champion(au.search, 1800).seed;
/** The registered verdict, seven parts joined by "; ", every reading at 0.02. */
export function verdictOf(au) {
    const c = champArm(au), rd = (b) => word(pen(au, c, b).reading), lost = T_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`);
    const ok = T_IDS.filter((a) => pen(au, a, "c02").reading !== "WORSE").length, m = T_IDS.map((a) => penMean(au, a)), best = T_IDS.every((a) => penMean(au, c) >= penMean(au, a)), s = penMean(au, "s02_1800");
    return [`THE NEW CHAMPION ${rd("c02")} C02`, `THE NEW CHAMPION ${rd("q02")} THE LAW OF THE PRICE`, `THE NEW CHAMPION ${rd("s02_1800")} H32'S CHAMPION`, `SEEDS NOT BEHIND C02: ${ok} OF 4`, `LOST SUBS IN THE T02 NETWORKS: ${lost.length ? lost.join(", ") : "NONE"}`,
        `THE HELD-OUT PICK IS THE BEST OF THE FOUR ON THE AUDIT: ${best ? "YES" : "NO"}`, `H32'S CHAMPION IS INSIDE THE RANGE OF THE NEW SEEDS: ${s >= Math.min(...m) && s <= Math.max(...m) ? "YES" : "NO"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
/** Per new network: its L1 distance from wip and from H32's 1800-iteration champion. */
export const distances = (au) => T_IDS.map((id, i) => ({ id, l1Wip: l1(au.fresh.nets[i], au.wip), l1S: l1(au.fresh.nets[i], au.s32.nets[0]) }));
/** The generalisation gap (train minus held-out value) of the group champion at each checkpoint, and of every seed at 1800: { champ: [900..1800], seeds: [26031..26034 at 1800] }; and H32's champion's 1800 gap from its stored search. */
export function gapsOf(au) {
    const g = (c) => c.trainScore - c.heldScore;
    return { champ: CHECKPOINTS.map((it) => g(champion(au.search, it))), seeds: SEEDS.T02.map((s) => g(cpOf(au.search.find((r) => r.seed === s && r.group === "T02"), 1800))), h32: g(X32.champion(au.h32.search, 1800)) };
}
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "q02", "s02_1800", ...T_IDS], priceRow = (a, f) => `${a} ${[0.005, 0.02, 0.04].map((p) => f4(f(au, a, p))).join(" / ")}`, c = champArm(au);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const search = au.search.filter((r) => r.group === "T02").map((r) => `${r.seed} [start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}] (${r.lostFlights} lost-flights)`).join(", ");
    const champs = CHECKPOINTS.map((it) => `${it}: seed ${champion(au.search, it).seed} held ${champion(au.search, it).heldScore.toFixed(4)}`).join(", ");
    const gp = gapsOf(au), gaps = `T02 champion ${gp.champ.map((x) => x.toFixed(4)).join(" / ")} at 900 / 1200 / 1500 / 1800; each seed at 1800 ${SEEDS.T02.map((s, i) => `${s} ${gp.seeds[i].toFixed(4)}`).join(", ")} (H32's champion at 1800 ${gp.h32.toFixed(4)})`;
    const lostIds = ARM_IDS.slice(1).flatMap((a) => ["dark", "lit"].flatMap((q) => au[q][a].filter((r) => r.bad).map((r) => `${a} ${q} ${r.key}`)));
    const pairs = [...["c02", "q02", "s02_1800"].map((b) => `${c} minus ${b} at 0.02 ${fmt(pen(au, c, b))}`), ...T_IDS.map((a) => `${a} minus c02 at 0.02 ${fmt(pen(au, a, "c02"))}`), ...T_IDS.map((a) => `${a} minus s02_1800 at 0.02 ${fmt(pen(au, a, "s02_1800"))}`)];
    const rank = [...T_IDS, "s02_1800"].map((a) => [a, penMean(au, a)]).sort((p, q) => q[1] - p[1]).map(([a, v]) => `${a} ${v.toFixed(4)}`).join(", ");
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Wip.toFixed(2)} from wip, ${d.l1S.toFixed(2)} from H32's champion`).join("; ");
    return [
        `SEARCH T02 (start value on the 72 train ids, then train / held-out penalised value and accepted count at each checkpoint): ${search}`,
        `RESUMES: ${au.search.filter((r) => r.group === "T02").map((r) => `${r.seed} ${r.resumes.length ? "resumed from " + r.resumes.join(", ") : "never resumed"}`).join("; ")}`,
        `CHAMPIONS PER CHECKPOINT: ${champs}; the champion at 1800 is ${c} (the best on the audit: ${[...T_IDS].sort((p, q) => penMean(au, q) - penMean(au, p))[0]})`,
        `GENERALISATION GAP (train minus held-out value): ${gaps}`,
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
    const counted = Array.isArray(s) && s.length === 4 && SEEDS.T02.every((q) => s.filter((r) => r.group === "T02" && r.seed === q).length === 1) && s.every((r) => r.group === "T02" && Array.isArray(r.checkpoints) && J(r.checkpoints.map((k) => k.iter)) === J(CHECKPOINTS) && r.checkpoints.every((k) => wOk(k.weights) && Number.isFinite(k.trainScore) && Number.isFinite(k.heldScore))) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 4 && au.fresh.nets.every(wOk) && SEEDS.T02.every((q, i) => J(Array.from(au.fresh.nets[i])) === J(cpOf(s.find((r) => r.seed === q), 1800).weights)) && wOk(au.wip);
    rows.push({ name: "4 SEARCHES, EACH SEED ONCE, EACH WITH FOUR CHECKPOINTS OF 963 FINITE WEIGHTS", ok: !!counted, text: `4 network searches (the four seeds of T02), each with checkpoints at 900, 1200, 1500 and 1800 of 963 finite weights, and the 4 flown networks are the seeds' 1800-iteration weights in seed order: ${!!counted}` });
    const first = !!counted && Number.isFinite(au.startVal) && Number.isFinite(au.startVal32) && au.startVal === au.startVal32 && s.every((r) => r.startTrain === au.startVal);
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS WIP ON THE 72 IDS", ok: first, text: `every search's first scored candidate has exactly wip's penalised value on the 72 train ids at 0.02 (computed in this round), which equals H32's stored value to the last digit: ${first}` });
    const ids = (r) => r.to - r.from + 1, trainOk = TRAIN.length === 2 && J(TRAIN[0]) === J(X27.NET_TRAIN) && ids(TRAIN[0]) === 24 && ids(TRAIN[1]) === 48;
    const dj = trainOk && [...TRAIN, HELD].every((a) => disjoint(a, au.range)) && au.range.from > 33399;
    rows.push({ name: "ID SETS DISJOINT, THE AUDIT PAST EVERY EARLIER ONE", ok: dj, text: `the train ids are H27's 26000-26023 and 30000-30047 (72 in all) and they and the held-out ids do not overlap the audit ids, which start after H33's audit (to 33399): ${dj}` });
    const bestAt = (() => { try { const c = champion(s, 1800); return s.every((r) => r.group !== "T02" || r.checkpoints.every((k) => k.iter !== 1800 || c.heldScore >= k.heldScore)) && J(c.weights) === J(cpOf(s.find((r) => r.seed === c.seed), 1800).weights); } catch (e) { return false; } })();
    rows.push({ name: "THE CHAMPION IS THE BEST HELD-OUT PENALISED OF THE FOUR AT 1800", ok: !!(counted && bestAt), text: `the group champion at 1800 has the largest held-out penalised value of the four seeds (the first of a tie in seed order): ${!!(counted && bestAt)}` });
    const e = au.earlier, newSeeds = Array.isArray(e) && e.length > 0 && e.includes(26011) && SEEDS.T02.every((q) => !e.includes(q));
    rows.push({ name: "THE SEEDS ARE NEW", ok: newSeeds, text: `the four seeds 26031-26034 appear in no stored search of H27, H29, H30, H31 or H32 (their seeds read: ${Array.isArray(e) ? e.length : 0}): ${newSeeds}` });
    const o = au.original, h = au.h32, fx32 = au.s32, k = au.h27;
    const reg = !!o && Array.isArray(o.search) && !!h && Array.isArray(h.search) && !!k && Array.isArray(k.laws) && k.laws.length === 1 && !!fx32 && Array.isArray(fx32.nets) && fx32.nets.length === 1 && (() => { try { return J(X27.lawChampion(o.search, "Q02").law) === J(k.laws[0]) && J(Array.from(X32.champion(h.search, 1800).weights)) === J(Array.from(fx32.nets[0])); } catch (er) { return false; } })() && J(au.c02) === J(LAW_C02) && wOk(au.wip) && near(fingerprint(au.wip).sum, WIP_FINGERPRINT.sum) && near(fingerprint(au.wip).sumsq, WIP_FINGERPRINT.sumsq);
    rows.push({ name: "C02, WIP, Q02 AND S02_1800 ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law, wip has the shipped fingerprint, q02 is the champion law of H27's stored search and s02_1800 is the 1800-iteration champion of H32's stored search by H32's rule: ${!!reg}` });
    const pr = au.proof32, F = (r) => J([r.startTrain, r.lostFlights, r.iters, r.draws, r.finalWeights, r.checkpoints]);
    const proofOk = !!pr && !!pr.straight && !!pr.resumed && pr.killedAt === 6 && pr.resumedFrom === 4 && !!pr.config && pr.config.iters === 12 && F(pr.straight) === F(pr.resumed) && J(pr.straight.resumes) === "[]" && J(pr.resumed.resumes) === "[4]" && pr.resumed.draws > 0;
    rows.push({ name: "THE SEARCH CODE HAS H32'S RESUME PROOF", ok: !!proofOk, text: `H32's stored kill-and-resume pair (12 iterations, killed after iteration 6, resumed from the state at 4) is identical to the straight run, and the searches ran H32's code: ${!!proofOk}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H34: other seeds of the 1800-iteration search at 0.02 (group T02, seeds 26031-26034, checkpoints at 900 / 1200 / 1500 / 1800). Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once, penalised priced score at 0.02`];
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
