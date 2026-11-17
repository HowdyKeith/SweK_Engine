// WebGLEngine/brain/rl/habituatingCircuit.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A CIRCUIT WHOSE CONNECTIONS ONTO ITS READ CELLS HABITUATE (the escape round 9, registered in brain/FLY_ESCAPE_HABITUATE_WIP.md before this file existed). It wraps a
// brain/rl/maskedCircuitPolicy.mjs MaskedCircuitPolicy as it is. Every connection whose target is one of the cells the answer is read from (for the fly, the two Giant Fibers) has an EFFICACY g:
//   1 at the start of a life (the observation's number `clock` reads 0 -- brain/rl/lifeEnv.mjs's life clock);
//   the connection acts with its weight times g;
//   after each tick   g <- g - a g h + b (1 - g), held to 0..1, h the connection's source cell's activity that tick.
// So a connection driven often weakens, and recovers with time: habituation. a = A_SCALE max(0, p_a) and b = B_SCALE max(0, p_b), two more weights the trainer moves, FIRST in the list (so a wrapper
// that zeroes the last weights -- brain/rl/reflexStart.mjs -- zeroes the network's output layer and not these). They start at 0: then g stays 1 and the circuit is its network, TO THE BIT.
// Pure: no I/O, no clock, no Math.random.
"use strict";

export const A_SCALE = 0.5, B_SCALE = 0.01, CLOCK = 10;

export class HabituatingCircuit {
    constructor(inner, { clock = CLOCK } = {}) {
        if (!inner || !(inner.Wrec instanceof Float32Array) || !(inner.to instanceof Int32Array) || !(inner.from instanceof Int32Array) || !(inner.out instanceof Int32Array) || typeof inner.act !== "function") throw new Error("habituatingCircuit.HabituatingCircuit: the network is a MaskedCircuitPolicy");
        if (!Number.isInteger(clock) || clock < 0 || clock >= inner.inDim) throw new Error(`habituatingCircuit.HabituatingCircuit: the clock is an observation's index (got ${clock})`);
        const read = new Set(inner.out); this.inner = inner; this.clock = clock;
        this.plastic = Int32Array.from([...inner.to.keys()].filter((k) => read.has(inner.to[k])));
        this.g = new Float64Array(this.plastic.length).fill(1); this.pa = 0; this.pb = 0;
    }
    paramCount() { return 2 + this.inner.paramCount(); }
    getParams() { const p = new Float32Array(this.paramCount()); p[0] = this.pa; p[1] = this.pb; p.set(this.inner.getParams(), 2); return p; }
    setParams(flat) {
        if (!flat || flat.length !== this.paramCount()) throw new Error(`habituatingCircuit.HabituatingCircuit.setParams: ${this.paramCount()} weights (got ${flat ? flat.length : flat})`);
        this.pa = flat[0]; this.pb = flat[1]; this.inner.setParams(flat.subarray(2)); return this;
    }
    /** The two rates the first two weights give: { a, b }. */
    rates() { return { a: A_SCALE * Math.max(0, this.pa), b: B_SCALE * Math.max(0, this.pb) }; }
    act(obs) {
        if (obs[this.clock] === 0) this.g.fill(1);
        const W = this.inner.Wrec, P = this.plastic, g = this.g, save = new Float32Array(P.length);
        for (let i = 0; i < P.length; i++) { save[i] = W[P[i]]; W[P[i]] = save[i] * g[i]; }
        let out; try { out = this.inner.act(obs); } finally { for (let i = 0; i < P.length; i++) W[P[i]] = save[i]; }
        const { a, b } = this.rates(), h = this.inner._h, from = this.inner.from;
        for (let i = 0; i < P.length; i++) { const v = g[i] - a * g[i] * h[from[P[i]]] + b * (1 - g[i]); g[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
        return out;
    }
}
export default HabituatingCircuit;
