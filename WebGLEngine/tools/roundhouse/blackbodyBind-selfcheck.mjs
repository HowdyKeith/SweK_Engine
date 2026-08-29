// tools/roundhouse/blackbodyBind-selfcheck.mjs
//
// Run: node tools/roundhouse/blackbodyBind-selfcheck.mjs   (~0.6s MEASURED -- two builds, each two quadratures)
//
// THIS GRADES THE BIND, NOT THE PHYSICS. physics/thermal/blackbody-selfcheck.mjs owns the physics: the Wien
// roots by two routes, the Gamma(s)zeta(s) identity across three modules, sigma and b against published CODATA.
// What can go wrong HERE is different, and it is what binds in this tree have actually got wrong before -- a
// device exported but never registered, an observable advertised and never produced, or a plant credited with
// moving something it cannot move.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THE PLANT IS NARROW. *** Thirteen of sixteen observables are
// BIT-IDENTICAL under it, and that is the point rather than a gap: sigma and Wien's b are built from the
// WAVELENGTH root alone and the Bose integrals touch neither peak, so a plant that moved them would be a plant
// too broad to localise anything. Section 4 asserts the blindness explicitly, so that if somebody ever widens
// the plant into something cruder, the loss of that property is visible instead of silent -- the same reason
// bellBind-selfcheck pins its own designed-not-to-move observable.
"use strict";
import { blackbodyDevice, BLACKBODY_OBSERVABLES } from "./blackbodyBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { wienRootNewton } from "../../physics/thermal/blackbody.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("blackbodyBind-selfcheck -- is the device wired, live, and does its plant bite ONLY where it should?\n");

console.log("1. *** REGISTERED AND REACHABLE THROUGH THE REGISTRY, NOT MERELY EXPORTED ***");
{
    ok("blackbody appears in DEVICE_NAMES", DEVICE_NAMES.includes("blackbody"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("blackbody");
    ok("!! and the registry hands back THIS device", !!d && d.name === "blackbody-wien-and-the-bose-identity",
        d ? d.name : "nothing");
    ok("it declares its plant kind", d.plantKind === "reader",
        "READER: the spectrum is untouched and no input produces the failure -- only how one number is read off "
        + "another. v3400's kind, and the census cannot classify what is not declared.");
    report("a bind exported but never registered runs in its own gate and nowhere else -- v3330's failure");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS ACTUALLY PRODUCED, AND IS A NUMBER");
{
    const v = blackbodyDevice.build(blackbodyDevice.defaults());
    const missing = BLACKBODY_OBSERVABLES.filter((k) => !(k in v));
    ok("!! no advertised observable is missing from the build", missing.length === 0,
        missing.length ? "MISSING: " + missing.join(", ") : BLACKBODY_OBSERVABLES.length + " produced");
    const notFinite = BLACKBODY_OBSERVABLES.filter((k) => !finite(v[k]));
    ok("...and every one is finite", notFinite.length === 0, notFinite.join(", ") || "all finite");
    const extra = Object.keys(v).filter((k) => !BLACKBODY_OBSERVABLES.includes(k));
    ok("...and nothing is produced that was never advertised", extra.length === 0,
        extra.join(", ") || "the list and the build agree in both directions");
}

console.log("\n3. THE TWO-ROUTE AGREEMENTS HOLD, WHICH IS WHAT MAKES THE OBSERVABLES KEYS RATHER THAN OUTPUTS");
{
    const v = blackbodyDevice.build(blackbodyDevice.defaults());
    ok("!! the Wien WAVELENGTH root and an independent maximiser agree", v.wienLambdaAgreeRel < 1e-7,
        "Newton on x - 5(1 - e^-x) vs golden-section on x^5/(e^x-1): rel " + v.wienLambdaAgreeRel.toExponential(3)
        + ". One solves the stationarity condition, the other never forms it.");
    ok("!! the Wien FREQUENCY root and its maximiser agree", v.wienNuAgreeRel < 1e-7,
        "rel " + v.wienNuAgreeRel.toExponential(3));
    ok("!! quadrature meets Gamma(s)zeta(s) at s=4", v.bose4Rel < 1e-10,
        "rel " + v.bose4Rel.toExponential(3) + " -- zeta from physics/zeta.js and Gamma from md/maxwellSpeed.mjs, "
        + "so THREE MODULES meet on a number none of them alone computes");
    ok("!! ...and at s=3, Apery's constant", v.bose3Rel < 1e-10, "rel " + v.bose3Rel.toExponential(3));
    // *** v4136 -- THE exitanceQuarticRel CHECK IS GONE BECAUSE v4055 DELETED THE OBSERVABLE, ON PURPOSE. ***
    // Its own note is the argument: exitance(T) is sigma*T^4, so exitance(tHi)/exitance(tLo) IS pow(tHi/tLo,4)
    // algebraically -- sigma cancels and so does the exponent, because the 4 is on both sides. What was left
    // graded IEEE754, not physics. The device dropped it and tLo/tHi with it; THIS FILE KEPT READING IT, so
    // `v.exitanceQuarticRel.toExponential(3)` threw and the gate has hard-crashed on every run since v4055 --
    // reaching Keith as a stack trace where a verdict should have been. Not re-implemented: restoring the
    // observable would restore the tautology v4055 spent a round arguing away.
    report("not one reference value is typed in the bind. The selfcheck beside it owns the CODATA comparison; a "
        + "device carrying its own copy of 5.670374419e-8 would be a second declaration of a number.");
}

console.log("\n4. *** THE PLANT MOVES EXACTLY THREE OBSERVABLES, AND THE OTHER THIRTEEN ARE ITS BLIND PARTNERS ***");
{
    const h = blackbodyDevice.build({ config: {} });
    const p = blackbodyDevice.build({ config: { planted: true } });
    const moved = BLACKBODY_OBSERVABLES.filter((k) => h[k] !== p[k]);
    const still = BLACKBODY_OBSERVABLES.filter((k) => h[k] === p[k]);

    ok("!! *** the plant fires: lambda*nu = c reads the frequency peak as the wavelength peak ***",
        Math.abs(p.wienNuRoot - wienRootNewton(5)) < 1e-12 && Math.abs(h.wienNuRoot - wienRootNewton(3)) < 1e-12,
        "planted x_nu = " + p.wienNuRoot.toFixed(10) + " (the WAVELENGTH root) against the true "
        + h.wienNuRoot.toFixed(10) + ". The peak of a distribution depends on whether you bin in d(lambda) or "
        + "d(nu), and the Jacobian reshapes it.");
    ok("!! ...and peakProductRatio goes to EXACTLY 1, which is the mistake stated as a number",
        Math.abs(p.peakProductRatio - 1) < 1e-12 && Math.abs(h.peakProductRatio - 0.5682526605) < 1e-9,
        "honest " + h.peakProductRatio.toFixed(10) + " -> planted " + p.peakProductRatio.toFixed(10)
        + ". THE NUMBER THAT IS NOT ONE is the whole finding.");
    ok("!! ...and the frequency two-route agreement COLLAPSES, so the pair is what notices",
        h.wienNuAgreeRel < 1e-7 && p.wienNuAgreeRel > 0.5,
        "rel " + h.wienNuAgreeRel.toExponential(3) + " -> " + p.wienNuAgreeRel.toFixed(4)
        + ". The maximiser is untouched by the misreading, so the two routes separate.");

    ok("!! EXACTLY THREE observables move -- a plant that moved everything would localise nothing",
        moved.length === 3, "moved: " + moved.join(", "));
    // *** AND THIS LIST CARRIED THE DEAD KEY TOO, WHERE IT PASSED VACUOUSLY. *** h.exitanceQuarticRel and
    // p.exitanceQuarticRel were BOTH undefined, and undefined === undefined is true -- so a check advertising
    // seven bit-identical observables was really asserting six and getting a free pass on the seventh. That is
    // worse than the crash, because a crash announces itself. The list is now checked to EXIST before it is
    // checked to MATCH, so deleting an observable can never again quietly hollow out the check that named it.
    const blind = ["sigma", "wienB", "bose4Rel", "bose3Rel", "bose4Quad", "bose3Quad"];
    ok("!! every observable this check names is one the device actually PRODUCES",
        blind.every((k) => k in h && k in p),
        "guards against undefined === undefined -- " + (blind.filter((k) => !(k in h)).join(", ") || "all " + blind.length + " present"));
    ok("!! ...and sigma, Wien's b and BOTH Bose integrals are BIT-IDENTICAL under it",
        blind.every((k) => h[k] === p[k]),
        still.length + " of " + BLACKBODY_OBSERVABLES.length + " unchanged. sigma and b are built from the "
        + "WAVELENGTH root alone and the integrals touch neither peak -- THIS IS A PROPERTY, NOT A GAP, and it "
        + "is asserted so that widening the plant into something cruder cannot happen silently.");
}

console.log("\n" + (fails ? "blackbodyBind-selfcheck: " + fails + " FAILED" : "blackbodyBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
