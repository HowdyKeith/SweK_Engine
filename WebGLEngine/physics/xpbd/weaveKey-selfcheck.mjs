// physics/xpbd/weaveKey-selfcheck.mjs
//
// v3464 -- WIRING, NOT NEW KEYS, AND SAYING WHICH.
//
// *** ALL NINE REMAINING "UNGRADED" xpbd MODULES ALREADY HAVE PASSING SELFCHECKS. *** anisotropy, attach,
// clothLoop, fluid, modulate, muscle, sampledField, tear and windCloth are every one gated, and gated well.
// They count as ungraded because gradedCoverage measures what a *Bind.mjs IMPORTS, and no bind imports them.
// For these nine the number is measuring BIND WIRING rather than whether the physics is checked.
//
// SO THIS ADDS NO PHYSICS KEY, and the checks below deliberately mirror the modules' own gates rather than
// inventing rivals to them. What wiring buys is different and real: a module reachable from a device becomes
// reachable by the lab's machinery -- sweepDevice can sweep it, the sensitivity matrix can hunt dead knobs in
// it, resultBaseline pins its numbers against silent drift, valueMatch can find couplings against it. None of
// that reaches a module gated only by its own selfcheck.
//
// That is a DIFFERENT ACT from the earlier refusal to add a decorative import to xpbdBind purely to move the
// coverage number. A device mode exposes observables that are pinned, swept and compared; an import nothing
// calls exposes nothing. The first is integration, the second is decoration.
//
// AND THE RIG HAD TO BE COPIED, NOT GUESSED. My first version omitted the pinned leading edge, so every particle
// took the same force and the sheet TRANSLATED -- extent unchanged, measured stretch 1.98e-14. That reads as
// "this fabric is infinitely stiff" rather than "the rig applies no strain", and both directions came out at
// 1e-14 so the anisotropy ratio was still a plausible 6.85. A ratio of two noise floors is a number, not a
// measurement.

import { stretchAlong, weaveAnisotropy, tearRun } from "./weaveKey.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const a = weaveAnisotropy();
const t = tearRun();

// ---- 1. THE STRAIN IS REAL, WHICH IS THE CHECK THE FIRST VERSION NEEDED AND DID NOT HAVE -------------------------
{
    ok("!! the sheet actually stretches -- the rig applies strain rather than translation",
        a.softWarp > 1e-3 && a.finite === true,
        `soft direction gives ${a.softWarp.toFixed(6)} against a pinned edge. Without the pin the whole sheet ` +
        "translates under a uniform force, extent does not change, and both directions read 1e-14 -- from which " +
        "a perfectly plausible anisotropy ratio of 6.85 can still be computed. A ratio of two noise floors is a " +
        "number, not a measurement");
}

// ---- 2. THE DIRECTIONAL KEY -----------------------------------------------------------------------------------------
{
    ok("!! the softer thread direction gives an order of magnitude more",
        a.anisotropyRatio > 5,
        `${a.softWarp.toFixed(6)} along the soft warp against ${a.stiffWeft.toFixed(6)} across the stiff weft -- ` +
        `${a.anisotropyRatio.toFixed(2)}x. This is why a shirt stretches differently around than along`);

    ok("!! and swapping the two compliances swaps which direction gives",
        a.swapReverses === true,
        "the asymmetry follows the COMPLIANCES, not the axis. A solver that was simply stiffer along x would " +
        "pass the ratio check above and fail this one");

    ok("!! equal compliances make the cloth isotropic EXACTLY",
        a.isotropicWhenEqual === 0,
        `relative difference between the two axes is ${a.isotropicWhenEqual}. Not small -- zero. The warp and ` +
        "weft paths are the same arithmetic when their compliances match, and anything else would mean an axis " +
        "is being treated specially somewhere");
}

// ---- 3. TEARING IS IRREVERSIBLE --------------------------------------------------------------------------------------
{
    ok("!! tearing happens under load",
        t.tore === true && t.finite === true,
        `active constraints ${t.start} -> ${t.end} under gravity -50 with a tear strain of 1.06`);

    ok("!! and the active count only ever FALLS",
        t.monotoneDown === true,
        "checked at every one of 60 substeps, not just start against end. A constraint that healed would restore " +
        "a torn cloth silently, and an endpoint comparison could not tell that from a cloth that never tore " +
        "further");
}

console.log();
if (fails) { console.log("weaveKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("weaveKey-selfcheck: all checks pass");
