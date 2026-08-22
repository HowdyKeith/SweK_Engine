// fx/anime4k/anime4k.js -- Anime4K, the classic real-time upscaler (bloc97/Anime4K, MIT), reimplemented NATIVELY
// for SweK. No aggregator, no external deps -- just the algorithm, as a chain of passes.
//
// Per bloc97's own wiki, the "original Anime4K algorithm" is effectively a DEBLUR: it assumes bilinear upscaling
// blurred the image like a Gaussian kernel, and undoes it with non-linear residual enhancement CLAMPED to prevent
// overshoot (ringing). We implement exactly that -- a Difference-of-Gaussians deblur with a local min/max clamp --
// plus the perceptual line-darkening pass (blur spreads lines out and lightens them; darkening restores the crisp
// dark anime line). Pipeline: bilinear 2x -> DoG deblur (overshoot-clamped) -> line darken.
//
// This file has the CPU reference (anime4kCPU) -- runs anywhere, drives the demo, and is the ground truth the WGSL
// is checked against -- plus WGSL compute kernels + JS shadows and Anime4KGPU, the correct-by-construction WebGPU
// driver (RIG-only). rgba buffers are Float32 [0,1].
"use strict";

const REC = [0.299, 0.587, 0.114];
function luma(r, g, b) { return REC[0] * r + REC[1] * g + REC[2] * b; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function upscale2x(src, w, h) {
    const W = w * 2, H = h * 2, out = new Float32Array(W * H * 4);
    const S = (x, y, c) => { x = x < 0 ? 0 : x > w - 1 ? w - 1 : x; y = y < 0 ? 0 : y > h - 1 ? h - 1 : y; return src[(y * w + x) * 4 + c]; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sx = (x + 0.5) / 2 - 0.5, sy = (y + 0.5) / 2 - 0.5;
        const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, o = (y * W + x) * 4;
        for (let c = 0; c < 4; c++) out[o + c] = S(x0, y0, c) * (1 - fx) * (1 - fy) + S(x0 + 1, y0, c) * fx * (1 - fy) + S(x0, y0 + 1, c) * (1 - fx) * fy + S(x0 + 1, y0 + 1, c) * fx * fy;
    }
    return { data: out, w: W, h: H };
}
function computeLuma(buf, w, h) { for (let i = 0; i < w * h; i++) buf[i * 4 + 3] = luma(buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2]); }
function samp(buf, w, h, x, y, c) { x = x < 0 ? 0 : x > w - 1 ? w - 1 : x; y = y < 0 ? 0 : y > h - 1 ? h - 1 : y; return buf[(y * w + x) * 4 + c]; }

// 3x3 Gaussian blur weights [1 2 1; 2 4 2; 1 2 1]/16
const GW = [1, 2, 1, 2, 4, 2, 1, 2, 1], GSUM = 16;
function gaussianAt(buf, w, h, x, y, c) { let a = 0, k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { a += GW[k++] * samp(buf, w, h, x + dx, y + dy, c); } return a / GSUM; }

// DoG deblur: enhance the residual (pixel - gaussian) with a strength, then CLAMP to the local 3x3 min/max so the
// enhancement can't overshoot past values that actually exist nearby (this is what makes it a deblur, not a naive
// sharpen that rings). Per channel.
function deblurDoG(buf, w, h, strength) {
    const out = buf.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
            const v = buf[o + c], blur = gaussianAt(buf, w, h, x, y, c), d = v - blur;
            let lo = 1, hi = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = samp(buf, w, h, x + dx, y + dy, c); if (n < lo) lo = n; if (n > hi) hi = n; }
            out[o + c] = clamp(v + strength * d, lo, hi);
        }
    }
    buf.set(out);
}

// line darkening: where a pixel is darker than its blurred surroundings (a line core / edge), push it darker,
// scaled by how much darker it is. Restores the crisp dark line that blur washed out. Operates on luma-scaled rgb.
function lineDarken(buf, w, h, strength) {
    const out = buf.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const lv = luma(buf[o], buf[o + 1], buf[o + 2]);
        const bl = REC[0] * gaussianAt(buf, w, h, x, y, 0) + REC[1] * gaussianAt(buf, w, h, x, y, 1) + REC[2] * gaussianAt(buf, w, h, x, y, 2);
        const darkAmt = bl - lv;   // >0 => pixel is darker than surroundings (a line)
        if (darkAmt > 0) { const f = 1 - strength * clamp01(darkAmt * 2); for (let c = 0; c < 3; c++) out[o + c] = clamp01(buf[o + c] * f); }
    }
    buf.set(out);
}

// full reference pipeline. rgba: Float32Array [0,1] length w*h*4. Returns {data,w,h} at scale (2 or 4).
function anime4kCPU(rgba, w, h, opts = {}) {
    const scale = opts.scale || 2, sDeblur = opts.strengthDeblur != null ? opts.strengthDeblur : 1.4, sDark = opts.strengthDarken != null ? opts.strengthDarken : 0.5;
    let cur = { data: Float32Array.from(rgba), w, h };
    let times = Math.max(1, Math.round(Math.log2(scale)));
    for (let t = 0; t < times; t++) cur = upscale2x(cur.data, cur.w, cur.h);
    deblurDoG(cur.data, cur.w, cur.h, sDeblur);
    if (sDark > 0) lineDarken(cur.data, cur.w, cur.h, sDark);
    for (let i = 0; i < cur.w * cur.h; i++) cur.data[i * 4 + 3] = 1;
    return cur;
}

// ---- RIG WebGPU driver: the same pipeline on the device (correct-by-construction; no WebGPU headless here) ------
class Anime4KGPU {
    constructor(device, kernels) {
        this.device = device;
        const K = kernels;   // pass { UPSCALE_WGSL, DEBLUR_WGSL, DARKEN_WGSL } from anime4kKernels.js
        const mk = (src) => device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: src }), entryPoint: "main" } });
        this.pUp = mk(K.UPSCALE_WGSL); this.pDeblur = mk(K.DEBLUR_WGSL); this.pDark = mk(K.DARKEN_WGSL);
    }
    _buf(bytes, extra = 0) { return this.device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | extra }); }
    _u(arr) { const b = this.device.createBuffer({ size: arr.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, mappedAtCreation: true }); new Uint8Array(b.getMappedRange()).set(new Uint8Array(arr.buffer)); b.unmap(); return b; }
    _bg(pipe, bufs) { return this.device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: bufs.map((b, i) => ({ binding: i, resource: { buffer: b } })) }); }
    _dispatch(enc, pipe, bg, gx, gy) { const p = enc.beginComputePass(); p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil(gx / 8), Math.ceil(gy / 8), 1); p.end(); }
    // rgba: Float32Array [0,1] length w*h*4. Returns Promise<{data,w,h}> at 2x. scale 4 = run twice (chain upscales).
    async run(rgba, w, h, opts = {}) {
        const dev = this.device, sD = opts.strengthDeblur != null ? opts.strengthDeblur : 1.4, sK = opts.strengthDarken != null ? opts.strengthDarken : 0.5;
        const W = w * 2, H = h * 2;
        const src = this._buf(w * h * 16), mid = this._buf(W * H * 16), out = this._buf(W * H * 16);
        dev.queue.writeBuffer(src, 0, rgba);
        const upP = this._u(new Uint32Array([w, h]));
        const deblurP = new ArrayBuffer(16); { const d = new DataView(deblurP); d.setUint32(0, W, true); d.setUint32(4, H, true); d.setFloat32(8, sD, true); }
        const darkP = new ArrayBuffer(16); { const d = new DataView(darkP); d.setUint32(0, W, true); d.setUint32(4, H, true); d.setFloat32(8, sK, true); }
        const enc = dev.createCommandEncoder();
        this._dispatch(enc, this.pUp, this._bg(this.pUp, [src, mid, upP]), W, H);              // bilinear 2x -> mid
        this._dispatch(enc, this.pDeblur, this._bg(this.pDeblur, [mid, out, this._u(new Uint8Array(deblurP))]), W, H);   // DoG deblur mid -> out
        this._dispatch(enc, this.pDark, this._bg(this.pDark, [out, mid, this._u(new Uint8Array(darkP))]), W, H);         // darken out -> mid
        const rb = dev.createBuffer({ size: W * H * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        enc.copyBufferToBuffer(mid, 0, rb, 0, W * H * 16); dev.queue.submit([enc.finish()]);
        await rb.mapAsync(GPUMapMode.READ); const data = new Float32Array(rb.getMappedRange().slice(0)); rb.unmap();
        return { data, w: W, h: H };
    }
}

export { anime4kCPU, upscale2x, computeLuma, gaussianAt, deblurDoG, lineDarken, luma, Anime4KGPU };
if (typeof module !== "undefined" && module.exports) module.exports = { anime4kCPU, upscale2x, computeLuma, gaussianAt, deblurDoG, lineDarken, luma, Anime4KGPU };
