// tools/roundhouse/becBind-selfcheck.mjs
//
// Run: node tools/roundhouse/becBind-selfcheck.mjs   (~0.3s MEASURED)
//
// THIS GRADES THE BIND. physics/thermal/bec-selfcheck.mjs owns the physics.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT BOTH ENDPOINTS ARE BLIND. *** N0/N = 1 - (T/Tc)^p gives exactly
// 1 at T = 0 and exactly 0 at Tc FOR EVERY p, so a device that checked "all condensed at zero, none at Tc" would
// certify a gas with the wrong dimensionality. The exponent is recovered FROM THE CURVE -- ln(1-f)/ln(t) -- not
// read back from the constant that produced it, because reading a constant back proves only that a variable was
// not corrupted between two lines.
"use strict";
import { becDevice, BEC_OBSERVABLES } from "./becBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

console.log("becBind-selfcheck -- condensation, the 2D divergence, and a plant blind at both ends\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("bec appears in DEVICE_NAMES", DEVICE_NAMES.includes("bec"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("bec");
    ok("!! the registry hands back THIS device", !!d && d.name === "bose-einstein-condensation-and-the-2d-divergence",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method", "the density of states is wrong");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, AND NOTHING EXTRA");
{
    const v = becDevice.build(becDevice.defaults());
    ok("!! no advertised observable is missing", BEC_OBSERVABLES.every((k) => k in v),
        BEC_OBSERVABLES.filter((k) => !(k in v)).join(", ") || BEC_OBSERVABLES.length + " produced");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => BEC_OBSERVABLES.includes(k)),
        "both directions agree");
    ok("!! ...and ceiling2D is deliberately NOT finite, so finiteness is not asserted blanket-wise",
        !Number.isFinite(v.ceiling2D) && v.twoDimensionsDiverge === 1,
        "zeta(1) = " + v.ceiling2D + " -- asserting 'every observable is finite' here would have forced this "
        + "divergence to be hidden, and the divergence is the physics");
}

console.log("\n3. THE THRESHOLD, REACHED BY THREE MODULES THAT SHARE NO CODE");
{
    const v = becDevice.build({ config: {} });
    ok("!! zeta(3/2) from blackbody's integral meets zeta.js's zeta", v.criticalJoinRel < 1e-10,
        "boseIntegral(3/2)/Gamma(3/2) = " + v.criticalFromBoseIntegral.toFixed(10) + " against zeta(3/2) = "
        + v.criticalFromZeta.toFixed(10) + ", rel " + v.criticalJoinRel.toExponential(3)
        + " -- boseIntegral from one module, Gamma from another, zeta from a third");
    ok("!! the heat-capacity cusp is (15/4) zeta(5/2)/zeta(3/2)", Math.abs(v.cvPeakValue - 1.92567168) < 1e-6,
        "C_V/(Nk) = " + v.cvPeakValue.toFixed(8) + " at Tc");
    ok("!! *** AND THERE IS NO CONDENSATION IN TWO DIMENSIONS, BECAUSE zeta(1) DIVERGES ***",
        v.twoDimensionsDiverge === 1 && Number.isFinite(v.ceiling3D) && Number.isFinite(v.ceiling4D),
        "ceilings zeta(d/2): d=1 " + v.ceiling1D.toFixed(6) + ", d=2 " + v.ceiling2D + ", d=3 "
        + v.ceiling3D.toFixed(6) + ", d=4 " + v.ceiling4D.toFixed(6)
        + ". An infinite ceiling holds every atom at any temperature. A FINITE number at d=2 would be a claim "
        + "that BEC exists in two dimensions, which is a famous wrong answer and not a rounding error.");
}

console.log("\n4. *** THE PLANT IS THE EXPONENT, AND BOTH ENDPOINTS ARE BLIND TO IT ***");
{
    const h = becDevice.build({ config: {} });
    const p = becDevice.build({ config: { planted: true } });

    ok("!! *** T = 0 and T = Tc are BIT-IDENTICAL under it -- every exponent pins both ends ***",
        h.condensateAtZero === p.condensateAtZero && h.condensateAtTc === p.condensateAtTc,
        "all condensed at zero (" + h.condensateAtZero + ") and none at Tc (" + h.condensateAtTc + ") in BOTH "
        + "cases. A device that checked only the endpoints would certify a gas with the wrong dimensionality.");
    ok("!! ...only the interior moves", Math.abs(h.condensateAtHalf - p.condensateAtHalf) > 0.1,
        "N0/N at T/Tc = 0.5: " + h.condensateAtHalf.toFixed(6) + " -> " + p.condensateAtHalf.toFixed(6));
    ok("!! ...and the exponent is RECOVERED FROM THE CURVE, not read back from the constant",
        h.exponentRel < 1e-12 && Math.abs(p.exponentRecovered - 1) < 1e-12,
        "ln(1-f)/ln(t) = " + h.exponentRecovered.toFixed(12) + " honest (the 3/2 of a 3D density of states) -> "
        + p.exponentRecovered.toFixed(12) + " planted. Reading a constant back would prove only that a variable "
        + "was not corrupted between two lines.");
    ok("!! ...and the threshold, the cusp and every dimension ceiling are untouched",
        ["criticalDensity", "criticalFromBoseIntegral", "criticalFromZeta", "criticalJoinRel", "cvPeakValue",
         "ceiling1D", "ceiling3D", "ceiling4D", "twoDimensionsDiverge"].every((k) => h[k] === p[k]),
        "12 of 15 observables unchanged -- Tc is set by the ceiling, and the ceiling does not care how the "
        // The condensate curve BELOW Tc and the threshold AT Tc are separate claims with separate evidence.
        + "condensate grows once condensation has started");
    report("photons and phonons never condense; massive atoms conserve N, and that is the whole difference");
}

console.log("\n" + (fails ? "becBind-selfcheck: " + fails + " FAILED" : "becBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
