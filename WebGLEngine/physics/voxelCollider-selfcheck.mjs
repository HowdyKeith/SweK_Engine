// WebGLEngine/physics/voxelCollider-selfcheck.mjs — v2634
//
// Run: node physics/voxelCollider-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The soundness of "voxel body -> box3d colliders" rests entirely on ONE property: the boxes EXACTLY PARTITION the
// filled voxels. If they do, box3d's (already gated) box-vs-box collision against the boxes is collision against the
// body -- no gap to fall through, no phantom wall. So the gate hammers the partition on shapes chosen to break it,
// then checks the adapter hands box3d the right world geometry. The real WASM drop test is rig-only (box3d.wasm does
// not load headless here) and is called out as such.
import { boxCover, boxToCollider, addVoxelBody } from "./voxelBoxCover.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// shapes chosen to stress the cover differently
const shapes = {
    "single voxel": { dims: [1, 1, 1], f: () => true },
    "solid 8 cube": { dims: [8, 8, 8], f: () => true },
    "flat slab 10x1x10": { dims: [10, 1, 10], f: () => true },
    "L-beam": { dims: [6, 6, 2], f: (x, y) => x < 2 || y < 2 },
    "hollow shell 6": { dims: [6, 6, 6], f: (x, y, z) => x === 0 || y === 0 || z === 0 || x === 5 || y === 5 || z === 5 },
    "sphere r5": { dims: [11, 11, 11], f: (x, y, z) => (x - 5) ** 2 + (y - 5) ** 2 + (z - 5) ** 2 <= 25 },
    "3D checkerboard 8": { dims: [8, 8, 8], f: (x, y, z) => (x + y + z) % 2 === 0 },
    "two islands": { dims: [7, 2, 2], f: (x) => x < 2 || x > 4 },
};

// ---- 1. EXACT PARTITION: every filled cell covered once, no empty cell ever covered -------------------------------
{
    let worst = "";
    let allOk = true;
    for (const [name, s] of Object.entries(shapes)) {
        const [sx, sy, sz] = s.dims;
        const boxes = boxCover(s.f, s.dims);
        const count = new Int32Array(sx * sy * sz);      // how many boxes cover each cell
        for (const b of boxes)
            for (let z = b.min[2]; z <= b.max[2]; z++)
                for (let y = b.min[1]; y <= b.max[1]; y++)
                    for (let x = b.min[0]; x <= b.max[0]; x++) count[x + sx * (y + sy * z)]++;
        let good = true;
        for (let z = 0; z < sz && good; z++)
            for (let y = 0; y < sy && good; y++)
                for (let x = 0; x < sx && good; x++) {
                    const want = s.f(x, y, z) ? 1 : 0;   // filled -> covered exactly once; empty -> never
                    if (count[x + sx * (y + sy * z)] !== want) { good = false; worst = name; }
                }
        if (!good) allOk = false;
    }
    ok("!! the boxes exactly partition the filled voxels on every shape", allOk,
       allOk ? "every filled cell covered exactly once and no empty cell ever covered, across cube / slab / L-beam / hollow shell / sphere / checkerboard / two islands. THE COLLIDER VOLUME EQUALS THE VOXEL VOLUME." : "partition broken on '" + worst + "' -- a double-covered cell is a doubled mass, an uncovered filled cell is a gap the sim falls through, a covered empty cell is a phantom wall.");
}

// ---- 2. REDUCTION: greedy actually merges -------------------------------------------------------------------------
{
    const cube = boxCover(shapes["solid 8 cube"].f, [8, 8, 8]);
    const slab = boxCover(shapes["flat slab 10x1x10"].f, [10, 1, 10]);
    ok("!! a solid box becomes ONE collider, not one-per-voxel", cube.length === 1 && slab.length === 1,
       "solid 8x8x8 -> " + cube.length + " box (was 512 voxels), flat 10x1x10 -> " + slab.length + " box (was 100). box3d gets a handful of colliders, not a swarm.");
}

// ---- 3. DISJOINT: boxes never overlap -----------------------------------------------------------------------------
{
    const boxes = boxCover(shapes["sphere r5"].f, [11, 11, 11]);
    let overlap = false;
    const sep = (a, b) => a.max[0] < b.min[0] || b.max[0] < a.min[0] || a.max[1] < b.min[1] || b.max[1] < a.min[1] || a.max[2] < b.min[2] || b.max[2] < a.min[2];
    for (let i = 0; i < boxes.length && !overlap; i++)
        for (let j = i + 1; j < boxes.length; j++) if (!sep(boxes[i], boxes[j])) { overlap = true; break; }
    ok("!! no two boxes overlap (a partition, not a cover with double-count)", !overlap,
       boxes.length + " boxes for the sphere, all pairwise disjoint. Overlap would double-count mass where boxes intersect.");
}

// ---- 4. HONEST LIMIT: a checkerboard cannot merge, and the cover admits it -----------------------------------------
{
    const boxes = boxCover(shapes["3D checkerboard 8"].f, [8, 8, 8]);
    let filled = 0;
    for (let z = 0; z < 8; z++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y + z) % 2 === 0) filled++;
    ok("!! a checkerboard yields one box per cell -- no dishonest over-merge", boxes.length === filled,
       boxes.length + " boxes for " + filled + " isolated cells. A COARSE MERGE THAT SPANNED THE GAPS WOULD BE A COLLIDER THAT LIES ABOUT WHERE THE BODY IS.");
}

// ---- 5. ADAPTER GEOMETRY: box3d receives the exact world AABB of each box -----------------------------------------
{
    const v = 0.25, origin = [1, 2, 3];
    const calls = [];
    const mockWorld = { addBox: (spec) => { calls.push(spec); return calls.length - 1; } };
    const { boxes } = addVoxelBody(mockWorld, shapes["L-beam"].f, [6, 6, 2], { voxelSize: v, origin, type: "dynamic" });
    let good = calls.length === boxes.length;
    for (let i = 0; i < boxes.length && good; i++) {
        const b = boxes[i], c = calls[i];
        // reconstruct the world AABB box3d will see from pos +/- half, compare to the voxel box's true world AABB
        for (const ax of [0, 1, 2]) {
            const lo = c.pos[ax] - c.half[ax], hi = c.pos[ax] + c.half[ax];
            const trueLo = b.min[ax] * v + origin[ax], trueHi = (b.max[ax] + 1) * v + origin[ax];
            if (Math.abs(lo - trueLo) > 1e-9 || Math.abs(hi - trueHi) > 1e-9) good = false;
        }
        if (c.type !== "dynamic") good = false;
    }
    ok("!! the adapter hands box3d the exact world AABB and type of each box", good,
       "each addBox pos/half reconstructs the voxel box's true world span (voxelSize + origin applied), type forwarded. A WRONG HALF-EXTENT IS A COLLIDER THAT DOES NOT MATCH THE THING YOU SEE.");
}

// ---- rig-only: the real drop -------------------------------------------------------------------------------------
console.log("  RIG    a real box3d drop (voxel slab holds a dynamic crate, no fall-through) is rig-only -- box3d.wasm does not load headless here. Run on Galaxina via backend-physics-check.html.");

console.log(fails ? "\nvoxelCollider-selfcheck: " + fails + " FAILED" : "\nvoxelCollider-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
