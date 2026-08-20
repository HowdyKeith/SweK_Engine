// physics/optics/diffraction-selfcheck.mjs
//
// Run: node physics/optics/diffraction-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The diffraction propagator held to the closed forms it is supposed to reproduce. A single slit must give sinc squared;
// two slits must give Young's fringes at the spacing lambda over d; and a circular aperture must put its first dark ring
// at the Rayleigh limit, 1.22 lambda over D -- a number nobody fed the propagator, which falls out of the geometry the way
// the shedding threshold or the innermost stable orbit does. The propagator is graded against the analytic pattern we
// already know, so the answer key is exact. The sabotage drops the sine-of-angle from the phase -- the way a propagator
// silently loses its angular dependence -- and the slit no longer matches sinc squared, which the gate refuses.
import { meijerG, gamma as gammaFn } from "../../math/meijerG.js";
import { slitNumeric, slitAnalytic, doubleSlitNumeric, doubleSlitAnalytic, doubleSlitMaxima, circularNumeric, circularAnalytic, airyFirstMinimum, firstMinimumAt, scorePattern } from "./diffraction.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const lambda = 0.5;
const sweep = (lo, hi, n) => { const a = []; for (let i = 0; i <= n; i++) a.push(lo + (hi - lo) * i / n); return a; };

// ---- 1. A SINGLE SLIT REPRODUCES sinc^2 ------------------------------------------------------------
{
    const a = 4.0, st = sweep(-0.24, 0.24, 800);
    const s = scorePattern(slitNumeric(a, lambda, st), slitAnalytic(a, lambda, st));
    ok("!! the single-slit pattern matches the analytic sinc squared", s.rms < 1e-3,
       "the phasor-summed slit reproduces sinc^2 with rms " + s.rms.toExponential(1) + " -- the propagator is the correct diffraction integral, graded against a closed form.");
}

// ---- 2. TWO SLITS GIVE YOUNG'S FRINGES UNDER THE DIFFRACTION ENVELOPE ------------------------------
{
    const a = 4.0, d = 12.0, st = sweep(-0.13, 0.13, 1200);
    const s = scorePattern(doubleSlitNumeric(a, d, lambda, st), doubleSlitAnalytic(a, d, lambda, st));
    ok("!! two slits reproduce the analytic Young pattern -- interference fringes under a diffraction envelope", s.rms < 1e-3,
       "the numeric matches sinc^2 times cos^2 with rms " + s.rms.toExponential(1) + " -- the interference at spacing lambda/d, modulated by the single-slit envelope, both fall out of the same phasor sum.");
}

// ---- 3. A CIRCULAR APERTURE PUTS ITS FIRST DARK RING AT THE RAYLEIGH LIMIT 1.22 lambda / D ---------
{
    const D = 6.0, st = sweep(0, 0.24, 400);
    const ring = firstMinimumAt(circularNumeric(D, lambda, st), st), rayleigh = airyFirstMinimum(D, lambda);
    ok("!! the circular aperture's first dark ring lands at 1.22 lambda / D (Rayleigh)", ring != null && Math.abs(ring - rayleigh) / rayleigh < 0.01,
       "numeric first minimum " + ring.toFixed(4) + " vs analytic Rayleigh " + rayleigh.toFixed(4) + " -- within " + (Math.abs(ring - rayleigh) / rayleigh * 100).toFixed(2) + "%, the resolution limit falling out of the geometry.");
}

// --- v3072: THE CIRCULAR APERTURE FINALLY HAS A CURVE TO BE GRADED AGAINST -------------------------------------
// Slit and double-slit each shipped with a numeric integration AND an analytic form, graded against each other.
// The circular aperture shipped with the integration and ONE CONSTANT -- the 1.22 Rayleigh factor -- which pins
// a single point and says nothing about shape. A pattern can put its first dark ring in exactly the right place
// and be wrong everywhere else, and nothing here could have told you.
//
// The Airy closed form comes from the Meijer G (J_v = G^{1,0}_{0,2}(x^2/4 | ; v/2,-v/2)), so it inherits the
// SEVEN independent reductions meijerG-selfcheck already proves -- a check the numeric integration cannot give
// itself, from a module that knows nothing about optics.
{
    const D = 20e-6, lam = 550e-9;
    const st = []; for (let i = 0; i <= 200; i++) st.push(i * 0.12 / 200);
    const num = circularNumeric(D, lam, st, 300, 128);
    const ana = circularAnalytic(D, lam, st);
    const n0 = num[0], numN = num.map((v) => v / n0);

    let worst = 0, at = 0;
    for (let i = 0; i < st.length; i++) { const d = Math.abs(numN[i] - ana[i]); if (d > worst) { worst = d; at = st[i]; } }
    ok("!! the 2D aperture integration matches the Airy closed form across the whole pattern",
        worst < 1e-4, "max |numeric - analytic| = " + worst.toExponential(2) + " at sin(theta)=" + at.toFixed(4));
    ok("...at the centre both are exactly 1", Math.abs(ana[0] - 1) < 1e-12 && Math.abs(numN[0] - 1) < 1e-12,
        "2J1(u)/u -> 1 as u -> 0, handled as a limit rather than a division by zero");
    ok("...and the analytic curve puts its first dark ring at 1.22 lambda / D", (() => {
        const fm = firstMinimumAt(ana, st), want = airyFirstMinimum(D, lam);
        return Math.abs(fm - want) < (st[1] - st[0]) * 1.5;      // within one sample spacing
    })(), "firstMin " + firstMinimumAt(ana, st).toExponential(4) + " vs Rayleigh " + airyFirstMinimum(D, lam).toExponential(4));

    // SABOTAGE: the constant alone could not catch a wrong SHAPE, which is the gap this closes.
    const wrong = circularAnalytic(D * 1.05, lam, st);
    let wf = 0; for (let i = 0; i < st.length; i++) wf = Math.max(wf, Math.abs(numN[i] - wrong[i]));
    ok("!! SABOTAGE(aperture 5% off): the full-curve comparison CATCHES it",
        wf > 100 * worst, "max deviation " + wf.toExponential(2) + " vs " + worst.toExponential(2) + " for the true curve");
    ok("...and its first ring is still 'about right', which is why a constant was never enough", (() => {
        const fmW = firstMinimumAt(wrong, st), want = airyFirstMinimum(D, lam);
        return Math.abs(fmW - want) / want < 0.08;
    })(), "a 5% aperture error moves the ring 5% -- easy to miss, and the shape check does not miss it");

    // the G route is the source of the curve, so pin that it is really being used and really refuses
    ok("J1 through the Meijer G equals J1 by its own series", (() => {
        const j1 = (x) => { let s2 = 0; for (let k = 0; k < 60; k++) s2 += Math.pow(-1, k) / (gammaFn(k + 1) * gammaFn(k + 2)) * Math.pow(x / 2, 2 * k + 1); return s2; };
        for (const x of [0.5, 2, 5.1, 9.3]) {
            const g = meijerG({ m: 1, n: 0, a: [], b: [0.5, -0.5], z: x * x / 4 });
            if (!g.ok || Math.abs(g.value - j1(x)) > 1e-11) return false;
        }
        return true;
    })());
    ok("!! v=1 is NOT degenerate, and this is the case that proves the refusal is correctly scoped", (() => {
        const g = meijerG({ m: 1, n: 0, a: [], b: [0.5, -0.5], z: 1 });
        return g.ok === true;
    })(), "b = (0.5, -0.5) differ by the integer 1, but m = 1 so only the FIRST b sources residues -- the second sits in a denominator gamma");
}

console.log(fails ? "\ndiffraction-selfcheck: " + fails + " FAILED" : "\ndiffraction-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
