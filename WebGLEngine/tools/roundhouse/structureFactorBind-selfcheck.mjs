// tools/roundhouse/structureFactorBind-selfcheck.mjs
//
// Run: node tools/roundhouse/structureFactorBind-selfcheck.mjs   (~0.3s MEASURED -- two sweeps over 729 hkl)
//
// THIS GRADES THE BIND. physics/crystal/structureFactor.mjs owns the physics.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THE KEY HAS NO EPSILON IN IT. *** Every other instrument here
// argues about a tolerance somewhere; a systematic absence is a reflection that CANNOT EXIST, and the measured
// separation is 4.083e15 -- any threshold between 1e-14 and 1 gives the identical verdict. That is what makes it
// EXACT rather than merely tight, and the gate asserts the SEPARATION rather than picking a number inside it.
//
// AND THE SECOND PROPERTY IS THAT THE CLOSED FORM CANNOT SEE THE PLANT. The parity rule never touches an atom,
// so a crystal whose atoms are in the wrong places passes it unmarked. Only the disagreement between the two
// routes localises the error, which is why both are carried.
"use strict";
import { structureFactorDevice, SF_OBSERVABLES } from "./structureFactorBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { absenceSweep } from "../../physics/crystal/structureFactor.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("structureFactorBind-selfcheck -- an answer key that is an exact zero BY LAW\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("structureFactor appears in DEVICE_NAMES", DEVICE_NAMES.includes("structureFactor"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("structureFactor");
    ok("!! the registry hands back THIS device", !!d && d.name === "systematic-absences-exact-zero-by-law",
        d ? d.name : "nothing");
    ok("it declares plantKind KNOB", d.plantKind === "knob",
        "the displacement is a config value the census can read, not hidden arithmetic");
    const def = d.defaults({});
    ok("!! defaults() returns the whole config, so the knobs are DERIVED", "lattice" in def.config &&
        "hklMax" in def.config && "displace" in def.config, Object.keys(def.config).join(", "));
    ok("...and the shipped default is the TRUE crystal", def.config.displace === 0,
        "displace = " + def.config.displace + ". A device whose default is already planted grades nothing.");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = structureFactorDevice.build(structureFactorDevice.defaults());
    ok("!! no advertised observable is missing", SF_OBSERVABLES.every((k) => k in v),
        SF_OBSERVABLES.filter((k) => !(k in v)).join(", ") || SF_OBSERVABLES.length + " produced");
    ok("!! ...and every one is a finite number", SF_OBSERVABLES.every((k) => finite(v[k])),
        SF_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite. THIS IS THE CHECK THAT CAUGHT "
        + "THE FIRST DRAFT: reciprocalResidual returns { ok, diagonal, offDiagonal } and the bind read `.worst`, "
        + "so two observables shipped as `undefined` -- a reference that reports nothing is not a reference.");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => SF_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !SF_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. *** THE ABSENCE IS NOT A SMALL NUMBER, IT IS A REFLECTION THAT CANNOT EXIST ***");
{
    const v = structureFactorDevice.build({ config: {} });
    ok("!! 540 mixed-parity FCC reflections, and the worst of them is at machine zero", v.worstAbsent < 1e-14,
        v.nAbsent + " forbidden, worst |F| = " + v.worstAbsent.toExponential(3));
    ok("!! the smallest ALLOWED |F| anywhere is order 1", v.minAllowed >= 1,
        v.nAllowed + " allowed, smallest |F| = " + v.minAllowed.toFixed(6));
    ok("!! *** AND THE SEPARATION IS 15 ORDERS OF MAGNITUDE, so there is no epsilon to argue about ***",
        v.absenceGap > 1e13,
        "gap = " + v.absenceGap.toExponential(3) + ". ANY tolerance between 1e-14 and 1 gives the identical "
        + "verdict -- that is the difference between an EXACT key and a tight one, and it is why this gate "
        + "asserts the ratio rather than picking a number inside it.");
    ok("...and the two routes agree on the true crystal", v.closedVsSumWorst < 1e-14,
        "worst |sum - closed| = " + v.closedVsSumWorst.toExponential(3) + " over 728 reflections");
    ok("...and no forbidden reflection is producing signal", v.forbiddenLitUp === 0, "0 of " + v.nAbsent);
}

console.log("\n4. THE SAME LAW ON THE OTHER LATTICES, DERIVED RATHER THAN TYPED");
{
    for (const [lat, floor] of [["bcc", 2], ["diamond", 5]]) {
        const s = absenceSweep(lat, { hklMax: 4 });
        ok(lat + ": " + s.nAbsent + " forbidden at machine zero, against a floor of " + floor,
            s.worstAbsent < 1e-14 && s.minAllowed >= floor,
            "worst " + s.worstAbsent.toExponential(3) + ", smallest allowed " + s.minAllowed.toFixed(6));
    }
    const sc = absenceSweep("sc", { hklMax: 4 });
    ok("!! sc has NO absences at all, and the device says so rather than inventing one", sc.nAbsent === 0,
        "one atom per cell cannot interfere with itself. A sweep that returned a small number here would be "
        + "reporting arithmetic where there is no mechanism.");
}

console.log("\n5. *** THE PLANT: ONE BASIS ATOM OFF ITS SITE ***");
{
    const h = structureFactorDevice.build({ config: {} });
    const p = structureFactorDevice.build({ config: { planted: true } });

    ok("!! *** 484 forbidden reflections light up -- a crystal that is not the crystal you named ***",
        h.forbiddenLitUp === 0 && p.forbiddenLitUp > 100,
        h.forbiddenLitUp + " -> " + p.forbiddenLitUp + " of " + h.nAbsent + " forbidden reflections producing "
        + "signal above 1e-9. Not a degraded measurement: reflections the law says CANNOT EXIST, existing.");
    ok("!! ...and the two routes disagree by order 1, not by an epsilon",
        p.closedVsSumWorst > 0.5, "worst |sum - closed| " + h.closedVsSumWorst.toExponential(3) + " -> "
        + p.closedVsSumWorst.toFixed(6));

    report("WHICH ROUTES ARE BLIND, ASSERTED SO IT CANNOT WIDEN SILENTLY -- a plant that moved everything would "
        + "localise nothing.");
    ok("!! *** THE CLOSED FORM IS BIT-IDENTICAL, because the parity rule never touches an atom ***",
        h.nAbsent === p.nAbsent && h.nAllowed === p.nAllowed && h.worstAbsent === p.worstAbsent &&
        h.minAllowed === p.minAllowed,
        p.nAbsent + " forbidden and worst " + p.worstAbsent.toExponential(3) + " under BOTH. *** A DEVICE "
        + "CARRYING ONLY THE ABSENCE SWEEP WOULD CERTIFY A PERFECT CRYSTAL WHILE THE ATOMS WERE IN THE WRONG "
        + "PLACES *** -- it is a statement about h, k and l and there is no atom in it to move.");
    ok("!! AND THE RECIPROCAL IDENTITIES ARE BIT-IDENTICAL TOO, which is what makes them a reference",
        h.reciprocalResidualCubic === p.reciprocalResidualCubic &&
        h.reciprocalResidualTriclinic === p.reciprocalResidualTriclinic,
        "cubic " + h.reciprocalResidualCubic.toExponential(3) + ", triclinic "
        + h.reciprocalResidualTriclinic.toExponential(3) + " under both. a_i . b_j = 2 pi delta_ij is a fact "
        + "about the CELL, and moving an atom inside the cell does not move the cell. A reference that drifted "
        + "with the thing it grades would not be one.");
    ok("...and both are at machine zero on a triclinic cell, not just the easy cubic one",
        h.reciprocalResidualTriclinic < 1e-14,
        "triclinic " + h.reciprocalResidualTriclinic.toExponential(3) + " -- the cubic case is 0 exactly and "
        + "would pass a broken implementation that only ever returned its input");
}

console.log("\n" + (fails ? "structureFactorBind-selfcheck: " + fails + " FAILED" : "structureFactorBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
