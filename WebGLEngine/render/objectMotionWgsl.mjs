// render/objectMotionWgsl.mjs -- the WGSL half of render/objectMotion.mjs, mirroring it statement by statement
// over flat buffers in the shape gfx/device.js runs. Read that module's header first: the four conventions and
// the reason the unproject/reproject stays in two steps are all stated there and none of them are restated here.
"use strict";

const OBJECT_MOTION_WGSL = `
struct P { w:u32, h:u32, count:u32, invalidTo:f32 };
@group(0) @binding(0) var<storage,read> depth:array<f32>;
@group(0) @binding(1) var<storage,read> ids:array<u32>;
@group(0) @binding(2) var<storage,read> invMVPCur:array<mat4x4<f32>>;
@group(0) @binding(3) var<storage,read> mvpPrev:array<mat4x4<f32>>;
@group(0) @binding(4) var<storage,read_write> dst:array<f32>;
@group(0) @binding(5) var<uniform> u:P;

fn writeInvalid(o:u32) {
  dst[o] = u.invalidTo; dst[o + 1u] = u.invalidTo; dst[o + 2u] = 0.0; dst[o + 3u] = u.invalidTo;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  let o = i * 4u;

  let uu = (f32(g.x) + 0.5) / f32(u.w);
  let vv = (f32(g.y) + 0.5) / f32(u.h);
  let id = ids[i];

  // an id off the end of the table is REJECTED, not clamped: clamping would hand the pixel the first object's
  // motion, which is a well-formed vector for the wrong surface
  if (id >= u.count) { writeInvalid(o); return; }

  let nx = 2.0 * uu - 1.0;
  let ny = 1.0 - 2.0 * vv;
  let p = invMVPCur[id] * vec4<f32>(nx, ny, depth[i], 1.0);
  if (p.w == 0.0) { writeInvalid(o); return; }

  // OBJECT space: the inverse carried the model matrix, so this is the point on the object -- the thing that
  // does not change when the object moves
  let obj = p.xyz / p.w;
  let q = mvpPrev[id] * vec4<f32>(obj, 1.0);
  if (q.w <= 0.0) { writeInvalid(o); return; }

  let pu = (q.x / q.w + 1.0) * 0.5;
  let pv = (1.0 - q.y / q.w) * 0.5;
  dst[o] = pu - uu;
  dst[o + 1u] = pv - vv;
  dst[o + 2u] = 1.0;
  dst[o + 3u] = q.z / q.w;
}`;

export { OBJECT_MOTION_WGSL };
