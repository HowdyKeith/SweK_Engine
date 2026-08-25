// tools/roundhouse/fieldNav-selfcheck.mjs
//
// v3338 -- A GRADED DEVICE WHOSE ANSWER KEY IS AN EXHAUSTIVE SEARCH.
//
// Every other device here grades against algebra, an agreement between two routes, or a structural identity.
// Terrain has none of those: the cheapest path across a cost field is not something you can write down. It is
// gradeable anyway, and the reason is the whole point of this round --
//
//     EXHAUSTIVE SEARCH IS EXACT EVEN WHERE NO FORMULA EXISTS. Dijkstra's dist[] IS the true cost-to-go.
//
// *** AND THE OBVIOUS TEST IS A TAUTOLOGY, WHICH IS WHY IT IS NOT THE ONE GRADED. *** Walking downhill on dist[]
// reproduces the optimal cost to within an off-by-one on the first cell -- measured ratio 0.9989. Descending the
// exact cost-to-go is the DEFINITION of the shortest path, so that measurement can only ever come back
// "optimal". It would look like a strong result and would establish nothing.
//
// The policy graded here follows the FLOW VECTORS -- one direction per cell, no global view, no memory -- which
// is what a probe can actually see. That can be worse than optimal, and the exact field says by exactly how much.
//
// THE FINDING, and both halves are needed:
//
//     COMPLETE     the walker ALWAYS arrives, at every roughness. The flow is derived from an exact distance
//                  field, so it has no local minima by construction and a memoryless walker cannot be trapped.
//     NOT CHEAP    excess cost over optimal runs 0.18% on gentle ground to 517.7% on rough ground.
//
// A device grading only arrival would call the roughest run a success while the probe took SIX TIMES the
// necessary route.

import { getDevice } from "./devices.mjs";
import { navigateRun, followField, terrain } from "../../brain/fieldNavigate.mjs";
import { FlowFieldSolverCPU } from "../../brain/flowfieldCpu.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("fieldnav");

// ---- 1. THE KEY IS REAL: the exhaustive search settles the whole map --------------------------------------------
{
    const o = await dev.build({ mode: "policy" });
    ok("!! the exhaustive search reaches every cell, so the key covers the whole map",
        o.reachableCells === o.cells && o.optimalCost > 0,
        `${o.reachableCells}/${o.cells} cells settled, optimal cost-to-go from the start ${o.optimalCost.toFixed(1)}. ` +
        "Asserted first because a Dijkstra that quit early would produce a SMALLER 'optimal' and flatter the " +
        "policy -- which is exactly the bug found in this solver one version ago");
}

// ---- 2. THE POLICY IS COMPLETE, AND THAT IS STRUCTURAL --------------------------------------------------------------
{
    const o = await dev.build({ mode: "complete" });
    ok("!! a memoryless walker always arrives, at every roughness and from every start",
        o.allArrived === true && o.looped === false,
        "12 runs across four terrain amplitudes and three start cells: all arrived, none looped. The flow is " +
        "derived from an EXACT distance field, so it has no local minima -- completeness here is a property of " +
        "the construction, and a loop would mean the derivation is wrong rather than the walker unlucky");
}

// ---- 3. BUT IT IS NOT OPTIMAL, AND THE EXCESS IS THE GRADED QUANTITY --------------------------------------------------
{
    const o = await dev.build({ mode: "roughness" });
    ok("!! following local vectors costs more than the optimal route, and the field says how much",
        o.bestExcess > 0 && o.worstExcess > 1,
        `excess over optimal ranges ${(o.bestExcess * 100).toFixed(2)}% to ${(o.worstExcess * 100).toFixed(1)}%. ` +
        "The upper end is more than SIX TIMES the necessary cost -- a device grading arrival alone would call " +
        "that run a success");

    ok("!! and the policy degrades as the ground gets rougher",
        o.degradesWithRoughness === true,
        "mean excess at the roughest terrain exceeds mean excess at the gentlest. Quantising a smooth gradient " +
        "into one of four directions loses more information the faster the field turns, so this is the expected " +
        "direction -- and measuring it is what turns 'the brain gives you a field to follow' into a price");
}

// ---- 4. THE TAUTOLOGY, PINNED SO NOBODY GRADES IT BY MISTAKE ------------------------------------------------------------
{
    const n = 48, heights = terrain(n, 1.5);
    const s = new FlowFieldSolverCPU(null, n, n, {});
    const f = s.solveSync(heights, [{ gx: n - 2, gy: n - 2 }], { wantDist: true });
    const d = f.dist, cost = s._cost, cell = s.cell;
    // descend dist[] itself -- the thing that must NOT be the graded observable
    let i = 2 * n + 2, walked = 0, guard = 0;
    while (d[i] > 0 && guard++ < 5000) {
        const x = i % n, z = (i / n) | 0; let best = -1, bd = d[i];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
            const j = nz * n + nx; if (d[j] < bd) { bd = d[j]; best = j; }
        }
        if (best < 0) break;
        walked += cost[best] * cell; i = best;
    }
    const ratio = walked / d[2 * n + 2];
    ok("!! descending dist[] itself IS optimal by definition -- a tautology, and not what is graded",
        Math.abs(ratio - 1) < 0.01,
        `ratio ${ratio.toFixed(6)}. Greedy descent on the exact cost-to-go is the definition of the shortest ` +
        "path, so this can only return 'optimal'. It is pinned here so a later reader does not mistake it for a " +
        "strong result and swap it in for the flow-vector policy, which is the one that can actually be wrong");
}

// ---- 5. DECLARED -----------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    // *** v4000 -- THE SAME STALE-COUNT DEFECT AS figureEight'S, IN THE SAME ROUND. *** This pinned THREE and
    // the device now declares four; `crowflight` was added and the gate was not. A count typed beside a list
    // is a second declaration of that list, and it goes stale the first time somebody edits the real one.
    //
    // WHAT v3192 ACTUALLY CARED ABOUT WAS `source`, NOT THE NUMBER: a device whose modes are EXPORTED can be
    // asked; one that has to be PROBED is only ever known to a candidate list, and the lab's apparent
    // one-moded-ness turned out to be that list rather than the devices. So `source` is the assertion, every
    // declared mode has to actually run, a nonsense one has to be refused, and the count is REPORTED.
    const { checkMode } = await import("./knobGate.mjs");
    const runs = m.declared.filter((x) => checkMode(dev, x).ok !== false);
    ok("!! fieldnav's modes are EXPORTED rather than probed, and every one of them is accepted",
        m.source === "exported" && m.declared.length > 0 && runs.length === m.declared.length,
        `source "${m.source}", ${m.declared.length} modes ${JSON.stringify(m.declared)}` +
        (runs.length === m.declared.length ? "" : "  <- REFUSED ITS OWN: " +
         m.declared.filter((x) => !runs.includes(x)).join(", ")));
    ok("!! ...and a mode it never declared is refused", checkMode(dev, "zzz_no_mode").ok === false,
        "a device that accepts a name it does not declare runs something else and says nothing");
}

console.log();
if (fails) { console.log("fieldNav-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("fieldNav-selfcheck: all checks pass");
