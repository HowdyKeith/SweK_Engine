// WebGLEngine/render/denoisePool.mjs -- the denoiser arc: train several networks at once, bit for bit as one at a time
//
// Gated by render/denoisePool-selfcheck.mjs. Section 28's larger network trained four times as long costs about 1.5
// hours a training on a slow box, and a harvest trains seven of them (three seeds, control C4's second training, three
// shuffled-target networks for C2). Every training is independent and deterministic -- its own seed, its own stream, its
// own copy of the images -- so they can run side by side in worker threads and come back exactly as they would have one
// after another. This is how: the caller blocks (Atomics.wait) until each worker flags that it has posted its networks,
// then reads them with receiveMessageOnPort, so render/denoiseStudy.mjs stays synchronous and nothing else changes.
//
// *** THE SAME NETWORKS, NOT SIMILAR ONES. *** A worker runs the same trainDenoiser on a structured clone of the same
// images; a Float64Array clones exactly, so each network's every weight is the serial one's. The gate holds that.
"use strict";
import { Worker, MessageChannel, receiveMessageOnPort, isMainThread, workerData } from "node:worker_threads";
import { trainDenoiser } from "./denoiseNet.mjs";

/**
 * Train every job -- { set, opts }, as trainDenoiser(set, opts) takes them -- and return the networks in job order.
 * With `workers` 0 or 1 they are trained here, one after another; with more, job j goes to worker j % workers.
 */
export function trainParallel(jobs, workers = 0) {
    const W = Math.min(Math.max(0, workers | 0), jobs.length);
    if (W <= 1) return jobs.map((j) => trainDenoiser(j.set, j.opts).net);
    const flags = new Int32Array(new SharedArrayBuffer(4 * W)), out = new Array(jobs.length), ports = [], pool = [];
    for (let w = 0; w < W; w++) {
        const { port1, port2 } = new MessageChannel(), mine = jobs.map((j, i) => i).filter((i) => i % W === w);
        pool.push(new Worker(new URL(import.meta.url), { workerData: { denoisePool: true, slot: w, flags, port: port2, jobs: mine.map((i) => jobs[i]) },
                                                          transferList: [port2] }));
        ports.push({ port: port1, mine });
    }
    try {
        for (let w = 0; w < W; w++) {
            // the worker posts its networks, THEN raises its flag: once the flag is up the message is on the port
            while (Atomics.load(flags, w) === 0) Atomics.wait(flags, w, 0, 1000);
            const m = receiveMessageOnPort(ports[w].port);
            if (!m) throw new Error(`denoisePool: worker ${w} raised its flag with nothing on its port`);
            if (m.message.error) throw new Error(`denoisePool: worker ${w}: ${m.message.error}`);
            ports[w].mine.forEach((i, k) => { out[i] = m.message.nets[k]; });
        }
    } finally {
        for (const p of pool) p.terminate();
        for (const { port } of ports) port.close();
    }
    return out;
}

// the worker: train its jobs in order, post the networks, raise the flag
if (!isMainThread && workerData && workerData.denoisePool) {
    const { slot, flags, port, jobs } = workerData;
    try { port.postMessage({ nets: jobs.map((j) => trainDenoiser(j.set, j.opts).net) }); }
    catch (e) { port.postMessage({ error: String(e && e.message || e) }); }
    Atomics.store(flags, slot, 1);
    Atomics.notify(flags, slot);
}
