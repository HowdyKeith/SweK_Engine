// WebGLEngine/tools/ship/gaugeShift-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gaugeShift-selfcheck.mjs      (a few seconds: hand fixtures and short dives on the gate's own two seeds)
//
// THE GATE OF tools/ship/gaugeShift.mjs (Round 35 of brain/NEEDS_AND_LIMITS.md, registered before it existed).
//   1 REGISTRATION  the seeds (45001-45300, `both`, 300 dives), the two arms, the two conditions, the 16 jobs and their chunks.
//   2 VERDICTS      the four bottom lines in each of their cases, each on the test or margin the registration names.
//   3 CHECKS        each of the five checks fails on a fixture that breaks it, and a failed check says NOT WEIGHED.
//   4 FLIGHT        real short dives on 45901-45902: SEAT is the shipped pilot, SEAT-R8 the same planner on SURVEY_R8; BIAS reaches the pilot; refusals.
//   5 SOURCE        the seeds in one place; no clock, random or file in the library.
// NOT CHECKED, said plainly: what the two seats do on the registered dives (that is the experiment).
// SABOTAGE LOG (18 mutants of tools/ship/gaugeShift.mjs, each applied alone and restored byte-identical, sha-256 checked): kind far (6 red), seeds ending 45299 (3),
//   SEAT-R8 on SURVEY_CONSTANTS (1), SEAT-R8 in the events profile (1), SEAT in the ensemble profile (1), overlapping chunks (3), V1 not negated (4), V2 against the seat's
//   REF (1), V3 on REF (1), the price reversed (1), the price weighed under BIAS (1), V4 on LOSES too (2), ALIGNED always (1), the bite on SEAT only (2), THE ARMS DIFFER
//   always (1), the report ignoring a failed check (1), BIAS flown as DRIFT (1), bottom line 3 inverted (3). All red by name. Said plainly: the three wrong-constant or
//   wrong-profile mutants are caught by the SOURCE row only -- 90 s dives on the gate's seeds do not tell those pilots apart.
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
import * as F from "./gaugeFaults.mjs";
import * as X from "./gaugeShift.mjs";
const t0 = Date.now();
console.log("gaugeShift-selfcheck -- Round 35, the shift under a biased gauge\n");

sec("1. REGISTRATION");
ok("!! seeds 45001-45300, kind both, 300 dives an arm and condition; the gate's 45901-45902 outside them", J(X.SEEDS) === J([45001, 45300]) && X.KIND === "both" && X.DIVES === 300 && X.SEEDS[1] - X.SEEDS[0] + 1 === X.DIVES && J(X.GATE_SEEDS) === J([45901, 45902]) && X.GATE_SEEDS[0] > X.SEEDS[1]);
ok("!! the arms SEAT and SEAT-R8, the conditions REF and BIAS (Round 34's +0.10)", J(X.ARMS) === J(["SEAT", "SEAT-R8"]) && J(X.COND_NAMES) === J(["REF", "BIAS"]) && J(F.FAULTS.BIAS) === J({ bias: 0.1 }));
const chunks = Array.from({ length: X.CHUNKS }, (_, j) => X.chunkRange(j));
ok("!! the 16 jobs; the four chunks cover 45001-45300 exactly once, in order", X.JOBS.length === 16 && new Set(X.JOBS.map((j) => j.join())).size === 16 && chunks[0][0] === 45001 && chunks[3][1] === 45300 &&
    chunks.every((c, j) => j === 0 || c[0] === chunks[j - 1][1] + 1) && chunks.reduce((a, c) => a + c[1] - c[0] + 1, 0) === 300 && throws(() => X.chunkRange(4), /not 0\.\.3/) && J(X.chunkRange(1, [1, 2])) === J([2, 2]));

sec("2. VERDICTS");
{
    const run = (score, i, extra = {}) => ({ score, kind: "both", damage0: i, fingerprint: "f" + i, crushed: false, stranded: false, ...extra });
    const res0 = (scores, crashed = 0) => ({ runs: scores.map((s, i) => run(s, i)), crashed, stranded: 0, score: scores.reduce((a, b) => a + b, 0) / scores.length });
    const S = [0.5, 0.6, 0.7, 0.8], up = (k) => S.map((v, i) => v + k + i * 0.001);
    const fx = (o = {}) => Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, (o[a] || {})[c] || res0(S)]))]));
    ok("!! all null: does not replicate, the R8 seat holds, the shift not shown, no score cost", J(X.bottomLines(fx())) === J(["ROUND 34'S FAILURE DOES NOT REPLICATE", "THE SEAT ON THE ROUND 8 CONSTANTS HOLDS ITS HULL UNDER BIAS", "THE SHIFT IS NOT SHOWN TO CRUSH", "GOING BACK TO THE ROUND 8 CONSTANTS COSTS NO SCORE THE TEST CAN SEE"]));
    const shift = X.bottomLines(fx({ SEAT: { BIAS: res0(S, 14) }, "SEAT-R8": { BIAS: res0(S, 2) } }));
    ok("!! the seat 14 under BIAS against 0 at REF replicates; the R8 seat at 2 holds; 14 against 2 is the shift (12 > 2 sqrt 16 = 8)", shift[0] === "ROUND 34'S FAILURE REPLICATES: THE SEAT'S HULL PAYS MORE UNDER BIAS" && shift[1] === "THE SEAT ON THE ROUND 8 CONSTANTS HOLDS ITS HULL UNDER BIAS" && shift[2] === "THE SHIFT IS WHAT CRUSHES");
    const both = X.bottomLines(fx({ SEAT: { BIAS: res0(S, 9) }, "SEAT-R8": { BIAS: res0(S, 6) } }));
    ok("!! both pay (9 and 6 against 0) and 9 against 6 is inside the test: the shift is NOT shown", both[0].startsWith("ROUND 34'S FAILURE REPLICATES") && both[1] === "THE SEAT ON THE ROUND 8 CONSTANTS PAYS MORE UNDER BIAS" && both[2] === "THE SHIFT IS NOT SHOWN TO CRUSH");
    const own = X.verdictsOf(fx({ "SEAT-R8": { REF: res0(S, 5), BIAS: res0(S, 5) }, SEAT: { BIAS: res0(S, 4) } }));
    ok("!! each seat's BIAS hull is tested against its OWN REF: the R8 seat at 5 and 5 holds; the seat at 4 against 0 holds (4 <= 4)", own.v2 === true && own.v1 === false && own.bad["SEAT-R8"].REF === 5);
    const cost = X.verdictsOf(fx({ "SEAT-R8": { REF: res0(up(-0.05)) } })), gain = X.verdictsOf(fx({ "SEAT-R8": { REF: res0(up(0.05)) } })), biasOnly = X.verdictsOf(fx({ "SEAT-R8": { BIAS: res0(up(-0.05)) } }));
    ok("!! the price is SEAT-R8 minus SEAT at REF: lower beyond 2 se costs score, higher does not, and a BIAS difference is reported, never weighed", cost.v4 === true && gain.v4 === false && biasOnly.v4 === false && biasOnly.priceBias.mean < -0.04 && cost.price.mean < -0.04);
}

sec("3. CHECKS");
{
    const mk = (fp, n = 4) => ({ runs: Array.from({ length: n }, (_, i) => ({ score: 0.5, kind: "both", damage0: i, fingerprint: fp + i })), crashed: 0, stranded: 0, score: 0.5 });
    const good = () => ({ SEAT: { REF: mk("a"), BIAS: mk("b") }, "SEAT-R8": { REF: mk("c"), BIAS: mk("d") } });
    const names = (res) => X.checksOf(res, { dives: 4 }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! a well-formed fixture passes all five checks", names(good()).length === 0 && X.checksOf(good(), { dives: 4 }).length === 5);
    const short = good(); short.SEAT.BIAS = mk("b", 3);
    const swap = good(); swap["SEAT-R8"].BIAS.runs = [...swap["SEAT-R8"].BIAS.runs].reverse();
    const still = good(); still["SEAT-R8"].BIAS = mk("c");
    const same = good(); same["SEAT-R8"].REF = mk("a");
    ok("!! each break fails its own check: SIZES, ALIGNED, THE FAULT REACHES THE PILOT (the R8 seat's bias changed nothing), THE ARMS DIFFER",
        names(short).includes("SIZES") && names(swap).includes("ALIGNED") && J(names(still)) === J(["THE FAULT REACHES THE PILOT"]) && J(names(same)) === J(["THE ARMS DIFFER"]));
    const rep = X.report(still, { dives: 4 });
    ok("!! a failed check says NOT WEIGHED and no bottom line is drawn", rep.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && rep[rep.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && rep.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
    const full = X.report(good(), { dives: 4 });
    ok("  a passing report carries both arms, the hull line, the price line, the crushed start damages and four bottom lines", full.some((l) => l.trim().startsWith("SEAT-R8 ")) && full.some((l) => l.startsWith("hull (crushed+stranded)")) && full.some((l) => l.startsWith("SEAT-R8 minus SEAT")) && full.filter((l) => /crushed under BIAS, start damage/.test(l)).length === 2 && full.filter((l) => l.startsWith("BOTTOM LINE:")).length === 4);
}

sec("4. FLIGHT (short dives on the gate's seeds)");
{
    const o = { range: X.GATE_SEEDS, seconds: 90, overrides: { seconds: 90 } }, set = T.setOf(["both"], 45901, 45901), fps = (r) => r.runs.map((x) => x.fingerprint).join("|");
    const seat = X.flyJob("SEAT", "REF", "0", o), r8 = X.flyJob("SEAT-R8", "REF", "0", o), r8b = X.flyJob("SEAT-R8", "BIAS", "0", o);
    ok("!! chunk 0 of the gate's seeds is its first seed; SEAT is surveyPilot, SEAT-R8 the same planner and profile on SURVEY_R8", seat.runs.length === 1 &&
        fps(seat) === fps(T.evaluate(SS.surveyPilot({ overrides: { seconds: 90 } }), set, { gauge: F.gaugeOfCond("REF"), seconds: 90 })) &&
        fps(r8) === fps(T.evaluate(T.flyDecision(Q.perturbedSeat(SS.SURVEY_R8, {}, SS.planOf("standard", { seconds: 90 }))), set, { gauge: F.gaugeOfCond("REF"), seconds: 90 })));
    ok("!! BIAS is Round 34's gauge and reaches the pilot", fps(r8b) === fps(T.evaluate(T.flyDecision(Q.perturbedSeat(SS.SURVEY_R8, {}, SS.planOf("standard", { seconds: 90 }))), set, { gauge: { sd: 0.1, hz: 1, fault: { bias: 0.1 } }, seconds: 90 })) && fps(r8b) !== fps(r8));
    ok("  refusals: an unknown arm or condition", throws(() => X.pilotOf("SEAT-R9"), /unknown arm/) && throws(() => X.flyJob("SEAT", "DRIFT", "0", o), /unknown condition/));
}

sec("5. SOURCE");
{
    const code = fs.readFileSync(new URL("./gaugeShift.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! the seeds appear once in the library's code, the gate's once", (code.match(/45001/g) || []).length === 1 && (code.match(/45300/g) || []).length === 1 && (code.match(/45901/g) || []).length === 1);
    ok("!! no clock, no random, no file; the seat is surveyPilot with no profile and SEAT-R8 the standard profile", !/Date\.now|Math\.random|new Date|from "node:fs"|readFileSync/.test(code) &&
        /if \(arm === "SEAT"\) return SS\.surveyPilot\(\{ overrides \}\);/.test(code) && /Q\.perturbedSeat\(SS\.SURVEY_R8, \{\}, SS\.planOf\("standard", overrides\)\)/.test(code));
}

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: what the two seats do on the registered dives (that is the experiment).`);
process.exitCode = fails ? 1 : 0;
