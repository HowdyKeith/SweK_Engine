// WebGLEngine/render/denoiseTemporal.mjs -- the denoiser arc, round 4: frames before the measured one, and what they hold
//
// render/learned-denoiser-preregistration.md section 17, as code, gated by render/denoiseTemporal-selfcheck.mjs on
// non-dataset scenes only. Each scene becomes a short sequence: the camera orbits the scene's look point for FRAMES
// frames and ARRIVES at the scene's own eye, so the measured (last) frame is exactly the image rounds 1-3 measured --
// the same 4-sample input, the same 1024-sample reference -- and the frames before it are new 4-sample renders.
//
// THE HISTORY FRONT-END IS SHARED. Both the filter and the network are handed the same accumulated irradiance: each
// pixel's first-hit point is projected into the previous frame's camera, its four bilinear taps are kept only where
// they saw the same object at the same place with the same normal, and a running average over the valid history is
// carried forward (alpha = 1 / n, n the history length, capped at FRAMES). The question the round asks is what each
// method does with that history, not which one was given more of it.
"use strict";
import { render, intersect, cameraBasis, pixelRay } from "../physics/render/pathTracer.mjs";
import { rng } from "../physics/render/furnace.mjs";
import { IMAGE, SPP_IN, SPP_REF, ALBEDO_FLOOR, CHANNELS, makeScene, guideBuffers, renderSeeds, isDatasetSeed } from "./denoiseScenes.mjs";

export const FRAMES = 8;                              // the measured frame and the seven before it
export const STEP_DEG = Object.freeze([1.5, 4]);       // the orbit's step per frame, drawn per scene in this range
export const TCHANNELS = CHANNELS + 4;                 // + current noisy irradiance rgb, + history length / FRAMES
export const POS_TOL = 3;                              // a tap's first hit must lie within this many pixel footprints
export const NORMAL_DOT = 0.9;                         // ...and face within this cosine of the pixel's normal
export const HISTORY_SEED_BASE = 1e7;                  // history render seeds live above every 8 s + k

/** The render seed of history frame f (0 .. FRAMES - 2) of scene `seed`. The measured frame keeps 8 s + 1. */
export function historySeed(seed, f) {
    if (!(Number.isInteger(f) && f >= 0 && f < FRAMES - 1)) throw new Error(`denoiseTemporal: history frame ${f} is not in 0..${FRAMES - 2}`);
    return HISTORY_SEED_BASE + seed * 8 + f;
}
/** Every render seed a sequence uses: the measured frame's input, reference and second reference, and the history's. */
export function sequenceSeeds(seed) {
    const r = renderSeeds(seed);
    return [r.input, r.ref, r.ref2, ...Array.from({ length: FRAMES - 1 }, (_, f) => historySeed(seed, f))];
}

/**
 * The eye of every frame. The orbit keeps the scene's ring radius and height and steps a per-scene angle, drawn from
 * a stream of its own (so the scene's draws are untouched); the last frame's eye IS the scene's, value for value.
 */
export function cameraPath(S) {
    const r = rng((((S.seed >>> 0) * 2246822519) + (S.family === "A" ? 41 : 43)) >>> 0);
    const step = (STEP_DEG[0] + (STEP_DEG[1] - STEP_DEG[0]) * r()) * Math.PI / 180, dir = r() < 0.5 ? -1 : 1;
    const ang = Math.atan2(S.eye[2], S.eye[0]), R = Math.hypot(S.eye[0], S.eye[2]);
    const eyes = Array.from({ length: FRAMES }, (_, f) => {
        if (f === FRAMES - 1) return S.eye;
        const a = ang - dir * step * (FRAMES - 1 - f);
        return [R * Math.cos(a), S.eye[1], R * Math.sin(a)];
    });
    return { eyes, stepDeg: step * 180 / Math.PI, dir };
}

/** Each pixel's centre-ray first hit from `eye`: world position, unit normal, and the scene index of what it hit (-1: sky). */
export function firstHits(S, eye, w = IMAGE, h = IMAGE) {
    const B = cameraBasis({ ...S, eye }), pos = new Float64Array(w * h * 3), nrm = new Float64Array(w * h * 3), obj = new Int32Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const hit = intersect(eye, pixelRay(x, y, 0.5, 0.5, w, h, B), S.scene), p = y * w + x;
        if (!hit) continue;
        obj[p] = S.scene.indexOf(hit.sphere);
        for (let c = 0; c < 3; c++) { pos[p * 3 + c] = hit.P[c]; nrm[p * 3 + c] = hit.N[c]; }
    }
    return { eye, B, pos, nrm, obj };
}

/**
 * Where each pixel of `cur` was in `prev`: up to four bilinear taps and their weights, renormalised over the taps that
 * saw the same object, within POS_TOL footprints of the same point, facing within NORMAL_DOT. A pixel with no valid
 * tap (sky, or disoccluded) has weight 0 everywhere. Returns { taps: Int32Array(4 n), wts: Float64Array(4 n), valid }.
 */
export function reproject(prev, cur, w = IMAGE, h = IMAGE) {
    const n = w * h, taps = new Int32Array(4 * n).fill(-1), wts = new Float64Array(4 * n), valid = new Uint8Array(n), B = prev.B;
    for (let p = 0; p < n; p++) {
        if (cur.obj[p] < 0) continue;
        const P = [cur.pos[p * 3], cur.pos[p * 3 + 1], cur.pos[p * 3 + 2]], N = [cur.nrm[p * 3], cur.nrm[p * 3 + 1], cur.nrm[p * 3 + 2]];
        const d = [P[0] - prev.eye[0], P[1] - prev.eye[1], P[2] - prev.eye[2]];
        const df = d[0] * B.fwd[0] + d[1] * B.fwd[1] + d[2] * B.fwd[2];
        if (df <= 1e-9) continue;
        const u = (d[0] * B.right[0] + d[1] * B.right[1] + d[2] * B.right[2]) / df, v = (d[0] * B.camUp[0] + d[1] * B.camUp[1] + d[2] * B.camUp[2]) / df;
        // pixelRay's two lines, inverted: pixel x's centre is at X = x
        const X = (u / (B.scale * (w / h)) + 1) / 2 * w - 0.5, Y = (1 - v / B.scale) / 2 * h - 0.5;
        const x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
        // the tolerance: a pixel's footprint at this depth, stretched where the surface is seen at a grazing angle
        const dist = Math.hypot(P[0] - cur.eye[0], P[1] - cur.eye[1], P[2] - cur.eye[2]);
        const cosV = Math.abs((N[0] * (cur.eye[0] - P[0]) + N[1] * (cur.eye[1] - P[1]) + N[2] * (cur.eye[2] - P[2])) / dist);
        const tol = POS_TOL * dist * 2 * cur.B.scale / h / Math.max(cosV, 0.2);
        let sum = 0;
        const cand = [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]];
        for (let k = 0; k < 4; k++) {
            const [qx, qy, wk] = cand[k];
            if (qx < 0 || qy < 0 || qx >= w || qy >= h || wk === 0) continue;
            const q = qy * w + qx;
            if (prev.obj[q] !== cur.obj[p]) continue;
            if (Math.hypot(prev.pos[q * 3] - P[0], prev.pos[q * 3 + 1] - P[1], prev.pos[q * 3 + 2] - P[2]) > tol) continue;
            if (prev.nrm[q * 3] * N[0] + prev.nrm[q * 3 + 1] * N[1] + prev.nrm[q * 3 + 2] * N[2] < NORMAL_DOT) continue;
            taps[4 * p + k] = q; wts[4 * p + k] = wk; sum += wk;
        }
        if (sum < 1e-4) { for (let k = 0; k < 4; k++) { taps[4 * p + k] = -1; wts[4 * p + k] = 0; } continue; }
        for (let k = 0; k < 4; k++) wts[4 * p + k] /= sum;
        valid[p] = 1;
    }
    return { taps, wts, valid };
}

/**
 * The running average. `irr[f]` is frame f's demodulated noisy irradiance and `geo[f]` its first hits. Frame 0 starts
 * every pixel at history length 1; each later frame resamples the previous average and length through reproject(),
 * and where the pixel is valid takes n = min(n_prev + 1, FRAMES) and A = A_prev + (I - A_prev) / n. An invalid pixel
 * (sky, disocclusion) restarts at its own sample, n = 1. Returns { A, n } for the last frame.
 */
export function accumulate(irr, geo, w = IMAGE, h = IMAGE) {
    const N = w * h;
    let A = Float64Array.from(irr[0]), n = new Float64Array(N).fill(1);
    for (let f = 1; f < irr.length; f++) {
        const { taps, wts, valid } = reproject(geo[f - 1], geo[f], w, h), A2 = new Float64Array(N * 3), n2 = new Float64Array(N);
        for (let p = 0; p < N; p++) {
            if (!valid[p]) { n2[p] = 1; for (let c = 0; c < 3; c++) A2[p * 3 + c] = irr[f][p * 3 + c]; continue; }
            let np = 0; const ap = [0, 0, 0];
            for (let k = 0; k < 4; k++) { const q = taps[4 * p + k]; if (q < 0) continue; const wk = wts[4 * p + k]; np += wk * n[q]; for (let c = 0; c < 3; c++) ap[c] += wk * A[q * 3 + c]; }
            const nn = Math.min(np + 1, FRAMES);
            n2[p] = nn;
            for (let c = 0; c < 3; c++) A2[p * 3 + c] = ap[c] + (irr[f][p * 3 + c] - ap[c]) / nn;
        }
        A = A2; n = n2;
    }
    return { A, n };
}

const demodulate = (radiance, albedo) => { const y = new Float64Array(radiance.length); for (let i = 0; i < y.length; i++) y[i] = radiance[i] / Math.max(albedo[i], ALBEDO_FLOOR); return y; };

/**
 * Render a scene's sequence. The measured frame (the last) is rendered exactly as render/denoiseScenes.mjs's
 * renderImages renders it -- same seeds, same eye -- and FRAMES - 1 history frames before it at sppIn samples each.
 * *** THROWS FOR A DATASET SEED WITHOUT { harvest: true }. *** Returns the measured frame's input / ref (/ ref2),
 * albedo and normal, the accumulated irradiance A and history length n, and the path.
 */
export function renderSequence(family, seed, { harvest = false, ref2 = false, w = IMAGE, h = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF } = {}) {
    if (isDatasetSeed(seed) && !harvest) throw new Error(`denoiseTemporal: seed ${seed} is a dataset seed -- rendering it needs { harvest: true }`);
    const S = makeScene(family, seed), rs = renderSeeds(seed), path = cameraPath(S);
    const opts = (spp, s, eye) => ({ w, h, spp, seed: s, rgb: true, eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky });
    const irr = [], geo = [];
    let input = null, cur = null;
    for (let f = 0; f < FRAMES; f++) {
        const eye = path.eyes[f], last = f === FRAMES - 1;
        const G = guideBuffers({ ...S, eye }, w, h);
        const rad = render(S.scene, opts(sppIn, last ? rs.input : historySeed(seed, f), eye));
        irr.push(demodulate(rad, G.albedo)); geo.push(firstHits(S, eye, w, h));
        if (last) { input = rad; cur = G; }
    }
    const { A, n } = accumulate(irr, geo, w, h);
    const out = { family, seed, w, h, seeds: rs, input, ref: render(S.scene, opts(sppRef, rs.ref, S.eye)), albedo: cur.albedo, normal: cur.normal,
                  irr: irr[FRAMES - 1], A, n, path };
    if (ref2) out.ref2 = render(S.scene, opts(sppRef, rs.ref2, S.eye));
    return out;
}

/**
 * The temporal input, H x W x TCHANNELS: [accumulated irradiance rgb, albedo rgb, normal xyz] -- the nine channels
 * every filter and head reads, with the accumulation where a single frame's irradiance was -- then the measured frame's
 * own noisy irradiance rgb and the history length / FRAMES.
 */
export function temporalChannels(seq) {
    const N = seq.w * seq.h, C = TCHANNELS, x = new Float64Array(N * C);
    for (let p = 0; p < N; p++) {
        for (let c = 0; c < 3; c++) {
            x[p * C + c] = seq.A[p * 3 + c];
            x[p * C + 3 + c] = seq.albedo[p * 3 + c];
            x[p * C + 6 + c] = seq.normal[p * 3 + c];
            x[p * C + 9 + c] = seq.irr[p * 3 + c];
        }
        x[p * C + 12] = seq.n[p] / FRAMES;
    }
    return x;
}
