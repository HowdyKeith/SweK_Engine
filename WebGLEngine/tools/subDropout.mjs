// WebGLEngine/tools/subDropout.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/subDropout-selfcheck.mjs)
//
// A COMPASS THAT STOPS REPORTING, around ANY pilot ((state, target, current) -> controls) and any scenario of brain/subTask.mjs. tools/subDisturb.mjs gives the pilot noisy senses and a late link; it never takes a sense away. Here the HEADING is
// taken away in windows: for `seconds` at a time, twice a dive by default, the heading the pilot is shown stays at the last value it had while the compass was valid, while the body rates, the depth, the pitch, the bank and the speed stay true.
//
// HOW THE STALE HEADING IS MADE: the pilot is handed a ROTATED COPY OF THE WORLD -- the orientation, the velocity and the water's current turned about the vertical by the difference between the held heading and the true one -- so the heading it reads
// is the held one, and every body-frame quantity it reads (sideslip, angle of attack, speed through the water, pitch, bank) is exactly as true as before. The body rates are in the body frame and are not touched.
// WINDOWS: `windows` of equal length `seconds`, placed one in each of `windows` equal slots between `startAfter` seconds and one second before the end of a `totalSeconds` dive, the start of each drawn from the dive's own generator.
// A NEW DIVE is recognised as tools/subDisturb.mjs does it, by the scenario's target object changing, and the generator is seeded from the dive's number and `seed`, so a dive is exactly repeatable and a wrapped autopilot and a wrapped
// learned pilot meet the same windows in the same dives. The pilot is told whether the compass is valid by a FOURTH ARGUMENT, `{ compassValid: 1 | 0 }`, which a pilot that does not take it ignores (the autopilot, the stateless pilots).
// WHAT IT IS NOT: a model of a real compass failure (a real one drifts, jumps and returns wrong); it is the simplest honest version of "the heading stops being true", and nothing here claims more.
// The default task (two windows of 16 s in a 60 s dive) was fixed by measuring the AUTOPILOT ALONE before any circuit was trained: brain/SUBMARINE_WIP.md, "Rung 4a -- the task's validity check". Pure: no I/O, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";

export const TICKS_PER_SECOND = 30;
export const DEFAULTS = Object.freeze({ windows: 2, seconds: 16, startAfter: 5, totalSeconds: 60 });

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const rotZ = (v, th) => [Math.cos(th) * v[0] - Math.sin(th) * v[1], Math.sin(th) * v[0] + Math.cos(th) * v[1], v[2]];

/** The windows of one dive as [firstTick, endTick) pairs, in time order, drawn from the generator `r`: `windows` slots between startAfter and one second before totalSeconds, one window of `seconds` in each. Refuses windows that do not fit. */
export function windowsOf(r, { windows = DEFAULTS.windows, seconds = DEFAULTS.seconds, startAfter = DEFAULTS.startAfter, totalSeconds = DEFAULTS.totalSeconds } = {}) {
    if (!(Number.isInteger(windows) && windows >= 0)) throw new Error(`subDropout.windowsOf: windows must be a whole number of 0 or more, got ${windows}`);
    if (!(seconds > 0)) throw new Error(`subDropout.windowsOf: seconds must be above 0, got ${seconds}`);
    const len = Math.round(seconds * TICKS_PER_SECOND), lo = Math.round(startAfter * TICKS_PER_SECOND), hi = Math.round((totalSeconds - 1) * TICKS_PER_SECOND), out = [];
    if (lo < 1) throw new Error(`subDropout.windowsOf: startAfter must leave at least one valid tick (the held heading is the last valid one), got ${startAfter} s`);
    const slot = (hi - lo) / windows;
    if (slot < len) throw new Error(`subDropout.windowsOf: ${windows} windows of ${seconds} s do not fit between ${startAfter} s and ${totalSeconds - 1} s`);
    for (let i = 0; i < windows; i++) { const start = Math.floor(lo + i * slot + r() * (slot - len)); out.push([start, start + len]); }
    return out;
}

/** The state and the current as a pilot would see them if the heading read `delta` radians more than it does: both turned about the vertical (the orientation by the quaternion for that turn, the velocity and the current as vectors). Body rates and depth are untouched. */
export function turnWorld(state, current, delta) {
    const qz = [Math.cos(-delta / 2), 0, 0, Math.sin(-delta / 2)];
    return { state: { ...state, q: qmul(qz, state.q), vel: rotZ(state.vel, -delta) }, current: rotZ(current, -delta) };
}

/**
 * `pilot` wrapped so that its heading goes stale in windows. Returns a pilot (state, target, current) -> controls; it calls the inner pilot as (state, target, current, { compassValid }). `windows: 0` is the pilot told the compass is valid, always.
 * Exposes `log` (the wrapper's record of the dive in progress: { windows, valid[] }) for the gate and for anyone who wants to know which ticks were dark.
 */
export function dropout(pilot, opts = {}, seed = 1) {
    const cfg = { ...DEFAULTS, ...opts }; let target = null, r = null, dive = 0, tick = 0, wins = [], held = 0;
    const wrapped = (state, tgt, current) => {
        if (tgt !== target) { target = tgt; r = mulberry((seed * 2654435761 + ++dive * 40503) >>> 0); tick = 0; wins = windowsOf(r, cfg); wrapped.log = { windows: wins, valid: [] }; }
        const i = tick++, dark = wins.some(([a, b]) => i >= a && i < b), psi = S.attitude(state).heading;
        wrapped.log.valid.push(dark ? 0 : 1);
        if (!dark) { held = psi; return pilot(state, tgt, current, { compassValid: 1 }); }
        const seen = turnWorld(state, current, held - psi);
        return pilot(seen.state, tgt, seen.current, { compassValid: 0 });
    };
    wrapped.log = { windows: [], valid: [] };
    return wrapped;
}
