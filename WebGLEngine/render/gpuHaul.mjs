// WebGLEngine/render/gpuHaul.mjs -- v4300
//
// THE HAULERS' FLIGHT, INTEGRATED ON THE GPU. In a STILL world (world/universeEconomy.mjs: star systems do not
// move) a ship's whole flight is fixed the moment it departs: from, to, the departure time and the arrival time.
// So its position is a function of the clock alone, and a compute pass evaluates that lerp for every ship every
// frame from eight floats per ship that change only when a ship departs, docks or goes bankrupt. Nothing is
// read back: the CPU knows the arrival time it computed, and trades on it.
//
// The twin is the same lerp in JavaScript (gitEconomy's step() for a still world), so the gate compares GPU
// positions to the sim's own positions at f32 and demands agreement, not tolerance.
"use strict";
import { RECORD_FLOATS } from "./gpuDriven.mjs";

/** Per ship: fromX, fromY, toX, toY, t0, arriveT, radius, active. */
export const HAUL_FLOATS = 8;

export function haulWgsl() {
    return `
struct HaulInfo { time: f32, count: f32, lift: f32, pad: f32 };
@group(0) @binding(0) var<uniform> info: HaulInfo;
@group(0) @binding(1) var<storage, read> flights: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> records: array<vec4<f32>>;

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= u32(info.count)) { return; }
  let a = flights[i * 2u];        // fromX, fromY, toX, toY
  let b = flights[i * 2u + 1u];   // t0, arriveT, radius, active
  let p = clamp((info.time - b.x) / max(1e-9, b.y - b.x), 0.0, 1.0);
  let x = a.x + (a.z - a.x) * p;
  let y = a.y + (a.w - a.y) * p;
  records[i] = vec4<f32>(x, y, info.lift, b.z * b.w);
}
`;
}

/** The twin: records from the flight elements at time t. */
export function haulRecordsCpu(flights, t, lift = 0.05) {
    const n = flights.length / HAUL_FLOATS, out = new Float32Array(n * RECORD_FLOATS);
    for (let i = 0; i < n; i++) {
        const o = i * HAUL_FLOATS, p = Math.max(0, Math.min(1, (t - flights[o + 4]) / Math.max(1e-9, flights[o + 5] - flights[o + 4])));
        out.set([flights[o] + (flights[o + 2] - flights[o]) * p, flights[o + 1] + (flights[o + 3] - flights[o + 1]) * p, lift, flights[o + 6] * flights[o + 7]], i * RECORD_FLOATS);
    }
    return out;
}

/**
 * A records SOURCE for makeGpuDrivenScene() over an economy: on WebGPU the haul pass writes the buffer and the
 * elements go up only when the economy says they changed; elsewhere the twin. `advance(t)` runs it.
 */
export function makeHaulSource(device, economy, { radius = 0.12, lift = 0.05 } = {}) {
    if (economy.moving) throw new Error("gpuHaul: a moving world's flight is chased per tick on the CPU; the haul pass is for a still world");
    const count = economy.ships.length;
    let flights = economy.flightElements(radius), t = 0, uploads = 0;
    const cpu = () => haulRecordsCpu(flights, t, lift);
    const refresh = () => { if (economy.flightDirty) { flights = economy.flightElements(radius); economy.clearFlightDirty(); return true; } return false; };
    if (device.backend !== "webgpu") return { count, cpu, advance(td) { t = td; if (refresh()) uploads++; return { path: "cpu", uploads }; }, readRecords: async () => cpu(), get uploads() { return uploads; }, destroy() {} };
    const pipe = device.compute({ wgsl: haulWgsl(), entryPoint: "main" });
    const info = device.buffer({ size: 16, usage: "uniform" });
    const flBuf = device.buffer({ data: flights, usage: "storage" });
    const buffer = device.buffer({ size: count * RECORD_FLOATS * 4, usage: "storage" });
    pipe.bind("info", info).bind("flights", flBuf).bind("records", buffer);
    return {
        count, cpu, buffer,
        advance(td) { t = td; if (refresh()) { flBuf.write(flights); uploads++; } info.write(new Float32Array([td, count, lift, 0])); device.frame(({ pass }) => pass.dispatch(pipe, Math.ceil(count / 64))); return { path: "compute", uploads }; },
        readRecords: async () => new Float32Array(await device.read(buffer)),
        get uploads() { return uploads; },
        destroy() { for (const b of [info, flBuf, buffer]) { try { b.destroy(); } catch (e) {} } },
    };
}
