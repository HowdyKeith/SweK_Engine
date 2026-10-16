// WebGLEngine/physics/mechanics/gunSeats-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/gunSeats-selfcheck.mjs      (~2 s)
//
// THE GUN SEAT, HELD TO THE GEOMETRY OF A TURRET AND NOT TO ITSELF. physics/mechanics/gunSeats.mjs is a mount with an arc, a slew rate, a muzzle that moves with the body, and a gunner. Each part is checked against something written here independently:
//
//   1  THE FRAME    yaw is positive toward the mount's left and pitch toward its up, in closed form, for a forward seat, a ventral ball turret (rest down, forward is its up) and a dorsal barbette (rest up, aft is its up); dirAt and
//                   anglesOf are inverses over 900 random angles; an `up` that is not perpendicular to `rest` is made so
//   2  THE ARC      edges are in and a hair outside is out; clampToArc; and a hemisphere seat (yaw and pitch +-90 degrees about a rest axis pointing out of it) reaches EXACTLY the hemisphere the rest axis points into (600 random directions)
//   3  THE SLEW     a seat turns toward its command at its rate on each axis and no faster, arrives and does not overshoot, goes the same distance in a second at any tick length (1/30, 1/60, 1/8), stops at the arc's edge when told to go past it,
//                   and holds still for a command without an angle
//   4  THE MUZZLE   it is where the mount plus `reach` along the gun says, on a body at any heading and bank (an identity body by hand; a body heading east of south and one flying inverted); it carries the body's spin (w x r, the body's w in the
//                   BODY frame, the mount and the gun both in it): a tail position on a body yawing right at 1 rad/s moves left at 10 m/s, in the body frame and in a rotated one
//   5  THE ROUND    two seconds of trigger is 30 rounds at 15 a second at any tick length; the round leaves with the muzzle's velocity plus the muzzle speed along the gun AS IT POINTS AFTER THE TICK'S SLEW (not as commanded, not as it pointed);
//                   the magazine is the seat's own (5 rounds fires 5), and so is the muzzle speed and the rate; a state is a value (stepSeat edits nothing it was given)
//   6  THE REACH    reachOf() is the inverse of muzzleOfSeat's dir for 400 random attitudes and angles; a ventral turret reaches the world's down when level and the world's up when inverted
//   7  THE GUNNER   it does not act on a target until `delay` after the target came in range (and again after it left and came back); it predicts a target that holds its velocity EXACTLY whatever the delay (delay 0.5 and delay 0 point the same way
//                   at 1e-9), and a target that turned costs it the stale picture (pinned to the by-hand stale solution); it picks the soonest reachable target inside the arc and range; fires only within the target's radius of a miss for the
//                   gun as it points NOW (and `tolerance` widens that); its aim error is a Gaussian of the asked sigma that is repeatable and differs by seed, by seat and by time; with nothing to shoot at it returns the gun to rest
//   8  END TO END   a perfect gunner on a fixed seat hits a target crossing at 60 m/s at 250 m; the same seat with a slew too slow to follow it hits nothing of a target crossing behind it, and only what passes through its line of fire of one that crosses that; a sloppy gunner (0.1 rad) hits less than half as often; a gunner with a delay hits as
//                   a perfect one does after its reaction time; a tail gunner on a bomber at 80 m/s hits a fighter that closes from behind and a forward-only seat on the same bomber, which cannot see it, does not even fire
//   9  THE FRONT DOOR  makeSeat refuses what cannot be built by name (no id, a NaN mount, up parallel to rest, a slew of 0, an arc that runs backwards), a seat is frozen all the way down, its gun defaults to flightGuns.GUN, the export list is
//                   pinned, and the report lines say real numbers
//
// SABOTAGE LOG -- SIXTY-SIX, each applied to physics/mechanics/gunSeats.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   G1 yaw sign flipped in dirAt 12 | G2 pitch sign flipped in dirAt 15 | G3 left = rest x up 7 | G4 the pitch axis is `up` itself, not made perpendicular 2 | G5 anglesOf pitch from the left axis 7
//   G6 the low yaw edge is out 1 | G7 the pitch arc 1e-3 loose 1 | G8 the high yaw edge not checked 4 | G9 clampToArc leaves yaw alone 2 | G10 clampToArc pitch to the low edge only 13
//   G11 pitch slews at the yaw rate 3 | G12 slew ignores dt 2 | G13 the slew never arrives (always a full step) 8 | G14 the command is not clamped into the arc 1 | G15 a command without a yaw goes to 0 1
//   G16 fire from the pose BEFORE the slew 1 | G17 fire from the COMMANDED pose 1 | G18 the owner dropped 1 | G19 the seat's gun spec ignored in the state 2 | G20 the returned state not frozen 1
//   G21 the mount ignored in the muzzle 7 | G22 the reach ignored in the muzzle 6 | G23 the body's rotation ignored in the muzzle position 2 | G24 the body's spin ignored 3
//   G25 the spin velocity not rotated out of the body frame 1 | G26 w x r the wrong way round 3 | G27 the lever arm without the gun's reach 1 | G28 the gun's direction not rotated into the world 3
//   G29 reachOf in the world frame 2 | G30 reachOf says everything is in the arc 2 | G31 makeSeat accepts an up parallel to rest 1 | G32 makeSeat accepts a pitch slew of 0 1
//   G33 makeSeat accepts a pitch arc that runs backwards 1 | G34 makeSeat accepts no id 1 | G35 makeSeat accepts a NaN mount 1 | G36 the seat not frozen 1 | G37 the arc not frozen 1
//   G38 the default gun a copy, not flightGuns.GUN 1 | G39 the default up is +Y 3 | G40 the default yaw arc a half circle 1 | G41 the default reach 0 1 | G42 a reach of 0 becomes 1 3
//   G43 the name does not default to the id 1 | H1 no reaction time 2 | H2 the picture is not forgotten when the target leaves range 1 | H3 no carrying the picture forward 3
//   H4 the CURRENT velocity used with the old picture 1 | H5 the LATEST reachable target chosen 1 | H6 the arc not checked 1 | H7 the range ignored 3 | H8 with nothing to shoot at, the gun stays where it is 1
//   H9 the trigger always down 4 | H10 tolerance ignored 1 | H11 the target's radius ignored 1 | H12 the miss measured from nothing (the gun taken to be on the solution) 4 | H13 the miss at a fixed 100 m 4
//   H14 no yaw error 2 | H15 no pitch error 1 | H16 the yaw error twice as big 1 | H17 the Gaussian biased 1 | H18 the seed ignored 1 | H19 the seat not in the error's seed 1
//   H20 the time not in the error's seed 2 | H21 old pictures never dropped (the oldest ever seen is used) 1 | H22 the solution made from the body's centre, not the muzzle 2 | R1 the report line says NaN 1
// NOT SABOTAGED, SAID PLAINLY: the 1e-9 slack in the gunner's `h[i].t <= t - delay + 1e-9` (it only decides which picture a float-noisy tick lands on, and carrying a picture forward at its own velocity makes the choice invisible for a target that holds it), and the seat id inside the gunner's memory key (one gunner per seat is the contract, so a shared key is never read).
"use strict";
import * as S from "./gunSeats.mjs";
import * as G from "./flightGuns.mjs";
import * as F from "./flightModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const PI = Math.PI, ID = [1, 0, 0, 0];
const body0 = (o = {}) => ({ pos: [10, 20, 300], vel: [50, 0, 0], q: ID, w: [0, 0, 0], ...o });

const FWD = S.makeSeat({ id: "fwd", mount: [0, 0, 0], rest: [1, 0, 0], arc: { yaw: [-3, 3], pitch: [-1.5, 1.5] }, slew: { yaw: 1, pitch: 1 }, reach: 2 });
const VENTRAL = S.makeSeat({ id: "ball", mount: [0, 0, -1], rest: [0, 0, -1], up: [1, 0, 0], arc: { yaw: [-PI / 2, PI / 2], pitch: [-PI / 2, PI / 2] }, slew: { yaw: 2, pitch: 2 }, reach: 1 });
const DORSAL = S.makeSeat({ id: "barb", mount: [0, 0, 1], rest: [0, 0, 1], up: [-1, 0, 0], arc: { yaw: [-PI / 2, PI / 2], pitch: [-PI / 2, PI / 2] }, slew: { yaw: 2, pitch: 2 }, reach: 1 });

console.log("gunSeats-selfcheck -- a gun on a mount with an arc, a slew rate and a gunner\n");

console.log("1. THE FRAME");
{
    const y = 0.4, p = 0.3;
    ok("!! a forward seat: yaw 0 is the nose, yaw +90 degrees is the body's LEFT (+Y), pitch +90 degrees is UP, and (0.4, 0.3) is (cos p cos y, cos p sin y, sin p) in closed form",
        near(S.dirAt(FWD, 0, 0), [1, 0, 0], 1e-12) && near(S.dirAt(FWD, PI / 2, 0), [0, 1, 0], 1e-12) && near(S.dirAt(FWD, 0, PI / 2), [0, 0, 1], 1e-12)
        && near(S.dirAt(FWD, y, p), [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p)], 1e-12));
    ok("!! a ventral ball turret rests DOWN: (0,0) is -Z, yaw +90 degrees is +Y (left), pitch +90 degrees is +X (forward, the mount's up)",
        near(S.dirAt(VENTRAL, 0, 0), [0, 0, -1], 1e-12) && near(S.dirAt(VENTRAL, PI / 2, 0), [0, 1, 0], 1e-12) && near(S.dirAt(VENTRAL, 0, PI / 2), [1, 0, 0], 1e-12),
        `${S.dirAt(VENTRAL, PI / 2, 0).map((v) => v.toFixed(2))} ${S.dirAt(VENTRAL, 0, PI / 2).map((v) => v.toFixed(2))}`);
    ok("a dorsal barbette rests UP: (0,0) is +Z, yaw +90 degrees is +Y, pitch +90 degrees is -X (aft, the mount's up was said to be aft)",
        near(S.dirAt(DORSAL, 0, 0), [0, 0, 1], 1e-12) && near(S.dirAt(DORSAL, PI / 2, 0), [0, 1, 0], 1e-12) && near(S.dirAt(DORSAL, 0, PI / 2), [-1, 0, 0], 1e-12));
    const rng = mulberry(5), slant = S.makeSeat({ id: "slant", mount: [0, 0, 0], rest: [1, -1, 0.5], slew: { yaw: 1, pitch: 1 } });
    let worstRound = 0, worstLen = 0;
    for (const seat of [FWD, VENTRAL, DORSAL, slant]) for (let i = 0; i < 225; i++) {
        const yaw = (rng() * 2 - 1) * 3, pitch = (rng() * 2 - 1) * 1.45, d = S.dirAt(seat, yaw, pitch), a = S.anglesOf(seat, d);
        worstRound = Math.max(worstRound, Math.abs(a.yaw - yaw), Math.abs(a.pitch - pitch)); worstLen = Math.max(worstLen, Math.abs(norm(d) - 1));
    }
    ok("!! dirAt and anglesOf are inverses: 900 random (yaw, pitch) over four seats (a slanted rest too) come back to 1e-9, every direction a unit vector", worstRound < 1e-9 && worstLen < 1e-12, `${worstRound.toExponential(1)} ${worstLen.toExponential(1)}`);
    const skew = S.makeSeat({ id: "skew", mount: [0, 0, 0], rest: [1, 0, 0], up: [0.3, 0, 1], slew: { yaw: 1, pitch: 1 } });
    ok("an `up` that is not perpendicular to `rest` is made so: the three axes are orthonormal, and the pitch axis still points to the side `up` was on",
        Math.abs(dot(skew.rest, skew.left)) < 1e-12 && Math.abs(dot(skew.rest, skew.upv)) < 1e-12 && Math.abs(dot(skew.left, skew.upv)) < 1e-12 && Math.abs(norm(skew.upv) - 1) < 1e-12 && dot(skew.upv, [0.3, 0, 1]) > 0 && near(skew.left, [0, 1, 0], 1e-12));
}

console.log("\n2. THE ARC");
{
    const A = S.makeSeat({ id: "a", mount: [0, 0, 0], rest: [1, 0, 0], arc: { yaw: [-1, 0.5], pitch: [-0.2, 0.8] }, slew: { yaw: 1, pitch: 1 } }), e = 1e-6;
    ok("!! the edges are IN and a hair (1e-6 rad) outside any edge is OUT, on each of the four", S.inArc(A, -1, -0.2) && S.inArc(A, 0.5, 0.8) && S.inArc(A, 0, 0) && !S.inArc(A, -1 - e, 0) && !S.inArc(A, 0.5 + e, 0) && !S.inArc(A, 0, -0.2 - e) && !S.inArc(A, 0, 0.8 + e));
    const c1 = S.clampToArc(A, 2, -1), c2 = S.clampToArc(A, -3, 0.3), c3 = S.clampToArc(A, 0.1, 0.1);
    ok("clampToArc takes each angle to the nearer edge and leaves an inside angle alone", c1.yaw === 0.5 && c1.pitch === -0.2 && c2.yaw === -1 && c2.pitch === 0.3 && c3.yaw === 0.1 && c3.pitch === 0.1);
    const rng = mulberry(11); let n = 0, wrong = 0, up = 0, down = 0;
    for (let i = 0; i < 600; i++) {
        const d = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]; if (Math.abs(d[2]) < 1e-3 || norm(d) < 0.1) continue;
        const a = S.anglesOf(VENTRAL, d), reach = S.inArc(VENTRAL, a.yaw, a.pitch), d2 = S.anglesOf(DORSAL, d), reach2 = S.inArc(DORSAL, d2.yaw, d2.pitch);
        n++; if (reach !== (d[2] < 0)) wrong++; if (reach2 !== (d[2] > 0)) wrong++; if (reach) down++; if (reach2) up++;
    }
    ok("!! a hemisphere seat reaches EXACTLY the hemisphere its rest axis points into: of 600 random directions the ventral turret reaches the ones with z < 0 and the dorsal one those with z > 0 (no exceptions, both halves occur)", wrong === 0 && n > 500 && down > 100 && up > 100, `${n} directions, ${wrong} wrong, ${down} below, ${up} above`);
}

console.log("\n3. THE SLEW");
{
    const T = S.makeSeat({ id: "t", mount: [0, 0, 0], rest: [1, 0, 0], arc: { yaw: [-3, 3], pitch: [-1.5, 1.5] }, slew: { yaw: 0.5, pitch: 0.2 } }), b = body0();
    const run = (dt, seconds, cmd, from = S.createSeatState(T)) => { let st = from; for (let i = 0; i < Math.round(seconds / dt); i++) st = S.stepSeat(T, st, b, cmd, dt).state; return st; };
    const a = run(1 / 30, 1, { yaw: 1, pitch: 1 });
    ok("!! a seat turns toward its command at ITS RATE ON EACH AXIS: in one second yaw has moved 0.5 rad and pitch 0.2 (not 1, not the same)", Math.abs(a.yaw - 0.5) < 1e-12 && Math.abs(a.pitch - 0.2) < 1e-12, `${a.yaw}, ${a.pitch}`);
    const t1 = run(1 / 30, 1, { yaw: 1, pitch: 1 }), t2 = run(1 / 60, 1, { yaw: 1, pitch: 1 }), t3 = run(1 / 8, 1, { yaw: 1, pitch: 1 });
    ok("...the same in a second at 1/30, 1/60 and 1/8 s ticks", [t1, t2, t3].every((s) => Math.abs(s.yaw - 0.5) < 1e-12 && Math.abs(s.pitch - 0.2) < 1e-12));
    let st = S.createSeatState(T), over = 0, arrivedAt = null;
    for (let i = 0; i < 300; i++) { st = S.stepSeat(T, st, b, { yaw: 1, pitch: 1 }, 1 / 30).state; over = Math.max(over, st.yaw - 1, st.pitch - 1); if (arrivedAt === null && st.yaw === 1) arrivedAt = i + 1; }
    ok("!! it ARRIVES and does not overshoot: yaw is exactly 1 after 2 s (60 ticks), pitch is 1 after 5 s, and neither ever went past", st.yaw === 1 && st.pitch === 1 && over <= 0 && arrivedAt === 60, `arrived at tick ${arrivedAt}, overshoot ${over}`);
    const neg = run(1 / 30, 1, { yaw: -1, pitch: -1 });
    ok("...and it turns the other way for a negative command", Math.abs(neg.yaw + 0.5) < 1e-12 && Math.abs(neg.pitch + 0.2) < 1e-12);
    const edge = run(1 / 30, 10, { yaw: 10, pitch: -9 });
    ok("!! a command PAST THE ARC is a command for the edge: yaw 10 stops at the arc's 3, pitch -9 at -1.5", edge.yaw === 3 && edge.pitch === -1.5, `${edge.yaw}, ${edge.pitch}`);
    const held = S.stepSeat(T, { yaw: 0.3, pitch: -0.2, gun: G.createGun() }, b, { fire: false }, 1 / 30).state;
    const nan = S.stepSeat(T, { yaw: 0.3, pitch: -0.2, gun: G.createGun() }, b, { yaw: NaN, pitch: undefined, fire: false }, 1 / 30).state;
    ok("a command without an angle (undefined, NaN) holds the seat where it is", held.yaw === 0.3 && held.pitch === -0.2 && nan.yaw === 0.3 && nan.pitch === -0.2);
}

console.log("\n4. THE MUZZLE");
{
    const seat = S.makeSeat({ id: "m", mount: [3, 0, 1], rest: [1, 0, 0], arc: { yaw: [-3, 3], pitch: [-1.5, 1.5] }, slew: { yaw: 1, pitch: 1 }, reach: 1.5 }), y = 0.4, p = 0.2, st = { yaw: y, pitch: p, gun: G.createGun() };
    const m = S.muzzleOfSeat(seat, st, body0()), d = [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p)];
    ok("!! on a body at the origin pointing east (identity), the muzzle is the body's position plus the mount plus `reach` along the gun, the gun a unit vector, the velocity the body's", near(m.pos, [10 + 3 + 1.5 * d[0], 20 + 1.5 * d[1], 300 + 1 + 1.5 * d[2]], 1e-12) && near(m.dir, d, 1e-12) && near(m.vel, [50, 0, 0], 1e-12), `${m.pos.map((v) => v.toFixed(3))}`);
    const east = F.createState({ pos: [0, 0, 300], speed: 50, heading: PI / 2 }), mw = S.muzzleOfSeat(seat, st, east);
    ok("!! on a body heading 90 degrees to the right (nose to world -Y) body-left is world +X: the gun is (sin y, -cos y, 0) rotated up by p, the mount (3, 0, 1) is at (0, -3, 1) from the centre",
        near(mw.dir, [Math.cos(p) * Math.sin(y), -Math.cos(p) * Math.cos(y), Math.sin(p)], 1e-9) && near(mw.pos, [1.5 * mw.dir[0], -3 + 1.5 * mw.dir[1], 300 + 1 + 1.5 * mw.dir[2]], 1e-9) && near(mw.vel, [0, -50, 0], 1e-9), `${mw.dir.map((v) => v.toFixed(3))}`);
    const inv = F.createState({ pos: [0, 0, 300], speed: 50, heading: 0, bank: PI }), mi = S.muzzleOfSeat(VENTRAL, { yaw: 0, pitch: 0, gun: G.createGun() }, inv);
    ok("!! on an INVERTED body (bank 180 degrees) a ventral turret points at the sky and its mount hangs above the centre: dir (0,0,1), position (0, 0, 300 + 1 mount + 1 reach)", near(mi.dir, [0, 0, 1], 1e-9) && near(mi.pos, [0, 0, 302], 1e-9), `${mi.dir.map((v) => v.toFixed(3))} ${mi.pos.map((v) => v.toFixed(3))}`);
    const tail = S.makeSeat({ id: "tail", mount: [-10, 0, 0], rest: [-1, 0, 0], slew: { yaw: 1, pitch: 1 }, reach: 0 }), yawing = body0({ vel: [50, 0, 0], w: [0, 0, -1] });
    const mt = S.muzzleOfSeat(tail, { yaw: 0, pitch: 0, gun: G.createGun() }, yawing);
    ok("!! a TAIL position on a body yawing right at 1 rad/s swings LEFT at 10 m/s (w x r with r = (-10, 0, 0)): the muzzle's velocity is (50, 10, 0)", near(mt.vel, [50, 10, 0], 1e-12), `${mt.vel}`);
    const side = S.makeSeat({ id: "side", mount: [-10, 0, 0], rest: [0, 1, 0], slew: { yaw: 1, pitch: 1 }, reach: 2 }), ms = S.muzzleOfSeat(side, { yaw: 0, pitch: 0, gun: G.createGun() }, yawing);
    ok("...and the GUN's reach is in the lever arm too: a muzzle 2 m out to the left of that mount is at r = (-10, 2, 0), w x r = (2, 10, 0), so the velocity is (52, 10, 0)", near(ms.vel, [52, 10, 0], 1e-12), `${ms.vel}`);
    const rot = F.createState({ pos: [0, 0, 300], speed: 50, heading: PI / 2, w: [0, 0, -1] }), mr = S.muzzleOfSeat(tail, { yaw: 0, pitch: 0, gun: G.createGun() }, rot);
    ok("!! w is the BODY's: the same tail position on the body heading to world -Y, spin in its body frame, has its velocity (10, -50, 0) in the world (the tail swings to world +X)", near(mr.vel, [10, -50, 0], 1e-9), `${mr.vel.map((v) => v.toFixed(3))}`);
}

console.log("\n5. THE ROUND");
{
    const seat = S.makeSeat({ id: "r", mount: [3, 0, 1], rest: [1, 0, 0], arc: { yaw: [-3, 3], pitch: [-1.5, 1.5] }, slew: { yaw: 0.5, pitch: 0.5 }, reach: 1.5 });
    const burst = (dt, seconds) => { let st = S.createSeatState(seat), n = 0, first = null; for (let i = 0; i < Math.round(seconds / dt); i++) { const o = S.stepSeat(seat, st, body0(), { yaw: 0, pitch: 0, fire: true }, dt, 7); st = o.state; n += o.rounds.length; if (!first && o.rounds.length) first = o.rounds[0]; } return { n, st, first }; };
    const a = burst(1 / 30, 2), b = burst(1 / 60, 2), c = burst(1 / 7, 2);
    ok("!! 15 rounds a second AT ANY TICK LENGTH through the seat: two seconds of trigger is 30 rounds at 1/30, 1/60 and 1/7 s, and the magazine is 30 lighter", a.n === 30 && b.n === 30 && c.n === 30 && a.st.gun.ammo === 270, `${a.n} ${b.n} ${c.n}, ammo ${a.st.gun.ammo}`);
    ok("a round leaves at the muzzle with the body's velocity plus the muzzle speed (300 m/s) along the gun, age 0, and carries the owner it was given", near(a.first.vel, [350, 0, 0], 1e-9) && near(a.first.pos, [10 + 3 + 1.5, 20, 301], 1e-9) && a.first.age === 0 && a.first.owner === 7, `${a.first.vel}`);
    const o = S.stepSeat(seat, S.createSeatState(seat), body0({ vel: [0, 0, 0] }), { yaw: 1, pitch: 0, fire: true }, 0.1), r = o.rounds[0], want = S.dirAt(seat, 0.05, 0);
    ok("!! a round is fired FROM WHERE THE SEAT POINTS AFTER THE TICK'S SLEW: commanded to yaw 1 but slewing at 0.5 rad/s for 0.1 s, the round goes along yaw 0.05 (not 1, not 0)", o.rounds.length === 1 && Math.abs(o.state.yaw - 0.05) < 1e-12 && near(r.vel, want.map((v) => 300 * v), 1e-9), `${r && r.vel.map((v) => v.toFixed(2))}`);
    const small = S.makeSeat({ id: "small", mount: [0, 0, 0], rest: [1, 0, 0], slew: { yaw: 1, pitch: 1 }, gun: { ...G.GUN, magazine: 5 } });
    let st = S.createSeatState(small), n = 0; for (let i = 0; i < 90; i++) { const q = S.stepSeat(small, st, body0(), { yaw: 0, pitch: 0, fire: true }, 1 / 30); st = q.state; n += q.rounds.length; }
    ok("!! the magazine is the SEAT'S: a seat with 5 rounds fires exactly 5 in three seconds of trigger, and has 0 left", n === 5 && st.gun.ammo === 0, `${n}`);
    const fast = S.makeSeat({ id: "fast", mount: [0, 0, 0], rest: [1, 0, 0], slew: { yaw: 1, pitch: 1 }, gun: { ...G.GUN, muzzleSpeed: 800, rate: 5, magazine: 40 } });
    let sf = S.createSeatState(fast), nf = 0, speed = 0; for (let i = 0; i < 60; i++) { const q = S.stepSeat(fast, sf, body0({ vel: [0, 0, 0] }), { yaw: 0, pitch: 0, fire: true }, 1 / 30); sf = q.state; nf += q.rounds.length; if (q.rounds[0]) speed = norm(q.rounds[0].vel); }
    ok("...and so are the muzzle speed and the rate: an 800 m/s gun at 5 rounds a second fires 10 rounds in two seconds, each leaving at 800 m/s", nf === 10 && Math.abs(speed - 800) < 1e-9, `${nf} rounds, ${speed}`);
    let idle = S.stepSeat(seat, S.createSeatState(seat), body0(), { yaw: 0, pitch: 0, fire: true }, 0.04).state; for (let i = 0; i < 30; i++) idle = S.stepSeat(seat, idle, body0(), { yaw: 0, pitch: 0, fire: false }, 1 / 30).state;
    ok("nothing is banked while the trigger is up (a 0.04 s tap then a second of idle leaves no credit)", idle.gun.credit === 0 && idle.gun.ammo === 300);
    const s0 = S.createSeatState(seat), snap = JSON.stringify(s0), bd = body0(), bsnap = JSON.stringify(bd), out = S.stepSeat(seat, s0, bd, { yaw: 1, pitch: 1, fire: true }, 0.2);
    ok("a state is a VALUE: stepSeat edits neither the state nor the body it was handed, and what it returns is frozen", JSON.stringify(s0) === snap && JSON.stringify(bd) === bsnap && Object.isFrozen(out.state) && Object.isFrozen(s0) && s0.yaw === 0);
}

console.log("\n6. THE REACH");
{
    const rng = mulberry(31); let worst = 0, outside = 0, n = 0;
    for (const seat of [FWD, VENTRAL]) for (let i = 0; i < 200; i++) {
        const b = F.createState({ pos: [0, 0, 300], speed: 50, heading: (rng() - 0.5) * 6, pitch: (rng() - 0.5) * 2, bank: (rng() - 0.5) * 6 });
        const lim = seat === VENTRAL ? PI / 2 - 0.02 : 1.4, yaw = (rng() * 2 - 1) * lim, pitch = (rng() * 2 - 1) * lim, m = S.muzzleOfSeat(seat, { yaw, pitch, gun: G.createGun() }, b), r = S.reachOf(seat, b, m.dir);
        worst = Math.max(worst, Math.abs(r.yaw - yaw), Math.abs(r.pitch - pitch)); n++; if (!r.inArc) outside++;
    }
    ok("!! reachOf is the inverse of muzzleOfSeat's dir: 400 random attitudes (any heading, bank) and angles come back to 1e-9, every one inside the arc", worst < 1e-9 && outside === 0 && n === 400, `${worst.toExponential(1)}, ${outside} outside`);
    const level = F.createState({ pos: [0, 0, 300], speed: 50 }), inv = F.createState({ pos: [0, 0, 300], speed: 50, bank: PI });
    ok("!! a ventral ball turret reaches the world's DOWN when the aircraft is level and its UP when inverted, never the other",
        S.reachOf(VENTRAL, level, [0, 0, -1]).inArc && !S.reachOf(VENTRAL, level, [0, 0, 1]).inArc && S.reachOf(VENTRAL, inv, [0, 0, 1]).inArc && !S.reachOf(VENTRAL, inv, [0, 0, -1]).inArc);
}

// the gunner's world: a ball seat at the centre of a body that sits still (or moves), a target on a path
const BALL = S.makeSeat({ id: "ball2", mount: [0, 0, 0], rest: [1, 0, 0], arc: { yaw: [-PI, PI], pitch: [-1.5, 1.5] }, slew: { yaw: 6, pitch: 6 }, reach: 1.5 });
const still = { pos: [0, 0, 300], vel: [0, 0, 0], q: ID, w: [0, 0, 0] };
const rest0 = S.createSeatState(BALL);

console.log("\n7. THE GUNNER");
{
    const tgt = (t) => ({ id: "x", pos: [200 + 0 * t, 50 - 30 * t, 300], vel: [0, -30, 0] });
    const g = S.handGunner({ delay: 0.25, sigma: 0 });
    let first = null, before = true;
    for (let i = 0; i < 20; i++) { const t = i / 30, d = g(BALL, rest0, still, [tgt(t)], t); if (d.target === null) { if (first !== null) before = false; } else if (first === null) first = i; else if (d.target !== "x") before = false; if (d.target === null && (d.yaw !== 0 || d.pitch !== 0 || d.fire)) before = false; }
    ok("!! the gunner does not act on a target until `delay` (0.25 s) after it came in: nothing for ticks 0..7 (the rest position, no fire), a target from tick 8 (t = 0.267 s, the first tick at or past 0.25 s)", first === 8 && before, `first target at tick ${first}`);
    const far = (t) => ({ id: "x", pos: t < 1.5 && t >= 1.0 ? [900, 0, 300] : [200, 50 - 30 * (t % 1), 300], vel: [0, -30, 0] });
    const g2 = S.handGunner({ delay: 0.25, sigma: 0 }); let again = null, seen = [];
    for (let i = 0; i <= 60; i++) { const t = i / 30, d = g2(BALL, rest0, still, [far(t)], t); seen.push(d.target); if (t >= 1.5 && again === null && d.target) again = i; }
    ok("!! ...and again after it LEFT RANGE AND CAME BACK: out to 900 m at t = 1.0..1.5, so the gunner is blind from 1.0 s and acts again at tick 53 (t = 1.767 s), not at 45", seen[44] === null && again === 53 && seen[29] === "x", `again at ${again}`);

    // a target that holds its velocity is predicted exactly whatever the delay
    const cv = (t) => ({ id: "x", pos: [220, -40 + 25 * t, 310], vel: [-5, 25, 0], radius: 4 });
    const cv0 = (t) => ({ ...cv(t), pos: [220 - 5 * t, -40 + 25 * t, 310] });
    const g0 = S.handGunner({ delay: 0, sigma: 0 }), g5 = S.handGunner({ delay: 0.5, sigma: 0 }); let d0, d5;
    for (let i = 0; i <= 45; i++) { const t = i / 30; d0 = g0(BALL, rest0, still, [cv0(t)], t); d5 = g5(BALL, rest0, still, [cv0(t)], t); }
    const t = 45 / 30, cur = S.muzzleOfSeat(BALL, rest0, still), sol = G.aimSolution(cur, cv0(t).pos, cv0(t).vel, BALL.gun), ref = S.reachOf(BALL, still, sol.dir);
    ok("!! a target that HOLDS ITS VELOCITY is predicted exactly whatever the delay: delay 0.5 and delay 0 give the same (yaw, pitch) at 1e-9, and it is flightGuns.aimSolution's by hand", Math.abs(d5.yaw - d0.yaw) < 1e-9 && Math.abs(d5.pitch - d0.pitch) < 1e-9 && Math.abs(d0.yaw - ref.yaw) < 1e-9 && Math.abs(d0.pitch - ref.pitch) < 1e-9, `${d5.yaw}, ${d0.yaw}, ${ref.yaw}`);

    // a target that turned costs the stale picture
    const p1 = (t) => [220 - 5 * t, -40 + 25 * t, 310], v1 = [-5, 25, 0], v2 = [-5, 5, 0];
    const turned = (t) => t < 1.0 ? { id: "x", pos: p1(t), vel: v1 } : { id: "x", pos: [p1(1)[0] + v2[0] * (t - 1), p1(1)[1] + v2[1] * (t - 1), 310], vel: v2 };
    const h0 = S.handGunner({ delay: 0, sigma: 0 }), h5 = S.handGunner({ delay: 0.5, sigma: 0 }); let e0, e5;
    for (let i = 0; i <= 33; i++) { const tt = i / 30; e0 = h0(BALL, rest0, still, [turned(tt)], tt); e5 = h5(BALL, rest0, still, [turned(tt)], tt); }
    const tn = 33 / 30, tOld = 18 / 30, stale = [p1(tOld)[0] + v1[0] * (tn - tOld), p1(tOld)[1] + v1[1] * (tn - tOld), 310], sTrue = G.aimSolution(cur, turned(tn).pos, v2, BALL.gun), sStale = G.aimSolution(cur, stale, v1, BALL.gun);
    const rt = S.reachOf(BALL, still, sTrue.dir), rs = S.reachOf(BALL, still, sStale.dir);
    ok("!! a target that TURNED 0.1 s ago costs the gunner its stale picture: delay 0 points at the true solution, delay 0.5 at the one made from the picture of 0.6 s carried forward at the old velocity (both by hand, 1e-9), and the two differ",
        Math.abs(e0.yaw - rt.yaw) < 1e-9 && Math.abs(e5.yaw - rs.yaw) < 1e-9 && Math.abs(e5.pitch - rs.pitch) < 1e-9 && Math.abs(e5.yaw - e0.yaw) > 1e-3, `${e0.yaw.toFixed(4)} vs ${e5.yaw.toFixed(4)}`);

    // choosing
    const near_ = { id: "near", pos: [150, 40, 300], vel: [0, 0, 0] }, far_ = { id: "far", pos: [400, -100, 300], vel: [0, 0, 0] };
    const gp = () => S.handGunner({ delay: 0, sigma: 0 });
    ok("!! it picks the target a round reaches SOONEST: the near one of two, whichever order they are listed in", gp()(BALL, rest0, still, [near_, far_], 0).target === "near" && gp()(BALL, rest0, still, [far_, near_], 0).target === "near");
    const FW = S.makeSeat({ id: "fw", mount: [0, 0, 0], rest: [1, 0, 0], arc: { yaw: [-0.5, 0.5], pitch: [-0.5, 0.5] }, slew: { yaw: 6, pitch: 6 }, reach: 1.5 });
    const behind = { id: "behind", pos: [-80, 0, 300], vel: [0, 0, 0] }, front = { id: "front", pos: [350, 20, 300], vel: [0, 0, 0] };
    ok("!! a target OUTSIDE THE ARC is not shot at though it is nearest: the nearer one is behind a forward seat, the farther ahead -- it takes the farther; alone, the one behind is the rest position", gp()(FW, rest0, still, [behind, front], 0).target === "front" && gp()(FW, rest0, still, [behind], 0).target === null);
    const out = { id: "out", pos: [500, 0, 300], vel: [0, 0, 0] }, within = { id: "in", pos: [440, 0, 300], vel: [0, 0, 0] };
    ok("!! beyond `maxRange` (450 m, from the body's centre) it does not shoot: 500 m is ignored, 440 m is taken", gp()(BALL, rest0, still, [out], 0).target === null && gp()(BALL, rest0, still, [within], 0).target === "in");
    const none = gp()(BALL, { yaw: 0.7, pitch: 0.2, gun: G.createGun() }, still, [], 0), idleAfter = gp()(BALL, { yaw: 0.7, pitch: 0.2, gun: G.createGun() }, still, [out], 0);
    ok("!! with nothing to shoot at it returns the gun to REST (a seat that was turned to 0.7 rad is told to go back to 0, 0), no fire, no target; so does a target out of range", none.yaw === 0 && none.pitch === 0 && none.fire === false && none.target === null && idleAfter.yaw === 0 && idleAfter.pitch === 0 && idleAfter.fire === false);

    // the trigger: for the gun as it points NOW
    const stat = { id: "s", pos: [300, 0, 300], vel: [0, 0, 0] }, sol2 = G.aimSolution(S.muzzleOfSeat(BALL, rest0, still), stat.pos, stat.vel, BALL.gun), ang = S.reachOf(BALL, still, sol2.dir);
    const fireAt = (dy, o = {}, tg = stat) => { const g = S.handGunner({ delay: 0, sigma: 0, ...o }); const st = { yaw: ang.yaw + dy, pitch: ang.pitch, gun: G.createGun() }; return g(BALL, st, still, [tg], 0).fire; };
    ok("!! the trigger is pulled when the gun as it points NOW would miss by no more than a radius: on the solution it fires, 0.005 rad off (1.5 m at 300 m) it fires, 0.02 rad off (6 m) it does not",
        fireAt(0) && fireAt(0.005) && fireAt(-0.005) && !fireAt(0.02) && !fireAt(-0.02), `solution t = ${sol2.t.toFixed(3)} s`);
    ok("...`tolerance` 2 widens it (0.02 rad is 6 m, inside 2 radii) and a target's own `radius` does (10 m: still fires)", fireAt(0.02, { tolerance: 2 }) && fireAt(0.02, {}, { ...stat, radius: 10 }) && !fireAt(0.05, { tolerance: 2 }));

    // aim error
    const errs = [], errp = [];
    for (let i = 0; i < 400; i++) { const t = i / 30, ge = S.handGunner({ delay: 0, sigma: 0.01, seed: 3 }), g0_ = S.handGunner({ delay: 0, sigma: 0, seed: 3 }); const a = ge(BALL, rest0, still, [stat], t), b = g0_(BALL, rest0, still, [stat], t); errs.push(a.yaw - b.yaw); errp.push(a.pitch - b.pitch); }
    const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length), mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    ok("!! the aim error is a Gaussian of the asked sigma, on each axis: over 400 ticks the rms is 0.01 within 15% (yaw and pitch), the mean about 0 (under 0.002)", Math.abs(rms(errs) / 0.01 - 1) < 0.15 && Math.abs(rms(errp) / 0.01 - 1) < 0.15 && Math.abs(mean(errs)) < 0.002 && Math.abs(mean(errp)) < 0.002, `rms ${rms(errs).toFixed(4)} ${rms(errp).toFixed(4)}, mean ${mean(errs).toExponential(1)}`);
    const dd = (seed, seat, t) => S.handGunner({ delay: 0, sigma: 0.01, seed })(seat, rest0, still, [stat], t);
    const BALL_B = S.makeSeat({ id: "other", mount: [0, 0, 0], rest: [1, 0, 0], arc: { yaw: [-PI, PI], pitch: [-1.5, 1.5] }, slew: { yaw: 6, pitch: 6 }, reach: 1.5 });
    const a1 = dd(3, BALL, 0.5), a2 = dd(3, BALL, 0.5);
    ok("!! the error is REPEATABLE (the same seed, seat and time give the same answer) and differs by seed, by seat and by time", a1.yaw === a2.yaw && a1.pitch === a2.pitch && dd(4, BALL, 0.5).yaw !== a1.yaw && dd(3, BALL_B, 0.5).yaw !== a1.yaw && dd(3, BALL, 0.6).yaw !== a1.yaw);
}

console.log("\n8. END TO END");
{
    // a duel through the seat: the gunner decides, the seat slews and fires, the rounds fly and are tested against the target by flightGuns.stepRounds
    function duel({ seat, gunner, body, target, T = 6, dt = 1 / 30 }) {
        let st = S.createSeatState(seat), rounds = [], hits = 0, fired = 0, firstHit = null;
        for (let i = 0; i < Math.round(T / dt); i++) {
            const t = i * dt, b = body(t), tg = target(t), d = gunner(seat, st, b, [{ id: 2, pos: tg.pos, vel: tg.vel, radius: G.GUN.hitRadius }], t);
            const out = S.stepSeat(seat, st, b, d, dt, 1); st = out.state; fired += out.rounds.length;
            const nx = target(t + dt), res = G.stepRounds([...rounds, ...out.rounds], dt, [{ id: 2, from: tg.pos, to: nx.pos, radius: G.GUN.hitRadius }]);
            rounds = res.rounds; hits += res.hits.length; if (res.hits.length && firstHit === null) firstHit = t;
        }
        return { hits, fired, firstHit };
    }
    const cross = (t) => ({ pos: [250, -150 + 60 * t, 300], vel: [0, 60, 0] });
    const slow = S.makeSeat({ id: "slow", mount: [0, 0, 0], rest: [1, 0, 0], arc: { yaw: [-PI, PI], pitch: [-1.5, 1.5] }, slew: { yaw: 0.05, pitch: 0.05 }, reach: 1.5 });
    const still_ = () => still;
    const perfect = duel({ seat: BALL, gunner: S.handGunner({ delay: 0, sigma: 0 }), body: still_, target: cross });
    ok("!! a perfect gunner (no delay, no error) on a fixed seat HITS a target crossing at 60 m/s at 250 m: at least 8 hits in 6 s", perfect.hits >= 8, `${perfect.hits} hits from ${perfect.fired} rounds, the first at ${perfect.firstHit}`);
    const crossBehind = (t) => ({ pos: [-250, -150 + 60 * t, 300], vel: [0, 60, 0] });
    const behindFast = duel({ seat: BALL, gunner: S.handGunner({ delay: 0, sigma: 0 }), body: still_, target: crossBehind });
    const behindSlow = duel({ seat: slow, gunner: S.handGunner({ delay: 0, sigma: 0 }), body: still_, target: crossBehind });
    ok("!! the same target crossing BEHIND the seat: a ball turret that turns 6 rad/s hits it as before (at least 8 hits) and one that turns 0.05 rad/s (0.3 rad in the 6 s, against a bearing 3 rad round) cannot get a gun to it, so hits nothing and does not fire",
        behindFast.hits >= 8 && behindSlow.hits === 0 && behindSlow.fired === 0, `${behindFast.hits} hits against ${behindSlow.hits} hits, ${behindSlow.fired} rounds fired`);
    const slowed = duel({ seat: slow, gunner: S.handGunner({ delay: 0, sigma: 0 }), body: still_, target: cross });
    ok("!! ...and a slow seat is not a blind one: on the target that crosses its own line of fire (the nose, where it rests) it shoots as the target passes through and no other time -- at most 4 rounds, every one fired is a hit, and under a tenth of the perfect gunner's hits",
        slowed.fired <= 4 && slowed.hits === slowed.fired && slowed.hits * 10 < perfect.hits, `${slowed.hits} hits from ${slowed.fired} rounds, against ${perfect.hits}`);
    const sloppy = duel({ seat: BALL, gunner: S.handGunner({ delay: 0, sigma: 0.1, seed: 5 }), body: still_, target: cross });
    ok("!! a sloppy gunner (0.1 rad of aim error, 25 m at 250 m) hits less than half as often as a perfect one", sloppy.hits * 2 < perfect.hits, `${sloppy.hits} against ${perfect.hits}`);
    const lagged = duel({ seat: BALL, gunner: S.handGunner({ delay: 0.25, sigma: 0 }), body: still_, target: cross });
    ok("!! a gunner with a 0.25 s reaction hits a target that holds its velocity as a perfect one does, less the fire lost to the reaction time: at least 8 hits, and its first hit no earlier than the reaction", lagged.hits >= 8 && lagged.hits <= perfect.hits && lagged.firstHit >= perfect.firstHit, `${lagged.hits} against ${perfect.hits}, first at ${lagged.firstHit} vs ${perfect.firstHit}`);

    // a tail gunner on a bomber against a fighter closing from behind
    const bomber = (t) => ({ pos: [80 * t, 0, 1500], vel: [80, 0, 0], q: ID, w: [0, 0, 0] });
    const fighter = (t) => ({ pos: [80 * t - 320 + 30 * t, 25, 1530], vel: [110, 0, 0] });
    const TAIL = S.makeSeat({ id: "tail2", mount: [-12, 0, 2], rest: [-1, 0, 0], arc: { yaw: [-0.9, 0.9], pitch: [-0.7, 0.7] }, slew: { yaw: 2, pitch: 2 }, reach: 1.5 });
    const NOSE = S.makeSeat({ id: "nose2", mount: [10, 0, 0], rest: [1, 0, 0], arc: { yaw: [-0.9, 0.9], pitch: [-0.7, 0.7] }, slew: { yaw: 2, pitch: 2 }, reach: 1.5 });
    const aft = duel({ seat: TAIL, gunner: S.handGunner({ delay: 0, sigma: 0 }), body: bomber, target: fighter, T: 5 });
    const fwd = duel({ seat: NOSE, gunner: S.handGunner({ delay: 0, sigma: 0 }), body: bomber, target: fighter, T: 5 });
    ok("!! a TAIL gunner on a bomber at 80 m/s hits a fighter that closes at 30 m/s from 320 m behind and 30 m above: at least 5 hits in 5 s", aft.hits >= 5, `${aft.hits} hits from ${aft.fired} rounds`);
    ok("!! a FORWARD-ONLY seat on the same bomber cannot see it, and does not even fire", fwd.hits === 0 && fwd.fired === 0, `${fwd.hits} hits, ${fwd.fired} fired`);
}

console.log("\n9. THE FRONT DOOR");
{
    const throwsWith = (def, word) => { try { S.makeSeat(def); return false; } catch (e) { return String(e.message).includes(word); } };
    const base = { id: "x", mount: [0, 0, 0], rest: [1, 0, 0], slew: { yaw: 1, pitch: 1 } };
    ok("!! makeSeat refuses by name what cannot be built: no id, a NaN in the mount, an `up` parallel to `rest`, a slew of 0 (either axis), an arc that runs backwards (either axis)",
        throwsWith({ ...base, id: "" }, "id") && throwsWith({ ...base, mount: [0, NaN, 0] }, "mount") && throwsWith({ ...base, up: [2, 0, 0] }, "parallel") && throwsWith({ ...base, slew: { yaw: 0, pitch: 1 } }, "slew")
        && throwsWith({ ...base, slew: { yaw: 1, pitch: 0 } }, "slew") && throwsWith({ ...base, arc: { yaw: [1, -1], pitch: [-1, 1] } }, "arc") && throwsWith({ ...base, arc: { yaw: [-1, 1], pitch: [1, -1] } }, "arc"));
    const ok_ = S.makeSeat(base), zeroReach = S.makeSeat({ ...base, reach: 0 });
    ok("a seat with no `reach` has 1 m, one with a reach of 0 has 0 (not the default), and a seat with no name is named for its id", ok_.reach === 1 && zeroReach.reach === 0 && ok_.name === "x" && S.makeSeat({ ...base, name: "Tail" }).name === "Tail");
    ok("a seat is FROZEN all the way down (the seat, its vectors, its arc and slew), its gun defaults to flightGuns.GUN, up to the body's +Z and the arc to a full circle in yaw", Object.isFrozen(ok_) && Object.isFrozen(ok_.mount) && Object.isFrozen(ok_.rest) && Object.isFrozen(ok_.left) && Object.isFrozen(ok_.upv)
        && Object.isFrozen(ok_.arc) && Object.isFrozen(ok_.arc.yaw) && Object.isFrozen(ok_.arc.pitch) && Object.isFrozen(ok_.slew) && ok_.gun === G.GUN && near(ok_.upv, [0, 0, 1], 1e-12) && ok_.arc.yaw[0] === -PI && ok_.arc.yaw[1] === PI);
    ok("!! the export list is pinned: anglesOf, clampToArc, createSeatState, dirAt, handGunner, inArc, makeSeat, muzzleOfSeat, reachOf, reportLines, stepSeat", Object.keys(S).sort().join(",") === "anglesOf,clampToArc,createSeatState,dirAt,handGunner,inArc,makeSeat,muzzleOfSeat,reachOf,reportLines,stepSeat", Object.keys(S).sort().join(","));
    const lines = S.reportLines();
    ok("the report lines say real numbers (no NaN, no undefined) and name the seat model", lines.length >= 2 && lines.every((l) => typeof l === "string" && !/NaN|undefined/.test(l)) && /gun on a mount/.test(lines[0]) && /\+Y/.test(lines[1]), lines[1]);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
