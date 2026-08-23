// tools/roundhouse/heidler-selfcheck.mjs
//
// Run: node tools/roundhouse/heidler-selfcheck.mjs   (~0.2s)
//
// v3193 -- THE 5% BELONGS TO THE FORMULA, NOT TO ANY CODE, AND THE DEVICE PROVES IT.
//
// Keith uploaded diluuuu10/triggered-discharge, a WebGPU lightning simulation. *** NOTHING IS VENDORED: THE
// REPO HAS NO LICENSE FILE, so all rights are reserved and only the published physics travelled. ***
//
// Its src/physics/heidler.js carries a header worth the whole visit: "CPU copy of the return-stroke current.
// render/common.wgsl has its own copy - the two MUST stay in step, because the HUD readout and the flash
// brightness come from here while the pixels come from there."
//
// *** THAT IS THIS PROJECT'S MOST-REPEATED FAILURE, WRITTEN INTO SOMEBODY ELSE'S CODE AS A COMMENT: TWO
// DECLARATIONS ABOUT ONE THING. *** Both copies were read and they AGREE EXACTLY -- same algebra, same
// constants. So their code is correct today and THE GUARD THEY SAY THEY NEED DOES NOT EXIST, which is precisely
// what SweK's GLSL-twin gates do (v3151: written twice, constants asserted individually).
//
// THE PHYSICS: the Heidler correction factor eta exists SO THAT THE PEAK EQUALS i0. MEASURED, IT DOES NOT --
// 1.0667, 1.0397, 1.0505 across the three standard parameter sets.
//
// *** AND THAT IS NOBODY'S BUG. *** Dividing the shape's TRUE peak by the standard eta gives EXACTLY those same
// ratios, so the discrepancy is the published eta's own approximation. A device reporting "5% error" without
// that would be blaming an implementation for a reference -- v3164's kh-and-Michalke verdict arriving in a
// second, independent place.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);
const H = await import(pathToFileURL(path.join(ENG, "physics", "discharge", "heidler.mjs")).href);
const dev = await D.getDevice("heidler");

// ---- 1. THE DISCREPANCY IS THE FORMULA'S, AND IT IS PROVEN RATHER THAN ASSERTED ---------------------------------
{
    const peak = await dev.build({ mode: "peak" });
    ok("!! *** the peak is NOT i0, though eta exists to make it so ***",
        peak.peakOverI0 > 1.05 && peak.peakOverI0 < 1.08,
        "peak/i0 = " + peak.peakOverI0.toFixed(6) + " for the first-stroke set. The correction factor's ENTIRE " +
        "PURPOSE is to normalise the peak to i0");

    ok("!! *** and the shortfall is EXACTLY the eta ratio, which is what makes it the FORMULA'S ***",
        Math.abs(peak.peakOverI0 - peak.etaRatio) < 1e-9,
        "peak/i0 = " + peak.peakOverI0.toFixed(9) + " and trueEta/standardEta = " + peak.etaRatio.toFixed(9) +
        ". THE SAME NUMBER TO NINE PLACES. The published eta is an APPROXIMATION, and a device reporting '5% " +
        "error' without this would be BLAMING AN IMPLEMENTATION FOR A REFERENCE -- v3164's verdict on kh and " +
        "Michalke, arriving in a second and independent place");

    ok("!! it holds across all three standard parameter sets",
        await (async () => {
            for (const set of Object.keys(H.PARAMS)) {
                const r = await dev.build({ mode: "peak", config: { set } });
                if (Math.abs(r.peakOverI0 - r.etaRatio) > 1e-9) return false;
            }
            return true;
        })(),
        "first, subsequent and fast. A RELATION THAT HELD FOR ONE PARAMETER SET WOULD BE A COINCIDENCE");
}

// ---- 2. THE LOAD-BEARING NEGATIVE, WHICH IS WHAT TURNS THE 5% INTO EVIDENCE -------------------------------------
{
    const exact = await dev.build({ mode: "exact" });
    ok("!! *** normalised by the TRUE peak, peak/i0 is EXACTLY 1 ***",
        Math.abs(exact.peakOverI0 - 1) < 1e-9 && exact.peakErrFrac < 1e-9,
        "peak/i0 = " + exact.peakOverI0.toFixed(9) + ". IF THIS MODE EVER REPORTED ANYTHING ELSE, THE " +
        "MEASUREMENT WOULD BE BROKEN RATHER THAN THE FORMULA -- dividing a function by its own maximum cannot " +
        "give anything but one, so this checks the scan and the bisection rather than the physics");

    ok("...and it holds for every parameter set too",
        await (async () => {
            for (const set of Object.keys(H.PARAMS)) {
                const r = await dev.build({ mode: "exact", config: { set } });
                if (Math.abs(r.peakOverI0 - 1) > 1e-9) return false;
            }
            return true;
        })(),
        "the apparatus is sound at t1/t2 ratios spanning three orders of magnitude, which is why the peak " +
        "mode's numbers can be trusted as physics rather than as grid artefacts");
}

// ---- 3. THE SHAPE IS THE SHAPE ------------------------------------------------------------------------------------
{
    const lim = await dev.build({ mode: "limits" });
    ok("!! zero at t=0, vanishing far out, EXACTLY ONE maximum",
        lim.atZero === 0 && lim.atFar < 1e-9 && lim.maxima === 1 && lim.tPeakInRange === 1,
        "atZero " + lim.atZero + ", atFar " + lim.atFar.toExponential(2) + ", maxima " + lim.maxima + ", peak " +
        "between t1 and t2. MAXIMA ARE COUNTED BY SIGN CHANGES rather than assumed -- a formula with two would " +
        "not be the Heidler function, and asserting 'has a peak' would not have noticed");
}

// ---- 4. THE MODES, EXPORTED, AND NOTHING VENDORED --------------------------------------------------------------------
{
    // *** v3941 -- THIS PINNED dev.modes.length === 3 AND THE DEVICE GREW A FOURTH MODE ON PURPOSE. ***
    // `noroot` is this device's declared PLANT (plantMode: "noroot", plantFlips: "peakErrFrac"), added by the
    // round whose own comment beside it reads "THIS DEVICE NOW CARRIES BOTH HALVES ... until now this device had
    // only the half that proves the apparatus". So the gate went red ON THE ROUND THAT COMPLETED THE DEVICE.
    //
    // A COUNT IS NOT A PROPERTY -- which this line's own detail text quotes v3192 as measuring, about counts
    // being lower bounds, while asserting one. The count is REPORTED below and the structure is what is pinned:
    // every declared mode validates, a nonsense mode is refused, and THE CONTROL AND THE PLANT ARE BOTH IN THE
    // LIST -- which is the real requirement, because a plant mode that is not among the modes cannot be driven
    // and a census would count a half-device as a whole one.
    const declared = Array.isArray(dev.modes) ? dev.modes : [];
    ok("!! the modes are EXPORTED rather than probed, and every one of them validates",
        declared.length > 1 &&
        declared.every((m) => K.checkMode(dev, m).ok !== false) &&
        K.checkMode(dev, "zzz_no_mode").ok === false,
        declared.length + " declared (" + declared.join(", ") + ") -- and a nonsense mode is REFUSED. v3192 " +
        "measured that a PROBED count is a LOWER BOUND and that the lab's apparent one-moded-ness was an " +
        "artefact of the candidate list; a new device should never join that pile. THE COUNT IS REPORTED, NOT " +
        "ASSERTED: pinning it is how this line went red when the device gained its plant.");

    ok("!! ...and BOTH HALVES are in the list -- the control and the plant, named by the device itself",
        declared.includes(dev.controlMode) && declared.includes(dev.plantMode) && dev.controlMode !== dev.plantMode,
        `control "${dev.controlMode}" (perfects ${dev.controlPerfects}) and plant "${dev.plantMode}" (flips ` +
        `${dev.plantFlips}) are both declared and are different modes. A PLANT MODE THAT IS NOT AMONG THE MODES ` +
        "CANNOT BE DRIVEN, and the census would count a device that only proves its own apparatus as a whole " +
        "one -- which is the state this device was in before noroot was added, and the state pinning the count " +
        "at three would have locked it into.");

    ok("!! *** nothing is vendored, and the reason is stated ***",
        (() => {
            const src = fsMod.readFileSync(path.join(ENG, "physics", "discharge", "heidler.mjs"), "utf8");
            return /NO LICENSE FILE/.test(src) && !/triggered-discharge/.test(src.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " "));
        })(),
        "the repo carries NO LICENSE FILE, so all rights are reserved. THE PUBLISHED PHYSICS TRAVELLED AND THE " +
        "CODE DID NOT, and the repo is named only in comments explaining where the question came from");

    ok("...and the parameter sets carry their provenance",
        /CIGRE-style/.test(fsMod.readFileSync(path.join(ENG, "physics", "discharge", "heidler.mjs"), "utf8")),
        "i0, t1 and t2 for first, subsequent and fast strokes. A CONSTANT WITHOUT A SOURCE IS A MAGIC NUMBER, " +
        "and v3182 measured that 76% of this lab's claims could not be re-derived");
}

console.log();
console.log("  ----  WHAT THE UPSTREAM REPO COULD USE, AND IT IS NOT A DEFECT REPORT: its heidler.js and its");
console.log("  ----  render/common.wgsl AGREE EXACTLY TODAY, and its own header says they MUST STAY IN STEP.");
console.log("  ----  NOTHING CHECKS THAT. A twelve-line gate comparing the two would hold it -- which is what");
console.log("  ----  v3151 does here for the JS and GLSL phase-field twins.");
if (fails) { console.log("heidler-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("heidler-selfcheck: all checks pass");
