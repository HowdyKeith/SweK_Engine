// WebGLEngine/tools/ship/plannerTolerance-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerTolerance-selfcheck.mjs      (about 13 s: a handful of 100-second dives)
//
// THE GATE OF tools/ship/plannerTolerance.mjs (Round 13 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS        1101-1148 and 1161-1208 of far and both (96 dives each, 192 in all), disjoint from every seed of Rounds 1-12; 32 arms in the registered order: TUNED-R8, TWIN-ROUND11, TWIN-EXACT, 24 single arms, 4 combined, the oracle.
//   2 ERRORS      every arm name is the error the registration says (DRAG-20 is drag -0.2; ALL-OPTIMISTIC-20 is drag -0.2, drain -0.2, charge +0.2, start +0.2; ALL-PESSIMISTIC the signs reversed); an unknown name is refused.
//   3 VERDICTS    KEEPS / LOSES / HURTS per arm on synthetic dives; the tolerance of a parameter and sign (stops at the first level that does not keep, even if a larger one does).
//   4 BOTTOM LINE survives-20 / within-w (weakest named) / fragile-at-5, the HURTS tail, the tolerance 0 case.
//   5 CHECKS      identity of the zero-error seat with the Round 11 twin, the oracle floor, TWIN-EXACT real; a failed check says NOT WEIGHED.
//   6 REPORT      the lines, the shares, the combined arms.
//   7 FLIGHT      real 100-second dives: the zero-error arm equals the Round 11 twin, a heavy-error arm is a different pilot, the oracle runs, the sets come back as V1 and V2.
//   8 SOURCE      the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: how much model error the twin tolerates (that is the experiment).
// SABOTAGE LOG (49 mutants of tools/ship/plannerTolerance.mjs, run against a copy of this gate): 11 went 0 red on the first pass. Eight got rows -- the oracle flown through oracleRuns and not as the tuned rule (strictly above it on 1101 far, 0.85 against 0.25), the noisy gauge and the default kinds (far and both) on a real flight, the EXACT IS REAL row reading TWIN-EXACT and not the Round 11 twin, the oracle floor at 1e-12 (a tie and 1e-13 pass, 1e-9 breaks), a row for every one of the 28 arms in the report, the oracle line reading TUNED-R8, and the verdict pooling both sets (the mutant string was rewritten once to match the source). Three are EQUIVALENT: a no-op arm test I wrote as a control, and two orderings of the hurts and keeps tests (the readings are exclusive, so the order cannot change a verdict). All 49 are red or said above.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
import * as T from "../../brain/needsTask.mjs";
import * as X from "./plannerTolerance.mjs";
console.log("plannerTolerance-selfcheck -- the Round 13 tolerance sweep\n");
const code = fs.readFileSync(new URL("./plannerTolerance.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048)]);
    const seeds = [...rangeOf(1101, 1148), ...rangeOf(1161, 1208)];
    ok("!! the sets are V1 1101-1148 and V2 1161-1208, 96 dives each of far and both (192 in all), and share no seed with Rounds 1-12", J(X.SET_RANGES) === J({ V1: [1101, 1148], V2: [1161, 1208] }) && J(X.SET_NAMES) === J(["V1", "V2"]) && seeds.every((s) => !prior.has(s)) && Object.values(X.SET_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 96) && J(X.HARD) === J(["far", "both"]));
    ok("!! the parameters (DRAG, DRAIN, CHARGE, START), the levels (5, 10, 20), the signs (-, +) and the combined levels (10, 20) are the registered ones", J(X.PARAMS) === J(["DRAG", "DRAIN", "CHARGE", "START"]) && J(X.LEVELS) === J([5, 10, 20]) && J(X.SIGNS) === J(["-", "+"]) && J(X.COMBINED_LEVELS) === J([10, 20]));
    ok("!! 24 distinct single arms in the order parameter, sign, level (DRAG-5 first, START+20 last); 4 combined (optimistic 10, 20, pessimistic 10, 20)", X.singleArms().length === 24 && new Set(X.singleArms()).size === 24 && X.singleArms()[0] === "DRAG-5" && X.singleArms()[23] === "START+20" && X.singleArms()[3] === "DRAG+5" && J(X.combinedArms()) === J(["ALL-OPTIMISTIC-10", "ALL-OPTIMISTIC-20", "ALL-PESSIMISTIC-10", "ALL-PESSIMISTIC-20"]));
    ok("!! the arms are TUNED-R8, TWIN-ROUND11, TWIN-EXACT, the 24, the 4, then ORACLE-ORDER: 32", X.ARMS.length === 32 && J(X.ARMS.slice(0, 3)) === J(["TUNED-R8", "TWIN-ROUND11", "TWIN-EXACT"]) && J(X.ARMS.slice(3, 27)) === J(X.singleArms()) && J(X.ARMS.slice(27, 31)) === J(X.combinedArms()) && X.ARMS[31] === "ORACLE-ORDER");
}
sec("2. ERRORS");
{
    const e = X.errFor;
    ok("!! DRAG-20 is drag -0.2; START+5 is start +0.05; CHARGE+10 is charge +0.1; DRAIN-5 is drain -0.05; each touches one key only", J(e("DRAG-20")) === J({ drag: -0.2 }) && J(e("START+5")) === J({ start: 0.05 }) && J(e("CHARGE+10")) === J({ charge: 0.1 }) && J(e("DRAIN-5")) === J({ drain: -0.05 }));
    ok("!! ALL-OPTIMISTIC-20 is drag -0.2, drain -0.2, charge +0.2, start +0.2 and ALL-PESSIMISTIC-10 the reverse at 0.1", J(e("ALL-OPTIMISTIC-20")) === J({ drag: -0.2, drain: -0.2, charge: 0.2, start: 0.2 }) && J(e("ALL-PESSIMISTIC-10")) === J({ drag: 0.1, drain: 0.1, charge: -0.1, start: -0.1 }));
    ok("!! TWIN-EXACT is no error; every perturbed arm's error has a nonzero entry; the 28 names all parse", J(e("TWIN-EXACT")) === "{}" && X.singleArms().every((a) => Object.values(e(a)).filter((v) => v !== 0).length === 1) && X.combinedArms().every((a) => Object.values(e(a)).filter((v) => v !== 0).length === 4));
    const thr = (a) => { try { e(a); return false; } catch { return true; } };
    ok("!! an unknown name, a level that was not registered (DRAG+7) and TUNED-R8 are refused", thr("SPEED+5") && thr("DRAG+7") && thr("TUNED-R8") && thr("DRAG5") && thr("ALL-OPTIMISTIC-5"));
}
// synthetic audits: 8 dives per set, all far; TUNED-R8 scores 0.5 + a wobble so the paired difference has a standard error
const mkRuns = (scores) => ({ runs: scores.map((score, i) => ({ kind: i % 2 ? "both" : "far", score, fingerprint: "f" + i })), score: scores.reduce((a, b) => a + b, 0) / scores.length, crashed: 0, stranded: 0 });
const BASE = [0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6];
const withDiff = (d) => mkRuns(BASE.map((b, i) => b + d[i % d.length]));
const KEEP = [0.1, 0.1, 0.1, 0.12, 0.1, 0.1, 0.08, 0.1], LOSE = [0.05, -0.05, 0.05, -0.05, 0.04, -0.04, 0.05, -0.05], HURT = [-0.1, -0.1, -0.1, -0.12, -0.1, -0.1, -0.08, -0.1];
const synth = (table, exact = KEEP) => {
    const au = {};
    for (const n of X.SET_NAMES) {
        au[n] = { "TUNED-R8": mkRuns(BASE), "TWIN-ROUND11": withDiff(exact), "TWIN-EXACT": withDiff(exact), "ORACLE-ORDER": withDiff(KEEP.map((x) => x + 0.05)) };
        for (const a of [...X.singleArms(), ...X.combinedArms()]) au[n][a] = withDiff(table[a] || KEEP);
    }
    return au;
};

sec("3. VERDICTS");
{
    const au = synth({ "DRAG-5": LOSE, "DRAG-10": HURT, "DRAG+5": KEEP });
    const v = (a) => X.verdictOf(au, a);
    ok("!! a steady gain KEEPS, a wobble around zero LOSES, a steady loss HURTS", v("DRAG+5").verdict === "KEEPS" && v("DRAG-5").verdict === "LOSES" && v("DRAG-10").verdict === "HURTS");
    ok("!! the verdict carries the pooled mean, the se and the counts of the 16 dives (8 per set, two sets)", v("DRAG+5").n === 16 && Math.abs(v("DRAG+5").mean - 0.1) < 0.01 && v("DRAG+5").se > 0 && v("DRAG+5").better === 16 && v("DRAG-10").worse === 16 && v("DRAG-5").arm === "DRAG-5");
    const just = synth({ "DRAG+5": [0.02, 0, 0, 0, 0, 0, 0, 0] });
    ok("!! a gain under 2 se is not REAL: one dive in sixteen up by 0.02 LOSES", X.verdictOf(just, "DRAG+5").verdict === "LOSES");
    const t = synth({ "DRAG-5": KEEP, "DRAG-10": KEEP, "DRAG-20": LOSE, "DRAIN-5": LOSE, "DRAIN-10": KEEP, "DRAIN-20": KEEP, "CHARGE-5": KEEP, "CHARGE-10": LOSE, "CHARGE-20": KEEP, "START-5": HURT });
    ok("!! the tolerance is the largest level reached without a break: DRAG- 10, DRAIN- 0 (the first level fails, though 10 and 20 keep), CHARGE- 5 (10 fails, 20 keeping does not count), START- 0, an untouched sign 20", X.toleranceOf(t, "DRAG", "-") === 10 && X.toleranceOf(t, "DRAIN", "-") === 0 && X.toleranceOf(t, "CHARGE", "-") === 5 && X.toleranceOf(t, "START", "-") === 0 && X.toleranceOf(t, "DRAG", "+") === 20 && X.toleranceOf(t, "START", "+") === 20);
    ok("!! tolerances() lists the eight parameter-sign pairs in the order DRAG-, DRAG+, DRAIN-, ... START+", J(X.tolerances(t).map((x) => x.param + x.sign)) === J(["DRAG-", "DRAG+", "DRAIN-", "DRAIN+", "CHARGE-", "CHARGE+", "START-", "START+"]) && X.tolerances(t).length === 8 && X.tolerances(t)[0].tolerance === 10);
}
sec("4. BOTTOM LINE");
{
    ok("!! every single arm keeping is SURVIVES 20 PERCENT, and the combined arms do not enter it", X.bottomLine(synth({ "ALL-OPTIMISTIC-20": HURT, "ALL-PESSIMISTIC-10": LOSE })) === "THE GAIN SURVIVES 20 PERCENT ERROR IN EVERY PARAMETER");
    ok("!! one break at 20 percent names the weakest pair: WITHIN 10 PERCENT (weakest: CHARGE+)", X.bottomLine(synth({ "CHARGE+20": LOSE })) === "THE GAIN NEEDS THE MODEL WITHIN 10 PERCENT (weakest: CHARGE+)");
    ok("!! two pairs at the minimum are both named, in table order; a pair with a larger tolerance is not", X.bottomLine(synth({ "DRAG-10": LOSE, "START+10": LOSE, "DRAIN-20": LOSE })) === "THE GAIN NEEDS THE MODEL WITHIN 5 PERCENT (weakest: DRAG-, START+)");
    ok("!! a break at 5 percent is FRAGILE and names the pair", X.bottomLine(synth({ "DRAIN+5": LOSE })) === "THE GAIN IS FRAGILE: IT FAILS AT 5 PERCENT ON DRAIN+");
    ok("!! a HURTS arm is named in a tail on every kind of line: survives cannot carry it (a hurting arm does not keep), so it rides the within and fragile lines", X.bottomLine(synth({ "CHARGE+20": HURT })) === "THE GAIN NEEDS THE MODEL WITHIN 10 PERCENT (weakest: CHARGE+); HURTS: CHARGE+20" && X.bottomLine(synth({ "DRAG-5": HURT, "DRAG-10": HURT })) === "THE GAIN IS FRAGILE: IT FAILS AT 5 PERCENT ON DRAG-; HURTS: DRAG-5, DRAG-10");
}
sec("5. CHECKS");
{
    const good = synth({}), rows = (au) => X.checksOf(au);
    ok("!! four check rows per audit pair plus the exact row: 2 identity, 2 oracle, 1 exact-real = 5, all passing on a clean audit", rows(good).length === 5 && rows(good).every((c) => c.ok) && J(rows(good).map((c) => c.name)) === J(["IDENTITY V1", "ORACLE V1", "IDENTITY V2", "ORACLE V2", "EXACT IS REAL"]));
    const badId = synth({}); badId.V2["TWIN-EXACT"].runs[3].fingerprint = "other";
    ok("!! a different dive from TWIN-EXACT breaks IDENTITY V2 and only that one", J(rows(badId).filter((c) => !c.ok).map((c) => c.name)) === J(["IDENTITY V2"]));
    const badOr = synth({}); badOr.V1["ORACLE-ORDER"].runs[2].score = 0.1;
    ok("!! an oracle below TUNED-R8 on one dive breaks ORACLE V1 and only that one", J(rows(badOr).filter((c) => !c.ok).map((c) => c.name)) === J(["ORACLE V1"]));
    const eq = synth({}); eq.V1["ORACLE-ORDER"].runs[2].score = eq.V1["TUNED-R8"].runs[2].score; eq.V2["ORACLE-ORDER"].runs[1].score = eq.V2["TUNED-R8"].runs[1].score - 1e-13;
    const under = synth({}); under.V2["ORACLE-ORDER"].runs[1].score = under.V2["TUNED-R8"].runs[1].score - 1e-9;
    ok("!! the oracle floor allows an exact tie and a difference of 1e-13 (float noise), and breaks at 1e-9 below", rows(eq).every((c) => c.ok) && J(rows(under).filter((c) => !c.ok).map((c) => c.name)) === J(["ORACLE V2"]));
    const r11Only = synth({}); for (const n of X.SET_NAMES) r11Only[n]["TWIN-ROUND11"] = withDiff(LOSE);
    ok("!! the EXACT IS REAL row reads TWIN-EXACT and not the Round 11 twin (a Round 11 arm with no gain does not break it)", rows(r11Only).find((c) => c.name === "EXACT IS REAL").ok === true);
    const noGain = synth({}, LOSE);
    ok("!! a TWIN-EXACT with no real gain on these seeds breaks EXACT IS REAL", J(rows(noGain).filter((c) => !c.ok).map((c) => c.name)) === J(["EXACT IS REAL"]));
}
sec("6. REPORT");
{
    const au = synth({ "DRAIN-5": LOSE, "START+10": HURT, "ALL-OPTIMISTIC-20": LOSE }), L = X.report(au, { plans: 6.5 }), txt = L.join("\n");
    ok("!! the head names both sets and their seeds; the five checks come first and pass", /^ROUND 13/.test(L[0]) && L[0].includes("V1 1101-1148") && L[0].includes("V2 1161-1208") && L.slice(1, 6).every((l) => /^  PASS /.test(l)));
    ok("!! TWIN-EXACT's pooled line, one tolerance line per parameter and sign (8), each followed by its three levels", /TWIN-EXACT minus TUNED-R8: \+0\.10/.test(txt) && (txt.match(/: tolerance \d+ percent/g) || []).length === 8 && /DRAIN-: tolerance 0 percent/.test(txt) && /START\+: tolerance 5 percent/.test(txt) && /DRAG-: tolerance 20 percent/.test(txt) && /^  START\+10 /m.test(txt));
    ok("!! every arm has its row: 24 single arms and 4 combined (28 rows), and the oracle line reads the oracle against TUNED-R8 (+0.15 on this audit)", (txt.match(/^  (DRAG|DRAIN|CHARGE|START)[-+](5|10|20) /gm) || []).length === 24 && (txt.match(/^  ALL-(OPTIMISTIC|PESSIMISTIC)-(10|20) /gm) || []).length === 4 && /ORACLE-ORDER minus TUNED-R8 .*: \+0\.1[45]/.test(txt));
    ok("!! each arm row has its verdict and its share of the exact gain (1.00 for a steady gain, 0.00 for a wobble, negative for a loss)", /DRAIN-5 .*LOSES\s+share of exact gain 0\.0/.test(txt) && /START\+10 .*HURTS\s+share of exact gain -1\.0/.test(txt) && /DRAG-5 .*KEEPS\s+share of exact gain 1\.00/.test(txt));
    ok("!! the combined arms have their own block, the oracle and the replans lines follow, the bottom line is last and carries the HURTS tail", /combined arms \(reported, not in the bottom line\):\n  ALL-OPTIMISTIC-10 /.test(txt) && /ALL-OPTIMISTIC-20 .*LOSES/.test(txt) && /ORACLE-ORDER minus TUNED-R8/.test(txt) && /replans per dive \(weakest arm\): 6\.50/.test(txt) && L[L.length - 1] === "BOTTOM LINE: THE GAIN IS FRAGILE: IT FAILS AT 5 PERCENT ON DRAIN-; HURTS: START+10" || L[L.length - 1].startsWith("BOTTOM LINE: THE GAIN NEEDS"));
    const bad = synth({}); bad.V1["TWIN-EXACT"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on the bottom line", Lb.some((l) => /^  FAIL IDENTITY V1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)");
    ok("!! with no replans the line is absent; with no exact gain the shares read n/a", !X.report(au).join("\n").includes("replans per dive") && X.report(synth({}, LOSE)).join("\n").includes("share of exact gain n/a"));
}
sec("7. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { V1: [1101, 1102], V2: [1161, 1162] }, fly = (a) => X.flySets(a, R8, { ranges, kinds: ["far"] });
    const exact = fly("TWIN-EXACT"), r11 = fly("TWIN-ROUND11"), heavy = fly("ALL-OPTIMISTIC-20"), tuned = fly("TUNED-R8");
    ok("!! flySets returns V1 and V2, two dives each", J(Object.keys(exact)) === J(["V1", "V2"]) && exact.V1.runs.length === 2 && exact.V2.runs.length === 2);
    ok("!! TWIN-EXACT equals the Round 11 twin dive for dive, on 100-second dives", ["V1", "V2"].every((n) => exact[n].runs.every((r, i) => r.fingerprint === r11[n].runs[i].fingerprint)));
    ok("!! TUNED-R8 is a different pilot from the twin on the same dives (the fingerprints are not all the same as the twin's) or the same score: both ran", tuned.V1.runs.length === 2 && Number.isFinite(tuned.V1.score));
    ok("!! the oracle flies through oracleRuns (not the tuned rule): it is at least TUNED-R8 on every dive and strictly above it on 1101 far (0.85 against 0.25), with different dives", (() => { const o = X.flySets("ORACLE-ORDER", R8, { ranges, kinds: X.HARD }), tu = X.flySets("TUNED-R8", R8, { ranges, kinds: X.HARD }); return ["V1", "V2"].every((n) => o[n].runs.every((r, i) => r.score >= tu[n].runs[i].score - 1e-12)) && o.V1.runs[0].score === 0.85 && tu.V1.runs[0].score === 0.25 && o.V1.runs[0].fingerprint !== tu.V1.runs[0].fingerprint; })());
    ok("!! the default kinds are far and both (four dives for two seeds, far then both) and the dives carry the noisy gauge (the same dives as T.evaluate with T.GAUGE; the noise-free dive is different or equal only by luck of the seed)", (() => { const d = X.flySets("TUNED-R8", R8, { ranges }), direct = T.evaluate(X.pilotOf("TUNED-R8", { r8: R8 }), T.setOf(X.HARD, 1101, 1102), { gauge: T.GAUGE, seconds: 100 }), free = T.evaluate(X.pilotOf("TUNED-R8", { r8: R8 }), T.setOf(X.HARD, 1101, 1102), { gauge: null, seconds: 100 }); return J(d.V1.runs.map((r) => r.kind)) === J(["far", "far", "both", "both"]) && d.V1.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint) && d.V1.runs.some((r, i) => r.fingerprint !== free.runs[i].fingerprint); })());
    ok("!! pilotOf asks for the tuned rule's parameters, and an unknown arm is refused", (() => { try { X.pilotOf("TWIN-EXACT", {}); return false; } catch { return true; } })() && (() => { try { X.pilotOf("SPEED+5", { r8: R8 }); return false; } catch { return true; } })());
    ok("!! the assembled audit keys sets then arms: assemble({A: {V1, V2}}) is {V1: {A}, V2: {A}}", J(Object.keys(X.assemble({ A: exact, B: tuned }).V1)) === J(["A", "B"]) && X.assemble({ A: exact }).V2.A === exact.V2);
    X.setFlight({});
    ok("!! heavy error is flown without throwing (ALL-OPTIMISTIC-20 returned two dives per set)", heavy.V1.runs.length === 2);
}
sec("8. SOURCE");
{
    ok("!! the seeds 1101, 1148, 1161 and 1208 appear once each, in SET_RANGES", ["1101", "1148", "1161", "1208"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
