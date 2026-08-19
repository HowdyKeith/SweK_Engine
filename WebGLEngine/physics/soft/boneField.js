// WebGLEngine/physics/soft/boneField.js — v2523
//
// FLESH ON THE SKELETON. Box3D has no soft bodies and is not going to grow any: it is a rigid-body engine and says
// so. But the rig it now drives (v2515 joints, v2516 ragdoll) is exactly what flesh wants to hang on, and this
// engine already owns the other half — MarchingCubes, ClothSim, SPH. That seam is the whole idea: BOX3D IS THE
// SKELETON, OUR SOLVERS ARE THE FLESH.
//
// This module is the joint between them, and nothing more. It turns bones into a scalar field. What marches that
// field into a mesh is simulation/MarchingCubes.js, which already exists and already works.
//
// WHY CAPSULES AND NOT SPHERES. A bone is a SEGMENT with a radius, not a point. Sphere metaballs at the joints give
// you a figure made of beads; a capsule field gives you a limb. The distance from a point to a segment is the
// whole trick, and it is eight lines.
//
// WHY SMOOTH-MIN AND NOT MIN. Plain min() unions two capsules into two capsules that happen to touch — you can see
// the crease where they meet, and flesh has no crease there. The polynomial smooth minimum blends them over a
// width k, so a shoulder is a shoulder rather than an arm parked against a chest. The cost is that k also rounds
// the silhouette slightly, which is a real trade and not a free win: too large and the figure inflates into a
// snowman.
//
// DETERMINISM. The field is a PURE FUNCTION of the bone transforms. Same bones in, same field out, bit for bit —
// no time, no random, no accumulation between frames. That matters because the bones themselves are deterministic
// (Box3D's claim, tested) and a deterministic skeleton wearing a non-deterministic skin would throw the whole
// property away at the last step. Two peers running the same recording get the same mesh.
"use strict";

// Distance from point p to the segment a->b. The clamp is what makes it a segment and not an infinite line, and
// getting it wrong gives you limbs that reach out of the room.
function distToSegment(px, py, pz, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    let t = 0;
    if (len2 > 1e-12) {
        t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    const cx = ax + t * dx, cy = ay + t * dy, cz = az + t * dz;
    const ex = px - cx, ey = py - cy, ez = pz - cz;
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

// Polynomial smooth minimum (Quilez). k = 0 degenerates to plain min, which is the honest default for anyone who
// wants to see the creases.
function smin(a, b, k) {
    if (k <= 0) return a < b ? a : b;
    const h = Math.max(0, k - Math.abs(a - b)) / k;
    return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Build a signed-distance field around a set of bones.
 *
 * A bone is { a: [x,y,z], b: [x,y,z], r: number } — two endpoints and a radius. That is deliberately NOT box3d's
 * body format: this module does not import box3d, does not know what a b3BodyId is, and can be driven from a
 * recording, a test fixture, or a hand-typed pose. The caller converts.
 *
 * @param {Array<{a:number[], b:number[], r:number}>} bones
 * @param {number} dimX @param {number} dimY @param {number} dimZ   grid resolution
 * @param {{origin?: number[], cellSize?: number, blend?: number}} [options]
 * @returns {Float32Array} the field, indexed z*dimX*dimY + y*dimX + x — THE SAME LAYOUT marchScalarField expects.
 *          Negative inside the flesh, positive outside, so the isovalue to march is 0.
 */
export function boneField(bones, dimX, dimY, dimZ, options = {}) {
    const origin = options.origin ?? [0, 0, 0];
    const cellSize = options.cellSize ?? 1.0;
    const blend = options.blend ?? 0.0;
    const ox = origin[0], oy = origin[1], oz = origin[2];

    const field = new Float32Array(dimX * dimY * dimZ);
    if (!bones || !bones.length) { field.fill(1); return field; }

    // Flatten the bones once. Reading them out of objects inside the innermost loop of a 64^3 grid means 262,144
    // property lookups per bone, and this is the one place in the module where that is worth avoiding.
    const n = bones.length;
    const ax = new Float64Array(n), ay = new Float64Array(n), az = new Float64Array(n);
    const bx = new Float64Array(n), by = new Float64Array(n), bz = new Float64Array(n);
    const rr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const bo = bones[i];
        ax[i] = bo.a[0]; ay[i] = bo.a[1]; az[i] = bo.a[2];
        bx[i] = bo.b[0]; by[i] = bo.b[1]; bz[i] = bo.b[2];
        rr[i] = bo.r;
    }

    for (let z = 0; z < dimZ; z++) {
        const wz = oz + z * cellSize;
        for (let y = 0; y < dimY; y++) {
            const wy = oy + y * cellSize;
            for (let x = 0; x < dimX; x++) {
                const wx = ox + x * cellSize;
                let d = distToSegment(wx, wy, wz, ax[0], ay[0], az[0], bx[0], by[0], bz[0]) - rr[0];
                for (let i = 1; i < n; i++) {
                    const di = distToSegment(wx, wy, wz, ax[i], ay[i], az[i], bx[i], by[i], bz[i]) - rr[i];
                    d = smin(d, di, blend);
                }
                field[z * dimX * dimY + y * dimX + x] = d;
            }
        }
    }
    return field;
}

/**
 * The bounding box of a bone set, with the radii and the blend accounted for.
 *
 * Sizing a grid by eye is how you end up marching a figure with its hands cut off — the grid has to contain the
 * flesh, not the skeleton, and blend pushes the surface outward beyond the radius.
 *
 * @returns {{min:number[], max:number[]}}
 */
export function boneBounds(bones, pad = 0) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const bo of bones) {
        for (const p of [bo.a, bo.b]) {
            for (let k = 0; k < 3; k++) {
                const lo = p[k] - bo.r - pad, hi = p[k] + bo.r + pad;
                if (lo < min[k]) min[k] = lo;
                if (hi > max[k]) max[k] = hi;
            }
        }
    }
    return { min, max };
}

/**
 * Grid parameters that are guaranteed to contain the flesh.
 *
 * @param {Array} bones
 * @param {number} cells   the LONGEST axis gets this many cells; the others get proportionally fewer, so the cells
 *                         stay cubic. Non-cubic cells make the marched normals wrong in a way that looks like a
 *                         lighting bug and is not.
 * @param {number} blend
 */
export function fitGrid(bones, cells = 48, blend = 0) {
    const { min, max } = boneBounds(bones, blend * 0.5 + 1e-3);
    const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const longest = Math.max(span[0], span[1], span[2]);
    const cellSize = longest / Math.max(1, cells - 3);   // -3 leaves a rind of empty cells so the surface closes
    const dims = span.map((s) => Math.max(4, Math.ceil(s / cellSize) + 3));
    const origin = [
        min[0] - cellSize * 1.5,
        min[1] - cellSize * 1.5,
        min[2] - cellSize * 1.5,
    ];
    return { dimX: dims[0], dimY: dims[1], dimZ: dims[2], origin, cellSize };
}

/**
 * Turn box3d body transforms into bones.
 *
 * v2525 -- until now the flesh wore a HAND-ENTERED pose: the same numbers as ragdoll.html, typed twice. That is a
 * sculpture, not a soft body. This is the converter that lets the skin follow the actual simulation.
 *
 * A rig's bodies are BOXES and a bone is a SEGMENT, so something has to choose the segment. The box's LONGEST half
 * -extent is the bone's axis -- a forearm is long in one direction and thin in two, and that is what makes it a
 * forearm rather than a die. The radius is the LARGER of the two remaining halves, because a bone thinner than the
 * box it came from leaves the collision shape poking out through the skin, which reads as a glitch and is one.
 *
 * The segment is shortened by the radius at each end so the capsule's round caps land where the box's ends are.
 * Without that the flesh is longer than the body by exactly one radius per end, and every limb overshoots.
 *
 * @param {Float32Array|number[]} transforms  flat [x,y,z, qx,qy,qz,qw] per body -- box3dLoader.readTransforms()
 * @param {Array<number[]>} halves           the half-extents each body was created with, parallel to transforms
 * @param {{skip?: number[], scale?: number}} [options]  skip: body indices to leave out (the ground slab)
 * @returns {Array<{a:number[], b:number[], r:number}>}
 */
export function bonesFromTransforms(transforms, halves, options = {}) {
    const skip = new Set(options.skip || []);
    const scale = options.scale ?? 1;
    const bones = [];
    const n = Math.min(Math.floor(transforms.length / 7), halves.length);
    for (let i = 0; i < n; i++) {
        if (skip.has(i)) continue;
        const h = halves[i];
        if (!h) continue;
        const px = transforms[i * 7], py = transforms[i * 7 + 1], pz = transforms[i * 7 + 2];
        const qx = transforms[i * 7 + 3], qy = transforms[i * 7 + 4], qz = transforms[i * 7 + 5], qw = transforms[i * 7 + 6];

        // which local axis is the bone?
        let ax = 0;
        if (h[1] > h[ax]) ax = 1;
        if (h[2] > h[ax]) ax = 2;
        const halfLen = h[ax];
        const others = [0, 1, 2].filter((k) => k !== ax);
        const r = Math.max(h[others[0]], h[others[1]]) * scale;

        // rotate the local axis into world space by the body's quaternion
        const local = [0, 0, 0];
        local[ax] = 1;
        const [vx, vy, vz] = rotateByQuat(local[0], local[1], local[2], qx, qy, qz, qw);

        // pull the ends in by r so the capsule's caps land on the box's ends rather than beyond them
        const reach = Math.max(0, halfLen - r) * scale;
        bones.push({
            a: [px * scale - vx * reach, py * scale - vy * reach, pz * scale - vz * reach],
            b: [px * scale + vx * reach, py * scale + vy * reach, pz * scale + vz * reach],
            r,
        });
    }
    return bones;
}

// v = q * v * q^-1, written out. Not imported from anywhere because this module deliberately depends on nothing:
// it is the joint between two halves of the engine and must not drag either one in.
function rotateByQuat(vx, vy, vz, qx, qy, qz, qw) {
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    return [
        vx + qw * tx + (qy * tz - qz * ty),
        vy + qw * ty + (qz * tx - qx * tz),
        vz + qw * tz + (qx * ty - qy * tx),
    ];
}
