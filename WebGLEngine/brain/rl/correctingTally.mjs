// WebGLEngine/brain/rl/correctingTally.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A HOMING FLY WHOSE TALLY LEARNS FROM ITS COMPASS'S CORRECTIONS (the corrected-tally round, registered in brain/FLY_TALLY_CORRECT_WIP.md before this file existed). brain/rl/homingFly.mjs's
// HomingFly, with one thing more: besides the home vector it keeps a MEMORY of its recent steps (each tick multiplied by exp(-1 / tau), then the step added). Each tick the compass's correction
// is d = (the belief after the fly's act) less (the belief before it) less (the fly's own turn), wrapped; the memory and the home vector are both turned by g d, so the steps taken on the old
// belief are re-laid along the new one, the recent ones most. At g 0 it is HomingFly to the bit. The fly's steering is not touched: only the home vector shown it from HOME_AT.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { CLOCK, GOAL, wrap } from "./compassEnv.mjs";
import { HOME_AT } from "./homeEnv.mjs";

export class CorrectingTally {
    constructor(inner, g, tau) {
        if (!inner || typeof inner.act !== "function") throw new Error("correctingTally.CorrectingTally: it wraps a fly with act()");
        if (!(Number.isFinite(g) && g >= 0) || !(Number.isFinite(tau) && tau > 0)) throw new Error("correctingTally.CorrectingTally: g >= 0 and tau > 0");
        this.inner = inner; this.g = g; this.k = Math.exp(-1 / tau); this.hx = 0; this.hy = 0; this.rx = 0; this.ry = 0;
    }
    get phi() { return this.inner.phi; }
    set phi(v) { this.inner.phi = v; }
    act(o) {
        if (o[CLOCK] === 0) { this.hx = 0; this.hy = 0; this.rx = 0; this.ry = 0; }
        let seen = o;
        if (o[CLOCK] >= HOME_AT) { seen = Float64Array.from(o); seen[GOAL] = Math.atan2(-this.hy, -this.hx); }
        const before = this.inner.phi, a = this.inner.act(seen);
        if (this.g !== 0) {
            const d = wrap(this.inner.phi - before - a[0]);
            if (d !== 0) {
                const c = Math.cos(this.g * d), s = Math.sin(this.g * d), nx = c * this.rx - s * this.ry, ny = s * this.rx + c * this.ry;
                this.hx += nx - this.rx; this.hy += ny - this.ry; this.rx = nx; this.ry = ny;
            }
        }
        const sx = Math.cos(this.inner.phi), sy = Math.sin(this.inner.phi);
        this.hx += sx; this.hy += sy; this.rx = this.k * this.rx + sx; this.ry = this.k * this.ry + sy;
        return a;
    }
}
