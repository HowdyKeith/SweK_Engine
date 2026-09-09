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
import { bakeFace, prefilterEnvRGB, mipRoughness, mipAlpha, mipFaceSize } from "./specularProbeBake.mjs";
import { packSpecularAtlas, sampleSpecularAtlas } from "./specularIBLSample.mjs";
import { faceTexelDir } from "../../render/cubeBake.js";
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

/**
 * v4583 -- A FULL MIP CHAIN, CONVOLVED FROM A CAPTURE INSTEAD OF AN ANALYTIC radianceOf. specularProbeBake.
 * bakeMipChain's own shape ([{level, roughness, alpha, size, faces}, ...], mip 0 first), so packSpecularAtlas
 * and everything downstream of a chain (sampleSpecularAtlas's mip blend, specularProbeLitWgsl's ROUGHNESS
 * const) take this one exactly as they take the analytic one -- roughness was INERT on a live-captured sphere
 * only because render/probeLab.mjs's addLiveSpecSphere packed a SINGLE level (mip 0 IS the raw capture, and a
 * 1-mip atlas's mip blend always resolves to it regardless of roughness, proven in this file's own selfcheck);
 * this is the chain that makes the other mips exist.
 *
 * REUSES, NOT REDERIVES: mipRoughness/mipAlpha/mipFaceSize are specularProbeBake.mjs's own formulas (roughness
 * -> alpha through THIS ENGINE'S principled.alphaOf, the same convention every mip chain in this arc shares by
 * construction, not by two conventions happening to agree today). The convolution itself is
 * prefilterCapturedEnvRGB -- splitSum.prefilterEnv, unchanged, reading the CAPTURED texture instead of an
 * analytic function -- called once per texel per channel, the SAME per-channel-scalar-function-reused-three-
 * times shape specularProbeBake.bakeFace already uses and for the same reason (splitSum.mjs's own scalar
 * prefilterEnv, not a fresh vector-valued variant needing its own proof).
 *
 * MIP 0 IS THE INPUT CAPTURE'S OWN FACES, NOT RECONVOLVED. Running the same per-texel loop at alpha=0 would
 * reproduce it (prefilterCapturedEnvRGB's bilinear read at a texel's own centre reduces to that texel's stored
 * value exactly, since faceTexelDir's u, v land exactly on an integer texel offset there) -- but it would do so
 * through an extra bilinear round-trip this function has no reason to pay for, on what is usually the chain's
 * largest, most expensive level. `baseCapture` is asserted to actually BE the raw (alpha=0) level rather than
 * assumed, so a caller cannot silently hand this a pre-filtered level and get a mislabelled "mip 0".
 */
export function bakeCapturedMipChain(baseCapture, { mipCount = 4, minFaceSize = 3, samples = 32 } = {}) {
    if (baseCapture.alpha !== 0) throw new Error("specularProbeCapture: bakeCapturedMipChain needs the RAW (alpha=0) capture as its base, not an already-filtered level");
    const faceSize0 = baseCapture.size;
    const baseAtlas = packCapturedAtlas(baseCapture);
    const mips = [{ level: 0, roughness: mipRoughness(0, mipCount), alpha: 0, size: faceSize0, faces: baseCapture.faces }];
    for (let m = 1; m < mipCount; m++) {
        const alpha = mipAlpha(m, mipCount), size = mipFaceSize(m, faceSize0, minFaceSize);
        const faces = [];
        for (let f = 0; f < 6; f++) {
            const out = new Float32Array(size * size * 3);
            for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
                const dir = faceTexelDir(f, i, j, size);
                const [r, g, b] = prefilterCapturedEnvRGB(baseAtlas, dir, alpha, { samples });
                const o = (j * size + i) * 3;
                out[o] = r; out[o + 1] = g; out[o + 2] = b;
            }
            faces.push(out);
        }
        mips.push({ level: m, roughness: mipRoughness(m, mipCount), alpha, size, faces });
    }
    return mips;
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
