// embed.js -- a dependency-free text embedder (feature hashing / "hashing vectorizer"). It lowercases and
// tokenizes text into words AND character 3-grams, hashes each token into a fixed-dimension vector with a
// SIGNED hash (halves collision bias), weights by sqrt(term-frequency), and L2-normalizes so cosine distance
// is meaningful. This is NOT a deep semantic model -- it captures lexical / subword overlap, which is plenty
// for retrieval over a modest corpus (lore, ship descriptions, mission text, notes) and costs nothing: no
// model download, no native deps, deterministic, instant.
//
// It is deliberately the SAME shape a real model would produce -- text -> unit vector of length `dim` -- so the
// GPU Brain (or transformers.js MiniLM, Ollama, an ONNX model, ...) can be dropped in behind the same /embed
// call later without touching the RAG store, which is embedder-agnostic. The engine ships with this so local
// RAG works out of the box; swap up when you want deeper semantics.
"use strict";

const DEFAULT_DIM = 256;

function fnv1a(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

function tokenize(text) {
    const t = String(text || "").toLowerCase();
    const words = t.split(/[^a-z0-9]+/).filter((w) => w.length);
    const feats = words.slice();
    for (const w of words) { const s = "#" + w + "#"; for (let i = 0; i + 3 <= s.length; i++) feats.push(s.slice(i, i + 3)); }   // char 3-grams
    return feats;
}

// text -> plain Array<number> of length `dim`, L2-normalized (unit vector, or all-zeros for empty input).
function embed(text, dim = DEFAULT_DIM) {
    dim = Math.max(8, dim | 0 || DEFAULT_DIM);
    const v = new Float32Array(dim);
    const tf = new Map();
    for (const tk of tokenize(text)) tf.set(tk, (tf.get(tk) || 0) + 1);
    for (const [tk, c] of tf) {
        const h = fnv1a(tk);
        v[h % dim] += ((h & 0x80000000) ? -1 : 1) * Math.sqrt(c);   // signed hashing
    }
    let n = 0; for (let i = 0; i < dim; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1;
    const out = new Array(dim); for (let i = 0; i < dim; i++) out[i] = v[i] / n;
    return out;
}

function cosine(a, b) { let d = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) d += a[i] * b[i]; return d; }   // both unit vectors

module.exports = { embed, cosine, tokenize, DEFAULT_DIM };
