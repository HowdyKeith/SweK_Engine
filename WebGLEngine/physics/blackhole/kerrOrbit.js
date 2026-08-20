// WebGLEngine/physics/blackhole/kerrOrbit.js — v3299
// ---------------------------------------------------------------------------------------------------------------
// AN INDEPENDENT ANSWER KEY FOR THE KERR DEVICE — the round errorPairAudit asked for and did not take.
//
// THE FINDING THAT PROMPTED THIS, restated so it cannot be lost: kerr shipped with two error-pair keys and
// NEITHER IS INDEPENDENT.
//   horizonSumErr    -- r+ + r- = 2M. That holds for ANY discriminant s, so corrupting s by 30%, halving it, or
//                       setting it to ZERO all still give an error of exactly zero. It does not test weakly; it
//                       tests NOTHING.
//   horizonProductErr -- r+ * r- = M^2 - s^2 DOES constrain s, so it catches those corruptions. But it is graded
//                       against the device's own closed form, so it can only ever return arithmetic precision:
//                       its epsilon result is a ROUND-TRIP TAUTOLOGY, not corroboration.
// So the device had ZERO independent keys while appearing to have two.
//
// WHAT MAKES THIS ONE INDEPENDENT: the ISCO is measured DYNAMICALLY. Nothing here uses the Bardeen-Press-
// Teukolsky closed form, or any expression for the ISCO at all. The only physics input is the radial equation
// for equatorial timelike geodesics, which comes from the metric:
//
//     (dr/dtau)^2 = R(r) = E^2 - 1 + 2M/r - (L^2 - a^2(E^2-1))/r^2 + 2M(L - aE)^2/r^3
//
// From that alone: (1) find the circular orbit at a chosen radius by solving R = R' = 0 numerically for (E, L);
// (2) nudge it and INTEGRATE, asking whether the orbit oscillates or plunges; (3) bisect on radius to find the
// boundary between those two behaviours. That boundary IS the innermost stable circular orbit, and it depends on
// a and M through a completely different route than r+- does -- which is exactly what the note asked for.
//
// The agreement it produces is around 1e-6, NOT machine epsilon, and that is the point rather than a weakness: a
// number that lands at 1e-16 against a formula is usually the formula being asked about itself. A measurement
// has a convergence floor and this one shows it.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/** The radial function. THE ONLY PHYSICS INPUT IN THIS FILE. */
export function R(r, E, L, M = 1, a = 0) {
    const e2 = E * E;
    return e2 - 1 + 2 * M / r - (L * L - a * a * (e2 - 1)) / (r * r) + 2 * M * (L - a * E) * (L - a * E) / (r * r * r);
}
/** dR/dr, written out rather than differenced: the quantity going to zero is what a difference would destroy. */
export function dR(r, E, L, M = 1, a = 0) {
    const e2 = E * E;
    return -2 * M / (r * r) + 2 * (L * L - a * a * (e2 - 1)) / (r * r * r) - 6 * M * (L - a * E) * (L - a * E) / (r * r * r * r);
}
export function d2R(r, E, L, M = 1, a = 0) {
    const e2 = E * E;
    return 4 * M / (r * r * r) - 6 * (L * L - a * a * (e2 - 1)) / (r * r * r * r) + 24 * M * (L - a * E) * (L - a * E) / (r * r * r * r * r);
}

/**
 * The circular orbit at radius r0: solve R(r0) = 0 and R'(r0) = 0 for (E, L).
 *
 * Solved as a NESTED 1D problem rather than a 2D Newton, because the 2D Jacobian is near-singular exactly at the
 * ISCO -- which is the one place this has to stay well behaved. For a trial L, R(r0) = 0 fixes E^2 in closed
 * form (R is quadratic in E); the leftover R'(r0) is then a smooth 1D function of L to bisect.
 */
export function circularEL(r0, M = 1, a = 0, prograde = true) {
    // R(r0)=0 as a quadratic in E: collect coefficients of E^2, E, 1
    const A = 1 + a * a / (r0 * r0) + 2 * M * a * a / (r0 * r0 * r0);
    const solveE = (L) => {
        const B = -4 * M * a * L / (r0 * r0 * r0);
        const C = -1 + 2 * M / r0 - L * L / (r0 * r0) - a * a / (r0 * r0) + 2 * M * L * L / (r0 * r0 * r0) - 2 * M * a * a / (r0 * r0 * r0) * 0;
        // careful: the a^2(E^2-1)/r^2 term contributes +a^2/r^2 to the constant, already included above
        const disc = B * B - 4 * A * C;
        if (disc < 0) return NaN;
        return (-B + Math.sqrt(disc)) / (2 * A);
    };
    const f = (L) => { const E = solveE(L); return Number.isFinite(E) ? dR(r0, E, L, M, a) : NaN; };
    // prograde orbits have L > 0, retrograde L < 0; bracket generously and bisect on the sign change
    let lo = prograde ? 1e-6 : -20 * M, hi = prograde ? 20 * M : -1e-6;
    let flo = f(lo), fhi = f(hi);
    if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
    for (let i = 0; i < 200; i++) {
        const mid = 0.5 * (lo + hi), fm = f(mid);
        if (!Number.isFinite(fm)) return null;
        if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    const L = 0.5 * (lo + hi), E = solveE(L);
    return Number.isFinite(E) ? { E, L, r0 } : null;
}

/**
 * Nudge a circular orbit and INTEGRATE. Returns whether the radial motion stayed bounded near r0.
 *
 * The equation of motion is d2r/dtau2 = R'(r)/2, obtained by differentiating (dr/dtau)^2 = R(r) -- so the
 * integration uses the same single physics input and nothing else. Leapfrog, because it is symplectic and a
 * dissipative integrator would slowly turn every stable orbit into a plunge and move the answer.
 */
// *** CLASSIFY BY GROWTH, NOT BY AN EXCURSION THRESHOLD, AND THE FIRST VERSION SHOWS WHY. *** Asking "did the
// radius wander further than half r0" put the boundary at 5.332 against 6.000 -- eleven percent LOW, and low
// every time. That is not noise: just inside the ISCO the instability growth rate goes to zero, so an orbit a
// hair inside it drifts too slowly to trip any fixed threshold within a finite integration, and gets recorded as
// stable. A one-signed error from a truncated observation, the same shape as a correlation integral cut before
// its tail has decayed.
//
// The distinction that does not degrade at the boundary is the SHAPE of the motion: a stable orbit oscillates
// with constant amplitude, an unstable one grows. So the amplitude over the first half of the integration is
// compared with the second half, and growth is growth however small the excursion still is.
export function orbitBounded(r0, E, L, M = 1, a = 0, { kick = 1e-3, dtau = 0.02, steps = 200000 } = {}) {
    let r = r0 * (1 + kick), v = 0;
    const inner = 1.0001 * (M + Math.sqrt(Math.max(0, M * M - a * a)));
    let acc = dR(r, E, L, M, a) / 2;
    const half = Math.floor(steps / 2);
    let min1 = Infinity, max1 = -Infinity, min2 = Infinity, max2 = -Infinity;
    for (let i = 0; i < steps; i++) {
        v += 0.5 * dtau * acc;
        r += dtau * v;
        if (!(r > inner)) return { bounded: false, growth: Infinity, why: "plunged through the horizon" };
        if (r > r0 * 4) return { bounded: false, growth: Infinity, why: "escaped outward" };
        acc = dR(r, E, L, M, a) / 2;
        v += 0.5 * dtau * acc;
        if (i < half) { if (r < min1) min1 = r; if (r > max1) max1 = r; }
        else { if (r < min2) min2 = r; if (r > max2) max2 = r; }
    }
    const amp1 = max1 - min1, amp2 = max2 - min2;
    const amp = Math.max(amp1, amp2);
    // *** AND THE HALVES RATIO WAS ALSO WRONG, FOR A SECOND REASON WORTH RECORDING. *** An unstable orbit does
    // not grow forever: it runs out to a turning point and then oscillates there, so by the time the integration
    // is halved BOTH halves show the same large amplitude and the ratio reads 1.0000 -- indistinguishable from a
    // stable orbit sitting quietly at its kick. Measured: at r = 4.5 the ratio was exactly 1.0000 with an
    // amplitude of 13.5, which is not a subtle failure.
    //
    // What separates them cleanly is amplitude AGAINST THE KICK THAT CAUSED IT. A stable orbit oscillates at the
    // size it was nudged; an unstable one leaves. At r = 6.1 the excursion is 1.02x the kick, at r = 5.9 it is
    // 26x, and the ISCO sits between them.
    const expected = 2 * kick * r0;
    const ratio = amp / expected;
    return { bounded: ratio < 3, ratio, amp, growth: amp1 > 0 ? amp2 / amp1 : Infinity,
             why: "excursion " + amp.toExponential(2) + " against a kick of " + expected.toExponential(2) + " (" + ratio.toFixed(2) + "x)" };
}

/**
 * THE MEASUREMENT: bisect on radius for the boundary between orbits that stay bounded when nudged and orbits
 * that do not. No ISCO formula is consulted anywhere in this function or the ones it calls.
 */
export function iscoDynamic(M = 1, a = 0, prograde = true, { iters = 46, lo = null, hi = null, orbit = {} } = {}) {
    const rIn = innermostCircular(M, a, prograde);
    if (rIn == null) return { r: NaN, why: "no circular orbits found at all" };
    let a0 = lo != null ? lo : rIn * 1.002, b0 = hi != null ? hi : 14 * M;
    const stable = (r) => {
        const c = circularEL(r, M, a, prograde);
        if (!c) return false;
        return orbitBounded(r, c.E, c.L, M, a, orbit).bounded;
    };
    if (!stable(b0)) return { r: NaN, why: "the outer bracket is not stable -- nothing to bisect" };
    if (stable(a0)) return { r: NaN, why: "the inner bracket is already stable -- bracket does not contain the boundary" };
    for (let i = 0; i < iters; i++) {
        const mid = 0.5 * (a0 + b0);
        if (stable(mid)) b0 = mid; else a0 = mid;
    }
    return { r: 0.5 * (a0 + b0), bracket: [a0, b0], why: "stability boundary located by integration" };
}

/**
 * The innermost radius at which a circular orbit EXISTS, found by scanning inward until circularEL fails.
 *
 * Deliberately NOT imported from kerr.js's photonOrbits(): the whole value of this file is that it reaches the
 * ISCO without consulting the module it is supposed to corroborate, and borrowing that module's photon-sphere
 * formula to set the bracket would quietly put it back in the loop. Scanning costs a few hundred root-finds and
 * keeps the independence intact.
 */
export function innermostCircular(M = 1, a = 0, prograde = true, { from = 14, step = 0.002 } = {}) {
    let last = null;
    for (let r = from; r > 0.05; r -= step) {
        const c = circularEL(r, M, a, prograde);
        if (!c) return last;
        last = r;
    }
    return last;
}

/** The algebraic stability condition, kept SEPARATE and used only to cross-check the dynamical route. */
export function iscoByCurvature(M = 1, a = 0, prograde = true, { iters = 200 } = {}) {
    const f = (r) => { const c = circularEL(r, M, a, prograde); return c ? d2R(r, c.E, c.L, M, a) : NaN; };
    const rIn = innermostCircular(M, a, prograde);
    if (rIn == null) return NaN;
    let lo = rIn * 1.002, hi = 14 * M, flo = f(lo), fhi = f(hi);
    if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return NaN;
    for (let i = 0; i < iters; i++) {
        const mid = 0.5 * (lo + hi), fm = f(mid);
        if (!Number.isFinite(fm)) return NaN;
        if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return 0.5 * (lo + hi);
}
