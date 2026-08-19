// embedBridge.js -- the GPU Brain serves text embeddings. Owns POST /ai/brain/embed.
//   POST /ai/brain/embed { text }        -> { ok, embedding:[...], model, dim, semantic }
//   POST /ai/brain/embed { texts:[...] }  -> { ok, embeddings:[[...]], model, dim, semantic }
//   GET  /ai/brain/embed                  -> { ok, model, dim, semantic }   (capability probe; loads the model)
//
// The embedder is embedModel.js: a real semantic model (all-MiniLM-L6-v2 via transformers.js) when installed,
// else the dependency-free hashing vectorizer. Every response carries `model` + `dim` + `semantic` so callers
// know which embedder produced a vector -- vectors from different models are NOT comparable.
//
// Registered BEFORE gpuBrainBridge in server.js, which owns the whole /ai/brain prefix and would otherwise
// swallow this route (the same ordering trap called out in tacticsBridge / bench).
"use strict";
const embedModel = require("./embedModel.js");

function owns(url) { return String(url || "").split("?")[0] === "/ai/brain/embed"; }

function handle(req, res, ctx) {
    const send = (ctx && ctx.sendJson) ? ctx.sendJson : ((o, c) => { res.writeHead(c || 200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(o)); });
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); res.end(); return; }
    if (req.method === "GET") { embedModel._init().then(() => send(Object.assign({ ok: true, kinds: ["text", "texts"] }, embedModel.info()))); return; }
    if (req.method !== "POST") { send({ ok: false, why: "POST only" }, 405); return; }
    let d = ""; req.on("data", (c) => { d += c; if (d.length > 4e6) req.destroy(); });
    req.on("end", async () => {
        try {
            const o = JSON.parse(d || "{}");
            const inf = embedModel.info();
            if (Array.isArray(o.texts)) { const embeddings = await embedModel.embed(o.texts); send(Object.assign({ ok: true, embeddings }, embedModel.info())); return; }
            const embedding = await embedModel.embed(o.text || "");
            send(Object.assign({ ok: true, embedding }, embedModel.info()));
        } catch (e) { send({ ok: false, why: "bad body" }, 400); }
    });
}

module.exports = { owns, handle };
