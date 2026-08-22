// tools/roundhouse/ollamaRoleCaller.mjs
//
// RENAMED ON FOLD-IN (v2812). This arrived as ollamaCaller.mjs and collided with an existing file of that name --
// but they are different things, not rival implementations, and the distinction is one this codebase already
// documents:
//
//   ollamaCaller.mjs      dispatches by MODEL  -- callModel(modelName, task) for escalateRoute's chain (v2808)
//   ollamaRoleCaller.mjs  dispatches by ROLE   -- caller("proposer"|"evaluator", ctx) for the roundhouse
//                                                 proposer/builder/evaluator loop (this file)
//
// That is exactly the same split as anthropicCaller (role) vs modelRoutingCaller (model), noted when the live
// wiring was built. Both are needed; only the filename was in conflict, so this one took the more descriptive
// name and its two importers were updated.

import { compactHistory } from "./deviceBind.mjs";

// ---- role prompts: device-parameterized (the device name + observable list are injected per call) ---------------
export const proposerSys = (device, observables) =>
    "You are the PROPOSER in an automated physics experiment on the device '" + device + "'. State ONE falsifiable " +
    "claim about a MEASURABLE observable from this list: " + observables.join(", ") + ". Respond ONLY with JSON: " +
    "{mode, r0?, g?, config?, claim:{observable, equals?|target?+tol?|max?|min?|withinBracket?}}. You may not answer " +
    "from priors -- the simulation decides. Use the history (claims, params, measured verdicts) to refine toward a " +
    "decisive run. Example: {\"mode\":\"onset\",\"claim\":{\"observable\":\"captureOnsetR\",\"target\":6,\"tol\":0.1}}";
export const evaluatorSys =
    "You are the EVALUATOR. You see a claim, the MEASURED observable the simulation produced, and a physics verdict " +
    "already computed from the numbers. Do NOT overrule the verdict; interpret it in one sentence and suggest next " +
    "parameters. Respond ONLY with JSON: {reading:string, suggestNext?:object}.";

// ---- structured-output schemas (loose on purpose: devices differ; the device clamp owns physical ranges) --------
export const PROPOSER_SCHEMA = {
    type: "object",
    properties: {
        mode: { type: "string" },
        r0: { type: "number" },
        g: { type: "number" },
        config: { type: "object" },
        claim: {
            type: "object",
            properties: {
                observable: { type: "string" },
                equals: {}, target: { type: "number" }, tol: { type: "number" },
                max: { type: "number" }, min: { type: "number" }, withinBracket: { type: "number" },
            },
            required: ["observable"],
        },
    },
    required: ["mode", "claim"],
};
export const EVALUATOR_SCHEMA = {
    type: "object",
    properties: { reading: { type: "string" }, suggestNext: { type: "object" } },
    required: ["reading"],
};

// salvage parse: strict first, then strip code fences, then first {...} span. Returns null on defeat.
export function salvageJson(text) {
    if (typeof text !== "string") return null;
    try { return JSON.parse(text); } catch {}
    const unfenced = text.replace(/```(?:json)?/gi, "");
    try { return JSON.parse(unfenced.trim()); } catch {}
    const m = unfenced.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
}

export function ollamaCaller({
    host = "http://localhost:11434",
    model = "qwen2.5:7b",
    numCtx = 8192,
    proposerTemp = 0.7,
    evaluatorTemp = 0,
    keepAlive = "10m",
    historyKeep = 3,
    fetchImpl = null,          // injectable for tests; defaults to global fetch
} = {}) {
    const doFetch = fetchImpl || fetch;

    return async (role, payload) => {
        const isProposer = role === "proposer";
        const sys = isProposer
            ? proposerSys(payload.device || "the lab", payload.observables || [])
            : evaluatorSys;
        // context-budget aid: numbers-only history, last N rounds
        const compact = { ...payload };
        if (Array.isArray(compact.history)) compact.history = compactHistory(compact.history, historyKeep);
        delete compact.observables;   // already in the system prompt

        const body = {
            model,
            stream: false,
            format: isProposer ? PROPOSER_SCHEMA : EVALUATOR_SCHEMA,
            keep_alive: keepAlive,
            options: { num_ctx: numCtx, temperature: isProposer ? proposerTemp : evaluatorTemp },
            messages: [
                { role: "system", content: sys },
                { role: "user", content: JSON.stringify(compact) },
            ],
        };

        const once = async () => {
            const res = await doFetch(host + "/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error("ollama http " + res.status);
            const data = await res.json();
            return salvageJson(data && data.message && data.message.content);
        };

        let parsed = null;
        try { parsed = await once(); } catch (err) {
            // one retry covers transient load (model cold-start) and one bad sample
            try { parsed = await once(); } catch (err2) {
                throw new Error("ollama unreachable/failed twice: " + (err2.message || err2));
            }
        }
        if (parsed === null) parsed = await once();     // parse-level retry
        if (parsed === null) {
            // final fallback keeps the LOOP alive: an empty proposal reaches the
            // device's defaults() clamp, which builds a conservative run; the
            // numeric verdict then refuses and the history shows the model why.
            return isProposer ? { mode: "orbit", claim: { observable: "captured", equals: false } } : { reading: "unparseable" };
        }
        return parsed;
    };
}
