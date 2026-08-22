// tools/roundhouse/blobKelvinBind-selfcheck.mjs
//
// Run: node tools/roundhouse/blobKelvinBind-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// Device #5's whole premise: blobKelvin.js's documentation makes numeric claims, and a doc claim the gate can
// refuse is documentation while one it cannot is decoration. So every documented number is crystallized here as a
// formal claim through the loop -- the exact 373.15 calibration, the 79%-of-travel room temperature, the ~1e5 K
// stylised reading, the round-trip identity -- plus the guardrail that matters for proposers: a scenario that was
// never STATED does not exist, because an unstated scale commitment is precisely the mistake the module was
// written to make impossible.

import { buildKelvin, kelvinDefaults, blobKelvinDevice } from "./blobKelvinBind.mjs";
import { roundhouseDevice } from "./deviceBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { runDevice, parseArgs } from "./run-device.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE DOCUMENTED CLAIMS, AS MEASUREMENTS ------------------------------------------------------------------
{
    const c = buildKelvin({ mode: "calibration" });
    ok("!! 'calibrated so D=0.02 -> 373.15 K exactly' is exactly true", Math.abs(c.boilingKelvin - 373.15) < 1e-6,
        "measured " + c.boilingKelvin.toFixed(7) + " K -- the calibration constant does what the comment promises");
    ok("!! 'room temperature sits at 79% of travel' measures 78.6%", Math.abs(c.roomTravelFrac - 0.79) < 0.01,
        "measured " + (c.roomTravelFrac * 100).toFixed(2) + "% -- the doc rounded; the gate holds the real number");
    ok("!! the stylised identification really runs ~1e5 K hot", c.stylisedKelvinAtMax > 1.0e5 && c.stylisedKelvinAtMax < 1.2e5,
        "cell_realtime at full travel: " + c.stylisedKelvinAtMax.toExponential(3) + " K -- the honest reason the bacterium scenario is the default");
}

// ---- 2. ROUND-TRIP IDENTITY + scenario guardrail ----------------------------------------------------------------
{
    const r = buildKelvin({ mode: "convert", config: { D: 0.011, scenario: "bacterium" } });
    ok("!! kelvinOfWarmth and warmthOfKelvin round-trip exactly", r.roundTripErrFrac === 0,
        "D -> T -> D returns the same float -- inverse functions, not approximate ones");
    const h = kelvinDefaults({ mode: "convert", config: { scenario: "my-imaginary-scale", D: 999 } });
    ok("!! an UNSTATED scale commitment does not exist", h.config.scenario === "bacterium" && h.config.D <= 0.02,
        "clamped to a stated scenario -- inventing L and tau on the fly is the exact mistake this module forbids");
}

// ---- 3. THE LOOP: documented truth crystallizes; a doc-contradicting claim refuses ------------------------------
{
    const caller = (hyps) => { let i = 0; return async (role) => role === "proposer" ? hyps[Math.min(i++, hyps.length - 1)] : { reading: "(mock)" }; };
    const dev = await getDevice("blobkelvin");
    ok("the registry knows the thermometer", DEVICE_NAMES.includes("blobkelvin"), DEVICE_NAMES.join(", "));

    const good = await roundhouseDevice({
        callModel: caller([{ mode: "calibration", claim: { observable: "boilingKelvin", target: 373.15, tol: 1e-6 } }]),
        device: dev, question: "is the calibration exact?", maxRounds: 2,
    });
    ok("!! the documented calibration crystallizes as a formal claim", good.crystallized === true && good.rounds === 1,
        "measured " + good.verdict.measured.toFixed(4) + " K");

    const bad = await roundhouseDevice({
        callModel: caller([{ mode: "calibration", claim: { observable: "roomTravelFrac", target: 0.0027, tol: 0.01 } }]),
        device: dev, question: "is room temperature pinned to the bottom?", maxRounds: 2,
    });
    const badV = bad.history[0].verdict;   // non-crystallized results carry verdicts per round, not at top level
    ok("!! the OLD reading ('room at 0.27% of travel' -- the cell_realtime pathology) refuses under the calibrated scenario",
        bad.crystallized === false,
        "measured " + badV.measured.toFixed(4) + " vs claimed 0.0027 -- the recalibration is what moved it, and the gate can tell");

    const cli = [];
    const out = await runDevice(parseArgs(["blobkelvin", "mock"]), (s) => cli.push(s));
    ok("the CLI front door drives it", out.crystallized === true && cli.some((l) => l.includes("blob-kelvin-thermometer")));
}

// ---- *** THE PLANT (v3714): SLIP DRAG INSTEAD OF STICK, AND WHAT DOES **NOT** SEE IT *** ------------------------
// 4*pi*eta*r instead of 6*pi -- real physics, wrong for a particle in water, and the form you reach for if you
// half-remember the derivation. Applied to both directions, so forward and inverse still agree.
// WHEN THESE GO RED the fix is to restore stick drag, NEVER to loosen the calibration checks: every number in
// blobKelvin.js was calibrated against 6*pi and moves by exactly 3/2 without it.
{
    // The registry hands out devices -- v3707 measured that reaching for a module-level export finds nothing.
    const { getDevice } = await import("./devices.mjs");
    const dev = await getDevice("blobkelvin");
    const nom = dev.build({ mode: "calibration", config: {} });
    const pl = dev.build({ mode: "calibration", config: { planted: true } });
    const nomC = dev.build({ mode: "convert", config: {} });
    const plC = dev.build({ mode: "convert", config: { planted: true } });

    // *** THE FINDING, AND IT IS THE SECOND INSTANCE IN TWO ROUNDS: the device's own favourite observable is
    // BLIND to the plant. A forward and its own inverse agree whichever coefficient they share, so a COHERENT
    // GLOBAL ERROR is invisible to a self-consistency check. v3713's loss columns were the first. ***
    ok("!! roundTripErrFrac CANNOT see the plant -- a forward and its own inverse agree either way",
        nomC.roundTripErrFrac === 0 && plC.roundTripErrFrac < 1e-15,
        `nominal ${nomC.roundTripErrFrac}, planted ${plC.roundTripErrFrac.toExponential(2)}` +
        " -- self-consistency is not correctness, and this device's default claim is the round trip");

    ok("!! the calibration DOES see it, and everything moves by exactly 3/2",
        Math.abs(nom.boilingKelvin / pl.boilingKelvin - 1.5) < 1e-12 &&
        Math.abs(pl.roomTravelFrac / nom.roomTravelFrac - 1.5) < 1e-12 &&
        Math.abs(nom.stylisedKelvinAtMax / pl.stylisedKelvinAtMax - 1.5) < 1e-12,
        `boiling ${nom.boilingKelvin.toFixed(4)} -> ${pl.boilingKelvin.toFixed(4)}, stylised ` +
        `${nom.stylisedKelvinAtMax.toExponential(3)} -> ${pl.stylisedKelvinAtMax.toExponential(3)}` +
        " -- 6/4 exactly, so the planted run is COHERENTLY wrong rather than noisy");

    // *** THE KEY THAT NEEDS NO CALIBRATED REFERENCE. The checks above compare against 373.15, which was TUNED
    // to be true -- they catch any change to the formula, including a legitimate recalibration. This one is an
    // ORDERING: the bacterium scenario says its slider spans 0 K to boiling, so room temperature must sit
    // BELOW boiling and roomTravelFrac must be under 1. The plant puts it at 1.1784 -- room temperature 18%
    // BEYOND the end of the slider, i.e. hotter than boiling. AN IMPOSSIBLE READING, NOT MERELY A CHANGED ONE,
    // and nothing in this tree asserted it before v3714. ***
    ok("!! room temperature sits below boiling -- an ordering, not a calibrated constant",
        nom.roomTravelFrac < 1 && pl.roomTravelFrac > 1,
        `nominal ${nom.roomTravelFrac.toFixed(4)} of travel, planted ${pl.roomTravelFrac.toFixed(4)}` +
        " -- the planted slider would boil water below room temperature");

    ok("the device names what its plant overturns, as data rather than prose",
        dev.planted && dev.planted.knob === "dragK" && dev.planted.observable === "boilingKelvin");
}

console.log();
if (fails) { console.log("blobKelvinBind-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("blobKelvinBind-selfcheck: all checks pass");
