// WebGLEngine/render/subAquariumFlyCx.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is render/subAquariumFlyCx-selfcheck.mjs)
//
// THE STATEFUL FLY PILOT AS A KIND OF SUB THE SUB AQUARIUM'S TANK CAN SEAT (brain/TANK_PILOTS_WIP.md, design point 3). The tank (render/subAquariumSim.mjs) flies a sub from the circuit its entry names: `registerPilotKind("flycx", flyCxKind(circuit))` tells it how to build the pilot
// for weights of that circuit. The pilot is brain/pilotSubCircuitState.mjs's -- the autopilot's laws plus a residual read from the fly's heading-loop circuit (148 cells, 7,080 synapses) run as a reservoir with a MEMORY: one activity per cell, carried from tick to tick.
//
// WHY THIS IS NOT JUST `createStatePolicy(circuit).pilotFor(weights)`: that pilot resets its memory whenever the TARGET OBJECT it is handed is not the one it had (a new dive, as tools/subDisturb.mjs detects one). The tank hands every pilot a FRESH target object each tick while a sub
// is outside its steering box, and its event wrappers (surface, flood) make a new one each tick too, so the bare pilot would forget everything every tick. This wrapper hands the policy ONE target object, rewritten each tick from the three fields the features read (depth, heading, speed:
// brain/autopilotSub.mjs guidance), and replaces it by a new one -- so the memory restarts -- exactly when the sub's WANDERING TARGET changes (`ctx.sub.target`: a retarget, a turn at a wall, a respawn). That is the tank's "new dive".
//   *** SAID PLAINLY: in the tank the memory restarts at every new wandering target, as it does at the start of each of the 40 training dives; between retargets (20 to 45 s) it carries, where a training dive was 60 s. ***
// The 4th argument the compass events pass (`aux.compassValid`, 1 or 0) goes through to the policy untouched: the policy reads it as its 15th feature, and it was trained with it.
// Pure: no DOM, no clock, no Math.random.
"use strict";
import * as CS from "../brain/pilotSubCircuitState.mjs";

export const CIRCUIT = "flycx";
export const LABEL = "fly heading-loop circuit with memory (148 cells)";

/**
 * The kind for the fly's heading loop: `circuit` is { neurons, edges, io } (vendor/hemibrain/hemibrain-cx-heading-loop.json). `persist: false` is NO STATE (the memory wiped every tick), the control that says what the memory does.
 * Returns the frozen kind { circuit, label, weightCount, persist, build(weights, ctx) -> pilot(state, target, current, aux) }; `ctx.sub` is the tank's sub (its `target` is the wandering target). A circuit the policy cannot be built on throws.
 */
export function flyCxKind(circuit, { persist = true } = {}) {
    const policy = CS.createStatePolicy(circuit, "tank", { persist });
    return Object.freeze({
        circuit: CIRCUIT, label: LABEL, weightCount: policy.WEIGHT_COUNT, persist: policy.persist,
        build(weights, ctx = {}) {
            if (!weights || weights.length !== policy.WEIGHT_COUNT) throw new Error(`subAquariumFlyCx.build: the heading loop takes exactly ${policy.WEIGHT_COUNT} weights, got ${weights ? weights.length : "none"}`);
            const inner = policy.pilotFor(Float32Array.from(weights)), sub = ctx.sub || null; let dive = null, tgt = null;
            return (state, t, current, aux) => {
                const wander = sub ? sub.target : t;
                if (tgt === null || wander !== dive) { dive = wander; tgt = {}; }
                tgt.depth = t.depth; tgt.heading = t.heading; tgt.speed = t.speed;
                return inner(state, tgt, current, aux);
            };
        },
    });
}
