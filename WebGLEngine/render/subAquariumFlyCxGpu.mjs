// WebGLEngine/render/subAquariumFlyCxGpu.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is PART B of "A TANK PILOT TYPE ON THE DEVICE, ONE TICK LATE" in
// brain/RESERVOIR_GPU_WIP.md, written before this file; the gate is render/subAquariumFlyCxGpu-selfcheck.mjs)
//
// THE FLY HEADING-LOOP PILOT AS A TANK KIND THAT RUNS ON A WEBGPU DEVICE. The same pilot as render/subAquariumFlyCx.mjs (the autopilot's laws plus a residual from the 148-cell circuit run
// with a memory), but the reservoir step and the readout run on the device (brain/reservoirPilotGpu.mjs, one batch of 1 per sub). The tank's tick is synchronous and a device read-back is
// not, so THIS PILOT IS LATE: every tick it computes the features on the CPU, submits the step, starts a read-back if none is in flight, and RETURNS THE NEWEST CONTROLS THAT HAVE COME BACK.
// Until the first read of a dive lands it flies the PD autopilot for that tick. In a harness that awaits every read (settle()), that is exactly brain/pilotLateness.mjs's delayed(1); in the
// page the reads land between frames, so a sub is as late as the frames are slow. `pilot.lateness` says how late (ticks), or null while it flies the autopilot.
//   *** SAID PLAINLY: what lateness costs is PART A's measurement, not this file's; a dive change discards any read still in flight from the old dive. ***
// A new dive is what the CPU type calls one: the sub's wandering target changes (ctx.sub.target), or, with no sub, the target object. Its device memory is reset alone (resetSome).
// Pure apart from the device it is handed: no DOM, no clock, no Math.random.
"use strict";
import * as CS from "../brain/pilotSubCircuitState.mjs";
import * as GP from "../brain/reservoirPilotGpu.mjs";
import * as AP from "../brain/autopilotSub.mjs";
import { features } from "../brain/pilotSubPolicy.mjs";

export const CIRCUIT = "flycx";
export const LABEL = "fly heading-loop circuit with memory (148 cells), on the GPU, one tick late or more";
const KEYS = ["pitch", "yaw", "thrust", "ballast"];

/**
 * The device kind for the fly's heading loop. `circuit` is { neurons, edges, io }; `device` a GPUDevice (with __usage / __mapMode where the globals are absent, as headless Dawn needs).
 * Returns { circuit, label, weightCount, persist, onDevice: true, build(weights, ctx) -> pilot, destroy() }. Each pilot has `lateness`, `stats` { ticks, autopilot, reads, discarded },
 * `settle()` (a promise for the read in flight: the harness awaits it to be exactly one tick late) and `failed` (a device rejection: it then flies the autopilot, and says why).
 */
export function flyCxGpuKind(circuit, device, { persist = true } = {}) {
    if (!device || typeof device.createBuffer !== "function") throw new Error("subAquariumFlyCxGpu.flyCxGpuKind: needs a GPUDevice");
    const policy = CS.createStatePolicy(circuit, "tank-gpu", { persist }), live = new Set();
    return Object.freeze({
        circuit: CIRCUIT, label: LABEL, weightCount: policy.WEIGHT_COUNT, persist: policy.persist, onDevice: true,
        build(weights, ctx = {}) {
            if (!weights || weights.length !== policy.WEIGHT_COUNT) throw new Error(`subAquariumFlyCxGpu.build: the heading loop takes exactly ${policy.WEIGHT_COUNT} weights, got ${weights ? weights.length : "none"}`);
            const sub = ctx.sub || null;
            device.pushErrorScope("validation");
            const g = new GP.GpuPilotBatch(device, circuit, Array.from(weights), { batch: 1, persist });
            live.add(g);
            let dive = null, gen = 0, tick = 0, inFlight = null, latest = null, started = false;
            const stats = { ticks: 0, autopilot: 0, reads: 0, discarded: 0 };
            const pilot = (state, t, current = [0, 0, 0], aux = null) => {
                const wander = sub ? sub.target : t;
                if (!started || wander !== dive) { dive = wander; gen++; tick = 0; latest = null; if (started) g.resetSome([0]); started = true; }
                stats.ticks++;
                if (pilot.failed) { stats.autopilot++; pilot.lateness = null; return AP.decide(state, t, current); }
                const x = [...features(state, t, current), aux && aux.compassValid === 0 ? 0 : 1];
                g.step([x]);
                if (!inFlight) {
                    const myGen = gen, myTick = tick;
                    inFlight = g.controls().then((u) => { stats.reads++; if (myGen === gen) latest = { tick: myTick, ctl: Object.fromEntries(KEYS.map((k, o) => [k, u[o]])) }; else stats.discarded++; },
                        (e) => { pilot.failed = String((e && e.message) || e); }).finally(() => { inFlight = null; });
                }
                tick++;
                if (!latest) { stats.autopilot++; pilot.lateness = null; return AP.decide(state, t, current); }
                pilot.lateness = tick - 1 - latest.tick;
                return { ...latest.ctl };
            };
            pilot.lateness = null; pilot.stats = stats; pilot.failed = null;
            pilot.settle = () => inFlight || Promise.resolve();
            pilot.ready = device.popErrorScope().then((v) => { if (v) pilot.failed = "the device rejected a kernel: " + String(v.message || v).split("\n")[0]; return !pilot.failed; });
            pilot.destroy = () => { if (live.delete(g)) g.destroy(); };
            return pilot;
        },
        /** Frees every pilot's device buffers (the page calls it when the switch goes back to the CPU type). */
        destroy() { for (const g of live) g.destroy(); live.clear(); },
        get pilots() { return live.size; },
    });
}
