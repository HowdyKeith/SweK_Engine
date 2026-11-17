// WebGLEngine/brain/rl/coactReflex.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A FLY WHOSE ESCAPE RUNS THROUGH FIBRES WHOSE INPUTS WEAKEN WITH CO-ACTIVITY (the escape round 10, registered in brain/FLY_ESCAPE_COACT_WIP.md before this file existed). It wraps a
// brain/rl/maskedCircuitPolicy.mjs MaskedCircuitPolicy as it is, and its output layer (the last `tail` weights) starts at zero, as brain/rl/reflexStart.mjs's does. Every connection whose target is one
// of the cells the answer is read from (for the fly, the two Giant Fibers) has an EFFICACY g, 1 at the start of a life (the observation's number `clock` reads 0), and acts with its weight times g.
// Each tick:
//   m = the mean of the g's, taken BEFORE the tick's change;
//   the fly FIRES when the rule says flee (its answer above 0) and m is above THETA; the action is GAIN x (+1 if it fires, else -1) + the network's output;
//   then every such connection   g <- g - a g |h| [fired] + b (1 - g), held to 0..1, h its source cell's activity this tick.
// a = A_SCALE max(0, p_a), b = B_SCALE max(0, p_b): two weights the trainer moves, FIRST in the list; they start at 0, and then g stays 1, m is 1, and the fly is brain/rl/reflexStart.mjs's ReflexStart
// round the same network, TO THE BIT (the gate holds it). Round 9's rule (brain/rl/habituatingCircuit.mjs) weakened a connection by its source's activity alone, and its reflex did not go through it.
// Pure: no I/O, no clock, no Math.random.
"use strict";

export const A_SCALE = 0.5, B_SCALE = 0.01, CLOCK = 10, THETA = 0.5, GAIN = 0.5;

export class CoactReflex {
    constructor(inner, { rule, tail, clock = CLOCK, theta = THETA } = {}) {
        if (!inner || !(inner.Wrec instanceof Float32Array) || !(inner.to instanceof Int32Array) || !(inner.from instanceof Int32Array) || !(inner.out instanceof Int32Array) || typeof inner.act !== "function") throw new Error("coactReflex.CoactReflex: the network is a MaskedCircuitPolicy");
        if (typeof rule !== "function") throw new Error("coactReflex.CoactReflex: the rule is a function of the observation");
        if (!Number.isInteger(clock) || clock < 0 || clock >= inner.inDim) throw new Error(`coactReflex.CoactReflex: the clock is an observation's index (got ${clock})`);
        const p = inner.getParams();
        if (!Number.isInteger(tail) || tail < 1 || tail > p.length) throw new Error(`coactReflex.CoactReflex: the output layer is 1 to ${p.length} weights (got ${tail})`);
        p.fill(0, p.length - tail); inner.setParams(p);
        const read = new Set(inner.out); this.inner = inner; this.rule = rule; this.clock = clock; this.theta = theta;
        this.plastic = Int32Array.from([...inner.to.keys()].filter((k) => read.has(inner.to[k])));
        this.g = new Float64Array(this.plastic.length).fill(1); this.pa = 0; this.pb = 0; this.fired = false;
    }
    paramCount() { return 2 + this.inner.paramCount(); }
    getParams() { const p = new Float32Array(this.paramCount()); p[0] = this.pa; p[1] = this.pb; p.set(this.inner.getParams(), 2); return p; }
    setParams(flat) {
        if (!flat || flat.length !== this.paramCount()) throw new Error(`coactReflex.CoactReflex.setParams: ${this.paramCount()} weights (got ${flat ? flat.length : flat})`);
        this.pa = flat[0]; this.pb = flat[1]; this.inner.setParams(flat.subarray(2)); return this;
    }
    /** The two rates the first two weights give: { a, b }. */
    rates() { return { a: A_SCALE * Math.max(0, this.pa), b: B_SCALE * Math.max(0, this.pb) }; }
    /** The mean efficacy of the connections onto the read cells. */
    mean() { let m = 0; for (const v of this.g) m += v; return m / this.g.length; }
    act(obs) {
        if (obs[this.clock] === 0) this.g.fill(1);
        const m = this.mean(), W = this.inner.Wrec, P = this.plastic, g = this.g, save = new Float32Array(P.length);
        for (let i = 0; i < P.length; i++) { save[i] = W[P[i]]; W[P[i]] = save[i] * g[i]; }
        let net; try { net = this.inner.act(obs); } finally { for (let i = 0; i < P.length; i++) W[P[i]] = save[i]; }
        if (net.length !== 1) throw new Error(`coactReflex.CoactReflex: the network answers ${net.length} numbers, and the rule answers one`);
        const fired = this.rule(obs)[0] > 0 && m > this.theta; this.fired = fired;
        const { a, b } = this.rates(), h = this.inner._h, from = this.inner.from;
        for (let i = 0; i < P.length; i++) { const v = g[i] - (fired ? a * g[i] * Math.abs(h[from[P[i]]]) : 0) + b * (1 - g[i]); g[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
        return [GAIN * (fired ? 1 : -1) + net[0]];
    }
}
export default CoactReflex;
