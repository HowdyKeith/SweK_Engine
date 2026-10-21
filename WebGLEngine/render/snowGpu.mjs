// WebGLEngine/render/snowGpu.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** THE SNOWFLOW LIFT ON THE GPU: THE FOUR PIECES THE CPU PAGE COULD NOT DO. *** Slice 8 of snowflow-lift; snow-gpu.html drives it, tools/ship/snowGpuPage-selfcheck.mjs holds it.
// render/toroidalDeform, deformRead, clipmapTerrain, skyBake, pcssShadow and taaResolve are each a CPU twin and a WGSL kernel graded against it. snow-deform.html puts them on the screen through the CPU. THIS is
// the real path, one WebGPU frame:
//   1  deform step      the compute kernel steps the toroidal field in a pair of storage buffers (the CPU keeps only the brush queue and the banked-time rule: DeformField.advance);
//   2  sky bake         the Nishita kernel bakes the equirect LUT into a storage buffer, only when the sun moves;
//   3  shadow pass      the SAME vertex stage as the beauty pass (one WGSL function, so positions are identical and the terrain cannot acne against itself) renders the terrain depth from the sun into a
//                       2048 depth map;
//   4  beauty pass      a sky dome, then the clipmap: ONE static vertex buffer and ONE indexed draw, the vertex stage places each vertex from the camera (upstream's placeClipmapVertex), lifts it by the dunes and by
//                       the band-limited deformation read (upstream's deformHeight, with the vertex's post-morph spacing), and finds its normal by differences of that same height; the fragment lights it (sun x PCSS
//                       shadow + sky ambient) and fades it into the baked sky by aerial perspective. It writes HDR colour and the view-space depth the TAA reprojects with;
//   5  TAA              the depth-reprojected resolve (upstream's resolve and historyCatmullRom, bodies unchanged) from the jittered HDR frame and last frame's history into this frame's history;
//   6  present          tone map the history to the canvas.
// The camera helpers (perspective with Halton jitter, view basis, inverse view, the light's orthographic fit) are pure and graded in node.
//
// NOT DONE, said plainly: upstream's snow shading (glints, sastrugi, SSS), cascaded shadows (one cascade here), the near-sky blur and forward lobe of applyAerial (the haze mixes toward the exact sky sample), a
// character or any spell, and any timing on a real GPU -- the gate runs on this box's software adapter.
"use strict";
import { KERNEL_WGSL, NOISE_WGSL, DeformField, MAX_BRUSHES, packParams } from "./toroidalDeform.mjs";
import { DEFORM_READ_WGSL } from "./deformRead.mjs";
import { CLIPMAP_WGSL, buildClipmap } from "./clipmapTerrain.mjs";
import { BAKE_KERNEL_WGSL, sunFrom } from "./skyBake.mjs";
import { PCSS_WGSL } from "./pcssShadow.mjs";
import { TAA_WGSL, buildHalton } from "./taaResolve.mjs";

export const SKY_W = 64, SKY_H = 32, SHADOW_RES = 2048, FRAME_FLOATS = 92, POST_FAR = 9000;
export const HDR_FORMAT = "rgba16float", DEPTH_FORMAT = "r32float";

// ------------------------------------------------------------------------------------------------------------------------------ camera maths (pure)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

/** The camera's basis (y up, left-handed view: +z forward, +x right): { pos, r, u, f }. */
export function cameraBasis(pos, target, up = [0, 1, 0]) { const f = norm(sub(target, pos)), r = norm(cross(up, f)), u = cross(f, r); return { pos, r, u, f }; }

/**
 * viewProj (column-major, WebGPU depth 0..1) for a basis: clip.x = x/tanX + jx*z, clip.y = y/tanY + jy*z, clip.z = A z + B, clip.w = z, where (x, y, z) is the point in view space and (jx, jy) the NDC jitter.
 * Adding j*z to the clip coordinate is adding j to the NDC after the divide. taa removes it again before reprojecting.
 */
export function viewProj(b, tanX, tanY, near, far, jx = 0, jy = 0) {
    const A = far / (far - near), B = -far * near / (far - near), m = new Array(16).fill(0);
    const row = (v, t, j) => [v[0] / t + j * b.f[0], v[1] / t + j * b.f[1], v[2] / t + j * b.f[2]];
    const r0 = row(b.r, tanX, jx), r1 = row(b.u, tanY, jy), r2 = [b.f[0] * A, b.f[1] * A, b.f[2] * A], r3 = b.f;
    const rows = [r0, r1, r2, r3], t = [-dot(r0, b.pos), -dot(r1, b.pos), -dot(r2, b.pos) + B, -dot(r3, b.pos)];
    for (let i = 0; i < 4; i++) { m[0 * 4 + i] = rows[i][0]; m[1 * 4 + i] = rows[i][1]; m[2 * 4 + i] = rows[i][2]; m[3 * 4 + i] = t[i]; }
    return m;
}
/** view -> world, column-major: columns right, up, forward, position */
export const invView = (b) => [...b.r, 0, ...b.u, 0, ...b.f, 0, ...b.pos, 1];

/** The sun's orthographic fit around `centre`: width metres across, depthRange metres of depth; returns { vp (column-major), r, u, f } with f the direction the light TRAVELS. */
export function lightFit(sunDir, centre, width, depthRange) {
    const f = [-sunDir[0], -sunDir[1], -sunDir[2]], r = norm(cross([0, 1, 0], f)), u = cross(f, r), h = width / 2, m = new Array(16).fill(0);
    const rows = [[r[0] / h, r[1] / h, r[2] / h, -dot(r, centre) / h], [u[0] / h, u[1] / h, u[2] / h, -dot(u, centre) / h], [f[0] / depthRange, f[1] / depthRange, f[2] / depthRange, (depthRange / 2 - dot(f, centre)) / depthRange], [0, 0, 0, 1]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) m[j * 4 + i] = rows[i][j];
    return { vp: m, r, u, f };
}

/** the sub-pixel jitter for frame n in NDC (Halton(2,3) over 8 positions, in pixels -0.5..0.5, times 2 / size) */
export function jitterNdc(frame, w, h) { const j = buildHalton(8), k = frame % 8; return [j[k * 2] * 2 / w, j[k * 2 + 1] * 2 / h]; }

// ------------------------------------------------------------------------------------------------------------------------------ WGSL
const FRAME_STRUCT = /* wgsl */ `
struct Frame {
  viewProj: mat4x4f,
  lightVP: mat4x4f,
  camPos: vec4f,       // xyz, w = clipmap base spacing
  camRight: vec4f,     // xyz * tan(fovX / 2)
  camUp: vec4f,        // xyz * tan(fovY / 2)
  camFwd: vec4f,
  sunDir: vec4f,       // xyz toward the sun
  lightR: vec4f,
  lightU: vec4f,
  lightF: vec4f,       // the direction the light travels
  deform: vec4f,       // centre.x, centre.z, size, res
  params: vec4f,       // clipmap gridHalfN, shadow map res, shadow softness, depth bias (m)
  shadow: vec4f,       // depthRange (m), orthoWidth (m), frame index, flat terrain (0/1)
  ambient: vec4f,      // sky ambient rgb, aerial density
  screen: vec4f,       // w, h, jitter ndc x, y
  sunColor: vec4f,     // rgb, sun disc strength
  debug: vec4f,        // x: 0 normal, 1 shadow visibility, 2 world normal
};
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> deformState: array<f32>;
@group(0) @binding(2) var<storage, read> skyLut: array<f32>;
const PI: f32 = 3.14159265359;
const SKY_W: i32 = ${SKY_W};
const SKY_H: i32 = ${SKY_H};
const POST_FAR: f32 = ${POST_FAR}.0;
`;

const TERRAIN_COMMON = /* wgsl */ `
${NOISE_WGSL}
${CLIPMAP_WGSL}
fn stateAt(ix: i32, iy: i32) -> vec4f {
    let r = i32(F.deform.w);
    let x = ((ix % r) + r) % r;
    let y = ((iy % r) + r) % r;
    let o = u32((y * r + x) * 4);
    return vec4f(deformState[o], deformState[o + 1u], deformState[o + 2u], deformState[o + 3u]);
}
fn textureSampleLevelWrap(uv: vec2f) -> vec4f {
    let p = uv * F.deform.w - 0.5;
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(stateAt(x0, y0), stateAt(x0 + 1, y0), f.x), mix(stateAt(x0, y0 + 1), stateAt(x0 + 1, y0 + 1), f.x), f.y);
}
${DEFORM_READ_WGSL}
fn dunes(x: f32, z: f32) -> f32 {
    if (F.shadow.w > 0.5) { return 0.0; }
    return 1.1 * noise2(vec2f(x * 0.045 + 3.0, z * 0.045 - 5.0)) + 0.35 * noise2(vec2f(x * 0.14, z * 0.14 + 9.0)) + 0.06 * noise2(vec2f(x * 0.9, z * 0.9));
}
fn heightAt(xz: vec2f, spacing: f32) -> f32 {
    return dunes(xz.x, xz.y) + deformHeight(xz, F.deform.xy, F.deform.z, 1.0, spacing);
}
struct Surf { world: vec3f, normal: vec3f, spacing: f32, morph: f32 };
fn surfaceOf(v: vec3f) -> Surf {
    let placed = placeClipmapVertex(vec2f(v.x, v.z), v.y, F.camPos.xz, F.camPos.w, F.params.x);
    let xz = placed.worldXZ;
    let e = max(placed.spacing, 0.05);
    let h = heightAt(xz, placed.spacing);
    let hx = heightAt(xz + vec2f(e, 0.0), placed.spacing) - heightAt(xz - vec2f(e, 0.0), placed.spacing);
    let hz = heightAt(xz + vec2f(0.0, e), placed.spacing) - heightAt(xz - vec2f(0.0, e), placed.spacing);
    var s: Surf;
    s.world = vec3f(xz.x, h, xz.y);
    s.normal = normalize(vec3f(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
    s.spacing = placed.spacing;
    s.morph = placed.morph;
    return s;
}
`;

export const SKY_SAMPLE_WGSL = /* wgsl */ `
fn dirToLatLong(d: vec3f) -> vec2f {
    let u = atan2(d.x, d.z) / (2.0 * PI) + 0.5;
    let v = acos(clamp(d.y, -1.0, 1.0)) / PI;
    return vec2f(u, v);
}
fn skyTexel(ix: i32, iy: i32) -> vec3f {
    let x = ((ix % SKY_W) + SKY_W) % SKY_W;
    let y = clamp(iy, 0, SKY_H - 1);
    let o = u32((y * SKY_W + x) * 4);
    return vec3f(skyLut[o], skyLut[o + 1u], skyLut[o + 2u]);
}
fn skyAt(dir: vec3f) -> vec3f {
    let uv = dirToLatLong(normalize(dir));
    let p = vec2f(uv.x * f32(SKY_W) - 0.5, uv.y * f32(SKY_H) - 0.5);
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(skyTexel(x0, y0), skyTexel(x0 + 1, y0), f.x), mix(skyTexel(x0, y0 + 1), skyTexel(x0 + 1, y0 + 1), f.x), f.y);
}
`;

/** the vertex stages and the debug dump: one placement-and-lift function for the shadow pass, the beauty pass and the dump */
export const TERRAIN_VERTEX_WGSL = FRAME_STRUCT + TERRAIN_COMMON + /* wgsl */ `
struct VsOut { @builtin(position) pos: vec4f, @location(0) world: vec3f, @location(1) normal: vec3f, @location(2) viewZ: f32 };
@vertex fn vsMain(@location(0) v: vec3f) -> VsOut {
    let s = surfaceOf(v);
    var o: VsOut;
    o.pos = F.viewProj * vec4f(s.world, 1.0);
    o.world = s.world;
    o.normal = s.normal;
    o.viewZ = o.pos.w;
    return o;
}
@vertex fn vsShadow(@location(0) v: vec3f) -> @builtin(position) vec4f {
    let s = surfaceOf(v);
    return F.lightVP * vec4f(s.world, 1.0);
}
// the debug dump: the same surfaceOf, one thread per vertex, so a gate can read back what the vertex stage computes
@group(1) @binding(0) var<storage, read> dumpVerts: array<f32>;
@group(1) @binding(1) var<storage, read_write> dumpOut: array<f32>;
@compute @workgroup_size(64) fn dumpTerrain(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&dumpVerts) / 3u) { return; }
    let s = surfaceOf(vec3f(dumpVerts[i * 3u], dumpVerts[i * 3u + 1u], dumpVerts[i * 3u + 2u]));
    let o = i * 8u;
    dumpOut[o] = s.world.x; dumpOut[o + 1u] = s.world.y; dumpOut[o + 2u] = s.world.z; dumpOut[o + 3u] = s.spacing; dumpOut[o + 4u] = s.morph;
    dumpOut[o + 5u] = s.normal.x; dumpOut[o + 6u] = s.normal.y; dumpOut[o + 7u] = s.normal.z;
}
`;

/** the beauty fragment stage (sky dome and terrain): needs the main bind group with the shadow map */
export const BEAUTY_WGSL = FRAME_STRUCT + SKY_SAMPLE_WGSL + /* wgsl */ `
@group(0) @binding(3) var shadowMap: texture_depth_2d;
fn mapAt(x: i32, y: i32) -> f32 {
    let r = i32(F.params.y);
    return textureLoad(shadowMap, vec2i(clamp(x, 0, r - 1), clamp(y, 0, r - 1)), 0);
}
// what a bilinear clamped sampler returns over the depth map (texel centres at (i + 0.5) / res)
fn sampleMap(uv: vec2f) -> f32 {
    let res = F.params.y;
    let p = clamp(uv * res - 0.5, vec2f(0.0), vec2f(res - 1.0));
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(mapAt(x0, y0), mapAt(x0 + 1, y0), f.x), mix(mapAt(x0, y0 + 1), mapAt(x0 + 1, y0 + 1), f.x), f.y);
}
${PCSS_WGSL}
fn sunShadow(world: vec3f, geoN: vec3f, noiseRot: f32) -> f32 {
    let depthRange = F.shadow.x;
    let orthoWidth = F.shadow.y;
    let texelSize = 1.0 / F.params.y;
    let texelWorld = orthoWidth * texelSize;
    let lr = F.lightR.xyz;
    let lu = F.lightU.xyz;
    let lf = F.lightF.xyz;
    let nl = vec3f(dot(geoN, lr), dot(geoN, lu), dot(geoN, lf));
    let nz = select(min(nl.z, -1e-3), max(nl.z, 1e-3), nl.z >= 0.0);
    let grad = clamp(vec2f(-nl.x / nz, -nl.y / nz), vec2f(-6.0), vec2f(6.0));
    // v runs against light-space Y in this map (row 0 is the top), so its sign flips against upstream's render-target convention
    let planeNdcPerUV = vec2f(grad.x, -grad.y) * orthoWidth / depthRange;
    let sinL = sqrt(clamp(1.0 - nl.z * nl.z, 0.0, 1.0));
    let biased = world + geoN * (texelWorld * 1.5 * max(sinL, 0.2));
    let clip = F.lightVP * vec4f(biased, 1.0);
    let ndc = clip.xyz / clip.w;
    if (any(abs(ndc.xy) > vec2f(1.0)) || ndc.z < 0.0 || ndc.z > 1.0) { return 1.0; }
    let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    return pcssShadow(uv, ndc.z, texelSize, depthRange, orthoWidth, F.params.z, noiseRot, F.params.w, planeNdcPerUV);
}
fn ignPost(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }

// ---- upstream lib/atmosphere.wgsl aerialTransmittance, body unchanged
fn aerialTransmittance(
    camPos: vec3f,
    worldPos: vec3f,
    density: f32,
    heightFalloff: f32,
    fogStart: f32
) -> f32 {
    let d = worldPos - camPos;
    let dist = max(0.0, length(d) - fogStart);
    if (dist <= 0.0) { return 1.0; }

    let dy = d.y;
    var integral: f32;
    if (abs(dy) < 0.01) {
        integral = exp(-heightFalloff * camPos.y) * dist;
    } else {
        let k = heightFalloff;
        integral = (exp(-k * camPos.y) - exp(-k * worldPos.y)) / (k * dy) * length(d);
        integral = integral * (dist / max(1e-4, length(d)));
    }

    return exp(-density * max(0.0, integral));
}

struct VsOut { @builtin(position) pos: vec4f, @location(0) world: vec3f, @location(1) normal: vec3f, @location(2) viewZ: f32 };
struct FsOut { @location(0) color: vec4f, @location(1) depth: f32 };

@fragment fn fsTerrain(in: VsOut) -> FsOut {
    let N = normalize(in.normal);
    let L = F.sunDir.xyz;
    let NdotL = clamp(dot(N, L), 0.0, 1.0);
    let rot = ignPost(in.pos.xy + F.shadow.z * vec2f(5.588238, 3.2)) * 2.0 * PI;
    let sh = sunShadow(in.world, N, rot);
    let albedo = vec3f(0.90, 0.92, 0.96);
    var col = albedo * (F.sunColor.rgb * NdotL * sh + F.ambient.rgb);
    let viewDir = normalize(in.world - F.camPos.xyz);
    let t = aerialTransmittance(F.camPos.xyz, in.world, F.ambient.w, 0.012, 12.0);
    let ext = clamp(1.0 - t, 0.0, 1.0);
    col = mix(col, skyAt(viewDir), ext);
    if (F.debug.x > 0.5 && F.debug.x < 1.5) { col = vec3f(sh); }
    if (F.debug.x > 1.5) { col = N * 0.5 + 0.5; }
    var o: FsOut;
    o.color = vec4f(col, 1.0);
    o.depth = in.viewZ;
    return o;
}

struct SkyOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex fn vsSky(@builtin(vertex_index) i: u32) -> SkyOut {
    let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0))[i];
    var o: SkyOut;
    o.pos = vec4f(p, 0.0, 1.0);
    o.ndc = p;
    return o;
}
@fragment fn fsSky(in: SkyOut) -> FsOut {
    // the pixel's NDC includes the jitter the projection added; the ray this pixel really looked along is without it
    let n = in.ndc - F.screen.zw;
    let dir = normalize(F.camFwd.xyz + n.x * F.camRight.xyz + n.y * F.camUp.xyz);
    var col = skyAt(dir);
    let mu = dot(dir, F.sunDir.xyz);
    col += F.sunColor.rgb * F.sunColor.w * pow(max(mu, 0.0), 3000.0);
    var o: FsOut;
    o.color = vec4f(col, 1.0);
    o.depth = POST_FAR;
    return o;
}
`;

/** the TAA compute pass over textures: upstream's historyCatmullRom and resolve, with the fetches written for textures (uv is y-UP as upstream's is; image rows run top-down, so every fetch flips) */
export const TAA_GPU_WGSL = /* wgsl */ `
struct Params { prevViewProj: mat4x4f, invView: mat4x4f, projInfo: vec2f, invRes: vec2f, jitterNdc: vec2f, historyValid: f32, enabled: f32, feedback: f32, pad0: f32, pad1: f32, pad2: f32 };
@group(0) @binding(0) var<uniform> uniforms: Params;
@group(0) @binding(1) var curTex: texture_2d<f32>;
@group(0) @binding(2) var histTex: texture_2d<f32>;
@group(0) @binding(3) var depthTex: texture_2d<f32>;
@group(0) @binding(4) var outTex: texture_storage_2d<rgba16float, write>;

const POST_FAR: f32 = ${POST_FAR}.0;
fn lumaPost(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn tonemapWeight(c: vec3f) -> vec3f { return c / (1.0 + lumaPost(c)); }
fn tonemapUnweight(c: vec3f) -> vec3f { return c / max(1e-4, 1.0 - lumaPost(c)); }

fn dims() -> vec2f { return 1.0 / uniforms.invRes; }
fn rowOf(uvY: f32) -> f32 { return (1.0 - uvY) * dims().y - 0.5; }
fn loadCur(x: i32, y: i32) -> vec3f { let d = vec2i(dims()); return textureLoad(curTex, vec2i(clamp(x, 0, d.x - 1), clamp(y, 0, d.y - 1)), 0).rgb; }
fn loadHist(x: i32, y: i32) -> vec3f { let d = vec2i(dims()); return textureLoad(histTex, vec2i(clamp(x, 0, d.x - 1), clamp(y, 0, d.y - 1)), 0).rgb; }
fn loadDepth(x: i32, y: i32) -> f32 { let d = vec2i(dims()); return textureLoad(depthTex, vec2i(clamp(x, 0, d.x - 1), clamp(y, 0, d.y - 1)), 0).r; }
fn sampleCur(uv: vec2f) -> vec3f {
    let d = dims();
    let p = clamp(vec2f(uv.x * d.x - 0.5, rowOf(uv.y)), vec2f(0.0), d - 1.0);
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(loadCur(x0, y0), loadCur(x0 + 1, y0), f.x), mix(loadCur(x0, y0 + 1), loadCur(x0 + 1, y0 + 1), f.x), f.y);
}
fn sampleHist(uv: vec2f) -> vec3f {
    let d = dims();
    let p = clamp(vec2f(uv.x * d.x - 0.5, rowOf(uv.y)), vec2f(0.0), d - 1.0);
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(loadHist(x0, y0), loadHist(x0 + 1, y0), f.x), mix(loadHist(x0, y0 + 1), loadHist(x0 + 1, y0 + 1), f.x), f.y);
}
fn sampleDepth(uv: vec2f) -> f32 {
    let d = dims();
    let p = clamp(vec2f(uv.x * d.x - 0.5, rowOf(uv.y)), vec2f(0.0), d - 1.0);
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(loadDepth(x0, y0), loadDepth(x0 + 1, y0), f.x), mix(loadDepth(x0, y0 + 1), loadDepth(x0 + 1, y0 + 1), f.x), f.y);
}
${TAA_WGSL}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let d = dims();
    if (f32(gid.x) >= d.x || f32(gid.y) >= d.y) { return; }
    let uv = vec2f((f32(gid.x) + 0.5) * uniforms.invRes.x, 1.0 - (f32(gid.y) + 0.5) * uniforms.invRes.y);
    textureStore(outTex, vec2i(gid.xy), vec4f(resolve(uv), 1.0));
}
`;

export const PRESENT_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<uniform> exposure: vec4f;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    return vec4f(array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0))[i], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
    let c = textureLoad(src, vec2i(p.xy), 0).rgb * exposure.x;
    let t = c / (1.0 + c);
    return vec4f(pow(max(t, vec3f(0.0)), vec3f(1.0 / 2.2)), 1.0);
}
`;

// ------------------------------------------------------------------------------------------------------------------------------ the frame
import { nishitaSky } from "./skyBake.mjs";
const U = () => globalThis;

/** the sky's ambient colour, from a handful of CPU evaluations of the same function the kernel bakes (so no readback is waited for): the average of the zenith and four horizon directions, scaled */
export function skyAmbient(sunDir, intensity, groundBounce) {
    const dirs = [[0, 1, 0], [0.7, 0.35, 0.7], [-0.7, 0.35, 0.7], [0.7, 0.35, -0.7], [-0.7, 0.35, -0.7]], acc = [0, 0, 0];
    for (const d of dirs) { const l = Math.hypot(...d), c = nishitaSky(d.map((v) => v / l), sunDir, intensity, groundBounce); for (let k = 0; k < 3; k++) acc[k] += c[k] / dirs.length; }
    return acc.map((v) => v * 0.55);
}

/**
 * Build the whole frame graph on `device`. Options: { canvas (a canvas with a webgpu context, optional), format (the canvas format), width, height, deformRes, deformSize, gridN, levels, baseSpacing, shadowRes }.
 * Returns the driver: frame(dt, focus, cam, opts), stamp(...), setSun(elev, azim), readField(), readSky(), dumpTerrain(verts), shot(), errors, stats, and the resources the gate reads.
 */
export async function createSnowGpu(device, { canvas = null, format = "bgra8unorm", width = 320, height = 180, deformRes = 128, deformSize = 20, gridN = 32, levels = 5, baseSpacing = 0.2, shadowRes = SHADOW_RES } = {}) {
    const GU = U().GPUBufferUsage, TU = U().GPUTextureUsage, SS = U().GPUShaderStage, MM = U().GPUMapMode;
    const errors = []; device.addEventListener("uncapturederror", (e) => errors.push(String(e.error && e.error.message || e)));
    const mkBuf = (size, usage, label) => device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage, label });
    const ctx = canvas ? canvas.getContext("webgpu") : null; if (ctx) ctx.configure({ device, format, alphaMode: "opaque", usage: TU.RENDER_ATTACHMENT | TU.COPY_SRC });
    const field = new DeformField({ res: deformRes, size: deformSize, windDirectionDeg: 40 });
    const clip = buildClipmap({ gridN, levels });
    // ---- buffers
    const stateBytes = deformRes * deformRes * 16, stateBuf = [0, 1].map((i) => mkBuf(stateBytes, GU.STORAGE | GU.COPY_SRC | GU.COPY_DST, "state" + i));
    const brushBuf = mkBuf(MAX_BRUSHES * 3 * 16, GU.STORAGE | GU.COPY_DST, "brushes"), deformU = mkBuf(48, GU.UNIFORM | GU.COPY_DST, "deform params");
    const skyBuf = mkBuf(SKY_W * SKY_H * 16, GU.STORAGE | GU.COPY_SRC | GU.COPY_DST, "sky lut"), skyU = mkBuf(48, GU.UNIFORM | GU.COPY_DST, "sky params");
    const frameBuf = mkBuf(FRAME_FLOATS * 4, GU.UNIFORM | GU.COPY_DST, "frame"), taaU = mkBuf(176, GU.UNIFORM | GU.COPY_DST, "taa"), expoU = mkBuf(16, GU.UNIFORM | GU.COPY_DST, "exposure");
    const vbuf = mkBuf(clip.positions.byteLength, GU.VERTEX | GU.COPY_DST, "clip vertices"), ibuf = mkBuf(clip.indices.byteLength, GU.INDEX | GU.COPY_DST, "clip indices");
    device.queue.writeBuffer(vbuf, 0, clip.positions); device.queue.writeBuffer(ibuf, 0, clip.indices);
    // ---- textures
    const tex = (size, fmt, usage, label) => device.createTexture({ size, format: fmt, usage, label });
    let W = width, H = height, hdr, depthCol, sceneDepth, hist;
    const shadowTex = tex([shadowRes, shadowRes], "depth32float", TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, "shadow map");
    function makeTargets() {
        for (const t of [hdr, depthCol, sceneDepth, ...(hist || [])]) t && t.destroy();
        hdr = tex([W, H], HDR_FORMAT, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, "hdr"); depthCol = tex([W, H], DEPTH_FORMAT, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, "view depth");
        sceneDepth = tex([W, H], "depth32float", TU.RENDER_ATTACHMENT, "scene depth");
        hist = [0, 1].map((i) => tex([W, H], HDR_FORMAT, TU.STORAGE_BINDING | TU.TEXTURE_BINDING | TU.COPY_SRC, "history" + i));
    }
    makeTargets();
    // ---- layouts and pipelines
    const bgl0 = (withShadow) => device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: SS.VERTEX | SS.FRAGMENT | SS.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: SS.VERTEX | SS.FRAGMENT | SS.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: SS.VERTEX | SS.FRAGMENT | SS.COMPUTE, buffer: { type: "read-only-storage" } },
        ...(withShadow ? [{ binding: 3, visibility: SS.FRAGMENT, texture: { sampleType: "depth" } }] : []),
    ] });
    const bglShadow = bgl0(false), bglMain = bgl0(true);
    const bglDump = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.COMPUTE, buffer: { type: "read-only-storage" } }, { binding: 1, visibility: SS.COMPUTE, buffer: { type: "storage" } }] });
    const vModule = device.createShaderModule({ code: TERRAIN_VERTEX_WGSL, label: "terrain vertex" }), bModule = device.createShaderModule({ code: BEAUTY_WGSL, label: "beauty" });
    const vbufLayout = { arrayStride: 12, attributes: [{ shaderLocation: 0, format: "float32x3", offset: 0 }] };
    const shadowPipe = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglShadow] }), vertex: { module: vModule, entryPoint: "vsShadow", buffers: [vbufLayout] }, primitive: { topology: "triangle-list", cullMode: "none" }, depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" } });
    const targets = [{ format: HDR_FORMAT }, { format: DEPTH_FORMAT }];
    const mainLayout = device.createPipelineLayout({ bindGroupLayouts: [bglMain] });
    const terrainPipe = device.createRenderPipeline({ layout: mainLayout, vertex: { module: vModule, entryPoint: "vsMain", buffers: [vbufLayout] }, fragment: { module: bModule, entryPoint: "fsTerrain", targets }, primitive: { topology: "triangle-list", cullMode: "none" }, depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" } });
    const skyPipe = device.createRenderPipeline({ layout: mainLayout, vertex: { module: bModule, entryPoint: "vsSky" }, fragment: { module: bModule, entryPoint: "fsSky", targets }, primitive: { topology: "triangle-list" }, depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" } });
    const dumpPipe = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglShadow, bglDump] }), compute: { module: vModule, entryPoint: "dumpTerrain" } });
    const deformPipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: KERNEL_WGSL }), entryPoint: "main" } });
    const bakePipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: BAKE_KERNEL_WGSL }), entryPoint: "main" } });
    const taaPipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: TAA_GPU_WGSL, label: "taa" }), entryPoint: "main" } });
    const presentModule = device.createShaderModule({ code: PRESENT_WGSL });
    const presentPipe = (fmt) => device.createRenderPipeline({ layout: "auto", vertex: { module: presentModule, entryPoint: "vs" }, fragment: { module: presentModule, entryPoint: "fs", targets: [{ format: fmt }] }, primitive: { topology: "triangle-list" } });
    const presentCanvas = presentPipe(format), presentShot = presentPipe("rgba8unorm");
    // ---- bind groups
    const mk0 = (i, withShadow) => device.createBindGroup({ layout: withShadow ? bglMain : bglShadow, entries: [{ binding: 0, resource: { buffer: frameBuf } }, { binding: 1, resource: { buffer: stateBuf[i] } }, { binding: 2, resource: { buffer: skyBuf } }, ...(withShadow ? [{ binding: 3, resource: shadowTex.createView() }] : [])] });
    const mainBG = [mk0(0, true), mk0(1, true)], shadowBG = [mk0(0, false), mk0(1, false)];
    const deformBG = [0, 1].map((i) => device.createBindGroup({ layout: deformPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: stateBuf[1 - i] } }, { binding: 1, resource: { buffer: deformU } }, { binding: 2, resource: { buffer: stateBuf[i] } }, { binding: 3, resource: { buffer: brushBuf } }] }));   // [i] reads state i, writes 1 - i
    const bakeBG = device.createBindGroup({ layout: bakePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: skyBuf } }, { binding: 1, resource: { buffer: skyU } }] });
    let cur = 0;   // which state buffer holds the latest field

    // ---- sky
    let sunElev = 13, sunAzim = 60, sun = sunFrom(sunElev, sunAzim), skyDirty = true, ambient = [0.3, 0.4, 0.55], bakes = 0;
    const GB = [0.55, 0.62, 0.74], SUN_I = 20;
    function setSun(elev, azim = sunAzim) { sunElev = elev; sunAzim = azim; sun = sunFrom(elev, azim); skyDirty = true; ambient = skyAmbient(sun, SUN_I, GB); }
    setSun(13, 60);

    // ---- camera / history state
    const state = { frame: 0, prevVP: null, historyValid: 0, histIdx: 0, taa: true, resolve: true, jitter: true, flat: false, debug: 0, feedback: 0.9, exposure: 0.55, aerial: 0.003, softness: 2, bias: 0.05 };
    function rebuildSize(w, h) { W = w; H = h; makeTargets(); state.historyValid = 0; state.prevVP = null; }
    const f32 = new Float32Array(FRAME_FLOATS), taaF = new Float32Array(44);
    const clipHalf = gridN / 2;

    async function frame(dt, focus, cam, opts = {}) {
        const o = { present: true, shot: false, ...opts };
        // 1 the field: bookkeeping on the CPU, the pass on the GPU
        const P = field.advance(dt, focus);
        device.queue.writeBuffer(deformU, 0, new Float32Array(packParams(P)));
        device.queue.writeBuffer(brushBuf, 0, field.brushes());
        // 2 the camera
        const aspect = W / H, tanY = Math.tan((cam.fovY || 60) * Math.PI / 360), tanX = tanY * aspect, near = 0.05, far = 2000;
        const b = cameraBasis(cam.pos, cam.target), j = state.taa && state.jitter ? jitterNdc(state.frame, W, H) : [0, 0];
        const vp = viewProj(b, tanX, tanY, near, far, j[0], j[1]), vpClean = viewProj(b, tanX, tanY, near, far, 0, 0);
        const lf = lightFit(sun, [focus.x, 0, focus.z], 80, 160);
        f32.set(vp, 0); f32.set(lf.vp, 16);
        f32.set([...b.pos, baseSpacing], 32); f32.set([b.r[0] * tanX, b.r[1] * tanX, b.r[2] * tanX, 0], 36); f32.set([b.u[0] * tanY, b.u[1] * tanY, b.u[2] * tanY, 0], 40); f32.set([...b.f, 0], 44);
        f32.set([...sun, 1], 48); f32.set([...lf.r, 0], 52); f32.set([...lf.u, 0], 56); f32.set([...lf.f, 0], 60);
        f32.set([field.center[0], field.center[1], field.size, field.res], 64); f32.set([clipHalf, shadowRes, state.softness, state.bias], 68); f32.set([160, 80, state.frame, state.flat ? 1 : 0], 72);
        f32.set([...ambient, state.aerial], 76); f32.set([W, H, j[0], j[1]], 80); f32.set([3.0, 2.85, 2.55, 20], 84); f32.set([state.debug, 0, 0, 0], 88);
        device.queue.writeBuffer(frameBuf, 0, f32);
        // 3 the TAA block
        const prev = state.prevVP || vpClean;
        taaF.set(prev, 0); taaF.set(invView(b), 16); taaF.set([tanX, tanY, 1 / W, 1 / H, j[0], j[1], state.historyValid, state.taa && state.resolve ? 1 : 0, state.feedback, 0, 0, 0], 32);
        device.queue.writeBuffer(taaU, 0, taaF); device.queue.writeBuffer(expoU, 0, new Float32Array([state.exposure, 0, 0, 0]));
        const enc = device.createCommandEncoder();
        // field step (writes the other buffer), then the sky if the sun moved
        { const cp = enc.beginComputePass(); cp.setPipeline(deformPipe); cp.setBindGroup(0, deformBG[cur]); cp.dispatchWorkgroups(deformRes / 8, deformRes / 8); cp.end(); }
        cur = 1 - cur; field.endFrame();
        if (skyDirty) {
            device.queue.writeBuffer(skyU, 0, new Float32Array([sun[0], sun[1], sun[2], SUN_I, GB[0], GB[1], GB[2], SKY_W, SKY_H, 0, 0, 0]));
            const cp = enc.beginComputePass(); cp.setPipeline(bakePipe); cp.setBindGroup(0, bakeBG); cp.dispatchWorkgroups(SKY_W / 8, SKY_H / 8); cp.end(); skyDirty = false; bakes++;
        }
        // shadow pass: the same vertex function as the beauty pass
        { const p = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: shadowTex.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" } });
          p.setPipeline(shadowPipe); p.setBindGroup(0, shadowBG[cur]); p.setVertexBuffer(0, vbuf); p.setIndexBuffer(ibuf, "uint32"); p.drawIndexed(clip.indices.length); p.end(); }
        // beauty pass: the sky dome, then ONE indexed draw of the whole clipmap
        { const p = enc.beginRenderPass({ colorAttachments: [{ view: hdr.createView(), clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }, { view: depthCol.createView(), clearValue: [POST_FAR, 0, 0, 0], loadOp: "clear", storeOp: "store" }],
            depthStencilAttachment: { view: sceneDepth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" } });
          p.setBindGroup(0, mainBG[cur]); p.setPipeline(skyPipe); p.draw(3); p.setPipeline(terrainPipe); p.setVertexBuffer(0, vbuf); p.setIndexBuffer(ibuf, "uint32"); p.drawIndexed(clip.indices.length); p.end(); }
        // TAA: current + history -> the other history
        const hi = state.histIdx, ho = 1 - hi;
        { const bg = device.createBindGroup({ layout: taaPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: taaU } }, { binding: 1, resource: hdr.createView() }, { binding: 2, resource: hist[hi].createView() }, { binding: 3, resource: depthCol.createView() }, { binding: 4, resource: hist[ho].createView() }] });
          const cp = enc.beginComputePass(); cp.setPipeline(taaPipe); cp.setBindGroup(0, bg); cp.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8)); cp.end(); }
        // present
        let shotBuf = null, bpr = 0;
        const draw = (pipe, view) => { const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: hist[ho].createView() }, { binding: 1, resource: { buffer: expoU } }] });
            const p = enc.beginRenderPass({ colorAttachments: [{ view, clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }] }); p.setPipeline(pipe); p.setBindGroup(0, bg); p.draw(3); p.end(); };
        if (o.present && ctx) draw(presentCanvas, ctx.getCurrentTexture().createView());
        let shotTex = null;
        if (o.shot) { shotTex = tex([W, H], "rgba8unorm", TU.RENDER_ATTACHMENT | TU.COPY_SRC, "shot"); draw(presentShot, shotTex.createView()); bpr = Math.ceil(W * 4 / 256) * 256; shotBuf = mkBuf(bpr * H, GU.COPY_DST | GU.MAP_READ, "shot read"); enc.copyTextureToBuffer({ texture: shotTex }, { buffer: shotBuf, bytesPerRow: bpr }, [W, H]); }
        device.queue.submit([enc.finish()]);
        state.prevVP = vpClean; state.histIdx = ho; state.historyValid = 1; state.frame++;
        stats.frames = state.frame; stats.bakes = bakes;
        if (!shotBuf) return null;
        await shotBuf.mapAsync(MM.READ); const raw = new Uint8Array(shotBuf.getMappedRange()), out = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) out.set(raw.subarray(y * bpr, y * bpr + W * 4), y * W * 4);
        shotBuf.unmap(); shotBuf.destroy(); shotTex.destroy(); return { pixels: out, width: W, height: H };
    }
    const stats = { frames: 0, bakes: 0, vertices: clip.vertices, triangles: clip.triangles, terrainDrawCalls: 1, indices: clip.indices.length, shadowRes };
    async function readBuf(buf, bytes) { const r = mkBuf(bytes, GU.COPY_DST | GU.MAP_READ), e = device.createCommandEncoder(); e.copyBufferToBuffer(buf, 0, r, 0, bytes); device.queue.submit([e.finish()]); await r.mapAsync(MM.READ); const out = new Float32Array(r.getMappedRange().slice(0)); r.unmap(); r.destroy(); return out; }
    return {
        device, field, clip, stats, errors, state, baseSpacing, gridN, levels, deformRes,
        frame, setSun, rebuildSize, get sun() { return sun; }, get ambient() { return ambient; }, get size() { return [W, H]; },
        stamp: (...a) => field.brush(...a),
        readField: () => readBuf(stateBuf[cur], stateBytes), readSky: () => readBuf(skyBuf, SKY_W * SKY_H * 16),
        async dumpTerrain(verts) {
            const n = verts.length / 3, inB = mkBuf(verts.byteLength, GU.STORAGE | GU.COPY_DST), outB = mkBuf(n * 32, GU.STORAGE | GU.COPY_SRC); device.queue.writeBuffer(inB, 0, verts);
            const bg = device.createBindGroup({ layout: bglDump, entries: [{ binding: 0, resource: { buffer: inB } }, { binding: 1, resource: { buffer: outB } }] });
            const e = device.createCommandEncoder(), cp = e.beginComputePass(); cp.setPipeline(dumpPipe); cp.setBindGroup(0, shadowBG[cur]); cp.setBindGroup(1, bg); cp.dispatchWorkgroups(Math.ceil(n / 64)); cp.end(); device.queue.submit([e.finish()]);
            const out = await readBuf(outB, n * 32); inB.destroy(); outB.destroy(); return out;
        },
        shot: (dt, focus, cam) => frame(dt, focus, cam, { present: false, shot: true }),
    };
}
