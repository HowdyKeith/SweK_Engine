// tools/roundhouse/mpmCoupleBind-selfcheck.mjs -- v3803
//
// *** TWO-MATERIAL CONTACT IS MPM'S ACTUAL SELLING POINT OVER FLIP AND SPH, AND IT NEEDS NO CONTACT CODE AT
// ALL: two bodies rasterised onto ONE shared grid cannot occupy the same node velocity, so they push each
// other apart AS A CONSEQUENCE OF THE TRANSFER -- no pairs, no broad phase, no penalty forces. This grades
// whether that is true of THIS implementation rather than of the method in general. ***

import { coupleDevice, COUPLE_MODES, buildCouple } from "./mpmCoupleBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const contact = await buildCouple({ mode: "contact" });
const ghost = await buildCouple({ mode: "separategrids" });

console.log("1. CONTACT WITH NO CONTACT CODE");
{
    ok("!! *** THE BODIES APPROACH, STOP, AND NEVER OVERLAP ***",
        contact.separated === true && contact.minGap > 0,
        "gap " + contact.gapStart.toFixed(3) + " -> " + contact.gapEnd.toFixed(3) + ", closest approach " +
        contact.minGap.toFixed(4) + ". *** NOTHING IN physics/mpm/ MENTIONS COLLISION. The exclusion falls out " +
        "of the shared grid: two bodies cannot hold different velocities at the same node ***");
    ok("!! and momentum is conserved across the collision",
        contact.momentumHolds === true && contact.pxErrFrac < 1e-9,
        "px " + contact.pxStart.toFixed(6) + " -> " + contact.pxEnd.toFixed(6) + ", err " +
        contact.pxErrFrac.toExponential(3));
    ok("!! the device DECLARES the plant, with `contact` first",
        DEVICE_NAMES.includes("mpmcouple") && coupleDevice.plantMode === "separategrids" &&
        coupleDevice.plantFlips === "minGap" && COUPLE_MODES[0] === "contact");
}

console.log("\n2. AND MOMENTUM CANNOT TELL CONTACT FROM GHOSTING");
{
    ok("!! *** GIVEN A GRID EACH, THE BODIES PASS STRAIGHT THROUGH -- GAP -1.4000 ***",
        ghost.interpenetrated === true && ghost.minGap < 0,
        "closest approach " + ghost.minGap.toFixed(4) + ": NEGATIVE, which is one body INSIDE the other. The " +
        "grid is the only thing that couples them, and two grids couple nothing");
    ok("!! *** YET MOMENTUM IS CONSERVED JUST AS WELL IN THE PLANTED ARM ***",
        ghost.momentumHolds === true && ghost.pxErrFrac < 1e-9,
        "err " + contact.pxErrFrac.toExponential(3) + " with contact against " + ghost.pxErrFrac.toExponential(3) +
        " without. *** TWO BODIES THAT NEVER INTERACT CONSERVE MOMENTUM PERFECTLY -- it is the cheapest thing " +
        "in the world to conserve BY DOING NOTHING. A CONSERVATION LAW CANNOT DISTINGUISH CONTACT FROM " +
        "GHOSTING, and shipping it as the only key would have certified two bodies passing through each " +
        "other ***");
}

console.log("\n3. THE FIXTURE IS ASYMMETRIC ON PURPOSE");
{
    ok("!! *** TOTAL MOMENTUM IS NON-ZERO, SO CONSERVING IT IS NOT VACUOUS ***",
        Math.abs(contact.pxStart) > 1,
        "px " + contact.pxStart.toFixed(6) + " from unequal MASSES and unequal SPEEDS. *** MEASURED THE " +
        "SYMMETRIC WAY FIRST -- equal and opposite momentum -- AND px READ 0.000000000 AT EVERY STEP IN BOTH " +
        "ARMS. Zero is conserved by any code at all, and the check would have passed on nothing. Same trap as " +
        "v3798's floor and v3791's dilation ***");
}

report("WHAT THIS DOES NOT CLAIM",
    "That the contact is PHYSICALLY RIGHT. Grid-based exclusion is famously STICKY -- bodies that touch tend " +
    "to stay touching, because the shared node averages their velocities and there is no separation criterion " +
    "-- and NOTHING HERE MEASURES RESTITUTION, friction between the bodies, or the contact force. What is " +
    "graded is that they DO NOT PASS THROUGH and that momentum survives. A sticky collision and a correct one " +
    "both pass.");

console.log("\nmpmCoupleBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
