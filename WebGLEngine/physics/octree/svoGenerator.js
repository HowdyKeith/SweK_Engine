// physics/octree/svoGenerator.js
//
// Pack a sparse octree into the GPU-ready Laine-Karras format: two uint32 per node -- [ childMask | leafMask<<8 ,
// childPtr ] -- laid out so a WebGL2 shader can raymarch it from a texture. childMask has one bit per octant (child
// exists), leafMask one bit per octant (that child is a solid voxel leaf, not an internal pointer), and childPtr is
// the flat index where this node's existing children are stored CONTIGUOUSLY. To reach octant j's child you skip
// bitCount(childMask below j) slots -- the compaction that lets sparse trees stay small.
//
// The reference the follow-up transcript gave had a real bug here: its index-assignment pass set each node's
// childPtr but never set the branch children's OWN slot, so everything below the first level wrote to slot -1 and
// the buffer was corrupt. The fix is a single BFS that assigns every node a slot as it is placed. The gate proves
// the fix by round-tripping: a CPU reader walks the packed buffer and must return the exact source occupancy.

function bitCount(n) { n = n - ((n >> 1) & 0x55555555); n = (n & 0x33333333) + ((n >> 2) & 0x33333333); return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24; }

// octree = { root, size } from octree.js. A branch is {solid:-1, children:[8]}; a leaf is {solid:0|1, children:null}.
// Returns { buffer: Uint32Array (2 per node), nodeCount, size }. Solid leaves carry `color` in their data slot.
export function buildSVO(octree, color = 0xffffffff) {
    const root = octree.root;
    const buf = [];   // buf[slot] = [masks, dataOrPtr]
    if (root.children === null) {                      // whole world is one uniform leaf
        buf.push([0, root.solid ? color : 0]);
        return finalize(buf, octree.size);
    }
    buf.push([0, 0]);                                  // root reserves slot 0, filled when dequeued
    const queue = [{ node: root, slot: 0 }];
    let next = 1;                                      // next free slot (monotonic -> blocks never overlap)
    while (queue.length) {
        const { node, slot } = queue.shift();
        const kids = node.children;
        let childMask = 0, leafMask = 0;
        const existing = [];
        for (let i = 0; i < 8; i++) {
            const c = kids[i];
            const present = c.children !== null || c.solid === 1;   // internal subtree OR a solid voxel = present; empty leaf = absent
            if (present) { childMask |= (1 << i); existing.push(i); if (c.children === null) leafMask |= (1 << i); }
        }
        const childPtr = next;
        next += existing.length;
        buf[slot] = [((leafMask << 8) | childMask) >>> 0, childPtr];
        let off = 0;
        for (const i of existing) {                    // place children contiguously at childPtr..childPtr+k-1
            const c = kids[i], childSlot = childPtr + off; off++;
            if (c.children === null) buf[childSlot] = [0, color >>> 0];          // solid voxel leaf: data = color
            else { buf[childSlot] = [0, 0]; queue.push({ node: c, slot: childSlot }); }   // internal: placeholder, filled later
        }
    }
    return finalize(buf, octree.size);
}

function finalize(buf, size) {
    const out = new Uint32Array(buf.length * 2);
    for (let i = 0; i < buf.length; i++) { out[i * 2] = buf[i][0] >>> 0; out[i * 2 + 1] = buf[i][1] >>> 0; }
    return { buffer: out, nodeCount: buf.length, size };
}

// CPU reader over the packed buffer -- the same traversal the GPU raymarcher does, used to prove the pack is correct.
// Returns 1 if (x,y,z) lands inside a solid voxel leaf, else 0.
export function svoAt(buffer, size, x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) return 0;
    const rootMasks = buffer[0];
    if ((rootMasks & 0xff) === 0 && buffer.length === 2) return buffer[1] ? 1 : 0;   // single uniform-leaf world
    let slot = 0, x0 = 0, y0 = 0, z0 = 0, s = size;
    for (let guard = 0; guard < 64; guard++) {
        const masks = buffer[slot * 2], childPtr = buffer[slot * 2 + 1];
        const childMask = masks & 0xff, leafMask = (masks >> 8) & 0xff;
        const h = s >> 1;
        const cx = x >= x0 + h ? 1 : 0, cy = y >= y0 + h ? 1 : 0, cz = z >= z0 + h ? 1 : 0;
        const octant = cx + cy * 2 + cz * 4;
        if (!((childMask >> octant) & 1)) return 0;                // no child in this octant -> empty
        const childSlot = childPtr + bitCount(childMask & ((1 << octant) - 1));
        if ((leafMask >> octant) & 1) return 1;                    // solid voxel leaf
        x0 += cx * h; y0 += cy * h; z0 += cz * h; s = h; slot = childSlot;   // descend
    }
    return 0;
}

export { bitCount };
