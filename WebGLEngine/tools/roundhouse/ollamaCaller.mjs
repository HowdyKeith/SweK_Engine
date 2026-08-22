// tools/roundhouse/ollamaCaller.mjs
//
// v2808 - a LOCAL model tier for the escalation chain. escalateRoute's callModel(modelName, task) is an injected
// seam, so a local model drops in exactly where the Anthropic adapter does. Nothing else in the stack changes:
// the SweK gate still decides right from wrong, so it does not care who answered.
//
// WHY THIS IS THE STRONGEST FORM OF THE WHOLE IDEA. Put a local model at the cheap end and it answers for free.
// If it is wrong the gate catches it and the route escalates to a paid model. You then spend money only on the
// questions your own hardware could not answer -- and the savings benchmark starts reporting something real
// instead of relative weights.
//
// COST IS LATENCY HERE, NOT MONEY. A local tier costs ~nothing in dollars and real seconds in wall-clock, so its
// `cost` weight should express TIME. Set it from measurement, not from zero: a local model that is usually wrong
// still spends your seconds before escalating, which is exactly the v2792 finding in a different currency.
//
// The engine already talks to Ollama (ai-bridge/server.js _ollamaBase() -> the llmHost setting or
// http://localhost:11434, with an OLLAMA_MODEL pin), so this adds an adapter, not infrastructure.
//
// fetchImpl is injectable so this gates headlessly with no Ollama running.

export const DEFAULT_OLLAMA = "http://localhost:11434";

const SYSTEM = "You are answering a geometry question. Respond ONLY with JSON, no prose, no code fences.";

// callModel(modelName, task) -> parsed JSON answer. Mirrors modelRoutingCaller's contract exactly.
export function ollamaCaller(base = DEFAULT_OLLAMA, opts = {}) {
    const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!fetchImpl) throw new Error("ollamaCaller: no fetch available; pass opts.fetchImpl");
    const timeoutMs = opts.timeoutMs || 120000;
    return async (model, task) => {
        const prompt = SYSTEM + "\n" + (typeof task === "string" ? task : JSON.stringify(task));
        const ac = typeof AbortController === "function" ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
        try {
            const r = await fetchImpl(base.replace(/\/$/, "") + "/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                ...(ac ? { signal: ac.signal } : {}),
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: false,
                    // format:"json" makes Ollama constrain decoding to valid JSON -- it removes most of the
                    // parsing fragility that makes small local models look worse than they are.
                    format: "json",
                    options: { temperature: 0, num_predict: opts.numPredict || 256 },
                }),
            });
            if (!r.ok) throw new Error("ollama HTTP " + r.status);
            const j = await r.json();
            const text = (j && j.response) || "";
            const m = String(text).match(/\{[\s\S]*\}/);
            if (!m) return { text: String(text) };
            try { return JSON.parse(m[0]); } catch { return { text: String(text) }; }
        } finally { if (timer) clearTimeout(timer); }
    };
}

// What is actually installed. Returns [] when Ollama is not running -- an absent local runtime is an ordinary
// state, not an error: the chain simply has no local tier.
export async function listLocalModels(base = DEFAULT_OLLAMA, opts = {}) {
    const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!fetchImpl) return [];
    try {
        const ac = typeof AbortController === "function" ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), opts.timeoutMs || 4000) : null;
        try {
            const r = await fetchImpl(base.replace(/\/$/, "") + "/api/tags", ac ? { signal: ac.signal } : {});
            if (!r.ok) return [];
            const j = await r.json();
            return (j && Array.isArray(j.models) ? j.models : []).map((m) => ({
                name: m.name || m.model,
                sizeBytes: m.size || 0,
                family: (m.details && m.details.family) || null,
            })).filter((m) => m.name);
        } finally { if (timer) clearTimeout(timer); }
    } catch { return []; }
}

// Build a chain with a local model at the cheap end. localCost expresses LATENCY relative to the API tiers, so
// the savings arithmetic stays meaningful -- see the note at the top of this file.
export function localFirstChain(localModel, apiChain, localCost = 0.2) {
    if (!localModel) return apiChain.slice();
    return [{ name: localModel, cost: localCost, local: true }, ...apiChain];
}

// Route a chain to the right caller: entries marked local go to Ollama, everything else to the API caller.
// This is what lets one chain mix a local tier with paid tiers.
export function mixedCaller({ chain, localCall, apiCall }) {
    const localNames = new Set(chain.filter((m) => m && m.local).map((m) => m.name));
    return async (model, task) => {
        if (localNames.has(model)) {
            if (!localCall) throw new Error("mixedCaller: chain has a local tier but no local caller");
            return localCall(model, task);
        }
        if (!apiCall) throw new Error("mixedCaller: chain has an API tier but no API caller (no key?)");
        return apiCall(model, task);
    };
}
