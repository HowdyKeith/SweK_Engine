// physics/blackhole/geodesic.js
//
// GR-exact light bending around a Schwarzschild black hole -- the real thing, not the pseudo-Newtonian potential in
// blackHole.js. A photon's path obeys the null-geodesic orbit equation in the inverse radius u = 1/r:
//
//     d^2u/dphi^2 + u = 3 M u^2       (units G = c = 1, so the horizon is r_s = 2M)
//
// We integrate that exactly and read off the observables general relativity predicts in closed form: the weak-field
// deflection is 4 M / b -- twice the Newtonian value, the factor that made the 1919 eclipse a confirmation of GR -- the
// photon sphere sits at r = 3M, and light with impact parameter below the critical b = 3 sqrt(3) M is swallowed, which is
// the shadow the Event Horizon Telescope images. Nobody feeds those numbers to the integrator; they fall out of the metric.
// The integrator uses trig-free arithmetic per step but the geometry is trig, so this is GATED, not fingerprinted.

// Analytic Schwarzschild constants (G = c = 1).
export const horizon = (M) => 2 * M;                 // event horizon r_s = 2M
export const photonSphere = (M) => 3 * M;            // unstable circular photon orbit r = 3M = 1.5 r_s
export const criticalImpact = (M) => 3 * Math.sqrt(3) * M;  // b_crit = 3 sqrt(3) M -- shadow edge; below this, capture
export const weakDeflection = (M, b) => 4 * M / b;   // 4M/b -- the Einstein deflection, for b >> M

// v3077 -- THE EXPANSION, so the integrator has something to be graded against BEYOND first order.
//
// deflection() integrates the geodesic numerically and weakDeflection() is the leading term. Checking one against
// the other says only "they agree when the field is weak", which they must -- it is the definition of the weak
// limit, and it would still hold if the integrator were wrong in every way that vanishes as b grows.
//
// The Schwarzschild deflection has a known series in M/b whose coefficients are exact:
//
//     alpha = 4(M/b) + (15 pi / 4)(M/b)^2 + (128/3)(M/b)^3 + ...
//
// That turns a vague agreement into a SHARP one: after subtracting k terms the residual must fall as b^-(k+1).
// The POWER LAW is the check, not the size of the residual -- a number that is merely small proves nothing,
// while a residual falling at exactly the predicted rate can only happen if every term up to that order is
// right. Same idiom the born device already uses to show its error is quadratic in phase.
//
// The coefficients are CARRIED, not derived here, and that is deliberate: deriving them in this file would make
// the key depend on the same algebra the module might have got wrong. They are standard published values.
export const DEFLECTION_SERIES = [4, 15 * Math.PI / 4, 128 / 3];

/** Deflection to `order` terms of the M/b expansion. order 1 is weakDeflection. */
export function deflectionSeries(M, b, order = 2) {
    const x = M / b;
    let a = 0;
    for (let k = 0; k < Math.min(order, DEFLECTION_SERIES.length); k++) a += DEFLECTION_SERIES[k] * Math.pow(x, k + 1);
    return a;
}

// Trace one photon in from infinity at impact parameter b. Integrates the orbit equation with RK4 in phi. Returns the
// total deflection angle if the photon escapes, or captured:true if it crosses the horizon. u=1/r; start at u=0 (infinity)
// with du/dphi = 1/b (incoming), let u rise to perihelion and fall back to 0 (escape), or run away to the horizon (capture).
// v3518 -- uMax IS NOW CARRIED OUT WITH THE RESULT, AND IT IS NOT DECORATION.
// The largest u the photon reaches is its perihelion, so rMin = 1/uMax is the CLOSEST APPROACH -- a LENGTH the
// integrator computes rather than one the caller handed in. Under the registered nuisance knob (M -> lambda*M
// together with b -> lambda*b) every dimensionless quantity this function produces is invariant BY DESIGN,
// which left lens with nothing the knob was ALLOWED to move: its liveness rested on deflectionErrFrac, which
// in the weak regime is BIT-FOR-BIT the declared invariant relWeak under another name. rMin scales as lambda
// exactly, so it is admissible evidence in a way no dimensionless output can be. See lensNuisance-selfcheck.
export function tracePhoton(M, b, { dphi = 2e-4, maxTurns = 12 } = {}) {
    const accel = (u) => 3 * M * u * u - u;          // d^2u/dphi^2
    let u = 0, du = 1 / b, phi = 0;
    const uHorizon = 1 / (2 * M), maxPhi = maxTurns * 2 * Math.PI;
    let pastPerihelion = false, uMax = 0;
    while (phi < maxPhi) {
        const uPrev = u;
        // RK4 step on (u, du)
        const k1u = du, k1d = accel(u);
        const k2u = du + 0.5 * dphi * k1d, k2d = accel(u + 0.5 * dphi * k1u);
        const k3u = du + 0.5 * dphi * k2d, k3d = accel(u + 0.5 * dphi * k2u);
        const k4u = du + dphi * k3d, k4d = accel(u + dphi * k3u);
        u += dphi / 6 * (k1u + 2 * k2u + 2 * k3u + k4u);
        du += dphi / 6 * (k1d + 2 * k2d + 2 * k3d + k4d);
        phi += dphi;
        if (u > uMax) uMax = u;
        if (du < 0) pastPerihelion = true;                   // perihelion passed -- photon heading back out
        if (u >= uHorizon) return { captured: true, phi, uMax };   // crossed the event horizon
        if (pastPerihelion && u <= 0) {                      // back at infinity -- interpolate the exact crossing
            const frac = uPrev / (uPrev - u);                // linear zero-crossing between uPrev(>0) and u(<=0)
            const phiCross = (phi - dphi) + frac * dphi;
            return { captured: false, deflection: phiCross - Math.PI, phi: phiCross, uMax };
        }
    }
    return { captured: true, phi, uMax };                   // wound many times without escaping -- effectively captured
}

// The measured deflection for an escaping photon (NaN if captured).
export function deflection(M, b, opts) { const r = tracePhoton(M, b, opts); return r.captured ? NaN : r.deflection; }

// Find the capture threshold in b by bisection: the largest b that is captured borders the smallest that escapes. Returns
// the boundary, which GR says is exactly 3 sqrt(3) M.
export function captureThreshold(M, { lo = 2 * M, hi = 8 * M, iters = 40, opts } = {}) {
    let a = lo, c = hi;
    for (let i = 0; i < iters; i++) {
        const m = 0.5 * (a + c);
        if (tracePhoton(M, m, opts).captured) a = m; else c = m;   // captured -> raise the floor
    }
    return 0.5 * (a + c);
}

// Trace the photon's path in the plane for drawing: returns the visible Cartesian points [x, y] with r = 1/u,
// (x, y) = (r cos phi, r sin phi), recorded once the ray enters r < rView. Marks whether it was captured.
export function tracePath(M, b, { dphi = 4e-3, rView = 22, maxTurns = 8 } = {}) {
    const accel = (u) => 3 * M * u * u - u;
    let u = 1e-9, du = 1 / b, phi = 0;
    const uHorizon = 1 / (2 * M), maxPhi = maxTurns * 2 * Math.PI, pts = [];
    let pastPerihelion = false;
    while (phi < maxPhi) {
        const k1u = du, k1d = accel(u);
        const k2u = du + 0.5 * dphi * k1d, k2d = accel(u + 0.5 * dphi * k1u);
        const k3u = du + 0.5 * dphi * k2d, k3d = accel(u + 0.5 * dphi * k2u);
        const k4u = du + dphi * k3d, k4d = accel(u + dphi * k3u);
        u += dphi / 6 * (k1u + 2 * k2u + 2 * k3u + k4u);
        du += dphi / 6 * (k1d + 2 * k2d + 2 * k3d + k4d);
        phi += dphi;
        if (u > 0) { const r = 1 / u; if (r < rView) pts.push([r * Math.cos(phi), r * Math.sin(phi)]); }
        if (du < 0) pastPerihelion = true;
        if (u >= uHorizon) return { captured: true, pts };
        if (pastPerihelion && u <= 0) return { captured: false, pts };
    }
    return { captured: true, pts };
}
