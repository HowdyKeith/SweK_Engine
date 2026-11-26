// WebGLEngine/brain/rl/noisyCompassEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A NOISIER COMPASS (the compass-noise round, registered in brain/FLY_HOME_COMPASS_NOISE_WIP.md before this file existed). brain/rl/compassEnv.mjs's life and brain/rl/homeEnv.mjs's, unchanged
// and not edited (these extend them), with one difference: the heading the ring neurons see is the true heading plus sigma x a normal draw, a new draw for every observation, from a stream of
// the life's own (its seed XOR NOISE_SALT). The true heading, the gusts, the goals and the way home are the life's as before; at sigma 0 nothing is drawn and the life is the plain one.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { CompassEnv, stream, wrap } from "./compassEnv.mjs";
import { HomeEnv } from "./homeEnv.mjs";

export const NOISE_SALT = 0x5bd1e995;
const TAU = 2 * Math.PI, gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(TAU * r());
const noisy = (Base) => class extends Base {
    constructor(sigma = 0) { super(); if (!(Number.isFinite(sigma) && sigma >= 0)) throw new Error(`noisyCompassEnv: sigma is a number 0 or more (got ${sigma})`); this.sigma = sigma; }
    reset(seed) { this.noise = stream((seed ^ NOISE_SALT) >>> 0); return super.reset(seed); }
    _obs() { if (this.sigma === 0) return super._obs(); const th = this.th; this.th = wrap(th + gauss(this.noise) * this.sigma); try { return super._obs(); } finally { this.th = th; } }
};
/** The compass life with the seen heading jittered. */
export const NoisyCompassEnv = noisy(CompassEnv);
/** The homing life with the seen heading jittered. */
export const NoisyHomeEnv = noisy(HomeEnv);
