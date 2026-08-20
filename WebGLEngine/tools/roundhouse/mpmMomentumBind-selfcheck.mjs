// tools/roundhouse/mpmMomentumBind-selfcheck.mjs -- v3798
//
// *** A FRICTIONLESS FLOOR EXERTS NO HORIZONTAL FORCE, SO sum(m*vx) IS CONSERVED EXACTLY. Nothing in the
// system can change it: the floor pushes UP, gravity pulls DOWN, and internal stress sums to zero over the
// grid (v3793). ***
//
// *** AND THE PLANT IS A FIXTURE MISTAKE RATHER THAN A CODE CHANGE, WHICH THIS ARC HAS NOT DONE BEFORE: put
// the floor ONE cell from the domain edge instead of three and THE SAME CODE loses 95% of the horizontal
// momentum on a boundary that exerts none. ***

import { mpmMomentumDevice, MPMMOM_MODES, buildMpmMomentum } from "./mpmMomentumBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const slide = await buildMpmMomentum({ mode: "slide" });
const edge = await buildMpmMomentum({ mode: "edgefloor" });

console.log("1. THE IDENTITY");
{
    ok("!! *** HORIZONTAL MOMENTUM IS CONSERVED TO ROUND-OFF ACROSS A LANDING ***",
        slide.momentumHolds === true && slide.pxErrFrac < 1e-9,
        "px " + slide.pxStart.toFixed(9) + " -> " + slide.pxEnd.toFixed(9) + ", err " +
        slide.pxErrFrac.toExponential(3) + " over " + slide.steps + " steps. *** THE FLOOR PUSHES UP, GRAVITY " +
        "PULLS DOWN, AND INTERNAL STRESS SUMS TO ZERO -- there is nothing left that could change it ***");
    ok("!! *** AND THE BLOCK ACTUALLY LANDS, SO THE KEY IS NOT MEASURING FREE FLIGHT ***",
        slide.landed === true,
        "a block that never reaches the floor conserves horizontal momentum TRIVIALLY -- the fixture would " +
        "pass while testing nothing about the boundary at all");
    ok("!! and the block starts with horizontal momentum, so the identity is not 0 == 0",
        Math.abs(slide.pxStart) > 1,
        "px " + slide.pxStart.toFixed(6) + ". A COLUMN FALLING STRAIGHT DOWN HAS ZERO HORIZONTAL MOMENTUM AND " +
        "CONSERVES IT VACUOUSLY -- the v3791 lesson, applied to a fixture instead of a deformation");
    ok("!! mass is conserved exactly, so nothing is being lost outright",
        slide.massHolds === true,
        "particles are never created or destroyed; if this ever moves, the loss is not subtle");
}

console.log("\n2. THE PLANT IS THE FIXTURE, NOT THE CODE");
{
    ok("!! *** A FLOOR ON THE DOMAIN EDGE LOSES 95% OF THE HORIZONTAL MOMENTUM ***",
        edge.momentumHolds === false && edge.pxErrFrac > 0.5,
        "err " + slide.pxErrFrac.toExponential(3) + " -> " + edge.pxErrFrac.toExponential(3) +
        " with floor offset " + slide.floorOffset + " -> " + edge.floorOffset + ". *** IDENTICAL CODE, " +
        "IDENTICAL PHYSICS, ONE NUMBER IN THE FIXTURE ***");
    ok("!! and it still lands, so the difference is not that one run simply missed the floor",
        edge.landed === true,
        "both arms reach the boundary; only the OFFSET differs");
    ok("!! the device DECLARES the plant, with `slide` first",
        DEVICE_NAMES.includes("mpmmomentum") && mpmMomentumDevice.plantMode === "edgefloor" &&
        mpmMomentumDevice.plantFlips === "pxErrFrac" && MPMMOM_MODES[0] === "slide");
}

report("*** WHY THE EDGE FLOOR DESTROYS MOMENTUM, AND IT IS NOT THE WALL ***",
    "A QUADRATIC STENCIL REACHES ONE CELL EACH WAY, so a particle resting a fraction above y=0 has a stencil " +
    "base of -1. THAT NODE ROW DOES NOT EXIST, and both p2g and g2p SKIP IT -- the weights stop summing to one " +
    "and the gather silently loses whatever share those nodes carried. *** THE BOUNDARY CONDITION IS INNOCENT: " +
    "the free-slip branch only ever zeroes the NORMAL component, and it did exactly that in both arms. THE " +
    "MATERIAL WAS STANDING ON THE EDGE OF THE GRID. ***");

report("*** AND THIS CORRECTED A NUMBER v3797 ALREADY SHIPPED ***",
    "The collapsing column had its floor on the domain edge too, settling at y = 0.042 with truncated stencils " +
    "for its whole run. Its dissipation read 91.0% and reads 57.3% with the floor moved three cells in: A " +
    "THIRD OF WHAT WAS CALLED FRICTION AND PLASTICITY WAS BOUNDARY TRUNCATION. The energy KEY survived -- " +
    "energy loss is energy loss whatever its cause, and the direction held either way -- BUT THE FIGURE WAS " +
    "WRONG, and mpmColumnBind now runs at lo=3.");

report("WHAT THIS DOES NOT CLAIM",
    "That the floor is physically right. A free-slip floor is a MODELLING CHOICE, not a fact about the world -- " +
    "real sand has friction, and this device would fail on a frictional floor BECAUSE IT SHOULD. What is " +
    "graded is that the code delivers the boundary it claims to.");

console.log("\nmpmMomentumBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
