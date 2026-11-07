// WebGLEngine/tools/ship/takeDecisionCircuit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeDecisionCircuit-selfcheck.mjs      (about 30 s)
//
// THE GATE OF tools/ship/takeDecisionCircuit.mjs: the audit of the decision circuit against the twin, registered in brain/DECISION_CIRCUIT_VS_TWIN_WIP.md before any code. Synthetic runs hold the logic; a few real dives at a shortened length hold the wiring. No registered seed (17001-17300) is flown here.
//   1  REGISTERED  the block (seeds 17001-17300 of far and both: 600 keys, kind-major), the six arms, the three circuit arms and their families, the START set (24 dives), the floor 0.02, the files; the digest of a weight vector.
//   2  THE READING BEATS iff positive, above 2 se AND at least 0.02 (each of the three conditions alone fails a row); IS BELOW the mirror; the hull test b - b0 <= 2 sqrt(b + b0) at its edges (0 against 4 passes, 0 against 5 pays more).
//   3  BOTTOM LINES  the five registered lines in the registered order -- the hull first even when V1 ties, then THE CIRCUIT IS THE RULE, the planner-below line with the memory-and-reservoir tail only when BOTH controls tie, the cannot-be-told-apart line with the 2 se, the beats-the-planner line with V2 and V4.
//   4  VERDICTS     worked on synthetic arms of known differences: V1, both V2, V3, V4, the calibration.
//   5  THE FILE     readAudit: arms by name, START, a duplicate or an unknown arm refused by name.
//   6  THE CHECKS   each of TRAINING FILE, START, KEYS, CHAMPIONS, SCORES passes on a whole audit and fails by name on its own sabotage (a missing arm, a changed fingerprint, a key out of order, a range that differs, a wrong champion, a score out of range ...).
//   7  THE REPORT   a failed check is the first line and the verdicts are NOT WEIGHED; a good audit prints the checks, the ledger, the means, the calibration, V1-V4 and the bottom line; a block that is not the registered one says so; an arm with no champion says it IS rule-low06.
//   8  THE COMMAND  parseArgs and parseFlights refusals; `fly` resumes, refuses a file of another block, runs worker processes through the spawner, stops with the resume hint; `--one` prints one RESULT; `report` refuses a missing, empty or unreadable file; the real file handling; runChild.
//   9  REAL DIVES   the rules, the twin and the three circuit arms flown for real on a few dives: keys, scores equal to the task's own, a champion flown instead of the untrained circuit (and recorded with its digest), an arm with no champion recorded as the rule, the START rows (24 dives, all equal).
// NOT CHECKED, said plainly: the 600-dive audit itself (that is the experiment, read once); that four worker processes give the same records as one; the twin's cost on the board.
//
// SABOTAGE LOG (2026-11-07), 325 mutants of tools/ship/takeDecisionCircuit.mjs -- 306 mechanical (every comparison, sign, arithmetic operator, constant +-1 and boolean of every code line, one at a time) and 19 by hand (the floor needing more than 0.02, the hull moved after V1, the digest and the flight-sameness checks dropped, START comparing scores only, the champion not flown, the START rule at the Round 8 constants,
// the keys seed-major, the dive length ignored, the calibration reversed, V3 against the rule, V2 against the wrong control, the hull against the twin, the ledger's largest the smallest, a duplicate arm allowed, the circuit arms' control the twin, the START set one seed short, the range one seed short, a stale START of any dive length kept, the resume ignoring the file), each applied to an isolated tree and this
// gate run; the file restored (sha256 identical before and after).
//   FIRST PASS: 208 red, 58 threw, 55 went 0 red, 4 timed out. THE TIMEOUTS were mutants that sent a run to a REAL child process (a one-worker run, or a run past the injected spawner): the gate then flew the REGISTERED block in the mutated tree for as long as it was allowed -- nothing of it was recorded (the child's output went to a pipe the killed gate had closed) and the stray processes were killed, but the lesson is in the
//   rows: every in-process io now carries a spawner that THROWS ('THE SPAWNER WAS USED'), and the row that injects one runs a ONE-DIVE block at 60 s, so a bypass costs seconds and fails by name. THE 55 SURVIVORS were mostly shapes tested and not contents: a mean that only had to look like 0.xxxx (so an off-by-one in the sum passed), the words of the refusals, the padding of names, the digits of the calibration line, a reading of the largest weight
//   movement that only had to be a number, a registered-block mark tested with every field different at once, the digest only tested for being a digest. Rows were written that pin the whole report word for word (head, means, per-kind means, calibration, V1 to V4, bottom line), the five bottom lines word for word, the digest to known values (one with a leading zero), the ledger's movement computed here by hand (and a weight moved DOWN),
//   each of the four ways a read can differ from the registered block alone, every refusal of parseArgs and parseFlights, the edges of the numbers (a block of one seed, half a second), the progress lines, a results file that is not JSON, a report of arms without START and of START without arms, the DEFAULT flyer flying for real (one far dive of the rule at 60 s, the START rows, and a circuit arm flown from the champion of a given training file).
//   SECOND PASS: the 59 that had survived or timed out re-run against the new gate: 52 red, 7 remain and ALL SEVEN ARE EQUIVALENT, each argued: the mean of an EMPTY list (reached only by a kind with no dives, which the KEYS check refuses first), the two strict comparisons of the sign in readingOf (a mean above 2 se is positive already, because an se is not negative: p.mean > 0 and p.mean >= 0 are one test), the same with a bound of 1 for the negative
//   side, the reference record for the block (arms[ARM_IDS[0]] against arms[ARM_IDS[1]], two mutants: KEYS makes them equal), and the slice that drops the 'RESULT ' prefix by 7 characters (JSON.parse tolerates the space a slice of 6 leaves).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as T from "../../brain/needsTask.mjs";
import * as B from "../../brain/switchboard.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as SV from "../../brain/surveySeat.mjs";
import * as D from "./trainDecisionCircuit.mjs";
import * as X from "./takeDecisionCircuit.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol;
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
console.log("takeDecisionCircuit-selfcheck -- the audit of the decision circuit against the twin\n");

sec("1. THE REGISTERED BLOCK");
{
    const keys = X.keysOf();
    ok("!! the block is seeds 17001 to 17300 of far and then both, kind-major: 600 keys, far:17001 first, far:17300, both:17001, both:17300 last", X.RANGE.from === 17001 && X.RANGE.to === 17300 && J(X.KINDS) === J(["far", "both"]) && keys.length === 600 && keys[0] === "far:17001" && keys[299] === "far:17300" && keys[300] === "both:17001" && keys[599] === "both:17300" && new Set(keys).size === 600);
    ok("!! keysOf follows its arguments (seeds 5-7 of plain and deep: plain:5 plain:6 plain:7 deep:5 ...)", J(X.keysOf({ from: 5, to: 7 }, ["plain", "deep"])) === J(["plain:5", "plain:6", "plain:7", "deep:5", "deep:6", "deep:7"]));
    ok("!! the six arms in order: rule-r8, rule-low06, twin-standard, circuit-cx, circuit-nostate, circuit-plain; the circuit arms map to cx, nostate, plain; the flights add START", J(X.ARM_IDS) === J(["rule-r8", "rule-low06", "twin-standard", "circuit-cx", "circuit-nostate", "circuit-plain"]) && X.CIRCUIT_OF["circuit-cx"] === "cx" && X.CIRCUIT_OF["circuit-nostate"] === "nostate" && X.CIRCUIT_OF["circuit-plain"] === "plain" && X.FLIGHTS.length === 7 && X.FLIGHTS[6] === "START" && X.TWIN_ARM === "twin-standard");
    ok("!! the START set is the four kinds at seeds 501 to 506: 24 dives; the floor is 0.02; the files are the training file and brain/decisionCircuitAudit.jsonl", X.START_COUNT === 24 && X.START_KINDS.length * (X.START_SEEDS.to - X.START_SEEDS.from + 1) === 24 && X.START_SEEDS.from === 501 && X.START_SEEDS.to === 506 && X.MIN_EDGE === 0.02 && X.TRAINING_FILE === "brain/decisionCircuitTraining.jsonl" && X.AUDIT_FILE === "brain/decisionCircuitAudit.jsonl");
    const a = X.digestOf([1, 2, 3]), b = X.digestOf([1, 2, 3.0000001]), c = X.digestOf([1, 2, 3.5]);
    ok("!! the digest is eight hex digits of the Float32 bytes: the same for the same numbers, the same for 3 and 3.0000001 (the same Float32), different for 3.5 and for another order, and different in length", /^[0-9a-f]{8}$/.test(a) && a === X.digestOf([1, 2, 3]) && a === b && a !== c && X.digestOf([3, 2, 1]) !== a && X.digestOf([1, 2]) !== a && X.digestOf([1, 2, 3, 0]) !== a);
    ok("!! the digest is pinned to known values (FNV-1a over the Float32 bytes): [1,2,3] -> ec72a158, [0] -> 4b95f515, [0,0] -> 9be17165, and a vector whose hash starts with a zero keeps it ([38/7, 38] -> 0691f783: eight digits, padded)", X.digestOf([1, 2, 3]) === "ec72a158" && X.digestOf([0]) === "4b95f515" && X.digestOf([0, 0]) === "9be17165" && X.digestOf([38 / 7, 38]) === "0691f783");
}

sec("2. THE READING AND THE HULL");
{
    const p = (mean, se) => ({ mean, se });
    ok("!! BEATS needs all three: +0.03 at se 0.005 BEATS; +0.0199 at se 0.001 TIES (under the floor); +0.03 at se 0.015 TIES (exactly 2 se is not above); +0.03 at se 0.02 TIES; 0.02 at se 0.001 BEATS (the floor is 'at least')", X.readingOf(p(0.03, 0.005)) === "BEATS" && X.readingOf(p(0.0199, 0.001)) === "TIES" && X.readingOf(p(0.03, 0.015)) === "TIES" && X.readingOf(p(0.03, 0.02)) === "TIES" && X.readingOf(p(0.02, 0.001)) === "BEATS");
    ok("!! IS BELOW is the mirror: -0.03 at se 0.005 IS BELOW; -0.0199 at se 0.001 TIES; -0.03 at se 0.015 TIES; -0.02 at se 0.001 IS BELOW", X.readingOf(p(-0.03, 0.005)) === "IS BELOW" && X.readingOf(p(-0.0199, 0.001)) === "TIES" && X.readingOf(p(-0.03, 0.015)) === "TIES" && X.readingOf(p(-0.02, 0.001)) === "IS BELOW");
    ok("!! a mean of zero TIES whatever the se, a zero-spread positive mean (se 0, +0.05) BEATS and a zero-spread negative (-0.05) IS BELOW, and a small positive mean with a tiny se (+0.01, se 0.0001) still TIES: the floor binds", X.readingOf(p(0, 0)) === "TIES" && X.readingOf(p(0, 0.5)) === "TIES" && X.readingOf(p(0.05, 0)) === "BEATS" && X.readingOf(p(-0.05, 0)) === "IS BELOW" && X.readingOf(p(0.01, 0.0001)) === "TIES" && X.readingOf(p(-0.01, 0.0001)) === "TIES");
    ok("!! the hull test: equal counts NO WORSE; fewer NO WORSE; 4 against none NO WORSE (4 <= 2 sqrt 4); 5 against none PAYS MORE (5 > 4.47); 10 against 6 NO WORSE (4 <= 8); 20 against 6 PAYS MORE (14 > 10.2); 3 against 1 NO WORSE (2 <= 4); 0 against 0 NO WORSE", X.hullOf(3, 3) === "NO WORSE" && X.hullOf(1, 6) === "NO WORSE" && X.hullOf(4, 0) === "NO WORSE" && X.hullOf(5, 0) === "PAYS MORE" && X.hullOf(10, 6) === "NO WORSE" && X.hullOf(20, 6) === "PAYS MORE" && X.hullOf(3, 1) === "NO WORSE" && X.hullOf(0, 0) === "NO WORSE" && X.hullOf(0, 7) === "NO WORSE");
    ok("!! the edge of the hull test on larger counts: 12 against 4 (8 <= 8) NO WORSE; 13 against 4 (9 > 8.25) PAYS MORE", X.hullOf(12, 4) === "NO WORSE" && X.hullOf(13, 4) === "PAYS MORE");
    ok("!! badCount counts the crushed or stranded dives of a run list", X.badCount([{ bad: true }, { bad: false }, { bad: true }, {}]) === 2 && X.badCount([]) === 0);
}

sec("3. THE BOTTOM LINES (the first that applies)");
{
    const r = (reading, mean = 0.03, se = 0.01) => ({ reading, mean, se, n: 600 });
    const v = (o = {}) => ({ v1: r("BEATS"), v2n: r("TIES", 0.001), v2p: r("TIES", 0.001), v3: r("IS BELOW", -0.02), v4: "NO WORSE", b: 3, b0: 3, ...o });
    ok("!! (1) V4 PAYS MORE -> THE CIRCUIT BUYS ITS SCORE WITH THE HULL, FIRST: even when V1 TIES and even when V1 BEATS and V3 BEATS", /^THE CIRCUIT BUYS ITS SCORE WITH THE HULL/.test(X.bottomLine(v({ v4: "PAYS MORE", b: 9, b0: 2 }))) && /^THE CIRCUIT BUYS ITS SCORE WITH THE HULL/.test(X.bottomLine(v({ v4: "PAYS MORE", v1: r("TIES") }))) && /^THE CIRCUIT BUYS ITS SCORE WITH THE HULL/.test(X.bottomLine(v({ v4: "PAYS MORE", v3: r("BEATS") }))) && /9 crushed or stranded dives against the rule's 2/.test(X.bottomLine(v({ v4: "PAYS MORE", b: 9, b0: 2 }))));
    ok("!! (2) V1 TIES or IS BELOW -> THE CIRCUIT IS THE RULE, whatever V3 says", /^THE CIRCUIT IS THE RULE \(V1 TIES/.test(X.bottomLine(v({ v1: r("TIES", 0.004) }))) && /^THE CIRCUIT IS THE RULE \(V1 IS BELOW/.test(X.bottomLine(v({ v1: r("IS BELOW", -0.05), v3: r("BEATS") }))) && /^THE CIRCUIT IS THE RULE/.test(X.bottomLine(v({ v1: r("TIES"), v3: r("BEATS") }))));
    const l3 = X.bottomLine(v()), l3b = X.bottomLine(v({ v2n: r("BEATS") })), l3c = X.bottomLine(v({ v2p: r("IS BELOW", -0.04) }));
    ok("!! (3) V1 BEATS and V3 IS BELOW -> THE CIRCUIT BEATS ITS RULE AND NOT THE PLANNER; the tail '...AND NEITHER ITS MEMORY NOR ITS RESERVOIR IS WHAT DID IT' only when BOTH V2 lines TIE (not when either differs)", /^THE CIRCUIT BEATS ITS RULE AND NOT THE PLANNER/.test(l3) && /NEITHER ITS MEMORY NOR ITS RESERVOIR IS WHAT DID IT$/.test(l3) && /^THE CIRCUIT BEATS ITS RULE AND NOT THE PLANNER/.test(l3b) && !/NEITHER/.test(l3b) && !/NEITHER/.test(l3c));
    const l4 = X.bottomLine(v({ v3: r("TIES", 0.003, 0.004) }));
    ok("!! (4) V1 BEATS and V3 TIES -> THE CIRCUIT AND THE PLANNER CANNOT BE TOLD APART, stated with the power: '600 dives resolve a difference of about 2 se = 0.0080'", /^THE CIRCUIT AND THE PLANNER CANNOT BE TOLD APART/.test(l4) && /600 dives resolve a difference of about 2 se = 0\.0080/.test(l4));
    const l5 = X.bottomLine(v({ v3: r("BEATS", 0.025, 0.006), v2n: r("BEATS"), v2p: r("TIES") }));
    ok("!! (5) V1 BEATS and V3 BEATS -> THE CIRCUIT BEATS THE PLANNER, with V2 (both lines) and V4 in the same line", /^THE CIRCUIT BEATS THE PLANNER/.test(l5) && /V2 against nostate BEATS, against plain TIES; V4 NO WORSE/.test(l5));
    ok("!! the lines carry the numbers they were read from (V1 +0.0300 in (3), (4) and (5))", /V1 \+0\.0300/.test(l3) && /V1 \+0\.0300/.test(l4) && /V1 \+0\.0300/.test(l5) && /V3 -0\.0200/.test(l3));
    const r2 = (reading, mean, se) => ({ reading, mean, se, n: 600 });
    ok("!! the five lines, word for word: (1) the hull with the two counts; (2) the rule with V1's reading, mean (signed, four decimals, a zero reads +0.0000) and se; (3) the planner-below line with V2 and V4 and, only when both V2 tie, the tail; (4) the cannot-be-told-apart line with the dive count and 2 se; (5) the beats-the-planner line",
        X.bottomLine({ v1: r2("BEATS", 0.03, 0.01), v2n: r2("TIES", 0, 0.01), v2p: r2("TIES", 0, 0.01), v3: r2("IS BELOW", -0.02, 0.005), v4: "PAYS MORE", b: 9, b0: 2 }) === "THE CIRCUIT BUYS ITS SCORE WITH THE HULL (V4: 9 crushed or stranded dives against the rule's 2)"
        && X.bottomLine({ v1: r2("TIES", 0, 0.01), v2n: r2("TIES", 0, 0.01), v2p: r2("TIES", 0, 0.01), v3: r2("TIES", 0, 0.01), v4: "NO WORSE", b: 1, b0: 1 }) === "THE CIRCUIT IS THE RULE (V1 TIES: +0.0000, se 0.0100)"
        && X.bottomLine({ v1: r2("IS BELOW", -0.0234, 0.0051), v2n: r2("TIES", 0, 0.01), v2p: r2("TIES", 0, 0.01), v3: r2("TIES", 0, 0.01), v4: "NO WORSE", b: 1, b0: 1 }) === "THE CIRCUIT IS THE RULE (V1 IS BELOW: -0.0234, se 0.0051)"
        && X.bottomLine({ v1: r2("BEATS", 0.03, 0.01), v2n: r2("TIES", 0.001, 0.01), v2p: r2("TIES", 0.001, 0.01), v3: r2("IS BELOW", -0.02, 0.005), v4: "NO WORSE", b: 1, b0: 1 }) === "THE CIRCUIT BEATS ITS RULE AND NOT THE PLANNER (V1 +0.0300, V3 -0.0200; V2 against nostate TIES, against plain TIES; V4 NO WORSE); ...AND NEITHER ITS MEMORY NOR ITS RESERVOIR IS WHAT DID IT"
        && X.bottomLine({ v1: r2("BEATS", 0.03, 0.01), v2n: r2("BEATS", 0.04, 0.01), v2p: r2("TIES", 0.001, 0.01), v3: r2("IS BELOW", -0.02, 0.005), v4: "NO WORSE", b: 1, b0: 1 }) === "THE CIRCUIT BEATS ITS RULE AND NOT THE PLANNER (V1 +0.0300, V3 -0.0200; V2 against nostate BEATS, against plain TIES; V4 NO WORSE)"
        && X.bottomLine({ v1: r2("BEATS", 0.03, 0.01), v2n: r2("TIES", 0.001, 0.01), v2p: r2("TIES", 0.001, 0.01), v3: r2("TIES", 0.003, 0.004), v4: "NO WORSE", b: 1, b0: 1 }) === "THE CIRCUIT AND THE PLANNER CANNOT BE TOLD APART (V1 +0.0300, V3 +0.0030; 600 dives resolve a difference of about 2 se = 0.0080; V2 against nostate TIES, against plain TIES; V4 NO WORSE)"
        && X.bottomLine({ v1: r2("BEATS", 0.03, 0.01), v2n: r2("TIES", 0.001, 0.01), v2p: r2("BEATS", 0.05, 0.01), v3: r2("BEATS", 0.025, 0.006), v4: "NO WORSE", b: 1, b0: 1 }) === "THE CIRCUIT BEATS THE PLANNER (V1 +0.0300, V3 +0.0250; V2 against nostate TIES, against plain BEATS; V4 NO WORSE)"
        && X.bottomLine({ v1: r2("BEATS", 0.03, 0.01), v2n: r2("TIES", 0.001, 0.01), v2p: r2("TIES", 0.001, 0.01), v3: { reading: "TIES", mean: 0.003, se: 0.004 }, v4: "NO WORSE", b: 1, b0: 1 }, 480).includes("480 dives resolve"));
}

// ---- synthetic arms of known differences -----------------------------------------------------------------------------------------------------------------------------------------------------
const RANGE_S = { from: 1, to: 6 }, KINDS_S = ["far", "both"];
const keysS = X.keysOf(RANGE_S, KINDS_S);
const runsOf = (f, badAt = []) => keysS.map((key, i) => ({ key, score: f(i), bad: badAt.includes(i) }));
const wiggle = (i) => ((i * 7) % 5) / 100;   // 0, 0.07, 0.04, 0.01, 0.08 ... a spread so that se is not zero
const recOf = (arm, runs, extra = {}) => ({ arm, range: { ...RANGE_S }, kinds: [...KINDS_S], seconds: null, runs, ...extra });
function trainingOf({ none = [], k = { cx: 1, nostate: 2, plain: 0 } } = {}) {
    const counts = { cx: 2452, nostate: 2452, plain: 2443 }, out = [];
    for (const f of D.FAMILIES) for (let i = 0; i < 4; i++) {
        const w = new Array(counts[f]).fill(0); w[i] = 0.1 * (i + 1); w[10 + i] = -0.05 * (f.length);
        out.push({ spec: `${f}:${i}`, family: f, index: i, seed: D.seedOf({ family: f, index: i }), smoke: false, recipe: { ...D.RECIPE }, weightCount: counts[f], trainScore: 0.9 + (i === k[f] ? 0.02 : 0), improved: 3, neutral: 2, moved: 6, kept: 2 + i, pruneEvals: 5, heldOut: 0.88 + (i === k[f] ? 0.02 : 0), poolCrashed: none.includes(f) ? 5 : 0, start: { train: 0.87, heldOut: 0.884, poolCrashed: 0 }, weights: w });
    }
    return out;
}
const startRowsOk = () => ({ arm: "START", seconds: null, rows: X.keysOf({ from: 501, to: 506 }, X.START_KINDS).map((key, i) => ({ key, rule: { score: 0.5 + i / 100, fingerprint: "fp" + i }, cx: { score: 0.5 + i / 100, fingerprint: "fp" + i }, nostate: { score: 0.5 + i / 100, fingerprint: "fp" + i }, plain: { score: 0.5 + i / 100, fingerprint: "fp" + i } })) });
function auditOf(training, over = {}) {
    const base = (i) => 0.6 + wiggle(i);
    const f = { "rule-r8": (i) => base(i) - 0.01, "rule-low06": base, "twin-standard": (i) => base(i) + 0.02, "circuit-cx": (i) => base(i) + 0.03, "circuit-nostate": (i) => base(i) + 0.025, "circuit-plain": (i) => base(i) + 0.026 };
    const arms = {};
    for (const a of X.ARM_IDS) {
        const extra = X.CIRCUIT_OF[a] ? (() => { const c = D.championOf(training, X.CIRCUIT_OF[a]); return { champion: { family: X.CIRCUIT_OF[a], k: c.record ? c.record.index : null, seed: c.record ? c.record.seed : null, digest: c.record ? X.digestOf(c.record.weights) : "00000000", asRule: !c.record } }; })() : {};
        arms[a] = recOf(a, runsOf(f[a], a === "rule-low06" ? [2] : []), extra);
    }
    return { arms: { ...arms, ...(over.arms || {}) }, start: over.start === undefined ? startRowsOk() : over.start };
}

sec("4. THE VERDICTS (synthetic arms of known differences)");
{
    const tr = trainingOf(), au = auditOf(tr), runs = Object.fromEntries(X.ARM_IDS.map((a) => [a, au.arms[a].runs])), v = X.verdictsOf({ runs });
    ok("!! V1 cx against rule-low06 is +0.0300 exactly on every dive (a constant difference has se 0): better 12, worse 0, same 0; reading BEATS", near(v.v1.mean, 0.03, 1e-12) && v.v1.se < 1e-12 && v.v1.better === 12 && v.v1.worse === 0 && v.v1.reading === "BEATS" && v.v1.n === 12);
    ok("!! V2 cx against nostate is +0.0050 (BEATS: se 0, over the floor? no: under 0.02 so TIES) and against plain +0.0040 (TIES): both under the floor read TIES however steady the difference", near(v.v2n.mean, 0.005, 1e-12) && v.v2n.reading === "TIES" && near(v.v2p.mean, 0.004, 1e-12) && v.v2p.reading === "TIES");
    ok("!! V3 cx against the twin is +0.0100 (TIES under the floor) and the CALIBRATION is twin minus rule-low06 = +0.0200 (a paired difference, not a reading)", near(v.v3.mean, 0.01, 1e-12) && v.v3.reading === "TIES" && near(v.calibration.mean, 0.02, 1e-12) && v.calibration.reading === undefined);
    ok("!! V4 counts the arms' bad dives: cx 0 against rule-low06's 1 (the synthetic rule has one crushed dive): b 0, b0 1, NO WORSE", v.b === 0 && v.b0 === 1 && v.v4 === "NO WORSE");
    const runs2 = { ...runs, "circuit-cx": runs["circuit-cx"].map((r, i) => ({ ...r, bad: i < 8 })) }, v2 = X.verdictsOf({ runs: runs2 });
    ok("!! eight bad dives against one is PAYS MORE (7 > 2 sqrt 9 = 6)", v2.b === 8 && v2.b0 === 1 && v2.v4 === "PAYS MORE");
    const runs3 = { ...runs, "circuit-cx": runs["circuit-cx"].map((r, i) => ({ ...r, score: runs["rule-low06"][i].score + (i % 2 ? 0.1 : -0.04) })) }, v3 = X.verdictsOf({ runs: runs3 });
    ok("!! a noisy difference (+0.10 on half the dives, -0.04 on the other half; mean +0.03, se about 0.0233) is TIES: the 2 se condition binds on its own", near(v3.v1.mean, 0.03, 1e-12) && v3.v1.se > 0.015 && v3.v1.reading === "TIES");
    ok("!! verdictsOf pairs the SAME dives: an arm with the keys in another order is refused by the switchboard", throwsWith(() => X.verdictsOf({ runs: { ...runs, "circuit-cx": [...runs["circuit-cx"]].reverse() } }), /switchboard\.paired: scenario 0/));
}

sec("5. THE RESULTS FILE");
{
    const tr = trainingOf(), au = auditOf(tr), text = [au.start, ...X.ARM_IDS.map((a) => au.arms[a])].map((r) => J(r)).join("\n") + "\n", got = X.readAudit(text);
    ok("!! readAudit returns the arms by name and the START record apart", Object.keys(got.arms).length === 6 && X.ARM_IDS.every((a) => got.arms[a].arm === a) && got.start.arm === "START" && got.start.rows.length === 24);
    ok("!! an empty file reads as no arms and no START; a file with START only reads as that", Object.keys(X.readAudit("").arms).length === 0 && X.readAudit("").start === null && X.readAudit(J(au.start) + "\n").start.rows.length === 24);
    ok("!! a duplicate arm is refused by name (the audit is read once), and so are START twice and an unknown arm", throwsWith(() => X.readAudit(J(au.arms["rule-r8"]) + "\n" + J(au.arms["rule-r8"]) + "\n"), /arm rule-r8 is in the file twice/) && throwsWith(() => X.readAudit(J(au.start) + "\n" + J(au.start) + "\n"), /START rows are in the file twice/) && throwsWith(() => X.readAudit(J({ arm: "twin-low06", runs: [] }) + "\n"), /unknown arm "twin-low06"/));
    ok("!! a line that is not JSON is refused with its number", throwsWith(() => X.readAudit("{oops}\n"), /line 1 is not JSON/));
}

sec("6. THE CHECKS");
{
    const tr = trainingOf(), au = auditOf(tr), rows = X.checksOf(au, tr), by = (rs, n) => rs.find((r) => r.name === n);
    ok("!! a whole audit passes every check: TRAINING FILE, START, KEYS, CHAMPIONS, SCORES", J(rows.map((r) => r.name)) === J(["TRAINING FILE", "START", "KEYS", "CHAMPIONS", "SCORES"]) && rows.every((r) => r.ok), rows.filter((r) => !r.ok).map((r) => r.name + ": " + r.text).join(" | "));
    const f = (a, t = tr) => X.checksOf(a, t);
    // TRAINING FILE
    ok("!! TRAINING FILE fails on a file without the twelve searches (named by the trainer's own check) and on no file at all", by(f(au, tr.slice(0, 11)), "TRAINING FILE").ok === false && /needs 0 to 3/.test(by(f(au, tr.slice(0, 11)), "TRAINING FILE").text) && by(f(au, []), "TRAINING FILE").ok === false && by(f(au, null), "TRAINING FILE").ok === false);
    // START
    const sRows = (g) => { const s = startRowsOk(); g(s.rows); return s; };
    ok("!! START fails when the start rows are missing, or 23 rows, or 25, or a key twice", by(f({ ...au, start: null }), "START").ok === false && /missing/.test(by(f({ ...au, start: null }), "START").text) && by(f({ ...au, start: sRows((r) => r.pop()) }), "START").ok === false && by(f({ ...au, start: sRows((r) => r.push({ ...r[0], key: "far:999" })) }), "START").ok === false && by(f({ ...au, start: sRows((r) => { r[1] = { ...r[1], key: r[0].key }; }) }), "START").ok === false);
    ok("!! START fails when any one of cx, nostate, plain differs from the rule in its SCORE or its FINGERPRINT on any one dive, and is absent for a family; the text says how many dives differ", by(f({ ...au, start: sRows((r) => { r[3].cx = { ...r[3].cx, score: r[3].cx.score + 1e-9 }; }) }), "START").ok === false && by(f({ ...au, start: sRows((r) => { r[5].nostate = { ...r[5].nostate, fingerprint: "x" }; }) }), "START").ok === false && by(f({ ...au, start: sRows((r) => { r[23].plain = { ...r[23].plain, score: 0 }; }) }), "START").ok === false && by(f({ ...au, start: sRows((r) => { delete r[7].plain; }) }), "START").ok === false && /differ from rule-low06 on 2 of 24/.test(by(f({ ...au, start: sRows((r) => { r[1].cx = { ...r[1].cx, score: 0 }; r[2].plain = { ...r[2].plain, fingerprint: "z" }; }) }), "START").text));
    // KEYS
    const swapped = { ...au, arms: { ...au.arms, "twin-standard": recOf("twin-standard", [au.arms["twin-standard"].runs[1], au.arms["twin-standard"].runs[0], ...au.arms["twin-standard"].runs.slice(2)]) } };
    const short = { ...au, arms: { ...au.arms, "rule-r8": recOf("rule-r8", au.arms["rule-r8"].runs.slice(0, 11)) } };
    const otherRange = { ...au, arms: { ...au.arms, "rule-r8": { ...au.arms["rule-r8"], range: { from: 2, to: 7 } } } }, otherKinds = { ...au, arms: { ...au.arms, "rule-r8": { ...au.arms["rule-r8"], kinds: ["both", "far"] } } }, otherSeconds = { ...au, arms: { ...au.arms, "rule-r8": { ...au.arms["rule-r8"], seconds: 120 } } };
    const missing = (() => { const a = { ...au.arms }; delete a["circuit-plain"]; return { ...au, arms: a }; })();
    ok("!! KEYS fails when an arm is missing (named), when two dives are out of order in one arm, when an arm is one dive short, and when one arm's range, kinds or dive length differs from the others'", /circuit-plain are missing/.test(by(f(missing), "KEYS").text) && by(f(missing), "KEYS").ok === false && by(f(swapped), "KEYS").ok === false && by(f(short), "KEYS").ok === false && by(f(otherRange), "KEYS").ok === false && by(f(otherKinds), "KEYS").ok === false && by(f(otherSeconds), "KEYS").ok === false && /not all flown over one range/.test(by(f(otherRange), "KEYS").text));
    ok("!! KEYS reads the keys the arms CLAIM (their range and kinds) against the dives they hold: an arm that claims seeds 1-6 but holds seeds of another block fails", by(f({ ...au, arms: { ...au.arms, "rule-r8": recOf("rule-r8", au.arms["rule-r8"].runs.map((r) => ({ ...r, key: r.key + "x" }))) } }), "KEYS").ok === false);
    // CHAMPIONS
    const withCh = (arm, g) => ({ ...au, arms: { ...au.arms, [arm]: { ...au.arms[arm], champion: g(au.arms[arm].champion) } } });
    ok("!! CHAMPIONS fails when a circuit arm was flown from another search (k), another seed, another digest, with asRule claimed while a champion exists, with asRule false while none exists, or with no champion record at all; each arm is named", by(f(withCh("circuit-cx", (c) => ({ ...c, k: 0 }))), "CHAMPIONS").ok === false && /circuit-cx was flown from k 0 and the training file names k 1/.test(by(f(withCh("circuit-cx", (c) => ({ ...c, k: 0 }))), "CHAMPIONS").text) && by(f(withCh("circuit-nostate", (c) => ({ ...c, seed: 1 }))), "CHAMPIONS").ok === false && by(f(withCh("circuit-plain", (c) => ({ ...c, digest: "deadbeef" }))), "CHAMPIONS").ok === false && by(f(withCh("circuit-cx", (c) => ({ ...c, asRule: true, k: null }))), "CHAMPIONS").ok === false && by(f(withCh("circuit-cx", () => undefined)), "CHAMPIONS").ok === false);
    const trNone = trainingOf({ none: ["nostate"] }), auNone = auditOf(trNone);
    ok("!! a family with no eligible champion must be flown as the untrained circuit: the same audit passes CHAMPIONS when the arm says asRule, fails when it names a search, and the passing text says so", by(f(auNone, trNone), "CHAMPIONS").ok === true && by(f(withCh("circuit-nostate", () => ({ family: "nostate", k: 0, seed: 96510, digest: "00000000", asRule: false })) && { ...auNone, arms: { ...auNone.arms, "circuit-nostate": { ...auNone.arms["circuit-nostate"], champion: { family: "nostate", k: 0, seed: 96510, digest: "00000000", asRule: false } } } }, trNone), "CHAMPIONS").ok === false);
    ok("!! with no eligible champion the arm must say asRule AND no k: asRule true with a k named fails", by(f({ ...auNone, arms: { ...auNone.arms, "circuit-nostate": { ...auNone.arms["circuit-nostate"], champion: { family: "nostate", k: 2, seed: null, digest: "00000000", asRule: true } } } }, trNone), "CHAMPIONS").ok === false);
    // SCORES
    const sc = (v) => ({ ...au, arms: { ...au.arms, "circuit-cx": recOf("circuit-cx", au.arms["circuit-cx"].runs.map((r, i) => (i === 4 ? { ...r, score: v } : r)), { champion: au.arms["circuit-cx"].champion }) } });
    ok("!! SCORES fails on NaN, above 1 and below 0 (and passes at exactly 0 and exactly 1)", by(f(sc(NaN)), "SCORES").ok === false && by(f(sc(1.0001)), "SCORES").ok === false && by(f(sc(-0.0001)), "SCORES").ok === false && by(f(sc(1)), "SCORES").ok === true && by(f(sc(0)), "SCORES").ok === true && by(f(sc("0.5")), "SCORES").ok === false);
}

sec("7. THE REPORT");
{
    const tr = trainingOf(), au = auditOf(tr), L = X.report(au, tr);
    const wantNames = ["TRAINING FILE", "START", "KEYS", "CHAMPIONS", "SCORES"];
    ok("!! a good audit prints the header, the five checks as PASS, the ledger, the means with the bad counts, the per-kind means, the calibration, V1, both V2, V3, V4 and the BOTTOM LINE", /^THE DECISION CIRCUIT AGAINST THE TWIN: the survey, noisy gauge sd 0.10, far and both, seeds 1 to 6/.test(L[0]) && wantNames.every((n, i) => L[1 + i] === `  PASS ${n}: ${L[1 + i].slice(9 + n.length)}`) && L.some((l) => /^  rule-low06 +0\.\d{4}  bad 1/.test(l)) && L.some((l) => /^per kind: rule-r8: far 0\.\d{3,4} both/.test(l)) && L.some((l) => /^CALIBRATION \(cannot fail\): twin-standard minus rule-low06 \+0\.0200/.test(l)) && L.some((l) => /^V1 circuit-cx against rule-low06: \+0\.0300/.test(l)) && L.some((l) => /^V2 circuit-cx against circuit-nostate \(the memory\)/.test(l)) && L.some((l) => /^V2 circuit-cx against circuit-plain \(the reservoir\)/.test(l)) && L.some((l) => /^V3 circuit-cx against twin-standard/.test(l)) && L.some((l) => /^V4 the hull: circuit-cx 0 crushed or stranded dives, rule-low06 1: NO WORSE/.test(l)) && /^BOTTOM LINE: /.test(L[L.length - 1]));
    ok("!! the bottom line is the registered one for these arms (V1 BEATS, V3 TIES): THE CIRCUIT AND THE PLANNER CANNOT BE TOLD APART", /^BOTTOM LINE: THE CIRCUIT AND THE PLANNER CANNOT BE TOLD APART/.test(L[L.length - 1]));
    ok("!! the block is marked NOT THE REGISTERED BLOCK when it is not seeds 17001-17300 of far and both at full length (here seeds 1 to 6)", /NOT THE REGISTERED BLOCK/.test(L[0]));
    const reg = (g) => { const a = auditOf(tr); for (const id of X.ARM_IDS) { a.arms[id] = { ...a.arms[id], ...g(a.arms[id]) }; } return a; };
    const regL = X.report(reg((r) => ({ range: { ...X.RANGE }, kinds: [...X.KINDS], runs: X.keysOf().map((key, i) => ({ key, score: r.runs[i % 12].score, bad: false })) })), tr);
    ok("!! the registered block is NOT marked (seeds 17001-17300 of far and both, no cut dive), and the header names it", !/NOT THE REGISTERED BLOCK/.test(regL[0]) && /seeds 17001 to 17300/.test(regL[0]));
    const regVar = (over) => X.report(reg((r) => { const range = over.range || X.RANGE, kinds = over.kinds || X.KINDS; return { range: { ...range }, kinds: [...kinds], runs: X.keysOf(range, kinds).map((key, i) => ({ key, score: r.runs[i % 12].score, bad: false })) }; }), tr)[0];
    ok("!! the NOT-THE-REGISTERED-BLOCK mark follows EACH of the four things a read can differ in, alone: the first seed (17002), the last seed (17299), the kinds in another order (both, far), the kinds as a subset (far); and the registered block alone is unmarked", /NOT THE REGISTERED BLOCK/.test(regVar({ range: { from: 17002, to: 17300 } })) && /NOT THE REGISTERED BLOCK/.test(regVar({ range: { from: 17001, to: 17299 } })) && /NOT THE REGISTERED BLOCK/.test(regVar({ kinds: ["both", "far"] })) && /NOT THE REGISTERED BLOCK/.test(regVar({ kinds: ["far"] })) && !/NOT THE REGISTERED BLOCK/.test(regVar({})));
    const tail = L.slice(L.indexOf("means (bad = crushed or stranded dives):"));
    ok("!! the means, the per-kind means, the calibration, the reported rule difference, V1, both V2, V3, V4 and the bottom line read WORD FOR WORD, to four decimals, for the synthetic arms (rule-low06 0.6183, r8 0.6083, twin 0.6383, cx 0.6483, nostate 0.6433, plain 0.6443; far and both means; the arm names padded to 16)", J(tail) === J([
        "means (bad = crushed or stranded dives):",
        "  rule-r8          0.6083  bad 0", "  rule-low06       0.6183  bad 1", "  twin-standard    0.6383  bad 0", "  circuit-cx       0.6483  bad 0", "  circuit-nostate  0.6433  bad 0", "  circuit-plain    0.6443  bad 0",
        "per kind: rule-r8: far 0.6067 both 0.6100 | rule-low06: far 0.6167 both 0.6200 | twin-standard: far 0.6367 both 0.6400 | circuit-cx: far 0.6467 both 0.6500 | circuit-nostate: far 0.6417 both 0.6450 | circuit-plain: far 0.6427 both 0.6460",
        "CALIBRATION (cannot fail): twin-standard minus rule-low06 +0.0200 (se 0.0000), to be read against +0.012 to +0.033 (Rounds 12, 22 and 33)",
        "rule-low06 minus rule-r8 (reported): +0.0100 (se 0.0000; better 12, worse 0, same 0; bad 1 against 0)",
        "V1 circuit-cx against rule-low06: +0.0300 (se 0.0000; better 12, worse 0, same 0; bad 0 against 1) BEATS",
        "V2 circuit-cx against circuit-nostate (the memory): +0.0050 (se 0.0000; better 12, worse 0, same 0; bad 0 against 0) TIES",
        "V2 circuit-cx against circuit-plain (the reservoir): +0.0040 (se 0.0000; better 12, worse 0, same 0; bad 0 against 0) TIES",
        "V3 circuit-cx against twin-standard: +0.0100 (se 0.0000; better 12, worse 0, same 0; bad 0 against 0) TIES",
        "V4 the hull: circuit-cx 0 crushed or stranded dives, rule-low06 1: NO WORSE",
        "BOTTOM LINE: THE CIRCUIT AND THE PLANNER CANNOT BE TOLD APART (V1 +0.0300, V3 +0.0100; 12 dives resolve a difference of about 2 se = 0.0000; V2 against nostate TIES, against plain TIES; V4 NO WORSE)"]), tail.join("\n"));
    ok("!! the head of the report reads word for word: the header and the five check lines", J(L.slice(0, 6)) === J([
        "THE DECISION CIRCUIT AGAINST THE TWIN: the survey, noisy gauge sd 0.10, far and both, seeds 1 to 6 -- NOT THE REGISTERED BLOCK (a DEV or smoke read, no verdict of the round)",
        "  PASS TRAINING FILE: twelve searches (three families of four), one recipe, one start",
        "  PASS START: the untrained cx, nostate and plain equal rule-low06 on 24 baseline dives, scores and fingerprints",
        "  PASS KEYS: every arm flew the same 12 dives in the same order (far and both, seeds 1 to 6)",
        "  PASS CHAMPIONS: every circuit arm was flown from the champion the training file names (a family with none eligible, from the untrained circuit)",
        "  PASS SCORES: every score is a number in [0, 1]: true"]));
    const hw = (f) => D.familyPolicy(f).handWeights(), big = (f) => Math.max(...D.championOf(tr, f).record.weights.map((v, i) => Math.abs(v - hw(f)[i]))).toFixed(4);
    ok("!! the champion lines of the ledger read word for word, the largest movement being the largest ABSOLUTE difference from the start (computed here by hand from the hand weights), the family padded to eight, the kept count and the training scores to four decimals", L.includes(`  cx       champion k 1: 3 weights moved from the start, the largest by ${big("cx")}; last training score 0.9200 against the start's 0.8700 (+0.0500)`) && L.includes(`  nostate  champion k 2: 4 weights moved from the start, the largest by ${big("nostate")}; last training score 0.9200 against the start's 0.8700 (+0.0500)`) && L.includes(`  plain    champion k 0: 2 weights moved from the start, the largest by ${big("plain")}; last training score 0.9200 against the start's 0.8700 (+0.0500)`) && Number(big("cx")) > 0.3);
    const down = trainingOf().map((r) => (r.family === "cx" && r.index === 1 ? { ...r, weights: r.weights.map((v, i) => (i === 7 ? hw("cx")[7] - 5 : v === 0 ? hw("cx")[i] : v)) } : r)), LD = X.report(auditOf(down), down);
    ok("!! a weight moved DOWN counts by its size (absolute): a champion with one weight 5 below the start reads 'the largest by 5.0000'", LD.some((l) => /^  cx +champion k 1: .* the largest by 5\.0000;/.test(l)));
    const cut = X.report(reg(() => ({ seconds: 120 })), tr);
    ok("!! a cut dive length is said in the header and marks the block as not the registered one", /dives cut to 120 s/.test(cut[0]) && /NOT THE REGISTERED BLOCK/.test(cut[0]));
    const badAu = auditOf(tr, { start: null }), BL = X.report(badAu, tr);
    ok("!! a failed check is the FIRST line ('CHECK FAILED -- START: THE CHECKS FAILED, THE VERDICTS ARE NOT WEIGHED'), the check shows FAIL, and there are no V lines, no calibration and the bottom line reads NOT WEIGHED", /^CHECK FAILED -- START: THE CHECKS FAILED, THE VERDICTS ARE NOT WEIGHED/.test(BL[0]) && BL.some((l) => /^  FAIL START/.test(l)) && !BL.some((l) => /^V1 |^CALIBRATION|^means/.test(l)) && BL[BL.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)");
    const two = X.report(auditOf(tr, { start: null, arms: { "rule-r8": { ...auditOf(tr).arms["rule-r8"], runs: [] } } }), tr);
    ok("!! two failed checks are both named on the first line", /^CHECK FAILED -- START, KEYS:/.test(two[0]));
    const trN = trainingOf({ none: ["nostate"] }), LN = X.report(auditOf(trN), trN);
    ok("!! an arm flown with no eligible champion says in its means line that it IS rule-low06; the ledger says NO ELIGIBLE CHAMPION for the family", LN.some((l) => /circuit-nostate .*\(no eligible champion: this arm IS rule-low06\)/.test(l)) && LN.some((l) => /NO ELIGIBLE CHAMPION: the family IS rule-low06/.test(l)) && !LN.some((l) => /circuit-cx .*no eligible champion/.test(l)));
    ok("!! the ledger lists, for a family with a champion, the weights moved from the start, the largest movement and the last training score against the start's", L.some((l) => /^  cx +champion k 1: 3 weights moved from the start, the largest by 0\.\d{4}; last training score 0\.9200 against the start's 0\.8700 \(\+0\.0500\)/.test(l)) && L.some((l) => /^  plain +champion k 0: 2 weights moved/.test(l)));
    const hullAu = auditOf(tr); hullAu.arms["circuit-cx"] = { ...hullAu.arms["circuit-cx"], runs: hullAu.arms["circuit-cx"].runs.map((r, i) => ({ ...r, bad: i < 9 })) };
    ok("!! a circuit that crushes nine dives against the rule's one reads THE CIRCUIT BUYS ITS SCORE WITH THE HULL as the bottom line", /^BOTTOM LINE: THE CIRCUIT BUYS ITS SCORE WITH THE HULL/.test(X.report(hullAu, tr).slice(-1)[0]));
    const emptyL = X.report({ arms: {}, start: null }, tr);
    ok("!! an audit with nothing in it fails its checks without throwing (arms missing named) and weighs nothing", /^CHECK FAILED -- START, KEYS/.test(emptyL[0]) && /no arms flown/.test(emptyL[1]) && emptyL[emptyL.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)");
}

sec("8. THE COMMAND");
{
    const pa = (argv) => { try { return X.parseArgs(argv); } catch (e) { return e.message; } };
    ok("!! the first word is fly or report; unknown options, stray words and missing values are refused by name", /must be fly or report/.test(pa([])) && /must be fly or report/.test(pa(["run"])) && /unknown option "--nope"/.test(pa(["fly", "--nope"])) && /unexpected argument "x"/.test(pa(["fly", "x"])) && /--out needs a value/.test(pa(["fly", "--out"])) && /--out needs a value/.test(pa(["fly", "--out", "--arms", "all"])) && /needs a number/.test(pa(["fly", "--out", "f", "--from", "x"])));
    ok("!! fly needs --out (not for --one); report needs --in", /fly needs --out/.test(pa(["fly"])) && !/fly needs/.test(String(pa(["fly", "--one", "rule-r8"]))) && /report needs --in/.test(pa(["report"])) && pa(["report", "--in", "a"]).in === "a" && pa(["report", "--in", "a"]).training === X.TRAINING_FILE && pa(["report", "--in", "a", "--training", "t"]).training === "t");
    const d = pa(["fly", "--out", "f"]);
    ok("!! the defaults are the registered block: seeds 17001-17300, far and both, every arm and START, one worker, the training file, no cut dive", J(d.range) === J({ from: 17001, to: 17300 }) && J(d.kinds) === J(["far", "both"]) && d.arms === "all" && d.workers === 1 && d.seconds === null && d.training === X.TRAINING_FILE && d.quiet === false && d.one === null && d.out === "f");
    const e = pa(["fly", "--out", "f", "--from", "1", "--to", "4", "--kinds", "plain,deep", "--seconds", "120", "--workers", "3", "--arms", "rule-r8,START", "--training", "t", "--quiet"]);
    ok("!! every option is read: seeds 1 to 4, kinds plain and deep, 120 s, 3 workers, the arm list, the training file, quiet", J(e.range) === J({ from: 1, to: 4 }) && J(e.kinds) === J(["plain", "deep"]) && e.seconds === 120 && e.workers === 3 && e.arms === "rule-r8,START" && e.training === "t" && e.quiet === true);
    ok("!! the numbers are checked: from and to whole, from at least 1, to at least from; kinds known and not twice; seconds above 0; workers a whole number of 1 or more; the arm list known, no arm twice, --one a single arm", /--from and --to must be whole/.test(pa(["fly", "--out", "f", "--from", "0"])) && /--from and --to must be whole/.test(pa(["fly", "--out", "f", "--from", "5", "--to", "4"])) && /--from and --to must be whole/.test(pa(["fly", "--out", "f", "--from", "1.5"])) && /unknown kind "sea"/.test(pa(["fly", "--out", "f", "--kinds", "far,sea"])) && /named twice/.test(pa(["fly", "--out", "f", "--kinds", "far,far"])) && /--seconds must be above 0/.test(pa(["fly", "--out", "f", "--seconds", "0"])) && /--workers must be a whole number/.test(pa(["fly", "--out", "f", "--workers", "0"])) && /--workers must be a whole number/.test(pa(["fly", "--out", "f", "--workers", "1.5"])) && /unknown arm "twin-low06"/.test(pa(["fly", "--out", "f", "--arms", "twin-low06"])) && /named twice/.test(pa(["fly", "--out", "f", "--arms", "rule-r8,rule-r8"])) && /an empty name/.test(pa(["fly", "--out", "f", "--arms", "rule-r8,,START"])) && /--one takes a single arm/.test(pa(["fly", "--one", "all"])));
    ok("!! parseFlights: 'all' is the six arms and START in order; a list is that list", J(X.parseFlights("all")) === J([...X.ARM_IDS, "START"]) && J(X.parseFlights(" START , circuit-cx ")) === J(["START", "circuit-cx"]));

    const fake = (arm, o) => (arm === "START" ? { arm: "START", seconds: o.seconds, rows: [] } : { arm, range: { ...o.range }, kinds: [...o.kinds], seconds: o.seconds, runs: [] });
    const mem = (files = {}) => { const fsx = { ...files }, o = { out: [], err: [], flown: [], files: fsx }; return Object.assign(o, { io: { out: (m) => o.out.push(m), err: (m) => o.err.push(m), readFile: (f) => { if (!(f in fsx)) throw new Error("ENOENT " + f); return fsx[f]; }, appendFile: (f, t) => { fsx[f] = (fsx[f] || "") + t; }, exists: (f) => f in fsx, flyer: (arm, op) => { o.flown.push(arm); return fake(arm, op); }, spawner: async (name) => { throw new Error("THE SPAWNER WAS USED for " + name + " (no child process was asked for)"); } } }); };
    const m1 = mem(), c1 = await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-r8,rule-low06,START"], m1.io);
    ok("!! `fly` flies each flight once and APPENDS one JSON line a finished flight (exit 0), and says how to read the file once", c1 === 0 && J(m1.flown) === J(["rule-r8", "rule-low06", "START"]) && m1.files["a.jsonl"].trim().split("\n").length === 3 && m1.out.some((l) => /3 flights, 0 already in a.jsonl, 3 to fly; 1 worker\(s\); seeds 17001-17300 of far,both/.test(l)) && m1.out.some((l) => /read them ONCE with: report --in a.jsonl/.test(l)));
    const c2 = await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-r8,rule-low06,twin-standard,START"], m1.io);
    ok("!! `fly` RESUMES: a flight already in the file is not flown again (only twin-standard is), and the file grows by that one line", c2 === 0 && J(m1.flown) === J(["rule-r8", "rule-low06", "START", "twin-standard"]) && m1.files["a.jsonl"].trim().split("\n").length === 4 && m1.out.some((l) => /4 flights, 3 already in a.jsonl, 1 to fly/.test(l)));
    const m2 = mem({ "a.jsonl": J(fake("rule-r8", { range: { from: 1, to: 4 }, kinds: ["far", "both"], seconds: null })) + "\n" }), c3 = await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-low06"], m2.io);
    ok("!! a file of ANOTHER RANGE is not mixed with this run (refused, exit 1, nothing flown, nothing appended); nor another set of kinds, nor another dive length; START is held to the dive length only", c3 === 1 && m2.flown.length === 0 && /another range, kinds or dive length \(rule-r8\)/.test(m2.err[0]) && m2.files["a.jsonl"].trim().split("\n").length === 1);
    const m3 = mem({ "a.jsonl": J(fake("rule-r8", { range: { from: 17001, to: 17300 }, kinds: ["both", "far"], seconds: null })) + "\n" }), m4 = mem({ "a.jsonl": J(fake("rule-r8", { range: { from: 17001, to: 17300 }, kinds: ["far", "both"], seconds: 120 })) + "\n" }), m5 = mem({ "a.jsonl": J(fake("START", { seconds: null })) + "\n" }), m6 = mem({ "a.jsonl": J(fake("START", { seconds: 120 })) + "\n" });
    ok("!! kinds in another order refuse, a different dive length refuses, a START of the same dive length is kept (range-free), a START of another dive length refuses", await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-low06"], m3.io) === 1 && await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-low06"], m4.io) === 1 && await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-low06", "--from", "1", "--to", "3"], m5.io) === 0 && await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-low06", "--from", "1", "--to", "3"], m6.io) === 1);
    const m7 = mem(); m7.io.flyer = (arm) => { if (arm === "rule-low06") throw new Error("boom"); return fake(arm, { range: X.RANGE, kinds: X.KINDS, seconds: null }); };
    const c4 = await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-r8,rule-low06,twin-standard"], m7.io);
    ok("!! a failing flight stops the run with exit 1 and a message that names the error and says to run the same command again; the flights finished before it are in the file", c4 === 1 && /boom.*run the same command again to resume/.test(m7.err[0]) && m7.files["a.jsonl"].trim().split("\n").length === 1);
    const m8 = mem(), spawned = []; m8.io.spawner = async (name) => { spawned.push(name); return fake(name, { range: X.RANGE, kinds: X.KINDS, seconds: null }); };
    const c5 = await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-r8,rule-low06,twin-standard", "--workers", "2", "--from", "1", "--to", "1", "--kinds", "far", "--seconds", "60"], m8.io);
    ok("!! with --workers above 1 each flight goes to the spawner (a child process), not to the in-process flyer; all are appended", c5 === 0 && spawned.length === 3 && m8.flown.length === 0 && m8.files["a.jsonl"].trim().split("\n").length === 3);
    const m9 = mem(), c6 = await X.command(["fly", "--one", "circuit-cx", "--from", "1", "--to", "2"], m9.io);
    ok("!! `--one` flies one arm and prints ONE line, 'RESULT <json>', and writes no file", c6 === 0 && m9.out.length === 1 && /^RESULT \{/.test(m9.out[0]) && JSON.parse(m9.out[0].slice(7)).arm === "circuit-cx" && Object.keys(m9.files).length === 0);
    const m10 = mem(); m10.io.flyer = () => { throw new Error("no dice"); }; const c7 = await X.command(["fly", "--one", "rule-r8"], m10.io);
    ok("!! `--one` that fails says so on the error stream (exit 1) and prints no RESULT", c7 === 1 && m10.err.some((l) => /no dice/.test(l)) && !m10.out.some((l) => /^RESULT/.test(l)));
    const mq = mem(); await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-r8", "--quiet"], mq.io);
    ok("!! --quiet silences the progress lines", mq.out.length === 0 && mq.files["a.jsonl"].trim().split("\n").length === 1);
    const tr = trainingOf(), au = auditOf(tr), file = [au.start, ...X.ARM_IDS.map((a) => au.arms[a])].map((r) => J(r)).join("\n") + "\n", trFile = tr.map((r) => J(r)).join("\n") + "\n";
    const r1 = mem({ "au.jsonl": file, [X.TRAINING_FILE]: trFile }), cr1 = await X.command(["report", "--in", "au.jsonl"], r1.io);
    ok("!! `report` reads the audit file and the training file (the default name) and prints the report; exit 0", cr1 === 0 && r1.out.length > 15 && /^THE DECISION CIRCUIT AGAINST THE TWIN/.test(r1.out[0]) && /^BOTTOM LINE: /.test(r1.out[r1.out.length - 1]));
    const r2 = mem({ "au.jsonl": file }), cr2 = await X.command(["report", "--in", "au.jsonl"], r2.io), r3 = mem({ "au.jsonl": "", [X.TRAINING_FILE]: trFile }), cr3 = await X.command(["report", "--in", "au.jsonl"], r3.io), r4 = mem({ "au.jsonl": "{x}\n", [X.TRAINING_FILE]: trFile }), cr4 = await X.command(["report", "--in", "au.jsonl"], r4.io), r5 = mem({ "au.jsonl": file + file.split("\n")[1] + "\n", [X.TRAINING_FILE]: trFile }), cr5 = await X.command(["report", "--in", "au.jsonl"], r5.io), r6 = mem({ "au.jsonl": file, [X.TRAINING_FILE]: "{y}\n" }), cr6 = await X.command(["report", "--in", "au.jsonl"], r6.io);
    ok("!! `report` refuses (exit 1, by name) a missing training file, an empty audit file, an audit file that is not JSON, one with an arm twice (read once) and a training file that is not JSON; a bad argument is exit 2", cr2 === 1 && /ENOENT/.test(r2.err[0]) && cr3 === 1 && /no records/.test(r3.err[0]) && cr4 === 1 && /line 1 is not JSON/.test(r4.err[0]) && cr5 === 1 && /twice/.test(r5.err[0]) && cr6 === 1 && /line 1 is not JSON/.test(r6.err[0]) && await X.command(["go"], mem().io) === 2);
    const bm = mem(); await X.command(["go"], bm.io);
    ok("!! a bad argument says so on the error stream, naming takeDecisionCircuit", bm.err.length === 1 && /^takeDecisionCircuit: the first word must be fly or report/.test(bm.err[0]));
    // a real file by absolute path, the default file handling
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tkdc-")), fa = path.join(dir, "a.jsonl"), ft = path.join(dir, "t.jsonl"), outL = [], errL = [], flown = [];
    fs.writeFileSync(ft, trFile);
    const real = { out: (m) => outL.push(m), err: (m) => errL.push(m), flyer: (arm, op) => { flown.push(arm); return fake(arm, op); }, spawner: async (name) => { throw new Error("THE SPAWNER WAS USED for " + name); } };
    const k1 = await X.command(["fly", "--out", fa, "--arms", "rule-r8,rule-low06", "--training", ft], real), k2 = await X.command(["fly", "--out", fa, "--arms", "rule-r8,rule-low06,START", "--training", ft], real);
    ok("!! on a REAL file (an absolute path, the default readFile / appendFile / exists): the first run writes two lines and the second flies only START; the file ends with three lines", k1 === 0 && k2 === 0 && J(flown) === J(["rule-r8", "rule-low06", "START"]) && fs.readFileSync(fa, "utf8").trim().split("\n").length === 3 && errL.length === 0);
    fs.rmSync(dir, { recursive: true, force: true });
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "tkdc-child-")), mkScript = (n, body) => { const p = path.join(dir2, n); fs.writeFileSync(p, body); return p; };
    const echo = mkScript("echo.mjs", 'console.log("noise"); console.log("RESULT " + JSON.stringify({ argv: process.argv.slice(2) }));'), none = mkScript("none.mjs", 'console.log("nothing");'), junk = mkScript("junk.mjs", 'console.log("RESULT {nope");');
    const o = { training: "t.jsonl", range: { from: 17001, to: 17300 }, kinds: ["far", "both"], seconds: null }, c1r = await X.runChild("twin-standard", o, echo), c2r = await X.runChild("START", { ...o, range: { from: 1, to: 2 }, kinds: ["far"], seconds: 120 }, echo);
    ok("!! runChild starts `fly --one <arm>` with the training file, the range, the kinds and (only when set) the dive length, and returns the RESULT line's JSON past other output", J(c1r.argv) === J(["fly", "--one", "twin-standard", "--training", "t.jsonl", "--from", "17001", "--to", "17300", "--kinds", "far,both"]) && J(c2r.argv) === J(["fly", "--one", "START", "--training", "t.jsonl", "--from", "1", "--to", "2", "--kinds", "far", "--seconds", "120"]));
    let e1 = "", e2 = ""; try { await X.runChild("rule-r8", o, none); } catch (x) { e1 = x.message; } try { await X.runChild("rule-r8", o, junk); } catch (x) { e2 = x.message; }
    ok("!! a child with no RESULT line is refused by name, and so is one whose RESULT is not JSON", /child for rule-r8 ended with 0 and no RESULT/.test(e1) && /child for rule-r8 printed a RESULT that is not JSON/.test(e2));
    fs.rmSync(dir2, { recursive: true, force: true });
    // ---- the words of the refusals, exactly
    const mg = (f) => { try { f(); return null; } catch (e) { return e.message; } };
    ok("!! the refusals of parseArgs say exactly what is wrong: the unknown option with the options known for that command, the missing value, the stray word, the number that is not one, the missing --out and --in, the range, the kinds, the dive length and the workers", mg(() => X.parseArgs(["fly", "--nope"])) === 'unknown option "--nope" (known for fly: --arms, --training, --out, --from, --to, --kinds, --seconds, --workers, --one, --quiet)' && mg(() => X.parseArgs(["report", "--nope"])) === 'unknown option "--nope" (known for report: --in, --training)' && mg(() => X.parseArgs(["fly", "--out"])) === "--out needs a value" && mg(() => X.parseArgs(["fly", "x"])) === 'unexpected argument "x"' && mg(() => X.parseArgs(["fly", "--out", "f", "--from", "x"])) === '--from needs a number, got "x"' && mg(() => X.parseArgs(["go"])) === 'the first word must be fly or report, got "go"' && mg(() => X.parseArgs(["fly"])) === "fly needs --out <audit file>" && mg(() => X.parseArgs(["report"])) === "report needs --in <audit file>" && mg(() => X.parseArgs(["fly", "--out", "f", "--from", "5", "--to", "4"])) === "--from and --to must be whole numbers with 1 <= from <= to, got 5 and 4" && mg(() => X.parseArgs(["fly", "--out", "f", "--kinds", "far,sea"])) === 'unknown kind "sea" (plain, deep, far, both)' && mg(() => X.parseArgs(["fly", "--out", "f", "--kinds", "far,far"])) === "a kind is named twice" && mg(() => X.parseArgs(["fly", "--out", "f", "--seconds", "0"])) === "--seconds must be above 0, got 0" && mg(() => X.parseArgs(["fly", "--out", "f", "--workers", "0"])) === "--workers must be a whole number of 1 or more, got 0" && mg(() => X.parseArgs(["fly", "--one", "all"])) === "--one takes a single arm");
    ok("!! the refusals of parseFlights say exactly what is wrong", mg(() => X.parseFlights("rule-r8,,START")) === 'takeDecisionCircuit.parseFlights: an empty name in "rule-r8,,START"' && mg(() => X.parseFlights("twin-low06")) === 'takeDecisionCircuit.parseFlights: unknown arm "twin-low06" (rule-r8, rule-low06, twin-standard, circuit-cx, circuit-nostate, circuit-plain, START)' && mg(() => X.parseFlights("START,START")) === "takeDecisionCircuit.parseFlights: START is named twice");
    ok("!! the edges of the numbers: a block of ONE seed (from 5, to 5) is allowed, so is a dive of half a second, so is seed 1; seed 0 is not", X.parseArgs(["fly", "--out", "f", "--from", "5", "--to", "5"]).range.to === 5 && X.parseArgs(["fly", "--out", "f", "--seconds", "0.5"]).seconds === 0.5 && X.parseArgs(["fly", "--out", "f", "--from", "1", "--to", "1"]).range.from === 1 && mg(() => X.parseArgs(["fly", "--out", "f", "--from", "0", "--to", "1"])) !== null);
    // the log lines
    const ml = mem(); await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-r8"], ml.io);
    ok("!! the progress lines read word for word: the plan, the flight done, the instruction to read the file ONCE", J(ml.out) === J(["[takeDecisionCircuit] 1 flights, 0 already in a.jsonl, 1 to fly; 1 worker(s); seeds 17001-17300 of far,both", "[takeDecisionCircuit] rule-r8 done", "[takeDecisionCircuit] all flights are in a.jsonl; read them ONCE with: report --in a.jsonl"]), ml.out.join(" / "));
    // the file handling of a run and of a report
    const mbd = mem({ "a.jsonl": "{nope}\n" }), cbd = await X.command(["fly", "--out", "a.jsonl", "--arms", "rule-r8"], mbd.io);
    ok("!! `fly` on a results file that is not JSON stops with exit 1 and names the line, flying nothing: 'takeDecisionCircuit: results file line 1 is not JSON'", cbd === 1 && mbd.flown.length === 0 && mbd.err.length === 1 && mbd.err[0] === "takeDecisionCircuit: results file line 1 is not JSON");
    const tr2 = trainingOf(), au2 = auditOf(tr2), trF = tr2.map((r) => J(r)).join("\n") + "\n";
    const armsOnly = mem({ "au.jsonl": X.ARM_IDS.map((a) => J(au2.arms[a])).join("\n") + "\n", [X.TRAINING_FILE]: trF }), startOnly = mem({ "au.jsonl": J(au2.start) + "\n", [X.TRAINING_FILE]: trF });
    const ca = await X.command(["report", "--in", "au.jsonl"], armsOnly.io), cs = await X.command(["report", "--in", "au.jsonl"], startOnly.io);
    ok("!! `report` refuses a file with NOTHING in it, but reads a file with arms and no START (the START check then fails by name) and a file with START and no arms (the KEYS check then fails by name)", ca === 0 && /^CHECK FAILED -- START:/.test(armsOnly.out[0]) && cs === 0 && /^CHECK FAILED -- KEYS:/.test(startOnly.out[0]));
    // the DEFAULT flyer (no stub): one real dive of the rule, and the START rows, at a throwaway length
    const rl1 = mem(); delete rl1.io.flyer; const dfl1 = await X.command(["fly", "--one", "rule-r8", "--from", "1", "--to", "1", "--kinds", "far", "--seconds", "60"], rl1.io);
    const rrec = dfl1 === 0 && rl1.out.length === 1 ? JSON.parse(rl1.out[0].slice(7)) : null;
    const rl2 = mem(); delete rl2.io.flyer; const dfl2 = await X.command(["fly", "--one", "START", "--seconds", "60"], rl2.io);
    const rst2 = dfl2 === 0 && rl2.out.length === 1 ? JSON.parse(rl2.out[0].slice(7)) : null;
    ok("!! the default flyer flies for real: `--one rule-r8` on one far dive at 60 s gives a rule-r8 record keyed far:1 with the range, the kinds and the dive length recorded; `--one START` gives the 24 start rows at the same dive length", !!rrec && rrec.arm === "rule-r8" && rrec.runs.length === 1 && rrec.runs[0].key === "far:1" && J(rrec.range) === J({ from: 1, to: 1 }) && J(rrec.kinds) === J(["far"]) && rrec.seconds === 60 && !!rst2 && rst2.arm === "START" && rst2.rows.length === 24 && rst2.seconds === 60);
    const rl3 = mem({ [X.TRAINING_FILE]: trF }); delete rl3.io.flyer; const dfl3 = await X.command(["fly", "--one", "circuit-cx", "--from", "1", "--to", "1", "--kinds", "far", "--seconds", "60"], rl3.io), rec3 = dfl3 === 0 ? JSON.parse(rl3.out[0].slice(7)) : null;
    ok("!! the default flyer reads the TRAINING FILE it is given (here: the synthetic one) and flies circuit-cx from the champion it names: the record names k 1 and the digest of that champion's weights", !!rec3 && rec3.champion.k === 1 && rec3.champion.asRule === false && rec3.champion.digest === X.digestOf(D.championOf(tr2, "cx").record.weights));
}

sec("9. REAL DIVES (a few, at a shortened length where it helps)");
{
    const R = { from: 1, to: 2 }, K = ["far"], rule = T.flyDecision(U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)), want = T.evaluate(rule, T.setOf(K, 1, 2), { gauge: T.GAUGE });
    const rl = X.flyArm("rule-low06", [], { range: R, kinds: K });
    ok("!! the rule arm flown through the switchboard IS the task's own: keys far:1 and far:2, scores and bad flags equal to T.evaluate of the same pilot, the range and kinds recorded, no champion on a rule arm", J(rl.runs.map((r) => r.key)) === J(["far:1", "far:2"]) && rl.runs.every((r, i) => r.score === want.runs[i].score && r.bad === !!(want.runs[i].crushed || want.runs[i].stranded)) && J(rl.range) === J(R) && J(rl.kinds) === J(K) && rl.seconds === null && rl.champion === undefined && rl.arm === "rule-low06");
    const r8 = X.flyArm("rule-r8", [], { range: R, kinds: K }), cut = X.flyArm("rule-low06", [], { range: R, kinds: K, seconds: 60 });
    ok("!! rule-r8 is another rule (a different arm from rule-low06 on at least one of a larger set is not required here, but it is flown under its own name), and a cut dive length is passed to the dive (60 s: a shorter dive than the full one, recorded as 60)", r8.arm === "rule-r8" && r8.runs.length === 2 && cut.seconds === 60 && cut.runs.some((r, i) => r.score !== rl.runs[i].score));
    const tw = X.flyArm("twin-standard", [], { range: { from: 1, to: 1 }, kinds: K, seconds: 120 });
    ok("!! the twin arm is flown (one dive, 120 s): one run keyed far:1 with a score in [0, 1] and no champion", tw.runs.length === 1 && tw.runs[0].key === "far:1" && tw.runs[0].score >= 0 && tw.runs[0].score <= 1 && tw.champion === undefined);
    const cxPol = D.familyPolicy("cx"), hand = Array.from(cxPol.handWeights()), none = trainingOf({ none: ["cx", "nostate", "plain"] });
    const cn = X.flyArm("circuit-cx", none, { range: R, kinds: K });
    ok("!! a circuit arm with NO eligible champion is flown as the untrained circuit: its scores equal rule-low06's, and the record says asRule, no k, no seed, the digest of the hand weights", cn.runs.every((r, i) => r.score === rl.runs[i].score) && cn.champion.asRule === true && cn.champion.k === null && cn.champion.seed === null && cn.champion.digest === X.digestOf(hand) && cn.champion.family === "cx");
    const tr = trainingOf(), champ = D.championOf(tr, "cx").record, w = Array.from(cxPol.handWeights()); w[cxPol.offsets.B2 + 0] = 1;   // a champion whose readout pushes o0 to +1: it surfaces early
    const trC = tr.map((r) => (r.family === "cx" && r.index === champ.index ? { ...r, weights: w } : r)), cc = X.flyArm("circuit-cx", trC, { range: R, kinds: K });
    ok("!! a circuit arm WITH a champion is flown from the champion's weights (not the untrained circuit): the scores differ from the rule's on a dive, and the record names the family, k, seed and the digest of the weights flown", cc.runs.some((r, i) => r.score !== rl.runs[i].score) && cc.champion.asRule === false && cc.champion.k === champ.index && cc.champion.seed === champ.seed && cc.champion.digest === X.digestOf(w) && cc.champion.family === "cx");
    const pn = X.flyArm("circuit-plain", none, { range: R, kinds: K }), ns = X.flyArm("circuit-nostate", none, { range: R, kinds: K });
    ok("!! the nostate and plain arms with no champion are the rule too, and each record names its own family and weight vector (plain's digest is of 2,443 weights, not 2,452)", pn.runs.every((r, i) => r.score === rl.runs[i].score) && ns.runs.every((r, i) => r.score === rl.runs[i].score) && pn.champion.family === "plain" && ns.champion.family === "nostate" && pn.champion.digest === X.digestOf(D.familyPolicy("plain").handWeights()) && pn.champion.digest !== ns.champion.digest);
    ok("!! an unknown arm and a non-circuit arm asked of circuitArm are refused by name", throwsWith(() => X.flyArm("twin-low06", [], { range: R, kinds: K }), /unknown arm "twin-low06"/) && throwsWith(() => X.circuitArm("rule-r8", []), /not a circuit arm/));
    const bad = (() => { const t = trainingOf().map((r) => (r.family === "plain" && r.index === 0 ? { ...r, weights: [0.1], weightCount: 1 } : r)); try { X.circuitArm("circuit-plain", t); return ""; } catch (e) { return e.message; } })();
    ok("!! a champion whose weights do not fit the policy is refused by name (1 weight against 2,443)", /circuit-plain has 1 champion weights and its policy takes 2443/.test(bad));
    const st = X.startRows(120);
    ok("!! the START rows: 24 dives (the four kinds at seeds 501-506, kind-major), each with the rule's and the three untrained circuits' score and fingerprint, ALL EQUAL (the untrained circuit is the rule), and the dive length is recorded", st.arm === "START" && st.rows.length === 24 && st.rows[0].key === "plain:501" && st.rows[23].key === "both:506" && st.seconds === 120 && st.rows.every((r) => D.FAMILIES.every((f) => r[f].score === r.rule.score && r[f].fingerprint === r.rule.fingerprint) && typeof r.rule.fingerprint === "string"));
    ok("!! the START rows pass the START check and the rule's fingerprints are not all the same (the 24 dives are different dives)", X.checksOf({ arms: {}, start: st }, trainingOf()).find((c) => c.name === "START").ok && new Set(st.rows.map((r) => r.rule.fingerprint)).size > 12);
    const board = X.boardOf(tr);
    ok("!! the board has the survey task and the six arms with the control relation: the circuits' control is rule-low06, the twin's control is rule-low06", board.tasks.has("survey") && X.ARM_IDS.every((a) => board.arms.has(a)) && board.arms.get("circuit-cx").controls[0] === "rule-low06" && board.arms.get("twin-standard").controls[0] === "rule-low06" && board.arms.size === 6);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
