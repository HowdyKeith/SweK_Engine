// physics/orbits/inspiral.js
//
// GRAVITATIONAL-WAVE INSPIRAL -- v2938. The lab's first RADIATIVE scene: a circular binary loses energy to
// gravitational waves and spirals in. Stage two of the two-body design, built on the barycentric orbit of
// v2937. This is the physics behind the Hulse-Taylor binary pulsar (1993 Nobel) and every LIGO detection.
//
// THE CLOSED FORM (Peters 1964), orbit-averaged for a circular binary:
//   da/dt      = -(64/5) G^3 m1 m2 (m1+m2) / (c^5 a^3)                 -- the semi-major axis shrinks
//   t_merge    = (5/256) c^5 a0^4 / (G^3 m1 m2 (m1+m2))                -- time from a0 to coalescence
//   a(t)^4     = a0^4 - (256/5) G^3 m1 m2 (m1+m2)/c^5 * t              -- the trajectory, closed form
//
// TWO TRAPS THIS SCENE SETS, both characterised before building (the house rule: know where the danger is):
//
//   THE a->0 COORDINATE SINGULARITY. da/dt ~ 1/a^3 DIVERGES as a->0, so a FIXED timestep overshoots past a=0
//   into NEGATIVE a near merger (measured: a fixed dt lands a at -0.52). The merger time itself is well-defined
//   because t ~ a^4 makes the endpoint contribute only a_f^4/a0^4 (measured: cutting off at a0/100 leaves a
//   residual of ~1e-8), but REACHING it correctly needs an ADAPTIVE step that shrinks as a does. This module
//   uses a step proportional to a/|da/dt| = a^4-ish, so it slows down exactly where the rate speeds up.
//
//   THE SECULAR-EFFECT "CONVERGED BUT WRONG" TRAP. Radiation reaction is a slow drift on top of (here, averaged
//   over) the orbit, and such effects can converge smoothly to the WRONG number. The guard is to grade the
//   TRAJECTORY a(t) against the closed form throughout, not merely the endpoint t_merge -- a wrong secular rate
//   would track poorly in the middle even if the endpoint happened to land close.
//
// Pure, browser-safe. Units: G = c = 1, planar.

const petersRate = (a, Mc) => -(64 / 5) * Mc / (a * a * a);          // da/dt, G=c=1, Mc = m1 m2 (m1+m2)

// v3392 -- THE PLANTED ERROR: A WRONG POWER LAW, WITH ITS OWN MATCHING CLOSED FORM.
//
// Peters gives da/dt = -(64/5) Mc / a^3. The generalisation below takes the exponent as a parameter, and
// EVERY closed form in this file follows it: for da/dt = -K/a^p the trajectory is a^(p+1) = a0^(p+1) - (p+1)K t
// and the merger time is a0^(p+1) / ((p+1) K). At p = 3 that is Peters exactly.
//
// *** THE POINT IS NOT THAT THE WRONG LAW IS WRONG. IT IS THAT mergerErrFrac CANNOT SEE IT. *** v3200 measured
// this and left it as a comment: a wrong power law integrated against its own matching closed form returns
// 1.695e-8 against the correct pair's 6.406e-9 -- SAME ORDER. The residual grades the INTEGRATOR, and the
// integrator is doing its job either way. A planted error makes that a NUMBER instead of a note.
//
// The default path deliberately keeps the ORIGINAL expressions rather than the general ones, so an unperturbed
// run is BIT-IDENTICAL to every value frozen before this change. A refactor that moved the baseline while
// adding a plant would have made the plant unmeasurable.
const KP = (Mc) => (64 / 5) * Mc;
const gRate = (a, Mc, p) => -KP(Mc) / Math.pow(a, p);

/** Exact Peters merger time from a0 to coalescence. */
export function mergerTimeExact({ m1 = 3, m2 = 1, a0 = 10, ratePower = 3 } = {}) {
    const Mc = m1 * m2 * (m1 + m2);
    if (ratePower === 3) return (5 / 256) * Math.pow(a0, 4) / Mc;   // bit-identical default path
    return Math.pow(a0, ratePower + 1) / ((ratePower + 1) * KP(Mc));
}

/** Exact Peters trajectory a(t). Returns 0 at/after coalescence. */
export function semiMajorExact(t, { m1 = 3, m2 = 1, a0 = 10, ratePower = 3 } = {}) {
    const Mc = m1 * m2 * (m1 + m2);
    if (ratePower === 3) {
        const inside0 = Math.pow(a0, 4) - (256 / 5) * Mc * t;       // bit-identical default path
        return inside0 > 0 ? Math.pow(inside0, 0.25) : 0;
    }
    const q = ratePower + 1;
    const inside = Math.pow(a0, q) - q * KP(Mc) * t;
    return inside > 0 ? Math.pow(inside, 1 / q) : 0;
}

/**
 * Integrate the inspiral with an ADAPTIVE RK4 step and measure both the merger time and the worst trajectory
 * deviation from the closed form. Stops at a_f = a0 * stopFrac (default a0/100), where the merger-time residual
 * is already ~1e-8, then adds the exact analytic tail (a_f^4 worth of time) so the reported merger time is the
 * FULL time, not the truncated one.
 *
 * The adaptive step is the whole point: dt_i = safety * a / |da/dt| = safety * a^4 * 5/(64 Mc), so the step
 * shrinks as a^4 and never overshoots the singularity. A fixed step lands a negative near merger; this does not.
 */
export function integrateInspiral({ m1 = 3, m2 = 1, a0 = 10, stopFrac = 0.01, safety = 0.01, maxSteps = 5_000_000, ratePower = 3 } = {}) {
    const Mc = m1 * m2 * (m1 + m2);
    const rate = ratePower === 3 ? (a) => petersRate(a, Mc) : (a) => gRate(a, Mc, ratePower);
    const aStop = a0 * stopFrac;

    let a = a0, t = 0, steps = 0, worstTrajErr = 0, worstAt = 0, worstBulkErr = 0, worstBulkAt = 0;
    const tMergeApprox = mergerTimeExact({ m1, m2, a0, ratePower });
    while (a > aStop && steps < maxSteps) {
        // adaptive: step time proportional to a / |rate|, so near merger (rate huge) the step is tiny
        let dt = safety * a / Math.abs(rate(a));
        // never step past the stop point
        // (RK4 on da/dt)
        const k1 = rate(a);
        const k2 = rate(a + 0.5 * dt * k1);
        const k3 = rate(a + 0.5 * dt * k2);
        const k4 = rate(a + dt * k3);
        const aNext = a + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
        t += dt; a = aNext; steps++;

        if (a > 0) {
            const aRef = semiMajorExact(t, { m1, m2, a0, ratePower });
            if (aRef > 0) {
                const err = Math.abs(a - aRef) / aRef;
                if (err > worstTrajErr) { worstTrajErr = err; worstAt = t; }
                // BULK error: exclude the last 1% of the inspiral, where a is tiny and rel error amplifies
                // against a vanishing denominator (a v2905 floor artefact, not a secular-rate failure). The
                // endpoint is covered by the merger-time key instead.
                if (t < 0.99 * tMergeApprox) {
                    if (err > worstBulkErr) { worstBulkErr = err; worstBulkAt = t; }
                }
            }
        }
    }

    // exact analytic tail from a_f to 0: t_tail = (5/256) a_f^4 / Mc, added so the reported time is the full merger
    const tTail = ratePower === 3 ? (5 / 256) * Math.pow(a, 4) / Mc
        : Math.pow(a, ratePower + 1) / ((ratePower + 1) * KP(Mc));
    const mergerMeasured = t + tTail;
    const mergerExactVal = mergerTimeExact({ m1, m2, a0, ratePower });

    return {
        m1, m2, a0, stopFrac, steps, ratePower,
        mergerMeasured, mergerExact: mergerExactVal,
        mergerErrFrac: Math.abs(mergerMeasured - mergerExactVal) / mergerExactVal,
        worstTrajErrFrac: worstTrajErr, worstTrajAt: worstAt / mergerExactVal,   // full, incl. amplified endpoint
        worstBulkErrFrac: worstBulkErr, worstBulkAt: worstBulkAt / mergerExactVal, // bulk (t < 0.99 t_merge): the real trajectory test
        finalA: a,
    };
}
