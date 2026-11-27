// WebGLEngine/brain/subAvoidNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subAvoidNav-selfcheck.mjs      (about 10 s)
//
// A VESSEL THAT TURNS AWAY (brain/subAvoidNav.mjs), held to its word before HELD8 is flown ("FOLLOW-UP 8" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   arms, the registered numbers, the sets, the twelve offsets in order
//   2  THE TEST        conflictHeading by hand: a ship ahead, a ship astern, a closing ship, a ship the vessel passes beneath, statics only when asked, the static clearance at its boundary
//   3  THE CHOICE      avoidHeading: unchanged without a conflict, the first qualifying offset, starboard first on a tie, a blocked starboard side forces port, none qualifying is stuck
//   4  THE FLIGHT      the reference arm is flyHard's flight (the identity), the record, the counters, determinism, a bad arm throws
//
// SABOTAGE LOG (serial mutation pass of brain/subAvoidNav.mjs, one mutant per code line and operator, at most four of each operator on a line, two worktrees): 96 mutants; 62 red on the first pass and 34 survivors read one by one. Rows were added (the strict depth test, the look starting at k = 0, the reference identity on twelve DEV seeds in eight fields,
//   the yield arm differing from the designated and turning, and a GOLDEN of the designated arm's thirty DEV flights -- a regression snapshot of this module's own output, NOT a hand derivation -- with its exits, ship hits and berg hits) and the survivors were run again: 34 mutants, 15 red, 19 survivors, of which one (the yield+avoid arm's turn switched off) was killed by one more row (checked: red).
//   The 18 left are EQUIVALENT or NOT REACHED: seabed 1000 -> 1001 (the floor never touches a flight at depth); the offsets' 1e-12 tolerance -> 1e-13 (the ninth step is exactly pi/2 or one ulp from it either way); `<` -> `<=` on a float tie (the look test, the clearance minimum, collision, four edges of the region test); `max(1, ..)` -> `max(2, ..)` on a replan interval of 150 ticks; the first plan built at t = 1 for t = 0 and the first clearance read at t = 1 and the replan test `i > 1` for `i > 0` (the replan is at multiples of 150, and the static map and the ships' schedule move little in one second: NOT REACHED by any DEV flight); `dist < BIG` -> `<=` and `&&` -> `||` in noRoute (no DEV scenario has no route); the obstacle struck read at the 4th state component or at clearance < 1 (the first struck is the same obstacle in all 30 flights); `&&` for `||` on the x lower and upper edges of the region (every DEV exit is through a y edge).
//   NOT CHECKED, said plainly: the generator takes at most four mutants of an operator on a line; the golden freezes what the arm does today and does not say it is right.
"use strict";
// 2026-11-26 -- FOLLOW-UP 9 (section 5): 9 mutants of brain/subAvoidNav.mjs, every one red by name (final pass): V1 R_TURN 20 | V2 the longer way round | V3 the turn's sense reversed | V4 the arc's y sign |
//   V5 the straight leg on the OLD heading | V6 the arc from the candidate, not the current heading | V7 the arc arm flying the straight test | V8 candidates not tested against statics | V9 HELD9 on HELD8's seeds.
//   V8 WENT 0 RED FIRST and got a row (an iceberg on the first ship-clear candidate's path, at 25 s: at 10 s every candidate's turn passed it and the rule went stuck, which proved nothing).
// 2026-11-26 -- FOLLOW-UP 10 (section 6): 7 mutants, every one red by name (final pass): E1 a 0 m band | E2 the south edge not tested | E3 the trigger edge-tested | E4 candidates not edge-tested | E5 the edge on the
//   wrong arm | E6 HELD10 on HELD9's seeds | E7 a 3 s edge look. E1 and E5 WENT 0 RED FIRST: the band row started where the path crossed the edge anyway (now 85 m out, ending 10 m inside the band), and swapping the arms
//   kept them different (a golden of both arms on six DEV seeds now pins each). The south-edge row's first fixture sat by the east edge, where nothing was refused.
import * as A from "./subAvoidNav.mjs";
import * as H from "./subHardNav.mjs";
import * as N from "./subFieldNav.mjs";
import * as AP from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as CN from "./subCurrentNav.mjs";   // FOLLOW-UP 9: the turning radius the arc must share

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pilot = (s, t, c) => AP.decide(s, t, c);
const ship = (x, y, vx, vy, r = 10, keel = Infinity) => ({ type: "ship", x, y, vx, vy, r, keel }), berg = (x, y, r = 5, keel = Infinity) => ({ type: "berg", x, y, vx: 0, vy: 0, r, keel });
const HH = N.HULL_HALF;
console.log("subAvoidNav-selfcheck -- a vessel that turns away from a ship\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the three arms, the reference first, the designated second", same(A.AVOID_ARMS, ["any+predict+edge+yield", "any+predict+edge+avoid", "any+predict+edge+yield+avoid"]) && A.REFERENCE === A.AVOID_ARMS[0] && A.DESIGNATED === A.AVOID_ARMS[1]);
    ok("!! the registered numbers: clear 30 m, look 25 s, step 15 degrees, max 90 degrees, static clear 12 m", A.SHIP_CLEAR === 30 && A.SHIP_LOOK_S === 25 && near(A.AVOID_STEP, Math.PI / 12) && near(A.AVOID_MAX, Math.PI / 2) && A.STATIC_CLEAR === 12);
    ok("!! DEV is seeds 1 to 30 (subHardNav's), HELD8 is 801 to 860 (60 seeds); neither overlaps HELD4 to HELD7's seeds", A.SETS.dev === H.HARD_SETS.dev && A.HELD8.length === 60 && A.HELD8[0] === 801 && A.HELD8[59] === 860 && A.SETS.held8 === A.HELD8);
    const d = A.OFFSETS.map((o) => Math.round(o * 180 / Math.PI));
    ok("!! twelve offsets in order +15, -15, +30, -30 ... +90, -90 degrees", d.join() === "15,-15,30,-30,45,-45,60,-60,75,-75,90,-90", d.join());
}
console.log("\n2. THE TEST");
{
    const cH = (x, y, t, h, obs, md, o) => safe(() => A.conflictHeading(x, y, t, h, obs, md, o), null);
    const clr = 10 + HH + 30;
    ok("!! a ship dead ahead at 100 m, still: the vessel at 3 m/s east is 25 m from it at 25 s, inside r + half-hull + 30: conflict; heading west (away): none", cH(0, 0, 0, 0, [ship(100, 0, 0, 0)], -Infinity) === true && cH(0, 0, 0, Math.PI, [ship(100, 0, 0, 0)], -Infinity) === false);
    ok("!! a ship far ahead (300 m, still): not within 25 s (75 m): none", cH(0, 0, 0, 0, [ship(300, 0, 0, 0)], -Infinity) === false);
    ok("!! a ship closing head-on (120 m ahead at -3 m/s): conflict; the same ship moving AWAY (+3): none", cH(0, 0, 0, 0, [ship(120, 0, -3, 0)], -Infinity) === true && cH(0, 0, 0, 0, [ship(120, 0, 3, 0)], -Infinity) === false);
    ok("!! the ship's position is read at t + k: a ship at 220 m closing at 3 m/s is not met in the look at t = 0 (they close 6 m/s: 220 - 150 = 70 m left at 25 s) but IS at t = 40 (the ship has come to 100 m); one at 150 m is met at t = 0", cH(0, 0, 0, 0, [ship(220, 0, -3, 0)], -Infinity) === false && cH(0, 0, 40, 0, [ship(220, 0, -3, 0)], -Infinity) === true && cH(0, 0, 0, 0, [ship(150, 0, -3, 0)], -Infinity) === true);
    ok("!! a ship the vessel passes BENEATH (keel 5, minDepth 30: keel + 5 not above 30) is skipped; at minDepth 1 it counts", cH(0, 0, 0, 0, [ship(100, 0, 0, 0, 10, 5)], 30) === false && cH(0, 0, 0, 0, [ship(100, 0, 0, 0, 10, 5)], 1) === true);
    ok("!! the depth test is strict: a ship with keel + 5 exactly at minDepth (keel 25, minDepth 30) is passed beneath (no conflict); keel 26 is not", cH(0, 0, 0, 0, [ship(100, 0, 0, 0, 10, 25)], 30) === false && cH(0, 0, 0, 0, [ship(100, 0, 0, 0, 10, 26)], 30) === true);
    ok("!! the look starts at k = 0: a still ship 1 m inside the clearance BEHIND the vessel (vessel moving away) is a conflict at k = 0 only, and still counts", cH(0, 0, 0, 0, [ship(-(clr - 1), 0, 0, 0)], -Infinity) === true && cH(0, 0, 0, 0, [ship(-(clr + 1), 0, 0, 0)], -Infinity) === false);
    ok("!! statics are ignored unless asked: an iceberg ahead is no ship conflict, and a conflict with statics:true", cH(0, 0, 0, 0, [berg(60, 0)], -Infinity) === false && cH(0, 0, 0, 0, [berg(60, 0)], -Infinity, { ships: true, statics: true }) === true);
    ok("!! ships are ignored when ships:false (statics only)", cH(0, 0, 0, 0, [ship(100, 0, 0, 0)], -Infinity, { ships: false, statics: true }) === false);
    const sc = 5 + HH + 12;
    ok("!! the static clearance is r + half-hull + 12: an iceberg whose nearest sample is just inside conflicts (y = clear - 1.5), just outside does not (y = clear + 0.5)", cH(0, 0, 0, 0, [berg(50, sc - 1.5)], -Infinity, { statics: true }) === true && cH(0, 0, 0, 0, [berg(50, sc + 0.5)], -Infinity, { statics: true }) === false);
    ok("!! the ship clearance is r + half-hull + 30: a still ship abeam at x = 51, y = clear - 1.5 conflicts, y = clear + 0.5 does not", cH(0, 0, 0, 0, [ship(51, clr - 1.5, 0, 0)], -Infinity) === true && cH(0, 0, 0, 0, [ship(51, clr + 0.5, 0, 0)], -Infinity) === false);
    ok("!! the speed matters: the dead-ahead ship at 100 m with V = 1 m/s (25 m in 25 s) is not met, V = 3 is", cH(0, 0, 0, 0, [ship(200, 0, 0, 0)], -Infinity, { V: 3 }) === false && cH(0, 0, 0, 0, [ship(200, 0, 0, 0)], -Infinity, { V: 8 }) === true);
    ok("!! heading convention: velocity (cos h, -sin h): heading pi/2 is toward -y; a ship at (0, -100) is ahead at pi/2 and not at -pi/2", cH(0, 0, 0, Math.PI / 2, [ship(0, -100, 0, 0)], -Infinity) === true && cH(0, 0, 0, -Math.PI / 2, [ship(0, -100, 0, 0)], -Infinity) === false);
}
console.log("\n3. THE CHOICE");
{
    const av = (x, y, t, h, obs, md = -Infinity) => safe(() => A.avoidHeading(x, y, t, h, obs, md), null);
    const free = av(0, 0, 0, 0.3, [ship(300, 0, 0, 0)]);
    ok("!! no conflict: the plan's heading comes back unchanged, fired false, turned false, stuck false", !!free && free.heading === 0.3 && !free.fired && !free.turned && !free.stuck);
    const a = av(0, 0, 0, 0, [ship(100, 0, 0, 0)]);
    const ours = (h) => A.conflictHeading(0, 0, 0, h, [ship(100, 0, 0, 0)], -Infinity, { statics: true });
    ok("!! a still ship dead ahead: the first offset that clears is taken, every earlier one conflicts, and the +15 side comes before -15", !!a && a.fired && a.turned && !a.stuck && A.OFFSETS.includes(a.heading) && !ours(a.heading) && A.OFFSETS.slice(0, A.OFFSETS.indexOf(a.heading)).every((o) => ours(o)), `${a && (a.heading * 180 / Math.PI).toFixed(0)}`);
    ok("!! by hand: with the ship at 100 m east (r 10) the 15 degree offset ends 28 m from it (+- 1): inside the clearance, so the answer is a LARGER offset: starboard (plan-positive) 30 degrees or more", !!a && Math.abs(a.heading) >= Math.PI / 6 - 1e-9);
    ok("!! starboard (+) first on a tie: the symmetric case gives a POSITIVE offset", !!a && a.heading > 0);
    const blocked = av(0, 0, 0, 0, [ship(100, 0, 0, 0), berg(45, -35, 15)]);
    ok("!! an iceberg on the starboard side (plan -y is positive heading) forces the other side: the chosen heading is negative, and clears the iceberg too", !!blocked && blocked.turned && blocked.heading < 0 && !A.conflictHeading(0, 0, 0, blocked.heading, [ship(100, 0, 0, 0), berg(45, -35, 15)], -Infinity, { statics: true }));
    const ring = [ship(60, 0, 0, 0, 40)], wall = []; for (let k = 0; k < 12; k++) wall.push(ship(150 * Math.cos(k * Math.PI / 6), -150 * Math.sin(k * Math.PI / 6), 0, 0, 120));
    const st = av(0, 0, 0, 0, wall);
    ok("!! every candidate blocked (a ring of big ships): stuck true, fired true, turned false, the plan's heading comes back", !!st && st.fired && st.stuck && !st.turned && st.heading === 0);
    ok("!! the offset is added to the PLAN's heading, not to 0 (h0 = 1.0 with the ship dead ahead on that heading: heading - 1.0 is an offset)", (() => { const h0 = 1.0, o = [ship(100 * Math.cos(h0), -100 * Math.sin(h0), 0, 0)], r = av(0, 0, 0, h0, o); return !!r && r.turned && A.OFFSETS.some((d) => near(r.heading - h0, d)); })());
    ok("!! a closing ship (150 m, -3 m/s) fires at t = 0", av(0, 0, 0, 0, [ship(150, 0, -3, 0)]).fired === true);
}
console.log("\n4. THE FLIGHT");
{
    const seed = 1, sc = H.hardScenario(seed, "hard-traffic"), r0 = safe(() => A.flyAvoid(pilot, sc, A.REFERENCE)), hh = H.flyHard(pilot, sc, A.REFERENCE);
    const ids = A.SETS.dev.slice(0, 12).map((sd) => { const c = H.hardScenario(sd, "hard-traffic"), a = safe(() => A.flyAvoid(pilot, c, A.REFERENCE)) || {}, b = H.flyHard(pilot, c, A.REFERENCE); return ["status", "t", "path", "ticks", "minClearance", "replans", "margin", "noRoute"].every((k) => a[k] === b[k]); });
    ok("!! the reference arm is flyHard's flight on twelve DEV seeds in status, time, path, ticks, minimum clearance, replans, first margin and noRoute", ids.every(Boolean), ids.map(Number).join(""));
    ok("!! the reference arm is flyHard's `any+predict+edge+yield` flight: same status, time, path, ticks, clearance", !!r0 && r0.status === hh.status && r0.t === hh.t && r0.path === hh.path && r0.ticks === hh.ticks && r0.minClearance === hh.minClearance, `${r0 && r0.status} ${hh.status}`);
    ok("!! the record: arm, kind hard-traffic, seed, reached matches status, chord = start to goal exactly, margin of the first plan, no turns counted for the reference", !!r0 && r0.arm === A.REFERENCE && r0.kind === "hard-traffic" && r0.seed === seed && r0.reached === (r0.status === "reached") && near(r0.chord, Math.hypot(sc.goal.x - sc.start.x, sc.goal.y - sc.start.y)) && Number.isFinite(r0.margin) && r0.fires === 0 && r0.turns === 0 && r0.stuck === 0);
    const devs = A.SETS.dev.slice(0, 6), rs = devs.map((sd) => safe(() => A.flyAvoid(pilot, H.hardScenario(sd, "hard-traffic"), A.DESIGNATED)) || { fires: -1, turns: -1, stuck: -1 });
    ok("!! across six DEV seeds the designated arm fires and turns (the rule is live), turns never exceed fires, stuck never exceeds fires", rs.some((x) => x.fires > 0 && x.turns > 0) && rs.every((x) => x.turns <= x.fires && x.stuck <= x.fires && x.fires + 1 > 0), JSON.stringify(rs.map((x) => [x.fires, x.turns, x.stuck])));
    const dd = A.SETS.dev.slice(0, 6), yy = dd.map((sd) => safe(() => A.flyAvoid(pilot, H.hardScenario(sd, "hard-traffic"), "any+predict+edge+yield+avoid"))), pd = dd.map((sd) => safe(() => A.flyAvoid(pilot, H.hardScenario(sd, "hard-traffic"), A.DESIGNATED)));
    ok("!! the yield is on in the yield+avoid arm and off in the designated: across six DEV seeds the two arms differ in time on at least one (the slow-down changes a flight) and the yield+avoid arm turns too", yy.every(Boolean) && pd.every(Boolean) && yy.some((y, i) => y.t !== pd[i].t || y.status !== pd[i].status) && yy.some((y) => y.fires > 0 && y.turns > 0));
    const gold = A.SETS.dev.map((sd) => safe(() => A.flyAvoid(pilot, H.hardScenario(sd, "hard-traffic"), A.DESIGNATED)) || { status: "?", hit: null, fires: 0, turns: 0, stuck: 0, replans: 0, t: null });
    ok("!! GOLDEN (a regression snapshot of this module's own flights on DEV, not a hand derivation; read it as a change detector): the designated arm's thirty statuses, the ship and berg hits by flight, the totals of fires, turns, stuck and replans, the sum of the arrival times",
        gold.map((r) => r.status[0]).join("") === "crclcrrcrrrrrrlrccrcrrrrrcrrrr" && gold.map((r) => (r.hit ? r.hit[0] : "-")).join("") === "b-s-b--b--------ss-b-----s----" && gold.reduce((m, r) => m + r.fires, 0) === 26472 && gold.reduce((m, r) => m + r.turns, 0) === 18794 && gold.reduce((m, r) => m + r.stuck, 0) === 7678 && gold.reduce((m, r) => m + r.replans, 0) === 1341 && near(gold.filter((r) => r.t).reduce((m, r) => m + r.t, 0), 3371.87, 0.01),
        `${gold.map((r) => r.status[0]).join("")} ${gold.reduce((m, r) => m + r.fires, 0)}`);
    ok("!! the golden has exits in it (2 flights left the region) so the exit test is live, and ship hits, berg hits and arrivals are all present", gold.filter((r) => r.status === "left").length === 2 && gold.some((r) => r.hit === "ship") && gold.some((r) => r.hit === "berg") && gold.some((r) => r.status === "reached"));
    const ry = safe(() => A.flyAvoid(pilot, sc, "any+predict+edge+yield+avoid"));
    ok("!! the yield+avoid arm is flown and its record names it", !!ry && ry.arm === "any+predict+edge+yield+avoid");
    ok("!! a flight is deterministic", same(safe(() => A.flyAvoid(pilot, sc, A.DESIGNATED)), safe(() => A.flyAvoid(pilot, sc, A.DESIGNATED))));
    ok("!! a bad arm throws, naming the arms", (() => { try { A.flyAvoid(pilot, sc, "any+nothing"); return false; } catch (e) { return /any\+predict\+edge\+yield\+avoid/.test(e.message); } })());
    ok("!! a flight cut to 2 s ends 'timeout' with exactly 2 / DT ticks", (() => { const a = A.flyAvoid(pilot, sc, A.DESIGNATED, { seconds: 2 }); return a.status === "timeout" && a.ticks === Math.round(2 / S.DT); })());
}
console.log("\n5. FOLLOW-UP 9: EACH HEADING TESTED ALONG THE TURNING ARC");
{
    ok("!! the arc arm and its reference, R_TURN 35 m (subCurrentNav's own), HELD9 = 8801 to 8860, disjoint from HELD8; FOLLOW-UP 8's arm list unchanged",
        same(A.ARC_ARMS, ["any+predict+edge+avoid", "any+predict+edge+avoid-arc"]) && A.ARC_REFERENCE === "any+predict+edge+avoid" && A.ARC_DESIGNATED === "any+predict+edge+avoid-arc" && A.R_TURN === 35 && A.R_TURN === CN.R_TURN
        && A.HELD9.length === 60 && A.HELD9[0] === 8801 && A.HELD9[59] === 8860 && !A.HELD9.some((x) => A.HELD8.includes(x)) && same(A.AVOID_ARMS, ["any+predict+edge+yield", "any+predict+edge+avoid", "any+predict+edge+yield+avoid"]));
    const near = (p, q, e = 1e-9) => Math.abs(p[0] - q[0]) < e && Math.abs(p[1] - q[1]) < e, T = (Math.PI / 2) * 35 / 3;
    ok("!! arcPos: no turn is the straight line; a quarter turn RIGHT (0 to pi/2) ends at (35, -35) after (pi/2) 35 / 3 s and then runs straight toward -y; LEFT (0 to -pi/2) ends at (35, +35)",
        near(A.arcPos(0, 0, 0.4, 0.4, 7), [21 * Math.cos(0.4), -21 * Math.sin(0.4)]) && near(A.arcPos(0, 0, 0, Math.PI / 2, T), [35, -35], 1e-9) && near(A.arcPos(0, 0, 0, Math.PI / 2, T + 10), [35, -65], 1e-9)
        && near(A.arcPos(0, 0, 0, -Math.PI / 2, T), [35, 35], 1e-9), JSON.stringify(A.arcPos(0, 0, 0, Math.PI / 2, T)));
    const sp = (k) => { const a = A.arcPos(0, 0, 0, Math.PI / 2, k), b = A.arcPos(0, 0, 0, Math.PI / 2, k + 1e-4); return Math.hypot(b[0] - a[0], b[1] - a[1]) / 1e-4; };
    ok("...at the cruise speed throughout (3 m/s mid-turn and after), and the SHORTER way: from 0 to 3 pi/2 it turns LEFT a quarter, not right three", Math.abs(sp(5) - 3) < 1e-3 && Math.abs(sp(T + 3) - 3) < 1e-3 && near(A.arcPos(0, 0, 0, 1.5 * Math.PI, T), [35, 35], 1e-9));
    const cA = (hc, h, obs, o) => safe(() => A.conflictArc(0, 0, 0, hc, h, obs, -Infinity, o), null), cH = (h, obs, o) => safe(() => A.conflictHeading(0, 0, 0, h, obs, -Infinity, o), null);
    const fx = [[0, [ship(100, 0, 0, 0)]], [0, [ship(300, 0, 0, 0)]], [0, [ship(120, 0, -3, 0)]], [Math.PI / 2, [ship(0, -100, 0, 0)]]];
    ok("with no turn (hc = h) the arc test IS the straight test, on four of section 2's fixtures", fx.every(([h, o]) => cA(h, h, o) === cH(h, o)));
    const rock = [berg(40, -15, 5)];
    ok("!! the arc MATTERS: from heading east, a candidate due 'south' (pi/2) clears an iceberg at (40, -15) on the instant-turn line but not on the 35 m turn, which swings out through about (25, -10)", cH(Math.PI / 2, rock, { statics: true }) === false && cA(0, Math.PI / 2, rock, { statics: true }) === true);
    ok("avoidHeadingArc: nothing near is no fire; a ring of big ships is stuck with the plan's heading back", (() => { const q = A.avoidHeadingArc(0, 0, 0, 0, 0, [], -Infinity); return q.fired === false && q.heading === 0; })()
        && (() => { const wall = []; for (let k = 0; k < 12; k++) wall.push(ship(150 * Math.cos(k * Math.PI / 6), -150 * Math.sin(k * Math.PI / 6), 0, 0, 120)); const q = A.avoidHeadingArc(0, 0, 0, 0, 0, wall, -Infinity); return q.stuck && q.fired && !q.turned && q.heading === 0; })());
    // a candidate that clears every ship but runs through an iceberg must be passed over: the first offset clear of the ships alone, an iceberg put on ITS path at 25 s (past the turn: at 10 s every candidate's turn still passes it and the rule is stuck), and the rule asked again
    const ships = [ship(100, 0, 0, 0)], firstShipClear = A.OFFSETS.find((d) => !A.conflictArc(0, 0, 0, 0, d, ships, -Infinity, { ships: true, statics: false }));
    const [bx, by] = A.arcPos(0, 0, 0, firstShipClear, 25), withRock = [...ships, berg(bx, by, 5)], pick = A.avoidHeadingArc(0, 0, 0, 0, 0, withRock, -Infinity);
    ok("!! candidates are tested against STATICS too: with an iceberg on the arc of the first ship-clear offset, that offset is passed over and the heading taken clears the iceberg as well",
        firstShipClear !== undefined && pick.turned && pick.heading !== firstShipClear && !A.conflictArc(0, 0, 0, 0, pick.heading, withRock, -Infinity, { ships: true, statics: true }), JSON.stringify({ firstShipClear, taken: pick.heading }));
    const sc = H.hardScenario(1, "hard-traffic"), r1 = safe(() => A.flyAvoid(pilot, sc, A.ARC_DESIGNATED, { seconds: 60 })), r2 = safe(() => A.flyAvoid(pilot, sc, A.ARC_DESIGNATED, { seconds: 60 }));
    ok("!! the arc arm flies (DEV seed 1, 60 s), names itself, is deterministic, and its turn counts are coherent", !!r1 && r1.arm === A.ARC_DESIGNATED && same(r1, r2) && r1.turns <= r1.fires && r1.stuck <= r1.fires, JSON.stringify(r1 && { s: r1.status, f: r1.fires, t: r1.turns, k: r1.stuck }));
    const ra = safe(() => A.flyAvoid(pilot, sc, A.ARC_REFERENCE, { seconds: 60 }));
    ok("...and it is not the reference: the two arms' turn counts or paths differ on that flight (the arc test is actually used)", !!ra && !!r1 && (ra.turns !== r1.turns || ra.stuck !== r1.stuck || ra.path !== r1.path), JSON.stringify(ra && { f: ra.fires, t: ra.turns, k: ra.stuck }));
}
console.log("\n6. FOLLOW-UP 10: THE ARC RULE KEPT OFF THE REGION'S EDGE");
{
    ok("!! the edge arm and its reference, HELD10 = 8901 to 8960 disjoint from HELD8 and HELD9; the band is subHardNav's EDGE_EXTRA (20 m)", same(A.EDGE_ARMS, ["any+predict+edge+avoid-arc", "any+predict+edge+avoid-arc-edge"]) && A.EDGE_REFERENCE === "any+predict+edge+avoid-arc"
        && A.EDGE_DESIGNATED === "any+predict+edge+avoid-arc-edge" && A.HELD10.length === 60 && A.HELD10[0] === 8901 && A.HELD10[59] === 8960 && !A.HELD10.some((x) => A.HELD8.includes(x) || A.HELD9.includes(x)) && H.EDGE_EXTRA === 20);
    const R = N.REGION, mid = [(R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2];
    ok("in the middle of the region with nothing near, a heading has no edge conflict; with edge off the test is FOLLOW-UP 9's", A.conflictArc(mid[0], mid[1], 0, 0, 0, [], -Infinity, { edge: true }) === false && A.conflictArc(R.x1 - 30, mid[1], 0, 0, 0, [], -Infinity) === false);
    ok("!! a heading that runs to the edge within the look conflicts: 30 m from the east edge heading east (3 m/s: past the 20 m band in 4 s), and not heading west", A.conflictArc(R.x1 - 30, mid[1], 0, 0, 0, [], -Infinity, { edge: true }) === true
        && A.conflictArc(R.x1 - 30, mid[1], 0, Math.PI, Math.PI, [], -Infinity, { edge: true }) === false);
    ok("...the band is 20 m, not the region itself: 40 m from the north edge (y1) heading toward it at pi/2 is a conflict only via the band (the path reaches y1 - 20 after 7 s and y1 after 14 s; both inside the look) -- and 100 m off with a 25 s look (75 m) is not", A.conflictArc(mid[0], R.y0 + 40, 0, Math.PI / 2, Math.PI / 2, [], -Infinity, { edge: true }) === true
        && A.conflictArc(mid[0], R.y0 + 100, 0, Math.PI / 2, Math.PI / 2, [], -Infinity, { edge: true }) === false);
    // the trigger is NOT edge-tested: on the plan's own heading toward the edge with no ship, nothing fires
    const q = A.avoidHeadingArc(R.x1 - 30, mid[1], 0, 0, 0, [], -Infinity, { edge: true });
    ok("!! the TRIGGER is not edge-tested (the plan's heading keeps off the edge by the field): heading at the edge with no ship near, the rule does not fire", q.fired === false && q.heading === 0);
    // a candidate refused for the edge: a ship dead ahead near the east edge; the edge version skips candidates that turn toward the edge
    // the vessel 30 m inside the SOUTH edge (y0 + 30), heading east, a still ship 90 m ahead (at 60 m every turn passes within its clearance and the rule is stuck; at 120 m it is out of the look): the offsets go starboard first (+, toward -y, toward the south edge). The first fixture sat near the EAST edge, where the
    //   candidate taken never reached the band in 25 s, so nothing was refused and the row said nothing.
    const at = [mid[0], R.y0 + 30], ships = [ship(at[0] + 90, at[1], 0, 0)], plain = A.avoidHeadingArc(at[0], at[1], 0, 0, 0, ships, -Infinity), edged = A.avoidHeadingArc(at[0], at[1], 0, 0, 0, ships, -Infinity, { edge: true });
    ok("!! a ship ahead 30 m inside the south edge: the plain arc rule turns starboard toward the edge, the edge-kept rule refuses that and turns to port, and what it takes keeps off the band",
        plain.turned && plain.heading > 0 && edged.turned && edged.heading < 0 && !A.conflictArc(at[0], at[1], 0, 0, edged.heading, ships, -Infinity, { ships: true, statics: true, edge: true }), JSON.stringify({ plain: plain.heading, edged: edged.heading }));
    ok("!! the band, not the edge itself, decides: 85 m from the south edge heading at it, the 25 s look ends 10 m from the edge -- inside the 20 m band (a conflict) but never past the edge (none without the band)",
        A.conflictArc(mid[0], R.y0 + 85, 0, Math.PI / 2, Math.PI / 2, [], -Infinity, { edge: true }) === true && Math.abs(A.arcPos(mid[0], R.y0 + 85, Math.PI / 2, Math.PI / 2, 25)[1] - R.y0 - 10) < 1e-9);
    // GOLDEN (a regression snapshot of this module's own flights, not a hand derivation): the two arms on six DEV seeds -- the edge arm refuses more and turns less, and the arc arm is FOLLOW-UP 9's, untouched
    const gold = Object.fromEntries(A.EDGE_ARMS.map((arm) => { let f = 0, t = 0, k = 0, st = ""; for (const sd of A.SETS.dev.slice(0, 6)) { const r = safe(() => A.flyAvoid(pilot, H.hardScenario(sd, "hard-traffic"), arm)) || { fires: -1, turns: -1, stuck: -1, status: "?" }; f += r.fires; t += r.turns; k += r.stuck; st += r.status[0]; } return [arm, { f, t, k, st }]; }));
    ok("!! GOLDEN: on DEV seeds 1-6 the arc arm fires 4638, turns 4497, stuck 141 and the edge arm fires 4571, turns 3819, stuck 752 (each arm flies its own test: swapping them moves both)",
        same(gold[A.EDGE_REFERENCE], { f: 4638, t: 4497, k: 141, st: "rrrrrr" }) && same(gold[A.EDGE_DESIGNATED], { f: 4571, t: 3819, k: 752, st: "rrrrrr" }), JSON.stringify(gold));
    const sc = H.hardScenario(1, "hard-traffic"), e1 = safe(() => A.flyAvoid(pilot, sc, A.EDGE_DESIGNATED, { seconds: 60 })), e2 = safe(() => A.flyAvoid(pilot, sc, A.EDGE_DESIGNATED, { seconds: 60 }));
    ok("the edge arm flies (DEV seed 1, 60 s), names itself, and is deterministic", !!e1 && e1.arm === A.EDGE_DESIGNATED && same(e1, e2), JSON.stringify(e1 && { s: e1.status, f: e1.fires, t: e1.turns, k: e1.stuck }));
}
console.log("\n7. FOLLOW-UP 12: STUCK, THE LEAST BAD HEADING");
{
    ok("!! the least arm and its reference, HELD12 = 9701 to 9760 (above subNavRoute's held87, which ends at 9700), disjoint from HELD8 to HELD10", same(A.LEAST_ARMS, ["any+predict+edge+avoid-arc-edge", "any+predict+edge+avoid-arc-edge-least"])
        && A.LEAST_REFERENCE === "any+predict+edge+avoid-arc-edge" && A.LEAST_DESIGNATED === "any+predict+edge+avoid-arc-edge-least" && A.HELD12.length === 60 && A.HELD12[0] === 9701 && A.HELD12[59] === 9760
        && !A.HELD12.some((x) => A.HELD8.includes(x) || A.HELD9.includes(x) || A.HELD10.includes(x)));
    ok("!! minClearArc: a still ship dead ahead at 100 m on the straight line is met at 25 s, 25 m off, its need 10 + half-hull + 30 = 44: -19; nothing near is Infinity; a ship passed beneath is skipped",
        A.minClearArc(0, 0, 0, 0, 0, [ship(100, 0, 0, 0)], -Infinity) === -19 && A.minClearArc(0, 0, 0, 0, 0, [], -Infinity) === Infinity && A.minClearArc(0, 0, 0, 0, 0, [ship(100, 0, 0, 0, 10, 5)], 30) === Infinity);
    ok("...and a static's need is STATIC_CLEAR, not SHIP_CLEAR: an iceberg (r 5) dead ahead at 100 m is 25 - (5 + half-hull + 12)", A.minClearArc(0, 0, 0, 0, 0, [berg(100, 0, 5)], -Infinity) === 25 - (5 + HH + 12));
    const wall = []; for (let k = 0; k < 12; k++) wall.push(ship(150 * Math.cos(k * Math.PI / 6), -150 * Math.sin(k * Math.PI / 6), 0, 0, 120));
    const w2 = [...wall, ship(60, 0, 0, 0)], plain = A.avoidHeadingArc(0, 0, 0, 0, 0, w2, -Infinity), least = A.avoidHeadingArc(0, 0, 0, 0, 0, w2, -Infinity, { least: true });
    const all = [0, ...A.OFFSETS].map((d) => ({ d, m: A.minClearArc(0, 0, 0, 0, d, w2, -Infinity) })), top = Math.max(...all.map((x) => x.m)), firstTop = all.find((x) => x.m === top).d;
    ok("!! STUCK (a ring of big ships and one close ahead): without least the plan's heading comes back; with least, the heading with the largest minimum clearance, the first in order on a tie (here +90: -69.1 against the plan's -79.0)",
        plain.stuck && plain.heading === 0 && least.stuck && !least.turned && least.heading === firstTop && least.heading !== 0 && Math.abs(top - (-69.1)) < 0.05, JSON.stringify({ least: least.heading, top }));
    ok("...and when a candidate clears, least changes nothing (the turn is taken as before)", same(A.avoidHeadingArc(0, 0, 0, 0, 0, [ship(100, 0, 0, 0)], -Infinity, { least: true }), A.avoidHeadingArc(0, 0, 0, 0, 0, [ship(100, 0, 0, 0)], -Infinity)));
    let f = 0, t = 0, k = 0, st = ""; for (const sd of A.SETS.dev.slice(0, 6)) { const r = safe(() => A.flyAvoid(pilot, H.hardScenario(sd, "hard-traffic"), A.LEAST_DESIGNATED)) || { fires: -1, turns: -1, stuck: -1, status: "?" }; f += r.fires; t += r.turns; k += r.stuck; st += r.status[0]; }
    ok("!! GOLDEN: the least arm on DEV seeds 1-6 fires 3781, turns 3107, stuck 674, statuses lrrrrr (the edge arm's golden, section 6, is unchanged)", same({ f, t, k, st }, { f: 3781, t: 3107, k: 674, st: "lrrrrr" }), JSON.stringify({ f, t, k, st }));
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
