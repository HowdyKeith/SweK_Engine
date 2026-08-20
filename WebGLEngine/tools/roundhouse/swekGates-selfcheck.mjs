// WebGLEngine/tools/roundhouse/swekGates-selfcheck.mjs -- v2786
//
// Run: node tools/roundhouse/swekGates-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/swekGates.mjs -- concrete SweK gates wired as runGate. Proves: the face-count truth
// (from the RLE surface stack) equals the analytic box surface area 2(wh+hd+wd); the gate accepts the exact
// answer and REJECTS truth+-1 (load-bearing, sabotage-proof); and end-to-end routeWithSwekGate escalates past a
// wrong cheap model to a right strong one and reports verified. Also the DDA hit gate.

import { faceCountGate, makeFaceCountTask, exposedFaceCount, ddaHitGate } from "./swekGates.mjs";
import { routeWithSwekGate } from "./escalateRouteLive.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// mock client: each model answers a fixed faceCount (as JSON in text)
function mockClient(answersByModel) {
    const calls = [];
    return {
        calls,
        messages: {
            create: async ({ model }) => {
                calls.push(model);
                const a = answersByModel[model];
                return { content: [{ type: "text", text: `answer: {"faceCount": ${a}}` }] };
            },
        },
    };
}
const chain = [{ name: "cheap", cost: 1 }, { name: "strong", cost: 25 }];

// 1. face-count truth (RLE stack) == analytic box surface area 2(wh+hd+wd)
{
    let allMatch = true, sample = "";
    for (const [w, h, d] of [[1, 1, 1], [2, 3, 4], [5, 1, 2], [3, 3, 3], [1, 10, 1]]) {
        const t = makeFaceCountTask(w, h, d);
        const truth = exposedFaceCount(t.dims, (x, y, z) => x >= t.box.x0 && x < t.box.x1 && y >= t.box.y0 && y < t.box.y1 && z >= t.box.z0 && z < t.box.z1);
        const analytic = 2 * (w * h + h * d + w * d);
        if (truth !== analytic) { allMatch = false; sample = `${w}x${h}x${d}: rle=${truth} analytic=${analytic}`; }
    }
    ok("face-count: RLE surface stack == analytic 2(wh+hd+wd)", allMatch, sample);
    ok("face-count: 1x1x1 box has 6 faces", exposedFaceCount(makeFaceCountTask(1, 1, 1).dims, (x, y, z) => { const b = makeFaceCountTask(1, 1, 1).box; return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1 && z >= b.z0 && z < b.z1; }) === 6);
}

// 2. the gate is EXACT: accepts the truth, rejects truth+-1 (sabotage -- an off-by-one must fail)
{
    const task = makeFaceCountTask(3, 4, 5);   // truth = 2*(12+20+15) = 94
    const truth = faceCountGate({ faceCount: 0 }, task).truth;
    ok("gate: truth for 3x4x5 is 94", truth === 94, "truth=" + truth);
    ok("gate: accepts the exact answer", faceCountGate({ faceCount: truth }, task).pass === true);
    ok("SABOTAGE: gate rejects truth+1", faceCountGate({ faceCount: truth + 1 }, task).pass === false);
    ok("SABOTAGE: gate rejects truth-1", faceCountGate({ faceCount: truth - 1 }, task).pass === false);
    ok("gate: rejects a non-number answer", faceCountGate({ faceCount: "lots" }, task).pass === false);
}

// 3. END-TO-END: cheap model answers wrong, strong answers right -> escalate to strong, verified
{
    const task = makeFaceCountTask(2, 2, 2);   // truth = 24
    const truth = faceCountGate({}, task).truth;
    const client = mockClient({ cheap: truth - 6, strong: truth });   // cheap guesses 18, strong 24
    const res = await routeWithSwekGate({ task, chain, client, runGate: faceCountGate });
    ok("end-to-end: routes to the strong model (cheap failed the SweK gate)", res.chosen === "strong" && res.verified === true, "chosen=" + res.chosen + " verified=" + res.verified);
    ok("end-to-end: exactly one escalation, both models tried in order", res.escalations === 1 && client.calls.join(",") === "cheap,strong");
    ok("end-to-end: savings vs always-strong computed", res.savings && res.savings.saved === 25 - 26);
}

// 4. CHEAP-WINS: cheap model gets it right -> 0 escalations, one call
{
    const task = makeFaceCountTask(4, 1, 1);   // truth = 2*(4+1+4) = 18
    const truth = faceCountGate({}, task).truth;
    const client = mockClient({ cheap: truth, strong: truth });
    const res = await routeWithSwekGate({ task, chain, client, runGate: faceCountGate });
    ok("cheap-wins: cheap model chosen, 0 escalations, 1 call", res.chosen === "cheap" && res.escalations === 0 && client.calls.length === 1);
}

// 5. EXHAUSTED: both wrong -> strongest returned, verified:false (honest)
{
    const task = makeFaceCountTask(3, 3, 3);
    const client = mockClient({ cheap: 1, strong: 2 });
    const res = await routeWithSwekGate({ task, chain, client, runGate: faceCountGate });
    ok("exhausted: verified:false + escalationExhausted when nobody passes the SweK gate", res.verified === false && res.escalationExhausted === true);
}

// 6. DDA hit gate: accepts the right hit voxel, rejects a wrong one
{
    const task = { ro: [0.5, 0.5, 0.5], rd: [1, 0, 0], solid: [5, 0, 0] };
    ok("ddaHitGate: accepts the true first-hit voxel", ddaHitGate({ hit: [5, 0, 0] }, task).pass === true);
    ok("ddaHitGate: rejects a wrong hit voxel", ddaHitGate({ hit: [4, 0, 0] }, task).pass === false);
}

console.log("swekGates-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
