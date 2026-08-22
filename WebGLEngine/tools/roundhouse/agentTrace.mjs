// tools/roundhouse/agentTrace.mjs
//
// deer-flow-style step replay for the escalation router (v2787). The maturity pillars deer-flow adds on top of
// cheap->verify->escalate are REMEMBER (record every step) and REPLAY-OWN-STEPS (audit them later). This module:
//
//   recordRoute(...)  -- run routeWithSwekGate while recording each step { model, output, verified, cost } into a
//                        serializable trace.
//   replayRoute(...)  -- RE-VERIFY the recorded model outputs through a (fresh) SweK gate WITHOUT re-calling any
//                        model. Deterministic gate -> the recorded accept/reject decisions must reproduce exactly;
//                        if a recorded output was tampered, the replay's re-verification flips and catches it.
//                        This is the audit: the verifier, not the record, is the source of truth.
//   traceStats(...)   -- the benchmark summary (escalations, cost, savings, which step won).
//   serialize/deserializeTrace -- JSON round-trip (the "remember" pillar persisted).
//
// Node-side tool; deterministic when the SweK gate is (the concrete swekGates are).

import { escalateRoute, savingsVsStrongest } from "./escalateRoute.mjs";
import { modelRoutingCaller, swekGateVerifier } from "./escalateRouteLive.mjs";

function normChain(chain) {
    return chain.map((m) => (typeof m === "string" ? { name: m, cost: 1 } : { name: m.name, cost: m.cost ?? 1 }));
}
function costOf(chain, model) {
    const m = normChain(chain).find((c) => c.name === model);
    return m ? m.cost : 1;
}

// Run the route and record every step. Returns { result, trace }. The trace stores the task so replay can
// re-verify without the model.
// v2808 - `callModel` is now an optional injected seam. It exists because a MIXED chain (a local Ollama tier at
// the cheap end, paid API tiers above it) needs one caller that dispatches by model name, and modelRoutingCaller
// only knows how to reach the Anthropic SDK. When callModel is supplied, `client` is not required at all -- which
// is what makes a local-only, keyless route possible.
export async function recordRoute({ task, chain, client, runGate, callerOpts, callModel: injectedCall }) {
    if (!injectedCall && !client) throw new Error("recordRoute: needs a client, or an injected callModel (e.g. a local/mixed caller)");
    const baseCall = injectedCall || modelRoutingCaller(client, callerOpts);
    const baseVerify = swekGateVerifier(runGate);
    const steps = [];

    const callModel = async (model, t) => {
        const output = await baseCall(model, t);
        steps.push({ model, cost: costOf(chain, model), output, verified: null });
        return output;
    };
    const verify = async (output, t, model) => {
        const pass = await baseVerify(output, t, model);
        const step = steps[steps.length - 1];       // the step just produced by callModel(model)
        if (step) step.verified = pass;
        return pass;
    };

    const result = await escalateRoute({ task, chain, callModel, verify });
    const trace = {
        version: 1,
        taskKind: task && task.kind ? task.kind : "task",
        task,                                        // kept so replay can re-run the SweK gate
        chain: normChain(chain),
        steps,
        chosen: result.chosen,
        verified: result.verified,
        escalationExhausted: result.escalationExhausted,
        totalCost: result.totalCost,
        recordedAt: Date.now(),
    };
    return { result: { ...result, savings: savingsVsStrongest(result, chain) }, trace };
}

// Audit: re-verify the recorded outputs through the SweK gate. consistent === true means the trace's recorded
// decisions still hold; a mismatch means a recorded output no longer verifies the way the trace claims (drift or
// tampering). No model calls -- pure replay.
export async function replayRoute(trace, { runGate }) {
    const verify = swekGateVerifier(runGate);
    const redecided = [];
    let consistent = true;
    for (const step of trace.steps) {
        const replayed = await verify(step.output, trace.task, step.model);
        redecided.push({ model: step.model, recorded: step.verified, replayed });
        if (replayed !== step.verified) consistent = false;
    }
    return { consistent, redecided };
}

// Benchmark / audit summary.
export function traceStats(trace) {
    const escalations = Math.max(0, trace.steps.length - 1);
    const totalCost = trace.steps.reduce((s, st) => s + (st.cost || 0), 0);
    const strongest = trace.chain.reduce((mx, m) => Math.max(mx, m.cost), 0);
    return {
        steps: trace.steps.length,
        escalations,
        totalCost,
        chosen: trace.chosen,
        verified: trace.verified,
        escalationExhausted: trace.escalationExhausted,
        ifAlwaysStrongest: strongest,
        saved: strongest - totalCost,
        perStep: trace.steps.map((s) => ({ model: s.model, verified: s.verified })),
    };
}

export function serializeTrace(trace) { return JSON.stringify(trace); }
export function deserializeTrace(json) { return typeof json === "string" ? JSON.parse(json) : json; }
