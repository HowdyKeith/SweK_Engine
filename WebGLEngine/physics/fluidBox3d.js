// fluidBox3d.js -- co-simulation coupler between box3d (the real rigid-body solver) and the FLIP fluid. This is
// step 4 of the coupling sequence: box3d OWNS the body motion (collisions, stacking, contacts, rotation), and the
// fluid just supplies external forces (buoyancy + drag) each frame. The two engines exchange data:
//
//   each frame:  box3d transforms/velocities -> fluid body states   (the fluid sees where the rigid bodies are)
//                fluid.step()                                        (stamps them as moving solids, solves pressure)
//                fluid pressure force -> box3d velocity nudge        (buoyancy + drag pushed back onto the bodies)
//                box3d.step()                                        (box3d resolves gravity + contacts + the nudge)
//
// It is written ONLY against the box3d world-handle API that the SweK shim already exposes -- addBox({type,pos,
// half,density}), setVelocity(idx,[x,y,z]), readTransforms(), readVelocities(), step(dt,substeps) -- so the exact
// same coupler runs headless against a mock 3D world (verification) and against the real box3d WASM on-rig, with
// no code change. box3d has no direct apply-force, so forces are injected as a velocity delta F/mass*dt on top of
// whatever box3d already computed this tick -- the same mechanism esBox3d.nudge() uses for gravity/knockback.
//
// Coordinate convention: world space == fluid grid space (scale 1), so a box at world (x,y,z) is a fluid body at
// grid (x,y,z). For a host at a different scale (e.g. ES ships), pass origin/scale and it maps through. Bodies
// are treated as axis-aligned for the fluid's solid-cell test; box3d's rotation still drives the visible mesh,
// and full oriented-box fluid containment (rotating the test by box3d's quaternion) is a later refinement.
"use strict";

function createFluidBox3D(world, fluid, opts = {}) {
    if (!world || typeof world.addBox !== "function" || typeof world.readTransforms !== "function") throw new Error("fluidBox3d: needs a box3d world handle (addBox/setVelocity/readTransforms/readVelocities/step)");
    const origin = opts.origin || [0, 0, 0];
    const scale = opts.scale || 1;
    const substeps = opts.substeps || 2;
    fluid.externalBodies = true;                                  // box3d owns motion; the fluid only computes forces
    if (opts.gravity != null) fluid.gravity = opts.gravity;       // keep fluid + rigid gravity consistent
    const w2g = (p) => [(p[0] - origin[0]) / scale, (p[1] - origin[1]) / scale, (p[2] - origin[2]) / scale];
    const pairs = [];

    return {
        // Add a dynamic box to BOTH engines. worldPos/worldHalf in world units; density < 1 floats, > 1 sinks.
        addBox(worldPos, worldHalf, density = 1) {
            const idx = world.addBox({ type: "dynamic", pos: [worldPos[0], worldPos[1], worldPos[2]], half: [worldHalf[0], worldHalf[1], worldHalf[2]], density });
            const g = w2g(worldPos), gh = [worldHalf[0] / scale, worldHalf[1] / scale, worldHalf[2] / scale];
            const mass = density * 8 * gh[0] * gh[1] * gh[2];      // grid-space mass so the fluid's buoyancy is Archimedes-correct
            const fbody = fluid.addBox(g[0], g[1], g[2], gh[0], gh[1], gh[2], { mass });
            const rec = { idx, fbody, mass, density }; pairs.push(rec); return rec;
        },

        // One coupled frame. Returns nothing; read state via world.readTransforms() or pairs().
        step(dt) {
            // 1. box3d -> fluid body states (position + velocity, mapped world->grid)
            const xf = world.readTransforms(), vel = world.readVelocities();
            for (const r of pairs) {
                const o = r.idx * 7, vo = r.idx * 3;
                r.fbody.x = (xf[o] - origin[0]) / scale; r.fbody.y = (xf[o + 1] - origin[1]) / scale; r.fbody.z = (xf[o + 2] - origin[2]) / scale;
                r.fbody.vx = vel[vo] / scale; r.fbody.vy = vel[vo + 1] / scale; r.fbody.vz = vel[vo + 2] / scale;
                if (fluid.setBodyQuat) fluid.setBodyQuat(r.fbody, xf[o + 3], xf[o + 4], xf[o + 5], xf[o + 6]);   // box3d orientation -> fluid oriented-box test
            }
            // 2. fluid solves; forces land on each fbody as _fx/_fy/_fz (grid units)
            fluid.step(dt);
            // 3. fluid force -> box3d velocity nudge. grid accel = F/mass; world velocity delta = grid-accel * scale * dt.
            const vel2 = world.readVelocities();
            const hasAng = typeof world.angularImpulse === "function";
            for (const r of pairs) {
                const vo = r.idx * 3, s = fluid.forceScale * scale * dt / r.mass;
                world.setVelocity(r.idx, [vel2[vo] + s * r.fbody._fx, vel2[vo + 1] + s * r.fbody._fy, vel2[vo + 2] + s * r.fbody._fz]);
                // TORQUE -> box3d spin: feed the fluid torque as an angular impulse (torque * dt). box3d divides by
                // its own inertia. scale^2 maps grid torque (force*length) to world torque. Only when supported.
                if (hasAng) { const ts = fluid.forceScale * scale * scale * dt; world.angularImpulse(r.idx, [ts * r.fbody._tx, ts * r.fbody._ty, ts * r.fbody._tz]); }
            }
            // 4. box3d owns the motion: gravity + inter-body contacts + the fluid nudge
            world.step(dt, substeps);
        },

        pairs() { return pairs; },
        // world-space position of a coupled body (for rendering / assertions)
        worldPos(rec) { const xf = world.readTransforms(), o = rec.idx * 7; return [xf[o], xf[o + 1], xf[o + 2]]; },
    };
}

export { createFluidBox3D };
if (typeof module !== "undefined" && module.exports) module.exports = { createFluidBox3D };
