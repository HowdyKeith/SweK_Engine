// WebGLEngine/physics/mechanics/subActuators.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE VESSEL'S MUSCLES HAVE A SPEED LIMIT. physics/mechanics/subModel6dof.mjs applies a pilot's four numbers THE INSTANT THEY ARE SENT: the stern planes jump, the tank fills in no time, the screw changes thrust in one tick.
// None of that is true of a real boat, and a learned pilot is exactly the thing that will lean on it. This module is the missing layer: a SLEW LIMIT on each control, applied between the pilot and the vessel.
//
//   new = old + clamp(command - old, -rate dt, +rate dt)          per control, in the control's own units (the controls run -1..1, so a full swing is 2)
//
// ACTUATORS (round numbers, none fitted): the planes and the rudder 1.0 per second (a full swing in 2 s), the screw 1.5 per second (full ahead to full astern in 1.3 s), the ballast pump 0.15 per second (a full tank swing
// in 13 s -- the slow one, and the one that matters: a pilot that bangs the tank back and forth is getting a tank it does not have). A control that is not a number is read as 0 (a diverged controller must not put NaN into
// the physics), and commands are clamped to [-1, 1] BEFORE the limit.
//
// WHAT IT IS NOT: no dead zone, no backlash, no fin stall dynamics, no motor current limit, no failure. It is the rate limit and nothing else, held to its closed form by physics/mechanics/subActuators-selfcheck.mjs.
// A stateful object per vessel: create one per dive. brain/subTask.mjs fly() takes it as the `actuators` option (the spec, not the object); with the option absent the vessel is the instant one and every earlier pin stands.
// Pure: no DOM, no clock, no random.
"use strict";

export const ACTUATORS = Object.freeze({ pitch: 1.0, yaw: 1.0, thrust: 1.5, ballast: 0.15 });
export const NAMES = Object.freeze(["pitch", "yaw", "thrust", "ballast"]);
/** Rates so large nothing is ever limited: the instant vessel, written as an actuator set (the gate holds it equal to passing none). */
export const INSTANT = Object.freeze({ pitch: Infinity, yaw: Infinity, thrust: Infinity, ballast: Infinity });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (Number.isFinite(v) ? v : 0);

/** A fresh set of actuators at rest (every control at 0). Returns { step(command, dt) -> the controls the vessel receives, state() -> a copy, rates }. */
export function createActuators(rates = ACTUATORS) {
    for (const n of NAMES) if (!(rates[n] > 0)) throw new Error(`subActuators: the rate for "${n}" must be a positive number (got ${rates[n]})`);
    const cur = { pitch: 0, yaw: 0, thrust: 0, ballast: 0 };
    return {
        rates,
        step(command = {}, dt = 1 / 30) {
            for (const n of NAMES) { const want = clamp(num(command[n]), -1, 1), lim = rates[n] * dt; cur[n] += clamp(want - cur[n], -lim, lim); }
            return { ...cur };
        },
        state: () => ({ ...cur }),
    };
}

export function reportLines() {
    return [`[subActuators] slew limits per second: planes ${ACTUATORS.pitch}, rudder ${ACTUATORS.yaw}, screw ${ACTUATORS.thrust}, ballast pump ${ACTUATORS.ballast} (a full tank swing takes ${(2 / ACTUATORS.ballast).toFixed(1)} s)`];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
