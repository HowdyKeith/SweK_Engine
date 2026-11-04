// WebGLEngine/tools/ship/subTrafficFixStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 5" and its Amendment 1 in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subTrafficFixStudy-selfcheck.mjs)
//
// THE STUDY OF THE TRAFFIC FIX: flies HELD4's traffic kind (brain/subHardNav.mjs, hard-traffic) with the arms FIX_ARMS -- the two references any+replan and any+predict, and any+predict with a wider edge band (+edge), with a yield rule (+yield) and with both (+edge+yield, the designated arm) --
// and reads the registered bar, the verdict and the predictions F1 to F6.
//   node tools/ship/subTrafficFixStudy.mjs --set dev [--seeds N]               DEV (seeds 1 to 30 of hard-traffic): the sanity run and the speed choice; not a result
//   node tools/ship/subTrafficFixStudy.mjs --set held5 [--seeds N] [--write]    HELD5, seeds 501 to 560, READ ONCE; --write puts every flight in brain/subTrafficFixHeld5.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as H from "../../brain/subHardNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subTrafficFixHeld5.jsonl", SETS = Object.freeze({ dev: H.HARD_SETS.dev, held5: H.HELD5 }), REFERENCE = "any+predict";
export const THRESH = Object.freeze({ bar: 0.8, gain: 5, collisionDrop: 3, timeFactor: 1.25, timeouts: 3 });
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** The numbers per arm: { arm: { n, reached, rate, collided, left, timeout, other, medianTime (arrivals), medianChord (path over the chord, arrivals), medianClearance (all) } }. */
export function summarize(runs) {
    const cells = {};
    for (const arm of H.FIX_ARMS) {
        const rs = runs.filter((r) => r.arm === arm);
        if (!rs.length) continue;
        const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached);
        cells[arm] = { n: rs.length, reached: done.length, rate: done.length / rs.length, collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, medianTime: median(done.map((r) => r.t)), medianChord: median(done.map((r) => r.path / r.chord)), medianClearance: median(rs.map((r) => r.minClearance)) };
    }
    return { cells };
}
/**
 * The bar, the verdict and F1 to F6 (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 5"). The designated arm (FIX_DESIGNATED) has: the BAR (reaches at least THRESH.bar), no EXIT (no flight that left the region), and a GAIN (at least THRESH.gain more than any+predict on the same seeds).
 * SUPPORTED if all three; PARTLY SUPPORTED if it has the gain but not both of the others; NOT SUPPORTED otherwise. F1: +edge has no exit and any+predict at least one. F2: +yield has at least THRESH.collisionDrop fewer collisions than any+predict. F3: the designated arm reaches at least as many as either single change.
 * F4: its median arrival time is at most THRESH.timeFactor times any+predict's. F5: any+predict reaches more than any+replan. F6: the designated arm times out in at most THRESH.timeouts flights.
 */
export function judge(sum) {
    const c = sum.cells, d = c[H.FIX_DESIGNATED], ref = c[REFERENCE], edge = c["any+predict+edge"], yld = c["any+predict+yield"], rep = c["any+replan"];
    const bar = !!d && d.rate >= THRESH.bar, noExit = !!d && d.left === 0, gain = !!d && !!ref && d.reached - ref.reached >= THRESH.gain;
    const verdict = bar && noExit && gain ? "SUPPORTED" : gain ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const f1 = !!edge && !!ref && edge.left === 0 && ref.left >= 1, f2 = !!yld && !!ref && ref.collided - yld.collided >= THRESH.collisionDrop, f3 = !!d && !!edge && !!yld && d.reached >= edge.reached && d.reached >= yld.reached;
    const timeRatio = d && ref ? d.medianTime / ref.medianTime : NaN, f4 = Number.isFinite(timeRatio) && timeRatio <= THRESH.timeFactor, f5 = !!ref && !!rep && ref.reached > rep.reached, f6 = !!d && d.timeout <= THRESH.timeouts;
    return { bar, noExit, gain, verdict, f1, f2, f3, f4, timeRatio, f5, f6 };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(sum, title) {
    const lines = [title, "arm                    | reached      | collided left timeout other | median time (s) | median path/chord | median min clearance (m)"];
    for (const arm of H.FIX_ARMS) { const x = sum.cells[arm]; if (!x) continue; lines.push(`${arm.padEnd(22)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${f2s(x.medianTime).padEnd(15)} | ${f2s(x.medianChord).padEnd(17)} | ${f2s(x.medianClearance)}`); }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), d = H.FIX_DESIGNATED;
    return [`${d}: reaches at least ${pct(THRESH.bar)} (the bar): ${yn(j.bar)}; has no flight that left the region: ${yn(j.noExit)}; reaches at least ${THRESH.gain} more than ${REFERENCE}: ${yn(j.gain)}`,
        `F1 any+predict+edge has no exit and ${REFERENCE} at least one: ${yn(j.f1)}`, `F2 any+predict+yield has at least ${THRESH.collisionDrop} fewer collisions than ${REFERENCE}: ${yn(j.f2)}`, `F3 ${d} reaches at least as many as either single change: ${yn(j.f3)}`,
        `F4 ${d}'s median arrival time is at most ${THRESH.timeFactor} times ${REFERENCE}'s (it is ${f2s(j.timeRatio)}): ${yn(j.f4)}`, `F5 ${REFERENCE} reaches more than any+replan: ${yn(j.f5)}`, `F6 ${d} times out in at most ${THRESH.timeouts} flights: ${yn(j.f6)}`, `VERDICT: ${j.verdict}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subTrafficFixStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subTrafficFixStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subTrafficFixStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held5") { err("subTrafficFixStudy: --write goes with --set held5 only"); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.set.toUpperCase()} set: ${seeds.length} scenarios of hard-traffic, ${H.FIX_ARMS.length} arms`);
    for (const seed of seeds) { const sc = H.hardScenario(seed, "hard-traffic"); for (const arm of H.FIX_ARMS) runs.push(H.flyHard(pilot, sc, arm)); }
    const sum = summarize(runs);
    out(""); out(table(sum, `margin ladder ${H.MARGIN_LADDER.join(", ")} m, ${H.SECONDS_HARD} s a flight, edge +${H.EDGE_EXTRA} m, yield ${H.YIELD_SPEED} m/s`)); out(verdictText(judge(sum)));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
