// WebGLEngine/tools/ship/subMissionStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 10" in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subMissionStudy-selfcheck.mjs)
//
// THE STUDY OF MISSIONS AND WHAT A METRE COSTS: flies three-leg missions through hard-traffic (brain/subMissionNav.mjs) on the submarine's battery under four arms and reads the registered verdict and E1 to E6.
//   node tools/ship/subMissionStudy.mjs --set dev [--seeds N]               DEV (seeds 1 to 30): the sanity run; not a result
//   node tools/ship/subMissionStudy.mjs --set held10 [--seeds N] [--write]   HELD10, seeds 1001 to 1060, READ ONCE; --write puts every flight in brain/subMissionHeld10.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../../brain/subMissionNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subMissionHeld10.jsonl", SETS = M.SETS;
export const THRESH = Object.freeze({ gain: 5, energyOuts: 5, halfFraction: 0.5, bar: 36 });
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** { arm: { n, complete, rate, energyOut, collided, left, timeout, other, legs (waypoints reached, summed), medianTime (completes), medianEnergyMJ (every mission), medianJPerM (every mission), medianChord (path over the chord sum, completes) } } in MISSION_ARMS order, only the arms flown. */
export function summarize(runs) {
    const cells = {};
    for (const arm of M.MISSION_ARMS) {
        const rs = runs.filter((r) => r.arm === arm);
        if (!rs.length) continue;
        const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.complete);
        cells[arm] = { n: rs.length, complete: done.length, rate: done.length / rs.length, energyOut: count("energy-out"), collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["complete", "energy-out", "collided", "left", "timeout"].includes(r.status)).length, legs: rs.reduce((m, r) => m + r.legs, 0), medianTime: median(done.map((r) => r.t)), medianEnergyMJ: median(rs.map((r) => r.energyUsed / 1e6)), medianJPerM: median(rs.map((r) => r.jPerM)), medianChord: median(done.map((r) => r.path / r.chord)) };
    }
    return cells;
}
/**
 * The verdict and E1 to E6 (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 10"). The designated arm (M.DESIGNATED) against the reference (M.REFERENCE). GAIN (E2): completes at least THRESH.gain more. COST MATTERS (E1): the reference runs out of energy in at least THRESH.energyOuts missions.
 * SUPPORTED if both, PARTLY SUPPORTED if one, NOT SUPPORTED otherwise. E3: any+replan completes at least as many as the reference. E4: the designated arm times out in more missions than the reference. E5: its energy-outs are at most THRESH.halfFraction of the reference's. E6: it completes THRESH.bar.
 * A missing cell is a miss, never a throw.
 */
export function judge(cells) {
    const d = cells[M.DESIGNATED], r = cells[M.REFERENCE], rp = cells["any+replan"];
    const gain = !!d && !!r && d.complete - r.complete >= THRESH.gain, cost = !!r && r.energyOut >= THRESH.energyOuts;
    return { gain, cost, verdict: gain && cost ? "SUPPORTED" : gain || cost ? "PARTLY SUPPORTED" : "NOT SUPPORTED", e1: cost, e2: gain, e3: !!rp && !!r && rp.complete >= r.complete, e4: !!d && !!r && d.timeout > r.timeout, e5: !!d && !!r && d.energyOut <= THRESH.halfFraction * r.energyOut, e6: !!d && d.complete >= THRESH.bar };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(cells, title) {
    const lines = [title, "arm                           | complete     | energy-out collided left timeout other | legs | median time (s) | median MJ | median J/m | median path/chord"];
    for (const arm of M.MISSION_ARMS) { const x = cells[arm]; if (!x) continue; lines.push(`${arm.padEnd(29)} | ${(`${x.complete}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.energyOut).padStart(10)} ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${String(x.legs).padStart(4)} | ${f2s(x.medianTime).padStart(15)} | ${f2s(x.medianEnergyMJ).padStart(9)} | ${f2s(x.medianJPerM).padStart(10)} | ${f2s(x.medianChord).padStart(17)}`); }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), d = M.DESIGNATED, rf = M.REFERENCE;
    return [`${d} against ${rf}: completes at least ${THRESH.gain} more ${yn(j.gain)}; ${rf} runs out of energy in at least ${THRESH.energyOuts} ${yn(j.cost)} => ${j.verdict}`,
        `E1 ${rf} runs out of energy in at least ${THRESH.energyOuts} missions: ${yn(j.e1)}`, `E2 ${d} completes at least ${THRESH.gain} more than ${rf}: ${yn(j.e2)}`, `E3 any+replan completes at least as many as ${rf}: ${yn(j.e3)}`, `E4 ${d} times out in more missions than ${rf}: ${yn(j.e4)}`,
        `E5 ${d}'s energy-outs are at most half ${rf}'s: ${yn(j.e5)}`, `E6 ${d} completes ${THRESH.bar} of 60: ${yn(j.e6)}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subMissionStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subMissionStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subMissionStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held10") { err("subMissionStudy: --write goes with --set held10 only"); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], missions = seeds.map((s) => M.missionFor(s)), flown = missions.filter((m) => !m.dropped), dropped = missions.length - flown.length, runs = [];
    out(`${o.set.toUpperCase()} set: ${seeds.length} missions of hard-traffic (${dropped} dropped for want of waypoints), ${M.MISSION_ARMS.length} arms`);
    for (const m of flown) for (const arm of M.MISSION_ARMS) runs.push(M.flyMission(pilot, m, arm));
    const cells = summarize(runs);
    out(""); out(table(cells, `battery ${(3.0).toFixed(1)} MJ, ${M.SECONDS_MISSION} s a mission, start -> W1 -> W2 -> goal (chord sum ${M.WAYPOINT.chordLo} to ${M.WAYPOINT.chordHi} m), cruise ${M.joulesPerMetre(3).toFixed(0)} J/m, ${M.ECO_SPEED} m/s ${M.joulesPerMetre(M.ECO_SPEED).toFixed(0)} J/m`)); out(verdictText(judge(cells)));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
