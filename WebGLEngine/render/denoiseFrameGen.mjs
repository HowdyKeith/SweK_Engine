// WebGLEngine/render/denoiseFrameGen.mjs -- the denoiser arc, round 59 (pre-registration section 133, backlog
// denoise-fsr3-framegen): FSR3's frame generation between two of round 32's chain frames, on the path tracer's output.
//
// THE SEQUENCE is round 32's (render/denoiseTemporalUpscale.mjs): the camera orbits for FRAMES frames, each traced at half size
// at 4 samples on its JITTER offset, and goes through round 30's chain to full size. Here the chain is ACCUMULATED TWICE: through
// frame 6 (O6) and through frame 7 (O7, which is round 32's Bt), each composited with the light sources seen from its own eye.
// The frame between them is generated at t = 0.5 by render/frameInterp.mjs's interpolateFrameCPU -- the CPU reference FSR3's TSL
// generator (fx/fsr/fsrFrameGenTsl.mjs) is held to -- with that generator's defaults, from the SCENE'S OWN MOTION: each pixel's
// first hit from eye 7 projected into camera 6, as an engine hands FSR3 its motion vectors. The truth is a frame traced at the
// midpoint of the orbit's last step.
"use strict";
import { render, cameraBasis, pixelRay } from "../physics/render/pathTracer.mjs";
import { makeScene, renderSeeds, guideBuffers, inputChannels, isDatasetSeed, IMAGE, SPP_IN, SPP_REF } from "./denoiseScenes.mjs";
import { emitterCoverage, emitterRadiance, withMask } from "./denoiseMask.mjs";
import { FRAMES, cameraPath, firstHits } from "./denoiseTemporal.mjs";
import { JITTER, accumulateUpscaled, shiftResample, halfShift } from "./denoiseTemporalUpscale.mjs";
import { upscale, fillEmitters, compositeEmitters } from "./denoiseUpscale.mjs";
import { interpolateFrameCPU, crossFadeCPU } from "./frameInterp.mjs";
import { denoise } from "./denoiseNet.mjs";

/** The generator as fsr-three.html runs it by default (fx/fsr/fsrFrameGenTsl.mjs's makeFrameGen): radius 4, reach 16, blended, the farther neighbour. */
export const FRAMEGEN_FILL = Object.freeze({ radius: 4, reach: 16, side: "blend", prefer: "farther" });
/** The two frames generated between, by index in the sequence: the orbit's last step. */
export const PREV_FRAME = FRAMES - 2, CUR_FRAME = FRAMES - 1;
/** A sky pixel's depth: farther than any surface. */
export const SKY_DEPTH = 1e9;
/** Round 59's render seeds live above every other round's: BASE + 16 s + k. */
export const FRAMEGEN_SEED_BASE = 3e7;

/** The render seeds of one image: FRAMES half-size frames, the midpoint's half-size frame, and renderSeeds' reference and second reference. */
export function frameGenSeeds(seed) {
    const r = renderSeeds(seed), b = FRAMEGEN_SEED_BASE + seed * 16;
    return { half: Array.from({ length: FRAMES }, (_, f) => b + f), mid: b + FRAMES, ref: r.ref, ref2: r.ref2 };
}

/** The midpoint of the orbit's last step: frames 6's and 7's ring and height, at the mean of their angles. */
export function midEye(path) {
    const a = path.eyes[PREV_FRAME], b = path.eyes[CUR_FRAME];
    let t0 = Math.atan2(a[2], a[0]), t1 = Math.atan2(b[2], b[0]);
    if (t1 - t0 > Math.PI) t0 += 2 * Math.PI; else if (t0 - t1 > Math.PI) t1 += 2 * Math.PI;
    const R = Math.hypot(b[0], b[2]), m = (t0 + t1) / 2;
    return [R * Math.cos(m), b[1], R * Math.sin(m)];
}

/** A point (or, with `dir`, a direction at infinity) in camera B's pixel coordinates -- pixelRay inverted, pixel x's centre at X = x -- or null behind it. */
export function projectTo(B, w, h, P, dir = false) {
    const d = dir ? P : [P[0] - B.eye[0], P[1] - B.eye[1], P[2] - B.eye[2]];
    const df = d[0] * B.fwd[0] + d[1] * B.fwd[1] + d[2] * B.fwd[2];
    if (df <= 1e-9) return null;
    const u = (d[0] * B.right[0] + d[1] * B.right[1] + d[2] * B.right[2]) / df, v = (d[0] * B.camUp[0] + d[1] * B.camUp[1] + d[2] * B.camUp[2]) / df;
    return [(u / (B.scale * (w / h)) + 1) / 2 * w - 0.5, (1 - v / B.scale) / 2 * h - 0.5];
}

/**
 * THE MOTION FIELD, the scene's own, indexed by the NEWER frame (interpolateFrameCPU's indexedBy "cur"): at each pixel of the
 * W x H grid seen from `eyeCur`, its position less where its first hit (or, on sky, its direction) falls in the camera at
 * `eyePrev`. Depth is the hit's distance along the newer camera's forward axis, SKY_DEPTH on sky. A hit behind the older
 * camera has no vector (NaN), which the generator reads as a pixel it does not splat. { flow (W*H*2), depth (W*H), sky }.
 */
export function motionField(S, eyePrev, eyeCur, W, H) {
    const g = firstHits(S, eyeCur, W, H), Bp = cameraBasis({ ...S, eye: eyePrev }), Bc = cameraBasis({ ...S, eye: eyeCur });
    const flow = new Float32Array(W * H * 2).fill(NaN), depth = new Float32Array(W * H);
    let sky = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x, hit = g.obj[p] >= 0;
        let q;
        if (hit) {
            const P = [g.pos[p * 3], g.pos[p * 3 + 1], g.pos[p * 3 + 2]];
            q = projectTo(Bp, W, H, P);
            depth[p] = (P[0] - eyeCur[0]) * Bc.fwd[0] + (P[1] - eyeCur[1]) * Bc.fwd[1] + (P[2] - eyeCur[2]) * Bc.fwd[2];
        } else { q = projectTo(Bp, W, H, pixelRay(x, y, 0.5, 0.5, W, H, Bc), true); depth[p] = SKY_DEPTH; sky++; }
        if (q) { flow[p * 2] = x - q[0]; flow[p * 2 + 1] = y - q[1]; }
    }
    return { flow, depth, sky };
}

/**
 * Render one image's sequence: round 32's FRAMES half-size frames (no full-size 1-sample frames -- no arm here uses them), the
 * midpoint's own half-size frame, unjittered (the secondary Bmid1), and the reference and second reference, full size at
 * sppRef from the midpoint eye. `E` is emitterRadiance at full size from eyes 6 and 7 and the midpoint, each frame's composite.
 * *** THROWS FOR A DATASET SEED WITHOUT { harvest: true }. ***
 */
export function renderFrameGenImages(family, seed, { harvest = false, w = IMAGE, h = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF } = {}) {
    if (isDatasetSeed(seed) && !harvest) throw new Error(`denoiseFrameGen: seed ${seed} is a dataset seed -- rendering it needs { harvest: true }`);
    if (w % 2 || h % 2) throw new Error(`denoiseFrameGen: a ${w} x ${h} frame has no half size`);
    const S = makeScene(family, seed), rs = frameGenSeeds(seed), path = cameraPath(S), mid = midEye(path);
    const opts = (W, H, spp, s, eye, off) => ({ w: W, h: H, spp, seed: s, rgb: true, eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky, pixelOffset: off });
    const frame = (W, H, spp, s, eye, off) => {
        const Sf = { ...S, eye }, input = render(S.scene, opts(W, H, spp, s, eye, off)), g = guideBuffers(Sf, W, H, off), cov = emitterCoverage(Sf, W, H, off);
        return { w: W, h: H, spp, input, cov, x: withMask(inputChannels(input, g.albedo, g.normal, W, H), cov) };
    };
    const frames = path.eyes.map((eye, f) => ({ eye, jitter: JITTER[f], half: frame(w / 2, h / 2, sppIn, rs.half[f], eye, JITTER[f]) }));
    return { family, seed, w, h, seeds: rs, path, mid, frames, midHalf: frame(w / 2, h / 2, sppIn, rs.mid, mid, null),
             ref: render(S.scene, opts(w, h, sppRef, rs.ref, mid, null)), ref2: render(S.scene, opts(w, h, sppRef, rs.ref2, mid, null)),
             E: { prev: emitterRadiance({ ...S, eye: path.eyes[PREV_FRAME] }, w, h), cur: emitterRadiance({ ...S, eye: path.eyes[CUR_FRAME] }, w, h), mid: emitterRadiance({ ...S, eye: mid }, w, h) } };
}

const rgba = (img3, n) => { const o = new Float32Array(n * 4); for (let p = 0; p < n; p++) { o[p * 4] = img3[p * 3]; o[p * 4 + 1] = img3[p * 3 + 1]; o[p * 4 + 2] = img3[p * 3 + 2]; o[p * 4 + 3] = 1; } return o; };
const rgb = (img4, n) => { const o = new Float64Array(n * 3); for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) o[p * 3 + c] = img4[p * 4 + c]; return o; };

/**
 * One image's frames, every arm, from its rendered sequence: pure in (sequence, net), so C4 re-makes G whole. G the generated
 * frame (FRAMEGEN_FILL), X the cross-fade, R the older frame repeated; noisy the newer frame's half-size input through the
 * chain's fill, bilinear upscale, shift and composite (round 32's noisyHalf at frame 7); Bmid1 the chain on the midpoint frame
 * alone; GNoFill the generator with its holes left black. `field` is the warp's own check and the holes' count.
 */
/**
 * Round 66 (section 151): the fill scaled by 256 / 1920 -- radius 1, reach 2 -- so a 256 x 256 frame leaves the holes 1080p's
 * full fill leaves (0.97 % against 0.77 % on round 63's scene). With `{ holes: true }` frameGenFrames adds the scaled generator
 * between L6 and L7 and its holes filled four ways: Gh (black, today's), GhX (the cross-fade), GhC (L7), GhP (L6), each
 * composited at the midpoint as G' is; and `holeMask`, 1 where the scaled generator left a hole.
 */
export const HOLE_FILL = Object.freeze({ radius: 1, reach: 2, side: "blend", prefer: "farther" });
export function frameGenFrames(seq, net, { holes = false } = {}) {
    const W = seq.w, H = seq.h, w = W / 2, h = H / 2, N = W * H, S = makeScene(seq.family, seq.seed), den = (fr) => denoise(net, fr.x, fr.h, fr.w).y;
    const geo = seq.path.eyes.map((eye) => firstHits(S, eye, W, H));
    const up = (img, cov, kind) => upscale(fillEmitters(img, cov, w, h), w, h, W, H, kind);
    const halfY = seq.frames.map((f) => ({ y: up(den(f.half), f.half.cov, "easu"), shift: halfShift(f.jitter) }));
    // round 60 (section 136): L6 and L7, the accumulations BEFORE the composite -- light-free, round 30's fill took the light sources out
    const L6 = accumulateUpscaled(halfY.slice(0, PREV_FRAME + 1), geo.slice(0, PREV_FRAME + 1), W, H).A, L7 = accumulateUpscaled(halfY, geo, W, H).A;
    const O6 = compositeEmitters(L6, seq.E.prev), O7 = compositeEmitters(L7, seq.E.cur);
    const m = motionField(S, seq.path.eyes[PREV_FRAME], seq.path.eyes[CUR_FRAME], W, H);
    const gen = (fill, a = O6, b = O7) => interpolateFrameCPU({ prev: rgba(a, N), cur: rgba(b, N), w: W, h: H, flow: m.flow, bw: W, bh: H, block: 1, depthBlock: m.depth, indexedBy: "cur", t: 0.5, fill });
    const g = gen(FRAMEGEN_FILL), g0 = gen(null);
    // round 60: the same generator between the light-free frames, and every arm composited with the light sources at the midpoint
    const gl = gen(FRAMEGEN_FILL, L6, L7), gl0 = gen(null, L6, L7), mid = (y) => compositeEmitters(y, seq.E.mid);
    const last = seq.frames[CUR_FRAME];
    const noisyLight = shiftResample(up(last.half.input, last.half.cov, "bilinear"), W, H, ...halfShift(last.jitter));
    const noisy = compositeEmitters(noisyLight, seq.E.cur);
    // the field's own check, ON THE GEOMETRY: each pixel's first hit from eye 7 against the hit from eye 6 at the pixel its vector
    // points to, and at the same pixel unmoved -- the mean distance between the two points. Not on the images: the composited light
    // sources are up to 30 x their surroundings, so a one-pixel rounding at a light's edge outweighs every other pixel (measured)
    let warped = 0, still = 0, nw = 0, ns = 0;
    const g6 = geo[PREV_FRAME], g7 = geo[CUR_FRAME], dist = (q, p) => Math.hypot(g6.pos[q * 3] - g7.pos[p * 3], g6.pos[q * 3 + 1] - g7.pos[p * 3 + 1], g6.pos[q * 3 + 2] - g7.pos[p * 3 + 2]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x, vx = m.flow[p * 2], vy = m.flow[p * 2 + 1];
        if (g7.obj[p] < 0 || !Number.isFinite(vx)) continue;
        const X = Math.round(x - vx), Y = Math.round(y - vy), q = Y * W + X;
        if (X >= 0 && Y >= 0 && X < W && Y < H && g6.obj[q] === g7.obj[p]) { warped += dist(q, p); nw++; }
        if (g6.obj[p] === g7.obj[p]) { still += dist(p, p); ns++; }
    }
    let holeArms = {};
    if (holes) {
        const gh = gen(HOLE_FILL, L6, L7), G0 = rgb(gh.frame, N), xf = rgb(crossFadeCPU({ prev: rgba(L6, N), cur: rgba(L7, N), w: W, h: H, t: 0.5 }), N);
        const holeMask = Uint8Array.from(gh.hole);
        const fb = (src) => { const o = Float64Array.from(G0); for (let p = 0; p < N; p++) if (holeMask[p]) for (let c = 0; c < 3; c++) o[p * 3 + c] = src[p * 3 + c]; return o; };
        holeArms = { Gh: mid(G0), GhX: mid(fb(xf)), GhC: mid(fb(L7)), GhP: mid(fb(L6)), holeMask, holesScaled: gh.holes };
    }
    return { ...holeArms, G: rgb(g.frame, N), X: rgb(crossFadeCPU({ prev: rgba(O6, N), cur: rgba(O7, N), w: W, h: H, t: 0.5 }), N), R: O6, O7, noisy,
             Bmid1: compositeEmitters(up(den(seq.midHalf), seq.midHalf.cov, "easu"), seq.E.mid), GNoFill: rgb(g0.frame, N),
             // round 60: the light-free arrangement -- G', X', R' and its noisy frame, each composited with E_mid
             Gl: mid(rgb(gl.frame, N)), Xl: mid(rgb(crossFadeCPU({ prev: rgba(L6, N), cur: rgba(L7, N), w: W, h: H, t: 0.5 }), N)), Rl: mid(L6), noisyMid: mid(noisyLight),
             GlNoFill: mid(rgb(gl0.frame, N)), L6, L7,
             field: { holes: g.holes, holesNoFill: g0.holes, filled: g.filled, sky: m.sky, pointWarped: nw ? warped / nw : null, pointStill: ns ? still / ns : null, moved: Array.from(m.flow).filter((v, i) => i % 2 === 0 && Number.isFinite(v)).reduce((a, v, i, arr) => a + Math.abs(v) / arr.length, 0) } };
}
