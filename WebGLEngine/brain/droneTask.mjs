// WebGLEngine/brain/droneTask.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE JOB EVERY QUADROTOR PILOT IS GIVEN AND GRADED ON -- the hand pilot (brain/autopilotDrone.mjs), the fruit fly's network (brain/pilotDronePolicy.mjs) and the GPU Brain's (brain/pilotDroneMlp.mjs): fly a scenario with a pilot and say how well it was flown. A score is only worth training on if it means
// what it says (brain/rotorTask-selfcheck.mjs is the helicopter's, and the discipline is the same), and the lessons that task learned the hard way are in this one from the start: the landing is charged its ground speed, the recovery kind has twelve training scenarios and not six (a network overfits six), and the
// audits are disjoint from everything a search sees. FLIGHT ONLY: nothing here aims at anything.
//
// SCENARIOS, four kinds, each a pure function of a seed (a seed and a kind always make the same one, bit for bit):
//   hover     a start 30..50 m up, tilted by up to 0.1 rad and drifting by up to 2 m/s, in a gusty wind (a mean of up to 5 m/s a side with two sinusoidal gusts of 0.5..2 m/s): hold a point 5..25 m away, a height within 8 m of the start's and a heading within 1.5 rad, for 20 s
//   recovery  a start 35..55 m up that is a mess: banked up to 2.2 rad (126 degrees: upside down is not far), pitched 0.8, turning at up to 3 rad/s, falling or rising at up to 8 m/s: get level and hold the same kind of point, height and heading, for 20 s, in still air
//   goto      a start 20..40 m up, near a hover, in a mild wind: fly to a point 40..90 m away at a height of 15..60 m, with a heading within 1.5 rad, and hold it, for 20 s
//   motor     A MOTOR FAILS: the quadrotor is 15..120 m up at 0..8 m/s forward when motor k (0..3) stops, 0.5..2.5 s into the flight; land it. The failure is the quadrotor's corner of the envelope where the hand pilot's landing is not a given (it gives up the yaw and falls out of the sky: brain/autopilotDrone-selfcheck.mjs pins it)
//
// THE SCORE of a hover, recovery or goto flight is minus the mean per-tick tracking error: min(3, distance to the point / 5 m) + min(3, height error / 5 m) + min(3, heading error / 1 rad); 20 ticks a second for 20 s. A flight that ends early (a crash, a touchdown, a non-finite state) is charged the worst tick,
// 9, for every tick it did not fly -- so ending the flight is never a way to stop being graded. (Landed is not an early end for these but it ends the flight: the pilot is asked to HOLD A POINT IN THE AIR, and a touchdown is charged like a crash, because it did not hold it.)
// THE SCORE of a motor flight is minus its cost: a landing the machine walks away from (touchdown 'landed', and 'landed' still four seconds later) costs 0.4 x min(1, sink / 6) + 0.4 x min(5, gs / 5), `gs` the speed over the ground at first contact: a soft, slow landing is nearly free, a landing at the structure's
// sink limit (6 m/s) costs 0.4, and 5 m/s over the ground costs another 0.4, rising to a cap, so that coming down slower is always better and the worst landing (0.4 + 2.0) is still better than the best crash (3); the airframe has no roll-over limit, so the ground-speed term is a CHOSEN stand-in. A crash costs
// 3 + 4 x min(1, speed / 25) of the speed at first contact (a quadrotor that tumbles hits the ground with no sink to speak of and a great speed: the hull strike), a flight that never touches down in its 40 s costs 7. There is no term for effort or smoothness; the controls are clamped by the model.
//
// THE SETS are disjoint seeds for the jobs a set has in this tree (brain/flightTask.mjs argues each): TRAIN is what a search sees, HELD_OUT picks the champion among the search's own candidates, AUDIT (the fruit fly's) and AUDIT2 (the GPU network's) are read once each, by a shipped file's `by`, and BASELINE_SET is
// the reserve for comparing pilots no search has touched; SAFETY_POOL, SAFETY_AUDIT and SAFETY_AUDIT2 are the same story for the TAILS (60 starts each, every kind: a champion must end no flight early that the hand pilot completes).
//
// Pure: no DOM, no clock, no Math.random. The model is physics/mechanics/multirotorModel6dof.mjs.
"use strict";
import * as Q from "../physics/mechanics/multirotorModel6dof.mjs";
import * as AD from "./autopilotDrone.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const DT = Q.DT, SECONDS = 20, TICKS_PER_SCORE = 6;   // the model steps at 120 Hz; the error is read every sixth tick (20 Hz)
export const WORST_TICK = 3 + 3 + 3;   // 9: what a scoring tick that was never flown is charged
export const KINDS = Object.freeze(["hover", "recovery", "motor", "goto"]);
const MOTOR_SECONDS = 40, SETTLE_SECONDS = 4;
/** THE LANDING CHARGE: 0.4 x min(1, sink / SINK_LIMIT) + 0.4 x min(LANDING_GS_CAP, gs / LANDING_GS); and the crash's: 3 + 4 x min(1, speed / CRASH_SCALE). */
export const SINK_LIMIT = 6, LANDING_GS = 5, LANDING_GS_CAP = 5, CRASH_SCALE = 25, NEVER_LANDS = 7;
// A NON-FINITE NUMBER IS CHARGED AS THE WORST OF ITS KIND, NEVER LEFT AS NaN (the first sabotage run found a flight started from a non-finite state -- status "lost" -- scoring NaN, which would poison a mean and every comparison made with it): a speed or sink of NaN or Infinity is read as past the cap
const worst = (v) => (Number.isFinite(v) ? v : Infinity);
export const landingCost = (sink, gs) => 0.4 * Math.min(1, worst(sink) / SINK_LIMIT) + 0.4 * Math.min(LANDING_GS_CAP, worst(gs) / LANDING_GS);
export const crashCost = (speed) => 3 + 4 * Math.min(1, Math.max(worst(speed), 0) / CRASH_SCALE);

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A scenario: { seed, kind, start (createState options), target ({ pos, altitude, heading }), wind (null or { mean, amp, freq, phase }), failure (null, or { motor, at }: motor k stops `at` seconds in) }. */
export function scenario(seed, kind = "hover") {
    if (!KINDS.includes(kind)) throw new Error(`droneTask.scenario: unknown kind "${kind}" (${KINDS.join(", ")})`);
    const r = mulberry((seed * 7919 + KINDS.indexOf(kind) * 104729 + 31) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const gusts = (meanLim, ampLo, ampHi) => {
        const mean = [u(-meanLim, meanLim), u(-meanLim, meanLim), u(-0.3, 0.3)], amp = [u(ampLo, ampHi), u(ampLo, ampHi), u(0.2, 0.6)];
        return { mean, amp, freq: [[u(0.4, 0.9), u(1.8, 2.6)], [u(0.3, 0.7), u(1.5, 2.2)], [u(0.8, 1.4), u(2.5, 3.4)]], phase: [[u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)]] };
    };
    let start, target, wind = null, failure = null;
    if (kind === "motor") {
        const z = u(15, 120);
        start = { pos: [0, 0, z], velocity: [u(0, 8), 0, 0], heading: 0 };
        target = { altitude: z };
        failure = { motor: Math.min(3, Math.floor(u(0, 4))), at: u(0.5, 2.5) };
    } else if (kind === "goto") {
        const far = u(40, 90), dir = u(-3, 3);
        start = { pos: [0, 0, u(20, 40)], pitch: u(-0.05, 0.05), bank: u(-0.05, 0.05), heading: 0, velocity: [u(-1, 1), u(-1, 1), u(-0.5, 0.5)], w: [u(-0.1, 0.1), u(-0.1, 0.1), u(-0.1, 0.1)] };
        target = { pos: [far * Math.cos(dir), far * Math.sin(dir)], altitude: u(15, 60), heading: u(-1.5, 1.5) };
        wind = gusts(4, 0.3, 1);
    } else {
        const big = kind === "recovery", far = big ? u(5, 20) : u(5, 25), dir = u(-3, 3);
        start = big
            ? { pos: [0, 0, u(35, 55)], pitch: u(-0.8, 0.8), bank: u(-2.2, 2.2), heading: 0, velocity: [u(-6, 6), u(-6, 6), u(-8, 8)], w: [u(-3, 3), u(-3, 3), u(-2, 2)] }
            : { pos: [0, 0, u(30, 50)], pitch: u(-0.1, 0.1), bank: u(-0.1, 0.1), heading: 0, velocity: [u(-2, 2), u(-2, 2), u(-1, 1)], w: [u(-0.3, 0.3), u(-0.3, 0.3), u(-0.2, 0.2)] };
        target = { pos: [far * Math.cos(dir), far * Math.sin(dir)], altitude: start.pos[2] + u(-8, 8), heading: u(-1.5, 1.5) };
        if (kind === "hover") wind = gusts(5, 0.5, 2);
    }
    return Object.freeze({ seed, kind, start: Object.freeze(start), target: Object.freeze(target), wind: wind && Object.freeze(wind), failure: failure && Object.freeze(failure) });
}

/** The air's velocity at time t in a scenario's wind (still air for a null wind). */
export function windAt(wind, t) {
    if (!wind) return [0, 0, 0];
    return [0, 1, 2].map((i) => wind.mean[i] + wind.amp[i] * (0.65 * Math.sin(wind.freq[i][0] * t + wind.phase[i][0]) + 0.35 * Math.sin(wind.freq[i][1] * t + wind.phase[i][1])));
}

/**
 * Fly one scenario with `pilot` ((state, target, wind) -> controls). Returns { score, status, ticks, ... }: for a hover, recovery or goto { ePos, eAlt, eHdg } (mean per-scoring-tick errors over the ticks flown) and `status` ("airborne" | "landed" | "crashed" | "lost" -- how the flight ENDED);
 * for a motor flight { sink, gs (the speed over the ground at first contact), speed (the speed there), touchdown ("landed" | "crashed" | null), why, settled } (how it landed and whether it was still standing four seconds later). Deterministic.
 */
export function fly(pilot, sc, { model = AD.defaultModel() } = {}) {
    let s = Q.createState(model, { ...sc.start }), h = 0x811c9dc5, status = "airborne", why = null, flown = 0;
    if (sc.kind === "motor") {
        let first = null, tEnd = Infinity, failed = false;
        const total = Math.round(MOTOR_SECONDS / DT);
        for (let i = 0; i < total; i++) {
            if (!failed && i * DT >= sc.failure.at) { failed = true; s = { ...s, health: s.health.map((x, k) => (k === sc.failure.motor ? 0 : x)) }; }
            const o = Q.stepMultirotor(model, s, pilot(s, sc.target, [0, 0, 0], {}), DT, [0, 0, 0]); s = o.state; flown = i + 1;
            if (i % 40 === 0) for (const c of [s.pos[0], s.pos[2], s.q[0], s.q[1], s.q[2], s.q[3]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
            if (!first && o.status !== "airborne") { first = { status: o.status, sink: o.sink || 0, gs: Math.hypot(s.vel[0], s.vel[1]), speed: Math.hypot(s.vel[0], s.vel[1], s.vel[2]), why: o.why || null }; tEnd = i + Math.round(SETTLE_SECONDS / DT); }
            if (o.status === "crashed" || o.status === "lost") { status = o.status; why = o.why || null; break; }
            if (i >= tEnd) break;
        }
        const touchdown = first ? first.status : null, standing = status !== "crashed" && status !== "lost";
        const sink = first ? first.sink : 0, gs = first ? first.gs : 0, speed = first ? first.speed : 0;
        const score = first ? (touchdown === "landed" && standing ? -landingCost(sink, gs) : -crashCost(speed)) : -NEVER_LANDS;
        return { score, status: first ? (standing ? "landed" : status) : "airborne", touchdown, sink, gs, speed, why: why || (first && first.why), settled: !!first && standing, ticks: flown, seed: sc.seed, kind: sc.kind, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
    }
    const total = Math.round(SECONDS / DT), scoring = Math.floor(total / TICKS_PER_SCORE);
    let ePos = 0, eAlt = 0, eHdg = 0, scored = 0;
    for (let i = 0; i < total; i++) {
        const wv = windAt(sc.wind, i * DT), o = Q.stepMultirotor(model, s, pilot(s, sc.target, wv, {}), DT, wv);
        s = o.state;
        if (o.status !== "airborne") { status = o.status; why = o.why || null; break; }
        flown = i + 1;
        if (i % TICKS_PER_SCORE === 0) {
            const a = Q.attitude(s, wv), he = sc.target.heading == null ? 0 : Math.atan2(Math.sin(sc.target.heading - a.heading), Math.cos(sc.target.heading - a.heading));
            ePos += Math.min(3, Math.hypot(s.pos[0] - sc.target.pos[0], s.pos[1] - sc.target.pos[1]) / 5); eAlt += Math.min(3, Math.abs(s.pos[2] - sc.target.altitude) / 5); eHdg += Math.min(3, Math.abs(he)); scored++;
        }
        if (i % 20 === 0) for (const c of [s.pos[0], s.pos[2], s.q[0], s.q[1], s.q[2], s.q[3]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    const m = Math.max(1, scored), score = -((ePos + eAlt + eHdg) + WORST_TICK * (scoring - scored)) / scoring;
    return { score, ePos: ePos / m, eAlt: eAlt / m, eHdg: eHdg / m, status, why, ticks: flown, seed: sc.seed, kind: sc.kind, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
}

// ---- the sets ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const mk = (spec) => Object.freeze(spec.flatMap(([kind, seeds]) => seeds.map((s) => scenario(s, kind))));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// TRAIN's recovery kind has twelve seeds (1..6 and 61..66): the helicopter's first GPU champion scored better than the hand pilot on the six recovery scenarios it trained on and worse on the ones it had not seen, and the second rule's training set answered with twice the scenarios.
export const TRAIN_SET = mk([["hover", range(1, 6)], ["recovery", [...range(1, 6), ...range(61, 66)]], ["motor", range(1, 12)], ["goto", range(1, 4)]]);
export const HELD_OUT_SET = mk([["hover", range(11, 16)], ["recovery", range(11, 16)], ["motor", range(13, 24)], ["goto", range(11, 14)]]);
export const AUDIT_SET = mk([["hover", range(21, 28)], ["recovery", range(21, 28)], ["motor", range(25, 44)], ["goto", range(21, 26)]]);       // the fruit fly's audit: read once, by its champion
export const AUDIT2_SET = mk([["hover", range(31, 38)], ["recovery", range(31, 38)], ["motor", range(45, 64)], ["goto", range(31, 36)]]);      // the GPU network's audit: its own, so that neither champion is graded on what the other's was
export const BASELINE_SET = mk([["hover", range(501, 504)], ["recovery", range(501, 504)], ["motor", range(501, 508)], ["goto", range(501, 504)]]);   // the reserve: for comparing pilots no search has touched
// the TAILS: many starts of every kind. A search is only ELIGIBLE to be champion if on SAFETY_POOL_SET it ends no flight early that the hand pilot completes (an average cannot see a tail); the champion's own SAFETY_AUDIT_SET is read once, after.
export const SAFETY_POOL_SET = mk([["hover", range(1001, 1010)], ["recovery", range(1001, 1010)], ["motor", range(1001, 1030)], ["goto", range(1001, 1010)]]);
export const SAFETY_AUDIT_SET = mk([["hover", range(2001, 2010)], ["recovery", range(2001, 2010)], ["motor", range(2001, 2030)], ["goto", range(2001, 2010)]]);
export const SAFETY_AUDIT2_SET = mk([["hover", range(3001, 3010)], ["recovery", range(3001, 3010)], ["motor", range(3001, 3030)], ["goto", range(3001, 3010)]]);

/** `pilot` over a set: { score (the mean), runs, crashed (flights that ended early, or motor flights that did not end standing), byKind: { hover, recovery, motor, goto } (mean score each) }. */
export function evaluate(pilot, set, opts = {}) {
    const runs = set.map((sc) => fly(pilot, sc, opts)), n = runs.length, byKind = {};
    for (const k of KINDS) { const rs = runs.filter((r) => r.kind === k); if (rs.length) byKind[k] = rs.reduce((a, r) => a + r.score, 0) / rs.length; }
    return { score: runs.reduce((a, r) => a + r.score, 0) / n, runs, crashed: runs.filter((r) => (r.kind === "motor" ? !r.settled : r.status !== "airborne")).length, byKind };
}
/** One line for an evaluate() result: the shipped files' `by` quote it and the gates recompute it. */
export const describeEval = (r) => `${r.score.toFixed(4)} (${KINDS.filter((k) => k in r.byKind).map((k) => `${k} ${r.byKind[k].toFixed(3)}`).join(", ")}; ${r.crashed} not standing)`;
/** Scenario by scenario: how many `r` flew better than `ref` by more than `eps`, how many worse. */
export function versus(r, ref, eps = 0.01) {
    let better = 0, worse = 0; r.runs.forEach((x, i) => { const d = x.score - ref.runs[i].score; if (d > eps) better++; else if (d < -eps) worse++; });
    return { better, worse, same: r.runs.length - better - worse };
}
