// WebGLEngine/brain/rl/homeEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMPASS LIFE WITH A DOOR (the homing round, registered in brain/FLY_FINDS_HOME_WIP.md before this file existed). brain/rl/compassEnv.mjs's life, unchanged and not edited (this
// extends it), with a position: the fly moves 1 a tick along its true heading (after the tick's turn and gust), from its door at (0, 0). From HOME_AT on it is going home. score() is
// 1 less the closest it comes to its door after HOME_AT, over how far it was at HOME_AT, held at 0 and above. The observation, reward and info are the compass life's.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { CompassEnv } from "./compassEnv.mjs";

export const HOME_AT = 1000;

export class HomeEnv extends CompassEnv {
    reset(seed) { this.x = 0; this.y = 0; this.out = null; this.closest = Infinity; return super.reset(seed); }
    step(action) {
        const r = super.step(action);
        this.x += Math.cos(this.th); this.y += Math.sin(this.th);
        const d = Math.hypot(this.x, this.y);
        if (this.t === HOME_AT) this.out = d; else if (this.t > HOME_AT) this.closest = Math.min(this.closest, d);
        return r;
    }
    /** See the header (null before the life has gone home at all). */
    score() { return this.out === null || this.closest === Infinity ? null : this.out > 0 ? Math.max(0, 1 - this.closest / this.out) : 1; }
}
