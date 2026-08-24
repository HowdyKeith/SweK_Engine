// tools/roundhouse/khConvergence-selfcheck.mjs
//
// Run: node tools/roundhouse/khConvergence-selfcheck.mjs   (~288s)
//
// v3164 -- THE LAB'S BIGGEST DISAGREEMENT WITH AN EXTERNAL REFERENCE IS NOT A PHYSICS RESULT.
//
// v3163's map put kh in LOOSE and said the work was "ask WHY the error is large". This is that, and the answer
// is that *** peakSigmaNorm IS NOT CONVERGED, so the number being compared against Michalke is not a
// measurement of anything yet. ***
//
// MEASURED at the shipped configuration, sweeping only run length:
//     steps    500 -> peakSigmaNorm 0.73791   (289.0% from Michalke's 0.1897)
//             1000 -> 0.03340   ( 82.4%)      ratio to previous 0.045
//             2000 -> 0.13131   ( 30.8%)      ratio 3.931
//             4000 -> 0.13985   ( 26.3%)      ratio 1.065
//             8000 -> 0.10788   ( 43.1%)      ratio 0.771
// A CONVERGED QUANTITY SETTLES AND THESE RATIOS DO NOT. The error against an external reference ranges from
// 26% to 289% PURELY AS A FUNCTION OF HOW LONG YOU RUN, and the shipped default sits at 44% -- one arbitrary
// point on a curve that has not stopped moving.
//
// AND MY OWN NOTE SAID THE DISAGREEMENT WAS 76%. It is 11.7% on peakKD and 44.2% on sigma at the default; the
// 76% was ONE MODE'S peakKD error recorded as the device's verdict. Three numbers, one label, again.
//
// *** WHAT THIS GATE IS FOR: STOPPING THE NUMBER BEING QUOTED. *** kh is the lab's only device that disagrees
// with an external key, which makes its error the most citable number here -- and citing an unconverged
// measurement as evidence about the physics is worse than having no external key at all, because it looks like
// rigour.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// v3970 -- READ FIRST. Seven separate gate files build the "kh" device with their own independent sweeps
// (this file: run length; khGrowthKey: viscosity; khMichalke: box resolution), each costing minutes, with no
// way for one sweep to know what an earlier one already found did not settle. Lazily imported and its failure
// swallowed: a physics gate must never go red because a lesson file could not be read.
let _lessons = null;
try { _lessons = await import(pathToFileURL(path.join(ENG, "brain", "rl", "lessons.mjs")).href);
      console.log(_lessons.lessonsBrief("kh")); } catch {}

const D = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);
const kh = await D.getDevice("kh");

const sweep = [];
for (const steps of [1000, 2000, 4000, 8000]) {
    const o = await kh.build({ mode: "sweep", config: { steps } });
    sweep.push({ steps, sigma: o.peakSigmaNorm, err: o.peakSigmaErrFrac });
}

// v3970 -- THE SAME RATIO TEST THE FIRST CHECK BELOW MAKES, OBSERVED RATHER THAN RECOMPUTED. This gate already
// decided what "settled" means for peakSigmaNorm (a converged quantity has every ratio near 1; the check below
// calls anything past 2x or under 0.5x a jump) -- recordSweepFinding is handed exactly that verdict, per point,
// so the lesson corpus and the gate's own PASS/FAIL can never disagree about what counts as unsettled.
if (_lessons) {
    try {
        const series = sweep.map((s, i) => {
            if (i === 0) return { x: s.steps, y: s.sigma, settled: true };
            const r = s.sigma / sweep[i - 1].sigma;
            return { x: s.steps, y: s.sigma, settled: !(r > 2 || r < 0.5) };
        });
        _lessons.recordSweepFinding({ env: "kh", axis: "steps", series,
            params: { steps: sweep.map((s) => s.steps) },
            note: "peakSigmaNorm vs run length (khConvergence)" });
    } catch {}
}

ok("!! peakSigmaNorm is NOT CONVERGED in run length",
    (() => {
        const r = sweep.slice(1).map((s, i) => s.sigma / sweep[i].sigma);
        // A converged quantity has every ratio near 1. These do not: one of them is off by more than 2x.
        return r.some((x) => x > 2 || x < 0.5);
    })(),
    sweep.map((s) => s.steps + ":" + s.sigma.toFixed(4)).join("  ") + ". A CONVERGED QUANTITY SETTLES -- " +
    "these ratios include a 3.9x jump. The comparison against Michalke is being made on a number that has not " +
    "stopped moving");

ok("!! and the ERROR against Michalke swings with run length alone",
    (() => { const e = sweep.map((s) => s.err); return Math.max(...e) / Math.min(...e) > 2; })(),
    sweep.map((s) => (s.err * 100).toFixed(1) + "%").join(", ") + " at " + sweep.map((s) => s.steps).join("/") +
    " steps. NOTHING ELSE CHANGED. An error that triples on run length is a property of the run, not of the " +
    "physics, and the shipped default's 44% is one point on it");

ok("!! peakKD, by contrast, is INSENSITIVE to run length",
    (() => sweep.length > 0)() && (await (async () => {
        const a = await kh.build({ mode: "sweep", config: { steps: 600 } });
        const b = await kh.build({ mode: "sweep", config: { steps: 3000 } });
        return a.peakKD === b.peakKD;
    })()),
    "identical at 600 and 3000 steps. ONE KNOB AT A TIME showed peakKD moves ONLY with nx and tau -- it is set " +
    "by the geometry and the viscosity, not by the measurement. So the two headline errors have DIFFERENT " +
    "causes and were being read as one verdict");

ok("!! peakKD lands on a LADDER the box sets, and Michalke's peak falls between rungs",
    (await (async () => {
        const vals = [];
        for (const m of [1, 2, 3, 4]) vals.push((await kh.build({ mode: "sweep", config: { mode: m, nx: 64, ny: 64, steps: 400 } })).peakKD);
        const step = Math.PI / 8;
        return vals.every((v, i) => Math.abs(v - (i + 1) * step) < 1e-9) && 0.4446 > vals[0] && 0.4446 < vals[1];
    })()),
    "modes 1-4 give EXACTLY pi/8, pi/4, 3pi/8, pi/2 on that grid, and Michalke's 0.4446 sits BETWEEN the first " +
    "two. NO INTEGER MODE CAN HIT IT there, so 11.7% is a quantisation floor rather than a physics error -- and " +
    "a different box moves the ladder (nx 192 mode 2 reaches 6.0%)");

console.log();
console.log("  ----  WHAT THIS DOES NOT DO: fix kh. The device may well be right; the point is that NEITHER");
console.log("  ----  headline error currently supports a claim about the physics. peakKD's is a ladder");
console.log("  ----  artefact and peakSigma's is measured before the thing settles. The lab's only external");
console.log("  ----  disagreement is not yet evidence, and it was being carried in the notes as though it were.");
if (fails) { console.log("khConvergence-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("khConvergence-selfcheck: all checks pass");
