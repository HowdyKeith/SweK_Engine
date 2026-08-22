// math/elliptic.js
//
// Legendre's elliptic integrals F(phi|m), E(phi|m), K(m), E(m) -- computed through CARLSON'S SYMMETRIC FORMS
// RF and RD by the duplication-plus-truncated-series method (Carlson 1995).
//
// WHY THIS FILE EXISTS, AND IT IS NOT THE CODE. Elliptic integrals are one of the very few things this tree can
// grade WITHOUT A REFERENCE IMPLEMENTATION, because they carry EXACT EXTERNAL ANCHORS that no amount of agreeing
// with myself can manufacture:
//
//   F(phi|0) = phi,  E(phi|0) = phi,  K(0) = E(0) = pi/2           (the degenerate parameter)
//   E(phi|1) = sin(phi),  F(phi|1) = ln(tan(phi/2 + pi/4))         (the other degenerate parameter)
//   LEGENDRE'S RELATION:  E(m) K(1-m) + E(1-m) K(m) - K(m) K(1-m) = pi/2   for every 0 < m < 1
//
// The last one is the reason this is worth having. It ties FOUR separately computed numbers at TWO different
// parameters to a constant that is not in the code, and it holds on a continuum rather than at one point, so
// it cannot be satisfied by a lucky constant or by a routine that is self-consistently wrong. That is the same
// shape as v3618's erf, which was pinned two ways sharing no code AND against a known fifteen-digit constant.
//
// THREE ROUTES, SHARING NO CODE, ON PURPOSE:
//   (1) CARLSON      -- rf/rd below, duplication + a fifth/sixth-order truncated series. The shipped route.
//   (2) AGM          -- agmK/agmE, Gauss's arithmetic-geometric mean. COMPLETE integrals only. Not a variant of
//                       (1): quadratic convergence by a different recurrence, no series truncation at all.
//   (3) QUADRATURE   -- quadF/quadE, composite Simpson straight down the DEFINING integral. Slow, dumb, and
//                       derived from the definition rather than from any identity, which is exactly its value.
// Two routes agreeing could be two typos agreeing. Three routes plus an external constant could not.
//
// *** THE TRAP THAT MADE THIS WORTH GATING, AND IT IS THIS TREE'S OLDEST SHAPE -- TWO THINGS WEARING ONE LABEL.
// The literature writes these integrals against the PARAMETER m and against the MODULUS k, with m = k^2, and
// both are routinely called "the elliptic integral of the first kind, K". Mathematica's EllipticK takes m;
// Abramowitz & Stegun's tables and most textbooks take k; GLSL and C libraries split about evenly. AND EVERY
// ANCHOR IN THE FIRST PARAGRAPH IS BLIND TO THE DIFFERENCE, because m = k^2 has fixed points at exactly 0 and 1
// -- the two places the identities live. A convention error is therefore INVISIBLE to the obvious answer key and
// shows up only in the interior, where K(m=0.5) = 1.8541 against K(k=0.5) = K(m=0.25) = 1.6858, a 10% miss that
// looks like a tolerance problem rather than a wrong function. THIS FILE TAKES m EVERYWHERE, says so in every
// signature, and its gate discriminates the two rather than trusting the label. ***
//
// WHAT IT REFUSES, BY NAME. A refusal is a third kind of answer key here (instruments-selfcheck, v3382):
//   * m >= 1 for the COMPLETE integrals: K(1) is infinite. Returning a large finite number would be decoration.
//   * 1 - m sin^2(phi) <= 0 for the INCOMPLETE ones: the integrand is imaginary past the turning point. This is
//     the real-valued branch and it says so rather than returning NaN from a sqrt and letting it propagate.
//   * more than one of RF's three arguments zero, or any negative: outside the real symmetric branch.
//   * THE CORNER phi = pi/2 WITH m = 1, where the turning point lands exactly on the endpoint. F diverges there
//     and E does not (E(pi/2|1) = 1), so ONE condition covers a divergence and a finite value at once -- the
//     incomplete route refuses both and the COMPLETE branch below returns E(1) = 1 by its own exact line.
// Each refusal returns null. Nothing here returns a plausible number for a question it cannot answer.
//
// ACCURACY, AND IT IS A CLAIM ABOUT AN EXPONENT RATHER THAN AN ERROR. Carlson's duplication reduces the
// arguments until they agree to within `errtol`, then adds a Taylor series truncated so the remaining error is
// O(errtol^6). That exponent is the thing worth checking: an error VALUE is whatever this machine printed today,
// while an ORDER is a property of the algorithm and falls out of a sweep. The gate measures it.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins. It is +,-,*,/ and sqrt/log/sin/cos/asin, so it runs
// identically in a page, in a gate, and in a shader.

// ------------------------------------------------------------------------------------------------------------
// Carlson RF -- the symmetric elliptic integral of the first kind.
//     RF(x,y,z) = (1/2) INT_0^inf dt / sqrt((t+x)(t+y)(t+z))
// Duplication: replace (x,y,z) by ((x+L)/4, (y+L)/4, (z+L)/4) with L = sqrt(xy)+sqrt(yz)+sqrt(zx). Each pass
// quarters the spread of the arguments, so the three converge on a common mean; the series is then evaluated in
// the small deviations from that mean. RF is homogeneous of degree -1/2, which is why the mean carries the scale.
// ------------------------------------------------------------------------------------------------------------
export function rf(x, y, z, errtol = 0.0008) {
    if (!(x >= 0) || !(y >= 0) || !(z >= 0)) return null;
    if ((x === 0 ? 1 : 0) + (y === 0 ? 1 : 0) + (z === 0 ? 1 : 0) > 1) return null;  // at most ONE may vanish
    let mu = 0, dx = 0, dy = 0, dz = 0, its = 0;
    for (; its < 200; its++) {
        const sx = Math.sqrt(x), sy = Math.sqrt(y), sz = Math.sqrt(z);
        const lam = sx * (sy + sz) + sy * sz;
        x = 0.25 * (x + lam); y = 0.25 * (y + lam); z = 0.25 * (z + lam);
        mu = (x + y + z) / 3;
        dx = (mu - x) / mu; dy = (mu - y) / mu; dz = (mu - z) / mu;
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) < errtol) break;
    }
    const e2 = dx * dy - dz * dz, e3 = dx * dy * dz;
    // 1 - E2/10 + E3/14 + E2^2/24 - 3 E2 E3 / 44, grouped so it is one Horner pass.
    return { value: (1 + (e2 / 24 - 0.1 - 3 * e3 / 44) * e2 + e3 / 14) / Math.sqrt(mu), iterations: its + 1 };
}

// ------------------------------------------------------------------------------------------------------------
// Carlson RD -- the symmetric integral of the second kind, degenerate in its third argument.
//     RD(x,y,z) = (3/2) INT_0^inf dt / ((t+z) sqrt((t+x)(t+y)(t+z)))
// The extra (t+z) means each duplication pass leaves a residue behind, so RD accumulates a SUM as it descends
// and the series only supplies the tail. That is the whole structural difference from rf above.
// ------------------------------------------------------------------------------------------------------------
export function rd(x, y, z, errtol = 0.0008) {
    if (!(x >= 0) || !(y >= 0) || !(z > 0)) return null;   // z carries the pole: it may not vanish
    if (x === 0 && y === 0) return null;
    let sum = 0, fac = 1, mu = 0, dx = 0, dy = 0, dz = 0, its = 0;
    for (; its < 200; its++) {
        const sx = Math.sqrt(x), sy = Math.sqrt(y), sz = Math.sqrt(z);
        const lam = sx * (sy + sz) + sy * sz;
        sum += fac / (sz * (z + lam));
        fac *= 0.25;
        x = 0.25 * (x + lam); y = 0.25 * (y + lam); z = 0.25 * (z + lam);
        mu = 0.2 * (x + y + 3 * z);
        dx = (mu - x) / mu; dy = (mu - y) / mu; dz = (mu - z) / mu;
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) < errtol) break;
    }
    const ea = dx * dy, eb = dz * dz, ec = ea - eb, ed = ea - 6 * eb, ee = ed + ec + ec;
    const tail = 1 + ed * (-3 / 14 + 9 * ed / 88 - 9 * dz * ee / 52)
        + dz * (ee / 6 + dz * (-9 * ec / 22 + 3 * dz * ea / 26));
    return { value: 3 * sum + fac * tail / (mu * Math.sqrt(mu)), iterations: its + 1 };
}

// ------------------------------------------------------------------------------------------------------------
// Legendre's forms. PARAMETER m, NOT MODULUS k -- see the trap note in the header. m = k^2 = sin^2(alpha).
//     F(phi|m) = INT_0^phi dtheta / sqrt(1 - m sin^2 theta)
//     E(phi|m) = INT_0^phi sqrt(1 - m sin^2 theta) dtheta
// In Carlson's forms, with c = cos^2 phi and d = 1 - m sin^2 phi:
//     F = sin(phi) RF(c, d, 1)
//     E = sin(phi) RF(c, d, 1) - (m/3) sin^3(phi) RD(c, d, 1)
// ------------------------------------------------------------------------------------------------------------
export function ellipF(phi, m, errtol) {
    const s = Math.sin(phi), c = Math.cos(phi) * Math.cos(phi), d = 1 - m * s * s;
    if (!(d > 0)) return null;                       // past the turning point: the real branch ends here
    const R = rf(c, d, 1, errtol);
    return R ? s * R.value : null;
}

export function ellipE(phi, m, errtol) {
    const s = Math.sin(phi), c = Math.cos(phi) * Math.cos(phi), d = 1 - m * s * s;
    if (!(d > 0)) return null;
    const R = rf(c, d, 1, errtol), D = rd(c, d, 1, errtol);
    if (!R || !D) return null;
    return s * R.value - (m / 3) * s * s * s * D.value;
}

// Complete integrals: phi = pi/2, so c = 0 and d = 1 - m. Written directly rather than by calling the
// incomplete pair at pi/2, because cos(pi/2) is not exactly zero in binary floating point and the exact zero
// is what makes RF(0, 1-m, 1) the clean statement of K.
export function ellipK(m, errtol) {
    if (!(m < 1)) return null;                       // K(1) is infinite; a large finite number would be a lie
    const R = rf(0, 1 - m, 1, errtol);
    return R ? R.value : null;
}

export function ellipEc(m, errtol) {
    if (!(m <= 1)) return null;
    if (m === 1) return 1;                           // E(1) = 1 exactly, and RD(0,0,1) does not exist
    const R = rf(0, 1 - m, 1, errtol), D = rd(0, 1 - m, 1, errtol);
    if (!R || !D) return null;
    return R.value - (m / 3) * D.value;
}

// ------------------------------------------------------------------------------------------------------------
// ROUTE 2 -- the arithmetic-geometric mean. COMPLETE integrals only. This shares NOTHING with Carlson above:
// no duplication, no truncated series, no symmetric forms. Gauss's observation is that
//     K(m) = pi / (2 AGM(1, sqrt(1-m)))
// and that the discarded half-differences c_n carry E:
//     E(m) = K(m) (1 - SUM_{n>=0} 2^(n-1) c_n^2),   c_0 = sqrt(m).
// AGM converges quadratically, so this is exact in ~5 passes and its error is pure round-off rather than a
// truncation. Where Carlson and AGM disagree, at least one of them is wrong -- neither can drag the other.
// ------------------------------------------------------------------------------------------------------------
export function agmK(m) {
    if (!(m < 1) || !(m >= 0)) return null;
    let a = 1, b = Math.sqrt(1 - m);
    for (let n = 0; n < 60; n++) {
        const a1 = 0.5 * (a + b), b1 = Math.sqrt(a * b);
        if (a1 === a && b1 === b) break;
        a = a1; b = b1;
    }
    return Math.PI / (2 * a);
}

export function agmE(m) {
    if (!(m < 1) || !(m >= 0)) return null;
    let a = 1, b = Math.sqrt(1 - m), c = Math.sqrt(m), sum = 0.5 * c * c, pow = 1;
    for (let n = 0; n < 60; n++) {
        const a1 = 0.5 * (a + b), b1 = Math.sqrt(a * b), c1 = 0.5 * (a - b);
        if (a1 === a && b1 === b) break;
        a = a1; b = b1; c = c1; pow *= 2;
        sum += 0.5 * pow * c * c;
    }
    return (Math.PI / (2 * a)) * (1 - sum);
}

// ------------------------------------------------------------------------------------------------------------
// ROUTE 3 -- composite Simpson on the DEFINING integral. Derived from the definition, not from an identity, so
// it is the route that cannot inherit a mistake from either of the others. Slow on purpose; `n` is panels.
// ------------------------------------------------------------------------------------------------------------
function simpson(f, a, b, n) {
    if (n % 2) n++;
    const h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
    return s * h / 3;
}
export const quadF = (phi, m, n = 200000) => simpson((t) => 1 / Math.sqrt(1 - m * Math.sin(t) * Math.sin(t)), 0, phi, n);
export const quadE = (phi, m, n = 200000) => simpson((t) => Math.sqrt(1 - m * Math.sin(t) * Math.sin(t)), 0, phi, n);

// ------------------------------------------------------------------------------------------------------------
// THE CONSUMER. A simple pendulum released from rest at theta0 has EXACT period
//     T = 4 sqrt(L/g) K(m),   m = sin^2(theta0 / 2)
// against the small-angle T0 = 2 pi sqrt(L/g). The ratio is a pure function of amplitude and of nothing else:
//     periodFactor(theta0) = T / T0 = K(sin^2(theta0/2)) / (pi/2)
// This is the external key the whole file is for -- a number predicted from an ANGLE, with nothing from any
// integrator in it, which is what makes it able to grade one.
// ------------------------------------------------------------------------------------------------------------
export function pendulumPeriodFactor(theta0) {
    const s = Math.sin(0.5 * theta0), m = s * s;
    const K = ellipK(m);
    return K === null ? null : K / (Math.PI / 2);
}
