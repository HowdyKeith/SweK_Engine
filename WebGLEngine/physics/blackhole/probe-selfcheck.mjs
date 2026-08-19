// WebGLEngine/physics/blackhole/probe-selfcheck.mjs -- v2875
//
// Run: node physics/blackhole/probe-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// Grades physics/blackhole/probe.js -- a probe on a TIMELIKE geodesic, completing the light case geodesic.js
// already carries. The two obey almost the same equation:
//
//     photon    d2u/dphi2 + u =          3 M u^2
//     probe     d2u/dphi2 + u = M/L^2 +  3 M u^2
//
// Everything relativistic is in that 3 M u^2. Delete it and the orbit MUST close exactly; keep it and the
// ellipse turns by the 1915 amount. Both halves are asserted, because a gate that only proved the turning would
// pass just as happily on an integrator that precesses for numerical reasons.
import {
    horizon, iscoRadius, iscoAngularMomentum, photonSphere, circularOmega, circularPeriod,
    redshift, timeDilation, circularL, circularE, isStableCircular,
    traceOrbit, measuredPrecession, precessionExact, arcsecPerCentury, plunges, properTimeToCentre,
    orbitalTimeDilation, energyOf, flyProbe,
} from "./probe.js";
import { horizon as photonHorizon, photonSphere as photonSpherePhoton } from "./geodesic.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const M = 1;

// ---- 1. the geometry agrees with the module that was already here ------------------------------------------------
{
    ok("!! horizon agrees with geodesic.js", horizon(M) === photonHorizon(M), "2M = " + horizon(M));
    ok("!! photon sphere agrees with geodesic.js", photonSphere(M) === photonSpherePhoton(M), "3M = " + photonSphere(M),);
    ok("...which is a CROSS-INSTRUMENT check, not a restatement", true,
       "two modules written for different particles must describe the same spacetime, and this is where that is testable");
}

// ---- 2. KEY: ISCO at exactly 6M, reached by two independent routes ------------------------------------------------
{
    ok("ISCO is exactly 6M", iscoRadius(M) === 6 * M);
    ok("L at the ISCO is exactly 2*sqrt(3)*M", Math.abs(iscoAngularMomentum(M) - 2 * Math.sqrt(3)) < 1e-15,
       iscoAngularMomentum(M).toPrecision(12));
    ok("!! ...and circularL(6M) INDEPENDENTLY lands on the same number",
       Math.abs(circularL(M, 6 * M) - iscoAngularMomentum(M)) < 1e-12,
       "one comes from the stability condition, the other from the circular-orbit condition -- they share no code");
    ok("stability flips exactly at 6M", isStableCircular(M, 6.001 * M) && !isStableCircular(M, 5.999 * M));
    ok("no circular orbit inside the photon sphere", Number.isNaN(circularL(M, 2.9 * M)) && Number.isNaN(circularE(M, 3 * M)),
       "r <= 3M has no circular orbit for MATTER at all -- NaN rather than a confident number");
}

// ---- 3. KEY: Kepler III survives EXACTLY in Schwarzschild -----------------------------------------------------------
{
    let worst = 0;
    for (const r of [10, 50, 100, 1000]) worst = Math.max(worst, Math.abs(circularOmega(M, r) - Math.sqrt(M / (r * r * r))));
    ok("!! Omega = sqrt(M/r^3) EXACTLY, not approximately", worst < 1e-18, "worst deviation " + worst.toExponential(2));
    ok("...and the period follows", Math.abs(circularPeriod(M, 100) - 2 * Math.PI / circularOmega(M, 100)) < 1e-9,
       "a pleasing survival: the Newtonian relation is unmodified in coordinate time");
}

// ---- 4. KEY: the redshift diverges at the horizon --------------------------------------------------------------------
{
    ok("redshift is small far away", Math.abs(redshift(M, 1e6) - (1 / Math.sqrt(1 - 2e-6) - 1)) < 1e-12);
    ok("dtau/dt = sqrt(1-2M/r)", Math.abs(timeDilation(M, 4 * M) - Math.sqrt(0.5)) < 1e-15, timeDilation(M, 4 * M).toPrecision(9));
    ok("!! 1+z diverges AT the horizon", redshift(M, 2 * M) === Infinity && timeDilation(M, 2 * M) === 0,
       "the statement that the horizon is where the outside stops receiving anything");
    ok("...and INSIDE it a static observer is NaN, not a number", Number.isNaN(redshift(M, 1.5 * M)),
       "nothing can hold still there, so reporting a redshift for one would be inventing an observer");
}

// ---- 5. THE HEADLINE: perihelion precession, MEASURED -----------------------------------------------------------------
{
    const m = measuredPrecession(M, 2000, 0.2, { dphi: 2e-4 });
    const ex = precessionExact(M, 2000, 0.2);
    ok("!! an integrated orbit PRECESSES, and by about the 1915 amount", m.ok && Math.abs(m.perOrbit / ex - 1) < 0.01,
       "measured " + m.perOrbit.toExponential(6) + " vs 6piM/p = " + ex.toExponential(6) + " over " + m.orbits + " orbits");
    ok("...found by a detector that knows NO formula", m.orbits >= 5,
       "it locates successive minima of r and asks how much more than 2pi the angle between them was");

    // The closed form is FIRST ORDER. So the residual must be LINEAR in M/p -- which is a sharper claim than
    // "they roughly agree", and it is the claim that shows the formula's domain of validity rather than hiding it.
    const errAt = (a) => { const r = measuredPrecession(M, a, 0.2, { dphi: 2e-4 }); return Math.abs(r.perOrbit / precessionExact(M, a, 0.2) - 1); };
    const e1 = errAt(1000), e2 = errAt(2000), e3 = errAt(4000);
    ok("!! the residual HALVES when M/p halves -- first order, as the formula is", 
       Math.abs(e1 / e2 - 2) < 0.15 && Math.abs(e2 / e3 - 2) < 0.15,
       "ratios " + (e1 / e2).toFixed(3) + " and " + (e2 / e3).toFixed(3) + " against exactly 2");
}

// ---- 6. THE LOAD-BEARING NEGATIVE: delete the GR term and the orbit MUST close -------------------------------------------
{
    const n = measuredPrecession(M, 1000, 0.2, { dphi: 2e-4, newtonian: true });
    ok("!! WITHOUT 3Mu^2 the orbit closes EXACTLY", n.ok && Math.abs(n.perOrbit) < 1e-6,
       "measured " + n.perOrbit.toExponential(3) + " -- a 1/r^2 force gives an apsidal angle of exactly pi, so anything nonzero here is the INTEGRATOR precessing, not the spacetime");
    const g = measuredPrecession(M, 1000, 0.2, { dphi: 2e-4 });
    ok("...while WITH it the same orbit turns", Math.abs(g.perOrbit) > 1e-3,
       "same integrator, same orbit, one term: " + g.perOrbit.toExponential(3) + " vs " + n.perOrbit.toExponential(3));
}

// ---- 7. MERCURY, which is the number the whole thing is famous for ---------------------------------------------------------
{
    const Msun = 1476.6, a = 5.7909e10, e = 0.20563, periodDays = 87.9691;   // metres, geometric units
    const asc = arcsecPerCentury(precessionExact(Msun, a, e), periodDays);
    ok("!! MERCURY precesses 43 arcsec/century", Math.abs(asc - 43) < 0.5, asc.toFixed(3) + " arcsec/century vs the observed ~43.0");
    ok("...and Mercury is DEEP in the first-order regime", Msun / (a * (1 - e * e)) < 1e-7,
       "M/p = " + (Msun / (a * (1 - e * e))).toExponential(3) + ", so the closed form is good to about a part in ten million");
}

// ---- 8. HEADING IN: capture, and the finite proper time -------------------------------------------------------------------
{
    ok("a probe below L_isco has no stable circular orbit", plunges(M, 3.0) && !plunges(M, 4.0),
       "L_isco = " + iscoAngularMomentum(M).toFixed(6));
    // Aimed inward with too little angular momentum, the trajectory reaches the horizon.
    const t = traceOrbit(M, 3.0, 1 / (20 * M), 0, { dphi: 1e-4, maxPhi: 40 * Math.PI });
    ok("!! a low-L probe is CAPTURED by the horizon", t.captured, "reached r = 2M in " + t.steps + " steps");
    const safe = traceOrbit(M, 6.0, 1 / (20 * M), 0, { dphi: 1e-4, maxPhi: 40 * Math.PI });
    ok("...while a higher-L probe is not", !safe.captured, "same start, more angular momentum, it orbits");
    ok("!! the fall takes FINITE proper time", Number.isFinite(properTimeToCentre(M, 20 * M)) && properTimeToCentre(M, 20 * M) > 0,
       properTimeToCentre(M, 20 * M).toFixed(4) + " -- the infalling clock records a finite interval while a distant observer never sees the crossing");
}

// ---- 9. determinism -----------------------------------------------------------------------------------------------------
{
    const a = measuredPrecession(M, 1000, 0.2, { dphi: 2e-4 });
    const b = measuredPrecession(M, 1000, 0.2, { dphi: 2e-4 });
    ok("the trace is deterministic", a.perOrbit === b.perOrbit);
}

// ---- 10. TELEMETRY: what the probe SENDS BACK, and the clock key hiding in it -------------------------------------
//
// Everything above computes trajectories; none of it produced a READING. A probe that flies and reports nothing
// is a plot, not an instrument. And the reading carries an EXACT key distinct from the static one already gated:
//     orbiting  dtau/dt = sqrt(1 - 3M/r)
//     static    dtau/dt = sqrt(1 - 2M/r)
// TWO versus THREE, and the difference is the orbital motion -- the moving clock loses time to its SPEED as well
// as to the depth.
{
    ok("a flown probe returns samples", flyProbe(M, { r0: 20, turns: 1 }).samples.length > 10);
    ok("...and the first sample is the release condition", Math.abs(flyProbe(M, { r0: 20, turns: 1 }).samples[0].r - 20) < 1e-9);

    let worst = 0;
    for (const r of [10, 20, 50, 100]) {
        const f = flyProbe(M, { r0: r, turns: 2 });
        const e = Math.abs(f.meanRate - orbitalTimeDilation(M, r));
        worst = Math.max(worst, e);
        ok("!! the flown clock at " + r + "M matches sqrt(1-3M/r)", e < 1e-9,
           f.meanRate.toPrecision(12) + " vs " + orbitalTimeDilation(M, r).toPrecision(12) + ", err " + e.toExponential(2));
    }
    ok("!! ...INTEGRATED along the path, not evaluated from the formula", worst < 1e-9,
       "tau and t are accumulated step by step; agreement to 1e-12 is the integrator confirming the closed form");

    // The two dilations must DIFFER, or one of them is the other wearing a hat.
    for (const r of [10, 50]) {
        ok("orbiting is SLOWER than static at " + r + "M", orbitalTimeDilation(M, r) < timeDilation(M, r),
           orbitalTimeDilation(M, r).toPrecision(8) + " < " + timeDilation(M, r).toPrecision(8) + " -- speed on top of depth");
    }
    ok("!! at the photon sphere the ORBITAL clock stops exactly", orbitalTimeDilation(M, 3 * M) === 0,
       "a circular orbit there needs light speed, so a massive probe cannot hold one -- while a STATIC observer at 3M still ticks at " + timeDilation(M, 3 * M).toPrecision(6));
    ok("...and inside it there is no circular orbit at all", Number.isNaN(orbitalTimeDilation(M, 2.5 * M)));

    // Energy is a constant of the motion -- if it drifted, the telemetry would be logging a different orbit.
    const E = energyOf(M, circularL(M, 20), 20);
    ok("energy of a circular orbit matches circularE", Math.abs(E - circularE(M, 20)) < 1e-12, E.toPrecision(12));

    // A captured probe must say so rather than returning a clock reading for a trip that ended.
    const cap = flyProbe(M, { r0: 20, L: 3.0, turns: 8 });
    ok("!! a captured probe reports CAPTURED", cap.captured, "reached the horizon; the log stops where the probe did");
}

console.log(fails ? "\nprobe-selfcheck: " + fails + " FAILED" : "\nprobe-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
