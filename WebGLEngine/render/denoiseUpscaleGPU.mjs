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
        for (const [k, wgsl] of [["cov", COVERAGE_WGSL], ["ring", FILL_RING_WGSL], ["left", FILL_LEFT_WGSL], ["toT", TO_T_WGSL], ["comp", COMPOSITE_WGSL], ["easu", EASU_WGSL]]) {
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
}
