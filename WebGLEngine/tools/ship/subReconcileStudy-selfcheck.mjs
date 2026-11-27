// WebGLEngine/tools/ship/subReconcileStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subReconcileStudy-selfcheck.mjs      (about 20 s: arithmetic on hand-built summaries and a short run end to end)
//
// THE STUDY OF THE TWO MISSION SERIES, RECONCILED (tools/ship/subReconcileStudy.mjs), held to its word before HELD13 is flown ("FOLLOW-UP 13" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the file, the stored files, the sets, the thresholds
//   2  THE SUMMARY     counts by outcome, the median energy in MJ (flights that report one), the median chord, an unknown outcome counted apart
//   3  THE FLIGHTS     two flights are the same iff outcome, ticks and path (a millimetre) agree; the per-mission agreement on energy-out against not
//   4  THE VERDICT     T1 (31 to 51), T2 (at most 6), T3 (bin 1 at most 3, bin 3 at least 15, bin 4 at least 24, monotone within 2) each at its boundary, the verdict over every combination, E1 to E8, a missing cell is a miss
//   5  THE DRIFT       each flyer reproduces its stored reference flights, and a flight that does not is named
//   6  THE TEXT AND THE COMMAND   the table, the verdict block, bad arguments (exit 2, named), --write goes with held13 only and refuses a second write, a short run end to end, run as a process
//
// SABOTAGE LOG (serial mutation pass of tools/ship/subReconcileStudy.mjs, one mutant per code line and operator, at most four of each operator on a line): 156 mutants; 119 red on the first pass and 37 survivors,
//   most of them the text and the command's assembly (the table's column widths, "bin 3" and "of 30" in the verdict block, the way part B's flights are binned and summarised, the agreement's arm filter, the break-even line, the import guard),
//   because the first rows tested the structure by regex and the command with a fake flyer that gave every bin and arm the same answer. Section 7 was added (the verdict block and a table row word for word, a command run with a
//   fake that answers by bin and arm, stored flights that disagree by arm, the header, the break-even line, an import that prints nothing, a process run that reads the stored files itself) and the 37 were run again: 35 red, 2 left.
//   A DISCLOSURE: some mutant on the `writeFile = io.writeFile || fs.writeFileSync` line made the gate's injected-flight `--write` runs write for real, and left a 10-row brain/subReconcileHeld13.jsonl of FAKE flights
//   (ticks 5) in the held-set output path before HELD13 was flown; it was found by git status, deleted, and is not data. The command refuses to write when that file exists, so it would have refused the real run.
//   LEFT, said plainly: `padEnd(45)` -> `padEnd(46)` (killed by the row added after: the two names tested exactly were already over 45 wide) and `process.argv[1]` -> `process.argv[2]` in the entry guard,
//   which differs only for a run with NO arguments at all: that is the full DEV set (about 8 minutes of flights), which this gate does not fly. NOT REACHED, not equivalent.
//   NOT CHECKED, said plainly: the full HELD13 flights themselves (the module's gate holds the flyers and the bins; the study is flown once).
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as St from "./subReconcileStudy.mjs";
import * as R from "../../brain/subReconcileNav.mjs";
import * as MN from "../../brain/navMission.mjs";
import * as SB from "../../brain/subMissionNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const cell = (energyOut, o = {}) => ({ n: 30, completed: 30 - energyOut, energyOut, collided: 0, left: 0, timeout: 0, other: 0, medianMJ: 2.5, medianChord: 900, ...o });
const bins = (a, b, c, d) => [cell(a), cell(b), cell(c), cell(d)];
const J = (o = {}) => St.judge({ a1: cell(41, { n: 60 }), a2: cell(1, { n: 60 }), bins: bins(0, 5, 18, 28), slow: bins(0, 0, 0, 3), agree: { a1: 0.9, a2: 0.9 }, drift: true, ...o });
console.log("subReconcileStudy-selfcheck -- the study of the two mission series, reconciled\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output is brain/subReconcileHeld13.jsonl and the stored flights are the two series' held files", St.OUT === "brain/subReconcileHeld13.jsonl" && St.STORED_MAIN === "brain/navMissionHeld83.jsonl" && St.STORED_B === "brain/subMissionHeld10.jsonl");
    ok("!! the sets are dev and held13", same(St.SETS, ["dev", "held13"]) && Object.isFrozen(St.SETS));
    ok("!! the thresholds: T1 31 to 51, T2 at most 6, bin 1 at most 3, bin 3 at least 15, bin 4 at least 24, slack 2, agreement 0.85, the slow arm at most 2, drift over 5 flights", same(St.THRESH, { t1Lo: 31, t1Hi: 51, t2Max: 6, bin1Max: 3, bin3Min: 15, bin4Min: 24, slack: 2, agree: 0.85, slowMax: 2, drift: 5 }) && Object.isFrozen(St.THRESH));
    const xs = [5, 1, 3];
    ok("!! median: 5, 1, 3 -> 3; 1, 2, 3, 10 -> 2.5; NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([1, 2, 3, 10]) === 2.5 && Number.isNaN(St.median([])));
}

console.log("\n2. THE SUMMARY");
{
    const f = (outcome, o = {}) => ({ outcome, energy: 1e6, chord: 800, ...o });
    const s = St.summarize([f("completed", { energy: 2e6, chord: 700 }), f("energy-out", { energy: 3e6, chord: 900 }), f("energy-out", { energy: 3e6 }), f("collided"), f("left"), f("timeout"), f("sunk")]);
    ok("!! counts by outcome, the vessel's own outcome counted apart as `other`, n the lot", s.n === 7 && s.completed === 1 && s.energyOut === 2 && s.collided === 1 && s.left === 1 && s.timeout === 1 && s.other === 1);
    ok("!! the median energy is in MJ over the flights that report one; a flight with no energy is left out of it, not counted as zero", near(St.summarize([f("completed", { energy: 1e6 }), f("completed", { energy: 3e6 }), f("completed", { energy: null })]).medianMJ, 2) && Number.isNaN(St.summarize([f("completed", { energy: null })]).medianMJ));
    ok("!! the median chord is over every flight; an empty list gives zeros and NaN, not a throw", near(St.summarize([f("completed", { chord: 700 }), f("completed", { chord: 900 })]).medianChord, 800) && St.summarize([]).n === 0 && St.summarize([]).energyOut === 0 && Number.isNaN(St.summarize([]).medianChord));
    ok("!! the five outcomes and `other` add to n", [s.completed, s.energyOut, s.collided, s.left, s.timeout, s.other].reduce((a, b) => a + b, 0) === s.n);
}

console.log("\n3. THE FLIGHTS");
{
    const a = { status: "flat", ticks: 100, path: 10 }, b = { status: "energy-out", ticks: 100, path: 10.0005 };
    ok("!! two flights are the same flight when the outcome (flat and energy-out are one), the ticks and the path to a millimetre agree", St.sameFlight(a, b) && St.sameFlight({ status: "complete", ticks: 5, path: 1 }, { status: "completed", ticks: 5, path: 1 }));
    ok("!! ...and not when the outcome, the ticks or the path differs (a path 2 mm apart is a different flight), or a flight is missing", !St.sameFlight(a, { ...b, status: "collided" }) && !St.sameFlight(a, { ...b, ticks: 101 }) && !St.sameFlight(a, { ...b, path: 10.002 }) && !St.sameFlight(null, b) && !St.sameFlight(a, undefined));
    ok("!! the path tolerance is strict: paths exactly a millimetre apart are different flights (`<`, not `<=`)", !St.sameFlight({ status: "flat", ticks: 1, path: 0 }, { status: "flat", ticks: 1, path: 0.001 }) && St.sameFlight({ status: "flat", ticks: 1, path: 0 }, { status: "flat", ticks: 1, path: 0.0009 }));
    const flown = [{ seed: 1, outcome: "energy-out" }, { seed: 2, outcome: "completed" }, { seed: 3, outcome: "energy-out" }, { seed: 4, outcome: "collided" }], stored = [{ seed: 1, status: "flat" }, { seed: 2, status: "completed" }, { seed: 3, status: "collided" }, { seed: 9, status: "flat" }];
    const g = St.agreement(flown, stored);
    ok("!! agreement is per mission on energy-out against not, over the seeds both have: seeds 1 and 2 agree, 3 does not (energy-out against a collision), 4 and 9 are in one list only", g.n === 3 && g.agree === 2 && near(g.fraction, 2 / 3));
    ok("!! with no seed in common the fraction is NaN, not 0 or 1", Number.isNaN(St.agreement(flown, [{ seed: 77, status: "flat" }]).fraction) && St.agreement([], stored).n === 0);
}

console.log("\n4. THE VERDICT");
{
    ok("!! the registered shape of the answer: T1, T2 and T3 held gives SUPPORTED, with every E held", J().verdict === "SUPPORTED" && J().t1 && J().t2 && J().t3 && [1, 2, 3, 4, 5, 6, 7, 8].every((k) => J()["e" + k]));
    const t1 = (n) => J({ a1: cell(n, { n: 60 }) }).t1, t2 = (n) => J({ a2: cell(n, { n: 60 }) }).t2;
    ok("!! T1 holds from 31 to 51 inclusive: 30 and 52 miss, 31 and 51 hold", !t1(30) && t1(31) && t1(51) && !t1(52));
    ok("!! T2 holds at 6 or fewer: 6 holds, 7 misses, 0 holds", t2(6) && !t2(7) && t2(0));
    const t3 = (a, b, c, d) => J({ bins: bins(a, b, c, d) });
    ok("!! T3's bin 1 at most 3: 3 holds, 4 misses", t3(3, 5, 18, 28).t3a && !t3(4, 5, 18, 28).t3a && t3(3, 5, 18, 28).t3 && !t3(4, 5, 18, 28).t3);
    ok("!! T3's bin 3 at least 15: 15 holds, 14 misses (and E5 is the same row)", t3(0, 5, 15, 28).t3b && !t3(0, 5, 14, 28).t3b && t3(0, 5, 15, 28).e5 && !t3(0, 5, 14, 28).e5);
    ok("!! T3's bin 4 at least 24: 24 holds, 23 misses", t3(0, 5, 18, 24).t3c && !t3(0, 5, 18, 23).t3c);
    ok("!! T3's monotone part tolerates a drop of 2 and not 3 between neighbours (bin 2 to 3: 17 to 15 holds, 17 to 14 misses; bin 1 to 2: 3 to 1 holds, 3 to 0 misses)", t3(3, 17, 15, 28).mono && !t3(3, 17, 14, 28).mono && t3(3, 1, 15, 28).mono && !t3(3, 0, 15, 28).mono && t3(3, 1, 15, 28).e4 === t3(3, 1, 15, 28).mono);
    const v = (a1, a2, bn) => J({ a1: cell(a1, { n: 60 }), a2: cell(a2, { n: 60 }), bins: bn }).verdict, good = bins(0, 5, 18, 28), bad = bins(9, 5, 3, 3);
    ok("!! the verdict over every combination: all three SUPPORTED; T1 and T2 with a missed T3 PARTLY; T3 with exactly one of T1 and T2 PARTLY; T3 alone, T1 or T2 alone, or none NOT SUPPORTED",
        v(41, 1, good) === "SUPPORTED" && v(41, 1, bad) === "PARTLY SUPPORTED" && v(10, 1, good) === "PARTLY SUPPORTED" && v(41, 9, good) === "PARTLY SUPPORTED" && v(10, 9, good) === "NOT SUPPORTED" && v(41, 9, bad) === "NOT SUPPORTED" && v(10, 1, bad) === "NOT SUPPORTED" && v(10, 9, bad) === "NOT SUPPORTED");
    ok("!! E1 is the drift check, E6 needs both fractions at 0.85 or more (0.85 holds, 0.84 misses, either one), E7 the slow arm at most 2 in each of bins 1 to 3 (bin 4 is free), E8 is the verdict", !J({ drift: false }).e1 && J({ agree: { a1: 0.85, a2: 0.85 } }).e6 && !J({ agree: { a1: 0.84, a2: 0.9 } }).e6 && !J({ agree: { a1: 0.9, a2: 0.84 } }).e6 && J({ slow: bins(2, 2, 2, 30) }).e7 && !J({ slow: bins(3, 0, 0, 0) }).e7 && !J({ slow: bins(0, 3, 0, 0) }).e7 && !J({ slow: bins(0, 0, 3, 0) }).e7 && !J({ bins: bins(9, 5, 18, 28) }).e8);
    const miss = safe(() => St.judge({ a1: null, a2: undefined, bins: [], slow: null, agree: null, drift: false }));
    ok("!! a missing cell is a miss, never a throw: nothing flown is NOT SUPPORTED with every E missed", miss && miss.verdict === "NOT SUPPORTED" && !miss.t1 && !miss.t2 && !miss.t3 && !miss.e1 && !miss.e6 && !miss.e7 && !miss.e8);
}

console.log("\n5. THE DRIFT");
{
    const flown = (seed) => ({ status: "flat", ticks: seed, path: seed / 10 }), stored = (seeds, arm = R.REFERENCE) => seeds.map((seed) => ({ seed, arm, status: "flat", ticks: seed, path: seed / 10 }));
    const fly = { main: (m) => flown(m.seed), b: (b) => ({ status: "energy-out", ticks: b.seed, path: b.seed / 10 }) };
    const good = St.driftCheck(stored([7941, 7942]), stored([1001, 1002]).map((r) => ({ ...r, status: "energy-out" })), fly);
    ok("!! a flyer that reproduces its stored reference flights (outcome, ticks, path) passes, over the flights it checked", good.ok === true && good.checked === 4 && good.bad.length === 0);
    const off = St.driftCheck(stored([7941, 7942]).map((r, i) => (i ? { ...r, ticks: r.ticks + 1 } : r)), stored([1001]).map((r) => ({ ...r, status: "energy-out" })), fly);
    ok("!! a flight that does not reproduce is named with its series and seed", off.ok === false && same(off.bad, ["main 7942"]));
    const offB = St.driftCheck(stored([7941]), stored([1001]), fly);
    ok("!! series B's flight is named too (its stored status here is flat, which is the same outcome as energy-out, so only a changed path or ticks fails it)", offB.ok === true);
    const offB2 = St.driftCheck(stored([7941]), stored([1001]).map((r) => ({ ...r, path: 999 })), fly);
    ok("!! ...a changed path on series B's side is named `b 1001`", offB2.ok === false && same(offB2.bad, ["b 1001"]));
    ok("!! no stored flights is not a pass (nothing was checked), only the reference arm is checked, and at most the first 5 flights of each series", St.driftCheck([], stored([1001]), fly).ok === false && St.driftCheck(stored([7941]), [], fly).ok === false && St.driftCheck(stored([7941, 7942], "any+predict"), stored([1001]), fly).ok === false && St.driftCheck(stored([1, 2, 3, 4, 5, 6, 7].map((k) => 7940 + k)), stored([1001]), { main: (m) => (m.seed > 7945 ? { status: "collided", ticks: 0, path: 0 } : flown(m.seed)), b: fly.b }).ok === true);
}

console.log("\n6. THE TEXT AND THE COMMAND");
{
    const a1 = cell(41, { n: 60, medianChord: 981 }), a2 = cell(1, { n: 60, medianChord: 730 }), bn = bins(0, 5, 18, 28), sl = bins(0, 0, 0, 3);
    const t = St.table(a1, a2, bn, sl, "TITLE");
    ok("!! the table: the title, a header, A1, A2, four reference bins, four slow bins in that order, each with its window", t.split("\n").length === 12 && t.startsWith("TITLE\n") && /A1 .*main's HELD83/.test(t.split("\n")[2]) && /A2 .*HELD10/.test(t.split("\n")[3]) && /B1 .*reference.*\[600, 750\)/.test(t.split("\n")[4]) && /B4 .*reference.*\[1050, 1200\)/.test(t.split("\n")[7]) && /B1 .*2\.5 m\/s.*\[600, 750\)/.test(t.split("\n")[8]));
    ok("!! a cell not flown prints `(not flown)`", /\(not flown\)/.test(St.table(null, a2, bn, sl, "T").split("\n")[2]));
    const vt = St.verdictText(J());
    ok("!! the verdict block: T1 to T3 and the verdict on the first line, then E1 to E8", /=> SUPPORTED/.test(vt.split("\n")[0]) && vt.split("\n").length === 9 && /^E8 /.test(vt.split("\n")[8]) && St.verdictText(J({ drift: false })).includes("E1 each flyer reproduces its stored reference flights: MISSED"));
    const run = (argv, io = {}) => { const o = [], e = [], w = []; const code = St.command(argv, { out: (m) => o.push(m), err: (m) => e.push(m), writeFile: (f, d) => w.push([f, d]), exists: () => false, ...io }); return { code, o: o.join("\n"), e: e.join("\n"), w }; };
    ok("!! bad arguments exit 2 naming the argument: an unknown --set, --seeds 0 or 1.5, an unknown flag", run(["--set", "nope"]).code === 2 && /--set needs one of dev, held13/.test(run(["--set", "nope"]).e) && run(["--seeds", "0"]).code === 2 && run(["--seeds", "1.5"]).code === 2 && /--seeds needs a positive whole number/.test(run(["--seeds", "0"]).e) && run(["--zzz"]).code === 2 && /unknown argument "--zzz"/.test(run(["--zzz"]).e));
    ok("!! --write goes with held13 only", run(["--write"]).code === 2 && /--write goes with --set held13 only/.test(run(["--write"]).e) && run(["--set", "dev", "--write"]).code === 2);
    ok("!! --write refuses a second write: HELD13 is read once", run(["--set", "held13", "--seeds", "1", "--write"], { exists: () => true }).code === 2 && /exists: HELD13 is read once/.test(run(["--set", "held13", "--seeds", "1", "--write"], { exists: () => true }).e));
    const fakeFly = { main: (m) => ({ status: "flat", ticks: 1, path: 1 }), b: (b, arm) => ({ flyer: "b", seed: b.seed, arm, outcome: "energy-out", status: "energy-out", legs: 2, path: 1000, energy: 3e6, chord: b.chord, t: null, ticks: 5 }) };
    const r = run(["--set", "held13", "--seeds", "1", "--write"], { fly: fakeFly, read: () => "" });
    ok("!! a short held13 run with injected flights writes one row per flight to the OUT file: 1 + 1 of part A and 4 bins x 2 arms of part B, labelled A1, A2 and B", r.code === 0 && r.w.length === 1 && r.w[0][0].endsWith("brain/subReconcileHeld13.jsonl") && r.w[0][1].trim().split("\n").length === 10 && ["A1", "A2", "B"].every((p) => r.w[0][1].includes(`"part":"${p}"`)) && /wrote 10 flights/.test(r.o));
    ok("!! with no stored flights the drift check is reported NOT REPRODUCED (nothing was checked) and E1 is missed", /NOT REPRODUCED/.test(r.o) && /E1 .*MISSED/.test(r.o));
    const d = run(["--set", "dev", "--seeds", "1"], { fly: fakeFly, read: () => "" });
    ok("!! a dev run prints the header, the table, the bins line, the drift line, the agreement line and the verdict, and writes nothing", d.code === 0 && /^DEV: PART A 1 of main's missions/.test(d.o) && /cruise break-even chord 927 m/.test(d.o) && /bins: 1 \[600,750\) placed 1/.test(d.o) && /per-mission agreement on energy-out against not/.test(d.o) && /=> (SUPPORTED|PARTLY SUPPORTED|NOT SUPPORTED)/.test(d.o) && d.w.length === 0);
    const p = spawnSync(process.execPath, [path.join(HERE, "subReconcileStudy.mjs"), "--set", "dev", "--seeds", "1"], { encoding: "utf8", timeout: 120000 }), p2 = spawnSync(process.execPath, [path.join(HERE, "subReconcileStudy.mjs"), "--zzz"], { encoding: "utf8", timeout: 120000 });
    ok("!! run as a process: --set dev --seeds 1 exits 0 with the verdict block, an unknown flag exits 2 with the reason on stderr; imported, the file flies nothing by itself", p.status === 0 && /E8 the verdict is SUPPORTED/.test(p.stdout) && p2.status === 2 && /unknown argument/.test(p2.stderr), `exit ${p.status} / ${p2.status}`);
}

console.log("\n7. THE TEXT WORD FOR WORD, AND THE COMMAND'S ASSEMBLY (added after the first mutation pass: 37 survivors, most of them here)");
{
    const exact = "T1 series B's flyer on main's missions ends energy-out on 31 to 51 of 60 HELD; T2 main's flyer on series B's missions on at most 6 HELD; T3 the curve (bin 1 at most 3, bin 3 at least 15, bin 4 at least 24, monotone within 2) HELD => SUPPORTED\n" +
        "E1 each flyer reproduces its stored reference flights: HELD\nE2 T1: HELD\nE3 T2: HELD\nE4 T3's monotone part: HELD\nE5 bin 3 reaches 15 of 30: HELD\n" +
        "E6 the flyers agree on energy-out against not on at least 85% of each set: HELD\nE7 the 2.5 m/s arm ends energy-out on at most 2 of 30 in bins 1 to 3: HELD\nE8 the verdict is SUPPORTED: HELD";
    ok("!! the verdict block is exactly the registered wording: the bins and bars it names, 60 and 30, 85%, bins 1 to 3, every line E1 to E8", St.verdictText(J()) === exact);
    const tl = St.table(cell(41, { n: 60, completed: 5, medianChord: 981 }), cell(1, { n: 60, completed: 43, medianChord: 730, medianMJ: NaN }), bins(0, 5, 18, 28), bins(0, 0, 0, 3), "T").split("\n");
    ok("!! a table row is exact: the name padded to 45, n to 3, each count to its column's width, the median MJ to two places or `n/a`, the chord to whole metres", tl[2] === "A1  series B's flyer on main's HELD83 missions |  60 |         5 |         41 |        0 |    0 |       0 |      2.50 | 981" && tl[3] === "A2  main's flyer on series B's HELD10 missions |  60 |        43 |          1 |        0 |    0 |       0 |       n/a | 730");
    ok("!! the name column is 45 wide: a short row (B1) has its first separator at index 45, a name over 45 is not cut", St.table(null, null, [cell(0)], [], "T").split("\n")[4].indexOf(" | ") === 45 && tl[2].indexOf(" | ") === 46 && tl[3].indexOf(" | ") === 46);
    const bk = (k) => ({ n: 3, completed: 1, energyOut: 2, collided: 0, left: 0, timeout: 0, other: 0, medianMJ: 1, medianChord: 1000 + k });
    ok("!! the table names every bin window and arm: B1 to B4 reference then B1 to B4 the 2.5 m/s arm", St.table(null, null, [0, 1, 2, 3].map(bk), [0, 1, 2, 3].map(bk), "T").split("\n").slice(4).map((l) => l.slice(0, 40).trim()).join("|") === "B1  reference, chord [600, 750)|B2  reference, chord [750, 900)|B3  reference, chord [900, 1050)|B4  reference, chord [1050, 1200)|B1  2.5 m/s arm, chord [600, 750)|B2  2.5 m/s arm, chord [750, 900)|B3  2.5 m/s arm, chord [900, 1050)|B4  2.5 m/s arm, chord [1050, 1200)");

    const run = (argv, io = {}) => { const o = [], e = [], w = []; const code = St.command(argv, { out: (m) => o.push(m), err: (m) => e.push(m), writeFile: (f, d) => w.push([f, d]), exists: () => false, ...io }); return { code, o: o.join("\n"), e: e.join("\n"), w }; };
    const binOf = (b) => R.BINS.findIndex(([lo, hi]) => b.chord >= lo && b.chord <= hi);
    const disc = { main: () => ({ status: "flat", ticks: 1, path: 1 }), b: (b, arm) => { const k = binOf(b), out = arm === R.REFERENCE ? (k >= 2 ? "energy-out" : "completed") : (k === 3 ? "timeout" : "completed"); return { flyer: "b", seed: b.seed, arm, outcome: out, status: out, legs: 2, path: 1000, energy: 1e6 * (k + 1), chord: b.chord, t: null, ticks: 5 }; } };
    const rd = run(["--set", "held13", "--seeds", "2", "--write"], { fly: disc, read: () => "" }), lines = rd.o.split("\n"), cellsOf = (prefix) => (lines.find((l) => l.startsWith(prefix)) || "").split("|").map((x) => x.trim());
    ok("!! the header names the parts: 2 of main's missions, 2 of series B's, 4 chord bins of 2 (the --seeds, not the registered 30)", /^HELD13: PART A 2 of main's missions by series B's flyer and 2 of series B's by main's, the reference arm; PART B 4 chord bins of 2, the reference and the 2.5 m\/s arm$/.test(lines[0]));
    const rows = rd.w[0][1].trim().split("\n").map((l) => JSON.parse(l)), rowsB = rows.filter((r) => r.part === "B");
    ok("!! every part B flight is recorded in the bin its mission's chord falls in, 8 flights a bin ... 2 missions x 2 arms", rowsB.length === 16 && rowsB.every((r) => r.bin === binOf({ chord: r.chord }) + 1) && [1, 2, 3, 4].every((k) => rowsB.filter((r) => r.bin === k).length === 4) && rows.filter((r) => r.part === "A1").length === 2 && rows.filter((r) => r.part === "A2").length === 2);
    ok("!! each bin's reference row counts its own flights: energy-out 0, 0, 2, 2 and a median of 1, 2, 3, 4 MJ (the energy of that bin's flights, so the bins are not mixed)", [["B1", 0, "1.00"], ["B2", 0, "2.00"], ["B3", 2, "3.00"], ["B4", 2, "4.00"]].every(([k, eo, mj]) => { const c = cellsOf(`${k}  reference`); return c[1] === "2" && c[3] === String(eo) && c[7] === mj; }));
    ok("!! each bin's 2.5 m/s row counts its own flights: timeouts 0, 0, 0, 2, and none of the reference's energy-outs", [["B1", 0], ["B2", 0], ["B3", 0], ["B4", 2]].every(([k, to]) => { const c = cellsOf(`${k}  2.5 m/s arm`); return c[1] === "2" && c[3] === "0" && c[6] === String(to); }));
    const stM = [7941, 7942].flatMap((sd) => [{ seed: sd, arm: R.REFERENCE, status: sd === 7941 ? "flat" : "collided" }, { seed: sd, arm: "any+predict", status: "completed" }]), stB = [1001, 1002].flatMap((sd) => [{ seed: sd, arm: R.REFERENCE, status: "collided" }, { seed: sd, arm: "any+predict+edge", status: "energy-out" }]);
    const readStored = (f) => (f.endsWith("navMissionHeld83.jsonl") ? stM : f.endsWith("subMissionHeld10.jsonl") ? stB : []).map((x) => JSON.stringify(x)).join("\n");
    const ra = run(["--set", "held13", "--seeds", "2", "--write"], { fly: disc, read: readStored });
    ok("!! the per-mission agreement is read from the REFERENCE rows of each stored file (the other arm's rows say the opposite): A1 50% (7941 energy-out and flat agree, 7942 energy-out and collided do not), A2 100% (1001 and 1002 collided both ways)", /per-mission agreement on energy-out against not: A1 50%, A2 100%$/m.test(ra.o) && /E6 .*MISSED$/m.test(ra.o));
    ok("!! with no stored flights the agreement reads `n/a`, not 0% or 100%", /per-mission agreement on energy-out against not: A1 n\/a, A2 n\/a$/m.test(rd.o));
    ok("!! the break-even line is exact: a chord of 927 m for 2,675 J/m, to whole metres and whole joules", /battery 3\.0 MJ; cruise break-even chord 927 m \(J\/m 2675, path over chord 1\.21\)/.test(rd.o));
    const im = spawnSync(process.execPath, ["--input-type=module", "-e", `import(${JSON.stringify(path.join(HERE, "subReconcileStudy.mjs"))}).then(() => console.log("IMPORTED"))`], { encoding: "utf8", timeout: 60000 });
    ok("!! imported (not run as the command), the file prints nothing and flies nothing: the only output is the importer's own", im.status === 0 && im.stdout === "IMPORTED\n" && im.stderr === "", JSON.stringify(im.stdout.slice(0, 60)));
    const px = spawnSync(process.execPath, [path.join(HERE, "subReconcileStudy.mjs"), "--set", "dev", "--seeds", "1"], { encoding: "utf8", timeout: 180000 });
    ok("!! run as a process the command reads the stored flights itself and both flyers reproduce them (10 flights)", px.status === 0 && /drift check: both flyers reproduce their stored reference flights \(10 flights\)/.test(px.stdout));
}

console.log(`\nsubReconcileStudy-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
