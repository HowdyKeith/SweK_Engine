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

// ---- ROUND 64 (pre-registration section 147): THE GENERATOR AS COMPUTE PASSES -------------------------------------------
// render/frameInterp.mjs's interpolateFrameCPU at fsr-three.html's settings (block 1, indexed by the newer frame, t = 0.5,
// fill radius 4 / reach 16 / side blend / the farther neighbour), as four passes over MOTION_WGSL's field:
//   GEN_CLEAR_WGSL   the depth keys and winners to "nothing landed"
//   GEN_SPLAT_WGSL   each pixel's vector lands at round(p - (1 - t) v); atomicMin keeps the nearest depth there
//   GEN_WIN_WGSL     among those that landed at that depth, atomicMin keeps the lowest pixel index -- the CPU's scan order, so
//                    its tie rule (strictly nearer; the first writer stays) exactly
//   GEN_FILL_WGSL    each pixel's vector: the winner's, or for a hole the farthest landed within the radius, else the reach
//   GEN_GATHER_WGSL  each pixel samples prev back and cur forward along its vector, bilinear, clamped; blended at t; in a hole the fill
//                    left, the cross-fade of the two at the pixel (section 152)
// Depths are keyed by their f32 bits, which order as u32 for the non-negative depths motionField gives (SKY_DEPTH on sky).
export const GEN_RADIUS = 4, GEN_REACH = 16, GEN_T = 0.5;
const GEN_HEAD = /* wgsl */`
struct G { w:u32, h:u32, t:f32, pad:f32 };
@group(0) @binding(0) var<uniform> u:G;
fn landing(p:u32) -> i32 {
    let m = p * ${MOT_STRIDE}u;
    if (mot[m + 3u] == 0.0) { return -1; }
    let x = f32(p % u.w); let y = f32(p / u.w);
    // Math.round's rule, half up: floor(v + 0.5)
    let sx = floor(x - (1.0 - u.t) * mot[m] + 0.5);
    let sy = floor(y - (1.0 - u.t) * mot[m + 1u] + 0.5);
    if (sx < 0.0 || sy < 0.0 || sx >= f32(u.w) || sy >= f32(u.h)) { return -1; }
    return i32(u32(sy) * u.w + u32(sx));
}
`;
export const GEN_CLEAR_WGSL = /* wgsl */`
struct G { w:u32, h:u32, t:f32, pad:f32 };
@group(0) @binding(0) var<uniform> u:G;
@group(0) @binding(1) var<storage,read_write> zkey:array<u32>;
@group(0) @binding(2) var<storage,read_write> win:array<u32>;
@compute @workgroup_size(64,1,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w * u.h) { return; }
    zkey[g.x] = 0xffffffffu; win[g.x] = 0xffffffffu;
}
`;
export const GEN_SPLAT_WGSL = GEN_HEAD + /* wgsl */`
@group(0) @binding(1) var<storage,read> mot:array<f32>;
@group(0) @binding(2) var<storage,read_write> zkey:array<atomic<u32>>;
@compute @workgroup_size(64,1,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w * u.h) { return; }
    let j = landing(g.x);
    if (j < 0) { return; }
    atomicMin(&zkey[u32(j)], bitcast<u32>(mot[g.x * ${MOT_STRIDE}u + 2u]));
}
`;
export const GEN_WIN_WGSL = GEN_HEAD + /* wgsl */`
@group(0) @binding(1) var<storage,read> mot:array<f32>;
@group(0) @binding(2) var<storage,read_write> zkey:array<atomic<u32>>;
@group(0) @binding(3) var<storage,read_write> win:array<atomic<u32>>;
@compute @workgroup_size(64,1,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w * u.h) { return; }
    let j = landing(g.x);
    if (j < 0) { return; }
    if (atomicLoad(&zkey[u32(j)]) == bitcast<u32>(mot[g.x * ${MOT_STRIDE}u + 2u])) { atomicMin(&win[u32(j)], g.x); }
}
`;
export const GEN_FILL_WGSL = /* wgsl */`
struct G { w:u32, h:u32, t:f32, pad:f32 };
@group(0) @binding(0) var<uniform> u:G;
@group(0) @binding(1) var<storage,read> mot:array<f32>;
@group(0) @binding(2) var<storage,read> zkey:array<u32>;
@group(0) @binding(3) var<storage,read> win:array<u32>;
@group(0) @binding(4) var<storage,read_write> vec:array<vec4<f32>>;
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let j = g.y * u.w + g.x;
    var src = win[j];
    if (src == 0xffffffffu) {
        // fillHolesCPU's one pass: the farthest landed pixel in the window, the first in scan order on a tie, the radius first
        var best = -1; var bz = 0.0;
        for (var round = 0; round < 2 && best < 0; round++) {
            let r = select(${GEN_REACH}, ${GEN_RADIUS}, round == 0);
            for (var dy = -r; dy <= r; dy++) {
                let yy = i32(g.y) + dy; if (yy < 0 || yy >= i32(u.h)) { continue; }
                for (var dx = -r; dx <= r; dx++) {
                    let xx = i32(g.x) + dx; if (xx < 0 || xx >= i32(u.w)) { continue; }
                    let k = u32(yy) * u.w + u32(xx);
                    if (win[k] == 0xffffffffu) { continue; }
                    let z = bitcast<f32>(zkey[k]);
                    if (best < 0 || z > bz) { best = i32(k); bz = z; }
                }
            }
        }
        if (best < 0) { vec[j] = vec4<f32>(0.0, 0.0, 1.0, 0.0); return; }
        src = win[u32(best)];
    }
    let m = src * ${MOT_STRIDE}u;
    vec[j] = vec4<f32>(mot[m], mot[m + 1u], 0.0, 0.0);
}
`;
export const GEN_GATHER_WGSL = /* wgsl */`
struct G { w:u32, h:u32, t:f32, pad:f32 };
@group(0) @binding(0) var<uniform> u:G;
@group(0) @binding(1) var<storage,read> vec:array<vec4<f32>>;
@group(0) @binding(2) var<storage,read> prev:array<vec4<f32>>;
@group(0) @binding(3) var<storage,read> cur:array<vec4<f32>>;
@group(0) @binding(4) var<storage,read_write> dst:array<vec4<f32>>;
${["prev", "cur"].map((s) => `fn fetch_${s}(x:f32, y:f32) -> vec4<f32> {
    let fx = floor(x); let fy = floor(y); let tx = x - fx; let ty = y - fy;
    let x0 = u32(clamp(i32(fx), 0, i32(u.w) - 1)); let x1 = u32(clamp(i32(fx) + 1, 0, i32(u.w) - 1));
    let y0 = u32(clamp(i32(fy), 0, i32(u.h) - 1)) * u.w; let y1 = u32(clamp(i32(fy) + 1, 0, i32(u.h) - 1)) * u.w;
    return (${s}[y0 + x0] * (1.0 - tx) + ${s}[y0 + x1] * tx) * (1.0 - ty) + (${s}[y1 + x0] * (1.0 - tx) + ${s}[y1 + x1] * tx) * ty;
}`).join("\n")}
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let j = g.y * u.w + g.x;
    let v = vec[j];
    // section 152: a hole the fill left shows the cross-fade, interpolateFrameCPU's holes: "crossfade"
    if (v.z != 0.0) { dst[j] = prev[j] * (1.0 - u.t) + cur[j] * u.t; return; }
    let x = f32(g.x); let y = f32(g.y);
    let a = fetch_prev(x - u.t * v.x, y - u.t * v.y);
    let b = fetch_cur(x + (1.0 - u.t) * v.x, y + (1.0 - u.t) * v.y);
    dst[j] = a * (1.0 - u.t) + b * u.t;
}
`;
/** The generator's uniform: w, h (u32), t (f32), pad. */
export function genUniform(w, h, t = GEN_T) { const b = new ArrayBuffer(16); new Uint32Array(b, 0, 2).set([w, h]); new Float32Array(b, 8, 2).set([t, 0]); return new Uint8Array(b); }
/** Dispatch sizes: the 1-D passes in workgroups of 64, the 2-D ones in 8 x 8. */
export const genGroups = (w, h) => ({ line: [Math.ceil(w * h / 64), 1], tile: [Math.ceil(w / 8), Math.ceil(h / 8)] });

/**
 * Section 147's rule over a report: readH63's T, field, covFullB and restComp, with the compute generator's line
 * ("section 147: the compute generator at 1920 x 1080 X ms") in the generator's place. Same shape as readH63's result.
 */
export function readH64(rep) {
    const r = readH63(rep), cost = (rep.gates || []).find((g) => g.gate === "render/denoiseFrameGenCost-selfcheck.mjs");
    let gen = null, clock = null;
    for (const l of (cost && cost.measured) || []) { const m = l.match(/^section 147: the compute generator at 1920 x 1080 ([\d.]+) ms \((device|wall)\)/); if (m) { gen = +m[1]; clock = m[2]; break; } }
    const parts = { ...r.parts, generator: gen }, all = Object.values(parts).every((v) => v !== null) && r.T !== null;
    const G = all ? Object.values(parts).reduce((a, v) => a + v, 0) : null;
    return { ...r, parts, G, ratio: all ? G / r.T : null, clocks: { ...r.clocks, generator: clock }, threeJs: r.parts.generator };
}
