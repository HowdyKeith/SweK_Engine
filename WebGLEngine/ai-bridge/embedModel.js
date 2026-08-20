// embedModel.js -- the active text embedder for /ai/brain/embed + local RAG. Prefers a REAL semantic model
// (all-MiniLM-L6-v2 via transformers.js, 384-d, sentence embeddings) and falls back to the dependency-free
// hashing embedder (embed.js, 256-d, lexical) when transformers.js isn't installed or the model can't be
// fetched. The choice is made ONCE, on first use, so the vector dimension is stable for the life of the
// process (the vec table's dimension is fixed by the first vector, so it must not change under it). The first
// embed call pays the model-load cost; the rest are fast.
//
// Enable semantic RAG on the rig:  npm i @huggingface/transformers   (or @xenova/transformers)
// The model (~90 MB ONNX) downloads once from the HuggingFace hub and is cached under ~/.cache; after that it
// runs fully offline. Switching embedders changes the dimension, so re-embed the corpus when you do (the
// `model` tag on every response is there to catch mixing vectors from different models).
"use strict";
const hashing = require("./embed.js");

let _mode = null;          // null (undecided) | "remote" | "minilm" | "hashing"
let _extractor = null;     // the transformers.js feature-extraction pipeline
let _initP = null;         // in-flight init promise (so concurrent first calls share one load)
let _dtype = null, _device = null;   // active quantization + execution device (MiniLM path)
let _remoteInfo = null;    // { model, dim, provider } when a remote embedder service is in use

// A remote embedder service (e.g. the Python Optimum/ONNX Runtime service in embed_service.py). Highest
// priority when SWEK_EMBED_URL is set AND reachable; if it's down or unset we fall through to local MiniLM,
// then to the hashing embedder. The service contract: POST { text } -> { embedding, model, provider }, and
// POST { texts:[...] } -> { embeddings, ... }.
const _remoteUrl = (process.env.SWEK_EMBED_URL || "").trim() || null;

async function _remoteEmbedRaw(input) {
    const body = Array.isArray(input) ? { texts: input } : { text: input };
    const r = await fetch(_remoteUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("remote embed HTTP " + r.status);
    const j = await r.json();
    const out = Array.isArray(input) ? j.embeddings : j.embedding;
    if (!Array.isArray(out)) throw new Error("remote embed: bad response");
    return out;
}
async function _remoteEmbed(input) { try { return await _remoteEmbedRaw(input); } catch (_) { return await _remoteEmbedRaw(input); } }   // one retry for a transient blip

async function _init() {
    if (_mode) return;
    // 0. remote Optimum/ONNX service (CUDA / DirectML / CoreML / OpenVINO / CPU -- whatever it runs), if reachable
    if (_remoteUrl) {
        try {
            const probe = await _remoteEmbedRaw("probe");
            if (Array.isArray(probe) && probe.length) {
                let meta = {}; try { const g = await fetch(_remoteUrl, { method: "GET" }); if (g.ok) meta = await g.json(); } catch (_) {}
                _mode = "remote"; _remoteInfo = { model: meta.model || "remote", dim: probe.length, provider: meta.provider || "remote" };
                try { console.log(`[embed] remote embedder: ${_remoteInfo.model} (${_remoteInfo.dim}-d, ${_remoteInfo.provider}) @ ${_remoteUrl}`); } catch (_) {}
                return;
            }
        } catch (_) { try { console.log(`[embed] remote embedder ${_remoteUrl} unreachable -> local`); } catch (_) {} }
    }
    try {
        // Speed knobs (both optional). q8 = int8-quantized MiniLM -> markedly faster on CPU for a tiny accuracy
        // cost; device "webgpu"/"cuda" runs it on the GPU. transformers.js runs the model on ONNX Runtime under
        // the hood, so this IS the ONNX fast path -- no separate export needed for the common cases.
        const dtype = process.env.SWEK_EMBED_DTYPE || "q8";
        const device = process.env.SWEK_EMBED_DEVICE || undefined;   // undefined -> library default (CPU)
        let mod, opts;
        try { mod = await import("@huggingface/transformers"); opts = { dtype, device }; }   // v3: dtype + device
        catch (_) { mod = await import("@xenova/transformers"); opts = { quantized: dtype !== "fp32" }; }   // v2: quantized flag
        _extractor = await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", opts);
        _dtype = dtype; _device = device || "cpu";
        _mode = "minilm";
        try { console.log(`[embed] semantic model ready: all-MiniLM-L6-v2 (384-d, ${_dtype}, ${_device})`); } catch (_) {}
    } catch (e) {
        _mode = "hashing";
        try { console.log("[embed] transformers.js/MiniLM unavailable -> hashing embedder (256-d). `npm i @huggingface/transformers` for semantic RAG."); } catch (_) {}
    }
}

function ready() { return _mode !== null; }
function info() {
    if (_mode === "remote") return { model: _remoteInfo.model, dim: _remoteInfo.dim, semantic: true, remote: true, provider: _remoteInfo.provider };
    return _mode === "minilm" ? { model: "all-MiniLM-L6-v2", dim: 384, semantic: true, dtype: _dtype, device: _device } : { model: "hashing-v1", dim: 256, semantic: false };
}

async function embedOne(text) {
    if (!_mode) { _initP = _initP || _init(); await _initP; }
    if (_mode === "remote") return _remoteEmbed(text);
    if (_mode === "minilm") { const out = await _extractor(String(text || ""), { pooling: "mean", normalize: true }); return Array.from(out.data); }
    return hashing.embed(String(text || ""));   // 256-d lexical, already unit-normalized
}

// text -> Promise<vector>; array of texts -> Promise<vector[]>. Dimension is the active model's, always.
async function embed(input) {
    if (!_mode) { _initP = _initP || _init(); await _initP; }
    if (_mode === "remote" && Array.isArray(input)) return _remoteEmbed(input);   // one round-trip for a batch
    if (Array.isArray(input)) { const out = []; for (const t of input) out.push(await embedOne(t)); return out; }
    return embedOne(input);
}

module.exports = { embed, ready, info, _init };
