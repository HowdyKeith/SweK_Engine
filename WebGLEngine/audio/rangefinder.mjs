// WebGLEngine/audio/rangefinder.mjs -- v4301
//
// A SPEAKER AND A MICROPHONE AS A RANGEFINDER: emit a chirp, listen, and ask how long the sound took to come
// back. The tree has had both halves for a long time and never joined them -- ui/wakeWord.js, airCough.js
// and world/ProceduralMusic.js all make sound, #73 processes the microphone, and nothing anywhere could ask
// the second question. This file is the asking, and it is PURE: samples in, detections out, no AudioContext,
// so every claim it makes can be graded against a synthesised echo with no microphone in the room.
//
// The idea is ruvnet/batvu (MIT): a 17.5-20.5 kHz chirp from a phone, matched filtering, pulse compression,
// a CFAR detector, an occupancy map. *** NONE OF ITS CODE IS HERE. *** Its numbers are checked as arithmetic
// rather than repeated as promises:
//
//   pulse-compression gain = 10 log10(B T) = 10 log10(3000 * 0.005) = 11.76 dB    (batvu says 11.8 dB)
//   range resolution      = c / (2 B)     = 343 / 6000            = 5.72 cm      (batvu reports 9.6 cm
//                                                                                  achieved -- a window and an
//                                                                                  envelope widen the bound)
//   range                 = c t / 2        so 3.8 m is a 22 ms echo
//
// *** THE DIRECT PATH IS THE CLOCK. *** The speaker is centimetres from the microphone, so the loudest thing
// the matched filter finds is the chirp arriving directly, at lag ~0. Every echo is measured FROM that peak,
// not from when the sample buffer started -- audio pipelines add tens of milliseconds of latency that would
// otherwise read as ten metres of empty room.
//
// *** THE BLIND ZONE IS THE CHIRP'S OWN LENGTH. *** A 5 ms chirp is 0.86 m of round trip, and until the
// direct path has finished arriving its tail is louder than any echo; the first draft reported a 9 dB
// "target" at 0.80 m in every clean run that was nothing but that tail. So detections begin at
// blindMargin * chirp length after the direct-path peak: 0.94 m at these defaults. batvu's 0.6 m floor
// needs a shorter chirp or direct-path subtraction, and this file does neither; it says so instead.
//
// What is NOT here: batvu's occupancy grid needs the phone's motion to sweep the beam; with one fixed
// speaker this is a one-dimensional range profile, and it says so. And no real-room number is claimed
// anywhere in this tree until a rig with a microphone has produced one.
"use strict";
import { fft, ifft } from "../physics/fft.js";
import { strictSin, strictCos } from "../tools/strictTrig.mjs";
import { rng } from "./sfxModel.mjs";

export const SPEED_OF_SOUND = 343;          // m/s, dry air at 20 C
export const DEFAULTS = Object.freeze({
    sampleRate: 48000,
    f0: 17500, f1: 20500,                   // batvu's band: above most hearing, below a phone's Nyquist
    chirpSeconds: 0.005,
    listenSeconds: 0.030,                   // 5.1 m of round trip at 343 m/s
    factor: 20,                             // OS-CFAR threshold multiplier on power (13 dB above the median cell)
    quantile: 0.5,                          // the ordered statistic: the MEDIAN of the training cells
    guardPulses: 3, trainPulses: 8,         // window sizes in compressed-pulse widths (sampleRate / bandwidth)
    blindMargin: 1.1,                       // the blind zone is the chirp's own length, times this
});

/** The compressed pulse is about sampleRate / bandwidth samples wide; CFAR windows are sized in that unit. */
export const pulseWidth = (bandwidthHz, sampleRate) => Math.ceil(sampleRate / bandwidthHz);

// ---- closed forms ---------------------------------------------------------------------------------------------
export const rangeOf = (lagSamples, sampleRate, c = SPEED_OF_SOUND) => c * lagSamples / (2 * sampleRate);
export const lagOf = (metres, sampleRate, c = SPEED_OF_SOUND) => 2 * metres * sampleRate / c;
export const resolution = (bandwidthHz, c = SPEED_OF_SOUND) => c / (2 * bandwidthHz);
export const compressionGainDb = (bandwidthHz, seconds) => 10 * Math.log10(bandwidthHz * seconds);
export const maxRange = (listenSeconds, c = SPEED_OF_SOUND) => c * listenSeconds / 2;

/** A linear chirp f0 -> f1 over `seconds`, Hann-windowed, from the strict sine so it is the same everywhere. */
export function chirp({ f0 = DEFAULTS.f0, f1 = DEFAULTS.f1, seconds = DEFAULTS.chirpSeconds, sampleRate = DEFAULTS.sampleRate } = {}) {
    const n = Math.round(seconds * sampleRate), out = new Float64Array(n), k = (f1 - f0) / seconds;
    for (let i = 0; i < n; i++) {
        const t = i / sampleRate, phase = 2 * Math.PI * (f0 * t + 0.5 * k * t * t);
        const w = 0.5 - 0.5 * strictCos(2 * Math.PI * i / (n - 1));
        out[i] = w * strictSin(phase);
    }
    return out;
}

const nextPow2 = (n) => 1 << Math.ceil(Math.log2(n));

/**
 * Cross-correlate `rx` with `ref` by FFT and return the analytic envelope, one value per rx sample: the
 * pulse-compressed range profile. Index k is "the reference began k samples into rx".
 */
export function matchedFilter(rx, ref) {
    const N = nextPow2(rx.length + ref.length);
    const re = new Float64Array(N), im = new Float64Array(N), hr = new Float64Array(N), hi = new Float64Array(N);
    re.set(rx); hr.set(ref);
    const R = fft(re, im), H = fft(hr, hi);
    // correlation: R * conj(H)
    for (let i = 0; i < N; i++) {
        const a = R.re[i], b = R.im[i], c = H.re[i], d = -H.im[i];
        R.re[i] = a * c - b * d; R.im[i] = a * d + b * c;
    }
    // analytic signal of the correlation: keep positive frequencies (doubled), drop negative ones
    for (let i = 1; i < N / 2; i++) { R.re[i] *= 2; R.im[i] *= 2; }
    for (let i = N / 2 + 1; i < N; i++) { R.re[i] = 0; R.im[i] = 0; }
    const t = ifft(R.re, R.im), env = new Float64Array(rx.length);
    for (let i = 0; i < rx.length; i++) env[i] = Math.hypot(t.re[i], t.im[i]);
    return env;
}

/**
 * Ordered-statistic CFAR on a power profile: a cell is a detection when it is a local maximum and exceeds
 * `factor` times the `quantile`-th ordered training cell either side, with `guard` cells next to it excluded.
 *
 * *** WHY ORDERED-STATISTIC AND NOT CELL-AVERAGING. *** The first draft averaged the training cells, and a
 * synthetic echo at 1.5 m with 27 dB of margin went undetected: the compressed pulse is ~30 samples wide
 * under a Hann window, the window was 6 guard + 32 train, and the pulse's own skirt sat in the training
 * cells and raised its own threshold above itself. A percentile ignores a neighbouring pulse (a second
 * target, or this one's skirt) as long as it occupies less than (1 - quantile) of the window; an average
 * does not. batvu made the same choice for the same reason.
 */
export function cfar(env, { guard, train, factor = DEFAULTS.factor, quantile = DEFAULTS.quantile, from = 0, to = env.length } = {}) {
    if (!(guard >= 1) || !(train >= 2)) throw new Error("cfar: guard and train must be given (profile() derives them from the bandwidth)");
    const p = new Float64Array(env.length); for (let i = 0; i < env.length; i++) p[i] = env[i] * env[i];
    const out = [], cells = new Float64Array(2 * train), k = Math.min(2 * train - 1, Math.floor(quantile * 2 * train));
    for (let i = Math.max(from, guard + train, 1); i < Math.min(to, env.length - guard - train - 1); i++) {
        if (!(p[i] > p[i - 1] && p[i] >= p[i + 1])) continue;
        let m = 0;
        for (let c = i - guard - train; c < i - guard; c++) cells[m++] = p[c];
        for (let c = i + guard + 1; c <= i + guard + train; c++) cells[m++] = p[c];
        const sorted = cells.slice().sort();
        const noise = sorted[k];
        if (p[i] > factor * noise) out.push({ lag: i, level: env[i], snrDb: 10 * Math.log10(p[i] / Math.max(noise, 1e-30)) });
    }
    return out;
}

/**
 * The whole question: recorded samples -> ranges. Finds the direct-path peak, then every CFAR detection
 * after it, expressed in metres from the speaker.
 */
export function profile(rx, ref, { sampleRate = DEFAULTS.sampleRate, c = SPEED_OF_SOUND, blindMargin = DEFAULTS.blindMargin,
                                    bandwidth = DEFAULTS.f1 - DEFAULTS.f0, ...cf } = {}) {
    const env = matchedFilter(rx, ref);
    let t0 = 0; for (let i = 1; i < env.length; i++) if (env[i] > env[t0]) t0 = i;
    const blind = Math.ceil(blindMargin * ref.length), from = t0 + blind;
    const w = pulseWidth(bandwidth, sampleRate);
    const guard = cf.guard ?? DEFAULTS.guardPulses * w, train = cf.train ?? DEFAULTS.trainPulses * w;
    const hits = cfar(env, { ...cf, guard, train, from }).map((d) => ({ ...d, delay: d.lag - t0, seconds: (d.lag - t0) / sampleRate, metres: rangeOf(d.lag - t0, sampleRate, c) }));
    return { envelope: env, directPath: t0, detections: hits, blindMetres: rangeOf(blind, sampleRate, c), window: { guard, train, pulseWidth: w } };
}

/**
 * A synthetic recording: the chirp at lag 0 (the direct path), each echo at its delay and amplitude, and
 * Gaussian noise from a seeded generator so a gate's failure reproduces exactly.
 */
export function synthEcho(ref, { sampleRate = DEFAULTS.sampleRate, seconds = DEFAULTS.listenSeconds, echoes = [], noise = 0, seed = 1, direct = 1, c = SPEED_OF_SOUND } = {}) {
    const n = Math.round(seconds * sampleRate), out = new Float64Array(n), r = rng(seed);
    const place = (lag, amp) => { for (let i = 0; i < ref.length && lag + i < n; i++) if (lag + i >= 0) out[lag + i] += amp * ref[i]; };
    if (direct) place(0, direct);
    for (const e of echoes) place(Math.round(e.lag ?? lagOf(e.metres, sampleRate, c)), e.amp ?? 0.1);
    if (noise > 0) for (let i = 0; i < n; i++) {
        const u1 = Math.max(r(), 1e-12), u2 = r();
        out[i] += noise * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    return out;
}
