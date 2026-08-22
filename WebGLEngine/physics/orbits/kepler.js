// physics/orbits/kepler.js
//
// TWO-BODY ORBITS -- v2820. Newtonian gravity around a fixed centre, and the reason this is worth building twice
// over: it has a stack of exact answers AND it is the sharpest available demonstration that HOW YOU INTEGRATE
// MATTERS MORE THAN HOW ACCURATE EACH STEP IS.
//
// THE EXACT ANSWER KEYS, none of them written into the integrators:
//
//   KEPLER III      T = 2 pi sqrt(a^3 / mu). The period follows from the semi-major axis alone -- not the
//                   eccentricity, not the speed, not where you started.
//   VIS-VIVA        v^2 = mu (2/r - 1/a). Speed anywhere on the orbit, from geometry.
//   ENERGY          E = v^2/2 - mu/r is CONSTANT.
//   ANGULAR MOMENTUM L = x vy - y vx is CONSTANT (and Kepler II, equal areas, is exactly this).
//   CLOSED ORBIT    the apsidal angle is EXACTLY pi. A 1/r^2 force gives an ellipse that does not precess --
//                   the perihelion returns to the same place forever. Any measured precession is the
//                   integrator lying, not the physics.
//
// THE SHARP CLAIM: a SYMPLECTIC integrator (velocity Verlet, 2nd order) keeps its energy error BOUNDED for all
// time -- it oscillates around the truth and never wanders. RK4 is FOURTH order and far more accurate per step,
// yet its energy DRIFTS SECULARLY: the error grows without limit, orbit after orbit, until the orbit visibly
// decays. So the better-looking method is the wrong one for long integrations, and the difference is not
// subtle -- it is the difference between an error that returns and an error that accumulates.
//
// That is also exactly the physics a space game needs: ships in gravity wells integrated for hours of play.
//
// Pure, no imports, browser-safe. Units: G = 1, central mass mu, planar motion.

// ---- exact orbital mechanics -------------------------------------------------------------------------
export const period = (a, mu = 1) => 2 * Math.PI * Math.sqrt((a * a * a) / mu);
export const visViva = (r, a, mu = 1) => Math.sqrt(Math.max(0, mu * (2 / r - 1 / a)));
export const specificEnergy = (state, mu = 1) => {
    const r = Math.hypot(state.x, state.y);
    return 0.5 * (state.vx * state.vx + state.vy * state.vy) - mu / r;
};
export const angularMomentum = (s) => s.x * s.vy - s.y * s.vx;
export const semiMajorFromEnergy = (E, mu = 1) => (E < 0 ? -mu / (2 * E) : Infinity);

// Eccentricity from the Laplace-Runge-Lenz vector: another exact route to the same orbit, sharing no code with
// the energy/momentum path, so agreement between them is evidence.
export function eccentricityVector(s, mu = 1) {
    const r = Math.hypot(s.x, s.y);
    const v2 = s.vx * s.vx + s.vy * s.vy;
    const rv = s.x * s.vx + s.y * s.vy;
    const ex = (v2 / mu - 1 / r) * s.x - (rv / mu) * s.vx;
    const ey = (v2 / mu - 1 / r) * s.y - (rv / mu) * s.vy;
    return { ex, ey, e: Math.hypot(ex, ey) };
}

// A state on an ellipse of semi-major axis a and eccentricity e, started at perihelion on the +x axis.
/**
 * *** v3762 -- `speedAt` EXISTS SO A PLANT CAN SIT ON ONE SIDE ONLY, AND IT DEFAULTS TO CORRECT.
 * kepler's period key is a MIRROR FOR mu: measurePeriod hands the SAME mu to period() and to step(), so a
 * wrong gravitational parameter cancels -- MEASURED, periodErrFrac is BIT-IDENTICAL at 3.885e-5 across
 * mu 1 -> 8 -> 64. A PLANT ON mu WOULD PROVE NOTHING (v3733's shape, and the third device running after ct
 * and the interferometer). So the plant has to change THE ORBIT THE INTEGRATOR PRODUCES without changing
 * WHAT period(a, mu) PREDICTS, and the initial condition is the only place that does both. ***
 *
 * THE CONFUSION IS REAL: the perihelion speed is usually quoted as sqrt(mu/a * (1+e)/(1-e)), and INVERTING
 * THAT RATIO GIVES THE APHELION SPEED. Applying it at the PERIHELION radius is a start nobody would catch by
 * eye -- both numbers are correct speeds for this orbit, just not at that radius.
 * MEASURED at a=1, e=0.3: it gives a = 0.431280 rather than 1, a period ratio of 0.2832.
 */
export function atPerihelion(a, e, mu = 1, speedAt = "perihelion") {
    const rp = a * (1 - e);
    const rSpeed = speedAt === "aphelion" ? a * (1 + e) : rp;
    return { x: rp, y: 0, vx: 0, vy: visViva(rSpeed, a, mu) };
}

// ---- the two integrators -----------------------------------------------------------------------------
const accel = (x, y, mu) => { const r2 = x * x + y * y; const r = Math.sqrt(r2); const k = -mu / (r2 * r); return [k * x, k * y]; };

// Velocity Verlet -- SYMPLECTIC. Second order, cheap, and it conserves a nearby "shadow" energy exactly, which
// is why its true energy error oscillates instead of drifting.
export function stepVerlet(s, dt, mu = 1) {
    let [ax, ay] = accel(s.x, s.y, mu);
    const x = s.x + s.vx * dt + 0.5 * ax * dt * dt;
    const y = s.y + s.vy * dt + 0.5 * ay * dt * dt;
    const [ax2, ay2] = accel(x, y, mu);
    return { x, y, vx: s.vx + 0.5 * (ax + ax2) * dt, vy: s.vy + 0.5 * (ay + ay2) * dt };
}

// Classical RK4 -- NOT symplectic. Fourth order: far more accurate per step, and wrong in a way that compounds.
export function stepRK4(s, dt, mu = 1) {
    const f = (st) => { const [ax, ay] = accel(st.x, st.y, mu); return { x: st.vx, y: st.vy, vx: ax, vy: ay }; };
    const add = (st, k, h) => ({ x: st.x + k.x * h, y: st.y + k.y * h, vx: st.vx + k.vx * h, vy: st.vy + k.vy * h });
    const k1 = f(s), k2 = f(add(s, k1, dt / 2)), k3 = f(add(s, k2, dt / 2)), k4 = f(add(s, k3, dt));
    return {
        x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
        y: s.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
        vx: s.vx + (dt / 6) * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
        vy: s.vy + (dt / 6) * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
    };
}

export const INTEGRATORS = { verlet: stepVerlet, rk4: stepRK4 };

// ---- integrate and measure ---------------------------------------------------------------------------
// Runs `orbits` orbital periods and reports how well each conserved quantity survived, plus the WORST energy
// error seen in the first half against the second half -- the number that separates bounded from drifting.
export function integrate({ a = 1, e = 0.3, mu = 1, integrator = "verlet", stepsPerOrbit = 400, orbits = 50, sample = 0 } = {}) {
    const step = INTEGRATORS[integrator];
    if (!step) throw new Error("unknown integrator: " + integrator);
    let s = atPerihelion(a, e, mu);
    const T = period(a, mu);
    const dt = T / stepsPerOrbit;
    const total = Math.round(stepsPerOrbit * orbits);
    const E0 = specificEnergy(s, mu), L0 = angularMomentum(s);
    let maxErrFirst = 0, maxErrSecond = 0, maxLErr = 0;
    const path = [];
    // v3526 -- *** THE SERIES NEVER EXISTED. *** This loop collapses the energy error to two running maxima on
    // the fly and returns the ratio between them -- which IS auditConservation's algorithm, hand-rolled here
    // before that module was written (v3448), and never reconciled with it. v3525 censused the lab and found
    // that THIRTY DEVICES check conservation and every one collapses inside its bind, so criterion five could
    // not be asked of a single one of them. This is the first device to keep the quantity itself.
    //
    // IT SAMPLES THE ENERGY, NOT THE ERROR, because that is what a conserved quantity is: auditConservation
    // measures excursion from the FIRST sample, so handing it a pre-computed error would ask it to audit the
    // drift of a drift. And it SAMPLES rather than keeps every step -- 200 orbits at 400 steps is 80,000
    // numbers and no baseline should carry that. THE COST OF SAMPLING IS MEASURED RATHER THAN ASSUMED: see
    // keplerBind's energyGrowthShared beside energyGrowthRatio.
    const energySeries = [];
    const seriesEvery = Math.max(1, Math.floor(total / 64));
    const half = Math.floor(total / 2);
    for (let i = 0; i < total; i++) {
        s = step(s, dt, mu);
        const Ei = specificEnergy(s, mu);
        if (i % seriesEvery === 0) energySeries.push(Ei);
        const eErr = Math.abs((Ei - E0) / E0);
        const lErr = Math.abs((angularMomentum(s) - L0) / L0);
        if (i < half) maxErrFirst = Math.max(maxErrFirst, eErr); else maxErrSecond = Math.max(maxErrSecond, eErr);
        maxLErr = Math.max(maxLErr, lErr);
        if (sample && i % sample === 0) path.push([s.x, s.y]);
    }
    const Efinal = specificEnergy(s, mu);
    return {
        integrator, a, e, orbits, stepsPerOrbit, dt,
        energyErrFirstHalf: maxErrFirst,
        energyErrSecondHalf: maxErrSecond,
        // > 1 means the error is still growing; ~1 means it is bounded and merely oscillating
        energyGrowthRatio: maxErrFirst > 0 ? maxErrSecond / maxErrFirst : Infinity,
        energyErrFinal: Math.abs((Efinal - E0) / E0),
        angularMomentumErr: maxLErr,
        semiMajorDrift: Math.abs(semiMajorFromEnergy(Efinal, mu) - a) / a,
        finalState: s, path,
        energySeries, energySeriesEvery: seriesEvery, energyStart: E0,
    };
}

// Measure the ORBITAL PERIOD from the simulation by timing successive perihelion passages (radius minima),
// then compare with Kepler III. Nothing in the detector knows the formula.
export function measurePeriod({ a = 1, e = 0.3, mu = 1, integrator = "verlet", stepsPerOrbit = 2000, orbits = 6, speedAt = "perihelion" } = {}) {
    const step = INTEGRATORS[integrator];
    let s = atPerihelion(a, e, mu, speedAt);   // v3762 -- ONLY measurePeriod threads the plant option
    const T = period(a, mu);
    const dt = T / stepsPerOrbit;
    const total = Math.round(stepsPerOrbit * orbits);
    const passes = [];
    let rPrev = Math.hypot(s.x, s.y), rPrev2 = rPrev;
    for (let i = 0; i < total; i++) {
        s = step(s, dt, mu);
        const r = Math.hypot(s.x, s.y);
        // a local minimum in radius is a perihelion passage; parabolic interpolation for sub-step timing
        if (i > 1 && rPrev < rPrev2 && rPrev <= r) {
            const denom = rPrev2 - 2 * rPrev + r;
            const frac = denom !== 0 ? 0.5 * (rPrev2 - r) / denom : 0;
            passes.push((i - 1 + frac) * dt);
        }
        rPrev2 = rPrev; rPrev = r;
    }
    if (passes.length < 2) return { measured: null, theory: T, passes: passes.length };
    const measured = (passes[passes.length - 1] - passes[0]) / (passes.length - 1);
    return { measured, theory: T, errFrac: Math.abs(measured - T) / T, passes: passes.length };
}

// Kepler III across a range of semi-major axes: fit log T against log a. The slope must be exactly 3/2.
export function keplerThirdLaw({ axes = [0.6, 0.8, 1.0, 1.4, 2.0], e = 0.2, mu = 1, integrator = "verlet", stepsPerOrbit = 1500, orbits = 4 } = {}) {
    const pts = [];
    for (const a of axes) {
        const m = measurePeriod({ a, e, mu, integrator, stepsPerOrbit, orbits });
        if (m.measured) pts.push({ a, T: m.measured, theory: m.theory, errFrac: m.errFrac });
    }
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pts) { const x = Math.log(p.a), y = Math.log(p.T); n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const slope = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : NaN;
    return { points: pts, slopeMeasured: slope, slopeTheory: 1.5, slopeErrFrac: Math.abs(slope - 1.5) / 1.5 };
}

// Apsidal precession: for a 1/r^2 force the perihelion must return to EXACTLY the same angle every orbit.
// Any measured rotation per orbit is integrator error, and it is a different failure from energy drift.
export function apsidalPrecession({ a = 1, e = 0.5, mu = 1, integrator = "verlet", stepsPerOrbit = 2000, orbits = 12 } = {}) {
    const step = INTEGRATORS[integrator];
    let s = atPerihelion(a, e, mu);
    const dt = period(a, mu) / stepsPerOrbit;
    const total = Math.round(stepsPerOrbit * orbits);
    const angles = [];
    let rPrev = Math.hypot(s.x, s.y), rPrev2 = rPrev, sPrev = s;
    for (let i = 0; i < total; i++) {
        const sNext = step(s, dt, mu);
        const r = Math.hypot(sNext.x, sNext.y);
        if (i > 1 && rPrev < rPrev2 && rPrev <= r) angles.push(Math.atan2(sPrev.y, sPrev.x));
        rPrev2 = rPrev; rPrev = r; sPrev = s; s = sNext;
    }
    if (angles.length < 2) return { perOrbitRad: null, passes: angles.length };
    let drift = 0;
    for (let i = 1; i < angles.length; i++) {
        let d = angles[i] - angles[i - 1];
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        drift += d;
    }
    return { perOrbitRad: drift / (angles.length - 1), passes: angles.length };
}
