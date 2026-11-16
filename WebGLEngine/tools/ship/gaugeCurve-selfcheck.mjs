// WebGLEngine/tools/ship/gaugeCurve-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gaugeCurve-selfcheck.mjs      (a few seconds: hand fixtures and short dives on the gate's own two seeds)
//
// THE GATE OF tools/ship/gaugeCurve.mjs (Round 36 of brain/NEEDS_AND_LIMITS.md, registered before it existed, Amendment 1 before any seed).
//   1 REGISTRATION  the seeds (48001-48300, both, 300 dives), the four shifts and their constants, the conditions, the 32 jobs and chunks, the three shares.
//   2 VERDICTS      the hull per shift against its own REF, the gain over L0, the bottom line's choice, the break-even price (Amendment 1).
//   3 CHECKS        each of the six checks fails on a fixture that breaks it; a failed check says NOT WEIGHED.
//   4 FLIGHT        short dives: each arm is the planner on its constants; L-0.06 is the shipped surveyPilot; BIAS reaches the pilot; refusals.
//   5 SOURCE        the seeds in one place; no clock, random or file.
//   6 RESULT        the committed run's checks, bottom lines and the table the RESULT note states, re-derived.
// NOT CHECKED, said plainly: what the shifts do on the registered dives (that is the experiment), and what a crushed boat is worth (Keith's).
// SABOTAGE LOG (17 mutants of tools/ship/gaugeCurve.mjs, each alone, restored byte-identical, sha-256 checked): a shift -0.03 (5 red), seeds ending 48299 (3), the
//   constants moving high too (1), the hull against L0's REF (1), the gain weighed under BIAS (2), the smallest shift named (1), the hull not required (1), the extra over
//   the arm's own REF (1), the break-even without (1 - f) (1), shares 0.1 (2), THE SHIFTS DIFFER always (1), the bite always (2), check 6 ignored (1), BIAS flown as
//   DRIFT (1), the report ignoring a failed check (1). *** 2 WENT 0 RED ***: the events profile (60 s dives do not tell it apart: a source row added, then 1 red) and
//   check 6 flown under REF instead of BIAS -- DECLARED EQUIVALENT: either condition shows the same identity of L-0.06 and surveyPilot.
// SECTION 6 (the result rows, sabotaged in the committed run and the note, each restored byte-identical): Q1 the -0.04 crush removed, Q2 an L-0.02 REF score +0.05,
//   Q3 one more L-0.06 BIAS crush, Q4 the note saying the round chooses -0.04 -> 1 red each.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-12) => Math.abs(a - b) < t;
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(String(e.message)); } };
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import * as F from "./gaugeFaults.mjs";
import * as X from "./gaugeCurve.mjs";
const t0 = Date.now();
console.log("gaugeCurve-selfcheck -- Round 36, the shift curve under a biased gauge\n");

sec("1. REGISTRATION");
ok("!! seeds 48001-48300, kind both, 300 dives; the gate's 48901-48902 outside them", J(X.SEEDS) === J([48001, 48300]) && X.KIND === "both" && X.DIVES === 300 && X.SEEDS[1] - X.SEEDS[0] + 1 === 300 && J(X.GATE_SEEDS) === J([48901, 48902]));
ok("!! the shifts 0, -0.02, -0.04, -0.06 named L0, L-0.02, L-0.04, L-0.06; REF and BIAS; the shares 5, 25 and 100 percent", J(X.SHIFTS) === J([0, -0.02, -0.04, -0.06]) && J(X.ARMS) === J(["L0", "L-0.02", "L-0.04", "L-0.06"]) && J(X.COND_NAMES) === J(["REF", "BIAS"]) && J(X.SHARES) === J([0.05, 0.25, 1]));
ok("!! each arm's constants are the Round 8 constants with low moved by its shift and nothing else; L-0.06 is SURVEY_CONSTANTS itself", X.ARMS.every((a) => J({ ...X.constantsOf(a), low: SS.SURVEY_R8.low }) === J(SS.SURVEY_R8) && near(X.constantsOf(a).low, SS.SURVEY_R8.low + X.shiftOf(a), 1e-15)) &&
    X.constantsOf("L-0.06") === SS.SURVEY_CONSTANTS && X.constantsOf("L0").low === SS.SURVEY_R8.low && throws(() => X.shiftOf("L-0.08"), /unknown arm/));
const ch = Array.from({ length: X.CHUNKS }, (_, j) => X.chunkRange(j));
ok("!! the 32 jobs; four chunks cover 48001-48300 once, in order", X.JOBS.length === 32 && new Set(X.JOBS.map((j) => j.join())).size === 32 && ch[0][0] === 48001 && ch[3][1] === 48300 && ch.every((c, j) => j === 0 || c[0] === ch[j - 1][1] + 1) && throws(() => X.chunkRange(4), /not 0\.\.3/));

sec("2. VERDICTS");
{
    const run = (score, i) => ({ score, kind: "both", damage0: i, fingerprint: "f" + i, crushed: false, stranded: false });
    const r0 = (sc, crashed = 0) => ({ runs: sc.map((s, i) => run(s, i)), crashed, stranded: 0, score: sc.reduce((a, b) => a + b, 0) / sc.length });
    const S = [0.5, 0.6, 0.7, 0.8], up = (k) => S.map((v, i) => v + k + i * 0.001);
    const fx = (o = {}) => Object.fromEntries(X.ARMS.map((a) => [a, { REF: (o[a] || {}).REF || r0(S), BIAS: (o[a] || {}).BIAS || r0(S) }]));
    ok("!! all null: every shift holds, none keeps a gain, so NO SHIFT", J(X.bottomLines(fx())) === J(["L-0.02 HOLDS ITS HULL UNDER BIAS", "L-0.04 HOLDS ITS HULL UNDER BIAS", "L-0.06 HOLDS ITS HULL UNDER BIAS", "NO SHIFT HOLDS ITS HULL UNDER BIAS AND KEEPS A GAIN"]));
    const curve = fx({ "L-0.02": { REF: r0(up(0.01)) }, "L-0.04": { REF: r0(up(0.02)), BIAS: r0(S, 4) }, "L-0.06": { REF: r0(up(0.03)), BIAS: r0(S, 9) } });
    const bl = X.bottomLines(curve);
    ok("!! the curve case: L-0.06 at 9 against 0 pays more; L-0.04 at 4 holds and keeps; the bottom line names -0.04, the largest that does both", bl[2] === "L-0.06 PAYS MORE UNDER BIAS" && bl[1] === "L-0.04 HOLDS ITS HULL UNDER BIAS" && bl[3] === "THE LARGEST SHIFT THAT HOLDS ITS HULL UNDER BIAS AND KEEPS A GAIN IS LOW -0.04 (+0.0215 AT A SOUND GAUGE)");
    const own = X.rowsOf(fx({ "L-0.04": { REF: r0(up(0.02), 5), BIAS: r0(S, 5) } })).find((r) => r.arm === "L-0.04");
    ok("!! a shift's hull is tested against its OWN REF (5 and 5 holds) and its extra is counted over L0's BIAS (5 - 0)", own.holds === true && own.extra === 5 && own.bad.REF === 5);
    const hurt = X.rowsOf(fx({ "L-0.02": { REF: r0(up(-0.05)) } })).find((r) => r.arm === "L-0.02");
    ok("  the gain is the arm's REF minus L0's REF: lower beyond 2 se HURTS, and a HURTS shift is never named", hurt.verdict === "HURTS" && hurt.gain.mean < 0 && X.rowsOf(fx())[0].verdict === "BASE");
    ok("!! the break-even (Amendment 1): ((1 - f) gRef + f gBias) x 300 / (f x extra); 0.02 and 0 at 5 extra -> 22.8 at 5 %, 3.6 at 25 %, 0 at 100 %; null with no extra",
        near(X.breakEvenOf(0.02, 0, 5, 0.05), 22.8, 1e-9) && near(X.breakEvenOf(0.02, 0, 5, 0.25), 3.6, 1e-9) && near(X.breakEvenOf(0.02, 0, 5, 1), 0, 1e-12) && X.breakEvenOf(0.02, 0, 0, 0.25) === null &&
        J(X.rowsOf(curve).find((r) => r.arm === "L-0.06").breakEven.map((v) => +v.toFixed(6))) === J([0.05, 0.25, 1].map((f) => +(((1 - f) * X.rowsOf(curve)[3].gain.mean) * 300 / (f * 9)).toFixed(6))));
}

sec("3. CHECKS");
{
    const mk = (fp, n = 4) => ({ runs: Array.from({ length: n }, (_, i) => ({ score: 0.5, kind: "both", damage0: i, fingerprint: fp + i })), crashed: 0, stranded: 0, score: 0.5 });
    const good = () => Object.fromEntries(X.ARMS.map((a, k) => [a, { REF: mk("r" + k), BIAS: mk("b" + k) }]));
    const names = (res, o = {}) => X.checksOf(res, { dives: 4, ...o }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! a well-formed fixture passes all six checks", names(good()).length === 0 && X.checksOf(good(), { dives: 4 }).length === 6);
    const short = good(); short["L-0.04"].BIAS = mk("b2", 3);
    const swap = good(); swap["L-0.02"].REF.runs = [...swap["L-0.02"].REF.runs].reverse();
    const still = good(); still["L-0.06"].BIAS = mk("r3");
    const same = good(); same["L-0.04"].REF = mk("r1");
    ok("!! each break fails its own check: SIZES, ALIGNED, THE FAULT REACHES THE PILOT (L-0.06), THE SHIFTS DIFFER (L-0.02 and L-0.04 the same), and L-0.06 not the shipped seat",
        names(short).includes("SIZES") && names(swap).includes("ALIGNED") && J(names(still)) === J(["THE FAULT REACHES THE PILOT"]) && J(names(same)) === J(["THE SHIFTS DIFFER"]) && J(names(good(), { shipped: false })) === J(["L-0.06 IS THE SHIPPED SEAT"]));
    const rep = X.report(still, { dives: 4 });
    ok("!! a failed check says NOT WEIGHED and draws no bottom line", rep.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && rep.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && rep[rep.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)");
    const full = X.report(good(), { dives: 4 });
    ok("  a passing report has a row per arm, the break-even note and four bottom lines", X.ARMS.every((a) => full.some((l) => l.trim().startsWith(a + " "))) && full.some((l) => /share is not known/.test(l)) && full.filter((l) => l.startsWith("BOTTOM LINE:")).length === 4);
}

sec("4. FLIGHT (short dives on the gate's seeds)");
{
    const o = { range: X.GATE_SEEDS, seconds: 60, overrides: { seconds: 60 } }, set = T.setOf(["both"], 48901, 48901), fps = (r) => r.runs.map((x) => x.fingerprint).join("|");
    const a2 = X.flyJob("L-0.02", "REF", "0", o), b2 = X.flyJob("L-0.02", "BIAS", "0", o);
    ok("!! L-0.02 is the planner on R8 with low - 0.02, standard profile; BIAS is Round 34's gauge and reaches it", a2.runs.length === 1 &&
        fps(a2) === fps(T.evaluate(T.flyDecision(Q.perturbedSeat({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.02 }, {}, SS.planOf("standard", { seconds: 60 }))), set, { gauge: F.gaugeOfCond("REF"), seconds: 60 })) &&
        fps(b2) === fps(T.evaluate(T.flyDecision(Q.perturbedSeat({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.02 }, {}, SS.planOf("standard", { seconds: 60 }))), set, { gauge: { sd: 0.1, hz: 1, fault: { bias: 0.1 } }, seconds: 60 })) && fps(a2) !== fps(b2));
    ok("!! check 6 flown: L-0.06 is the shipped surveyPilot on the gate's two dives", X.shippedSame() === true);
    ok("  refusals: an unknown arm or condition", throws(() => X.pilotOf("L+0.02"), /unknown arm/) && throws(() => X.flyJob("L0", "DROP", "0", o), /unknown condition/));
}

sec("5. SOURCE");
{
    const code = fs.readFileSync(new URL("./gaugeCurve.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! every arm flies the planner in the standard profile, as the shipped seat does (60 s dives do not tell the profiles apart)", /Q\.perturbedSeat\(constantsOf\(arm\), \{\}, SS\.planOf\("standard", overrides\)\)/.test(code));
    ok("!! the seeds appear once in the library's code, the gate's once; no clock, random or file", (code.match(/48001/g) || []).length === 1 && (code.match(/48300/g) || []).length === 1 && (code.match(/48901/g) || []).length === 1 && !/Date\.now|Math\.random|new Date|from "node:fs"|readFileSync/.test(code));
}

sec("6. THE RESULT, RE-DERIVED FROM THE COMMITTED RUN (brain/rig-results/gauge-curve/, read once)");
{
    const dir = new URL("../../brain/rig-results/gauge-curve/", import.meta.url), file = (a, c, j) => JSON.parse(fs.readFileSync(new URL(`${a}__${c}__${j}.json`, dir), "utf8"));
    const res = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, X.mergeKinds(Array.from({ length: X.CHUNKS }, (_, j) => file(a, c, String(j))))]))]));
    const rows = X.rowsOf(res), r = (a) => rows.find((x) => x.arm === a), nr = (a, b) => Math.abs(a - b) < 5e-5;
    ok("!! the five data checks pass on the committed run", X.checksOf(res).every((c) => c.ok));
    ok("!! *** the bottom lines: -0.02 and -0.04 hold, -0.06 pays more, and the largest that holds and keeps is -0.04 (+0.0163) ***", J(X.bottomLines(res)) === J(["L-0.02 HOLDS ITS HULL UNDER BIAS", "L-0.04 HOLDS ITS HULL UNDER BIAS", "L-0.06 PAYS MORE UNDER BIAS", "THE LARGEST SHIFT THAT HOLDS ITS HULL UNDER BIAS AND KEEPS A GAIN IS LOW -0.04 (+0.0163 AT A SOUND GAUGE)"]));
    ok("!! the table: crushed under BIAS 0, 0, 1, 10; gains +0.0070, +0.0163, +0.0285 at REF; break-even for -0.04 97.25 / 19.25 / 4.62 and for -0.06 16.37 / 2.69 / 0.13",
        J(X.ARMS.map((a) => res[a].BIAS.crashed)) === J([0, 0, 1, 10]) && X.ARMS.every((a) => res[a].REF.crashed === 0 && res[a].REF.stranded === 0 && res[a].BIAS.stranded === 0) &&
        nr(r("L-0.02").gain.mean, 0.0070) && nr(r("L-0.04").gain.mean, 0.0163) && nr(r("L-0.06").gain.mean, 0.0285) && J(r("L-0.04").breakEven.map((v) => +v.toFixed(2))) === J([97.25, 19.25, 4.62]) && J(r("L-0.06").breakEven.map((v) => +v.toFixed(2))) === J([16.37, 2.69, 0.13]));
    const nl = fs.readFileSync(new URL("../../brain/NEEDS_AND_LIMITS.md", import.meta.url), "utf8"), i = nl.indexOf("## Round 36, RESULT"), t = i > 0 ? nl.slice(i) : "";
    ok("  the RESULT note states the choice, the 57 percent and 9 of 10, and that this round chooses nothing", /LOW -0\.04 \(\+0\.0163 AT A SOUND GAUGE\)/.test(t) && /57 percent/.test(t) && /9 of its 10 crushed boats/.test(t) && /This round chooses nothing/.test(t));
}

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: what the shifts do on the registered dives, and what a crushed boat is worth.`);
process.exitCode = fails ? 1 : 0;
