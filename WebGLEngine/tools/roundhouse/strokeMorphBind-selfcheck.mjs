// tools/roundhouse/strokeMorphBind-selfcheck.mjs
//
// Run: node tools/roundhouse/strokeMorphBind-selfcheck.mjs   (~1s MEASURED -- two builds over ten glyphs)
//
// THIS GRADES THE BIND. physics/mesh/strokeMorph-selfcheck.mjs owns the morphing.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THE DEFECT IS INVISIBLE IN THE THING THE MODULE PRODUCES. ***
// toPathD rounds to four decimal places and the endpoint drift is 1.776e-15, so under the plant the rendered
// path string is BIT-IDENTICAL for all ten pairs while forty of six hundred and forty floats differ. A test
// that compared the module's own output would certify the broken morph and see nothing.
//
// AND THE IDENTITY WAS HALF TRUE, WHICH IS WHY IT SURVIVED BEING WRITTEN DOWN. The module's header records the
// author claiming "a + 1*(b-a) IS b IN IEEE-754" and the gate falsifying it. Measured here: exact at t=0 in ALL
// 640 comparisons, wrong at t=1 in 40. A claim that holds at one end is the hardest kind to doubt.
"use strict";
import { strokeMorphDevice, STROKEMORPH_OBSERVABLES } from "./strokeMorphBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { parseStroke, resample, morphAt, toPathD, DIGIT_STROKES } from "../../physics/mesh/strokeMorph.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("strokeMorphBind-selfcheck -- half true, and invisible in the output\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("strokeMorph appears in DEVICE_NAMES", DEVICE_NAMES.includes("strokeMorph"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("strokeMorph");
    ok("!! the registry hands back THIS device",
        !!d && d.name === "the-identity-that-was-half-true-and-invisible-in-the-output", d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method",
        "the endpoint arithmetic is wrong and no config value records it");
    const def = d.defaults({});
    ok("!! defaults() returns the whole config, so the knobs are DERIVED",
        ["N", "curveSteps", "lineA", "lineB"].every((k) => k in def.config), Object.keys(def.config).join(", "));
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = strokeMorphDevice.build(strokeMorphDevice.defaults());
    ok("!! no advertised observable is missing", STROKEMORPH_OBSERVABLES.every((k) => k in v),
        STROKEMORPH_OBSERVABLES.filter((k) => !(k in v)).join(", ") || STROKEMORPH_OBSERVABLES.length + " produced");
    ok("...and every one is finite", STROKEMORPH_OBSERVABLES.every((k) => finite(v[k])),
        STROKEMORPH_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => STROKEMORPH_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !STROKEMORPH_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. THE RESAMPLER, AGAINST A CLOSED FORM THAT CONTAINS NO SEARCH");
{
    const v = strokeMorphDevice.build({ config: {} });
    ok("!! on a straight segment the search lands on A + f*(B-A) at machine zero",
        v.straightLineWorstErr < 1e-14,
        "worst " + v.straightLineWorstErr.toExponential(3) + " across N = 2, 3, 8 and 64. The arc-length "
        + "fraction k/(N-1) of a segment HAS a closed form, and the resampler never forms it -- so this is two "
        + "routes rather than a restatement.");
    ok("!! the resampler's endpoints are placed by IDENTITY, so they are bit-exact",
        v.resampleEndpointMismatch === 0,
        "0 mismatches over 20 checks (both ends of ten glyphs). A division at the exact end can land one ulp "
        + "short, and an endpoint that drifted would make the morph's strongest key a tolerance for a reason "
        + "having nothing to do with morphing.");
}

console.log("\n4. *** THE ARMCHAIR CLAIM, MEASURED -- AND IT IS HALF TRUE ***");
{
    const v = strokeMorphDevice.build({ config: {} });
    ok("!! a + 0*(b-a) really IS a, in every one of the comparisons",
        v.naiveLerpZeroMismatch === 0,
        "0 of " + v.morphComparisons + ". This half of the claim holds exactly.");
    ok("!! *** AND a + 1*(b-a) IS NOT b: forty of six hundred and forty ***",
        v.naiveLerpOneMismatch > 0 && v.naiveLerpOneMismatch < v.morphComparisons,
        v.naiveLerpOneMismatch + " of " + v.morphComparisons + ", worst drift "
        + v.naiveWorstDrift.toExponential(3) + ". At t=1 the SUBTRACTION rounds and then the ADDITION rounds "
        + "again. *** A CLAIM THAT HOLDS AT ONE END IS THE HARDEST KIND TO DOUBT *** -- which is how it got "
        + "written down, and why the module's header records the correction rather than hiding it.");
    ok("!! the shipped morphAt is exact at BOTH ends, by construction rather than by tolerance",
        v.morphZeroMismatch === 0 && v.morphOneMismatch === 0,
        "0 and 0 of " + v.morphComparisons + ". morphAt returns the endpoint ITSELF at t=0 and t=1 -- the "
        + "identity made true rather than hoped for, and a vendored morph cannot be asked to guarantee it.");
}

console.log("\n5. THE DIRECTION SEARCH IS LIVE, AND THE PARSER REFUSES");
{
    const v = strokeMorphDevice.build({ config: {} });
    ok("!! the reversed pairing WINS on four of ten adjacent digit pairs",
        v.reversedPairs > 0 && v.reversedPairs < v.glyphs,
        v.reversedPairs + " of " + v.glyphs + ", worst travel saved " + v.travelSavedWorst.toFixed(4)
        + ". NOT A DEAD BRANCH: a glyph authored end-to-start would travel the long way round and every point "
        + "would cross the shape. Direction is chosen by MEASUREMENT.");
    ok("!! the parser REFUSES every unsupported op rather than skipping it",
        v.parserRefusals === 5 && v.parserAccepted === 0,
        "quadratic, close, arc, relative lineto and a single point -- all thrown. A parser that ignores what it "
        + "does not understand produces a shape that is wrong in a way NOTHING DOWNSTREAM CAN SEE.");
}

console.log("\n6. *** THE PLANT: LET THE LERP PLACE THE ENDPOINTS ***");
{
    const h = strokeMorphDevice.build({ config: {} });
    const p = strokeMorphDevice.build({ config: { planted: true } });

    ok("!! *** the t=1 identity breaks in exactly the forty places the naive lerp already failed ***",
        h.morphOneMismatch === 0 && p.morphOneMismatch === h.naiveLerpOneMismatch && p.morphOneMismatch === 40,
        h.morphOneMismatch + " -> " + p.morphOneMismatch + ", against " + h.naiveLerpOneMismatch
        + " measured directly. The plant IS the module's own recorded defect, not an invented one -- and the "
        + "two numbers agreeing is what shows it.");
    ok("...and t=0 does not move, because that half was never wrong",
        h.morphZeroMismatch === p.morphZeroMismatch && p.morphZeroMismatch === 0,
        "0 under both. The plant removes BOTH short-circuits and only one end notices.");

    report("WHAT THE PLANT CANNOT REACH, ASSERTED SO THE BLINDNESS CANNOT WIDEN SILENTLY.");
    ok("!! *** THE RENDERED PATH STRING IS BIT-IDENTICAL FOR EVERY PAIR ***",
        h.pathStringDiffPairs === 0 && p.pathStringDiffPairs === 0,
        "0 of " + h.glyphs + " pairs differ. toPathD rounds to four decimal places and the drift is "
        + h.naiveWorstDrift.toExponential(3) + ". *** A TEST THAT COMPARED THE MODULE'S OWN OUTPUT WOULD "
        + "CERTIFY THE BROKEN MORPH AND SEE NOTHING AT ALL. *** That is why the identity is asserted on floats, "
        + "and why both counts are reported side by side rather than only the one that looks worse.");
    {
        // The claim above, re-measured here rather than inferred from two builds agreeing.
        const a = resample(parseStroke(DIGIT_STROKES[0]), 64), b = resample(parseStroke(DIGIT_STROKES[1]), 64);
        const naive = a.map((q, i) => [q[0] + 1 * (b[i][0] - q[0]), q[1] + 1 * (b[i][1] - q[1])]);
        ok("...spot-checked directly on one pair", toPathD(morphAt(a, b, 1)) === toPathD(naive),
            "identical strings from different floats");
    }
    ok("!! the straight-line key and the resampler's endpoints are untouched",
        h.straightLineWorstErr === p.straightLineWorstErr &&
        h.resampleEndpointMismatch === p.resampleEndpointMismatch,
        "the plant is in morphAt, and neither of these calls it");
    ok("...and so are the direction search and the parser", h.reversedPairs === p.reversedPairs &&
        h.parserRefusals === p.parserRefusals, "different subjects entirely");
}

console.log("\n7. THE SECOND PLANT THAT DOES NOT FIRE, REPORTED RATHER THAN DROPPED");
{
    const v = strokeMorphDevice.build({ config: {} });
    ok("!! *** the same fault applied to the RESAMPLER produces zero mismatches ***",
        v.resampleEndpointPlantedMismatch === 0,
        "0 of 20, zero drift. The last sample's interpolation factor is (total - s0)/(s1 - s0) with s1 = total, "
        + "which is EXACTLY 1, and pts[j-1] + 1*(pts[j] - pts[j-1]) happens to be exact for these coordinates -- "
        + "adjacent points of ONE polyline rather than two unrelated resamplings. *** THE IDENTITY BITES ONLY "
        + "WHERE THE OPERANDS ARE GENERAL. *** Shipping only the half that fires and staying quiet about the "
        + "half that does not would be picking the fixture to suit the plant.");
    report("The resampler's endpoint copy is therefore NOT shown to be load-bearing on this glyph set. It is "
        + "still right -- the reason given for it is about the arithmetic, not about these ten digits -- but "
        + "this device cannot claim to have measured it, and says so.");
}

console.log("\n8. THE REFUSAL'S EXPIRY, COUNTED TWO WAYS BECAUSE 'CLOSED' HAS TWO READINGS");
{
    const v = strokeMorphDevice.build({ config: {} });
    ok("!! no glyph has more than one subpath, so subpath correspondence is trivial",
        v.multiSubpathGlyphs === 0, "0 of " + v.glyphs);
    ok("!! no glyph is Z-terminated -- closed in the SVG-DECLARATION sense",
        v.zTerminatedGlyphs === 0, "0 of " + v.glyphs);
    ok("!! *** BUT TWO GLYPHS RETURN EXACTLY TO THEIR START, WHICH IS THE OTHER READING OF CLOSED ***",
        v.endpointCoincidentGlyphs === 2,
        v.endpointCoincidentGlyphs + " of " + v.glyphs + " -- the 0 and the 8. The header's 'none closed' is "
        + "CORRECT under the declaration reading and false under the geometric one. THIS FILE DOES NOT "
        + "ADJUDICATE WHICH ONE morphicons' ROTATION ALIGNMENT USES: that would need the package, which is not "
        + "a dependency here and the whole point was not to make it one. Both numbers are reported so the "
        + "refusal's premise can be seen to be narrower than one sentence makes it sound.");
    report("THE EXPIRY IS NOW A TRIP-WIRE RATHER THAN A PROMISE: the refusal says 'the moment somebody wants a "
        + "closed or multi-subpath icon, this file is the wrong tool'. Both conditions are counted every run, "
        + "so a glyph set arriving with a Z in it turns the refusal red instead of leaving it to be remembered.");
}

console.log("\n" + (fails ? "strokeMorphBind-selfcheck: " + fails + " FAILED" : "strokeMorphBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
