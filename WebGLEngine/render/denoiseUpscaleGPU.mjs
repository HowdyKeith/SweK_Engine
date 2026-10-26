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
//   COVERAGE_BOUND_WGSL  round 39 (denoise-halfres-fixed-costs, the coverage lever): COVERAGE_WGSL's text with a bound first -- a
//                   pixel whose centre ray is too far from every emitter for any of its rays to meet one is 0, untraced
//                   -- coverage()'s default since round 44 (denoise-coverage-bound-default); { bound: false } is round 31's
//   COVERAGE_WGSL   emitterRadiance (render/denoiseMask.mjs): COVERAGE_GRID^2 rays across each pixel, at the centres of an
//                   even grid, the first hit over the scene's spheres; cov = k / n^2 and E = the mean emission met. Run at
//                   half size it is the network's mask (the fill's coverage); at full size, the composite's guide.
//   FILL_RING_WGSL  ONE RING of fillEmitters: each unknown pixel with a known 8-neighbour takes their mean and becomes known.
//                   Reading only the previous ring's buffers, so the order pixels run in cannot matter -- the CPU's rule.
//                   A GPU cannot loop until nothing changes without a readback, so the runner dispatches a FIXED number of
//                   rings (fillEmittersBounded is that bounded form's CPU reference) and counts each ring's fills.
//   FILL_LEFT_WGSL  what a bounded fill leaves: a pixel no ring reached is 0, never the emitter's own radiance.
//   round 34 (denoise-halfres-fixed-costs), THE SAME FILL OVER THE LIGHTS' PIXELS ONLY -- fill(..., { list: true }):
//   FILL_LIST_WGSL      once, over the frame: each pixel's ring is 0 if known, else UNKNOWN and its index appended to a list
//   FILL_ARGS_WGSL      one thread: the list's length as an indirect dispatch's workgroup count, so no readback sizes the rings
//   FILL_LISTRING_WGSL  ONE RING over the list, IN PLACE: a pixel still UNKNOWN takes the mean of its 8-neighbours whose ring is
//                       below this one's, and this ring's number. A neighbour filled in this ring reads as this ring or UNKNOWN,
//                       never below it, so the ring reads only the rings before it -- FILL_RING_WGSL's rule, with no copy of the
//                       known pixels and no ping-pong. The rings are atomics because a ring reads its neighbours' as they are set.
//   FILL_LISTLEFT_WGSL  over the list: a pixel no ring reached is 0
//   round 37 (denoise-fill-fewer-passes), THE SAME FILL FILL_TILE_RINGS RINGS A PASS -- fill(..., { tile: true }):
//   FILL_TILEINIT_WGSL  once, over the frame: each pixel's ring, 0 if known, else UNKNOWN
//   FILL_TILE_WGSL      up to FILL_TILE_RINGS rings in one pass: a workgroup holds a tile of its interior and a halo of as many
//                       pixels as rings in workgroup memory, runs the rings there in two phases split by barriers (every UNKNOWN
//                       cell's mean of the neighbours below this ring, then the cells that found one take it), and writes back the
//                       interior alone. A ring reads one step, so the halo keeps the interior exact; cells outside the frame are OUT
//   FILL_TILELEFT_WGSL  over the frame: a pixel no ring reached is 0
//   round 38 (denoise-fill-listed-tiles), THE TILE FILL OVER THE LISTED TILES ONLY -- fill(..., { tile: "listed" }):
//   FILL_LTINIT_WGSL    once, over the frame: each pixel's ring into both ring buffers, its value into the second image, and each
//                       tile holding an unknown pixel listed once -- a tile not listed never changes, so both buffers hold it alike
//   FILL_LTARGS_WGSL    one thread: the list's length as the tile passes' indirect dispatch
//   FILL_LTILE_WGSL     FILL_TILE_WGSL's text, its workgroup's tile read from the list
//   round 43 (denoise-listedtile-default): fill() and chain() with nothing asked run round 38's listed tile fill; { list: true }
//   still runs round 34's list fill and { list: false } round 31's ring fill, the references the default is held to
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

/**
 * Round 39: the coverage bound's slack, in radians, over the sphere's angular radius and the pixel's -- f32's acos near 1 is good
 * to about 5e-4, so this is four times that -- and the arc factor over the pixel's half-diagonal on the image plane (an arc is at
 * most pi / 2 times its chord; 1.6 covers it).
 */
export const COVERAGE_BOUND_SLACK = 2e-3;
export const COVERAGE_BOUND_ARC = 1.6;

/**
 * Round 39, the coverage bound's CPU twin: for each pixel of a w x h view of scene S, 1 if any of its rays COULD hit an emitter
 * sphere -- the angle from the pixel's centre ray to the sphere's centre within the sphere's angular radius, the pixel's own
 * half-diagonal (times COVERAGE_BOUND_ARC) and COVERAGE_BOUND_SLACK; or the eye inside or at the sphere -- else 0. A pixel at 0
 * has no ray that meets an emitter at all, so its coverage and emission are 0 without tracing. The kernel tests the same.
 */
export function coverageMayHit(S, w, h) {
    const B = cameraBasis(S), out = new Uint8Array(w * h), nrm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
    const half = Math.hypot(B.scale * (w / h) / w, B.scale / h) * COVERAGE_BOUND_ARC;
    const em = S.scene.filter((s) => s.emit).map((s) => { const oc = [0, 1, 2].map((i) => s.centre[i] - S.eye[i]), d = Math.hypot(...oc);
        return { inside: d <= s.radius * 1.001 + 1e-4, dir: oc.map((x) => x / d), ang: Math.asin(Math.min(1, s.radius / d)) }; });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = ((x + 0.5) / w * 2 - 1) * B.scale * (w / h), v = (1 - (y + 0.5) / h * 2) * B.scale;
        const dc = nrm([0, 1, 2].map((i) => B.fwd[i] + B.right[i] * u + B.camUp[i] * v));
        out[y * w + x] = em.some((e) => e.inside || Math.acos(Math.max(-1, Math.min(1, dc[0] * e.dir[0] + dc[1] * e.dir[1] + dc[2] * e.dir[2]))) <= e.ang + half + COVERAGE_BOUND_SLACK) ? 1 : 0;
    }
    return out;
}

// round 39: the coverage kernel is made by one function, over every pixel (round 31's, its text unchanged) or bounded: a pixel
// whose centre ray is, by coverageMayHit's test, too far from every emitter for any of its rays to meet one writes 0 untraced
const coverageWgsl = (bounded) => /* wgsl */`
struct Cam { eye:vec4<f32>, fwd:vec4<f32>, right:vec4<f32>, up:vec4<f32>, w:u32, h:u32, nSph:u32, grid:u32, scale:f32, aspect:f32, pad0:f32, pad1:f32 };
@group(0) @binding(0) var<storage,read> sph:array<f32>;
@group(0) @binding(1) var<storage,read_write> cov:array<f32>;
@group(0) @binding(2) var<storage,read_write> emis:array<f32>;
@group(0) @binding(3) var<uniform> c:Cam;
${bounded ? "@group(0) @binding(4) var<storage,read_write> traced:array<atomic<u32>>;\n" : ""}
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
${bounded ? `    // the bound (coverageMayHit): could any ray of this pixel meet an emitter? If not, its coverage and emission are 0, untraced
    let pu = ((f32(g.x) + 0.5) / f32(c.w) * 2.0 - 1.0) * c.scale * c.aspect;
    let pv = (1.0 - (f32(g.y) + 0.5) / f32(c.h) * 2.0) * c.scale;
    let dc = normalize(c.fwd.xyz + c.right.xyz * pu + c.up.xyz * pv);
    let pxHalf = length(vec2<f32>(c.scale * c.aspect / f32(c.w), c.scale / f32(c.h))) * ${COVERAGE_BOUND_ARC};
    var may = false;
    for (var s = 0u; s < c.nSph; s++) {
        let b = s * ${SPHERE_STRIDE}u;
        if (sph[b + 7u] > 0.5) {
            let oc = vec3<f32>(sph[b], sph[b + 1u], sph[b + 2u]) - c.eye.xyz;
            let dd = length(oc);
            let rr = sph[b + 3u];
            if (dd <= rr * 1.001 + 1e-4) { may = true; }
            else if (acos(clamp(dot(dc, oc / dd), -1.0, 1.0)) <= asin(min(1.0, rr / dd)) + pxHalf + ${COVERAGE_BOUND_SLACK}) { may = true; }
        }
    }
    let p0 = g.y * c.w + g.x;
    if (!may) { cov[p0] = 0.0; emis[p0 * 3u] = 0.0; emis[p0 * 3u + 1u] = 0.0; emis[p0 * 3u + 2u] = 0.0; return; }
    atomicAdd(&traced[0], 1u);
` : ""}    let n = c.grid;
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
export const COVERAGE_WGSL = coverageWgsl(false);
/** Round 39: the coverage kernel bounded -- a pixel no ray of which can meet an emitter is 0, untraced, and `traced` counts the rest. */
export const COVERAGE_BOUND_WGSL = coverageWgsl(true);

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

/** Round 34: a pixel's ring in the list fill before any ring reaches it. */
export const FILL_UNKNOWN = 0xffffffff;
/** Round 34: the list fill's workgroup, one-dimensional over the list. */
export const FILL_LIST_WG = 64;

export const FILL_LIST_WGSL = /* wgsl */`
struct P { w:u32, h:u32, pad0:u32, pad1:u32 };
@group(0) @binding(0) var<storage,read> known:array<u32>;
@group(0) @binding(1) var<storage,read_write> ringOf:array<atomic<u32>>;
@group(0) @binding(2) var<storage,read_write> list:array<u32>;
@group(0) @binding(3) var<storage,read_write> cnt:array<atomic<u32>>;
@group(0) @binding(4) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    if (known[p] == 1u) { atomicStore(&ringOf[p], 0u); return; }
    atomicStore(&ringOf[p], ${FILL_UNKNOWN}u);
    list[atomicAdd(&cnt[0], 1u)] = p;
}
`;

export const FILL_ARGS_WGSL = /* wgsl */`
@group(0) @binding(0) var<storage,read> cnt:array<u32>;
@group(0) @binding(1) var<storage,read_write> args:array<u32>;

@compute @workgroup_size(1,1,1)
fn main() {
    args[0] = (cnt[0] + ${FILL_LIST_WG - 1}u) / ${FILL_LIST_WG}u; args[1] = 1u; args[2] = 1u;
}
`;

export const FILL_LISTRING_WGSL = /* wgsl */`
struct P { w:u32, h:u32, ring:u32, pad:u32 };
@group(0) @binding(0) var<storage,read_write> img:array<f32>;
@group(0) @binding(1) var<storage,read_write> ringOf:array<atomic<u32>>;
@group(0) @binding(2) var<storage,read> list:array<u32>;
@group(0) @binding(3) var<storage,read> cnt:array<u32>;
@group(0) @binding(4) var<storage,read_write> filled:array<atomic<u32>>;
@group(0) @binding(5) var<uniform> u:P;

@compute @workgroup_size(${FILL_LIST_WG},1,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= cnt[0]) { return; }
    let p = list[g.x];
    if (atomicLoad(&ringOf[p]) != ${FILL_UNKNOWN}u) { return; }
    // rings count from 1 here, the known pixels being ring 0: a neighbour counts when its ring is below this one
    let r = u.ring + 1u;
    let px = i32(p % u.w);
    let py = i32(p / u.w);
    // the CPU's visiting order, dy then dx, so the sum runs in the same order
    var n = 0u;
    var s = vec3<f32>(0.0);
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let qx = px + dx;
            let qy = py + dy;
            if ((dx != 0 || dy != 0) && qx >= 0 && qx < i32(u.w) && qy >= 0 && qy < i32(u.h)) {
                let q = u32(qy) * u.w + u32(qx);
                if (atomicLoad(&ringOf[q]) < r) { n++; s += vec3<f32>(img[q * 4u], img[q * 4u + 1u], img[q * 4u + 2u]); }
            }
        }
    }
    if (n > 0u) {
        let v = s / f32(n);
        img[p * 4u] = v.x; img[p * 4u + 1u] = v.y; img[p * 4u + 2u] = v.z; img[p * 4u + 3u] = 1.0;
        atomicStore(&ringOf[p], r);
        atomicAdd(&filled[u.ring], 1u);
    }
}
`;

export const FILL_LISTLEFT_WGSL = /* wgsl */`
@group(0) @binding(0) var<storage,read> ringOf:array<u32>;
@group(0) @binding(1) var<storage,read> list:array<u32>;
@group(0) @binding(2) var<storage,read> cnt:array<u32>;
@group(0) @binding(3) var<storage,read_write> img:array<f32>;
@group(0) @binding(4) var<storage,read_write> left:array<atomic<u32>>;

@compute @workgroup_size(${FILL_LIST_WG},1,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= cnt[0]) { return; }
    let p = list[g.x];
    if (ringOf[p] == ${FILL_UNKNOWN}u) { img[p * 4u] = 0.0; img[p * 4u + 1u] = 0.0; img[p * 4u + 2u] = 0.0; atomicAdd(&left[0], 1u); }
}
`;

/** Round 37: the tile fill's rings a pass, and its halo -- a ring reads one step, so a halo of this many keeps the interior exact. */
export const FILL_TILE_RINGS = 8;
/** Round 37: the tile fill's interior side, its workgroup's side, and the tile it holds in workgroup memory (interior + 2 halos). */
export const FILL_TILE_INNER = 16;
export const FILL_TILE_SIDE = FILL_TILE_INNER + 2 * FILL_TILE_RINGS;
/** Round 37: a tile cell outside the frame -- never below any ring and never filled, the CPU's bounds check. */
export const FILL_OUT = 0xfffffffe;

export const FILL_TILEINIT_WGSL = /* wgsl */`
struct P { w:u32, h:u32, pad0:u32, pad1:u32 };
@group(0) @binding(0) var<storage,read> known:array<u32>;
@group(0) @binding(1) var<storage,read_write> ringOf:array<u32>;
@group(0) @binding(2) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    ringOf[p] = select(${FILL_UNKNOWN}u, 0u, known[p] == 1u);
}
`;

// round 38: the tile kernel is made by one function, over every tile (round 37's, its text unchanged) or over the listed tiles,
// whose index the workgroup reads from the list -- the rest of the kernel is the same text
const tileFillWgsl = (listed) => /* wgsl */`
struct P { w:u32, h:u32, ring:u32, rings:u32 };
@group(0) @binding(0) var<storage,read> srcImg:array<f32>;
@group(0) @binding(1) var<storage,read> srcRing:array<u32>;
@group(0) @binding(2) var<storage,read_write> dstImg:array<f32>;
@group(0) @binding(3) var<storage,read_write> dstRing:array<u32>;
@group(0) @binding(4) var<storage,read_write> filled:array<atomic<u32>>;
@group(0) @binding(5) var<storage,read_write> passes:array<atomic<u32>>;
@group(0) @binding(6) var<uniform> u:P;
${listed ? "@group(0) @binding(7) var<storage,read> tiles:array<u32>;\n" : ""}
const SIDE = ${FILL_TILE_SIDE}u;
const HALO = ${FILL_TILE_RINGS}i;
const INNER = ${FILL_TILE_INNER}u;
const CELLS = ${FILL_TILE_SIDE * FILL_TILE_SIDE}u;
const PER = ${(FILL_TILE_SIDE * FILL_TILE_SIDE) / (FILL_TILE_INNER * FILL_TILE_INNER)}u;
var<workgroup> tr:array<f32, ${FILL_TILE_SIDE * FILL_TILE_SIDE}>;
var<workgroup> tg:array<f32, ${FILL_TILE_SIDE * FILL_TILE_SIDE}>;
var<workgroup> tb:array<f32, ${FILL_TILE_SIDE * FILL_TILE_SIDE}>;
var<workgroup> tring:array<u32, ${FILL_TILE_SIDE * FILL_TILE_SIDE}>;

@compute @workgroup_size(${FILL_TILE_INNER},${FILL_TILE_INNER},1)
fn main(@builtin(workgroup_id) wg:vec3<u32>, @builtin(local_invocation_index) li:u32) {
    if (li == 0u && wg.x == 0u && wg.y == 0u) { atomicAdd(&passes[0], 1u); }
${listed ? `    // the tile this workgroup fills, from the list the init pass built
    let t = tiles[wg.x];
    let tx = t % ((u.w + INNER - 1u) / INNER);
    let ty = t / ((u.w + INNER - 1u) / INNER);
    let ox = i32(tx * INNER) - HALO;
    let oy = i32(ty * INNER) - HALO;` : `    let ox = i32(wg.x * INNER) - HALO;
    let oy = i32(wg.y * INNER) - HALO;`}
    // the tile in: interior and halo, a cell outside the frame marked OUT
    for (var j = 0u; j < PER; j++) {
        let c = li + j * INNER * INNER;
        let gx = ox + i32(c % SIDE);
        let gy = oy + i32(c / SIDE);
        if (gx >= 0 && gx < i32(u.w) && gy >= 0 && gy < i32(u.h)) {
            let p = u32(gy) * u.w + u32(gx);
            tr[c] = srcImg[p * 4u]; tg[c] = srcImg[p * 4u + 1u]; tb[c] = srcImg[p * 4u + 2u]; tring[c] = srcRing[p];
        } else { tr[c] = 0.0; tg[c] = 0.0; tb[c] = 0.0; tring[c] = ${FILL_OUT}u; }
    }
    workgroupBarrier();
    for (var k = 0u; k < u.rings; k++) {
        // rings count from 1, the known pixels being ring 0: a neighbour counts when its ring is below this one
        let r = u.ring + k + 1u;
        // phase 1: every UNKNOWN cell's mean of the neighbours before this ring, kept in registers. The < r alone would keep
        // this ring's fills out of the mean, as the list fill's in place does (sabotage C1's control: one phase, < r, is green);
        // the two phases are kept so no read of workgroup memory races a write to it
        var nv:array<vec3<f32>, PER>;
        var hit:array<bool, PER>;
        for (var j = 0u; j < PER; j++) {
            let c = li + j * INNER * INNER;
            let cx = i32(c % SIDE);
            let cy = i32(c / SIDE);
            hit[j] = false;
            if (tring[c] == ${FILL_UNKNOWN}u) {
                // the CPU's visiting order, dy then dx, so the sum runs in the same order
                var n = 0u;
                var sum = vec3<f32>(0.0);
                for (var dy = -1; dy <= 1; dy++) {
                    for (var dx = -1; dx <= 1; dx++) {
                        let qx = cx + dx;
                        let qy = cy + dy;
                        if ((dx != 0 || dy != 0) && qx >= 0 && qx < i32(SIDE) && qy >= 0 && qy < i32(SIDE)) {
                            let q = u32(qy) * SIDE + u32(qx);
                            if (tring[q] < r) { n++; sum += vec3<f32>(tr[q], tg[q], tb[q]); }
                        }
                    }
                }
                if (n > 0u) { nv[j] = sum / f32(n); hit[j] = true; }
            }
        }
        workgroupBarrier();
        // phase 2: the cells that found one take it and this ring; an interior cell in the frame counts, once
        for (var j = 0u; j < PER; j++) {
            if (hit[j]) {
                let c = li + j * INNER * INNER;
                tr[c] = nv[j].x; tg[c] = nv[j].y; tb[c] = nv[j].z; tring[c] = r;
                let cx = i32(c % SIDE) - HALO;
                let cy = i32(c / SIDE) - HALO;
                if (cx >= 0 && cx < i32(INNER) && cy >= 0 && cy < i32(INNER)) { atomicAdd(&filled[r - 1u], 1u); }
            }
        }
        workgroupBarrier();
    }
    // the interior out
    let c = (li / INNER + u32(HALO)) * SIDE + li % INNER + u32(HALO);
    let gx = ox + i32(c % SIDE);
    let gy = oy + i32(c / SIDE);
    if (gx < i32(u.w) && gy < i32(u.h)) {
        let p = u32(gy) * u.w + u32(gx);
        dstImg[p * 4u] = tr[c]; dstImg[p * 4u + 1u] = tg[c]; dstImg[p * 4u + 2u] = tb[c]; dstImg[p * 4u + 3u] = 1.0;
        dstRing[p] = tring[c];
    }
}
`;
export const FILL_TILE_WGSL = tileFillWgsl(false);
/** Round 38: the tile fill over the listed tiles only -- those holding an unknown pixel when the fill starts. */
export const FILL_LTILE_WGSL = tileFillWgsl(true);

// round 38: once, over the frame -- each pixel's ring into BOTH ring buffers and its value into the second image, so a tile no
// pass writes holds the same in both (an unlisted tile has no unknown pixel and never changes); each tile with an unknown pixel
// is flagged once and appended to the list
export const FILL_LTINIT_WGSL = /* wgsl */`
struct P { w:u32, h:u32, pad0:u32, pad1:u32 };
@group(0) @binding(0) var<storage,read> known:array<u32>;
@group(0) @binding(1) var<storage,read> img:array<f32>;
@group(0) @binding(2) var<storage,read_write> ringA:array<u32>;
@group(0) @binding(3) var<storage,read_write> ringB:array<u32>;
@group(0) @binding(4) var<storage,read_write> imgB:array<f32>;
@group(0) @binding(5) var<storage,read_write> flag:array<atomic<u32>>;
@group(0) @binding(6) var<storage,read_write> tiles:array<u32>;
@group(0) @binding(7) var<storage,read_write> tcnt:array<atomic<u32>>;
@group(0) @binding(8) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    let r = select(${FILL_UNKNOWN}u, 0u, known[p] == 1u);
    ringA[p] = r; ringB[p] = r;
    imgB[p * 4u] = img[p * 4u]; imgB[p * 4u + 1u] = img[p * 4u + 1u]; imgB[p * 4u + 2u] = img[p * 4u + 2u]; imgB[p * 4u + 3u] = 1.0;
    if (r == ${FILL_UNKNOWN}u) {
        let t = (g.y / ${FILL_TILE_INNER}u) * ((u.w + ${FILL_TILE_INNER - 1}u) / ${FILL_TILE_INNER}u) + g.x / ${FILL_TILE_INNER}u;
        if (atomicExchange(&flag[t], 1u) == 0u) { tiles[atomicAdd(&tcnt[0], 1u)] = t; }
    }
}
`;

// round 38: one thread -- the tile list's length as the tile passes' indirect workgroup count
export const FILL_LTARGS_WGSL = /* wgsl */`
@group(0) @binding(0) var<storage,read> tcnt:array<u32>;
@group(0) @binding(1) var<storage,read_write> args:array<u32>;

@compute @workgroup_size(1,1,1)
fn main() {
    args[0] = tcnt[0]; args[1] = 1u; args[2] = 1u;
}
`;

export const FILL_TILELEFT_WGSL = /* wgsl */`
struct P { w:u32, h:u32, pad0:u32, pad1:u32 };
@group(0) @binding(0) var<storage,read> ringOf:array<u32>;
@group(0) @binding(1) var<storage,read_write> img:array<f32>;
@group(0) @binding(2) var<storage,read_write> left:array<atomic<u32>>;
@group(0) @binding(3) var<uniform> u:P;

@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) g:vec3<u32>) {
    if (g.x >= u.w || g.y >= u.h) { return; }
    let p = g.y * u.w + g.x;
    if (ringOf[p] == ${FILL_UNKNOWN}u) { img[p * 4u] = 0.0; img[p * 4u + 1u] = 0.0; img[p * 4u + 2u] = 0.0; atomicAdd(&left[0], 1u); }
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
/**
 * Round 42 (section 110): A TIMING DIAGNOSTIC, NEVER RUN IN ANY CHAIN -- TO_T_WGSL less its one atomicMax line, so the difference
 * between the two passes' times is what every thread sending its brightest t to the same word costs.
 */
export const TO_T_FREE_WGSL = TO_T_WGSL.replace("    atomicMax(&tMax[0], bitcast<u32>(m));\n", "");

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

// Round 46 (section 115, denoise-easu-cost): EASU FOUR OUTPUT PIXELS A THREAD, and optionally fused with the composite. At the
// chain's exact 2 x, outputs 2q - 1 and 2q (and rows likewise) share base texel q - 1 and so one 12-tap footprint: a thread loads
// it and its lumas once, then runs EASU's own per-pixel statements for each of its four outputs. Every piece of text is SLICED
// from EASU_WGSL (fx/fsr/fsrKernels.js, unchanged) and COMPOSITE_WGSL, never rewritten, so each output is the same arithmetic on
// the same values -- held bit for bit to EASU then the composite (render/denoiseUpscaleGPU-selfcheck.mjs section 3).
const sliceBetween = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i); if (i < 0 || j < 0) throw new Error(`easuQuadWgsl: "${a}" .. "${b}" not found`); return t.slice(i, j); };
/** EASU_WGSL's uniform, bindings and four functions; its per-pixel statements; COMPOSITE_WGSL's fromT -- the pieces the quad kernels are made of. */
export const EASU_PIECES = Object.freeze({
    head: EASU_WGSL.slice(0, EASU_WGSL.indexOf("@compute")),
    body: sliceBetween(EASU_WGSL, "  // edge analysis at f, g, j, k", "\n  let o = (g.y * u.dw + g.x) * 4u;"),
    loads: sliceBetween(EASU_WGSL, "  let cB = ld(fx, fy - 1);", "\n  // edge analysis at f, g, j, k"),
    fromT: sliceBetween(COMPOSITE_WGSL, "fn fromT(t:f32) -> f32 {", "\n@compute"),
});
export function easuQuadWgsl({ fused = false } = {}) {
    const P = EASU_PIECES;
    return `${P.head}${fused ? `@group(0) @binding(3) var<storage,read> cov:array<f32>;
@group(0) @binding(4) var<storage,read> emis:array<f32>;
@group(0) @binding(5) var<storage,read> tMax:array<u32>;

${P.fromT}
` : ""}
// one thread, the 2 x 2 outputs whose base texel is (q.x - 1, q.y - 1); dispatched over (rw + 1) x (rh + 1) quads
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) q:vec3<u32>) {
  if (q.x > u.rw || q.y > u.rh) { return; }
  let fx = i32(q.x) - 1;
  let fy = i32(q.y) - 1;
${P.loads}
${fused ? "  let top = bitcast<f32>(tMax[0]);\n" : ""}  for (var k = 0u; k < 4u; k++) {
    let ox = 2 * i32(q.x) - 1 + i32(k & 1u);
    let oy = 2 * i32(q.y) - 1 + i32(k >> 1u);
    if (ox < 0 || oy < 0 || ox >= i32(u.dw) || oy >= i32(u.dh)) { continue; }
    // EASU's own sub-texel offset, for this output
    var ppx = (f32(ox) + 0.5) * f32(u.rw) / f32(u.dw) - 0.5;
    var ppy = (f32(oy) + 0.5) * f32(u.rh) / f32(u.dh) - 0.5;
    ppx = ppx - floor(ppx);
    ppy = ppy - floor(ppy);
${P.body}
    let p = u32(oy) * u.dw + u32(ox);
${fused ? `    let c = array<f32, 3>(pix.x, pix.y, pix.z);
    for (var ch = 0u; ch < 3u; ch++) {
        let x = fromT(min(max(c[ch], 0.0), top));
        dst[p * 3u + ch] = emis[p * 3u + ch] + (1.0 - cov[p]) * x;
    }` : `    let o = p * 4u;
    dst[o] = pix.x; dst[o + 1u] = pix.y; dst[o + 2u] = pix.z; dst[o + 3u] = 1.0;`}
  }
}
`;
}
/** Round 46: EASU in quads, writing EASU's buffer. */
export const EASU_QUAD_WGSL = easuQuadWgsl();
/** Round 46: EASU in quads, compositing in-register -- EASU then COMPOSITE_WGSL in one pass, the up buffer never written. */
export const EASU_COMP_WGSL = easuQuadWgsl({ fused: true });
/** Round 46: the quads share a footprint only at exactly 2 x; any other ratio is refused by name. */
export function easuQuadRefusal(w, h, W, H) { return W === 2 * w && H === 2 * h ? null : `the quad EASU runs at exactly 2 x only -- ${w} x ${h} -> ${W} x ${H} is not`; }

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
// Round 48 (section 117): THE ACCUMULATION WITH ITS 3 x 3 CLAMP READ FROM A WORKGROUP TILE. ACCUM_WGSL reads 27 floats of the current
// frame a pixel for the clamp, and an 8 x 8 workgroup's neighbourhoods overlap almost wholly; here the workgroup stages the 10 x 10
// around it once, every thread loading before any return, and the clamp reads the tile. Made from ACCUM_WGSL's text by exactly
// three replacements -- the tile's declaration, the load and its barrier before the first return, the clamp's one load line --
// so every other line is the accumulation's own. min and max over the same nine values, so the same bits (section 3 holds it).
const ACCUM_TILE_EDITS = Object.freeze([
    ["@group(0) @binding(5) var<uniform> u:A;\n", "@group(0) @binding(5) var<uniform> u:A;\nvar<workgroup> T:array<vec3<f32>, 100>;\n"],
    ["fn main(@builtin(global_invocation_id) g:vec3<u32>) {\n    if (g.x >= u.w || g.y >= u.h) { return; }\n",
     "fn main(@builtin(global_invocation_id) g:vec3<u32>, @builtin(local_invocation_index) li:u32, @builtin(workgroup_id) wg:vec3<u32>) {\n" +
     "    // the current frame's 10 x 10 around this workgroup, staged once -- every thread loads, before any return\n" +
     "    for (var t = li; t < 100u; t += 64u) {\n" +
     "        let tx = i32(wg.x * 8u) + i32(t % 10u) - 1;\n" +
     "        let ty = i32(wg.y * 8u) + i32(t / 10u) - 1;\n" +
     "        if (tx >= 0 && ty >= 0 && tx < i32(u.w) && ty < i32(u.h)) { let ts = (u32(ty) * u.w + u32(tx)) * 3u; T[t] = vec3<f32>(cur[ts], cur[ts + 1u], cur[ts + 2u]); }\n" +
     "    }\n    workgroupBarrier();\n    if (g.x >= u.w || g.y >= u.h) { return; }\n"],
    ["                let s = (u32(sy) * u.w + u32(sx)) * 3u;\n                let v = vec3<f32>(cur[s], cur[s + 1u], cur[s + 2u]);\n",
     "                let v = T[u32(i32(g.y % 8u) + dy + 1) * 10u + u32(i32(g.x % 8u) + dx + 1)];\n"],
]);
export function accumTileWgsl(text = ACCUM_WGSL) {
    let out = text;
    for (const [a, b] of ACCUM_TILE_EDITS) { const n = out.split(a).length - 1; if (n !== 1) throw new Error(`accumTileWgsl: an edit's text occurs ${n} times in the accumulation, not once`); out = out.replace(a, b); }
    return out;
}
/** Round 48: the accumulation, its clamp read from a workgroup tile of the current frame. */
export const ACCUM_TILE_WGSL = accumTileWgsl();
export { ACCUM_TILE_EDITS };

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
        for (const [k, wgsl] of [["cov", COVERAGE_WGSL], ["covB", COVERAGE_BOUND_WGSL], ["ring", FILL_RING_WGSL], ["left", FILL_LEFT_WGSL], ["toT", TO_T_WGSL], ["toTFree", TO_T_FREE_WGSL], ["comp", COMPOSITE_WGSL], ["easu", EASU_WGSL], ["easuQ", EASU_QUAD_WGSL], ["easuC", EASU_COMP_WGSL],
                                  ["hits", FIRSTHITS_WGSL], ["shift", SHIFT_WGSL], ["accum", ACCUM_WGSL], ["accumT", ACCUM_TILE_WGSL], ["final", FINAL_WGSL],
                                  ["list", FILL_LIST_WGSL], ["args", FILL_ARGS_WGSL], ["lring", FILL_LISTRING_WGSL], ["lleft", FILL_LISTLEFT_WGSL],
                                  ["tinit", FILL_TILEINIT_WGSL], ["tile", FILL_TILE_WGSL], ["tleft", FILL_TILELEFT_WGSL],
                                  ["ltinit", FILL_LTINIT_WGSL], ["ltargs", FILL_LTARGS_WGSL], ["ltile", FILL_LTILE_WGSL]]) {
            const p = this.p[k] = device.compute({ wgsl });
            if (p && p.error) throw new Error(`render/denoiseUpscaleGPU: the ${k} kernel did not compile -- ${p.error}`);
        }
    }

    /**
     * emitterRadiance on the device: { cov, E, traced }, Float64Arrays of w*h and w*h*3. The bound (round 39, the default since
     * round 44) skips each pixel no ray of which can meet an emitter (coverageMayHit's test), writing its 0s untraced -- round 31's
     * answer bit for bit; `{ bound: false }` runs round 31's pass, the reference. `traced` counts the pixels traced (0 unbounded).
     */
    async coverage(S, w, h, { bound = true } = {}) {
        const dev = this.device, n = w * h, sph = packSpheres(S.scene);
        const bS = dev.buffer({ data: sph, usage: ["storage"] }), bC = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bE = dev.buffer({ data: new Float32Array(n * 3), usage: ["storage"] }), u = dev.buffer({ data: cameraUniform(S, w, h, S.scene.length), usage: "uniform" });
        const bT = dev.buffer({ data: new Uint32Array(1), usage: ["storage"] });
        dev.frame(({ pass }) => { this._covOps(pass, bound, bS, bC, bE, u, bT, w, h); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const cov = Float64Array.from(new Float32Array(await dev.read(bC))), E = Float64Array.from(new Float32Array(await dev.read(bE)));
        const traced = new Uint32Array(await dev.read(bT))[0];
        for (const b of [bS, bC, bE, u, bT]) b.destroy();
        return { cov, E, traced };
    }
    // the coverage dispatch, round 31's or (round 39) bounded, counting what it traced into `bT`
    _covOps(pass, bound, bS, bC, bE, u, bT, w, h) {
        const k = bound ? this.p.covB : this.p.cov;
        k.bind("sph", bS).bind("cov", bC).bind("emis", bE).bind("c", u);
        if (bound) k.bind("traced", bT);
        pass.dispatch(k, groups(w, h));
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
    // round 34: the same fill over the lights' pixels only, IN PLACE on `a` -- the list once, its length as the rings' dispatch,
    // then the rings and the left pass over the list alone (the returned buffer is `a`)
    _fillListOps(pass, bufs, w, h, maxRings) {
        const { a, kA, filled, left, uRings, uLeft, ringOf, list, cnt, args } = bufs;
        this.p.list.bind("known", kA).bind("ringOf", ringOf).bind("list", list).bind("cnt", cnt).bind("u", uLeft);
        pass.dispatch(this.p.list, groups(w, h));
        this.p.args.bind("cnt", cnt).bind("args", args);
        pass.dispatch(this.p.args, [1, 1, 1]);
        for (let r = 0; r < maxRings; r++) {
            this.p.lring.bind("img", a).bind("ringOf", ringOf).bind("list", list).bind("cnt", cnt).bind("filled", filled).bind("u", uRings[r]);
            pass.dispatchIndirect(this.p.lring, args);
        }
        this.p.lleft.bind("ringOf", ringOf).bind("list", list).bind("cnt", cnt).bind("img", a).bind("left", left);
        pass.dispatchIndirect(this.p.lleft, args);
        return a;
    }
    // round 37: the same fill, FILL_TILE_RINGS rings a pass in workgroup tiles -- the known flags to rings once, then the tile
    // passes ping-ponging the image and the rings between two buffers each, then the left pass (the returned buffer is the last written)
    _fillTileOps(pass, bufs, w, h, maxRings) {
        const { a, b, kA, filled, left, uLeft, ringOf, ringB, uTiles, tilePasses } = bufs;
        this.p.tinit.bind("known", kA).bind("ringOf", ringOf).bind("u", uLeft);
        pass.dispatch(this.p.tinit, groups(w, h));
        let src = a, dst = b, rin = ringOf, rout = ringB;
        const tg = [Math.ceil(w / FILL_TILE_INNER), Math.ceil(h / FILL_TILE_INNER)];
        for (const u of uTiles) {
            this.p.tile.bind("srcImg", src).bind("srcRing", rin).bind("dstImg", dst).bind("dstRing", rout).bind("filled", filled).bind("passes", tilePasses).bind("u", u);
            pass.dispatch(this.p.tile, tg);
            [src, dst] = [dst, src]; [rin, rout] = [rout, rin];
        }
        this.p.tleft.bind("ringOf", rin).bind("img", src).bind("left", left).bind("u", uLeft);
        pass.dispatch(this.p.tleft, groups(w, h));
        return src;
    }
    // round 38: the tile fill over the listed tiles only -- the init pass (rings into both buffers, the image into the second, the
    // tiles listed), the list's length as the dispatch, the tile passes over the list, the left pass over the frame
    _fillLTileOps(pass, bufs, w, h, maxRings) {
        const { a, b, kA, filled, left, uLeft, ringOf, ringB, uTiles, tilePasses, tFlag, tList, tCnt, tArgs } = bufs;
        this.p.ltinit.bind("known", kA).bind("img", a).bind("ringA", ringOf).bind("ringB", ringB).bind("imgB", b).bind("flag", tFlag).bind("tiles", tList).bind("tcnt", tCnt).bind("u", uLeft);
        pass.dispatch(this.p.ltinit, groups(w, h));
        this.p.ltargs.bind("tcnt", tCnt).bind("args", tArgs);
        pass.dispatch(this.p.ltargs, [1, 1, 1]);
        let src = a, dst = b, rin = ringOf, rout = ringB;
        for (const u of uTiles) {
            this.p.ltile.bind("srcImg", src).bind("srcRing", rin).bind("dstImg", dst).bind("dstRing", rout).bind("filled", filled).bind("passes", tilePasses).bind("u", u).bind("tiles", tList);
            pass.dispatchIndirect(this.p.ltile, tArgs);
            [src, dst] = [dst, src]; [rin, rout] = [rout, rin];
        }
        this.p.tleft.bind("ringOf", rin).bind("img", src).bind("left", left).bind("u", uLeft);
        pass.dispatch(this.p.tleft, groups(w, h));
        return src;
    }
    _fillOpsFor(o) { return o.tile === "listed" ? this._fillLTileOps : o.tile ? this._fillTileOps : o.list ? this._fillListOps : this._fillOps; }
    // round 43: with nothing asked, the listed tile fill; a caller that names its fill (list or tile) gets the one it names
    _fillChoice({ list, tile } = {}) { return tile !== undefined ? { list: list ?? true, tile } : list !== undefined ? { list, tile: false } : { list: true, tile: "listed" }; }
    // round 54: with nothing asked, the fused rest where it runs (exactly 2 x), else the three passes; a rest asked for is the one
    // run, and the fused one asked for at another ratio is refused by name
    _restChoice(rest, w, h, W, H) {
        if (rest === undefined) return easuQuadRefusal(w, h, W, H) ? "easu" : "fused";
        if (rest !== "easu" && rest !== "fused") throw new Error(`denoiseUpscaleGPU.chain: rest is easu or fused -- got ${rest}`);
        const no = rest === "fused" ? easuQuadRefusal(w, h, W, H) : null;
        if (no) throw new Error(`denoiseUpscaleGPU.chain: ${no}`);
        return rest;
    }
    _fillBufs(img3, cov, w, h, maxRings) {
        const dev = this.device, n = w * h;
        return { a: dev.buffer({ data: rgba(img3, n), usage: ["storage"] }), b: dev.buffer({ data: new Float32Array(n * 4), usage: ["storage"] }),
                 kA: dev.buffer({ data: Uint32Array.from(cov, (c) => (c > 0 ? 0 : 1)), usage: ["storage"] }), kB: dev.buffer({ data: new Uint32Array(n), usage: ["storage"] }),
                 filled: dev.buffer({ data: new Uint32Array(Math.max(maxRings, 1)), usage: ["storage"] }), left: dev.buffer({ data: new Uint32Array(1), usage: ["storage"] }),
                 uRings: Array.from({ length: maxRings }, (_, r) => dev.buffer({ data: u4(w, h, r), usage: "uniform" })), uLeft: dev.buffer({ data: u4(w, h), usage: "uniform" }),
                 // round 34's list fill: each pixel's ring, the list of the lights' pixels, its length, and the rings' dispatch
                 ringOf: dev.buffer({ data: new Uint32Array(n), usage: ["storage"] }), list: dev.buffer({ data: new Uint32Array(n), usage: ["storage"] }),
                 cnt: dev.buffer({ data: new Uint32Array(1), usage: ["storage"] }), args: dev.buffer({ data: new Uint32Array(3), usage: ["storage", "indirect"] }),
                 // round 37's tile fill: the rings' second buffer, a uniform a pass (its first ring and how many), and its passes, counted
                 ringB: dev.buffer({ data: new Uint32Array(n), usage: ["storage"] }), tilePasses: dev.buffer({ data: new Uint32Array(1), usage: ["storage"] }),
                 // round 38's listed tiles: a flag a tile, the list, its length, and the tile passes' indirect dispatch
                 ...(() => { const nT = Math.ceil(w / FILL_TILE_INNER) * Math.ceil(h / FILL_TILE_INNER);
                     return { tFlag: dev.buffer({ data: new Uint32Array(nT), usage: ["storage"] }), tList: dev.buffer({ data: new Uint32Array(nT), usage: ["storage"] }),
                              tCnt: dev.buffer({ data: new Uint32Array(1), usage: ["storage"] }), tArgs: dev.buffer({ data: new Uint32Array(3), usage: ["storage", "indirect"] }) }; })(),
                 uTiles: Array.from({ length: Math.ceil(maxRings / FILL_TILE_RINGS) }, (_, i) => dev.buffer({ data: u4(w, h, i * FILL_TILE_RINGS, Math.min(FILL_TILE_RINGS, maxRings - i * FILL_TILE_RINGS)), usage: "uniform" })) };
    }
    async _fillCounts(bufs) {
        const per = new Uint32Array(await this.device.read(bufs.filled)), left = new Uint32Array(await this.device.read(bufs.left))[0];
        // listed: the pixels round 34's list fill put on its list -- 0 when the rings ran over the whole frame instead
        const listed = new Uint32Array(await this.device.read(bufs.cnt))[0];
        // tilePasses: the passes round 37's tile fill ran -- 0 when another fill ran
        const tilePasses = new Uint32Array(await this.device.read(bufs.tilePasses))[0];
        // tilesListed: the tiles round 38's listed tile fill dispatched over -- 0 when another fill ran
        const tilesListed = new Uint32Array(await this.device.read(bufs.tCnt))[0];
        return { rings: per.filter((k) => k > 0).length, perRing: Array.from(per), left, listed, tilePasses, tilesListed };
    }
    _free(bufs) { for (const v of Object.values(bufs)) for (const b of [].concat(v)) b.destroy(); }

    /**
     * fillEmittersBounded on the device: { y, rings, left, perRing, listed }. Round 43: with nothing asked, round 38's listed
     * tile fill. `{ list: true }` runs round 34's list fill over the lights' pixels; `{ list: false }` round 31's ring fill.
     * `{ tile: true }` (round 37) runs the fill FILL_TILE_RINGS rings a pass in workgroup tiles; tilePasses counts its passes.
     * `{ tile: "listed" }` (round 38) runs those passes over the tiles holding an unknown pixel only; tilesListed counts them.
     */
    async fill(img3, cov, w, h, maxRings, opts = {}) {
        if (!Number.isInteger(maxRings) || maxRings < 0) throw new Error(`denoiseUpscaleGPU.fill: maxRings is a whole number of rings -- got ${maxRings}`);
        if (img3.length !== w * h * 3 || cov.length !== w * h) throw new Error(`denoiseUpscaleGPU.fill: ${img3.length} values and ${cov.length} coverages are not a ${w} x ${h} frame`);
        const bufs = this._fillBufs(img3, cov, w, h, maxRings);
        let out = null;
        this.device.frame(({ pass }) => { out = this._fillOpsFor(this._fillChoice(opts)).call(this, pass, bufs, w, h, maxRings); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const y = rgbOf(new Float32Array(await this.device.read(out)), w * h), c = await this._fillCounts(bufs);
        this._free(bufs);
        return { y, ...c };
    }

    /**
     * Round 46 (section 115): the rest after the transfer, three ways, on one filled w x h frame (rgb) and the full-size guide
     * ({ cov, E }): "easu" EASU then the composite (the chain's), "quad" EASU in quads then the composite, "fused" the quad EASU
     * compositing in-register. Each runs the transfer first, for tMax. Returns { up (W*H*4, null for "fused"), y (W*H*3), tMax }.
     */
    async rest(img3, w, h, W, H, full, mode = "easu") {
        if (!["easu", "quad", "fused"].includes(mode)) throw new Error(`denoiseUpscaleGPU.rest: mode is easu, quad or fused -- got ${mode}`);
        const no = mode === "easu" ? null : easuQuadRefusal(w, h, W, H);
        if (no) throw new Error(`denoiseUpscaleGPU.rest: ${no}`);
        const dev = this.device, src = dev.buffer({ data: rgba(img3, w * h), usage: ["storage"] });
        const tMax = dev.buffer({ data: new Uint32Array(1), usage: ["storage"] }), uT = dev.buffer({ data: u4(w, h), usage: "uniform" });
        const up = dev.buffer({ data: new Float32Array(W * H * 4), usage: ["storage"] }), uE = dev.buffer({ data: u4(w, h, W, H), usage: "uniform" });
        const fc = dev.buffer({ data: Float32Array.from(full.cov), usage: ["storage"] }), fE = dev.buffer({ data: Float32Array.from(full.E), usage: ["storage"] });
        const dst = dev.buffer({ data: new Float32Array(W * H * 3), usage: ["storage"] }), uC = dev.buffer({ data: u4(W, H), usage: "uniform" });
        dev.frame(({ pass }) => {
            this.p.toT.bind("img", src).bind("tMax", tMax).bind("u", uT); pass.dispatch(this.p.toT, groups(w, h));
            if (mode === "fused") { this.p.easuC.bind("src", src).bind("dst", dst).bind("u", uE).bind("cov", fc).bind("emis", fE).bind("tMax", tMax); pass.dispatch(this.p.easuC, groups(w + 1, h + 1)); }
            else {
                if (mode === "quad") { this.p.easuQ.bind("src", src).bind("dst", up).bind("u", uE); pass.dispatch(this.p.easuQ, groups(w + 1, h + 1)); }
                else { this.p.easu.bind("src", src).bind("dst", up).bind("u", uE); pass.dispatch(this.p.easu, groups(W, H)); }
                this.p.comp.bind("up", up).bind("cov", fc).bind("emis", fE).bind("tMax", tMax).bind("dst", dst).bind("u", uC); pass.dispatch(this.p.comp, groups(W, H));
            }
            pass.clear([0, 0, 0, 1]);
        }, { offscreen: true });
        const upOut = mode === "fused" ? null : new Float32Array(await dev.read(up)), y = new Float32Array(await dev.read(dst));
        const tm = new Float32Array(new Uint32Array(await dev.read(tMax)).buffer)[0];
        for (const b of [src, tMax, uT, up, uE, fc, fE, dst, uC]) b.destroy();
        return { up: upOut, y, tMax: tm };
    }

    /**
     * The emitter-aware chain on one encoder: the w x h frame (rgb), its coverage covHalf, filled in at most maxRings rings,
     * through the transfer, EASU to W x H, the clamp and inverse, and the composite with `full` ({ cov, E } at W x H).
     * Returns { y (W*H*3), rings, left, perRing, listed, tMax }. Round 43: the fill is round 38's listed tile fill unless asked
     * `{ list: true }`, round 34's list fill; `{ list: false }` round 31's ring fill; `{ tile: true }` round 37's tile fill.
     * Round 54: the rest after the fill is the transfer and round 46's fused EASU and composite (EASU_COMP_WGSL) unless asked
     * `{ rest: "easu" }`, the three passes; at a ratio other than 2 x, asked nothing, the three passes. The result's `rest` names it.
     */
    async chain(img3, covHalf, w, h, W, H, full, maxRings, opts = {}) {
        if (full.cov.length !== W * H || full.E.length !== W * H * 3) throw new Error(`denoiseUpscaleGPU.chain: the full-size guide is not ${W} x ${H}`);
        const rest = this._restChoice(opts.rest, w, h, W, H), dev = this.device, bufs = this._fillBufs(img3, covHalf, w, h, maxRings);
        const tMax = dev.buffer({ data: new Uint32Array(1), usage: ["storage"] }), uT = dev.buffer({ data: u4(w, h), usage: "uniform" });
        const up = dev.buffer({ data: new Float32Array(W * H * 4), usage: ["storage"] }), uE = dev.buffer({ data: u4(w, h, W, H), usage: "uniform" });
        const fc = dev.buffer({ data: Float32Array.from(full.cov), usage: ["storage"] }), fE = dev.buffer({ data: Float32Array.from(full.E), usage: ["storage"] });
        const dst = dev.buffer({ data: new Float32Array(W * H * 3), usage: ["storage"] }), uC = dev.buffer({ data: u4(W, H), usage: "uniform" });
        dev.frame(({ pass }) => {
            const filled = this._fillOpsFor(this._fillChoice(opts)).call(this, pass, bufs, w, h, maxRings);
            this.p.toT.bind("img", filled).bind("tMax", tMax).bind("u", uT); pass.dispatch(this.p.toT, groups(w, h));
            if (rest === "fused") { this.p.easuC.bind("src", filled).bind("dst", dst).bind("u", uE).bind("cov", fc).bind("emis", fE).bind("tMax", tMax); pass.dispatch(this.p.easuC, groups(w + 1, h + 1)); }
            else {
                this.p.easu.bind("src", filled).bind("dst", up).bind("u", uE); pass.dispatch(this.p.easu, groups(W, H));
                this.p.comp.bind("up", up).bind("cov", fc).bind("emis", fE).bind("tMax", tMax).bind("dst", dst).bind("u", uC); pass.dispatch(this.p.comp, groups(W, H));
            }
            pass.clear([0, 0, 0, 1]);
        }, { offscreen: true });
        const y = Float64Array.from(new Float32Array(await dev.read(dst))), c = await this._fillCounts(bufs);
        const tm = new Float32Array(new Uint32Array(await dev.read(tMax)).buffer)[0];
        this._free(bufs);
        for (const b of [tMax, uT, up, uE, fc, fE, dst, uC]) b.destroy();
        return { y, ...c, tMax: tm, rest };
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
     * device traces them. With `full` ({ cov, E } at W x H) the result is composited as section 95's Bt is. `tile` (round 48) runs
     * ACCUM_TILE_WGSL -- since round 55 by default; `{ tile: false }` runs ACCUM_WGSL, the reference. Returns { A, n, y, kernel }, kernel naming the accumulation it dispatched.
     */
    async accumulate(S, eyes, frames, W, H, { clamp = true, geo = null, full = null, tile = true } = {}) {
        const acc = tile ? this.p.accumT : this.p.accum;   // round 48: the clamp read from a workgroup tile; round 55: by default
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
                acc.bind("prevGeo", f ? G[f - 1] : sky).bind("curGeo", G[f]).bind("prevHist", a).bind("cur", cur).bind("outHist", b).bind("u", uAc[f]);
                pass.dispatch(acc, groups(W, H));
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
        // round 48: which accumulation ran, so a run asked for the tile is held to having dispatched it
        return { A, n: N, y, kernel: acc === this.p.accumT ? "accumT" : "accum" };
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
     *   hits, shift, accum, final   round 33: the history's four passes a frame, at W x H
     *   fillList, wholeList        round 34: fill and whole with the fill over the lights' pixels only, by the wall clock
     *   fillTile, wholeTile        round 37: fill and whole with the fill FILL_TILE_RINGS rings a pass in tiles, by the wall clock
     *   fillLTile, wholeLTile      round 38: the same over the listed tiles only, by the wall clock
     *   covHalfB, covFullB         round 39: the coverage bounded, at w x h and W x H, one pass each
     *   restToT, restEasu, restComp  round 42: rest's three passes, one each; restToTFree the transfer without its atomic (a diagnostic)
     *   restEasuQ, restEasuComp  round 46: EASU in 2 x 2 quads alone, and fused with the composite (EASU_QUAD_WGSL, EASU_COMP_WGSL)
     *   accumT             round 48: the accumulation with its clamp read from a workgroup tile (ACCUM_TILE_WGSL), one pass;
     *                      the history's by default since round 55
     *   restF              round 54: the chain's rest by default -- the transfer and the fused EASU and composite, one frame
     * A step is on the device's clock where the device grants timestamps and the step has 30 passes or fewer, else the wall
     * clock (performance.now() around the frame and the queue's onSubmittedWorkDone). Each row says which. Returns medians.
     */
    async time(S, w, h, W, H, maxRings, { reps = 5 } = {}) {
        const dev = this.device, gpu = dev.gpu, stamps = !!(dev.capabilities && dev.capabilities.timestamps), now = () => performance.now();
        const sph = packSpheres(S.scene), mk = (n) => dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bS = dev.buffer({ data: sph, usage: ["storage"] }), cH = mk(w * h), eH = mk(w * h * 3), cF = mk(W * H), eF = mk(W * H * 3);
        const uH = dev.buffer({ data: cameraUniform(S, w, h, S.scene.length), usage: "uniform" }), uF = dev.buffer({ data: cameraUniform(S, W, H, S.scene.length), usage: "uniform" });
        const covOps = (pass, c, e, u, ww, hh) => { this.p.cov.bind("sph", bS).bind("cov", c).bind("emis", e).bind("c", u); pass.dispatch(this.p.cov, groups(ww, hh)); };
        // round 39: the bounded coverage, into buffers of its own so the chain's steps keep reading round 31's
        const cHb = mk(w * h), eHb = mk(w * h * 3), cFb = mk(W * H), eFb = mk(W * H * 3), bTr = dev.buffer({ data: new Uint32Array(1), usage: ["storage"] });
        const covBOps = (pass, c, e, u, ww, hh) => this._covOps(pass, true, bS, c, e, u, bTr, ww, hh);
        // the half-size coverage once, read back outside every time, for the fill's known flags; the frame is smooth light
        dev.frame(({ pass }) => { covOps(pass, cH, eH, uH, w, h); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const covHalf = Float64Array.from(new Float32Array(await dev.read(cH)));
        const img = new Float64Array(w * h * 3); for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) img[p * 3 + c] = 0.2 + 0.5 * ((p % w) / w) + 0.1 * c;
        const bufs = this._fillBufs(img, covHalf, w, h, maxRings), rgba0 = rgba(img, w * h), known0 = Uint32Array.from(covHalf, (c) => (c > 0 ? 0 : 1));
        const zero1 = new Uint32Array(1);
        const nT = Math.ceil(w / FILL_TILE_INNER) * Math.ceil(h / FILL_TILE_INNER), zeroT = new Uint32Array(nT);
        // round 38: and the listed tiles' flags and count, which the init pass builds afresh
        const reset = () => { gpu.queue.writeBuffer(bufs.a.gpu, 0, rgba0); gpu.queue.writeBuffer(bufs.kA.gpu, 0, known0); gpu.queue.writeBuffer(bufs.cnt.gpu, 0, zero1);
                              gpu.queue.writeBuffer(bufs.tFlag.gpu, 0, zeroT); gpu.queue.writeBuffer(bufs.tCnt.gpu, 0, zero1); };
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
            // round 48 (section 117): the same pass with its clamp read from a workgroup tile -- timed beside it, in no chain
            accumT: (pass) => { this.p.accumT.bind("prevGeo", geoB).bind("curGeo", geoB).bind("prevHist", hA).bind("cur", curB).bind("outHist", hB).bind("u", uAc); pass.dispatch(this.p.accumT, groups(W, H)); },
            final: (pass) => { this.p.final.bind("hist", hB).bind("cov", cF).bind("emis", eF).bind("dst", outB).bind("u", uC); pass.dispatch(this.p.final, groups(W, H)); },
        };
        const step = { covHalf: [], covFull: [], fill: [], rest: [], whole: [], hits: [], shift: [], accum: [], final: [], fillList: [], wholeList: [], fillTile: [], wholeTile: [], fillLTile: [], wholeLTile: [], covHalfB: [], covFullB: [], restToT: [], restEasu: [], restComp: [], restToTFree: [], restEasuQ: [], restEasuComp: [], accumT: [], restF: [] }, clock = {};
        // round 42 (section 110): the rest steps record which of this runner's pipelines they dispatched, so a split step is held to its
        // one kernel -- through a thin wrapper on those steps alone, so no other step's timing changes
        const nameOf = (pipe) => Object.keys(this.p).find((n) => this.p[n] === pipe) || "?", dispatched = {};
        const run = async (k, ops, passes) => {
            const dc = stamps && passes <= 30, seen = /^rest|^accumT$/.test(k) ? [] : null;   // round 48: and the tiled accumulation
            await gpu.queue.onSubmittedWorkDone();
            const t0 = now(), res = dev.frame(({ pass }) => {
                ops(seen ? { dispatch: (pipe, wg) => { seen.push(nameOf(pipe)); pass.dispatch(pipe, wg); } } : pass);
                pass.clear([0, 0, 0, 1]);
            }, { offscreen: true, ...(dc ? { timing: true } : {}) });
            if (seen) dispatched[k] = seen;
            if (dc) { const g = await res; step[k].push(g.gpuMs.compute); } else { await gpu.queue.onSubmittedWorkDone(); step[k].push(now() - t0); }
            clock[k] = dc ? "device" : "wall";
        };
        for (let r = 0; r < reps + 1; r++) {         // the first rep warms every pipeline and is not kept
            await run("covHalf", (pass) => covOps(pass, cH, eH, uH, w, h), 1);
            await run("covFull", (pass) => covOps(pass, cF, eF, uF, W, H), 1);
            // round 39: the bounded coverage at both sizes, one pass each, on the device's clock where it has one
            await run("covHalfB", (pass) => covBOps(pass, cHb, eHb, uH, w, h), 1);
            await run("covFullB", (pass) => covBOps(pass, cFb, eFb, uF, W, H), 1);
            reset(); await run("fill", (pass) => { filled = this._fillOps(pass, bufs, w, h, maxRings); }, 31);
            await run("rest", (pass) => restOps(pass, filled), 3);
            // round 42 (section 110): rest's three passes one at a time, and the transfer without its atomic (a diagnostic) -- one pass each
            await run("restToT", (pass) => { this.p.toT.bind("img", filled).bind("tMax", tMax).bind("u", uT); pass.dispatch(this.p.toT, groups(w, h)); }, 1);
            await run("restToTFree", (pass) => { this.p.toTFree.bind("img", filled).bind("u", uT); pass.dispatch(this.p.toTFree, groups(w, h)); }, 1);
            await run("restEasu", (pass) => { this.p.easu.bind("src", filled).bind("dst", up).bind("u", uE); pass.dispatch(this.p.easu, groups(W, H)); }, 1);
            await run("restComp", (pass) => { this.p.comp.bind("up", up).bind("cov", cF).bind("emis", eF).bind("tMax", tMax).bind("dst", dst).bind("u", uC); pass.dispatch(this.p.comp, groups(W, H)); }, 1);
            // round 46 (section 115): EASU in quads alone, and fused with the composite -- (w + 1) x (h + 1) quads each
            await run("restEasuQ", (pass) => { this.p.easuQ.bind("src", filled).bind("dst", up).bind("u", uE); pass.dispatch(this.p.easuQ, groups(w + 1, h + 1)); }, 1);
            await run("restEasuComp", (pass) => { this.p.easuC.bind("src", filled).bind("dst", dst).bind("u", uE).bind("cov", cF).bind("emis", eF).bind("tMax", tMax); pass.dispatch(this.p.easuC, groups(w + 1, h + 1)); }, 1);
            // round 54 (section 125): the chain's rest by default -- the transfer, then the fused pass, in one frame
            await run("restF", (pass) => {
                this.p.toT.bind("img", filled).bind("tMax", tMax).bind("u", uT); pass.dispatch(this.p.toT, groups(w, h));
                this.p.easuC.bind("src", filled).bind("dst", dst).bind("u", uE).bind("cov", cF).bind("emis", eF).bind("tMax", tMax); pass.dispatch(this.p.easuC, groups(w + 1, h + 1));
            }, 2);
            reset(); await run("whole", (pass) => { covOps(pass, cH, eH, uH, w, h); covOps(pass, cF, eF, uF, W, H); restOps(pass, this._fillOps(pass, bufs, w, h, maxRings)); }, 31);
            for (const k of ["hits", "shift", "accum", "final", "accumT"]) await run(k, histOps[k], 1);
            // round 34: the list fill alone, and the chain's steps in one frame with it -- by the wall clock, as the fill is
            reset(); await run("fillList", (pass) => { this._fillListOps(pass, bufs, w, h, maxRings); }, 31);
            reset(); await run("wholeList", (pass) => { covOps(pass, cH, eH, uH, w, h); covOps(pass, cF, eF, uF, W, H); restOps(pass, this._fillListOps(pass, bufs, w, h, maxRings)); }, 31);
            // round 37: the tile fill alone, and the chain's steps with it -- by the wall clock, as the list fill is, so the fills share a clock
            reset(); await run("fillTile", (pass) => { this._fillTileOps(pass, bufs, w, h, maxRings); }, 31);
            reset(); await run("wholeTile", (pass) => { covOps(pass, cH, eH, uH, w, h); covOps(pass, cF, eF, uF, W, H); restOps(pass, this._fillTileOps(pass, bufs, w, h, maxRings)); }, 31);
            // round 38: the tile fill over the listed tiles, alone and with the chain's steps -- by the wall clock, as the other fills are
            reset(); await run("fillLTile", (pass) => { this._fillLTileOps(pass, bufs, w, h, maxRings); }, 31);
            reset(); await run("wholeLTile", (pass) => { covOps(pass, cH, eH, uH, w, h); covOps(pass, cF, eF, uF, W, H); restOps(pass, this._fillLTileOps(pass, bufs, w, h, maxRings)); }, 31);
            if (r === 0) for (const k of Object.keys(step)) step[k].length = 0;
        }
        const c = await this._fillCounts(bufs);
        this._free(bufs);
        // round 39: the bounded coverage's last frames against round 31's, float for float, read back outside every time
        const eq = async (x, y) => { const a = new Uint32Array(await dev.read(x)), b = new Uint32Array(await dev.read(y)); return a.length === b.length && a.every((v, i) => v === b[i]); };
        const sameHalf = (await eq(cH, cHb)) && (await eq(eH, eHb)), sameFull = (await eq(cF, cFb)) && (await eq(eF, eFb));
        for (const b of [bS, cH, eH, cF, eF, uH, uF, tMax, uT, up, uE, dst, uC, geoB, curB, hA, hB, outB, uSh, uAc, cHb, eHb, cFb, eFb, bTr]) b.destroy();
        const th = (await this.coverage(S, w, h, { bound: true })).traced, tf = (await this.coverage(S, W, H, { bound: true })).traced;
        const boundCheck = { half: th, full: tf, ofHalf: w * h, ofFull: W * H, sameHalf, sameFull };
        // round 34: the list fill once more at this size, outside every time, read back -- its rings, the pixels it listed and left
        const lc = await this.fill(img, covHalf, w, h, maxRings, { list: true }), listCheck = { rings: lc.rings, left: lc.left, listed: lc.listed };
        // round 37: the tile fill the same way -- its rings, the pixels it left, and the passes it ran
        const tc = await this.fill(img, covHalf, w, h, maxRings, { tile: true }), tileCheck = { rings: tc.rings, left: tc.left, passes: tc.tilePasses };
        // round 38: the listed tile fill the same way -- and the tiles it listed, of all the frame's
        const ltc = await this.fill(img, covHalf, w, h, maxRings, { tile: "listed" }), ltileCheck = { rings: ltc.rings, left: ltc.left, passes: ltc.tilePasses, tiles: ltc.tilesListed, of: nT };
        const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[(b.length - 1) >> 1] : null; };
        return { w, h, W, H, maxRings, reps, rings: c.rings, inView: covHalf.filter((v) => v > 0).length, listCheck, tileCheck, ltileCheck, boundCheck,
                 steps: Object.fromEntries(Object.keys(step).map((k) => [k, { ms: med(step[k]), clock: clock[k], runs: step[k], ...(dispatched[k] ? { kernels: dispatched[k] } : {}) }])) };
    }
}

/**
 * Round 31, WHAT THE PAGE TIMES (denoise.html's "Time the half-size chain"): the shipped network at w x h and at W x H on the
 * page's own kernel set (render/denoiseDevice.mjs's timingLadder, the ladder the page already runs), and the chain's steps on
 * scene S (DenoiseUpscaleGPU's time). `device` is a gfx/device.js webgpu device; `newAdapter` makes the ladder's adapters.
 * Returns { ladder, chain, networkHalf, networkFull, fill, coverage, rest, accumulation, full, half, temporal, fullUnbound, halfUnbound, temporalUnbound, halfList, ... }, each sum on the clocks
 * its parts were read on, named:
 *   full   today's page at W x H: the network at W x H, and the emitter coverage at W x H, which is the mask it reads
 *   half   the chain: the network at w x h, the coverage at w x h (its mask, and the fill's), the coverage at W x H (the
 *          composite's guide), the fill, and the transfer, EASU and the composite
 *   temporal  round 33: the chain and round 32's history a frame -- the first hits, the shift, the accumulation, the composite
 *   fill   round 43: "listedTile" -- half and temporal's fill is round 38's over the listed tiles (fillLTile). A report with
 *          fill "list" is from rounds 36-42, its half and temporal the list fill's and halfLTile the listed tile fill's; one
 *          without the key is from before round 36, and its half and temporal are the ring fill's
 *   halfList, temporalList  round 43: half and temporal with round 34's list fill (fillList), the default in rounds 36-42
 *   halfRing, temporalRing  round 36: half and temporal with round 31's ring fill (fill), the reference the default is held to
 *   halfTile, temporalTile  round 37: half and temporal with the tile fill (fillTile)
 *   coverage  round 44: "bound" -- full, half and temporal take round 39's bounded coverage (covHalfB, covFullB). In reports of
 *          rounds 39-43 those were fullBound, halfBound and temporalBound, and full, half and temporal had round 31's
 *   fullUnbound, halfUnbound, temporalUnbound  round 44: full, half and temporal with round 31's coverage (covHalf, covFull),
 *          the reference. Every other reference sum (halfRing, halfTile, halfList and their temporals) keeps round 31's coverage
 *   rest   round 54: "fused" -- half and temporal take the transfer and the fused EASU and composite (restF). A report without
 *          the key is from before round 54, and its half and temporal took the three passes (rest)
 *   halfTwoPass, temporalTwoPass  round 54: half and temporal with the three-pass rest, the defaults of rounds 44-53 and the
 *          reference. Every other reference sum keeps the three passes
 *   accumulation  round 55: "tiled" -- temporal takes the accumulation with its clamp read from a workgroup tile (accumT). A
 *          report without the key is from before round 55, and its temporal took the plain accumulation (accum)
 *   temporalUntiled  round 55: temporal with the plain accumulation, the default of round 54 and the reference. Every other
 *          history sum keeps the plain accumulation
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
             fill: "listedTile", coverage: "bound", rest: "fused", accumulation: "tiled", full: sum([networkFull, st.covFullB]), half: sum([networkHalf, st.covHalfB, st.covFullB, st.fillLTile, st.restF]),
             // round 33: the chain with round 32's history -- its four passes a frame added to the half-size chain
             temporal: sum([networkHalf, st.covHalfB, st.covFullB, st.fillLTile, st.restF, st.hits, st.shift, st.accumT, st.final]),
             // round 55: the same with the plain accumulation, the default of round 54 and the reference
             temporalUntiled: sum([networkHalf, st.covHalfB, st.covFullB, st.fillLTile, st.restF, st.hits, st.shift, st.accum, st.final]),
             // round 54: the same two with the three-pass rest, the defaults of rounds 44-53 and the reference
             halfTwoPass: sum([networkHalf, st.covHalfB, st.covFullB, st.fillLTile, st.rest]),
             temporalTwoPass: sum([networkHalf, st.covHalfB, st.covFullB, st.fillLTile, st.rest, st.hits, st.shift, st.accum, st.final]),
             // round 44: the same three with round 31's coverage, the reference -- the defaults of rounds 43 and before
             fullUnbound: sum([networkFull, st.covFull]), halfUnbound: sum([networkHalf, st.covHalf, st.covFull, st.fillLTile, st.rest]),
             temporalUnbound: sum([networkHalf, st.covHalf, st.covFull, st.fillLTile, st.rest, st.hits, st.shift, st.accum, st.final]),
             // round 43: the same two with round 34's list fill, the default in rounds 36-42 and a reference since
             halfList: sum([networkHalf, st.covHalf, st.covFull, st.fillList, st.rest]),
             temporalList: sum([networkHalf, st.covHalf, st.covFull, st.fillList, st.rest, st.hits, st.shift, st.accum, st.final]),
             // round 36: the same two with round 31's ring fill, the reference
             halfRing: sum([networkHalf, st.covHalf, st.covFull, st.fill, st.rest]),
             temporalRing: sum([networkHalf, st.covHalf, st.covFull, st.fill, st.rest, st.hits, st.shift, st.accum, st.final]),
             // round 37: the same two with the tile fill
             halfTile: sum([networkHalf, st.covHalf, st.covFull, st.fillTile, st.rest]),
             temporalTile: sum([networkHalf, st.covHalf, st.covFull, st.fillTile, st.rest, st.hits, st.shift, st.accum, st.final]) };
}
