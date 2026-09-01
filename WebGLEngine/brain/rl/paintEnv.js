// brain/rl/paintEnv.js -- v4220 -- the GPU Brain paints: a policy that PLACES shapes instead of searching
// for them.
//
// Same drop-in interface as rocketEnv, dockEnv and driveEnv (obsDim / actDim / maxSteps / reset / step), so
// brain/rl/dockPolicy.js's trainDockES drives it unchanged -- the fourth environment on that one trainer.
//
// *** WHAT THE POLICY DOES NOT HAVE TO LEARN IS THE POINT. *** fx/primitiveFit.mjs SOLVES the colour: for a
// shape composited at alpha, the least-squares colour is the mean of (target - current)/alpha + current over
// the covered pixels, exactly. So a painting policy never emits a colour, and the three hardest dimensions of
// the problem are removed before learning starts. The action is WHERE and WHAT SHAPE, and nothing else.
//
// ---- obs (17 floats) -------------------------------------------------------------------------------------
//   [ 4x4 grid of mean residual magnitude, normalised ] ++ [ current distance ]
//
// The residual grid is the picture the policy is actually working on: where the canvas is still wrong, and by
// how much. A policy given only the distance would know it was doing badly and not where.
//
// ---- action (5 floats in [-1,1]) --------------------------------------------------------------------------
//   [ x, y, width, height, angle ]   -- a rotated rectangle, coloured by the closed form
//
// The floor to beat is fx/primitiveFit.mjs's own random search, and the comparison that matters is PER SHAPE
// EVALUATION: the hill climber tries ~90 shapes to place one, the policy tries exactly one. See the gate.
"use strict";

import { dims } from "../../render/perceptual.mjs";
import {
    blank, averageColour, spansOf, optimalColour, differenceChange, drawShape, difference, distanceOf,
} from "../../fx/primitiveFit.mjs";

const GRID = 4;
// 4x4 residual grid, the distance, how far through the episode we are, and two noise draws. See _obs().
const OBS_DIM = GRID * GRID + 4, ACT_DIM = 5;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/**
 * A synthetic target: coloured quadrants and a disc.
 *
 * *** IT IS SYNTHETIC ON PURPOSE, AND SEEDED. *** A photograph would make the gate depend on a binary asset
 * and on a decoder, and would make "did it learn" unanswerable -- there would be no way to vary the task. A
 * seeded generator gives a fresh picture per episode from the same distribution, which is what separates a
 * policy that has LEARNED TO PAINT from one that has memorised a single image.
 */
export function makeTarget(w, h, seed = 1) {
    const r = mulberry32(seed >>> 0);
    const im = blank(w, h, [20, 20, 30]);
    const cols = [];
    for (let i = 0; i < 4; i++) cols.push([40 + r() * 200, 40 + r() * 200, 40 + r() * 200]);
    const cx = (0.3 + r() * 0.4) * w, cy = (0.3 + r() * 0.4) * h, rad = (0.15 + r() * 0.12) * Math.min(w, h);
    const disc = [40 + r() * 200, 40 + r() * 200, 40 + r() * 200];
    const sx = (0.3 + r() * 0.4) * w, sy = (0.3 + r() * 0.4) * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const c = cols[(x < sx ? 0 : 1) + (y < sy ? 0 : 2)];
        const inDisc = Math.hypot(x - cx, y - cy) < rad;
        const use = inDisc ? disc : c;
        im.data[i] = use[0]; im.data[i + 1] = use[1]; im.data[i + 2] = use[2];
    }
    return im;
}

export class PaintEnv {
    constructor(opts = {}) {
        this.obsDim = OBS_DIM; this.actDim = ACT_DIM;
        this.w = opts.width || 32; this.h = opts.height || 32;
        this.maxSteps = opts.maxSteps || 20;
        this.alpha = opts.alpha ?? 0.6;
        this.reset(opts.seed || 1);
    }

    reset(seed = 1) {
        this.target = makeTarget(this.w, this.h, seed);
        this.canvas = blank(this.w, this.h, averageColour(this.target));
        this.pixels = this.w * this.h;
        this.diff = difference(this.target, this.canvas);
        this.startDistance = distanceOf(this.diff, this.pixels);
        this.t = 0; this.placed = 0; this.rejected = 0;
        // *** THE POLICY NEEDS A SOURCE OF VARIATION, AND WITHOUT ONE IT PROPOSES ONE SHAPE FOREVER. ***
        // A deterministic MLP maps an observation to exactly one action. Painting needs a SEQUENCE of
        // different shapes, and the observation barely moves when a shape is rejected -- so the policy
        // proposes the same rejected rectangle again, and again. MEASURED before this was added: TWO distinct
        // actions across 20 steps, 1 placed and 19 rejected, scoring below uniformly random shapes. The noise
        // is drawn from the EPISODE SEED, so it is a fresh sequence per episode and identical on replay --
        // evaluation stays reproducible, which a Math.random() here would have quietly destroyed.
        this._noise = mulberry32((seed >>> 0) ^ 0x9e3779b9);
        this._n1 = this._noise() * 2 - 1; this._n2 = this._noise() * 2 - 1;
        return this._obs();
    }

    distance() { return distanceOf(this.diff, this.pixels); }

    /** Mean absolute residual per cell of a GRID x GRID coarse grid, plus the overall distance. */
    _obs() {
        const t = dims(this.target), c = dims(this.canvas);
        const out = new Float32Array(OBS_DIM);
        const cw = this.w / GRID, ch = this.h / GRID;
        for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
            let sum = 0, n = 0;
            const x0 = Math.floor(gx * cw), x1 = Math.floor((gx + 1) * cw);
            const y0 = Math.floor(gy * ch), y1 = Math.floor((gy + 1) * ch);
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const i = (y * this.w + x) * 4;
                sum += Math.abs(t.data[i] - c.data[i]) + Math.abs(t.data[i + 1] - c.data[i + 1]) + Math.abs(t.data[i + 2] - c.data[i + 2]);
                n += 3;
            }
            out[gy * GRID + gx] = n ? sum / n / 255 : 0;
        }
        out[GRID * GRID] = this.distance();
        out[GRID * GRID + 1] = this.maxSteps ? this.t / this.maxSteps : 0;   // where we are in the episode
        out[GRID * GRID + 2] = this._n1;
        out[GRID * GRID + 3] = this._n2;
        return out;
    }

    /** An action in [-1,1]^5 as a rotated rectangle on this canvas. */
    shapeFor(action) {
        const cl = (v) => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
        const u = (v) => (cl(v) + 1) / 2;                       // to [0,1]
        return {
            kind: "rotatedRect",
            x: u(action[0]) * this.w,
            y: u(action[1]) * this.h,
            w: 2 + u(action[2]) * this.w * 0.8,
            h: 2 + u(action[3]) * this.h * 0.8,
            angle: cl(action[4]) * Math.PI,
        };
    }

    step(action) {
        const shape = this.shapeFor(action);
        const spans = spansOf(shape, this.w, this.h);
        const colour = spans.length ? optimalColour(this.target, this.canvas, spans, this.alpha) : null;
        const before = this.distance();
        let delta = 0;
        if (colour) {
            delta = differenceChange(this.target, this.canvas, spans, colour, this.alpha);
            // *** A SHAPE THAT MAKES THE PICTURE WORSE IS NOT DRAWN. *** Without this the policy can and does
            // learn to thrash: place a bad shape, then place another to cover it. Rejecting non-improvements
            // makes the canvas monotone, which is the property that makes the trace meaningful at all.
            if (delta < 0) { drawShape(this.canvas, spans, colour, this.alpha); this.diff += delta; this.placed++; }
            else this.rejected++;
        } else this.rejected++;
        this.t++;
        this._n1 = this._noise() * 2 - 1; this._n2 = this._noise() * 2 - 1;
        const after = this.distance();
        // Reward is the distance closed, scaled so a whole episode is order 1.
        const reward = (before - after) * 100;
        const done = this.t >= this.maxSteps;
        return {
            obs: this._obs(), reward, done,
            info: { distance: after, placed: this.placed, rejected: this.rejected,
                    improvement: this.startDistance - after,
                    docked: done && after < this.startDistance * 0.5, crashed: false, dist: after },
        };
    }
}

export { OBS_DIM, ACT_DIM, GRID };
export default PaintEnv;
