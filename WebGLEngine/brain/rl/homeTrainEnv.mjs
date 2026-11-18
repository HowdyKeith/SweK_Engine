// WebGLEngine/brain/rl/homeTrainEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HOMING LIFE, SCORED FOR A TRAINER (the trained-to-home round, registered in brain/FLY_TRAINED_HOME_WIP.md before this file existed). brain/rl/homeEnv.mjs's life, not edited (this
// extends it), with its return the life's homing score: every tick pays 0 but the last, which pays score(); info.dist is 1 less what has been paid, so brain/rl/dockPolicy.js's trainDockES
// keeps the best by it. The observation and the life are homeEnv's. Pure: no I/O, no clock, no Math.random.
"use strict";
import { HomeEnv } from "./homeEnv.mjs";

export class HomeTrainEnv extends HomeEnv {
    step(action) {
        const r = super.step(action), paid = r.done ? this.score() : 0;
        return { obs: r.obs, reward: paid, done: r.done, info: { docked: false, crashed: false, dist: 1 - paid } };
    }
}
