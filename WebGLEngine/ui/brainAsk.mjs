// WebGLEngine/ui/brainAsk.mjs -- v4831
//
// *** ASK THE SHIP'S COMPUTER, AND LET THE PAGE SEE IT THINK IN TWO STAGES. ***
//
// POST /ai/brain/ask (ai-bridge/ragBridge.js) retrieves passages and then generates an answer grounded in them.
// Its one browser caller, ev.html's ship's computer, awaited a single JSON response, so retrieval finishing was
// invisible and the presence orb's `searching` and `weaving` states had no moment to light up during. With
// stream:true the bridge writes one NDJSON line per stage; this reads them as they arrive and re-dispatches each
// as a window event the orb widget listens for:
//
//     engine:brainStage  { stage: "search-start" }
//     engine:brainStage  { stage: "search-done", sources, grounded }
//     engine:brainStage  { stage: "weave-start", sources, model }       only when a model will answer
//     engine:brainStage  { stage: "done", answer, sources, model, grounded, note }
//     engine:brainStage  { stage: "error", why }                         network failure or ok:false
//
// AN OLDER BRIDGE STILL WORKS: one that ignores `stream` answers with the plain JSON object, which is read as the
// "done" stage after a synthetic search-start -- the page gets its answer, the orb gets thinking-then-reply, and
// nothing pretends a weaving stage happened that the server never reported.
"use strict";

/**
 * @param {string} query
 * @param {{k?: number, fetchImpl?: Function, dispatch?: (detail: object) => void, url?: string}} [opts]
 * @returns {Promise<object>} the final object (the "done" stage's fields), or { ok: false, why }
 */
export async function askBrain(query, { k = 4, fetchImpl = globalThis.fetch, dispatch = defaultDispatch, url = "/ai/brain/ask" } = {}) {
    const emit = (detail) => { try { dispatch(detail); } catch (_) {} };
    let res;
    try {
        res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" },
                                     body: JSON.stringify({ query, k, stream: true }) });
    } catch (e) {
        const out = { ok: false, why: "unreachable: " + ((e && e.message) || e) };
        emit({ stage: "error", why: out.why });
        return out;
    }
    const type = String((res.headers && res.headers.get && res.headers.get("Content-Type")) || "");
    if (!/ndjson/i.test(type) || !res.body || !res.body.getReader) {
        // an older bridge: one JSON object, no stages to report beyond the start
        emit({ stage: "search-start" });
        let o; try { o = await res.json(); } catch (_) { o = { ok: false, why: "bad response" }; }
        emit(o && o.ok ? Object.assign({ stage: "done" }, o) : { stage: "error", why: (o && o.why) || "not ok" });
        return o;
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", final = null;
    const take = (line) => {
        if (!line.trim()) return;
        let ev; try { ev = JSON.parse(line); } catch (_) { return; }
        if (ev.stage === "done") { const { stage, ...rest } = ev; final = rest; }
        emit(ev);
    };
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    take(buf + dec.decode());
    if (!final) { const why = "the stream ended without an answer"; emit({ stage: "error", why }); return { ok: false, why }; }
    return final;
}

function defaultDispatch(detail) {
    if (typeof window !== "undefined" && window.dispatchEvent) window.dispatchEvent(new CustomEvent("engine:brainStage", { detail }));
}
