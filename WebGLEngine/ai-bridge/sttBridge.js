// ai-bridge/sttBridge.js — v1118
// Local speech-to-text via a Whisper HTTP server. Engine-agnostic: works with
// whisper.cpp's whisper-server (POST /inference, multipart "file" -> {text}) OR
// a faster-whisper / OpenAI-compatible server (POST /v1/audio/transcriptions).
// Both accept a multipart "file" and return JSON with a "text" field, so one
// forwarder covers either — just point baseUrl/endpoint at whichever you run.
// Config at ~/.voxelbridge/stt.json. No server reachable => graceful {ok:false}.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG = process.env.STT_CONFIG || path.join(os.homedir(), ".voxelbridge", "stt.json");
const DEFAULTS = { baseUrl: "http://127.0.0.1:8080", endpoint: "/inference", language: "", model: "" };

function loadCfg() { try { if (fs.existsSync(CFG)) return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CFG, "utf8"))); } catch {} return { ...DEFAULTS }; }
function setConfig(d) {
    d = d || {}; const c = loadCfg();
    if (typeof d.baseUrl === "string") c.baseUrl = d.baseUrl.trim().replace(/\/+$/, "");
    if (typeof d.endpoint === "string") c.endpoint = "/" + d.endpoint.trim().replace(/^\/+/, "");
    if (d.language != null) c.language = String(d.language);
    if (d.model != null) c.model = String(d.model);
    try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); } catch {}
    return status();
}
function status() { const c = loadCfg(); return { ok: true, baseUrl: c.baseUrl, endpoint: c.endpoint, language: c.language || "", model: c.model || "" }; }

function _timeout(ms) { try { return AbortSignal.timeout(ms); } catch { return undefined; } }

async function detect() {
    const c = loadCfg();
    try {
        const r = await fetch(c.baseUrl + "/", { signal: _timeout(3000) });
        return { ok: true, reachable: true, httpStatus: r.status, baseUrl: c.baseUrl, endpoint: c.endpoint };
    } catch (e) { return { ok: true, reachable: false, baseUrl: c.baseUrl, endpoint: c.endpoint, error: (e && e.message) || "unreachable" }; }
}

// audioBuffer: Buffer of WAV bytes. -> { ok, text } | { ok:false, error }
async function transcribe(audioBuffer, opts = {}) {
    const c = loadCfg();
    if (!audioBuffer || !audioBuffer.length) return { ok: false, error: "no audio" };
    try {
        const fd = new FormData();
        fd.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "speech.wav");
        fd.append("response_format", "json");
        if (c.model) fd.append("model", c.model);           // OpenAI-style servers want this; whisper.cpp ignores it
        if (c.language) fd.append("language", c.language);
        if (opts.temperature != null) fd.append("temperature", String(opts.temperature));
        const r = await fetch(c.baseUrl + c.endpoint, { method: "POST", body: fd, signal: _timeout(opts.timeout || 30000) });
        if (!r.ok) return { ok: false, error: "stt http " + r.status + " (is the whisper server running at " + c.baseUrl + c.endpoint + "?)" };
        const ct = r.headers.get("content-type") || "";
        if (ct.includes("application/json")) { const j = await r.json(); return { ok: true, text: String(j.text || j.transcription || "").trim() }; }
        const t = await r.text(); return { ok: true, text: String(t || "").trim() };
    } catch (e) { return { ok: false, error: (e && e.message) || "stt failed" }; }
}

module.exports = { setConfig, status, detect, transcribe };
