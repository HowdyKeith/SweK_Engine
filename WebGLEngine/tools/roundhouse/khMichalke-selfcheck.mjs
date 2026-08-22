// tools/roundhouse/khMichalke-selfcheck.mjs
//
// Run: node tools/roundhouse/khMichalke-selfcheck.mjs   (~328s)
//
// v3164 -- kh's DISAGREEMENT WITH MICHALKE IS NOT A CONVERGENCE MEASURE, AND REFINING THE BOX DOES NOT FIX IT.
//
// v3163's map put kh in LOOSE and said the work is ASK WHY THE ERROR IS LARGE. This is that, and the answer
// changes what the number means rather than shrinking it.
//
// *** THE PEAK IS AN ARGMAX OVER FIVE DISCRETE MODES. *** khBind picks the largest sigmaNorm of the sampled
// rows -- so peakKD can only ever BE one of the wavenumbers the box supports, and peakKDErrFrac measures the
// distance from a SAMPLE to Michalke's CONTINUOUS peak of 0.4446. That distance is bounded below by the mode
// spacing however good the physics is. The default box reports peakKD = 0.39269908169872414, which is EXACTLY
// pi/8 -- an analytic grid value, not a measured maximum.
//
// AND THE WAVENUMBER IS SET BY THE BOX, NOT BY A SWEEP KNOB. delta does not move it at all (96/9, 96/7 and
// 96/6.8 all report the same pi/8); nx does. There is no continuum to interpolate over: a periodic box supports
// integer Fourier modes and nothing between them.
//
// *** SO REFINEMENT MOVES THE MODES RATHER THAN DENSIFYING THEM, AND THE ERROR SCATTERS. *** MEASURED across
// boxes: 11.7%, 33.8%, 64.7%, 64.7% for kD and 44.2%, 63.1%, 109.1%, 106.9% for sigma. NOT MONOTONE, NOT
// CONVERGING -- the error is a LOTTERY over whether a supported mode happens to sit near 0.4446.
//
// I NEARLY REPORTED A COINCIDENCE AS A TREND. One box -- nx 160, ny 96, delta 11 -- gave a sigma error of 3.5%,
// and I had written "the disagreement is a resolution artifact" before running a confirming sweep. Changing ny
// from 96 to 128 in that same box took it to 109%. ONE SAMPLE THAT AGREES IS NOT A TREND, and the only reason
// this file does not say otherwise is that the second sweep was run before the claim was made.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const D = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);
const kh = await D.getDevice("kh");
const at = (cfg) => kh.build({ mode: "sweep", config: { ny: 96, tau: 0.52, U0: 0.04, mode: 1, steps: 1500, ...cfg } });

const base = await at({ nx: 96, delta: 9 });

ok("!! the reported peak is an ARGMAX over the box's modes, not a resolved maximum",
    Math.abs(base.peakKD - Math.PI / 8) < 1e-12,
    "peakKD is EXACTLY pi/8 (" + base.peakKD + ") -- an analytic grid value. khBind takes the largest sigmaNorm " +
    "of the sampled rows, so this can only ever BE a supported wavenumber, and the distance to Michalke's " +
    "CONTINUOUS 0.4446 is bounded below by the mode spacing however good the physics is");

const d7 = await at({ nx: 96, delta: 7 }), d68 = await at({ nx: 96, delta: 6.8 });
ok("!! delta does NOT move the wavenumber -- the box does",
    Math.abs(d7.peakKD - base.peakKD) < 1e-12 && Math.abs(d68.peakKD - base.peakKD) < 1e-12,
    "96/9, 96/7 and 96/6.8 all report the same pi/8. THERE IS NO CONTINUUM TO INTERPOLATE OVER: a periodic box " +
    "supports integer Fourier modes and nothing between them, so a finer SEARCH is not available -- only a " +
    "different set of modes");

{
    const boxes = [{ nx: 96, delta: 9 }, { nx: 128, delta: 11 }, { nx: 160, ny: 128, delta: 11 }, { nx: 192, ny: 160, delta: 13 }];
    const errs = [];
    for (const b of boxes) { const o = await at(b); errs.push({ kd: o.peakKDErrFrac, s: o.peakSigmaErrFrac }); }
    const monotone = errs.every((e, i) => i === 0 || e.kd <= errs[i - 1].kd);
    ok("!! and the error does NOT shrink with a bigger box -- it SCATTERS",
        !monotone,
        "kD " + errs.map((e) => (e.kd * 100).toFixed(1) + "%").join(", ") + " and sigma " +
        errs.map((e) => (e.s * 100).toFixed(1) + "%").join(", ") + ". REFINEMENT MOVES THE MODES RATHER THAN " +
        "DENSIFYING THEM, so the error is a LOTTERY over whether a supported mode lands near 0.4446. ASSERTED " +
        "AS NON-MONOTONE on purpose: a gate expecting convergence here would be encoding a hope");

    const good = await at({ nx: 160, ny: 96, delta: 11 });
    const near = await at({ nx: 160, ny: 128, delta: 11 });
    ok("!! ONE box agrees to 3.5% and that is a COINCIDENCE, not a trend",
        good.peakSigmaErrFrac < 0.1 && near.peakSigmaErrFrac > 0.5,
        "nx 160 / ny 96 / delta 11 gives a sigma error of 3.5%; changing ONLY ny to 128 gives 109%. I HAD " +
        "WRITTEN 'the disagreement is a resolution artifact' BEFORE RUNNING THE CONFIRMING SWEEP. One sample " +
        "that agrees is not a trend, and this check exists so the next person meets the counter-example at the " +
        "same moment as the tempting number");
}

ok("!! so kh cannot take a validity assumption of the usual shape",
    !(await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "assumptions.mjs")).href))
        .LAB_ASSUMPTIONS["kh.sweep"],
    "an assumption declares WHERE AN INSTRUMENT IS SOUND. kh's error is not a function of an operating point " +
    "that can be stayed inside -- it is the distance from the nearest supported mode to a continuous reference, " +
    "and no bound on a config value makes that small. THE HONEST FIX IS A DIFFERENT COMPARISON, not a declared " +
    "region: compare the DISPERSION SHAPE across modes rather than a peak location against a continuum");

console.log();
console.log("  ----  WHAT THIS DOES NOT SAY: that kh is wrong. The growth rates it measures may be fine; what is");
console.log("  ----  broken is the COMPARISON -- an argmax over five quantised modes reported as an error");
console.log("  ----  fraction against a continuous peak. That number cannot go to zero and was never going to.");
if (fails) { console.log("khMichalke-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("khMichalke-selfcheck: all checks pass");
