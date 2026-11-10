// WebGLEngine/brain/subRighting.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/FISH_RIGHTING_WIP.md, the command tools/ship/takeRighting.mjs, the gate brain/subRighting-selfcheck.mjs)
//
// HOW FAST A SUBMARINE PILOT RIGHTS THE HULL AFTER A KICK IN PITCH, measured and not scored: a dive of brain/subTask.mjs is flown twice with the same pilot, once as it is and once with an instant change of the pitch rate at one tick; the difference of the two pitch traces
// is the kick's own effect, d(t), and what is read from it is
//   AREA    the integral of |d| over the first RIGHT.window (5) seconds after the kick, in rad s (the measure of the registration, Amendment B: smaller is faster; the autopilot has the nose back through zero in about 3.5 s)
//   PEAK    the largest |d| in that window
//   TAIL    the integral over RIGHT.tail (20) seconds, which includes the slow return to depth that follows the righting (printed, not in the verdict)
//   SETTLE  the time after the kick from which |d| stays inside a band to the end of the tail (the tail if it never does) (printed)
// A flight that ends early (crushed, grounded, broached) before the end of the tail is LOST and takes the registered penalty (a pitch error of lostPeak over the window). Then the readings of the registration: a pilot family against the autopilot (FASTER / TIES / SLOWER at 2 se and at a share of the autopilot's area), two families against each other, and the
// bottom line of five sentences. The registration says what the numbers are for and what they are not; this module only computes.
//
// The kick is the arithmetic of tools/subVestibularTasks.mjs's pitchDisturbance (the pitch rate w[1] is changed before the pilot reads the state; +1 is NOSE DOWN in the vessel's convention, pitch positive nose-up), so the tank, when it is given the event, can copy
// `kickState`. The flight is subTask.fly's own loop (S.stepSub), so a flight with no kick IS subTask.fly (the gate holds that on 12 dives).
// Pure: no DOM, no clock, no Math.random, no file.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./subTask.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const RIGHT = Object.freeze({ kickRate: 0.3, kickAt: 20, seconds: 40, window: 5, tail: 20, band: 0.02, lostPeak: 0.5, share: 0.1, z: 2 });

/** The state with the pitch rate changed by `sign` x `rate` (rad/s); sign +1 is nose down. Returns a new state; the argument is not changed. */
export const kickState = (s, sign, rate = RIGHT.kickRate) => ({ ...s, w: [s.w[0], s.w[1] + sign * rate, s.w[2]] });

/**
 * Fly `sc` with `pilot` ((state, target, current) -> controls) as subTask.fly does, recording the pitch of every tick; with `kick` = +1 or -1 the pitch rate is changed at tick round(kickAt / dt), BEFORE the pilot reads the state. A tick not flown (an early end) is NaN in the trace.
 * Returns { pitch (Float64Array, one per tick), status, ticks (flown), score, fingerprint, kickTick }.
 */
export function fly(pilot, sc, { kick = 0, kickAt = RIGHT.kickAt, rate = RIGHT.kickRate, seconds = RIGHT.seconds, dt = T.DT, model = S.createSubModel() } = {}) {
    let s = S.createState({ ...sc.start, model }), eDepth = 0, eHdg = 0, eSpd = 0, flown = 0, status = "submerged", h = 0x811c9dc5;
    const total = Math.round(seconds / dt), kickTick = Math.round(kickAt / dt), pitch = new Float64Array(total).fill(NaN);
    for (let i = 0; i < total; i++) {
        if (kick !== 0 && i === kickTick) s = kickState(s, kick, rate);
        const cv = T.currentAt(sc.current, i * dt), cmd = pilot(s, sc.target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError);
        s = res.state;
        if (res.status !== "submerged") { status = res.status; break; }
        const a = S.attitude(s, cv), he = Math.atan2(Math.sin(sc.target.heading - a.heading), Math.cos(sc.target.heading - a.heading));
        eDepth += Math.min(3, Math.abs(a.depth - sc.target.depth) / 5); eHdg += Math.min(3, Math.abs(he)); eSpd += Math.min(3, Math.abs(a.speed - sc.target.speed));
        pitch[i] = a.pitch; flown++;
        if (i % 30 === 0) for (const c of [s.pos[0], s.pos[1], s.pos[2], s.q[0], s.q[1], s.q[2], s.q[3]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    return { pitch, status, ticks: flown, score: -((eDepth + eHdg + 0.5 * eSpd) + T.WORST_TICK * (total - flown)) / total, fingerprint: (h >>> 0).toString(16), kickTick };
}

/**
 * The measures of one kick: `kicked` and `base` are fly() results of the same pilot and dive. If either did not fly to the end of the TAIL the kick is LOST: { lost: true, area: lostPeak x window, peak: lostPeak, tail: lostPeak x tail, settle: tail }.
 * Else d = kicked.pitch - base.pitch from the kick tick: { lost: false, area (sum |d| x dt over the window), peak (over the window), tail (sum over the tail), settle }.
 */
export function measure(kicked, base, { dt = T.DT, window = RIGHT.window, tail = RIGHT.tail, band = RIGHT.band, lostPeak = RIGHT.lostPeak } = {}) {
    const nw = Math.round(window / dt), nt = Math.round(tail / dt), k0 = kicked.kickTick;
    if (kicked.status !== "submerged" || base.status !== "submerged" || kicked.ticks < k0 + nt || base.ticks < k0 + nt) return { lost: true, area: lostPeak * window, peak: lostPeak, tail: lostPeak * tail, settle: tail };
    let area = 0, peak = 0, tl = 0, last = -1;
    for (let j = 0; j < nt; j++) { const d = Math.abs(kicked.pitch[k0 + j] - base.pitch[k0 + j]); tl += d * dt; if (j < nw) { area += d * dt; if (d > peak) peak = d; } if (d > band) last = j; }
    return { lost: false, area, peak, tail: tl, settle: (last + 1) * dt };
}

// ---- the readings ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
export const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };
/** FASTER / SLOWER / TIES for a gain (positive = faster) with its standard error, against `reference` (the autopilot's mean area): above z se AND at least `share` of the reference. */
export const readingOf = (gain, se, reference, { z = RIGHT.z, share = RIGHT.share } = {}) => (gain >= share * reference && gain > z * se ? "FASTER" : -gain >= share * reference && -gain > z * se ? "SLOWER" : "TIES");

/**
 * A family against the autopilot. `autoAreas` are the autopilot's areas of the kicks (in order); `pilots` is a list of area lists, one per pilot, the same kicks in the same order. A pilot's gain is the autopilot's mean area minus its own; the family's gain is the mean of the pilots' gains and
 * its se is the sd of those gains over the square root of their number (replicates); with ONE pilot the se is that of the paired per-kick differences. Returns { gain, se, reference, reading, gains, n }.
 */
export function familyReading(autoAreas, pilots) {
    const reference = mean(autoAreas);
    if (pilots.length === 1) { const d = autoAreas.map((a, i) => a - pilots[0][i]), g = mean(d), se = sd(d) / Math.sqrt(d.length); return { gain: g, se, reference, reading: readingOf(g, se, reference), gains: [g], n: 1 }; }
    const gains = pilots.map((p) => reference - mean(p)), g = mean(gains), se = sd(gains) / Math.sqrt(gains.length);
    return { gain: g, se, reference, reading: readingOf(g, se, reference), gains, n: pilots.length };
}
/** Two families against each other: `a` and `b` are lists of the pilots' mean areas. diff = mean(b) - mean(a) (positive: a is FASTER), Welch se; reading "A FASTER" / "B FASTER" / "TIES" by the same 2 se and share of `reference`. */
export function pairReading(a, b, reference) {
    const diff = mean(b) - mean(a), se = Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length), r = readingOf(diff, se, reference);
    return { diff, se, reading: r === "FASTER" ? "A FASTER" : r === "SLOWER" ? "B FASTER" : "TIES" };
}
/** The registered bottom line (the first that applies): lost = the flights lost in all arms; real and plain are familyReading results; versus is pairReading(real areas, plain areas). */
export function bottomLine({ lost, real, plain, versus }) {
    if (lost > 0) return "A FLIGHT WAS LOST: THE AREAS ARE READ WITH THE PENALTY";
    if (real.reading === "FASTER" && plain.reading === "FASTER") return versus.reading === "TIES" ? "NETS RIGHT FASTER, AND THE FISH WIRING IS NOT WHAT DID IT" : versus.reading === "A FASTER" ? "BOTH FAMILIES RIGHT FASTER, AND THE FISH-WIRED CIRCUITS BY MORE" : "BOTH FAMILIES RIGHT FASTER, AND THE PLAIN NETS BY MORE";
    if (real.reading === "FASTER" && plain.reading !== "FASTER") return "ONLY THE FISH-WIRED CIRCUITS RIGHT FASTER";
    if (real.reading !== "FASTER" && plain.reading === "FASTER") return "THE PLAIN NETS RIGHT FASTER AND THE FISH CIRCUITS DO NOT";
    return "NEITHER FAMILY RIGHTS FASTER THAN THE AUTOPILOT";
}
