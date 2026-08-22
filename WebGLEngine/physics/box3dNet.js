// WebGLEngine/physics/box3dNet.js — v2260
//
// Fleet-share the box3d destruction, the same two ways the NPCs are shared:
//
//   OWNER-AUTHORITATIVE  -- one peer owns the box3d city, steps it, and broadcasts packBodies() every tick;
//                           the others applyBodies() and render the transforms. No determinism needed.
//   LOCKSTEP             -- every peer steps the same WASM from the same inputs and compares stateHash()
//                           via lockstepStatus(); a mismatch is a desync. Safe because box3d is WASM
//                           (spec-defined IEEE-754), unlike the GPU brain.
//
// This is only the pack/apply seam (like packNpcs / mergeRemoteNpcs); the transport is the room bus the
// caller already has. Append-only active[] means a body's index is a stable network id.

const KINDS = ["building", "debris", "prop"];
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;

// OWNER: compact snapshot of every DYNAMIC body (toppled buildings + debris + props) for broadcast.
export function packBodies(scene, opts = {}) {
    const active = (scene && scene.activeBodies && scene.activeBodies()) || [];
    const bodies = [];
    for (let i = 0; i < active.length; i++) {
        const e = active[i];
        const k = KINDS.indexOf(e.kind); 
        bodies.push({ i, k: k < 0 ? 1 : k, p: (e.pos || [0, 0, 0]).map(r3), q: (e.quat || [0, 0, 0, 1]).map(r4) });
    }
    return { t: opts.nowMs || Date.now(), hash: (scene && scene.stateHash ? scene.stateHash() : 0) >>> 0, n: bodies.length, bodies };
}

// RECEIVER: merge a broadcast into a persistent ghost store keyed by network id. Append-only on the owner,
// so ids are stable; a receiver just overwrites each id's transform with the freshest packet.
export function applyBodies(store, packet) {
    store = store || new Map();
    const t = packet && packet.t;
    for (const b of (packet && packet.bodies) || []) {
        if (b == null || b.i == null) continue;
        store.set(b.i, { kind: KINDS[b.k] || "debris", pos: b.p || [0, 0, 0], quat: b.q || [0, 0, 0, 1], t });
    }
    return store;
}

// LOCKSTEP: compare a local hash to a peer's. Equal on the same tick == in sync; a divergence is a desync.
export function lockstepStatus(localHash, remoteHash) {
    const a = (localHash >>> 0), b = (remoteHash >>> 0);
    return { match: a === b, local: a.toString(16).padStart(8, "0"), remote: b.toString(16).padStart(8, "0") };
}

if (typeof module !== "undefined" && module.exports) module.exports = { packBodies, applyBodies, lockstepStatus, KINDS };
