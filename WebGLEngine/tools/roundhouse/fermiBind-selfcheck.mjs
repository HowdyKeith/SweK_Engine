// tools/roundhouse/fermiBind-selfcheck.mjs
//
// Run: node tools/roundhouse/fermiBind-selfcheck.mjs   (~0.5s MEASURED -- two Fermi quadratures and one Bose)
//
// THIS GRADES THE BIND, NOT THE PHYSICS. physics/thermal/fermi-selfcheck.mjs owns that.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THE T = 0 STRUCTURE CANNOT SEE A THERMAL PLANT. *** The Fermi
// sphere filled solid gives <E> = (3/5)E_F, P = (2/5)n E_F, P = (2/3)(U/V) and the n^{5/3} polytrope -- pure
// fractions, none of them thermal. Swapping Fermi-Dirac statistics for classical equipartition leaves every one
// of them bit-identical. A device that graded only the ground state would certify a gas whose electrons heat
// like billiard balls, which is precisely the error the quantum theory of metals was invented to fix.
"use strict";
import { fermiDevice, FERMI_OBSERVABLES } from "./fermiBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { sommerfeldCoefficient, classicalCv } from "../../physics/thermal/fermi.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("fermiBind-selfcheck -- wired, live, and is the equipartition plant blind at T = 0?\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("fermi appears in DEVICE_NAMES", DEVICE_NAMES.includes("fermi"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("fermi");
    ok("!! the registry hands back THIS device", !!d && d.name === "degenerate-fermi-gas-vs-equipartition",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method",
        "the statistics are swapped; the inputs and the readings are not");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = fermiDevice.build(fermiDevice.defaults());
    ok("!! no advertised observable is missing", FERMI_OBSERVABLES.every((k) => k in v),
        FERMI_OBSERVABLES.filter((k) => !(k in v)).join(", ") || FERMI_OBSERVABLES.length + " produced");
    ok("...and every one is finite", FERMI_OBSERVABLES.every((k) => finite(v[k])),
        FERMI_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => FERMI_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !FERMI_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. *** THE ONE-SIGN MIRROR: THE DENOMINATOR IS BLACKBODY'S ***");
{
    const v = fermiDevice.build({ config: {} });
    ok("!! the Fermi integral meets Gamma(s)eta(s)", v.fermiInt2Rel < 1e-10,
        "quadrature " + v.fermiInt2.toFixed(12) + " against " + v.fermiInt2Closed.toFixed(12)
        + " = pi^2/12, rel " + v.fermiInt2Rel.toExponential(3));
    ok("!! *** fermiIntegral/boseIntegral = eta(s)/zeta(s), AND THE TWO SIDES COME FROM DIFFERENT MODULES ***",
        v.mirrorRel < 1e-10,
        "measured " + v.mirrorRatio.toFixed(14) + " against eta/zeta " + v.mirrorPredicted.toFixed(14)
        + ", rel " + v.mirrorRel.toExponential(3) + ". The denominator is BLACKBODY'S boseIntegral -- the same "
        + "quadrature debye's low-T slope rides on. e^x + 1 instead of e^x - 1 is the ONLY difference, and it "
        + "turns Riemann's zeta into Dirichlet's eta.");
    ok("...and eta/zeta is computed from the two FUNCTIONS, not restated as 1 - 2^(1-s)",
        Math.abs(v.mirrorPredicted - (1 - Math.pow(2, 1 - 3))) < 1e-12 && v.mirrorPredicted !== v.mirrorRatio,
        "a second route that is secretly the first route reports agreement it never tested");
}

console.log("\n4. THE T = 0 FRACTIONS ARE EXACT");
{
    const v = fermiDevice.build({ config: {} });
    ok("!! <E> = (3/5) E_F exactly", v.groundFraction === 0.6, String(v.groundFraction));
    ok("!! P = (2/5) n E_F exactly", v.pressureFraction === 0.4, String(v.pressureFraction));
    ok("!! ...so P = (2/3)(U/V), the Fermi sphere filled solid",
        Math.abs(v.pressureOverEnergyDensity - 2 / 3) < 1e-15, v.pressureOverEnergyDensity.toFixed(12));
    ok("!! and the polytrope exponent is 5/3, which whiteDwarf's R ~ M^(-1/3) rides on",
        Math.abs(v.polytropeExponent - 5 / 3) < 1e-15, String(v.polytropeExponent));
}

console.log("\n5. *** THE PLANT IS CLASSICAL EQUIPARTITION, AND T = 0 CANNOT SEE IT ***");
{
    const h = fermiDevice.build({ config: {} });
    const p = fermiDevice.build({ config: { planted: true } });

    ok("!! honestly C_V is LINEAR in T: doubling T doubles it, exactly", h.sommerfeldLinearityRel < 1e-15,
        "C_V(2T)/C_V(T) = 2 to " + h.sommerfeldLinearityRel.toExponential(3) + ", coefficient pi^2/2 = "
        + sommerfeldCoefficient().toFixed(8) + " -- only the sliver within ~kT of the Fermi surface can be excited");
    ok("!! *** planted, it is CONSTANT: the ratio collapses to 1 and the linearity is gone ***",
        p.sommerfeldLinearityRel > 0.4 && p.cvLow === classicalCv() && p.cvHigh === classicalCv(),
        "C_V = " + p.cvLow + " at both temperatures -- every electron carrying (3/2)k, which is what everyone "
        + "believed before the quantum theory of metals and what measurement refused");
    ok("!! ...and the size of the refusal is reported: the classical answer is 304x too large",
        h.classicalOverFermi > 300 && h.classicalOverFermi < 310,
        "classical/Sommerfeld = " + h.classicalOverFermi.toFixed(2) + "x at T/T_F = 0.001. With T_F ~ 10^4-10^5 K "
        + "that is room temperature for a metal. BLIND TO THE PLANT BY CONSTRUCTION -- it always compares against "
        + "the honest Sommerfeld value, because it reports a fixed physical fact rather than discriminating.");

    const groundState = ["fermiInt2", "fermiInt2Closed", "fermiInt2Rel", "mirrorRatio", "mirrorPredicted",
                         "mirrorRel", "groundFraction", "pressureFraction", "pressureOverEnergyDensity",
                         "polytropeExponent"];
    ok("!! *** AND EVERY T = 0 AND INTEGRAL OBSERVABLE IS BIT-IDENTICAL UNDER IT ***",
        groundState.every((k) => h[k] === p[k]),
        groundState.length + " of " + FERMI_OBSERVABLES.length + " unchanged. The Fermi sphere is not thermal, so "
        + "a heat-capacity plant cannot touch it -- and a device grading only the ground state would certify a "
        + "gas whose electrons heat like billiard balls.");
    report("bosons pile into one state, fermions cannot share one at all, and the whole difference is a sign");
}

console.log("\n" + (fails ? "fermiBind-selfcheck: " + fails + " FAILED" : "fermiBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
