// WebGLEngine/brain/pilotFlightGpu.mjs -- v4870
//
// THE GPU BRAIN FLYING: brain/pilotFlightMlp.mjs's network (18 -> 32 -> 32 -> 4) run on the GPU Brain's own machinery, brain/mlp.js's BatchedMLP -- a whole fleet's decisions in ONE dispatch per layer, weights uploaded once,
// a trained pilot hot-swapped with updateWeights() -- and read back as the same four controls the CPU twin gives. It takes a GPUDevice from the caller (a browser's navigator.gpu, or the gate's headless Chromium); it does not
// ask for one, so it never decides what counts as a real adapter (brain/gpu.js's initGPU refuses software adapters for the brain process; a page and a gate say which adapter they got).
//
//   const brain = new GpuPilotBrain(device, weights, { batchCap: 64 });
//   const controls = await brain.decide(featureRows);      // featureRows: one 18-number row per aircraft (brain/pilotFlightMlp.mjs features()); controls: { pitch, roll, yaw, throttle } per row
//
// *** WHAT THE GPU IS AND IS NOT DOING HERE, SAID PLAINLY. *** The network is 1,796 multiply-adds a decision; the flight model that every decision feeds is two orders of magnitude more arithmetic on the CPU and cannot move to
// the GPU in this tree. So the GPU is not what makes a flight FAST -- a fleet of three decides faster on the CPU twin -- it is what makes this the GPU Brain's pilot: the same weights, the same f32 arithmetic the kernel
// gate holds (tools/ship/brainKernels-selfcheck.mjs), the same batched dispatch the race and dock pilots use, and a decision for the whole fleet in one submission. Training is on the CPU twin (a search runs it thousands of
// times a second and a readback per call would dominate); brain/pilotFlightMlp-selfcheck.mjs holds the two twins to each other, to 1e-4 on the controls, and flies scenarios on the device to show the flights agree.
"use strict";
import { BatchedMLP } from "./mlp.js";
import * as M from "./pilotFlightMlp.mjs";
import * as T from "./flightTask.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export class GpuPilotBrain {
    /** @param device a GPUDevice. @param weights the 1,796 weights of brain/pilotFlightMlp.mjs. @param batchCap the most aircraft decided in one dispatch (a larger fleet is split). */
    constructor(device, weights, { batchCap = 64 } = {}) {
        if (!device || typeof device.createShaderModule !== "function") throw new Error("GpuPilotBrain needs a GPUDevice");
        if (!weights || weights.length !== M.WEIGHT_COUNT) throw new Error(`GpuPilotBrain needs ${M.WEIGHT_COUNT} weights, got ${weights ? weights.length : "none"}`);
        this.device = device; this.batchCap = batchCap; this.weights = Float32Array.from(weights); this.dispatches = 0; this.decisions = 0; this._queue = Promise.resolve();
        this.mlp = new BatchedMLP(device, M.layersOf(this.weights), batchCap);
    }
    /** Hot-swap the weights (the GPU buffers are rewritten, the bind groups are not rebuilt). */
    setWeights(weights) {
        if (!weights || weights.length !== M.WEIGHT_COUNT) throw new Error(`setWeights needs ${M.WEIGHT_COUNT} weights, got ${weights ? weights.length : "none"}`);
        this.weights = Float32Array.from(weights);
        M.layersOf(this.weights).forEach((l, i) => this.mlp.updateWeights(i, l.W, l.b));
    }
    /**
     * The raw outputs (before the clamp) for each row, as an array of 4-number arrays: what the kernel computed. One dispatch per `batchCap` rows. CALLS QUEUE: BatchedMLP keeps one pair of activation buffers and one staging buffer, so two
     * overlapping forward() calls fight over a buffer that is already mapped -- found when a page's frame loop and a caller of its hook both stepped the same brain. Each call here waits for the one before it, and a call that fails does not
     * poison the queue.
     */
    raw(rows) {
        const run = this._queue.then(() => this._raw(rows));
        this._queue = run.catch(() => {});
        return run;
    }
    async _raw(rows) {
        const out = [];
        for (let a = 0; a < rows.length; a += this.batchCap) {
            const n = Math.min(this.batchCap, rows.length - a), flat = new Float32Array(n * M.FEATURES);
            for (let i = 0; i < n; i++) { const r = rows[a + i]; for (let f = 0; f < M.FEATURES; f++) { const v = Number(r[f]); flat[i * M.FEATURES + f] = Number.isFinite(v) ? v : 0; } }   // a non-finite feature is read as 0, as the CPU twin reads it
            const y = await this.mlp.forward(flat, n); this.dispatches++;
            for (let i = 0; i < n; i++) out.push(Array.from(y.subarray(i * M.OUTPUTS, (i + 1) * M.OUTPUTS)));
        }
        this.decisions += rows.length;
        return out;
    }
    /** The controls for each row: the kernel's outputs through the same clamp the CPU twin applies (pitch, roll, yaw to [-1, 1], throttle to [0, 1], non-finite to 0). */
    async decide(rows) { return (await this.raw(rows)).map(M.controlsOf); }
}

/**
 * A FLEET FLOWN IN LOCKSTEP: the scenarios of brain/flightTask.mjs flown together, one batched decision per tick for every flight still in the air -- the shape in which the GPU Brain is a pilot (a page's three aircraft, a
 * training swarm's thousand), and the only way a readback per tick is affordable. `decide(rows)` takes one 18-feature row per live flight and resolves to one { pitch, roll, yaw, throttle } per row (GpuPilotBrain.decide, or
 * a CPU stand-in); the result per scenario is brain/flightTask.mjs fly()'s, field for field. THIS RESTATES fly()'s loop (it cannot call it: fly() decides inside the tick, synchronously, and a device answers later), and
 * brain/pilotFlightGpu-selfcheck.mjs holds it to fly() to the bit with a CPU decider -- so a change to fly()'s scoring that is not made here goes red there.
 */
export async function flyFleet(decide, scenarios, { seconds = T.SECONDS, dt = T.DT, model = F.createFlightModel() } = {}) {
    const total = Math.round(seconds / dt);
    const fl = scenarios.map((sc) => ({ sc, s: F.createState({ pos: [0, 0, 300], ...sc.start, mass: model.mass, inertia: model.inertia }), eAlt: 0, eHdg: 0, eSpd: 0, flown: 0, status: "airborne", minV: Infinity, maxAlpha: 0, h: 0x811c9dc5, live: true }));
    for (let i = 0; i < total; i++) {
        const live = fl.filter((f) => f.live); if (!live.length) break;
        const winds = live.map((f) => T.windAt(f.sc.wind, i * dt)), rows = live.map((f, k) => M.features(f.s, f.sc.target, winds[k]));
        const controls = await decide(rows);
        if (!Array.isArray(controls) || controls.length !== live.length) throw new Error(`decide() answered ${Array.isArray(controls) ? controls.length : "no"} controls for ${live.length} flights`);
        live.forEach((f, k) => {
            const wv = winds[k], res = F.stepFlight(model, f.s, controls[k], dt, wv);
            f.s = res.state;
            if (res.status !== "airborne") { f.status = res.status; f.live = false; return; }
            const a = F.attitude(f.s, wv), he = Math.atan2(Math.sin(f.sc.target.heading - a.heading), Math.cos(f.sc.target.heading - a.heading));
            f.eAlt += Math.min(3, Math.abs(a.altitude - f.sc.target.altitude) / 50); f.eHdg += Math.min(3, Math.abs(he)); f.eSpd += Math.min(3, Math.abs(a.airspeed - f.sc.target.airspeed) / 10);
            if (a.airspeed < f.minV) f.minV = a.airspeed; if (a.alpha > f.maxAlpha) f.maxAlpha = a.alpha; f.flown++;
            if (i % 30 === 0) for (const c of [f.s.pos[0], f.s.pos[2], f.s.q[0], f.s.q[1], f.s.q[2], f.s.q[3]]) f.h = foldHash(f.h, Math.round(c * 1000) & 0xffffffff);
        });
    }
    return fl.map((f) => {
        const a = F.attitude(f.s), score = -((f.eAlt + f.eHdg + 0.5 * f.eSpd) + T.WORST_TICK * (total - f.flown)) / total, m = Math.max(1, f.flown);
        return { score, eAlt: f.eAlt / m, eHdg: f.eHdg / m, eSpd: f.eSpd / m, status: f.status, ticks: f.flown, minV: Number.isFinite(f.minV) ? f.minV : 0, maxAlpha: f.maxAlpha, final: { alt: a.altitude, hdg: a.heading, V: a.airspeed }, seed: f.sc.seed, kind: f.sc.kind, fingerprint: (f.h >>> 0).toString(16).padStart(8, "0") };
    });
}
