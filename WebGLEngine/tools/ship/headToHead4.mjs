// WebGLEngine/tools/ship/headToHead4.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead4Cmd.mjs; the gate is tools/ship/headToHead4-selfcheck.mjs)
//
// ROUND H4 of brain/HEAD_TO_HEAD.md (registered before this file existed): the heading each pilot BELIEVES through the tank's compass dropout (`snapshot().compass.error`, belief less truth, on the dark ticks), for the held heading, the
// leaky unit and its lesion, the dead-reckoning navigator, the fly heading loop and a random wiring, each its own one-sub tank per id, and the flying score of the same flights. Read as paired differences on the switchboard's reading.
// Reads nothing from disk (the command hands in the two estimator builders). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as L from "../../brain/pilotLeakyHeading.mjs";
import * as A from "../../render/subAquariumSim.mjs";

export const IDS = Object.freeze({ from: 4000, to: 4199 }), SECONDS = 160, TICK = 1 / 30, SETTLE = 12;
export const ARM_IDS = Object.freeze(["held", "leaky-unit-off", "leaky-unit", "navigator", "fly", "er"]);
/** The four arms read against `held` (the lesion is the sanity arm and is not one of them). */
export const READ_IDS = Object.freeze(["leaky-unit", "navigator", "fly", "er"]);
/** The event each arm runs under (the estimator events take a builder registered on the tank). */
export const EVENT_OF = Object.freeze({ held: "dropout", "leaky-unit-off": "fly-estimator", "leaky-unit": "fly-estimator", navigator: "navigator", fly: "fly-estimator", er: "er-estimator" });
const TWO_PI = 2 * Math.PI, wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };

/** The arms for this round, each { id, event, build (an estimator builder or null) }. `builders` = { fly, er }: build(inner) -> pilot, as render/subDropoutScene.mjs pilotDefs gives them. */
export function armsOf(builders) {
    for (const k of ["fly", "er"]) if (!builders || typeof builders[k] !== "function") throw new Error(`headToHead4.armsOf: builders.${k} must be a function (inner) => pilot`);
    const leaky = (gain) => (inner) => L.leakyHeading(inner, { sigma: L.DEFAULTS.sigma, gain });
    return [
        { id: "held", event: "dropout", build: null },
        { id: "leaky-unit-off", event: "fly-estimator", build: leaky(0) },
        { id: "leaky-unit", event: "fly-estimator", build: leaky(L.DEFAULTS.gain) },
        { id: "navigator", event: "navigator", build: null },
        { id: "fly", event: "fly-estimator", build: builders.fly },
        { id: "er", event: "er-estimator", build: builders.er },
    ];
}
/** One id of one arm in its own tank: { belief (1 - rms/pi over the dark ticks), flight (the board's dropout score), lost, dark (the dark ticks counted) }. */
export function flight(arm, n, seconds = SECONDS, makeTank = A.createTank) {   // `makeTank` is for the gate: a scripted tank whose belief and heading errors are known in advance
    const id = "sb-" + n, q = makeTank();
    if (arm.build) q.registerEstimator(arm.event, arm.build);
    q.sync([{ id, name: "H4 " + arm.id, hue: 100, from: "board", local: true, theta: null, pilot: "autopilot", circuit: "gfc", weights: null }]);
    q.setEvent(id, arm.event);
    let target = null, age = 0, sumSq = 0, dark = 0, sum = 0, cnt = 0, sumAll = 0, cntAll = 0, last = null;
    for (let i = 0, m = Math.round(seconds / TICK); i < m; i++) {
        q.step(TICK); const s = q.snapshot()[0]; last = s;
        if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
        if (s.compass && s.compass.valid === false) {
            dark++; sumSq += s.compass.error * s.compass.error;
            const e = Math.abs(wrap(s.target.heading - s.heading)); sumAll += e; cntAll++; if (age >= SETTLE) { sum += e; cnt++; }
        }
    }
    if (!dark) throw new Error(`headToHead4.flight: arm ${arm.id} id ${id} had no dark ticks`);
    const err = cnt ? sum / cnt : sumAll / cntAll;
    return { belief: 1 - Math.sqrt(sumSq / dark) / Math.PI, flight: 1 - err / Math.PI, lost: !!last.lost, dark };
}
/** EVERY arm once on `range` ids: { runs: { arm: [{ key, belief, flight, bad, dark }] }, range, seconds }. `flightFn` is the flight (the gate hands in a fake). */
export function audit(builders, { range = IDS, seconds = SECONDS, flightFn = flight } = {}) {
    const runs = {};
    for (const arm of armsOf(builders)) {
        runs[arm.id] = [];
        for (let n = range.from; n <= range.to; n++) { const f = flightFn(arm, n, seconds); runs[arm.id].push({ key: "sb-" + n, belief: f.belief, flight: f.flight, bad: f.lost, dark: f.dark }); }
    }
    return { runs, range, seconds };
}
const asRuns = (au, id, field) => au.runs[id].map((r) => ({ key: r.key, score: r[field], bad: r.bad }));
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` on `field` ("belief" or "flight"), pooled and paired. */
export const pairOf = (au, a, b, field) => mk(B.paired(asRuns(au, a, field), asRuns(au, b, field)));
const word = (r) => (r === "BETTER" ? "BEATS" : r === "WORSE" ? "IS BELOW" : "TIES");
const list = (xs) => xs.join(", ");
const lostOf = (au, id) => au.runs[id].reduce((s, r) => s + (r.bad ? 1 : 0), 0);
/** The names of the READ arms whose pair against `held` on `field` reads `want`. */
const against = (au, field, want) => READ_IDS.filter((a) => pairOf(au, a, "held", field).reading === want);
const clauses = (au, field) => {
    const b = against(au, field, "BETTER"), t = against(au, field, "TIES"), w = against(au, field, "WORSE"), out = [];
    if (b.length) out.push(`${list(b)} BEAT IT`); if (t.length) out.push(`${list(t)} TIE`); if (w.length) out.push(`${list(w)} ARE BELOW IT`);
    return out.join("; ") || "none";
};
export function bottomLines(au) {
    const nl = pairOf(au, "navigator", "leaky-unit", "belief").reading, fl = pairOf(au, "fly", "leaky-unit", "belief").reading, el = pairOf(au, "er", "leaky-unit", "belief").reading, fe = pairOf(au, "fly", "er", "belief").reading;
    const bBeat = against(au, "belief", "BETTER"), fBeat = against(au, "flight", "BETTER"), gap = bBeat.filter((a) => !fBeat.includes(a));
    const others = READ_IDS.concat(["leaky-unit-off"]).map((a) => lostOf(au, a)), sum = others.reduce((x, y) => x + y, 0);
    return [
        `BELIEF AGAINST THE HELD HEADING: ${clauses(au, "belief")}`,
        `THE NAVIGATOR ${word(nl)} THE LEAKY UNIT IN BELIEF`,
        `THE FLY HEADING LOOP ${word(fl)} THE LEAKY UNIT IN BELIEF; THE RANDOM WIRING ${word(el)} IT`,
        `THE FLY HEADING LOOP ${word(fe)} THE RANDOM WIRING IN BELIEF`,
        `FLIGHT AGAINST THE HELD HEADING: ${clauses(au, "flight")}`,
        `BELIEF BEATS THE HELD HEADING BUT FLIGHT DOES NOT: ${list(gap) || "none"}`,
        `LOST SUBS: held ${lostOf(au, "held")}, the other arms ${sum} (${Math.max(...others)} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, has = (a) => au.runs[a];
    const sizes = ARM_IDS.every((a) => has(a) && has(a).length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids: ${sizes}` });
    const same = ARM_IDS.every((a) => has(a) && has(a).every((r, i) => has("held")[i] && r.key === has("held")[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm: ${same}` });
    const inside = ARM_IDS.every((a) => has(a) && has(a).every((r) => r.belief > 0 && r.belief < 1 && r.flight > 0 && r.flight < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `every belief and flight score is inside (0, 1): ${inside}` });
    const dark = ARM_IDS.every((a) => has(a) && has(a).every((r) => r.dark > 0));
    rows.push({ name: "DARK TICKS EXIST", ok: dark, text: `every run had dark ticks: ${dark}` });
    const lesion = ["belief", "flight"].every((f) => has("leaky-unit-off") && has("leaky-unit-off").every((r, i) => has("held")[i] && Math.abs(r[f] - has("held")[i][f]) < 1e-9));   // 1e-9, not exact: the belief is read off an attitude recomputed through a rotation by zero, 1e-16 off on some ids
    rows.push({ name: "LESION IS THE HELD HEADING", ok: lesion, text: `leaky-unit-off equals held (within 1e-9) on every id, belief and flight: ${lesion}` });
    const event = has("held") && has("navigator") && has("held").some((r, i) => has("navigator")[i] && r.belief !== has("navigator")[i].belief);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `held and navigator differ on belief on at least one id: ${event}` });
    const distinct = new Set(["held", ...READ_IDS].map((a) => (has(a) || []).map((r) => r.belief).join("|"))).size === 5;
    rows.push({ name: "ARMS DISTINCT", ok: distinct, text: `the five arms other than the lesion are pairwise different on belief: ${distinct}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const L2 = [`ROUND H4: the heading each pilot believes through the compass dropout. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, one sub per tank; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L2.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L2.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L2; }
    const mean = (a, f) => au.runs[a].reduce((s, r) => s + r[f], 0) / au.runs[a].length;
    L2.push("means (belief rms in rad / belief score / flight score):");
    for (const a of ARM_IDS) L2.push(`  ${a.padEnd(16)} ${((1 - mean(a, "belief")) * Math.PI).toFixed(4)} / ${mean(a, "belief").toFixed(4)} / ${mean(a, "flight").toFixed(4)}`);
    L2.push("against the held heading:");
    for (const a of READ_IDS) L2.push(`${a}:`, `   belief ${fmt(pairOf(au, a, "held", "belief"))}`, `   flight ${fmt(pairOf(au, a, "held", "flight"))}`);
    L2.push("memory against memory:");
    for (const [a, b] of [["navigator", "leaky-unit"], ["fly", "leaky-unit"], ["er", "leaky-unit"], ["fly", "er"]]) L2.push(`${a} minus ${b}:`, `   belief ${fmt(pairOf(au, a, b, "belief"))}`, `   flight ${fmt(pairOf(au, a, b, "flight"))}`);
    for (const l of bottomLines(au)) L2.push(`BOTTOM LINE: ${l}`);
    return L2;
}
