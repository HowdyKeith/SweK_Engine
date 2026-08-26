// tools/roundhouse/reconQualityBind-selfcheck.mjs
//
// Run: node tools/roundhouse/reconQualityBind-selfcheck.mjs   (~1s MEASURED -- two builds on a 96x96 phantom)
//
// THIS GRADES THE BIND. physics/tomography/reconQuality-selfcheck.mjs owns the physics.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT NEITHER HALF OF THE MEASUREMENT IS SUFFICIENT, AND EACH IS
// BLIND IN A DIFFERENT DIRECTION. *** scoreRecon reports a PERFECT reconstruction -- corr 1.0000000000000522,
// rms 9.88e-14 -- for an image 30% too bright, because it subtracts both means and fits a gain before computing
// its residual. The structural metrics can see that, and a single line of per-image normalisation makes them
// read EXACTLY 1.0 as well. So a device carrying only the score would certify the wrong densities, and a device
// carrying only the structure would be one normalisation away from doing the same.
//
// The plant is the module's OWN NAMED HAZARD rather than a fault invented here: reconQuality.mjs' header says
// "THE WINDOW IS SHARED ON PURPOSE ... rendering each field to pixels with its own min/max would normalise the
// gain error away and hand the structural metrics the same blindness that motivated the file."
"use strict";
import { reconQualityDevice, RECONQ_OBSERVABLES } from "./reconQualityBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { FBP_GAIN_IS_GEOMETRIC, gainRatio } from "../../physics/tomography/reconQuality.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("reconQualityBind-selfcheck -- what the CT score cannot see\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("reconQuality appears in DEVICE_NAMES", DEVICE_NAMES.includes("reconQuality"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("reconQuality");
    ok("!! the registry hands back THIS device", !!d && d.name === "what-the-ct-score-cannot-see",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method",
        "the comparison's arithmetic is wrong -- no config value records the window, which is why the census "
        + "cannot see this one and the gate must");
    const def = d.defaults({});
    ok("!! defaults() returns the whole config, so the knobs are DERIVED",
        ["N", "gain", "offset", "thresh"].every((k) => k in def.config), Object.keys(def.config).join(", "));
    ok("...and the shipped gain and offset are NOT the identity", def.config.gain !== 1 && def.config.offset !== 0,
        "gain " + def.config.gain + ", offset " + def.config.offset + ". A device defaulting to gain 1 and "
        + "offset 0 would compare the truth with itself and every observable below would be vacuous.");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = reconQualityDevice.build(reconQualityDevice.defaults());
    ok("!! no advertised observable is missing", RECONQ_OBSERVABLES.every((k) => k in v),
        RECONQ_OBSERVABLES.filter((k) => !(k in v)).join(", ") || RECONQ_OBSERVABLES.length + " produced");
    ok("...and every one is finite", RECONQ_OBSERVABLES.every((k) => finite(v[k])),
        RECONQ_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => RECONQ_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !RECONQ_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. *** THE BLIND SPOT, MEASURED IN BOTH AFFINE DIRECTIONS ***");
{
    const v = reconQualityDevice.build({ config: {} });
    ok("!! a reconstruction 30% TOO BRIGHT scores a PERFECT result",
        Math.abs(v.scaledCorr - 1) < 1e-9 && v.scaledRms < 1e-9,
        "corr " + v.scaledCorr.toFixed(12) + ", rms " + v.scaledRms.toExponential(3)
        + ". *** FOR CT THIS IS NOT A TECHNICALITY: the absolute attenuation IS the diagnostic content, and a "
        + "reconstruction with the right shapes at the wrong densities is not 99% correct, it is answering a "
        + "different question. ***");
    ok("!! ...and so does one shifted by a constant",
        Math.abs(v.shiftedCorr - 1) < 1e-9 && v.shiftedRms < 1e-9,
        "corr " + v.shiftedCorr.toFixed(12) + ", rms " + v.shiftedRms.toExponential(3)
        + " -- scoreRecon subtracts both means AND fits a gain, so it is affine-invariant BY CONSTRUCTION. "
        + "Its own source already warned about this from the other side.");
    ok("!! *** AND THE RECOVERY IS EXACT, WHICH IS WHAT MAKES IT A KEY RATHER THAN A SECOND OPINION ***",
        v.gainRecoveryErr < 1e-9 && v.offsetRecoveryErr < 1e-9,
        "gain recovered as " + v.recoveredGain.toFixed(13) + " (err " + v.gainRecoveryErr.toExponential(3)
        + "), offset as " + v.recoveredOffset.toFixed(13) + " (err " + v.offsetRecoveryErr.toExponential(3)
        + "). absoluteFidelity does not ESTIMATE the blindness -- a least-squares fit of recon = g*truth + c "
        + "returns EXACTLY the two numbers scoreRecon divides out.");
    ok("...and the unfitted residual is the error a clinician would see",
        v.absRmsScaled > 0.1 && v.absRmsShifted > 0.1,
        "absRms " + v.absRmsScaled.toFixed(6) + " scaled and " + v.absRmsShifted.toFixed(6) + " shifted, where "
        + "scoreRecon reports 1e-13 for the same two images");
}

console.log("\n4. WHAT SEES THROUGH IT, AND WHAT STILL DOES NOT");
{
    const v = reconQualityDevice.build({ config: {} });
    ok("!! the structural metrics see the 30% error the score cannot",
        v.structureScaled < 0.95 && v.ssimScaled < 0.99 && v.edgesScaled < 0.99,
        "structure " + v.structureScaled.toFixed(6) + ", ssim " + v.ssimScaled.toFixed(6) + ", edges "
        + v.edgesScaled.toFixed(6) + " -- because BOTH images are windowed by the TRUTH's range, so a "
        + "reconstruction 30% too bright is 30% too bright in pixels too");
    ok("!! *** BUT THE SILHOUETTE IS BLIND TO GAIN AND NOT TO OFFSET, AND THAT IS TWO FACTS ***",
        v.iouScaled > 0.99 && v.iouShifted < 0.6,
        "iou " + v.iouScaled.toFixed(4) + " scaled against " + v.iouShifted.toFixed(4) + " shifted. Scaling "
        + "leaves the same pixels above the threshold, so the shape is identical; a constant offset floods the "
        + "background past it. REPORTED AS TWO NUMBERS -- one metric averaging them would hide which affine "
        + "direction it can see, which is the exact fault this whole file is about.");
}

console.log("\n5. THE OPEN QUESTION THE MODULE CLOSED: FBP'S GAIN IS NOT A FILTER CONSTANT");
{
    const v = reconQualityDevice.build({ config: {} });
    ok("!! the raw gain is NOT a constant -- it moves by a factor of two across the geometry",
        v.fbpGainSpread > 0.4,
        "raw gains span " + v.fbpGainSpread.toFixed(6) + " across " + FBP_GAIN_IS_GEOMETRIC.measured.length
        + " configurations. A ramp-filter normalisation WOULD be a constant, so this settles it: there is "
        + "nothing here to divide out once and for all.");
    ok("!! *** BUT gain * nDet / N COLLAPSES, while N and nDet each vary by a factor of two ***",
        v.fbpRatioSpread < 0.05 && Math.abs(v.fbpRatioMean - 0.9456) < 0.01,
        "mean " + v.fbpRatioMean.toFixed(6) + ", spread " + v.fbpRatioSpread.toFixed(6)
        + ". IT IS A SAMPLING RATIO -- the count of image pixels a detector bin is smeared over -- and it has "
        + "nothing to do with the ramp. Correcting 0.649 in the filter would be right at the gate's own fixture "
        + "and wrong everywhere else, which is a round's outcome frozen as a constant.");
    ok("...and the collapse is RE-DERIVED here rather than quoted from the sentence beside it",
        Math.abs(v.fbpRatioMean - gainRatio().mean) < 1e-12,
        "gainRatio() recomputes it from the recorded rows, so the claim in FBP_GAIN_IS_GEOMETRIC.answer cannot "
        + "drift away from the data it is about");
}

console.log("\n6. *** THE PLANT: WINDOW EACH IMAGE BY ITS OWN RANGE ***");
{
    const h = reconQualityDevice.build({ config: {} });
    const p = reconQualityDevice.build({ config: { planted: true } });

    ok("!! *** EVERY STRUCTURAL METRIC READS EXACTLY 1.0 -- A FLAWLESS RECONSTRUCTION, 30% TOO BRIGHT ***",
        p.structureScaled === 1 && p.ssimScaled === 1 && p.edgesScaled === 1,
        "structure " + h.structureScaled.toFixed(6) + " -> " + p.structureScaled
        + ", ssim " + h.ssimScaled.toFixed(6) + " -> " + p.ssimScaled
        + ", edges " + h.edgesScaled.toFixed(6) + " -> " + p.edgesScaled
        + ". NOT DEGRADED -- EXACTLY ONE. Per-image normalisation maps a field and 1.3x that field onto the "
        + "identical pixels, so the comparison is of an image with itself.");
    ok("!! ...and the offset case too, including the silhouette that could see it",
        p.iouShifted === 1 && h.iouShifted < 0.6,
        "iou shifted " + h.iouShifted.toFixed(4) + " -> " + p.iouShifted + ". The ONE metric that caught the "
        + "constant offset is caught by the plant as well.");
    report("A SINGLE LINE OF NORMALISATION TURNS THE ONLY METRICS THAT COULD SEE THE FAULT INTO A SECOND COPY "
        + "OF THE SCORE THAT COULD NOT. That is why the module's header calls the shared window deliberate.");

    report("WHICH HALF IS BLIND, ASSERTED SO IT CANNOT WIDEN SILENTLY.");
    ok("!! *** THE NUMERIC HALF IS BIT-IDENTICAL, because it never sees a pixel ***",
        h.scaledCorr === p.scaledCorr && h.scaledRms === p.scaledRms &&
        h.recoveredGain === p.recoveredGain && h.absRmsScaled === p.absRmsScaled &&
        h.recoveredOffset === p.recoveredOffset,
        "corr, rms, recovered gain and offset, and the unfitted residual all unchanged. scoreRecon and "
        + "absoluteFidelity work on the FIELDS. *** SO NEITHER HALF IS SUFFICIENT: the numeric half reports the "
        + "plant absent, and the structural half reports the reconstruction perfect. *** That is the file's "
        + "whole argument, and it is only visible when both are carried.");
    ok("...and the FBP geometry finding is untouched, being about a different subject entirely",
        h.fbpRatioMean === p.fbpRatioMean && h.fbpGainSpread === p.fbpGainSpread,
        "a windowing fault cannot reach a table of measured gains");
    ok("!! AND iouScaled IS BLIND UNDER BOTH, which is the one place the plant changes nothing",
        h.iouScaled === p.iouScaled && h.iouScaled === 1,
        "1.0000 honest and planted. It was ALREADY blind to gain before the plant existed, so it has no room "
        + "to fall -- a test whose honest answer is already the failing one cannot report the failure.");
}

console.log("\n" + (fails ? "reconQualityBind-selfcheck: " + fails + " FAILED" : "reconQualityBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
