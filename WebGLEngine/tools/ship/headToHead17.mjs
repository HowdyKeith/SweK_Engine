// WebGLEngine/tools/ship/headToHead17.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead17Cmd.mjs; the gate is tools/ship/headToHead17-selfcheck.mjs)
//
// ROUND H17 of brain/HEAD_TO_HEAD.md (registered before this file existed): DOES A WIDER BOX AND A LIT-TANK OBJECTIVE FIX WHAT H16'S LAW GAVE UP? H16's four-number thrust law (c, d, k, s) searched in a WIDER box by two groups of six (1+1)-ES searches, group A on the dark
// score, group B on the mean of the dark and the lit scores; each group's champion chosen on 40 held-out ids; then 200 audit ids, dark and lit, against the autopilot, H16's champion (a constant here), sched*2 and the 28 networks. The flight is H15's and the law's tank kind is H16's.
// Reads nothing from disk (the command hands the weights in). THE AUDIT IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";
import * as H16 from "./headToHead16.mjs";

export const TRAIN = Object.freeze({ from: 17000, to: 17023 }), HELD = Object.freeze({ from: 17100, to: 17139 }), IDS = Object.freeze({ from: 17200, to: 17399 });
export const SECONDS = 160, ITERS = 300, SIGMA_FRAC = 0.1, EDGE_FRAC = 0.01, LEARN_MARGIN = 0.02, MIN_EXTRA_KW = 0.1;
export const SEEDS_A = Object.freeze([17001, 17002, 17003, 17004, 17005, 17006]), SEEDS_B = Object.freeze([17011, 17012, 17013, 17014, 17015, 17016]);
export const WEIGHT_NAMES = H16.WEIGHT_NAMES;
export const BOX = Object.freeze([Object.freeze([0, 16]), Object.freeze([-0.4, 1.0]), Object.freeze([-1.5, 2]), Object.freeze([-2, 2])]);
export const H16_LAW = Object.freeze([1.2322693581401742, -0.061415416013719054, -0.6, -0.15850584538981266]);
export const NET_IDS = H15.NET_IDS, REFERENCE_ID = "sched*2", IDENT_ID = "law0", H16_ID = "h16", CHAMP_A = "champA", CHAMP_B = "champB";
export const ARM_IDS = Object.freeze(["autopilot", IDENT_ID, CHAMP_A, CHAMP_B, H16_ID, REFERENCE_ID, ...NET_IDS]);
const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** Whether a law lies inside the wider box. */
export const insideBox = (w) => Array.isArray(w) && w.length === 4 && w.every((v, i) => Number.isFinite(v) && v >= BOX[i][0] && v <= BOX[i][1]);
/** How many of a law's four weights lie within EDGE_FRAC of the box width of an edge of the box. */
export const edgeCount = (w) => w.filter((v, i) => { const wd = BOX[i][1] - BOX[i][0]; return v <= BOX[i][0] + EDGE_FRAC * wd || v >= BOX[i][1] - EDGE_FRAC * wd; }).length;
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const meanScore = (runs) => runs.reduce((s, r) => s + r.score, 0) / runs.length;
/** A law's objective on `range` ids: group "A": the mean dark score; group "B": the mean of the dark mean and the lit mean (one flight each). `flyFn` is for the gate. */
export function objective(w, range, group, seconds = SECONDS, flyFn = H15.fly) {
    if (group !== "A" && group !== "B") throw new Error(`headToHead17.objective: group must be "A" or "B", got ${JSON.stringify(group)}`);
    const arm = H16.lawArm("law", w), dark = meanScore(flyFn(arm, range, seconds, "dropout"));
    return group === "A" ? dark : 0.5 * dark + 0.5 * meanScore(flyFn(arm, range, seconds, null));
}
/** One (1+1)-ES search of a group from the autopilot's law (0, 0, 0, 0) in the wider box: one to four weights changed by a Gaussian step of SIGMA_FRAC x the box width (clamped), kept when the TRAIN objective is at least the parent's. Returns { seed, group, law, trainScore, heldScore, accepted, iters }. */
export function searchOne(seed, group, { iters = ITERS, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = H15.fly } = {}) {
    const rng = PS.mulberry(seed);
    let law = [0, 0, 0, 0], best = objective(law, train, group, seconds, flyFn), accepted = 0;
    for (let it = 0; it < iters; it++) {
        const m = 1 + Math.floor(rng() * 4), cand = law.slice(), idx = [0, 1, 2, 3];
        for (let j = 0; j < m; j++) { const pick = j + Math.floor(rng() * (4 - j)); [idx[j], idx[pick]] = [idx[pick], idx[j]]; }
        for (let j = 0; j < m; j++) { const i = idx[j]; cand[i] = clampTo(cand[i] + gauss(rng) * SIGMA_FRAC * (BOX[i][1] - BOX[i][0]), BOX[i][0], BOX[i][1]); }
        const sc = objective(cand, train, group, seconds, flyFn);
        if (sc >= best) { law = cand; best = sc; accepted++; }
    }
    return { seed, group, law, trainScore: best, heldScore: objective(law, held, group, seconds, flyFn), accepted, iters };
}
const seedsOf = (g) => (g === "A" ? SEEDS_A : SEEDS_B);
/** The champion of one group among `rows` (all twelve searches or the group's six): the row of the group with the best held-out value (the first of a tie); refuses a group that is not exactly its six registered seeds, once each. */
export function championOf(rows, group) {
    const mine = Array.isArray(rows) ? rows.filter((r) => r.group === group) : [], seeds = seedsOf(group);
    if (!seeds || mine.length !== seeds.length || !seeds.every((s) => mine.filter((r) => r.seed === s).length === 1)) throw new Error(`headToHead17.championOf: group ${group} needs one search for each of the seeds ${(seeds || []).join(", ")}`);
    let b = mine[0]; for (const r of mine) if (r.heldScore > b.heldScore) b = r; return b;
}
/** The arms as { id: arm }: the autopilot, the zero law, the two champions' laws, H16's law, H14's sched*2 and the 28 networks (H15's). */
export function armsOf(nets, lawA, lawB) {
    const base = H15.armsOf(nets);
    return { autopilot: base.autopilot, [IDENT_ID]: H16.lawArm(IDENT_ID, [0, 0, 0, 0]), [CHAMP_A]: H16.lawArm(CHAMP_A, lawA), [CHAMP_B]: H16.lawArm(CHAMP_B, lawB), [H16_ID]: H16.lawArm(H16_ID, H16_LAW), [REFERENCE_ID]: base[REFERENCE_ID], ...Object.fromEntries(NET_IDS.map((id) => [id, base[id]])) };
}
/** The arms of `arms` (default all 34; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets, lawA, lawB, search }. */
export function audit(nets, lawA, lawB, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null } = {}) {
    const all = armsOf(nets, lawA, lawB), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead17.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets, lawA, lawB, search, h16Law: all[H16_ID].entry().weights };
}
// ---- the readings
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, sum = (xs) => xs.reduce((p, q) => p + q, 0);
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, meanOf = H15.meanOf, efficiencyOf = H15.efficiencyOf;
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** The network with the largest mean of its dark and lit gains (the first of a tie): { name, g }. */
export function bestNetwork(au) { let b = null; for (const a of NET_IDS) { const g = (gainOf(au, a, "dark") + gainOf(au, a, "lit")) / 2; if (b === null || g > b.g) b = { name: a, g }; } return b; }
/** `a` minus `b` on the score, paired, in the condition. */
export const pair = (au, a, b, cond) => mk(B.paired(au[cond][a], au[cond][b]));
/** The five pairings of the verdict: { box (champA - h16, dark), objDark, objLit (champB - champA), netDark, netLit (champB - best network), bestName, litRef (champB - sched*2, lit; reported) }. */
export function pairs(au) {
    const bn = bestNetwork(au).name;
    return { box: pair(au, CHAMP_A, H16_ID, "dark"), objDark: pair(au, CHAMP_B, CHAMP_A, "dark"), objLit: pair(au, CHAMP_B, CHAMP_A, "lit"), netDark: pair(au, CHAMP_B, bn, "dark"), netLit: pair(au, CHAMP_B, bn, "lit"), bestName: bn, litRef: pair(au, CHAMP_B, REFERENCE_ID, "lit") };
}
const word = (r, beat, behind, tie) => (r === "BETTER" ? beat : r === "WORSE" ? behind : tie);
/** The champion's (default champB) dark gain, extra power and power efficiency against the networks': { gain, extra, eff, net }. */
export function powerOf(au, id = CHAMP_B) { const x = extraKw(au, id), g = gainOf(au, id), n = H15.netEfficiency(au); return { gain: g, extra: x, eff: x >= MIN_EXTRA_KW ? g / x : null, net: n }; }
/** The registered verdict, five parts joined by "; ". */
export function verdictOf(au) {
    const p = pairs(au), pw = powerOf(au);
    const A = word(p.box.reading, "THE WIDER BOX BEATS H16'S LAW IN THE DARK", "THE WIDER BOX IS BEHIND H16'S LAW IN THE DARK", "THE WIDER BOX TIES H16'S LAW IN THE DARK");
    const Bp = `THE LIT OBJECTIVE ${word(p.objDark.reading, "RAISES THE DARK SCORE", "COSTS DARK SCORE", "LEAVES THE DARK SCORE UNCHANGED")} AND ${word(p.objLit.reading, "RAISES THE LIT SCORE", "COSTS LIT SCORE", "LEAVES THE LIT SCORE UNCHANGED")}`;
    const C = `THE LIT-TUNED LAW ${word(p.netDark.reading, "BEATS", "IS BEHIND", "TIES")} THE BEST NETWORK IN THE DARK AND ${word(p.netLit.reading, "BEATS", "IS BEHIND", "TIES")} IT IN THE LIT TANK`;
    const D = `THE LIT-TUNED LAW HAS ${edgeCount(au.lawB)} OF 4 WEIGHTS AT THE BOX EDGE`;
    let E;
    if (pw.gain <= LEARN_MARGIN) E = "THE LIT-TUNED LAW DID NOT GAIN";
    else if (pw.eff === null || pw.net.eff === null) E = "POWER EFFICIENCY NOT ASSESSED";
    else { const r = pw.eff / pw.net.eff; E = r >= H15.MORE ? "THE LIT-TUNED LAW IS MORE POWER-EFFICIENT THAN THE NETWORKS" : r <= H15.LESS ? "THE LIT-TUNED LAW IS LESS POWER-EFFICIENT THAN THE NETWORKS" : "THE LIT-TUNED LAW IS ABOUT AS POWER-EFFICIENT AS THE NETWORKS"; }
    return `${A}; ${Bp}; ${C}; ${D}; ${E}`;
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), effText = (e) => (e === null ? "n/a" : e.toFixed(3));
const lawText = (w) => WEIGHT_NAMES.map((n, i) => `${n} ${f3(w[i])}`).join(" ");
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
const rowsOf = (au, g) => (au.search || []).filter((r) => r.group === g);
const searchLine = (au, g) => `SEARCH ${g}: ${rowsOf(au, g).map((r) => `seed ${r.seed} [${r.law.map((v) => v.toFixed(3)).join(" ")}] train ${r.trainScore.toFixed(4)} held ${r.heldScore.toFixed(4)} acc ${r.accepted}`).join("; ")}; CHAMPION ${lawText(g === "A" ? au.lawA : au.lawB)}`;
const spread = (au, g) => { const h = rowsOf(au, g).map((r) => r.heldScore); return Math.max(...h) - Math.min(...h); };
export function bottomLines(au) {
    const pr = pairs(au), bn = bestNetwork(au), pw = powerOf(au), pa = powerOf(au, CHAMP_A);
    const nets = (c) => avg(NET_IDS.map((a) => meanOf(au, a, c))), arm = (a) => `${a} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}, gain ${f4(gainOf(au, a))} / ${f4(gainOf(au, a, "lit"))}, ${kwOf(au, a).toFixed(2)} kW`;
    const ln = NET_IDS.map((a) => lostBoth(au, a)), edges = (w) => WEIGHT_NAMES.filter((n, i) => { const wd = BOX[i][1] - BOX[i][0]; return w[i] <= BOX[i][0] + EDGE_FRAC * wd || w[i] >= BOX[i][1] - EDGE_FRAC * wd; });
    return [
        searchLine(au, "A"), searchLine(au, "B"),
        `SPREAD (largest minus smallest held-out value in the group): A ${spread(au, "A").toFixed(4)}; B ${spread(au, "B").toFixed(4)}`,
        `AUDIT (dark / lit mean score, dark / lit gain, dark mean power): ${arm("autopilot")}; ${arm(H16_ID)}; ${arm(CHAMP_A)}; ${arm(CHAMP_B)}; ${arm(REFERENCE_ID)}; THE NETWORKS ${nets("dark").toFixed(4)} / ${nets("lit").toFixed(4)}, gain ${f4(avg(NET_IDS.map((a) => gainOf(au, a))))} / ${f4(avg(NET_IDS.map((a) => gainOf(au, a, "lit"))))}, ${avg(NET_IDS.map((a) => kwOf(au, a))).toFixed(2)} kW; BEST NETWORK ${arm(bn.name)}`,
        `PAIRED: champA MINUS h16 (dark) ${fmt(pr.box)}; champB MINUS champA dark ${fmt(pr.objDark)}, lit ${fmt(pr.objLit)}; champB MINUS THE BEST NETWORK ${pr.bestName} dark ${fmt(pr.netDark)}, lit ${fmt(pr.netLit)}; champB MINUS ${REFERENCE_ID} (lit) ${fmt(pr.litRef)}`,
        `EDGE: champA ${lawText(au.lawA)} (at an edge: ${edges(au.lawA).join(", ") || "none"}); champB ${lawText(au.lawB)} (at an edge: ${edges(au.lawB).join(", ") || "none"})`,
        `POWER (extra kW, efficiency): champB ${f2(pw.extra)}, ${effText(pw.eff)}; champA ${f2(pa.extra)}, ${effText(pa.eff)}; h16 ${f2(extraKw(au, H16_ID))}, ${effText(efficiencyOf(au, H16_ID))}; ${REFERENCE_ID} ${f2(extraKw(au, REFERENCE_ID))}, ${effText(efficiencyOf(au, REFERENCE_ID))}; THE NETWORKS ${f2(pw.net.extra)}, ${effText(pw.net.eff)}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, h16 ${lostBoth(au, H16_ID)}, champA ${lostBoth(au, CHAMP_A)}, champB ${lostBoth(au, CHAMP_B)}, ${REFERENCE_ID} ${lostBoth(au, REFERENCE_ID)}, networks ${sum(ln)} (${Math.max(...ln)} in the worst)`,
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
    const watts = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.watts) && r.watts >= H15.MIN_WATTS));
    rows.push({ name: "POWERS FINITE AND AT LEAST 200 W", ok: watts, text: `every mean power is a finite number of at least ${H15.MIN_WATTS} W: ${watts}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET_IDS.every((id) => { const w = get(id); return !!w && w.length === 963 && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is 963 finite weights: ${nets}` });
    const ident = ["dark", "lit"].every((c) => au[c][IDENT_ID] && au[c][IDENT_ID].every((r, i) => au[c].autopilot[i] && Math.abs(r.score - au[c].autopilot[i].score) < 1e-6 && Math.abs(r.watts - au[c].autopilot[i].watts) < 1e-6));
    rows.push({ name: "ZERO LAW IS THE AUTOPILOT", ok: ident, text: `law0 equals the autopilot in score and in power on every id in both conditions (within 1e-6): ${ident}` });
    const s = au.search, inBox = Array.isArray(s) && s.length === SEEDS_A.length + SEEDS_B.length && s.every((r) => insideBox(r.law)) && insideBox(au.lawA) && insideBox(au.lawB);
    rows.push({ name: "LAWS INSIDE THE BOX", ok: inBox, text: `the twelve searches' laws and both champions lie inside the wider box: ${inBox}` });
    const dj = disjoint(TRAIN, HELD) && disjoint(TRAIN, au.range) && disjoint(HELD, au.range);
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap: ${dj}` });
    const champ = (g, law) => Array.isArray(s) && rowsOf(au, g).length > 0 && rowsOf(au, g).some((r) => J(r.law) === J(law) && r.heldScore === Math.max(...rowsOf(au, g).map((q) => q.heldScore))), champs = !!champ("A", au.lawA) && !!champ("B", au.lawB);
    rows.push({ name: "EACH CHAMPION IS THE BEST HELD-OUT OF ITS GROUP", ok: champs, text: `each champion's law is a law of its own group with that group's largest held-out value: ${champs}` });
    const hOk = Array.isArray(au.h16Law) && J(au.h16Law) === J(H16_LAW) && !!au.dark[H16_ID] && au.dark[H16_ID].length === n;
    rows.push({ name: "H16 LAW IS THE REGISTERED ONE", ok: hOk, text: `the h16 arm flies the law written in the registration: ${hOk}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET_IDS.map(key)).size === NET_IDS.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET_IDS.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
export function report(au) {
    const R = [`ROUND H17: a wider box and a lit objective. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW; lit mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}   ${kwOf(au, a, "lit").toFixed(2)}`);
    R.push("per arm, dark / lit: gain over the autopilot, extra power (kW), power efficiency:");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a))} ${f3(extraKw(au, a))} ${effText(efficiencyOf(au, a)).padStart(6)}  |  ${f4(gainOf(au, a, "lit"))} ${f3(extraKw(au, a, "lit"))} ${effText(efficiencyOf(au, a, "lit")).padStart(6)}`);
    for (const g of ["A", "B"]) { R.push(`the six searches of group ${g}:`); for (const r of rowsOf(au, g)) R.push(`  seed ${r.seed}: law [${r.law.map((v) => v.toFixed(4)).join(", ")}], train ${r.trainScore.toFixed(4)}, held-out ${r.heldScore.toFixed(4)}, ${r.accepted} of ${r.iters} accepted`); }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
