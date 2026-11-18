// WebGLEngine/brain/rl/mushroomFly.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A FLY WHOSE KENYON-CELL-TO-OUTPUT CONNECTIONS ARE TAUGHT BY DOPAMINE (the mushroom body round, registered in brain/FLY_MUSHROOM_BODY_WIP.md before this file existed). It is given its circuit:
// the Kenyon-cell-to-output connections [k, m, n] (n synapses) and each output neuron's teachers [T_punish, T_feed] (its shares of dopamine synapses from PPL1 and from PAM). w starts at n at each
// life's start (the observation's t reads 0). Each trial:
//   the teaching first: if the last trial was an approach with an outcome, every cell that fired then has its connection onto neuron m multiplied by 1 - min(1, a T_m)
//   response_m = sum over firing cells of w_km, over BASE_m (its summed synapses x (P_ODOR P_ON + (1 - P_ODOR) P_BG): what an untrained fly expects from a random presentation)
//   drive = bias + sum_m v_m (response_m - 1); the action is [drive] (the env approaches above 0)
// a = A_SCALE max(0, p_a). A plastic fly's weights are [v_1..v_NM, bias, p_a], a frozen one's [v_1..v_NM, bias] (a 0). The start is v 0, bias START_BIAS, p_a 1.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { P_ODOR, P_ON, P_BG } from "./odorEnv.mjs";

export const A_SCALE = 0.5, START_BIAS = 0.05, EXPECT = P_ODOR * P_ON + (1 - P_ODOR) * P_BG;

// The connections sorted by cell, made once for each edges array given (the trainer asks for a fly about a thousand times a training). Shared and never written.
const CSR = new WeakMap();
function csrOf(edges, nk, nm) {
    const key = CSR.get(edges); if (key && key.nk === nk && key.nm === nm) return key;
    const order = edges.map((e, i) => i).sort((i, j) => edges[i][0] - edges[j][0] || edges[i][1] - edges[j][1]);
    const start = new Int32Array(nk + 1), to = new Int32Array(edges.length), w0 = new Float64Array(edges.length), base = new Float64Array(nm);
    order.forEach((i, e) => { to[e] = edges[i][1]; w0[e] = edges[i][2]; start[edges[i][0] + 1]++; });
    for (let k = 0; k < nk; k++) start[k + 1] += start[k];
    for (let e = 0; e < w0.length; e++) base[to[e]] += w0[e] * EXPECT;
    const c = { nk, nm, start, to, w0, base }; CSR.set(edges, c); return c;
}

export class MushroomFly {
    constructor({ nk, nm, edges, teach, plastic = true } = {}) {
        if (!Number.isInteger(nk) || !Number.isInteger(nm) || nk < 1 || nm < 1) throw new Error("mushroomFly.MushroomFly: nk and nm are the numbers of Kenyon cells and output neurons");
        if (!Array.isArray(edges) || !edges.length || !edges.every((e) => Number.isInteger(e[0]) && e[0] >= 0 && e[0] < nk && Number.isInteger(e[1]) && e[1] >= 0 && e[1] < nm && e[2] > 0)) throw new Error("mushroomFly.MushroomFly: edges are [k, m, n] with n above 0");
        if (!Array.isArray(teach) || teach.length !== nm || !teach.every((t) => t.length === 2 && t.every((x) => x >= 0 && x <= 1))) throw new Error(`mushroomFly.MushroomFly: teach is ${nm} pairs of shares`);
        this.nk = nk; this.nm = nm; this.plastic = plastic; this.teach = teach.map((t) => [t[0], t[1]]);
        const c = csrOf(edges, nk, nm); this.start = c.start; this.to = c.to; this.w0 = c.w0; this.base = c.base;
        this.p = new Float32Array(nm + (plastic ? 2 : 1)); this.p[nm] = START_BIAS; if (plastic) this.p[nm + 1] = 1;
        this.w = Float64Array.from(this.w0); this.last = null; this._s = new Float64Array(nm); this._f = new Float64Array(nm);
    }
    paramCount() { return this.p.length; }
    getParams() { return Float32Array.from(this.p); }
    setParams(flat) { if (!flat || flat.length !== this.p.length) throw new Error(`mushroomFly.MushroomFly.setParams: ${this.p.length} weights (got ${flat ? flat.length : flat})`); this.p = Float32Array.from(flat); return this; }
    rate() { return this.plastic ? A_SCALE * Math.max(0, this.p[this.nm + 1]) : 0; }
    act(o) {
        const nm = this.nm, w = this.w, to = this.to, st = this.start;
        if (o.t === 0) { w.set(this.w0); this.last = null; }
        const a = this.rate();
        if (a > 0 && this.last && o.us !== 0) {
            const fi = o.us < 0 ? 0 : 1, f = this._f; for (let m = 0; m < nm; m++) f[m] = 1 - Math.min(1, a * this.teach[m][fi]);
            for (const k of this.last) for (let e = st[k]; e < st[k + 1]; e++) w[e] *= f[to[e]];
        }
        const s = this._s; s.fill(0); for (const k of o.x) for (let e = st[k]; e < st[k + 1]; e++) s[to[e]] += w[e];
        let drive = this.p[nm]; for (let m = 0; m < nm; m++) { const v = this.p[m]; if (v !== 0 && this.base[m] > 0) drive += v * (s[m] / this.base[m] - 1); }
        this.last = o.x;
        return [drive];
    }
}
