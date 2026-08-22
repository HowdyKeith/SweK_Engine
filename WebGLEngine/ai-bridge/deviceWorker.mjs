// WebGLEngine/ai-bridge/deviceWorker.mjs -- v3481
//
// *** RUN A DEVICE BUILD ON A WORKER THREAD, BECAUSE A DEVICE BUILD IS PHYSICS AND PHYSICS IS NOT I/O. ***
//
// v3477's profiler finally NAMED the thing that had stalled Keith's box for a dozen versions:
//
//     12132ms  (anonymous)        physics/optics/diffraction.js:53
//      3732ms  circularNumeric    physics/optics/diffraction.js:51
//
// circularNumeric is a nested loop, Nr=300 by Na=128 with cos and sin inside, and the optics device's default is
// nSamples = 900 -- *** 34.6 MILLION TRIG PAIRS IN ONE SYNCHRONOUS CALL, MEASURED AT 1832ms IN THE SANDBOX AND
// FOUR TIMES THAT ON THE RIG. *** The same stall also caught findCollisionPairs and advect, so it is not one
// device: it is EVERY device, because they all run the same way.
//
// AND THEY RUN INSIDE THE HTTP SERVER. deviceBridge answers /device by computing the physics on the request
// path, so a page asking for a lab run makes the box stop serving files to every peer on the LAN. IT IS THE
// nvidia-smi SHAPE FROM v3476 AGAIN -- heavy synchronous work where requests are answered -- but far larger,
// and this time the work is the whole point rather than an incidental probe.
//
// ================================================================================================
// WHY A WORKER AND NOT A TIMEOUT, A CHUNKER OR A QUEUE
// ================================================================================================
//
// A TIMEOUT cannot interrupt synchronous JavaScript -- nothing can, which is precisely the problem. CHUNKING
// (yield every N samples) would work and means editing every device's inner loop, so the next device written
// reintroduces the stall. A QUEUE serialises the stalls without shortening them. *** A WORKER MOVES THE WHOLE
// CLASS OFF THE LOOP AT ONE PLACE, and a device author cannot forget to use it because they never see it. ***
//
// THE COST IS HONEST AND STATED: a worker costs a few tens of milliseconds to start and the result must be
// STRUCTURED-CLONEABLE, so a device that returned a function or a class instance would fail here. Every device
// returns plain observables -- that is what runRecord reads and what lab-results freezes -- so the constraint
// is already true, and this file ASSERTS it rather than assuming it.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, "..");

/* ------------------------------------------------------------------------------------------------------------
 * THE WORKER SIDE
 * --------------------------------------------------------------------------------------------------------- */
// *** A SECOND JOB KIND, BECAUSE THE FIRST ONE WAS BUILT FOR THE WRONG CALLER. v3481 made this worker for
// deviceBridge and v3483's call chain then proved deviceBridge was never on the stalling path -- the caller was
// the FINGERPRINT. v3484 cached it, which killed the ACCUMULATION (blocks went from 15s->25s->48s->74s climbing
// to one 14s block and then nothing over 3s), AND THE FIRST MEASUREMENT STILL RUNS ON THE MAIN THREAD. That
// single remaining block is what this closes. ***
if (!isMainThread && workerData && workerData.__moduleCall) {
    const { moduleRel, exportName, args } = workerData;
    (async () => {
        try {
            const mod = await import(pathToFileURL(path.join(ENGINE, moduleRel)).href);
            const fn = mod[exportName];
            if (typeof fn !== "function") throw new Error(moduleRel + " has no exported function '" + exportName + "'");
            parentPort.postMessage({ ok: true, result: await fn(...(args || [])) });
        } catch (e) {
            parentPort.postMessage({ ok: false, error: String((e && e.stack) || e) });
        }
    })();
}

if (!isMainThread && workerData && workerData.__deviceWorker) {
    const { deviceName, hyp, base } = workerData;
    (async () => {
        try {
            const devices = await import(pathToFileURL(path.join(ENGINE, "tools/roundhouse/devices.mjs")).href);
            const dev = await devices.getDevice(deviceName);
            if (!dev) throw new Error("unknown device: " + deviceName);
            const out = await dev.build(hyp || {}, base || {});
            parentPort.postMessage({ ok: true, result: out });
        } catch (e) {
            // THE ERROR IS SENT, NOT THROWN. A worker that dies silently leaves the caller waiting forever, and
            // "the run never finished" is a worse report than "the run failed, here is why".
            parentPort.postMessage({ ok: false, error: String((e && e.stack) || e) });
        }
    })();
}

/* ------------------------------------------------------------------------------------------------------------
 * THE MAIN-THREAD SIDE
 * --------------------------------------------------------------------------------------------------------- */

/**
 * Build a device off the event loop.
 *
 * `timeoutMs` terminates the worker -- and UNLIKE a timeout around synchronous code, THIS ONE ACTUALLY WORKS,
 * because a worker is a separate thread and can be killed while it is computing. That is a second reason to use
 * one: a runaway device becomes a failed request instead of a dead box.
 */
export function buildDeviceOffThread(deviceName, hyp = {}, base = {}, { timeoutMs = 120000 } = {}) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(t); try { w.terminate(); } catch {} fn(v); };
        const w = new Worker(fileURLToPath(import.meta.url), {
            workerData: { __deviceWorker: true, deviceName, hyp, base },
        });
        const t = setTimeout(() => done(reject, new Error("device '" + deviceName + "' exceeded " + timeoutMs + "ms and was terminated")), timeoutMs);
        w.on("message", (m) => (m && m.ok ? done(resolve, m.result) : done(reject, new Error((m && m.error) || "worker failed"))));
        w.on("error", (e) => done(reject, e));
        w.on("exit", (code) => { if (!settled) done(reject, new Error("device worker exited early with code " + code)); });
    });
}

/** How long the main thread was actually blocked while `fn` ran -- the number this whole change is about. */
export async function measureMainThreadStall(fn, { sampleMs = 20 } = {}) {
    let worst = 0, last = Date.now();
    const tick = setInterval(() => { const now = Date.now(); worst = Math.max(worst, now - last - sampleMs); last = now; }, sampleMs);
    if (tick.unref) tick.unref();
    try {
        const value = await fn();
        // *** THE FINAL GAP IS COUNTED EXPLICITLY, AND MY FIRST VERSION DID NOT COUNT IT -- SO THE STALL
        // DETECTOR WAS BLIND TO EXACTLY THE STALL IT EXISTS TO MEASURE. A blocked loop cannot run the interval
        // that would notice it is blocked: the callback fires only AFTER the block ends, which is after the
        // result has already been read. Inline optics reported 0ms of stall while blocking for nearly two
        // seconds. AN INSTRUMENT STARVED BY THE THING IT MEASURES READS ZERO, AND ZERO LOOKS LIKE GOOD NEWS. ***
        worst = Math.max(worst, Date.now() - last - sampleMs);
        return { value, worstStallMs: worst };
    }
    finally { clearInterval(tick); }
}

/**
 * The WIRING: the same device object with ONLY `build` swapped for the off-thread one.
 *
 * *** THE LOOP, THE MODEL CALLS AND THE ROUND STREAMING ALL STAY ON THE MAIN THREAD, AND THAT IS DELIBERATE.
 * Moving the whole run into a worker would mean sending the caller closure across a thread boundary, which
 * cannot be done, and would put the LLM's network I/O -- the one part that genuinely belongs on an event loop --
 * somewhere it does not need to be. ONLY THE CPU MOVES. ***
 *
 * Everything else is forwarded unchanged: deviceBind reads name, observables, defaults and registryName, and a
 * proxy that dropped any of them would fail somewhere far from here with a message about none of this.
 */
export function offThreadDevice(device, deviceName, opts = {}) {
    if (!device) return device;
    return {
        ...device,
        __offThread: true,
        build: (hyp = {}, base = {}) => buildDeviceOffThread(deviceName, hyp, base, opts),
    };
}

/**
 * Call any exported function of any module on a worker thread.
 *
 * *** GENERALISED ON PURPOSE, BECAUSE THE INSTANCE KEEPS MOVING. The stall was blamed on nvidia-smi, then on
 * device builds, then on deviceBridge, and turned out to be the fingerprint's physics baseline -- FOUR
 * DIFFERENT CALLERS OF THE SAME MISTAKE, which is heavy synchronous work sitting where requests are answered.
 * A device-shaped helper could only ever fix device-shaped instances of it. ***
 *
 * The constraint is the same as buildDeviceOffThread's and is stated rather than assumed: `args` and the return
 * value must be STRUCTURED-CLONEABLE. A function or a class instance in either direction fails here loudly,
 * which is better than a subtle difference between the threaded and inline answers.
 */
export function callInWorker(moduleRel, exportName, args = [], { timeoutMs = 120000 } = {}) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(t); try { w.terminate(); } catch {} fn(v); };
        const w = new Worker(fileURLToPath(import.meta.url), {
            workerData: { __moduleCall: true, moduleRel, exportName, args },
        });
        const t = setTimeout(() => done(reject, new Error(moduleRel + "#" + exportName + " exceeded " + timeoutMs + "ms and was terminated")), timeoutMs);
        w.on("message", (m) => (m && m.ok ? done(resolve, m.result) : done(reject, new Error((m && m.error) || "worker failed"))));
        w.on("error", (e) => done(reject, e));
        w.on("exit", (code) => { if (!settled) done(reject, new Error("worker exited early with code " + code)); });
    });
}
