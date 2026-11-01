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
//   node tools/tankFlyCxBench.mjs --paired [--ids 24] [--seconds 240] [--json]     THE PAIRED TEST OF THE MEMORY (brain/TANK_PILOTS_WIP.md, "FOLLOW-UP: DOES THE MEMORY MATTER?", registered before it was written): stateful minus stateless on the same fresh ids (mem-0 ..),
//                                                                                   three exact two-sided sign-flip permutation tests (P1 lit, P2 dark, P3 dark beyond lit) and the registered verdict
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
export const PAIR_ID_PREFIX = "mem-", PAIR_IDS = 24, PAIR_SECONDS = 240, ALPHA = 0.05, EXACT_LIMIT = 26;
/**
 * The exact two-sided sign-flip permutation p of a list of paired differences: the share of ALL 2^n sign assignments whose |sum| is at least the observed |sum| (the observed assignment included; a tolerance of 1e-8 of the sum of the |d| for the rounding of the walk).
 * Walks the assignments in Gray-code order (one sign flipped a step). n from 1 to EXACT_LIMIT (26); anything else throws.
 */
export function exactSignFlipP(d) {
    const n = d.length;
    if (!Number.isInteger(n) || n < 1 || n > EXACT_LIMIT) throw new Error(`tankFlyCxBench.exactSignFlipP: needs 1 to ${EXACT_LIMIT} differences, got ${n}`);
    if (d.some((x) => !Number.isFinite(x))) return NaN;
    let sum = d.reduce((a, x) => a + x, 0); const obs = Math.abs(sum), eps = 1e-8 * d.reduce((a, x) => a + Math.abs(x), 0), signs = new Int8Array(n).fill(1), total = 2 ** n;
    let count = Math.abs(sum) >= obs - eps ? 1 : 0;
    for (let i = 1; i < total; i++) {
        let j = 0, v = i; while ((v & 1) === 0) { v >>= 1; j++; }
        sum -= 2 * signs[j] * d[j]; signs[j] = -signs[j];
        if (Math.abs(sum) >= obs - eps) count++;
    }
    return count / total;
}
/** Paired differences summarised: { n, mean, sd, se, p (exact two-sided sign-flip), better (how many are below 0), holds (mean below 0 and p below ALPHA) }. A list with a missing number has p NaN and does not hold. */
export function pairedStats(d) {
    const m = meanSd(d), p = exactSignFlipP(d);
    return { n: m.n, mean: m.mean, sd: m.sd, se: m.sd / Math.sqrt(m.n), p, better: d.filter((x) => x < 0).length, holds: m.mean < 0 && p < ALPHA };
}
/** The registered verdict of the paired test from the three tests' `holds`. */
export const pairedVerdict = (h1, h2, h3) => (h3 ? "MEMORY HELPS MORE IN THE DARK" : h1 && h2 ? "MEMORY HELPS, NOT DARK-SPECIFIC" : !h1 && !h2 ? "NO MEASURABLE EFFECT OF MEMORY" : "MIXED");
/**
 * The paired test: the stateful and the stateless arm on `ids` NEW ids (prefix + 0 ..), each with no event and through the dropout. Returns { ids, seconds, rows: [{ id, stateful: { none, drop }, stateless: { none, drop } }], diffs { p1, p2, p3, a1, a2 }, tests { p1, p2, p3, a1, a2 }, verdict }.
 * d(P1) = the settled lit error with no event; d(P2) = the settled dark error of the dropout run; d(P3) = d(P2) minus the same difference of the dropout run's lit error; a1 and a2 = the all-ticks versions of P1 and P2 (reported, not part of the verdict). Each d is stateful minus stateless.
 */
export function pairedBench({ ids = PAIR_IDS, seconds = PAIR_SECONDS, prefix = PAIR_ID_PREFIX } = {}, inputs = loadInputs()) {
    const idList = Array.from({ length: ids }, (_, i) => prefix + i), rows = idList.map((id) => ({ id, stateful: { none: runArm("stateful", id, { seconds, event: null }, inputs), drop: runArm("stateful", id, { seconds, event: "dropout" }, inputs) }, stateless: { none: runArm("stateless", id, { seconds, event: null }, inputs), drop: runArm("stateless", id, { seconds, event: "dropout" }, inputs) } }));
    const diff = (f) => rows.map((r) => f(r.stateful) - f(r.stateless));
    const diffs = { p1: diff((a) => a.none.lit), p2: diff((a) => a.drop.dark), p3: diff((a) => a.drop.dark - a.drop.lit), a1: diff((a) => a.none.litAll), a2: diff((a) => a.drop.darkAll) }, tests = {};
    for (const k of Object.keys(diffs)) tests[k] = pairedStats(diffs[k]);
    return { ids: idList, seconds, rows, diffs, tests, verdict: pairedVerdict(tests.p1.holds, tests.p2.holds, tests.p3.holds) };
}
const fp = (v) => (Number.isFinite(v) ? (v < 0.0001 ? v.toExponential(1) : v.toFixed(4)) : "n/a"), f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : "n/a");
/** The printed paired test. */
export function pairedText(res) {
    const lines = [`paired test: stateful minus stateless, ${res.ids.length} new ids x ${res.seconds} s (negative = the memory helps); exact two-sided sign-flip permutation p over all 2^${res.ids.length} sign assignments`, "test                                   |  mean diff | sd     | se     | ids better | exact p"];
    for (const [k, label] of [["p1", "P1  settled error, compass lit, no event"], ["p2", "P2  settled error, DARK windows"], ["p3", "P3  dark beyond lit (difference of differences)"], ["a1", "    all ticks, lit, no event (reported)"], ["a2", "    all ticks, DARK (reported)"]]) {
        const t = res.tests[k]; lines.push(`${label.padEnd(38)} | ${f4(t.mean).padStart(10)} | ${f4(t.sd)} | ${f4(t.se)} | ${(t.better + "/" + t.n).padStart(10)} | ${fp(t.p)}${t.holds ? "   HOLDS" : ""}`);
    }
    lines.push(`VERDICT: ${res.verdict}`);
    return lines.join("\n");
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
/** The command as a function: returns the exit code (0 fine, 1 the inputs cannot be read, 2 a bad argument). `io` is for the gate: { out, err, load, paired (a stand-in for pairedBench) }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m));
    const opts = { ids: 12, seconds: 160 }; let json = false, paired = false, gaveIds = false, gaveSeconds = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--json") json = true;
        else if (a === "--paired") paired = true;
        else if (a === "--ids" || a === "--seconds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v < 1 || (a === "--seconds" && v < 40)) { err(`tankFlyCxBench: ${a} needs a whole number (ids at least 1, seconds at least 40)`); return 2; } opts[a.slice(2)] = v; if (a === "--ids") gaveIds = true; else gaveSeconds = true; }
        else { err(`tankFlyCxBench: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (paired) { if (!gaveIds) opts.ids = PAIR_IDS; if (!gaveSeconds) opts.seconds = PAIR_SECONDS; if (opts.ids > EXACT_LIMIT) { err(`tankFlyCxBench: --paired takes at most ${EXACT_LIMIT} ids (the test enumerates every sign assignment)`); return 2; } }
    let inputs; try { inputs = (io.load || loadInputs)(); } catch (e) { err("tankFlyCxBench: cannot read the inputs: " + String(e.message || e).slice(0, 200)); return 1; }
    if (paired) { const pr = (io.paired || pairedBench)(opts, inputs); out(json ? JSON.stringify({ tests: pr.tests, verdict: pr.verdict }) : pairedText(pr)); return 0; }
    const res = bench(opts, inputs);
    out(json ? JSON.stringify(res.summary) : table(res));
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
