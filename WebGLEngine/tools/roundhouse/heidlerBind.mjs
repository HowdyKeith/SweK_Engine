// WebGLEngine/tools/roundhouse/heidlerBind.mjs -- v3193
//
// THE HEIDLER RETURN-STROKE CURRENT AS A GRADED DEVICE.
//
// Three modes, an analytic key for each, and a LOAD-BEARING NEGATIVE that proves the apparatus rather than the
// physics. Nothing is vendored from diluuuu10/triggered-discharge -- it has NO LICENSE FILE, so all rights are
// reserved and only the published physics travelled.
//
//   "peak"   THE CLAIM AND ITS DISAPPOINTMENT. eta exists to make the peak equal i0, and it does not: 1.0667,
//            1.0397, 1.0505 across the three standard parameter sets.
//   "exact"  THE LOAD-BEARING NEGATIVE. Normalise by the shape's TRUE peak instead and peak/i0 is 1.000000.
//            *** IF THIS MODE EVER REPORTED ANYTHING ELSE, THE MEASUREMENT WOULD BE BROKEN RATHER THAN THE
//            FORMULA *** -- which is the only thing that turns the peak mode's 5% into evidence.
//   "limits" THE SHAPE'S OWN ANALYTIC PROPERTIES: zero at t=0, zero as t grows, one maximum, and the peak
//            between t1 and t2. A formula that failed these would not be the Heidler function at all.
//
// *** THE 5% BELONGS TO THE FORMULA, NOT TO ANY CODE, AND THE DEVICE SAYS SO. *** Dividing the true peak by the
// standard eta gives exactly the peak/i0 ratio, so the discrepancy is the published eta's approximation. A
// device reporting "5% error" without that would be blaming an implementation for a reference -- v3164's kh
// verdict arriving in a second place.

import { heidler, shape, etaStandard, truePeak, PARAMS } from "../../physics/discharge/heidler.mjs";

export const HEIDLER_OBSERVABLES = [
    "i0", "t1", "t2", "peakMeasured", "peakOverI0", "peakErrFrac", "tPeak", "setName", "peakOverI0First", "peakOverI0Subsequent", "peakOverI0Fast",
    "etaStandard", "etaTrue", "etaRatio", "atZero", "atFar", "maxima", "tPeakInRange",
];

const DEF = { set: "first" };
export const HEIDLER_MODES = ["peak", "exact", "limits", "noroot"];

export function heidlerDefaults(cfg = {}) {
    const want = cfg && cfg.mode;
    return { mode: HEIDLER_MODES.includes(want) ? want : "peak", set: (cfg && cfg.set) || DEF.set };
}

/** Peak found by scan then bisection -- A PEAK FOUND ON A GRID IS ONLY AS GOOD AS THE GRID. */
function peakOf(i0, t1, t2, eta) {
    let best = 0, tb = 0;
    for (let t = t1 * 1e-3; t < t2 * 20; t *= 1.002) {
        const v = heidler(t, i0, t1, t2, eta);
        if (v > best) { best = v; tb = t; }
    }
    let lo = tb / 1.01, hi = tb * 1.01;
    for (let k = 0; k < 200; k++) {
        const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
        if (heidler(a, i0, t1, t2, eta) < heidler(b, i0, t1, t2, eta)) lo = a; else hi = b;
    }
    const tp = (lo + hi) / 2;
    return { peak: heidler(tp, i0, t1, t2, eta), tPeak: tp };
}

export async function buildHeidler(args = {}) {
    const cfg = args.config || {};
    const setName = PARAMS[cfg && cfg.set] ? cfg.set : DEF.set;
    const { i0, t1, t2 } = PARAMS[setName];
    const mode = args.mode || heidlerDefaults(cfg).mode;
    const es = etaStandard(t1, t2);
    const tp = truePeak(t1, t2);

    const base = { i0, t1, t2, etaStandard: es, etaTrue: tp.peak, etaRatio: tp.peak / es };

    if (mode === "exact") {
        // NORMALISED BY THE TRUE PEAK. The key is EXACTLY 1, and any deviation is the scan or the bisection --
        // never the physics, because dividing a function by its own maximum cannot give anything else.
        const p = peakOf(i0, t1, t2, tp.peak);
        return { ...base, peakMeasured: p.peak, peakOverI0: p.peak / i0, peakErrFrac: Math.abs(p.peak / i0 - 1),
                 tPeak: p.tPeak, atZero: -1, atFar: -1, maxima: -1, tPeakInRange: -1 };
    }

    if (mode === "limits") {
        // The shape's own properties. A formula failing these would not be the Heidler function at all.
        const atZero = shape(0, t1, t2);
        const atFar = shape(t2 * 40, t1, t2);
        // ONE maximum, counted by sign changes of the difference rather than assumed.
        let maxima = 0, prev = shape(t1 * 1e-3, t1, t2), rising = true;
        for (let t = t1 * 1e-3 * 1.002; t < t2 * 20; t *= 1.002) {
            const v = shape(t, t1, t2);
            if (rising && v < prev) { maxima++; rising = false; }
            if (!rising && v > prev) rising = true;
            prev = v;
        }
        return { ...base, peakMeasured: -1, peakOverI0: -1, peakErrFrac: -1, tPeak: tp.tPeak,
                 atZero, atFar, maxima, tPeakInRange: (tp.tPeak > t1 && tp.tPeak < t2) ? 1 : 0 };
    }

    // "peak" -- the claim, graded against its own stated purpose. "noroot" is its plant and shares this whole
    // block, so the two arms differ in ONE thing: which eta the current is normalised by.
    //
    // *** v3902 -- THE PLANT IS THE n-TH ROOT, DROPPED. *** The published normalisation is
    // eta = exp(-(t1/t2) (n t2/t1)^(1/n)), and this module ships the n=2 case as
    // exp(-(t1/t2) sqrt(2 t2/t1)). Transcribing it without the ^(1/n) is the standard slip -- the exponent is
    // easy to read as belonging to the bracket rather than to the whole factor -- and it PRODUCES A NUMBER,
    // not an error: 0.7558505400 becomes 0.1353352832, a factor 0.179.
    //
    // THE SABOTAGE IS IN THE BIND AND NEVER IN THE MODULE BEING GRADED: physics/discharge/heidler.mjs is
    // imported unchanged, and peakOf already takes the eta to normalise by as an argument -- the same
    // mechanism the `exact` control uses to hand it the TRUE peak. One entry point, two uses, opposite
    // directions: the control drives peakErrFrac to 0, the plant drives it away.
    const etaNoRoot = Math.exp(-(t1 / t2) * ((2 * t2) / t1));
    const p = peakOf(i0, t1, t2, mode === "noroot" ? etaNoRoot : null);
    // v3221 -- *** THE DEVICE EMITS ALL THREE PARAMETER SETS, BECAUSE THE CLAIM IS ABOUT ALL THREE. ***
    // This gate's header cites "1.0667, 1.0397, 1.0505 across the three standard parameter sets" as the evidence
    // that the published eta does not make the peak equal i0. The device ran ONE set, so claimTrace could not
    // reproduce the middle value from any declared mode and filed it as an untraceable claim. IT WAS NEVER
    // UNTRACEABLE; IT WAS UNEMITTED. And the spread is the point: one set being 6.7% out could be that set, and
    // three sets each out by a DIFFERENT amount is the approximation itself -- which is exactly what makes this
    // 5% the formula's rather than the code's.
    const allSets = {};
    for (const [name, q] of Object.entries(PARAMS)) {
        const pk = peakOf(q.i0, q.t1, q.t2, etaStandard(q.t1, q.t2));
        allSets[name] = pk.peak / q.i0;
    }
    // *** AND THEY ARE FLAT NUMBERS, NOT A NESTED OBJECT, BECAUSE AN OBSERVABLE IN THIS LAB IS A NUMBER. ***
    // My first version returned peakOverI0BySet as a map and claimTrace still could not see 1.0397: it scans
    // numeric observables, and a value nested inside an object is not one. labResults freezes numbers too, so a
    // map would also have been invisible to the value ratchet -- the SHAPE was wrong, not the content.
    return { ...base, setName,
             peakOverI0First: allSets.first, peakOverI0Subsequent: allSets.subsequent, peakOverI0Fast: allSets.fast,
             peakMeasured: p.peak, peakOverI0: p.peak / i0, peakErrFrac: Math.abs(p.peak / i0 - 1),
             tPeak: p.tPeak, atZero: -1, atFar: -1, maxima: -1, tPeakInRange: -1 };
}

export const heidlerDevice = {
    // v3690 -- *** THIS IS A CONTROL, NOT A PLANT, AND THE DIFFERENCE IS THE WHOLE REASON IT IS DECLARED. ***
    // "exact" normalises by the shape's TRUE peak, and peakErrFrac goes 0.0667 -> 0: it moves the claim TO its
    // ideal. gyroscope's sabotage moves the claim AWAY from its ideal (precessed 1 -> 0). BOTH HEADERS CALL
    // THEIRS "THE LOAD-BEARING NEGATIVE", which is how a control nearly got counted as plant coverage while
    // hunting mode-shaped plants. A control proves the APPARATUS -- it is what lets the peak mode's 5% belong to
    // the published eta rather than to our arithmetic -- and it catches NOTHING, so it is counted apart.
    controlMode: "exact",
    controlPerfects: "peakErrFrac",
    controlIdeal: 0,
    name: "heidler-return-stroke",
    modes: HEIDLER_MODES,
    // *** THIS DEVICE NOW CARRIES BOTH HALVES, WHICH IS THE POINT OF SEPARATING THEM. *** `exact` is the
    // CONTROL -- it drives peakErrFrac to its ideal and catches nothing -- and `noroot` is the PLANT, which
    // drives the same observable away from it. The census counts them apart, and until now this device had
    // only the half that proves the apparatus.
    // v4128 -- RELABELED. plantMode/plantFlips are both declared and plantMode is in this device's own modes
    // list, so plantedCoverage.mjs's declaredPlantMode()/probeModePlant() path takes this device BEFORE the
    // knob path ever runs and grades it as a mode-plant regardless of the label here -- MEASURED, peakErrFrac
    // 0.0667 -> 4.957 under mode "noroot". "knob" was the label for a mechanism this device does not use.
    plantMode: "noroot", plantFlips: "peakErrFrac", plantKind: "mode",
    observables: HEIDLER_OBSERVABLES,
    build: buildHeidler,
    defaults: heidlerDefaults,
};
