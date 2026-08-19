// WebGLEngine/brain/fleet-summary-selfcheck.mjs — v2255
//   run: node brain/fleet-summary-selfcheck.mjs

import { fleetTrainingSummary } from "./fleetSummary.js";

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("fleet-summary-selfcheck");
{
    const empty = fleetTrainingSummary([]);
    ok("empty fleet -> zeros, null reward", empty.count === 0 && empty.training === 0 && empty.totalSteps === 0 && empty.meanReward === null);

    const idle = fleetTrainingSummary([{ id: "gpuA", gpu: "GTX 1080", role: "all", lastSeen: 1000, learn: null }], 1500);
    ok("a connected brain with no trainer reads as not-training", idle.count === 1 && idle.training === 0 && idle.rows[0].steps === 0);

    const pool = fleetTrainingSummary([
        { id: "gpuA", gpu: "GTX 1080", role: "policy", solveMsEwma: 4, lastSeen: 900, learn: { attack: { steps: 1200, buffer: 800, avgReward: 0.4 } } },
        { id: "gpuB", gpu: "GTX 1070", role: "policy", solveMsEwma: 6, lastSeen: 900, learn: { attack: { steps: 800, buffer: 500, avgReward: 0.2 } } },
        { id: "igpu", gpu: "UHD 620", role: "nav", solveMsEwma: 40, lastSeen: 900, learn: { attack: { steps: 100, buffer: 100, avgReward: null } } },
    ], 1000);
    ok("pool sums steps across brains", pool.totalSteps === 2100, "got " + pool.totalSteps);
    ok("pool sums buffer across brains", pool.totalBuffer === 1400, "got " + pool.totalBuffer);
    ok("all three count as training", pool.training === 3);
    ok("mean reward ignores the null-reward brain", pool.meanReward === 0.3, "got " + pool.meanReward);
    ok("fastest brain sorts first", pool.rows[0].id === "gpuA" && pool.rows[0].solveMs === 4);
    ok("a slow but valid brain still appears", pool.rows.some((r) => r.id === "igpu" && r.training));

    const stale = fleetTrainingSummary([{ id: "old", gpu: "x", role: "all", ageMs: 30000, learn: { attack: { steps: 5, buffer: 5, avgReward: 0.1 } } }]);
    ok("a long-un-heard brain is flagged not-live (but still counted)", stale.rows[0].live === false && stale.count === 1);

    const dom = fleetTrainingSummary([{ id: "g", gpu: "1080", role: "policy", lastSeen: 900, learn: {
        attack: { steps: 1000, buffer: 700, avgReward: 0.5 },
        aggro: { steps: 400, buffer: 300, avgReward: 0.2 },
        civdef: { steps: 200, buffer: 150, avgReward: null },
        civtarget: { steps: 100, buffer: 90, avgReward: 0.1 },
        packorder: { steps: 50, buffer: 40, avgReward: 0.3 },
        domains: { some: "aggregate not a trainer" },
    } }], 1000).rows[0];
    ok("all five named trainers are extracted", dom.trainers.length === 5);
    ok("attack sorts first in the trainer list", dom.trainers[0].name === "attack" && dom.trainers[0].steps === 1000);
    ok("domains breakdown excludes attack (four sub-policies)", dom.domains.length === 4 && dom.domains.every((t) => t.name !== "attack"));
    ok("the domainStats aggregate is not mistaken for a trainer", !dom.trainers.some((t) => t.name === "domains"));
    ok("a domain's stats round-trip", dom.domains.find((t) => t.name === "aggro").steps === 400);
}

console.log(`\nfleet-summary-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
