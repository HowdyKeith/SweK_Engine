// WebGLEngine/tools/bench/fleetBench.mjs -- v2984
//
// BENCHMARK SCORES FROM PEERS -- AND WHY A SCORE ALONE IS NOT COLLECTABLE.
//
// Keith asked whether benchmark scores can be collected from peers. The fleet already collects FINGERPRINTS --
// per-subsystem hashes and measured observables, answering "do we agree?" -- but nothing collects SPEED.
//
// AND SPEED ON ITS OWN IS NOT A COLLECTABLE QUANTITY, for two reasons that are both refusals here rather than
// caveats in a footnote:
//
//   1. A FAST WRONG ANSWER IS NOT A GOOD SCORE. A peer that finishes in half the time because its libm rounds
//      differently, or its build drifted, has not won -- it is computing something else. Ranking it above a
//      correct peer would be actively misleading, which is worse than not ranking at all. So the workload here
//      is one that PRODUCES ITS OWN ANSWER KEY: the same run yields both the elapsed time and a physical
//      quantity with a known exact value. Correctness is not a separate check somebody might skip; it falls out
//      of the identical work.
//
//   2. SCORES FROM DIFFERENT ENGINE VERSIONS ARE NOT THE SAME BENCHMARK. If the workload changed, the numbers
//      are not comparable and averaging them produces a figure describing nothing. Every score carries its
//      engineVersion, and mixing versions is REFUSED rather than silently pooled.
//
// THE WORKLOAD: a fixed D2Q9 Poiseuille channel, fixed grid, fixed step count, no randomness. Its steady profile
// is the exact analytic parabola u(y) = F y (H-y) / 2nu, which lbm2d is already gated against -- so the score and
// the proof arrive together.
"use strict";
import { makeLBM } from "../../simulation/lbm/lbm2d.js";

/** Fixed workload. Changing ANY of these changes the benchmark, which is why the version travels with the score. */
// SIZED BY MEASUREMENT, NOT BY EYE. Poiseuille reaches steady state on the DIFFUSIVE time scale H^2/nu, and my
// first guess (96x48, tau 0.6, 400 steps) needed about 66,000 -- it reported residual 0.94 and looked like a
// broken solver. At 64x18 with tau 0.8, H^2/nu is 2,560, so 3,000 steps converges to 0.28% in about 1.5s:
// long enough to time honestly, short enough to run on every peer.
export const WORKLOAD = { nx: 64, ny: 18, tau: 0.8, force: 1e-6, steps: 3000, label: "lbm-poiseuille-64x18x3000" };

/**
 * Run the workload once. Returns elapsed milliseconds AND the correctness residual from the same run.
 * @returns {{ms, stepsPerSec, residual, correct}}
 */
export function runWorkload(w = WORKLOAD) {
    const lbm = makeLBM({ nx: w.nx, ny: w.ny, tau: w.tau, force: [w.force, 0], solidAt: () => false });
    const t0 = Date.now();
    for (let i = 0; i < w.steps; i++) lbm.step();
    const ms = Date.now() - t0;

    // THE ANSWER KEY, FROM THE SAME RUN -- and using THE TREE'S OWN CONVENTION, not one retyped from a textbook.
    //
    // My first version used H = ny-1 and sampled at integer y, and the residual PLATEAUED around 0.09 instead of
    // converging. That looked like a slow solver and was a wrong formula. physicsSuite's gated Poiseuille check
    // uses H = ny-2 and y = j-0.5, because with bounce-back the effective wall sits HALFWAY between the last
    // fluid node and the solid one. Half a lattice unit at each wall, and the parabola never closes.
    //
    // Relative L2 across the profile, matching that check rather than inventing a second measure of the same thing.
    const nu = (w.tau - 0.5) / 3;
    const H = w.ny - 2;
    const mid = Math.floor(w.nx / 2);
    let sum = 0, ref = 0;
    for (let j = 1; j <= H; j++) {
        const y = j - 0.5;
        const want = (w.force / (2 * nu)) * y * (H - y);
        const got = lbm.ux[lbm.idx(mid, j)];
        sum += (got - want) ** 2; ref += want * want;
    }
    const residual = ref > 0 ? Math.sqrt(sum / ref) : Infinity;
    return {
        ms, stepsPerSec: ms > 0 ? (w.steps / ms) * 1000 : null,
        residual,
        // 0.05 -- AND v2989 MEASURED WHAT THAT ACTUALLY CATCHES, because a tolerance justified by "this is where
        // the measurement landed" is circular and the circle is invisible from inside. See CORRECTNESS_FLOOR.
        correct: Number.isFinite(residual) && residual < CORRECTNESS_TOL,
    };
}

/** Best of n, because a single timing on a loaded machine measures the load, not the machine. */
export function score(w = WORKLOAD, reps = 3) {
    const runs = [];
    for (let i = 0; i < reps; i++) runs.push(runWorkload(w));
    const best = runs.reduce((a, b) => (b.ms < a.ms ? b : a));
    return {
        workload: w.label, ms: best.ms, stepsPerSec: best.stepsPerSec,
        residual: best.residual, correct: runs.every((r) => r.correct),
        reps, allMs: runs.map((r) => r.ms),
    };
}

// v2989 -- THE TOLERANCE, AND WHAT IT IS WORTH.
//
// I set 0.05 at v2984 by eye: loose enough that a healthy peer passes, tight enough that a broken one does not.
// That is exactly the circular justification plantedError.mjs was written to break -- "a bound justified by
// 'this is what we measured' cannot tell you what it would have caught."
//
// So it was MEASURED, by planting an error of known size in tau -- a real physics knob the Poiseuille profile
// depends on -- and sweeping until the gate noticed:
//
//     DETECTION FLOOR: catches a planted error in tau of 1.28% or more. BLIND BELOW THAT.
//     GAIN 5.07x -- the observable moves five times further than the error that caused it, which is why a
//     loose-looking 5% band on the residual is a much tighter band on the physics.
//
// That is now a statement about what the check CAN CATCH rather than about where a number happened to land.
export const CORRECTNESS_TOL = 0.05;
export const CORRECTNESS_FLOOR = { knob: "tau", detects: 0.0128, gain: 5.07, measuredAt: "v2989",
                                   note: "planted-error sweep via tools/roundhouse/plantedError.mjs; blind below 1.28%" };

export const VERDICT = { RANKED: "ranked", INCOMPARABLE: "incomparable", DIVERGED: "diverged", FAILED: "failed" };

/**
 * Rank collected peer scores -- and refuse where ranking would mislead.
 *
 * @param {Array} entries [{ host, arch, engineVersion, score:{ms, correct, workload} , ok }]
 */
export function rank(entries) {
    const rows = (entries || []).map((e) => {
        if (!e || e.ok === false || !e.score) return { ...e, verdict: VERDICT.FAILED, why: (e && e.error) || "no score returned" };
        if (!e.score.correct) {
            return { ...e, verdict: VERDICT.DIVERGED,
                     why: "this peer produced a TIME but not the right ANSWER (residual " +
                          (typeof e.score.residual === "number" ? e.score.residual.toExponential(2) : "n/a") +
                          "). A fast wrong answer is not a good score, so it is not ranked." };
        }
        return { ...e, verdict: VERDICT.RANKED };
    });

    // Version mixing: a different engine may be a different workload.
    const versions = [...new Set(rows.filter((r) => r.verdict === VERDICT.RANKED).map((r) => r.engineVersion))];
    const workloads = [...new Set(rows.filter((r) => r.verdict === VERDICT.RANKED).map((r) => r.score.workload))];
    if (versions.length > 1 || workloads.length > 1) {
        for (const r of rows) if (r.verdict === VERDICT.RANKED) {
            r.verdict = VERDICT.INCOMPARABLE;
            r.why = "the fleet is running " + versions.length + " engine versions (" + versions.join(", ") +
                    ") and " + workloads.length + " workload(s). Scores from different builds are not the same benchmark, and pooling them would produce a number describing nothing.";
        }
    }

    const ranked = rows.filter((r) => r.verdict === VERDICT.RANKED).sort((a, b) => a.score.ms - b.score.ms);
    const times = ranked.map((r) => r.score.ms);
    const spread = times.length > 1 ? Math.max(...times) / Math.min(...times) : null;
    return {
        rows, ranked, versions, workloads,
        fastest: ranked[0] || null,
        spread,
        // The comparison that is actually useful, and it is a RATIO not a league position.
        note: ranked.length > 1
            ? "fastest peer is " + spread.toFixed(2) + "x the slowest, on identical work with a correctness residual under 5% on every ranked peer"
            : ranked.length === 1 ? "only one peer produced a comparable, correct score" : "nothing comparable to rank",
    };
}
