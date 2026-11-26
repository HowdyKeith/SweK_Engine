// WebGLEngine/brain/subReconcileNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subReconcileNav-selfcheck.mjs      (about 20 s: arithmetic, the conversions, the bins and a handful of real flights)
//
// THE MODULE OF THE TWO MISSION SERIES, RECONCILED (brain/subReconcileNav.mjs), held to its word before any seed of PART B is flown ("FOLLOW-UP 13" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS     the arms, the four chord bins, 30 a bin from 60 seeds, 20,000 draws, the four first seeds, the outcome vocabulary
//   2  THE OUTCOMES      the two flyers' statuses in one vocabulary (complete = completed, flat = energy-out), the vessel's own statuses unchanged
//   3  THE CHORDS        the chord sum and the cruise break-even chord (927 m for 2,675 J/m, 3 MJ and a path of 1.21 times the chord)
//   4  THE CONVERSIONS   a mission of main's shape to series B's and back: the waypoints, the seed, the chord, series B's minimum-depth rule, no shared arrays, and the round trip
//   5  THE BINS          the seeds of a bin, the first 30 that place a mission, the skipped seeds, SHORT when a bin cannot fill, the chord inside the window
//   6  THE FLIGHTS       the shared record, each flyer on its own mission equal to the module it calls, each cross-flight equal to the other series' flyer on the converted mission, determinism, an unknown arm throws
//
// SABOTAGE LOG (serial mutation pass of brain/subReconcileNav.mjs, one mutant per code line and operator, at most four of each operator on a line): 29 mutants; 28 red on the first pass and 1 survivor:
//   `draws: 0` -> `draws: 1` in toBMission (a converted mission has no draws, series B's generator did not place it). A row was added (`b.draws === 0`, in the conversion row) and the mutant run again: red. 0 left.
//   NOT CHECKED, said plainly: that the two flyers agree on EVERY mission (that is the study's test, T1 and T2, and its drift check); the module only holds that the conversions hand each flyer the mission the other series flew.
"use strict";
import * as R from "./subReconcileNav.mjs";
import * as SB from "./subMissionNav.mjs";
import * as MN from "./navMission.mjs";
import * as H from "./subHardNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log("subReconcileNav-selfcheck -- the two mission series, reconciled\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the arms are the reference and the 2.5 m/s arm, both of series B's table and the reference of main's too", R.REFERENCE === "any+predict+edge+yield" && R.SLOW === "any+predict+edge+yield@2.5" && SB.MISSION_ARMS.includes(R.REFERENCE) && SB.MISSION_ARMS.includes(R.SLOW) && MN.ARM_NAMES.includes(R.REFERENCE) && R.KIND === "hard-traffic");
    ok("!! the four chord bins are [600, 750), [750, 900), [900, 1050), [1050, 1200), frozen", same(R.BINS, [[600, 750], [750, 900], [900, 1050], [1050, 1200]]) && Object.isFrozen(R.BINS) && R.BINS.every((b) => Object.isFrozen(b)));
    ok("!! 30 a bin from 60 seeds (AMENDMENT 1), 20,000 draws, the first seeds 13001, 13101, 13201, 13301 -- 100 apart, so a bin's 60 never reach the next", R.PER_BIN === 30 && R.TRIES === 60 && R.DRAWS === 20000 && same(R.BIN_FIRST, [13001, 13101, 13201, 13301]) && R.TRIES < 100);
    ok("!! the outcome vocabulary is completed, energy-out, collided, left, timeout, frozen", same(R.OUTCOMES, ["completed", "energy-out", "collided", "left", "timeout"]) && Object.isFrozen(R.OUTCOMES));
    ok("!! no bin's seeds are a seed series B or main already read (HELD10 1001 to 1060, HELD83 7941 to 8000)", R.BIN_FIRST.every((f) => f > 13000) && !SB.HELD10.some((s) => s >= 13001) && !MN.HELD83.some((s) => s >= 13001));
}

console.log("\n2. THE OUTCOMES");
{
    const t = [["complete", "completed"], ["completed", "completed"], ["energy-out", "energy-out"], ["flat", "energy-out"], ["collided", "collided"], ["left", "left"], ["timeout", "timeout"]];
    ok("!! each flyer's status names an outcome of the shared vocabulary: B's complete and energy-out, main's completed and flat", t.every(([s, o]) => R.outcomeOf(s) === o), t.map(([s, o]) => `${s}->${R.outcomeOf(s)}`).join(" "));
    ok("!! a status of the vessel's own passes through unchanged (and is not an OUTCOME)", R.outcomeOf("sunk") === "sunk" && !R.OUTCOMES.includes(R.outcomeOf("sunk")) && R.outcomeOf("") === "" && R.outcomeOf(undefined) === "undefined");
    ok("!! every outcome the flyers can end a mission in maps into OUTCOMES", [...new Set(t.map(([s]) => R.outcomeOf(s)))].every((o) => R.OUTCOMES.includes(o)));
}

console.log("\n3. THE CHORDS");
{
    const start = { x: 0, y: 0 }, pts = [{ x: 3, y: 4 }, { x: 3, y: 10 }, { x: 11, y: 10 }];
    ok("!! the chord sum is start to the first point, then each to the next: 5 + 6 + 8 = 19", near(R.chordOf(start, pts), 19) && near(R.chordOf(start, []), 0) && near(R.chordOf(start, [{ x: 3, y: 4 }]), 5));
    ok("!! the break-even chord is the battery over the joules a metre over the path ratio: 3,000,000 / 2,675 / 1.21 = 926.8 m", near(R.breakEvenChord(2675, 1.21, 3e6), 3e6 / 2675 / 1.21, 1e-9) && Math.abs(R.breakEvenChord(2675, 1.21, 3e6) - 926.8) < 0.1);
    ok("!! a dearer metre or a longer path shortens it, a bigger battery lengthens it", R.breakEvenChord(2765, 1.21, 3e6) < R.breakEvenChord(2675, 1.21, 3e6) && R.breakEvenChord(2675, 1.3, 3e6) < R.breakEvenChord(2675, 1.21, 3e6) && R.breakEvenChord(2675, 1.21, 4e6) > R.breakEvenChord(2675, 1.21, 3e6));
}

console.log("\n4. THE CONVERSIONS");
const mm = MN.missionOf(7941), bb = SB.missionFor(1001);
{
    const b = R.toBMission(mm), sc = mm.sc, chords = mm.waypoints.map((p, i) => Math.hypot(p.x - (i ? mm.waypoints[i - 1] : sc.start).x, p.y - (i ? mm.waypoints[i - 1] : sc.start).y));
    ok("!! main's mission becomes series B's: the seed, the three waypoints (x, y, depth), no draws (series B's generator did not place it) and not dropped", b.seed === 7941 && b.points.length === 3 && b.points.every((p, i) => p.x === mm.waypoints[i].x && p.y === mm.waypoints[i].y && p.depth === mm.waypoints[i].depth && Object.keys(p).sort().join() === "depth,x,y") && b.dropped === false && b.draws === 0);
    ok("!! its chords are start to waypoint 1, 1 to 2, 2 to 3, and its chord is their sum", b.chords.every((c, i) => near(c, chords[i])) && near(b.chord, chords[0] + chords[1] + chords[2]) && near(b.chord, R.chordOf(sc.start, mm.waypoints)));
    ok("!! series B's minimum-depth rule: the shallowest of the start and every waypoint, on a copy of the scenario (the original keeps its own)", b.scenario.minDepth === Math.min(sc.start.depth, ...mm.waypoints.map((p) => p.depth)) && b.scenario !== sc && sc.minDepth !== undefined && b.scenario.start === sc.start && Object.isFrozen(b.scenario));
    const pts0 = mm.waypoints.map((p) => ({ ...p }));
    ok("!! the points are copies: converting does not alias or change main's waypoints", b.points[0] !== mm.waypoints[0] && same(mm.waypoints.map((p) => ({ ...p })), pts0) && Object.isFrozen(b.points[0]));
    const m2 = R.toMainMission(bb);
    ok("!! series B's mission becomes main's: the seed, the scenario as hardScenario draws it and the points as the waypoints, frozen", m2.seed === 1001 && same(m2.sc, H.hardScenario(1001, "hard-traffic")) && m2.waypoints.length === 3 && m2.waypoints.every((p, i) => p.x === bb.points[i].x && p.y === bb.points[i].y && p.depth === bb.points[i].depth) && Object.isFrozen(m2) && Object.isFrozen(m2.waypoints[0]));
    ok("!! main's scenario here is hardScenario's own minDepth, not series B's edited one (main sets the minimum leg by leg)", m2.sc.minDepth === H.hardScenario(1001, "hard-traffic").minDepth && bb.scenario.minDepth === Math.min(bb.scenario.start.depth, ...bb.points.map((p) => p.depth)));
    const rt = R.toMainMission(R.toBMission(mm)), rt2 = R.toBMission(R.toMainMission(bb));
    ok("!! the round trip keeps the seed, the waypoints and (for B's) the chord: main -> B -> main and B -> main -> B", rt.seed === mm.seed && same(rt.waypoints, mm.waypoints.map((p) => ({ x: p.x, y: p.y, depth: p.depth }))) && rt2.seed === bb.seed && same(rt2.points, bb.points) && near(rt2.chord, bb.chord, 1e-6));
    ok("!! the chord of series B's own mission, rebuilt from its points, is the chord it carries", near(R.chordOf(bb.scenario.start, bb.points), bb.chord, 1e-9));
}

console.log("\n5. THE BINS");
{
    ok("!! a bin's seeds are 60 consecutive from its first", same(R.binSeeds(0), Array.from({ length: 60 }, (_, i) => 13001 + i)) && R.binSeeds(3)[0] === 13301 && R.binSeeds(3).length === 60 && R.binSeeds(1)[59] === 13160);
    const b0 = R.binMissions(0), b3 = R.binMissions(3);
    ok("!! bin 1 places 30 missions, the first 30 seeds in order, none skipped, each chord inside [600, 750)", b0.placed.length === 30 && b0.skipped.length === 0 && b0.short === false && b0.placed.every((m, i) => m.seed === 13001 + i && m.chord >= 600 && m.chord <= 750 && !m.dropped) && same(b0.window, [600, 750]) && b0.bin === 0);
    ok("!! bin 4 skips the seeds that cannot place a mission, fills at 30 and reports the skipped ones in order (the measured 18 of the first 48)", b3.placed.length === 30 && b3.short === false && b3.skipped.length > 0 && b3.skipped.every((s, i, a) => i === 0 || s > a[i - 1]) && b3.placed.every((m) => m.chord >= 1050 && m.chord <= 1200) && b3.placed.length + b3.skipped.length === b3.placed[29].seed - 13301 + 1, `${b3.skipped.length} skipped`);
    const tiny = R.binMissions(3, { draws: 1 });
    ok("!! a bin that cannot fill is reported SHORT, with every seed it tried either placed or skipped (the override reaches the dropped branch)", tiny.short === true && tiny.placed.length < 30 && tiny.placed.length + tiny.skipped.length === R.TRIES, `placed ${tiny.placed.length} skipped ${tiny.skipped.length}`);
    ok("!! a bin is the same twice (no clock, no Math.random)", same(R.binMissions(2).placed.map((m) => m.seed), R.binMissions(2).placed.map((m) => m.seed)) && R.binMissions(2).placed[0].chord === R.binMissions(2).placed[0].chord);
    ok("!! the four bins' missions are four disjoint seed ranges", new Set([0, 1, 2, 3].flatMap((k) => R.binMissions(k).placed.map((m) => m.seed))).size === 120);
}

console.log("\n6. THE FLIGHTS");
{
    const t0 = Date.now(), SHARED = "arm,chord,energy,flyer,legs,outcome,path,seed,status,t,ticks";
    const own = R.flyMain(mm), ownB = R.flyB(bb), a1 = R.flyBOnMain(mm), a2 = R.flyMainOnB(bb);
    ok("!! a flight is recorded in one shape: flyer, seed, arm, outcome, status, legs, path, energy, chord, t, ticks", [own, ownB, a1, a2].every((r) => Object.keys(r).sort().join() === SHARED) && own.flyer === "main" && ownB.flyer === "b" && a1.flyer === "b" && a2.flyer === "main" && own.arm === R.REFERENCE);
    const m1 = MN.flyMission(mm, R.REFERENCE), b1 = SB.flyMission(R.pilot, bb, R.REFERENCE);
    ok("!! main's flyer on main's mission is navMission.flyMission itself, its energy in joules and its outcome renamed", own.status === m1.status && own.outcome === R.outcomeOf(m1.status) && own.ticks === m1.ticks && own.path === m1.path && own.energy === m1.energy && near(own.chord, R.toBMission(mm).chord));
    ok("!! series B's flyer on B's mission is subMissionNav.flyMission itself, its energy the joules it used", ownB.status === b1.status && ownB.outcome === R.outcomeOf(b1.status) && ownB.ticks === b1.ticks && ownB.path === b1.path && ownB.energy === b1.energyUsed && near(ownB.chord, bb.chord));
    const x1 = SB.flyMission(R.pilot, R.toBMission(mm), R.REFERENCE), x2 = MN.flyMission(R.toMainMission(bb), R.REFERENCE);
    ok("!! the cross-flights are the other series' flyer on the converted mission: B's on main's, main's on B's", a1.ticks === x1.ticks && a1.path === x1.path && a1.energy === x1.energyUsed && a1.status === x1.status && a2.ticks === x2.ticks && a2.path === x2.path && a2.energy === x2.energy && a2.status === x2.status);
    ok("OBSERVATION on two missions (the study's T1 and T2 test the rest): the two flyers fly main's mission 7941 and B's mission 1001 tick for tick alike -- the same ticks, path and joules both ways", a1.ticks === own.ticks && a1.path === own.path && a1.energy === own.energy && a2.ticks === ownB.ticks && a2.path === ownB.path && a2.energy === ownB.energy, `7941: ${own.outcome} ${own.ticks} ticks; 1001: ${ownB.outcome} ${ownB.ticks} ticks`);
    ok("!! the arm is carried: a flight of the 2.5 m/s arm is recorded under it", R.flyB(bb, R.SLOW).arm === R.SLOW && R.flyBOnMain(mm, R.SLOW).arm === R.SLOW);
    ok("!! a flight twice is the same flight (no clock, no Math.random)", same(R.flyBOnMain(mm), a1) && same(R.flyMainOnB(bb), a2));
    const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! an unknown arm throws, naming it, on each flyer and on each cross-flight", [() => R.flyB(bb, "nope"), () => R.flyMain(mm, "nope"), () => R.flyBOnMain(mm, "nope"), () => R.flyMainOnB(bb, "nope")].every((f) => /"nope"/.test(msg(f))));
    ok("a battery-spent mission is energy-out and not completed, the 7941 flight spends the whole 3 MJ at cruise", own.outcome === "energy-out" && near(own.energy, 3e6, 1e3) && own.legs === 2, `${own.energy} J, ${own.legs} legs`);
    console.log(`  ----  flights took ${Date.now() - t0} ms`);
}

console.log(`\nsubReconcileNav-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
