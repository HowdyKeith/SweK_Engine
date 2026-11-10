// WebGLEngine/tools/ship/headToHead16.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead16Cmd.mjs; the gate is tools/ship/headToHead16-selfcheck.mjs)
//
// ROUND H16 of brain/HEAD_TO_HEAD.md (registered before this file existed): HOW GOOD IS A TUNED FOUR-NUMBER THRUST LAW? The law is thrust = clamp(autopilot's thrust + c |heading error|/pi + d + k speedErr + s V/3) with weights (c, d, k, s); four (1+1)-ES searches
// from the autopilot on 24 TRAIN ids, the champion chosen on 40 HELD-OUT ids, then 200 AUDIT ids, dark and lit, against the autopilot, sched*2 and the 28 networks. The flight is H15's (it scores as switchboard.dropout does and records the power).
// Reads nothing from disk (the command hands the weights in). THE AUDIT IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H15 from "./headToHead15.mjs";

export const TRAIN = Object.freeze({ from: 16000, to: 16023 }), HELD = Object.freeze({ from: 16100, to: 16139 }), IDS = Object.freeze({ from: 16200, to: 16399 });
export const SECONDS = 160, ITERS = 150, SIGMA_FRAC = 0.1, SEEDS = Object.freeze([16001, 16002, 16003, 16004]);
export const WEIGHT_NAMES = Object.freeze(["c", "d", "k", "s"]);
export const BOX = Object.freeze([Object.freeze([0, 8]), Object.freeze([-0.2, 0.6]), Object.freeze([-0.6, 1]), Object.freeze([-1, 1])]);
export const LEARN_MARGIN = 0.02, MIN_EXTRA_KW = 0.1;
export const NET_IDS = H15.NET_IDS, REFERENCE_ID = "sched*2", CHAMPION_ID = "champion", IDENT_ID = "law0";
export const ARM_IDS = Object.freeze(["autopilot", IDENT_ID, CHAMPION_ID, REFERENCE_ID, ...NET_IDS]);
const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v), clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** The tank kind of the law (circuit h16-law, four weights). */
export const KIND = Object.freeze({
    circuit: "h16-law", label: "H16 law", weightCount: 4, persist: false,
    build: (w) => {
        const [c, d, k, s] = w, ap = AS.pilot();
        return (state, target, current = [0, 0, 0]) => {
            const a = ap(state, target, current), g = AS.guidance(state, target, current);
            return { ...a, thrust: clamp1(a.thrust + c * Math.abs(g.headingErr) / Math.PI + d + k * g.speedErr + s * g.V / 3) };
        };
    },
});
/** An arm that flies the law with weights `w` (four numbers). */
export function lawArm(id, w) {
    if (!(Array.isArray(w || null) || ArrayBuffer.isView(w || null)) || w.length !== 4 || !Array.from(w).every(Number.isFinite)) throw new Error("headToHead16.lawArm: a law is four finite numbers");
    return { id, layer: "flying", controls: ["autopilot"], note: `thrust law ${Array.from(w).join(" ")}`, entry: () => ({ pilot: "network", circuit: KIND.circuit, weights: Array.from(w) }), register: (tank) => tank.registerPilotKind(KIND.circuit, KIND) };
}
/** Whether a law lies inside the search box. */
export const insideBox = (w) => Array.isArray(w) && w.length === 4 && w.every((v, i) => Number.isFinite(v) && v >= BOX[i][0] && v <= BOX[i][1]);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const meanScore = (runs) => runs.reduce((s, r) => s + r.score, 0) / runs.length;
/** The mean dark dropout score of a law on `range` ids (the flight is H15's; `flyFn` is for the gate). */
export const scoreLaw = (w, range, seconds = SECONDS, flyFn = H15.fly) => meanScore(flyFn(lawArm("law", w), range, seconds, "dropout"));
/**
 * One (1+1)-ES search from the autopilot's law (0, 0, 0, 0): each iteration changes one to four weights by a Gaussian step of SIGMA_FRAC x the width of the weight's box (clamped to the box) and keeps the candidate when its TRAIN score is at least the parent's.
 * Returns { seed, law, trainScore, heldScore, accepted, iters }. `flyFn` is for the gate.
 */
export function searchOne(seed, { iters = ITERS, train = TRAIN, held = HELD, seconds = SECONDS, flyFn = H15.fly } = {}) {
    const rng = PS.mulberry(seed);
    let law = [0, 0, 0, 0], best = scoreLaw(law, train, seconds, flyFn), accepted = 0;
    for (let it = 0; it < iters; it++) {
        const m = 1 + Math.floor(rng() * 4), cand = law.slice(), idx = [0, 1, 2, 3];
        for (let j = 0; j < m; j++) { const pick = j + Math.floor(rng() * (4 - j)); [idx[j], idx[pick]] = [idx[pick], idx[j]]; }
        for (let j = 0; j < m; j++) { const i = idx[j]; cand[i] = clampTo(cand[i] + gauss(rng) * SIGMA_FRAC * (BOX[i][1] - BOX[i][0]), BOX[i][0], BOX[i][1]); }
        const sc = scoreLaw(cand, train, seconds, flyFn);
        if (sc >= best) { law = cand; best = sc; accepted++; }
    }
    return { seed, law, trainScore: best, heldScore: scoreLaw(law, held, seconds, flyFn), accepted, iters };
}
/** The champion of the four searches: the row with the best held-out score (the first of a tie); refuses anything but exactly the four registered seeds, once each. */
export function championOf(rows) {
    if (!Array.isArray(rows) || rows.length !== SEEDS.length || !SEEDS.every((s) => rows.filter((r) => r.seed === s).length === 1)) throw new Error(`headToHead16.championOf: expected one search for each of the seeds ${SEEDS.join(", ")}`);
    let b = rows[0]; for (const r of rows) if (r.heldScore > b.heldScore) b = r; return b;
}
/** The arms as { id: arm }: the autopilot, the zero law, the champion's law, H14's sched*2 and the 28 networks (H15's, built-in gfc). */
export function armsOf(nets, law) {
    const base = H15.armsOf(nets);
    return { autopilot: base.autopilot, [IDENT_ID]: lawArm(IDENT_ID, [0, 0, 0, 0]), [CHAMPION_ID]: lawArm(CHAMPION_ID, law), [REFERENCE_ID]: base[REFERENCE_ID], ...Object.fromEntries(NET_IDS.map((id) => [id, base[id]])) };
}
/** The arms of `arms` (default all 32; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets, law, search }. */
export function audit(nets, law, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = H15.fly, search = null } = {}) {
    const all = armsOf(nets, law), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead16.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets, law, search };
}
// ---- the readings (H15's, on the same shape of audit)
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length, sum = (xs) => xs.reduce((p, q) => p + q, 0);
export const gainOf = H15.gainOf, extraKw = H15.extraKw, kwOf = H15.kwOf, meanOf = H15.meanOf, efficiencyOf = H15.efficiencyOf;
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** The per-id mean score of the 28 networks as a run list (dark by default). */
export const networkMean = (au, cond = "dark") => au[cond].autopilot.map((r, i) => ({ key: r.key, score: avg(NET_IDS.map((a) => au[cond][a][i].score)), bad: false }));
/** { name, g } the network with the largest dark gain (the first of a tie). */
export const bestNetwork = (au) => H15.bestNetwork(au);
/** The champion minus the networks' mean, minus sched*2 and minus the best network, paired, in the condition. */
export function pairs(au, cond = "dark") {
    const ch = au[cond][CHAMPION_ID], bn = bestNetwork(au).name;
    return { mean: mk(B.paired(ch, networkMean(au, cond))), reference: mk(B.paired(ch, au[cond][REFERENCE_ID])), best: mk(B.paired(ch, au[cond][bn])), bestName: bn };
}
const word = (reading, beat, behind, tie) => (reading === "BETTER" ? beat : reading === "WORSE" ? behind : tie);
/** The champion's gain, extra power and power efficiency against the networks': { gain, extra, eff, net: { gain, extra, eff } }. */
export function powerOf(au) { const x = extraKw(au, CHAMPION_ID), g = gainOf(au, CHAMPION_ID), n = H15.netEfficiency(au); return { gain: g, extra: x, eff: x >= MIN_EXTRA_KW ? g / x : null, net: n }; }
/** The registered verdict, four parts joined by "; ". */
export function verdictOf(au) {
    const p = pairs(au), pw = powerOf(au);
    const A = word(p.mean.reading, "THE TUNED LAW BEATS THE NETWORKS' MEAN", "THE TUNED LAW IS BEHIND THE NETWORKS' MEAN", "THE TUNED LAW TIES THE NETWORKS' MEAN");
    const Bp = word(p.reference.reading, `THE TUNED LAW BEATS ${REFERENCE_ID}`, `THE TUNED LAW IS BEHIND ${REFERENCE_ID}`, `THE TUNED LAW TIES ${REFERENCE_ID}`);
    const C = word(p.best.reading, "THE TUNED LAW BEATS THE BEST NETWORK", "THE TUNED LAW IS BEHIND THE BEST NETWORK", "THE TUNED LAW TIES THE BEST NETWORK");
    let D;
    if (pw.gain <= LEARN_MARGIN) D = "THE TUNED LAW DID NOT GAIN";
    else if (pw.eff === null || pw.net.eff === null) D = "POWER EFFICIENCY NOT ASSESSED";
    else { const r = pw.eff / pw.net.eff; D = r >= H15.MORE ? "THE TUNED LAW IS MORE POWER-EFFICIENT THAN THE NETWORKS" : r <= H15.LESS ? "THE TUNED LAW IS LESS POWER-EFFICIENT THAN THE NETWORKS" : "THE TUNED LAW IS ABOUT AS POWER-EFFICIENT AS THE NETWORKS"; }
    return `${A}; ${Bp}; ${C}; ${D}`;
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f3 = (x) => (x >= 0 ? "+" : "") + x.toFixed(3), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), effText = (e) => (e === null ? "n/a" : e.toFixed(3));
const lawText = (w) => `${WEIGHT_NAMES.map((n, i) => `${n} ${f3(w[i])}`).join(" ")}`;
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const fmt = (p) => `${f4(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function bottomLines(au) {
    const rows = au.search, pr = pairs(au), pw = powerOf(au), bn = bestNetwork(au), netMeanDark = avg(NET_IDS.map((a) => meanOf(au, a, "dark"))), netMeanLit = avg(NET_IDS.map((a) => meanOf(au, a, "lit")));
    const ln = NET_IDS.map((a) => lostBoth(au, a)), arm = (a) => `${a} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}, gain ${f4(gainOf(au, a))}, ${kwOf(au, a).toFixed(2)} kW`;
    return [
        `SEARCH: ${rows.map((r) => `seed ${r.seed} [${r.law.map((v) => v.toFixed(3)).join(" ")}] train ${r.trainScore.toFixed(4)} held ${r.heldScore.toFixed(4)}`).join("; ")}; CHAMPION ${lawText(au.law)}`,
        `AUDIT (dark / lit mean score, dark gain, dark mean power): ${arm("autopilot")}; ${arm(CHAMPION_ID)}; ${arm(REFERENCE_ID)}; THE NETWORKS ${netMeanDark.toFixed(4)} / ${netMeanLit.toFixed(4)}, gain ${f4(avg(NET_IDS.map((a) => gainOf(au, a))))}, ${avg(NET_IDS.map((a) => kwOf(au, a))).toFixed(2)} kW; BEST NETWORK ${arm(bn.name)}`,
        `PAIRED (dark): CHAMPION MINUS THE NETWORKS' MEAN ${fmt(pr.mean)}; MINUS ${REFERENCE_ID} ${fmt(pr.reference)}; MINUS THE BEST NETWORK ${pr.bestName} ${fmt(pr.best)}`,
        `POWER: THE CHAMPION ${f2(pw.extra)} kW extra, efficiency ${effText(pw.eff)}; ${REFERENCE_ID} ${f2(extraKw(au, REFERENCE_ID))} kW extra, efficiency ${effText(efficiencyOf(au, REFERENCE_ID))}; THE NETWORKS ${f2(pw.net.extra)} kW extra, efficiency ${effText(pw.net.eff)}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, champion ${lostBoth(au, CHAMPION_ID)}, ${REFERENCE_ID} ${lostBoth(au, REFERENCE_ID)}, networks ${sum(ln)} (${Math.max(...ln)} in the worst)`,
    ];
}
const disjoint = (a, b) => a.to < b.from || b.to < a.from;
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
    const s = au.search, inBox = Array.isArray(s) && s.length === SEEDS.length && s.every((r) => insideBox(r.law)) && insideBox(au.law);
    rows.push({ name: "LAWS INSIDE THE BOX", ok: inBox, text: `the four searches' laws and the champion lie inside the search box: ${inBox}` });
    const dj = disjoint(TRAIN, HELD) && disjoint(TRAIN, au.range) && disjoint(HELD, au.range);
    rows.push({ name: "ID SETS DISJOINT", ok: dj, text: `the train, held-out and audit ids do not overlap: ${dj}` });
    const champ = Array.isArray(s) && s.length > 0 && au.law && s.some((r) => J(r.law) === J(au.law) && r.heldScore === Math.max(...s.map((q) => q.heldScore)));
    rows.push({ name: "CHAMPION IS THE BEST HELD-OUT", ok: !!champ, text: `the champion's law is a search's law with the largest held-out score: ${!!champ}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET_IDS.map(key)).size === NET_IDS.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET_IDS.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
const J = JSON.stringify;
export function report(au) {
    const R = [`ROUND H16: how good is a tuned four-number thrust law. Audit ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdict below is NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark mean power kW):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}   ${kwOf(au, a).toFixed(2)}`);
    R.push("per arm, dark / lit: gain over the autopilot, extra power (kW), power efficiency:");
    for (const a of ARM_IDS.slice(1)) R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a))} ${f3(extraKw(au, a))} ${effText(efficiencyOf(au, a)).padStart(6)}  |  ${f4(gainOf(au, a, "lit"))} ${f3(extraKw(au, a, "lit"))} ${effText(efficiencyOf(au, a, "lit")).padStart(6)}`);
    R.push("the four searches:"); for (const r of au.search) R.push(`  seed ${r.seed}: law [${r.law.map((v) => v.toFixed(4)).join(", ")}], train ${r.trainScore.toFixed(4)}, held-out ${r.heldScore.toFixed(4)}, ${r.accepted} of ${r.iters} accepted`);
    const pl = pairs(au, "lit"); R.push(`the champion minus the networks' mean, minus ${REFERENCE_ID}, minus the best network (lit): ${fmt(pl.mean)} | ${fmt(pl.reference)} | ${fmt(pl.best)}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
