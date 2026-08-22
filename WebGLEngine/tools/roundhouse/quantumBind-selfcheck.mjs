// tools/roundhouse/quantumBind-selfcheck.mjs -- v3765
//
// *** THE FINDING THAT SHAPED THIS ROUND: THE DEVICE HAD A SECOND ROUTE AND DID NOT USE IT.
// physics/quantum/kronigPenney.js exports TWO independent ways to the band structure -- the analytic
// transcendental condition (kpRhs / bandEdges) and a REAL DISCRETE HAMILTONIAN that is built and diagonalised
// (blochSpectrum / numericEdges). THE BIND IMPORTED ONLY THE ANALYTIC ONE. Its band observables all evaluate
// kpRhs at points bandEdges produced FROM kpRhs: A SELF-CONSISTENCY CHECK, NOT TWO ROUTES. It confirms the
// root-finder found roots of the function it was given, WHICH IT WOULD DO EVEN IF THE FUNCTION WERE WRONG.
// The matrix route's only consumer in the whole tree was its own selfcheck. ***
//
// *** AND THAT IS WHY A PLANT WAS NOT POSSIBLE FIRST. I went looking for one on the Hamiltonian and it would
// have moved NOTHING the device reports, because the device never called it -- v3736's mistake exactly (a
// plant on a path the run never executes), and I would have found out only after building the gate. WIRE THE
// ROUTE, THEN PLANT IT. ***

import { quantumDevice, QUANTUM_OBSERVABLES, QUANTUM_MODES } from "./quantumBind.mjs";
import { bandEdges, numericEdges } from "../../physics/quantum/kronigPenney.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const build = quantumDevice.build;

// ---- 1. THE SECOND ROUTE, AND ITS CONVERGENCE ------------------------------------------------------------
console.log("1. TWO ROUTES SHARING NO CODE, AND THE CLAIM IS THE RATE");
{
    const rows = [];
    for (const n of [200, 400, 800]) rows.push((await build({ mode: "bands", config: { bandGridN: n } })).numericEdgeWorst);
    ok("!! the matrix route agrees with the analytic one and CONVERGES TO IT",
        rows.every((v, i) => i === 0 || v < rows[i - 1]) && rows[2] < 3e-3,
        rows.map((v) => v.toExponential(3)).join(" -> ") + " at n = 200 / 400 / 800");
    // *** GRADE THE RATE, NOT THE CLOSENESS (v3723, v3759). "They are close" is satisfied by TWO WRONG ANSWERS
    // THAT HAPPEN TO AGREE; a first-order scheme HALVING with each doubling of the grid is a claim about the
    // discretisation itself. ***
    const r1 = rows[0] / rows[1], r2 = rows[1] / rows[2];
    ok("!! *** AND IT HALVES WITH EACH DOUBLING -- FIRST ORDER, WHICH IS THE ACTUAL KEY ***",
        Math.abs(r1 - 2) < 0.3 && Math.abs(r2 - 2) < 0.3,
        "ratios " + r1.toFixed(3) + ", " + r2.toFixed(3) + ". 'They are close' would be satisfied by two wrong " +
        "answers that happen to agree; A RATE IS A CLAIM ABOUT THE DISCRETISATION");
    ok("the new observables are declared and reported",
        QUANTUM_OBSERVABLES.includes("numericEdgeWorst") && QUANTUM_OBSERVABLES.includes("bandGridN"),
        "a declared observable no mode produces is the v3759 shape -- these are produced by the bands branch");
}

// ---- 2. THE PLANT, AND WHAT THE OLD CHECK COULD NOT SEE ---------------------------------------------------
console.log("\n2. THE STENCIL, AND THE SELF-CONSISTENCY CHECK THAT DOES NOT NOTICE");
{
    const honest = await build({ mode: "bands" });
    const planted = await build({ mode: "stencil" });
    ok("!! *** THE BROKEN STENCIL MOVES THE NEW KEY BY 1.52e7 ***",
        honest.numericEdgeWorst < 1e-2 && planted.numericEdgeWorst > 1e3,
        honest.numericEdgeWorst.toExponential(3) + " -> " + planted.numericEdgeWorst.toExponential(3) +
        ". Using -1/dx^2 off the diagonal instead of -0.5/dx^2 is FORGETTING THE 1/2 IN FRONT OF THE LAPLACIAN. " +
        "*** IT BREAKS THE ROW SUM RULE -- a constant wavefunction is a zero-energy eigenstate of the kinetic " +
        "operator where V = 0 -- while still producing a SYMMETRIC, REAL, PERFECTLY DIAGONALISABLE MATRIX. The " +
        "first band edge comes back at -111108 against an analytic 2.0400: the spectrum is unbounded below ***");
    ok("!! *** AND edgeRhsWorst DOES NOT MOVE AT ALL -- 1.55e-15 IN BOTH ARMS ***",
        planted.edgeRhsWorst === honest.edgeRhsWorst,
        "THAT IS THE WHOLE ARGUMENT FOR THIS ROUND IN ONE READING. The check the device already had is a " +
        "self-consistency check, and it is BLIND to a Hamiltonian that describes no physical system -- because " +
        "it never asked the Hamiltonian anything. A SECOND ROUTE IS NOT A NICER VERSION OF A SELF-CHECK; IT IS " +
        "A DIFFERENT KIND OF EVIDENCE");
    ok("!! it is ONE-SIDED: the analytic edges are untouched",
        planted.bandCount === honest.bandCount && planted.widestGap === honest.widestGap,
        "bandCount and widestGap identical in both arms -- the analytic route never sees the matrix, so a plant " +
        "on the matrix CANNOT cancel (v3733)");
    ok("!! the default stencil is CORRECT, so the option changes no existing caller",
        (() => { const a = numericEdges({ V0: 20, a: 1, b: 0.2, n: 200, count: 8 });
                 const b = numericEdges({ V0: 20, a: 1, b: 0.2, n: 200, count: 8, offDiag: -0.5 });
                 return a.all[0] === b.all[0]; })(),
        "offDiag defaults to -0.5. A plant knob that changed behaviour for everybody would be a defect");
    ok("!! and the device DECLARES it, with `bands` before the plant so the contract compares like with like",
        quantumDevice.plantMode === "stencil" && quantumDevice.plantFlips === "numericEdgeWorst" &&
        quantumDevice.plantKind === "mode" && QUANTUM_MODES[0] === "bands",
        "plantedCoverage compares a mode plant against the first OTHER mode -- v3762's lesson, applied rather " +
        "than re-learned for the third round running");
}

report("WHAT THIS DOES NOT CLAIM",
    "That quantum's other keys are proven. WELL, OSC, TUNNEL and NORM are untouched -- the plant runs the bands " +
    "branch only -- and the infinite-well level ratios (4 and 9) are SHAPES, so a uniform error in the kinetic " +
    "coefficient would leave them exactly right. ONE PLANT TESTS ONE CLAIM. Nor is the matrix route claimed " +
    "ACCURATE: it is first order and 3.6e-3 off at n=400. Its value is that it is INDEPENDENT, not that it is " +
    "better -- the analytic route remains the reference.");

console.log("\nquantumBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
