// WebGLEngine/brain/rl/manyPnOdorEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// EIGHT ODOURS THROUGH THE PROJECTION NEURONS, HALF OF THEM BAD (the mushroom many-odour round, registered in brain/FLY_MUSHROOM_MANY_WIP.md before this file existed). brain/rl/pnOdorEnv.mjs's
// odours, not edited (this file extends its class and keeps its Kenyon-cell rule), N at a time: each odour drawn as pnOdorEnv draws odour A (each glomerulus active with probability P_GLOM at a
// strength from 0.5 to 1), each independently; half of them, at random, bad. Each trial one of the N at random, with pnOdorEnv's noise, through its kcsOf. PER_ODOUR trials an odour, so
// PER_ODOUR x N trials a life: +1/(trials/2) for approaching a good odour, -1/(trials/2) a bad one, 0 staying away, the outcome told at the next trial; the meanings fixed for the life.
// Pure: the life's randomness is its seed's own (odorEnv's mulberry32 stream), no I/O, no clock.
"use strict";
import { stream } from "./odorEnv.mjs";
import { PnOdorEnv, P_GLOM, NOISE } from "./pnOdorEnv.mjs";

export const N_ODOURS = 8, PER_ODOUR = 15;
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

export class ManyPnOdorEnv extends PnOdorEnv {
    constructor({ nk, ng, pnGlom, wiring, n = N_ODOURS } = {}) {
        super({ task: "ONE", nk, ng, pnGlom, wiring });
        if (!Number.isInteger(n) || n < 2 || n % 2 !== 0) throw new Error(`manyPnOdorEnv.ManyPnOdorEnv: n is an even number of odours, 2 or more (got ${n})`);
        this.n = n; this.trials = PER_ODOUR * n; this.maxSteps = this.trials;
    }
    reset(seed) {
        const r = (this.r = stream(seed)), draw = () => (r() < P_GLOM ? 0.5 + 0.5 * r() : 0);
        this.odors = Array.from({ length: this.n }, () => Array.from({ length: this.ng }, draw));
        const q = [...Array(this.n).keys()]; for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
        this.badSet = new Set(q.slice(0, this.n / 2)); this.t = 0; this.ret = 0; this.us = 0;
        return this._present();
    }
    _present() { const r = this.r, o = (this.o = Math.floor(r() * this.n)), g = this.odors[o].map((x) => (x > 0 ? Math.max(0, x * (1 + NOISE * gauss(r))) : 0)); return { t: this.t, x: this.kcsOf(g), us: this.us }; }
    /** Whether the odour presented is bad. */
    isBad() { return this.badSet.has(this.o); }
    step(action) {
        const bad = this.isBad(), go = action[0] > 0, reward = go ? (bad ? -1 : 1) / (this.trials / 2) : 0;
        this.us = go ? (bad ? -1 : 1) : 0; this.ret += reward; this.t++;
        const done = this.t >= this.trials;
        return { obs: done ? { t: this.t, x: [], us: this.us } : this._present(), reward, done, info: { docked: false, crashed: false, dist: 1 - this.ret } };
    }
}
