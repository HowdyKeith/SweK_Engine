// tools/roundhouse/kuramotoBind.mjs
//
// v3287 -- SYNCHRONIZATION JOINS THE ROUNDHOUSE.
//
// physics/sync/kuramoto.js was written at v3283 with everything a device needs and was never wired to one. The
// graded-coverage census counts 96 proven physics modules against 34 graded devices, and it declines to pick
// which of the 62 deserve promotion -- correctly, since that is a judgement. This one picks itself, because the
// module already ships the two things this lab grades against:
//
//   exactR(K, gamma)   the closed-form order parameter above the critical coupling, r = sqrt(1 - Kc/K) with
//                      Kc = 2*gamma. A real answer key, not a self-comparison.
//   couplingWRONG      a planted error, already written, so detection power can be shown rather than asserted.
//
// MEASURED BEFORE WIRING, on the module's default sweep:
//     mean |r - exact|  with the correct mean-field coupling : 0.0138
//     mean |r - exact|  with couplingWRONG                   : 0.4057   (29x)
//
// THE SUB-CRITICAL RESIDUAL IS PHYSICS, NOT ERROR, and the grading has to know that. Below Kc the exact answer
// is r = 0, but a FINITE population of N oscillators has r ~ 1/sqrt(N) from random phase alignment alone -- at
// N=4096 that is about 0.016, and the sweep measures 0.022 to 0.039. Grading those points against zero with a
// tight tolerance would fail a correct implementation for being finite. So the graded observable is the
// SUPERCRITICAL branch, and the sub-critical points are reported separately as what they are.

import { rCurve, exactR, measureR, couplingMeanField, couplingWRONG } from "../../physics/sync/kuramoto.js";
import { makePendulumWave, pendulumStep, angleSpread } from "../../physics/pendulumWave.js";

// v3421 -- ONE DEFINITION OF THE MODE LIST, for the same reason it was needed in quantumBind at v3420 and in
// keplerBind this round: `modes:` and a guard elsewhere are two copies and only one ever gets updated.
export const KURAMOTO_MODES = ["curve", "onset", "pendulum"];

export const KURAMOTO_OBSERVABLES = [
    "superErrMean", "superErrWorst", "subcriticalRMean", "finiteSizeFloor",
    "criticalK", "gamma", "N", "points", "onsetDetected",
    "pendulums", "cycleSteps", "spreadStart", "spreadMid", "spreadAtCycle", "resyncRatio", "couplingUsed",
];

const DEF = {
    // v3435 -- DECLARED, NOT ADDED: every key below was ALREADY READ by this bind and ALREADY had this
    // exact fallback. defaults() simply never said so, and strictBuild therefore REJECTED A PARAMETER THAT
    // DEMONSTRABLY WORKS -- blackhole's iscoKm moves 12.40 -> 17.72 when nsMass is set. THE GUARD WAS
    // BLOCKING THE THING IT WAS BUILT TO PROTECT. Declaring costs nothing at run time because the value is
    // the one the code already fell back to; what it buys is that the contract now matches the behaviour.
    pendN: 15,
    cycle: 60,
 gamma: 0.5, N: 4096, seed: 11 };

function buildKuramoto({ mode = "curve", config = {} } = {}) {
    const c = { ...DEF, ...config };

    if (mode === "pendulum") {
        // *** THIS MODE IS HERE TO BE THE OTHER THING. *** Kuramoto synchronises by COUPLING and only above a
        // critical K; a pendulum wave returns to step with NO COUPLING AT ALL, because the periods are chosen
        // commensurate and the arithmetic closes. Both are "synchronisation" in English and they share not one
        // mechanism -- so a device that reported sync here would be reporting it where there is nothing to
        // couple, which is the sharpest negative this device can be handed.
        const N = Math.max(3, Math.min(60, (c.pendN | 0) || 15));
        const cycle = Math.max(5, Math.min(600, (c.cycle | 0) || 60));
        const steps = Math.round(cycle / (1 / 60));           // the wave's own period, in its own timestep
        let st = makePendulumWave({ N, k: 20, cycle, amp: 0.3, dt: 1 / 60 });
        const spreadStart = angleSpread(st);
        let spreadMid = 0;
        for (let i = 1; i <= steps; i++) {
            pendulumStep(st);
            if (i === Math.round(steps / 2)) spreadMid = angleSpread(st);
        }
        const spreadAtCycle = angleSpread(st);
        return {
            pendulums: N, cycleSteps: steps, spreadStart, spreadMid, spreadAtCycle,
            // *** I WROTE "EXACT TO THE LAST BIT" AND THE MEASUREMENT SAID 1.05e-13. *** A first probe printed
            // 0.00000 and that was toFixed(5) rounding, not the answer -- the ninth instance in this project of
            // a formatted number read as a measured one. The residue is round-off accumulated over 3600 steps,
            // not drift, and the honest statement is a RATIO rather than a zero: the spread at the cycle is
            // twelve orders below its own mid-cycle value, so the claim is "returns to step" and not "never
            // left". A CHECK ASSERTING EXACT ZERO WOULD HAVE BEEN A TOLERANCE PRETENDING TO BE A PROOF.
            resyncRatio: spreadMid / (spreadAtCycle || Number.MIN_VALUE),
            couplingUsed: 0,
        };
    }

    const Kc = 2 * c.gamma;
    const coupling = config.planted ? couplingWRONG : couplingMeanField;
    const pts = rCurve({ gamma: c.gamma, N: c.N, seed: c.seed, coupling });

    const superPts = pts.filter((p) => p.K > Kc * 1.05);      // clear of the transition region
    const subPts = pts.filter((p) => p.K < Kc * 0.95);
    const errs = superPts.map((p) => Math.abs(p.r - p.exact));
    const floor = 1 / Math.sqrt(c.N);                          // random-alignment scale for a finite population

    if (mode === "onset") {
        // the transition itself: r must be at the floor below Kc and clearly above it after
        const below = subPts.length ? subPts.reduce((a, p) => a + p.r, 0) / subPts.length : null;
        const above = superPts.length ? superPts[0].r : null;
        return {
            criticalK: Kc, gamma: c.gamma, N: c.N,
            subcriticalRMean: below, finiteSizeFloor: floor,
            onsetDetected: below !== null && above !== null && above > below * 4,
            points: pts.length,
        };
    }
    return {
        superErrMean: errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null,
        superErrWorst: errs.length ? Math.max(...errs) : null,
        subcriticalRMean: subPts.length ? subPts.reduce((a, p) => a + p.r, 0) / subPts.length : null,
        finiteSizeFloor: floor,
        criticalK: Kc, gamma: c.gamma, N: c.N, points: pts.length,
        onsetDetected: null,
    };
}

export const kuramotoDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v3287 -- modes are DECLARED, not left to be probed. modesOf() reports source "exported" for a device that
    // lists its own and "probed" for one that had to be guessed at against CANDIDATE_MODES, and v3191 records
    // what probing costs: lbm came back as a 29-mode device because checkMode answers ok to any string when
    // there is nothing to ask. Declaring is the difference between the census knowing and the census assuming.
    modes: KURAMOTO_MODES,
    name: "kuramoto-synchronization", observables: KURAMOTO_OBSERVABLES, build: buildKuramoto,
    defaults: ({ mode } = {}) => ({ mode: mode || "curve", config: { ...DEF } }),
};
