// fx/raycast/brainPilot.js -- the bridge that lets the GPU Brain fly the raycast world. It turns the first-person world
// into a fixed feature vector the brain reads (five obstacle rays across the FOV + the camera-relative bearing and
// distance to the objective), turns the brain's output back into a { turn, forward } heading, and -- because the GPU
// Brain runs async on WebGPU -- caches the last action so the real-time pilot never stalls waiting on inference. The
// encode/decode/cache are pure and verified here; the actual WebGPU policy is the rig's. moveCollide still guards
// movement, so even a raw untrained action can never clip a wall.
"use strict";
import { castRay } from "./raycaster.js";

// World -> feature vector. Rays normalized 0..1 (1 = far/open); bearing as (forward, side) in the camera frame; distance.
function encodeRaycastState(cam, map, target) {
    const rays = [-0.8, -0.4, 0, 0.4, 0.8].map(cx => Math.min(1, castRay(map, cam, cx).perp / 8));
    const tdx = (target ? target.x : cam.px + cam.dirX) - cam.px, tdy = (target ? target.y : cam.py + cam.dirY) - cam.py;
    const dist = Math.hypot(tdx, tdy) || 1e-6;
    const fwd = (tdx * cam.dirX + tdy * cam.dirY) / dist;          // +1 = objective straight ahead
    const side = (tdx * cam.planeX + tdy * cam.planeY) / dist;     // sign = objective left/right
    return Float32Array.from([rays[0], rays[1], rays[2], rays[3], rays[4], fwd, side, Math.min(1, dist / 16)]);
}
// Brain output [turn, forward] (each ~ -1..1) -> a bounded heading.
function decodeAction(out, opts = {}) {
    const t = Math.max(-1, Math.min(1, out[0] || 0)), f = Math.max(-1, Math.min(1, out[1] == null ? 1 : out[1]));
    return { turn: t * (opts.maxTurn || 0.12), forward: (0.5 + 0.5 * f) * (opts.maxSpeed || 0.05) };
}
// makeBrainPilot(infer, getTarget) -> a brain function for pilotStep opts.brain. infer(stateVec) may be async (WebGPU);
// the pilot returns the last decoded action immediately and refreshes it when inference resolves.
function makeBrainPilot(infer, getTarget, opts = {}) {
    let last = { turn: 0, forward: (opts.maxSpeed || 0.05) * 0.4 }, busy = false, ok = false, misses = 0;
    const pilot = function (cam, map) {
        if (!busy) {
            busy = true;
            const target = (getTarget && getTarget(cam)) || null, state = encodeRaycastState(cam, map, target);
            Promise.resolve(infer(state)).then(out => { if (out && out.length >= 2) { last = decodeAction(out, opts); ok = true; misses = 0; } })
                .catch(() => { misses++; }).finally(() => { busy = false; });
        }
        return last;
    };
    pilot.healthy = () => ok && misses < 30; pilot.lastState = () => last;
    return pilot;
}
export { encodeRaycastState, decodeAction, makeBrainPilot };
if (typeof module !== "undefined" && module.exports) module.exports = { encodeRaycastState, decodeAction, makeBrainPilot };
