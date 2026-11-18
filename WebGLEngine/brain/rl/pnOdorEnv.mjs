// WebGLEngine/brain/rl/pnOdorEnv.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// TWO ODOURS THROUGH THE PROJECTION NEURONS, ONE BAD (the mushroom odour round, registered in brain/FLY_MUSHROOM_ODOURS_WIP.md before this file existed). brain/rl/odorEnv.mjs's task, with
// the odours made the way the fly makes them: an odour is a pattern over the NG glomeruli; the projection neurons of a glomerulus fire at its strength; each Kenyon cell sums its projection
// neurons' input (strength x synapses) and the SPARSE fraction of Kenyon cells with the most input fire (the APL neuron's global inhibition, as a rule). It is given its wiring: the
// projection-neuron-to-Kenyon-cell connections [pn, kc, n] and each projection neuron's glomerulus (-1 for a multiglomerular one, which never fires here).
// A life: odour A, each glomerulus active with probability P_GLOM at a strength from 0.5 to 1; odour B, A with each glomerulus drawn again with probability CHANGE; one of the two bad. Each
// trial one odour at random, each active glomerulus's strength times (1 + NOISE x a normal draw), held at 0 and above. The rest is odorEnv's: TRIALS trials, +1/15 for approaching the
// good odour, -1/15 the bad, 0 staying away; the outcome told at the next trial; REV swaps the meanings from trial SWAP_AT + 1.
// Pure: the life's randomness is its seed's own (odorEnv's mulberry32 stream), no I/O, no clock.
"use strict";
import { stream, TRIALS, SWAP_AT, TASKS } from "./odorEnv.mjs";

export const P_GLOM = 0.3, CHANGE = 0.5, NOISE = 0.2, SPARSE = 0.05;
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

export class PnOdorEnv {
    constructor({ task = "ONE", nk, ng, pnGlom, wiring } = {}) {
        if (!TASKS.includes(task)) throw new Error(`pnOdorEnv.PnOdorEnv: the task is ONE or REV (got ${task})`);
        if (!Number.isInteger(nk) || nk < 1 || !Number.isInteger(ng) || ng < 1) throw new Error("pnOdorEnv.PnOdorEnv: nk and ng are the numbers of Kenyon cells and glomeruli");
        if (!Array.isArray(pnGlom) || !pnGlom.every((g) => Number.isInteger(g) && g >= -1 && g < ng)) throw new Error("pnOdorEnv.PnOdorEnv: pnGlom gives each projection neuron's glomerulus, or -1");
        if (!Array.isArray(wiring) || !wiring.every((e) => Number.isInteger(e[0]) && e[0] >= 0 && e[0] < pnGlom.length && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < nk && e[2] > 0)) throw new Error("pnOdorEnv.PnOdorEnv: wiring is [pn, kc, n] with n above 0");
        this.task = task; this.nk = nk; this.ng = ng; this.pnGlom = pnGlom.slice(); this.obsDim = 1; this.actDim = 1; this.maxSteps = TRIALS; this.k = Math.round(SPARSE * nk);
        this.byPn = Array.from({ length: pnGlom.length }, () => []); for (const [p, k, n] of wiring) this.byPn[p].push([k, n]);
        this.input = new Float64Array(nk);
    }
    reset(seed) {
        const r = (this.r = stream(seed)), draw = () => (r() < P_GLOM ? 0.5 + 0.5 * r() : 0);
        const A = Array.from({ length: this.ng }, draw), B = A.map((g) => (r() < CHANGE ? draw() : g));
        this.odors = [A, B]; this.bad = r() < 0.5 ? 0 : 1; this.t = 0; this.ret = 0; this.us = 0;
        return this._present();
    }
    /** The Kenyon cells an odour pattern (glomerular strengths) makes fire: the k with the most input, of those with any, ascending. */
    kcsOf(g) {
        const inp = this.input; inp.fill(0);
        for (let p = 0; p < this.byPn.length; p++) { const gi = this.pnGlom[p]; if (gi < 0 || !(g[gi] > 0)) continue; const a = g[gi]; for (const [k, n] of this.byPn[p]) inp[k] += a * n; }
        const idx = []; for (let k = 0; k < this.nk; k++) if (inp[k] > 0) idx.push(k);
        idx.sort((a, b) => inp[b] - inp[a] || a - b);
        return idx.slice(0, this.k).sort((a, b) => a - b);
    }
    _present() { const r = this.r, o = (this.o = r() < 0.5 ? 0 : 1), g = this.odors[o].map((x) => (x > 0 ? Math.max(0, x * (1 + NOISE * gauss(r))) : 0)); return { t: this.t, x: this.kcsOf(g), us: this.us }; }
    isBad() { return this.task === "REV" && this.t >= SWAP_AT ? this.o !== this.bad : this.o === this.bad; }
    step(action) {
        const bad = this.isBad(), go = action[0] > 0, reward = go ? (bad ? -1 : 1) / (TRIALS / 2) : 0;
        this.us = go ? (bad ? -1 : 1) : 0; this.ret += reward; this.t++;
        const done = this.t >= TRIALS;
        return { obs: done ? { t: this.t, x: [], us: this.us } : this._present(), reward, done, info: { docked: false, crashed: false, dist: 1 - this.ret } };
    }
}
