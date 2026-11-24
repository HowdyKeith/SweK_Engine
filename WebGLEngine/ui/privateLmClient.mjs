// WebGLEngine/ui/privateLmClient.mjs -- UNNUMBERED (the version is chosen at ship time; the page is privatelm.html, the gate ui/privateLmClient-selfcheck.mjs)
//
// THE PURE HALF OF privatelm.html: talking to PrivateLM (github.com/orailnoor/cross-platform-llm-client, MIT), a Flutter chat app that runs GGUF models ON A PHONE (Android and iOS, llama.cpp) or calls a cloud API, and that can start an
// OPENAI-COMPATIBLE SERVER on the phone (`lib/services/openai_server_service_io.dart` in its repository, read before this was written): GET /health ({status: "ok"}), GET /v1/models, GET /v1/server/capabilities, POST /v1/chat/completions
// (stream: true gives server-sent `data: {chat.completion.chunk}` lines and a closing `data: [DONE]`, or one `data: {error}` event when the generation was interrupted), a Bearer key on every /v1/ path, loopback by default, port 8080.
// *** ONE FACT OF THAT SERVER SHAPES THE WHOLE PAGE: IT ADDS CORS HEADERS ONLY WHEN AN API KEY IS SET ("so an arbitrary web page can't read model output from an open server"). *** A page of this engine can therefore reach a phone from the browser only
// if the phone has a key, which is also the only mode in which the server will listen on the network at all. The page says so; nothing here tries to get around it.
// What this file does NOT do, said plainly: it has never talked to a real phone (the sandbox it was written in reaches neither a phone nor github.com's release hosts); it is written against the server's source and gated against stubs of that server.
// Pure: no DOM, no clock, no Math.random; the network is a `fetch` handed in.
"use strict";

export const REPO = "orailnoor/cross-platform-llm-client", APP_NAME = "PrivateLM", APPLICATION_ID = "com.orailnoor.privatelm", LICENSE = "MIT", DEFAULT_PORT = 8080;
export const REPO_URL = `https://github.com/${REPO}`, RELEASES_URL = `${REPO_URL}/releases`, LATEST_URL = `${RELEASES_URL}/latest`, LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`, WEB_APP = "https://ai-chat-orailnoor.web.app/";
export const ABIS = Object.freeze(["arm64-v8a", "armeabi-v7a", "x86_64"]);

/** What a person typed for the phone's address as a base URL: no trailing slash, no `/v1`, `http://` when no scheme was typed, port 8080 when an http address names none; null for nothing usable (empty, another scheme, no host). */
export function normalizeBase(input) {
    const raw = String(input === undefined || input === null ? "" : input).trim();
    if (!raw) return null;
    const s = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "http://" + raw;
    let u; try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    const authority = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0], typed = authority.match(/:(\d+)$/);
    const port = typed ? typed[1] : u.protocol === "http:" ? String(DEFAULT_PORT) : "";
    const path = u.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
    return `${u.protocol}//${u.hostname}${port ? ":" + port : ""}${path}`;
}

/** The headers of a request to the phone: JSON, and the Bearer key when there is one. */
export const headersFor = (key, json = true) => ({ ...(json ? { "Content-Type": "application/json" } : {}), ...(key && String(key).trim() ? { Authorization: "Bearer " + String(key).trim() } : {}) });

/** A sentence for a failure: a status, or a thrown error, and where the page is served from (an https page cannot call a plain-http phone). */
export function explainFailure({ status = 0, error = "", pageProtocol = "http:", base = "" } = {}) {
    if (status === 401) return "the phone wants its API key: type the key set in PrivateLM's server screen";
    if (status === 429 || status === 503) return "the phone is busy or has no model loaded: load a model in PrivateLM and try again";
    if (status >= 400) return `the phone answered ${status}`;
    if (pageProtocol === "https:" && /^http:/.test(base)) return "this page is served over https and a browser will not call a plain-http address from it: open the engine over http, or put the phone behind https";
    return "no answer: is the server running in PrivateLM, on the same network, with an API key set (the server sends the headers a browser needs only when a key is set)?" + (error ? " (" + error + ")" : "");
}

const getJson = async (f, url, headers, timeoutMs) => {
    let signal; try { signal = AbortSignal.timeout(timeoutMs); } catch (e) { signal = undefined; }
    try {
        const r = await f(url, { headers, signal });
        let json = null; try { json = await r.json(); } catch (e) { json = null; }
        return { ok: !!r.ok, status: r.status, json };
    } catch (e) { return { ok: false, status: 0, json: null, error: String((e && e.message) || e) }; }
};

/**
 * What the phone says of itself: /health, then /v1/models and /v1/server/capabilities with the key. Returns { ok, stage ("base" | "health" | "auth" | "models" | "ready"), base, model, models [ids], runtime, capabilities { text, image, audio, streaming, gguf }, loaded, hint }.
 * `loaded` is whether a model is loaded (the server lists none otherwise and refuses a chat); ok means the phone answered /health and the key was accepted, not that a model is loaded.
 */
export async function probe(baseInput, key, f, { timeoutMs = 6000, pageProtocol = "http:" } = {}) {
    const base = normalizeBase(baseInput);
    if (!base) return { ok: false, stage: "base", base: null, hint: "type the phone's address, for example 192.168.1.20:8080" };
    const h = await getJson(f, base + "/health", {}, timeoutMs);
    if (!h.ok || !h.json || h.json.status !== "ok") return { ok: false, stage: "health", base, hint: explainFailure({ status: h.status, error: h.error, pageProtocol, base }) };
    const m = await getJson(f, base + "/v1/models", headersFor(key, false), timeoutMs);
    if (m.status === 401) return { ok: false, stage: "auth", base, hint: explainFailure({ status: 401 }) };
    if (!m.ok || !m.json) return { ok: false, stage: "models", base, hint: explainFailure({ status: m.status, error: m.error, pageProtocol, base }) };
    const models = ((m.json && m.json.data) || []).map((x) => x && x.id).filter((x) => typeof x === "string" && x);
    const c = await getJson(f, base + "/v1/server/capabilities", headersFor(key, false), timeoutMs), cj = c.ok && c.json ? c.json : {}, cap = cj.capabilities || {};
    return { ok: true, stage: "ready", base, model: models[0] || cj.model || null, models, runtime: cj.runtime || null, capabilities: { text: !!cap.text, image: !!cap.image, audio: !!cap.audio, streaming: !!cap.streaming, gguf: !!cap.gguf }, loaded: models.length > 0, hint: models.length ? "" : "the server is up and no model is loaded: load one in PrivateLM" };
}

/** Server-sent events out of a text buffer: { events: [{ done: true } | { json } | { raw }], rest } -- the events end at a blank line, a `data:` line carries one; `rest` is what has not ended yet. */
export function parseSse(buffer) {
    const parts = String(buffer).split(/\r?\n\r?\n/), rest = parts.pop(), events = [];
    for (const block of parts) {
        const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
        if (!data) continue;
        if (data.trim() === "[DONE]") { events.push({ done: true }); continue; }
        try { events.push({ json: JSON.parse(data) }); } catch (e) { events.push({ raw: data }); }
    }
    return { events, rest };
}

/** The text a chunk carries (a streamed delta, a completion's text, a whole message), or "". */
export const textOf = (j) => { const c = j && j.choices && j.choices[0]; if (!c) return ""; const t = (c.delta && c.delta.content) || c.text || (c.message && c.message.content) || ""; return typeof t === "string" ? t : ""; };

/**
 * One chat with the phone, streamed: POST /v1/chat/completions with stream: true. `onToken(text)` is called for each piece. Returns { ok, text, interrupted, error }. `interrupted` is the server's `error` event of type "interrupted" (a partial answer, not a complete one).
 * A reply that is not a stream (a plain JSON completion, or no readable body) is read whole.
 */
export async function chatStream(baseInput, key, messages, f, { model = "", maxTokens = 256, onToken = () => {}, timeoutMs = 120000, pageProtocol = "http:" } = {}) {
    const base = normalizeBase(baseInput); if (!base) return { ok: false, text: "", interrupted: false, error: "no address" };
    let signal; try { signal = AbortSignal.timeout(timeoutMs); } catch (e) { signal = undefined; }
    let r;
    try { r = await f(base + "/v1/chat/completions", { method: "POST", headers: headersFor(key), body: JSON.stringify({ ...(model ? { model } : {}), messages, stream: true, max_tokens: maxTokens }), signal }); }
    catch (e) { return { ok: false, text: "", interrupted: false, error: explainFailure({ error: String((e && e.message) || e), pageProtocol, base }) }; }
    if (!r.ok) { let msg = ""; try { const j = await r.json(); msg = (j && j.error && (j.error.message || j.error)) || ""; } catch (e) { msg = ""; } return { ok: false, text: "", interrupted: false, error: explainFailure({ status: r.status }) + (msg && typeof msg === "string" ? " (" + msg + ")" : "") }; }
    let text = "", interrupted = false, error = "";
    const take = (events) => { for (const e of events) { if (e.json && e.json.error) { interrupted = e.json.error.type === "interrupted"; error = String(e.json.error.message || "error"); } else if (e.json) { const t = textOf(e.json); if (t) { text += t; onToken(t); } } } };
    if (r.body && typeof r.body.getReader === "function") {
        const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
        for (;;) { const { done, value } = await reader.read(); if (done) break; buf += typeof value === "string" ? value : dec.decode(value, { stream: true }); const p = parseSse(buf); buf = p.rest; take(p.events); }
        if (buf.trim()) take(parseSse(buf + "\n\n").events);
    } else {
        const body = await r.text(); const p = parseSse(body.includes("data:") ? body : "data: " + body + "\n\n"); take(p.events);
    }
    return { ok: !error, text, interrupted, error };
}

/** The Android ABIs a browser's user agent suggests, best first: [] for a device that is not Android. A phone of this decade is arm64 and runs armeabi-v7a too; x86_64 is an emulator or a Chromebook. */
export function deviceAbis(userAgent = "") {
    if (!/Android/i.test(userAgent)) return [];
    if (/x86_64|x86-64/i.test(userAgent)) return ["x86_64"];
    if (/armv7|armeabi/i.test(userAgent) && !/arm64|aarch64/i.test(userAgent)) return ["armeabi-v7a"];
    return ["arm64-v8a", "armeabi-v7a"];
}

/** The release's APKs as { name, url, size, abi, sha256 } (abi from the file name: arm64-v8a, armeabi-v7a, x86_64, or "universal"; sha256 is the digest GitHub lists for the file, 64 hex digits in lower case, or "" when it lists none), the one to offer for these ABIs first, and the iOS package. `release` is the GitHub API's release object. */
/** The 64 hex digits of a GitHub asset digest (`sha256:...`), lower case; "" for anything else. */
export const sha256Of = (digest) => { const m = /^sha256:([0-9a-f]{64})$/i.exec(String(digest || "")); return m ? m[1].toLowerCase() : ""; };

export function releaseSummary(release, abis = []) {
    const assets = ((release && release.assets) || []).filter((a) => a && typeof a.name === "string");
    const abiOf = (n) => ABIS.find((x) => n.toLowerCase().includes(x.toLowerCase())) || (/arm64/i.test(n) ? "arm64-v8a" : /x86[-_]64/i.test(n) ? "x86_64" : /armeabi|armv7/i.test(n) ? "armeabi-v7a" : "universal");
    const apks = assets.filter((a) => /\.apk$/i.test(a.name)).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size || 0, abi: abiOf(a.name), sha256: sha256Of(a.digest) }));
    const best = abis.map((x) => apks.find((a) => a.abi === x)).find(Boolean) || apks.find((a) => a.abi === "universal") || null;
    const ios = assets.filter((a) => /ios/i.test(a.name) && /\.(zip|ipa)$/i.test(a.name)).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size || 0 }))[0] || null;
    return { tag: (release && release.tag_name) || "", name: (release && release.name) || "", published: (release && release.published_at) || "", url: (release && release.html_url) || LATEST_URL, apks, best, ios };
}

/** The body `POST /ai/mlx-config` takes (the engine's local OpenAI-compatible provider: ai-bridge/aiProviders.js, ui/localMlxPanel.js): the base URL, the key and the model. */
export const mlxConfigBody = (base, key, model) => ({ baseUrl: normalizeBase(base) || "", key: String(key || "").trim(), model: String(model || "").trim() });

/** A size in bytes as a short string: 52428800 is `50 MB`. */
export const sizeText = (n) => (!(n > 0) ? "" : n >= 1048576 ? (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
