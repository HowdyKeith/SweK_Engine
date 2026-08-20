// WebGLEngine/physics/tomography/adjoint.mjs -- v3615
// ---------------------------------------------------------------------------------------------------------------
// v3613 CALLED backProject "A-TRANSPOSE" AND NOBODY HAD CHECKED IT. IT IS NOT.
//
// PROVENANCE. Keith raised rgl-epfl/unbiased-inverse-volume-rendering (BSD-3, Nimier-David, Muller, Keller,
// Jakob, TOG 41(4) 2022, DOI 10.1145/3528223.3530073). REFUSED AS A DEPENDENCY and nothing is vendored -- it
// is Python scripts for a PATCHED FORK of Mitsuba 3 needing CUDA and a Titan RTX, which is the FluidX3D
// situation one step worse. What travels is one sentence of its README: the baseline estimator "is
// susceptible to BIAS and high variance in regions where the medium density approaches zero". A GRADIENT
// ESTIMATOR THAT IS BIASED IN A NAMED REGIME -- and this tree shipped one last round without checking.
//
// v3613's SIRT is x <- x + lambda * B (b - A x) with radon() as A and backProject() as B, and its header
// asserted that B is A-transpose. THE DOT-PRODUCT TEST SETTLES IT EXACTLY AND NEEDS NO TOLERANCE:
// <A x, y> == <x, A^T y> for every x and y.
//
// ================================================================================================================
// FINDING 1: backProject IS NOT THE TRANSPOSE, AND NOT EVEN A SCALAR MULTIPLE OF IT
// ================================================================================================================
//
//     POSITIVE CONTROL, the TRUE transpose of the shipped radon    worst relative defect   8.304e-14
//     THE SHIPPED backProject                                      worst relative defect   2.751e+1
//
// The control is built by applying the SHIPPED radon to every basis vector and transposing the result, so it
// is the transpose OF THE OPERATOR ACTUALLY UNDER TEST rather than of a textbook one. It reads machine zero,
// WHICH IS WHAT MAKES THE OTHER NUMBER MEAN SOMETHING: the test can pass, so failing it is a reading.
//
// 2.751e+1 IS NOT "SLIGHTLY OFF" -- THE DEFECT IS TWENTY-SEVEN TIMES THE INNER PRODUCT ITSELF. And it is not
// a missing constant: over 200 random pairs the two inner products correlate at 0.867146, and the best scalar
// c = 4.423955 still leaves a 48.3% relative residual. SO THERE IS NO SCALE THAT REPAIRS IT.
//
// WHY, AND IT IS STRUCTURAL RATHER THAN A BUG: radon() GATHERS along each ray by sampling, while
// backProject() SPLATS with `Math.round(...)` into the nearest detector bin. Two different discretisations of
// one continuous operator -- the classic unmatched projector/backprojector pair, which real CT codes ship on
// purpose for speed. It is worth naming rather than fixing blind.
//
// ================================================================================================================
// FINDING 2: WHAT THAT COSTS, MEASURED -- AND IT COSTS THE OBJECTIVE, NOT THE ANSWER
// ================================================================================================================
//
// Same fixture, same iteration count, only the operator swapped (32x32, 16 angles, ellipse phantom):
//
//     shipped backProject    corr 0.970729    residual 3.229e+0
//     TRUE adjoint           corr 0.972272    residual 1.208e+0
//     FBP for reference      corr 0.934094
//
// *** THE TRUE GRADIENT DESCENDS 2.7x FURTHER ON THE OBJECTIVE WHILE THE CORRELATION TO TRUTH BARELY MOVES.
// The mismatch costs the thing the iteration CLAIMS to minimise and costs almost nothing in the thing anybody
// actually looks at. *** That is the honest shape of it, and it is why the defect survived unnoticed: every
// observable v3613 reported was insensitive to it.
//
// ================================================================================================================
// WHAT v3613 GOT WRONG, AND WHAT SURVIVES -- INCLUDING ONE CLAIM THAT GETS STRONGER
// ================================================================================================================
//
// WRONG, AND CORRECTED IN sirt.mjs IN PLACE:
//   - "backProject() is A^T" -- it is not. The header says so now and names this file.
//   - "power iteration estimates the largest eigenvalue of A^T A" -- it iterates B A, which is NOT symmetric,
//     so that description was of a different matrix. The step still works; the justification did not.
//
// SURVIVES UNTOUCHED: SIRT beats FBP at every angle count (an empirical comparison, and it holds for the true
// adjoint too), and the seeded fixed points.
//
// *** AND THE FIXED-POINT RESULT IS STRONGER THAN v3613 KNEW. Seeded at either truth of the ambiguous pair,
// b - A x is EXACTLY ZERO, so the update is B(0) = 0 FOR ANY B WHATSOEVER -- matched, unmatched, or absurd.
// v3613 read that as a fact about SIRT; it is a fact about THE DATA, and it holds for every method of this
// shape. The central result of the tomography arc does not depend on the adjoint at all, and now that is
// PROVEN rather than assumed. ***
//
// NOT CLAIMED: that backProject should be replaced. The true adjoint here is a DENSE MATRIX built by applying
// radon to every basis vector -- O(N^2 * nAngles * nDet) memory, fine at N=32 and hopeless at the device's 96.
// It is an INSTRUMENT for grading the shipped pair, not a shipped operator. Whether the tree wants a matched
// splatting backprojector is a real question and it is Keith's.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { radon, backProject, angleSet, filteredBackProjection, scoreRecon, phantomField } from "./ct.js";

export const dotImage = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const dotSino = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) for (let d = 0; d < a[i].length; d++) s += a[i][d] * b[i][d]; return s; };

export function rng(seed = 97) { let s = seed >>> 0; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296 - 0.5); }
export const randImage = (P, r) => new Float64Array(P).map(r);
export const randSino = (na, nDet, r) => Array.from({ length: na }, () => new Float64Array(nDet).map(r));

/**
 * THE TRUE TRANSPOSE OF THE SHIPPED radon, built by applying it to every basis vector. This is the transpose
 * OF THE OPERATOR UNDER TEST rather than of a textbook one -- the distinction matters, because a mismatch
 * against a textbook adjoint could always be blamed on the textbook.
 */
export function trueAdjoint(N, angles, nDet, rowMajorSlip = false) {
    const P = N * N, M = angles.length * nDet, cols = [];
    for (let j = 0; j < P; j++) {
        const e = new Float64Array(P); e[j] = 1;
        const s = radon(e, N, angles, nDet), col = new Float64Array(M);
        for (let a = 0; a < angles.length; a++) for (let d = 0; d < nDet; d++) col[a * nDet + d] = s[a][d];
        cols.push(col);
    }
    return (y) => {
        const flat = new Float64Array(M);
        // *** v3768 -- `rowMajorSlip` DEFAULTS TO FALSE AND EXISTS SO A PLANT CAN SIT ON THE FLATTENING.
        // The sinogram is [angle][detector] and the columns above were flattened as a*nDet + d; flattening the
        // INPUT as d*na + a instead is THE CLASSIC ROW-MAJOR / COLUMN-MAJOR SLIP -- the same numbers, permuted.
        // IT IS INVISIBLE TO INSPECTION: the loop still covers every element exactly once, the array is still
        // the right length, nothing throws, and the result is still a linear operator. IT IS SIMPLY NOT THE
        // TRANSPOSE, and only the identity <Ax,y> = <x,A^T y> says so. ***
        if (rowMajorSlip) {
            for (let a = 0; a < angles.length; a++) for (let d = 0; d < nDet; d++) flat[d * angles.length + a] = y[a][d];
        } else {
            for (let a = 0; a < angles.length; a++) for (let d = 0; d < nDet; d++) flat[a * nDet + d] = y[a][d];
        }
        const out = new Float64Array(P);
        for (let j = 0; j < P; j++) { let s = 0; const c = cols[j]; for (let i = 0; i < M; i++) s += c[i] * flat[i]; out[j] = s; }
        return out;
    };
}

/** THE DOT-PRODUCT TEST. Relative, so it is scale-free, and reported as a WORST over random pairs. */
export function adjointDefect(adj, { N = 32, nDet = 32, na = 16, trials = 20, seed = 5 } = {}) {
    const angles = angleSet(na), r = rng(seed);
    let worst = 0;
    for (let t = 0; t < trials; t++) {
        const x = randImage(N * N, r), y = randSino(na, nDet, r);
        const lhs = dotSino(radon(x, N, angles, nDet), y);
        const rhs = dotImage(x, adj(y));
        worst = Math.max(worst, Math.abs(lhs - rhs) / Math.max(Math.abs(lhs), Number.MIN_VALUE));
    }
    return worst;
}

/** IS IT A SCALAR MULTIPLE OF THE TRANSPOSE? Correlate the two inner products and fit the best c. */
export function scalarFit({ N = 48, nDet = 48, na = 16, trials = 200, seed = 97 } = {}) {
    const angles = angleSet(na), r = rng(seed), L = [], R = [];
    for (let t = 0; t < trials; t++) {
        const x = randImage(N * N, r), y = randSino(na, nDet, r);
        L.push(dotSino(radon(x, N, angles, nDet), y));
        R.push(dotImage(x, backProject(y, N, angles, nDet)));
    }
    const mean = (a) => a.reduce((p, c) => p + c, 0) / a.length;
    const mL = mean(L), mR = mean(R);
    let num = 0, sL = 0, sR = 0, cn = 0, cd = 0;
    for (let i = 0; i < L.length; i++) { num += (L[i] - mL) * (R[i] - mR); sL += (L[i] - mL) ** 2; sR += (R[i] - mR) ** 2; cn += L[i] * R[i]; cd += R[i] * R[i]; }
    const c = cn / cd;
    let res = 0, mag = 0;
    for (let i = 0; i < L.length; i++) { res += (L[i] - c * R[i]) ** 2; mag += L[i] * L[i]; }
    return { correlation: num / Math.sqrt(sL * sR), bestScalar: c, residualAfterScaling: Math.sqrt(res / mag), trials };
}

export const PHANTOM = [
    { cx: 0, cy: 0, a: 0.7, b: 0.9, rho: 1, phi: 0 },
    { cx: 0.2, cy: -0.1, a: 0.25, b: 0.2, rho: -0.6, phi: 0.4 },
];

/** WHAT THE MISMATCH COSTS: the same iteration with only the operator swapped. */
export function costOfMismatch({ N = 32, nDet = 32, na = 16, iters = 400 } = {}) {
    const angles = angleSet(na), P = N * N;
    const truth = phantomField(N, PHANTOM), b = radon(truth, N, angles, nDet);
    const resid = (x) => { const ax = radon(x, N, angles, nDet); let s = 0; for (let a = 0; a < na; a++) for (let d = 0; d < nDet; d++) { const e = b[a][d] - ax[a][d]; s += e * e; } return Math.sqrt(s); };
    const run = (adj, lam) => {
        const x = new Float64Array(P);
        for (let k = 0; k < iters; k++) {
            const ax = radon(x, N, angles, nDet);
            const r = ax.map((p, i) => { const q = new Float64Array(nDet); for (let d = 0; d < nDet; d++) q[d] = b[i][d] - p[d]; return q; });
            const g = adj(r);
            for (let j = 0; j < P; j++) x[j] += lam * g[j];
        }
        return { corr: scoreRecon(x, truth).corr, residual: resid(x) };
    };
    return {
        shipped: run((r) => backProject(r, N, angles, nDet), 0.004),
        trueAdjoint: run(trueAdjoint(N, angles, nDet), 0.0009),
        fbp: { corr: scoreRecon(filteredBackProjection(b, N, angles, nDet), truth).corr },
    };
}

export const MEASURED_V3615 = {
    control: 8.304e-14, shipped: 2.751e+1,
    scalarFit: { correlation: 0.867146, bestScalar: 4.423955, residualAfterScaling: 0.482561 },
    cost: { shippedResidual: 3.229, trueResidual: 1.208, shippedCorr: 0.970729, trueCorr: 0.972272 },
    verdict: "backProject IS NOT THE TRANSPOSE OF radon AND NOT A SCALAR MULTIPLE OF IT. The true transpose " +
        "of the SHIPPED operator reads a defect of 8.304e-14 and backProject reads 2.751e+1 -- twenty-seven " +
        "times the inner product itself. Over 200 random pairs the two correlate at 0.867 and the best scalar " +
        "still leaves 48.3%. STRUCTURAL, NOT A BUG: radon GATHERS by sampling and backProject SPLATS into the " +
        "nearest bin with Math.round -- the classic unmatched pair.",
    whatItCosts: "the true gradient descends 2.7x further on the OBJECTIVE (residual 1.208 against 3.229) " +
        "while the correlation to truth barely moves (0.972272 against 0.970729). THE MISMATCH COSTS THE THING " +
        "THE ITERATION CLAIMS TO MINIMISE AND ALMOST NOTHING IN THE THING ANYBODY LOOKS AT, which is why it " +
        "survived unnoticed -- every observable v3613 reported was insensitive to it.",
    v3613Corrected: "'backProject is A^T' and 'power iteration on A^T A' were both wrong and are corrected in " +
        "sirt.mjs in place. The step iterates B A, which is not symmetric.",
    theClaimThatGetsStronger: "seeded at either truth of the ambiguous pair, b - A x is EXACTLY ZERO, so the " +
        "update is B(0) = 0 FOR ANY B WHATSOEVER. v3613 read that as a fact about SIRT; it is a fact about THE " +
        "DATA and holds for every method of this shape. The arc's central result never depended on the adjoint.",
    notClaimed: "that backProject should be replaced. The true adjoint is a DENSE MATRIX -- fine at N=32 and " +
        "hopeless at the device's 96. It is an INSTRUMENT for grading the shipped pair, not a shipped operator.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[adjoint] is the backprojector the transpose of the projector? No.");
    say("");
    const angles = angleSet(16);
    say("1. THE DOT-PRODUCT TEST -- exact, relative, no tolerance");
    say("     POSITIVE CONTROL, the true transpose of the SHIPPED radon   " +
        adjointDefect(trueAdjoint(32, angles, 32)).toExponential(3));
    say("     THE SHIPPED backProject                                     " +
        adjointDefect((y) => backProject(y, 32, angles, 32)).toExponential(3));
    say("     The control reads machine zero, WHICH IS WHAT MAKES THE OTHER NUMBER MEAN SOMETHING.");
    say("");
    const f = scalarFit();
    say("2. IS IT A SCALAR MULTIPLE OF THE TRANSPOSE? No -- over " + f.trials + " random pairs:");
    say("     correlation " + f.correlation.toFixed(6) + "   best scalar " + f.bestScalar.toFixed(6) +
        "   residual after scaling " + (100 * f.residualAfterScaling).toFixed(1) + "%");
    say("     radon GATHERS by sampling; backProject SPLATS with Math.round. Two discretisations, one operator.");
    say("");
    const c = costOfMismatch();
    say("3. WHAT IT COSTS -- same fixture, same iterations, only the operator swapped");
    say("     shipped backProject   corr " + c.shipped.corr.toFixed(6) + "   residual " + c.shipped.residual.toExponential(3));
    say("     TRUE adjoint          corr " + c.trueAdjoint.corr.toFixed(6) + "   residual " + c.trueAdjoint.residual.toExponential(3));
    say("     FBP for reference     corr " + c.fbp.corr.toFixed(6));
    say("     THE TRUE GRADIENT DESCENDS FURTHER ON THE OBJECTIVE WHILE THE CORRELATION BARELY MOVES.");
    say("");
    say("  " + MEASURED_V3615.verdict);
    say("  WHAT IT COSTS: " + MEASURED_V3615.whatItCosts);
    say("  STRONGER NOW: " + MEASURED_V3615.theClaimThatGetsStronger);
    say("  NOT CLAIMED: " + MEASURED_V3615.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
