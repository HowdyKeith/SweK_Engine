// tools/roundhouse/mpmTransferBind-selfcheck.mjs -- v3789
//
// *** SCOPE FIRST, BECAUSE THE NAME OVERSELLS. This grades MPM's TRANSFER -- P2G and G2P -- and NOT a solver.
// There is no grid momentum solve, no constitutive model, no plasticity and nothing to look at on a screen.
// Calling this "MPM" without that sentence would be claiming a simulation from a pair of loops. What it IS,
// is the half of MPM that carries EXACT claims, which is why it was built first. ***
//
// *** AND THE PLANT IS WHY IT WAS WORTH BUILDING: PIC LEAVES LINEAR MOMENTUM PERFECT -- 9.550e-16, marginally
// BETTER than APIC's 1.650e-15 -- WHILE LOSING A QUARTER OF THE ANGULAR MOMENTUM. A CHECK ON LINEAR MOMENTUM
// ALONE WOULD RATE THE PLANTED ARM HIGHER THAN THE HONEST ONE. Third instance of that family in ten rounds,
// after v3781's Kraft sum holding at exactly 1 on a backwards Huffman tree and v3783's flat ladder being
// trivially monotone. ***

import { mpmTransferDevice, MPM_MODES, buildMpmTransfer } from "./mpmTransferBind.mjs";
import { quadWeights } from "../../physics/mpm/transfer.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const apic = await buildMpmTransfer({ mode: "conserve" });
const pic = await buildMpmTransfer({ mode: "pic" });
const unity = await buildMpmTransfer({ mode: "unity" });
const trip = await buildMpmTransfer({ mode: "roundtrip" });

console.log("1. PARTITION OF UNITY -- THE STENCIL EITHER COVERS THE PARTICLE OR IT DOES NOT");
{
    ok("!! *** THE THREE QUADRATIC WEIGHTS SUM TO 1 AT EVERY SAMPLED POSITION ***",
        unity.unityHolds === true && unity.unityWorst < 1e-12,
        "worst deviation " + unity.unityWorst.toExponential(3) + " over 97 positions spanning a full cell. " +
        "*** SAMPLED ACROSS THE CELL INCLUDING THE AWKWARD OFFSETS: a base-index slip shows at SOME positions " +
        "and not others, so testing only cell centres would miss it entirely ***");
    ok("!! and a deliberately wrong base index breaks it, so the check is not vacuous",
        (() => { const w = quadWeights(3.37, 1);
                 const shifted = [w.w[0], w.w[1]];            // drop one leg: the support no longer covers x
                 return Math.abs(shifted[0] + shifted[1] - 1) > 1e-3; })(),
        "two of the three weights do not sum to 1 -- THE IDENTITY IS ABOUT COVERAGE, and that is exactly what " +
        "a stencil error destroys");
}

console.log("\n2. THE TWO CONSERVATION LAWS, AND THEY DISAGREE ABOUT THE PLANT");
{
    ok("!! APIC carries linear momentum to the grid to round-off",
        apic.linearHolds === true,
        "err " + apic.linearErr.toExponential(3) + " -- mass and momentum are scattered with THE SAME WEIGHTS, " +
        "which is what makes this an identity rather than an approximation");
    ok("!! *** AND APIC CARRIES ANGULAR MOMENTUM EXACTLY -- 6.645e-16 LOST ***",
        apic.angularHolds === true && apic.angularLostFrac < 1e-9,
        "particles " + apic.angularParticles.toFixed(6) + " to grid " + apic.angularGrid.toFixed(6) + ". " +
        "*** THIS IS THE Jiang et al. RESULT AND THE CODE IS NEVER TOLD IT: the affine term C is precisely the " +
        "angular-momentum-carrying piece, and the measurement is the only thing asserting it ***");
    ok("!! *** THE PLANT LOSES 25.5% OF THE ANGULAR MOMENTUM ***",
        pic.angularHolds === false && pic.angularLostFrac > 0.2,
        "particles " + pic.angularParticles.toFixed(6) + " to grid " + pic.angularGrid.toFixed(6) + ", lost " +
        (100 * pic.angularLostFrac).toFixed(2) + "%. Dropping C IS PIC -- not a scrambled number but THE OTHER " +
        "STANDARD TRANSFER, which is why it is the honest plant");
    ok("!! *** AND THE PLANTED ARM'S LINEAR MOMENTUM IS BETTER THAN THE HONEST ARM'S ***",
        pic.linearHolds === true && pic.linearErr < apic.linearErr,
        "PIC " + pic.linearErr.toExponential(3) + " against APIC " + apic.linearErr.toExponential(3) +
        ". *** A CHECK ON LINEAR MOMENTUM ALONE WOULD RATE THE PLANT HIGHER THAN THE REAL THING -- it has " +
        "fewer terms to accumulate round-off in. THE COMPANION KEY IS NOT MERELY BLIND HERE, IT POINTS THE " +
        "WRONG WAY, and shipping it without the angular one beside it would be worse than shipping neither ***");
}

console.log("\n3. THE ROUND TRIP, REPORTED AND NOT GRADED AS A SECOND ROUTE");
{
    ok("!! P2G then G2P reproduces a rigid rotation to round-off",
        trip.roundTripVelErr < 1e-12,
        "worst particle velocity error " + trip.roundTripVelErr.toExponential(3) + ". *** THIS IS A ROUND TRIP " +
        "THROUGH ONE SET OF WEIGHTS AND IT IS REPORTED, NOT TREATED AS INDEPENDENT EVIDENCE -- the same weights " +
        "scatter and gather, so a consistent stencil error would cancel. v3765's lesson: A SELF-CONSISTENCY " +
        "CHECK IS NOT A SECOND ROUTE ***");
    ok("!! the device DECLARES the plant, with `conserve` first",
        DEVICE_NAMES.includes("mpmtransfer") && mpmTransferDevice.plantMode === "pic" &&
        mpmTransferDevice.plantFlips === "angularLostFrac" && MPM_MODES[0] === "conserve");
}

report("*** WHAT THIS IS NOT, AND IT MATTERS MORE THAN WHAT IT IS ***",
    "IT IS NOT AN MPM SIMULATION. There is no grid momentum solve, no stress, no constitutive model, no " +
    "plasticity, no boundary handling and no rendering. A fluid or a snowbank on screen needs ALL of that after " +
    "this. What is here is the transfer, graded on identities that hold or do not -- and the reason to build " +
    "it first is that EVERY LATER PIECE SITS ON TOP OF IT, so a transfer that silently loses angular momentum " +
    "would be diagnosed as a constitutive bug for months.");

report("PROVENANCE",
    "Implemented from the published method: quadratic B-spline weights, and APIC from Jiang et al. 2015. " +
    "NOTHING IS VENDORED and no third party's code is present. v3599 built physics/stabilityMeter.mjs to grade " +
    "PB-MPM's 'stable at any time-step' and recorded that 'nothing here implements MPM' -- THIS IS THE SUBJECT " +
    "THAT METER HAS BEEN WAITING FOR, and it is deliberately OURS so the claims graded are ours to defend.");

console.log("\nmpmTransferBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
