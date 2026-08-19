// simulation/cosmo/fft.js -- a radix-2 FFT, and a 3D transform built on it.
//
// Written rather than imported for the usual reason, but there is a sharper one here: EVERYTHING downstream depends on
// this being right, and a wrong FFT does not look wrong. It produces a cosmic web that is plausible, beautiful, and
// meaningless -- exactly the failure the tomography round was built to avoid by checking its analytic shadow BEFORE
// reconstructing anything. So this file is verified against transform pairs that can be written down by hand:
// a delta function transforms to a flat spectrum; a pure cosine transforms to exactly two spikes; and forward
// followed by inverse must return the original to machine precision.
"use strict";

// in-place complex FFT, radix-2, decimation in time. re/im are Float64Array(n), n a power of two.
function fft1d(re, im, inverse = false) {
    const n = re.length;
    if ((n & (n - 1)) !== 0) throw new Error("fft1d: length must be a power of two, got " + n);
    // bit-reversal permutation
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (inverse ? 2 : -2) * Math.PI / len;
        const wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const ar = re[i + k], ai = im[i + k];
                const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
                const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
                re[i + k] = ar + br; im[i + k] = ai + bi;
                re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
                const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
            }
        }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// 3D transform by separability: transform along x, then y, then z.
function fft3d(re, im, n, inverse = false) {
    const lr = new Float64Array(n), li = new Float64Array(n);
    const idx = (x, y, z) => (z * n + y) * n + x;
    for (const axis of [0, 1, 2]) {
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
            for (let i = 0; i < n; i++) {
                const k = axis === 0 ? idx(i, a, b) : axis === 1 ? idx(a, i, b) : idx(a, b, i);
                lr[i] = re[k]; li[i] = im[k];
            }
            fft1d(lr, li, inverse);
            for (let i = 0; i < n; i++) {
                const k = axis === 0 ? idx(i, a, b) : axis === 1 ? idx(a, i, b) : idx(a, b, i);
                re[k] = lr[i]; im[k] = li[i];
            }
        }
    }
}
export { fft1d, fft3d };
