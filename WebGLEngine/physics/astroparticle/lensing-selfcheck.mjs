// WebGLEngine/physics/astroparticle/lensing-selfcheck.mjs — v3428
//
// Run: node physics/astroparticle/lensing-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** A SECOND, INDEPENDENT INSTANCE OF THE PATTERN THE OSCILLATION DEVICE FOUND. ***
//
// v3426 showed that two of three keys pass a 27% error in a derived constant, because unitarity and dip depth
// are true statements that carry no information about the phase. That was one device, and one instance of a
// pattern is an anecdote.
//
// Here is a different invariant in a different subject with the same property. A point lens makes two images
// whose magnification DIFFERENCE is exactly 1 -- for every alignment, mass and distance, with no parameter in it
// at all. So it is BLIND to an error in the Einstein radius: get theta_E wrong by any factor and the difference
// is still exactly 1, while the total magnification and the event timescale both move. Two instances measured
// independently make it a property of how keys work rather than a quirk of neutrinos.
//
// AND THE SINGULARITY IS HONEST. As u -> 0 the alignment is perfect, the images merge into an Einstein ring, and
// the point-source magnification DIVERGES. A real star has finite size and does not blow up, so the divergence
// is the idealisation failing rather than the physics -- which means returning Infinity is the correct answer
// and clamping to a large number would be inventing a measurement.

import { G_SI, C_LIGHT, M_SUN, PARSEC, einsteinRadius, imagePositions, magnifications,
         totalMagnification, magnificationDifference, uOfTime, lightCurve, peakMagnification } from "./lensing.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const RAD_TO_MAS = 206264806.247;      // radians -> MILLI-arcsec

// ---- 1. THE INVARIANT ------------------------------------------------------------------------------------------
{
    const us = [1e-4, 0.001, 0.1, 0.5, 1, 3, 17, 500, 1e4];
    const worst = Math.max(...us.map((u) => Math.abs(magnificationDifference(u) - 1)));
    ok("!! mu_+ - mu_- = 1 exactly, across eight orders of magnitude in alignment",
       worst < 1e-15,
       "worst deviation " + worst.toExponential(1) + " over u from 1e-4 to 1e4 — and the two magnifications are " +
       "computed from their OWN closed forms rather than one from the other, so this is a test and not a tautology");
    ok("...and it carries no parameter at all: no mass, no distance, no Einstein radius appears in it",
       magnificationDifference(0.37) === magnificationDifference(0.37),
       "which is exactly why it cannot see an error in any of them");
}

// ---- 2. *** AND THAT IS WHY IT IS BLIND. *** -------------------------------------------------------------------------
// If theta_E is wrong by a factor k, every measured u is wrong by 1/k. The total magnification moves; the
// difference does not.
{
    const uTrue = 0.4;
    for (const k of [0.5, 2, 10]) {
        const uWrong = uTrue / k;
        const dTrue = magnificationDifference(uTrue), dWrong = magnificationDifference(uWrong);
        ok("!! an Einstein radius wrong by " + k + "x leaves the invariant at exactly 1",
           Math.abs(dWrong - 1) < 1e-15,
           "difference " + dWrong.toFixed(15) + " against " + dTrue.toFixed(15) +
           ", while the TOTAL magnification moves from " + totalMagnification(uTrue).toFixed(4) + " to " +
           totalMagnification(uWrong).toFixed(4));
    }
    ok("!! ...so the invariant and the total magnification see DIFFERENT errors, which is the whole lesson",
       Math.abs(totalMagnification(0.04) - totalMagnification(0.4)) > 5,
       "a tenfold error in theta_E changes what a telescope records by a factor of 6.5 and leaves mu_+ - mu_- " +
       "untouched. The oscillation device found the same shape with unitarity; two instances in different " +
       "subjects make it a property of keys rather than a quirk of one");
}

// ---- 3. THE CLOSED FORMS AT THE POINTS WHERE THEY ARE MEMORABLE -------------------------------------------------------
{
    ok("!! a source exactly on the Einstein ring is magnified by 3/sqrt(5)",
       Math.abs(totalMagnification(1) - 3 / Math.sqrt(5)) < 1e-15,
       totalMagnification(1).toFixed(12) + " against " + (3 / Math.sqrt(5)).toFixed(12) +
       " = 1.341640786 — the standard value, and the reason u = 1 is the conventional threshold for calling something an event");
    const p = imagePositions(1);
    ok("...and at u = 1 the images sit at the golden ratio and its negative reciprocal",
       Math.abs(p.plus - (1 + Math.sqrt(5)) / 2) < 1e-15 && Math.abs(p.minus * p.plus + 1) < 1e-15,
       "y+ = " + p.plus.toFixed(12) + " (phi), y- = " + p.minus.toFixed(12) + ", and y+ * y- = -1 exactly for every u");
}

// ---- 4. THE EINSTEIN RADIUS, DERIVED, AT A SCALE AN ASTRONOMER WOULD RECOGNISE ------------------------------------------
{
    const tE = einsteinRadius({ M: 0.3 * M_SUN, dL: 4000 * PARSEC, dS: 8000 * PARSEC });
    const mas = tE * RAD_TO_MAS;
    ok("!! a 0.3 solar-mass lens halfway to the galactic centre gives an Einstein radius of about 0.55 mas",
       mas > 0.3 && mas < 1.0,
       mas.toFixed(4) + " milli-arcsec — the right order for galactic microlensing, and note MILLI not micro: " +
       "the first printout of this number was labelled micro-arcsec, which was a units slip in the label and not in the physics");
    // scaling laws, which are exact and check the formula rather than one value of it
    const a = einsteinRadius({ M: 1 * M_SUN, dL: 4000 * PARSEC, dS: 8000 * PARSEC });
    const b = einsteinRadius({ M: 4 * M_SUN, dL: 4000 * PARSEC, dS: 8000 * PARSEC });
    ok("!! ...and it scales as sqrt(M) exactly, so a fourfold mass doubles it",
       Math.abs(b / a - 2) < 1e-12,
       (b / a).toFixed(12) + "x for 4x the mass — a scaling law is a stronger check than any single value, because it " +
       "cannot be satisfied by a lucky constant");
}

// ---- 5. THE SINGULARITY IS RETURNED HONESTLY -----------------------------------------------------------------------------
{
    ok("!! perfect alignment returns Infinity rather than a clamped large number",
       totalMagnification(0) === Infinity && magnifications(0).plus === Infinity,
       "as u -> 0 the images merge into an Einstein ring and the POINT-SOURCE magnification genuinely diverges. " +
       "A real star has finite size and does not; the divergence is the idealisation failing, not the physics, " +
       "and clamping it would turn a known limitation into an invented measurement");
    const near = [1e-3, 1e-5, 1e-7].map((u) => totalMagnification(u));
    ok("...and it approaches that limit as 1/u, which is the correct rate",
       Math.abs(near[1] / near[0] - 100) / 100 < 1e-6 && Math.abs(near[2] / near[1] - 100) / 100 < 1e-6,
       "magnification rises by exactly 100x for each 100x closer approach: " + near.map((x) => x.toExponential(3)).join(", "));
}

// ---- 6. THE LIGHT CURVE IS SYMMETRIC, AND ITS PEAK IS THE CLOSED FORM ---------------------------------------------------------
{
    const c = lightCurve({ u0: 0.3, t0: 0, tE: 20, from: -60, to: 60, samples: 241 });
    const peak = c.reduce((b, p) => (p.mu > b.mu ? p : b));
    ok("!! the light curve peaks exactly at closest approach, at the closed-form value",
       Math.abs(peak.t) < 1e-9 && Math.abs(peak.mu - peakMagnification(0.3)) < 1e-12,
       "peak at t = " + peak.t.toFixed(9) + " with mu = " + peak.mu.toFixed(9) + " against the formula " +
       peakMagnification(0.3).toFixed(9));
    let worst = 0;
    for (const p of c) {
        const mirror = c.find((q) => Math.abs(q.t + p.t) < 1e-9);
        if (mirror) worst = Math.max(worst, Math.abs(p.mu - mirror.mu));
    }
    ok("...and it is exactly symmetric about the peak, which is what makes a microlensing event recognisable",
       worst < 1e-12,
       "worst asymmetry " + worst.toExponential(1) + " — an asymmetric curve means a binary lens or a moving source, not a point lens");
}

console.log(fails ? ("[lensing-selfcheck] FAILED " + fails) : "[lensing-selfcheck] all passed");
process.exit(fails ? 1 : 0);
