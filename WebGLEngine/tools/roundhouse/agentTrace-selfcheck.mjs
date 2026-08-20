// WebGLEngine/tools/roundhouse/agentTrace-selfcheck.mjs -- v2787
//
// Run: node tools/roundhouse/agentTrace-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/agentTrace.mjs -- deer-flow step replay. Records a real route (concrete SweK
// faceCountGate + mock client), then AUDITS it by re-verifying the recorded outputs. Pins: the trace captures
// each step + verdict; stats report escalations/cost/savings; replay of an honest trace is consistent; SABOTAGE
// -- tampering a recorded output flips the replay decision (proving replay re-verifies, not trusts the record);
// serialize round-trip survives replay.

import { recordRoute, replayRoute, traceStats, serializeTrace, deserializeTrace } from "./agentTrace.mjs";
import { faceCountGate, makeFaceCountTask } from "./swekGates.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

function mockClient(answersByModel) {
    const calls = [];
    return { calls, messages: { create: async ({ model }) => { calls.push(model); return { content: [{ type: "text", text: `{"faceCount": ${answersByModel[model]}}` }] }; } } };
}
const chain = [{ name: "cheap", cost: 1 }, { name: "strong", cost: 25 }];

// build a route where cheap is wrong and strong is right
const task = makeFaceCountTask(2, 3, 4);                 // truth = 2*(6+12+8) = 52
const truth = faceCountGate({}, task).truth;

// 1. RECORD captures each step + its verdict
{
    const client = mockClient({ cheap: truth - 4, strong: truth });
    const { result, trace } = await recordRoute({ task, chain, client, runGate: faceCountGate });
    ok("record: truth is 52", truth === 52, "truth=" + truth);
    ok("record: trace has one step per model tried (cheap, strong)", trace.steps.length === 2 && trace.steps[0].model === "cheap" && trace.steps[1].model === "strong");
    ok("record: verdicts recorded (cheap false, strong true)", trace.steps[0].verified === false && trace.steps[1].verified === true);
    ok("record: chosen strong, verified", result.chosen === "strong" && result.verified === true);
    ok("record: task stored for replay", trace.task && trace.task.kind === "faceCount");
}

// 2. STATS summary
{
    const client = mockClient({ cheap: truth - 4, strong: truth });
    const { trace } = await recordRoute({ task, chain, client, runGate: faceCountGate });
    const st = traceStats(trace);
    ok("stats: 2 steps, 1 escalation", st.steps === 2 && st.escalations === 1);
    ok("stats: totalCost = 1 + 25 = 26, saved = 25 - 26", st.totalCost === 26 && st.saved === 25 - 26);
    ok("stats: perStep verdicts mirror the trace", st.perStep[0].verified === false && st.perStep[1].verified === true);
}

// 3. REPLAY of an honest trace is consistent (re-verifying reproduces the recorded decisions)
{
    const client = mockClient({ cheap: truth - 4, strong: truth });
    const { trace } = await recordRoute({ task, chain, client, runGate: faceCountGate });
    const audit = await replayRoute(trace, { runGate: faceCountGate });
    ok("replay: honest trace re-verifies consistently (no model re-call)", audit.consistent === true);
    ok("replay: each step's replayed verdict matches the recorded one", audit.redecided.every((r) => r.recorded === r.replayed));
}

// 4. SABOTAGE: tamper a recorded output -> replay flips that decision (audit catches it)
{
    const client = mockClient({ cheap: truth - 4, strong: truth });
    const { trace } = await recordRoute({ task, chain, client, runGate: faceCountGate });
    // forge the cheap step to claim the right answer without the gate having passed it
    trace.steps[0].output = { faceCount: truth };        // tamper: output now says the truth...
    // ...but trace still records verified:false. replay re-verifies -> now TRUE -> mismatch caught.
    const audit = await replayRoute(trace, { runGate: faceCountGate });
    ok("SABOTAGE: tampered recorded output makes replay INCONSISTENT (re-verification, not trust)", audit.consistent === false);
    ok("SABOTAGE: the flipped step is identified", audit.redecided[0].recorded === false && audit.redecided[0].replayed === true);
}

// 5. SERIALIZE round-trip survives replay
{
    const client = mockClient({ cheap: truth - 4, strong: truth });
    const { trace } = await recordRoute({ task, chain, client, runGate: faceCountGate });
    const round = deserializeTrace(serializeTrace(trace));
    const audit = await replayRoute(round, { runGate: faceCountGate });
    ok("serialize: JSON round-trip preserves the trace", round.steps.length === trace.steps.length && round.chosen === trace.chosen);
    ok("serialize: replay works on the deserialized trace", audit.consistent === true);
}

// 6. DETERMINISM: recording the same route twice yields identical step verdicts
{
    const a = (await recordRoute({ task, chain, client: mockClient({ cheap: truth - 4, strong: truth }), runGate: faceCountGate })).trace;
    const b = (await recordRoute({ task, chain, client: mockClient({ cheap: truth - 4, strong: truth }), runGate: faceCountGate })).trace;
    ok("determinism: same route -> same step verdicts", JSON.stringify(a.steps.map(s => [s.model, s.verified])) === JSON.stringify(b.steps.map(s => [s.model, s.verified])));
}

console.log("agentTrace-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
