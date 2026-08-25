// tools/roundhouse/sackurTetrodeBind-selfcheck.mjs
//
// Run: node tools/roundhouse/sackurTetrodeBind-selfcheck.mjs   (~0.2s MEASURED)
//
// THIS GRADES THE BIND, NOT THE PHYSICS. physics/thermal/sackurTetrode-selfcheck.mjs owns that.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THE GIBBS PARADOX IS INVISIBLE TO A SINGLE BOX. *** Entropy per
// particle at one density is IDENTICAL with and without Stirling's 1/N!: the 5/2 constant, the zero-crossing at
// e^{5/2}, the exchange EOS all read the same. The paradox is a statement about how entropy SCALES, so it takes
// two sizes to see. Section 4 asserts those observables stay bit-identical under the plant, so that nobody later
// "improves" it into something a single-density check could catch -- which would make it a weaker plant and
// would also make it the wrong physics.
"use strict";
import { sackurTetrodeDevice, SACKUR_OBSERVABLES } from "./sackurTetrodeBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { NEG_ENTROPY_THRESHOLD, EXCHANGE_DENOM } from "../../physics/thermal/sackurTetrode.mjs";
import { criticalDensity } from "../../physics/thermal/bec.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("sackurTetrodeBind-selfcheck -- wired, live, and is the Gibbs plant blind where the physics says?\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("sackurTetrode appears in DEVICE_NAMES", DEVICE_NAMES.includes("sackurTetrode"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("sackurTetrode");
    ok("!! the registry hands back THIS device", !!d && d.name === "sackur-tetrode-and-the-gibbs-paradox",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method",
        "indistinguishable atoms become distinguishable -- a different physical treatment, same inputs and readings");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = sackurTetrodeDevice.build(sackurTetrodeDevice.defaults());
    ok("!! no advertised observable is missing", SACKUR_OBSERVABLES.every((k) => k in v),
        SACKUR_OBSERVABLES.filter((k) => !(k in v)).join(", ") || SACKUR_OBSERVABLES.length + " produced");
    ok("...and every one is finite", SACKUR_OBSERVABLES.every((k) => finite(v[k])),
        SACKUR_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => SACKUR_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !SACKUR_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. THE EXACT KEYS, AND A CONSTANT REACHED THROUGH A SIBLING MODULE");
{
    const v = sackurTetrodeDevice.build({ config: {} });
    ok("!! S/(Nk) = 5/2 EXACTLY at n*lambda^3 = 1", v.sackurAtUnity === 2.5,
        "not within a tolerance -- exactly. 3/2 from the translational ln T, plus 1 from the ln(V/N) that "
        + "Stirling's 1/N! puts there instead of ln V");
    ok("!! ...and the formula announces its own death: S = 0 at e^{5/2}", Math.abs(v.zeroCrossingS) < 1e-15,
        "S(" + NEG_ENTROPY_THRESHOLD.toFixed(6) + ") = " + v.zeroCrossingS.toExponential(3)
        + " -- a negative absolute entropy is impossible, so the classical gas is reporting it has left its domain");
    ok("!! the exchange corrections are EQUAL AND OPPOSITE about 1", v.eosSymmetryRel < 1e-15,
        "boson " + v.eosBoson.toFixed(8) + " (clustering, attraction) against fermion " + v.eosFermion.toFixed(8)
        + " (Pauli, repulsion), denominator 2^{5/2} = " + EXCHANGE_DENOM.toFixed(6)
        + ". THE SIGN IS THE ONLY THING THAT REMEMBERS WHICH GAS IT WAS.");

    ok("!! *** THE ALARM IS LATE, AND THE THRESHOLD COMES FROM bec, NOT FROM HERE ***",
        Math.abs(v.becThresholdPhi - criticalDensity()) < 1e-15 && v.sackurAtBecThreshold > 1 && v.lateAlarmFactor > 4,
        "bec condenses at zeta(3/2) = " + v.becThresholdPhi.toFixed(6) + " where Sackur-Tetrode still reads a "
        + "comfortable " + v.sackurAtBecThreshold.toFixed(6) + ", and does not go negative until "
        + NEG_ENTROPY_THRESHOLD.toFixed(4) + " -- " + v.lateAlarmFactor.toFixed(3) + "x later. THE FIRE STARTED "
        + "BEFORE THE ALARM, and the factor is computed from a sibling's constant rather than typed here.");
}

console.log("\n4. *** THE GIBBS PLANT: VISIBLE ONLY BY COMPARING TWO SIZES ***");
{
    const h = sackurTetrodeDevice.build({ config: {} });
    const p = sackurTetrodeDevice.build({ config: { planted: true } });

    ok("!! honestly the entropy is EXTENSIVE: doubling V and N doubles S, exactly",
        h.extensivityRel < 1e-15 && h.spuriousMixing === 0,
        "S(2V,2N) - 2 S(V,N) = " + h.spuriousMixing + " -- exactly zero, not nearly");
    ok("!! *** planted, it is not -- and the excess is EXACTLY the textbook 2N ln 2 ***",
        Math.abs(p.spuriousOverNln2 - 1) < 1e-12,
        "spurious = " + p.spuriousMixing.toFixed(6) + ", which is " + p.spuriousOverNln2.toFixed(12)
        + " x 2N ln 2. The entropy of mixing a gas WITH ITSELF -- Gibbs's paradox, and dropping 1/N! is exactly "
        + "how you get it.");
    ok("...and the observable reads 0 nominal, 1 planted rather than inverting",
        h.spuriousOverNln2 === 0 && p.spuriousOverNln2 > 0.99,
        "an observable whose meaning flips between nominal and planted is a trap for whoever reads the census");

    const singleBox = ["sackurAtUnity", "zeroCrossingS", "eosBoson", "eosFermion", "eosSymmetryRel",
                       "becThresholdPhi", "sackurAtBecThreshold", "lateAlarmFactor"];
    ok("!! *** AND EVERY SINGLE-DENSITY OBSERVABLE IS BIT-IDENTICAL -- THE PARADOX NEEDS TWO SIZES ***",
        singleBox.every((k) => h[k] === p[k]),
        singleBox.length + " of " + SACKUR_OBSERVABLES.length + " unchanged. Entropy PER PARTICLE at one density "
        + "cannot see this: the paradox is about how entropy SCALES. A device that looked at one box would "
        + "certify a gas whose entropy is not extensive, and that is the whole reason to assert this.");
    report("bec and fermi both collapse onto this gas when hot and thin -- wiring it first gives them an "
        + "independent key, the same service blackbody did for debye");
}

console.log("\n" + (fails ? "sackurTetrodeBind-selfcheck: " + fails + " FAILED" : "sackurTetrodeBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
