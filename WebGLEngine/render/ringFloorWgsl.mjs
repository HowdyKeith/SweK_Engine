/**
 * The kernel mirror of render/ringFloor.mjs. Same identity, same derived depth, same regime test.
 *
 * *** THE MIRROR IS PINNED BY A PARITY ROW BECAUSE v4559 SHOWED WHAT AN UNPINNED ONE COSTS: *** the ring's
 * fill index drifted from the CPU's for six rounds and cost a full 8.6e-1 of contrast on pixel-scale
 * content, because every device row in the arc drove smooth content, an integer speed or a still camera.
 * There are no ties here -- floor appears once, on the same expression both sides -- but the parity row does
 * not depend on my believing that.
 *
 * The kernel writes the PER-PIXEL floor and the reduction to the frame-wide worst is the caller's. That is
 * not laziness: a parity row on the per-pixel field is strictly stronger than one on a single reduced
 * number, which can agree by cancellation.
 */
export const RING_FLOOR_WGSL = `
// windowPhase is 0 for the frame form and 1 for the window form. A caller that zeroes the uniform gets the
// frame form, which is what every caller before v4569 wrote, so their numbers are unchanged.
struct P { w:u32, h:u32, period:u32, windowPhase:u32, tau:f32, p1:f32, p2:f32, p3:f32 };
@group(0) @binding(0) var<storage,read> luma:array<f32>;
@group(0) @binding(1) var<storage,read> motion:array<f32>;
@group(0) @binding(2) var<storage,read_write> dst:array<f32>;
@group(0) @binding(3) var<uniform> u:P;
// *** THE RING ITSELF, WHICH THE FRAME FORM NEVER NEEDED AND THE WINDOW FORM CANNOT DO WITHOUT (v4569). ***
// v4565 measured the geometric step bound BELOW the error actually present at 70-86% of step-branch pixels
// on an edge that had swept past: the current frame's stencil is flat there and the error is in the history.
// The history is this buffer, already in device memory because RING_PUSH_WGSL wrote it.
@group(0) @binding(4) var<storage,read> ring:array<f32>;

// second differences either side of the tap interval, the local step, and the range that normalises the
// regime test -- the range is the only local scale that does not vanish on a smooth field
fn d2a_of(i:u32, s:u32) -> f32 { return luma[i - s] - 2.0 * luma[i] + luma[i + s]; }
fn d2b_of(i:u32, s:u32) -> f32 { return luma[i] - 2.0 * luma[i + s] + luma[i + 2u * s]; }
fn range_of(i:u32, s:u32) -> f32 {
  var lo = luma[i - 2u * s]; var hi = lo;
  for (var k:i32 = -1; k <= 2; k = k + 1) {
    let q = luma[u32(i32(i) + k * i32(s))];
    lo = min(lo, q); hi = max(hi, q);
  }
  return hi - lo;
}
// the scale the arithmetic floor is relative to -- an HDR caller's values are not in 0..1
fn mag_of(i:u32, s:u32) -> f32 {
  var m = abs(luma[i - 2u * s]);
  for (var k:i32 = -1; k <= 2; k = k + 1) { m = max(m, abs(luma[u32(i32(i) + k * i32(s))])); }
  return m;
}

// the regime test on its own, because the composition outside needs to know which branch a pixel took
fn resolved_of(i:u32, s:u32, tau:f32) -> bool {
  let a = d2a_of(i, s); let b = d2b_of(i, s);
  let rng = range_of(i, s);
  return rng > 1.0e-6 && abs(b - a) / rng < tau;
}

fn axis(i:u32, s:u32, f:f32, depth:f32, tau:f32, phase:f32) -> f32 {
  let a = d2a_of(i, s); let b = d2b_of(i, s);
  let d3 = abs(b - a);
  let d2 = max(abs(a), abs(b));
  let step = max(abs(luma[i] - luma[i - s]), abs(luma[i + s] - luma[i]));
  // resolved: Taylor's identity, with the curvature surrogate D2max + D3 since xi is inside the interval.
  // not resolved: the step's own bound, since a step has no bounded second derivative for Taylor to use.
  // the phase argument is this frame's f(1-f) or the window's worst, 0.25 -- chosen by the caller, not
  // here. NO BACKTICKS IN THIS FILE'S COMMENTS: the kernel is a JS template literal and they close it.
  return select(max(f, 1.0 - f) * step, depth * 0.5 * phase * (d2 + d3), resolved_of(i, s, tau));
}

// The ring's own account of what the reprojection is doing. These mirror temporalLock's lumaMean,
// lumaMeanPrev and lumaInstability, and render/ringFloor.mjs's private copies of the same three -- held to
// agreement with the mirror by a parity row rather than trusted.
fn ring_mean(i:u32, P:u32) -> f32 {
  let F = P * 2u; var m = 0.0;
  for (var k:u32 = P; k < F; k = k + 1u) { m = m + ring[i * F + k]; }
  return m / f32(P);
}
fn ring_prev(i:u32, P:u32) -> f32 {
  let F = P * 2u; var m = 0.0;
  for (var k:u32 = 0u; k < P; k = k + 1u) { m = m + ring[i * F + k]; }
  return m / f32(P);
}
fn ring_spread(i:u32, P:u32, mean:f32) -> f32 {
  let F = P * 2u; var a = 0.0;
  for (var k:u32 = P; k < F; k = k + 1u) { a = a + abs(ring[i * F + k] - mean); }
  return a / f32(P);
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  // the border of three is the stencil's, not a fudge: the regime test reads two texels either side
  if (g.x < 3u || g.y < 3u || g.x >= u.w - 3u || g.y >= u.h - 3u) { dst[i] = 0.0; return; }
  let o = i * 4u;
  // DERIVED, not fitted: lumaMean averages ring slots resampled 0..P-1 times, so the mean depth is (P-1)/2 --
  // and the newest slot is fresh, which is why a period of 1 has a floor of exactly zero
  let depth = (f32(u.period) - 1.0) * 0.5;
  let hu = (f32(g.x) + 0.5) / f32(u.w) + motion[o];
  let hv = (f32(g.y) + 0.5) / f32(u.h) + motion[o + 1u];
  let fx = hu * f32(u.w) - 0.5 - floor(hu * f32(u.w) - 0.5);
  let fy = hv * f32(u.h) - 0.5 - floor(hv * f32(u.h) - 0.5);
  // never below the arithmetic's own floor: at an integer displacement both axis terms are exactly zero and
  // the ring is still not exact -- see render/ringFloor.mjs for the ulp measurement this mirrors
  let arith = 2.0 * 1.1920928955078125e-7 * max(mag_of(i, 1u), mag_of(i, u.w));
  // 0.25 is the maximum of f(1-f): the window form bounds THIS frame's phase over any phase the window held,
  // because the ring spans P frames at P jitter phases and this frame's f does not bound the window's worst
  let win = u.windowPhase != 0u;
  let px = select(fx * (1.0 - fx), 0.25, win);
  let py = select(fy * (1.0 - fy), 0.25, win);
  var e = axis(i, 1u, fx, depth, u.tau, px) + axis(i, u.w, fy, depth, u.tau, py);
  // *** THE RING TERM, ON THE STEP BRANCH, AND ONLY WHERE THE REPROJECTION MOVED THE SAMPLE. ***
  // The max is taken ONCE on the pixel: the ring holds one history per pixel, not one per direction.
  // The gate is v4566's -- at zero displacement none of |newer - older| is the reprojection's doing, and all
  // of it is the light.
  let stepBranch = !resolved_of(i, 1u, u.tau) || !resolved_of(i, u.w, u.tau);
  let moved = motion[o] != 0.0 || motion[o + 1u] != 0.0;
  if (win && stepBranch && moved) {
    let m = ring_mean(i, u.period);
    e = max(e, abs(m - ring_prev(i, u.period)) + ring_spread(i, u.period, m));
  }
  dst[i] = max(e, arith);
}`;
