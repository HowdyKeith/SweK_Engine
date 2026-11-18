// WebGLEngine/tools/ship/flyHomeOffset.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// OFFSET AGAINST WOBBLE, AS ARITHMETIC (registered in brain/FLY_HOME_OFFSET_WIP.md before this file existed): WHICH HEADING ERROR DOES FINDING HOME FORGIVE? NOTHING IS TRAINED.
// The fly is the compass round's FROZEN fly with p_c 0 (vision off), its believed heading set before each tick to the true heading plus an error:
//   TOLD    none
//   OFFSET  SIZE (20 degrees), its sign drawn for the life
//   WOBBLE  an Ornstein-Uhlenbeck error of standard deviation SIZE and correlation time TAU ticks, started from its stationary spread
// The error stream is the life's seed plus ERR_SEED_ADD's (brain/rl/compassEnv.mjs's stream). Each arm flies the compass life (brain/rl/compassEnv.mjs, its return) and the homing life
// (brain/rl/homeEnv.mjs with brain/rl/homingFly.mjs, its score()) on the 200 audit lives. Readings (exact two-sided sign tests over the lives): O (OFFSET's course cost against its home cost),
// W (WOBBLE's home cost against its course cost), X (OFFSET's home score against WOBBLE's), Y (OFFSET's course score against WOBBLE's). The command is tools/ship/takeFlyHomeOffset.mjs.
//
//   ARMS, LEAD, SIZE, TAU, ERR_SEED_ADD, AUDIT, ALPHA, RESULTS, WORDS
//   errorStream(arm, seed), flyOf(), lifeScores(arm, seed), armRecord(arm, audit), parseArgs(argv), checkRecords(lines), reading(lines), readingLines(R)
// NOT HERE: the three arms' 1,200 lives (the command flies them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { CompassEnv, stream } from "../../brain/rl/compassEnv.mjs";
import { HomeEnv } from "../../brain/rl/homeEnv.mjs";
import { HomingFly } from "../../brain/rl/homingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as V from "./flyCompass.mjs";

export const ARMS = Object.freeze(["TOLD", "OFFSET", "WOBBLE"]), LEAD = "OFFSET", SIZE = 20 * Math.PI / 180, TAU = 50, ERR_SEED_ADD = 777;
export const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 60000001 + 7919 * k)), ALPHA = 0.01, RESULTS = "brain/flyHomeOffsetRound.jsonl";
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

/** See the header: a function giving the error (radians) for each tick of a life, in order. */
export function errorStream(arm, seed) {
    if (!ARMS.includes(arm)) throw new Error(`flyHomeOffset.errorStream: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    const r = stream(seed + ERR_SEED_ADD);
    if (arm === "TOLD") return () => 0;
    if (arm === "OFFSET") { const e = (r() < 0.5 ? 1 : -1) * SIZE; return () => e; }
    const a = Math.exp(-1 / TAU), k = Math.sqrt(1 - a * a) * SIZE; let e = gauss(r) * SIZE;
    return () => { e = a * e + k * gauss(r); return e; };
}
/** See the header: the compass round's FROZEN fly with vision off. */
export function flyOf() { return V.policyOf("FROZEN", 1).setParams([0]); }
/** See the header: { course, home } of one life. */
export function lifeScores(arm, seed) {
    const fly = (env, wrap) => { const f = flyOf(), h = wrap ? new HomingFly(f) : f, err = errorStream(arm, seed); let o = env.reset(seed), done = false; while (!done) { h.phi = env.th + err(); const r = env.step(h.act(o)); o = r.obs; done = r.done; } return env; };
    return { course: fly(new CompassEnv(), false).ret, home: fly(new HomeEnv(), true).score() };
}
/** See the header. */
export function armRecord(arm, audit = AUDIT) { const s = audit.map((seed) => lifeScores(arm, seed)); return { kind: "arm", arm, lives: audit.length, course: s.map((x) => x.course), home: s.map((x) => x.home) }; }
/** See the header. `job` takes a registered arm only; `run` at least one process. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 1 && ARMS.includes(rest[0])) return { cmd, arm: rest[0] };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 3 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}
const hashOf = (r) => createHash("sha256").update(JSON.stringify([r.course, r.home])).digest("hex").slice(0, 16);
/** See the header. */
export function checkRecords(lines) {
    const bad = [], arms = lines.filter((r) => r && r.kind === "arm");
    for (const a of ARMS) { const c = arms.filter((r) => r.arm === a).length; if (c !== 1) bad.push(`${a} is there ${c} times (once is registered)`); }
    for (const r of arms) {
        if (!ARMS.includes(r.arm)) { bad.push(`${r.arm} is not a registered arm`); continue; }
        if (r.lives !== AUDIT.length || !Array.isArray(r.course) || !Array.isArray(r.home) || r.course.length !== AUDIT.length || r.home.length !== AUDIT.length) bad.push(`${r.arm} does not hold ${AUDIT.length} lives of each kind`);
        else if (!r.course.every((x) => Number.isFinite(x) && x >= -1 && x <= 1) || !r.home.every((x) => Number.isFinite(x) && x >= 0 && x <= 1)) bad.push(`${r.arm}'s scores are not a course score from -1 to 1 and a home score from 0 to 1 for every life`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), lead = arms.find((r) => r.arm === LEAD);
    if (re.length !== 1 || !lead || re[0].arm !== LEAD || re[0].hash !== hashOf(lead)) bad.push(`${LEAD} flown a second time is not there once with the same scores`);
    return bad;
}
/** The hash a recheck carries. */
export const recheckOf = (r) => ({ kind: "recheck", arm: r.arm, hash: hashOf(r) });
const three = (a, b) => Object.freeze([`${a} ${b[0]}`, `${a} ${b[1]}`, `${a} ${b[2]}`]);
export const WORDS = Object.freeze({
    O: three("AN OFFSET", ["COSTS HOLDING A COURSE MORE THAN FINDING HOME", "COSTS FINDING HOME MORE THAN HOLDING A COURSE", "CANNOT BE TOLD TO COST HOLDING A COURSE AND FINDING HOME DIFFERENTLY"]),
    W: three("A WOBBLE", ["COSTS FINDING HOME MORE THAN HOLDING A COURSE", "COSTS HOLDING A COURSE MORE THAN FINDING HOME", "CANNOT BE TOLD TO COST FINDING HOME AND HOLDING A COURSE DIFFERENTLY"]),
    X: three("WITH AN OFFSET THE FLY", ["FINDS HOME BETTER THAN WITH A WOBBLE OF THE SAME SIZE", "FINDS HOME WORSE THAN WITH A WOBBLE OF THE SAME SIZE", "CANNOT BE TOLD APART FROM ONE WITH A WOBBLE OF THE SAME SIZE AT FINDING HOME"]),
    Y: three("WITH AN OFFSET THE FLY", ["HOLDS A COURSE BETTER THAN WITH A WOBBLE OF THE SAME SIZE", "HOLDS A COURSE WORSE THAN WITH A WOBBLE OF THE SAME SIZE", "CANNOT BE TOLD APART FROM ONE WITH A WOBBLE OF THE SAME SIZE AT HOLDING A COURSE"]),
});
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
/** See the header. A failed check leaves every reading null. */
export function reading(lines) {
    const checks = checkRecords(lines), A = Object.fromEntries(lines.filter((r) => r && r.kind === "arm").map((r) => [r.arm, r])), arms = {};
    for (const [a, r] of Object.entries(A)) if (Array.isArray(r.course) && Array.isArray(r.home)) arms[a] = { course: mean(r.course), home: mean(r.home) };
    const out = { checks, arms, O: null, W: null, X: null, Y: null };
    if (checks.length) return out;
    const T = A.TOLD, O = A.OFFSET, W = A.WOBBLE, n = AUDIT.length, at = (f) => Array.from({ length: n }, (_, i) => f(i));
    const t = (name, d) => { const h = signTest(d, 0), w = WORDS[name]; return { ...h, word: h.p <= ALPHA && h.above > h.below ? w[0] : h.p <= ALPHA && h.below > h.above ? w[1] : w[2] }; };
    return { ...out, O: t("O", at((i) => (T.course[i] - O.course[i]) - (T.home[i] - O.home[i]))), W: t("W", at((i) => (T.home[i] - W.home[i]) - (T.course[i] - W.course[i]))), X: t("X", at((i) => O.home[i] - W.home[i])), Y: t("Y", at((i) => O.course[i] - W.course[i])) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: each arm once with ${AUDIT.length} lives of each kind, every score in range, ${LEAD} flown a second time the same`);
    out.push("", `the arms (the mean over ${AUDIT.length} audit lives):`);
    for (const [a, s] of Object.entries(R.arms)) out.push(`${a.padEnd(7)} course ${f(s.course)} | home ${f(s.home)}`);
    for (const name of ["O", "W", "X", "Y"]) { const t = R[name]; if (t) out.push("", `${name}: above ${t.above}, below ${t.below}, ties ${t.ties} of ${t.n}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    return out;
}
