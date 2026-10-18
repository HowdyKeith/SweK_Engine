// WebGLEngine/brain/rotorTask.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE JOB EVERY HELICOPTER PILOT IS GIVEN AND GRADED ON, ONCE: start somewhere that is not a hover, be told a point, a height and a heading and hold them for thirty seconds -- sometimes in a wind with gusts, sometimes from a start far from level, and sometimes with the
// ENGINE GONE. The hand pilot (brain/autopilotRotor.mjs), the fruit-fly network (brain/pilotRotorPolicy.mjs) and the GPU network (brain/pilotRotorMlp.mjs) all fly THIS, through one function (state, target, wind) -> { collective, pitch, roll, yaw }, so a score means the same thing for all three
// and a trained pilot is trained on the job it is graded on. (It is brain/flightTask.mjs's shape for the rotorcraft; the discipline is the same and is argued there.)
//
// SCENARIOS are three kinds, drawn from a seed (deterministic: a kind and a seed always make the same one):
//   hover     a small disturbance from a hover at 120 m (a few degrees, a few m/s), a point 30..120 m away, a height within +-25 m, a heading within +-1.5 rad, in a steady wind of up to 8 m/s with gusts of up to 2.5 m/s on each axis (sums of sines, so a seed always blows the same day)
//   recovery  a large one: up to 80 degrees of bank, +-30 of pitch, a spin of up to 1 rad/s, a fall or a climb of up to 12 m/s, a slow rotor; the same targets; still air
//   terrain   a seeded noise ground (25..60 m of relief over 250..450 m wavelengths, flat inside 120 m of the start) with the machine 36 m up near a hover and a point 250..450 m away to be reached with the skids 30 m over the GROUND under them (physics/mechanics/terrain.mjs: the model COLLIDES with the same ground the pilot is handed, as its fourth argument); the score has no heading term
//   engine    the ENGINE OUT, from a height of 45..160 m at 0..25 m/s forward and a heading of 0: the corner of the envelope where the hand pilot's landing is not a given (its dead man's curve starts at about 100 m)
//
// THE SCORE of a hover or recovery flight is minus the mean per-tick tracking error: min(3, distance to the point / 30 m) + min(3, height error / 30 m) + min(3, heading error / 1 rad); 20 ticks a second for 30 s. A flight that ends early (a crash, a non-finite state) is charged the worst tick, 9, for every tick it did not
// fly -- so ending the flight is never a way to stop being graded. (Landed is not an early end for these: the pilot is asked to HOVER; a touchdown is charged like a crash, because it did not hold the point.)
// THE SCORE of an engine flight is minus its cost: a landing the machine walks away from (touchdown 'landed', and 'landed' still eight seconds later) costs 0.4 x sink / 4.5 (a soft landing is nearly free, a landing at the structure's limit costs 0.4), a crash costs 3 + 4 x min(1, sink / 20) -- so the worst landing is better than the best crash,
// and a crash at 8 m/s is worse than one at 5. There is no term for effort or smoothness; the controls are clamped by the model, and a pilot that chatters is graded on where the helicopter goes.
//
// THE SETS are disjoint seeds for the jobs a set has in this tree (brain/flightTask.mjs argues each): TRAIN is what a search sees, HELD_OUT picks the champion among the search's own candidates, AUDIT (the fruit fly's) and AUDIT2 (the GPU network's) are read once each, by a shipped file's `by`, and BASELINE_SET is the reserve for comparing pilots no search has touched; SAFETY_POOL, SAFETY_AUDIT and SAFETY_AUDIT2 are the same story for the TAILS (60 starts each, every kind: a champion must end no flight early that the hand pilot completes).
//
// Pure: no DOM, no clock, no Math.random. The model is physics/mechanics/rotorcraftModel6dof.mjs.
"use strict";
import * as H from "../physics/mechanics/rotorcraftModel6dof.mjs";
import * as AR from "./autopilotRotor.mjs";
import * as TR from "../physics/mechanics/terrain.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const DT = H.DT, SECONDS = 30, TICKS_PER_SCORE = 3;   // the model steps at 60 Hz; the error is read every third tick (20 Hz)
export const WORST_TICK = 3 + 3 + 3;   // 9: what a scoring tick that was never flown is charged
export const KINDS = Object.freeze(["hover", "recovery", "engine", "terrain"]);
const ENGINE_SECONDS = 40, SETTLE_SECONDS = 8;

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A scenario: { seed, kind, start (createState options), target ({ pos, altitude | agl, heading }), wind (null or { mean, amp, freq, phase }), terrain (null: flat ground; or a physics/mechanics/terrain.mjs spec) }. */
export function scenario(seed, kind = "hover") {
    if (!KINDS.includes(kind)) throw new Error(`rotorTask.scenario: unknown kind "${kind}" (${KINDS.join(", ")})`);
    const r = mulberry((seed * 7919 + KINDS.indexOf(kind) * 104729 + 29) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const T = AR.trimOf(AR.defaultModel());
    let start, target, wind = null, terrain = null;
    if (kind === "terrain") {
        const far = u(250, 450), dir = u(-1, 1);
        start = { pos: [0, 0, 36], pitch: T.pitchAttitude + u(-0.05, 0.05), bank: T.bank + u(-0.05, 0.05), heading: u(-0.5, 0.5), velocity: [u(-2, 2), u(-2, 2), u(-1, 1)], w: [u(-0.1, 0.1), u(-0.1, 0.1), u(-0.1, 0.1)] };
        target = { pos: [far * Math.cos(dir), far * Math.sin(dir)], agl: 30 };
        terrain = { kind: "fbm", seed: 100 + seed, amplitude: u(25, 60), wavelength: u(250, 450), octaves: 4, clearing: [0, 0, 120, 400] };
    } else if (kind === "engine") {
        start = { pos: [0, 0, u(45, 160)], velocity: [u(0, 25), 0, 0], pitch: T.pitchAttitude, bank: T.bank, engine: "out" };
        target = { altitude: start.pos[2] };
    } else {
        const big = kind === "recovery", far = u(30, 120), dir = u(-3, 3);
        start = big
            ? { pos: [0, 0, 120], pitch: u(-0.5, 0.5), bank: u(-1.4, 1.4), heading: 0, velocity: [u(-6, 6), u(-6, 6), u(-12, 12)], w: [u(-1, 1), u(-1, 1), u(-1, 1)], omega: u(26, 33) }
            : { pos: [0, 0, 120], pitch: T.pitchAttitude + u(-0.08, 0.08), bank: T.bank + u(-0.1, 0.1), heading: 0, velocity: [u(-2, 2), u(-2, 2), u(-1, 1)], w: [u(-0.15, 0.15), u(-0.15, 0.15), u(-0.1, 0.1)] };
        target = { pos: [far * Math.cos(dir), far * Math.sin(dir)], altitude: 120 + u(-25, 25), heading: u(-1.5, 1.5) };
        if (kind === "hover") {
            const mean = [u(-8, 8), u(-8, 8), u(-0.5, 0.5)], amp = [u(1, 2.5), u(1, 2.5), u(0.3, 1)];
            wind = { mean, amp, freq: [[u(0.4, 0.9), u(1.8, 2.6)], [u(0.3, 0.7), u(1.5, 2.2)], [u(0.8, 1.4), u(2.5, 3.4)]], phase: [[u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)]] };
        }
    }
    return Object.freeze({ seed, kind, start: Object.freeze(start), target: Object.freeze(target), wind: wind && Object.freeze(wind), terrain: terrain && Object.freeze(terrain) });
}

/** The air's velocity at time t in a scenario's wind (still air for a null wind). */
export function windAt(wind, t) {
    if (!wind) return [0, 0, 0];
    return [0, 1, 2].map((i) => wind.mean[i] + wind.amp[i] * (0.65 * Math.sin(wind.freq[i][0] * t + wind.phase[i][0]) + 0.35 * Math.sin(wind.freq[i][1] * t + wind.phase[i][1])));
}

/**
 * Fly one scenario with `pilot` ((state, target, wind) -> controls). Returns { score, status, ticks, ... }: for a hover or a recovery { ePos, eAlt, eHdg } (mean per-scoring-tick errors over the ticks flown) and `status` ("airborne" | "landed" | "crashed" | "lost" -- how the flight ENDED);
 * for an engine flight { sink, touchdown ("landed" | "crashed" | null), why, settled } (how it landed and whether it was still standing eight seconds later). Deterministic.
 */
export function fly(pilot, sc, { model = AR.defaultModel() } = {}) {
    let s = H.createState(model, { ...sc.start }), h = 0x811c9dc5, status = "airborne", why = null, flown = 0;
    const terrain = sc.terrain ? TR.createTerrain(sc.terrain) : TR.FLAT, ctx = { terrain }, skidDrop = AR.trimOf(model).skidDrop;   // the pilot is handed the ground the model collides with, as its fourth argument
    if (sc.kind === "engine") {
        let first = null, tEnd = Infinity;
        const total = Math.round(ENGINE_SECONDS / DT);
        for (let i = 0; i < total; i++) {
            const o = H.stepRotor(model, s, pilot(s, sc.target, [0, 0, 0], ctx), DT, [0, 0, 0], terrain); s = o.state; flown = i + 1;
            if (i % 30 === 0) for (const c of [s.pos[0], s.pos[2], s.q[0], s.q[1], s.q[2], s.q[3]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
            if (!first && o.status !== "airborne") { first = { status: o.status, sink: o.sink || 0, why: o.why || null }; tEnd = i + Math.round(SETTLE_SECONDS / DT); }
            if (o.status === "crashed" || o.status === "lost") { status = o.status; why = o.why || null; break; }
            if (i >= tEnd) break;
        }
        const touchdown = first ? first.status : null, standing = status !== "crashed" && status !== "lost";
        const sink = first ? first.sink : 0, score = first ? (touchdown === "landed" && standing ? -0.4 * Math.min(1, sink / 4.5) : -(3 + 4 * Math.min(1, Math.max(sink, 0) / 20))) : -7;
        return { score, status: first ? (standing ? "landed" : status) : "airborne", touchdown, sink, why: why || (first && first.why), settled: !!first && standing, ticks: flown, seed: sc.seed, kind: sc.kind, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
    }
    const total = Math.round(SECONDS / DT), scoring = Math.floor(total / TICKS_PER_SCORE);
    let ePos = 0, eAlt = 0, eHdg = 0, scored = 0;
    for (let i = 0; i < total; i++) {
        const wv = windAt(sc.wind, i * DT), o = H.stepRotor(model, s, pilot(s, sc.target, wv, ctx), DT, wv, terrain);
        s = o.state;
        if (o.status !== "airborne") { status = o.status; why = o.why || null; break; }
        flown = i + 1;
        if (i % TICKS_PER_SCORE === 0) {
            const a = H.attitude(s, wv), he = sc.target.heading == null ? 0 : Math.atan2(Math.sin(sc.target.heading - a.heading), Math.cos(sc.target.heading - a.heading));
            const alt = sc.target.agl != null ? s.pos[2] - skidDrop - terrain.height(s.pos[0], s.pos[1]) - sc.target.agl : s.pos[2] - sc.target.altitude;   // an `agl` target is the skids' height over the ground the model is stepped over
            ePos += Math.min(3, Math.hypot(s.pos[0] - sc.target.pos[0], s.pos[1] - sc.target.pos[1]) / 30); eAlt += Math.min(3, Math.abs(alt) / 30); eHdg += Math.min(3, Math.abs(he)); scored++;
        }
        if (i % 20 === 0) for (const c of [s.pos[0], s.pos[2], s.q[0], s.q[1], s.q[2], s.q[3]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    const m = Math.max(1, scored), score = -((ePos + eAlt + eHdg) + WORST_TICK * (scoring - scored)) / scoring;
    return { score, ePos: ePos / m, eAlt: eAlt / m, eHdg: eHdg / m, status, why, ticks: flown, seed: sc.seed, kind: sc.kind, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
}

// ---- the sets ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const mk = (spec) => Object.freeze(spec.flatMap(([kind, seeds]) => seeds.map((s) => scenario(s, kind))));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const TRAIN_SET = mk([["hover", range(1, 6)], ["recovery", range(1, 6)], ["engine", range(1, 12)], ["terrain", range(1, 4)]]);
export const HELD_OUT_SET = mk([["hover", range(11, 16)], ["recovery", range(11, 16)], ["engine", range(13, 24)], ["terrain", range(11, 14)]]);
export const AUDIT_SET = mk([["hover", range(21, 28)], ["recovery", range(21, 28)], ["engine", range(25, 44)], ["terrain", range(21, 26)]]);       // the fruit fly's audit: read once, by its champion
export const AUDIT2_SET = mk([["hover", range(31, 38)], ["recovery", range(31, 38)], ["engine", range(45, 64)], ["terrain", range(31, 36)]]);      // the GPU network's audit: its own, so that neither champion is graded on what the other's was
export const BASELINE_SET = mk([["hover", range(501, 504)], ["recovery", range(501, 504)], ["engine", range(501, 508)], ["terrain", range(501, 504)]]);   // the reserve: for comparing pilots no search has touched
// the TAILS: many starts of every kind. A search is only ELIGIBLE to be champion if on SAFETY_POOL_SET it ends no flight early that the hand pilot completes (an average cannot see a tail); the champion's own SAFETY_AUDIT_SET is read once, after.
export const SAFETY_POOL_SET = mk([["hover", range(1001, 1010)], ["recovery", range(1001, 1010)], ["engine", range(1001, 1030)], ["terrain", range(1001, 1010)]]);
export const SAFETY_AUDIT_SET = mk([["hover", range(2001, 2010)], ["recovery", range(2001, 2010)], ["engine", range(2001, 2030)], ["terrain", range(2001, 2010)]]);
export const SAFETY_AUDIT2_SET = mk([["hover", range(3001, 3010)], ["recovery", range(3001, 3010)], ["engine", range(3001, 3030)], ["terrain", range(3001, 3010)]]);

/** `pilot` over a set: { score (the mean), runs, crashed (flights that ended early, or engine flights that did not end standing), byKind: { hover, recovery, engine } (mean score each) }. */
export function evaluate(pilot, set, opts = {}) {
    const runs = set.map((sc) => fly(pilot, sc, opts)), n = runs.length, byKind = {};
    for (const k of KINDS) { const rs = runs.filter((r) => r.kind === k); if (rs.length) byKind[k] = rs.reduce((a, r) => a + r.score, 0) / rs.length; }
    return { score: runs.reduce((a, r) => a + r.score, 0) / n, runs, crashed: runs.filter((r) => (r.kind === "engine" ? !r.settled : r.status !== "airborne")).length, byKind };
}
/** One line for an evaluate() result: the shipped files' `by` quote it and the gates recompute it. */
export const describeEval = (r) => `${r.score.toFixed(4)} (${KINDS.filter((k) => k in r.byKind).map((k) => `${k} ${r.byKind[k].toFixed(3)}`).join(", ")}; ${r.crashed} not standing)`;
/** Scenario by scenario: how many `r` flew better than `ref` by more than `eps`, how many worse. */
export function versus(r, ref, eps = 0.01) {
    let better = 0, worse = 0; r.runs.forEach((x, i) => { const d = x.score - ref.runs[i].score; if (d > eps) better++; else if (d < -eps) worse++; });
    return { better, worse, same: r.runs.length - better - worse };
}
