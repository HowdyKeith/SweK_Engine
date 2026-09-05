// WebGLEngine/physics/xpbd/xpbdWgsl.mjs -- v4465
//
// *** THE CLOTH PILLAR'S GPU PATH, REACHABLE AT LAST. *** physics/xpbd/xpbd-distance.wgsl, cloth-collision.wgsl,
// cloth-predict.vert and cloth-finalize.vert have described a closed GPU cloth loop since v2661 and NOTHING IN THE
// TREE LOADED THEM: no module imported or fetched the four files, the WGSL census scans exported JavaScript symbols
// and so could not see them, and their bare `var<uniform> dt: f32` is a shape gfx/device.js's uniform layout does
// not express. The CPU side (xpbd.js, clothLoop.js) is exact and gated; the GPU side was prose.
//
// This module is the same three passes as physics/xpbd/clothLoop.js -- PREDICT, one SOLVE dispatch per color per
// iteration, FINALIZE -- as WGSL compute kernels the device runs, produced by functions so the corpus census and the
// cross-backend gate see them, over ONE uniform struct (`Step`) and vec4 particle records (xyz + inverse mass). The
// math is clothLoop.js's to the letter, in the same operation order, so an f32 mirror of it can be written once and
// pinned to the shipped f64 solver (frameFlat below, one implementation and one rounding knob, the shape
// tools/roundhouse/hmcGpu.mjs settled on).
//
// TWO THINGS THE OLD FILES GOT WRONG, FOUND BY WRITING THE MIRROR:
//   1. cloth-collision.wgsl did NOT accumulate lambda ("one-shot contact"); clothFrame's solveColorPass DOES, and
//      runs collisionIterations of it. The two agree only at the default of one iteration -- v3606's finding, one
//      level down. Here contact is the SAME kernel as the fixed solve with a unilateral flag in the uniform, so it
//      accumulates as the twin does.
//   2. The predict/finalize passes were WebGL2 transform-feedback shaders, so the "GPU loop" mixed a WebGL2 vertex
//      path with WebGPU compute passes that no single context could run. They are compute kernels here.
//
// WHAT IS AND IS NOT CLOSED: with radius 0 the frame is one submission and no byte comes back. With contact the
// pairs are discovered on the CPU from the solved prediction (physics/xpbd/selfCollide.js SORTS them, which is the
// determinism hinge the header there explains), so a frame with contact reads the prediction back ONCE. That is the
// design, not a shortcut: a GPU pair finder would have to sort on the device before anything downstream saw the
// pairs, and that is a later task.
//
// f32 AGAINST f64: the GPU is f32 and the shipped solver is f64, so bit equality across them is not the claim. The
// claims are (a) the GPU is DETERMINISTIC -- two runs and a within-color shuffle give the same bits, the graph-
// coloring property on the device -- and (b) the GPU is within a stated floor of the f64 solver over the gate's
// fixture, with the f32 mirror's own distance from f64 measured beside it. tools/ship/xpbdDevice-selfcheck.mjs.
"use strict";
import { colorConstraints } from "./xpbd.js";
import { findCollisionPairs } from "./selfCollide.js";
import { clothFrame } from "./clothLoop.js";

/** The Step uniform: dt, unilateral flag, particle count, pad, gravity (xyz, pad). 32 bytes, one struct on both harnesses. */
export const STEP_FLOATS = 8;
export function packStep({ dt = 0.016, unilateral = 0, count = 0, gravity = [0, -10, 0] } = {}) {
    return new Float32Array([dt, unilateral ? 1 : 0, count, 0, gravity[0], gravity[1], gravity[2], 0]);
}
/** Particles as vec4: xyz and the inverse mass in w. pos is the solver's 3N array. */
export function packParticles(pos, invMass) {
    const N = invMass.length, out = new Float32Array(4 * N);
    for (let a = 0; a < N; a++) { out[4 * a] = pos[3 * a]; out[4 * a + 1] = pos[3 * a + 1]; out[4 * a + 2] = pos[3 * a + 2]; out[4 * a + 3] = invMass[a]; }
    return out;
}
/** Constraints as { i: u32, j: u32, rest: f32, compliance: f32 } -- four words each, mixed types through one DataView. */
export function packConstraints(cons) {
    const buf = new ArrayBuffer(16 * cons.length), dv = new DataView(buf);
    cons.forEach((c, k) => { dv.setUint32(16 * k, c.i, true); dv.setUint32(16 * k + 4, c.j, true); dv.setFloat32(16 * k + 8, c.rest, true); dv.setFloat32(16 * k + 12, c.compliance, true); });
    return buf;
}
/** One u32 list per color batch, the dispatch's whole input: a thread per entry, arrayLength() as the bound. */
export function packBatches(colors) { return colors.map((b) => Uint32Array.from(b)); }

const STEP_WGSL = `struct Step { dt: f32, unilateral: f32, count: f32, pad: f32, gravity: vec4<f32> };`;

/** PREDICT: prev = pos; vel += g*dt; pred = pos + vel*dt (pinned particles copy). Bindings: pred 0 (out), step 1, pos 2, vel 3, prev 4. */
export function predictWgsl() {
    return `${STEP_WGSL}
@group(0) @binding(0) var<storage, read_write> pred: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> step: Step;
@group(0) @binding(2) var<storage, read> pos: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> vel: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> prev: array<vec4<f32>>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let a = g.x;
  if (a >= u32(step.count)) { return; }
  let p = pos[a];
  prev[a] = p;
  if (p.w > 0.0) {
    let v = vel[a].xyz + step.gravity.xyz * step.dt;
    vel[a] = vec4<f32>(v, 0.0);
    pred[a] = vec4<f32>(p.xyz + v * step.dt, p.w);
  } else {
    pred[a] = p;
  }
}
`;
}

/**
 * SOLVE one color batch: Eq (18) with the accumulated multiplier, Eq (17) on both particles, unilateral when the
 * uniform says so (contact: skip when C >= 0). No two threads in a batch share a particle -- graph coloring -- so
 * the writes are direct. Bindings: pred 0 (in/out), step 1, constraints 2, batch 3, lambda 4 (in/out).
 */
export function solveWgsl() {
    return `${STEP_WGSL}
struct Constraint { i: u32, j: u32, rest: f32, compliance: f32 };
@group(0) @binding(0) var<storage, read_write> pred: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> step: Step;
@group(0) @binding(2) var<storage, read> constraints: array<Constraint>;
@group(0) @binding(3) var<storage, read> batch: array<u32>;
@group(0) @binding(4) var<storage, read_write> lambda: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x;
  if (t >= arrayLength(&batch)) { return; }
  let ci = batch[t];
  let c = constraints[ci];
  let pa = pred[c.i];
  let pb = pred[c.j];
  let w1 = pa.w;
  let w2 = pb.w;
  let wsum = w1 + w2;
  if (wsum == 0.0) { return; }
  let d = pa.xyz - pb.xyz;
  let len = sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
  if (len < 1e-12) { return; }
  let C = len - c.rest;
  if (step.unilateral > 0.5 && C >= 0.0) { return; }
  let aTilde = c.compliance / (step.dt * step.dt);
  let dLambda = (-C - aTilde * lambda[ci]) / (wsum + aTilde);
  lambda[ci] = lambda[ci] + dLambda;
  let s = dLambda / len;
  pred[c.i] = vec4<f32>(pa.xyz + w1 * s * d, w1);
  pred[c.j] = vec4<f32>(pb.xyz - w2 * s * d, w2);
}
`;
}

/** FINALIZE: vel = (pred - prev)/dt for free particles; pos = pred. Bindings: pos 0 (out), step 1, pred 2, prev 3, vel 4. */
export function finalizeWgsl() {
    return `${STEP_WGSL}
@group(0) @binding(0) var<storage, read_write> pos: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> step: Step;
@group(0) @binding(2) var<storage, read> pred: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> prev: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> vel: array<vec4<f32>>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let a = g.x;
  if (a >= u32(step.count)) { return; }
  let p = pred[a];
  if (p.w > 0.0) { vel[a] = vec4<f32>((p.xyz - prev[a].xyz) / step.dt, 0.0); }
  pos[a] = p;
}
`;
}

// ---- The flat mirror: clothFrame's operations in the kernels' order, with one rounding knob ---------------------
// r is identity for f64 (pinned to clothFrame byte for byte by the gate) and Math.fround for the f32 mirror, whose
// distance from f64 is the floor a device tolerance is earned from. Contact goes through the same pair finder the
// twin uses, on the mirror's own prediction.
function frameFlat(buf, invMass, fixed, colors, opts, r) {
    const N = invMass.length, dt = r(opts.dt ?? 0.016), iters = opts.iterations ?? 5, g = (opts.gravity || [0, -10, 0]).map(r);
    const radius = opts.radius ?? 0, adj = opts.adj || new Set(), cellSize = opts.cellSize ?? (radius > 0 ? 2 * radius : 1);
    const collIters = opts.collisionIterations ?? 1, collCompliance = opts.collisionCompliance ?? 0;
    for (let a = 0; a < N; a++) {
        const k = 3 * a;
        buf.prev[k] = buf.pos[k]; buf.prev[k + 1] = buf.pos[k + 1]; buf.prev[k + 2] = buf.pos[k + 2];
        if (invMass[a] > 0) {
            for (let c = 0; c < 3; c++) { buf.vel[k + c] = r(buf.vel[k + c] + r(g[c] * dt)); buf.pred[k + c] = r(buf.pos[k + c] + r(buf.vel[k + c] * dt)); }
        } else { buf.pred[k] = buf.pos[k]; buf.pred[k + 1] = buf.pos[k + 1]; buf.pred[k + 2] = buf.pos[k + 2]; }
    }
    const solve = (cons, batches, lambda, iterations, unilateral) => {
        for (let it = 0; it < iterations; it++) for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];
            for (let bi = 0; bi < batch.length; bi++) {
                const ci = batch[bi], c = cons[ci];
                const w1 = r(invMass[c.i]), w2 = r(invMass[c.j]), wsum = r(w1 + w2);
                if (wsum === 0) continue;
                const ax = 3 * c.i, bx = 3 * c.j, p = buf.pred;
                const dx = r(p[ax] - p[bx]), dy = r(p[ax + 1] - p[bx + 1]), dz = r(p[ax + 2] - p[bx + 2]);
                const len = r(Math.sqrt(r(r(r(dx * dx) + r(dy * dy)) + r(dz * dz))));
                if (len < 1e-12) continue;
                const C = r(len - r(c.rest));
                if (unilateral && C >= 0) continue;
                const aTilde = r(r(c.compliance) / r(dt * dt));
                const dLambda = r(r(-C - r(aTilde * lambda[ci])) / r(wsum + aTilde));
                lambda[ci] = r(lambda[ci] + dLambda);
                const s = r(dLambda / len);
                const s1 = r(w1 * s), s2 = r(w2 * s);
                p[ax] = r(p[ax] + r(s1 * dx)); p[ax + 1] = r(p[ax + 1] + r(s1 * dy)); p[ax + 2] = r(p[ax + 2] + r(s1 * dz));
                p[bx] = r(p[bx] - r(s2 * dx)); p[bx + 1] = r(p[bx + 1] - r(s2 * dy)); p[bx + 2] = r(p[bx + 2] - r(s2 * dz));
            }
        }
    };
    solve(fixed, colors, new Float64Array(fixed.length), iters, false);
    let pairs = 0;
    if (radius > 0) {
        const found = findCollisionPairs(buf.pred, N, cellSize, 2 * radius, adj);
        const coll = found.map(([i, j]) => ({ i, j, rest: 2 * radius, compliance: collCompliance }));
        pairs = coll.length;
        solve(coll, colorConstraints(coll), new Float64Array(coll.length), collIters, true);
    }
    for (let a = 0; a < N; a++) {
        const k = 3 * a;
        if (invMass[a] > 0) for (let c = 0; c < 3; c++) buf.vel[k + c] = r(r(buf.pred[k + c] - buf.prev[k + c]) / dt);
        buf.pos[k] = buf.pred[k]; buf.pos[k + 1] = buf.pred[k + 1]; buf.pos[k + 2] = buf.pred[k + 2];
    }
    return pairs;
}
export const clothFrameF64Flat = (buf, invMass, fixed, colors, opts = {}) => frameFlat(buf, invMass, fixed, colors, opts, (x) => x);
export const clothFrameF32 = (buf, invMass, fixed, colors, opts = {}) => frameFlat(buf, invMass, fixed, colors, opts, Math.fround);

/** A fresh buffer set from an initial state, rounded through r (Math.fround for the f32 mirror's start). */
export function makeBuffers(init, r = (x) => x) {
    const n = init.pos.length;
    return { pos: Float64Array.from(init.pos, r), vel: Float64Array.from(init.vel, r), pred: new Float64Array(n), prev: new Float64Array(n) };
}

/**
 * The cloth on a gfx/device.js device. On WebGPU: three compute pipelines, the particle buffers resident, one
 * dispatch per color per iteration; on any other backend the shipped f64 clothFrame, so a page gets the same
 * handle either way and `path` says which ran. frame() is async because a frame WITH contact reads the prediction
 * back to discover pairs; without contact it awaits nothing.
 *
 *   const cloth = makeClothDevice(device, init, cons, colors, { dt, iterations, gravity, radius, adj });
 *   await cloth.frame(); const { pos, vel } = await cloth.read(); cloth.destroy();
 */
export function makeClothDevice(device, init, cons, colors, opts = {}) {
    const invMass = init.invMass, N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 5, g = opts.gravity || [0, -10, 0];
    const radius = opts.radius ?? 0, adj = opts.adj || new Set(), cellSize = opts.cellSize ?? (radius > 0 ? 2 * radius : 1);
    const collIters = opts.collisionIterations ?? 1, collCompliance = opts.collisionCompliance ?? 0;
    // The compute path runs on WebGPU, and on the null backend when asked (opts.recordOnNull), so a headless gate can
    // count the dispatches a frame makes without a GPU; everywhere else the shipped f64 twin.
    if (!(device.backend === "webgpu" || (opts.recordOnNull && device.backend === "null"))) {
        const buf = makeBuffers(init);
        return { path: "cpu", count: N, frames: 0, pairs: 0,
                 async frame() { clothFrame(buf, invMass, cons, colors, opts); this.frames++; },
                 async read() { return { pos: Float64Array.from(buf.pos), vel: Float64Array.from(buf.vel) }; },
                 destroy() {} };
    }
    const predict = device.compute({ wgsl: predictWgsl() }), solveFixed = device.compute({ wgsl: solveWgsl() }), solveColl = device.compute({ wgsl: solveWgsl() }), finalize = device.compute({ wgsl: finalizeWgsl() });
    const pos = device.buffer({ data: packParticles(init.pos, invMass), usage: "storage" });
    const vel = device.buffer({ data: packParticles(init.vel, new Float64Array(N)), usage: "storage" });
    const pred = device.buffer({ size: 16 * N, usage: "storage" }), prev = device.buffer({ size: 16 * N, usage: "storage" });
    const step = device.buffer({ data: packStep({ dt, unilateral: 0, count: N, gravity: g }), usage: "uniform" });
    const stepColl = device.buffer({ data: packStep({ dt, unilateral: 1, count: N, gravity: g }), usage: "uniform" });
    const cbuf = device.buffer({ data: new Uint8Array(packConstraints(cons)), usage: "storage" });
    const batches = packBatches(colors).map((b) => device.buffer({ data: b, usage: "storage" }));
    const lambda = device.buffer({ size: Math.max(4, 4 * cons.length), usage: "storage" });
    const zeros = new Float32Array(Math.max(1, cons.length));
    predict.bind("pred", pred).bind("step", step).bind("pos", pos).bind("vel", vel).bind("prev", prev);
    solveFixed.bind("pred", pred).bind("step", step).bind("constraints", cbuf).bind("lambda", lambda);
    finalize.bind("pos", pos).bind("step", step).bind("pred", pred).bind("prev", prev).bind("vel", vel);
    const wgN = Math.ceil(N / 64);
    let collBufs = [];
    const dropColl = () => { for (const b of collBufs) { try { b.destroy(); } catch (e) {} } collBufs = []; };
    const handle = {
        path: "compute", count: N, frames: 0, pairs: 0, colors: colors.length,
        async frame() {
            lambda.write(zeros);
            device.frame(({ pass }) => {
                pass.dispatch(predict, wgN);
                for (let it = 0; it < iters; it++) for (let c = 0; c < colors.length; c++) { solveFixed.bind("batch", batches[c]); pass.dispatch(solveFixed, Math.ceil(colors[c].length / 64)); }
            });
            if (radius > 0) {
                // The one readback: the solved prediction, for the CPU pair finder (sorted -> colored -> uploaded).
                const p4 = new Float32Array(await device.read(pred)), p3 = new Float64Array(3 * N);
                for (let a = 0; a < N; a++) { p3[3 * a] = p4[4 * a]; p3[3 * a + 1] = p4[4 * a + 1]; p3[3 * a + 2] = p4[4 * a + 2]; }
                const found = findCollisionPairs(p3, N, cellSize, 2 * radius, adj);
                const coll = found.map(([i, j]) => ({ i, j, rest: 2 * radius, compliance: collCompliance }));
                this.pairs = coll.length;
                if (coll.length) {
                    const collColors = colorConstraints(coll);
                    dropColl();
                    const ccb = device.buffer({ data: new Uint8Array(packConstraints(coll)), usage: "storage" });
                    const lamC = device.buffer({ data: new Float32Array(coll.length), usage: "storage" });
                    const cb = packBatches(collColors).map((b) => device.buffer({ data: b, usage: "storage" }));
                    collBufs = [ccb, lamC, ...cb];
                    solveColl.bind("pred", pred).bind("step", stepColl).bind("constraints", ccb).bind("lambda", lamC);
                    device.frame(({ pass }) => {
                        for (let it = 0; it < collIters; it++) for (let c = 0; c < collColors.length; c++) { solveColl.bind("batch", cb[c]); pass.dispatch(solveColl, Math.ceil(collColors[c].length / 64)); }
                        pass.dispatch(finalize, wgN);
                    });
                    this.frames++;
                    return;
                }
            }
            device.frame(({ pass }) => { pass.dispatch(finalize, wgN); });
            this.frames++;
        },
        async read() {
            const p4 = new Float32Array(await device.read(pos)), v4 = new Float32Array(await device.read(vel));
            const p = new Float64Array(3 * N), v = new Float64Array(3 * N);
            for (let a = 0; a < N; a++) for (let c = 0; c < 3; c++) { p[3 * a + c] = p4[4 * a + c]; v[3 * a + c] = v4[4 * a + c]; }
            return { pos: p, vel: v };
        },
        destroy() { dropColl(); for (const b of [pos, vel, pred, prev, step, stepColl, cbuf, lambda, ...batches]) { try { b.destroy(); } catch (e) {} } },
    };
    return handle;
}
