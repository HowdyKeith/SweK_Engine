// tools/roundhouse/bornBind.mjs
//
// v2818 -- roundhouse device: the BORN APPROXIMATION (simulation/em/born.js). The unusual one, and worth having
// precisely because of what it measures.
//
// Every other device asks "is this simulation right". This one asks "WHERE DOES THIS APPROXIMATION STOP BEING
// TRUSTWORTHY" -- and it can answer, because the 1D slab has a closed-form exact solution to compare against.
// The observable is a BOUNDARY, not a value.
//
// THE ANSWER KEY: the first Born approximation drops the scattered field's effect on itself, so its error grows
// with the phase the wave accumulates crossing the object. Expanding the exact slab against the Born one, the
// leading error term goes as phase^2 / 2 -- so the largest phase you can accept for a given tolerance is
// sqrt(2 * tol). born.js states that as maxPhaseFor(tol), and this device MEASURES it: sweep the phase upward,
// find where bornError first crosses the tolerance, and compare that crossing to the closed form.
//
// This matters beyond optics: ct.js's straight-ray reconstruction is only valid inside the same bound, which is
// why straightRayValidPhase() there calls maxPhaseFor(). A claim about CT validity is really a claim about this.
//
// Modes:
//   "validity" -- sweep phase, find the measured crossing for a chosen tolerance, compare to sqrt(2 tol).
//   "error"    -- Born vs exact at one configuration: the transmitted amplitudes and the fractional error.
//   "scaling"  -- is the error really quadratic in phase? Measures the log-log slope, which must be ~2. A first
//                 order approximation whose error scaled linearly would be a different approximation.

// *** v3716 -- THE PLANT: DROP THE HALF FROM THE BORN PHASE. bornSlab's imaginary part is k*delta*d/2, and the
// half is sqrt(1+delta) - 1 ~ delta/2, the first-order expansion of the refractive index. Setting n = 1 + delta
// instead of n = sqrt(1 + delta) gives k*delta*d and DOUBLES the approximated phase. It is dimensionally
// correct and it is the slip this file's own header already warns about in a different context.
//
// *** THE KEY WAS WRITTEN YEARS BEFORE ANY PLANT EXISTED, AND IT CATCHES THIS QUALITATIVELY RATHER THAN
// NUMERICALLY. The scaling mode's comment says "a first order approximation whose error scaled linearly would
// be a different approximation" -- and that is EXACTLY what the plant produces. The honest error is
// |e^{i phi} - (1 + i phi)| ~ phi^2/2, quadratic; the planted one is |e^{i phi} - (1 + 2 i phi)| ~ phi, LINEAR.
// MEASURED: errorScalingExponent 2.0073 -> 1.0574, and errFrac at the default geometry 1.985e-3 -> 6.321e-2,
// thirty-two times worse. A CHANGED EXPONENT IS A CHANGED KIND OF APPROXIMATION, not a changed number. ***
import { phaseShift, exactSlab, bornSlab, bornError, maxPhaseFor, BORN_CONTRAST_HALF } from "../../simulation/em/born.js";

export const BORN_OBSERVABLES = [
    "phase", "exactAmp", "bornAmp", "errFrac",
    "tolerance", "phaseLimitMeasured", "phaseLimitTheory", "phaseLimitErrFrac",
    "errorScalingExponent", "delta", "k", "d",
];

const DEF = { delta: 0.02, k: 2 * Math.PI, d: 1, tol: 0.05 };

export function bornDefaults(hyp) {
    const h = { mode: "validity", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.delta = Math.min(2, Math.max(1e-6, num(c.delta, DEF.delta)));      // refractive contrast
    c.k = Math.min(1e3, Math.max(1e-3, num(c.k, DEF.k)));
    c.d = Math.min(1e3, Math.max(1e-3, num(c.d, DEF.d)));
    c.tol = Math.min(0.5, Math.max(1e-4, num(c.tol, DEF.tol)));
    h.config = c;
    if (!["validity", "error", "scaling"].includes(h.mode)) h.mode = "validity";
    return h;
}

/** 0.5 is sqrt(1+delta)-1 to first order; 1 is the planted slip. Read from config so ALL THREE modes share it. */
function halfFor(c) { return c && c.planted ? 1 : BORN_CONTRAST_HALF; }

export async function buildBorn(hyp, base = {}) {
    const h = bornDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const half = halfFor(c);

    if (h.mode === "error") {
        const ph = phaseShift(c.delta, c.k, c.d);
        return {
            phase: ph,
            exactAmp: exactSlab(c.delta, c.k, c.d),
            bornAmp: bornSlab(c.delta, c.k, c.d, half),
            errFrac: bornError(c.delta, c.k, c.d, half),
            delta: c.delta, k: c.k, d: c.d,
        };
    }

    if (h.mode === "scaling") {
        // error ~ phase^2 / 2, so log(err) against log(phase) must have slope ~2. Measured over a decade of
        // SMALL phases, where the leading term dominates -- at large phase the expansion is no longer leading.
        const pts = [];
        for (let i = 0; i < 12; i++) {
            const delta = 1e-4 * Math.pow(10, i / 6);
            const ph = phaseShift(delta, c.k, c.d);
            const e = bornError(delta, c.k, c.d, half);
            if (ph > 0 && e > 1e-15) pts.push([Math.log(ph), Math.log(e)]);
        }
        if (pts.length < 4) return { error: "not-enough-points-to-fit-scaling" };
        let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const [x, y] of pts) { n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
        return { errorScalingExponent: (n * sxy - sx * sy) / (n * sxx - sx * sx), k: c.k, d: c.d };
    }

    // validity: walk the phase up until the Born error first exceeds the tolerance, and compare that measured
    // crossing against the closed form sqrt(2 tol). Nothing in the search consults maxPhaseFor.
    let crossing = null;
    const lo = 1e-5, hi = 3;
    for (let i = 0; i <= 4000; i++) {
        const ph = lo + (hi - lo) * i / 4000;
        // invert phaseShift = (sqrt(1+delta) - 1) k d  ->  delta for this phase
        const delta = Math.pow(ph / (c.k * c.d) + 1, 2) - 1;
        if (delta <= 0 || delta > 2) continue;
        if (bornError(delta, c.k, c.d, half) > c.tol) { crossing = ph; break; }
    }
    if (crossing == null) return { error: "no-crossing-found (tolerance never exceeded in the swept range)" };
    const theory = maxPhaseFor(c.tol);
    return {
        tolerance: c.tol,
        phaseLimitMeasured: crossing,
        phaseLimitTheory: theory,
        phaseLimitErrFrac: theory > 0 ? Math.abs(crossing - theory) / theory : undefined,
        k: c.k, d: c.d,
    };
}

export const bornDevice = {
    // WHAT THE PLANT OVERTURNS, as data so plantedCoverage reads it off the device rather than grepping prose.
    planted: { knob: "contrastHalf", observable: "errorScalingExponent",
               note: "n = 1 + delta instead of sqrt(1 + delta) doubles the Born phase; the error stops being quadratic (2.0073 -> 1.0574)" },
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: ["validity", "error", "scaling"], name: "born-approximation-validity", observables: BORN_OBSERVABLES, build: buildBorn, defaults: bornDefaults };
