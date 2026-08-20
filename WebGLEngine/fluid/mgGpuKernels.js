// mgGpuKernels.js -- WebGPU compute port of the multigrid V-cycle's per-level hot kernels (red-black Gauss-Seidel
// smoother + residual/apply), operating on the SAME flat 25-point Galerkin stencil as fluid/multigrid.mjs. This is
// phase 1 of the GPU V-cycle port: the two kernels that dominate runtime (every level smooths pre+post sweeps and
// computes a residual each cycle). CPU-side assembly (buildFineOp, Galerkin, coarsen) is reused from multigrid.mjs
// and uploaded; the inter-grid transfers (restrict/prolong) + multi-level driver on GPU are phase 2.
//
// Cannot be executed in the headless sandbox (no WebGPU). Discipline: the WGSL below is mirrored 1:1 by a JS "shadow"
// (shadowSmoothColor / shadowResidual) with identical indexing + math; a full smoothing test verifies the shadow
// reduces the residual exactly as multigrid.mjs's own _smooth does. If the shadow matches, the algorithm + indexing
// the WGSL implements are correct; the WGSL is then a faithful transcription checked for the known trap classes
// (select() eager-eval, u32 underflow, template leaks). RIG-only for actual GPU execution.
//
// Stencil: SR=2, SW=5, SS=25, SDIAG=12; index k=(dy+SR)*SW+(dx+SR). Types: AIR=0, FLUID=1, SOLID=2.
"use strict";

const SR = 2, SW = 5, SS = 25, SDIAG = 12;

// ---- WGSL: red-black Gauss-Seidel + SOR, one color per dispatch ----------------------------------------------
// bindings: 0 op(read) 1 b(read) 2 type(read u32) 3 p(read_write) 4 params(uniform)
// params = { nx:u32, ny:u32, color:u32, _pad:u32, omega:f32, _p1,_p2,_p3:f32 }
const SMOOTH_WGSL = `
struct P { nx:u32, ny:u32, color:u32, pad:u32, omega:f32, p1:f32, p2:f32, p3:f32 };
@group(0) @binding(0) var<storage,read> op:array<f32>;
@group(0) @binding(1) var<storage,read> bb:array<f32>;
@group(0) @binding(2) var<storage,read> typ:array<u32>;
@group(0) @binding(3) var<storage,read_write> p:array<f32>;
@group(0) @binding(4) var<uniform> u:P;
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid:vec3<u32>) {
  let i = gid.x; let j = gid.y;
  if (i == 0u || j == 0u || i >= u.nx - 1u || j >= u.ny - 1u) { return; }
  if (((i + j) & 1u) != u.color) { return; }
  let c = i + u.nx * j;
  if (typ[c] != 1u) { p[c] = 0.0; return; }
  let base = c * ${SS}u;
  let diag = op[base + ${SDIAG}u];
  if (diag == 0.0) { return; }
  var off = 0.0;
  for (var k:u32 = 0u; k < ${SS}u; k = k + 1u) {
    if (k == ${SDIAG}u) { continue; }
    let a = op[base + k];
    if (a == 0.0) { continue; }
    // signed offsets from k, guarded so u32 index math never underflows
    let dx = i32(k % ${SW}u) - ${SR};
    let dy = i32(k / ${SW}u) - ${SR};
    let ni = i32(i) + dx; let nj = i32(j) + dy;
    if (ni < 0 || nj < 0 || ni >= i32(u.nx) || nj >= i32(u.ny)) { continue; }
    off = off + a * p[u32(ni) + u.nx * u32(nj)];
  }
  let gs = (bb[c] - off) / diag;
  p[c] = p[c] + u.omega * (gs - p[c]);
}`;

// ---- WGSL: residual r = b - A p (FLUID only) -----------------------------------------------------------------
// bindings: 0 op 1 b 2 type 3 p(read) 4 r(write) 5 params
const RESIDUAL_WGSL = `
struct P { nx:u32, ny:u32, color:u32, pad:u32, omega:f32, p1:f32, p2:f32, p3:f32 };
@group(0) @binding(0) var<storage,read> op:array<f32>;
@group(0) @binding(1) var<storage,read> bb:array<f32>;
@group(0) @binding(2) var<storage,read> typ:array<u32>;
@group(0) @binding(3) var<storage,read> p:array<f32>;
@group(0) @binding(4) var<storage,read_write> r:array<f32>;
@group(0) @binding(5) var<uniform> u:P;
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid:vec3<u32>) {
  let i = gid.x; let j = gid.y;
  if (i >= u.nx || j >= u.ny) { return; }
  let c = i + u.nx * j;
  if (typ[c] != 1u) { r[c] = 0.0; return; }
  let base = c * ${SS}u;
  var ap = 0.0;
  for (var k:u32 = 0u; k < ${SS}u; k = k + 1u) {
    let a = op[base + k];
    if (a == 0.0) { continue; }
    let dx = i32(k % ${SW}u) - ${SR};
    let dy = i32(k / ${SW}u) - ${SR};
    let ni = i32(i) + dx; let nj = i32(j) + dy;
    if (ni < 0 || nj < 0 || ni >= i32(u.nx) || nj >= i32(u.ny)) { continue; }
    ap = ap + a * p[u32(ni) + u.nx * u32(nj)];
  }
  r[c] = bb[c] - ap;
}`;

// ---- JS shadow: byte-for-byte the same indexing + math the WGSL does (for headless verification) --------------
function shadowSmoothColor(op, b, type, p, nx, ny, color, omega) {
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        if (((i + j) & 1) !== color) continue;
        const c = i + nx * j;
        if (type[c] !== 1) { p[c] = 0; continue; }
        const base = c * SS, diag = op[base + SDIAG];
        if (diag === 0) continue;
        let off = 0;
        for (let k = 0; k < SS; k++) {
            if (k === SDIAG) continue;
            const a = op[base + k]; if (a === 0) continue;
            const dx = (k % SW) - SR, dy = ((k / SW) | 0) - SR, ni = i + dx, nj = j + dy;
            if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
            off += a * p[ni + nx * nj];
        }
        const gs = (b[c] - off) / diag; p[c] += omega * (gs - p[c]);
    }
}
function shadowResidual(op, b, type, p, r, nx, ny) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const c = i + nx * j;
        if (type[c] !== 1) { r[c] = 0; continue; }
        const base = c * SS; let ap = 0;
        for (let k = 0; k < SS; k++) {
            const a = op[base + k]; if (a === 0) continue;
            const dx = (k % SW) - SR, dy = ((k / SW) | 0) - SR, ni = i + dx, nj = j + dy;
            if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
            ap += a * p[ni + nx * nj];
        }
        r[c] = b[c] - ap;
    }
}

// ---- GPU smoother: uploads a level's op/b/type/p, runs N red-black sweeps on the device, reads p back ----------
// (First integration point: replace the CPU _smooth on the finest level, where cell counts dominate. The device +
//  buffers can be cached across solves; this constructor keeps it simple and self-contained for a RIG smoke test.)
class GpuSmoother {
    constructor(device) { this.device = device; this._sm = device.createShaderModule({ code: SMOOTH_WGSL }); this._rm = device.createShaderModule({ code: RESIDUAL_WGSL });
        this._sp = device.createComputePipeline({ layout: "auto", compute: { module: this._sm, entryPoint: "main" } });
        this._rp = device.createComputePipeline({ layout: "auto", compute: { module: this._rm, entryPoint: "main" } }); }
    _buf(arr, usage) { const b = this.device.createBuffer({ size: arr.byteLength, usage, mappedAtCreation: true }); new arr.constructor(b.getMappedRange()).set(arr); b.unmap(); return b; }
    async smooth(op, b, type, p, nx, ny, sweeps, omega = 1.2) {
        const dev = this.device, S = GPUBufferUsage.STORAGE, CS = GPUBufferUsage.COPY_SRC, CD = GPUBufferUsage.COPY_DST, U = GPUBufferUsage.UNIFORM;
        const bufOp = this._buf(op, S), bufB = this._buf(b, S), bufT = this._buf(Uint32Array.from(type), S), bufP = this._buf(p, S | CS);
        const params = new ArrayBuffer(32);
        const mkParams = (color) => { const d = new DataView(params); d.setUint32(0, nx, true); d.setUint32(4, ny, true); d.setUint32(8, color, true); d.setUint32(12, 0, true); d.setFloat32(16, omega, true); return this._buf(new Uint8Array(params.slice(0)), U | CD); };
        for (let s = 0; s < sweeps; s++) for (let color = 0; color < 2; color++) {
            const up = mkParams(color);
            const bg = dev.createBindGroup({ layout: this._sp.getBindGroupLayout(0), entries: [bufOp, bufB, bufT, bufP, up].map((buf, i) => ({ binding: i, resource: { buffer: buf } })) });
            const enc = dev.createCommandEncoder(); const pass = enc.beginComputePass(); pass.setPipeline(this._sp); pass.setBindGroup(0, bg);
            pass.dispatchWorkgroups(Math.ceil(nx / 8), Math.ceil(ny / 8), 1); pass.end(); dev.queue.submit([enc.finish()]);
        }
        const rb = dev.createBuffer({ size: p.byteLength, usage: GPUBufferUsage.MAP_READ | CD });
        const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(bufP, 0, rb, 0, p.byteLength); dev.queue.submit([enc.finish()]);
        await rb.mapAsync(GPUMapMode.READ); p.set(new Float32Array(rb.getMappedRange())); rb.unmap();
        return p;
    }
}

// ---- WGSL: prolong (P gather + add). Each fine cell gathers from its <=4 coarse interpolation cells -----------
// bindings: 0 coarseP 1 coarseType 2 fineType 3 fineP(read_write) 4 params{fnx,fny,cnx,cny}
const PROLONG_WGSL = `
struct P { fnx:u32, fny:u32, cnx:u32, cny:u32 };
@group(0) @binding(0) var<storage,read> cp:array<f32>;
@group(0) @binding(1) var<storage,read> ct:array<u32>;
@group(0) @binding(2) var<storage,read> ft:array<u32>;
@group(0) @binding(3) var<storage,read_write> fp:array<f32>;
@group(0) @binding(4) var<uniform> u:P;
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  let fi = g.x; let fj = g.y;
  if (fi >= u.fnx || fj >= u.fny) { return; }
  let f = fi + u.fnx * fj;
  if (ft[f] != 1u) { return; }
  let gx = (f32(fi) + 0.5) * 0.5 - 0.5; let gy = (f32(fj) + 0.5) * 0.5 - 0.5;
  let i0 = floor(gx); let j0 = floor(gy); let fx = gx - i0; let fy = gy - j0;
  var wsum = 0.0; var val = 0.0;
  for (var dj:i32 = 0; dj < 2; dj = dj + 1) {
    for (var di:i32 = 0; di < 2; di = di + 1) {
      let ci = clamp(i32(i0) + di, 0, i32(u.cnx) - 1);
      let cj = clamp(i32(j0) + dj, 0, i32(u.cny) - 1);
      let cc = u32(ci) + u.cnx * u32(cj);
      if (ct[cc] != 1u) { continue; }
      let w = select(1.0 - fx, fx, di == 1) * select(1.0 - fy, fy, dj == 1);
      if (w <= 0.0) { continue; }
      wsum = wsum + w; val = val + w * cp[cc];
    }
  }
  if (wsum > 0.0) { fp[f] = fp[f] + val / wsum; }
}`;

// ---- WGSL: restrict (P^T gather). Each coarse cell gathers r from the fine cells that interpolate from it ------
// bindings: 0 fineR 1 fineType 2 coarseType 3 coarseB(write) 4 params{fnx,fny,cnx,cny}
const RESTRICT_WGSL = `
struct P { fnx:u32, fny:u32, cnx:u32, cny:u32 };
@group(0) @binding(0) var<storage,read> fr:array<f32>;
@group(0) @binding(1) var<storage,read> ft:array<u32>;
@group(0) @binding(2) var<storage,read> ct:array<u32>;
@group(0) @binding(3) var<storage,read_write> cb:array<f32>;
@group(0) @binding(4) var<uniform> u:P;
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  let ci = g.x; let cj = g.y;
  if (ci >= u.cnx || cj >= u.cny) { return; }
  let c = ci + u.cnx * cj;
  if (ct[c] != 1u) { cb[c] = 0.0; return; }
  var acc = 0.0;
  for (var fj:i32 = i32(cj) * 2 - 1; fj <= i32(cj) * 2 + 2; fj = fj + 1) {
    for (var fi:i32 = i32(ci) * 2 - 1; fi <= i32(ci) * 2 + 2; fi = fi + 1) {
      if (fi < 0 || fj < 0 || fi >= i32(u.fnx) || fj >= i32(u.fny)) { continue; }
      let f = u32(fi) + u.fnx * u32(fj);
      if (ft[f] != 1u) { continue; }
      let gx = (f32(fi) + 0.5) * 0.5 - 0.5; let gy = (f32(fj) + 0.5) * 0.5 - 0.5;
      let i0 = floor(gx); let j0 = floor(gy); let fx = gx - i0; let fy = gy - j0;
      var wsum = 0.0; var wc = 0.0;
      for (var dj:i32 = 0; dj < 2; dj = dj + 1) {
        for (var di:i32 = 0; di < 2; di = di + 1) {
          let cci = clamp(i32(i0) + di, 0, i32(u.cnx) - 1);
          let ccj = clamp(i32(j0) + dj, 0, i32(u.cny) - 1);
          let cc = u32(cci) + u.cnx * u32(ccj);
          if (ct[cc] != 1u) { continue; }
          let w = select(1.0 - fx, fx, di == 1) * select(1.0 - fy, fy, dj == 1);
          if (w <= 0.0) { continue; }
          wsum = wsum + w;
          if (cc == c) { wc = wc + w; }
        }
      }
      if (wsum > 0.0) { acc = acc + (wc / wsum) * fr[f]; }
    }
  }
  cb[c] = acc;
}`;

const CLEAR_WGSL = `
@group(0) @binding(0) var<storage,read_write> x:array<f32>;
@compute @workgroup_size(64,1,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) { if (g.x < arrayLength(&x)) { x[g.x] = 0.0; } }`;

// ---- JS shadows of the transfers (gather form, identical to the WGSL above) ----------------------------------
function _pcolsCoarse(cnx, cny, cType, fi, fj) {
    const gx = (fi + 0.5) * 0.5 - 0.5, gy = (fj + 0.5) * 0.5 - 0.5;
    const i0 = Math.floor(gx), j0 = Math.floor(gy), fx = gx - i0, fy = gy - j0;
    let ws = 0; const e = [];
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
        const ci = Math.max(0, Math.min(cnx - 1, i0 + di)), cj = Math.max(0, Math.min(cny - 1, j0 + dj)), cc = ci + cnx * cj;
        if (cType[cc] !== 1) continue; const w = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy); if (w <= 0) continue; e.push([cc, w]); ws += w;
    }
    if (ws > 0) for (const x of e) x[1] /= ws; return e;
}
function shadowProlong(coarseP, coarseType, fineType, fineP, fnx, fny, cnx, cny) {
    for (let fj = 0; fj < fny; fj++) for (let fi = 0; fi < fnx; fi++) { const f = fi + fnx * fj; if (fineType[f] !== 1) continue;
        const e = _pcolsCoarse(cnx, cny, coarseType, fi, fj); let v = 0; for (const [cc, w] of e) v += w * coarseP[cc]; fineP[f] += v; }
}
function shadowRestrict(fineR, fineType, coarseType, coarseB, fnx, fny, cnx, cny) {
    coarseB.fill(0);
    for (let cj = 0; cj < cny; cj++) for (let ci = 0; ci < cnx; ci++) { const c = ci + cnx * cj; if (coarseType[c] !== 1) continue; let acc = 0;
        for (let fj = 2 * cj - 1; fj <= 2 * cj + 2; fj++) for (let fi = 2 * ci - 1; fi <= 2 * ci + 2; fi++) {
            if (fi < 0 || fj < 0 || fi >= fnx || fj >= fny) continue; const f = fi + fnx * fj; if (fineType[f] !== 1) continue;
            const e = _pcolsCoarse(cnx, cny, coarseType, fi, fj); for (const [cc, w] of e) if (cc === c) acc += w * fineR[f];
        }
        coarseB[c] = acc; }
}

export { SMOOTH_WGSL, RESIDUAL_WGSL, PROLONG_WGSL, RESTRICT_WGSL, CLEAR_WGSL, shadowSmoothColor, shadowResidual, shadowProlong, shadowRestrict, GpuSmoother, SR, SW, SS, SDIAG };
if (typeof module !== "undefined" && module.exports) module.exports = { SMOOTH_WGSL, RESIDUAL_WGSL, shadowSmoothColor, shadowResidual, GpuSmoother, SR, SW, SS, SDIAG };
