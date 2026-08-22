// physics/octree/octree.js
//
// A sparse octree over a voxel occupancy grid -- the CPU spatial structure the voxel world wants, and a drop-in
// occupancy source for A*. It recursively splits a cubic region into eight octants and MERGES any region that is
// uniformly empty or uniformly solid back into a single leaf, so a mostly-empty world costs a handful of nodes
// instead of one per cell. Pure integer: subdivision is by bit-shift, occupancy is 0/1, no floats anywhere, so the
// tree is bit-identical across machines and its readback exactly reproduces the source grid.
//
// This is the CPU octree (spatial partitioning, culling, A* nodes). The GPU-packed sparse voxel octree for
// raymarching -- Laine-Karras two-uint32 nodes in a texture -- is a separate layer that builds on this shape.

// occ(x,y,z) -> 0/1 (out of range counts as empty). size must be a power of two. Returns { root, size, nodeCount }.
export function buildOctree(size, occ) {
    function build(x0, y0, z0, s) {
        if (s === 1) return { solid: occ(x0, y0, z0) ? 1 : 0, children: null };
        const h = s >> 1;
        const kids = new Array(8);
        let uniform = true, first = -1;
        for (let cz = 0; cz < 2; cz++) for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
            const child = build(x0 + cx * h, y0 + cy * h, z0 + cz * h, h);
            kids[cx + cy * 2 + cz * 4] = child;
            if (child.children !== null) uniform = false;                 // a branch child -> cannot merge
            else if (first === -1) first = child.solid;
            else if (child.solid !== first) uniform = false;              // leaves disagree -> cannot merge
        }
        if (uniform) return { solid: first, children: null };            // MERGE: uniform region collapses to one leaf (children discarded)
        return { solid: -1, children: kids };
    }
    const root = build(0, 0, 0, size);
    return { root, size, nodeCount: countNodes(root) };                  // count the FINAL merged tree, not the nodes built and discarded
}

// count the nodes actually present in the final (merged) tree
export function countNodes(node) {
    if (node.children === null) return 1;
    let c = 1;
    for (const k of node.children) c += countNodes(k);
    return c;
}

// occupancy query: descend the octree to the leaf containing (x,y,z). Must equal the source grid exactly.
export function octreeAt(tree, x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= tree.size || y >= tree.size || z >= tree.size) return 0;
    let node = tree.root, x0 = 0, y0 = 0, z0 = 0, s = tree.size;
    while (node.children !== null) {
        const h = s >> 1;
        const cx = x >= x0 + h ? 1 : 0, cy = y >= y0 + h ? 1 : 0, cz = z >= z0 + h ? 1 : 0;
        x0 += cx * h; y0 += cy * h; z0 += cz * h; s = h;
        node = node.children[cx + cy * 2 + cz * 4];
    }
    return node.solid;
}

// convenience: build a power-of-two octree from a flat blocked grid, padding out-of-range to empty
export function octreeFromGrid(nx, ny, nz, blocked) {
    let size = 1; while (size < nx || size < ny || size < nz) size <<= 1;
    const occ = (x, y, z) => (x < nx && y < ny && z < nz) ? blocked[x + nx * (y + ny * z)] : 0;
    return buildOctree(size, occ);
}

// reconstruct a flat blocked array from the octree -- used to prove fidelity and to feed A* unchanged
export function octreeToBlocked(tree, nx, ny, nz) {
    const blocked = new Uint8Array(nx * ny * nz);
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) blocked[x + nx * (y + ny * z)] = octreeAt(tree, x, y, z);
    return blocked;
}
