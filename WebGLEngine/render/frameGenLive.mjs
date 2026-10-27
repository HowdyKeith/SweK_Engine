// WebGLEngine/render/frameGenLive.mjs -- FSR3's frame generation, LIVE, on path-tracer.html (backlog denoise-framegen-page)
//
// The denoiser arc measured the generator between two path-traced frames (rounds 59-66, render/denoiseFrameGen.mjs) and paced it
// (render/framePacer.mjs). This is the same generator on a page: the camera orbits a scene, each REAL frame is traced in a worker
// (render/frameGenLive-worker.mjs) with the scene's own motion field from the frame before, and between two real frames the page
// generates the half-way one -- interpolateFrameCPU, indexed by the newer frame, round 66's scaled fill (HOLE_FILL) and what is
// left a hole cross-faded (round 66: the cross-fade beat black on 24 of 24). The pacer is the existing one, "midpoint": a pair's
// half-way frame goes up when its newer frame is ready, the newer frame half a real interval later.
//
// Gated by render/frameGenLive-selfcheck.mjs. Pure: no DOM, no Worker -- the page and the worker are thin wiring over this.
"use strict";
import { render } from "../physics/render/pathTracer.mjs";
import { makeScene } from "./denoiseScenes.mjs";
import { motionField, HOLE_FILL } from "./denoiseFrameGen.mjs";
import { interpolateFrameCPU } from "./frameInterp.mjs";
import { makeFramePacer } from "./framePacer.mjs";

/** The live view's defaults: 128 x 128 at 2 samples, 3 degrees of orbit a real frame, and the scene a non-dataset one. */
export const LIVE = Object.freeze({ w: 128, h: 128, spp: 2, stepDeg: 3, family: "R", seed: 990990, holes: "crossfade", fill: HOLE_FILL });

/** The eye `deg` degrees round the vertical axis through the scene's look point from its own eye, +x toward +z -- the radius and height kept. */
export function orbitEye(S, deg) {
    const dx = S.eye[0] - S.look[0], dz = S.eye[2] - S.look[2], a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [S.look[0] + c * dx - s * dz, S.eye[1], S.look[2] + s * dx + c * dz];
}

const toRgba = (img3, n) => { const o = new Float32Array(n * 4); for (let p = 0; p < n; p++) { o[p * 4] = img3[p * 3]; o[p * 4 + 1] = img3[p * 3 + 1]; o[p * 4 + 2] = img3[p * 3 + 2]; o[p * 4 + 3] = 1; } return o; };

/**
 * One real frame, as the worker makes it: real frame `k` of the orbit, traced at `spp` (render seed k + 1, so every frame's noise
 * differs), as w x h x 4 floats; and with `k` > 0 the scene's own motion field from frame k - 1's eye, indexed by this frame.
 */
export function traceJob({ family = LIVE.family, seed = LIVE.seed, k, w = LIVE.w, h = LIVE.h, spp = LIVE.spp, stepDeg = LIVE.stepDeg }) {
    if (!(Number.isInteger(k) && k >= 0)) throw new Error(`frameGenLive: a real frame's index is a whole number -- got ${k}`);
    const S = makeScene(family, seed), eye = orbitEye(S, k * stepDeg);
    const img = render(S.scene, { w, h, spp, seed: k + 1, rgb: true, eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky });
    const m = k > 0 ? motionField(S, orbitEye(S, (k - 1) * stepDeg), eye, w, h) : null;
    return { k, w, h, eye, frame: toRgba(img, w * h), flow: m ? m.flow : null, depth: m ? m.depth : null };
}

/** The frame at `t` between real frames a and b (b carrying the field from a): the generator, its fill and its hole rule. */
export function generateBetween(a, b, { t = 0.5, fill = LIVE.fill, holes = LIVE.holes } = {}) {
    if (!b.flow) throw new Error("frameGenLive: the newer frame carries the motion field from the older -- frame 0 has none");
    if (b.k !== a.k + 1) throw new Error(`frameGenLive: a pair is two consecutive real frames -- got ${a.k} and ${b.k}`);
    const { w, h } = b;
    return interpolateFrameCPU({ prev: a.frame, cur: b.frame, w, h, flow: b.flow, bw: w, bh: h, block: 1, depthBlock: b.depth, indexedBy: "cur", t, fill, holes });
}

/**
 * The live view's state: real(job, start, ready) takes the worker's frame k as the pacer takes it; at(time) is what the refresh at
 * `time` shows -- { kind: "real" | "gen" | "hold", k, frame, holes } -- a half-way frame made when it is first shown, as
 * fsr-three.html makes its own. `generate: false` paces the real frames alone (policy "none"), the page's comparison.
 */
export function makeLiveFrameGen({ refresh, generate = true, genCost = 0, fill = LIVE.fill, holes = LIVE.holes } = {}) {
    const pacer = makeFramePacer({ refresh, policy: generate ? "midpoint" : "none", genCost }), jobs = [];
    let made = 0;
    return {
        pacer,
        get generated() { return made; },
        real(job, start, ready) {
            if (job.k !== jobs.length) throw new Error(`frameGenLive: real frames arrive in order -- expected ${jobs.length}, got ${job.k}`);
            jobs.push(job);
            // only the newest pair is ever generated between (the pacer holds the newest pair): older frames go
            if (jobs.length > 2) jobs[jobs.length - 3] = null;
            pacer.real(job.k, start, ready);
        },
        at(time) {
            const s = pacer.at(time);
            if (s.kind === "real") return { kind: "real", k: s.k, scene: s.scene, frame: jobs[s.k].frame, holes: 0 };
            if (s.kind === "gen") { const g = generateBetween(jobs[s.k - 1], jobs[s.k], { t: s.t, fill, holes }); made++;
                return { kind: "gen", k: s.k, t: s.t, scene: s.scene, frame: g.frame, holes: g.holes }; }
            return { kind: "hold", k: s.k, scene: s.scene, frame: null, holes: 0 };
        },
    };
}

/** Display bytes of a frame, as path-tracer.html's other views paint theirs: gamma 2.2, clipped at 1 -- display only. */
export function toBytes(frame, w, h, out = new Uint8ClampedArray(w * h * 4)) {
    for (let p = 0; p < w * h; p++) { for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.min(255, Math.round(255 * Math.pow(Math.max(0, frame[p * 4 + c]), 1 / 2.2))); out[p * 4 + 3] = 255; }
    return out;
}
