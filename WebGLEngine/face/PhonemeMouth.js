// FILE: face/PhonemeMouth.js
// VERSION: v1 — round 271
//
// Builds a time-keyed mouth-amplitude curve from text. Replaces the
// pure-sine "open-close" lip-sync we had before with something that
// reflects what's actually being said: vowels open wide, bilabials
// (b/p/m) snap shut, fricatives (s/f/sh) sit narrow, etc. The curve
// is sampled by the mouth animation each frame for a believable
// articulation pattern.
//
// We don't pretend to be a real phoneme decomposer — that requires
// a pronunciation dictionary per language. This is a heuristic based
// on graphemes (letters), which gets you ~80% of the way there for
// English/Western text and is free.
//
// Two-tier algorithm:
//   1. Classify each character to a baseline aperture value (0..1)
//   2. Smooth with a leaky-integrator pass so consecutive vowels
//      don't snap between distinct values — natural speech has
//      ramps, not steps
//
// API:
//   const curve = buildAmplitudeCurve(text, durationMs);
//   const amp = sampleCurveAt(curve, tMs);   // 0..1
//
// Curve is an array of { tMs, amp } keyframes; sampleCurveAt linearly
// interpolates between adjacent keyframes.

// Character classes → aperture values. Tuned to feel right when
// driving an SVG ellipse ry: 0 = fully closed lips, 1 = wide open.
const CHAR_AMP = {
    // Bilabials — lips closed
    b: 0.05, p: 0.05, m: 0.05,
    // Wide-open vowels
    a: 0.95, o: 0.85,
    // Mid-open vowels
    e: 0.70, u: 0.65,
    // Narrow vowels
    i: 0.45, y: 0.40,
    // Fricatives — narrow opening with the tongue/teeth involved
    f: 0.25, v: 0.25, s: 0.20, z: 0.20,
    // Plosives / stops — brief medium opening
    t: 0.35, d: 0.40, k: 0.45, g: 0.45,
    // Liquids + nasals
    l: 0.50, r: 0.50, n: 0.40,
    // Semi-vowels / glides
    w: 0.35, h: 0.30, j: 0.40,
    // Other
    c: 0.40, q: 0.45, x: 0.30,
};

// Stay-closed during punctuation pauses; small breath gap.
function classifyChar(c) {
    if (!c) return 0;
    if (/\s/.test(c))             return 0.0;      // space → mouth resting
    if (/[.!?]/.test(c))          return 0.05;    // sentence-end pause
    if (/[,;:]/.test(c))          return 0.10;    // light pause
    const low = c.toLowerCase();
    if (CHAR_AMP[low] !== undefined) return CHAR_AMP[low];
    if (/[a-z]/.test(low))        return 0.45;    // unknown letter — neutral
    return 0.0;                                    // anything else → silence
}

// Build the curve: one keyframe per character, plus a closing
// keyframe at duration. Each character spans durationMs / N time. We
// then run a smoothing pass that biases each keyframe a bit toward
// its neighbours, so a "ma" → "a" transition doesn't snap from 0.05
// to 0.95 instantly. Real speech has these ramps because the
// articulators take time to move.
//
// Returns: [{ tMs, amp }, ...]
export function buildAmplitudeCurve(text, durationMs) {
    if (!text) return [{ tMs: 0, amp: 0 }, { tMs: durationMs, amp: 0 }];
    const chars = Array.from(text);
    const N = chars.length;
    if (N === 0 || durationMs <= 0) return [{ tMs: 0, amp: 0 }, { tMs: durationMs, amp: 0 }];
    const dt = durationMs / N;
    // First pass — raw classification
    const raw = chars.map((c) => classifyChar(c));
    // Smoothing pass — leaky-integrator forward + backward so the
    // values blend over ~2-3 chars. Coefficients 0.55 (decay) / 0.45
    // (new) give ~5-char half-life, comparable to natural ramp time
    // at typical speaking rates.
    const smooth = raw.slice();
    const ALPHA = 0.55;
    for (let i = 1; i < N; i++) {
        smooth[i] = ALPHA * smooth[i - 1] + (1 - ALPHA) * raw[i];
    }
    // Backward smoothing — gives ramps on the LEADING edge of
    // syllables (a vowel after a consonant gets a more gradual
    // opening, not just on the closing).
    for (let i = N - 2; i >= 0; i--) {
        smooth[i] = ALPHA * smooth[i + 1] + (1 - ALPHA) * smooth[i];
    }
    const keyframes = new Array(N + 2);
    keyframes[0] = { tMs: 0, amp: 0 };
    for (let i = 0; i < N; i++) {
        keyframes[i + 1] = { tMs: (i + 0.5) * dt, amp: smooth[i] };
    }
    keyframes[N + 1] = { tMs: durationMs, amp: 0 };
    return keyframes;
}

// Linear-interpolation lookup. O(log n) would be nicer but lipsync
// curves are short (< 200 chars typically) and we sample once per
// rAF tick (60Hz) — total cost is trivial.
export function sampleCurveAt(curve, tMs) {
    if (!curve || curve.length === 0) return 0;
    if (tMs <= curve[0].tMs) return curve[0].amp;
    const last = curve[curve.length - 1];
    if (tMs >= last.tMs) return last.amp;
    // Linear search forward — curves are short enough
    for (let i = 0; i < curve.length - 1; i++) {
        const a = curve[i], b = curve[i + 1];
        if (tMs >= a.tMs && tMs <= b.tMs) {
            const span = b.tMs - a.tMs;
            if (span <= 0) return b.amp;
            const f = (tMs - a.tMs) / span;
            return a.amp + (b.amp - a.amp) * f;
        }
    }
    return 0;
}

// Convenience: add a small natural jitter on top of the curve. Real
// lips don't move along a smooth bezier — there's micro-tremor and
// individual tongue movements. JITTER_AMP gives the animation an
// organic feel without losing the underlying phoneme shape.
const JITTER_AMP = 0.08;
export function sampleWithJitter(curve, tMs) {
    return sampleCurveAt(curve, tMs) + (Math.random() - 0.5) * JITTER_AMP;
}
