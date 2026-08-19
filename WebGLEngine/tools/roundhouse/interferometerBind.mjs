// tools/roundhouse/interferometerBind.mjs
//
// v2816 -- roundhouse device: the phase-shifting INTERFEROMETER (physics/optics/interferometer.js). The last of
// the optics instruments to become reachable from the loop.
//
// What makes it a good device is that its answer key is the strictest in the lab: the surface height is
// something we DEFINED, the four-step interferogram is generated from it, and the recovery must come back to
// that height from the FRINGES ALONE. So "did it work" is a residual against a truth we own exactly, and it
// lands around 1e-16 -- floating-point noise, not agreement-within-tolerance.
//
// Modes:
//   "recover"  -- four-step recovery with unwrapping. Observables: rms and max residual against the known
//                 surface, and the peak-to-valley height of that surface (so a claim can be about the recovery
//                 being small RELATIVE to the feature it recovered, not just small).
//   "nounwrap" -- the same recovery with unwrapping OFF. The residual should EXPLODE, because the arctangent
//                 only ever returns a wrapped phase. This is the load-bearing negative as an observable: it
//                 lets a claim be made that unwrapping is doing real work, and refused if it is not.
//   "lambda"   -- sweeps nothing; recovers at a chosen wavelength, so a claim about shorter wavelengths wrapping
//                 more (and therefore needing the unwrap more) can be tested.

import { sampleSurface, fourStep, recoverHeight, scoreRecovery } from "../../physics/optics/interferometer.js";

export const INTERF_OBSERVABLES = ["rmsResidual", "maxResidual", "peakToValley", "relativeRms", "unwrapped", "lambda", "unwrapGain", "aliasHeadroom", "aliasBand", "aliasMaxHeight", "aliasGradientHeadroom", "aliasedNow"];

// Ball shape is {cx, cy, a, s} in GRID units -- amplitude a, gaussian width s -- matching what the
// instrument's own gate uses. The first attempt here invented {x,y,r,h} in normalised units and produced an
// entirely flat surface: every observable came back null rather than wrong, which is its own kind of warning.
const BALLS = [
    { cx: 22, cy: 26, a: 1.4, s: 11 },
    { cx: 42, cy: 34, a: 1.1, s: 9 },
    { cx: 30, cy: 44, a: 0.8, s: 7 },
];
const DEF = { W: 64, H: 64, lambda: 0.55, scale: 1 };

export function interfDefaults(hyp) {
    const h = { mode: "recover", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    // bounded: recovery is O(W*H) with an unwrap pass, and a wild proposal must not pin the builder
    c.W = Math.min(160, Math.max(16, num(c.W, DEF.W) | 0));
    c.H = Math.min(160, Math.max(16, num(c.H, DEF.H) | 0));
    c.lambda = Math.min(20, Math.max(0.05, num(c.lambda, DEF.lambda)));
    h.config = c;
    if (!["recover", "nounwrap", "lambda", "alias", "stepsswapped"].includes(h.mode)) h.mode = "recover";
    return h;
}

function runOnce(c, unwrap, swapSteps = false) {
    const truth = sampleSurface(BALLS, c.W, c.H, c.scale);
    const frames = fourStep(truth, c.lambda);
    // *** v3761 -- THE PLANT, AND IT SITS IN THE SETUP RATHER THAN THE READBACK (v3725's distinction: setup
    // means the solver was handed the WRONG WORLD; readback means the bind LIES about a correct result).
    // fourStep captures at 0, pi/2, pi, 3pi/2 and phaseShiftRecover reads atan2(I3-I1, I0-I2). SWAPPING THE
    // pi/2 AND 3pi/2 CAPTURES CONJUGATES THE PHASE -- the recovered surface comes back NEGATED. THIS IS A REAL
    // LAB MISTAKE: recording the phase steps out of order, which nothing downstream can detect from the frames
    // themselves because all four are perfectly valid interferograms. ***
    const used = swapSteps ? [frames[0], frames[3], frames[2], frames[1]] : frames;
    const rec = recoverHeight(used, c.lambda, c.W, c.H, unwrap);
    const sc = scoreRecovery(rec, truth);
    let mn = Infinity, mx = -Infinity;
    for (const v of truth) { if (v < mn) mn = v; if (v > mx) mx = v; }
    return { sc, ptv: mx - mn };
}

/**
 * *** v3758 -- THE KEY THIS DEVICE DID NOT HAVE, AND THE ROUND THAT FOUND IT STARTED BY FALSIFYING TWO
 * HYPOTHESES. The shipped observables are a MIRROR: runOnce passes the SAME c.lambda to fourStep and to
 * recoverHeight, so a wrong wavelength cancels -- rmsResidual reads 9.25e-17 at lambda 0.55, 9.25e-17 at 1.1
 * and 9.39e-17 at 2.2, machine zero across a factor of four. And peakToValley is read from `truth`, so it is a
 * property of the FIXTURE and cannot move whatever the recovery does. ***
 *
 * *** WITHOUT UNWRAPPING THERE IS A SHARP ALIASING ONSET, AND IT IS AN EXTERNAL KEY: the four-step phase is
 * wrapped into (-pi, pi], and h = lambda*phi/(4*pi), SO THE UNAMBIGUOUS BAND IS h IN (-lambda/4, lambda/4].
 * A surface sitting on a zero background aliases the moment ITS MAXIMUM crosses lambda/4. MEASURED by
 * bisection at three wavelengths: max(h)/(lambda/4) = 1.00000, 1.00000, 1.00000. ***
 *
 * TWO WRONG VARIABLES WERE RULED OUT FIRST, AND BOTH WOULD HAVE SHIPPED A PLAUSIBLE KEY:
 *   - PEAK-TO-VALLEY. The onset in ptv/lambda reads 0.22891, 0.23550, 0.24033 at lambda 0.55 / 0.8 / 1.2 --
 *     IT DRIFTS, because the surface does not touch zero and ptv is not the distance from the wrap centre.
 *     A bracket typed around 0.229 would have looked like a constant and been a fixture artefact.
 *   - THE LOCAL PHASE GRADIENT (a Nyquist limit of pi between adjacent pixels, giving a step of lambda/4).
 *     FALSIFIED: at the onset the largest adjacent-pixel height step is 0.00246 against a predicted 0.1375,
 *     OFF BY A FACTOR OF FIFTY-SIX. The surface is smooth on a 64-grid, so neighbouring phases never approach
 *     pi apart; the wrap here is GLOBAL, not local.
 */
export function aliasOnset(c) {
    const truth = sampleSurface(BALLS, c.W, c.H, c.scale);
    let mn = Infinity, mx = -Infinity, maxStep = 0;
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
        const i = y * c.W + x, v = truth[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
        if (x + 1 < c.W) maxStep = Math.max(maxStep, Math.abs(truth[i + 1] - v));
        if (y + 1 < c.H) maxStep = Math.max(maxStep, Math.abs(truth[i + c.W] - v));
    }
    const band = c.lambda / 4;
    return { maxHeight: mx, minHeight: mn, band, headroom: mx / band, maxLocalStep: maxStep,
             gradientHeadroom: maxStep / band };
}

export async function buildInterferometer(hyp, base = {}) {
    const h = interfDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    // *** v3758 -- "alias" RUNS WITHOUT UNWRAPPING, and my first version did not: it inherited unwrap=true and
    // reported aliasedNow=false at a headroom of 1.71, WHICH IS THE MODE DEFEATING THE THING IT MEASURES.
    // Caught because the numbers disagreed with the prediction, not because anything failed. ***
    const unwrap = h.mode !== "nounwrap" && h.mode !== "alias";
    const { sc, ptv } = runOnce(c, unwrap, h.mode === "stepsswapped");
    const rms = sc.rms, max = sc.peak;
    const out = {
        rmsResidual: rms,
        maxResidual: max,
        peakToValley: ptv,
        relativeRms: ptv > 0 ? rms / ptv : undefined,
        unwrapped: unwrap,
        lambda: c.lambda,
    };
    if (h.mode === "alias") {
        // *** THE OBSERVABLE IS THE RATIO, NOT THE HEIGHT. A ratio is the same number at every wavelength, so a
        // claim about it is a claim about the METHOD rather than about this fixture at this lambda. ***
        const a = aliasOnset(c);
        out.aliasHeadroom = a.headroom;              // 1 exactly at the onset
        out.aliasBand = a.band;                      // lambda/4
        out.aliasMaxHeight = a.maxHeight;
        out.aliasGradientHeadroom = a.gradientHeadroom;   // the falsified variable, REPORTED so it stays falsified
        out.aliasedNow = rms > 1e-9;
    }
    if (h.mode === "recover") {
        // measure what unwrapping is worth, so a claim can be made about it rather than assumed
        const off = runOnce(c, false);
        out.unwrapGain = (off.sc.rms > 0 && rms > 0) ? off.sc.rms / rms : undefined;
    }
    return out;
}

export const interferometerDevice = {
    // v3191 -- EXPORTED so nothing has to GUESS. A probed mode count is a LOWER BOUND: you can only ask
    // about a mode you already thought of, and these names were in nobody's candidate list, so this
    // device reported as having NO DISCOVERABLE MODES. Derived from this file's own default plus every
    // mode its own build() branches on, each verified to produce a DISTINCT answer first.
    modes: ["recover", "nounwrap", "lambda", "alias", "stepsswapped"],
    // v3761 -- the mode plant. rmsResidual IS reported by the primary mode, which the MODE-PLANT CONTRACT
    // requires: an observable living only in the plant's branch reads DECLARED BUT DEAD.
    plantMode: "stepsswapped", plantFlips: "rmsResidual", plantKind: "mode",
    name: "phase-shifting-interferometer", observables: INTERF_OBSERVABLES, build: buildInterferometer, defaults: interfDefaults };
