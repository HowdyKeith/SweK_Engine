// WebGLEngine/tools/ship/headToHead13.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead13Cmd.mjs; the gate is tools/ship/headToHead13-selfcheck.mjs)
//
// ROUND H13 of brain/HEAD_TO_HEAD.md (registered before this file existed): THE THRUST HYPOTHESIS. H11 found the whole gain of the 28 trained networks is in their thrust command. Do they fly faster than the autopilot, and does the autopilot with a one-number
// thrust change (a thrust offset, or a higher speed setpoint) reach their gain? The autopilot, two identity arms, five thrust offsets, three speed setpoints and the 28 networks flown on the tank's compass dropout (200 fresh ids, dark and lit) by this
// file's own flight, which scores EXACTLY as switchboard.dropout does (the gate holds it to the board) and also records the speed, the speed excess over the target and the thrust command. Reads nothing from disk (the command hands the weights in). THE IDS
// ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as A from "../../render/subAquariumSim.mjs";
import * as H9 from "./headToHead9.mjs";
import * as H7 from "./headToHead7.mjs";

export const IDS = Object.freeze({ from: 13000, to: 13199 }), SECONDS = 160, TICK = 1 / 30, SETTLE = 12;
export const LEARN_MARGIN = 0.02, REPRO_HIGH = 0.8, REPRO_LOW = 0.4, R_MIN = 0.5;
export const OFFSETS = Object.freeze([0.1, 0.2, 0.3, 0.4, 0.6]), FACTORS = Object.freeze([1.25, 1.5, 2]);
export const THR_IDS = Object.freeze(OFFSETS.map((d) => `thr+${d}`)), SPD_IDS = Object.freeze(FACTORS.map((k) => `spd*${k}`));
export const IDENT_IDS = Object.freeze(["thr+0", "spd*1"]);
export const SIMPLE_IDS = Object.freeze([...THR_IDS, ...SPD_IDS]);
export const NET_IDS = H9.NET_IDS;
export const ARM_IDS = Object.freeze(["autopilot", ...IDENT_IDS, ...THR_IDS, ...SPD_IDS, ...NET_IDS]);
const TWO_PI = 2 * Math.PI, wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; }, clamp = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
/** The tank kind of one family: `thr` (the autopilot's thrust plus the weight, clamped to [-1, 1]) or `spd` (the autopilot flown at the target speed times the weight); circuit h13-<family>, one weight. */
export function kindOf(family) {
    if (family !== "thr" && family !== "spd") throw new Error(`headToHead13.kindOf: family must be "thr" or "spd", got ${JSON.stringify(family)}`);
    return Object.freeze({
        circuit: "h13-" + family, label: "H13 " + family, weightCount: 1, persist: false,
        build: (weights) => { const v = weights[0], ap = AS.pilot(); return family === "thr" ? (state, target, current) => { const a = ap(state, target, current); return { ...a, thrust: clamp(a.thrust + v) }; } : (state, target, current) => ap(state, { ...target, speed: target.speed * v }, current); },
    });
}
const simpleArm = (id, family, value) => { const kind = kindOf(family); return { id, layer: "flying", controls: ["autopilot"], note: `${family === "thr" ? "autopilot with thrust offset" : "autopilot at a speed setpoint x"} ${value}`, entry: () => ({ pilot: "network", circuit: kind.circuit, weights: [value] }), register: (tank) => tank.registerPilotKind(kind.circuit, kind) }; };
const netArm = (id, weights) => ({ id, layer: "flying", controls: ["autopilot"], note: `network ${id}`, entry: () => ({ pilot: "network", circuit: "gfc", weights: Array.from(weights) }) });
const need963 = (w, what) => { if (!(Array.isArray(w || null) || ArrayBuffer.isView(w || null)) || w.length !== PS.WEIGHT_COUNT) throw new Error(`headToHead13.armsOf: ${what} must be an array of ${PS.WEIGHT_COUNT} numbers`); };
/** The 39 arms as { id: arm } (`nets` = a Map or object id -> 963 numbers for the 28 networks). */
export function armsOf(nets) {
    const get = (id) => (nets && typeof nets.get === "function" ? nets.get(id) : nets ? nets[id] : undefined);
    for (const id of NET_IDS) { if (get(id) === undefined || get(id) === null) throw new Error(`headToHead13.armsOf: no network ${id}`); need963(get(id), `network ${id}`); }
    const out = { autopilot: B.flyingArms({})[0], "thr+0": simpleArm("thr+0", "thr", 0), "spd*1": simpleArm("spd*1", "spd", 1) };
    OFFSETS.forEach((d, i) => { out[THR_IDS[i]] = simpleArm(THR_IDS[i], "thr", d); });
    FACTORS.forEach((k, i) => { out[SPD_IDS[i]] = simpleArm(SPD_IDS[i], "spd", k); });
    for (const id of NET_IDS) out[id] = netArm(id, get(id));
    return out;
}
/** One arm on `range` ids in one condition ("dark": the compass dropout event; "lit": none): [{ key, score (as switchboard.dropout scores it), bad (the sub was lost), speed (mean through the water), excess (mean of speed less the target speed), thrust (mean thrust command) }]. `makeTank` is for the gate. */
export function fly(arm, range, seconds, event, makeTank = A.createTank) {
    const out = [];
    for (let n = range.from; n <= range.to; n++) {
        const id = "sb-" + n, q = makeTank();
        if (arm.register) arm.register(q);
        q.sync([{ id, name: "H13 " + arm.id, hue: 100, from: "board", local: true, theta: null, ...arm.entry(id) }]);
        if (event) q.setEvent(id, event);
        let target = null, age = 0, sum = 0, cnt = 0, sumAll = 0, cntAll = 0, sp = 0, ex = 0, th = 0, ticks = 0;
        for (let i = 0, m = Math.round(seconds / TICK); i < m; i++) {
            q.step(TICK); const s = q.snapshot()[0];
            if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
            const dark = !!(s.compass && s.compass.valid === false), e = Math.abs(wrap(s.target.heading - s.heading));
            if (event ? dark : true) { sumAll += e; cntAll++; if (age >= SETTLE) { sum += e; cnt++; } }
            sp += s.speed; ex += s.speed - s.target.speed; th += s.cmd.thrust; ticks++;
        }
        const last = q.snapshot()[0], err = cnt ? sum / cnt : cntAll ? sumAll / cntAll : NaN;
        if (!Number.isFinite(err)) throw new Error(`headToHead13.fly: arm ${arm.id} id ${id} has no ticks in the bucket it is scored on`);
        out.push({ key: id, score: 1 - err / Math.PI, bad: !!last.lost, speed: sp / ticks, excess: ex / ticks, thrust: th / ticks });
    }
    return out;
}
/** The arms of `arms` (default all 39; the autopilot is always flown) on `range` ids, dark and lit: { dark, lit, range, seconds, nets }. `flyFn` is the flight (the gate hands in a fake). */
export function audit(nets, { range = IDS, seconds = SECONDS, arms = ARM_IDS, flyFn = fly } = {}) {
    const all = armsOf(nets), want = [...new Set(["autopilot", ...arms])];
    for (const a of want) if (!all[a]) throw new Error(`headToHead13.audit: no arm ${a}`);
    const dark = {}, lit = {};
    for (const a of want) { dark[a] = flyFn(all[a], range, seconds, "dropout"); lit[a] = flyFn(all[a], range, seconds, null); }
    return { dark, lit, range, seconds, nets };
}
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` on the score in the condition, pooled and paired. */
export const pairOf = (au, a, b, cond) => mk(B.paired(au[cond][a], au[cond][b]));
/** `a` minus `b` on a recorded field ("speed", "excess", "thrust") in the condition, pooled and paired. */
export const pairField = (au, a, b, cond, field) => mk(B.paired(au[cond][a].map((r) => ({ key: r.key, score: r[field], bad: false })), au[cond][b].map((r) => ({ key: r.key, score: r[field], bad: false }))));
export const meanOf = (au, a, cond, field = "score") => au[cond][a].reduce((s, r) => s + r[field], 0) / au[cond][a].length;
/** An arm's gain over the autopilot in the condition. */
export const gainOf = (au, a, cond) => pairOf(au, a, "autopilot", cond).mean;
const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
export const gainsOf = (au, ids, cond = "dark") => ids.map((a) => gainOf(au, a, cond));
export const excessOf = (au, ids, cond = "dark") => ids.map((a) => meanOf(au, a, cond, "excess"));
export const pearson = H7.pearson;
/** How many of the 28 networks beat the autopilot in the dark by more than LEARN_MARGIN. */
export const learnedCount = (au) => gainsOf(au, NET_IDS).filter((g) => g > LEARN_MARGIN).length;
/** { name, g } the simple arm with the largest mean dark gain (the first of a tie). */
export function bestSimple(au) {
    const g = gainsOf(au, SIMPLE_IDS); let b = 0; g.forEach((v, i) => { if (v > g[b]) b = i; });
    return { name: SIMPLE_IDS[b], g: g[b] };
}
/** The simple arm whose mean speed excess is nearest the networks' mean: { name, excess, g }. */
export function nearestSimple(au) {
    const target = avg(excessOf(au, NET_IDS)), e = excessOf(au, SIMPLE_IDS); let b = 0; e.forEach((v, i) => { if (Math.abs(v - target) < Math.abs(e[b] - target)) b = i; });
    return { name: SIMPLE_IDS[b], excess: e[b], g: gainOf(au, SIMPLE_IDS[b], "dark") };
}
/** The networks' speed excess against the autopilot's: the per-id mean over the 28 networks minus the autopilot's, pooled and paired: { mean, se, reading ... }. */
export function networkSpeed(au, cond = "dark") {
    const n = au[cond].autopilot.length, mean = Array.from({ length: n }, (_, i) => ({ key: au[cond].autopilot[i].key, score: avg(NET_IDS.map((id) => au[cond][id][i].excess)), bad: false }));
    return mk(B.paired(mean, au[cond].autopilot.map((r) => ({ key: r.key, score: r.excess, bad: false }))));
}
/** The registered verdict, the two parts joined by "; ". */
export function verdictOf(au) {
    const G = avg(gainsOf(au, NET_IDS)), g = bestSimple(au).g, sp = networkSpeed(au).reading;
    const part1 = G <= LEARN_MARGIN ? "NOT ASSESSED: THE NETWORKS DID NOT GAIN" : g >= REPRO_HIGH * G ? "A ONE-NUMBER THRUST CHANGE REPRODUCES THE GAIN" : g >= REPRO_LOW * G ? "A ONE-NUMBER THRUST CHANGE REPRODUCES PART OF THE GAIN" : "A ONE-NUMBER THRUST CHANGE DOES NOT REPRODUCE THE GAIN";
    const part2 = sp === "BETTER" ? "THE NETWORKS FLY FASTER THAN THE AUTOPILOT" : sp === "WORSE" ? "THE NETWORKS FLY SLOWER THAN THE AUTOPILOT" : "THE NETWORKS FLY AT THE AUTOPILOT'S SPEED";
    return `${part1}; ${part2}`;
}
const f4 = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f2 = (x) => (x >= 0 ? "+" : "") + x.toFixed(2), lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0), lostBoth = (au, a) => lostOf(au.dark[a]) + lostOf(au.lit[a]);
const rangeOf = (xs, f) => `${f(Math.min(...xs))} to ${f(Math.max(...xs))}`;
export function bottomLines(au) {
    const G = gainsOf(au, NET_IDS), Gl = gainsOf(au, NET_IDS, "lit"), Es = excessOf(au, NET_IDS), thr = gainsOf(au, THR_IDS), spd = gainsOf(au, SPD_IDS), near = nearestSimple(au);
    const lsim = SIMPLE_IDS.map((a) => lostBoth(au, a)), lnet = NET_IDS.map((a) => lostBoth(au, a)), sum = (a) => a.reduce((p, q) => p + q, 0);
    return [
        `LEARNED: ${learnedCount(au)} OF ${NET_IDS.length} NETWORKS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN ${LEARN_MARGIN}; MEAN GAIN ${f4(avg(G))}`,
        `DARK GAIN OVER THE AUTOPILOT: THRUST OFFSETS ${OFFSETS.map((d, i) => `+${d} ${f4(thr[i])}`).join(", ")}; SPEED SETPOINTS ${FACTORS.map((k, i) => `x${k} ${f4(spd[i])}`).join(", ")}; THE NETWORKS ${f4(avg(G))} (${rangeOf(G, f4)})`,
        `SPEED EXCESS (m/s, mean over every tick and id): AUTOPILOT ${f2(meanOf(au, "autopilot", "dark", "excess"))}; THRUST OFFSETS ${excessOf(au, THR_IDS).map(f2).join(", ")}; SPEED SETPOINTS ${excessOf(au, SPD_IDS).map(f2).join(", ")}; THE NETWORKS ${f2(avg(Es))} (${rangeOf(Es, f2)})`,
        `THE NETWORKS' SPEED AGAINST THEIR GAIN, ACROSS THE ${NET_IDS.length}: r = ${pearson(Es, G).toFixed(2)} (speed excess against dark gain)`,
        `THE SIMPLE ARM NEAREST THE NETWORKS IN SPEED EXCESS: ${near.name} (excess ${f2(near.excess)}, dark gain ${f4(near.g)})`,
        `LIT TANK: THRUST OFFSETS ${gainsOf(au, THR_IDS, "lit").map(f4).join(", ")}; SPEED SETPOINTS ${gainsOf(au, SPD_IDS, "lit").map(f4).join(", ")}; THE NETWORKS ${f4(avg(Gl))}`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: autopilot ${lostBoth(au, "autopilot")}, simple arms ${sum(lsim)} (${Math.max(...lsim)} in the worst), networks ${sum(lnet)} (${Math.max(...lnet)} in the worst)`,
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
    const finite = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => Number.isFinite(r.speed) && Number.isFinite(r.excess) && Number.isFinite(r.thrust)));
    rows.push({ name: "SPEEDS AND THRUSTS FINITE", ok: finite, text: `every speed, speed excess and thrust is a finite number: ${finite}` });
    const event = !!au.dark.autopilot && au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const get = (id) => (au.nets && typeof au.nets.get === "function" ? au.nets.get(id) : au.nets ? au.nets[id] : undefined);
    const nets = NET_IDS.every((id) => { const w = get(id); return !!w && w.length === PS.WEIGHT_COUNT && Array.from(w).every(Number.isFinite); });
    rows.push({ name: "NETWORKS", ok: nets, text: `every network is ${PS.WEIGHT_COUNT} finite weights: ${nets}` });
    const ident = ["dark", "lit"].every((c) => IDENT_IDS.every((a) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && Math.abs(r.score - au[c].autopilot[i].score) < 1e-6)));
    rows.push({ name: "IDENTITY ARMS ARE THE AUTOPILOT", ok: ident, text: `thr+0 and spd*1 equal the autopilot on every id in both conditions (within 1e-6): ${ident}` });
    const e = (a) => (au.dark[a] ? meanOf(au, a, "dark", "excess") : NaN), faster = e(THR_IDS[0]) < e(THR_IDS[THR_IDS.length - 1]) && e(THR_IDS[THR_IDS.length - 1]) > e("autopilot");
    rows.push({ name: "OFFSETS FLY FASTER", ok: faster, text: `the largest thrust offset flies faster than the smallest and than the autopilot (mean speed excess): ${faster}` });
    const key = (a) => (au.dark[a] || []).map((r) => r.score).join("|"), distinct = new Set(NET_IDS.map(key)).size === NET_IDS.length;
    rows.push({ name: "NETWORKS DISTINCT", ok: distinct, text: `the ${NET_IDS.length} networks are pairwise different in the dark: ${distinct}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const R = [`ROUND H13: the thrust hypothesis. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (dark score / lit score; dark speed excess m/s; dark thrust command):");
    for (const a of ARM_IDS) R.push(`  ${a.padEnd(20)} ${meanOf(au, a, "dark").toFixed(4)} / ${meanOf(au, a, "lit").toFixed(4)}   ${f2(meanOf(au, a, "dark", "excess"))}   ${f2(meanOf(au, a, "dark", "thrust"))}`);
    R.push("gains over the autopilot, dark / lit, and the speed excess against the autopilot (dark):");
    for (const a of [...IDENT_IDS, ...SIMPLE_IDS]) R.push(`${a}:`, `   dark ${fmt(pairOf(au, a, "autopilot", "dark"))}`, `   lit  ${fmt(pairOf(au, a, "autopilot", "lit"))}`, `   speed excess ${fmt(pairField(au, a, "autopilot", "dark", "excess"))}`);
    R.push("per network: dark gain, speed excess (m/s), thrust command:");
    for (const a of NET_IDS) R.push(`  ${a.padEnd(20)} ${f4(gainOf(au, a, "dark"))}  ${f2(meanOf(au, a, "dark", "excess"))}  ${f2(meanOf(au, a, "dark", "thrust"))}`);
    const ns = networkSpeed(au); R.push(`the networks' mean speed excess minus the autopilot's: ${fmt(ns)}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
