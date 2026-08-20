// ui/sttLayer.js — v1118
// Local voice loop. Captures mic audio, encodes a 16 kHz mono WAV in-browser
// (so whisper.cpp needs no ffmpeg build), POSTs it to the bridge's /stt/transcribe
// (which forwards to a local Whisper server), and returns the text. converseStop()
// chains the result through /ai/chat and speaks the reply via the avatar (Piper
// when useLocalTts is on) — fully local, mic -> text -> AI -> voice.
//
// API: window.stt.start() / .stop() (push-to-talk -> transcript)
//      window.stt.converseStop()  (transcript -> AI -> avatar speaks)
//      .transcribeBlob(blob) / .config({baseUrl,endpoint,language,model})
//      .getConfig() / .detect() / .status() / .isRecording()

export function installStt() {
    let mediaRec = null, chunks = [], stream = null, recording = false;
    // v1119 — which AI answers in converse mode. "ollama" keeps the whole loop local.
    let aiProvider = "gemini", ollamaModel = "llama3.2";
    try { aiProvider = localStorage.getItem("voxelengine.sttProvider") || "gemini"; } catch {}
    try { ollamaModel = localStorage.getItem("voxelengine.sttOllamaModel") || "llama3.2"; } catch {}
    const post = (p, b) => fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
    const get = (p) => fetch(p, { cache: "no-store" }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));

    // ---- WAV encoding (16 kHz mono PCM16) ----------------------------------
    function floatTo16BitPCM(view, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }
    function encodeWav(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
        w(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        w(36, "data"); view.setUint32(40, samples.length * 2, true); floatTo16BitPCM(view, 44, samples);
        return new Blob([view], { type: "audio/wav" });
    }
    function resample(input, inRate, outRate) {
        if (outRate === inRate) return input;
        const ratio = inRate / outRate, outLen = Math.round(input.length / ratio), out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) { const idx = i * ratio, i0 = Math.floor(idx), i1 = Math.min(i0 + 1, input.length - 1), f = idx - i0; out[i] = input[i0] * (1 - f) + input[i1] * f; }
        return out;
    }
    async function blobToWav16k(blob) {
        const ab = await blob.arrayBuffer();
        const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
        const decoded = await ac.decodeAudioData(ab);
        const re = resample(decoded.getChannelData(0), decoded.sampleRate, 16000);
        try { ac.close(); } catch {}
        return encodeWav(re, 16000);
    }

    async function transcribeBlob(blob) {
        const wav = await blobToWav16k(blob);
        const buf = await wav.arrayBuffer();
        return fetch("/stt/transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: buf }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
    }

    // ---- capture ------------------------------------------------------------
    async function start() {
        if (recording) return { ok: false, error: "already recording" };
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch (e) { window.kpop?.info?.("STT", "mic blocked: " + e.message); return { ok: false, error: e.message }; }
        chunks = []; mediaRec = new MediaRecorder(stream);
        mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        mediaRec.start(); recording = true;
        window.kpop?.info?.("STT", "listening\u2026");
        return { ok: true };
    }
    async function _finish() {
        if (!recording || !mediaRec) return null;
        const done = new Promise(res => { mediaRec.onstop = res; });
        mediaRec.stop(); recording = false; await done;
        try { stream.getTracks().forEach(t => t.stop()); } catch {}
        return new Blob(chunks, { type: mediaRec.mimeType || "audio/webm" });
    }
    async function stop() {
        const blob = await _finish();
        if (!blob) return { ok: false, error: "not recording" };
        const r = await transcribeBlob(blob);
        if (r && r.ok) { try { window.dispatchEvent(new CustomEvent("engine:voiceTranscript", { detail: { text: r.text } })); } catch {} }
        return r;
    }

    // ---- full loop: transcript -> /ai/chat -> avatar speaks (Piper) ---------
    async function converseText(text, opts = {}) {
        if (!text || !text.trim()) return { ok: false, error: "no text" };
        window.kpop?.info?.("You said", text);
        const provider = opts.provider || aiProvider;
        const reqBody = { provider, prompt: text };
        if (provider === "ollama") reqBody.model = opts.model || ollamaModel;
        const ai = await post("/ai/chat", reqBody);
        const reply = (ai && ai.ok && ai.text) ? ai.text.trim() : null;
        if (reply) {
            try { window.kpop?.useLocalTts?.(true); } catch {}
            try { window.kpop?.speak?.(reply); } catch {}
            try { window.dispatchEvent(new CustomEvent("engine:voiceReply", { detail: { text: reply, prompt: text } })); } catch {}
            window.kpop?.info?.("Avatar", reply.slice(0, 140));
        } else window.kpop?.info?.("AI", (ai && ai.error) || "no reply");
        return { ok: true, transcript: text, reply };
    }
    async function converseStop(opts = {}) {
        const r = await stop();
        if (!r || !r.ok || !r.text) { window.kpop?.info?.("STT", r && r.error ? ("\u2717 " + r.error) : "(no speech heard)"); return r || { ok: false }; }
        return converseText(r.text, opts);
    }

    function config(d) { return post("/stt/config", d || {}); }
    function getConfig() { return get("/stt/config"); }
    function detect() { return get("/stt/detect"); }
    function setProvider(p, model) {
        if (p) { aiProvider = String(p).toLowerCase(); try { localStorage.setItem("voxelengine.sttProvider", aiProvider); } catch {} }
        if (model) { ollamaModel = String(model); try { localStorage.setItem("voxelengine.sttOllamaModel", ollamaModel); } catch {} }
        return { ok: true, provider: aiProvider, model: ollamaModel };
    }
    function status() { return { ok: true, recording, provider: aiProvider, model: ollamaModel }; }

    window.stt = { start, stop, transcribeBlob, converseStop, converseText, config, getConfig, detect, setProvider, status, isRecording: () => recording };
    console.log("[stt] window.stt.start()/.stop() push-to-talk; .converseStop() = transcribe -> AI -> Piper; .setProvider('ollama','llama3.2') for a fully-local loop. Server in Settings -> Speech (STT)");
}
