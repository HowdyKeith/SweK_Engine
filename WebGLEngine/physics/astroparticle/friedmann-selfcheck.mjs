// WebGLEngine/physics/astroparticle/friedmann-selfcheck.mjs — v3428
//
// Run: node physics/astroparticle/friedmann-selfcheck.mjs   (~45s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// ONE INTEGRATOR, THREE EXACT REGIMES, AND A THIRD INSTANCE OF THE BLINDNESS PATTERN.
//
// Each component of the universe dilutes differently, so a universe made of only one has a closed-form history:
// matter gives a ~ t^(2/3), radiation a ~ t^(1/2), a cosmological constant gives an exponential. Three exact
// answers from one piece of code, failing differently -- a wrong exponent on the matter term leaves the
// radiation case untouched and neither touches the exponential. Same structure as the beam's
// static/vibration/buckling, and the same reason it is worth having all three.
//
// *** AND THE CLOSURE CONDITION IS THE THIRD BLIND IDENTITY THIS SESSION HAS FOUND. ***
//   v3426 oscillation: unitarity is exact and cannot see a 27% error in the phase constant.
//   v3428 lensing:     mu_+ - mu_- = 1 exactly and cannot see a tenfold error in the Einstein radius.
//   v3428 here:        Om + Or + Ok + OL = 1 exactly and cannot see ANY error in the physics, because Ok is
//                      DEFINED as the remainder. It is arithmetic wearing the clothes of cosmology.
// Three instances in three subjects is no longer a quirk. A true, exactly-satisfied identity is worth checking
// AND is never sufficient, and the check that would catch a bad Friedmann equation is the AGE -- which depends
// on the exponents and moves when they are wrong.

import { closure, eOfA, expand, ageInHubbleTimes, fitExponent, AGE_MATTER_EXACT, AGE_RADIATION_EXACT,
         redshiftOfA, aOfRedshift, h0SI, GYR_S, MPC_KM } from "./friedmann.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE THREE EXACT REGIMES --------------------------------------------------------------------------------
{
    const m = expand({ Om: 1 });
    ok("!! a matter-only universe is exactly 2/3 of a Hubble time old",
       Math.abs(m.tau - AGE_MATTER_EXACT) < 1e-8,
       m.tau.toFixed(9) + " against " + AGE_MATTER_EXACT.toFixed(9) + " — integrated, not assumed");
    ok("...and its scale factor grows as t^(2/3), fitted from the integrated history",
       Math.abs(fitExponent(m.track) - 2 / 3) < 1e-4,
       "exponent " + fitExponent(m.track).toFixed(6) + " against 0.666667, fitted in log-log from the track rather than read off the formula");

    const r = expand({ Om: 0, Or: 1 });
    ok("!! a radiation-only universe is exactly half a Hubble time old",
       Math.abs(r.tau - AGE_RADIATION_EXACT) < 1e-8,
       r.tau.toFixed(9) + " against " + AGE_RADIATION_EXACT.toFixed(9));
    ok("...and grows as t^(1/2)",
       Math.abs(fitExponent(r.track) - 0.5) < 1e-4,
       "exponent " + fitExponent(r.track).toFixed(6) + " against 0.500000");

    const l = expand({ Om: 0, OL: 1, a0: 1e-3 });
    const pts = l.track.filter((p) => p.a > 0.01);
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pts) { const y = Math.log(p.a); sx += p.tau; sy += y; sxx += p.tau * p.tau; sxy += p.tau * y; }
    const rate = (pts.length * sxy - sx * sy) / (pts.length * sxx - sx * sx);
    ok("!! a Lambda-only universe expands EXPONENTIALLY, at exactly the Hubble rate",
       Math.abs(rate - 1) < 1e-6,
       "d(ln a)/d(H0 t) = " + rate.toFixed(9) + " against exactly 1 — a different functional form from the other two, " +
       "so an error in the power-law branch cannot hide here");
}

// ---- 2. THE REGIMES ARE INDEPENDENT, WHICH IS WHY THREE ARE WORTH HAVING ----------------------------------------------
{
    const mAge = ageInHubbleTimes({ Om: 1 });
    const rAge = ageInHubbleTimes({ Om: 0, Or: 1 });
    ok("!! the matter and radiation ages differ, so a single wrong dilution exponent cannot satisfy both",
       Math.abs(mAge - rAge) > 0.1,
       mAge.toFixed(6) + " against " + rAge.toFixed(6) + " — 2/3 and 1/2, which are different numbers for a reason: " +
       "matter dilutes as volume and radiation as volume plus a redshift");
}

// ---- 3. *** THE CLOSURE IDENTITY, AND ITS BLINDNESS, WHICH IS THE POINT OF INCLUDING IT. *** ---------------------------
{
    const cases = [{ Om: 0.315, Or: 9.2e-5, OL: 0.685 }, { Om: 1 }, { Om: 0.3, OL: 0.2 }, { Or: 0.5, OL: 0.9 }];
    const worst = Math.max(...cases.map((c) => {
        const o = closure(c);
        return Math.abs(o.Om + o.Or + o.Ok + o.OL - 1);
    }));
    ok("!! the density parameters sum to exactly 1, in every universe tried",
       worst < 1e-15, "worst deviation " + worst.toExponential(1));
    ok("!! ...and that is a DEFINITION, not a measurement: Ok is the remainder, so the sum cannot fail",
       closure({ Om: 99, OL: -400 }).Ok === 1 - 99 + 400,
       "an absurd universe with Om = 99 and OL = -400 still closes exactly, because closing is what the arithmetic " +
       "does. THIRD INSTANCE of the pattern: oscillation's unitarity could not see a 27% phase error, lensing's " +
       "mu_+ - mu_- could not see a tenfold radius error, and this cannot see anything at all");
    // and the check that IS sensitive
    const good = ageInHubbleTimes({ Om: 1 });
    const wrongDilution = (() => {
        // matter diluting as a^-2 instead of a^-3: a plausible typo, and the age moves
        const g = (a) => 1 / (a * Math.sqrt(1 / (a * a)));
        let tau = 0; const n = 200000, a0 = 1e-6, h = (1 - a0) / n;
        for (let i = 0; i < n; i++) { const a = a0 + i * h; tau += h * g(a + h / 2); }
        return tau;
    })();
    ok("!! the AGE is the key that is not blind -- a wrong dilution exponent moves it",
       Math.abs(wrongDilution - good) / good > 0.1,
       "matter diluting as a^-2 instead of a^-3 gives " + wrongDilution.toFixed(6) + " against " + good.toFixed(6) +
       " — a plausible typo that the closure identity would wave through and the age catches");
}

// ---- 4. REDSHIFT AND SCALE FACTOR ARE THE SAME STATEMENT ---------------------------------------------------------------
{
    const zs = [0, 0.5, 1, 6, 1100];
    const worst = Math.max(...zs.map((z) => Math.abs(redshiftOfA(aOfRedshift(z)) - z)));
    ok("!! 1 + z = 1/a exactly, round-tripping from recombination to today",
       worst < 1e-9,
       "worst " + worst.toExponential(1) + " over z from 0 to 1100 — the surface of last scattering at z = 1100 " +
       "corresponds to a = " + aOfRedshift(1100).toExponential(4) + ", so the universe was about a thousand times smaller");
}

// ---- 5. A NUMBER SOMEBODY CAN RECOGNISE --------------------------------------------------------------------------------
{
    const H0 = 67.4;                                   // km/s/Mpc
    const tH = 1 / h0SI(H0);                           // Hubble time in seconds
    const ageGyr = ageInHubbleTimes({ Om: 0.315, OL: 0.685 }) * tH / GYR_S;
    ok("!! a flat universe with Om = 0.315 and OL = 0.685 at H0 = 67.4 comes out about 13.8 Gyr old",
       ageGyr > 13.0 && ageGyr < 14.5,
       ageGyr.toFixed(3) + " Gyr — the Planck value is 13.797, and this is integrated from the Friedmann equation " +
       "rather than looked up");
    ok("...and the Hubble time itself is about 14.5 Gyr, which is NOT the age and is often confused with it",
       Math.abs(tH / GYR_S - 14.5) < 0.5,
       (tH / GYR_S).toFixed(3) + " Gyr against the " + ageGyr.toFixed(3) + " above — they differ because the expansion " +
       "rate has not been constant, and the near-agreement is a coincidence of our epoch rather than an identity");
}

console.log(fails ? ("[friedmann-selfcheck] FAILED " + fails) : "[friedmann-selfcheck] all passed");
process.exit(fails ? 1 : 0);
