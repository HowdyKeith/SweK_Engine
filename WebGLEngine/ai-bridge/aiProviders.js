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

module.exports = { chat, MODELS, ollamaChat, hermesChat, mlxChat, mlxConfig, setMlxConfig, resolveLocalModel };

// v1138 — generic local OpenAI-compatible brain, aimed at Apple-Silicon MLX servers
// (Rapid-MLX, Osaurus, vMLX, mlx-omni-server…) but works for any OpenAI-style endpoint.
// Base URL + key + model are configurable (the Mac build points at whichever server is
// running on the M-chip). Config: ~/.voxelbridge/mlx.json { baseUrl, key, model }.
const _MLX_CFG = path.join(os.homedir(), ".voxelbridge", "mlx.json");
function mlxConfig() { try { return JSON.parse(fs.readFileSync(_MLX_CFG, "utf8")); } catch { return {}; } }
function setMlxConfig(d) { const c = mlxConfig(); if (typeof (d || {}).baseUrl === "string") c.baseUrl = d.baseUrl.trim().replace(/\/+$/, ""); if (typeof d.key === "string") c.key = d.key; if (typeof d.model === "string") c.model = d.model.trim(); try { fs.mkdirSync(path.dirname(_MLX_CFG), { recursive: true }); fs.writeFileSync(_MLX_CFG, JSON.stringify(c)); } catch {} return { ok: true, baseUrl: c.baseUrl || "", model: c.model || "", hasKey: !!c.key }; }

// v4016 -- *** "default" IS NOT A MODEL NAME, AND SOME OF THESE SERVERS CHECK. *** The servers this provider
// aims at are not interchangeable about the `model` field. TurboFieldfare's own request validator is an EXACT
// string compare (`guard request.model == modelID else { throw ServerRequestError.unknownModel }`), so a
// request carrying the placeholder "default" is rejected outright by a server that is running perfectly well
// and serving exactly one model -- and the old error line then asked whether a server was running AT the very
// address that had just answered. THE NAME IS PUBLISHED: /v1/models is part of the same OpenAI-compatible
// surface as /v1/chat/completions, and mlxInstallBridge's detect() has been reading it since v1139 and
// throwing the answer away. This asks the server what it serves rather than guessing, and only when nothing
// was configured -- an explicit opts.model / saved config / MLX_MODEL still wins untouched.
async function resolveLocalModel(base, opts = {}) {
    const url = (/\/v\d+$/.test(base) ? base + "/models" : base + "/v1/models");
    let signal; try { signal = AbortSignal.timeout(opts.timeout || 4000); } catch {}
    const headers = {}; if (opts.key) headers["Authorization"] = "Bearer " + opts.key;
    try {
        const r = await fetch(url, { headers, signal });
        if (!r.ok) return { ok: false, error: "models_http_" + r.status };
        const d = await r.json();
        const ids = ((d && (d.data || d.models)) || []).map((m) => (m && (m.id || m.name)) || m).filter((x) => typeof x === "string" && x);
        if (!ids.length) return { ok: false, error: "the server listed no models" };
        return { ok: true, model: ids[0], models: ids };
    } catch (e) { return { ok: false, error: "models_unreachable:" + (e?.message || String(e)) }; }
}

async function mlxChat(prompt, opts = {}) {
    const c = mlxConfig();
    const base = (opts.mlxHost || c.baseUrl || process.env.MLX_API_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
    const url = /\/v\d+$/.test(base) ? base + "/chat/completions" : base + "/v1/chat/completions";
    const key = opts.mlxKey || c.key || process.env.MLX_API_KEY || "";
    let model = opts.model || c.model || process.env.MLX_MODEL || "";
    // NOTHING CONFIGURED -> ASK, and fall back to the old placeholder only if the ask itself fails, so a
    // server too old or too minimal to serve /v1/models behaves exactly as it did before this change.
    let resolved = null;
    if (!model) { resolved = await resolveLocalModel(base, { key, timeout: opts.resolveTimeout }); model = resolved.ok ? resolved.model : "default"; }
    const messages = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: prompt });
    const headers = { "Content-Type": "application/json" }; if (key) headers["Authorization"] = "Bearer " + key;
    let signal; try { signal = AbortSignal.timeout(opts.timeout || 120000); } catch {}
    try {
        const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ model, stream: false, messages }), signal });
        if (!r.ok) {
            // *** A REACHABLE SERVER THAT REFUSED THE MODEL IS NOT AN UNREACHABLE SERVER. *** Naming what it
            // does serve turns "is anything running there?" into one the reader can act on in a single step.
            const served = resolved && resolved.ok ? resolved : await resolveLocalModel(base, { key, timeout: opts.resolveTimeout });
            if (served.ok) return { ok: false, error: `mlx_http_${r.status} (the server at ${base} is up and serving ${served.models.join(", ")} -- it refused model '${model}')`, model, served: served.models };
            return { ok: false, error: `mlx_http_${r.status} (is a local OpenAI-compatible server running at ${base}?)`, model };
        }
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
