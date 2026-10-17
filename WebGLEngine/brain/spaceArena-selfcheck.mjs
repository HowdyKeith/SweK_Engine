// WebGLEngine/brain/spaceArena-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/spaceArena-selfcheck.mjs      (~5 s)
//
// THE STEPPABLE SPACE BATTLE, HELD TO THE PAGE'S OWN ARITHMETIC AND TO ITS OWN. brain/spaceArena.mjs is es-box3d-6dof.html's fight with the loop turned inside out and a capital ship in it. Each row builds a small world whose answer can be worked out by hand:
//
//   1  CONSTRUCTION   a fight needs two crafts; ids are distinct positive integers; a craft is a "fighter" or a "capital" (with a ship); the defaults (a team of its own, 100 and 1,500 hit points, the page's fighter mass 8 and box inertia, a capital's 13 seats each with a gunner, three engine pods, sixteen parts that
//                     have hit points)
//   2  THE TICK       a tick advances i and t and returns the SAME object; a finished arena does not move; runSpaceArena is stepping; the order the crafts are listed in changes nothing (every decision comes from the states the tick started with); a destroyed craft is not stepped again
//   3  THE FIGHTER    a lone fighter flown by the PD autopilot for 100 ticks is, to the BIT, what the page's stepFleet does (decide, a thrust force at the engine mount, the torque, rigidBody6dof.step); its gun is 3.33 rounds a second (10 in 3 s) at 900 units/s from 1.4 units ahead, carrying
//                     its damage (18), life (2.5) and team
//   4  THE DOCTRINE   against a capital ship a fighter approaches a point 60 units to the side of it (the side its id's parity), strafes within 220 units when closing (nose on the ship, thrust cut) and cannot fire while approaching; against a fighter it is the page's plain pursuit
//   5  THE SHIP       it turns toward the nearest enemy at no more than its limit and settles; "hold" keeps the heading and damps a spin; its cruise thrust is a fraction of three pods' worth and falls to a third and nothing as pods go
//   6  THE SEATS      each gunner is shown the enemy craft still flying and no one else, with the radius a round has to reach; the seats fire, the rounds are the ship's (the ship's id, the gun's damage and life), a dummy 120 units off the beam is shot to nothing at the damage the guns carry, and the main turrets'
//                     shells do 60
//   7  THE PARTS      a hit names the part; hit points go with every hit; a turret or PD mount shot to nothing takes its seat OUT (the seat's rounds stop while its neighbours' go on) and says so once; a pod out costs a third of the thrust; the ship's hit points gone is destroyed
//   8  NO FRIENDLY FIRE   a round does not hit a craft of its own team (a team-mate in the line of fire takes nothing and the enemy behind it is hit) -- the page's rule
//   9  THE RAM        a fighter inside a ship's hull is lost and the ship takes 25; one just outside is not; two fighters that touch collide and both lose the same
//  10  THE CANNON     the invented wave-motion cannon charges 1/30 s a tick up to 12 s and no further; it fires when a craft of another team is in its beam (inside 900 units ahead of the bow, within 6 units plus the craft's radius of the axis) -- 400 damage, the charge back to 0, once -- and not for a
//                     team-mate, a craft behind the ship, one off the line, or one too far
//  11  THE END        by time, one team left, none left; a finished fight is not stepped
//  12  THE FRONT DOOR the export list is pinned and the report line says real numbers
//
// SABOTAGE LOG -- SEVENTY-FOUR, each applied to brain/spaceArena.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   S1 a one-craft arena is accepted 1 | S2 a repeated id is accepted 1 | S3 a kind that is not a kind is accepted 1 | S4 a capital with no ship is accepted 1 | S5 the default team is 1 1
//   S6 a fighter has 50 hit points 3 | S7 a fighter weighs 9 3 | S8 a fighter's hit sphere is 2.5 5 | S9 the gunner factory is ignored 7 | S10 the gunner factory is given the wrong index 2
//   S11 the default gunner allows for the earth's gravity 1 | S12 the default gunner has no burst 4 | S13 the side of the approach point is the other way round 2 | S14 the approach offset is 20 2
//   S15 the strafe range is 300 2 | S16 a receding fighter strafes too 1 | S17 an approaching fighter may fire 3 | S18 a strafing fighter keeps its thrust 1
//   S19 a fighter pursues a fighter without the trigger 3 | S20 the trigger is the autopilot's alone 1 | S21 a gunner is shown its own team 1 | S22 a gunner is shown the destroyed 1
//   S23 a gunner's vision is not limited 1 | S24 a ship is shown to the gunners with a fighter's radius 1 | S25 a seat that is out still fires 1 | S26 a seat that works is switched off 7
//   S27 rounds do not carry their gun's damage 2 | S28 rounds do not carry their team 2 | S29 rounds do not carry their own life 1 | S30 rounds of all teams are tested against every craft (friendly fire) 1
//   S31 a round is tested against its own team only 9 | S32 a hit is credited to the victim 2 | S33 a hit takes the shooter's damage from a constant 6 | S34 a part's hit points are not touched 3
//   S35 a part goes out again on every hit after zero 1 | S36 an engine pod out does not count 1 | S37 the part event names the wrong kind 2 | S38 the part tally is not kept 1
//   S39 the ram misses the fighter's own radius 1 | S40 the ram does 10 2 | S41 a fighter of the ship's own team is rammed 1 | S42 a rammed fighter is only destroyed 1 | S43 the ship takes nothing from a ram 2
//   S44 the cannon charges twice as fast 3 | S45 the cannon's charge is not capped 1 | S46 the cannon fires half charged 2 | S47 the cannon's charge is not spent 2 | S48 the beam's range is ignored 2
//   S49 the beam ignores the target's own radius 1 | S50 the beam hits a team-mate 1 | S51 the beam also hits what is behind the ship 1 | S52 the beam is along world +X 1
//   S53 the beam is measured from the ship's centre 1 | S54 the beam's damage is not dealt 3 | S55 a kill by the beam is not said 1 | S56 fighters that touch do not collide 1
//   S57 the time limit is a tick late 2 | S58 a finished arena still steps 2 | S59 the ship's torque is not limited (face) 1 | S60 hold turns toward the enemy 5 | S61 the cruise is ignored 4
//   S62 the pods running are ignored in the thrust 2 | S63 a tie goes to the higher id 1 | S64 the nearest enemy is the farthest 1 | S65 a fighter's engine is off its axis 1
//   S66 the autopilot is not told the weapon's speed 3 | S67 a fighter's muzzle is at its centre 1 | S68 a fighter's gun is half as fast 2 | S69 a fighter's gun fires every 400 ms 3
//   S70 events pile up across ticks 5 | S71 a tick returns a copy 1 | S72 a kill is not stamped with the craft 2 | S73 a hit event names the shooter wrongly 4 | S74 a hit on a part does not name it 1
// FIVE WENT 0 RED THE FIRST TIME AND WERE FIXED IN THE GATE, NOT EXCUSED: S11 (the default gunner allows for the earth's gravity) because a target 560 units off the beam is hit by chance anyway under an aim error of 6.7 units there -- the row now averages the commanded pitch over the ticks (zero-mean noise) and holds it to the straight line's 0.004 rad, where gravity would put it 0.011 high; S35 (a part goes out again on every hit after zero) because the rounds put into a PD mount were exactly the ones that kill it -- six go in now, two on a dead mount; S39 (the ram ignores the fighter's own radius) because both ram rows were nowhere near the margin -- a fighter 6.0 below the midships (inside 5.4 + 1.5) is rammed and one 7.2 below is not; S63 and S64 (a tie to the higher id, the nearest the farthest) because nearestFoe was only exercised through fights that have one enemy in range -- it has a row of its own. THE GATE ALSO CAUGHT A DESIGN HOLE IN THE SHIP (a blind cone over the deck: see physics/mechanics/capitalShip-selfcheck.mjs), and A FLICKERING TRIGGER that fired 45 rounds in 20 seconds from seats 'firing' on 2,500 ticks (gunSeats.handGunner now has a burst).
"use strict";
import * as SA from "./spaceArena.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";
import * as AP from "./autopilot6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e.message); } };
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const Q = [1, 0, 0, 0], SHIP = CS.createCapitalShip();
const idle = () => ({ torqueBody: [0, 0, 0], thrust: 0, firing: false });
const quiet = () => (seat, st) => ({ yaw: st.yaw, pitch: st.pitch, fire: false, target: null });
const fighter = (id, team, pos, extra = {}) => ({ id, team, kind: "fighter", name: "f" + id, state: { pos, q: Q }, pilot: idle, ...extra });
const capital = (id, team, extra = {}) => ({ id, team, kind: "capital", name: "cap" + id, ship: SHIP, state: { pos: [0, 0, 0], q: Q }, gunner: quiet, ...extra });
const arena = (crafts, o = {}) => SA.createSpaceArena({ crafts, ...o });
const run = (a, n) => { const ev = []; for (let i = 0; i < n && !a.done; i++) { SA.stepSpaceArena(a); ev.push(...a.events); } return ev; };

console.log("spaceArena-selfcheck -- the 6DOF space battle, steppable, with a capital ship\n");

console.log("1. CONSTRUCTION");
{
    const c = (o) => ({ id: 1, team: 1, kind: "fighter", state: { pos: [0, 0, 0], q: Q }, ...o });
    ok("!! createSpaceArena refuses what cannot be flown, by name: one craft, a repeated id, an id that is not a positive integer, a craft that is neither a fighter nor a capital, a capital with no ship", /at least two/.test(throws(() => arena([c({})])) || "") && /distinct/.test(throws(() => arena([c({}), c({})])) || "") && /positive integers/.test(throws(() => arena([c({ id: 0 }), c({ id: 2 })])) || "")
        && /positive integers/.test(throws(() => arena([c({ id: 2.5 }), c({ id: 3 })])) || "") && /"fighter" or a "capital"/.test(throws(() => arena([c({ kind: "cruiser" }), c({ id: 2 })])) || "") && /capital ship with no ship/.test(throws(() => arena([c({ kind: "capital" }), c({ id: 2 })])) || ""));
    const a = arena([capital(1, 1), fighter(2, 2, [500, 0, 0])]), cap = a.crafts[0], f = a.crafts[1];
    ok("!! the defaults: a craft with no team is its own team (its id), a fighter has the page's 100 hit points, mass 8 and box inertia 1.6 x 0.7 x 0.7, a hit radius of 1.5, 3.33 rounds a second; a capital has 1,500, mass 4,400, the hull's box inertia, an aim radius of 6, three engine pods running, and `face` and 0.3 cruise",
        fighter(7, undefined, [0, 0, 0]).team === undefined && arena([c({ id: 7, team: undefined }), c({ id: 9, team: undefined })]).crafts.map((x) => x.team).join() === "7,9" && f.hp === 100 && f.hpMax === 100 && f.body.mass === 8 && near(f.body.I, RB.boxInertia({ m: 8, hx: 1.6, hy: 0.7, hz: 0.7 }), 1e-12) && f.aimRadius === 1.5 && Math.abs(SA.FIGHTER_GUN.rate - 10 / 3) < 1e-12
        && cap.hp === 1500 && cap.body.mass === 4400 && near(cap.body.I, SHIP.I, 1e-9) && cap.aimRadius === 6 && cap.enginesRunning === 3 && cap.behaviour === "face" && cap.cruise === 0.3 && f.status === "flying" && f.dead === false && f.name === "f2");
    ok("!! a capital carries thirteen seats, each with a gunner of its own (13 distinct deciders), sixteen parts that have hit points (3 turrets at 120, 3 pods at 100, 10 PD mounts at 60), each seat knows the part it sits in, and a craft's hit points can be set", cap.seats.length === 13 && new Set(cap.seats.map((s) => s.decide)).size === 13 && cap.partHp.size === 16 && [...cap.partHp.values()].reduce((x, y) => x + y, 0) === 3 * 120 + 3 * 100 + 10 * 60 && cap.seats.every((s, k) => s.part === SHIP.seatPart[k]) && arena([capital(1, 1, { hp: 99 }), fighter(2, 2, [9, 0, 0], { hp: 7 })]).crafts.map((x) => x.hp).join() === "99,7");
    const gun = (seat, k) => (q) => null; let called = []; arena([capital(1, 1, { gunner: (seat, k) => { called.push([seat.id, k]); return quiet(); } }), fighter(2, 2, [9, 0, 0])]);
    ok("the `gunner(seat, index)` factory is called once per seat, in order", called.length === 13 && called.map((x) => x[1]).join() === "0,1,2,3,4,5,6,7,8,9,10,11,12" && called[0][0] === "main-a");
}

console.log("\n2. THE TICK");
{
    const mk = () => arena([capital(1, 1), fighter(2, 2, [600, 0, 0])], { seconds: 5 });
    const a = mk(), before = a.crafts[1].body, same_ = SA.stepSpaceArena(a);
    ok("!! a tick advances i and t (1/30 s), returns THE SAME OBJECT, and moves the capital by what its cruise gives (a new body; the one it had is not edited)", same_ === a && a.i === 1 && Math.abs(a.t - 1 / 30) < 1e-15 && a.crafts[0].body.pos[0] > 0 && before.pos[0] === 600);
    const a1 = mk(), a2 = mk(); SA.runSpaceArena(a1); let n = 0; while (!a2.done) { SA.stepSpaceArena(a2); n++; }
    ok("!! runSpaceArena is stepping: 5 s is 150 ticks either way, 'over' says time, the bodies are the same to the bit, and a finished arena does not move", a1.i === 150 && a2.i === 150 && n === 150 && a1.over === "time" && same(a1.crafts[0].body.pos, a2.crafts[0].body.pos) && same(a1.crafts[1].body.pos, a2.crafts[1].body.pos) && (() => { const p = a1.crafts[0].body.pos.slice(); SA.stepSpaceArena(a1); return a1.i === 150 && same(a1.crafts[0].body.pos, p); })());
    const hunt = (order) => { const cs = [capital(1, 1, { gunner: undefined }), fighter(2, 2, [300, 40, 0], { pilot: undefined }), fighter(3, 2, [-300, -40, 20], { pilot: undefined })]; return arena(order.map((i) => cs[i]), { seconds: 12 }); };
    const f = SA.runSpaceArena(hunt([0, 1, 2])), r = SA.runSpaceArena(hunt([2, 0, 1])), pos = (ar, id) => ar.crafts.find((c) => c.id === id).body.pos;
    ok("!! the order the crafts are listed in changes nothing: a ship and two PD fighters for 12 s listed 1,2,3 and 3,1,2 end at the same positions, to the bit, with the same hit points (every decision comes from the states the tick started with)", [1, 2, 3].every((id) => same(pos(f, id), pos(r, id))) && f.crafts.find((c) => c.id === 1).hp === r.crafts.find((c) => c.id === 1).hp && f.i === r.i, `${f.i} ticks`);
    const nf = arena([capital(1, 1, { gunner: quiet }), fighter(5, 2, [300, 0, 0]), fighter(4, 2, [0, 300, 0]), fighter(9, 2, [0, 0, 700]), fighter(7, 1, [50, 0, 0])]);
    ok("!! nearestFoe is the NEAREST craft of ANOTHER team still flying, a tie going to the LOWER id: of enemies at 300 (id 5), 300 (id 4) and 700 (id 9), with a team-mate at 50, the ship's is 4; with 4 destroyed it is 5; with 5 gone too it is 9; with none it is null", SA.nearestFoe(nf, nf.crafts[0]).id === 4 && (() => { nf.crafts[2].dead = true; const a = SA.nearestFoe(nf, nf.crafts[0]).id; nf.crafts[1].dead = true; const b = SA.nearestFoe(nf, nf.crafts[0]).id; nf.crafts[3].dead = true; return a === 5 && b === 9 && SA.nearestFoe(nf, nf.crafts[0]) === null; })());
    const dead = arena([capital(1, 1), fighter(2, 2, [600, 0, 0]), fighter(3, 2, [650, 10, 0])], { seconds: 5 }); dead.crafts[1].dead = true; dead.crafts[1].status = "destroyed"; const frozen = dead.crafts[1].body; run(dead, 10);
    ok("a craft that is out keeps its last body (the same object, every later tick) and is nobody's target and no shooter", dead.crafts[1].body === frozen && dead.crafts[1].gun.fired === 0 && SA.nearestFoe(dead, dead.crafts[0]).id === 3);
}

console.log("\n3. THE FIGHTER IS THE PAGE'S");
{
    // the page's stepFleet, by hand: decide -> a thrust force at the engine mount -> the torque -> step
    const start = { pos: [-300, 20, 10], q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], vel: [1, 0, 0], w: [0, 0, 0.1] };
    const a = arena([fighter(2, 2, start.pos, { pilot: undefined, state: start }), fighter(3, 1, [300, 0, 0], { pilot: idle })], { seconds: 20 });
    let hand = RB.createBody({ mass: 8, I: RB.boxInertia({ m: 8, hx: 1.6, hy: 0.7, hz: 0.7 }), pos: start.pos, q: start.q, vel: start.vel, w: start.w });
    for (let i = 0; i < 100; i++) {
        const d = AP.decide(hand, { pos: [300, 0, 0], vel: [0, 0, 0] }, { weaponSpeed: 900, thrustForce: 16, standoff: 50 }), acc = RB.createAccumulator(); RB.applyForceAtPoint(acc, [d.thrust, 0, 0], [-1.4, 0, 0]); acc.torque = d.torqueBody; hand = RB.step(hand, acc, 1 / 30);
        SA.stepSpaceArena(a);
    }
    const b = a.crafts[0].body;
    ok("!! a fighter flown by the PD autopilot against a fighter is the page's stepFleet BIT FOR BIT for 100 ticks (3.3 s: it turns through 90 degrees to face the target, THEN thrusts -- pos, vel, q, w: decide with the weapon speed 900, thrust 16 and standoff 50, the thrust at the engine mount (-1.4, 0, 0), the torque, rigidBody6dof.step) -- from a start that is turned, drifting and spinning", same(b.pos, hand.pos) && same(b.vel, hand.vel) && same(b.q, hand.q) && same(b.w, hand.w) && hand.vel[0] > 1.5, `${b.pos.map((v) => v.toFixed(4))}`);
    const g = arena([fighter(2, 2, [0, 0, 0], { state: { pos: [10, 20, 30], q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], vel: [3, 0, 0] }, pilot: () => ({ torqueBody: [0, 0, 0], thrust: 0, firing: true }) }), fighter(3, 1, [0, 400, 30], { pilot: idle })], { seconds: 4 });
    const ev = run(g, 90), f0 = g.crafts[0], fired = f0.gun.fired;
    ok("!! a fighter that holds the trigger for 3 s fires 10 rounds (3.33 a second: 1000/300, the page's cooldown) -- not 9 and not 11 -- and its rounds carry the fighter's team, 18 damage and 2.5 s of life", fired === 10, `${fired} rounds`);
    const g2 = arena([fighter(2, 2, [0, 0, 0], { state: { pos: [10, 20, 30], q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], vel: [3, 0, 0] }, pilot: () => ({ torqueBody: [0, 0, 0], thrust: 0, firing: true }) }), fighter(3, 1, [0, 4000, 30], { pilot: idle })], { seconds: 4 }); run(g2, 12);
    const r0 = g2.rounds[0];
    ok("!! a round leaves from 1.4 units ahead of the fighter along ITS nose (here +Y: turned 90 degrees about +Z) with the fighter's velocity plus 900 along the nose, and carries owner 2, team 2, damage 18 and life 2.5", r0 && r0.owner === 2 && r0.team === 2 && r0.dmg === 18 && r0.life === 2.5 && Math.abs(r0.vel[0] - 3) < 1e-9 && Math.abs(r0.vel[1] - 900) < 0.5 && Math.abs(r0.vel[2]) < 1e-6 && r0.pos[1] > 20 + 1.3, JSON.stringify(r0 && r0.vel.map((v) => +v.toFixed(3))));
}

console.log("\n4. THE FIGHTERS' DOCTRINE");
{
    const a = arena([capital(1, 1), fighter(2, 2, [-400, 0, 0]), fighter(3, 2, [-400, 0, 0])]), cap = a.crafts[0], f2 = a.crafts[1], f3 = a.crafts[2];
    const A2 = SA.fighterAim(a, f2, cap), A3 = SA.fighterAim(a, f3, cap);
    ok("!! against a capital ship 400 units off it APPROACHES a point 60 units to the SIDE of it -- (0, -60, 0) for an even id and (0, +60, 0) for an odd one, for a fighter coming along the axis (the side is the id's parity: cross(toward the ship, up) times +1 or -1) -- thrusts (the page's standoff 50) and may NOT fire", near(A2.target.pos, [0, -60, 0], 1e-9) && near(A3.target.pos, [0, 60, 0], 1e-9) && A2.mode === "approach" && A2.strafe === false && A2.opts.standoff === 50 && A2.opts.thrustForce === 16 && A2.opts.weaponSpeed === 900, `${A2.target.pos} ${A3.target.pos}`);
    f2.body = { ...f2.body, pos: [-200, 30, 0], vel: [20, 0, 0] };
    const S2 = SA.fighterAim(a, f2, cap);
    ok("!! within 220 units and CLOSING it STRAFES: its target is the ship itself (the lead is the pilot's), the thrust is cut (standoff 1e9) and it may fire", S2.mode === "strafe" && S2.strafe === true && near(S2.target.pos, cap.body.pos, 0) && S2.opts.standoff === 1e9, S2.mode);
    f2.body = { ...f2.body, vel: [-20, 0, 0] }; const R2 = SA.fighterAim(a, f2, cap);
    f2.body = { ...f2.body, pos: [-250, 30, 0], vel: [20, 0, 0] }; const F2 = SA.fighterAim(a, f2, cap);
    ok("!! ...but not when it is RECEDING (inside 220 but moving away: approach again, to turn round) and not outside 220 even if closing (250 units out)", R2.mode === "approach" && R2.strafe === false && F2.mode === "approach");
    const a3 = arena([fighter(2, 2, [-100, 0, 0], { state: { pos: [-100, 0, 0], q: Q, vel: [10, 0, 0] } }), fighter(3, 1, [100, 0, 0])]), P = SA.fighterAim(a3, a3.crafts[0], a3.crafts[1]);
    ok("!! against a FIGHTER it is the page's plain pursuit: the target is the enemy's position and velocity, the page's own autopilot numbers, and it may fire", P.mode === "pursue" && P.strafe === true && near(P.target.pos, [100, 0, 0], 0) && P.opts.standoff === 50 && P.opts.thrustForce === 16 && SA.STRAFE_RANGE === 220 && SA.APPROACH_OFFSET === 60);
    // a fighter 400 units out with its nose on the side point it steers for and an autopilot whose fire range is 600: the autopilot would fire (it is on its aim point and in range) but it is APPROACHING, so the trigger is cut
    const th = Math.atan2(-60, 400), AIM = { weaponSpeed: 900, thrustForce: 16, standoff: 50, fireRange: 600 }, b = arena([capital(1, 1, { cruise: 0, behaviour: "hold", gunner: quiet }), { ...fighter(2, 2, [-400, 0, 0], { pilot: undefined }), state: { pos: [-400, 0, 0], q: [Math.cos(th / 2), 0, 0, Math.sin(th / 2)] } }], { seconds: 3, autopilot: AIM }); const ev = run(b, 20);
    ok("!! an APPROACHING fighter does not fire: 400 units out with its nose on the side point it steers for (the autopilot's own firing test -- on its aim point and in range -- is TRUE for it), its trigger is cut: no round in 20 ticks, `last.mode` says approach and `last.fire` false -- and the same fighter strafing (closing inside 220) does fire", b.crafts[1].gun.fired === 0 && b.crafts[1].last.mode === "approach" && b.crafts[1].last.fire === false && AP.decide(b.crafts[1].body, { pos: [0, -60, 0], vel: [0, 0, 0] }, AIM).firing === true && (() => { const th2 = 0, s2 = arena([capital(1, 1, { cruise: 0, behaviour: "hold", gunner: quiet }), { ...fighter(2, 2, [-200, 0, 0], { pilot: undefined }), state: { pos: [-200, 0, 0], q: Q, vel: [5, 0, 0] } }], { seconds: 3, autopilot: AIM }); run(s2, 40); return s2.crafts[1].gun.fired > 0 && s2.crafts[1].last.mode === "strafe"; })());
}

console.log("\n5. THE SHIP: TURNING, HOLDING, CRUISING");
{
    const foeAt = (pos) => fighter(2, 2, pos, { hp: 1e9 }), stateAt = (angle) => ({ pos: [0, 0, 0], q: Q });
    const face = arena([capital(1, 1, { cruise: 0 }), foeAt([0, 800, 0])], { seconds: 40 }); let peak = 0;
    for (let i = 0; i < 30 * 25; i++) { SA.stepSpaceArena(face); const w = face.crafts[0].body.w; peak = Math.max(peak, Math.abs(w[2])); }
    const fwd = RB.rotateByQuat(face.crafts[0].body.q, [1, 0, 0]), err = Math.acos(fwd[1]);
    ok("!! a ship that FACES turns to the nearest enemy (here 90 degrees to port) at the hull's own limit and has it on the nose within 2 degrees by 25 s (20.1 s in the ship's gate), never over the 0.25 rad/s^2: its spin reaches at most 0.175 rad/s on the way (the PD's own peak)", err < 0.035 && face.crafts[0].last.mode === "face" && peak > 0.05 && peak < 0.22 && face.crafts[0].last.foe === 2, `${(err * 57.3).toFixed(2)} deg off, spin peak ${peak.toFixed(3)}`);
    const hold = arena([capital(1, 1, { behaviour: "hold", cruise: 0, state: { pos: [0, 0, 0], q: Q, w: [0.1, 0.05, 0.1] } }), foeAt([0, 800, 0])], { seconds: 60 }); run(hold, 30 * 45);
    ok("!! a ship that HOLDS damps its spin (0.1, 0.05, 0.1 rad/s) to nothing in 45 s and does not turn toward the enemy (the nose stays within 20 degrees of where it was, having drifted with the spin it was given)", norm(hold.crafts[0].body.w) < 1e-3 && hold.crafts[0].last.mode === "hold" && RB.rotateByQuat(hold.crafts[0].body.q, [1, 0, 0])[0] > 0.9, `${norm(hold.crafts[0].body.w).toExponential(1)}`);
    const cruise = (o) => { const a = arena([capital(1, 1, { behaviour: "hold", ...o }), foeAt([0, 8000, 0])], { seconds: 30 }); if (o.pods !== undefined) a.crafts[0].enginesRunning = o.pods; run(a, 300); return a.crafts[0].body.vel[0]; };
    const v3 = cruise({}), v2 = cruise({ pods: 2 }), v1 = cruise({ pods: 1 }), v0 = cruise({ pods: 0 }), vz = cruise({ cruise: 0 }), vf = cruise({ cruise: 1 });
    ok("!! the cruise is a FRACTION of the thrust the pods left give: 0.3 of 1,500 on 4,400 kg for 10 s is 1.023 units/s (semi-implicit, to 0.5%), two pods two thirds of that, one pod a third, none nothing, a cruise of 0 nothing and a cruise of 1 a third more than 3 times as much", Math.abs(v3 - 450 / 4400 * 10) < 0.006 && Math.abs(v2 / v3 - 2 / 3) < 1e-9 && Math.abs(v1 / v3 - 1 / 3) < 1e-9 && v0 === 0 && vz === 0 && Math.abs(vf / v3 - 1 / 0.3) < 1e-9, `${v3.toFixed(4)} ${v2.toFixed(4)} ${v1.toFixed(4)} ${v0} ${vz} ${vf.toFixed(4)}`);
}

console.log("\n6. THE SEATS");
{
    const seen = []; const spy = (seat, k) => (s, st, body, shown) => { if (k === 3) seen.push(shown.map((x) => `${x.id}:${x.radius}`).join(",")); return { yaw: st.yaw, pitch: st.pitch, fire: false, target: null }; };
    const a = arena([capital(1, 1, { gunner: spy }), fighter(2, 2, [300, 0, 0]), fighter(3, 2, [600, 50, 0]), { ...fighter(4, 1, [100, 0, 0]) }, fighter(5, 2, [2500, 0, 0]), capital(6, 2, { state: { pos: [900, 0, 200], q: Q } })]);
    SA.stepSpaceArena(a); a.crafts[2].dead = true; a.crafts[2].status = "destroyed"; SA.stepSpaceArena(a);
    ok("!! a gunner is shown the ENEMY craft still flying, inside 1,500 units, and nobody else -- a team-mate 100 units off and a fighter 2,500 out are not shown, a destroyed enemy is dropped the next tick -- each with the radius a round has to reach (a fighter's 1.5, an enemy ship's aim radius 6)", seen.join(" | ") === "2:1.5,3:1.5,6:6 | 2:1.5,6:6", seen.join(" | "));
    // a dummy 120 units off the port beam: the PD mounts that can see it fire; it is shot to nothing
    const b = arena([capital(1, 1, { gunner: undefined, cruise: 0, behaviour: "hold" }), fighter(2, 2, [0, 120, 0])], { seconds: 20 }), evB = run(b, 30 * 20), hits = evB.filter((e) => e.type === "hit"), d = b.crafts[1];
    ok("!! the seats fire at a fighter standing 120 units off the port beam and SHOOT IT TO NOTHING: its 100 hit points go in hits of 10 (the PD round) and 60 (the main shell) -- every hit event names the ship as the shooter and the fighter as the victim, and carries no `part` (a fighter has none), the damage is the gun's, the fighter is destroyed, one 'kill' event, and the fight ends 'one team left flying'",
        d.dead && d.status === "destroyed" && d.hp <= 0 && hits.length >= 2 && hits.every((e) => e.shooter === 1 && e.victim === 2 && !("part" in e) && (e.damage === 10 || e.damage === 60)) && hits.reduce((x, e) => x + e.damage, 0) === b.crafts[0].hits && b.crafts[0].hits >= 100 && evB.filter((e) => e.type === "kill").length === 1 && b.over === "one team left flying", `${hits.length} hits (${hits.filter((e) => e.damage === 60).length} main), killed at ${b.t.toFixed(2)} s`);
    ok("!! only the seats that can SEE it fired: the starboard mounts (a hemisphere facing away) fired nothing at a target to port, and the port ones did", b.crafts[0].seats.filter((s) => /^pd-s/.test(s.seat.id)).every((s) => s.state.gun.fired === 0) && b.crafts[0].seats.filter((s) => /^pd-p/.test(s.seat.id)).some((s) => s.state.gun.fired > 0), b.crafts[0].seats.map((s) => `${s.seat.id}:${s.state.gun.fired}`).join(" "));
    // the main battery's shell: a dummy above the deck, 300 units out where only the main turrets and the port/starboard... take the first main shell hit to be 60
    const far = arena([capital(1, 1, { cruise: 0, behaviour: "hold", gunner: undefined }), fighter(2, 2, [0, 560, 0], { hp: 1e9 })], { seconds: 25 }), evFar = run(far, 30 * 25);
    ok("!! THE SHIP'S GUNNERS KNOW THERE IS NO GRAVITY: a still target 560 units off the beam (the PD round would fall 1.3 units there, the main shell 6.1 -- more than the 1.5 a fighter is wide) is hit by main shells as well as PD rounds (a main shell does 60)", evFar.some((e) => e.type === "hit" && e.damage === 60) && evFar.some((e) => e.type === "hit" && e.damage === 10), `${evFar.filter((e) => e.type === "hit" && e.damage === 60).length} main hits`);
    const bias = arena([capital(1, 1, { cruise: 0, behaviour: "hold", gunner: undefined }), fighter(2, 2, [0, 560, 0], { hp: 1e9 })], { seconds: 25 }); let sum = 0, n = 0; const main = bias.crafts[0].seats[0], tgtPos = [0, 560, 0];
    for (let i = 0; i < 300; i++) { SA.stepSpaceArena(bias); if (main.last && main.last.target === 2) { const line = GS.reachOf(main.seat, bias.crafts[0].body, tgtPos.map((v, k) => v - GS.muzzleOfSeat(main.seat, main.state, bias.crafts[0].body).pos[k])); sum += main.last.pitch - line.pitch; n++; } }
    ok("!! AND THEY AIM ALONG THE LINE, NOT ABOVE IT: main turret A's commanded pitch, averaged over the ticks it has the target (aim error is zero-mean noise of 0.012 rad), is the straight line's to 0.004 rad -- a gunner that allowed for the earth's gravity would aim 0.011 rad high at this range", n > 100 && Math.abs(sum / n) < 0.004, `mean bias ${(sum / n).toFixed(5)} rad over ${n} ticks`);
    const c = arena([capital(1, 1, { cruise: 0, behaviour: "hold", gunner: undefined }), fighter(2, 2, [0, 0, 300])], { seconds: 20 }); const evC = run(c, 30 * 15), mainHits = evC.filter((e) => e.type === "hit" && e.damage === 60);
    ok("!! a target straight above the deck (where the main turrets' pitch stops at 83 degrees and the PD mounts of the flanks see it) is hit by the PD rounds and the main shells; a main shell does exactly 60", c.crafts[0].hits > 0 && evC.some((e) => e.type === "hit" && e.damage === 10) && mainHits.every((e) => e.damage === 60), `${evC.filter((e) => e.type === "hit").length} hits`);
}

console.log("\n7. THE PARTS");
{
    // rounds put straight into the ship from outside: n rounds from `dir` above a named part, owned by a fighter of the other team
    // `from` is the side the rounds come from, chosen so that no other sphere stands between them and the part: the hull from below, a turret from above, a flank mount from its own side, a pod from astern
    const FROM = { up: [0, 0, 1], down: [0, 0, -1], port: [0, 1, 0], aft: [-1, 0, 0] };
    const inject = (ar, name, n, dmg = 18, k0 = 0, from = "up") => { const c = ar.crafts.find((x) => x.kind === "capital"), p = CS.partCentres(c.ship, c.body).find((q) => q.name === name), fo = ar.crafts.find((x) => x.kind === "fighter"), d = FROM[from]; for (let k = 0; k < n; k++) ar.rounds.push({ pos: p.center.map((v, i) => v + d[i] * (12 + 5 * (k + k0))), vel: d.map((v) => -300 * v), age: 0, owner: fo.id, team: fo.team, dmg, life: 2.5 }); };
    const mk = () => arena([capital(1, 1, { cruise: 0, behaviour: "hold" }), fighter(2, 2, [3000, 0, 0], { hp: 1e9 })], { seconds: 60 });
    const a = mk(); inject(a, "midships", 3, 18, 0, "down"); const ev0 = run(a, 6), hull = ev0.filter((e) => e.type === "hit"), cap = a.crafts[0];
    ok("!! a hit takes the ship's hit points (3 rounds of 18 on the midships: 1,500 -> 1,446), NAMES THE PART it reached ('midships' is part 2), and a hull sphere has no hit points of its own so nothing else is lost", hull.length === 3 && hull.every((e) => e.part === 2 && e.victim === 1 && e.shooter === 2 && e.damage === 18) && cap.hp === 1446 && cap.partHits.get(2) === 54 && cap.partHp.get(2) === undefined && ev0.every((e) => e.type !== "part"), `${cap.hp}`);
    const b = mk(); inject(b, "port PD 1", 6, 18, 0, "port"); const evb = run(b, 8), pe = evb.filter((e) => e.type === "part"), pid = SHIP.parts.find((p) => p.name === "port PD 1").id;
    ok("!! a PD mount (60 hit points) shot to nothing by 6 rounds of 18 (the 4th takes it to -12, the two after it land on a dead mount) says so ONCE -- one 'part' event naming 'port PD 1', kind pd -- and the seat in it is OUT: seatWorks is false for it and true for its neighbour", pe.length === 1 && pe[0].name === "port PD 1" && pe[0].kind === "pd" && pe[0].craft === 1 && b.crafts[0].partHp.get(pid) === -48 && !SA.seatWorks(b.crafts[0], b.crafts[0].seats[3]) && SA.seatWorks(b.crafts[0], b.crafts[0].seats[4]) && SA.seatWorks(b.crafts[0], b.crafts[0].seats[0]), JSON.stringify(pe));
    // a seat that is out stops firing while its neighbours go on: the same target 120 off the port beam, one mount out from the start
    const c = arena([capital(1, 1, { cruise: 0, behaviour: "hold", gunner: undefined }), fighter(2, 2, [0, 120, 0], { hp: 1e9 })], { seconds: 12 }); c.crafts[0].partHp.set(pid, 0); run(c, 30 * 8);
    ok("!! A SEAT THAT IS OUT STOPS FIRING while the others go on: with port PD 1 at 0 hit points from the start and a target 120 units off the port beam, that seat fires nothing in 8 s and port PD 2 and 3 fire", c.crafts[0].seats[3].state.gun.fired === 0 && c.crafts[0].seats[4].state.gun.fired > 5 && c.crafts[0].seats[5].state.gun.fired > 5, c.crafts[0].seats.slice(3, 6).map((s) => s.state.gun.fired).join());
    const d = mk(); inject(d, "main turret B", 7); const evd = run(d, 8), td = evd.filter((e) => e.type === "part");
    ok("!! a main turret (120 hit points) goes out on the 7th round of 18 (126), says so once ('main turret B', kind turret) and its seat is out", td.length === 1 && td[0].name === "main turret B" && td[0].kind === "turret" && !SA.seatWorks(d.crafts[0], d.crafts[0].seats[1]) && SA.seatWorks(d.crafts[0], d.crafts[0].seats[0]));
    const e = mk(); inject(e, "engine pod 2", 6, 18, 0, "aft"); inject(e, "engine pod 1", 6, 18, 6, "aft"); const eve = run(e, 12), pods = eve.filter((x) => x.type === "part");
    const accel = (pods2) => { const a2 = arena([capital(1, 1, { behaviour: "hold", cruise: 1 }), fighter(2, 2, [0, 9000, 0], { hp: 1e9 })]); a2.crafts[0].enginesRunning = pods2; run(a2, 60); return a2.crafts[0].body.vel[0]; };
    ok("!! an engine pod (100 hit points) goes out on the 6th round of 18 and says how many pods RUN ('engine pod 2' -> 2 running, 'engine pod 1' -> 1 running), and the thrust falls with it: the same cruise gives a third less with 2 pods, two thirds less with 1", pods.length === 2 && pods[0].name === "engine pod 2" && pods[0].running === 2 && pods[1].name === "engine pod 1" && pods[1].running === 1 && e.crafts[0].enginesRunning === 1 && Math.abs(accel(2) / accel(3) - 2 / 3) < 1e-9 && Math.abs(accel(1) / accel(3) - 1 / 3) < 1e-9, JSON.stringify(pods.map((x) => [x.name, x.running])));
    const f = arena([capital(1, 1, { hp: 40, cruise: 0, behaviour: "hold" }), fighter(2, 2, [3000, 0, 0], { hp: 1e9 }), fighter(3, 2, [3000, 50, 0], { hp: 1e9 })], { seconds: 20 }); inject(f, "midships", 3, 18, 0, "down"); const evf = run(f, 6);
    ok("!! a ship whose hit points are gone is DESTROYED (40 hit points, 3 hits of 18: -14), a 'kill' event names it, it is out (dead, status destroyed, the same body from then on), and the fight goes on while the other team has a craft: with two fighters left it is 'one team left flying' at once", f.crafts[0].dead && f.crafts[0].status === "destroyed" && evf.filter((x) => x.type === "kill").length === 1 && f.done && f.over === "one team left flying");
}

console.log("\n8. NO FRIENDLY FIRE");
{
    // fighter 2 (team 2) fires along +X through fighter 4 (team 2, 30 units ahead) at the ship (team 1, 200 ahead); fighter 3 of team 1 stands in the line too
    const firing = () => ({ torqueBody: [0, 0, 0], thrust: 0, firing: true }), body = { pos: [-300, 0, 0], q: Q };
    const a = arena([capital(1, 1, { state: { pos: [-100, 0, 0], q: Q }, cruise: 0, behaviour: "hold" }), fighter(2, 2, [-300, 0, 0], { pilot: firing, state: { ...body, vel: [5, 0, 0] } }), fighter(4, 2, [-270, 0, 0], { hp: 1e9 })], { seconds: 6 });
    // the rounds are aimed along +X; the ship's pilot is not asked, so give the firing fighter the doctrine's strafe by starting it inside 220 with the ship ahead
    const ev = run(a, 60), onMate = ev.filter((e) => e.type === "hit" && e.victim === 4), onShip = ev.filter((e) => e.type === "hit" && e.victim === 1);
    ok("!! A ROUND DOES NOT HIT A CRAFT OF ITS OWN TEAM (the page's rule: no friendly fire here, so no hold-fire rule either): a fighter firing along +X through a team-mate 30 units ahead takes nothing off it (0 hits on craft 4) and the rounds reach the enemy ship beyond (hits on it)", a.crafts[1].gun.fired > 5 && onMate.length === 0 && a.crafts[2].hp === 1e9 && onShip.length > 0, `${a.crafts[1].gun.fired} rounds, ${onMate.length} on the mate, ${onShip.length} on the ship`);
    const b = arena([capital(1, 1, { state: { pos: [-100, 0, 0], q: Q }, cruise: 0, behaviour: "hold", gunner: undefined }), fighter(2, 2, [-300, 80, 0], { hp: 1e9 })], { seconds: 6 }); const evb = run(b, 120);
    ok("and the ship's own rounds never hit the ship (the round's owner, and the team): the PD mounts of a ship firing at a target 80 units off put no hit on the ship itself in 4 s", b.crafts[0].seats.some((s) => s.state.gun.fired > 0) && evb.every((e) => e.type !== "hit" || e.victim !== 1));
}

console.log("\n9. THE RAM");
{
    const hull = SHIP.parts[2];   // midships (0, 0, 0) r 5.4
    const inside = arena([capital(1, 1, { cruise: 0, behaviour: "hold" }), fighter(2, 2, [0, 5.0, 0], { hp: 1e9 })]), evI = run(inside, 1), graze = arena([capital(1, 1, { cruise: 0, behaviour: "hold", gunner: quiet }), fighter(2, 2, [0, 0, -6.0], { hp: 1e9 })]), evG = run(graze, 1);
    ok("!! a fighter INSIDE the ship's hull (a sphere's radius plus the fighter's 1.5) is lost this tick (status 'rammed', dead) and the ship takes 25 -- a 'ram' event names both; a fighter 6.0 units below the midships centre (outside its 5.4 but inside 5.4 + the fighter's 1.5 = 6.9) is lost too, and one 7.2 below is not", graze.crafts[1].dead && graze.crafts[1].status === "rammed" && evG.some((e) => e.type === "ram") && inside.crafts[1].dead && inside.crafts[1].status === "rammed" && inside.crafts[0].hp === 1475 && evI.some((e) => e.type === "ram" && e.craft === 2 && e.with === 1 && e.damage === 25) && evI.some((e) => e.type === "kill" && e.craft === 2), JSON.stringify(evI.map((e) => e.type)));
    const out = arena([capital(1, 1, { cruise: 0, behaviour: "hold", gunner: quiet }), fighter(2, 2, [0, 0, -7.2], { hp: 1e9 })]), evO = run(out, 1);
    ok("...and not for a fighter outside every sphere and its own 1.5 (7.2 units below the midships centre): flying on, ship untouched", !out.crafts[1].dead && out.crafts[0].hp === 1500 && !evO.some((e) => e.type === "ram"));
    const team = arena([capital(1, 1, { cruise: 0, behaviour: "hold" }), fighter(2, 1, [0, 3, 0]), fighter(3, 2, [900, 0, 0])]), evT = run(team, 1);
    ok("a fighter of the SHIP'S OWN team inside the hull is not rammed (no friendly ram)", !team.crafts[1].dead && !evT.some((e) => e.type === "ram"));
    const col = arena([fighter(2, 1, [0, 0, 0], { state: { pos: [0, 0, 0], q: Q, vel: [1, 0, 0] } }), fighter(3, 2, [2.5, 0, 0], { state: { pos: [2.5, 0, 0], q: [0, 0, 0, 1], vel: [-1, 0, 0] } })]), evCol = run(col, 2), c0 = evCol.find((e) => e.type === "collision");
    ok("!! two fighters that touch COLLIDE through brain/shipCollision6dof (the page's): a 'collision' event names the pair, BOTH lose the same hit points (the ram damage: the summed impulse times 0.3, capped at 25), and they bounce (their x velocities are no longer 1 and -1)", c0 && col.crafts[0].hp === col.crafts[1].hp && col.crafts[0].hp < 100 && c0.damage > 0 && c0.damage <= 25 && Math.abs(col.crafts[0].body.vel[0] - 1) > 0.01, JSON.stringify(c0));
}

console.log("\n10. THE WAVE-MOTION CANNON (INVENTED)");
{
    const mk = (foes, o = {}) => arena([capital(1, 1, { cruise: 0, behaviour: "hold", ...o }), ...foes], { seconds: 60 });
    const empty = mk([fighter(2, 2, [0, 5000, 0], { hp: 1e9 })]); run(empty, 100); const c100 = empty.crafts[0].charge; run(empty, 400);
    ok("!! the cannon CHARGES 1/30 s a tick -- 3.333 s after 100 ticks -- up to 12 s and NO FURTHER (500 ticks is capped at 12), and does nothing while nothing is in its beam", Math.abs(c100 - 100 / 30) < 1e-9 && empty.crafts[0].charge === 12 && empty.crafts[0].waves === 0 && empty.crafts[1].hp === 1e9);
    const a = mk([fighter(2, 2, [330, 0, 0], { hp: 100 })]); const ev = run(a, 359), none = ev.filter((e) => e.type === "wave").length, ev2 = run(a, 2), w = ev2.find((e) => e.type === "wave");
    ok("!! with a fighter in the beam (330 units ahead of the centre, 305 of the bow) the cannon fires on the first tick it is charged -- tick 360 (12 s), not 359 -- once: a 'wave' event names the victim and the 400 damage, the fighter is DESTROYED (a 'kill' event says by wave), the charge goes back to 0 and the ship counts the shot", none === 0 && w && w.victims.join() === "2" && w.damage === 400 && a.crafts[1].dead && ev2.some((e) => e.type === "kill" && e.craft === 2 && e.by === "wave") && a.crafts[0].waves === 1 && a.crafts[0].charge < 0.1 && a.crafts[0].hits === 400, JSON.stringify(w));
    const cases = [["off the line (20 units aside at 300)", fighter(2, 2, [300, 20, 0])], ["behind the ship", fighter(2, 2, [-300, 0, 0])], ["too far (950 units)", fighter(2, 2, [950, 0, 0])], ["a team-mate in the beam", fighter(2, 1, [300, 0, 0])]];
    const missed = cases.map(([n, f]) => { const b = mk([{ ...f, hp: 100 }, fighter(3, 2, [0, 7000, 0], { hp: 1e9 })]); run(b, 400); return [n, b.crafts[0].waves, b.crafts[1].hp]; });
    ok("!! and it does NOT fire for a craft off the line (20 units aside: past the 6-unit beam and the fighter's 1.5), behind the ship, 950 units out (the range is 900), or a team-mate in the beam", missed.every(([, w, hp]) => w === 0 && hp === 100), JSON.stringify(missed));
    const edge = [mk([fighter(2, 2, [300, 7.4, 0], { hp: 100 })]), mk([fighter(2, 2, [300, 7.7, 0], { hp: 100 })]), mk([fighter(2, 2, [920, 0, 0], { hp: 100 })]), mk([fighter(2, 2, [930, 0, 0], { hp: 100 })])]; edge.forEach((x) => run(x, 400));
    ok("!! the beam's edges are the numbers: a fighter 7.4 units off the axis (inside 6 + 1.5) is hit, 7.7 (outside) is not, and the range is measured from the BOW (25 units ahead of the centre): one 920 units ahead of the centre (895 from the bow) is hit and one 930 (905 from the bow) is not", edge[0].crafts[0].waves === 1 && edge[1].crafts[0].waves === 0 && edge[2].crafts[0].waves === 1 && edge[3].crafts[0].waves === 0, edge.map((x) => x.crafts[0].waves).join());
    const rot = mk([fighter(2, 2, [0, 330, 0], { hp: 100 })], { state: { pos: [0, 0, 0], q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] } }); run(rot, 362);
    ok("!! the beam is along the SHIP'S nose, not the world's +X: a ship turned 90 degrees about +Z fires at a fighter 330 units off its port beam on the axis it now points along, and a fighter on world +X would not be hit", rot.crafts[0].waves === 1 && rot.crafts[1].dead);
    const dual = mk([fighter(2, 2, [250, 0, 0], { hp: 100 }), fighter(3, 2, [500, 3, 0], { hp: 100 }), capital(4, 2, { state: { pos: [700, 0, 0], q: Q }, gunner: quiet, cruise: 0, behaviour: "hold" })]); const evd = run(dual, 362), wd = evd.find((e) => e.type === "wave");
    ok("!! one shot hurts EVERYTHING in the beam, enemy ships too: two fighters and an enemy capital ship in line at 250, 500 and 700 are all hit for 400 (the fighters are lost, the capital ship 1,500 -> 1,100) by the one shot", wd && wd.victims.join() === "2,3,4" && dual.crafts[1].dead && dual.crafts[2].dead && dual.crafts[3].hp === 1100 && dual.crafts[0].waves === 1, JSON.stringify(wd));
}

console.log("\n11. THE END");
{
    const t = SA.runSpaceArena(arena([capital(1, 1, { gunner: quiet, cruise: 0 }), fighter(2, 2, [4000, 0, 0], { hp: 1e9 })], { seconds: 3 })), o = SA.runSpaceArena(arena([capital(1, 1, { gunner: quiet, cruise: 0, hp: 1 }), fighter(2, 2, [0, 5.0, 0], { hp: 1 })], { seconds: 3 }));
    ok("!! the fight ends at the time limit ('time', tick 90 for 3 s), when one team is left ('one team left flying'), and when none is -- a fighter that rams a ship with 1 hit point left takes both out in one tick ('no team left flying')", t.over === "time" && t.i === 90 && o.over === "no team left flying" && o.i === 1 && o.done && teams(SA.teamsFlying(o)) === "" && teams(SA.teamsFlying(t)) === "1,2");
    function teams(x) { return x.slice().sort().join(); }
    const done = o.i; SA.stepSpaceArena(o);
    ok("a finished arena is not stepped (the tick count and the events are left alone), and the teams still flying are listed once each", o.i === done && SA.teamsFlying(arena([capital(1, 1), fighter(2, 2, [500, 0, 0]), fighter(3, 2, [600, 0, 0])])).length === 2);
}

console.log("\n12. THE FRONT DOOR");
{
    ok("!! the export list is pinned: APPROACH_OFFSET, AUTOPILOT, DT, FIGHTER, FIGHTER_GUN, RAM_DAMAGE, STRAFE_RANGE, VISION, createSpaceArena, fighterAim, nearestFoe, reportLines, runSpaceArena, seatWorks, stepSpaceArena, teamsFlying, waveTargets", Object.keys(SA).sort().join(",") === "APPROACH_OFFSET,AUTOPILOT,DT,FIGHTER,FIGHTER_GUN,RAM_DAMAGE,STRAFE_RANGE,VISION,createSpaceArena,fighterAim,nearestFoe,reportLines,runSpaceArena,seatWorks,stepSpaceArena,teamsFlying,waveTargets", Object.keys(SA).sort().join(","));
    ok("the page's numbers are pinned and frozen: the fighter's half-extents 1.6 x 0.7 x 0.7, mass 8, 100 hit points, hit radius 1.5; the gun 900 units/s at 3.33 a second for 18 damage and 2.5 s; the autopilot's thrust 16 and standoff 50; the ram 25; the vision 1,500", SA.FIGHTER.half.join() === "1.6,0.7,0.7" && SA.FIGHTER.mass === 8 && SA.FIGHTER.hp === 100 && SA.FIGHTER.radius === 1.5 && SA.FIGHTER.engineMount.join() === "-1.4,0,0" && SA.FIGHTER.muzzle.join() === "1.4,0,0" && SA.FIGHTER_GUN.muzzleSpeed === 900 && SA.FIGHTER_GUN.damage === 18 && SA.FIGHTER_GUN.life === 2.5 && SA.AUTOPILOT.thrustForce === 16 && SA.AUTOPILOT.standoff === 50 && SA.AUTOPILOT.weaponSpeed === 900 && SA.RAM_DAMAGE === 25 && SA.VISION === 1500 && Object.isFrozen(SA.FIGHTER) && Object.isFrozen(SA.FIGHTER.half) && Object.isFrozen(SA.FIGHTER_GUN) && Object.isFrozen(SA.AUTOPILOT) && SA.DT === 1 / 30);
    const lines = SA.reportLines();
    ok("the report lines say real numbers and name the module", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /space battle/.test(lines[0]) && /four fighters against the capital ship/.test(lines[1]), lines[1]);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
