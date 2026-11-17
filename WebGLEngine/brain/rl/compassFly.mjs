// WebGLEngine/brain/rl/compassFly.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A FLY WHOSE RING-TO-COMPASS CONNECTIONS TIE THE SCENE TO ITS HEADING (the compass round, registered in brain/FLY_COMPASS_LEARNS_WIP.md before this file existed). The ring neurons onto the 46
// core compass neurons (brain/compassRingTopology.mjs), the given connections, each at its synapses over the mean synapses of those connections (w0). A compass neuron's angle is its glomerulus's:
// R n at (n - 1) x 45 degrees, L n at (n - 1) x 45 + 22.5. The fly keeps an angle phi, its heading as it believes it, 0 at a life's start (the observation's clock reads 0, and every w is w0 again).
// Each tick:
//   v_k = -(sum over ring neurons of w x activity); phi moves to the angle of e^(i phi) + c sum_k (v_k - mean v) e^(i angle_k)
//   every connection   w <- w - a w r_j B_k + b (w0 - w), held at 0 and above, B_k = exp(3 (cos(angle_k - phi) - 1)), the bump at compass neuron k
//   it steers u = -STEER sin(phi - goal), held to MAX_TURN either way, and phi moves by u too (it knows its own turns)
// a = A_SCALE max(0, p_a), b = B_SCALE max(0, p_b), c = C_SCALE max(0, p_c): a PLASTIC fly's weights are [p_a, p_b, p_c], a frozen one's [p_c] (a and b 0). The start is p_c 1, the others 0.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { EPG_INSTANCES, EDGES, SYNAPSES } from "../compassRingTopology.mjs";
import { NR, GOAL, CLOCK, MAX_TURN, wrap } from "./compassEnv.mjs";

export const A_SCALE = 0.01, B_SCALE = 0.01, C_SCALE = 1e-5, STEER = 0.5, BUMP = 3, NE = EPG_INSTANCES.length;
export const ANGLE = Object.freeze(EPG_INSTANCES.map((s) => { const m = /_([LR])([1-8])$/.exec(s); if (!m) throw new Error(`compassFly: ${s} names no glomerulus`); return (Number(m[2]) - 1) * Math.PI / 4 + (m[1] === "L" ? Math.PI / 8 : 0); }));
/** The real connections: [ring, compass, synapses]. */
export const REAL = Object.freeze(EDGES.map((e, n) => Object.freeze([e[0], e[1], SYNAPSES[n]])));

export class CompassFly {
    constructor({ edges = REAL, plastic = true } = {}) {
        if (!Array.isArray(edges) || !edges.length) throw new Error("compassFly.CompassFly: the connections are [ring, compass, synapses] triples");
        const mean = edges.reduce((s, e) => s + e[2], 0) / edges.length;
        this.w0 = new Float64Array(NE * NR);
        for (const [j, k, n] of edges) { if (!(Number.isInteger(j) && j >= 0 && j < NR && Number.isInteger(k) && k >= 0 && k < NE && n > 0)) throw new Error(`compassFly.CompassFly: no connection [${j}, ${k}, ${n}]`); this.w0[k * NR + j] = n / mean; }
        this.w = Float64Array.from(this.w0); this.plastic = plastic; this.p = plastic ? Float32Array.from([0, 0, 1]) : Float32Array.from([1]); this.phi = 0; this._v = new Float64Array(NE);
    }
    paramCount() { return this.p.length; }
    getParams() { return Float32Array.from(this.p); }
    setParams(flat) { if (!flat || flat.length !== this.p.length) throw new Error(`compassFly.CompassFly.setParams: ${this.p.length} weights (got ${flat ? flat.length : flat})`); this.p = Float32Array.from(flat); return this; }
    /** The three numbers the weights give: { a, b, c }. */
    rates() { const [pa, pb, pc] = this.plastic ? this.p : [0, 0, this.p[0]]; return { a: A_SCALE * Math.max(0, pa), b: B_SCALE * Math.max(0, pb), c: C_SCALE * Math.max(0, pc) }; }
    act(o) {
        if (o[CLOCK] === 0) { this.w.set(this.w0); this.phi = 0; }
        const { a, b, c } = this.rates(), w = this.w, w0 = this.w0, v = this._v;
        let vm = 0; for (let k = 0; k < NE; k++) { let s = 0; const q = k * NR; for (let j = 0; j < NR; j++) s -= w[q + j] * o[j]; v[k] = s; vm += s / NE; }
        let cx = Math.cos(this.phi), cy = Math.sin(this.phi); for (let k = 0; k < NE; k++) { cx += c * (v[k] - vm) * Math.cos(ANGLE[k]); cy += c * (v[k] - vm) * Math.sin(ANGLE[k]); }
        this.phi = Math.atan2(cy, cx);
        if (a > 0 || b > 0) for (let k = 0; k < NE; k++) { const bk = Math.exp(BUMP * (Math.cos(ANGLE[k] - this.phi) - 1)), q = k * NR; for (let j = 0; j < NR; j++) { if (w0[q + j] === 0) continue; const x = w[q + j], y = x - a * x * o[j] * bk + b * (w0[q + j] - x); w[q + j] = y < 0 ? 0 : y; } }
        const u = Math.max(-MAX_TURN, Math.min(MAX_TURN, -STEER * Math.sin(this.phi - o[GOAL]))); this.phi = wrap(this.phi + u);
        return [u];
    }
}
export default CompassFly;
