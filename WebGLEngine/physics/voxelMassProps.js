// WebGLEngine/physics/voxelMassProps.js — v2635
//
// The box cover (voxelBoxCover.js) turns a voxel body into a few solid boxes. That is enough to COLLIDE a static
// body. To make a voxel body TUMBLE as one rigid unit -- a kaiju knocked flying, an asteroid spinning -- you need
// two more things: where its centre of mass is, and how mass is distributed about that centre (the inertia tensor).
// box3d is one-box-per-body, so a moving voxel body is driven as a single rigid body whose collision is the cover
// and whose rotation is governed by these properties. This computes them exactly from the cover.
//
// Each cover box is a uniform solid. Its own-centre inertia is the closed-form box tensor; the parallel-axis
// theorem shifts it to the body centre of mass; the boxes sum. The result is exact for the voxelised body -- no
// sampling, no approximation beyond the voxelisation itself.
//
// massProperties(solid, dims, opts) -> { mass, volume, com:[x,y,z], inertia:[[Ixx,Ixy,Ixz],[.,Iyy,Iyz],[.,.,Izz]] }
//   opts.voxelSize (default 1), opts.density (default 1), opts.origin (default [0,0,0])
// inertia is the symmetric 3x3 tensor about the centre of mass, in world units.

import { boxCover, boxToCollider } from "./voxelBoxCover.js";

export function massProperties(solid, dims, opts = {}) {
    const density = opts.density == null ? 1 : opts.density;
    const boxes = boxCover(solid, dims);

    // per-box mass + world-space centre
    const parts = boxes.map((b) => {
        const c = boxToCollider(b, opts);                 // { pos (centre), half }
        const size = c.half.map((h) => 2 * h);
        const m = size[0] * size[1] * size[2] * density;
        return { m, c: c.pos, half: c.half };
    });

    const mass = parts.reduce((s, p) => s + p.m, 0);
    const volume = mass / (density || 1);
    // centre of mass = mass-weighted mean of box centres
    const com = [0, 1, 2].map((i) => (mass > 0 ? parts.reduce((s, p) => s + p.m * p.c[i], 0) / mass : 0));

    // inertia tensor about the COM: each box's own-centre tensor + parallel-axis shift, summed
    let Ixx = 0, Iyy = 0, Izz = 0, Ixy = 0, Ixz = 0, Iyz = 0;
    for (const p of parts) {
        const a = p.half[0], b = p.half[1], cc = p.half[2];   // half-extents
        // solid box about its own centre: Ixx = (1/3) m (b^2 + c^2), etc. (using half-extents)
        const ox = (p.m / 3) * (b * b + cc * cc);
        const oy = (p.m / 3) * (a * a + cc * cc);
        const oz = (p.m / 3) * (a * a + b * b);
        // parallel-axis shift from the box centre to the body COM
        const dx = p.c[0] - com[0], dy = p.c[1] - com[1], dz = p.c[2] - com[2];
        Ixx += ox + p.m * (dy * dy + dz * dz);
        Iyy += oy + p.m * (dx * dx + dz * dz);
        Izz += oz + p.m * (dx * dx + dy * dy);
        Ixy += -p.m * dx * dy;
        Ixz += -p.m * dx * dz;
        Iyz += -p.m * dy * dz;
    }
    const inertia = [
        [Ixx, Ixy, Ixz],
        [Ixy, Iyy, Iyz],
        [Ixz, Iyz, Izz],
    ];
    return { mass, volume, com, inertia, boxCount: boxes.length };
}
