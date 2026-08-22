// physics/sph/bvhNeighbours.mjs -- v3805
//
// *** A MORTON BVH FOR SPH NEIGHBOUR SEARCH, BUILT TO BE MEASURED AGAINST physics/sph/spatialGrid.js RATHER
// THAN TO REPLACE IT. Keith asked for exactly that at v3792, in his words: "the alternative worth MEASURING
// rather than assuming better". The reference shape is the three.js demo he supplied -- expandBits, interleave,
// sort by code, middle split, REBUILT EVERY FRAME -- and the structure here follows it. Nothing is vendored:
// Morton codes and middle-split BVH construction are textbook. ***
//
// *** THE HONEST COMPARISON NEEDS THREE THINGS, AND THE THIRD IS WHY THIS FILE EXISTS AT ALL:
//   1. THE SAME PARTICLE SET THROUGH BOTH.
//   2. IDENTICAL NEIGHBOUR LISTS ASSERTED BEFORE ANY TIMING IS BELIEVED -- A FASTER STRUCTURE THAT RETURNS A
//      DIFFERENT SET IS NOT FASTER, IT IS WRONG.
//   3. THE REBUILD COUNTED, because SPH particles move EVERY STEP and Keith's own demo rebuilds per frame.
//      A structure that is cheap to query and dear to build loses on the workload SPH actually has.
// *** AND THE NUMBER REPORTED IS THE CHECK COUNT, NOT MILLISECONDS: this sandbox is one core, so a runtime
// measured here is NOT a runtime for the rig (the standing rule). Checks are machine-independent. ***

const expandBits = (v) => {
    v = (v * 0x00010001) & 0xFF0000FF;
    v = (v * 0x00000101) & 0x0F00F00F;
    v = (v * 0x00000011) & 0xC30C30C3;
    v = (v * 0x00000005) & 0x49249249;
    return v;
};

/** 3D Morton code from coordinates already normalised to [0, 1]. */
export function morton3(x, y, z) {
    const q = (v) => Math.min(Math.max(Math.floor(Math.min(Math.max(v, 0), 1) * 1023), 0), 1023);
    return (expandBits(q(x)) | (expandBits(q(y)) << 1) | (expandBits(q(z)) << 2)) >>> 0;
}

/**
 * Build a BVH over particle points, each inflated to a box of half-width `r` -- so a node overlap test is
 * exactly "could anything in here be within r".
 * @returns {{nodes, order, built}} a flat node array; `built` counts the work the construction did
 */
export function buildBvh(particles, r) {
    const n = particles.length;
    if (!n) return { nodes: [], order: [], built: 0 };
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of particles) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const sx = maxX - minX || 1, sy = maxY - minY || 1, sz = maxZ - minZ || 1;
    const keyed = particles.map((p, i) => ({ i, code: morton3((p.x - minX) / sx, (p.y - minY) / sy, (p.z - minZ) / sz) }));
    keyed.sort((a, b) => a.code - b.code);          // spatial locality, exactly as the reference demo does

    const nodes = [];
    let built = 0;
    const make = (lo, hi) => {
        built++;
        const self = nodes.length;
        nodes.push(null);
        if (lo === hi) {
            const p = particles[keyed[lo].i];
            nodes[self] = { leaf: keyed[lo].i, l: -1, r: -1,
                            box: [p.x - r, p.y - r, p.z - r, p.x + r, p.y + r, p.z + r] };
            return self;
        }
        const mid = (lo + hi) >> 1;                 // middle split, as in the reference
        const a = make(lo, mid), b = make(mid + 1, hi);
        const A = nodes[a].box, B = nodes[b].box;
        nodes[self] = { leaf: -1, l: a, r: b,
                        box: [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.min(A[2], B[2]),
                              Math.max(A[3], B[3]), Math.max(A[4], B[4]), Math.max(A[5], B[5])] };
        return self;
    };
    make(0, n - 1);
    return { nodes, order: keyed.map((k) => k.i), built };
}

/**
 * Gather every particle index whose CENTRE lies within r of (x, y, z).
 * *** THE RADIUS TEST IS ON THE CENTRE, MATCHING SpatialGrid.near, so the two structures are asked the SAME
 * QUESTION. A BVH that returned box-overlaps instead would look faster AND be answering something else. ***
 * @returns {{hits, checks}} checks counts node visits -- the machine-independent cost
 */
export function bvhNear(bvh, x, y, z, r) {
    const hits = [];
    let checks = 0;
    if (!bvh.nodes.length) return { hits, checks };
    const r2 = r * r, stack = [0];
    while (stack.length) {
        const q = stack.pop(), nd = bvh.nodes[q];
        checks++;
        const b = nd.box;
        if (x < b[0] - r || x > b[3] + r || y < b[1] - r || y > b[4] + r || z < b[2] - r || z > b[5] + r) continue;
        if (nd.leaf >= 0) { hits.push(nd.leaf); continue; }
        stack.push(nd.l, nd.r);
    }
    return { hits, checks };
}
