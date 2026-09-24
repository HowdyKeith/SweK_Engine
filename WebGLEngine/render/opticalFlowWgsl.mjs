/**
 * The kernel mirror of render/opticalFlow.mjs's search. ONE LEVEL per dispatch, because the levels are
 * sequential -- each starts from the one above's answer -- and a kernel cannot order its own dispatches.
 *
 * *** THE TIE RULE AND THE SEED ARE THE TWO THINGS THIS MUST GET RIGHT. *** `best` is seeded with the
 * GUESS's score before the search, not with a large number: v4673 shipped Infinity there, which let the
 * first candidate scanned win every tie, and on flat content that handed every block the corner of its own
 * search window. The candidate loop then takes STRICTLY better.
 *
 * NO BACKTICKS IN THIS FILE'S COMMENTS: the kernel is a JS template literal and they close it.
 */
export const OPTICAL_FLOW_WGSL = `
struct P { lw:u32, lh:u32, bw:u32, bh:u32, block:i32, radius:i32, scale:i32, n:i32, refine:i32, p1:i32, p2:i32, p3:i32 };
@group(0) @binding(0) var<storage,read> curLum:array<f32>;
@group(0) @binding(1) var<storage,read> prevLum:array<f32>;
@group(0) @binding(2) var<storage,read> flowIn:array<f32>;
@group(0) @binding(3) var<storage,read_write> flowOut:array<f32>;
@group(0) @binding(4) var<storage,read_write> confOut:array<f32>;
@group(0) @binding(5) var<uniform> u:P;

fn at(buf:ptr<storage,array<f32>,read>, x:i32, y:i32) -> f32 {
  let xx = u32(clamp(x, 0, i32(u.lw) - 1));
  let yy = u32(clamp(y, 0, i32(u.lh) - 1));
  return (*buf)[yy * u.lw + xx];
}

fn sadAt(ax:i32, ay:i32, bx:i32, by:i32) -> f32 {
  var s = 0.0;
  for (var y:i32 = 0; y < u.n; y = y + 1) {
    for (var x:i32 = 0; x < u.n; x = x + 1) {
      s = s + abs(at(&curLum, ax + x, ay + y) - at(&prevLum, bx + x, by + y));
    }
  }
  return s;
}

@compute @workgroup_size(8,8,1)
fn search(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.bw || g.y >= u.bh) { return; }
  let i = g.y * u.bw + g.x;
  let ox = i32(round(f32(i32(g.x) * u.block) / f32(u.scale)));
  let oy = i32(round(f32(i32(g.y) * u.block) / f32(u.scale)));
  // the guess carried down, at THIS level and in the SEARCH's sense (cur -> prev), so negated
  let gx = i32(round(-flowIn[i * 2u] / f32(u.scale)));
  let gy = i32(round(-flowIn[i * 2u + 1u] / f32(u.scale)));

  // SEEDED WITH THE GUESS. See the header: Infinity here is the defect v4673 shipped and repaired.
  var bdx = gx;
  var bdy = gy;
  var best = sadAt(ox, oy, ox + gx, oy + gy);
  for (var dy:i32 = -u.radius; dy <= u.radius; dy = dy + 1) {
    for (var dx:i32 = -u.radius; dx <= u.radius; dx = dx + 1) {
      let s = sadAt(ox, oy, ox + gx + dx, oy + gy + dy);
      if (s < best) { best = s; bdx = gx + dx; bdy = gy + dy; }   // STRICTLY better
    }
  }
  // *** v4675 -- SUB-PIXEL, AND ONLY WHERE THE UNIFORM SAYS SO. *** The refine flag is 1 on the finest level and 0
  // above it: a fraction found on a quarter-resolution mip is a fraction OF FOUR PIXELS, and the level
  // below rounds its incoming guess, so the refinement would be computed and thrown away. The parabola
  // through the winner and its two neighbours locates the vertex; the denominator is guarded because it
  // vanishes on a flat surface, and the result is clamped to half a pixel because beyond that the
  // NEIGHBOUR should have won and the model is failing rather than finding an offset.
  var subx = 0.0;
  var suby = 0.0;
  if (u.refine != 0) {
    let s0 = best;
    let sxm = sadAt(ox, oy, ox + bdx - 1, oy + bdy);
    let sxp = sadAt(ox, oy, ox + bdx + 1, oy + bdy);
    let sym = sadAt(ox, oy, ox + bdx, oy + bdy - 1);
    let syp = sadAt(ox, oy, ox + bdx, oy + bdy + 1);
    let denx = sxm - 2.0 * s0 + sxp;
    if (abs(denx) > 1e-9) { let d = (sxm - sxp) / (2.0 * denx); if (abs(d) <= 0.5) { subx = d; } }
    let deny = sym - 2.0 * s0 + syp;
    if (abs(deny) > 1e-9) { let d = (sym - syp) / (2.0 * deny); if (abs(d) <= 0.5) { suby = d; } }
  }
  let still = sadAt(ox, oy, ox, oy);
  // the negation back to the arc's prev -> cur sense, at one site
  flowOut[i * 2u] = -(f32(bdx * u.scale) + subx);
  flowOut[i * 2u + 1u] = -(f32(bdy * u.scale) + suby);
  if (still > 1e-6) {
    confOut[i] = clamp((still - best) / still, 0.0, 1.0);
  } else {
    confOut[i] = 0.0;
  }
}`;
