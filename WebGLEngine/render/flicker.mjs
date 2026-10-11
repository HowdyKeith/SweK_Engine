// render/flicker.mjs -- v4746 -- FLICKER: what a displayed sequence alternates that the scene does not.
//
// A frame generator shows real, generated, real, generated ... and every quality gate in this tree grades ONE frame against
// the frame rendered at its time. None of them can see a sequence whose real and generated frames are each close to the
// truth and differ from each other in the same way every other refresh: sharp, soft, sharp, soft. That is flicker at half
// the display rate, and it is what this measures.
//
// *** NOT THE ALTERNATING SUM, WHICH A MOVING SCENE ALREADY HAS. *** The first draft summed (-1)^j over each pixel's luma and
// read the TRUTH at 0.5 to 2 (in 1/255) on 16 frames of a knot turning: a pixel whose luma changes linearly has an
// alternating sum of half its slope times the frame count. So each pixel's sequence is first taken through its second
// difference, h_j = x_j - (x_j-1 + x_j+1) / 2, which a linear trend does not reach, and the alternation is the mean of
// (-1)^j h_j, halved so that x_j = c + a(-1)^j reads a. A held frame -- each shown twice while the scene moves by s a
// frame -- reads s / 4: judder is alternation too, and the gate's control arm is exactly that.
// *** AND THE MEAN IS TAPERED, BECAUSE A SHORT WINDOW LEAKS MOTION INTO IT. *** Stripes crossing a pixel at 0.2 cycles a
// frame have no half-rate component, but a plain mean of (-1)^j h_j over 12 frames reads up to about 1 / n of their amplitude,
// with a sign that depends on where the window falls: the gate's first run read a held frame under a pan as +0.30 over the
// scene on 16 frames and -1.14 on 12. A Hann window over the interior (weights sin^2(pi j / (n - 1))) keeps every answer
// above -- each of those signals has (-1)^j h_j constant -- and drops the leakage seven times over at 0.21 cycles a frame
// (render/flicker-selfcheck.mjs).
//
// flickerCPU({ frames, truths, w, h }): the sequence shown and the sequence rendered at the same times, each an array of
// w*h*4 rgba, at least three. Luma is Rec. 709 of the clamped colour. Returns, in luma units ([0, 1]; the gates print them
// times 255):
//   shown    the mean over pixels of |alternation| of the displayed sequence
//   truth    the same of the truth's -- a scene with fine detail moving has its own (a stripe crossing half its period in
//            half a frame), and it is not flicker
//   excess   shown - truth: what the viewer sees alternate that the scene does not. Negative is a sequence SMOOTHER than
//            the scene, which is a loss of temporal detail and not a flicker
//   error    the mean |alternation| of the error, shown - truth, per pixel
//   map      w*h Float32Array, the error's alternation per pixel, signed: positive where the even frames are brighter
//            than the truth relative to the odd ones
"use strict";

const LUMA = [0.2126, 0.7152, 0.0722];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function flickerCPU({ frames, truths, w, h }) {
    if (!Array.isArray(frames) || !Array.isArray(truths) || frames.length !== truths.length)
        throw new Error("flickerCPU: frames and truths must be arrays of the same length -- one truth per frame shown");
    const n = frames.length;
    if (n < 3) throw new Error(`flickerCPU: a second difference needs three frames -- got ${n}`);
    for (const b of frames.concat(truths)) if (!b || b.length < w * h * 4) throw new Error("flickerCPU: every frame and truth must be w*h*4");
    const lum = (b, i) => LUMA[0] * clamp01(b[i * 4]) + LUMA[1] * clamp01(b[i * 4 + 1]) + LUMA[2] * clamp01(b[i * 4 + 2]);
    const map = new Float32Array(w * h), wt = new Float64Array(n);
    let wsum = 0;
    for (let j = 1; j < n - 1; j++) { wt[j] = Math.sin(Math.PI * j / (n - 1)) ** 2; wsum += wt[j]; }
    let shown = 0, truth = 0, error = 0;
    const d = new Float64Array(n), t = new Float64Array(n);
    for (let i = 0; i < w * h; i++) {
        for (let j = 0; j < n; j++) { d[j] = lum(frames[j], i); t[j] = lum(truths[j], i); }
        let ad = 0, at = 0;
        for (let j = 1; j < n - 1; j++) {
            const s = j % 2 ? -wt[j] : wt[j];
            ad += s * (d[j] - (d[j - 1] + d[j + 1]) / 2); at += s * (t[j] - (t[j - 1] + t[j + 1]) / 2);
        }
        const aD = ad / wsum / 2, aT = at / wsum / 2;
        shown += Math.abs(aD); truth += Math.abs(aT); error += Math.abs(aD - aT); map[i] = aD - aT;
    }
    const N = w * h;
    return { shown: shown / N, truth: truth / N, excess: (shown - truth) / N, error: error / N, map };
}
