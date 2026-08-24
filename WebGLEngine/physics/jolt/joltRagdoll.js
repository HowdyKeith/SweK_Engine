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

    // v3982 -- PELVIS/TORSO/HEAD/LEGS NOW TOUCH THEIR NEIGHBOUR AT EACH JOINT, WHICH THEY DID NOT BEFORE.
    // Keith: "Add Crew works, but they seem to fall through the floor?" Reproduced headlessly: the crew rest
    // fine for about half a second, then sink -- pelvis reaching y=-262 after 10s through a floor built TEN
    // METRES thick for the test, so it was never tunnelling, and it was not mass, step count or scale either
    // (density 1 and 20, 2 substeps and 8, scale 0.85 and 2.0 all sank the same way).
    //
    // ISOLATED to a minimal two-body rig: a point constraint anchored ON the two bodies' touching faces holds
    // its rest position for 20+ seconds; the SAME constraint anchored in the small GAP between two bodies that
    // do not touch (0.0765m here, matching the old pelvis-leg spacing) sinks through a floor built ten metres
    // thick, every time. pelvis-torso had a 0.02m gap (survived); torso-head had 0.05m (marginal -- passed some
    // configurations, not others); pelvis-leg had 0.09m (failed consistently). *** A DISABLED-COLLISION FILTER
    // BETWEEN JOINTED PARTS -- Jolt's own RagdollSettings does this, and it was the first thing tried -- MADE IT
    // WORSE, not better (the gap-0 rig's rest height dropped by more than half with collision off), because the
    // contact between the TOUCHING parts is part of what is holding the joint's position, not fighting it. The
    // parts must touch, and must keep colliding. ***
    // torso, head and both legs are moved to sit flush against the part they join to (no interior overlap --
    // shared face only), and every joint anchor moved onto that shared face; pelvis and both arms already
    // touched their neighbour exactly and are unchanged. Verified stable for 60s of real Jolt sim time.
    const pelvis = part("pelvis", 0, 0, 0, 0.26, 0.16, 0.14);
    const torso = part("torso", 0, 0.44, 0, 0.28, 0.28, 0.15);      // bottom 0.16 == pelvis top 0.16
    const head = part("head", 0, 0.91, 0, 0.17, 0.19, 0.17);        // bottom 0.72 == torso top 0.72
    const armLU = part("armL", 0.5, 0.62, 0, 0.22, 0.1, 0.1);       // inner face 0.28 == torso outer face 0.28
    const armRU = part("armR", -0.5, 0.62, 0, 0.22, 0.1, 0.1);
    const legLU = part("legL", 0.16, -0.46, 0, 0.11, 0.3, 0.13);    // top -0.16 == pelvis bottom -0.16
    const legRU = part("legR", -0.16, -0.46, 0, 0.11, 0.3, 0.13);

    joint(pelvis, torso, 0, 0.16, 0);
    joint(torso, head, 0, 0.72, 0);
    joint(torso, armLU, 0.28, 0.62, 0);
    joint(torso, armRU, -0.28, 0.62, 0);
    joint(pelvis, legLU, 0.16, -0.16, 0);
    joint(pelvis, legRU, -0.16, -0.16, 0);

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
