// tools/roundhouse/escalateRouteLive.mjs
//
// Live wiring for escalateRoute (v2785). escalateRoute walks a cheap->strong chain and returns the first model
// whose output survives a verifier. This module supplies the two injected seams for the real rig:
//
//   1. modelRoutingCaller(client) -- a callModel(modelName, task) that routes each task to the NAMED model via
//      the Anthropic SDK. (anthropicCaller in roundhouse.mjs dispatches by ROLE and binds one model, so it does
//      not fit escalateRoute's (model, task) shape -- this is the adapter.)
//   2. swekGateVerifier(runGate) -- the load-bearing verifier. The "adult in the room" is a SweK gate, not a
//      bigger model: runGate runs a selfcheck / measured-observable check on the output and says pass/fail.
//
// routeWithSwekGate composes both with escalateRoute. Injectable client + runGate mean the gate drives this
// headless with no API key; the real Anthropic client runs on the rig where the key lives.

import { escalateRoute, savingsVsStrongest } from "./escalateRoute.mjs";

// callModel(modelName, task) -> parsed model output. Routes to modelName via client.messages.create.
// opts: { system, maxTokens, parseJson (default true) }.
export function modelRoutingCaller(client, opts = {}) {
    if (!client || typeof client.messages?.create !== "function") throw new Error("modelRoutingCaller: client.messages.create required");
    const system = opts.system || "Solve the task. Respond ONLY with the answer as JSON.";
    const maxTokens = opts.maxTokens || 1024;
    const parseJson = opts.parseJson !== false;
    return async (modelName, task) => {
        const r = await client.messages.create({
            model: modelName,
            system,
            max_tokens: maxTokens,
            messages: [{ role: "user", content: typeof task === "string" ? task : JSON.stringify(task) }],
        });
        const text = (r.content.find((b) => b.type === "text") || {}).text || "";
        if (!parseJson) return text;
        const m = text.match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : { text };
    };
}

// verify(output, task, model) -> bool, built from a SweK gate. runGate may return a boolean or { pass } and may
// be async. This is where a selfcheck ("does the proposed code pass its gate?") or a truth check ("does the
// measured observable match?") plugs in -- routing without it is just guessing.
export function swekGateVerifier(runGate) {
    if (typeof runGate !== "function") throw new Error("swekGateVerifier: runGate must be a function (the SweK gate)");
    return async (output, task, model) => {
        const res = await runGate(output, task, model);
        return (res && typeof res === "object") ? !!res.pass : !!res;
    };
}

// Compose: route task cheap->strong through live models, accept the first output the SweK gate passes. Returns
// escalateRoute's result plus savingsVsStrongest.
export async function routeWithSwekGate({ task, chain, client, runGate, callerOpts }) {
    const callModel = modelRoutingCaller(client, callerOpts);
    const verify = swekGateVerifier(runGate);
    const result = await escalateRoute({ task, chain, callModel, verify });
    return { ...result, savings: savingsVsStrongest(result, chain) };
}

// A ready-made default chain (cheap -> strong). `cost` is a RELATIVE weight used for the savings arithmetic, not
// a price -- set it from the current per-token rates for the models you actually route to.
// Model strings must be live API identifiers; a stale string fails the call outright, which is why they are
// pinned here in one place rather than scattered through callers. Verify against the models doc before a run:
// https://docs.claude.com/en/docs/about-claude/models
export const DEFAULT_CHAIN = [
    { name: "claude-haiku-4-5-20251001", cost: 1 },
    { name: "claude-sonnet-5", cost: 5 },
    { name: "claude-opus-4-8", cost: 25 },
];
