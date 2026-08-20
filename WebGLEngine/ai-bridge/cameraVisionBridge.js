// cameraVisionBridge.js — grab a still frame from a go2rtc camera and ask a
// LOCAL Ollama vision model (llava / moondream / llama3.2-vision / qwen-vl / …)
// to describe it. All server-side: go2rtc snapshot fetch + Ollama /api/generate,
// so there's no browser CORS or canvas-taint to worry about.
const http = require("http");
const https = require("https");

const OLLAMA = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");

function _get(url) {
    return new Promise((resolve, reject) => {
        const lib = url.toLowerCase().startsWith("https") ? https : http;
        const req = lib.get(url, (r) => {
            if (r.statusCode && (r.statusCode < 200 || r.statusCode >= 400)) { r.resume(); return reject(new Error("HTTP " + r.statusCode)); }
            const chunks = []; r.on("data", d => chunks.push(d)); r.on("end", () => resolve(Buffer.concat(chunks)));
        });
        req.on("error", reject);
        req.setTimeout(8000, () => { try { req.destroy(new Error("timeout")); } catch (e) {} });
    });
}

function _postJson(url, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        const u = new URL(url); const lib = u.protocol === "https:" ? https : http;
        const payload = Buffer.from(JSON.stringify(body));
        const req = lib.request({ method: "POST", hostname: u.hostname, port: u.port, path: u.pathname, headers: { "Content-Type": "application/json", "Content-Length": payload.length } }, (r) => {
            const chunks = []; r.on("data", d => chunks.push(d)); r.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { reject(new Error("bad Ollama response")); } });
        });
        req.on("error", reject);
        req.setTimeout(timeoutMs || 90000, () => { try { req.destroy(new Error("Ollama timeout")); } catch (e) {} });
        req.end(payload);
    });
}

// Auto-pick a vision-capable model from /api/tags when none is specified.
async function _pickVisionModel() {
    try {
        const tags = JSON.parse((await _get(OLLAMA + "/api/tags")).toString("utf8"));
        const names = (tags.models || []).map(m => m.name || m.model || "").filter(Boolean);
        const VIS = /llava|moondream|llama3\.2-vision|llama-vision|qwen2.*vl|qwen2\.5vl|bakllava|minicpm-v|gemma3|llava-phi|vision/i;
        return names.find(n => VIS.test(n)) || null;
    } catch (e) { return null; }
}

async function describe(opts) {
    opts = opts || {};
    const base = (opts.base || "http://localhost:1984").trim().replace(/\/+$/, "");
    const src = (opts.src || "").trim();
    if (!src) return { ok: false, error: "no camera (src) specified" };

    // 1) grab a still frame from go2rtc. v1989 — retry once: the FIRST grab on an idle stream makes
    // go2rtc spin up the whole RTSP/ffmpeg consumer, which routinely blows the 8s timeout — so the
    // first "describe" failed and the second worked. The retry rides the now-warm stream.
    let jpeg, lastErr;
    for (let attempt = 0; attempt < 2 && !jpeg; attempt++) {
        try {
            const b = await _get(base + "/api/frame.jpeg?src=" + encodeURIComponent(src));
            if (b && b.length) jpeg = b; else lastErr = "empty frame";
        } catch (e) { lastErr = e && e.message; }
        if (!jpeg && attempt === 0) await new Promise(r => setTimeout(r, 2500));   // let the stream warm up
    }
    if (!jpeg) return { ok: false, error: "couldn't grab a frame from go2rtc (" + base + "): " + lastErr };

    // 2) pick a local vision model
    let model = (opts.model || "").trim();
    if (!model) { model = await _pickVisionModel(); if (!model) return { ok: false, error: "no vision model in Ollama", need: "vision-model", hint: "ollama pull llava   (or moondream / llama3.2-vision)" }; }

    // 3) ask Ollama to describe the frame
    const prompt = (opts.prompt || "").trim() || "You are looking at a still frame from a home security camera. In 1-2 short sentences, describe what you see. Note any people, animals, vehicles, or unusual activity.";
    let out;
    try { out = await _postJson(OLLAMA + "/api/generate", { model, prompt, images: [jpeg.toString("base64")], stream: false }, 120000); }
    catch (e) { return { ok: false, error: "Ollama vision failed: " + (e && e.message), hint: "is Ollama running on :11434?" }; }
    const text = String((out && out.response) || "").trim();
    if (!text) return { ok: false, error: "vision model returned nothing", model };
    return { ok: true, text, model, bytes: jpeg.length, src };
}

module.exports = { describe };
