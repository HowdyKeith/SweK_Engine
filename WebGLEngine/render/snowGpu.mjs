// WebGLEngine/render/snowGpu.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** THE SNOWFLOW LIFT ON THE GPU: THE FOUR PIECES THE CPU PAGE COULD NOT DO, THEN THE MATERIAL, THE CASCADES AND THE AERIAL LOBE. *** Slice 8 of snowflow-lift; snow-gpu.html drives it, tools/ship/snowGpuPage-selfcheck.mjs holds it.
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
// THE SNOW MATERIAL, THREE CASCADES, AND THE FULL AERIAL PERSPECTIVE (added after the first eight slices; each is its own module with a CPU twin and gate):
//   shading      snow.fragment.wgsl's main, statement for statement where the inputs exist here (render/snowShading.mjs: GGX, wrap, subsurface, glints, SH ambient, RNM; render/snowFine.mjs: the filtered sastrugi, ripples
//                and grain and the baked detail map, sampled with explicit gradients from a mipped texture the GPU bakes at start); the fine relief also displaces vertices where the ring resolves it (spacing < 0.42, faded) and
//                the shadow pass sees it too, because it is the same surfaceOf;
//   cascades     three shadow maps fitted per frame (render/cascades.mjs), three shadow passes, the lifted selection and cross-fade;
//   aerial       the sky buffer is a MIP CHAIN (the bake, then five box-filter passes); applyAerial reads the blurred near sky (mip 3) and the Mie forward lobe, crossfaded to the exact sky.
// SUBSTITUTIONS, all in fsTerrain: the baked macro texture (aux) is our own dunes -- the slope by central difference over 0.5 m and the exposure from auxBake's wide-stencil Laplacian on it; rockMask is 0 (no rock); the deformation texture is the
// state buffer read through textureSampleLevelWrap; the spell lights are omitted; the sun's irradiance is sunColor x pi (the form's INV_PI then gives the old albedo x sunColor look); the shadow dither is animated with the frame index (TAA resolves it);
// the sky specular reads skyAtLevel over the chain; the sun-visibility debug views are ours. NOT LIFTED: ridge.wgsl's far mountains, the character and spell passes.
// NOT DONE, said plainly: speed or looks on a real GPU (the adapter is a software rasteriser), the ground-bounce solve (the sky's bounce is the bake's own constant), terrainMacro itself (our dunes stand in), film grain and AgX (the present pass is Reinhard).
"use strict";
import { KERNEL_WGSL, NOISE_WGSL, DeformField, MAX_BRUSHES, packParams } from "./toroidalDeform.mjs";
import { DEFORM_READ_WGSL } from "./deformRead.mjs";
import { CLIPMAP_WGSL, buildClipmap } from "./clipmapTerrain.mjs";
import { BAKE_KERNEL_WGSL, sunFrom, bakeSky, MIP_KERNEL_WGSL, SKY_LEVELS, mipFloats } from "./skyBake.mjs";
import { AERIAL_WGSL } from "./aerial.mjs";
import { FINE_NOISE_WGSL, FINE_TERRAIN_WGSL, DETAIL_BAKE_KERNEL_WGSL, DETAIL_MIP_KERNEL_WGSL, DETAIL_RES, DETAIL_LEVELS, GRAIN_SCALE } from "./snowFine.mjs";
import { SHADING_WGSL, projectSH } from "./snowShading.mjs";
import { CASCADE_SHADOW_WGSL, fitCascades, CASCADE_COUNT, SPLITS } from "./cascades.mjs";
import { TAA_WGSL, buildHalton } from "./taaResolve.mjs";
import { ablateWgsl } from "./snowAblate.mjs";
import { packWgsl, deformSampleWgsl, DEFORM_SAMPLER } from "./deformTexture.mjs";

export const SKY_W = 64, SKY_H = 32, SHADOW_RES = 2048, FRAME_FLOATS = 188, POST_FAR = 9000;
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
  cascVP: array<mat4x4f, 3>,   // the three light volumes (render/cascades.mjs)
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
  shadow: vec4f,       // unused, unused, frame index, flat terrain (0/1)
  ambient: vec4f,      // sky ambient rgb (the old flat term; the page's readout)
  screen: vec4f,       // w, h, jitter ndc x, y
  sunColor: vec4f,     // rgb, sun disc strength
  debug: vec4f,        // x: 0 lit, 1 shadow visibility, 2 world normal, 3 cascades, 4 albedo, 5 fine normal
  cascParams: array<vec4f, 3>,   // per cascade: depth range m, ortho width m
  splits: vec4f,       // cascade far distances
  sh: array<vec4f, 9>, // sky irradiance, nine SH coefficients
  wind: vec4f,         // wind angle (rad), sastrugi amplitude, detail strength, glint intensity
  mtl: vec4f,          // glint grazing gate, sss strength, sss radius, ambient intensity
  fog: vec4f,          // density, height falloff, start, aerial strength
};
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> deformState: array<f32>;
@group(0) @binding(2) var<storage, read> skyLut: array<f32>;
${deformSampleWgsl(0, 8, 9)}
const PI: f32 = 3.14159265359;
const SKY_W: i32 = ${SKY_W};
const SKY_H: i32 = ${SKY_H};
const SKY_LEVELS: i32 = ${SKY_LEVELS};
const POST_FAR: f32 = ${POST_FAR}.0;
`;

const SURFACE_WGSL = /* wgsl */ `
${NOISE_WGSL}
${FINE_NOISE_WGSL}
${FINE_TERRAIN_WGSL}
// v4896 -- the field is read through textureSampleLevelWrap, now a hardware bilinear over the rgba16float copy the pack pass makes each frame (render/deformTexture.mjs); it was a manual bilinear over the storage buffer,
// four wrapped loads a tap. deformState above stays bound (the deform kernel and the pack pass read it) and the buffer path is the CPU twin's, bilinearWrapCpu.
${DEFORM_READ_WGSL}
// the landform: ours (upstream bakes terrainMacro into a texture; this is a smaller field of the same kind, three octaves of the same noise)
fn dunes(x: f32, z: f32) -> f32 {
    if (F.shadow.w > 0.5) { return 0.0; }
    return 1.1 * noise2(vec2f(x * 0.045 + 3.0, z * 0.045 - 5.0)) + 0.35 * noise2(vec2f(x * 0.14, z * 0.14 + 9.0)) + 0.06 * noise2(vec2f(x * 0.9, z * 0.9));
}
// auxBake.fragment.wgsl on our landform: the slope by central difference over one 'texel' (0.5 m), and the exposure from a wide-stencil Laplacian (6 texels)
fn duneGrad(p: vec2f) -> vec2f {
    let d = 0.5;
    return vec2f(dunes(p.x + d, p.y) - dunes(p.x - d, p.y), dunes(p.x, p.y + d) - dunes(p.x, p.y - d)) / (2.0 * d);
}
fn duneExposure(p: vec2f) -> f32 {
    let wd = 3.0;
    let lap = (dunes(p.x - wd, p.y) + dunes(p.x + wd, p.y) + dunes(p.x, p.y - wd) + dunes(p.x, p.y + wd) - 4.0 * dunes(p.x, p.y)) / (wd * wd);
    return clamp(0.5 - lap * 2.2, 0.0, 1.0);
}
// snow.vertex.wgsl's height: the landform, the fine relief only where the ring resolves it, the deformation band-limited to the vertex's own spacing
fn heightAt(xz: vec2f, spacing: f32) -> f32 {
    var h = dunes(xz.x, xz.y);
    if (spacing < 0.42) {
        let fade = 1.0 - smoothstep(0.16, 0.42, spacing);
        h += terrainFine(xz, F.wind.x, duneExposure(xz), F.wind.y).x * fade;
    }
    if (spacing < 1.0) {
        let dfade = 1.0 - smoothstep(0.5, 1.0, spacing);
        h += deformHeight(xz, F.deform.xy, F.deform.z, 1.0, spacing) * dfade;
    }
    return h;
}
`;
const TERRAIN_COMMON = /* wgsl */ `
${SURFACE_WGSL}
${CLIPMAP_WGSL}
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
override CASCADE: u32 = 0u;
@vertex fn vsShadow(@location(0) v: vec3f) -> @builtin(position) vec4f {
    let s = surfaceOf(v);
    return F.cascVP[CASCADE] * vec4f(s.world, 1.0);
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

/** the beauty fragment stage (sky dome and terrain): needs the main bind group (the frame, the field, the sky chain, three shadow maps, the detail map) */
export const BEAUTY_WGSL = FRAME_STRUCT + SKY_SAMPLE_WGSL + SURFACE_WGSL + /* wgsl */ `
${SHADING_WGSL}
${AERIAL_WGSL}
${CASCADE_SHADOW_WGSL}
@group(0) @binding(6) var detailTex: texture_2d<f32>;
@group(0) @binding(7) var detailTexSampler: sampler;

struct VsOut { @builtin(position) pos: vec4f, @location(0) world: vec3f, @location(1) normal: vec3f, @location(2) viewZ: f32 };
struct FsOut { @location(0) color: vec4f, @location(1) depth: f32 };

fn unpackN(rg: vec2f) -> vec3f {
    let xy = rg * 2.0 - 1.0;
    return vec3f(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
}
fn detailNormal(
    world: vec3f, N: vec3f, scale: f32, blendSteep: f32,
    ddxW: vec3f, ddyW: vec3f
) -> vec3f {
    var n = unpackN(textureSampleGrad(
        detailTex, detailTexSampler, world.xz * scale,
        ddxW.xz * scale, ddyW.xz * scale
    ).xy);

    if (blendSteep > 0.01) {
        let a = unpackN(textureSampleGrad(
            detailTex, detailTexSampler, world.xy * scale,
            ddxW.xy * scale, ddyW.xy * scale
        ).xy);
        let b = unpackN(textureSampleGrad(
            detailTex, detailTexSampler, world.zy * scale,
            ddxW.zy * scale, ddyW.zy * scale
        ).xy);
        let w = abs(N);
        let sum = w.x + w.y + w.z;
        n = normalize(mix(n, (a * w.z + b * w.x + n * w.y) / sum, blendSteep));
    }
    return n;
}

// ---- snow.fragment.wgsl's main, statement for statement where the inputs exist here; the substitutions are listed in render/snowGpu.mjs's header
@fragment fn fsTerrain(input: VsOut) -> FsOut {
    let world = input.world;
    let viewDist = distance(world, F.camPos.xyz);
    let V = normalize(F.camPos.xyz - world);
    let L = F.sunDir.xyz;

    let ddxW = dpdx(world);
    let ddyW = dpdy(world);
    let footprint = max(length(vec2f(length(ddxW.xz), length(ddyW.xz))), 1e-4);
    let footprintMin = max(min(length(ddxW.xz), length(ddyW.xz)), 1e-4);

    var grad = duneGrad(world.xz);
    let rockMask = 0.0;
    let exposure = duneExposure(world.xz);

    let fine = terrainFineFiltered(
        world.xz, F.wind.x, exposure, F.wind.y, footprint
    );
    grad += fine.yz;

    var compression = 0.0;
    var iceAmount = 0.0;
    var deformDepth = 0.0;
    var deformBerm = 0.0;

    let deformTexel = F.deform.z / F.deform.w;
    let dWeight = deformFalloff(world.xz, F.deform.xy, F.deform.z);
    if (dWeight > 0.001) {
        let dUV = deformUV(world.xz, F.deform.z);
        let c = textureSampleLevelWrap(dUV);

        let step = max(deformTexel * 2.0, footprintMin * 1.4);
        let eUV = step / F.deform.z;

        let dxA = textureSampleLevelWrap(dUV + vec2f(eUV, 0.0));
        let dxB = textureSampleLevelWrap(dUV - vec2f(eUV, 0.0));
        let dzA = textureSampleLevelWrap(dUV + vec2f(0.0, eUV));
        let dzB = textureSampleLevelWrap(dUV - vec2f(0.0, eUV));
        let sx = (dxA.g - dxA.r) - (dxB.g - dxB.r);
        let sz = (dzA.g - dzA.r) - (dzB.g - dzB.r);

        let wide = clamp(footprintMin / (deformTexel * 4.0), 0.0, 1.0) * 0.8;
        let df = mix(c, (c + dxA + dxB + dzA + dzB) * 0.2, wide);

        deformDepth = df.r * dWeight;
        deformBerm = df.g * dWeight;
        compression = clamp(df.b, 0.0, 1.0) * dWeight;
        iceAmount = clamp(df.a, 0.0, 1.0) * dWeight;

        grad += vec2f(sx, sz) / (2.0 * step) * 1.0 * dWeight;
    }

    var N = normalFromGradient(grad);
    let geoN = N;

    let steep = smoothstep(0.55, 0.9, 1.0 - N.y);
    if (F.wind.z > 0.001) {
        var acc = vec3f(0.0, 0.0, 1.0);

        let f0 = 1.0 - smoothstep(0.004, 0.02, footprint);
        if (f0 > 0.001) {
            let d = detailNormal(world, N, 7.5, steep, ddxW, ddyW);
            acc = blendNormalRNM(acc, mix(vec3f(0.0, 0.0, 1.0), d, f0));
        }
        let f1 = 1.0 - smoothstep(0.02, 0.12, footprint);
        if (f1 > 0.001) {
            let d = detailNormal(world, N, 1.7, steep, ddxW, ddyW);
            acc = blendNormalRNM(acc, mix(vec3f(0.0, 0.0, 1.0), d, f1 * 0.85));
        }
        let f2 = 1.0 - smoothstep(0.1, 0.7, footprint);
        if (f2 > 0.001) {
            let d = detailNormal(world, N, 0.31, steep, ddxW, ddyW);
            acc = blendNormalRNM(acc, mix(vec3f(0.0, 0.0, 1.0), d, f2 * 0.6));
        }

        let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(N.y) > 0.99);
        let T = normalize(cross(up, N));
        let B = cross(N, T);
        let s = F.wind.z * mix(1.0, 0.45, compression);
        N = normalize(N + (T * acc.x + B * acc.y) * s);
    }

    let cavity = textureSampleGrad(
        detailTex, detailTexSampler, world.xz * 1.7,
        ddxW.xz * 1.7, ddyW.xz * 1.7
    ).z;

    var albedo = vec3f(0.855, 0.885, 0.945);
    var roughness = 0.62;
    var f0 = vec3f(0.028);
    var thickness = 1.0;

    albedo = mix(albedo, vec3f(0.62, 0.665, 0.755), compression * 0.85);
    roughness = mix(roughness, 0.34, compression);
    thickness = mix(thickness, 0.35, compression);

    albedo = mix(albedo, vec3f(0.42, 0.56, 0.70), iceAmount * 0.8);
    roughness = mix(roughness, 0.07, iceAmount);
    f0 = mix(f0, vec3f(0.045), iceAmount);
    thickness = mix(thickness, 0.15, iceAmount);

    let rockExposed = rockMask * smoothstep(0.32, 0.66, 1.0 - N.y);

    if (deformBerm > 0.002) {
        let loose = clamp(deformBerm * 5.0, 0.0, 1.0);
        albedo = mix(albedo, vec3f(0.895, 0.920, 0.965), loose * 0.55);
        roughness = mix(roughness, 0.78, loose * 0.7);
        thickness = mix(thickness, 1.0, loose * 0.6);
        let chunk = noise2(world.xz * 34.0) * 0.5 + 0.5;
        albedo *= 1.0 - loose * 0.10 * chunk;
    }

    var ao = mix(1.0, cavity, 0.35 * (1.0 - smoothstep(0.02, 0.25, footprint)))
           * (1.0 - clamp(deformDepth * 1.9, 0.0, 1.0) * 0.38);

    let NdotL = dot(N, L);
    let NdotV = clamp(dot(N, V), 1e-4, 1.0);

    let pix = input.pos.xy + F.shadow.z * vec2f(5.588238, 3.2);
    let noiseRot = ign(pix) * 6.28318530718;

    var shadow = 1.0;
    if (NdotL > -0.35) {
        shadow = sunShadow(world, geoN, viewDist, noiseRot);
    }

    let sunRadiance = F.sunColor.rgb * PI;
    const INV_PI: f32 = 0.31830988618;

    let wrapAmount = mix(0.62, 0.15, max(compression, rockExposed));
    let diff = wrapDiffuse(NdotL, wrapAmount);
    var direct = albedo * INV_PI * sunRadiance * diff * shadow;

    let sss = snowSubsurface(
        N, L, V, sunRadiance, thickness,
        F.mtl.y * (1.0 - rockExposed), F.mtl.z
    );
    direct += sss * albedo * mix(0.42, 1.0, shadow);

    if (NdotL > 0.0) {
        let H = normalize(V + L);
        let NdotH = clamp(dot(N, H), 0.0, 1.0);
        let VdotH = clamp(dot(V, H), 0.0, 1.0);
        let D = distributionGGX(NdotH, roughness);
        let Vis = visSmithGGXCorrelated(NdotV, NdotL, roughness);
        let F0 = fresnelSchlick(VdotH, f0);
        direct += sunRadiance * D * Vis * F0 * NdotL * shadow;
    }

    var irradiance = shIrradiance(N, F.sh) * F.mtl.w;

    let bounceUp = clamp(-N.y * 0.5 + 0.5, 0.0, 1.0);
    irradiance += shIrradiance(vec3f(0.0, 1.0, 0.0), F.sh)
                * F.mtl.w * 0.28 * bounceUp * albedo;

    var ambient = albedo * INV_PI * irradiance;

    let R = reflect(-V, N);
    let mip = sqrt(roughness) * 6.0;
    let skyRefl = skyAtLevel(R, mip);
    let Fr = fresnelSchlickRough(NdotV, f0, roughness);
    ambient += skyRefl * Fr * F.mtl.w * mix(1.0, 2.6, iceAmount);

    var color = direct + ambient;

    if (F.wind.w > 0.001 && rockExposed < 0.5) {
        let g = snowGlints(
            world.xz, N, V, L, footprint,
            F.wind.w, F.mtl.x
        );
        color += sunRadiance * g * shadow * (1.0 - iceAmount * 0.6) * 0.55;
    }

    let caveTint = mix(vec3f(1.0), vec3f(0.55, 0.72, 1.0), (1.0 - ao) * 0.95);
    color *= ao * caveTint;

    color = applyAerial(
        color, F.camPos.xyz, world, -V, L,
        sunRadiance,
        F.fog.x, F.fog.y, F.fog.z,
        F.fog.w
    );

    if (F.debug.x > 0.5) {
        if (F.debug.x < 1.5) {
            color = vec3f(shadow);
        } else if (F.debug.x < 2.5) {
            color = N * 0.5 + 0.5;
        } else if (F.debug.x < 3.5) {
            let c = vec3f(f32(viewDist < F.splits.x), f32(viewDist < F.splits.y), f32(viewDist < F.splits.z));
            color = color * 0.6 + c * 0.25;
        } else if (F.debug.x < 4.5) {
            color = albedo;
        } else {
            color = normalFromGradient(fine.yz) * 0.5 + 0.5;
        }
    }

    var o: FsOut;
    o.color = vec4f(color, 1.0);
    o.depth = input.viewZ;
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

fn dims() -> vec2f { return floor(1.0 / uniforms.invRes + 0.5); }   // ROUNDED: D3D12 divides with a reciprocal that can read 23.999998 for 24, and u32() of that is 23 -- the row stride, and the rig found it at v4895
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
// v4896 -- RENDER SCALE: exposure.yz is the render size over the output size (1, 1 when they are equal), and the output pixel at p reads the render target BILINEARLY at p * ratio. At ratio 1 the sample position is
// exactly the texel's centre, so the filter weights are 0 and 1 and the result is the single textureLoad it replaces, bit for bit. The four taps are clamped to the target, so the last output row and column read its edge.
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
    let dims = vec2i(textureDimensions(src));
    let q = p.xy * exposure.yz - vec2f(0.5);
    let i0 = vec2i(floor(q));
    let f = q - floor(q);
    let hi = dims - vec2i(1);
    let a = textureLoad(src, clamp(i0, vec2i(0), hi), 0).rgb;
    let b = textureLoad(src, clamp(i0 + vec2i(1, 0), vec2i(0), hi), 0).rgb;
    let d = textureLoad(src, clamp(i0 + vec2i(0, 1), vec2i(0), hi), 0).rgb;
    let e = textureLoad(src, clamp(i0 + vec2i(1, 1), vec2i(0), hi), 0).rgb;
    let c = mix(mix(a, b, f.x), mix(d, e, f.x), f.y) * exposure.x;
    let t = c / (1.0 + c);
    return vec4f(pow(max(t, vec3f(0.0)), vec3f(1.0 / 2.2)), 1.0);
}
`;

// ------------------------------------------------------------------------------------------------------------------------------ the frame
import { nishitaSky } from "./skyBake.mjs";
const U = () => globalThis;

/** the sky's ambient colour, from a handful of CPU evaluations of the same function the kernel bakes (so no readback is waited for): the average of the zenith and four horizon directions, scaled */
/** the nine SH coefficients of the sky for a sun, from a 32 x 16 CPU bake of the kernel's own function (rows flattened to [r, g, b, 0] x 9) */
export function skySH(sunDir, intensity, groundBounce) { const sh = projectSH(bakeSky(32, 16, sunDir, intensity, groundBounce), 32, 16), out = new Float32Array(36); sh.forEach((c, i) => out.set([c[0], c[1], c[2], 0], i * 4)); return out; }

export function skyAmbient(sunDir, intensity, groundBounce) {
    const dirs = [[0, 1, 0], [0.7, 0.35, 0.7], [-0.7, 0.35, 0.7], [0.7, 0.35, -0.7], [-0.7, 0.35, -0.7]], acc = [0, 0, 0];
    for (const d of dirs) { const l = Math.hypot(...d), c = nishitaSky(d.map((v) => v / l), sunDir, intensity, groundBounce); for (let k = 0; k < 3; k++) acc[k] += c[k] / dirs.length; }
    return acc.map((v) => v * 0.55);
}

/**
 * Build the whole frame graph on `device`. Options: { canvas (a canvas with a webgpu context, optional), format (the canvas format), width, height, deformRes, deformSize, gridN, levels, baseSpacing, shadowRes }.
 * Returns the driver: frame(dt, focus, cam, opts), stamp(...), setSun(elev, azim), readField(), readSky(), dumpTerrain(verts), shot(), errors, stats, and the resources the gate reads.
 */
export async function createSnowGpu(device, { canvas = null, format = "bgra8unorm", width = 320, height = 180, deformRes = 128, deformSize = 20, gridN = 32, levels = 5, baseSpacing = 0.2, shadowRes = SHADOW_RES, passTimers = false, ablate = [] } = {}) {   // `ablate`: terms of the beauty shader compiled OUT, for measuring (render/snowAblate.mjs); the picture is wrong on purpose
    const GU = U().GPUBufferUsage, TU = U().GPUTextureUsage, SS = U().GPUShaderStage, MM = U().GPUMapMode;
    const errors = []; device.addEventListener("uncapturederror", (e) => errors.push(String(e.error && e.error.message || e)));
    const mkBuf = (size, usage, label) => device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage, label });
    // v4896 -- OPT-IN PER-PASS GPU TIMERS (passTimers: true, on a device made with the "timestamp-query" feature): every pass writes a begin and an end timestamp into one query set, the frame resolves them and
    // stats.passMs holds the last frame's milliseconds per pass. It awaits a buffer map each frame, so a frame with timers on is a measurement frame, never a throughput one. Off by default: no query set, no
    // descriptor field, nothing different from the frame before this existed.
    const timers = passTimers && device.features && device.features.has("timestamp-query")
        ? { qs: device.createQuerySet({ type: "timestamp", count: 32 }), res: mkBuf(32 * 8, GU.QUERY_RESOLVE | GU.COPY_SRC, "pass timers"), rd: mkBuf(32 * 8, GU.COPY_DST | GU.MAP_READ, "pass timers read") } : null;
    const ctx = canvas ? canvas.getContext("webgpu") : null; if (ctx) ctx.configure({ device, format, alphaMode: "opaque", usage: TU.RENDER_ATTACHMENT | TU.COPY_SRC });
    const field = new DeformField({ res: deformRes, size: deformSize, windDirectionDeg: 40 });
    const clip = buildClipmap({ gridN, levels });
    // ---- buffers
    const stateBytes = deformRes * deformRes * 16, stateBuf = [0, 1].map((i) => mkBuf(stateBytes, GU.STORAGE | GU.COPY_SRC | GU.COPY_DST, "state" + i));
    const brushBuf = mkBuf(MAX_BRUSHES * 3 * 16, GU.STORAGE | GU.COPY_DST, "brushes"), deformU = mkBuf(48, GU.UNIFORM | GU.COPY_DST, "deform params");
    const skyBuf = mkBuf(mipFloats(SKY_W, SKY_H) * 4, GU.STORAGE | GU.COPY_SRC | GU.COPY_DST, "sky lut chain"), skyU = mkBuf(48, GU.UNIFORM | GU.COPY_DST, "sky params");
    const mipU = Array.from({ length: SKY_LEVELS - 1 }, (_, i) => { const b = mkBuf(16, GU.UNIFORM | GU.COPY_DST, "mip params " + (i + 1)); device.queue.writeBuffer(b, 0, new Float32Array([SKY_W, SKY_H, i + 1, 0])); return b; });
    const frameBuf = mkBuf(FRAME_FLOATS * 4, GU.UNIFORM | GU.COPY_DST, "frame"), taaU = mkBuf(176, GU.UNIFORM | GU.COPY_DST, "taa"), expoU = mkBuf(16, GU.UNIFORM | GU.COPY_DST, "exposure"), expoShotU = mkBuf(16, GU.UNIFORM | GU.COPY_DST, "exposure (shot)");
    const vbuf = mkBuf(clip.positions.byteLength, GU.VERTEX | GU.COPY_DST, "clip vertices"), ibuf = mkBuf(clip.indices.byteLength, GU.INDEX | GU.COPY_DST, "clip indices");
    device.queue.writeBuffer(vbuf, 0, clip.positions); device.queue.writeBuffer(ibuf, 0, clip.indices);
    // ---- textures
    const tex = (size, fmt, usage, label) => device.createTexture({ size, format: fmt, usage, label });
    let W = width, H = height, hdr, depthCol, sceneDepth, hist;
    const shadowTex = Array.from({ length: CASCADE_COUNT }, (_, i) => tex([shadowRes, shadowRes], "depth32float", TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING | TU.COPY_SRC, "shadow map " + i));
    const detailTex = device.createTexture({ size: [DETAIL_RES, DETAIL_RES], format: "rgba16float", mipLevelCount: DETAIL_LEVELS, usage: TU.STORAGE_BINDING | TU.TEXTURE_BINDING | TU.COPY_SRC, label: "snow detail" });
    const detailSampler = device.createSampler({ addressModeU: "repeat", addressModeV: "repeat", magFilter: "linear", minFilter: "linear", mipmapFilter: "linear" });
    // the deformation field as a filterable texture (render/deformTexture.mjs): written by the pack pass each frame, sampled with hardware bilinear and a repeat sampler by the vertex and fragment stages
    const deformTex = device.createTexture({ size: [deformRes, deformRes], format: "rgba16float", usage: TU.STORAGE_BINDING | TU.TEXTURE_BINDING, label: "deform field f16" }), deformSampler = device.createSampler(DEFORM_SAMPLER);
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
        { binding: 8, visibility: SS.VERTEX | SS.FRAGMENT | SS.COMPUTE, texture: { sampleType: "float" } },
        { binding: 9, visibility: SS.VERTEX | SS.FRAGMENT | SS.COMPUTE, sampler: { type: "filtering" } },
        ...(withShadow ? [3, 4, 5].map((b) => ({ binding: b, visibility: SS.FRAGMENT, texture: { sampleType: "depth" } })).concat([{ binding: 6, visibility: SS.FRAGMENT, texture: { sampleType: "float" } }, { binding: 7, visibility: SS.FRAGMENT, sampler: { type: "filtering" } }]) : []),
    ] });
    const bglShadow = bgl0(false), bglMain = bgl0(true);
    const bglDump = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.COMPUTE, buffer: { type: "read-only-storage" } }, { binding: 1, visibility: SS.COMPUTE, buffer: { type: "storage" } }] });
    const vModule = device.createShaderModule({ code: TERRAIN_VERTEX_WGSL, label: "terrain vertex" }), bModule = device.createShaderModule({ code: ablate.length ? ablateWgsl(BEAUTY_WGSL, ablate) : BEAUTY_WGSL, label: "beauty" });
    const vbufLayout = { arrayStride: 12, attributes: [{ shaderLocation: 0, format: "float32x3", offset: 0 }] };
    const shadowPipe = [0, 1, 2].map((c) => device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglShadow] }), vertex: { module: vModule, entryPoint: "vsShadow", constants: { CASCADE: c }, buffers: [vbufLayout] }, primitive: { topology: "triangle-list", cullMode: "none" }, depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" } }));
    const targets = [{ format: HDR_FORMAT }, { format: DEPTH_FORMAT }];
    const mainLayout = device.createPipelineLayout({ bindGroupLayouts: [bglMain] });
    const terrainPipe = device.createRenderPipeline({ layout: mainLayout, vertex: { module: vModule, entryPoint: "vsMain", buffers: [vbufLayout] }, fragment: { module: bModule, entryPoint: "fsTerrain", targets }, primitive: { topology: "triangle-list", cullMode: "none" }, depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" } });
    const skyPipe = device.createRenderPipeline({ layout: mainLayout, vertex: { module: bModule, entryPoint: "vsSky" }, fragment: { module: bModule, entryPoint: "fsSky", targets }, primitive: { topology: "triangle-list" }, depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" } });
    const dumpPipe = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bglShadow, bglDump] }), compute: { module: vModule, entryPoint: "dumpTerrain" } });
    const deformPipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: KERNEL_WGSL }), entryPoint: "main" } });
    const packPipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: packWgsl(deformRes), label: "deform pack" }), entryPoint: "main" } });
    const bakePipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: BAKE_KERNEL_WGSL }), entryPoint: "main" } });
    const mipPipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: MIP_KERNEL_WGSL }), entryPoint: "main" } });
    const detailBakePipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: DETAIL_BAKE_KERNEL_WGSL, label: "detail bake" }), entryPoint: "main" } }), detailMipPipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: DETAIL_MIP_KERNEL_WGSL }), entryPoint: "main" } });
    const taaPipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: TAA_GPU_WGSL, label: "taa" }), entryPoint: "main" } });
    const presentModule = device.createShaderModule({ code: PRESENT_WGSL });
    const presentPipe = (fmt) => device.createRenderPipeline({ layout: "auto", vertex: { module: presentModule, entryPoint: "vs" }, fragment: { module: presentModule, entryPoint: "fs", targets: [{ format: fmt }] }, primitive: { topology: "triangle-list" } });
    const presentCanvas = presentPipe(format), presentShot = presentPipe("rgba8unorm");
    // ---- bind groups
    const mk0 = (i, withShadow) => device.createBindGroup({ layout: withShadow ? bglMain : bglShadow, entries: [{ binding: 0, resource: { buffer: frameBuf } }, { binding: 1, resource: { buffer: stateBuf[i] } }, { binding: 2, resource: { buffer: skyBuf } }, { binding: 8, resource: deformTex.createView() }, { binding: 9, resource: deformSampler }, ...(withShadow ? [...shadowTex.map((t, i) => ({ binding: 3 + i, resource: t.createView() })), { binding: 6, resource: detailTex.createView() }, { binding: 7, resource: detailSampler }] : [])] });
    const mainBG = [mk0(0, true), mk0(1, true)], shadowBG = [mk0(0, false), mk0(1, false)];
    const deformBG = [0, 1].map((i) => device.createBindGroup({ layout: deformPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: stateBuf[1 - i] } }, { binding: 1, resource: { buffer: deformU } }, { binding: 2, resource: { buffer: stateBuf[i] } }, { binding: 3, resource: { buffer: brushBuf } }] }));   // [i] reads state i, writes 1 - i
    const packBG = [0, 1].map((i) => device.createBindGroup({ layout: packPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: stateBuf[i] } }, { binding: 1, resource: deformTex.createView() }] }));
    const bakeBG = device.createBindGroup({ layout: bakePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: skyBuf } }, { binding: 1, resource: { buffer: skyU } }] });
    const mipBG = mipU.map((u) => device.createBindGroup({ layout: mipPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: skyBuf } }, { binding: 1, resource: { buffer: u } }] }));
    // the detail map: baked once on the GPU into level 0, then the box-filtered chain (trilinear in the fragment stage)
    {
        const lv = (l, usage) => detailTex.createView({ baseMipLevel: l, mipLevelCount: 1 }), pu = mkBuf(16, GU.UNIFORM | GU.COPY_DST, "detail params"); device.queue.writeBuffer(pu, 0, new Float32Array([DETAIL_RES, GRAIN_SCALE, 0, 0]));
        const e = device.createCommandEncoder(); let cp = e.beginComputePass(); cp.setPipeline(detailBakePipe); cp.setBindGroup(0, device.createBindGroup({ layout: detailBakePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: lv(0) }, { binding: 1, resource: { buffer: pu } }] })); cp.dispatchWorkgroups(DETAIL_RES / 8, DETAIL_RES / 8); cp.end();
        for (let l = 1; l < DETAIL_LEVELS; l++) { const n = Math.max(1, DETAIL_RES >> l); cp = e.beginComputePass(); cp.setPipeline(detailMipPipe); cp.setBindGroup(0, device.createBindGroup({ layout: detailMipPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: lv(l - 1) }, { binding: 1, resource: lv(l) }] })); cp.dispatchWorkgroups(Math.ceil(n / 8), Math.ceil(n / 8)); cp.end(); }
        device.queue.submit([e.finish()]);
    }
    let cur = 0;   // which state buffer holds the latest field

    // ---- sky
    let sunElev = 13, sunAzim = 60, sun = sunFrom(sunElev, sunAzim), skyDirty = true, ambient = [0.3, 0.4, 0.55], bakes = 0, shData = new Float32Array(36);
    const GB = [0.55, 0.62, 0.74], SUN_I = 20;
    function setSun(elev, azim = sunAzim) { sunElev = elev; sunAzim = azim; sun = sunFrom(elev, azim); skyDirty = true; ambient = skyAmbient(sun, SUN_I, GB); shData = skySH(sun, SUN_I, GB); }
    setSun(13, 60);

    // ---- camera / history state
    const state = { frame: 0, prevVP: null, historyValid: 0, histIdx: 0, taa: true, resolve: true, jitter: true, flat: false, debug: 0, feedback: 0.9, forceCascade: 0, exposure: 0.55, aerial: 0.0072, softness: 2, bias: 0.05, windDeg: 40, sastrugi: 1, detail: 1, glint: 0.55, graze: 0.72, sss: 1, sssRadius: 1, ambientI: 1, fogFalloff: 0.045, fogStart: 24, aerialStrength: 1 };
    function rebuildSize(w, h) { W = w; H = h; makeTargets(); state.historyValid = 0; state.prevVP = null; }
    const f32 = new Float32Array(FRAME_FLOATS), taaF = new Float32Array(44);
    const clipHalf = gridN / 2;

    async function frame(dt, focus, cam, opts = {}) {
        const o = { present: true, shot: false, ...opts };
        const OW = o.outW || W, OH = o.outH || H;   // a SHOT is the render size unless outW/outH ask for the present pass to upsample it (render scale, tested without a canvas)
        // 1 the field: bookkeeping on the CPU, the pass on the GPU
        const P = field.advance(dt, focus);
        device.queue.writeBuffer(deformU, 0, new Float32Array(packParams(P)));
        device.queue.writeBuffer(brushBuf, 0, field.brushes());
        // 2 the camera
        const aspect = W / H, tanY = Math.tan((cam.fovY || 60) * Math.PI / 360), tanX = tanY * aspect, near = 0.05, far = 2000;
        const b = cameraBasis(cam.pos, cam.target), j = state.taa && state.jitter ? jitterNdc(state.frame, W, H) : [0, 0];
        const vp = viewProj(b, tanX, tanY, near, far, j[0], j[1]), vpClean = viewProj(b, tanX, tanY, near, far, 0, 0);
        const casc = fitCascades(sun, { pos: b.pos, r: b.r, u: b.u, f: b.f, tanX, tanY }, { near, res: shadowRes, minHeight: -4, maxHeight: 5 }), lf = casc[0];
        f32.set(vp, 0); casc.forEach((c, i) => { f32.set(c.vp, 16 + i * 16); f32.set([c.depthRange, c.orthoWidth, 0, 0], 124 + i * 4); }); f32.set([SPLITS[0], SPLITS[1], SPLITS[2], 0], 136);
        f32.set([...b.pos, baseSpacing], 64); f32.set([b.r[0] * tanX, b.r[1] * tanX, b.r[2] * tanX, 0], 68); f32.set([b.u[0] * tanY, b.u[1] * tanY, b.u[2] * tanY, 0], 72); f32.set([...b.f, 0], 76);
        f32.set([...sun, 1], 80); f32.set([...lf.r, 0], 84); f32.set([...lf.u, 0], 88); f32.set([...lf.f, 0], 92);
        f32.set([field.center[0], field.center[1], field.size, field.res], 96); f32.set([clipHalf, shadowRes, state.softness, state.bias], 100); f32.set([0, 0, state.frame, state.flat ? 1 : 0], 104);
        f32.set([...ambient, state.aerial], 108); f32.set([W, H, j[0], j[1]], 112); f32.set([3.0, 2.85, 2.55, 20], 116); f32.set([state.debug, state.forceCascade, 0, 0], 120);
        f32.set(shData, 140); f32.set([state.windDeg * Math.PI / 180, state.flat ? 0 : state.sastrugi, state.detail, state.glint], 176); f32.set([state.graze, state.sss, state.sssRadius, state.ambientI], 180); f32.set([state.aerial, state.fogFalloff, state.fogStart, state.aerialStrength], 184);
        device.queue.writeBuffer(frameBuf, 0, f32);
        // 3 the TAA block
        const prev = state.prevVP || vpClean;
        taaF.set(prev, 0); taaF.set(invView(b), 16); taaF.set([tanX, tanY, 1 / W, 1 / H, j[0], j[1], state.historyValid, state.taa && state.resolve ? 1 : 0, state.feedback, 0, 0, 0], 32);
        device.queue.writeBuffer(taaU, 0, taaF); // the present pass reads the render target at (render size / output size): 1 when the page draws at full size, less when it renders at a scale and the canvas is bigger; a shot is always the render size itself
        device.queue.writeBuffer(expoU, 0, new Float32Array([state.exposure, canvas ? W / canvas.width : 1, canvas ? H / canvas.height : 1, 0])); device.queue.writeBuffer(expoShotU, 0, new Float32Array([state.exposure, W / OW, H / OH, 0]));
        const enc = device.createCommandEncoder();
        const slots = [], tw = (name) => { if (!timers || slots.length >= 16) return undefined; slots.push(name); const k = slots.length - 1; return { querySet: timers.qs, beginningOfPassWriteIndex: 2 * k, endOfPassWriteIndex: 2 * k + 1 }; };
        // field step (writes the other buffer), then the sky if the sun moved
        { const cp = enc.beginComputePass({ timestampWrites: tw("deform") }); cp.setPipeline(deformPipe); cp.setBindGroup(0, deformBG[cur]); cp.dispatchWorkgroups(deformRes / 8, deformRes / 8); cp.end(); }
        cur = 1 - cur; field.endFrame();
        // the field just stepped, copied into the texture the vertex and fragment stages sample (stateBuf[cur] now holds the latest)
        { const pp = enc.beginComputePass({ timestampWrites: tw("deformPack") }); pp.setPipeline(packPipe); pp.setBindGroup(0, packBG[cur]); pp.dispatchWorkgroups(Math.ceil(deformRes / 8), Math.ceil(deformRes / 8)); pp.end(); }
        if (skyDirty) {
            device.queue.writeBuffer(skyU, 0, new Float32Array([sun[0], sun[1], sun[2], SUN_I, GB[0], GB[1], GB[2], SKY_W, SKY_H, 0, 0, 0]));
            const cp = enc.beginComputePass({ timestampWrites: tw("skyBake") }); cp.setPipeline(bakePipe); cp.setBindGroup(0, bakeBG); cp.dispatchWorkgroups(SKY_W / 8, SKY_H / 8); cp.end();
            for (let l = 1; l < SKY_LEVELS; l++) { const m = enc.beginComputePass({ timestampWrites: tw("skyMip" + l) }); m.setPipeline(mipPipe); m.setBindGroup(0, mipBG[l - 1]); m.dispatchWorkgroups(Math.ceil(Math.max(1, SKY_W >> l) / 8), Math.ceil(Math.max(1, SKY_H >> l) / 8)); m.end(); }
            skyDirty = false; bakes++;
        }
        // shadow passes, one per cascade: the same vertex function as the beauty pass
        for (let c = 0; c < CASCADE_COUNT; c++) { const p = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: shadowTex[c].createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" }, timestampWrites: tw("shadow" + c) });
          p.setPipeline(shadowPipe[c]); p.setBindGroup(0, shadowBG[cur]); p.setVertexBuffer(0, vbuf); p.setIndexBuffer(ibuf, "uint32"); p.drawIndexed(clip.indices.length); p.end(); }
        // beauty pass: the sky dome, then ONE indexed draw of the whole clipmap
        { const p = enc.beginRenderPass({ colorAttachments: [{ view: hdr.createView(), clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }, { view: depthCol.createView(), clearValue: [POST_FAR, 0, 0, 0], loadOp: "clear", storeOp: "store" }],
            depthStencilAttachment: { view: sceneDepth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" }, timestampWrites: tw("beauty") });
          p.setBindGroup(0, mainBG[cur]); p.setPipeline(skyPipe); p.draw(3); p.setPipeline(terrainPipe); p.setVertexBuffer(0, vbuf); p.setIndexBuffer(ibuf, "uint32"); p.drawIndexed(clip.indices.length); p.end(); }
        // TAA: current + history -> the other history
        const hi = state.histIdx, ho = 1 - hi;
        { const bg = device.createBindGroup({ layout: taaPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: taaU } }, { binding: 1, resource: hdr.createView() }, { binding: 2, resource: hist[hi].createView() }, { binding: 3, resource: depthCol.createView() }, { binding: 4, resource: hist[ho].createView() }] });
          const cp = enc.beginComputePass({ timestampWrites: tw("taa") }); cp.setPipeline(taaPipe); cp.setBindGroup(0, bg); cp.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8)); cp.end(); }
        // present
        let shotBuf = null, bpr = 0;
        const draw = (pipe, view, eu = expoU) => { const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: hist[ho].createView() }, { binding: 1, resource: { buffer: eu } }] });
            const p = enc.beginRenderPass({ colorAttachments: [{ view, clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }], timestampWrites: tw("present") }); p.setPipeline(pipe); p.setBindGroup(0, bg); p.draw(3); p.end(); };
        if (o.present && ctx) draw(presentCanvas, ctx.getCurrentTexture().createView());
        let shotTex = null;
        if (o.shot) { shotTex = tex([OW, OH], "rgba8unorm", TU.RENDER_ATTACHMENT | TU.COPY_SRC, "shot"); draw(presentShot, shotTex.createView(), expoShotU); bpr = Math.ceil(OW * 4 / 256) * 256; shotBuf = mkBuf(bpr * OH, GU.COPY_DST | GU.MAP_READ, "shot read"); enc.copyTextureToBuffer({ texture: shotTex }, { buffer: shotBuf, bytesPerRow: bpr }, [OW, OH]); }
        if (slots.length) { enc.resolveQuerySet(timers.qs, 0, slots.length * 2, timers.res, 0); enc.copyBufferToBuffer(timers.res, 0, timers.rd, 0, slots.length * 16); }
        device.queue.submit([enc.finish()]);
        if (slots.length) { await timers.rd.mapAsync(MM.READ); const t = new BigUint64Array(timers.rd.getMappedRange().slice(0)); timers.rd.unmap(); stats.passMs = {}; slots.forEach((n, k) => { stats.passMs[n] = Number(t[2 * k + 1] - t[2 * k]) / 1e6; }); }
        state.prevVP = vpClean; state.histIdx = ho; state.historyValid = 1; state.frame++;
        stats.frames = state.frame; stats.bakes = bakes;
        if (!shotBuf) return null;
        await shotBuf.mapAsync(MM.READ); const raw = new Uint8Array(shotBuf.getMappedRange()), out = new Uint8Array(OW * OH * 4);
        for (let y = 0; y < OH; y++) out.set(raw.subarray(y * bpr, y * bpr + OW * 4), y * OW * 4);
        shotBuf.unmap(); shotBuf.destroy(); shotTex.destroy(); return { pixels: out, width: OW, height: OH };
    }
    const stats = { passTimers: !!timers, passMs: null, frames: 0, bakes: 0, vertices: clip.vertices, triangles: clip.triangles, terrainDrawCalls: 1, cascades: CASCADE_COUNT, indices: clip.indices.length, shadowRes };
    async function readBuf(buf, bytes) { const r = mkBuf(bytes, GU.COPY_DST | GU.MAP_READ), e = device.createCommandEncoder(); e.copyBufferToBuffer(buf, 0, r, 0, bytes); device.queue.submit([e.finish()]); await r.mapAsync(MM.READ); const out = new Float32Array(r.getMappedRange().slice(0)); r.unmap(); r.destroy(); return out; }
    return {
        device, field, clip, stats, errors, state, baseSpacing, gridN, levels, deformRes,
        frame, setSun, rebuildSize, get sun() { return sun; }, get ambient() { return ambient; }, get size() { return [W, H]; },
        stamp: (...a) => field.brush(...a),
        readField: () => readBuf(stateBuf[cur], stateBytes), readSky: () => readBuf(skyBuf, SKY_W * SKY_H * 16), readSkyChain: () => readBuf(skyBuf, mipFloats(SKY_W, SKY_H) * 4), detailTex, shadowTex, get sh() { return shData; },
        async dumpTerrain(verts) {
            const n = verts.length / 3, inB = mkBuf(verts.byteLength, GU.STORAGE | GU.COPY_DST), outB = mkBuf(n * 32, GU.STORAGE | GU.COPY_SRC); device.queue.writeBuffer(inB, 0, verts);
            const bg = device.createBindGroup({ layout: bglDump, entries: [{ binding: 0, resource: { buffer: inB } }, { binding: 1, resource: { buffer: outB } }] });
            const e = device.createCommandEncoder(), cp = e.beginComputePass(); cp.setPipeline(dumpPipe); cp.setBindGroup(0, shadowBG[cur]); cp.setBindGroup(1, bg); cp.dispatchWorkgroups(Math.ceil(n / 64)); cp.end(); device.queue.submit([e.finish()]);
            const out = await readBuf(outB, n * 32); inB.destroy(); outB.destroy(); return out;
        },
        shot: (dt, focus, cam, size = {}) => frame(dt, focus, cam, { present: false, shot: true, ...(size.outW ? { outW: size.outW, outH: size.outH } : {}) }),
    };
}
