// WebGLEngine/tools/tankFlyCxBench.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/tankFlyCxBench-selfcheck.mjs)
//
// WHAT THE STATEFUL FLY PILOT DOES IN THE SUB AQUARIUM'S TANK, MEASURED (brain/TANK_PILOTS_WIP.md, "What it will and will not show"). Rung 4a said the cx champion does not integrate a heading: through the compass dropout
// its heading error in the dark windows is about the plain autopilot's. The tank is not that task (a wandering target that changes every 20 to 45 s instead of one 60 s dive), so this bench asks the question again in the
// tank itself, with the tank's own dropout event, and says what it finds -- whichever way it goes.
//
// The arms (each its own one-sub tank, so no sub sees another; the same sub id in every arm, so they spawn at the same place and take the same first target):
//   autopilot   no weights: the PD autopilot
//   network     the Giant Fiber Circuit network (963 weights, gfc), the noisy-senses champion
//   stateful    the fly heading loop with its memory (1,729 weights, flycx), flown by render/subAquariumFlyCx.mjs
//   stateless   the same weights, memory switched off (render/subAquariumFlyCx.mjs persist: false) -- what the memory does
// The measure: each tick, the angle between the sub's heading and its wandering target's heading (|wrapped|, rad), kept apart for ticks with the compass LIT and ticks with it DARK (the snapshot's compass.valid), and for the
// run with NO event (the compass always lit). TWO READINGS of it: SETTLED ticks only -- at least SETTLE seconds since the sub's wandering target last changed (a retarget, a wall turn or a respawn replaces the target object), which is
// "does it hold its line", the question rung 4a asked -- and ALL ticks, which includes the turn onto each new target. The sub's `lost` count (boats put back) is kept too. A paired difference (arm minus autopilot on the same id) is what
// the tables report, with the spread of those differences.
//   node tools/tankFlyCxBench.mjs [--ids 12] [--seconds 160] [--json]
// Pure apart from the files it reads. No clock, no Math.random: the tank's rng is seeded from the sub id.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../render/subAquariumSim.mjs";
import * as FX from "../render/subAquariumFlyCx.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..");
export const ARMS = Object.freeze(["autopilot", "network", "stateful", "stateless"]);
export const NETWORK_FILE = "brain/pilotSubWeightsRobustNoisyWip.json", CX_FILE = "brain/pilotSubFlyCxWip.json", CIRCUIT_FILE = "vendor/hemibrain/hemibrain-cx-heading-loop.json";
export const TICK = 1 / 30, SETTLE = 12;   // seconds after a new target before a tick counts as settled
const TWO_PI = 2 * Math.PI;
/** An angle wrapped into (-pi, pi]. */
export const wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };

/** The things a run needs, read from the tree (or handed in by the gate): { circuit, networkWeights, cxWeights }. */
export function loadInputs(root = ENG) {
    const j = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8")), cj = j(CIRCUIT_FILE);
    return { circuit: { neurons: cj.neurons, edges: cj.edges, io: cj.io }, networkWeights: j(NETWORK_FILE).weights, cxWeights: j(CX_FILE).weights };
}
/** The tank entry for an arm under an id. */
export function entryFor(arm, id, inputs) {
    const base = { id, name: "Bench " + arm, hue: 100, from: "bench", local: true, theta: null };
    if (arm === "autopilot") return { ...base, pilot: "autopilot", circuit: "gfc", weights: null };
    if (arm === "network") return { ...base, pilot: "network", circuit: "gfc", weights: inputs.networkWeights };
    if (arm === "stateful" || arm === "stateless") return { ...base, pilot: "stateful", circuit: "flycx", weights: inputs.cxWeights };
    throw new Error(`tankFlyCxBench: unknown arm "${arm}" (${ARMS.join(", ")})`);
}
/** Add one snapshot row of a sub to the running sums: the heading error to its wandering target, in the lit or the dark bucket (`age` seconds since its target last changed; a settled tick is also in the settled bucket). */
export function accumulate(acc, snap, age) {
    const e = Math.abs(wrap(snap.target.heading - snap.heading)), dark = !!(snap.compass && snap.compass.valid === false);
    const all = dark ? acc.darkAll : acc.litAll; all.n++; all.sum += e;
    if (age >= SETTLE) { const b = dark ? acc.dark : acc.lit; b.n++; b.sum += e; }
}
const bucket = () => ({ n: 0, sum: 0 });
const mean = (b) => (b.n ? b.sum / b.n : NaN);

/**
 * One arm on one id for `seconds`: { ticks (how many were flown), lit, dark: mean SETTLED error (rad) with the compass lit / dark (NaN when none), litAll, darkAll: the same over all ticks, nLit, nDark (settled ticks), lost, kind } -- the event is "dropout" or null for none.
 */
export function runArm(arm, id, { seconds = 160, event = "dropout" } = {}, inputs) {
    const q = A.createTank();
    if (arm === "stateful" || arm === "stateless") q.registerPilotKind("flycx", FX.flyCxKind(inputs.circuit, { persist: arm === "stateful" }));
    q.sync([entryFor(arm, id, inputs)]);
    if (event) q.setEvent(id, event);
    const acc = { lit: bucket(), dark: bucket(), litAll: bucket(), darkAll: bucket() };
    let target = null, age = 0;
    for (let i = 0, n = Math.round(seconds / TICK); i < n; i++) {
        q.step(TICK); const snap = q.snapshot()[0];
        if (snap.target !== target) { target = snap.target; age = 0; } else age += TICK;
        accumulate(acc, snap, age);
    }
    const last = q.snapshot()[0];
    return { ticks: Math.round(seconds / TICK), lit: mean(acc.lit), dark: mean(acc.dark), litAll: mean(acc.litAll), darkAll: mean(acc.darkAll), nLit: acc.lit.n, nDark: acc.dark.n, lost: last.lost, kind: last.kind };
}
/** The mean and the standard deviation (n - 1) of a list; the sd of fewer than two is NaN. */
export function meanSd(xs) {
    const n = xs.length; if (!n) return { mean: NaN, sd: NaN, n };
    const m = xs.reduce((s, x) => s + x, 0) / n;
    return { mean: m, sd: n > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1)) : NaN, n };
}
/**
 * The whole bench: for each id, every arm with no event and with `event` (the dropout unless the gate asks for another). Returns { ids, seconds, rows: [{ arm, id, none, drop }], summary: { arm -> { none: meanSd of lit error with no event, dropLit, dropDark,
 * darkMinusAutopilot: paired difference of dark error, darkMinusLit } } }. `ids` is a count; the ids are "bench-0" .. .
 */
export function bench({ ids = 12, seconds = 160, arms = ARMS, event = "dropout" } = {}, inputs = loadInputs()) {
    const idList = Array.from({ length: ids }, (_, i) => "bench-" + i), rows = [];
    for (const id of idList) for (const arm of arms) rows.push({ arm, id, none: runArm(arm, id, { seconds, event: null }, inputs), drop: runArm(arm, id, { seconds, event }, inputs) });
    const of = (arm) => rows.filter((r) => r.arm === arm), summary = {};
    for (const arm of arms) {
        const rs = of(arm), ap = rows.filter((r) => r.arm === "autopilot");
        const reading = (lit, dark) => ({
            none: meanSd(rs.map((r) => r.none[lit])), dropLit: meanSd(rs.map((r) => r.drop[lit])), dropDark: meanSd(rs.map((r) => r.drop[dark])),
            darkMinusAutopilot: arms.includes("autopilot") ? meanSd(rs.map((r, i) => r.drop[dark] - ap[i].drop[dark])) : null,
            darkMinusLit: meanSd(rs.map((r) => r.drop[dark] - r.drop[lit])),
        });
        summary[arm] = { settled: reading("lit", "dark"), all: reading("litAll", "darkAll"), lost: rs.reduce((s, r) => s + r.none.lost + r.drop.lost, 0) };
    }
    return { ids: idList, seconds, rows, summary };
}
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : "n/a");
const ms = (x) => (x ? `${f3(x.mean)} +- ${f3(x.sd)}` : "n/a");
/** The tables the command prints: the settled reading, then all ticks. */
export function table(res) {
    const lines = [`tank bench: ${res.ids.length} ids x ${res.seconds} s, heading error to the wandering target in rad (mean +- sd over ids); "dark" is the compass dropout's dark windows`];
    for (const [key, title] of [["settled", `SETTLED ticks (at least ${SETTLE} s since the target last changed): does it hold its line`], ["all", "ALL ticks (includes the turn onto each new target)"]]) {
        lines.push("", title, "arm        |  no event, lit  |  dropout, lit   |  dropout, DARK  |  dark - autopilot  |  dark - lit     | lost");
        for (const [arm, s] of Object.entries(res.summary)) lines.push(`${arm.padEnd(10)} | ${ms(s[key].none).padEnd(15)} | ${ms(s[key].dropLit).padEnd(15)} | ${ms(s[key].dropDark).padEnd(15)} | ${ms(s[key].darkMinusAutopilot).padEnd(18)} | ${ms(s[key].darkMinusLit).padEnd(15)} | ${s.lost}`);
    }
    return lines.join("\n");
}
/** The command as a function: returns the exit code (0 fine, 1 the inputs cannot be read, 2 a bad argument). `io` is for the gate: { out, err, load }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m));
    const opts = { ids: 12, seconds: 160 }; let json = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--json") json = true;
        else if (a === "--ids" || a === "--seconds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v < 1 || (a === "--seconds" && v < 40)) { err(`tankFlyCxBench: ${a} needs a whole number (ids at least 1, seconds at least 40)`); return 2; } opts[a.slice(2)] = v; }
        else { err(`tankFlyCxBench: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    let inputs; try { inputs = (io.load || loadInputs)(); } catch (e) { err("tankFlyCxBench: cannot read the inputs: " + String(e.message || e).slice(0, 200)); return 1; }
    const res = bench(opts, inputs);
    out(json ? JSON.stringify(res.summary) : table(res));
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
