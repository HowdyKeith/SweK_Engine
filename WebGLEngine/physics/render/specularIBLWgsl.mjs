// WebGLEngine/physics/render/specularIBLWgsl.mjs -- v4578
// ---------------------------------------------------------------------------------------------------------------
// THE DEVICE-SIDE SAMPLER FOR SPECULAR IBL -- term for term with specularIBLSample.mjs, the same pattern
// splitSumWgsl.mjs used for the bake math: no GLSL sibling exists to translate from, so this is hand-written and
// gated against the CPU reference on a real device rather than assumed to agree.
//
// THE ATLAS TRAVELS AS A STORAGE BUFFER, NOT A SAMPLED TEXTURE. Every fetch here is an integer-indexed
// textureLoad-equivalent (fetchTexelW), never a filtered textureSample -- probeLit.mjs's own reason applies
// unchanged: "the two backends' samplers disagree on addressing, integer reads do not." A storage buffer with
// manual indexing gets that property for free and needs no texture binding at all; wiring this to an actual
// gfx/device.js texture later is a matter of swapping fetchTexelW's body for a textureLoad call, not rewriting
// the bilinear/mip-blend logic around it.
//
// dirToFaceW is render/cubeBake.js's dirToFace, ported -- the inverse cube mapping this tree did not have until
// this arc needed a real-time sampler rather than a baker.
"use strict";

export const MAX_MIPS = 8;

export const SPECULAR_IBL_HELPERS_WGSL = /* wgsl */ `
struct FaceUV { face : i32, u : f32, v : f32 };

// render/cubeBake.js's dirToFace, term for term.
fn dirToFaceW(d : vec3<f32>) -> FaceUV {
  let ax = abs(d.x); let ay = abs(d.y); let az = abs(d.z);
  if (ax >= ay && ax >= az) {
    let ma = ax;
    if (d.x > 0.0) { return FaceUV(0, -d.z / ma, -d.y / ma); }
    return FaceUV(1, d.z / ma, -d.y / ma);
  } else if (ay >= ax && ay >= az) {
    let ma = ay;
    if (d.y > 0.0) { return FaceUV(2, d.x / ma, d.z / ma); }
    return FaceUV(3, d.x / ma, -d.z / ma);
  }
  let ma = az;
  if (d.z > 0.0) { return FaceUV(4, d.x / ma, -d.y / ma); }
  return FaceUV(5, -d.x / ma, -d.y / ma);
}
`;

/** fetchTexelW over a flat storage array (RGBA, 4 floats/texel) -- the verification dispatch's shape, unchanged
 *  from before this file's sampling core was made reusable. `atlasExpr` is the WGSL name of that array. */
export function storageFetchWgsl(atlasExpr) {
    return /* wgsl */ `
fn fetchTexelW(x : i32, y : i32) -> vec3<f32> {
  let w = i32(P.v[0].x); let h = i32(P.v[0].y);
  let cx = clamp(x, 0, w - 1); let cy = clamp(y, 0, h - 1);
  let o = (cy * w + cx) * 4;
  return vec3<f32>(${atlasExpr}[o], ${atlasExpr}[o + 1], ${atlasExpr}[o + 2]);
}
`;
}

/** fetchTexelW over a real texture_2d<f32> binding named `tAtlas` -- textureLoad, not textureSample, for the
 *  SAME reason probeLit.mjs gives: integer reads do not disagree between backends the way filtered samples do.
 *  Used by specularProbeLit.mjs, the real-material consumer this core was parameterised for. */
export const TEXTURE_FETCH_WGSL = /* wgsl */ `
fn fetchTexelW(x : i32, y : i32) -> vec3<f32> {
  let w = i32(P.v[0].x); let h = i32(P.v[0].y);
  let cx = clamp(x, 0, w - 1); let cy = clamp(y, 0, h - 1);
  return textureLoad(tAtlas, vec2<i32>(cx, cy), 0).rgb;
}
`;

/**
 * The sampling core, parameterised over WHERE fetchTexelW reads from -- `fetchImpl` is a complete WGSL function
 * definition (storageFetchWgsl(...) or TEXTURE_FETCH_WGSL), so the SAME bilinear/mip-blend/LUT logic below runs
 * unchanged whether the atlas is a verification storage buffer or a real bound texture; only the eight-line
 * fetch function differs. Params struct: `P.v` is array<vec4<f32>, 6> -- v[0]=(atlasWidth,atlasHeight,
 * faceSize0,mipCount), v[1]=(lutYOffset,lutK,lutR,caseCount), v[2..3]=mipYOffset (8 packed into two vec4s),
 * v[4..5]=mipSize (same packing).
 */
export function specularIBLCoreWgsl(fetchImpl) {
    return /* wgsl */ `
${fetchImpl}
fn mipYOffsetAt(m : i32) -> f32 { if (m < 4) { return P.v[2][m]; } return P.v[3][m - 4]; }
fn mipSizeAt(m : i32) -> f32 { if (m < 4) { return P.v[4][m]; } return P.v[5][m - 4]; }

fn bilinearFaceW(mip : i32, face : i32, u : f32, v : f32) -> vec3<f32> {
  let size = mipSizeAt(mip);
  let x0off = i32(f32(face) * P.v[0].z);
  let y0off = i32(mipYOffsetAt(mip));
  let fx = (u * 0.5 + 0.5) * size - 0.5;
  let fy = (v * 0.5 + 0.5) * size - 0.5;
  let x0 = i32(floor(fx)); let y0 = i32(floor(fy));
  let tx = fx - floor(fx); let ty = fy - floor(fy);
  let szI = i32(size);
  let c00 = fetchTexelW(x0off + clamp(x0, 0, szI - 1), y0off + clamp(y0, 0, szI - 1));
  let c10 = fetchTexelW(x0off + clamp(x0 + 1, 0, szI - 1), y0off + clamp(y0, 0, szI - 1));
  let c01 = fetchTexelW(x0off + clamp(x0, 0, szI - 1), y0off + clamp(y0 + 1, 0, szI - 1));
  let c11 = fetchTexelW(x0off + clamp(x0 + 1, 0, szI - 1), y0off + clamp(y0 + 1, 0, szI - 1));
  return mix(mix(c00, c10, tx), mix(c01, c11, tx), ty);
}

fn sampleSpecularAtlasW(dir : vec3<f32>, roughness : f32) -> vec3<f32> {
  let fuv = dirToFaceW(dir);
  let mipCount = i32(P.v[0].w);
  let r = clamp(roughness, 0.0, 1.0);
  let mipF = r * f32(mipCount - 1);
  let m0 = clamp(i32(floor(mipF)), 0, mipCount - 1);
  let m1 = clamp(m0 + 1, 0, mipCount - 1);
  let t = mipF - floor(mipF);
  let c0 = bilinearFaceW(m0, fuv.face, fuv.u, fuv.v);
  let c1 = bilinearFaceW(m1, fuv.face, fuv.u, fuv.v);
  return mix(c0, c1, t);
}

fn sampleAtlasLutW(mu : f32, alpha : f32) -> vec2<f32> {
  let K = P.v[1].y; let R = P.v[1].z;
  let lutY = i32(P.v[1].x);
  let Ki = i32(K); let Ri = i32(R);
  let fx = clamp(mu * K - 0.5, 0.0, K - 1.0);
  let fy = clamp(alpha * R - 0.5, 0.0, R - 1.0);
  let x0 = clamp(i32(floor(fx)), 0, Ki - 1); let y0 = clamp(i32(floor(fy)), 0, Ri - 1);
  let x1 = clamp(x0 + 1, 0, Ki - 1); let y1 = clamp(y0 + 1, 0, Ri - 1);
  let tx = fx - floor(fx); let ty = fy - floor(fy);
  let c00 = fetchTexelW(x0, lutY + y0); let c10 = fetchTexelW(x1, lutY + y0);
  let c01 = fetchTexelW(x0, lutY + y1); let c11 = fetchTexelW(x1, lutY + y1);
  return mix(mix(c00.xy, c10.xy, tx), mix(c01.xy, c11.xy, tx), ty);
}

fn evaluateSpecularIBLW(dir : vec3<f32>, roughness : f32, mu : f32, F0 : vec3<f32>) -> vec3<f32> {
  let env = sampleSpecularAtlasW(dir, roughness);
  let ab = sampleAtlasLutW(mu, roughness);
  let brdf = F0 * ab.x + vec3<f32>(ab.y, ab.y, ab.y);
  return env * brdf;
}
`;
}

/** The verification-only compute shader: reads test cases (stride 8: dir.xyz, roughness, mu, F0.rgb) from a
 *  storage buffer, evaluates evaluateSpecularIBLW per case, writes RGB results. binding0 output, binding1
 *  Params uniform, binding2 the flat RGBA atlas, binding3 the test cases. */
export const SPECULAR_IBL_VERIFY_WGSL = /* wgsl */ `
${SPECULAR_IBL_HELPERS_WGSL}
struct Params { v : array<vec4<f32>, 6> };
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> P : Params;
@group(0) @binding(2) var<storage, read> atlas : array<f32>;
@group(0) @binding(3) var<storage, read> cases : array<f32>;
${specularIBLCoreWgsl(storageFetchWgsl("atlas"))}

@compute @workgroup_size(32, 1, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let caseCount = u32(P.v[1].w);
  if (gid.x >= caseCount) { return; }
  let base = gid.x * 8u;
  let dir = normalize(vec3<f32>(cases[base], cases[base + 1u], cases[base + 2u]));
  let roughness = cases[base + 3u];
  let mu = cases[base + 4u];
  let F0 = vec3<f32>(cases[base + 5u], cases[base + 6u], cases[base + 7u]);
  let result = evaluateSpecularIBLW(dir, roughness, mu, F0);
  let o = gid.x * 3u;
  outBuf[o] = result.x; outBuf[o + 1u] = result.y; outBuf[o + 2u] = result.z;
}
`;

/** Pack a specularIBLSample.packSpecularAtlas() result's metadata into the flat 24-float Params.v the shader
 *  reads (caseCount filled in by the caller, at v[1].w). */
export function packSpecularParams(atlas, caseCount) {
    if (atlas.mipCount > MAX_MIPS) throw new Error(`specularIBLWgsl: ${atlas.mipCount} mips exceeds MAX_MIPS (${MAX_MIPS})`);
    const v = new Float32Array(24);
    v[0] = atlas.width; v[1] = atlas.height; v[2] = atlas.faceSize0; v[3] = atlas.mipCount;
    v[4] = atlas.lutYOffset; v[5] = atlas.lutK; v[6] = atlas.lutR; v[7] = caseCount;
    for (let i = 0; i < atlas.mipCount; i++) v[8 + i] = atlas.mipYOffset[i];
    for (let i = 0; i < atlas.mipCount; i++) v[16 + i] = atlas.mipSize[i];
    return v;
}

/** One test case, stride 8 floats, matching SPECULAR_IBL_VERIFY_WGSL's layout exactly. */
export function packSpecularCase(dir, roughness, mu, F0rgb) {
    return [dir[0], dir[1], dir[2], roughness, mu, F0rgb[0], F0rgb[1], F0rgb[2]];
}
export function packSpecularCases(cases) {
    const out = new Float32Array(cases.length * 8);
    cases.forEach((c, i) => out.set(packSpecularCase(c.dir, c.roughness, c.mu, c.F0), i * 8));
    return out;
}
