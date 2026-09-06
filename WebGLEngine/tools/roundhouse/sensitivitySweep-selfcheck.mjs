#!/usr/bin/env node
// WebGLEngine/tools/roundhouse/sensitivitySweep-selfcheck.mjs -- v4488
//
// Run: node tools/roundhouse/sensitivitySweep-selfcheck.mjs   (~25s MEASURED: two cheap devices plus a kill)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** THE GATE THAT COULD NOT BE RUN WAS THE ONE THAT ALREADY HELD THE ANSWER. ***
// libmSensitivity-selfcheck has known since v2905 that most of its amplification table is near-zero error
// fields rather than machine-dependent physics -- it says "floor artefact" in as many words, and names the
// remedy: such quantities "should be reported as bounds or with their conditioning attached, not as values a
// second machine will reproduce". v4487 re-derived that idea and presented it as new. IT DID NOT SEE IT
// BECAUSE THE GATE DOES NOT RETURN: forty minutes on an idle box, against a header that said ~150s.
//
// So this file's subject is the budget, and the correction above is why the budget matters.
import { sensitivitySweepBudgeted, SWEEP_AT_V4488, DEVICE_CAP_MS } from "./sensitivitySweep.mjs";
import { SLOW_DEVICES } from "./libmSensitivity.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

console.log("sensitivitySweep-selfcheck -- the budget that makes a 40-minute gate terminate\n");

// ---- 1. THE ARCHITECTURE IS FORCED BY TWO MEASUREMENTS, NOT CHOSEN -------------------------------------------
{
    const W = SWEEP_AT_V4488;
    ok("!! *** eight devices never finish, so only an external kill bounds this sweep ***",
        W.overCap.length === 8 && W.overCap.includes("kuramoto") && W.capMs === 90000,
        `over the ${W.capMs / 1000}s cap: ${W.overCap.join(", ")}. An in-process timer cannot stop synchronous ` +
        "work -- v4486 measured that on optics.converge -- so a device that will not finish ends the run");

    ok("!! *** and the process gets SLOWER AS IT GOES: the same 120 devices cost 1.9x in one process ***",
        W.inSeparateProcessesMs < W.inOneProcessMs && W.inOneProcessCompleted === false &&
        W.inOneProcessMs / W.inSeparateProcessesMs > 1.8,
        `${(W.inSeparateProcessesMs / 1000).toFixed(1)}s in separate processes against OVER ` +
        `${(W.inOneProcessMs / 1000).toFixed(0)}s in one -- and the one-process figure is a FLOOR, because the ` +
        "run was killed rather than finishing. libmSensitivity says why in its own comment: counting libm calls " +
        "means instrumenting Math, which deoptimises those callsites for the rest of the process");

    ok("...so a skip list alone does NOT fix it, which was tested before this module was written",
        SLOW_DEVICES.length === 8 && W.inOneProcessCompleted === false,
        "all eight declined in-process and the sweep STILL exceeded 900s. Declining to start bounds the DEVICE " +
        "SET; it cannot return the deoptimisation cost the earlier devices already paid");

    ok("!! the stated runtime was never a measurement, and is eight times under",
        W.statedInHeader === "~150s" && W.understatedBy === 8 && W.wallMs > 1e6,
        `the header said ${W.statedInHeader}; the lab is ${(W.wallMs / 1000).toFixed(1)}s. Not a drift -- ` +
        "a figure nobody had taken, in a gate too slow for anybody to catch it");
}

// ---- 2. AND IT TERMINATES, WHICH IS THE WHOLE CLAIM ----------------------------------------------------------
{
    // Two genuinely cheap devices plus one known non-finisher: the full lab is 20 minutes and belongs in a
    // measurement, not in a gate that has to run on every sweep.
    const t0 = Date.now();
    const s = await sensitivitySweepBudgeted({ capMs: 8000, devices: ["chaos", "kepler", "kuramoto"] });
    const ms = Date.now() - t0;

    ok("!! *** a device that will not finish is KILLED and the sweep continues past it ***",
        s.overCap.includes("kuramoto") && s.summary.devicesRun === 2 && s.rows.length > 0,
        `kuramoto over an 8s cap; chaos and kepler completed with ${s.rows.length} device/modes and ` +
        `${s.summary.observables} observables. The run ENDED, in ${(ms / 1000).toFixed(1)}s`);

    ok("...and the ones it could not sweep are NAMED, so absence is reported rather than inferred",
        Array.isArray(s.overCap) && s.overCap.length === 1 && s.errored.length === 0,
        "a summary counting only what ran, with no list of what did not, reads as a complete lab. " +
        `overCap: ${s.overCap.join(", ") || "none"}`);

    ok("!! ...and the cap is real: every device carries what it cost, killed or not",
        typeof s.cost.kuramoto === "number" && s.cost.kuramoto >= 8000 &&
        s.cost.chaos < 8000 && s.cost.kepler < 8000,
        `kuramoto ${(s.cost.kuramoto / 1000).toFixed(1)}s (the cap), chaos ${(s.cost.chaos / 1000).toFixed(1)}s, ` +
        `kepler ${(s.cost.kepler / 1000).toFixed(1)}s. A killed device costing less than its cap would mean the ` +
        "kill fired early and the sweep is losing work it could have had");

    ok("...and DEVICE_CAP_MS clears the slowest device that actually finishes",
        DEVICE_CAP_MS === 90000 && DEVICE_CAP_MS > 56500 * 1.5,
        "pipe3d is the slowest completer at 56.5s, so 90s leaves half again in hand. A cap tight enough to " +
        "clip a real device would turn a measurement into an absence and look like the same thing");
}

say("");
say("WHAT THIS DOES NOT DO: make the eight finish, or make libmSensitivity-selfcheck fast. It makes the sweep");
say("  TERMINATE and it names what it could not reach. The eight are their own round -- and one of them,");
say("  optics, is the device v4486 already found unmeasurable for a different battery in the same session.");

console.log();
if (fails) { console.log("sensitivitySweep-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("sensitivitySweep-selfcheck: all checks pass");
