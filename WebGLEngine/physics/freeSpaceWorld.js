// WebGLEngine/physics/freeSpaceWorld.js — v2557
//
// A WORLD WITH UP.
//
// "we have our gpu brain driving a paramecium in Box3d, is everything a 2d plain for it?"
//
// YES, AND IT IS NOT THE PARAMECIUM'S FAULT. planarFallbackWorld.js:12 reads:
//
//     setVelocity(i, v) { if (bs[i]) bs[i].vel = [v[0], 0, v[2]]; }
//
// v[1] -- up -- is DISCARDED AT THE DOOR. Not clamped, not ignored downstream. Thrown away on the way in. Push a
// body straight up at 5 m/s for a full second and it moves 0.0000. The header says so honestly ("Ships move in
// the x-z plane"), so this is a documented limit and not a bug -- but it means every creature in it is flat
// because THE WORLD IS FLAT, and no amount of work on the creature changes that.
//
// box3d IS 3D and would give the paramecium an up axis. box3d.wasm is not in this tree (v2546) and the toolchain
// 403s from the sandbox (v2549). So "release it into box3d and let it swim up" is not available here.
//
// THIS IS THE SMALLEST HONEST THING THAT IS: a world that answers the same TEN CALLS (v2553's CONTRACT) and does
// NOT throw the up axis away. No collisions, no gravity, no contacts -- free space. It is a STAND-IN, exactly as
// planarFallbackWorld is, and it says so. What it is FOR is letting a creature have three dimensions of choice
// so the question "does the brain need up?" can be measured instead of argued.
//
// AND IT DECLARES ITSELF. v2553's checker could not tell a planar world from a 3D one because nothing ever asked
// and nothing ever pushed y. Now dimensionality is part of the contract: a world says planar or spatial, and the
// checker MAKES IT PROVE IT.
"use strict";

export function freeSpaceWorld() {
    const bs = [];
    return {
        /** Same shape as planarFallbackWorld's, plus y -- which this one actually keeps. */
        addShip({ x = 0, y = 0, z = 0, half = 0.5 } = {}) {
            bs.push({ half, pos: [x, y, z], vel: [0, 0, 0] });
            return bs.length - 1;
        },
        /** v2565 -- the 12th contract call. A general body that keeps its y, which is this world's entire job. */
        addBox({ pos = [0, 0, 0], half = 0.5 } = {}) {
            bs.push({ half: Array.isArray(half) ? half[0] : half, pos: [pos[0], pos[1], pos[2]], vel: [0, 0, 0] });
            return bs.length - 1;
        },

        /** v2567 -- the 13th contract call. Free space: unit mass, no drag, so an impulse IS a velocity delta. */
        impulse(i, j) { if (bs[i]) { bs[i].vel[0] += j[0]; bs[i].vel[1] += j[1]; bs[i].vel[2] += j[2]; } },

        /** THE WHOLE POINT: v[1] survives. */
        setVelocity(i, v) { if (bs[i]) bs[i].vel = [v[0], v[1] || 0, v[2]]; },
        step(dt) {
            for (const b of bs) {
                b.pos[0] += b.vel[0] * dt;
                b.pos[1] += b.vel[1] * dt;   // the line planarFallbackWorld does not have
                b.pos[2] += b.vel[2] * dt;
            }
        },
        bodyCount() { return bs.length; },
        readTransforms() {
            const a = new Float32Array(bs.length * 7);
            for (let i = 0; i < bs.length; i++) {
                a[i * 7] = bs[i].pos[0]; a[i * 7 + 1] = bs[i].pos[1]; a[i * 7 + 2] = bs[i].pos[2];
                a[i * 7 + 3] = 0; a[i * 7 + 4] = 0; a[i * 7 + 5] = 0; a[i * 7 + 6] = 1;
            }
            return a;
        },
        readVelocities() {
            const a = new Float32Array(bs.length * 3);
            for (let i = 0; i < bs.length; i++) { a[i * 3] = bs[i].vel[0]; a[i * 3 + 1] = bs[i].vel[1]; a[i * 3 + 2] = bs[i].vel[2]; }
            return a;
        },
        supportsJoints() { return false; },
        jointSpherical() {}, jointRevolute() {}, jointWeld() {},

        /**
         * NEW IN THE CONTRACT: what dimensionality does this world actually offer?
         * "spatial" = three axes of motion. "planar" = two, and it says so instead of silently eating the third.
         * A world that lies here fails conformance, because the checker pushes y and measures.
         */
        dimensionality() { return "spatial"; },
    };
}
