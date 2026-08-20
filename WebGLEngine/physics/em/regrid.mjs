// physics/em/regrid.mjs
//
// WHAT IT COSTS TO CHANGE THE GRID UNDER A FIELD THAT IS ALREADY PROPAGATING.
//
// This is WAVELET's actual claim -- "a dynamic grid that ADAPTS AS TRANSMITTERS ARE ADDED" -- and v3632 left it
// as the one part still unmeasured. Nothing is vendored and no claim about their code is made. v3632 measured a
// STATIC refinement interface; this measures the ACT of refining.
//
// *** THE ANSWER KEY IS AGAIN EXACTLY ZERO, AND THIS TIME IT NEEDS NO REFERENCE RUN AT ALL. Refine a grid by a
// ratio and immediately coarsen it back: THE GRID IS NOW IDENTICAL TO THE ONE YOU STARTED WITH, so in the
// continuum the field must be identical too. A round trip through a finer representation and back is THE
// IDENTITY. Every difference is pure interpolation loss, measured against the field's own earlier self -- there
// is no second simulation to trust and no tolerance to choose. ***
//
// AND THE ROUND TRIP IS NOT AN ARTIFICIAL FIXTURE. An adaptive grid refines where the action is and COARSENS
// BEHIND IT as the action moves on. A transmitter that switches on and off puts exactly this round trip through
// the field, and a wave crossing a moving refinement region takes one per crossing.
//
// *** THE TWO WAYS BACK ARE NOT THE SAME OPERATION AND YOU CANNOT HAVE BOTH:
//     SAMPLE  -- take the coarse node's value from the coincident fine node. Preserves POINT VALUES exactly, so
//                a constant and a linear ramp survive to the last bit. Does NOT preserve the integral.
//     AVERAGE -- take the mean of the fine cells the coarse cell covers. Preserves the INTEGRAL (and therefore
//                the energy budget's first moment) exactly. Does NOT preserve point values: it is a low-pass
//                filter, so it damps every wavelength it touches.
// One keeps the value and loses the sum; the other keeps the sum and loses the value. THIS FILE MEASURES BOTH
// AND PICKS NEITHER, because which one is right depends on what the caller is conserving. ***
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/** Coarse -> fine by linear interpolation. `ratio` must be an integer >= 1. */
export function refine(field, ratio) {
    const n = field.length, out = new Float64Array((n - 1) * ratio + 1);
    for (let i = 0; i < n - 1; i++) {
        for (let k = 0; k < ratio; k++) {
            const t = k / ratio;
            out[i * ratio + k] = field[i] * (1 - t) + field[i + 1] * t;
        }
    }
    out[out.length - 1] = field[n - 1];
    return out;
}

/** Fine -> coarse by SAMPLING the coincident node. Exact on point values; does not conserve the integral. */
export function coarsenSample(field, ratio) {
    const m = Math.floor((field.length - 1) / ratio) + 1, out = new Float64Array(m);
    for (let i = 0; i < m; i++) out[i] = field[i * ratio];
    return out;
}

/** Fine -> coarse by AVERAGING the covered cells. Conserves the integral; low-passes the field. */
export function coarsenAverage(field, ratio) {
    const m = Math.floor((field.length - 1) / ratio) + 1, out = new Float64Array(m);
    for (let i = 0; i < m; i++) {
        let s = 0, c = 0;
        for (let k = -Math.floor(ratio / 2); k <= Math.floor(ratio / 2); k++) {
            const j = i * ratio + k;
            if (j >= 0 && j < field.length) { s += field[j]; c++; }
        }
        out[i] = s / c;
    }
    return out;
}

/**
 * *** THE ROUND TRIP WITH SAMPLING IS THE IDENTITY BY CONSTRUCTION, AND I ALMOST SHIPPED THAT AS A RESULT.
 * refine() puts the coarse nodes' own values at the coincident fine nodes, and coarsenSample() reads exactly
 * those back -- so the pair is a LEFT INVERSE and the error is algebraically zero for EVERY field, including a
 * sine at eight cells per wavelength. It measured 0.000e+0 across the board and read like "sampling is
 * lossless". IT IS A CHECK THAT CANNOT FAIL: I had composed a function with its own inverse. The real cost of
 * refining is not in the round trip at all -- IT IS IN WHAT THE REFINED FIELD *IS*, and that is measured by
 * interpolationError() below against an ANALYTIC field, which is a truth neither operator was told. ***
 */
/** One refine-and-return trip. The grid is unchanged afterwards, so the CONTINUUM answer is the identity. */
export function roundTrip(field, ratio, mode = "sample") {
    const fine = refine(field, ratio);
    return mode === "average" ? coarsenAverage(fine, ratio) : coarsenSample(fine, ratio);
}

/** Sum over the grid -- the discrete integral the averaging route is supposed to preserve. */
export const integral = (f) => { let s = 0; for (let i = 0; i < f.length; i++) s += f[i]; return s; };
export const energy = (f) => { let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i]; return s; };

/** Worst pointwise departure from the identity, relative to the field's own peak. */
export function identityError(field, ratio, mode = "sample") {
    const back = roundTrip(field, ratio, mode);
    let worst = 0, peak = 0;
    for (let i = 0; i < field.length; i++) {
        peak = Math.max(peak, Math.abs(field[i]));
        worst = Math.max(worst, Math.abs(back[i] - field[i]));
    }
    return { worst, peak, relative: worst / Math.max(peak, 1e-300),
             integralDrift: Math.abs(integral(back) - integral(field)) / Math.max(Math.abs(integral(field)), 1e-300),
             energyRatio: energy(back) / Math.max(energy(field), 1e-300) };
}

/**
 * THE COST THAT IS REAL: linear interpolation INVENTS the field between coarse nodes as a straight line, and the
 * true field is not a straight line. `truth(x)` is the analytic field, sampled on both grids; nothing in refine()
 * is ever told it. Linear interpolation is second order in the coarse spacing, and the gate measures that rather
 * than asserting it.
 */
export function interpolationError(truth, nCoarse, ratio, { x0 = 0, dxCoarse = 1 } = {}) {
    const coarse = new Float64Array(nCoarse);
    for (let i = 0; i < nCoarse; i++) coarse[i] = truth(x0 + i * dxCoarse);
    const guessed = refine(coarse, ratio), dxFine = dxCoarse / ratio;
    let worst = 0, peak = 0;
    for (let i = 0; i < guessed.length; i++) {
        const t = truth(x0 + i * dxFine);
        peak = Math.max(peak, Math.abs(t));
        worst = Math.max(worst, Math.abs(guessed[i] - t));
    }
    return { worst, peak, relative: worst / Math.max(peak, 1e-300) };
}

// --- the fields the keys are stated on -------------------------------------------------------------------------
export const constantField = (n, v = 1) => { const f = new Float64Array(n); f.fill(v); return f; };
export const rampField = (n, a = 0.3, b = -0.1) => { const f = new Float64Array(n); for (let i = 0; i < n; i++) f[i] = a + b * i; return f; };
export const gaussianField = (n, at, width) => { const f = new Float64Array(n); for (let i = 0; i < n; i++) f[i] = Math.exp(-Math.pow((i - at) / width, 2)); return f; };
export const sineField = (n, cellsPerWavelength) => { const f = new Float64Array(n); for (let i = 0; i < n; i++) f[i] = Math.sin(2 * Math.PI * i / cellsPerWavelength); return f; };

/**
 * HOW OFTEN CAN YOU AFFORD TO REGRID? Apply the round trip `times` in succession and report the error after
 * each. Whether it accumulates LINEARLY (each trip an independent insult) or SATURATES (the field relaxes onto
 * what the operator can represent and stops changing) is the whole question, and it is not the same answer for
 * the two modes -- which is the point of measuring rather than assuming.
 */
export function repeated(field, ratio, mode = "sample", times = 8) {
    let f = Float64Array.from(field);
    const rows = [];
    for (let t = 1; t <= times; t++) {
        f = roundTrip(f, ratio, mode);
        let worst = 0, peak = 0;
        for (let i = 0; i < field.length; i++) {
            peak = Math.max(peak, Math.abs(field[i]));
            worst = Math.max(worst, Math.abs(f[i] - field[i]));
        }
        rows.push({ trip: t, relative: worst / Math.max(peak, 1e-300), energyRatio: energy(f) / Math.max(energy(field), 1e-300) });
    }
    return rows;
}
