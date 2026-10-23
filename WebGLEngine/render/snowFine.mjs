// WebGLEngine/render/snowFine.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SNOWFLOW LIFT, THE FINE SURFACE: SASTRUGI, RIPPLES, GRAIN AND THE BAKED DETAIL NORMAL, FROM Noniv/snowflow_demo (MIT, vendor/snowflow). ***
// terrainFine is the vertex-stage height (and slope) of the wind-carved relief; terrainFineFiltered is the same surface with each layer faded out as its wavelength nears a pixel (the fragment's normal);
// windLocal veers and stretches the ridges patch by patch so the field is not corduroy. The detail map is upstream's detailBake: three packed-grain scales, a tangent-space normal and a cavity term.
// OURS: the CPU twins (f64 arithmetic over an f32 hash), the WGSL (function bodies lifted verbatim from lib/terrain.wgsl, lib/noise.wgsl and detailBake.fragment.wgsl, comments stripped), a compute kernel that
// evaluates them over a table, and bakeDetail (the CPU bake; the GPU bakes the same function into a mipped texture). grainScale (the tilt of a bake's normals) and the bake's resolution are NOT upstream's
// (they live in code that is not vendored): they are set here and said so.
"use strict";
import { hash21 } from "./toroidalDeform.mjs";

const f32 = Math.fround, fract = (x) => x - Math.floor(x);
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a * (1 - t) + b * t;

// ---- mat2 as columns [c0x, c0y, c1x, c1y]; WGSL's mat2x2f(a, b, c, d) fills column by column
const mulV = (m, v) => [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1]];
const mulM = (a, b) => [...mulV(a, [b[0], b[1]]), ...mulV(a, [b[2], b[3]])];
const vecM = (v, m) => [v[0] * m[0] + v[1] * m[1], v[0] * m[2] + v[1] * m[3]];
export const rot2 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, s, c]; };
export const hash22 = (px, py) => {
    let x = fract(f32(f32(px) * 0.1031)), y = fract(f32(f32(py) * 0.1030)), z = fract(f32(f32(px) * 0.0973));
    const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33); x += d; y += d; z += d;
    return [fract((x + y) * z), fract((x + z) * y)];
};
const grad2 = (ix, iy) => { const a = hash21(ix, iy) * 6.28318530718; return [Math.cos(a), Math.sin(a)]; };
/** upstream noised: [value, d/dx, d/dy] */
export function noised(px, py) {
    const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const dux = 30 * fx * fx * (fx * (fx - 2) + 1), duy = 30 * fy * fy * (fy * (fy - 2) + 1);
    const ga = grad2(ix, iy), gb = grad2(ix + 1, iy), gc = grad2(ix, iy + 1), gd = grad2(ix + 1, iy + 1);
    const va = ga[0] * fx + ga[1] * fy, vb = gb[0] * (fx - 1) + gb[1] * fy, vc = gc[0] * fx + gc[1] * (fy - 1), vd = gd[0] * (fx - 1) + gd[1] * (fy - 1);
    const k1 = vb - va, k2 = vc - va, k3 = va - vb - vc + vd;
    const dx = ga[0] + ux * (gb[0] - ga[0]) + uy * (gc[0] - ga[0]) + ux * uy * (ga[0] - gb[0] - gc[0] + gd[0]) + dux * (uy * k3 + k1);
    const dy = ga[1] + ux * (gb[1] - ga[1]) + uy * (gc[1] - ga[1]) + ux * uy * (ga[1] - gb[1] - gc[1] + gd[1]) + duy * (ux * k3 + k2);
    return [va + k1 * ux + k2 * uy + k3 * ux * uy, dx, dy];
}
export const noise2 = (px, py) => noised(px, py)[0];
/** upstream ridgedd: [value, d/dx, d/dy] */
export function ridgedd(px, py, octaves, lacunarity, gain) {
    let p = [px, py], amp = 0.5, freq = 1, sum = 0, d = [0, 0], prev = 1;
    const m = rot2(0.717); let xf = [1, 0, 0, 1];
    for (let i = 0; i < octaves; i++) {
        const n = noised(p[0] * freq, p[1] * freq), s = Math.sign(n[0]), r = 1 - Math.abs(n[0]), r2 = r * r, dr2 = -2 * r * s;
        sum += amp * r2 * prev;
        const g = vecM([n[1], n[2]], xf); d[0] += amp * prev * freq * dr2 * g[0]; d[1] += amp * prev * freq * dr2 * g[1];
        prev = mix(1, r2, 0.65); amp *= gain; freq *= lacunarity; p = mulV(m, p); xf = mulM(m, xf);
    }
    return [sum, d[0], d[1]];
}
export function windMat(angle, sx, sy, scale) { const c = Math.cos(angle), s = Math.sin(angle); return mulM([sx / scale, 0, 0, sy / scale], [c, -s, s, c]); }
export function windLocal(px, py) {
    return [noise2(px * 0.0083 + 31.7, py * 0.0083 + 12.3) * 0.42, 2.3 + 2.4 * (noise2(px * 0.0126 + 7.1, py * 0.0126 + 41.9) * 0.5 + 0.5)];
}
/** upstream terrainFine: [height m, dH/dx, dH/dz] */
export function terrainFine(px, pz, w, exposure, amp) {
    let h = 0, d = [0, 0];
    const wl = windLocal(px, pz), m3 = windMat(w + wl[0], 1, wl[1], 2.3), q3 = mulV(m3, [px, pz]), sas = ridgedd(q3[0], q3[1], 3, 2.11, 0.52);
    const scour = 0.45 + 0.55 * smoothstep(-0.25, 0.35, noise2(px * 0.021, pz * 0.021)), sasAmp = 0.125 * amp * mix(0.45, 1, exposure) * scour;
    h += (sas[0] - 0.35) * sasAmp; let g = vecM([sas[1], sas[2]], m3); d[0] += g[0] * sasAmp; d[1] += g[1] * sasAmp;
    const m4 = windMat(w + wl[0] * 0.5, 2.9, 1, 0.42), q4 = mulV(m4, [px, pz]), rip = noised(q4[0], q4[1]), ripAmp = 0.024 * amp * mix(1, 0.45, exposure);
    h += rip[0] * ripAmp; g = vecM([rip[1], rip[2]], m4); d[0] += g[0] * ripAmp; d[1] += g[1] * ripAmp;
    const m5 = windMat(w, 1, 1, 0.115), q5 = mulV(m5, [px, pz]), gr = noised(q5[0], q5[1]), grAmp = 0.0075 * amp;
    h += gr[0] * grAmp; g = vecM([gr[1], gr[2]], m5); d[0] += g[0] * grAmp; d[1] += g[1] * grAmp;
    return [h, d[0], d[1]];
}
/** upstream terrainFineFiltered; fp is the world size of a pixel */
export function terrainFineFiltered(px, pz, w, exposure, amp, fp) {
    let h = 0, d = [0, 0];
    const wl = windLocal(px, pz), fadeS = 1 - smoothstep(0.35, 1.6, fp);
    if (fadeS > 0.001) {
        const m3 = windMat(w + wl[0], 1, wl[1], 2.3), q = mulV(m3, [px, pz]), sas = ridgedd(q[0], q[1], 3, 2.11, 0.52);
        const scour = 0.45 + 0.55 * smoothstep(-0.25, 0.35, noise2(px * 0.021, pz * 0.021)), a = 0.125 * amp * mix(0.45, 1, exposure) * scour * fadeS;
        h += (sas[0] - 0.35) * a; const g = vecM([sas[1], sas[2]], m3); d[0] += g[0] * a; d[1] += g[1] * a;
    }
    const fadeR = 1 - smoothstep(0.06, 0.3, fp);
    if (fadeR > 0.001) {
        const m4 = windMat(w + wl[0] * 0.5, 2.9, 1, 0.42), q = mulV(m4, [px, pz]), rip = noised(q[0], q[1]), a = 0.024 * amp * mix(1, 0.45, exposure) * fadeR;
        h += rip[0] * a; const g = vecM([rip[1], rip[2]], m4); d[0] += g[0] * a; d[1] += g[1] * a;
    }
    const fadeG = 1 - smoothstep(0.016, 0.08, fp);
    if (fadeG > 0.001) {
        const m5 = windMat(w, 1, 1, 0.115), q = mulV(m5, [px, pz]), gr = noised(q[0], q[1]), a = 0.0075 * amp * fadeG;
        h += gr[0] * a; const g = vecM([gr[1], gr[2]], m5); d[0] += g[0] * a; d[1] += g[1] * a;
    }
    return [h, d[0], d[1]];
}

// ---- the detail bake
export const DETAIL_RES = 256, GRAIN_SCALE = 0.02;
const hashTile = (ix, iy, period) => hash22(ix - Math.floor(ix / period) * period, iy - Math.floor(iy / period) * period);
export function grainHeight(px, py, cells, period) {
    const gx = px * cells, gy = py * cells, ix = Math.floor(gx), iy = Math.floor(gy); let h = 0, cav = 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const idx = ix + dx, idy = iy + dy, r = hashTile(idx, idy, period), r2 = hashTile(idx + 37, idy + 91, period);
        const cx = idx + 0.25 + r[0] * 0.5, cy = idy + 0.25 + r[1] * 0.5, radius = 0.30 + r2[0] * 0.26, d = Math.hypot(gx - cx, gy - cy) / radius;
        if (d < 1) { h = Math.max(h, Math.sqrt(Math.max(0, 1 - d * d)) * (0.55 + r2[1] * 0.45)); cav = Math.min(cav, 1 - (1 - d) * 0.5); }
    }
    return [h, cav];
}
export function detailHeight(u, v) {
    const a = grainHeight(u, v, 26, 26), b = grainHeight(u + 0.37, v + 0.11, 61, 61), c = grainHeight(u + 0.71, v + 0.53, 137, 137);
    return [a[0] + b[0] * 0.42 + c[0] * 0.17, a[1] * 0.55 + b[1] * 0.30 + c[1] * 0.15];
}
/** one texel of the bake at uv: [nx*0.5+0.5, ny*0.5+0.5, cavity, height] */
export function detailTexel(u, v, res = DETAIL_RES, grainScale = GRAIN_SCALE) {
    const e = 1 / res, c = detailHeight(u, v), hL = detailHeight(u - e, v)[0], hR = detailHeight(u + e, v)[0], hD = detailHeight(u, v - e)[0], hU = detailHeight(u, v + e)[0];
    const dx = (hR - hL) / (2 * e), dz = (hU - hD) / (2 * e), nx = -dx * grainScale, ny = -dz * grainScale, l = Math.hypot(nx, ny, 1);
    return [nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, c[1], c[0]];
}
/** the whole level-0 map, texel centres at (i + 0.5) / res: Float32Array(res * res * 4) */
export function bakeDetail(res = DETAIL_RES, grainScale = GRAIN_SCALE) {
    const out = new Float32Array(res * res * 4);
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) out.set(detailTexel((x + 0.5) / res, (y + 0.5) / res, res, grainScale), (y * res + x) * 4);
    return out;
}

// ---- WGSL (lifted, comments stripped)
export const FINE_NOISE_WGSL = /* wgsl */ `
fn hash22(p: vec2f) -> vec2f {
    var p3 = fract(vec3f(p.xyx) * vec3f(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
fn rot2(a: f32) -> mat2x2f {
    let c = cos(a);
    let s = sin(a);
    return mat2x2f(c, -s, s, c);
}
fn ridgedd(p0: vec2f, octaves: i32, lacunarity: f32, gain: f32) -> vec3f {
    var p = p0;
    var amp = 0.5;
    var freq = 1.0;
    var sum = 0.0;
    var deriv = vec2f(0.0);
    var prev = 1.0;
    let m = rot2(0.717);
    var xform = mat2x2f(1.0, 0.0, 0.0, 1.0);
    for (var i = 0; i < octaves; i++) {
        let n = noised(p * freq);
        let s = sign(n.x);
        let r = 1.0 - abs(n.x);
        let r2 = r * r;
        let dr2 = -2.0 * r * s;
        sum += amp * r2 * prev;
        deriv += amp * prev * freq * (dr2 * n.yz * xform);
        prev = mix(1.0, r2, 0.65);
        amp *= gain;
        freq *= lacunarity;
        p = m * p;
        xform = m * xform;
    }
    return vec3f(sum, deriv);
}
fn ign(pix: vec2f) -> f32 {
    return fract(52.9829189 * fract(dot(pix, vec2f(0.06711056, 0.00583715))));
}
`;
export const FINE_TERRAIN_WGSL = /* wgsl */ `
fn windMat(angle: f32, sx: f32, sy: f32, scale: f32) -> mat2x2f {
    let c = cos(angle);
    let s = sin(angle);
    let r = mat2x2f(c, -s, s, c);
    let d = mat2x2f(sx / scale, 0.0, 0.0, sy / scale);
    return d * r;
}
fn windLocal(p: vec2f) -> vec2f {
    let veer = noise2(p * 0.0083 + vec2f(31.7, 12.3)) * 0.42;
    let stretch = 2.3 + 2.4 * (noise2(p * 0.0126 + vec2f(7.1, 41.9)) * 0.5 + 0.5);
    return vec2f(veer, stretch);
}
fn terrainFine(p: vec2f, w: f32, exposure: f32, amp: f32) -> vec3f {
    var h = 0.0;
    var d = vec2f(0.0);
    let wl = windLocal(p);
    let m3 = windMat(w + wl.x, 1.0, wl.y, 2.3);
    let sas = ridgedd(m3 * p, 3, 2.11, 0.52);
    let scour = 0.45 + 0.55 * smoothstep(-0.25, 0.35, noise2(p * 0.021));
    let sasAmp = 0.125 * amp * mix(0.45, 1.0, exposure) * scour;
    h += (sas.x - 0.35) * sasAmp;
    d += (sas.yz * m3) * sasAmp;
    let m4 = windMat(w + wl.x * 0.5, 2.9, 1.0, 0.42);
    let rip = noised(m4 * p);
    let ripAmp = 0.024 * amp * mix(1.0, 0.45, exposure);
    h += rip.x * ripAmp;
    d += (rip.yz * m4) * ripAmp;
    let m5 = windMat(w, 1.0, 1.0, 0.115);
    let gr = noised(m5 * p);
    let grAmp = 0.0075 * amp;
    h += gr.x * grAmp;
    d += (gr.yz * m5) * grAmp;
    return vec3f(h, d);
}
fn terrainFineFiltered(p: vec2f, w: f32, exposure: f32, amp: f32, fp: f32) -> vec3f {
    var h = 0.0;
    var d = vec2f(0.0);
    let wl = windLocal(p);
    let fadeS = 1.0 - smoothstep(0.35, 1.6, fp);
    if (fadeS > 0.001) {
        let m3 = windMat(w + wl.x, 1.0, wl.y, 2.3);
        let sas = ridgedd(m3 * p, 3, 2.11, 0.52);
        let scour = 0.45 + 0.55 * smoothstep(-0.25, 0.35, noise2(p * 0.021));
        let a = 0.125 * amp * mix(0.45, 1.0, exposure) * scour * fadeS;
        h += (sas.x - 0.35) * a;
        d += (sas.yz * m3) * a;
    }
    let fadeR = 1.0 - smoothstep(0.06, 0.3, fp);
    if (fadeR > 0.001) {
        let m4 = windMat(w + wl.x * 0.5, 2.9, 1.0, 0.42);
        let rip = noised(m4 * p);
        let a = 0.024 * amp * mix(1.0, 0.45, exposure) * fadeR;
        h += rip.x * a;
        d += (rip.yz * m4) * a;
    }
    let fadeG = 1.0 - smoothstep(0.016, 0.08, fp);
    if (fadeG > 0.001) {
        let m5 = windMat(w, 1.0, 1.0, 0.115);
        let gr = noised(m5 * p);
        let a = 0.0075 * amp * fadeG;
        h += gr.x * a;
        d += (gr.yz * m5) * a;
    }
    return vec3f(h, d);
}
`;
export const DETAIL_WGSL = /* wgsl */ `
fn hashTile(id: vec2f, period: f32) -> vec2f {
    let w = id - floor(id / period) * period;
    return hash22(w);
}
fn grainHeight(p: vec2f, cells: f32, period: f32) -> vec2f {
    let gp = p * cells;
    let gi = floor(gp);
    var h = 0.0;
    var cav = 1.0;
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let id = gi + vec2f(f32(dx), f32(dy));
            let r = hashTile(id, period);
            let r2 = hashTile(id + vec2f(37.0, 91.0), period);
            let centre = id + 0.25 + r * 0.5;
            let radius = 0.30 + r2.x * 0.26;
            let d = length(gp - centre) / radius;
            if (d < 1.0) {
                let dome = sqrt(max(0.0, 1.0 - d * d)) * (0.55 + r2.y * 0.45);
                h = max(h, dome);
                cav = min(cav, 1.0 - (1.0 - d) * 0.5);
            }
        }
    }
    return vec2f(h, cav);
}
fn detailHeight(uv: vec2f) -> vec2f {
    let a = grainHeight(uv, 26.0, 26.0);
    let b = grainHeight(uv + vec2f(0.37, 0.11), 61.0, 61.0);
    let c = grainHeight(uv + vec2f(0.71, 0.53), 137.0, 137.0);
    let h = a.x * 1.0 + b.x * 0.42 + c.x * 0.17;
    let cav = a.y * 0.55 + b.y * 0.30 + c.y * 0.15;
    return vec2f(h, cav);
}
`;
/** one texel of upstream's detail bake from its uv (the body of detailBake's main, as a function): rgba = normal.xy * 0.5 + 0.5, cavity, height. Needs DETAIL_WGSL and hash22. */
export const DETAIL_TEXEL_WGSL = /* wgsl */ `
fn detailTexel(uv: vec2f, res: f32, gs: f32) -> vec4f {
    let e = 1.0 / res;
    let c = detailHeight(uv);
    let hL = detailHeight(uv - vec2f(e, 0.0)).x;
    let hR = detailHeight(uv + vec2f(e, 0.0)).x;
    let hD = detailHeight(uv - vec2f(0.0, e)).x;
    let hU = detailHeight(uv + vec2f(0.0, e)).x;
    let dx = (hR - hL) / (2.0 * e);
    let dz = (hU - hD) / (2.0 * e);
    let n = normalize(vec3f(-dx * gs, -dz * gs, 1.0));
    return vec4f(n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, c.y, c.x);
}
`;
/** the bake at level 0 into a storage texture (rgba16float): binding 0 the texture, binding 1 uniform (res, grainScale, 0, 0); dispatch ceil(res / 8) squared. Prepend hash22 (FINE_NOISE_WGSL). */
export const DETAIL_BAKE_KERNEL_WGSL = /* wgsl */ `
${FINE_NOISE_WGSL.slice(0, FINE_NOISE_WGSL.indexOf("fn rot2"))}
${DETAIL_WGSL}
${DETAIL_TEXEL_WGSL}
@group(0) @binding(0) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var<uniform> P: vec4f;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    if (f32(gid.x) >= P.x || f32(gid.y) >= P.x) { return; }
    textureStore(outTex, vec2i(gid.xy), detailTexel((vec2f(gid.xy) + 0.5) / P.x, P.x, P.y));
}
`;
/** one 2 x 2 box-filter step down the mip chain: binding 0 the level above (texture), binding 1 the level to write (storage); dispatch over the level being written */
export const DETAIL_MIP_KERNEL_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let d = textureDimensions(dst);
    if (gid.x >= d.x || gid.y >= d.y) { return; }
    let b = vec2i(gid.xy) * 2;
    textureStore(dst, vec2i(gid.xy), (textureLoad(src, b, 0) + textureLoad(src, b + vec2i(1, 0), 0) + textureLoad(src, b + vec2i(0, 1), 0) + textureLoad(src, b + vec2i(1, 1), 0)) * 0.25);
}
`;
export const DETAIL_LEVELS = 9;
/** the table kernel: bindings 0 out (4 f32 per query), 2 queries (8 f32: kind, x, z, wind, exposure, amp, footprint, pad). kind 0 terrainFine, 1 terrainFineFiltered, 2 windLocal, 3 detailTexel(x=u, z=v, wind=res, exposure=grainScale) */
export const FINE_QSTRIDE = 8;
export const FINE_KERNEL_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(2) var<storage, read> queries: array<f32>;
const PI: f32 = 3.14159265359;
fn hash21(p: vec2f) -> f32 {
    var p3 = fract(vec3f(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
fn grad2(i: vec2f) -> vec2f { let a = hash21(i) * 6.28318530718; return vec2f(cos(a), sin(a)); }
fn noised(p: vec2f) -> vec3f {
    let i = floor(p);
    let f = p - i;
    let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    let du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    let ga = grad2(i + vec2f(0.0, 0.0));
    let gb = grad2(i + vec2f(1.0, 0.0));
    let gc = grad2(i + vec2f(0.0, 1.0));
    let gd = grad2(i + vec2f(1.0, 1.0));
    let va = dot(ga, f - vec2f(0.0, 0.0));
    let vb = dot(gb, f - vec2f(1.0, 0.0));
    let vc = dot(gc, f - vec2f(0.0, 1.0));
    let vd = dot(gd, f - vec2f(1.0, 1.0));
    let k0 = va;
    let k1 = vb - va;
    let k2 = vc - va;
    let k3 = va - vb - vc + vd;
    let value = k0 + k1 * u.x + k2 * u.y + k3 * u.x * u.y;
    let deriv = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (vec2f(u.y, u.x) * k3 + vec2f(k1, k2));
    return vec3f(value, deriv);
}
fn noise2(p: vec2f) -> f32 { return noised(p).x; }
${FINE_NOISE_WGSL}
${FINE_TERRAIN_WGSL}
${DETAIL_WGSL}
${DETAIL_TEXEL_WGSL}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&queries) / ${FINE_QSTRIDE}u) { return; }
    let o = i * ${FINE_QSTRIDE}u;
    let kind = u32(queries[o]);
    let p = vec2f(queries[o + 1u], queries[o + 2u]);
    var r = vec4f(0.0);
    if (kind == 0u) { r = vec4f(terrainFine(p, queries[o + 3u], queries[o + 4u], queries[o + 5u]), 0.0); }
    else if (kind == 1u) { r = vec4f(terrainFineFiltered(p, queries[o + 3u], queries[o + 4u], queries[o + 5u], queries[o + 6u]), 0.0); }
    else if (kind == 2u) { r = vec4f(windLocal(p), 0.0, 0.0); }
    else { r = detailTexel(p, queries[o + 3u], queries[o + 4u]); }
    outBuf[i * 4u] = r.x; outBuf[i * 4u + 1u] = r.y; outBuf[i * 4u + 2u] = r.z; outBuf[i * 4u + 3u] = r.w;
}
`;

export function reportLines() {
    return ["[snowFine] the wind-carved fine surface: sastrugi (2.3 m ridged noise veered and stretched patch by patch), ripples (0.42 m), grain (0.115 m), each with an exact analytic slope; a footprint-filtered twin fades each layer as its wavelength nears a pixel;",
        "  a baked detail map of packed grains at three scales (normal, cavity, height), tiling exactly"];
}
