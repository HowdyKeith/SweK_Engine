// WebGLEngine/physics/optics/beerLambert-selfcheck.mjs — v3411
//
// Run: node physics/optics/beerLambert-selfcheck.mjs   (~0.04s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** THIS LAW WAS ASSUMED EVERYWHERE IN THE TREE AND TESTED NOWHERE. *** radon() in ct.js computes the line
// integral of mu, which IS the Beer-Lambert exponent and is the whole premise of computed tomography. Nothing
// ever took the exponential, measured I/I0, or asked what happens when the assumption fails. Asked directly at
// v3409, the honest answer was "half, and unnamed"; this is the other half.
//
// THREE THINGS MUST HOLD EXACTLY -- the exponential, the half-value layer, and the additivity of optical depth
// over stacked slabs, which is precisely what makes a LINE INTEGRAL the right object for CT.
//
// *** AND ONE THING MUST FAIL, WHICH IS THE INTERESTING HALF. *** Beer-Lambert is exact only for a MONOCHROMATIC
// beam. A real tube emits a spectrum, mu falls steeply with photon energy, the soft photons are absorbed first,
// and what survives is HARDER than what went in. So the effective attenuation FALLS WITH DEPTH, the line
// integral CT assumes is not the quantity being measured, and a uniform cylinder reconstructs with its edges
// brighter than its middle. This tree contains a tomography instrument whose correctness depends on that failure
// not happening, and until now nothing here could say how large it is.

import { transmit, opticalDepth, halfValueLayer, transmitStack,
         muOfEnergy, spectrum, transmitPoly, effectiveMu, effectiveMuMono, cupping } from "./beerLambert.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE HALF-VALUE LAYER IS EXACT ---------------------------------------------------------------------------
{
    const rows = [0.05, 0.2, 1.3, 7].map((mu) => ({ mu, hvl: halfValueLayer(mu), left: transmit(1, mu, halfValueLayer(mu)) }));
    const worst = Math.max(...rows.map((r) => Math.abs(r.left - 0.5)));
    ok("!! after exactly one half-value layer, exactly half is left -- at every attenuation coefficient",
       worst < 1e-15,
       rows.map((r) => "mu=" + r.mu + ": " + r.left.toFixed(15)).join(", ").slice(0, 150) +
       " — worst deviation " + worst.toExponential(1) + ", which is round-off and not a tolerance");
    // and n of them leave 2^-n, which is a stronger statement than the single case
    const n5 = transmit(1, 0.2, 5 * halfValueLayer(0.2));
    ok("!! ...and five of them leave exactly 1/32",
       Math.abs(n5 - 1 / 32) < 1e-15, n5.toFixed(15) + " against " + (1 / 32).toFixed(15));
}

// ---- 2. OPTICAL DEPTHS ADD, WHICH IS WHY A LINE INTEGRAL IS THE RIGHT OBJECT -------------------------------------------
{
    const slabs = [{ mu: 0.3, x: 2 }, { mu: 1.1, x: 0.7 }, { mu: 0.05, x: 14 }];
    const stacked = transmitStack(1, slabs);
    const summed = transmit(1, 1, slabs.reduce((s, b) => s + b.mu * b.x, 0));
    ok("!! three different slabs transmit exactly what one slab of the summed optical depth does",
       Math.abs(stacked - summed) < 1e-15,
       stacked.toFixed(15) + " vs " + summed.toFixed(15) +
       " — the exponents ADD, and that additivity is the entire reason CT can reconstruct from line integrals");
    // order-independence falls out of the same fact and is worth stating separately
    const reversed = transmitStack(1, [...slabs].reverse());
    ok("...and the order of the slabs cannot matter",
       stacked === reversed, "identical to the last bit");
}

// ---- 3. THE MONOCHROMATIC CONTROL: NO HARDENING, AT ANY DEPTH ------------------------------------------------------------
// If this moved, the hardening measured below would be the integrator rather than the physics.
{
    const rows = [0.5, 5, 40].map((x) => effectiveMuMono(x, 70));
    const spread = Math.max(...rows) - Math.min(...rows);
    ok("!! a single-energy beam shows NO hardening across an eighty-fold thickness change",
       spread < 1e-12,
       "mu_eff = " + rows[0].toFixed(9) + " at every thickness — exactly flat, which is what makes the polychromatic result below a measurement of physics rather than of arithmetic");
}

// ---- 4. *** BEAM HARDENING: THE LAW FAILS, AND BY HOW MUCH IS NOW MEASURED. *** -------------------------------------------
{
    const xs = [0.5, 2, 5, 10, 20, 40];
    const mus = xs.map((x) => effectiveMu(x));
    const monotone = mus.every((v, i) => i === 0 || v < mus[i - 1]);
    ok("!! with a real spectrum the effective attenuation FALLS with depth -- monotonically",
       monotone,
       xs.map((x, i) => "x=" + x + ": " + mus[i].toFixed(4)).join(", "));
    ok("!! ...by a factor of " + (mus[0] / mus[5]).toFixed(1) + " across the range, which is not a small correction",
       mus[0] / mus[5] > 3,
       mus[0].toFixed(4) + " down to " + mus[5].toFixed(4) +
       " — the soft photons are absorbed first, so what survives is harder than what entered. Beer-Lambert is " +
       "EXACT for one energy and WRONG for a spectrum, and every real x-ray tube emits a spectrum");
    // the mechanism, checked rather than asserted: mu really does fall steeply with energy
    ok("...and the mechanism is the steep energy dependence of mu, which is checked and not merely claimed",
       muOfEnergy(30) / muOfEnergy(90) > 5,
       "mu(30 keV)/mu(90 keV) = " + (muOfEnergy(30) / muOfEnergy(90)).toFixed(1) + " — no steep mu(E), no hardening");
}

// ---- 5. CUPPING: WHY A UNIFORM CYLINDER RECONSTRUCTS AS NON-UNIFORM ---------------------------------------------------------
{
    const c = cupping({ radius: 10 });
    ok("!! a ray through the CENTRE of a uniform cylinder reports a LOWER attenuation than one near the edge",
       c.centre < c.edge,
       "centre " + c.centre.toFixed(5) + " vs edge " + c.edge.toFixed(5) +
       " — the central ray crosses more material, hardens more, and reads softer");
    ok("!! ...a " + (c.cupFraction * 100).toFixed(0) + "% cup on a perfectly uniform object",
       c.cupFraction > 0.1,
       "and the object has NO structure at all: every bit of that is the measurement model being wrong, which is " +
       "exactly the artefact radiologists call cupping");
    ok("the effect is monotone across the chord, so it reads as a smooth bowl rather than as noise",
       c.rows.every((r, i) => i === 0 || r.muEff >= c.rows[i - 1].muEff - 1e-12),
       c.rows.map((r) => r.muEff.toFixed(3)).join(" -> ") + " from axis to rim");
}

// ---- 6. WHAT THIS MEANS FOR THE TOMOGRAPHY INSTRUMENT ALREADY IN THE TREE ----------------------------------------------------
// ct.js computes the line integral of mu directly and reconstructs from it. That is correct for the
// monochromatic case it implicitly assumes, and this file now says what the assumption costs when it is false.
{
    const monoDepth = opticalDepth(muOfEnergy(70), 20);
    const polyDepth = -Math.log(transmitPoly(20));
    ok("!! the sinogram value CT would record differs from the true line integral once the beam is polychromatic",
       Math.abs(monoDepth - polyDepth) / monoDepth > 0.1,
       "monochromatic optical depth " + monoDepth.toFixed(4) + " against the polychromatic measurement " + polyDepth.toFixed(4) +
       " for the same material and thickness — ct.js is right about the monochromatic case it assumes, and this is the size of the assumption");
}

console.log(fails ? ("[beerLambert-selfcheck] FAILED " + fails) : "[beerLambert-selfcheck] all passed");
process.exit(fails ? 1 : 0);
