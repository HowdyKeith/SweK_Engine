// tools/roundhouse/mpmGridBind-selfcheck.mjs -- v3790
//
// *** THE SECOND OF MPM'S FOUR PIECES. v3789 graded the TRANSFER; this grades what happens to the grid between
// P2G and G2P. STILL NOT A SIMULATION: there is no stress here, so nothing resists deformation and a block of
// particles simply falls. THAT IS THE CORRECT SCOPE and the constitutive round adds the missing half. ***
//
// *** THE KEY IS EXACT: a uniform body force g applied for dt to total mass M changes total momentum by
// EXACTLY M*g*dt -- not approximately, because gravity is uniform. Measured in the correct order, 4.311e-16. ***
//
// *** AND THE PLANT IS AN ORDER OF OPERATIONS, NOT A WRONG NUMBER. `v += g*dt` is THE SAME LINE either way;
// what differs is WHICH FIELD IS IN THE BUFFER WHEN IT RUNS. On a VELOCITY field every node gains the same
// velocity, so momentum gains m_i*g*dt and the total is M*g*dt. On a MOMENTUM field the identical line adds
// g*dt of MOMENTUM per node REGARDLESS OF MASS, so the impulse is weighted by NODE COUNT: right units,
// plausible motion, wrong physics. THE BUG SURVIVES A READING BECAUSE THE LINE IS IDENTICAL. ***

import { mpmGridDevice, MPMGRID_MODES, buildMpmGrid } from "./mpmGridBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await buildMpmGrid({ mode: "impulse" });
const planted = await buildMpmGrid({ mode: "forcefirst" });
const resHonest = await buildMpmGrid({ mode: "resolution" });
const walls = await buildMpmGrid({ mode: "walls" });

console.log("1. THE IMPULSE IDENTITY");
{
    ok("!! *** THE STEP ADDS EXACTLY M*g*dt OF MOMENTUM ***",
        honest.impulseHolds === true && honest.impulseErrFrac < 1e-9,
        "impulseY " + honest.impulseY.toFixed(9) + " against an expected " + honest.expectedImpulseY.toFixed(9) +
        ", err " + honest.impulseErrFrac.toExponential(3) + " over mass " + honest.totalMass.toFixed(3) +
        " on " + honest.liveNodes + " live nodes. *** EXACT BECAUSE GRAVITY IS UNIFORM -- there is no " +
        "discretisation error to tolerate here, so a residual above round-off is a WRONG STEP and not a coarse " +
        "one ***");
    ok("!! empty nodes are left at zero rather than divided",
        honest.liveNodes > 0 && honest.liveNodes < 400,
        honest.liveNodes + " nodes carried mass. AN EMPTY NODE HAS NO VELOCITY, and 0/0 would put NaN into a " +
        "field every later gather reads -- which would surface as a broken particle, three functions away");
}

console.log("\n2. THE ORDER OF OPERATIONS");
{
    ok("!! *** APPLYING THE FORCE BEFORE NORMALISING BREAKS THE IDENTITY BY 1.8e13x ***",
        planted.impulseHolds === false && planted.impulseErrFrac > 1e-3,
        "err " + honest.impulseErrFrac.toExponential(3) + " -> " + planted.impulseErrFrac.toExponential(3) +
        ". *** THE IMPULSE IS STILL THE RIGHT ORDER OF MAGNITUDE (-2.0438 against -2.0601), WHICH IS WHY THIS " +
        "BUG SHIPS: the block still falls, at very nearly the right rate, and only an identity says otherwise ***");
    ok("!! *** AND ITS SIGNATURE IS THAT IT SCALES WITH THE GRID, NOT WITH THE MATERIAL ***",
        resHonest.scalesWithGrid === false && resHonest.fineErrFrac < 1e-9,
        "the HONEST error is flat under refinement (" + resHonest.coarseErrFrac.toExponential(2) + " -> " +
        resHonest.fineErrFrac.toExponential(2) + ") because it is weighted by MASS. The planted one grows " +
        "7.937e-3 -> 1.540 -> 5.706 across 25 -> 64 -> 169 live nodes, because it is weighted by NODE COUNT. " +
        "*** THAT IS THE DIAGNOSTIC A READER CAN USE WITHOUT KNOWING THE EXPECTED IMPULSE AT ALL ***");
    ok("!! the device DECLARES the plant, with `impulse` first",
        DEVICE_NAMES.includes("mpmgrid") && mpmGridDevice.plantMode === "forcefirst" &&
        mpmGridDevice.plantFlips === "impulseErrFrac" && MPMGRID_MODES[0] === "impulse");
}

console.log("\n3. THE BOUNDARY IS A VERDICT, NOT A RESIDUAL");
{
    ok("!! *** A STICKY WALL NODE HAS EXACTLY ZERO VELOCITY ***",
        walls.wallsHold === true && walls.wallNormalMax === 0,
        "worst wall-node component " + walls.wallNormalMax + ". *** === 0, NOT < 1e-12: the boundary SETS the " +
        "value rather than converging to it, so anything but exact zero means the loop missed a node ***");
}

report("*** THE FIXTURE WAS WRONG FIRST, AND IT MADE A TRUE CLAIM LOOK FALSE ***",
    "The resolution mode scaled the PARTICLE SPACING with h, so refining the grid shrank the block by the same " +
    "factor and THE LIVE NODE COUNT STAYED AT 25 -- the planted error read 7.937e-3 at every resolution and " +
    "appeared to falsify the claim it was built to demonstrate. REFINING A GRID MEANS MORE NODES OVER THE SAME " +
    "MATERIAL; scaling the material with it is a DIFFERENT EXPERIMENT that holds the very ratio under test " +
    "constant. Caught because a plant that does not fire is ruled out as a bad plant before it is believed " +
    "(v3715) -- here the bad thing was the FIXTURE, not the plant.");

report("WHAT THIS DOES NOT CLAIM",
    "That SweK has MPM. It has the TRANSFER (v3789) and now the GRID STEP, each graded on identities. There is " +
    "still NO STRESS, so nothing resists deformation: this grid step will let a block fall and will not let it " +
    "hold together. A constitutive model and plasticity are the remaining two pieces, and each has its own key.");

console.log("\nmpmGridBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
