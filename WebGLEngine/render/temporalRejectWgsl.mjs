// render/temporalRejectWgsl.mjs -- the WGSL half of render/temporalReject.mjs, mirroring it statement by
// statement over flat buffers in the shape gfx/device.js runs. Two kernels because the module has two stages
// and a mirror that fused them could not be told apart from a CPU that fused them differently.
//
// The YCoCg transform is written with the same negative-power-of-two coefficients as the JS, so the round trip
// is exact on the device too and the parity row is measuring the pass rather than the colour space.
"use strict";

const YCOCG_WGSL = `
fn rgb2ycocg(c:vec3<f32>) -> vec3<f32> {
  return vec3<f32>(0.25*c.r + 0.5*c.g + 0.25*c.b, 0.5*c.r - 0.5*c.b, -0.25*c.r + 0.5*c.g - 0.25*c.b);
}
fn ycocg2rgb(c:vec3<f32>) -> vec3<f32> {
  let t = c.x - c.z;
  return vec3<f32>(t + c.y, c.x + c.z, t - c.y);
}`;

// ---- DISOCCLUSION: was this surface hidden last frame? ------------------------------------------------------
const DISOCCLUSION_WGSL = `
struct P { w:u32, h:u32, threshold:f32, nearerIsLess:u32 };
@group(0) @binding(0) var<storage,read> motion:array<f32>;
@group(0) @binding(1) var<storage,read> prevDepth:array<f32>;
@group(0) @binding(2) var<storage,read_write> dst:array<f32>;
@group(0) @binding(3) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  let o = i * 4u;
  if (motion[o + 2u] == 0.0) { dst[i] = 1.0; return; }          // no reprojection at all
  let uu = (f32(g.x) + 0.5) / f32(u.w) + motion[o];
  let vv = (f32(g.y) + 0.5) / f32(u.h) + motion[o + 1u];
  if (uu < 0.0 || uu >= 1.0 || vv < 0.0 || vv >= 1.0) { dst[i] = 1.0; return; }
  let px = u32(clamp(floor(uu * f32(u.w)), 0.0, f32(u.w) - 1.0));
  let py = u32(clamp(floor(vv * f32(u.h)), 0.0, f32(u.h) - 1.0));
  let was = prevDepth[py * u.w + px];
  let expect = motion[o + 3u];
  // "nearer than expected by more than the threshold" -- the sign is the whole test
  let gap = select(was - expect, expect - was, u.nearerIsLess != 0u);
  dst[i] = select(0.0, 1.0, gap > u.threshold);
}`;

// ---- RECTIFIED ACCUMULATE: reproject, clamp in the chosen space, blend by the history factor ----------------
const RECTIFY_WGSL = `
struct P { w:u32, h:u32, alpha:f32, flags:u32 };
@group(0) @binding(0) var<storage,read> cur:array<f32>;
@group(0) @binding(1) var<storage,read> hist:array<f32>;
@group(0) @binding(2) var<storage,read> motion:array<f32>;
@group(0) @binding(3) var<storage,read> factor:array<f32>;
@group(0) @binding(4) var<storage,read_write> dst:array<f32>;
@group(0) @binding(5) var<uniform> u:P;

const FLAG_YCOCG    : u32 = 1u;
const FLAG_CLAMP    : u32 = 2u;
const FLAG_HAS_HIST : u32 = 4u;
const FLAG_HAS_FAC  : u32 = 8u;
${YCOCG_WGSL}

fn curAt(x:i32, y:i32, w:u32, h:u32) -> vec3<f32> {
  let xx = u32(clamp(x, 0, i32(w) - 1));
  let yy = u32(clamp(y, 0, i32(h) - 1));
  let o = (yy * w + xx) * 4u;
  return vec3<f32>(cur[o], cur[o + 1u], cur[o + 2u]);
}

fn histBilinear(uu:f32, vv:f32, w:u32, h:u32) -> vec3<f32> {
  let x = uu * f32(w) - 0.5;
  let y = vv * f32(h) - 0.5;
  let x0 = floor(x); let y0 = floor(y);
  let fx = x - x0;   let fy = y - y0;
  var out = vec3<f32>(0.0);
  for (var dy:i32 = 0; dy <= 1; dy = dy + 1) {
    for (var dx:i32 = 0; dx <= 1; dx = dx + 1) {
      let xx = u32(clamp(i32(x0) + dx, 0, i32(w) - 1));
      let yy = u32(clamp(i32(y0) + dy, 0, i32(h) - 1));
      let o = (yy * w + xx) * 4u;
      let wx = select(1.0 - fx, fx, dx == 1);
      let wy = select(1.0 - fy, fy, dy == 1);
      out = out + vec3<f32>(hist[o], hist[o + 1u], hist[o + 2u]) * wx * wy;
    }
  }
  return out;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  let o = i * 4u;
  let c = vec3<f32>(cur[o], cur[o + 1u], cur[o + 2u]);
  var val = c;

  if ((u.flags & FLAG_HAS_HIST) != 0u) {
    let uu = (f32(g.x) + 0.5) / f32(u.w);
    let vv = (f32(g.y) + 0.5) / f32(u.h);
    let hu = uu + motion[o];
    let hv = vv + motion[o + 1u];
    let usable = motion[o + 2u] != 0.0 && hu >= 0.0 && hu < 1.0 && hv >= 0.0 && hv < 1.0;
    if (usable) {
      var hs = histBilinear(hu, hv, u.w, u.h);
      if ((u.flags & FLAG_CLAMP) != 0u) {
        let yc = (u.flags & FLAG_YCOCG) != 0u;
        var hv3 = select(hs, rgb2ycocg(hs), yc);
        var lo = vec3<f32>( 1.0e9);
        var hi = vec3<f32>(-1.0e9);
        for (var dy:i32 = -1; dy <= 1; dy = dy + 1) {
          for (var dx:i32 = -1; dx <= 1; dx = dx + 1) {
            let s0 = curAt(i32(g.x) + dx, i32(g.y) + dy, u.w, u.h);
            let s = select(s0, rgb2ycocg(s0), yc);
            lo = min(lo, s);
            hi = max(hi, s);
          }
        }
        hv3 = clamp(hv3, lo, hi);
        hs = select(hv3, ycocg2rgb(hv3), yc);
      }
      let f = select(1.0, clamp(factor[i], 0.0, 1.0), (u.flags & FLAG_HAS_FAC) != 0u);
      let a = 1.0 - (1.0 - u.alpha) * f;
      val = hs * (1.0 - a) + c * a;
    }
  }

  dst[o] = val.x; dst[o + 1u] = val.y; dst[o + 2u] = val.z; dst[o + 3u] = 1.0;
}`;

export { DISOCCLUSION_WGSL, RECTIFY_WGSL, YCOCG_WGSL };
