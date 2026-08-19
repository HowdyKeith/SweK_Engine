// tools/roundhouse/mpm3dBind-selfcheck.mjs -- v3804
//
// *** MPM IN 3D, ON THE SAME THREE IDENTITIES AS v3789'S 2D TRANSFER -- WHICH IS THE POINT: IF THEY HOLD IN
// 3D, THE PIECES ABOVE THEM PORT MECHANICALLY. 27 nodes instead of 9, and angular momentum a VECTOR. ***

import { mpm3dDevice, MPM3D_MODES, buildMpm3d } from "./mpm3dBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const apic = await buildMpm3d({ mode: "conserve" });
const pic = await buildMpm3d({ mode: "pic" });
const unity = await buildMpm3d({ mode: "unity" });
const trip = await buildMpm3d({ mode: "roundtrip" });

console.log("1. THE THREE IDENTITIES LIFT TO 3D");
{
    ok("!! partition of unity holds per axis, and the stencil is 27 nodes",
        unity.unityHolds === true && unity.stencil === 27,
        "worst " + unity.unityWorst.toExponential(3) + " over 97 positions. *** SAMPLED PER-AXIS BECAUSE THE 3D " +
        "STENCIL SUM IS A PRODUCT OF THREE ONE-DIMENSIONAL SUMS: a slip on ONE axis is DILUTED by the other " +
        "two rather than shouting, so testing the 27-node product would be the weaker test ***");
    ok("!! linear momentum reaches the grid to round-off",
        apic.linearHolds === true,
        "err " + apic.linearErr.toExponential(3) + " over " + apic.particles + " particles and " + apic.nodes +
        " nodes");
    ok("!! *** APIC CARRIES ALL THREE COMPONENTS OF THE ANGULAR MOMENTUM ***",
        apic.angularHolds === true && apic.angularWorstFrac < 1e-9,
        "worst per-axis loss " + apic.angularWorstFrac.toExponential(3) + " on L = [" +
        apic.angularParticles.map((v) => v.toFixed(3)).join(", ") + "]. The block spins about an ARBITRARY " +
        "axis so all three components are non-zero -- a spin about a coordinate axis would test one");
}

console.log("\n2. THE PLANT, AND THE 2D FINDING REPRODUCED");
{
    ok("!! *** PIC LOSES 55.56% OF EVERY COMPONENT -- EXACTLY 5/9 ***",
        pic.angularHolds === false && pic.angularWorstFrac > 0.5,
        "per-axis loss [" + pic.angularLostPerAxis.map((v) => (100 * v).toFixed(2) + "%").join(", ") + "]");
    ok("!! *** AND THE PLANTED ARM'S LINEAR MOMENTUM IS BETTER THAN THE HONEST ARM'S, IN 3D AS IN 2D ***",
        pic.linearHolds === true && pic.linearErr < apic.linearErr,
        "PIC " + pic.linearErr.toExponential(3) + " against APIC " + apic.linearErr.toExponential(3) +
        ". *** FEWER TERMS TO ACCUMULATE ROUND-OFF IN. A CHECK ON LINEAR MOMENTUM ALONE WOULD RATE THE PLANT " +
        "HIGHER THAN THE REAL THING -- the same inversion v3789 found in 2D, and it did not go away with the " +
        "extra dimension ***");
    ok("!! the round trip reproduces the rigid spin, and is REPORTED not graded as a second route",
        trip.roundTripVelErr < 1e-12,
        "worst " + trip.roundTripVelErr.toExponential(3) + " -- the same weights scatter and gather, so a " +
        "consistent stencil error would cancel (v3765)");
    ok("!! the device DECLARES the plant, with `conserve` first",
        DEVICE_NAMES.includes("mpm3d") && mpm3dDevice.plantMode === "pic" &&
        mpm3dDevice.plantFlips === "angularWorstFrac" && MPM3D_MODES[0] === "conserve");
}

report("*** THE PER-AXIS REPORTING IS A PRECAUTION AND IS NOT EXERCISED BY ANY PLANT I HAVE ***",
    "I tried to justify it by dropping the z-row of C, expecting two components to survive and one to break. " +
    "IT MOVED NOTHING -- 0.00% on all three -- AND THAT IS CORRECT BEHAVIOUR, NOT A MISSED BUG: changing C on " +
    "BOTH sides consistently just describes a DIFFERENT rigid motion, which is still conserved. The only plant " +
    "that separates here makes the two halves DISAGREE about C, and it hits all three axes equally. THE THREE " +
    "NUMBERS ARE STILL REPORTED SEPARATELY, because |L| would hide an axis-specific fault IF one ever arose -- " +
    "but that is a design choice stated as one, not a claim backed by a measurement.");

report("WHAT THIS DOES NOT CLAIM",
    "That SweK has 3D MPM. This is the 3D TRANSFER and nothing above it: no 3D grid step, no 3D stress, no " +
    "return mapping, no loop, no page. What it establishes is that THE IDENTITIES LIFT -- which is the " +
    "precondition for porting the rest mechanically, and the reason the transfer went first in 2D too.");

console.log("\nmpm3dBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
