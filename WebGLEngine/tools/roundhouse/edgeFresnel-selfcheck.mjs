// tools/roundhouse/edgeFresnel-selfcheck.mjs
//
// Run: node tools/roundhouse/edgeFresnel-selfcheck.mjs   (~30s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2914 -- THE THIRD GRID ALIGNMENT IN OPTICS, AND THE ONE PLACE THE MODE ACTUALLY VERIFIES SOMETHING.
//
// optics.edge reports three numbers. One is a tautology, one is excellent, and one agrees exactly with the
// textbook for a reason that has nothing to do with the physics. Telling them apart needed an independently
// written Fresnel implementation, which is the first thing this file builds.

import { fresnelCS, knifeEdgeIntensity } from "../../physics/optics/fresnel.js";
import { getDevice } from "./devices.mjs";
import { GRADED_BY_COMMENT } from "./exactZeroRegister.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

/**
 * INDEPENDENT Fresnel integrals: composite Simpson on cos(pi t^2 / 2) and sin(pi t^2 / 2) straight from the
 * definition. Deliberately the dumbest possible method -- no series, no rational approximation, no shared code
 * with fresnel.js -- because the point is to have written it twice, not to have written it well. This is the
 * same shape as v2898's kerr-at-a=0 check, which the tree calls its strongest cross-check.
 */
function csSimpson(v, n = 200000) {
    if (v === 0) return { C: 0, S: 0 };
    const h = v / n;
    let c = 0, s = 0;
    for (let i = 0; i <= n; i++) {
        const t = i * h, w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2), q = Math.PI * t * t / 2;
        c += w * Math.cos(q); s += w * Math.sin(q);
    }
    return { C: c * h / 3, S: s * h / 3 };
}

// ---- 1. THE CROSS-CHECK THE MODE SHOULD HAVE BEEN DOING ---------------------------------------------------------------
{
    let worstC = 0, worstS = 0;
    for (const v of [0.5, 1.0, 1.2172, 2.0, 3.0]) {
        const a = fresnelCS(v), b = csSimpson(v);
        worstC = Math.max(worstC, Math.abs(a.C - b.C));
        worstS = Math.max(worstS, Math.abs(a.S - b.S));
    }
    ok("!! the tree's Fresnel integrals agree with an independent quadrature",
        worstC > 0 && worstC < 1e-10 && worstS < 1e-10,
        "worst disagreement C " + worstC.toExponential(2) + ", S " + worstS.toExponential(2) + " over v in " +
        "[0.5, 3]. Nonzero, as two different algorithms must be, and small enough that fresnel.js is sound. " +
        "This had never been run -- the mode's own 'verification' was the tautology below");
}

// ---- 2. THE TAUTOLOGY -----------------------------------------------------------------------------------------------
{
    const z = fresnelCS(0);
    ok("!! edgeShadowIntensity is exact by construction and therefore tests nothing",
        z.C === 0 && z.S === 0 && knifeEdgeIntensity(0) === 0.25,
        "fresnelCS(0) returns C and S as exact zeros -- an integral over an empty interval, which ANY " +
        "implementation returns for free -- so knifeEdgeIntensity(0) = 0.5*(0.25+0.25) = 0.25 exactly no matter " +
        "how wrong the Fresnel integrals are elsewhere. The comment 'exactly 0.25, from C(0)=S(0)=0' states the " +
        "mechanism correctly and reads as a verification");

    // It would survive a deliberately broken implementation, which is the test that makes the point.
    const brokenCS = (v) => (v === 0 ? { C: 0, S: 0 } : { C: 99, S: -99 });
    const brokenEdge = (v) => { const { C, S } = brokenCS(v); return 0.5 * ((0.5 + C) ** 2 + (0.5 + S) ** 2); };
    ok("...demonstrated: a Fresnel implementation that is nonsense everywhere still scores 0.25 here",
        brokenEdge(0) === 0.25,
        "planted a fresnelCS returning 99 and -99 for every nonzero v; edgeShadowIntensity is unchanged at " +
        "exactly 0.25. A check that a broken implementation passes is not a check");

    ok("and it is registered as graded-by-comment rather than left implicit",
        !!GRADED_BY_COMMENT["optics.edge.edgeShadowIntensity"],
        "its answer key lives in a trailing comment, like slitFirstMinFactor, in a mode whose field names fail " +
        "the census selector -- so nothing has ever inspected it");
}

// ---- 3. THE GRID ALIGNMENT, FOR THE THIRD TIME IN THIS DEVICE ------------------------------------------------------------
{
    const o = await (await getDevice("optics")).build({ mode: "edge" });

    // independent optimum, to machine precision, by golden section
    let a = 1.0, b = 1.5; const gr = (Math.sqrt(5) - 1) / 2;
    let c = b - gr * (b - a), d = a + gr * (b - a);
    for (let i = 0; i < 200; i++) {
        if (knifeEdgeIntensity(c) > knifeEdgeIntensity(d)) b = d; else a = c;
        c = b - gr * (b - a); d = a + gr * (b - a);
    }
    const vStar = (a + b) / 2, iStar = knifeEdgeIntensity(vStar);

    ok("!! the reported fringe position is exactly the textbook 1.2172, and the true value is not",
        Math.abs(o.edgeFirstFringeV - 1.2172) < 1e-12 && Math.abs(vStar - 1.2172) > 1e-6,
        "device reports v = " + o.edgeFirstFringeV.toPrecision(12) + ", true optimum is " + vStar.toPrecision(12) +
        ". The refine loop steps by 0.0002 and 1.2172 is 6086 of those, so the search grid contains the ROUNDED " +
        "textbook number exactly. Third time in one device: airy landed on a wrong constant (v2911), slit on a " +
        "right one (v2913), and edge on a rounded one. Every impressive agreement in optics has been an alignment");

    ok("the position error is bounded by the search step, as it must be",
        Math.abs(o.edgeFirstFringeV - vStar) < 1e-4,
        "off by " + Math.abs(o.edgeFirstFringeV - vStar).toExponential(3) + ", inside half the 2e-4 step");
}

// ---- 4. THE ASYMMETRY, WHICH IS THE PART WORTH KEEPING --------------------------------------------------------------------
{
    const o = await (await getDevice("optics")).build({ mode: "edge" });
    let a = 1.0, b = 1.5; const gr = (Math.sqrt(5) - 1) / 2;
    let c = b - gr * (b - a), d = a + gr * (b - a);
    for (let i = 0; i < 200; i++) {
        if (knifeEdgeIntensity(c) > knifeEdgeIntensity(d)) b = d; else a = c;
        c = b - gr * (b - a); d = a + gr * (b - a);
    }
    const vStar = (a + b) / 2, iStar = knifeEdgeIntensity(vStar);
    const dv = Math.abs(o.edgeFirstFringeV - vStar), di = Math.abs(o.edgeFirstFringe - iStar);

    ok("!! the peak VALUE is six orders more accurate than the peak POSITION",
        di < 1e-10 && dv > 1e-7 && di < dv * 1e-4,
        "position off by " + dv.toExponential(3) + ", intensity off by " + di.toExponential(3) + ". At a smooth " +
        "maximum the first derivative vanishes, so an error of h in the location costs only O(h^2) in the value: " +
        "(1.7e-6)^2 is about 3e-12, which is what was measured. edgeFirstFringe is trustworthy to 8e-12 and " +
        "edgeFirstFringeV to 2e-6, and they are reported side by side with nothing to say so");

    ok("...so a coarse search is the right engineering choice for the value and the wrong one for the position",
        o.edgeFirstFringe > 1.3704 && o.edgeFirstFringe < 1.3705,
        "the mode's comment defends the coarse-then-refine search as giving 'the same answer' as a uniform 8000 " +
        "point sweep. For the intensity that is true and well argued. For the location it is true only to the " +
        "step size, and the comment does not distinguish the two");
}

// ---- 5. WHAT THIS DOES NOT ESTABLISH ---------------------------------------------------------------------------------------
{
    ok("nothing in opticsBind changed",
        (await (await getDevice("optics")).build({ mode: "edge" })).edgeShadowIntensity === 0.25,
        "the tautology is still reported. Replacing it with a real check -- edgeFirstFringe against an " +
        "independent optimum, which this file shows agrees to 8e-12 -- would change a graded number. CORRECTION " +
        "(v2915): the 'needs BASELINE.md regenerated' reason given here and in v2911 and v2913 was simply wrong. " +
        "No baseline contains an optics observable. Three rounds deferred on a cost that did not exist");
    console.log("  NOTE   three rounds have now each declined to adopt a fix for the same reason. That backlog is");
    console.log("         itself worth a round: one BASELINE regeneration could take the exact Airy constant, the");
    console.log("         refined slit and airy estimators, and a real edge check together, rather than paying");
    console.log("         the regeneration cost three times.");
}

console.log();
if (fails) { console.log("edgeFresnel-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("edgeFresnel-selfcheck: all checks pass");
