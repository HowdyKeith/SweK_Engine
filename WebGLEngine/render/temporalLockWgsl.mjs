// render/temporalLockWgsl.mjs -- the WGSL half of render/temporalLock.mjs, mirroring it statement by statement
// over flat buffers in the shape gfx/device.js runs.
//
// Three kernels because the module has three stages and a mirror that fused them could not be told apart from
// a CPU that fused them differently: push the ring (with the reprojection, which is the part most likely to be
// left out), read the shading shift out of it, and find the ridges in its jitter-free mean.
"use strict";

const LUMA_WGSL = `
fn lumaOf(c:vec3<f32>) -> f32 { return 0.25*c.r + 0.5*c.g + 0.25*c.b; }`;

// ---- PUSH: reproject the ring, then append this frame's luma ------------------------------------------------
const RING_PUSH_WGSL = `
struct P { w:u32, h:u32, period:u32, first:u32 };
@group(0) @binding(0) var<storage,read> cur:array<f32>;
@group(0) @binding(1) var<storage,read> motion:array<f32>;
@group(0) @binding(2) var<storage,read> ringIn:array<f32>;
@group(0) @binding(3) var<storage,read> filledIn:array<f32>;
@group(0) @binding(4) var<storage,read_write> ringOut:array<f32>;
@group(0) @binding(5) var<storage,read_write> filledOut:array<f32>;
@group(0) @binding(6) var<uniform> u:P;
${LUMA_WGSL}

// bilinear over slot k of a ring stored as [pixel][slot]
fn ringAt(uu:f32, vv:f32, k:u32, F:u32) -> f32 {
  let x = uu * f32(u.w) - 0.5;
  let y = vv * f32(u.h) - 0.5;
  let x0 = floor(x); let y0 = floor(y);
  let fx = x - x0;   let fy = y - y0;
  var acc = 0.0;
  for (var dy:i32 = 0; dy <= 1; dy = dy + 1) {
    for (var dx:i32 = 0; dx <= 1; dx = dx + 1) {
      let xx = u32(clamp(i32(x0) + dx, 0, i32(u.w) - 1));
      let yy = u32(clamp(i32(y0) + dy, 0, i32(u.h) - 1));
      let wx = select(1.0 - fx, fx, dx == 1);
      let wy = select(1.0 - fy, fy, dy == 1);
      acc = acc + ringIn[(yy * u.w + xx) * F + k] * wx * wy;
    }
  }
  return acc;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  let o = i * 4u;
  let F = u.period * 2u;
  let l = lumaOf(vec3<f32>(cur[o], cur[o + 1u], cur[o + 2u]));

  let uu = (f32(g.x) + 0.5) / f32(u.w);
  let vv = (f32(g.y) + 0.5) / f32(u.h);
  let hu = uu + motion[o];
  let hv = vv + motion[o + 1u];
  let usable = u.first == 0u && motion[o + 2u] != 0.0 && hu >= 0.0 && hu < 1.0 && hv >= 0.0 && hv < 1.0;

  if (!usable) {
    for (var k:u32 = 0u; k < F; k = k + 1u) { ringOut[i * F + k] = l; }
    filledOut[i] = 0.0;
    return;
  }
  // *** THE REPROJECTION, WHICH IS THE PART A MIRROR MOST EASILY DROPS. *** A ring indexed by screen position
  // holds, for a moving camera, whatever surface happened to sit at that pixel.
  for (var k:u32 = 0u; k < F - 1u; k = k + 1u) { ringOut[i * F + k] = ringAt(hu, hv, k + 1u, F); }
  ringOut[i * F + F - 1u] = l;
  let px = u32(clamp(round(hu * f32(u.w) - 0.5), 0.0, f32(u.w) - 1.0));
  let py = u32(clamp(round(hv * f32(u.h) - 0.5), 0.0, f32(u.h) - 1.0));
  filledOut[i] = min(255.0, filledIn[py * u.w + px] + 1.0);
}`;

// ---- SHIFT: the newer period's mean against the older period's ----------------------------------------------
const SHADING_SHIFT_WGSL = `
struct P { w:u32, h:u32, period:u32, pad:u32, scale:f32, strength:f32, p2:f32, p3:f32 };
@group(0) @binding(0) var<storage,read> ring:array<f32>;
@group(0) @binding(1) var<storage,read> filled:array<f32>;
@group(0) @binding(2) var<storage,read_write> dst:array<f32>;
@group(0) @binding(3) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  let P = u.period;
  let F = P * 2u;
  // a ring that is not yet full is UNKNOWN, not clean -- an absence read as a pass is v4402's fault
  if (filled[i] < f32(F)) { dst[i] = 0.0; return; }
  var older = 0.0;
  var newer = 0.0;
  for (var k:u32 = 0u; k < P; k = k + 1u) { older = older + ring[i * F + k]; }
  for (var k:u32 = P; k < F; k = k + 1u) { newer = newer + ring[i * F + k]; }
  older = older / f32(P);
  newer = newer / f32(P);
  // both halves span the SAME jitter phases, so the jitter cancels in the difference exactly
  dst[i] = clamp(u.strength * abs(newer - older) / max(u.scale, 1.0e-8), 0.0, 1.0);
}`;

// ---- RIDGES: a strict luma extremum along either axis, over the ring's jitter-free mean ----------------------
const RIDGE_WGSL = `
struct P { w:u32, h:u32, period:u32, pad:u32, margin:f32, p1:f32, p2:f32, p3:f32 };
@group(0) @binding(0) var<storage,read> ring:array<f32>;
@group(0) @binding(1) var<storage,read_write> dst:array<f32>;
@group(0) @binding(2) var<uniform> u:P;

fn meanAt(i:u32) -> f32 {
  let P = u.period;
  let F = P * 2u;
  var m = 0.0;
  for (var k:u32 = P; k < F; k = k + 1u) { m = m + ring[i * F + k]; }
  return m / f32(P);
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  if (g.x == 0u || g.y == 0u || g.x + 1u >= u.w || g.y + 1u >= u.h) { dst[i] = 0.0; return; }
  let c = meanAt(i);
  let l = meanAt(i - 1u);
  let r = meanAt(i + 1u);
  let up = meanAt(i - u.w);
  let dn = meanAt(i + u.w);
  // thin in ONE direction is what thin means -- a strict 3x3 extremum finds nothing on a straight line
  let ridgeX = (c - l > u.margin && c - r > u.margin) || (l - c > u.margin && r - c > u.margin);
  let ridgeY = (c - up > u.margin && c - dn > u.margin) || (up - c > u.margin && dn - c > u.margin);
  dst[i] = select(0.0, 1.0, ridgeX || ridgeY);
}`;

// ---- FIELD RIDGES: the same test over a PLAIN scalar field (depth), optionally ANDed with a mask ----------
//
// RIDGE_WGSL above runs the test over a ring's jitter-free mean; this runs it over a field the caller already
// has. One test, two entry points, mirroring the CPU where lockCandidatesFromRing and depthRidgesCPU both call
// ridgesCPU. The optional mask is the whole depth-gated lock in one dispatch: ridge(depth) AND lumaRidges.
const FIELD_RIDGE_WGSL = `
struct P { w:u32, h:u32, useMask:u32, pad:u32, margin:f32, p1:f32, p2:f32, p3:f32 };
@group(0) @binding(0) var<storage,read> field:array<f32>;
@group(0) @binding(1) var<storage,read> mask:array<f32>;
@group(0) @binding(2) var<storage,read_write> dst:array<f32>;
@group(0) @binding(3) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  if (g.x == 0u || g.y == 0u || g.x + 1u >= u.w || g.y + 1u >= u.h) { dst[i] = 0.0; return; }
  let c = field[i];
  let l = field[i - 1u];
  let r = field[i + 1u];
  let up = field[i - u.w];
  let dn = field[i + u.w];
  // thin in ONE direction. A silhouette edge differs from one side only and is NOT a ridge, which is the
  // whole reason this is a ridge test rather than a depth-discontinuity test.
  let ridgeX = (c - l > u.margin && c - r > u.margin) || (l - c > u.margin && r - c > u.margin);
  let ridgeY = (c - up > u.margin && c - dn > u.margin) || (up - c > u.margin && dn - c > u.margin);
  var v = select(0.0, 1.0, ridgeX || ridgeY);
  // AND, not OR: an OR would union the luma detector's false positives back in
  if (u.useMask != 0u) { v = v * select(0.0, 1.0, mask[i] > 0.5); }
  dst[i] = v;
}`;

export { RING_PUSH_WGSL, SHADING_SHIFT_WGSL, RIDGE_WGSL, FIELD_RIDGE_WGSL, LUMA_WGSL };
