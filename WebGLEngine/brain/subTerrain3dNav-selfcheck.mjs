// WebGLEngine/brain/subTerrain3dNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subTerrain3dNav-selfcheck.mjs      (about 10 s)
//
// A DEPTH DIMENSION (brain/subTerrain3dNav.mjs), held to its word before HELD11 is flown ("FOLLOW-UP 11" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   arms, the registered numbers, the terrain ranges, the sets
//   2  THE TERRAIN     terrainFor in its ranges, deterministic; keelNeed, the footprint floor and passableUnder by hand, each at its boundary
//   3  THE DIVE        nearOrAhead by hand; depthTarget for each arm, the floor clamp winning
//   4  THE FLIGHT      `any` is flyHard's flight when the floor never binds (the identity), the grounding branch, the record, the dives, the plan with passable bergs removed, a golden of thirty DEV seeds
//
// SABOTAGE LOG (serial mutation pass of brain/subTerrain3dNav.mjs, one mutant per code line and operator, at most four of each operator on a line, one worktree): 105 mutants; 61 red on the first pass and 44 survivors read one by one. Rows were added (a golden of the terrain generator, the east and west points of the footprint, the dive held only above the wanted depth, the floor ahead read along the heading,
//   the grounding line at gap 0 and the hull's lowest point) and the survivors were run again: 44 mutants, 19 red, 25 survivors, all EQUIVALENT or NOT REACHED: seabed 1000 -> 1001 (the floor never touches a flight at depth); the footprint's `k <= 8` and `k < 9` (the ninth point repeats the first), the sign of the cosine or sine of the footprint (the eight points are symmetric under it), the quarter-turn
//   step changed in the x term only (a floor that varies in x only has the same minimum among the shifted points on every test floor); `along >= 1` for `>= 0` (a berg within 1 m ahead is inside the grown footprint, which is caught first); the first plan built at t = 1 and the first clearance read at t = 1 (static scenario); `dist < BIG` -> `<=` and `&&` -> `||` in noRoute (no DEV seed has no route);
//   `<` -> `<=` on a float tie (the floor minimum, the clearance minimum, collision, the region's edges); the struck obstacle (`||` -> `&&`, `|| null` -> `&& null`, `< 1`) and the region's four `&&`/`||` edge tests: NOT REACHED (no arm collides with a berg or leaves the region on any DEV seed, so the branch is not entered).
//   NOT CHECKED, said plainly: the generator takes at most four mutants of an operator on a line; the golden freezes what the three arms do on DEV today and does not say it is right.
"use strict";
import * as T from "./subTerrain3dNav.mjs";
import * as H from "./subHardNav.mjs";
import * as MT from "./missionTask.mjs";
import * as AP from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pilot = (s, t, c) => AP.decide(s, t, c);
const berg = (x, y, r, keel) => ({ type: "berg", x, y, r, keel, vx: 0, vy: 0 });
const flat = (base) => ({ base, a1: 0, l1: 100, p1: 0, a2: 0, l2: 50, p2: 0, b: 0, ly: 100, py: 0 });
const ridge = { base: 70, a1: 0, l1: 100, p1: 0, a2: 0, l2: 50, p2: 0, b: 5, ly: 100, py: 0 };   // 70 + 5 sin(2 pi y / 100)
console.log("subTerrain3dNav-selfcheck -- a depth dimension\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the three arms (the floor arm the reference, the 3d arm designated), the kind hard-islands", same(T.TERRAIN_ARMS, ["any", "any+floor", "any+3d"]) && T.REFERENCE === "any+floor" && T.DESIGNATED === "any+3d" && T.KIND === "hard-islands");
    ok("!! the registered numbers: altitude 10 m (the terrain mission's), dive pad 20 m, look 90 m, the sonar-ahead 20 m", T.ALTITUDE === 10 && T.ALTITUDE === MT.ALTITUDE && T.DIVE_PAD === 20 && T.DIVE_LOOK_M === 90 && T.SONAR_AHEAD === 20 && T.SONAR_AHEAD === MT.SONAR_RANGE);
    ok("!! the terrain ranges: base 65..85, a1 3..8, l1 100..160, a2 1..4, l2 50..80, b 2..6, ly 120..200", same(T.TERRAIN, { baseLo: 65, baseHi: 85, a1Lo: 3, a1Hi: 8, l1Lo: 100, l1Hi: 160, a2Lo: 1, a2Hi: 4, l2Lo: 50, l2Hi: 80, bLo: 2, bHi: 6, lyLo: 120, lyHi: 200 }));
    ok("!! DEV is seeds 1 to 30 (subHardNav's); HELD11 is 1101 to 1160 (60 seeds)", T.SETS.dev === H.HARD_SETS.dev && T.HELD11.length === 60 && T.HELD11[0] === 1101 && T.HELD11[59] === 1160 && T.SETS.held11 === T.HELD11);
}
console.log("\n2. THE TERRAIN");
{
    const R = T.TERRAIN, bad = [];
    for (let sd = 1; sd <= 40; sd++) { const t = T.terrainFor(sd); if (!(t.base >= R.baseLo && t.base <= R.baseHi && t.a1 >= R.a1Lo && t.a1 <= R.a1Hi && t.l1 >= R.l1Lo && t.l1 <= R.l1Hi && t.a2 >= R.a2Lo && t.a2 <= R.a2Hi && t.l2 >= R.l2Lo && t.l2 <= R.l2Hi && t.b >= R.bLo && t.b <= R.bHi && t.ly >= R.lyLo && t.ly <= R.lyHi && t.p1 >= 0 && t.p1 <= 6.28 && t.p2 >= 0 && t.p2 <= 6.28 && t.py >= 0 && t.py <= 6.28 && Object.isFrozen(t))) bad.push(sd); }
    ok("!! terrainFor is inside every range for forty seeds, the phases in 0..6.28, and frozen", bad.length === 0, `bad ${bad.join()}`);
    ok("!! terrainFor is deterministic and the seeds differ", same(T.terrainFor(5), T.terrainFor(5)) && !same(T.terrainFor(5), T.terrainFor(6)) && T.terrainFor(5).base !== T.terrainFor(6).base);
    const t1 = T.terrainFor(1), t2 = T.terrainFor(2), r6 = (x) => +x.toFixed(6);
    ok("!! GOLDEN (a regression snapshot of the generator, not a hand derivation): terrainFor(1) base, a1, l1, p1, b, py and terrainFor(2) base, a2, l2, p2, ly to six places", same([t1.base, t1.a1, t1.l1, t1.p1, t1.b, t1.py].map(r6), [76.203322, 4.737723, 155.14456, 5.50341, 5.944707, 1.642077]) && same([t2.base, t2.a2, t2.l2, t2.p2, t2.ly].map(r6), [70.651938, 2.594681, 63.430294, 5.499943, 154.658789]), JSON.stringify([t1.base, t1.a1].map(r6)));
    const fl = [1, 2, 3, 4, 5, 6, 7, 8].map((sd) => { const t = T.terrainFor(sd); return MT.seabedAt(t, 0, 0); });
    ok("!! the floor under the start is deep enough to fly in: at least 47 m at the origin for eight seeds (base 65 minus the amplitudes 8 + 4 + 6 = 18)", fl.every((x) => x >= 47), fl.map((x) => x.toFixed(0)).join());
    ok("!! keelNeed = keel + VMARGIN (5) + VRADIUS (0.6): keel 10 needs 15.6, keel 0 needs 5.6", near(T.keelNeed({ keel: 10 }), 15.6) && near(T.keelNeed({ keel: 0 }), 5.6));
    ok("!! the footprint floor of a flat floor is its depth (70), of a disc of radius 25 at the origin on the cross-track ridge 70 + 5 sin(2 pi y / 100) is 65 (the point at y = -25)", near(T.footprintFloor(flat(70), berg(0, 0, 25, 10)), 70) && near(T.footprintFloor(ridge, berg(0, 0, 25, 10)), 65, 1e-9), `${T.footprintFloor(ridge, berg(0, 0, 25, 10))}`);
    ok("!! the footprint takes the SHALLOWEST of nine points: a disc of radius 25 centred on the ridge's crest (y = 25, floor 75 at the centre) still reads 70 at its y = 0 point", near(T.footprintFloor(ridge, berg(0, 25, 25, 10)), 70, 1e-9), `${T.footprintFloor(ridge, berg(0, 25, 25, 10))}`);
    const eastDip = { base: 70, a1: 5, l1: 100, p1: 0, a2: 0, l2: 50, p2: 0, b: 0, ly: 100, py: 0 };   // 70 + 5 sin(2 pi x / 100): the east point of a disc at the origin (x = 25) is the crest (75), the west (x = -25) the trough (65)
    const westDip = { ...eastDip, a1: -5 };
    ok("!! the footprint reads the east and west points: a disc of radius 25 at the origin on 70 + 5 sin(2 pi x / 100) has its shallowest at the WEST (x = -25: 65); on 70 - 5 sin(...) at the EAST (x = 25: 65); a disc at x = 25 on the first reads 70 at its centre-west point", near(T.footprintFloor(eastDip, berg(0, 0, 25, 10)), 65, 1e-9) && near(T.footprintFloor(westDip, berg(0, 0, 25, 10)), 65, 1e-9));
    ok("!! passable under: keel 40 on the ridge (floor 65 - 10 = 55 against need 45.6) is passable; keel 49.4 (need exactly 55.0) is; keel 49.5 (55.1) is not", T.passableUnder(ridge, berg(0, 0, 25, 40)) && T.passableUnder(ridge, berg(0, 0, 25, 49.4)) && !T.passableUnder(ridge, berg(0, 0, 25, 49.5)));
    ok("!! only a berg with a finite keel is passable: an island (keel Infinity), a ship and a wall are not, however deep the floor", !T.passableUnder(flat(500), { type: "island", x: 0, y: 0, r: 10, keel: Infinity }) && !T.passableUnder(flat(500), { type: "ship", x: 0, y: 0, r: 10, keel: 20 }) && !T.passableUnder(flat(500), { type: "wall", x: 0, y: 0, r: 10, keel: 20 }) && !T.passableUnder(flat(500), berg(0, 0, 10, Infinity)) && T.passableUnder(flat(500), berg(0, 0, 10, 20)));
}
console.log("\n3. THE DIVE");
{
    const n = (x, y, h, o) => safe(() => T.nearOrAhead(x, y, h, o), null), o = (x, y, r = 10) => berg(x, y, r, 20);
    ok("!! heading east from the origin: a berg of radius 10 at 80 m dead ahead is met within 90 m; at 100 m it is not", n(0, 0, 0, o(80, 0)) === true && n(0, 0, 0, o(100, 0)) === false);
    ok("!! the ray is grown by radius + 20 m: abeam 30 m (r 10) is met, 31 m is not", n(0, 0, 0, o(80, 30)) === true && n(0, 0, 0, o(80, 31)) === false);
    ok("!! a berg behind (50 m astern) is not met; one the vessel is INSIDE the grown footprint of (25 m away, r 10: grown 30) is", n(0, 0, 0, o(-50, 0)) === false && n(0, 25, 0, o(0, 0)) === true && n(0, 31, 0, o(0, 0)) === false);
    ok("!! heading south (pi/2, velocity -y): a berg 60 m to the south is ahead, to the north is not", n(0, 0, Math.PI / 2, o(0, -60)) === true && n(0, 0, Math.PI / 2, o(0, 60)) === false);
    const obs = [berg(80, 0, 10, 30)], dT = (arm, t, want, x = 0, y = 0, h = 0) => safe(() => T.depthTarget(arm, t, obs, x, y, h, want), null);
    const a = dT("any", flat(70), 80), f = dT("any+floor", flat(70), 80), d = dT("any+3d", flat(70), 20);
    ok("!! `any` ignores the floor: floor 70, wanted 80 gives 80 and not held", !!a && a.depth === 80 && a.held === false);
    ok("!! `any+floor` clamps to the floor minus the altitude: floor 70 wanted 80 gives 60; wanted 20 gives 20", !!f && f.depth === 60 && dT("any+floor", flat(70), 20).depth === 20 && !f.held);
    ok("!! `any+3d` is held under a passable berg ahead: keel 30 (need 35.6), wanted 20 gives 35.6 and held true; with the berg 200 m away it gives 20 and not held", !!d && near(d.depth, 35.6) && d.held === true && (() => { const far = T.depthTarget("any+3d", flat(70), [berg(280, 0, 10, 30)], 0, 0, 0, 20); return far.depth === 20 && far.held === false; })());
    ok("!! the dive is held only when the keel clearance is ABOVE the wanted depth: wanted exactly 35.6 under a keel-30 berg (need 35.6) is 35.6 and not held", (() => { const r = T.depthTarget("any+3d", flat(70), obs, 0, 0, 0, 30 + 5 + 0.6); return near(r.depth, 35.6) && r.held === false; })());
    ok("!! the floor ahead is read along the heading (x + 20 cos h, y - 20 sin h): heading south (pi/2) on the ridge 70 + 5 sin(2 pi y / 100) from (0, 0): ahead is y = -20, the floor 65.245, so the allowed depth is 55.245 (and not 60)", near(T.depthTarget("any+floor", ridge, [], 0, 0, Math.PI / 2, 100).depth, 70 + 5 * Math.sin(2 * Math.PI * -20 / 100) - 10, 1e-9), `${T.depthTarget("any+floor", ridge, [], 0, 0, Math.PI / 2, 100).depth}`);
    ok("!! `any+3d` does not rise for a berg it already clears (wanted 50 > need 35.6: 50, not held) and the floor clamp WINS over the dive (floor 40 -> 30 m allowed, need 35.6 not passable here so no raise: wanted 20 stays 20)", dT("any+3d", flat(70), 50).depth === 50 && dT("any+3d", flat(70), 50).held === false && dT("any+3d", flat(40), 20).depth === 20);
    ok("!! the floor clamp wins over a dive that was allowed: a berg passable on a floor of 50 (need 35.6, floor 40 below the berg) with the floor ahead of the vessel only 45 gives min(35.6, 45 - 10) = 35", (() => { const t = { base: 50, a1: 10, l1: 40, p1: Math.PI / 2, a2: 0, l2: 50, p2: 0, b: 0, ly: 100, py: 0 }; const r = T.depthTarget("any+3d", t, [berg(80, 0, 1, 30)], 0, 0, 0, 20); const floorHere = MT.seabedAt(t, 0, 0), floorAhead = MT.seabedAt(t, 20, 0); return r.depth <= Math.min(floorHere, floorAhead) - 10 + 1e-9; })());
    ok("!! the floor under the hull AND 20 m ahead: the shallower of the two is used (a step of the floor up ahead lowers the allowed depth)", (() => { const t = { base: 60, a1: 10, l1: 80, p1: Math.PI, a2: 0, l2: 50, p2: 0, b: 0, ly: 100, py: 0 }; const here = MT.seabedAt(t, 0, 0), ahead = MT.seabedAt(t, 20, 0), r = T.depthTarget("any+floor", t, [], 0, 0, 0, 100); return ahead < here && near(r.depth, ahead - 10, 1e-9); })());
}
console.log("\n4. THE FLIGHT");
{
    const ids = [1, 2, 3, 4, 5, 6, 7, 8].map((sd) => { const a = safe(() => T.flyTerrain(pilot, sd, "any")) || {}, b = H.flyHard(pilot, H.hardScenario(sd, "hard-islands"), "any"); return a.t === b.t && a.path === b.path && a.ticks === b.ticks && a.minClearance === b.minClearance && a.status === b.status; });
    ok("!! `any` over a floor that never binds is flyHard's `any` flight on eight DEV seeds (status, time, path, ticks, clearance): the terrain adds a test and nothing else", ids.every(Boolean), ids.map(Number).join(""));
    const r = safe(() => T.flyTerrain(pilot, 3, "any+3d")), sc = H.hardScenario(3, "hard-islands");
    ok("!! the record: arm, kind, seed, reached matches status, grounded false, chord start to goal, a minimum floor gap above 10 m, passable counted by hand", !!r && r.arm === "any+3d" && r.kind === "hard-islands" && r.seed === 3 && r.reached === (r.status === "reached") && r.grounded === false && near(r.chord, Math.hypot(sc.goal.x - sc.start.x, sc.goal.y - sc.start.y)) && r.minFloor > 10 && r.passable === sc.obstacles.filter((o) => T.passableUnder(T.terrainFor(3), o)).length && r.noRoute === false);
    const g = safe(() => T.flyTerrain(pilot, 3, "any", { terrain: flat(15) }));
    ok("!! over a floor of 15 m (the vessel starts at 20 to 30 m, under it) the vessel GROUNDS at once: status grounded, grounded true, reached false, no arrival time, the floor gap at or under 0", !!g && g.status === "grounded" && g.grounded === true && g.reached === false && g.t === null && g.minFloor <= 0 && g.ticks < 50);
    const st3 = H.hardScenario(3, "hard-islands").start, Rr = 0.6, mk = (d) => ({ base: st3.depth + Rr + d, a1: 0, l1: 100, p1: 0, a2: 0, l2: 50, p2: 0, b: 0, ly: 100, py: 0 });
    const g1 = safe(() => T.flyTerrain(pilot, 3, "any", { terrain: mk(0.7), seconds: 0.2 })), g2 = safe(() => T.flyTerrain(pilot, 3, "any", { terrain: mk(0.6), seconds: 0.2 })), g3 = safe(() => T.flyTerrain(pilot, 3, "any", { terrain: mk(-0.2) }));
    ok("!! the grounding line is at gap 0: a floor 0.7 m below the hull's start does NOT ground (minFloor 0.6 to 0.7 > 0, status timeout); a floor 0.2 m ABOVE the hull's lowest point does", !!g1 && g1.status === "timeout" && g1.minFloor > 0.5 && g1.minFloor < 0.7 && !!g3 && g3.status === "grounded" && g3.ticks <= 3, `${g1 && g1.status} ${g1 && g1.minFloor} ${g3 && g3.status} ${g3 && g3.ticks}`);
    ok("!! the hull's lowest point is R cos(pitch) + half the length x |sin(pitch)| under the centre: a floor 0.6 m under the start's hull reads a least gap of 0.536 (+- 0.03: the nose-down pitch of 0.013 rad adds 0.05 m; a sign slip moves it by 0.1)", !!g2 && Math.abs(g2.minFloor - 0.5357) < 0.03, `${g2 && g2.minFloor}`);
    const dv = [1, 2, 3, 4, 5, 6].map((sd) => ({ f: safe(() => T.flyTerrain(pilot, sd, "any+floor")), d: safe(() => T.flyTerrain(pilot, sd, "any+3d")) }));
    ok("!! the floor arms are never held down by a keel (dives 0); `any+3d` is held down in some flights of six DEV seeds, and where it is the berg is one it can pass under", dv.every((x) => x.f && x.f.dives === 0) && dv.some((x) => x.d && x.d.dives > 0) && dv.every((x) => !x.d || x.d.dives === 0 || x.d.passable > 0));
    ok("!! the plan of `any+3d` has the passable bergs removed (a route exists, noRoute false, on six seeds) and its path differs from `any+floor`'s on at least one", dv.every((x) => x.d && x.d.noRoute === false) && dv.some((x) => x.d.path !== x.f.path));
    ok("!! a flight is deterministic; an unknown arm throws, naming the arms; a flight cut to 2 s ends 'timeout' with 2 / DT ticks", same(safe(() => T.flyTerrain(pilot, 3, "any+3d")), r) && (() => { try { T.flyTerrain(pilot, 3, "any+nothing"); return false; } catch (e) { return /any, any\+floor, any\+3d/.test(e.message); } })() && (() => { const c = T.flyTerrain(pilot, 3, "any", { seconds: 2 }); return c.status === "timeout" && c.ticks === Math.round(2 / S.DT); })());
    const gold = T.TERRAIN_ARMS.map((arm) => { const rs = T.SETS.dev.map((sd) => T.flyTerrain(pilot, sd, arm)); return [rs.map((x) => x.status[0]).join(""), Math.round(rs.reduce((a, x) => a + x.path, 0)), rs.reduce((a, x) => a + x.dives, 0), rs.reduce((a, x) => a + x.passable, 0)]; });
    ok("!! GOLDEN (a regression snapshot of this module's own flights on DEV, not a hand derivation; a change detector): per arm the thirty statuses, the summed path (m), the summed dive ticks and the passable bergs", same(gold, [["rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr", 11738, 0, 89], ["rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr", 11738, 0, 89], ["rrrrrrrrrrrrrrrrrrrrrrrrrrrrrr", 11748, 25731, 89]]), JSON.stringify(gold));
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
