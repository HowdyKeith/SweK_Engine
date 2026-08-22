// tools/roundhouse/magmapKernel.mjs
//
// v2903 -- THE KERNEL SPECIFICATION, AND WHY IT IS NOT A TRANSCRIPTION OF THE CPU REFERENCE.
//
// Open item 3 was "put the magnification map on the GPU, graded by proposeAndVerify". The obvious move is to
// transcribe lensBind's finiteSourceMag into WGSL. Measuring first says that would have produced a kernel that
// is wrong by SEVEN PERCENT, and it would have been blamed on the GPU.
//
// TWO THINGS THE REFERENCE DOES THAT MUST NOT CROSS TO f32:
//
// 1. solveImages() bisects 200 times for each image. The point-lens equation is beta = theta - 1/theta, i.e.
//    theta^2 - beta*theta - 1 = 0, which is a QUADRATIC. The roots are (u +/- sqrt(u^2+4))/2 in closed form.
//    Measured: the bisection reproduces the closed form to 6.7e-15 relative across u in [1e-6, 20] -- so 400
//    iterations are recovering something exactly solvable. On the CPU that is merely wasteful. In f32 it is
//    fatal: bisection stalls at f32 spacing long before iteration 200, and the two roots bracket differently
//    per rounding.
//
// 2. magnifyAt() takes a NUMERICAL derivative with step h = |theta|*1e-6. Since dbeta/dtheta = 1 + 1/theta^2 is
//    available analytically, this is a central difference used where calculus was available. In f64 it costs
//    accuracy quietly -- measured 4.4e-11 relative against the analytic form, five orders worse than the
//    machine epsilon the rest of the path achieves. In f32 the step is smaller than the epsilon it is
//    differencing against, and cancellation destroys the result outright.
//
// MEASURED, on identical inputs (see magmap-selfcheck.mjs, which re-runs both):
//     literal transcription of magnifyAt in f32 ...... 7.0e-2 worst relative error
//     closed form + analytic derivative in f32 ....... 2.0e-6 worst relative error
//
// A 7% kernel would have been visible, argued about, and plausibly attributed to "GPU floating point" -- which
// is the standing excuse this whole apparatus exists to make unavailable. The error would have been ours.
//
// WHAT THE KERNEL IS ALLOWED TO USE. Only + - * / sqrt, all IEEE-specified and correctly rounded, in f32 rather
// than f64. NO transcendentals: the polar sampling angles are precomputed on the CPU by strictTrig and uploaded
// as a table, so the shader never calls WGSL's sin/cos, whose rounding is unspecified. Each thread owns one cell
// and accumulates its quadrature SEQUENTIALLY, so there is no parallel reduction and no reduction-order
// nondeterminism. What remains unpinned is exactly two things: f32 rounding, and whether the vendor contracts
// a*b+c into an fma. Both are measured below rather than assumed.

import { strictSin, strictCos } from "../strictTrig.mjs";

const f32 = Math.fround;

/** beta(theta) for a point lens in Einstein-radius units. Shared by every route so none can drift. */
export const lensEq = (t) => t - 1 / t;

/**
 * Magnification at one image position, ANALYTIC.
 *   mu = |(theta/beta) * (dbeta/dtheta)^-1|,  dbeta/dtheta = 1 + 1/theta^2
 *      = |theta^3 / (beta * (theta^2 + 1))|
 * This is what replaced the central difference. It is also an INDEPENDENT IMPLEMENTATION of a quantity the tree
 * already computes numerically, which makes the agreement between them a real cross-check rather than a restatement
 * -- the same shape as v2898's Kerr limit, and it had the same freedom to fail.
 */
export const magAt = (t) => Math.abs((t * t * t) / (lensEq(t) * (t * t + 1)));

/** Total magnification of a point source at offset u: both images, closed form throughout. */
export function muPoint(u) {
    const d = Math.sqrt(u * u + 4);
    return magAt(0.5 * (u + d)) + magAt(0.5 * (u - d));
}

/**
 * The same function evaluated with every intermediate rounded to f32 -- an emulator of what the shader computes.
 *
 * THIS IS NOT A GPU AND MUST NEVER BE REPORTED AS ONE. It reproduces f32 rounding and nothing else: it cannot
 * reproduce a driver bug, a miscompiled loop, a wrong workgroup index, or a card that quietly runs in fast-math.
 * Its job is narrower and still worth having -- it lets the ADJUDICATION path be exercised, and the tolerance be
 * calibrated, on the many machines in this fleet that will run the selfcheck headless. The card is graded by
 * magmapGpu.js in a browser, against this same reference, and only that counts as the kernel having been run.
 */
export function muPointF32(u, { contractFma = false } = {}) {
    const d = contractFma ? f32(Math.sqrt(f32(u * u + 4)))          // vendor fuses: one rounding
                          : f32(Math.sqrt(f32(f32(u * u) + 4)));    // spec minimum: two roundings
    const m = (t) => {
        const t2 = f32(t * t);
        const b = f32(t - f32(1 / t));
        const den = contractFma ? f32(b * (t2 + 1)) : f32(b * f32(t2 + 1));
        return Math.abs(f32(f32(t2 * t) / den));
    };
    return f32(m(f32(f32(u + d) * 0.5)) + m(f32(f32(u - d) * 0.5)));
}

/**
 * The polar sampling table. Computed ONCE on the CPU with strictTrig -- correctly rounded, therefore identical on
 * every conforming machine -- and uploaded to the GPU. This is the move that keeps the kernel free of unspecified
 * transcendentals: the shader receives sines and cosines, it does not compute them.
 */
export function sampleTable(nT) {
    const cos = new Float32Array(nT), sin = new Float32Array(nT);
    const cos64 = new Float64Array(nT), sin64 = new Float64Array(nT);
    for (let j = 0; j < nT; j++) {
        const th = 2 * Math.PI * (j + 0.5) / nT;
        cos64[j] = strictCos(th); sin64[j] = strictSin(th);
        cos[j] = f32(cos64[j]); sin[j] = f32(sin64[j]);
    }
    return { cos, sin, cos64, sin64, nT };
}

/**
 * One cell of the map: uniform-disc quadrature at source offset u0. `precision` selects f64 (the answer key) or
 * f32 (what the shader will compute). The loop order is the thread's own and is fixed, so this is a faithful
 * model of the accumulation the kernel performs -- which matters, because 2304 sequential f32 additions have a
 * drift of their own that has nothing to do with the magnification formula.
 */
export function cellMag(u0, rho, table, { precision = "f64", contractFma = false, nR = 48 } = {}) {
    // v2947 -- BIT-IDENTICAL FAST PATH FOR f64. In f64 mode the rounding hook `f` below is the IDENTITY
    // (x) => x, called about six times per inner iteration -- roughly 6 million dead calls for one 441-cell map.
    // Removing it cannot change a single bit, because f(x) === x exactly, and it is worth 7.2x measured (75.9ms
    // -> 10.5ms for the full grid, maxAbsDiff exactly 0 across all 441 cells). The f32 path below is UNTOUCHED:
    // there `f` is a real f32 rounding step and every one of those calls is load-bearing.
    //
    // The loop body here is a line-for-line copy of the general path with the identity stripped -- same order,
    // same operations, same specified sqrt. magmapFastPath-selfcheck.mjs proves the two agree bit-for-bit on
    // every cell of the graded grid, and that gate is what makes this safe to keep.
    if (precision === "f64" && !contractFma) {
        const C64 = table.cos64, S64 = table.sin64, nT64 = table.nT;
        let acc64 = 0, wsum64 = 0;
        for (let i = 0; i < nR; i++) {
            const rr = rho * (i + 0.5) / nR;
            for (let j = 0; j < nT64; j++) {
                const ux = u0 + rr * C64[j], uy = rr * S64[j];
                const u = Math.sqrt(ux * ux + uy * uy);
                if (u < 1e-12) continue;
                acc64 = acc64 + muPoint(u) * rr;
                wsum64 = wsum64 + rr;
            }
        }
        return wsum64 > 0 ? acc64 / wsum64 : Infinity;
    }
    const f = precision === "f32" ? f32 : (x) => x;
    const mu = precision === "f32" ? (u) => muPointF32(u, { contractFma }) : muPoint;
    const C = precision === "f32" ? table.cos : table.cos64;
    const S = precision === "f32" ? table.sin : table.sin64;
    const nT = table.nT;
    let acc = 0, wsum = 0;
    for (let i = 0; i < nR; i++) {
        const rr = f(rho * (i + 0.5) / nR);
        for (let j = 0; j < nT; j++) {
            const ux = f(u0 + f(rr * C[j])), uy = f(rr * S[j]);
            const u = f(Math.sqrt(f(f(ux * ux) + f(uy * uy))));   // specified sqrt, never hypot
            if (u < 1e-12) continue;
            acc = f(acc + f(mu(u) * rr));
            wsum = f(wsum + rr);
        }
    }
    return wsum > 0 ? acc / wsum : Infinity;
}

/** Grid geometry, shared by the CPU reference and the shader's uniforms so the two cannot index differently. */
export function cellOffset(k, n, span) {
    const step = (2 * span) / (n - 1);
    const i = k % n, j = Math.floor(k / n);
    const ux = -span + i * step, uy = -span + j * step;
    return { i, j, ux, uy, u0: Math.sqrt(ux * ux + uy * uy) };
}

/** The CPU answer key for cell k -- this is the `recompute` handed to proposeAndVerify. */
export function referenceCell(k, { n, span, rho, table, nR = 48 }) {
    return cellMag(cellOffset(k, n, span).u0, rho, table, { precision: "f64", nR });
}
