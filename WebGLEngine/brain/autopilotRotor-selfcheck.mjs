// WebGLEngine/brain/autopilotRotor-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/autopilotRotor-selfcheck.mjs      (~5 s)
//
// THE SIBLING GATE OF brain/autopilotRotor.mjs: the hand-written helicopter pilot (go to a point, hover, climb, land, keep off the ground, autorotate) for physics/mechanics/rotorcraftModel6dof.mjs. A pilot that "flies the helicopter somewhere" proves nothing; every row here is a number the
// laws were not tuned to, a sign proved against the geometry, a thing a student pilot is taught, or a LIMIT said out loud:
//
//   1  THE FRONT DOOR   the gains are frozen and pinned (a gain pinned only by the flights it never moved was the aeroplane gate's lesson: four of its sabotages went 0 red), the look-ahead is sorted, the trim is the model's own and memoised
//   2  AT TRIM          the controls ARE the hover trim's and the machine stays where it is for a minute (the hover is unstable: the loops are what hold it)
//   3  SIGNS            target ahead -> nose down, to the right -> right bank, above -> more collective, a heading to the right -> right pedal; the shortest way round; the same flight at any heading (the frames are right); right and left mirror
//   4  THE LAWS         one term at a time, each against its pinned gain, and the clamps
//   5  STEPS            altitude +-30 m, a 10 m/s velocity step, a waypoint 310 m away, a 120-degree turn: no overshoot beyond a bound, settled by a time, the tilt held to its limit
//   6  THE GROUND       the floor under a request, terrain following over hills, six ridges and walls at 25 m/s (the skids clear them), the wall that comes too fast (said), landing, takeoff, landing on a plateau
//   7  AUTOROTATION     the engine quitting from 400 and 200 m at four speeds, from 100 and 60 m, and the LOW-AND-SLOW starts that crash (the dead man's curve, measured and pinned); the rotor kept alive; the tail rotor taken off
//   8  WIND, DISTURBANCES AND NaN   three steady winds; thirteen starts far from a hover (bank 90 degrees, a spin, a fall) all end in a hover; NaN in the state or the target gives finite controls in range; the pilot is deterministic and does not touch its inputs
//
// SABOTAGE LOG: (filled in below once run)
"use strict";
import * as H from "../physics/mechanics/rotorcraftModel6dof.mjs";
import * as AR from "./autopilotRotor.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const D2R = Math.PI / 180, f = (x, d = 1) => x.toFixed(d);
const model = AR.defaultModel(), T = AR.trimOf(model), S = model.spec, G = AR.AUTOPILOT_ROTOR;
const start = (o = {}) => H.createState(model, { pos: [0, 0, 100], pitch: T.pitchAttitude, bank: T.bank, flap: [-T.pitch * S.rotor.flapMax, T.roll * S.rotor.flapMax], ...o });
/** Fly `secs` seconds under the pilot; `target` may be a function of (t, state). Returns the final state/step and a log (every 3rd tick) of { t, pos, vel, att, rates, c, omega, status }; stops at a crash. */
function fly(state, target, secs, opts = {}, wind = [0, 0, 0]) {
    let s = state, o = { status: "airborne" }; const log = [];
    for (let i = 0; i < Math.round(secs * 60); i++) {
        const tg = typeof target === "function" ? target(i / 60, s) : target, c = AR.pilot(s, tg, wind, opts);
        o = H.stepRotor(model, s, c, H.DT, wind); s = o.state;
        if (i % 3 === 0) log.push({ t: (i + 1) / 60, pos: s.pos, vel: s.vel, att: H.attitude(s), rates: H.rates(s), c, omega: s.omega, status: o.status });
        if (o.status === "crashed" || o.status === "lost") break;
    }
    return { s, o, log };
}
const maxOf = (log, fn) => log.reduce((m, e) => Math.max(m, fn(e)), -Infinity), minOf = (log, fn) => log.reduce((m, e) => Math.min(m, fn(e)), Infinity);
const horiz = (v) => Math.hypot(v[0], v[1]);

console.log("autopilotRotor-selfcheck -- the helicopter's hand pilot\n");

console.log("1. THE FRONT DOOR");
{
    const keys = "AUTOPILOT_ROTOR,LOOKAHEAD,TARGET_DEFAULT,decide,defaultModel,guidance,lawsFrom,pilot,reportLines,trimOf,wrapAngle".split(",").sort().join();
    ok("!! the export list is pinned: AUTOPILOT_ROTOR, LOOKAHEAD, TARGET_DEFAULT, decide, defaultModel, guidance, lawsFrom, pilot, reportLines, trimOf, wrapAngle", Object.keys(AR).sort().join() === keys, Object.keys(AR).sort().join());
    const want = { kTheta: 4.0, kQ: 1.9, kPhi: 2.6, kP: 0.9, kVel: 0.045, maxTilt: 0.30, tiltLow: 0.10, kPos: 0.25, speed: 25, brake: 1.5, kAlt: 0.4, vsUp: 5, vsDown: 4, kVs: 0.12, kHdg: 1.2, rMax: 0.8, kYaw: 1.4, kCouple: 1,
        tiltAutoLow: 0, tiltAutoSlope: 0.02, cAuto: 0.18, cAutoMin: 0.1, cAutoMax: 0.6, landSpeed: 12, flareHeight: 60, flareLow: 8, cushionHeight: 25, kCush: 0.5, cushMin: 0.5, cushMax: 8, cushGain: 3,
        clearance: 5, brakeSafe: 1.2, margin: 12, lag: 1.0, buffer: 4, slack: 2, idle: 0.15, kOmega: 0.1, glide: 28 };
    ok("!! THE GAINS ARE FROZEN AND PINNED (all 40 of them, by name and value: a gain the flights below never move would otherwise be free to change)", Object.isFrozen(G) && Object.keys(want).length === 40 && JSON.stringify(Object.keys(G).sort()) === JSON.stringify(Object.keys(want).sort()) && Object.keys(want).every((k) => G[k] === want[k]));
    const dec = AR.decide(start(), { altitude: 100 });
    ok("!! decide() RETURNS THE CONTROLS AND THE GUIDANCE THEY CAME FROM (a learned pilot and the report read the guidance): { controls: { collective, pitch, roll, yaw }, guidance } with the guidance's attitude, rates and errors present", dec.controls && dec.guidance && Object.keys(dec.controls).join() === "collective,pitch,roll,yaw" && ["att", "rates", "pitchErr", "bankErr", "climbErr", "yawRateCmd", "collectiveFF", "agl", "engineOut"].every((k) => k in dec.guidance));
    const lines = (() => { try { return AR.reportLines(); } catch (e) { return [String(e.message)]; } })();
    ok("!! the report lines name the trim, the look-ahead and the autorotation, and fly a request through the pilot", lines.length === 3 && lines.join("\n").includes("collective 0.736") && lines.join("\n").includes("9 look-ahead samples out to 360 m") && lines.join("\n").includes("tilt asked -17.2 deg"));
    ok("!! the look-ahead distances are frozen, ascending and reach 360 m (the braking distance from 25 m/s at 1.2 m/s^2 is 260)", Object.isFrozen(AR.LOOKAHEAD) && AR.LOOKAHEAD.every((d, i, a) => i === 0 || d > a[i - 1]) && AR.LOOKAHEAD[0] === 8 && AR.LOOKAHEAD[AR.LOOKAHEAD.length - 1] === 360 && 25 * 25 / (2 * G.brakeSafe) < 360);
    const hub = H.createRotorModel({ ...H.ATTACK, rotor: { ...S.rotor, hub: [0.1, 0, 1.6] } }), T2 = AR.trimOf(hub);
    ok("!! THE TRIM IS THE MODEL'S OWN, MEMOISED PER MODEL: the hover collective 0.7356, longitudinal cyclic 0, lateral cyclic -0.194 (the disc leans against the tail rotor's push), bank -3.05 degrees, pitch 0; the thrust per unit collective 103.9 kN; the skids 1.5 m below the centre of mass; the tail rotor goes to zero thrust at pedal +0.2078; a unit of collective needs -0.485 of pedal (more torque, a harder push on the tail: a LEFT pedal); a different airframe gets its own",
        AR.trimOf(model) === T && AR.defaultModel() === model && Object.isFrozen(T) && near(T.collective, 0.7356, 5e-4) && Math.abs(T.pitch) < 1e-6 && near(T.roll, -0.1937, 2e-3) && near(T.bank / D2R, -3.05, 0.05) && Math.abs(T.pitchAttitude) < 1e-6 && near(T.dTdc, 103879, 200) && T.skidDrop === 1.5 && near(T.tailOff, -model.tailPitchRig / S.tail.pitchRange, 1e-12) && near(T.tailOff, 0.2078, 5e-4) && near(T.pedalPerCollective, -0.4854, 2e-3) && T.pedalPerCollective < 0
        && T2 !== T && Math.abs(T2.pitch) > 0.1, `collective ${T.collective.toFixed(4)}, cyclic ${T.pitch.toFixed(3)} / ${T.roll.toFixed(4)}, tail-off pedal ${T.tailOff.toFixed(4)}`);
}

console.log("\n2. AT TRIM");
{
    const c = AR.pilot(start(), { altitude: 100 });
    ok("!! AT TRIM THE CONTROLS ARE THE TRIM'S (collective, both cyclics and the pedal each within 1e-3 of hoverTrim's), whatever the hover is asked to be", near(c.collective, T.collective, 1e-3) && near(c.pitch, T.pitch, 1e-3) && near(c.roll, T.roll, 1e-3) && near(c.yaw, T.yaw, 1e-3) && JSON.stringify(c) === JSON.stringify(AR.pilot(start(), {})), `${f(c.collective, 4)} ${f(c.pitch, 4)} ${f(c.roll, 4)} ${f(c.yaw, 4)}`);
    const r = fly(start(), { altitude: 100 }, 60);
    ok("!! THE HOVER IS UNSTABLE AND THE LOOPS HOLD IT: a minute from trim the machine is within 5 cm of where it was in x and y, 5 cm of its height, under 1 cm/s, banked the trim's -3 degrees and level in pitch", r.o.status === "airborne" && horiz(r.s.pos) < 0.05 && near(r.s.pos[2], 100, 0.05) && Math.hypot(...r.s.vel) < 0.01 && near(H.attitude(r.s).bank / D2R, -3.05, 0.1) && Math.abs(H.attitude(r.s).pitch) < 0.2 * D2R, `x,y ${f(horiz(r.s.pos), 4)} z ${f(r.s.pos[2], 3)}`);
}

console.log("\n3. SIGNS");
{
    const g0 = AR.guidance(start(), { altitude: 100 }), gAhead = AR.guidance(start(), { pos: [50, 0], altitude: 100 }), gRight = AR.guidance(start(), { pos: [0, -50], altitude: 100 }), gLeft = AR.guidance(start(), { pos: [0, 50], altitude: 100 });
    const lAhead = AR.lawsFrom(gAhead), lRight = AR.lawsFrom(gRight), lLeft = AR.lawsFrom(gLeft), l0 = AR.lawsFrom(g0);
    ok("!! A TARGET AHEAD ASKS FOR NOSE DOWN (a negative pitch attitude, stick forward: a pitch below trim), one to the RIGHT of the nose for a right bank and a roll above trim (right stick), one to the LEFT for the mirror of it, to the bit",
        gAhead.pitchErr < -0.05 && lAhead.pitch < l0.pitch - 0.1 && gRight.bankErr > 0.05 && lRight.roll > l0.roll + 0.1 && gLeft.bankErr < -0.05 && lLeft.roll < l0.roll - 0.1 && near(gRight.bankErr, -gLeft.bankErr, 1e-12) && near(lRight.roll - l0.roll, l0.roll - lLeft.roll, 1e-12) && near(lAhead.roll, l0.roll, 1e-9),
        `pitchErr ${f(gAhead.pitchErr, 3)}, bankErr ${f(gRight.bankErr, 3)} / ${f(gLeft.bankErr, 3)}`);
    const gUp = AR.guidance(start(), { altitude: 130 }), gDown = AR.guidance(start(), { altitude: 70 });
    ok("!! A TARGET ABOVE ASKS FOR MORE COLLECTIVE THAN THE HOVER'S and one below for less; the climb rate asked for is the error over 2.5 s, held to +5 up and -4 down", AR.lawsFrom(gUp).collective > l0.collective + 0.1 && AR.lawsFrom(gDown).collective < l0.collective - 0.1 && near(AR.guidance(start(), { altitude: 102 }).vsCmd, 0.8, 1e-9) && gUp.vsCmd === 5 && gDown.vsCmd === -4, `${f(AR.lawsFrom(gUp).collective, 3)} / ${f(AR.lawsFrom(gDown).collective, 3)}`);
    const gR = AR.guidance(start(), { altitude: 100, heading: 0.5 }), gL = AR.guidance(start(), { altitude: 100, heading: -0.5 }), gWrap = AR.guidance(start({ heading: 3.0 }), { altitude: 100, heading: -3.0 });
    ok("!! A HEADING TO THE RIGHT (a right turn INCREASES the heading) ASKS FOR A RIGHT YAW RATE AND THE RIGHT PEDAL (a positive pedal above trim); to the left the opposite; the yaw rate asked for is 1.2 x the error held to +-0.8 rad/s; and the SHORTEST way round: from heading 3.0 to -3.0 is +0.283, through the back",
        gR.yawRateCmd > 0 && AR.lawsFrom(gR).yaw > l0.yaw && gL.yawRateCmd < 0 && AR.lawsFrom(gL).yaw < l0.yaw && near(gR.yawRateCmd, 0.6, 1e-9) && near(AR.guidance(start(), { altitude: 100, heading: 2 }).yawRateCmd, 0.8, 1e-9) && near(gWrap.headingErr, 2 * Math.PI - 6, 1e-9) && gWrap.yawRateCmd > 0);
    // the same flight at any heading: rotate the aircraft, its velocity and the target by the heading and every command is the same
    const rotate = (v, h) => [v[0] * Math.cos(h) + v[1] * Math.sin(h), -v[0] * Math.sin(h) + v[1] * Math.cos(h)];
    const base = AR.guidance(start({ velocity: [3, -2, 0] }), { pos: [60, -25], altitude: 105 });
    const frames = [0.6, 1.9, -2.4, 3.1].map((h) => { const v = rotate([3, -2], h), p = rotate([60, -25], h); const gd = AR.guidance(start({ heading: h, velocity: [v[0], v[1], 0] }), { pos: p, altitude: 105 }); return Math.max(Math.abs(gd.pitchErr - base.pitchErr), Math.abs(gd.bankErr - base.bankErr), Math.abs(gd.climbErr - base.climbErr), Math.abs(gd.vMag - base.vMag)); });
    ok("!! THE SAME FLIGHT AT ANY HEADING IS THE SAME FLIGHT: the aircraft, its velocity and the target turned together by four different headings give the same pitch error, bank error, climb error and speed asked for, to 1e-9 (the forward and rightward axes are the nose's, not the world's)", frames.every((e) => e < 1e-9), frames.map((e) => e.toExponential(1)).join(" "));
    const gv = AR.guidance(start(), { velocity: [3, -4], altitude: 100 }), gl = AR.guidance(start(), { velocity: [0, 10], altitude: 100 }), gr = AR.guidance(start(), { velocity: [0, -10], altitude: 100 }), gs = AR.guidance(start(), { velocity: [0, 5], altitude: 100 });
    const left = fly(start(), { velocity: [0, 6], altitude: 100 }, 15);
    ok("!! A VELOCITY ASKED FOR IS THE WORLD'S, UNCHANGED, AND THE NOSE FOLLOWS THE WAY IT GOES: (3, -4) is asked as (3, -4) and 5 m/s; with no heading asked and more than 6 m/s the heading error is -pi/2 to a velocity due left (world +Y), +pi/2 due right, and 0 under 6 m/s (it is held); flown at 6 m/s to the left the machine goes left (over 5.5 m/s, none to the right) with a bank to the left",
        gv.vCmd[0] === 3 && gv.vCmd[1] === -4 && near(gv.vMag, 5, 1e-12) && near(gl.headingErr, -Math.PI / 2, 1e-9) && near(gr.headingErr, Math.PI / 2, 1e-9) && gs.headingErr === 0 && left.s.vel[1] > 5.5 && left.s.vel[0] < 0.5 && minOf(left.log, (e) => e.att.bank) < T.bank - 3 * D2R, `vy ${f(left.s.vel[1], 2)} m/s`);
}

console.log("\n3b. ATTITUDE EXTREMES");
{
    const gInv = AR.guidance(start({ bank: 3.12 }), { altitude: 100 }), g30 = AR.guidance(start({ bank: 30 * D2R }), { altitude: 100 }), gUpside = AR.guidance(start({ bank: 100 * D2R, pos: [0, 0, 20] }), { altitude: 20 });
    ok("!! THE BANK ERROR IS THE SHORT WAY ROUND: at a bank of 3.12 rad (nearly inverted, right side down) the error to the trim's -0.05 is +3.11 (through the back), not -3.17 -- the pilot rolls the way that is shorter", near(gInv.bankErr, 2 * Math.PI - 3.12 - 0.0531526, 1e-3) && gInv.bankErr > 0 && Math.abs(gInv.bankErr) <= Math.PI, `${f(gInv.bankErr, 3)}`);
    const want30 = T.collective + (model.weight / T.dTdc) * (1 / g30.att.up[2] - 1);
    ok("!! A TILTED DISC NEEDS MORE COLLECTIVE TO HOLD THE SAME LIFT: at a bank of 30 degrees the feedforward is the hover collective + (weight / the thrust per unit collective) x (1 / cos(tilt) - 1) = 0.8013, to 1e-9, and never the hover's", near(g30.collectiveFF, want30, 1e-9) && g30.collectiveFF > T.collective + 0.05 && near(g30.collectiveFF, 0.8013, 5e-4), `${f(g30.collectiveFF, 4)}`);
    ok("!! THE HEIGHT OVER THE GROUND IS NEVER MORE THAN THE CENTRE OF MASS'S: at a bank of 100 degrees (past the vertical) 20 m up the skids are taken no more than 0.3 m below it -- 19.7, never 20.26 (the skids' depth is clamped to a cosine of at least 0.2 so an upside-down machine is not credited with height it does not have)", near(gUpside.agl, 20 - T.skidDrop * 0.2, 1e-9) && gUpside.agl < 20);
    const inv = [150, 170, 179].map((b) => { const r = fly(start({ pos: [0, 0, 300], bank: b * D2R }), { altitude: 300, pos: [0, 0] }, 40); return { b, st: r.o.status, lost: 300 - minOf(r.log, (e) => e.pos[2]), dz: Math.abs(r.s.pos[2] - 300), off: horiz(r.s.pos), bank: H.attitude(r.s).bank }; });
    ok("!! AN INVERTED MACHINE ROLLS OUT: started at 150, 170 and 179 degrees of bank at 300 m, each is upright in a hover within 40 s having lost under 80 m (65 measured at 170), not crashed, within 0.5 m of the point and the height", inv.every((r) => r.st === "airborne" && r.lost < 80 && r.dz < 0.5 && r.off < 1 && near(r.bank, T.bank, 0.02)), inv.map((r) => `${r.b}: lost ${f(r.lost)} m`).join("  "));
}

console.log("\n4. THE LAWS, ONE TERM AT A TIME");
{
    const zero = { rates: { roll: 0, pitch: 0, yaw: 0 }, pitchTrim: 0, rollTrim: 0, pedalFF: 0, pitchErr: 0, bankErr: 0, climbErr: 0, yawRateCmd: 0, collectiveFF: 0.5 }, L = (o) => AR.lawsFrom({ ...zero, ...o });
    const base = L({});
    ok("!! EACH TERM OF EACH LAW AGAINST ITS GAIN, ALONE: pitch = trim + 4.0 (pitch error) - 1.9 (pitch rate); roll = trim + 2.6 (bank error) - 0.9 (roll rate); pedal = feedforward + 1.4 (yaw rate asked - yaw rate); collective = feedforward + 0.12 (climb error)",
        near(L({ pitchTrim: 0.05 }).pitch, 0.05, 1e-12) && near(L({ pitchErr: 0.1 }).pitch, 0.4, 1e-12) && near(L({ rates: { roll: 0, pitch: 0.2, yaw: 0 } }).pitch, -0.38, 1e-12)
        && near(L({ rollTrim: -0.1 }).roll, -0.1, 1e-12) && near(L({ bankErr: 0.05 }).roll, 0.13, 1e-12) && near(L({ rates: { roll: 0.1, pitch: 0, yaw: 0 } }).roll, -0.09, 1e-12)
        && near(L({ pedalFF: 0.02 }).yaw, 0.02, 1e-12) && near(L({ yawRateCmd: 0.2 }).yaw, 0.28, 1e-12) && near(L({ rates: { roll: 0, pitch: 0, yaw: 0.3 } }).yaw, -0.42, 1e-12)
        && near(base.collective, 0.5, 1e-12) && near(L({ climbErr: 1 }).collective, 0.62, 1e-12) && near(L({ collectiveFF: 0.6 }).collective, 0.6, 1e-12));
    ok("!! THE CLAMPS: cyclics and pedal to -1..1, the collective to 0..1, and a non-finite feature is read as 0 (NaN in is a neutral control out, never NaN)", L({ pitchErr: 9 }).pitch === 1 && L({ pitchErr: -9 }).pitch === -1 && L({ bankErr: 9 }).roll === 1 && L({ yawRateCmd: -9 }).yaw === -1 && L({ climbErr: 99 }).collective === 1 && L({ climbErr: -99 }).collective === 0 && L({ pitchErr: NaN }).pitch === 0 && L({ collectiveFF: NaN }).collective === 0);
    const ctl = AR.lawsFrom(AR.guidance(start({ velocity: [8, 0, 0] }), { velocity: [20, 0], altitude: 100 }), { kTheta: 0 });
    ok("!! A GAIN PASSED IN `opts` IS USED (kTheta: 0 takes the pitch loop's error term out): the same state and target give the trim's pitch cyclic less the rate damping only", near(ctl.pitch, T.pitch - G.kQ * 0, 1e-9) && Math.abs(AR.pilot(start({ velocity: [8, 0, 0] }), { velocity: [20, 0], altitude: 100 }).pitch) > 0.1);
}

console.log("\n5. STEPS FROM TRIM");
{
    const up = fly(start(), { altitude: 130 }, 40), dn = fly(start(), { altitude: 70 }, 40);
    const upOver = maxOf(up.log, (e) => e.pos[2]) - 130, dnOver = 70 - minOf(dn.log, (e) => e.pos[2]);
    ok("!! ALTITUDE: +30 m and -30 m from trim reach the new height to under 0.3 m within 30 s without overshooting by more than 0.5 m, the climb rate never above 5.5 (up) or the sink 4.5 (down), the nose steady within 2 degrees (the pedal goes with the collective) and the position within 3 m",
        near(up.s.pos[2], 130, 0.3) && near(dn.s.pos[2], 70, 0.3) && upOver < 0.5 && dnOver < 0.5 && maxOf(up.log, (e) => e.vel[2]) < 5.5 && -minOf(dn.log, (e) => e.vel[2]) < 4.5 && maxOf(up.log, (e) => Math.abs(e.att.heading)) < 2 * D2R && maxOf(dn.log, (e) => Math.abs(e.att.heading)) < 2 * D2R && maxOf(up.log, (e) => horiz(e.pos)) < 3 && maxOf(dn.log, (e) => horiz(e.pos)) < 3,
        `overshoot ${f(upOver, 2)} / ${f(dnOver, 2)} m, peak climb ${f(maxOf(up.log, (e) => e.vel[2]))}, peak sink ${f(-minOf(dn.log, (e) => e.vel[2]))}`);
    const vs = fly(start(), { velocity: [10, 0], altitude: 100 }, 30);
    ok("!! VELOCITY: a 10 m/s step is within 5% by 10 s and stays there (the velocity law is a proportional one: it settles 0.4 m/s short, by the drag and the trim, and the gate says so), never over 10.2, the height held within 2 m, the attitude never more than 0.05 rad past the tilt limit it asks for (the loops overshoot a step in attitude)",
        near(vs.log.find((e) => e.t >= 10).vel[0], 10, 0.5) && near(vs.s.vel[0], 9.6, 0.15) && maxOf(vs.log, (e) => e.vel[0]) < 10.2 && maxOf(vs.log, (e) => Math.abs(e.pos[2] - 100)) < 2 && maxOf(vs.log, (e) => Math.abs(e.att.pitch)) < G.maxTilt + 0.05, `${f(vs.s.vel[0], 2)} m/s, peak pitch ${f(maxOf(vs.log, (e) => Math.abs(e.att.pitch)) / D2R)} deg`);
    const wp = fly(start(), { pos: [300, 80], altitude: 100 }, 60);
    const past = (e) => (e.pos[0] * 300 + e.pos[1] * 80) / Math.hypot(300, 80) - Math.hypot(300, 80);
    ok("!! A WAYPOINT 310 M AWAY: the machine arrives and stops AT it (within 0.5 m and under 5 cm/s at 60 s), never faster than the 25 m/s cap + 1, passes the point by no more than 6 m, holds its height within 6 m on the way, and is at rest by 40 s",
        horiz([wp.s.pos[0] - 300, wp.s.pos[1] - 80]) < 0.5 && Math.hypot(...wp.s.vel) < 0.05 && maxOf(wp.log, (e) => horiz(e.vel)) < 26 && maxOf(wp.log, past) < 6 && maxOf(wp.log, (e) => Math.abs(e.pos[2] - 100)) < 6 && Math.hypot(...wp.log.find((e) => e.t >= 40).vel) < 0.3,
        `at ${f(wp.s.pos[0], 2)}, ${f(wp.s.pos[1], 2)}; top speed ${f(maxOf(wp.log, (e) => horiz(e.vel)))}; past by ${f(maxOf(wp.log, past))}`);
    const slow = fly(start(), { pos: [200, 0], altitude: 100, speed: 10 }, 40);
    ok("!! THE SPEED CAP IS THE TARGET'S: with `speed: 10` the machine never passes 10.5 m/s on its way to a point 200 m off, and with none the cap is 25", maxOf(slow.log, (e) => horiz(e.vel)) < 10.5 && maxOf(slow.log, (e) => horiz(e.vel)) > 9 && near(AR.guidance(start(), { pos: [2000, 0], altitude: 100 }).vMag, 25, 1e-9) && near(AR.guidance(start(), { pos: [2000, 0], altitude: 100, speed: 7 }).vMag, 7, 1e-9));
    const d = (r) => AR.guidance(start(), { pos: [r, 0], altitude: 100 }).vMag;
    ok("!! THE APPROACH LAW: the speed asked for at distance d is min(cap, 0.25 d, sqrt(2 x 1.5 d)): 0.5 at 2 m, 25 at 400 m, and 17.32 at 100 m where the braking term is the one that binds; none under 0.3 m", near(d(2), 0.5, 1e-9) && near(d(400), 25, 1e-9) && near(d(100), Math.sqrt(300), 1e-9) && d(0.2) === 0, `${d(2)} ${d(100).toFixed(3)} ${d(400)}`);
    const turn = fly(start(), { altitude: 100, heading: -2.0 }, 25);
    const hOver = maxOf(turn.log, (e) => -(e.att.heading) - 2.0);
    ok("!! HEADING: a 115-degree left turn (-2.0 rad) ends within 1 degree of it by 12 s, never past it by more than 3 degrees, holding the height within 1 m and the position within 3 m, the bank no more than 10 degrees from the trim's", near(turn.log.find((e) => e.t >= 12).att.heading, -2.0, 1 * D2R) && near(turn.s.pos[2], 100, 0.2) && hOver < 3 * D2R && maxOf(turn.log, (e) => Math.abs(e.pos[2] - 100)) < 1 && maxOf(turn.log, (e) => horiz(e.pos)) < 3 && maxOf(turn.log, (e) => Math.abs(e.att.bank - T.bank)) < 10 * D2R, `overshoot ${f(hOver / D2R, 2)} deg`);
    const hard = AR.guidance(start({ pos: [0, 0, 100] }), { velocity: [200, 0], altitude: 100 }), low = AR.guidance(start({ pos: [0, 0, 4.5] }), { velocity: [200, 0], altitude: 4.5 });
    ok("!! THE TILT LIMIT: asked for 200 m/s the attitude asked for is 0.30 rad nose down at height and 0.10 near the ground (a rotor 3 m off the dirt must not be tilted into it), and it is sloped in between; the tilt limit is a limit of the attitude ASKED FOR", near(hard.tiltMax, 0.30, 1e-9) && near(low.tiltMax, 0.10, 1e-3) && near(AR.guidance(start({ pos: [0, 0, 14.5] }), { altitude: 14.5 }).tiltMax, 0.10 + 0.20 * (14.5 - 1.5 - 3) / 17, 1e-3) && near(hard.pitchErr, -0.30, 1e-9));
    const hot = fly(start(), { velocity: [25, 0], altitude: 100 }, 20);
    ok("!! THE FASTEST CRUISE: 25 m/s is reached (above 23.5), the nose never more than 0.36 rad down, the height held within 6 m, the rotor speed within 2% of the design", maxOf(hot.log, (e) => e.vel[0]) > 23.5 && maxOf(hot.log, (e) => Math.abs(e.att.pitch)) < 0.36 && maxOf(hot.log, (e) => Math.abs(e.pos[2] - 100)) < 6 && minOf(hot.log, (e) => e.omega) > 0.98 * S.rotor.omega0, `${f(maxOf(hot.log, (e) => e.vel[0]))} m/s`);
}

console.log("\n6. THE GROUND");
{
    const ridge = (h, w, x0) => (x) => h * Math.exp(-(((x - x0) / w) ** 2)), wall = (h, x0) => (x) => (x >= x0 ? h : 0);
    const floorRun = fly(start({ pos: [0, 0, 30] }), { altitude: 2 }, 30);
    ok("!! THE FLOOR UNDER A REQUEST: asked to hover at 2 m (below the 5 m clearance the skids must keep) the machine settles with its skids 5 m up, the centre of mass at 6.5 m", near(floorRun.s.pos[2], 6.5, 0.3) && minOf(floorRun.log, (e) => e.pos[2]) > 6.0 && floorRun.o.status === "airborne", `z ${f(floorRun.s.pos[2], 3)}`);
    const aglRun = fly(start({ pos: [0, 0, 30] }), { agl: 12 }, 30);
    ok("!! `agl` IS THE SKIDS' HEIGHT OVER THE GROUND THE PILOT IS GIVEN: agl 12 over flat ground settles at 13.5; over a plateau 40 m high at 53.5", near(aglRun.s.pos[2], 13.5, 0.4) && near(fly(start({ pos: [0, 0, 60] }), { agl: 12 }, 30, { terrain: () => 40 }).s.pos[2], 53.5, 0.4), `z ${f(aglRun.s.pos[2], 3)}`);
    const gPlateau = AR.guidance(start({ pos: [0, 0, 60] }), { altitude: 2 }, [0, 0, 0], { terrain: () => 40 }), gHold = AR.guidance(start({ pos: [0, 0, 150] }), {}), holdRun = fly(start({ pos: [0, 0, 150] }), { pos: [40, 0] }, 25);
    ok("!! THE FLOOR IS OVER THE GROUND UNDER THE MACHINE, NOT OVER ZERO: asked for 2 m over a plateau 40 m high, the height asked for is 40 + 1.5 + 5 = 46.5; and with no height asked at all the machine HOLDS the one it has (150 m: no climb command, and 25 s later within 2 m of it: the 40 m move lifts it 1.2)", near(gPlateau.zCmd, 46.5, 1e-6) && gHold.zCmd === 150 && gHold.vsCmd === 0 && Math.abs(holdRun.s.pos[2] - 150) < 2 && near(holdRun.s.pos[0], 40, 0.5), `${f(gPlateau.zCmd, 2)}; held ${f(holdRun.s.pos[2], 2)}`);
    const stepAt = (x0) => AR.guidance(start({ pos: [0, 0, 8], velocity: [25, 0, 0] }), { velocity: [25, 0], altitude: 8 }, [0, 0, 0], { terrain: (x) => (x >= x0 ? 6 : 0) });
    const near60 = stepAt(60), far110 = stepAt(110);
    ok("!! A SMALL STEP IS CLIMBED, A LARGER ONE NEARER IS STOPPED FOR (the limit is the larger of the two ways through): a 6 m step 110 m ahead of a machine at 25 m/s sitting at the 5 m clearance does not limit its speed (the limit comes out at 29, above the 25 asked: it can climb in time), the same step 60 m ahead limits it to about 15 m/s; the stop-short rule alone would give 14 for the first",
        far110.speedLimit > 25 && far110.vMag === 25 && near60.speedLimit > 12 && near60.speedLimit < 18 && near60.vMag === near60.speedLimit, `${f(far110.speedLimit, 2)} / ${f(near60.speedLimit, 2)}`);
    const flatC = AR.pilot(start(), { altitude: 100 }), nanC = AR.pilot(start(), { altitude: 100 }, [0, 0, 0], { terrain: () => NaN }), farNanC = AR.pilot(start({ velocity: [10, 0, 0] }), { velocity: [10, 0], altitude: 100 }, [0, 0, 0], { terrain: (x) => (x > 50 ? NaN : 0) }), farFlatC = AR.pilot(start({ velocity: [10, 0, 0] }), { velocity: [10, 0], altitude: 100 });
    ok("!! A TERRAIN THAT ANSWERS NaN IS READ AS FLAT, NOT FOLLOWED INTO NaN (a sensor that fails must not take the collective with it): the terrain NaN everywhere gives the controls the flat ground does (hover collective 0.736, not 0), and NaN only beyond 50 m ahead gives the flat ground's controls at 10 m/s", JSON.stringify(nanC) === JSON.stringify(flatC) && nanC.collective > 0.7 && JSON.stringify(farNanC) === JSON.stringify(farFlatC) && farNanC.collective > 0.7);
    const hills = (x) => 40 * (1 - Math.cos(2 * Math.PI * x / 800)) / 2 + 15 * Math.sin(x / 37) ** 2;
    const hr = fly(start({ pos: [0, 0, 50] }), { velocity: [25, 0], agl: 30 }, 100, { terrain: hills });
    const hClear = minOf(hr.log, (e) => e.pos[2] - 1.5 - hills(e.pos[0]));
    ok("!! TERRAIN FOLLOWING: 100 s at 25 m/s asking for 30 m over rolling hills (40 m swell plus a 15 m ripple): the skids never closer than 15 m to the ground, the speed never under 20 after the first 12 s, 2 km covered", hr.o.status === "airborne" && hClear > 15 && minOf(hr.log.filter((e) => e.t > 12), (e) => e.vel[0]) > 20 && hr.s.pos[0] > 2000, `min clearance ${f(hClear)}, min speed ${f(minOf(hr.log.filter((e) => e.t > 12), (e) => e.vel[0]))}, x ${f(hr.s.pos[0], 0)}`);
    const shapes = [["ridge 60 m", ridge(60, 40, 400)], ["ridge 120 m", ridge(120, 60, 400)], ["ridge 200 m", ridge(200, 80, 400)], ["wall 40 m", wall(40, 400)], ["wall 80 m", wall(80, 400)], ["wall 150 m", wall(150, 400)]];
    const res = shapes.map(([name, terrain]) => { const r = fly(start({ pos: [0, 0, 30] }), { velocity: [25, 0], altitude: 30 }, 90, { terrain }); return { name, st: r.o.status, clr: minOf(r.log, (e) => e.pos[2] - 1.5 - terrain(e.pos[0])), past: r.s.pos[0] > 600 }; });
    ok("!! RIDGES AND WALLS AT 25 M/S, SEEN 360 M OFF: the 60, 120 and 200 m ridges and the 40, 80 and 150 m walls (flown at 30 m, asked for 25 m/s straight on) are all crossed and left behind, the skids never closer than 3.5 m to the ground (the clearance asked is 5), none crashed",
        res.every((r) => r.st === "airborne" && r.clr > 3.5 && r.past), res.map((r) => `${r.name} ${f(r.clr, 1)}`).join(", "));
    const w150 = wall(150, 400), wr = fly(start({ pos: [0, 0, 30] }), { velocity: [25, 0], altitude: 30 }, 40, { terrain: w150 });
    const nearFace = wr.log.filter((e) => e.pos[0] > 385 && e.pos[0] < 398);
    ok("!! IT SLOWS FOR A WALL IT CANNOT CLIMB IN TIME (the speed limit is the climb the wall costs): approaching the 150 m wall the speed 2 to 15 m from the face is under 9 m/s although 25 was asked, and it is still above 20 m/s when the wall is 170 m off", nearFace.length > 0 && maxOf(nearFace, (e) => e.vel[0]) < 9 && wr.log.find((e) => e.pos[0] > 225).vel[0] > 20, `${f(maxOf(nearFace, (e) => e.vel[0]))} m/s near the face`);
    const lateAt = (off) => { const r = fly(start({ pos: [400 - off, 0, 30], velocity: [24, 0, 0] }), { velocity: [25, 0], altitude: 30 }, 25, { terrain: w150 }); return minOf(r.log, (e) => e.pos[2] - 1.5 - w150(e.pos[0])); };
    const l100 = lateAt(100), l60 = lateAt(60);
    ok("!! THE LIMIT, SAID: a 150 m wall that is 60 m off at 24 m/s is NOT avoided (the machine goes into the terrain: the model has no terrain collision, so the clearance goes negative -- by 100 m) while the same wall 100 m off is (the stop takes about 90 m: the pilot PLANS on 1.2 m/s^2 and the machine gives about 3, which is the margin the look-ahead is built on)", l60 < -50 && l100 > 20, `60 m off: ${f(l60)} m, 100 m off: ${f(l100)} m`);
    const ld = fly(start({ pos: [0, 0, 40] }), { altitude: 40, land: true }, 40);
    const firstTouch = ld.log.find((e) => e.status === "landed");
    ok("!! LANDING FROM 40 M: a descent of 0.3 x the height as a rate (never over 2 m/s, never under 0.25), first contact at under 1.2 m/s, 'landed' and not crashed, resting on its skids (1.40 m, the weight on them) with the collective at idle (0.15) after 40 s",
        ld.o.status === "landed" && firstTouch && -firstTouch.vel[2] < 1.2 && near(ld.s.pos[2], 1.40, 0.02) && near(ld.log[ld.log.length - 1].c.collective, G.idle, 1e-9) && -minOf(ld.log, (e) => e.vel[2]) < 2.1 && Math.abs(ld.s.vel[2]) < 0.01, `first contact ${firstTouch ? f(-firstTouch.vel[2], 2) : "never"} m/s, rests at ${f(ld.s.pos[2], 3)}`);
    const to = fly(start({ pos: [0, 0, 1.4], bank: 0, flap: [0, 0] }), (t) => (t < 2 ? { altitude: 1.4, land: true } : { agl: 60 }), 40);
    ok("!! TAKEOFF FROM THE GROUND: from rest on the skids, asked for 60 m of clearance after two seconds, the machine is above 55 m of height within 30 s, the climb never over 5.5 m/s, the nose within 6 degrees, and it never crashed", to.o.status === "airborne" && to.s.pos[2] > 55 && maxOf(to.log, (e) => e.vel[2]) < 5.5 && maxOf(to.log, (e) => Math.abs(e.att.heading)) < 6 * D2R && to.log.every((e) => e.status !== "crashed"), `z ${f(to.s.pos[2])}, peak climb ${f(maxOf(to.log, (e) => e.vel[2]))}`);
    const gFlat = AR.guidance(start({ pos: [0, 0, 40] }), { altitude: 40, land: true }), gPlat = AR.guidance(start({ pos: [0, 0, 40] }), { altitude: 40, land: true }, [0, 0, 0], { terrain: () => 30 }), gPlatLow = AR.guidance(start({ pos: [0, 0, 31.6] }), { altitude: 40, land: true }, [0, 0, 0], { terrain: () => 30 });
    ok("!! LANDING IS OVER THE TERRAIN IT IS GIVEN, NOT OVER ZERO (the model's own ground is flat at 0, so this is the guidance's, not a flight): at 40 m over flat ground the height over it is 38.5 m and the descent asked for 2 m/s; over a plateau at 30 m the same state is 8.5 m up and 2 m/s asked, and at 3.5 m up (z 35 over the plateau) 0.3 x 3.5 = 1.05 m/s; with the skids 0.1 m up the collective goes to idle", near(gFlat.agl, 38.5, 0.01) && near(gFlat.vsCmd, -2, 1e-9) && near(gPlat.agl, 8.5, 0.01) && near(gPlat.vsCmd, -2, 1e-9) && (() => { const g = AR.guidance(start({ pos: [0, 0, 35] }), { land: true }, [0, 0, 0], { terrain: () => 30 }); return near(g.vsCmd, -0.3 * g.agl, 1e-9) && near(g.agl, 3.5, 0.01); })() && gPlatLow.onGround && near(AR.lawsFrom(gPlatLow).collective, G.idle, 1e-9), `${f(gFlat.agl)} / ${f(gPlat.agl)}`);
}

console.log("\n7. AUTOROTATION");
{
    const out = (extra = {}) => start({ engine: "out", ...extra });
    ok("!! THE ENGINE IS OUT WHEN THE ANNUNCIATOR SAYS SO OR THE ROTOR IS BELOW 80% OF ITS SPEED: an engine marked 'out' is out; a running engine with the rotor at 25 rad/s (76%) is out; at 27 (82%) it is not", AR.guidance(out(), {}).engineOut === true && AR.guidance(start({ omega: 25 }), {}).engineOut === true && AR.guidance(start({ omega: 27 }), {}).engineOut === false && AR.guidance(start(), {}).engineOut === false);
    const gd = AR.guidance(out({ pos: [0, 0, 300], velocity: [15, 0, -8] }), { altitude: 300 }), c = AR.lawsFrom(gd);
    ok("!! THE FIRST ACT IS TO LOWER THE COLLECTIVE (0.18 plus 0.1 per rad/s of rotor speed above the design, held to 0.1..0.6), and the pedal to the one that takes the tail rotor off (+0.2078: there is no engine torque for it to cancel, plus 1.4 per rad/s of yaw rate it does not have)", near(gd.collectiveFF, 0.18, 1e-9) && c.collective < 0.25 && near(c.yaw, T.tailOff, 1e-9) && near(AR.guidance(out({ omega: 30 }), {}).collectiveFF, 0.18 - 0.3, 1e-9) === false && near(AR.guidance(out({ omega: 30 }), {}).collectiveFF, 0.1, 1e-9) && near(AR.guidance(out({ omega: 38 }), {}).collectiveFF, 0.6, 1e-9), `collective ${f(c.collective, 3)}, pedal ${f(c.yaw, 4)}`);
    const gRest = AR.guidance(out({ pos: [0, 0, 1.45] }), {});
    ok("!! AN ENGINE-OUT MACHINE AT REST ON ITS SKIDS IS ON THE GROUND: the collective goes to idle (0.15), the level attitude is asked for, and a machine still sinking at over 0.8 m/s with its skids at the ground is NOT yet 'on the ground' (the cushion is kept until the sink is gone)", gRest.onGround && near(AR.lawsFrom(gRest).collective, G.idle, 1e-9) && AR.guidance(out({ pos: [0, 0, 1.45], velocity: [0, 0, -2] }), {}).onGround === false && AR.guidance(out({ pos: [0, 0, 1.45], velocity: [0, 0, -2] }), {}).cushion === true);
    const vAt = (agl) => AR.guidance(out({ pos: [0, 0, agl + 1.5], velocity: [10, 0, -5] }), {}).vMag;
    ok("!! THE GLIDE AND THE FLARE ARE A SPEED SCHEDULE: 28 m/s asked above 60 m of height, 12 m/s at 8 m and below, linear between (20 m/s at 34 m); the attitude asked for is held to 0 near the ground and loosens 0.02 rad per metre above 2 m (0.16 at 10 m; level at the touchdown, the nose up above)", near(vAt(100), 28, 1e-9) && near(vAt(8), 12, 0.01) && near(vAt(34), 20, 0.01) && near(vAt(3), 12, 1e-9) && near(AR.guidance(out({ pos: [0, 0, 11.5] }), {}).tiltMax, 0.16, 1e-3) && AR.guidance(out({ pos: [0, 0, 3.4] }), {}).tiltMax === 0.0);
    const cases = [[400, 0], [400, 10], [400, 20], [400, 30], [200, 0], [200, 10], [200, 20], [200, 30], [100, 20], [100, 30], [60, 30]];
    const rows = cases.map(([alt, v]) => {
        let s = out({ pos: [0, 0, alt], velocity: [v, 0, 0] }), o = null, first = null, om5 = 0, t0 = 0;
        for (let i = 0; i < 60 * 150; i++) { o = H.stepRotor(model, s, AR.pilot(s, { altitude: alt }), H.DT); s = o.state; if (i === 300) om5 = s.omega; if (!first && o.status !== "airborne") { first = { status: o.status, sink: o.sink, why: o.why, speed: horiz(s.vel) }; t0 = i; } if (first && i - t0 >= 720) break; if (o.status === "crashed") break; }
        return { alt, v, first, end: o.status, om5 };
    });
    ok("!! THE ENGINE QUITTING IN CRUISE OR HOVER, FROM 400 AND 200 M AT 0, 10, 20 AND 30 M/S, FROM 100 M AT 20 AND 30 AND FROM 60 M AT 30: the first contact is 'landed' (not crashed) at under 4.5 m/s of sink (2.8 to 3.1 measured), and twelve seconds later the machine is still 'landed' -- no nose strike on the run-on",
        rows.every((r) => r.first && r.first.status === "landed" && r.first.sink < 4.5 && r.end === "landed"), rows.map((r) => `${r.alt}/${r.v}: ${r.first ? f(r.first.sink, 1) : "-"}`).join("  "));
    ok("!! AND THE ROTOR STAYS ALIVE ON THE WAY DOWN: five seconds after the failure the rotor is within 85..110% of its design speed in all eleven, and the touchdown ground speed is under 17 m/s (a run-on landing: a faster one pitches the nose into the dirt)", rows.every((r) => r.om5 > 0.85 * S.rotor.omega0 && r.om5 < 1.1 * S.rotor.omega0 && r.first.speed < 17), rows.map((r) => f(r.om5 / S.rotor.omega0 * 100, 0)).join(" ") + " % of design");
    const lowSlow = [[30, 0], [30, 10], [60, 0], [20, 10], [45, 10]].map(([alt, v]) => {
        let s = out({ pos: [0, 0, alt], velocity: [v, 0, 0] }), o = null;
        for (let i = 0; i < 60 * 60; i++) { o = H.stepRotor(model, s, AR.pilot(s, { altitude: alt }), H.DT); s = o.state; if (o.status !== "airborne") break; }
        return { alt, v, st: o.status, why: o.why, sink: o.sink };
    });
    ok("!! THE DEAD MAN'S CURVE, MEASURED AND SAID: from 30 m in a hover, 30 m at 10 m/s, 60 m in a hover, 20 m at 10 m/s and 45 m at 10 m/s no pilot of this machine lands it -- the rotor's energy cannot arrest the descent in the height there is -- and this one crashes each time with a 'hard landing' at over 4.5 m/s of sink (the low-and-slow corner of the height-velocity diagram)",
        lowSlow.every((r) => r.st === "crashed" && r.why === "hard landing" && r.sink > 4.5), lowSlow.map((r) => `${r.alt}/${r.v}: ${r.why} ${f(r.sink, 1)}`).join("  "));
    let sY = start({ pos: [0, 0, 400] }), yawMax = 0, hdg0 = 0;
    for (let i = 0; i < 60 * 20; i++) { sY = { ...sY, engine: i < 180 ? "running" : "out" }; const oY = H.stepRotor(model, sY, AR.pilot(sY, { altitude: 400 }), H.DT); sY = oY.state; if (i >= 180) yawMax = Math.max(yawMax, Math.abs(H.rates(sY).yaw)); }
    ok("!! THE TAIL ROTOR IS TAKEN OFF WITH THE ENGINE: failing the engine in the hover at 400 m the nose swings no faster than 0.1 rad/s in the next 17 s (without the pedal feedforward the same failure swings it at over 0.15 -- the yaw loop alone is not what holds it)", yawMax < 0.1 && (() => { let s = start({ pos: [0, 0, 400] }), m = 0; for (let i = 0; i < 60 * 20; i++) { s = { ...s, engine: i < 180 ? "running" : "out" }; const c = AR.pilot(s, { altitude: 400 }, [0, 0, 0], { kYaw: 0 }); s = H.stepRotor(model, s, c, H.DT).state; if (i >= 180) m = Math.max(m, Math.abs(H.rates(s).yaw)); } return m > 0.15; })(), `max yaw rate ${f(yawMax, 3)}`);
}

console.log("\n8. WIND, DISTURBANCES AND NaN");
{
    const winds = [[10, 0, 0], [0, 8, 0], [-12, 6, 0]].map((w) => { const r = fly(start(), { pos: [0, 0], altitude: 100 }, 40, {}, w); return { w, drift: horiz(r.s.pos), dz: Math.abs(r.s.pos[2] - 100), st: r.o.status }; });
    ok("!! A STEADY WIND (10 m/s from the west, 8 from the south, 13 from the east-north-east): held at a point for 40 s, the helicopter drifts under 4 m and its height is within 3 m (the loops read the ground, not the air, and have no integrator: they leave a little)", winds.every((r) => r.st === "airborne" && r.drift < 4 && r.dz < 3), winds.map((r) => `${f(r.drift, 2)} m / ${f(r.dz, 2)} m`).join("  "));
    const cases = [["bank 40", { bank: 40 * D2R }], ["bank -60", { bank: -60 * D2R }], ["pitch 30", { pitch: 30 * D2R }], ["pitch -30", { pitch: -30 * D2R }], ["bank 90", { bank: 90 * D2R }], ["spin 1 rad/s", { w: [0, 0, 1.0] }], ["roll rate 2", { w: [2, 0, 0] }], ["pitch rate 2", { w: [0, 2, 0] }], ["20 m/s with bank 30", { velocity: [20, 0, 0], bank: 30 * D2R }], ["falling 15 m/s", { velocity: [0, 0, -15] }], ["climbing 12 m/s", { velocity: [0, 0, 12] }], ["sideways 15 m/s", { velocity: [0, 15, 0] }], ["rotor at 28 rad/s", { omega: 28 }]];
    const rec = cases.map(([name, o]) => { const r = fly(start({ pos: [0, 0, 300], ...o }), { altitude: 300, pos: [0, 0] }, 40); return { name, st: r.o.status, lost: 300 - minOf(r.log, (e) => e.pos[2]), off: horiz(r.s.pos), dz: Math.abs(r.s.pos[2] - 300), v: Math.hypot(...r.s.vel) }; });
    ok("!! THIRTEEN STARTS FAR FROM A HOVER ALL END IN ONE (a bank of 90 degrees, a pitch of 30 up and down, a spin of 1 rad/s, a roll rate of 2, a pitch rate of 2, falling at 15 m/s, climbing at 12, sideways at 15, a slow rotor): in 40 s from 300 m none loses more than 30 m, none crashed, and each ends within 1 m of the point, 0.5 m of the height and under 5 cm/s",
        rec.every((r) => r.st === "airborne" && r.lost < 30 && r.off < 1 && r.dz < 0.5 && r.v < 0.05), `worst loss ${f(Math.max(...rec.map((r) => r.lost)))} m, worst offset ${f(Math.max(...rec.map((r) => r.off)), 2)} m`);
    const bad = [["pos", [NaN, 0, 100]], ["vel", [0, NaN, 0]], ["w", [0, 0, NaN]], ["omega", NaN], ["q", [NaN, 0, 0, 0]]], inRange = (c) => Object.values(c).every(Number.isFinite) && c.collective >= 0 && c.collective <= 1 && Math.abs(c.pitch) <= 1 && Math.abs(c.roll) <= 1 && Math.abs(c.yaw) <= 1;
    const hubModel = H.createRotorModel({ ...H.ATTACK, rotor: { ...S.rotor, hub: [0.1, 0, 1.6] } }), T2 = AR.trimOf(hubModel), g2 = AR.guidance(H.createState(hubModel, { pos: [0, 0, 100] }), { altitude: 100 }, [0, 0, 0], { model: hubModel });
    ok("!! THE MODEL IS AN OPTION: given another airframe (the hub 0.1 m ahead of the centre of mass) the pilot reads THAT airframe's trim -- a longitudinal cyclic of -0.24 and its own hover collective -- and not the default's (cyclic 0)", near(g2.pitchTrim, T2.pitch, 1e-12) && Math.abs(g2.pitchTrim) > 0.1 && near(g2.collectiveFF, T2.collective, 1e-9) && g2.pitchTrim !== T.pitch);
    const nanState = bad.every(([k, v]) => inRange(AR.pilot({ ...start(), [k]: v }, { altitude: 100 }))), nanTarget = [{ altitude: NaN }, { heading: NaN }, { pos: [NaN, 0] }, { velocity: [NaN, NaN] }, { agl: NaN }, { speed: NaN, pos: [50, 0] }].every((t) => inRange(AR.pilot(start(), t)));
    ok("!! NaN IN THE STATE (position, velocity, spin, rotor speed, attitude) OR IN THE TARGET (height, heading, point, velocity, agl, speed) GIVES FINITE CONTROLS IN RANGE, never NaN", nanState && nanTarget);
    let seed = 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, between = (a, b) => a + (b - a) * rnd();
    let all = true, n = 0;
    for (let i = 0; i < 500; i++) {
        const s = H.createState(model, { pos: [between(-500, 500), between(-500, 500), between(2, 400)], velocity: [between(-30, 30), between(-30, 30), between(-12, 12)], heading: between(-3, 3), pitch: between(-1, 1), bank: between(-3, 3), w: [between(-2, 2), between(-2, 2), between(-2, 2)], omega: between(10, 36), engine: rnd() < 0.2 ? "out" : "running" });
        const tg = rnd() < 0.5 ? { pos: [between(-500, 500), between(-500, 500)], altitude: between(0, 400), heading: between(-4, 4) } : { velocity: [between(-30, 30), between(-30, 30)], agl: between(0, 100), land: rnd() < 0.2 };
        const c = AR.pilot(s, tg, [between(-8, 8), between(-8, 8), 0], { terrain: (x, y) => 30 * Math.sin(x / 90) * Math.cos(y / 70) + 30 }); if (!inRange(c)) all = false; n++;
    }
    ok("!! 500 RANDOM STATES (any attitude, any spin, any speed, an engine out one time in five) AND TARGETS, WITH A TERRAIN: every control finite and in range", all && n === 500);
    const s0 = start({ velocity: [4, 1, 0] }), tg0 = { pos: [100, 20], altitude: 110, heading: 0.3 }, before = JSON.stringify([s0, tg0]);
    const c1 = AR.pilot(s0, tg0), c2 = AR.pilot(s0, tg0), d1 = AR.decide(s0, tg0);
    ok("!! THE PILOT IS DETERMINISTIC AND DOES NOT TOUCH WHAT IT IS GIVEN: the same state and target give the same bits twice, decide() returns the controls pilot() does and the guidance they came from, and neither the state nor the target is changed", JSON.stringify(c1) === JSON.stringify(c2) && JSON.stringify(d1.controls) === JSON.stringify(c1) && d1.guidance && Object.keys(d1.guidance).includes("pitchErr") && JSON.stringify([s0, tg0]) === before);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
