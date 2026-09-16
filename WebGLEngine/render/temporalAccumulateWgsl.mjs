// render/temporalAccumulateWgsl.mjs -- the WGSL half of render/temporalAccumulate.mjs, mirroring it statement by
// statement over flat buffers in the shape gfx/device.js runs. Read that module's header before changing anything
// here; the conventions (uv, the motion vector's sign, the first-frame rule) are all stated there.
//
// *** v4591 -- THE COUNTERS, AND WHY THERE ARE TWO ENTRY POINTS RATHER THAN ONE KERNEL WITH A FLAG. ***
//
// temporalAccumulateCPU returns { reused, rejectedOffscreen, rejectedInvalid, clamped }. This kernel counted
// NOTHING until now, so v4590's port had to return stats: null and fsr.html had to print "CPU ONLY" -- and those
// counters are the diagnostic that caught a real bug: rejectedOffscreen reading exactly one column of 192 pixels
// is what proved the motion vectors had the right sign at v4586.
//
// `stats` is @binding(5), an array<atomic<u32>> of four, and ONLY `mainCounted` touches it. MEASURED BEFORE
// BUILDING, because the whole design rests on it: a two-entry-point module compiled for `main` does not demand
// the binding `main` never uses -- probed on this adapter with a three-binding module, bound two, dispatched,
// correct result, no validation error. That is what keeps render/temporalAccumulate-selfcheck.mjs and
// tools/ship/temporalCorpus.mjs working UNCHANGED: they dispatch `main`, which is the kernel they have always
// dispatched, with the five bindings they have always bound.
//
// *** AND THE DECISION LOGIC IS NOT DUPLICATED, WHICH IS THE POINT OF THE STRUCT. *** The alternative was a
// second kernel that re-derives "was this pixel rejected?" beside the one that rejects it -- two definitions of
// one rule, which is the defect this tree has found in a walker, a baker, a classifier and a dispatcher already.
// `accumulateAt` decides once and returns WHAT IT DID; the two entry points differ only in whether they record
// it. A counter that could disagree with the pass it counts is worse than no counter.
"use strict";

const ACCUMULATE_WGSL = `
struct P { w:u32, h:u32, flags:u32, alpha:f32 };
@group(0) @binding(0) var<storage,read> current:array<f32>;
@group(0) @binding(1) var<storage,read> history:array<f32>;
@group(0) @binding(2) var<storage,read> motion:array<f32>;
@group(0) @binding(3) var<storage,read_write> dst:array<f32>;
@group(0) @binding(4) var<uniform> u:P;
// four counters, in the order temporalAccumulateCPU's stats object declares them
@group(0) @binding(5) var<storage,read_write> stats:array<atomic<u32>>;

const FLAG_HAS_HISTORY : u32 = 1u;
const FLAG_CLAMP       : u32 = 2u;

const STAT_REUSED     : u32 = 0u;
const STAT_OFFSCREEN  : u32 = 1u;
const STAT_INVALID    : u32 = 2u;
const STAT_CLAMPED    : u32 = 3u;

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

/**
 * ONE DECISION, RETURNED RATHER THAN RECORDED. (No backquotes in these comments: this is WGSL inside a JS
 * template literal, and a backquote here ENDS THE SHADER -- which it did, on the first write of this block.) cat is which branch this pixel took; clamped is a second
 * axis, because a reused pixel can also be clamped and the CPU counts them separately. counted is false for
 * the first frame, which has no branch to count -- the CPU's stats stay all-zero on a frame with no history.
 */
struct Acc { colour:vec3<f32>, alpha:f32, cat:u32, clamped:bool, counted:bool };

fn accumulateAt(gx:u32, gy:u32) -> Acc {
  let i = gy * u.w + gx;
  let o = i * 4u;
  let cur = vec3<f32>(current[o], current[o + 1u], current[o + 2u]);

  // the honest first frame: no history means the current frame, not a blend with zeros
  if ((u.flags & FLAG_HAS_HISTORY) == 0u) {
    return Acc(cur, current[o + 3u], STAT_REUSED, false, false);
  }

  let uu = (f32(gx) + 0.5) / f32(u.w);
  let vv = (f32(gy) + 0.5) / f32(u.h);
  let du = motion[o]; let dv = motion[o + 1u]; let valid = motion[o + 2u];
  let hu = uu + du; let hv = vv + dv;

  // no history for this surface: it was invalid, or it was off screen last frame
  if (valid == 0.0) { return Acc(cur, current[o + 3u], STAT_INVALID, false, true); }
  if (hu < 0.0 || hu >= 1.0 || hv < 0.0 || hv >= 1.0) {
    return Acc(cur, current[o + 3u], STAT_OFFSCREEN, false, true);
  }

  var hist = histBilinear(hu, hv);
  var didClamp = false;

  if ((u.flags & FLAG_CLAMP) != 0u) {
    // the CURRENT frame's 3x3 bounds what a believable history sample can be -- a sample outside it is history of
    // something else, which is what ghosting is
    let x = i32(gx); let y = i32(gy);
    for (var c:u32 = 0u; c < 3u; c = c + 1u) {
      var lo = curAt(x - 1, y - 1, c); var hi = lo;
      for (var dy:i32 = -1; dy <= 1; dy = dy + 1) {
        for (var dx:i32 = -1; dx <= 1; dx = dx + 1) {
          let s = curAt(x + dx, y + dy, c);
          lo = min(lo, s); hi = max(hi, s);
        }
      }
      if (c == 0u) { let b = hist.x; hist.x = clamp(hist.x, lo, hi); if (hist.x != b) { didClamp = true; } }
      else if (c == 1u) { let b = hist.y; hist.y = clamp(hist.y, lo, hi); if (hist.y != b) { didClamp = true; } }
      else { let b = hist.z; hist.z = clamp(hist.z, lo, hi); if (hist.z != b) { didClamp = true; } }
    }
  }

  return Acc(hist * (1.0 - u.alpha) + cur * u.alpha, 1.0, STAT_REUSED, didClamp, true);
}

fn writeOut(gx:u32, gy:u32, a:Acc) {
  let o = (gy * u.w + gx) * 4u;
  dst[o] = a.colour.x; dst[o + 1u] = a.colour.y; dst[o + 2u] = a.colour.z; dst[o + 3u] = a.alpha;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  writeOut(g.x, g.y, accumulateAt(g.x, g.y));
}

// The same pass, recording what it did. Nothing else differs, and stats exists for this entry point alone --
// a module compiled for main does not demand a binding main never uses.
@compute @workgroup_size(8,8,1)
fn mainCounted(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let a = accumulateAt(g.x, g.y);
  writeOut(g.x, g.y, a);
  if (a.counted) {
    atomicAdd(&stats[a.cat], 1u);
    if (a.clamped) { atomicAdd(&stats[STAT_CLAMPED], 1u); }
  }
}`;

export { ACCUMULATE_WGSL };
