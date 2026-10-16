// WebGLEngine/brain/flightTask.mjs -- v4867, TRAIN_WIDE_SET v4868
//
// THE JOB EVERY REAL-FLIGHT PILOT IS GIVEN AND GRADED ON, ONCE: start somewhere that is not trim, be told an altitude, a heading and an airspeed, and hold them for 40 seconds -- sometimes in a steady wind with gusts. The PD autopilot
// (brain/autopilotFlight.mjs), the fruit-fly network (brain/pilotFlightPolicy.mjs) and the GPU network all fly THIS, through one function (state, target, wind) -> { pitch, roll, yaw, throttle }, so a score means the same thing for
// all three and a trained pilot is trained on the job it is graded on.
//
// SCENARIOS are three kinds, drawn from a seed (deterministic, and a kind and a seed always make the same one):
//   nominal   a small disturbance from trim (a few degrees of bank and pitch, a few m/s of speed), a new altitude within +-80 m, a heading within +-115 degrees, a speed in 41..49 m/s; still air
//   recovery  a large one: up to 70 degrees of bank, +-25 degrees of pitch, 33..56 m/s, a spin of up to 0.8 rad/s; the same targets; still air
//   gusty     a nominal start in a steady wind of up to 9 m/s with gusts of up to 3 m/s on each axis (sums of sines, so a seed always blows the same day)
//
// THE SCORE of a flight is minus the mean per-tick tracking error: min(3, altitude error / 50 m) + min(3, heading error / 1 rad) + 0.5 min(3, airspeed error / 10 m/s), 30 ticks a second for 40 s. A flight that ends early (a crash, a
// touchdown, a non-finite state) is charged the worst tick, 7.5, for every tick it did not fly -- so ending the flight is never a way to stop being graded, and a crash is minus 7.5 at the worst and worse the sooner it comes.
// There is no term for effort or smoothness; the controls are clamped by the flight model, and a pilot that chatters is graded on where the aircraft goes.
//
// THE THREE SETS are disjoint seeds for the three jobs a set has in this tree (brain/pilotAircraftPolicy.mjs has the argument for each): TRAIN is what a search sees (TRAIN_WIDE_SET, forty; TRAIN_SET, twelve, is the pinned baseline's), HELD_OUT picks the champion among the search's own
// candidates, and AUDIT is read once, by the shipped file's `by`. A fourth, BASELINE_SET, is for comparing pilots that no search has touched.
//
// Pure: no DOM, no clock, no Math.random. The flight model is physics/mechanics/flightModel6dof.mjs.
"use strict";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const DT = 1 / 30, SECONDS = 40;
export const WORST_TICK = 3 + 3 + 0.5 * 3;   // 7.5: what a tick that was never flown is charged

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const KINDS = Object.freeze(["nominal", "recovery", "gusty"]);

/** A scenario: { seed, kind, start (createState options), target ({altitude, heading, airspeed}), wind (null or { mean, amp, freq, phase }) }. */
export function scenario(seed, kind = "nominal") {
    if (!KINDS.includes(kind)) throw new Error(`flightTask.scenario: unknown kind "${kind}" (${KINDS.join(", ")})`);
    const r = mulberry((seed * 7919 + KINDS.indexOf(kind) * 104729 + 13) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const big = kind === "recovery", k = big ? 1 : 0.3;
    const start = big
        ? { speed: u(33, 56), pitch: u(-0.45, 0.45), bank: u(-1.2, 1.2), heading: 0, gamma: u(-0.3, 0.3), w: [u(-0.8, 0.8), u(-0.4, 0.4), u(-0.4, 0.4)] }
        : { speed: u(40, 50), pitch: u(-0.08, 0.12), bank: u(-0.45, 0.45) * (kind === "nominal" ? 1 : 0.5), heading: 0, gamma: u(-0.05, 0.05), w: [u(-0.2, 0.2), u(-0.1, 0.1), u(-0.1, 0.1)] };
    const target = { altitude: 300 + u(-80, 80), heading: u(-2.0, 2.0), airspeed: u(41, 49) };
    let wind = null;
    if (kind === "gusty") {
        const mean = [u(-9, 9), u(-9, 9), u(-1, 1)], amp = [u(1.5, 3), u(1.5, 3), u(0.5, 1.5)];
        wind = { mean, amp, freq: [[u(0.4, 0.9), u(1.8, 2.6)], [u(0.3, 0.7), u(1.5, 2.2)], [u(0.8, 1.4), u(2.5, 3.4)]], phase: [[u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)], [u(0, 6.28), u(0, 6.28)]] };
    }
    void k;
    return Object.freeze({ seed, kind, start: Object.freeze(start), target: Object.freeze(target), wind: wind && Object.freeze(wind) });
}

/** The air's velocity at time t in a scenario's wind (still air for a null wind). */
export function windAt(wind, t) {
    if (!wind) return [0, 0, 0];
    return [0, 1, 2].map((i) => wind.mean[i] + wind.amp[i] * (0.65 * Math.sin(wind.freq[i][0] * t + wind.phase[i][0]) + 0.35 * Math.sin(wind.freq[i][1] * t + wind.phase[i][1])));
}

let MODEL = null;
const defaultModel = () => MODEL || (MODEL = F.createFlightModel());

/**
 * Fly one scenario with `pilot` ((state, target, wind) -> controls). Returns { score, eAlt, eHdg, eSpd (mean per-tick errors over the ticks flown), status ("airborne" | "touchdown" | "crashed" | "lost"), ticks (flown),
 * minV, maxAlpha (radians), final: { alt, hdg, V }, fingerprint }. Deterministic.
 */
export function fly(pilot, sc, { seconds = SECONDS, dt = DT, model = defaultModel() } = {}) {
    let s = F.createState({ pos: [0, 0, 300], ...sc.start, mass: model.mass, inertia: model.inertia }), eAlt = 0, eHdg = 0, eSpd = 0, flown = 0, status = "airborne", minV = Infinity, maxAlpha = 0, h = 0x811c9dc5;
    const total = Math.round(seconds / dt);
    for (let i = 0; i < total; i++) {
        const wv = windAt(sc.wind, i * dt), res = F.stepFlight(model, s, pilot(s, sc.target, wv), dt, wv);
        s = res.state;
        if (res.status !== "airborne") { status = res.status; break; }
        const a = F.attitude(s, wv), he = Math.atan2(Math.sin(sc.target.heading - a.heading), Math.cos(sc.target.heading - a.heading));
        eAlt += Math.min(3, Math.abs(a.altitude - sc.target.altitude) / 50); eHdg += Math.min(3, Math.abs(he)); eSpd += Math.min(3, Math.abs(a.airspeed - sc.target.airspeed) / 10);
        if (a.airspeed < minV) minV = a.airspeed; if (a.alpha > maxAlpha) maxAlpha = a.alpha; flown++;
        if (i % 30 === 0) for (const c of [s.pos[0], s.pos[2], s.q[0], s.q[1], s.q[2], s.q[3]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    const f = F.attitude(s);
    const score = -((eAlt + eHdg + 0.5 * eSpd) + WORST_TICK * (total - flown)) / total;
    const m = Math.max(1, flown);
    return { score, eAlt: eAlt / m, eHdg: eHdg / m, eSpd: eSpd / m, status, ticks: flown, minV: Number.isFinite(minV) ? minV : 0, maxAlpha, final: { alt: f.altitude, hdg: f.heading, V: f.airspeed }, seed: sc.seed, kind: sc.kind, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
}

// ---- the sets ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const mk = (spec) => Object.freeze(spec.flatMap(([kind, seeds]) => seeds.map((s) => scenario(s, kind))));
export const TRAIN_SET = mk([["nominal", [1, 2, 3, 4]], ["recovery", [1, 2, 3, 4]], ["gusty", [1, 2, 3, 4]]]);
// *** THE SEARCHES TRAIN ON TRAIN_WIDE_SET, THE CHAMPION IS PICKED ON HELD_OUT_WIDE_SET AMONG SEARCHES THE SAFETY POOL ALLOWS, AND THE VERDICT IS READ ON AUDIT3_SET AND SAFETY_AUDIT_SET -- AND WHY THERE ARE SO MANY SETS. *** v4868, in order:
//   1. Four searches of 1,500 iterations on the 12 scenarios of TRAIN_SET took the train score from -0.453 to between -0.223 and -0.260 and the held-out score from -0.503 to -0.367, -0.793, -1.334 and -1.480: three of four had
//      learned the twelve and crashed on scenarios they had not met. The same searches on 30 scenarios (seeds 1..10 of each kind) held out at -0.313..-0.364 after 750 iterations, none crashing.
//   2. The first real run on those 30 (4 searches x 1000 iterations, seeds 6000..6003) picked a champion that beat the autopilot on the held-out scenarios (-0.257 against -0.503) and flew 17 of the 18 AUDIT_SET scenarios better
//      (-0.271 against -0.417) -- and failed the reserve: on BASELINE_SET recovery scenario 503 (35 m/s, nose down 14 degrees, banked 41 degrees, asked to climb 67 m) it pulled into a deep stall (angle of attack 40 degrees, down to
//      16.7 m/s, minus 3.08 against the autopilot's minus 0.56). Nothing in its 10 recovery scenarios was like that start. Nothing was shipped. The response was COVERAGE, not a looser rule: 20 recovery scenarios in TRAIN_WIDE_SET
//      (seeds 1..10 and 101..110), 10 nominal, 10 gusty, and a champion picked on 30 held-out scenarios (HELD_OUT_WIDE_SET) instead of 12.
//   3. The second real run (the same 4 searches on the 40) held out at -0.279..-0.300 (the autopilot's -0.485); its champion, seed 6003, flew 35 of the 36 AUDIT2_SET scenarios better and none worse (-0.208 against -0.362)
//      and the reserve better in every kind -- and tripped a rule: one stall brush in the audit and the reserve against the autopilot's none. FLYING IT ON THE SPENT AUDIT_SET SHOWED WHY THE RULE EXISTED: recovery 25 took it to 21
//      degrees of angle of attack and ended the flight early (-5.69 against -0.39). Then 300 recovery starts nothing had flown (seeds 1000..1299) showed what the RULE had got wrong: THE AUTOPILOT ITSELF BRUSHES THE STALL IN 55 OF 300
//      RECOVERY STARTS (18%), ends 2 of them early, and goes past the wing's full-stall angle (23 degrees) in 16 -- it simply happened to do none of that in the 54 flights of the audit and the reserve, so one flight decided the
//      verdict. The four searches on those 300: seed 6003 ends 4 early, 6001 ends 3, 6000 and 6002 end none; deep stalls 15, 18, 20, 15; brushes 62, 77, 82, 54. A tail has to be measured on a tail-sized sample, and a count
//      of 54 flights cannot do that.
//   4. THE RESPONSE THIS TIME IS A SAMPLE THE SIZE OF THE QUESTION, AND A CHANGED RULE, MADE BEFORE ANY OF THE NEW SETS WAS READ: SAFETY_POOL_SET (500 starts: 300 recovery, 100 nominal, 100 gusty, seeds 1000..1299 / 1000..1099)
//      is what the trainer picks the champion with -- a search is ELIGIBLE only if it ends no flight early that the autopilot completes and its deep stalls and brushes are not more than the autopilot's by more than two
//      standard errors of a count -- and SAFETY_AUDIT_SET (500 more, seeds 2000..) and AUDIT3_SET (36 scenarios, seeds 51..62) are read ONCE, for the champion, by qualifies().
//   5. SPENT AS EVIDENCE FOR A TRAINED PILOT, AND KEPT FOR WHAT THEY WERE: AUDIT_SET (seeds 21..26, read for the first champion), AUDIT2_SET (31..42, read for the second) and BASELINE_SET (501..506, whose recovery 503 exposed
//      the first champion; it stays a regression guard in the trainer) -- and SAFETY_POOL_SET, which picks the champion and so cannot also judge it. The autopilot's pinned numbers on them are unchanged.
const WIDE = (kind, ...ranges) => [kind, ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))];
export const TRAIN_WIDE_SET = mk([WIDE("nominal", [1, 10]), WIDE("recovery", [1, 10], [101, 110]), WIDE("gusty", [1, 10])]);
export const HELD_OUT_WIDE_SET = mk([WIDE("nominal", [11, 20]), WIDE("recovery", [11, 20]), WIDE("gusty", [11, 20])]);
export const AUDIT2_SET = mk([WIDE("nominal", [31, 42]), WIDE("recovery", [31, 42]), WIDE("gusty", [31, 42])]);   // SPENT (see 5 above)
export const AUDIT3_SET = mk([WIDE("nominal", [51, 62]), WIDE("recovery", [51, 62]), WIDE("gusty", [51, 62])]);
export const SAFETY_POOL_SET = mk([WIDE("nominal", [1000, 1099]), WIDE("recovery", [1000, 1299]), WIDE("gusty", [1000, 1099])]);
export const SAFETY_AUDIT_SET = mk([WIDE("nominal", [2000, 2099]), WIDE("recovery", [2000, 2299]), WIDE("gusty", [2000, 2099])]);
export const HELD_OUT_SET = mk([["nominal", [11, 12, 13, 14]], ["recovery", [11, 12, 13, 14]], ["gusty", [11, 12, 13, 14]]]);
export const AUDIT_SET = mk([["nominal", [21, 22, 23, 24, 25, 26]], ["recovery", [21, 22, 23, 24, 25, 26]], ["gusty", [21, 22, 23, 24, 25, 26]]]);
export const BASELINE_SET = mk([["nominal", [501, 502, 503, 504, 505, 506]], ["recovery", [501, 502, 503, 504, 505, 506]], ["gusty", [501, 502, 503, 504, 505, 506]]]);

/** `pilot` over a set: { score (the mean), runs, crashed (flights that ended early), byKind: { nominal, recovery, gusty } (mean score each) }. */
export function evaluate(pilot, set, opts = {}) {
    const runs = set.map((sc) => fly(pilot, sc, opts)), n = runs.length, byKind = {};
    for (const k of KINDS) { const rs = runs.filter((r) => r.kind === k); if (rs.length) byKind[k] = rs.reduce((a, r) => a + r.score, 0) / rs.length; }
    return { score: runs.reduce((a, r) => a + r.score, 0) / n, runs, crashed: runs.filter((r) => r.status !== "airborne").length, byKind };
}
/** One line for an evaluate() result: the shipped files' `by` quote it and the gates recompute it. */
export const describeEval = (r) => `${r.score.toFixed(4)} (${KINDS.filter((k) => k in r.byKind).map((k) => `${k} ${r.byKind[k].toFixed(3)}`).join(", ")}; ${r.crashed} ended early)`;
/** Scenario by scenario: how many `r` flew better than `ref` by more than `eps`, how many worse. */
export function versus(r, ref, eps = 0.01) {
    let better = 0, worse = 0; r.runs.forEach((x, i) => { const d = x.score - ref.runs[i].score; if (d > eps) better++; else if (d < -eps) worse++; });
    return { better, worse, same: r.runs.length - better - worse };
}
