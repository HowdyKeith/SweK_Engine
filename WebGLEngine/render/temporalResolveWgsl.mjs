// render/temporalResolveWgsl.mjs -- the WGSL half of render/temporalResolve.mjs, mirroring it statement by statement
// over flat buffers in the shape gfx/device.js runs. The subtraction that makes it jitter-aware is one line in
// main(); read that module's header before touching it.
"use strict";

const RESOLVE_WGSL = `
struct P { rw:u32, rh:u32, dw:u32, dh:u32, jx:f32, jy:f32, flags:u32, pad:u32 };
@group(0) @binding(0) var<storage,read> src:array<f32>;
@group(0) @binding(1) var<storage,read_write> dst:array<f32>;
@group(0) @binding(2) var<storage,read_write> conf:array<f32>;
@group(0) @binding(3) var<uniform> u:P;

const FLAG_JITTER_AWARE : u32 = 1u;
const FLAG_DERING       : u32 = 2u;
const PI : f32 = 3.14159265358979323846;

// Lanczos2: one at 0, zero at every other integer, zero beyond 2 -- which is why a 3x3 footprint is enough
fn lanczos2(x:f32) -> f32 {
  let ax = abs(x);
  if (ax < 1.0e-4) { return 1.0; }
  if (ax >= 2.0) { return 0.0; }
  let px = PI * ax;
  return 2.0 * sin(px) * sin(px * 0.5) / (px * px);
}

fn ld(x:i32, y:i32) -> vec3<f32> {
  let xx = u32(clamp(x, 0, i32(u.rw) - 1));
  let yy = u32(clamp(y, 0, i32(u.rh) - 1));
  let o = (yy * u.rw + xx) * 4u;
  return vec3<f32>(src[o], src[o + 1u], src[o + 2u]);
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.dw || g.y >= u.dh) { return; }
  let uu = (f32(g.x) + 0.5) / f32(u.dw);
  let vv = (f32(g.y) + 0.5) / f32(u.dh);

  // *** THE ONE SUBTRACTION. *** the display pixel in RENDER texel-index space, shifted to where the samples
  // actually landed this phase; without the jitter term the weights measure to the texel grid instead
  let aware = select(0.0, 1.0, (u.flags & FLAG_JITTER_AWARE) != 0u);
  let sx = uu * f32(u.rw) - 0.5 - aware * u.jx;
  let sy = vv * f32(u.rh) - 0.5 - aware * u.jy;
  let bx = i32(round(sx));
  let by = i32(round(sy));

  var wsum = 0.0;
  var csum = vec3<f32>(0.0);
  var lo = vec3<f32>(1.0e9);
  var hi = vec3<f32>(-1.0e9);
  for (var dy:i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx:i32 = -1; dx <= 1; dx = dx + 1) {
      let w = lanczos2(sx - f32(bx + dx)) * lanczos2(sy - f32(by + dy));
      let s = ld(bx + dx, by + dy);
      wsum = wsum + w;
      csum = csum + s * w;
      lo = min(lo, s);
      hi = max(hi, s);
    }
  }
  var val = csum / select(1.0e-4, wsum, abs(wsum) > 1.0e-4);
  // Lanczos2's lobes go NEGATIVE, so the weighted sum can leave the range of its own taps; the box stops the ring
  if ((u.flags & FLAG_DERING) != 0u) { val = clamp(val, lo, hi); }

  let o = (g.y * u.dw + g.x) * 4u;
  dst[o] = val.x; dst[o + 1u] = val.y; dst[o + 2u] = val.z; dst[o + 3u] = 1.0;

  // how near a real sample landed on this display pixel: 1 when one landed on it, floored at 0.25
  let d = length(vec2<f32>(sx - f32(bx), sy - f32(by)));
  conf[g.y * u.dw + g.x] = clamp(1.0 - d, 0.25, 1.0);
}`;

export { RESOLVE_WGSL };
