// WebGLEngine/physics/mechanics/flightModel6dof-selfcheck.mjs
//
// Run: node physics/mechanics/flightModel6dof-selfcheck.mjs
//
// THE SIBLING GATE OF physics/mechanics/flightModel6dof.mjs (v4866): the real-flight physics every flying pilot in this tree is trained on. A flight model that passes "it flies" proves nothing -- a wrong sign
// in the elevator, a damping term that was never added, a stall that never happens all still produce an aircraft that goes somewhere. So every row here is held to a number the model was NOT tuned to: a closed
// form derived from the airframe's own constants, a conservation law, a symmetry, or a sign proved against the frame's geometry.
//
//   1  the airframe as built (weight, wing area, the stall on every surface, no stall when asked for none)
//   2  CONVENTIONS, PROVED FROM THE FRAME: +Y is the aircraft's LEFT (a right-handed frame with the nose on +X and up on +Z), so heading falls on a left turn; the attitude round trip; and each pilot sense
//      (stick back = nose up, stick right = bank right, right pedal = nose right) shown by the torque it makes AND by where the aircraft goes in a second
//   3  free fall, exactly (one tick from rest: v = -g dt, z = z0 - g dt^2); the engine at rest, exactly
//   4  TRIM -- the residuals are zero, the net force on the aircraft is the weight's opposite, the trim table is monotone and pinned, a 5 degree climb costs W sin(5) of thrust, the top speed is where thrust meets
//      drag, below the stall speed there is no trim; and a trimmed aircraft HOLDS (20 s, three speeds, altitude and speed moved by less than 5 cm and 1 cm/s)
//   5  STIFFNESS AND DAMPING against hand-derived oracles: pitch stiffness dM/dalpha = arm q S_t clalpha_t (1.5%), pitch damping -q S clalpha arm^2 / V (1%), roll damping (2%), rudder damping (1%),
//      weathervane torque (1%), the local-flow kinematics (each surface sits in v + w x r, to 1e-9)
//   6  THE PHUGOID against Lanchester's period pi sqrt(2) V / g (15%), damped, and its energy bookkeeping (a speed surplus comes back as altitude: v^2/2g)
//   7  THE STALL against sqrt(2 W / (rho S Clmax)): at the stall speed the wings' best lift IS the weight (0.5%), at 0.97 of it they cannot hold it, the same airframe with no stall holds it with 15% to spare;
//      and a full pull from cruise takes the angle of attack past the stall angle and drops the nose
//   8  THE ENGINE: thrust = Tmax * throttle * max(0, 1 - V/90), no torque from the thrust line
//   9  WIND is a change of frame: velocity v + u in air u is forces for v in still air (1e-9)
//  10  MIRROR SYMMETRY: the mirrored state under the mirrored controls gives mirrored forces and moments (1e-9); a symmetric flight makes no roll or yaw
//  11  controls are sanitised (NaN, infinity, 1e9 read as the clamped value); the ground: touchdown, hard arrival, wing-low, inverted, tail-first, tip, a finished flight stays finished
//  12  DETERMINISM AND FUZZ: random controls from random attitudes for 4,000 ticks stay finite and a second run is bit-identical; the front door prints no NaN
//
// SABOTAGE LOG -- each applied to the module named in a scratch worktree, the gate run, the worktree restored. 45 sabotages, every one red by name (the numbers are how many rows went red):
//   CONTROL SENSES   F1 elevator driven by +pitch (stick back made a nose-DOWN torque) 7 | F2 roll sign flipped 2 | F3 yaw sign flipped 2 | F38 roll not clamped 1 | F13 NaN control let through 19 | F14 throttle clamp to 9 2
//   PHYSICS TERMS    F4 local flow ignores w x r (no damping at all: pitch damping 0 vs -3501) 7 | F5 gravity dropped 16 | F6 gravity halved 14 | F41 gravity from the model's mass instead of the state's 1 | F7 thrust
//                    does not fade with speed 10 | F39 thrust ~ throttle squared 4 | F8 thrust line 0.5 m above the centre of mass 5 | F9 fuselage drag dropped 3 | F33 fuselage drag doubled 6 | F15 wind ignored 2 | F34 wing
//                    incidence not applied 5 | F10 no stall on any surface 1 | F11 stall on the tail only 1 | F12 stall object shared by reference 1
//   ATTITUDE         F17 bank sign 2 | F18 heading sign 4 | F19 pitch-rate sign 1 | F20 beta sign 2 | F21 alpha sign 3 | F16 attitude() ignores the wind 1 | F35 createState ignores the climb angle 6 | F36 quaternion composed in
//                    the wrong order 1 | F37 default mass wrong 7
//   TRIM             F29 gamma ignored 2 | F30 stick limit ignored by `feasible` 1 | F31 stall angle ignored by `feasible` 1 (only the strong-elevator, strong-engine row sees it: in the TRAINER the stick runs out first) |
//                    F32 trim solved through the clamp (it cannot see a throttle past 1, and the Jacobian goes singular) 4 | F40 maxLevelSpeed accepts throttle 2 1 | F42 trim ignores the model's mass 1
//   GROUND           F22 sink limit 3 -> 30 m/s 1 | F23 bank limit loosened 1 | F24 pitch limits loosened 1 | F43 upper pitch limit dropped 1 | F46 lower pitch limit dropped 2 | F25 hull points removed 2 | F26 a hull
//                    contact allowed to be a touchdown 1 | F44 hull kind lost 2 | F27 a finished flight keeps integrating 1 | F28 sink speed taken at the centre of mass, not the contact point 1
//   THREE SABOTAGES WENT 0 RED THE FIRST TIME, and each was a row that did not reach the guarded branch: F23 (the bank limit) -- the 25 degree arrival struck a wing tip first, so the limit was never the
//   reason; the 16.5 degree row, where the wheels arrive first, exists because of it. F43 (the upper pitch limit) -- the 22 degree arrival strikes the tail first; the +16 row exists because of it. F28 (the sink
//   speed at the contact point) -- no row had a pitch rate; the nose-down-rate row exists because of it. F31 and F37 went 0 red for the same reason (the stick limit ends every trim before the stall angle can;
//   createState hard-coded the TRAINER's mass and the model's was never used) -- the first fixed by a row on an airframe whose elevator and engine do not run out, the second by making the STATE own its mass.
//   F12 first FAILED BY CRASH (the shared STALL is frozen, so editing a surface's copy of it threw); the row now catches the throw and goes red by name.
"use strict";
import { createBody, rotateByQuat, worldToBody, cross3 } from "./rigidBody6dof.mjs";
import * as A from "./aeroSurface.mjs";
import * as F from "./flightModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const D2R = Math.PI / 180, R2D = 180 / Math.PI, RHO = F.AIR_DENSITY, G = F.GRAVITY;
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);

console.log("flightModel6dof-selfcheck -- real flight: weight, thrust, a stalling wing, three controls and a ground\n");

const model = F.createFlightModel(), W = model.weight;
const T45 = F.trim(model, 45), CRUISE = { pitch: T45.pitch, throttle: T45.throttle, roll: 0, yaw: 0 };
const cruiseState = () => F.createState({ speed: 45, pitch: T45.pitchAttitude });
const run = (m, s0, controls, seconds, onTick) => { let s = s0, res = null; for (let i = 0; i < Math.round(seconds * 60); i++) { const c = typeof controls === "function" ? controls(s, i) : controls; res = F.stepFlight(m, s, c); s = res.state; if (onTick && onTick(s, i, res) === false) break; } return { state: s, result: res }; };

console.log("1. THE AIRFRAME AS BUILT");
{
    const tail = model.aircraft.surfaces;
    ok("mass 1000 kg, weight m g, inertia [1300, 1800, 2700]", model.mass === 1000 && near(W, 1000 * G, 1e-9) && model.inertia.join() === "1300,1800,2700");
    ok("two wing halves of 8 m^2 (16 m^2 of wing), a 1.6 m^2 tail, a 1.0 m^2 fin", tail.leftWing.area === 8 && tail.rightWing.area === 8 && tail.elevator.area === 1.6 && tail.rudder.area === 1);
    ok("the wings carry 2 degrees of incidence and the tail and fin carry none", near(tail.leftWing.incidence, 0.035) && near(tail.rightWing.incidence, 0.035) && tail.elevator.incidence === 0 && tail.rudder.incidence === 0);
    ok("!! EVERY surface carries the stall (15 degrees, 8 to finish, drag 1.8)", Object.values(tail).every((s) => s.stall && near(s.stall.angle, 15 * D2R, 1e-15) && near(s.stall.width, 8 * D2R, 1e-15) && s.stall.drag === 1.8));
    const bare = F.createFlightModel({ ...F.TRAINER, stall: null });
    ok("!! a spec with stall: null builds an airframe that cannot stall (the control the stall rows below are held against)", Object.values(bare.aircraft.surfaces).every((s) => s.stall === null));
    let threw = false;
    try { model.aircraft.surfaces.leftWing.stall.angle = 9; } catch { threw = true; }   // mutate the airframe's own copy: must not reach the shared constant (which is frozen, so reaching it throws)
    ok("...and the shared STALL constant is not reachable from a built airframe (each surface got its own copy: editing one surface's stall changes neither STALL nor the next airframe)", !threw && near(A.STALL.angle, 15 * D2R, 1e-15) && near(F.createFlightModel().aircraft.surfaces.leftWing.stall.angle, 15 * D2R, 1e-15));
    model.aircraft.surfaces.leftWing.stall.angle = 15 * D2R;
    ok("TRAINER is frozen (a pilot cannot edit the aircraft it is flying)", Object.isFrozen(F.TRAINER) && Object.isFrozen(F.TRAINER.airframe) && Object.isFrozen(F.TRAINER.inertia));
}

console.log("\n2. *** CONVENTIONS, PROVED FROM THE FRAME -- NOT FROM THE NAMES THE EARLIER MODULES GAVE THE AXES ***");
{
    // a right-handed frame, nose +X, up +Z: rotating the nose from +X toward +Y is a counter-clockwise turn seen from above, which is a turn to the LEFT. So +Y is the left of the aircraft, and "RIGHT_BODY = [0,1,0]" in
    // aircraftAssembly.mjs is mislabelled (symmetric, so nothing in its physics depends on it).
    const yawLeft = createBody({ q: [Math.cos(0.3), 0, 0, Math.sin(0.3)] });   // 0.6 rad about +Z
    const nose = rotateByQuat(yawLeft.q, [1, 0, 0]);
    ok("!! a positive rotation about +Z (the right-hand rule, up toward you) swings the nose toward +Y, and the attitude reads that as heading -0.6: a LEFT turn lowers the heading, a right turn raises it", nose[1] > 0 && near(F.attitude(yawLeft).heading, -0.6, 1e-12), `nose.y=${nose[1].toFixed(4)} heading=${F.attitude(yawLeft).heading.toFixed(4)}`);
    ok("...so the aircraft's left wing is on +Y: the cross product up x nose is +Y", (() => { const c = cross3([0, 0, 1], [1, 0, 0]); return c[0] === 0 && c[1] === 1 && c[2] === 0; })());
    let worst = 0;
    for (const h of [-3, -2, -0.5, 0, 1, 3]) for (const p of [-1.2, -0.4, 0, 0.5, 1.3]) for (const b of [-3, -1.5, 0, 0.7, 2.5]) { const a = F.attitude(F.createState({ heading: h, pitch: p, bank: b })); worst = Math.max(worst, Math.abs(wrap(a.heading - h)), Math.abs(a.pitch - p), Math.abs(wrap(a.bank - b))); }
    ok("!! attitudeQuat -> attitude round-trips over heading x pitch x bank (150 attitudes) to 1e-12", worst < 1e-12, `worst ${worst.toExponential(2)}`);
    ok("the quaternion is a unit quaternion", near(Math.hypot(...F.attitudeQuat(1.1, -0.4, 2.2)), 1, 1e-14));
    const s = F.createState({ speed: 40, heading: 0.8, pitch: 0.3, gamma: 0.2 }), a = F.attitude(s);
    ok("createState's velocity points along its heading at its climb angle (|v| = speed, gamma and heading read back)", near(norm3(s.vel), 40, 1e-9) && near(a.gamma, 0.2, 1e-12) && near(Math.atan2(-s.vel[1], s.vel[0]), 0.8, 1e-12), `gamma=${a.gamma.toFixed(5)}`);
    ok("a pilot's alpha is pitch minus climb angle: 0.3 - 0.2 = 0.1 rad, and the aircraft is not slipping (beta = 0)", near(a.alpha, 0.1, 1e-12) && near(a.beta, 0, 1e-12), `alpha=${a.alpha.toFixed(5)}`);

    // each pilot sense, by the torque it makes from trim ...
    const s0 = cruiseState(), base = F.forcesAndMoments(model, s0, CRUISE).acc;
    const dT = (k, v) => { const f = F.forcesAndMoments(model, s0, { ...CRUISE, [k]: CRUISE[k] + v }).acc; return f.torque.map((x, i) => x - base.torque[i]); };
    ok("!! stick BACK (pitch +) makes a NOSE-UP torque: about -Y, and only about Y", dT("pitch", 0.5)[1] < -1000 && dT("pitch", 0.5)[0] === 0 && dT("pitch", 0.5)[2] === 0, `dTy=${dT("pitch", 0.5)[1].toFixed(0)}`);
    ok("!! stick RIGHT (roll +) makes a BANK-RIGHT torque: about +X (right wing down), and no pitch or yaw torque beyond rounding", dT("roll", 0.5)[0] > 5000 && Math.abs(dT("roll", 0.5)[1]) < 1e-6 && Math.abs(dT("roll", 0.5)[2]) < 100, `dTx=${dT("roll", 0.5)[0].toFixed(0)}`);
    ok("!! right pedal (yaw +) makes a NOSE-RIGHT torque: about -Z, and only about Z", dT("yaw", 0.5)[2] < -500 && dT("yaw", 0.5)[0] === 0 && dT("yaw", 0.5)[1] === 0, `dTz=${dT("yaw", 0.5)[2].toFixed(0)}`);
    // ... and by where the aircraft goes
    const after = (k, v, secs) => run(model, s0, { ...CRUISE, [k]: CRUISE[k] + v }, secs).state;
    const r1 = F.rates(after("pitch", 0.4, 0.5)), r2 = F.rates(after("roll", 0.4, 0.5)), r3 = F.rates(after("yaw", 0.4, 0.5));
    ok("!! half a second of stick back: the nose-up RATE is positive and the pitch attitude has risen above trim", r1.pitch > 0.05 && F.attitude(after("pitch", 0.4, 1)).pitch > T45.pitchAttitude + 0.02, `rate=${r1.pitch.toFixed(3)}`);
    ok("!! half a second of stick right: the roll RATE is positive and after a second the BANK is positive (right wing down)", r2.roll > 0.1 && F.attitude(after("roll", 0.4, 1)).bank > 0.1, `rate=${r2.roll.toFixed(3)}`);
    ok("!! half a second of right pedal: the yaw RATE is positive, and after three seconds the HEADING has increased (a right turn)", r3.yaw > 0.01 && F.attitude(after("yaw", 0.4, 3)).heading > 0.02, `rate=${r3.yaw.toFixed(3)} heading=${F.attitude(after("yaw", 0.4, 3)).heading.toFixed(3)}`);
    ok("!! a RIGHT bank turns the aircraft RIGHT: 20 degrees of bank held for 5 s raises the heading (the lift now leans toward the right wing's side)", (() => { const st = F.createState({ speed: 45, pitch: T45.pitchAttitude, bank: 20 * D2R }); return F.attitude(run(model, st, CRUISE, 5).state).heading > 0.05; })());
}

console.log("\n3. FREE FALL, EXACTLY; THE ENGINE AT REST, EXACTLY");
{
    const z0 = 200, s0 = createBody({ mass: 1000, I: [1300, 1800, 2700], pos: [0, 0, z0] }), r = F.stepFlight(model, s0, { throttle: 0 }, 1 / 60);
    ok("!! from rest with the throttle shut, one tick gives v = (0, 0, -g dt) EXACTLY (no air moves over anything at rest)", r.state.vel[0] === 0 && r.state.vel[1] === 0 && r.state.vel[2] === -G / 60, `vz=${r.state.vel[2]}`);
    ok("!! ...and z = z0 - g dt^2 (the semi-implicit Euler the rigid body uses: the NEW velocity moves the position)", near(r.state.pos[2], z0 - G / 3600, 1e-12) && r.state.pos[0] === 0 && r.state.pos[1] === 0, `z=${r.state.pos[2]}`);
    ok("...and the aircraft has not begun to rotate (an aircraft at rest feels no aerodynamic moment)", r.state.w.every((x) => x === 0));
    const f = F.forcesAndMoments(model, s0, { throttle: 1 });
    ok("!! at rest, full throttle: the body-frame force is EXACTLY [Tmax, 0, -m g] and the torque is zero (the thrust line passes through the centre of mass)", f.acc.force[0] === 4000 && f.acc.force[1] === 0 && f.acc.force[2] === -W && f.acc.torque.every((x) => x === 0), `${f.acc.force}`);
    const light = F.stepFlight(model, createBody({ mass: 800, I: [1300, 1800, 2700], pos: [0, 0, z0] }), { throttle: 0 }, 1 / 60);
    ok("!! weight is the STATE's mass times g (the mass the integrator divides by): an 800 kg state falls at the same g and a createState carries the mass it is given", near(light.state.vel[2], -G / 60, 1e-12) && F.createState({ mass: 800 }).mass === 800 && F.createState().mass === 1000 && F.createState({ inertia: [1, 2, 3] }).I.join() === "1,2,3" && F.trim(F.createFlightModel({ ...F.TRAINER, mass: 900 }), 45).throttle < T45.throttle - 0.02, `vz=${light.state.vel[2]}`);
    const tilted = createBody({ mass: 1000, I: [1300, 1800, 2700], pos: [0, 0, 100], q: F.attitudeQuat(0.4, 0.5, 0.3) }), ft = F.forcesAndMoments(model, tilted, { throttle: 0 }).acc;
    ok("weight is rotated into the body frame: at any attitude |F| = m g and the world-frame force is (0, 0, -m g)", near(norm3(ft.force), W, 1e-9) && (() => { const w = rotateByQuat(tilted.q, ft.force); return near(w[0], 0, 1e-9) && near(w[1], 0, 1e-9) && near(w[2], -W, 1e-9); })());
}

console.log("\n4. TRIM -- THE CONTROLS THAT HOLD A STEADY FLIGHT");
{
    const table = [25, 30, 38, 45, 52, 60].map((v) => F.trim(model, v));
    for (const t of table) report(`trim ${t.speed} m/s`, `pitch ${(t.pitchAttitude * R2D).toFixed(2)} deg  stick ${t.pitch.toFixed(3)}  throttle ${t.throttle.toFixed(3)}  ${t.feasible ? "feasible" : "NOT feasible"}  residual ${t.residual.map((x) => x.toExponential(1)).join(" ")}`);
    ok("!! at 30, 38, 45 and 52 m/s the trim converges with all three residuals (Fx, Fz, My) below 1e-6", table.slice(1, 5).every((t) => t.converged && t.residual.every((x) => Math.abs(x) < 1e-6)));
    ok("...and each is FEASIBLE (throttle within 0..1, stick within +-1, the wing below its stall angle)", table.slice(1, 5).every((t) => t.feasible));
    const T = (v) => table.find((t) => t.speed === v);
    ok("!! the 45 m/s trim is pinned: 2.9..3.0 degrees nose-up, stick 0.25..0.27 back, throttle 0.65..0.67", T(45).pitchAttitude * R2D > 2.9 && T(45).pitchAttitude * R2D < 3.0 && T(45).pitch > 0.25 && T(45).pitch < 0.27 && T(45).throttle > 0.65 && T(45).throttle < 0.67, `${(T(45).pitchAttitude * R2D).toFixed(3)} deg ${T(45).pitch.toFixed(4)} ${T(45).throttle.toFixed(4)}`);
    ok("!! faster flight needs LESS nose-up and LESS back-stick, and (from 30 m/s up) MORE throttle", T(30).pitchAttitude > T(38).pitchAttitude && T(38).pitchAttitude > T(45).pitchAttitude && T(45).pitchAttitude > T(52).pitchAttitude && T(30).pitch > T(38).pitch && T(38).pitch > T(45).pitch && T(30).throttle < T(38).throttle && T(38).throttle < T(45).throttle && T(45).throttle < T(52).throttle);
    ok("!! alpha at trim is the pitch attitude (a level path), and the lift it makes IS the weight: the world-frame net force is zero at 30, 45 and 52 m/s", [30, 45, 52].every((v) => { const t = T(v), s = F.createState({ speed: v, pitch: t.pitchAttitude }), f = F.forcesAndMoments(model, s, { pitch: t.pitch, throttle: t.throttle }).acc, w = rotateByQuat(s.q, f.force); return near(t.alpha, t.pitchAttitude, 1e-12) && norm3(w) < 1e-6 && norm3(f.torque) < 1e-5; }));
    const climb = F.trim(model, 40, { gamma: 5 * D2R }), level = F.trim(model, 40);
    const dThrust = 4000 * (1 - 40 / 90) * (climb.throttle - level.throttle), oracle = W * Math.sin(5 * D2R);
    ok("!! a 5-degree climb at 40 m/s costs W sin(5 deg) of extra thrust, to 5% (the energy equation, not read off the model)", climb.feasible && level.feasible && rel(dThrust, oracle) < 0.05, `${dThrust.toFixed(1)} N vs ${oracle.toFixed(1)} N`);
    ok("...and the climbing trim holds the same ALPHA to within a degree while the nose is 5 degrees higher", near(climb.pitchAttitude - climb.alpha, 5 * D2R, 1e-12) && Math.abs(climb.alpha - level.alpha) < 1 * D2R);
    const top = F.maxLevelSpeed(model), tt = F.trim(model, top), stTop = F.createState({ speed: top, pitch: tt.pitchAttitude });
    const horiz = (thr) => rotateByQuat(stTop.q, F.forcesAndMoments(model, stTop, { pitch: tt.pitch, throttle: thr }).acc.force)[0], thrustTop = 4000 * (1 - top / 90);
    ok("!! the top level speed is where full thrust meets total drag: 51..54 m/s, the throttle there is 1, the net horizontal force at full throttle is zero, and with the throttle shut it is exactly minus the thrust's horizontal part, thrust * cos(pitch) (drag = thrust, to 1e-6 N)", top > 51 && top < 54 && near(tt.throttle, 1, 1e-6) && Math.abs(horiz(1)) < 1e-6 && near(horiz(0), -thrustTop * Math.cos(tt.pitchAttitude), 1e-6), `top ${top.toFixed(2)} m/s thrust ${thrustTop.toFixed(1)} N  its horizontal part ${(thrustTop * Math.cos(tt.pitchAttitude)).toFixed(1)} N  drag ${(-horiz(0)).toFixed(1)} N`);
    ok("!! no trim above it is feasible (60 m/s asks for more than full throttle)", !T(60).feasible && T(60).throttle > 1);
    ok("!! no trim BELOW the stall speed is feasible (25 m/s: the stick runs out and the wing is past its stall angle)", !T(25).feasible && T(25).pitch > 1 && T(25).alpha + 0.035 > 15 * D2R, `stick ${T(25).pitch.toFixed(3)} alpha ${(T(25).alpha * R2D).toFixed(1)} deg`);
    const slow = [26, 27, 27.5, 28, 29].map((v) => F.trim(model, v));
    ok("!! THE ELEVATOR RUNS OUT BEFORE THE WING STALLS: the slowest speed at which level flight can be TRIMMED is 27..29 m/s, above the 26.1 m/s stall speed, because the stick is at its stop (a finding of this model, pinned so a change to either is seen)", !slow[0].feasible && !slow[1].feasible && slow[4].feasible && slow[0].pitch > 1 && slow[1].pitch > 1 && slow[0].alpha + 0.035 < 15 * D2R + 0.2, slow.map((t) => `${t.speed}:${t.pitch.toFixed(2)}${t.feasible ? "" : "x"}`).join(" "));
    ok("a trim that cannot be solved says so instead of returning a number (no NaN leaks out as feasible)", (() => { const bad = F.trim(model, -5); return bad.feasible === false; })());
    const strong = F.createFlightModel({ ...F.TRAINER, thrustMax: 9500, airframe: { ...F.TRAINER.airframe, elevatorMaxDeflection: 1.5 } }), sTrim = [25].map((v) => F.trim(strong, v));
    ok("!! with an elevator that does NOT run out (3.75 times the travel) and an engine that does not either (9500 N) the STALL ANGLE is what ends the trim: at 25 m/s it converges (on the post-stall branch) with the stick inside +-1 and the throttle inside 0..1, and is infeasible only because the wing is past its stall angle", sTrim.every((t) => t.converged && Math.abs(t.pitch) <= 1 && t.throttle >= 0 && t.throttle <= 1 && t.alpha + 0.035 >= 15 * D2R && !t.feasible), sTrim.map((t) => `${t.speed}: stick ${t.pitch.toFixed(2)} thr ${t.throttle.toFixed(2)} wing alpha ${((t.alpha + 0.035) * R2D).toFixed(1)}`).join("  "));
    for (const v of [30, 45, 52]) {
        const t = T(v), s0 = F.createState({ speed: v, pitch: t.pitchAttitude }), end = run(model, s0, { pitch: t.pitch, throttle: t.throttle }, 20).state, a = F.attitude(end);
        ok(`!! a trimmed aircraft HOLDS: ${v} m/s for 20 s with the controls untouched moves altitude by < 5 cm and speed by < 1 cm/s`, Math.abs(a.altitude - 300) < 0.05 && Math.abs(a.airspeed - v) < 0.01 && Math.abs(end.pos[1]) < 1e-6, `dz=${(a.altitude - 300).toExponential(2)} dV=${(a.airspeed - v).toExponential(2)}`);
    }
}

console.log("\n5. STIFFNESS AND DAMPING, AGAINST HAND-DERIVED ORACLES");
{
    const V = 45, q = 0.5 * RHO * V * V, s0 = cruiseState(), base = F.forcesAndMoments(model, s0, CRUISE);
    const tx = (acc, i) => acc.torque[i];
    // pitch stiffness: the tail sits 4.2 m behind the centre of mass; a change of alpha changes its lift by q S clalpha dalpha and the torque about Y is arm x that
    const at = (dth) => F.forcesAndMoments(model, F.createState({ speed: V, pitch: T45.pitchAttitude + dth }), CRUISE).acc;
    const stiff = (tx(at(0.01), 1) - tx(at(-0.01), 1)) / 0.02, oracleStiff = 4.2 * q * 1.6 * 4.5;
    ok("!! PITCH STIFFNESS dM/dalpha equals arm * q * S_tail * clalpha_tail (the wing's lift acts at the centre of mass and adds none), to 1.5%", rel(stiff, oracleStiff) < 0.015, `${stiff.toFixed(0)} vs ${oracleStiff.toFixed(0)} N m/rad`);
    ok("!! ...and its sign is RESTORING: a nose-up disturbance (alpha up) raises the torque about +Y, which is nose DOWN", stiff > 0);
    const rate = (axis, w = 0.02) => { const wv = [0, 0, 0]; wv[axis] = w; return F.forcesAndMoments(model, { ...s0, w: wv }, CRUISE); };
    const dampPitch = (tx(rate(1).acc, 1) - tx(base.acc, 1)) / 0.02, oraclePitch = -(q * 1.6 * 4.5 * 4.2 * 4.2 / V);
    ok("!! PITCH DAMPING dM/dq equals -q S_tail clalpha arm^2 / V, to 1%", rel(dampPitch, oraclePitch) < 0.01, `${dampPitch.toFixed(0)} vs ${oraclePitch.toFixed(0)} N m s/rad`);
    const dampRoll = (tx(rate(0).acc, 0) - tx(base.acc, 0)) / 0.02, oracleRoll = -(2 * q * 8 * 5.7 * 2.2 * 2.2 / V);
    ok("!! ROLL DAMPING dL/dp equals -2 q S_half clalpha y^2 / V (both wing halves, 2.2 m out), to 2%", rel(dampRoll, oracleRoll) < 0.02, `${dampRoll.toFixed(0)} vs ${oracleRoll.toFixed(0)} N m s/rad`);
    const rudderTorque = (res) => { const f = res.perSurface.rudder.force, m = model.aircraft.surfaces.rudder.mount; return cross3(m, f)[2]; };
    const dampYawRudder = (rudderTorque(rate(2)) - rudderTorque(base)) / 0.02, oracleYaw = -(q * 1.0 * 4.0 * 4.2 * 4.2 / V);
    ok("!! YAW DAMPING of the fin alone equals -q S_fin clalpha arm^2 / V, to 1%", rel(dampYawRudder, oracleYaw) < 0.01, `${dampYawRudder.toFixed(0)} vs ${oracleYaw.toFixed(0)} N m s/rad`);
    const dampYaw = (tx(rate(2).acc, 2) - tx(base.acc, 2)) / 0.02;
    ok("...and the whole aircraft damps yaw a little MORE than the fin does (the wing that is going faster drags more), to within 6% of fin + wing drag", dampYaw < dampYawRudder && rel(dampYaw, oracleYaw - 2 * 2.2 * 2.2 * (2 * q * 8 * base.perSurface.leftWing.cd / V)) < 0.06, `${dampYaw.toFixed(0)} vs fin ${dampYawRudder.toFixed(0)}`);
    // weathervane: slip 5 degrees to the right (relative wind from the right) at the trim alpha
    const slip = 5 * D2R, al = T45.alpha, sv = F.createState({ speed: V, pitch: T45.pitchAttitude });
    sv.vel = rotateByQuat(sv.q, [V * Math.cos(al) * Math.cos(slip), -V * Math.sin(slip), -V * Math.sin(al) * Math.cos(slip)]);
    const sa = F.attitude(sv), sf = F.forcesAndMoments(model, sv, CRUISE);
    ok("beta reads +5 degrees for an aircraft slipping to the right (velocity toward -Y, the right of the nose), alpha unchanged", near(sa.beta, slip, 1e-9) && near(sa.alpha, Math.atan2(Math.sin(al) * Math.cos(slip), Math.cos(al) * Math.cos(slip)), 1e-9), `beta=${(sa.beta * R2D).toFixed(3)}`);
    const oracleWeather = -(q * 1.0 * 4.0 * 4.2 * slip);
    ok("!! WEATHERVANE: a right slip makes a NOSE-RIGHT torque (negative about +Z) of q S_fin clalpha arm beta, to 1% -- the fin turns the nose into the wind", sf.acc.torque[2] < 0 && rel(sf.acc.torque[2], oracleWeather) < 0.01, `${sf.acc.torque[2].toFixed(1)} vs ${oracleWeather.toFixed(1)} N m`);
    const mirrored = F.attitude((() => { const sm = F.createState({ speed: V, pitch: T45.pitchAttitude }); sm.vel = rotateByQuat(sm.q, [V * Math.cos(al) * Math.cos(slip), V * Math.sin(slip), -V * Math.sin(al) * Math.cos(slip)]); return sm; })());
    ok("...and a LEFT slip reads beta = -5 degrees", near(mirrored.beta, -slip, 1e-9));
    // local flow kinematics: the elevator and the left wing half sit in v + w x r, derived here by hand
    const w = [0.3, -0.2, 0.15], sw = { ...s0, w }, fw = F.forcesAndMoments(model, sw, CRUISE), vb = worldToBody(sw.q, sw.vel);
    const expectAlpha = (surf, mount, defl) => { const lv = [vb[0] + w[1] * mount[2] - w[2] * mount[1], vb[1] + w[2] * mount[0] - w[0] * mount[2], vb[2] + w[0] * mount[1] - w[1] * mount[0]]; return Math.atan2(-lv[2], lv[0]) + surf.incidence + defl; };
    const defl = F.surfaceDeflections(model, CRUISE), ea = model.aircraft.surfaces.elevator, lw = model.aircraft.surfaces.leftWing;
    ok("!! each surface sits in the air at ITS point: the elevator's alpha is atan2(-(vz + w x r).z, (vx + w x r).x) + deflection * effectiveness, to 1e-9", near(fw.perSurface.elevator.alpha, expectAlpha(ea, ea.mount, defl.elevator * ea.control.effectiveness), 1e-9), `${fw.perSurface.elevator.alpha.toFixed(9)}`);
    ok("!! ...and so is the left wing half's (a roll rate gives the two halves opposite alphas)", near(fw.perSurface.leftWing.alpha, expectAlpha(lw, lw.mount, defl.leftWing * lw.control.effectiveness), 1e-9) && near(fw.perSurface.leftWing.alpha - fw.perSurface.rightWing.alpha, 2 * 0.3 * 2.2 / V * 1, 0.02) );
}

console.log("\n6. THE PHUGOID -- LANCHESTER'S PERIOD AND THE ENERGY BOOKKEEPING");
{
    const V = 45, s0 = F.createState({ speed: V + 3, pitch: T45.pitchAttitude }), peaks = [], speeds = [];
    let s = s0, alt = 0;
    for (let i = 0; i < 60 * 100; i++) { s = F.stepFlight(model, s, CRUISE).state; speeds.push(F.attitude(s).airspeed); }
    for (let i = 1; i < speeds.length - 1; i++) if (speeds[i] > speeds[i - 1] && speeds[i] >= speeds[i + 1]) peaks.push(i);
    const lanchester = Math.PI * Math.SQRT2 * V / G, period = peaks.length >= 3 ? (peaks[2] - peaks[0]) / 2 / 60 : NaN;
    report("phugoid", `peaks at ${peaks.slice(0, 5).map((i) => (i / 60).toFixed(1)).join(" ")} s, period ${period.toFixed(2)} s, Lanchester ${lanchester.toFixed(2)} s`);
    ok("!! the phugoid period is within 15% of Lanchester's pi sqrt(2) V / g (20.4 s at 45 m/s; the model's drag lengthens it)", rel(period, lanchester) < 0.15 && period > lanchester * 0.95, `${period.toFixed(2)} s vs ${lanchester.toFixed(2)} s`);
    const amp = (i) => speeds[i] - 45;
    ok("!! ...and it is DAMPED: each successive speed peak is lower than the one before it, and by 100 s the aircraft is within 0.5 m/s of cruise again", peaks.length >= 4 && amp(peaks[1]) < amp(peaks[0] || 0) + 3 && amp(peaks[2]) < amp(peaks[1]) && amp(peaks[3]) < amp(peaks[2]) && Math.abs(speeds.at(-1) - 45) < 0.5, `final V ${speeds.at(-1).toFixed(3)}`);
    const gained = s.pos[2] - 300, oracleGain = ((V + 3) ** 2 - speeds.at(-1) ** 2) / (2 * G);
    ok("!! ENERGY: the 3 m/s of extra speed comes back as altitude, v^2/2g, to 20% (drag and the engine take their share)", gained > 0 && rel(gained, oracleGain) < 0.2, `${gained.toFixed(2)} m vs ${oracleGain.toFixed(2)} m`);
}

console.log("\n7. THE STALL -- sqrt(2 W / (rho S Clmax)) AND WHAT HAPPENS PAST IT");
{
    const wing = model.aircraft.surfaces.leftWing;
    let clmax = 0;
    for (let d = 0; d < 40; d += 0.005) { const a = d * D2R - wing.incidence; clmax = Math.max(clmax, A.surfaceForce([Math.cos(a) * 30, 0, -Math.sin(a) * 30], wing).cl); }
    const Vs = Math.sqrt(2 * W / (RHO * 16 * clmax));
    // the wings' best lift at speed V on a level path: scan the attitude, take the world-vertical force of the two wing halves (flow horizontal => the lift is exactly vertical)
    const wingLift = (m, V) => { let best = -1e9; for (let p = -0.1; p < 0.9; p += 0.002) { const s = F.createState({ speed: V, pitch: p }), f = F.forcesAndMoments(m, s, { throttle: 0 }), fz = rotateByQuat(s.q, f.perSurface.leftWing.force)[2] + rotateByQuat(s.q, f.perSurface.rightWing.force)[2]; best = Math.max(best, fz); } return best; };
    const bare = F.createFlightModel({ ...F.TRAINER, stall: null });
    report("stall", `Clmax ${clmax.toFixed(4)}  Vs ${Vs.toFixed(3)} m/s  wing lift/W at 0.97 Vs: ${(wingLift(model, 0.97 * Vs) / W).toFixed(4)}  at Vs ${(wingLift(model, Vs) / W).toFixed(4)}  at 1.05 Vs ${(wingLift(model, 1.05 * Vs) / W).toFixed(4)}  no-stall airframe at 0.97 Vs ${(wingLift(bare, 0.97 * Vs) / W).toFixed(3)}`);
    ok("!! Clmax is the wing's scanned peak: 1.45..1.49, a little PAST the 15 degree stall angle (the blend is still climbing when it starts to separate)", clmax > 1.45 && clmax < 1.49);
    ok("!! THE STALL SPEED: 25.5..26.7 m/s, and at it the wings' best lift IS the weight (0.5%)", Vs > 25.5 && Vs < 26.7 && rel(wingLift(model, Vs), W) < 0.005, `Vs=${Vs.toFixed(3)} lift/W=${(wingLift(model, Vs) / W).toFixed(4)}`);
    ok("!! at 0.97 of it the wings CANNOT carry the weight (their best lift is below it by more than 4%)", wingLift(model, 0.97 * Vs) < 0.96 * W);
    ok("!! at 1.05 of it they can, with 8..12% to spare", wingLift(model, 1.05 * Vs) > 1.08 * W && wingLift(model, 1.05 * Vs) < 1.12 * W);
    ok("!! the same airframe with NO STALL still carries 1.15 times its weight at 0.97 of that speed (it would fly at any speed; this is the control the three rows above are held against)", wingLift(bare, 0.97 * Vs) > 1.15 * W, `${(wingLift(bare, 0.97 * Vs) / W).toFixed(3)} W`);
    // a full pull from cruise: the wing goes past its stall angle and the nose drops
    let s = cruiseState(), maxAlpha = 0, tMax = 0, minPitchAfter = 9, peakAlt = 0;
    const log = [];
    for (let i = 0; i < 60 * 14; i++) { s = F.stepFlight(model, s, { pitch: 1, throttle: 0 }).state; const a = F.attitude(s); log.push(a); if (a.alpha > maxAlpha) { maxAlpha = a.alpha; tMax = i; } peakAlt = Math.max(peakAlt, a.altitude); }
    for (let i = tMax; i < log.length; i++) minPitchAfter = Math.min(minPitchAfter, log[i].pitch);
    report("full pull from 45 m/s, throttle shut", `max alpha ${(maxAlpha * R2D).toFixed(1)} deg at ${(tMax / 60).toFixed(1)} s, peak altitude ${peakAlt.toFixed(0)} m, lowest pitch after that ${(minPitchAfter * R2D).toFixed(1)} deg`);
    ok("!! a FULL PULL from cruise takes the angle of attack past the wing's stall angle by more than 10 degrees", maxAlpha > A.STALL.angle + 10 * D2R, `${(maxAlpha * R2D).toFixed(1)} deg`);
    ok("!! ...and the nose DROPS afterwards: the pitch attitude falls below -20 degrees within the 14 seconds (the stalled aircraft cannot hold its climb)", minPitchAfter < -20 * D2R, `${(minPitchAfter * R2D).toFixed(1)} deg`);
}

console.log("\n8. THE ENGINE");
{
    const at = (V, thr) => { const s = createBody({ mass: 1000, I: [1300, 1800, 2700], pos: [0, 0, 300], vel: [V, 0, 0] }); return F.forcesAndMoments(model, s, { throttle: thr }); };
    for (const [V, thr] of [[0, 1], [0, 0.5], [30, 1], [45, 0.66], [89, 1], [90, 1], [120, 1]]) ok(`!! thrust at ${V} m/s, throttle ${thr}: 4000 * throttle * max(0, 1 - V/90) = ${(4000 * thr * Math.max(0, 1 - V / 90)).toFixed(1)} N`, near(at(V, thr).thrust, 4000 * thr * Math.max(0, 1 - V / 90), 1e-9), `${at(V, thr).thrust.toFixed(3)}`);
    ok("!! a closed throttle makes no thrust at any speed, and a throttle above 1 is read as 1", at(40, 0).thrust === 0 && near(at(40, 7).thrust, at(40, 1).thrust, 1e-12));
    ok("!! the thrust line passes through the centre of mass: switching the throttle from 0 to 1 changes no torque", norm3(at(45, 1).acc.torque.map((x, i) => x - at(45, 0).acc.torque[i])) < 1e-9);
    ok("!! the engine's force is along the nose: the body-frame X force rises by exactly the thrust, Y and Z are untouched", (() => { const a = at(45, 1).acc.force, b = at(45, 0).acc.force; return near(a[0] - b[0], 2000, 1e-9) && near(a[1], b[1], 1e-9) && near(a[2], b[2], 1e-9); })());
}

console.log("\n9. WIND IS A CHANGE OF FRAME");
{
    const wind = [8, -5, 2], s0 = cruiseState(), moved = { ...s0, vel: s0.vel.map((x, i) => x + wind[i]) };
    const a = F.forcesAndMoments(model, s0, CRUISE), b = F.forcesAndMoments(model, moved, CRUISE, wind);
    ok("!! velocity v + u in air moving at u gives the same forces and moments as velocity v in still air (1e-9)", a.acc.force.every((x, i) => near(x, b.acc.force[i], 1e-9)) && a.acc.torque.every((x, i) => near(x, b.acc.torque[i], 1e-9)) && near(a.thrust, b.thrust, 1e-9));
    ok("!! ...and the air data follow: attitude(state, wind) reads the air-relative speed, not the ground speed", near(F.attitude(moved, wind).airspeed, 45, 1e-9) && F.attitude(moved).airspeed > 45.5);
    const c = F.forcesAndMoments(model, moved, CRUISE);
    ok("!! and ignoring the wind is a different answer (the control for the row above: the force differs by more than 100 N)", norm3(c.acc.force.map((x, i) => x - a.acc.force[i])) > 100);
    const r = F.stepFlight(model, moved, CRUISE, 1 / 60, wind), r0 = F.stepFlight(model, s0, CRUISE);
    ok("a step in a steady wind keeps the aircraft's air-relative velocity change identical to the still-air step (to 1e-9)", [0, 1, 2].every((i) => near(r.state.vel[i] - wind[i], r0.state.vel[i], 1e-9)));
}

console.log("\n10. MIRROR SYMMETRY");
{
    // mirror about the aircraft's own x-z plane: y -> -y; a quaternion (w,x,y,z) becomes (w,-x,y,-z); angular velocity (a pseudovector) (wx,wy,wz) becomes (-wx,wy,-wz); roll and yaw commands change sign
    const mirrorState = (s) => ({ ...s, pos: [s.pos[0], -s.pos[1], s.pos[2]], vel: [s.vel[0], -s.vel[1], s.vel[2]], q: [s.q[0], -s.q[1], s.q[2], -s.q[3]], w: [-s.w[0], s.w[1], -s.w[2]] });
    const mirrorC = (c) => ({ ...c, roll: -c.roll, yaw: -c.yaw });
    const s = createBody({ mass: 1000, I: [1300, 1800, 2700], pos: [5, 7, 300], vel: [41, 6, -2], q: F.attitudeQuat(0.4, 0.12, 0.35), w: [0.2, -0.1, 0.15] }), c = { pitch: 0.3, roll: 0.4, yaw: -0.2, throttle: 0.7 };
    const a = F.forcesAndMoments(model, s, c).acc, b = F.forcesAndMoments(model, mirrorState(s), mirrorC(c)).acc;
    const mf = [a.force[0], -a.force[1], a.force[2]], mt = [-a.torque[0], a.torque[1], -a.torque[2]];
    ok("!! the mirrored state under the mirrored controls gives the MIRRORED force (x, -y, z) to 1e-9", mf.every((x, i) => near(x, b.force[i], 1e-9)), `${a.force.map((x) => x.toFixed(2))} -> ${b.force.map((x) => x.toFixed(2))}`);
    ok("!! ...and the mirrored torque (-x, y, -z) to 1e-9", mt.every((x, i) => near(x, b.torque[i], 1e-9)), `${a.torque.map((x) => x.toFixed(2))} -> ${b.torque.map((x) => x.toFixed(2))}`);
    const sym = F.forcesAndMoments(model, cruiseState(), CRUISE).acc;
    ok("!! a SYMMETRIC flight makes no side force, no roll torque and no yaw torque (exactly)", sym.force[1] === 0 && sym.torque[0] === 0 && sym.torque[2] === 0, `${sym.force[1]} ${sym.torque[0]} ${sym.torque[2]}`);
    const m2 = mirrorState(F.stepFlight(model, s, c).state), m3 = F.stepFlight(model, mirrorState(s), mirrorC(c)).state;
    ok("one whole TICK mirrors too: step(mirror) = mirror(step) in velocity, position and rate to 1e-9", m2.vel.every((x, i) => near(x, m3.vel[i], 1e-9)) && m2.pos.every((x, i) => near(x, m3.pos[i], 1e-9)) && m2.w.every((x, i) => near(x, m3.w[i], 1e-9)));
}

console.log("\n11. CONTROLS ARE SANITISED; THE GROUND");
{
    const s = cruiseState(), ref = (c) => JSON.stringify(F.forcesAndMoments(model, s, c).acc);
    ok("!! a control that is not a finite number is read as ZERO and a finite one is clamped: pitch NaN = 0, roll 1e9 = 1, yaw -Infinity = 0, throttle 9 = 1, throttle -3 = 0", ref({ pitch: NaN, roll: 1e9, yaw: -Infinity, throttle: 9 }) === ref({ pitch: 0, roll: 1, yaw: 0, throttle: 1 }) && ref({ yaw: -1 }) !== ref({ yaw: 0 }) && ref({ throttle: -3 }) === ref({ throttle: 0 }) && ref({}) === ref({ pitch: 0, roll: 0, yaw: 0, throttle: 0 }) && ref(undefined) === ref({}));
    ok("!! a NaN control never reaches the physics: the state after a tick is finite", [...F.stepFlight(model, s, { pitch: NaN, roll: NaN, yaw: NaN, throttle: NaN }).state.vel].every(Number.isFinite));
    const tdState = (over) => F.createState({ pos: [0, 0, over.z ?? 1.35], speed: over.speed ?? 30, pitch: over.pitch ?? 4 * D2R, bank: over.bank ?? 0, gamma: over.gamma ?? -3 * D2R, heading: over.heading ?? 0 });
    const land = (over, controls = { throttle: 0, pitch: 0.2 }) => { let s = tdState(over), r = null; for (let i = 0; i < 600; i++) { r = F.stepFlight(model, s, controls); s = r.state; if (r.status !== "airborne") break; } return { s, r }; };
    const gentle = land({});
    ok("!! a 3-degree glide at 30 m/s onto the wheels with the nose 4 degrees up is a TOUCHDOWN, sinking about 1.6 m/s", gentle.r.status === "touchdown" && gentle.r.sink > 1 && gentle.r.sink < 3, `${gentle.r.status} sink ${gentle.r.sink?.toFixed(2)} bank ${(gentle.r.bank * R2D).toFixed(1)} pitch ${(gentle.r.pitch * R2D).toFixed(1)}`);
    const hard = land({ gamma: -12 * D2R, speed: 40, pitch: 0 });
    ok("!! a 12-degree dive onto the wheels (about 8 m/s down) is a CRASH, not a landing", hard.r.status === "crashed" && hard.r.sink > 3, `${hard.r.status} sink ${hard.r.sink?.toFixed(2)}`);
    const banked = land({ bank: 25 * D2R }, { throttle: 0 });
    ok("!! a gentle arrival with 25 degrees of bank is a CRASH (a wing tip arrives first, or the bank is past the limit)", banked.r.status === "crashed", `${banked.r.status} bank ${(banked.r.bank * R2D).toFixed(1)} hull=${banked.r.hull}`);
    // the aircraft descends 2 mm at a time through the ground and the FIRST contact decides (so a low wing, or a tail, that is a few centimetres lower than the wheels is seen as what arrives first)
    const firstContact = ({ bank = 0, pitch = 4 * D2R, gamma = -3 * D2R, speed = 30, w = [0, 0, 0] } = {}) => { const s = F.createState({ pos: [0, 0, 6], speed, pitch, bank, gamma, w }); for (let z = 6; z > -1; z -= 0.002) { s.pos[2] = z; const c = F.classify(model, s); if (c.status !== "airborne") return c; } return null; };
    const lowWing = firstContact({ bank: 16.5 * D2R }), ok14 = firstContact({ bank: 14 * D2R });
    ok("!! 16.5 degrees of bank is past the 15 degree limit: the wheels arrive first (no hull point touches) and it is still a CRASH, by the bank limit alone", lowWing.status === "crashed" && lowWing.hull === false && lowWing.bank > 15 * D2R, `${lowWing.status} bank ${(lowWing.bank * R2D).toFixed(1)} hull=${lowWing.hull}`);
    ok("...and 14 degrees is under it: a touchdown, on the wheels", ok14.status === "touchdown" && ok14.hull === false, `${ok14.status} bank ${(ok14.bank * R2D).toFixed(1)}`);
    // a pitch RATE makes the nose wheel arrive faster than the centre of mass: 1.5 m/s of sink at the CG plus 1 rad/s of nose-down rotation at 1.8 m is 3.3 m/s at the wheel
    const still = firstContact({ pitch: -1 * D2R }), spinning = firstContact({ pitch: -1 * D2R, w: [0, 1.0, 0] });
    ok("!! the SINK SPEED is the contact point's, not the centre of mass's: with no spin the arrival at 3 degrees, 30 m/s is a touchdown, and with 1 rad/s of nose-down rate the nose wheel arrives at 3+ m/s and it is a crash", still.status === "touchdown" && spinning.status === "crashed" && spinning.sink > still.sink + 1, `still ${still.status} ${still.sink.toFixed(2)}  spinning ${spinning.status} ${spinning.sink.toFixed(2)}`);
    const pitchRows = [14, 16, -9, -11].map((deg) => firstContact({ pitch: deg * D2R }));
    ok("!! the PITCH limits are held by the wheels alone: +14 and -9 degrees are touchdowns, +16 (past the +15 limit; the tail is still higher than the mains) and -11 (past -10) are crashes with no hull point touching", pitchRows[0].status === "touchdown" && pitchRows[2].status === "touchdown" && pitchRows[1].status === "crashed" && pitchRows[3].status === "crashed" && pitchRows.every((r) => r.hull === false), pitchRows.map((r) => `${(r.pitch * R2D).toFixed(0)}:${r.status}${r.hull ? "+hull" : ""}`).join(" "));
    const inverted = land({ bank: 175 * D2R }, { throttle: 0 });
    ok("!! an aircraft arriving upside down is a CRASH", inverted.r.status === "crashed");
    const tail = land({ pitch: 22 * D2R, gamma: -3 * D2R }, { throttle: 0 });
    ok("!! a tail-first arrival (22 degrees nose-up) is a CRASH (the tail is a hull point)", tail.r.status === "crashed" && tail.r.hull === true, `${tail.r.status} hull=${tail.r.hull}`);
    const nose = land({ pitch: -14 * D2R, gamma: -3 * D2R }, { throttle: 0 });
    ok("!! 14 degrees nose-DOWN is a CRASH (past the -10 degree limit)", nose.r.status === "crashed", `${nose.r.status} pitch ${(nose.r.pitch * R2D).toFixed(1)}`);
    ok("!! an aircraft 100 m up is AIRBORNE, and a NaN state is LOST", F.classify(model, cruiseState()).status === "airborne" && F.classify(model, { ...cruiseState(), vel: [NaN, 0, 0] }).status === "lost");
    const end = gentle.s, again = F.stepFlight(model, end, { throttle: 1, pitch: 1 });
    ok("!! a flight that has ended STAYS ended: stepFlight on a touched-down state returns the same state object and the same status, whatever the controls", again.state === end && again.status === "touchdown");
    ok("a hull point under the ground is a crash whatever the wheels do: a wing tip 0.1 m under at a 0.5 m/s sink with level wings is still a CRASH", (() => { const s = F.createState({ pos: [0, 0, 5], speed: 30, pitch: 0, bank: 5 * D2R, gamma: 0 }); s.pos[2] = 5.3 * Math.sin(5 * D2R) - 0.1; return F.classify(model, s).status === "crashed"; })());
}

console.log("\n12. DETERMINISM AND FUZZ; THE FRONT DOOR");
{
    let seed = 20264864;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const flight = (n, s0, sd) => {
        let a = sd >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
        let s = s0, h = 0, status = "airborne", ticks = 0;
        for (let i = 0; i < n; i++) {
            const res = F.stepFlight(model, s, { pitch: r() * 2 - 1, roll: r() * 2 - 1, yaw: r() * 2 - 1, throttle: r() }); s = res.state; ticks++;
            if (!([...s.pos, ...s.vel, ...s.q, ...s.w].every(Number.isFinite))) return { finite: false, ticks };
            h = (h * 31 + Math.round(s.pos[2] * 1e6) + Math.round(s.vel[0] * 1e6)) | 0;
            if (res.status !== "airborne") { status = res.status; break; }
        }
        return { finite: true, ticks, h, status, s };
    };
    let allFinite = true, same = true, ended = 0, ticks = 0;
    for (let k = 0; k < 8; k++) {
        const s0 = F.createState({ pos: [0, 0, 2000], speed: 25 + rnd() * 35, heading: rnd() * 6 - 3, pitch: rnd() - 0.5, bank: rnd() * 2 - 1, gamma: (rnd() - 0.5) * 0.4, w: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5] });
        const a = flight(4000, s0, 1000 + k), b = flight(4000, s0, 1000 + k);
        allFinite = allFinite && a.finite; same = same && a.h === b.h && a.ticks === b.ticks && a.status === b.status && a.s.pos.every((x, i) => x === b.s.pos[i]) && a.s.q.every((x, i) => x === b.s.q[i]); if (a.status !== "airborne") ended++; ticks += a.ticks;
    }
    ok("!! eight random flights of up to 4,000 ticks (random controls, random attitudes, random spins) stay finite throughout", allFinite, `${ticks} ticks, ${ended} ended on the ground`);
    ok("!! ...and a second run of the same flights is BIT-IDENTICAL (position, attitude, the hash of every tick, where it ended)", same);
    const L = F.reportLines();
    ok("the front door names the module, prints a trim table with a feasible row and a top speed, and no line says NaN or undefined", L.some((l) => /flightModel6dof/.test(l)) && L.some((l) => /trim 45 m\/s/.test(l) && /feasible/.test(l) && !/NOT feasible/.test(l)) && L.some((l) => /top level speed/.test(l)) && L.every((l) => !/NaN|undefined/.test(l)));
}

console.log(fails ? `\nflightModel6dof-selfcheck: ${fails} FAILED` : "\nflightModel6dof-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
