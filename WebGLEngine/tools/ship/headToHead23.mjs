// WebGLEngine/tools/ship/headToHead23.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead23Cmd.mjs; the gate is tools/ship/headToHead23-selfcheck.mjs)
//
// ROUND H23 of brain/HEAD_TO_HEAD.md (registered before this file existed): THE LIT TANK ALONE. Two groups of six (1+1)-ES searches of H16's law (H21's box, s in [-4, 2]) whose objective is the LIT tank only (no dropout flight):
// L02 (mean lit score - 0.02 x mean lit kW) and L00 (mean lit score); champions l02 and l00 by held-out lit value; audited on 200 fresh ids, dark and lit, against the autopilot, c02, h16, H21's champion f4, sched*2 and the 8 shipped
// networks, with the verdict read on the lit tank (lit priced score; the plain lit score for the price-free search; the dark score for the transfer). Reads nothing from disk (the command hands the weights and the search rows in).
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";
import * as X from "./headToHead21.mjs";

export const TRAIN = Object.freeze({ from: 23000, to: 23023 }), HELD = Object.freeze({ from: 23100, to: 23139 }), IDS = Object.freeze({ from: 23200, to: 23399 });
export const SECONDS = 160, ITERS = 300, SIGMA_FRAC = 0.1, PRICE = 0.02, FULL_THROTTLE = 0.9, EDGE_FRAC = X.EDGE_FRAC, WEIGHT_NAMES = X.WEIGHT_NAMES;
export const GROUPS = Object.freeze(["L02", "L00"]);
export const SEEDS = Object.freeze({ L02: Object.freeze([23001, 23002, 23003, 23004, 23005, 23006]), L00: Object.freeze([23011, 23012, 23013, 23014, 23015, 23016]) });
export const LAMBDAS = Object.freeze({ L02: 0.02, L00: 0 });
export const BOX = X.BOX, LAW_C02 = X.LAW_C02, LAW_H16 = X.LAW_H16;
export const LAW_F4 = Object.freeze([4.146894976024462, -0.024771079209019692, -0.42984102259826307, -1.628187076881964]);
export const CHAMP_IDS = Object.freeze(["l02", "l00"]), NET8 = X.NET8;
export const ARM_IDS = Object.freeze(["autopilot", "law0", "c02", "h16", "f4", "sched*2", ...CHAMP_IDS, ...NET8]);
const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const checkGroup = (g) => { if (!GROUPS.includes(g)) throw new Error(`headToHead23: the group must be one of ${GROUPS.join(", ")}, got ${JSON.stringify(g)}`); };
export const insideBox = X.insideBox;
/** Whether a weight `w` of index i lies within EDGE_FRAC of the box width of an edge of the box's range for that weight. */
export const atEdge = (w, i) => { const wd = BOX[i][1] - BOX[i][0]; return w <= BOX[i][0] + EDGE_FRAC * wd || w >= BOX[i][1] - EDGE_FRAC * wd; };
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
/** The LIT objective of a law: the mean lit score - lambda x the mean lit power in kW, on `range` ids; ONE flight, lit (no event). */
export function litObjective(w, range, lambda, seconds = SECONDS, flyFn = H15.fly) {
    if (!(lambda >= 0)) throw new Error(`headToHead23.litObjective: the price must be a number of 0 or more, got ${JSON.stringify(lambda)}`);
    const l = flyFn(H16.lawArm("law", w), range, seconds, null);
    return avg(l.map((r) => r.score)) - lambda * avg(l.map((r) => r.watts)) / 1000;
}
/** The fixture of the lit objective: { objective, direct } for c02 on `range` ids at `seconds`: the objective's value and the mean lit score less PRICE x the mean lit kW worked out here from the flight itself. */
export function fixtureOf({ range = { from: HELD.from, to: HELD.from + 3 }, seconds = 40, flyFn = H15.fly } = {}) {
    const l = flyFn(H16.lawArm("c02", LAW_C02), range, seconds, null);
    return { objective: litObjective(LAW_C02, range, PRICE, seconds, flyFn), direct: avg(l.map((r) => r.score)) - PRICE * avg(l.map((r) => r.watts)) / 1000 };
}
/** One (1+1)-ES search of a group from the zero law, all four weights free: one to four weights changed by a Gaussian step of SIGMA_FRAC x the weight's box width (clamped), kept when the TRAIN lit objective is at least the parent's.
 *  Returns { seed, group, law, trainScore, heldScore, accepted, iters, litFlights, darkFlights } (the last two count the flights made, by event). */
export function searchOne(seed, group, { iters = ITERS, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = H15.fly } = {}) {
    checkGroup(group);
    const lambda = LAMBDAS[group], rng = PS.mulberry(seed), counts = { lit: 0, dark: 0 };
    const fly = (arm, range, secs, ev) => { counts[ev === null ? "lit" : "dark"]++; return flyFn(arm, range, secs, ev); };
    let law = [0, 0, 0, 0], best = litObjective(law, train, lambda, seconds, fly), accepted = 0;
    for (let it = 0; it < iters; it++) {
        const m = 1 + Math.floor(rng() * 4), cand = law.slice(), idx = [0, 1, 2, 3];
        for (let j = 0; j < m; j++) { const pick = j + Math.floor(rng() * (4 - j)); [idx[j], idx[pick]] = [idx[pick], idx[j]]; }
        for (let j = 0; j < m; j++) { const i = idx[j]; cand[i] = clampTo(cand[i] + gauss(rng) * SIGMA_FRAC * (BOX[i][1] - BOX[i][0]), BOX[i][0], BOX[i][1]); }
        const sc = litObjective(cand, train, lambda, seconds, fly);
        if (sc >= best) { law = cand; best = sc; accepted++; }
    }
    return { seed, group, law, trainScore: best, heldScore: litObjective(law, held, lambda, seconds, fly), accepted, iters, litFlights: counts.lit, darkFlights: counts.dark };
}
/** The champion of one group among `rows`: the row of the group with the best held-out lit value (the first of a tie in the group's seed order); refuses a group that is not exactly its six registered seeds once each. */
export function championOf(rows, group) {
    const seeds = SEEDS[group], mine = Array.isArray(rows) ? rows.filter((r) => r && r.group === group) : [];
    if (!seeds || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1)) throw new Error(`headToHead23.championOf: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}`);
    let b = null; for (const s of seeds) { const r = mine.find((q) => q.seed === s); if (b === null || r.heldScore > b.heldScore) b = r; } return b;
}
/** The 16 arms as { id: arm } (`nets` = a Map or object id -> 963 numbers; `laws` = [l02, l00] champions' laws). */
export function armsOf(nets, laws) {
    if (!Array.isArray(laws) || laws.length !== 2) throw new Error("headToHead23.armsOf: laws is the two champions' laws (l02, l00)");
    const all = X.armsOf(nets, [LAW_F4.slice(), laws[0], laws[1]]), out = { autopilot: all.autopilot, law0: all.law0, c02: all.c02, h16: all.h16, f4: all.f4, "sched*2": all["sched*2"] };
    CHAMP_IDS.forEach((id, i) => { out[id] = H16.lawArm(id, laws[i]); });
    for (const id of NET8) out[id] = all[id];
    return Object.fromEntries(ARM_IDS.map((id) => [id, out[id]]));
}
/** The arms of `arms` (default all 16; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets, laws, search, fixed (c02, h16, f4 as built), fixture }. */
export function audit(nets, laws, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null, fixture = null } = {}) {
    const all = armsOf(nets, laws), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead23.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets, laws, search, fixture, fixed: [all.c02.entry().weights, all.h16.entry().weights, all.f4.entry().weights] };
}
// ---- the readings
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, efficiencyOf = H15.efficiencyOf, scoreMean = H15.meanOf;
/** The per-id LIT priced score of an arm: its lit score - PRICE x its lit kW, as a run list. */
export const litPricedRuns = (au, a) => au.lit[a].map((r) => ({ key: r.key, score: r.score - PRICE * r.watts / 1000, bad: false }));
/** An arm's LIT priced gain: the mean over the ids of its lit priced score less the autopilot's. */
export const litPricedGain = (au, a) => { const p = litPricedRuns(au, a), q = litPricedRuns(au, "autopilot"); return avg(p.map((r, i) => r.score - q[i].score)); };
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` on the per-id lit priced score, paired by id. */
export const pairL = (au, a, b) => mk(B.paired(litPricedRuns(au, a), litPricedRuns(au, b)));
/** `a` minus `b` on the plain lit score, and on the dark score, paired by id. */
export const pairLitScore = (au, a, b) => H15.pairOf(au, a, b, "lit");
export const pairDark = (au, a, b) => H15.pairOf(au, a, b, "dark");
/** The per-id mean over the 8 shipped networks of the lit priced score, as a run list; and `a` minus that mean. */
export const netMeanRuns = (au) => litPricedRuns(au, "autopilot").map((r, i) => ({ key: r.key, score: avg(NET8.map((a) => litPricedRuns(au, a)[i].score)), bad: false }));
export const pairNets = (au, a) => mk(B.paired(litPricedRuns(au, a), netMeanRuns(au)));
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BEHIND" : "TIES");
const litThrust = (au, a) => avg(au.lit[a].map((r) => r.thrust));
/** The registered verdict, seven parts joined by "; ". */
export function verdictOf(au) {
    const ft = CHAMP_IDS.filter((c) => litThrust(au, c) >= FULL_THROTTLE);
    return [`ON THE LIT TANK C02 ${word(pairL(au, "c02", "autopilot").reading)} THE AUTOPILOT`, `THE LIT-ONLY PRICED SEARCH ${word(pairL(au, "l02", "c02").reading)} C02 ON THE LIT TANK`,
        `THE LIT-ONLY PRICED SEARCH ${word(pairL(au, "l02", "f4").reading)} THE DARK-AND-LIT CHAMPION`, `THE UNPRICED LIT SEARCH ${word(pairLitScore(au, "l00", "l02").reading)} THE PRICED ONE ON THE LIT SCORE`,
        `THE LIT-ONLY PRICED LAW ${word(pairDark(au, "l02", "autopilot").reading)} THE AUTOPILOT ON THE DARK TANK`, `THE LIT-ONLY PRICED SEARCH ${word(pairNets(au, "l02").reading)} THE NETWORKS ON THE LIT TANK`,
        `FULL THROTTLE AT: ${ft.length ? ft.join(", ") : "NONE"}`].join("; ");
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), effText = (e) => (e === null ? "n/a" : e.toFixed(3));
const lawText = (w) => WEIGHT_NAMES.map((n, i) => `${n} ${f3(w[i])}`).join(" ");
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, g) => (au.search || []).filter((r) => r.group === g);
const edges = (w) => WEIGHT_NAMES.filter((n, i) => atEdge(w[i], i));
export function bottomLines(au) {
    const shown = ["autopilot", "c02", "h16", "f4", "sched*2", ...CHAMP_IDS], nets = (c) => avg(NET8.map((a) => scoreMean(au, a, c))), ln = NET8.map((a) => lostBoth(au, a));
    const arm = (a) => `${a} ${scoreMean(au, a, "lit").toFixed(4)} / ${scoreMean(au, a, "dark").toFixed(4)}, ${kwOf(au, a, "lit").toFixed(2)} kW, thrust ${litThrust(au, a).toFixed(2)}`;
    const pg = (a) => f4(litPricedGain(au, a)), netPg = f4(avg(NET8.map((a) => litPricedGain(au, a))));
    const pr = { a: pairL(au, "c02", "autopilot"), b: pairL(au, "l02", "c02"), c: pairL(au, "l02", "f4"), d: pairLitScore(au, "l00", "l02"), e: pairDark(au, "l02", "autopilot"), f: pairNets(au, "l02") };
    const lines = GROUPS.map((g) => `SEARCH ${g}: ${rowsOf(au, g).map((r) => `seed ${r.seed} [${r.law.map((v) => v.toFixed(3)).join(" ")}] train ${r.trainScore.toFixed(4)} held ${r.heldScore.toFixed(4)} acc ${r.accepted}`).join("; ")}; CHAMPION ${lawText(au.laws[GROUPS.indexOf(g)])}`);
    const spread = GROUPS.map((g) => { const h = rowsOf(au, g).map((r) => r.heldScore); return (Math.max(...h) - Math.min(...h)).toFixed(4); }).join(" / ");
    return [
        ...lines,
        `SPREAD (largest minus smallest held-out lit value, L02 / L00): ${spread}`,
        `AUDIT (lit / dark mean score, lit mean power, mean lit thrust): ${shown.map(arm).join("; ")}; THE NETWORKS ${nets("lit").toFixed(4)} / ${nets("dark").toFixed(4)}, ${avg(NET8.map((a) => kwOf(au, a, "lit"))).toFixed(2)} kW`,
        `LIT PRICED GAIN AT ${PRICE}: ${shown.slice(1).map((a) => `${a} ${pg(a)}`).join("; ")}; THE NETWORKS ${netPg}`,
        `PAIRED: c02 minus autopilot, lit priced ${fmt(pr.a)}; l02 minus c02, lit priced ${fmt(pr.b)}; l02 minus f4, lit priced ${fmt(pr.c)}; l00 minus l02, lit score ${fmt(pr.d)}; l02 minus autopilot, dark score ${fmt(pr.e)}; l02 minus the networks, lit priced ${fmt(pr.f)}`,
        `EDGE: ${CHAMP_IDS.map((c, i) => `${c} ${lawText(au.laws[i])} (at an edge: ${edges(au.laws[i]).join(", ") || "none"})`).join("; ")}`,
        `POWER (lit mean kW, lit extra kW, lit efficiency): ${CHAMP_IDS.map((c) => `${c} ${kwOf(au, c, "lit").toFixed(2)}, ${f2(extraKw(au, c, "lit"))}, ${effText(efficiencyOf(au, c, "lit"))}`).join("; ")}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, c02 ${lostBoth(au, "c02")}, champions ${CHAMP_IDS.map((c) => lostBoth(au, c)).join(" / ")}, h16 ${lostBoth(au, "h16")}, f4 ${lostBoth(au, "f4")}, sched*2 ${lostBoth(au, "sched*2")}, networks ${Math.min(...ln)}-${Math.max(...ln)}`,
        `REPORTED, NOT IN THE VERDICT: dark-and-lit priced gain at 0.02 (H21's measure): ${["c02", "f4", ...CHAMP_IDS].map((a) => `${a} ${f4(X.pricedGain(au, a))}`).join("; ")}; dark gain and dark extra kW: ${CHAMP_IDS.map((c) => `${c} ${f4(gainOf(au, c))}, ${f2(extraKw(au, c))}`).join("; ")}`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from, J = JSON.stringify;
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
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET8.every((id) => { const w = get(id); return !!w && w.length === 963 && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is 963 finite weights: ${nets}` });
    const ident = ["dark", "lit"].every((c) => au[c].law0 && au[c].law0.every((r, i) => au[c].autopilot[i] && ["score", "watts", "thrust"].every((k) => Math.abs(r[k] - au[c].autopilot[i][k]) < 1e-6)));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score, power and thrust on every id in both conditions (within 1e-6): ${ident}` });
    const fx = au.fixture, fixOk = !!fx && Number.isFinite(fx.objective) && Math.abs(fx.objective - fx.direct) < 1e-12;
    rows.push({ name: "LIT OBJECTIVE IS SCORE LESS PRICE", ok: fixOk, text: `the lit objective of c02 equals the mean lit score less 0.02 x the mean lit kW recomputed from a flight: ${fixOk}` });
    const s = au.search, inBox = Array.isArray(s) && s.length === 12 && GROUPS.every((g) => SEEDS[g].every((q) => s.filter((r) => r.group === g && r.seed === q).length === 1)) && s.every((r) => insideBox(r.law)) && Array.isArray(au.laws) && au.laws.length === 2 && au.laws.every(insideBox);
    rows.push({ name: "LAWS INSIDE THE BOX", ok: inBox, text: `the twelve searches (six seeds in each group, each once) and both champions lie inside the box: ${inBox}` });
    const dj = disjoint(TRAIN, HELD) && disjoint(TRAIN, au.range) && disjoint(HELD, au.range);
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap: ${dj}` });
    const champ = (g, law) => Array.isArray(s) && Array.isArray(law) && rowsOf(au, g).length > 0 && rowsOf(au, g).some((r) => J(r.law) === J(law) && r.heldScore === Math.max(...rowsOf(au, g).map((q) => q.heldScore))), champs = Array.isArray(au.laws) && champ("L02", au.laws[0]) && champ("L00", au.laws[1]);
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT OF ITS GROUP", ok: champs, text: `each champion's law is a law of its own group with that group's largest held-out lit value: ${champs}` });
    const fixed = Array.isArray(au.fixed) && au.fixed.length === 3 && J(au.fixed[0]) === J(LAW_C02) && J(au.fixed[1]) === J(LAW_H16) && J(au.fixed[2]) === J(LAW_F4) && !!au.dark.c02 && !!au.dark.h16 && !!au.dark.f4;
    rows.push({ name: "C02, H16 AND F4 ARE THE REGISTERED LAWS", ok: fixed, text: `the c02, h16 and f4 arms fly the laws written in the registration: ${fixed}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET8.map(key)).size === NET8.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET8.length} networks are pairwise different in the dark: ${distinct}` });
    const litOnly = Array.isArray(s) && s.length > 0 && s.every((r) => r.darkFlights === 0 && r.litFlights === r.iters + 2);
    rows.push({ name: "NO SEARCH FLEW A DARK FLIGHT", ok: litOnly, text: `every search made only lit flights (iterations + 2 of them) and no dark flight: ${litOnly}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H23: the lit tank alone. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (lit score / dark score; lit mean power kW; dark mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${scoreMean(au, a, "lit").toFixed(4)} / ${scoreMean(au, a, "dark").toFixed(4)}   ${kwOf(au, a, "lit").toFixed(2)}   ${kwOf(au, a).toFixed(2)}`);
    R.push("per arm: lit / dark gain over the autopilot, extra power (kW, lit / dark), lit priced gain:");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a, "lit"))} / ${f4(gainOf(au, a))}  ${f3(extraKw(au, a, "lit"))} / ${f3(extraKw(au, a))}  ${f4(litPricedGain(au, a))}`);
    for (const g of GROUPS) { R.push(`the six searches of group ${g}:`); for (const r of rowsOf(au, g)) R.push(`  seed ${r.seed}: law [${r.law.map((v) => v.toFixed(4)).join(", ")}], train ${r.trainScore.toFixed(4)}, held-out ${r.heldScore.toFixed(4)}, accepted ${r.accepted}`); }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
