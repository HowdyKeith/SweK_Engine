// render/blobVoiceWav.js -- render the blob's OWN voice to a WAV, offline and pure.
//
// blobVoice.js already exposes sampleAt(plan, t): one audio sample at time t, no device, no AudioContext. So a
// whole line -- or a whole multi-speaker studio timeline -- can be rendered to PCM by sampling on a grid, with
// zero browser audio. That gives the headless/deterministic export path the blob's real voice (not a human TTS
// stand-in), and lets a studio mux several personas into one track by summing their plans on a shared clock.
//
// Pure: same maths as the live speaker, so a WAV rendered here is what the mouth was doing, sample-accurate. It
// verifies in a terminal (the selfcheck decodes the header + checks the samples are non-silent under speech and
// silent in the gaps) with no audio hardware at all.
"use strict";
import { planSpeech, sampleAt } from "../fx/avatar/blobVoice.js";

// Render a single plan to Float32 PCM at sampleRate. Returns { pcm:Float32Array, sampleRate, dur }.
function renderPlanPCM(plan, sampleRate = 44100, gain = 0.5) {
    const dur = plan && plan.dur ? plan.dur : 0;
    const nn = Math.max(1, Math.round(dur * sampleRate));
    const pcm = new Float32Array(nn);
    for (let i = 0; i < nn; i++) pcm[i] = gain * sampleAt(plan, i / sampleRate);
    return { pcm, sampleRate, dur };
}

// Render a full studio timeline: lines = [{ text, persona, atMs }] placed on ONE clock. Overlapping personas
// sum (a panel can talk over each other if you want); non-overlapping is the normal interview cadence. Returns
// { pcm, sampleRate, durMs }.
function renderTimelinePCM(lines, opts = {}) {
    const sampleRate = opts.sampleRate || 44100, gain = opts.gain == null ? 0.5 : opts.gain, rate = opts.rate || 1;
    const plans = lines.map((L) => ({ at: Math.max(0, (L.atMs || 0) / 1000), plan: planSpeech(L.text || "", { persona: L.persona || "both", rate }) }));
    let durS = 0;
    for (const p of plans) durS = Math.max(durS, p.at + (p.plan.dur || 0));
    const nn = Math.max(1, Math.round(durS * sampleRate));
    const pcm = new Float32Array(nn);
    for (const { at, plan } of plans) {
        const off = Math.round(at * sampleRate), len = Math.round((plan.dur || 0) * sampleRate);
        for (let i = 0; i < len; i++) { const idx = off + i; if (idx >= 0 && idx < nn) pcm[idx] += gain * sampleAt(plan, i / sampleRate); }
    }
    // guard against clipping when personas overlap
    let peak = 0; for (let i = 0; i < nn; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
    if (peak > 1) { const k = 0.98 / peak; for (let i = 0; i < nn; i++) pcm[i] *= k; }
    return { pcm, sampleRate, durMs: durS * 1000 };
}

// Float32 PCM [-1,1] -> 16-bit mono WAV (Uint8Array). A real .wav: RIFF header + PCM data, playable and muxable.
function pcmToWav(pcm, sampleRate = 44100) {
    const n = pcm.length, bytesPerSample = 2, dataLen = n * bytesPerSample;
    const buf = new ArrayBuffer(44 + dataLen), dv = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, "RIFF"); dv.setUint32(4, 36 + dataLen, true); ws(8, "WAVE");
    ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * bytesPerSample, true);
    dv.setUint16(32, bytesPerSample, true); dv.setUint16(34, 16, true);
    ws(36, "data"); dv.setUint32(40, dataLen, true);
    let o = 44;
    for (let i = 0; i < n; i++) { let s = Math.max(-1, Math.min(1, pcm[i])); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Uint8Array(buf);
}

// Convenience: text (+persona) -> WAV bytes.
function lineToWav(text, opts = {}) {
    const plan = planSpeech(text, { persona: opts.persona || "both", rate: opts.rate || 1 });
    const { pcm, sampleRate } = renderPlanPCM(plan, opts.sampleRate || 44100, opts.gain == null ? 0.5 : opts.gain);
    return { wav: pcmToWav(pcm, sampleRate), dur: plan.dur };
}

export { renderPlanPCM, renderTimelinePCM, pcmToWav, lineToWav };
if (typeof module !== "undefined" && module.exports) module.exports = { renderPlanPCM, renderTimelinePCM, pcmToWav, lineToWav };
