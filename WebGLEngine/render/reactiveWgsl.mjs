/**
 * The kernel mirror of render/reactive.mjs. Same gate, same sampler, same refusals.
 *
 * *** THE DEPTH GATE IS THE WHOLE DESIGN AND IT IS THE PART A MIRROR MOST EASILY DROPS. *** Without it this
 * fires wherever the surface changed, which is a disocclusion reported under another name and multiplied into
 * the factor twice. The gate's sign is the caller's `nearerIsLess`, exactly as DISOCCLUSION_WGSL's is.
 *
 * NO BACKTICKS IN THIS FILE'S COMMENTS: the kernel is a JS template literal and they close it.
 */
export const REACTIVE_WGSL = `
struct P { w:u32, h:u32, hasHistory:u32, nearerIsLess:u32, threshold:f32, scale:f32, strength:f32, p3:f32 };
@group(0) @binding(0) var<storage,read> cur:array<f32>;
@group(0) @binding(1) var<storage,read> hist:array<f32>;
@group(0) @binding(2) var<storage,read> motion:array<f32>;
@group(0) @binding(3) var<storage,read> prevDepth:array<f32>;
@group(0) @binding(4) var<storage,read_write> dst:array<f32>;
@group(0) @binding(5) var<uniform> u:P;

fn at3(uu:f32, vv:f32) -> vec3<f32> {
  let x = uu * f32(u.w) - 0.5;
  let y = vv * f32(u.h) - 0.5;
  let x0 = floor(x); let y0 = floor(y);
  let fx = x - x0;   let fy = y - y0;
  var acc = vec3<f32>(0.0, 0.0, 0.0);
  for (var dy:i32 = 0; dy <= 1; dy = dy + 1) {
    for (var dx:i32 = 0; dx <= 1; dx = dx + 1) {
      let xx = u32(clamp(i32(x0) + dx, 0, i32(u.w) - 1));
      let yy = u32(clamp(i32(y0) + dy, 0, i32(u.h) - 1));
      let o = (yy * u.w + xx) * 4u;
      let wx = select(1.0 - fx, fx, dx == 1);
      let wy = select(1.0 - fy, fy, dy == 1);
      acc = acc + vec3<f32>(hist[o], hist[o + 1u], hist[o + 2u]) * wx * wy;
    }
  }
  return acc;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  let o = i * 4u;
  dst[i] = 0.0;
  // frame one has nothing to disagree with, and 0 is the answer -- NOT 1. The disocclusion mask already
  // writes 1 for a pixel with no history; writing it here too multiplies one reason into the factor twice.
  if (u.hasHistory == 0u) { return; }
  if (motion[o + 2u] == 0.0) { return; }

  let uu = (f32(g.x) + 0.5) / f32(u.w) + motion[o];
  let vv = (f32(g.y) + 0.5) / f32(u.h) + motion[o + 1u];
  if (uu < 0.0 || uu >= 1.0 || vv < 0.0 || vv >= 1.0) { return; }

  // THE DEPTH GATE. Where the surface genuinely changed, this is disocclusion's business and not ours.
  let px = u32(clamp(floor(uu * f32(u.w)), 0.0, f32(u.w) - 1.0));
  let py = u32(clamp(floor(vv * f32(u.h)), 0.0, f32(u.h) - 1.0));
  let was = prevDepth[py * u.w + px];
  let expect = motion[o + 3u];
  let gap = select(was - expect, expect - was, u.nearerIsLess != 0u);
  if (gap > u.threshold) { return; }

  let hc = at3(uu, vv);
  // all three channels: a particle can be chromatic without moving the luma at all, which is the case the
  // luma ring in render/temporalLock.mjs cannot see
  let d = max(max(abs(cur[o] - hc.x), abs(cur[o + 1u] - hc.y)), abs(cur[o + 2u] - hc.z));
  dst[i] = clamp(u.strength * d / u.scale, 0.0, 1.0);
}`;
