// WebGLEngine/tools/ship/circuitBias-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/circuitBias-selfcheck.mjs      (a few seconds: hand fixtures and dives on the gate's own two seeds)
//
// THE GATE OF tools/ship/circuitBias.mjs (Round 38 of brain/NEEDS_AND_LIMITS.md, registered before it existed).
//   1 REGISTRATION  the seeds (51001-51300, both, 300 dives), the four arms and their bases by value, the conditions, the 32 jobs and chunks.
//   2 VERDICTS      V1 per arm against its own REF; V2 and V2b against the shipped seat under BIAS; V3 the price at REF; the bottom line's order; the rule profile's line.
//   3 CHECKS        each of the seven checks fails on a fixture that breaks it; a failed check says NOT WEIGHED.
//   4 FLIGHT        each arm is what it claims (full dives on the gate's seeds); the circuit arms and the rule differ; BIAS reaches the pilot; refusals.
//   5 SOURCE        the seeds in one place; the bases by value; nothing shipped is written; no clock, random or file.
// NOT CHECKED, said plainly: what the arms do on the registered dives (that is the experiment), and whether either aquarium profile should move (Keith's).
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
import * as CS from "../../brain/circuitSeat.mjs";
import * as F from "./gaugeFaults.mjs";
import * as X from "./circuitBias.mjs";
import { circuitSeat, PLAIN_CHAMPION } from "../../render/subAquariumCircuit.mjs";
const t0 = Date.now();
console.log("circuitBias-selfcheck -- Round 38, the aquarium's decision-circuit profiles under a biased gauge\n");

sec("1. REGISTRATION");
ok("!! seeds 51001-51300, kind both, 300 dives; the gate's 51901-51902 outside them", J(X.SEEDS) === J([51001, 51300]) && X.KIND === "both" && X.DIVES === 300 && X.SEEDS[1] - X.SEEDS[0] + 1 === 300 && J(X.GATE_SEEDS) === J([51901, 51902]));
ok("!! the arms C06, C04, R06, SEAT-04; the conditions REF and BIAS", J(X.ARMS) === J(["C06", "C04", "R06", "SEAT-04"]) && J(X.COND_NAMES) === J(["REF", "BIAS"]));
ok("!! the bases BY VALUE: the Round 8 constants with low moved by -0.06 and -0.04 and nothing else; -0.06 is SURVEY_ROUND33 (the aquarium's base) and -0.04 is the shipped seat's SURVEY_CONSTANTS",
    J({ ...X.BASE_06, low: SS.SURVEY_R8.low }) === J(SS.SURVEY_R8) && J({ ...X.BASE_04, low: SS.SURVEY_R8.low }) === J(SS.SURVEY_R8) &&
    X.BASE_06.low === SS.SURVEY_R8.low - 0.06 && X.BASE_04.low === SS.SURVEY_R8.low - 0.04 && J(X.BASE_06) === J(SS.SURVEY_ROUND33) && J(X.BASE_04) === J(SS.SURVEY_CONSTANTS) && J(CS.BASE_PARAMS) === J(X.BASE_06));
const ch = Array.from({ length: X.CHUNKS }, (_, j) => X.chunkRange(j));
ok("!! the 32 jobs; four chunks cover 51001-51300 once, in order", X.JOBS.length === 32 && new Set(X.JOBS.map((j) => j.join())).size === 32 && ch[0][0] === 51001 && ch[3][1] === 51300 && ch.every((c, j) => j === 0 || c[0] === ch[j - 1][1] + 1) && throws(() => X.chunkRange(4), /not 0\.\.3/));

sec("2. VERDICTS");
const run = (score, i, fp = "f") => ({ score, kind: "both", damage0: i, fingerprint: fp + i });
const r0 = (sc, crashed = 0, fp = "f") => ({ runs: sc.map((s, i) => run(s, i, fp)), crashed, stranded: 0, score: sc.reduce((a, b) => a + b, 0) / sc.length });
const S = [0.5, 0.6, 0.7, 0.8], up = (k) => S.map((v, i) => v + k + i * 0.001);
const fx = (o = {}) => Object.fromEntries(X.ARMS.map((a) => [a, { REF: (o[a] || {}).REF || r0(S), BIAS: (o[a] || {}).BIAS || r0(S) }]));
{
    ok("!! all null: every arm holds, the circuit is no worse: (1) NOTHING TO MOVE, and the rule profile holds", J(X.bottomLines(fx())) === J(["THE CIRCUIT PROFILE ON -0.06 HOLDS ITS HULL UNDER BIAS: NOTHING TO MOVE", "THE RULE PROFILE ON -0.06 HOLDS ITS HULL UNDER BIAS"]));
    const two = fx({ C06: { BIAS: r0(S, 9) }, C04: { REF: r0(up(-0.05)), BIAS: r0(S, 1) }, R06: { BIAS: r0(S, 8) } });
    const b2 = X.bottomLines(two);
    ok("!! (2): C06 at 9 against 0 pays more; C04 at 1 holds and is no worse than the seat's 0; the price at REF HURTS; R06 at 8 pays more",
        /^THE CIRCUIT PROFILE PAYS MORE UNDER BIAS ON -0\.06 AND HOLDS ON -0\.04 \(price at REF: -0\.0485 \(se 0\.\d+\) HURTS\)$/.test(b2[0]) && b2[1] === "THE RULE PROFILE ON -0.06 PAYS MORE UNDER BIAS", b2[0]);
    // the rule profile's line is R06's own: the circuit holds and the rule pays (the mutant M17 went 0 red while every fixture moved the two together)
    const ruleOnly = X.bottomLines(fx({ R06: { BIAS: r0(S, 8) } }));
    ok("!! the rule profile's line is R06's: C06 holding while R06 pays more gives (1) and PAYS MORE", ruleOnly[0] === "THE CIRCUIT PROFILE ON -0.06 HOLDS ITS HULL UNDER BIAS: NOTHING TO MOVE" && ruleOnly[1] === "THE RULE PROFILE ON -0.06 PAYS MORE UNDER BIAS");
    const three = X.bottomLines(fx({ C06: { BIAS: r0(S, 9) }, C04: { BIAS: r0(S, 9) } }));
    ok("!! (3): both bases pay more -> EITHER BASE", three[0] === "THE CIRCUIT PROFILE PAYS MORE UNDER BIAS ON EITHER BASE");
    // REF 3 and BIAS 6: V1 holds (3 <= 2 sqrt 9), V2 fails (6 against the seat's 0: 6 > 2 sqrt 6) -- and V2 read off C06's REF (3 against 0) would hold: the mutant M7 went 0 red on 7 and 9
    const v2only = fx({ C06: { REF: r0(S, 3), BIAS: r0(S, 6) } });
    const vv = X.verdictsOf(v2only);
    ok("!! V1 is against the arm's OWN REF (3 then 6 holds) and V2 against the SEAT's BIAS (6 against 0 is worse): a C06 that holds V1 but fails V2 is NOT (1)",
        vv.v1.C06 === true && vv.v2 === false && !/NOTHING TO MOVE/.test(X.bottomLines(v2only)[0]));
    ok("  V3 is C04 minus C06 at REF: higher beyond 2 se KEEPS, inside LOSES", X.verdictsOf(fx({ C04: { REF: r0(up(0.05)) } })).v3 === "KEEPS" && X.verdictsOf(fx()).v3 === "LOSES");
    ok("  the hull counts crushed plus stranded", X.verdictsOf(fx({ C06: { BIAS: { ...r0(S, 3), stranded: 4 } } })).bad.C06.BIAS === 7);
}

sec("3. CHECKS");
{
    const good = () => Object.fromEntries(X.ARMS.map((a, k) => [a, { REF: r0(S, 0, "r" + k), BIAS: r0(S, 0, "b" + k) }]));
    const names = (res, o = {}) => X.checksOf(res, { dives: 4, ...o }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! a well-formed fixture passes all seven checks", names(good()).length === 0 && X.checksOf(good(), { dives: 4 }).length === 7);
    const short = good(); short.C04.BIAS = r0([0.5, 0.6, 0.7], 0, "b1");
    const swap = good(); swap.R06.REF.runs = [...swap.R06.REF.runs].reverse();
    const still = good(); still["SEAT-04"].BIAS = r0(S, 0, "r3");
    const same = good(); same.C04.REF = r0(S, 0, "r0");
    ok("!! each break fails its own check: SIZES, ALIGNED, THE FAULT REACHES THE PILOT, THE ARMS DIFFER, the profiles and the shipped seat",
        names(short).includes("SIZES") && names(swap).includes("ALIGNED") && J(names(still)) === J(["THE FAULT REACHES THE PILOT"]) && J(names(same)) === J(["THE ARMS DIFFER"]) &&
        J(names(good(), { profiles: false })) === J(["C06 AND R06 ARE THE AQUARIUM'S PROFILES"]) && J(names(good(), { shipped: false })) === J(["SEAT-04 IS THE SHIPPED SEAT"]));
    const rep = X.report(still, { dives: 4 });
    ok("!! a failed check says NOT WEIGHED and draws no verdict", rep.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && rep.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && rep[rep.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !rep.some((l) => /V1|V2|V3/.test(l)));
    const full = X.report(good(), { dives: 4 });
    ok("  a passing report has a row per arm, V2, V2b and V3, the reported line and two bottom lines", X.ARMS.every((a) => full.some((l) => l.trim().startsWith(a + " "))) && full.some((l) => /^ {2}V2 /.test(l)) && full.some((l) => /^ {2}V2b /.test(l)) && full.some((l) => /^ {2}V3 /.test(l)) && full.some((l) => l.startsWith("REPORTED, NOT WEIGHED")) && full.filter((l) => l.startsWith("BOTTOM LINE:")).length === 2);
}

sec("4. FLIGHT (the gate's two seeds; full dives for the circuit arms, 60 s for the shipped seat's planner)");
{
    const set = T.setOf(["both"], X.GATE_SEEDS[0], X.GATE_SEEDS[1]), bias = { gauge: F.gaugeOfCond("BIAS") }, ref = { gauge: F.gaugeOfCond("REF") };
    const fps = (p, g) => T.evaluate(p, set, g).runs.map((x) => x.fingerprint).join("|");
    const c06 = fps(X.pilotOf("C06"), bias), c04 = fps(X.pilotOf("C04"), bias), r06 = fps(X.pilotOf("R06"), bias);
    // 2026-11-19 (Round 39): the aquarium's rule profile moved to low -0.04, so R06 (low -0.06, by value) is no longer it; it WAS when Round 38 flew (its committed report says PASS).
    // The row now holds C06 to the circuit profile and R06 to what the rule profile was, on FULL dives. *** FOUND WHILE RESTATING IT: the library's check 6 (profilesSame) flies
    // 60 s dives, on which low -0.04 and -0.06 fly the same, so it is still true after the move and could never have told the two bases apart. What established C06 and R06 as the
    // aquarium's profiles when Round 38 flew is this gate's full-dive row (it held then); check 6 in the committed report is the weaker statement and is said to be so here.
    const rep38 = fs.readFileSync(new URL("../../brain/rig-results/circuit-bias-report.json", import.meta.url), "utf8");
    ok("!! C06 is the aquarium's circuit profile, fingerprint for fingerprint on full BIAS dives; R06 WAS its rule profile when Round 38 flew (the committed report says PASS) and is not since Round 39 moved it to -0.04",
        c06 === fps(T.flyDecision(circuitSeat("circuit")), bias) && r06 === fps(T.flyDecision(U.tunedSeat(SS.SURVEY_ROUND33, U.WIDE_BOUNDS)), bias) && r06 !== fps(T.flyDecision(circuitSeat("rule")), bias) &&
        /PASS C06 AND R06 ARE THE AQUARIUM'S PROFILES/.test(rep38));
    const w = Float32Array.from(PLAIN_CHAMPION.weights), pol = CS.createPlainPolicy(PLAIN_CHAMPION.hidden, "plain");
    ok("!! C04 is the SAME weights on the -0.04 base (built here independently), and it differs from C06 on these dives",
        c04 === fps(T.flyDecision(() => CS.makeSeat(pol.stepper(w), { params: { ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.04 }, bounds: U.WIDE_BOUNDS })), bias) && c04 !== c06);
    ok("  circuitSeatOn(base) is the champion's seat on that base: on BASE_06 it flies C06's dives and on BASE_04 C04's", fps(T.flyDecision(X.circuitSeatOn(X.BASE_06)), bias) === c06 && fps(T.flyDecision(X.circuitSeatOn(X.BASE_04)), bias) === c04);
    ok("!! the three circuit-built arms differ pairwise on these two dives (the net is not its rule here, and the base moves it)", c06 !== r06 && c04 !== r06 && c04 !== c06);
    ok("!! BIAS is Round 34's gauge (+0.10) and reaches every circuit arm", ["C06", "C04", "R06"].every((a) => fps(X.pilotOf(a), bias) !== fps(X.pilotOf(a), ref)) && J(F.gaugeOfCond("BIAS").fault) === J({ bias: 0.1 }));
    const o = { range: X.GATE_SEEDS, seconds: 60, overrides: { seconds: 60 } };
    const s4 = X.flyJob("SEAT-04", "BIAS", "0", o);
    ok("!! SEAT-04 is surveyPilot() (the shipped seat, low -0.04), on a 60 s dive and by shippedSame()", s4.runs.length === 1 &&
        s4.runs[0].fingerprint === T.evaluate(SS.surveyPilot({ overrides: { seconds: 60 } }), T.setOf(["both"], 51901, 51901), { gauge: F.gaugeOfCond("BIAS"), seconds: 60 }).runs[0].fingerprint && X.shippedSame());
    ok("  refusals: an unknown arm or condition", throws(() => X.pilotOf("C05"), /unknown arm/) && throws(() => X.flyJob("C06", "DROP", "0", o), /unknown condition/));
}

sec("5. SOURCE");
{
    const raw = fs.readFileSync(new URL("./circuitBias.mjs", import.meta.url), "utf8"), code = raw.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! the seeds appear once in the library's code, the gate's once; no clock, random or file", (code.match(/51001/g) || []).length === 1 && (code.match(/51300/g) || []).length === 1 && (code.match(/51901/g) || []).length === 1 && !/Date\.now|Math\.random|node:fs|readFile|writeFile/.test(code));
    ok("!! the bases are written by value (low - 0.06, low - 0.04), not read from SURVEY_ROUND33 or SURVEY_CONSTANTS, and nothing shipped is assigned", /SS\.SURVEY_R8\.low - 0\.06/.test(code) && /SS\.SURVEY_R8\.low - 0\.04/.test(code) && !/SURVEY_ROUND33|SURVEY_CONSTANTS/.test(code) && !/BASE_PARAMS\s*=|SURVEY_LOW_SHIFT/.test(code));
}

sec("6. THE RESULT, RE-DERIVED FROM THE COMMITTED RUN (brain/rig-results/circuit-bias/, read once)");
{
    const dir = new URL("../../brain/rig-results/circuit-bias/", import.meta.url), file = (a, c, j) => JSON.parse(fs.readFileSync(new URL(`${a}__${c}__${j}.json`, dir), "utf8"));
    const res = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, X.mergeKinds(Array.from({ length: X.CHUNKS }, (_, j) => file(a, c, String(j))))]))]));
    const v = X.verdictsOf(res), nr = (a, b) => Math.abs(a - b) < 5e-5;
    ok("!! the five data checks pass on the committed run", X.checksOf(res).every((c) => c.ok));
    ok("!! *** the bottom lines: the circuit profile pays more under BIAS on either base, and the rule profile on -0.06 pays more ***",
        J(X.bottomLines(res)) === J(["THE CIRCUIT PROFILE PAYS MORE UNDER BIAS ON EITHER BASE", "THE RULE PROFILE ON -0.06 PAYS MORE UNDER BIAS"]));
    ok("!! the table: crushed under BIAS 88, 51, 14, 1 (C06, C04, R06, SEAT-04) and at REF 1, 1, 0, 0; nothing stranded; V3 -0.0072 HURTS",
        J(X.ARMS.map((a) => res[a].BIAS.crashed)) === J([88, 51, 14, 1]) && J(X.ARMS.map((a) => res[a].REF.crashed)) === J([1, 1, 0, 0]) &&
        X.ARMS.every((a) => res[a].REF.stranded === 0 && res[a].BIAS.stranded === 0) && nr(v.price.mean, -0.0072) && v.v3 === "HURTS" && v.v2 === false && v.v2b === false && v.v1["SEAT-04"] === true,
        J(X.ARMS.map((a) => [a, res[a].REF.score.toFixed(4), res[a].BIAS.score.toFixed(4)])));
    const nl = fs.readFileSync(new URL("../../brain/NEEDS_AND_LIMITS.md", import.meta.url), "utf8"), i = nl.indexOf("## Round 38, RESULT"), t = i > 0 ? nl.slice(i) : "";
    ok("  the RESULT note states 88 of 300, that the forecast's premise was wrong, and that this round changes nothing", /88 of 300 \(29 percent\)/.test(t) && /premise was wrong/.test(t) && /This round changes nothing/.test(t));
}
// SECTION 6 SABOTAGE (each restored byte-identical): Q1 one C06 BIAS crush removed from its job file -> 1 red ("the table"); Q2 the note saying the round moves the profile
//   ("This round changes nothing" deleted) -> 1 red ("the RESULT note").

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: what the arms do on the registered dives, and whether either aquarium profile should move.`);
process.exitCode = fails ? 1 : 0;
// SABOTAGE LOG (17 mutants, each alone in tools/ship/circuitBias.mjs, restored byte-identical, sha-256 checked; a red counts only as a FAIL row of a gate that loaded and printed its line):
//   M1 seeds ending 51299 (3 red), M2 the -0.04 base at -0.03 (3), M3 C04 flown on -0.06 (2), M4 R06 on -0.04 (1), M5 SEAT-04 as the plain rule on -0.04 (1), M6 V1 against the
//   seat's REF (1), M8 V2b reading C06 (1), M9 the price reversed (2), M10 (1) without V2 (1), M11 the bite always true (2), M12 the arms always differ (1), M13 the profile check
//   ignored (1), M14 the report ignoring a failed check (1), M15 the hull counting crushed only (1), M16 flyJob ignoring the condition (1).
//   *** 2 WENT 0 RED ON THE FIRST PASS ***: M7 (V2 read off C06's REF) -- the fixture's 7 and 9 both fail against the seat's 0, so REF and BIAS gave one answer; the fixture is now
//   3 and 6 (V1 holds, V2 fails, REF would hold): 1 red. M17 (the rule profile's line reading C06) -- every fixture moved C06 and R06 together; a fixture with only R06 paying
//   was added: 1 red. Both re-run with the other fifteen: 17 of 17 red.
