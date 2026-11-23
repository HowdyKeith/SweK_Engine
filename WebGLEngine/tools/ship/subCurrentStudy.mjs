// WebGLEngine/tools/ship/subCurrentStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 7" in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subCurrentStudy-selfcheck.mjs)
//
// THE STUDY OF THE CURRENT IN THE FIELD: flies hard-current scenarios at two strengths (x1.0, x1.5) under four arms (brain/subCurrentNav.mjs) and reads the registered verdict and the predictions C1 to C8.
//   node tools/ship/subCurrentStudy.mjs --set dev [--seeds N]               DEV (seeds 1 to 30 of each strength): the sanity run; not a result
//   node tools/ship/subCurrentStudy.mjs --set held7 [--seeds N] [--write]    HELD7, seeds 701 to 760, READ ONCE; --write puts every flight in brain/subCurrentHeld7.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../../brain/subCurrentNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subCurrentHeld7.jsonl", SETS = C.SETS;
export const THRESH = Object.freeze({ gain: 5, collisionFraction: 0.5, weak: 47, crabOverMargin: 3, timeFactor: 1.15, timeouts: 3, noRoute: 1 });
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** { strength: { arm: { n, reached, rate, collided, left, timeout, other, noRoute, medianTime (arrivals), medianChord (path over chord, arrivals), medianClearance (all) } } }. */
export function summarize(runs) {
    const cells = {};
    for (const k of Object.keys(C.STRENGTHS)) for (const arm of C.CURRENT_ARMS) {
        const rs = runs.filter((r) => r.strength === k && r.arm === arm);
        if (!rs.length) continue;
        const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached);
        (cells[k] || (cells[k] = {}))[arm] = { n: rs.length, reached: done.length, rate: done.length / rs.length, collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, noRoute: rs.filter((r) => r.noRoute).length, medianTime: median(done.map((r) => r.t)), medianChord: median(done.map((r) => r.path / r.chord)), medianClearance: median(rs.map((r) => r.minClearance)) };
    }
    return { cells };
}
/**
 * The verdict and C1 to C8 (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 7"). The designated arm (C.DESIGNATED) against the reference (C.REFERENCE). x1.5 GAIN: it reaches at least THRESH.gain more. x1.0 GAIN: its collisions are at most THRESH.collisionFraction of the reference's AND it reaches no fewer.
 * SUPPORTED if both gains hold, PARTLY SUPPORTED if one, NOT SUPPORTED otherwise. C1 the reference reaches at most THRESH.weak at x1.5. C2, C3 the gains. C4 at x1.5 any+crab reaches at least THRESH.crabOverMargin more than any+margin. C5 at x1.0 any+margin reaches no more than the reference.
 * C6 the designated median arrival time is at most THRESH.timeFactor times the reference's at both strengths. C7 the designated arm times out in at most THRESH.timeouts flights in all. C8 its no-route scenarios are at most THRESH.noRoute in all. A missing cell is a miss, never a throw.
 */
export function judge(sum) {
    const c = sum.cells, d = (k) => (c[k] || {})[C.DESIGNATED], r = (k) => (c[k] || {})[C.REFERENCE], a = (k, arm) => (c[k] || {})[arm];
    const gain15 = !!d("x1.5") && !!r("x1.5") && d("x1.5").reached - r("x1.5").reached >= THRESH.gain;
    const gain10 = !!d("x1.0") && !!r("x1.0") && d("x1.0").collided <= THRESH.collisionFraction * r("x1.0").collided && d("x1.0").reached >= r("x1.0").reached;
    const verdict = gain15 && gain10 ? "SUPPORTED" : gain15 || gain10 ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const c1 = !!r("x1.5") && r("x1.5").reached <= THRESH.weak, c4 = !!a("x1.5", "any+crab") && !!a("x1.5", "any+margin") && a("x1.5", "any+crab").reached - a("x1.5", "any+margin").reached >= THRESH.crabOverMargin;
    const c5 = !!a("x1.0", "any+margin") && !!r("x1.0") && a("x1.0", "any+margin").reached <= r("x1.0").reached;
    const ratios = Object.keys(C.STRENGTHS).map((k) => (d(k) && r(k) ? d(k).medianTime / r(k).medianTime : NaN)), c6 = ratios.every((x) => Number.isFinite(x) && x <= THRESH.timeFactor);
    const ks = Object.keys(C.STRENGTHS), c7 = ks.every((k) => !!d(k)) && ks.reduce((t, k) => t + d(k).timeout, 0) <= THRESH.timeouts, c8 = ks.every((k) => !!d(k)) && ks.reduce((t, k) => t + d(k).noRoute, 0) <= THRESH.noRoute;
    return { gain15, gain10, verdict, c1, c2: gain15, c3: gain10, c4, c5, c6, c7, c8, timeRatios: ratios };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(sum, title) {
    const lines = [title, "strength arm              | reached      | collided left timeout other | no route | median time (s) | median path/chord | median min clearance (m)"];
    for (const k of Object.keys(C.STRENGTHS)) for (const arm of C.CURRENT_ARMS) { const x = (sum.cells[k] || {})[arm]; if (!x) continue; lines.push(`${k.padEnd(8)} ${arm.padEnd(16)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${String(x.noRoute).padStart(8)} | ${f2s(x.medianTime).padStart(15)} | ${f2s(x.medianChord).padStart(17)} | ${f2s(x.medianClearance).padStart(24)}`); }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), d = C.DESIGNATED, rf = C.REFERENCE;
    return [`${d} against ${rf}: x1.5 reaches at least ${THRESH.gain} more ${yn(j.gain15)}; x1.0 collisions at most ${THRESH.collisionFraction} of ${rf}'s and no fewer reached ${yn(j.gain10)} => ${j.verdict}`,
        `C1 ${rf} reaches at most ${THRESH.weak} of 60 at x1.5: ${yn(j.c1)}`, `C2 the x1.5 gain: ${yn(j.c2)}`, `C3 the x1.0 gain: ${yn(j.c3)}`, `C4 at x1.5 any+crab reaches at least ${THRESH.crabOverMargin} more than any+margin: ${yn(j.c4)}`, `C5 at x1.0 any+margin reaches no more than ${rf}: ${yn(j.c5)}`,
        `C6 ${d}'s median arrival time is at most ${THRESH.timeFactor} times ${rf}'s at both strengths (${j.timeRatios.map(f2s).join(", ")}): ${yn(j.c6)}`, `C7 ${d} times out in at most ${THRESH.timeouts} flights in all: ${yn(j.c7)}`, `C8 ${d}'s first plan is a no-route scenario in at most ${THRESH.noRoute} of all: ${yn(j.c8)}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subCurrentStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subCurrentStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subCurrentStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held7") { err("subCurrentStudy: --write goes with --set held7 only"); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.set.toUpperCase()} set: ${seeds.length} scenarios of hard-current x ${Object.keys(C.STRENGTHS).length} strengths, ${C.CURRENT_ARMS.length} arms`);
    for (const seed of seeds) for (const k of Object.keys(C.STRENGTHS)) for (const arm of C.CURRENT_ARMS) runs.push(C.flyCurrent(pilot, seed, k, arm));
    const sum = summarize(runs);
    out(""); out(table(sum, `ladder 12, 8, 6, 3 m (raised by |c| x ${C.T_TURN.toFixed(1)} s for the margin arms), 260 s a flight, crab clamp ${C.CRAB_MAX}`)); out(verdictText(judge(sum)));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
