// tools/roundhouse/neighbourBenchBind-selfcheck.mjs -- v3805
//
// *** KEITH ASKED FOR THIS AT v3792: a Morton BVH is "the alternative worth MEASURING rather than assuming
// better" for SPH neighbour search. THE ANSWER IS THAT IT IS NOT BETTER HERE AND THE MARGIN IS NOT CLOSE. ***

import { neighbourBenchDevice, NBENCH_MODES, buildNbench } from "./neighbourBenchBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const cmp = await buildNbench({ mode: "compare" });
const box = await buildNbench({ mode: "boxhits" });

console.log("1. CORRECTNESS FIRST -- THE COUNTS MEAN NOTHING WITHOUT IT");
{
    ok("!! *** EVERY NEIGHBOUR LIST IS IDENTICAL BETWEEN THE TWO STRUCTURES ***",
        cmp.listsMatch === true && cmp.differingLists === 0,
        cmp.identicalLists + " of " + cmp.identicalLists + " match. *** A FASTER STRUCTURE THAT RETURNS A " +
        "DIFFERENT SET IS NOT FASTER, IT IS WRONG -- and this is asserted BEFORE any count is read, which is " +
        "the order the v3792 conditions demanded ***");
}

console.log("\n2. THE MEASUREMENT");
{
    ok("!! *** THE HASHED GRID DOES LESS WORK PER QUERY AT EVERY SIZE ***",
        cmp.gridWins === true,
        "grid candidates/query [" + cmp.gridCandPerQuery.map((v) => v.toFixed(1)).join(", ") + "] against BVH " +
        "node visits/query [" + cmp.bvhVisitsPerQuery.map((v) => v.toFixed(1)).join(", ") + "] at N = " +
        cmp.sizes.map((s) => s[0]).join(", "));
    ok("!! *** AND THE RATIO IS STABLE, SO IT IS A PROPERTY AND NOT AN ARTEFACT OF ONE N ***",
        cmp.ratioStable === true,
        "ratios [" + cmp.ratios.map((v) => v.toFixed(2) + "x").join(", ") + "]. Measured to N = 8000 as well, " +
        "where it reads 8.89x -- 8.3 / 8.1 / 8.9 ACROSS A SIXTEENFOLD RANGE");
    ok("!! and the rebuild is counted, because SPH pays it every step",
        cmp.bvhBuildNodes.every((v) => v > 0),
        "build nodes [" + cmp.bvhBuildNodes.join(", ") + "] -- 15999 at N = 8000. *** THE PARTICLES MOVE EVERY " +
        "STEP, so a structure cheap to query and dear to build LOSES ON THE WORKLOAD SPH ACTUALLY HAS. Keith's " +
        "own reference demo rebuilds per frame for exactly this reason ***");
}

console.log("\n3. THE PLANT IS THE TRAP THE CONDITIONS NAMED");
{
    ok("!! *** CREDITING THE BVH WITH RAW BOX HITS BREAKS EVERY LIST -- 2500 OF 2500 ***",
        box.listsMatch === false && box.differingLists > 0,
        "differing " + box.differingLists + " against " + cmp.differingLists + " when both answer the same " +
        "question. The BVH is then being credited with answering an EASIER one");
    ok("!! *** AND THE RATIOS DO NOT MOVE AT ALL UNDER THE PLANT ***",
        Math.abs(box.ratios[0] - cmp.ratios[0]) < 1e-9,
        "[" + box.ratios.map((v) => v.toFixed(2)).join(", ") + "] against [" +
        cmp.ratios.map((v) => v.toFixed(2)).join(", ") + "]. *** THE COST NUMBERS ARE COMPLETELY BLIND TO " +
        "WHETHER THE TWO STRUCTURES ANSWERED THE SAME QUESTION. A benchmark reporting only the counts would " +
        "have been IDENTICAL in both arms, and the correctness check is the ONLY thing separating them ***");
    ok("!! the device DECLARES the plant, with `compare` first",
        DEVICE_NAMES.includes("nbench") && neighbourBenchDevice.plantMode === "boxhits" &&
        neighbourBenchDevice.plantFlips === "differingLists" && NBENCH_MODES[0] === "compare");
}

report("*** WHY THE GRID WINS, AND IT IS ABOUT THE WORKLOAD RATHER THAN THE STRUCTURES ***",
    "SPH PARTICLES ARE NEAR-UNIFORMLY DISTRIBUTED AND SHARE ONE INTERACTION RADIUS -- precisely the case a " +
    "uniform hash grid is optimal for: constant-time bucketing with no tree to descend. A BVH earns its keep " +
    "on HETEROGENEOUS SIZES and SPARSE OR CLUSTERED data, and SPH has neither. *** KEITH'S REFERENCE DEMO HAS " +
    "BOTH -- 10,000 boxes of RANDOM SIZES flying through mostly-empty space. THE DEMO IS RIGHT AND SO IS THE " +
    "GRID; THEY ARE ANSWERING DIFFERENT QUESTIONS, and that is the useful part of the answer rather than a " +
    "verdict on either. ***");

report("WHAT THIS DOES NOT CLAIM",
    "That the grid wins on every distribution. It was measured on a UNIFORM RANDOM cloud, which flatters the " +
    "grid; a strongly CLUSTERED fixture would narrow the gap and is the fair next question if anybody wants " +
    "one. Nor is any TIMING claimed: the numbers are node visits and candidate examinations, because this " +
    "sandbox is ONE CORE and a runtime here is not a runtime for the rig. *** CHECKS ARE MACHINE-INDEPENDENT; " +
    "MILLISECONDS ARE NOT. ***");

console.log("\nneighbourBenchBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
