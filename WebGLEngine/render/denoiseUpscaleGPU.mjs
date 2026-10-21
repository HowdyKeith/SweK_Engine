// WebGLEngine/render/denoiseUpscaleGPU.mjs -- the kernels and their RUNNER: round 30's emitter-aware chain
// on a device, through gfx/device.js (backlog denoise-halfres-rig-timing, round 31).
//
// Each step mirrors a CPU reference, same arguments and the same kind of answer:
//   coverage(S, w, h)               render/denoiseMask.mjs's emitterRadiance        -> { cov, E }
//   fill(img3, cov, w, h, maxRings) render/denoiseUpscale.mjs's fillEmittersBounded -> { y, rings, left }
//   chain(...)                      render/denoiseUpscale.mjs's emitterAwareUpscale(..., "easu", full), with the fill bounded
//
// *** chain() RUNS ON ONE ENCODER: fill, transfer, EASU, inverse and composite, nothing read back between them. *** That is
// the shape the rig round times, and the reason the steps are not just called in turn (fx/fsr/fsrGPU.js's fsr1, the same
// reasoning). EASU is fx/fsr/fsrKernels.js's kernel, the one fx/fsr/fsrGPU.js runs.
//
// *** THE FILL IS BOUNDED, AND SAYS SO. *** A device cannot loop until no pixel changes without a readback, so a fixed number
// of rings is dispatched (maxRings) and each ring counts what it filled. `left` is how many pixels no ring reached -- they
// are 0, never the emitter's radiance. A caller that needs fillEmitters' answer asks for enough rings and checks left === 0.
//
// Every image on the device is rgba f32, four floats a pixel, alpha 1 -- the layout fx/fsr/fsrKernels.js's EASU reads, so the
// chain hands EASU its input without a repack. The kernels, in the chain's order:
//   COVERAGE_WGSL   emitterRadiance (render/denoiseMask.mjs): COVERAGE_GRID^2 rays across each pixel, at the centres of an
//                   even grid, the first hit over the scene's spheres; cov = k / n^2 and E = the mean emission met. Run at
//                   half size it is the network's mask (the fill's coverage); at full size, the composite's guide.
//   FILL_RING_WGSL  ONE RING of fillEmitters: each unknown pixel with a known 8-neighbour takes their mean and becomes known.
//                   Reading only the previous ring's buffers, so the order pixels run in cannot matter -- the CPU's rule.
//                   A GPU cannot loop until nothing changes without a readback, so the runner dispatches a FIXED number of
//                   rings (fillEmittersBounded is that bounded form's CPU reference) and counts each ring's fills.
//   FILL_LEFT_WGSL  what a bounded fill leaves: a pixel no ring reached is 0, never the emitter's own radiance.
//   TO_T_WGSL       upscale's transfer: t = (x / (1 + x))^(1 / GAMMA) per channel, and the frame's brightest t by atomicMax
//                   on its bits (t >= 0, so a float's bits order as the float does).
//   COMPOSITE_WGSL  the clamp to [0, the brightest t], the transfer's inverse, and compositeEmitters: E + (1 - cov) x it.
"use strict";
import { EASU_WGSL } from "../fx/fsr/fsrKernels.js";
import { cameraBasis } from "../physics/render/pathTracer.mjs";
import { timingLadder } from "./denoiseDevice.mjs";

/** Rays across a pixel are COVERAGE_GRID x COVERAGE_GRID (render/denoiseMask.mjs's). */
export const COVERAGE_GRID_WGSL = 8;
/** A sphere in the scene buffer: centre xyz, radius, emission rgb, emitter flag -- eight floats. */
export const SPHERE_STRIDE = 8;

export const COVERAGE_WGSL = /* wgsl */`
struct Cam { eye:vec4<f32>, fwd:vec4<f32>, right:vec4<f32>, up:vec4<f32>, w:u32, h:u32, nSph:u32, grid:u32, scale:f32, aspect:f32, pad0:f32, pad1:f32 };
@group(0) @binding(0) var<storage,read> sph:array<f32>;
@group(0) @binding(1) var<storage,read_write> cov:array<f32>;
@group(0) @binding(2) var<storage,read_write> emis:array<f32>;
@group(0) @binding(3) var<uniform> c:Cam;

// physics/render/occlusion.mjs's raySphere, eps 1e-6: the nearer root past eps, else the farther, else none (-1)
fn hitT(o:vec3<f32>, d:vec3<f32>, k:u32) -> f32 {
    let b = k * ${SPHERE_STRIDE}u;
    let oc = o - vec3<f32>(sph[b], sph[b + 1u], sph[b + 2u]);
    let r = sph[b + 3u];
    let bb = 2.0 * dot(d, oc);
    let cc = dot(oc, oc) - r * r;
    let disc = bb * bb - 4.0 * cc;
    if (disc < 0.0) { return -1.0; }
    let sq = sqrt(disc);
    let t0 = (-bb - sq) * 0.5;
    let t1 = (-bb + sq) * 0.5;
    if (t0 > 1e-6) { return t0; }
    if (t1 > 1e-6) { return t1; }
    return -1.0;
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= c.w || g.y >= c.h) { return; }
    let n = c.grid;
    var k = 0u;
    var e = vec3<f32>(0.0);
    for (var j = 0u; j < n; j++) {
        for (var i = 0u; i < n; i++) {
            // physics/render/pathTracer.mjs's pixelRay
            let u = ((f32(g.x) + (f32(i) + 0.5) / f32(n)) / f32(c.w) * 2.0 - 1.0) * c.scale * c.aspect;
            let v = (1.0 - (f32(g.y) + (f32(j) + 0.5) / f32(n)) / f32(c.h) * 2.0) * c.scale;
            let d = normalize(c.fwd.xyz + c.right.xyz * u + c.up.xyz * v);
            var best = -1.0;
            var who = 0u;
            for (var s = 0u; s < c.nSph; s++) {
                let t = hitT(c.eye.xyz, d, s);
                if (t > 0.0 && (best < 0.0 || t < best)) { best = t; who = s; }
            }
            let b = who * ${SPHERE_STRIDE}u;
            if (best > 0.0 && sph[b + 7u] > 0.5) { k++; e += vec3<f32>(sph[b + 4u], sph[b + 5u], sph[b + 6u]); }
        }
    }
    let p = g.y * c.w + g.x;
    let nn = f32(n * n);
    cov[p] = f32(k) / nn;
    emis[p * 3u] = e.x / nn; emis[p * 3u + 1u] = e.y / nn; emis[p * 3u + 2u] = e.z / nn;
}
`;

export const FILL_RING_WGSL = /* wgsl */`
struct P { w:u32, h:u32, ring:u32, pad:u32 };
@group(0) @binding(0) var<storage,read> src:array<f32>;
@group(0) @binding(1) var<storage,read> knownIn:array<u32>;
@group(0) @binding(2) var<storage,read_write> dst:array<f32>;
@group(0) @binding(3) var<storage,read_write> knownOut:array<u32>;
@group(0) @binding(4) var<storage,read_write> filled:array<atomic<u32>>;
@group(0) @binding(5) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    var v = vec4<f32>(src[p * 4u], src[p * 4u + 1u], src[p * 4u + 2u], 1.0);
    var kn = knownIn[p];
    if (kn == 0u) {
        // the CPU's visiting order, dy then dx, so the sum runs in the same order
        var n = 0u;
        var s = vec3<f32>(0.0);
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                let qx = i32(g.x) + dx;
                let qy = i32(g.y) + dy;
                if ((dx != 0 || dy != 0) && qx >= 0 && qx < i32(u.w) && qy >= 0 && qy < i32(u.h)) {
                    let q = u32(qy) * u.w + u32(qx);
                    if (knownIn[q] == 1u) { n++; s += vec3<f32>(src[q * 4u], src[q * 4u + 1u], src[q * 4u + 2u]); }
                }
            }
        }
        if (n > 0u) { v = vec4<f32>(s / f32(n), 1.0); kn = 1u; atomicAdd(&filled[u.ring], 1u); }
    }
    dst[p * 4u] = v.x; dst[p * 4u + 1u] = v.y; dst[p * 4u + 2u] = v.z; dst[p * 4u + 3u] = 1.0;
    knownOut[p] = kn;
}
`;

export const FILL_LEFT_WGSL = /* wgsl */`
struct P { w:u32, h:u32, pad0:u32, pad1:u32 };
@group(0) @binding(0) var<storage,read> known:array<u32>;
@group(0) @binding(1) var<storage,read_write> img:array<f32>;
@group(0) @binding(2) var<storage,read_write> left:array<atomic<u32>>;
@group(0) @binding(3) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    if (known[p] == 0u) { img[p * 4u] = 0.0; img[p * 4u + 1u] = 0.0; img[p * 4u + 2u] = 0.0; atomicAdd(&left[0], 1u); }
}
`;

export const TO_T_WGSL = /* wgsl */`
struct P { w:u32, h:u32, pad0:u32, pad1:u32 };
@group(0) @binding(0) var<storage,read_write> img:array<f32>;
@group(0) @binding(1) var<storage,read_write> tMax:array<atomic<u32>>;
@group(0) @binding(2) var<uniform> u:P;

fn toT(x:f32) -> f32 {
    let v = max(x, 0.0);
    if (v <= 0.0) { return 0.0; }
    return pow(v / (1.0 + v), 1.0 / 2.2);
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    var m = 0.0;
    for (var ch = 0u; ch < 3u; ch++) { let t = toT(img[p * 4u + ch]); img[p * 4u + ch] = t; m = max(m, t); }
    img[p * 4u + 3u] = 1.0;
    atomicMax(&tMax[0], bitcast<u32>(m));
}
`;

export const COMPOSITE_WGSL = /* wgsl */`
struct P { w:u32, h:u32, pad0:u32, pad1:u32 };
@group(0) @binding(0) var<storage,read> up:array<f32>;
@group(0) @binding(1) var<storage,read> cov:array<f32>;
@group(0) @binding(2) var<storage,read> emis:array<f32>;
@group(0) @binding(3) var<storage,read> tMax:array<u32>;
@group(0) @binding(4) var<storage,read_write> dst:array<f32>;
@group(0) @binding(5) var<uniform> u:P;

fn fromT(t:f32) -> f32 {
    let tt = min(max(t, 0.0), 1.0 - 5.9604645e-8);
    if (tt <= 0.0) { return 0.0; }
    let gg = pow(tt, 2.2);
    return gg / (1.0 - gg);
}

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    let top = bitcast<f32>(tMax[0]);
    for (var ch = 0u; ch < 3u; ch++) {
        let x = fromT(min(max(up[p * 4u + ch], 0.0), top));
        dst[p * 3u + ch] = emis[p * 3u + ch] + (1.0 - cov[p]) * x;
    }
}
`;

// ---- ROUND 33 (backlog denoise-temporalup-device): round 32's accumulation on the device ---------------------------------
// render/denoiseTemporalUpscale.mjs is the CPU reference of all four, and render/denoiseTemporal.mjs's firstHits and reproject the
// reference of the first and third. A frame's first hits are one buffer, GEO_STRIDE floats a pixel (position, normal, the index
// of the sphere hit or -1 for sky), and the history one more, four floats a pixel (rgb and its length n), so the accumulation
// binds five storage buffers -- inside the eight a default WebGPU device allows.
/** A pixel's first hit on the device: position xyz, normal xyz, the sphere's index (-1: sky), pad. */
export const GEO_STRIDE = 8;
/** render/denoiseTemporal.mjs's POS_TOL, NORMAL_DOT and FRAMES, which the accumulation kernel carries in its uniform. */
export const TEMPORAL_CONSTANTS = Object.freeze({ posTol: 3, normalDot: 0.9, frames: 8 });

export const FIRSTHITS_WGSL = /* wgsl */`
struct Cam { eye:vec4<f32>, fwd:vec4<f32>, right:vec4<f32>, up:vec4<f32>, w:u32, h:u32, nSph:u32, grid:u32, scale:f32, aspect:f32, pad0:f32, pad1:f32 };
@group(0) @binding(0) var<storage,read> sph:array<f32>;
@group(0) @binding(1) var<storage,read_write> geo:array<f32>;
@group(0) @binding(2) var<uniform> c:Cam;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= c.w || g.y >= c.h) { return; }
    // pixelRay at the pixel's centre, and the nearer root past 1e-6 of each sphere (physics/render/occlusion.mjs's raySphere)
    let u = ((f32(g.x) + 0.5) / f32(c.w) * 2.0 - 1.0) * c.scale * c.aspect;
    let v = (1.0 - (f32(g.y) + 0.5) / f32(c.h) * 2.0) * c.scale;
    let d = normalize(c.fwd.xyz + c.right.xyz * u + c.up.xyz * v);
    var best = -1.0;
    var who = 0u;
    for (var s = 0u; s < c.nSph; s++) {
        let b = s * ${SPHERE_STRIDE}u;
        let oc = c.eye.xyz - vec3<f32>(sph[b], sph[b + 1u], sph[b + 2u]);
        let r = sph[b + 3u];
        let bb = 2.0 * dot(d, oc);
        let disc = bb * bb - 4.0 * (dot(oc, oc) - r * r);
        if (disc < 0.0) { continue; }
        let sq = sqrt(disc);
        var t = (-bb - sq) * 0.5;
        if (t <= 1e-6) { t = (-bb + sq) * 0.5; }
        if (t > 1e-6 && (best < 0.0 || t < best)) { best = t; who = s; }
    }
    let o = (g.y * c.w + g.x) * ${GEO_STRIDE}u;
    if (best < 0.0) { for (var k = 0u; k < ${GEO_STRIDE}u; k++) { geo[o + k] = 0.0; } geo[o + 6u] = -1.0; return; }
    let P = c.eye.xyz + d * best;
    let b = who * ${SPHERE_STRIDE}u;
    let N = normalize(P - vec3<f32>(sph[b], sph[b + 1u], sph[b + 2u]));
    geo[o] = P.x; geo[o + 1u] = P.y; geo[o + 2u] = P.z; geo[o + 3u] = N.x; geo[o + 4u] = N.y; geo[o + 5u] = N.z; geo[o + 6u] = f32(who); geo[o + 7u] = 0.0;
}
`;

export const SHIFT_WGSL = /* wgsl */`
struct P { w:u32, h:u32, dx:f32, dy:f32 };
@group(0) @binding(0) var<storage,read> src:array<f32>;
@group(0) @binding(1) var<storage,read_write> dst:array<f32>;
@group(0) @binding(2) var<uniform> u:P;

// shiftResample: the value at p is src's bilinear tap at p - (dx, dy), its edges clamped
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let X = f32(g.x) - u.dx;
    let Y = f32(g.y) - u.dy;
    let x0 = floor(X);
    let y0 = floor(Y);
    let fx = X - x0;
    let fy = Y - y0;
    let mw = i32(u.w) - 1;
    let mh = i32(u.h) - 1;
    let a = u32(clamp(i32(x0), 0, mw));
    let b = u32(clamp(i32(x0) + 1, 0, mw));
    let c = u32(clamp(i32(y0), 0, mh));
    let d = u32(clamp(i32(y0) + 1, 0, mh));
    let o = (g.y * u.w + g.x) * 3u;
    for (var k = 0u; k < 3u; k++) {
        dst[o + k] = (1.0 - fy) * ((1.0 - fx) * src[(c * u.w + a) * 3u + k] + fx * src[(c * u.w + b) * 3u + k])
                   + fy * ((1.0 - fx) * src[(d * u.w + a) * 3u + k] + fx * src[(d * u.w + b) * 3u + k]);
    }
}
`;

export const ACCUM_WGSL = /* wgsl */`
struct A { prevEye:vec4<f32>, prevFwd:vec4<f32>, prevRight:vec4<f32>, prevUp:vec4<f32>, curEye:vec4<f32>,
           w:u32, h:u32, clampOn:u32, frames:u32, prevScale:f32, aspect:f32, curScale:f32, posTol:f32, normalDot:f32, pad0:f32, pad1:f32, pad2:f32 };
@group(0) @binding(0) var<storage,read> prevGeo:array<f32>;
@group(0) @binding(1) var<storage,read> curGeo:array<f32>;
@group(0) @binding(2) var<storage,read> prevHist:array<f32>;
@group(0) @binding(3) var<storage,read> cur:array<f32>;
@group(0) @binding(4) var<storage,read_write> outHist:array<f32>;
@group(0) @binding(5) var<uniform> u:A;

fn restart(p:u32) {
    outHist[p * 4u] = cur[p * 3u]; outHist[p * 4u + 1u] = cur[p * 3u + 1u]; outHist[p * 4u + 2u] = cur[p * 3u + 2u]; outHist[p * 4u + 3u] = 1.0;
}

// one frame of accumulateUpscaled: round 4's reproject (same object, within posTol footprints of the same point, facing within
// normalDot), the history clamped to the current 3 x 3 range, and A = hist + (cur - hist) / n with n = min(n_prev + 1, frames)
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    let go = p * ${GEO_STRIDE}u;
    let obj = curGeo[go + 6u];
    if (obj < 0.0) { restart(p); return; }
    let P = vec3<f32>(curGeo[go], curGeo[go + 1u], curGeo[go + 2u]);
    let N = vec3<f32>(curGeo[go + 3u], curGeo[go + 4u], curGeo[go + 5u]);
    let dd = P - u.prevEye.xyz;
    let df = dot(dd, u.prevFwd.xyz);
    if (df <= 1e-9) { restart(p); return; }
    let uu = dot(dd, u.prevRight.xyz) / df;
    let vv = dot(dd, u.prevUp.xyz) / df;
    let X = (uu / (u.prevScale * u.aspect) + 1.0) / 2.0 * f32(u.w) - 0.5;
    let Y = (1.0 - vv / u.prevScale) / 2.0 * f32(u.h) - 0.5;
    let x0 = floor(X);
    let y0 = floor(Y);
    let fx = X - x0;
    let fy = Y - y0;
    let dist = length(P - u.curEye.xyz);
    let cosV = abs(dot(N, u.curEye.xyz - P) / dist);
    let tol = u.posTol * dist * 2.0 * u.curScale / f32(u.h) / max(cosV, 0.2);
    var wsum = 0.0;
    var np = 0.0;
    var hist = vec3<f32>(0.0);
    for (var k = 0u; k < 4u; k++) {
        let qx = i32(x0) + i32(k & 1u);
        let qy = i32(y0) + i32(k >> 1u);
        let wk = select(1.0 - fx, fx, (k & 1u) == 1u) * select(1.0 - fy, fy, (k >> 1u) == 1u);
        if (qx < 0 || qy < 0 || qx >= i32(u.w) || qy >= i32(u.h) || wk == 0.0) { continue; }
        let q = u32(qy) * u.w + u32(qx);
        let qo = q * ${GEO_STRIDE}u;
        if (prevGeo[qo + 6u] != obj) { continue; }
        if (length(vec3<f32>(prevGeo[qo], prevGeo[qo + 1u], prevGeo[qo + 2u]) - P) > tol) { continue; }
        if (dot(vec3<f32>(prevGeo[qo + 3u], prevGeo[qo + 4u], prevGeo[qo + 5u]), N) < u.normalDot) { continue; }
        wsum += wk; np += wk * prevHist[q * 4u + 3u];
        hist += wk * vec3<f32>(prevHist[q * 4u], prevHist[q * 4u + 1u], prevHist[q * 4u + 2u]);
    }
    if (wsum < 1e-4) { restart(p); return; }
    hist = hist / wsum;
    np = np / wsum;
    if (u.clampOn == 1u) {
        var lo = vec3<f32>(1e30);
        var hi = vec3<f32>(-1e30);
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                let sx = i32(g.x) + dx;
                let sy = i32(g.y) + dy;
                if (sx < 0 || sy < 0 || sx >= i32(u.w) || sy >= i32(u.h)) { continue; }
                let s = (u32(sy) * u.w + u32(sx)) * 3u;
                let v = vec3<f32>(cur[s], cur[s + 1u], cur[s + 2u]);
                lo = min(lo, v); hi = max(hi, v);
            }
        }
        hist = clamp(hist, lo, hi);
    }
    let nn = min(np + 1.0, f32(u.frames));
    let c = vec3<f32>(cur[p * 3u], cur[p * 3u + 1u], cur[p * 3u + 2u]);
    let A = hist + (c - hist) / nn;
    outHist[p * 4u] = A.x; outHist[p * 4u + 1u] = A.y; outHist[p * 4u + 2u] = A.z; outHist[p * 4u + 3u] = nn;
}
`;

export const FINAL_WGSL = /* wgsl */`
struct P { w:u32, h:u32, pad0:u32, pad1:u32 };
@group(0) @binding(0) var<storage,read> hist:array<f32>;
@group(0) @binding(1) var<storage,read> cov:array<f32>;
@group(0) @binding(2) var<storage,read> emis:array<f32>;
@group(0) @binding(3) var<storage,read_write> dst:array<f32>;
@group(0) @binding(4) var<uniform> u:P;

// compositeEmitters on the accumulated light: E + (1 - cov) x it -- once, after the accumulation (section 95)
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    for (var k = 0u; k < 3u; k++) { dst[p * 3u + k] = emis[p * 3u + k] + (1.0 - cov[p]) * hist[p * 4u + k]; }
}
`;

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

/** A scene's spheres as the coverage kernel reads them: SPHERE_STRIDE floats each. A scene with a mesh is refused by name. */
export function packSpheres(scene) {
    const out = new Float32Array(scene.length * SPHERE_STRIDE);
    scene.forEach((s, k) => {
        if (s.bvh || !s.centre) throw new Error("denoiseUpscaleGPU: the coverage kernel intersects spheres only -- this scene has a mesh");
        const e = s.emit ? (typeof s.emit === "number" ? [s.emit, s.emit, s.emit] : s.emit) : [0, 0, 0];
        out.set([s.centre[0], s.centre[1], s.centre[2], s.radius, e[0], e[1], e[2], s.emit ? 1 : 0], k * SPHERE_STRIDE);
    });
    return out;
}

/** The coverage kernel's camera uniform, from physics/render/pathTracer.mjs's cameraBasis of scene S at w x h. */
export function cameraUniform(S, w, h, nSph) {
    const B = cameraBasis(S), b = new ArrayBuffer(96), f = new Float32Array(b), u = new Uint32Array(b);
    f.set([...B.eye, 0, ...B.fwd, 0, ...B.right, 0, ...B.camUp, 0]);
    u.set([w, h, nSph, COVERAGE_GRID_WGSL], 16);
    f.set([B.scale, w / h], 20);
    return new Uint8Array(b);
}

const u4 = (a, b, c = 0, d = 0) => new Uint8Array(new Uint32Array([a, b, c, d]).buffer);
/** The accumulation kernel's uniform for one frame: the previous camera (scene S from prevEye) and the current one, at W x H. */
export function accumUniform(S, prevEye, curEye, W, H, { clamp = true } = {}) {
    const P = cameraBasis({ ...S, eye: prevEye }), C = cameraBasis({ ...S, eye: curEye }), b = new ArrayBuffer(128), f = new Float32Array(b), u = new Uint32Array(b), T = TEMPORAL_CONSTANTS;
    f.set([...P.eye, 0, ...P.fwd, 0, ...P.right, 0, ...P.camUp, 0, ...C.eye, 0]);
    u.set([W, H, clamp ? 1 : 0, T.frames], 20);
    f.set([P.scale, W / H, C.scale, T.posTol, T.normalDot], 24);
    return new Uint8Array(b);
}
/** CPU first hits (render/denoiseTemporal.mjs's firstHits) packed as the device's: GEO_STRIDE floats a pixel. */
export function packGeometry(hits, n) {
    const g = new Float32Array(n * GEO_STRIDE);
    for (let p = 0; p < n; p++) {
        for (let c = 0; c < 3; c++) { g[p * GEO_STRIDE + c] = hits.pos[p * 3 + c]; g[p * GEO_STRIDE + 3 + c] = hits.nrm[p * 3 + c]; }
        g[p * GEO_STRIDE + 6] = hits.obj[p];
    }
    return g;
}
const f4 = (a, b, c, d) => { const x = new ArrayBuffer(16); new Uint32Array(x, 0, 2).set([a, b]); new Float32Array(x, 8, 2).set([c, d]); return new Uint8Array(x); };

const rgba = (img3, n) => { const o = new Float32Array(n * 4); for (let p = 0; p < n; p++) { o[p * 4] = img3[p * 3]; o[p * 4 + 1] = img3[p * 3 + 1]; o[p * 4 + 2] = img3[p * 3 + 2]; o[p * 4 + 3] = 1; } return o; };
const rgbOf = (a, n) => { const o = new Float64Array(n * 3); for (let p = 0; p < n; p++) { o[p * 3] = a[p * 4]; o[p * 3 + 1] = a[p * 4 + 1]; o[p * 3 + 2] = a[p * 4 + 2]; } return o; };

export class DenoiseUpscaleGPU {
    /** `device` is a gfx/device.js device on the webgpu backend. Every pipeline is built once, here. */
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/denoiseUpscaleGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, so a caller ` +
                "without one uses render/denoiseUpscale.mjs's CPU chain by asking for it.");
        this.device = device;
        this.p = {};
        for (const [k, wgsl] of [["cov", COVERAGE_WGSL], ["ring", FILL_RING_WGSL], ["left", FILL_LEFT_WGSL], ["toT", TO_T_WGSL], ["comp", COMPOSITE_WGSL], ["easu", EASU_WGSL],
                                  ["hits", FIRSTHITS_WGSL], ["shift", SHIFT_WGSL], ["accum", ACCUM_WGSL], ["final", FINAL_WGSL]]) {
            const p = this.p[k] = device.compute({ wgsl });
            if (p && p.error) throw new Error(`render/denoiseUpscaleGPU: the ${k} kernel did not compile -- ${p.error}`);
        }
    }

    /** emitterRadiance on the device: { cov, E }, Float64Arrays of w*h and w*h*3. */
    async coverage(S, w, h) {
        const dev = this.device, n = w * h, sph = packSpheres(S.scene);
        const bS = dev.buffer({ data: sph, usage: ["storage"] }), bC = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bE = dev.buffer({ data: new Float32Array(n * 3), usage: ["storage"] }), u = dev.buffer({ data: cameraUniform(S, w, h, S.scene.length), usage: "uniform" });
        dev.frame(({ pass }) => { this.p.cov.bind("sph", bS).bind("cov", bC).bind("emis", bE).bind("c", u); pass.dispatch(this.p.cov, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const cov = Float64Array.from(new Float32Array(await dev.read(bC))), E = Float64Array.from(new Float32Array(await dev.read(bE)));
        for (const b of [bS, bC, bE, u]) b.destroy();
        return { cov, E };
    }

    // the bounded fill's dispatches, on an open frame: rgba `src` and coverage `cov` in, the filled rgba out (returned buffer)
    _fillOps(pass, bufs, w, h, maxRings) {
        const { a, b, kA, kB, filled, left, uRings, uLeft } = bufs;
        let src = a, dst = b, kin = kA, kout = kB;
        for (let r = 0; r < maxRings; r++) {
            this.p.ring.bind("src", src).bind("knownIn", kin).bind("dst", dst).bind("knownOut", kout).bind("filled", filled).bind("u", uRings[r]);
            pass.dispatch(this.p.ring, groups(w, h));
            [src, dst] = [dst, src]; [kin, kout] = [kout, kin];
        }
        this.p.left.bind("known", kin).bind("img", src).bind("left", left).bind("u", uLeft);
        pass.dispatch(this.p.left, groups(w, h));
        return src;
    }
    _fillBufs(img3, cov, w, h, maxRings) {
        const dev = this.device, n = w * h;
        return { a: dev.buffer({ data: rgba(img3, n), usage: ["storage"] }), b: dev.buffer({ data: new Float32Array(n * 4), usage: ["storage"] }),
                 kA: dev.buffer({ data: Uint32Array.from(cov, (c) => (c > 0 ? 0 : 1)), usage: ["storage"] }), kB: dev.buffer({ data: new Uint32Array(n), usage: ["storage"] }),
                 filled: dev.buffer({ data: new Uint32Array(Math.max(maxRings, 1)), usage: ["storage"] }), left: dev.buffer({ data: new Uint32Array(1), usage: ["storage"] }),
                 uRings: Array.from({ length: maxRings }, (_, r) => dev.buffer({ data: u4(w, h, r), usage: "uniform" })), uLeft: dev.buffer({ data: u4(w, h), usage: "uniform" }) };
    }
    async _fillCounts(bufs) {
        const per = new Uint32Array(await this.device.read(bufs.filled)), left = new Uint32Array(await this.device.read(bufs.left))[0];
        return { rings: per.filter((k) => k > 0).length, perRing: Array.from(per), left };
    }
    _free(bufs) { for (const v of Object.values(bufs)) for (const b of [].concat(v)) b.destroy(); }

    /** fillEmittersBounded on the device: { y, rings, left, perRing }. */
    async fill(img3, cov, w, h, maxRings) {
        if (!Number.isInteger(maxRings) || maxRings < 0) throw new Error(`denoiseUpscaleGPU.fill: maxRings is a whole number of rings -- got ${maxRings}`);
        if (img3.length !== w * h * 3 || cov.length !== w * h) throw new Error(`denoiseUpscaleGPU.fill: ${img3.length} values and ${cov.length} coverages are not a ${w} x ${h} frame`);
        const bufs = this._fillBufs(img3, cov, w, h, maxRings);
        let out = null;
        this.device.frame(({ pass }) => { out = this._fillOps(pass, bufs, w, h, maxRings); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const y = rgbOf(new Float32Array(await this.device.read(out)), w * h), c = await this._fillCounts(bufs);
        this._free(bufs);
        return { y, ...c };
    }

    /**
     * The emitter-aware chain on one encoder: the w x h frame (rgb), its coverage covHalf, filled in at most maxRings rings,
     * through the transfer, EASU to W x H, the clamp and inverse, and the composite with `full` ({ cov, E } at W x H).
     * Returns { y (W*H*3), rings, left, perRing, tMax }.
     */
    async chain(img3, covHalf, w, h, W, H, full, maxRings) {
        if (full.cov.length !== W * H || full.E.length !== W * H * 3) throw new Error(`denoiseUpscaleGPU.chain: the full-size guide is not ${W} x ${H}`);
        const dev = this.device, bufs = this._fillBufs(img3, covHalf, w, h, maxRings);
        const tMax = dev.buffer({ data: new Uint32Array(1), usage: ["storage"] }), uT = dev.buffer({ data: u4(w, h), usage: "uniform" });
        const up = dev.buffer({ data: new Float32Array(W * H * 4), usage: ["storage"] }), uE = dev.buffer({ data: u4(w, h, W, H), usage: "uniform" });
        const fc = dev.buffer({ data: Float32Array.from(full.cov), usage: ["storage"] }), fE = dev.buffer({ data: Float32Array.from(full.E), usage: ["storage"] });
        const dst = dev.buffer({ data: new Float32Array(W * H * 3), usage: ["storage"] }), uC = dev.buffer({ data: u4(W, H), usage: "uniform" });
        dev.frame(({ pass }) => {
            const filled = this._fillOps(pass, bufs, w, h, maxRings);
            this.p.toT.bind("img", filled).bind("tMax", tMax).bind("u", uT); pass.dispatch(this.p.toT, groups(w, h));
            this.p.easu.bind("src", filled).bind("dst", up).bind("u", uE); pass.dispatch(this.p.easu, groups(W, H));
            this.p.comp.bind("up", up).bind("cov", fc).bind("emis", fE).bind("tMax", tMax).bind("dst", dst).bind("u", uC); pass.dispatch(this.p.comp, groups(W, H));
            pass.clear([0, 0, 0, 1]);
        }, { offscreen: true });
        const y = Float64Array.from(new Float32Array(await dev.read(dst))), c = await this._fillCounts(bufs);
        const tm = new Float32Array(new Uint32Array(await dev.read(tMax)).buffer)[0];
        this._free(bufs);
        for (const b of [tMax, uT, up, uE, fc, fE, dst, uC]) b.destroy();
        return { y, ...c, tMax: tm };
    }

    /** render/denoiseTemporal.mjs's firstHits on the device, from `eye`: { pos, nrm, obj } at W x H, as the CPU returns them. */
    async firstHits(S, eye, W, H) {
        const dev = this.device, n = W * H, bS = dev.buffer({ data: packSpheres(S.scene), usage: ["storage"] }), g = dev.buffer({ data: new Float32Array(n * GEO_STRIDE), usage: ["storage"] });
        const u = dev.buffer({ data: cameraUniform({ ...S, eye }, W, H, S.scene.length), usage: "uniform" });
        dev.frame(({ pass }) => { this.p.hits.bind("sph", bS).bind("geo", g).bind("c", u); pass.dispatch(this.p.hits, groups(W, H)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const a = new Float32Array(await dev.read(g)), pos = new Float64Array(n * 3), nrm = new Float64Array(n * 3), obj = new Int32Array(n);
        for (let p = 0; p < n; p++) { for (let c = 0; c < 3; c++) { pos[p * 3 + c] = a[p * GEO_STRIDE + c]; nrm[p * 3 + c] = a[p * GEO_STRIDE + 3 + c]; } obj[p] = a[p * GEO_STRIDE + 6]; }
        for (const b of [bS, g, u]) b.destroy();
        return { pos, nrm, obj };
    }

    /**
     * render/denoiseTemporalUpscale.mjs's accumulateUpscaled on the device, and the composite after it. `frames[f]` is { y (W x H
     * rgb), shift [dx, dy] }, `eyes[f]` the frame's eye in scene S; `geo` (optional) the CPU's first hits of every frame, else the
     * device traces them. With `full` ({ cov, E } at W x H) the result is composited as section 95's Bt is. Returns { A, n, y }.
     */
    async accumulate(S, eyes, frames, W, H, { clamp = true, geo = null, full = null } = {}) {
        const dev = this.device, n = W * H, F = frames.length;
        if (eyes.length !== F || (geo && geo.length !== F)) throw new Error(`denoiseUpscaleGPU.accumulate: ${F} frames against ${eyes.length} eyes and ${geo ? geo.length : 0} first-hit buffers`);
        const bS = dev.buffer({ data: packSpheres(S.scene), usage: ["storage"] }), mk = (k) => dev.buffer({ data: new Float32Array(k), usage: ["storage"] });
        const G = eyes.map((_, f) => (geo ? dev.buffer({ data: packGeometry(geo[f], n), usage: ["storage"] }) : mk(n * GEO_STRIDE)));
        const uCam = eyes.map((eye) => dev.buffer({ data: cameraUniform({ ...S, eye }, W, H, S.scene.length), usage: "uniform" }));
        const src = frames.map((fr) => dev.buffer({ data: Float32Array.from(fr.y), usage: ["storage"] })), cur = mk(n * 3);
        const uSh = frames.map((fr) => dev.buffer({ data: f4(W, H, fr.shift[0], fr.shift[1]), usage: "uniform" }));
        const uAc = eyes.map((eye, f) => dev.buffer({ data: accumUniform(S, eyes[Math.max(f - 1, 0)], eye, W, H, { clamp }), usage: "uniform" }));
        const H0 = mk(n * 4), H1 = mk(n * 4), dst = mk(n * 3), uF = dev.buffer({ data: u4(W, H), usage: "uniform" });
        const fc = full ? dev.buffer({ data: Float32Array.from(full.cov), usage: ["storage"] }) : mk(n), fE = full ? dev.buffer({ data: Float32Array.from(full.E), usage: ["storage"] }) : mk(n * 3);
        let last = null;
        const skyG = new Float32Array(n * GEO_STRIDE); for (let p = 0; p < n; p++) skyG[p * GEO_STRIDE + 6] = -1;
        const sky = dev.buffer({ data: skyG, usage: ["storage"] });
        dev.frame(({ pass }) => {
            if (!geo) for (let f = 0; f < F; f++) { this.p.hits.bind("sph", bS).bind("geo", G[f]).bind("c", uCam[f]); pass.dispatch(this.p.hits, groups(W, H)); }
            let a = H0, b = H1;
            for (let f = 0; f < F; f++) {
                this.p.shift.bind("src", src[f]).bind("dst", cur).bind("u", uSh[f]); pass.dispatch(this.p.shift, groups(W, H));
                // the first frame starts every pixel at its own value: its "previous" geometry is a buffer of sky, which no tap matches
                this.p.accum.bind("prevGeo", f ? G[f - 1] : sky).bind("curGeo", G[f]).bind("prevHist", a).bind("cur", cur).bind("outHist", b).bind("u", uAc[f]);
                pass.dispatch(this.p.accum, groups(W, H));
                [a, b] = [b, a];
            }
            last = a;
            this.p.final.bind("hist", a).bind("cov", fc).bind("emis", fE).bind("dst", dst).bind("u", uF); pass.dispatch(this.p.final, groups(W, H));
            pass.clear([0, 0, 0, 1]);
        }, { offscreen: true });
        const h = new Float32Array(await dev.read(last)), y = Float64Array.from(new Float32Array(await dev.read(dst)));
        const A = new Float64Array(n * 3), N = new Float64Array(n);
        for (let p = 0; p < n; p++) { for (let c = 0; c < 3; c++) A[p * 3 + c] = h[p * 4 + c]; N[p] = h[p * 4 + 3]; }
        for (const bb of [bS, ...G, ...uCam, ...src, cur, ...uSh, ...uAc, H0, H1, dst, uF, fc, fE, sky]) bb.destroy();
        return { A, n: N, y };
    }
    /**
     * Round 31: THE CHAIN'S STEPS TIMED, apart from the denoise, on scene S's geometry with the w x h frame upscaled to W x H.
     * Every buffer is made once and kept, so no upload or readback is inside a time. Per rep, in this order:
     *   covHalf, covFull   the coverage kernel at w x h and at W x H, one frame each
     *   fill               maxRings ring passes and the left pass, one frame -- by the wall clock, always: more passes than
     *                      gfx/device.js timestamps in one frame (30), and the exact fill needs one a ring (77 measured at
     *                      960 x 540, R 44004)
     *   rest               the transfer, EASU and the composite, one frame
     *   whole              all of the above in ONE frame, by the wall clock -- what a frame of the chain costs
     * A step is on the device's clock where the device grants timestamps and the step has 30 passes or fewer, else the wall
     * clock (performance.now() around the frame and the queue's onSubmittedWorkDone). Each row says which. Returns medians.
     */
    async time(S, w, h, W, H, maxRings, { reps = 5 } = {}) {
        const dev = this.device, gpu = dev.gpu, stamps = !!(dev.capabilities && dev.capabilities.timestamps), now = () => performance.now();
        const sph = packSpheres(S.scene), mk = (n) => dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bS = dev.buffer({ data: sph, usage: ["storage"] }), cH = mk(w * h), eH = mk(w * h * 3), cF = mk(W * H), eF = mk(W * H * 3);
        const uH = dev.buffer({ data: cameraUniform(S, w, h, S.scene.length), usage: "uniform" }), uF = dev.buffer({ data: cameraUniform(S, W, H, S.scene.length), usage: "uniform" });
        const covOps = (pass, c, e, u, ww, hh) => { this.p.cov.bind("sph", bS).bind("cov", c).bind("emis", e).bind("c", u); pass.dispatch(this.p.cov, groups(ww, hh)); };
        // the half-size coverage once, read back outside every time, for the fill's known flags; the frame is smooth light
        dev.frame(({ pass }) => { covOps(pass, cH, eH, uH, w, h); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const covHalf = Float64Array.from(new Float32Array(await dev.read(cH)));
        const img = new Float64Array(w * h * 3); for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) img[p * 3 + c] = 0.2 + 0.5 * ((p % w) / w) + 0.1 * c;
        const bufs = this._fillBufs(img, covHalf, w, h, maxRings), rgba0 = rgba(img, w * h), known0 = Uint32Array.from(covHalf, (c) => (c > 0 ? 0 : 1));
        const reset = () => { gpu.queue.writeBuffer(bufs.a.gpu, 0, rgba0); gpu.queue.writeBuffer(bufs.kA.gpu, 0, known0); };
        const tMax = dev.buffer({ data: new Uint32Array(1), usage: ["storage"] }), uT = dev.buffer({ data: u4(w, h), usage: "uniform" });
        const up = mk(W * H * 4), uE = dev.buffer({ data: u4(w, h, W, H), usage: "uniform" }), dst = mk(W * H * 3), uC = dev.buffer({ data: u4(W, H), usage: "uniform" });
        let filled = null;
        const restOps = (pass, src) => {
            this.p.toT.bind("img", src).bind("tMax", tMax).bind("u", uT); pass.dispatch(this.p.toT, groups(w, h));
            this.p.easu.bind("src", src).bind("dst", up).bind("u", uE); pass.dispatch(this.p.easu, groups(W, H));
            this.p.comp.bind("up", up).bind("cov", cF).bind("emis", eF).bind("tMax", tMax).bind("dst", dst).bind("u", uC); pass.dispatch(this.p.comp, groups(W, H));
        };
        // round 33: the history's four passes a frame, at W x H on the chain's output -- the first hits, the shift to the unjittered
        // grid, the accumulation and the composite after it. One pass each, so each is on the device's clock where it can be.
        const geoB = mk(W * H * GEO_STRIDE), curB = mk(W * H * 3), hA = mk(W * H * 4), hB = mk(W * H * 4), outB = mk(W * H * 3);
        const uSh = dev.buffer({ data: f4(W, H, 0.5, -1 / 3), usage: "uniform" }), uAc = dev.buffer({ data: accumUniform(S, S.eye, S.eye, W, H), usage: "uniform" });
        const histOps = {
            hits: (pass) => { this.p.hits.bind("sph", bS).bind("geo", geoB).bind("c", uF); pass.dispatch(this.p.hits, groups(W, H)); },
            shift: (pass) => { this.p.shift.bind("src", dst).bind("dst", curB).bind("u", uSh); pass.dispatch(this.p.shift, groups(W, H)); },
            accum: (pass) => { this.p.accum.bind("prevGeo", geoB).bind("curGeo", geoB).bind("prevHist", hA).bind("cur", curB).bind("outHist", hB).bind("u", uAc); pass.dispatch(this.p.accum, groups(W, H)); },
            final: (pass) => { this.p.final.bind("hist", hB).bind("cov", cF).bind("emis", eF).bind("dst", outB).bind("u", uC); pass.dispatch(this.p.final, groups(W, H)); },
        };
        const step = { covHalf: [], covFull: [], fill: [], rest: [], whole: [], hits: [], shift: [], accum: [], final: [] }, clock = {};
        const run = async (k, ops, passes) => {
            const dc = stamps && passes <= 30;
            await gpu.queue.onSubmittedWorkDone();
            const t0 = now(), res = dev.frame(({ pass }) => { ops(pass); pass.clear([0, 0, 0, 1]); }, { offscreen: true, ...(dc ? { timing: true } : {}) });
            if (dc) { const g = await res; step[k].push(g.gpuMs.compute); } else { await gpu.queue.onSubmittedWorkDone(); step[k].push(now() - t0); }
            clock[k] = dc ? "device" : "wall";
        };
        for (let r = 0; r < reps + 1; r++) {         // the first rep warms every pipeline and is not kept
            await run("covHalf", (pass) => covOps(pass, cH, eH, uH, w, h), 1);
            await run("covFull", (pass) => covOps(pass, cF, eF, uF, W, H), 1);
            reset(); await run("fill", (pass) => { filled = this._fillOps(pass, bufs, w, h, maxRings); }, 31);
            await run("rest", (pass) => restOps(pass, filled), 3);
            reset(); await run("whole", (pass) => { covOps(pass, cH, eH, uH, w, h); covOps(pass, cF, eF, uF, W, H); restOps(pass, this._fillOps(pass, bufs, w, h, maxRings)); }, 31);
            for (const k of ["hits", "shift", "accum", "final"]) await run(k, histOps[k], 1);
            if (r === 0) for (const k of Object.keys(step)) step[k].length = 0;
        }
        const c = await this._fillCounts(bufs);
        this._free(bufs);
        for (const b of [bS, cH, eH, cF, eF, uH, uF, tMax, uT, up, uE, dst, uC, geoB, curB, hA, hB, outB, uSh, uAc]) b.destroy();
        const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[(b.length - 1) >> 1] : null; };
        return { w, h, W, H, maxRings, reps, rings: c.rings, inView: covHalf.filter((v) => v > 0).length,
                 steps: Object.fromEntries(Object.keys(step).map((k) => [k, { ms: med(step[k]), clock: clock[k], runs: step[k] }])) };
    }
}

/**
 * Round 31, WHAT THE PAGE TIMES (denoise.html's "Time the half-size chain"): the shipped network at w x h and at W x H on the
 * page's own kernel set (render/denoiseDevice.mjs's timingLadder, the ladder the page already runs), and the chain's steps on
 * scene S (DenoiseUpscaleGPU's time). `device` is a gfx/device.js webgpu device; `newAdapter` makes the ladder's adapters.
 * Returns { ladder, chain, networkHalf, networkFull, full, half, temporal }, each sum on the clocks its parts were read on, named:
 *   full   today's page at W x H: the network at W x H, and the emitter coverage at W x H, which is the mask it reads
 *   half   the chain: the network at w x h, the coverage at w x h (its mask, and the fill's), the coverage at W x H (the
 *          composite's guide), the fill, and the transfer, EASU and the composite
 *   temporal  round 33: the chain and round 32's history a frame -- the first hits, the shift, the accumulation, the composite
 * The ladder's cap is 5000 ms a pass, not its default 1500: the Intel gen-9's page pass at 1920 x 1080 is 1.2-1.4 s (rounds 27
 * and 28), close enough to 1500 that a prediction from the smaller size could skip the very row being compared.
 */
export async function timeHalfChain({ device, net, newAdapter, kernels, S, w, h, W, H, maxRings, reps = 5, totalMs = 300000, capMs = 5000 }) {
    const ladder = await timingLadder(net, newAdapter, { sizes: [[w, h], [W, H]], sets: [kernels], totalMs, capMs });
    const pick = (x) => (x.skipped ? null : { ms: x.gpu ? x.gpu.median : x.wall.median, clock: x.gpu ? "device" : "wall" });
    const [networkHalf, networkFull] = ladder.rows[kernels].map(pick);
    const chain = await new DenoiseUpscaleGPU(device).time(S, w, h, W, H, maxRings, { reps });
    const st = chain.steps, sum = (parts) => (parts.every((x) => x && x.ms != null)
        ? { ms: parts.reduce((a, x) => a + x.ms, 0), clocks: [...new Set(parts.map((x) => x.clock))] } : null);
    return { ladder, chain, kernels, networkHalf, networkFull,
             full: sum([networkFull, st.covFull]), half: sum([networkHalf, st.covHalf, st.covFull, st.fill, st.rest]),
             // round 33: the chain with round 32's history -- its four passes a frame added to the half-size chain
             temporal: sum([networkHalf, st.covHalf, st.covFull, st.fill, st.rest, st.hits, st.shift, st.accum, st.final]) };
}
