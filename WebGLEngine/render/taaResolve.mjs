// WebGLEngine/render/taaResolve.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SLICE 6 OF snowflow-lift: TEMPORAL ANTI-ALIASING -- DEPTH-REPROJECTED, VARIANCE-CLIPPED, CATMULL-ROM HISTORY -- FROM Noniv/snowflow_demo (MIT, vendor/snowflow). ***
// The resolve: reproject this pixel into LAST frame by its depth (no motion-vector buffer: the camera's own motion is nearly all the parallax of static geometry), fetch the history with a five-tap
// Catmull-Rom (a bilinear history convolves the image with a tent kernel again and again, every frame, and blurs it), clip the history to the mean +- 1.35 sigma of the current 3x3 neighbourhood IN A
// TONEMAP-WEIGHTED SPACE (a min/max box built from a field that contains discrete glints is wide enough to admit any ghost), and mix with a feedback of up to 0.97 that falls with screen-space motion
// and with how hard the history had to be clipped. The jitter that makes it an anti-aliaser is Halton(2,3) over eight positions, removed again before reprojection.
//
// OURS: resolvePixel / resolveFrame (CPU twin, f64), historyCatmullRom, buildHalton / radical (upstream's postChain.js, copied), column-major mat4 helpers, RESOLVE_KERNEL_WGSL (upstream's function bodies over storage
// buffers with a bilinear clamped fetch). NOT LIFTED: postChain.js's render-graph wiring and the jittered projection (Babylon's), the motion of the camera.
"use strict";

export const POST_FAR = 9000;
export const lumaPost = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
export const tonemapWeight = (c) => { const k = 1 + lumaPost(c); return [c[0] / k, c[1] / k, c[2] / k]; };
export const tonemapUnweight = (c) => { const k = Math.max(1e-4, 1 - lumaPost(c)); return [c[0] / k, c[1] / k, c[2] / k]; };

/** Halton(2,3) on [-0.5, 0.5], flattened to (x, y) pairs: upstream's buildHalton. */
export function radical(i, base) { let f = 1, r = 0, k = i; while (k > 0) { f /= base; r += f * (k % base); k = Math.floor(k / base); } return r; }
export function buildHalton(n) { const out = new Float32Array(n * 2); for (let i = 0; i < n; i++) { out[i * 2] = radical(i + 1, 2) - 0.5; out[i * 2 + 1] = radical(i + 1, 3) - 0.5; } return out; }

/** column-major 4x4 times vec4: out[i] = sum_j m[j*4 + i] * v[j] (WGSL's convention) */
export const mulMat4Vec4 = (m, v) => [0, 1, 2, 3].map((i) => m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3]);

/** bilinear, clamp, texel centres: an rgba f32 image (w*h*4) read at uv (what textureSampleLevel does on a bilinear clamped sampler) */
export function sampleRGB(img, w, h, u, v) {
    const px = Math.min(w - 1, Math.max(0, u * w - 0.5)), py = Math.min(h - 1, Math.max(0, v * h - 0.5)), x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = px - x0, fy = py - y0, o = (x, y) => (y * w + x) * 4;
    return [0, 1, 2].map((c) => (img[o(x0, y0) + c] * (1 - fx) + img[o(x1, y0) + c] * fx) * (1 - fy) + (img[o(x0, y1) + c] * (1 - fx) + img[o(x1, y1) + c] * fx) * fy);
}
function sampleDepthImg(d, w, h, u, v) {
    const px = Math.min(w - 1, Math.max(0, u * w - 0.5)), py = Math.min(h - 1, Math.max(0, v * h - 0.5)), x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = px - x0, fy = py - y0;
    return (d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx) * (1 - fy) + (d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx) * fy;
}

/** upstream's historyCatmullRom: five bilinear taps folding the sixteen Catmull-Rom weights; the negative lobes cannot go below zero radiance. */
export function historyCatmullRom(hist, w, h, uv) {
    const size = [w, h], sp = [uv[0] * w, uv[1] * h], tp1 = sp.map((s) => Math.floor(s - 0.5) + 0.5), f = sp.map((s, i) => s - tp1[i]);
    const wa = f.map((x) => x * (-0.5 + x * (1 - 0.5 * x))), wb = f.map((x) => 1 + x * x * (-2.5 + 1.5 * x)), wc = f.map((x) => x * (0.5 + x * (2 - 1.5 * x))), wd = f.map((x) => x * x * (-0.5 + 0.5 * x));
    const w12 = wb.map((x, i) => x + wc[i]), off12 = wc.map((x, i) => x / w12[i]);
    const p0 = tp1.map((t, i) => (t - 1) / size[i]), p3 = tp1.map((t, i) => (t + 2) / size[i]), p12 = tp1.map((t, i) => (t + off12[i]) / size[i]);
    const acc = [0, 0, 0], add = (c, wt) => { for (let k = 0; k < 3; k++) acc[k] += c[k] * wt; };
    add(sampleRGB(hist, w, h, p12[0], p0[1]), w12[0] * wa[1]); add(sampleRGB(hist, w, h, p0[0], p12[1]), wa[0] * w12[1]); add(sampleRGB(hist, w, h, p12[0], p12[1]), w12[0] * w12[1]);
    add(sampleRGB(hist, w, h, p3[0], p12[1]), wd[0] * w12[1]); add(sampleRGB(hist, w, h, p12[0], p3[1]), w12[0] * wd[1]);
    return acc.map((x) => Math.max(0, x));
}

/**
 * upstream's resolve for one pixel. `S` = { cur, hist, depth (images: rgba f32 / rgba f32 / f32), w, h, prevViewProj, invView (column-major 16), projInfo [x, y], jitterNdc [x, y], historyValid, enabled, feedback }.
 * Returns rgb. `info` (optional) receives { reprojected, clipped, k } for the gate.
 */
export function resolvePixel(S, x, y, info = null) {
    const { w, h } = S, uv = [(x + 0.5) / w, (y + 0.5) / h], invRes = [1 / w, 1 / h], cur = sampleRGB(S.cur, w, h, uv[0], uv[1]);
    if (S.enabled < 0.5 || S.historyValid < 0.5) { if (info) info.reprojected = false; return cur; }
    const z = sampleDepthImg(S.depth, w, h, uv[0], uv[1]), ndc = [uv[0] * 2 - 1 - S.jitterNdc[0], uv[1] * 2 - 1 - S.jitterNdc[1]], zc = Math.min(z, POST_FAR);
    const view = [ndc[0] * S.projInfo[0] * zc, ndc[1] * S.projInfo[1] * zc, zc], world = mulMat4Vec4(S.invView, [view[0], view[1], view[2], 1]);
    const prevClip = mulMat4Vec4(S.prevViewProj, [world[0], world[1], world[2], 1]);
    if (prevClip[3] <= 1e-4) { if (info) info.reprojected = false; return cur; }
    const prevUV = [prevClip[0] / prevClip[3] * 0.5 + 0.5, prevClip[1] / prevClip[3] * 0.5 + 0.5];
    if (prevUV[0] < 0 || prevUV[1] < 0 || prevUV[0] > 1 || prevUV[1] > 1) { if (info) info.reprojected = false; return cur; }
    const m1 = [0, 0, 0], m2 = [0, 0, 0];
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const s = tonemapWeight(sampleRGB(S.cur, w, h, uv[0] + i * invRes[0], uv[1] + j * invRes[1])); for (let c = 0; c < 3; c++) { m1[c] += s[c]; m2[c] += s[c] * s[c]; } }
    const mu = m1.map((v) => v / 9), sigma = m2.map((v, c) => Math.sqrt(Math.max(0, v / 9 - mu[c] * mu[c]))), lo = mu.map((m, c) => m - sigma[c] * 1.35), hi = mu.map((m, c) => m + sigma[c] * 1.35);
    let raw = tonemapWeight(historyCatmullRom(S.hist, w, h, prevUV));
    if (raw.some((v) => v !== v)) raw = mu.slice();
    const hist = raw.map((v, c) => Math.min(hi[c], Math.max(lo[c], v))), curW = tonemapWeight(cur);
    const motion = Math.hypot((prevUV[0] - uv[0]) / invRes[0], (prevUV[1] - uv[1]) / invRes[1]), motionFade = 1 - Math.min(1, Math.max(0, motion / 64)) * 0.35;
    const dist = Math.hypot(hist[0] - raw[0], hist[1] - raw[1], hist[2] - raw[2]), clipFade = 1 - Math.min(1, Math.max(0, dist * 4)) * 0.45;
    const k = Math.min(0.97, Math.max(0, S.feedback * motionFade * clipFade));
    if (info) { info.reprojected = true; info.clipped = dist > 1e-9; info.k = k; }
    return tonemapUnweight(curW.map((v, c) => v + (hist[c] - v) * k));
}

/** The whole frame. */
export function resolveFrame(S) {
    const out = new Float32Array(S.w * S.h * 4);
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { const c = resolvePixel(S, x, y), o = (y * S.w + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 1; }
    return out;
}

/** The uniform block's 44 floats in the kernel's order: prevViewProj(16), invView(16), projInfo(2), invRes(2), jitterNdc(2), historyValid, enabled, feedback, pad x3. */
export const packUniforms = (S) => [...S.prevViewProj, ...S.invView, S.projInfo[0], S.projInfo[1], 1 / S.w, 1 / S.h, S.jitterNdc[0], S.jitterNdc[1], S.historyValid, S.enabled, S.feedback, 0, 0, 0];

/**
 * The resolve as a compute kernel. Bindings: 0 out (rw, w*h*4), 1 params (uniform, 44 floats: see packUniforms), 2 cur (ro, w*h*4), 3 hist (ro, w*h*4), 4 depth (ro, w*h), 5 size (uniform vec2 w, h -- here read from
 * params.invRes). Dispatch (ceil(w / 8), ceil(h / 8)).
 */
export const RESOLVE_KERNEL_WGSL = /* wgsl */ `
struct Params { prevViewProj: mat4x4f, invView: mat4x4f, projInfo: vec2f, invRes: vec2f, jitterNdc: vec2f, historyValid: f32, enabled: f32, feedback: f32, pad0: f32, pad1: f32, pad2: f32 };
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(1) var<uniform> uniforms: Params;
@group(0) @binding(2) var<storage, read> curBuf: array<f32>;
@group(0) @binding(3) var<storage, read> histBuf: array<f32>;
@group(0) @binding(4) var<storage, read> depthBuf: array<f32>;

const POST_FAR: f32 = 9000.0;
fn lumaPost(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn tonemapWeight(c: vec3f) -> vec3f { return c / (1.0 + lumaPost(c)); }
fn tonemapUnweight(c: vec3f) -> vec3f { return c / max(1e-4, 1.0 - lumaPost(c)); }

fn dims() -> vec2f { return 1.0 / uniforms.invRes; }
fn imgAt(buf: ptr<storage, array<f32>, read>, x: i32, y: i32) -> vec3f {
    let d = dims();
    let cx = clamp(x, 0, i32(d.x) - 1);
    let cy = clamp(y, 0, i32(d.y) - 1);
    let o = u32((cy * i32(d.x) + cx) * 4);
    return vec3f((*buf)[o], (*buf)[o + 1u], (*buf)[o + 2u]);
}
fn sampleCur(uv: vec2f) -> vec3f {
    let d = dims();
    let p = clamp(uv * d - 0.5, vec2f(0.0), d - 1.0);
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(imgAt(&curBuf, x0, y0), imgAt(&curBuf, x0 + 1, y0), f.x), mix(imgAt(&curBuf, x0, y0 + 1), imgAt(&curBuf, x0 + 1, y0 + 1), f.x), f.y);
}
fn sampleHist(uv: vec2f) -> vec3f {
    let d = dims();
    let p = clamp(uv * d - 0.5, vec2f(0.0), d - 1.0);
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(imgAt(&histBuf, x0, y0), imgAt(&histBuf, x0 + 1, y0), f.x), mix(imgAt(&histBuf, x0, y0 + 1), imgAt(&histBuf, x0 + 1, y0 + 1), f.x), f.y);
}
fn sampleDepth(uv: vec2f) -> f32 {
    let d = dims();
    let p = clamp(uv * d - 0.5, vec2f(0.0), d - 1.0);
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    let w = i32(d.x);
    let h = i32(d.y);
    let a = depthBuf[u32(clamp(y0, 0, h - 1) * w + clamp(x0, 0, w - 1))];
    let bb = depthBuf[u32(clamp(y0, 0, h - 1) * w + clamp(x0 + 1, 0, w - 1))];
    let c = depthBuf[u32(clamp(y0 + 1, 0, h - 1) * w + clamp(x0, 0, w - 1))];
    let dd = depthBuf[u32(clamp(y0 + 1, 0, h - 1) * w + clamp(x0 + 1, 0, w - 1))];
    return mix(mix(a, bb, f.x), mix(c, dd, f.x), f.y);
}

// ---- upstream post/taa.fragment.wgsl, bodies unchanged except the texture fetches
fn historyCatmullRom(uv: vec2f, texSize: vec2f) -> vec3f {
    let samplePos = uv * texSize;
    let texPos1 = floor(samplePos - 0.5) + 0.5;
    let f = samplePos - texPos1;

    let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    let w3 = f * f * (-0.5 + 0.5 * f);

    let w12 = w1 + w2;
    let off12 = w2 / w12;

    let p0 = (texPos1 - 1.0) / texSize;
    let p3 = (texPos1 + 2.0) / texSize;
    let p12 = (texPos1 + off12) / texSize;

    var acc = vec3f(0.0);
    acc += sampleHist(vec2f(p12.x, p0.y)) * (w12.x * w0.y);
    acc += sampleHist(vec2f(p0.x, p12.y)) * (w0.x * w12.y);
    acc += sampleHist(vec2f(p12.x, p12.y)) * (w12.x * w12.y);
    acc += sampleHist(vec2f(p3.x, p12.y)) * (w3.x * w12.y);
    acc += sampleHist(vec2f(p12.x, p3.y)) * (w12.x * w3.y);
    return max(acc, vec3f(0.0));
}

fn resolve(uv: vec2f) -> vec3f {
    let cur = sampleCur(uv);

    if (uniforms.enabled < 0.5 || uniforms.historyValid < 0.5) { return cur; }

    let z = sampleDepth(uv);
    let ndc = uv * 2.0 - 1.0 - uniforms.jitterNdc;
    let view = vec3f(ndc.x * uniforms.projInfo.x, ndc.y * uniforms.projInfo.y, 1.0)
             * min(z, POST_FAR);
    let world = uniforms.invView * vec4f(view, 1.0);

    let prevClip = uniforms.prevViewProj * vec4f(world.xyz, 1.0);
    if (prevClip.w <= 1e-4) { return cur; }

    let prevUV = (prevClip.xy / prevClip.w) * 0.5 + 0.5;

    if (any(prevUV < vec2f(0.0)) || any(prevUV > vec2f(1.0))) { return cur; }

    var m1 = vec3f(0.0);
    var m2 = vec3f(0.0);
    for (var j = -1; j <= 1; j++) {
        for (var i = -1; i <= 1; i++) {
            let s = tonemapWeight(sampleCur(uv + vec2f(f32(i), f32(j)) * uniforms.invRes));
            m1 += s;
            m2 += s * s;
        }
    }
    let mu = m1 / 9.0;
    let sigma = sqrt(max(vec3f(0.0), m2 / 9.0 - mu * mu));
    let lo = mu - sigma * 1.35;
    let hi = mu + sigma * 1.35;

    var raw = tonemapWeight(historyCatmullRom(prevUV, 1.0 / uniforms.invRes));
    if (any(raw != raw)) { raw = mu; }
    let hist = clamp(raw, lo, hi);

    let curW = tonemapWeight(cur);

    let motion = length((prevUV - uv) / uniforms.invRes);
    let motionFade = 1.0 - clamp(motion / 64.0, 0.0, 1.0) * 0.35;
    let clipFade = 1.0 - clamp(length(hist - raw) * 4.0, 0.0, 1.0) * 0.45;

    let k = clamp(uniforms.feedback * motionFade * clipFade, 0.0, 0.97);
    return tonemapUnweight(mix(curW, hist, k));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let d = dims();
    if (f32(gid.x) >= d.x || f32(gid.y) >= d.y) { return; }
    let uv = (vec2f(f32(gid.x), f32(gid.y)) + 0.5) * uniforms.invRes;
    let c = resolve(uv);
    let o = (gid.y * u32(d.x) + gid.x) * 4u;
    outBuf[o] = c.x;
    outBuf[o + 1u] = c.y;
    outBuf[o + 2u] = c.z;
    outBuf[o + 3u] = 1.0;
}
`;

/** historyCatmullRom and resolve as WGSL text; a shader that includes it defines uniforms, dims(), sampleCur, sampleHist, sampleDepth and the tonemap helpers */
export const TAA_WGSL = RESOLVE_KERNEL_WGSL.slice(RESOLVE_KERNEL_WGSL.indexOf("// ---- upstream post/taa.fragment.wgsl"), RESOLVE_KERNEL_WGSL.indexOf("@compute"));

export function reportLines() {
    const j = buildHalton(8);
    return ["[taaResolve] depth-reprojected TAA: five-tap Catmull-Rom history, 3x3 variance clip at 1.35 sigma in tonemap-weighted space, feedback to 0.97 falling with motion and clipping",
        "  Halton(2,3) x8 jitter: " + Array.from({ length: 4 }, (_, i) => "(" + j[i * 2].toFixed(3) + ", " + j[i * 2 + 1].toFixed(3) + ")").join(" ") + " ..."];
}
