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
// *** THE JET (unnumbered). *** The same laws fly physics/mechanics/flightModel6dof.mjs's JET_TRAINER with AUTOPILOT_JET's gains (below), and four additions that the trainer's gains do not name and so leave to the bit what they were: the trim is looked up by HEIGHT as well as speed (a jet's stick and throttle
// depend on the air: trimAt() interpolates six heights), the bank compensation and the climb pull are scheduled on the equivalent airspeed, the heading gain is a time constant, the climb rate asked for falls with the speed, and a pitch-rate-led angle-of-attack limiter takes the stick off before the wing stalls.
// MEASURED (brain/autopilotJet-selfcheck.mjs): it holds trim to a centimetre, captures +-300 m with no overshoot in 23 s, turns 20, 90 and 170 degrees with no overshoot in 14, 27 and 43 s at 140 m/s with the sideslip under 1.1 degrees and 6 m of altitude, holds speed through +-30 m/s steps, and recovers from a 120-degree bank, an
// inverted start, a nose-high slow start, 30- and 60-degree dives and a roll spin. WHAT IT CANNOT DO: below the stall speed (the trim table clamps), above 8,000 m of height (the table ends there), and it does not know the ground.
//
// Pure: no DOM, no clock, no random. `wind` is the air's velocity (default still); airspeed, alpha and beta are READ RELATIVE TO THE AIR (a pitot tube and two vanes can do that), altitude, climb rate and heading are not.
"use strict";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import { atmosphere } from "../physics/mechanics/atmosphereISA.mjs";

const G = F.GRAVITY;
export const AUTOPILOT_FLIGHT = Object.freeze({
    kAltVs: 0.12, vsMax: 4, kVsPitch: 0.35, kQ: 0.35, kBankInv: 0.55, kHdgBank: 1.1, maxBank: 0.45, kBank: 2.2, kP: 0.28, kCoord: 1.0, kBeta: 1.6, kSpd: 0.06, kClimbThr: 0.1,
});
export const TARGET_DEFAULT = Object.freeze({ altitude: 300, heading: 0, airspeed: 45 });
/**
 * THE JET'S GAINS (physics/mechanics/flightModel6dof.mjs's JET_TRAINER; every other gain is the trainer's, which the jet's own gate shows it needs no change of): the trainer's laws, with the six things that do not scale with an aircraft that is three times as fast and four times as heavy
 * set for it. Found by flying it (brain/autopilotFlight.mjs's header says how), not by derivation.
 *   vRef 140      the speed (equivalent airspeed) the gains below are given at; the back-stick a banked wing needs for the same lift, and the pull for a climb error, fall with the dynamic pressure and are scheduled on (vRef / EAS)^2 (kBankInv 0.3 here, kVsPitch 0.12)
 *   maxBank 0.9, bankLow 0.5   52 degrees (the trainer's 26): a jet that turns at 1.9 degrees a second at 140 m/s is not turning; but the limit falls linearly with the equivalent airspeed to 0.5 rad (29 degrees) at 65 m/s, because at 90 m/s a 52-degree turn is more pull than the angle-of-attack limit allows and loses 140 m in 170 degrees
 *   tauHeading 5  the heading error closes in 5 s at any speed (the bank asked for is V / (g 5) per radian of error: 2.9 at 140 m/s against the trainer's fixed 1.1)
 *   vsMax 15, vsLow 65, kAltVs 0.12   a 15 m/s climb, but only at 140 m/s and over: the limit falls with the equivalent airspeed to a quarter of it at 65 m/s
 *   kSpd 0.05, kClimbThr 0.02   the speed loop, and the thrust a climb costs (W sin gamma is 0.019 of the full thrust for each m/s of climb at 140 m/s)
 *   alphaLimit 0.13, alphaLead 0.5, kAlpha 12   the stick is taken off by 12 per radian by which the angle of attack plus half a second of pitch rate exceeds 0.13 rad (7.4 degrees), which keeps the worst upset recovery measured (a 40-degree dive at 100 m/s and 3,000 m) under 13.5 degrees
 */
export const AUTOPILOT_JET = Object.freeze({ maxBank: 0.9, bankLow: 0.5, kBankInv: 0.3, vRef: 140, vsMax: 15, vsLow: 65, kAltVs: 0.12, kVsPitch: 0.12, scheduleClimb: true, tauHeading: 5, kSpd: 0.05, kClimbThr: 0.02, alphaLimit: 0.13, kAlpha: 12, alphaLead: 0.5 });
export const TARGET_JET = Object.freeze({ altitude: 1000, heading: 0, airspeed: 140 });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---- the trim table: the stick and throttle that hold level flight, at 12 speeds from 30 to 52 m/s -----------------------------------------------------------------------------------------------------------
export const TRIM_SPEEDS = Object.freeze(Array.from({ length: 12 }, (_, i) => 30 + (52 - 30) * i / 11));
const TABLES = new WeakMap();
/** The speeds a model's trim table is built at: its spec's `trimSpeeds` (the jet's: 70..190 m/s), the trainer's twelve from 30 to 52 m/s otherwise. */
export const trimSpeedsOf = (model) => model.spec.trimSpeeds || TRIM_SPEEDS;
/** The trim table of a flight model: [{ v, pitch (the stick), throttle, att (the pitch attitude) }], memoised per model (and per height, for a model that flies in the standard atmosphere: `altitude` is read by the trim of a jet and ignored by the trainer's). */
export function trimTable(model, altitude) {
    let by = TABLES.get(model); if (!by) TABLES.set(model, by = new Map());
    const key = altitude === undefined ? "ref" : altitude;
    let t = by.get(key);
    if (!t) { t = trimSpeedsOf(model).map((v) => { const r = F.trim(model, v, altitude === undefined ? {} : { altitude }); return Object.freeze({ v, pitch: r.pitch, throttle: r.throttle, att: r.pitchAttitude }); }); by.set(key, Object.freeze(t)); }
    return t;
}
/** A model that flies in the standard atmosphere (the jet) has a trim that depends on the HEIGHT as well as the speed: the stick and the throttle that hold level flight, interpolated in speed at the two heights of `spec.trimAltitudes` that bracket `altitude` and then between them (clamped at the ends). */
export function trimAt(model, V, altitude, key) {
    const alts = model.spec.trimAltitudes, h = Math.min(alts[alts.length - 1], Math.max(alts[0], altitude));
    let i = 1; while (i < alts.length - 1 && h > alts[i]) i++;
    const lo = alts[i - 1], hi = alts[i], u = (h - lo) / (hi - lo), a = lerpTable(trimTable(model, lo), V, key), b = lerpTable(trimTable(model, hi), V, key);
    return a + u * (b - a);
}
const lerpTable = (rows, v, key) => {
    if (!(v > rows[0].v)) return rows[0][key];
    for (let i = 1; i < rows.length; i++) if (v <= rows[i].v) { const u = (v - rows[i - 1].v) / (rows[i].v - rows[i - 1].v); return rows[i - 1][key] + u * (rows[i][key] - rows[i - 1][key]); }
    return rows[rows.length - 1][key];
};
let DEFAULT_MODEL = null;
/** The default airframe's flight model (the TRAINER), built once. */
export const defaultModel = () => DEFAULT_MODEL || (DEFAULT_MODEL = F.createFlightModel());
let JET_MODEL = null;
/** The jet trainer's flight model, built once. */
export const jetModel = () => JET_MODEL || (JET_MODEL = F.createFlightModel(F.JET_TRAINER));

/**
 * Everything the laws use, computed once: the pilot's senses and the intermediate commands. A learned pilot's features are these (brain/pilotFlightPolicy.mjs), so the hand weights and the hand controller read one set of numbers.
 * `target` is { altitude, heading, airspeed }; heading is wrapped, so +-3.5 rad means what it means.
 */
export function guidance(state, target = TARGET_DEFAULT, wind = [0, 0, 0], opts = {}) {
    const g = { ...AUTOPILOT_FLIGHT, ...opts }, model = opts.model || defaultModel(), isa = model.spec.atmosphere === "isa", table = isa ? null : trimTable(model);
    const a = F.attitude(state, wind), r = F.rates(state), V = a.airspeed, climb = state.vel[2];
    const altErr = fin(target.altitude) - a.altitude, headingErr = wrapAngle(fin(target.heading) - a.heading);
    const eas = isa ? V * Math.sqrt(atmosphere(a.altitude).sigma) : V;   // the equivalent airspeed: what the wing feels (the dynamic pressure's speed at sea level)
    const vsLim = g.vsLow ? g.vsMax * clamp((eas - g.vsLow) / (g.vRef - g.vsLow), 0.25, 1) : g.vsMax;   // A JET'S CLIMB RATE ASKED FOR FALLS WITH THE SPEED IT HAS: a 15 m/s climb at 90 m/s is a pull toward the stall; vsLow is the equivalent airspeed under which the limit is a quarter of vsMax (a trainer's gains name none)
    const kHdg = g.tauHeading ? Math.max(20, V) / (G * g.tauHeading) : g.kHdgBank;   // A JET'S HEADING GAIN IS SET BY A TIME CONSTANT, NOT BY A NUMBER: the heading error closes at tauHeading seconds whatever the speed (a turn of g tan(bank) / V needs a bank in proportion to V for that); the trainer's is the fixed 1.1
    const bankMax = g.bankLow ? g.bankLow + (g.maxBank - g.bankLow) * clamp((eas - g.vsLow) / (g.vRef - g.vsLow), 0, 1) : g.maxBank;   // A JET'S BANK LIMIT FALLS WITH THE SPEED TOO: at 90 m/s a 52-degree turn is a pull the wing cannot make inside the angle-of-attack limit (it falls 140 m in a 170-degree turn); bankLow is the limit at vsLow
    const bankCmd = clamp(kHdg * headingErr, -bankMax, bankMax), vsCmd = clamp(g.kAltVs * altErr, -vsLim, vsLim);
    const tilt = clamp(a.bank, -1.2, 1.2);
    return {
        att: a, rates: r, airspeed: V, eas, climb, altErr, headingErr, bankCmd, vsCmd,
        stickTrim: isa ? trimAt(model, V, a.altitude, "pitch") : lerpTable(table, V, "pitch"), thrTrim: isa ? trimAt(model, fin(target.airspeed), a.altitude, "throttle") : lerpTable(table, fin(target.airspeed), "throttle"),
        invCos: clamp(1 / Math.max(0.4, Math.cos(a.bank)) - 1, 0, 1.5), upright: clamp((Math.cos(a.bank) - 0.1) / 0.3, 0, 1),
        climbErr: vsCmd - climb, bankErr: wrapAngle(bankCmd - a.bank),
        turnRate: G * Math.tan(tilt) / Math.max(20, V),
        speedErr: fin(target.airspeed) - V,
    };
}

/** The four controls from a guidance record, by the laws in the header. NaN-safe: a non-finite number is read as 0 by `fin`, so a flight that goes non-finite gets neutral controls and not a NaN back. */
export function lawsFrom(gd, opts = {}) {
    const g = { ...AUTOPILOT_FLIGHT, ...opts }, r = gd.rates;
    const sc = g.vRef ? clamp((g.vRef / Math.max(20, gd.eas)) ** 2, 0.3, 3) : 1;   // GAIN SCHEDULE (a jet's only; the trainer's gains name no vRef): the back-stick a banked wing needs for the same lift falls as the dynamic pressure rises, so it is scheduled on (vRef / the equivalent airspeed)^2
    const lim = g.alphaLimit ? g.kAlpha * Math.max(0, gd.att.alpha + (g.alphaLead || 0) * r.pitch - g.alphaLimit) : 0;   // AN ALPHA LIMITER (a jet's only): a pilot that asks for a 15 m/s climb pulls the stick to the stop, which on a fast wing is a stall -- past alphaLimit radians the stick is taken off by kAlpha per radian
    const pitch = gd.upright * (gd.stickTrim + g.kBankInv * sc * gd.invCos + g.kVsPitch * (g.scheduleClimb ? sc : 1) * gd.climbErr / 5 - lim) - g.kQ * r.pitch;
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
/** The same laws for another airframe: (state, target, wind) -> controls, flying `model` with `gains` over the defaults. */
export const pilotFor = (model, gains = {}) => (state, target, wind) => decide(state, target, wind, { ...gains, model }).controls;
/** THE JET'S PILOT: pilotFor the jet trainer with AUTOPILOT_JET. */
export const jetPilot = (state, target, wind) => decide(state, target, wind, { ...AUTOPILOT_JET, model: jetModel() }).controls;

// ---- the front door ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function reportLines() {
    const m = defaultModel(), t = trimTable(m), s = F.createState({ speed: 45, pitch: t[7].att + 0.05 }), d = decide(s, { altitude: 340, heading: 1.2, airspeed: 45 });
    const jm = jetModel(), jt = trimTable(jm, 1000), jr = F.trim(jm, 140, { altitude: 1000 }), js = F.createState({ pos: [0, 0, 1000], speed: 140, pitch: jr.pitchAttitude, mass: jm.mass, inertia: jm.inertia }), jd = decide(js, { altitude: 1300, heading: 1.2, airspeed: 150 }, [0, 0, 0], { ...AUTOPILOT_JET, model: jm });
    return [
        "[autopilotFlight] altitude, airspeed and heading hold for flightModel6dof's trainer: a cascade of PD laws with no memory",
        `  trim table: ${t.length} speeds, ${t[0].v} m/s stick ${t[0].pitch.toFixed(3)} .. ${t[t.length - 1].v} m/s stick ${t[t.length - 1].pitch.toFixed(3)}`,
        `  asked to climb 40 m and turn 69 degrees right at 45 m/s: bank command ${(d.guidance.bankCmd * 180 / Math.PI).toFixed(1)} deg, climb command ${d.guidance.vsCmd.toFixed(1)} m/s -> pitch ${d.controls.pitch.toFixed(3)} roll ${d.controls.roll.toFixed(3)} yaw ${d.controls.yaw.toFixed(3)} throttle ${d.controls.throttle.toFixed(3)}`,
        `  jet pilot (AUTOPILOT_JET): trim grid ${jt.length} speeds x ${jm.spec.trimAltitudes.length} heights, ${jt[0].v}..${jt[jt.length - 1].v} m/s, ${jm.spec.trimAltitudes[0]}..${jm.spec.trimAltitudes[jm.spec.trimAltitudes.length - 1]} m`,
        `  jet asked to climb 300 m and turn 69 degrees right at 150 m/s from 140 m/s at 1,000 m: bank command ${(jd.guidance.bankCmd * 180 / Math.PI).toFixed(1)} deg, climb command ${jd.guidance.vsCmd.toFixed(1)} m/s -> pitch ${jd.controls.pitch.toFixed(3)} roll ${jd.controls.roll.toFixed(3)} yaw ${jd.controls.yaw.toFixed(3)} throttle ${jd.controls.throttle.toFixed(3)}`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
