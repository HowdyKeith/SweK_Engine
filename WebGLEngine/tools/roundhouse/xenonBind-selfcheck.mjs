// tools/roundhouse/xenonBind-selfcheck.mjs
//
// Run: node tools/roundhouse/xenonBind-selfcheck.mjs   (~3s MEASURED -- two peak searches and two bisections)
//
// THIS GRADES THE BIND. physics/nuclear/xenon-selfcheck.mjs owns the physics.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT A RUNNING REACTOR CANNOT TELL. *** Equilibrium xenon depends
// only on the SUM of the iodine and direct-xenon yields, so moving one into the other leaves the operating point
// BIT-IDENTICAL. A device that graded the steady state would certify a core with no iodine pit -- and the pit is
// the entire reason this module exists. Only the shutdown transient separates them, which is also the historical
// fact: the operators saw a normal reactor right up until they scrammed it.
"use strict";
import { xenonDevice, XENON_OBSERVABLES } from "./xenonBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { XENON_U235 } from "../../physics/nuclear/xenon.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

console.log("xenonBind-selfcheck -- the pit, and a plant a running reactor cannot see\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("xenon appears in DEVICE_NAMES", DEVICE_NAMES.includes("xenon"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("xenon");
    ok("!! the registry hands back THIS device", !!d && d.name === "xenon-135-iodine-pit", d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method", "the nuclide data is the same fission, rearranged");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, AND NOTHING EXTRA");
{
    const v = xenonDevice.build(xenonDevice.defaults());
    ok("!! no advertised observable is missing", XENON_OBSERVABLES.every((k) => k in v),
        XENON_OBSERVABLES.filter((k) => !(k in v)).join(", ") || XENON_OBSERVABLES.length + " produced");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => XENON_OBSERVABLES.includes(k)),
        "both directions agree");
    ok("!! ...and pitThresholdBisected may legitimately be NULL, so finiteness is not asserted blanket-wise",
        v.pitThresholdBisected !== undefined,
        "null means the simulation found no sign change at any flux -- an ANSWER, not a missing value, and the "
        + "one the plant produces. A blanket finiteness check would have forced that answer to be hidden.");
}

console.log("\n3. THREE KEYS, EACH TWO ROUTES THAT SHARE NO LINE");
{
    const v = xenonDevice.build({ config: {} });
    ok("!! the Bateman closed form meets RK4 on the same ODEs", v.batemanVsRk4Rel < 1e-10,
        "closed " + v.batemanXe.toExponential(9) + " against rk4 " + v.rk4Xe.toExponential(9) + ", rel "
        + v.batemanVsRk4Rel.toExponential(3) + " -- and the closed form is decay.mjs's, reused by SUPERPOSITION "
        + "rather than reimplemented");
    ok("!! the peak time approaches its analytic limit as the flux rises", v.limitApproachRel < 1e-3,
        "at phi = 1e18 the peak is " + v.peakAtHighFlux.toFixed(4) + " h against the limit "
        + v.peakTimeLimitH.toFixed(4) + " h = ln(lambdaI/lambdaXe)/(lambdaI - lambdaXe), rel "
        + v.limitApproachRel.toExponential(3) + ". The familiar 'about half a day' IS this asymptote, and the "
        + "limit shares no line with the search that finds the peak.");
    // *** AND THE APPROACH IS GRADED, NOT JUST THE ARRIVAL. *** limitApproachRel alone is satisfied by SITTING
    // ON the asymptote, and that is exactly what `highFlux` was doing: knobLiveness measured it as the only
    // knob in the lab that moved no observable at any value, because the peak time saturates by phi ~ 5e17 and
    // peakAfterScram's own dt = 2 s grid quantises everything above that onto one float. The knob was read and
    // had nowhere to go. The ladder is what gives it somewhere.
    ok("!! *** the approach is MONOTONE FROM BELOW, which is what an asymptote means ***", v.approachMonotone === 1,
        "peak time at phi/1e4, phi/1e2 and phi climbs and never passes the limit. Proximity alone would be "
        + "satisfied by a route that OVERSHOT and came back, and that is not the same statement.");
    ok("!! ...and the climb is a real span rather than three copies of the asymptote", v.approachSpanH > 0.5,
        "span " + v.approachSpanH.toFixed(6) + " h across four decades of flux. THIS IS THE OBSERVABLE THAT "
        + "MAKES highFlux A KNOB: raise it 8x and the span falls to 0.1339 h, because the bottom of the ladder "
        + "climbs while the top cannot. A knob whose observable cannot move is worse than an undeclared one -- "
        + "v3129 names an invented knob back at the agent, and this one was in the register.");
    ok("!! *** the pit threshold BISECTED FROM THE SIMULATION meets the closed form ***", v.thresholdRel < 1e-10,
        "bisected " + v.pitThresholdBisected.toExponential(6) + " against phi* = lambdaXe*yieldXe/(yieldI*sigmaXe) = "
        + v.pitThresholdClosed.toExponential(6) + ", rel " + v.thresholdRel.toExponential(3)
        + ". EMERGENT: the bisection asks the simulation where dXe/dt changes sign and never forms the formula. "
        + "The fission cross-section cancels, so the threshold is a property of the NUCLIDES, not the reactor.");
    ok("...and at the reference flux a pit really does form", v.pitRisingSign === 1 && v.peakRatio > 1.5,
        "xenon peaks at " + v.peakHours.toFixed(2) + " h at " + v.peakRatio.toFixed(4) + "x its operating value");
}

console.log("\n4. *** THE PLANT: FISSION MAKES ITS XENON DIRECTLY, AND THE RUNNING CORE CANNOT TELL ***");
{
    const h = xenonDevice.build({ config: {} });
    const p = xenonDevice.build({ config: { planted: true } });

    ok("!! *** EQUILIBRIUM XENON IS BIT-IDENTICAL -- the operating point is blind to it ***",
        h.eqXenon === p.eqXenon,
        "Xe_eq = " + h.eqXenon.toExponential(8) + " both ways, because it depends only on the SUM of the yields: "
        + "(yieldI + yieldXe)*sigmaF*phi/(lambdaXe + sigmaXe*phi). The iodine inventory goes "
        + h.eqIodine.toExponential(3) + " -> " + p.eqIodine.toExponential(3) + " and the xenon does not move. "
        + "A DEVICE THAT GRADED THE STEADY STATE WOULD CERTIFY A CORE WITH NO IODINE PIT.");
    ok("!! ...and after the scram the pit is simply gone",
        h.peakRatio > 1.5 && Math.abs(p.peakRatio - 1) < 1e-9 && p.peakHours === 0,
        "peak " + h.peakHours.toFixed(2) + " h at " + h.peakRatio.toFixed(4) + "x -> " + p.peakHours.toFixed(2)
        + " h at " + p.peakRatio.toFixed(4) + "x: xenon now only decays");
    ok("!! ...and BOTH threshold routes say so independently, in their own way",
        p.pitThresholdClosed === Infinity && p.pitThresholdBisected === null,
        "closed form -> Infinity (yieldI = 0 divides), bisection -> null (no sign change anywhere in seven "
        + "decades of flux). NO PIT AT ANY FLUX, which is the module's own sentence made executable -- and two "
        + "routes reaching it separately is what makes it evidence.");
    ok("!! ...and the peak-time LIMIT is blind too, because it is a property of the decay constants",
        h.peakTimeLimitH === p.peakTimeLimitH,
        "ln(lambdaI/lambdaXe)/(lambdaI - lambdaXe) = " + h.peakTimeLimitH.toFixed(6) + " h under both: yields do "
        + "not enter it. Two blind partners, and neither is a gap.");
    ok("...and the Bateman/RK4 key SURVIVES the plant, as an answer key must",
        h.batemanVsRk4Rel < 1e-10 && p.batemanVsRk4Rel < 1e-10,
        "rel " + h.batemanVsRk4Rel.toExponential(3) + " honest, " + p.batemanVsRk4Rel.toExponential(3)
        + " planted -- the two integrations still agree with each other about a core that is wrong, which is "
        + "correct: a key that broke under the plant would be grading the plant instead of the physics");
    report("the operators saw a normal reactor right up until they scrammed it");
}

console.log("\n" + (fails ? "xenonBind-selfcheck: " + fails + " FAILED" : "xenonBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
