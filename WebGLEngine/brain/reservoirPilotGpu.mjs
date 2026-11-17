// WebGLEngine/brain/reservoirPilotGpu.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/reservoirPilotGpu-selfcheck.mjs; the backlog entry is `gpu-reservoir-kernel`,
// whose note brain/RESERVOIR_GPU_WIP.md listed "the readout and the autopilot's laws on the device" as NOT DONE)
//
// THE WHOLE FLY PILOT ON THE DEVICE, FOR A BATCH. brain/reservoirGpu.mjs steps the reservoir (148 cells) on the device and left the readout and the autopilot's laws on the CPU, so a
// tick had to read back 148 activities a reservoir to produce 4 controls. This adds the readout as a second dispatch on the same queue, after the step:
//   controls[b][o] = clamp( law_o(x_b) + b2[o] + sum_j W2[o][j] x h_b[outputCell_j], -1, 1 )
// and a tick reads back only the 4 controls a reservoir. law is the CPU pilot's own (brain/pilotSubCircuitState.mjs: the PD autopilot's laws as a linear map of the 15 features), TAKEN FROM
// THE CPU POLICY BY PROBING IT (lawMatrixOf), not retyped, so a change to the laws there reaches the device. A reservoir whose target changes is reset ALONE (resetSome), as the CPU pilot
// resets its activity when the target object changes.
//
//   const p = await GpuPilotBatch.create(device, circuit, weights, { batch: 64, persist: true });
//   p.resetSome([3, 7]);            // reservoirs 3 and 7 start a new target: their activity back to 0
//   p.step(xRows);                  // the reservoir step and the readout, two dispatches, no read-back
//   const u = await p.controls();   // Float32Array of batch x 4: pitch, yaw, thrust, ballast in [-1, 1]
//
// WHAT IT IS NOT: a pilot kind for the tank. The tank's step is synchronous and a device read-back is not, so seating subs on this needs a one-tick-late design (said in the note).
// Pure apart from the device it is handed: no clock, no Math.random, no file.
"use strict";
import * as CS from "./pilotSubCircuitState.mjs";
import * as RG from "./reservoirGpu.mjs";

export const OUTPUTS = CS.OUTPUTS, LAW_PROBE = 1e-3, F32_MAX = 3.4028234663852886e38;
export const READOUT_WGSL = /* wgsl */ `
struct Q { batch: u32, n: u32, no: u32, nf: u32 };
//   rv = [ law (OUTPUTS x nf) | W2 (OUTPUTS x no) | b2 (OUTPUTS) | keep (OUTPUTS: 1, or 0 when the output's readout weights are not all finite) ]      oi = [ the output cells (no) ]
@group(0) @binding(0) var<storage, read_write> ctl: array<f32>;
@group(0) @binding(1) var<uniform> q: Q;
@group(0) @binding(2) var<storage, read> h: array<f32>;
@group(0) @binding(3) var<storage, read> x: array<f32>;
@group(0) @binding(4) var<storage, read> rv: array<f32>;
@group(0) @binding(5) var<storage, read> oi: array<u32>;
@compute @workgroup_size(${RG.WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= q.batch * ${CS.OUTPUTS}u) { return; }
    let b = idx / ${CS.OUTPUTS}u;
    let o = idx % ${CS.OUTPUTS}u;
    let offW2 = ${CS.OUTPUTS}u * q.nf;
    let offB2 = offW2 + ${CS.OUTPUTS}u * q.no;
    var y = rv[offB2 + o];
    for (var f = 0u; f < q.nf; f = f + 1u) { y = y + rv[o * q.nf + f] * x[b * q.nf + f]; }
    for (var j = 0u; j < q.no; j = j + 1u) { y = y + rv[offW2 + o * q.no + j] * h[b * q.n + oi[j]]; }
    // keep[o] is 0 for an output whose readout weights are not all finite: the CPU pilot's fin() makes that control 0 on every tick (NaN or Inf in the sum), and so does this
    ctl[idx] = select(0.0, clamp(y, -1.0, 1.0), rv[offB2 + ${CS.OUTPUTS}u + o] != 0.0);
}`;

const CTL_NAMES = Object.freeze(["pitch", "yaw", "thrust", "ballast"]);
/** The CPU pilot's law as a matrix (OUTPUTS x FEATURES), read off the CPU policy: with every weight zero the activity is zero and controls = clamp(law(x)); a small input on one feature
 *  stays inside the clamp, so law[o][f] = control_o(LAW_PROBE x e_f) / LAW_PROBE. The gate checks it is linear (two probe sizes agree) and that it reproduces the CPU pilot. */
export function lawMatrixOf(circuit, { policy = CS.createStatePolicy(circuit, "law") } = {}) {   // `policy` is for the gate: the law must follow the policy it is read from
    const pol = policy, w0 = pol.zeroWeights(), h0 = new Float64Array(pol.HIDDEN), NF = CS.FEATURES, L = Array.from({ length: OUTPUTS }, () => new Float64Array(NF));
    for (let f = 0; f < NF; f++) { const x = new Array(NF).fill(0); x[f] = LAW_PROBE; const c = pol.step(w0, x, h0).controls; CTL_NAMES.forEach((k, o) => { L[o][f] = c[k] / LAW_PROBE; }); }
    return L;
}
/** The readout's tables from a circuit and a weight vector: { NO, outputs, law, w2, b2 }. */
export function readoutTablesOf(circuit, weights) {
    const pol = CS.createStatePolicy(circuit, "readout"), res = CS.reservoirOf(circuit), NO = res.outputs.length;
    if (!weights || weights.length !== pol.WEIGHT_COUNT) throw new Error(`reservoirPilotGpu.readoutTablesOf: the circuit takes ${pol.WEIGHT_COUNT} weights, got ${weights ? weights.length : "none"}`);
    const offW2 = pol.SIGMA_INDEX + 1, offB2 = offW2 + OUTPUTS * NO;
    // an output with a non-finite readout weight is 0 on the CPU on every tick (fin() of a NaN or Inf sum): its weights go to the device as 0 and keep[o] = 0
    const w2raw = weights.slice(offW2, offB2), b2raw = weights.slice(offB2, offB2 + OUTPUTS), keep = Float32Array.from({ length: OUTPUTS }, (_, o) => (Number.isFinite(b2raw[o]) && w2raw.slice(o * NO, (o + 1) * NO).every(Number.isFinite) ? 1 : 0));
    const z = (v) => (Number.isFinite(v) ? v : 0);
    return { NO, outputs: Uint32Array.from(res.outputs), law: lawMatrixOf(circuit), w2: Float32Array.from(w2raw, z), b2: Float32Array.from(b2raw, z), keep };
}

export class GpuPilotBatch {
    /** The checked way to make one: the construction runs inside a validation error scope and THROWS if the device rejects either kernel (as GpuReservoirBatch.create does). */
    static async create(device, circuit, weights, opts = {}) {
        device.pushErrorScope("validation");
        let p = null, thrown = null; try { p = new GpuPilotBatch(device, circuit, weights, opts); } catch (e) { thrown = e; }
        const v = await device.popErrorScope();
        if (thrown) throw thrown;
        if (v) { p.destroy(); throw new Error("GpuPilotBatch.create: the device rejected a kernel -- " + String(v.message || v).split("\n")[0]); }
        return p;
    }
    constructor(device, circuit, weights, { batch = 1, persist = true } = {}) {
        this.res = new RG.GpuReservoirBatch(device, circuit, weights, { batch, persist });
        const t = readoutTablesOf(circuit, weights), U = this.res.U, N = this.res.t.N, NF = this.res.t.NF;
        this.device = device; this.batch = batch; this.rt = t; this.dispatches = 0;
        const buf = (data, usage) => { const b = device.createBuffer({ size: Math.max(16, Math.ceil(data.byteLength / 4) * 4), usage }); device.queue.writeBuffer(b, 0, data); return b; };
        this.ctl = device.createBuffer({ size: Math.max(16, batch * OUTPUTS * 4), usage: U.STORAGE | U.COPY_SRC });
        this.q = buf(Uint32Array.from([batch, N, t.NO, NF]), U.UNIFORM | U.COPY_DST);
        const rv = new Float32Array(OUTPUTS * NF + OUTPUTS * t.NO + 2 * OUTPUTS);
        t.law.forEach((row, o) => rv.set(Float32Array.from(row), o * NF)); rv.set(t.w2, OUTPUTS * NF); rv.set(t.b2, OUTPUTS * NF + OUTPUTS * t.NO); rv.set(t.keep, OUTPUTS * NF + OUTPUTS * t.NO + OUTPUTS);
        this.rv = buf(rv, U.STORAGE | U.COPY_DST); this.oi = buf(t.outputs, U.STORAGE | U.COPY_DST);
        const module = device.createShaderModule({ code: READOUT_WGSL });
        this.pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
        // groups[c] reads the reservoir's buffer h[c]: after a step the new state is in h[res.cur]
        this.groups = [0, 1].map((c) => device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [this.ctl, this.q, this.res.h[c], this.res.x, this.rv, this.oi].map((b, k) => ({ binding: k, resource: { buffer: b } })) }));
    }
    /** Every reservoir's activity back to 0. */
    reset() { this.res.reset(); }
    /** The listed reservoirs' activity back to 0 (a new target for each); the others keep theirs. */
    resetSome(indices) {
        const N = this.res.t.N, z = new Float32Array(N);
        for (const b of indices) if (!Number.isInteger(b) || b < 0 || b >= this.batch) throw new Error(`GpuPilotBatch.resetSome: reservoir ${JSON.stringify(b)} is not in 0..${this.batch - 1}`);   // all checked before any is written
        for (const b of indices) this.device.queue.writeBuffer(this.res.h[this.res.cur], b * N * 4, z);
    }
    /** One tick: the reservoir step, then the readout, both dispatched, nothing read back. */
    step(rows) {
        // a FINITE feature beyond float32's range (|v| > 3.4e38) becomes Inf on the device and 0 x Inf poisons every control, where the CPU (float64) stays finite: refused, loudly
        for (const row of typeof rows[0] === "number" ? [rows] : rows) for (const v of row) if (Number.isFinite(v) && Math.abs(v) > F32_MAX) throw new Error(`GpuPilotBatch.step: a feature of ${v} is beyond float32's range; the device cannot carry it`);   // plain or typed rows
        this.res.step(rows);
        const enc = this.device.createCommandEncoder(), cp = enc.beginComputePass();
        cp.setPipeline(this.pipeline); cp.setBindGroup(0, this.groups[this.res.cur]); cp.dispatchWorkgroups(Math.ceil((this.batch * OUTPUTS) / RG.WORKGROUP)); cp.end();
        this.device.queue.submit([enc.finish()]); this.dispatches += 2;
    }
    /** The controls after the last step: a Float32Array of batch x 4 (pitch, yaw, thrust, ballast), one read-back of 16 bytes a reservoir. */
    async controls() {
        const U = this.res.U, bytes = this.batch * OUTPUTS * 4, rb = this.device.createBuffer({ size: Math.max(16, bytes), usage: U.COPY_DST | U.MAP_READ }), enc = this.device.createCommandEncoder();
        enc.copyBufferToBuffer(this.ctl, 0, rb, 0, bytes); this.device.queue.submit([enc.finish()]);
        const M = globalThis.GPUMapMode || this.device.__mapMode;
        await rb.mapAsync(M.READ); const out = new Float32Array(rb.getMappedRange(), 0, this.batch * OUTPUTS).slice(); rb.unmap(); rb.destroy();
        return out;
    }
    /** The reservoirs' activity (the kernel's read), for the gate. */
    read() { return this.res.read(); }
    destroy() { this.res.destroy(); for (const b of [this.ctl, this.q, this.rv, this.oi]) b.destroy(); }
}
