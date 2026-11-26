// WebGLEngine/tools/ship/subAvoidStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 8" in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subAvoidStudy-selfcheck.mjs)
//
// THE STUDY OF A VESSEL THAT TURNS AWAY: flies hard-traffic scenarios (ships hold course) under three arms (brain/subAvoidNav.mjs) and reads the registered verdict and A1 to A7.
//   node tools/ship/subAvoidStudy.mjs --set dev [--seeds N]               DEV (seeds 1 to 30): the sanity run; not a result
//   node tools/ship/subAvoidStudy.mjs --set held8 [--seeds N] [--write]    HELD8, seeds 801 to 860, READ ONCE; --write puts every flight in brain/subAvoidHeld8.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../../brain/subAvoidNav.mjs";
import * as H from "../../brain/subHardNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subAvoidHeld8.jsonl", SETS = A.SETS;
export const THRESH = Object.freeze({ gain: 5, shipFraction: 0.5, timeFactor: 1.25, timeouts: 3, bar: 48 });
export const pilot = (s, t, c) => AP.decide(s, t, c);
const YIELD_AVOID = "any+predict+edge+yield+avoid";

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** { arm: { n, reached, rate, collided, shipHits, left, timeout, other, medianTime (arrivals), medianChord (arrivals), medianClearance (all), fires, turns, stuck } }, in AVOID_ARMS order, only the arms flown. */
export function summarize(runs) {
    const cells = {};
    for (const arm of A.AVOID_ARMS) {
        const rs = runs.filter((r) => r.arm === arm);
        if (!rs.length) continue;
        const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached), sum = (k) => rs.reduce((m, r) => m + (r[k] || 0), 0);
        cells[arm] = { n: rs.length, reached: done.length, rate: done.length / rs.length, collided: count("collided"), shipHits: rs.filter((r) => r.status === "collided" && r.hit === "ship").length, left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, medianTime: median(done.map((r) => r.t)), medianChord: median(done.map((r) => r.path / r.chord)), medianClearance: median(rs.map((r) => r.minClearance)), fires: sum("fires"), turns: sum("turns"), stuck: sum("stuck") };
    }
    return cells;
}
/**
 * The verdict and A1 to A7 (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 8"). The designated arm (A.DESIGNATED) against the reference (A.REFERENCE). GAIN (A1): reaches at least THRESH.gain more. A2: its ship collisions are at most THRESH.shipFraction of the reference's.
 * SUPPORTED if A1 and A2, PARTLY SUPPORTED if one, NOT SUPPORTED otherwise. A3: its exits are at most the reference's. A4: the yield+avoid arm reaches at least as many as the designated. A5: its median arrival time is at most THRESH.timeFactor times the reference's.
 * A6: it times out in at most THRESH.timeouts flights. A7: it reaches THRESH.bar. A missing cell is a miss, never a throw.
 */
export function judge(cells) {
    const d = cells[A.DESIGNATED], r = cells[A.REFERENCE], y = cells[YIELD_AVOID];
    const a1 = !!d && !!r && d.reached - r.reached >= THRESH.gain, a2 = !!d && !!r && d.shipHits <= THRESH.shipFraction * r.shipHits;
    const verdict = a1 && a2 ? "SUPPORTED" : a1 || a2 ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const ratio = d && r ? d.medianTime / r.medianTime : NaN;
    return { a1, a2, verdict, a3: !!d && !!r && d.left <= r.left, a4: !!d && !!y && y.reached >= d.reached, a5: Number.isFinite(ratio) && ratio <= THRESH.timeFactor, a6: !!d && d.timeout <= THRESH.timeouts, a7: !!d && d.reached >= THRESH.bar, timeRatio: ratio };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(cells, title) {
    const lines = [title, "arm                          | reached      | collided (ships) left timeout other | median time (s) | median path/chord | median min clearance (m) | fires turns stuck"];
    for (const arm of A.AVOID_ARMS) { const x = cells[arm]; if (!x) continue; lines.push(`${arm.padEnd(28)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} (${String(x.shipHits).padStart(2)}) ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${f2s(x.medianTime).padStart(15)} | ${f2s(x.medianChord).padStart(17)} | ${f2s(x.medianClearance).padStart(24)} | ${x.fires} ${x.turns} ${x.stuck}`); }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), d = A.DESIGNATED, rf = A.REFERENCE;
    return [`${d} against ${rf}: reaches at least ${THRESH.gain} more ${yn(j.a1)}; ship collisions at most ${THRESH.shipFraction} of the reference's ${yn(j.a2)} => ${j.verdict}`,
        `A1 the reach gain: ${yn(j.a1)}`, `A2 ship collisions at most half the reference's: ${yn(j.a2)}`, `A3 ${d}'s exits are at most ${rf}'s: ${yn(j.a3)}`, `A4 ${YIELD_AVOID} reaches at least as many as ${d}: ${yn(j.a4)}`,
        `A5 ${d}'s median arrival time is at most ${THRESH.timeFactor} times ${rf}'s (${f2s(j.timeRatio)}): ${yn(j.a5)}`, `A6 ${d} times out in at most ${THRESH.timeouts} flights: ${yn(j.a6)}`, `A7 ${d} reaches ${THRESH.bar} of 60: ${yn(j.a7)}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subAvoidStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subAvoidStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subAvoidStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held8") { err("subAvoidStudy: --write goes with --set held8 only"); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.set.toUpperCase()} set: ${seeds.length} scenarios of hard-traffic, ${A.AVOID_ARMS.length} arms`);
    for (const seed of seeds) { const sc = H.hardScenario(seed, "hard-traffic"); for (const arm of A.AVOID_ARMS) runs.push(A.flyAvoid(pilot, sc, arm)); }
    const cells = summarize(runs);
    out(""); out(table(cells, `ladder 12, 8, 6, 3 m, 260 s a flight, edge +${H.EDGE_EXTRA} m, yield ${H.YIELD_SPEED} m/s, avoid: clear ${A.SHIP_CLEAR} m, look ${A.SHIP_LOOK_S} s, step 15 degrees to 90, static clear ${A.STATIC_CLEAR} m`)); out(verdictText(judge(cells)));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
