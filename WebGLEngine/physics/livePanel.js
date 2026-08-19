// physics/livePanel.js
//
// The "behind-the-scenes math" that a small inset window shows next to the main view -- not another camera on the same
// scene, but the numbers underneath it, computed live. Two panels to start, both built on subsystems the engine already
// proves: a spectrum panel that samples a moving scene and runs the strict FFT to show which frequencies are in it, and
// a zeta-line panel that evaluates |zeta(1/2+it)| along the critical line so the nontrivial zeros show up as dips. Each
// returns plain arrays a renderer can draw as bars or a curve; the value is that the panel reads the real computation,
// so watching the inset is watching the physics, not a decoration.
import { spectrum } from "./fft.js";
import { makeChain, setMode, chainStep } from "./vibrations.js";
import { zetaMag } from "./zetaCritical.js";

// Spectrum panel: sample one mass of a vibrating chain in a given mode over N steps, return the lower-half magnitude
// spectrum (the bars) plus the bin of the peak. A renderer draws bars[]; the peak bin marks the mode's frequency.
export function spectrumPanel({ mode = 3, N = 8192, sub = 2 } = {}) {
    const st = makeChain({ N: 12, k: 1, m: 1 }); setMode(st, mode, 0.3);
    const sig = new Float64Array(N);
    for (let i = 0; i < N; i++) { sig[i] = st.x[3]; for (let k = 0; k < sub; k++) chainStep(st, 1 / 240); }
    const mag = spectrum(sig), half = N >> 1, bars = new Float64Array(half);
    let peak = 1, pv = -1; for (let k = 1; k < half; k++) { bars[k] = mag[k]; if (mag[k] > pv) { pv = mag[k]; peak = k; } }
    return { bars, peak };
}

// Zeta-line panel: sample |zeta(1/2+it)| across a t-range, return the curve plus the indices where it dips near zero
// (the nontrivial zeros). A renderer draws curve[] against t; the dips are the zeros.
export function zetaLinePanel({ tMin = 8, tMax = 27, steps = 190 } = {}) {
    const curve = new Float64Array(steps + 1), ts = new Float64Array(steps + 1);
    for (let i = 0; i <= steps; i++) { const t = tMin + (tMax - tMin) * i / steps; ts[i] = t; curve[i] = zetaMag(t); }
    // local minima below a small threshold = zeros
    const dips = [];
    for (let i = 1; i < steps; i++) if (curve[i] < 0.2 && curve[i] < curve[i - 1] && curve[i] < curve[i + 1]) dips.push(ts[i]);
    return { ts, curve, dips };
}
