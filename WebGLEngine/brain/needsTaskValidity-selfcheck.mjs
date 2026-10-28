// WebGLEngine/brain/needsTaskValidity-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/needsTaskValidity-selfcheck.mjs      (~9.5s -- measured 9.2-9.8 s alone at v4905)
//
// THE SECOND HALF OF THE SURVEY RUN'S VALIDITY (brain/needsTask.mjs; the rows were written first, in brain/NEEDS_AND_LIMITS.md "Round 2", and revised in the open there). Kinds `far` and `both`, five rule pilots, eight seeds each (501-508).
//   1  V4 FAR      the charge is a need: DIRECT (no trip) ends stranded or crushed in at least 3 of 8; TRIP and GUARDED (the trip) in none; GUARDED beats HULLONLY (the same hull rule WITHOUT the trip) by more than max(0.03, 2 se)
//   2  V5 BOTH     weighing the two needs beats either alone: GUARDED beats HULLONLY, TRIP and DIRECT each by more than max(0.03, 2 se), and is crushed in none
//   3  V6 ROOM     no baseline's mean reaches 0.95 on far or on both, and GUARDED's mean on both is under 0.9 (something is left for a better pilot to win)
//   4  V8 WORTH    the job is worth doing: GUARDED beats the safe harbour (SPIN, 0.55 everywhere) on far and on both by more than max(0.03, 2 se)
// WHAT THESE ROWS ARE NOT: evidence that the task generalises. The scenario ranges and the baselines were adjusted over five runs of seeds 501-508 until these held (NEEDS_AND_LIMITS.md has each change and its reason); the TRAIN, HELD_OUT and AUDIT sets have
// not been read by anything, and piece 4's pilots will be scored on the audit set against GUARDED under the verdict rule registered there.
// THE READINGS AT v4905 (BASELINE_SET kinds far / both, means; crushed + stranded counts of 8): far -- SPIN 0.550, DIRECT 0.556 (1+5), TRIP 0.663 (0+0), HULLONLY 0.556 (1+5), GUARDED 0.850 (0+0); both -- SPIN 0.550, DIRECT 0.000 (8+0), TRIP 0.000 (8+0),
// HULLONLY 0.354 (5+0), GUARDED 0.813 (0+0). THE FIRST DRAFT'S READINGS, kept beside them: the scoring was 0.7 / 0.2 / 0.1 and a stranded boat scored 0.605 against the trip's 0.578; with 0.45 / 0.45 / 0.1 it scores 0.368 against 0.625.
//
// SABOTAGE LOG: the mutants of brain/needsTask-selfcheck.mjs's header were run against BOTH gates; the second gate's reds are the second number there (it catches the trip, the pump, the rise, the stranded flag, the capture and the visited weight, which the first gate's smaller kinds cannot see).
"use strict";
import * as T from "./needsTask.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const se2 = (p) => Math.max(0.03, 2 * p.se), fmt = (p) => `${p.diff.toFixed(3)} against ${se2(p).toFixed(3)} (se ${p.se.toFixed(3)})`;
const far = T.setOf(["far"], 501, 508), both = T.setOf(["both"], 501, 508), R = {};
for (const n of Object.keys(T.PILOTS)) R[n] = { far: T.evaluate(T.PILOTS[n], far), both: T.evaluate(T.PILOTS[n], both) };
const lost = (e) => e.runs.filter((r) => r.crushed || r.stranded).length, mean = (e) => e.score.toFixed(3);
console.log("needsTaskValidity-selfcheck -- the survey run's task validity, kinds far and both\n");

console.log("1. V4 -- FAR: the charge is a need");
{
    ok("!! DIRECT (no refill trip) ends stranded or crushed in at least 3 of the 8 far runs", lost(R.DIRECT.far) >= 3, `${lost(R.DIRECT.far)} of 8, mean ${mean(R.DIRECT.far)}`);
    ok("!! TRIP and GUARDED (the refill trip) end stranded or crushed in none of the far runs", lost(R.TRIP.far) === 0 && lost(R.GUARDED.far) === 0, `TRIP ${lost(R.TRIP.far)}, GUARDED ${lost(R.GUARDED.far)}`);
    const p = T.paired(R.GUARDED.far, R.HULLONLY.far);
    ok("!! GUARDED beats HULLONLY (the same hull rule without the trip) by more than max(0.03, 2 se): the trip is what pays on this kind", p.diff > se2(p), fmt(p));
}

console.log("\n2. V5 -- BOTH: weighing the two needs beats either alone");
{
    const rows = [["HULLONLY", "the hull rule without the trip"], ["TRIP", "the trip without the hull rule"], ["DIRECT", "neither"]];
    for (const [n, what] of rows) { const p = T.paired(R.GUARDED.both, R[n].both); ok(`!! GUARDED beats ${n} (${what}) by more than max(0.03, 2 se)`, p.diff > se2(p), fmt(p)); }
    ok("!! GUARDED is crushed in none of the both runs and none stranded", R.GUARDED.both.crashed === 0 && R.GUARDED.both.stranded === 0, `mean ${mean(R.GUARDED.both)}`);
}

console.log("\n3. V6 -- ROOM: something is left for a better pilot to win");
{
    const worst = Object.entries(R).map(([n, r]) => [n, Math.max(r.far.score, r.both.score)]).sort((a, b) => b[1] - a[1])[0];
    ok("!! no baseline's mean reaches 0.95 on far or on both", worst[1] < 0.95, `highest: ${worst[0]} ${worst[1].toFixed(3)}`);
    ok("!! GUARDED's mean on both is under 0.9", R.GUARDED.both.score < 0.9, mean(R.GUARDED.both));
}

console.log("\n4. V8 -- WORTH: doing the job beats staying home");
{
    for (const k of ["far", "both"]) { const p = T.paired(R.GUARDED[k], R.SPIN[k]); ok(`!! on ${k} GUARDED beats the safe harbour (SPIN) by more than max(0.03, 2 se)`, p.diff > se2(p), fmt(p)); }
    ok("!! the safe harbour scores 0.55 on both far and both and never crashes", ["far", "both"].every((k) => R.SPIN[k].runs.every((r) => Math.abs(r.score - 0.55) < 0.011 && !r.crushed)), `${mean(R.SPIN.far)} / ${mean(R.SPIN.both)}`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
