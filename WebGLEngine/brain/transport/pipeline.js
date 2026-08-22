// prime-transport-deterministic/pipeline.js
//
// Node / WebGPU orchestration for the three-pass deterministic compaction. RIG-ONLY: this needs a real GPU device
// (navigator.gpu, or @webgpu/node in Node). It cannot run in a CPU-only sandbox, which is exactly why the algorithm
// is also implemented and gated on the CPU in primeTransport.js -- run runCompactionGPU beside compact() from the
// twin and assert the outputs are byte-identical (parityCheck below). If they ever diverge, the GPU port is wrong,
// not the reference.
//
// Struct layouts (must match the WGSL):
//   Candidate         : u32 state_id, u32 parent_tuple_index, f32 score          -> 12 bytes
//   HistoryTuple      : array<u32,4> steps                                        -> 16 bytes
//   TransportUniforms : u32 num_states, u32 max_survivors, f32 threshold, u32 pad -> 16 bytes

import { compact, packWheel } from "./primeTransport.js";
export function packWheelBits(matrix) { return packWheel(matrix); }

const readText = async (p) => (await import("node:fs")).readFileSync(new URL(p, import.meta.url), "utf8");

export function packCandidates(candidates) {
    const buf = new ArrayBuffer(candidates.length * 12);
    const u = new Uint32Array(buf), f = new Float32Array(buf);
    for (let i = 0; i < candidates.length; i++) {
        u[i * 3 + 0] = candidates[i].stateId >>> 0;
        u[i * 3 + 1] = candidates[i].parentTupleIndex >>> 0;
        f[i * 3 + 2] = candidates[i].score;
    }
    return new Uint8Array(buf);
}
export function packTuplets(tuplets) {
    const u = new Uint32Array(tuplets.length * 4);
    for (let i = 0; i < tuplets.length; i++) for (let s = 0; s < 4; s++) u[i * 4 + s] = tuplets[i].steps[s] >>> 0;
    return u;
}
export function packUniforms(numStates, maxSurvivors, threshold) {
    const buf = new ArrayBuffer(16), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = numStates >>> 0; u[1] = maxSurvivors >>> 0; f[2] = threshold; u[3] = 0;
    return new Uint8Array(buf);
}

export async function initPrimeTransportPipeline(device) {
    const mk = (entries) => device.createBindGroupLayout({ entries });
    const S = GPUShaderStage.COMPUTE, ro = { type: "read-only-storage" }, rw = { type: "storage" }, un = { type: "uniform" };
    const filterLayout = mk([0, 1, 2].map((b) => ({ binding: b, visibility: S, buffer: ro }))
        .concat([{ binding: 3, visibility: S, buffer: un }, { binding: 4, visibility: S, buffer: rw }]));
    const scanLayout = mk([{ binding: 0, visibility: S, buffer: rw }, { binding: 1, visibility: S, buffer: rw }]);
    const scatterLayout = mk([{ binding: 0, visibility: S, buffer: ro }, { binding: 1, visibility: S, buffer: ro },
        { binding: 2, visibility: S, buffer: ro }, { binding: 3, visibility: S, buffer: un }, { binding: 4, visibility: S, buffer: rw }]);
    const pipe = async (layout, file) => device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module: device.createShaderModule({ code: await readText("./shaders/" + file) }), entryPoint: "main" },
    });
    return {
        layouts: { filterLayout, scanLayout, scatterLayout },
        filter: await pipe(filterLayout, "filter.wgsl"),
        scan: await pipe(scanLayout, "scan.wgsl"),
        scatter: await pipe(scatterLayout, "scatter.wgsl"),
    };
}

// Full dispatch: filter -> scan -> scatter. Returns the dense survivor list (Uint32Array of max_survivors) and count.
// NOTE: the scan pass is single-workgroup (<= 1024 candidates). Assert N <= 1024 here until the multi-block scan lands.
export async function runCompactionGPU(device, pipes, { candidates, wheelMatrix, tuplets, numStates, maxSurvivors, threshold }) {
    const N = candidates.length;
    if (N > 1024) throw new Error("prime-transport scan is single-workgroup; N=" + N + " > 1024. Use a multi-block scan or the CPU twin.");
    const B = (data, usage) => { const b = device.createBuffer({ size: Math.max(4, data.byteLength), usage }); device.queue.writeBuffer(b, 0, data); return b; };
    const ST = GPUBufferUsage.STORAGE, CP = GPUBufferUsage.COPY_SRC, CD = GPUBufferUsage.COPY_DST, UN = GPUBufferUsage.UNIFORM;
    const candBuf = B(packCandidates(candidates), ST | CD);
    const wheelBuf = B(wheelMatrix, ST | CD);
    const tupBuf = B(packTuplets(tuplets), ST | CD);
    const uniBuf = B(packUniforms(numStates, maxSurvivors, threshold), UN | CD);
    const flagsBuf = device.createBuffer({ size: 4 * N, usage: ST | CP | CD });
    const offBuf = device.createBuffer({ size: 4 * N, usage: ST | CP });
    const outBuf = device.createBuffer({ size: 4 * maxSurvivors, usage: ST | CP });
    const bg = (layout, arr) => device.createBindGroup({ layout, entries: arr.map((b, i) => ({ binding: i, resource: { buffer: b } })) });

    const enc = device.createCommandEncoder();
    let pass = enc.beginComputePass();
    pass.setPipeline(pipes.filter); pass.setBindGroup(0, bg(pipes.layouts.filterLayout, [candBuf, wheelBuf, tupBuf, uniBuf, flagsBuf]));
    pass.dispatchWorkgroups(Math.ceil(N / 64)); pass.end();
    pass = enc.beginComputePass();
    pass.setPipeline(pipes.scan); pass.setBindGroup(0, bg(pipes.layouts.scanLayout, [flagsBuf, offBuf]));
    pass.dispatchWorkgroups(1); pass.end();
    pass = enc.beginComputePass();
    pass.setPipeline(pipes.scatter); pass.setBindGroup(0, bg(pipes.layouts.scatterLayout, [candBuf, flagsBuf, offBuf, uniBuf, outBuf]));
    pass.dispatchWorkgroups(Math.ceil(N / 64)); pass.end();

    const readback = device.createBuffer({ size: 4 * maxSurvivors, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const flagRead = device.createBuffer({ size: 4 * N, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyBufferToBuffer(outBuf, 0, readback, 0, 4 * maxSurvivors);
    enc.copyBufferToBuffer(flagsBuf, 0, flagRead, 0, 4 * N);
    device.queue.submit([enc.finish()]);
    await readback.mapAsync(GPUMapMode.READ); await flagRead.mapAsync(GPUMapMode.READ);
    const survivors = new Uint32Array(readback.getMappedRange().slice(0));
    const flags = new Uint32Array(flagRead.getMappedRange().slice(0));
    let count = 0; for (let i = 0; i < N; i++) count += flags[i];
    return { survivors, count: Math.min(count, maxSurvivors) };
}

// RIG PARITY CHECK: the GPU output MUST equal the CPU twin byte-for-byte. Run this once on Galaxina after wiring.
export async function parityCheck(device, pipes, problem) {
    const gpu = await runCompactionGPU(device, pipes, problem);
    const cpu = compact(problem.candidates, problem.wheelMatrix, problem.tuplets, problem.numStates, problem.threshold, problem.maxSurvivors);
    let identical = gpu.count === cpu.count;
    for (let i = 0; i < gpu.survivors.length && identical; i++) if (gpu.survivors[i] !== cpu.survivors[i]) identical = false;
    return { identical, gpu, cpu };
}

// ---- MULTI-BLOCK (N > 1024) deterministic compaction: three passes, no atomics -----------------------------------
// Mirrors compactBlocked(..., "scan") in the twin. RIG-ONLY (needs a GPU). BLOCK_SIZE must match the WGSL (256).
const BLOCK_SIZE = 256;

export async function initMultiBlockPipeline(device) {
    const S = GPUShaderStage.COMPUTE, ro = { type: "read-only-storage" }, rw = { type: "storage" }, un = { type: "uniform" };
    const mk = (arr) => device.createBindGroupLayout({ entries: arr.map((t, i) => ({ binding: i, visibility: S, buffer: t })) });
    const aLayout = mk([ro, ro, ro, un, rw, rw, rw]);         // candidates, wheelbits, tuplets, uniforms | local_offsets, flags, block_counts
    const bLayout = mk([ro, rw]);                             // block_counts | block_bases
    const cLayout = mk([ro, ro, ro, ro, un, rw]);             // candidates, flags, local_offsets, block_bases, uniforms | out
    const pipe = async (layout, file) => device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module: device.createShaderModule({ code: await readText("./shaders/" + file) }), entryPoint: "main" },
    });
    return {
        layouts: { aLayout, bLayout, cLayout },
        passA: await pipe(aLayout, "mb-scan-block.wgsl"),
        passB: await pipe(bLayout, "mb-scan-blocks.wgsl"),
        passC: await pipe(cLayout, "mb-scatter.wgsl"),
    };
}

export async function runMultiBlockGPU(device, pipes, { candidates, wheelMatrix, tuplets, numStates, maxSurvivors, threshold }) {
    const N = candidates.length, nBlocks = Math.ceil(N / BLOCK_SIZE);
    if (nBlocks > 1024) throw new Error("multi-block scan handles up to 1024 blocks (N<=262144); recurse pass B for more.");
    const packedWheel = packWheelBits(wheelMatrix);
    const B = (data, usage) => { const b = device.createBuffer({ size: Math.max(4, data.byteLength), usage }); device.queue.writeBuffer(b, 0, data); return b; };
    const ST = GPUBufferUsage.STORAGE, CP = GPUBufferUsage.COPY_SRC, CD = GPUBufferUsage.COPY_DST, UN = GPUBufferUsage.UNIFORM;
    const cand = B(packCandidates(candidates), ST | CD);
    const wheel = B(packedWheel, ST | CD);
    const tup = B(packTuplets(tuplets), ST | CD);
    const uni = B(packUniformsPacked(numStates, maxSurvivors, threshold, wheelMatrix.length), UN | CD);
    const localOff = device.createBuffer({ size: 4 * N, usage: ST });
    const flags = device.createBuffer({ size: 4 * N, usage: ST });
    const blkCounts = device.createBuffer({ size: 4 * nBlocks, usage: ST });
    const blkBases = device.createBuffer({ size: 4 * nBlocks, usage: ST });
    const out = device.createBuffer({ size: 4 * maxSurvivors, usage: ST | CP });
    const bg = (layout, arr) => device.createBindGroup({ layout, entries: arr.map((b, i) => ({ binding: i, resource: { buffer: b } })) });

    const enc = device.createCommandEncoder();
    let pass = enc.beginComputePass();
    pass.setPipeline(pipes.passA); pass.setBindGroup(0, bg(pipes.layouts.aLayout, [cand, wheel, tup, uni, localOff, flags, blkCounts]));
    pass.dispatchWorkgroups(nBlocks); pass.end();
    pass = enc.beginComputePass();
    pass.setPipeline(pipes.passB); pass.setBindGroup(0, bg(pipes.layouts.bLayout, [blkCounts, blkBases]));
    pass.dispatchWorkgroups(1); pass.end();
    pass = enc.beginComputePass();
    pass.setPipeline(pipes.passC); pass.setBindGroup(0, bg(pipes.layouts.cLayout, [cand, flags, localOff, blkBases, uni, out]));
    pass.dispatchWorkgroups(nBlocks); pass.end();

    const rb = device.createBuffer({ size: 4 * maxSurvivors, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyBufferToBuffer(out, 0, rb, 0, 4 * maxSurvivors);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    return new Uint32Array(rb.getMappedRange().slice(0));
}

// packUniforms with wheel_len (logical) in the 4th slot, matching the bit-packed shaders
export function packUniformsPacked(numStates, maxSurvivors, threshold, wheelLen) {
    const buf = new ArrayBuffer(16), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = numStates >>> 0; u[1] = maxSurvivors >>> 0; f[2] = threshold; u[3] = wheelLen >>> 0;
    return new Uint8Array(buf);
}
