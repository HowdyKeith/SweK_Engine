// WebGLEngine/render/snowShading.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SNOWFLOW LIFT, THE SNOW MATERIAL'S LIGHTING: GGX, WRAPPED DIFFUSE, SUBSURFACE, GLINTS, SH AMBIENT, RNM. FROM Noniv/snowflow_demo (MIT, vendor/snowflow). ***
// Snow is a dense scatterer with a mean free path of millimetres: light wraps past the terminator (wrapDiffuse), thin drift edges glow from behind (snowSubsurface: a back-scatter lobe whose width and
// amplitude key off thickness, tinted bluer with depth), crystals catch the sun as sparkles only at grazing angles (snowGlints: two world-space octaves of one jittered facet per cell, nailed to the ground so TAA
// keeps them), and shadowed snow is lit by the sky's spherical-harmonic irradiance (shIrradiance).
// OURS: the CPU twins, the WGSL (function bodies lifted verbatim from lib/shading.wgsl, comments stripped; pcssShadow is pcssShadow.mjs), projectSH (the SH fit of the baked sky -- upstream fits its own elsewhere,
// not vendored) and a table kernel. NOT LIFTED: the spell lights (no spells here).
"use strict";
import { latLongToDir } from "./skyBake.mjs";

const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), mix = (a, b, t) => a * (1 - t) + b * t, PI = Math.PI;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }, add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s], neg = (a) => [-a[0], -a[1], -a[2]];
const fract = (x) => x - Math.floor(x);

export function distributionGGX(NdotH, roughness) { const a = roughness * roughness, a2 = a * a, d = NdotH * NdotH * (a2 - 1) + 1; return a2 / Math.max(1e-7, PI * d * d); }
export function visSmithGGXCorrelated(NdotV, NdotL, roughness) { const a = roughness * roughness, a2 = a * a, gv = NdotL * Math.sqrt(NdotV * NdotV * (1 - a2) + a2), gl = NdotV * Math.sqrt(NdotL * NdotL * (1 - a2) + a2); return 0.5 / Math.max(1e-7, gv + gl); }
export function fresnelSchlick(u, f0) { const f = Math.pow(1 - u, 5); return f0.map((c) => c + (1 - c) * f); }
export function fresnelSchlickRough(u, f0, roughness) { const f = Math.pow(1 - u, 5); return f0.map((c) => c + (Math.max(1 - roughness, c) - c) * f); }
export function wrapDiffuse(NdotL, w) { return Math.max(0, (NdotL + w) / ((1 + w) * (1 + w))); }
export function backScatter(N, L, V, distortion, power, thickness) { const H = norm(add(L, scale(N, distortion))); return Math.pow(clamp(dot(V, neg(H)), 0, 1), power) * thickness; }
export function snowSubsurface(N, L, V, lightColor, thickness, strength, radius) {
    const t = clamp(thickness * radius, 0, 1), shallow = [0.94, 0.965, 1.0], deep = [0.55, 0.72, 1.0];
    const back = backScatter(N, L, V, 0.28 * radius, mix(3, 9, thickness), mix(1, 0.30, thickness));
    return [0, 1, 2].map((i) => lightColor[i] * mix(shallow[i], deep[i], t) * back * strength);
}
const hash22 = (px, py) => {
    const f = Math.fround; let x = fract(f(f(px) * 0.1031)), y = fract(f(f(py) * 0.1030)), z = fract(f(f(px) * 0.0973));
    const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33); x += d; y += d; z += d; return [fract((x + y) * z), fract((x + z) * y)];
};
export function glintOctave(p, cell, N, H, T, B, sharpness) {
    const id = [Math.floor(p[0] / cell), Math.floor(p[1] / cell)], r = hash22(id[0], id[1]), r2 = hash22(id[0] + 19.73, id[1] + 7.31);
    if (r2[0] > 0.62) return 0;
    const centre = [(id[0] + 0.5 + (r[0] - 0.5) * 0.72) * cell, (id[1] + 0.5 + (r[1] - 0.5) * 0.72) * cell], d = Math.hypot(p[0] - centre[0], p[1] - centre[1]) / (cell * 0.17), disc = clamp(1 - d * d, 0, 1);
    if (disc <= 0) return 0;
    const ang = r[1] * 6.28318530718, tilt = 0.10 + r2[1] * 0.26, facet = norm(add(N, scale(add(scale(T, Math.cos(ang)), scale(B, Math.sin(ang))), tilt)));
    return disc * Math.pow(clamp(dot(facet, H), 0, 1), sharpness);
}
export function snowGlints(worldXZ, N, V, L, pixelFootprint, intensity, grazeGate) {
    if (intensity <= 0) return 0;
    const H = norm(add(V, L)), up = Math.abs(N[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0], T = norm(cross(up, N)), B = cross(N, T);
    const graze = Math.pow(1 - clamp(dot(N, V), 0, 1), mix(1.5, 5, grazeGate)), NdotL = clamp(dot(N, L), 0, 1), lightGate = smoothstep(0.02, 0.35, NdotL) * (1 - smoothstep(0.55, 0.95, NdotL) * 0.55), gate = graze * lightGate;
    if (gate <= 0.001) return 0;
    let sum = 0;
    const cellA = 0.052, fadeA = smoothstep(cellA * 0.55, cellA * 2.2, pixelFootprint);
    if (fadeA < 1) sum += glintOctave(worldXZ, cellA, N, H, T, B, 780) * (1 - fadeA);
    const cellB = 0.185, fadeB = smoothstep(cellB * 0.55, cellB * 2.2, pixelFootprint);
    if (fadeB < 1) sum += glintOctave([worldXZ[0] + 53.1, worldXZ[1] + 17.9], cellB, N, H, T, B, 1500) * (1 - fadeB) * 1.35;
    return sum * gate * intensity;
}
/** sh: 9 rgb triples in the order shIrradiance reads them (Ramamoorthi & Hanrahan: L00, L1-1 y, L10 z, L11 x, L2-2 xy, L2-1 yz, L20, L21 xz, L22 x2-y2) */
export function shIrradiance(n, sh) {
    const c1 = 0.429043, c2 = 0.511664, c3 = 0.743125, c4 = 0.886227, c5 = 0.247708, [x, y, z] = n;
    return [0, 1, 2].map((k) => sh[0][k] * c4 + sh[1][k] * 2 * c2 * y + sh[2][k] * 2 * c2 * z + sh[3][k] * 2 * c2 * x + sh[4][k] * 2 * c1 * x * y + sh[5][k] * 2 * c1 * y * z + sh[6][k] * (c3 * z * z - c5) + sh[7][k] * 2 * c1 * x * z + sh[8][k] * c1 * (x * x - y * y));
}
export function blendNormalRNM(base, detail) { const t = [base[0], base[1], base[2] + 1], u = [-detail[0], -detail[1], detail[2]]; return norm(add(scale(t, dot(t, u)), scale(u, -t[2]))); }
export const normalFromGradient = (d) => norm([-d[0], 1, -d[1]]);
export const luma = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

/** the 9 SH coefficients of an equirectangular rgba LUT (w x h, row 0 at the top, direction by skyBake's latLongToDir), by solid-angle weighting */
export function projectSH(lut, w, h) {
    const sh = Array.from({ length: 9 }, () => [0, 0, 0]);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const d = latLongToDir((i + 0.5) / w, (j + 0.5) / h), th = ((j + 0.5) / h) * PI, dw = (2 * PI / w) * (PI / h) * Math.sin(th), [x, y, z] = d;
        const Y = [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)];
        for (let b = 0; b < 9; b++) for (let k = 0; k < 3; k++) sh[b][k] += lut[(j * w + i) * 4 + k] * Y[b] * dw;
    }
    return sh;
}
/** the brute-force cosine-weighted irradiance of the same LUT toward n (the reference shIrradiance approximates) */
export function irradianceOf(lut, w, h, n) {
    const e = [0, 0, 0];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const d = latLongToDir((i + 0.5) / w, (j + 0.5) / h), c = Math.max(0, dot(d, n)); if (c === 0) continue;
        const th = ((j + 0.5) / h) * PI, dw = (2 * PI / w) * (PI / h) * Math.sin(th);
        for (let k = 0; k < 3; k++) e[k] += lut[(j * w + i) * 4 + k] * c * dw;
    }
    return e;
}

export const SHADING_WGSL = /* wgsl */ `
fn distributionGGX(NdotH: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let d = NdotH * NdotH * (a2 - 1.0) + 1.0;
    return a2 / max(1e-7, PI * d * d);
}
fn visSmithGGXCorrelated(NdotV: f32, NdotL: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let gv = NdotL * sqrt(NdotV * NdotV * (1.0 - a2) + a2);
    let gl = NdotV * sqrt(NdotL * NdotL * (1.0 - a2) + a2);
    return 0.5 / max(1e-7, gv + gl);
}
fn fresnelSchlick(u: f32, f0: vec3f) -> vec3f {
    let f = pow(1.0 - u, 5.0);
    return f0 + (vec3f(1.0) - f0) * f;
}
fn fresnelSchlickRough(u: f32, f0: vec3f, roughness: f32) -> vec3f {
    let f = pow(1.0 - u, 5.0);
    return f0 + (max(vec3f(1.0 - roughness), f0) - f0) * f;
}
fn wrapDiffuse(NdotL: f32, w: f32) -> f32 {
    let denom = (1.0 + w) * (1.0 + w);
    return max(0.0, (NdotL + w) / denom);
}
fn backScatter(N: vec3f, L: vec3f, V: vec3f, distortion: f32, power: f32, thickness: f32) -> f32 {
    let H = normalize(L + N * distortion);
    let vh = pow(clamp(dot(V, -H), 0.0, 1.0), power);
    return vh * thickness;
}
fn snowSubsurface(
    N: vec3f,
    L: vec3f,
    V: vec3f,
    lightColor: vec3f,
    thickness: f32,
    strength: f32,
    radius: f32
) -> vec3f {
    let shallowTint = vec3f(0.94, 0.965, 1.0);
    let deepTint = vec3f(0.55, 0.72, 1.0);
    let tint = mix(shallowTint, deepTint, clamp(thickness * radius, 0.0, 1.0));
    let back = backScatter(
        N, L, V, 0.28 * radius,
        mix(3.0, 9.0, thickness),
        mix(1.0, 0.30, thickness)
    );
    return lightColor * tint * back * strength;
}
fn glintOctave(
    p: vec2f,
    cell: f32,
    N: vec3f,
    H: vec3f,
    T: vec3f,
    B: vec3f,
    sharpness: f32
) -> f32 {
    let id = floor(p / cell);
    let r = hash22(id);
    let r2 = hash22(id + vec2f(19.73, 7.31));
    if (r2.x > 0.62) { return 0.0; }
    let centre = (id + 0.5 + (r - 0.5) * 0.72) * cell;
    let d = length(p - centre) / (cell * 0.17);
    let disc = clamp(1.0 - d * d, 0.0, 1.0);
    if (disc <= 0.0) { return 0.0; }
    let ang = r.y * 6.28318530718;
    let tilt = 0.10 + r2.y * 0.26;
    let facet = normalize(N + (T * cos(ang) + B * sin(ang)) * tilt);
    let nh = clamp(dot(facet, H), 0.0, 1.0);
    return disc * pow(nh, sharpness);
}
fn snowGlints(
    worldXZ: vec2f,
    N: vec3f,
    V: vec3f,
    L: vec3f,
    pixelFootprint: f32,
    intensity: f32,
    grazeGate: f32
) -> f32 {
    if (intensity <= 0.0) { return 0.0; }
    let H = normalize(V + L);
    let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(N.y) > 0.95);
    let T = normalize(cross(up, N));
    let B = cross(N, T);
    let NdotV = clamp(dot(N, V), 0.0, 1.0);
    let graze = pow(1.0 - NdotV, mix(1.5, 5.0, grazeGate));
    let NdotL = clamp(dot(N, L), 0.0, 1.0);
    let lightGate = smoothstep(0.02, 0.35, NdotL) * (1.0 - smoothstep(0.55, 0.95, NdotL) * 0.55);
    let gate = graze * lightGate;
    if (gate <= 0.001) { return 0.0; }
    var sum = 0.0;
    let cellA = 0.052;
    let fadeA = smoothstep(cellA * 0.55, cellA * 2.2, pixelFootprint);
    if (fadeA < 1.0) {
        sum += glintOctave(worldXZ, cellA, N, H, T, B, 780.0) * (1.0 - fadeA);
    }
    let cellB = 0.185;
    let fadeB = smoothstep(cellB * 0.55, cellB * 2.2, pixelFootprint);
    if (fadeB < 1.0) {
        sum += glintOctave(worldXZ + vec2f(53.1, 17.9), cellB, N, H, T, B, 1500.0) * (1.0 - fadeB) * 1.35;
    }
    return sum * gate * intensity;
}
fn shIrradiance(n: vec3f, sh: array<vec4f, 9>) -> vec3f {
    let c1 = 0.429043;
    let c2 = 0.511664;
    let c3 = 0.743125;
    let c4 = 0.886227;
    let c5 = 0.247708;
    return
        sh[0].rgb * c4
        + sh[1].rgb * 2.0 * c2 * n.y
        + sh[2].rgb * 2.0 * c2 * n.z
        + sh[3].rgb * 2.0 * c2 * n.x
        + sh[4].rgb * 2.0 * c1 * n.x * n.y
        + sh[5].rgb * 2.0 * c1 * n.y * n.z
        + sh[6].rgb * (c3 * n.z * n.z - c5)
        + sh[7].rgb * 2.0 * c1 * n.x * n.z
        + sh[8].rgb * c1 * (n.x * n.x - n.y * n.y);
}
fn blendNormalRNM(base: vec3f, detail: vec3f) -> vec3f {
    let t = base + vec3f(0.0, 0.0, 1.0);
    let u = detail * vec3f(-1.0, -1.0, 1.0);
    return normalize(t * dot(t, u) - u * t.z);
}
fn normalFromGradient(d: vec2f) -> vec3f {
    return normalize(vec3f(-d.x, 1.0, -d.y));
}
fn luma(c: vec3f) -> f32 {
    return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
`;
/** the table kernel: bindings 0 out (4 f32 per query), 2 queries (16 f32: kind then 15 args), 3 sh (9 x 4 f32). kinds: 0 GGX terms (NdotH, NdotV, NdotL, rough, f0) -> D, Vis, F, 0; 1 wrapDiffuse (NdotL, w); 2 snowSubsurface (N3 L3 V3 col3 thick strength radius) -> rgb;
 *  3 snowGlints (xz2, N3, V3, L3, fp, intensity, graze) -> f; 4 shIrradiance (n3) -> rgb; 5 blendNormalRNM (base3, detail3) -> xyz; 6 fresnelSchlickRough (u, f0, rough) -> f */
export const SHADING_QSTRIDE = 16;
export const SHADING_KERNEL_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(2) var<storage, read> queries: array<f32>;
@group(0) @binding(3) var<storage, read> shBuf: array<f32>;
const PI: f32 = 3.14159265359;
fn hash22(p: vec2f) -> vec2f {
    var p3 = fract(vec3f(p.xyx) * vec3f(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
${SHADING_WGSL}
fn q3(o: u32, j: u32) -> vec3f { return vec3f(queries[o + j], queries[o + j + 1u], queries[o + j + 2u]); }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&queries) / ${SHADING_QSTRIDE}u) { return; }
    let o = i * ${SHADING_QSTRIDE}u;
    let k = u32(queries[o]);
    var sh: array<vec4f, 9>;
    for (var j = 0u; j < 9u; j++) { sh[j] = vec4f(shBuf[j * 4u], shBuf[j * 4u + 1u], shBuf[j * 4u + 2u], 0.0); }
    var r = vec4f(0.0);
    if (k == 0u) {
        r = vec4f(distributionGGX(queries[o + 1u], queries[o + 4u]), visSmithGGXCorrelated(queries[o + 2u], queries[o + 3u], queries[o + 4u]), fresnelSchlick(queries[o + 1u], vec3f(queries[o + 5u])).x, 0.0);
    } else if (k == 1u) {
        r = vec4f(wrapDiffuse(queries[o + 1u], queries[o + 2u]), 0.0, 0.0, 0.0);
    } else if (k == 2u) {
        r = vec4f(snowSubsurface(q3(o, 1u), q3(o, 4u), q3(o, 7u), q3(o, 10u), queries[o + 13u], queries[o + 14u], queries[o + 15u]), 0.0);
    } else if (k == 3u) {
        r = vec4f(snowGlints(vec2f(queries[o + 1u], queries[o + 2u]), q3(o, 3u), q3(o, 6u), q3(o, 9u), queries[o + 12u], queries[o + 13u], queries[o + 14u]), 0.0, 0.0, 0.0);
    } else if (k == 4u) {
        r = vec4f(shIrradiance(q3(o, 1u), sh), 0.0);
    } else if (k == 5u) {
        r = vec4f(blendNormalRNM(q3(o, 1u), q3(o, 4u)), 0.0);
    } else {
        r = vec4f(fresnelSchlickRough(queries[o + 1u], vec3f(queries[o + 2u]), queries[o + 3u]).x, 0.0, 0.0, 0.0);
    }
    outBuf[i * 4u] = r.x; outBuf[i * 4u + 1u] = r.y; outBuf[i * 4u + 2u] = r.z; outBuf[i * 4u + 3u] = r.w;
}
`;

export function reportLines() {
    return ["[snowShading] the snow material's lighting: GGX with a correlated Smith visibility, Schlick Fresnel, wrapped diffuse, a thickness-keyed back-scatter lobe tinted bluer with depth, two octaves of world-space glints gated to grazing views,",
        "  nine-coefficient SH irradiance of the baked sky (projectSH), reoriented normal mapping"];
}
