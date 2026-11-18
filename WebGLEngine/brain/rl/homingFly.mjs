// WebGLEngine/brain/rl/homingFly.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A COMPASS FLY THAT KEEPS A HOME VECTOR (the homing round, registered in brain/FLY_FINDS_HOME_WIP.md before this file existed). It wraps any fly with act(observation) and phi (its
// believed heading), such as brain/rl/compassFly.mjs's, and changes nothing about it. Its home vector is the sum of (cos phi, sin phi) over every tick, after each tick's turn, from 0
// at a life's start (the observation's clock reads 0). Until HOME_AT the inner fly sees the life's goal; from HOME_AT its goal is the direction home in its own frame, the angle of
// minus its home vector. Pure: no I/O, no clock, no Math.random.
"use strict";
import { GOAL, CLOCK } from "./compassEnv.mjs";
import { HOME_AT } from "./homeEnv.mjs";

export class HomingFly {
    constructor(inner) {
        if (!inner || typeof inner.act !== "function") throw new Error("homingFly.HomingFly: it wraps a fly with act()");
        this.inner = inner; this.hx = 0; this.hy = 0;
    }
    get phi() { return this.inner.phi; }
    set phi(v) { this.inner.phi = v; }
    act(o) {
        if (o[CLOCK] === 0) { this.hx = 0; this.hy = 0; }
        let seen = o;
        if (o[CLOCK] >= HOME_AT) { seen = Float64Array.from(o); seen[GOAL] = Math.atan2(-this.hy, -this.hx); }
        const a = this.inner.act(seen);
        this.hx += Math.cos(this.inner.phi); this.hy += Math.sin(this.inner.phi);
        return a;
    }
}
