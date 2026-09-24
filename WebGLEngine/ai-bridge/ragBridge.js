// ragBridge.js -- the GPU Brain answers WITH retrieval (RAG). Owns POST /ai/brain/ask.
//   POST /ai/brain/ask { query, k? }
//     -> { ok, answer, sources:[{id,text,distance}], model, grounded, note? }
//   POST /ai/brain/ask { query, k?, stream: true }     -- v4670
//     -> application/x-ndjson, one object per line, IN STAGE ORDER:
//        { stage:"retrieved", ok, k, sources, grounded }   sent the moment retrieval finishes
//        { stage:"answer",    ok, answer, model, grounded, note? }
//     The non-streaming shape is unchanged and is what every existing caller still gets.
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

        // *** THE TWO STAGES ARE SEPARATELY OBSERVABLE WHEN THE CALLER ASKS -- v4670. ***
        //
        // This handler has always been two-stage: retrieve, then generate grounded in what it retrieved. It
        // has never been two-stage FROM THE PAGE, because both stages went out in one response at the end,
        // and a client awaiting one fetch cannot see stage 1 finish. tools/ship/nextRounds.mjs named that
        // exact thing as the blocker on the orb's `searching` and `weaving` states -- "there is nothing for
        // `searching` to be lit DURING" -- and named this as the unblock.
        //
        // *** IT IS OPT-IN, AND THAT IS NOT TIMIDITY. *** ev.html's askComputer() does a single awaited
        // fetch(...).then(x => x.json()), and an NDJSON body would parse as a syntax error there. A caller
        // that does not ask for the stream gets the SAME single object it always got, byte for byte -- the
        // `stream` flag adds a shape, it does not change one.
        const wantsStream = o.stream === true || o.stream === 1 || o.stream === "1";
        let wrote = false;
        const line = (obj) => { try { res.write(JSON.stringify(obj) + "\n"); wrote = true; } catch (_) {} };
        if (wantsStream) {
            // *** NO Content-Length, SO NODE USES CHUNKED ENCODING AND write() ACTUALLY LEAVES. *** That is
            // the whole mechanism: a buffered response would put both stages on the wire at the same instant
            // and reproduce the defect this is here to fix, while looking like it had fixed it.
            res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache",
                                 "Access-Control-Allow-Origin": "*" });
        }

        // 1. retrieve (fail soft: no store / no sqlite-vec -> empty)
        let sources = [];
        try { const store = ctx && ctx.store; if (store) { const emb = await store.embed(query); sources = store.ragSearch(emb, k) || []; } } catch (_) {}
        // THE RETRIEVAL STAGE GOES OUT HERE, BEFORE THE LLM IS TOUCHED. `sources.length` is what the orb's
        // `weaving` reads -- how many separate passages this answer is being synthesised from -- and the
        // window between this line and the next one is what `searching` is lit during.
        if (wantsStream) line({ stage: "retrieved", ok: true, k, sources, grounded: sources.length > 0 });

        // 2. generate, grounded in the passages (fail soft: no Ollama -> retrieval only)
        let answer = null, model = null;
        try {
            const base = ctx && ctx.ollamaBase ? ctx.ollamaBase() : "http://localhost:11434";
            model = ctx && ctx.ollamaModelName ? await ctx.ollamaModelName() : null;
            if (model) answer = await ollamaGenerate(base, model, buildPrompt(query, sources));
        } catch (_) {}

        const note = answer ? undefined : "retrieval only (no LLM reachable)";
        if (wantsStream) { line({ stage: "answer", ok: true, answer, model, grounded: sources.length > 0, note }); res.end(); return; }
        send({ ok: true, answer, sources, model, grounded: sources.length > 0, note });
    });
}

module.exports = { owns, handle, buildPrompt };
