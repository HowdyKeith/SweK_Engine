// tools/roundhouse/chemicalPotentialBind-selfcheck.mjs
//
// Run: node tools/roundhouse/chemicalPotentialBind-selfcheck.mjs   (~0.4s MEASURED)
//
// THIS GRADES THE BIND. physics/thermal/chemicalPotential-selfcheck.mjs owns the physics.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THE ORDERING IS STRICT. *** Bose > classical > Fermi is not a
// numerical coincidence to be checked with a tolerance -- it IS the statistics, and the plant destroys it by
// COLLAPSING it to equality rather than by reversing it. So the ordering observables are booleans, and a
// tolerance-based check would have read the planted case as "very nearly ordered" and passed.
"use strict";
import { chemicalPotentialDevice, CHEMPOT_OBSERVABLES } from "./chemicalPotentialBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("chemicalPotentialBind-selfcheck -- three gases, one constraint, and a strict ordering\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("chemicalPotential appears in DEVICE_NAMES", DEVICE_NAMES.includes("chemicalPotential"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("chemicalPotential");
    ok("!! the registry hands back THIS device", !!d && d.name === "chemical-potential-three-gases-one-constraint",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method", "quantum statistics become Maxwell-Boltzmann");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = chemicalPotentialDevice.build(chemicalPotentialDevice.defaults());
    ok("!! no advertised observable is missing", CHEMPOT_OBSERVABLES.every((k) => k in v),
        CHEMPOT_OBSERVABLES.filter((k) => !(k in v)).join(", ") || CHEMPOT_OBSERVABLES.length + " produced");
    ok("...and every one is finite", CHEMPOT_OBSERVABLES.every((k) => finite(v[k])),
        CHEMPOT_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => CHEMPOT_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !CHEMPOT_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. *** THE ORDERING IS THE STATISTICS, AND TWO OF ITS THREE CONSTANTS ARE SIBLINGS' ***");
{
    const v = chemicalPotentialDevice.build({ config: {} });
    ok("!! mu changes sign at a DIFFERENT density for each gas: Bose > classical > Fermi",
        v.crossoverOrdered === 1,
        "zeta(3/2) = " + v.crossoverBose.toFixed(7) + " > " + v.crossoverClassical + " > eta(3/2) = "
        + v.crossoverFermi.toFixed(7) + ". crossoverBose is bec's criticalDensity and crossoverFermi is fermi's "
        + "etaDirichlet -- a claim three modules make together and none makes alone.");
    ok("!! ...and the fugacities order the same way at fixed density", v.fugacityOrdered === 1,
        "z_Fermi " + v.zFermi.toFixed(6) + " > z_classical " + v.zClassical.toFixed(6) + " > z_Bose "
        + v.zBose.toFixed(6) + " -- Pauli exclusion pushes mu UP, Bose attraction pulls it DOWN");
    ok("!! *** the Sommerfeld coefficient IS a Fermi integral in another module ***", v.sommerfeldJoinRel < 1e-10,
        "pi^2/12 = " + v.sommerfeldCoeff.toFixed(12) + " against fermi.fermiIntegral(2) = "
        + v.fermiIntegralAt2.toFixed(12) + ", rel " + v.sommerfeldJoinRel.toExponential(3)
        + ". A coefficient in a low-T expansion meeting a quadrature -- neither file was written to make that true.");
    ok("...and the computed mu(T)/E_F tracks the closed form", v.muSommerfeldRel < 1e-3,
        "computed " + v.muSommerfeldComputed.toFixed(8) + " against " + v.muSommerfeldClosed.toFixed(8));
}

console.log("\n4. *** THE PLANT COLLAPSES THE ORDERING RATHER THAN REVERSING IT ***");
{
    const h = chemicalPotentialDevice.build({ config: {} });
    const p = chemicalPotentialDevice.build({ config: { planted: true } });

    ok("!! classical statistics everywhere makes all three crossovers EQUAL",
        h.crossoverOrdered === 1 && p.crossoverOrdered === 0 && p.crossoverSpread === 0,
        "spread zeta(3/2) - eta(3/2) = " + h.crossoverSpread.toFixed(6) + " -> " + p.crossoverSpread
        + ". Maxwell-Boltzmann sees neither ceiling nor floor, so the strict inequality DEGENERATES rather than "
        + "inverting -- and a tolerance-based check would have called that 'very nearly ordered' and passed.");
    ok("!! ...and the three chemical potentials become one number",
        h.muBose !== h.muFermi && p.muBose === p.muClassical && p.muFermi === p.muClassical,
        "honest mu/kT: Bose " + h.muBose.toFixed(6) + ", classical " + h.muClassical.toFixed(6) + ", Fermi "
        + h.muFermi.toFixed(6) + " -> planted, all " + p.muClassical.toFixed(6));
    ok("!! ...and the cross-module KEY survives the plant, which is what makes it a key",
        h.sommerfeldCoeff === p.sommerfeldCoeff && h.sommerfeldJoinRel === p.sommerfeldJoinRel,
        "the Sommerfeld join is bit-identical: an answer key that moved with the thing it grades would not be one");
    report("classical statistics fail at low T, and this is the shape of the failure");
}

console.log("\n" + (fails ? "chemicalPotentialBind-selfcheck: " + fails + " FAILED" : "chemicalPotentialBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
