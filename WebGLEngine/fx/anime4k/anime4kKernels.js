// fx/anime4k/anime4kKernels.js -- WGSL compute kernels for the Anime4K pipeline + JS shadows (mgGpuKernels-style).
// Three passes mirror anime4k.js's CPU reference exactly: UPSCALE (bilinear 2x), DEBLUR (DoG residual, overshoot-
// clamped to the local 3x3 min/max), DARKEN (line darkening). Buffers are flat f32 rgba [0,1]. Neighbor reads use
// real bounds clamping (no eager select() on out-of-range indices). Cannot run WebGPU headless; the shadows below
// use the identical flat indexing + math as the WGSL and are verified bit-identical to the CPU reference.
"use strict";

const REC = "vec3<f32>(0.299, 0.587, 0.114)";

const UPSCALE_WGSL = `
struct P { w:u32, h:u32 };
@group(0) @binding(0) var<storage,read> src:array<f32>;
@group(0) @binding(1) var<storage,read_write> dst:array<f32>;
@group(0) @binding(2) var<uniform> u:P;
fn cs(x:i32, y:i32, c:u32) -> f32 { let xx = clamp(x, 0, i32(u.w) - 1); let yy = clamp(y, 0, i32(u.h) - 1); return src[(u32(yy) * u.w + u32(xx)) * 4u + c]; }
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  let W = u.w * 2u; let H = u.h * 2u;
  if (g.x >= W || g.y >= H) { return; }
  let sx = (f32(g.x) + 0.5) * 0.5 - 0.5; let sy = (f32(g.y) + 0.5) * 0.5 - 0.5;
  let x0 = i32(floor(sx)); let y0 = i32(floor(sy)); let fx = sx - floor(sx); let fy = sy - floor(sy);
  let o = (g.y * W + g.x) * 4u;
  for (var c:u32 = 0u; c < 4u; c = c + 1u) {
    dst[o + c] = cs(x0, y0, c) * (1.0 - fx) * (1.0 - fy) + cs(x0 + 1, y0, c) * fx * (1.0 - fy) + cs(x0, y0 + 1, c) * (1.0 - fx) * fy + cs(x0 + 1, y0 + 1, c) * fx * fy;
  }
}`;

const DEBLUR_WGSL = `
struct P { w:u32, h:u32, strength:f32, _pad:u32 };
@group(0) @binding(0) var<storage,read> src:array<f32>;
@group(0) @binding(1) var<storage,read_write> dst:array<f32>;
@group(0) @binding(2) var<uniform> u:P;
fn cs(x:i32, y:i32, c:u32) -> f32 { let xx = clamp(x, 0, i32(u.w) - 1); let yy = clamp(y, 0, i32(u.h) - 1); return src[(u32(yy) * u.w + u32(xx)) * 4u + c]; }
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let o = (g.y * u.w + g.x) * 4u; let x = i32(g.x); let y = i32(g.y);
  let gw = array<f32,9>(1.0,2.0,1.0,2.0,4.0,2.0,1.0,2.0,1.0);
  for (var c:u32 = 0u; c < 3u; c = c + 1u) {
    var blur = 0.0; var lo = 1.0; var hi = 0.0; var k = 0;
    for (var dy:i32 = -1; dy <= 1; dy = dy + 1) { for (var dx:i32 = -1; dx <= 1; dx = dx + 1) {
      let n = cs(x + dx, y + dy, c); blur = blur + gw[k] * n; k = k + 1; if (n < lo) { lo = n; } if (n > hi) { hi = n; }
    } }
    blur = blur / 16.0; let v = src[o + c]; dst[o + c] = clamp(v + u.strength * (v - blur), lo, hi);
  }
  dst[o + 3u] = 1.0;
}`;

const DARKEN_WGSL = `
struct P { w:u32, h:u32, strength:f32, _pad:u32 };
@group(0) @binding(0) var<storage,read> src:array<f32>;
@group(0) @binding(1) var<storage,read_write> dst:array<f32>;
@group(0) @binding(2) var<uniform> u:P;
fn cs(x:i32, y:i32, c:u32) -> f32 { let xx = clamp(x, 0, i32(u.w) - 1); let yy = clamp(y, 0, i32(u.h) - 1); return src[(u32(yy) * u.w + u32(xx)) * 4u + c]; }
fn gau(x:i32, y:i32, c:u32) -> f32 { let gw = array<f32,9>(1.0,2.0,1.0,2.0,4.0,2.0,1.0,2.0,1.0); var a = 0.0; var k = 0; for (var dy:i32 = -1; dy <= 1; dy = dy + 1) { for (var dx:i32 = -1; dx <= 1; dx = dx + 1) { a = a + gw[k] * cs(x + dx, y + dy, c); k = k + 1; } } return a / 16.0; }
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let o = (g.y * u.w + g.x) * 4u; let x = i32(g.x); let y = i32(g.y);
  let rec = ${REC};
  let lv = dot(vec3<f32>(src[o], src[o+1u], src[o+2u]), rec);
  let bl = dot(vec3<f32>(gau(x,y,0u), gau(x,y,1u), gau(x,y,2u)), rec);
  let darkAmt = bl - lv;
  var f = 1.0;
  if (darkAmt > 0.0) { f = 1.0 - u.strength * clamp(darkAmt * 2.0, 0.0, 1.0); }
  dst[o] = clamp(src[o] * f, 0.0, 1.0); dst[o+1u] = clamp(src[o+1u] * f, 0.0, 1.0); dst[o+2u] = clamp(src[o+2u] * f, 0.0, 1.0); dst[o+3u] = 1.0;
}`;

// ---- JS shadows: identical flat indexing + math as the WGSL, for headless verification against the CPU reference.
const REC3 = [0.299, 0.587, 0.114], GW = [1, 2, 1, 2, 4, 2, 1, 2, 1];
function _cs(src, w, h, x, y, c) { const xx = x < 0 ? 0 : x > w - 1 ? w - 1 : x, yy = y < 0 ? 0 : y > h - 1 ? h - 1 : y; return src[(yy * w + xx) * 4 + c]; }
function shadowUpscale(src, w, h) {
    const W = w * 2, H = h * 2, dst = new Float32Array(W * H * 4);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
        const sx = (X + 0.5) * 0.5 - 0.5, sy = (Y + 0.5) * 0.5 - 0.5, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - Math.floor(sx), fy = sy - Math.floor(sy), o = (Y * W + X) * 4;
        for (let c = 0; c < 4; c++) dst[o + c] = _cs(src, w, h, x0, y0, c) * (1 - fx) * (1 - fy) + _cs(src, w, h, x0 + 1, y0, c) * fx * (1 - fy) + _cs(src, w, h, x0, y0 + 1, c) * (1 - fx) * fy + _cs(src, w, h, x0 + 1, y0 + 1, c) * fx * fy;
    }
    return { data: dst, w: W, h: H };
}
function shadowDeblur(src, w, h, strength) {
    const dst = src.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) { let blur = 0, lo = 1, hi = 0, k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = _cs(src, w, h, x + dx, y + dy, c); blur += GW[k++] * n; if (n < lo) lo = n; if (n > hi) hi = n; } blur /= 16; const v = src[o + c]; dst[o + c] = Math.max(lo, Math.min(hi, v + strength * (v - blur))); }
        dst[o + 3] = 1;
    }
    return dst;
}
function shadowDarken(src, w, h, strength) {
    const dst = src.slice();
    const gau = (x, y, c) => { let a = 0, k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += GW[k++] * _cs(src, w, h, x + dx, y + dy, c); return a / 16; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4;
        const lv = REC3[0] * src[o] + REC3[1] * src[o + 1] + REC3[2] * src[o + 2];
        const bl = REC3[0] * gau(x, y, 0) + REC3[1] * gau(x, y, 1) + REC3[2] * gau(x, y, 2);
        const darkAmt = bl - lv; let f = 1; if (darkAmt > 0) f = 1 - strength * Math.max(0, Math.min(1, darkAmt * 2));
        for (let c = 0; c < 3; c++) dst[o + c] = Math.max(0, Math.min(1, src[o + c] * f)); dst[o + 3] = 1;
    }
    return dst;
}

export { UPSCALE_WGSL, DEBLUR_WGSL, DARKEN_WGSL, shadowUpscale, shadowDeblur, shadowDarken };
if (typeof module !== "undefined" && module.exports) module.exports = { UPSCALE_WGSL, DEBLUR_WGSL, DARKEN_WGSL, shadowUpscale, shadowDeblur, shadowDarken };
