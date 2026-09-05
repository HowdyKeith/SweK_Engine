// WebGLEngine/render/computeRun.mjs -- v4467
//
// *** ONE WAY TO RUN A COMPUTE KERNEL THROUGH gfx/device.js, SO NO PHYSICS PAGE OR GATE BUILDS ITS OWN PIPELINE. ***
// Until this round every physics kernel that reached a GPU did it its own way: hmc-bench.html and mpm-gpu-check.html
// created adapters, modules, pipelines, bind groups and staging buffers by hand (and the second got the bind groups
// wrong, v4466); the corpus ran through two harnesses with a signature of their own; nothing under physics/ imported
// the device. This module is the slot: a kernel, its buffers BY NAME, a workgroup count, and which buffers to read.
//
//   const r = await runCompute(device, { code, entryPoint, workgroups, buffers: { P: { data, usage: "uniform" },
//                                          qin: { data }, qout: { size } }, read: ["qout"] });
//   r.qout  // ArrayBuffer
//
// The device parses the kernel's bindings, binds each named buffer (an unknown name is refused by the device, by
// name), dispatches inside one frame, and reads back through the device's padded readback. On the null backend the
// same call records buffers, binds and the dispatch, so a headless gate can count what a page would do.
//
// corpusSpec() maps the two harnesses' one-buffer signature (out at binding 0, uniforms at 1, `inputs` by binding
// index, `outInit`) onto this by the kernel's own binding names, so every corpus entry can be run through the device
// and held to the harnesses -- tools/ship/deviceCompute-selfcheck.mjs does that for all of them.
"use strict";
import { parseBindings } from "./wgslSpec.mjs";

const WORDS = (data) => {
    const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
    if (!u8) throw new Error("computeRun: a buffer's data must be an ArrayBuffer or a typed array");
    const padded = Math.max(4, Math.ceil(u8.byteLength / 4) * 4);
    const out = new Uint8Array(padded); out.set(u8); return out;
};
/** A uniform buffer's bytes: at least 16 and a multiple of 16, as both harnesses and the API want. */
export function uniformBytes(data) {
    const u8 = WORDS(data), size = Math.max(16, Math.ceil(u8.byteLength / 16) * 16);
    const out = new Uint8Array(size); out.set(u8); return out;
}

/**
 * Run one dispatch. buffers: { name: { data?, size?, usage? } } -- usage defaults to "storage", or "uniform" for a
 * binding the kernel declares var<uniform>. read: names to read back (default: every read_write storage binding).
 * Returns { [name]: ArrayBuffer, bindings, dispatched }.
 */
export async function runCompute(device, { code, entryPoint = "main", workgroups = 1, buffers = {}, read = null }) {
    if (typeof code !== "string") throw new Error("computeRun: `code` must be the kernel's WGSL text");
    const decl = parseBindings(code).filter((b) => b.group === 0 && (b.addressSpace === "storage" || b.addressSpace === "uniform"));
    for (const n of Object.keys(buffers)) if (!decl.some((b) => b.name === n)) throw new Error(`computeRun: the kernel declares no storage or uniform binding named ${JSON.stringify(n)} -- it declares ${decl.map((b) => b.name).join(", ") || "none"}`);
    const pipe = device.compute({ wgsl: code, entryPoint });
    const bufs = {};
    for (const b of decl) {
        const spec = buffers[b.name];
        if (!spec) { if (pipe.all ? pipe.all.find((x) => x.name === b.name && x.used === false) : (pipe.bindings || []).find((x) => x.name === b.name && x.used === false)) continue;
                     throw new Error(`computeRun: the kernel binds ${JSON.stringify(b.name)} and no buffer was given for it`); }
        const usage = spec.usage || (b.addressSpace === "uniform" ? "uniform" : "storage");
        const data = spec.data != null ? (usage === "uniform" ? uniformBytes(spec.data) : WORDS(spec.data)) : null;
        bufs[b.name] = device.buffer(data ? { data, usage } : { size: Math.max(4, spec.size || 4), usage });
        pipe.bind(b.name, bufs[b.name]);
    }
    const wg = Array.isArray(workgroups) ? workgroups : [workgroups];
    device.frame(({ pass }) => { pass.dispatch(pipe, wg); });
    const names = read || decl.filter((b) => b.addressSpace === "storage" && /read_write/.test(b.access || "read_write") && bufs[b.name]).map((b) => b.name);
    const out = { bindings: decl.map((b) => b.name), dispatched: wg };
    for (const n of names) { if (!bufs[n]) throw new Error(`computeRun: cannot read ${JSON.stringify(n)}: no buffer was bound to it`); out[n] = await device.read(bufs[n]); }
    for (const b of Object.values(bufs)) { try { b.destroy(); } catch (e) {} }
    return out;
}

/** The harnesses' one-buffer signature as a runCompute spec, by the kernel's own binding names. */
export function corpusSpec({ code, entryPoint = "main", outCount, uniforms = null, workgroups = 1, inputs = null, outInit = null }) {
    const decl = parseBindings(code).filter((b) => b.group === 0);
    const at = (i) => { const b = decl.find((x) => x.binding === i); if (!b) throw new Error(`computeRun: the kernel has no binding ${i}`); return b.name; };
    const buffers = {};
    buffers[at(0)] = outInit ? { data: WORDS(outInit).slice(0, Math.max(4, outCount * 4)) } : { size: Math.max(4, outCount * 4) };
    if (uniforms) buffers[at(1)] = { data: uniforms instanceof Float32Array ? uniforms : Float32Array.from(uniforms), usage: "uniform" };
    for (const inp of inputs || []) buffers[at(inp.binding)] = { data: inp.data };
    return { code, entryPoint, workgroups, buffers, read: [at(0)], outName: at(0), outCount };
}

/** Run a corpus entry's opts through the device; returns { ok, values: Float32Array } in the harnesses' shape. */
export async function runCorpusEntry(device, opts) {
    const spec = corpusSpec(opts);
    try {
        const r = await runCompute(device, spec);
        return { ok: true, values: new Float32Array(r[spec.outName]).subarray(0, opts.outCount) };
    } catch (e) { return { ok: false, reason: String(e && e.message) }; }
}
