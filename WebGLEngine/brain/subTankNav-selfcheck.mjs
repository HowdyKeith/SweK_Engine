// WebGLEngine/brain/subTankNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subTankNav-selfcheck.mjs      (~15 s)
//
// NAVIGATION IN THE SUB AQUARIUM'S TANK (brain/subTankNav.mjs), held to its word (design: "FOLLOW-UP 4" of brain/SUB_FIELD_NAV_WIP.md). These are checks of CODE; none of them measures navigation (the descriptive run T1 to T3 is a separate command).
//   1  THE CONSTANTS   the tank's size and grid, the arms and the default, the depth range the tank wanders in (held against the tank's own), the scene's and the goal's numbers
//   2  THE LANE        reflect (a triangle wave: inside, past either end, whole periods, negative), sceneAt (a static centre stays; a ship is along its lane at c0 + v t, folded back; both axes), laneSegment
//   3  THE SCENE       tankScene: a function of the seed, frozen, a standard tank only (named); two islands of two or three overlapping discs, three icebergs, two ships, every count met on seeds 1 to 200 (and measured on 3,000); radii, keels, speeds; 30 m inside the walls,
//                      24 m of water between groups, a lane that keeps r + r' + 10 m from every static disc and stays in the tank; the first position of a ship is its position at t = 0; sceneNow
//   4  THE NAVIGATOR   a bad arm throws naming the arms; the goal (inside the box, 150 m from the sub, clear of every static disc and every lane by r + 28, a depth in the tank's range, a route to it), the same for the same seed; an arrival counts and draws another
//                      goal; a contact counts once and again only after a clear second; passing beneath an iceberg is no contact; the travel adds up; the plans (none for straight, one a goal for any, every 3 s for the replan arms); the target (depth, speed, the bearing in an
//                      open sea and not behind an island, back to the middle outside the tank)
//   5  THE FLIGHT      the navigator flying the real vessel on the PD autopilot for five tank-minutes in the same sea: GOLDEN counts of arrivals, contacts and plans
//
// SABOTAGE LOG -- 112 mutants of brain/subTankNav.mjs, each run against a copy of this gate, 4 at a time. ALL 112 RED: 107 BY A NAMED ROW and 5 BY A THROWN ERROR that the section guard reports by section (K24, K70, K82, K91, K101: each breaks a function the next
//   rows call, so the section dies at its first call):
//   K01 length; K02-K03 the grid; K04 arms order; K05 default arm; K06-K07 the depth range; K08-K10 the counts of islands, icebergs, ships; K11-K13 wall clearance, gap, lane clearance; K14-K19 the goal's margin, distance, clearance, tries, depth inset, the
//   clear second; K20-K23 reflect (the period, the fold, negative coordinates, the low end); K24-K28 sceneAt and laneSegment; K29-K30 the size check (each side); K31 the seed; K32-K35 each wall of the fits test; K36 the gap; K37-K43 the island (radius,
//   centre, satellites, their radius and distance, group, keel); K44-K46 the iceberg (radius, keel, group); K47-K61 the ships (axis, radius, speed, direction, keel, lane ends and length, fixed coordinate, first place, lane clearance, group, start, frozen lane);
//   K62-K63 the scene's size and sceneNow; K64-K66 the navigator's arm check, seed and mode; K67-K80 the goal draw (lane distance, radius, minDepth, grid, ranges, distance, clearance, route, straight, fallback, field reset) and the plan (minDepth, own,
//   grid, time, count, margin, noRoute, mode, at); K81-K112 the step (travel, last, the goal first, the gap's time and its `at`, the contact logic and its clear second, arrival, the plan condition and the replan cadence, the four sides of the tank, the way
//   back, invalidate, the snapshot's copy and fields).
//   ON THE FIRST RUN NINETEEN WENT 0 RED and the gate grew what separated them: K29 (a tank wrong in ONE side only), K46 and K59 (group ids that name one thing each), K73 (a goal depth in the tank's range but not inset), K77 (the goal of a straight sub is the
//   first CLEAR candidate, of a field arm the first with a ROUTE: a sub shut in a ring), K80 (the plan blocks an iceberg by the SHALLOWER of the sub's depth and the goal's: a sea and a seed found for it), K85 and K86 (the plan's margin and `noRoute` in the
//   snapshot: the ring again), K92 and K93 (contact read at the tank's clock against a ship that is elsewhere at t = 0), K96 (the clear second restarts at every renewed contact), K101 (a plan is made AT ONCE for a new goal), K105 and K106 (all four sides of the
//   tank bring a sub back), K111 (the snapshot's goal is a copy); and five rows died of a thrown error with no section guard (K24, K70, K82, K91; the guard is there now).
//   THE GOAL DRAW WAS A REAL DEFECT THE GATE'S FIRST RUN FOUND, not a mutant: the study's r + 40 m clearance, in a 500 x 300 m tank with seven obstacles, left almost nothing, and 18 of 25 goals fell back to the default corner (and one sub circled a goal at the
//   edge of an island for 300 s). The clearance is r + 28 m (the plan's 16 m at the widest margin plus 12) and the draw has 200 tries; the default goal now fires only in a sea shut by one huge island (a row builds that).
"use strict";
import * as T from "./subTankNav.mjs";
import * as H from "./subHardNav.mjs";
import * as N from "./subFieldNav.mjs";
import * as AP from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as HL from "../physics/mechanics/subHulls.mjs";
import * as A from "../render/subAquariumSim.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const guard = (n, f) => { try { f(); } catch (e) { fails++; console.log(`  FAIL  !! section ${n} ran to the end (THE GATE THREW: ${String((e && e.message) || e).slice(0, 160)})`); } };   // a mutant that breaks a function the rows call fails the section by name instead of killing the gate
const thrown = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const st = (x, y, depth) => ({ pos: [x, y, -depth], heading: 0 });
const mk = (obstacles) => Object.freeze({ seed: 0, length: 500, width: 300, obstacles: Object.freeze(obstacles) });
const O = (o) => ({ type: "berg", group: 0, x: 0, y: 0, r: 10, keel: Infinity, vx: 0, vy: 0, ...o });
console.log("subTankNav-selfcheck -- navigation in the tank\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the tank is 500 x 300 m, its plan grid 100 x 60 cells of 5 m from the origin, frozen", T.TANK_LENGTH === 500 && T.TANK_WIDTH === 300 && same(T.TANK_GRID, { x0: 0, y0: 0, w: 100, h: 60 }) && Object.isFrozen(T.TANK_GRID) && T.TANK_GRID.w * 5 === T.TANK_LENGTH && T.TANK_GRID.h * 5 === T.TANK_WIDTH);
    ok("!! the arms are straight, any, any+replan, any+predict (each one of the study's), the default is any+predict; every arm is a known arm of subHardNav", same(T.TANK_ARMS, ["straight", "any", "any+replan", "any+predict"]) && T.DEFAULT_ARM === "any+predict" && Object.isFrozen(T.TANK_ARMS) && T.TANK_ARMS.every((a) => H.HARD_ARMS.includes(a)));
    ok("!! the depth range is the TANK'S OWN (14 to 40 m: render/subAquariumSim.mjs's DEPTH_MIN and DEPTH_MAX)", T.DEPTH_MIN === A.DEPTH_MIN && T.DEPTH_MAX === A.DEPTH_MAX && T.DEPTH_MIN === 14 && T.DEPTH_MAX === 40 && T.TANK_LENGTH === A.LENGTH && T.TANK_WIDTH === A.WIDTH);
    ok("!! the scene: 2 islands, 3 icebergs, 2 ships; 30 m from the walls, 24 m of water between groups, 10 m beyond the radii for a lane", same(T.SCENE, { islands: 2, bergs: 3, ships: 2, wallClear: 30, gap: 24, laneClear: 10 }));
    ok("!! the goal: inside 60 m of the walls, at least 150 m from the sub, r + 28 m clear, 200 tries, 2 m inside the depth range; a contact ends after 1 s clear", T.GOAL_MARGIN === 60 && T.GOAL_MIN_DIST === 150 && T.GOAL_CLEAR === 28 && T.GOAL_TRIES === 200 && T.GOAL_DEPTH_INSET === 2 && T.HIT_CLEAR_S === 1);
}

console.log("\n2. THE LANE");
guard("2", () => {
    ok("!! reflect folds a coordinate back into [lo, hi] like a bouncing ball: inside stays (120 in 100..200), past the top comes back (203 -> 197), past the bottom comes back (96 -> 104), a whole period is the same place (120 + 200 -> 120), far negative still lands inside", near(T.reflect(120, 100, 200), 120) && near(T.reflect(203, 100, 200), 197) && near(T.reflect(96, 100, 200), 104) && near(T.reflect(320, 100, 200), 120) && near(T.reflect(-410, 100, 200), 190) && near(T.reflect(100, 100, 200), 100) && near(T.reflect(200, 100, 200), 200));
    ok("!! reflect past a whole period then a bounce: 480 in 100..200 is (480 - 100) mod 200 = 180 -> 100 + (200 - 180) = 120", near(T.reflect(480, 100, 200), 120));
    const sx = { lane: { axis: "x", fixed: 100, lo: 50, hi: 150, c0: 60, v: 2 } }, sy = { lane: { axis: "y", fixed: 300, lo: 20, hi: 120, c0: 40, v: -2 } };
    ok("!! sceneAt: a static obstacle stays where it is at any time; an x-lane ship is at (c, fixed) with c = c0 + v t folded ((60,100) at 0, (150,100) at 45 s, (140,100) at 50 s -- it has turned round)", same(T.sceneAt({ x: 7, y: 9 }, 123), [7, 9]) && same(T.sceneAt(sx, 0), [60, 100]) && same(T.sceneAt(sx, 45), [150, 100]) && same(T.sceneAt(sx, 50), [140, 100]));
    ok("!! a y-lane ship is at (fixed, c): (300, 40) at 0, going the other way (v = -2): at 10 s (300, 20), at 15 s (300, 30) after turning at the low end", same(T.sceneAt(sy, 0), [300, 40]) && same(T.sceneAt(sy, 10), [300, 20]) && same(T.sceneAt(sy, 15), [300, 30]));
    ok("!! laneSegment: an x-lane is (lo, fixed) to (hi, fixed), a y-lane (fixed, lo) to (fixed, hi)", same(T.laneSegment(sx), [50, 100, 150, 100]) && same(T.laneSegment(sy), [300, 20, 300, 120]));
});

console.log("\n3. THE SCENE");
guard("3", () => {
    const sc = T.tankScene(7), seeds = N.range(1, 200), scenes = seeds.map((s) => T.tankScene(s));
    ok("!! a scene is a function of its seed (twice, identical), frozen all the way down (obstacles, lanes), differs by seed, and carries the tank's size", same(sc, T.tankScene(7)) && !same(sc, T.tankScene(8)) && Object.isFrozen(sc) && Object.isFrozen(sc.obstacles) && sc.obstacles.every((o) => Object.isFrozen(o) && (!o.lane || Object.isFrozen(o.lane))) && sc.length === 500 && sc.width === 300 && sc.seed === 7);
    const m = thrown(() => T.tankScene(1, { length: 1500, width: 900 })), m2 = thrown(() => T.tankScene(1, { length: 500, width: 301 }));
    ok("!! only the standard tank has a scene: 1500 x 900 and 500 x 301 throw, naming the size asked and the standard; so does a tank wrong in ONE side only (1500 x 300, 500 x 900)", /subTankNav\.tankScene: .*500 x 300.*1500 x 900/.test(m) && /500 x 300.*500 x 301/.test(m2) && thrown(() => T.tankScene(1, { length: 500, width: 300 })) === "no throw" && /1500 x 300/.test(thrown(() => T.tankScene(1, { length: 1500, width: 300 }))) && /500 x 900/.test(thrown(() => T.tankScene(1, { length: 500, width: 900 }))));
    const cnt = (s, t) => s.obstacles.filter((o) => o.type === t), grp = (s) => new Set(cnt(s, "island").map((o) => o.group)).size;
    ok("!! every one of the 200 scenes has 2 islands (each of 2 or 3 discs), 3 icebergs and 2 ships (MEASURED, not enforced: 3,000 seeds, none short)", scenes.every((s) => grp(s) === 2 && cnt(s, "berg").length === 3 && cnt(s, "ship").length === 2 && [0, 1].every((g) => { const k = cnt(s, "island").filter((o) => o.group === g).length; return k >= 2 && k <= 3; })) && scenes.some((s) => cnt(s, "island").length === 4) && scenes.some((s) => cnt(s, "island").length === 6));
    ok("!! the numbers: island discs radius 8 to 22 with a full-depth keel (Infinity), icebergs radius 12 to 22 and keel 15 to 35, ships radius 8 to 12 and keel 18 to 40 and a speed of 1.0 to 2.5 m/s either way; the extremes of each range are approached", scenes.every((s) => s.obstacles.every((o) => (o.type === "island" ? o.r >= 8 && o.r <= 22 && o.keel === Infinity : o.type === "berg" ? o.r >= 12 && o.r <= 22 && o.keel >= 15 && o.keel <= 35 : o.r >= 8 && o.r <= 12 && o.keel >= 18 && o.keel <= 40 && Math.abs(o.lane.v) >= 1.0 && Math.abs(o.lane.v) <= 2.5) && o.vx === 0 && o.vy === 0)) &&
        scenes.some((s) => cnt(s, "berg").some((o) => o.keel < 17)) && scenes.some((s) => cnt(s, "berg").some((o) => o.keel > 33)) && scenes.some((s) => cnt(s, "ship").some((o) => o.lane.v < -2.3)) && scenes.some((s) => cnt(s, "ship").some((o) => o.lane.v > 2.3)));
    ok("!! every group id names ONE thing: the two islands are groups 0 and 1, the three icebergs 1000, 1001 and 1002, the two ships 2000 and 2001 (in every one of the 200 scenes)", scenes.every((s) => same([...new Set(cnt(s, "island").map((o) => o.group))].sort(), [0, 1]) && same(cnt(s, "berg").map((o) => o.group).sort(), [1000, 1001, 1002]) && same(cnt(s, "ship").map((o) => o.group).sort(), [2000, 2001])));
    const stat = (s) => s.obstacles.filter((o) => !o.lane);
    ok("!! every static disc is 30 m inside the walls and 24 m of water from every disc of ANOTHER group (the members of one island overlap)", scenes.every((s) => stat(s).every((o, i, a) => o.x - o.r >= 30 - 1e-9 && o.x + o.r <= 470 + 1e-9 && o.y - o.r >= 30 - 1e-9 && o.y + o.r <= 270 + 1e-9 && a.every((p) => p === o || p.group === o.group || Math.hypot(o.x - p.x, o.y - p.y) >= o.r + p.r + 24 - 1e-9))));
    ok("!! an island is a blob: its satellites overlap the main disc (centre distance 0.6 to 0.9 of the radii's sum)", scenes.every((s) => [0, 1].every((g) => { const mm = cnt(s, "island").filter((o) => o.group === g); return mm.slice(1).every((q) => Math.hypot(q.x - mm[0].x, q.y - mm[0].y) <= (mm[0].r + q.r) * 0.9 + 1e-9 && Math.hypot(q.x - mm[0].x, q.y - mm[0].y) >= (mm[0].r + q.r) * 0.6 - 1e-9); })));
    ok("!! a ship's lane is 150 to 280 m long and inside the tank (60 m from the ends of the axis, its fixed coordinate 60 m from the walls), its first place c0 is on the lane, and its first position is its position at t = 0",
        scenes.every((s) => cnt(s, "ship").every((o) => { const L = o.lane, len = L.hi - L.lo, ext = L.axis === "x" ? 500 : 300, across = L.axis === "x" ? 300 : 500, p0 = T.sceneAt(o, 0); return len >= 150 - 1e-9 && len <= 280 + 1e-9 && L.lo >= 60 && L.hi <= ext - 60 + 1e-9 && L.fixed >= 60 && L.fixed <= across - 60 + 1e-9 && L.c0 >= L.lo && L.c0 <= L.hi && o.x === p0[0] && o.y === p0[1]; })) && scenes.some((s) => cnt(s, "ship").some((o) => o.lane.axis === "x")) && scenes.some((s) => cnt(s, "ship").some((o) => o.lane.axis === "y")));
    ok("!! a lane keeps r + r' + 10 m from every static disc along its whole length, and a ship stays on its lane for 600 s", scenes.every((s) => cnt(s, "ship").every((o) => stat(s).every((q) => N.segmentDistance(q.x, q.y, ...T.laneSegment(o)) >= o.r + q.r + 10 - 1e-9) && [0, 37, 111, 250, 600].every((t) => { const [x, y] = T.sceneAt(o, t); return o.lane.axis === "x" ? x >= o.lane.lo - 1e-9 && x <= o.lane.hi + 1e-9 && y === o.lane.fixed : y >= o.lane.lo - 1e-9 && y <= o.lane.hi + 1e-9 && x === o.lane.fixed; }))));
    const now = T.sceneNow(sc, 30), ship = sc.obstacles.find((o) => o.type === "ship");
    ok("!! sceneNow(scene, t) is what a page draws: one plain record { type, group, x, y, r, keel } per obstacle in scene order, ships where they are at t and statics where they were", now.length === sc.obstacles.length && now.every((q, i) => q.type === sc.obstacles[i].type && q.group === sc.obstacles[i].group && q.r === sc.obstacles[i].r && q.keel === sc.obstacles[i].keel && Object.keys(q).length === 6) && same(now.find((q) => q.type === "ship" && q.group === ship.group).x === T.sceneAt(ship, 30)[0], true) && same(now.filter((q) => q.type !== "ship").map((q) => [q.x, q.y]), sc.obstacles.filter((o) => o.type !== "ship").map((o) => [o.x, o.y])) && !same(T.sceneNow(sc, 0), T.sceneNow(sc, 30)));
});

console.log("\n4. THE NAVIGATOR");
guard("4", () => {
    const open = mk([]);
    ok("!! a bad arm throws FROM createNavigator and names the arms; each good arm builds one", /subTankNav\.createNavigator: unknown arm "magnet"/.test(thrown(() => T.createNavigator(open, { arm: "magnet" }))) && T.TANK_ARMS.every((a) => thrown(() => T.createNavigator(open, { arm: a })) === "no throw" && thrown(() => T.createNavigator(open, { arm: "magnet" })).includes(a)) && T.createNavigator(open).arm === "any+predict");
    const n0 = T.createNavigator(open, { arm: "any", seed: 3 }), s0 = n0.snapshot();
    ok("!! before it steps a navigator has no goal and zero counters; the snapshot is a copy", s0.goal === null && s0.arrivals === 0 && s0.hits === 0 && s0.replans === 0 && s0.noRoute === false && s0.margin === null && s0.travel === 0 && s0.contact === false && s0.t === null && s0.arm === "any" && n0.snapshot() !== s0);
    const sub = st(60, 150, 25), t0 = n0.step(sub, 0, 0.033), g = n0.snapshot().goal;
    ok("!! the snapshot carries the TANK TIME of the last step (0 after the first step at t = 0; the time given on a later one)", n0.snapshot().t === 0 && (() => { const q = T.createNavigator(open, { arm: "straight", seed: 3 }); q.step(sub, 17.5, 0.1); return q.snapshot().t === 17.5; })());
    ok("!! the first step draws a goal: inside the box (60 m from the walls), at least 150 m from the sub, a depth 2 m inside the tank's range; the target has the goal's depth and the cruise speed 3", !!g && g.x >= 60 && g.x <= 440 && g.y >= 60 && g.y <= 240 && Math.hypot(g.x - 60, g.y - 150) >= 150 && g.depth >= 16 && g.depth <= 38 && near(t0.depth, g.depth) && near(t0.speed, 3));
    ok("!! in an open sea the heading is the bearing to the goal (the aim point of every cell is the goal itself)", near(t0.heading, Math.atan2(-(g.y - 150), g.x - 60), 1e-9));
    ok("!! the goal is a function of the navigator's seed (twice, the same; another seed, another)", same(T.createNavigator(open, { arm: "any", seed: 3 }).step(sub, 0, 0.033), t0) && !same(T.createNavigator(open, { arm: "any", seed: 4 }).step(sub, 0, 0.033), t0));
    // goals are clear of the obstacles and have a route
    const sc = T.tankScene(5), goals = [];
    for (let k = 1; k <= 25; k++) { const nv = T.createNavigator(sc, { arm: "any", seed: k }); nv.step(st(100, 100, 25), 0, 0.033); goals.push(nv.snapshot().goal); }
    ok("!! over 25 seeds in one sea every goal is r + 28 m from every static disc and from every ship's whole lane, 150 m from the sub, and inside the box", goals.every((q) => q && sc.obstacles.every((o) => (o.lane ? N.segmentDistance(q.x, q.y, ...T.laneSegment(o)) : Math.hypot(q.x - o.x, q.y - o.y)) >= o.r + 28 - 1e-9) && Math.hypot(q.x - 100, q.y - 100) >= 150 && q.x >= 60 && q.x <= 440 && q.y >= 60 && q.y <= 240) && new Set(goals.map((q) => q.x.toFixed(3))).size > 20 && goals.every((q) => q.depth >= 16 && q.depth <= 38) && goals.some((q) => q.depth < 20) && goals.some((q) => q.depth > 34));
    const full = mk([O({ type: "island", x: 250, y: 150, r: 400 })]), nF = T.createNavigator(full, { arm: "straight", seed: 2 }); nF.step(st(100, 100, 25), 0, 0.1);
    ok("!! when no goal can be found (a sea shut by one huge island: nothing is r + 28 m clear) the navigator does not hang or throw: it takes the default goal (440, 150) at the middle depth 27 m", same(nF.snapshot().goal, { x: 440, y: 150, depth: 27 }));
    const ring = mk(Array.from({ length: 10 }, (_, k) => O({ type: "island", x: 100 + 60 * Math.cos(k * 0.6283185), y: 150 + 60 * Math.sin(k * 0.6283185), r: 30 }))), goalOf = (arm) => { const q = T.createNavigator(ring, { arm, seed: 7 }); q.step(st(100, 150, 25), 0, 0.1); return q.snapshot().goal; };
    ok("!! the goal is the first CLEAR candidate for `straight` (no route is asked) and the first with a ROUTE for the field arms (or the last clear one when none has): with the sub shut in a ring the two differ for the same seed", !same(goalOf("straight"), goalOf("any")) && same(goalOf("any"), goalOf("any+predict")));
    const keelSea = (keel) => mk([O({ x: 250, y: 150, r: 30, keel })]), hd = (keel) => { const q = T.createNavigator(keelSea(keel), { arm: "any", seed: 1 }), tg = q.step(st(150, 150, 20), 0, 0.1), g2 = q.snapshot().goal; return { dev: Math.abs(tg.heading - Math.atan2(-(g2.y - 150), g2.x - 150)), g: g2 }; };
    ok("!! the plan blocks an iceberg by the SHALLOWER of the sub's depth and the goal's: a keel of 18 m under a sub at 20 m flying to a goal at 30 m is in the way (the heading is 0.7 rad off the bearing), a keel of 10 m is passed beneath (heading on the bearing)", hd(18).g.depth > 26 && hd(18).g.x > 330 && hd(18).dev > 0.3 && hd(10).dev < 0.02);
    // arrival
    const nA = T.createNavigator(open, { arm: "any", seed: 9 }); nA.step(sub, 0, 0.033);
    const gA = nA.snapshot().goal, atGoal = st(gA.x, gA.y, gA.depth); nA.step(atGoal, 1, 0.033);
    const sA = nA.snapshot();
    ok("!! reaching the goal (within 10 m on the plane and 4 m in depth) counts an arrival and draws ANOTHER goal; a vessel 12 m off does not arrive", sA.arrivals === 1 && !same(sA.goal, gA) && (() => { const nB = T.createNavigator(open, { arm: "any", seed: 9 }); nB.step(sub, 0, 0.033); nB.step(st(gA.x + 12, gA.y, gA.depth), 1, 0.033); return nB.snapshot().arrivals === 0; })() && (() => { const nB = T.createNavigator(open, { arm: "any", seed: 9 }); nB.step(sub, 0, 0.033); nB.step(st(gA.x, gA.y, gA.depth + 6), 1, 0.033); return nB.snapshot().arrivals === 0; })());
    // contact
    const isl = mk([O({ type: "island", x: 250, y: 150, r: 20 })]), nC = T.createNavigator(isl, { arm: "straight", seed: 2 });
    nC.step(st(100, 150, 25), 0, 0.5);
    nC.step(st(250, 150, 25), 1, 0.5); const c1 = nC.snapshot();
    nC.step(st(250, 150, 25), 2, 0.5); const c2 = nC.snapshot();
    ok("!! a contact (the gap to the disc's edge less the half-hull is negative) counts ONCE and stays one contact while it lasts: hits 1 after the first step inside, still 1 on the next, `contact` true", c1.hits === 1 && c1.contact === true && c2.hits === 1 && c2.contact === true);
    nC.step(st(100, 150, 25), 3, 0.5); const c3 = nC.snapshot(); nC.step(st(250, 150, 25), 3.4, 0.4); const c4 = nC.snapshot();
    ok("!! 0.5 s clear is not enough to end it (the contact is still on, and a return at once is NOT a second hit); the contact ends after a whole second clear and the next one counts (hits 2)", c3.hits === 1 && c3.contact === true && c4.hits === 1 && (() => { nC.step(st(100, 150, 25), 4, 0.6); nC.step(st(100, 150, 25), 4.6, 0.6); const e = nC.snapshot(); nC.step(st(250, 150, 25), 5, 0.1); return e.contact === false && nC.snapshot().hits === 2; })());
    const nC2 = T.createNavigator(isl, { arm: "straight", seed: 2 }); nC2.step(st(250, 150, 25), 0, 0.1);
    nC2.step(st(100, 150, 25), 0.1, 0.6); nC2.step(st(250, 150, 25), 0.7, 0.1); nC2.step(st(100, 150, 25), 0.8, 0.6); nC2.step(st(250, 150, 25), 1.4, 0.1);
    ok("!! the clear second restarts at every renewed contact: in, 0.6 s clear, in, 0.6 s clear, in is still ONE contact (1.2 s clear in all, but never a second in a row)", nC2.snapshot().hits === 1 && nC2.snapshot().contact === true);
    const lane = O({ type: "ship", x: 100, y: 150, r: 10, keel: 60, lane: { axis: "x", fixed: 150, lo: 100, hi: 400, c0: 100, v: 2 } }), shipSea = mk([lane]), nS = T.createNavigator(shipSea, { arm: "straight", seed: 2 });
    nS.step(st(200, 150, 25), 0, 0.1); const s0h = nS.snapshot().hits; nS.step(st(200, 150, 25), 50, 0.1);
    ok("!! contact is read at the TANK'S CLOCK against the ship where it is THEN: a ship on a lane that is at (100, 150) at t = 0 and at (200, 150) at t = 50 s does not touch a sub at (200, 150) at t = 0 and does at t = 50", s0h === 0 && nS.snapshot().hits === 1);
    const berg = mk([O({ type: "berg", x: 250, y: 150, r: 20, keel: 20 })]), nD = T.createNavigator(berg, { arm: "straight", seed: 2 });
    nD.step(st(250, 150, 30), 0, 0.5); const d1 = nD.snapshot().hits; nD.step(st(250, 150, 15), 1, 0.5);
    ok("!! an iceberg is passed BENEATH (a vessel at 30 m under a keel at 20 m: no contact) and hit above it (at 15 m: contact)", d1 === 0 && nD.snapshot().hits === 1);
    const nE = T.createNavigator(open, { arm: "straight", seed: 2 }); nE.step(st(100, 100, 25), 0, 0.1); nE.step(st(103, 104, 25), 0.1, 0.1); nE.step(st(103, 114, 25), 0.2, 0.1);
    ok("!! the travel adds up the plan distance between steps (5 m, then 10 m: 15 m); depth does not count", near(nE.snapshot().travel, 15) && (() => { const q = T.createNavigator(open, { arm: "straight", seed: 2 }); q.step(st(100, 100, 25), 0, 0.1); q.step(st(100, 100, 35), 0.1, 0.1); return q.snapshot().travel === 0; })());
    // plans
    const plans = (arm, sea, seconds) => { const nv = T.createNavigator(sea, { arm, seed: 4 }); const s1 = st(60, 60, 25); for (let t = 0; t <= seconds; t += 0.1) nv.step(s1, t, 0.1); return nv.snapshot(); };
    const ps = plans("straight", open, 10), pa = plans("any", open, 10), pr = plans("any+replan", open, 10), pp = plans("any+predict", open, 10);
    ok("!! plans: straight builds none; `any` one for the goal (and no more while the goal stands); the replan arms one at the start and one every 3 s (10 s: at 0, 3, 6, 9)", ps.replans === 0 && ps.margin === null && pa.replans === 1 && pr.replans === 4 && pp.replans === 4 && pa.margin === 12 && pr.margin === 12 && pa.noRoute === false);
    const ship = O({ type: "ship", x: 200, y: 150, r: 10, keel: 40, lane: { axis: "y", fixed: 200, lo: 60, hi: 240, c0: 150, v: 2 } });
    const mvSea = mk([ship]), sub2 = st(100, 150, 25);
    const head = (arm, t) => { const nv = T.createNavigator(mvSea, { arm, seed: 6 }); return nv.step(sub2, t, 0.1).heading; };
    ok("!! the arms see ships differently: with a ship crossing 100 m ahead, `any+predict` plans round its next 30 s and steers differently from `any+replan` (which sees it where it is); both differ from the open-sea bearing", Math.abs(head("any+predict", 0) - head("any+replan", 0)) > 0.01 || Math.abs(head("any+predict", 0) - head("any", 0)) > 0.01);
    // targets
    const wallSea = mk([O({ type: "island", x: 250, y: 150, r: 25 })]);
    const nW = T.createNavigator(wallSea, { arm: "any", seed: 11 }); const tw = nW.step(st(150, 150, 25), 0, 0.1), gw = nW.snapshot().goal;
    ok("!! an island between the sub and its goal: the heading is NOT the straight bearing (it aims at the zone's corner) whenever the line is blocked, and the depth/speed are the goal's depth and 3", (() => { const blocked = N.isBlocked({ x: 150, y: 150 }, gw, [{ x: 250, y: 150, r: 25 }]); const br = Math.atan2(-(gw.y - 150), gw.x - 150); return !blocked || Math.abs(tw.heading - br) > 0.02; })() && near(tw.depth, gw.depth) && near(tw.speed, 3));
    const nO = T.createNavigator(open, { arm: "any", seed: 3 }); nO.step(sub, 0, 0.1);
    const out1 = nO.step(st(-20, 150, 25), 1, 0.1), out2 = nO.step(st(250, 330, 25), 2, 0.1);
    ok("!! outside the tank the target is the middle at 2 m/s (a heading to (250, 150)): from (-20, 150) due east, from (250, 330) due north (-pi/2 in the engine's convention); the goal's depth is kept", near(out1.heading, 0, 1e-9) && near(out1.speed, 2) && near(out2.heading, Math.atan2(-(150 - 330), 0), 1e-9) && near(out2.depth, nO.snapshot().goal.depth));
    const out3 = nO.step(st(520, 150, 25), 3, 0.1), out4 = nO.step(st(250, -20, 25), 4, 0.1);
    ok("!! and from the east (520, 150) due west (pi), from the south edge (250, -20) due toward the middle (-pi/2): all four sides of the tank bring a sub back", near(Math.abs(out3.heading), Math.PI, 1e-9) && near(out4.heading, Math.atan2(-170, 0), 1e-9));
    const snap1 = nO.snapshot(); snap1.goal.x = -999;
    ok("!! the snapshot's goal is a COPY (writing to it does not move the navigator's goal)", nO.snapshot().goal.x !== -999);
    const ringNav = T.createNavigator(ring, { arm: "any+replan", seed: 7 }); ringNav.step(st(100, 150, 25), 0, 0.1); const rs = ringNav.snapshot();
    ok("!! shut in a ring the snapshot says so: no route, and the plan is the LAST rung's (3 m); in the open sea it is at 12 m with a route", rs.noRoute === true && rs.margin === 3 && nO.snapshot().noRoute === false && nO.snapshot().margin === 12);
    const nR = T.createNavigator(open, { arm: "any+replan", seed: 9 }); nR.step(sub, 0, 0.1); const gR = nR.snapshot().goal, rp0 = nR.snapshot().replans; nR.step(st(gR.x, gR.y, gR.depth), 1, 0.1);
    ok("!! a plan is made AT ONCE for a new goal (the arrival step draws the goal and builds its plan in the same step), not at the next 3 s boundary", nR.snapshot().replans === rp0 + 1 && nR.snapshot().arrivals === 1);
    const nI = T.createNavigator(open, { arm: "any", seed: 3 }); nI.step(sub, 0, 0.1); const pl = nI.snapshot().replans; nI.invalidate(); nI.step(sub, 0.2, 0.1);
    ok("!! invalidate() drops the plan: the next step builds a new one (a sub put back after a loss)", nI.snapshot().replans === pl + 1);
});

console.log("\n5. THE FLIGHT");
guard("5", () => {
    const MODEL = HL.model("nominal");
    const fly = (seed, arm, secs) => {
        const scene = T.tankScene(seed), nav = T.createNavigator(scene, { arm, seed: 5 });
        let s = S.createState({ depth: 25, pos: [100, 150, -25], speed: 2, heading: 0, model: MODEL }), t = 0, lost = null;
        for (let i = 0; i < Math.round(secs / S.DT); i++) { const tg = nav.step(s, t, S.DT), res = S.stepSub(MODEL, s, AP.decide(s, tg, [0, 0, 0]), S.DT, [0, 0, 0], 0); s = res.state; t += S.DT; if (res.status !== "submerged") { lost = res.status; break; } }
        return { ...nav.snapshot(), lost };
    };
    const a = fly(1, "any", 300), b = fly(1, "straight", 300), c = fly(1, "any+predict", 300), d = fly(2, "any+replan", 300);
    ok("!! flown on the real vessel (the PD autopilot, the nominal hull, 300 tank-seconds from (100, 150) at 25 m) the navigators keep the sub swimming and arriving: no arm is lost, each arrives at least twice and travels 800 to 950 m", [a, b, c, d].every((r) => r.lost === null && r.arrivals >= 2 && r.travel > 800 && r.travel < 950));
    ok("!! GOLDEN counts (arrivals, contacts, plans): sea 1: `any` 3, 2, 4 (one plan for the first goal and one for each of the three that followed); straight 3, 2, 0; `any+predict` 3, 1, 102 (a plan every 3 s); sea 2 `any+replan` 3, 1, 100; no route at the end, the plan at the 12 m rung",
        same([a.arrivals, a.hits, a.replans], [3, 2, 4]) && same([b.arrivals, b.hits, b.replans], [3, 2, 0]) && same([c.arrivals, c.hits, c.replans], [3, 1, 102]) && same([d.arrivals, d.hits, d.replans], [3, 1, 100]) && a.noRoute === false && c.margin === 12 && near(a.travel, 866, 5) && near(b.travel, 873, 5));
});

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
