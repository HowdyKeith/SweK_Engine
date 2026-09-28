/**
 * The kernel mirror of render/dilate.mjs. Same neighbourhood, same tie rule, same whole-vector copy.
 *
 * *** THE TIE RULE IS THE PART A MIRROR MOST EASILY DROPS. *** `<` and `<=` differ on flat geometry, which is
 * most of any frame: with `<=` the last neighbour scanned wins every tie and the whole picture shifts by a
 * pixel, while still measuring as "nearest depth wins". The CPU takes STRICTLY nearer and so does this.
 *
 * NO BACKTICKS IN THIS FILE'S COMMENTS: the kernel is a JS template literal and they close it.
 */
export const DILATE_WGSL = `
struct P { w:u32, h:u32, radius:i32, nearerIsLess:u32 };
@group(0) @binding(0) var<storage,read> depth:array<f32>;
@group(0) @binding(1) var<storage,read> motion:array<f32>;
@group(0) @binding(2) var<storage,read_write> dstDepth:array<f32>;
@group(0) @binding(3) var<storage,read_write> dstMotion:array<f32>;
@group(0) @binding(4) var<storage,read_write> dstSource:array<i32>;
@group(0) @binding(5) var<uniform> u:P;

@group(0) @binding(6) var<storage,read_write> stats:array<atomic<u32>>;

// The search, factored out so the two entry points cannot disagree -- the idiom DISOCCLUSION_WGSL and
// REACTIVE_WGSL already use in this arc. It returns the index of the winning pixel and nothing else,
// because every output is then read from that ONE index: a function returning a depth and a motion
// separately is a function two callers can mix.
fn pick(gx:u32, gy:u32) -> i32 {
  let i = i32(gy * u.w + gx);
  var best = i;
  var bestD = depth[u32(i)];
  for (var dy:i32 = -u.radius; dy <= u.radius; dy = dy + 1) {
    let yy = i32(gy) + dy;
    if (yy < 0 || yy >= i32(u.h)) { continue; }
    for (var dx:i32 = -u.radius; dx <= u.radius; dx = dx + 1) {
      let xx = i32(gx) + dx;
      if (xx < 0 || xx >= i32(u.w)) { continue; }
      let j = yy * i32(u.w) + xx;
      let d = depth[u32(j)];
      // STRICTLY nearer. A tie leaves the centre alone.
      let nearer = select(d > bestD, d < bestD, u.nearerIsLess != 0u);
      if (nearer) { best = j; bestD = d; }
    }
  }
  return best;
}

fn emit(i:i32, best:i32) {
  dstDepth[u32(i)] = depth[u32(best)];
  dstSource[u32(i)] = best;
  // ALL FOUR CHANNELS FROM THE SAME PIXEL -- a mixed vector describes no surface, and the depth-clip pass
  // downstream compares exactly zPrev against the depth recorded last frame.
  for (var c:u32 = 0u; c < 4u; c = c + 1u) {
    dstMotion[u32(i) * 4u + c] = motion[u32(best) * 4u + c];
  }
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = i32(g.y * u.w + g.x);
  emit(i, pick(g.x, g.y));
}

// The second entry point. stats[0] is moved, in DILATE_STAT_ORDER. The source buffer already records
// every choice, so this counter is derivable from it on the host -- and it is dispatched anyway, because
// the two must AGREE: a counter and a buffer written by the same kernel that disagree is the cheapest
// signal there is that one of them is wrong. The auto layout is per entry point, so binding 6 exists only
// on this pipeline and main pays no atomic.
@compute @workgroup_size(8,8,1)
fn mainCounted(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let i = i32(g.y * u.w + g.x);
  let best = pick(g.x, g.y);
  emit(i, best);
  if (best != i) { atomicAdd(&stats[0], 1u); }
}`;
