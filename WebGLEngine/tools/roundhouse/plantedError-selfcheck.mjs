// tools/roundhouse/plantedError-selfcheck.mjs
//
// Run: node tools/roundhouse/plantedError-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2893 -- PROVING THE GATES WOULD HAVE CAUGHT IT.
//
// Every gate in this tree has only ever passed, and every tolerance in the physics baseline was chosen by
// looking at where the measurement landed. Both facts are comfortable and neither is evidence: a check that has
// never failed has never shown it can, and a bound justified by "this is what we measured" cannot say what it
// would have caught. This gate plants errors of known size and records which gates notice at which magnitude --
// so a green stops meaning "nothing looked wrong" and starts meaning "nothing above X is here".
//
// It found three things, in ascending order of importance:
//
//   1. A CONTROL that proves the harness itself is calibrated: the exact ISCO is 6M, so a planted error in the
//      mass must appear in the observable at gain exactly 1.00 and monotonically. It does.
//   2. A gate DULLER than its tolerance suggests: the blobarium scheme diffusivity attenuates -- a planted error
//      in the advection speed reaches the observable at gain ~0.85, so the tolerance on the OBSERVABLE is a
//      looser bound on the PHYSICS than it appears.
//   3. A BASELINE ENTRY THAT SHOULD NOT HAVE BEEN TRUSTED: the Paczynski-Wiita capture onset is deterministic
//      but discontinuous in the central mass -- a 1e-5 perturbation moves it from 6.036 to 5.411 -- so its
//      apparent hypersensitivity is a broken search, not a keen instrument.
//
// And before any of that, the harness's first run caught a bug in the PREVIOUS round's code: v2892's peer report
// measured portability by calling an async device build without awaiting it, so two observables' flags were
// computed on a promise rather than on physics. The sweep reported those gates BLIND, which was the true answer
// about a mis-wired probe and the reason mis-wiring is now distinguished from blindness in the report.

import { detectionFloor, sensitivitySuite, sensitivityLine, toleranceWindow } from "./plantedError.mjs";
import { lyapunov } from "./physicsBaseline.mjs";
import { strictLog2 } from "../strictMath.mjs";
import { measureAquariumD } from "../../physics/blobThermal.js";
import { buildProbe } from "./probeBind.mjs";
import { buildBH } from "./blackHoleBind.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE CONTROL: a quantity whose response to a planted error is known exactly -------------------------------
{
    const r = await detectionFloor({
        id: "isco-schwarzschild", knob: "central mass M", tol: 1e-12, epsMin: 1e-15, epsMax: 1e-3,
        measure: async (eps) => (await buildProbe({ mode: "isco", config: { M: 1 * (1 + eps) } })).iscoR,
    });
    ok("!! the CONTROL behaves exactly as theory demands: ISCO = 6M, so gain is 1.00 and the response is monotone",
        Math.abs(r.gain - 1) < 0.01 && r.monotone === true && !r.blind,
        sensitivityLine(r) + " -- a harness that got this wrong would make every other number here worthless");
    ok("...and its detection floor sits at its tolerance, as a gain-1 instrument must",
        r.floor > 1e-13 && r.floor < 1e-10, "floor " + r.floor.toExponential(2) + " against tol 1e-12");
    ok("the null test passes: an unperturbed run does not trip the gate", r.nullTrips === false);
}

// ---- 2. A GATE DULLER THAN ITS TOLERANCE LOOKS -------------------------------------------------------------------
{
    const r = await detectionFloor({
        id: "blobarium-scheme-D", knob: "advection speed v", tol: 1e-3, epsMin: 1e-6, epsMax: 0.05,
        measure: (eps) => measureAquariumD({ x: 0, y: 0, z: 0, r: 1, a: 1 }, { n: 32, ext: 2, steps: 15, v: 1 * (1 + eps), dt: 1 / 60, rounds: 2 }).D,
    });
    ok("!! the scheme diffusivity ATTENUATES the error it is asked to find (gain < 1)",
        r.gain < 1 && r.gain > 0.5 && r.monotone === true,
        sensitivityLine(r) + " -- the tolerance is on the OBSERVABLE; the error lives in the PHYSICS, and at gain " +
        r.gain.toPrecision(3) + " a 0.1% bound on D permits a larger error upstream");
    const w = toleranceWindow({ noise: 1e-9, targetError: 0.005, gain: r.gain });
    ok("...and a defensible tolerance can now be COMPUTED rather than eyeballed",
        w.viable === true && w.recommendation > 1e-9 && w.recommendation < 0.005 * r.gain,
        "window [" + w.lower.toExponential(1) + ", " + w.upper.toExponential(2) + "], suggested " + w.recommendation.toExponential(2) +
        " -- above the instrument's scatter, below the error we want caught");
    const empty = toleranceWindow({ noise: 0.02, targetError: 0.005, gain: r.gain });
    ok("...and an impossible ask is reported as an EMPTY WINDOW, not tuned into a pass",
        empty.viable === false && /EMPTY WINDOW/.test(empty.note),
        "when the instrument's own scatter exceeds the signal, the instrument needs fixing, not the number");
}

// ---- 3. THE FINDING: a pinned baseline entry that is not continuous in its own parameter -------------------------
{
    const nominal = (await buildBH({ mode: "onset" })).captureOnsetR;
    const ratios = [];
    for (const eps of [1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2]) {
        const v = (await buildBH({ mode: "onset", config: { M: 1 * (1 + eps) } })).captureOnsetR;
        ratios.push(v / (1 + eps));           // onsetR / M MUST be constant: the ISCO scales with the mass
    }
    const spread = (Math.max(...ratios) - Math.min(...ratios)) / nominal;
    ok("!! the PW capture onset is DISCONTINUOUS in the central mass -- onsetR/M is not constant",
        spread > 0.05,
        "onsetR/M ranges " + Math.min(...ratios).toFixed(3) + ".." + Math.max(...ratios).toFixed(3) +
        " (spread " + (spread * 100).toFixed(1) + "% of the nominal) across mass perturbations of 1e-7..1e-2 -- a ratio that must be constant");

    // ...yet at NOMINAL M it is stable under refinement, which is exactly why nothing caught this before
    const tolSweep = [];
    for (const t of [0.05, 0.02, 0.01, 0.005]) tolSweep.push((await buildBH({ mode: "onset", config: { onsetTol: t } })).captureOnsetR);
    const tolSpread = (Math.max(...tolSweep) - Math.min(...tolSweep)) / nominal;
    ok("...while at NOMINAL M it looks perfectly healthy under refinement -- which is how it passed every gate until now",
        tolSpread < 0.01,
        "search-tolerance sweep spans only " + (tolSpread * 100).toFixed(2) + "%; the instability is invisible unless you perturb the PHYSICS, which is the whole point of planting errors");
    ok("...and the baseline entry now carries the caveat rather than the bare number",
        (await import("./physicsBaseline.mjs")).BASELINE.find((b) => b.id === "isco-pw-onset").note.includes("NOT CONTINUOUS"),
        "pinned with its condition, like the blobarium artefact -- a number whose limits travel with it");
}

// ---- 4. A MIS-WIRED PROBE IS NOT A BLIND GATE, AND THE REPORT SAYS WHICH -----------------------------------------
{
    const broken = await detectionFloor({
        id: "misread-observable", knob: "M", tol: 1e-6, epsMin: 1e-9, epsMax: 1e-3,
        measure: (eps) => buildProbe({ mode: "isco", config: { M: 1 + eps } }).iscoR,   // NO await: reads a promise
    });
    ok("!! reading an observable off an un-awaited async build is reported as BROKEN, not as a blind gate",
        broken.wired === false && /BROKEN/.test(sensitivityLine(broken)),
        "this exact mistake shipped in v2892's peer report and the first run of this harness surfaced it -- " +
        "the two failure modes look identical from outside and mean opposite things");
    const good = await detectionFloor({
        id: "well-wired", knob: "M", tol: 1e-6, epsMin: 1e-9, epsMax: 1e-3,
        measure: async (eps) => (await buildProbe({ mode: "isco", config: { M: 1 + eps } })).iscoR,
    });
    ok("...and the awaited version is properly wired", good.wired === true && !good.blind);
}

// ---- 5. A GENUINELY BLIND GATE IS REPORTED AS BLIND ---------------------------------------------------------------
{
    const blind = await detectionFloor({
        id: "constant-observable", knob: "anything", tol: 1e-6, epsMin: 1e-9, epsMax: 0.1,
        measure: () => 42,                                  // an observable that ignores the physics entirely
    });
    ok("!! an observable that does not depend on the planted knob is BLIND at every size tested",
        blind.blind === true && blind.wired === true && /BLIND up to/.test(sensitivityLine(blind)),
        "the most valuable output this module produces: a gate that cannot see the error it is nominally guarding");
    ok("...and a gate that fires on an UNPERTURBED run is reported BROKEN, since its floors would be meaningless",
        /BROKEN/.test(sensitivityLine({ wired: true, nullTrips: true, nullDeviation: 1e-3, tol: 1e-6, id: "x" })));
}

// ---- 6. THE SUITE RUNS AS ONE SWEEP -------------------------------------------------------------------------------
{
    const rows = await sensitivitySuite([
        { id: "lyap-r4", knob: "map parameter r", tol: 1e-5, epsMin: 1e-12, epsMax: 1e-3, measure: (e) => lyapunov(4 * (1 + e), 40000, 0.1234, strictLog2) },
        { id: "lyap-r38", knob: "map parameter r", tol: 2e-3, epsMin: 1e-12, epsMax: 1e-3, measure: (e) => lyapunov(3.8 * (1 + e), 40000, 0.1234, strictLog2) },
    ]);
    ok("!! chaotic observables are hypersensitive detectors AND non-monotone -- both facts reported",
        rows.every((r) => !r.blind && r.gain > 1e3) && rows.some((r) => r.monotone === false),
        rows.map((r) => r.id + " floor " + r.floor.toExponential(1) + " gain " + r.gain.toExponential(2)).join("; ") +
        " -- they catch errors far below any tolerance, but 'bigger error, bigger signal' does NOT hold, so a floor is where detection STARTS, not a scale");
}

console.log();
if (fails) { console.log("plantedError-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("plantedError-selfcheck: all checks pass");
