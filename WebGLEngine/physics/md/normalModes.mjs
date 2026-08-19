// physics/md/normalModes.mjs
//
// NORMAL MODES ARE THE HESSIAN OF A FORCE FIELD physics/md/ ALREADY HAS, AND THE KEYS ARE COUNTING LAWS FROM
// GEOMETRY RATHER THAN NUMBERS FROM ANY FILE.
//
// The force terms (bonds, angles, dihedrals, improper) were each gated separately when they were built. This
// grades them TOGETHER, through a quantity none of them computes: the second derivative of the potential.
//
// *** THE THREE KEYS, AND NOT ONE OF THEM IS A REFERENCE VALUE I TYPED:
//   1. THE COUNT. A NON-LINEAR molecule of N atoms has EXACTLY 3N-6 vibrations and SIX zero modes -- three
//      translations and three rotations. A LINEAR one has 3N-5 and FIVE, because rotation about the molecular
//      axis moves nothing. THAT IS A FACT ABOUT SPACE, not about this code.
//   2. THE ZEROS THEMSELVES. Those modes must come out AT MACHINE ZERO. A sign slip anywhere in any force term
//      breaks them, so one check grades every term at once.
//   3. THE DIATOMIC. omega = sqrt(k/mu) is ALREADY mdBind's "bond" key, reached there from the analytic
//      formula. Here it arrives from a NUMERICAL SECOND DERIVATIVE of the potential -- TWO ROUTES SHARING NO
//      CODE to a number this tree already trusts. ***
//
// *** AND THE LOAD-BEARING NEGATIVE IS A DISTINCTION THE TEXTBOOK COUNT HIDES: TRANSLATIONS ARE ZERO MODES AT
// ANY GEOMETRY WHATSOEVER, because the potential cannot see where the molecule is. ROTATIONS ARE ZERO MODES
// ONLY AT A STATIONARY POINT. Evaluate the Hessian away from equilibrium and the count falls from six to
// three -- so "I got six zeros" is evidence the geometry is AT a minimum, and a fixture that never checks its
// own equilibrium could report the wrong number and look right. ***
//
// The equilibrium geometries here are CONSTRUCTED EXACTLY rather than minimised: every bond at r0 and every
// angle at its cos0 puts each term at its own minimum, so the total force is zero by construction and there is
// no optimiser tolerance anywhere in the key.
//
// BROWSER-SAFE: no node builtins, no DOM.

/**
 * Numerical Hessian by CENTRAL DIFFERENCES OF THE FORCE, which is one differentiation rather than two: the
 * force is already -dV/dx, so H[a][b] = -dF[a]/dx[b]. Differentiating the energy twice would square the
 * step-size error. Symmetrised at the end because H must be symmetric and the asymmetry is a free error bar --
 * `asymmetry` is returned rather than discarded.
 */
export function hessian(forceFn, pos, N, { h = 1e-5 } = {}) {
    const n = 3 * N;
    const H = Array.from({ length: n }, () => new Float64Array(n));
    const p = Float64Array.from(pos);
    for (let b = 0; b < n; b++) {
        const x0 = p[b];
        p[b] = x0 + h; const fp = forceFn(p).forces;
        p[b] = x0 - h; const fm = forceFn(p).forces;
        p[b] = x0;
        for (let a = 0; a < n; a++) H[a][b] = -(fp[a] - fm[a]) / (2 * h);
    }
    let asymmetry = 0, scale = 0;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        asymmetry = Math.max(asymmetry, Math.abs(H[a][b] - H[b][a]));
        scale = Math.max(scale, Math.abs(H[a][b]));
    }
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const m = 0.5 * (H[a][b] + H[b][a]); H[a][b] = m; H[b][a] = m;
    }
    return { H, n, asymmetry, relAsymmetry: asymmetry / Math.max(scale, 1e-300) };
}

/**
 * Mass-weighted Hessian K[a][b] = H[a][b] / sqrt(m_a m_b); its eigenvalues are omega^2.
 *
 * RETURNED ROW-MAJOR FLAT, because that is what physics/quantum/rmt.js's symEigenvalues takes -- it does
 * `Float64Array.from(A)`, so handing it an ARRAY OF ROWS silently yields a matrix of NaN rather than an error.
 * MY FIRST VERSION DID EXACTLY THAT and every eigenvalue came back NaN. A LAYOUT MISMATCH THAT TYPE-CHECKS.
 */
export function massWeight(H, n, masses) {
    const K = new Float64Array(n * n);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        K[a * n + b] = H[a][b] / Math.sqrt(masses[(a / 3) | 0] * masses[(b / 3) | 0]);
    }
    return K;
}

/**
 * Split a spectrum into zero modes and vibrations.
 *
 * *** MY FIRST VERSION PLACED THE SPLIT AT THE LARGEST RELATIVE GAP, WHICH SOUNDED PRINCIPLED AND IS UNUSABLE:
 * WHEN A ZERO MODE IS *EXACTLY* ZERO, the ratio to the next eigenvalue is infinite, so the "largest gap" lands
 * between two zeros and reports 2 zeros where there are 5. A RATIO TEST CANNOT RANK A SET THAT CONTAINS A TRUE
 * ZERO. Replaced by the standard rank tolerance: zero means below sqrt(machine epsilon) times the LARGEST
 * eigenvalue -- derived from the spectrum's own scale, not typed per molecule. The gap is still REPORTED, and
 * it is the number that says whether the split meant anything: a clean molecule separates by many orders. ***
 */
export function splitSpectrum(eigs, { relTol = Math.sqrt(Number.EPSILON) } = {}) {
    const s = [...eigs].map(Math.abs).sort((a, b) => a - b);
    const max = s[s.length - 1] || 0;
    const thresh = relTol * max;
    let zeros = 0;
    while (zeros < s.length && s[zeros] <= thresh) zeros++;
    const largestZero = zeros ? s[zeros - 1] : 0;
    const smallestVib = zeros < s.length ? s[zeros] : Infinity;
    return {
        zeros, vibrations: s.length - zeros, sorted: s, threshold: thresh, largestZero, smallestVib,
        gap: smallestVib / Math.max(largestZero, Number.MIN_VALUE),
    };
}

/** Frequencies omega = sqrt(lambda) for the vibrational eigenvalues, ascending. */
export const frequencies = (eigs, zeros) =>
    [...eigs].sort((a, b) => a - b).slice(zeros).map((l) => Math.sqrt(Math.max(l, 0)));

// ---- exactly-constructed equilibrium geometries (no optimiser, no tolerance) --------------------------------

/** A diatomic at its rest length: both terms at their own minimum, so the force is zero by construction. */
export function diatomic({ r0 = 1.2, k = 3.5, m1 = 1, m2 = 16 } = {}) {
    return {
        N: 2, pos: new Float64Array([0, 0, 0, r0, 0, 0]), masses: [m1, m2],
        bonds: [{ i: 0, j: 1, k, r0 }], angles: [], linear: true,
        omegaExact: Math.sqrt(k / ((m1 * m2) / (m1 + m2))),
    };
}

/** A bent triatomic (water-shaped): two bonds at r0, one angle at theta0. Non-linear -> six zero modes. */
export function bentTriatomic({ r0 = 0.96, thetaDeg = 104.5, kb = 4.2, ka = 1.3, mO = 16, mH = 1 } = {}) {
    const t = thetaDeg * Math.PI / 180, half = t / 2;
    const pos = new Float64Array([
        0, 0, 0,                                        // vertex (O)
        r0 * Math.sin(half), r0 * Math.cos(half), 0,     // H1
        -r0 * Math.sin(half), r0 * Math.cos(half), 0,    // H2
    ]);
    return {
        N: 3, pos, masses: [mO, mH, mH], linear: false,
        bonds: [{ i: 1, j: 0, k: kb, r0 }, { i: 2, j: 0, k: kb, r0 }],
        angles: [{ i: 1, j: 0, k: 2, kang: ka, cos0: Math.cos(t) }],
    };
}

/** A collinear triatomic: the same terms with theta0 = 180 deg. LINEAR -> five zero modes. */
export function linearTriatomic({ r0 = 1.16, kb = 5.0, ka = 0.9, mC = 12, mO = 16 } = {}) {
    return {
        N: 3, pos: new Float64Array([0, 0, 0, r0, 0, 0, -r0, 0, 0]), masses: [mC, mO, mO], linear: true,
        bonds: [{ i: 1, j: 0, k: kb, r0 }, { i: 2, j: 0, k: kb, r0 }],
        angles: [{ i: 1, j: 0, k: 2, kang: ka, cos0: -1 }],
    };
}

/**
 * A four-atom TORSIONAL chain i-j-k-l, planar and trans. All four atoms lie in the xy-plane, so the dihedral is
 * EXACTLY 180 degrees; with n = 3 and gamma = 0, V = kd(1 + cos 3phi) has cos(540 deg) = -1 -- a MINIMUM, with
 * zero gradient and a positive second derivative 9*kd. Bonds at r0 and angles at cos0 as before, so the whole
 * force field is at an exact stationary point with nothing minimised numerically.
 *
 * *** ITS NEGATIVE IS THE POINT: DROP THE TORSION TERM AND ROTATION ABOUT THE j-k BOND COSTS NOTHING. A free
 * internal rotation IS AN EXTRA ZERO MODE, so the count falls to 3N-7. THE COUNTING LAW THEREFORE DETECTS
 * WHETHER dihedrals.js CONTRIBUTES AT ALL -- not whether it is accurate, whether it is THERE. ***
 */
export function torsionalChain({ r0 = 1.5, thetaDeg = 112, kb = 4.0, ka = 1.5, kd = 0.9, n = 3, m = 12 } = {}) {
    const t = thetaDeg * Math.PI / 180, c = Math.cos(t), sn = Math.sin(t);
    const pos = new Float64Array([
        r0 * c, r0 * sn, 0,          // i   (off the axis, +y)
        0, 0, 0,                      // j
        r0, 0, 0,                     // k
        r0 - r0 * c, -r0 * sn, 0,     // l   (opposite side, -y)  -> trans, phi = 180 deg
    ]);
    return {
        N: 4, pos, masses: [m, m, m, m], linear: false,
        bonds: [{ i: 0, j: 1, k: kb, r0 }, { i: 1, j: 2, k: kb, r0 }, { i: 2, j: 3, k: kb, r0 }],
        angles: [{ i: 0, j: 1, k: 2, kang: ka, cos0: c }, { i: 1, j: 2, k: 3, kang: ka, cos0: c }],
        dihedrals: [{ i: 0, j: 1, k: 2, l: 3, kd, n }],
        impropers: [],
    };
}

/**
 * A planar centre (formaldehyde-shaped): atom 3 at the origin with three neighbours at 120 degrees in the
 * xy-plane. Coplanar means the signed volume V6 = a . (b x c) is EXACTLY zero, which is the improper's target
 * v0 = 0 -- so that term too sits at its own minimum by construction.
 */
export function planarCentre({ r0 = 1.2, kb = 4.5, ka = 1.1, kimp = 2.0, mC = 12, mX = 8 } = {}) {
    const ang = [90, 210, 330].map((d) => d * Math.PI / 180);
    const pos = new Float64Array([
        ...ang.flatMap((a) => [r0 * Math.cos(a), r0 * Math.sin(a), 0]),
        0, 0, 0,
    ]);
    const cos120 = Math.cos(120 * Math.PI / 180);
    return {
        N: 4, pos, masses: [mX, mX, mX, mC], linear: false,
        bonds: [{ i: 0, j: 3, k: kb, r0 }, { i: 1, j: 3, k: kb, r0 }, { i: 2, j: 3, k: kb, r0 }],
        angles: [{ i: 0, j: 3, k: 1, kang: ka, cos0: cos120 }, { i: 1, j: 3, k: 2, kang: ka, cos0: cos120 },
                 { i: 2, j: 3, k: 0, kang: ka, cos0: cos120 }],
        dihedrals: [],
        impropers: [{ i: 0, j: 1, k: 2, l: 3, kimp, v0: 0 }],
    };
}

/** The counting law itself, stated once so nothing downstream retypes it. */
export const expectedZeros = (N, linear) => (N === 1 ? 3 : (linear ? 5 : 6));
export const expectedVibrations = (N, linear) => 3 * N - expectedZeros(N, linear);
