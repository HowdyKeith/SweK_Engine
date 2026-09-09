// render/temporalAccumulateWgsl.mjs -- the WGSL half of render/temporalAccumulate.mjs, mirroring it statement by
// statement over flat buffers in the shape gfx/device.js runs. Read that module's header before changing anything
// here; the conventions (uv, the motion vector's sign, the first-frame rule) are all stated there.
"use strict";

const ACCUMULATE_WGSL = `
struct P { w:u32, h:u32, flags:u32, alpha:f32 };
@group(0) @binding(0) var<storage,read> current:array<f32>;
@group(0) @binding(1) var<storage,read> history:array<f32>;
@group(0) @binding(2) var<storage,read> motion:array<f32>;
@group(0) @binding(3) var<storage,read_write> dst:array<f32>;
@group(0) @binding(4) var<uniform> u:P;

const FLAG_HAS_HISTORY : u32 = 1u;
const FLAG_CLAMP       : u32 = 2u;

fn texel(buf_index:u32, c:u32) -> f32 { return history[buf_index * 4u + c]; }

fn curAt(x:i32, y:i32, c:u32) -> f32 {
  let xx = u32(clamp(x, 0, i32(u.w) - 1));
  let yy = u32(clamp(y, 0, i32(u.h) - 1));
  return current[(yy * u.w + xx) * 4u + c];
}

/** bilinear sample of the history at a uv, edge-clamped -- the reprojection lands between texels */
fn histBilinear(uu:f32, vv:f32) -> vec3<f32> {
  let x = uu * f32(u.w) - 0.5;
  let y = vv * f32(u.h) - 0.5;
  let x0 = i32(floor(x)); let y0 = i32(floor(y));
  let fx = x - floor(x); let fy = y - floor(y);
  var acc = vec3<f32>(0.0);
  for (var c:u32 = 0u; c < 3u; c = c + 1u) {
    let xa = u32(clamp(x0, 0, i32(u.w) - 1));      let ya = u32(clamp(y0, 0, i32(u.h) - 1));
    let xb = u32(clamp(x0 + 1, 0, i32(u.w) - 1));  let yb = u32(clamp(y0 + 1, 0, i32(u.h) - 1));
    let v00 = texel(ya * u.w + xa, c); let v10 = texel(ya * u.w + xb, c);
    let v01 = texel(yb * u.w + xa, c); let v11 = texel(yb * u.w + xb, c);
    let s = v00 * (1.0 - fx) * (1.0 - fy) + v10 * fx * (1.0 - fy) + v01 * (1.0 - fx) * fy + v11 * fx * fy;
    if (c == 0u) { acc.x = s; } else if (c == 1u) { acc.y = s; } else { acc.z = s; }
  }
  return acc;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  let o = i * 4u;
  let cur = vec3<f32>(current[o], current[o + 1u], current[o + 2u]);

  // the honest first frame: no history means the current frame, not a blend with zeros
  if ((u.flags & FLAG_HAS_HISTORY) == 0u) {
    dst[o] = cur.x; dst[o + 1u] = cur.y; dst[o + 2u] = cur.z; dst[o + 3u] = current[o + 3u];
    return;
  }

  let uu = (f32(g.x) + 0.5) / f32(u.w);
  let vv = (f32(g.y) + 0.5) / f32(u.h);
  let du = motion[o]; let dv = motion[o + 1u]; let valid = motion[o + 2u];
  let hu = uu + du; let hv = vv + dv;

  // no history for this surface: it was invalid, or it was off screen last frame
  if (valid == 0.0 || hu < 0.0 || hu >= 1.0 || hv < 0.0 || hv >= 1.0) {
    dst[o] = cur.x; dst[o + 1u] = cur.y; dst[o + 2u] = cur.z; dst[o + 3u] = current[o + 3u];
    return;
  }

  var hist = histBilinear(hu, hv);

  if ((u.flags & FLAG_CLAMP) != 0u) {
    // the CURRENT frame's 3x3 bounds what a believable history sample can be -- a sample outside it is history of
    // something else, which is what ghosting is
    let x = i32(g.x); let y = i32(g.y);
    for (var c:u32 = 0u; c < 3u; c = c + 1u) {
      var lo = curAt(x - 1, y - 1, c); var hi = lo;
      for (var dy:i32 = -1; dy <= 1; dy = dy + 1) {
        for (var dx:i32 = -1; dx <= 1; dx = dx + 1) {
          let s = curAt(x + dx, y + dy, c);
          lo = min(lo, s); hi = max(hi, s);
        }
      }
      if (c == 0u) { hist.x = clamp(hist.x, lo, hi); }
      else if (c == 1u) { hist.y = clamp(hist.y, lo, hi); }
      else { hist.z = clamp(hist.z, lo, hi); }
    }
  }

  let outc = hist * (1.0 - u.alpha) + cur * u.alpha;
  dst[o] = outc.x; dst[o + 1u] = outc.y; dst[o + 2u] = outc.z; dst[o + 3u] = 1.0;
}`;

export { ACCUMULATE_WGSL };
