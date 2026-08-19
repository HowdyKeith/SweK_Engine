// WebGLEngine/physics/voxelPose.js — v2636
//
// The third piece of the moving-voxel-body story. The cover gives the SHAPE, mass properties give how it ROTATES,
// and this places the cover boxes in the world as the body MOVES. box3d hands back a rigid transform each frame --
// a position and an orientation quaternion about the centre of mass -- and this maps every cover box into world
// space under that transform, so the whole body travels and tumbles as one rigid unit. It also gives the body's
// tight world AABB for broad-phase culling and spatial queries.
//
// A rotation is an isometry: posing never changes the shape, only where it is. The gate leans on exactly that.
//
// poseBoxes(boxes, transform, opts) -> [ { center:[x,y,z], half:[x,y,z], quat:[x,y,z,w] } ]
//   boxes     : boxCover output (inclusive voxel-index boxes)
//   transform : { pos:[x,y,z], quat:[x,y,z,w] }   -- world position of the pivot, and orientation
//   opts      : { voxelSize=1, origin=[0,0,0], pivot=[0,0,0] }  -- pivot is the LOCAL point that maps to pos (the COM)

import { boxToCollider } from "./voxelBoxCover.js";

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// rotate vector v by quaternion q=[x,y,z,w]; q is normalised here so a non-unit quat cannot scale the body.
export function rotateByQuat(q, v) {
    let [x, y, z, w] = q;
    // v2889 -- hypot is unspecified libm (fingerprint tripwire caught it); quat components are near-unit so the
    // specified sqrt of the sum of squares is safe from overflow and bit-identical across machines.
    const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
    x /= n; y /= n; z /= n; w /= n;
    const u = [x, y, z];
    const t = cross(u, v).map((c) => 2 * c);
    return [v[0] + w * t[0] + cross(u, t)[0], v[1] + w * t[1] + cross(u, t)[1], v[2] + w * t[2] + cross(u, t)[2]];
}

export function poseBoxes(boxes, transform, opts = {}) {
    const pos = transform.pos || [0, 0, 0];
    const quat = transform.quat || [0, 0, 0, 1];
    const pivot = opts.pivot || [0, 0, 0];
    return boxes.map((b) => {
        const c = boxToCollider(b, opts);                       // local centre + half
        const rel = [c.pos[0] - pivot[0], c.pos[1] - pivot[1], c.pos[2] - pivot[2]];
        const r = rotateByQuat(quat, rel);
        return { center: [pos[0] + r[0], pos[1] + r[1], pos[2] + r[2]], half: c.half, quat: quat.slice() };
    });
}

// The tight world-space axis-aligned bounding box of the posed body: expand over every rotated corner of every box.
export function worldAABB(boxes, transform, opts = {}) {
    const posed = poseBoxes(boxes, transform, opts);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of posed) {
        for (let sx = -1; sx <= 1; sx += 2)
            for (let sy = -1; sy <= 1; sy += 2)
                for (let sz = -1; sz <= 1; sz += 2) {
                    // a corner of the posed box: centre + rotate(quat, half .* sign)
                    const local = [sx * p.half[0], sy * p.half[1], sz * p.half[2]];
                    const r = rotateByQuat(p.quat, local);
                    for (let i = 0; i < 3; i++) {
                        const w = p.center[i] + r[i];
                        if (w < min[i]) min[i] = w;
                        if (w > max[i]) max[i] = w;
                    }
                }
    }
    return { min, max };
}
