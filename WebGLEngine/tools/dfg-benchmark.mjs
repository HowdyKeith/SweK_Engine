// WebGLEngine/tools/dfg-benchmark.mjs -- v2846
//
// Run: node tools/dfg-benchmark.mjs                 (2D-1, Re=20, steady -- about 11 minutes)
//      node tools/dfg-benchmark.mjs --case 2D-2     (Re=100, unsteady -- about 34 minutes)
//      node tools/dfg-benchmark.mjs --transits 8
//
// THE WIND TUNNEL'S FIRST EXTERNAL ANSWER KEY. See simulation/lbm/dfgBenchmark.mjs for why that matters: every
// other instrument in this lab is graded against a truth somebody else established, and the wind tunnel's key
// was derived from the same solver it checks.
//
// IT IS A RIG JOB BECAUSE OF TRANSIT TIME, NOT DIFFICULTY. At Umean 0.02 through a 440-cell channel one pass
// takes 22,000 steps, and a steady case needs several before the recirculation behind the cylinder stops
// growing. The sandbox tried 20,000 and got a drag coefficient swinging between -1.39 and 7.36 -- under-settled
// exactly as the arithmetic predicts, which is why runPlan() now states the cost before you start.

import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const ENG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

// *** v3941 -- THE KEY THIS TOOL EXISTS TO READ IS LOST SOURCE, AND THE TOOL SAID SO WITH A STACK TRACE. ***
// simulation/lbm/dfgBenchmark.mjs is in no commit of this repository -- git history begins at v3842 and this
// file is v2846, so the module predates the tree entering git and did not survive the move. Running the tool
// produced "Cannot find module ..." with a resolved absolute path, which reads like a broken install on the
// machine rather than a file the project no longer has.
//
// SAME SHAPE AS world/terrainGenWorker.js, which wasmTerrainStatus reports as LOST SOURCE rather than crashing
// on. A missing dependency and a missing DELIVERABLE are different diagnoses, and only one of them is
// something the reader can act on. Found by trying to ADD this tool to the REPORTING registry at v3941: it is
// not registered, because a tool that cannot run is not a report -- and its own header already rules it out
// twice over, at 11 to 34 minutes a case.
const KEY = "simulation/lbm/dfgBenchmark.mjs";

async function main() {
    const keyPath = path.join(ENG, "simulation", "lbm", "dfgBenchmark.mjs");
    if (!(await import("node:fs")).default.existsSync(keyPath)) {
        console.error("[dfg-benchmark] LOST SOURCE: " + KEY + " is not in this tree.");
        console.error("  It is the EXTERNAL ANSWER KEY this benchmark grades against -- the DFG case definitions,");
        console.error("  latticeFor() and runPlan(). Without it there is nothing to compare a run to, so the");
        console.error("  benchmark cannot run at all. This is not a broken install: the module is in no commit");
        console.error("  of this repository (git begins at v3842; this tool is v2846), so it was lost when the");
        console.error("  project moved into git and survives only in a pre-v3842 zip, if anywhere.");
        console.error("  RECOVER IT from an old build, or re-derive the DFG 2D-1/2D-2 case data from the");
        console.error("  published benchmark before this tool means anything.");
        process.exit(1);
    }
    const D_ = await import(pathToFileURL(keyPath).href);
    const { makeLBM } = await import(pathToFileURL(path.join(ENG, "simulation", "lbm", "lbm2d.js")).href);
    const { solidForce } = await import(pathToFileURL(path.join(ENG, "simulation", "lbm", "windTunnel.mjs")).href);

    const caseId = arg("case", "2D-1");
    const spec = D_.DFG.cases[caseId];
    if (!spec) { console.error("unknown case " + caseId + " -- try 2D-1 or 2D-2"); process.exit(1); }
    const D = caseId === "2D-1" ? 20 : 40;
    const L = D_.latticeFor({ D, Re: spec.Re, tau: 0.56 });
    const plan = D_.runPlan(L, { transits: Number(arg("transits", 5)) });

    console.log(`DFG ${caseId} (Re=${spec.Re}, ${spec.steady ? "steady" : "unsteady"})  ${L.nx}x${L.ny}  D=${L.D}  tau=${L.tau}`);
    console.log(`  Umean=${L.uMean.toFixed(5)} Umax=${L.uMax.toFixed(5)}  reachable=${L.reachable}`);
    console.log(`  ONE TRANSIT = ${plan.transitSteps} steps. Running ${plan.transits} of them (${plan.warmup}) -- about ${plan.estimatedMinutes.toFixed(0)} minutes.`);
    console.log(`  cylinder at (${L.cx.toFixed(1)}, ${L.cy.toFixed(1)}); the ${L.centrelineOffset.toFixed(2)}-cell offset below centre is the BENCHMARK'S, kept on purpose.`);

    const prof = D_.inletProfile(L.ny, L.uMax);
    const inCyl = (x, y) => ((x - L.cx) ** 2 + (y - L.cy) ** 2) <= (L.D / 2) ** 2;
    const lbm = makeLBM({ nx: L.nx, ny: L.ny, tau: L.tau, inflow: prof, solidAt: inCyl });
    const pick = (x, y) => ((x - L.cx) ** 2 + (y - L.cy) ** 2) <= (L.D / 2) ** 2 + 2;

    const t0 = Date.now();
    let prev = null;
    for (let i = 0; i < plan.warmup; i++) {
        lbm.step();
        if ((i + 1) % plan.transitSteps === 0) {
            const f = solidForce(lbm, pick);
            const cd = D_.dragCoefficient(f.fx, L.uMean, L.D);
            // The CHANGE per transit is the convergence signal: when it stops moving, the wake has stopped growing.
            console.log(`  transit ${(i + 1) / plan.transitSteps}  Cd=${cd.toFixed(4)}${prev != null ? `  change ${(100 * Math.abs(cd - prev) / Math.abs(cd)).toFixed(3)}%` : ""}  (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
            prev = cd;
        }
    }

    const f = solidForce(lbm, pick);
    const cD = D_.dragCoefficient(f.fx, L.uMean, L.D);
    const cL = D_.liftCoefficient(f.fy, L.uMean, L.D);
    const ref = D_.referenceValues(caseId);
    const cmp = D_.compareToReference({ cD, cL }, ref);

    console.log("");
    console.log(`  MEASURED  Cd = ${cD.toFixed(4)}   Cl = ${cL.toFixed(5)}`);
    console.log(`  graded? ${cmp.graded}`);
    if (!cmp.graded) {
        console.log(`  ${cmp.reason}`);
        console.log(`  Paper: ${ref.url}`);
        console.log(`  Quantities to look for: ${ref.quantities.join(", ")}`);
        console.log("  Put them into referenceValues() and this becomes a graded instrument instead of a reading.");
    }
    console.log(`  ${((Date.now() - t0) / 60000).toFixed(1)} minutes. If the per-transit change was still large at the end, run more transits.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((e) => { console.error("dfg-benchmark failed:", e && e.message); process.exit(1); });
}
export { main };
