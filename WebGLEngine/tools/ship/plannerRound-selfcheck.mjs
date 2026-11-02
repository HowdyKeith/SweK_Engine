// WebGLEngine/tools/ship/plannerRound-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerRound-selfcheck.mjs      (about 10 s: the audits and the twin fly 100-second dives in the rows that do not depend on a dive's length)
//
// THE GATE OF tools/ship/plannerRound.mjs (Round 11 of brain/NEEDS_AND_LIMITS.md, registered first, amended before any audit seed was read).
//   1 SETS      audits 761-784, 801-824, 841-864 of far and both (48 dives each), disjoint from every seed of Rounds 1-10; the arms; the oracle is not a flyable arm.
//   2 ARMS      PLANNER-NEAREST is TUNED-R8 dive for dive; the arms need the tuned rule's parameters; unknown arms refused; the twin arm is the twin (it differs from nearest on a dive known to gain).
//   3 SIMULATOR the twin's rollout is the real noise-free dive on five dives, those with unreachable stations among them (plain 241, far 272, both 273, deep 242, far 271).
//   4 AUDITS    (small ranges, one kind) every arm once on the three ranges; the report: checks first, a failed check says NOT WEIGHED, the verdict compares the twin with TUNED-R8, the oracle is reported, the share of the gap, the replans line; bottomLine's table.
//   5 SOURCE    the audit seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: that the twin beats the tuned rule on the audits (that is the experiment).
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
import * as X from "./plannerRound.mjs";
console.log("plannerRound-selfcheck -- the Round 11 audits\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744)]);
    const aud = [...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864)];
    ok("!! the audits are 761-784, 801-824, 841-864 in that order, 48 dives each of far and both, and share no seed with Rounds 1-10", J(X.AUDIT_RANGES) === J({ Y1: [761, 784], Y2: [801, 824], Y3: [841, 864] }) && J(X.AUDIT_NAMES) === J(["Y1", "Y2", "Y3"]) && aud.every((s) => !prior.has(s)) && Object.values(X.AUDIT_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 48) && J(X.HARD) === J(["far", "both"]));
    ok("!! the arms are pinned; the oracle is in the list but not flyable", J(X.ARMS) === J(["TUNED-R8", "PLANNER-NEAREST", "PLANNER-TWIN", "ORACLE-ORDER"]) && (() => { try { X.pilotOf("ORACLE-ORDER", { r8: R8 }); return false; } catch (e) { return /oracleRuns/.test(e.message); } })());
}
sec("2. ARMS");
{
    const fp = (arm, sc) => T.evaluate(X.pilotOf(arm, { r8: R8 }), [sc], { gauge: T.GAUGE }).runs[0].fingerprint, thr = (f) => { try { f(); return null; } catch (e) { return e.message; } };
    const f272 = T.scenario(272, "far"), f271 = T.scenario(271, "far");
    ok("!! PLANNER-NEAREST is TUNED-R8 dive for dive", fp("PLANNER-NEAREST", f272) === fp("TUNED-R8", f272));
    const twinRun = X.scoreOf("PLANNER-TWIN", { r8: R8 }, [f271]).runs[0];
    ok("!! the twin differs from nearest-first on a dive known to gain (far 271: 0.70 to 0.85) and scores 0.85 there", twinRun.fingerprint !== fp("TUNED-R8", f271) && Math.abs(twinRun.score - 0.85) < 1e-9);
    ok("!! the arms need the tuned rule's parameters; unknown arms are refused", /parameters \(r8\)/.test(thr(() => X.pilotOf("TUNED-R8"))) && /unknown arm/.test(thr(() => X.pilotOf("NOPE", { r8: R8 }))));
}
sec("3. SIMULATOR");
{
    const rows = [["plain", 241], ["far", 272], ["both", 273], ["deep", 242], ["far", 271]].map(([k, s]) => { const r = X.rolloutIdentity(R8, T.scenario(s, k)); return [k + s, r.rollout, r.real]; });
    ok("!! the twin's rollout from the start is the real noise-free dive, to 1e-9, on five dives (two with unreachable stations)", rows.every(([, a, b]) => Math.abs(a - b) < 1e-9), rows.map(([n, a]) => n + " " + a.toFixed(3)).join("; "));
}
sec("4. AUDITS");
{
    X.setFlight({ seconds: 100 });   // the rows from here on do not depend on how long a dive runs
    const small = { Y1: [761, 761], Y2: [801, 801], Y3: [841, 841] }, au = X.audits({ r8: R8 }, { ranges: small, kinds: ["far"] });
    ok("!! the audits fly every arm on the three ranges asked for (1 dive each here), the oracle among them", J(Object.keys(au)) === J(["Y1", "Y2", "Y3"]) && Object.values(au).every((a) => J(Object.keys(a)) === J(X.ARMS) && a["TUNED-R8"].runs.length === 1 && a["ORACLE-ORDER"].runs.length === 1));
    const mk = (f, fpr = "f") => ({ runs: [0, 1, 2].flatMap(() => X.HARD.map((kind) => ({ kind, score: f, fingerprint: fpr }))), score: f, crashed: 0, stranded: 0 });
    const aud = (s) => Object.fromEntries(X.AUDIT_NAMES.map((n) => [n, Object.fromEntries(X.ARMS.map((a) => [a, mk(s[a])]))]));
    const sc = { "TUNED-R8": 0.8, "PLANNER-NEAREST": 0.8, "PLANNER-TWIN": 0.85, "ORACLE-ORDER": 0.9 }, L = X.report(aud(sc), { plans: 7.5 });
    ok("!! the verdict line compares the twin with TUNED-R8 (+0.050 on all three audits = BEATS) and the oracle (+0.100) is reported", L.some((l) => /^PLANNER-TWIN against TUNED-R8: \+0\.050 WINS \| \+0\.050 WINS \| \+0\.050 WINS = BEATS/.test(l)) && L.some((l) => /^ORACLE-ORDER against TUNED-R8 .*\+0\.100 WINS/.test(l)));
    ok("!! the share of the oracle gap (0.50 each), the replans line, and a generated BOTTOM LINE", L.some((l) => /^share of the oracle gap closed by the twin: 0\.50 \| 0\.50 \| 0\.50/.test(l)) && L.some((l) => /^replans per dive \(twin\): 7\.50/.test(l)) && /^BOTTOM LINE: A PLANNED ORDER \(WITH A PERFECT MODEL OF THE BOAT\) IMPROVES THE TUNED RULE/.test(L[L.length - 1]) && !X.report(aud(sc), {}).some((l) => /^replans/.test(l)));
    ok("!! a twin no better than the rule reads NO GAIN; a worse one reads HURTS", /BOTTOM LINE: NO GAIN OVER THE TUNED RULE/.test(X.report(aud({ ...sc, "PLANNER-TWIN": 0.8 }), {}).at(-1)) && /BOTTOM LINE: HURTS/.test(X.report(aud({ ...sc, "PLANNER-TWIN": 0.7 }), {}).at(-1)));
    ok("!! bottomLine's table: BEATS improves, LOSES hurts, TIES is no gain", /IMPROVES/.test(X.bottomLine("BEATS")) && X.bottomLine("LOSES") === "HURTS" && X.bottomLine("TIES") === "NO GAIN OVER THE TUNED RULE");
    const badId = aud(sc); badId.Y2["PLANNER-NEAREST"] = mk(0.8, "other"); const LB = X.report(badId, {});
    ok("!! a FAILED identity check prints FAIL, says NOT WEIGHED, and the bottom line says so", LB.some((l) => /FAIL IDENTITY Y2/.test(l)) && LB.some((l) => /NOT WEIGHED\./.test(l)) && /BOTTOM LINE: NOT WEIGHED/.test(LB.at(-1)));
    const badOr = aud(sc); badOr.Y3["ORACLE-ORDER"] = mk(0.7);
    ok("!! an oracle below the tuned rule on a dive fails its check; clean audits pass every check", X.checksOf(badOr).find((c) => c.name === "ORACLE Y3").ok === false && X.checksOf(aud(sc)).every((c) => c.ok));
    ok("!! gapShare is (a - base) / (oracle - base), null when the oracle gains nothing", Math.abs(X.gapShare(0.85, 0.8, 0.9) - 0.5) < 1e-12 && X.gapShare(0.8, 0.8, 0.8) === null);
    ok("!! plansOf counts the twin's replans per dive on a set (a whole-number mean on one dive, at least 1)", (() => { const v = X.plansOf({ r8: R8 }, [T.scenario(241, "plain")]); return Number.isInteger(v) && v >= 1; })());
    X.setFlight({});
}
sec("5. SOURCE");
{
    const code = fs.readFileSync(new URL("./plannerRound.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"), re = /\b(?:76[1-9]|77[0-9]|78[0-4]|80[1-9]|81[0-9]|82[0-4]|84[1-9]|85[0-9]|86[0-4])\b/g;
    ok("!! the audit seeds appear in ONE place and no function mentions them", (code.match(re) || []).length === 6);
    ok("!! the library reads no clock, no random number and no file", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
