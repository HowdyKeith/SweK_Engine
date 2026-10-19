// WebGLEngine/brain/missionTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/missionTask-selfcheck.mjs      (~4 s)
//
// THE SUBMARINE'S MISSIONS HELD TO THEIR OWN WORDS. brain/missionTask.mjs asks a pilot to follow a rolling seabed from two noisy sensors, or to visit three waypoints; this gate holds the task, not the pilots:
//   1  DETERMINISM  a kind and a seed make the same scenario (frozen); a bad kind is refused by name; a mission dive is deterministic
//   2  THE SEABED   seabedAt() is its closed form (a hand terrain: 49 m under a quarter-wave, periodic in its wavelength); every scenario's floor lies 35..55 m down and its steepest slope is under the 0.45 bound maxSlope()
//                   states (checked by sampling, not by trusting the bound); the vessel starts 10 m above the floor under it
//   3  THE SENSORS  noise() is deterministic, ~zero mean and unit sd (4,000 draws), different for different channels and ticks; the altimeter is the true gap from the hull's underside plus 0.15 m x noise, the
//                   sounder the floor's depth 20 m AHEAD ALONG THE HEADING plus 0.3 m x noise (a vessel heading right looks to its right)
//   4  THE GUIDANCE terrainTarget() is 10 m above the SHALLOWER of the floor under the hull and the floor ahead, clamped to 12..60 m, with the heading and speed held; waypointTarget() points the heading at the waypoint
//                   (a waypoint to the RIGHT is a positive heading, one dead ahead is 0) and asks its depth; reached() is exactly 10 m horizontally AND 4 m in depth
//   5  THE SCORE    recomputed here tick by tick for a terrain dive and for a waypoint dive, to 1e-9; a dive that ENDS is charged the worst tick, 3, for every tick not flown -- a pilot that floods the tank GROUNDS on the
//                   terrain (not on a flat floor) and is charged; waypoints are reached in order and the count is right
//   6  THE SETS     TRAIN / HELD_OUT / BASELINE are disjoint, 32 / 32 / 24 scenarios; the AUTOPILOT's score on each is pinned
//
// SABOTAGE LOG -- TWENTY, each applied to brain/missionTask.mjs in place, the gate run, the file restored; every one red by name (the number is how many rows went red):
//   M1 seabed phase dropped 2 | M2 cross-track term uses x 3 | M3 altimeter noise doubled 1 | M4 the sounder looks along +y 1 | M5 sounder range 10 3 | M6 guidance uses the deeper floor 2 | M7 depth clamp removed 1
//   M8 bearing sign 2 | M9 reach 12 m 2 | M10 reach ignores depth 2 | M11 grounding ignores the terrain 1 | M12 an early end not charged 1 | M13 the waypoint index never advances 2 | M14 terrain error cap 1 not 3 1
//   M15 the current ignored 3 | M16 the actuator option ignored 1 | M17 the vessel does not start on the floor 3 | M18 TRAIN and HELD_OUT overlap 2 | M19 the noise ignores the seed 2 | M20 a terrain too steep 3
"use strict";
import * as M from "./missionTask.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as A from "./autopilotSub.mjs";
import * as ST from "./subTask.mjs";
import { ACTUATORS, INSTANT } from "../physics/mechanics/subActuators.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const model = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })), R = model.spec.radius;

console.log("missionTask-selfcheck -- the submarine's missions\n");

console.log("1. DETERMINISM");
{
    const a = M.scenario(7, "terrain-current"), b = M.scenario(7, "terrain-current"), c = M.scenario(8, "terrain-current"), w = M.scenario(7, "waypoint");
    ok("!! a kind and a seed make the same scenario; another seed or kind makes another; frozen all the way down (terrain, waypoints, current)", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c) && Object.isFrozen(a) && Object.isFrozen(a.terrain) && Object.isFrozen(a.current) && Object.isFrozen(w.waypoints) && Object.isFrozen(w.waypoints[0]));
    let msg = null; try { M.scenario(1, "obstacles"); } catch (e) { msg = e.message; }
    ok("a kind that is not terrain / terrain-current / waypoint / waypoint-current is refused, by name", msg && /obstacles/.test(msg) && /waypoint-current/.test(msg), msg);
    const f1 = M.fly(A.pilot(), M.scenario(2, "waypoint-current")), f2 = M.fly(A.pilot(), M.scenario(2, "waypoint-current"));
    ok("!! a mission dive is deterministic: the same score and fingerprint twice", f1.score === f2.score && f1.fingerprint === f2.fingerprint, f1.fingerprint);
    ok("a terrain scenario has a terrain and no waypoints, a waypoint scenario the reverse; the -current kinds have a current and a weight error within 0.6%, the others neither", a.terrain && !a.waypoints && w.waypoints.length === 3 && !w.terrain && a.current && Math.abs(a.weightError) <= 0.006 && M.scenario(7, "terrain").current === null && M.scenario(7, "terrain").weightError === 0);
}

console.log("\n2. THE SEABED");
{
    const t = { base: 45, a1: 4, l1: 100, p1: Math.PI / 2, a2: 0, l2: 60, p2: 0, b: 0, ly: 150, py: 0 };
    ok("!! seabedAt() is its closed form: a hand terrain is 49 m at x = 0 (a quarter-wave, sin = 1), 45 m at x = 25, 41 m at x = 50, and repeats every wavelength (x = 100 gives 49 to 1e-12); the cross-track term adds b sin(2 pi y / ly + py)", Math.abs(M.seabedAt(t, 0, 7) - 49) < 1e-12 && Math.abs(M.seabedAt(t, 25, 0) - 45) < 1e-12 && Math.abs(M.seabedAt(t, 50, 0) - 41) < 1e-12 && Math.abs(M.seabedAt(t, 100, 0) - 49) < 1e-12 && Math.abs(M.seabedAt({ ...t, a1: 0, b: 3, ly: 100, py: Math.PI / 2 }, 5, 0) - 48) < 1e-12);
    let lo = Infinity, hi = -Infinity, steep = 0, bound = 0, startOk = true;
    for (let s = 1; s <= 40; s++) {
        const sc = M.scenario(s, "terrain"), tt = sc.terrain; bound = Math.max(bound, M.maxSlope(tt));
        for (let x = -50; x <= 400; x += 1) { const d = M.seabedAt(tt, x, 0), d2 = M.seabedAt(tt, x + 1, 0); lo = Math.min(lo, d); hi = Math.max(hi, d); steep = Math.max(steep, Math.abs(d2 - d) / 1); }
        for (let y = -100; y <= 100; y += 10) { const d = M.seabedAt(tt, 100, y); lo = Math.min(lo, d); hi = Math.max(hi, d); }
        if (Math.abs(sc.start.depth + M.ALTITUDE - M.seabedAt(tt, 0, 0)) > 1e-9) startOk = false;
    }
    ok("!! over 40 scenarios the floor lies 35..55 m down (the pilot never starts near the crush depth), its sampled slope stays under the 0.45 bound maxSlope() gives, and that bound is a true upper bound (sampled <= bound)", lo >= 35 && hi <= 55 && bound < 0.45 && steep <= bound + 1e-3, `${lo.toFixed(1)}..${hi.toFixed(1)} m; slope ${steep.toFixed(3)} <= bound ${bound.toFixed(3)}`);
    ok("!! the vessel starts exactly ALTITUDE (10 m) above the floor under it", startOk && M.ALTITUDE === 10);
}

console.log("\n3. THE SENSORS");
{
    const N = 4000, d = Array.from({ length: N }, (_, i) => M.noise(5, i, 0)), mean = d.reduce((a, v) => a + v, 0) / N, sd = Math.sqrt(d.reduce((a, v) => a + (v - mean) ** 2, 0) / N);
    ok("!! noise() is deterministic, ~zero mean and unit sd over 4,000 draws (|mean| < 0.05, sd 0.95..1.05), and DIFFERENT for another channel, tick or seed", M.noise(5, 17, 0) === M.noise(5, 17, 0) && Math.abs(mean) < 0.05 && sd > 0.95 && sd < 1.05 && M.noise(5, 17, 0) !== M.noise(5, 17, 1) && M.noise(5, 17, 0) !== M.noise(5, 18, 0) && M.noise(5, 17, 0) !== M.noise(6, 17, 0), `mean ${mean.toFixed(4)} sd ${sd.toFixed(4)}`);
    const sc = M.scenario(3, "terrain"), st = S.createState({ ...sc.start, pos: [40, -15, -22], heading: 0, model }), z = M.sense(sc, st, 9, model);
    const trueGap = M.seabedAt(sc.terrain, 40, -15) - 22 - R;
    ok("!! the altimeter is the true gap from the hull's underside to the floor plus 0.15 m x noise(seed, tick, 0), to 1e-12", Math.abs(z.altimeter - (trueGap + M.ALT_NOISE * M.noise(3, 9, 0))) < 1e-12, `${z.altimeter.toFixed(4)}`);
    ok("!! the sounder is the floor's depth 20 m ahead along the heading plus 0.3 m x noise(seed, tick, 1): heading 0 looks along +x", Math.abs(z.sonar - (M.seabedAt(sc.terrain, 60, -15) + M.SONAR_NOISE * M.noise(3, 9, 1))) < 1e-12);
    const right = S.createState({ ...sc.start, pos: [40, -15, -22], heading: Math.PI / 2, model }), zr = M.sense(sc, right, 9, model);
    ok("!! a vessel heading RIGHT (heading +pi/2) looks to its right, which is world -y (the engine's heading: a right turn increases it, the vessel's left is +y)", Math.abs(zr.sonar - (M.seabedAt(sc.terrain, 40, -35) + M.SONAR_NOISE * M.noise(3, 9, 1))) < 1e-9);
}

console.log("\n4. THE GUIDANCE");
{
    const st = S.createState({ depth: 30, speed: 2.5, model }), tt = (alt, son) => M.terrainTarget(st, { altimeter: alt, sonar: son }, model);
    ok("!! terrainTarget is 10 m above the SHALLOWER of the floor under the hull (depth + R + altimeter) and the floor ahead: a floor 40 m under and 38 m ahead asks for 28 m; 38 under and 41 ahead, 28 m too", Math.abs(tt(40 - 30 - R, 38).depth - 28) < 1e-9 && Math.abs(tt(38 - 30 - R, 41).depth - 28) < 1e-9);
    ok("!! and is clamped to 12..60 m (a floor at 15 m asks for 12, not 5; a floor at 90 m asks for 60), with the heading held at 0 and the speed at the cruise", tt(15 - 30 - R, 15).depth === 12 && tt(90 - 30 - R, 90).depth === 60 && tt(10, 40).heading === 0 && tt(10, 40).speed === M.CRUISE);
    const here = S.createState({ pos: [0, 0, -20], heading: 0, speed: 2, model }), W = (x, y, depth) => M.waypointTarget(here, { x, y, depth });
    ok("!! waypointTarget points the heading at the waypoint: dead ahead (+x) is 0, to the RIGHT (world -y) is +pi/2, to the left (+y) is -pi/2, astern is +-pi; it asks the waypoint's depth at the cruise", Math.abs(W(50, 0, 25).heading) < 1e-12 && Math.abs(W(0, -50, 25).heading - Math.PI / 2) < 1e-12 && Math.abs(W(0, 50, 25).heading + Math.PI / 2) < 1e-12 && Math.abs(Math.abs(W(-50, 0, 25).heading) - Math.PI) < 1e-12 && W(50, 0, 25).depth === 25 && W(50, 0, 25).speed === M.CRUISE);
    const at = (dx, dy, dz) => M.reached(S.createState({ pos: [dx, dy, -(20 + dz)], model }), { x: 0, y: 0, depth: 20 });
    ok("!! reached() is exactly 10 m horizontally AND 4 m in depth: (10, 0, 4) is in, (10.001, 0, 0) is out, (0, 0, 4.001) is out, (6, 8, 0) is in (3-4-5)", at(10, 0, 4) && !at(10.001, 0, 0) && !at(0, 0, 4.001) && at(6, 8, 0));
}

console.log("\n5. THE SCORE");
{
    const total = (m) => Math.round(M.SECONDS[m] / M.DT);
    const recompute = (pilot, sc) => {
        let s = S.createState({ ...sc.start, model }), errSum = 0, idx = 0; const n = total(sc.mission);
        for (let i = 0; i < n; i++) {
            const tg = sc.mission === "terrain" ? M.terrainTarget(s, M.sense(sc, s, i, model), model) : M.waypointTarget(s, sc.waypoints[Math.min(idx, 2)]);
            const cv = ST.currentAt(sc.current, i * M.DT); s = S.stepSub(model, s, pilot(s, tg, cv), M.DT, cv, sc.weightError).state;
            const a = S.attitude(s, cv);
            if (sc.mission === "terrain") errSum += Math.min(3, Math.abs(M.seabedAt(sc.terrain, s.pos[0], s.pos[1]) - a.depth - R - 10) / 5);
            else { if (idx < 3 && M.reached(s, sc.waypoints[idx])) idx++; const w = idx < 3 ? sc.waypoints[idx] : null; errSum += w ? Math.min(3, Math.hypot(w.x - s.pos[0], w.y - s.pos[1], w.depth - a.depth) / 25) : 0; }
        }
        return { score: -errSum / n, idx };
    };
    const ts = M.scenario(4, "terrain-current"), tf = M.fly(A.pilot(), ts), tr = recompute(A.pilot(), ts);
    ok("!! a terrain dive's score is minus the mean of min(3, |altitude - 10| / 5), recomputed here tick by tick from the terrain and the vessel's own attitude(), to 1e-9", tf.status === "submerged" && Math.abs(tf.score - tr.score) < 1e-9, `${tf.score.toFixed(6)} vs ${tr.score.toFixed(6)}`);
    const ws = M.scenario(4, "waypoint-current"), wf = M.fly(A.pilot(), ws), wr = recompute(A.pilot(), ws);
    ok("!! a waypoint dive's score is minus the mean of min(3, distance to the active waypoint / 25 m), 0 once all three are reached, recomputed to 1e-9; the count of waypoints reached is the recomputation's", wf.status === "submerged" && Math.abs(wf.score - wr.score) < 1e-9 && wf.reachedCount === wr.idx, `${wf.score.toFixed(6)} vs ${wr.score.toFixed(6)}; reached ${wf.reachedCount}`);
    const sink = M.fly(() => ({ ballast: 1, thrust: 0 }), M.scenario(2, "terrain")), nS = total("terrain");
    ok("!! a pilot that floods the tank GROUNDS on the terrain (the hull meets the floor under it, not a flat plane) and is charged the worst tick (3) for every tick not flown: its score is at most that charge", sink.status === "grounded" && sink.ticks < nS && sink.score <= -(M.WORST_TICK * (nS - sink.ticks)) / nS + 1e-12 && M.WORST_TICK === 3, `${sink.status} after ${sink.ticks}: ${sink.score.toFixed(3)}`);
    const idle = M.fly(() => ({}), M.scenario(2, "waypoint"));
    ok("a pilot that does nothing reaches no waypoint, is charged the distance every tick, and does not end the dive", idle.reachedCount === 0 && idle.status === "submerged" && idle.score < -0.5);
    const a = M.fly(A.pilot(), ws), b = M.fly(A.pilot(), ws, { actuators: INSTANT }), c = M.fly(A.pilot(), ws, { actuators: ACTUATORS });
    ok("!! the actuator option: INSTANT rates are bit-for-bit the dive with none; the real rates change the dive", a.score === b.score && a.fingerprint === b.fingerprint && a.fingerprint !== c.fingerprint);
}

console.log("\n6. THE SETS");
{
    const keys = (x) => x.map((s) => `${s.kind}:${s.seed}`), sets = { TRAIN_SET: M.TRAIN_SET, HELD_OUT_SET: M.HELD_OUT_SET, BASELINE_SET: M.BASELINE_SET }, names = Object.keys(sets);
    let overlap = 0; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const b = new Set(keys(sets[names[j]])); overlap += keys(sets[names[i]]).filter((k) => b.has(k)).length; }
    ok("!! the three sets are disjoint by kind and seed, 32 / 32 / 24 scenarios (8, 8 and 6 seeds of each of the four kinds), each frozen", overlap === 0 && M.TRAIN_SET.length === 32 && M.HELD_OUT_SET.length === 32 && M.BASELINE_SET.length === 24 && names.every((n) => Object.isFrozen(sets[n])));
    const ev = (s) => M.evaluate(A.pilot(), s), tr = ev(M.TRAIN_SET), ho = ev(M.HELD_OUT_SET), bl = ev(M.BASELINE_SET), pin = (r, v) => Math.abs(r.score - v) <= 5e-4 && r.crashed === 0;
    ok("!! the AUTOPILOT's score is PINNED on TRAIN, HELD_OUT and BASELINE (and it ends none of the 88 dives early)", pin(tr, -0.7502) && pin(ho, -0.7276) && pin(bl, -0.7520), `${tr.score.toFixed(4)} ${ho.score.toFixed(4)} ${bl.score.toFixed(4)}`);
    ok("describeEval quotes the four kinds and the early-end count", /terrain/.test(M.describeEval(tr)) && /waypoint-current/.test(M.describeEval(tr)) && /0 ended early/.test(M.describeEval(tr)));
}

console.log("\n12. THE NAMED PIECES (KINDS, REACH, SONAR_RANGE)");
{
    const model = S.createSubModel(), wp = { x: 100, y: 50, depth: 30 }, at = (dx, dy, dz) => S.createState({ pos: [wp.x + dx, wp.y + dy, -(wp.depth + dz)], depth: wp.depth + dz, model });
    ok("!! KINDS is the four missions, frozen, and each builds a scenario whose own kind it reports", Object.isFrozen(M.KINDS) && M.KINDS.join() === "terrain,terrain-current,waypoint,waypoint-current" && M.KINDS.every((k) => M.scenario(3, k).kind === k));
    ok("!! a waypoint is REACHED within 10 m on the plane and 4 m in depth, no further: 9.9 m and 3.9 m are in, 10.1 m and 4.1 m are out (REACH is the frozen pair 10 / 4, pinned as literals)", M.REACH.horizontal === 10 && M.REACH.depth === 4 && Object.isFrozen(M.REACH) && M.reached(at(9.9, 0, 0), wp) && M.reached(at(0, 0, 3.9), wp) && !M.reached(at(10.1, 0, 0), wp) && !M.reached(at(0, 0, 4.1), wp));
    const sc = M.scenario(5, "terrain"), st = S.createState({ pos: [40, 30, -25], depth: 25, heading: 0.3, model }), r = M.sense(sc, st, 0, model), a = S.attitude(st), ahead = M.seabedAt(sc.terrain, 40 + M.SONAR_RANGE * Math.cos(a.heading), 30 - M.SONAR_RANGE * Math.sin(a.heading));
    ok("!! the forward sounder reads the seabed SONAR_RANGE = 20 m ahead along the heading, to within its noise (not the floor under the hull)", M.SONAR_RANGE === 20 && Math.abs(r.sonar - ahead) <= 3 * M.SONAR_NOISE);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
