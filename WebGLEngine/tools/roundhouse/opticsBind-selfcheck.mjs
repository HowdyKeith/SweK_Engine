// tools/roundhouse/opticsBind-selfcheck.mjs -- v3759
//
// *** THIS DEVICE HAD NO GATE OF ITS OWN, AND THE FIRST THING THAT FELL OUT WAS NOT A WEAK KEY BUT DEAD CODE.
// `fresnelNumber` and `nearFarRms` have been DECLARED OBSERVABLES since the device was written, and EVERY ONE
// of its three modes returned before reaching them -- airy at line 73, slit at 90, edge at 122. Measured on the
// shipped build: ALL THREE MODES REPORTED BOTH AS `undefined`. The code existed, was correct, and simply could
// not be got to. NOTHING FAILED, because nothing asks a device to produce every observable it declares. ***
//
// *** THE FRAUNHOFER HALF WAS ALREADY WELL KEYED and is left alone: the Airy first ring against j(1,1)/pi, the
// single-slit first minimum at exactly lambda/a, and the knife-edge shadow at exactly 0.25 from C(0)=S(0)=0.
// THE FRESNEL HALF HAD NO KEY AT ALL -- which is the half that was unreachable. ***

import { opticsDevice, OPTICS_OBSERVABLES } from "./opticsBind.mjs";
import { AIRY_FIRST_RING, J1_FIRST_ZERO } from "../../physics/optics/airyRefined.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const build = opticsDevice.build;

// ---- 1. EVERY DECLARED OBSERVABLE IS REACHABLE -------------------------------------------------------------
console.log("1. A DECLARED OBSERVABLE NO MODE PRODUCES IS A CLAIM NOTHING BACKS");
{
    const produced = new Set();
    for (const mode of opticsDevice.modes) {
        const o = await build({ mode });
        for (const k of Object.keys(o)) if (o[k] !== undefined) produced.add(k);
    }
    const missing = OPTICS_OBSERVABLES.filter((k) => !produced.has(k));
    ok("!! *** EVERY OBSERVABLE THIS DEVICE DECLARES IS PRODUCED BY SOME MODE ***",
        missing.length === 0,
        opticsDevice.modes.length + " modes cover " + produced.size + " observables. *** BEFORE v3759 " +
        "`fresnelNumber` AND `nearFarRms` WERE PRODUCED BY NOTHING: all three modes returned early and the " +
        "block computing them was unreachable. THE CODE WAS CORRECT AND COULD NOT BE GOT TO ***" +
        (missing.length ? "   STILL MISSING: " + missing.join(", ") : ""));
    ok("the new mode is in the device's own declared list, not just reachable by luck",
        opticsDevice.modes.includes("converge"),
        "a mode a caller can only find by reading the source is the LOWER BOUND problem this device already " +
        "hit twice (v3192)");
}

// ---- 2. THE KEY THE FRESNEL HALF NEVER HAD -----------------------------------------------------------------
console.log("\n2. THE FRAUNHOFER LIMIT IS APPROACHED QUADRATICALLY IN THE FRESNEL NUMBER");
{
    const rows = [];
    for (const z of [500, 2000, 20000]) {
        const o = await build({ mode: "converge", config: { z } });
        rows.push({ N: o.fresnelNumber, rms: o.nearFarRms });
    }
    // *** GRADE THE SCALING, NOT THE VALUE (v3723). "the residual gets smaller" is satisfied by anything that
    // decays; the EXPONENT is the claim, and it is derived from consecutive pairs rather than fitted. ***
    const exps = [];
    for (let i = 1; i < rows.length; i++) {
        exps.push(Math.log(rows[i - 1].rms / rows[i].rms) / Math.log(rows[i - 1].N / rows[i].N));
    }
    ok("!! *** nearFarRms FALLS AS N SQUARED, MEASURED ACROSS TWO DECADES ***",
        exps.every((e) => Math.abs(e - 2) < 0.05),
        "N " + rows.map((r) => r.N.toExponential(1)).join(" -> ") + "   rms " +
        rows.map((r) => r.rms.toExponential(3)).join(" -> ") + "   exponents " +
        exps.map((e) => e.toFixed(4)).join(", ") + ". *** N FALLS 4x AND THE RESIDUAL FALLS 16x; N FALLS 10x " +
        "AND IT FALLS 100x. A LIMIT IS APPROACHED, NEVER EVALUATED -- so the claim is the RATE, which a device " +
        "that merely decayed would fail ***");
    ok("!! and the residual is still NON-ZERO at the largest N -- the limit is approached, not reached",
        rows[0].rms > 0 && rows[rows.length - 1].rms > 0,
        "asserting only that it shrinks would be satisfied by a near field that had collapsed to the far field " +
        "exactly, which would mean the Fresnel path was not being computed at all");
}

// ---- 2b. v4032 -- WHAT THIS MODE COSTS, AND WHY IT IS THE RECIPROCAL OF WHAT IT MEASURES -------------------
console.log("\n2b. *** THE COST OF THE CONVERGE MODE IS EXACTLY 1/F, THE NUMBER IT REPORTS ***");
{
    // fresnelCS sets its Simpson step count from the argument, n = 400*v^2, and its own comment argues for
    // that correctly: the integrand oscillates as t^2, so a fixed step loses accuracy where the physics is
    // interesting. The sweep then fixes v -- and the arithmetic closes exactly.
    //     x = 3*lambda*z/a,  v = x*sqrt(2/(lambda z)) = 3*sqrt(2*lambda*z)/a,  v^2 = 18*lambda*z/a^2 = 18/F
    //     n = 400*v^2 = 7200/F
    const rows = [];
    for (const z of [500, 2000, 20000]) rows.push(await build({ mode: "converge", config: { z } }));
    ok("!! *** THE REPORTED COST IS 7200/F PER CALL, DERIVED AND NOT FITTED ***",
        rows.every((r) => r.quadratureEvals === 2 * 161 * Math.max(64, Math.ceil(7200 / r.fresnelNumber))),
        rows.map((r) => "F=" + r.fresnelNumber.toExponential(1) + " -> " + r.quadratureEvals.toExponential(3)).join("  ") +
        ". *** THIS MODE EXISTS TO PUSH THE NEAR FIELD TOWARD THE FAR FIELD, WHICH MEANS F -> 0, AND ITS COST " +
        "IS 1/F. IT GETS MORE EXPENSIVE PRECISELY AS IT APPROACHES THE LIMIT IT IS TESTING. ***");
    ok("!! the cost RISES as the residual FALLS, which is the same sweep read twice",
        rows[0].quadratureEvals < rows[2].quadratureEvals && rows[0].nearFarRms > rows[2].nearFarRms,
        "z 500 -> 20000: cost " + rows[0].quadratureEvals.toExponential(2) + " -> " +
        rows[2].quadratureEvals.toExponential(2) + ", residual " + rows[0].nearFarRms.toExponential(3) + " -> " +
        rows[2].nearFarRms.toExponential(3) + ". Section 2 grades the residual; this grades what it costs to " +
        "get it, and they are the same numbers.");
    ok("!! *** AND THE COST IS REPORTED, NEVER REFUSED ***",
        rows.every((r) => !r.error && typeof r.nearFarRms === "number"),
        "a 1e9-evaluation ceiling went in here first and REFUSED SECTION 2'S OWN SWEEP -- z = 20000 is F = 1e-3 " +
        "and 2.32e9 evaluations. The mode is expensive in exactly the direction its key must travel, so any " +
        "ceiling low enough to protect a caller is low enough to cut off the physics. A COST POLICY DOES NOT " +
        "BELONG INSIDE A PHYSICS DEVICE: the bound is knobLiveness's, and what belongs here is the number.");
}

// ---- 3. THE FRAUNHOFER KEYS, AND WHERE THE CONSTANT COMES FROM --------------------------------------------
console.log("\n3. THE KEYS THAT WERE ALREADY THERE, AND ONE THAT IS TYPED");
{
    const a = await build({ mode: "airy" }), s = await build({ mode: "slit" }), e = await build({ mode: "edge" });
    ok("!! the Airy first ring, the slit first minimum and the knife-edge shadow all hold",
        a.airyRingErrFrac < 1e-4 && s.slitFirstMinErrFrac < 1e-4 && Math.abs(e.edgeShadowIntensity - 0.25) < 1e-9,
        "airy " + a.airyRingErrFrac.toExponential(2) + ", slit " + s.slitFirstMinErrFrac.toExponential(2) +
        ", edge shadow " + e.edgeShadowIntensity.toFixed(6) + " (exactly 1/4 from C(0)=S(0)=0)");

    // *** J1_FIRST_ZERO IS A TYPED LITERAL, AND A TYPED REFERENCE VALUE IS THE ONE THING THESE NOTES FORBID.
    // It is not derivable in closed form -- but it IS computable, so it can be CORROBORATED. Bisected here on
    // J1 from its own power series, WHICH SHARES NO CODE WITH airyRefined.mjs: 3.8317059702075120 against the
    // typed 3.8317059702075125, a relative difference of 1.16e-16 -- ONE ULP. THE CONSTANT SURVIVES, and the
    // point of saying so is that nobody has to take it on trust again. ***
    const J1 = (x) => { let sum = 0;
        for (let k = 0; k < 60; k++) { let f1 = 1, f2 = 1;
            for (let i = 2; i <= k; i++) f1 *= i;
            for (let i = 2; i <= k + 1; i++) f2 *= i;
            sum += Math.pow(-1, k) / (f1 * f2) * Math.pow(x / 2, 2 * k + 1); }
        return sum; };
    let lo = 3.0, hi = 4.5;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (J1(lo) * J1(mid) <= 0) hi = mid; else lo = mid; }
    const derived = (lo + hi) / 2;
    ok("!! *** THE TYPED BESSEL ZERO IS CORROBORATED BY AN INDEPENDENT DERIVATION, TO ONE ULP ***",
        Math.abs(derived - J1_FIRST_ZERO) / J1_FIRST_ZERO < 1e-15 &&
        Math.abs(derived / Math.PI - AIRY_FIRST_RING) / AIRY_FIRST_RING < 1e-15,
        "series bisection " + derived.toFixed(16) + " vs typed " + J1_FIRST_ZERO.toFixed(16) + " -- relative " +
        (Math.abs(derived - J1_FIRST_ZERO) / J1_FIRST_ZERO).toExponential(3) + ". TWO ROUTES SHARING NO CODE");
}

// ---- 4. THE PLANT (v3760) ----------------------------------------------------------------------------------
console.log("\n4. THE MISTAKE THE API INVITES, AND THE KEY CATCHES IT");
{
    const honest = await build({ mode: "airy" });
    const planted = await build({ mode: "radiusconfusion" });
    ok("!! *** HANDING THE RADIUS WHERE THE DIAMETER BELONGS DOUBLES THE RING, AND THE KEY SEES IT ***",
        Math.abs(planted.rayleighFactor / honest.rayleighFactor - 2) < 1e-3 &&
        planted.airyRingErrFrac > 0.9 && honest.airyRingErrFrac < 1e-4,
        "rayleighFactor " + honest.rayleighFactor.toFixed(6) + " -> " + planted.rayleighFactor.toFixed(6) +
        " (EXACTLY 2x), airyRingErrFrac " + honest.airyRingErrFrac.toExponential(3) + " -> " +
        planted.airyRingErrFrac.toExponential(3) + " -- A SEPARATION OF " +
        (planted.airyRingErrFrac / honest.airyRingErrFrac).toExponential(2) + "x. *** THIS IS THE MISTAKE THE " +
        "API INVITES, not one invented to be caught: every text writes the first ring as 1.22*lambda/D and half " +
        "the literature states the same aperture by its RADIUS, while circularNumeric's first argument is a " +
        "DIAMETER and nothing in the call says so ***");
    ok("!! the plant changes ONE side, not both -- the normalisation still divides by lambda/D",
        Math.abs(planted.rayleighFactor - 2 * honest.rayleighFactor) < 1e-3,
        "a caller making this mistake makes it in ONE place. A plant that changed both sides would CANCEL and " +
        "prove nothing -- v3733's first absolute key did exactly that");
    ok("!! and the device DECLARES the plant, so plantedCoverage can find it",
        opticsDevice.plantMode === "radiusconfusion" && opticsDevice.plantFlips === "airyRingErrFrac" &&
        opticsDevice.plantKind === "mode" && opticsDevice.modes.includes("radiusconfusion"),
        "airyRingErrFrac is reported by the PRIMARY mode too, which the MODE-PLANT CONTRACT requires: an " +
        "observable living only in the plant's own branch reads DECLARED BUT DEAD");
}

report("WHAT THIS DOES NOT CLAIM",
    "That N-squared is the textbook rate for every aperture. It is MEASURED on this slit at these distances -- " +
    "the exponent comes out 2.00 across two decades, which is a fact about this device's Fresnel path and not " +
    "a theorem quoted from anywhere. *** AND THE LINE THAT USED TO END THIS REPORT SAID THE DEVICE HAD NO " +
    "DECLARED PLANT AND ITS KEYS WERE UNPROVEN. v3760 SHIPPED ONE (section 4) AND THE LINE IS CORRECTED IN " +
    "THE SAME EDIT RATHER THAN LEFT TO ROT -- a stale not-claimed line is the most expensive kind, because it " +
    "reads as a deliberate boundary. *** WHAT IS STILL TRUE: the plant proves airyRingErrFrac catches an " +
    "aperture error; it says NOTHING about whether the slit, edge or converge keys would catch their own.");

console.log("\nopticsBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
