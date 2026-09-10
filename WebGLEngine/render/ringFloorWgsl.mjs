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
struct P { w:u32, h:u32, period:u32, pad:u32, tau:f32, p1:f32, p2:f32, p3:f32 };
@group(0) @binding(0) var<storage,read> luma:array<f32>;
@group(0) @binding(1) var<storage,read> motion:array<f32>;
@group(0) @binding(2) var<storage,read_write> dst:array<f32>;
@group(0) @binding(3) var<uniform> u:P;

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

fn axis(i:u32, s:u32, f:f32, depth:f32, tau:f32) -> f32 {
  let a = d2a_of(i, s); let b = d2b_of(i, s);
  let d3 = abs(b - a);
  let d2 = max(abs(a), abs(b));
  let step = max(abs(luma[i] - luma[i - s]), abs(luma[i + s] - luma[i]));
  let rng = range_of(i, s);
  // resolved: Taylor's identity, with the curvature surrogate D2max + D3 since xi is inside the interval.
  // not resolved: the step's own bound, since a step has no bounded second derivative for Taylor to use.
  let resolved = rng > 1.0e-6 && d3 / rng < tau;
  return select(max(f, 1.0 - f) * step, depth * 0.5 * f * (1.0 - f) * (d2 + d3), resolved);
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
  dst[i] = axis(i, 1u, fx, depth, u.tau) + axis(i, u.w, fy, depth, u.tau);
}`;
