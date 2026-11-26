// WebGLEngine/brain/rl/typedHomeTrainEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE TYPED SCENE'S HOMING LIFE, SCORED FOR A TRAINER (the scene-trained round, registered in brain/FLY_SCENE_TRAINED_WIP.md before this file existed). brain/rl/typedSceneEnv.mjs's homing
// life, not edited (this extends it), scored as brain/rl/homeTrainEnv.mjs scores the plain one: every tick pays 0 but the last, which pays score(); info.dist is 1 less what has been paid, so
// brain/rl/dockPolicy.js's trainDockES keeps the best by it. The observation and the life are the typed scene's. Pure: no I/O, no clock, no Math.random.
"use strict";
import { TypedHomeEnv } from "./typedSceneEnv.mjs";

export class TypedHomeTrainEnv extends TypedHomeEnv {
    step(action) {
        const r = super.step(action), paid = r.done ? this.score() : 0;
        return { obs: r.obs, reward: paid, done: r.done, info: { docked: false, crashed: false, dist: 1 - paid } };
    }
}
