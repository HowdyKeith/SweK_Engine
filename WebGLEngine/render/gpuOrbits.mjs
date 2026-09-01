// WebGLEngine/render/gpuOrbits.mjs -- v4299 (Level 12)
//
// LEVEL 12: THE ORRERY'S BODIES PLACED BY THE GPU. A compute pass takes each body's orbital elements -- axis,
// period, phase, radius, the numbers world/orrery.mjs and world/orreryView.mjs already derive from the vendor
// tree -- and writes the instance record (position, radius) for the current time straight into the buffer
// the cull pass reads. Orbit -> cull -> indirect draw, three dispatches and no CPU per body per frame.
//
// *** THE ANGLE IS orreryView.positionAt()'s, TO THE LETTER. *** phase + 2*PI*t/period, no speed field, no
// per-body multiplier. The CPU twin here IS positionAt, so the GPU's picture cannot drift from the 2D one
// without the gate saying so; what can differ is sin/cos at f32, and that is measured rather than tolerated.
//
// The orbit plane is XY with z = 0 -- the 2D orrery's plane -- so a camera on +z looking down sees the page's
// picture and a tilted camera sees the same system with depth. Bodies are records; SweK itself is one too, at
// the centre with a = 0, so the sun is drawn by the same pipeline as its planets.
"use strict";
import { positionAt, phaseFor } from "../world/orreryView.mjs";
import { RECORD_FLOATS } from "./gpuDriven.mjs";

/** One body's elements in the buffer: a, period, phase, radius. */
export const ELEMENT_FLOATS = 4;

export function orbitWgsl() {
    return `
struct OrbitInfo { time: f32, count: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<uniform> info: OrbitInfo;
@group(0) @binding(1) var<storage, read> elements: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> records: array<vec4<f32>>;

const TWO_PI: f32 = 6.283185307179586;

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= u32(info.count)) { return; }
  let e = elements[i];
  // The turn count is reduced BEFORE the multiply: sin/cos at f32 lose accuracy with the argument's size, and
  // 2*PI*t/period grows without bound. fract() keeps the argument under 4*PI; positionAt's f64 does not need
  // to, and the two agree to the same angle exactly in the mathematics.
  var angle = e.z;
  if (e.y > 0.0) { angle = angle + TWO_PI * fract(info.time / e.y); }
  records[i] = vec4<f32>(e.x * cos(angle), e.x * sin(angle), 0.0, e.w);
}
`;
}

/** Elements from a buildOrrery() system: the centre first (a = 0, still), then every body. */
export function elementsOf(system, { centreRadius = 0.6 } = {}) {
    const bodies = system.bodies || [];
    const el = new Float32Array((bodies.length + 1) * ELEMENT_FLOATS);
    el.set([0, 0, 0, centreRadius], 0);
    bodies.forEach((b, i) => el.set([b.a, b.period, phaseFor(b.name), b.radius], (i + 1) * ELEMENT_FLOATS));
    return { elements: el, count: bodies.length + 1, names: [system.centre || "SweK", ...bodies.map((b) => b.name)] };
}

/** The twin: the records at time t, from the same elements, through positionAt. */
export function orbitRecordsCpu(system, tDays) {
    const bodies = system.bodies || [], out = new Float32Array((bodies.length + 1) * RECORD_FLOATS);
    out.set([0, 0, 0, 0.6], 0);
    bodies.forEach((b, i) => { const p = positionAt(b, tDays); out.set([p.x, p.y, 0, b.radius], (i + 1) * RECORD_FLOATS); });
    return out;
}

/**
 * A records SOURCE for makeGpuDrivenScene(): on WebGPU a buffer the orbit pass writes, everywhere the twin.
 * `advance(tDays)` runs the pass (or nothing, on the twin route -- the cpu() closure reads `t`).
 */
export function makeOrbitSource(device, system, opts = {}) {
    const { elements, count, names } = elementsOf(system, opts);
    let t = 0;
    const cpu = () => orbitRecordsCpu(system, t);
    if (device.backend !== "webgpu") return { count, cpu, names, advance(td) { t = td; return { path: "cpu" }; }, readRecords: async () => cpu(), destroy() {} };
    const pipe = device.compute({ wgsl: orbitWgsl(), entryPoint: "main" });
    const info = device.buffer({ size: 16, usage: "uniform" });
    const elBuf = device.buffer({ data: elements, usage: "storage" });
    const buffer = device.buffer({ size: count * RECORD_FLOATS * 4, usage: "storage" });
    pipe.bind("info", info).bind("elements", elBuf).bind("records", buffer);
    return {
        count, cpu, names, buffer,
        /** Write the time and dispatch the orbit pass. Runs as its own submission so the cull's frame sees it. */
        advance(td) { t = td; info.write(new Float32Array([td, count, 0, 0])); device.frame(({ pass }) => pass.dispatch(pipe, Math.ceil(count / 64))); return { path: "compute" }; },
        readRecords: async () => new Float32Array(await device.read(buffer)),
        destroy() { for (const b of [info, elBuf, buffer]) { try { b.destroy(); } catch (e) {} } },
    };
}
