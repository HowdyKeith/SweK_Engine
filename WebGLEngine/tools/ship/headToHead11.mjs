// WebGLEngine/tools/ship/headToHead11.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead11Cmd.mjs; the gate is tools/ship/headToHead11-selfcheck.mjs)
//
// ROUND H11 of brain/HEAD_TO_HEAD.md (registered before this file existed): THE CHANNEL TRANSPLANT. For each of 28 trained 963-weight networks and each of the four commands (pitch, yaw, thrust, ballast): the network with that one command replaced by the
// autopilot's (`n/-c`) and the autopilot with only that command taken from the network (`n/+c`), flown on the tank's compass dropout (200 fresh ids, the dark tank) through the switchboard and read as paired differences with a registered verdict. Reads nothing
// from disk (the command hands the weights in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as H9 from "./headToHead9.mjs";

export const IDS = Object.freeze({ from: 11000, to: 11199 }), SECONDS = 160;
export const LEARN_MARGIN = 0.02, NEED_MIN = 0.5, SUFF_MIN = 0.5;
export const CHANNELS = Object.freeze(["pitch", "yaw", "thrust", "ballast"]);
export const NET_IDS = H9.NET_IDS;
/** The two modes: "-" (the network with channel c from the autopilot) and "+" (the autopilot with channel c from the network). */
export const MODES = Object.freeze(["-", "+"]);
export const armId = (id, mode, c) => `${id}/${mode}${c}`;
const PLAIN = Object.freeze(["hand", ...NET_IDS]);
export const ARM_IDS = Object.freeze(["autopilot", ...PLAIN.flatMap((id) => [id, ...CHANNELS.map((c) => armId(id, "-", c)), ...CHANNELS.map((c) => armId(id, "+", c))])]);
/** The tank kind of one mode and channel: circuit `h11<mode>-<channel>`, 963 weights, the pilot a mixture of the network's command and the autopilot's. */
export function kindOf(mode, c) {
    if (!MODES.includes(mode)) throw new Error(`headToHead11.kindOf: mode must be "-" or "+", got ${JSON.stringify(mode)}`);
    if (!CHANNELS.includes(c)) throw new Error(`headToHead11.kindOf: channel must be one of ${CHANNELS.join(", ")}, got ${JSON.stringify(c)}`);
    return Object.freeze({
        circuit: `h11${mode}-${c}`, label: `H11 ${mode}${c}`, weightCount: PS.WEIGHT_COUNT, persist: false,
        build: (weights) => { const net = PS.pilotFor(Float32Array.from(weights)), ap = AS.pilot(); return (state, target, current) => { const n = net(state, target, current), a = ap(state, target, current); return mode === "-" ? { ...n, [c]: a[c] } : { ...a, [c]: n[c] }; }; },
    });
}
const need963 = (w, what) => { if (!(Array.isArray(w || null) || ArrayBuffer.isView(w || null)) || w.length !== PS.WEIGHT_COUNT) throw new Error(`headToHead11.boardOf: ${what} must be an array of ${PS.WEIGHT_COUNT} numbers`); };
const plainArm = (id, weights) => ({ id, layer: "flying", controls: ["autopilot"], note: `network ${id}`, entry: () => ({ pilot: "network", circuit: "gfc", weights: Array.from(weights) }) });
const mixArm = (id, mode, c, weights) => { const kind = kindOf(mode, c); return { id: armId(id, mode, c), layer: "flying", controls: ["autopilot"], note: `network ${id} ${mode === "-" ? "with its" : "giving only its"} ${c} command ${mode === "-" ? "from the autopilot" : "to the autopilot"}`, entry: () => ({ pilot: "network", circuit: kind.circuit, weights: Array.from(weights) }), register: (tank) => tank.registerPilotKind(kind.circuit, kind) }; };
/** The board: the dropout task, the autopilot, `hand` and the 28 networks (`nets` = a Map or object id -> 963 numbers), each intact and with its eight transplants. */
export function boardOf(nets) {
    const get = (id) => (nets && typeof nets.get === "function" ? nets.get(id) : nets ? nets[id] : undefined);
    for (const id of NET_IDS) { if (get(id) === undefined || get(id) === null) throw new Error(`headToHead11.boardOf: no network ${id}`); need963(get(id), `network ${id}`); }
    const b = B.createBoard().addTask(B.dropoutTask);
    b.addArm(B.flyingArms({})[0]);
    for (const id of PLAIN) {
        const w = id === "hand" ? Array.from(PS.handWeights()) : get(id);
        b.addArm(plainArm(id, w));
        for (const c of CHANNELS) b.addArm(mixArm(id, "-", c, w));
        for (const c of CHANNELS) b.addArm(mixArm(id, "+", c, w));
    }
    return b;
}
/** The arms of `arms` (default all 253 + the hand ones) once, dark, on `range` ids: { dark, range, seconds, nets } (`dark` holds only the arms flown: the command merges parts). */
export function audit(nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS } = {}) {
    const b = boardOf(nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!ARM_IDS.includes(a)) throw new Error(`headToHead11.audit: no arm ${a}`);
    return { dark: b.run("dropout", want, range, { seconds }).runs, range, seconds, nets };
}
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` in the dark, pooled and paired. */
export const pairOf = (au, a, b) => mk(B.paired(au.dark[a], au.dark[b]));
export const meanOf = (au, a) => au.dark[a].reduce((s, r) => s + r.score, 0) / au.dark[a].length;
/** An arm's gain over the autopilot. */
export const gainOf = (au, a) => pairOf(au, a, "autopilot").mean;
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
/** The intact gains of the 28 networks. */
export const gainsOf = (au) => NET_IDS.map((id) => gainOf(au, id));
/** The gains of the transplants of one mode and channel over the 28 networks. */
export const transplantGains = (au, mode, c) => NET_IDS.map((id) => gainOf(au, armId(id, mode, c)));
/** How many of the 28 intact networks beat the autopilot by more than LEARN_MARGIN. */
export const learnedCount = (au) => gainsOf(au).filter((g) => g > LEARN_MARGIN).length;
/** NECESSITY of a channel: the share of the mean intact gain lost when the channel is the autopilot's. */
export const necessity = (au, c) => { const G = gainsOf(au), T = transplantGains(au, "-", c); return avg(G.map((g, i) => g - T[i])) / avg(G); };
/** SUFFICIENCY of a channel: the share of the mean intact gain the autopilot gains from the network's channel alone. */
export const sufficiency = (au, c) => avg(transplantGains(au, "+", c)) / avg(gainsOf(au));
/** The channel with the largest necessity (the first of a tie). */
export const largest = (au) => CHANNELS.reduce((best, c) => (necessity(au, c) > necessity(au, best) ? c : best), CHANNELS[0]);
/** How many of the 28 transplants of a mode and channel read BETTER, TIES, WORSE than the intact network. */
export const readings = (au, mode, c) => { const r = NET_IDS.map((id) => pairOf(au, armId(id, mode, c), id).reading); return { better: r.filter((x) => x === "BETTER").length, ties: r.filter((x) => x === "TIES").length, worse: r.filter((x) => x === "WORSE").length }; };
/** The registered verdict. */
export function verdictOf(au) {
    if (avg(gainsOf(au)) <= LEARN_MARGIN) return "NOT ASSESSED: THE NETWORKS DID NOT GAIN";
    const c = largest(au), n = necessity(au, c), s = sufficiency(au, c);
    if (n >= NEED_MIN && s >= SUFF_MIN) return `THE GAIN IS IN THE ${c.toUpperCase()} CHANNEL`;
    if (n >= NEED_MIN) return `THE GAIN NEEDS THE ${c.toUpperCase()} CHANNEL BUT IT IS NOT ENOUGH ALONE`;
    return "THE GAIN IS SPREAD ACROSS THE CHANNELS";
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), x2 = (x) => x.toFixed(2), lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0);
export function bottomLines(au) {
    const G = gainsOf(au), c = largest(au), tr = NET_IDS.flatMap((id) => CHANNELS.flatMap((ch) => MODES.map((m) => lostOf(au.dark[armId(id, m, ch)])))), sumT = tr.reduce((p, q) => p + q, 0), sumI = NET_IDS.reduce((s, id) => s + lostOf(au.dark[id]), 0);
    const worst = Math.max(...NET_IDS.flatMap((id) => CHANNELS.flatMap((ch) => MODES.map((m) => lostOf(au.dark[armId(id, m, ch)])))));
    return [
        `LEARNED: ${learnedCount(au)} OF ${NET_IDS.length} INTACT NETWORKS BEAT THE AUTOPILOT BY MORE THAN ${LEARN_MARGIN}; MEAN GAIN ${f4(avg(G))}`,
        `NECESSITY (share of the gain lost when the channel is the autopilot's): ${CHANNELS.map((ch) => `${ch} ${x2(necessity(au, ch))}`).join(", ")}`,
        `SUFFICIENCY (share of the gain the autopilot gains from the network's channel alone): ${CHANNELS.map((ch) => `${ch} ${x2(sufficiency(au, ch))}`).join(", ")}`,
        `TRANSPLANTS READ, OF ${NET_IDS.length} (better / ties / worse than the intact network): ${CHANNELS.map((ch) => { const r = readings(au, "-", ch); return `${ch} ${r.better}/${r.ties}/${r.worse}`; }).join(", ")}`,
        `THE LARGEST: ${c} N ${x2(necessity(au, c))} S ${x2(sufficiency(au, c))}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostOf(au.dark.autopilot)}, intact ${sumI}, transplants ${sumT} (${worst} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1;
    const sizes = ARM_IDS.every((a) => au.dark[a] && au.dark[a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids: ${sizes}` });
    const same = ARM_IDS.every((a) => au.dark[a] && au.dark[a].every((r, i) => au.dark.autopilot[i] && r.key === au.dark.autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm: ${same}` });
    const inside = ARM_IDS.every((a) => au.dark[a] && au.dark[a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET_IDS.every((id) => { const w = get(id); return !!w && w.length === PS.WEIGHT_COUNT && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is ${PS.WEIGHT_COUNT} finite weights: ${nets}` });
    const hand = MODES.every((m) => CHANNELS.every((c) => au.dark[armId("hand", m, c)] && au.dark[armId("hand", m, c)].every((r, i) => au.dark.autopilot[i] && Math.abs(r.score - au.dark.autopilot[i].score) < 1e-9)));
    rows.push({ name: "HAND TRANSPLANTS ARE THE AUTOPILOT", ok: hand, text: `hand/-c and hand/+c equal the autopilot on every id for every channel (within 1e-9): ${hand}` });
    const changed = NET_IDS.filter((id) => CHANNELS.some((c) => au.dark[armId(id, "-", c)] && au.dark[id] && au.dark[armId(id, "-", c)].some((r, i) => r.score !== au.dark[id][i].score))).length, ch = changed >= 20;
    rows.push({ name: "TRANSPLANTS CHANGE THE FLIGHT", ok: ch, text: `a transplant changes the flight of ${changed} of ${NET_IDS.length} networks (at least 20): ${ch}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET_IDS.map(key)).size === NET_IDS.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET_IDS.length} intact networks are pairwise different: ${distinct}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const R = [`ROUND H11: the channel transplant. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, the dark tank; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("mean gain over the autopilot, by channel (over the 28 networks): intact, then with the channel the autopilot's (-), then the autopilot with only that channel the network's (+):");
    R.push(`  intact ${f4(avg(gainsOf(au)))}`);
    for (const c of CHANNELS) R.push(`  ${c.padEnd(8)} - ${f4(avg(transplantGains(au, "-", c)))}   + ${f4(avg(transplantGains(au, "+", c)))}`);
    R.push("per network (intact gain; then - and + per channel pitch, yaw, thrust, ballast):");
    for (const id of NET_IDS) R.push(`  ${id.padEnd(20)} ${f4(gainOf(au, id))}  -: ${CHANNELS.map((c) => f4(gainOf(au, armId(id, "-", c)))).join(" ")}  +: ${CHANNELS.map((c) => f4(gainOf(au, armId(id, "+", c)))).join(" ")}`);
    R.push("the transplants against the intact network, pooled over the 28 (mean difference, dark):");
    for (const c of CHANNELS) for (const m of MODES) { const d = NET_IDS.map((id) => pairOf(au, armId(id, m, c), id).mean); R.push(`  ${m}${c.padEnd(8)} ${f4(avg(d))}`); }
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
