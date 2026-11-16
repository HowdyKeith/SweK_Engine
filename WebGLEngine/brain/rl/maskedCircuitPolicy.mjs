// WebGLEngine/brain/rl/maskedCircuitPolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A CIRCUIT POLICY WHOSE INPUTS GO TO NAMED CELLS AND WHOSE OUTPUT IS READ FROM NAMED CELLS (the escape round 5, registered in brain/FLY_ESCAPE_VISION_WIP.md). brain/rl/paintCircuitPolicy.mjs's
// CircuitPolicy gives every observation to every unit and reads every unit; so its circuit's wiring was only ever a pattern among units that all saw everything and were all read. Here
//   inputs    [unit, obsIndex] pairs: THAT unit is given THAT number, by a weight of its own, and no unit is given anything not listed
//   edges     [to, from] pairs among the units, a weight each, as in CircuitPolicy; 0 at the start unless `edgeStart` gives each its starting weight
//   outputs   the units the answer is read from, a weight each; no other unit is read
// so the only road from what the fly sees to what it does is the wiring. One output number (the escape task's): tanh of the read-out.
// A unit: rectified (its bias + its listed inputs), then REC_STEPS steps h <- relu(h + W h) along the connections, as CircuitPolicy.
// Weights, in order: [inputs][a bias a unit][edges][outputs][the output's bias]. Start: each input weight uniform in +-sqrt(1 / that unit's count of inputs), each output weight uniform in
// +-sqrt(1 / outputs.length), from mulberry32(seed); biases 0; connections 0 or `edgeStart`.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { mulberry32, REC_STEPS } from "./paintCircuitPolicy.mjs";

/** How many weights such a policy has. */
export const maskedWeightCount = (units, inputs, edges, outputs) => inputs + units + edges + outputs + 1;

export class MaskedCircuitPolicy {
    constructor({ obsDim, units, inputs, edges, outputs, edgeStart = null, seed = 1234 } = {}) {
        if (![obsDim, units].every((n) => Number.isInteger(n) && n > 0)) throw new Error(`maskedCircuitPolicy.MaskedCircuitPolicy: obsDim and units are whole numbers above 0 (got ${obsDim}, ${units})`);
        const pairs = (list, name, hi) => { if (!Array.isArray(list) || !list.every((e) => Array.isArray(e) && e.length === 2 && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < units && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < hi)) throw new Error(`maskedCircuitPolicy.MaskedCircuitPolicy: ${name}`); const seen = new Set(); for (const e of list) { const k = e[0] * 100000 + e[1]; if (seen.has(k)) throw new Error(`maskedCircuitPolicy.MaskedCircuitPolicy: ${JSON.stringify(e)} twice in ${name.split(" ")[0]}`); seen.add(k); } };
        pairs(inputs, `inputs is a list of [unit 0..${units - 1}, observation 0..${obsDim - 1}]`, obsDim); pairs(edges, `edges is a list of [to, from], each a unit 0..${units - 1}`, units);
        if (edges.some((e) => e[0] === e[1])) throw new Error("maskedCircuitPolicy.MaskedCircuitPolicy: an edge from a unit to itself");
        if (!Array.isArray(outputs) || outputs.length < 1 || !outputs.every((u) => Number.isInteger(u) && u >= 0 && u < units) || new Set(outputs).size !== outputs.length) throw new Error(`maskedCircuitPolicy.MaskedCircuitPolicy: outputs is a list of distinct units 0..${units - 1}, at least one`);
        this.inDim = obsDim; this.outDim = 1; this.units = units;
        this.inUnit = Int32Array.from(inputs, (e) => e[0]); this.inObs = Int32Array.from(inputs, (e) => e[1]); this.to = Int32Array.from(edges, (e) => e[0]); this.from = Int32Array.from(edges, (e) => e[1]); this.out = Int32Array.from(outputs);
        this.Win = new Float32Array(inputs.length); this.b1 = new Float32Array(units); this.Wrec = new Float32Array(edges.length); this.Wout = new Float32Array(outputs.length); this.b2 = new Float32Array(1);
        this._paramCount = maskedWeightCount(units, inputs.length, edges.length, outputs.length); this._h = new Float32Array(units); this._g = new Float32Array(units);
        const r = mulberry32(seed), fan = new Int32Array(units); for (const u of this.inUnit) fan[u]++;
        for (let k = 0; k < this.Win.length; k++) this.Win[k] = (r() * 2 - 1) * Math.sqrt(1 / fan[this.inUnit[k]]);
        if (edgeStart !== null) { if (!Array.isArray(edgeStart) || edgeStart.length !== edges.length || !edgeStart.every(Number.isFinite)) throw new Error(`maskedCircuitPolicy.MaskedCircuitPolicy: edgeStart is a finite number an edge, ${edges.length} of them`); this.Wrec.set(edgeStart); }
        const s2 = Math.sqrt(1 / outputs.length); for (let k = 0; k < this.Wout.length; k++) this.Wout[k] = (r() * 2 - 1) * s2;
    }
    paramCount() { return this._paramCount; }
    getParams() { const out = new Float32Array(this._paramCount); let o = 0; for (const a of [this.Win, this.b1, this.Wrec, this.Wout, this.b2]) { out.set(a, o); o += a.length; } return out; }
    setParams(flat) {
        if (!flat || flat.length !== this._paramCount) throw new Error(`maskedCircuitPolicy.MaskedCircuitPolicy.setParams: ${this._paramCount} weights (got ${flat ? flat.length : flat})`);
        let o = 0; for (const a of [this.Win, this.b1, this.Wrec, this.Wout, this.b2]) { a.set(flat.subarray(o, o + a.length)); o += a.length; } return this;
    }
    /** The units' activity for an observation: a Float32Array the policy OWNS (copy it to keep it). */
    activity(obs) {
        const { units, Win, inUnit, inObs, b1, Wrec, to, from } = this; let h = this._h, g = this._g;
        h.set(b1); for (let k = 0; k < Win.length; k++) h[inUnit[k]] += Win[k] * obs[inObs[k]];
        for (let u = 0; u < units; u++) if (!(h[u] > 0)) h[u] = 0;
        if (Wrec.length) for (let s = 0; s < REC_STEPS; s++) {
            g.set(h);
            for (let k = 0; k < Wrec.length; k++) g[to[k]] += Wrec[k] * h[from[k]];
            for (let u = 0; u < units; u++) if (!(g[u] > 0)) g[u] = 0;
            const t = h; h = g; g = t;
        }
        this._h = h; this._g = g;
        return h;
    }
    act(obs) { const h = this.activity(obs); let acc = this.b2[0]; for (let k = 0; k < this.out.length; k++) acc += this.Wout[k] * h[this.out[k]]; return Float32Array.of(Math.tanh(acc)); }
}
export default MaskedCircuitPolicy;
