// WebGLEngine/brain/rl/carryCircuit.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A CIRCUIT POLICY THAT REMEMBERS FROM ONE TICK TO THE NEXT (the escape round 4, registered in brain/FLY_ESCAPE_MEMORY_WIP.md). brain/rl/paintCircuitPolicy.mjs's CircuitPolicy starts from nothing at
// every observation: the encoder, three steps along the circuit's connections, the decoder. This one is that policy with ONE thing added: each unit's input at a tick is what the encoder gives it
// PLUS CARRY x ITS OWN ACTIVITY AT THE END OF THE TICK BEFORE (that activity held to at most CAP, so nothing can run away). The three steps then spread what was carried along the connections, so in
// an arm with connections memory moves from cell to cell, and in one without each unit keeps only its own past.
//
// No weight is added: CARRY is fixed, the weight count and the order of the weights are CircuitPolicy's. A NEW EPISODE STARTS WITH NOTHING CARRIED: the policy is told which of its inputs is the
// episode's clock (`clock`, an index), and a tick whose clock reads 0 is the first.
// Not pure in one respect, by design: it holds the last tick's activity between calls of act().
"use strict";
import { CircuitPolicy, REC_STEPS } from "./paintCircuitPolicy.mjs";

export const CARRY = 0.5, CAP = 8;

export class CarryCircuitPolicy extends CircuitPolicy {
    constructor(opts = {}) {
        super(opts);
        if (!Number.isInteger(opts.clock) || opts.clock < 0 || opts.clock >= this.inDim) throw new Error(`carryCircuit.CarryCircuitPolicy: clock is the index of the input that is the episode's clock, 0 to ${this.inDim - 1} (got ${opts.clock})`);
        this.clock = opts.clock; this._carry = new Float32Array(this.units);
    }
    /** What is carried into the next tick: a copy. */
    carried() { return Float32Array.from(this._carry); }
    activity(obs) {
        const { units, inDim, W1, b1, Wrec, to, from } = this, c = this._carry; let h = this._h, g = this._g;
        if (obs[this.clock] === 0) c.fill(0);   // the first tick of an episode
        for (let u = 0; u < units; u++) { let acc = b1[u] + CARRY * c[u]; const base = u * inDim; for (let i = 0; i < inDim; i++) acc += W1[base + i] * obs[i]; h[u] = acc > 0 ? acc : 0; }
        if (Wrec.length) for (let s = 0; s < REC_STEPS; s++) {
            g.set(h);
            for (let k = 0; k < Wrec.length; k++) g[to[k]] += Wrec[k] * h[from[k]];
            for (let u = 0; u < units; u++) if (!(g[u] > 0)) g[u] = 0;
            const t = h; h = g; g = t;
        }
        this._h = h; this._g = g;
        for (let u = 0; u < units; u++) c[u] = h[u] < CAP ? h[u] : CAP;
        return h;
    }
}
export default CarryCircuitPolicy;
