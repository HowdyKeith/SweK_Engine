// WebGLEngine/brain/stealthMotion.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/stealthMotion-selfcheck.mjs; the round note is brain/STEALTH_ROUNDS_WIP.md)
//
// THE MOTION-DETECTOR ANALYSIS OF SANTON, TROSCIANKO, HEATBUN AND HOW 2025, "Stealth and deception: Adaptive motion camouflage in hunting broadclub cuttlefish", Science Advances 11:eadr3686 (Materials and Methods, "Motion detection algorithms"; Figure 4).
// The cuttlefish Sepia latimanus passes dark stripes DOWN its head and arms while it approaches a crab; the paper shows that an expanding predator cue overlaid with downward-moving stripes is less likely to make a crab respond (Figure 2) and that a simple elementary motion detector (EMD) sees the stripe display as one strong
// downward motion where a plain expanding ellipse is a radially symmetric pattern (Figure 4). THIS FILE IS THAT ANALYSIS AS CODE, written from the paper's description, not from the authors' MATLAB (not seen):
//   1 filtering   the receiver's limits are applied first: a spatial acuity of about 1 cycle/degree and a temporal limit (the critical flicker fusion frequency, about 60 Hz). The paper says the temporal Gaussian blur has the sigma at which a 60 Hz flicker is reduced to 1% of its amplitude;
//                 the spatial limit is only named ("about 1 cycle/degree"), so the SAME 1%-at-the-limit rule is used for it here (an assumption, said in the gate and the note).
//   2 the EMD     spatiotemporally correlated vertical and horizontal detectors on two adjacent pixels l and r over two consecutive frames 0 and 1:   h = (l0 - l1)(l0 - r1) - (r0 - r1)(r0 - l1)   ("a gradient moving left will create a positive value"; the vertical detector is the same on the upper and lower pixel).
//                 Not designed to simulate specific neural pathways; no wagon-wheel artefacts were wanted, and a sequence recorded far above the flicker limit is blurred to the receiver's, which is why the temporal blur comes first.
//   3 the numbers R and M   per frame the detector gives a motion vector at each pixel (mx to the right, my UP); R, the weighted mean resultant vector alignment, is |sum of vectors| / sum of strengths (1 = all aligned, 0 = symmetric, so a radially symmetric expansion has R near 0); M, the resultant motion
//                 strength, is |sum of vectors| over the whole sequence (so R = M / total strength). The paper's values (arbitrary units; only their ordering and ratios are comparable): no stripes R 0, M 0.11; static stripes R 0.09, M 740; moving stripes R 0.92, M 25,067 (34 times the static stripes); hunting leaf display R 0.09 M 341, stripe display R 0.56 M 3,034.
//   4 stimuli     the treadmill experiment's ellipses: dark disc (Weber contrast WC against a medium-grey background Ib) expanding exponentially from 10 degrees to 53 x 74 degrees over 10 s; or the same ellipse carrying 3 cycles of dark/light stripes (1:5), still or moving DOWN at 4 Hz; light stripes at +WC and dark at -WC.
// NOT CHECKED, said plainly: the authors' exact pixel scale, noise threshold (they kept displacements above the 99th percentile of the background's motion) and video sizes; so ONLY the ordering and rough ratios of R and M are comparable with the paper, not the absolute M. A synthetic ellipse is not the recorded hunting video.
// Pure: no DOM, no clock, no Math.random, no file.
"use strict";

/** The temporal or spatial Gaussian sigma (in the unit of 1/f) at which a sinusoid of frequency `f` is reduced to `frac` of its amplitude: exp(-2 pi^2 sigma^2 f^2) = frac. The paper's rule for the temporal blur (60 Hz to 1%). */
export function sigmaForAttenuation(f, frac = 0.01) {
    if (!(f > 0) || !(frac > 0) || !(frac < 1)) throw new Error(`stealthMotion.sigmaForAttenuation: f > 0 and 0 < frac < 1, got ${f}, ${frac}`);
    return Math.sqrt(-Math.log(frac) / (2 * Math.PI * Math.PI * f * f));
}

/** A frame is { w, h, data: Float32Array(w * h) } of luminance 0..1, row-major, y down. */
export function newFrame(w, h, fill = 0) { const data = new Float32Array(w * h); if (fill) data.fill(fill); return { w, h, data }; }

function kernel(sigma) {
    if (!(sigma > 0)) return [1];
    const r = Math.max(1, Math.ceil(3 * sigma)), k = new Array(2 * r + 1); let s = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
    return k.map((v) => v / s);
}

/** A separable Gaussian blur of one frame, `sigmaPx` pixels, edges clamped (a new frame; sigma 0 or less copies). */
export function blurFrame(f, sigmaPx) {
    if (!(sigmaPx > 0)) return { w: f.w, h: f.h, data: Float32Array.from(f.data) };
    const k = kernel(sigmaPx), r = (k.length - 1) / 2, { w, h } = f, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * f.data[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = s; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; out[y * w + x] = s; }
    return { w, h, data: out };
}

/** A temporal Gaussian blur of a frame sequence, `sigmaFrames` frames, edges clamped (a new sequence). */
export function blurTime(seq, sigmaFrames) {
    if (!(sigmaFrames > 0) || seq.length < 2) return seq.map((f) => ({ w: f.w, h: f.h, data: Float32Array.from(f.data) }));
    const k = kernel(sigmaFrames), r = (k.length - 1) / 2, n = seq.length;
    return seq.map((f, t) => { const out = new Float32Array(f.data.length); for (let i = -r; i <= r; i++) { const g = seq[Math.min(n - 1, Math.max(0, t + i))].data, c = k[i + r]; for (let p = 0; p < out.length; p++) out[p] += c * g[p]; } return { w: f.w, h: f.h, data: out }; });
}

/**
 * The receiver's filter: spatial blur at the acuity limit (`acuityCyclesPerDeg`, default 1) and temporal blur at the critical flicker fusion frequency (`cffHz`, default 60), each at the sigma that reduces a sinusoid at the limit to 1%.
 * `degPerPixel` is the stimulus' pixel size, `fps` its frame rate. Returns a new sequence.
 */
export function receiverFilter(seq, { degPerPixel, fps, acuityCyclesPerDeg = 1, cffHz = 60, atLimit = 0.01 }) {
    if (!(degPerPixel > 0) || !(fps > 0)) throw new Error(`stealthMotion.receiverFilter: degPerPixel and fps are positive, got ${degPerPixel}, ${fps}`);
    const sx = sigmaForAttenuation(acuityCyclesPerDeg, atLimit) / degPerPixel, st = sigmaForAttenuation(cffHz, atLimit) * fps;
    return blurTime(seq.map((f) => blurFrame(f, sx)), st);
}

/**
 * The paper's detector on one pair of consecutive frames: h = (l0 - l1)(l0 - r1) - (r0 - r1)(r0 - l1) with l = the pixel (x, y) and r = (x + 1, y); the vertical detector the same with u = (x, y) and d = (x, y + 1). A positive h is motion TOWARD l (to the left);
 a positive v is motion toward u (up). Returns { w, h, mx, my } with the motion vector per pixel (mx to the RIGHT, my UP, so mx = -h, my = v); the last column and row are 0 (no neighbour).
 */
export function emdPair(f0, f1) {
    const { w, h } = f0, mx = new Float32Array(w * h), my = new Float32Array(w * h), a = f0.data, b = f1.data;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
        const i = y * w + x, l0 = a[i], r0 = a[i + 1], l1 = b[i], r1 = b[i + 1], u0 = a[i], d0 = a[i + w], u1 = b[i], d1 = b[i + w];
        mx[i] = -((l0 - l1) * (l0 - r1) - (r0 - r1) * (r0 - l1));
        my[i] = (u0 - u1) * (u0 - d1) - (d0 - d1) * (d0 - u1);
    }
    return { w, h, mx, my };
}

/**
 * R and M of a frame sequence (see the header): { R, M, total, mx, my, frames } with the summed motion vector (mx, my), M = |(mx, my)|, total = the sum of the strengths over all pixels and frame pairs, R = M / total (0 when total is 0).
 * `threshold` drops pixel vectors weaker than it (the paper's noise floor was the 99th percentile of the background's motion; a synthetic sequence has none, so the default is 0).
 */
export function motionSummary(seq, { threshold = 0 } = {}) {
    if (!Array.isArray(seq) || seq.length < 2) throw new Error("stealthMotion.motionSummary: a sequence of at least two frames");
    let sx = 0, sy = 0, total = 0;
    for (let t = 1; t < seq.length; t++) { const e = emdPair(seq[t - 1], seq[t]); for (let i = 0; i < e.mx.length; i++) { const s = Math.hypot(e.mx[i], e.my[i]); if (s > threshold) { sx += e.mx[i]; sy += e.my[i]; total += s; } } }
    const M = Math.hypot(sx, sy);
    return { R: total > 0 ? M / total : 0, M, total, mx: sx, my: sy, frames: seq.length - 1 };
}

/** Weber contrast to luminance: a dark target of contrast `wc` against a background `ib` has luminance ib (1 - wc); a light one ib (1 + wc), capped at 1. */
export const darkLuminance = (wc, ib = 0.5) => ib * (1 - wc);
export const lightLuminance = (wc, ib = 0.5) => Math.min(1, ib * (1 + wc));

/** The diameter (degrees) of a stimulus growing EXPONENTIALLY from `d0` to `d1` over `T` seconds at time t (clamped to [0, T]): d0 (d1/d0)^(t/T). The treadmill stimuli went from 10 degrees to 53 (vertical) and 74 (horizontal) in 10 s. */
export function expandingDiameter(t, T, d0, d1) { const u = Math.min(1, Math.max(0, t / T)); return d0 * Math.pow(d1 / d0, u); }

/**
 * The treadmill stimulus as a frame sequence: a background of luminance `ib` and an ellipse at the frame's centre growing from 10 to (`finalH` x `finalV`) degrees over `T` seconds (60 frames per second by default 120 as the monitor), with
 *   stripes "none"     a plain dark ellipse of Weber contrast `wc` ("gray" in the paper)
 *   stripes "static"   3 cycles of stripes down the ellipse's height, dark (1/6 of a cycle: the 1:5 ratio) at -wc and light at +wc, not moving relative to the ellipse
 *   stripes "moving"   the same stripes moving DOWN at `stripeHz` cycles/second relative to the ellipse
 * Pixels are `degPerPixel` degrees; the ellipse edge is anti-aliased by 0.5 pixel. Returns { frames, degPerPixel, fps }.
 */
export function ellipseStimulus({ stripes = "none", wc = 1, stripeHz = 4, T = 10, fps = 120, degPerPixel = 0.5, w = 176, h = 128, ib = 0.5, startDeg = 10, finalH = 74, finalV = 53, cycles = 3, darkFrac = 1 / 6 } = {}) {
    if (!["none", "static", "moving"].includes(stripes)) throw new Error(`stealthMotion.ellipseStimulus: stripes is none, static or moving, got ${JSON.stringify(stripes)}`);
    if (!(T > 0) || !(fps > 0) || !(degPerPixel > 0) || !(wc >= 0 && wc <= 1)) throw new Error("stealthMotion.ellipseStimulus: T, fps and degPerPixel are positive and 0 <= wc <= 1");
    const n = Math.max(2, Math.round(T * fps) + 1), frames = [], dark = darkLuminance(wc, ib), light = lightLuminance(wc, ib), cx = (w - 1) / 2, cy = (h - 1) / 2, ratio = finalH / finalV;
    for (let k = 0; k < n; k++) {
        const t = k / fps, dV = expandingDiameter(t, T, startDeg * 1, finalV) , dH = dV * ratio, aH = dH / 2 / degPerPixel, aV = dV / 2 / degPerPixel, f = newFrame(w, h, ib);
        const phase = stripes === "moving" ? stripeHz * t : 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const nx = (x - cx) / aH, ny = (y - cy) / aV, rr = Math.sqrt(nx * nx + ny * ny), edge = 0.5 / Math.min(aH, aV);   // inside when rr < 1, a 0.5 pixel soft edge
            const cover = Math.min(1, Math.max(0, (1 - rr) / edge + 0.5));
            if (cover <= 0) continue;
            let inside = dark;
            if (stripes !== "none") { const u = (((y - cy) / aV / 2 + 0.5) * cycles - phase) % 1, frac = u < 0 ? u + 1 : u; inside = frac < darkFrac ? dark : light; }   // y is down and the stripe pattern is a function of (y - phase), so it moves DOWN (toward larger y) as `phase` grows
            f.data[y * w + x] = ib * (1 - cover) + inside * cover;
        }
        frames.push(f);
    }
    return { frames, degPerPixel, fps };
}

/** The three stimuli of Figure 4A to C run through the receiver's filter and the detector: { none, static, moving } each { R, M, total, ... }, and the ratio of the moving stripes' M to the static stripes'. */
export function figure4(opts = {}) {
    const out = {};
    for (const s of ["none", "static", "moving"]) { const st = ellipseStimulus({ ...opts, stripes: s }); out[s] = motionSummary(receiverFilter(st.frames, { degPerPixel: st.degPerPixel, fps: st.fps }), { threshold: opts.threshold || 0 }); }
    out.movingOverStatic = out.static.M > 0 ? out.moving.M / out.static.M : Infinity;
    return out;
}
