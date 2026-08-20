// tools/roundhouse/roleDecompose.mjs
//
// deer-flow role decomposition (v2789): don't have one model emit the answer -- DECOMPOSE into roles. A PROPOSER
// drafts a candidate, a CRITIC critiques it, the proposer revises using the critique, and only then does the SweK
// gate (the adult) verify. Roles improve the candidate; the gate decides truth. This layers on top of the
// escalation router: each model tier runs a proposer/critic roundtrip; if the SweK gate still rejects, escalate.
//
// The trace captures every role turn (proposer + critic, per round, per tier), so a decomposed run is as
// auditable as a plain one (replayRoute/traceStats from agentTrace.mjs work unchanged). Injected propose/critique
// + runGate mean a mock drives it headless; real models on the rig.

import { escalateRoute, savingsVsStrongest } from "./escalateRoute.mjs";
import { swekGateVerifier } from "./escalateRouteLive.mjs";

function normChain(chain) { return chain.map((m) => (typeof m === "string" ? { name: m, cost: 1 } : { name: m.name, cost: m.cost ?? 1 })); }
function costOf(chain, model) { const m = normChain(chain).find((c) => c.name === model); return m ? m.cost : 1; }

// One proposer/critic roundtrip. propose(task, critiques[]) -> candidate; critique(task, candidate) -> {ok, issues}.
// Loops until the critic is satisfied or maxRounds; feeds critiques forward so the proposer can revise. Returns
// { candidate, turns } where turns is the ordered role log.
export async function roleRoundtrip({ task, propose, critique, maxRounds = 3 }) {
    const turns = [];
    let candidate = null, critiques = [];
    for (let round = 0; round < maxRounds; round++) {
        candidate = await propose(task, critiques);
        turns.push({ role: "proposer", round, output: candidate });
        const crit = await critique(task, candidate);
        turns.push({ role: "critic", round, output: crit });
        if (crit && crit.ok) break;
        if (crit && Array.isArray(crit.issues)) critiques = critiques.concat(crit.issues);
    }
    return { candidate, turns };
}

// Route a task cheap->strong where EACH tier runs a proposer/critic roundtrip, accept the first candidate the
// SweK gate passes, and record the role turns per tier into the trace. propose/critique take the model name so
// they route to the tier. Returns { result, trace } (trace is replay/stats-compatible with agentTrace.mjs).
export async function recordDecomposedRoute({ task, chain, propose, critique, runGate, maxRounds = 3 }) {
    const verify = swekGateVerifier(runGate);
    const steps = [];

    const callModel = async (model, t) => {
        const { candidate, turns } = await roleRoundtrip({
            task: t,
            propose: (tk, crits) => propose(model, tk, crits),
            critique: (tk, cand) => critique(model, tk, cand),
            maxRounds,
        });
        steps.push({ model, cost: costOf(chain, model), output: candidate, roleTurns: turns, verified: null });
        return candidate;
    };
    const vwrap = async (output, t, model) => {
        const pass = await verify(output, t, model);
        const st = steps[steps.length - 1];
        if (st) st.verified = pass;
        return pass;
    };

    const result = await escalateRoute({ task, chain, callModel, verify: vwrap });
    const trace = {
        version: 1,
        taskKind: task && task.kind ? task.kind : "task",
        task,
        chain: normChain(chain),
        steps,
        chosen: result.chosen,
        verified: result.verified,
        escalationExhausted: result.escalationExhausted,
        totalCost: result.totalCost,
        decomposed: true,
        recordedAt: Date.now(),
    };
    return { result: { ...result, savings: savingsVsStrongest(result, chain) }, trace };
}

// Count role turns in a decomposed trace (proposer + critic across all tiers) -- a quick decomposition stat.
export function roleTurnCount(trace) {
    return (trace.steps || []).reduce((n, s) => n + (s.roleTurns ? s.roleTurns.length : 0), 0);
}
