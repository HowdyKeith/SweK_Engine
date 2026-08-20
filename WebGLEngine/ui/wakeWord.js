// ui/wakeWord.js — v1120
// Hands-free wake word for the local voice loop. Always-on mic with energy-based
// VAD: when speech is detected it captures the utterance (with a short pre-roll so
// the wake word isn't clipped), transcribes it via the existing /stt/transcribe,
// and if the transcript contains the wake phrase, runs window.stt.converseText on
// the rest. No new model or server — it reuses Whisper + Piper + the converse loop.
//
// State: idle -> (speech) -> capturing -> transcribe -> match? -> converse/arm.
// "Armed" means the wake word was heard alone; the NEXT utterance is the command
// (so you can say "hey engine" ... then ask). The listener is suppressed while the
// avatar is replying so it doesn't transcribe its own voice.
//
// API: window.wake.start() / .stop() / .toggle() / .config({phrase,threshold,
//      silenceMs}) / .status()

export function installWake() {
    const cfg = {
        phrase: "hey engine",
        threshold: 0.014,     // RMS gate (0..1); raise if it self-triggers on noise
        silenceMs: 800,       // trailing silence that ends an utterance
        prerollMs: 350,       // audio kept before speech onset (protects the wake word)
        maxUtteranceMs: 9000,
        armedTimeoutMs: 9000, // after a bare wake word, how long to wait for the command
    };
    try { const p = localStorage.getItem("voxelengine.wakePhrase"); if (p) cfg.phrase = p; } catch {}
    try { const t = parseFloat(localStorage.getItem("voxelengine.wakeThreshold")); if (isFinite(t)) cfg.threshold = t; } catch {}

    let on = false, ac = null, stream = null, source = null, proc = null, zero = null;
    let state = "idle";              // idle | capturing | busy
    let prerollChunks = [], capture = [], capturing = false;
    let speechActive = false, silenceStart = 0, speechStart = 0;
    let armed = false, armedUntil = 0, suppressUntil = 0;
    let chunkMs = 85, prerollCount = 4;

    // ---- WAV helpers (mono PCM16, resampled to 16 kHz) ----------------------
    function encodeWav(samples, sampleRate) {
        const buf = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buf);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
        w(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        w(36, "data"); view.setUint32(40, samples.length * 2, true);
        let off = 44; for (let i = 0; i < samples.length; i++, off += 2) { const s = Math.max(-1, Math.min(1, samples[i])); view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
        return new Blob([view], { type: "audio/wav" });
    }
    function resample(input, inRate, outRate) {
        if (outRate === inRate) return input;
        const ratio = inRate / outRate, outLen = Math.round(input.length / ratio), out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) { const idx = i * ratio, i0 = Math.floor(idx), i1 = Math.min(i0 + 1, input.length - 1), f = idx - i0; out[i] = input[i0] * (1 - f) + input[i1] * f; }
        return out;
    }
    function flatten(chunks) { let n = 0; for (const c of chunks) n += c.length; const out = new Float32Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out; }

    function beep(freq = 660, ms = 120) {
        try { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = freq; g.gain.value = 0.06; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + ms / 1000); } catch {}
    }
    function setState(s) { state = s; try { window.dispatchEvent(new CustomEvent("engine:wakeState", { detail: { state: s, armed } })); } catch {} }

    async function onUtterance(samples, rate) {
        setState("busy");
        const wav = encodeWav(resample(samples, rate, 16000), 16000);
        const buf = await wav.arrayBuffer();
        let r = null;
        try { r = await fetch("/stt/transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: buf }).then(x => x.json()); } catch (e) { r = { ok: false, error: e.message }; }
        const text = (r && r.ok && r.text) ? r.text.trim() : "";
        if (!text) { finishBusy(400); return; }

        const lower = text.toLowerCase();
        const phrase = cfg.phrase.toLowerCase();

        if (armed && Date.now() < armedUntil) {
            armed = false;
            await runConverse(text);
            return;
        }

        const idx = lower.indexOf(phrase);
        if (idx < 0) { finishBusy(300); return; }   // no wake word — ignore

        const after = text.slice(idx + phrase.length).replace(/^[\s,.:!?-]+/, "").trim();
        if (after.split(/\s+/).filter(Boolean).length >= 1) {
            await runConverse(after);                 // "hey engine, what's the weather" -> command inline
        } else {
            armed = true; armedUntil = Date.now() + cfg.armedTimeoutMs;
            beep(740, 110); window.kpop?.info?.("Wake", "listening\u2026 (ask now)");
            finishBusy(200);
        }
    }

    async function runConverse(command) {
        window.kpop?.info?.("Wake \u2192", command);
        let reply = "";
        try { const res = await window.stt?.converseText?.(command); reply = (res && res.reply) || ""; } catch (e) { console.warn("[wake] converse:", e?.message ?? e); }
        // suppress while the avatar speaks so we don't hear ourselves
        const speakMs = Math.min(14000, 1500 + reply.length * 55);
        finishBusy(speakMs);
    }

    function finishBusy(suppressMs) {
        suppressUntil = Date.now() + (suppressMs || 0);
        capture = []; capturing = false; speechActive = false; silenceStart = 0;
        setState("idle");
    }

    function handleAudio(e) {
        const inBuf = e.inputBuffer.getChannelData(0);
        const buf = new Float32Array(inBuf.length); buf.set(inBuf);
        // rolling preroll
        prerollChunks.push(buf); if (prerollChunks.length > prerollCount) prerollChunks.shift();
        const now = Date.now();
        if (state === "busy" || now < suppressUntil) return;   // ignore while processing / avatar speaking

        let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);

        if (rms > cfg.threshold) {
            if (!speechActive) { speechActive = true; speechStart = now; capturing = true; capture = prerollChunks.slice(); setState("capturing"); }
            silenceStart = 0;
            capture.push(buf);
        } else if (speechActive) {
            capture.push(buf);
            if (silenceStart === 0) silenceStart = now;
            else if (now - silenceStart > cfg.silenceMs) endUtterance();
        }
        if (speechActive && now - speechStart > cfg.maxUtteranceMs) endUtterance();
    }

    function endUtterance() {
        speechActive = false; capturing = false; silenceStart = 0;
        const chunks = capture; capture = [];
        if (!chunks.length) { setState("idle"); return; }
        const samples = flatten(chunks);
        // guard: ignore blips too short to be speech (< ~250 ms)
        if (samples.length < ac.sampleRate * 0.25) { setState("idle"); return; }
        onUtterance(samples, ac.sampleRate);
    }

    async function start() {
        if (on) return status();
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
        catch (e) { window.kpop?.info?.("Wake", "mic blocked: " + e.message); return { ok: false, error: e.message }; }
        const AC = window.AudioContext || window.webkitAudioContext; ac = new AC();
        try { await ac.resume(); } catch {}
        chunkMs = (4096 / ac.sampleRate) * 1000; prerollCount = Math.max(2, Math.ceil(cfg.prerollMs / chunkMs));
        source = ac.createMediaStreamSource(stream);
        proc = ac.createScriptProcessor(4096, 1, 1);
        zero = ac.createGain(); zero.gain.value = 0;   // mute monitor path (no feedback) but keep the node firing
        proc.onaudioprocess = handleAudio;
        source.connect(proc); proc.connect(zero); zero.connect(ac.destination);
        on = true; prerollChunks = []; capture = []; armed = false; setState("idle");
        window.kpop?.info?.("Wake word", "on \u2014 say \u201C" + cfg.phrase + "\u201D");
        console.log("[wake] listening for \u201C" + cfg.phrase + "\u201D");
        return status();
    }
    function stop() {
        on = false;
        try { proc && (proc.onaudioprocess = null); } catch {}
        try { source && source.disconnect(); proc && proc.disconnect(); zero && zero.disconnect(); } catch {}
        try { stream && stream.getTracks().forEach(t => t.stop()); } catch {}
        try { ac && ac.close(); } catch {}
        ac = stream = source = proc = zero = null;
        prerollChunks = []; capture = []; speechActive = capturing = false; armed = false;
        setState("idle");
        return status();
    }
    function toggle() { return on ? stop() : start(); }
    function config(d = {}) {
        if (d.phrase != null) { cfg.phrase = String(d.phrase) || cfg.phrase; try { localStorage.setItem("voxelengine.wakePhrase", cfg.phrase); } catch {} }
        if (d.threshold != null && isFinite(+d.threshold)) { cfg.threshold = +d.threshold; try { localStorage.setItem("voxelengine.wakeThreshold", String(cfg.threshold)); } catch {} }
        if (d.silenceMs != null) cfg.silenceMs = +d.silenceMs;
        return { ok: true, cfg };
    }
    function status() { return { ok: true, on, state, armed, cfg }; }

    window.wake = { start, stop, toggle, config, status };
    console.log("[wake] window.wake.start() \u2014 hands-free; say \u201C" + cfg.phrase + "\u201D. Configure in Settings -> Speech (STT)");
}
