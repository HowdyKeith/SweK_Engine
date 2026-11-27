// WebGLEngine/brain/rl/mixedHomeTrainEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HOMING LIFE OF BOTH SCENES, FOR A TRAINER (the scene-mixed round, registered in brain/FLY_SCENE_MIXED_WIP.md before this file existed). It holds one of brain/rl/typedHomeTrainEnv.mjs's
// training lives in each scene, not edited, and on each reset hands the life to one of them by its seed: sceneOf(seed) is the 26-type scene ("type") for an odd seed and the plain ("all") for an
// even one. A life is then that scene's training life to the bit.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { TypedHomeTrainEnv } from "./typedHomeTrainEnv.mjs";

/** The scene a life's seed gives it. */
export const sceneOf = (seed) => (seed % 2 ? "type" : "all");
export class MixedHomeTrainEnv {
    constructor() { this.envs = Object.freeze({ type: new TypedHomeTrainEnv("type"), all: new TypedHomeTrainEnv("all") }); this.cur = this.envs.all; this.scene = "all"; }
    get maxSteps() { return this.cur.maxSteps; }
    reset(seed) { this.scene = sceneOf(seed); this.cur = this.envs[this.scene]; return this.cur.reset(seed); }
    step(action) { return this.cur.step(action); }
    score() { return this.cur.score(); }
}
