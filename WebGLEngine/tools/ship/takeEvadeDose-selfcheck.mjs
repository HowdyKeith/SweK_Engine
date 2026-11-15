// WebGLEngine/tools/ship/takeEvadeDose-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeEvadeDose-selfcheck.mjs      (about 25 s: ONE flight of the 20 arms and 17 steps on the smoke geometries 1 to 4, kept and reused -- NEVER the DEV set 102001 to 102024 or the HELD set 103001 to 103024: every flight goes through a guard that refuses any name but `smoke`)
//
// THE GATE OF tools/ship/takeEvadeDose.mjs (the registration is brain/SUB_EVADE_DOSE_WIP.md and its Amendment A):
//   1 CONSTANTS   the files, the sets (smoke 1, DEV 102001, HELD 103001), the six doses, the three curves, the ceiling, the donors, the bars (z 2, edge 0.05 = DECISIVE); everything frozen
//   2 THE ARMS    armsOf and stepsOf on made-up thetas to the number (each curve changes exactly the numbers it names; the inputs are untouched; 20 arms and 17 steps in order), and on the real runs (every theta one clampTheta leaves unchanged; the ceiling arms are the evade-turn command's)
//   3 THE RULES   stepLabel at its edges (z 2 AND edge 0.05, in both directions), thresholdName, slopeOf, rulesOf on made-up patterns (thresholds, monotone and a reversal, saturation in its three cases, R0, B minus A, the slope, the forecast quantities), the report to the character
//   4 THE CHECKS  each check that voids the read alone, then all of them in order
//   5 THE COMMAND the smoke report to the byte; the flight (20 + 17 rows in order, identity and equal exactly 0); every refusal by name with nothing flown; dev --write and held through the guard; HELD refused after a smoke DEV, a DEV that did not replicate, a missing DEV; the set each mode flies; a failed check exits 1 and is still recorded; the program run
//   6 THE SOURCE  no clock, no random number; the headers; ASCII; the registration names the sets, the arms and the amendment
// NOT CHECKED, said plainly: the readings on DEV and HELD (that is the read of brain/SUB_EVADE_DOSE_WIP.md, flown by the command, not here).
//
// SABOTAGES: written after the gate; the log is added below when the pass is done.
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./takeEvadeDose.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns } from "./takeSubLeague.mjs";
import { armsOf as turnArmsOf } from "./takeEvadeTurn.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const J = JSON.stringify;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const R = new URL("../../", import.meta.url), real = (f) => (fs.existsSync(new URL(f, R)) ? JSON.parse(fs.readFileSync(new URL(f, R), "utf8")) : null);
const rd = (dev) => (f) => (f === X.DEV_FILE ? dev : real(f));   // the files from disk (the twelve runs and the search-ping theta), DEV_FILE from `dev`
// the ONLY flying the gate does: the smoke geometries, once, kept and reused
let kept = null;
const guarded = (arms, steps, G, name, opts) => { if (name !== "smoke") throw new Error("the gate must not fly " + name); return (kept = kept || X.fly(arms, steps, G, name, opts)); };
const noFly = () => { throw new Error("must not fly"); };
const clone = (o) => JSON.parse(J(o));
const th = (o) => ({ ...TA.THETA_DEFAULT, ...o });

console.log("1. CONSTANTS");
{
    ok("!! the files, the sets (smoke 1 for 4, DEV 102001 for 24, HELD 103001 for 24), the six doses, the three curves, the ceiling 2.8, the donors (B1 league7001, B2 league7103), the bars (z 2, edge 0.05); all frozen", X.DEV_FILE === "brain/subEvadeDoseDev.json" && X.HELD_FILE === "brain/subEvadeDoseHeld.json" && J(X.SETS) === '{"smoke":{"first":1,"count":4},"dev":{"first":102001,"count":24},"held":{"first":103001,"count":24}}' && J(X.DOSES) === "[1.9,2.1,2.3,2.5,2.65,2.8]" && J(X.CURVES) === '["A","B1","B2"]' && X.CEILING === 2.8 && J(X.DONORS) === '{"B1":"league7001","B2":"league7103"}' && X.MIN_Z === 2 && X.MIN_EDGE === 0.05 && [X.SETS, X.SETS.smoke, X.SETS.dev, X.SETS.held, X.DOSES, X.CURVES, X.DONORS].every(Object.isFrozen));
}

console.log("\n2. THE ARMS");
const G = th({ searchSpeed: 1, trackSpeed: 2, evadeSpeed: 3, fireRange: 100, aimTol: 0.1, pingAfter: 2, echoWindow: 5, evadeTime: 10, evadeTurn: 1.5, blindSnr: 50, pingEvery: 8, searchPing: 3 });
const FA = th({ searchSpeed: 4, trackSpeed: 4.4, evadeSpeed: 4.5, fireRange: 400, aimTol: 0.5, pingAfter: 5, echoWindow: 15, evadeTime: 30, evadeTurn: 2.8, blindSnr: 90, pingEvery: 30, searchPing: 0 }), FB = th({ evadeSpeed: 3.6, evadeTime: 28, evadeTurn: 2.8, searchPing: 7 });
const fin = [{ id: "league7001", final: FA }, { id: "league7103", final: FB }];
const IDS = ["A@1.90", "A@2.10", "A@2.30", "A@2.50", "A@2.65", "A@2.80"].concat(["B1", "B2"].flatMap((c) => ["1.50", "1.90", "2.10", "2.30", "2.50", "2.65", "2.80"].map((d) => `${c}@${d}`)));
{
    const G0 = J(G), A0 = J(FA), B0 = J(FB), arms = X.armsOf(G, fin);
    ok("!! armsOf: twenty arms in order (curve A at the six doses, then B1 and B2 at G's own turn and the six doses), the ids CURVE@dose to two decimals, each arm's curve and dose named", arms.length === 20 && J(arms.map((a) => a.id)) === J(IDS) && arms.every((a) => a.kind === "arm" && a.id === `${a.curve}@${a.dose.toFixed(2)}`) && J(arms.slice(0, 6).map((a) => a.dose)) === "[1.9,2.1,2.3,2.5,2.65,2.8]" && arms[6].dose === 1.5 && arms[13].dose === 1.5 && J(arms.slice(6, 13).map((a) => a.curve)) === J(Array(7).fill("B1")) && J(arms.slice(13).map((a) => a.curve)) === J(Array(7).fill("B2")));
    const want = (curve, d) => Object.fromEntries(TA.THETA_NAMES.map((k) => [k, k === "evadeTurn" ? d : curve === "A" ? G[k] : (k === "evadeSpeed" || k === "evadeTime") ? (curve === "B1" ? FA : FB)[k] : G[k]]));
    ok("!! each arm's theta to the number: A is G with evadeTurn = the dose; B1 is G with league7001's evadeSpeed and evadeTime and evadeTurn = the dose (G's own 1.5 first); B2 the same with league7103's; nothing else moves", arms.every((a) => J(a.theta) === J(want(a.curve, a.dose))));
    const diff = (x, y) => TA.THETA_NAMES.filter((k) => x[k] !== y[k]);
    ok("the arms differ from G in the numbers they name (A one; B at G's own turn two; B at a dose three), the inputs are untouched", J(diff(arms[0].theta, G)) === '["evadeTurn"]' && J(diff(arms[6].theta, G)) === '["evadeSpeed","evadeTime"]' && J(diff(arms[7].theta, G)) === '["evadeSpeed","evadeTime","evadeTurn"]' && J(G) === G0 && J(FA) === A0 && J(FB) === B0);
    const steps = X.stepsOf(arms);
    ok("!! stepsOf: seventeen steps in order (A: 5, B1: 6, B2: 6), each the higher dose's arm against the next dose down, the ids CURVE:hi>lo, the dose and the lower dose named, hi and lo the arms themselves", steps.length === 17 && J(steps.map((s) => s.id)) === J(["A:2.10>1.90", "A:2.30>2.10", "A:2.50>2.30", "A:2.65>2.50", "A:2.80>2.65"].concat(["B1", "B2"].flatMap((c) => ["1.90>1.50", "2.10>1.90", "2.30>2.10", "2.50>2.30", "2.65>2.50", "2.80>2.65"].map((d) => `${c}:${d}`)))) && steps.every((s) => s.dose > s.lowerDose && s.hi.dose === s.dose && s.lo.dose === s.lowerDose && s.hi.curve === s.curve && s.lo.curve === s.curve && arms.includes(s.hi) && arms.includes(s.lo)));
    ok("stepsOf does not depend on the order of the arms it is given (shuffled arms give the same steps)", J(X.stepsOf([...arms].reverse()).map((s) => s.id)) === J(X.stepsOf(arms).map((s) => s.id)));
}
{
    const loaded = loadRuns(), finders = ["league7001", "league7103"].map((id) => loaded.runs.find((r) => r.id === id)), G0 = loaded.runs[0].gen0, arms = X.armsOf(G0, finders), turn = turnArmsOf(G0, finders);
    ok("!! on the real runs: 20 arms, every theta one clampTheta leaves unchanged; the ceiling arms are the evade-turn command's: A@2.80 is GN:league7001, B1@2.80 is GT:league7001, B2@2.80 is GT:league7103 (the same theta to the number)", !loaded.error && arms.length === 20 && arms.every((a) => TA.THETA_NAMES.every((k) => TA.clampTheta(a.theta)[k] === a.theta[k])) && J(arms.find((a) => a.id === "A@2.80").theta) === J(turn.find((a) => a.id === "GN:league7001").theta) && J(arms.find((a) => a.id === "B1@2.80").theta) === J(turn.find((a) => a.id === "GT:league7001").theta) && J(arms.find((a) => a.id === "B2@2.80").theta) === J(turn.find((a) => a.id === "GT:league7103").theta));
}

console.log("\n3. THE RULES");
const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
{
    const L = X.stepLabel;
    ok("!! stepLabel: UP needs z of 2 AND an edge of 0.05 (z 2 with edge 0.05 is UP; edge 0.0499 is FLAT; z 1.99 is FLAT; z 12 on an edge of 0.007 is FLAT), DOWN the mirror image (z -2 with -0.05 is DOWN; -0.0499 is FLAT; z -1.99 is FLAT), and a z of 2 with a negative edge is FLAT", J([L(2, 0.05), L(2, 0.0499), L(1.99, 1), L(12, 0.007), L(-2, -0.05), L(-2, -0.0499), L(-1.99, -1), L(5, -1), L(-5, 1), L(0, 0)]) === J(["UP", "FLAT", "FLAT", "FLAT", "DOWN", "FLAT", "FLAT", "FLAT", "FLAT", "FLAT"]));
    ok("thresholdName: 1.9, 2.1 and G's own 1.7085 are LOW; 2.3 and 2.5 MID; 2.65 and 2.8 HIGH", J([1.7085, 1.9, 2.1, 2.3, 2.5, 2.65, 2.8].map(X.thresholdName)) === J(["LOW", "LOW", "LOW", "MID", "MID", "HIGH", "HIGH"]));
    ok("slopeOf: the least-squares slope (x 1, 2, 3 and y 2, 4, 6 is 2; y flat is 0; a falling line is negative; x 2.5, 2.65, 2.8 with y 1, 1.3, 1.4 is 1.3333)", Math.abs(X.slopeOf([1, 2, 3], [2, 4, 6]) - 2) < 1e-12 && X.slopeOf([1, 2, 3], [5, 5, 5]) === 0 && Math.abs(X.slopeOf([1, 2, 3], [6, 4, 2]) + 2) < 1e-12 && Math.abs(X.slopeOf([2.5, 2.65, 2.8], [1, 1.3, 1.4]) - 1.3333333333333333) < 1e-9);
}
const DOSEV = { A: [1.9, 2.1, 2.3, 2.5, 2.65, 2.8], B1: [1.5, 1.9, 2.1, 2.3, 2.5, 2.65, 2.8], B2: [1.5, 1.9, 2.1, 2.3, 2.5, 2.65, 2.8] };
const mk = (edges, stepEdges) => {
    const rows = [], steps = [];
    for (const c of X.CURVES) {
        DOSEV[c].forEach((d, i) => { const e = edges[c][i]; rows.push({ id: `${c}@${d.toFixed(2)}`, kind: "arm", finder: c, curve: c, dose: d, edge: e, se: 0.1, z: e / 0.1, winsX: 0, draws: 0, winsY: 0, finds: e >= 0.5 && e / 0.1 >= 2, seatA: 0, seatB: 0, flew: 8, seedsOk: true }); });
        for (let i = 1; i < DOSEV[c].length; i++) { const e = stepEdges[c][i - 1]; steps.push({ id: `${c}:${DOSEV[c][i].toFixed(2)}>${DOSEV[c][i - 1].toFixed(2)}`, kind: "step", finder: c, curve: c, dose: DOSEV[c][i], lowerDose: DOSEV[c][i - 1], edge: e, se: 0.1, z: e / 0.1, winsX: 0, draws: 0, winsY: 0, finds: false, seatA: 0, seatB: 0, flew: 8, seedsOk: true }); }
    }
    return { rows, steps };
};
const E0 = (n) => Array(n).fill(0);
{
    const p1 = mk({ A: [0.1, 0.2, 0.6, 1.0, 1.3, 1.4], B1: [0.3, 0.6, 1.0, 1.5, 2.0, 2.5, 2.9], B2: E0(7) }, { A: [0.1, 0.4, 0.4, 0.3, 0.1], B1: [0.3, 0.4, 0.5, 0.5, 0.5, 0.4], B2: E0(6) });
    const r1 = X.rulesOf(p1.rows, p1.steps), c1 = r1.curves;
    ok("!! rulesOf, a clean pattern: A finds first at 2.30 (MID; 0.2 at z 2 and 0.1 at z 1 do not), B1 first at 1.90 (its 1.50 arm at 0.3 does not find), B2 never (NONE); A's steps are FLAT (z 1), UP, UP, UP, FLAT so it saturates at 2.65 (the dose of its last UP step), every step is UP on B1 so its saturation is none, B2 has no UP step so it saturates at its lowest dose 1.5; all monotone; R0 holds", J(c1.A.threshold) === '{"dose":2.3,"name":"MID"}' && J(c1.B1.threshold) === '{"dose":1.9,"name":"LOW"}' && J(c1.B2.threshold) === '{"dose":null,"name":"NONE"}' && c1.A.saturation === 2.65 && c1.B1.saturation === null && c1.B2.saturation === 1.5 && J(X.CURVES.map((k) => [c1[k].monotone, c1[k].reversal])) === '[[true,null],[true,null],[true,null]]' && r1.replicates === true && J(c1.A.steps) === '["FLAT","UP","UP","UP","FLAT"]' && J(c1.B1.steps) === J(Array(6).fill("UP")));
    ok("!! B minus A at each of the six doses (B1: +0.5 +0.8 +0.9 +1.0 +1.2 +1.5; B2: minus A), A's slope over 2.5, 2.65, 2.8 is 1.3333, and the forecast quantities of the clean pattern: A threshold at most 2.5 yes, LOW no, monotone yes, all monotone yes, B1 below A yes, B1 above A from 2.1 yes, B2 within 0.5 of A no, A saturates below the ceiling yes", near(r1.diff.B1, [0.5, 0.8, 0.9, 1.0, 1.2, 1.5]) && near(r1.diff.B2, [-0.1, -0.2, -0.6, -1.0, -1.3, -1.4]) && Math.abs(r1.slopeTop - 1.3333333333333333) < 1e-9 && J(r1.forecast) === J({ aThresholdAtMost25: true, aThresholdLow: false, aMonotone: true, allMonotone: true, b1ThresholdLowerThanA: true, b1AboveAFrom21: true, b2WithinHalfOfA: false, aSaturatesBelowCeiling: true }));
    const p2 = mk({ A: [0.6, 0.9, 0.7, 1.0, 1.3, 1.4], B1: E0(7), B2: E0(7) }, { A: [0.3, -0.2, 0.3, 0.3, 0.1], B1: E0(6), B2: [0.0, 0.0, 0.0, -0.2, 0.0, 0.0] });
    const r2 = X.rulesOf(p2.rows, p2.steps), c2 = r2.curves;
    ok("!! a reversal: a DOWN step on A (the dose 2.30 is worse than 2.10 by 0.2 at z -2) names the dose 2.30 and fails MONOTONE for A; B2's DOWN step names 2.50; B1 is monotone; A's threshold is LOW (1.90 finds at 0.6), its steps are UP, DOWN, UP, UP, FLAT and it saturates at 2.65; the forecast quantities say A not monotone, all not monotone, A's threshold LOW", c2.A.monotone === false && c2.A.reversal === 2.3 && c2.B2.monotone === false && c2.B2.reversal === 2.5 && c2.B1.monotone === true && J(c2.A.threshold) === '{"dose":1.9,"name":"LOW"}' && J(c2.A.steps) === '["UP","DOWN","UP","UP","FLAT"]' && c2.A.saturation === 2.65 && r2.forecast.aMonotone === false && r2.forecast.allMonotone === false && r2.forecast.aThresholdLow === true);
    const z7 = E0(7), z6 = E0(6), z5 = E0(5);
    const p3 = mk({ A: [0, 0, 0, 0, 0, 0.6], B1: [0, 0, 0, 0, 0, 0, 0.7], B2: z7 }, { A: z5, B1: z6, B2: z6 }), r3 = X.rulesOf(p3.rows, p3.steps);
    const noA = mk({ A: E0(6), B1: [0, 0, 0, 0, 0, 0, 0.7], B2: z7 }, { A: z5, B1: z6, B2: z6 }), noB1 = mk({ A: [0, 0, 0, 0, 0, 0.6], B1: z7, B2: z7 }, { A: z5, B1: z6, B2: z6 });
    ok("!! R0 needs BOTH ceiling arms to find: A at 2.80 (0.6) and B1 at 2.80 (0.7) hold it; with A's ceiling arm below the bar, or B1's, it fails; a HIGH threshold (A first finds at 2.80); no step UP gives a saturation of the lowest dose", r3.replicates === true && r3.curves.A.threshold.name === "HIGH" && r3.curves.B1.threshold.dose === 2.8 && X.rulesOf(noA.rows, noA.steps).replicates === false && X.rulesOf(noB1.rows, noB1.steps).replicates === false && r3.curves.A.saturation === 1.9 && r3.curves.B1.saturation === 1.5);
    const p4 = mk({ A: E0(6), B1: [0.9, 1, 1, 1, 1, 1, 1], B2: z7 }, { A: z5, B1: z6, B2: z6 });
    ok("the threshold of a B curve counts the dose of G's own turn: B1's 1.50 arm finding (0.9) gives the threshold 1.5 (LOW)", J(X.rulesOf(p4.rows, p4.steps).curves.B1.threshold) === '{"dose":1.5,"name":"LOW"}');
    const lines = X.reportLines(p1.rows, p1.steps, r1, "dev");
    ok("!! the report on the clean pattern: 48 lines (a header, three curves of a heading, their arms and steps, R0 to R3, B minus A, the slope, the forecast quantities); the header, the first arm, the first step and the seven closing lines to the character", lines.length === 48 && lines[0] === "[takeEvadeDose] dev read: geometries 102001 to 102024, both seats (48 duels an arm); 20 arms against G, generation 0 (the search-ping champion), 17 steps (a dose against the next dose down); an arm FINDS at edge >= 0.5 and z >= 2, a step is UP at z >= 2 and edge >= 0.05, DOWN at z <= -2 and edge <= -0.05" && lines[1] === "  A  G with evadeTurn = the dose" && lines[2] === "    A@1.90    edge +0.100 +- 0.100 (z 1.0), 0-0-0  does not   seat A +0.000, seat B +0.000" && lines[8] === "    step 2.10 over 1.90   edge +0.100 +- 0.100 (z 1.0)  FLAT" && J(lines.slice(41)) === J(["  R0 REPLICATES: the ceiling arms of A and B1 find: yes", "  R1 THRESHOLD: A MID (2.30), B1 LOW (1.90), B2 NONE", "  R2 MONOTONE: A yes, B1 yes, B2 yes", "  R3 SATURATION: A 2.65, B1 none, B2 1.50", "  B MINUS A at each dose (1.90, 2.10, 2.30, 2.50, 2.65, 2.80): B1 +0.500 +0.800 +0.900 +1.000 +1.200 +1.500; B2 -0.100 -0.200 -0.600 -1.000 -1.300 -1.400", "  A SLOPE over the top three doses (2.50, 2.65, 2.80): +1.33 edge points a radian", "  FORECAST QUANTITIES: A threshold at most 2.5 yes, A threshold LOW no, A monotone yes, all monotone yes, B1 threshold below A's yes, B1 above A from 2.1 yes, B2 within 0.5 of A no, A saturates below the ceiling yes"]), lines.length + " " + lines[41]);
    const rp = X.reportLines(p2.rows, p2.steps, r2, "held"), p0 = mk({ A: E0(6), B1: z7, B2: z7 }, { A: z5, B1: z6, B2: z6 }), l0 = X.reportLines(p0.rows, p0.steps, X.rulesOf(p0.rows, p0.steps), "dev");
    ok("a reversal prints `no (reversal at 2.30)`, a failed R0 prints NO, the HELD header says geometries 103001 to 103024", rp.includes("  R2 MONOTONE: A no (reversal at 2.30), B1 yes, B2 no (reversal at 2.50)") && /^\[takeEvadeDose\] held read: geometries 103001 to 103024, both seats \(48 duels an arm\)/.test(rp[0]) && l0.includes("  R0 REPLICATES: the ceiling arms of A and B1 find: NO") && l0.includes("  R1 THRESHOLD: A NONE, B1 NONE, B2 NONE"));
}

console.log("\n4. THE CHECKS");
{
    const arms = X.armsOf(G, fin);
    const ctx = () => ({ rows: [{ edge: 1, z: 2, flew: 8, seedsOk: true }], steps: [{ edge: 0.1, z: 1, flew: 8, seedsOk: true }], arms: clone(arms), identity: { edge: 0 }, equal: { edge: 0 }, G: clone(G), runs: [{ gen0: clone(G) }], count: 4, finders: fin });
    const f = (mut) => { const c = ctx(); mut(c); return J(X.checksOf(c)); };
    ok("!! a clean ctx has no check failed", J(X.checksOf(ctx())) === "[]");
    ok("!! each arm and each step flew 2 fights a geometry on the set's seeds: 7 fights, 16 fights (not 2 x 4) and seedsOk false each fail the geometries check by name, alone, in an arm row and in a step row", f((c) => { c.rows[0].flew = 7; }) === '["an arm or a step did not fly the same geometries"]' && f((c) => { c.steps[0].flew = 16; }) === '["an arm or a step did not fly the same geometries"]' && f((c) => { c.steps[0].seedsOk = false; }) === '["an arm or a step did not fly the same geometries"]' && f((c) => { c.rows[0].seedsOk = false; }) === '["an arm or a step did not fly the same geometries"]');
    ok("!! a non-finite score (an edge NaN in an arm, a z of Infinity in a step, a z of -Infinity) fails by name, alone", f((c) => { c.rows[0].edge = NaN; }) === '["a score is non-finite"]' && f((c) => { c.steps[0].z = Infinity; }) === '["a score is non-finite"]' && f((c) => { c.steps[0].z = -Infinity; }) === '["a score is non-finite"]');
    ok("!! a theta that clampTheta changes (evadeTurn 9, NaN) fails by name; a run whose generation 0 is not G fails by name", f((c) => { c.arms[0].theta.evadeTurn = 9; }) === '["an arm has a theta that clampTheta changes"]' && f((c) => { c.arms[1].theta.evadeSpeed = NaN; }) === '["an arm has a theta that clampTheta changes"]' && f((c) => { c.runs[0].gen0.evadeTurn = 1; }) === `["a run's generation 0 is not G"]`);
    ok("!! an identity edge that is not 0 and two equal thetas whose edge is not 0 fail naming the edge (-0 is 0)", f((c) => { c.identity.edge = 0.25; }) === J(["G with its own evadeTurn has an edge of 0.25 against G, not exactly 0"]) && f((c) => { c.equal.edge = 0.5; }) === J(["two equal thetas have an edge of 0.5 against each other, not exactly 0"]) && f((c) => { c.identity.edge = -0; c.equal.edge = -0; }) === "[]");
    const CE = J(["a ceiling arm is not the evade-turn command's arm"]);
    ok("!! each ceiling arm must be the evade-turn command's: A@2.80, B1@2.80 and B2@2.80 with a wrong evadeTime (12, inside the bounds) each fail by name, alone; so does a missing ceiling arm", f((c) => { c.arms.find((a) => a.id === "A@2.80").theta.evadeTime = 12; }) === CE && f((c) => { c.arms.find((a) => a.id === "B1@2.80").theta.evadeTime = 12; }) === CE && f((c) => { c.arms.find((a) => a.id === "B2@2.80").theta.evadeTime = 12; }) === CE && f((c) => { c.arms = c.arms.filter((a) => a.id !== "B2@2.80"); }) === CE);
    ok("!! all the checks at once, in the order: geometries, non-finite, clamp, generation 0, identity, equal, ceiling", f((c) => { c.rows[0].flew = 7; c.steps[0].z = NaN; c.arms[0].theta.evadeTurn = 9; c.runs[0].gen0.evadeTurn = 1; c.identity.edge = 0.25; c.equal.edge = 0.5; c.arms.find((a) => a.id === "B1@2.80").theta.evadeTime = 12; }) === J(["an arm or a step did not fly the same geometries", "a score is non-finite", "an arm has a theta that clampTheta changes", "a run's generation 0 is not G", "G with its own evadeTurn has an edge of 0.25 against G, not exactly 0", "two equal thetas have an edge of 0.5 against each other, not exactly 0", "a ceiling arm is not the evade-turn command's arm"]));
}

console.log("\n5. THE COMMAND");
{
    const lines = []; const code = X.command(["smoke"], { read: rd(null), fly: guarded, log: (s) => lines.push(s), write: () => { throw new Error("must not write"); } }), out = lines.join("\n") + "\n";
    ok("!! the smoke report to the byte (sha256): 48 lines from the header to the forecast quantities, exit 0, nothing recorded", code === 0 && lines.length === 48 && /^\[takeEvadeDose\] smoke read: geometries 1 to 4, both seats \(8 duels an arm\)/.test(lines[0]) && sha(out) === "79f562bd7d03af83ce794f86ec17f30bf3a80e68a1b6a5f5cd68631b19b7cd92", sha(out));
    ok("!! the flight (smoke): 20 arm rows and 17 step rows in the order of the arms and steps, each with 8 fights on the set's geometries; the identity (G with its own evadeTurn against G) and two equal thetas have an edge of EXACTLY 0", kept !== null && J(kept.rows.map((r) => r.id)) === J(IDS.map((i) => i.replace("@1.50", "@1.71"))) && kept.steps.length === 17 && J(kept.steps.map((r) => r.id)) === J(X.stepsOf(X.armsOf(G, fin)).map((s) => s.id.replace("1.50", "1.71"))) && [...kept.rows, ...kept.steps].every((r) => r.flew === 8 && r.seedsOk) && kept.identity.edge === 0 && kept.equal.edge === 0);
    const bad = [], run = (a, o = {}) => X.command(a, { read: rd(null), log: (s) => bad.push(s), fly: noFly, exists: () => false, write: () => { throw new Error("must not write"); }, ...o });
    const devOk = { set: "dev", rules: { replicates: true } }, c = [run([]), run(["bogus"]), run(["smoke", "--bogus"]), run(["dev", "--bogus"]), run(["smoke", "--write"]), run(["dev", "--write"], { exists: () => true }), run(["held"]), run(["held", "--write"], { exists: (x) => x === X.HELD_FILE, read: rd(devOk) }), run(["held", "--write"]), run(["held", "--write"], { read: rd({ set: "dev", rules: { replicates: false } }) }), run(["held", "--write"], { read: rd({ set: "smoke", rules: { replicates: true } }) }), run(["held", "--write"], { read: rd({ set: "dev" }) }), run(["held", "--write"], { read: rd({ set: "dev", rules: { replicates: "yes" } }) }), run(["smoke"], { read: () => null })];
    ok("!! refusals, each exit 2, each by its name, and NOTHING flown (the fly stub throws): no argument and an unknown mode print the usage; an unknown argument is named (smoke and dev); smoke with --write; dev --write over an existing record; held without --write; held over an existing record; held with no DEV record; with a DEV that did not replicate; with a DEV record of the smoke set; with a DEV record that has no rules; with `replicates` that is not exactly true; the files missing", c.every((v) => v === 2) && bad.length === 14 && /^usage:/.test(bad[0]) && /^usage:/.test(bad[1]) && /unknown argument --bogus/.test(bad[2]) && /unknown argument --bogus/.test(bad[3]) && /smoke is never recorded/.test(bad[4]) && /subEvadeDoseDev\.json exists; DEV is recorded once/.test(bad[5]) && /run held with --write/.test(bad[6]) && /subEvadeDoseHeld\.json exists; the HELD set is read once/.test(bad[7]) && /subEvadeDoseDev\.json is missing; HELD is flown only after DEV is recorded/.test(bad[8]) && bad.slice(9, 13).every((l) => /DEV did not replicate \(R0\) or is not a DEV record; HELD is not flown by this registration/.test(l)) && bad.every((l) => /^takeEvadeDose: |^usage: takeEvadeDose/.test(l)) && /is missing/.test(bad[13]), c.join() + " " + bad.length);
    const holds = clone(kept); for (const id of ["A@2.80", "B1@2.80"]) holds.rows.find((r) => r.id === id).finds = true;
    const w1 = [], l1 = []; const c1 = X.command(["dev", "--write"], { devSet: "smoke", read: rd(null), fly: () => holds, log: (s) => l1.push(s), exists: () => false, write: (f, s) => w1.push([f, s]) });
    const rec = w1.length === 1 ? JSON.parse(w1[0][1]) : null;
    ok("!! dev --write (through the guard, the smoke set, with both ceiling arms made to find): exit 0, the record written once to brain/subEvadeDoseDev.json with the keys mode, set, first, count, rules, rows, steps, checks; the set it flew is named in it (smoke, so a HELD read will not take it); 20 rows and 17 steps; no check failed; the log ends `DEV: R0 holds` and `written`", c1 === 0 && w1.length === 1 && w1[0][0] === "brain/subEvadeDoseDev.json" && rec && Object.keys(rec).join() === "mode,set,first,count,rules,rows,steps,checks" && rec.mode === "dev" && rec.set === "smoke" && rec.first === 1 && rec.count === 4 && rec.rows.length === 20 && rec.steps.length === 17 && J(rec.checks) === "[]" && rec.rules.replicates === true && l1[l1.length - 2] === "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeDose.mjs held --write)" && l1[l1.length - 1] === "  written brain/subEvadeDoseDev.json" && w1[0][1].endsWith("}\n") && w1[0][1].includes('\n "mode"'));
    const l2 = []; const c2 = X.command(["dev"], { devSet: "smoke", read: rd(null), fly: guarded, log: (s) => l2.push(s), write: () => { throw new Error("must not write"); } });
    ok("!! dev without --write prints and writes nothing (exit 0); on the real smoke flight (the ceiling arm of A does not find on geometries 1 to 4) the log ends `DEV: R0 FAILS; HELD is NOT flown by this registration`", c2 === 0 && kept.rows.find((r) => r.id === "A@2.80").finds === false && l2[l2.length - 1] === "  DEV: R0 FAILS; HELD is NOT flown by this registration");
    const w4 = [], l4 = []; const c4 = X.command(["held", "--write"], { heldSet: "smoke", read: rd(devOk), fly: guarded, log: (s) => l4.push(s), exists: () => false, write: (f, s) => w4.push([f, s]) });
    const rec4 = w4.length === 1 ? JSON.parse(w4[0][1]) : null;
    ok("!! held --write after a DEV that replicated (through the guard, the smoke set): exit 0, the record written once to brain/subEvadeDoseHeld.json, mode held, the set it flew named, no `DEV:` line", c4 === 0 && w4.length === 1 && w4[0][0] === "brain/subEvadeDoseHeld.json" && rec4 && rec4.mode === "held" && rec4.set === "smoke" && rec4.rows.length === 20 && !l4.some((l) => /^  DEV:/.test(l)) && l4[l4.length - 1] === "  written brain/subEvadeDoseHeld.json");
    const l5 = []; const c5 = X.command(["held"], { heldSet: "smoke", read: rd(devOk), fly: guarded, log: (s) => l5.push(s), exists: () => false, write: () => { throw new Error("must not write"); } });
    ok("held without --write is allowed ONLY through the gate's heldSet, flies, prints and writes nothing", c5 === 0 && l5.length === 48);
    const w6 = [], l6 = []; const c6 = X.command(["dev", "--write"], { devSet: "smoke", read: rd(null), fly: () => ({ ...clone(kept), identity: { edge: 0.25 } }), log: (s) => l6.push(s), exists: () => false, write: (f, s) => w6.push([f, s]) });
    ok("!! a failed check is printed (`CHECKS FAILED, NOT WEIGHED: ...`), the exit code is 1 and the record is STILL written with the check in it", c6 === 1 && l6.includes("  CHECKS FAILED, NOT WEIGHED: G with its own evadeTurn has an edge of 0.25 against G, not exactly 0") && w6.length === 1 && J(JSON.parse(w6[0][1]).checks) === J(["G with its own evadeTurn has an edge of 0.25 against G, not exactly 0"]));
    {
        // which SET each mode asks the flight for, without flying it: the stub records the name and hands back the kept smoke flight (the count check then differs for a 24-geometry set, which is not what is asked here)
        const names = [], stub = (arms, steps, G0, name) => { names.push(name); return kept; }, quiet = { read: rd(devOk), fly: stub, log: () => {}, exists: () => false, write: () => {} };
        X.command(["smoke"], quiet); X.command(["dev"], quiet); X.command(["held", "--write"], quiet); X.command(["dev"], { ...quiet, devSet: "smoke" }); X.command(["held"], { ...quiet, heldSet: "smoke" });
        ok("!! the set each mode flies (the name handed to the flight): smoke is smoke, dev is dev (102001), held is held (103001); the gate's devSet and heldSet overrides replace the name in their own mode only", J(names) === '["smoke","dev","held","smoke","smoke"]');
        const o2 = []; X.command(["dev", "--write"], { ...quiet, write: (f, s) => o2.push(JSON.parse(s)) }); X.command(["held", "--write"], { ...quiet, write: (f, s) => o2.push(JSON.parse(s)) });
        ok("!! the record carries the first geometry and the count of the set that was named (dev 102001 for 24, held 103001 for 24)", o2.length === 2 && o2[0].set === "dev" && o2[0].first === 102001 && o2[0].count === 24 && o2[1].set === "held" && o2[1].first === 103001 && o2[1].count === 24);
    }
    const prog = fileURLToPath(new URL("./takeEvadeDose.mjs", import.meta.url)), flags = ["--preserve-symlinks", "--preserve-symlinks-main", prog];
    const pa = spawnSync(process.execPath, flags, { encoding: "utf8", timeout: 60000 }), pb = spawnSync(process.execPath, [...flags, "smoke", "--write"], { encoding: "utf8", timeout: 60000 }), pc = spawnSync(process.execPath, [...flags, "held"], { encoding: "utf8", timeout: 60000 });
    ok("!! run as a program (symlinks preserved so a mutant is the one that runs): no argument exits 2 with the usage; smoke --write exits 2; held without --write exits 2 -- three refusals that look at no file and fly nothing (the program is never run with dev or a real held)", pa.status === 2 && /^usage:/.test(pa.stdout) && pb.status === 2 && /smoke is never recorded/.test(pb.stdout) && pc.status === 2 && /run held with --write/.test(pc.stdout), [pa.status, pb.status, pc.status].join());
    const pd = spawnSync(process.execPath, ["--preserve-symlinks", "--input-type=module", "-e", `import(${J(prog)})`], { encoding: "utf8", timeout: 60000 });
    ok("!! imported from `node -e` (no script path in argv) the command runs nothing, prints nothing and does not throw", pd.status === 0 && pd.stdout === "" && pd.stderr === "", String(pd.status) + " " + pd.stderr.slice(0, 120));
    ok("importing the command sets no exit code", process.exitCode === undefined);
}

console.log("\n6. THE SOURCE");
{
    const cmd = fs.readFileSync(new URL("./takeEvadeDose.mjs", import.meta.url), "utf8"), code = (t) => t.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n"), reg = fs.readFileSync(new URL("../../brain/SUB_EVADE_DOSE_WIP.md", import.meta.url), "utf8");
    ok("!! the command has no clock and no Math.random", !/Math\.random|Date\.now|new Date|performance\.now/.test(code(cmd)));
    ok("the header names the registration and the gate, and the file is ASCII", /SUB_EVADE_DOSE_WIP\.md/.test(cmd) && /takeEvadeDose-selfcheck\.mjs/.test(cmd) && !/[^\x00-\x7F]/.test(cmd));
    ok("!! the registration's sets (DEV 102001 to 102024, HELD 103001 to 103024), the 20 arms, the 17 head-to-head steps, the doses and the amendment (an edge of at least 0.05) are the code's", /102001 to 102024/.test(reg) && /103001 to 103024/.test(reg) && /\*\*20 arms\.\*\*/.test(reg) && /\*\*17 head-to-head matchups\*\*/.test(reg) && /1\.9, 2\.1, 2\.3, 2\.5, 2\.65, 2\.8/.test(reg) && /AMENDMENT A/.test(reg) && /an edge of at least 0\.05/.test(reg));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
