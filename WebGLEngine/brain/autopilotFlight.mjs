// WebGLEngine/brain/autopilotFlight.mjs -- v4867
//
// THE HAND-WRITTEN PILOT FOR REAL FLIGHT: hold an altitude, an airspeed and a heading, in the pilot's senses (physics/mechanics/flightModel6dof.mjs), from four numbers out -- pitch, roll, yaw, throttle. It is the baseline the
// learned pilots (the fruit-fly network, the GPU network) are graded against and, written through the fly-wired network (brain/pilotFlightPolicy.mjs handWeights()), the START they are trained from.
//
// IT IS A CASCADE OF PD LOOPS, EACH ONE A LAW A STUDENT PILOT IS TAUGHT, AND NO LAW HAS MEMORY (no integrator, no state: the pilot is a pure function of what the aircraft is doing now, so it is exactly the thing a network can be):
//   HEADING -> BANK   bankCmd = clamp(kHdgBank * heading error, +-maxBank)           turn toward the target by leaning, never past 26 degrees
//   BANK -> ROLL      roll = kBank (bankCmd - bank) - kP rollRate                    the roll loop, with rate damping
//   ALTITUDE -> CLIMB vsCmd = clamp(kAltVs * altitude error, +-vsMax)                a climb RATE is asked for, never a pitch attitude
//   CLIMB -> PITCH    pitch = upright * (stickTrim(V) + kBankInv (1/cos(bank) - 1) + kVsPitch (vsCmd - climb)/5) - kQ pitchRate
//                     stickTrim(V) is the stick that holds level flight at this airspeed (the trim table below); the bank term is the extra back-stick a banked wing needs for the same vertical lift;
//                     `upright` is 1 with the wings within 66 degrees of level and falls to 0 at 85: WINGS FIRST, THEN PULL -- a steeply banked or inverted aircraft that pulls is pulling toward the ground
//   TURN -> YAW       yaw = kCoord (g tan(bank) / V - yawRate) - kBeta beta          the rate a COORDINATED turn has, and the sideslip driven to zero
//   SPEED -> THROTTLE throttle = trimThrottle(target speed) + kSpd (V_target - V) + kClimbThr climb     the climb term is the energy a climb costs (W sin(gamma) of thrust)
//
// *** WHAT IT CAN AND CANNOT DO, MEASURED (brain/autopilotFlight-selfcheck.mjs). *** From trim it captures a 100 m altitude change in about 31 s without overshooting it, turns 90 degrees in about 20 s without overshooting the heading,
// holds 45 m/s through both, and recovers from a 120-degree bank, a nose-high 23-degree slow start and a 26-degree dive, and flies through a steady wind with gusts. It does NOT recover from a flat spin or fly below the stall speed: below
// 30 m/s the trim table clamps to its first entry and the aircraft is asking for more than the elevator has. It does not know about the ground (a descent target below the terrain flies into it).
//
// Pure: no DOM, no clock, no random. `wind` is the air's velocity (default still); airspeed, alpha and beta are READ RELATIVE TO THE AIR (a pitot tube and two vanes can do that), altitude, climb rate and heading are not.
"use strict";
import * as F from "../physics/mechanics/flightModel6dof.mjs";

const G = F.GRAVITY;
export const AUTOPILOT_FLIGHT = Object.freeze({
    kAltVs: 0.12, vsMax: 4, kVsPitch: 0.35, kQ: 0.35, kBankInv: 0.55, kHdgBank: 1.1, maxBank: 0.45, kBank: 2.2, kP: 0.28, kCoord: 1.0, kBeta: 1.6, kSpd: 0.06, kClimbThr: 0.1,
});
export const TARGET_DEFAULT = Object.freeze({ altitude: 300, heading: 0, airspeed: 45 });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---- the trim table: the stick and throttle that hold level flight, at 12 speeds from 30 to 52 m/s -----------------------------------------------------------------------------------------------------------
export const TRIM_SPEEDS = Object.freeze(Array.from({ length: 12 }, (_, i) => 30 + (52 - 30) * i / 11));
const TABLES = new WeakMap();
/** The trim table of a flight model: [{ v, pitch (the stick), throttle, att (the pitch attitude) }], memoised per model. */
export function trimTable(model) {
    let t = TABLES.get(model);
    if (!t) { t = TRIM_SPEEDS.map((v) => { const r = F.trim(model, v); return Object.freeze({ v, pitch: r.pitch, throttle: r.throttle, att: r.pitchAttitude }); }); TABLES.set(model, Object.freeze(t)); }
    return t;
}
const lerpTable = (rows, v, key) => {
    if (!(v > rows[0].v)) return rows[0][key];
    for (let i = 1; i < rows.length; i++) if (v <= rows[i].v) { const u = (v - rows[i - 1].v) / (rows[i].v - rows[i - 1].v); return rows[i - 1][key] + u * (rows[i][key] - rows[i - 1][key]); }
    return rows[rows.length - 1][key];
};
let DEFAULT_MODEL = null;
/** The default airframe's flight model (the TRAINER), built once. */
export const defaultModel = () => DEFAULT_MODEL || (DEFAULT_MODEL = F.createFlightModel());

/**
 * Everything the laws use, computed once: the pilot's senses and the intermediate commands. A learned pilot's features are these (brain/pilotFlightPolicy.mjs), so the hand weights and the hand controller read one set of numbers.
 * `target` is { altitude, heading, airspeed }; heading is wrapped, so +-3.5 rad means what it means.
 */
export function guidance(state, target = TARGET_DEFAULT, wind = [0, 0, 0], opts = {}) {
    const g = { ...AUTOPILOT_FLIGHT, ...opts }, model = opts.model || defaultModel(), table = trimTable(model);
    const a = F.attitude(state, wind), r = F.rates(state), V = a.airspeed, climb = state.vel[2];
    const altErr = fin(target.altitude) - a.altitude, headingErr = wrapAngle(fin(target.heading) - a.heading);
    const bankCmd = clamp(g.kHdgBank * headingErr, -g.maxBank, g.maxBank), vsCmd = clamp(g.kAltVs * altErr, -g.vsMax, g.vsMax);
    const tilt = clamp(a.bank, -1.2, 1.2);
    return {
        att: a, rates: r, airspeed: V, climb, altErr, headingErr, bankCmd, vsCmd,
        stickTrim: lerpTable(table, V, "pitch"), thrTrim: lerpTable(table, fin(target.airspeed), "throttle"),
        invCos: clamp(1 / Math.max(0.4, Math.cos(a.bank)) - 1, 0, 1.5), upright: clamp((Math.cos(a.bank) - 0.1) / 0.3, 0, 1),
        climbErr: vsCmd - climb, bankErr: wrapAngle(bankCmd - a.bank),
        turnRate: G * Math.tan(tilt) / Math.max(20, V),
        speedErr: fin(target.airspeed) - V,
    };
}

/** The four controls from a guidance record, by the laws in the header. NaN-safe: a non-finite number is read as 0 by `fin`, so a flight that goes non-finite gets neutral controls and not a NaN back. */
export function lawsFrom(gd, opts = {}) {
    const g = { ...AUTOPILOT_FLIGHT, ...opts }, r = gd.rates;
    const pitch = gd.upright * (gd.stickTrim + g.kBankInv * gd.invCos + g.kVsPitch * gd.climbErr / 5) - g.kQ * r.pitch;
    const roll = g.kBank * gd.bankErr - g.kP * r.roll;
    const yaw = g.kCoord * (gd.turnRate - r.yaw) - g.kBeta * gd.att.beta;
    const throttle = gd.thrTrim + g.kSpd * gd.speedErr + g.kClimbThr * gd.climb;
    return { pitch: clamp(fin(pitch), -1, 1), roll: clamp(fin(roll), -1, 1), yaw: clamp(fin(yaw), -1, 1), throttle: clamp(fin(throttle), 0, 1) };
}

/** state, target, wind -> { controls, guidance }: the pilot. */
export function decide(state, target = TARGET_DEFAULT, wind = [0, 0, 0], opts = {}) {
    const gd = guidance(state, target, wind, opts);
    return { controls: lawsFrom(gd, opts), guidance: gd };
}
/** The pilot as a bare function (state, target, wind) -> controls: what flightModel6dof's stepFlight takes. */
export const pilot = (state, target, wind) => decide(state, target, wind).controls;

// ---- the front door ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function reportLines() {
    const m = defaultModel(), t = trimTable(m), s = F.createState({ speed: 45, pitch: t[7].att + 0.05 }), d = decide(s, { altitude: 340, heading: 1.2, airspeed: 45 });
    return [
        "[autopilotFlight] altitude, airspeed and heading hold for flightModel6dof's trainer: a cascade of PD laws with no memory",
        `  trim table: ${t.length} speeds, ${t[0].v} m/s stick ${t[0].pitch.toFixed(3)} .. ${t[t.length - 1].v} m/s stick ${t[t.length - 1].pitch.toFixed(3)}`,
        `  asked to climb 40 m and turn 69 degrees right at 45 m/s: bank command ${(d.guidance.bankCmd * 180 / Math.PI).toFixed(1)} deg, climb command ${d.guidance.vsCmd.toFixed(1)} m/s -> pitch ${d.controls.pitch.toFixed(3)} roll ${d.controls.roll.toFixed(3)} yaw ${d.controls.yaw.toFixed(3)} throttle ${d.controls.throttle.toFixed(3)}`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
