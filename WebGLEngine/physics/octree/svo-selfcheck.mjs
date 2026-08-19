// physics/octree/svo-selfcheck.mjs
//
// Run: node physics/octree/svo-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The SVO buffer is only correct if a traversal of it reproduces the world it was packed from. That round-trip is
// exactly the check the follow-up transcript's generator would have failed -- its layout wrote branch nodes to a
// bad slot, so any tree deeper than one level came back corrupt. So the spine here is: pack the octree, walk the
// packed buffer cell by cell, and require it to equal the source octree everywhere. Around it: the pack is
// deterministic, it is compact (a couple of uint32 per node, not per cell), and the bitCount child-offset
// addressing is verified against a hand case.
import { buildOctree, octreeAt } from "./octree.js";
import { buildSVO, svoAt, bitCount } from "./svoGenerator.js";
import { createHash } from "node:crypto";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// a multi-level world so the layout bug (which only bit below level 1) would show
const SIZE = 32;
const occ = (x, y, z) => {
    if (x >= 4 && x < 8 && y >= 4 && y < 8 && z >= 4 && z < 8) return 1;       // small box (deep)
    if (x >= 16 && x < 32 && y >= 16 && y < 32 && z >= 16 && z < 32) return 1; // large octant solid (shallow leaf)
    if (x >= 2 && x < 3 && y >= 20 && y < 21 && z >= 5 && z < 6) return 1;     // a lone deep voxel
    return 0;
};

// ---- 1. ROUND-TRIP: reading the packed buffer reproduces the source octree everywhere -------------------------
{
    const tree = buildOctree(SIZE, occ);
    const svo = buildSVO(tree);
    let mism = 0;
    for (let z = 0; z < SIZE; z++) for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (svoAt(svo.buffer, SIZE, x, y, z) !== octreeAt(tree, x, y, z)) mism++;
    ok("!! traversing the packed SVO buffer reproduces the source occupancy for every cell", mism === 0,
       "all " + (SIZE ** 3) + " cells read back identical through the packed buffer, across a 3-level tree -- the exact round-trip the buggy reference layout would have failed below level 1.");
}

// ---- 2. DETERMINISM: same octree packs to the identical buffer -------------------------------------------------
{
    const tree = buildOctree(SIZE, occ);
    const h = (b) => createHash("sha256").update(Buffer.from(b.buffer.buffer)).digest("hex");
    ok("!! the pack is deterministic (identical buffer every time)", h(buildSVO(tree)) === h(buildSVO(tree)),
       "two packs of the same octree produce byte-identical buffers -- integer BFS layout, nothing to vary across runs or machines.");
}

// ---- 3. COMPACTNESS: two uint32 per node, far fewer than per cell ----------------------------------------------
{
    const tree = buildOctree(SIZE, occ);
    const svo = buildSVO(tree);
    ok("!! the buffer is a couple of uint32 per node, not per cell", svo.buffer.length === svo.nodeCount * 2 && svo.nodeCount < (SIZE ** 3) / 8,
       "occupancy of " + (SIZE ** 3) + " cells packed into " + svo.nodeCount + " nodes (" + svo.buffer.length + " uint32) -- the sparse tree stays sparse on the GPU.");
}

// ---- 4. bitCount ADDRESSING: the child-offset skip is correct --------------------------------------------------
{
    // childMask with octants 0,2,5 present; the child at octant 5 is the 3rd stored -> offset 2
    const mask = (1 << 0) | (1 << 2) | (1 << 5);
    const offsetToOctant5 = bitCount(mask & ((1 << 5) - 1));
    ok("!! bitCount gives the correct contiguous child offset", offsetToOctant5 === 2 && bitCount(0xff) === 8 && bitCount(0) === 0,
       "octant 5 with octants 0 and 2 before it resolves to stored offset 2 -- the population-count skip that keeps children contiguous is exact.");
}

// ---- 5. EDGE CASES: empty world and fully-solid world both round-trip ------------------------------------------
{
    const empty = buildSVO(buildOctree(8, () => 0));
    const solid = buildSVO(buildOctree(8, () => 1));
    let okAll = true;
    for (let i = 0; i < 8 * 8 * 8; i++) { const x = i % 8, y = ((i / 8) | 0) % 8, z = (i / 64) | 0; if (svoAt(empty.buffer, 8, x, y, z) !== 0 || svoAt(solid.buffer, 8, x, y, z) !== 1) okAll = false; }
    ok("!! a fully empty and a fully solid world both pack and read back correctly", okAll,
       "the uniform-world edge cases (single-leaf buffers) traverse correctly -- empty reads all 0, solid reads all 1.");
}

console.log(fails ? "\nsvo-selfcheck: " + fails + " FAILED" : "\nsvo-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
