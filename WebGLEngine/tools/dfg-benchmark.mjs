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

async function main() {
    const D_ = await import(pathToFileURL(path.join(ENG, "simulation", "lbm", "dfgBenchmark.mjs")).href);
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
