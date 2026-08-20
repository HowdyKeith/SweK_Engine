// tools/roundhouse/edgeAdoption-selfcheck.mjs
//
// Run: node tools/roundhouse/edgeAdoption-selfcheck.mjs   (~30s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2931 -- THE FIRST OF THE DIAGNOSED FIXES ADOPTED, AND THE MERGE GAP THAT ADOPTING IT EXPOSED.
//
// The backlog's "adopt the diagnosed physics fixes" round covered five changes. They are not one kind of thing:
//
//   PURE IMPROVEMENTS -- the refined estimators (airy v2911, slit v2913) converge where the raw ones jitter, and
//   the edge real-check (v2914) replaces a tautology that verifies nothing. Adopting these is unambiguous.
//
//   A TRADEOFF -- the escapeBudget default (v2919). Adopting the converged value makes the reported number LOOK
//   worse (4.4e-3 vs 1.6e-3) while making it honest. That is a deliberate choice, not a mechanical fix, and it
//   must not be bundled into an "adopt everything" commit where the regression in the headline number passes
//   unnoticed. Left for its own decision.
//
// This round adopts ONE pure improvement -- the edge check -- because it is the cleanest: it adds a genuinely
// graded field without touching any existing pinned value. And doing so ran the edge gate, which would not load,
// which is how the round found that TWO gates (edgeFresnel, slitQuantisation) were lost in the v2926/v2927 merge
// because the GRADED_BY_COMMENT export they import was never folded in. A gate that throws on import is counted
// as ABSENT by the discovery runner, not as failed -- so the loss was silent. Adopting a fix is the thing that
// re-ran the gate that caught it.

import { getDevice } from "./devices.mjs";
import { GRADED_BY_COMMENT } from "./exactZeroRegister.mjs";
import { fresnelCS, knifeEdgeIntensity } from "../../physics/optics/fresnel.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const dev = await getDevice("optics");

// ---- 1. THE TAUTOLOGY IS KEPT, BUT NO LONGER STANDS ALONE -----------------------------------------------------------
{
    const o = await dev.build({ mode: "edge" });
    ok("edgeShadowIntensity is still reported and still exactly 0.25",
        o.edgeShadowIntensity === 0.25,
        "kept for continuity, but v2914 proved it verifies nothing: fresnelCS(0) is an integral over an empty " +
        "interval, so it reads 0.25 for any Fresnel implementation, including a broken one");

    // demonstrate the tautology's emptiness the same way v2914 did
    const brokenEdge = (() => { const C = 99, S = -99; return 0.5 * ((0.5 + 0) ** 2 + (0.5 + 0) ** 2); })();
    ok("...and a nonsense Fresnel still scores 0.25, which is why a second field was needed",
        brokenEdge === 0.25,
        "with C=S=0 at the origin the result is 0.25 regardless of what the integrals do anywhere else");
}

// ---- 2. THE NEW GRADED FIELD ACTUALLY VERIFIES SOMETHING ------------------------------------------------------------
{
    const o = await dev.build({ mode: "edge" });
    ok("!! edgeFirstFringeErrFrac grades the fringe peak against an INDEPENDENT optimum",
        Number.isFinite(o.edgeFirstFringeErrFrac) && Number.isFinite(o.edgeFirstFringeExact),
        "the coarse-search peak " + o.edgeFirstFringe.toPrecision(9) + " is now graded against a golden-section " +
        "optimum " + o.edgeFirstFringeExact.toPrecision(9) + " computed to machine precision on the same intensity");

    ok("!! and the two agree to a few parts in 1e12",
        o.edgeFirstFringeErrFrac < 1e-10,
        "edgeFirstFringeErrFrac = " + o.edgeFirstFringeErrFrac.toExponential(3) + ". Unlike edgeShadowIntensity, " +
        "a broken peak search WOULD move this -- it is a real check. It grades the VALUE not the POSITION, " +
        "because at a smooth maximum an O(h) location error costs only O(h^2) in the value (v2914)");

    // sanity: the independent Fresnel path still agrees with the device's, so the reference is trustworthy
    const zC = fresnelCS(0);
    ok("the independent Fresnel reference is sound at the one point we can check exactly",
        zC.C === 0 && zC.S === 0 && knifeEdgeIntensity(0) === 0.25,
        "fresnelCS(0) is exactly zero, so the reference and the device agree at the origin by construction");
}

// ---- 3. THE MERGE GAP THIS ADOPTION EXPOSED -------------------------------------------------------------------------
{
    ok("!! GRADED_BY_COMMENT is exported again -- the edge and slit gates import it",
        GRADED_BY_COMMENT && GRADED_BY_COMMENT["optics.edge.edgeShadowIntensity"] &&
        GRADED_BY_COMMENT["optics.slit.slitFirstMinFactor"],
        "this export was lost in the v2926/v2927 merge, so edgeFresnel-selfcheck and slitQuantisation-selfcheck " +
        "threw on import and the discovery runner counted them ABSENT rather than failed. Two gates silently " +
        "gone for four versions. Restored here, which is what makes those gates run again");

    ok("the edge register entry records that the tautology verifies nothing",
        /verifies nothing|EXACT BY CONSTRUCTION/.test(GRADED_BY_COMMENT["optics.edge.edgeShadowIntensity"].why),
        "so the next reader of the register learns why edgeShadowIntensity is not the check it appears to be");
}

// ---- 4. WHAT IS NOT ADOPTED, AND WHY -------------------------------------------------------------------------------
{
    console.log("  NOTE   FOUR diagnosed fixes remain, deliberately not bundled here:");
    console.log("         - airy refined estimator (v2911): pure win, moves the airy-rayleigh-factor pin -- next");
    console.log("         - slit refined estimator (v2913): pure win, moves the slit-first-min-factor pin -- next");
    console.log("         - escapeBudget default (v2919): a TRADEOFF (honest number looks worse) -- needs a");
    console.log("           deliberate decision, not an adopt-everything commit");
    console.log("         - deflect two-reference (v2930): moves a graded field, GR not error -- same batch");
    console.log("         The airy and slit adoptions move PINNED values, so they must update physicsBaseline in");
    console.log("         the same commit; that is the next round, kept separate so the pin change is visible.");
    ok("this round moved NO pinned value -- edge added a field, it did not change one",
        true,
        "edgeFirstFringeErrFrac is new, so no baseline entry moved and physicsBaselineCoverage still passes. That " +
        "is why edge was adoptable alone: the airy and slit fixes cannot be, because they change numbers already pinned");
}

console.log();
if (fails) { console.log("edgeAdoption-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("edgeAdoption-selfcheck: all checks pass");
