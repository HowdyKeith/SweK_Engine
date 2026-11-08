// WebGLEngine/tools/ship/headToHead9.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead9Cmd.mjs; the gate is tools/ship/headToHead9-selfcheck.mjs)
//
// ROUND H9 of brain/HEAD_TO_HEAD.md (registered before this file existed): THE LESION. 28 trained 963-weight networks (the eight shipped ones and the twenty champions of H7) and the hand weights, each flown intact and with its 313 recurrent synapses set to zero, on the
// tank's compass dropout (200 fresh ids, dark and lit) through the switchboard, read as paired differences with a registered verdict. Reads nothing from disk (the command hands the weights in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";

export const IDS = Object.freeze({ from: 9000, to: 9199 }), SECONDS = 160;
export const LEARN_MARGIN = 0.02, LEARN_MIN = 20, F_HIGH = 0.8, F_LOW = 0.2;
/** The recurrent block of the 963-weight vector: [REC_FROM, REC_TO) = [14 x 34 + 34, + 313). */
export const REC_FROM = PS.FEATURES * PS.HIDDEN + PS.HIDDEN, REC_TO = REC_FROM + PS.REC_EDGES;
export const SHIPPED = Object.freeze(["Wip", "Actuators", "Robust", "RobustLong", "RobustTail", "RobustTail2", "RobustWide", "RobustNoisy"]);
export const SHIPPED_IDS = Object.freeze(SHIPPED.map((n) => "network-" + n));
export const BASE_IDS = Object.freeze(Array.from({ length: 10 }, (_, r) => "base-" + r)), ROBUST_IDS = Object.freeze(Array.from({ length: 10 }, (_, r) => "robust-" + r));
export const NET_IDS = Object.freeze([...SHIPPED_IDS, ...BASE_IDS, ...ROBUST_IDS]);
export const offId = (id) => id + "-off";
export const ARM_IDS = Object.freeze(["autopilot", "hand", "hand-off", ...NET_IDS.flatMap((id) => [id, offId(id)])]);
const need963 = (w, what) => { if (!(Array.isArray(w) || ArrayBuffer.isView(w)) || w.length !== PS.WEIGHT_COUNT) throw new Error(`headToHead9: ${what} must be an array of ${PS.WEIGHT_COUNT} numbers, got ${w && w.length !== undefined ? "length " + w.length : JSON.stringify(w)}`); };
/** A copy of the weight vector with the recurrent block (indices REC_FROM to REC_TO - 1) set to zero: the input weights, the biases and the output weights are untouched. */
export function lesion(w) {
    need963(w, "the weights");
    const o = Array.from(w); for (let i = REC_FROM; i < REC_TO; i++) o[i] = 0;
    return o;
}
const arm = (id, weights, note) => ({ id, layer: "flying", controls: ["autopilot"], note, entry: () => ({ pilot: "network", circuit: "gfc", weights: Array.from(weights) }) });
/** The board: the dropout task, the autopilot, the hand weights intact and lesioned, and each of the 28 networks (`nets` = a Map or object id -> 963 numbers, ids as NET_IDS) intact and lesioned. */
export function boardOf(nets) {
    const get = (id) => (nets && typeof nets.get === "function" ? nets.get(id) : nets ? nets[id] : undefined);
    for (const id of NET_IDS) { if (get(id) === undefined || get(id) === null) throw new Error(`headToHead9.boardOf: no network ${id}`); need963(get(id), `network ${id}`); }
    const b = B.createBoard().addTask(B.dropoutTask);
    b.addArm(B.flyingArms({})[0]);
    const hand = Array.from(PS.handWeights());
    b.addArm(arm("hand", hand, "the hand weights: the autopilot written through the network")); b.addArm(arm("hand-off", lesion(hand), "the hand weights with the recurrent block zeroed (they were zero already)"));
    for (const id of NET_IDS) { b.addArm(arm(id, get(id), `network ${id}`)); b.addArm(arm(offId(id), lesion(get(id)), `network ${id} with its recurrent core off`)); }
    return b;
}
/** EVERY arm once, dark and lit, on `range` ids: { dark, lit, range, seconds, nets (the weights handed in, for the checks) }. */
export function audit(nets, { range = IDS, seconds = SECONDS } = {}) {
    const b = boardOf(nets);
    return { dark: b.run("dropout", [...ARM_IDS], range, { seconds }).runs, lit: b.run("dropout", [...ARM_IDS], range, { seconds, event: null }).runs, range, seconds, nets };
}
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` in the condition ("dark" or "lit"), pooled and paired. */
export const pairOf = (au, a, b, cond) => mk(B.paired(au[cond][a], au[cond][b]));
export const meanOf = (au, a, cond) => au[cond][a].reduce((s, r) => s + r.score, 0) / au[cond][a].length;
/** An arm's gain over the autopilot in the condition. */
export const gainOf = (au, a, cond) => pairOf(au, a, "autopilot", cond).mean;
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length, sdOf = (xs) => { const m = avg(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1)); };
/** The gains of a list of network ids, intact and core off, in the condition. */
export const gainsOf = (au, ids, cond = "dark") => ({ intact: ids.map((a) => gainOf(au, a, cond)), off: ids.map((a) => gainOf(au, offId(a), cond)) });
/** { gi, go (the 28 gains), Gi, Go (their means), f = Go / Gi } in the condition. */
export function statsOf(au, cond = "dark") {
    const g = gainsOf(au, NET_IDS, cond), Gi = avg(g.intact), Go = avg(g.off);
    return { gi: g.intact, go: g.off, Gi, Go, f: Go / Gi };
}
/** How many of the 28 intact networks beat the autopilot in the dark by more than LEARN_MARGIN. */
export const learnedCount = (au) => gainsOf(au, NET_IDS).intact.filter((g) => g > LEARN_MARGIN).length;
/** How many of the 28 lesions read BETTER, TIES, WORSE (core off minus intact) in the condition. */
export const lesionCounts = (au, cond = "dark") => { const r = NET_IDS.map((a) => pairOf(au, offId(a), a, cond).reading); return { better: r.filter((x) => x === "BETTER").length, ties: r.filter((x) => x === "TIES").length, worse: r.filter((x) => x === "WORSE").length }; };
/** The registered verdict. */
export function verdictOf(au) {
    if (learnedCount(au) < LEARN_MIN) return "NOT ASSESSED: THE NETWORKS DID NOT GAIN";
    const { f } = statsOf(au);
    if (f >= F_HIGH) return "THE GAIN SURVIVES THE LESION: THE RECURRENT CORE IS NOT WHERE IT IS";
    if (f <= F_LOW) return "THE GAIN LIVES IN THE RECURRENT CORE";
    return "THE CORE CARRIES PART OF THE GAIN";
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const spread = (g) => `${f4(avg(g))} (sd ${sdOf(g).toFixed(4)}, range ${f4(Math.min(...g))} to ${f4(Math.max(...g))})`;
export function bottomLines(au) {
    const s = statsOf(au), sl = statsOf(au, "lit"), c = lesionCounts(au), grp = (ids) => { const g = gainsOf(au, ids); return `${f4(avg(g.intact))} / ${f4(avg(g.off))}`; };
    const li = NET_IDS.map((a) => lostBoth(au, a)), lo = NET_IDS.map((a) => lostBoth(au, offId(a))), sum = (a) => a.reduce((x, y) => x + y, 0);
    return [
        `LEARNED: ${learnedCount(au)} OF ${NET_IDS.length} INTACT NETWORKS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN ${LEARN_MARGIN}`,
        `DARK GAIN OVER THE AUTOPILOT: INTACT ${spread(s.gi)}; CORE OFF ${spread(s.go)}; SURVIVING FRACTION ${s.f.toFixed(2)}`,
        `THE LESION CHANGES ${c.better} NETWORKS FOR THE BETTER, ${c.ties} TIED, ${c.worse} FOR THE WORSE (dark, core off minus intact, of ${NET_IDS.length})`,
        `BY GROUP (intact / core off, dark gain): SHIPPED ${grp(SHIPPED_IDS)}; BASE ${grp(BASE_IDS)}; ROBUST ${grp(ROBUST_IDS)}`,
        `LIT TANK: INTACT ${f4(sl.Gi)}, CORE OFF ${f4(sl.Go)}, SURVIVING FRACTION ${sl.f.toFixed(2)}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, intact ${sum(li)} (${Math.max(...li)} in the worst), core off ${sum(lo)} (${Math.max(...lo)} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const weights = NET_IDS.every((id) => { const w = get(id); if (!w || w.length !== PS.WEIGHT_COUNT || !Array.from(w).every(Number.isFinite)) return false; const o = lesion(w); return o.every((v, i) => (i >= REC_FROM && i < REC_TO ? v === 0 : v === w[i])); });
    rows.push({ name: "WEIGHTS AND LESIONS", ok: weights, text: `every network is ${PS.WEIGHT_COUNT} finite weights and its lesion is zero on [${REC_FROM}, ${REC_TO}) and equal to it elsewhere: ${weights}` });
    const hand = ["dark", "lit"].every((c) => au[c].hand && au[c]["hand-off"] && au[c].hand.every((r, i) => au[c]["hand-off"][i] && Math.abs(r.score - au[c]["hand-off"][i].score) < 1e-9));
    rows.push({ name: "HAND LESION IS THE HAND WEIGHTS", ok: hand, text: `hand-off equals hand on every id in both conditions (within 1e-9): ${hand}` });
    const changed = NET_IDS.filter((a) => au.dark[a] && au.dark[offId(a)] && au.dark[a].some((r, i) => r.score !== au.dark[offId(a)][i].score)).length, ch = changed >= 20;
    rows.push({ name: "LESION CHANGES THE FLIGHT", ok: ch, text: `the lesion changes the dark flight of ${changed} of ${NET_IDS.length} networks (at least 20): ${ch}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET_IDS.map(key)).size === NET_IDS.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET_IDS.length} intact networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const R = [`ROUND H9: the lesion (recurrent core off). Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark / lit):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(24)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}`);
    R.push("gain over the autopilot, then the lesion's effect (core off minus intact), dark / lit:");
    for (const id of NET_IDS) R.push(`${id}:`, `   dark gain ${fmt(pairOf(au, id, "autopilot", "dark"))}   | core off ${fmt(pairOf(au, offId(id), "autopilot", "dark"))}`, `   lesion  dark ${fmt(pairOf(au, offId(id), id, "dark"))}`, `   lesion  lit  ${fmt(pairOf(au, offId(id), id, "lit"))}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
