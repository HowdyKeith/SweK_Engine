// render/motionVectorsWgsl.mjs -- the WGSL half of render/motionVectors.mjs, mirroring motionVectorsCPU statement by
// statement over flat buffers, in the shape gfx/device.js runs: depth in, (du, dv, valid, 0) out, matrices in a
// uniform. Every convention is the module's; read its header before changing a sign here.
"use strict";

const MOTION_WGSL = `
struct P { invVPCur : mat4x4<f32>, vpPrev : mat4x4<f32>, dims : vec4<u32> };
@group(0) @binding(0) var<storage,read> depth:array<f32>;
@group(0) @binding(1) var<storage,read_write> dst:array<f32>;
@group(0) @binding(2) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  let w = u.dims.x; let h = u.dims.y;
  if (g.x >= w || g.y >= h) { return; }
  let i = g.y * w + g.x;
  let o = i * 4u;

  let uu = (f32(g.x) + 0.5) / f32(w);
  let vv = (f32(g.y) + 0.5) / f32(h);
  let d = depth[i];

  // uv -> ndc (y flips: uv runs down, clip runs up), then ndc -> world through the CURRENT inverse
  let ndc = vec4<f32>(2.0 * uu - 1.0, 1.0 - 2.0 * vv, d, 1.0);
  let p = u.invVPCur * ndc;
  if (p.w == 0.0) { dst[o] = 0.0; dst[o + 1u] = 0.0; dst[o + 2u] = 0.0; dst[o + 3u] = 0.0; return; }
  let world = vec4<f32>(p.xyz / p.w, 1.0);

  // that world point, through LAST frame's view-projection
  let q = u.vpPrev * world;
  if (q.w <= 0.0) { dst[o] = 0.0; dst[o + 1u] = 0.0; dst[o + 2u] = 0.0; dst[o + 3u] = 0.0; return; }
  let pu = (q.x / q.w + 1.0) * 0.5;
  let pv = (1.0 - q.y / q.w) * 0.5;

  dst[o] = pu - uu;
  dst[o + 1u] = pv - vv;
  dst[o + 2u] = 1.0;
  dst[o + 3u] = q.z / q.w;   // zPrev -- the depth this surface would have had last frame; disocclusion is one subtraction from it
}`;

export { MOTION_WGSL };
