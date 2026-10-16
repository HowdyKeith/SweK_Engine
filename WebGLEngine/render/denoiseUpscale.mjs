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
