/**
 * The kernel mirror of render/frameInterp.mjs -- FSR3's frame generation on the device.
 *
 * *** THE SPLAT IS A SCATTER WITH A DEPTH COMPARE, WHICH IS THE ONLY GENUINELY HARD THING IN THIS ARC'S
 * PORTING. *** On the CPU, blocks are visited in order and "strictly nearer wins" means the first block to
 * claim a pixel keeps it against any equal-depth challenger. On a device every block runs at once, so a plain
 * write gives whichever invocation the scheduler ran last -- an answer that depends on the hardware, which is
 * precisely the defect render/dilate.mjs, render/opticalFlow.mjs and frameInterp's own CPU splat each needed a
 * tie rule written for.
 *
 * *** THE FIX REPRODUCES THE CPU'S RULE EXACTLY RATHER THAN APPROXIMATING IT, IN THREE DISPATCHES: ***
 *
 *   splatDepth   every block atomicMin's a MONOTONIC u32 KEY of its depth into the pixels it covers.
 *   splatOwner   every block whose key EQUALS the winning key atomicMin's its own BLOCK INDEX.
 *   gather       every pixel reads its owner, takes that block's vector, warps and blends.
 *
 * Two atomics because one is not enough: a single 32-bit slot cannot hold a full-precision depth key AND a
 * block index. And the second atomicMin is what makes the tie rule the CPU's -- among blocks at equal depth the
 * LOWEST INDEX wins, and the CPU's block loop visits indices in ascending order, so "the first writer keeps it"
 * and "the smallest index wins" are the same sentence. A mirror that resolved ties by anything else would agree
 * on every scene with varying depth and disagree on every flat one.
 *
 * *** THE DEPTH KEY IS THE STANDARD ORDER-PRESERVING FLOAT-TO-UINT MAP, AND IT HAS TO BE. *** Clip-space z is
 * signed, and IEEE floats do not compare as unsigned integers across zero. Flipping the sign bit for positives
 * and inverting everything for negatives makes the u32 order the float order, so atomicMin on the key is
 * atomicMin on the depth. When `nearerIsLess` is false the key is complemented instead, which turns the same
 * atomicMin into an atomicMax without a second code path.
 *
 * NO BACKTICKS IN THIS FILE'S COMMENTS: the kernel is a JS template literal and they close it.
 */
export const INTERP_STRIDE = 4;        // floats per pixel in the packed output: vecX vecY zbuf hole
export const NO_OWNER = 0xffffffff;    // the sentinel a pixel keeps when no block's footprint reached it

export const INTERP_WGSL = `
struct P { w:u32, h:u32, bw:u32, bh:u32, block:u32, nearerIsLess:u32, indexedByPrev:u32, pad:u32,
           t:f32, nan:f32, holeZ:f32, pad3:f32 };
@group(0) @binding(0) var<storage,read> prevF:array<f32>;    // w*h*4 rgba
@group(0) @binding(1) var<storage,read> curF:array<f32>;     // w*h*4 rgba
@group(0) @binding(2) var<storage,read> flow:array<f32>;     // bw*bh*2, prev->cur pixels
@group(0) @binding(3) var<storage,read> depthBlock:array<f32>;
@group(0) @binding(4) var<storage,read_write> key:array<atomic<u32>>;    // w*h
@group(0) @binding(5) var<storage,read_write> owner:array<atomic<u32>>;  // w*h
@group(0) @binding(6) var<storage,read_write> frameOut:array<f32>;       // w*h*4
@group(0) @binding(7) var<storage,read_write> packed:array<f32>;         // w*h*4, see INTERP_STRIDE
@group(0) @binding(8) var<uniform> u:P;
// *** BINDINGS 9 AND 10 ARE READ BY gatherFilled ALONE. *** gfx/device.js classifies bindings PER ENTRY POINT,
// so the three passes above neither see nor bind them -- which is what lets this kernel grow a fourth stage
// without pushing the others past the storage-binding limit that stops the whole chain being one pipeline.
@group(0) @binding(9) var<storage,read> vecFilled:array<f32>;   // w*h*2, from render/holeFillGPU.mjs
@group(0) @binding(10) var<storage,read> sideFilled:array<i32>; // w*h, SIDE_BLEND / SIDE_PREV / SIDE_CUR

// *** ORDER-PRESERVING f32 -> u32. *** See the header: signed floats do not compare as unsigned across zero.
fn depthKey(d:f32) -> u32 {
  let b = bitcast<u32>(d);
  var k:u32;
  if ((b & 0x80000000u) != 0u) { k = ~b; } else { k = b | 0x80000000u; }
  // nearerIsLess false: complement so the SAME atomicMin picks the largest depth
  if (u.nearerIsLess == 0u) { k = ~k; }
  return k;
}

/** Where a block's content sits at time t. See render/frameInterp.mjs's header on indexedBy. */
fn landing(bx:u32, by:u32) -> vec2<i32> {
  let i = by * u.bw + bx;
  let vx = flow[i*2u]; let vy = flow[i*2u+1u];
  var ax:f32; var ay:f32;
  if (u.indexedByPrev == 1u) { ax = u.t * vx;          ay = u.t * vy; }
  else                       { ax = -(1.0 - u.t) * vx; ay = -(1.0 - u.t) * vy; }
  // *** v4734 -- floor(x + 0.5), NOT round(x). *** round() ties to EVEN in WGSL and render/frameInterp.mjs's Math.round
  // ties UP, and here the tie is ordinary: at t = 0.5 an odd whole-pixel flow lands every block on a half pixel. A
  // flow of (3, -1) indexed by cur put 125 of 127 holes in different places on the two engines. v4728 found the same
  // tie in the resolve and fixed it the same way (render/temporalResolveWgsl.mjs).
  return vec2<i32>(i32(floor(f32(bx * u.block) + ax + 0.5)), i32(floor(f32(by * u.block) + ay + 0.5)));
}
fn declines(bx:u32, by:u32) -> bool {
  let i = by * u.bw + bx;
  let vx = flow[i*2u]; let vy = flow[i*2u+1u];
  // a field may decline to answer; NaN and infinity are both refusals
  return !(abs(vx) < 3.4e38) || !(abs(vy) < 3.4e38);
}

@compute @workgroup_size(8, 8)
fn splatDepth(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.bw || g.y >= u.bh) { return; }
  if (declines(g.x, g.y)) { return; }
  let s = landing(g.x, g.y);
  let k = depthKey(depthBlock[g.y * u.bw + g.x]);
  let W = i32(u.w); let H = i32(u.h); let n = i32(u.block);
  for (var y:i32 = 0; y < n; y = y + 1) {
    let py = s.y + y; if (py < 0 || py >= H) { continue; }
    if (i32(g.y * u.block) + y >= H) { continue; }   // the block's own extent stops at the frame edge
    for (var x:i32 = 0; x < n; x = x + 1) {
      let px = s.x + x; if (px < 0 || px >= W) { continue; }
      if (i32(g.x * u.block) + x >= W) { continue; }
      atomicMin(&key[u32(py * W + px)], k);
    }
  }
}

@compute @workgroup_size(8, 8)
fn splatOwner(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.bw || g.y >= u.bh) { return; }
  if (declines(g.x, g.y)) { return; }
  let s = landing(g.x, g.y);
  let i = g.y * u.bw + g.x;
  let k = depthKey(depthBlock[i]);
  let W = i32(u.w); let H = i32(u.h); let n = i32(u.block);
  for (var y:i32 = 0; y < n; y = y + 1) {
    let py = s.y + y; if (py < 0 || py >= H) { continue; }
    if (i32(g.y * u.block) + y >= H) { continue; }
    for (var x:i32 = 0; x < n; x = x + 1) {
      let px = s.x + x; if (px < 0 || px >= W) { continue; }
      if (i32(g.x * u.block) + x >= W) { continue; }
      let p = u32(py * W + px);
      // only the blocks that TIED the winning depth may claim, and among those the lowest index wins --
      // which is the CPU's "strictly nearer, so the first writer keeps it" written as an atomic
      if (atomicLoad(&key[p]) == k) { atomicMin(&owner[p], i); }
    }
  }
}

fn clampi(v:i32, lo:i32, hi:i32) -> i32 { return max(lo, min(hi, v)); }

/** Bilinear rgba fetch with clamped edges -- render/frameInterp.mjs's fetch4. */
fn fetch4(isCur:bool, x:f32, y:f32) -> vec4<f32> {
  let fx = floor(x); let fy = floor(y);
  let tx = x - fx;   let ty = y - fy;
  let W = i32(u.w); let H = i32(u.h);
  let x0 = clampi(i32(fx), 0, W-1); let x1 = clampi(i32(fx)+1, 0, W-1);
  let y0 = clampi(i32(fy), 0, H-1); let y1 = clampi(i32(fy)+1, 0, H-1);
  var o:vec4<f32>;
  for (var c:i32 = 0; c < 4; c = c + 1) {
    var a:f32; var b:f32; var d:f32; var e:f32;
    if (isCur) {
      a = curF[u32((y0*W+x0)*4+c)]; b = curF[u32((y0*W+x1)*4+c)];
      d = curF[u32((y1*W+x0)*4+c)]; e = curF[u32((y1*W+x1)*4+c)];
    } else {
      a = prevF[u32((y0*W+x0)*4+c)]; b = prevF[u32((y0*W+x1)*4+c)];
      d = prevF[u32((y1*W+x0)*4+c)]; e = prevF[u32((y1*W+x1)*4+c)];
    }
    let v = mix(mix(a, b, tx), mix(d, e, tx), ty);
    if (c == 0) { o.x = v; } else if (c == 1) { o.y = v; } else if (c == 2) { o.z = v; } else { o.w = v; }
  }
  return o;
}

/**
 * Warp from a field this kernel did not splat -- the output of render/holeFillGPU.mjs, whose holes have been
 * filled and whose pixels carry a SIDE code. *** A DISOCCLUDED PIXEL'S CONTENT IS IN ONE FRAME ONLY, *** so the
 * symmetric blend is wrong there and the side says which way to read it; render/holeFill.mjs's header measures
 * what each choice is worth. A pixel still holed after the fill is left at zero, exactly as gather leaves one.
 */
@compute @workgroup_size(8, 8)
fn gatherFilled(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let p = g.y * u.w + g.x;
  let vx = vecFilled[p*2u]; let vy = vecFilled[p*2u+1u];
  if (!(abs(vx) < 3.4e38) || !(abs(vy) < 3.4e38)) {
    for (var c:u32 = 0u; c < 4u; c = c + 1u) { frameOut[p*4u+c] = 0.0; }
    return;
  }
  let fx = f32(g.x); let fy = f32(g.y);
  let a = fetch4(false, fx - u.t * vx,         fy - u.t * vy);
  let b = fetch4(true,  fx + (1.0 - u.t) * vx, fy + (1.0 - u.t) * vy);
  let sd = sideFilled[p];
  var c:vec4<f32>;
  if (sd == 1) { c = a; } else if (sd == 2) { c = b; } else { c = a * (1.0 - u.t) + b * u.t; }
  frameOut[p*4u+0u] = c.x; frameOut[p*4u+1u] = c.y; frameOut[p*4u+2u] = c.z; frameOut[p*4u+3u] = c.w;
}

@compute @workgroup_size(8, 8)
fn gather(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.w || g.y >= u.h) { return; }
  let p = g.y * u.w + g.x;
  let o = p * ${INTERP_STRIDE}u;
  let own = atomicLoad(&owner[p]);
  if (own == ${NO_OWNER}u) {
    // *** A HOLE IS LEFT AT ZERO AND CARRIES A NaN VECTOR, EXACTLY AS THE CPU LEAVES IT. *** A cross-fade here
    // would look plausible, which is why render/frameInterp.mjs refuses to write one and this kernel does too.
    for (var c:u32 = 0u; c < 4u; c = c + 1u) { frameOut[p*4u+c] = 0.0; }
    // *** THE HOLE'S zbuf IS THE CPU'S OWN SENTINEL, NOT A NaN. *** interpolateFrameCPU fills zbuf with
    // +Infinity (or -Infinity when nearerIsLess is false) and never writes it where no block landed, so a
    // kernel putting NaN there would differ from the CPU on every holed pixel -- 190 of them on this gate's
    // fixture -- in a field render/holeFill.mjs happens never to read. Parity that holds only where a consumer
    // looks is parity with a footnote, and the footnote is the thing that rots. Passed in, like the NaN, because
    // WGSL refuses an infinite constant for the same reason it refuses a NaN one.
    packed[o+0u] = u.nan; packed[o+1u] = u.nan; packed[o+2u] = u.holeZ; packed[o+3u] = 1.0;
    return;
  }
  let vx = flow[own*2u]; let vy = flow[own*2u+1u];
  let fx = f32(g.x); let fy = f32(g.y);
  let a = fetch4(false, fx - u.t * vx,         fy - u.t * vy);
  let b = fetch4(true,  fx + (1.0 - u.t) * vx, fy + (1.0 - u.t) * vy);
  let c = a * (1.0 - u.t) + b * u.t;
  frameOut[p*4u+0u] = c.x; frameOut[p*4u+1u] = c.y; frameOut[p*4u+2u] = c.z; frameOut[p*4u+3u] = c.w;
  packed[o+0u] = vx; packed[o+1u] = vy; packed[o+2u] = depthBlock[own]; packed[o+3u] = 0.0;
}
`;
