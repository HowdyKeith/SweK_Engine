// WebGLEngine/brain/rl/odorEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// TWO ODOURS, ONE BAD (the mushroom body round, registered in brain/FLY_MUSHROOM_BODY_WIP.md before this file existed). A life is TRIALS trials. Two odours are drawn for the life, each a set
// of the NK Kenyon cells (each cell in an odour with probability P_ODOR, the two independently), and one of the two is bad, at random. Each trial one odour is presented, at random: each of its
// cells fires with probability P_ON and every other cell with P_BG. The fly approaches if its action is above 0: the good odour scores +1/(TRIALS/2), the bad one -1/(TRIALS/2), staying away 0.
// The task REV swaps the meanings from trial SWAP_AT + 1 on (the 16th of 30); the task ONE keeps them for the life.
// The observation: { t (the trial, 0 at a life's start), x (the firing cells, ascending), us (the last trial's outcome: -1 punished, +1 fed, 0 nothing) }.
// info.dist is 1 - the return so far (the trainer keeps the best by it); docked and crashed are always false. Pure: the life's randomness is its seed's own (mulberry32), no I/O, no clock.
"use strict";

export const TRIALS = 30, SWAP_AT = 15, P_ODOR = 0.05, P_ON = 0.8, P_BG = 0.01, TASKS = Object.freeze(["ONE", "REV"]);
/** mulberry32: a seed's own stream of numbers in [0, 1). */
export function stream(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export class OdorEnv {
    constructor({ task = "ONE", nk } = {}) {
        if (!TASKS.includes(task)) throw new Error(`odorEnv.OdorEnv: the task is ONE or REV (got ${task})`);
        if (!Number.isInteger(nk) || nk < 1) throw new Error(`odorEnv.OdorEnv: nk is the number of Kenyon cells (got ${nk})`);
        this.task = task; this.nk = nk; this.obsDim = 1; this.actDim = 1; this.maxSteps = TRIALS;
    }
    reset(seed) {
        const r = (this.r = stream(seed)), nk = this.nk;
        this.odors = [0, 1].map(() => { const s = new Uint8Array(nk); for (let k = 0; k < nk; k++) if (r() < P_ODOR) s[k] = 1; return s; });
        this.bad = r() < 0.5 ? 0 : 1; this.t = 0; this.ret = 0; this.us = 0;
        return this._present();
    }
    /** Whether the odour presented is bad on this trial. */
    isBad() { return this.task === "REV" && this.t >= SWAP_AT ? this.o !== this.bad : this.o === this.bad; }
    _present() { const r = this.r, od = (this.odors[(this.o = r() < 0.5 ? 0 : 1)]), x = []; for (let k = 0; k < this.nk; k++) if (od[k] ? r() < P_ON : r() < P_BG) x.push(k); return { t: this.t, x, us: this.us }; }
    step(action) {
        const bad = this.isBad(), go = action[0] > 0, reward = go ? (bad ? -1 : 1) / (TRIALS / 2) : 0;
        this.us = go ? (bad ? -1 : 1) : 0; this.ret += reward; this.t++;
        const done = this.t >= TRIALS;
        return { obs: done ? { t: this.t, x: [], us: this.us } : this._present(), reward, done, info: { docked: false, crashed: false, dist: 1 - this.ret } };
    }
}
