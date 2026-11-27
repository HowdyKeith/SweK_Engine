// WebGLEngine/brain/rl/classGainFly.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A COMPASS FLY WITH A GAIN FOR EACH RING CLASS (the scene-gains round, registered in brain/FLY_SCENE_GAINS_WIP.md before this file existed). brain/rl/compassFly.mjs's fly, not edited (this
// extends it), with each ring neuron's activity multiplied by its class's gain, held at 0 and above, before the fly reads it; a ring neuron's class is the scene-types round's (its type up to the
// first underscore: classesOf("class") of brain/rl/typedSceneEnv.mjs, 11 classes in sorted order). Its weights are [p_a, p_b, p_c, g_1 .. g_11]; the start is the compass fly's, with every g 1, and
// with every g 1 it is the compass fly to the bit.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { CompassFly } from "./compassFly.mjs";
import { NR } from "./compassEnv.mjs";
import { classesOf } from "./typedSceneEnv.mjs";

export const CLASSES = classesOf("class"), NG = CLASSES.keys.length;
export class ClassGainFly extends CompassFly {
    constructor(opts) { super(opts); this.g = new Float32Array(NG).fill(1); }
    paramCount() { return super.paramCount() + NG; }
    getParams() { const o = new Float32Array(this.paramCount()); o.set(super.getParams()); o.set(this.g, super.paramCount()); return o; }
    setParams(flat) {
        if (!flat || flat.length !== this.paramCount()) throw new Error(`classGainFly.ClassGainFly.setParams: ${this.paramCount()} weights (got ${flat ? flat.length : flat})`);
        const k = super.paramCount(); super.setParams(Float32Array.from(flat).slice(0, k)); this.g = Float32Array.from(flat).slice(k); return this;
    }
    /** Each class's gain as the fly uses it (held at 0 and above). */
    gains() { return Array.from(this.g, (x) => Math.max(0, x)); }
    act(o) { const q = Float64Array.from(o), g = this.gains(); for (let j = 0; j < NR; j++) q[j] = o[j] * g[CLASSES.cls[j]]; return super.act(q); }
}
export default ClassGainFly;
