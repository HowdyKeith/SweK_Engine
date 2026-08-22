// WebGLEngine/physics/voxelPose-selfcheck.mjs — v2636
//
// Run: node physics/voxelPose-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Posing is a rigid transform, and a rigid transform is checkable against geometry it cannot fake: identity leaves
// the body where it was, a quarter turn sends a known point to a known place, translation shifts everything by the
// same vector, distances between boxes are preserved (rotation is an isometry), and the world AABB contains every
// rotated corner and is tight against them. A bug in the quaternion math breaks at least one of these.
import { boxCover } from "./voxelBoxCover.js";
import { poseBoxes, worldAABB, rotateByQuat } from "./voxelPose.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// a small asymmetric body so rotations actually move things
const dims = [6, 3, 2];
const body = (x, y) => x < 4 || y < 1;
const boxes = boxCover(body, dims);
const IDENT = [0, 0, 0, 1];

// ---- 1. IDENTITY LEAVES EVERY BOX WHERE IT WAS --------------------------------------------------------------------
{
    const posed = poseBoxes(boxes, { pos: [0, 0, 0], quat: IDENT }, { pivot: [0, 0, 0] });
    let good = true;
    posed.forEach((p, i) => {
        const local = boxes[i];
        const cx = (local.min[0] + local.max[0] + 1) / 2, cy = (local.min[1] + local.max[1] + 1) / 2, cz = (local.min[2] + local.max[2] + 1) / 2;
        if (!near(p.center[0], cx) || !near(p.center[1], cy) || !near(p.center[2], cz)) good = false;
    });
    ok("!! the identity transform leaves every box exactly where it was", good,
       "no rotation, no translation -> posed centres equal local centres. Posing must be the identity when the transform is.");
}

// ---- 2. A QUARTER TURN SENDS A KNOWN POINT TO A KNOWN PLACE --------------------------------------------------------
{
    // 90 deg about Z: (1,0,0) -> (0,1,0)
    const q = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const r = rotateByQuat(q, [1, 0, 0]);
    const r2 = rotateByQuat(q, [0, 1, 0]);   // -> (-1,0,0)
    ok("!! a 90-degree turn about Z maps +x to +y and +y to -x", near(r[0], 0, 1e-12) && near(r[1], 1, 1e-12) && near(r2[0], -1, 1e-12) && near(r2[1], 0, 1e-12),
       "rotateByQuat(90 about Z, +x) = (" + r.map((n) => n.toFixed(2)) + "), (+y) = (" + r2.map((n) => n.toFixed(2)) + "). The rotation is real, not a relabelling.");
}

// ---- 3. PURE TRANSLATION SHIFTS EVERYTHING BY THE SAME VECTOR ------------------------------------------------------
{
    const base = poseBoxes(boxes, { pos: [0, 0, 0], quat: IDENT });
    const moved = poseBoxes(boxes, { pos: [10, -3, 7], quat: IDENT });
    let good = true;
    base.forEach((p, i) => {
        if (!near(moved[i].center[0] - p.center[0], 10) || !near(moved[i].center[1] - p.center[1], -3) || !near(moved[i].center[2] - p.center[2], 7)) good = false;
    });
    ok("!! pure translation shifts every box by the same vector", good,
       "pos = [10,-3,7], no rotation -> every centre offset by exactly that. Translation is uniform.");
}

// ---- 4. ROTATION IS AN ISOMETRY: BOX-TO-BOX DISTANCES ARE PRESERVED ------------------------------------------------
{
    // an arbitrary tilt: 30 deg about the [1,1,1] axis
    const a = Math.PI / 6, s = Math.sin(a / 2) / Math.sqrt(3);
    const q = [s, s, s, Math.cos(a / 2)];
    const local = poseBoxes(boxes, { pos: [0, 0, 0], quat: IDENT });
    const tilted = poseBoxes(boxes, { pos: [5, 5, 5], quat: q }, { pivot: [3, 1.5, 1] });
    let good = boxes.length >= 2;
    for (let i = 0; i < boxes.length && good; i++)
        for (let j = i + 1; j < boxes.length; j++)
            if (!near(dist(local[i].center, local[j].center), dist(tilted[i].center, tilted[j].center), 1e-9)) good = false;
    ok("!! rotation preserves every box-to-box distance (a rigid body, not a warped one)", good,
       "under a 30-degree tilt about [1,1,1] with a translated pivot, every pairwise distance between box centres is unchanged. A NON-ISOMETRY WOULD BE A BODY THAT STRETCHED WHEN IT TURNED.");
}

// ---- 5. THE WORLD AABB CONTAINS EVERY ROTATED CORNER, AND IS TIGHT -------------------------------------------------
{
    const a = 0.9, s = Math.sin(a / 2);
    const q = [s * 0.3, s * 0.8, s * 0.5, Math.cos(a / 2)];
    const opts = { voxelSize: 1, pivot: [3, 1.5, 1] };
    const tf = { pos: [2, 0, -1], quat: q };
    const aabb = worldAABB(boxes, tf, opts);
    const posed = poseBoxes(boxes, tf, opts);
    let inside = true, touchMin = [false, false, false], touchMax = [false, false, false];
    for (const p of posed)
        for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) for (let sz = -1; sz <= 1; sz += 2) {
            const r = rotateByQuat(p.quat, [sx * p.half[0], sy * p.half[1], sz * p.half[2]]);
            for (let i = 0; i < 3; i++) {
                const w = p.center[i] + r[i];
                if (w < aabb.min[i] - 1e-9 || w > aabb.max[i] + 1e-9) inside = false;
                if (near(w, aabb.min[i], 1e-9)) touchMin[i] = true;
                if (near(w, aabb.max[i], 1e-9)) touchMax[i] = true;
            }
        }
    const tight = touchMin.every(Boolean) && touchMax.every(Boolean);
    ok("!! the world AABB contains every rotated corner and hugs them on all six faces", inside && tight,
       "under an arbitrary tilt, no corner escapes the AABB (contains=" + inside + ") and each of the six faces is touched by a corner (tight=" + tight + "). A LOOSE AABB CULLS THINGS IT SHOULD NOT; A TOO-SMALL ONE MISSES COLLISIONS.");
}

console.log(fails ? "\nvoxelPose-selfcheck: " + fails + " FAILED" : "\nvoxelPose-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
