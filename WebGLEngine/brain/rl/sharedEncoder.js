// brain/rl/sharedEncoder.js -- a SHARED observation encoder so a policy learned on one flight task transfers to
// another. Every "close on a target" task (dock, hunt, intercept, guard) produces the SAME ship-frame vector:
//   [ relForward, relRight, ownVelForward, ownVelRight, dist, targetVelForward, targetVelRight ]  (all normalized)
// Ship-frame (relative to the ship's own heading) so approach angle is implicit; target velocity is included so the
// policy can LEAD a moving target -- a static target just leaves those two slots at zero, so a hunt policy (trained
// with real target motion) drops onto a dock task unchanged, and vice-versa. This common representation is what makes
// transfer possible: same obs shape + same action = one policy's weights are a valid warm start for another task.
"use strict";

const SHARED_OBS_DIM = 7, ACT_DIM = 2;
const S = 800, V = 300;   // position + velocity scales (shared across tasks so the numbers mean the same thing)

// ship = {x,y,h,vx,vy}, target = {x,y,vx,vy} (vx/vy optional -> treated as 0 for a static target)
function encodeFlightObs(ship, target) {
    const fx = Math.cos(ship.h), fy = Math.sin(ship.h), rx = -fy, ry = fx;
    const dx = target.x - ship.x, dy = target.y - ship.y;
    const relF = dx * fx + dy * fy, relR = dx * rx + dy * ry;
    const velF = ship.vx * fx + ship.vy * fy, velR = ship.vx * rx + ship.vy * ry;
    const tvx = target.vx || 0, tvy = target.vy || 0;
    const tVelF = tvx * fx + tvy * fy, tVelR = tvx * rx + tvy * ry;
    const dist = Math.hypot(dx, dy);
    return new Float32Array([relF / S, relR / S, velF / V, velR / V, dist / S, tVelF / V, tVelR / V]);
}

export { encodeFlightObs, SHARED_OBS_DIM, ACT_DIM, S, V };
if (typeof module !== "undefined" && module.exports) module.exports = { encodeFlightObs, SHARED_OBS_DIM, ACT_DIM, S, V };
