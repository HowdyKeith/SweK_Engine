/**
 * The kernel mirror of render/luminancePyramid.mjs.
 *
 * TWO entry points and they are not the same shape: `base` turns an rgba frame into a luminance field,
 * `reduce` halves a luminance field. The runner dispatches `base` once and `reduce` once per level, which
 * is a dispatch per mip rather than FSR2's single-pass SPD -- SPD's whole trick is a global atomic counter
 * letting one dispatch do every level, and that is an optimisation with its own correctness argument that
 * this tree has not made. A chain of small dispatches computes the same numbers and is the thing that can
 * be checked against the CPU level by level.
 *
 * NO BACKTICKS IN THIS FILE'S COMMENTS: the kernel is a JS template literal and they close it.
 */
export const LUMA_PYRAMID_WGSL = `
struct P { w:u32, h:u32, pw:u32, ph:u32 };
@group(0) @binding(0) var<storage,read> srcRGBA:array<f32>;
@group(0) @binding(1) var<storage,read> srcLum:array<f32>;
@group(0) @binding(2) var<storage,read_write> dst:array<f32>;
@group(0) @binding(3) var<uniform> u:P;

// render/temporalReject.mjs's luma, and NOT a second convention. 0.25/0.5/0.25 is the Y of the YCoCg the
// accumulate pass already clamps in; a pyramid weighting colour differently from the pass that consumes it
// would be two definitions of brightness in one pipeline.
fn lum(r:f32, g:f32, b:f32) -> f32 { return 0.25 * r + 0.5 * g + 0.25 * b; }

@compute @workgroup_size(8,8,1)
fn base(@builtin(global_invocation_id) gid:vec3<u32>) {
  if (gid.x >= u.w || gid.y >= u.h) { return; }
  let i = gid.y * u.w + gid.x;
  dst[i] = lum(srcRGBA[i * 4u], srcRGBA[i * 4u + 1u], srcRGBA[i * 4u + 2u]);
}

// CLAMPED, not dropped. A 2x2 average of an odd-width row has to do something with the last column, and
// dropping it is the plausible-looking choice that quietly stops the chain being an average of the frame.
// The cost is that the last row and column are read TWICE, which biases small mips; the CPU mirror's
// header carries the measurement of how much, and it is a fraction of a percent at this tree's sizes.
@compute @workgroup_size(8,8,1)
fn reduce(@builtin(global_invocation_id) gid:vec3<u32>) {
  if (gid.x >= u.w || gid.y >= u.h) { return; }
  let x0 = min(2u * gid.x, u.pw - 1u);
  let x1 = min(2u * gid.x + 1u, u.pw - 1u);
  let y0 = min(2u * gid.y, u.ph - 1u);
  let y1 = min(2u * gid.y + 1u, u.ph - 1u);
  dst[gid.y * u.w + gid.x] = 0.25 * (srcLum[y0 * u.pw + x0] + srcLum[y0 * u.pw + x1] +
                                     srcLum[y1 * u.pw + x0] + srcLum[y1 * u.pw + x1]);
}`;
