// WebGLEngine/brain/autopilotDrone-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/autopilotDrone-selfcheck.mjs      (a few seconds)
//
// THE QUADROTOR'S HAND PILOT, HELD TO WHAT ITS HEADER SAYS. brain/autopilotDrone.mjs is a cascade of loops with no memory: position -> velocity -> tilt -> torque, altitude -> climb -> thrust, heading -> yaw rate -> yaw, with gains DERIVED from the airframe's authority (not tuned), a landing, an upset
// recovery and a gentle descent on a failed motor. It is the baseline the learned pilots are graded against and the start they are trained from, so what it does has to be pinned, in the task's own senses, with closed forms where there is one:
//
//   1  TRIM AND AUTHORITY  the hover's thrust, the vertical acceleration a unit of thrust gives (4 tMax / m), the angular acceleration a unit of each control gives (110.9, 110.9 and 2.58 rad/s^2), the legs' depth and the attitude gains kTheta = wn^2/alpha and kQ = 2 zeta wn/alpha, each worked out here
//   2  THE LAWS            lawsFrom() is a sum: pitch = kTheta pitchErr - kQ pitchRate (and roll), yaw = kYaw yawRateErr, thrust = thrustFF + kVs climbErr, each clamped to its range, a non-finite number read as 0
//   3  THE HOVER           a machine banked 3 degrees and drifting at 0.5 m/s comes to rest on its point, level, and a hover in a wind of 6 m/s drifts by the distance and tilts by the angle the loops' gains make of the drag (worked out here: F / (m kVel kPos) = 1.13 m, atan(F / m g) = 5.9 degrees)
//   4  GO-TO               a point 30 m away is reached and stopped at, the speed never above the cap, the tilt never above the limit
//   5  ALTITUDE AND HEADING a climb or a descent of 20 m settles on its height; a turn goes the short way round the wrap
//   6  THE UPSET           from 80 degrees of bank with rates, from 130 degrees and from upside down at 175 degrees the pilot gets the machine level and back to a hover (losing height, the amount pinned)
//   7  LANDING             a descent on the profile ends landed, slowly, level, standing
//   8  A MOTOR QUITTING    the pilot gives up the yaw, asks for no translation, multiplies the thrust by 4/3 and comes down gently; AND THE MEASURED OUTCOME: from the starts the gate pins, the hand pilot crashes, at speeds of 14 to 41 m/s (a spinning quadrotor tumbles whatever its pilot asks): the corner the learned pilots are tried on
//   9  PURITY              the pilot is a function of the state, the target, the wind and the options: the same inputs twice give the same bits, nothing is mutated, a non-finite state is read as zero
//
// SABOTAGE LOG: (filled in below once run)
"use strict";
import * as Q from "../physics/mechanics/multirotorModel6dof.mjs";
import * as AP from "./autopilotDrone.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const D2R = Math.PI / 180, G = Q.GRAVITY;
const m = AP.defaultModel(), T = AP.trimOf(m), g0 = AP.AUTOPILOT_DRONE;
const sec = (t) => console.log(`\n${t}`);
const fly = (state, target, secs, wind = [0, 0, 0], hook = null) => {
    let s = state, o = null, maxSpeed = 0, maxTilt = 0, maxAxisTilt = 0, minZ = Infinity; const n = Math.round(secs / Q.DT);
    for (let i = 0; i < n; i++) {
        if (hook) s = hook(i, s);
        o = Q.stepMultirotor(m, s, AP.pilot(s, typeof target === "function" ? target(i * Q.DT) : target, wind), Q.DT, wind); s = o.state;
        maxSpeed = Math.max(maxSpeed, Math.hypot(s.vel[0], s.vel[1])); maxTilt = Math.max(maxTilt, Math.acos(Math.max(-1, Math.min(1, Q.attitude(s).up[2])))); maxAxisTilt = Math.max(maxAxisTilt, Math.abs(Q.attitude(s).pitch), Math.abs(Q.attitude(s).bank)); minZ = Math.min(minZ, s.pos[2]);
        if (o.status === "crashed") break;
    }
    return { s, o, maxSpeed, maxTilt, maxAxisTilt, minZ };
};

sec("1. TRIM AND AUTHORITY");
{
    const d = 0.25 / Math.SQRT2, tmax = 9.41;
    ok("the hover's thrust is the model's (weight / (4 tMax) = 0.41686); a unit of thrust gives 4 tMax / m = 23.525 m/s^2 of vertical acceleration; the legs reach 0.07 m below the centre", near(T.thrust, 1.6 * G / (4 * tmax), 1e-9) && near(T.thrust, 0.416861, 5e-6) && near(T.dAccPerThrust, 4 * tmax / 1.6, 1e-9) && near(T.dAccPerThrust, 23.525, 1e-3) && T.legDrop === 0.07, `${T.thrust.toFixed(6)} ${T.dAccPerThrust.toFixed(3)}`);
    ok("THE AUTHORITY, WORKED OUT HERE FROM THE MIXER, THE ARM AND THE INERTIA: a unit of roll or pitch gives 4 x 0.25 x tMax x 0.17678 / 0.015 = 110.9 rad/s^2 and a unit of yaw 4 x 0.12 x 0.016 x tMax / 0.028 = 2.58 rad/s^2 (the yaw is weak by design: the model's header)", near(T.alphaRoll, 4 * 0.25 * tmax * d / 0.015, 1e-9) && near(T.alphaRoll, 110.9, 0.1) && T.alphaPitch === T.alphaRoll && near(T.alphaYaw, 4 * 0.12 * 0.016 * tmax / 0.028, 1e-9) && near(T.alphaYaw, 2.58, 0.01), `${T.alphaRoll.toFixed(2)} / ${T.alphaYaw.toFixed(3)}`);
    const k = AP.attitudeGains(T.alphaRoll);
    ok("THE ATTITUDE GAINS ARE DERIVED, NOT TUNED: kTheta = wn^2 / alpha = 196 / 110.9 = 1.767 and kQ = 2 zeta wn / alpha = 22.4 / 110.9 = 0.2020, and they follow wn, zeta and the authority when those change", near(k.kTheta, 196 / T.alphaRoll, 1e-12) && near(k.kQ, 22.4 / T.alphaRoll, 1e-12) && near(k.kTheta, 1.767, 0.001) && near(k.kQ, 0.2020, 0.0005) && near(AP.attitudeGains(50, { wn: 10, zeta: 1 }).kTheta, 2, 1e-12) && near(AP.attitudeGains(50, { wn: 10, zeta: 1 }).kQ, 0.4, 1e-12));
    ok("the trim is computed once per model (the same object back), and a model with other numbers gets its own: a 2 kg frame with the same motors needs a thrust of 2 x 9.80665 / (4 x 9.41)", AP.trimOf(m) === AP.trimOf(m) && near(AP.trimOf(Q.createMultirotorModel({ ...Q.QUAD, mass: 2 })).thrust, 2 * G / (4 * tmax), 1e-9));
    ok("the defaults are the numbers the header says", g0.wn === 14 && g0.zeta === 0.8 && g0.kVel === 1.5 && g0.maxTilt === 0.45 && g0.tiltLow === 0.15 && g0.kPos === 0.6 && g0.speed === 8 && g0.brake === 2.5 && g0.kAlt === 1 && g0.vsUp === 4 && g0.vsDown === 3 && g0.kVs === 0.17 && g0.kHdg === 1 && g0.rMax === 1.5 && g0.kYaw === 1.16 && Object.isFrozen(g0));
}

sec("2. THE LAWS");
{
    const kp = AP.attitudeGains(T.alphaPitch), kr = AP.attitudeGains(T.alphaRoll);
    const gd = (o = {}) => ({ rates: { roll: 0, pitch: 0, yaw: 0 }, pitchErr: 0, bankErr: 0, climbErr: 0, yawRateErr: 0, thrustFF: T.thrust, ...o });
    const c = AP.lawsFrom(gd({ pitchErr: 0.1, bankErr: -0.05, rates: { roll: 0.5, pitch: -0.4, yaw: 0 }, yawRateErr: 0.3, climbErr: 1 }));
    ok("THE LAWS ARE A SUM, AS THE HEADER SAYS: pitch = kTheta pitchErr - kQ pitchRate = 1.767 x 0.1 + 0.2020 x 0.4, roll = kTheta bankErr - kQ rollRate, yaw = 1.16 yawRateErr, thrust = thrustFF + 0.17 climbErr, to 1e-12", near(c.pitch, kp.kTheta * 0.1 + kp.kQ * 0.4, 1e-12) && near(c.roll, -kr.kTheta * 0.05 - kr.kQ * 0.5, 1e-12) && near(c.yaw, 1.16 * 0.3, 1e-12) && near(c.thrust, T.thrust + 0.17, 1e-12), JSON.stringify(c));
    const sat = AP.lawsFrom(gd({ pitchErr: 5, bankErr: -5, yawRateErr: 9, thrustFF: 0.9, climbErr: 5 })), low = AP.lawsFrom(gd({ thrustFF: 0, climbErr: -5, pitchErr: -5 }));
    ok("every output is CLAMPED to its range (thrust 0..1, the others -1..+1): a huge error saturates and a negative thrust is zero", sat.pitch === 1 && sat.roll === -1 && sat.yaw === 1 && sat.thrust === 1 && low.thrust === 0 && low.pitch === -1);
    const nan = AP.lawsFrom(gd({ pitchErr: NaN, bankErr: Infinity, yawRateErr: NaN, thrustFF: NaN, climbErr: NaN }));
    ok("a non-finite number in the guidance is read as 0, never passed on: all four outputs finite, and the thrust is then 0", Object.values(nan).every(Number.isFinite) && nan.pitch === 0 && nan.thrust === 0 && nan.yaw === 0);
    const kHalf = AP.lawsFrom(gd({ pitchErr: 0.1 }), { wn: 7 }), kFull = AP.lawsFrom(gd({ pitchErr: 0.1 }));
    ok("an option overrides a gain: with wn = 7 the same error asks a quarter of the torque (kTheta ~ wn^2)", near(kHalf.pitch / kFull.pitch, 0.25, 1e-12));
}

sec("3. THE HOVER");
{
    const a = fly(Q.createState(m, { pos: [0, 0, 50], bank: 3 * D2R, velocity: [0.5, 0.3, 0] }), { pos: [0, 0], altitude: 50, heading: 0 }, 10), at = Q.attitude(a.s);
    ok("!! A MACHINE BANKED 3 DEGREES AND DRIFTING COMES TO REST ON ITS POINT: after ten seconds it is within 5 cm of it (horizontally) and 5 cm of its height, level to 0.1 degree and moving under 1 cm/s, still airborne", a.o.status === "airborne" && Math.hypot(a.s.pos[0], a.s.pos[1]) < 0.05 && near(a.s.pos[2], 50, 0.05) && Math.abs(at.bank) < 0.1 * D2R && Math.abs(at.pitch) < 0.1 * D2R && Math.hypot(...a.s.vel) < 0.01, `pos ${a.s.pos.map((v) => v.toFixed(3))} bank ${(at.bank / D2R).toFixed(3)}`);
    const wind = [0, 6, 0], b = fly(Q.createState(m, { pos: [0, 0, 50] }), { pos: [0, 0], altitude: 50, heading: 0 }, 25, wind), ab = Q.attitude(b.s);
    const SUMW = 4 * m.hover.omega, F = 0.5 * 1.225 * 0.012 * 36 + 8e-5 * SUMW * 6, aWind = F / 1.6, dExpect = aWind / (g0.kVel * g0.kPos), bankExpect = Math.atan(aWind / G);
    ok("!! A HOVER IN A WIND OF 6 m/s DRIFTS BY THE DISTANCE THE GAINS MAKE OF THE DRAG, WORKED OUT HERE (no integrator, said in the header): the drag F = 0.5 rho CdA v^2 + 8e-5 (sum of the motor speeds) v = " + F.toFixed(3) + " N asks an acceleration F / m = " + aWind.toFixed(3) + " m/s^2, the loops hold it with an offset d = a / (kVel kPos) = " + dExpect.toFixed(3) + " m (within 4%) and a bank of atan(a / g) = " + (bankExpect / D2R).toFixed(2) + " degrees (within 0.15)", near(b.s.pos[1], dExpect, 0.04 * dExpect) && near(-Math.sign(wind[1]) * ab.bank, -bankExpect, 0.15 * D2R) && Math.abs(b.s.pos[0]) < 0.02 && Math.hypot(...b.s.vel) < 0.01, `drift ${b.s.pos[1].toFixed(3)} m, bank ${(ab.bank / D2R).toFixed(2)} deg`);
}

sec("4. GO-TO");
{
    const r = fly(Q.createState(m, { pos: [0, 0, 50] }), { pos: [30, 10], altitude: 50, heading: 0 }, 15);
    ok("!! A POINT 30 m AHEAD AND 10 m ACROSS IS REACHED AND STOPPED AT: within 5 cm of it after fifteen seconds, at rest, level, the height held to 5 cm on the way (the climb the tilt needs is fed forward), the speed never above the 8 m/s cap by more than 0.3, and the tilt limit of 0.45 rad held PER AXIS (the diagonal approach tilts the machine 0.62 rad in all: pitch and bank each at the limit)", Math.hypot(r.s.pos[0] - 30, r.s.pos[1] - 10) < 0.05 && Math.hypot(...r.s.vel) < 0.01 && r.maxSpeed < 8.3 && r.maxSpeed > 5 && r.maxAxisTilt < 0.5 && r.maxTilt > 0.55 && r.maxTilt < 0.66 && r.minZ > 49.5, `${r.s.pos.map((v) => v.toFixed(3))} max ${r.maxSpeed.toFixed(2)} m/s tilt ${r.maxTilt.toFixed(3)} (per axis ${r.maxAxisTilt.toFixed(3)}) min z ${r.minZ.toFixed(2)}`);
    const slow = fly(Q.createState(m, { pos: [0, 0, 50] }), { pos: [60, 0], altitude: 50, speed: 3 }, 30);
    ok("the speed asked for caps the approach: with `speed: 3` the same kind of flight never exceeds 3.2 m/s and still arrives (within 5 cm after thirty seconds)", slow.maxSpeed < 3.2 && slow.maxSpeed > 2.5 && Math.hypot(slow.s.pos[0] - 60, slow.s.pos[1]) < 0.05, `max ${slow.maxSpeed.toFixed(2)}`);
    const brake = fly(Q.createState(m, { pos: [0, 0, 50] }), { pos: [8, 0], altitude: 50 }, 12);
    ok("it STOPS AT the point and does not overshoot it: for a point 8 m away the furthest it goes is under 8.15 m (the braking profile sqrt(2 x 2.5 x d) is planned on 2.5 m/s^2 and the machine gives about 4.7)", (() => { let mx = 0, s = Q.createState(m, { pos: [0, 0, 50] }); for (let i = 0; i < 12 * 120; i++) { s = Q.stepMultirotor(m, s, AP.pilot(s, { pos: [8, 0], altitude: 50 })).state; mx = Math.max(mx, s.pos[0]); } return mx < 8.15 && mx > 7.9; })() && brake.o.status === "airborne");
    const vel = fly(Q.createState(m, { pos: [0, 0, 50] }), { velocity: [4, -2], altitude: 50 }, 12);
    const KQ = 0.5 * 1.225 * 0.012 / 1.6, KL = 8e-5 * 4 * m.hover.omega / 1.6, solve = (vc) => { const sg = Math.sign(vc), c = Math.abs(vc); let lo = 0, hi = c; for (let i = 0; i < 80; i++) { const v = 0.5 * (lo + hi); if (g0.kVel * (c - v) > KQ * v * v + KL * v) lo = v; else hi = v; } return sg * lo; };
    ok("A VELOCITY ASKED FOR (no point) IS FLOWN, WITH THE OFFSET THE DRAG MAKES (no integrator): per axis the loops hold kVel (vc - v) = (0.5 rho CdA v^2 + 8e-5 (sum of the motor speeds) v) / m, solved here: (4, -2) m/s asked gives (" + solve(4).toFixed(3) + ", " + solve(-2).toFixed(3) + ") m/s, within 1.5%", near(vel.s.vel[0], solve(4), 0.015 * 4) && near(vel.s.vel[1], solve(-2), 0.015 * 2), `${vel.s.vel.slice(0, 2).map((v) => v.toFixed(3))}`);
}

sec("5. ALTITUDE AND HEADING");
{
    const up = fly(Q.createState(m, { pos: [0, 0, 50] }), { pos: [0, 0], altitude: 70 }, 10), dn = fly(Q.createState(m, { pos: [0, 0, 50] }), { pos: [0, 0], altitude: 30 }, 10);
    ok("A CLIMB OF 20 m AND A DESCENT OF 20 m SETTLE ON THEIR HEIGHTS: within 3 cm after ten seconds (the battery's sag leaves the P-only loop about 2 cm low), moving under 3 cm/s, without an overshoot of more than 5 cm (the climb rate is capped at 4 m/s and the descent at 3)", near(up.s.pos[2], 70, 0.03) && Math.abs(up.s.vel[2]) < 0.03 && near(dn.s.pos[2], 30, 0.03) && Math.abs(dn.s.vel[2]) < 0.03 && (() => { let s = Q.createState(m, { pos: [0, 0, 50] }), mx = 0, mn = 99, vmax = 0, vmin = 0; for (let i = 0; i < 1200; i++) { s = Q.stepMultirotor(m, s, AP.pilot(s, { pos: [0, 0], altitude: 70 })).state; mx = Math.max(mx, s.pos[2]); vmax = Math.max(vmax, s.vel[2]); } let d = Q.createState(m, { pos: [0, 0, 50] }); for (let i = 0; i < 1200; i++) { d = Q.stepMultirotor(m, d, AP.pilot(d, { pos: [0, 0], altitude: 30 })).state; mn = Math.min(mn, d.pos[2]); vmin = Math.min(vmin, d.vel[2]); } return mx < 70.05 && mn > 29.95 && vmax <= 4.2 && vmin >= -3.2 && vmax > 3.5 && vmin < -2.5; })(), `${up.s.pos[2].toFixed(3)} / ${dn.s.pos[2].toFixed(3)}`);
    const turn = fly(Q.createState(m, { pos: [0, 0, 50] }), { pos: [0, 0], altitude: 50, heading: Math.PI / 2 }, 10), wrap = fly(Q.createState(m, { pos: [0, 0, 50], heading: 170 * D2R }), { pos: [0, 0], altitude: 50, heading: -170 * D2R }, 10);
    ok("A TURN SETTLES ON ITS HEADING (a right turn of 90 degrees, to 0.2 degree, at rest) AND GOES THE SHORT WAY ROUND THE WRAP: from 170 to -170 degrees it turns 20 degrees to the right through 180 (the heading never leaves the band 170..190 degrees: its minimum |heading| during the turn is 170)", near(Q.attitude(turn.s).heading, Math.PI / 2, 0.2 * D2R) && Math.abs(turn.s.w[2]) < 1e-3 && (() => { let s = Q.createState(m, { pos: [0, 0, 50], heading: 170 * D2R }), minAbs = 1e9; for (let i = 0; i < 1200; i++) { s = Q.stepMultirotor(m, s, AP.pilot(s, { pos: [0, 0], altitude: 50, heading: -170 * D2R })).state; minAbs = Math.min(minAbs, Math.abs(Q.attitude(s).heading)); } return minAbs > 169 * D2R; })() && near(Math.abs(Q.attitude(wrap.s).heading), 170 * D2R, 0.2 * D2R), `${(Q.attitude(turn.s).heading / D2R).toFixed(3)} / ${(Q.attitude(wrap.s).heading / D2R).toFixed(2)}`);
    const yawRate = (() => { let s = Q.createState(m, { pos: [0, 0, 50] }), mx = 0; for (let i = 0; i < 600; i++) { s = Q.stepMultirotor(m, s, AP.pilot(s, { pos: [0, 0], altitude: 50, heading: Math.PI })).state; mx = Math.max(mx, Math.abs(Q.rates(s).yaw)); } return mx; })();
    ok("the yaw-rate command is capped at 1.5 rad/s: a half-turn never spins the machine faster than 1.5 rad/s by more than 10%", yawRate < 1.65 && yawRate > 1.2, `${yawRate.toFixed(3)} rad/s`);
}

sec("6. THE UPSET");
{
    const cases = [["bank 80, pitch 40, rates (3, -2, 1)", { pos: [0, 0, 60], bank: 80 * D2R, pitch: 40 * D2R, w: [3, -2, 1] }, 60], ["bank 130", { pos: [0, 0, 80], bank: 130 * D2R }, 80], ["upside down, bank 175", { pos: [0, 0, 80], bank: 175 * D2R }, 80]];
    const res = cases.map(([n, st, z]) => { const r = fly(Q.createState(m, st), { pos: [0, 0], altitude: z, heading: 0 }, 12); return { n, r, a: Q.attitude(r.s), z }; });
    ok("!! FROM 80 DEGREES OF BANK WITH RATES, FROM 130 DEGREES AND FROM UPSIDE DOWN AT 175, THE PILOT GETS THE MACHINE LEVEL AND BACK TO ITS HOVER: after twelve seconds each is level to 0.1 degree, within 10 cm of its height and 10 cm of its point, at rest, and airborne (a quadrotor with this thrust-to-weight flips back without help)", res.every((x) => x.r.o.status === "airborne" && Math.abs(x.a.bank) < 0.1 * D2R && Math.abs(x.a.pitch) < 0.1 * D2R && near(x.r.s.pos[2], x.z, 0.1) && Math.hypot(x.r.s.pos[0], x.r.s.pos[1]) < 0.1 && Math.hypot(...x.r.s.vel) < 0.02), res.map((x) => `${x.n}: z ${x.r.s.pos[2].toFixed(2)} bank ${(x.a.bank / D2R).toFixed(2)}`).join("; "));
    ok("...and it loses height doing it, by the amount pinned here (the upside-down one drops about 5 m before its thrust is the right way up): the lowest point of the 175-degree recovery is between 72 and 78 m from 80", (() => { const r = res[2].r; return r.minZ > 72 && r.minZ < 78; })(), `min z ${res[2].r.minZ.toFixed(1)}`);
}

sec("7. LANDING");
{
    const r = fly(Q.createState(m, { pos: [0, 0, 10] }), { pos: [0, 0], altitude: 0, land: true }, 20);
    let sinkAtFirst = null; { let s = Q.createState(m, { pos: [0, 0, 10] }); for (let i = 0; i < 20 * 120; i++) { const o = Q.stepMultirotor(m, s, AP.pilot(s, { pos: [0, 0], altitude: 0, land: true })); s = o.state; if (o.status !== "airborne") { sinkAtFirst = o.sink; break; } } }
    ok("!! A LANDING ENDS LANDED, SLOWLY, LEVEL AND STANDING: from 10 m the first contact is at under 1.5 m/s of sink (the profile 0.4 x height, between 0.3 and 2 m/s: 0.62 m/s measured, read at the end of the first quarter-tick the legs touch in), twenty seconds later the machine is landed on its legs (0.0684 m up), at rest, level, and not crashed", r.o.status === "landed" && sinkAtFirst !== null && sinkAtFirst < 1.5 && sinkAtFirst > 0.3 && near(r.s.pos[2], 0.07 - 1.6 * G / (4 * 2500), 1e-4) && Math.hypot(...r.s.vel) < 1e-3 && Math.abs(Q.attitude(r.s).bank) < 0.01 * D2R, `sink ${sinkAtFirst === null ? "-" : sinkAtFirst.toFixed(3)} z ${r.s.pos[2].toFixed(5)}`);
    const sh = AP.guidance(Q.createState(m, { pos: [0, 0, 0.0684] }), { pos: [0, 0], altitude: 0, land: true });
    ok("on the ground with the pilot meaning to be there, the thrust is idle (0) and the machine is levelled: the guidance says onGround and a thrust feed-forward of 0; in the air it does not", sh.onGround === true && sh.thrustFF === 0 && AP.guidance(Q.createState(m, { pos: [0, 0, 5] }), { pos: [0, 0], altitude: 0, land: true }).onGround === false && AP.pilot(Q.createState(m, { pos: [0, 0, 0.0684] }), { pos: [0, 0], altitude: 0, land: true }).thrust === 0);
    const hoverAlt = AP.guidance(Q.createState(m, { pos: [0, 0, 0.5] }), { pos: [0, 0], altitude: 0.1 });
    ok("a hover is not a landing: asked for a height of 0.1 m with no `land`, the pilot holds the floor (the legs' depth 0.07 + 0.3 = 0.37 m), not the ground", near(hoverAlt.zCmd, 0.37, 1e-12) && AP.guidance(Q.createState(m, { pos: [0, 0, 0.5] }), { pos: [0, 0], altitude: 0.1, land: true }).zCmd === 0.1);
}

sec("8. A MOTOR QUITTING");
{
    const out = (alt, v, k = 2) => ({ ...Q.createState(m, { pos: [0, 0, alt], velocity: [v, 0, 0] }), health: Array.from({ length: 4 }, (_, i) => (i === k ? 0 : 1)) });
    const gd = AP.guidance(out(50, 0), { pos: [30, 0], altitude: 60, heading: 1 }), c = AP.pilot(out(50, 0), { pos: [30, 0], altitude: 60, heading: 1 });
    ok("THE POLICY, AS THE HEADER SAYS: with a motor out the pilot asks for no translation (the point 30 m away is ignored: vCmd = 0), gives up the yaw (a yaw rate of 0 asked, a heading ignored, a yaw output of 0), and multiplies the thrust feed-forward by 4/3 (three motors, three quarters of the lift)", gd.motorOut === true && gd.working === 3 && gd.vCmd[0] === 0 && gd.vCmd[1] === 0 && gd.yawRateCmd === 0 && gd.yawRateErr === 0 && c.yaw === 0 && near(gd.thrustFF, T.thrust * 4 / 3, 1e-12) && AP.guidance(Q.createState(m, { pos: [0, 0, 50] }), { pos: [0, 0], altitude: 50 }).motorOut === false);
    ok("...and asks for a gentle descent at half the height over the ground, between 0.8 and 3 m/s (50 m: 3 m/s; 1 m: 0.8 m/s; 4 m: 1.97 m/s), and keeps the tilt it may ask for to 0.2 rad", near(AP.guidance(out(50, 0), {}).vsCmd, -3, 1e-12) && near(AP.guidance(out(1, 0), {}).vsCmd, -0.8, 1e-12) && near(AP.guidance(out(4, 0), {}).vsCmd, -0.5 * (4 - 0.07), 1e-9) && AP.guidance(out(50, 0), {}).tiltMax === 0.2);
    const starts = [[50, 0], [30, 5], [100, 0], [15, 0]].map(([alt, v]) => { const r = fly(out(alt, v), { pos: [0, 0], altitude: alt }, 30); return { alt, v, r }; });
    ok("!! AND THE MEASURED OUTCOME, PINNED: from 50 m in a hover, 30 m at 5 m/s, 100 m in a hover and 15 m in a hover with motor 2 gone the hand pilot CRASHES each time, for a hull strike (a hard landing for the 15 m one: it hit level enough for a leg to take it), at 14 to 41 m/s of speed (a quadrotor that loses a motor spins, and its attitude loops, written for four, tumble it): this is the corner the learned pilots are to be tried on, and the number a learned pilot has to beat", starts.every((x) => x.r.o.status === "crashed" && /^(hull|hard landing)$/.test(x.r.o.why) && Math.hypot(...x.r.s.vel) > 12 && Math.hypot(...x.r.s.vel) < 45), starts.map((x) => `${x.alt} m/${x.v}: ${x.r.o.status} (${x.r.o.why}) ${Math.hypot(...x.r.s.vel).toFixed(1)} m/s at ${x.r.s.t.toFixed(1)} s`).join("; "));
    const sink = (() => { let s = out(50, 0), last = 0; for (let i = 0; i < 30 * 120; i++) { const o = Q.stepMultirotor(m, s, AP.pilot(s, { pos: [0, 0], altitude: 50 })); s = o.state; if (o.status === "crashed") return { t: s.t, vz: s.vel[2] }; last = s.t; } return { t: last, vz: 0 }; })();
    ok("the crash from 50 m takes about four seconds (a free fall takes 3.2 s): the descent is not slowed by much -- the pilot does not hold the machine up", sink.t > 3 && sink.t < 6, `${sink.t.toFixed(2)} s, vz ${sink.vz.toFixed(1)}`);
}

sec("9. PURITY");
{
    const s = Q.createState(m, { pos: [3, 4, 50], velocity: [1, 2, 0.5], bank: 0.2, pitch: -0.1, heading: 0.7, w: [0.1, -0.2, 0.3] }), tg = { pos: [20, -10], altitude: 60, heading: 1.2 }, snapshot = JSON.stringify(s);
    const a = AP.decide(s, tg, [1, 0.5, 0]), b = AP.decide(s, tg, [1, 0.5, 0]);
    ok("THE PILOT IS A FUNCTION: the same state, target and wind twice give the same four numbers to the bit, and the state, the target and the options are not mutated", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(s) === snapshot && JSON.stringify(tg) === '{"pos":[20,-10],"altitude":60,"heading":1.2}' && AP.pilot(s, tg, [1, 0.5, 0]).thrust === a.controls.thrust);
    const bad = { ...s, vel: [NaN, 0, 0] }, cb = AP.pilot(bad, tg, [0, 0, 0]);
    ok("a non-finite velocity in the state gives four finite numbers (read as 0 where it enters the laws) -- the pilot never hands the model a NaN", Object.values(cb).every(Number.isFinite));
    const none = AP.pilot(s, undefined, undefined), emptyT = AP.pilot(s, {}, [0, 0, 0]);
    ok("a missing target and a missing wind are a hover where it is: the controls are finite and the thrust is near the hover's", Object.values(none).every(Number.isFinite) && JSON.stringify(none) === JSON.stringify(emptyT) && near(none.thrust, T.thrust, 0.1));
    const gd = AP.guidance(s, tg);
    ok("guidance() reports what the laws used: the attitude in the pilot's senses, the climb, the height over the legs' depth (50 - 0.07 cos(tilt) for the default ground), the working motors, the battery's charge", near(gd.agl, 50 - 0.07 * Math.min(1, Math.max(0.2, Q.attitude(s).up[2])), 1e-12) && gd.working === 4 && gd.charge === 1 && near(gd.att.heading, 0.7, 1e-9) && gd.rates.roll === 0.1 && gd.climb === 0.5);
}

sec("10. THE CONSTANTS AND THE GEOMETRY, PINNED (every row here is one the first sabotage run found nothing holding)");
{
    const lvl = (z, extra = {}) => Q.createState(m, { pos: [0, 0, z], ...extra }), ld = { pos: [0, 0], altitude: 0, land: true }, legs = T.legDrop;
    const vs = [0.3 + legs, 1 + legs, 3 + legs, 10 + legs].map((z) => AP.guidance(lvl(z), ld).vsCmd);
    ok("!! THE LANDING PROFILE IS -clamp(0.4 x height over the legs, 0.3, 2.0) m/s, WORKED OUT HERE AT FOUR HEIGHTS: 0.3 m up asks 0.3 (the floor, not 0.12), 1 m up asks 0.4, 3 m up asks 1.2, 10 m up asks 2.0 (the cap, not 4)", near(vs[0], -0.3, 1e-9) && near(vs[1], -0.4, 1e-9) && near(vs[2], -1.2, 1e-9) && near(vs[3], -2.0, 1e-9) && g0.landRate === 0.4 && g0.landMin === 0.3 && g0.landMax === 2 && g0.groundEps === 0.08, vs.map((v) => v.toFixed(3)).join(" "));
    const dead = { ...lvl(legs + 0.05), health: [1, 1, 0, 1] };
    ok("!! 'ON THE GROUND' IS A HEIGHT, A CLIMB RATE AND AN INTENT: 0.07 m over the legs while landing is on the ground and 0.09 is not (the 0.08 m of the constant), a failed machine at 0.05 m is on the ground and a healthy one that is not landing is not (the pilot has to mean to be there), and a machine that is still falling at 1.5 m/s is not on it however low (0.5 m/s is)",
        AP.guidance(lvl(legs + 0.07), ld).onGround === true && AP.guidance(lvl(legs + 0.09), ld).onGround === false && AP.guidance(dead, {}).onGround === true && AP.guidance(lvl(legs + 0.05), { altitude: 0 }).onGround === false
        && AP.guidance(lvl(legs + 0.05, { velocity: [0, 0, -1.5] }), ld).onGround === false && AP.guidance(lvl(legs + 0.05, { velocity: [0, 0, -0.5] }), ld).onGround === true);
    // the geometry from the quaternion, independently: the nose's horizontal direction is the body x axis rotated by q; right of it is that turned a quarter-turn clockwise seen from above
    const fwdOf = (st) => { const [w, x, y, z] = st.q, fx = 1 - 2 * (y * y + z * z), fy = 2 * (x * y + w * z), n = Math.hypot(fx, fy); return [fx / n, fy / n]; };
    const geo = [0.7, -2.2, 1.9].map((hd) => { const st = lvl(50, { heading: hd, pitch: 0.05, bank: -0.04 }), f = fwdOf(st), r = [f[1], -f[0]], gd = AP.guidance(st, { pos: [10, -6], altitude: 50 }), ex = 10 - st.pos[0], ey = -6 - st.pos[1]; return { f, r, gd, wantF: ex * f[0] + ey * f[1], wantR: ex * r[0] + ey * r[1] }; });
    ok("!! WHERE THE POINT IS, IN THE NOSE'S FRAME, IS THE QUATERNION'S GEOMETRY AND NOT THE HEADING'S FORMULA: at headings 0.7, -2.2 and 1.9 rad (a little pitch and bank in) the distance to a point (10, -6) along the nose and to its right are, to 1e-9, the dot products with the body x axis rotated by q and with that turned a quarter-turn clockwise -- ahead and to the right are positive", geo.every((x) => near(x.gd.ePosF, x.wantF, 1e-9) && near(x.gd.ePosR, x.wantR, 1e-9)) && geo.some((x) => Math.abs(x.wantF) > 3) && geo.some((x) => Math.abs(x.wantR) > 3), geo.map((x) => `${x.gd.ePosF.toFixed(3)}/${x.wantF.toFixed(3)}`).join(" "));
    const bk = (deg) => AP.guidance(lvl(50, { bank: deg * D2R }), { altitude: 50 }), kind = [bk(0), bk(30), bk(70), bk(85)];
    ok("!! THE THRUST THAT HOLDS THE LIFT UNDER TILT IS THE HOVER'S OVER cos(tilt), TO A CAP: level it is the hover's (0.41686), banked 30 degrees it is the hover's / cos 30 = 1.1547 of it, banked 70 degrees (1 / cos = 2.92) the cap of 2.5 times it binds, and at 85 degrees (the cosine floored at 0.2) the same 2.5; the height over the legs follows the floored cosine: 50 - 0.07 x max(0.2, cos tilt) at 85 degrees",
        near(kind[0].thrustFF, T.thrust, 1e-12) && near(kind[1].thrustFF, T.thrust / Math.cos(30 * D2R), 1e-9) && near(kind[2].thrustFF, T.thrust * 2.5, 1e-9) && near(kind[3].thrustFF, T.thrust * 2.5, 1e-9) && near(kind[3].agl, 50 - legs * 0.2, 1e-9) && near(kind[1].agl, 50 - legs * Math.cos(30 * D2R), 1e-9), kind.map((k) => (k.thrustFF / T.thrust).toFixed(4)).join(" "));
    const hl = (h) => AP.guidance({ ...lvl(50), health: h }, {}), cornerOk = [0, 1, 2, 3].every((k) => { const h = [1, 1, 1, 1]; h[k] = 0; const g = hl(h), pos = m.spec.motors[k].pos; return g.failedFB === Math.sign(pos[0]) && g.failedLR === Math.sign(pos[1]) && g.failedFB !== 0 && g.failedLR !== 0; });
    const two = hl([0, 0, 1, 1]);   // motors 0 and 1 are the two front ones (the model's spec: 0 front right, 1 front left, 2 rear left, 3 rear right)
    ok("!! A MOTOR IS OUT BELOW HALF HEALTH, AND THE PILOT KNOWS WHICH CORNER: a motor at 0.3 counts as failed (three working, motor-out), one at 0.6 does not; the failed-front and failed-left flags are the signs of the failed motor's position in the model's own spec (+1 front or left, -1 rear or right), for each of the four, and two failed motors add (two on one side give 2 and 0)", hl([1, 0.3, 1, 1]).motorOut === true && hl([1, 0.3, 1, 1]).working === 3 && hl([1, 0.6, 1, 1]).motorOut === false && hl([1, 0.6, 1, 1]).working === 4 && cornerOk && two.working === 2 && two.failedFB === 2 && two.failedLR === 0);
    const speedAt = (d, o = {}) => { const g = AP.guidance(lvl(50), { pos: [d, 0], altitude: 50 }, [0, 0, 0], o); return Math.hypot(g.vCmd[0], g.vCmd[1]); };
    ok("!! THE SPEED LAW IS min(cap, kPos x d, sqrt(2 x brake x d)), WORKED OUT HERE: 10 m away asks 6.0 (kPos x d: the braking law gives 7.07), 20 m away the 8 m/s cap, 3 m away 1.8; with a brake of 0.5 and a speed cap of 20 and a gain of 5 the braking law binds and 10 m away asks sqrt(2 x 0.5 x 10) = 3.162 (so the 2 and the root are held); a point 4 cm away asks nothing and one 6 cm away asks 0.036 (the dead band is 5 cm)",
        near(speedAt(10), 6.0, 1e-9) && near(speedAt(20), 8, 1e-9) && near(speedAt(3), 1.8, 1e-9) && near(speedAt(10, { brake: 0.5, speed: 20, kPos: 5 }), Math.sqrt(10), 1e-9) && speedAt(0.04) === 0 && near(speedAt(0.06), 0.036, 1e-9));
    const tm = [0.5, 1, 2, 3, 9].map((h) => AP.guidance(lvl(legs + h), { altitude: 50 }).tiltMax);
    ok("!! THE TILT THE PILOT MAY ASK FOR RISES WITH HEIGHT, 0.15 RAD AT A METRE TO 0.45 AT THREE: 0.5 m up 0.15 (the floor), 1 m up 0.15, 2 m up 0.30, 3 m up 0.45, 9 m up 0.45 (the cap)", near(tm[0], 0.15, 1e-12) && near(tm[1], 0.15, 1e-12) && near(tm[2], 0.30, 1e-12) && near(tm[3], 0.45, 1e-12) && near(tm[4], 0.45, 1e-12), tm.map((v) => v.toFixed(3)).join(" "));
    // the bank error is wrapped: a machine upside down at 175 degrees with the loops asking a small bank the other way must turn the SHORT way round, so the error never leaves (-pi, pi]
    let widest = 0, hit = 0;
    for (const deg of [150, 165, 175, -150, -165, -175]) for (const v of [[5, 0], [-5, 0], [0, 5], [0, -5]]) { const e = AP.guidance(lvl(50, { bank: deg * D2R }), { velocity: v, altitude: 50 }).bankErr; widest = Math.max(widest, Math.abs(e)); if (Math.abs(e) > 2.9) hit++; }
    ok("!! THE BANK ERROR IS WRAPPED, SO THAT AN UPSIDE-DOWN MACHINE TURNS THE SHORT WAY: over banks of +-150, +-165 and +-175 degrees and four velocities asked, the error never exceeds pi (the unwrapped difference reaches 3.4), and in some of them it is near pi (over 2.9: the case the wrap exists for)", widest <= Math.PI + 1e-12 && hit > 0, `widest ${widest.toFixed(4)}, ${hit} near pi`);
    const spin = { ...lvl(50, { w: [0, 0, 2] }), health: [1, 1, 0, 1] }, gs = AP.guidance(spin, { heading: 1 });
    ok("!! A FAILED MACHINE THAT IS SPINNING IS NOT ASKED TO STOP: with a motor out and a yaw rate of 2 rad/s the yaw-rate error is 0 and the yaw output is 0 (the pilot has given up the yaw; chasing it with three motors only makes the roll and pitch worse), while the same spin on a healthy machine is chased (an error of 2: the machine turns at -2 rad/s and none is asked)", gs.yawRateErr === 0 && AP.pilot(spin, { heading: 1 }).yaw === 0 && AP.guidance(lvl(50, { w: [0, 0, 2] }), { heading: 0 }).yawRateErr > 1.9 && AP.pilot(lvl(50, { w: [0, 0, 2] }), { heading: 0 }).yaw !== 0);
    ok("!! AN OPTION OVERRIDES A GAIN IN THE GUIDANCE TOO, NOT ONLY IN THE LAWS: asked for { maxTilt: 0.3 } the tilt the pilot may ask for at 10 m is 0.3 and not 0.45, and { kPos: 0.3 } halves the speed asked for a point 10 m away (3.0, not 6.0)", near(AP.guidance(lvl(10), { altitude: 10 }, [0, 0, 0], { maxTilt: 0.3 }).tiltMax, 0.3, 1e-12) && near(AP.guidance(lvl(10), { altitude: 10 }).tiltMax, 0.45, 1e-12) && near(Math.hypot(...AP.guidance(lvl(50), { pos: [10, 0], altitude: 50 }, [0, 0, 0], { kPos: 0.3 }).vCmd), 3.0, 1e-9));
    const m2 = Q.createMultirotorModel({ ...Q.QUAD, inertia: [0.015, 0.03, 0.028] }), T2 = AP.trimOf(m2);
    ok("!! EACH AXIS' AUTHORITY USES ITS OWN INERTIA (the default airframe has equal roll and pitch inertia, so nothing could tell): an airframe with the pitch inertia doubled has half the pitch authority of its roll authority, the same roll authority as the default, and the yaw authority unchanged", near(T2.alphaPitch, T2.alphaRoll / 2, 1e-9) && near(T2.alphaRoll, T.alphaRoll, 1e-9) && near(T2.alphaYaw, T.alphaYaw, 1e-9));
}

console.log(fails ? `\nautopilotDrone-selfcheck: ${fails} FAILED` : "\nautopilotDrone-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
