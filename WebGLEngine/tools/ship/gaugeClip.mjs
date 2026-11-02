// WebGLEngine/tools/ship/gaugeClip.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/gaugeClipCmd.mjs; the gate is tools/ship/gaugeClip-selfcheck.mjs)
//
// ROUND 18 of brain/NEEDS_AND_LIMITS.md ("why does the tuned rule score higher with a noisier gauge?", registered before this file existed, one amendment before any seed was flown): the tuned rule alone on the
// shipped gauge, on the same gauge built here with and without the [0, 1] clip, and with one of its trip points or its depth cap moved down by 0.04, on 600 fresh far-and-both dives per arm (V1 1801-1900, V2 1901-2000,
// V3 2001-2100). THE SEEDS ARE READ ONLY BY flyArm() ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import { pooled, readingOf, SE_FACTOR, HARD } from "./plannerReplicate.mjs";

export { HARD, pooled, readingOf };
export const SET_RANGES = Object.freeze({ V1: [1801, 1900], V2: [1901, 2000], V3: [2001, 2100] }), SET_NAMES = Object.freeze(["V1", "V2", "V3"]);
export const SHIFT = 0.04;
export const ARMS = Object.freeze(["CLIP-0.1", "CLIP-0.3", "OWN-CLIP-0.1", "OWN-CLIP-0.3", "FREE-0.1", "FREE-0.3", "LOW-0.04", "HIGH-0.04", "CAP-0.04"]);
export const SHIFT_ARMS = Object.freeze(["LOW-0.04", "HIGH-0.04", "CAP-0.04"]);
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gaussOf = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** The reading for a scenario, built here with the same seeded stream and refresh as needsTask.gaugeOf: reading(i, frac), with the clip to [0, 1] optional. */
export function readingOfScenario(sc, sd, clip, { hz = T.GAUGE.hz, dt = T.DT } = {}) {
    const rng = mulberry((sc.seed * 15485863 + T.KINDS.indexOf(sc.kind) * 32452843 + 977) >>> 0), every = Math.max(1, Math.round(1 / (hz * dt)));
    let held = null;
    return (i, frac) => { if (held === null || i % every === 0) { const v = frac + sd * gaussOf(rng); held = clip ? clamp(v, 0, 1) : v; } return held; };
}
/** The arm's name as { sd, clip, own, params } (params = the tuned rule's parameters after the shift). */
export function parseArm(arm, r8) {
    let m = /^(CLIP|OWN-CLIP|FREE)-(0\.1|0\.3)$/.exec(arm);
    if (m) return { sd: Number(m[2]), clip: m[1] !== "FREE", own: m[1] !== "CLIP", params: r8 };
    m = /^(LOW|HIGH|CAP)-0\.04$/.exec(arm);
    if (m) { const k = m[1].toLowerCase(); return { sd: 0.1, clip: true, own: false, params: { ...r8, [k]: r8[k] - SHIFT } }; }
    throw new Error(`gaugeClip.parseArm: unknown arm ${JSON.stringify(arm)}`);
}
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
/** The result of a set of dives flown one by one: the means and counts of needsTask.evaluate, plus the mean of the per-dive reading biases. */
export function aggregate(runs, biases) {
    const n = runs.length;
    return { score: runs.reduce((s, r) => s + r.score, 0) / n, runs, crashed: runs.filter((r) => r.crushed).length, stranded: runs.filter((r) => r.stranded).length, bias: biases.reduce((s, b) => s + b, 0) / n };
}
/** One arm on one set. An own-gauge arm flies each scenario with the true charge replaced by its own reading and returns `bias`, the mean over dives of the mean (reading - true charge). */
export function flyArm(arm, r8, set) {
    const a = parseArm(arm, r8), tuned = (p) => T.flyDecision(U.tunedSeat(p, U.WIDE_BOUNDS));
    if (!a.own) return T.evaluate(tuned(a.params), set, { gauge: { sd: a.sd, hz: T.GAUGE.hz }, ...FLIGHT });
    const runs = [], biases = [];
    for (const sc of set) {
        const rd = readingOfScenario(sc, a.sd, a.clip), acc = { sum: 0, n: 0 };
        const factory = (ctx) => { const pilot = tuned(a.params)(ctx); return (st, obs, cur) => { const i = Math.round(obs.t / T.DT), v = rd(i, obs.r.frac); acc.sum += v - obs.r.frac; acc.n++; return pilot(st, { ...obs, r: { ...obs.r, frac: v } }, cur); }; };
        runs.push(T.evaluate(factory, [sc], { gauge: null, ...FLIGHT }).runs[0]);
        biases.push(acc.n ? acc.sum / acc.n : 0);
    }
    return aggregate(runs, biases);
}
export function flySets(arm, r8, { ranges = SET_RANGES, kinds = HARD } = {}) { return Object.fromEntries(SET_NAMES.map((s) => [s, flyArm(arm, r8, T.setOf(kinds, ranges[s][0], ranges[s][1]))])); }
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((s) => [s, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][s]]))]));
/** Reads one pooled difference a - b: REAL-and-positive ("UP"), real-and-negative ("DOWN") or "SAME". */
export function diffOf(au, a, b) {
    const p = pooled(au, a, b, { sets: SET_NAMES });
    return { ...p, dir: p.mean > 0 && p.mean > SE_FACTOR * p.se ? "UP" : p.mean < 0 && -p.mean > SE_FACTOR * p.se ? "DOWN" : "SAME" };
}
export const biasOf = (au, arm) => (au[SET_NAMES[0]][arm].bias === undefined ? null : SET_NAMES.reduce((s, n) => s + au[n][arm].bias, 0) / SET_NAMES.length);
export function bottomLines(au) {
    const rep = diffOf(au, "CLIP-0.3", "CLIP-0.1"), free = diffOf(au, "FREE-0.3", "FREE-0.1"), clipEffect = diffOf(au, "CLIP-0.3", "FREE-0.3");
    let first;
    if (rep.dir !== "UP") first = "THE IMPROVEMENT WITH NOISE DOES NOT REPLICATE";
    else if (free.dir !== "UP" && clipEffect.dir === "UP") first = "THE IMPROVEMENT WITH NOISE IS A CLIPPING ARTEFACT";
    else if (free.dir === "UP") first = "THE IMPROVEMENT WITH NOISE IS NOT A CLIPPING ARTEFACT";
    else first = "THE IMPROVEMENT WITH NOISE IS UNEXPLAINED BY CLIPPING EITHER WAY";
    const better = SHIFT_ARMS.filter((a) => diffOf(au, a, "CLIP-0.1").dir === "UP"), charge = better.filter((a) => a !== "CAP-0.04");
    const second = charge.length ? `THE ROUND 8 TRIP POINTS ARE TOO CAUTIOUS: ${charge.join(", ")}` : better.length ? "THE ROUND 8 DEPTH CAP IS TOO SHALLOW: CAP-0.04" : "NO SHIFT HELPS: THE ROUND 8 CONSTANTS STAND";
    return [first, second];
}
export function checksOf(au) {
    const rows = [], same = (a, b, n) => au[n][a].runs.every((r, i) => r.fingerprint === au[n][b].runs[i].fingerprint);
    for (const [own, ship] of [["OWN-CLIP-0.1", "CLIP-0.1"], ["OWN-CLIP-0.3", "CLIP-0.3"]]) {
        const ok = SET_NAMES.every((n) => same(own, ship, n));
        rows.push({ name: `OWN GAUGE ${own}`, ok, text: `${own} equals ${ship} dive for dive on every set (the arm's own reading is the shipped one): ${ok}` });
    }
    const differs = SET_NAMES.some((n) => !same("FREE-0.1", "CLIP-0.1", n));
    rows.push({ name: "FREE DIFFERS", ok: differs, text: `FREE-0.1 differs from CLIP-0.1 on at least one dive (else the clip never binds and the arm tests nothing): ${differs}` });
    for (const a of SHIFT_ARMS) { const d = SET_NAMES.some((n) => !same(a, "CLIP-0.1", n)); rows.push({ name: `SHIFT ${a}`, ok: d, text: `${a} differs from CLIP-0.1 on at least one dive: ${d}` }); }
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
const meanScore = (au, arm) => SET_NAMES.reduce((a, n) => a + au[n][arm].score, 0) / SET_NAMES.length;
export function report(au) {
    const L = [`ROUND 18: why does the tuned rule score higher with a noisier gauge? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("arm means, crushed and stranded, mean reading bias (own-built readings only)");
    for (const a of ARMS) { const b = biasOf(au, a); L.push(`  ${a.padEnd(13)} ${meanScore(au, a).toFixed(4)}   crushed ${SET_NAMES.reduce((s, n) => s + au[n][a].crashed, 0)}  stranded ${SET_NAMES.reduce((s, n) => s + au[n][a].stranded, 0)}   bias ${b === null ? "n/a" : (b >= 0 ? "+" : "") + b.toFixed(4)}`); }
    L.push(`CLIP-0.3 minus CLIP-0.1 (replication): ${fmt(diffOf(au, "CLIP-0.3", "CLIP-0.1"))} ${diffOf(au, "CLIP-0.3", "CLIP-0.1").dir}`);
    L.push(`FREE-0.3 minus FREE-0.1 (no clip): ${fmt(diffOf(au, "FREE-0.3", "FREE-0.1"))} ${diffOf(au, "FREE-0.3", "FREE-0.1").dir}`);
    L.push(`CLIP-0.3 minus FREE-0.3 (the clip at sd 0.3): ${fmt(diffOf(au, "CLIP-0.3", "FREE-0.3"))} ${diffOf(au, "CLIP-0.3", "FREE-0.3").dir}`);
    for (const a of SHIFT_ARMS) L.push(`${a} minus CLIP-0.1: ${fmt(diffOf(au, a, "CLIP-0.1"))} ${{ UP: "BETTER", DOWN: "WORSE", SAME: "SAME" }[diffOf(au, a, "CLIP-0.1").dir]}`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
