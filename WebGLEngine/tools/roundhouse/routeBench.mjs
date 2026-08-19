// tools/roundhouse/routeBench.mjs
//
// Cheap-vs-strong savings benchmark (v2792). Runs a BATCH of tasks through the escalation router with a real
// SweK gate as verifier and aggregates what routing actually cost versus always calling the strongest model.
//
// The honest point: routing is NOT free. It saves only when the cheap model is often right AND the gate reliably
// catches when it isn't -- because a wrong cheap answer still costs a cheap call before you escalate. If the
// cheap model is unreliable, routing costs MORE than always-strong (you pay cheap+strong on every task). This
// benchmark quantifies that break-even so the routing decision is measured, not assumed.
//
// Node-side; injected client + runGate mean a mock drives it headless, a live Anthropic client runs it on the rig.

import { routeWithSwekGate } from "./escalateRouteLive.mjs";

function costOf(chain, name) {
    const m = chain.find((c) => (typeof c === "string" ? c : c.name) === name);
    return m && typeof m === "object" && m.cost != null ? m.cost : 1;
}

// Aggregate per-task route results into savings stats.
export function aggregate(perTask, chain) {
    const n = perTask.length;
    const strongestCost = chain.reduce((mx, m) => Math.max(mx, typeof m === "object" && m.cost != null ? m.cost : 1), 0);
    const spent = perTask.reduce((s, t) => s + t.cost, 0);
    const ifAlwaysStrongest = n * strongestCost;
    const verified = perTask.filter((t) => t.verified).length;
    const exhausted = perTask.filter((t) => t.exhausted).length;
    const resolvedAtCheapest = perTask.filter((t) => t.escalations === 0 && t.verified).length;
    const byModel = {};
    for (const t of perTask) if (t.verified) byModel[t.chosen] = (byModel[t.chosen] || 0) + 1;
    return {
        tasks: n,
        verified,
        exhausted,
        spent,
        ifAlwaysStrongest,
        saved: ifAlwaysStrongest - spent,
        savedPct: ifAlwaysStrongest ? (ifAlwaysStrongest - spent) / ifAlwaysStrongest : 0,
        cheapWinRate: n ? resolvedAtCheapest / n : 0,
        byModel,
    };
}

// Run every task through routeWithSwekGate and aggregate.
export async function runBatch({ tasks, chain, client, runGate, callerOpts }) {
    const perTask = [];
    for (const task of tasks) {
        const res = await routeWithSwekGate({ task, chain, client, runGate, callerOpts });
        perTask.push({ chosen: res.chosen, verified: res.verified, escalations: res.escalations, cost: res.totalCost, exhausted: res.escalationExhausted });
    }
    return { stats: aggregate(perTask, chain), perTask };
}

// Model-accuracy mock: a model returns the CORRECT answer with probability accuracy[model], else a wrong one.
// truthFn(task) supplies the correct answer; the SweK gate is what actually verifies (so "cheap wrong" is caught
// by the gate, not asserted by the mock). Deterministic per (model, task, seed).
export function accuracyClient({ accuracy, truthFn, wrongKey = "faceCount", seed = 1 }) {
    const calls = [];
    const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
    return {
        calls,
        messages: {
            create: async ({ model, messages }) => {
                calls.push(model);
                const task = JSON.parse(messages[0].content);
                const truth = truthFn(task);
                const r = hash(model + "|" + messages[0].content + "|" + seed);
                const correct = r < (accuracy[model] ?? 0.5);
                const answer = correct ? truth : truth + 1 + Math.floor(r * 5);   // plausible-but-wrong
                return { content: [{ type: "text", text: `{"${wrongKey}": ${answer}}` }] };
            },
        },
    };
}

// Human-readable report.
export function benchReport(stats) {
    const pct = (x) => (100 * x).toFixed(1) + "%";
    return [
        `tasks ${stats.tasks}  verified ${stats.verified}  exhausted ${stats.exhausted}`,
        `spent ${stats.spent}  vs always-strongest ${stats.ifAlwaysStrongest}  saved ${stats.saved} (${pct(stats.savedPct)})`,
        `cheap-win rate ${pct(stats.cheapWinRate)}`,
        `resolved by model: ${Object.entries(stats.byModel).map(([m, c]) => `${m}:${c}`).join("  ") || "(none)"}`,
    ].join("\n");
}
