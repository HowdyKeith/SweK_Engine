// tools/roundhouse/blobThermalBind-selfcheck.mjs
//
// Run: node tools/roundhouse/blobThermalBind-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate: this file's name is its registration).
//
// Device #4 is the first STATISTICAL device, and the checks hold its three truths to their own standards: the
// Einstein relation to an ensemble-sized tolerance (not a wish -- ~sqrt(2/(3M)) relative at M walkers, so the
// claim's tol is derived, and a claim TIGHTER than the ensemble supports must refuse); the advection scheme's
// implicit D to the heat-equation consistency test (two horizons, one D); and the Wyvill peak floor at the
// configuration where it actually bites (isolated starts, where the peak IS the tallest blob and the guarantee
// is the whole margin). Determinism throughout comes from the module's own seeded LCG -- statistics, exactly
// reproducible.

import { buildBlob, blobDefaults, blobThermalDevice } from "./blobThermalBind.mjs";
import { roundhouseDevice } from "./deviceBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { runDevice, parseArgs } from "./run-device.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. EINSTEIN: <r^2> = 6Dt recovers the D that went in, within the ensemble's own error bar -----------------
{
    const e = buildBlob({ mode: "einstein" });
    const bar = Math.sqrt(2 / (3 * e.walkers));   // relative sd of <r^2> over M 3D walkers
    ok("!! the ensemble recovers the input D within its own statistical bar", e.dErrFrac < 3 * bar,
        "D_in " + e.dInput + " -> D_meas " + e.dMeasured.toFixed(6) + " (" + (e.dErrFrac * 100).toFixed(2) +
        "%, bar " + (bar * 100).toFixed(2) + "%) -- the tolerance is derived from M, not chosen to pass");
    const e2 = buildBlob({ mode: "einstein" });
    ok("!! the statistics are exactly reproducible (seeded LCG)", e2.dMeasured === e.dMeasured,
        "same seed, bit-equal D_meas -- a statistical claim that reruns identically is still falsifiable");
    const e3 = buildBlob({ mode: "einstein", config: { seed: 43 } });
    ok("...and a different seed gives a different draw", e3.dMeasured !== e.dMeasured);
}

// ---- 2. SCHEME: the implicit D obeys the heat equation (two horizons, one D) -----------------------------------
{
    const s = buildBlob({ mode: "scheme" });
    ok("!! the advection scheme's two-horizon D estimates agree to < 1%", s.dConsistencyFrac < 0.01,
        "t=0.5 and t=1 give D within " + (s.dConsistencyFrac * 100).toFixed(3) +
        "% of each other -- d<r^2>/dt is LINEAR, i.e. it diffuses like a heat equation, not merely blurs");
    ok("the implicit D is a real, positive temperature nobody set", s.schemeD > 0,
        "schemeD " + s.schemeD.toFixed(6) + " with the probe's defaults");
}

// ---- 3. FLOOR: the invariant at the configuration where it bites ------------------------------------------------
{
    const f = buildBlob({ mode: "floor" });
    ok("!! isolated Wyvill blobs keep the field peak at or above the tallest amplitude through the walk",
        f.peakAboveFloor === true && f.fieldPeak >= f.peakFloorValue,
        "peak " + f.fieldPeak.toFixed(4) + " vs floor " + f.peakFloorValue.toFixed(4) +
        " -- disjoint starts, so the peak IS one blob and the floor is the entire guarantee (the grid has none)");
}

// ---- 3b. DISPERSION (v2895): the blobarium as something a pulsar signal passes THROUGH -------------------------
{
    const d = buildBlob({ mode: "dispersion", config: { dmAmp: 0.01, nuLo: 1, nuHi: 4 } });
    ok("!! the column density by QUADRATURE matches the analytic Wyvill chord integral -- with real error, not zero",
        d.dmErrFrac > 0 && d.dmErrFrac < 1e-9,
        "err " + d.dmErrFrac.toExponential(2) + " -- the first version graded blobRadonAt against its OWN formula and " +
        "returned exactly 0.0, the same tell as v2894's Roche mode; Simpson quadrature of the actual field does not know the closed form");
    ok("...and the offset-chord profile falls as (1 - b^2/r^2)^3.5, measured the same independent way",
        d.dmProfileErrFrac < 1e-6, "exponent " + d.dmProfileExponent.toFixed(6) + " vs exact 3.5");

    ok("!! the nu^-2 dispersion law EMERGES from propagating the signal, rather than being written down",
        Math.abs(d.delayExponent + 2) < 0.01,
        "exponent " + d.delayExponent.toFixed(6) + " from integrating v_g = c sqrt(1 - n_e/nu^2) at six frequencies -- " +
        "the classic pulsar observable, derived rather than assumed");
    ok("...and the 2:1 frequency delay ratio approaches the exact 4", Math.abs(d.delayRatio - 4) < 0.05, d.delayRatio.toFixed(4));

    // ...and it DEGRADES with density, which makes the validity boundary an observable in its own right
    const thick = buildBlob({ mode: "dispersion", config: { dmAmp: 0.5, nuLo: 1, nuHi: 4 } });
    ok("!! the law measurably DEGRADES as the plasma thickens -- a validity boundary, not a constant",
        Math.abs(thick.delayExponent + 2) > 10 * Math.abs(d.delayExponent + 2),
        "exponent " + thick.delayExponent.toFixed(4) + " at 50x the density vs " + d.delayExponent.toFixed(4) +
        " dilute -- nu^-2 is the DILUTE limit and this device can say where it stops");

    ok("!! the DM is declared to be in SIM UNITS, not pc/cm^3 -- the blobKelvin discipline, carried over",
        d.scaleCommitted === false && Number.isFinite(d.dmSimUnits),
        "converting to a physical dispersion measure needs a length commitment; every graded fact above is scale-free, which is why it can be graded at all");
}

// ---- 4. CLAIMS: honest tolerances crystallize; wishes refuse ----------------------------------------------------
{
    const caller = (hyps) => { let i = 0; return async (role) => role === "proposer" ? hyps[Math.min(i++, hyps.length - 1)] : { reading: "(mock)" }; };
    const dev = await getDevice("blobthermal");
    ok("the registry knows the blobarium", DEVICE_NAMES.includes("blobthermal"), DEVICE_NAMES.join(", "));

    const honest = await roundhouseDevice({
        callModel: caller([{ mode: "einstein", claim: { observable: "dErrFrac", max: 0.05 } }]),
        device: dev, question: "does the walk obey Einstein?", maxRounds: 2,
    });
    ok("!! a claim with an ensemble-sized tolerance crystallizes", honest.crystallized === true && honest.rounds === 1,
        "dErrFrac " + honest.verdict.measured.toFixed(4) + " <= 0.05");

    const wish = await roundhouseDevice({
        callModel: caller([{ mode: "einstein", claim: { observable: "dErrFrac", max: 1e-6 } }]),
        device: dev, question: "does the walk obey Einstein PERFECTLY?", maxRounds: 2,
    });
    ok("!! a claim tighter than the ensemble supports refuses", wish.crystallized === false,
        "1e-6 demanded of a 2000-walker draw -- the statistics say no, and nothing else counts");

    const cli = [];
    const out = await runDevice(parseArgs(["blobthermal", "mock"]), (s) => cli.push(s));
    ok("the CLI front door drives it", out.crystallized === true && cli.some((l) => l.includes("blobarium-thermal")));
}

// ---- 5. SLOPPY HYPOTHESES clamp -----------------------------------------------------------------------------------
{
    const h = blobDefaults({ mode: "boil", config: { D: 99, blobCount: 1e9, steps: -4, seed: 7.9 } });
    ok("!! defaults clamp nonsense into a bounded run", h.mode === "einstein" && h.config.D <= 1 && h.config.blobCount <= 20000 && h.config.steps >= 1,
        "a wild proposal cannot allocate a billion walkers or step backwards");
}

// ---- *** THE PLANT (v3715): DROP THE 2 FROM sqrt(2*D*dt) *** -----------------------------------------------------
// Einstein-Smoluchowski gives <x^2> = 2*D*t per axis. sqrt(D*dt) is dimensionally correct, looks right, and
// walks at HALF the commanded diffusion -- the single most common way to get Brownian motion wrong.
// WHEN THESE GO RED the fix is to restore the factor of two, NEVER to widen dErrFrac's tolerance: the whole
// point of the einstein mode is that the ensemble recovers the D that was put in.
{
    const { getDevice } = await import("./devices.mjs");
    const dev = await getDevice("blobthermal");
    const nom = dev.build({ mode: "einstein", config: {} });
    const pl = dev.build({ mode: "einstein", config: { planted: true } });

    ok("!! the planted walk recovers EXACTLY HALF the commanded D",
        Math.abs(pl.dMeasured / nom.dMeasured - 0.5) < 0.02 && pl.dErrFrac > 0.45,
        `dMeasured ${nom.dMeasured.toFixed(6)} -> ${pl.dMeasured.toFixed(6)}, dErrFrac ${nom.dErrFrac.toFixed(4)} -> ${pl.dErrFrac.toFixed(4)}` +
        " -- a factor of two in sigma is a factor of two in D, and the ensemble sees it");

    ok("!! the honest run stays inside its ENSEMBLE-SIZED tolerance, which the plant blows through",
        nom.dErrFrac < 0.05 && pl.dErrFrac > 10 * nom.dErrFrac,
        `${nom.dErrFrac.toFixed(4)} vs ${pl.dErrFrac.toFixed(4)} -- about sqrt(2/(3M)) at M=2000 is the honest floor`);

    // *** THE FLOOR MODE IS BLIND TO THIS PLANT AND THAT IS CORRECT, WHICH IS WHY IT IS ASSERTED RATHER THAN
    // TREATED AS A GAP. The Wyvill field at a blob's own centre is 1 and every other blob only ADDS, so the
    // peak cannot fall below the tallest amplitude however far the centres wander. An invariant that held only
    // for the right diffusion constant would not be an invariant. THIRD ROUND RUNNING WITH A BLIND OBSERVABLE
    // AND THE FIRST WHERE THE BLINDNESS IS THE POINT: v3713's loss columns and v3714's round trip were SUPPOSED
    // to see their plants and could not. Ask whether the observable ever claimed to look. ***
    const fNom = dev.build({ mode: "floor", config: {} });
    const fPl = dev.build({ mode: "floor", config: { planted: true } });
    ok("!! the floor invariant holds under BOTH walks -- blind to the plant, and rightly so",
        fNom.peakAboveFloor === true && fPl.peakAboveFloor === true,
        "a structural invariant does not depend on the diffusion constant; counting it as plant coverage would be counting an observable that never looked");

    // AND THE PLANT IS SCOPED: the scheme mode never jitters, so it must be BIT-IDENTICAL, not merely close.
    const sNom = dev.build({ mode: "scheme", config: {} });
    const sPl = dev.build({ mode: "scheme", config: { planted: true } });
    ok("!! the scheme mode is bit-identical under the plant -- it never jitters",
        sNom.schemeD === sPl.schemeD && sNom.dConsistencyFrac === sPl.dConsistencyFrac,
        `schemeD ${sNom.schemeD.toExponential(4)} -- a knob that moved a mode it does not touch would be a leak`);

    ok("the device names what its plant overturns, as data rather than prose",
        dev.planted && dev.planted.knob === "axisFactor" && dev.planted.observable === "dErrFrac");
}

console.log();
if (fails) { console.log("blobThermalBind-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("blobThermalBind-selfcheck: all checks pass");
