// WebGLEngine/brain/reservoirGpu.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/reservoirGpu-selfcheck.mjs; the backlog entry is `gpu-reservoir-kernel`)
//
// THE GPU BRAIN'S RESERVOIR KERNEL: the recurrent step of brain/pilotSubCircuitState.mjs's reservoir (the fly's heading loop: 148 cells, 7,080 synapses) for a BATCH of reservoirs in ONE dispatch a tick, the state kept on the device
// between ticks. The GPU Brain had pilot and seat kernels (brain/pilotFlightGpu.mjs, brain/seatGunnerGpu.mjs: dense MLP layers through brain/mlp.js) and no kernel for a SPARSE, STATEFUL step; this is that kernel.
//
//   const r = new GpuReservoirBatch(device, circuit, weights, { batch: 64, persist: true });
//   r.step(xRows);                  // xRows: batch x 15 numbers (the pilot's 14 features and compassValid); one dispatch, no read-back
//   const h = await r.read();       // Float32Array of batch x N: the cells' activity after the last step
//   r.reset();                      // every reservoir back to 0 (a new dive)
//
// THE STEP, the CPU twin's (pilotSubCircuitState updateInto) exactly in its terms: h'[i] = relu( bias[i] + sigma x sum over edges j->i of gain_ji x h[j]  +  (if i is an input cell a) sum_f W_in[a][f] x x[f] ), sigma = clamp(w[SIGMA], 0, 1),
// gain = sign x count / (the largest singular value of the signed count matrix): the twin's own numbers (createStatePolicy's sigmaMax). NO STATE (persist false) drops the recurrent sum. Non-finite features read as 0, as the twin's fin() does.
// ONE THREAD A (reservoir, cell): the edges INTO each cell are a CSR list (inStart, inFrom, inGain), sorted by source, so a cell sums its recurrent inputs in the order the twin adds them (the twin scatters from sources in ascending order).
// The device works in float32 and the twin in float64: the gate holds every cell to 1e-4 of the twin (relative to max(1, |twin|)), step after step, and REPORTS how many are bit-identical in float32 without asserting it.
// *** WHAT THE GPU IS AND IS NOT DOING, SAID PLAINLY. *** One step is about 7,080 + 15 x 88 multiply-adds a reservoir. The readout and the autopilot's laws stay on the CPU (brain/pilotSubCircuitState.mjs readout). A batch is where the device
// could pay (the backlog's "a batch of reservoirs is where a GPU would pay"); on this sandbox's SOFTWARE adapter (SwiftShader) the timing the gate prints is a CPU rasteriser's and says nothing about a card. The rig's number is owed.
// Pure apart from the device it is handed: no clock, no Math.random, no file.
"use strict";
import * as CS from "./pilotSubCircuitState.mjs";

export const WORKGROUP = 64;
export const WGSL = /* wgsl */ `
struct P { batch: u32, n: u32, ni: u32, nf: u32, persist: u32, sigma: f32, e: u32, pad: u32 };
// FIVE storage buffers, inside WebGPU's portable default of 8 a stage (a first draft with one buffer a table needed 9 and the device refused it):
//   fv = [ W_in (ni x nf) | bias (n) | inGain (e) ]      iv = [ inStart (n + 1) | inFrom (e) | inputSlot (n; 0xFFFFFFFF = not an input cell) ]
@group(0) @binding(0) var<storage, read_write> hOut: array<f32>;
@group(0) @binding(1) var<uniform> p: P;
@group(0) @binding(2) var<storage, read> hPrev: array<f32>;
@group(0) @binding(3) var<storage, read> x: array<f32>;
@group(0) @binding(4) var<storage, read> fv: array<f32>;
@group(0) @binding(5) var<storage, read> iv: array<u32>;
@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= p.batch * p.n) { return; }
    let b = idx / p.n;
    let i = idx % p.n;
    let offBias = p.ni * p.nf;
    let offGain = offBias + p.n;
    let offFrom = p.n + 1u;
    let offSlot = offFrom + p.e;
    var s = fv[offBias + i];
    if (p.persist == 1u) {
        let base = b * p.n;
        for (var k = iv[i]; k < iv[i + 1u]; k = k + 1u) {
            let hj = hPrev[base + iv[offFrom + k]];
            if (hj > 0.0) { s = s + fv[offGain + k] * (p.sigma * hj); }
        }
    }
    let a = iv[offSlot + i];
    if (a != 0xFFFFFFFFu) {
        var d = 0.0;
        let row = a * p.nf;
        let xb = b * p.nf;
        for (var f = 0u; f < p.nf; f = f + 1u) { d = d + fv[row + f] * x[xb + f]; }
        s = s + d;
    }
    hOut[idx] = max(s, 0.0);
}`;

/**
 * The tables the kernel reads, built from a circuit and a weight vector (pure; the gate holds them): { N, NI, NF, E, sigma, bias, win, inStart, inFrom, inGain, inputSlot }.
 * inStart/inFrom/inGain list the edges INTO each cell, sorted by source cell ascending (the order in which the twin's scatter reaches each target). A weight vector of the wrong length is refused.
 */
export function tablesOf(circuit, weights, { persist = true } = {}) {
    const pol = CS.createStatePolicy(circuit, "gpu", { persist }), res = CS.reservoirOf(circuit), N = res.N, NI = res.inputs.length, NF = CS.FEATURES, E = res.E;
    if (!weights || weights.length !== pol.WEIGHT_COUNT) throw new Error(`reservoirGpu.tablesOf: the circuit takes ${pol.WEIGHT_COUNT} weights, got ${weights ? weights.length : "none"}`);
    const offB = NF * NI, sig = weights[pol.SIGMA_INDEX], sigma = Number.isFinite(sig) ? Math.min(1, Math.max(0, sig)) : 0;
    const order = Array.from({ length: E }, (_, k) => k).sort((a, b) => res.to[a] - res.to[b] || res.from[a] - res.from[b] || a - b);
    const inStart = new Uint32Array(N + 1), inFrom = new Uint32Array(E), inGain = new Float32Array(E);
    for (let k = 0; k < E; k++) inStart[res.to[k] + 1]++;
    for (let i = 0; i < N; i++) inStart[i + 1] += inStart[i];
    order.forEach((k, q) => { inFrom[q] = res.from[k]; inGain[q] = pol.sigmaMax > 0 ? (res.sign[k] * res.mag[k]) / pol.sigmaMax : 0; });
    const inputSlot = new Int32Array(N).fill(-1); res.inputs.forEach((cell, a) => { inputSlot[cell] = a; });
    return { N, NI, NF, E, sigma, persist, bias: Float32Array.from(weights.slice(offB, offB + N)), win: Float32Array.from(weights.slice(0, offB)), inStart, inFrom, inGain, inputSlot, sigmaMax: pol.sigmaMax };
}

/** A float32 row of features with non-finite values read as 0 (the twin's fin()). */
const finRow = (row, NF, out, at) => { for (let f = 0; f < NF; f++) { const v = row[f]; out[at + f] = Number.isFinite(v) ? v : 0; } };

export class GpuReservoirBatch {
    /** The checked way to make one: the construction runs inside a validation error scope, and a device that REJECTS the pipeline or a bind group throws here (an invalid pipeline otherwise runs nothing and reads back stale buffers). */
    static async create(device, circuit, weights, opts = {}) {
        device.pushErrorScope("validation");
        let r = null, thrown = null; try { r = new GpuReservoirBatch(device, circuit, weights, opts); } catch (e) { thrown = e; }
        const v = await device.popErrorScope();
        if (thrown) throw thrown;
        if (v) { r.destroy(); throw new Error("GpuReservoirBatch.create: the device rejected the kernel -- " + String(v.message || v).split("\n")[0]); }
        return r;
    }
    /** @param device a GPUDevice. @param circuit { neurons, edges, io }. @param weights the policy's weight vector (1,729 for the fly). @param opts { batch, persist }. */
    constructor(device, circuit, weights, { batch = 1, persist = true } = {}) {
        if (!device || typeof device.createShaderModule !== "function") throw new Error("GpuReservoirBatch needs a GPUDevice");
        if (!Number.isInteger(batch) || batch < 1) throw new Error(`GpuReservoirBatch: batch must be a positive integer, got ${JSON.stringify(batch)}`);
        const t = tablesOf(circuit, weights, { persist }), U = globalThis.GPUBufferUsage || device.__usage;
        if (!U) throw new Error("GpuReservoirBatch: GPUBufferUsage is not defined (hand it in as device.__usage in a non-browser host)");
        this.device = device; this.t = t; this.batch = batch; this.dispatches = 0; this.U = U;
        const buf = (data, usage) => { const b = device.createBuffer({ size: Math.max(16, Math.ceil(data.byteLength / 4) * 4), usage }); device.queue.writeBuffer(b, 0, data); return b; };
        const S = U.STORAGE | U.COPY_DST, n = batch * t.N;
        this.h = [device.createBuffer({ size: n * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST }), device.createBuffer({ size: n * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST })];
        this.x = device.createBuffer({ size: Math.max(16, batch * t.NF * 4), usage: S });
        this.params = device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
        const pv = new ArrayBuffer(32), pu = new Uint32Array(pv), pf = new Float32Array(pv);
        pu[0] = batch; pu[1] = t.N; pu[2] = t.NI; pu[3] = t.NF; pu[4] = t.persist ? 1 : 0; pf[5] = t.sigma; pu[6] = t.E;
        device.queue.writeBuffer(this.params, 0, pv);
        const fv = new Float32Array(t.win.length + t.N + t.E); fv.set(t.win, 0); fv.set(t.bias, t.win.length); fv.set(t.inGain, t.win.length + t.N);
        const iv = new Uint32Array(t.N + 1 + t.E + t.N); iv.set(t.inStart, 0); iv.set(t.inFrom, t.N + 1); iv.set(Uint32Array.from(t.inputSlot, (v) => (v < 0 ? 0xffffffff : v)), t.N + 1 + t.E);
        this.tables = [buf(fv, S), buf(iv, S)];
        const module = device.createShaderModule({ code: WGSL });
        this.pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
        const group = (out, prev) => device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [out, this.params, prev, this.x, ...this.tables].map((b, k) => ({ binding: k, resource: { buffer: b } })) });
        this.groups = [group(this.h[1], this.h[0]), group(this.h[0], this.h[1])];   // groups[c] reads h[c] and writes h[1 - c]
        this.cur = 0; this.xStage = new Float32Array(batch * t.NF); this.reset();
    }
    /** Every reservoir's state back to 0. */
    reset() { this.device.queue.writeBuffer(this.h[this.cur], 0, new Float32Array(this.batch * this.t.N)); }
    /** Set the current state from a Float32Array / array of batch x N (for the gate, and to start a batch from given states). */
    setState(h) { if (h.length !== this.batch * this.t.N) throw new Error(`GpuReservoirBatch.setState: ${this.batch * this.t.N} numbers wanted, got ${h.length}`); this.device.queue.writeBuffer(this.h[this.cur], 0, Float32Array.from(h)); }
    /** One tick for the whole batch: `rows` is batch rows of NF features (or one flat array of batch x NF). One dispatch, no read-back. */
    step(rows) {
        const { NF } = this.t, flat = rows.length === this.batch * NF && typeof rows[0] === "number";
        if (!flat && rows.length !== this.batch) throw new Error(`GpuReservoirBatch.step: ${this.batch} rows of ${NF} wanted, got ${rows.length}`);
        for (let b = 0; b < this.batch; b++) finRow(flat ? rows.slice(b * NF, b * NF + NF) : rows[b], NF, this.xStage, b * NF);
        this.device.queue.writeBuffer(this.x, 0, this.xStage);
        const enc = this.device.createCommandEncoder(), cp = enc.beginComputePass();
        cp.setPipeline(this.pipeline); cp.setBindGroup(0, this.groups[this.cur]); cp.dispatchWorkgroups(Math.ceil((this.batch * this.t.N) / WORKGROUP)); cp.end();
        this.device.queue.submit([enc.finish()]); this.cur = 1 - this.cur; this.dispatches++;
    }
    /** The current state of every reservoir: a Float32Array of batch x N (one read-back). */
    async read() {
        const U = this.U, bytes = this.batch * this.t.N * 4, rb = this.device.createBuffer({ size: bytes, usage: U.COPY_DST | U.MAP_READ }), enc = this.device.createCommandEncoder();
        enc.copyBufferToBuffer(this.h[this.cur], 0, rb, 0, bytes); this.device.queue.submit([enc.finish()]);
        const M = globalThis.GPUMapMode || this.device.__mapMode;
        await rb.mapAsync(M.READ); const out = new Float32Array(rb.getMappedRange()).slice(); rb.unmap(); rb.destroy();
        return out;
    }
    /** Release the device buffers. */
    destroy() { for (const b of [...this.h, this.x, this.params, ...this.tables]) b.destroy(); }
}
