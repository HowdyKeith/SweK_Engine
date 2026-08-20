// physics/mechanics/pendulumExact.mjs
//
// The exact large-amplitude pendulum period, and the one claim in this tree that rests on it.
//
//     theta'' = -(g/L) sin(theta),   released from rest at theta0
//     T = 4 sqrt(L/g) K(m),          m = sin^2(theta0/2)          <-- EXACT, for every theta0 in (0, pi)
//     T0 = 2 pi sqrt(L/g)                                          <-- the small-angle limit
//     periodFactor(theta0) = T / T0 = K(m) / (pi/2)
//
// WHY THIS IS AN ANSWER KEY AND NOT A MODEL. periodFactor is a function of ONE ANGLE. Nothing about the grid,
// the timestep, the integrator or the machine enters it. So it can grade an integrator rather than be graded by
// one -- the erf/Stefan shape from v3618, arriving in mechanics. The gate integrates the real nonlinear equation
// and asks whether the measured return time lands on the predicted one; a small-angle prediction is wrong by a
// margin that GROWS WITH AMPLITUDE, so the fixture is its own discriminator and no tolerance has to be chosen to
// tell the two predictions apart.
//
// *** WHAT IT FOUND IN THE SHIPPED TREE, AND IT IS NOT A BUG. physics/pendulumWave.js steps each pendulum by the
// EXACT harmonic rotation of (theta, v) through omega*dt, so its row re-synchronises "to the bit" -- its own
// header says so, and that is true OF THE EQUATION IT SOLVES. But a real pendulum is not harmonic, and at the
// shipped default amp = 0.3 rad every pendulum in the row runs 0.565% SLOW against its assigned frequency. The
// re-synchronisation SURVIVES THAT ANYWAY, and the reason is the interesting part: all fifteen are released from
// the SAME amplitude, so they all take the SAME multiplicative stretch, the frequency RATIOS are untouched, and
// the pattern is unchanged -- IT JUST RUNS ON A CLOCK 0.565% SLOWER. The demo's exactness rests on the amplitudes
// being EQUAL, not on their being SMALL, and that had never been written down. ***
//
// *** AND THE TOLERANCE THAT FALLS OUT IS A REAL NUMBER NOBODY HAD. Since dT/T ~ theta0 dtheta0 / 8, an amplitude
// SPREAD across the row breaks the ratios, and the pendulum doing the most swings accumulates the most phase
// error. amplitudeTolerance() below derives how much spread the row tolerates for a stated phase budget. It is a
// prediction about a demo, and the gate checks it by simulating the demo. ***
//
// *** THE OBSERVABLE TRAP, AND IT IS v3619'S LESSON IN A NEW COSTUME. At the re-synchronisation instant every
// pendulum is at its TURNING POINT, where d(theta)/d(phase) = 0. So a phase error eps shows up in the ANGLES only
// as amp * eps^2 / 2 -- QUADRATICALLY SUPPRESSED. A 0.1 rad phase error, which is a visibly late pendulum, moves
// the drawn angle by 0.0015 rad, which is nothing. THE PICTURE IS A REAL CHECK AND IT IS A QUADRATICALLY WEAK
// ONE, so every claim here is measured in PHASE and the angles are only ever drawn. Stating the sensitivity of
// the instrument is the point; a check whose weakness is unstated is how a thing becomes impossible to falsify. ***

import { ellipK, pendulumPeriodFactor } from "../../math/elliptic.js";

export { pendulumPeriodFactor };

// Exact period, in seconds, of a simple pendulum of length L under gravity g released from rest at theta0.
export function pendulumPeriod({ L = 1, g = 9.80665, theta0 = 0.3 } = {}) {
    if (!(theta0 > 0) || !(theta0 < Math.PI)) return null;      // theta0 -> pi is the infinite-period separatrix
    const s = Math.sin(0.5 * theta0), K = ellipK(s * s);
    return K === null ? null : 4 * Math.sqrt(L / g) * K;
}

// ------------------------------------------------------------------------------------------------------------
// The independent route: integrate the real thing. RK4 on (theta, v), v = theta'. The period is the gap between
// the first and second zero crossings of theta, doubled.
//
// *** THE CROSSING IS LOCATED BY CUBIC HERMITE, NOT BY LINEAR INTERPOLATION, AND THAT IS NOT FUSSINESS -- IT IS
// THE v3619 LESSON. A crossing counted in whole steps is an INDEX and cannot see a perturbation smaller than one
// cell. Linear interpolation fixes the quantisation but is only O(dt^2) accurate, so IT BECOMES THE DOMINANT
// ERROR and the measured convergence order of the whole method is neither 4 nor 2 but a mixture: with linear
// interpolation the error is NON-MONOTONE in dt (1.22e-9, 1.65e-9, 6.51e-11, 1.34e-11 over dt 4e-3 -> 5e-4),
// because two error terms of opposite sign cancel near dt ~ 3e-3 and an order fitted through that region reads
// -0.44. THE INSTRUMENT WAS LIMITING THE MEASUREMENT. Hermite uses the velocity we already have at both ends,
// is O(dt^4) like the integrator, and lets the integrator's own order be seen. ***
// ------------------------------------------------------------------------------------------------------------
// Cubic Hermite root on [0,1] through (y0, m0*h) and (y1, m1*h) -- three Newton passes from the linear guess.
// O(h^4), which is the same order as RK4, so the crossing does not become the accuracy floor.
function hermiteRoot(y0, m0, y1, m1, h) {
    const a = 2 * y0 - 2 * y1 + h * m0 + h * m1;
    const b = -3 * y0 + 3 * y1 - 2 * h * m0 - h * m1;
    const c = h * m0, d = y0;
    let s = y0 / (y0 - y1);                                  // linear guess
    for (let i = 0; i < 4; i++) {
        const f = ((a * s + b) * s + c) * s + d, df = (3 * a * s + 2 * b) * s + c;
        if (!isFinite(df) || df === 0) break;
        const step = f / df;
        s -= step;
        if (!(s >= 0) || !(s <= 1)) { s = y0 / (y0 - y1); break; }
        if (Math.abs(step) < 1e-16) break;
    }
    return s;
}

export function integratePendulum({ L = 1, g = 9.80665, theta0 = 0.3, dt = 2e-4, maxT = 200 } = {}) {
    const w2 = g / L;
    const acc = (th) => -w2 * Math.sin(th);
    let th = theta0, v = 0, t = 0, crossings = 0, prevTh = th, prevV = v, period = null, firstCross = 0;
    let eMin = Infinity, eMax = -Infinity;
    const energy = (th, v) => 0.5 * v * v + w2 * (1 - Math.cos(th));
    while (t < maxT) {
        const e = energy(th, v); if (e < eMin) eMin = e; if (e > eMax) eMax = e;
        // RK4
        const k1t = v, k1v = acc(th);
        const k2t = v + 0.5 * dt * k1v, k2v = acc(th + 0.5 * dt * k1t);
        const k3t = v + 0.5 * dt * k2v, k3v = acc(th + 0.5 * dt * k2t);
        const k4t = v + dt * k3v, k4v = acc(th + dt * k3t);
        prevTh = th; prevV = v;
        th += dt / 6 * (k1t + 2 * k2t + 2 * k3t + k4t);
        v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
        t += dt;
        if (prevTh > 0 !== th > 0) {                       // a zero crossing of theta
            crossings++;
            const tCross = t - dt + dt * hermiteRoot(prevTh, prevV, th, v, dt);
            if (crossings === 1) firstCross = tCross;
            else { period = 2 * (tCross - firstCross); break; }
        }
    }
    return { period, energyDrift: (eMax - eMin) / Math.max(eMax, 1e-300), steps: Math.round(t / dt) };
}

// ------------------------------------------------------------------------------------------------------------
// THE CONSUMER: physics/pendulumWave.js's row, re-stated with TRUE periods.
//
// The shipped row assigns pendulum n the small-angle frequency base*(k+n), base = 2 pi / cycle, so in one cycle
// it completes exactly k+n swings and the whole row re-synchronises. Give each one its TRUE period instead --
// stretched by periodFactor(amp_n) -- and ask when they line up now.
//
// Everything here is PHASE. phase_n(t) = 2 pi t / T_n. No integrator, no shape assumption, and in particular no
// claim that theta(t) is a cosine (it is not). Re-synchronisation is a statement about RETURN TIMES only.
// ------------------------------------------------------------------------------------------------------------
// `pattern` picks WHICH pendulum gets the off-amplitude. "random" is a seeded spread across the row, which is
// what a physical release looks like; "worst" puts the whole excess on the FASTEST pendulum and leaves the rest
// exact, which is the configuration amplitudeTolerance() actually predicts -- so the two can be compared without
// a random draw deciding how close they land.
export function trueWaveRow({ N = 15, k = 20, cycle = 60, amp = 0.3, ampSpread = 0, seed = 1, pattern = "random" } = {}) {
    const base = 2 * Math.PI / cycle, row = [];
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };   // deterministic, seeded
    for (let n = 0; n < N; n++) {
        const a = pattern === "worst" ? amp * (1 + (n === N - 1 ? ampSpread : 0))
            : amp * (1 + ampSpread * (2 * rnd() - 1));
        const w = base * (k + n);
        const T0 = 2 * Math.PI / w, f = pendulumPeriodFactor(a);
        row.push({ n, amp: a, swings: k + n, T0, factor: f, T: T0 * f });
    }
    return { row, N, k, cycle, amp, ampSpread };
}

// Phase deviation of each pendulum from perfect alignment at time t, wrapped to (-pi, pi]. The SPREAD of these
// is the instrument: zero means the row is in step, whatever the individual angles happen to look like.
export function phaseSpread(wave, t) {
    let mn = Infinity, mx = -Infinity;
    for (const p of wave.row) {
        let d = (2 * Math.PI * t / p.T) % (2 * Math.PI);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < mn) mn = d; if (d > mx) mx = d;
    }
    return mx - mn;
}

// The predicted re-synchronisation time when every pendulum shares one amplitude: the assigned cycle, stretched
// by the common period factor. Nothing is fitted -- this is `cycle * K(sin^2(amp/2))/(pi/2)`.
export const trueCycle = ({ cycle = 60, amp = 0.3 } = {}) => cycle * pendulumPeriodFactor(amp);

// How much amplitude spread the row tolerates before the phase budget is spent.
//
//   f(a) = K(sin^2(a/2))/(pi/2),  and the fastest pendulum completes (k+N-1) swings per cycle. A pendulum whose
//   factor is off by df from the row mean arrives (k+N-1) * 2 pi * df/f out of phase. Setting that to `budget`
//   and inverting the LOCAL slope of f gives the tolerated HALF-SPREAD in amplitude. The slope is measured by a
//   central difference on f rather than typed from the series 1 + theta^2/16 + ..., so the tolerance is derived
//   from the same K everything else here uses.
export function amplitudeTolerance({ N = 15, k = 20, amp = 0.3, budget = 0.1 } = {}) {
    const h = 1e-5, f = pendulumPeriodFactor(amp);
    const slope = (pendulumPeriodFactor(amp + h) - pendulumPeriodFactor(amp - h)) / (2 * h);
    const worst = k + N - 1;
    const halfSpread = budget * f / (worst * 2 * Math.PI * slope);
    return { f, slope, worst, halfSpread, fraction: halfSpread / amp };
}
