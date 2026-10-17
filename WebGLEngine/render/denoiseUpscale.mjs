// WebGLEngine/render/denoiseUpscale.mjs -- the denoiser arc, round 26 (pre-registration section 81): a frame traced and
// denoised at HALF resolution, brought to full resolution by FSR1 -- and the frames it is judged against.
//
// The real-time lever that changes no arithmetic. A 1080p pass on the GTX 1080 is ~75-80 ms (section 54); a frame at half
// the width and half the height is a quarter of the pixels to trace and a quarter to denoise. Whether the picture survives
// the upscale is the question, and it is asked of fx/fsr/fsr.js's FSR1 -- EASU, then RCAS -- on the shipped network's own
// output, nothing retrained.
//
// *** FSR1 WANTS PERCEPTUAL INPUT IN [0, 1], AND A PATH TRACER'S RADIANCE IS NEITHER. *** fx/fsr/fsr.js says so in its
// header and leaves the transfer to its caller. Here it is fixed, per channel, and the same for every upscale so that two
// arms differ by the filter and never by the space: t = (x / (1 + x))^(1 / 2.2) -- Reinhard, then a display gamma -- and its
// exact inverse after. An upscaled value is clamped to [0, the brightest t of the frame it came from]: RCAS overshoots a
// local peak and is NOT clamped (fx/fsr/fsr-selfcheck measures 1.166 out of a peak near 1), and past the brightest input
// the inverse runs to light the frame never had. An upscaler may sharpen; it may not make light.
//
// A FRAME'S SCENE IS THE ARC'S: makeScene, the pre-registered input (4 samples, the nine channels and the emitter mask), at
// whatever size it is traced. Each image of the round is traced four ways, each on a render seed of its own (C5): the
// reference and second reference at full size, and three inputs -- full size at 4 samples (today's page), full size at 1
// sample, half size at 4 samples. Half size at 4 samples is the SAME NUMBER OF SAMPLES as full size at 1.
"use strict";
import { render } from "../physics/render/pathTracer.mjs";
import { makeScene, renderSeeds, guideBuffers, inputChannels, isDatasetSeed, IMAGE, SPP_IN, SPP_REF } from "./denoiseScenes.mjs";
import { emitterCoverage, withMask } from "./denoiseMask.mjs";
import { fsr1CPU, easuCPU, bilinearCPU } from "../fx/fsr/fsr.js";
import { REL_EPS } from "./denoiseStats.mjs";

/** The display gamma of the transfer. */
export const GAMMA = 2.2;
/** RCAS's sharpness on fx/fsr/fsr.js's scale (1 sharpest, 0 two stops down): AMD's default of 0.2 stops is 0.9. */
export const RCAS_SHARPNESS = 0.9;
/** FSR1's FSR_RCAS_DENOISE: on, because the frame RCAS sharpens is a denoised path-traced frame with grain left in it. */
export const RCAS_DENOISE = true;
/** The upscales: "fsr1" (the round's), "bilinear" (its control), and two reported ones -- EASU alone, RCAS without denoise. */
export const UPSCALES = Object.freeze(["fsr1", "bilinear", "easu", "fsr1-nodenoise"]);

const T_TOP = 1 - 2 ** -24;   // below the transfer's pole, at float32's resolution there
/** Linear radiance to the transfer's space: Reinhard, then 1 / GAMMA. */
export const toPerceptual = (x) => { const v = Math.max(x, 0); return Math.pow(v / (1 + v), 1 / GAMMA); };
/** Its exact inverse, for t in [0, 1). */
export const fromPerceptual = (t) => { const g = Math.pow(Math.min(Math.max(t, 0), T_TOP), GAMMA); return g / (1 - g); };

/**
 * A 3-channel linear image (w x h) to W x H through one of UPSCALES, in the transfer's space, clamped to the frame's own
 * brightest value there, and back to linear.
 */
export function upscale(img3, w, h, W, H, kind = "fsr1") {
    if (!UPSCALES.includes(kind)) throw new Error(`denoiseUpscale: upscale "${kind}" is not one of ${UPSCALES.join(", ")}`);
    if (img3.length !== w * h * 3) throw new Error(`denoiseUpscale: ${img3.length} values are not a ${w} x ${h} rgb image`);
    const src = new Float32Array(w * h * 4);
    let tMax = 0;
    for (let p = 0; p < w * h; p++) {
        for (let c = 0; c < 3; c++) { src[p * 4 + c] = toPerceptual(img3[p * 3 + c]); tMax = Math.max(tMax, src[p * 4 + c]); }
        src[p * 4 + 3] = 1;
    }
    const out = kind === "fsr1" ? fsr1CPU(src, w, h, W, H, RCAS_SHARPNESS, RCAS_DENOISE).data
        : kind === "fsr1-nodenoise" ? fsr1CPU(src, w, h, W, H, RCAS_SHARPNESS, false).data
        : kind === "easu" ? easuCPU(src, w, h, W, H).data
        : bilinearCPU(src, w, h, W, H).data;
    const y = new Float64Array(W * H * 3);
    for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = fromPerceptual(Math.min(Math.max(out[p * 4 + c], 0), tMax));
    return y;
}

/**
 * Section 91 (round 30): a w x h rgb frame with every pixel an emitter touches (cov > 0) replaced from the pixels none
 * touches -- ring by ring inward, each such pixel taking the mean of its 8-neighbours that were known after the previous
 * ring, so the result does not depend on the order pixels are visited. What an upscale reads at an emitter afterwards is
 * the light beside it, never the emitter's own radiance. A frame with no emitter pixel comes back as it went in.
 */
export function fillEmitters(img3, cov, w, h) {
    if (img3.length !== w * h * 3 || cov.length !== w * h) throw new Error(`denoiseUpscale: ${img3.length} values and ${cov.length} coverages are not a ${w} x ${h} frame`);
    const y = Float64Array.from(img3), known = Uint8Array.from(cov, (c) => (c > 0 ? 0 : 1));
    if (!known.includes(1)) throw new Error("denoiseUpscale: every pixel is an emitter's -- there is nothing to fill from");
    for (;;) {
        const ring = [];
        for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
            const p = py * w + px;
            if (known[p]) continue;
            let n = 0, r = 0, g = 0, b = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const qx = px + dx, qy = py + dy, q = qy * w + qx;
                if ((dx || dy) && qx >= 0 && qx < w && qy >= 0 && qy < h && known[q]) { n++; r += y[q * 3]; g += y[q * 3 + 1]; b += y[q * 3 + 2]; }
            }
            if (n) ring.push(p, r / n, g / n, b / n);
        }
        if (!ring.length) return y;
        for (let k = 0; k < ring.length; k += 4) { const p = ring[k]; y[p * 3] = ring[k + 1]; y[p * 3 + 1] = ring[k + 2]; y[p * 3 + 2] = ring[k + 3]; known[p] = 1; }
    }
}

/** Section 91: the emitters put back -- E + (1 - cov) x the frame, per pixel; { cov, E } is render/denoiseMask.mjs's emitterRadiance at the frame's size. */
export function compositeEmitters(img3, { cov, E }) {
    if (img3.length !== cov.length * 3 || E.length !== img3.length) throw new Error(`denoiseUpscale: ${img3.length} values against ${cov.length} coverages and ${E.length} emissions`);
    const y = new Float64Array(img3.length);
    for (let p = 0; p < cov.length; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = E[p * 3 + c] + (1 - cov[p]) * img3[p * 3 + c];
    return y;
}

/**
 * Section 91, THE EMITTER-AWARE UPSCALE: the emitters taken out of the frame before the upscale and put back after it, at
 * full size, from the geometry. The w x h frame's emitter pixels (covHalf > 0, its own coverage) are filled from their
 * neighbours, the filled frame goes through `upscale` unchanged, and each W x H pixel is then E + (1 - cov) x the upscaled
 * value -- the emitters' own light where they cover it, the upscaled light beside them where they do not. `full` is
 * emitterRadiance at W x H.
 */
export function emitterAwareUpscale(img3, covHalf, w, h, W, H, kind, full) {
    if (full.cov.length !== W * H) throw new Error(`denoiseUpscale: ${full.cov.length} full-size coverages are not ${W} x ${H}`);
    return compositeEmitters(upscale(fillEmitters(img3, covHalf, w, h), w, h, W, H, kind), full);
}

/**
 * Section 91, reported: the share of relMSE's sum (y against r, W x H x 3) that lies within `reach` pixels (Chebyshev) of
 * a pixel an emitter touches (cov > 0) -- section 90's descriptive split, fixed now so it can be read beside the test.
 * 0 when no emitter is in view.
 */
export function nearEmitterShare(y, r, cov, W, H, reach = 2) {
    if (y.length !== W * H * 3 || r.length !== y.length || cov.length !== W * H) throw new Error(`denoiseUpscale: ${y.length}, ${r.length} and ${cov.length} values are not a ${W} x ${H} frame`);
    let near = 0, all = 0;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        let by = false;
        for (let dy = -reach; dy <= reach && !by; dy++) for (let dx = -reach; dx <= reach; dx++) {
            const qx = px + dx, qy = py + dy;
            if (qx >= 0 && qx < W && qy >= 0 && qy < H && cov[qy * W + qx] > 0) { by = true; break; }
        }
        for (let c = 0; c < 3; c++) {
            const i = (py * W + px) * 3 + c, e = y[i] - r[i], t = e * e / (r[i] * r[i] + REL_EPS);
            all += t;
            if (by) near += t;
        }
    }
    return all > 0 ? near / all : 0;
}

/** The render seeds of one image of the round: renderSeeds' three, then the full-size 1-sample input and the half-size input. */
export function renderSeedsUpscale(seed) { return { ...renderSeeds(seed), full1: seed * 8 + 4, half: seed * 8 + 5 }; }

/**
 * One image of the round: its references at full size, and its three inputs, each the network's input as the arc builds it.
 * *** THROWS FOR A DATASET SEED WITHOUT { harvest: true }, *** as renderImages does.
 */
export function renderUpscaleImages(family, seed, { harvest = false, w = IMAGE, h = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF } = {}) {
    if (isDatasetSeed(seed) && !harvest) throw new Error(`denoiseUpscale: seed ${seed} is a dataset seed -- rendering it needs { harvest: true }`);
    if (w % 2 || h % 2) throw new Error(`denoiseUpscale: a ${w} x ${h} frame has no half size`);
    const S = makeScene(family, seed), rs = renderSeedsUpscale(seed);
    const opts = (W, H, spp, s) => ({ w: W, h: H, spp, seed: s, rgb: true, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky });
    const frame = (W, H, spp, s) => {
        const input = render(S.scene, opts(W, H, spp, s)), g = guideBuffers(S, W, H);
        return { w: W, h: H, spp, input, x: withMask(inputChannels(input, g.albedo, g.normal, W, H), emitterCoverage(S, W, H)) };
    };
    return { family, seed, w, h, seeds: rs, ref: render(S.scene, opts(w, h, sppRef, rs.ref)), ref2: render(S.scene, opts(w, h, sppRef, rs.ref2)),
             full4: frame(w, h, sppIn, rs.input), full1: frame(w, h, 1, rs.full1), half4: frame(w / 2, h / 2, sppIn, rs.half) };
}
