// WebGLEngine/physics/mechanics/flightGuns-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/flightGuns-selfcheck.mjs      (~1 s)
//
// THE GUN, HELD TO THE FORMS A GUN HAS, NOT TO ITSELF. physics/mechanics/flightGuns.mjs is a muzzle, a round that falls, a trigger and a hit test. Each is checked against something written here independently:
//
//   1  THE MUZZLE   the gun axis is 0.05 rad below the body axis in EVERY attitude (the angle to the nose is a constant, whatever the heading, pitch and bank); at bank 0 its elevation is the pitch plus the boresight and its azimuth
//                   is the heading, exactly; the muzzle is 2.4 m along the nose; a yawing aircraft moves its muzzle sideways by w x r (1 rad/s at 2.4 m is 2.4 m/s) and the round inherits it
//   2  THE ROUND    p(t) = p0 + v t - g t^2/2 and v(t) = v0 - g t z, at ANY tick length (1/30, 1/60 and a ragged 1/7 s all give the same round, to 1e-9): the integrator is the closed form, so nothing downstream is chasing a step
//   3  THE TRIGGER  15 rounds a second at any tick length (30 in two seconds at 1/30, 1/60 and 1/7), NOTHING BANKED while the trigger is up (a half-round of credit then ten idle seconds then another half is no round), and a
//                   300-round magazine that fires exactly 300 and then no more
//   4  THE SWEEP    the first root of a quadratic in the TARGET'S frame: a round that stops short, that grazes at exactly R, that misses by a hair, that starts inside, and the one a sampled-distance test would miss
//                   (a round that crosses the sphere between two ticks, 11.5 m a tick against an 8 m sphere), and a target that MOVES out of the way
//   5  THE AIM      aimSolution() is an exact lead-and-drop: over 300 random shooters and targets, the round fired along its direction is at the target's position at its time of flight to 1e-6 m; and the WHOLE CHAIN
//                   (an aircraft turned to point the gun, fire(), stepRounds() at 1/30 s) puts a hit on a target that flies across at 60 m/s from 150 to 500 m
//   6  THE HITS     a round does not hit its owner; it takes the nearer of two targets; it dies on the ground and at its life; a hit is reported once
//
// SABOTAGE LOG -- THIRTY-FIVE (twenty-six, five more on fireFrom and four on the part a hit names, below), each applied to physics/mechanics/flightGuns.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   S1 boresight sign flipped 1 | S2 the muzzle offset ignored in the muzzle's place 2 | S3 the muzzle's rotation velocity ignored 2 | S4 w x r the wrong way round 2 | S5 a round falls a quarter g t^2 1 | S6 a round's velocity not changed by gravity 2 |
//   S7 credit kept when the trigger is released 1 | S8 the rate doubled 4 | S9 rounds rounded, not floored 2 | S10 the magazine not clamping the last burst 1 | S11 a round hits its owner 1 | S12 the first target reached, not the earliest 1 |
//   S13 rounds survive the ground 1 | S14 rounds live twice as long 1 (S13 and S14 share one row, which asks both) | S15 a sampled-distance hit test 7 | S16 the hit test in the world frame, a moving target ignored 2 | S17 a hit allowed beyond the end of the tick 2 |
//   S18 the aim ignoring the fall of the round 3 | S19 the aim ignoring the shooter's own velocity 2 | S20 the aim ignoring the target's velocity 3 | S21 the aim iteration stopping at 0.1 s 3 | S22 a round without the muzzle's own velocity 3 | S23 a round spawned at the centre of mass 1.
//   AND THREE ON THE FRONT DOOR, once section 7 existed: E5 the report line says NaN 1 | E6 GUN not frozen 1 | E7 the hit sphere 5 m 1 (only the numbers row sees it: the sweep rows pass their own radius, and the fights that depend on 4 m are the dogfight gate's).
//   AND FIVE ON fireFrom, once the seats fired through it: F1 the muzzle function called on every tick, fired or not 1 | F2 a muzzle given as a value ignored 1 | F3 fire() drops the owner 2 (the one-round row) | F4 fireFrom drops the owner 2 (the same row, and the new value row sees it only through the owner it asks) | F5 the muzzle's velocity left out of the round 4
//   AND FOUR ON THE PART A HIT NAMES (a craft of several spheres, which the bomber is): F6 a hit never names its part 1 | F7 a plain hit carries an undefined part 2 | F8 the part taken from the last target tested, not the nearest 1 (0 on the first listing: the nearest happened to be last) | F9 the part label lost on the way to the hit 1
//   S10 is the one the 300-round rows could not have seen (REASONED, NOT RUN: the 5-round row was written before the sabotages): at 15 rounds a second a 1/30 s tick never fires more than the magazine has left, so the clamp could be deleted and those rows would pass.
"use strict";
import * as G from "./flightGuns.mjs";
import * as F from "./flightModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const B = G.GUN.boresight;

console.log("flightGuns-selfcheck -- a fixed forward gun for the real-flight aircraft\n");

console.log("1. THE MUZZLE");
{
    const lvl = F.createState({ pos: [10, 20, 300], speed: 45, heading: 0 }), m0 = G.muzzleOf(lvl);
    ok("!! level at heading 0 the muzzle is 2.4 m ahead on the nose and the gun points (cos b, 0, sin b), 0.05 rad below the nose, in a world where the nose is +X", near(m0.pos, [12.4, 20, 300], 1e-12) && near(m0.dir, [Math.cos(B), 0, Math.sin(B)], 1e-12) && near(m0.vel, [45, 0, 0], 1e-12), `${m0.dir.map((v) => v.toFixed(5))}`);
    const a = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0.7, pitch: 0.3, bank: 0 }), ma = G.muzzleOf(a);
    ok("!! at bank 0 the gun's elevation is the PITCH PLUS THE BORESIGHT (0.3 - 0.05 = 0.25 rad) and its azimuth is the HEADING (0.7 rad, a right turn positive), exactly", Math.abs(Math.asin(ma.dir[2]) - 0.25) < 1e-12 && Math.abs(Math.atan2(-ma.dir[1], ma.dir[0]) - 0.7) < 1e-12, `${Math.asin(ma.dir[2]).toFixed(12)} ${Math.atan2(-ma.dir[1], ma.dir[0]).toFixed(12)}`);
    const rng = mulberry(77); let worst = 0, worstLen = 0;
    for (let i = 0; i < 200; i++) {
        const s = F.createState({ pos: [0, 0, 300], speed: 45, heading: (rng() - 0.5) * 6, pitch: (rng() - 0.5) * 2.4, bank: (rng() - 0.5) * 6 }), m = G.muzzleOf(s);
        const f = F.attitude(s), nx = [Math.cos(f.pitch) * Math.cos(f.heading), -Math.cos(f.pitch) * Math.sin(f.heading), Math.sin(f.pitch)];
        worst = Math.max(worst, Math.abs(dot(m.dir, nx) - Math.cos(B)), Math.abs(norm(sub(m.pos, s.pos)) - 2.4)); worstLen = Math.max(worstLen, Math.abs(norm(m.dir) - 1));
    }
    ok("!! in 200 random attitudes (any heading, pitch up to 69 degrees, any bank) the gun is ALWAYS 0.05 rad from the nose (dot = cos 0.05), a unit vector, with the muzzle 2.4 m from the centre of mass", worst < 1e-12 && worstLen < 1e-12, `worst ${worst.toExponential(1)}`);
    const yaw = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0, w: [0, 0, -1] }), my = G.muzzleOf(yaw);
    ok("!! an aircraft yawing right at 1 rad/s carries its muzzle to the right at 2.4 m/s (w x r): the muzzle's velocity is the aircraft's plus (0, -2.4, 0), and the ROUND inherits it", near(my.vel, [45, -2.4, 0], 1e-12) && (() => { const { rounds } = G.fire(G.createGun(), yaw, true, 1 / 15); return rounds.length === 1 && Math.abs(rounds[0].vel[1] - (-2.4 + 300 * my.dir[1])) < 1e-9; })(), `${my.vel}`);
    const pitchUp = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0, w: [0, -1, 0] }), mp = G.muzzleOf(pitchUp);
    ok("...and a nose pitching UP at 1 rad/s lifts the muzzle at 2.4 m/s (the sign is the flight model's: rates().pitch = -w[1])", near(mp.vel, [45, 0, 2.4], 1e-12) && F.rates(pitchUp).pitch === 1, `${mp.vel}`);
}

console.log("\n2. THE ROUND");
{
    const r0 = { pos: [5, -3, 300], vel: [344.6, 12, -15], age: 0, owner: 1 }, t = 1.2, g = G.GRAVITY;
    const want = [5 + 344.6 * t, -3 + 12 * t, 300 - 15 * t - 0.5 * g * t * t], wantV = [344.6, 12, -15 - g * t];
    const run = (dt) => { let r = r0; const n = Math.round(t / dt); for (let i = 0; i < n; i++) r = G.stepRound(r, dt); return r; };
    const A = run(1 / 30), Bb = run(1 / 60), C = run(0.12);
    ok("!! a round is EXACT under gravity: p(t) = p0 + v t - g t^2/2 and v(t) = v0 - g t z at 1/30 s, 1/60 s and 0.12 s ticks, all to 1e-9 -- the integrator is the closed form", [A, Bb, C].every((r) => near(r.pos, want, 1e-9) && near(r.vel, wantV, 1e-9) && Math.abs(r.age - t) < 1e-9), `${[A, Bb, C].map((r) => norm(sub(r.pos, want)).toExponential(1)).join(" ")}`);
    ok("a step does not edit the round it was handed (a value in, a value out) and keeps its owner", r0.age === 0 && r0.pos[0] === 5 && A.owner === 1);
}

console.log("\n3. THE TRIGGER");
{
    const s = F.createState({ pos: [0, 0, 300], speed: 45 });
    const burst = (dt, seconds, from = G.createGun()) => { let gun = from, n = 0; for (let i = 0; i < Math.round(seconds / dt); i++) { const r = G.fire(gun, s, true, dt); gun = r.gun; n += r.rounds.length; } return { gun, n }; };
    const r1 = burst(1 / 30, 2), r2 = burst(1 / 60, 2), r3 = burst(1 / 7, 2);
    ok("!! 15 rounds a second AT ANY TICK LENGTH: two seconds of trigger is 30 rounds at 1/30, 1/60 and 1/7 s ticks (the last fires two or three a tick), and the magazine is 30 lighter", r1.n === 30 && r2.n === 30 && r3.n === 30 && r1.gun.ammo === 270 && r1.gun.fired === 30, `${r1.n} ${r2.n} ${r3.n}`);
    let gun = G.createGun(), total = 0;
    for (let k = 0; k < 3; k++) {
        for (let i = 0; i < 1; i++) { const r = G.fire(gun, s, true, 0.04); gun = r.gun; total += r.rounds.length; }   // 0.6 of a round of credit
        for (let i = 0; i < 300; i++) { const r = G.fire(gun, s, false, 1 / 30); gun = r.gun; total += r.rounds.length; }   // ten idle seconds
    }
    ok("!! NOTHING IS BANKED WHILE THE TRIGGER IS UP: three 0.04 s taps (0.6 of a round each) with ten idle seconds between them fire NO round (banked, the second tap would have fired one)", total === 0 && gun.credit === 0, `${total} rounds, credit ${gun.credit}`);
    const big = burst(1 / 30, 25), more = G.fire(big.gun, s, true, 1 / 30);
    ok("!! THE MAGAZINE IS 300 ROUNDS AND THEN IT IS EMPTY: 25 seconds of trigger fires exactly 300 (20 s of fire), ammo 0, fired 300, and a held trigger after that fires nothing and banks nothing", big.n === 300 && big.gun.ammo === 0 && big.gun.fired === 300 && more.rounds.length === 0 && more.gun.credit === 0, `${big.n}`);
    const tiny = Object.freeze({ ...G.GUN, magazine: 5 });
    let tg = G.createGun(tiny), tn = 0; for (let i = 0; i < 4; i++) { const r = G.fire(tg, s, true, 0.2); tg = r.gun; tn += r.rounds.length; }
    ok("!! THE LAST ROUNDS OF A MAGAZINE ARE CLAMPED TO WHAT IS LEFT: a 5-round magazine fired in 3-round ticks gives 3, 2 and then nothing -- 5 rounds, ammo 0 (not -1), fired 5", tn === 5 && tg.ammo === 0 && tg.fired === 5, `${tn} rounds, ammo ${tg.ammo}`);
    const one = G.fire(G.createGun(), s, true, 1 / 30), idle = G.fire(G.createGun(), s, false, 1 / 30);
    ok("a round leaves the MUZZLE at the start of the tick with the muzzle's velocity plus 300 m/s along the gun, age 0, and its owner (an id the task gives it); a released trigger returns the same gun", one.rounds.length === 0 && idle.rounds.length === 0 && idle.gun.ammo === 300 && (() => { const f = G.fire(G.createGun(), s, true, 1 / 15, 7), m = G.muzzleOf(s); return f.rounds.length === 1 && f.rounds[0].owner === 7 && f.rounds[0].age === 0 && near(f.rounds[0].pos, m.pos, 1e-12) && near(f.rounds[0].vel, [m.vel[0] + 300 * m.dir[0], m.vel[1] + 300 * m.dir[1], m.vel[2] + 300 * m.dir[2]], 1e-9); })(), "the first 1/30 s of a 15/s gun is half a round: none yet");
    ok("a gun is a frozen value: fire() hands back a new one and the old one still has its ammo", (() => { const g0 = G.createGun(); G.fire(g0, s, true, 1 / 15); return g0.ammo === 300 && Object.isFrozen(g0); })());
    // fireFrom: the same trigger for a gun that is not on the nose (physics/mechanics/gunSeats.mjs fires its turrets through it)
    const mv = { pos: [7, 8, 9], vel: [10, 20, 30], dir: [0, 0, 1] };
    const val = G.fireFrom(G.createGun(), mv, true, 1 / 15, 4), viaFire = G.fire(G.createGun(), s, true, 1 / 15, 4), m0 = G.muzzleOf(s), same = G.fireFrom(G.createGun(), m0, true, 1 / 15, 4);
    ok("!! fireFrom takes the muzzle as a VALUE: a round leaves at that position with that velocity plus 300 m/s along that direction ((10, 20, 330)), age 0 and the owner; fire() is fireFrom() with muzzleOf(shooter), the same round to the bit",
        val.rounds.length === 1 && near(val.rounds[0].pos, [7, 8, 9], 0) && near(val.rounds[0].vel, [10, 20, 330], 1e-12) && val.rounds[0].age === 0 && val.rounds[0].owner === 4 && val.gun.ammo === 299
        && JSON.stringify(viaFire.rounds) === JSON.stringify(same.rounds) && viaFire.gun.ammo === same.gun.ammo, `${val.rounds[0] && val.rounds[0].vel}`);
    let calls = 0, gun2 = G.createGun(), shots = 0;
    for (let i = 0; i < 30; i++) { const r = G.fireFrom(gun2, () => { calls++; return mv; }, true, 1 / 60, 0); gun2 = r.gun; shots += r.rounds.length; }
    ok("!! ...or as a FUNCTION called only when a round leaves: 30 ticks at 1/60 s (half a second: 7 rounds at 15 a second) call it once per tick that fires and not on the ticks that do not, and never with the trigger up",
        shots === 7 && calls === 7 && (() => { let c = 0; G.fireFrom(G.createGun(), () => { c++; return mv; }, false, 1 / 15); return c === 0; })(), `${shots} rounds, ${calls} calls`);
}

console.log("\n4. THE SWEEP");
{
    const R = 4, at = (x, y = 0, z = 0) => [x, y, z];
    ok("!! a round flying straight at a still sphere hits at the near surface: from 0 to 100 on x, a sphere at 50 of radius 4 is entered at t = 46/100 exactly", Math.abs(G.sweepHit(at(0), at(100), at(50), at(50), R) - 0.46) < 1e-12);
    ok("a round that stops short (ends at 45, the surface is at 46) is no hit; one that ends exactly on the surface is a hit at t = 1", G.sweepHit(at(0), at(45), at(50), at(50), R) === null && Math.abs(G.sweepHit(at(0), at(46), at(50), at(50), R) - 1) < 1e-12);
    ok("!! GRAZING: passing at exactly the radius (4 m off the centre line) touches the sphere at its middle, t = 0.5; 4.0001 m off misses", Math.abs(G.sweepHit(at(0, 4), at(100, 4), at(50), at(50), R) - 0.5) < 1e-6 && G.sweepHit(at(0, 4.0001), at(100, 4.0001), at(50), at(50), R) === null);
    ok("a round that STARTS inside the sphere is a hit at 0", G.sweepHit(at(51), at(100), at(50), at(50), R) === 0);
    ok("!! THE ROUND A SAMPLED TEST MISSES: 11.5 m a tick through an 8-m-wide sphere, its ends at 44.2 and 55.7 (both outside, 5.8 and 5.7 m from the centre) still HITS, at t = (46 - 44.2) / 11.5", (() => { const t = G.sweepHit(at(44.2), at(55.7), at(50), at(50), R); return t !== null && Math.abs(t - (46 - 44.2) / 11.5) < 1e-12 && norm(sub(at(44.2), at(50))) > R && norm(sub(at(55.7), at(50))) > R; })());
    ok("!! IT IS IN THE TARGET'S FRAME: a target that moves out of the way misses (the round ends where the target was; the target ends 30 m to the side), and a target that moves INTO the round's line hits that a still one would not", G.sweepHit(at(0), at(100), at(50), at(50, 30), R) === null && G.sweepHit(at(0, 10), at(100, 10), at(50, 20), at(50, 0), R) !== null && G.sweepHit(at(0, 10), at(100, 10), at(50, 20), at(50, 20), R) === null);
    ok("a zero-length relative path outside the sphere (a round and a target moving together) is a miss, not a division by zero", G.sweepHit(at(0), at(10), at(100), at(110), R) === null);
}

console.log("\n5. THE AIM");
{
    const rng = mulberry(2026), u = (lo, hi) => lo + (hi - lo) * rng(); let worstPos = 0, n = 0, unreachable = 0;
    for (let i = 0; i < 300; i++) {
        const s = F.createState({ pos: [u(-100, 100), u(-100, 100), u(150, 450)], speed: u(35, 55), heading: u(-3, 3), pitch: u(-0.3, 0.3), bank: u(-0.6, 0.6), w: [u(-0.5, 0.5), u(-0.3, 0.3), u(-0.3, 0.3)] }), m = G.muzzleOf(s);
        const ang = u(0, 6.28), rngM = u(100, 500), tp = [m.pos[0] + rngM * Math.cos(ang), m.pos[1] + rngM * Math.sin(ang), m.pos[2] + u(-80, 80)], tv = [u(-60, 60), u(-60, 60), u(-6, 6)];
        const sol = G.aimSolution(m, tp, tv);
        if (!sol) { unreachable++; continue; }
        n++;
        const v0 = [m.vel[0] + sol.dir[0] * 300, m.vel[1] + sol.dir[1] * 300, m.vel[2] + sol.dir[2] * 300], t = sol.t;
        const p = [m.pos[0] + v0[0] * t, m.pos[1] + v0[1] * t, m.pos[2] + v0[2] * t - 0.5 * G.GRAVITY * t * t], T = [tp[0] + tv[0] * t, tp[1] + tv[1] * t, tp[2] + tv[2] * t];
        worstPos = Math.max(worstPos, norm(sub(p, T)));
    }
    ok("!! aimSolution() IS EXACT: over 300 random shooters (any attitude, spinning) and targets (100-500 m, moving up to 85 m/s) the round fired along its direction is AT the target at its time of flight, to 1e-6 m", n > 280 && worstPos < 1e-6, `${n} solved, ${unreachable} unreachable, worst ${worstPos.toExponential(1)} m`);
    const still = G.aimSolution({ pos: [0, 0, 300], vel: [0, 0, 0] }, [300, 0, 300], [0, 0, 0]);
    ok("!! A STILL SHOOTER AND TARGET 300 m APART at the same height: the gun is aimed ABOVE the target by exactly the fall of a round in its flight time (g t^2/2 over the range): the closed form for the drop", (() => { const t = still.t; return Math.abs(t * 300 - Math.hypot(300, 0.5 * G.GRAVITY * t * t)) < 1e-9 && Math.abs(Math.atan2(0.5 * G.GRAVITY * t * t, 300) - Math.asin(still.dir[2])) < 1e-9; })(), `elevation ${(Math.asin(still.dir[2]) * 180 / Math.PI).toFixed(4)} deg, t ${still.t.toFixed(4)} s`);
    ok("a target that outruns the round (300 m/s away and 400 m/s of closing speed in the other direction) gives null where it cannot be hit, and a target at the muzzle gives a finite answer", G.aimSolution({ pos: [0, 0, 300], vel: [0, 0, 0] }, [100, 0, 300], [400, 0, 0]) === null && Number.isFinite(G.aimSolution({ pos: [0, 0, 300], vel: [0, 0, 0] }, [1, 0, 300], [0, 0, 0]).t));
    // the WHOLE CHAIN: an aircraft turned to point the gun along the solution, the trigger, the rounds stepped at 1/30 s against a target flying across the line
    let chainHits = 0, chainTrials = 0, worstMiss = 0;
    for (const range of [150, 250, 350, 500]) {
        const tvel = [0, 60, 0], tp = [range, -40, 300], dt = 1 / 30;
        let s = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0 });
        for (let it = 0; it < 6; it++) {   // the muzzle's place and velocity depend on the attitude, the attitude on the solution: three or four passes settle it
            const sol = G.aimSolution(G.muzzleOf(s), tp, tvel), az = Math.atan2(-sol.dir[1], sol.dir[0]), el = Math.asin(sol.dir[2]);
            s = F.createState({ pos: [0, 0, 300], speed: 45, heading: az, pitch: el - B });
        }
        const sol = G.aimSolution(G.muzzleOf(s), tp, tvel);
        let { rounds } = G.fire(G.createGun(), s, true, 1 / 15), tpos = tp.slice(), hit = null, minD = Infinity;
        for (let k = 0; k < 90 && rounds.length && !hit; k++) {
            const next = [tpos[0] + tvel[0] * dt, tpos[1] + tvel[1] * dt, tpos[2] + tvel[2] * dt], res = G.stepRounds(rounds, dt, [{ id: 2, from: tpos, to: next, radius: 0.5 }]);
            for (const r of rounds) minD = Math.min(minD, norm(sub(G.stepRound(r, dt).pos, next)));
            if (res.hits.length) hit = { k, ...res.hits[0] };
            rounds = res.rounds; tpos = next;
        }
        chainTrials++; if (hit) chainHits++;
        worstMiss = Math.max(worstMiss, hit ? Math.abs((hit.k + hit.t) * dt - sol.t) : Infinity);
    }
    ok("!! THE WHOLE CHAIN HITS: an aircraft turned to point the gun along the solution, fire(), the rounds stepped at 1/30 s against a target crossing at 60 m/s from 150, 250, 350 and 500 m puts a hit on a HALF-METRE sphere at the predicted time of flight in every case", chainHits === chainTrials && worstMiss < 1 / 30, `${chainHits} of ${chainTrials}, worst time error ${worstMiss.toFixed(4)} s`);
}

console.log("\n6. THE HITS");
{
    const dt = 1 / 30, R = 4, tgt = (id, x) => ({ id, from: [x, 0, 300], to: [x, 0, 300], radius: R });
    const rd = (owner, x = 0) => ({ pos: [x, 0, 300], vel: [300, 0, 0], age: 0, owner });
    const own = G.stepRounds([rd(1)], dt, [{ id: 1, from: [5, 0, 300], to: [5, 0, 300], radius: R }]);
    ok("!! A ROUND DOES NOT HIT ITS OWNER: a round fired by 1 passing through 1's own sphere survives, and the same round is a hit on 2", own.hits.length === 0 && own.rounds.length === 1 && G.stepRounds([rd(1)], dt, [{ id: 2, from: [5, 0, 300], to: [5, 0, 300], radius: R }]).hits.length === 1);
    const two = G.stepRounds([rd(1)], dt, [tgt(3, 9), tgt(2, 5)]);
    ok("!! THE NEARER OF TWO TARGETS IS THE ONE HIT (listed second, 4 m nearer along the line): target 2, once, and the round is gone", two.hits.length === 1 && two.hits[0].target === 2 && two.rounds.length === 0 && Math.abs(two.hits[0].t - 0.1) < 1e-6, `t ${two.hits[0] && two.hits[0].t}`);
    ok("a round on the ground is removed (a round at z = 0.5 falling at 20 m/s), and a round at its life is removed (age 1.99 + 1/30 >= 2), not kept as a ghost", G.stepRounds([{ pos: [0, 0, 0.5], vel: [300, 0, -20], age: 0, owner: 1 }], dt, []).rounds.length === 0 && G.stepRounds([{ ...rd(1), age: 1.99 }], dt, []).rounds.length === 0 && G.stepRounds([{ ...rd(1), age: 1.9 }], dt, []).rounds.length === 1);
    const a = G.stepRounds([rd(1), rd(1, 10)], dt, [tgt(2, 30)]), b = G.stepRounds([rd(1), rd(1, 10)], dt, [tgt(2, 30)]);
    ok("deterministic: the same rounds and targets give the same survivors and the same hits, and a round that misses is carried forward aged by the tick", JSON.stringify(a) === JSON.stringify(b) && a.rounds.length === 2 && Math.abs(a.rounds[0].age - dt) < 1e-12);
}

{
    // a craft made of several spheres: one target per part, the craft's id on each, a `part` label on each
    const dt = 1 / 30, part = (name, x, R = 4) => ({ id: 2, part: name, from: [x, 0, 300], to: [x, 0, 300], radius: R }), rd = (owner, x = 0) => ({ pos: [x, 0, 300], vel: [300, 0, 0], age: 0, owner });
    const near_ = G.stepRounds([rd(1)], dt, [part("tail", 14), part("nose", 6)]), one = G.stepRounds([rd(1)], dt, [{ id: 2, from: [6, 0, 300], to: [6, 0, 300], radius: 4 }]);
    ok("!! A HIT SAYS WHICH PART OF A CRAFT IT REACHED: a craft of two spheres (ids 2, parts 'tail' listed first at 14 m and 'nose' at 6 m) is hit once, by the NEARER sphere whichever order they are listed in, and the hit names it ('nose'); a plain target's hit has no `part` at all (not an undefined one)",
        near_.hits.length === 1 && near_.hits[0].target === 2 && near_.hits[0].part === "nose" && near_.rounds.length === 0 && G.stepRounds([rd(1)], dt, [part("nose", 6), part("tail", 14)]).hits[0].part === "nose" && one.hits.length === 1 && !("part" in one.hits[0]), JSON.stringify(near_.hits[0]));
    const own = G.stepRounds([rd(2)], dt, [part("tail", 14), part("nose", 6)]);
    ok("!! a round does not hit ITS OWNER'S PARTS either (the owner's id is on every part): a round of craft 2 through both of craft 2's spheres survives, and craft 1's does not", own.hits.length === 0 && own.rounds.length === 1 && G.stepRounds([rd(1)], dt, [part("tail", 12)]).hits.length === 1);
    const mixed = G.stepRounds([rd(1)], dt, [part("wing", 20), { id: 3, from: [9, 0, 300], to: [9, 0, 300], radius: 4 }]);
    ok("a plain craft nearer than a part of another is the one hit (the part label belongs to the hit's own target, not to a neighbour's)", mixed.hits.length === 1 && mixed.hits[0].target === 3 && !("part" in mixed.hits[0]));
}

console.log("\n7. THE FRONT DOOR");
{
    const rl = G.reportLines();
    ok("the module's report names the gun (rate, magazine, boresight, hit sphere), the muzzle velocity of a round fired level at 45 m/s and the aim for a target 300 m ahead, and no line says NaN or undefined", rl.length >= 3 && /15 rounds\/s/.test(rl[1]) && /344\.6/.test(rl[2]) && /0\.93 deg/.test(rl[2]) && !rl.some((l) => /NaN|undefined/.test(l)), rl[2]);
    ok("GUN is frozen with the numbers the header gives: 300 m/s, 15 a second, 300 rounds, boresight -0.05, a 2 s life, a 4 m sphere, 20 hit points of 1 damage", Object.isFrozen(G.GUN) && G.GUN.muzzleSpeed === 300 && G.GUN.rate === 15 && G.GUN.magazine === 300 && G.GUN.boresight === -0.05 && G.GUN.life === 2 && G.GUN.hitRadius === 4 && G.GUN.damage === 1 && G.GUN.hp === 20 && G.GRAVITY === F.GRAVITY);
}

console.log(fails ? `\nflightGuns-selfcheck: ${fails} FAILED` : "\nflightGuns-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
