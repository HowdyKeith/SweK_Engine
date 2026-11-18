// WebGLEngine/brain/pilotLateness.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "A TANK PILOT TYPE ON THE DEVICE, ONE TICK LATE", PART A, of
// brain/RESERVOIR_GPU_WIP.md, written before this file; the study is tools/ship/latenessStudy.mjs; the gate is brain/pilotLateness-selfcheck.mjs)
//
// A PILOT k TICKS LATE, EXACTLY. A pilot on a device can only return controls computed from an earlier tick's state (the read-back is not synchronous). delayedPilot(inner, k) runs
// `inner` EVERY tick on that tick's state (so a stateful pilot's memory integrates as on time) and RETURNS, at tick n, the controls `inner` computed at tick n - k; for n < k, the PD
// autopilot's controls for tick n -- what a device type flies before its first read lands. A new dive (the target object changes, as the tank's fly type reads it) starts again.
// No clock, no Math.random.
"use strict";
import * as AP from "./autopilotSub.mjs";

/** `inner` delayed by k whole ticks (k = 0: `inner` itself, call for call). `stats` is { ticks, late } for the gate. */
export function delayedPilot(inner, k, { fallback = (s, t, c) => AP.decide(s, t, c) } = {}) {
    if (!Number.isInteger(k) || k < 0) throw new Error(`pilotLateness.delayedPilot: k must be a whole number of ticks, 0 or more; got ${JSON.stringify(k)}`);
    let target = null, n = 0; const buf = [], stats = { ticks: 0, fallback: 0 };
    const pilot = (s, t, c, aux) => {
        if (t !== target) { target = t; n = 0; buf.length = 0; }
        const cmd = inner(s, t, c, aux); stats.ticks++;
        if (k === 0) { n++; return cmd; }
        buf.push(cmd); if (buf.length > k + 1) buf.shift();
        const out = n < k ? (stats.fallback++, fallback(s, t, c)) : buf[0];
        n++; return out;
    };
    pilot.stats = stats;
    return pilot;
}
