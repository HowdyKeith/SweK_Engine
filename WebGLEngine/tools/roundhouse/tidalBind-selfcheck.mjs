// tools/roundhouse/tidalBind-selfcheck.mjs
//
// Run: node tools/roundhouse/tidalBind-selfcheck.mjs   (~0.85s MEASURED -- four modes, each integrating geodesics)
//
// *** THIS DEVICE HAD NO GATE AT ALL. *** tidalBind.mjs has existed since v2894, carries a declared plant since
// v3686, exports seventeen observables across four modes -- and nothing ran it. It was found by knobLiveness
// sweeping for dead knobs: `blobCount` was a declared knob that moved no observable at any value, which is the
// v4028 iou() signature. The cause was different and larger.
//
// ================================================================================================================
// THE DEVICE'S OWN COMMENT STATED THE RULE, THE REASON, AND THE VIOLATION -- IN ONE BLOCK
// ================================================================================================================
//
// tidalDevice.modes carried this note: "Derived from this file's own default plus EVERY MODE ITS OWN build()
// BRANCHES ON, each verified to give a DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL
// USE. ***" -- above a list of three. build() branches on FOUR: deviation, validity and roche each return early
// and `blob` is the fallthrough. The header above it said "THREE MODES" and then described four.
//
// So the headline came true about the device that wrote it. Five declared observables -- blobStretch,
// blobStretchPredicted, blobStretchErrFrac, blobCount, blobDisrupted -- lived only in the branch nothing could
// reach by name, and blobCount read as a dead knob because the probe sweeps the declared list.
//
// ================================================================================================================
// AND blob WAS BLIND TO THE PLANT BY OMISSION, WHICH IS NOT THE SAME AS roche's BLINDNESS
// ================================================================================================================
//
//   roche  never calls fallLinear at all -- it measures the tidal field from two exact geodesics and grades that
//          against R(2M/m)^(1/3). BLIND BY CONSTRUCTION, and that is a property worth asserting.
//   blob   calls fallLinear for exactly the law the plant replaces, and did not pass the flag. BLIND BY
//          OMISSION -- the same shape as v4028's iou() dropping its threshold argument.
//
// ================================================================================================================
// *** AND THE THING THAT MAKES blob WORTH GRADING CAREFULLY: THE WRONG LAW FITS BETTER ***
// ================================================================================================================
//
// The blob's initial extent is 1.0 at r0 = 50. This device's OWN validity mode measures the linear tidal
// equation's domain limit at 1.407e-2 -- so blob runs SEVENTY-ONE TIMES PAST IT. Out there:
//
//     blobStretch (exact ensemble, 24 geodesics)   4.737978
//     honest linear prediction                     9.075716    errFrac 0.4780
//     PLANTED linear prediction                    3.519810    errFrac 0.3461   <- CLOSER
//
// A gate asserting "the prediction agrees with the measurement" would PREFER THE WRONG PHYSICS here. So
// blobStretchErrFrac is not a key and this file does not treat it as one: what is graded is that the ensemble
// measurement is blind to the plant (it is exact geodesics, no linear law in it) and that the prediction moves.
// The device already contained the instrument that explains why -- validity -- and nothing had connected them.
"use strict";
import { buildTidal, tidalDefaults, tidalDevice, TIDAL_OBSERVABLES, thermalModelNote } from "./tidalBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("tidalBind-selfcheck -- a mode nobody could discover, and the wrong law that fits better\n");

const dev = buildTidal({ mode: "deviation", config: {} });
const val = buildTidal({ mode: "validity", config: {} });
const roc = buildTidal({ mode: "roche", config: {} });
const blo = buildTidal({ mode: "blob", config: {} });

console.log("1. REGISTERED, AND EVERY MODE build() BRANCHES ON IS DISCOVERABLE");
{
    ok("tidal appears in DEVICE_NAMES", DEVICE_NAMES.includes("tidal"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("tidal");
    ok("!! the registry hands back THIS device", !!d && d.name === "tidal-disruption", d ? d.name : "nothing");
    ok("it declares plantKind KNOB", d.plantKind === "knob",
        "the plant drops the factor of two from the radial tidal term -- a LAW replaced, not a constant nudged");

    // *** THE ASSERTION THE DEVICE'S OWN COMMENT ASKED FOR AND DID NOT HAVE. ***
    const branched = ["deviation", "validity", "roche", "blob"];
    ok("!! *** EVERY MODE build() BRANCHES ON IS IN `modes` ***",
        branched.every((m) => d.modes.includes(m)),
        "declared " + JSON.stringify(d.modes) + ". The list's own comment says it is 'every mode its own build() "
        + "branches on' and it carried three of four -- `blob` is the fallthrough, so it never appeared. THE "
        + "COMMENT'S OWN HEADLINE IS 'A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE', and that is "
        + "precisely what happened to it.");
    ok("...and tidalDefaults accepts exactly the same four, so the two lists cannot drift apart",
        branched.every((m) => tidalDefaults({ mode: m }).mode === m),
        "a mode the normaliser accepts but `modes` omits is reachable by name and invisible to every consumer "
        + "that trusts the declaration -- which is how this one survived");
    ok("!! ...and each mode returns a DISTINCT kind, which is the comment's own criterion",
        new Set([dev.kind, val.kind, roc.kind, blo.kind]).size === 4,
        [dev.kind, val.kind, roc.kind, blo.kind].join(", "));
}

console.log("\n2. EVERY DECLARED OBSERVABLE IS PRODUCED BY SOME MODE");
{
    // The v3759 shape, checked here because this device is where it would have hidden: five of the seventeen
    // were produced ONLY by the unreachable branch.
    const produced = new Set();
    for (const r of [dev, val, roc, blo]) for (const k of Object.keys(r)) if (k !== "kind") produced.add(k);
    const missing = TIDAL_OBSERVABLES.filter((k) => !produced.has(k));
    ok("!! no declared observable is produced by NO mode", missing.length === 0,
        missing.join(", ") || TIDAL_OBSERVABLES.length + " declared, all produced. *** FIVE OF THESE COME ONLY "
        + "FROM `blob` *** -- blobStretch, blobStretchPredicted, blobStretchErrFrac, blobCount, blobDisrupted -- "
        + "so before the mode was declared this check would have named them.");
    const extra = [...produced].filter((k) => !TIDAL_OBSERVABLES.includes(k));
    ok("...and nothing unadvertised is produced", extra.length === 0, extra.join(", ") || "both directions agree");
    ok("...and every produced number is finite",
        [dev, val, roc, blo].every((r) => Object.entries(r).every(([k, v]) =>
            k === "kind" || typeof v === "boolean" || v === null || finite(v))),
        "no NaN or Infinity leaked out of four geodesic integrations");
}

console.log("\n3. THE THREE KEYS, EACH AGAINST SOMETHING IT DOES NOT CONTAIN");
{
    ok("!! deviation: two EXACT geodesics meet the linearised tidal equation in the small-separation limit",
        dev.deviationErrFrac < 1e-3,
        "exact separation " + dev.separationExact.toExponential(6) + " against linear "
        + dev.separationLinear.toExponential(6) + ", errFrac " + dev.deviationErrFrac.toExponential(3)
        + ". Neither route contains the other: one integrates two full radial geodesics, the other integrates "
        + "d2xi/dtau2 = 2M xi/r^3 along the reference fall.");
    ok("...and the fall was actually STRESSFUL, so the agreement is not a test that never ran",
        dev.stretchFactor > 5 && dev.rFinal < 5,
        "stretched " + dev.stretchFactor.toFixed(3) + "x, reaching r = " + dev.rFinal.toFixed(4)
        + "M. The file's own note records tau=20 falling 0.08M, where every mode agreed because nothing had "
        + "happened.");
    ok("!! validity: the limit is MEASURED, and it is a limit rather than a value",
        val.validitySeparation > 0 && val.deviationErrFrac > val.validityTol,
        "the linear equation stops matching to within " + val.validityTol + " at separation "
        + val.validitySeparation.toExponential(4) + " (" + val.validityFrac.toExponential(3) + " of r0), where "
        + "errFrac is " + val.deviationErrFrac.toExponential(3) + " -- past the tolerance, which is what makes "
        + "it the boundary and not the last passing sample");
    ok("!! roche: the disruption radius, with the tidal field MEASURED rather than inverted",
        roc.rocheErrFrac < 0.02 && roc.rocheErrFrac > 0,
        "bisected " + roc.rocheMeasured.toFixed(4) + " against R(2M/m)^(1/3) = " + roc.rocheExact.toFixed(4)
        + ", errFrac " + roc.rocheErrFrac.toExponential(3) + ". *** NONZERO ON PURPOSE: *** the file records an "
        + "earlier version computing the tidal field from the same closed form it was graded against and "
        + "returning EXACTLY 0.0 -- a tautology wearing a lab coat, and the zero was the tell.");
}

console.log("\n4. *** THE PLANT: DROP THE FACTOR OF TWO FROM THE RADIAL TIDAL TERM ***");
{
    const pDev = buildTidal({ mode: "deviation", config: { planted: true } });
    const pVal = buildTidal({ mode: "validity", config: { planted: true } });

    ok("!! deviation catches it by three orders of magnitude",
        dev.deviationErrFrac < 1e-3 && pDev.deviationErrFrac > 1,
        "errFrac " + dev.deviationErrFrac.toExponential(3) + " -> " + pDev.deviationErrFrac.toExponential(3)
        + ". The wrong law is dimensionally right, scales as 1/r^3, still stretches the pair and still grows "
        + "without bound -- every shape-of-the-answer check passes it. Only the exact integration separates them.");
    ok("!! *** AND validity COLLAPSES TO ITS SMALLEST PROBE, which is the sharper reading ***",
        pVal.validitySeparation < val.validitySeparation / 100,
        "the domain limit goes " + val.validitySeparation.toExponential(4) + " -> "
        + pVal.validitySeparation.toExponential(4) + ", the first separation the sweep tries. Under the plant "
        + "the linear equation does not merely lose accuracy for large bodies -- IT IS WRONG AT EVERY SIZE, and "
        + "the mode that measures a domain reports it has no domain.");
}

console.log("\n5. WHICH MODES CANNOT SEE IT -- AND THE TWO REASONS ARE DIFFERENT");
{
    const pRoc = buildTidal({ mode: "roche", config: { planted: true } });
    const pBlo = buildTidal({ mode: "blob", config: { planted: true } });

    ok("!! roche is BIT-IDENTICAL under the plant, BY CONSTRUCTION",
        roc.rocheMeasured === pRoc.rocheMeasured && roc.rocheErrFrac === pRoc.rocheErrFrac,
        "rocheMeasured " + roc.rocheMeasured.toFixed(6) + " under both. It never calls fallLinear -- the tidal "
        + "field comes from the second difference of two exact geodesics. A plant living in the linear law "
        + "cannot reach a mode that does not use it, and that is a property rather than a gap.");
    ok("!! *** blob NOW SEES IT, AND BEFORE v4029 IT DID NOT -- THAT WAS OMISSION, NOT CONSTRUCTION ***",
        blo.blobStretchPredicted !== pBlo.blobStretchPredicted,
        "blobStretchPredicted " + blo.blobStretchPredicted.toFixed(6) + " -> "
        + pBlo.blobStretchPredicted.toFixed(6) + ". blob calls fallLinear for exactly the law the plant "
        + "replaces and simply did not pass the flag -- the same shape as v4028's iou() dropping its threshold. "
        + "BLIND BY CONSTRUCTION AND BLIND BY OMISSION ARE DIFFERENT FACTS AND ONLY ONE IS A PROPERTY.");
    ok("...and the ensemble MEASUREMENT stays bit-identical, because it is exact geodesics",
        blo.blobStretch === pBlo.blobStretch && blo.blobCount === pBlo.blobCount,
        "blobStretch " + blo.blobStretch.toFixed(6) + " under both: 24 centres each on their own geodesic, no "
        + "linear law anywhere in it. The prediction moves and the measurement does not, which is what "
        + "localises the plant to the law.");
}

console.log("\n6. *** WHY blobStretchErrFrac IS NOT A KEY: THE WRONG LAW FITS BETTER ***");
{
    const pBlo = buildTidal({ mode: "blob", config: { planted: true } });
    const extent0 = 2 * tidalDefaults({ mode: "blob" }).config.bodyR;

    ok("!! the blob runs far past this device's OWN measured validity limit",
        extent0 / val.validitySeparation > 20,
        "initial extent " + extent0.toFixed(4) + " against a measured limit of "
        + val.validitySeparation.toExponential(4) + " -- " + (extent0 / val.validitySeparation).toFixed(1)
        + " TIMES PAST IT. The linear prediction is being evaluated deep outside its domain, and the device "
        + "already contained the instrument that says so.");
    ok("!! *** SO THE PLANTED PREDICTION IS CLOSER TO THE TRUTH THAN THE HONEST ONE ***",
        pBlo.blobStretchErrFrac < blo.blobStretchErrFrac,
        "honest errFrac " + blo.blobStretchErrFrac.toFixed(6) + " against planted "
        + pBlo.blobStretchErrFrac.toFixed(6) + ". *** A GATE ASSERTING 'THE PREDICTION AGREES WITH THE "
        + "MEASUREMENT' WOULD PREFER THE WRONG PHYSICS. *** That is why this file grades blob on the plant "
        + "moving the prediction and not on the two numbers being close, and why the 0.478 is REPORTED rather "
        + "than bounded.");
    report("blobDisrupted reads " + blo.blobDisrupted + " -- the ensemble stretched " + blo.blobStretch.toFixed(3)
        + "x and reached r = " + blo.rFinal.toFixed(4) + "M. It is a BOOLEAN SUMMARY of the run, not a key: "
        + "it is true whenever the extent grows tenfold or any centre crosses the horizon, both of which are "
        + "statements about this fixture rather than about the physics being right.");
}

console.log("\n7. THE MODEL THAT IS NOT A MEASUREMENT, STILL SAID OUT LOUD");
{
    const n = thermalModelNote();
    ok("!! the device still refuses to grade what it cannot key",
        Array.isArray(n.notGradeable) && n.notGradeable.length > 0 && typeof n.reason === "string",
        "NOT gradeable: " + n.notGradeable.join(", ") + ". Reason: " + n.reason);
    ok("...and it names what IS gradeable about the same scene rather than refusing the whole subject",
        Array.isArray(n.gradeable) && n.gradeable.length > 0,
        n.gradeable.join(", ") + " -- beam ARRIVAL is keyed by pulseArrivalTimes; beam DEPOSITION is a model. "
        + "The split is the point: 'render it if you like; never let it crystallise a claim'.");
}

console.log("\n" + (fails ? "tidalBind-selfcheck: " + fails + " FAILED" : "tidalBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
