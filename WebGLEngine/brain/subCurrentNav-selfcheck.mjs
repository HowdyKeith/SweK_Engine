// WebGLEngine/brain/subCurrentNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subCurrentNav-selfcheck.mjs      (about 15 s)
//
// THE CURRENT IN THE FIELD (brain/subCurrentNav.mjs), held to its word before HELD7 is flown ("FOLLOW-UP 7" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   arms, strengths, the quarter-turn time 1.5708 x 35 / 3, the crab clamp, DEV and HELD7 seeds
//   2  THE CRAB        hand-computed headings: still sea and a following current leave the course, a cross current of 1.5 m/s at V = 3 crabs 30 degrees up-current, the clamp at 0.9, the opposite sign, rotation
//   3  THE MARGIN      |c| x T_TURN, the raised rungs first and the ordinary ladder after
//   4  THE SCENARIO    x1.0 is hardScenario unchanged; x1.5 multiplies the mean and the unsteady amplitude only
//   5  THE FLIGHT      the reference arm is flyHard's "any" flight (the identity), the record's fields, determinism, a bad arm or strength throws
//
// SABOTAGE LOG (serial mutation pass of brain/subCurrentNav.mjs, one mutant per code line and operator, at most four of each operator on a line, one worktree): 64 mutants; 45 red on the first pass and 19 survivors read one by one; FIVE rows were added for them (an exact tick count for a cut flight, the chord by hand, an exit test that is live across DEV, collided-iff-clearance-below-zero across DEV)
//   and the pass was run again: 64 mutants, 50 red, 14 survivors, every one declared EQUIVALENT or NOT REACHED: seabed 1000 -> 1001 (the model's floor does not touch a flight at depth; the flyHard identity row holds); `k === 1` -> `k === 2` (scaling by 1 is the identity); the first plan built at t = 1 for t = 0 and the first clearance read at t = 1 (hard-current has no ship, so nothing moves);
//   `<` -> `<=` on a float tie (the clearance against the minimum so far, against 0, the exit test at the region's edge, three of them); `dist < BIG` -> `<=` and `&&` -> `||` in noRoute (no scenario of DEV or HELD4 has no route, so no flight reaches that branch: NOT REACHED, said so); `&&` for `||` on the x lower edge and on the y lower edge of the region test (every DEV exit is through an upper edge or the y side that the other rows hold: NOT REACHED).
//   NOT CHECKED, said plainly: the generator takes at most four mutants of an operator on a line; the numbers 35 and 0.9 are in rows only through the hand-computed headings.
"use strict";
import * as C from "./subCurrentNav.mjs";
import * as H from "./subHardNav.mjs";
import * as AP from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pilot = (s, t, c) => AP.decide(s, t, c);
console.log("subCurrentNav-selfcheck -- the current in the field\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the four arms in order, the designated last, the reference first", same(C.CURRENT_ARMS, ["any", "any+crab", "any+margin", "any+crab+margin"]) && C.DESIGNATED === "any+crab+margin" && C.REFERENCE === "any");
    ok("!! two strengths, x1.0 and x1.5", same(C.STRENGTHS, { "x1.0": 1, "x1.5": 1.5 }));
    ok("!! T_TURN = (pi/2) x 35 / 3 = 18.326 s, cruise 3 m/s, turn radius 35 m, crab clamp 0.9", near(C.T_TURN, 18.32595714594046, 1e-9) && C.CRUISE === 3 && C.R_TURN === 35 && C.CRAB_MAX === 0.9, `${C.T_TURN}`);
    ok("!! DEV is seeds 1 to 30 (subHardNav's), HELD7 is 701 to 760 (60 seeds), the two sets do not overlap HELD4 (401 to 460)", C.SETS.dev === H.HARD_SETS.dev && C.HELD7.length === 60 && C.HELD7[0] === 701 && C.HELD7[59] === 760 && C.SETS.held7 === C.HELD7);
}
console.log("\n2. THE CRAB");
{
    const h = (g, c, V) => safe(() => C.crabHeading(g, c, V), NaN);
    ok("!! no current: the nose is on the course (0 and 1.2 rad)", near(h(0, [0, 0]), 0) && near(h(1.2, [0, 0]), 1.2));
    ok("!! a current along the course (following or head-on) needs no crab (course 0, current (1.5, 0) and (-1.5, 0))", near(h(0, [1.5, 0]), 0) && near(h(0, [-1.5, 0]), 0));
    ok("!! course 0 (east), current 1.5 m/s to the north (+y), V = 3: k = -0.5, the nose is 30 degrees to the SOUTH of east (the plan's heading is clockwise-positive with vy = -sin h, so +pi/6)", near(h(0, [0, 1.5], 3), Math.PI / 6, 1e-9), `${h(0, [0, 1.5], 3)}`);
    ok("!! the same current from the south (-y): the nose is 30 degrees to the north, -pi/6", near(h(0, [0, -1.5], 3), -Math.PI / 6, 1e-9));
    ok("!! a current too strong for the clamp (5 m/s across, V = 3): k clamps to -0.9, the nose is atan2(0.9, sqrt(0.19)) = 1.1198 rad", near(h(0, [0, 5], 3), Math.atan2(0.9, Math.sqrt(0.19)), 1e-9), `${h(0, [0, 5], 3)}`);
    ok("!! the default water speed is the cruise (course 0, current (0, 1.5) -> pi/6 without V)", near(h(0, [0, 1.5]), Math.PI / 6, 1e-9));
    ok("!! rotation: course pi/2 (south in the plan, velocity (0, -1)) with a current of 1.5 m/s along +x gives the same offset from the course: n = (1, 0) there, k = -0.5, so the nose is 30 degrees the other way round, pi/2 - pi/6 ... checked as the water + current track lying ON the course",
        (() => { const g = Math.PI / 2, c = [1.5, 0], n = C.crabHeading(g, c, 3), vx = 3 * Math.cos(n) + c[0], vy = -3 * Math.sin(n) + c[1], gx = Math.cos(g), gy = -Math.sin(g); return near(vx * gy - vy * gx, 0, 1e-9) && vx * gx + vy * gy > 0; })());
    ok("!! in general the ground track lies on the course when the clamp is not hit (course 0.7, current (0.4, -0.9), V 3): the cross-track speed is 0 and the along-track speed is positive",
        (() => { const g = 0.7, c = [0.4, -0.9], n = C.crabHeading(g, c, 3), vx = 3 * Math.cos(n) + c[0], vy = -3 * Math.sin(n) + c[1], gx = Math.cos(g), gy = -Math.sin(g); return near(vx * gy - vy * gx, 0, 1e-9) && vx * gx + vy * gy > 2; })());
}
console.log("\n3. THE MARGIN");
{
    ok("!! the drift margin of a (3, 4) current is 5 x T_TURN, of a still sea 0", near(C.driftMargin([3, 4]), 5 * C.T_TURN, 1e-9) && C.driftMargin([0, 0]) === 0);
    const L = C.raisedLadder([0.6, 0.8]), d = C.T_TURN;
    ok("!! the raised ladder is each of 12, 8, 6, 3 plus |c| T_TURN, then 12, 8, 6, 3 (eight rungs); (0.6, 0.8) is |c| = 1", L.length === 8 && near(L[0], 12 + d) && near(L[1], 8 + d) && near(L[2], 6 + d) && near(L[3], 3 + d) && L.slice(4).join() === "12,8,6,3", `${L.join()}`);
    ok("!! a still sea gives the ordinary ladder twice", C.raisedLadder([0, 0]).join() === "12,8,6,3,12,8,6,3");
    ok("!! the ordinary ladder passed in is the one raised (a ladder of 10, 5 gives 10+d, 5+d, 10, 5)", C.raisedLadder([1, 0], [10, 5]).join() === [10 + d, 5 + d, 10, 5].join());
}
console.log("\n4. THE SCENARIO");
{
    const a = H.hardScenario(701, "hard-current"), s1 = safe(() => C.currentScenario(701, "x1.0")), s15 = safe(() => C.currentScenario(701, "x1.5"));
    ok("!! x1.0 is hardScenario(seed, hard-current) unchanged", !!s1 && same(s1, a) && a.kind === "hard-current" && a.current && a.currentMean > 0);
    ok("!! x1.5 multiplies the mean by 1.5 and the unsteady amplitude by 1.5 (every axis), and currentMean by 1.5", !!s15 && s15.current.mean.every((m, i) => near(m, 1.5 * a.current.mean[i])) && s15.current.amp.every((m, i) => near(m, 1.5 * a.current.amp[i])) && near(s15.currentMean, 1.5 * a.currentMean));
    ok("!! x1.5 leaves the map, the start, the goal, the weight error, the frequencies and the phases alone", !!s15 && same(s15.obstacles, a.obstacles) && same(s15.start, a.start) && same(s15.goal, a.goal) && s15.weightError === a.weightError && same(s15.current.freq, a.current.freq) && same(s15.current.phase, a.current.phase));
    ok("!! the scenario is not mutated (hardScenario(701) read again equals the first reading)", same(H.hardScenario(701, "hard-current"), a));
    ok("!! an unknown strength throws, naming the strengths", (() => { try { C.currentScenario(701, "x2"); return false; } catch (e) { return /x1\.0, x1\.5/.test(e.message); } })());
    ok("!! the planner is told the horizontal MEAN only: meanOf gives the first two means", same(C.meanOf(a), [a.current.mean[0], a.current.mean[1]]));
}
console.log("\n5. THE FLIGHT");
{
    const seed = 703, r0 = safe(() => C.flyCurrent(pilot, seed, "x1.0", "any")), hh = H.flyHard(pilot, H.hardScenario(seed, "hard-current"), "any");
    ok("!! the reference arm at x1.0 is flyHard's `any` flight: same status, time, path, ticks and clearance", !!r0 && r0.status === hh.status && r0.t === hh.t && r0.path === hh.path && r0.ticks === hh.ticks && r0.minClearance === hh.minClearance, `${r0 && r0.status} ${hh.status}`);
    ok("!! the record: arm, kind hard-current, strength, seed, reached matches status, chord, margin of the first plan, noRoute false, crab false, margin0 0 for the reference", !!r0 && r0.arm === "any" && r0.kind === "hard-current" && r0.strength === "x1.0" && r0.seed === seed && r0.reached === (r0.status === "reached") && r0.chord > 100 && Number.isFinite(r0.margin) && r0.noRoute === false && r0.crab === false && r0.margin0 === 0);
    const rc = safe(() => C.flyCurrent(pilot, seed, "x1.0", "any+crab")), rm = safe(() => C.flyCurrent(pilot, seed, "x1.0", "any+margin")), rb = safe(() => C.flyCurrent(pilot, seed, "x1.5", "any+crab+margin")), sc = C.currentScenario(seed, "x1.0");
    ok("!! the crab arm has crab true and margin0 0; the margin arm crab false and margin0 = driftMargin of the mean; the designated arm both", !!rc && rc.crab === true && rc.margin0 === 0 && !!rm && rm.crab === false && near(rm.margin0, C.driftMargin(C.meanOf(sc))) && !!rb && rb.crab === true && near(rb.margin0, C.driftMargin(C.meanOf(C.currentScenario(seed, "x1.5")))));
    ok("!! the margin arm's first plan is at the RAISED margin when one fits (margin >= the ordinary 12 m) and the others' at 12 m or under", !!rm && rm.margin >= 12 && !!r0 && r0.margin <= 12 && !!rc && rc.margin <= 12);
    ok("!! a flight is deterministic (the same flight twice gives the same record)", same(safe(() => C.flyCurrent(pilot, seed, "x1.0", "any+crab")), rc));
    ok("!! the crab changes the flight (any+crab differs from any in time or path on this seed)", !!rc && !!r0 && (rc.t !== r0.t || rc.path !== r0.path));
    ok("!! the strength changes the flight (x1.5 against x1.0 for any on this seed)", (() => { const a = safe(() => C.flyCurrent(pilot, seed, "x1.5", "any")); return !!a && !!r0 && (a.path !== r0.path || a.status !== r0.status); })());
    ok("!! a bad arm throws, naming the arms", (() => { try { C.flyCurrent(pilot, seed, "x1.0", "any+nothing"); return false; } catch (e) { return /any\+crab\+margin/.test(e.message); } })());
    ok("!! a bad strength throws", (() => { try { C.flyCurrent(pilot, seed, "x9", "any"); return false; } catch (e) { return /x1\.0/.test(e.message); } })());
    ok("!! a flight cut to 2 s ends 'timeout' with fewer ticks than the full flight", (() => { const a = C.flyCurrent(pilot, seed, "x1.0", "any", { seconds: 2 }); return a.status === "timeout" && a.ticks === Math.round(2 / S.DT) && !!r0 && a.ticks < r0.ticks; })());
    ok("!! the chord is the straight distance start to goal, exactly", !!r0 && near(r0.chord, Math.hypot(sc.goal.x - sc.start.x, sc.goal.y - sc.start.y), 1e-9));
    const dev = C.SETS.dev.map((sd) => safe(() => C.flyCurrent(pilot, sd, "x1.5", "any+margin")) || { status: "?" });
    ok("!! across DEV at x1.5 the margin arm leaves the region in at least one flight (the exit test is live) and ends only in reached, collided, left or timeout", dev.some((x) => x.status === "left") && dev.every((x) => ["reached", "collided", "left", "timeout"].includes(x.status)), `${dev.filter((x) => x.status === "left").length} left`);
    const dev2 = C.SETS.dev.map((sd) => safe(() => C.flyCurrent(pilot, sd, "x1.5", "any")) || { status: "?", minClearance: NaN });
    ok("!! a flight collided exactly when its minimum clearance went below zero (DEV x1.5 any: every collided flight has minClearance < 0, every other one >= 0, and some collided)", dev2.some((x) => x.status === "collided") && dev2.every((x) => (x.status === "collided") === (x.minClearance < 0)), `${dev2.filter((x) => x.status === "collided").length} collided`);
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
