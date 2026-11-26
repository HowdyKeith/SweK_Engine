// WebGLEngine/render/splatSortGPU.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SPLAT DEPTH SORT ON THE GRAPHICS CARD. render/splatSort.mjs sorts splats back to front on the CPU with a two-pass 16-bit radix sort (v4264:
// 14.43 ms for 500K splats, where the comparison sort it replaced took 255.87 ms), and its own header says the next step: "Above that, port to GPU compute".
// This is that port. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `splat-gpu-sort`. Keith: "start with GPU sort for splats".
//
// WHERE IT CAME FROM. PlayCanvas's portable multi-pass 4-bit radix sort (src/scene/graphics/radix-sort/compute-radix-sort-multipass.js, its prefix-sum
// kernel, and the WGSL chunks compute-radix-sort-4bit.js, compute-radix-sort-reorder.js and compute-prefix-sum.js), which PlayCanvas picked as its
// default over one-sweep after benchmarking Apple, NVIDIA and Android GPUs, because it needs no subgroups and no forward-progress guarantee. Their header
// credits "Fast 4-way parallel radix sorting on GPUs" and kishimisu/WebGPU-Radix-Sort (MIT). The WGSL below is theirs with their #ifdef for indirect
// counts removed and their {CONSTANTS} filled in here; the orchestration is rewritten against the raw WebGPU API, so it runs on the browser's device
// and on node-webgpu alike. Licence:
//
//   Copyright (c) 2011-2026 PlayCanvas Ltd.
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"),
//   to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
//   and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above
//   copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
//   WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
//   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
//   CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// WHAT IT DOES. Per 4-bit pass: a histogram per workgroup of 2048 keys, an exclusive scan of those histograms (digit-major, so the scan IS the global
// offset of each digit in each workgroup), and a ranked scatter (bitmasks and popcount) that is STABLE. Eight passes sort 32-bit keys; the first pass
// writes each key's own index as its value, so what comes out is the permutation. STABLE AND LSD, LIKE render/splatSort.mjs, SO FOR THE SAME KEYS THE
// TWO GIVE THE SAME PERMUTATION, TIES INCLUDED -- that equality is what the gate holds, not a picture.
//
// THE KEYS. `encodeDepthKeys` computes them on the card exactly as engine/SplatRenderer.js's _sort does on the CPU: -(squared distance to the camera)
// of each splat moved by the cloud's origin and scale, so ascending is far-to-near (back to front), mapped to an order-preserving uint the way
// splatSort.floatKeyToUint does. THE CARD DOES THAT ARITHMETIC IN f32 AND THE CPU IN f64 ROUNDED TO f32, so two splats almost exactly as far away can
// swap; the gate says how many and how near they were. Sorting keys handed in (`sortKeys`) has no such slack.
//
// WHAT IS NOT HERE: a renderer that draws from the sorted buffer (engine/SplatRenderer.js is WebGL2 and cannot read a WebGPU buffer; the WebGPU splat
// path is the next item), timing on a real GPU (the gate measures software Vulkan here and says so), indirect counts, one-sweep.
"use strict";

export const WG_X = 16, WG_Y = 16, THREADS = WG_X * WG_Y, PER_THREAD = 8, PER_WORKGROUP = THREADS * PER_THREAD, SCAN_ITEMS = THREADS * 2, BUCKETS = 16, BITS_PER_PASS = 4;
const fill = (src, c) => src.replace(/\{(\w+)\}/g, (_, k) => { if (!(k in c)) throw new Error(`splatSortGPU: no value for {${k}}`); return String(c[k]); });
const BASE = { WORKGROUP_SIZE_X: WG_X, WORKGROUP_SIZE_Y: WG_Y, THREADS_PER_WORKGROUP: THREADS, ELEMENTS_PER_THREAD: PER_THREAD };

// ---- PlayCanvas compute-radix-sort-4bit.js (the histogram), #ifdef USE_INDIRECT_SORT removed ----
const HISTOGRAM = `
@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> block_sums: array<u32>;
struct RadixSortUniforms { workgroupCount: u32, elementCount: u32 };
@group(0) @binding(2) var<uniform> uniforms: RadixSortUniforms;
const THREADS_PER_WORKGROUP: u32 = {THREADS_PER_WORKGROUP}u;
const WORKGROUP_SIZE_X: u32 = {WORKGROUP_SIZE_X}u;
const WORKGROUP_SIZE_Y: u32 = {WORKGROUP_SIZE_Y}u;
const CURRENT_BIT: u32 = {CURRENT_BIT}u;
const ELEMENTS_PER_THREAD: u32 = {ELEMENTS_PER_THREAD}u;
const ELEMENTS_PER_WORKGROUP: u32 = THREADS_PER_WORKGROUP * ELEMENTS_PER_THREAD;
var<workgroup> histogram: array<atomic<u32>, 16>;
@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1)
fn main(@builtin(workgroup_id) w_id: vec3<u32>, @builtin(num_workgroups) w_dim: vec3<u32>, @builtin(local_invocation_index) TID: u32) {
    let WORKGROUP_ID = w_id.x + w_id.y * w_dim.x;
    let WID = WORKGROUP_ID * ELEMENTS_PER_WORKGROUP;
    if (TID < 16u) { atomicStore(&histogram[TID], 0u); }
    workgroupBarrier();
    let elementCount = uniforms.elementCount;
    for (var r = 0u; r < ELEMENTS_PER_THREAD; r++) {
        let GID = WID + r * THREADS_PER_WORKGROUP + TID;
        let is_valid = GID < elementCount && WORKGROUP_ID < uniforms.workgroupCount;
        // every invocation issues the atomic, adding 0 when out of range (PlayCanvas: Adreno drops atomics from a partially active wave)
        let elm = input[select(0u, GID, is_valid)];
        let digit = (elm >> CURRENT_BIT) & 0xFu;
        atomicAdd(&histogram[digit], select(0u, 1u, is_valid));
    }
    workgroupBarrier();
    if (TID < 16u && WORKGROUP_ID < uniforms.workgroupCount) { block_sums[TID * uniforms.workgroupCount + WORKGROUP_ID] = atomicLoad(&histogram[TID]); }
}`;

// ---- PlayCanvas compute-prefix-sum.js (Blelloch scan, two entry points) ----
const SCAN = `
@group(0) @binding(0) var<storage, read_write> items: array<u32>;
@group(0) @binding(1) var<storage, read_write> blockSums: array<u32>;
struct PrefixSumUniforms { elementCount: u32 };
@group(0) @binding(2) var<uniform> uniforms: PrefixSumUniforms;
const WORKGROUP_SIZE_X: u32 = {WORKGROUP_SIZE_X}u;
const WORKGROUP_SIZE_Y: u32 = {WORKGROUP_SIZE_Y}u;
const THREADS_PER_WORKGROUP: u32 = {THREADS_PER_WORKGROUP}u;
const ITEMS_PER_WORKGROUP: u32 = {ITEMS_PER_WORKGROUP}u;
var<workgroup> temp: array<u32, ITEMS_PER_WORKGROUP * 2>;
@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1)
fn reduce_downsweep(@builtin(workgroup_id) w_id: vec3<u32>, @builtin(num_workgroups) w_dim: vec3<u32>, @builtin(local_invocation_index) TID: u32) {
    let WORKGROUP_ID = w_id.x + w_id.y * w_dim.x;
    let WID = WORKGROUP_ID * THREADS_PER_WORKGROUP;
    let GID = WID + TID;
    let ELM_TID = TID * 2;
    let ELM_GID = GID * 2;
    // SweK: clamped reads, for the reason given in the reorder pass
    temp[ELM_TID] = select(items[min(ELM_GID, uniforms.elementCount - 1u)], 0u, ELM_GID >= uniforms.elementCount);
    temp[ELM_TID + 1u] = select(items[min(ELM_GID + 1u, uniforms.elementCount - 1u)], 0u, ELM_GID + 1u >= uniforms.elementCount);
    var offset: u32 = 1u;
    for (var d: u32 = ITEMS_PER_WORKGROUP >> 1u; d > 0u; d >>= 1u) {
        workgroupBarrier();
        if (TID < d) { var ai: u32 = offset * (ELM_TID + 1u) - 1u; var bi: u32 = offset * (ELM_TID + 2u) - 1u; temp[bi] += temp[ai]; }
        offset *= 2u;
    }
    if (TID == 0u) { let last_offset = ITEMS_PER_WORKGROUP - 1u; blockSums[WORKGROUP_ID] = temp[last_offset]; temp[last_offset] = 0u; }
    for (var d: u32 = 1u; d < ITEMS_PER_WORKGROUP; d *= 2u) {
        offset >>= 1u;
        workgroupBarrier();
        if (TID < d) { var ai: u32 = offset * (ELM_TID + 1u) - 1u; var bi: u32 = offset * (ELM_TID + 2u) - 1u; let t: u32 = temp[ai]; temp[ai] = temp[bi]; temp[bi] += t; }
    }
    workgroupBarrier();
    if (ELM_GID < uniforms.elementCount) { items[ELM_GID] = temp[ELM_TID]; }
    if (ELM_GID + 1u < uniforms.elementCount) { items[ELM_GID + 1u] = temp[ELM_TID + 1u]; }
}
@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1)
fn add_block_sums(@builtin(workgroup_id) w_id: vec3<u32>, @builtin(num_workgroups) w_dim: vec3<u32>, @builtin(local_invocation_index) TID: u32) {
    let WORKGROUP_ID = w_id.x + w_id.y * w_dim.x;
    let WID = WORKGROUP_ID * THREADS_PER_WORKGROUP;
    let GID = WID + TID;
    let ELM_ID = GID * 2u;
    if (ELM_ID >= uniforms.elementCount) { return; }
    let blockSum = blockSums[WORKGROUP_ID];
    items[ELM_ID] += blockSum;
    if (ELM_ID + 1u >= uniforms.elementCount) { return; }
    items[ELM_ID + 1u] += blockSum;
}`;

// ---- PlayCanvas compute-radix-sort-reorder.js (the ranked, stable scatter), #ifdef USE_INDIRECT_SORT removed ----
const REORDER = `
@group(0) @binding(0) var<storage, read> inputKeys: array<u32>;
@group(0) @binding(1) var<storage, read_write> outputKeys: array<u32>;
@group(0) @binding(2) var<storage, read> prefix_block_sum: array<u32>;
@group(0) @binding(3) var<storage, read> inputValues: array<u32>;
@group(0) @binding(4) var<storage, read_write> outputValues: array<u32>;
struct RadixSortUniforms { workgroupCount: u32, elementCount: u32 };
@group(0) @binding(5) var<uniform> uniforms: RadixSortUniforms;
const THREADS_PER_WORKGROUP: u32 = {THREADS_PER_WORKGROUP}u;
const WORKGROUP_SIZE_X: u32 = {WORKGROUP_SIZE_X}u;
const WORKGROUP_SIZE_Y: u32 = {WORKGROUP_SIZE_Y}u;
const CURRENT_BIT: u32 = {CURRENT_BIT}u;
const IS_FIRST_PASS: u32 = {IS_FIRST_PASS}u;
const IS_LAST_PASS: u32 = {IS_LAST_PASS}u;
const ELEMENTS_PER_THREAD: u32 = {ELEMENTS_PER_THREAD}u;
const ELEMENTS_PER_WORKGROUP: u32 = THREADS_PER_WORKGROUP * ELEMENTS_PER_THREAD;
var<workgroup> digit_masks: array<atomic<u32>, 128>;
var<workgroup> digit_offsets: array<u32, 16>;
@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1)
fn main(@builtin(workgroup_id) w_id: vec3<u32>, @builtin(num_workgroups) w_dim: vec3<u32>, @builtin(local_invocation_index) TID: u32) {
    let WORKGROUP_ID = w_id.x + w_id.y * w_dim.x;
    let WID = WORKGROUP_ID * ELEMENTS_PER_WORKGROUP;
    let word_idx = TID >> 5u;
    let bit_idx = TID & 31u;
    if (TID < 16u) { digit_offsets[TID] = 0u; }
    if (TID < 128u) { atomicStore(&digit_masks[TID], 0u); }
    workgroupBarrier();
    let elementCount = uniforms.elementCount;
    for (var round = 0u; round < ELEMENTS_PER_THREAD; round++) {
        let GID = WID + round * THREADS_PER_WORKGROUP + TID;
        let is_valid = GID < elementCount;
        // SweK: index with a clamped GID, as PlayCanvas's own histogram does. WGSL's select() evaluates BOTH arms, so a select() of the key at GID
        // still READ past the end for an out-of-range thread; on a driver without robust buffer access that is a read of someone else's memory.
        let SAFE = select(0u, GID, is_valid);
        let k = select(0u, inputKeys[SAFE], is_valid);
        let digit = select(16u, (k >> CURRENT_BIT) & 0xFu, is_valid);
        let v = select(0u, select(inputValues[SAFE], GID, IS_FIRST_PASS == 1u), is_valid);
        atomicOr(&digit_masks[select(0u, digit, is_valid) * 8u + word_idx], select(0u, 1u << bit_idx, is_valid));
        workgroupBarrier();
        if (is_valid) {
            let base = digit * 8u;
            var local_prefix = digit_offsets[digit];
            for (var w = 0u; w < word_idx; w++) { local_prefix += countOneBits(atomicLoad(&digit_masks[base + w])); }
            local_prefix += countOneBits(atomicLoad(&digit_masks[base + word_idx]) & ((1u << bit_idx) - 1u));
            let pid = digit * uniforms.workgroupCount + WORKGROUP_ID;
            let sorted_position = prefix_block_sum[pid] + local_prefix;
            if (IS_LAST_PASS == 0u) { outputKeys[sorted_position] = k; }
            outputValues[sorted_position] = v;
        }
        if (round < ELEMENTS_PER_THREAD - 1u) {
            workgroupBarrier();
            if (TID < 16u) {
                var count = 0u;
                for (var w = 0u; w < 8u; w++) { let idx = TID * 8u + w; count += countOneBits(atomicLoad(&digit_masks[idx])); atomicStore(&digit_masks[idx], 0u); }
                digit_offsets[TID] += count;
            }
            workgroupBarrier();
        }
    }
}`;

// ---- SweK's: the depth key engine/SplatRenderer.js computes, on the card ----
export const DEPTH_KEYS = `
@group(0) @binding(0) var<storage, read> positions: array<f32>;
@group(0) @binding(1) var<storage, read_write> keys: array<u32>;
struct DepthUniforms { camera: vec4<f32>, origin: vec4<f32>, count: u32, rowWidth: u32 };   // origin.w = the cloud's scale
@group(0) @binding(2) var<uniform> u: DepthUniforms;
@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) g: vec3<u32>) {
    let i = g.x + g.y * u.rowWidth;
    if (i >= u.count) { return; }
    let d = vec3<f32>(positions[i * 3u], positions[i * 3u + 1u], positions[i * 3u + 2u]) * u.origin.w + u.origin.xyz - u.camera.xyz;
    let b = bitcast<u32>(-(d.x * d.x + d.y * d.y + d.z * d.z));   // -(squared distance): ascending is far to near, back to front
    keys[i] = select(b ^ 0x80000000u, ~b, (b & 0x80000000u) != 0u);   // splatSort.floatKeyToUint: order-preserving f32 -> u32
}`;

/** The filled WGSL of every kernel, for a compile check. Pure. */
export function shaders(bits = 32) {
    const passes = bits / BITS_PER_PASS, out = { scan: fill(SCAN, { ...BASE, ITEMS_PER_WORKGROUP: SCAN_ITEMS }), depth: DEPTH_KEYS, histogram: [], reorder: [] };
    for (let p = 0; p < passes; p++) {
        out.histogram.push(fill(HISTOGRAM, { ...BASE, CURRENT_BIT: p * BITS_PER_PASS }));
        out.reorder.push(fill(REORDER, { ...BASE, CURRENT_BIT: p * BITS_PER_PASS, IS_FIRST_PASS: p === 0 ? 1 : 0, IS_LAST_PASS: p === passes - 1 ? 1 : 0 }));
    }
    return out;
}

/** The scan levels for `n` items: sizes [n, ceil(n/512), ...] down to one block. Pure. */
export function scanLevels(n) { const L = [n]; while (L[L.length - 1] > SCAN_ITEMS) L.push(Math.ceil(L[L.length - 1] / SCAN_ITEMS)); return L; }
/** A 1-D count of workgroups as [x, y] within the device's per-dimension limit. Pure. */
export function grid(count, max = 65535) { return count <= max ? [count, 1] : [max, Math.ceil(count / max)]; }

/**
 * A GPU radix sort for up to `capacity` keys on `device` (a GPUDevice: the browser's or node-webgpu's). `usage` is GPUBufferUsage (pass it from
 * node-webgpu's globals; the browser has it on globalThis). `bits` (32, or a multiple of 4) is how many low bits of each key are sorted.
 * Returns { keys, indices (after a sort, the GPUBuffer holding the permutation), encodeDepthKeys, encode, sortKeys, sortDepths, destroy }.
 */
export function createGpuRadixSort(device, { capacity, bits = 32, usage = globalThis.GPUBufferUsage, mapMode = globalThis.GPUMapMode } = {}) {
    if (!(capacity > 0)) throw new Error("splatSortGPU: capacity must be above 0");
    if (!(bits > 0 && bits <= 32 && bits % BITS_PER_PASS === 0)) throw new Error("splatSortGPU: bits must be 4 to 32 in steps of 4");
    const U = usage, S = shaders(bits), passes = bits / BITS_PER_PASS, wgMax = Math.ceil(capacity / PER_WORKGROUP);
    const buf = (size, extra = 0) => device.createBuffer({ size: Math.max(16, size * 4), usage: U.STORAGE | U.COPY_SRC | U.COPY_DST | extra });
    const keysA = buf(capacity), keysB = buf(capacity), valsA = buf(capacity), valsB = buf(capacity);
    const levels = scanLevels(BUCKETS * wgMax), scanBufs = levels.map((n, i) => (i === 0 ? buf(n) : buf(n))), scanTail = buf(1);
    const sortUni = device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST }), scanUnis = levels.map(() => device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST }));
    const depthUni = device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    const pipe = (code, entryPoint = "main") => device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code }), entryPoint } });
    const P = { hist: S.histogram.map((c) => pipe(c)), reorder: S.reorder.map((c) => pipe(c)), scan: pipe(S.scan, "reduce_downsweep"), add: pipe(S.scan, "add_block_sums"), depth: pipe(S.depth) };
    const group = (p, list) => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: list.map((buffer, binding) => ({ binding, resource: { buffer } })) });
    // pass p reads (keys, vals) of its parity and writes the other; pass 0 reads keysA and makes its own values
    const io = (p) => (p % 2 === 0 ? [keysA, valsA, keysB, valsB] : [keysB, valsB, keysA, valsA]);
    const G = {
        hist: P.hist.map((pp, p) => group(pp, [io(p)[0], scanBufs[0], sortUni])),
        reorder: P.reorder.map((pp, p) => { const [ki, vi, ko, vo] = io(p); return group(pp, [ki, ko, scanBufs[0], vi, vo, sortUni]); }),
        scan: levels.map((_, l) => group(P.scan, [scanBufs[l], l + 1 < levels.length ? scanBufs[l + 1] : scanTail, scanUnis[l]])),
        add: levels.map((_, l) => (l + 1 < levels.length ? group(P.add, [scanBufs[l], scanBufs[l + 1], scanUnis[l]]) : null)),
    };
    const result = io(passes - 1)[3];   // the values buffer the last pass writes

    /** Encode the depth keys of `count` splats from `positions` (a GPUBuffer of x,y,z f32 triples) into the sort's key buffer. */
    function encodeDepthKeys(encoder, positions, count, { camera, origin = [0, 0, 0], scale = 1, timer = null }) {
        const [x, y] = grid(Math.ceil(count / 256));
        device.queue.writeBuffer(depthUni, 0, new Float32Array([camera[0], camera[1], camera[2], 0, origin[0], origin[1], origin[2], scale]));
        device.queue.writeBuffer(depthUni, 32, new Uint32Array([count, x * 256, 0, 0]));
        const cp = encoder.beginComputePass(timer ? { timestampWrites: timer.writes("keys") } : undefined); cp.setPipeline(P.depth); cp.setBindGroup(0, group(P.depth, [positions, keysA, depthUni])); cp.dispatchWorkgroups(x, y); cp.end();
    }
    /** Encode the sort of the first `count` keys in the key buffer. Afterwards `indices` holds the permutation, ascending by key. */
    function encode(encoder, count, { timer = null } = {}) {   // `timer` (render/gpuTimer.mjs): every pass of the sort timed under the label "sort"
        const tw = () => (timer ? { timestampWrites: timer.writes("sort") } : undefined);
        if (!(count > 0 && count <= capacity)) throw new Error(`splatSortGPU: count ${count} is outside 1-${capacity}`);
        const wg = Math.ceil(count / PER_WORKGROUP), lv = scanLevels(BUCKETS * wg), [gx, gy] = grid(wg);
        device.queue.writeBuffer(sortUni, 0, new Uint32Array([wg, count, 0, 0]));
        lv.forEach((n, l) => device.queue.writeBuffer(scanUnis[l], 0, new Uint32Array([n, 0, 0, 0])));
        for (let p = 0; p < passes; p++) {
            let cp = encoder.beginComputePass(tw()); cp.setPipeline(P.hist[p]); cp.setBindGroup(0, G.hist[p]); cp.dispatchWorkgroups(gx, gy); cp.end();
            for (let l = 0; l < lv.length; l++) { const [sx, sy] = grid(Math.ceil(lv[l] / SCAN_ITEMS)); cp = encoder.beginComputePass(tw()); cp.setPipeline(P.scan); cp.setBindGroup(0, G.scan[l]); cp.dispatchWorkgroups(sx, sy); cp.end(); }
            for (let l = lv.length - 2; l >= 0; l--) { const [sx, sy] = grid(Math.ceil(lv[l] / SCAN_ITEMS)); cp = encoder.beginComputePass(tw()); cp.setPipeline(P.add); cp.setBindGroup(0, G.add[l]); cp.dispatchWorkgroups(sx, sy); cp.end(); }
            cp = encoder.beginComputePass(tw()); cp.setPipeline(P.reorder[p]); cp.setBindGroup(0, G.reorder[p]); cp.dispatchWorkgroups(gx, gy); cp.end();
        }
    }
    async function readBack(src, count) {
        const rb = device.createBuffer({ size: Math.max(16, count * 4), usage: U.COPY_DST | U.MAP_READ });
        const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(src, 0, rb, 0, count * 4); device.queue.submit([enc.finish()]);
        await rb.mapAsync(mapMode.READ); const out = new Uint32Array(rb.getMappedRange().slice(0, count * 4)); rb.unmap(); rb.destroy(); return out;
    }
    /** Sort `keys` (a Uint32Array) on the card; resolves to the permutation as a Uint32Array. */
    async function sortKeys(keys) {
        device.queue.writeBuffer(keysA, 0, keys);
        const enc = device.createCommandEncoder(); encode(enc, keys.length); device.queue.submit([enc.finish()]);
        return readBack(result, keys.length);
    }
    /** Depth keys and sort on the card from `positions` (a Float32Array of x,y,z); resolves to { indices, keys } (keys as the card made them). */
    async function sortDepths(positions, view) {
        const count = positions.length / 3, pb = device.createBuffer({ size: Math.max(16, positions.byteLength), usage: U.STORAGE | U.COPY_DST });
        device.queue.writeBuffer(pb, 0, positions);
        let enc = device.createCommandEncoder(); encodeDepthKeys(enc, pb, count, view); device.queue.submit([enc.finish()]);
        const keys = await readBack(keysA, count);
        enc = device.createCommandEncoder(); encode(enc, count); device.queue.submit([enc.finish()]);
        const indices = await readBack(result, count); pb.destroy(); return { indices, keys };
    }
    function destroy() { for (const b of [keysA, keysB, valsA, valsB, scanTail, sortUni, depthUni, ...scanBufs, ...scanUnis]) b.destroy(); }
    return { keys: keysA, indices: result, passes, encodeDepthKeys, encode, sortKeys, sortDepths, destroy };
}
