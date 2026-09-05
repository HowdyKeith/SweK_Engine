// WebGLEngine/physics/chaos/logisticWgsl.mjs -- v4469
//
// THE LOGISTIC MAP AS A STEP-LOOP KERNEL: one element per thread, x <- r x (1 - x), r per element, the state
// ping-ponged by render/stepLoop.mjs. It is the first consumer of the step loop and the sharpest test of it that
// exists: the map is chaotic for r near 4, so a single wrong ulp -- a step that read the buffer it should have
// written, a uniform seen one step late -- becomes a different orbit within a few dozen steps. physics/chaos/
// logistic.js is the graded map; the f32 twin here is that arithmetic with Math.fround after every operation, in
// the kernel's order, and the gate holds the device to it BIT FOR BIT over 200 steps of 1,024 orbits.
//
// `Knobs.scale` multiplies r; it is 1 unless a per-step schedule says otherwise, which is how the gate proves the
// step loop hands each step its OWN uniform (a schedule that touches one step moves every orbit after it).
"use strict";
import { logistic } from "./logistic.js";
import { makeStepLoop } from "../../render/stepLoop.mjs";

export const KNOB_FLOATS = 4;
/** The uniform: element count, r scale, the step index (for a schedule), pad. */
export function packKnobs({ count, scale = 1, step = 0 } = {}) { return new Float32Array([count, scale, step, 0]); }

/** One step of the map for every element: dst[i] = (r[i] * scale) * src[i] * (1 - src[i]). Bindings: dst 0, knobs 1, src 2, r 3. */
export function logisticStepWgsl() {
    return `struct Knobs { count: f32, scale: f32, step: f32, pad: f32 };
@group(0) @binding(0) var<storage, read_write> dst: array<f32>;
@group(0) @binding(1) var<uniform> knobs: Knobs;
@group(0) @binding(2) var<storage, read> src: array<f32>;
@group(0) @binding(3) var<storage, read> r: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= u32(knobs.count)) { return; }
  let x = src[i];
  dst[i] = (r[i] * knobs.scale) * x * (1.0 - x);
}
`;
}

/** r values spread over [lo, hi] and one seed x0 per element -- the fixture the gate and the manifest share. */
export function fixture({ count = 1024, lo = 3.4, hi = 4.0, x0 = 0.3 } = {}) {
    const r = new Float32Array(count), x = new Float32Array(count);
    for (let i = 0; i < count; i++) { r[i] = Math.fround(lo + (hi - lo) * i / (count - 1)); x[i] = Math.fround(x0 + 0.0001 * i); }
    return { count, r, x };
}

/** The f32 twin of n steps, in the kernel's order; schedule(k) gives step k's scale (1 when absent). */
export function orbitCpu({ r, x }, n, schedule = null) {
    const f = Math.fround, out = Float32Array.from(x);
    for (let k = 0; k < n; k++) { const s = f(schedule ? schedule(k) : 1);
        for (let i = 0; i < out.length; i++) { const v = out[i]; out[i] = f(f(f(r[i] * s) * v) * f(1 - v)); } }
    return out;
}
/** One step as the corpus and the manifest see it (the one-buffer signature): dst from src, no schedule. */
export function stepCpu(F) { return orbitCpu(F, 1); }

/** The map on a device through the step loop: n steps, then the orbits. The CPU twin everywhere else. */
export function makeLogisticDevice(device, F = fixture(), { schedule = null } = {}) {
    if (!(device.backend === "webgpu" || device.backend === "null")) {
        let x = Float32Array.from(F.x), steps = 0;
        return { path: "cpu", step(n = 1) { x = orbitCpu({ r: F.r, x }, n, schedule ? (k) => schedule(steps + k) : null); steps += n; }, async read() { return Float32Array.from(x); }, get steps() { return steps; }, destroy() {} };
    }
    const loop = makeStepLoop(device, { code: logisticStepWgsl(), state: F.x, names: ["src", "dst"], workgroups: Math.ceil(F.count / 64),
        buffers: schedule ? { r: { data: F.r } } : { r: { data: F.r }, knobs: { data: packKnobs({ count: F.count }), usage: "uniform" } },
        perStep: schedule ? { name: "knobs", pack: (k) => packKnobs({ count: F.count, scale: schedule(k), step: k }) } : null });
    return { path: loop.path, step: (n = 1) => loop.step(n), read: () => loop.read(), get steps() { return loop.steps; }, destroy: () => loop.destroy() };
}

/** The key: the graded map's own value at the same r, and its fixed point where one exists. */
export function keyCpu() { return { fourAt0_3: logistic(4, 0.3), fixedPointAt3: 1 - 1 / 3 }; }

// The probe manifest (docs/GPU-KERNEL-CONTRACT.md): one step, the one-buffer signature, tolerance zero.
export const PROBES = Object.freeze([Object.freeze({
    id: "logisticWgsl.logisticStepWgsl", code: () => logisticStepWgsl(), entryPoint: "main", args: Object.freeze({}),
    pack: () => packKnobs({ count: fixture().count }), inputs: () => { const F = fixture(); return [{ binding: 2, data: F.x }, { binding: 3, data: F.r }]; },
    outCount: () => fixture().count, workgroups: () => Math.ceil(fixture().count / 64), cpu: () => stepCpu(fixture()), tol: 0,
    key: () => keyCpu(),
})]);
