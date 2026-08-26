// tools/roundhouse/paramagnetBind-selfcheck.mjs
//
// Run: node tools/roundhouse/paramagnetBind-selfcheck.mjs   (~0.2s MEASURED)
//
// THIS GRADES THE BIND, NOT THE PHYSICS. physics/statmech/paramagnet-selfcheck.mjs owns that.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THE PLANT IS EXACT AT SPIN-HALF. *** The Brillouin function
// reduces to tanh(y) ONLY for J = 1/2, so "every spin is spin-half" is not an error there -- it is the right
// answer, reached by a different expression. Measured 3.7e-16 apart, which is float noise on a formula that
// gets there through a difference of two coth terms. This file asserts that with a TOLERANCE and never with
// an equality: claiming bit-equality between two expressions for the same number is an overclaim that survives
// exactly until somebody changes a compiler.
//
// And the Schottky half cannot see the plant at all, because a two-level system has no J. That is not a gap in
// the plant, it is a statement that the bounded spectrum and the spin algebra are SEPARATE CLAIMS, each with its
// own evidence. Section 5 pins both halves.
"use strict";
import { paramagnetDevice, PARAMAGNET_OBSERVABLES } from "./paramagnetBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("paramagnetBind-selfcheck -- wired, live, and is the plant exact where the algebra says it must be?\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("paramagnet appears in DEVICE_NAMES", DEVICE_NAMES.includes("paramagnet"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("paramagnet");
    ok("!! the registry hands back THIS device", !!d && d.name === "brillouin-paramagnet-and-the-schottky-anomaly",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method", "the spin quantum number is ignored");
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = paramagnetDevice.build(paramagnetDevice.defaults());
    ok("!! no advertised observable is missing", PARAMAGNET_OBSERVABLES.every((k) => k in v),
        PARAMAGNET_OBSERVABLES.filter((k) => !(k in v)).join(", ") || PARAMAGNET_OBSERVABLES.length + " produced");
    ok("...and every one is finite", PARAMAGNET_OBSERVABLES.every((k) => finite(v[k])),
        PARAMAGNET_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => PARAMAGNET_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !PARAMAGNET_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. THE BRILLOUIN KEYS: AN IDENTITY AT SPIN-HALF AND A SLOPE EVERYWHERE ELSE");
{
    const v = paramagnetDevice.build({ config: {} });
    ok("!! B_{1/2}(y) IS tanh(y) -- to float noise, and asserted as such", v.halfIsTanhRel < 1e-14,
        "rel " + v.halfIsTanhRel.toExponential(3) + " -- NOT bit-identical, because Brillouin reaches it through "
        + "a difference of two coth terms. A tolerance is the honest assertion here.");
    ok("!! the small-y slope is the Curie slope (J+1)/(3J)", v.slopeHighJRel < 1e-5,
        "J = 5/2: measured " + v.slopeHighJ.toFixed(8) + " against predicted " + v.slopePredictedHighJ.toFixed(8)
        + ", rel " + v.slopeHighJRel.toExponential(3));
    ok("!! and the Curie constant is J(J+1)/3", Math.abs(v.curieConstantHalf - 0.25) < 1e-15
        && Math.abs(v.curieConstantHighJ - 35 / 12) < 1e-12,
        "J=1/2 -> " + v.curieConstantHalf + ", J=5/2 -> " + v.curieConstantHighJ.toFixed(8)
        + " -- chi = C/T, the fingerprint of independent moments; ising's chi diverges at T_c instead");
}

console.log("\n4. THE SCHOTTKY ANOMALY: TWO ROUTES TO A TRANSCENDENTAL, AND IT VANISHES AT BOTH ENDS");
{
    const v = paramagnetDevice.build({ config: {} });
    ok("!! the peak found by Newton and by an INDEPENDENT maximiser agree", v.schottkyPeakRel < 1e-7,
        "Newton " + v.schottkyNewton.toFixed(10) + " vs maximiser " + v.schottkyMaximise.toFixed(10)
        + ", rel " + v.schottkyPeakRel.toExponential(3) + " -- the same two-route shape as blackbody's Wien peak");
    ok("!! ...and x tanh(x/2) = 2 is satisfied there", v.schottkyResid < 1e-12,
        "residual " + v.schottkyResid.toExponential(3) + ", C_max/(Nk) = " + v.schottkyCmax.toFixed(8));
    ok("!! *** IT VANISHES AT BOTH ENDS -- THE BOUNDED SPECTRUM, WHICH IS THE LOAD-BEARING NEGATIVE ***",
        v.schottkyHot < 1e-4 && v.schottkyCold < 1e-5 && v.schottkyCmax > 0.4,
        "hot " + v.schottkyHot.toExponential(3) + ", peak " + v.schottkyCmax.toFixed(6) + ", cold "
        + v.schottkyCold.toExponential(3) + ". A gas absorbs energy without limit; a two-level system CANNOT -- "
        + "once both levels are equally populated it is full, and no hotter bath extracts more heat.");
    ok("!! the third law is honoured: S -> ln 2 hot, exactly 0 cold",
        v.entropyLn2Rel < 1e-4 && v.entropyCold < 1e-6,
        "S(hot) = " + v.entropyHot.toFixed(8) + " against ln 2 = " + Math.LN2.toFixed(8) + " (rel "
        + v.entropyLn2Rel.toExponential(3) + "), S(cold) = " + v.entropyCold.toExponential(3)
        + " -- unlike Sackur-Tetrode's classical gas, which goes NEGATIVE");
}

console.log("\n5. *** THE PLANT: FREE AT SPIN-HALF, CATASTROPHIC AT SPIN-5/2, INVISIBLE TO SCHOTTKY ***");
{
    const h = paramagnetDevice.build({ config: {} });
    const p = paramagnetDevice.build({ config: { planted: true } });

    ok("!! *** at J = 1/2 the plant costs NOTHING, because there it is the correct answer ***",
        Math.abs(h.bHalf - p.bHalf) / h.bHalf < 1e-14,
        "honest " + h.bHalf.toFixed(14) + " vs planted " + p.bHalf.toFixed(14) + " -- "
        + (Math.abs(h.bHalf - p.bHalf) / h.bHalf).toExponential(3) + " apart. A device that only ever probed "
        + "spin-half would certify this plant forever.");

    ok("!! *** at J = 5/2 it is catastrophic, and in TWO independent directions ***",
        Math.abs(p.bHighJ - h.bHighJ) / h.bHighJ > 0.5 && p.slopeHighJRel > 0.5
        && Math.abs(p.satHighJ - h.satHighJ) > 1e-2,
        "B: " + h.bHighJ.toFixed(8) + " -> " + p.bHighJ.toFixed(8) + " ("
        + (100 * Math.abs(p.bHighJ - h.bHighJ) / h.bHighJ).toFixed(1) + "% wrong); Curie slope "
        + h.slopeHighJ.toFixed(6) + " -> " + p.slopeHighJ.toFixed(6) + " against a prediction of "
        + h.slopePredictedHighJ.toFixed(6) + "; saturation " + h.satHighJ.toFixed(8) + " -> "
        + p.satHighJ.toFixed(8) + ". Slope and saturation are the small-y and large-y ends, and it fails at both.");

    const schottkyHalf = ["schottkyNewton", "schottkyMaximise", "schottkyPeakRel", "schottkyCmax",
                          "schottkyResid", "schottkyHot", "schottkyCold",
                          "entropyHot", "entropyLn2Rel", "entropyCold",
                          "curieConstantHalf", "curieConstantHighJ", "slopePredictedHighJ"];
    ok("!! ...and THIRTEEN observables are bit-identical, because a two-level system has no J",
        schottkyHalf.every((k) => h[k] === p[k]),
        schottkyHalf.length + " of " + PARAMAGNET_OBSERVABLES.length + " unchanged. The bounded spectrum and the "
        + "spin algebra are SEPARATE CLAIMS with separate evidence -- and this assertion is what notices if a "
        + "later round widens the plant until the Schottky half starts moving too.");
    report("ising's spins argue and order at T_c; these ignore each other, and the whole difference is that");
}

console.log("\n" + (fails ? "paramagnetBind-selfcheck: " + fails + " FAILED" : "paramagnetBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
