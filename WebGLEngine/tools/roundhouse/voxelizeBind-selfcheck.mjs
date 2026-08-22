// tools/roundhouse/voxelizeBind-selfcheck.mjs -- v3782
//
// *** THE ROADMAP NAMED "volume convergence against an analytic solid" AND THERE ARE TWO CONVERGENCES HERE.
// Measuring both BEFORE building is what decided which one is the key -- and only one of them has a rate.
//
//   (a) TESSELLATION -> ANALYTIC is SECOND ORDER. A tessellated sphere is INSCRIBED, so meshVolume
//       under-reports, and the deficit falls 4x per doubling: 1.600e-1 at seg 8, 4.211e-2 at 16, 1.066e-2 at
//       32, 2.674e-3 at 64 -- RATIOS 3.80, 3.95, 3.99. THAT IS THE KEY.
//   (b) VOXELS -> TESSELLATION IS BOUNDED BUT NOT MONOTONE, and a rate key there would simply fail. ***
//
// *** THE TWO ROUTES SHARE NO CODE: meshVolume integrates over TRIANGLES and never visits a grid; voxelize
// tests POINTS and never sums a triangle. And neither is told (4/3)pi r^3, so the analytic value is a third
// opinion rather than either implementation's own arithmetic. ***

import { voxelizeDevice, VOXELIZE_MODES, buildVoxelize } from "./voxelizeBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await buildVoxelize({ mode: "order" });
const planted = await buildVoxelize({ mode: "oneaxis" });
const agree32 = await buildVoxelize({ mode: "agreement", config: { segments: 32 } });
const agree64 = await buildVoxelize({ mode: "agreement", config: { segments: 64 } });
const closure = await buildVoxelize({ mode: "closure" });

console.log("1. THE KEY -- A RATE, NOT A VALUE");
{
    ok("!! *** THE TESSELLATION DEFICIT FALLS 4x PER DOUBLING -- SECOND ORDER ***",
        honest.secondOrder === true && Math.abs(honest.order - 2) < 0.15,
        "ratios " + honest.orderRatios.map((r) => r.toFixed(2)).join(", ") + ", order " + honest.order.toFixed(3) +
        ". *** DERIVED FROM CONSECUTIVE PAIRS, NEVER FITTED, and the analytic (4/3)pi r^3 is a number NEITHER " +
        "route computes ***");
    ok("!! the mesh UNDER-reports, which is the direction an inscribed tessellation must go",
        honest.deficit > 0 && honest.meshVolumeAt < honest.analyticVolume,
        "deficit " + honest.deficit.toExponential(3) + " at " + honest.ladder[honest.ladder.length - 1].seg +
        " segments. A tessellated sphere is INSIDE the true one, so an OVER-report would mean the sign of the " +
        "divergence sum had flipped");
    ok("!! and the mesh is closed and manifold, so the divergence theorem applies at all",
        closure.closed === true && closure.boundaryEdges === 0 && closure.nonManifoldEdges === 0,
        "meshVolume is a SURFACE integral standing in for a volume; on an open mesh it is meaningless, and " +
        "this is the precondition rather than a bonus check");
}

console.log("\n2. THE PLANT -- REFINING ONE AXIS AND CALLING IT CONVERGENCE");
{
    ok("!! *** PINNING THE RINGS WHILE THE SEGMENTS DOUBLE COLLAPSES THE ORDER 1.968 -> 0.227 ***",
        planted.secondOrder === false && planted.order < 0.6,
        "ratios " + planted.orderRatios.map((r) => r.toFixed(2)).join(", ") + " against the honest " +
        honest.orderRatios.map((r) => r.toFixed(2)).join(", ") + ". *** YOU DOUBLE A PARAMETER, EXPECT 4x, AND " +
        "THE OTHER DIRECTION NEVER MOVED. The mesh still refines and the deficit still falls -- IT JUST FALLS " +
        "FIRST ORDER, which only a RATE key can see. A value key would have called it converging ***");
    ok("!! and the device DECLARES the plant, with `order` first",
        DEVICE_NAMES.includes("voxelize") && voxelizeDevice.plantMode === "oneaxis" &&
        voxelizeDevice.plantFlips === "order" && VOXELIZE_MODES[0] === "order");
}

console.log("\n3. THE OTHER CONVERGENCE, REPORTED AS WHAT IT IS");
{
    ok("!! *** THE VOXEL ERROR IS BOUNDED AT EVERY RESOLUTION AND NOT MONOTONE, ON BOTH MESHES ***",
        agree32.voxelBounded && agree64.voxelBounded &&
        agree32.voxelMonotone === false && agree64.voxelMonotone === false,
        "segments 32: " + agree32.ladder.map((r) => r.err.toExponential(2)).join(", ") + " -- THE MIDDLE POINT " +
        "IS THE WORST. segments 64: " + agree64.ladder.map((r) => r.err.toExponential(2)).join(", ") + " -- flat, " +
        "then RISING. A cell-CENTRE membership test has an O(h) SIGNED error that oscillates as centres cross " +
        "the surface; THERE IS NO CLEAN RATE TO GRADE HERE and claiming one would invent an asymptotic regime " +
        "this fixture is not in");
}

report("*** TWO THINGS I GOT WRONG AND FIXED BEFORE SHIPPING, BOTH CAUGHT BY MEASURING ***",
    "(1) THE PLANT'S NAME. I called it `flatnormal`, which describes SHADING and not what it does -- it pins " +
    "the RINGS while segments double. A MODE NAMED FOR SOMETHING IT DOES NOT DO IS A LABEL THAT WILL MISLEAD " +
    "THE NEXT READER, so it is `oneaxis`. " +
    "(2) THE VOXEL VERDICT. `voxelConverges` first read `last < first/2`, WHICH COMPARES TWO SAMPLES AND CALLS " +
    "THE RESULT CONVERGENCE: it returned TRUE at segments 32 and FALSE at segments 64 for the same underlying " +
    "non-monotone behaviour. Replaced by a BOUND and a SHAPE, which agree on both meshes.");

report("WHAT THIS DOES NOT CLAIM",
    "That voxelize is inaccurate. 1.5e-3 to 1.9e-3 relative on a unit sphere is FINE for what a voxel grid is " +
    "for; what it is not is a quantity with a gradeable rate at these sizes. Nor is second order claimed for " +
    "any solid -- it is measured on a SPHERE, whose curvature is uniform, and a solid with edges would show " +
    "the tessellation converging differently near them.");

console.log("\nvoxelizeBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
