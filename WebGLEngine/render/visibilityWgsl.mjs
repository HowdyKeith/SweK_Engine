/**
 * The kernel mirror of render/visibility.mjs: a compute rasteriser writing one packed (depth | id) word per
 * pixel, resolved by atomicMin.
 *
 * *** ONE THREAD PER TRIANGLE, NOT PER PIXEL. *** A pixel-parallel rasteriser would have every thread test
 * every triangle, which is the shape that does not scale at all. One thread per triangle walking its own
 * bounding box is unbalanced across a workgroup -- a big triangle's thread outlives its neighbours -- and it is
 * the correct-and-simple form the CPU mirrors statement for statement. The imbalance is a real cost and it is
 * named here rather than hidden: a tiled binning pass is the thing that fixes it, and it is not this round.
 *
 * *** THE ATOMIC IS THE DEPTH TEST AND THE ID WRITE AT THE SAME TIME. *** See render/visibility.mjs's header
 * for why the two are packed rather than kept in two buffers: separate buffers make the id write a race, and
 * packing makes the tie-break deterministic (lower id wins) on every device.
 *
 * NO BACKTICKS IN THIS FILE'S COMMENTS: the kernel is a JS template literal and they close it.
 */
export const VISIBILITY_WGSL = `
// ID_BITS = 12, DEPTH_BITS = 20. These are DUPLICATED from render/visibility.mjs and the gate asserts they
// agree, because a packing the two mirrors disagree about is wrong on every pixel past the halfway depth and
// looks like a parity failure rather than like a constant.
const ID_BITS:u32 = 12u;
const MAX_OBJECTS:u32 = 4096u;
const DEPTH_STEPS:f32 = 1048575.0;

struct P { w:u32, h:u32, triCount:u32, pad:u32, z0:f32, z1:f32, p2:f32, p3:f32 };
@group(0) @binding(0) var<storage,read> positions:array<f32>;
@group(0) @binding(1) var<storage,read> indices:array<u32>;
@group(0) @binding(2) var<storage,read> triObject:array<u32>;
@group(0) @binding(3) var<storage,read> mvps:array<mat4x4<f32>>;
@group(0) @binding(4) var<storage,read_write> words:array<atomic<u32>>;
@group(0) @binding(5) var<uniform> u:P;
// rejected[0] counts triangles refused for crossing the eye -- v4591's rule, an uncounted quantity reported as
// zero is worse than not reported, so the refusal is a number the caller can read rather than a silent skip.
@group(0) @binding(6) var<storage,read_write> rejected:array<atomic<u32>>;

fn packKey(depth01:f32, id:u32) -> u32 {
  let d = clamp(depth01, 0.0, 1.0);
  let key = u32(floor(d * DEPTH_STEPS));
  // the shift the JS mirror has to spell as a multiply, because JS << is SIGNED 32-bit
  return (key << ID_BITS) | id;
}

@compute @workgroup_size(64,1,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  let t = g.x;
  if (t >= u.triCount) { return; }
  let id = triObject[t];
  let m = mvps[id];

  var sx:array<f32,3>;
  var sy:array<f32,3>;
  var sz:array<f32,3>;
  for (var k:u32 = 0u; k < 3u; k = k + 1u) {
    let v = indices[t * 3u + k] * 3u;
    let c = m * vec4<f32>(positions[v], positions[v + 1u], positions[v + 2u], 1.0);
    // NO CLIPPING: a vertex on or behind the eye rejects the WHOLE triangle, and the rejection is counted
    if (!(c.w > 0.0)) { atomicAdd(&rejected[0], 1u); return; }
    let nx = c.x / c.w;
    let ny = c.y / c.w;
    sx[k] = (nx + 1.0) * 0.5 * f32(u.w);
    sy[k] = (1.0 - ny) * 0.5 * f32(u.h);
    sz[k] = (c.z / c.w - u.z0) / (u.z1 - u.z0);
  }

  let area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sy[1] - sy[0]) * (sx[2] - sx[0]);
  if (area == 0.0) { return; }
  let inv = 1.0 / area;

  let bx0 = max(0, i32(floor(min(min(sx[0], sx[1]), sx[2]))));
  let bx1 = min(i32(u.w) - 1, i32(ceil(max(max(sx[0], sx[1]), sx[2]))));
  let by0 = max(0, i32(floor(min(min(sy[0], sy[1]), sy[2]))));
  let by1 = min(i32(u.h) - 1, i32(ceil(max(max(sy[0], sy[1]), sy[2]))));

  for (var y:i32 = by0; y <= by1; y = y + 1) {
    for (var x:i32 = bx0; x <= bx1; x = x + 1) {
      let px = f32(x) + 0.5;
      let py = f32(y) + 0.5;
      let w0 = ((sx[2] - sx[1]) * (py - sy[1]) - (sy[2] - sy[1]) * (px - sx[1])) * inv;
      let w1 = ((sx[0] - sx[2]) * (py - sy[2]) - (sy[0] - sy[2]) * (px - sx[2])) * inv;
      let w2 = ((sx[1] - sx[0]) * (py - sy[0]) - (sy[1] - sy[0]) * (px - sx[0])) * inv;
      if (w0 < 0.0 || w1 < 0.0 || w2 < 0.0) { continue; }
      // z/w is LINEAR in screen space, which is what makes a z-buffer work: no perspective correction here
      let d = w0 * sz[0] + w1 * sz[1] + w2 * sz[2];
      let i = u32(y) * u.w + u32(x);
      atomicMin(&words[i], packKey(d, id));
    }
  }
}`;
