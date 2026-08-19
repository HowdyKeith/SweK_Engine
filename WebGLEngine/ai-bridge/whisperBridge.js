// ai-bridge/whisperBridge.js — v1889
// Speech-to-TEXT via a locally-run whisper.cpp server (ggml-org/whisper.cpp `whisper-server`).
// This is the reverse of ttsBridge: audio in -> text out. The dictation UI records mic audio in
// the browser and POSTs the raw bytes here; we re-wrap them as multipart/form-data and call the
// whisper server's POST /inference (the verified, OpenAI-Whisper-compatible endpoint):
//   curl {base}/inference -F file=@clip.wav -F response_format=json -F language=auto
//   -> { "text": "...transcribed..." }
// No cloud, fully offline. Config in ~/.voxelbridge/whisper.json (baseUrl, language).
const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(CFG_DIR, "whisper.json");
// v1979 — backend is selectable: "whispercpp" (whisper.cpp whisper-server, /inference) or "fasterwhisper"
// (a CTranslate2/faster-whisper OpenAI-compatible server, /v1/audio/transcriptions). Same audio in, text
// out; the only difference is the URL path + response shape, both handled in transcribe(). VAD (Silero)
// lives in the recorder (tray helper / browser), not here, so it's config we just carry + expose.
const DEF = { baseUrl: "http://127.0.0.1:8080", language: "auto", backend: "whispercpp", vad: false };

function load() { try { return Object.assign({}, DEF, JSON.parse(fs.readFileSync(CFG, "utf8")) || {}); } catch { return Object.assign({}, DEF); } }
function save(o) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2), { mode: 0o600 }); } catch {} }
function getConfig() { const c = load(); return { ok: true, config: { baseUrl: c.baseUrl, language: c.language, backend: c.backend || "whispercpp", vad: !!c.vad } }; }
function setConfig(p) {
    const c = load();
    if (p && typeof p.baseUrl === "string" && p.baseUrl.trim()) c.baseUrl = p.baseUrl.trim().replace(/\/+$/, "");
    if (p && typeof p.language === "string" && p.language.trim()) c.language = p.language.trim();
    if (p && (p.backend === "whispercpp" || p.backend === "fasterwhisper")) c.backend = p.backend;
    if (p && typeof p.vad === "boolean") c.vad = p.vad;
    save(c);
    return getConfig();
}
function _base() { return (load().baseUrl || DEF.baseUrl).replace(/\/+$/, ""); }

// GET / (the server serves a small HTML form at root) — used as a cheap reachability probe.
async function status() {
    const c = load();
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 5000);
    try {
        const r = await fetch(_base() + "/", { method: "GET", signal: ctl.signal });
        return { ok: true, baseUrl: c.baseUrl, language: c.language, reachable: r.ok || r.status === 200 };
    } catch (e) {
        return { ok: true, baseUrl: c.baseUrl, language: c.language, reachable: false, error: String(e && e.message || e) };
    } finally { clearTimeout(timer); }
}

// transcribe raw audio bytes (Buffer) -> { ok, text }. filename hints the container to whisper.
async function transcribe(buf, opts) {
    opts = opts || {};
    if (!buf || !buf.length) return { ok: false, error: "no audio bytes received" };
    const c = load();
    const base = _base();
    const filename = opts.filename || "clip.wav";
    const mime = opts.mime || (filename.endsWith(".webm") ? "audio/webm" : filename.endsWith(".ogg") ? "audio/ogg" : "audio/wav");

    // build multipart/form-data by hand (Node's fetch doesn't need form-data pkg for this)
    const boundary = "swekw" + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const parts = [];
    const field = (name, value) => Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n", "utf8");
    parts.push(Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\nContent-Type: " + mime + "\r\n\r\n", "utf8"));
    parts.push(buf);
    parts.push(Buffer.from("\r\n", "utf8"));
    parts.push(field("response_format", "json"));
    parts.push(field("language", opts.language || c.language || "auto"));
    parts.push(field("temperature", "0.0"));
    // v1979 — faster-whisper's OpenAI-compatible server wants a `model` field; harmless to whisper.cpp.
    const backend = c.backend || "whispercpp";
    if (backend === "fasterwhisper") { parts.push(field("model", "whisper-1")); }
    parts.push(Buffer.from("--" + boundary + "--\r\n", "utf8"));
    const body = Buffer.concat(parts);

    // whisper.cpp whisper-server serves /inference; a faster-whisper / OpenAI-compatible server serves
    // /v1/audio/transcriptions. Both return { text: "..." }.
    const endpoint = backend === "fasterwhisper" ? "/v1/audio/transcriptions" : "/inference";

    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), opts.timeoutMs || 120000);
    let r, text;
    try {
        r = await fetch(base + endpoint, {
            method: "POST",
            headers: { "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": String(body.length) },
            body, signal: ctl.signal,
        });
        text = await r.text();
    } catch (e) {
        return { ok: false, error: "whisper server unreachable at " + base + " — install/start whisper.cpp (bgServices: whisper) first. (" + (e && e.message || e) + ")" };
    } finally { clearTimeout(timer); }

    if (!r.ok) return { ok: false, error: "whisper /inference HTTP " + r.status, raw: (text || "").slice(0, 300) };
    // response_format=json -> { text: "...", ... }; some builds return plain text
    let out = null;
    try { const j = JSON.parse(text); out = (typeof j.text === "string") ? j.text : (j.transcription || null); } catch { out = text; }
    if (out == null) return { ok: false, error: "whisper returned no text", raw: (text || "").slice(0, 300) };
    return { ok: true, text: String(out).trim(), engine: "whisper.cpp" };
}

module.exports = { getConfig, setConfig, status, transcribe };
