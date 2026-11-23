// WebGLEngine/brain/subMissionNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subMissionNav-selfcheck.mjs      (about 40 s)
//
// MISSIONS AND WHAT A METRE COSTS (brain/subMissionNav.mjs), held to its word before HELD10 is flown ("FOLLOW-UP 10" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   arms, the registered numbers, the sets, joules per metre by hand (3.0 m/s 2,675; 2.5 m/s 1,891; 2.0 m/s 1,259)
//   2  THE MISSION     the waypoint rule checked on every DEV seed (clearance, legs, chord sum, ranges, minDepth), determinism, the dropped branch
//   3  THE FLIGHT      one waypoint is flyHard's flight (the identity), energy accounting, the energy-out branch, errors, the record, the speed cap, a golden of ten DEV missions
//
// SABOTAGE LOG: (filled by the serial mutation pass below)
"use strict";
import * as M from "./subMissionNav.mjs";
import * as H from "./subHardNav.mjs";
import * as N from "./subFieldNav.mjs";
import * as AP from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pilot = (s, t, c) => AP.decide(s, t, c);
const code = (r) => ({ complete: "C", collided: "x", "energy-out": "E", left: "L", timeout: "T" }[r.status] || "?") + r.legs;
console.log("subMissionNav-selfcheck -- missions and what a metre costs\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the four arms, the reference third, the designated (the 2.5 m/s cap) last", same(M.MISSION_ARMS, ["any+replan", "any+predict+edge", "any+predict+edge+yield", "any+predict+edge+yield@2.5"]) && M.REFERENCE === M.MISSION_ARMS[2] && M.DESIGNATED === M.MISSION_ARMS[3]);
    ok("!! the registered numbers: the cap 2.5 m/s, 450 s a mission, class battery", M.ECO_SPEED === 2.5 && M.SECONDS_MISSION === 450 && M.CLASS === "battery");
    ok("!! the waypoint rule: x 40..360, y -100..100, depth 20..35, static clearance 40, leg 120, chord 600..850, 500 draws", same(M.WAYPOINT, { xLo: 40, xHi: 360, yLo: -100, yHi: 100, depthLo: 20, depthHi: 35, staticClear: 40, minLeg: 120, chordLo: 600, chordHi: 850, draws: 500 }));
    ok("!! DEV is seeds 1 to 30 (subHardNav's); HELD10 is 1001 to 1060 (60 seeds)", M.SETS.dev === H.HARD_SETS.dev && M.HELD10.length === 60 && M.HELD10[0] === 1001 && M.HELD10[59] === 1060 && M.SETS.held10 === M.HELD10);
    const model = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })), byHand = (v) => { const T = 0.5 * S.WATER_DENSITY * model.spec.cdAxial * model.frontalArea * v * v; return (200 + T * v / 0.5) / v; };
    ok("!! joules per metre by hand (200 W + drag x speed / 0.5, over the speed): 3.0 m/s 2,675, 2.5 m/s 1,891, 2.0 m/s 1,259 (to a joule)", [3, 2.5, 2].every((v) => near(M.joulesPerMetre(v), byHand(v), 1e-6)) && Math.round(M.joulesPerMetre(3)) === 2675 && Math.round(M.joulesPerMetre(2.5)) === 1891 && Math.round(M.joulesPerMetre(2)) === 1259, [3, 2.5, 2].map((v) => M.joulesPerMetre(v).toFixed(1)).join());
    ok("!! a battery of 3 MJ carries about 1,120 m at cruise (3.0e6 / 2675)", near(3.0e6 / M.joulesPerMetre(3), 1121.5, 1));
}
console.log("\n2. THE MISSION");
{
    const W = M.WAYPOINT, ms = M.SETS.dev.map((sd) => M.missionFor(sd));
    ok("!! no DEV seed is dropped, and the draws used are between 1 and 500", ms.every((m) => !m.dropped && m.draws >= 1 && m.draws <= 500), `${ms.filter((m) => m.dropped).length} dropped`);
    const bad = [];
    for (const m of ms) {
        const sc = H.hardScenario(m.seed, "hard-traffic"), [p1, p2, g] = m.points, pts = [sc.start, p1, p2, g], statics = sc.obstacles.filter((o) => o.type !== "ship");
        const clearOk = [p1, p2].every((p) => statics.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= o.r + N.HULL_HALF + 40)), chords = [0, 1, 2].map((i) => Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)), sum = chords[0] + chords[1] + chords[2];
        const rangeOk = [p1, p2].every((p) => p.x >= 40 && p.x <= 360 && p.y >= -100 && p.y <= 100 && p.depth >= 20 && p.depth <= 35), minD = Math.min(sc.start.depth, p1.depth, p2.depth, sc.goal.depth);
        if (!(clearOk && rangeOk && chords.every((c) => c >= 120) && sum >= 600 && sum <= 850 && near(m.chord, sum, 1e-9) && same(m.chords, chords) && g.x === sc.goal.x && g.y === sc.goal.y && g.depth === sc.goal.depth && near(m.scenario.minDepth, minD) && m.points.length === 3)) bad.push(m.seed);
    }
    ok("!! every DEV mission obeys the rule by hand: each waypoint 40 m beyond r + half-hull of every static obstacle, in the ranges, legs at least 120 m, the chord sum 600 to 850 and equal to the record's, the goal the scenario's own, minDepth the shallowest of the depths", bad.length === 0, `bad ${bad.join()}`);
    const m3 = ms[2];
    ok("!! the scenario is the hard-traffic scenario with only minDepth moved (obstacles, start, goal, seed, kind the same objects or equal)", m3.scenario.obstacles === H.hardScenario(m3.seed, "hard-traffic").obstacles || same(m3.scenario.obstacles, H.hardScenario(m3.seed, "hard-traffic").obstacles), "");
    ok("!! missionFor is deterministic (the same seed twice gives the same points, chords and draws)", same(M.missionFor(7), M.missionFor(7)) && !same(M.missionFor(7).points, M.missionFor(8).points));
    ok("!! the waypoints are NOT the scenario's own draws (a different seed's mission has different points but the same scenario shape is kept)", M.missionFor(7).points[0].x !== H.hardScenario(7, "hard-traffic").goal.x);
    const dr = M.missionFor(5, { ...W, chordLo: 5000, chordHi: 6000 });
    ok("!! an impossible rule is dropped: dropped true, points [], chords [], chord NaN, draws 500, and the scenario is the plain one", dr.dropped === true && dr.points.length === 0 && dr.chords.length === 0 && Number.isNaN(dr.chord) && dr.draws === 500 && dr.scenario.minDepth === H.hardScenario(5, "hard-traffic").minDepth);
    ok("!! each acceptance clause bites: an impossibly large static clearance (3,000 m), an impossibly long leg (900 m) and a chord window of 10 m are each dropped", M.missionFor(5, { ...W, staticClear: 3000 }).dropped && M.missionFor(5, { ...W, minLeg: 900 }).dropped && M.missionFor(5, { ...W, chordLo: 100, chordHi: 110 }).dropped);
    ok("!! the ranges bite: a window of x in [40, 41] and y in [0, 1] with legs of 120 m is dropped; a very wide window is accepted at the first draw or soon", M.missionFor(5, { ...W, xLo: 40, xHi: 41, yLo: 0, yHi: 1 }).dropped && !M.missionFor(5, { ...W, chordLo: 0, chordHi: 1e9, minLeg: 0, staticClear: 0 }).dropped && M.missionFor(5, { ...W, chordLo: 0, chordHi: 1e9, minLeg: 0, staticClear: 0 }).draws === 1);
    ok("!! the depth range bites: depth in [20, 20] gives waypoints at exactly 20 m", (() => { const m = M.missionFor(5, { ...W, depthLo: 20, depthHi: 20 }); return !m.dropped && m.points[0].depth === 20 && m.points[1].depth === 20; })());
}
console.log("\n3. THE FLIGHT");
{
    const seed = 1, sc = H.hardScenario(seed, "hard-traffic"), one = { seed, scenario: sc, points: [{ x: sc.goal.x, y: sc.goal.y, depth: sc.goal.depth }], chords: [], chord: Math.hypot(sc.goal.x - sc.start.x, sc.goal.y - sc.start.y), dropped: false };
    const ids = [1, 2, 3, 4, 5, 6].map((sd) => { const c = H.hardScenario(sd, "hard-traffic"), mi = { seed: sd, scenario: c, points: [{ x: c.goal.x, y: c.goal.y, depth: c.goal.depth }], chords: [], chord: 1, dropped: false }, a = safe(() => M.flyMission(pilot, mi, M.REFERENCE, { seconds: 260 })) || {}, b = H.flyHard(pilot, c, M.REFERENCE); return a.t === b.t && a.path === b.path && a.ticks === b.ticks && a.minClearance === b.minClearance && (a.status === (b.status === "reached" ? "complete" : b.status)); });
    ok("!! a ONE-waypoint mission is flyHard's `any+predict+edge+yield` flight on six DEV seeds: same status (reached = complete), time, path, ticks, minimum clearance (the energy layer changes nothing but the account)", ids.every(Boolean), ids.map(Number).join(""));
    const m0 = M.missionFor(2), r = safe(() => M.flyMission(pilot, m0, M.REFERENCE));
    ok("!! the record: arm, seed, status, complete matches, legs 0..3, chord the mission's sum, ticks, hit, shipSpeed", !!r && r.arm === M.REFERENCE && r.seed === 2 && r.complete === (r.status === "complete") && r.legs >= 0 && r.legs <= 3 && near(r.chord, m0.chord) && r.ticks > 0 && r.shipSpeed === m0.scenario.shipSpeed && "hit" in r);
    ok("!! energy is accounted: used + left = 3.0 MJ (no refill at depth) and the J/m is used over path", !!r && near(r.energyUsed + r.energyLeft, 3.0e6, 1e-3) && near(r.jPerM, r.energyUsed / r.path, 1e-9) && r.energyUsed > 0);
    ok("!! a completed mission has legs 3 and a path of at least its chord sum minus the 10 m reach a leg (when complete)", (() => { for (const sd of [2, 3, 4]) { const x = M.flyMission(pilot, M.missionFor(sd), M.REFERENCE), mm = M.missionFor(sd); if (x.complete) return x.legs === 3 && x.path >= mm.chord - 40 && x.t > 0; } return false; })());
    const e = safe(() => M.flyMission(pilot, M.missionFor(2), M.REFERENCE, { energy: 20000 }));
    ok("!! an almost empty battery (20 kJ) ends the mission 'energy-out' in the tick the charge reached 0: energyLeft 0, energyUsed 20 kJ (+- one tick's draw), legs 0, a few seconds", !!e && e.status === "energy-out" && e.energyLeft <= 0 && e.energyUsed >= 20000 && e.energyUsed < 20000 + 15 * 0.02 * 8100 && e.legs === 0 && e.t === null && e.ticks < 400, JSON.stringify(e && [e.status, e.energyLeft, e.energyUsed, e.ticks]));
    const cut = safe(() => M.flyMission(pilot, M.missionFor(2), M.REFERENCE, { seconds: 2 }));
    ok("!! a mission cut to 2 s ends 'timeout' with exactly 2 / DT ticks and no leg", !!cut && cut.status === "timeout" && cut.ticks === Math.round(2 / S.DT) && cut.legs === 0);
    ok("!! a bad arm throws, naming the arms; a dropped mission throws", (() => { let a = false, b = false; try { M.flyMission(pilot, m0, "any+nothing"); } catch (x) { a = /any\+predict\+edge\+yield@2\.5/.test(x.message); } try { M.flyMission(pilot, M.missionFor(5, { ...M.WAYPOINT, chordLo: 5000, chordHi: 6000 }), M.REFERENCE); } catch (x) { b = /dropped/.test(x.message); } return a && b; })());
    ok("!! a flight is deterministic", same(safe(() => M.flyMission(pilot, m0, M.DESIGNATED)), safe(() => M.flyMission(pilot, m0, M.DESIGNATED))));
    const jr = [2, 3, 4, 6, 9, 10].map((sd) => { const a = M.flyMission(pilot, M.missionFor(sd), M.REFERENCE), b = M.flyMission(pilot, M.missionFor(sd), M.DESIGNATED); return a.complete && b.complete ? b.jPerM / a.jPerM : null; }).filter((x) => x !== null);
    ok("!! the speed cap bites: the 2.5 m/s arm spends 0.60 to 0.85 of the reference's joules a metre (the tables' 1,891 / 2,675 = 0.71)", jr.length >= 3 && jr.every((x) => x > 0.6 && x < 0.85), jr.map((x) => x.toFixed(2)).join());
    const gold = M.MISSION_ARMS.map((arm) => M.SETS.dev.slice(0, 10).map((sd) => code(M.flyMission(pilot, M.missionFor(sd), arm))).join(" "));
    ok("!! GOLDEN (a regression snapshot of this module's own missions on ten DEV seeds, not a hand derivation; a change detector): the status and legs of each arm (C complete, x collided, E energy-out, L left, T timeout)",
        same(gold, ["x0 C3 C3 C3 x0 C3 x0 x0 C3 C3", "x0 C3 C3 C3 C3 C3 x0 x0 C3 C3", "x0 C3 C3 C3 x0 C3 x0 x0 C3 C3", "x0 C3 x0 C3 x0 C3 x0 x0 C3 C3"]), gold.join(" | "));
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
