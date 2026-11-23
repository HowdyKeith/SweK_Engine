// WebGLEngine/tools/ship/subReactStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 6" in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subReactStudy-selfcheck.mjs)
//
// THE STUDY OF REACTING TRAFFIC: flies hard-traffic scenarios (brain/subHardNav.mjs) with ships that REACT (brain/subReactNav.mjs: react-none, react-turn, react-stop) under three arms -- any+replan, the nominal-belief any+predict+edge+yield (FOLLOW-UP 5's designated arm) and the estimated-belief est+predict+edge+yield (designated here) --
// and reads the registered verdict and the predictions R1 to R8 and two more.
//   node tools/ship/subReactStudy.mjs --set dev [--seeds N]               DEV (seeds 1 to 30 of each behaviour): the sanity run; not a result
//   node tools/ship/subReactStudy.mjs --set held6 [--seeds N] [--write]    HELD6, seeds 601 to 660, READ ONCE; --write puts every flight in brain/subReactHeld6.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as H from "../../brain/subHardNav.mjs";
import * as R from "../../brain/subReactNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subReactHeld6.jsonl", SETS = R.SETS;
export const THRESH = Object.freeze({ gain: 5, within: 3, stopLoss: 2, timeouts: 3, timeFactor: 1.25 });
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** The numbers per behaviour and arm: { behaviour: { arm: { n, reached, rate, collided, shipHits, left, timeout, other, medianTime (arrivals), medianChord (path over the chord, arrivals), medianClearance (all) } } }. */
export function summarize(runs) {
    const cells = {};
    for (const b of R.BEHAVIOURS) for (const arm of R.REACT_ARMS) {
        const rs = runs.filter((r) => r.behaviour === b && r.arm === arm);
        if (!rs.length) continue;
        const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached);
        (cells[b] || (cells[b] = {}))[arm] = { n: rs.length, reached: done.length, rate: done.length / rs.length, collided: count("collided"), shipHits: rs.filter((r) => r.status === "collided" && r.hit === "ship").length, left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, medianTime: median(done.map((r) => r.t)), medianChord: median(done.map((r) => r.path / r.chord)), medianClearance: median(rs.map((r) => r.minClearance)) };
    }
    return { cells };
}
/**
 * The verdict and R1 to R8 (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 6"). The designated arm (R.DESIGNATED) has the GAIN in a behaviour when it reaches at least THRESH.gain more than the nominal arm (R.NOMINAL_ARM) there. SUPPORTED if the gain holds in react-turn AND react-stop, PARTLY SUPPORTED if in one, NOT SUPPORTED otherwise.
 * R1: in react-none the two reach within THRESH.within of each other. R2: the nominal arm reaches at least as many in react-turn as in react-none. R3: the nominal arm reaches at most THRESH.stopLoss fewer in react-stop than in react-none. R4, R5: the gain in react-turn, in react-stop. R6: any+replan reaches fewer than the nominal arm in each behaviour.
 * R7: the designated arm times out in at most THRESH.timeouts flights in all. R8: its exits in react-turn and in react-stop are each at most its exits in react-none. R9: its collisions with ships in react-turn are fewer than the nominal arm's. R10: its median arrival time is at most THRESH.timeFactor times the nominal arm's in every behaviour.
 * A missing cell is a miss, never a throw.
 */
export function judge(sum) {
    const c = sum.cells, d = (b) => (c[b] || {})[R.DESIGNATED], n = (b) => (c[b] || {})[R.NOMINAL_ARM], rp = (b) => (c[b] || {})["any+replan"];
    const gainIn = (b) => !!d(b) && !!n(b) && d(b).reached - n(b).reached >= THRESH.gain, gainTurn = gainIn("react-turn"), gainStop = gainIn("react-stop");
    const verdict = gainTurn && gainStop ? "SUPPORTED" : gainTurn || gainStop ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const r1 = !!d("react-none") && !!n("react-none") && Math.abs(d("react-none").reached - n("react-none").reached) <= THRESH.within;
    const r2 = !!n("react-turn") && !!n("react-none") && n("react-turn").reached >= n("react-none").reached, r3 = !!n("react-stop") && !!n("react-none") && n("react-none").reached - n("react-stop").reached <= THRESH.stopLoss;
    const r6 = R.BEHAVIOURS.every((b) => !!rp(b) && !!n(b) && rp(b).reached < n(b).reached);
    const r7 = R.BEHAVIOURS.every((b) => !!d(b)) && R.BEHAVIOURS.reduce((t, b) => t + d(b).timeout, 0) <= THRESH.timeouts;
    const r8 = !!d("react-none") && ["react-turn", "react-stop"].every((b) => !!d(b) && d(b).left <= d("react-none").left);
    const r9 = !!d("react-turn") && !!n("react-turn") && d("react-turn").shipHits < n("react-turn").shipHits;
    const ratios = R.BEHAVIOURS.map((b) => (d(b) && n(b) ? d(b).medianTime / n(b).medianTime : NaN)), r10 = ratios.every((x) => Number.isFinite(x) && x <= THRESH.timeFactor);
    return { gainTurn, gainStop, verdict, r1, r2, r3, r4: gainTurn, r5: gainStop, r6, r7, r8, r9, r10, timeRatios: ratios };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(sum, title) {
    const lines = [title, "behaviour   arm                    | reached      | collided (ships) left timeout other | median time (s) | median path/chord | median min clearance (m)"];
    for (const b of R.BEHAVIOURS) for (const arm of R.REACT_ARMS) { const x = (sum.cells[b] || {})[arm]; if (!x) continue; lines.push(`${b.padEnd(11)} ${arm.padEnd(22)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} (${String(x.shipHits).padStart(2)}) ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${f2s(x.medianTime).padStart(15)} | ${f2s(x.medianChord).padStart(17)} | ${f2s(x.medianClearance).padStart(24)}`); }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), d = R.DESIGNATED, nm = R.NOMINAL_ARM;
    return [`${d} reaches at least ${THRESH.gain} more than ${nm}: in react-turn ${yn(j.gainTurn)}, in react-stop ${yn(j.gainStop)} => ${j.verdict}`,
        `R1 in react-none the two reach within ${THRESH.within} of each other: ${yn(j.r1)}`, `R2 ${nm} reaches at least as many in react-turn as in react-none: ${yn(j.r2)}`, `R3 ${nm} reaches at most ${THRESH.stopLoss} fewer in react-stop than in react-none: ${yn(j.r3)}`, `R4 the gain in react-turn: ${yn(j.r4)}`, `R5 the gain in react-stop: ${yn(j.r5)}`,
        `R6 any+replan reaches fewer than ${nm} in each behaviour: ${yn(j.r6)}`, `R7 ${d} times out in at most ${THRESH.timeouts} flights in all: ${yn(j.r7)}`, `R8 ${d}'s exits in react-turn and react-stop are each at most its exits in react-none: ${yn(j.r8)}`, `R9 ${d}'s collisions with ships in react-turn are fewer than ${nm}'s: ${yn(j.r9)}`,
        `R10 ${d}'s median arrival time is at most ${THRESH.timeFactor} times ${nm}'s in every behaviour (${j.timeRatios.map(f2s).join(", ")}): ${yn(j.r10)}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subReactStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subReactStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subReactStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held6") { err("subReactStudy: --write goes with --set held6 only"); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.set.toUpperCase()} set: ${seeds.length} scenarios of hard-traffic x ${R.BEHAVIOURS.length} ship behaviours, ${R.REACT_ARMS.length} arms`);
    for (const seed of seeds) { const sc = H.hardScenario(seed, "hard-traffic"); for (const b of R.BEHAVIOURS) for (const arm of R.REACT_ARMS) runs.push(R.flyReact(pilot, sc, arm, b)); }
    const sum = summarize(runs);
    out(""); out(table(sum, `margin ladder ${H.MARGIN_LADDER.join(", ")} m, ${H.SECONDS_HARD} s a flight, edge +${H.EDGE_EXTRA} m, yield ${H.YIELD_SPEED} m/s, ships: clear ${R.SHIP_CLEAR} m, look ${R.SHIP_LOOK_S} s, turn ${R.TURN_RATE} rad/s to ${R.MAX_TURN} rad, stop ${R.STOP_ACCEL} m/s^2, estimate over ${R.EST_S} s`)); out(verdictText(judge(sum)));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
