// WebGLEngine/tools/subNavigator.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/subNavigator-selfcheck.mjs)
//
// A DEAD-RECKONING NAVIGATOR AROUND ANY PILOT: the REFERENCE ARM of rung 4a (brain/SUBMARINE_WIP.md, "the REFERENCE ARM", registered before this file was written). While tools/subDropout.mjs lets the compass lie, this wrapper keeps an
// estimate of the true heading by integrating the vessel's own heading rate, and turns the world the pilot is handed so that it reads the ESTIMATE instead of the held value: `dropout(navigator(pilot))`. No weights, no training, no memory beyond the estimate.
//
// THE HEADING RATE is exact kinematics, computed from the senses that stay true in a dropout (the body rates and the orientation's pitch and bank): for the nose direction f and the angular velocity omega, both in the world frame,
//     d(heading)/dt = -(omega_z - f_z (f . omega)) / (f_x^2 + f_y^2)          (heading = atan2(-f_y, f_x), as brain/autopilotSub.mjs and physics/mechanics/subModel6dof.mjs have it)
// Turning the world about the vertical changes neither omega_z, f_z, f . omega nor f_x^2 + f_y^2, so the rate read from the dropout's rotated copy of the world is the true rate. Integrated by the trapezoid rule over the 30 Hz ticks from the last valid tick.
// On real flown dives the estimate stays within 2.4e-3 rad of the true heading over a whole 60 s dive.
// WHAT IT READS: the state and the current it is handed, and the fourth argument { compassValid }; a pilot is told the compass is valid on every tick the dropout says so, and then the wrapper is a pass-through that remembers the true heading and rate. A NEW DIVE is
// recognised by the scenario's target object changing (as tools/subDropout.mjs and tools/subDisturb.mjs do). It has no knowledge of the windows.
// WHAT IT IS NOT: a model of a real navigator. The simulator's body rates are exact, so this is a CEILING for dead reckoning with a perfect gyro; a real gyro drifts. And it is not a pilot: it only changes the heading the inner pilot reads.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { rotateByQuat } from "../physics/mechanics/rigidBody6dof.mjs";
import { turnWorld } from "./subDropout.mjs";

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** The rate of change of the heading (rad/s) of a vessel state, from its body rates and its orientation. 0 for a vessel pointing straight up or down (the heading is undefined there). */
export function headingRate(state) {
    const f = rotateByQuat(state.q, [1, 0, 0]), om = rotateByQuat(state.q, state.w), h2 = f[0] * f[0] + f[1] * f[1];
    if (!(h2 > 1e-12)) return 0;
    return -(om[2] - f[2] * (f[0] * om[0] + f[1] * om[1] + f[2] * om[2])) / h2;
}

/** `inner` ((state, target, current, aux) -> controls) behind a dead-reckoning navigator. `opts.dt` is the tick (default the simulator's). Exposes `last` ({ estimate, shown, rate }) for the gate. */
export function navigator(inner, opts = {}) {
    const dt = opts.dt ?? S.DT; let target = null, est = 0, lastRate = 0, started = false;
    const wrapped = (state, tgt, current, aux = null) => {
        if (tgt !== target) { target = tgt; started = false; }
        const rate = headingRate(state), shown = S.attitude(state).heading, valid = !(aux && aux.compassValid === 0);
        if (valid || !started) { est = shown; lastRate = rate; started = true; wrapped.last = { estimate: est, shown, rate }; return inner(state, tgt, current, aux); }
        est += 0.5 * (lastRate + rate) * dt; lastRate = rate;
        wrapped.last = { estimate: est, shown, rate };
        const seen = turnWorld(state, current, wrap(est - shown));
        return inner(seen.state, tgt, seen.current, aux);
    };
    wrapped.last = { estimate: 0, shown: 0, rate: 0 };
    return wrapped;
}
