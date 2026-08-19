// tools/roundhouse/sensitivity-selfcheck.mjs
//
// v3436 -- WHICH KNOB MOVES WHICH OBSERVABLE, ASKED OF THE WHOLE LAB AT ONCE.
//
// sweepDevice varies ONE knob and reports the shape of the response. Nothing asked the matrix question, and two
// findings only fall out of the matrix: a DEAD knob that moves nothing anywhere, and an INERT observable that
// responds to nothing.
//
// *** IT FOUND A DEAD KNOB IN A DEVICE I BUILT. *** nuclear declared A and Z in its defaults and computed
// fissionQ(238, 92) with the numbers hardcoded. Not a silently-ignored key arriving from outside -- a key the
// device ADVERTISED and then did not read. Fixed here, and the knob now shows the sign flip that makes the
// binding curve mean something: iron ABSORBS 22.65 MeV on splitting and uranium RELEASES 220.39.
//
// *** AND TWO MEASUREMENT ERRORS WERE MADE BUILDING IT, BOTH KEPT. ***
//
//   Testing only the FIRST mode while passing the FULL default config makes knobs belonging to other modes look
//   dead: 37 of 101 by that method against 14 of 102 when every mode is tried.
//
//   Worse, counting only NUMERIC observables reported acoustics:c as dead. c is the speed of sound feeding the
//   pipe-mode frequencies, which are returned as an ARRAY -- the knob moved [171.5, 343, 514.5] to
//   [188.65, 377.3, 565.95] and the scan could not see it. A scan blind to a value TYPE reports absence of
//   response where there is response, which is the most misleading result a sensitivity analysis can give.

import { deviceSensitivity, labSensitivity, changed, perturb, pairedSensitivity, ENABLING_FLAGS } from "./sensitivity.mjs";
import { DEVICE_NAMES, getDevice } from "./devices.mjs";
import { SLOW_DEVICES } from "./valueMatch.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const lab = await labSensitivity(DEVICE_NAMES.slice(0, 30), getDevice, SLOW_DEVICES);

// ---- 1. THE COMPARISON SEES ARRAYS, WHICH IS WHAT MADE THE FIRST RUN WRONG ---------------------------------------
{
    ok("!! a moved ARRAY counts as a change",
        changed([1, 2, 3], [1, 2, 4]) && !changed([1, 2, 3], [1, 2, 3]),
        "acoustics:c was reported dead because the pipe-mode frequencies it moves are returned as an array and " +
        "the scan only compared numbers. A sensitivity analysis blind to a value type reports no response where " +
        "there is one, which is worse than reporting nothing");

    ok("...and a nested object too, without treating NaN as a change",
        changed({ a: [1] }, { a: [2] }) && !changed(NaN, NaN),
        "NaN !== NaN, so a naive comparison would call every non-finite observable permanently moving and every " +
        "knob live");

    const ac = await deviceSensitivity("acoustics", getDevice);
    ok("!! acoustics:c is no longer listed dead",
        ac && !ac.dead.includes("c"),
        `acoustics dead knobs: ${JSON.stringify(ac ? ac.dead : null)}. The fix was to the INSTRUMENT, not the ` +
        "device -- the knob was always live");
}

// ---- 2. THE DEAD KNOB IT FOUND IN MY OWN DEVICE ----------------------------------------------------------------------
{
    const nuc = await deviceSensitivity("nuclear", getDevice);
    ok("!! nuclear's A and Z are live now that fissionQ reads them",
        nuc && !nuc.dead.includes("A") && !nuc.dead.includes("Z"),
        "they were declared in the defaults and the device computed fissionQ(238, 92) with the numbers written " +
        "in. A caller could set A and Z and be ignored -- advertised and unread, which is a worse contract than " +
        "not offering them at all");

    const d = await getDevice("nuclear");
    const iron = await d.build({ mode: "binding", config: { A: 56, Z: 26 } });
    const uranium = await d.build({ mode: "binding", config: { A: 238, Z: 92 } });
    ok("...and the knob now carries the sign flip that makes the binding curve mean something",
        iron.fissionQ < 0 && uranium.fissionQ > 0,
        `iron ABSORBS ${(-iron.fissionQ).toFixed(2)} MeV on splitting and uranium RELEASES ` +
        `${uranium.fissionQ.toFixed(2)}. With the arguments hardcoded the device could only ever report one of ` +
        "those, and the whole point of the iron peak is that the sign changes across it");
}

// ---- 3. THE LAB ROLL-UP -----------------------------------------------------------------------------------------------
{
    ok("!! the matrix covers a real share of the lab",
        lab.devices > 20 && lab.knobs > 80 && lab.observables > 300,
        `${lab.devices} devices, ${lab.knobs} knobs, ${lab.observables} observables. The thirteen slow devices ` +
        "are skipped for the same cost reason as every other census here");

    ok("!! and dead knobs are REPORTED rather than failed on",
        Array.isArray(lab.dead),
        `${lab.dead.length} knobs move nothing in any mode: ${lab.dead.slice(0, 5).join(", ")}. Some are genuine ` +
        "gaps and some are tolerances that only matter on a path the defaults do not take -- an onset tolerance " +
        "that never fires at the default radius is not broken. Failing on the list would condemn both kinds");
}

// ---- 4. WHAT AN INERT OBSERVABLE DOES AND DOES NOT MEAN ---------------------------------------------------------------------
{
    ok("!! an inert observable is a question, not a defect",
        lab.inert.length > 0,
        `${lab.inert.length} observables respond to no knob. A DEFINED constant should be inert -- the speed of ` +
        "light, an exact closed-form key, a mode label. What the list is for is finding the other kind: a number " +
        "reported as a measurement that nothing in the device actually computes. Telling those apart needs a " +
        "person, exactly as with a flat sweep");
}


// ---- 5. THE DEAD LIST WAS READ, AND THE FIRST ENTRY WAS A FALSE POSITIVE -------------------------------------------
//
// inspiral:plantedPower appeared dead. It is not: the device reads it only when `planted` is true, and with that
// set it moves EIGHT observables -- mergerMeasured, mergerExact, mergerErrFrac, worstBulkErrFrac, steps, finalA,
// ratePower, a0Exponent. A knob GATED BY ANOTHER KNOB looks dead to a scan that varies one at a time from the
// defaults, and this scan does exactly that.
//
// A dead verdict therefore means "moves nothing when varied ALONE from the declared defaults", which is weaker
// than "unused". Reading the list is part of using it -- and the first entry read was a false positive, which
// is the rate a one-at-a-time scan should be expected to produce over a lab full of conditional parameters.
{
    const d = await getDevice("inspiral");
    const a = await d.build({ mode: "merger", config: { planted: true, plantedPower: 4 } });
    const b = await d.build({ mode: "merger", config: { planted: true, plantedPower: 5 } });
    const moved = Object.keys(a).filter((k) => typeof a[k] === "number" && a[k] !== b[k]);
    ok("!! a knob that looked dead is live under its ENABLING condition",
        moved.length >= 5,
        `plantedPower moves ${moved.length} observables once planted is true, and none when it is not. The scan ` +
        "varies one knob at a time from the defaults, so a conditional parameter is invisible to it. Catching " +
        "these properly needs a two-at-a-time sweep over enabling flags, which costs quadratically and is a " +
        "separate job");

    ok("...so a DEAD verdict is a lead, not a defect",
        lab.dead.length > 0,
        `${lab.dead.length} knobs on the list. Several are tolerances for a search path the defaults never take ` +
        "-- an onset tolerance that never fires is not broken. The instrument narrows a hundred and forty knobs " +
        "to ten worth reading, and reading them is still the job");
}


// ---- 6. THE TWO-AT-A-TIME SWEEP, AND THE THIRD LIMITATION IT EXPOSED --------------------------------------------
//
// Pairs over all 188 declared keys would be quadratic and pointless. It does not need to be: only a small set of
// keys GATE others, and they are identifiable -- they appear as config.X in the bind sources and are declared in
// NO defaults, which is what makes them switches rather than settings. `planted` is used in 23 binds and is
// absent from every defaults() in the lab, because a default run must never be a planted run.
//
// So the sweep is DEAD KNOBS x FLAGS, linear in the thing that matters. It rescued three.
//
// *** AND A THIRD LIMITATION SURFACED WHILE RUNNING IT. *** whitedwarf:points came back dead. The default is 8,
// the scan tried 8 * 1.1 = 8.8, and the device floors that straight back to 8. A multiplicative perturbation is
// simply wrong for a COUNT. Stepping integers additively instead moves slopeMeasured, slopeErrAbs and r2.
//
// All three limitations had the same shape: the scan reported NO RESPONSE WHERE THERE WAS ONE, because of how it
// looked rather than what was there. Numeric-only comparison missed an array. One-at-a-time missed a gated knob.
// A multiplicative step missed an integer. Ten dead became six.
{
    ok("!! integers are stepped additively, floats multiplicatively",
        perturb(8) === 10 && Math.abs(perturb(2.5) - 2.75) < 1e-12,
        "8 * 1.1 = 8.8 floors back to 8 and the knob looks dead. A count needs a step it can actually take, and " +
        "the fix is to the INSTRUMENT -- whitedwarf:points was always live");

    const paired = await pairedSensitivity(lab.dead, getDevice);
    ok("!! the paired sweep rescues knobs that are GATED rather than unused",
        paired.rescued.length >= 2 && paired.flagsTried >= 3,
        `${paired.rescued.length} rescued against ${paired.flagsTried} registered flags: ` +
        `${paired.rescued.map((r) => r.entry + " under " + r.flag).join(", ")}. A gated knob is working as " +
        "designed and an unused one is a defect -- calling both dead conflates a correct device with a broken one`);

    ok("...and the flags are REGISTERED with a reason, not sniffed",
        Object.keys(ENABLING_FLAGS).length >= 3 && /declared in NO defaults/.test(ENABLING_FLAGS.planted),
        `${Object.keys(ENABLING_FLAGS).length} flags, each with why it is a switch rather than a setting. ` +
        "Guessing which keys gate others from their names would put this back where the name-match census was");

    ok("!! what survives all three corrections is a short list worth reading",
        paired.stillDead.length < lab.dead.length && paired.stillDead.length <= 8,
        `${paired.stillDead.length} knobs move nothing under any flag, with integer stepping, comparing every ` +
        `value type: ${paired.stillDead.map((x) => x.entry).join(", ")}. Several are search tolerances on a path ` +
        "the defaults never take, and acoustics:N is a grid size the propagation error is DESIGNED to be " +
        "independent of. A legitimately dead knob is still a real category");
}

console.log();
console.log(`  sensitivity: ${lab.devices} devices, ${lab.dead.length} dead knobs, ${lab.inert.length} inert observables`);
if (fails) { console.log("sensitivity-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("sensitivity-selfcheck: all checks pass");
