// WebGLEngine/render/denoiseFrameGenGPU.mjs -- the denoiser arc, round 63 (pre-registration section 143)
//
// WHAT A GENERATED FRAME COSTS ON THE DEVICE, PIECE BY PIECE. Rounds 59-62 generate the midpoint frame on the CPU
// (render/denoiseFrameGen.mjs); round 63 asks what it costs on a GPU against tracing the frame. Its parts are the generator
// (fx/fsr/fsrFrameGenTsl.mjs, timed in the browser), the light at the generated time and the composite (render/
// denoiseUpscaleGPU.mjs's covFullB and restComp, timed by its own gate) -- and the one piece no gate had: the field itself.
// MOTION_WGSL turns a frame's first hits (FIRSTHITS_WGSL's GEO_STRIDE buffer, which the chain's history already computes at
// eye 7) into motionField's flow and depth, per pixel. readH63 reads section 143's rule off a realGpuRun report.
"use strict";
import { GEO_STRIDE, cameraUniform } from "./denoiseUpscaleGPU.mjs";
import { SKY_DEPTH } from "./denoiseFrameGen.mjs";

/**
 * motionField on the device: geo (the NEWER frame's first hits) -> mot, MOT_STRIDE floats a pixel -- the flow x and y (this
 * pixel less where its hit, or on sky its direction, falls in the OLDER camera), the depth along the newer camera's forward axis
 * (SKY_DEPTH on sky), and 1 where the flow exists, 0 where that point is behind the older camera (motionField's NaN; a WGSL
 * constant cannot be one, and a compiler may fold a NaN away). Two cameraUniform blocks: the newer, then the older.
 */
export const MOT_STRIDE = 4;
export const MOTION_WGSL = /* wgsl */`
struct Cam { eye:vec4<f32>, fwd:vec4<f32>, right:vec4<f32>, up:vec4<f32>, w:u32, h:u32, nSph:u32, grid:u32, scale:f32, aspect:f32, pad0:f32, pad1:f32 };
struct Cams { cur:Cam, prev:Cam };
@group(0) @binding(0) var<storage,read> geo:array<f32>;
@group(0) @binding(1) var<storage,read_write> mot:array<f32>;
@group(0) @binding(2) var<uniform> c:Cams;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    let w = c.cur.w; let h = c.cur.h;
    if (g.x >= w || g.y >= h) { return; }
    let p = g.y * w + g.x;
    let o = p * ${GEO_STRIDE}u;
    var d:vec3<f32>;
    var depth:f32;
    if (geo[o + 6u] >= 0.0) {
        let P = vec3<f32>(geo[o], geo[o + 1u], geo[o + 2u]);
        d = P - c.prev.eye.xyz;
        depth = dot(P - c.cur.eye.xyz, c.cur.fwd.xyz);
    } else {
        // the pixel's own ray in the newer camera, as FIRSTHITS_WGSL casts it: a direction at infinity
        let u = ((f32(g.x) + 0.5) / f32(w) * 2.0 - 1.0) * c.cur.scale * c.cur.aspect;
        let v = (1.0 - (f32(g.y) + 0.5) / f32(h) * 2.0) * c.cur.scale;
        d = normalize(c.cur.fwd.xyz + c.cur.right.xyz * u + c.cur.up.xyz * v);
        depth = ${SKY_DEPTH.toExponential()};
    }
    let df = dot(d, c.prev.fwd.xyz);
    let m = p * ${MOT_STRIDE}u;
    if (df <= 1e-9) { mot[m] = 0.0; mot[m + 1u] = 0.0; mot[m + 2u] = depth; mot[m + 3u] = 0.0; return; }
    let pu = dot(d, c.prev.right.xyz) / df;
    let pv = dot(d, c.prev.up.xyz) / df;
    let X = (pu / (c.prev.scale * c.prev.aspect) + 1.0) * 0.5 * f32(w) - 0.5;
    let Y = (1.0 - pv / c.prev.scale) * 0.5 * f32(h) - 0.5;
    mot[m] = f32(g.x) - X;
    mot[m + 1u] = f32(g.y) - Y;
    mot[m + 2u] = depth;
    mot[m + 3u] = 1.0;
}
`;

/** MOTION_WGSL's uniform: scene S's camera at eyeCur, then at eyePrev, both at W x H (cameraUniform's 96 bytes each). */
export function motionUniform(S, eyePrev, eyeCur, W, H) {
    const out = new Uint8Array(192);
    out.set(cameraUniform({ ...S, eye: eyeCur }, W, H, S.scene.length), 0);
    out.set(cameraUniform({ ...S, eye: eyePrev }, W, H, S.scene.length), 96);
    return out;
}

/**
 * motionField's flow and depth as the generator's two textures want them (fx/fsr/fsrFrameGenTsl.mjs, render/temporalTsl.mjs's
 * convention): motion rgba = (uvPrev - uvCurr, validity, 0) -- the flow negated over the frame's size, valid 0 where the flow is
 * NaN -- and depth rgba with .x the depth mapped to [0, 1), nearer less (d / (1 + d)). { motion, depth, invalid }, Float32Arrays.
 */
export function generatorTextures(flow, depth, W, H) {
    const n = W * H, motion = new Float32Array(n * 4), dep = new Float32Array(n * 4);
    let invalid = 0;
    for (let p = 0; p < n; p++) {
        const fx = flow[p * 2], fy = flow[p * 2 + 1], ok = Number.isFinite(fx) && Number.isFinite(fy);
        if (ok) { motion[p * 4] = -fx / W; motion[p * 4 + 1] = -fy / H; motion[p * 4 + 2] = 1; } else invalid++;
        dep[p * 4] = depth[p] / (1 + depth[p]);
    }
    return { motion, depth: dep, invalid };
}

/**
 * Section 143's rule read off one realGpuRun report (its gates' measured lines): T, section 103's "with its history" ms from
 * render/denoiseUpscaleGPU-selfcheck.mjs; covFullB (section 107's line) and restComp (section 110's) from the same gate; the
 * generator and the field from render/denoiseFrameGenCost-selfcheck.mjs's section 143 lines. G is their sum, `ratio` G / T.
 * `counts` is section 143's: every gate green with exit 0. Any figure missing -> null in its place and ratio null.
 */
export function readH63(rep) {
    const gate = (name) => (rep.gates || []).find((g) => g.gate === `render/${name}-selfcheck.mjs`) || null;
    const lines = (g) => (g && g.measured) || [];
    const find = (g, re) => { for (const l of lines(g)) { const m = l.match(re); if (m) return m; } return null; };
    const up = gate("denoiseUpscaleGPU"), cost = gate("denoiseFrameGenCost");
    const t = find(up, /^section 103: .*; with its history ([\d.]+) ms, ratio [\d.]+ x$/);
    const cv = find(up, /^section 107: the bounded coverage -- .*; covFullB ([\d.]+) ms \((device|wall)\)/);
    const rc = find(up, /^section 110: rest's passes -- .*; restComp ([\d.]+) ms \((device|wall)\)/);
    const gen = find(cost, /^section 143: the generator at 1920 x 1080 ([\d.]+) ms \(wall/);
    const mo = find(cost, /^section 143: the field on the device at 1920 x 1080 ([\d.]+) ms \((device|wall)\)/);
    const T = t ? +t[1] : null, parts = { generator: gen ? +gen[1] : null, field: mo ? +mo[1] : null, covFullB: cv ? +cv[1] : null, restComp: rc ? +rc[1] : null };
    const all = Object.values(parts).every((v) => v !== null) && T !== null, G = all ? Object.values(parts).reduce((a, v) => a + v, 0) : null;
    const counts = (rep.gates || []).length > 0 && rep.gates.every((g) => g.ok === true && g.exit && g.exit.status === 0);
    return { commit: String(rep.commit || "").slice(0, 8), counts, T, G, parts, ratio: all ? G / T : null, clocks: { covFullB: cv && cv[2], restComp: rc && rc[2], field: mo && mo[2] } };
}

/** H63 over a GPU's runs (readH63's): "holds" when every run counts and G <= 0.25 T in each, "fails" when they count and one does not, else "no verdict". */
export const H63_RATIO = 0.25;
export function h63(runs) {
    if (!runs.length || !runs.every((r) => r.counts && r.ratio !== null)) return "no verdict";
    return runs.every((r) => r.ratio <= H63_RATIO) ? "holds" : "fails";
}
