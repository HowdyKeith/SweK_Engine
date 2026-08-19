// WebGLEngine/physics/planarFallbackWorld.js — v2263
//
// A headless stand-in for a box3d world of ES ships, matching the world-handle interface esBox3d needs
// (addShip / setVelocity / step / readTransforms / readVelocities). Ships move in the x-z plane and collide
// as equal-mass boxes (push apart + swap the colliding-axis velocity). It lets ES-on-box3d run and be A/B'd
// in Node without the WASM; the real WASM (box3dLoader) is the browser/rig path and is a drop-in replacement.

export function planarFallbackWorld() {
    const bs = [];   // { half, pos:[x,0,z], vel:[vx,0,vz] }
    return {
        addShip({ x = 0, z = 0, half = 30 } = {}) { bs.push({ half, pos: [x, 0, z], vel: [0, 0, 0] }); return bs.length - 1; },
        setVelocity(i, v) { if (bs[i]) bs[i].vel = [v[0], 0, v[2]]; },
        step(dt) {
            for (const b of bs) { b.pos[0] += b.vel[0] * dt; b.pos[2] += b.vel[2] * dt; }
            for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
                const a = bs[i], c = bs[j], dx = c.pos[0] - a.pos[0], dz = c.pos[2] - a.pos[2], m = a.half + c.half;
                if (Math.abs(dx) < m && Math.abs(dz) < m) {
                    const penX = m - Math.abs(dx), penZ = m - Math.abs(dz);
                    if (penX <= penZ) { const s = (dx < 0 ? -1 : 1) * penX / 2; a.pos[0] -= s; c.pos[0] += s; const t = a.vel[0]; a.vel[0] = c.vel[0]; c.vel[0] = t; }
                    else { const s = (dz < 0 ? -1 : 1) * penZ / 2; a.pos[2] -= s; c.pos[2] += s; const t = a.vel[2]; a.vel[2] = c.vel[2]; c.vel[2] = t; }
                }
            }
        },
        bodyCount() { return bs.length; },
        readTransforms() { const a = new Float32Array(bs.length * 7); for (let i = 0; i < bs.length; i++) { const o = i * 7, b = bs[i]; a[o] = b.pos[0]; a[o + 1] = 0; a[o + 2] = b.pos[2]; a[o + 6] = 1; } return a; },
        readVelocities() { const a = new Float32Array(bs.length * 3); for (let i = 0; i < bs.length; i++) { const o = i * 3, b = bs[i]; a[o] = b.vel[0]; a[o + 1] = 0; a[o + 2] = b.vel[2]; } return a; },
        // v2509 -- THE RECORDING API, HONESTLY REFUSED. box3d records world mutations and embeds its own state
        // hashes; this fallback is 40 lines of box-pushing and has no such thing. It could not fake one: a
        // recording is a box3d file format that b3RecPlayer reads, not a shape we get to invent.
        //
        // So these exist and SAY NO, rather than not existing at all. The difference matters: a missing method is
        // a TypeError halfway through a page, at the moment a user clicks something; a method that returns null is
        // a branch the caller can take. The ship gate flags any world method a page calls that only one backend
        // has -- that is what sent me here, and it was right to.
        // v2515 -- joints, honestly refused. This fallback is forty lines of box-pushing on a plane; a joint
        // graph is not something it can approximate, and pretending would produce a rig that silently does nothing.
        /**
         * v2565 -- the 12th contract call. A general body, with a y that this world will honestly ignore.
         *
         * box3d gained "spatial" this version because addBox let it PROVE an up axis its ship helper hid. THIS
         * WORLD GAINS NOTHING, and that is correct: it is planar because setVelocity DISCARDS v[1] on line 12,
         * not because the contract lacked a way to ask. THE ENGINE'S LIMIT AND THE INTERFACE'S LIMIT ARE
         * DIFFERENT THINGS, and this world is the case where the limit really is the engine.
         */
        addBox({ pos = [0, 0, 0], half = 0.5 } = {}) {
            bs.push({ half: Array.isArray(half) ? half[0] : half, pos: [pos[0], pos[1], pos[2]], vel: [0, 0, 0] });
            return bs.length - 1;
        },

        /**
         * v2567 -- the 13th contract call. An impulse is a change in momentum: dv = J/m. This world has no
         * masses and no forces, so it does the only honest thing available to it -- treats the impulse as a
         * velocity delta -- AND STILL EATS THE Y COMPONENT, because it is planar and pretending otherwise here
         * would be exactly the substitution this contract exists to catch.
         */
        impulse(i, j) { if (bs[i]) { bs[i].vel[0] += j[0]; bs[i].vel[2] += j[2]; } },

        // v2557 -- SAY WHAT YOU ARE. setVelocity above discards v[1] entirely: push a body straight up at
        // 5 m/s for a second and it moves 0.0000. That is this world's documented design, not a bug -- but
        // nothing ever DECLARED it, so v2553's conformance checker passed this world while catching a
        // deliberately-sabotaged one that dropped z. The checker pushed x and z and never y. Same blind spot,
        // other axis. Now the answer is part of the contract and the checker makes worlds prove it.
        dimensionality() { return "planar"; },
        supportsJoints() { return false; },
        jointSpherical() { return -1; },
        jointRevolute() { return -1; },
        jointWeld() { return -1; },
        jointCount() { return 0; },
        jointDestroy() {},

        startRecording() { return false; },        // "no", not a crash
        stopRecording() { return new Uint8Array(0); },   // nothing to give: the caller checks .length
        validateReplay() { return null; },         // null = "I cannot answer", distinct from false = "it failed"
        supportsRecording() { return false; },

        stateHash() { let h = 2166136261 >>> 0; for (const b of bs) for (const v of [b.pos[0], b.pos[2]]) { h = (h ^ ((Math.round(v * 100)) >>> 0)) >>> 0; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; },
    };
}

if (typeof module !== "undefined" && module.exports) module.exports = { planarFallbackWorld };
