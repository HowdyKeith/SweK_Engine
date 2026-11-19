// WebGLEngine/tools/ship/ruleMove-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/ruleMove-selfcheck.mjs      (a few seconds: hand fixtures and dives on the gate's own two seeds)
//
// THE GATE OF tools/ship/ruleMove.mjs (Round 39 of brain/NEEDS_AND_LIMITS.md, registered before it existed; built from Round 37's seatMove).
//   1 REGISTRATION  the six conditions (Round 37's, by value) with Round 39's seeds, the two arms' constants by value, the 24 jobs.
//   2 VERDICTS      the hull per condition against R06's, the price reported, the confirmed / held bottom line.
//   3 CHECKS        each of the five checks fails on a fixture that breaks it; a failed check says NOT WEIGHED and the profile is NOT changed.
//   4 FLIGHT        each arm is the tuned rule on its constants; the conditions reach the pilot; refusals.
//   5 SOURCE        the seeds in one place; no clock, random or file.
// NOT CHECKED, said plainly: what the two rules do on the registered dives (that is the experiment).
// SABOTAGE LOG: see the end of this file.
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
import * as U from "../../brain/tunedRule.mjs";
import * as SM from "./seatMove.mjs";
import { scenarioX } from "./plannerRobust.mjs";
import * as X from "./ruleMove.mjs";
const t0 = Date.now();
console.log("ruleMove-selfcheck -- Round 39, the aquarium's rule profile moved to low -0.04\n");

sec("1. REGISTRATION");
ok("!! the six conditions are Round 37's (stations, damage scale, noise and bias, by value): REF, DMG, N20, N30, STN5, BIAS", J(X.COND_NAMES) === J(SM.COND_NAMES) &&
    X.COND_NAMES.every((c) => ["count", "damageScale", "sd", "bias"].every((k) => X.CONDITIONS[c][k] === SM.CONDITIONS[c][k])));
ok("!! the seeds: REF 53001-53150, DMG 53201-53350, N20 53401-53550, N30 53601-53750, STN5 53801-53950, BIAS 54201-54350 (150 each of far and both = 300 dives); the gate's 54901-54902",
    J(X.COND_NAMES.map((c) => X.CONDITIONS[c].seeds)) === J([[53001, 53150], [53201, 53350], [53401, 53550], [53601, 53750], [53801, 53950], [54201, 54350]]) && J(X.KINDS) === J(["far", "both"]) && X.DIVES === 300 &&
    X.COND_NAMES.every((c) => (X.CONDITIONS[c].seeds[1] - X.CONDITIONS[c].seeds[0] + 1) * 2 === 300) && J(X.GATE_SEEDS) === J([54901, 54902]));
ok("!! the arms' constants BY VALUE: the Round 8 constants with low -0.04 (R04, the shipped seat's SURVEY_CONSTANTS) and -0.06 (R06, SURVEY_ROUND33), nothing else; 24 jobs",
    J(X.R8) === J(SS.SURVEY_R8) && J(X.ARMS) === J(["R04", "R06"]) && J(X.ARM_CONSTANTS.R04) === J(SS.SURVEY_CONSTANTS) && J(X.ARM_CONSTANTS.R06) === J(SS.SURVEY_ROUND33) && X.JOBS.length === 24);

sec("2. VERDICTS");
{
    const run = (score, i) => ({ score, kind: i % 2 ? "both" : "far", damage0: i, fingerprint: "f" + i });
    const r0 = (sc, crashed = 0, stranded = 0) => ({ runs: sc.map((s, i) => run(s, i)), crashed, stranded, score: sc.reduce((a, b) => a + b, 0) / sc.length });
    const S = [0.5, 0.6, 0.7, 0.8], fx = (o = {}) => Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, ((o[a] || {})[c]) || r0(S)]))]));
    const null0 = X.bottomLines(fx());
    ok("!! all null: no worse in every condition, and THE MOVE IS CONFIRMED", null0.length === 7 && null0.slice(0, 6).every((l, i) => l === `R04'S HULL IS NO WORSE THAN R06'S IN ${X.COND_NAMES[i]}`) && null0[6] === "THE MOVE IS CONFIRMED: R04'S HULL IS NO WORSE IN ANY CONDITION");
    const held = X.bottomLines(fx({ R04: { DMG: r0(S, 20, 2), N30: r0(S, 5) } }));
    ok("!! R04 at 22 against 0 in DMG and 5 against 0 in N30 is worse in both, and THE MOVE IS HELD naming them", held[1] === "R04'S HULL IS WORSE THAN R06'S IN DMG" && held[3] === "R04'S HULL IS WORSE THAN R06'S IN N30" && held[6] === "THE MOVE IS HELD: R04'S HULL IS WORSE IN DMG, N30");
    const better = X.rowsOf(fx({ R06: { BIAS: r0(S, 14) }, R04: { BIAS: r0(S, 1), DMG: r0(S, 4) } }));
    ok("!! the test runs against R06's count: 1 against 14 is no worse, 4 against 0 is no worse (4 <= 4); stranded dives count", better[5].noWorse && better[5].b4 === 1 && better[5].b6 === 14 && better[1].noWorse && better[1].b4 === 4 && X.rowsOf(fx({ R04: { REF: r0(S, 0, 5) } }))[0].noWorse === false);
    const hurt = fx({ R04: { REF: r0(S.map((v, i) => v - 0.05 - i * 0.001)) } }), price = X.rowsOf(hurt)[0];
    ok("!! the price is R04 minus R06, HURTS beyond 2 se, and it is reported, never weighed: a hurting price does not hold the move", price.price.mean < -0.04 && price.priceVerdict === "HURTS" && X.bottomLines(hurt)[6] === "THE MOVE IS CONFIRMED: R04'S HULL IS NO WORSE IN ANY CONDITION");
}

sec("3. CHECKS");
{
    const mk = (fp, n = 4) => ({ runs: Array.from({ length: n }, (_, i) => ({ score: 0.5, kind: i < n / 2 ? "far" : "both", damage0: i, fingerprint: fp + i })), crashed: 0, stranded: 0, score: 0.5 });
    const good = () => Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, mk(a + c)]))]));
    const names = (res, o = {}) => X.checksOf(res, { dives: 4, ...o }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! a well-formed fixture passes all five checks", names(good()).length === 0 && X.checksOf(good(), { dives: 4 }).length === 5);
    const short = good(); short.R04.N20 = mk("x", 3);
    const swap = good(); swap.R06.STN5.runs = [...swap.R06.STN5.runs].reverse();
    const same = good(); same.R04.DMG = mk("R06DMG");
    ok("!! each break fails its own check: SIZES, ALIGNED, THE ARMS DIFFER (the arms the same in DMG alone), R06 not the aquarium's rule profile",
        names(short).includes("SIZES") && names(swap).includes("ALIGNED") && J(names(same)) === J(["THE ARMS DIFFER"]) && J(names(good(), { profile: false })) === J(["R06 IS THE AQUARIUM'S RULE PROFILE"]));
    const rep = X.report(same, { dives: 4 });
    ok("!! a failed check says NOT WEIGHED, that the profile is NOT changed, and draws no bottom line", rep.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED and the profile is NOT changed.") && rep.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && rep[rep.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)");
    const full = X.report(good(), { dives: 4 });
    ok("  a passing report has a row per condition and seven bottom lines", X.COND_NAMES.every((c) => full.some((l) => l.trim().startsWith(c + " "))) && full.filter((l) => l.startsWith("BOTTOM LINE:")).length === 7);
}

sec("4. FLIGHT (the gate's two seeds)");
{
    const o = { range: X.GATE_SEEDS }, fps = (r) => r.runs.map((x) => x.fingerprint).join("|");
    const a = X.flyJob("R04", "DMG", "both", o), hand = T.evaluate(T.flyDecision(U.tunedSeat({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.04 }, U.WIDE_BOUNDS)), [54901, 54902].map((s) => scenarioX(s, "both", 3, 1.6)), { gauge: { sd: 0.1, hz: 1 } });
    ok("!! R04 is the tuned rule on R8 with low -0.04 (WIDE_BOUNDS), on DMG's scenarios (damage x1.6) and gauge", a.runs.length === 2 && fps(a) === fps(hand));
    const b = X.flyJob("R06", "BIAS", "both", o), r = X.flyJob("R06", "REF", "both", o), n3 = X.flyJob("R06", "N30", "both", o), s5 = X.setOf("STN5", "far", X.GATE_SEEDS);
    ok("!! BIAS's +0.10 and N30's noise reach the pilot; STN5 has five stations; R04 and R06 differ on these dives", fps(b) !== fps(r) && fps(n3) !== fps(r) && s5.every((sc) => sc.stations.length === 5) && fps(X.flyJob("R04", "BIAS", "both", o)) !== fps(b) && J(X.gaugeOf("BIAS")) === J({ sd: 0.1, hz: 1, fault: { bias: 0.1 } }));
    ok("  refusals: an unknown arm, condition or kind", throws(() => X.pilotOf("R05"), /unknown arm/) && throws(() => X.gaugeOf("N40"), /unknown condition/) && throws(() => X.flyJob("R04", "REF", "deep", o), /unknown kind/));
}

sec("5. SOURCE");
{
    const code = fs.readFileSync(new URL("./ruleMove.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! both arms fly the tuned rule on WIDE_BOUNDS, as the aquarium's rule profile does", /U\.tunedSeat\(ARM_CONSTANTS\[arm\], U\.WIDE_BOUNDS\)/.test(code));
    ok("!! each condition's seeds appear once in the code (REF's twice: its range and a GENERATOR sample), the gate's once; no clock, random or file", ["53001", "53201", "53401", "53601", "53801", "54201", "54901"].every((s) => (code.match(new RegExp(s, "g")) || []).length === (s === "53001" ? 2 : 1)) && !/Date\.now|Math\.random|new Date|from "node:fs"|readFileSync/.test(code));
}

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: what the two rules do on the registered dives (that is the experiment).`);
process.exitCode = fails ? 1 : 0;
// SABOTAGE LOG (16 mutants of tools/ship/ruleMove.mjs, each alone, restored byte-identical, sha-256 checked; a red counts only as a FAIL row of a gate that loaded and printed its line):
//   M1 R04 at -0.05 (2 red), M2 R06 at -0.04 (2), M3 DMG x1.5 (2), M4 N30 at 0.25 (1), M5 STN5 at 4 stations (2), M6 BIAS 0.08 (2), M7 BIAS's seeds overlapping REF's (2), M8 the bias
//   dropped from the gauge (1), M9 the damage scale ignored (1), M10 the hull test reversed (2), M11 the price reversed (1), M12 the move held on a hurting price (1; its first
//   run named a line that does not exist and was re-run on the real one), M13 THE ARMS DIFFER in one condition only (2), M14 the profile check ignored (1), M15 the report
//   ignoring a failed check (1), M16 the arms swapped in the pilot (2). 16 of 16 red; none went 0 red.
