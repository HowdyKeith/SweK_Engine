// physics/jolt/joltRagdoll.js -- ragdolls on Jolt for flung crew / kaiju. A ragdoll is a small skeleton of body
// parts (pelvis, torso, head, arms, legs) linked at the joints by POINT constraints (ball joints): the parts hold
// together but rotate freely at each joint, so the figure flops, tumbles, and drapes over things under gravity.
// fling() launches the whole ragdoll with a shared impulse + a bit of spin, for a crew member blown off a hull or a
// kaiju knocked flat. Deterministic (pure sim + fixed part/joint order) -> lockstep-safe.
//
// Built explicitly from bodies + point constraints (the same thing Jolt's RagdollSettings produces) so it stays
// controllable and testable; uses the raw Jolt handles the JoltWorld exposes via raw().
"use strict";

function createRagdoll(world, opts = {}) {
    const { Jolt, ps, bodyOf } = world.raw();
    const s = opts.scale || 1, bx = opts.x || 0, by = opts.y || 0, bz = opts.z || 0;
    const parts = [];       // body indices, in a fixed order
    const joints = [];      // { con, a, b }

    function part(name, px, py, pz, hx, hy, hz) {
        const i = world.addBox({ type: "dynamic", pos: [bx + px * s, by + py * s, bz + pz * s], half: [hx * s, hy * s, hz * s], density: 1 });
        parts.push({ name, idx: i }); return i;
    }
    // ball joint at a world-space point between two parts
    function joint(a, b, jx, jy, jz) {
        const pcs = new Jolt.PointConstraintSettings();
        pcs.mPoint1 = new Jolt.RVec3(bx + jx * s, by + jy * s, bz + jz * s);
        pcs.mPoint2 = new Jolt.RVec3(bx + jx * s, by + jy * s, bz + jz * s);
        const con = pcs.Create(bodyOf(a), bodyOf(b)); ps.AddConstraint(con); joints.push({ con, a, b });
    }

    const pelvis = part("pelvis", 0, 0, 0, 0.26, 0.16, 0.14);
    const torso = part("torso", 0, 0.46, 0, 0.28, 0.28, 0.15);
    const head = part("head", 0, 0.98, 0, 0.17, 0.19, 0.17);
    const armLU = part("armL", 0.5, 0.62, 0, 0.22, 0.1, 0.1);
    const armRU = part("armR", -0.5, 0.62, 0, 0.22, 0.1, 0.1);
    const legLU = part("legL", 0.16, -0.55, 0, 0.11, 0.3, 0.13);
    const legRU = part("legR", -0.16, -0.55, 0, 0.11, 0.3, 0.13);

    joint(pelvis, torso, 0, 0.2, 0);
    joint(torso, head, 0, 0.76, 0);
    joint(torso, armLU, 0.28, 0.68, 0);
    joint(torso, armRU, -0.28, 0.68, 0);
    joint(pelvis, legLU, 0.16, -0.18, 0);
    joint(pelvis, legRU, -0.16, -0.18, 0);

    return {
        parts, joints,
        idxs: () => parts.map((p) => p.idx),
        // launch the whole ragdoll: shared linear impulse + a per-part spin so it tumbles
        fling(vx, vy, vz, spin = 3) {
            for (let k = 0; k < parts.length; k++) { const i = parts[k].idx; world.impulse(i, [vx, vy, vz]); if (world.angularImpulse) world.angularImpulse(i, [(k - 3) * spin * 0.2, spin * 0.3, (k % 2 ? 1 : -1) * spin * 0.2]); }
        },
        // max distance any two connected parts have drifted from their joint (0 = perfectly held)
        cohesion() { const xf = world.readTransforms(); let m = 0; for (const j of joints) { const dx = xf[j.a * 7] - xf[j.b * 7], dy = xf[j.a * 7 + 1] - xf[j.b * 7 + 1], dz = xf[j.a * 7 + 2] - xf[j.b * 7 + 2]; m = Math.max(m, Math.hypot(dx, dy, dz)); } return m; },
        center() { const xf = world.readTransforms(); let x = 0, y = 0, z = 0; for (const p of parts) { x += xf[p.idx * 7]; y += xf[p.idx * 7 + 1]; z += xf[p.idx * 7 + 2]; } return [x / parts.length, y / parts.length, z / parts.length]; },
    };
}

export { createRagdoll };
if (typeof module !== "undefined" && module.exports) module.exports = { createRagdoll };
