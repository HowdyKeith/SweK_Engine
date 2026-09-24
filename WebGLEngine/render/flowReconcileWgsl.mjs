/**
 * The kernel mirror of render/flowReconcile.mjs -- FSR3's reconciliation of the application's motion field
 * with the colour flow, on the device.
 *
 * *** THE THREE THINGS A MIRROR OF THIS PASS MOST EASILY DROPS, ALL OF WHICH ITS GATE DRIVES: ***
 *
 *   1. THE MARGIN'S DIRECTION. The flow is the CHALLENGER and must beat the application by a fraction, because
 *      the search was fitted on the very statistic that judges it. `sadFlow < sadApp * (1 - margin)` inverted,
 *      or the margin applied to the wrong side, still looks like "the better one wins".
 *   2. THE STRICTLY-BETTER COMPARISON. On flat content every candidate ties, and `<=` hands every block to a
 *      search that saw nothing -- which is the aperture problem arriving through one character. The CPU's gate
 *      measures that at 16 of 16 blocks; this kernel takes the same `<`.
 *   3. THE NEAREST-VALID-PIXEL RULE. A block straddling a silhouette holds two surfaces; the mean of their
 *      vectors describes neither. The block takes its nearest VALID pixel's vector, and `valid` is checked
 *      BEFORE depth, or an invalid pixel that happens to be nearest wins.
 *
 * *** AND THE OUTPUT IS ONE PACKED BUFFER, WHICH IS A LIMIT AND NOT A PREFERENCE. *** WebGPU's default
 * maxStorageBuffersPerShaderStage is 8. Separate flow, appFlow, source and three SAD arrays would need nine
 * storage bindings beside the five inputs. Eight floats per block in one buffer keeps it inside the limit, and
 * `source` rides in it as an f32 whose values are 1, 2 and 3 -- exactly representable, converted back by the
 * runner, and the parity row compares it against the CPU's Int32Array after that conversion.
 *
 * NO BACKTICKS IN THIS FILE'S COMMENTS: the kernel is a JS template literal and they close it.
 */
export const RECONCILE_STRIDE = 8;   // floats per block in the packed output: fx fy ax ay sApp sFlow sStill src

export const RECONCILE_WGSL = `
struct P { w:u32, h:u32, bw:u32, bh:u32, block:u32, nearerIsLess:u32, margin:f32, nan:f32 };
@group(0) @binding(0) var<storage,read> cur:array<f32>;      // w*h*4 rgba
@group(0) @binding(1) var<storage,read> prev:array<f32>;     // w*h*4 rgba
@group(0) @binding(2) var<storage,read> motion:array<f32>;   // w*h*4 (du, dv, valid, zPrev)
@group(0) @binding(3) var<storage,read> depth:array<f32>;    // w*h
@group(0) @binding(4) var<storage,read> flowIn:array<f32>;   // bw*bh*2, the colour flow
@group(0) @binding(5) var<storage,read_write> out:array<f32>;// bw*bh*8, see RECONCILE_STRIDE
@group(0) @binding(6) var<uniform> u:P;
@group(0) @binding(7) var<storage,read_write> stats:array<atomic<u32>>;

// *** THE ARC'S CANONICAL LUMA, AND LEVEL 0 OF render/luminancePyramid.mjs IS EXACTLY THIS. *** The CPU pass
// scores on that pyramid's base, which is luma() per pixel with no downsampling, so computing it here from
// rgba is the same number and not a second convention. A mirror that used 0.299/0.587/0.114 would pass every
// shape row and disagree in the third digit on every block.
fn lum(i:u32) -> f32 {
  return 0.25 * cur[i*4u] + 0.5 * cur[i*4u+1u] + 0.25 * cur[i*4u+2u];
}
fn lumP(i:u32) -> f32 {
  return 0.25 * prev[i*4u] + 0.5 * prev[i*4u+1u] + 0.25 * prev[i*4u+2u];
}
fn clampi(v:i32, lo:i32, hi:i32) -> i32 { return max(lo, min(hi, v)); }

// Bilinear fetch of PREV's luminance at a possibly fractional position, edges clamped -- the CPU's sadAt.
fn prevAt(x:f32, y:f32) -> f32 {
  let fx = floor(x); let fy = floor(y);
  let tx = x - fx;   let ty = y - fy;
  let W = i32(u.w); let H = i32(u.h);
  let x0 = clampi(i32(fx), 0, W-1);     let x1 = clampi(i32(fx)+1, 0, W-1);
  let y0 = clampi(i32(fy), 0, H-1);     let y1 = clampi(i32(fy)+1, 0, H-1);
  let a = lumP(u32(y0*W + x0)); let b = lumP(u32(y0*W + x1));
  let c = lumP(u32(y1*W + x0)); let d = lumP(u32(y1*W + x1));
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

// SAD between CUR's block at integer (ax, ay) and PREV's at fractional (bx, by). Same loop, same clamping and
// same bilinear sampling as the CPU, because a SAD computed two ways is two SADs.
fn sadAt(ax:i32, ay:i32, bx:f32, by:f32, n:i32) -> f32 {
  var s = 0.0;
  let W = i32(u.w); let H = i32(u.h);
  for (var y:i32 = 0; y < n; y = y + 1) {
    for (var x:i32 = 0; x < n; x = x + 1) {
      let av = lum(u32(clampi(ay+y, 0, H-1) * W + clampi(ax+x, 0, W-1)));
      s = s + abs(av - prevAt(bx + f32(x), by + f32(y)));
    }
  }
  return s;
}

fn reconcile(bx:u32, by:u32) {
  let i = by * u.bw + bx;
  let n = i32(u.block);
  let ox = i32(bx * u.block); let oy = i32(by * u.block);
  let W = i32(u.w); let H = i32(u.h);

  // ---- the block's application vector: its nearest VALID pixel's ----
  var bestJ:i32 = -1;
  var bestD = 0.0;
  for (var y:i32 = oy; y < min(oy + n, H); y = y + 1) {
    for (var x:i32 = ox; x < min(ox + n, W); x = x + 1) {
      let j = y * W + x;
      // *** valid FIRST. *** An invalid pixel is not an answer, however near it is.
      if (motion[u32(j)*4u+2u] == 0.0) { continue; }
      let d = depth[u32(j)];
      var better = false;
      if (bestJ < 0) { better = true; }
      else if (u.nearerIsLess == 1u) { better = d < bestD; }
      else { better = d > bestD; }
      if (better) { bestJ = j; bestD = d; }
    }
  }

  let fx = flowIn[i*2u]; let fy = flowIn[i*2u+1u];
  // the SEARCH's sense is the negative of the output sense, so a forward vector v scores at -v
  let sFlow  = sadAt(ox, oy, f32(ox) - fx, f32(oy) - fy, n);
  let sStill = sadAt(ox, oy, f32(ox),      f32(oy),      n);

  let o = i * ${RECONCILE_STRIDE}u;
  out[o+5u] = sFlow;
  out[o+6u] = sStill;

  if (bestJ < 0) {
    // no valid application vector anywhere in the block: the flow is not winning, it is all there is
    out[o+0u] = fx; out[o+1u] = fy;
    // *** THE NaN COMES IN THROUGH THE UNIFORM, AND THAT IS NOT A STYLE CHOICE. *** WGSL refuses a NaN
    // CONSTANT at compile time -- bitcast<f32>(0x7fc00000u) is const-folded and rejected with "value nan
    // cannot be represented as 'f32'", and 0.0/0.0 goes the same way. So the runner writes a real NaN into
    // u.nan and the kernel reads it, which is also the honest construction: the value is the same NaN the CPU
    // puts in appFlow, handed over rather than manufactured by an arithmetic trick the compiler may fold next.
    out[o+2u] = u.nan;                          // NaN, as the CPU's appFlow is
    out[o+3u] = u.nan;
    out[o+4u] = u.nan;                          // and sadApp
    out[o+7u] = 3.0;                            // SRC_FLOW_ONLY
    atomicAdd(&stats[2], 1u);
    return;
  }
  // THE ONE NEGATION: UV cur -> prev becomes pixels prev -> cur
  let ax = -motion[u32(bestJ)*4u]      * f32(u.w);
  let ay = -motion[u32(bestJ)*4u+1u]   * f32(u.h);
  let sApp = sadAt(ox, oy, f32(ox) - ax, f32(oy) - ay, n);
  out[o+2u] = ax; out[o+3u] = ay; out[o+4u] = sApp;

  // STRICTLY better, and the margin is on the APPLICATION's score -- the incumbent's bar for the challenger
  if (sFlow < sApp * (1.0 - u.margin)) {
    out[o+0u] = fx; out[o+1u] = fy; out[o+7u] = 2.0;   // SRC_FLOW_BEAT
    atomicAdd(&stats[1], 1u);
  } else {
    out[o+0u] = ax; out[o+1u] = ay; out[o+7u] = 1.0;   // SRC_APP
    atomicAdd(&stats[0], 1u);
  }
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.bw || g.y >= u.bh) { return; }
  reconcile(g.x, g.y);
}
`;
