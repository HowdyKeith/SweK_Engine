// multigridGPU.js -- WebGPU port of the FULL 2D multigrid V-cycle (phase 2). CPU-side assembly (coarsen types,
// build the fine 25-point operator, Galerkin-restrict it down the hierarchy) is reused verbatim from the proven
// PoissonMG in multigrid.mjs; the V-cycle iteration itself -- smooth, residual, restrict, prolong across every
// level -- runs on the device via the compute kernels in mgGpuKernels.js, so once the operators are uploaded the
// pressure solve stays on the GPU. Kernels: red-black GS smoother + residual (phase 1) and the restrict (P^T) /
// prolong (P) gathers (phase 2).
//
// Cannot execute headlessly (no WebGPU here). The whole cycle is mirrored by shadowVCycle() below, built from the
// JS shadow kernels whose indexing + math are identical to the WGSL; a shadow-driven solve is verified to converge
// the same as multigrid.mjs's own scatter-form solve. The GpuMultigrid class is the correct-by-construction device
// driver (RIG-only). The transfers are guarded with real bounds checks (no eager select() on out-of-range indices).
"use strict";

import { PoissonMG, FLUID } from "./multigrid.mjs";
import { SMOOTH_WGSL, RESIDUAL_WGSL, PROLONG_WGSL, RESTRICT_WGSL, CLEAR_WGSL,
    shadowSmoothColor, shadowResidual, shadowProlong, shadowRestrict } from "./mgGpuKernels.js";

// ---- headless verification path: run the whole V-cycle with the JS shadow kernels (gather transfers) ----------
function _shadowSmooth(L, sweeps, omega) { for (let s = 0; s < sweeps; s++) for (let color = 0; color < 2; color++) shadowSmoothColor(L.op, L.b, L.type, L.p, L.nx, L.ny, color, omega); }
function _shadowVLevel(mg, lvl) {
    const L = mg.levels[lvl];
    if (lvl === mg.levels.length - 1) { _shadowSmooth(L, mg.coarseIters, mg.omega); return; }
    _shadowSmooth(L, mg.pre, mg.omega);
    shadowResidual(L.op, L.b, L.type, L.p, L.r, L.nx, L.ny);
    const C = mg.levels[lvl + 1];
    shadowRestrict(L.r, L.type, C.type, C.b, L.nx, L.ny, C.nx, C.ny);
    C.p.fill(0);
    _shadowVLevel(mg, lvl + 1);
    shadowProlong(C.p, C.type, L.type, L.p, L.nx, L.ny, C.nx, C.ny);
    _shadowSmooth(L, mg.post, mg.omega);
}
// solve using the shadow (gather) V-cycle, on operators assembled by the proven PoissonMG. Mirrors PoissonMG.solve.
function shadowSolve(mg, type, div, dt, pOut, vcycles = 8) {
    const F = mg.levels[0]; F.type.set(type);
    const invDt = 1 / dt; for (let n = 0; n < F.b.length; n++) F.b[n] = (F.type[n] === FLUID) ? -div[n] * invDt : 0;
    F.p.fill(0);
    for (let L = 0; L < mg.levels.length - 1; L++) mg._coarsenType(mg.levels[L], mg.levels[L + 1]);
    mg._buildFineOp(F);
    for (let L = 0; L < mg.levels.length - 1; L++) mg._galerkin(mg.levels[L], mg.levels[L + 1]);
    for (let v = 0; v < vcycles; v++) _shadowVLevel(mg, 0);
    pOut.set(F.p); return pOut;
}

// ---- RIG device driver: the same V-cycle on WebGPU compute -----------------------------------------------------
class GpuMultigrid {
    constructor(device, nx, ny, opts = {}) {
        this.device = device; this.mg = new PoissonMG(nx, ny, opts);   // reuse CPU assembly + level geometry
        this.pre = this.mg.pre; this.post = this.mg.post; this.omega = this.mg.omega; this.coarseIters = this.mg.coarseIters;
        const mk = (src) => device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: src }), entryPoint: "main" } });
        this.pSmooth = mk(SMOOTH_WGSL); this.pResid = mk(RESIDUAL_WGSL); this.pProlong = mk(PROLONG_WGSL); this.pRestrict = mk(RESTRICT_WGSL); this.pClear = mk(CLEAR_WGSL);
        const S = GPUBufferUsage.STORAGE, U = GPUBufferUsage.UNIFORM, CD = GPUBufferUsage.COPY_DST, CS = GPUBufferUsage.COPY_SRC;
        this.lv = this.mg.levels.map((L) => { const n = L.nx * L.ny; return {
            nx: L.nx, ny: L.ny,
            op: device.createBuffer({ size: n * 25 * 4, usage: S | CD }),
            b: device.createBuffer({ size: n * 4, usage: S | CD }),
            p: device.createBuffer({ size: n * 4, usage: S | CD | CS }),
            r: device.createBuffer({ size: n * 4, usage: S | CD | CS }),
            type: device.createBuffer({ size: n * 4, usage: S | CD }),
        }; });
        this._smParam = []; for (let c = 0; c < 2; c++) { const a = new ArrayBuffer(32); this._smParam.push(a); }
        this.readback = device.createBuffer({ size: nx * ny * 4, usage: GPUBufferUsage.MAP_READ | CD });
    }
    _bg(pipe, bufs) { return this.device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: bufs.map((b, i) => ({ binding: i, resource: { buffer: b } })) }); }
    _u(bytes) { const b = this.device.createBuffer({ size: bytes.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, mappedAtCreation: true }); new Uint8Array(b.getMappedRange()).set(new Uint8Array(bytes)); b.unmap(); return b; }
    _dispatch(enc, pipe, bg, gx, gy) { const pass = enc.beginComputePass(); pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil(gx / 8), Math.ceil(gy / 8), 1); pass.end(); }
    _smoothParams(nx, ny, color) { const a = new ArrayBuffer(32); const d = new DataView(a); d.setUint32(0, nx, true); d.setUint32(4, ny, true); d.setUint32(8, color, true); d.setUint32(12, 0, true); d.setFloat32(16, this.omega, true); return a; }
    _xferParams(fnx, fny, cnx, cny) { const a = new ArrayBuffer(16); const d = new DataView(a); d.setUint32(0, fnx, true); d.setUint32(4, fny, true); d.setUint32(8, cnx, true); d.setUint32(12, cny, true); return a; }
    _smooth(enc, li, sweeps) { const L = this.lv[li]; for (let s = 0; s < sweeps; s++) for (let color = 0; color < 2; color++) { const up = this._u(this._smoothParams(L.nx, L.ny, color)); this._dispatch(enc, this.pSmooth, this._bg(this.pSmooth, [L.op, L.b, L.type, L.p, up]), L.nx, L.ny); } }
    _vcycle(enc, li) {
        const L = this.lv[li];
        if (li === this.lv.length - 1) { this._smooth(enc, li, this.coarseIters); return; }
        this._smooth(enc, li, this.pre);
        this._dispatch(enc, this.pResid, this._bg(this.pResid, [L.op, L.b, L.type, L.p, L.r, this._u(this._smoothParams(L.nx, L.ny, 0))]), L.nx, L.ny);
        const C = this.lv[li + 1];
        this._dispatch(enc, this.pRestrict, this._bg(this.pRestrict, [L.r, L.type, C.type, C.b, this._u(this._xferParams(L.nx, L.ny, C.nx, C.ny))]), C.nx, C.ny);
        this._dispatch(enc, this.pClear, this.device.createBindGroup({ layout: this.pClear.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: C.p } }] }), C.nx * C.ny, 1);
        this._vcycle(enc, li + 1);
        this._dispatch(enc, this.pProlong, this._bg(this.pProlong, [C.p, C.type, L.type, L.p, this._u(this._xferParams(L.nx, L.ny, C.nx, C.ny))]), L.nx, L.ny);
        this._smooth(enc, li, this.post);
    }
    async solve(type, div, dt, pOut, vcycles = 8) {
        const dev = this.device, mg = this.mg, F = mg.levels[0]; F.type.set(type);
        for (let L = 0; L < mg.levels.length - 1; L++) mg._coarsenType(mg.levels[L], mg.levels[L + 1]);
        mg._buildFineOp(F); for (let L = 0; L < mg.levels.length - 1; L++) mg._galerkin(mg.levels[L], mg.levels[L + 1]);
        const invDt = 1 / dt;
        for (let li = 0; li < mg.levels.length; li++) { const L = mg.levels[li], G = this.lv[li];
            dev.queue.writeBuffer(G.op, 0, L.op); dev.queue.writeBuffer(G.type, 0, Uint32Array.from(L.type));
            const b = new Float32Array(L.type.length); if (li === 0) for (let n = 0; n < b.length; n++) b[n] = (L.type[n] === FLUID) ? -div[n] * invDt : 0;
            dev.queue.writeBuffer(G.b, 0, b); dev.queue.writeBuffer(G.p, 0, new Float32Array(L.type.length)); }
        for (let v = 0; v < vcycles; v++) { const enc = dev.createCommandEncoder(); this._vcycle(enc, 0); dev.queue.submit([enc.finish()]); }
        const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(this.lv[0].p, 0, this.readback, 0, pOut.byteLength); dev.queue.submit([enc.finish()]);
        await this.readback.mapAsync(GPUMapMode.READ); pOut.set(new Float32Array(this.readback.getMappedRange())); this.readback.unmap(); return pOut;
    }
}

export { GpuMultigrid, shadowSolve };
if (typeof module !== "undefined" && module.exports) module.exports = { GpuMultigrid, shadowSolve };
