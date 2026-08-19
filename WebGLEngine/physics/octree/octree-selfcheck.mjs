// physics/octree/octree-selfcheck.mjs
//
// Run: node physics/octree/octree-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The octree is only useful if it is a FAITHFUL compression -- querying it must return exactly what the source grid
// held, for every cell, or it is silently lying about the world. So the spine is a cell-by-cell equality check
// against the flat grid. Around it: a mostly-uniform world really does collapse to far fewer nodes than cells
// (the point of a sparse tree), the build is deterministic, and -- tying it to the pathfinder -- A* run on the
// octree's occupancy returns the byte-identical path it returns on the flat grid, so the octree is a true drop-in.
import { createHash } from "node:crypto";
import { buildOctree, octreeAt, octreeFromGrid, octreeToBlocked } from "./octree.js";
import { astar } from "../../brain/astar/astar.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// a deterministic 32^3 world: a solid slab plus a couple of solid boxes in empty space
const SIZE = 32;
const occ = (x, y, z) => {
    if (y < 4) return 1;                                    // floor slab
    if (x >= 8 && x < 16 && y >= 8 && y < 16 && z >= 8 && z < 16) return 1;   // a solid box
    if (x >= 20 && x < 24 && z >= 20 && z < 28) return 1;   // a wall
    return 0;
};

// ---- 1. FIDELITY: the octree returns exactly the source grid for every cell -----------------------------------
{
    const tree = buildOctree(SIZE, occ);
    let mism = 0;
    for (let z = 0; z < SIZE; z++) for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (octreeAt(tree, x, y, z) !== occ(x, y, z)) mism++;
    ok("!! the octree reproduces the source occupancy for every cell", mism === 0,
       "all " + (SIZE ** 3) + " cells match the source grid exactly -- the compression is lossless, the tree never lies about what is solid.");
}

// ---- 2. COMPRESSION: a sparse world costs far fewer nodes than cells -------------------------------------------
{
    const tree = buildOctree(SIZE, occ);
    const cells = SIZE ** 3;
    ok("!! a mostly-uniform world collapses to far fewer nodes than cells", tree.nodeCount < cells / 4,
       "occupancy of " + cells + " cells stored in " + tree.nodeCount + " octree nodes (" + (100 * (1 - tree.nodeCount / cells)).toFixed(1) + "% fewer) -- uniform regions merged into single leaves.");
}

// ---- 3. DETERMINISM: building twice yields the identical tree --------------------------------------------------
{
    const hashTree = (t) => { const h = createHash("sha256"); const b = new Uint8Array(SIZE ** 3); let i = 0; for (let z = 0; z < SIZE; z++) for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) b[i++] = octreeAt(t, x, y, z); return h.update(String(t.nodeCount) + ":").update(b).digest("hex"); };
    const a = hashTree(buildOctree(SIZE, occ)), b = hashTree(buildOctree(SIZE, occ));
    ok("!! the octree build is deterministic (identical node count and readback)", a === b,
       "two builds of the same world produced the identical node count and the identical cell-by-cell readback hash -- integer subdivision, nothing to vary.");
}

// ---- 4. A* DROP-IN: pathfinding on the octree occupancy == pathfinding on the flat grid -----------------------
{
    const nx = 24, ny = 1, nz = 24;                         // a 2D plane world for a clean path test
    const blocked = new Uint8Array(nx * ny * nz);
    for (let zz = 2; zz < 20; zz++) blocked[10 + nx * (0 + ny * zz)] = 1;   // a wall to route around
    const tree = octreeFromGrid(nx, ny, nz, blocked);
    const viaOctree = octreeToBlocked(tree, nx, ny, nz);
    const start = 0, goal = nx * ny * nz - 1;
    const pFlat = astar({ nx, ny, nz, blocked }, start, goal).path;
    const pOct = astar({ nx, ny, nz, blocked: viaOctree }, start, goal).path;
    const same = pFlat.length === pOct.length && pFlat.every((v, i) => v === pOct[i]);
    ok("!! A* on the octree's occupancy returns the identical path as on the flat grid", same,
       "the octree feeds A* the same walkability the flat array does, so the pathfinder returns the byte-identical route -- a true drop-in occupancy source.");
}

// ---- 5. SABOTAGE-PROOF MERGE: mixed regions are NOT merged (a targeted check) ----------------------------------
{
    // a region with a single solid cell in an otherwise empty octant must NOT collapse to empty
    const tree = buildOctree(4, (x, y, z) => (x === 1 && y === 1 && z === 1) ? 1 : 0);
    ok("!! a region that is not uniform is never merged away", octreeAt(tree, 1, 1, 1) === 1 && octreeAt(tree, 0, 0, 0) === 0,
       "one solid cell among empties survives as solid while its neighbours stay empty -- the merge only collapses TRULY uniform regions.");
}

console.log(fails ? "\noctree-selfcheck: " + fails + " FAILED" : "\noctree-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
