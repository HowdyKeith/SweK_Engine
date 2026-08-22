// brain/fieldSpace-selfcheck.mjs
//
// v3339 -- FIELD NAVIGATION IN SPACE, AND PROBES AS EMITTERS.
//
// Two questions, two different answers.
//
// EMITTERS WERE ALREADY THERE. Dijkstra is MULTI-SOURCE: `goals` is an array, every entry seeds at distance
// zero, so a probe that broadcasts IS a source. Nothing had to be built -- but the invariant had to be checked,
// because it is the one that makes emitters composable: adding a source can only shorten the distance to the
// NEAREST source. Measured, one emitter to three on a 64x64 potential: 3072 cells improved, ZERO worsened.
//
// *** SPACE NEEDED A REAL CHANGE, AND THE FAILURE WAS SILENT. *** The terrain cost is
//
//     1 + slopeK*|dh|/cell  +  waterK if h <= WATER_LEVEL
//
// and that last term is an ABSOLUTE HEIGHT TEST. A gravitational potential has no absolute zero -- only
// differences are physical -- so adding a constant to Phi changes nothing about the field and everything about
// the cost. Measured on the same mass, the same grid, the same everything:
//
//     Phi offset 20  ->  cost from the far corner    476.0
//     Phi offset  6  ->  cost from the far corner  12076.0
//
// A factor of twenty-five for a change that is not physical, and nothing threw. Both runs completed and returned
// plausible numbers, which is exactly the shape of failure this lab exists to catch.
//
// THE FIX IS GAUGE INVARIANCE AND IT IS ALSO THE TEST: with waterK = 0 the cost depends only on |grad Phi|, the
// local gravity a probe actually has to fight. Shifting Phi by any constant must leave every cost unchanged.

import { potentialField, spaceSolver, solveWithEmitters, gaugeSpread } from "./fieldSpace.mjs";
import { FlowFieldSolverCPU } from "./flowfieldCpu.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const N = 64;

// ---- 1. THE TERRAIN MODEL IS WRONG IN SPACE, DEMONSTRATED RATHER THAN ASSERTED --------------------------------
{
    const costs = [20, 6].map((offset) => {
        const s = new FlowFieldSolverCPU(null, N, N, {});     // TERRAIN defaults: waterK = 25
        return s.solveSync(potentialField(N, { offset }), [{ gx: N - 3, gy: N - 3 }], { wantDist: true })
                .dist[3 * N + 3];
    });
    ok("!! the TERRAIN cost model gives a 25x different answer for the same physical field",
        costs[1] / costs[0] > 10,
        `offset 20 gives ${costs[0].toFixed(1)}, offset 6 gives ${costs[1].toFixed(1)} -- a factor of ` +
        `${(costs[1] / costs[0]).toFixed(0)}. The two potentials differ by an additive constant, which is not a ` +
        "physical difference. waterK fires below WATER_LEVEL and invents a seabed in space, and BOTH runs " +
        "completed without error");
}

// ---- 2. THE SPACE MODEL IS GAUGE-INVARIANT ------------------------------------------------------------------------
{
    const g = gaugeSpread(N, [20, 6, -100]);
    ok("!! with waterK = 0 the cost is unchanged by shifting the potential",
        g.relSpread < 1e-5,
        `costs ${g.costs.map((c) => c.toFixed(4)).join(", ")} at offsets ${g.offsets.join(", ")} -- relative ` +
        `spread ${g.relSpread.toExponential(2)}. Only the GRADIENT enters, which is the local gravity, which is ` +
        "the thing a probe has to spend fuel on. That is what makes this a physics model rather than a terrain " +
        "model wearing a physics label");

    const wide = gaugeSpread(N, [20, 6, -100, 1000]);
    ok("!! and the residual is float32 CANCELLATION, not the model caring about the offset",
        wide.relSpread > g.relSpread * 5,
        `spread grows ${g.relSpread.toExponential(1)} -> ${wide.relSpread.toExponential(1)} when an offset of ` +
        "1000 is added. The gradient is a difference of two nearby values in a Float32Array, so a large offset " +
        "spends significant bits on cancellation. A model-level dependence would not scale with the OFFSET " +
        "MAGNITUDE like that -- so the guidance is to keep the offset small, not to distrust the model");
}

// ---- 3. PROBES AS EMITTERS, AND THE INVARIANT THAT MAKES THEM COMPOSABLE ---------------------------------------------
{
    const f = potentialField(N, {});
    const one = solveWithEmitters(N, f, [{ x: N - 3, z: N - 3 }]).dist;
    const three = solveWithEmitters(N, f, [{ x: N - 3, z: N - 3 }, { x: 3, z: N - 3 }, { x: N - 3, z: 3 }]).dist;
    let better = 0, worse = 0;
    for (let i = 0; i < N * N; i++) {
        if (three[i] < one[i] - 1e-6) better++;
        if (three[i] > one[i] + 1e-6) worse++;
    }
    ok("!! adding emitters improves many cells and worsens NONE",
        better > 1000 && worse === 0,
        `${better} cells improved, ${worse} worsened, going from one emitter to three. This is the invariant that ` +
        "makes emitters composable: the field is distance to the NEAREST source, so another source can only " +
        "shorten it. A single cell getting worse would mean the multi-source seeding is not doing what it claims");

    ok("...and every emitter sits at zero cost, by construction",
        [[N - 3, N - 3], [3, N - 3], [N - 3, 3]].every(([x, z]) => three[z * N + x] === 0),
        "an emitter is a source seeded at distance zero. If one were not zero it would be a destination the " +
        "field merely favours rather than a broadcaster");
}

// ---- 4. WHAT THIS DOES NOT CLAIM -----------------------------------------------------------------------------------------
{
    ok("!! this is a NEWTONIAN potential on a 2D grid, not a relativistic geodesic solver",
        true,
        "the cost is |grad Phi| for a point mass, which is the right shape for orbital-neighbourhood routing and " +
        "is NOT a black-hole trajectory. Near a horizon the probe device already owns the exact keys -- capture " +
        "at b_crit = 3 sqrt(3) M, the ISCO at 6M -- and those are geodesics, not a cost grid. Two different " +
        "instruments for two different regimes, and saying so is cheaper than discovering it later");
}

console.log();
if (fails) { console.log("fieldSpace-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("fieldSpace-selfcheck: all checks pass");
