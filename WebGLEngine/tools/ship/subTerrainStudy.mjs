// WebGLEngine/tools/ship/subTerrainStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 11" in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subTerrainStudy-selfcheck.mjs)
//
// THE STUDY OF A DEPTH DIMENSION: flies hard-islands scenarios over a seabed (brain/subTerrain3dNav.mjs) under three arms (any, any+floor, any+3d) and reads the registered verdict and T1 to T7.
//   node tools/ship/subTerrainStudy.mjs --set dev [--seeds N]                DEV (seeds 1 to 30): the sanity run; not a result
//   node tools/ship/subTerrainStudy.mjs --set held11 [--seeds N] [--write]    HELD11, seeds 1101 to 1160, READ ONCE; --write puts every flight in brain/subTerrainHeld11.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTerrain3dNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subTerrainHeld11.jsonl", SETS = T.SETS;
export const THRESH = Object.freeze({ shorter: 0.97, reachSlack: 2, hazardSlack: 2, groundings: 5, dived: 30 });
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** { arm: { n, reached, rate, grounded, collided, left, timeout, other, dived (flights held down by a keel), medianChord (path over chord, arrivals), medianTime (arrivals), medianFloor (least floor gap, every flight) } } in TERRAIN_ARMS order, only the arms flown. */
export function summarize(runs) {
    const cells = {};
    for (const arm of T.TERRAIN_ARMS) {
        const rs = runs.filter((r) => r.arm === arm);
        if (!rs.length) continue;
        const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached);
        cells[arm] = { n: rs.length, reached: done.length, rate: done.length / rs.length, grounded: count("grounded"), collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "grounded", "collided", "left", "timeout"].includes(r.status)).length, dived: rs.filter((r) => r.dives > 0).length, medianChord: median(done.map((r) => r.path / r.chord)), medianTime: median(done.map((r) => r.t)), medianFloor: median(rs.filter((r) => r.minFloor !== null).map((r) => r.minFloor)) };
    }
    return cells;
}
/** The median over seeds both arms reached of path(a) / path(b); NaN when no seed qualifies. */
export function pairedPathRatio(runs, a, b) {
    const by = (arm) => Object.fromEntries(runs.filter((r) => r.arm === arm).map((r) => [r.seed, r]));
    const A = by(a), B = by(b), ratios = [];
    for (const s of Object.keys(A)) if (B[s] && A[s].reached && B[s].reached) ratios.push(A[s].path / B[s].path);
    return median(ratios);
}
/**
 * The verdict and T1 to T7 (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 11"). The designated arm (T.DESIGNATED) against the floor arm (T.REFERENCE), `ratio` the paired median path ratio. SHORTER (T3): ratio at most THRESH.shorter. SAFE (T4): reaches no fewer than the reference minus THRESH.reachSlack AND its
 * groundings plus collisions at most the reference's plus THRESH.hazardSlack. SUPPORTED if both, PARTLY SUPPORTED if one, NOT SUPPORTED otherwise. T1: `any` grounds in at least THRESH.groundings. T2: any+floor reaches at least as many as `any`. T5: any+3d is held down by a keel in at least THRESH.dived flights.
 * T6: its groundings are at most half the reference's. T7: its median arrival time is at most the reference's. A missing cell is a miss, never a throw.
 */
export function judge(cells, ratio) {
    const d = cells[T.DESIGNATED], r = cells[T.REFERENCE], a = cells.any;
    const shorter = Number.isFinite(ratio) && ratio <= THRESH.shorter, safe = !!d && !!r && d.reached >= r.reached - THRESH.reachSlack && d.grounded + d.collided <= r.grounded + r.collided + THRESH.hazardSlack;
    return { shorter, safe, verdict: shorter && safe ? "SUPPORTED" : shorter || safe ? "PARTLY SUPPORTED" : "NOT SUPPORTED", ratio, t1: !!a && a.grounded >= THRESH.groundings, t2: !!a && !!r && r.reached >= a.reached, t3: shorter, t4: safe, t5: !!d && d.dived >= THRESH.dived, t6: !!d && !!r && d.grounded <= 0.5 * r.grounded, t7: !!d && !!r && d.medianTime <= r.medianTime };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(cells, title) {
    const lines = [title, "arm        | reached      | grounded collided left timeout other | dived | median time (s) | median path/chord | median min floor (m)"];
    for (const arm of T.TERRAIN_ARMS) { const x = cells[arm]; if (!x) continue; lines.push(`${arm.padEnd(10)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.grounded).padStart(8)} ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${String(x.dived).padStart(5)} | ${f2s(x.medianTime).padStart(15)} | ${f2s(x.medianChord).padStart(17)} | ${f2s(x.medianFloor).padStart(20)}`); }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), d = T.DESIGNATED, rf = T.REFERENCE;
    return [`${d} against ${rf}: paired median path ratio ${f2s(j.ratio)} (at most ${THRESH.shorter}) ${yn(j.shorter)}; reaches no fewer than ${rf} minus ${THRESH.reachSlack} and groundings plus collisions at most plus ${THRESH.hazardSlack} ${yn(j.safe)} => ${j.verdict}`,
        `T1 any grounds in at least ${THRESH.groundings} of 60: ${yn(j.t1)}`, `T2 ${rf} reaches at least as many as any: ${yn(j.t2)}`, `T3 the paired median path ratio is at most ${THRESH.shorter}: ${yn(j.t3)}`, `T4 ${d} is as safe as ${rf}: ${yn(j.t4)}`, `T5 ${d} is held down by a keel in at least ${THRESH.dived} of 60 flights: ${yn(j.t5)}`,
        `T6 ${d}'s groundings are at most half ${rf}'s: ${yn(j.t6)}`, `T7 ${d}'s median arrival time is at most ${rf}'s: ${yn(j.t7)}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subTerrainStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subTerrainStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subTerrainStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held11") { err("subTerrainStudy: --write goes with --set held11 only"); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.set.toUpperCase()} set: ${seeds.length} scenarios of ${T.KIND} over a seabed, ${T.TERRAIN_ARMS.length} arms`);
    for (const seed of seeds) for (const arm of T.TERRAIN_ARMS) runs.push(T.flyTerrain(pilot, seed, arm));
    const cells = summarize(runs), ratio = pairedPathRatio(runs, T.DESIGNATED, T.REFERENCE);
    out(""); out(table(cells, `floor ${T.TERRAIN.baseLo}-${T.TERRAIN.baseHi} m base, altitude ${T.ALTITUDE} m, dive pad ${T.DIVE_PAD} m, look ${T.DIVE_LOOK_M} m, ladder 12, 8, 6, 3 m, 260 s a flight`)); out(verdictText(judge(cells, ratio)));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
