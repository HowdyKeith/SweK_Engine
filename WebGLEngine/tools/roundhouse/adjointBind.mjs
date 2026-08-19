// tools/roundhouse/adjointBind.mjs -- v3768
//
// *** TIER 2: A MODULE WITH A GENUINELY EXTERNAL KEY, WIRED SO THE ROUNDHOUSE CAN BE GRADED ON IT.
// physics/tomography/adjoint.mjs has been fully measured since v3613-v3617 and NO DEVICE REACHED IT, so
// gradedCoverage counted it among the 136 ungraded. THE KEY IS EXACT AND NEEDS NO TOLERANCE:
//
//     <A x, y> = <x, A^T y>    for every x and y
//
// That is an identity, not an approximation. A correct transpose satisfies it to round-off; anything else does
// not, and the size of the miss is a measurement rather than a judgement. ***
//
// *** WHAT IT GRADES, AND THE ANSWER IS ALREADY KNOWN -- WHICH IS THE POINT. The true transpose of the SHIPPED
// radon reads a defect of 8.3038e-14. THE SHIPPED backProject READS 27.510 -- twenty-seven times the inner
// product itself. Both reproduce the v3615 record exactly. So this device does not discover the mismatch; it
// makes the mismatch SOMETHING A GATE RE-DERIVES EVERY TIME rather than a number in a comment. ***
//
// *** AND IT IS NOT A CLAIM THAT backProject SHOULD BE REPLACED. The true adjoint is a DENSE MATRIX -- fine at
// N=32 and hopeless at the CT device's N=96. IT IS AN INSTRUMENT FOR GRADING THE SHIPPED PAIR, NOT A SHIPPED
// OPERATOR, and adjoint.mjs says so itself. The mismatch is STRUCTURAL: radon GATHERS by sampling and
// backProject SPLATS into the nearest bin with Math.round -- the classic unmatched pair. ***

import { adjointDefect, trueAdjoint, scalarFit, MEASURED_V3615 } from "../../physics/tomography/adjoint.mjs";
import { backProject } from "../../physics/tomography/ct.js";

export const ADJOINT_OBSERVABLES = [
    "defect", "controlDefect", "shippedDefect", "identityHolds",
    "recordedControl", "recordedShipped", "controlErrFrac", "shippedErrFrac",
    "correlation", "bestScalar", "residualAfterScaling", "N", "nDet", "na",
];

export const ADJOINT_MODES = ["identity", "shipped", "scalar", "rowmajor"];

const DEF = { N: 32, nDet: 32, na: 16, trials: 10, seed: 5 };

export function adjointDefaults(hyp) {
    const h = { mode: "identity", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    // bounded: trueAdjoint builds a DENSE matrix, so this is O(N^2 * na * nDet) in memory and time
    c.N = Math.min(48, Math.max(8, num(c.N, DEF.N) | 0));
    c.nDet = Math.min(48, Math.max(8, num(c.nDet, DEF.nDet) | 0));
    c.na = Math.min(32, Math.max(4, num(c.na, DEF.na) | 0));
    c.trials = Math.min(40, Math.max(2, num(c.trials, DEF.trials) | 0));
    h.config = c;
    if (!ADJOINT_MODES.includes(h.mode)) h.mode = "identity";
    return h;
}

const anglesOf = (na) => Array.from({ length: na }, (_, i) => Math.PI * i / na);

export async function buildAdjoint(hyp, base = {}) {
    const h = adjointDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const angles = anglesOf(c.na);
    const out = { N: c.N, nDet: c.nDet, na: c.na,
                  recordedControl: MEASURED_V3615.control, recordedShipped: MEASURED_V3615.shipped };

    if (h.mode === "scalar") {
        const f = scalarFit({ N: c.N, nDet: c.nDet, na: c.na, trials: Math.max(50, c.trials * 10), seed: 97 });
        out.correlation = f.correlation;
        out.bestScalar = f.bestScalar;
        out.residualAfterScaling = f.residualAfterScaling;
        return out;
    }

    // *** "rowmajor" IS THE PLANT AND IT RUNS THIS BRANCH -- see the comment at the transpose below. ***
    const control = adjointDefect(trueAdjoint(c.N, angles, c.nDet, h.mode === "rowmajor"),
                                  { N: c.N, nDet: c.nDet, na: c.na, trials: c.trials, seed: c.seed });
    const shipped = adjointDefect((y) => backProject(y, c.N, angles, c.nDet),
                                  { N: c.N, nDet: c.nDet, na: c.na, trials: c.trials, seed: c.seed });
    out.controlDefect = control;
    out.shippedDefect = shipped;
    out.defect = h.mode === "shipped" ? shipped : control;
    // *** THE IDENTITY IS EXACT, SO THE VERDICT IS A BINARY AND NOT A TOLERANCE ARGUMENT. Round-off on a dense
    // matrix of this size lands near 1e-13; 27.5 is not "a bigger error", it is A DIFFERENT OPERATOR. ***
    out.identityHolds = control < 1e-9;
    out.controlErrFrac = Math.abs(control - MEASURED_V3615.control) / MEASURED_V3615.control;
    out.shippedErrFrac = Math.abs(shipped - MEASURED_V3615.shipped) / MEASURED_V3615.shipped;
    return out;
}

export const adjointDevice = {
    modes: ADJOINT_MODES,
    // v3768 -- the mode plant. "identity" is FIRST so the contract compares the plant against the mode that
    // owns controlDefect; the plant is a variant of identity, so identity is its correct baseline.
    plantMode: "rowmajor", plantFlips: "controlDefect", plantKind: "mode",
    name: "radon-adjoint-identity", observables: ADJOINT_OBSERVABLES,
    build: buildAdjoint, defaults: adjointDefaults,
};
