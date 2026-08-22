// FILE: ai-bridge/aiProviders.js
// Multi-provider chat for the bridge — the Node sibling of AIChat.bas.
// Keys come from the Windows vault (aiCreds), never the client. Uses global
// fetch (Node 18+). Returns { ok, text } or { ok:false, error }.

const aiCreds = require("./aiCreds.js");
const fs = require("fs"), os = require("os"), path = require("path");

const MODELS = {
    grok:   "grok-2-latest",
    openai: "gpt-4o-mini",
    claude: "claude-sonnet-5",
    gemini: "gemini-2.5-flash",
    hermes: "hermes-agent",
    mlx: "default",
};

async function chat(provider, prompt, opts = {}) {
    provider = String(provider || "").toLowerCase();
    if (provider === "ollama") return ollamaChat(prompt, opts);   // v1119 — local LLM, no key needed
    if (provider === "hermes") return hermesChat(prompt, opts);   // v1137 — local Hermes Agent (memory/skills/tools)
    if (provider === "mlx" || provider === "localai") return mlxChat(prompt, opts);   // v1138 — any local OpenAI-compatible server (MLX on Apple Silicon, etc.)
    const key = aiCreds.getApiKey(provider === "anthropic" ? "claude" : provider);
    if (!key) return { ok: false, error: `no_key_for_${provider}` };
    const model = opts.model || MODELS[provider];
    const sys = opts.system || "";
    try {
        if (provider === "grok" || provider === "openai") {
            const url = provider === "grok"
                ? "https://api.x.ai/v1/chat/completions"
                : "https://api.openai.com/v1/chat/completions";
            const messages = [];
            if (sys) messages.push({ role: "system", content: sys });
            messages.push({ role: "user", content: prompt });
            const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
                body: JSON.stringify({ model, messages }),
            });
            const d = await r.json();
            if (!r.ok) return { ok: false, error: `http_${r.status}:${(d?.error?.message || "").slice(0, 140)}` };
            return { ok: true, text: d?.choices?.[0]?.message?.content || "" };
        }
        if (provider === "claude" || provider === "anthropic") {
            const body = { model, max_tokens: opts.maxTokens || 1024, messages: [{ role: "user", content: prompt }] };
            if (sys) body.system = sys;
            const r = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
                body: JSON.stringify(body),
            });
            const d = await r.json();
            if (!r.ok) return { ok: false, error: `http_${r.status}:${(d?.error?.message || "").slice(0, 140)}` };
            return { ok: true, text: (d?.content || []).map(b => b.text || "").join("") };
        }
        if (provider === "gemini" || provider === "google") {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            if (sys) payload.system_instruction = { parts: [{ text: sys }] };
            const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!r.ok) return { ok: false, error: `http_${r.status}:${(d?.error?.message || "").slice(0, 140)}` };
            return { ok: true, text: (d?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("") };
        }
        return { ok: false, error: `unknown_provider_${provider}` };
    } catch (e) {
        return { ok: false, error: "fetch:" + (e?.message || String(e)) };
    }
}

// v1119 — local Ollama chat (no API key). Keeps the whole voice loop offline.
// POSTs to Ollama's /api/chat (default 127.0.0.1:11434). Model must be pulled
// locally (e.g. `ollama pull llama3.2`); pass opts.model to pick it.
async function ollamaChat(prompt, opts = {}) {
    const host = (opts.ollamaHost || process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/+$/, "");
    const model = opts.model || process.env.OLLAMA_MODEL || "llama3.2";
    const messages = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: prompt });
    let signal; try { signal = AbortSignal.timeout(opts.timeout || 60000); } catch {}
    try {
        const r = await fetch(host + "/api/chat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, stream: false, messages }), signal,
        });
        if (!r.ok) return { ok: false, error: `ollama_http_${r.status} (model '${model}' pulled? is ollama running at ${host}?)` };
        const d = await r.json();
        return { ok: true, text: String((d && d.message && d.message.content) || "").trim(), model };
    } catch (e) { return { ok: false, error: "ollama_unreachable:" + (e?.message || String(e)) }; }
}

module.exports = { chat, MODELS, ollamaChat, hermesChat, mlxChat, mlxConfig, setMlxConfig };

// v1138 — generic local OpenAI-compatible brain, aimed at Apple-Silicon MLX servers
// (Rapid-MLX, Osaurus, vMLX, mlx-omni-server…) but works for any OpenAI-style endpoint.
// Base URL + key + model are configurable (the Mac build points at whichever server is
// running on the M-chip). Config: ~/.voxelbridge/mlx.json { baseUrl, key, model }.
const _MLX_CFG = path.join(os.homedir(), ".voxelbridge", "mlx.json");
function mlxConfig() { try { return JSON.parse(fs.readFileSync(_MLX_CFG, "utf8")); } catch { return {}; } }
function setMlxConfig(d) { const c = mlxConfig(); if (typeof (d || {}).baseUrl === "string") c.baseUrl = d.baseUrl.trim().replace(/\/+$/, ""); if (typeof d.key === "string") c.key = d.key; if (typeof d.model === "string") c.model = d.model.trim(); try { fs.mkdirSync(path.dirname(_MLX_CFG), { recursive: true }); fs.writeFileSync(_MLX_CFG, JSON.stringify(c)); } catch {} return { ok: true, baseUrl: c.baseUrl || "", model: c.model || "", hasKey: !!c.key }; }

async function mlxChat(prompt, opts = {}) {
    const c = mlxConfig();
    const base = (opts.mlxHost || c.baseUrl || process.env.MLX_API_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
    const url = /\/v\d+$/.test(base) ? base + "/chat/completions" : base + "/v1/chat/completions";
    const key = opts.mlxKey || c.key || process.env.MLX_API_KEY || "";
    const model = opts.model || c.model || process.env.MLX_MODEL || "default";
    const messages = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: prompt });
    const headers = { "Content-Type": "application/json" }; if (key) headers["Authorization"] = "Bearer " + key;
    let signal; try { signal = AbortSignal.timeout(opts.timeout || 120000); } catch {}
    try {
        const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ model, stream: false, messages }), signal });
        if (!r.ok) return { ok: false, error: `mlx_http_${r.status} (is a local OpenAI-compatible server running at ${base}?)` };
        const d = await r.json();
        const text = (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
        return { ok: true, text: String(text).trim(), model };
    } catch (e) { return { ok: false, error: "mlx_unreachable:" + (e?.message || String(e)) }; }
}

// v1137 — Hermes Agent's gateway is an OpenAI-compatible API server (default
// http://127.0.0.1:8642, POST /v1/chat/completions, Bearer key). Unlike a plain LLM,
// each call runs a server-side Hermes agent with its memory, skills, and tools — so
// the engine's voice/avatar/commentary can use it as a "brain". Enable the gateway on
// the Hermes side with API_SERVER_ENABLED=true + API_SERVER_KEY. We use stream:false so
// no SSE accumulation is needed. Tool runs can be slow, hence the longer timeout.
async function hermesChat(prompt, opts = {}) {
    const host = (opts.hermesHost || process.env.HERMES_API_URL || "http://127.0.0.1:8642").replace(/\/+$/, "");
    const key = opts.hermesKey || process.env.HERMES_API_KEY || "change-me-local-dev";
    const model = opts.model || process.env.HERMES_MODEL || "hermes-agent";
    const messages = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: prompt });
    let signal; try { signal = AbortSignal.timeout(opts.timeout || 120000); } catch {}
    try {
        const r = await fetch(host + "/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
            body: JSON.stringify({ model, stream: false, messages }), signal,
        });
        if (!r.ok) return { ok: false, error: `hermes_http_${r.status} (is the Hermes gateway running at ${host} with API_SERVER_ENABLED=true + the right key?)` };
        const d = await r.json();
        const text = (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
        return { ok: true, text: String(text).trim(), model };
    } catch (e) { return { ok: false, error: "hermes_unreachable:" + (e?.message || String(e)) }; }
}
