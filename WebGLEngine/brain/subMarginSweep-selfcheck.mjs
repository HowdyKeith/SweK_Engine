// WebGLEngine/brain/subMarginSweep-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subMarginSweep-selfcheck.mjs      (about 12 s)
//
// THE ANY-ANGLE ARM'S MARGINS SWEPT (brain/subMarginSweep.mjs), held to its word before HELD9 is flown ("FOLLOW-UP 9" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   kinds, the arm, tops, verticals, the incumbent, the 20 cells in order, the sets
//   2  THE LADDER      the top rung then the incumbent rungs below it
//   3  THE SCENARIO    minDepth moved by (V - 5), nothing else touched, V = 5 the same object, and what it does to the plan's block test by hand
//   4  THE FLIGHT      the incumbent cell is flyHard's `any` flight (the identity), the record, errors, a golden of four cells on DEV
//
// SABOTAGE LOG (serial mutation pass of brain/subMarginSweep.mjs, one mutant per code line and operator, at most four of each operator on a line): 17 mutants; 16 red on the first pass and 1 survivor (the grid-membership test with the vertical margin compared by `!==`: a bad cell with a good top rung and a bad vertical margin, (12, 6), was not in the rows). The row was added and the mutant killed (checked: red).
//   Everything is therefore killed; the file is small (a grid, a ladder, a scenario copy and one flight function). NOT CHECKED, said plainly: the generator takes at most four mutants of an operator on a line; the golden freezes what four cells reach on DEV today and does not say it is right.
"use strict";
import * as M from "./subMarginSweep.mjs";
import * as H from "./subHardNav.mjs";
import * as AP from "./autopilotSub.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pilot = (s, t, c) => AP.decide(s, t, c);
console.log("subMarginSweep-selfcheck -- the any-angle arm's margins swept\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the two static kinds, the arm `any`", same(M.KINDS, ["hard-islands", "hard-gaps"]) && M.ARM === "any");
    ok("!! tops 8, 12, 16, 20, 24 and verticals 2, 5, 8, 12; the incumbent is (12, 5)", same(M.TOPS, [8, 12, 16, 20, 24]) && same(M.VERTS, [2, 5, 8, 12]) && M.INCUMBENT.top === 12 && M.INCUMBENT.vert === 5 && M.INCUMBENT.vert === H.VMARGIN && M.INCUMBENT.top === H.MARGIN_LADDER[0]);
    ok("!! twenty cells, tops outer and verticals inner: the first is (8, 2), the fifth (12, 2)... the second (8, 5), the last (24, 12)", M.CELLS.length === 20 && same(M.CELLS[0], { top: 8, vert: 2 }) && same(M.CELLS[1], { top: 8, vert: 5 }) && same(M.CELLS[4], { top: 12, vert: 2 }) && same(M.CELLS[19], { top: 24, vert: 12 }));
    ok("!! cellName is T<top>V<vert>; isIncumbent holds only for (12, 5)", M.cellName({ top: 16, vert: 8 }) === "T16V8" && M.CELLS.filter(M.isIncumbent).length === 1 && M.isIncumbent({ top: 12, vert: 5 }) && !M.isIncumbent({ top: 12, vert: 8 }) && !M.isIncumbent({ top: 8, vert: 5 }));
    ok("!! DEV is seeds 1 to 30 (subHardNav's); HELD9 is 901 to 960 (60 seeds)", M.SETS.dev === H.HARD_SETS.dev && M.HELD9.length === 60 && M.HELD9[0] === 901 && M.HELD9[59] === 960 && M.SETS.held9 === M.HELD9);
}
console.log("\n2. THE LADDER");
{
    ok("!! the incumbent's top rung gives the incumbent ladder 12, 8, 6, 3", M.ladderFor(12).join() === "12,8,6,3");
    ok("!! a top of 8 gives 8, 6, 3 (the 12 is not below 8; the 8 itself is not repeated)", M.ladderFor(8).join() === "8,6,3");
    ok("!! tops 16, 20, 24 give the top then 12, 8, 6, 3", M.ladderFor(16).join() === "16,12,8,6,3" && M.ladderFor(20).join() === "20,12,8,6,3" && M.ladderFor(24).join() === "24,12,8,6,3");
    ok("!! a top of 7 gives 7, 6, 3 (strictly below the top) and the ladder is frozen and does not change the incumbent's", M.ladderFor(7).join() === "7,6,3" && Object.isFrozen(M.ladderFor(12)) && H.MARGIN_LADDER.join() === "12,8,6,3");
}
console.log("\n3. THE SCENARIO");
{
    const sc = H.hardScenario(3, "hard-islands");
    ok("!! V = 5 (VMARGIN) returns the scenario itself", M.scenarioAt(sc, 5) === sc);
    const s2 = M.scenarioAt(sc, 2), s12 = M.scenarioAt(sc, 12), s8 = M.scenarioAt(sc, 8);
    ok("!! V = 2 raises minDepth by 3 (keel + 2 > md is keel + 5 > md + 3); V = 8 and V = 12 lower it by 3 and 7", near(s2.minDepth, sc.minDepth + 3) && near(s8.minDepth, sc.minDepth - 3) && near(s12.minDepth, sc.minDepth - 7));
    ok("!! nothing else changes (obstacles, start, goal, seed, kind, current, weight error are the same objects or equal) and the copy is frozen", same(s2.obstacles, sc.obstacles) && s2.obstacles === sc.obstacles && s2.start === sc.start && s2.goal === sc.goal && s2.seed === sc.seed && s2.kind === sc.kind && s2.current === sc.current && s2.weightError === sc.weightError && Object.isFrozen(s2));
    const count = (s) => H.planShapes(s, 0).length, byHand = (s, v) => s.obstacles.filter((o) => o.keel + v > s.minDepth).length;
    let seedFlip = null;
    for (let sd = 1; sd <= 30 && seedFlip === null; sd++) { const c = H.hardScenario(sd, "hard-islands"); if (byHand(c, 2) !== byHand(c, 12)) seedFlip = sd; }
    ok("!! there is a DEV seed where V = 2 and V = 12 block different numbers of obstacles (so the vertical margin can act)", seedFlip !== null, `seed ${seedFlip}`);
    const c = H.hardScenario(seedFlip || 1, "hard-islands");
    ok("!! the plan's shape count at V is the hand count of obstacles with keel + V above minDepth, at V = 2, 5, 8 and 12", [2, 5, 8, 12].every((v) => count(M.scenarioAt(c, v)) === byHand(c, v)), [2, 5, 8, 12].map((v) => `${count(M.scenarioAt(c, v))}/${byHand(c, v)}`).join(" "));
}
console.log("\n4. THE FLIGHT");
{
    const seed = 3, r0 = safe(() => M.flyCell(pilot, seed, "hard-islands", M.INCUMBENT)), hh = H.flyHard(pilot, H.hardScenario(seed, "hard-islands"), "any");
    ok("!! the incumbent cell is flyHard's `any` flight: same status, time, path, ticks, clearance, margin", !!r0 && r0.status === hh.status && r0.t === hh.t && r0.path === hh.path && r0.ticks === hh.ticks && r0.minClearance === hh.minClearance && r0.margin === hh.margin, `${r0 && r0.status} ${hh.status}`);
    ok("!! the record adds cell, top, vert and the ladder as a string: T12V5, 12, 5, \"12,8,6,3\"; reached matches status", !!r0 && r0.cell === "T12V5" && r0.top === 12 && r0.vert === 5 && r0.ladder === "12,8,6,3" && r0.reached === (r0.status === "reached") && r0.kind === "hard-islands" && r0.seed === seed);
    const r8 = safe(() => M.flyCell(pilot, seed, "hard-gaps", { top: 8, vert: 12 }));
    ok("!! another cell and kind: the record names them (T8V12, hard-gaps, ladder 8,6,3)", !!r8 && r8.cell === "T8V12" && r8.ladder === "8,6,3" && r8.kind === "hard-gaps" && r8.top === 8 && r8.vert === 12);
    ok("!! the top rung acts: a first plan's margin under T = 24 on a roomy seed is above the incumbent's (the first rung that has a route is taken)", (() => { for (let sd = 1; sd <= 10; sd++) { const a = M.flyCell(pilot, sd, "hard-islands", { top: 24, vert: 5 }), b = M.flyCell(pilot, sd, "hard-islands", M.INCUMBENT); if (a.margin > b.margin) return true; } return false; })());
    ok("!! a flight is deterministic", same(safe(() => M.flyCell(pilot, seed, "hard-islands", { top: 16, vert: 8 })), safe(() => M.flyCell(pilot, seed, "hard-islands", { top: 16, vert: 8 }))));
    ok("!! a bad kind throws, naming the kinds; a cell that is not on the grid throws", (() => { let a = false, b = false; try { M.flyCell(pilot, 1, "hard-traffic", M.INCUMBENT); } catch (e) { a = /hard-islands, hard-gaps/.test(e.message); } let c = false; try { M.flyCell(pilot, 1, "hard-islands", { top: 13, vert: 5 }); } catch (e) { b = /20 cells/.test(e.message); } try { M.flyCell(pilot, 1, "hard-islands", { top: 12, vert: 6 }); } catch (e) { c = /20 cells/.test(e.message); } return a && b && c; })());
    const tally = (cell) => { let r = 0; for (const k of M.KINDS) for (const sd of M.SETS.dev) if (M.flyCell(pilot, sd, k, cell).reached) r++; return r; };
    const g = [{ top: 8, vert: 5 }, { top: 12, vert: 5 }, { top: 20, vert: 5 }, { top: 12, vert: 2 }].map(tally);
    ok("!! GOLDEN (a regression snapshot of this module's own flights on DEV, not a hand derivation; a change detector): reached of 60 under (8,5), (12,5), (20,5), (12,2)", same(g, [58, 59, 58, 59]), g.join());
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
