// WebGLEngine/physics/render/specularProbeLit.mjs -- v4579 (Specular Probes 1: the device-side material)
// ---------------------------------------------------------------------------------------------------------------
// A MESH LIT BY THE SPECULAR-IBL ATLAS, ON BOTH BACKENDS -- specularIBLWgsl.mjs's own named remainder closed:
// "this atlas is a storage buffer, not a gfx/device.js texture, and nothing in the live renderer binds it to a
// real material's fragment shader." This is that binding, on the SAME pattern render/probeLit.mjs used for the
// diffuse half: a real device.texture(), a real renderPipelineDesc, a real bind hook a gpuDriven fleet can use.
//
// THE ATLAS'S LAYOUT IS BAKED AS SHADER CONSTS, NOT PASSED AS A UNIFORM. gfx/device.js's uniform system
// (_uniformLayout in gfx/device.js) only knows f32/vec2/vec3/vec4/mat4 -- there is no "array of vec4" a single
// named uniform could carry, which is what specularIBLWgsl.mjs's verification Params struct needed. The atlas's
// width, height, per-mip offsets and sizes are FIXED the moment the atlas is baked and packed, before this
// shader is ever compiled -- exactly the shape render/litSphere.mjs's and render/probeLit.mjs's own tintChain
// already bakes a fixed palette into shader text as an if-chain rather than routing it through a uniform. This
// module does the same for atlas geometry, and for roughness and F0 besides: ONE PIPELINE PER (roughness, F0)
// MATERIAL INSTANCE, not a per-instance uniform, so a roughness-gradient row of spheres is several small
// pipelines through the SAME multi-fleet mechanism probeLab.mjs already draws splats and probes with -- not a
// new one.
//
// THE VERTEX STAGE IS ITS OWN, NOT litSphere's reused: litVertexGlsl() forwards tint/emissive varyings this
// material has no use for and none for world-space VIEW direction's counterpart (eye position lives in Cam
// here, not per-vertex), so a small dedicated vs() carries exactly {world, normal} and nothing else -- still the
// same LAYOUTS.lit attribute slots every lit-family shader shares, extra accepted and unused.
//
// SAMPLING IS THE SAME EIGHT-TAP LOGIC specularIBLWgsl.mjs's core already has, over a REAL bound texture via
// textureLoad (never textureSample) -- probeLit.mjs's own reason: "the two backends' samplers disagree on
// addressing, integer reads do not."
"use strict";
import { LAYOUTS, renderPipelineDesc } from "../../render/gpuDriven.mjs";
import { toHalf, fromHalf } from "../../text/slugAtlas.js";
import { dirToFace } from "../../render/cubeBake.js";

const f6 = (v) => (Number.isFinite(v) ? v : 0).toFixed(6);

/** The atlas (specularIBLSample.packSpecularAtlas's output) as a half-float rgba texture -- probeLit.probeAtlas's
 *  own conversion, reused rather than a second half-float codec: toHalf/fromHalf from text/slugAtlas.js. */
export function specularAtlasTexture(atlas) {
    const data = new Uint16Array(atlas.data.length);
    for (let i = 0; i < atlas.data.length; i++) data[i] = toHalf(atlas.data[i]);
    return { width: atlas.width, height: atlas.height, data };
}
export function uploadSpecularAtlas(device, atlas) {
    const t = specularAtlasTexture(atlas);
    return device.texture({ format: "rgba16float", width: t.width, height: t.height, data: t.data, nearest: true });
}
/** The grid a CPU twin reads: the SAME halves the texture holds, round-tripped back to f32 -- so a device check
 *  and its CPU reference start from identical numbers, the same discipline probeLit.mjs's halfGrid documents. */
export function specularAtlasHalves(atlas) {
    const t = specularAtlasTexture(atlas), out = new Float32Array(t.data.length);
    for (let i = 0; i < t.data.length; i++) out[i] = fromHalf(t.data[i]);
    return { ...atlas, data: out };
}

/** The atlas's fixed geometry, as WGSL consts -- MIP_COUNT capped at 4 for this material (a deliberate, stated
 *  simplification against specularIBLWgsl.mjs's 8-mip verification headroom: four levels -- mirror, two
 *  intermediate, fully rough -- is enough to show the chain working and keeps this shader's const block small). */
export function atlasConstsWgsl(atlas) {
    if (atlas.mipCount > 4) throw new Error(`specularProbeLit: ${atlas.mipCount} mips exceeds this material's cap of 4 -- bake with mipCount<=4 for the real-time path`);
    const mipY = atlas.mipYOffset.slice(); while (mipY.length < 4) mipY.push(mipY[mipY.length - 1] ?? 0);
    const mipSize = atlas.mipSize.slice(); while (mipSize.length < 4) mipSize.push(1);
    return /* wgsl */ `
const ATLAS_W : f32 = ${f6(atlas.width)};
const ATLAS_H : f32 = ${f6(atlas.height)};
const FACE_SIZE0 : f32 = ${f6(atlas.faceSize0)};
const MIP_COUNT : f32 = ${f6(atlas.mipCount)};
const LUT_Y : f32 = ${f6(atlas.lutYOffset)};
const LUT_K : f32 = ${f6(atlas.lutK)};
const LUT_R : f32 = ${f6(atlas.lutR)};
const MIP_Y : array<f32, 4> = array<f32, 4>(${mipY.map(f6).join(", ")});
const MIP_SIZE : array<f32, 4> = array<f32, 4>(${mipSize.map(f6).join(", ")});
`;
}
export function atlasConstsGlsl(atlas) {
    if (atlas.mipCount > 4) throw new Error(`specularProbeLit: ${atlas.mipCount} mips exceeds this material's cap of 4`);
    const mipY = atlas.mipYOffset.slice(); while (mipY.length < 4) mipY.push(mipY[mipY.length - 1] ?? 0);
    const mipSize = atlas.mipSize.slice(); while (mipSize.length < 4) mipSize.push(1);
    return `
const float ATLAS_W = ${f6(atlas.width)};
const float ATLAS_H = ${f6(atlas.height)};
const float FACE_SIZE0 = ${f6(atlas.faceSize0)};
const float MIP_COUNT = ${f6(atlas.mipCount)};
const float LUT_Y = ${f6(atlas.lutYOffset)};
const float LUT_K = ${f6(atlas.lutK)};
const float LUT_R = ${f6(atlas.lutR)};
const float MIP_Y[4] = float[4](${mipY.map(f6).join(", ")});
const float MIP_SIZE[4] = float[4](${mipSize.map(f6).join(", ")});
`;
}

/** dirToFace, sampling and the BRDF combine -- term for term with specularIBLWgsl.mjs's core and
 *  specularIBLSample.mjs's CPU reference, reading the consts above instead of a runtime Params buffer. */
export const SPECULAR_MATERIAL_CORE_WGSL = /* wgsl */ `
struct FaceUV { face : i32, u : f32, v : f32 };
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
fn fetchTexelM(x : i32, y : i32) -> vec3<f32> {
  let cx = clamp(x, 0, i32(ATLAS_W) - 1); let cy = clamp(y, 0, i32(ATLAS_H) - 1);
  return textureLoad(tAtlas, vec2<i32>(cx, cy), 0).rgb;
}
// MIP_SIZE[mip] / MIP_Y[mip] by a RUNTIME mip would be exactly the thing render/litSphere.mjs's own header
// already found broken: "WGSL cannot index a const array by a runtime value" -- an if-chain, not a dynamic
// index, the same fix that file's tint palette uses.
fn mipSizeAt(mip : i32) -> f32 { if (mip <= 0) { return MIP_SIZE[0]; } if (mip == 1) { return MIP_SIZE[1]; } if (mip == 2) { return MIP_SIZE[2]; } return MIP_SIZE[3]; }
fn mipYAt(mip : i32) -> f32 { if (mip <= 0) { return MIP_Y[0]; } if (mip == 1) { return MIP_Y[1]; } if (mip == 2) { return MIP_Y[2]; } return MIP_Y[3]; }
fn bilinearFaceM(mip : i32, face : i32, u : f32, v : f32) -> vec3<f32> {
  let size = mipSizeAt(mip);
  let x0off = i32(f32(face) * FACE_SIZE0);
  let y0off = i32(mipYAt(mip));
  let fx = (u * 0.5 + 0.5) * size - 0.5;
  let fy = (v * 0.5 + 0.5) * size - 0.5;
  let x0 = i32(floor(fx)); let y0 = i32(floor(fy));
  let tx = fx - floor(fx); let ty = fy - floor(fy);
  let szI = i32(size);
  let c00 = fetchTexelM(x0off + clamp(x0, 0, szI - 1), y0off + clamp(y0, 0, szI - 1));
  let c10 = fetchTexelM(x0off + clamp(x0 + 1, 0, szI - 1), y0off + clamp(y0, 0, szI - 1));
  let c01 = fetchTexelM(x0off + clamp(x0, 0, szI - 1), y0off + clamp(y0 + 1, 0, szI - 1));
  let c11 = fetchTexelM(x0off + clamp(x0 + 1, 0, szI - 1), y0off + clamp(y0 + 1, 0, szI - 1));
  return mix(mix(c00, c10, tx), mix(c01, c11, tx), ty);
}
fn sampleSpecularAtlasM(dir : vec3<f32>, roughness : f32) -> vec3<f32> {
  let fuv = dirToFaceW(dir);
  let r = clamp(roughness, 0.0, 1.0);
  let mipF = r * (MIP_COUNT - 1.0);
  let m0 = clamp(i32(floor(mipF)), 0, i32(MIP_COUNT) - 1);
  let m1 = clamp(m0 + 1, 0, i32(MIP_COUNT) - 1);
  let t = mipF - floor(mipF);
  let c0 = bilinearFaceM(m0, fuv.face, fuv.u, fuv.v);
  let c1 = bilinearFaceM(m1, fuv.face, fuv.u, fuv.v);
  return mix(c0, c1, t);
}
fn sampleAtlasLutM(mu : f32, alpha : f32) -> vec2<f32> {
  let fx = clamp(mu * LUT_K - 0.5, 0.0, LUT_K - 1.0);
  let fy = clamp(alpha * LUT_R - 0.5, 0.0, LUT_R - 1.0);
  let Ki = i32(LUT_K); let Ri = i32(LUT_R);
  let x0 = clamp(i32(floor(fx)), 0, Ki - 1); let y0 = clamp(i32(floor(fy)), 0, Ri - 1);
  let x1 = clamp(x0 + 1, 0, Ki - 1); let y1 = clamp(y0 + 1, 0, Ri - 1);
  let tx = fx - floor(fx); let ty = fy - floor(fy);
  let c00 = fetchTexelM(x0, i32(LUT_Y) + y0); let c10 = fetchTexelM(x1, i32(LUT_Y) + y0);
  let c01 = fetchTexelM(x0, i32(LUT_Y) + y1); let c11 = fetchTexelM(x1, i32(LUT_Y) + y1);
  return mix(mix(c00.xy, c10.xy, tx), mix(c01.xy, c11.xy, tx), ty);
}
`;

export function specularProbeLitWgsl(atlas, { roughness = 0.5, F0 = [0.04, 0.04, 0.04] } = {}) {
    return `
${atlasConstsWgsl(atlas)}
const ROUGHNESS : f32 = ${f6(roughness)};
const F0 : vec3<f32> = vec3<f32>(${f6(F0[0])}, ${f6(F0[1])}, ${f6(F0[2])});
struct Cam { viewProj : mat4x4<f32>, eye : vec4<f32> };
@group(0) @binding(0) var<uniform> cam : Cam;
@group(0) @binding(1) var tAtlas : texture_2d<f32>;
struct VOut { @builtin(position) pos : vec4<f32>, @location(0) n : vec3<f32>, @location(1) w : vec3<f32> };
${SPECULAR_MATERIAL_CORE_WGSL}
@vertex fn vs(@location(0) p : vec3<f32>, @location(1) color : vec4<f32>, @location(2) rec : vec4<f32>, @location(4) n : vec3<f32>, @location(5) extra : vec4<f32>) -> VOut {
  var o : VOut;
  let w = rec.xyz + p * rec.w;
  o.pos = cam.viewProj * vec4<f32>(w, 1.0);
  o.n = n; o.w = w;
  return o;
}
@fragment fn fs(v : VOut) -> @location(0) vec4<f32> {
  let n = normalize(v.n);
  let eyeDir = normalize(cam.eye.xyz - v.w);
  let mu = max(0.0, dot(n, eyeDir));
  let r = reflect(-eyeDir, n);
  let env = sampleSpecularAtlasM(r, ROUGHNESS);
  let ab = sampleAtlasLutM(mu, ROUGHNESS);
  let brdf = F0 * ab.x + vec3<f32>(ab.y, ab.y, ab.y);
  return vec4<f32>(env * brdf, 1.0);
}
`;
}

/** dirToFace/sample/LUT/combine, GLSL -- a THIRD hand transcription of the same eight-tap logic (after the CPU
 *  reference and the WGSL core), because this tree ships every material in both languages and no automatic
 *  translator exists for this shape of code (microfacetWgsl.mjs's glslFnToWgsl handles single-expression
 *  functions; this one branches and loops). Graded against the CPU reference the same way the WGSL core is. */
export function specularMaterialCoreGlsl(atlas) {
    return `${atlasConstsGlsl(atlas)}
vec3 fetchTexelM(int x, int y) {
  int cx = clamp(x, 0, int(ATLAS_W) - 1); int cy = clamp(y, 0, int(ATLAS_H) - 1);
  return texelFetch(tAtlas, ivec2(cx, cy), 0).rgb;
}
struct FaceUV { int face; float u; float v; };
FaceUV dirToFaceG(vec3 d) {
  float ax = abs(d.x); float ay = abs(d.y); float az = abs(d.z);
  FaceUV r;
  if (ax >= ay && ax >= az) {
    float ma = ax;
    if (d.x > 0.0) { r.face = 0; r.u = -d.z / ma; r.v = -d.y / ma; } else { r.face = 1; r.u = d.z / ma; r.v = -d.y / ma; }
  } else if (ay >= ax && ay >= az) {
    float ma = ay;
    if (d.y > 0.0) { r.face = 2; r.u = d.x / ma; r.v = d.z / ma; } else { r.face = 3; r.u = d.x / ma; r.v = -d.z / ma; }
  } else {
    float ma = az;
    if (d.z > 0.0) { r.face = 4; r.u = d.x / ma; r.v = -d.y / ma; } else { r.face = 5; r.u = -d.x / ma; r.v = -d.y / ma; }
  }
  return r;
}
float mipSizeAt(int mip) { if (mip <= 0) return MIP_SIZE[0]; if (mip == 1) return MIP_SIZE[1]; if (mip == 2) return MIP_SIZE[2]; return MIP_SIZE[3]; }
float mipYAt(int mip) { if (mip <= 0) return MIP_Y[0]; if (mip == 1) return MIP_Y[1]; if (mip == 2) return MIP_Y[2]; return MIP_Y[3]; }
vec3 bilinearFaceG(int mip, int face, float u, float v) {
  float size = mipSizeAt(mip);
  int x0off = int(float(face) * FACE_SIZE0);
  int y0off = int(mipYAt(mip));
  float fx = (u * 0.5 + 0.5) * size - 0.5;
  float fy = (v * 0.5 + 0.5) * size - 0.5;
  int x0 = int(floor(fx)); int y0 = int(floor(fy));
  float tx = fx - floor(fx); float ty = fy - floor(fy);
  int szI = int(size);
  vec3 c00 = fetchTexelM(x0off + clamp(x0, 0, szI - 1), y0off + clamp(y0, 0, szI - 1));
  vec3 c10 = fetchTexelM(x0off + clamp(x0 + 1, 0, szI - 1), y0off + clamp(y0, 0, szI - 1));
  vec3 c01 = fetchTexelM(x0off + clamp(x0, 0, szI - 1), y0off + clamp(y0 + 1, 0, szI - 1));
  vec3 c11 = fetchTexelM(x0off + clamp(x0 + 1, 0, szI - 1), y0off + clamp(y0 + 1, 0, szI - 1));
  return mix(mix(c00, c10, tx), mix(c01, c11, tx), ty);
}
vec3 sampleSpecularAtlasG(vec3 dir, float roughness) {
  FaceUV fuv = dirToFaceG(dir);
  float r = clamp(roughness, 0.0, 1.0);
  float mipF = r * (MIP_COUNT - 1.0);
  int m0 = clamp(int(floor(mipF)), 0, int(MIP_COUNT) - 1);
  int m1 = clamp(m0 + 1, 0, int(MIP_COUNT) - 1);
  float t = mipF - floor(mipF);
  vec3 c0 = bilinearFaceG(m0, fuv.face, fuv.u, fuv.v);
  vec3 c1 = bilinearFaceG(m1, fuv.face, fuv.u, fuv.v);
  return mix(c0, c1, t);
}
vec2 sampleAtlasLutG(float mu, float alpha) {
  float fx = clamp(mu * LUT_K - 0.5, 0.0, LUT_K - 1.0);
  float fy = clamp(alpha * LUT_R - 0.5, 0.0, LUT_R - 1.0);
  int Ki = int(LUT_K); int Ri = int(LUT_R);
  int x0 = clamp(int(floor(fx)), 0, Ki - 1); int y0 = clamp(int(floor(fy)), 0, Ri - 1);
  int x1 = clamp(x0 + 1, 0, Ki - 1); int y1 = clamp(y0 + 1, 0, Ri - 1);
  float tx = fx - floor(fx); float ty = fy - floor(fy);
  vec3 c00 = fetchTexelM(x0, int(LUT_Y) + y0); vec3 c10 = fetchTexelM(x1, int(LUT_Y) + y0);
  vec3 c01 = fetchTexelM(x0, int(LUT_Y) + y1); vec3 c11 = fetchTexelM(x1, int(LUT_Y) + y1);
  return mix(mix(c00.xy, c10.xy, tx), mix(c01.xy, c11.xy, tx), ty);
}
`;
}

export function specularProbeLitVertexGlsl() { return `#version 300 es
precision highp float;
uniform mat4 viewProj;
in vec3 p; in vec4 color; in vec4 rec; in vec3 n; in vec4 extra;
out vec3 vN; out vec3 vW;
void main() {
  vec3 w = rec.xyz + p * rec.w;
  gl_Position = viewProj * vec4(w, 1.0);
  vN = n; vW = w;
}
`; }

export function specularProbeLitFragmentGlsl(atlas, { roughness = 0.5, F0 = [0.04, 0.04, 0.04] } = {}) {
    return `#version 300 es
precision highp float;
uniform vec4 eye;
uniform sampler2D tAtlas;
in vec3 vN; in vec3 vW;
out vec4 fragColor;
const float ROUGHNESS = ${f6(roughness)};
const vec3 F0 = vec3(${f6(F0[0])}, ${f6(F0[1])}, ${f6(F0[2])});
${specularMaterialCoreGlsl(atlas)}
void main() {
  vec3 n = normalize(vN);
  vec3 eyeDir = normalize(eye.xyz - vW);
  float mu = max(0.0, dot(n, eyeDir));
  vec3 r = reflect(-eyeDir, n);
  vec3 env = sampleSpecularAtlasG(r, ROUGHNESS);
  vec2 ab = sampleAtlasLutG(mu, ROUGHNESS);
  vec3 brdf = F0 * ab.x + vec3(ab.y);
  fragColor = vec4(env * brdf, 1.0);
}
`;
}

export function specularProbeLitPipelineDesc(atlas, { roughness = 0.5, F0 = [0.04, 0.04, 0.04], cull = null, frontFace = null, blend = null } = {}) {
    return renderPipelineDesc({
        layout: LAYOUTS.lit,
        shaders: { wgsl: specularProbeLitWgsl(atlas, { roughness, F0 }), glsl: { vertex: specularProbeLitVertexGlsl(), fragment: specularProbeLitFragmentGlsl(atlas, { roughness, F0 }) } },
        uniforms: [{ name: "viewProj", type: "mat4" }, { name: "eye", type: "vec4" }],
        cull, frontFace, blend,
    });
}
/** The bind hook a specular fleet hands makeGpuDrivenScene: the camera's world position, the atlas texture. */
export function specularBind(tex, eye) {
    return (pass, ctx) => { const e = typeof eye === "function" ? eye(ctx) : eye; pass.uniform("eye", Float32Array.from([e[0], e[1], e[2], 0])); pass.texture("tAtlas", tex, 0); };
}

export { dirToFace };
