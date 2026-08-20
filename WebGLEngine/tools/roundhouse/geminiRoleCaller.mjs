// tools/roundhouse/geminiRoleCaller.mjs
//
// v2824 -- a GEMINI tier for the roundhouse loop. Third caller alongside the local Ollama one and the paid
// Anthropic one, and the point of having all three is that they answer to the SAME GATE: whichever proposes a
// claim, the simulation decides whether it stands. So comparing them is a measurement rather than an impression.
//
// IT REUSES THE PROMPTS RATHER THAN RESTATING THEM. proposerSys / evaluatorSys / salvageJson are imported from
// ollamaRoleCaller.mjs, so there is exactly ONE description of what a proposer is in this codebase. A second
// copy would drift, and then two callers would be running subtly different experiments while appearing to run
// the same one -- which is the sort of difference nobody notices until the numbers disagree for no reason.
//
// ON THE "PHYSICIST PERSONA": there is no trick to it. Gemini takes a system instruction natively, and the one
// it gets is the same sentence the local model gets -- "You are the PROPOSER in an automated physics experiment
// on the device X... You may not answer from priors, the simulation decides." The persona is also close to
// irrelevant to correctness: a model told it is a physicist that proposes something wrong is refused by the
// measurement. What the persona buys is BETTER-SHAPED PROPOSALS, not truer ones.
//
// THE KEY NEVER TOUCHES THE BROWSER. Callers are constructed server-side in the bridge, which resolves
// GEMINI_API_KEY from the same Windows credential vault as the Claude key.
//
// fetchImpl is injectable so the whole adapter gates with no key and no network.

import { proposerSys, evaluatorSys, salvageJson } from "./ollamaRoleCaller.mjs";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

// caller(role, payload) -> parsed JSON. Same contract as ollamaRoleCaller's, so deviceBind cannot tell them apart.
export function geminiCaller({
    apiKey = null,
    model = DEFAULT_GEMINI_MODEL,
    endpoint = GEMINI_ENDPOINT,
    proposerTemp = 0.7,
    evaluatorTemp = 0,
    maxOutputTokens = 512,
    timeoutMs = 60000,
    fetchImpl = null,
} = {}) {
    const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!doFetch) throw new Error("geminiCaller: no fetch available; pass opts.fetchImpl");

    return async (role, payload) => {
        const key = apiKey || process.env.GEMINI_API_KEY;
        if (!key) throw new Error("geminiCaller: no GEMINI_API_KEY (store one in the credential vault, or export it for this server)");

        const isProposer = role === "proposer";
        const sys = isProposer
            ? proposerSys(payload.device || "the lab", payload.observables || [])
            : evaluatorSys;

        // Keep the user turn compact: the device's whole state is not needed, and a smaller payload is both
        // cheaper and less likely to bury the instruction under transcript.
        const compact = isProposer
            ? { question: payload.question, device: payload.device, observables: payload.observables, history: (payload.history || []).slice(-3) }
            : { hyp: payload.hyp, observable: payload.observable, verdict: payload.verdict };

        const body = {
            contents: [{ role: "user", parts: [{ text: JSON.stringify(compact) }] }],
            system_instruction: { parts: [{ text: sys }] },
            generationConfig: {
                temperature: isProposer ? proposerTemp : evaluatorTemp,
                maxOutputTokens,
                // Gemini's JSON mode. Same purpose as Ollama's format:"json" -- constrain the decoding rather
                // than hope the model remembers, which is most of what makes small models look unreliable.
                responseMimeType: "application/json",
            },
        };

        const ac = typeof AbortController === "function" ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
        try {
            const res = await doFetch(`${endpoint}/${encodeURIComponent(model)}:generateContent`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                ...(ac ? { signal: ac.signal } : {}),
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                let detail = "";
                try { const e = await res.json(); detail = (e && e.error && e.error.message) ? String(e.error.message).slice(0, 160) : ""; } catch {}
                // 429 is the one worth naming: the free tier is generous per day but tight per minute, and a
                // device round costs two calls, so a fast sweep will find the ceiling before the daily cap.
                if (res.status === 429) throw new Error("gemini rate limit (429) -- free tier is per-minute tight; slow the sweep or use the local tier. " + detail);
                throw new Error(`gemini HTTP ${res.status}${detail ? ": " + detail : ""}`);
            }
            const d = await res.json();
            const text = ((d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [])
                .map((p) => p.text || "").join("");
            if (!text) {
                // A blocked or empty candidate is a real state, not a parse failure -- say which.
                const reason = (d && d.candidates && d.candidates[0] && d.candidates[0].finishReason) || (d && d.promptFeedback && d.promptFeedback.blockReason) || "empty";
                throw new Error("gemini returned no text (finishReason: " + reason + ")");
            }
            return salvageJson(text);
        } finally { if (timer) clearTimeout(timer); }
    };
}

// Availability without spending a request: is a key present at all?
export function geminiKeyAvailable() { return !!process.env.GEMINI_API_KEY; }
