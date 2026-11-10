// WebGLEngine/brain/pilotLeakyHeading.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/pilotLeakyHeading-selfcheck.mjs; the backlog entry is `leaky-unit-baseline` of brain/BACKLOG_2026-11-04_BRAINS.md on the switchboard branch)
//
// THE CHEAPEST MEMORY, AS A FLYING-LAYER ARM FOR THE COMPASS DROPOUT. Rung 4a (brain/RUNG_4A_CLOSEOUT.md, brain/SUBMARINE_WIP.md "RUNG 4a VERSION 2 RESULT") measured that ONE LEAKY UNIT fed the vessel's heading rate integrates the heading through a compass dropout
// (skill 0.89 to 0.92 on the three audits, `LEAKY1`: sigma 0.9999) where no reservoir of any wiring does (best family means 0.12 to 0.35). That unit lived in tools/subHeadingEstimator.mjs as an ESTIMATOR to be scored against a regression target; this file
// is the same unit as a PILOT: the PD autopilot behind it, flown through the dropout, and as a KIND the Sub Aquarium's tank can seat. Nothing is trained: the unit has two numbers and they are the registered ones.
//
//   THE UNIT      g' = sigma^(dt/DT) g + gain * clamp(heading rate, +-RATE_CLAMP) * dt        (dt is the length of THIS tick; DT = 1/30 s is the simulator's, at which the leak is exactly sigma per tick)
//                 the heading rate is tools/subNavigator.mjs headingRate(): exact kinematics from the body rates and the attitude, which the dropout does not touch.
//   THE ESTIMATE  on a valid tick the pilot is handed the world as it came and the reading is HELD; on a dark tick the world is turned (tools/subDropout.mjs turnWorld) by g - held, so the autopilot reads the held heading plus what the unit has
//                 integrated since. A dive that starts dark holds its first reading (estimate 0 on that tick). The unit restarts from zero when the target OBJECT changes (a new dive, as tools/subDropout.mjs and tools/subNavigator.mjs recognise one) --
//                 *** BUT ONLY ON A VALID TICK: a target that changes while the compass is dark waits for the next valid tick to restart the unit. *** (Found by measuring: the first version restarted at once, and in the tank, which retargets every 20 to 45 s, a
//                 window that a retarget fell into lost everything integrated since the compass went out -- an estimate 0.77 rad off for the rest of that window on one of six ids, rms 0.2 against 0.03 on the others. The registered unit never met it: a
//                 dive of brain/subTask.mjs has one target and tools/subDropout.mjs never lets one start dark.)
//   THE WEIGHTS   [sigma, gain] = [0.9999, 1]: sigma in [0, 1] (a time constant of DT / (1 - sigma) = 333 s at 0.9999, longer than a dive), gain in [0, 4] (1 is the unit that integrates; 0 is NO MEMORY, which flies the dropout autopilot exactly; the
//                 gate holds both). Two weights: the arm in the switchboard is a kind of circuit "leaky" with weightCount 2.
//
// *** WHAT IT IS, SAID PLAINLY ***
//   * At sigma 0.9999 and gain 1 it is a dead-reckoning navigator that LEAKS. tools/subNavigator.mjs integrates the same exact heading rate by the trapezoid rule and holds it to 0.0003 to 0.0012 rad rms over a dark window; this unit integrates by the Riemann sum and
//     its leak (0.3 percent a second) acts on the WHOLE reading it holds as well as on the window's own integral, so over a 16 s window it loses up to 5 percent of the angle the sub had turned since its last restart: MEASURED IN THE TANK (six ids, 160 s, the
//     tank's own dropout) its estimate is off by 0.028 to 0.040 rad rms and 0.06 to 0.11 at worst, thirty to fifty times the navigator's, which is the size of the registered unit's 0.024 on the 60 s dives. It still flies like the navigator (twelve ids, sb-1..12: the settled
//     dark heading error to the wandering target 0.647 rad, the navigator's 0.644, the dropout autopilot's 0.702; paired against the navigator +0.003, largest +0.014 on one id; sixty ids, sb-9001..9060: +0.0026, se 0.0014). *** BUT THAT METRIC DOES NOT SEPARATE A MEMORY FROM NONE IN THE TANK: the navigator itself, the ceiling, TIES the dropout autopilot (-0.058 rad, se 0.044 on the twelve ids; -0.017, se 0.020 on the sixty),
//     and so does this unit (-0.055, se 0.042; -0.014, se 0.021): the tank's sub turns at about 0.06 rad/s, a half turn onto a new target takes 40 s and the metric is read 12 s after a retarget, so it measures how fast a pilot turns far more than what it knows of its heading (brain/TANK_PILOTS_WIP.md said so of the dropout in the tank). What does separate them is the heading ESTIMATE in the dark (above). ***
//     So the arm says what a MEMORY of the heading does when it is handed a perfect gyro; it does not say anything about how a brain would build that memory. It is a CEILING, as the navigator is: the simulator's body rates are exact and a real gyro drifts.
//   * It is a CONTROL, not a brain. The question the switchboard asks of the fly's stateful pilot is whether it beats this unit in the dark; rung 4a said it does not.
//   * It is the registered unit WRITTEN IN SECONDS. tools/subHeadingEstimator.mjs steps the unit once per call (a tick, whatever its length); the tank clips its last tick to the frame, and a page steps it at frame times, so a per-call unit would integrate the rate
//     per call and not per second. At dt = DT the two are the same number (the gate flies both on real dropout dives and holds the commands equal); at any other dt this one is right and that one is not.
//   * Not offered on the wire (ai-bridge/subAquariumCore.js knows "gfc" and "flycx" only); it is flown by a page or a board that registers the kind in its own tank. No shared file is edited.
//
// THE ARM: `leakyArm()` is the object brain/switchboard.mjs (the other branch) takes with `board.addArm`: { id, layer: "flying", controls, note, entry() -> { pilot, circuit, weights }, register(tank) }. `register` calls `tank.registerPilotKind("leaky", leakyKind())`;
// the board calls it on each fresh tank before `sync`. This file does not import the board. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AS from "./autopilotSub.mjs";
import { headingRate } from "../tools/subNavigator.mjs";
import { turnWorld } from "../tools/subDropout.mjs";

export const CIRCUIT = "leaky";
export const LABEL = "one leaky unit (the cheapest memory)";
export const WEIGHT_COUNT = 2;
export const DEFAULTS = Object.freeze({ sigma: 0.9999, gain: 1 });
export const LIMITS = Object.freeze({ sigmaMin: 0, sigmaMax: 1, gainMin: 0, gainMax: 4 });
/** The registered unit's input was rate / 0.2 clamped to +-15 (tools/subHeadingEstimator.mjs sensesInto): the rate is clamped to +-3 rad/s here. */
export const RATE_CLAMP = 3;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** { sigma, gain } from a weight list or an object, or a thrown error naming the fault: finite numbers, sigma in [0, 1], gain in [0, 4]; a list is exactly WEIGHT_COUNT long. */
export function checkWeights(w) {
    const list = Array.isArray(w) || ArrayBuffer.isView(w) ? Array.from(w) : w && typeof w === "object" ? [w.sigma, w.gain] : null;
    if (!list || list.length !== WEIGHT_COUNT) throw new Error(`pilotLeakyHeading.checkWeights: the leaky unit takes exactly ${WEIGHT_COUNT} weights [sigma, gain], got ${list ? list.length : JSON.stringify(w)}`);
    const [sigma, gain] = list;
    if (!Number.isFinite(sigma) || sigma < LIMITS.sigmaMin || sigma > LIMITS.sigmaMax) throw new Error(`pilotLeakyHeading.checkWeights: sigma must be a number in [${LIMITS.sigmaMin}, ${LIMITS.sigmaMax}], got ${JSON.stringify(sigma)}`);
    if (!Number.isFinite(gain) || gain < LIMITS.gainMin || gain > LIMITS.gainMax) throw new Error(`pilotLeakyHeading.checkWeights: gain must be a number in [${LIMITS.gainMin}, ${LIMITS.gainMax}], got ${JSON.stringify(gain)}`);
    return { sigma, gain };
}

/**
 * `inner` ((state, target, current, aux) -> controls) behind the leaky unit. `opts`: { sigma, gain (the weights), dt (the tick when the caller gives none, default the simulator's) }. A caller whose ticks differ passes `aux.dt` (seconds, above 0) on each call, as the
 * tank does on its compass events. `aux.compassValid === 0` is a dark tick; anything else is valid. Exposes `last` ({ estimate, reading }) for the gate: the estimate is 0 on a valid tick.
 */
export function leakyHeading(inner, opts = {}) {
    const { sigma, gain } = checkWeights([opts.sigma ?? DEFAULTS.sigma, opts.gain ?? DEFAULTS.gain]), dt0 = opts.dt ?? S.DT;
    let target = null, g = 0, held, started = false;   // held has no value before the first reading; started is set once, at the first call
    const wrapped = (state, tgt, current, aux) => {
        const dt = aux && aux.dt > 0 ? aux.dt : dt0, valid = !(aux && aux.compassValid === 0);
        if (tgt !== target && (valid || target === null)) { target = tgt; g = 0; }   // a new dive; on a DARK tick the restart waits for the next valid one (the tank retargets every 20 to 45 s and a window is 16 s: a restart inside a window would lose what the unit has integrated since the compass went out)
        g = Math.pow(sigma, dt / S.DT) * g + gain * clamp(headingRate(state), -RATE_CLAMP, RATE_CLAMP) * dt;
        if (valid || !started) { held = g; started = true; if (valid) { wrapped.last = { estimate: 0, reading: g }; return inner(state, tgt, current, aux); } }
        const est = g - held; wrapped.last = { estimate: est, reading: g };
        const seen = turnWorld(state, current, est);
        return inner(seen.state, tgt, seen.current, aux);
    };
    wrapped.last = { estimate: 0, reading: 0 };
    return wrapped;
}

/**
 * The kind of sub the tank can seat for circuit "leaky" (the shape of render/subAquariumFlyCx.mjs): { circuit, label, weightCount: 2, persist: true, build(weights, ctx) -> pilot(state, target, current, aux) }. The pilot is the PD autopilot behind the unit.
 * Like the stateful fly's kind it is handed ONE target object per dive, rewritten each tick from the three fields the autopilot reads (depth, heading, speed) and replaced when the sub's WANDERING TARGET changes (`ctx.sub.target`): the tank hands a fresh
 * target object every tick outside the steering box, and the unit restarts when it sees a new one. *** SAID PLAINLY: in the tank the unit restarts at every new wandering target (20 to 45 s), as the stateful fly's memory does. ***
 */
export function leakyKind() {
    return Object.freeze({
        circuit: CIRCUIT, label: LABEL, weightCount: WEIGHT_COUNT, persist: true,
        build(weights, ctx = {}) {
            const w = checkWeights(weights), sub = ctx.sub || null, inner = leakyHeading(AS.pilot(), w); let dive = null, tgt = null;
            const pilot = (state, t, current, aux) => {
                const wander = sub ? sub.target : t;
                if (tgt === null || wander !== dive) { dive = wander; tgt = {}; }
                tgt.depth = t.depth; tgt.heading = t.heading; tgt.speed = t.speed;
                return inner(state, tgt, current, aux);
            };
            Object.defineProperty(pilot, "last", { get: () => inner.last });   // the unit's reading and estimate on the last tick, for the gate and for a page that wants to draw it
            return pilot;
        },
    });
}

/** The tank entry for the arm: { pilot: "leaky", circuit: "leaky", weights: [sigma, gain] } (a fresh array each call; the board spreads it into the tank's list). */
export function leakyEntry(weights = DEFAULTS) {
    const w = checkWeights(weights);
    return { pilot: "leaky", circuit: CIRCUIT, weights: [w.sigma, w.gain] };
}

/**
 * The switchboard arm of the cheapest memory: { id, layer: "flying", controls: ["autopilot"], note, entry(), register(tank) }. `opts`: { id, weights ([sigma, gain] or { sigma, gain }), controls (arm ids it must beat, default the autopilot) }.
 * The no-memory lesion is the same arm with gain 0 (`leakyArm({ id: "leaky-unit-off", weights: [0.9999, 0], controls: [] })`): it flies the dropout autopilot exactly.
 */
export function leakyArm({ id = "leaky-unit", weights = DEFAULTS, controls = ["autopilot"] } = {}) {
    const w = checkWeights(weights);
    if (typeof id !== "string" || !id) throw new Error("pilotLeakyHeading.leakyArm: an arm needs an id");
    if (!Array.isArray(controls) || !controls.every((c) => typeof c === "string" && c)) throw new Error("pilotLeakyHeading.leakyArm: controls is a list of arm ids");
    return Object.freeze({
        id, layer: "flying", controls: Object.freeze([...controls]),
        note: `one leaky unit (sigma ${w.sigma}, gain ${w.gain}) fed the exact heading rate, behind the PD autopilot: the cheapest memory, a ceiling with a perfect gyro (rung 4a: skill 0.89 to 0.92)`,
        entry: () => leakyEntry(w),
        register: (tank) => tank.registerPilotKind(CIRCUIT, leakyKind()),
    });
}
