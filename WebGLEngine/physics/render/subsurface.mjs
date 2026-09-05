// physics/render/subsurface.mjs -- v4443 -- the fifth and last gap physics/render/principled.mjs named.
//
// v4432 shipped the principled BSDF with an honest-scope sentence listing five parameters that make Disney's
// model what it is and were absent: sheen, clearcoat, anisotropy, TRANSMISSION and SUBSURFACE. v4436 closed
// the fourth. This closes the fifth, and it is the only one of the five with a closed-form normalisation, so
// it is the one where the most can be asserted rather than measured.
//
// The model is Christensen and Burley's normalised diffusion, which is what Disney, Cycles, Arnold and every
// offline renderer since about 2015 actually ships in place of the classical dipole. NOTHING IS VENDORED --
// this is a paper, and a two-term exponential at that.
//
// ---- *** WHAT IS ABSENT HERE, MEASURED WITH tools/ship/absenceScope.mjs BEFORE ANY OF IT WAS WRITTEN *** --
//
// `subsurface`, `burley`, `diffusionProfile`, `translucency`, `meanFreePath` and `albedoInversion` are all
// ZERO in this tree's code. The four `subsurface` hits are DENIALS -- v4432's and v4436's own honest-scope
// notes saying it is missing. Two false friends are worth naming so this file does not claim more absence
// than it measured: physics/em/currentLoop.mjs has a DIPOLE, which is a magnetic one and has nothing to do
// with the SSS dipole it shares a name with; and render/atmosphere.mjs SCATTERS light, which is Rayleigh and
// Mie through a participating medium rather than diffusion under a surface. Neighbouring physics, different
// model.
//
// ---- *** THE PROFILE, AND WHY IT IS WORTH HAVING RATHER THAN THE DIPOLE *** --------------------------------
//
//     R(r) = (e^(-r/d) + e^(-r/(3d))) / (8 pi d r)
//
// It is NORMALISED BY CONSTRUCTION, which the classical dipole is not, and the proof is one line:
//
//     INT[0,inf] R(r) 2 pi r dr = (1/(4d)) INT[0,inf] (e^(-r/d) + e^(-r/(3d))) dr = (1/(4d))(d + 3d) = 1
//
// EXACTLY ONE, FOR EVERY d. That gives this file two exact assertions where a fitted model would give none:
// the integral is 1, and it is INDEPENDENT of d. A wrong constant (4 pi for 8 pi) or a dropped 3 breaks it by
// a factor that is itself exactly known, so the check cannot be satisfied by a plausible-looking near miss.
//
// Three more things are exact and follow from the same integral:
//
//   * THE CDF IS CLOSED FORM.  CDF(r) = 1 - (1/4) e^(-r/d) - (3/4) e^(-r/(3d)),  CDF(0) = 0, CDF(inf) = 1.
//   * THE MEAN RADIUS IS 2.5d. E[r] = (1/(4d)) INT r (e^(-r/d) + e^(-r/(3d))) dr = (1/(4d))(d^2 + 9d^2).
//   * THE PROFILE IS SELF-SIMILAR IN r/d, AND THE POWER IS TWO. d is a scale and nothing else, so
//     d^2 R(u d, d) depends only on u -- which means the searchlight limit is not a separate claim but the
//     same one read at small d. *** THE FIRST DRAFT OF THIS LINE SAID d R AND THE MEASUREMENT SAID d^2: ***
//     across d = 0.01, 1, 100 the mantissa of d R was IDENTICAL to twelve digits while the exponent stepped
//     by two per decade, which is the signature of a missed power rather than a wrong formula. R is a density
//     PER UNIT AREA, so it must carry two inverse lengths, and r R(r) -- the thing that integrates -- carries
//     one. A dimensional slip that leaves every digit right is invisible to anything but the exponent.
//
// ---- *** WHAT IS A FIT AND IS SAID TO BE *** ---------------------------------------------------------------
//
// Burley's relation between the scattering distance d and the surface albedo A is a CURVE FITTED to Monte
// Carlo ground truth, not a derivation. It is carried here because a renderer needs it, and it is labelled
// `fitted` in the export so nothing downstream mistakes it for the exact half of this file.

"use strict";

/** The normalised diffusion profile. Singular at r = 0 -- the singularity is integrable and is the point. */
export const profile = (r, d) => {
    if (!(d > 0)) return 0;
    if (r <= 0) return Infinity;
    return (Math.exp(-r / d) + Math.exp(-r / (3 * d))) / (8 * Math.PI * d * r);
};

/** The closed-form cumulative distribution of radius. CDF(0) = 0 and CDF(inf) = 1, both exactly. */
export const cdf = (r, d) => {
    if (!(d > 0) || r <= 0) return 0;
    return 1 - 0.25 * Math.exp(-r / d) - 0.75 * Math.exp(-r / (3 * d));
};

/** The mean scattering radius, in closed form: 2.5 d. */
export const meanRadius = (d) => 2.5 * d;

/**
 * The normalisation integral: INT 2 pi r R(r) dr, done by quadrature on THE ACTUAL PROFILE.
 *
 * *** THE FIRST VERSION INTEGRATED A HAND-SUBSTITUTED COPY OF THE INTEGRAND AND NEVER CALLED profile() AT
 * ALL. *** It used u = r/d to cancel d analytically, which made the answer bit-identical across d and looked
 * like the strongest row in the gate -- and a sabotage that replaced 8 pi with 4 pi in profile() cost ZERO
 * RED, because the check could not see profile(). A NORMALISATION THAT RE-DERIVES ITS OWN INTEGRAND IS TWO
 * DECLARATIONS OF ONE FORMULA, and it grades the copy.
 *
 * Integrating the real thing costs the bit-identity -- d now enters the arithmetic -- and that is the right
 * trade: d-independence becomes a MEASURED property of the model instead of a tautology of the substitution.
 * The lower limit is a small multiple of d rather than zero, because R is singular at the origin; the
 * integrable head is added in closed form, since INT[0,a] 2 pi r R dr = CDF(a).
 */
export function normalisation(d, { N = 200000, uMax = 200, uMin = 1e-6 } = {}) {
    const rMin = uMin * d, rMax = uMax * d;
    const dr = (rMax - rMin) / N;
    let s = cdf(rMin, d);                       // the head, in closed form
    for (let i = 0; i < N; i++) {
        const r = rMin + (i + 0.5) * dr;
        s += 2 * Math.PI * r * profile(r, d) * dr;
    }
    return s;
}

/** Sample a radius by inverting the CDF. Bisection, because the inverse has no elementary closed form. */
export function sampleRadius(u, d, { steps = 60 } = {}) {
    if (!(u > 0)) return 0;
    if (u >= 1) return Infinity;
    let lo = 0, hi = d;
    while (cdf(hi, d) < u && hi < 1e9 * d) hi *= 2;
    for (let k = 0; k < steps; k++) {
        const mid = 0.5 * (lo + hi);
        if (cdf(mid, d) < u) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

/**
 * *** THE SEARCHLIGHT LIMIT, WHICH IS NOT A SEPARATE CLAIM. *** The fraction of light emerging within a
 * radius `eps` of where it entered is CDF(eps, d), and because the profile is self-similar that is a
 * function of eps/d alone. So "as d goes to zero the BSSRDF becomes a BRDF" and "as eps grows the fraction
 * goes to one" are the SAME statement read along two axes, and the gate asserts the collapse rather than
 * two coincidences.
 */
export const fractionWithin = (eps, d) => cdf(eps, d);

// *** THE FITTED HALF, LABELLED. *** Burley's albedo-to-scattering-distance relation, from the 2015 course
// notes: s = 1.85 - A + 7 |A - 0.8|^3, with d = l / s for a mean free path l. It is a CURVE FIT to Monte
// Carlo ground truth and no exact claim is made about it anywhere in this file or its gate.
export const fitted = Object.freeze({
    scalingFactor: (A) => 1.85 - A + 7 * Math.pow(Math.abs(A - 0.8), 3),
    distanceFor: (A, meanFreePath = 1) => meanFreePath / (1.85 - A + 7 * Math.pow(Math.abs(A - 0.8), 3)),
    note: "a fit to Monte Carlo ground truth, not a derivation -- carried because a renderer needs it, and " +
          "named `fitted` so nothing downstream mistakes it for the exact half of this module",
});

// ---- *** THE DOOR (v3327's split) *** ---------------------------------------------------------------------
//
// v4461 -- registered at v4460 with nothing to render. The report keeps this module's own division visible:
// the EXACT half (a profile that integrates to one by construction, and a CDF that inverts) printed apart
// from the FITTED half, so a reader cannot take Burley's albedo fit for a derivation.

export function reportLines() {
    const L = [];
    L.push("[subsurface] Christensen-Burley: the exact half, and the fit, kept apart");
    L.push("");
    L.push("  *** THE EXACT HALF: the profile is normalised BY CONSTRUCTION, so this is the instrument");
    L.push("      checking itself before it measures anything. ***");
    L.push("     d        integral 2*pi*r*R(r) dr     error");
    for (const d of [0.05, 0.2, 1, 5, 20]) {
        const s = normalisation(d, { N: 40000 });
        L.push("   " + String(d).padStart(5) + "        " + s.toFixed(9).padStart(14) + "     " +
               Math.abs(s - 1).toExponential(2).padStart(9));
    }
    L.push("");
    L.push("  the CDF inverts -- sampleRadius(u) then cdf() must return u");
    L.push("     u        radius / d        cdf(radius)        error");
    for (const u of [0.05, 0.25, 0.5, 0.75, 0.95, 0.999]) {
        const r = sampleRadius(u, 1);
        const back = cdf(r, 1);
        L.push("   " + u.toFixed(3).padStart(6) + "     " + r.toFixed(6).padStart(10) + "     " +
               back.toFixed(9).padStart(12) + "     " + Math.abs(back - u).toExponential(2).padStart(9));
    }
    L.push("");
    // *** ONE STATEMENT READ ALONG TWO AXES, NOT TWO COINCIDENCES. *** The profile is self-similar, so the
    // fraction emerging within eps depends on eps/d alone -- which is why "d -> 0 becomes a BRDF" and
    // "eps -> large captures everything" are the SAME collapse and are printed as one table.
    L.push("  the searchlight limit is ONE statement: fractionWithin depends on eps/d alone");
    L.push("     eps/d     fraction within");
    for (const k of [0.1, 0.5, 1, 2.5, 5, 10]) {
        const a = fractionWithin(k * 0.01, 0.01), b = fractionWithin(k * 7.3, 7.3);
        L.push("   " + String(k).padStart(6) + "     " + a.toFixed(9).padStart(12) +
               "   (at d = 7.3: " + b.toFixed(9) + ", same to " + Math.abs(a - b).toExponential(1) + ")");
    }
    L.push("  meanRadius(d) = 2.5 d -- at d = 1 that is " + meanRadius(1).toFixed(3) + ", capturing " +
           (fractionWithin(meanRadius(1), 1) * 100).toFixed(2) + "% of the light");
    L.push("");
    L.push("  *** THE FITTED HALF, LABELLED SO NOTHING DOWNSTREAM MISTAKES IT FOR THE EXACT ONE. ***");
    L.push("  " + fitted.note);
    L.push("     albedo A     s = 1.85 - A + 7|A-0.8|^3     d for mean free path 1");
    for (const A of [0.1, 0.3, 0.5, 0.8, 0.95, 1.0]) {
        L.push("   " + A.toFixed(2).padStart(8) + "     " + fitted.scalingFactor(A).toFixed(6).padStart(14) +
               "               " + fitted.distanceFor(A, 1).toFixed(6));
    }
    return L;
}
