// WebGLEngine/tools/ship/subSensedStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SENSED_NAV_WIP.md, the gate is tools/ship/subSensedStudy-selfcheck.mjs)
//
// THE STUDY OF THE SENSED MAP: flies the three static kinds of the harder test (hard-islands, hard-gaps, hard-current) with the five arms of brain/subSensedNav.mjs -- `straight` (no map), `exact` (the whole map and a perfect position: subHardNav's `any`), `sensed` (a sonar-built map, a perfect
// position), `sensed+fix` (designated: a noisy absolute fix) and `sensed+drift` (dead reckoning) -- and reads the registered bars, the verdict and the predictions N1 to N7.
//   node tools/ship/subSensedStudy.mjs --set dev [--seeds N]               DEV (seeds 1 to 30 of each kind): a sanity run, not a result
//   node tools/ship/subSensedStudy.mjs --set held6 [--seeds N] [--write]    HELD6 (seeds 601 to 660 of each kind), READ ONCE; --write puts every flight in brain/subSensedHeld6.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as X from "../../brain/subSensedNav.mjs";
import * as H from "../../brain/subHardNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import { median } from "./subTrafficFixStudy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export { median };
export const OUT = "brain/subSensedHeld6.jsonl", SETS = Object.freeze({ dev: X.SENSE_SETS.dev, held6: X.SENSE_SETS.held6 });
export const THRESH = Object.freeze({ fixWithin: 5, islandHits: X.ISLAND_MAX_COLLISIONS, pathFactor: 1.2, barsForPartly: 2 });
export const pilot = (s, t, c) => AP.decide(s, t, c);

const cellOf = (rs) => {
    if (!rs.length) return null;
    const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached);
    return { n: rs.length, reached: done.length, rate: done.length / rs.length, collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, medianTime: median(done.map((r) => r.t)), medianChord: median(done.map((r) => r.path / r.chord)), medianClearance: median(rs.map((r) => r.minClearance)), medianSeen: median(rs.filter((r) => Number.isFinite(r.ensonified)).map((r) => r.ensonified)), medianOffsetEnd: median(rs.filter((r) => Number.isFinite(r.offsetEnd)).map((r) => r.offsetEnd)) };
};
/** The numbers per kind and arm: { cells: { kind: { arm: cell } }, pooled: { arm: cell over the three kinds } }; a cell is { n, reached, rate, collided, left, timeout, other, medianTime, medianChord (path over the chord, arrivals), medianClearance (all), medianSeen, medianOffsetEnd } or absent when the arm flew nothing. */
export function summarize(runs) {
    const cells = {}, pooled = {};
    for (const kind of X.SENSE_KINDS) { cells[kind] = {}; for (const arm of X.STUDY_ARMS) { const c = cellOf(runs.filter((r) => r.kind === kind && r.arm === arm)); if (c) cells[kind][arm] = c; } }
    for (const arm of X.STUDY_ARMS) { const c = cellOf(runs.filter((r) => r.arm === arm && X.SENSE_KINDS.includes(r.kind))); if (c) pooled[arm] = c; }
    return { cells, pooled };
}
/**
 * The bar, the verdict and N1 to N7 (brain/SENSED_NAV_WIP.md). The designated arm's BAR in a kind: its reach at least X.BARS[kind] (islands 0.8, gaps 0.6, current 0.7) and, in hard-islands, at most THRESH.islandHits collisions. SUPPORTED if all three kinds hold their bar; PARTLY SUPPORTED if at
 * least THRESH.barsForPartly do; NOT SUPPORTED otherwise. N1 in each kind `exact` reaches at least as many as `sensed`. N2 in each kind `sensed` reaches more than `straight`. N3 in each kind `sensed+fix` is within THRESH.fixWithin flights of `sensed`. N4 over the three kinds `sensed+drift` reaches fewer than
 * `sensed+fix`. N5 `sensed` reaches a lower share in hard-gaps than in hard-islands and than in hard-current. N6 `sensed+fix` collides at most THRESH.islandHits times in hard-islands. N7 the pooled median path over the chord of `sensed`'s arrivals is at most THRESH.pathFactor times `exact`'s.
 */
export function judge(sum) {
    const c = sum.cells, p = sum.pooled, get = (kind, arm) => (c[kind] && c[kind][arm]) || null, D = X.DESIGNATED;
    const bars = {};
    for (const kind of X.SENSE_KINDS) { const d = get(kind, D); bars[kind] = !!d && d.rate >= X.BARS[kind] && (kind !== "hard-islands" || d.collided <= THRESH.islandHits); }
    const held = X.SENSE_KINDS.filter((k) => bars[k]).length, verdict = held === X.SENSE_KINDS.length ? "SUPPORTED" : held >= THRESH.barsForPartly ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const eachKind = (f) => X.SENSE_KINDS.every((k) => { const r = f(k); return r === true; });
    const n1 = eachKind((k) => { const e = get(k, "exact"), s = get(k, "sensed"); return !!e && !!s && e.reached >= s.reached; });
    const n2 = eachKind((k) => { const s = get(k, "sensed"), f = get(k, "straight"); return !!s && !!f && s.reached > f.reached; });
    const n3 = eachKind((k) => { const f = get(k, "sensed+fix"), s = get(k, "sensed"); return !!f && !!s && Math.abs(f.reached - s.reached) <= THRESH.fixWithin; });
    const n4 = !!p["sensed+drift"] && !!p["sensed+fix"] && p["sensed+drift"].reached < p["sensed+fix"].reached;
    const gs = get("hard-gaps", "sensed"), is = get("hard-islands", "sensed"), cs = get("hard-current", "sensed"), n5 = !!gs && !!is && !!cs && gs.rate < is.rate && gs.rate < cs.rate;
    const fi = get("hard-islands", D), n6 = !!fi && fi.collided <= THRESH.islandHits;
    const pathRatio = p.sensed && p.exact ? p.sensed.medianChord / p.exact.medianChord : NaN, n7 = Number.isFinite(pathRatio) && pathRatio <= THRESH.pathFactor;
    return { bars, held, verdict, n1, n2, n3, n4, n5, n6, n7, pathRatio };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
const HEAD = "arm            | reached      | collided left timeout other | median time (s) | median path/chord | median min clearance (m) | grid ensonified | offset at end (m)";
/** The table: a block for each kind, then the three kinds pooled. */
export function table(sum, title) {
    const lines = [title], row = (arm, x) => `${arm.padEnd(14)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${f2s(x.medianTime).padEnd(15)} | ${f2s(x.medianChord).padEnd(17)} | ${f2s(x.medianClearance).padEnd(24)} | ${pct(x.medianSeen).padEnd(15)} | ${f2s(x.medianOffsetEnd)}`;
    for (const kind of X.SENSE_KINDS) { lines.push("", kind, HEAD); for (const arm of X.STUDY_ARMS) { const x = sum.cells[kind][arm]; if (x) lines.push(row(arm, x)); } }
    lines.push("", "the three kinds together", HEAD); for (const arm of X.STUDY_ARMS) { const x = sum.pooled[arm]; if (x) lines.push(row(arm, x)); }
    return lines.join("\n");
}
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), D = X.DESIGNATED, B = X.BARS;
    return [`${D}: reaches at least ${pct(B["hard-islands"])} of hard-islands with at most ${THRESH.islandHits} collisions: ${yn(j.bars["hard-islands"])}; at least ${pct(B["hard-gaps"])} of hard-gaps: ${yn(j.bars["hard-gaps"])}; at least ${pct(B["hard-current"])} of hard-current: ${yn(j.bars["hard-current"])}  (${j.held} of ${X.SENSE_KINDS.length} bars)`,
        `N1 exact reaches at least as many as sensed in each kind: ${yn(j.n1)}`, `N2 sensed reaches more than straight in each kind: ${yn(j.n2)}`, `N3 ${D} is within ${THRESH.fixWithin} flights of sensed in each kind: ${yn(j.n3)}`, `N4 over the three kinds sensed+drift reaches fewer than ${D}: ${yn(j.n4)}`,
        `N5 sensed reaches a lower share in hard-gaps than in hard-islands and than in hard-current: ${yn(j.n5)}`, `N6 ${D} collides at most ${THRESH.islandHits} times in hard-islands: ${yn(j.n6)}`, `N7 the median path over the chord of sensed's arrivals is at most ${THRESH.pathFactor} times exact's (it is ${f2s(j.pathRatio)}): ${yn(j.n7)}`, `VERDICT: ${j.verdict}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subSensedStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subSensedStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subSensedStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held6") { err("subSensedStudy: --write goes with --set held6 only"); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.set.toUpperCase()} set: ${seeds.length} scenarios of each of ${X.SENSE_KINDS.join(", ")}, ${X.STUDY_ARMS.length} arms`);
    for (const kind of X.SENSE_KINDS) for (const seed of seeds) { const sc = H.hardScenario(seed, kind); for (const arm of X.STUDY_ARMS) runs.push(X.flyArm(pilot, sc, arm)); }
    const sum = summarize(runs);
    out(""); out(table(sum, `margin ladder ${H.MARGIN_LADDER.join(", ")} m, ${H.SECONDS_HARD} s a flight, sonar ${X.SONAR.range} m +-${(X.SONAR.half * 180 / Math.PI).toFixed(0)} degrees every ${X.SONAR.pingS} s, fix sigma ${X.FIX_SIGMA} m, drift ${X.DRIFT_SIGMA} m per root s`)); out(""); out(verdictText(judge(sum)));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
