// WebGLEngine/tools/ship/flyHome.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY FINDS HOME, AS ARITHMETIC (registered in brain/FLY_FINDS_HOME_WIP.md before this file existed): DOES THE COMPASS THE FLY LEARNED TO HOLD A COURSE CARRY IT BACK TO ITS DOOR?
// NOTHING IS TRAINED. The flies are the compass round's (brain/flyCompassRound.jsonl: PLASTIC, FROZEN, PSHUF) and the balanced round's (brain/flyCompassBalancedRound.jsonl: PSUM, PEVEN),
// draws 1 to 12, as committed. Each is wrapped in brain/rl/homingFly.mjs (a home vector in its own heading; home from tick 1,000) and flown on brain/rl/homeEnv.mjs (the compass life with a
// door). Readings: V (PLASTIC against vision off) and H (against the hand rule), sign tests; P2 (PLASTIC against FROZEN), T1 (PLASTIC against PSHUF), A (PSUM against PLASTIC) and B (PEVEN
// against PLASTIC), exact rank sums. The command is tools/ship/takeFlyHome.mjs.
//
//   SEEDS, ARMS, LEAD, AUDIT, ALPHA, RESULTS, COMPASS, COMPASS_SHA256, BALANCED, BALANCED_SHA256, WORDS
//   fileOf(bytes)                         { sha256, lines } of a committed results file
//   committed(arm, s, compass, balanced)  the committed record of a fly
//   policyOf(arm, s), flyOf(arm, s, weights), homeScore(fly, lives, told)
//   auditOne(arm, s, compass, balanced, audit)   { kind: "fly", arm, s, weightsHash, home, course }
//   floors(audit)                         { kind: "floors", off, start, hand, told }
//   parseArgs(argv), checkRecords(lines, compass, balanced), reading(lines, compass, balanced), readingLines(R)
// NOT HERE: the 60 audits (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { HomeEnv } from "../../brain/rl/homeEnv.mjs";
import { HomingFly } from "../../brain/rl/homingFly.mjs";
import { rankSum, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as V from "./flyCompass.mjs";
import * as B from "./flyCompassBalanced.mjs";

export const SEEDS = Object.freeze(Array.from({ length: 12 }, (_, k) => k + 1));
export const ARMS = Object.freeze(["PLASTIC", "FROZEN", "PSHUF", "PSUM", "PEVEN"]), LEAD = "PLASTIC";
export const AUDIT = Object.freeze(Array.from({ length: 200 }, (_, k) => 50000001 + 7919 * k)), ALPHA = 0.01;
export const RESULTS = "brain/flyHomeRound.jsonl", COMPASS = V.RESULTS, COMPASS_SHA256 = B.COMPASS_SHA256, BALANCED = B.RESULTS, BALANCED_SHA256 = "24a6bb78dfd9a39dd5db6189cd9f87d7434a043611ac05bf3782beed8eab4dd4";
const BAL = new Set(["PSUM", "PEVEN"]);

/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
const armOk = (arm, s, who) => {
    if (!ARMS.includes(arm)) throw new Error(`flyHome.${who}: no arm ${arm} (the arms are ${ARMS.join(", ")})`);
    if (!SEEDS.includes(s)) throw new Error(`flyHome.${who}: a draw is 1 to 12 (got ${s})`);
};
/** See the header. */
export function committed(arm, s, compass, balanced) { armOk(arm, s, "committed"); return (BAL.has(arm) ? balanced : compass).lines.find((r) => r.kind === "draw" && r.arm === arm && r.s === s) || null; }
/** See the header: the untrained compass fly of an arm (its wiring the round's). */
export function policyOf(arm, s) { armOk(arm, s, "policyOf"); return BAL.has(arm) ? B.policyOf(arm, s) : V.policyOf(arm, s); }
/** See the header. */
export function flyOf(arm, s, weights) { return policyOf(arm, s).setParams(Float32Array.from(weights)); }
/** See the header: the mean of a life's score() over lives, the fly wrapped to keep a home vector (told: its phi set to the true heading before each tick). */
export function homeScore(fly, lives = AUDIT, told = false) {
    const env = new HomeEnv(), h = new HomingFly(fly); let sum = 0;
    for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { if (told) h.phi = env.th; const r = env.step(h.act(o)); o = r.obs; done = r.done; } sum += env.score(); }
    return sum / lives.length;
}
/** See the header. */
export function auditOne(arm, s, compass, balanced, audit = AUDIT) {
    const r = committed(arm, s, compass, balanced); if (!r) throw new Error(`flyHome.auditOne: ${arm} draw ${s} is not in its committed file`);
    return { kind: "fly", arm, s, weightsHash: r.weightsHash, home: homeScore(flyOf(arm, s, unpackWeights(r.weights)), audit), course: r.score };
}
/** See the header. */
export function floors(audit = AUDIT) {
    return { kind: "floors", off: homeScore(V.policyOf("FROZEN", 1).setParams([0]), audit), start: homeScore(V.policyOf("FROZEN", 1), audit), hand: homeScore(V.policyOf("PLASTIC", 1).setParams(V.HAND), audit), told: homeScore(V.policyOf("FROZEN", 1), audit, true) };
}
/** See the header. `job` takes a registered arm and draw only; `run` at least one process. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && ARMS.includes(rest[0]) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const FIRST = SEEDS[0], fin = (v) => Number.isFinite(v);
/** See the header. `compass` and `balanced` are fileOf(the two committed files). */
export function checkRecords(lines, compass, balanced) {
    const bad = [];
    if (!compass || compass.sha256 !== COMPASS_SHA256) bad.push(`the compass round's file is not the one committed (sha256 ${COMPASS_SHA256.slice(0, 16)}...)`);
    else { const cb = V.checkRecords(compass.lines); if (cb.length) bad.push(`the compass round's file fails its own checks: ${cb[0]}`); }
    if (!balanced || balanced.sha256 !== BALANCED_SHA256) bad.push(`the balanced round's file is not the one committed (sha256 ${BALANCED_SHA256.slice(0, 16)}...)`);
    else if (compass) { const bb = B.checkRecords(balanced.lines, compass); if (bb.length) bad.push(`the balanced round's file fails its own checks: ${bb[0]}`); }
    if (bad.length) return bad;
    const flies = lines.filter((r) => r && r.kind === "fly"), seen = new Map();
    for (const r of flies) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (flies.length !== ARMS.length * SEEDS.length) bad.push(`${flies.length} flies (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of flies) {
        const id = `${r.arm} draw ${r.s}`;
        if (!ARMS.includes(r.arm) || !SEEDS.includes(r.s)) { bad.push(`${id} is not a registered fly`); continue; }
        const c = committed(r.arm, r.s, compass, balanced);
        if (!c || r.weightsHash !== c.weightsHash) bad.push(`${id}'s weights are not its committed record's`);
        if (!c || r.course !== c.score) bad.push(`${id}'s course score is not its committed record's`);
        if (!(fin(r.home) && r.home >= 0 && r.home <= 1)) bad.push(`${id} has no score at home from 0 to 1`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = flies.find((r) => r.arm === LEAD && r.s === FIRST);
    if (re.length !== 1 || !first || re[0].arm !== LEAD || re[0].s !== FIRST || re[0].home !== first.home) bad.push(`${LEAD} draw ${FIRST} audited a second time is not there once with the same score`);
    const fl = lines.filter((r) => r && r.kind === "floors");
    if (fl.length !== 1 || !["off", "start", "hand", "told"].every((k) => fin(fl[0][k]))) bad.push("the floors are not there once");
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const rankOf = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length); o.forEach(([, i], k) => (r[i] = k + 1)); return r; };
const spearman = (x, y) => { const a = rankOf(x), b = rankOf(y), n = x.length; return 1 - 6 * a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / (n * (n * n - 1)); };
const three = (a, b) => Object.freeze([`${a} FINDS HOME BETTER THAN ${b}`, `${a} FINDS HOME WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b} AT FINDING HOME`]);
const PL = "THE PLASTIC FLY ON THE REAL WIRING";
export const WORDS = Object.freeze({ V: three(PL, "PATH INTEGRATION ALONE"), P2: three(PL, "THE FLY WHOSE MAP DOES NOT LEARN"), T1: three(PL, "ONE ON A SHUFFLE OF IT"), A: three("A FLY ON RANDOM PARTNERS GIVEN THE REAL SUMS", PL), B: three("A FLY ON THE REAL PARTNERS GIVEN EVEN SUMS", PL), H: three(PL, "THE RULE SET BY HAND") });
const RS = Object.freeze({ P2: ["PLASTIC", "FROZEN"], T1: ["PLASTIC", "PSHUF"], A: ["PSUM", "PLASTIC"], B: ["PEVEN", "PLASTIC"] });
/** See the header. A failed check leaves every reading null. */
export function reading(lines, compass, balanced) {
    const checks = checkRecords(lines, compass, balanced), flies = lines.filter((r) => r && r.kind === "fly"), fl = lines.find((r) => r && r.kind === "floors") || null;
    const of = (arm) => flies.filter((r) => r.arm === arm).sort((a, b) => a.s - b.s), home = (arm) => of(arm).map((r) => r.home), arms = {};
    for (const arm of ARMS) { const v = of(arm); if (v.length) arms[arm] = { ...stats(v.map((r) => r.home)), course: stats(v.map((r) => r.course)).mean, spearman: v.length > 2 ? spearman(v.map((r) => r.course), v.map((r) => r.home)) : null }; }
    const out = { checks, arms, floors: fl, V: null, P2: null, T1: null, A: null, B: null, H: null };
    if (checks.length) return out;
    const sign = (name, ref) => { const h = signTest(home(LEAD), ref), w = WORDS[name]; return { ...h, a: LEAD, ref, word: h.p <= ALPHA && h.above > h.below ? w[0] : h.p <= ALPHA && h.below > h.above ? w[1] : w[2] }; };
    for (const [name, [a, b]] of Object.entries(RS)) { const h = rankSum(home(a), home(b)), w = WORDS[name]; out[name] = { ...h, a, b, word: h.p <= ALPHA && h.pHigher < h.pLower ? w[0] : h.p <= ALPHA && h.pLower < h.pHigher ? w[1] : w[2] }; }
    return { ...out, V: sign("V", fl.off), H: sign("H", fl.hand) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: both committed files as committed and passing their own checks; ${ARMS.length * SEEDS.length} flies, each once, each with its committed weights and course score; ${LEAD} draw ${FIRST} audited twice the same; the floors`);
    out.push("", `the arms (the mean of 12 flies; ${AUDIT.length} audit lives; the course score is the fly's committed one):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(8)} home ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | course ${f(s.course)} | Spearman of course against home ${s.spearman === null ? "-" : s.spearman.toFixed(2)}`);
    if (R.floors) out.push("", `vision off ${f(R.floors.off)}, the start ${f(R.floors.start)}, the hand rule ${f(R.floors.hand)}, the start told the true heading ${f(R.floors.told)}`);
    for (const name of ["V", "H"]) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${f(t.ref)}): above ${t.above}, below ${t.below}, ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    for (const name of ["P2", "T1", "A", "B"]) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${t.b}): ${t.a}'s ranks sum to ${t.sumA} (the middle is ${t.n * (t.n + t.m + 1) / 2}), ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    return out;
}
