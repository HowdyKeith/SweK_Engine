// WebGLEngine/physics/render/specularProbeCapture.mjs -- v4580
// ---------------------------------------------------------------------------------------------------------------
// THE LAST NAMED GAP IN THE SPECULAR-IBL ARC: "the GPU prefilter shader reads an ANALYTIC env(dir) today, not a
// captured cubemap texture" (specularProbeBake.mjs's own header, echoed in splitSumWgsl.mjs's and
// specularIBLWgsl-selfcheck.mjs's). This closes it -- the prefilter convolution now runs on a device against a
// REAL bound texture, not a WGSL function computing radiance inline.
//
// *** "CAPTURE" NEEDED NO NEW BAKING CODE, BECAUSE THIS TREE ALREADY HAD IT, EXACTLY. *** principled.alphaOf(0)
// is `0 * 0 = 0` -- not "nearly zero", the literal f64 value -- and splitSum.sampleGgxHalf(u1, u2, alpha=0) gives
// `ct = sqrt((1-u2)/(1+(0-1)*u2)) = sqrt((1-u2)/(1-u2)) = 1` for every u2 short of exactly 1 (which the
// Hammersley sequence never lands on for any realistic sample count). ct=1 means H=(0,0,1) in the local frame --
// H=R after the tangent transform -- for EVERY sample, so prefilterEnv's importance-sampled convolution
// collapses to L=R deterministically: mip 0 of ANY specularProbeBake.bakeMipChain() result already IS a raw,
// UNFILTERED, point-sampled capture, not an approximation of one. This file bakes that single level directly
// (bakeFace at alpha=0, samples=1 -- more samples would not change a single output bit) rather than inventing a
// second capture code path beside the one this tree already ships and gates three times over.
//
// PACKING REUSES specularIBLSample.packSpecularAtlas UNCHANGED, WITH AN EMPTY LUT REGION (K=R=0) RATHER THAN A
// NEW LAYOUT: one mip, no LUT, produces exactly the six-faces-side-by-side block that format already knows how
// to write and that sampleSpecularAtlas already knows how to read -- and a 1-mip atlas's mipCount-1 is 0, so
// sampleSpecularAtlas(atlas, dir, ANY roughness) always resolves to mip 0 by construction, which is this file's
// sampleCapturedCubemap. A second atlas format and a second sampler would be declaring the same shape twice.
//
// THE DEVICE SIDE IS GENUINELY NEW: CAPTURED_ENV_WGSL reads a real bound texture_2d<f32> (textureLoad, manual
// bilinear -- probeLit.mjs's own reason: integer reads do not disagree between backends the way filtered samples
// do) via dirToFaceW (specularIBLWgsl.mjs's SPECULAR_IBL_HELPERS_WGSL, reused rather than a fourth copy), and
// plugs into splitSumWgsl.mjs's prefilterCoreWgsl(envImpl) the same way specularIBLWgsl.mjs's TEXTURE_FETCH_WGSL
// plugged into specularIBLCoreWgsl(fetchImpl) -- one accumulation loop, a swapped-in source. tools/ship/
// headlessGpu.mjs's runWgslComputeNative grew a `texture` option to carry the atlas in at all; see that file's
// own v4580 note for why this generalises rather than duplicates specularProbeLit-selfcheck.mjs's earlier
// hand-rolled shim for the same texture-in/buffer-out shape.
//
// STILL NOT CLAIMED: the "captured" scene is specularProbeBake's own splatRadiance-driven radianceOf function,
// point-sampled through this tree's existing cube-bake geometry -- not a real-time rasterised frame of the
// gpuDriven scene's actual fleets. Rendering the LIVE scene into these six faces (a real camera per face, drawn
// through gfx/device.js) is real-time/dynamic-capture territory, a distinct, larger piece of work on top of this
// one, not inside it -- this file closes "the prefilter can read a captured texture", not "the capture is a live
// render".
"use strict";
import { bakeFace, prefilterEnvRGB } from "./specularProbeBake.mjs";
import { packSpecularAtlas, sampleSpecularAtlas } from "./specularIBLSample.mjs";
import { SPLIT_SUM_HELPERS_WGSL, prefilterCoreWgsl, packPrefilterCase, packPrefilterCases } from "./splitSumWgsl.mjs";
import { SPECULAR_IBL_HELPERS_WGSL } from "./specularIBLWgsl.mjs";
import { toHalf, fromHalf } from "../../text/slugAtlas.js";

// ================================================================================================
// CPU: THE CAPTURE, ITS ATLAS, AND THE REFERENCE THE DEVICE IS GRADED AGAINST
// ================================================================================================

/** Six faces, ONE unfiltered level, of `radianceOf` at `pos` -- alpha=0 exactly, so this is bakeFace's own
 *  prefilterEnvRGB collapsing to a point sample rather than a second, parallel "raw capture" routine. Shaped
 *  like one entry of bakeMipChain()'s array ({level, roughness, alpha, size, faces}) so packSpecularAtlas can
 *  take it directly. */
export function captureBaseCubemap(radianceOf, pos, size) {
    const faces = [];
    for (let f = 0; f < 6; f++) faces.push(bakeFace(radianceOf, pos, f, size, 0, { samples: 1 }));
    return { level: 0, roughness: 0, alpha: 0, size, faces };
}

const EMPTY_LUT = Object.freeze({ K: 0, R: 0, A: [], B: [] });

/** The capture packed into a flat atlas -- packSpecularAtlas with a single mip and no LUT, not a new layout. */
export function packCapturedAtlas(capture) {
    return packSpecularAtlas([capture], EMPTY_LUT);
}

/** Bilinear read of the captured atlas at a direction. A 1-mip atlas's (mipCount - 1) is 0, so
 *  sampleSpecularAtlas's roughness argument multiplies out to 0 regardless of what is passed -- this always
 *  resolves to the one level that exists, which is asserted (not just argued) in this file's own selfcheck. */
export function sampleCapturedCubemap(atlas, dir) { return sampleSpecularAtlas(atlas, dir, 0); }

/** The SAME half-round-trip discipline probeLit.mjs's halfGrid and specularProbeLit.specularAtlasHalves already
 *  use: a device check and its CPU twin should read identical numbers, which means the CPU side reads the atlas
 *  AFTER the precision loss the rgba16float upload actually applies, not before it. */
export function captureAtlasHalves(atlas) {
    const out = new Float32Array(atlas.data.length);
    for (let i = 0; i < atlas.data.length; i++) out[i] = fromHalf(toHalf(atlas.data[i]));
    return { ...atlas, data: out };
}

/** The ground truth the device's texture-backed prefilter is graded against: splitSum's own prefilterEnv (via
 *  specularProbeBake's prefilterEnvRGB, three channel calls, unchanged), fed an env(dir) that reads the CAPTURED
 *  atlas instead of calling radianceOf directly -- so what is measured is the sampling+convolution logic, not
 *  whether packing round-trips (that is specularProbeBake-selfcheck.mjs's and cubeBake-selfcheck.mjs's job). */
export function prefilterCapturedEnvRGB(atlas, R, alpha, opts) {
    return prefilterEnvRGB((_pos, d) => sampleCapturedCubemap(atlas, d), null, R, alpha, opts);
}

// ================================================================================================
// WGSL: A TEXTURE-BACKED ENVIRONMENT FOR prefilterCoreWgsl, AND THE VERIFY SHADER BUILT FROM IT
// ================================================================================================

/** envSample(d, sel) reading a REAL bound texture -- `sel` here means "which colour channel" (0/1/2), the same
 *  generic slot prefilterCoreWgsl's analytic implementation reads as "which test pattern". `P.v.y`/`P.v.z` are
 *  the atlas width and the (single) face size; the includer declares a matching `P : PfParams` and `tAtlas`. This
 *  is the FOURTH hand transcription of this tree's manual-bilinear-over-a-cube-face algorithm (CPU
 *  specularIBLSample.bilinearFace, WGSL storage-buffer specularIBLWgsl.mjs, WGSL/GLSL texture-backed
 *  specularProbeLit.mjs) -- kept explicit rather than shared, the same call this whole arc has made each time:
 *  no automatic translator moves branching code between CPU JS, WGSL and GLSL. */
export const CAPTURED_ENV_WGSL = /* wgsl */ `
fn captureFetch(x : i32, y : i32) -> vec3<f32> {
  let w = i32(P.v.y); let h = i32(P.v.z);
  let cx = clamp(x, 0, w - 1); let cy = clamp(y, 0, h - 1);
  return textureLoad(tAtlas, vec2<i32>(cx, cy), 0).rgb;
}
fn bilinearCapture(face : i32, u : f32, v : f32) -> vec3<f32> {
  let size = P.v.z;
  let x0off = i32(f32(face) * size);
  let fx = (u * 0.5 + 0.5) * size - 0.5;
  let fy = (v * 0.5 + 0.5) * size - 0.5;
  let x0 = i32(floor(fx)); let y0 = i32(floor(fy));
  let tx = fx - floor(fx); let ty = fy - floor(fy);
  let szI = i32(size);
  let c00 = captureFetch(x0off + clamp(x0, 0, szI - 1), clamp(y0, 0, szI - 1));
  let c10 = captureFetch(x0off + clamp(x0 + 1, 0, szI - 1), clamp(y0, 0, szI - 1));
  let c01 = captureFetch(x0off + clamp(x0, 0, szI - 1), clamp(y0 + 1, 0, szI - 1));
  let c11 = captureFetch(x0off + clamp(x0 + 1, 0, szI - 1), clamp(y0 + 1, 0, szI - 1));
  return mix(mix(c00, c10, tx), mix(c01, c11, tx), ty);
}
fn envSample(d : vec3<f32>, sel : u32) -> f32 {
  let fuv = dirToFaceW(d);
  let c = bilinearCapture(fuv.face, fuv.u, fuv.v);
  if (sel == 0u) { return c.x; }
  if (sel == 1u) { return c.y; }
  return c.z;
}
`;

/**
 * The whole texture-backed prefilter, one thread per (direction, alpha, channel) case -- stride 8, reusing
 * splitSumWgsl.mjs's packPrefilterCase/packPrefilterCases wire format unchanged (its `envKind` slot IS `sel`,
 * read here as a channel index instead of a test-pattern index; same bytes, different WGSL on the other end).
 * Binding 0: output (one f32 per case). Binding 1: uniform { caseCount, atlasWidth, faceSize, pad }.
 * Binding 2: the captured atlas texture. Binding 3: input cases.
 */
export const CAPTURED_PREFILTER_WGSL = /* wgsl */ `
${SPLIT_SUM_HELPERS_WGSL}
${SPECULAR_IBL_HELPERS_WGSL}
struct PfParams { v : vec4<f32> };
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> P : PfParams;
@group(0) @binding(2) var tAtlas : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> cases : array<f32>;
${prefilterCoreWgsl(CAPTURED_ENV_WGSL)}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let caseCount = u32(P.v.x);
  if (gid.x >= caseCount) { return; }
  let base = gid.x * 8u;
  let R = normalize(vec3<f32>(cases[base], cases[base + 1u], cases[base + 2u]));
  let alpha = cases[base + 3u];
  let channel = u32(cases[base + 4u]);
  let samples = u32(cases[base + 5u]);
  outBuf[gid.x] = prefilterChannel(R, alpha, channel, samples);
}
`;

/** { caseCount, atlasWidth, faceSize, pad } as the vec4-aligned uniform CAPTURED_PREFILTER_WGSL reads. */
export function packCapturedPrefilterParams(atlas, caseCount) {
    return new Float32Array([caseCount, atlas.width, atlas.faceSize0, 0]);
}

export { packPrefilterCase, packPrefilterCases };
