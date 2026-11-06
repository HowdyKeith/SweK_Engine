// WebGLEngine/tools/ship/headToHead8.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHead8Cmd.mjs; the gate is tools/ship/headToHead8-selfcheck.mjs)
//
// ROUND H8 of brain/HEAD_TO_HEAD.md (registered before this file existed): MEMORY ON A REAL GYRO. The heading each memory (the dead-reckoning navigator, the leaky unit, the fly heading loop, a random wiring) believes through the tank's compass dropout,
// when the body rates the MEMORY reads (the autopilot keeps the true state) carry a constant bias per axis and white noise per tick, at the three levels of tools/subDisturb.mjs's rate noise; read against the held heading as paired differences with a registered
// verdict. The navigator, the leaky unit and the page's two estimators are used UNMODIFIED: the wrapper hands them a state whose body rates are wrong and hands the inner autopilot the true ones. Reads nothing from disk (the command hands in the two estimator
// builders). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";
import * as L from "../../brain/pilotLeakyHeading.mjs";
import * as A from "../../render/subAquariumSim.mjs";
import * as N from "../subNavigator.mjs";
import * as H4 from "./headToHead4.mjs";

export const IDS = Object.freeze({ from: 8000, to: 8199 }), SECONDS = 160, TICK = 1 / 30, SETTLE = 12, BIN_S = 4, BINS = 4, H4_IDS = 3;
/** The gyro levels: bias (rad/s, sd of the constant drawn per axis per flight) and white (rad/s, sd per axis per tick); 1 to 3 are tools/subDisturb.mjs's rate noise at x1, x3 and x5. */
export const LEVELS = Object.freeze([
    Object.freeze({ name: "perfect", bias: 0, white: 0 }), Object.freeze({ name: "good", bias: 0.002, white: 0.003 }),
    Object.freeze({ name: "rough", bias: 0.006, white: 0.009 }), Object.freeze({ name: "bad day", bias: 0.02, white: 0.015 }),
]);
export const MEMORY_IDS = Object.freeze(["navigator", "leaky-unit", "fly", "er"]);
/** The two memories whose survival the verdict reads. */
export const VERDICT_IDS = Object.freeze(["navigator", "leaky-unit"]);
export const cellId = (arm, level) => `${arm}@${level}`;
export const CELL_IDS = Object.freeze(["held", ...MEMORY_IDS.flatMap((a) => LEVELS.map((_, l) => cellId(a, l)))]);
const TWO_PI = 2 * Math.PI, wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
function mulberry(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const levelOf = (level) => {
    const rec = typeof level === "number" ? LEVELS[level] : level;
    if (!rec || !(rec.bias >= 0 && Number.isFinite(rec.bias)) || !(rec.white >= 0 && Number.isFinite(rec.white))) throw new Error(`headToHead8: a gyro level is 0..${LEVELS.length - 1} or { bias, white } of numbers from 0, got ${JSON.stringify(level)}`);
    return rec;
};
/** A gyro of `level` seeded by `seed`: (w) -> the body rates it reports, w + b + e (b drawn once from N(0, bias) per axis, e fresh each call from N(0, white) per axis). Exposes `bias` (the three constants). */
export function gyroOf(level, seed) {
    const lv = levelOf(level), r = mulberry((seed * 2654435761 + 40503) >>> 0), bias = [0, 1, 2].map(() => gauss(r) * lv.bias);
    const g = (w) => w.map((v, i) => v + bias[i] + gauss(r) * lv.white);
    g.bias = bias;
    return g;
}
/** A builder (inner) -> pilot for the tank's estimator event: `make(shim)` is the memory, built unmodified around a shim that gives the inner pilot the TRUE state; the memory itself is handed the state with the gyro's body rates. */
export function noisyMemory(make, level, seed) {
    if (typeof make !== "function") throw new Error("headToHead8.noisyMemory: make must be a function (inner) => pilot");
    return (inner) => {
        let trueW = null;
        const shim = (st, tg, cur, aux) => inner({ ...st, w: trueW }, tg, cur, aux), mem = make(shim), g = gyroOf(level, seed);
        const pilot = (state, tg, cur, aux) => { trueW = state.w; return mem({ ...state, w: g(state.w) }, tg, cur, aux); };
        pilot.gyro = g;
        return pilot;
    };
}
/** The memory `arm` as an (inner) -> pilot builder: the navigator and the leaky unit as they are, the two estimators from `builders` = { fly, er }. */
export function memoryBuilder(arm, builders) {
    if (arm === "navigator") return (inner) => N.navigator(inner);
    if (arm === "leaky-unit") return (inner) => L.leakyHeading(inner, { sigma: L.DEFAULTS.sigma, gain: L.DEFAULTS.gain });
    if (arm === "fly" || arm === "er") { if (!builders || typeof builders[arm] !== "function") throw new Error(`headToHead8.memoryBuilder: builders.${arm} must be a function (inner) => pilot`); return builders[arm]; }
    throw new Error(`headToHead8.memoryBuilder: arm must be one of ${MEMORY_IDS.join(", ")}, got ${JSON.stringify(arm)}`);
}
/** The seventeen cells, each { id, arm, level, event, build (n -> builder, or null for held) }. */
export function cellsOf(builders) {
    for (const k of ["fly", "er"]) if (!builders || typeof builders[k] !== "function") throw new Error(`headToHead8.cellsOf: builders.${k} must be a function (inner) => pilot`);
    return [{ id: "held", arm: "held", level: null, event: "dropout", build: null },
        ...MEMORY_IDS.flatMap((arm) => LEVELS.map((_, level) => ({ id: cellId(arm, level), arm, level, event: "fly-estimator", build: (n) => noisyMemory(memoryBuilder(arm, builders), level, n) })))];
}
/** One id of one cell in its own tank: { belief (1 - rms/pi over the dark ticks), flight (1 - mean settled dark heading error/pi), lost, dark, bins (the rms compass error per BIN_S bin since the window opened, null for an empty bin) }. */
export function flight(cell, n, seconds = SECONDS, makeTank = A.createTank) {   // `makeTank` is for the gate: a scripted tank whose belief and heading errors are known in advance
    const id = "sb-" + n, q = makeTank();
    if (cell.build) q.registerEstimator(cell.event, cell.build(n));
    q.sync([{ id, name: "H8 " + cell.id, hue: 100, from: "board", local: true, theta: null, pilot: "autopilot", circuit: "gfc", weights: null }]);
    q.setEvent(id, cell.event);
    const sq = Array.from({ length: BINS }, () => 0), cn = Array.from({ length: BINS }, () => 0);
    let target = null, age = 0, sumSq = 0, dark = 0, sum = 0, cnt = 0, sumAll = 0, cntAll = 0, last = null, run = 0;
    for (let i = 0, m = Math.round(seconds / TICK); i < m; i++) {
        q.step(TICK); const s = q.snapshot()[0]; last = s;
        if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
        if (s.compass && s.compass.valid === false) {
            const b = Math.min(BINS - 1, Math.floor(run * TICK / BIN_S + 1e-9)); run++;
            dark++; sumSq += s.compass.error * s.compass.error; sq[b] += s.compass.error * s.compass.error; cn[b]++;
            const e = Math.abs(wrap(s.target.heading - s.heading)); sumAll += e; cntAll++; if (age >= SETTLE) { sum += e; cnt++; }
        } else run = 0;
    }
    if (!dark) throw new Error(`headToHead8.flight: cell ${cell.id} id ${id} had no dark ticks`);
    const err = cnt ? sum / cnt : sumAll / cntAll;
    return { belief: 1 - Math.sqrt(sumSq / dark) / Math.PI, flight: 1 - err / Math.PI, lost: !!last.lost, dark, bins: sq.map((v, b) => (cn[b] ? Math.sqrt(v / cn[b]) : null)) };
}
/** EVERY cell once on `range` ids: { runs: { cell: [{ key, belief, flight, bad, dark, bins }] }, range, seconds, h4 }. `h4` = H4's navigator and leaky-unit arms flown on the first H4_IDS ids with H4's own flight, for the check that level 0 is H4's arm. `flightFn` and `h4Fn` are the flights (the gate hands in fakes). */
export function audit(builders, { range = IDS, seconds = SECONDS, flightFn = flight, h4Fn = H4.flight, withH4 = true } = {}) {
    const runs = {};
    for (const cell of cellsOf(builders)) {
        runs[cell.id] = [];
        for (let n = range.from; n <= range.to; n++) { const f = flightFn(cell, n, seconds); runs[cell.id].push({ key: "sb-" + n, belief: f.belief, flight: f.flight, bad: f.lost, dark: f.dark, bins: f.bins }); }
    }
    let h4 = null;
    if (withH4) {
        h4 = {}; const arms = H4.armsOf({ fly: (i) => i, er: (i) => i });
        for (const id of ["navigator", "leaky-unit"]) { const a = arms.find((x) => x.id === id); h4[id] = []; for (let n = range.from; n < Math.min(range.from + H4_IDS, range.to + 1); n++) { const f = h4Fn(a, n, seconds); h4[id].push({ key: "sb-" + n, belief: f.belief, flight: f.flight }); } }
    }
    return { runs, range, seconds, h4 };
}
const asRuns = (au, id, field) => au.runs[id].map((r) => ({ key: r.key, score: r[field], bad: r.bad }));
const mk = (p) => ({ ...p, reading: B.readingOf(p) });
/** `a` minus `b` on `field` ("belief" or "flight"), pooled and paired. */
export const pairOf = (au, a, b, field = "belief") => mk(B.paired(asRuns(au, a, field), asRuns(au, b, field)));
export const meanOf = (au, a, field) => au.runs[a].reduce((s, r) => s + r[field], 0) / au.runs[a].length;
/** The mean over the ids of a cell's rms compass error through its dark ticks, in rad: (1 - belief) pi. */
export const errorOf = (au, a) => au.runs[a].reduce((s, r) => s + (1 - r.belief) * Math.PI, 0) / au.runs[a].length;
/** A cell's window profile: the mean over the ids of the rms compass error in each bin (ids with an empty bin left out of that bin). */
export const profileOf = (au, a) => Array.from({ length: BINS }, (_, b) => { const v = au.runs[a].map((r) => r.bins[b]).filter((x) => x !== null); return v.reduce((s, x) => s + x, 0) / v.length; });
/** The navigator's (or another memory's) cost of the level: level `l` minus level 0 on belief. */
export const costOf = (au, arm, l = 3) => pairOf(au, cellId(arm, l), cellId(arm, 0), "belief");
/** What the verdict reads: { survives, failLevel (the lowest level at which a verdict memory does not read BETTER than held, or null), failing (the arms that do not at that level) }. */
export function survival(au) {
    for (let l = 1; l < LEVELS.length; l++) {
        const failing = VERDICT_IDS.filter((a) => pairOf(au, cellId(a, l), "held", "belief").reading !== "BETTER");
        if (failing.length) return { survives: false, failLevel: l, failing };
    }
    return { survives: true, failLevel: null, failing: [] };
}
/** The registered verdict. */
export function verdictOf(au) {
    const s = survival(au);
    return s.survives ? "THE MEMORY SURVIVES THE GYRO" : `THE MEMORY FAILS AT LEVEL ${s.failLevel}: ${s.failing.join(", ")}`;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), word = (r) => (r === "BETTER" ? "BETTER" : r === "WORSE" ? "WORSE" : "TIES");
const lostOf = (au, c) => au.runs[c].reduce((s, r) => s + (r.bad ? 1 : 0), 0);
export function bottomLines(au) {
    const lv = LEVELS.map((_, l) => `L${l} ` + MEMORY_IDS.map((a) => `${a} ${word(pairOf(au, cellId(a, l), "held", "belief").reading)}`).join(", ")).join("; ");
    const err = (a) => LEVELS.map((_, l) => errorOf(au, cellId(a, l)).toFixed(3)).join("/");
    const cn = costOf(au, "navigator"), cl = costOf(au, "leaky-unit"), prof = profileOf(au, cellId("navigator", 3)), top = (a) => pairOf(au, cellId(a, 3), "held", "flight").reading;
    const memLost = MEMORY_IDS.flatMap((a) => LEVELS.map((_, l) => lostOf(au, cellId(a, l)))), sum = memLost.reduce((x, y) => x + y, 0);
    return [
        `BELIEF AGAINST THE HELD HEADING, BY LEVEL: ${lv}`,
        `GYRO ERROR IN THE BELIEF (rms rad, mean over the ids, levels 0/1/2/3): navigator ${err("navigator")}; leaky-unit ${err("leaky-unit")}; held ${errorOf(au, "held").toFixed(3)}`,
        `THE ROUGH GYRO COSTS THE NAVIGATOR ${sgn(cn.mean)} IN BELIEF (${word(cn.reading)}); THE LEAKY UNIT ${sgn(cl.mean)} (${word(cl.reading)})`,
        `WINDOW PROFILE, NAVIGATOR AT LEVEL 3 (rms rad by ${BIN_S} s bin): ${prof.map((x) => x.toFixed(3)).join(", ")}`,
        `FLIGHT AT LEVEL 3: navigator ${word(top("navigator"))}, leaky-unit ${word(top("leaky-unit"))} AGAINST THE HELD HEADING`,
        `VERDICT: ${verdictOf(au)}`,
        `LOST SUBS: held ${lostOf(au, "held")}, memories ${sum} (${Math.max(...memLost)} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, has = (c) => au.runs[c];
    const sizes = CELL_IDS.every((c) => has(c) && has(c).length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every cell flew ${n} ids: ${sizes}` });
    const same = CELL_IDS.every((c) => has(c) && has(c).every((r, i) => has("held")[i] && r.key === has("held")[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every cell: ${same}` });
    const inside = CELL_IDS.every((c) => has(c) && has(c).every((r) => r.belief > 0 && r.belief < 1 && r.flight > 0 && r.flight < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `every belief and flight score is inside (0, 1): ${inside}` });
    const dark = CELL_IDS.every((c) => has(c) && has(c).every((r) => r.dark > 0));
    rows.push({ name: "DARK TICKS EXIST", ok: dark, text: `every run had dark ticks: ${dark}` });
    const h4 = !!au.h4 && VERDICT_IDS.every((a) => au.h4[a] && au.h4[a].length > 0 && au.h4[a].every((r, i) => has(cellId(a, 0))[i] && r.key === has(cellId(a, 0))[i].key && Math.abs(r.belief - has(cellId(a, 0))[i].belief) < 1e-9 && Math.abs(r.flight - has(cellId(a, 0))[i].flight) < 1e-9));
    rows.push({ name: "LEVEL 0 IS H4'S ARM", ok: h4, text: `the navigator and the leaky unit at level 0 equal H4's arms (within 1e-9, belief and flight) on the first ${H4_IDS} ids: ${h4}` });
    const prof = has(cellId("navigator", 3)) && has(cellId("navigator", 3)).every((r) => Array.isArray(r.bins) && r.bins.length === BINS) ? profileOf(au, cellId("navigator", 3)) : null, rise = !!prof && prof[BINS - 1] > prof[0];
    rows.push({ name: "THE BIAS INTEGRATES", ok: rise, text: `the navigator's mean error at level 3 is larger in the last ${BIN_S} s bin of a window than in the first: ${rise}` });
    const distinct = new Set(CELL_IDS.map((c) => (has(c) || []).map((r) => r.belief).join("|"))).size === CELL_IDS.length;
    rows.push({ name: "CELLS DISTINCT", ok: distinct, text: `the ${CELL_IDS.length} cells are pairwise different on belief: ${distinct}` });
    return rows;
}
const fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const R = [`ROUND H8: memory on a biased, noisy gyro. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, one sub per tank; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) R.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { R.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return R; }
    R.push("means (belief rms error in rad / belief score / flight score):");
    for (const c of CELL_IDS) R.push(`  ${c.padEnd(16)} ${errorOf(au, c).toFixed(4)} / ${meanOf(au, c, "belief").toFixed(4)} / ${meanOf(au, c, "flight").toFixed(4)}`);
    R.push("against the held heading:");
    for (const c of CELL_IDS.filter((x) => x !== "held")) R.push(`${c}:`, `   belief ${fmt(pairOf(au, c, "held", "belief"))}`, `   flight ${fmt(pairOf(au, c, "held", "flight"))}`);
    R.push("each level minus level 0 (belief):");
    for (const a of MEMORY_IDS) for (let l = 1; l < LEVELS.length; l++) R.push(`${a} level ${l}: ${fmt(costOf(au, a, l))}`);
    R.push("window profile (rms rad by 4 s bin since the window opened):");
    for (const a of MEMORY_IDS) for (let l = 0; l < LEVELS.length; l++) R.push(`  ${cellId(a, l).padEnd(14)} ${profileOf(au, cellId(a, l)).map((x) => x.toFixed(3)).join(" ")}`);
    for (const l of bottomLines(au)) R.push(`BOTTOM LINE: ${l}`);
    return R;
}
