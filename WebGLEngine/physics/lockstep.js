// physics/lockstep.js
//
// Lockstep is what all the determinism was for. Two machines want to run the same simulation together over a network,
// but the state is far too big to send every frame -- so instead they send only their INPUTS, a few numbers per frame,
// and each machine runs the whole simulation itself. That only works if both machines compute byte-for-byte the same
// result from the same inputs, which is exactly the property this engine has spent its life proving. When it holds, the
// two stay in perfect step forever on a trickle of bandwidth; when it fails -- one machine's physics drifts by a single
// bit -- they silently desynchronise, and the game falls apart. So the other half of lockstep is a checksum: each frame
// both machines hash their state and compare, and the first frame the hashes differ is the frame the desync happened.
//
// This runs on the deterministic N-body engine: each peer contributes impulses to bodies, both peers simulate every
// body, and a per-frame state hash (dual-runtime, same in Node and the browser) is the checksum two peers exchange.
import { makeSystem, orbitStep } from "./orbit.js";
import { hashFloats } from "../tools/hash.mjs";

export function makeSession(bodies, { G = 1, dt = 0.01 } = {}) {
    return { sys: makeSystem(bodies, { G }), dt, frame: 0, hashes: [] };
}

function hashState(session) {
    return hashFloats("frame", session.sys.bodies.flatMap((b) => [...b.r, ...b.v]));
}

// Advance one frame: apply this frame's inputs (impulses on bodies), step, record and return the state hash.
export function stepFrame(session, inputs) {
    for (const inp of inputs || []) { const b = session.sys.bodies[inp.body]; b.v[0] += inp.dvx || 0; b.v[1] += inp.dvy || 0; }
    orbitStep(session.sys, session.dt);
    session.frame++;
    const h = hashState(session);
    session.hashes.push(h);
    return h;
}

// Run a whole input timeline (an array of per-frame input lists) and return the hash stream.
export function runTimeline(session, timeline) {
    const stream = [];
    for (let f = 0; f < timeline.length; f++) stream.push(stepFrame(session, timeline[f]));
    return stream;
}

// Compare two peers' hash streams: the first frame they differ (the desync frame), or -1 if identical the whole way.
export function firstDivergence(streamA, streamB) {
    const n = Math.min(streamA.length, streamB.length);
    for (let f = 0; f < n; f++) if (streamA[f] !== streamB[f]) return f;
    return streamA.length === streamB.length ? -1 : n;
}

// Convenience: run the same timeline on two fresh sessions and report whether they stayed in lockstep.
export function verifyLockstep(bodies, timeline, opts = {}) {
    const a = runTimeline(makeSession(bodies.map((b) => ({ ...b, r: [...b.r], v: [...b.v] })), opts), timeline);
    const b = runTimeline(makeSession(bodies.map((b) => ({ ...b, r: [...b.r], v: [...b.v] })), opts), timeline);
    const d = firstDivergence(a, b);
    return { inSync: d === -1, desyncFrame: d, frames: timeline.length };
}
