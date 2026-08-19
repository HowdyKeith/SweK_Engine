// physics/em/limiterNonUniform.mjs
//
// THE LIMITER AT A REFINEMENT INTERFACE -- TWO THINGS THIS TREE ALREADY BUILT, NEVER PUT TOGETHER.
//
// v3632 measured what a static refinement interface costs. v3635 measured that per-axis minmod is monotone on a
// CARTESIAN cell, with the two-line reason: the corner takes half of each slope and the mean of two numbers
// never exceeds their max. Its scope note then named the untested case in as many words -- "on TRIANGLES OR WITH
// NON-UNIFORM SPACING the vertex offsets are not 1/2 and the argument does not run". A refinement interface IS
// non-uniform spacing, and it is already in this tree. This is that join.
//
// *** THE DEFECT IS IN A SHAPE PEOPLE ACTUALLY WRITE, AND IT IS EASY TO MISS BECAUSE IT IS INVISIBLE ON A
// UNIFORM GRID. minmod is nearly always coded on the BARE DIFFERENCES u[i]-u[i-1] and u[i+1]-u[i], and the
// reconstruction is written u +/- s/2. On a uniform grid a difference IS the slope times the spacing, so the two
// spellings agree and nothing can go wrong. THE MOMENT THE NEIGHBOUR IS A DIFFERENT WIDTH THEY STOP AGREEING:
// a difference measured across a WIDE gap and applied over a NARROW cell is the wrong size, and the limiter's
// guarantee -- which is a statement about differences -- no longer bounds the reconstruction. ***
//
// THE CORRECT FORM, AND IT IS NOT A TOLERANCE, IT IS A UNIT:
//     one-sided SLOPE to the right = (u[i+1] - u[i]) / ((h[i] + h[i+1]) / 2)      <- distance between CENTRES
//     reconstruct with   u[i] +/- s[i] * h[i] / 2                                  <- over THIS cell's width
// Written that way the guarantee comes back, and it comes back for a reason that can be stated: the reconstructed
// half-excess is s*h[i]/2 = (difference) * h[i] / (h[i] + h[neighbour]), and that factor is STRICTLY LESS THAN 1
// for any positive widths -- so the excess is strictly less than the difference it came from, whatever the
// refinement ratio. The naive form has that factor equal to 1/2 * (1 + h[neighbour]/h[i]), which EXCEEDS 1 as
// soon as the neighbour is more than one cell wider.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

export const minmod = (a, b) => (a * b <= 0 ? 0 : (Math.abs(a) < Math.abs(b) ? a : b));

/** Widths for a domain that is coarse on the left and refined by `ratio` from the midpoint. */
export function interfaceWidths({ nCoarse = 60, nFine = 60, ratio = 4, hCoarse = 1 } = {}) {
    const h = new Float64Array(nCoarse + nFine);
    for (let i = 0; i < nCoarse; i++) h[i] = hCoarse;
    for (let i = nCoarse; i < h.length; i++) h[i] = hCoarse / ratio;
    return { h, splitAt: nCoarse, ratio };
}

/** Cell-centre positions from widths. */
export function centres(h) {
    const x = new Float64Array(h.length);
    let edge = 0;
    for (let i = 0; i < h.length; i++) { x[i] = edge + 0.5 * h[i]; edge += h[i]; }
    return x;
}

/** Exact cell averages of an analytic field on a non-uniform grid (Simpson per cell). */
export function analyticCells(f, h) {
    const out = new Float64Array(h.length);
    let edge = 0;
    for (let i = 0; i < h.length; i++) {
        const a = edge, b = edge + h[i];
        out[i] = (f(a) + 4 * f(0.5 * (a + b)) + f(b)) / 6;
        edge = b;
    }
    return out;
}

/**
 * Slopes. mode:
 *   "naive"  -- minmod of the BARE DIFFERENCES, reconstruction scaled by 1/2. What almost everyone writes, and
 *               correct on a uniform grid by coincidence.
 *   "slope"  -- minmod of the TRUE one-sided slopes (difference over centre-to-centre distance).
 * Returns the HALF-EXCESS each cell will apply at its own faces, so the two modes are directly comparable.
 */
export function halfExcess(u, h, mode = "slope") {
    const n = u.length, out = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
        const dL = u[i] - u[i - 1], dR = u[i + 1] - u[i];
        if (mode === "naive") { out[i] = 0.5 * minmod(dL, dR); continue; }
        const gapL = 0.5 * (h[i - 1] + h[i]), gapR = 0.5 * (h[i] + h[i + 1]);
        out[i] = 0.5 * h[i] * minmod(dL / gapL, dR / gapR);
    }
    return out;
}

/**
 * Escapes: does the reconstruction leave the 3-point neighbourhood at the cell's own faces? An exact boolean,
 * no tolerance, and the same question v3635 asked in 2D.
 */
export function escapes(u, h, mode = "slope") {
    const e = halfExcess(u, h, mode);
    let count = 0, worst = 0, span = 0, firstAt = -1;
    for (let i = 1; i < u.length - 1; i++) {
        const lo = Math.min(u[i - 1], u[i], u[i + 1]), hi = Math.max(u[i - 1], u[i], u[i + 1]);
        span = Math.max(span, hi - lo);
        for (const s of [-1, 1]) {
            const v = u[i] + s * e[i];
            const over = v > hi ? v - hi : (v < lo ? lo - v : 0);
            if (over > 0) { count++; if (firstAt < 0) firstAt = i; worst = Math.max(worst, over); }
        }
    }
    return { count, worst, span, relative: worst / Math.max(span, 1e-300), firstAt };
}

/**
 * The reconstructed half-excess as a fraction of the one-sided difference it came from. Depends ONLY on the two
 * widths, and BOTH SPELLINGS STAY BELOW 1 FOR EVERY POSITIVE PAIR -- naive at a flat 1/2, the slope form at
 * hSelf/(hSelf + hNeighbour), which is strictly less than 1. That is the whole reason section 1 of the gate
 * finds no escapes for either: minmod already bounds its output by the SMALLER difference, and half of the
 * smaller difference cannot leave a neighbourhood whose half-span is at least the smaller difference.
 * A FACTOR OF TWO OF MARGIN, INDEPENDENT OF THE WIDTHS.
 */
export function excessFactor(hSelf, hNeighbour, mode = "slope") {
    return mode === "naive" ? 0.5 : hSelf / (hSelf + hNeighbour);
}

/**
 * Refine each cell into `ratio` equal subcells using its own width, so the reconstruction is evaluated where it
 * is actually used. Returns the subcell averages and their widths.
 */
export function refineNonUniform(u, h, ratio, mode = "slope") {
    const e = halfExcess(u, h, mode), n = u.length;
    const out = new Float64Array(n * ratio), hh = new Float64Array(n * ratio);
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < ratio; k++) {
            // e[i] is the half-excess AT THE FACE, so scale it to the subcell centre's fractional offset
            const frac = ((k + 0.5) / ratio - 0.5) * 2;      // -1..+1 across the cell
            out[i * ratio + k] = u[i] + e[i] * frac;
            hh[i * ratio + k] = h[i] / ratio;
        }
    }
    return { u: out, h: hh };
}

/**
 * Reconstruction error against the analytic subcell averages, reported SEPARATELY for the uniform interior and
 * for the cells adjacent to the width change. Splitting the report is the point: a single whole-domain number
 * averages a defect that lives in two cells into a field of two hundred, and would read as "slightly worse".
 */
export function accuracyByRegion(f, h, splitAt, ratio, mode = "slope", { halo = 2 } = {}) {
    const u = analyticCells(f, h);
    const got = refineNonUniform(u, h, ratio, mode);
    const truth = analyticCells(f, got.h);
    let interior = 0, seam = 0, peak = 0;
    for (let i = 1; i < u.length - 1; i++) {
        const nearSeam = Math.abs(i - splitAt) <= halo || Math.abs(i - (splitAt - 1)) <= halo;
        for (let k = 0; k < ratio; k++) {
            const j = i * ratio + k;
            const d = Math.abs(got.u[j] - truth[j]);
            peak = Math.max(peak, Math.abs(truth[j]));
            if (nearSeam) seam = Math.max(seam, d); else interior = Math.max(interior, d);
        }
    }
    return { interior: interior / Math.max(peak, 1e-300), seam: seam / Math.max(peak, 1e-300),
             ratioSeamToInterior: seam / Math.max(interior, 1e-300) };
}
