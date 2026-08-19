// ragBridge.js -- the GPU Brain answers WITH retrieval (RAG). Owns POST /ai/brain/ask.
//   POST /ai/brain/ask { query, k? }
//     -> { ok, answer, sources:[{id,text,distance}], model, grounded, note? }
//
// Pipeline: embed the query (the same embedder /ai/brain/embed + the RAG store use) -> pull the top-k passages
// from the local sqlite-vec store -> build a grounded prompt -> ask the local LLM (Ollama) to answer USING
// those passages. It fails soft at every step, so it is always useful:
//   - no store / sqlite-vec not installed -> no passages, the LLM answers unaided (grounded:false)
//   - no Ollama reachable              -> returns the retrieved passages verbatim (retrieval-only, answer:null)
// Registered BEFORE gpuBrainBridge in server.js (which owns the whole /ai/brain prefix).
"use strict";

function owns(url) { return String(url || "").split("?")[0] === "/ai/brain/ask"; }

async function ollamaGenerate(base, model, prompt, timeoutMs = 30000) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const r = await fetch(base + "/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt, stream: false }), signal: ac.signal });
        if (!r.ok) return null;
        const j = await r.json();
        return (j && typeof j.response === "string") ? j.response.trim() : null;
    } catch (_) { return null; } finally { clearTimeout(t); }
}

function buildPrompt(query, sources) {
    if (!sources.length) return `Question: ${query}\n\nAnswer concisely. If you don't know, say so.`;
    const ctx = sources.map((s, i) => `[${i + 1}] ${s.text}`).join("\n");
    return `You are the ship's computer answering a pilot. Use ONLY the context passages below. If they do not cover the question, say you have nothing on record.\n\nContext:\n${ctx}\n\nQuestion: ${query}\n\nAnswer:`;
}

function handle(req, res, ctx) {
    const send = (ctx && ctx.sendJson) ? ctx.sendJson : ((o, c) => { res.writeHead(c || 200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(o)); });
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); res.end(); return; }
    if (req.method !== "POST") { send({ ok: false, why: "POST only" }, 405); return; }
    let d = ""; req.on("data", (c) => { d += c; if (d.length > 2e6) req.destroy(); });
    req.on("end", async () => {
        let o; try { o = JSON.parse(d || "{}"); } catch (_) { return send({ ok: false, why: "bad body" }, 400); }
        const query = String(o.query || o.text || "").trim();
        if (!query) return send({ ok: false, why: "query required" }, 400);
        const k = Math.min(10, Math.max(1, (o.k | 0) || 4));
        // 1. retrieve (fail soft: no store / no sqlite-vec -> empty)
        let sources = [];
        try { const store = ctx && ctx.store; if (store) { const emb = await store.embed(query); sources = store.ragSearch(emb, k) || []; } } catch (_) {}
        // 2. generate, grounded in the passages (fail soft: no Ollama -> retrieval only)
        let answer = null, model = null;
        try {
            const base = ctx && ctx.ollamaBase ? ctx.ollamaBase() : "http://localhost:11434";
            model = ctx && ctx.ollamaModelName ? await ctx.ollamaModelName() : null;
            if (model) answer = await ollamaGenerate(base, model, buildPrompt(query, sources));
        } catch (_) {}
        send({ ok: true, answer, sources, model, grounded: sources.length > 0, note: answer ? undefined : "retrieval only (no LLM reachable)" });
    });
}

module.exports = { owns, handle, buildPrompt };
