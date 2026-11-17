// WebGLEngine/tools/ship/seatMove-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/seatMove-selfcheck.mjs      (a few seconds: hand fixtures and short dives on the gate's own two seeds)
//
// THE GATE OF tools/ship/seatMove.mjs (Round 37 of brain/NEEDS_AND_LIMITS.md, registered before it existed).
//   1 REGISTRATION  the six conditions (Round 33's five and Round 34's bias) with their seeds, the two arms' constants by value, the 24 jobs.
//   2 VERDICTS      the hull per condition against the shipped seat's, the price reported, the confirmed / held bottom line.
//   3 CHECKS        each of the five checks fails on a fixture that breaks it; a failed check says NOT WEIGHED and the constant is NOT changed.
//   4 FLIGHT        short dives: each arm is the planner on its constants; BIAS and the conditions reach the pilot; check 5 flown; refusals.
//   5 SOURCE        the seeds in one place; no clock, random or file.
// NOT CHECKED, said plainly: what the two seats do on the registered dives (that is the experiment).
// SABOTAGE LOG (17 mutants of tools/ship/seatMove.mjs, each alone, restored byte-identical, sha-256 checked): SEAT-04 at -0.05 (2 red), SEAT-06 at -0.04 (1), DMG x1.5 (2),
//   N30 at 0.25 (2), STN5 at 4 stations (2), BIAS 0.08 (2), BIAS's seeds overlapping REF's (2), the bias dropped from the gauge (1), the damage scale ignored (1), the hull test
//   reversed (2), the price reversed (1), the move held on a hurting price (1), THE ARMS DIFFER in one condition only (2), check 5 ignored (1), the report ignoring a failed
//   check (1). *** 2 WENT 0 RED AT FIRST ***: the events profile (a source row added) and check 5 flown on SEAT-04 -- on 60 s dives the two seats fly the same, so check 5
//   now flies 200 s both dives, where they differ, and its row says so. Then 1 red each. Also found while building: the fault row first flew 60 s far dives, which never read
//   the gauge; it flies 120 s both dives.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(String(e.message)); } };
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import * as TOL from "./plannerTolerate.mjs";
import { scenarioX } from "./plannerRobust.mjs";
import * as X from "./seatMove.mjs";
const t0 = Date.now();
console.log("seatMove-selfcheck -- Round 37, the seat moved to low -0.04\n");

sec("1. REGISTRATION");
ok("!! the six conditions REF, DMG, N20, N30, STN5, BIAS; the first five are Round 33's (stations, damage scale, noise) and BIAS is REF's with +0.10", J(X.COND_NAMES) === J(["REF", "DMG", "N20", "N30", "STN5", "BIAS"]) &&
    TOL.COND_NAMES.every((c) => ["count", "damageScale", "sd"].every((k) => X.CONDITIONS[c][k] === TOL.CONDITIONS[c][k]) && X.CONDITIONS[c].bias === 0) && J({ ...X.CONDITIONS.BIAS, seeds: 0, bias: 0 }) === J({ ...X.CONDITIONS.REF, seeds: 0 }) && X.CONDITIONS.BIAS.bias === 0.1);
ok("!! the seeds: REF 49001-49150, DMG 49201-49350, N20 49401-49550, N30 49601-49750, STN5 49801-49950, BIAS 50201-50350 (150 each of far and both = 300 dives); the gate's 50901-50902",
    J(X.COND_NAMES.map((c) => X.CONDITIONS[c].seeds)) === J([[49001, 49150], [49201, 49350], [49401, 49550], [49601, 49750], [49801, 49950], [50201, 50350]]) && J(X.KINDS) === J(["far", "both"]) && X.DIVES === 300 &&
    X.COND_NAMES.every((c) => (X.CONDITIONS[c].seeds[1] - X.CONDITIONS[c].seeds[0] + 1) * 2 === 300) && J(X.GATE_SEEDS) === J([50901, 50902]));
ok("!! the arms' constants BY VALUE: the Round 8 constants (equal to surveySeat.SURVEY_R8) with low -0.04 and -0.06, nothing else; 24 jobs", J(X.R8) === J(SS.SURVEY_R8) && J(X.ARMS) === J(["SEAT-04", "SEAT-06"]) &&
    X.ARM_CONSTANTS["SEAT-04"].low === X.R8.low - 0.04 && X.ARM_CONSTANTS["SEAT-06"].low === X.R8.low - 0.06 && X.ARMS.every((a) => J({ ...X.ARM_CONSTANTS[a], low: X.R8.low }) === J(X.R8)) && X.JOBS.length === 24);

sec("2. VERDICTS");
{
    const run = (score, i) => ({ score, kind: i % 2 ? "both" : "far", damage0: i, fingerprint: "f" + i, crushed: false, stranded: false });
    const r0 = (sc, crashed = 0, stranded = 0) => ({ runs: sc.map((s, i) => run(s, i)), crashed, stranded, score: sc.reduce((a, b) => a + b, 0) / sc.length });
    const S = [0.5, 0.6, 0.7, 0.8], fx = (o = {}) => Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, ((o[a] || {})[c]) || r0(S)]))]));
    const null0 = X.bottomLines(fx());
    ok("!! all null: no worse in every condition, and THE MOVE IS CONFIRMED", null0.length === 7 && null0.slice(0, 6).every((l, i) => l === `SEAT-04'S HULL IS NO WORSE THAN THE SHIPPED SEAT'S IN ${X.COND_NAMES[i]}`) && null0[6] === "THE MOVE IS CONFIRMED: SEAT-04'S HULL IS NO WORSE IN ANY CONDITION");
    const held = X.bottomLines(fx({ "SEAT-04": { DMG: r0(S, 20, 2), N30: r0(S, 5) } }));
    ok("!! SEAT-04 at 22 against 0 in DMG and 5 against 0 in N30 is worse in both, and THE MOVE IS HELD naming them", held[1] === "SEAT-04'S HULL IS WORSE THAN THE SHIPPED SEAT'S IN DMG" && held[3] === "SEAT-04'S HULL IS WORSE THAN THE SHIPPED SEAT'S IN N30" && held[6] === "THE MOVE IS HELD: SEAT-04'S HULL IS WORSE IN DMG, N30");
    const better = X.rowsOf(fx({ "SEAT-06": { BIAS: r0(S, 10) }, "SEAT-04": { BIAS: r0(S, 1), DMG: r0(S, 4) } }));
    ok("!! the test runs against the SHIPPED seat's count, both ways: 1 against 10 is no worse, 4 against 0 is no worse (4 <= 4); stranded dives count", better[5].noWorse && better[5].b4 === 1 && better[5].b6 === 10 && better[1].noWorse && better[1].b4 === 4 &&
        X.rowsOf(fx({ "SEAT-04": { REF: r0(S, 0, 5) } }))[0].noWorse === false);
    const price = X.rowsOf(fx({ "SEAT-04": { REF: r0(S.map((v, i) => v - 0.05 - i * 0.001)) } }))[0];
    ok("!! the price is SEAT-04 minus SEAT-06, HURTS beyond 2 se, and it is reported, never weighed: a hurting price does not hold the move", price.price.mean < -0.04 && price.priceVerdict === "HURTS" &&
        X.bottomLines(fx({ "SEAT-04": { REF: r0(S.map((v, i) => v - 0.05 - i * 0.001)) } }))[6] === "THE MOVE IS CONFIRMED: SEAT-04'S HULL IS NO WORSE IN ANY CONDITION");
}

sec("3. CHECKS");
{
    const mk = (fp, n = 4) => ({ runs: Array.from({ length: n }, (_, i) => ({ score: 0.5, kind: i < n / 2 ? "far" : "both", damage0: i, fingerprint: fp + i })), crashed: 0, stranded: 0, score: 0.5 });
    const good = () => Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, mk(a + c)]))]));
    const names = (res, o = {}) => X.checksOf(res, { dives: 4, ...o }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! a well-formed fixture passes all five checks", names(good()).length === 0 && X.checksOf(good(), { dives: 4 }).length === 5);
    const short = good(); short["SEAT-04"].N20 = mk("x", 3);
    const swap = good(); swap["SEAT-06"].STN5.runs = [...swap["SEAT-06"].STN5.runs].reverse();
    const same = good(); same["SEAT-04"].DMG = mk("SEAT-06DMG");
    ok("!! each break fails its own check: SIZES, ALIGNED, THE ARMS DIFFER (the arms the same in DMG alone), SEAT-06 not the shipped seat",
        names(short).includes("SIZES") && names(swap).includes("ALIGNED") && J(names(same)) === J(["THE ARMS DIFFER"]) && J(names(good(), { shipped: false })) === J(["SEAT-06 IS THE SHIPPED SEAT"]));
    const rep = X.report(same, { dives: 4 });
    ok("!! a failed check says NOT WEIGHED, that the constant is NOT changed, and draws no bottom line", rep.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED and the constant is NOT changed.") && rep.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && rep[rep.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)");
    const full = X.report(good(), { dives: 4 });
    ok("  a passing report has a row per condition and seven bottom lines", X.COND_NAMES.every((c) => full.some((l) => l.trim().startsWith(c + " "))) && full.filter((l) => l.startsWith("BOTTOM LINE:")).length === 7);
}

sec("4. FLIGHT (short dives on the gate's seeds)");
{
    const o = { range: X.GATE_SEEDS, seconds: 60, overrides: { seconds: 60 } }, fps = (r) => r.runs.map((x) => x.fingerprint).join("|");
    const a = X.flyJob("SEAT-04", "DMG", "both", o), hand = T.evaluate(T.flyDecision(Q.perturbedSeat({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.04 }, {}, SS.planOf("standard", { seconds: 60 }))),
        [50901, 50902].map((s) => scenarioX(s, "both", 3, 1.6)), { gauge: { sd: 0.1, hz: 1 }, seconds: 60 });
    ok("!! SEAT-04 is the planner on R8 with low -0.04, standard profile, on DMG's scenarios (damage x1.6) and gauge", a.runs.length === 2 && fps(a) === fps(hand));
    const o2 = { range: X.GATE_SEEDS, seconds: 120, overrides: { seconds: 120 } }, b = X.flyJob("SEAT-06", "BIAS", "both", o2), r = X.flyJob("SEAT-06", "REF", "both", o2), n3 = X.flyJob("SEAT-06", "N30", "both", o2), s5 = X.setOf("STN5", "far", X.GATE_SEEDS);
    ok("!! BIAS's +0.10 and N30's noise reach the pilot (120 s both dives: a 60 s far dive never reads the gauge); STN5 has five stations", fps(b) !== fps(r) && fps(n3) !== fps(r) && s5.every((sc) => sc.stations.length === 5) && J(X.gaugeOf("BIAS")) === J({ sd: 0.1, hz: 1, fault: { bias: 0.1 } }) && J(X.gaugeOf("N30")) === J({ sd: 0.3, hz: 1 }));
    const T200 = { seconds: 200 }, bset = X.KINDS.map((k) => X.setOf("BIAS", k, X.GATE_SEEDS)).flat(), g200 = { gauge: X.gaugeOf("BIAS"), seconds: 200 }, fpsOf = (r) => r.runs.map((x) => x.fingerprint).join("|");
    ok("!! check 5 flown, and the move made: SEAT-06 WAS the shipped seat when Round 37 flew (its committed report says PASS); since 2026-11-17 the shipped surveyPilot() IS SEAT-04, on dives where the two differ", X.shippedSame() === false && fs.readFileSync(new URL("../../brain/rig-results/seat-move-report.json", import.meta.url), "utf8").includes("PASS SEAT-06 IS THE SHIPPED SEAT") && fpsOf(T.evaluate(X.pilotOf("SEAT-04", T200), bset, g200)) === fpsOf(T.evaluate(SS.surveyPilot({ overrides: T200 }), bset, g200)));
    ok("  refusals: an unknown arm, condition or kind", throws(() => X.pilotOf("SEAT-08"), /unknown arm/) && throws(() => X.gaugeOf("N40"), /unknown condition/) && throws(() => X.flyJob("SEAT-04", "REF", "deep", o), /unknown kind/));
}

sec("5. SOURCE");
{
    const code = fs.readFileSync(new URL("./seatMove.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! both arms fly the planner in the standard profile, as the shipped seat does (short dives do not tell the profiles apart)", /Q\.perturbedSeat\(ARM_CONSTANTS\[arm\], \{\}, SS\.planOf\("standard", overrides\)\)/.test(code));
    ok("!! each condition's seeds appear once in the code, the gate's once; no clock, random or file", ["49001", "49201", "49401", "49601", "49801", "50201", "50901"].every((s) => (code.match(new RegExp(s, "g")) || []).length === (s === "49001" ? 2 : 1)) && !/Date\.now|Math\.random|new Date|from "node:fs"|readFileSync/.test(code));
}

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: what the two seats do on the registered dives (that is the experiment).`);
process.exitCode = fails ? 1 : 0;
