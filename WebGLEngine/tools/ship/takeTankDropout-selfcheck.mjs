// WebGLEngine/tools/ship/takeTankDropout-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeTankDropout-selfcheck.mjs      (about 8 s)
//
// THE GATE OF tools/ship/takeTankDropout.mjs: the compass dropout flown in the tank over the memory arms (the autopilot, the navigator, the leaky unit and its lesion, the plain-net champions) with a copy of the switchboard's loop, read as paired differences. Every number is worked out by hand on small fixtures or pinned from the flights.
//   1 THE ARGUMENTS   the defaults (12 ids from 1, 160 s, P/B/mn:3), each flag, in any order; every fault named (an unknown flag, no value, a flag twice, ids outside 2 to 200 or not whole, from outside 1 to 1,000,000, seconds outside 20 to 600, an empty or repeated champion), the edges taken, none for no plain net.
//   2 THE STUDY FILE championsOf keeps the mn and mg lines that carry weights (a comparator, a reference record and a champion without weights are left out), numbers a bad line, and finds all 48 champions in the real file.
//   3 THE ARMS        the order and ids (autopilot, navigator, leaky-unit, leaky-unit-off, one plain net per spec), the events (the navigator under the tank's own, the rest under the dropout), the controls, the lesion's weights, the navigator on the autopilot's entry; an unknown champion refused by name.
//   4 THE FLIGHT      the board's loop on real tanks: the autopilot's settled dark heading error on ids 1 to 4 at 160 s and at 60 s, the navigator's, with the 1,919 dark ticks of 160 s (778 of 60 s); the arm's register hook called; an event with no dark ticks refused; a flight twice the same.
//   5 THE STATISTICS the paired difference by hand ([-0.5, 0, 0.5]: mean 0, se 0.288675; [-1, -1.2, -0.8, -1.1]: mean -1.025, se 0.085391), the counts, the 2 se edge in both directions, a zero-spread difference decisive, a mean under 1e-9 a tie.
//   6 THE RUN AND THE REPORT   three ids from 5 at 60 s: the lesion equals the autopilot exactly, the navigator and the unit sit near each other, the same twice; the report of a fixture by hand, line for line, with the missing control and the reference line.
//   7 THE COMMAND    exit 1 for a usage error and 2 for a missing file, a bad line or an unknown champion; the study file is read once, and not at all for --plain none; the flags reach the flights; the real file runs (3 ids, 40 s) and so does the file as a command (a child process, exit codes and the first line).
//   8 THE SOURCE     pure but for the one file it reads; the imports.
// SABOTAGED -- 252 mutants of tools/ship/takeTankDropout.mjs, each run alone in a scratch tree against this gate, four at a time: 220 red BY NAME, 17 THREW, 2 NOPASS (the gate never ran: the mutated main guard fired on import and exited), 1 CRASH, 1 TIMEOUT (a tick of 0 never ends): 241 detected; 10 EQUIVALENT, said so, one each below.
//   190 mechanical (every comparison, boolean, arithmetic operator and number +-1 on the code lines) and 62 written by hand: every flag and every refusal of the arguments (--from a flag, duplicates, a missing value, the shape of ids, from and seconds, none, an empty or repeated champion); the champion filter (weights not required, mg refused, comparators accepted, blank lines parsed); the arms (the navigator under the
//   dropout or with no control, the lesion at gain 1 or with a control, the plain net with one control, the unknown champion unchecked, the autopilot or the unit under the navigator event); the flight (the register hook, the event ignored, the id fixed, the error not wrapped, no fallback to the dark ticks or only that, no check for no dark ticks); the run (the start id, lost, the controls, the injected flight ignored or replaced);
//   the statistics (better and worse swapped, lengths unchecked, the labels swapped, no tie band, the sign of zero, the mean a sum, the se not divided by n, the population variance); the report (the name column, the reference needing either arm or against the autopilot, a missing control silent, the counts, the lost count, the header's seconds); the command (the file read for --plain none, the start id not passed, no newline, the
//   file name, the missing-file message, the main guard never true, the exit code dropped, the defaults not frozen, the usage line without --from, a usage error exiting 2, a data error exiting 1).
//   FIRST RUN, 30 ZERO-RED OF 256: dead code CUT (the two sign conjuncts of readingOf, implied by the 2 se test since se >= 0); the SAME-TOLERANCE EDGE was never offered at exactly 1e-9 (a difference of exactly 1e-9 and of -1e-9, a mean of exactly 1e-9: rows added); a list of one or two ids and of none (the se of two ids, the mean of nothing: rows); the messages of the refusals were read
//   by pattern and not whole (the usage line, the champion list message, the missing-file, unknown-champion and bad-line messages: now equal to the text); the child process was only ever started WITH arguments (a guard on `process.argv[1]` truthiness could not be seen: a run with none, and an import by `node -e`, where argv[1] is absent, rows added); `lost` could not be made true by any fixture (the flight is now
//   an argument of run, and a fake loses a sub); the fallback to the dark ticks needed a run with no settled tick (id 4 at 20 s: pinned). The 10 EQUIVALENT: wrap at exactly +-pi (`>` to `>=`, `<=` to `<`: only |wrap| is used); the two ways to write the sum of squares (`(y - m) * (y + m)` sums to the same as `(y - m)^2` about the mean: an identity); the name, the hue and the `local` flag of the tank
//   entry (the tank only draws with them: no flight reads them); the first value of `age` (a retarget on the first tick sets it); `age >= 12` to `age > 12` (360 ticks of 1/30 sum to 11.999999999999968 in doubles, so no tick lands on 12).
// NOT CHECKED, said plainly: the numbers a default run prints (they are the flights', pinned for four ids above, and brain/BACKLOG_PICKUPS_2026-11-05.md quotes them); that the board's own loop is the same (it is not in this tree: the loop is a copy of f4b55956's dropoutTask).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as C from "./takeTankDropout.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol;
const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "../..");
console.log("takeTankDropout-selfcheck -- the dropout in the tank over the memory arms\n");
const REAL = fs.readFileSync(path.join(ENG, C.STUDY_FILE), "utf8"), RECS = C.championsOf(REAL);

sec("1. THE ARGUMENTS");
{
    const P = C.parseArgs;
    ok("!! the defaults: 12 ids from 1, 160 s, the plain net P/B/mn:3 (frozen)", J(P([])) === J({ ids: 12, from: 1, seconds: 160, plain: ["P/B/mn:3"] }) && J(C.DEFAULTS) === J({ ids: 12, from: 1, seconds: 160, plain: ["P/B/mn:3"] }) && Object.isFrozen(C.DEFAULTS) && Object.isFrozen(C.DEFAULTS.plain) && C.STUDY_FILE === "brain/rig-results/plainNetStudy.jsonl");
    ok("!! every flag, in any order: --ids 4 --from 9001 --seconds 100.5 --plain E/E/mn:0,P/B/mn:3", J(P(["--ids", "4", "--from", "9001", "--seconds", "100.5", "--plain", "E/E/mn:0,P/B/mn:3"])) === J({ ids: 4, from: 9001, seconds: 100.5, plain: ["E/E/mn:0", "P/B/mn:3"] }) && J(P(["--plain", "X", "--seconds", "20", "--from", "1", "--ids", "2"])) === J({ ids: 2, from: 1, seconds: 20, plain: ["X"] }));
    ok("!! --plain none is no plain net; the defaults are not shared between calls", J(P(["--plain", "none"]).plain) === "[]" && (P([]).plain.push("x"), J(P([]).plain) === '["P/B/mn:3"]'));
    const err = (a) => (P(a).error || "");
    ok("!! an unknown flag, a flag with no value and a flag twice are named", /not understood: --bogus/.test(err(["--bogus", "1"])) && /--ids needs a value/.test(err(["--ids"])) && /--plain needs a value/.test(err(["--ids", "3", "--plain"])) && /--ids given twice/.test(err(["--ids", "3", "--ids", "4"])) && /--seconds given twice/.test(err(["--seconds", "30", "--seconds", "40"])));
    ok("!! ids: 2 and 200 are taken; 1, 201, 3.5, -2, abc and a flag in its place are refused with the range", [["2", 2], ["200", 200]].every(([v, n]) => P(["--ids", v]).ids === n) && ["1", "201", "3.5", "-2", "abc", "--from", ""].every((v) => /--ids is a whole number from 2 to 200/.test(err(["--ids", v]))));
    ok("!! from: 1 and 1000000 are taken; 0, 1000001, x and 2.5 are refused", [["1", 1], ["1000000", 1000000]].every(([v, n]) => P(["--from", v]).from === n) && ["0", "1000001", "x", "2.5"].every((v) => /--from is a whole number from 1 to 1000000/.test(err(["--from", v]))));
    ok("!! seconds: 20, 600 and 33.25 are taken; 19, 19.99, 601, abc and -5 are refused", [["20", 20], ["600", 600], ["33.25", 33.25]].every(([v, n]) => P(["--seconds", v]).seconds === n) && ["19", "19.99", "601", "abc", "-5"].every((v) => /--seconds is a number from 20 to 600/.test(err(["--seconds", v]))));
    ok("!! plain: an empty member, an empty string and a champion twice are refused", ["a,,b", ",a", "a,", ""].every((v) => /comma-separated list of champion specs \(P\/B\/mn:3\), or none, got/.test(err(["--plain", v]))) && /names a champion twice/.test(err(["--plain", "a,a"])));
}

sec("2. THE STUDY FILE");
{
    const text = [J({ spec: "A/mn:0", family: "mn", weights: [1, 2] }), J({ spec: "cmp:x", family: "cmp", weights: [1] }), "", J({ spec: "refs:NP", family: "refs" }), J({ spec: "B/mg:1", family: "mg", weights: [3] }), J({ spec: "C/mn:2", family: "mn" }), "   "].join("\n");
    const m = C.championsOf(text);
    ok("!! championsOf keeps the mn and mg lines with weights, by spec, and leaves out a comparator, a reference record, a champion with no weights and the blank lines", J([...m.keys()]) === '["A/mn:0","B/mg:1"]' && m.get("A/mn:0").weights.length === 2);
    ok("!! a line that is not JSON is named by its number (blank lines counted): line 3 here", /line 3 of the study file is not JSON/.test(throws(() => C.championsOf(J({ spec: "A", family: "mn", weights: [1] }) + "\n\n{oops\n")) || "") && /line 1 of/.test(throws(() => C.championsOf("nope")) || "") && C.championsOf("").size === 0);
    ok("!! the real file holds the 48 champions, with the spec and weights the arms read", RECS.size === 48 && RECS.get("P/B/mn:3").weights.length === 589 && RECS.get("E/E/mn:0").weights.length === 85 && RECS.get("P/B/mg:0").weights.length === 1348);
}

sec("3. THE ARMS");
{
    const list = C.armsFor(RECS, ["P/B/mn:3", "E/E/mn:0"]);
    ok("!! the order and the ids: autopilot, navigator, leaky-unit, leaky-unit-off, plainnet-P/B/mn:3, plainnet-E/E/mn:0", J(list.map((x) => x.arm.id)) === '["autopilot","navigator","leaky-unit","leaky-unit-off","plainnet-P/B/mn:3","plainnet-E/E/mn:0"]');
    ok("!! the events: the navigator under the tank's navigator event, every other arm under the dropout", J(list.map((x) => x.event)) === '["dropout","navigator","dropout","dropout","dropout","dropout"]');
    ok("!! the controls: the autopilot and the lesion none, the navigator and the unit the autopilot, each plain net the autopilot and the unit", J(list.map((x) => x.arm.controls)) === '[[],["autopilot"],["autopilot"],[],["autopilot","leaky-unit"],["autopilot","leaky-unit"]]');
    ok("!! the autopilot and the navigator fly the autopilot's entry (circuit gfc, no weights); the unit [0.9999, 1] and the lesion [0.9999, 0] on circuit leaky; the plain nets their record's circuit and weights", J(list[0].arm.entry()) === J({ pilot: "autopilot", circuit: "gfc", weights: null }) && J(list[1].arm.entry()) === J(list[0].arm.entry()) && J(list[2].arm.entry()) === J({ pilot: "leaky", circuit: "leaky", weights: [0.9999, 1] }) && J(list[3].arm.entry()) === J({ pilot: "leaky", circuit: "leaky", weights: [0.9999, 0] }) && list[4].arm.entry().circuit === "plainnet:P/B/mn:3" && list[4].arm.entry().weights.length === 589 && list[5].arm.entry().weights.length === 85);
    ok("!! no plain net is four arms; an unknown champion is refused by name", C.armsFor(RECS, []).length === 4 && /no champion "X\/y\/z:9"/.test(throws(() => C.armsFor(RECS, ["X/y/z:9"])) || "") && /no champion "P\/B\/mn:3"/.test(throws(() => C.armsFor(new Map(), ["P/B/mn:3"])) || ""));
}

sec("4. THE FLIGHT, THE BOARD'S LOOP");
{
    const SHORT_ERR = 1.48168;   // id 4 at 20 s: the mean heading error over its 299 dark ticks
    const list = C.armsFor(RECS, []), A0 = list[0], NV = list[1], pins = (arm, ev, secs, ids) => ids.map((n) => C.flight(arm, n, ev, secs));
    const fa = pins(A0.arm, "dropout", 160, [1, 2, 3, 4]), fn = pins(NV.arm, "navigator", 160, [1, 2, 3, 4]);
    ok("!! the autopilot's settled dark heading error on ids 1 to 4 at 160 s is 0.99883, 0.45292, 0.85767, 0.71463 rad, with 1,919 dark ticks and never lost", fa.every((f, i) => near(f.err, [0.99883, 0.45292, 0.85767, 0.71463][i], 2e-5) && f.dark === 1919 && f.lost === false), J(fa.map((f) => +f.err.toFixed(5))));
    ok("!! the navigator's (its own event) is 0.85321, 0.21257, 0.95972, 0.50289 with the same 1,919 dark ticks", fn.every((f, i) => near(f.err, [0.85321, 0.21257, 0.95972, 0.50289][i], 2e-5) && f.dark === 1919), J(fn.map((f) => +f.err.toFixed(5))));
    const f60 = pins(A0.arm, "dropout", 60, [1, 2, 3, 4]);
    ok("!! at 60 s the autopilot reads 0.88637, 0.20725, 1.03884, 0.71183 over 778 dark ticks: the seconds reach the flight", f60.every((f, i) => near(f.err, [0.88637, 0.20725, 1.03884, 0.71183][i], 2e-5) && f.dark === 778), J(f60.map((f) => +f.err.toFixed(5))));
    const fd = C.flight(A0.arm, 1, "dropout");
    ok("!! the default length is 160 s (the same as the explicit one), and a flight is the same twice", fd.err === fa[0].err && C.flight(A0.arm, 1, "dropout", 160).err === fa[0].err);
    let registered = 0; const spy = { ...A0.arm, register: () => { registered++; } };
    C.flight(spy, 2, "dropout", 30);
    ok("!! the arm's register hook is called, once, on the fresh tank", registered === 1);
    ok("!! a lost sub is reported (the flight carries `lost`), and an event with no dark ticks is refused by name", typeof fa[0].lost === "boolean" && /arm autopilot id sb-1 has no dark ticks/.test(throws(() => C.flight(A0.arm, 1, null, 30)) || ""));
    const short = C.flight(A0.arm, 4, "dropout", 20);
    ok("!! a run with no settled dark tick (id 4 at 20 s: 299 dark ticks, none 12 s after a retarget) falls back to the mean over all its dark ticks", short.dark === 299 && Number.isFinite(short.err) && near(short.err, SHORT_ERR, 2e-5), String(short.err));
    ok("!! the id is sb-<n>: id 7 and id 1 fly different tanks", C.flight(A0.arm, 7, "dropout", 60).err !== f60[0].err);
}

sec("5. THE STATISTICS");
{
    const p = C.pairedErr([1, 2, 3], [1.5, 2, 2.5]);
    ok("!! [1, 2, 3] minus [1.5, 2, 2.5]: n 3, mean 0, se 0.288675, one lower, one higher, one the same", p.n === 3 && near(p.mean, 0, 1e-12) && near(p.se, 0.5 / Math.sqrt(3), 1e-9) && near(p.se, 0.288675, 1e-6) && p.better === 1 && p.worse === 1 && p.same === 1);
    const q = C.pairedErr([0, 0, 0, 0], [1, 1.2, 0.8, 1.1]);
    ok("!! differences [-1, -1.2, -0.8, -1.1]: mean -1.025, se 0.085391 (sd 0.170783 over 2), all four lower", near(q.mean, -1.025, 1e-12) && near(q.se, 0.0853913, 1e-6) && q.better === 4 && q.worse === 0 && q.same === 0);
    ok("!! the counts use a tolerance of 1e-9: a difference of 5e-10 is the same, 2e-9 is not", C.pairedErr([1 + 5e-10, 1], [1, 1 + 2e-9]).same === 1 && C.pairedErr([1 + 5e-10, 1], [1, 1 + 2e-9]).better === 1);
    ok("!! unequal lists are refused; one id has no spread (se 0)", /3 and 2 ids/.test(throws(() => C.pairedErr([1, 2, 3], [1, 2])) || "") && C.pairedErr([1], [2]).se === 0);
    const r = (mean, se) => C.readingOf({ mean, se });
    ok("!! BEATS needs the mean negative and more than 2 se below zero: -0.2000001 at se 0.1 beats, exactly -0.2 ties, -0.19 ties", r(-0.2000001, 0.1) === "BEATS" && r(-0.2, 0.1) === "TIES" && r(-0.19, 0.1) === "TIES");
    ok("!! IS BELOW is the same on the other side: +0.2000001 at se 0.1, +0.2 ties, +0.19 ties", r(0.2000001, 0.1) === "IS BELOW" && r(0.2, 0.1) === "TIES" && r(0.19, 0.1) === "TIES");
    ok("!! a mean of 0 ties at any se, a mean within 1e-9 of 0 ties even with no spread, and a real mean with no spread is decisive (-0.1 beats, +0.1 is below, 5e-9 is below)", r(0, 0.5) === "TIES" && r(1e-10, 0) === "TIES" && r(-1e-10, 0) === "TIES" && r(-0.1, 0) === "BEATS" && r(0.1, 0) === "IS BELOW" && r(5e-9, 0) === "IS BELOW" && r(-5e-9, 0) === "BEATS");
    ok("!! two ids give a spread: [0, 0] minus [1, 3] has mean -2 and se 1 (sd 1.414214); no ids give n 0, mean 0, se 0 and no counts", near(C.pairedErr([0, 0], [1, 3]).se, 1, 1e-12) && near(C.pairedErr([0, 0], [1, 3]).mean, -2, 1e-12) && J(C.pairedErr([], [])) === J({ n: 0, mean: 0, se: 0, better: 0, worse: 0, same: 0 }));
    ok("!! the tolerance is inclusive: a difference of exactly 1e-9 or -1e-9 is the same (and a mean of exactly 1e-9 ties), 1.5e-9 is not", J(C.pairedErr([1e-9], [0])) === J({ n: 1, mean: 1e-9, se: 0, better: 0, worse: 0, same: 1 }) && J(C.pairedErr([-1e-9], [0])) === J({ n: 1, mean: -1e-9, se: 0, better: 0, worse: 0, same: 1 }) && C.pairedErr([1.5e-9], [0]).worse === 1 && C.pairedErr([-1.5e-9], [0]).better === 1 && r(1e-9, 0) === "TIES" && r(-1e-9, 0) === "TIES" && r(1.5e-9, 0) === "IS BELOW" && r(-1.5e-9, 0) === "BEATS");
    ok("!! the factor is 2 and the settle time 12 s, a tick 1/30", C.SE_FACTOR === 2 && C.SETTLE === 12 && C.TICK === 1 / 30);
}

sec("6. THE RUN AND THE REPORT");
{
    const list = C.armsFor(RECS, []), res = C.run(list, 3, 60, 5), res2 = C.run(list, 3, 60, 5);
    const by = (id) => res.arms.find((a) => a.id === id);
    ok("!! the run: ids 3 from 5 at 60 s, four arms in order, ids and controls carried, three errors each, nothing lost", res.ids === 3 && res.from === 5 && res.seconds === 60 && J(res.arms.map((a) => a.id)) === '["autopilot","navigator","leaky-unit","leaky-unit-off"]' && res.arms.every((a) => a.errs.length === 3 && a.lost === 0) && J(by("leaky-unit").controls) === '["autopilot"]' && J(by("leaky-unit-off").controls) === "[]");
    ok("!! the autopilot on ids 5 to 7 at 60 s reads 0.13847, 0.25955, 0.96231; the lesion equals it exactly; the same twice", by("autopilot").errs.every((e, i) => near(e, [0.13847, 0.25955, 0.96231][i], 2e-5)) && by("leaky-unit-off").errs.every((e, i) => e === by("autopilot").errs[i]) && J(res.arms) === J(res2.arms));
    ok("!! the navigator (0.03901, 0.07377, 0.96231) and the unit (0.04361, 0.07828, 0.96231) sit within 0.01 of each other on every id", by("navigator").errs.every((e, i) => near(e, [0.03901, 0.07377, 0.96231][i], 2e-5)) && by("leaky-unit").errs.every((e, i) => near(e, [0.04361, 0.07828, 0.96231][i], 2e-5) && Math.abs(e - by("navigator").errs[i]) < 0.01));
    ok("!! the default start id is 1: run with no start flies sb-1..", C.run([list[0]], 2, 30).arms[0].errs[0] === C.flight(list[0].arm, 1, "dropout", 30).err && C.run([list[0]], 2, 30).from === 1);
    const fake = (arm, n) => ({ err: 1 + n / 10, dark: 1, lost: arm.id === "navigator" && n !== 6 });
    const fr = C.run(list.slice(0, 2), 3, 33, 5, fake);
    ok("!! the flights are the caller's to replace: with a fake, errors are 1.5, 1.6, 1.7 for ids 5 to 7 and the navigator is lost on two of the three", J(fr.arms[0].errs.map((e) => +e.toFixed(1))) === "[1.5,1.6,1.7]" && fr.arms[0].lost === 0 && fr.arms[1].lost === 2 && fr.seconds === 33 && fr.from === 5);
    const fx = { ids: 3, from: 5, seconds: 60, arms: [{ id: "autopilot", controls: [], errs: [1, 2, 3], lost: 0 }, { id: "navigator", controls: ["autopilot"], errs: [0.5, 1.5, 2.5], lost: 1 }, { id: "leaky-unit", controls: ["autopilot", "ghost"], errs: [0.6, 1.6, 2.6], lost: 0 }] };
    const lines = C.reportLines(fx);
    ok("!! the report of a fixture, line for line: the header with the ids sb-5..sb-7 and 60 s, the means and the lost counts, BEATS lines with the sign and the counts, the missing control, the reference line (IS BELOW, +0.1000)", J(lines) === J([
        "COMPASS DROPOUT IN THE TANK, the board's loop: ids sb-5..sb-7, 60 s, the settled dark heading error to the wandering target in rad (lower is better); the navigator is the tank's own event, every other arm the dropout event",
        "  autopilot            mean 2.0000  lost 0", "  navigator            mean 1.5000  lost 1", "  leaky-unit           mean 1.6000  lost 0",
        "navigator BEATS its control autopilot (-0.5000 rad, se 0.0000; better 3, worse 0, same 0)", "leaky-unit BEATS its control autopilot (-0.4000 rad, se 0.0000; better 3, worse 0, same 0)", "leaky-unit: its control ghost was not flown, so no line",
        "REFERENCE leaky-unit against the navigator: IS BELOW (+0.1000 rad, se 0.0000; better 0, worse 3, same 0)"]), lines.join(" | ").slice(0, 400));
    const lines2 = C.reportLines({ ...fx, arms: fx.arms.slice(0, 2) });
    ok("!! with no leaky unit there is no reference line; with a TIE the line says TIES", lines2.length === 4 && !lines2.some((l) => /REFERENCE/.test(l)) && C.reportLines({ ids: 3, from: 1, seconds: 60, arms: [{ id: "a", controls: [], errs: [1, 2, 3], lost: 0 }, { id: "b", controls: ["a"], errs: [1.5, 2, 2.5], lost: 0 }] })[3] === "b TIES its control a (+0.0000 rad, se 0.2887; better 1, worse 1, same 1)");
}

sec("7. THE COMMAND");
{
    const run = (argv, io0 = {}) => { const out = [], errs = [], reads = []; const io = { print: (t) => out.push(t), err: (t) => errs.push(t), read: (f) => { reads.push(f); return REAL; }, go: (l, ids, secs, from) => { io.called = { n: l.length, ids, secs, from }; return { ids, from, seconds: secs, arms: [{ id: "autopilot", controls: [], errs: [1, 2], lost: 0 }] }; }, ...io0 }; const code = C.main(argv, io); return { code, out, errs, reads, called: io.called }; };
    const bad = run(["--ids", "1"]);
    ok("!! a usage error is exit 1 with the usage line and the fault, nothing read, nothing flown", bad.code === 1 && /^usage: node tools\/ship\/takeTankDropout\.mjs \[--ids 12\] \[--from 1\] \[--seconds 160\] \[--plain P\/B\/mn:3,E\/E\/mn:0\|none\]   \(--ids is a whole number from 2 to 200, got 1\)$/.test(bad.errs[0]) && /--ids is a whole number/.test(bad.errs[0]) && bad.reads.length === 0 && bad.called === undefined && bad.out.length === 0);
    const dflt = run([]);
    ok("!! the default run reads the study file once (brain/rig-results/plainNetStudy.jsonl), flies five arms with 12 ids, 160 s, from 1, and prints the report with a newline: exit 0", dflt.code === 0 && J(dflt.reads) === '["brain/rig-results/plainNetStudy.jsonl"]' && J(dflt.called) === J({ n: 5, ids: 12, secs: 160, from: 1 }) && dflt.out.length === 1 && /^COMPASS DROPOUT IN THE TANK/.test(dflt.out[0]) && dflt.out[0].endsWith("\n"));
    const none = run(["--plain", "none", "--ids", "5", "--from", "70", "--seconds", "90"]);
    ok("!! --plain none reads nothing and flies four arms; the flags reach the flights (5 ids from 70, 90 s)", none.code === 0 && none.reads.length === 0 && J(none.called) === J({ n: 4, ids: 5, secs: 90, from: 70 }));
    const miss = run([], { read: () => { throw new Error("ENOENT"); } }), unk = run(["--plain", "X/y/z:9"]), badline = run([], { read: () => "{oops" });
    ok("!! a missing study file is exit 2 saying so; an unknown champion is exit 2 naming it; a bad line is exit 2 naming the line; nothing is flown", miss.code === 2 && miss.errs[0] === "takeTankDropout: brain/rig-results/plainNetStudy.jsonl is missing" && unk.code === 2 && unk.errs[0] === 'takeTankDropout: no champion "X/y/z:9" in the study file' && badline.code === 2 && badline.errs[0] === "takeTankDropout: line 1 of the study file is not JSON" && [miss, unk, badline].every((r) => r.called === undefined && r.out.length === 0));
    const out = []; const real = C.main(["--ids", "3", "--seconds", "40", "--plain", "none"], { print: (t) => out.push(t) });
    ok("!! the real thing: 3 ids, 40 s, no plain net, prints four arms and the unit-navigator reference, exit 0", real === 0 && out.length === 1 && out[0].split("\n").filter((l) => /^  /.test(l)).length === 4 && /REFERENCE leaky-unit against the navigator/.test(out[0]));
    const file = path.join(HERE, "takeTankDropout.mjs"), spawn = (args) => spawnSync(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", file, ...args], { encoding: "utf8", timeout: 120000 });
    const c1 = spawn(["--ids", "2", "--seconds", "40", "--plain", "none"]), c2 = spawn(["--bogus", "1"]), c3 = spawn(["--plain", "nobody:1", "--ids", "2"]);
    const c0 = spawn([]), c4 = spawnSync(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", "--input-type=module", "-e", `import("${new URL("./takeTankDropout.mjs", import.meta.url).href}").then((m) => console.log(typeof m.main))`], { encoding: "utf8", timeout: 120000 });
    ok("!! as a command with NO arguments it runs the default (exit 0, the five arms and their lines); imported by `node -e` it does nothing by itself (prints function, exit 0)", c0.status === 0 && c0.stdout.split("\n").filter((l) => /^  /.test(l)).length === 5 && /ids sb-1\.\.sb-12, 160 s/.test(c0.stdout) && c4.status === 0 && c4.stdout.trim() === "function", `${c0.status} ${c4.status} ${c4.stderr.slice(0, 120)}`);
    ok("!! as a command (a child process): exit 0 and the report on stdout; a bad flag exit 1 with the usage on stderr; an unknown champion exit 2", c1.status === 0 && /^COMPASS DROPOUT IN THE TANK/.test(c1.stdout) && c2.status === 1 && /^usage: /.test(c2.stderr) && c3.status === 2 && /no champion "nobody:1"/.test(c3.stderr), `${c1.status} ${c2.status} ${c3.status}`);
}

sec("8. THE SOURCE");
{
    const raw = fs.readFileSync(path.join(HERE, "takeTankDropout.mjs"), "utf8"), code = raw.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! no Math.random, no clock, no DOM, no network; the one file it reads is the study file through `read`", !/Math\.random|Date\.now|new Date|performance\.now|document\.|window\.|fetch\(/.test(code) && (code.match(/readFileSync/g) || []).length === 1);
    ok("!! the imports: fs, path, url, the tank, the leaky unit and the plain-net kind", J([...code.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1]).sort()) === J(["../../brain/pilotLeakyHeading.mjs", "../../render/subAquariumPlainNet.mjs", "../../render/subAquariumSim.mjs", "node:fs", "node:path", "node:url"]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
