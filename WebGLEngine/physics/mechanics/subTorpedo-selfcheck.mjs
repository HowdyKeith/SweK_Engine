// WebGLEngine/physics/mechanics/subTorpedo-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/subTorpedo-selfcheck.mjs      (~0.2 s)
//
// THE TORPEDO HELD TO ITS CLOSED FORMS. physics/mechanics/subTorpedo.mjs is a point body with a cone seeker, a homing law, an arming distance and a proximity fuse; this gate holds each to the number a pencil gives:
//   1  THE DAMAGE   100 inside 3 m, 40 at 8 m, linear between (70 at 5.5 m), none beyond 8 m, and none for a NaN
//   2  THE RUN      a launch puts the torpedo 6 m ahead along the nose (pitch included); the speed ramps 2 -> 6.5 m/s at 1.5 m/s^2 and the run is the sum the ramp gives (restated here, to 1e-9) and 58 m after 10 s; it
//                   expires at 90 s with the run its ramp makes (578.25 m); above 3 m depth or below the floor it is lost; a dumb torpedo goes straight
//   3  THE TURNS    a heading change never exceeds 0.25 rad/s, a pitch change 0.15 rad/s, pitch stays within 0.6 rad; a target on the RIGHT turns it right, on the LEFT left, ABOVE up, BELOW down
//   4  THE SEEKER   the 35-degree cone (30 degrees in, 40 out); the budget (seekerRange satisfies seekerSNR = 8 dB; 66 < 259 < 563 m for 0.5 / 2 / 4.5 m/s); hearing is a probability around the range (3 dB of luck): loud at 100 m always, creeping at 100 m rarely; the LOUDEST
//                   target in the cone is the one followed; the owner is never a target; a lock is lost after 3 s of nothing and the torpedo runs on straight
//   4b the HOMING LAW is filtered: the line-of-sight rate is low-passed, so a target 20 m above and 150 m ahead pitches the torpedo UP and the command stays within the turn limit's order of magnitude (the first draft differenced two noisy angles and commanded +-2.8 rad/s)
//   5  THE WARHEAD  not armed until 40 m of run (a target at 30 m is passed THROUGH, within 1 m, untouched; one at 80 m is hit); the fuse fires at the CLOSEST APPROACH (a pass 5 m off scores damageAt(5) = 76, the tick after the closest
//                   tick), on contact within 1 m, never beyond 8 m; one event only
//   6  THE STATE    an ended torpedo is returned unchanged (the same object); a step edits nothing it is handed; the output is frozen; deterministic
//   7  THE FRONT DOOR the export list is pinned; the report says real numbers
//
// SABOTAGE LOG -- THIRTY-FIVE, each applied to physics/mechanics/subTorpedo.mjs in place, the gate run, the file restored; every one red by name EXCEPT ONE (the number is how many rows went red):
//   Q1 edge damage 60 3 | Q2 full-damage radius 5 2 | Q3 the muzzle ignores pitch 1 | Q4 launch speed 3 4 | Q5 no speed ramp 2 | Q6 cruise 7 2 | Q7 endurance 60 1 | Q8 the minimum depth ignored 1 | Q9 the floor ignored 1
//   Q10 turn limit 0.5 2 | Q11 pitch-rate limit 0.3 2 | Q12 the pitch clamp removed 1 | Q13 homing turns AWAY 3 | Q14 pitch homing sign 2 | Q15 cone 50 degrees 1 | Q16 the cone ignored 1 | Q17 seeker own noise 60 3
//   Q18 seeker gain 10 4 | Q19 follows the quietest 2 | Q20 the owner is a target 1 | Q21 a lock is never lost 1 | Q22 lock lost after one look 1 | Q23 arming at 10 m 1 | Q24 always armed 1 | Q25 fuse on shell entry 4
//   Q26 no contact radius 1 | Q27 lethal radius 12 3 | Q29 an ended torpedo is stepped again 2 | Q30 not frozen 1 | Q31 look interval 12 1 | Q32 the LOS rate unfiltered 1 | Q33 look interval 3 1 | Q34 lock lost after 2 looks 1
//   Q35 the fuse's memory not reset on a new target 1
//   Q28 (the damage scored at the distance AFTER the closest tick instead of AT it) went 0 red and IS NOT CATCHABLE: the two distances differ by 0.0006 m (5.00056 against 5.00000 on the 5 m pass), a tenth of a damage point
//       below every threshold a gate can honestly set -- an EQUIVALENT MUTANT, left standing and said.
// Q10 and Q11 went 0 red the first time: the gate read the turn limits FROM THE MODULE IT GUARDS (T.turnRate), so the sabotage moved the limit and the check together; they are pinned as 0.25 and 0.15 in the gate now.
// Q19 went 0 red: the quiet boat in the 'loudest wins' row was too quiet to be heard at all, so there was nothing to choose between (it is now nearer and heard). Q31 and Q26 went 0 red until the rows that pin the look
// interval (a lock at tick 0 and tick 6, lost at tick 78) and the contact radius (an event distance between 0.55 and 1.0 m) existed. Q25's and Q12's first runs crashed or were mis-patterned; the editor now says so.
"use strict";
import * as Tp from "./subTorpedo.mjs";
import * as K from "./subSonar.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const T = Tp.TORPEDO, DT = 1 / 30, DEG = Math.PI / 180, fwd = (h, p = 0) => [Math.cos(h) * Math.cos(p), -Math.sin(h) * Math.cos(p), Math.sin(p)];
const tgt = (id, x, y, z, speed = 2, heading = 0) => ({ id, pos: [x, y, z], heading, speed });
const fresh = (h = 0, p = 0, z = -30) => Tp.launch(1, { pos: [0, 0, z], heading: h, pitch: p });
const run = (t, targets, n, o = {}) => { let ev = null, i = 0; for (; i < n; i++) { const r = Tp.stepTorpedo(t, typeof targets === "function" ? targets(i, t) : targets, { dt: DT, tick: i, seed: 5, ...o }); t = r.torpedo; if (r.event) { ev = r.event; break; } if (t.status !== "running") break; } return { t, ev, i }; };

console.log("subTorpedo-selfcheck -- the torpedo\n");

console.log("1. THE DAMAGE");
{
    const d = Tp.damageAt;
    ok("!! damageAt: 100 inside 3 m (and at 0), 40 at exactly 8 m, linear between (70 at 5.5 m, 76 at 5 m), nothing beyond 8 m, nothing for NaN or undefined", d(0) === 100 && d(3) === 100 && Math.abs(d(8) - 40) < 1e-12 && Math.abs(d(5.5) - 70) < 1e-12 && Math.abs(d(5) - 76) < 1e-12 && d(8.0001) === 0 && d(50) === 0 && d(NaN) === 0 && d(undefined) === 0, `${d(5)}`);
}

console.log("\n2. THE RUN");
{
    const L = Tp.launch(7, { pos: [10, 20, -40], heading: Math.PI / 2, pitch: 0.3 }, { muzzle: 6, id: 3 }), f = fwd(Math.PI / 2, 0.3);
    ok("!! a launch puts the torpedo 6 m ahead along the launcher's nose, pitch included, at 2 m/s, unarmed, unlocked, owned, 'running'", L.pos.every((v, i) => Math.abs(v - [10, 20, -40][i] - 6 * f[i]) < 1e-12) && L.speed === 2 && !L.armed && !L.locked && L.owner === 7 && L.id === 3 && L.status === "running" && L.heading === Math.PI / 2 && L.pitch === 0.3);
    let t = fresh(), v = T.launchSpeed, x = 6; const o = run(t, [], 300, { seeker: false });
    for (let i = 0; i < 300; i++) { v = Math.min(T.cruise, v + T.accel * DT); x += v * DT; }
    ok("!! the run is the speed ramp's sum, restated here step by step (v = min(6.5, v + 1.5 dt), x += v dt) to 1e-9, and about 58 m beyond the muzzle after 10 s (12.75 m in the 3 s ramp, 6.5 m/s after)", Math.abs(o.t.pos[0] - x) < 1e-9 && Math.abs(o.t.pos[1]) < 1e-12 && Math.abs(o.t.speed - 6.5) < 1e-12 && Math.abs(o.t.pos[0] - 6 - 58.25) < 0.2, `${(o.t.pos[0] - 6).toFixed(3)} m`);
    const e = run(fresh(), [], 4000, { seeker: false });
    let v2 = T.launchSpeed, run2 = 0; for (let i = 0; i <= e.i; i++) { v2 = Math.min(T.cruise, v2 + T.accel * DT); run2 += v2 * DT; }
    ok("!! it expires at 90 s (within a tick of 2700: the age is a float sum) with exactly the run the ramp's step sum makes (restated here, 1e-9), and that is within 0.6 m of the closed form 6.5 x 90 - 6.75 = 578.25 m", e.t.status === "expired" && e.i >= 2698 && e.i <= 2701 && Math.abs(e.t.run - run2) < 1e-9 && Math.abs(e.t.run - 578.25) < 0.6 && Math.abs(e.t.age - 90) < 0.05, `${e.t.status} after ${e.i + 1} steps, run ${e.t.run.toFixed(3)}`);
    ok("!! above 3 m depth it is LOST on the first tick (launched at 2 m), below the floor it is lost, and a torpedo lost stays lost", run(fresh(0, 0, -2), [], 5, { seeker: false }).t.status === "lost" && run(fresh(0, 0, -50), [], 5, { seeker: false, floor: 40 }).t.status === "lost" && run(fresh(0, 0, -30), [], 5, { seeker: false }).t.status === "running");
    const dumb = run(fresh(0.7, 0.2), [tgt(2, 100, 0, -30)], 200, { seeker: false });
    ok("!! a dumb torpedo (seeker off) goes straight: heading and pitch unchanged after 200 ticks beside a target it cannot hear", dumb.t.heading === 0.7 && dumb.t.pitch === 0.2 && !dumb.t.locked);
}

console.log("\n3. THE TURNS");
{
    const chase = (target, n = 90, z0 = -30) => { let t = fresh(0, 0, z0), maxH = 0, maxP = 0; for (let i = 0; i < n; i++) { const r = Tp.stepTorpedo(t, [target], { tick: i, seed: 5 }), nt = r.torpedo; maxH = Math.max(maxH, Math.abs(Math.atan2(Math.sin(nt.heading - t.heading), Math.cos(nt.heading - t.heading)))); maxP = Math.max(maxP, Math.abs(nt.pitch - t.pitch)); t = nt; if (t.status !== "running") break; } return { t, maxH, maxP }; };
    const R = chase(tgt(2, 150 * Math.cos(30 * DEG), -150 * Math.sin(30 * DEG), -30, 2, 0)), Lf = chase(tgt(2, 150 * Math.cos(30 * DEG), 150 * Math.sin(30 * DEG), -30, 2, 0)), U = chase(tgt(2, 150, 0, -60 + 30, 4.5, 0), 90, -60), D = chase(tgt(2, 150, 0, -60 - 30, 4.5, 0), 90, -60);
    ok("!! a target on the RIGHT turns it right (heading up), on the LEFT left (heading down), ABOVE it pitches up, BELOW it pitches down (a LOUD 4.5 m/s target 30 m off at 150 m: for a quiet 2 m/s one the elevation signal at that range is under the elevation noise and the pitch is noise-driven -- a limit of the sonar, said here) -- the engine's heading: a right turn increases it", R.t.heading > 0.05 && Lf.t.heading < -0.05 && U.t.pitch > 0.03 && D.t.pitch < -0.03, `R ${R.t.heading.toFixed(3)} L ${Lf.t.heading.toFixed(3)} U ${U.t.pitch.toFixed(3)} D ${D.t.pitch.toFixed(3)}`);
    ok("!! a heading never changes by more than 0.25 rad/s x dt in a tick and a pitch never by more than 0.15 rad/s x dt (to 1e-12; the limits are PINNED here as 0.25 and 0.15, not read from the module they guard), across all four chases", Math.max(R.maxH, Lf.maxH, U.maxH, D.maxH) <= 0.25 * DT + 1e-12 && Math.max(R.maxP, Lf.maxP, U.maxP, D.maxP) <= 0.15 * DT + 1e-12 && Math.max(R.maxH, Lf.maxH) > 0.9 * 0.25 * DT && Math.max(U.maxP, D.maxP) > 0.5 * 0.15 * DT && T.turnRate === 0.25 && T.pitchRate === 0.15, `${(Math.max(R.maxH, Lf.maxH) / DT).toFixed(4)} rad/s`);
    let sp = Tp.launch(1, { pos: [0, 0, -90], heading: 0, pitch: 0.59 }), top = 0;   // launched nose-up at 0.59 rad, a loud target 62 degrees up: the demand is past the limit
    for (let i = 0; i < 40; i++) { sp = Tp.stepTorpedo(sp, [tgt(2, 25, 0, -90 + 3.3 + 38, 4.5, 0)], { tick: i, seed: 5 }).torpedo; top = Math.max(top, sp.pitch); }
    ok("!! pitch is CLAMPED at 0.6 rad however hard it is asked to climb: launched at 0.59 nose-up with a loud target 62 degrees up, it reaches 0.6 and never passes it (40 ticks)", top <= 0.6 + 1e-12 && top > 0.599 && T.maxPitch === 0.6, `${top}`);
}

console.log("\n4. THE SEEKER");
{
    const at = (bearingDeg, range, speed) => tgt(2, range * Math.cos(bearingDeg * DEG), -range * Math.sin(bearingDeg * DEG), -30, speed, 0), first = (target) => Tp.stepTorpedo(fresh(), [target], { tick: 0, seed: 5 }).torpedo;
    ok("!! the cone is 35 degrees about the velocity: a loud boat 30 degrees off the nose at 100 m is LOCKED on the first look, the same boat 40 degrees off is not; above the nose likewise (30 deg locks, 40 does not)", first(at(30, 100, 4.5)).locked && !first(at(40, 100, 4.5)).locked && first(tgt(2, 100 * Math.cos(30 * DEG), 0, -30 + 100 * Math.sin(30 * DEG), 4.5)).locked && !first(tgt(2, 100 * Math.cos(40 * DEG), 0, -30 + 100 * Math.sin(40 * DEG), 4.5)).locked);
    ok("!! seekerRange satisfies seekerSNR = 8 dB to 1e-6, and the ranges are ordered by the target's noise: 66 < 259 < 563 m for 0.5 / 2 / 4.5 m/s", Math.abs(Tp.seekerSNR(K.sourceLevel(2), Tp.seekerRange(2)) - 8) < 1e-6 && Tp.seekerRange(0.5) < 70 && Tp.seekerRange(0.5) > 60 && Tp.seekerRange(2) > 250 && Tp.seekerRange(2) < 270 && Tp.seekerRange(4.5) > 550 && Tp.seekerRange(4.5) < 575, `${Tp.seekerRange(0.5).toFixed(0)} ${Tp.seekerRange(2).toFixed(0)} ${Tp.seekerRange(4.5).toFixed(0)}`);
    const locks = (speed, range) => { let n = 0; for (let k = 0; k < 100; k++) if (Tp.stepTorpedo(fresh(), [at(10, range, speed)], { tick: k, seed: 5 }).torpedo.locked) n++; return n; };
    const a1 = locks(4.5, 100), a2 = locks(0.5, 100), a3 = locks(0.5, 180), a4 = locks(2, 650), a5 = locks(2, 100), a6 = locks(2, 259);
    ok("!! hearing is a probability around the range (3 dB of luck): a loud boat (4.5 m/s) at 100 m and a 2 m/s boat at 100 m are heard on all 100 looks; a CREEPING boat (0.5 m/s, range 66 m) at 100 m on under a quarter of them and at 180 m on none; a 2 m/s boat at 650 m (range 259) on none; and AT its range (259 m) on 35..65 of 100", a1 === 100 && a5 === 100 && a2 < 25 && a3 === 0 && a4 === 0 && a6 >= 35 && a6 <= 65, `${a1} ${a2} ${a3} ${a4} ${a5} ${a6}`);
    const loudR = [at(25, 150, 4.5), { ...at(-25, 80, 1), id: 3 }], loudL = [at(-25, 150, 4.5), { ...at(25, 80, 1), id: 3 }];   // the quiet one is NEARER, so both are heard (SNR 12 dB vs the loud one's 20): the loudest wins, not the nearest
    ok("!! it follows the LOUDEST target in the cone: a 4.5 m/s boat on the right and a 1 m/s boat on the left at the same range turn it right; swapped, left", run(fresh(), loudR, 60).t.heading > 0.05 && run(fresh(), loudL, 60).t.heading < -0.05);
    const own = run(fresh(), [{ id: 1, pos: [60, 0, -30], heading: 0, speed: 4.5 }], 120);
    ok("!! the OWNER is never a target: its own boat dead ahead, loud, in the path, is not homed on and not hit (no event, never locked)", own.ev === null && !own.t.locked);
    const lockRun = (appear, vanish) => { let t = fresh(), lockedAt = -1, lostAt = -1; const target = tgt(2, 150 * Math.cos(30 * DEG), -150 * Math.sin(30 * DEG), -30, 4.5, 0);
        for (let i = 0; i < 400; i++) { const r = Tp.stepTorpedo(t, i >= appear && i < vanish ? [target] : [], { tick: i, seed: 5 }); t = r.torpedo; if (t.locked && lockedAt < 0) lockedAt = i; if (lockedAt >= 0 && !t.locked && lostAt < 0) lostAt = i; } return { t, lockedAt, lostAt }; };
    const l0 = lockRun(0, 61), l1 = lockRun(1, 400);
    ok("!! the seeker LOOKS every 6th tick (5 Hz): a target present from tick 0 is locked at tick 0, one that appears at tick 1 is locked at the next look, tick 6; and a lock is LOST after 3 s of nothing -- three silent looks (6, 12, 18 ticks): a target that vanishes at tick 61 is lost at the look on tick 78 exactly, the command then zero and the heading steady", l0.lockedAt === 0 && l1.lockedAt === 6 && l0.lostAt === 78 && l0.t.cmd.heading === 0 && l0.t.cmd.pitch === 0 && T.lookEvery === 6 && T.loseLockAfter === 18, `locked at ${l0.lockedAt}/${l1.lockedAt}, lost at ${l0.lostAt}`);
}

console.log("\n5. THE WARHEAD");
{
    let through = Infinity; const early = run(fresh(), (i, t) => { if (!t.armed) through = Math.min(through, Math.hypot(30 - t.pos[0], t.pos[1], t.pos[2] + 30)); return [tgt(2, 30, 0, -30, 0, 0)]; }, 600, { seeker: false }), late = run(fresh(), [tgt(2, 80, 0, -30, 0, 0)], 400, { seeker: false });
    ok("!! a torpedo is NOT ARMED until 40 m of run: a stationary target dead ahead at 30 m (reached at 24 m of run) is passed THROUGH, within 1 m of it while unarmed, with no event -- and the torpedo arms later; the same target at 80 m is hit for the full 100", early.ev === null && through < 1 && early.t.armed && late.ev && late.ev.damage === 100 && late.ev.target === 2 && late.t.status === "hit" && late.t.armed, `through ${through.toFixed(2)} m; late ${JSON.stringify(late.ev)}`);
    const pass = (off, n = 400) => { let closest = Infinity, closestTick = -1; const r = run(fresh(), (i, t) => { const d = Math.hypot(80 - t.pos[0], off - t.pos[1], 0); if (d < closest) { closest = d; closestTick = i; } return [tgt(2, 80, -off, -30, 0, 0)]; }, n, { seeker: false }); return { ...r, closest, closestTick }; };
    const p5 = pass(5), p9 = pass(9, 3200), p05 = pass(0.5), p79 = pass(7.9);
    ok("!! the fuse fires at the CLOSEST APPROACH, not on entering the shell: a pass 5 m off scores damageAt(5) = 76 (to 0.5) at a distance of 5.00 m (to 0.01), on the very tick whose starting distance was the closest (the distance is first seen to GROW in that tick's step: 0 or 1 ticks from the closest) -- a shell-entry fuse would have fired ~6 ticks earlier and scored ~40", p5.ev && Math.abs(p5.ev.damage - 76) < 0.5 && Math.abs(p5.ev.distance - 5) < 0.01 && p5.i - p5.closestTick >= 0 && p5.i - p5.closestTick <= 1, `${JSON.stringify(p5.ev)} event at ${p5.i}, closest at ${p5.closestTick}`);
    ok("!! CONTACT: a pass 0.5 m off fires as it ENTERS the 1 m contact sphere (event distance between 0.55 and 1.0 m -- not at the 0.5 m closest approach), for 100", p05.ev && p05.ev.distance > 0.55 && p05.ev.distance <= 1 && p05.ev.damage === 100, `${p05.ev && p05.ev.distance.toFixed(3)} m`);
    ok("!! a pass 9 m off is a MISS (no event, the torpedo flies on to expiry); a pass 7.9 m off scores ~41; a pass 0.5 m off is CONTACT (within 1 m: fires at once for 100)", p9.ev === null && p9.t.status === "expired" && p79.ev && p79.ev.damage > 39 && p79.ev.damage < 43 && p05.ev && p05.ev.damage === 100, `${p9.t.status} / ${p79.ev && p79.ev.damage.toFixed(1)} / ${p05.ev && p05.ev.damage}`);
    ok("!! one event only: a torpedo that has hit is returned UNCHANGED (the same object) by every later step, with no second event", (() => { const h = late.t, r = Tp.stepTorpedo(h, [tgt(2, 80, 0, -30, 0, 0)], { tick: 9, seed: 5 }); return r.torpedo === h && r.event === null; })());
}

console.log("\n6. THE STATE");
{
    const t0 = fresh(), targets = Object.freeze([Object.freeze(tgt(2, 150, -50, -30, 4.5, 0))]), snap = JSON.stringify(targets);
    const r = Tp.stepTorpedo(t0, targets, { tick: 0, seed: 5 }), r2 = Tp.stepTorpedo(t0, targets, { tick: 0, seed: 5 });
    ok("!! a step edits nothing it is handed (frozen torpedo and targets accepted), returns a FROZEN new torpedo (and frozen pos-independent fields), and is deterministic: the same step twice is the same torpedo", JSON.stringify(targets) === snap && Object.isFrozen(r.torpedo) && r.torpedo !== t0 && JSON.stringify(r.torpedo) === JSON.stringify(r2.torpedo) && t0.ticks === 0);
    const ex = run(fresh(), [], 4000, { seeker: false }).t;
    ok("an expired torpedo is returned unchanged (the same object) with no event", (() => { const q = Tp.stepTorpedo(ex, [], { tick: 1 }); return q.torpedo === ex && q.event === null; })());
    ok("the torpedo is a sonar source: platformOf gives its position, heading and speed", (() => { const q = fresh(0.4); const p = Tp.platformOf(q); return p.pos === q.pos && p.heading === 0.4 && p.speed === 2; })());
}

console.log("\n7. THE FRONT DOOR");
{
    const l = Tp.reportLines();
    ok("!! the export list is pinned", Object.keys(Tp).sort().join(",") === "TORPEDO,damageAt,launch,platformOf,reportLines,seekerNoise,seekerRange,seekerSNR,stepTorpedo", Object.keys(Tp).sort().join(","));
    ok("the report says real numbers and the seeker ranges 66 / 259 / 563 m", l.length === 2 && l.every((x) => !/NaN|undefined/.test(x)) && /66 \/ 259 \/ 563/.test(l[1]), l[1]);
    ok("TORPEDO is frozen", Object.isFrozen(Tp.TORPEDO));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
