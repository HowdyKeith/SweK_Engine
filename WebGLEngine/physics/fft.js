// physics/fft.js
//
// A Fourier transform turns a signal in time into its spectrum in frequency -- the tool a physicist reaches for to ask
// "what frequencies are in this?" The catch, for an engine that promises the same bits on every machine, is that the
// transform is built from cosines and sines of 2*pi*k/N, and those are the transcendentals that disagree across
// platforms. So the twiddle factors are computed ONCE, at the top, from the strict-trig core the engine already proves
// bit-identical, into a table; the radix-2 Cooley-Tukey butterflies that do the actual work are then nothing but
// +,-,*,/ over that table. The result is a fast (N log N) transform whose every bit is reproducible -- a spectrum you
// can publish and have someone else recompute exactly. N must be a power of two.
import { strictSin, strictCos } from "../tools/strictTrig.mjs";

function twiddles(N, sign) {
    const c = new Float64Array(N / 2), s = new Float64Array(N / 2), step = sign * 2 * Math.PI / N;
    for (let k = 0; k < N / 2; k++) { c[k] = strictCos(step * k); s[k] = strictSin(step * k); }
    return { c, s };
}

function transform(re, im, sign) {
    const N = re.length;
    // bit-reversal permutation
    for (let i = 1, j = 0; i < N; i++) {
        let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
        if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
    }
    const { c, s } = twiddles(N, sign);
    for (let len = 2; len <= N; len <<= 1) {
        const half = len >> 1, step = N / len;
        for (let i = 0; i < N; i += len) {
            for (let k = 0, w = 0; k < half; k++, w += step) {
                const wr = c[w], wi = s[w], ar = re[i + k + half], ai = im[i + k + half];
                const vr = ar * wr - ai * wi, vi = ar * wi + ai * wr, ur = re[i + k], ui = im[i + k];
                re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + half] = ur - vr; im[i + k + half] = ui - vi;
            }
        }
    }
    return { re, im };
}

// Forward FFT: X_k = sum_n x_n exp(-2 pi i k n / N). Mutates and returns { re, im }.
export function fft(re, im) { return transform(re, im, -1); }

// Inverse FFT: divides by N so ifft(fft(x)) = x.
export function ifft(re, im) { const N = re.length, out = transform(re, im, 1); for (let i = 0; i < N; i++) { out.re[i] /= N; out.im[i] /= N; } return out; }

// Magnitude spectrum |X_k| for a real signal (imag assumed zero on input).
export function spectrum(signal) {
    const N = signal.length, re = Float64Array.from(signal), im = new Float64Array(N);
    fft(re, im);
    const mag = new Float64Array(N); for (let k = 0; k < N; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    return mag;
}

// The bin of the strongest frequency in the lower half (ignoring the DC term at 0).
export function peakBin(signal) {
    const mag = spectrum(signal), N = mag.length; let best = 1, bestv = -1;
    for (let k = 1; k < N / 2; k++) if (mag[k] > bestv) { bestv = mag[k]; best = k; }
    return best;
}
