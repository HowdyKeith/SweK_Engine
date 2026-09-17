// render/temporalRejectWgsl.mjs -- the WGSL half of render/temporalReject.mjs, mirroring it statement by
// statement over flat buffers in the shape gfx/device.js runs. Two kernels because the module has two stages
// and a mirror that fused them could not be told apart from a CPU that fused them differently.
//
// The YCoCg transform is written with the same negative-power-of-two coefficients as the JS, so the round trip
// is exact on the device too and the parity row is measuring the pass rather than the colour space.
"use strict";

const YCOCG_WGSL = `
fn rgb2ycocg(c:vec3<f32>) -> vec3<f32> {
  return vec3<f32>(0.25*c.r + 0.5*c.g + 0.25*c.b, 0.5*c.r - 0.5*c.b, -0.25*c.r + 0.5*c.g - 0.25*c.b);
}
fn ycocg2rgb(c:vec3<f32>) -> vec3<f32> {
  let t = c.x - c.z;
  return vec3<f32>(t + c.y, c.x + c.z, t - c.y);
}`;

// ---- DISOCCLUSION: was this surface hidden last frame? ------------------------------------------------------
const DISOCCLUSION_WGSL = `
struct P { w:u32, h:u32, threshold:f32, nearerIsLess:u32 };
@group(0) @binding(0) var<storage,read> motion:array<f32>;
@group(0) @binding(1) var<storage,read> prevDepth:array<f32>;
@group(0) @binding(2) var<storage,read_write> dst:array<f32>;
@group(0) @binding(3) var<uniform> u:P;

@group(0) @binding(4) var<storage,read_write> stats:array<atomic<u32>>;

const CLASS_GOOD      : u32 = 0u;   // the history at this pixel is usable
const CLASS_GENUINE   : u32 = 1u;   // a real disocclusion: something nearer than the reprojection expected
const CLASS_NOHISTORY : u32 = 2u;   // there is no history to judge: motion invalid, or reprojected offscreen

// *** THE TEST ITSELF, FACTORED OUT SO THE TWO ENTRY POINTS CANNOT DISAGREE. *** dst gets 1.0 for either
// non-zero class, which is exactly what the mask meant before this split: the mask cannot tell a disocclusion
// from an offscreen reprojection and never could. That is why the counters below exist -- see mainCounted.
fn classify(gx:u32, gy:u32) -> u32 {
  let i = gy * u.w + gx;
  let o = i * 4u;
  if (motion[o + 2u] == 0.0) { return CLASS_NOHISTORY; }        // no reprojection at all
  let uu = (f32(gx) + 0.5) / f32(u.w) + motion[o];
  let vv = (f32(gy) + 0.5) / f32(u.h) + motion[o + 1u];
  if (uu < 0.0 || uu >= 1.0 || vv < 0.0 || vv >= 1.0) { return CLASS_NOHISTORY; }
  let px = u32(clamp(floor(uu * f32(u.w)), 0.0, f32(u.w) - 1.0));
  let py = u32(clamp(floor(vv * f32(u.h)), 0.0, f32(u.h) - 1.0));
  let was = prevDepth[py * u.w + px];
  let expect = motion[o + 3u];
  // "nearer than expected by more than the threshold" -- the sign is the whole test
  let gap = select(was - expect, expect - was, u.nearerIsLess != 0u);
  return select(CLASS_GOOD, CLASS_GENUINE, gap > u.threshold);
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  dst[i] = select(0.0, 1.0, classify(g.x, g.y) != CLASS_GOOD);
}

// *** THE SECOND ENTRY POINT, AND THE REASON THE MASK ALONE WAS NEVER ENOUGH. *** disocclusionCPU returns
// { flagged, noHistory } and this kernel returned neither, so temporalRejectGPU.disocclusion's own comment told
// callers to "count them from the mask" -- which recovers flagged and CANNOT recover noHistory, because the mask
// writes the same 1.0 for a disocclusion and for a reprojection that left the frame. genuine = flagged -
// noHistory is the number fsr.html prints, and it is unrecoverable from dst by construction. stats[0] is
// flagged and stats[1] is noHistory, in DISOC_STAT_ORDER. The auto layout is per entry point, so binding 4
// exists only on this pipeline and main pays no atomic.
@compute @workgroup_size(8,8,1)
fn mainCounted(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = g.y * u.w + g.x;
  let c = classify(g.x, g.y);
  dst[i] = select(0.0, 1.0, c != CLASS_GOOD);
  if (c != CLASS_GOOD)      { atomicAdd(&stats[0], 1u); }
  if (c == CLASS_NOHISTORY) { atomicAdd(&stats[1], 1u); }
}`;

// ---- RECTIFIED ACCUMULATE: reproject, clamp in the chosen space, blend by the history factor ----------------
const RECTIFY_WGSL = `
struct P { w:u32, h:u32, alpha:f32, flags:u32 };
@group(0) @binding(0) var<storage,read> cur:array<f32>;
@group(0) @binding(1) var<storage,read> hist:array<f32>;
@group(0) @binding(2) var<storage,read> motion:array<f32>;
@group(0) @binding(3) var<storage,read> factor:array<f32>;
@group(0) @binding(4) var<storage,read_write> dst:array<f32>;
@group(0) @binding(5) var<uniform> u:P;

const FLAG_YCOCG    : u32 = 1u;
const FLAG_CLAMP    : u32 = 2u;
const FLAG_HAS_HIST : u32 = 4u;
const FLAG_HAS_FAC  : u32 = 8u;
${YCOCG_WGSL}

fn curAt(x:i32, y:i32, w:u32, h:u32) -> vec3<f32> {
  let xx = u32(clamp(x, 0, i32(w) - 1));
  let yy = u32(clamp(y, 0, i32(h) - 1));
  let o = (yy * w + xx) * 4u;
  return vec3<f32>(cur[o], cur[o + 1u], cur[o + 2u]);
}

fn histBilinear(uu:f32, vv:f32, w:u32, h:u32) -> vec3<f32> {
  let x = uu * f32(w) - 0.5;
  let y = vv * f32(h) - 0.5;
  let x0 = floor(x); let y0 = floor(y);
  let fx = x - x0;   let fy = y - y0;
  var out = vec3<f32>(0.0);
  for (var dy:i32 = 0; dy <= 1; dy = dy + 1) {
    for (var dx:i32 = 0; dx <= 1; dx = dx + 1) {
      let xx = u32(clamp(i32(x0) + dx, 0, i32(w) - 1));
      let yy = u32(clamp(i32(y0) + dy, 0, i32(h) - 1));
      let o = (yy * w + xx) * 4u;
      let wx = select(1.0 - fx, fx, dx == 1);
      let wy = select(1.0 - fy, fy, dy == 1);
      out = out + vec3<f32>(hist[o], hist[o + 1u], hist[o + 2u]) * wx * wy;
    }
  }
  return out;
}

@group(0) @binding(6) var<storage,read_write> stats:array<atomic<u32>>;

// The five things rectifiedAccumulateCPU tallies that this kernel can tally, as bits on one word, so the
// shared body can report them without touching an atomic. Their INDICES in the stats buffer are
// RECT_STAT_ORDER, which also carries relaxed -- see mainCounted for why that one is 0 and honest.
const C_REUSED    : u32 = 1u;
const C_OFFSCREEN : u32 = 2u;
const C_INVALID   : u32 = 4u;
const C_CLAMPED   : u32 = 8u;
const C_DISCARDED : u32 = 16u;

struct R { val:vec3<f32>, counts:u32 };

// *** THE WHOLE BLEND, FACTORED OUT SO A COUNTED RUN AND AN UNCOUNTED ONE COMPUTE THE SAME PICTURE. *** The
// counters are a by-product of the branches that were already here: usable is exactly the CPU's two rejects
// in order, and a pixel that reaches the sample is the CPU's reused.
fn rectifyAt(gx:u32, gy:u32) -> R {
  let i = gy * u.w + gx;
  let o = i * 4u;
  let c = vec3<f32>(cur[o], cur[o + 1u], cur[o + 2u]);
  var out = R(c, 0u);

  if ((u.flags & FLAG_HAS_HIST) == 0u) { return out; }   // no history: the CPU counts NOTHING here either

  let uu = (f32(gx) + 0.5) / f32(u.w);
  let vv = (f32(gy) + 0.5) / f32(u.h);
  let hu = uu + motion[o];
  let hv = vv + motion[o + 1u];
  if (motion[o + 2u] == 0.0) { out.counts = C_INVALID; return out; }
  if (hu < 0.0 || hu >= 1.0 || hv < 0.0 || hv >= 1.0) { out.counts = C_OFFSCREEN; return out; }

  var hs = histBilinear(hu, hv, u.w, u.h);
  out.counts = C_REUSED;
  if ((u.flags & FLAG_CLAMP) != 0u) {
    let yc = (u.flags & FLAG_YCOCG) != 0u;
    var hv3 = select(hs, rgb2ycocg(hs), yc);
    var lo = vec3<f32>( 1.0e9);
    var hi = vec3<f32>(-1.0e9);
    for (var dy:i32 = -1; dy <= 1; dy = dy + 1) {
      for (var dx:i32 = -1; dx <= 1; dx = dx + 1) {
        let s0 = curAt(i32(gx) + dx, i32(gy) + dy, u.w, u.h);
        let s = select(s0, rgb2ycocg(s0), yc);
        lo = min(lo, s);
        hi = max(hi, s);
      }
    }
    let before = hv3;
    hv3 = clamp(hv3, lo, hi);
    // exact inequality, as the CPU's hv3[c] !== b is exact: a clamp that moved nothing is not a clamp
    if (any(hv3 != before)) { out.counts = out.counts | C_CLAMPED; }
    hs = select(hv3, ycocg2rgb(hv3), yc);
  }
  let f = select(1.0, clamp(factor[i], 0.0, 1.0), (u.flags & FLAG_HAS_FAC) != 0u);
  if (f == 0.0) { out.counts = out.counts | C_DISCARDED; }
  let a = 1.0 - (1.0 - u.alpha) * f;
  out.val = hs * (1.0 - a) + c * a;
  return out;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let o = (g.y * u.w + g.x) * 4u;
  let r = rectifyAt(g.x, g.y);
  dst[o] = r.val.x; dst[o + 1u] = r.val.y; dst[o + 2u] = r.val.z; dst[o + 3u] = 1.0;
}

// *** THE COUNTED ENTRY POINT. *** Five of rectifiedAccumulateCPU's six counters land here. The sixth,
// relaxed, is 0 -- and that 0 is a MEASUREMENT, not an omission, because this kernel has no relax input at
// all: the CPU with relax = null never increments it either, so the two agree on the same quantity. The day a
// relax binding is added to this kernel, C_RELAXED must be added in the same commit or the 0 becomes a lie.
// The auto layout is per entry point, so binding 6 exists only on this pipeline and main pays no atomic.
@compute @workgroup_size(8,8,1)
fn mainCounted(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let o = (g.y * u.w + g.x) * 4u;
  let r = rectifyAt(g.x, g.y);
  dst[o] = r.val.x; dst[o + 1u] = r.val.y; dst[o + 2u] = r.val.z; dst[o + 3u] = 1.0;
  if ((r.counts & C_REUSED)    != 0u) { atomicAdd(&stats[0], 1u); }
  if ((r.counts & C_OFFSCREEN) != 0u) { atomicAdd(&stats[1], 1u); }
  if ((r.counts & C_INVALID)   != 0u) { atomicAdd(&stats[2], 1u); }
  if ((r.counts & C_CLAMPED)   != 0u) { atomicAdd(&stats[3], 1u); }
  if ((r.counts & C_DISCARDED) != 0u) { atomicAdd(&stats[4], 1u); }
}`;

// ---- THE HISTORY FACTOR: the inversion that stopped the other two chaining ---------------------------------
//
// *** v4593 MEASURED THE HOLE AND v4594 FILLS IT. *** DISOCCLUSION_WGSL writes a MASK -- 1 where the history is
// wrong. RECTIFY_WGSL reads a FACTOR -- 1 where the history is TRUSTED. They are opposites, and the thing that
// inverts one into the other was historyFactorCPU and nothing else: there was no WGSL for it anywhere in the
// tree, so a device frame wanting both passes paid a readback and an upload between them, which is the exact
// cost a chain exists to avoid. v4593's runner shipped WITHOUT a rejectAndAccumulate() and said so at the site,
// because its first draft had one that bound an all-zero factor under a comment claiming otherwise.
//
// It mirrors historyFactorCPU statement by statement, including the part that is a DECISION rather than
// arithmetic: the three reasons MULTIPLY. Each is an independent probability that the history is wrong, so two
// weak reasons compound; a max() would let the strongest hide the others, which on a disoccluded transparent
// surface is precisely the case where both are true and the answer must be "certainly not".
//
// Three optional inputs, all three BOUND and the flags saying which are real -- the same shape
// temporalAccumulateWgsl uses for history and motion, and for the same reason: a compute pipeline's bind group
// is complete or it is nothing.
const FACTOR_WGSL = `
struct P { n:u32, flags:u32, pad0:u32, pad1:u32 };
@group(0) @binding(0) var<storage,read> disocclusion:array<f32>;
@group(0) @binding(1) var<storage,read> reactive:array<f32>;
@group(0) @binding(2) var<storage,read> shading:array<f32>;
@group(0) @binding(3) var<storage,read_write> dst:array<f32>;
@group(0) @binding(4) var<uniform> u:P;

const FLAG_HAS_DISOCC   : u32 = 1u;
const FLAG_HAS_REACTIVE : u32 = 2u;
const FLAG_HAS_SHADING  : u32 = 4u;

@compute @workgroup_size(64,1,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  let i = g.x;
  if (i >= u.n) { return; }
  var f = 1.0;
  if ((u.flags & FLAG_HAS_DISOCC) != 0u)   { f = f * (1.0 - clamp(disocclusion[i], 0.0, 1.0)); }
  if ((u.flags & FLAG_HAS_REACTIVE) != 0u) { f = f * (1.0 - clamp(reactive[i], 0.0, 1.0)); }
  if ((u.flags & FLAG_HAS_SHADING) != 0u)  { f = f * (1.0 - clamp(shading[i], 0.0, 1.0)); }
  dst[i] = f;
}`;

export { DISOCCLUSION_WGSL, RECTIFY_WGSL, YCOCG_WGSL, FACTOR_WGSL };
