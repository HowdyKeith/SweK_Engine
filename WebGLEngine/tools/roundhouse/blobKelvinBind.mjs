// tools/roundhouse/blobKelvinBind.mjs
//
// v2806 -- roundhouse device #5: the Kelvin thermometer (physics/blobKelvin.js). The easiest bind in the registry
// and a different KIND of lab: no integrator, no ensemble -- pure closed-form unit commitments (Stokes-Einstein
// plus an explicit length/time/viscosity scale). What makes it a legitimate roundhouse device anyway is that its
// own documentation makes falsifiable numeric claims, and now they are CLAIMS in the formal sense:
//
//   "calibrated so D=0.02 -> 373.15 K exactly"        -> boilingKelvin, target 373.15, tol 1e-6
//   "room temperature sits at 79% of travel"           -> roomTravelFrac (measured: 0.7856)
//   "the obvious identification runs ~1e5 K hot"       -> stylisedKelvinAtMax under cell_realtime (measured 1.094e5)
//   kelvinOfWarmth / warmthOfKelvin "must round-trip"  -> roundTripErrFrac (measured: 0)
//
// A doc claim that the gate can refuse is documentation; one it cannot is decoration. Scenario names are clamped
// to the module's own SCENARIOS table so a proposer cannot invent a scale commitment that was never stated --
// which is the entire moral of blobKelvin.js.

// *** v3714 -- THE PLANT: STOKES DRAG WITH A SLIP BOUNDARY (4*pi*eta*r) INSTEAD OF STICK (6*pi*eta*r). Both are
// real physics and the slip form is the one you reach for if you half-remember the derivation, so it is the
// PLAUSIBLE WRONG DERIVATION this census wants. It is applied to BOTH directions, so the pair still inverts.
//
// *** AND THAT IS THE POINT: roundTripErrFrac SEES NOTHING. 0 -> 1.5e-16, still exact to rounding. A forward
// and its own inverse agree no matter which coefficient they share, so THE SELF-CONSISTENCY CHECK IS BLIND TO A
// COHERENT GLOBAL ERROR. Second time in two rounds a device's own favourite observable called a broken run
// perfect (v3713's loss columns were the first). WHAT CATCHES IT IS THE CALIBRATION: every stated number moves
// by exactly 3/2, boilingKelvin 373.15 -> 248.7667 and stylisedKelvinAtMax 1.094e5 -> 7.293e4. ***
//
// THE STRONGEST TELL IS NOT A CHANGED NUMBER BUT AN IMPOSSIBLE ONE: roomTravelFrac 0.7856 -> 1.1784, so room
// temperature would sit 18% BEYOND the end of a slider the docs say spans 0 K to boiling. That reading needs no
// calibrated reference to refuse -- it says room temperature is hotter than boiling.
import { SCENARIOS, kelvinOfWarmth, warmthOfKelvin, SLIP_DRAG } from "../../physics/blobKelvin.js";

export const KELVIN_OBSERVABLES = [
    "kelvinAtD", "warmthAtT", "roundTripErrFrac", "boilingKelvin", "roomTravelFrac", "stylisedKelvinAtMax",
];

const D_MAX = 0.02;   // the slider's full travel, per the module docs
const DEF = { D: 0.01141, T: 293.15, scenario: "bacterium" };

export function kelvinDefaults(hyp) {
    const h = { mode: "convert", ...(hyp || {}) };
    const cfg = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    cfg.D = Math.min(D_MAX, Math.max(1e-6, num(cfg.D, DEF.D)));
    cfg.T = Math.min(1e7, Math.max(0.01, num(cfg.T, DEF.T)));
    if (!SCENARIOS[cfg.scenario]) cfg.scenario = DEF.scenario;   // only STATED commitments exist
    if (h.mode !== "convert" && h.mode !== "calibration") h.mode = "convert";
    h.config = cfg;
    if (!h.claim || !h.claim.observable) h.claim = { observable: "roundTripErrFrac", max: 1e-12 };
    return h;
}

/** The scenario as the run will use it -- with the planted boundary condition when asked for. */
function scenarioFor(name, cfg) {
    const scen = SCENARIOS[name];
    return cfg && cfg.planted ? { ...scen, dragK: SLIP_DRAG } : scen;
}

function convertRun(cfg) {
    const scen = scenarioFor(cfg.scenario, cfg);
    const kelvinAtD = kelvinOfWarmth(cfg.D, scen);
    const warmthAtT = warmthOfKelvin(cfg.T, scen);
    const roundTrip = warmthOfKelvin(kelvinAtD, scen);
    return {
        scenario: cfg.scenario,
        kelvinAtD,
        warmthAtT,
        roundTripErrFrac: Math.abs(roundTrip - cfg.D) / cfg.D,
    };
}

function calibrationRun(cfg) {
    const b = scenarioFor("bacterium", cfg);
    const c = scenarioFor("cell_realtime", cfg);
    return {
        boilingKelvin: kelvinOfWarmth(D_MAX, b),               // docs: exactly 373.15
        roomTravelFrac: warmthOfKelvin(293.15, b) / D_MAX,     // docs: "79% of travel"
        stylisedKelvinAtMax: kelvinOfWarmth(D_MAX, c),         // docs: "~1e5 K hot"
    };
}

export function buildKelvin(hyp, base = {}) {
    const h = kelvinDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    if (h.mode === "calibration") return { kind: "calibration", ...calibrationRun(h.config) };
    return { kind: "convert", ...convertRun(h.config) };
}

export const blobKelvinDevice = {
    // *** v3851 -- KNOB, and blobKelvin.js says so in its own words: "Stokes drag on a sphere is 6*pi*eta*r
    // under a STICK (no-slip) boundary condition and 4*pi*eta*r under a SLIP one. BOTH ARE REAL PHYSICS."
    // The plant swaps STICK for SLIP. A boundary condition on the drag law is a physics input if anything is.
    plantKind: "knob",
    // *** v3851 -- `plantKind` IS THE TAXONOMY; `planted.knob` BELOW IS THE CONFIG KEY. Two different
    // things wearing one word, and gates read the second by name, so it is NOT renamed here. ***
    // WHAT THE PLANT OVERTURNS, as data so plantedCoverage reads it off the device rather than grepping prose:
    // the calibration moves by exactly 3/2 while the round trip stays exact.
    planted: { knob: "dragK", observable: "boilingKelvin",
               note: "slip drag (4*pi*eta*r) instead of stick (6*pi); roundTripErrFrac is blind to it, and roomTravelFrac becomes impossible at 1.1784" },
    // v3191 -- EXPORTED so nothing has to GUESS. A probed mode count is a LOWER BOUND: you can only ask
    // about a mode you already thought of, and these names were in nobody's candidate list, so this
    // device reported as having NO DISCOVERABLE MODES. Derived from this file's own default plus every
    // mode its own build() branches on, each verified to produce a DISTINCT answer first.
    modes: ["convert", "calibration"],
    name: "blob-kelvin-thermometer",
    observables: KELVIN_OBSERVABLES,
    build: buildKelvin,
    defaults: kelvinDefaults,
};
