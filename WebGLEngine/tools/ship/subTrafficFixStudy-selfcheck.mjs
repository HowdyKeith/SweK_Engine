// WebGLEngine/tools/ship/subTrafficFixStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subTrafficFixStudy-selfcheck.mjs      (~8 s)
//
// THE STUDY OF THE TRAFFIC FIX (tools/ship/subTrafficFixStudy.mjs), held to its word before HELD5 is flown ("FOLLOW-UP 5" and its Amendment 1 in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the file, the sets (DEV and HELD5), the reference arm, the thresholds
//   2  THE SUMMARY     counts by status, medians over arrivals or over every flight, only the arms flown, in FIX_ARMS order
//   3  THE VERDICT     the bar (48 of 60), no exit, the gain (5 more than any+predict), the verdict over their combinations, F1 to F6 each at its boundary, a missing arm is a miss
//   4  THE TEXT        the table and the verdict block
//   5  THE COMMAND     bad arguments (exit 2, named), a short DEV run end to end, --write goes with held5 only and puts one JSON line a flight in brain/subTrafficFixHeld5.jsonl
//
// SABOTAGE LOG -- 85 mutants of tools/ship/subTrafficFixStudy.mjs, each run against a copy of this gate, 4 at a time (the scratch-tree runner). 82 RED BY NAME, 3 NOT RED and said:
//   F01 output path; F02 reference arm; F03-F04 the two sets; F05-F10 each threshold and the frozen thresholds; F11-F16 the median (even takes the upper, odd takes the mean, sorts in place, descending, empty is 0, unsorted); F17-F30 summarize (absent arms, the arm filter, the rate, what counts as
//   reached, each status count, other, the median time over all, path/chord inverted or over all, the clearance over arrivals, n); F31-F37 the bar (strict), no exit (by collisions, ignored), the gain (strict, reversed, against the replan arm); F38-F42 the verdict rule; F43-F57 F1 to F6 (each
//   boundary and what each reads); F58-F70 the text (the percent, the columns, absent arms, HELD against MISSED, the line each flag is printed on); F71-F84 the command (--write with DEV, the set check, the seed checks and the slice, the kind, the arms flown, the record's tag and target, the count said, the
//   unknown flag and its exit code, the header); F85 the pilot.
//   NOT RED: F14 (the median sorted DESCENDING) is an EQUIVALENT MUTANT -- a median is the same read from either end; F32 (`&& ref.rate >= 0` added to the bar) is MALFORMED -- vacuous whenever the reference arm is there -- and is WITHDRAWN; F85 (the pilot is handed a still current in place of the scenario's)
//   is EQUIVALENT FOR THIS STUDY: the traffic kind has no current, so the scenario's current is the still one already.
//   ON THE FIRST RUN TEN WENT 0 RED and the gate grew what separated them: F6 counting exits as timeouts (F57: a designated arm with 3 timeouts and 2 exits still holds F6); the table's columns (F63, F64: the median time, the path over the chord and the clearance are their own numbers, checked on a
//   hand-built summary); F60 was red only by a THROWN ERROR (a table asked for an arm not flown) and the call is now wrapped so the row fails by name; the verdict block's lines (F67 to F70: each line reads its own judgement, checked with eight different flags); the scenarios flown by default (F76: the whole
//   set, read from the first line before any flight) and the file's target being an absolute path under the engine (F80).
"use strict";
import path from "node:path";
import * as St from "./subTrafficFixStudy.mjs";
import * as H from "../../brain/subHardNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (seed, arm, o = {}) => ({ kind: "hard-traffic", seed, arm, status: "reached", reached: true, t: 100, path: 400, chord: 380, minClearance: 10, ...o });
const lose = (status, o = {}) => ({ status, reached: false, t: null, ...o });
console.log("subTrafficFixStudy-selfcheck -- the study of the traffic fix\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output is brain/subTrafficFixHeld5.jsonl, the reference arm is any+predict; the sets are DEV (hard-traffic seeds 1 to 30) and HELD5 (501 to 560), the study's own copies of the module's", St.OUT === "brain/subTrafficFixHeld5.jsonl" && St.REFERENCE === "any+predict" && same(St.SETS.dev, H.HARD_SETS.dev) && same(St.SETS.held5, H.HELD5) && St.SETS.held5.length === 60 && Object.isFrozen(St.SETS));
    ok("!! the thresholds: the bar 0.8, the gain 5, the collision drop 3, the time factor 1.25, 3 timeouts", same(St.THRESH, { bar: 0.8, gain: 5, collisionDrop: 3, timeFactor: 1.25, timeouts: 3 }) && Object.isFrozen(St.THRESH));
    const xs = [5, 1, 3];
    ok("!! median: the middle of an odd count (5, 1, 3 -> 3), the mean of the middle two of an even one (1, 2, 3, 10 -> 2.5), NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([10, 3, 1, 2]) === 2.5 && Number.isNaN(St.median([])));
}

console.log("\n2. THE SUMMARY");
{
    const a = "any+predict";
    const runs = [run(1, a, { t: 100, path: 380 * 1.1, minClearance: 10 }), run(2, a, { t: 120, path: 380 * 1.3, minClearance: 20 }), run(3, a, { ...lose("collided"), minClearance: -0.1 }), run(4, a, { ...lose("collided"), minClearance: -0.2 }), run(5, a, { ...lose("timeout"), minClearance: 2 }), run(6, a, { ...lose("timeout"), minClearance: 3 }), run(7, a, { ...lose("timeout"), minClearance: 3.5 }), run(8, a, { ...lose("left"), minClearance: 4 }), run(9, a, { ...lose("broached"), minClearance: 6 }),
        run(1, "any+replan", { t: 200 })];
    const sum = safe(() => St.summarize(runs)), x = sum && sum.cells[a];
    ok("!! a cell counts flights by status: of nine any+predict flights 2 reached, 2 collided, 3 timed out, 1 left, 1 other (broached), the rate is reached/n (2 of 9)", !!x && x.n === 9 && x.reached === 2 && x.collided === 2 && x.timeout === 3 && x.left === 1 && x.other === 1 && near(x.rate, 2 / 9));
    ok("!! the median clearance is over ALL the flights (-0.2, -0.1, 2, 3, 3.5, 4, 6, 10, 20: 3.5), the median time and path/chord over the ARRIVALS only (100 and 120 s: 110; 1.1 and 1.3: 1.2)", !!x && near(x.medianClearance, 3.5) && near(x.medianTime, 110) && near(x.medianChord, 1.2, 1e-9));
    ok("!! only the arms flown get a cell (no +edge here), the cells are keyed in FIX_ARMS order, and an arm's runs are its own (any+replan: 1 flight, 200 s)", !!sum && sum.cells["any+predict+edge"] === undefined && Object.keys(sum.cells).join() === "any+replan,any+predict" && sum.cells["any+replan"].n === 1 && sum.cells["any+replan"].medianTime === 200);
}

console.log("\n3. THE VERDICT");
{
    const cell = (n, reached, o = {}) => ({ n, reached, rate: reached / n, collided: 0, left: 0, timeout: 0, other: 0, medianTime: 150, medianChord: 1.1, medianClearance: 5, ...o });
    const base = () => ({ cells: { "any+replan": cell(60, 33), "any+predict": cell(60, 43, { collided: 9, left: 8 }), "any+predict+edge": cell(60, 47, { collided: 13 }), "any+predict+yield": cell(60, 46, { collided: 6, left: 8 }), "any+predict+edge+yield": cell(60, 50, { collided: 10, medianTime: 170 }) } });
    const jb = safe(() => St.judge(base())), mod = (f) => { const b = base(); f(b.cells); return safe(() => St.judge(b)); };
    ok("!! the base case holds the bar, the no-exit and the gain: SUPPORTED, and F1 to F6", !!jb && jb.bar && jb.noExit && jb.gain && jb.verdict === "SUPPORTED" && [jb.f1, jb.f2, jb.f3, jb.f4, jb.f5, jb.f6].every((v) => v === true));
    ok("!! the BAR is 80% (48 of 60 holds, 47 fails); NO EXIT is zero `left` (one fails); the GAIN is 5 more than any+predict (43 + 5 = 48 holds, 47 fails)", mod((c) => { c["any+predict+edge+yield"] = cell(60, 48); }).bar === true && mod((c) => { c["any+predict+edge+yield"] = cell(60, 47); }).bar === false && mod((c) => { c["any+predict+edge+yield"] = cell(60, 50, { left: 1 }); }).noExit === false && mod((c) => { c["any+predict+edge+yield"] = cell(60, 48); }).gain === true && mod((c) => { c["any+predict+edge+yield"] = cell(60, 47); }).gain === false);
    ok("!! the verdict rule: all three SUPPORTED; the gain with the bar missed (47 of 60 against a reference of 41) PARTLY; the gain with an exit PARTLY; the bar and no exit but a gain of 4 NOT; no gain at all NOT", mod(() => {}).verdict === "SUPPORTED" && mod((c) => { c["any+predict"] = cell(60, 41); c["any+predict+edge+yield"] = cell(60, 47); }).verdict === "PARTLY SUPPORTED" && mod((c) => { c["any+predict+edge+yield"] = cell(60, 50, { left: 2 }); }).verdict === "PARTLY SUPPORTED" && mod((c) => { c["any+predict"] = cell(60, 46); c["any+predict+edge+yield"] = cell(60, 50); }).verdict === "NOT SUPPORTED" && mod((c) => { c["any+predict+edge+yield"] = cell(60, 40); }).verdict === "NOT SUPPORTED");
    ok("!! F1: +edge has no exit and the reference at least one (a reference with none fails it; an exit in +edge fails it)", mod((c) => { c["any+predict"] = cell(60, 43, { left: 0 }); }).f1 === false && mod((c) => { c["any+predict+edge"] = cell(60, 47, { left: 1 }); }).f1 === false && mod((c) => { c["any+predict"] = cell(60, 43, { left: 1 }); }).f1 === true);
    ok("!! F2: +yield has at least 3 fewer collisions than the reference (9 against 6 holds, against 7 fails)", mod((c) => { c["any+predict+yield"] = cell(60, 46, { collided: 6 }); }).f2 === true && mod((c) => { c["any+predict+yield"] = cell(60, 46, { collided: 7 }); }).f2 === false);
    ok("!! F3: the designated arm reaches at least as many as EACH single change (equal holds; one fewer than +edge fails; one fewer than +yield fails)", mod((c) => { c["any+predict+edge+yield"] = cell(60, 47); }).f3 === true && mod((c) => { c["any+predict+edge+yield"] = cell(60, 46); }).f3 === false && mod((c) => { c["any+predict+edge"] = cell(60, 51); }).f3 === false && mod((c) => { c["any+predict+yield"] = cell(60, 51); }).f3 === false);
    ok("!! F4: the median time at most 1.25 times the reference's (150 s: 187.5 holds, 188 fails) and the ratio is reported; NaN fails", mod((c) => { c["any+predict+edge+yield"] = cell(60, 50, { medianTime: 187.5 }); }).f4 === true && mod((c) => { c["any+predict+edge+yield"] = cell(60, 50, { medianTime: 188 }); }).f4 === false && near(jb.timeRatio, 170 / 150) && mod((c) => { c["any+predict+edge+yield"] = cell(60, 0, { medianTime: NaN }); }).f4 === false);
    ok("!! F5: the reference reaches MORE than any+replan (equal fails); F6: the designated arm times out in at most 3 (3 holds, 4 fails)", mod((c) => { c["any+replan"] = cell(60, 43); }).f5 === false && mod((c) => { c["any+replan"] = cell(60, 42); }).f5 === true && mod((c) => { c["any+predict+edge+yield"] = cell(60, 50, { timeout: 3 }); }).f6 === true && mod((c) => { c["any+predict+edge+yield"] = cell(60, 50, { timeout: 4 }); }).f6 === false && mod((c) => { c["any+predict+edge+yield"] = cell(60, 50, { timeout: 3, left: 2, collided: 5 }); }).f6 === true);
    ok("!! a missing arm is a miss, not a crash (no designated arm: every judgement false, NOT SUPPORTED)", (() => { const j = mod((c) => { delete c["any+predict+edge+yield"]; }); return !!j && j.bar === false && j.noExit === false && j.gain === false && j.verdict === "NOT SUPPORTED" && j.f3 === false && j.f4 === false && j.f6 === false; })());
}

console.log("\n4. THE TEXT");
{
    const runs = [run(1, "any+predict+edge+yield"), run(2, "any+predict+edge+yield", lose("collided")), run(1, "any+predict")];
    const sum = St.summarize(runs), tbl = safe(() => St.table(sum, "A TITLE"), ""), vt = safe(() => St.verdictText(St.judge(sum)), "");
    ok("!! the table has the title first, a header and a line for each arm flown (the designated arm: 1/2 50%, 1 collided)", tbl.split("\n")[0] === "A TITLE" && /^arm /.test(tbl.split("\n")[1]) && /any\+predict\+edge\+yield\s+\| 1\/2 50%\s+\|\s+1\s+0\s+0\s+0 \|/.test(tbl) && /^any\+predict\s+\| 1\/1 100%/m.test(tbl) && !/any\+replan/.test(tbl) && tbl.split("\n").length === 4);
    const hand = { cells: { "any+predict+edge+yield": { n: 60, reached: 50, rate: 50 / 60, collided: 4, left: 2, timeout: 3, other: 1, medianTime: 123.45, medianChord: 1.234, medianClearance: 7.89 } } }, htbl = safe(() => St.table(hand, "T"), "");
    ok("!! each column of the table is its own number: reached 50/60 83%, collided 4, left 2, timeout 3, other 1, then the median time 123.45, the median path over the chord 1.23, the median minimum clearance 7.89 (in that order, last)", /any\+predict\+edge\+yield\s+\| 50\/60 83%\s+\|\s+4\s+2\s+3\s+1 \| 123\.45\s+\| 1\.23\s+\| 7\.89$/m.test(htbl) && /median min clearance \(m\)/.test(htbl));
    const jx = { bar: true, noExit: false, gain: false, verdict: "NOT SUPPORTED", f1: false, f2: true, f3: false, f4: true, timeRatio: 1.1, f5: false, f6: true }, vx = safe(() => St.verdictText(jx), "").split("\n");
    ok("!! each line of the verdict block reads ITS OWN judgement: bar HELD, no exit MISSED, gain MISSED on the first; F1 MISSED, F2 HELD, F3 MISSED, F4 HELD with the ratio (it is 1.10), F5 MISSED, F6 HELD; the last line VERDICT: NOT SUPPORTED", vx.length === 8 && /\(the bar\): HELD; has no flight that left the region: MISSED; reaches at least 5 more than any\+predict: MISSED$/.test(vx[0]) && /^F1 .*: MISSED$/.test(vx[1]) && /^F2 .*: HELD$/.test(vx[2]) && /^F3 .*: MISSED$/.test(vx[3]) && /^F4 .*\(it is 1\.10\): HELD$/.test(vx[4]) && /^F5 .*: MISSED$/.test(vx[5]) && /^F6 .*: HELD$/.test(vx[6]) && vx[7] === "VERDICT: NOT SUPPORTED");
    ok("!! the verdict block names the designated arm's bar, no-exit and gain (HELD or MISSED), F1 to F6, and ends on VERDICT in capitals", /^any\+predict\+edge\+yield: reaches at least 80% \(the bar\): MISSED; has no flight that left the region: HELD; reaches at least 5 more than any\+predict: MISSED/m.test(vt) && ["F1", "F2", "F3", "F4", "F5", "F6"].every((f) => new RegExp("^" + f + " .*: (HELD|MISSED)$", "m").test(vt)) && /^VERDICT: (SUPPORTED|PARTLY SUPPORTED|NOT SUPPORTED)$/m.test(vt) && vt.split("\n").pop().startsWith("VERDICT: "));
}

console.log("\n5. THE COMMAND");
{
    const call = (argv) => { const o = [], e = [], w = []; const code = safe(() => St.command(argv, { out: (m) => o.push(m), err: (m) => e.push(m), writeFile: (p, c) => w.push([p, c]) }), -1); return { code, out: o.join("\n"), err: e.join("\n"), w }; };
    ok("!! a bad argument is exit 2 with a message naming it: an unknown flag, --set with an unknown name, --seeds that is not a positive whole number (0, 2.5, none), --write with the DEV set", call(["--bogus"]).code === 2 && /unknown argument "--bogus"/.test(call(["--bogus"]).err) && call(["--set", "held4"]).code === 2 && /--set needs one of dev, held5/.test(call(["--set", "held4"]).err) && call(["--seeds", "0"]).code === 2 && call(["--seeds", "2.5"]).code === 2 && call(["--seeds"]).code === 2 && /--seeds needs a positive whole number/.test(call(["--seeds", "0"]).err) && call(["--write"]).code === 2 && /--write goes with --set held5 only/.test(call(["--write"]).err));
    const d = call(["--set", "dev", "--seeds", "2"]);
    ok("!! a DEV run of two seeds: exit 0, the first line names the set, the scenarios and the five arms, the table has every arm with 2 flights, the verdict block follows, nothing is written", d.code === 0 && /^DEV set: 2 scenarios of hard-traffic, 5 arms/.test(d.out) && H.FIX_ARMS.every((a) => new RegExp("^" + a.replace(/\+/g, "\\+") + "\\s+\\| \\d\\/2 ", "m").test(d.out)) && /^VERDICT: /m.test(d.out) && d.w.length === 0 && d.err === "" && /edge \+20 m, yield 2 m\/s/.test(d.out));
    const first = (argv) => { let line = null; try { St.command(argv, { out: (m) => { line = m; throw new Error("stop"); }, err: () => {}, writeFile: () => {} }); } catch { /* stopped on purpose after the first line */ } return line; };
    ok("!! the scenarios flown are the set's: no --seeds is the WHOLE set (DEV 30, HELD5 60), --seeds N the first N (3), more than the set has is the set (99 of DEV: 30) -- read from the first line, before any flight", /^DEV set: 30 scenarios of hard-traffic, 5 arms/.test(first([]) || "") && /^HELD5 set: 60 scenarios/.test(first(["--set", "held5"]) || "") && /^DEV set: 3 scenarios/.test(first(["--seeds", "3"]) || "") && /^DEV set: 30 scenarios/.test(first(["--seeds", "99"]) || ""));
    const w = call(["--set", "held5", "--seeds", "1", "--write"]), lines = w.w.length ? w.w[0][1].trim().split("\n").map((l) => JSON.parse(l)) : [];
    ok("!! --write with held5 puts one JSON line a flight in brain/subTrafficFixHeld5.jsonl (5 for one seed), each tagged set 'held5', seed 501, in FIX_ARMS order, and says so", w.code === 0 && w.w.length === 1 && path.isAbsolute(w.w[0][0]) && w.w[0][0].endsWith("brain/subTrafficFixHeld5.jsonl") && lines.length === 5 && lines.every((r) => r.set === "held5" && r.seed === 501 && r.kind === "hard-traffic") && same(lines.map((r) => r.arm), H.FIX_ARMS) && w.out.includes("wrote 5 flights to brain/subTrafficFixHeld5.jsonl"));
    const direct = safe(() => H.flyHard(St.pilot, H.hardScenario(501, "hard-traffic"), "any+predict+edge+yield")), rec = lines.find((r) => r.arm === "any+predict+edge+yield");
    ok("!! the flights in the file are the library's own flights of the HELD5 scenarios on the PD autopilot (seed 501, the designated arm: the same status, ticks and path as a direct flyHard)", !!rec && !!direct && rec.status === direct.status && rec.ticks === direct.ticks && near(rec.path, direct.path, 1e-9));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
