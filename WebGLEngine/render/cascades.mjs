// WebGLEngine/render/cascades.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SNOWFLOW LIFT, CASCADED SHADOW MAPS: THE FIT (render/shadows.js) AND THE LOOKUP (lib/shadowLookup.wgsl), FROM Noniv/snowflow_demo (MIT, vendor/snowflow). ***
// Three cascades over the camera's view-depth slices 0.05..26, 22.9..95 and 83.6..330 m. Each is an orthographic light volume fitted to a bounding SPHERE of its frustum slice (a sphere does not change as the camera
// turns, so shadow edges do not crawl), the radius quantised RELATIVELY (to 1/256 of its power of two) so round-trip noise cannot cross a step, the centre snapped to the map's own texel lattice along the light's two
// lateral axes (so the map does not resample as the camera moves), and the depth range SOLVED from the terrain's height extent and the sun's elevation (at a 13 degree sun the ground gains cot(13) = 4.33 m of light
// depth per metre across; a fixed budget would clip it) with the sun clamped to 2 degrees. The lookup picks the cascade by view distance and cross-fades over the last 12% of each slice.
// OURS: fitCascades (the fit in plain arrays, WebGPU depth 0..1, the same basis as render/snowGpu.mjs's lightFit), CASCADE_SHADOW_WGSL (the lookup over three depth textures: the selection and blend lines are
// upstream's; the texture plumbing, the Y convention of a WebGPU row-0-top map and the plane-gradient sign that goes with it are ours), shadowCascadeIndex / cascadeBlend (the selection as plain functions).
// NOT LIFTED: the Babylon render targets and casters.
"use strict";
import { PCSS_WGSL } from "./pcssShadow.mjs";

export const CASCADE_COUNT = 3, SPLITS = Object.freeze([26, 95, 330]), BLEND = 0.88, FAR_FADE = 0.85, MARGIN = 12, MIN_SUN_Y = -0.0349, TEXEL_PAD = 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }, scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** the 8 corners of the camera frustum between view depths zn and zf. cam: { pos, r, u, f, tanX, tanY } (r, u, f unit; the view ray of NDC (sx, sy) is f + sx tanX r + sy tanY u) */
export function sliceCorners(cam, zn, zf) {
    const out = [];
    for (const z of [zn, zf]) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(add(cam.pos, scale(add(add(cam.f, scale(cam.r, sx * cam.tanX)), scale(cam.u, sy * cam.tanY)), z)));
    return out;
}
/** one cascade, as upstream's _fitCascade: returns { vp (column-major), r, u, f, radius, center, backoff, near, far, depthRange, orthoWidth, texelWorld } */
export function fitCascade(sunDir, cam, zn, zf, { res = 2048, minHeight = -60, maxHeight = 60 } = {}) {
    const corners = sliceCorners(cam, zn, zf), ld = norm([-sunDir[0], -sunDir[1], -sunDir[2]]);
    let c = [0, 0, 0]; for (const k of corners) c = add(c, k); c = scale(c, 1 / 8);
    let radius = 0; for (const k of corners) radius = Math.max(radius, Math.hypot(...sub(c, k)));
    radius = Math.max(radius, 0.5);
    const q = Math.pow(2, Math.ceil(Math.log2(radius)) - 8); radius = Math.ceil(radius / q) * q;
    const up = Math.abs(ld[1]) > 0.995 ? [0, 0, 1] : [0, 1, 0], right = norm(cross(up, ld)), lup = cross(ld, right);
    const texelWorld = (radius * 2) / res, cr = Math.floor(dot(c, right) / texelWorld) * texelWorld, cu = Math.floor(dot(c, lup) / texelWorld) * texelWorld, cf = dot(c, ld);
    c = [right[0] * cr + lup[0] * cu + ld[0] * cf, right[1] * cr + lup[1] * cu + ld[1] * cf, right[2] * cr + lup[2] * cu + ld[2] * cf];
    const fy = Math.min(ld[1], MIN_SUN_Y), relief = radius + TEXEL_PAD;
    let gMin = Infinity, gMax = -Infinity;
    for (let i = 0; i < 4; i++) { const yRel = i < 2 ? -relief : relief, py = i % 2 === 0 ? minHeight : maxHeight, g = (py - c[1] - yRel * lup[1]) / fy; gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); }
    const backoff = MARGIN - gMin, near = MARGIN * 0.5, far = backoff + gMax + MARGIN, range = far - near, m = new Array(16).fill(0);
    const rows = [[...scale(right, 1 / radius), -dot(right, c) / radius], [...scale(lup, 1 / radius), -dot(lup, c) / radius], [...scale(ld, 1 / range), (backoff - near - dot(ld, c)) / range], [0, 0, 0, 1]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) m[j * 4 + i] = rows[i][j];
    return { vp: m, r: right, u: lup, f: ld, radius, center: c, backoff, near, far, depthRange: range, orthoWidth: radius * 2, texelWorld };
}
/** all three cascades: slice c runs from SPLITS[c-1] x 0.88 (the overlap the cross-fade needs) to SPLITS[c] */
export function fitCascades(sunDir, cam, opts = {}) {
    const near = opts.near ?? 0.05, out = []; let zn = near;
    for (let c = 0; c < CASCADE_COUNT; c++) { out.push(fitCascade(sunDir, cam, zn, SPLITS[c], opts)); zn = SPLITS[c] * BLEND; }
    return out;
}
/** the project-into-NDC step of the lookup: returns { ndc, outside } for a world point through a column-major vp */
export function projectCascade(vp, p) {
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], z = vp[2] * p[0] + vp[6] * p[1] + vp[10] * p[2] + vp[14], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    const ndc = [x / w, y / w, z / w];
    return { ndc, outside: Math.abs(ndc[0]) > 1 || Math.abs(ndc[1]) > 1 || ndc[2] < 0 || ndc[2] > 1 };
}
/** which cascade a view distance reads and with what blend toward the next: { c, blend (0 = pure c .. 1 = pure c + 1), fade (0 .. 1 toward fully lit past the last) } */
export function cascadeBlend(viewDist, splits = SPLITS) {
    if (viewDist >= splits[2]) return { c: 3, blend: 0, fade: 1 };
    const clamp = (x) => Math.min(1, Math.max(0, x));
    if (viewDist < splits[0]) { const s = splits[0] * BLEND; return { c: 0, blend: viewDist <= s ? 0 : clamp((viewDist - s) / (splits[0] - s)), fade: 0 }; }
    if (viewDist < splits[1]) { const s = splits[1] * BLEND; return { c: 1, blend: viewDist <= s ? 0 : clamp((viewDist - s) / (splits[1] - s)), fade: 0 }; }
    const t = clamp((viewDist - splits[2] * FAR_FADE) / (splits[2] - splits[2] * FAR_FADE)); return { c: 2, blend: 0, fade: t * t * (3 - 2 * t) };
}

// ---- WGSL: the lookup over three depth textures. Needs the includer's `F` Frame with debug (y forces a cascade), cascVP: array<mat4x4f, 3>, cascParams: array<vec4f, 3> (depth range m, ortho width m), splits: vec4f, sunDir, params (z softness, w bias, y map res).
const perCascade = (i) => `
@group(0) @binding(${3 + i}) var shadowMap${i}: texture_depth_2d;
fn mapAt${i}(x: i32, y: i32) -> f32 {
    let r = i32(F.params.y);
    return textureLoad(shadowMap${i}, vec2i(clamp(x, 0, r - 1), clamp(y, 0, r - 1)), 0);
}
fn sampleMap${i}(uv: vec2f) -> f32 {
    let res = F.params.y;
    let p = clamp(uv * res - 0.5, vec2f(0.0), vec2f(res - 1.0));
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(mapAt${i}(x0, y0), mapAt${i}(x0 + 1, y0), f.x), mix(mapAt${i}(x0, y0 + 1), mapAt${i}(x0 + 1, y0 + 1), f.x), f.y);
}
${PCSS_WGSL.replace(/fn pcssShadow\(/, `fn pcssShadow${i}(`).replace(/sampleMap\(s\)/g, `sampleMap${i}(s)`).replace(i > 0 ? /const POISSON[\s\S]*?\);\n/ : /$^/, "")}
`;
export const CASCADE_SHADOW_WGSL = /* wgsl */ `
${[0, 1, 2].map(perCascade).join("")}
fn sampleCascadeTex(i: i32, world: vec3f, geoN: vec3f, biasWorld: f32, softness: f32, noiseRot: f32) -> f32 {
    let m = F.cascVP[i];
    let params = F.cascParams[i];
    let depthRange = params.x;
    let orthoWidth = params.y;
    let texelSize = 1.0 / F.params.y;
    let texelWorld = orthoWidth * texelSize;
    let lf = -F.sunDir.xyz;
    let lr = normalize(cross(vec3f(0.0, 1.0, 0.0), lf));
    let lu = cross(lf, lr);
    let nl = vec3f(dot(geoN, lr), dot(geoN, lu), dot(geoN, lf));
    let nz = select(min(nl.z, -1e-3), max(nl.z, 1e-3), nl.z >= 0.0);
    let grad = clamp(vec2f(-nl.x / nz, -nl.y / nz), vec2f(-6.0), vec2f(6.0));
    let planeNdcPerUV = vec2f(grad.x, -grad.y) * orthoWidth / depthRange;
    let sinL = sqrt(clamp(1.0 - nl.z * nl.z, 0.0, 1.0));
    let biased = world + geoN * (texelWorld * 1.5 * max(sinL, 0.2));
    let clip = m * vec4f(biased, 1.0);
    let ndc = clip.xyz / clip.w;
    if (any(abs(ndc.xy) > vec2f(1.0)) || ndc.z < 0.0 || ndc.z > 1.0) { return 1.0; }
    let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    if (i == 0) { return pcssShadow0(uv, ndc.z, texelSize, depthRange, orthoWidth, softness, noiseRot, biasWorld, planeNdcPerUV); }
    if (i == 1) { return pcssShadow1(uv, ndc.z, texelSize, depthRange, orthoWidth, softness, noiseRot, biasWorld, planeNdcPerUV); }
    return pcssShadow2(uv, ndc.z, texelSize, depthRange, orthoWidth, softness, noiseRot, biasWorld, planeNdcPerUV);
}
fn sunShadow(world: vec3f, geoN: vec3f, viewDist: f32, noiseRot: f32) -> f32 {
    let biasWorld = F.params.w;
    let sp = F.splits;
    let soft = F.params.z;
    // the gate's lever: debug.y = 1, 2 or 3 reads that cascade alone, whatever the distance
    if (F.debug.y > 0.5) { return sampleCascadeTex(i32(F.debug.y) - 1, world, geoN, biasWorld, soft, noiseRot); }
    if (viewDist >= sp.z) { return 1.0; }
    if (viewDist < sp.x) {
        let s = sampleCascadeTex(0, world, geoN, biasWorld, soft, noiseRot);
        let blendStart = sp.x * 0.88;
        if (viewDist <= blendStart) { return s; }
        let s2 = sampleCascadeTex(1, world, geoN, biasWorld, soft, noiseRot);
        return mix(s, s2, clamp((viewDist - blendStart) / (sp.x - blendStart), 0.0, 1.0));
    }
    if (viewDist < sp.y) {
        let s = sampleCascadeTex(1, world, geoN, biasWorld, soft, noiseRot);
        let blendStart = sp.y * 0.88;
        if (viewDist <= blendStart) { return s; }
        let s2 = sampleCascadeTex(2, world, geoN, biasWorld, soft, noiseRot);
        return mix(s, s2, clamp((viewDist - blendStart) / (sp.y - blendStart), 0.0, 1.0));
    }
    let s = sampleCascadeTex(2, world, geoN, biasWorld, soft, noiseRot);
    return mix(s, 1.0, smoothstep(sp.z * 0.85, sp.z, viewDist));
}
`;

export function reportLines() {
    return ["[cascades] three cascaded shadow maps (splits 26 / 95 / 330 m): sphere-fitted light volumes with a relatively quantised radius, centres snapped to the map's texel lattice, the depth range solved from the terrain's height extent and the sun's",
        "  elevation (sun clamped to 2 degrees), a 12% cross-fade between slices and a fade to lit past the last"];
}
