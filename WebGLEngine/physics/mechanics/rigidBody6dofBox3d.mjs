// WebGLEngine/physics/mechanics/rigidBody6dofBox3d.mjs -- UNNUMBERED (2026-11-04)
//
// A 6-DOF BODY FLOWN BY box3d, WITH rigidBody6dof.step()'s CONTRACT: step(state, acc, dt) takes the engine's own body state (position,
// velocity, orientation [qw,qx,qy,qz], body-frame angular velocity) and the tick's body-frame force and torque, and returns the next state.
// Registered as a round before it was built (physics/mechanics/SIXDOF_BOX3D_WIP.md), which asks whether a ship flown this way turns and
// fights as it does in the engine's own physics. Nothing in the engine uses it unless asked.
//
// THE BODY. A box3d box of the craft's half-extents and mass (density = mass / volume), alone in its world -- box3d's shim keeps ONE world at a
// time -- with no gravity and its damping set to zero (the shim's default is 0.05 a second).
//
// EACH TICK, in this order:
//   1. the box3d body is SET to `state`: position, orientation (the shim takes x, y, z, w), velocity, and the angular velocity turned into the
//      world frame (box3d's angular calls are all world-frame);
//   2. the tick's force and torque, body-frame, are turned into the world frame by the orientation at the START of the tick and given as
//      impulses (times dt): the force at the centre, the torque as an angular impulse -- so box3d gives the whole tick's change at its start;
//   3. box3d steps once, with its own substeps (four, the loader's default);
//   4. the body is read back, the angular velocity turned into the body frame. box3d holds its state in float32, so the state is float32's.
// Its reads are views into the wasm heap, valid only until the next box3d call (and a call that grows the heap detaches them), so each is
// copied out before the next one is made.
//
// *** A FRESH WORLD EACH TICK, BY DEFAULT, BECAUSE box3d PUTS A SLOW BODY TO SLEEP. *** Found while building, by the registration's own C-awake:
// a ship-sized box coasting under about 0.05 m/s with no spin is put to sleep after 0.5 s and its velocity zeroed -- with or without this
// stepper's per-tick sets; at 0.06 m/s it never is. The shim offers no way to turn sleep off. Since every tick sets the whole state anyway, a
// world built for the tick and destroyed after it integrates exactly as a kept world does, and its body never lives the half second sleep
// waits for: what is measured is box3d's integrator, not its sleep. `keepWorld: true` keeps one world for the stepper's life, sleep and all,
// for whoever wants box3d exactly as a page would have it (a page flying ships on box3d would need the same remedy). It costs 22 us a tick
// against 12 us for a kept world.
"use strict";
import { rotateByQuat, worldToBody } from "./rigidBody6dof.mjs";

export const SUBSTEPS = 4;
const densityOf = (half, mass) => mass / (8 * half[0] * half[1] * half[2]);

/** The craft's body in a world of its own: { world, idx, density }. The caller destroys the world (box3d keeps one at a time). */
export function shipWorld(box3d, { half, mass } = {}) {
    if (!box3d || typeof box3d.createWorld !== "function") throw new Error("box3dStepper: no box3d loader");
    if (!Array.isArray(half) || half.length !== 3 || !(mass > 0)) throw new Error("box3dStepper: half-extents [hx, hy, hz] and a positive mass, please");
    const world = box3d.createWorld({ gravity: [0, 0, 0] }), density = densityOf(half, mass);
    const idx = world.addBox({ type: "dynamic", pos: [0, 0, 0], half: [...half], density });
    if (!world.setDamping(idx, 0, 0)) { world.destroy(); throw new Error("box3dStepper: this box3d artifact cannot set damping"); }
    return { world, idx, density };
}

/**
 * A stepper on `box3d` (the loader, ready) for a box of half-extents `half` and `mass`. Returns { step, destroy, density, keepWorld }.
 * By default each step() builds its world and destroys it; with `keepWorld` the stepper owns one world until destroy().
 */
export function box3dStepper(box3d, { half, mass, substeps = SUBSTEPS, keepWorld = false } = {}) {
    let kept = keepWorld ? shipWorld(box3d, { half, mass }) : null;
    if (!keepWorld) shipWorld(box3d, { half, mass }).world.destroy();   // the arguments and the artifact checked now, not on the first tick
    const three = (a, o) => [a[o], a[o + 1], a[o + 2]];
    function stepIn({ world, idx }, state, acc, dt) {
        const q = state.q;
        world.setTransform(idx, state.pos, [q[1], q[2], q[3], q[0]]);
        world.setVelocity(idx, state.vel);
        world.setAngularVelocity(idx, rotateByQuat(q, state.w));
        const f = rotateByQuat(q, acc.force), t = rotateByQuat(q, acc.torque);
        world.impulse(idx, [f[0] * dt, f[1] * dt, f[2] * dt]);
        world.angularImpulse(idx, [t[0] * dt, t[1] * dt, t[2] * dt]);
        world.step(dt, substeps);
        const X = world.readTransforms(), o = idx * 7, pos = three(X, o), qn = [X[o + 6], X[o + 3], X[o + 4], X[o + 5]];   // copied before the next call
        const vel = three(world.readVelocities(), idx * 3), wWorld = three(world.readAngularVelocities(), idx * 3);
        return { mass: state.mass, I: [...state.I], pos, vel, q: qn, w: worldToBody(qn, wWorld) };
    }
    function step(state, acc, dt) {
        if (kept) return stepIn(kept, state, acc, dt);
        const sw = shipWorld(box3d, { half, mass });
        try { return stepIn(sw, state, acc, dt); } finally { sw.world.destroy(); }
    }
    return { step, density: densityOf(half, mass), keepWorld: !!keepWorld, destroy: () => { if (kept) { kept.world.destroy(); kept = null; } } };
}
