// WebGLEngine/tools/ship/subSensedStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subSensedStudy-selfcheck.mjs      (~15 s)
//
// THE STUDY OF THE SENSED MAP (tools/ship/subSensedStudy.mjs), held to the registration (brain/SENSED_NAV_WIP.md) before HELD6 is flown:
//   1  THE CONSTANTS   the output file, the sets (DEV and HELD6, the module's own), the thresholds, the median
//   2  THE SUMMARY     a cell counts flights by status per kind and arm; the medians (time and path over the chord of the ARRIVALS, clearance of ALL, the share of the grid ensonified and the offset at the end where the arm reports them); only the arms flown get a cell; the three kinds pooled
//   3  THE VERDICT     the bar in each kind (islands 80% and at most 6 collisions, gaps 60%, current 70%, each at its boundary), the verdict over 3, 2, 1 and 0 bars, N1 to N7 each at its boundary, a missing arm is a miss
//   4  THE TEXT        the table (a block for each kind, then the three kinds pooled, a number in every column), the verdict block (each line reads its own judgement)
//   5  THE COMMAND     bad arguments (exit 2, named), the scenarios flown by default, a short DEV run end to end, --write goes with held6 only and puts one JSON line a flight in brain/subSensedHeld6.jsonl
//
// SABOTAGE LOG -- (filled in below after the mutants have been run)
"use strict";
import path from "node:path";
import * as St from "./subSensedStudy.mjs";
import * as X from "../../brain/subSensedNav.mjs";
import * as H from "../../brain/subHardNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const guard = (n, f) => { try { f(); } catch (e) { fails++; console.log(`  FAIL  !! section ${n} ran to the end (THE GATE THREW: ${String((e && e.message) || e).slice(0, 160)})`); } };
const run = (kind, arm, o = {}) => ({ kind, seed: 1, arm, status: "reached", reached: true, t: 100, path: 400, chord: 380, minClearance: 10, ...o });
const lose = (status, o = {}) => ({ status, reached: false, t: null, ...o });
console.log("subSensedStudy-selfcheck -- the study of the sensed map\n");

guard("1", () => {
    console.log("1. THE CONSTANTS");
    ok("!! the output is brain/subSensedHeld6.jsonl; the sets are the module's own DEV (1 to 30) and HELD6 (601 to 660); the thresholds: the fix within 5 flights, 6 island hits, the path at most 1.2 times exact's, two bars for PARTLY", St.OUT === "brain/subSensedHeld6.jsonl" && same(St.SETS.dev, X.SENSE_SETS.dev) && same(St.SETS.held6, X.SENSE_SETS.held6) && Object.isFrozen(St.SETS) && St.THRESH.fixWithin === 5 && St.THRESH.islandHits === 6 && St.THRESH.pathFactor === 1.2 && St.THRESH.barsForPartly === 2 && Object.isFrozen(St.THRESH));
    const xs = [9, 1, 5];
    ok("!! median: the middle of an odd count (5, 1, 3 -> 3), the mean of the middle two of an even one (1, 2, 3, 10 -> 2.5), NaN for none; the input is not sorted in place", St.median([5, 1, 3]) === 3 && St.median([1, 2, 3, 10]) === 2.5 && Number.isNaN(St.median([])) && (St.median(xs), xs.join() === "9,1,5"));
});

guard("2", () => {
    console.log("\n2. THE SUMMARY");
    const k = "hard-islands", a = "sensed+fix";
    const runs = [run(k, a, { t: 100, path: 380 * 1.1, minClearance: 10, ensonified: 0.5, offsetEnd: 2 }), run(k, a, { t: 120, path: 380 * 1.3, minClearance: 20, ensonified: 0.6, offsetEnd: 4 }), run(k, a, { ...lose("collided"), minClearance: -0.1, ensonified: 0.3, offsetEnd: 6 }), run(k, a, { ...lose("collided"), minClearance: -0.2, ensonified: 0.4, offsetEnd: 8 }),
        run(k, a, { ...lose("timeout"), minClearance: 2, ensonified: 0.7, offsetEnd: 1 }), run(k, a, { ...lose("timeout"), minClearance: 2.5, ensonified: 0.75, offsetEnd: 1.5 }), run(k, a, { ...lose("left"), minClearance: 3, ensonified: 0.8, offsetEnd: 3 }), run(k, a, { ...lose("broached"), minClearance: 4, ensonified: 0.2, offsetEnd: 5 }),
        run("hard-gaps", a, { t: 200, path: 380 * 1.5 }), run(k, "exact", { t: 90 })];
    const sum = safe(() => St.summarize(runs)), x = sum && sum.cells[k] && sum.cells[k][a];
    ok("!! a cell counts flights by status: of eight sensed+fix flights in hard-islands 2 reached, 2 collided, 2 timed out, 1 left, 1 other (broached); the rate is reached/n (2 of 8)", !!x && x.n === 8 && x.reached === 2 && x.collided === 2 && x.timeout === 2 && x.left === 1 && x.other === 1 && near(x.rate, 2 / 8));
    ok("!! the median time and path over the chord are over the ARRIVALS only (100 and 120 s: 110; 1.1 and 1.3: 1.2), the median clearance over ALL (-0.2, -0.1, 2, 2.5, 3, 4, 10, 20: 2.75), the share ensonified and the offset at the end over all eight (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8: 0.55; 1, 1.5, 2, 3, 4, 5, 6, 8: 3.5)", !!x && near(x.medianTime, 110) && near(x.medianChord, 1.2, 1e-9) && near(x.medianClearance, 2.75) && near(x.medianSeen, 0.55) && near(x.medianOffsetEnd, 3.5));
    ok("!! flights are told apart by KIND and by ARM: the same arm in hard-gaps is its own cell (1 flight, 200 s), `exact` in hard-islands is another (90 s), an arm not flown in a kind has no cell, and the arms of a kind are keyed in STUDY_ARMS order", !!sum && sum.cells["hard-gaps"][a].n === 1 && sum.cells["hard-gaps"][a].medianTime === 200 && sum.cells[k].exact.medianTime === 90 && sum.cells["hard-current"][a] === undefined && Object.keys(sum.cells[k]).join() === "exact,sensed+fix" && same(Object.keys(sum.cells), X.SENSE_KINDS));
    ok("!! the cells without an ensonified share or an offset (the arms of subHardNav) say NaN for them and not zero; the three kinds POOLED are a cell per arm over every flight of it (sensed+fix: 9 flights, 3 arrivals)", Number.isNaN(sum.cells[k].exact.medianSeen) && Number.isNaN(sum.cells[k].exact.medianOffsetEnd) && sum.pooled[a].n === 9 && sum.pooled[a].reached === 3 && sum.pooled.exact.n === 1 && sum.pooled.straight === undefined);
    const other = St.summarize([run("hard-traffic", a)]);
    ok("!! a flight of any other kind (traffic) is not counted anywhere, in a kind or pooled", Object.keys(other.pooled).length === 0 && X.SENSE_KINDS.every((q) => Object.keys(other.cells[q]).length === 0));
});

guard("3", () => {
    console.log("\n3. THE VERDICT");
    const cell = (n, reached, o = {}) => ({ n, reached, rate: reached / n, collided: 0, left: 0, timeout: 0, other: 0, medianTime: 150, medianChord: 1.1, medianClearance: 5, medianSeen: 0.5, medianOffsetEnd: 3, ...o });
    const base = () => ({
        cells: {
            "hard-islands": { straight: cell(60, 30), exact: cell(60, 58), sensed: cell(60, 54), "sensed+fix": cell(60, 52, { collided: 5 }), "sensed+drift": cell(60, 50) },
            "hard-gaps": { straight: cell(60, 5), exact: cell(60, 58), sensed: cell(60, 40), "sensed+fix": cell(60, 38), "sensed+drift": cell(60, 36) },
            "hard-current": { straight: cell(60, 10), exact: cell(60, 56), sensed: cell(60, 50), "sensed+fix": cell(60, 48), "sensed+drift": cell(60, 46) },
        },
        pooled: { sensed: cell(180, 144, { medianChord: 1.2 }), exact: cell(180, 172, { medianChord: 1.1 }), "sensed+fix": cell(180, 138), "sensed+drift": cell(180, 132) },
    });
    const mod = (f) => { const s = base(); f(s.cells, s.pooled); return safe(() => St.judge(s)); };
    const jb = safe(() => St.judge(base()));
    ok("!! the base case holds every bar and N1 to N7: SUPPORTED (3 of 3 bars)", !!jb && jb.bars["hard-islands"] && jb.bars["hard-gaps"] && jb.bars["hard-current"] && jb.held === 3 && jb.verdict === "SUPPORTED" && [jb.n1, jb.n2, jb.n3, jb.n4, jb.n5, jb.n6, jb.n7].every((v) => v === true));
    ok("!! the island bar is 80% (48 of 60 holds, 47 fails) AND at most 6 collisions (6 holds, 7 fails)", mod((c) => { c["hard-islands"]["sensed+fix"] = cell(60, 48, { collided: 6 }); }).bars["hard-islands"] === true && mod((c) => { c["hard-islands"]["sensed+fix"] = cell(60, 47); }).bars["hard-islands"] === false && mod((c) => { c["hard-islands"]["sensed+fix"] = cell(60, 52, { collided: 7 }); }).bars["hard-islands"] === false);
    ok("!! the gap bar is 60% (36 of 60 holds, 35 fails) and the current bar 70% (42 holds, 41 fails); collisions do not count in them", mod((c) => { c["hard-gaps"]["sensed+fix"] = cell(60, 36, { collided: 20 }); }).bars["hard-gaps"] === true && mod((c) => { c["hard-gaps"]["sensed+fix"] = cell(60, 35); }).bars["hard-gaps"] === false && mod((c) => { c["hard-current"]["sensed+fix"] = cell(60, 42, { collided: 15 }); }).bars["hard-current"] === true && mod((c) => { c["hard-current"]["sensed+fix"] = cell(60, 41); }).bars["hard-current"] === false);
    ok("!! each bar reads the DESIGNATED arm (sensed+fix) of ITS kind: a failing `sensed` in the island does not fail the bar, a failing sensed+fix in the gaps fails only the gap bar", mod((c) => { c["hard-islands"].sensed = cell(60, 10); }).bars["hard-islands"] === true && (() => { const j = mod((c) => { c["hard-gaps"]["sensed+fix"] = cell(60, 10); }); return j.bars["hard-gaps"] === false && j.bars["hard-islands"] === true && j.bars["hard-current"] === true; })());
    const bars = (n) => mod((c) => { const keep = ["hard-islands", "hard-gaps", "hard-current"].slice(0, n); for (const k of ["hard-islands", "hard-gaps", "hard-current"]) if (!keep.includes(k)) c[k]["sensed+fix"] = cell(60, 1); });
    ok("!! the verdict rule: 3 bars SUPPORTED; 2 PARTLY SUPPORTED; 1 NOT SUPPORTED; 0 NOT SUPPORTED (and the count is reported)", bars(3).verdict === "SUPPORTED" && bars(3).held === 3 && bars(2).verdict === "PARTLY SUPPORTED" && bars(2).held === 2 && bars(1).verdict === "NOT SUPPORTED" && bars(1).held === 1 && bars(0).verdict === "NOT SUPPORTED" && bars(0).held === 0);
    ok("!! N1: exact reaches at least as many as sensed in EACH kind (equal holds; one fewer in any kind fails)", mod((c) => { c["hard-gaps"].exact = cell(60, 40); }).n1 === true && mod((c) => { c["hard-current"].exact = cell(60, 49); }).n1 === false && mod((c) => { c["hard-islands"].exact = cell(60, 53); }).n1 === false);
    ok("!! N2: sensed reaches MORE than straight in each kind (equal fails)", mod((c) => { c["hard-gaps"].straight = cell(60, 40); }).n2 === false && mod((c) => { c["hard-gaps"].straight = cell(60, 39); }).n2 === true && mod((c) => { c["hard-islands"].straight = cell(60, 54); }).n2 === false);
    ok("!! N3: sensed+fix within 5 flights of sensed in each kind, either way (5 below and 5 above hold; 6 fails); one kind breaking it fails", mod((c) => { c["hard-gaps"]["sensed+fix"] = cell(60, 35); }).n3 === true && mod((c) => { c["hard-gaps"]["sensed+fix"] = cell(60, 45); }).n3 === true && mod((c) => { c["hard-gaps"]["sensed+fix"] = cell(60, 34); }).n3 === false && mod((c) => { c["hard-gaps"]["sensed+fix"] = cell(60, 46); }).n3 === false && mod((c) => { c["hard-current"]["sensed+fix"] = cell(60, 43); }).n3 === false);
    ok("!! N4: over the three kinds sensed+drift reaches FEWER than sensed+fix (equal fails)", mod((c, p) => { p["sensed+drift"] = cell(180, 138); }).n4 === false && mod((c, p) => { p["sensed+drift"] = cell(180, 137); }).n4 === true && mod((c, p) => { p["sensed+drift"] = cell(180, 150); }).n4 === false);
    ok("!! N5: sensed reaches a lower share in hard-gaps than in BOTH other kinds (equal to either fails; lower than the current only, or than the islands only, fails)", mod((c) => { c["hard-gaps"].sensed = cell(60, 50); }).n5 === false && mod((c) => { c["hard-gaps"].sensed = cell(60, 54); }).n5 === false && mod((c) => { c["hard-gaps"].sensed = cell(60, 49); }).n5 === true && mod((c) => { c["hard-current"].sensed = cell(60, 40); }).n5 === false && mod((c) => { c["hard-islands"].sensed = cell(60, 30); }).n5 === false);
    ok("!! N6: sensed+fix collides at most 6 times in hard-islands (7 fails); collisions elsewhere do not count", mod((c) => { c["hard-islands"]["sensed+fix"] = cell(60, 52, { collided: 6 }); }).n6 === true && mod((c) => { c["hard-islands"]["sensed+fix"] = cell(60, 52, { collided: 7 }); }).n6 === false && mod((c) => { c["hard-gaps"]["sensed+fix"] = cell(60, 38, { collided: 22 }); }).n6 === true);
    ok("!! N7: the pooled median path over the chord of sensed's arrivals at most 1.2 times exact's (1.1: 1.32 holds, 1.321 fails) and the ratio is reported; NaN fails", mod((c, p) => { p.sensed = cell(180, 144, { medianChord: 1.32 }); }).n7 === true && mod((c, p) => { p.sensed = cell(180, 144, { medianChord: 1.321 }); }).n7 === false && near(jb.pathRatio, 1.2 / 1.1) && mod((c, p) => { p.sensed = cell(180, 0, { medianChord: NaN }); }).n7 === false);
    ok("!! a missing arm is a miss, not a crash (no designated arm anywhere: every bar false, NOT SUPPORTED, N1 to N7 that need it false)", (() => { const j = mod((c, p) => { for (const k of Object.keys(c)) delete c[k]["sensed+fix"]; delete p["sensed+fix"]; }); return !!j && j.held === 0 && j.verdict === "NOT SUPPORTED" && j.n3 === false && j.n4 === false && j.n6 === false; })());
});

guard("4", () => {
    console.log("\n4. THE TEXT");
    const runs = [run("hard-islands", "sensed+fix", { ensonified: 0.5, offsetEnd: 4.5 }), run("hard-islands", "sensed+fix", { ...lose("collided"), ensonified: 0.3, offsetEnd: 6 }), run("hard-gaps", "exact", { t: 130 }), run("hard-current", "straight", lose("collided"))];
    const sum = St.summarize(runs), tbl = safe(() => St.table(sum, "A TITLE"), ""), lines = tbl.split("\n");
    ok("!! the table has the title first, then for each kind its name, a header and a line for each arm flown, then the three kinds together (the sensed+fix line of hard-islands: 1/2 50%, 1 collided, 40% ensonified, 5.25 m offset at the end)", lines[0] === "A TITLE" && lines.includes("hard-islands") && lines.includes("hard-gaps") && lines.includes("hard-current") && lines.includes("the three kinds together") && lines.filter((l) => /^arm /.test(l)).length === 4 && /^sensed\+fix\s+\| 1\/2 50%\s+\|\s+1\s+0\s+0\s+0 \|/m.test(tbl) && /\| 40%\s+\| 5\.25$/m.test(tbl));
    const hand = { cells: { "hard-islands": { "sensed+fix": { n: 60, reached: 50, rate: 50 / 60, collided: 4, left: 2, timeout: 3, other: 1, medianTime: 123.45, medianChord: 1.234, medianClearance: 7.89, medianSeen: 0.567, medianOffsetEnd: 4.56 } }, "hard-gaps": {}, "hard-current": {} }, pooled: { "sensed+fix": { n: 180, reached: 90, rate: 0.5, collided: 11, left: 7, timeout: 5, other: 2, medianTime: 99.5, medianChord: 1.5, medianClearance: 3.25, medianSeen: 0.25, medianOffsetEnd: 6.5 } } }, htbl = safe(() => St.table(hand, "T"), "");
    ok("!! each column of the table is its own number: reached 50/60 83%, collided 4, left 2, timeout 3, other 1, the median time 123.45, the path over the chord 1.23, the clearance 7.89, the grid ensonified 57%, the offset at the end 4.56 (in that order, last); the pooled block has its own line (90/180 50%, 99.50, 1.50, 3.25, 25%, 6.50)", /sensed\+fix\s+\| 50\/60 83%\s+\|\s+4\s+2\s+3\s+1 \| 123\.45\s+\| 1\.23\s+\| 7\.89\s+\| 57%\s+\| 4\.56$/m.test(htbl) && htbl.split("the three kinds together")[1].includes("90/180 50%") && /\| 99\.50\s+\| 1\.50\s+\| 3\.25\s+\| 25%\s+\| 6\.50$/m.test(htbl) && /grid ensonified/.test(htbl) && /offset at end/.test(htbl));
    const nan = safe(() => St.table({ cells: { "hard-islands": { sensed: { n: 3, reached: 0, rate: 0, collided: 3, left: 0, timeout: 0, other: 0, medianTime: NaN, medianChord: NaN, medianClearance: -0.1, medianSeen: NaN, medianOffsetEnd: NaN } }, "hard-gaps": {}, "hard-current": {} }, pooled: {} }, "T"), "");
    ok("!! a number that is not there prints as n/a (not NaN, not blank): the time, the path, the share and the offset of an arm that never arrived", /sensed\s+\| 0\/3 0%\s+\|\s+3\s+0\s+0\s+0 \| n\/a\s+\| n\/a\s+\| -0\.10\s+\| n\/a\s+\| n\/a$/m.test(nan) && !/NaN/.test(nan));
    const jx = { bars: { "hard-islands": true, "hard-gaps": false, "hard-current": true }, held: 2, verdict: "PARTLY SUPPORTED", n1: true, n2: false, n3: true, n4: false, n5: true, n6: false, n7: true, pathRatio: 1.1 }, vx = safe(() => St.verdictText(jx), "").split("\n"), vy = safe(() => St.verdictText({ ...jx, bars: { "hard-islands": true, "hard-gaps": true, "hard-current": false }, held: 2 }), "").split("\n");
    ok("!! each line of the verdict block reads ITS OWN judgement: the designated arm's three bars (HELD, MISSED, HELD, and '2 of 3 bars') on the first; N1 HELD, N2 MISSED, N3 HELD, N4 MISSED, N5 HELD, N6 MISSED, N7 HELD with the ratio (it is 1.10); the last line VERDICT: PARTLY SUPPORTED", vx.length === 9 && /of hard-islands with at most 6 collisions: HELD; at least 60% of hard-gaps: MISSED; at least 70% of hard-current: HELD {2}\(2 of 3 bars\)$/.test(vx[0]) && /^N1 .*: HELD$/.test(vx[1]) && /^N2 .*: MISSED$/.test(vx[2]) && /^N3 .*: HELD$/.test(vx[3]) && /^N4 .*: MISSED$/.test(vx[4]) && /^N5 .*: HELD$/.test(vx[5]) && /^N6 .*: MISSED$/.test(vx[6]) && /^N7 .*\(it is 1\.10\): HELD$/.test(vx[7]) && vx[8] === "VERDICT: PARTLY SUPPORTED" && /of hard-islands with at most 6 collisions: HELD; at least 60% of hard-gaps: HELD; at least 70% of hard-current: MISSED {2}\(2 of 3 bars\)$/.test(vy[0]));
});

guard("5", () => {
    console.log("\n5. THE COMMAND");
    const call = (argv) => { const o = [], e = [], w = []; const code = safe(() => St.command(argv, { out: (m) => o.push(m), err: (m) => e.push(m), writeFile: (p, c) => w.push([p, c]) }), -1); return { code, out: o.join("\n"), err: e.join("\n"), w }; };
    ok("!! a bad argument is exit 2 with a message naming it: an unknown flag, --set with an unknown name, --seeds that is not a positive whole number (0, 2.5, none), --write with the DEV set", call(["--bogus"]).code === 2 && /unknown argument "--bogus"/.test(call(["--bogus"]).err) && call(["--set", "held4"]).code === 2 && /--set needs one of dev, held6/.test(call(["--set", "held4"]).err) && call(["--seeds", "0"]).code === 2 && call(["--seeds", "2.5"]).code === 2 && call(["--seeds"]).code === 2 && /--seeds needs a positive whole number/.test(call(["--seeds", "0"]).err) && call(["--write"]).code === 2 && /--write goes with --set held6 only/.test(call(["--write"]).err));
    const first = (argv) => { let line = null; try { St.command(argv, { out: (m) => { line = m; throw new Error("stop"); }, err: () => {}, writeFile: () => {} }); } catch { /* stopped on purpose after the first line */ } return line; };
    ok("!! the scenarios flown are the set's: no --seeds is the WHOLE set (DEV 30 of each kind, HELD6 60), --seeds N the first N (3), more than the set has is the set (99 of DEV: 30) -- read from the first line, before any flight; the line names the three kinds and the five arms", /^DEV set: 30 scenarios of each of hard-islands, hard-gaps, hard-current, 5 arms/.test(first([]) || "") && /^HELD6 set: 60 scenarios of each/.test(first(["--set", "held6"]) || "") && /^DEV set: 3 scenarios of each/.test(first(["--seeds", "3"]) || "") && /^DEV set: 30 scenarios of each/.test(first(["--seeds", "99"]) || ""));
    const d = call(["--set", "dev", "--seeds", "1"]);
    ok("!! a DEV run of one seed: exit 0, every kind has its block with every arm and 1 flight, the three kinds together, the verdict block follows, nothing is written, and the title names the sonar, the fix and the drift", d.code === 0 && X.SENSE_KINDS.every((k) => d.out.includes("\n" + k + "\n")) && X.STUDY_ARMS.every((a) => new RegExp("^" + a.replace(/\+/g, "\\+") + "\\s+\\| \\d\\/1 ", "m").test(d.out)) && /^VERDICT: /m.test(d.out) && d.w.length === 0 && d.err === "" && /sonar 100 m \+-60 degrees every 1 s, fix sigma 3 m, drift 0.3 m per root s/.test(d.out) && /ladder 12, 8, 6, 3 m, 260 s a flight/.test(d.out));
    const w = call(["--set", "held6", "--seeds", "1", "--write"]), lines = w.w.length ? w.w[0][1].trim().split("\n").map((l) => JSON.parse(l)) : [];
    ok("!! --write with held6 puts one JSON line a flight in brain/subSensedHeld6.jsonl (3 kinds x 5 arms = 15 for one seed), each tagged set 'held6', seed 601, kind by kind in SENSE_KINDS order and in STUDY_ARMS order within a kind, to an absolute path under the engine, and says so", w.code === 0 && w.w.length === 1 && path.isAbsolute(w.w[0][0]) && w.w[0][0].endsWith("brain/subSensedHeld6.jsonl") && lines.length === 15 && lines.every((r) => r.set === "held6" && r.seed === 601) && same(lines.map((r) => r.kind), X.SENSE_KINDS.flatMap((k) => X.STUDY_ARMS.map(() => k))) && same(lines.map((r) => r.arm), X.SENSE_KINDS.flatMap(() => X.STUDY_ARMS)) && w.out.includes("wrote 15 flights to brain/subSensedHeld6.jsonl"));
    const direct = safe(() => X.flySensed(St.pilot, H.hardScenario(601, "hard-gaps"), "sensed+fix")), rec = lines.find((r) => r.kind === "hard-gaps" && r.arm === "sensed+fix");
    ok("!! the flights in the file are the library's own flights of the HELD6 scenarios on the PD autopilot (seed 601, hard-gaps, sensed+fix: the same status, ticks, plans and path as a direct flySensed)", !!rec && !!direct && rec.status === direct.status && rec.ticks === direct.ticks && rec.plans === direct.plans && near(rec.path, direct.path, 1e-9));
});

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
