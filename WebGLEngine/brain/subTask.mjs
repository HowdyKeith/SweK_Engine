// WebGLEngine/brain/subTask.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE JOB EVERY SUBMARINE PILOT IS GIVEN AND GRADED ON, ONCE: brain/flightTask.mjs for the water. Start somewhere that is not trim, be told a depth, a heading and a speed, and hold them for 60 seconds -- sometimes in a
// current. The PD autopilot (brain/autopilotSub.mjs) and the neural pilot (brain/pilotSubPolicy.mjs, whose hidden layer is a real connectome circuit) both fly THIS, through one function (state, target, current) ->
// { pitch, yaw, thrust, ballast }, so a score means the same thing for both and a trained pilot is trained on the job it is graded on. The vessel is physics/mechanics/subModel6dof.mjs.
//
// SCENARIOS are three kinds, drawn from a seed (deterministic: a kind and a seed always make the same one):
//   nominal   a small disturbance from trim (a few degrees of pitch and bank, a few tenths of a m/s), a new depth within +-12 m, a heading within +-115 degrees, a speed in 1.5..3.5 m/s; still water, a neutral vessel
//   recovery  a large one: up to 30 degrees of pitch, 35 degrees of bank, 0.8..4 m/s, a spin of up to 0.1 rad/s, a vessel up to 0.6% heavier than neutral (a payload, a leak); the same targets; still water
//   current   a nominal start in a steady current of up to 0.5 m/s with eddies of up to 0.15 m/s on each axis (sums of sines, so a seed always runs the same tide) and a vessel up to 0.6% off neutral
//   The pilot is never told the weight error or the current: it feels them as a drift it has to correct.
//
// THE SCORE of a dive is minus the mean per-tick tracking error: min(3, depth error / 5 m) + min(3, heading error / 1 rad) + 0.5 min(3, speed error / 1 m/s), 30 ticks a second for 60 s. A dive that ends early (broaching,
// grounding, the crush depth, a non-finite state) is charged the worst tick, 7.5, for every tick it did not fly -- so ending the dive is never a way to stop being graded. There is no term for effort or smoothness.
//
// THE SETS are disjoint seeds for the three jobs a set has (brain/flightTask.mjs has the argument for each): TRAIN is what a search sees, HELD_OUT picks among candidates, AUDIT is to be read ONCE, for a champion, and
// has NOT been read by anything yet. BASELINE_SET is for comparing pilots no search has touched.
//
// Pure: no DOM, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const DT = S.DT, SECONDS = 60;
export const WORST_TICK = 3 + 3 + 0.5 * 3;   // 7.5: what a tick that was never flown is charged

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const KINDS = Object.freeze(["nominal", "recovery", "current"]);

/** A scenario: { seed, kind, start (createState options), target ({depth, heading, speed}), current (null or { mean, amp, freq, phase }), weightError }. */
export function scenario(seed, kind = "nominal") {
    if (!KINDS.includes(kind)) throw new Error(`subTask.scenario: unknown kind "${kind}" (${KINDS.join(", ")})`);
    const r = mulberry((seed * 7919 + KINDS.indexOf(kind) * 104729 + 29) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const big = kind === "recovery", startDepth = u(18, 38);
    const start = big
        ? { depth: startDepth, speed: u(0.8, 4), pitch: u(-0.5, 0.5), bank: u(-0.6, 0.6), heading: 0, gamma: u(-0.3, 0.3), w: [u(-0.1, 0.1), u(-0.05, 0.05), u(-0.05, 0.05)] }
        : { depth: startDepth, speed: u(1.5, 3.5), pitch: u(-0.08, 0.08), bank: u(-0.12, 0.12) * (kind === "nominal" ? 1 : 0.5), heading: 0, gamma: u(-0.05, 0.05), w: [u(-0.02, 0.02), u(-0.01, 0.01), u(-0.01, 0.01)] };
    const target = { depth: Math.min(40, Math.max(14, startDepth + u(-12, 12))), heading: u(-2.0, 2.0), speed: u(1.5, 3.5) };
    let current = null;
    if (kind === "current") {
        const mean = [u(-0.5, 0.5), u(-0.5, 0.5), u(-0.05, 0.05)], amp = [u(0.05, 0.15), u(0.05, 0.15), u(0.02, 0.06)];
        current = { mean, amp, freq: [[u(0.1, 0.25), u(0.5, 0.9)], [u(0.1, 0.25), u(0.5, 0.9)], [u(0.15, 0.3), u(0.6, 1.0)]], phase: [[u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)]] };
    }
    const weightError = kind === "nominal" ? 0 : u(-0.006, 0.006);
    return Object.freeze({ seed, kind, start: Object.freeze(start), target: Object.freeze(target), current: current && Object.freeze(current), weightError });
}

/** The water's velocity at time t in a scenario's current (still water for a null current). */
export function currentAt(current, t) {
    if (!current) return [0, 0, 0];
    return [0, 1, 2].map((i) => current.mean[i] + current.amp[i] * (0.65 * Math.sin(current.freq[i][0] * t + current.phase[i][0]) + 0.35 * Math.sin(current.freq[i][1] * t + current.phase[i][1])));
}

let MODEL = null;
const defaultModel = () => MODEL || (MODEL = S.createSubModel());

/**
 * Fly one scenario with `pilot` ((state, target, current) -> controls). Returns { score, eDepth, eHdg, eSpd (mean per-tick errors over the ticks flown), status ("submerged" | "broached" | "grounded" | "crushed" | "lost"),
 * ticks (flown), minDepth, maxDepth, final: { depth, hdg, V }, fingerprint }. Deterministic.
 */
export function fly(pilot, sc, { seconds = SECONDS, dt = DT, model = defaultModel() } = {}) {
    let s = S.createState({ ...sc.start, model }), eDepth = 0, eHdg = 0, eSpd = 0, flown = 0, status = "submerged", minDepth = Infinity, maxDepth = -Infinity, h = 0x811c9dc5;
    const total = Math.round(seconds / dt);
    for (let i = 0; i < total; i++) {
        const cv = currentAt(sc.current, i * dt), res = S.stepSub(model, s, pilot(s, sc.target, cv), dt, cv, sc.weightError);
        s = res.state;
        if (res.status !== "submerged") { status = res.status; break; }
        const a = S.attitude(s, cv), he = Math.atan2(Math.sin(sc.target.heading - a.heading), Math.cos(sc.target.heading - a.heading));
        eDepth += Math.min(3, Math.abs(a.depth - sc.target.depth) / 5); eHdg += Math.min(3, Math.abs(he)); eSpd += Math.min(3, Math.abs(a.speed - sc.target.speed));
        if (a.depth < minDepth) minDepth = a.depth; if (a.depth > maxDepth) maxDepth = a.depth; flown++;
        if (i % 30 === 0) for (const c of [s.pos[0], s.pos[1], s.pos[2], s.q[0], s.q[1], s.q[2], s.q[3]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    const f = S.attitude(s);
    const score = -((eDepth + eHdg + 0.5 * eSpd) + WORST_TICK * (total - flown)) / total;
    const m = Math.max(1, flown);
    return { score, eDepth: eDepth / m, eHdg: eHdg / m, eSpd: eSpd / m, status, ticks: flown, minDepth: Number.isFinite(minDepth) ? minDepth : 0, maxDepth: Number.isFinite(maxDepth) ? maxDepth : 0, final: { depth: f.depth, hdg: f.heading, V: f.speed }, seed: sc.seed, kind: sc.kind, fingerprint: (h >>> 0).toString(16) };
}

// ---- the sets ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const WIDE = (kind, ...ranges) => [kind, ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))];
const mk = (spec) => Object.freeze(spec.flatMap(([kind, seeds]) => seeds.map((s) => scenario(s, kind))));
export const TRAIN_SET = mk([WIDE("nominal", [1, 10]), WIDE("recovery", [1, 10], [101, 110]), WIDE("current", [1, 10])]);
export const HELD_OUT_SET = mk([WIDE("nominal", [11, 20]), WIDE("recovery", [11, 20]), WIDE("current", [11, 20])]);
export const AUDIT_SET = mk([WIDE("nominal", [51, 62]), WIDE("recovery", [51, 62]), WIDE("current", [51, 62])]);   // NOT YET READ by any champion
export const BASELINE_SET = mk([WIDE("nominal", [501, 506]), WIDE("recovery", [501, 506]), WIDE("current", [501, 506])]);

/** `pilot` over a set: { score (the mean), runs, crashed (dives that ended early), byKind: { nominal, recovery, current } (mean score each) }. */
export function evaluate(pilot, set, opts = {}) {
    const runs = set.map((sc) => fly(pilot, sc, opts)), n = runs.length, byKind = {};
    for (const k of KINDS) { const rs = runs.filter((r) => r.kind === k); if (rs.length) byKind[k] = rs.reduce((a, r) => a + r.score, 0) / rs.length; }
    return { score: runs.reduce((a, r) => a + r.score, 0) / n, runs, crashed: runs.filter((r) => r.status !== "submerged").length, byKind };
}
/** One line for an evaluate() result. */
export const describeEval = (r) => `${r.score.toFixed(4)} (${KINDS.filter((k) => k in r.byKind).map((k) => `${k} ${r.byKind[k].toFixed(3)}`).join(", ")}; ${r.crashed} ended early)`;
/** Scenario by scenario: how many `r` dove better than `ref` by more than `eps`, how many worse. */
export function versus(r, ref, eps = 0.01) {
    let better = 0, worse = 0; r.runs.forEach((x, i) => { const d = x.score - ref.runs[i].score; if (d > eps) better++; else if (d < -eps) worse++; });
    return { better, worse, same: r.runs.length - better - worse };
}
