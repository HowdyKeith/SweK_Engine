// WebGLEngine/tools/ship/headToHead28.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead28Cmd.mjs; the gate is tools/ship/headToHead28-selfcheck.mjs)
//
// ROUND H28 of brain/HEAD_TO_HEAD.md (registered before this file existed): THE PENALISED NETWORK SEARCH FROM TWO OTHER STARTS. H27's penalised network search (963 weights, (1+1)-ES of 600 iterations, a lost run scores 0) is
// rerun from ACT (brain/pilotSubWeightsActuatorsWip.json) and HND (the policy's handWeights()) instead of network-Wip; only the start changes. 24 searches (6 groups of 4 seeds), champions by held-out penalised value,
// audited on 200 fresh ids with c02, wip and H27's q and m champions. Reads nothing from disk (the command hands in the weights and H27's stored result).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X27 from "./headToHead27.mjs";

export const IDS = Object.freeze({ from: 28200, to: 28399 }), SECONDS = X27.SECONDS, PRICES = X27.PRICES, WEIGHT_COUNT = X27.WEIGHT_COUNT;
export const TRAIN = X27.NET_TRAIN, HELD = X27.NET_HELD, ITERS = X27.NET_ITERS, LAW_C02 = X27.LAW_C02;
export const ACT_GROUPS = Object.freeze(["A005", "A02", "A04"]), HND_GROUPS = Object.freeze(["H005", "H02", "H04"]), GROUPS = Object.freeze([...ACT_GROUPS, ...HND_GROUPS]);
export const SEEDS = Object.freeze({ A005: [28001, 28002, 28003, 28004], A02: [28011, 28012, 28013, 28014], A04: [28021, 28022, 28023, 28024], H005: [28031, 28032, 28033, 28034], H02: [28041, 28042, 28043, 28044], H04: [28051, 28052, 28053, 28054] });
export const LAMBDAS = Object.freeze({ A005: 0.005, A02: 0.02, A04: 0.04, H005: 0.005, H02: 0.02, H04: 0.04 });
/** The registered fingerprints (count, sum, sum of squares) of the three starts. */
export const FINGERPRINTS = Object.freeze({ ACT: Object.freeze({ count: 963, sum: -2.21805099141784, sumsq: 289.3828709763427 }), HND: Object.freeze({ count: 963, sum: 0, sumsq: 248.71788106166872 }), WIP: X27.WIP_FINGERPRINT });
export const A_IDS = Object.freeze(["a005", "a02", "a04"]), H_IDS = Object.freeze(["h005", "h02", "h04"]), Q_IDS = Object.freeze(["q005", "q02", "q04"]), M_IDS = Object.freeze(["m005", "m02", "m04"]);
export const NEW_IDS = Object.freeze([...A_IDS, ...H_IDS]);
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "wip", ...Q_IDS, ...M_IDS, ...NEW_IDS]);
export const fingerprint = X27.fingerprint, netArm = X27.netArm, penObjective = X27.penObjective, penScore = X27.penScore;
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
const wOk = (w) => (Array.isArray(w) || ArrayBuffer.isView(w)) && w.length === WEIGHT_COUNT && Array.from(w).every(Number.isFinite);
const startNameOf = (g) => (ACT_GROUPS.includes(g) ? "ACT" : "HND");
/** One network search of group `g` from `start`: H27's search exactly (its loop, its objective), run under the group's own price; { seed, group, weights, startTrain, trainScore, heldScore, accepted, iters, changed, lostFlights }. */
export function netSearch(seed, group, start, opts = {}) {
    if (!GROUPS.includes(group)) throw new Error(`headToHead28: the group must be one of ${GROUPS.join(", ")}, got ${JSON.stringify(group)}`);
    return { ...X27.netSearch(seed, "M" + group.slice(1), start, opts), group };
}
/** The champion of a group (four seeds): the best held-out PENALISED value, the first of a tie in seed order. */
export function champion(rows, group) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1)) throw new Error(`headToHead28.champion: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s); if (b === null || r.heldScore > b.heldScore) b = r; } return b;
}
/** The 16 arms as { id: arm }. `wip`: Wip's weights; `h27` = { laws: [q005, q02, q04], nets: [m005, m02, m04] }; `fresh` = { nets: [a005, a02, a04, h005, h02, h04] }. */
export function armsOf(wip, h27, fresh) {
    if (!wOk(wip)) throw new Error(`headToHead28.armsOf: wip must be ${WEIGHT_COUNT} finite weights`);
    if (!h27 || !Array.isArray(h27.laws) || h27.laws.length !== 3 || !h27.laws.every((w) => Array.isArray(w) && w.length === 4 && w.every(Number.isFinite)) || !Array.isArray(h27.nets) || h27.nets.length !== 3 || !h27.nets.every(wOk) || !fresh || !Array.isArray(fresh.nets) || fresh.nets.length !== 6 || !fresh.nets.every(wOk)) throw new Error("headToHead28.armsOf: h27 is { laws: three 4-weight laws, nets: three 963-weight vectors } and fresh is { nets: six 963-weight vectors }");
    const out = { autopilot: B.flyingArms({})[0], law0: H16.lawArm("law0", [0, 0, 0, 0]), c02: H16.lawArm("c02", LAW_C02), wip: netArm("wip", wip) };
    Q_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, h27.laws[i]); }); M_IDS.forEach((id, i) => { out[id] = netArm(id, h27.nets[i]); }); NEW_IDS.forEach((id, i) => { out[id] = netArm(id, fresh.nets[i]); });
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 16; the autopilot is always flown) on `range` ids, dark and lit. */
export function audit(wip, h27, fresh, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null, original = null, fixture = null, startVals = null, starts = null } = {}) {
    const all = armsOf(wip, h27, fresh), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead28.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, wip, h27, fresh, search, original, fixture, startVals, starts, c02: all.c02.entry().weights };
}
/** The penalised train value of each start at each price (the first scored candidate of every search): { ACT: {price: value}, HND: {...} }. */
export function startVals(starts, { seconds = SECONDS, flyFn = H15.fly } = {}) {
    const out = {}; for (const n of ["ACT", "HND"]) { out[n] = {}; for (const p of PRICES) out[n][p] = penObjective(netArm("net", starts[n]), TRAIN, p, seconds, flyFn); } return out;
}
export const fixtureOf = X27.fixtureOf;
// ---- the readings
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, scoreMean = H15.meanOf, extraPower = X27.extraPower;
export const penRunsAt = X27.penRunsAt, penGainAt = X27.penGainAt, penPair = X27.penPair, unpenGainAt = X27.unpenGainAt, lostBoth = X27.lostBoth;
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
/** The new champion with the larger audit penalised priced gain at price index i (the first of a tie: a). */
export const betterNew = (au, i) => (penGainAt(au, H_IDS[i], PRICES[i]) > penGainAt(au, A_IDS[i], PRICES[i]) + 1e-12 ? H_IDS[i] : A_IDS[i]);
/** The registered verdict, fourteen parts joined by "; ". */
export function verdictOf(au) {
    const lost = NEW_IDS.filter((a) => lostBoth(au, a) > 0).map((a) => `${a} ${lostBoth(au, a)}`);
    const rep = [["ACT", A_IDS[2]], ["HND", H_IDS[2]]].filter(([, a]) => penPair(au, a, "c02", 0.04).reading === "BETTER").map(([n]) => n);
    return [...PRICES.map((p, i) => `AT ${p} THE ACT NETWORK ${word(penPair(au, A_IDS[i], M_IDS[i], p).reading)} THE WIP NETWORK`),
        ...PRICES.map((p, i) => `AT ${p} THE HND NETWORK ${word(penPair(au, H_IDS[i], M_IDS[i], p).reading)} THE WIP NETWORK`),
        ...PRICES.map((p, i) => `AT ${p} THE BETTER OF THE NEW NETWORKS ${word(penPair(au, betterNew(au, i), Q_IDS[i], p).reading)} THE LAW OF THE PRICE`),
        ...PRICES.map((p, i) => `AT ${p} THE BETTER OF THE NEW NETWORKS ${word(penPair(au, betterNew(au, i), "c02", p).reading)} C02`),
        `LOST SUBS IN THE NEW CHAMPIONS: ${lost.length ? lost.join(", ") : "NONE"}`, `M04'S LEAD OVER C02 AT 0.04 REPRODUCES FROM ${rep.length ? rep.join(", ") : "NEITHER"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, g) => (au.search || []).filter((r) => r.group === g);
const meanThrust = (au, a) => avg(au.dark[a].map((r) => r.thrust));
const l1 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
const changedFrom = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
/** Per new champion (a005 .. h04): how far its weights sit from its start and from wip: { id, group, l1Start, changedStart, l1Wip }. */
export function distances(au) {
    return NEW_IDS.map((id, i) => { const g = GROUPS[i], w = au.fresh.nets[i], s = au.starts[startNameOf(g)]; return { id, group: g, l1Start: l1(w, s), changedStart: changedFrom(w, Float32Array.from(s)), l1Wip: l1(w, au.wip) }; });
}
/** Per group: the spread (largest minus smallest) of the four held-out penalised values. */
export const spreadOf = (au) => GROUPS.map((g) => { const h = rowsOf(au, g).map((r) => r.heldScore); return { group: g, spread: Math.max(...h) - Math.min(...h) }; });
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "wip", ...Q_IDS, ...M_IDS, ...NEW_IDS], priceRow = (a, f) => `${a} ${PRICES.map((p) => f4(f(au, a, p))).join(" / ")}`;
    const ch = (g) => champion(au.search, g);
    const arm = (a) => `${a} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}, ${kwOf(au, a).toFixed(2)} kW, thrust ${meanThrust(au, a).toFixed(2)}`;
    const losses = GROUPS.map((g) => `${g}: ${rowsOf(au, g).map((r) => `${r.seed} (${r.lostFlights} lost-flights)`).join(", ")}`).join("; ");
    const pairs = [...PRICES.map((p, i) => `${A_IDS[i]} minus ${M_IDS[i]} at ${p} ${fmt(penPair(au, A_IDS[i], M_IDS[i], p))}`), ...PRICES.map((p, i) => `${H_IDS[i]} minus ${M_IDS[i]} at ${p} ${fmt(penPair(au, H_IDS[i], M_IDS[i], p))}`),
        ...PRICES.map((p, i) => `${betterNew(au, i)} minus ${Q_IDS[i]} at ${p} ${fmt(penPair(au, betterNew(au, i), Q_IDS[i], p))}`), ...PRICES.map((p, i) => `${betterNew(au, i)} minus c02 at ${p} ${fmt(penPair(au, betterNew(au, i), "c02", p))}`),
        ...NEW_IDS.map((a, i) => `${a} minus c02 at ${PRICES[i % 3]} ${fmt(penPair(au, a, "c02", PRICES[i % 3]))}`)];
    const dist = distances(au).map((d) => `${d.id} L1 ${d.l1Start.toFixed(2)} from its start (${d.changedStart} weights changed), ${d.l1Wip.toFixed(2)} from wip`).join("; ");
    return [
        `LOSSES IN THE SEARCHES (flights with a lost run, among the search's evaluations): ${losses}`,
        `SEARCH NETWORKS: ${GROUPS.map((g) => `${g} champion seed ${ch(g).seed}, train ${ch(g).startTrain.toFixed(4)} -> ${ch(g).trainScore.toFixed(4)}, held ${ch(g).heldScore.toFixed(4)}, ${ch(g).changed} weights changed`).join("; ")}`,
        `AUDIT (dark / lit mean score, dark mean power, mean dark thrust): ${shown.map(arm).join("; ")}`,
        `LOST (runs lost of 400): ${ARM_IDS.slice(1).map((a) => `${a} ${lostBoth(au, a)}`).join(", ")}`,
        `EXTRA POWER (mean of dark and lit extra kW): ${shown.slice(1).map((a) => `${a} ${f2(extraPower(au, a))}`).join("; ")}`,
        `PENALISED PRICED GAIN (at ${PRICES.join(" / ")}): ${shown.slice(1).map((a) => priceRow(a, penGainAt)).join("; ")}`,
        `PAIRED (penalised priced score; the last six each at its own price): ${pairs.join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `REPORTED, NOT IN THE VERDICT: distances ${dist}; spread of the four held-out values in each group ${spreadOf(au).map((s) => `${s.group} ${s.spread.toFixed(4)}`).join(", ")}; unpenalised priced gain ${shown.slice(1).map((a) => priceRow(a, unpenGainAt)).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, J = JSON.stringify, near = (a, b) => Math.abs(a - b) < 1e-9;
const fpIs = (w, f) => { const x = fingerprint(w); return x.count === f.count && near(x.sum, f.sum) && near(x.sumsq, f.sumsq); };
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
    const s = au.search, st = au.starts;
    const counted = Array.isArray(s) && s.length === 24 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => GROUPS.includes(r.group) && wOk(r.weights)) && !!au.fresh && Array.isArray(au.fresh.nets) && au.fresh.nets.length === 6 && au.fresh.nets.every(wOk) && wOk(au.wip);
    rows.push({ name: "24 SEARCHES, EACH SEED ONCE, OF 963 FINITE WEIGHTS", ok: counted, text: `24 network searches (four seeds in each of six groups) of 963 finite weights, and the 6 champions: ${counted}` });
    const fp = !!st && wOk(st.ACT) && wOk(st.HND) && fpIs(st.ACT, FINGERPRINTS.ACT) && fpIs(st.HND, FINGERPRINTS.HND) && wOk(au.wip) && fpIs(au.wip, FINGERPRINTS.WIP);
    rows.push({ name: "THE THREE STARTS ARE THE REGISTERED ONES", ok: fp, text: `ACT, HND and wip have the registered fingerprints (count, sum, sum of squares to 1e-9): ${fp}` });
    const sv = au.startVals, first = counted && !!sv && s.every((r) => r.startTrain === sv[startNameOf(r.group)][LAMBDAS[r.group]]);
    rows.push({ name: "THE FIRST SCORED CANDIDATE IS THE START", ok: first, text: `every search's first scored candidate has exactly its start's penalised train value at the group's price (ACT in A, HND in H): ${first}` });
    const earlier = { from: 22200, to: 27399 }, dj = [TRAIN, HELD].every((a, i, all) => disjoint(a, au.range) && all.every((b, j) => i === j || disjoint(a, b))) && disjoint(au.range, earlier);
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap, and the audit ids are past every earlier audit (22200-27399): ${dj}` });
    const bestIn = (g, w) => Array.isArray(s) && rowsOf(au, g).length > 0 && rowsOf(au, g).some((r) => J(Array.from(r.weights)) === J(Array.from(w || [])) && r.heldScore === Math.max(...rowsOf(au, g).map((q) => q.heldScore)));
    const champs = !!au.fresh && Array.isArray(au.fresh.nets) && GROUPS.every((g, i) => bestIn(g, au.fresh.nets[i]));
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT PENALISED OF ITS GROUP", ok: champs, text: `each of the six champions is a search of its own group with that group's largest held-out penalised value: ${champs}` });
    const o = au.original, h = au.h27, reg = !!o && Array.isArray(o.search) && !!h && Array.isArray(h.laws) && h.laws.length === 3 && Array.isArray(h.nets) && h.nets.length === 3 && (() => { try { return ["Q005", "Q02", "Q04"].every((g, i) => J(X27.lawChampion(o.search, g).law) === J(h.laws[i])) && ["M005", "M02", "M04"].every((g, i) => J(Array.from(X27.netChampion(o.search, g).weights)) === J(Array.from(h.nets[i]))); } catch (e) { return false; } })() && J(au.c02) === J(LAW_C02);
    rows.push({ name: "C02 AND H27'S CHAMPIONS ARE THE REGISTERED ONES", ok: !!reg, text: `c02 is the registered law and the q and m champions are the champions of H27's stored searches by H27's rule: ${!!reg}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H28: the penalised network search from two other starts. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW; lost runs of 400):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(10)} ${scoreMean(au, a, "dark").toFixed(4)} / ${scoreMean(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}   ${lostBoth(au, a)}`);
    R.push(`per arm: dark / lit gain over the autopilot, extra power (kW, dark / lit), penalised priced gain at ${PRICES.join(" / ")}:`);
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(10)} ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}  ${f3(extraKw(au, a))} / ${f3(extraKw(au, a, "lit"))}  ${PRICES.map((p) => f4(penGainAt(au, a, p))).join(" / ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
