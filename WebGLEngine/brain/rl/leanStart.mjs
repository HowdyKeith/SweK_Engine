// WebGLEngine/brain/rl/leanStart.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A BUILDER THAT STARTS AT THE LEAN (the voxel home's round 4, registered in brain/VOXEL_HOME_LEAN_WIP.md). The lean is the builder that needs no network: 1 for every column the observation says still
// needs a block, -1 for the rest (brain/rl/buildEnv.mjs draws the column from those). LeanStart wraps any policy so that
//   1  ITS ACTION IS THE LEAN PLUS THE NETWORK'S OUTPUT, column by column. The environment holds each number to [-1, 1] before it draws, so a column that needs a block can be given 0 to 1 and one that
//      needs none -1 to 0;
//   2  THE NETWORK'S OUTPUT LAYER STARTS AT ZERO: the last `tail` weights of its flat list (the circuit arms' decoder and its biases, the MLP's last layer and its biases -- both lists end with them),
//      so at the start the network adds nothing and the builder IS the lean. Every other weight is left as the policy was made.
// The wrapper has the trainer's interface (paramCount / getParams / setParams / act) and its weights are the network's own, in the network's order.
// Pure: no I/O, no clock, no Math.random.
"use strict";

/** The lean for an observation whose first `columns` numbers are what each column still needs. */
export function leanOf(obs, columns) { const out = new Float32Array(columns); for (let c = 0; c < columns; c++) out[c] = obs[c] > 0 ? 1 : -1; return out; }
/** How many weights an output layer has: actDim x the layer under it, and actDim biases. */
export const tailOf = (actDim, under) => actDim * under + actDim;

export class LeanStart {
    constructor(inner, { columns, tail } = {}) {
        if (!inner || typeof inner.act !== "function" || typeof inner.getParams !== "function" || typeof inner.setParams !== "function") throw new Error("leanStart.LeanStart: the inner policy has act, getParams and setParams");
        const p = inner.getParams();
        if (!Number.isInteger(columns) || columns < 1) throw new Error(`leanStart.LeanStart: columns is a whole number above 0 (got ${columns})`);
        if (!Number.isInteger(tail) || tail < 1 || tail > p.length) throw new Error(`leanStart.LeanStart: the output layer is 1 to ${p.length} weights (got ${tail})`);
        this.inner = inner; this.columns = columns; this.tail = tail;
        p.fill(0, p.length - tail); inner.setParams(p);
    }
    paramCount() { return this.inner.getParams().length; }
    getParams() { return this.inner.getParams(); }
    setParams(flat) { this.inner.setParams(flat); return this; }
    act(obs) {
        const net = this.inner.act(obs), out = leanOf(obs, this.columns);
        if (net.length !== this.columns) throw new Error(`leanStart.LeanStart: the network answers ${net.length} numbers for ${this.columns} columns`);
        for (let c = 0; c < this.columns; c++) out[c] += net[c];
        return out;
    }
}
export default LeanStart;
