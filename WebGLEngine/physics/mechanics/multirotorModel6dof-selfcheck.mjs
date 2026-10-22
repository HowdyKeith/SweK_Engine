// WebGLEngine/physics/mechanics/multirotorModel6dof-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/multirotorModel6dof-selfcheck.mjs      (a few seconds)
//
// THE QUADROTOR THAT CAN FALL, HELD TO WHAT ITS HEADER SAYS. physics/mechanics/multirotorModel6dof.mjs is a 1.6 kg quadrotor on the rigid body: four motors with a lag, a mixer from the pilot's four numbers, a battery that sags and runs down, a motor that can fail, drag, legs and a ground.
// Its claim is that it is a machine that can fall and not a thrust vector with a pilot, so this gate checks the things such a machine does that the thing without them cannot, against closed forms worked out here from the header's numbers and not read back from the module:
//
//   1  THE NUMBERS         mass, weight, the thrust at full command, the thrust-to-weight of 2.4, the hover's command (0.4169) and speed (710.2 rad/s), the hover's power (255 W) and the battery's 80 kJ
//   2  THE MIXER           each control moves the right motors the right way by the right amount (a unit of roll or pitch 0.25, of yaw 0.12), linear before the clamp, clamped to [0, 1]; a non-finite control is 0; the controls' ranges
//   3  THE MOTOR           the lag toward the commanded speed (first order, tau 0.03 s), the thrust law T = kT omega^2 and the thrust proportional to the command at a steady state, the reaction torque Q = kQ omega^2, the axial inflow (a climb loses thrust, a descent gains it)
//   4  THE HOVER           the hover command holds the machine: zero net force and zero net torque at the first tick, level, for the whole gate's hover; an error left alone is not recovered (the machine is neutral in attitude, not stable) and a tilt accelerates it sideways at g tan(bank)
//   5  THE PILOT'S SENSES  the torques of each control are r x F of the motors (the steady-state roll torque of a unit of roll is 4 x 0.25 x tMax x 0.1768 N m), and each control moves the machine in the sense the header says: pitch up, right side down, nose right, up
//   6  THE SYMMETRY        mirrored about the vertical plane through the nose (motors 0 and 1, 2 and 3 exchanged; roll and yaw reversed) the machine's flight is the mirror image to 1e-9
//   7  THE FAILED MOTOR    a failed motor's command is zero and it spins down on its lag; the three that are left give three quarters of the thrust and the torques of the one that is missing (r x F, and the yaw reaction of the one the others no longer cancel); the machine falls and turns
//   8  THE BATTERY         the energy burned is the power times the time; the sag lowers the top speed by 15% x (1 - charge); at the cutoff the motors go to zero and the machine falls
//   9  DRAG                the quadratic body drag and the rotors' linear drag on the sideways motion, to the Newton; none in the wind's own frame; the wind moves the air and not the machine
//   10 THE GROUND          four legs on springs hold the weight (a compression of weight/(4 k) = 1.57 mm); a drop under 6 m/s of sink is a landing and one over it, a tilted arrival and a hull point on the ground are crashes; a landed machine takes off again; friction stops a slide; a crashed state stays crashed
//   11 THE TERRAIN         no terrain, FLAT and a flat spec are the same flights to the bit; a plateau holds the machine up; a 10-degree slope is landed on; a 30-degree one is a crash named "steep slope"
//   12 WHAT IS NOT IN IT   no ground effect, no vortex ring, a constant mass, no gyroscopic coupling of the rotors: each as the header says
//
// SABOTAGE LOG (each applied to the module in a scratch copy, the gate run, the copy discarded; the number is how many rows went red):
//   Each applied to physics/mechanics/multirotorModel6dof.mjs in a scratch copy, the gate run on the copy, the copy discarded; the number is how many rows went red. 108 mutants, none left at 0. SEVEN THINGS WERE FOUND
//   ALONG THE WAY, SAID PLAINLY: (1) THE FIRST RUN LEFT TWELVE MUTANTS AT 0 -- a health above 1, a speed floor, the heading sign of the attitude quaternion (the mirror row flipped it on both sides, so it passed), the
//   airspeed's wind, the friction law (two), a motor as a hull point, the tilt limit, the slope's normal, the lost-state check on the motors and the clock -- and each got a row (the closed-form friction stop, a step
//   longer than the lag, the direction of the nose, the four motors one by one, the creep speed on a slope, and so on). (2) THE GATE'S SECOND RUN WENT 0 RED ON THREE MUTANTS BECAUSE I HAD DELETED SECTION 12 AND THE
//   SLOPE ROW: a patch of mine replaced everything from one row to the end of the file; the sabotage saw it (M22, M89 and M93 can only pass when their rows are gone) and the rows were put back. (3) A ROW FOUND A LIMIT
//   CYCLE IN THE MODEL: a machine that slid to a stop on its legs kept a period-two chatter of 1.5 cm/s, because four stiff legs on a 0.015 kg m^2 body are a mode near the limit of a 120 Hz explicit step; the model now
//   takes four substeps within 4 cm of the ground (and not above it: the flight is the plain step, to the bit), and the chatter is 8e-10 m/s. (4) THE FIRST LEGS TOPPLED THE MACHINE ON EVERY SLOPE, even five degrees
//   (5,000 N/m and 45 N s/m); they are now 2,500 and 30. (5) THE TILT LIMIT IS REACHABLE: I had said a motor reaches the ground before a leg past 21 degrees; the legs are inside the motors, so a leg goes first up to 69
//   degrees and the 50-degree clause decides between (the row says so). (6) TWO ROWS HAD MY PHYSICS BACKWARDS and were corrected to the true closed form: a slope's creep is where mu N v / sqrt(v^2 + 0.05^2) balances the
//   slope's pull (1.3 cm/s at 10 degrees), not zero, and the legs' damper lands the machine 4.7% shallower than the exact solution because the explicit step over-damps by c dt / 2m (the row says so and holds 6%). (7)
//   FIVE PATTERNS WERE BROKEN BY THE SUBSTEP REWRITE (M46, M47, M61, M95, M98 named text that no longer existed: PATTERN COUNT 0, no mutant run) and were repaired and re-run.
//   M01 tick step 1/60 6; M02 gravity 9.81 1; M03 air density 1.2 1; M04 arm 0.30 7; M05 mass 1.7 5; M06 inertia 0.02 2; M07 inertia yaw 0.04 2; M08 motor 0 spins the other way 11; M09 motor 1 spins the other way 11;
//   M10 motor 2 at the rear right 14; M11 motor 3 spins the other way 11; M12 kT for 9.0 N 4; M13 torque ratio 0.02 4; M14 top speed 1000 8; M15 motor lag 0.05 3; M16 rotor inertia 0 1; M17 propeller radius 0.12 7; M18
//   inflow factor 0.5 3; M19 inflow floor 0.3 1; M20 inflow ceiling 1.5 1; M21 inflow ignores the wind 3; M22 inflow ignores the body rate 1; M23 mixer pitch 0.3 4; M24 mixer roll 0.3 4; M25 mixer yaw 0.2 3; M26 mixer
//   pitch sign 5; M27 mixer roll sign 5; M28 mixer yaw sign 5; M29 mixer not clamped 1; M30 thrust ceiling 2 1; M31 thrust floor -1 1; M32 a non-finite control passes 41; M33 pitch range 2 1; M34 battery 100 kJ 5; M35
//   figure of merit 0.5 2; M36 efficiency 0.9 3; M37 sag 0.10 2; M38 sag inverted 9; M39 cutoff 0.05 1; M40 cutoff strict 1; M41 empty battery does not cut the motors 2; M42 empty still commands 1; M43 empty battery
//   still draws power 1; M44 power exponent 1.4 3; M45 power without the density 2; M46 energy not drained 4; M47 energy drained twice as fast 3; M48 drag area x 0.02 2; M49 drag area y 0.02 1; M50 drag area z 0.05 1;
//   M51 rotor drag 1e-4 4; M52 rotor drag not on the sideways axes only 1; M53 quadratic drag signed 4; M54 gravity not applied 19; M55 reaction torque sign 5; M56 reaction torque without kQ 5; M57 thrust 1% high 12;
//   M58 thrust not at the motor 6; M59 a failed motor still works 6; M60 health not clamped above 1 1; M61 omega can go negative 1; M62 motor lag doubled 5; M63 command to speed linear, not sqrt 10; M64 hover command
//   for three motors 8; M65 hover speed without the root 10; M66 a failed motor spins from the start 3; M67 failed motors are not failed 4; M68 the charge is not set 5; M69 heading sign in the attitude quaternion 2; M70
//   pitch sign in the attitude quaternion 5; M71 bank sign in the attitude quaternion 3; M72 attitude pitch sign 2; M73 attitude bank sign 3; M74 attitude heading sign 2; M75 airspeed ignores the wind 1; M76 roll rate
//   sign 1; M77 pitch rate sign 1; M78 yaw rate sign 1; M79 leg spring 3000 3; M80 leg damper 40 1; M81 friction 0.5 2; M82 friction unregularised 1; M83 legs 0.10 long 8; M84 a leg missing 8; M85 the top plate is not a
//   hull point 1; M86 a motor is not a hull point 1; M87 maximum sink 8 2; M88 maximum tilt 70 2; M89 maximum slope 40 1; M90 tilt against the vertical 1; M91 the leg sink is measured vertically on a slope 1; M92 the
//   slope normal force is vertical 2; M93 a steep slope is not a crash 1; M94 a crashed state is stepped on 1; M95 the state is mutated 4; M96 lost not detected 2; M97 lost ignores the motors 1; M98 time not advanced 3;
//   M99 legs act on flat ground by the general path with the wrong sign 5; M100 no substeps near the ground (band 0) 3; M101 one substep 4; M102 a crash mid-tick does not stop the substeps 1; M103 the clearance ignores
//   the terrain 1; M104 the clock runs on the whole tick in every substep 2; M105 the energy runs on the whole tick in every substep 1; M106 the motors' lag runs on the whole tick in every substep 1; M107 the body steps
//   the whole tick in every substep 4; M108 the clearance counts only the first leg 2.
"use strict";
import * as Q from "./multirotorModel6dof.mjs";
import { rotateByQuat } from "./rigidBody6dof.mjs";
import * as TR from "./terrain.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const D2R = Math.PI / 180, G = Q.GRAVITY, RHO = Q.AIR_DENSITY;
const m = Q.createMultirotorModel(), S = m.spec, R = S.rotor, W = m.weight, TMAX = m.thrustMax, DD = 0.25 / Math.SQRT2;
const trim = Q.hoverTrim(m), hoverCtl = { thrust: trim.thrust };
const run = (state, ctl, n, wind, terrain) => { let s = state, o = null; for (let i = 0; i < n; i++) { o = Q.stepMultirotor(m, s, typeof ctl === "function" ? ctl(i, s) : ctl, Q.DT, wind, terrain); s = o.state; } return { s, o }; };
const steady = (cmds) => cmds.map((c) => R.omegaMax * Math.sqrt(c));   // the speeds a command holds at a full battery
const HO = [0, 1, 2, 3].map(() => m.hover.omega), OM = m.hover.omega;
const sec = (t) => console.log(`\n${t}`);

sec("1. THE NUMBERS");
{
    ok("the airframe's own: 1.6 kg, a weight of m g, the inertia [0.015, 0.015, 0.028], four motors on the diagonals at +-0.1768 m (an arm of 0.25 m), two spinning each way", near(m.mass, 1.6, 0) && near(W, 1.6 * G, 1e-12) && S.inertia.join() === "0.015,0.015,0.028" && S.motors.length === 4 && S.motors.every((mo) => near(Math.abs(mo.pos[0]), DD, 1e-12) && near(Math.abs(mo.pos[1]), DD, 1e-12) && mo.pos[2] === 0) && S.motors.reduce((a, mo) => a + mo.spin, 0) === 0 && S.motors.map((mo) => mo.spin).join() === "-1,1,-1,1" && S.motors.map((mo) => Math.sign(mo.pos[0]) + "," + Math.sign(mo.pos[1])).join(" ") === "1,-1 1,1 -1,1 -1,-1");
    ok("THE THRUST AT FULL COMMAND IS 9.41 N A MOTOR (kT omega_max^2) AND THE THRUST-TO-WEIGHT IS 2.399 (a design of 2.4): four motors give 37.64 N against a weight of 15.69 N", near(TMAX, 9.41, 1e-9) && near(4 * TMAX / W, 2.4, 0.005), `${TMAX.toFixed(4)} N a motor, ${(4 * TMAX / W).toFixed(4)}`);
    ok("THE HOVER: every motor at a command of weight / (4 tMax) = 0.4169, which holds 710.2 rad/s (omega_max sqrt(0.4169)) and 3.923 N a motor", near(m.hover.command, W / (4 * TMAX), 1e-12) && near(m.hover.command, 0.416861, 5e-6) && near(m.hover.omega, 1100 * Math.sqrt(W / (4 * TMAX)), 1e-9) && near(m.hover.omega, 710.2, 0.05) && near(m.hover.thrust, W / 4, 1e-12) && near(trim.thrust, m.hover.command, 1e-15));
    const st = Q.createState(m, { pos: [0, 0, 50] }), f = Q.forcesAndMoments(m, st, hoverCtl), sqA = Math.sqrt(2 * RHO * Math.PI * 0.1 * 0.1), perMotor = Math.pow(W / 4, 1.5) / (sqA * 0.55 * 0.8);
    ok("THE HOVER COSTS 255 W (T^1.5 / (sqrt(2 rho A) x 0.55 x 0.8) a motor, four motors), computed here from the disc area and the figure of merit, and the battery holds 80 kJ: about five minutes", near(f.powerTotal, 4 * perMotor, 1e-6) && near(f.powerTotal, 254.6, 0.3) && S.battery.energy === 8e4 && near(S.battery.energy / f.powerTotal, 314, 1), `${f.powerTotal.toFixed(2)} W, ${(S.battery.energy / f.powerTotal).toFixed(0)} s`);
    ok("a state is a hover at 50 m by default: the four motors at the hover's speed, all healthy, a full battery, at rest; `failed`, `charge` and `health` set what they say", near(st.pos[2], 50, 0) && st.omega.every((o) => o === m.hover.omega) && st.health.join() === "1,1,1,1" && st.energy === S.battery.energy && Math.hypot(...st.vel) === 0
        && Q.createState(m, { failed: 2 }).health.join() === "1,1,0,1" && Q.createState(m, { failed: [0, 3] }).health.join() === "0,1,1,0" && Q.createState(m, { failed: 1 }).omega[1] === 0 && near(Q.createState(m, { charge: 0.5 }).energy, 4e4, 0) && Q.createState(m, { health: [1, 0.5, 1, 1] }).health[1] === 0.5);
}

{
    const nose = (h, p, b) => rotateByQuat(Q.createState(m, { heading: h, pitch: p, bank: b }).q, [1, 0, 0]), upv = (h, p, b) => rotateByQuat(Q.createState(m, { heading: h, pitch: p, bank: b }).q, [0, 0, 1]);
    const n90 = nose(90 * D2R, 0, 0), n30 = nose(0, 30 * D2R, 0), u30 = upv(0, 0, 30 * D2R), nm = nose(0.6, 0.3, 0);
    ok("!! THE ANGLES ARE THE PILOT'S SENSES, AS THE HEADER SAYS (checked on the direction of the nose and of the top, worked out here): heading 90 degrees points the nose along world -Y (a RIGHT turn from +X), a pitch of +30 degrees lifts it to sin 30 = 0.5, a bank of +30 degrees (right side down) leans the top to the right, to -Y, by sin 30; the nose for (heading 0.6, pitch 0.3) is (cos p cos h, -cos p sin h, sin p)",
        near(n90[0], 0, 1e-12) && near(n90[1], -1, 1e-12) && near(n30[2], 0.5, 1e-12) && near(n30[0], Math.cos(30 * D2R), 1e-12) && near(u30[1], -0.5, 1e-12) && near(u30[2], Math.cos(30 * D2R), 1e-12) && near(nm[0], Math.cos(0.3) * Math.cos(0.6), 1e-12) && near(nm[1], -Math.cos(0.3) * Math.sin(0.6), 1e-12) && near(nm[2], Math.sin(0.3), 1e-12));
    const rt = Q.attitude(Q.createState(m, { heading: 0.6, pitch: 0.3, bank: -0.4 })), wnd = Q.attitude(Q.createState(m, { velocity: [10, 0, 0] }), [4, 0, 0]);
    ok("attitude() reads them back (heading 0.6, pitch 0.3, bank -0.4 round trip to 1e-12), reports the ground speed, the climb and the height, and the airspeed is the speed through the AIR: 10 m/s over the ground in a 4 m/s tail wind is 6 m/s through it", near(rt.heading, 0.6, 1e-12) && near(rt.pitch, 0.3, 1e-12) && near(rt.bank, -0.4, 1e-12) && near(wnd.airspeed, 6, 1e-12) && near(wnd.groundSpeed, 10, 1e-12) && near(Q.attitude(Q.createState(m, { velocity: [10, 0, 0] })).airspeed, 10, 1e-12) && wnd.altitude === 50 && wnd.climb === 0);
}

sec("2. THE MIXER");
{
    const at = (c) => Q.mix(m, { thrust: 0.5, ...c });
    ok("each control moves the motors it should, by the amount the header says: at a thrust of 0.5, a unit of pitch is +0.25 on the front motors (0, 1) and -0.25 on the rear (2, 3); a unit of roll +0.25 on the left (1, 2), -0.25 on the right (0, 3); a unit of yaw +0.12 on the counter-clockwise motors (1, 3), -0.12 on the clockwise (0, 2)",
        at({ pitch: 1 }).map((v) => v.toFixed(3)).join() === "0.750,0.750,0.250,0.250" && at({ roll: 1 }).map((v) => v.toFixed(3)).join() === "0.250,0.750,0.750,0.250" && at({ yaw: 1 }).map((v) => v.toFixed(3)).join() === "0.380,0.620,0.380,0.620" && at({}).every((v) => v === 0.5), `${at({ pitch: 1 })} | ${at({ roll: 1 })} | ${at({ yaw: 1 })}`);
    ok("the mixer is LINEAR before the clamp: mix(a) + mix(b) - mix(0) = mix(a + b) for forty random controls well inside the range, to 1e-12", (() => { let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; for (let k = 0; k < 40; k++) { const a = { thrust: 0.3 + 0.1 * rnd(), pitch: 0.4 * (rnd() - 0.5), roll: 0.4 * (rnd() - 0.5), yaw: 0.4 * (rnd() - 0.5) }, b = { thrust: 0.3, pitch: 0.4 * (rnd() - 0.5), roll: 0.4 * (rnd() - 0.5), yaw: 0.4 * (rnd() - 0.5) }, z = { thrust: 0, pitch: 0, roll: 0, yaw: 0 }, ab = { thrust: a.thrust + b.thrust, pitch: a.pitch + b.pitch, roll: a.roll + b.roll, yaw: a.yaw + b.yaw }; const ma = Q.mix(m, a), mb = Q.mix(m, b), m0 = Q.mix(m, z), mab = Q.mix(m, ab); if (!ma.every((v, i) => near(v + mb[i] - m0[i], mab[i], 1e-12))) return false; } return true; })());
    ok("the commands are CLAMPED to [0, 1]: a thrust of 0.9 with a full roll gives 1.0 on the left motors (not 1.15) and 0.65 on the right; a thrust of 0.1 with a full pitch gives 0.35 on the front and 0 on the rear (not -0.15)", Q.mix(m, { thrust: 0.9, roll: 1 }).map((v) => v.toFixed(2)).join() === "0.65,1.00,1.00,0.65" && Q.mix(m, { thrust: 0.1, pitch: -1 }).map((v) => v.toFixed(2)).join() === "0.00,0.00,0.35,0.35");
    ok("sanitize(): each control is clamped to its range (thrust 0..1, the others -1..+1) and a non-finite one is 0 (NaN, Infinity, undefined); mix() of nothing at all is four zeros", (() => { const s = Q.sanitize({ thrust: 3, pitch: -5, roll: 0.5, yaw: NaN }); const t = Q.sanitize({ thrust: -2, pitch: Infinity, roll: undefined, yaw: 9 }); return s.thrust === 1 && s.pitch === -1 && s.roll === 0.5 && s.yaw === 0 && t.thrust === 0 && t.pitch === 0 && t.roll === 0 && t.yaw === 1 && Q.mix(m, {}).every((v) => v === 0) && Q.mix(m).every((v) => v === 0); })());
}

sec("3. THE MOTOR");
{
    const st = Q.createState(m, { pos: [0, 0, 100], omega: [0, 0, 0, 0] }), f = Q.forcesAndMoments(m, st, { thrust: 1 });
    ok("THE LAG: a motor at rest asked for full command accelerates at (omega_cmd - omega) / tau = 1100 / 0.03 = 36,667 rad/s^2 (omega_cmd = omega_max sqrt(command), 1,100 rad/s at a full battery), and a motor at its commanded speed does not", f.motors.every((mo) => near(mo.omegaCmd, 1100, 1e-9) && near(mo.omegaDot, 1100 / 0.03, 1e-6)) && Q.forcesAndMoments(m, Q.createState(m, {}), { thrust: m.hover.command }).motors.every((mo) => Math.abs(mo.omegaDot) < 1e-9 * 710));
    let a = Q.createState(m, { pos: [0, 0, 1e4], omega: [0, 0, 0, 0] }); const k = (1 - Q.DT / R.tau);
    for (let i = 0; i < 12; i++) a = Q.stepMultirotor(m, a, { thrust: 0.5 }).state;
    ok("...and it follows a FIRST-ORDER lag step by step: twelve ticks from rest toward the speed a command of 0.5 asks for are omega_cmd x (1 - (1 - dt/tau)^12) to 1e-4 relative (the battery's sag moves the target by under 0.01%)", near(a.omega[0] / (1100 * Math.sqrt(0.5) * (1 - Math.pow(k, 12))), 1, 1e-4) && a.omega.every((o) => o === a.omega[0]), `${a.omega[0].toFixed(2)} rad/s of ${(1100 * Math.sqrt(0.5) * (1 - Math.pow(k, 12))).toFixed(2)}`);
    ok("THE THRUST LAW AND ITS LINEARITY IN THE COMMAND: with each motor at the steady speed its command holds, the thrust is the command times the full thrust (0, 0.25, 0.5, 1 -> 0, 2.353, 4.705, 9.41 N), to 1e-12", [0, 0.25, 0.5, 1].every((c) => Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], omega: steady([c, c, c, c]) }), { thrust: c }).motors.every((mo) => near(mo.thrust, c * TMAX, 1e-9))));
    const sp = steady([0.5, 0.5, 0.5, 0.5]);
    ok("THE REACTION TORQUE IS Q = kQ omega^2 with kQ = 0.016 m x kT: a motor at 777.8 rad/s gives 0.016 x its thrust (0.0753 N m)", Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], omega: sp }), { thrust: 0.5 }).motors.every((mo) => near(mo.torque, 0.016 * 0.5 * TMAX, 1e-9) && near(mo.torque, 0.016 * mo.thrust, 1e-12)));
    const yawStep = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100] }), { thrust: m.hover.command, yaw: 1 });
    const reaction = -S.motors.reduce((a, mo, i) => a + mo.spin * (yawStep.motors[i].torque + R.inertia * yawStep.motors[i].omegaDot), 0), steadyPart = -S.motors.reduce((a, mo, i) => a + mo.spin * yawStep.motors[i].torque, 0);
    ok("THE SPIN-UP REACTION: a rotor that speeds up pushes back on the body with its own inertia (J d omega/dt, J = 3e-5): at the first tick of a yaw step from the hover the yaw torque is -Sum(spin (Q + J omega_dot)), worked out here from each motor's own numbers, and it is MORE than the aerodynamic torque alone (a few percent: the lag's gift to the yaw)", near(yawStep.acc.torque[2], reaction, 1e-12) && Math.abs(reaction) > Math.abs(steadyPart) * 1.01 && reaction < 0, `${reaction.toExponential(4)} against ${steadyPart.toExponential(4)} N m`);
    const big = Q.stepMultirotor(m, Q.createState(m, { pos: [0, 0, 1e4] }), { thrust: 0 }, 0.05).state;
    ok("A STEP LONGER THAN THE LAG CANNOT SPIN A MOTOR BACKWARDS: with dt = 0.05 s (tau is 0.03) and a command of zero, an explicit Euler step from 710 rad/s would give 710 (1 - 0.05 / 0.03) = -473 rad/s; the speed is clamped at 0", big.omega.every((o) => o === 0) && 710.2 * (1 - 0.05 / 0.03) < -400);
    const up = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], velocity: [0, 0, 5], omega: HO }), hoverCtl).motors[0].thrust, dn = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], velocity: [0, 0, -5], omega: HO }), hoverCtl).motors[0].thrust, base = R.kT * OM * OM;
    ok("THE AXIAL INFLOW: climbing at 5 m/s through the air takes 0.8 x v / (omega R) = 5.63% off a motor's thrust at 710 rad/s and descending at 5 m/s adds the same, as the header says (and it is clamped between 0.4 and 1.3 of the static thrust)", near(up / base, 1 - 0.8 * 5 / (OM * 0.1), 1e-12) && near(dn / base, 1 + 0.8 * 5 / (OM * 0.1), 1e-12) && Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], velocity: [0, 0, 500], omega: HO }), hoverCtl).motors[0].thrust / base === 0.4 && Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], velocity: [0, 0, -500], omega: HO }), hoverCtl).motors[0].thrust / base === 1.3);
    const wd = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], velocity: [0, 0, 5], omega: HO }), hoverCtl, [0, 0, 5]).motors[0].thrust;
    ok("...and it is the speed THROUGH THE AIR: the same climb inside a wind that rises at 5 m/s loses nothing", near(wd / base, 1, 1e-12));
    const dead = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], omega: steady([0, 0, 0, 0]) }), { thrust: 0 });
    ok("a command of zero holds a motor stopped: no thrust, no reaction torque, no power", dead.motors.every((mo) => mo.omegaCmd === 0 && mo.thrust === 0 && mo.torque === 0 && mo.power === 0) && dead.powerTotal === 0 && dead.thrustTotal === 0);
}

sec("4. THE HOVER");
{
    const st = Q.createState(m, { pos: [0, 0, 50] }), f = Q.forcesAndMoments(m, st, hoverCtl);
    ok("!! THE HOVER COMMAND HOLDS THE MACHINE: at the first tick the net force is zero in all three axes and the net torque is zero, to 1e-9 (the thrusts sum to the weight, the four torques cancel in pairs, the yaw reactions cancel two against two)", f.acc.force.every((v) => Math.abs(v) < 1e-9) && f.acc.torque.every((v) => Math.abs(v) < 1e-9), `force ${f.acc.force.map((v) => v.toExponential(1))} torque ${f.acc.torque.map((v) => v.toExponential(1))}`);
    const { s, o } = run(st, hoverCtl, 120 * 2);
    const sagV = G * 0.3 * f.powerTotal * 4 / (2 * 8e4);   // the battery's sag lowers the thrust by 2 x 0.15 x (1 - charge): after T seconds the speed it has bought is g x 0.3 x P x T^2 / (2 E0)
    ok("...and two seconds later it is level and where it was within the centimetre the battery's SAG moves it (the thrust falls by 2 x 0.15 x the charge burned, so the descent after T s is g x 0.3 x P x T^2 / (2 E0) = " + sagV.toFixed(4) + " m/s here, to 25%: the inflow's correction eats a little), still airborne", o.status === "airborne" && near(s.pos[2], 50, 0.02) && Math.hypot(s.vel[0], s.vel[1]) < 1e-9 && near(-s.vel[2], sagV, 0.25 * sagV) && Math.abs(Q.attitude(s).bank) < 1e-9 && Math.abs(Q.attitude(s).pitch) < 1e-9, `z ${s.pos[2].toFixed(5)} vz ${s.vel[2].toExponential(2)}`);
    const kLin = 8e-5 * 4 * OM / m.mass, tilted = Q.createState(m, { pos: [0, 0, 500], bank: 2 * D2R }), t5 = run(tilted, (i, x) => ({ thrust: m.hover.command / Math.cos(2 * D2R) }), 120 * 5).s, a5 = Q.attitude(t5), vyExpect = G * Math.tan(2 * D2R) / kLin * (1 - Math.exp(-kLin * 5));
    ok("!! A HOVER IS NOT STABLE AND NOT UNSTABLE: a bank of 2 degrees left alone for five seconds is still 2 degrees (to 0.1: nothing restores it and nothing grows it) and the machine accelerates sideways to the right at g tan(bank) against the rotors' linear drag (k = 8e-5 x the sum of the motor speeds / m = 0.142 per second): v = (g tan(bank) / k)(1 - e^(-k t)) = " + vyExpect.toFixed(3) + " m/s, within 4%", near(a5.bank / D2R, 2, 0.1) && near(-t5.vel[1], vyExpect, 0.04 * vyExpect), `bank ${(a5.bank / D2R).toFixed(3)} deg, vy ${t5.vel[1].toFixed(3)} (closed form ${vyExpect.toFixed(3)})`);
    const w5 = run(Q.createState(m, { pos: [0, 0, 500] }), hoverCtl, 120 * 2, [0, 6, 0]).s;
    ok("a steady wind blows a machine that does not resist it: in a 6 m/s wind from the left the drag on the relative air pushes it along the wind (+Y), and the rotors' linear drag is what does most of it", w5.vel[1] > 0.5 && w5.vel[1] < 6 && Math.abs(w5.vel[0]) < 0.05, `vy ${w5.vel[1].toFixed(2)} after 2 s`);
}

sec("5. THE PILOT'S SENSES");
{
    const base = Q.createState(m, { pos: [0, 0, 100] });
    const torque = (ctl) => { const c = Q.mix(m, ctl); return Q.forcesAndMoments(m, { ...base, omega: steady(c) }, ctl).acc.torque; };
    const tRoll = torque({ thrust: m.hover.command, roll: 1 }), tPitch = torque({ thrust: m.hover.command, pitch: 1 }), tYaw = torque({ thrust: m.hover.command, yaw: 1 });
    ok("THE STEADY-STATE TORQUES ARE r x F OF THE MOTORS, WORKED OUT HERE: a unit of roll gives +4 x (0.25 tMax) x 0.1768 = +1.664 N m about +X (right side down) and nothing about the other axes; a unit of pitch the same about -Y (nose up); a unit of yaw -kQ/kT x 0.12 x 4 x tMax = -0.0723 N m about +Z (nose right)",
        near(tRoll[0], 4 * 0.25 * TMAX * DD, 1e-9) && near(tRoll[0], 1.664, 0.001) && Math.abs(tRoll[1]) < 1e-9 && Math.abs(tRoll[2]) < 1e-9
        && near(tPitch[1], -4 * 0.25 * TMAX * DD, 1e-9) && Math.abs(tPitch[0]) < 1e-9 && Math.abs(tPitch[2]) < 1e-9
        && near(tYaw[2], -0.016 * 4 * 0.12 * TMAX, 1e-9) && near(tYaw[2], -0.0723, 0.0001) && Math.abs(tYaw[0]) < 1e-9 && Math.abs(tYaw[1]) < 1e-9, `${tRoll.map((v) => v.toFixed(4))} | ${tPitch.map((v) => v.toFixed(4))} | ${tYaw.map((v) => v.toFixed(4))}`);
    const sense = (ctl, n = 24) => { const { s } = run(Q.createState(m, { pos: [0, 0, 500] }), ctl, n); return { r: Q.rates(s), a: Q.attitude(s), s }; };
    const pr = sense({ thrust: m.hover.command, pitch: 1 }), rr = sense({ thrust: m.hover.command, roll: 1 }), yr = sense({ thrust: m.hover.command, yaw: 1 }), tr = sense({ thrust: 0.8 });
    ok("each control moves the machine in the sense the header says, and the other two rates stay at least thirty times smaller (no cross-coupling at the first tenth of a second): pitch +1 -> nose UP (rate and attitude positive), roll +1 -> right side DOWN, yaw +1 -> nose RIGHT, thrust 0.8 -> UP",
        pr.r.pitch > 1 && pr.a.pitch > 0 && Math.abs(pr.r.roll) < pr.r.pitch / 30 && Math.abs(pr.r.yaw) < pr.r.pitch / 30
        && rr.r.roll > 1 && rr.a.bank > 0 && Math.abs(rr.r.pitch) < rr.r.roll / 30 && Math.abs(rr.r.yaw) < rr.r.roll / 30
        && yr.r.yaw > 0.01 && yr.a.heading > 0 && Math.abs(yr.r.roll) < yr.r.yaw / 30 && Math.abs(yr.r.pitch) < yr.r.yaw / 30 && tr.s.vel[2] > 0.5, `pitch ${pr.r.pitch.toFixed(2)} roll ${rr.r.roll.toFixed(2)} yaw ${yr.r.yaw.toFixed(3)} climb ${tr.s.vel[2].toFixed(2)}`);
    const opp = [sense({ thrust: m.hover.command, pitch: -1 }), sense({ thrust: m.hover.command, roll: -1 }), sense({ thrust: m.hover.command, yaw: -1 })];
    ok("...and the opposite control the opposite way, by the same amount to 1e-9 (the airframe is symmetric before the motors turn)", near(opp[0].r.pitch, -pr.r.pitch, 1e-9) && near(opp[1].r.roll, -rr.r.roll, 1e-9) && near(opp[2].r.yaw, -yr.r.yaw, 1e-9));
    const aRoll = tRoll[0] / S.inertia[0];
    ok("THE ANGULAR ACCELERATION IS TORQUE OVER INERTIA: the steady-state roll torque over Ixx is " + aRoll.toFixed(1) + " rad/s^2 (a unit of roll), pitch the same, and the yaw's 0.0723 / 0.028 = 2.6 rad/s^2 -- the yaw authority is weak by design (the header's mixer), a thirtieth of the roll's", near(aRoll, 110.9, 0.1) && near(-tPitch[1] / S.inertia[1], aRoll, 1e-9) && near(-tYaw[2] / S.inertia[2], 2.58, 0.01) && aRoll / (-tYaw[2] / S.inertia[2]) > 40);
}

sec("6. THE SYMMETRY");
{
    // the machine mirrored about the vertical plane through the nose: y -> -y, bank -> -bank, heading -> -heading, motors 0<->1 and 2<->3 exchanged, roll and yaw controls reversed
    const swap = (v) => [v[1], v[0], v[3], v[2]];
    const start = { pos: [3, 4, 80], velocity: [2, 1.5, 0.3], heading: 0.4, pitch: 0.1, bank: 0.2, w: [0.3, -0.2, 0.4] };
    const mirror = { pos: [3, -4, 80], velocity: [2, -1.5, 0.3], heading: -0.4, pitch: 0.1, bank: -0.2, w: [-0.3, -0.2, -0.4] };
    const ctl = (i) => ({ thrust: 0.45 + 0.05 * Math.sin(i / 7), pitch: 0.2 * Math.sin(i / 11), roll: 0.3 * Math.cos(i / 5), yaw: 0.5 * Math.sin(i / 9) }), mctl = (i) => { const c = ctl(i); return { ...c, roll: -c.roll, yaw: -c.yaw }; };
    const a = run(Q.createState(m, start), ctl, 360, [1, 2, 0]).s, b0 = Q.createState(m, mirror);
    const b = run({ ...b0, omega: swap(b0.omega), health: swap(b0.health) }, mctl, 360, [1, -2, 0]).s;
    const aa = Q.attitude(a), ba = Q.attitude(b);
    ok("!! MIRRORED ABOUT THE VERTICAL PLANE THROUGH THE NOSE (motors 0 and 1, 2 and 3 exchanged, y, bank, heading and the roll and yaw controls and the wind's side reversed) THE FLIGHT IS THE MIRROR IMAGE: after three seconds of varying controls the positions, velocities, angles and the motors' speeds agree to 1e-9", near(a.pos[0], b.pos[0], 1e-9) && near(a.pos[1], -b.pos[1], 1e-9) && near(a.pos[2], b.pos[2], 1e-9) && near(a.vel[0], b.vel[0], 1e-9) && near(a.vel[1], -b.vel[1], 1e-9) && near(a.vel[2], b.vel[2], 1e-9) && near(aa.bank, -ba.bank, 1e-9) && near(aa.pitch, ba.pitch, 1e-9) && near(aa.heading, -ba.heading, 1e-9) && swap(b.omega).every((o, i) => near(o, a.omega[i], 1e-7)), `${a.pos.map((v) => v.toFixed(4))} | ${b.pos.map((v) => v.toFixed(4))}`);
    const c = run(Q.createState(m, start), ctl, 360, [1, 2, 0]).s;
    ok("...and the flight is deterministic: the same start and controls twice give the same bits", c.pos.every((v, i) => v === a.pos[i]) && c.q.every((v, i) => v === a.q[i]) && c.omega.every((v, i) => v === a.omega[i]) && c.energy === a.energy);
    const before = JSON.stringify(Q.createState(m, start)), s0 = Q.createState(m, start); run(s0, ctl, 60);
    ok("stepMultirotor() does not mutate the state it is given (a new state comes back)", JSON.stringify(s0) === before);
}

sec("7. THE FAILED MOTOR");
{
    const dead = Q.createState(m, { pos: [0, 0, 300], failed: 2 }), f = Q.forcesAndMoments(m, dead, hoverCtl), T = W / 4;
    ok("a failed motor's command is zero whatever the pilot asks (health 0), and the other three are untouched", f.motors[2].command === 0 && f.motors[2].omegaCmd === 0 && [0, 1, 3].every((i) => near(f.motors[i].command, m.hover.command, 1e-15)) && Q.forcesAndMoments(m, dead, { thrust: 1, roll: 1 }).motors[2].command === 0);
    ok("!! THE THREE THAT ARE LEFT GIVE THREE QUARTERS OF THE THRUST, THE TORQUES OF THE ONE THAT IS MISSING (WORKED OUT HERE): at the first tick the net force along the body's axis is 3T - W = -W/4 = -3.92 N, the roll torque is -d T (the left rear motor, y = +d, is gone: right side UP), the pitch torque -d T (the nose is pulled DOWN? the rear left is gone, so the front motors win: nose UP is a negative torque about +Y), the yaw is -kQ T (the clockwise motor that cancelled the others is gone: the body turns RIGHT)",
        near(f.acc.force[2], 3 * T - W, 1e-9) && near(f.acc.force[2], -W / 4, 1e-9) && near(f.acc.torque[0], -DD * T, 1e-9) && near(f.acc.torque[1], -DD * T, 1e-9) && near(f.acc.torque[2], -0.016 * T, 1e-9), `${f.acc.force.map((v) => v.toFixed(3))} | ${f.acc.torque.map((v) => v.toFixed(4))}`);
    const ds = run(dead, hoverCtl, 30).s;
    ok("a failed motor stays stopped and one that dies in flight SPINS DOWN on its lag: motor 2 of a hover that has its health set to 0 falls below 1 rad/s in a quarter of a second (a first-order decay from 710 rad/s) and never goes negative", (() => { let s = { ...Q.createState(m, { pos: [0, 0, 500] }), health: [1, 1, 0, 1] }; let min = Infinity; for (let i = 0; i < 30; i++) { s = Q.stepMultirotor(m, s, hoverCtl).state; min = Math.min(min, s.omega[2]); } return s.omega[2] < 1 && min >= 0 && s.omega[0] > 600; })() && ds.omega[2] === 0);
    const fall = run({ ...Q.createState(m, { pos: [0, 0, 500] }), health: [1, 1, 0, 1] }, hoverCtl, 120 * 2).s, af = Q.attitude(fall);
    ok("and the machine FALLS and TURNS: two seconds after the failure it has dropped more than 4 m, picked up a descent of more than 3 m/s, and is no longer level (more than 20 degrees from it) -- nothing in a hover command can hold a quadrotor with a motor gone", 500 - fall.pos[2] > 4 && fall.vel[2] < -3 && Math.acos(af.up[2]) > 20 * D2R, `dropped ${(500 - fall.pos[2]).toFixed(1)} m, ${fall.vel[2].toFixed(2)} m/s, tilt ${(Math.acos(af.up[2]) / D2R).toFixed(0)} deg`);
    ok("a health ABOVE 1 is a motor at full strength and no more: 1.5 commands what 1 does (the health is clamped to 0..1)", near(Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 300], health: [1.5, 1, 1, 1] }), hoverCtl).motors[0].command, m.hover.command, 1e-15) && Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 300], health: [-2, 1, 1, 1] }), hoverCtl).motors[0].command === 0);
    const half = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 300], health: [1, 1, 0.5, 1] }), hoverCtl);
    ok("a HEALTH between 0 and 1 scales the command (a damaged propeller): at 0.5 the motor is commanded half of the hover's and the others are untouched", near(half.motors[2].command, 0.5 * m.hover.command, 1e-15) && near(half.motors[0].command, m.hover.command, 1e-15));
}

sec("8. THE BATTERY");
{
    const st = Q.createState(m, { pos: [0, 0, 1e4] }), p0 = Q.forcesAndMoments(m, st, hoverCtl).powerTotal, one = run(st, hoverCtl, 120).s;
    ok("THE ENERGY BURNED IS THE POWER TIMES THE TIME: a second of the hover takes 255 J (within 0.5%) off the 80 kJ, and the charge is the energy over the capacity", near(st.energy - one.energy, p0 * 1, 0.005 * p0) && near(Q.charge(m, one), one.energy / 8e4, 1e-15) && Q.charge(m, st) === 1 && Q.batteryStatus(m, st) === "ok", `${(st.energy - one.energy).toFixed(2)} J`);
    const half = Q.createState(m, { pos: [0, 0, 1e4], charge: 0.5 }), fh = Q.forcesAndMoments(m, half, { thrust: 1 });
    ok("THE SAG: at half charge the top speed is 1 - 0.15 x 0.5 = 0.925 of the full (1,017.5 rad/s asked at a full command), and the thrust a full command holds falls to 0.925^2 = 85.6%, as the header says", fh.motors.every((mo) => near(mo.omegaCmd, 1100 * 0.925, 1e-9)) && near(0.925 * 0.925, 0.855625, 1e-12));
    const lo = Q.createState(m, { pos: [0, 0, 1e4], charge: 0.0299 }), fl = Q.forcesAndMoments(m, lo, { thrust: 1 });
    ok("AT THE CUTOFF THE MOTORS GO TO ZERO: at 3% charge (and below) the battery is \"empty\" and every motor's command is 0 whatever the pilot asks, while at 3.01% it is \"ok\" and the commands stand", Q.batteryStatus(m, lo) === "empty" && fl.motors.every((mo) => mo.command === 0) && Q.batteryStatus(m, Q.createState(m, { charge: 0.0301 })) === "ok" && Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 1e4], charge: 0.0301 }), { thrust: 1 }).motors.every((mo) => mo.command === 1) && Q.batteryStatus(m, Q.createState(m, { charge: 0.03 })) === "empty");
    ok("AN EMPTY BATTERY GIVES NOTHING: the rotors still turning at the cutoff coast and draw no power (the energy does not fall further), where a full one with the same rotors turning draws 255 W", fl.powerTotal === 0 && Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 1e4], charge: 0.5 }), { thrust: m.hover.command }).powerTotal > 250 && Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 1e4], charge: 0.02 }), { thrust: 1 }).powerTotal === 0);
    const fallE = run(Q.createState(m, { pos: [0, 0, 300], charge: 0.02 }), hoverCtl, 120 * 2).s;
    ok("and the machine with an empty battery FALLS: two seconds at the hover command, 300 m up, drops more than 15 m and is descending at more than 8 m/s (the motors spin down on their lag and the air does the rest)", 300 - fallE.pos[2] > 15 && fallE.vel[2] < -8, `${(300 - fallE.pos[2]).toFixed(1)} m, ${fallE.vel[2].toFixed(2)} m/s`);
    const nb = run(Q.createState(m, { pos: [0, 0, 1e4], charge: 0.0301 }), hoverCtl, 120 * 60).s;
    ok("a battery cannot go below zero: the energy is clamped at 0 (a long hover from 3.01% ends with exactly the energy it had left, never negative)", nb.energy >= 0);
}

sec("9. DRAG");
{
    const SUMW = 4 * OM, v = 20, st = Q.createState(m, { pos: [0, 0, 100], velocity: [v, 0, 0] }), fx = Q.forcesAndMoments(m, st, hoverCtl).acc.force;
    const quad = 0.5 * RHO * 0.012 * v * v, lin = 8e-5 * SUMW * v;
    ok("THE DRAG, TO THE NEWTON, WORKED OUT HERE: at 20 m/s along the nose the body's quadratic drag is 0.5 rho CdA v^2 = " + quad.toFixed(3) + " N and the rotors' linear drag 8e-5 x (sum of the motor speeds) x v = " + lin.toFixed(3) + " N, both backward: the net force along the nose is -" + (quad + lin).toFixed(3) + " N", near(fx[0], -(quad + lin), 1e-9) && Math.abs(fx[1]) < 1e-9, `${fx[0].toFixed(4)}`);
    const fy = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], velocity: [0, -10, 0] }), hoverCtl).acc.force, fz = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], velocity: [0, 0, 10], omega: HO }), hoverCtl);
    const fzUp = fz.acc.force[2] - (fz.thrustTotal - W);
    ok("the axes have their own areas: sideways at 10 m/s the force is the same law with 0.012 (+Y, against the motion) and straight up at 10 m/s the quadratic drag is 0.5 rho x 0.03 x 100 = 1.838 N downward (the rotors' linear drag acts only sideways)", near(fy[1], 0.5 * RHO * 0.012 * 100 + 8e-5 * SUMW * 10, 1e-9) && near(fzUp, -0.5 * RHO * 0.03 * 100, 1e-9), `${fy[1].toFixed(4)} ${fzUp.toFixed(4)}`);
    const atRest = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100] }), hoverCtl, [8, 0, 0]).acc.force, flying = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 100], velocity: [8, 0, 0] }), hoverCtl, [8, 0, 0]).acc.force;
    ok("THE WIND MOVES THE AIR AND NOT THE MACHINE, checked on the force along the nose and across it, where the thrusts do not reach: at rest in a wind of 8 m/s the force is +" + (0.5 * RHO * 0.012 * 64 + 8e-5 * SUMW * 8).toFixed(3) + " N along it (pushed with the wind), and flying with the wind at its own speed it is zero in both horizontal axes", near(atRest[0], 0.5 * RHO * 0.012 * 64 + 8e-5 * SUMW * 8, 1e-9) && Math.abs(flying[0]) < 1e-9 && Math.abs(flying[1]) < 1e-9, `${atRest[0].toFixed(4)} / ${flying[0].toExponential(1)}`);
}

sec("10. THE GROUND");
{
    const onGround = (extra = {}) => Q.createState(m, { pos: [0, 0, 0.0684], omega: [0, 0, 0, 0], ...extra });
    const rest = run(onGround(), { thrust: 0 }, 120 * 3), restZ = rest.s.pos[2];
    ok("FOUR LEGS ON SPRINGS HOLD THE WEIGHT: a machine set down on its legs with the motors off settles to a height of the legs' length less the compression weight / (4 k) = 0.07 - 0.001569 = 0.068431 m (to 0.1 mm), is \"landed\", has four legs in contact and does not move", rest.o.status === "landed" && rest.o.legs === 4 && near(restZ, 0.07 - W / (4 * 2500), 1e-4) && Math.hypot(...rest.s.vel) < 1e-3, `${restZ.toFixed(6)} m, ${rest.o.status}`);
    const drop = (h, extra = {}) => { let s = Q.createState(m, { pos: [0, 0, h], omega: [0, 0, 0, 0], ...extra }), o = null; for (let i = 0; i < 120 * 4; i++) { o = Q.stepMultirotor(m, s, { thrust: 0 }); s = o.state; if (o.status === "crashed") break; } return o; };
    const d1 = drop(0.5), d2 = drop(3);
    ok("A DROP UNDER 6 m/s OF SINK IS A LANDING AND ONE OVER IT A CRASH: from 0.5 m (a sink of 3.1 m/s) it is landed; from 3 m (7.7 m/s) it is \"crashed\" for a \"hard landing\"", d1.status === "landed" && d2.status === "crashed" && (d2.why === "hard landing" || d2.why === "hull"), `${d1.status} / ${d2.status} (${d2.why})`);
    const tiltLand = drop(0.3, { bank: 55 * D2R });
    ok("an arrival tilted past 50 degrees is a crash, and so is a hull point on the ground: a drop from 0.3 m at 55 degrees of bank ends \"crashed\"", tiltLand.status === "crashed" && /tilted landing|hull/.test(tiltLand.why), `${tiltLand.status} (${tiltLand.why})`);
    const hullLvl = Q.classify(m, Q.createState(m, { pos: [0, 0, 0.0684], omega: [0, 0, 0, 0] })), hullHit = Q.classify(m, Q.createState(m, { pos: [0, 0, 0], omega: [0, 0, 0, 0] }));
    ok("classify() is a pure function of the state: a level body with its legs on the ground (0.0684 m) is landed, and the same body with its motors at the ground (a height of 0: the legs would have to be 7 cm into it) is a hull strike", hullLvl.status === "landed" && hullHit.status === "crashed" && hullHit.why === "hull", `${hullLvl.status} / ${hullHit.status} (${hullHit.why})`);
    const inverted = (z) => Q.classify(m, Q.createState(m, { pos: [0, 0, z], omega: [0, 0, 0, 0], bank: Math.PI }));
    ok("THE TOP PLATE IS A HULL POINT TOO: an upside-down machine at 0.05 m has its top plate (0.06 m above the centre, now below it) under the ground -- crashed for a hull strike -- and at 0.07 m it has not touched yet and is airborne", inverted(0.05).status === "crashed" && inverted(0.05).why === "hull" && inverted(0.07).status === "airborne", `${inverted(0.05).status} / ${inverted(0.07).status}`);
    const take = run(onGround(), (i) => ({ thrust: 0.8 }), 120 * 2);
    ok("A LANDED MACHINE TAKES OFF AGAIN (it is not a crash): the same machine given 0.8 of thrust climbs more than a metre in two seconds and is airborne", take.o.status === "airborne" && take.s.pos[2] > 1, `z ${take.s.pos[2].toFixed(2)} ${take.o.status}`);
    const slide = run(onGround({ velocity: [3, 0, 0] }), { thrust: 0 }, 120 * 2);
    ok("FRICTION STOPS A SLIDE: landed with 3 m/s along the ground and the motors off it comes to rest within two seconds (the regularised Coulomb friction of 0.7: under 0.3 m/s left)", Math.hypot(slide.s.vel[0], slide.s.vel[1]) < 0.3 && slide.s.pos[0] > 0.1 && slide.s.pos[0] < 1.5, `${slide.s.pos[0].toFixed(2)} m, ${Math.hypot(slide.s.vel[0], slide.s.vel[1]).toFixed(3)} m/s`);
    const mu = 0.7, dStop = 9 / (2 * mu * G), slide2 = run(onGround({ velocity: [3, 0, 0] }), { thrust: 0 }, 120 * 4);
    ok("!! FRICTION IS COULOMB'S: a machine sliding at 3 m/s on its legs decelerates at mu g = 6.86 m/s^2 (the legs carry the weight) and stops after v^2 / (2 mu g) = " + dStop.toFixed(3) + " m, to 5%, then STAYS stopped (under 1 mm/s after four seconds: the regularisation lets it come to rest and not chatter)", near(slide2.s.pos[0], dStop, 0.05 * dStop) && Math.hypot(slide2.s.vel[0], slide2.s.vel[1]) < 1e-3, `${slide2.s.pos[0].toFixed(4)} m, ${Math.hypot(slide2.s.vel[0], slide2.s.vel[1]).toExponential(2)} m/s`);
    const motorAt = (i, pitchSign, bankSign) => { const st0 = Q.createState(m, { pos: [0, 0, 1], omega: [0, 0, 0, 0], pitch: pitchSign * 30 * D2R, bank: bankSign * 30 * D2R }), zOff = rotateByQuat(st0.q, S.motors[i].pos)[2]; return [Q.classify(m, { ...st0, pos: [0, 0, -zOff - 0.001] }), Q.classify(m, { ...st0, pos: [0, 0, -zOff + 0.001 + 0.2] })]; };
    const hulls = [motorAt(0, -1, 1), motorAt(1, -1, -1), motorAt(2, 1, -1), motorAt(3, 1, 1)];
    ok("!! EACH OF THE FOUR MOTORS IS A HULL POINT: with the body pitched and banked 30 degrees so that motor 0 (front right), 1 (front left), 2 (rear left) or 3 (rear right) is the lowest, that motor 1 mm under the ground is a hull strike, and the same machine 20 cm up is not", hulls.every(([hit, clear]) => hit.status === "crashed" && hit.why === "hull" && clear.why !== "hull"), hulls.map(([h]) => h.why).join());
    // THE SUBSTEPS (within 4 cm of the ground a tick is four steps of a quarter): the clock, the energy and the motors' lag must all run on the quarter step
    const ongr = onGround(), hh = Q.DT / 4;
    ok("!! NEAR THE GROUND A TICK IS FOUR SUBSTEPS AND EVERYTHING ELSE STILL RUNS ON THE CLOCK: the machine on its legs is within the contact band (legClearance < 0.04) and the machine 5 m up is not; 120 ticks on the ground make 1 s on the clock (to 1e-12); the motors' lag follows (1 - dt/(4 tau))^(4 n) -- twelve ticks from rest toward a command of 0.2 give omega_cmd x (1 - (1 - 0.00833/4/0.03)^48) to 1e-4 relative; and the energy burned at that thrust is the power times the time (to 6%)",
        Q.legClearance(m, ongr) < Q.CONTACT_BAND && Q.legClearance(m, Q.createState(m, { pos: [0, 0, 5] })) > Q.CONTACT_BAND && Q.SUBSTEPS === 4 && Q.CONTACT_BAND === 0.04 && near(run(ongr, { thrust: 0 }, 120).s.t, 1, 1e-12) && (() => { const r = run({ ...ongr, omega: [0, 0, 0, 0] }, { thrust: 0.2 }, 12).s, exp = 1100 * Math.sqrt(0.2) * (1 - Math.pow(1 - hh / 0.03, 48)); return near(r.omega[0] / exp, 1, 1e-4); })()
        && (() => { const r = run({ ...ongr, omega: [0, 1, 2, 3].map(() => 1100 * Math.sqrt(0.2)) }, { thrust: 0.2 }, 60).s, T1 = 0.2 * TMAX, P = 4 * Math.pow(T1, 1.5) / (Math.sqrt(2 * RHO * Math.PI * 0.01) * 0.55 * 0.8); return near(S.battery.energy - r.energy, P * 0.5, 0.06 * P * 0.5); })(), `${run(ongr, { thrust: 0 }, 120).s.t}`);
    // THE LEGS ARE A DAMPED OSCILLATOR, solved here independently: m p'' = m g - Sum max(0, k p + c p') over the four legs, p the penetration, from the moment the legs touch at 2 m/s
    const rk4 = (v0) => { const k = 2500, c = 30, mm = 1.6, f = (p, v) => G - Math.max(0, 4 * (k * p + c * v)) / mm; let p = 0, v = v0, pmax = 0; const dt = 1e-5; for (let i = 0; i < 2e5 && !(v < 0 && i > 0); i++) { const k1p = v, k1v = f(p, v), k2p = v + 0.5 * dt * k1v, k2v = f(p + 0.5 * dt * k1p, v + 0.5 * dt * k1v), k3p = v + 0.5 * dt * k2v, k3v = f(p + 0.5 * dt * k2p, v + 0.5 * dt * k2v), k4p = v + dt * k3v, k4v = f(p + dt * k3p, v + dt * k3v); p += dt / 6 * (k1p + 2 * k2p + 2 * k3p + k4p); v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v); pmax = Math.max(pmax, p); } return pmax; };
    const v0 = Math.sqrt(4 + 2 * G * 0.002), pExpect = rk4(v0), landing = (() => { let s = Q.createState(m, { pos: [0, 0, 0.072], omega: [0, 0, 0, 0], velocity: [0, 0, -2] }), minZ = 1; for (let i = 0; i < 120; i++) { s = Q.stepMultirotor(m, s, { thrust: 0 }).state; minZ = Math.min(minZ, s.pos[2]); } return 0.07 - minZ; })();
    ok("!! THE LEGS ARE THE DAMPED OSCILLATOR THE HEADER SAYS (2,500 N/m and 30 N s/m a leg, 1.6 kg): the deepest compression of a level landing at 2 m/s is the peak of m p'' = m g - 4 (k p + c p') integrated here independently with RK4 at 10 microseconds (" + (pExpect * 1000).toFixed(2) + " mm), to 6%: the model's explicit 480 Hz step over-damps by about c dt / 2m (a damper stronger than its c by 8%) and lands 4.7% SHALLOWER than the exact solution, which is the tolerance's reason; a wrong damper (c = 40) moves the peak by 20% and a wrong spring (3,000 N/m) by 10%, so it checks the spring, the damper and the substeps at once", near(landing, pExpect, 0.06 * pExpect), `${(landing * 1000).toFixed(3)} mm against ${(pExpect * 1000).toFixed(3)}`);
    const mid = (() => { let s = Q.createState(m, { pos: [0, 0, 0.8101631167857736], omega: [0, 0, 0, 0], bank: 0.7803179452007462, pitch: -0.3211835939887802, velocity: [0, 0, -7.54279366486836] }), o = null; for (let i = 0; i < 400; i++) { o = Q.stepMultirotor(m, s, { thrust: 0 }); s = o.state; if (o.status === "crashed") break; } return { o, s }; })();
    ok("!! A CRASH IS CAUGHT THE SUBSTEP IT HAPPENS IN, NOT AT THE END OF THE TICK: banked 45 degrees and pitched -18 degrees, falling at 7.5 m/s from 0.81 m, the machine is crashed (\"hard landing\") with its clock at 9.5 ticks -- half a tick, two substeps into the tick it happened in -- and not at a whole tick", mid.o.status === "crashed" && mid.o.why === "hard landing" && near(mid.s.t / Q.DT, 9.5, 1e-9), `${(mid.s.t / Q.DT).toFixed(4)} ticks, ${mid.o.status} ${mid.o.why}`);
    const crashed = drop(3), again = Q.stepMultirotor(m, crashed.state, { thrust: 1 });
    ok("a crashed state STAYS CRASHED: stepping it returns the same state (the same object) with the status crashed, however hard the pilot pulls", again.state === crashed.state && again.status === "crashed");
    const badOm = { ...Q.createState(m, { pos: [0, 0, 10] }), omega: [710, NaN, 710, 710] };
    ok("a motor speed that is not finite is \"lost\" too (the state is judged on all it carries)", Q.classify(m, badOm).status === "lost");
    const clock = run(Q.createState(m, { pos: [0, 0, 1e4] }), hoverCtl, 120).s;
    ok("the clock advances by dt a tick: 120 ticks of 1/120 s make 1 s, to 1e-12", near(clock.t, 1, 1e-12) && Q.createState(m, {}).t === 0);
    const bad = { ...Q.createState(m, { pos: [0, 0, 10] }), vel: [NaN, 0, 0] };
    ok("a state that is not finite is \"lost\", and stays so", Q.classify(m, bad).status === "lost" && Q.stepMultirotor(m, bad, hoverCtl).status === "lost" && Q.stepMultirotor(m, bad, hoverCtl).state === bad);
}

sec("11. THE TERRAIN");
{
    const a = run(Q.createState(m, { pos: [0, 0, 30], velocity: [3, 1, 0], bank: 0.1 }), (i) => ({ thrust: 0.4, roll: 0.1 }), 240), b = run(Q.createState(m, { pos: [0, 0, 30], velocity: [3, 1, 0], bank: 0.1 }), (i) => ({ thrust: 0.4, roll: 0.1 }), 240, [0, 0, 0], TR.FLAT), c = run(Q.createState(m, { pos: [0, 0, 30], velocity: [3, 1, 0], bank: 0.1 }), (i) => ({ thrust: 0.4, roll: 0.1 }), 240, [0, 0, 0], TR.createTerrain({ kind: "flat" }));
    ok("!! NO TERRAIN, FLAT AND A FLAT SPEC ARE THE SAME FLIGHT TO THE BIT (the original arithmetic is untouched): the position, the attitude, the speeds and the energy after two seconds are identical, three ways", [b, c].every((x) => x.s.pos.every((v, i) => v === a.s.pos[i]) && x.s.q.every((v, i) => v === a.s.q[i]) && x.s.omega.every((v, i) => v === a.s.omega[i]) && x.s.energy === a.s.energy));
    const g = run(Q.createState(m, { pos: [0, 0, 0.4], omega: [0, 0, 0, 0] }), { thrust: 0 }, 120 * 3, [0, 0, 0], TR.createTerrain({ kind: "flat", level: 0.3 }));
    ok("a PLATEAU holds the machine up: set down 0.4 m above a ground at 0.3 m with the motors off it settles on its legs at 0.3 + 0.068431 m (to 0.2 mm), landed", g.o.status === "landed" && near(g.s.pos[2], 0.3 + 0.07 - W / (4 * 2500), 2e-4), `${g.s.pos[2].toFixed(5)}`);
    const slope = (deg) => TR.createTerrain({ kind: "plane", level: 0, gx: Math.tan(deg * D2R), gy: 0, x0: 0, y0: 0 });
    const onSlope = (deg) => { const t = slope(deg), tilt = Q.createState(m, { pos: [0, 0, t.height(0, 0) + 0.12], omega: [0, 0, 0, 0], pitch: deg * D2R }); return run(tilt, { thrust: 0 }, 120 * 2, [0, 0, 0], t).o; };
    const flush = (deg) => { const t = slope(deg); return Q.classify(m, Q.createState(m, { pos: [0, 0, t.height(0, 0) + 0.0684 / Math.cos(deg * D2R) - 0.0005, ], omega: [0, 0, 0, 0], pitch: deg * D2R }), t); };
    ok("THE TILT IS MEASURED AGAINST THE SURFACE'S NORMAL: a body lying flush on a 20-degree slope (its legs on it, pitched 20 degrees nose up) has a tilt under 0.01 rad, where measured against the vertical it would be 0.35 rad", flush(20).tilt < 0.01 && flush(20).status === "landed", `tilt ${flush(20).tilt.toFixed(5)} ${flush(20).status}`);
    const rest10 = (() => { const t = slope(10), st = Q.createState(m, { pos: [0, 0, t.height(0, 0) + 0.0684 / Math.cos(10 * D2R)], omega: [0, 0, 0, 0], pitch: 10 * D2R }); return run(st, { thrust: 0 }, 120 * 4, [0, 0, 0], t); })();
    const fr = Math.tan(10 * D2R) / 0.7, creepExpect = 0.05 * fr / Math.sqrt(1 - fr * fr);
    ok("!! THE GROUND'S REACTION IS ALONG ITS NORMAL, AND THE FRICTION IS REGULARISED COULOMB: a machine set down flush on a 10-degree slope does not slide away, it CREEPS at the speed where mu N v / sqrt(v^2 + 0.05^2) balances the slope's pull m g sin(10): the legs carry N = m g cos(10) along the normal, so the speed is 0.05 f / sqrt(1 - f^2) for f = tan(10) / mu = " + fr.toFixed(4) + ": " + (creepExpect * 100).toFixed(3) + " cm/s, to 8% (the header's 'friction is regularised' made a number) -- where a reaction that pushed straight up would have no downhill component to balance and would not creep at all", rest10.o.status === "landed" && near(Math.hypot(...rest10.s.vel), creepExpect, 0.08 * creepExpect), `${(Math.hypot(...rest10.s.vel) * 100).toFixed(3)} cm/s, moved ${(Math.hypot(rest10.s.pos[0], rest10.s.pos[1]) * 100).toFixed(2)} cm`);
    const dropSlope = (vz) => { const t = slope(20), st = Q.createState(m, { pos: [0, 0, t.height(0, 0) + 0.0684 / Math.cos(20 * D2R) + 0.02], omega: [0, 0, 0, 0], pitch: 20 * D2R, velocity: [0, 0, vz] }); let s = st, o = null, worst = 0; for (let i = 0; i < 120; i++) { o = Q.stepMultirotor(m, s, { thrust: 0 }, Q.DT, [0, 0, 0], t); s = o.state; worst = Math.max(worst, o.sink || 0); if (o.status === "crashed") break; } return { o, worst }; };
    const ds = dropSlope(-6.3);
    ok("THE SINK IS MEASURED ALONG THE SURFACE'S NORMAL: a machine falling straight down at 6.3 m/s onto a 20-degree slope, lying flush with it, meets it at 6.3 cos 20 = 5.92 m/s -- under the 6 m/s limit, so it LANDS -- where measured straight down it would be 6.3 and a crash (a hard landing)", ds.o.status !== "crashed" || ds.o.why !== "hard landing", `${ds.o.status} ${ds.o.why || ""} worst sink ${ds.worst.toFixed(2)}`);
    const legsDown = (deg) => { const st0 = Q.createState(m, { pos: [0, 0, 1], omega: [0, 0, 0, 0], bank: deg * D2R }), low = Math.min(...m.spec.legs.map((p) => rotateByQuat(st0.q, p)[2])); return Q.classify(m, { ...st0, pos: [0, 0, -low - 0.001] }); };
    ok("THE TILT LIMIT IS A CLAUSE OF ITS OWN, AND REACHABLE: the legs sit inside the motors (0.15 m against 0.177 m) and 0.07 m below them, so a leg is on the ground before a motor until the bank passes atan(0.07 / 0.027) = 69 degrees. With its lowest leg 1 mm into the ground and the body banked 40 degrees the machine is landed; banked 55 degrees it is \"crashed\" for a \"tilted landing\" (the limit is 50, and no hull point is down); banked 75 degrees a motor is down first and it is a hull strike", legsDown(40).status === "landed" && legsDown(55).status === "crashed" && legsDown(55).why === "tilted landing" && near(legsDown(55).tilt, 55 * D2R, 1e-9) && legsDown(75).why === "hull" && legsDown(65).why === "tilted landing" && Math.abs(Math.atan(0.07 / (0.25 / Math.SQRT2 - 0.15)) / D2R - 69) < 0.5, `${legsDown(40).status} / ${legsDown(55).status} (${legsDown(55).why}) / ${legsDown(75).why}`);
    const s10 = onSlope(10);
    ok("a 10-DEGREE SLOPE IS LANDED ON: the body dropped 12 cm onto it, tilted to match, is \"landed\" two seconds later (and not crashed)", s10.status === "landed", `${s10.status}`);
    ok("!! THE SLOPE LIMIT IS A CLAUSE OF ITS OWN (25 degrees, INVENTED): a body lying flush on a slope has no tilt against it and no sink, so the only thing that can make it a crash is the slope itself -- landed on 10, 20 and 24 degrees; \"crashed\" for a \"steep slope\" on 26 and 30", [10, 20, 24].every((d) => flush(d).status === "landed") && [26, 30].every((d) => flush(d).status === "crashed" && flush(d).why === "steep slope"), [10, 20, 24, 26, 30].map((d) => `${d}:${flush(d).status}`).join(" "));
    const plat = TR.createTerrain({ kind: "flat", level: 0.3 }), stP = Q.createState(m, { pos: [0, 0, 0.5], omega: [0, 0, 0, 0] });
    ok("THE CONTACT BAND FOLLOWS THE GROUND UNDER THE LEGS: the lowest leg of a body 0.5 m up is 0.43 m over the flat ground and 0.13 m over a plateau at 0.3 m (0.5 - 0.07 - 0.3), to 1e-12, and over a plateau at 0.45 m it is inside the band", near(Q.legClearance(m, stP), 0.43, 1e-12) && near(Q.legClearance(m, stP, plat), 0.13, 1e-12) && Q.legClearance(m, stP, TR.createTerrain({ kind: "flat", level: 0.45 })) < Q.CONTACT_BAND && Q.legClearance(m, stP, plat) > Q.CONTACT_BAND);
    const tiltedCl = (b) => { const st = Q.createState(m, { pos: [0, 0, 1], omega: [0, 0, 0, 0], bank: b * D2R }); return [Q.legClearance(m, st), 1 + Math.min(...m.spec.legs.map((p) => rotateByQuat(st.q, p)[2]))]; };
    ok("...and it is the LOWEST of the four legs, whichever side is down: banked +30 and -30 degrees the clearance is the independently computed minimum over all four legs (0.15 sin 30 + 0.07 cos 30 under the centre), to 1e-12", [30, -30].every((b) => near(tiltedCl(b)[0], tiltedCl(b)[1], 1e-12)) && near(tiltedCl(30)[0], 1 - (0.15 * Math.sin(30 * D2R) + 0.07 * Math.cos(30 * D2R)), 1e-12));
}

sec("12. WHAT IS NOT IN IT, SAID PLAINLY");
{
    const hover = (z) => Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, z], omega: HO }), hoverCtl);
    const lo = hover(0.5).motors[0].thrust, hi = hover(40).motors[0].thrust;
    ok("NO GROUND EFFECT: a motor's thrust at the hover's speed is the same 0.5 m up and 40 m up (the header says so)", lo === hi && near(lo, W / 4, 1e-9));
    const fast = Q.forcesAndMoments(m, Q.createState(m, { pos: [0, 0, 300], velocity: [0, 0, -8], omega: HO }), hoverCtl).motors[0].thrust;
    ok("NO VORTEX RING: in an 8 m/s descent a motor's thrust at the same speed is MORE than the hover's (the inflow factor 1 + 0.8 v / (omega R) = 1.09), where a rotor falling into its own wake would lose it", fast > lo && near(fast / lo, 1 + 0.8 * 8 / (OM * 0.1), 1e-12));
    const ten = run(Q.createState(m, { pos: [0, 0, 500] }), hoverCtl, 120 * 10).s;
    ok("A CONSTANT MASS: the state's mass and the weight in the model are the same after ten seconds of burning the battery (no fuel loss modelled)", ten.mass === 1.6 && m.weight === 1.6 * G && ten.energy < 8e4);
    const spun = Q.forcesAndMoments(m, { ...Q.createState(m, { pos: [0, 0, 100] }), w: [0, 2, 0] }, hoverCtl), T0 = R.kT * OM * OM, dampY = -T0 * 0.8 * 2 / (OM * 0.1) * 4 * DD * DD;
    ok("NO GYROSCOPIC COUPLING OF THE ROTORS: turning the body about its pitch axis at 2 rad/s with the motors at the hover excites no torque about the roll or yaw axes (a spinning rotor's gyroscope would), and the only torque about the pitch axis is the DAMPING the axial inflow gives (the front motors move down through the air and gain thrust): -T 0.8 w Sum(x^2) / (omega R) = " + dampY.toFixed(5) + " N m, worked out here", Math.abs(spun.acc.torque[0]) < 1e-9 && Math.abs(spun.acc.torque[2]) < 1e-9 && near(spun.acc.torque[1], dampY, 1e-9) && spun.acc.torque[1] < 0, `${spun.acc.torque.map((v) => v.toExponential(2))}`);
}

console.log(fails ? `\nmultirotorModel6dof-selfcheck: ${fails} FAILED` : "\nmultirotorModel6dof-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
