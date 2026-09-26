/**
 * The kernel mirror of render/holeFill.mjs -- FSR3's disocclusion fill on the device.
 *
 * *** ONLY THE NEIGHBOURHOOD RULE IS PORTED, AND THAT IS A MEASURED CHOICE. *** render/holeFill.mjs ships two
 * growth modes and v4678 measured that the other one -- iterative ring dilation -- is 3.6 dB WORSE on the holes
 * than leaving them to a cross-fade. It is kept on the CPU so that number stays reproducible, and porting an
 * algorithm this tree has measured as a failure would be surface nothing needs. The runner refuses it by name.
 *
 * *** AND THE NEIGHBOURHOOD RULE IS ORDER-INDEPENDENT BY CONSTRUCTION, WHICH IS WHY THIS NEEDS NO ATOMICS. ***
 * Every hole pixel reads only the ORIGINAL mask and writes only its own slot, so one dispatch is the whole pass
 * and a device cannot disagree with a CPU about visit order. That is the opposite of render/frameInterpWgsl.mjs's
 * splat, which is a scatter and needed three dispatches and two atomics to reproduce one tie rule.
 *
 * NO BACKTICKS IN THIS FILE'S COMMENTS: the kernel is a JS template literal and they close it.
 */
// *** FIVE FLOATS, NOT FOUR, AND THE FIFTH IS THE HOLE FLAG. *** A first draft packed four and had the runner
// INFER which pixels were still holes from a NaN vector and a blend side -- which is a pixel's state deduced
// from two of its values, exactly the "every outcome writes the same float" defect render/dilate.mjs recorded.
// An unfilled hole and a filled one that chose the blend are different states and now say so.
export const FILL_STRIDE = 5;    // floats per pixel out: vecX vecY zbuf side hole

export const FILL_WGSL = `
struct P { w:u32, h:u32, radius:i32, nearerIsLess:u32, preferFarther:u32, sideMode:u32, pad:u32, pad2:u32,
           t:f32, pad3:f32, pad4:f32, pad5:f32 };
@group(0) @binding(0) var<storage,read> vecIn:array<f32>;      // w*h*2
@group(0) @binding(1) var<storage,read> holeIn:array<u32>;     // w*h, 1 = hole
@group(0) @binding(2) var<storage,read> zbufIn:array<f32>;     // w*h
@group(0) @binding(3) var<storage,read> depthPrev:array<f32>;  // w*h
@group(0) @binding(4) var<storage,read> depthCur:array<f32>;   // w*h
@group(0) @binding(5) var<storage,read_write> out:array<f32>;  // w*h*4, see FILL_STRIDE
@group(0) @binding(6) var<uniform> u:P;
@group(0) @binding(7) var<storage,read_write> stats:array<atomic<u32>>;   // filled, abstained

// SIDE codes, matching render/holeFill.mjs's exports
const SIDE_BLEND:f32 = 0.0;
const SIDE_PREV:f32  = 1.0;
const SIDE_CUR:f32   = 2.0;

fn clampi(v:i32, lo:i32, hi:i32) -> i32 { return max(lo, min(hi, v)); }
/** "a is farther than b", with the arc's nearerIsLess convention. */
fn farther(a:f32, b:f32) -> bool { if (u.nearerIsLess == 1u) { return a > b; } return a < b; }
/** NEAREST, not bilinear: a depth buffer at a silhouette holds two surfaces and their average is no surface. */
fn depthAt(isCur:bool, x:f32, y:f32) -> f32 {
  // v4734 -- floor(x + 0.5), render/holeFill.mjs's Math.round, not round(), which ties to EVEN: at t = 0.5 an odd
  // vector samples a half pixel, and the two engines read different texels across a depth edge
  let xi = clampi(i32(floor(x + 0.5)), 0, i32(u.w) - 1);
  let yi = clampi(i32(floor(y + 0.5)), 0, i32(u.h) - 1);
  let i = u32(yi * i32(u.w) + xi);
  if (isCur) { return depthCur[i]; }
  return depthPrev[i];
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let p = g.y * u.w + g.x;
  let o = p * ${FILL_STRIDE}u;
  // every pixel writes its own slot, hole or not: a caller reading the output needs no second mask
  out[o+0u] = vecIn[p*2u]; out[o+1u] = vecIn[p*2u+1u]; out[o+2u] = zbufIn[p]; out[o+3u] = SIDE_BLEND;
  out[o+4u] = f32(holeIn[p]);
  if (holeIn[p] == 0u) { return; }

  let W = i32(u.w); let H = i32(u.h);
  var bj:i32 = -1; var bz = 0.0;         // the chosen source, per the prefer flag
  var oj:i32 = -1; var oz = 0.0; var od = 2147483647;   // the NEAREST-depth source: the occluder, for the side
  for (var dy:i32 = -u.radius; dy <= u.radius; dy = dy + 1) {
    let yy = i32(g.y) + dy; if (yy < 0 || yy >= H) { continue; }
    for (var dx:i32 = -u.radius; dx <= u.radius; dx = dx + 1) {
      let xx = i32(g.x) + dx; if (xx < 0 || xx >= W) { continue; }
      let k = yy * W + xx;
      if (holeIn[u32(k)] == 1u) { continue; }           // a neighbour that is itself still a hole
      let z = zbufIn[u32(k)];
      var want = false;
      if (bj < 0) { want = true; }
      else if (u.preferFarther == 1u) { want = farther(z, bz); }
      else { want = farther(bz, z); }
      if (want) { bj = k; bz = z; }
      // the nearest surface, and among equally near ones the spatially closest, so the occluder's position is
      // the scene's and not the scan's -- v4678 needed a hand-built case to make this reachable at all
      let d2 = dx*dx + dy*dy;
      if (oj < 0 || farther(oz, z) || (z == oz && d2 < od)) { oj = k; oz = z; od = d2; }
    }
  }
  if (bj < 0) { return; }                                // nothing within the radius; stays a hole
  let vx = vecIn[u32(bj)*2u]; let vy = vecIn[u32(bj)*2u+1u];
  out[o+0u] = vx; out[o+1u] = vy; out[o+2u] = bz; out[o+4u] = 0.0;   // filled: no longer a hole
  atomicAdd(&stats[0], 1u);

  if (u.sideMode == 1u) { out[o+3u] = SIDE_BLEND; return; }
  if (u.sideMode == 2u) { out[o+3u] = SIDE_PREV;  return; }
  if (u.sideMode == 3u) { out[o+3u] = SIDE_CUR;   return; }
  if (u.sideMode == 4u) {
    // the DISOCCLUSION TEST: a depth nearer than the background's own means that frame does not show it
    let fx = f32(g.x); let fy = f32(g.y);
    let pOcc = farther(bz, depthAt(false, fx - u.t * vx,         fy - u.t * vy));
    let cOcc = farther(bz, depthAt(true,  fx + (1.0 - u.t) * vx, fy + (1.0 - u.t) * vy));
    if (pOcc && !cOcc)      { out[o+3u] = SIDE_CUR; }
    else if (cOcc && !pOcc) { out[o+3u] = SIDE_PREV; }
    else { out[o+3u] = SIDE_BLEND; atomicAdd(&stats[1], 1u); }
    return;
  }
  // "derived": does the occluder's own motion carry it AWAY from this hole, or TOWARD it?
  let qx = oj % W; let qy = (oj - qx) / W;
  let dot = vecIn[u32(oj)*2u] * f32(i32(g.x) - qx) + vecIn[u32(oj)*2u+1u] * f32(i32(g.y) - qy);
  if (dot < 0.0)      { out[o+3u] = SIDE_CUR; }
  else if (dot > 0.0) { out[o+3u] = SIDE_PREV; }
  else { out[o+3u] = SIDE_BLEND; atomicAdd(&stats[1], 1u); }
}
`;
