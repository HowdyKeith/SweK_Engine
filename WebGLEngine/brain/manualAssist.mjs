// WebGLEngine/brain/manualAssist.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE STICK OF A HUMAN PILOT, WITH THE AUTOPILOT'S INNER LOOPS UNDER IT (es-flight6dof.html "you (keyboard)"). The raw stick was the surface deflection: A held left sent roll -1, which is the whole aileron, and the aircraft rolled over faster than a hand
// can follow and stayed rolled when the key came up. With the assist ON (the page's default) the stick COMMANDS AN ATTITUDE and the aircraft's own loops (brain/autopilotFlight.mjs lawsFrom, the same laws the autopilot flies) hold it:
//   ROLL    the stick is a BANK ANGLE, +-MAX_BANK (0.7 rad, 40 degrees) at full stick; the roll loop (kBank, kP) takes the wings there at the rate the loop allows and holds them; LET GO AND THE WINGS COME BACK TO LEVEL
//   PITCH   neutral stick is the trim for the airspeed (so level flight holds hands-off); the extra back-stick a banked wing needs for the same lift is added; the stick adds 0.55 of its travel on top; with the pitch stick near
//           neutral the CLIMB RATE is drawn to zero (the wings-level, level-off a student is taught), fading out as the stick goes in so a held pull is a pull
//   YAW     the coordinated-turn law (the rate a bank turns at, the sideslip driven to zero) plus the rudder pedal's 0.6 of its travel
//   THROTTLE is the human's.
// With the assist OFF the stick is raw: pitch trim + 0.55 stick, roll = stick (full), yaw 0.6 stick -- the behaviour the page had.
// WHAT IT IS NOT: a flight envelope protector. A held pull still stalls the wing and an inverted aircraft is still inverted; it takes the twitch out of the roll and puts the wings back, nothing more.
// Pure: no DOM, no clock, no random.
"use strict";
import * as AF from "./autopilotFlight.mjs";

export const MAX_BANK = 0.7, PITCH_AUTH = 0.55, YAW_AUTH = 0.6, ROLL_AUTH = 0.35;   // the roll loop may use a third of the aileron: the whole of it makes 119 degrees a second in the first 0.12 s of a roll, half of it 88
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (Number.isFinite(v) ? v : 0);

/**
 * (state, target, wind, stick { pitch, roll, yaw, throttle }, opts { assist (default true), model, ...gains }) -> { pitch, roll, yaw, throttle }. `target` is only read for the airspeed trim (its airspeed decides the throttle trim, unused here);
 * `stick` values are -1..1 (throttle 0..1), pitch +1 = pull back = nose up, roll -1 = left.
 */
export function assisted(state, target, wind, stick, opts = {}) {
    const st = { pitch: clamp(num(stick.pitch), -1, 1), roll: clamp(num(stick.roll), -1, 1), yaw: clamp(num(stick.yaw), -1, 1), throttle: clamp(num(stick.throttle), 0, 1) };
    const gd = AF.guidance(state, target, wind, opts);
    if (opts.assist === false) return { pitch: clamp(gd.stickTrim + PITCH_AUTH * st.pitch, -1, 1), roll: st.roll, yaw: YAW_AUTH * st.yaw, throttle: st.throttle };
    const bankTarget = st.roll * MAX_BANK, level = 1 - Math.abs(st.pitch);
    const laws = AF.lawsFrom({ ...gd, bankErr: AF.wrapAngle(bankTarget - gd.att.bank), climbErr: level * (0 - gd.climb) }, opts);
    return { pitch: clamp(laws.pitch + PITCH_AUTH * st.pitch, -1, 1), roll: clamp(laws.roll, -ROLL_AUTH, ROLL_AUTH), yaw: clamp(laws.yaw + YAW_AUTH * st.yaw, -1, 1), throttle: st.throttle };
}
