// WebGLEngine/physics/render/fresnelF82Wgsl.mjs -- v4584
//
// THE DEVICE TWIN OF physics/render/fresnelF82.mjs, HAND-WRITTEN BESIDE IT -- splitSumWgsl.mjs's convention
// (physics/render/fresnelWgsl.mjs's own pattern before it), not microfacetWgsl.mjs's GLSL-translation one: no
// GLSL sibling for this exists anywhere in the tree to translate from, so this is written directly against
// fresnelF82.mjs, term for term, and physics/render/fresnelF82Wgsl-selfcheck.mjs is the proof.
//
// NOTHING IS RE-DERIVED HERE THAT THE CPU FILE ALREADY DERIVED. MU_PIN is the same 1/7 (WGSL's own const-folder
// evaluates the division, so this is not a second hand-typed decimal); the pin weight (edgeShape at MU_PIN) is
// computed by calling edgeShapeF(MU_PIN) rather than hard-coding fresnelF82.mjs's own PIN_WEIGHT export as a
// decimal literal, which is exactly the kind of copy-transcribed constant this tree's own gates keep finding
// drifted from its source. schlickF82 is the plain pow(1-cosI, 5) form splitSumWgsl.mjs's own BRDF_LUT_WGSL
// already uses for Schlick (not fresnelWgsl.mjs's variant-flagged multiply-chain-or-pow choice -- that flag is
// specific to fresnelWgsl.mjs's own f32-precision investigation, not a convention every Schlick call must carry).
"use strict";

export const F82_TINT_WGSL = /* wgsl */ `
struct Params { fb : vec4<f32> };   // x = f0, y = b, z = count, w = pad
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> P : Params;

fn schlickF82(cosI : f32, f0 : f32) -> f32 {
  let m = 1.0 - clamp(cosI, 0.0, 1.0);
  return f0 + (1.0 - f0) * pow(m, 5.0);
}

const MU_PIN : f32 = 1.0 / 7.0;

fn edgeShapeF(mu : f32) -> f32 { return mu * pow(1.0 - mu, 6.0); }

fn f82TintF(cosI : f32, f0 : f32, b : f32) -> f32 {
  let mu = clamp(cosI, 0.0, 1.0);
  let fs = schlickF82(mu, f0);
  let fsPin = schlickF82(MU_PIN, f0);
  let pinWeight = edgeShapeF(MU_PIN);
  return fs - edgeShapeF(mu) * (fsPin - b) / pinWeight;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let count = u32(P.fb.z);
  if (gid.x >= count) { return; }
  // 0 AND 1 are both included in the grid (not fresnelWgsl.mjs's k/count, which never lands on 0) -- f82Tint has
  // no 1/cosI anywhere, so there is no grazing-incidence division to dodge, and the two exact endpoints are
  // themselves part of what this file's own selfcheck grades on the device.
  let ci = f32(gid.x) / f32(max(1u, count - 1u));
  outBuf[gid.x] = f82TintF(ci, P.fb.x, P.fb.y);
}`;

/** f0, b as plain scalars (schlickF82's own convention -- call once per channel for an RGB material, the same
 *  way every Schlick consumer in this tree already does), `count` points spanning [0, 1] inclusive. */
export function packF82Params(f0, b, count) { return new Float32Array([f0, b, count, 0]); }
