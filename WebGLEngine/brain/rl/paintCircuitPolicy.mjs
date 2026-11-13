// WebGLEngine/brain/rl/paintCircuitPolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A PAINTER WHOSE ONLY RECURRENT WEIGHTS ARE A CIRCUIT'S SYNAPSES. brain/rl/paintEnv.js is painted by brain/rl/dockPolicy.js's FlightPolicy, a plain tanh MLP; this is the network the tree flies its
// ships with (brain/pilot6dofPolicy.mjs: features -> a relu encoder -> the circuit's neurons -> three weight-tied steps of h <- relu((I + W) h), W having a weight only where the circuit has a synapse
// -> a linear decoder -> tanh), for the painting environment's 20 inputs and 5 outputs and for ANY circuit: the fruit fly's Giant Fiber Circuit (brain/gfcTopology.mjs: 34 neurons, 313 synapses), the
// Fish1 zebrafish core (brain/zebrafishTopology.mjs: 34, 153), a shuffle of either's wiring, or no wiring at all (a plain one-hidden-layer relu net: the control for "does the wiring matter").
// It has FlightPolicy's interface (paramCount / init / getParams / setParams / act), so dockPolicy.js's trainDockES trains it through its `policyFactory` option.
//
//   WEIGHTS    [ encoder: units x obsDim, unit-major ][ its bias: units ][ recurrent: one per edge, in the edge list's order ][ decoder: actDim x units ][ its bias: actDim ]
//   THE START  init(seed): the encoder uniform in +-sqrt(1/obsDim), the decoder in +-sqrt(1/units) (FlightPolicy's rule), drawn in that order from mulberry32(seed); every bias and EVERY RECURRENT
//              WEIGHT 0 -- with them at 0 the three steps are the identity (relu of what is already not negative), so a painter starts as a plain net and the search finds what the synapses are for.
//   ARMS       the round's arms (brain/PAINTING_FLY_WIP.md): FLY 1,202 weights, SHUF 1,202 (313 edges at places drawn for the seed), PLAIN 46 units and 1,201, FISH 1,042.
//
// WHAT THIS IS NOT, SAID PLAINLY: a model of the fly. The WIRING is real (which neuron reaches which); the strengths are whatever a search leaves, the units are rate units, and the Giant Fiber
// Circuit is an escape circuit that has never painted. A painter trained on PaintEnv copies a target picture; nothing here is expression. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as GFC from "../gfcTopology.mjs";
import * as FISH from "../zebrafishTopology.mjs";

export const REC_STEPS = 3;
export const PLAIN_UNITS = 46;
export const SHUFFLE_SEED = 7000;   // a SHUF draw's edges come from mulberry32(SHUFFLE_SEED + s)

export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** `count` distinct ordered pairs [to, from], to != from, among `units` units: the first `count` of a Fisher-Yates shuffle of every off-diagonal pair (row-major) by mulberry32(seed). */
export function shuffledEdges(units, count, seed) {
    const all = [];
    for (let to = 0; to < units; to++) for (let from = 0; from < units; from++) if (to !== from) all.push([to, from]);
    if (!Number.isInteger(count) || count < 0 || count > all.length) throw new Error(`paintCircuitPolicy.shuffledEdges: ${count} edges do not fit ${units} units (at most ${all.length})`);
    const r = mulberry32(seed >>> 0);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = all[i]; all[i] = all[j]; all[j] = t; }
    return all.slice(0, count);
}

const edgesOf = (T) => T.EDGES.map(([to, from]) => [to, from]);
/** The round's arms: name -> (s) -> { units, edges }. */
export const ARMS = Object.freeze({
    FLY: () => ({ units: GFC.NEURON_ORDER.length, edges: edgesOf(GFC) }),
    SHUF: (s) => ({ units: GFC.NEURON_ORDER.length, edges: shuffledEdges(GFC.NEURON_ORDER.length, GFC.EDGES.length, SHUFFLE_SEED + s) }),
    PLAIN: () => ({ units: PLAIN_UNITS, edges: [] }),
    FISH: () => ({ units: FISH.NEURON_ORDER.length, edges: edgesOf(FISH) }),
});
export const weightCountOf = (obsDim, actDim, units, nEdges) => obsDim * units + units + nEdges + units * actDim + actDim;

export class CircuitPolicy {
    constructor({ obsDim, actDim, units, edges, seed = 1234 } = {}) {
        if (![obsDim, actDim, units].every((n) => Number.isInteger(n) && n > 0)) throw new Error(`paintCircuitPolicy.CircuitPolicy: obsDim, actDim and units are whole numbers above 0 (got ${obsDim}, ${actDim}, ${units})`);
        if (!Array.isArray(edges)) throw new Error("paintCircuitPolicy.CircuitPolicy: edges is an array of [to, from]");
        const seen = new Set();
        for (const e of edges) {
            if (!Array.isArray(e) || e.length !== 2 || !e.every((i) => Number.isInteger(i) && i >= 0 && i < units)) throw new Error(`paintCircuitPolicy.CircuitPolicy: an edge is [to, from], each a unit 0..${units - 1} (got ${JSON.stringify(e)})`);
            if (e[0] === e[1]) throw new Error(`paintCircuitPolicy.CircuitPolicy: an edge from a unit to itself (${e[0]}): the diagonal is the identity's`);
            const key = e[0] * units + e[1]; if (seen.has(key)) throw new Error(`paintCircuitPolicy.CircuitPolicy: the edge ${JSON.stringify(e)} twice`); seen.add(key);
        }
        this.inDim = obsDim; this.outDim = actDim; this.units = units;
        this.to = Int32Array.from(edges, (e) => e[0]); this.from = Int32Array.from(edges, (e) => e[1]);
        this.W1 = new Float32Array(units * obsDim); this.b1 = new Float32Array(units); this.Wrec = new Float32Array(edges.length); this.W2 = new Float32Array(actDim * units); this.b2 = new Float32Array(actDim);
        this._paramCount = weightCountOf(obsDim, actDim, units, edges.length);
        this._h = new Float32Array(units); this._g = new Float32Array(units);
        this.init(seed);
    }
    paramCount() { return this._paramCount; }
    init(seed = 1234) {
        const r = mulberry32(seed), s1 = Math.sqrt(1 / this.inDim), s2 = Math.sqrt(1 / this.units);
        for (let i = 0; i < this.W1.length; i++) this.W1[i] = (r() * 2 - 1) * s1;
        for (let i = 0; i < this.W2.length; i++) this.W2[i] = (r() * 2 - 1) * s2;
        this.b1.fill(0); this.Wrec.fill(0); this.b2.fill(0);
        return this;
    }
    getParams() { const out = new Float32Array(this._paramCount); let o = 0; for (const a of [this.W1, this.b1, this.Wrec, this.W2, this.b2]) { out.set(a, o); o += a.length; } return out; }
    setParams(flat) {
        if (!flat || flat.length !== this._paramCount) throw new Error(`paintCircuitPolicy.CircuitPolicy.setParams: ${this._paramCount} weights (got ${flat ? flat.length : flat})`);
        let o = 0; for (const a of [this.W1, this.b1, this.Wrec, this.W2, this.b2]) { a.set(flat.subarray(o, o + a.length)); o += a.length; } return this;
    }
    /** The units' activity for an observation, after the encoder and the three steps: a Float32Array the policy OWNS (copy it to keep it). */
    activity(obs) {
        const { units, inDim, W1, b1, Wrec, to, from } = this; let h = this._h, g = this._g;
        for (let u = 0; u < units; u++) { let acc = b1[u]; const base = u * inDim; for (let i = 0; i < inDim; i++) acc += W1[base + i] * obs[i]; h[u] = acc > 0 ? acc : 0; }
        if (Wrec.length) for (let s = 0; s < REC_STEPS; s++) {
            g.set(h);
            for (let k = 0; k < Wrec.length; k++) g[to[k]] += Wrec[k] * h[from[k]];
            for (let u = 0; u < units; u++) if (!(g[u] > 0)) g[u] = 0;
            const t = h; h = g; g = t;
        }
        this._h = h; this._g = g;
        return h;
    }
    act(obs) {
        const h = this.activity(obs), { units, outDim, W2, b2 } = this, out = new Float32Array(outDim);
        for (let o = 0; o < outDim; o++) { let acc = b2[o]; const base = o * units; for (let u = 0; u < units; u++) acc += W2[base + u] * h[u]; out[o] = Math.tanh(acc); }
        return out;
    }
}

/** A trainDockES policyFactory for an arm and a draw: ({ obsDim, actDim, seed }) -> CircuitPolicy. The edges are made once. */
export function painterFactory(arm, s) {
    if (!Object.hasOwn(ARMS, arm)) throw new Error(`paintCircuitPolicy.painterFactory: no arm ${arm} (the arms are ${Object.keys(ARMS).join(", ")})`);
    const c = ARMS[arm](s);
    return ({ obsDim, actDim, seed } = {}) => new CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed: seed ?? 1234 });
}
