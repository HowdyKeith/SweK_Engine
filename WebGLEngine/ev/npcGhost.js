// WebGLEngine/ev/npcGhost.js — v2252
//
// Extrapolate a replicated ghost forward in time. This is the "evolve from initial conditions" half of the
// EVE/Destiny model: a broadcast packet is the initial state, and between packets each receiver re-derives
// where the ship is now. If the packet carried INTENT -- the owner's turn/thrust plus the ship's flight stats
// -- we replay the engine's OWN flight model to trace the curved path, the same integration the owner ran, so
// the ghost bends toward its target instead of sliding off on a straight velocity ray. Without intent it falls
// back to esAuthority.ghostAt (linear dead-reckoning), so old packets still work.
//
// This needs no cross-machine determinism: the owner re-anchors on every intent change (and on a keepalive),
// so a receiver's float drift never accumulates -- the next packet corrects it. The point is smoothness in the
// gap, and letting owners go quiet between changes (see esAuthority.packNpcsDirty / retainGhosts).

import { stepFlight } from "./flightModel.js";
import { ghostAt } from "./esAuthority.js";

const STEP = 1 / 30;   // integrate in the same small steps the owner used, so the curve matches

export function intentGhostAt(state, nowMs, opts = {}) {
    if (!state) return null;
    if (state.tu == null || !state.st) return ghostAt(state, nowMs);   // no intent -> linear, backward compatible
    const cap = opts.cap != null ? opts.cap : 2.0;                     // a curved trace stays honest ~4x longer than a ray
    const total = Math.max(0, (nowMs - (state.t || nowMs))) / 1000;
    const k = Math.min(total, cap);
    const stats = { turn: state.st, accel: state.sa, speed: state.ss };
    const input = { turn: state.tu, thrust: !!state.tt };
    let s = { x: state.x || 0, y: state.y || 0, vx: state.vx || 0, vy: state.vy || 0, heading: state.heading || 0 };
    for (let t = 0; t < k; t += STEP) s = stepFlight(s, input, stats, Math.min(STEP, k - t));
    return {
        id: state.id, x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: s.heading,
        shield: state.shield, armor: state.armor, dead: !!state.dead, by: state.by, ghost: true, stale: total > cap,
    };
}
