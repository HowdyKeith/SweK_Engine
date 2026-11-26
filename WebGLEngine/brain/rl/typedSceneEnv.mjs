// WebGLEngine/brain/rl/typedSceneEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SCENE EACH RING CLASS SEES FOR ITSELF (the scene-types round, registered in brain/FLY_SCENE_TYPES_WIP.md before this file existed). brain/rl/compassEnv.mjs's life and brain/rl/homeEnv.mjs's,
// unchanged and not edited (these extend them), with one difference: each class of ring neuron sees two landmarks of its own. A ring neuron's class (MODES): "class" its type (RING_TYPES) up to
// the first underscore, 11 classes; "type" its full type, 26; "all" one class for all, the plain life. Each class's two are drawn as the plain life draws its two (an azimuth uniform, a strength
// from 0.5 to 1.5): the first class in sorted order sees the life's own two, the others theirs from a stream of the life's own (its seed XOR SCENE_SALT), so the gusts, goals and true heading
// are the life's. A ring neuron's activity is the plain life's formula over its class's two landmarks.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { CompassEnv, stream, wrap, NR, GOAL, CLOCK, KR, PREF } from "./compassEnv.mjs";
import { HomeEnv } from "./homeEnv.mjs";
import { RING_TYPES } from "../compassRingTopology.mjs";

export const SCENE_SALT = 0x165667b1, MODES = Object.freeze(["all", "class", "type"]);
const TAU = 2 * Math.PI;
/** { keys, cls }: the sorted class names of a mode, and each ring neuron's class index. */
export function classesOf(mode) {
    if (!MODES.includes(mode)) throw new Error(`typedSceneEnv: no scene ${mode} (the scenes are ${MODES.join(", ")})`);
    const keyOf = (t) => (mode === "all" ? "all" : mode === "type" ? t : t.split("_")[0]), keys = [...new Set(RING_TYPES.map(keyOf))].sort();
    return { keys: Object.freeze(keys), cls: Object.freeze(RING_TYPES.map((t) => keys.indexOf(keyOf(t)))) };
}
const typed = (Base) => class extends Base {
    constructor(mode = "class") { super(); const c = classesOf(mode); this.mode = mode; this.keys = c.keys; this.cls = c.cls; }
    reset(seed) {
        this.sets = null; super.reset(seed); if (this.mode === "all") return this._obs();
        const r = stream((seed ^ SCENE_SALT) >>> 0); this.sets = this.keys.map((_, g) => (g === 0 ? this.marks : [0, 1].map(() => ({ az: r() * TAU, s: 0.5 + r() })))); return this._obs();
    }
    _obs() {
        if (!this.sets) return super._obs();
        const o = new Float64Array(NR + 2); for (let j = 0; j < NR; j++) { let v = 0; for (const m of this.sets[this.cls[j]]) v += m.s * Math.exp(KR * (Math.cos(wrap(m.az - this.th) - PREF[j]) - 1)); o[j] = v; }
        o[GOAL] = this.goal; o[CLOCK] = this.t; return o;
    }
};
/** The compass life in a typed scene. */
export const TypedCompassEnv = typed(CompassEnv);
/** The homing life in a typed scene. */
export const TypedHomeEnv = typed(HomeEnv);
