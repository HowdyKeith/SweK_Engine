// WebGLEngine/brain/rl/mushroomRecoverFly.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE MUSHROOM FLY WITH A RECOVERY RATE (the mushroom recovery round, registered in brain/FLY_MUSHROOM_RECOVER_WIP.md before this file existed). brain/rl/mushroomFly.mjs's fly, not edited
// (this extends it), with one more weight: after each trial's decision every Kenyon-cell-to-output connection is drawn back toward its synapse count, w <- w + b (w0 - w), with
// b = B_SCALE max(0, p_b). A plastic fly's weights are [v_1..v_NM, bias, p_a, p_b]; the start is the mushroom fly's with p_b 0 (no recovery). A frozen fly is the mushroom fly's (no p_b).
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { MushroomFly } from "./mushroomFly.mjs";

export const B_SCALE = 0.05;

export class MushroomRecoverFly extends MushroomFly {
    constructor(opts = {}) {
        super(opts);
        if (this.plastic) { const p = new Float32Array(this.nm + 3); p.set(this.p); this.p = p; }
    }
    recovery() { return this.plastic ? B_SCALE * Math.max(0, this.p[this.nm + 2]) : 0; }
    act(o) {
        const a = super.act(o), b = this.recovery();
        if (b > 0) { const w = this.w, w0 = this.w0; for (let e = 0; e < w.length; e++) w[e] += b * (w0[e] - w[e]); }
        return a;
    }
}
