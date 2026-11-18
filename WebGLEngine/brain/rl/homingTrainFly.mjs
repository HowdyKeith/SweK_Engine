// WebGLEngine/brain/rl/homingTrainFly.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A HOMING FLY A TRAINER CAN TRAIN (the trained-to-home round, registered in brain/FLY_TRAINED_HOME_WIP.md before this file existed). brain/rl/homingFly.mjs's wrapper, not edited (this
// extends it), handing the trainer the inner compass fly's weights: paramCount, getParams, setParams and rates are the inner fly's. Nothing about how it flies changes.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { HomingFly } from "./homingFly.mjs";

export class HomingTrainFly extends HomingFly {
    paramCount() { return this.inner.paramCount(); }
    getParams() { return this.inner.getParams(); }
    setParams(flat) { this.inner.setParams(flat); return this; }
    rates() { return this.inner.rates(); }
}
