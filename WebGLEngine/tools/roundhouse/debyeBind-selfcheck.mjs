// tools/roundhouse/debyeBind-selfcheck.mjs
//
// Run: node tools/roundhouse/debyeBind-selfcheck.mjs   (~0.4s MEASURED)
//
// THIS GRADES THE BIND, NOT THE PHYSICS. physics/thermal/debye-selfcheck.mjs owns the physics. What can go wrong
// here is a device exported but never registered, an observable advertised and never produced, or a plant
// credited with catching something it cannot catch.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THE CLASSICAL LIMIT CANNOT TELL THE TWO MODELS APART. ***
// Einstein (1907) and Debye (1912) BOTH give Dulong-Petit at high temperature -- that is not a defect of the
// plant, it is the actual history: it took measurement in the cold to settle which was right. So section 4
// asserts that a Dulong-Petit check PASSES ON BOTH, and that the plant is caught somewhere else entirely. A
// plant a classical-limit check could catch would be a much weaker plant, and if somebody ever coarsens this
// one into something that fails at high T, that assertion is what says so.
"use strict";
import { debyeDevice, DEBYE_OBSERVABLES } from "./debyeBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { DULONG_PETIT, LOWT_COEFF } from "../../physics/thermal/debye.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("debyeBind-selfcheck -- wired, live, and is the plant caught where the HISTORY says it must be?\n");

console.log("1. REGISTERED AND REACHABLE THROUGH THE REGISTRY");
{
    ok("debye appears in DEVICE_NAMES", DEVICE_NAMES.includes("debye"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("debye");
    ok("!! the registry hands back THIS device", !!d && d.name === "debye-heat-capacity-vs-einstein",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method",
        "the inputs and the reading are untouched and a DIFFERENT PHYSICAL MODEL is substituted underneath -- "
        + "v3850's kind, and the census cannot classify what is not declared");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = debyeDevice.build(debyeDevice.defaults());
    const missing = DEBYE_OBSERVABLES.filter((k) => !(k in v));
    ok("!! no advertised observable is missing", missing.length === 0,
        missing.join(", ") || DEBYE_OBSERVABLES.length + " produced");
    ok("...and every one is finite", DEBYE_OBSERVABLES.every((k) => finite(v[k])),
        DEBYE_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced",
        Object.keys(v).every((k) => DEBYE_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !DEBYE_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. *** THE ANSWER KEY IS ANOTHER MODULE'S RESULT, NOT A CONSTANT WRITTEN DOWN HERE ***");
{
    const v = debyeDevice.build({ config: {} });
    ok("!! the low-T coefficient reached through BLACKBODY equals the Debye law's 12 pi^4/5",
        v.boseJoinRel < 1e-10,
        "9 * 4 * INT_0^inf x^3/(e^x-1) dx = " + v.lowTCoeffFromBose.toFixed(8) + " against " + LOWT_COEFF.toFixed(8)
        + ", rel " + v.boseJoinRel.toExponential(3) + ". THE SECOND FACTOR IS BLACKBODY'S -- a module that knows "
        + "nothing about solids computing a solid's cold heat capacity.");
    ok("!! ...and the slope MEASURED off this module's own quadrature meets it", v.lowTSlopeRel < 1e-10,
        "measured " + v.lowTSlope.toFixed(8) + ", rel " + v.lowTSlopeRel.toExponential(3)
        + " -- two modules meet on 233.7818 and neither alone is asked to be right about it");
    ok("!! Dulong-Petit: the hot solid forgets it is quantum", v.dulongPetitRel < 1e-4,
        "C_V/(Nk) = " + v.cvHighT.toFixed(9) + " against " + DULONG_PETIT + ", rel "
        + v.dulongPetitRel.toExponential(3) + " -- Dulong and Petit, 1819");
    ok("!! C_V = dU/dT across two routes that share no quadrature", v.derivativeRel < 1e-8,
        "C_V " + v.cvMid.toFixed(8) + " against dU/dT " + v.dUdTMid.toFixed(8) + ", rel "
        + v.derivativeRel.toExponential(3) + " -- the energy and capacity integrands are different functions");
}

console.log("\n4. *** THE PLANT IS EINSTEIN 1907, AND THE CLASSICAL LIMIT CANNOT TELL THEM APART ***");
{
    const h = debyeDevice.build({ config: {} });
    const p = debyeDevice.build({ config: { planted: true } });

    ok("!! *** the T^3 law is annihilated: an EXPONENTIAL freeze-out, not a power law ***",
        h.lowTSlopeRel < 1e-10 && p.lowTSlopeRel > 0.9,
        "low-T slope " + h.lowTSlope.toFixed(6) + " -> " + p.lowTSlope.toExponential(3)
        + ". Einstein's capacity at T/Theta = 0.02 is " + p.cvLowT.toExponential(3) + " against Debye's "
        + h.cvLowT.toExponential(3) + " -- not a small error, and only measurement settled it.");

    ok("!! ...AND A DULONG-PETIT CHECK PASSES ON BOTH, which is the actual history",
        h.dulongPetitRel < 1e-4 && p.dulongPetitRel < 1e-4,
        "honest rel " + h.dulongPetitRel.toExponential(3) + ", PLANTED rel " + p.dulongPetitRel.toExponential(3)
        + " -- both classical in the heat. THE BLIND PARTNER IS THE POINT: a plant a classical-limit check could "
        + "catch would be a much weaker plant, and this assertion is what notices if it is ever coarsened.");

    ok("!! ...and the substituted model contradicts the UNTOUCHED energy, catching it a second way",
        h.derivativeRel < 1e-8 && p.derivativeRel > 1e-3,
        "C_V = dU/dT rel " + h.derivativeRel.toExponential(3) + " -> " + p.derivativeRel.toExponential(3)
        + ". The energy route is left honest on purpose, so a swapped capacity shows up as an INTERNAL "
        + "CONTRADICTION rather than only as a wrong number.");

    ok("!! ...and the cross-module key is UNTOUCHED, because it is external to the model",
        h.lowTCoeffFromBose === p.lowTCoeffFromBose && h.boseJoinRel === p.boseJoinRel,
        "blackbody's integral is bit-identical under the plant -- an answer key that moved with the thing it "
        + "grades would not be a key at all");
    report("Einstein and Debye agree in the heat and part in the cold. The device is graded where they part.");
}

console.log("\n" + (fails ? "debyeBind-selfcheck: " + fails + " FAILED" : "debyeBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
