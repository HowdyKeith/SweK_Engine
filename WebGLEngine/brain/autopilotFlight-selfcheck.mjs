// WebGLEngine/brain/autopilotFlight-selfcheck.mjs
//
// Run: node brain/autopilotFlight-selfcheck.mjs      (~0.5 s)
//
// THE SIBLING GATE OF brain/autopilotFlight.mjs (v4867): the hand-written altitude/airspeed/heading hold for physics/mechanics/flightModel6dof.mjs's trainer. A pilot that "flies the aircraft somewhere" proves nothing; every row
// here is a number the laws were not tuned to, or a sign proved against the geometry, or a thing a student pilot is taught and an examiner checks:
//
//   1  the trim table is the flight model's trim, at 12 speeds, memoised; the laws are frozen
//   2  at trim the controls ARE the trim controls (to the interpolation, 1.2e-3) and the aircraft stays where it is for 60 s (altitude 0.08 m, speed 1.3 cm/s)
//   3  SIGNS and the shortest way round: a target to the right asks for a right bank, a target above asks for more back-stick than trim, a slow aircraft gets more throttle; +-pi wraps; and the whole pilot is
//      MIRROR-SYMMETRIC (the mirrored aircraft on the mirrored target gets the mirrored roll and yaw and the same pitch and throttle)
//   4  STEP RESPONSES from trim: +100, -100 and +40 m (no overshoot beyond 2 m, settled in 36 s, never near the stall), 90 and 170 degrees of turn each way (no overshoot beyond 1 degree, bank held to the limit,
//      sideslip under 5.5, altitude held to 4 m), and the left turn is the right turn's mirror image to 1e-6
//   5  A COORDINATED TURN, against its closed form: the heading rate in a steady bank is g tan(bank) / V (to 3%), with the sideslip under a degree -- the law the yaw channel is built on, checked against physics and not
//      against itself; and the climb's cost, against W sin(gamma): the throttle feedforward for a 4 m/s climb is the thrust the climb needs, to 15%
//   6  WINGS FIRST, THEN PULL: the upright factor is 1 to 66 degrees of bank and 0 from 85; a 170-degree bank, a 120-degree bank, a nose-high slow start, a 26-degree dive, a 30 m/s start and a start spinning at 1.5 rad/s
//      are each flown level within 14 s and none loses more than 30 m
//   7  AIR DATA ARE RELATIVE TO THE AIR: in a 10 m/s tailwind the pilot sees 35 m/s where the ground speed is 45; a steady 8 m/s crosswind and eight gusty days are flown without a crash, within 1 m/s of the airspeed
//      asked for and within 8 m of the altitude
//   8  NaN in the state or the target gives finite, in-range controls; the pilot is deterministic
//
// SABOTAGE LOG -- each applied to brain/autopilotFlight.mjs in a scratch worktree, the gate run, the worktree restored:
//   26 sabotages, every one red by name (the numbers are how many rows went red):
//   LAWS      A1 heading law sign flipped 11 | A2 heading error not wrapped (the long way round) 1 | A6 altitude sign flipped 17 | A14 speed loop sign flipped 16 | A10 sideslip term sign flipped 2 | A23 turn-rate term sign flipped 4 |
//             A26 the roll rate leaks into the rudder 1 | A12 climb throttle feedforward removed 2 | A13 ...doubled 2 | A16 the throttle trim taken at the current speed, not the target's 1 | A15 a constant stick trim (no table) 4 |
//             A24 a six-speed table 18 | A25 the table not memoised 1
//   LIMITS    A3 bank limit 0.45 -> 0.9 4 | A7 climb command unbounded 2 | A21 throttle clamp widened 1 | A8 bank compensation removed 3 | A9 turn coordination removed 8 | A4 roll-rate damping removed 3
//   ATTITUDE  A17 upright always 1 (the pilot pulls inverted) 3 | A18 upright a hard step at 90 degrees 1 | A22 the bank error not wrapped 1 | A19 airspeed read from ground speed 3 | A20 the NaN guard removed 1
//   FOUR WENT 0 RED THE FIRST TIME AND ARE WHY SECTION 3b AND ONE SHORT-WAY ROW EXIST: A5 (pitch-rate damping removed) and A11 (the sideslip gain removed) -- every flight row passed, because the airframe damps itself and a gain pinned only by
//   the flights it never moved; the gains-pin row and the one-term-at-a-time rows catch both now (A5 and A11 are red by the PIN and by name, 1 each). A22 (the bank error's wrap) -- no flight in the gate was ever inverted AND turning
//   the other way; the 3.0-rad-bank row exists because of it. A24 (a six-speed table) crashed the gate (the row read table[11]) before it went red by name; the row now reads it safely.
//   THE FIRST RUN OF THE AUTOPILOT PULLED AN AIRCRAFT STARTING 170 DEGREES BANKED INTO THE GROUND (18 m): the pitch law added 1.1 of back-stick for its bank compensation, which inverted is a pull toward the earth. `upright` is that fix,
//   and A17 is the sabotage that puts it back.
"use strict";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import { rotateByQuat } from "../physics/mechanics/rigidBody6dof.mjs";
import * as AF from "./autopilotFlight.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const D2R = Math.PI / 180, R2D = 180 / Math.PI, G = F.GRAVITY;
const model = AF.defaultModel(), T45 = F.trim(model, 45);
const TRIM_AT = (V, extra = {}) => F.createState({ speed: V, pitch: F.trim(model, V).pitchAttitude, ...extra });
const LEVEL = Object.freeze({ altitude: 300, heading: 0, airspeed: 45 });

/** Fly `seconds` of the pilot from `start` (createState options) to `target`, in `wind(t)`: the record of the pilot's senses each tick. */
function sim(start, target, seconds, wind = null, dt = 1 / 30) {
    let s = F.createState({ pos: [0, 0, 300], ...start }); const rec = []; let status = "airborne";
    for (let i = 0; i < Math.round(seconds / dt); i++) {
        const wv = wind ? wind(i * dt) : [0, 0, 0], r = F.stepFlight(model, s, AF.pilot(s, target, wv), dt, wv); s = r.state;
        if (r.status !== "airborne") { status = r.status; break; }
        const a = F.attitude(s, wv); rec.push({ t: (i + 1) * dt, alt: a.altitude, hdg: a.heading, V: a.airspeed, bank: a.bank, beta: a.beta, alpha: a.alpha, climb: s.vel[2], x: s.pos[0] });
    }
    return { rec, status, state: s };
}
const settled = (rec, ok_) => { for (let i = 0; i < rec.length; i++) if (rec.slice(i).every(ok_)) return rec[i].t; return null; };
const maxOf = (rec, f) => Math.max(...rec.map(f));
const minOf = (rec, f) => Math.min(...rec.map(f));

console.log("autopilotFlight-selfcheck -- altitude, airspeed and heading hold for the real-flight trainer\n");

console.log("1. THE TRIM TABLE AND THE LAWS");
{
    const t = AF.trimTable(model);
    ok("!! the trim table is the flight model's own trim at 12 speeds from 30 to 52 m/s (stick, throttle and pitch attitude to 1e-12)", t.length === 12 && near(t[0].v, 30, 1e-12) && near(t[t.length - 1]?.v, 52, 1e-12) && t.every((r) => { const f = F.trim(model, r.v); return near(r.pitch, f.pitch, 1e-12) && near(r.throttle, f.throttle, 1e-12) && near(r.att, f.pitchAttitude, 1e-12); }), `stick ${t[0].pitch.toFixed(3)} .. ${t[t.length - 1]?.pitch.toFixed(3)}`);
    ok("...and it is memoised per model (the same frozen table back), and a different airframe gets its own", AF.trimTable(model) === t && Object.isFrozen(t) && AF.trimTable(F.createFlightModel({ ...F.TRAINER, mass: 900 })) !== t && AF.trimTable(F.createFlightModel({ ...F.TRAINER, mass: 900 }))[5].throttle < t[5].throttle);
    ok("the laws are frozen and name the thirteen gains the header describes", Object.isFrozen(AF.AUTOPILOT_FLIGHT) && Object.keys(AF.AUTOPILOT_FLIGHT).sort().join() === "kAltVs,kBank,kBankInv,kBeta,kClimbThr,kCoord,kHdgBank,kP,kQ,kSpd,kVsPitch,maxBank,vsMax");
    ok("the default airframe is built once", AF.defaultModel() === AF.defaultModel());
    ok("!! TRIM_SPEEDS is the table's 12 speeds, frozen, from 30 to 52 m/s in equal steps of 2 m/s", Object.isFrozen(AF.TRIM_SPEEDS) && AF.TRIM_SPEEDS.length === 12 && AF.TRIM_SPEEDS.every((v, i) => near(v, 30 + 2 * i, 1e-12)) && AF.trimTable(model).every((r, i) => r.v === AF.TRIM_SPEEDS[i]));
    const s45 = TRIM_AT(45), dflt = AF.decide(s45), explicit = AF.decide(s45, AF.TARGET_DEFAULT);
    ok("!! TARGET_DEFAULT is 300 m, heading 0, 45 m/s, frozen, and a decision with no target is a decision toward it", Object.isFrozen(AF.TARGET_DEFAULT) && AF.TARGET_DEFAULT.altitude === 300 && AF.TARGET_DEFAULT.heading === 0 && AF.TARGET_DEFAULT.airspeed === 45 && JSON.stringify(dflt.controls) === JSON.stringify(explicit.controls));
    const gdn = AF.guidance(F.createState({ speed: 43, pitch: 0.06, heading: 0.2, bank: 0.2, w: [0.1, -0.1, 0.05] }), { altitude: 330, heading: 0.9, airspeed: 46 });
    ok("!! decide() is guidance then lawsFrom: lawsFrom(guidance(...)) is decide(...).controls, and lawsFrom takes its gains from the caller (kBank 0 takes the roll to minus kP times the roll rate)", JSON.stringify(AF.lawsFrom(gdn)) === JSON.stringify(AF.decide(F.createState({ speed: 43, pitch: 0.06, heading: 0.2, bank: 0.2, w: [0.1, -0.1, 0.05] }), { altitude: 330, heading: 0.9, airspeed: 46 }).controls) && near(AF.lawsFrom(gdn, { kBank: 0 }).roll, -AF.AUTOPILOT_FLIGHT.kP * gdn.rates.roll, 1e-12));
}

console.log("\n2. AT TRIM THE CONTROLS ARE THE TRIM CONTROLS AND THE AIRCRAFT STAYS WHERE IT IS");
{
    const errs = [32, 38, 41, 45, 49, 52].map((V) => { const t = F.trim(model, V), c = AF.pilot(TRIM_AT(V), { altitude: 300, heading: 0, airspeed: V }); return { V, ds: Math.abs(c.pitch - t.pitch), dt: Math.abs(c.throttle - t.throttle), roll: c.roll, yaw: c.yaw }; });
    ok("!! trimmed and on target at 32..52 m/s the pilot's stick and throttle are the trim's to 1.2e-3 (the table's interpolation) and roll and yaw are exactly 0", errs.every((e) => e.ds < 1.2e-3 && e.dt < 1.6e-3 && e.roll === 0 && e.yaw === 0), errs.map((e) => `${e.V}: ${e.ds.toExponential(1)}`).join(" "));
    const r = sim({ speed: 45, pitch: T45.pitchAttitude }, LEVEL, 60);
    ok("!! a trimmed aircraft left to the pilot for 60 s moves less than 0.2 m in altitude and 5 cm/s in speed", r.status === "airborne" && maxOf(r.rec, (x) => Math.abs(x.alt - 300)) < 0.2 && maxOf(r.rec, (x) => Math.abs(x.V - 45)) < 0.05, `${maxOf(r.rec, (x) => Math.abs(x.alt - 300)).toFixed(3)} m, ${maxOf(r.rec, (x) => Math.abs(x.V - 45)).toFixed(3)} m/s`);
}

console.log("\n3. SIGNS, THE SHORTEST WAY ROUND, AND MIRROR SYMMETRY");
{
    const s0 = TRIM_AT(45), base = AF.decide(s0, LEVEL);
    const right = AF.decide(s0, { ...LEVEL, heading: 0.3 }), left = AF.decide(s0, { ...LEVEL, heading: -0.3 }), up = AF.decide(s0, { ...LEVEL, altitude: 340 }), down = AF.decide(s0, { ...LEVEL, altitude: 260 }), fast = AF.decide(s0, { ...LEVEL, airspeed: 50 }), slow = AF.decide(s0, { ...LEVEL, airspeed: 40 });
    ok("!! a target to the RIGHT asks for a right bank and a right roll, a target to the left the opposite", right.guidance.bankCmd > 0.2 && right.controls.roll > 0.5 && left.guidance.bankCmd < -0.2 && left.controls.roll < -0.5);
    ok("!! a target ABOVE asks for a climb and more back-stick than trim, a target below the opposite", up.guidance.vsCmd > 0 && up.controls.pitch > base.controls.pitch && down.guidance.vsCmd < 0 && down.controls.pitch < base.controls.pitch, `${up.controls.pitch.toFixed(3)} / ${base.controls.pitch.toFixed(3)} / ${down.controls.pitch.toFixed(3)}`);
    ok("!! an airspeed target above the speed asks for more throttle, below it less", fast.controls.throttle > base.controls.throttle && slow.controls.throttle < base.controls.throttle);
    const wrap = AF.decide(F.createState({ speed: 45, pitch: T45.pitchAttitude, heading: -3.0 }), { ...LEVEL, heading: 3.0 });
    ok("!! the SHORTEST WAY ROUND: at heading -3.0 with a target of +3.0 the error is -0.283 (a short left turn), not +6.0", near(wrap.guidance.headingErr, -(2 * Math.PI - 6.0), 1e-9) && wrap.controls.roll < 0 && AF.wrapAngle(6.0) < 0, `err ${wrap.guidance.headingErr.toFixed(4)}`);
    const inv3 = AF.decide(F.createState({ speed: 45, pitch: 0, bank: 3.0 }), { ...LEVEL, heading: -0.5 });
    ok("!! the roll takes the SHORT way too: inverted at a bank of 3.0 rad with a left turn asked for (a bank of -0.45), the error is +2.83 (on through 180 degrees), not -3.45, and the roll command is to the right", near(inv3.guidance.bankErr, 2 * Math.PI - 3.0 - 0.45, 1e-9) && inv3.controls.roll > 0.9, `bankErr ${inv3.guidance.bankErr.toFixed(4)}, roll ${inv3.controls.roll}`);
    // mirror: y -> -y, q (w,x,y,z) -> (w,-x,y,-z), w (pseudovector) (x,y,z) -> (-x,y,-z); heading and bank change sign
    const mirror = (s) => ({ ...s, pos: [s.pos[0], -s.pos[1], s.pos[2]], vel: [s.vel[0], -s.vel[1], s.vel[2]], q: [s.q[0], -s.q[1], s.q[2], -s.q[3]], w: [-s.w[0], s.w[1], -s.w[2]] });
    const st = F.createState({ speed: 43, pitch: 0.06, heading: 0.4, bank: 0.3, gamma: 0.02, w: [0.1, -0.05, 0.08] }), tg = { altitude: 330, heading: 1.1, airspeed: 47 };
    const a = AF.decide(st, tg).controls, b = AF.decide(mirror(st), { ...tg, heading: -tg.heading }).controls;
    ok("!! the pilot is MIRROR-SYMMETRIC: the mirrored aircraft on the mirrored target gets the same pitch and throttle and the negated roll and yaw (1e-9)", near(a.pitch, b.pitch, 1e-9) && near(a.throttle, b.throttle, 1e-9) && near(a.roll, -b.roll, 1e-9) && near(a.yaw, -b.yaw, 1e-9), JSON.stringify(a) + " / " + JSON.stringify(b));
}

console.log("\n3b. EACH TERM OF EACH LAW, ONE AT A TIME -- the gains' jobs, pinned");
{
    const K = AF.AUTOPILOT_FLIGHT, s0 = TRIM_AT(45), base = AF.decide(s0, LEVEL), b = base.controls;
    ok("!! the gains are the thirteen the header documents (a changed gain is a changed pilot: this row is where that is said, and the roster's hand weights and every trained file are built on them)", JSON.stringify(K) === JSON.stringify({ kAltVs: 0.12, vsMax: 4, kVsPitch: 0.35, kQ: 0.35, kBankInv: 0.55, kHdgBank: 1.1, maxBank: 0.45, kBank: 2.2, kP: 0.28, kCoord: 1.0, kBeta: 1.6, kSpd: 0.06, kClimbThr: 0.1 }));
    const withW = (w) => AF.decide({ ...s0, w }, LEVEL).controls;
    const q = withW([0, -0.2, 0]), p = withW([0.3, 0, 0]), r = withW([0, 0, -0.1]);
    ok("!! PITCH-RATE DAMPING: a nose-up rate of 0.2 rad/s takes exactly kQ * 0.2 off the stick and moves nothing else", near(q.pitch, b.pitch - K.kQ * 0.2, 1e-9) && q.roll === b.roll && q.yaw === b.yaw && q.throttle === b.throttle, `${(q.pitch - b.pitch).toFixed(5)} vs ${(-K.kQ * 0.2).toFixed(5)}`);
    ok("!! ROLL-RATE DAMPING: a roll rate to the right of 0.3 rad/s takes exactly kP * 0.3 off the roll command and asks for NO rudder and no stick (the airframe has no adverse yaw to cancel)", near(p.roll, b.roll - K.kP * 0.3, 1e-9) && p.yaw === 0 && p.pitch === b.pitch && p.throttle === b.throttle, `${(p.roll - b.roll).toFixed(5)} vs ${(-K.kP * 0.3).toFixed(5)}, yaw ${p.yaw}`);
    ok("!! YAW-RATE DAMPING: a nose-right yaw rate of 0.1 rad/s takes exactly kCoord * 0.1 off the rudder (the turn rate asked for is zero in level flight)", near(r.yaw, b.yaw - K.kCoord * 0.1, 1e-9) && r.roll === b.roll && r.pitch === b.pitch, `${(r.yaw - b.yaw).toFixed(5)}`);
    const slip = 0.05, sv = { ...s0 }; sv.vel = rotateByQuat(sv.q, [45 * Math.cos(T45.alpha) * Math.cos(slip), -45 * Math.sin(slip), -45 * Math.sin(T45.alpha) * Math.cos(slip)]);
    const sl = AF.decide(sv, LEVEL).controls, beta = AF.guidance(sv, LEVEL).att.beta;
    ok("!! SIDESLIP: slipping to the right by 0.05 rad asks for exactly kBeta * beta of left rudder (the nose is brought round to the wind), and nothing else moves by more than the airspeed's rounding", near(beta, slip, 1e-9) && near(sl.yaw, -K.kBeta * beta, 1e-9) && near(sl.roll, b.roll, 1e-9), `yaw ${sl.yaw.toFixed(5)} vs ${(-K.kBeta * beta).toFixed(5)}`);
    const bk = AF.decide(F.createState({ speed: 45, pitch: T45.pitchAttitude, bank: 0.1 }), LEVEL), gd = bk.guidance;
    ok("!! BANK ERROR: a 0.1 rad right bank on a wings-level target asks for kBank * 0.1 of left roll; the coordinated turn it is in asks for g tan(bank) / V of rudder (less kBeta times the small sideslip that attitude has with the velocity still level); and the vertical lift it loses asks for kBankInv * (1/cos(bank) - 1) of stick", near(bk.controls.roll, -K.kBank * 0.1, 1e-9) && near(bk.controls.yaw, K.kCoord * (G * Math.tan(0.1) / 45) - K.kBeta * gd.att.beta, 1e-9) && near(bk.controls.pitch, b.pitch + K.kBankInv * (1 / Math.cos(0.1) - 1), 1e-9), `roll ${bk.controls.roll.toFixed(5)}, yaw ${bk.controls.yaw.toFixed(5)}, stick +${(bk.controls.pitch - b.pitch).toFixed(5)}`);
    const alt = AF.decide(s0, { ...LEVEL, altitude: 320 }).controls;
    ok("!! CLIMB COMMAND: 20 m low asks for min(vsMax, kAltVs * 20) = 2.4 m/s of climb, and the stick is kVsPitch * 2.4 / 5 above trim; the throttle does not move", near(alt.pitch, b.pitch + K.kVsPitch * 2.4 / 5, 1e-9) && alt.throttle === b.throttle && near(AF.guidance(s0, { ...LEVEL, altitude: 320 }).vsCmd, 2.4, 1e-12) && near(AF.guidance(s0, { ...LEVEL, altitude: 800 }).vsCmd, K.vsMax, 1e-12));
    const slow = AF.decide(TRIM_AT(43), LEVEL).controls.throttle, fast = AF.decide(TRIM_AT(47), LEVEL).controls.throttle, fl = AF.decide(TRIM_AT(45, { gamma: Math.asin(3 / 45) }), LEVEL).controls.throttle;
    ok("!! SPEED ERROR and CLIMB: the throttle moves by kSpd per m/s of airspeed error (2 m/s slow gives exactly kSpd * 2 more than 2 m/s fast, over 4 m/s), and by kClimbThr per m/s of climb (3 m/s climbing adds 0.3)", near(slow - fast, K.kSpd * 4, 1e-9) && near(fl - b.throttle, K.kClimbThr * 3, 1e-9), `${(slow - fast).toFixed(5)} vs ${(K.kSpd * 4).toFixed(5)}; climb +${(fl - b.throttle).toFixed(5)}`);
}

console.log("\n4. STEP RESPONSES FROM TRIM");
{
    for (const d of [100, -100, 40]) {
        const r = sim({ speed: 45, pitch: T45.pitchAttitude }, { ...LEVEL, altitude: 300 + d }, 60), sign = Math.sign(d), over = maxOf(r.rec, (x) => sign * (x.alt - 300 - d)), ts = settled(r.rec, (x) => Math.abs(x.alt - 300 - d) < 5);
        ok(`!! an altitude step of ${d > 0 ? "+" : ""}${d} m: no overshoot beyond 2 m, within 5 m by ${d === 40 ? 20 : 36} s, never below 42 m/s or past 12 degrees of alpha, no sideslip`, r.status === "airborne" && over < 2 && ts !== null && ts <= (d === 40 ? 20 : 36) && minOf(r.rec, (x) => x.V) > 42 && maxOf(r.rec, (x) => x.alpha) < 12 * D2R && maxOf(r.rec, (x) => Math.abs(x.beta)) < 0.1 * D2R, `overshoot ${over.toFixed(2)} m, settled ${ts && ts.toFixed(1)} s, V ${minOf(r.rec, (x) => x.V).toFixed(1)}..${maxOf(r.rec, (x) => x.V).toFixed(1)}`);
    }
    const turn = (dh) => sim({ speed: 45, pitch: T45.pitchAttitude }, { ...LEVEL, heading: dh }, 60);
    const runs = { r90: turn(Math.PI / 2), l90: turn(-Math.PI / 2), r170: turn(2.97) };
    for (const [k, dh, lim] of [["r90", Math.PI / 2, 22], ["l90", -Math.PI / 2, 22], ["r170", 2.97, 36]]) {
        const r = runs[k], sign = Math.sign(dh), over = maxOf(r.rec, (x) => sign * (x.hdg - dh)) * R2D, ts = settled(r.rec, (x) => Math.abs(x.hdg - dh) < 0.05), bank = maxOf(r.rec, (x) => Math.abs(x.bank)) * R2D;
        ok(`!! a ${(dh * R2D).toFixed(0)}-degree turn: no overshoot beyond 1 degree, within 3 degrees by ${lim} s, bank held to its 25.8 degree limit (24..27), sideslip under 5.5, altitude within 4 m, speed within 1 m/s`, r.status === "airborne" && over < 1 && ts !== null && ts <= lim && bank > 24 && bank < 27 && maxOf(r.rec, (x) => Math.abs(x.beta)) < 5.5 * D2R && maxOf(r.rec, (x) => Math.abs(x.alt - 300)) < 4 && maxOf(r.rec, (x) => Math.abs(x.V - 45)) < 1, `overshoot ${over.toFixed(2)} deg, settled ${ts && ts.toFixed(1)} s, bank ${bank.toFixed(1)}, beta ${(maxOf(r.rec, (x) => Math.abs(x.beta)) * R2D).toFixed(2)}, alt ${minOf(r.rec, (x) => x.alt).toFixed(1)}..${maxOf(r.rec, (x) => x.alt).toFixed(1)}`);
    }
    const mirrorErr = Math.max(...runs.r90.rec.map((x, i) => { const y = runs.l90.rec[i]; return Math.max(Math.abs(x.alt - y.alt), Math.abs(x.V - y.V), Math.abs(x.hdg + y.hdg), Math.abs(x.bank + y.bank), Math.abs(x.beta + y.beta)); }));
    ok("!! the LEFT turn is the RIGHT turn's mirror image over 60 s: altitude and speed equal, heading, bank and sideslip negated (1e-6)", runs.r90.rec.length === runs.l90.rec.length && mirrorErr < 1e-6, `${mirrorErr.toExponential(2)}`);
    const sp = (V) => sim({ speed: 45, pitch: T45.pitchAttitude }, { ...LEVEL, airspeed: V }, 40);
    const down = sp(38), upS = sp(50);
    ok("!! a speed step of -7 and +5 m/s is made within 1 m/s in 12 s with the altitude held to 3 m", [down, upS].every((r, i) => r.status === "airborne" && settled(r.rec, (x) => Math.abs(x.V - (i ? 50 : 38)) < 1) <= 12 && maxOf(r.rec, (x) => Math.abs(x.alt - 300)) < 3), `-7: ${settled(down.rec, (x) => Math.abs(x.V - 38) < 1)} s, +5: ${settled(upS.rec, (x) => Math.abs(x.V - 50) < 1)} s`);
}

console.log("\n5. A COORDINATED TURN AND THE COST OF A CLIMB, AGAINST THEIR CLOSED FORMS");
{
    const r = sim({ speed: 45, pitch: T45.pitchAttitude }, { ...LEVEL, heading: 2.97 }, 40), mid = r.rec.filter((x) => x.t > 10 && x.t < 20);
    const rate = (mid.at(-1).hdg - mid[0].hdg) / (mid.at(-1).t - mid[0].t), bank = mid.reduce((a, x) => a + x.bank, 0) / mid.length, V = mid.reduce((a, x) => a + x.V, 0) / mid.length, oracle = G * Math.tan(bank) / V;
    ok("!! the heading rate in a steady bank is g tan(bank) / V, to 3% (the coordinated turn, from the physics and not from the law), with the sideslip under a degree", rel(rate, oracle) < 0.03 && maxOf(mid, (x) => Math.abs(x.beta)) < 1 * D2R, `${rate.toFixed(4)} vs ${oracle.toFixed(4)} rad/s at bank ${(bank * R2D).toFixed(2)} deg, V ${V.toFixed(2)}; beta ${(maxOf(mid, (x) => Math.abs(x.beta)) * R2D).toFixed(2)} deg`);
    // a steady 2.5 m/s climb: the throttle the pilot ASKS for above level, against the throttle the flight model's own trim says a climb at that angle NEEDS (drag included)
    const gamma = Math.asin(2.5 / 45), tl = F.trim(model, 45), tc = F.trim(model, 45, { gamma }), needed = tc.throttle - tl.throttle;
    const asked = AF.decide(TRIM_AT(45, { gamma }), LEVEL).controls.throttle - AF.decide(TRIM_AT(45), LEVEL).controls.throttle, wsin = model.weight * 2.5 / 45 / (F.TRAINER.thrustMax * (1 - 45 / F.TRAINER.propSpeed));
    ok("!! THE CLIMB'S COST: the throttle the pilot adds for a 2.5 m/s climb is what the flight model's trim needs for that climb (to 15%), and that is W sin(gamma) of thrust (to 10%)", tc.feasible && rel(asked, needed) < 0.15 && rel(needed, wsin) < 0.10, `asked ${asked.toFixed(3)}, trim needs ${needed.toFixed(3)}, W sin(gamma) / (Tmax (1 - V/90)) = ${wsin.toFixed(3)}`);
    const steep = F.trim(model, 45, { gamma: Math.asin(4 / 45) });
    ok("!! AND THE LIMIT OF THE AIRCRAFT, SAID: the 4 m/s the pilot's climb command allows is MORE than full throttle can hold at 45 m/s (the trim wants a throttle of 1.09) -- which is why a 100 m climb sags to 42.8 m/s and the speed loop cannot close it", !steep.feasible && steep.throttle > 1.05 && steep.throttle < 1.15 && AF.AUTOPILOT_FLIGHT.vsMax === 4, `trim throttle ${steep.throttle.toFixed(3)}`);
}

console.log("\n6. WINGS FIRST, THEN PULL; UNUSUAL ATTITUDES");
{
    const up = (deg) => AF.guidance(F.createState({ speed: 45, bank: deg * D2R }), LEVEL).upright;
    ok("!! the upright factor is 1 to 66 degrees of bank, 0 from 85 degrees, and falls between (monotone)", up(0) === 1 && up(60) === 1 && up(66) > 0.99 && up(75) > 0.2 && up(75) < 0.8 && up(85) === 0 && up(90) === 0 && up(170) === 0 && up(-120) === 0 && up(-60) === 1 && up(60) >= up(75) && up(75) >= up(80) && up(80) > up(84), [0, 60, 66, 75, 80, 84, 85, 90, 170].map((d) => `${d}:${up(d).toFixed(2)}`).join(" "));
    const inv = AF.decide(F.createState({ speed: 45, bank: 170 * D2R, pitch: 0 }), LEVEL).controls;
    ok("!! INVERTED the pilot does not pull: at a 170-degree bank the stick is within 0.05 of neutral and the roll is a full roll toward level, by the short way", Math.abs(inv.pitch) < 0.05 && inv.roll < -0.95, JSON.stringify(inv));
    const cases = { "170-degree bank": { speed: 45, pitch: 0, bank: 2.97 }, "120-degree bank": { speed: 45, pitch: 0, bank: 2.1 }, "nose-high 23 deg at 32 m/s": { speed: 32, pitch: 0.4, gamma: 0.1 }, "26-degree dive at 55 m/s": { speed: 55, pitch: -0.5, gamma: -0.45 }, "30 m/s start": { speed: 30, pitch: 0.15 }, "spinning at 1.5 rad/s": { speed: 45, pitch: 0.05, w: [1.5, 0.5, -0.8] } };
    for (const [k, st] of Object.entries(cases)) {
        const r = sim(st, LEVEL, 60), ts = settled(r.rec, (x) => Math.abs(x.alt - 300) < 8 && Math.abs(x.bank) < 0.05 && Math.abs(x.V - 45) < 3);
        ok(`!! recovers from ${k}: level and on speed within 14 s, never more than 30 m below`, r.status === "airborne" && ts !== null && ts <= 14 && minOf(r.rec, (x) => x.alt) > 270, `settled ${ts && ts.toFixed(1)} s, lowest ${minOf(r.rec, (x) => x.alt).toFixed(0)} m`);
    }
}

console.log("\n7. AIR DATA ARE RELATIVE TO THE AIR");
{
    const tail = () => [10, 0, 0], s0 = TRIM_AT(45);
    ok("!! in a 10 m/s tailwind the pilot sees 35 m/s of airspeed where the ground speed is 45, and asks for more throttle than it would in still air", near(AF.guidance(s0, LEVEL, tail()).airspeed, 35, 1e-9) && near(AF.guidance(s0, LEVEL).airspeed, 45, 1e-9) && AF.decide(s0, LEVEL, tail()).controls.throttle > AF.decide(s0, LEVEL).controls.throttle + 0.3);
    const r = sim({ speed: 45, pitch: T45.pitchAttitude }, LEVEL, 40, () => [0, 8, 0]);
    ok("!! a steady 8 m/s crosswind is flown: airspeed within 1 m/s, altitude within 1 m, the heading held to a degree", r.status === "airborne" && maxOf(r.rec, (x) => Math.abs(x.V - 45)) < 1 && maxOf(r.rec, (x) => Math.abs(x.alt - 300)) < 1 && Math.abs(r.rec.at(-1).hdg) < 1 * D2R, `V ${minOf(r.rec, (x) => x.V).toFixed(2)}..${maxOf(r.rec, (x) => x.V).toFixed(2)}`);
    const gust = (k) => { const ph = [k * 1.7, k * 2.9, k * 0.7]; return (t) => [6 + 3 * Math.sin(0.7 * t + ph[0]) + 1.5 * Math.sin(2.3 * t + ph[1]), -4 + 3 * Math.sin(0.5 * t + ph[2]) + 1.5 * Math.sin(1.9 * t + ph[0]), 1.5 * Math.sin(1.1 * t + ph[1]) + 0.8 * Math.sin(3.1 * t + ph[2])]; };
    const days = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => sim({ speed: 45, pitch: T45.pitchAttitude }, { altitude: 330, heading: 1.0, airspeed: 45 }, 50, gust(k)));
    ok("!! eight gusty days (6 and -4 m/s of mean wind, gusts of 3 m/s on each axis) are flown without a crash, never past 14 degrees of alpha, within 3 m of the altitude asked for and 10 degrees of the heading from 35 s on, and the airspeed within 7 m/s (a 4.5 m/s gust moves the airspeed at once; the throttle cannot follow it)", days.every((r) => r.status === "airborne" && maxOf(r.rec, (x) => x.alpha) < 14 * D2R && maxOf(r.rec.filter((x) => x.t > 35), (x) => Math.abs(x.alt - 330)) < 3 && maxOf(r.rec.filter((x) => x.t > 35), (x) => Math.abs(x.hdg - 1.0)) < 10 * D2R && maxOf(r.rec.filter((x) => x.t > 20), (x) => Math.abs(x.V - 45)) < 7), days.map((r) => `${maxOf(r.rec.filter((x) => x.t > 35), (x) => Math.abs(x.alt - 330)).toFixed(1)}m/${(maxOf(r.rec.filter((x) => x.t > 35), (x) => Math.abs(x.hdg - 1.0)) * R2D).toFixed(1)}deg/${maxOf(r.rec.filter((x) => x.t > 20), (x) => Math.abs(x.V - 45)).toFixed(1)}m/s`).join(" "));
}

console.log("\n8. NaN, DETERMINISM, THE FRONT DOOR");
{
    const bad = F.createState({ speed: 45 }); bad.vel = [NaN, 0, 0];
    const c1 = AF.pilot(bad, LEVEL), c2 = AF.pilot(TRIM_AT(45), { altitude: NaN, heading: Infinity, airspeed: undefined });
    const inRange = (c) => [c.pitch, c.roll, c.yaw].every((v) => Number.isFinite(v) && Math.abs(v) <= 1) && Number.isFinite(c.throttle) && c.throttle >= 0 && c.throttle <= 1;
    ok("!! NaN in the state, and NaN, infinity and undefined in the target, give finite controls inside their ranges", inRange(c1) && inRange(c2), JSON.stringify(c1) + " " + JSON.stringify(c2));
    const a = AF.decide(TRIM_AT(41), { altitude: 320, heading: 0.9, airspeed: 43 }), b = AF.decide(TRIM_AT(41), { altitude: 320, heading: 0.9, airspeed: 43 });
    ok("the pilot is deterministic, and pilot() is decide().controls", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(AF.pilot(TRIM_AT(41), { altitude: 320, heading: 0.9, airspeed: 43 })) === JSON.stringify(a.controls));
    const full = AF.decide(TRIM_AT(45, { bank: 2.9, pitch: 1.2 }), { altitude: 5000, heading: 3, airspeed: 90 }).controls;
    ok("every control stays inside its range under absurd demands (a 4,700 m climb, 90 m/s, inverted)", inRange(full));
    const L = AF.reportLines();
    ok("the front door names the module, prints the trim table and one decision, and no line says NaN or undefined", L.some((l) => /autopilotFlight/.test(l)) && L.some((l) => /trim table: 12 speeds/.test(l)) && L.some((l) => /asked to climb 40 m/.test(l)) && L.every((l) => !/NaN|undefined/.test(l)));
}

console.log(fails ? `\nautopilotFlight-selfcheck: ${fails} FAILED` : "\nautopilotFlight-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
