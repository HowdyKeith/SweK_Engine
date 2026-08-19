// fx/avatar/blobVoice.js -- the blob's own voice.
//
// "Can we synthesize a voice for a blobulator?" The engine already has real text-to-speech (ttsBridge: Windows SAPI
// and piper), so the blob could simply borrow a human voice and read the words out. But a blobulator should not sound
// like a screen reader, and every other honest thing in this arc came from the same instinct: the mouth is CARVED and
// not drawn, the heat IS the material, the gauge IS the door. So the voice is synthesized rather than borrowed.
//
// One pitched burble per syllable -- the Animal Crossing trick, and it works because speech rhythm carries most of the
// character. Each syllable gets a pitch, a glide and a formant pair, and prosody is real: a question glides up on its
// last syllable, a statement settles down, and stressed syllables are louder and longer. The words themselves ride as
// captions, which the export already draws.
//
// The part that makes it more than a noise: ONE plan drives both the sound and the mouth. ampAt() is the envelope the
// speaker plays AND the value that carves the narrator's negative-metaball mouth, so the blob's mouth opens because it
// is speaking -- not alongside it, not approximately with it. Same number, same instant.
//
// Pure maths, so it verifies in a terminal with no audio device at all. Web Audio is only the player.
"use strict";

const VOICES = {
    both:      { f0: 205, f1: 640, f2: 1760, spread: 0.30, wobble: 5.5 },
    avataro:   { f0: 148, f1: 520, f2: 1420, spread: 0.24, wobble: 4.5 },   // lower, rounder
    avatarina: { f0: 268, f1: 760, f2: 2040, spread: 0.34, wobble: 6.5 }    // higher, brighter
};

// Rough syllables: vowel groups, with the silent final "e" dropped. It only has to be close -- it sets rhythm, not words.
function syllabify(text) {
    const out = [];
    for (const raw of String(text || "").split(/\s+/)) {
        const w = raw.toLowerCase().replace(/[^a-z']/g, "");
        if (!w) continue;
        let parts = w.match(/[^aeiouy]*[aeiouy]+/g);
        if (!parts || !parts.length) { out.push({ s: w, word: raw }); continue; }
        const tail = w.slice(parts.join("").length);
        if (tail) parts[parts.length - 1] += tail;
        if (parts.length > 1 && /^[^aeiouy]*e$/.test(parts[parts.length - 1])) parts.pop();   // silent final e
        for (let i = 0; i < parts.length; i++) out.push({ s: parts[i], word: raw, first: i === 0, last: i === parts.length - 1 });
    }
    return out;
}
function _hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h / 4294967296; }

// A schedule of burbles. Deterministic: the same line always speaks the same way.
function planSpeech(text, opts = {}) {
    const V = VOICES[opts.persona] || VOICES.both;
    const rate = opts.rate == null ? 1 : opts.rate;
    const syl = syllabify(text);
    const q = /\?\s*$/.test(String(text || "")), excl = /!\s*$/.test(String(text || ""));
    const syllables = [];
    let at = 0;
    for (let i = 0; i < syl.length; i++) {
        const u = syl.length === 1 ? 0 : i / (syl.length - 1);
        const r = _hash(syl[i].s + i);
        const stressed = syl[i].first && syl[i].s.length > 2;
        const dur = (0.085 + (stressed ? 0.05 : 0.02) + r * 0.035) / rate;
        const drift = 1 - u * 0.14;                                    // a line settles as it goes
        let f0 = V.f0 * drift * (1 + (r - 0.5) * V.spread * 0.5);
        let glide = -0.06;                                             // statements fall
        if (syl[i].last && i === syl.length - 1) { if (q) glide = 0.34; else if (excl) glide = 0.12; else glide = -0.18; }   // prosody, for real
        syllables.push({ at, dur, f0, glide, f1: V.f1 * (1 + (r - 0.5) * 0.18), f2: V.f2 * (1 + (r - 0.5) * 0.12),
            amp: stressed ? 1 : 0.78 + r * 0.16, wobble: V.wobble, s: syl[i].s, word: syl[i].word });
        at += dur + (syl[i].last ? 0.055 : 0.012) / rate;              // a beat between words
    }
    return { syllables, dur: at, persona: opts.persona || "both", text: String(text || "") };
}
// The envelope. This is what the speaker plays AND what carves the mouth -- one number, one instant.
function ampAt(plan, t) {
    if (!plan || !plan.syllables.length) return 0;
    for (const s of plan.syllables) {
        if (t < s.at || t > s.at + s.dur) continue;
        const u = (t - s.at) / s.dur;
        const env = Math.min(1, u / 0.18) * Math.pow(1 - Math.max(0, (u - 0.35) / 0.65), 1.6);   // quick attack, soft tail
        return Math.max(0, env * s.amp);
    }
    return 0;   // between syllables the mouth is shut, because nothing is being said
}
// One audio sample. Pure: no device, no context -- so the voice can be checked without ever being heard.
function sampleAt(plan, t) {
    const a = ampAt(plan, t);
    if (a <= 0) return 0;
    let s = null;
    for (const x of plan.syllables) if (t >= x.at && t <= x.at + x.dur) { s = x; break; }
    if (!s) return 0;
    const u = (t - s.at) / s.dur;
    const f = s.f0 * (1 + s.glide * u) * (1 + 0.012 * Math.sin(2 * Math.PI * s.wobble * t));   // glide + a wet wobble
    const ph = 2 * Math.PI * f * t;
    const v = 0.62 * Math.sin(ph) + 0.24 * Math.sin(2 * Math.PI * s.f1 * t) * 0.5 + 0.14 * Math.sin(2 * Math.PI * s.f2 * t) * 0.3;
    return Math.max(-1, Math.min(1, a * v));
}
// Web Audio player (browser only). Same plan, so what you hear is exactly what the mouth is doing.
function speak(plan, ctx, opts = {}) {
    if (!ctx || !plan || !plan.syllables.length) return null;
    const t0 = ctx.currentTime + 0.02, out = ctx.createGain();
    out.gain.value = opts.volume == null ? 0.5 : opts.volume; out.connect(opts.destination || ctx.destination);
    for (const s of plan.syllables) {
        const o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
        o.type = "sawtooth"; bp.type = "bandpass"; bp.frequency.value = s.f1; bp.Q.value = 4;
        o.frequency.setValueAtTime(s.f0, t0 + s.at);
        o.frequency.linearRampToValueAtTime(s.f0 * (1 + s.glide), t0 + s.at + s.dur);
        g.gain.setValueAtTime(0, t0 + s.at);
        g.gain.linearRampToValueAtTime(s.amp, t0 + s.at + s.dur * 0.18);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + s.at + s.dur);
        o.connect(bp); bp.connect(g); g.connect(out);
        o.start(t0 + s.at); o.stop(t0 + s.at + s.dur + 0.02);
    }
    return { dur: plan.dur, stop: () => { try { out.disconnect(); } catch (e) {} } };
}
export { syllabify, planSpeech, ampAt, sampleAt, speak, VOICES };
