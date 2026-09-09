// fx/fsr/fsrKernels.js -- the WGSL half of fx/fsr/fsr.js: EASU as one compute pass over flat f32 rgba buffers,
// the same shape fx/anime4k's kernels use, so gfx/device.js runs it with no new capability. It mirrors easuCPU
// STATEMENT BY STATEMENT and in the reference's own lettering, because the gate holds the two to each other and a
// difference that is only a rearrangement is a difference nobody can read.
//
// One departure from @pmndrs/upscaler's port, and it is why this file exists rather than that one: the reference
// writes through `textureStore` into a `texture_storage_2d<rgba16float, write>`. gfx/device.js binds storage
// BUFFERS, not storage textures, so the output is `array<f32>` at display size. Nothing about EASU depends on the
// destination being a texture -- it computes one pixel from twelve clamped loads -- and taking the buffer form
// keeps this rung off the device's capability list. A storage-texture path is its own rung if a caller ever wants
// the result staying on the GPU as a sampled texture.
"use strict";

const EASU_WGSL = `
struct P { rw:u32, rh:u32, dw:u32, dh:u32 };
@group(0) @binding(0) var<storage,read> src:array<f32>;
@group(0) @binding(1) var<storage,read_write> dst:array<f32>;
@group(0) @binding(2) var<uniform> u:P;

// a clamped load of one render-resolution texel, rgb
fn ld(x:i32, y:i32) -> vec3<f32> {
  let xx = u32(clamp(x, 0, i32(u.rw) - 1));
  let yy = u32(clamp(y, 0, i32(u.rh) - 1));
  let o = (yy * u.rw + xx) * 4u;
  return vec3<f32>(src[o], src[o + 1u], src[o + 2u]);
}
// EASU's luma is GREEN-WEIGHTED, not Rec.709 -- the reference's own weighting
fn lum(c:vec3<f32>) -> f32 { return 0.5 * c.x + c.y + 0.5 * c.z; }

struct SetAcc { dir:vec2<f32>, len:f32 };
// gradient analysis at one of the 4 nearest texels, bilinearly weighted (FsrEasuSetF)
fn easuSet(a:SetAcc, w:f32, lA:f32, lB:f32, lC:f32, lD:f32, lE:f32) -> SetAcc {
  var o = a;
  var lenX = max(abs(lD - lC), abs(lC - lB));
  lenX = 1.0 / max(lenX, 1.0e-5);
  let dirX = lD - lB;
  o.dir.x = o.dir.x + dirX * w;
  lenX = clamp(abs(dirX) * lenX, 0.0, 1.0);
  o.len = o.len + lenX * lenX * w;

  var lenY = max(abs(lE - lC), abs(lC - lA));
  lenY = 1.0 / max(lenY, 1.0e-5);
  let dirY = lE - lA;
  o.dir.y = o.dir.y + dirY * w;
  lenY = clamp(abs(dirY) * lenY, 0.0, 1.0);
  o.len = o.len + lenY * lenY * w;
  return o;
}

struct TapAcc { c:vec3<f32>, w:f32 };
// one tap: rotate the offset into edge space, stretch it, weight by Lanczos2's polynomial form (FsrEasuTapF)
fn easuTap(a:TapAcc, off:vec2<f32>, dir:vec2<f32>, len:vec2<f32>, lob:f32, clp:f32, col:vec3<f32>) -> TapAcc {
  var v = vec2<f32>(off.x * dir.x + off.y * dir.y, off.x * (-dir.y) + off.y * dir.x);
  v = v * len;
  var d2 = dot(v, v);
  d2 = min(d2, clp);
  var wB = (2.0 / 5.0) * d2 - 1.0;
  var wA = lob * d2 - 1.0;
  wB = wB * wB;
  wA = wA * wA;
  wB = (25.0 / 16.0) * wB - (25.0 / 16.0 - 1.0);
  let w = wB * wA;
  var o = a;
  o.c = o.c + col * w;
  o.w = o.w + w;
  return o;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
  if (g.x >= u.dw || g.y >= u.dh) { return; }

  // the output pixel in render-texture space: integer base + sub-texel offset
  var ppx = (f32(g.x) + 0.5) * f32(u.rw) / f32(u.dw) - 0.5;
  var ppy = (f32(g.y) + 0.5) * f32(u.rh) / f32(u.dh) - 0.5;
  let fx = i32(floor(ppx));
  let fy = i32(floor(ppy));
  ppx = ppx - floor(ppx);
  ppy = ppy - floor(ppy);

  //     b c            the 12-tap footprint, in the reference's own lettering
  //   e f g h
  //   i j k l
  //     n o
  let cB = ld(fx, fy - 1);      let cC = ld(fx + 1, fy - 1);
  let cE = ld(fx - 1, fy);      let cF = ld(fx, fy);
  let cG = ld(fx + 1, fy);      let cH = ld(fx + 2, fy);
  let cI = ld(fx - 1, fy + 1);  let cJ = ld(fx, fy + 1);
  let cK = ld(fx + 1, fy + 1);  let cL = ld(fx + 2, fy + 1);
  let cN = ld(fx, fy + 2);      let cO = ld(fx + 1, fy + 2);

  let lB = lum(cB); let lC = lum(cC); let lE = lum(cE); let lF = lum(cF);
  let lG = lum(cG); let lH = lum(cH); let lI = lum(cI); let lJ = lum(cJ);
  let lK = lum(cK); let lL = lum(cL); let lN = lum(cN); let lO = lum(cO);

  // edge analysis at f, g, j, k, blended by the sub-texel position
  var a = SetAcc(vec2<f32>(0.0, 0.0), 0.0);
  a = easuSet(a, (1.0 - ppx) * (1.0 - ppy), lB, lE, lF, lG, lJ);
  a = easuSet(a, ppx * (1.0 - ppy),         lC, lF, lG, lH, lK);
  a = easuSet(a, (1.0 - ppx) * ppy,         lF, lI, lJ, lK, lN);
  a = easuSet(a, ppx * ppy,                 lG, lJ, lK, lL, lO);

  // kernel shaping: normalise (a flat region falls back to axis-aligned, zero strength), square the strength,
  // then stretch along the edge and squeeze across it
  var dir = a.dir;
  var dirR = dir.x * dir.x + dir.y * dir.y;
  let zro = dirR < (1.0 / 32768.0);
  dirR = inverseSqrt(max(dirR, 1.0e-12));
  if (zro) { dirR = 1.0; dir.x = 1.0; }
  dir = dir * dirR;
  var len = a.len * 0.5;
  len = len * len;
  let stretch = (dir.x * dir.x + dir.y * dir.y) / max(abs(dir.x), abs(dir.y));
  let len2 = vec2<f32>(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  let lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
  let clp = 1.0 / lob;

  // accumulation, then the dering clamp over the 4 NEAREST texels only
  var t = TapAcc(vec3<f32>(0.0, 0.0, 0.0), 0.0);
  let pp = vec2<f32>(ppx, ppy);
  t = easuTap(t, vec2<f32>( 0.0, -1.0) - pp, dir, len2, lob, clp, cB);
  t = easuTap(t, vec2<f32>( 1.0, -1.0) - pp, dir, len2, lob, clp, cC);
  t = easuTap(t, vec2<f32>(-1.0,  0.0) - pp, dir, len2, lob, clp, cE);
  t = easuTap(t, vec2<f32>( 0.0,  0.0) - pp, dir, len2, lob, clp, cF);
  t = easuTap(t, vec2<f32>( 1.0,  0.0) - pp, dir, len2, lob, clp, cG);
  t = easuTap(t, vec2<f32>( 2.0,  0.0) - pp, dir, len2, lob, clp, cH);
  t = easuTap(t, vec2<f32>(-1.0,  1.0) - pp, dir, len2, lob, clp, cI);
  t = easuTap(t, vec2<f32>( 0.0,  1.0) - pp, dir, len2, lob, clp, cJ);
  t = easuTap(t, vec2<f32>( 1.0,  1.0) - pp, dir, len2, lob, clp, cK);
  t = easuTap(t, vec2<f32>( 2.0,  1.0) - pp, dir, len2, lob, clp, cL);
  t = easuTap(t, vec2<f32>( 0.0,  2.0) - pp, dir, len2, lob, clp, cN);
  t = easuTap(t, vec2<f32>( 1.0,  2.0) - pp, dir, len2, lob, clp, cO);

  let mn = min(min(cF, cG), min(cJ, cK));
  let mx = max(max(cF, cG), max(cJ, cK));
  let pix = min(mx, max(mn, t.c / t.w));

  let o = (g.y * u.dw + g.x) * 4u;
  dst[o] = pix.x; dst[o + 1u] = pix.y; dst[o + 2u] = pix.z; dst[o + 3u] = 1.0;
}`;

export { EASU_WGSL };
