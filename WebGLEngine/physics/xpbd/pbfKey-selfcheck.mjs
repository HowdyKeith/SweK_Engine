// physics/xpbd/pbfKey-selfcheck.mjs
//
// v3462 -- THE SPH KERNEL NORMALISATION AS AN EXACT ANALYTIC KEY. Fifth of fifteen ungraded xpbd modules.
//
// poly6 W(r,h) = 315/(64 pi h^9) (h^2 - r^2)^3 integrates to EXACTLY 1 over the sphere of radius h, for every h.
// The interior integral is 16/315 of 4 pi h^9 and the leading constant is precisely its reciprocal, so the
// normalisation is a closed-form identity rather than a fitted constant. Measured by quadrature: 1.0000000000 at
// h = 0.5, 1.0 and 2.5, worst error 2.66e-14.
//
// THE h-INDEPENDENCE IS THE POINT. A kernel normalised for one smoothing length and used at another gives
// densities wrong by (h/h')^3, and every pressure downstream inherits it silently.
//
// *** AND poly6 TAKES r SQUARED, NOT r. *** The first measurement passed r and got 0.328125 -- a clean 21/64
// that reads exactly like a normalisation constant gone astray in the source. The module is correct; the call
// was wrong. THE PEAK AGREED, because poly6(0,h) and poly6(0^2,h) are the same call -- so a single-point spot
// check passed while every other radius was evaluated at the wrong place. Tenth wrong argument this session, and
// the first where a spot check actively concealed the error rather than merely missing it.

import { kernelIntegral, poly6Peak, latticeRestDensity, compressionRecovery, lattice } from "./pbfKey.mjs";
import { poly6 } from "./pbf.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE NORMALISATION IS EXACT, AND h-INDEPENDENT ------------------------------------------------------------
{
    const hs = [0.5, 1.0, 2.5];
    const errs = hs.map((h) => Math.abs(kernelIntegral(h) - 1));
    ok("!! poly6 integrates to exactly 1 over its support, at every smoothing length",
        errs.every((e) => e < 1e-10),
        `errors ${errs.map((e) => e.toExponential(2)).join(", ")} at h = ${hs.join(", ")}. This is an analytic ` +
        "identity, not a calibration -- the leading 315/(64 pi h^9) is the exact reciprocal of the interior " +
        "integral, so any h must give 1");

    ok("!! and h-independence is the property that matters",
        Math.max(...errs) / Math.min(...errs) < 100,
        "a kernel normalised for one smoothing length and used at another gives densities wrong by (h/h')^3, " +
        "and every pressure downstream inherits it without complaint. Checking one h would not have seen that");
}

// ---- 2. THE ARGUMENT SHAPE, WHICH A SPOT CHECK CONCEALED ---------------------------------------------------------------
{
    const h = 1, K = 315 / (64 * Math.PI);
    ok("!! poly6 takes r SQUARED -- verified away from the origin, where it matters",
        Math.abs(poly6(0.25, h) - K * Math.pow(h * h - 0.25, 3)) < 1e-12 &&
        Math.abs(poly6(0.5, h) - K * Math.pow(1 - 0.5, 3)) < 1e-12,
        "the peak agrees whichever convention is assumed, because poly6(0,h) and poly6(0^2,h) are the same call. " +
        "Passing r instead of r^2 gave an integral of 0.328125 -- a clean 21/64 that reads like a normalisation " +
        "constant gone wrong in the source. A single-point check at the origin passed and hid it");

    ok("...and the kernel vanishes outside its support",
        poly6(1.5 * 1.5, 1) === 0 && poly6(1.0, 1) === 0,
        "exactly zero at and beyond r = h, so the neighbour cutoff and the kernel agree on where the support " +
        "ends. A kernel with a tail past the search radius would lose mass the neighbour list never offered it");
}

// ---- 3. THE SOLVER RECOVERS COMPRESSION -------------------------------------------------------------------------------
{
    const c = compressionRecovery();
    ok("the density statistics are finite",
        c.finite === true,
        "asserted before any verdict is drawn from them, as with the NaN series two rounds ago");

    ok("!! a lattice squeezed to 88% has its density error driven down",
        c.reduction > 4,
        `rms density error ${c.before.rms.toFixed(4)} -> ${c.after.rms.toFixed(4)}, a ` +
        `${c.reduction.toFixed(2)}x reduction over sixty steps. The constraint is C_i = rho_i/rho0 - 1, so this ` +
        "is the solver doing the one thing it exists to do");

    ok("!! and the rest density is MEASURED from the lattice, not assumed to be 1",
        c.rho0 > 100,
        `interior density of the relaxed lattice is ${c.rho0.toFixed(2)} at spacing 0.16 and h 0.25. Passing ` +
        "rho0 = 1 -- the module's own default -- makes every constraint report a two-hundred-fold error that no " +
        "amount of projection can fix, and the recovery ratio then measures nothing. The first run of this did " +
        "exactly that and reported a 2.1x 'improvement' that was the solver flailing");
}

console.log();
if (fails) { console.log("pbfKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("pbfKey-selfcheck: all checks pass");
