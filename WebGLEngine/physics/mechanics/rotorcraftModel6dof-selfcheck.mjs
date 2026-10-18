// WebGLEngine/physics/mechanics/rotorcraftModel6dof-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/rotorcraftModel6dof-selfcheck.mjs      (under a second)
//
// THE HELICOPTER THAT CAN FALL, HELD TO WHAT ITS HEADER SAYS. physics/mechanics/rotorcraftModel6dof.mjs is a single-rotor attack helicopter on the rigid body: a rotor whose speed is a state, an engine that can fail, a tail rotor, a fuselage, skids. Its claim is that it is a helicopter and not a thrust vector with a picture on it, so the
// gate checks the things a helicopter does that the thing without them cannot:
//
//   1  THE NUMBERS         the airframe's own (4,500 kg, a 7.3 m rotor, disc loading 264 N/m^2, a hover induced velocity of 10.37 m/s) are what momentum theory makes of them
//   2  MOMENTUM THEORY     the induced velocity in axial flight (the climb branch, the windmill-brake branch, Johnson's vortex-ring fit between), Glauert's for forward flight, the vortex ring's thrust factor and the retreating blades' stall limit, each to its closed form
//   3  THE HOVER           the collective that makes thrust equal weight, the power and torque it costs (kappa T vi + the profile power), the tail rotor rigged to cancel that torque, and a trim that holds the machine still -- banked 3 degrees with the cyclic left, because the tail rotor pushes it sideways
//   4  A HOVER IS UNSTABLE a one-degree error left alone grows to many degrees within a minute (the speed instability: backward flapping), where an aeroplane's trim would come back
//   5  THE PILOT'S SENSES  each control moves the machine in the sense the header says, and nothing else at the first tick (no cross-coupling, said in the header)
//   6  THE ROTOR'S SPEED   the governor holds it; the engine's power is a limit; with the engine out it decays at exactly -Q/I and the machine FALLS; lowering the collective gets it back and the descent is the windmill's (about twice the hover induced velocity); the vortex ring costs thrust in a slow descent
//   7  THE GROUND          four skids on springs hold the weight; a landed helicopter takes off again; a hard drop, a tilted arrival, a hull point or a rotor tip on the ground are crashes; friction slows a slide; a crashed state stays crashed
//   8  WHAT IS NOT IN IT   no ground effect, no change of density with height, no fuel burn: each as the header says
//   9  THE FRONT DOOR      the export list is pinned and the report lines say real numbers
//
// SABOTAGE LOG (each applied to physics/mechanics/rotorcraftModel6dof.mjs, the gate run, the file restored byte for byte; the number is how many rows went red):
//   Run 1 (137 mutants against the gate as first written): 38 of them went 0 red, which is a finding and not a pass -- the gate was not holding what the header says. They were: Glauert's floor on the speed under the root (a light rotor: nothing in the gate had a vh under 5 m/s),
//   the windmill brake replaced by Glauert's fixed point, the profile power's and the blade pitch's mu terms (nothing flew in the disc's plane), the collective not clamped inside rotorThrust, the floor on the rotor speed in the tip speed, the heading/pitch/bank signs of attitudeQuat and attitude(),
//   the wind in the airspeed, the engine's power limit read at the design speed (the gate asked for 'never over 1.1 MW', not 'at it'), the lateral backward flapping, the inflow term of the flapping coefficient, the hub's velocity from the turn, the climb rate resolved on the disc's normal,
//   the fin's sign, its area, the stabiliser's area, the fuselage drag's sign and area (nothing found what each ADDED), a skid that could pull, the tip clearance (two ways), the sink limit (two ways), the tilt limit at 15 degrees, a state lost only if its position is NaN (or only if its
//   rotor speed is not), the rotor speed allowed negative, the flapping unclamped, the clock that did not advance, the induced velocity not carried to the next tick, the trim's flap start with the wrong sign (the first airframe's longitudinal cyclic is zero, so it never showed), the stall limit's
//   size and the tail rotor's pedal range. Each got a row (sections 2, 3, 5, 6, 7, 8: a light rotor, the windmill brake at x = -2.5 / -3 / -4, the blade element at 40 m/s, the stall limit at 72 m/s, the thrust at collective 2 / -1 / 10 rad/s / stopped, a second airframe's trim, the attitude's
//   senses and a wind, backward flapping to its closed form, the hub's velocity, the engine at its limit and its torque cap at 5 rad/s, the sink / tilt / tip limits either side, a skid that never pulls, every number of a state lost, a rotor that cannot spin backwards, the clock and the
//   carried induced velocity, and the fin, stabiliser and fuselage each found as what the airframe loses without it) and two mutants whose patterns did not match once (R10, F10) were corrected. Run 2: 137 of 137 mutants red, none 0 (the number after each name is how many rows went red):
//   A1 climb branch sign 1; A2 windmill branch sign 2; A3 Johnson linear term 3; A4 Johnson quadratic term 3; A5 Johnson quartic term 3; A6 windmill threshold -2.2 1; A7 Johnson cubic term 4; G1 Glauert no relaxation 6;
//   G2 Glauert one pass 2; G3 Glauert floor on speed 2; I1 no zero-thrust guard on induced 1; I2 wake blend wide 3; I3 wake blend flipped 3; I4 windmill brake by Glauert 1; I5 climb by Johnson 2; V1 ring loss 10% 4; V2
//   ring narrow 4; V3 ring centred at -0.5 6; V4 ring not faded by speed 2; V5 ring guard removed 1; V6 ring fade 4x faster 1; S1 knee 0.5 2; S2 stall not odd 7; S3 stall softness 1; S4 stall limit 1.1 2; R1 bisection 4
//   halvings 14; R2 bisection direction 22; R3 bisection ceiling low 16; R4 profile power no mu term 1; R5 no climb power 2; R6 kappa unused 4; R7 torque over design speed 2; R8 blade pitch no mu term 2; R9 collective
//   not clamped 1; R10 inflow weight 7; R11 inflow sign 11; R12 hover collective 4 halvings 3; R13 hover collective direction 13; R14 start vi floor 5; R15 tip speed floor on omega 1; C1 tail rigging 2/3 2; C2 rigging
//   sign 2; Q1 heading sign 1; Q2 pitch sign 1; Q3 bank sign 2; Q4 attitude pitch sign 1; Q5 attitude bank sign 1; Q6 attitude heading sign 1; Q7 rates pitch sign 1; Q8 rates yaw sign 1; Q9 rates roll sign 1; Q10
//   sanitize NaN passes 2; Q11 collective not clamped 1; Q12 pitch clamp 2 1; Q13 airspeed ignores wind 1; F1 disc normal fore-aft sign 4; F2 disc normal lateral sign 11; F3 hub spring swapped 10; F3b hub spring sign
//   12; F4 reaction torque sign 2; F5 no governor 2; F6 power limit at design speed 1; F7 engine never out 3; F8 rotor inertia doubled 1; F8b omega-dot sign 5; F9 pitch-rate carry sign 3; F9b roll-rate carry sign 5; F10
//   backward flap fore-aft sign 2; F10b backward flap lateral sign 1; F11 flap coefficient no inflow 1; F13 flapping lag 3x 3; F14 pitch cyclic sign 2; F14b roll cyclic sign 6; F15 muX from the sideways speed 2; F16 hub
//   speed ignores the turn 1; F17 climb rate not on the disc normal 1; T1 pedal sign 2; T2 tail damping sign 5; T3 tail sees no turn 1; T4 fin sign 1; T5 stabiliser sign 2; T6 drag loses its sign 1; T7 gravity 99% 4; T8
//   drag area x doubled 1; T9 fin area zero 1; T10 stabiliser area zero 1; K1 no skid damper 2; K2 skid spring doubled in force 1; K3 no friction 1; K4 friction along the motion 2; K5 skids can pull 1; K6 friction
//   regularised wide 1; L1 hull never touches 1; L2 tip clearance off 1; L2b tip clearance 1 m 1; L3 rotor strike even when stopped 2; L4 sink limit 9 1; L4b sink limit 2 1; L5 tilt limit 3 rad 2; L5b tilt limit 15 deg
//   1; L6 lost only if pos is not finite 1; L6b lost misses omega 1; L7 finished flight steps on 1; L7b lost flight steps on 1; L8 rotor speed may go negative 1; L9 flapping unclamped 1; L10 time does not advance 1; L11
//   engine failure forgotten 2; L12 induced velocity not carried 1; H1 trim step tiny 8; H2 trim converged always 8; H3 trim flap init sign 1; H5 trim Newton sign 12; H6 trim 3 iterations 3; D1 DT 1/120 6; D2 air
//   density 1.2 4; D3 gravity 9.8 1; D4 kBeta zero 3; D5 hub on the centre of mass 6; D6 rotor inertia 2000 1; D7 flapping lag 0.04 1; D8 governor gain 400 2; D9 engine 0.9 MW 1; D10 profile drag 0.02 5; D11 tail arm 5
//   3; D12 skid spring 60000 1; D13 skid damper 2000 1; D14 friction 0.3 1; D15 hull nose lower 5; D16 mass 4400 6; D17 inertia roll 1; D18 stall limit 0.2 1; D19 lift slope 6.5 5; D20 collective range 6; D21 tail pitch
//   range 1; D22 flapMax 0.2 1; D23 kappa 1.0 4.
"use strict";
import * as R from "./rotorcraftModel6dof.mjs";
import { rotateByQuat } from "./rigidBody6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const D2R = Math.PI / 180, G = R.GRAVITY, RHO = R.AIR_DENSITY;
const m = R.createRotorModel(), S = m.spec, W = m.weight, A = m.discArea, VH = R.hoverInduced(W, A), TIP = S.rotor.omega0 * S.rotor.radius, I_R = S.rotor.inertia;
const trim = R.hoverTrim(m), flapOf = (c) => [-c.pitch * S.rotor.flapMax, c.roll * S.rotor.flapMax];
const trimCtl = { collective: trim.collective, pitch: trim.pitch, roll: trim.roll, yaw: trim.yaw };
const atTrim = (o = {}) => R.createState(m, { pos: [0, 0, 100], pitch: trim.pitchAttitude, bank: trim.bank, flap: flapOf(trim), ...o });
const run = (state, ctl, n, wind) => { let s = state, o = null; for (let i = 0; i < n; i++) { o = R.stepRotor(m, s, typeof ctl === "function" ? ctl(i, s) : ctl, R.DT, wind); s = o.state; } return { s, o }; };

console.log("rotorcraftModel6dof-selfcheck -- the helicopter that can fall\n");

console.log("1. THE NUMBERS");
{
    ok("!! THE AIRFRAME IS WHAT THE HEADER SAYS AND MOMENTUM THEORY MAKES OF IT: 4,500 kg (weight 44,130 N), a 7.3 m rotor (168 m^2 of disc, a disc loading of 263 N/m^2), a tip speed of 240.9 m/s, and a hover induced velocity sqrt(W / (2 rho A)) of 10.37 m/s -- each worked out here; the spec and its parts are frozen",
        m.mass === 4500 && near(W, 4500 * G, 1e-9) && near(A, Math.PI * 7.3 * 7.3, 1e-9) && near(W / A, 263.6, 0.2) && near(TIP, 240.9, 1e-9) && near(VH, Math.sqrt(W / (2 * RHO * A)), 1e-12) && near(VH, 10.37, 0.01) && Object.isFrozen(R.ATTACK) && Object.isFrozen(R.ATTACK.rotor) && Object.isFrozen(R.ATTACK.skids), `${(W / A).toFixed(1)} N/m^2, ${VH.toFixed(3)} m/s`);
}

console.log("\n2. MOMENTUM THEORY");
{
    ok("!! THE AXIAL INDUCED VELOCITY IS THE TEXTBOOK'S: 1 in the hover, (-x/2 + sqrt(x^2/4 + 1)) in a climb (0.6180 at x = 1, 0.4142 at x = 2), Johnson's fit in the vortex ring (1.816 at x = -1, 1.026 at x = -2 where it meets the windmill brake), and (-x/2 - sqrt(x^2/4 - 1)) below it (0.3820 at x = -3, 0 at the far end); continuous at x = 0 and at x = -2 to 0.03",
        R.inducedAxial(0) === 1 && near(R.inducedAxial(1), 0.618034, 1e-6) && near(R.inducedAxial(2), Math.SQRT2 - 1, 1e-6) && near(R.inducedAxial(-1), 1.816, 1e-9) && near(R.inducedAxial(-2 + 1e-9), 1.026, 1e-3) && near(R.inducedAxial(-2), 1, 1e-12) && near(R.inducedAxial(-3), 0.381966, 1e-6) && Math.abs(R.inducedAxial(-1e-9) - 1) < 1e-6 && Math.abs(R.inducedAxial(-2 + 1e-9) - R.inducedAxial(-2)) < 0.03,
        [0, 1, 2, -1, -2, -3].map((x) => R.inducedAxial(x).toFixed(4)).join(" "));
    const g0 = R.inducedGlauert(VH, 0, 0, VH, 40), g1 = R.inducedGlauert(VH, VH, 0, VH, 60), g2 = R.inducedGlauert(VH, 0, 6 * VH, VH, 60);
    ok("!! GLAUERT'S INDUCED VELOCITY REDUCES TO MOMENTUM THEORY AND TO THE FORWARD-FLIGHT LIMIT: with no speed it is vh (hover) and vh x 0.618 at a climb of one vh (to 1e-3), and at six hover-induced velocities of forward speed it is vh^2 / V = vh / 6 (to 2%); it falls as the forward speed rises",
        near(g0, VH, 1e-3) && near(g1, VH * 0.618034, 2e-3 * VH) && rel(g2, VH / 6) < 0.02 && R.inducedGlauert(VH, 0, 2 * VH) > R.inducedGlauert(VH, 0, 4 * VH), `${g0.toFixed(3)} ${g1.toFixed(3)} ${g2.toFixed(3)}`);
    ok("!! THE VORTEX RING STATE IS ENTERED AND LEFT AS THE HEADER SAYS: the rotor's induced velocity in a descent of one vh is Johnson's 1.816 vh with no forward speed, Glauert's with forward speed of three vh (the wake is blown clear: within 6%), and in a climb it is Glauert's; the thrust factor is 0.700 at x = -1, 0.9945 at x = -1 with a forward speed of 2 vh, ~1 at x = +1, and never NaN with no thrust at all",
        near(R.inducedVelocity(VH, -VH, 0), 1.816 * VH, 1e-9) && rel(R.inducedVelocity(VH, -VH, 3 * VH), R.inducedGlauert(VH, -VH, 3 * VH)) < 0.06 && near(R.inducedVelocity(VH, VH, 0), R.inducedGlauert(VH, VH, 0), 1e-9)
        && near(R.vortexRingFactor(VH, -VH, 0), 0.7, 1e-9) && near(R.vortexRingFactor(VH, -VH, 2 * VH), 1 - 0.3 * Math.exp(-4), 1e-9) && R.vortexRingFactor(VH, VH, 0) > 0.9999 && R.vortexRingFactor(0, 0, 0) === 1 && R.inducedVelocity(0, 0, 0) === 0);
    const ctMax = S.rotor.ctOverSigmaMax * S.rotor.solidity;
    ok("!! THE RETREATING BLADES STALL: the thrust coefficient is untouched below 0.8 of its limit (0.12 sigma = 0.009), saturates smoothly toward the limit and never passes it, is odd (a negative one is limited the same), and a huge one is the limit", R.stallLimit(0.5 * ctMax, ctMax) === 0.5 * ctMax && R.stallLimit(0.8 * ctMax, ctMax) === 0.8 * ctMax && R.stallLimit(0.9 * ctMax, ctMax) > 0.8 * ctMax && R.stallLimit(0.9 * ctMax, ctMax) < 0.9 * ctMax && R.stallLimit(5 * ctMax, ctMax) <= ctMax && near(R.stallLimit(5 * ctMax, ctMax), ctMax, 1e-4 * ctMax) && R.stallLimit(-0.9 * ctMax, ctMax) === -R.stallLimit(0.9 * ctMax, ctMax));
    const light = R.inducedGlauert(1, 0, 0, 1, 60), tiny = R.inducedGlauert(0.01, 0, 0, 0.01, 60);
    ok("!! GLAUERT'S EQUATION HOLDS FOR A LIGHT ROTOR TOO (the floor on the speed under the root is a guard, not a rule): with a hover-induced velocity of 1 m/s and of 1 cm/s and no motion the induced velocity is vh (to 1e-3 and 1e-5) -- the root of vi = vh^2 / vi", near(light, 1, 1e-3) && near(tiny, 0.01, 1e-5), `${light.toFixed(4)} ${tiny.toFixed(5)}`);
    const wb = [-2.5, -3, -4].map((x) => ({ got: R.inducedVelocity(VH, x * VH, 0) / VH, want: -x / 2 - Math.sqrt(x * x / 4 - 1) }));
    ok("!! IN A FAST DESCENT THE INDUCED VELOCITY IS THE WINDMILL BRAKE'S: at descents of 2.5, 3 and 4 hover-induced velocities with no forward speed it is vh x (-x/2 - sqrt(x^2/4 - 1)) = 0.5, 0.382 and 0.268 vh to 1e-9 (Glauert's relaxed passes only come near that root)", wb.every((r) => near(r.got, r.want, 1e-9)), wb.map((r) => r.got.toFixed(4)).join(" "));
    const sp = R.rotorThrust(m, { collective: 0.5, omega: 33, vc: 0, vxy: 40, vi: VH }), thetaHalf = S.rotor.collective[0] + 0.5 * (S.rotor.collective[1] - S.rotor.collective[0]), sa2 = S.rotor.solidity * S.rotor.liftSlope / 2, muSp = 40 / TIP, profile0 = (S.rotor.solidity * S.rotor.cd0 / 8) * RHO * A * TIP ** 3;
    ok("!! THE BLADE ELEMENT AT SPEED IS THE TEXTBOOK'S: at 40 m/s in the disc's plane (mu = 0.166) CT = (sigma a / 2)(theta0 / 3 (1 + 1.5 mu^2) - lambda / 2) to 1e-12, the thrust is rho A (Omega R)^2 CT (the root of the two equations, to 1e-8 relative), and the profile power is the hover's times (1 + 4.6 mu^2)",
        near(sp.mu, muSp, 1e-12) && near(sp.ct, sa2 * ((thetaHalf / 3) * (1 + 1.5 * muSp * muSp) - sp.lambda / 2), 1e-12) && rel(sp.thrust, RHO * A * TIP * TIP * sp.ct) < 1e-8 && rel(sp.profile, profile0 * (1 + 4.6 * muSp * muSp)) < 1e-12, `CT ${sp.ct.toFixed(5)}, T ${sp.thrust.toFixed(0)} N`);
    const hiSpeed = R.rotorThrust(m, { collective: 1, omega: 33, vc: 0, vxy: 72, vi: VH }), hiLinear = sa2 * ((S.rotor.collective[1] / 3) * (1 + 1.5 * (72 / TIP) ** 2) - hiSpeed.lambda / 2), hover1 = R.rotorThrust(m, { collective: 1, omega: 33, vc: 0, vxy: 0, vi: VH });
    ok("!! THE STALL LIMIT BITES WHERE THE RETREATING BLADES STALL, NOT IN THE HOVER: at full collective in the hover CT (0.0062) is under the knee (0.8 of 0.12 sigma = 0.0072) and the limit does not touch it, but at 72 m/s (mu 0.3) the blade element alone would give more than the limit (0.0112 against 0.009) and the rotor gives the saturated value, between 0.8 and 1.0 of the limit",
        hover1.ct < 0.8 * ctMax && hiLinear > ctMax && hiSpeed.ct > 0.8 * ctMax && hiSpeed.ct < ctMax && near(hiSpeed.ct, R.stallLimit(hiLinear, ctMax), 1e-12), `${hover1.ct.toFixed(5)}, ${hiLinear.toFixed(5)} -> ${hiSpeed.ct.toFixed(5)}`);
    const same = { omega: 33, vc: 0, vxy: 0, vi: VH }, tFull = R.rotorThrust(m, { collective: 1, ...same }), tOver = R.rotorThrust(m, { collective: 2, ...same }), tZero = R.rotorThrust(m, { collective: 0, ...same }), tUnder = R.rotorThrust(m, { collective: -1, ...same });
    const tSlow = R.rotorThrust(m, { collective: 1, omega: 10, vc: 0, vxy: 0, vi: 1 }), tStopped = R.rotorThrust(m, { collective: 1, omega: 0, vc: 0, vxy: 0, vi: 1 });
    ok("!! THE ROTOR'S THRUST IS FOR A COLLECTIVE OF 0..1 AT THE ROTOR'S OWN SPEED: a collective of 2 gives a collective of 1's thrust and of -1 a collective of 0's (to the bit); the thrust goes as the speed squared (at 10 rad/s it is the 33 rad/s one's times (10/33)^2, to 1e-6 relative: 6.7 kN) and a stopped rotor gives under a millinewton",
        tOver.thrust === tFull.thrust && tUnder.thrust === tZero.thrust && tFull.thrust > tZero.thrust && rel(tSlow.thrust, tFull.thrust * (10 / 33) ** 2) < 1e-6 && tStopped.thrust < 1e-3, `${tFull.thrust.toFixed(0)} N, ${tSlow.thrust.toFixed(0)} N at 10 rad/s, ${tStopped.thrust.toExponential(1)} N stopped`);
}

console.log("\n3. THE HOVER");
{
    const hov = R.rotorThrust(m, { collective: m.hover.collective, omega: S.rotor.omega0, vc: 0, vxy: 0, vi: VH }), prof = (S.rotor.solidity * S.rotor.cd0 / 8) * RHO * A * TIP ** 3;
    ok("!! THE HOVER COLLECTIVE MAKES THRUST EQUAL WEIGHT, AND THE POWER IS THE TEXTBOOK'S: T = 44,130 N to 1e-6 relative at a collective of 0.736 (6.7 degrees of blade pitch, in a range of -1.7 to 9.7), the induced velocity is vh, the shaft power kappa T vh + sigma Cd0 / 8 rho A (Omega R)^3 = 527 + 268 = 795 kW, the torque that over the rotor speed (24.1 kN m)",
        rel(hov.thrust, W) < 1e-6 && near(hov.vi, VH, 1e-3) && near(m.hover.collective, 0.736, 0.001) && rel(hov.power, S.rotor.kappa * W * VH + prof) < 1e-3 && near(hov.power, 795e3, 2e3) && near(hov.torque, hov.power / S.rotor.omega0, 1e-6) && near(hov.torque, 24097, 5) && hov.profile === prof, `${hov.thrust.toFixed(1)} N, ${(hov.power / 1e3).toFixed(1)} kW`);
    const f = R.forcesAndMoments(m, R.createState(m, { pos: [0, 0, 100] }), { collective: m.hover.collective, pitch: 0, roll: 0, yaw: 0 });
    ok("!! THE TAIL ROTOR IS RIGGED TO THE ROTOR'S TORQUE: at the design hover and pedal 0 the engine's reaction torque on the fuselage is -24.1 kN m about +Z and the tail rotor's force at its 6.8 m arm gives +24.1 kN m back, so the yaw moment is zero to 0.1% of it -- the tail pushes the tail to the right by 3.54 kN (negative, toward -Y)",
        near(f.acc.torque[2], 0, 0.001 * m.hover.torque) && near(f.tail.force, -m.hover.torque / 6.8, 1e-3 * m.hover.torque / 6.8) && f.tail.force < 0 && near(f.rotor.engineTorque, m.hover.torque, 1e-3 * m.hover.torque), `${f.tail.force.toFixed(0)} N, residual ${f.acc.torque[2].toFixed(2)} N m`);
    ok("!! A TRIM HOLDS THE MACHINE STILL, AND IT IS NOT THE ZERO TRIM: the Newton solve over the six unknowns converges with every force and moment zero (to 1e-3 of the weight), the pedal is 0 (the rigging) and the pitch attitude 0, but the machine is BANKED 3 degrees with the left side down and the cyclic LEFT (-0.194) -- the disc's lateral tilt in the world is atan(tail force / weight) = 4.6 degrees, which the bank and the cyclic share",
        trim.converged && trim.residual.every((v) => Math.abs(v) < 1e-3 * W) && Math.abs(trim.yaw) < 0.01 && Math.abs(trim.pitchAttitude) < 0.3 * D2R && near(trim.bank / D2R, -3.0, 0.3) && near(trim.roll, -0.194, 0.01) && Math.abs(trim.pitch) < 0.01 && (() => {
            const s = atTrim(), n = rotateByQuat(s.q, [Math.sin(s.flapA), -Math.sin(s.flapB), Math.cos(s.flapA) * Math.cos(s.flapB)]), lateral = Math.atan2(Math.abs(n[1]), n[2]);
            return near(lateral, Math.atan2(m.hover.torque / 6.8, W), 3e-3);
        })(), `bank ${(trim.bank / D2R).toFixed(2)}, cyclic ${trim.roll.toFixed(3)}, collective ${trim.collective.toFixed(4)}`);
    const held = run(atTrim(), trimCtl, 120).s;
    ok("!! THE TRIM STAYS STILL: two seconds from it with its controls, the machine has moved less than a millimetre, its speed is under 1e-4 m/s, its rotor speed is the design 33 rad/s to 1e-6 and its height 100 m to a millimetre -- the governor holds the speed and the hover is an equilibrium of the whole model", Math.hypot(...held.pos.map((v, i) => v - [0, 0, 100][i])) < 1e-3 && Math.hypot(...held.vel) < 1e-4 && near(held.omega, 33, 1e-6));
    const fwdHub = R.createRotorModel({ ...R.ATTACK, rotor: { ...S.rotor, hub: [0.1, 0, 1.6] } }), tF = R.hoverTrim(fwdHub);
    let sF = R.createState(fwdHub, { pos: [0, 0, 100], pitch: tF.pitchAttitude, bank: tF.bank, flap: flapOf(tF) });
    for (let i = 0; i < 120; i++) sF = R.stepRotor(fwdHub, sF, { collective: tF.collective, pitch: tF.pitch, roll: tF.roll, yaw: tF.yaw }).state;
    ok("!! A TRIM HOLDS A DIFFERENT AIRFRAME STILL TOO, ONE WITH A PITCHING MOMENT TO TRIM (the hub 0.1 m ahead of the centre of mass: 4.4 kN m): the solve converges on a longitudinal cyclic that is not zero (the first airframe's is) and two seconds from it the machine has moved less than a millimetre",
        tF.converged && Math.abs(tF.pitch) > 0.1 && Math.hypot(...sF.pos.map((v, i) => v - [0, 0, 100][i])) < 1e-3 && Math.hypot(...sF.vel) < 1e-3, `cyclic ${tF.pitch.toFixed(3)}, pitch attitude ${(tF.pitchAttitude / D2R).toFixed(2)} deg`);
}

console.log("\n4. A HOVER IS UNSTABLE");
{
    const peaks = []; let s = atTrim({ pos: [0, 0, 400], pitch: trim.pitchAttitude + 1 * D2R }), crashed = false;
    for (let i = 0; i < 60 * 60; i++) { const o = R.stepRotor(m, s, trimCtl); s = o.state; if (i % 30 === 0) peaks.push(Math.abs(R.attitude(s).pitch / D2R)); if (o.status !== "airborne") { crashed = true; break; } }
    const early = Math.max(...peaks.slice(0, 20)), late = Math.max(...peaks.slice(-20));
    ok("!! THE HOVER IS AN UNSTABLE EQUILIBRIUM, NOT A STABLE TRIM: a one-degree pitch error with the trim's controls left alone does not come back -- it becomes an oscillation that GROWS (the machine moves with the tilt, the disc flaps back, the nose goes up: the speed instability the header names): the largest pitch in the first ten seconds is under 4 degrees, the largest in the last ten is over 6 times that of the first, and the machine has not crashed in a minute",
        !crashed && early < 4 && late > 6 * early && late > 8, `first 10 s ${early.toFixed(2)} deg, last 10 s ${late.toFixed(2)} deg`);
}

console.log("\n5. THE PILOT'S SENSES");
{
    const after = (key, d, n = 12) => { const { s } = run(atTrim(), { ...trimCtl, [key]: trimCtl[key] + d }, n); return { s, r: R.rates(s) }; };
    const pP = after("pitch", 0.2), pM = after("pitch", -0.2), rP = after("roll", 0.2), rM = after("roll", -0.2), yP = after("yaw", 0.2), yM = after("yaw", -0.2), cP = after("collective", 0.1), cM = after("collective", -0.1);
    ok("!! EACH CONTROL MOVES THE MACHINE IN THE HEADER'S SENSE: stick back (+0.2 pitch) is a nose-UP rate and forward a nose-down one; stick right (+0.2 roll) a right-side-DOWN roll rate and left the other; the right pedal (+0.2 yaw) a nose-RIGHT rate and the left pedal nose-left; collective up (+0.1) a climb and down a sink -- 0.2 s after the input",
        pP.r.pitch > 0.01 && pM.r.pitch < -0.01 && rP.r.roll > 0.05 && rM.r.roll < -0.05 && yP.r.yaw > 0.1 && yM.r.yaw < -0.1 && cP.s.vel[2] > 0.3 && cM.s.vel[2] < -0.3, `pitch ${pP.r.pitch.toFixed(3)}/${pM.r.pitch.toFixed(3)}, roll ${rP.r.roll.toFixed(3)}/${rM.r.roll.toFixed(3)}, yaw ${yP.r.yaw.toFixed(3)}/${yM.r.yaw.toFixed(3)}, climb ${cP.s.vel[2].toFixed(2)}/${cM.s.vel[2].toFixed(2)}`);
    const f0 = R.forcesAndMoments(m, atTrim(), trimCtl), fr = R.forcesAndMoments(m, atTrim(), { ...trimCtl, roll: trim.roll + 0.3 }), fp = R.forcesAndMoments(m, atTrim(), { ...trimCtl, pitch: trim.pitch + 0.3 });
    ok("!! A CYCLIC INPUT HAS NO CROSS-COUPLING (the header says so): at the first tick a roll input changes no pitching moment and no flapping rate in the other plane, and a pitch input changes no rolling moment -- the flapping responds in the plane it was given, not ninety degrees later (a gap a real rotor does not have, said in the header)",
        near(fr.acc.torque[1], f0.acc.torque[1], 1e-6) && near(fr.flapDot[0], f0.flapDot[0], 1e-9) && near(fp.acc.torque[0], f0.acc.torque[0], 1e-6) && near(fp.flapDot[1], f0.flapDot[1], 1e-9) && Math.abs(fr.flapDot[1] - f0.flapDot[1]) > 0.1 && Math.abs(fp.flapDot[0] - f0.flapDot[0]) > 0.1);
    const att = R.attitude(R.createState(m, { heading: 0.7, pitch: 0.2, bank: -0.3 })), east = rotateByQuat(R.createState(m, { heading: Math.PI / 2 }).q, [1, 0, 0]), nose20 = rotateByQuat(R.createState(m, { pitch: 20 * D2R }).q, [1, 0, 0]), left20 = rotateByQuat(R.createState(m, { bank: 20 * D2R }).q, [0, 1, 0]);
    const windy = R.attitude(R.createState(m, { pos: [0, 0, 77], velocity: [10, 0, 4] }), [3, 0, 0]);
    ok("!! THE ATTITUDE IS IN THE PILOT'S SENSES AND IT ROUND-TRIPS: a heading of +90 degrees (a right turn from +X) puts the nose along world -Y, a pitch of +20 puts the nose 20 degrees UP, a bank of +20 lifts the body's LEFT axis 20 degrees (the right side is DOWN); heading 0.7, pitch 0.2 and bank -0.3 read back as they were put in (to 1e-9); and with a 3 m/s wind along +X a velocity of (10, 0, 4) is a ground speed of 10, a climb of 4, a height of 77 and an airspeed of sqrt(7^2 + 4^2)",
        near(east[0], 0, 1e-12) && near(east[1], -1, 1e-12) && near(nose20[2], Math.sin(20 * D2R), 1e-12) && near(left20[2], Math.sin(20 * D2R), 1e-12) && near(att.heading, 0.7, 1e-9) && near(att.pitch, 0.2, 1e-9) && near(att.bank, -0.3, 1e-9)
        && near(windy.airspeed, Math.hypot(7, 4), 1e-12) && near(windy.groundSpeed, 10, 1e-12) && windy.climb === 4 && windy.altitude === 77, `${att.heading.toFixed(3)} ${att.pitch.toFixed(3)} ${att.bank.toFixed(3)}, airspeed ${windy.airspeed.toFixed(3)}`);
    const th0 = S.rotor.collective[0] + m.hover.collective * (S.rotor.collective[1] - S.rotor.collective[0]), still = { collective: m.hover.collective, pitch: 0, roll: 0, yaw: 0 }, kOf = (f) => ((8 / 3) * th0 - 2 * f.rotor.lambda) / (1 - 0.5 * f.rotor.mu * f.rotor.mu);
    const fX = R.forcesAndMoments(m, R.createState(m, { velocity: [10, 0, 0] }), still), fY = R.forcesAndMoments(m, R.createState(m, { velocity: [0, 10, 0] }), still);
    ok("!! THE DISC TILTS AWAY FROM THE MACHINE'S MOTION (backward flapping, the speed instability): at 10 m/s forward the disc's forward tilt rate is -k mu / tau with k = (8/3 theta0 - 2 lambda) / (1 - mu^2/2) and mu = 10 / tip speed (to 1e-9), at 10 m/s to the LEFT its rightward tilt rate is +k mu / tau, and neither moves the other plane",
        near(fX.flapDot[0], -kOf(fX) * (10 / TIP) / S.rotor.flapTau, 1e-9) && near(fX.flapDot[1], 0, 1e-9) && near(fY.flapDot[1], kOf(fY) * (10 / TIP) / S.rotor.flapTau, 1e-9) && near(fY.flapDot[0], 0, 1e-9), `${fX.flapDot[0].toFixed(4)} / ${fY.flapDot[1].toFixed(4)} rad/s`);
    const fW = R.forcesAndMoments(m, R.createState(m, { w: [0, 0.5, 0] }), still), fT = R.forcesAndMoments(m, R.createState(m, { velocity: [10, 0, 0], flap: [0.1, 0] }), still);
    ok("!! THE DISC SEES THE HUB'S VELOCITY, TURN INCLUDED, ALONG AND ACROSS ITS OWN NORMAL: a pitch rate of 0.5 rad/s carries the hub (1.6 m above the centre of mass) through the air at 0.8 m/s (w x r), all of it in the disc's plane; with the disc tilted forward 0.1 rad and 10 m/s of forward speed the climb through the disc is 10 sin 0.1 and the in-plane speed 10 cos 0.1 (to 1e-9)",
        near(fW.rotor.vxy, 0.8, 1e-9) && near(fW.rotor.vc, 0, 1e-9) && near(fT.rotor.vc, 10 * Math.sin(0.1), 1e-9) && near(fT.rotor.vxy, 10 * Math.cos(0.1), 1e-9), `${fW.rotor.vxy.toFixed(3)} m/s; ${fT.rotor.vc.toFixed(4)} / ${fT.rotor.vxy.toFixed(4)}`);
}

console.log("\n6. THE ROTOR'S SPEED");
{
    const lvl = R.createState(m, { pos: [0, 0, 100] }), climbCtl = { collective: 0.9, pitch: 0, roll: 0, yaw: 0 }, cl = R.rotorThrust(m, { collective: 0.9, omega: 33, vc: 0, vxy: 0, vi: VH }), s1 = R.stepRotor(m, lvl, climbCtl).state;
    ok("!! A CLIMB IS THRUST OVER WEIGHT: at a collective of 0.9 on a level machine the first tick's vertical speed is dt (T - W) / m to 1e-9, with T the rotor's own 1.399 W; and with the collective at 0 (no thrust) and the engine out it is free fall, -g dt, to 1e-12",
        near(s1.vel[2], R.DT * (cl.thrust - W) / m.mass, 1e-9) && near(cl.thrust / W, 1.399, 0.01) && near(R.stepRotor(m, R.createState(m, { pos: [0, 0, 100], engine: "out" }), { collective: 0 }).state.vel[2], -G * R.DT, 1e-12));
    const fT = R.forcesAndMoments(m, atTrim(), trimCtl);
    ok("!! THE GOVERNOR HOLDS THE ROTOR'S SPEED: at the design hover the engine torque is the rotor's own (24.1 kN m, equal to the aerodynamic torque to 1e-6) and the rotor's acceleration is zero; at 30 rad/s the engine adds Kgov x 3 = 12 kN m to what the rotor needs (within the power limit) and the rotor accelerates",
        near(fT.rotor.engineTorque, fT.rotor.aeroTorque, 1e-6) && Math.abs(fT.rotor.omegaDot) < 1e-6 && (() => { const lo = R.forcesAndMoments(m, atTrim({ omega: 30 }), trimCtl); return lo.rotor.omegaDot > 1 && lo.rotor.engineTorque > lo.rotor.aeroTorque && lo.rotor.engineTorque * 30 <= S.engine.powerMax + 1; })());
    const full = [], fullRun = (() => { let s = atTrim({ pos: [0, 0, 300] }), maxP = 0; for (let i = 0; i < 60 * 5; i++) { const f = R.forcesAndMoments(m, s, { ...trimCtl, collective: 1 }); maxP = Math.max(maxP, f.rotor.engineTorque * s.omega); s = R.stepRotor(m, s, { ...trimCtl, collective: 1 }).state; if (i % 60 === 59) full.push(s.omega); } return { s, maxP }; })();
    const lastP = (() => { const f = R.forcesAndMoments(m, fullRun.s, { ...trimCtl, collective: 1 }); return f.rotor.engineTorque * fullRun.s.omega; })(), slowEng = R.forcesAndMoments(m, atTrim({ omega: 5 }), trimCtl).rotor;
    ok("!! THE ENGINE'S POWER IS A LIMIT: at full collective (1.39 MW wanted at the design speed against the engine's 1.1) the rotor's speed falls below the design (it must) but holds above 90% of it, the engine never delivers more than its 1.1 MW, and the thrust that costs is still more than the hover's (the machine climbs); on the last tick the engine is AT its 1.1 MW (a limit, not a margin: the torque is the power over the rotor's speed, not over the design speed), and below 30% speed (5 rad/s) its torque is capped at the power over 30% of the design speed (111 kN m), not at infinity",
        fullRun.s.omega < 33 - 0.5 && fullRun.s.omega > 0.9 * 33 && fullRun.maxP <= S.engine.powerMax * 1.001 && fullRun.s.vel[2] > 4 && near(lastP, S.engine.powerMax, 1) && near(slowEng.engineTorque, S.engine.powerMax / (0.3 * 33), 1e-6), `omega ${full.map((v) => v.toFixed(1)).join(" ")}, peak ${(fullRun.maxP / 1e3).toFixed(0)} kW`);
    const outHover = atTrim({ pos: [0, 0, 1500], engine: "out" }), f0o = R.forcesAndMoments(m, outHover, trimCtl), hoverFall = run(outHover, trimCtl, 180).s;
    ok("!! WITH THE ENGINE OUT THE ROTOR SLOWS AT EXACTLY -Q / I AND THE MACHINE FALLS: the first tick's rotor acceleration is -24.1 kN m / 3,000 kg m^2 = -8.03 rad/s^2 (to 1e-6), the engine puts no torque on the fuselage, and with the collective left where the hover had it the rotor is below 60% speed within 3 s and the machine is sinking at over 10 m/s -- a model with a constant rotor speed cannot do this",
        near(f0o.rotor.omegaDot, -f0o.rotor.aeroTorque / I_R, 1e-9) && near(f0o.rotor.omegaDot, -8.03, 0.02) && f0o.rotor.engineTorque === 0 && hoverFall.omega < 0.6 * 33 && hoverFall.vel[2] < -10, `omegaDot ${f0o.rotor.omegaDot.toFixed(3)}, after 3 s omega ${hoverFall.omega.toFixed(1)}, vz ${hoverFall.vel[2].toFixed(1)}`);
    const auto = run(atTrim({ pos: [0, 0, 1500], engine: "out" }), (i) => ({ ...trimCtl, collective: i < 60 ? trimCtl.collective : 0.28 }), 60 * 20), aut = auto.s, ratio = -aut.vel[2] / VH;
    ok("!! AUTOROTATION: with the engine out and the collective lowered after a second, the descent drives the rotor back -- in twenty seconds it is within 90..105% of the design speed, the engine puts nothing on the fuselage, and the machine settles into a descent of about twice the hover induced velocity (the windmill brake: between 1.7 and 2.4 of them), still flying",
        aut.omega > 0.9 * 33 && aut.omega < 1.05 * 33 && auto.o.status === "airborne" && ratio > 1.7 && ratio < 2.4 && auto.o.rotor.engineTorque === 0 && auto.o.rotor.aeroTorque < 0.3 * m.hover.torque, `omega ${aut.omega.toFixed(1)}, descent ${(-aut.vel[2]).toFixed(1)} m/s = ${ratio.toFixed(2)} vh`);
    const ring = R.rotorThrust(m, { collective: m.hover.collective, omega: 33, vc: -VH, vxy: 0, vi: VH }), fwd = R.rotorThrust(m, { collective: m.hover.collective, omega: 33, vc: -VH, vxy: 15, vi: VH });
    ok("!! THE VORTEX RING COSTS THRUST AND FORWARD SPEED GETS THE MACHINE OUT OF IT: at the hover collective, in a vertical descent of one vh the thrust is under 92% of the weight and the induced velocity is 1.77 vh; with 15 m/s of forward speed in the same descent the thrust is more than 1.5 times the weight -- the pilot's way out", ring.thrust < 0.92 * W && near(ring.vi / VH, 1.77, 0.03) && fwd.thrust > 1.5 * W, `${(ring.thrust / W).toFixed(3)} W, ${(fwd.thrust / W).toFixed(3)} W`);
}

console.log("\n7. THE GROUND");
{
    const off = { collective: 0, pitch: 0, roll: 0, yaw: 0 }, still0 = () => ({ collective: m.hover.collective, pitch: 0, roll: 0, yaw: 0 });
    const sit = run(R.createState(m, { pos: [0, 0, 1.52] }), off, 240), skidSum = R.forcesAndMoments(m, sit.s, off).contacts.reduce((a, k) => a + k.force[2], 0), zEq = 1.5 - W / (4 * S.skidSpring);
    ok("!! FOUR SKIDS ON SPRINGS HOLD THE WEIGHT: dropped from 2 cm, with no rotor lift, the machine sits at 1.4 m (1.5 less the 0.1003 m the springs give under 44,130 N / 4 / 110,000, to 2 mm), at rest (under 1 mm/s), all four skids loaded and their forces summing to the weight to 0.5% -- and it is 'landed', not crashed",
        near(sit.s.pos[2], zEq, 2e-3) && Math.abs(sit.s.vel[2]) < 1e-3 && sit.o.status === "landed" && sit.o.skids === 4 && rel(skidSum, W) < 5e-3, `z ${sit.s.pos[2].toFixed(4)} against ${zEq.toFixed(4)}, ${skidSum.toFixed(0)} N`);
    const lift = run(sit.s, { collective: 0.9, pitch: 0, roll: 0, yaw: 0 }, 120);
    ok("!! A LANDED HELICOPTER TAKES OFF AGAIN (the flight is not over): from the skids with a collective of 0.9 it is more than 3 m up after two seconds and 'airborne'", lift.s.pos[2] > 3 && lift.o.status === "airborne", `z ${lift.s.pos[2].toFixed(2)}`);
    let drop = R.createState(m, { pos: [0, 0, 10] }), o = null, t0 = 0; for (let i = 0; i < 300; i++) { o = R.stepRotor(m, drop, off); drop = o.state; if (o.status === "crashed") { t0 = (i + 1) / 60; break; } }
    ok("!! A HARD ARRIVAL IS A CRASH, NAMED: dropped from 10 m with no lift the skids arrive at 14 m/s, far over the 4.5 m/s the structure takes: 'crashed', 'hard landing', at 1.4 seconds (free fall from 8.5 m)", o.status === "crashed" && o.why === "hard landing" && o.sink > 10 && near(t0, Math.sqrt(2 * 8.5 / G), 0.1), `${o.why} at ${t0.toFixed(2)} s, sink ${o.sink.toFixed(1)}`);
    const tilted = R.classify(m, R.createState(m, { pos: [0, 0, 1.3], bank: 35 * D2R, omega: 0 })), strike = R.classify(m, R.createState(m, { pos: [0, 0, 3], bank: 50 * D2R })), hullHit = R.classify(m, R.createState(m, { pos: [0, 0, 0.5], pitch: 0 })), skidOk = R.classify(m, R.createState(m, { pos: [0, 0, 1.4] })), air = R.classify(m, R.createState(m, { pos: [0, 0, 20] }));
    ok("!! THE FATES ARE NAMED BY WHAT DECIDED THEM: a skid down with the machine 35 degrees off the level and the rotor stopped is 'tilted landing'; the rotor's tip within 0.2 m of the ground (a 50-degree bank at 3 m, the rotor turning) is a 'rotor strike'; a hull point (the nose, the boom, the mast) on the ground is 'hull'; a level machine on its skids is 'landed'; at 20 m 'airborne'; a state that is not a number is 'lost'",
        tilted.status === "crashed" && tilted.why === "tilted landing" && strike.status === "crashed" && strike.why === "rotor strike" && hullHit.status === "crashed" && hullHit.why === "hull" && skidOk.status === "landed" && air.status === "airborne" && R.classify(m, { ...R.createState(m, {}), pos: [NaN, 0, 0] }).status === "lost", [tilted.why, strike.why, hullHit.why].join(" / "));
    const slide = run(R.createState(m, { pos: [0, 0, 1.4], velocity: [5, 0, 0] }), off, 30).s;
    ok("!! FRICTION SLOWS A SLIDE: on its skids with no lift at 5 m/s, half a second later it is going 5 - mu g t = 2.06 m/s (mu 0.6) to 8% -- the Coulomb friction of the header", near(Math.hypot(slide.vel[0], slide.vel[1]), 5 - 0.6 * G * 0.5, 0.17), `${slide.vel[0].toFixed(3)} m/s`);
    const dead = R.stepRotor(m, R.createState(m, { pos: [0, 0, 10] }), off), crashed = (() => { let s = R.createState(m, { pos: [0, 0, 10] }), q = null; for (let i = 0; i < 300; i++) { q = R.stepRotor(m, s, off); s = q.state; if (q.status === "crashed") break; } return q; })(), again = R.stepRotor(m, crashed.state, { collective: 1 });
    const lost = { ...R.createState(m, {}), pos: [NaN, 0, 0] }, lostStep = R.stepRotor(m, lost, off);
    ok("!! A FINISHED FLIGHT STAYS FINISHED: stepping a crashed state returns that state, the very object, still 'crashed'; stepping one that is not a number returns it unchanged and 'lost'; the same controls and the same state give the same bits twice", again.state === crashed.state && again.status === "crashed" && lostStep.state === lost && lostStep.status === "lost" && JSON.stringify(R.stepRotor(m, atTrim(), trimCtl)) === JSON.stringify(R.stepRotor(m, atTrim(), trimCtl)) && dead.status !== "lost");
    const atSink = (vz) => R.classify(m, R.createState(m, { pos: [0, 0, 1.499], velocity: [0, 0, vz] }));
    ok("!! THE SINK LIMIT IS 4.5 M/S: a skid arriving at 3 and at 4.2 m/s (the machine level, nothing else touching) is 'landed', at 4.8 and at 6 m/s a 'hard landing', and the sink speed it reports is the skid's (4.8)", atSink(-3).status === "landed" && atSink(-4.2).status === "landed" && atSink(-4.8).why === "hard landing" && atSink(-6).why === "hard landing" && near(atSink(-4.8).sink, 4.8, 1e-9));
    const pull = R.forcesAndMoments(m, R.createState(m, { pos: [0, 0, 1.499], velocity: [0, 0, 3] }), off).contacts;
    ok("!! A SKID PUSHES AND NEVER PULLS: leaving the ground at 3 m/s with the spring barely compressed (110 N) the damper would pull with 36 kN if it could; all four skids are in contact and give exactly 0 N, not a negative force", pull.length === 4 && pull.every((k) => k.force[2] === 0), pull.map((k) => k.force[2]).join(" "));
    const b30 = 30 * D2R, hFor = (clear) => 7.3 * Math.sin(b30) - 1.6 * Math.cos(b30) + clear, tipAt = (clear) => R.classify(m, R.createState(m, { pos: [0, 0, hFor(clear)], bank: b30 }));
    ok("!! THE ROTOR'S TIP CLEARANCE IS 0.2 M: a machine banked 30 degrees with the rotor turning and the tip 0.15 m above the ground is a 'rotor strike', and with the tip 0.25 m above it is 'airborne' (no skid or hull point is near the ground at that height)", tipAt(0.15).why === "rotor strike" && tipAt(0.25).status === "airborne");
    const tiltAt = (deg) => R.classify(m, R.createState(m, { pos: [0, 0, 1.7], bank: deg * D2R, omega: 0 }));
    ok("!! THE TILT LIMIT IS 30 DEGREES: a skid down with the rotor stopped and the machine banked 28 degrees is 'landed', at 32 degrees it is a 'tilted landing'", tiltAt(28).status === "landed" && tiltAt(32).why === "tilted landing");
    const lostWith = (k, v) => R.classify(m, { ...R.createState(m, { pos: [0, 0, 50] }), [k]: v }).status;
    ok("!! A STATE IS LOST IF ANY OF ITS NUMBERS IS NOT A NUMBER: the position, the velocity, the attitude, the spin and the rotor speed, each set to NaN alone, give 'lost' (and the same state with the rotor speed a number is 'airborne')", lostWith("pos", [NaN, 0, 50]) === "lost" && lostWith("vel", [0, NaN, 0]) === "lost" && lostWith("q", [NaN, 0, 0, 0]) === "lost" && lostWith("w", [0, 0, NaN]) === "lost" && lostWith("omega", NaN) === "lost" && lostWith("omega", 33) === "airborne");
    const crawl = R.stepRotor(m, R.createState(m, { pos: [0, 0, 5000], omega: 0.5, engine: "out" }), { collective: 1 }, 2000), spin = R.stepRotor(m, R.createState(m, { pos: [0, 0, 100], w: [0, -10, 0] }), still0(), 0.1);
    ok("!! A ROTOR CANNOT SPIN BACKWARDS AND A DISC CANNOT TILT WITHOUT LIMIT: with the engine out at 0.5 rad/s a step far too long (2,000 s) leaves the rotor at 0, not below; and a pitch rate of 10 rad/s for 0.1 s, which would carry the disc 1 rad, stops it at 120% of the full cyclic's tilt (0.168)", crawl.state.omega === 0 && near(spin.state.flapA, 1.2 * S.rotor.flapMax, 1e-12), `${crawl.state.omega} rad/s, ${spin.state.flapA.toFixed(4)} rad`);
    const climbStep = R.stepRotor(m, R.createState(m, { pos: [0, 0, 100] }), { collective: 0.9, pitch: 0, roll: 0, yaw: 0 });
    let clock = R.createState(m, { pos: [0, 0, 400] }); for (let i = 0; i < 60; i++) clock = R.stepRotor(m, clock, trimCtl).state;
    ok("!! THE STATE CARRIES THE CLOCK AND THE LAST INDUCED VELOCITY: sixty ticks later t is 1 s (to 1e-9), and the state after a tick holds the induced velocity the rotor had in it (for a climb, not the hover's: more than 1 m/s from it)", near(clock.t, 1, 1e-9) && climbStep.state.vi === climbStep.rotor.vi && Math.abs(climbStep.state.vi - VH) > 1, `t ${clock.t.toFixed(6)}, vi ${climbStep.state.vi.toFixed(2)} (hover ${VH.toFixed(2)})`);
}

console.log("\n8. WHAT IS NOT IN IT, AS THE HEADER SAYS");
{
    const low = R.forcesAndMoments(m, atTrim({ pos: [0, 0, 6] }), trimCtl).rotor.thrust, high = R.forcesAndMoments(m, atTrim({ pos: [0, 0, 5000] }), trimCtl).rotor.thrust;
    ok("!! THERE IS NO GROUND EFFECT AND NO CHANGE OF DENSITY WITH HEIGHT (said in the header): the same controls at the same state give exactly the same thrust 6 m up and 5,000 m up (and it is the weight to 0.2%: the state is the trim's to a millimetre, not to the bit)", low === high && near(low, W, 0.002 * W));
    const withSpec = (patch) => R.createRotorModel({ ...R.ATTACK, ...patch }), forceOf = (model, vel) => R.forcesAndMoments(model, R.createState(model, { velocity: vel }), trimCtl).acc.force;
    const lost = (without, vel) => forceOf(m, vel).map((v, i) => v - forceOf(without, vel)[i]);
    const dFin = lost(withSpec({ fin: { ...S.fin, area: 0 } }), [40, 5, 0]), dStab = lost(withSpec({ stabiliser: { ...S.stabiliser, area: 0 } }), [40, 0, 4]), dBody = lost(withSpec({ fuselage: { dragArea: [0, 0, 0] } }), [-20, 10, -8]);
    ok("!! THE FIN, THE STABILISER AND THE FUSELAGE DO WHAT THE HEADER SAYS (each found as what the airframe loses without it, to a millinewton): at 40 m/s forward and 5 m/s to the left the fin pushes sideways with -1/2 rho S a |u| v = -441.0 N (against the sideslip: the weathercock); at 4 m/s upward the stabiliser pushes DOWN with 480.2 N; a body going back at 20 m/s, left at 10 and down at 8 is slowed by 1/2 rho CdA v|v| = +196.0, -275.6 and +235.2 N, each against its motion",
        near(dFin[1], -0.5 * RHO * 1.2 * 3.0 * 40 * 5, 1e-3) && near(dFin[0], 0, 1e-3) && near(dFin[2], 0, 1e-3) && near(dStab[2], -0.5 * RHO * 1.4 * 3.5 * 40 * 4, 1e-3) && near(dStab[1], 0, 1e-3)
        && near(dBody[0], 0.5 * RHO * 0.8 * 400, 1e-3) && near(dBody[1], -0.5 * RHO * 4.5 * 100, 1e-3) && near(dBody[2], 0.5 * RHO * 6.0 * 64, 1e-3), `fin ${dFin[1].toFixed(1)}, stab ${dStab[2].toFixed(1)}, body ${dBody.map((v) => v.toFixed(1)).join(" ")}`);
    const y1 = R.forcesAndMoments(m, atTrim(), { ...trimCtl, yaw: 1 }), y0 = R.forcesAndMoments(m, atTrim(), { ...trimCtl, yaw: 0 });
    ok("!! A FULL PEDAL IS 0.3 RAD OF TAIL-ROTOR PITCH: the right pedal raises the tail rotor's pitch by 0.3 (to 1e-12), its force toward +Y (left) rises and the yaw moment about +Z falls (the nose goes right)", near(y1.tail.pitch - y0.tail.pitch, 0.3, 1e-12) && y1.tail.force > y0.tail.force && y1.acc.torque[2] < y0.acc.torque[2]);
    const longRun = run(atTrim({ pos: [0, 0, 600] }), trimCtl, 600).s;
    ok("!! THE MASS IS CONSTANT (no fuel burn, said in the header): ten seconds on, the body still carries 4,500 kg and the inertia it started with", longRun.mass === 4500 && longRun.I.join() === "4200,20000,17500");
    ok("!! THE CONTROLS ARE SANITISED: collective is held to 0..1 and the cyclic and pedal to -1..1, and a control that is not a number is 0", JSON.stringify(R.sanitize({ collective: 5, pitch: -9, roll: NaN, yaw: "x" })) === JSON.stringify({ collective: 1, pitch: -1, roll: 0, yaw: 0 }) && JSON.stringify(R.sanitize()) === JSON.stringify({ collective: 0, pitch: 0, roll: 0, yaw: 0 }));
}

console.log("\n9. THE FRONT DOOR");
{
    const keys = "ATTACK,AIR_DENSITY,DT,GRAVITY,attitude,attitudeQuat,classify,createRotorModel,createState,forcesAndMoments,hoverInduced,hoverTrim,inducedAxial,inducedGlauert,inducedVelocity,rates,reportLines,rotorThrust,sanitize,stallLimit,stepRotor,vortexRingFactor".split(",").sort().join();
    ok("!! the export list is pinned: ATTACK, AIR_DENSITY, DT, GRAVITY, attitude, attitudeQuat, classify, createRotorModel, createState, forcesAndMoments, hoverInduced, hoverTrim, inducedAxial, inducedGlauert, inducedVelocity, rates, reportLines, rotorThrust, sanitize, stallLimit, stepRotor, vortexRingFactor", Object.keys(R).sort().join() === keys, Object.keys(R).sort().join());
    const lines = R.reportLines();
    ok("!! the report lines name the airframe and say real numbers (the rotor, the disc loading, the induced velocity, the hover collective, the power, the trim)", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /7\.3 m rotor/.test(lines[0]) && /collective 0\.736/.test(lines[1]) && /795 kW/.test(lines[1]) && !/NOT CONVERGED/.test(lines[1]), lines[1]);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
