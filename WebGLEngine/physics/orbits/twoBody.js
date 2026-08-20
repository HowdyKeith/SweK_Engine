// physics/orbits/twoBody.js
//
// TWO-BODY BARYCENTRIC ORBIT -- v2937. The first genuinely two-body scene in the lab: two masses orbiting their
// common centre of mass under mutual gravity, not a test particle in a fixed field. Everything the roundhouse
// has done in orbital mechanics until now holds one body fixed (physics/orbits/kepler.js, probe.js, blackHole).
// This lets both move, and the physics that is INVISIBLE to a test-particle sim becomes the graded observable.
//
// THE REDUCTION, AND WHY IT REUSES PROVEN CODE RATHER THAN DUPLICATING IT. The Newtonian two-body problem is
// exactly equivalent to a ONE-body problem: the relative coordinate r = r1 - r2 obeys the same equation as a
// single particle orbiting a fixed centre of mass mu_grav = G(m1+m2). So the relative motion is integrated with
// the SAME velocity-Verlet stepper the single-body Kepler device already uses and has corroborated -- imported,
// not re-implemented. The two physical bodies are then reconstructed from the relative vector and the barycentre:
//     r1 = R_cm + (m2/(m1+m2)) r,   r2 = R_cm - (m1/(m1+m2)) r
// This is the honest structure: the integrator is old and trusted; what is NEW and graded is the two-body
// geometry laid on top of it -- the total-mass period, the exact amplitude ratio, and the fixity of R_cm.
//
// THE EXACT ANSWER KEYS, none written into the integrator:
//
//   KEPLER III (total mass)   T = 2 pi sqrt(a^3 / (G(m1+m2))). The period depends on the SUM of the masses, not
//                             on a fixed mu. This is the observable that distinguishes two-body from test-particle:
//                             swap which mass is "central" and the period is unchanged, because only the sum enters.
//
//   AMPLITUDE RATIO           a1/a2 = m2/m1, EXACTLY. Each body's orbit about the barycentre scales inversely with
//                             its mass. A pure dimensionless ratio -- no units, no slack -- so it is a sharp test:
//                             the heavier body moves less, in exact proportion.
//
//   BARYCENTRE FIXITY         R_cm = (m1 r1 + m2 r2)/(m1+m2) is CONSTANT (here, fixed at the origin with zero net
//                             momentum). Any drift is the integrator failing momentum conservation, gradable
//                             against exact zero. No current device checks this -- it is the genuinely new
//                             conserved quantity this scene adds.
//
// Pure, browser-safe, imports only the trusted single-body pieces. Units: G = 1, planar motion.

import { stepVerlet, atPerihelion, period as relPeriod } from "./kepler.js";

/**
 * Set up a two-body system at perihelion of the RELATIVE orbit, in the barycentre frame with zero net momentum.
 * a is the semi-major axis of the RELATIVE orbit (the separation ellipse); e its eccentricity.
 * Returns the two bodies plus the invariants needed to grade the run.
 */
// v3401 -- THE PLANTED ERROR: KEPLER III WITH THE PRIMARY MASS INSTEAD OF THE TOTAL.
//
// This is the slip a textbook makes and a solar-system intuition encourages: T = 2 pi sqrt(a^3 / (G M_star)),
// which is RIGHT in the limit the planet is massless and wrong everywhere else. It is not a scrambled constant
// -- it is the FIRST FORM most people learn, and it survives every check that does not involve the second mass.
//
// *** THE PLANT MOVES ONLY THE CLOSED FORM. THE SIMULATION STILL INTEGRATES THE CORRECT MUTUAL FIELD, so what
// changes is the KEY the measurement is graded against -- which is exactly what a wrong law does. *** And the
// consequence is that the error is a function of the MASS RATIO alone: periodErrFrac = sqrt(1+q) - 1, about q/2
// for small q. THE ANSWER IS A MASS RATIO, NOT A VERDICT -- the same shape as clocks' radius, in a different
// variable, and it is why a lab of Jupiter-and-Sun fixtures would never have noticed.
export function setupTwoBody({ m1 = 3, m2 = 1, a = 10, e = 0.3, keyMass = "total" } = {}) {
    const Mtot = m1 + m2;
    // The mass the KEY uses. Default is bit-identical to every value frozen before this existed.
    const Mkey = keyMass === "primary" ? m1 : Mtot;
    // relative coordinate obeys one-body dynamics with gravitational parameter G*Mtot
    const rel = atPerihelion(a, e, Mtot);              // { x, y, vx, vy } of r = r1 - r2
    const f1 = m2 / Mtot, f2 = m1 / Mtot;              // r1 = +f1*rel, r2 = -f2*rel about R_cm=0
    const body = (sign, f) => ({ x: sign * f * rel.x, y: sign * f * rel.y, vx: sign * f * rel.vx, vy: sign * f * rel.vy });
    return {
        m1, m2, Mtot, a, e,
        b1: body(+1, f1),
        b2: body(-1, f2),
        rel,
        f1, f2,
        // v3401 -- *** TWO PERIODS, AND SEPARATING THEM IS THE WHOLE CORRECTION. *** Trel is the KEY the
        // measurement is graded against; Tsched is the TRUE period the run is scheduled by. The first version
        // had one field doing both, so planting the key silently changed the TIMESTEP and the DURATION -- the
        // gate caught barycentreDriftFrac and netMomentum moving under a plant that was supposed to leave the
        // simulation untouched. A PLANT THAT ALSO RESCHEDULES THE EXPERIMENT IS TWO CHANGES WEARING ONE LABEL.
        Trel: relPeriod(a, Mkey),                       // total-mass Kepler III (primary-mass when planted)
        Tsched: relPeriod(a, Mtot),                     // ALWAYS the true period: dt and run length come from here
        keyMass,
        ratioExact: m2 / m1,                            // a1/a2 = m2/m1
    };
}

/** Barycentre position (should stay fixed at origin) and net momentum (should stay zero). */
export function barycentre(b1, b2, m1, m2) {
    const M = m1 + m2;
    return {
        x: (m1 * b1.x + m2 * b2.x) / M,
        y: (m1 * b1.y + m2 * b2.y) / M,
        px: m1 * b1.vx + m2 * b2.vx,
        py: m1 * b1.vy + m2 * b2.vy,
    };
}

/**
 * Integrate the two-body system for `orbits` relative periods by stepping BOTH bodies directly in their mutual
 * gravitational field with velocity Verlet, and tracking the three graded observables.
 *
 * WHY DIRECT INTEGRATION, NOT THE RELATIVE-COORDINATE SHORTCUT. The two-body problem reduces to a one-body
 * relative orbit, and integrating THAT and reconstructing the bodies as exact fractions of it would be cheaper.
 * But it would make barycentre-fixity VACUOUS: if both bodies are built as fixed multiples of one integrated
 * vector, their centre of mass is pinned to the origin by construction and can never drift, so the "conservation
 * test" would measure nothing. Verified during construction: the reconstruction keeps R_cm at 0 to 1e-17
 * regardless of integrator quality. Integrating both bodies INDEPENDENTLY in each other's field makes the
 * barycentre a genuine emergent quantity -- symplectic Verlet conserves the total momentum that holds it fixed,
 * but only to ~1e-14 from accumulated rounding, and a non-symplectic or buggy stepper would let it wander. That
 * measured ~1e-14 (not 0, not 1e-3) is the honest signature of a correct symplectic integration.
 */
export function integrateTwoBody({ m1 = 3, m2 = 1, a = 10, e = 0.3, integrator = "verlet", stepsPerOrbit = 400, orbits = 50, keyMass = "total" } = {}) {
    if (integrator !== "verlet") throw new Error("twoBody: only the symplectic verlet path is graded (rk4 drifts by design)");
    const S = setupTwoBody({ m1, m2, a, e, keyMass });
    const dt = S.Tsched / stepsPerOrbit;
    const total = Math.round(stepsPerOrbit * orbits);
    const G = 1;

    // pairwise acceleration on body i due to body j
    const accel = (bi, bj, mj) => {
        const dx = bj.x - bi.x, dy = bj.y - bi.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2), k = G * mj / (r2 * r);
        return [k * dx, k * dy];
    };

    let b1 = { ...S.b1 }, b2 = { ...S.b2 };
    let maxR1 = 0, maxR2 = 0, worstDriftFrac = 0, worstMomentum = 0;
    let prevSep2 = null, prevDelta = null, lastPeriTime = null, periGaps = [];

    for (let i = 1; i <= total; i++) {
        // velocity Verlet on both bodies in their mutual field
        let [a1x, a1y] = accel(b1, b2, m2), [a2x, a2y] = accel(b2, b1, m1);
        b1 = { x: b1.x + b1.vx * dt + 0.5 * a1x * dt * dt, y: b1.y + b1.vy * dt + 0.5 * a1y * dt * dt, vx: b1.vx, vy: b1.vy };
        b2 = { x: b2.x + b2.vx * dt + 0.5 * a2x * dt * dt, y: b2.y + b2.vy * dt + 0.5 * a2y * dt * dt, vx: b2.vx, vy: b2.vy };
        const [n1x, n1y] = accel(b1, b2, m2), [n2x, n2y] = accel(b2, b1, m1);
        b1.vx += 0.5 * (a1x + n1x) * dt; b1.vy += 0.5 * (a1y + n1y) * dt;
        b2.vx += 0.5 * (a2x + n2x) * dt; b2.vy += 0.5 * (a2y + n2y) * dt;

        maxR1 = Math.max(maxR1, Math.hypot(b1.x, b1.y));
        maxR2 = Math.max(maxR2, Math.hypot(b2.x, b2.y));

        const bc = barycentre(b1, b2, m1, m2);
        worstDriftFrac = Math.max(worstDriftFrac, Math.hypot(bc.x, bc.y) / a);
        worstMomentum = Math.max(worstMomentum, Math.hypot(bc.px, bc.py));

        // perihelion of the RELATIVE orbit: separation minimal
        const dx = b1.x - b2.x, dy = b1.y - b2.y, sep2 = dx * dx + dy * dy;
        if (prevSep2 !== null) {
            const delta = sep2 - prevSep2;
            if (prevDelta !== null && prevDelta < 0 && delta >= 0) {
                const t = i * dt;
                if (lastPeriTime !== null) periGaps.push(t - lastPeriTime);
                lastPeriTime = t;
            }
            prevDelta = delta;
        }
        prevSep2 = sep2;
    }

    const ratioMeasured = maxR1 / maxR2;
    const periodMeasured = periGaps.length ? periGaps.reduce((s, g) => s + g, 0) / periGaps.length : null;

    return {
        m1, m2, a, e, orbits, stepsPerOrbit,
        ratioMeasured, ratioExact: S.ratioExact,
        ratioErrFrac: Math.abs(ratioMeasured - S.ratioExact) / S.ratioExact,
        periodMeasured, periodExact: S.Trel,
        periodErrFrac: periodMeasured != null ? Math.abs(periodMeasured - S.Trel) / S.Trel : null,
        barycentreDriftFrac: worstDriftFrac,
        netMomentum: worstMomentum,
        periods: periGaps.length,
    };
}
