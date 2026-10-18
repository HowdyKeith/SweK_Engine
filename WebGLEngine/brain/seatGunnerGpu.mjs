// WebGLEngine/brain/seatGunnerGpu.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SEAT NETWORKS OF A FIGHT, DECIDED ON THE GPU IN ONE BATCH: a capital ship's thirteen gun seats (two ships' twenty-six) each have a network behind their sight (brain/seatGunnerPolicy.mjs: the fruit fly's escape circuit; brain/seatGunnerMlp.mjs: the GPU Brain's plain network),
// and brain/spaceArena.mjs's TWO-PHASE tick asks them all at once: every seat first does the part that is not the network (its sight: where to point, the twelve features), the arena hands the lot to a batch function, and every seat then takes its answer. The batch function
// here runs the lot through brain/mlp.js's BatchedMLP -- the GPU Brain's own machinery, one dispatch per layer for the whole batch -- instead of one forward pass per seat on the CPU. It takes a GPUDevice from the caller, as brain/pilotFlightGpu.mjs does, and never asks for one.
//
//   const batch = gpuBatcher(device);                                  // jobs -> y rows
//   await stepSpaceArenaAsync(arena, batch);                           // one tick, the seats' networks on the device
//
// *** WHAT THE GPU IS AND IS NOT DOING HERE, SAID PLAINLY. *** A seat's network is a few thousand multiply-adds a tick, twenty-six of them a tick for two ships: the CPU does that in microseconds and a GPU submission with a read-back costs milliseconds, so on this fight the GPU is SLOWER -- measured in the
// gate and printed, not argued. What it buys is the machinery: the seats are decided in a batch at all (so a fleet of ships, or the same fight in a thousand parallel copies for a trainer, is one dispatch per layer per network), the f32 arithmetic is the kernel the GPU Brain is graded on (tools/ship/brainKernels-selfcheck.mjs), and the
// CPU twin (brain/seatGunnerPolicy.mjs's own forward) is the reference. The GRAPH THAT FIGHTS is the arena's and does not move to the GPU.
//
// ONE BATCH PER DISTINCT NETWORK PER TICK: seats that share weights (the same network in all of them, the usual fight) are one batch; a fight with a different network in each group (battleshipFight's `seatNetworks`) is one batch for each distinct set of weights. The BatchedMLP for a set of weights is built the first time it is seen and kept.
"use strict";
import { BatchedMLP } from "./mlp.js";

/** One network on the device: `net` is a gunner's `decide.net` -- { w (the weights), layersOf (w -> the layer specs), post (the last layer's outputs -> the controls) }. */
export class GpuSeatBrain {
    constructor(device, net, { batchCap = 64 } = {}) {
        if (!device || typeof device.createShaderModule !== "function") throw new Error("GpuSeatBrain needs a GPUDevice");
        if (!net || !net.w || typeof net.layersOf !== "function" || typeof net.post !== "function") throw new Error("GpuSeatBrain needs a network: { w, layersOf, post } (a gunner's decide.net)");
        this.device = device; this.net = net; this.batchCap = batchCap; this.dispatches = 0; this.decisions = 0; this._queue = Promise.resolve();
        const layers = net.layersOf(net.w); this.nIn = layers[0].nIn; this.nOut = layers[layers.length - 1].nOut;
        this.mlp = new BatchedMLP(device, layers, batchCap);
    }
    /** The raw outputs (the last layer, before `post`) for each row: one array of nOut numbers per row, one forward() per `batchCap` rows. Calls queue (BatchedMLP has one pair of activation buffers and one staging buffer). */
    raw(rows) {
        const run = this._queue.then(() => this._raw(rows));
        this._queue = run.catch(() => {});
        return run;
    }
    async _raw(rows) {
        const out = [];
        for (let a = 0; a < rows.length; a += this.batchCap) {
            const n = Math.min(this.batchCap, rows.length - a), flat = new Float32Array(n * this.nIn);
            for (let i = 0; i < n; i++) flat.set(rows[a + i], i * this.nIn);
            const y = await this.mlp.forward(flat, n); this.dispatches++;
            for (let i = 0; i < n; i++) out.push(Array.from(y.subarray(i * this.nOut, (i + 1) * this.nOut)));
        }
        this.decisions += rows.length;
        return out;
    }
    /** The controls for each row: the kernel's outputs through the network's own `post` (the tanh the CPU twin applies). */
    async decide(rows) { return (await this.raw(rows)).map(this.net.post); }
}

/**
 * The batch function brain/spaceArena.mjs's stepSpaceArenaAsync takes: jobs ([{ net, x }]: a seat's network and its twelve features) -> the controls for each, in the order given. A set of weights gets a GpuSeatBrain the first time it is seen and keeps it;
 * the jobs are grouped by weights (by identity, as the seats of one fight share them), each group is one batch, and the groups run one after the other. `batcher.brains` is the Map of the networks seen, `batcher.dispatches()` the forward() calls made so far.
 */
export function gpuBatcher(device, { batchCap = 64 } = {}) {
    const brains = new Map();
    async function batch(jobs) {
        const groups = new Map();
        jobs.forEach((j, i) => { if (!groups.has(j.net.w)) groups.set(j.net.w, []); groups.get(j.net.w).push(i); });
        const out = new Array(jobs.length);
        for (const [w, idx] of groups) {
            let b = brains.get(w); if (!b) { b = new GpuSeatBrain(device, jobs[idx[0]].net, { batchCap }); brains.set(w, b); }
            const ys = await b.decide(idx.map((i) => jobs[i].x));
            idx.forEach((i, k) => { out[i] = ys[k]; });
        }
        return out;
    }
    batch.brains = brains;
    batch.dispatches = () => [...brains.values()].reduce((a, b) => a + b.dispatches, 0);
    return batch;
}

export function reportLines() {
    return ["[seatGunnerGpu] the seat networks of a fight decided in one batch on the GPU (brain/mlp.js's BatchedMLP), through the arena's two-phase tick; the CPU twin is the reference",
        "  one dispatch per layer per distinct network per tick for the whole fight; it takes a GPUDevice from the caller; on a fight of two ships it is slower than the CPU (a read-back costs more than twenty-six forward passes), and the gate prints by how much"];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
