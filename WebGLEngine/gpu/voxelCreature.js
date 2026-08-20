// ===================================================================
// gpu/voxelCreature.js
// -------------------------------------------------------------------
// PATH 2 client side: turn a Gemini voxel blueprint ([[x,y,z,c],...])
// into a renderable mesh. Builds a culled cube mesh (internal faces
// between adjacent voxels are skipped), with per-vertex colors from an
// 8-entry palette, centered on its own centroid so it spawns nicely.
// The output format (positions / indices / normals + a per-vertex
// color Float32Array) feeds straight into buildSpineRigGeometry +
// registerSpineRig, so a generated creature can be auto-rigged and
// animated exactly like the fish/eel/kaiju.
// ===================================================================

// c index → RGB (0..1). Matches the palette described in the Gemini prompt.
export const CREATURE_PALETTE = [
    [0.60, 0.60, 0.64], // 0 grey
    [0.86, 0.24, 0.20], // 1 red
    [0.95, 0.55, 0.18], // 2 orange
    [0.93, 0.85, 0.26], // 3 yellow
    [0.34, 0.72, 0.34], // 4 green
    [0.30, 0.78, 0.82], // 5 cyan
    [0.30, 0.46, 0.86], // 6 blue
    [0.93, 0.93, 0.96], // 7 white
];

// Six cube faces: outward normal, neighbor offset (for culling), and the
// four CCW corner offsets (half-unit cube).
const H = 0.5;
const FACES = [
    { n: [ 1, 0, 0], d: [ 1, 0, 0], c: [[H,-H,-H],[H,H,-H],[H,H,H],[H,-H,H]] },
    { n: [-1, 0, 0], d: [-1, 0, 0], c: [[-H,-H,H],[-H,H,H],[-H,H,-H],[-H,-H,-H]] },
    { n: [ 0, 1, 0], d: [ 0, 1, 0], c: [[-H,H,-H],[-H,H,H],[H,H,H],[H,H,-H]] },
    { n: [ 0,-1, 0], d: [ 0,-1, 0], c: [[-H,-H,H],[-H,-H,-H],[H,-H,-H],[H,-H,H]] },
    { n: [ 0, 0, 1], d: [ 0, 0, 1], c: [[H,-H,H],[H,H,H],[-H,H,H],[-H,-H,H]] },
    { n: [ 0, 0,-1], d: [ 0, 0,-1], c: [[-H,-H,-H],[-H,H,-H],[H,H,-H],[H,-H,-H]] },
];

/**
 * @param {Array<[number,number,number,number]>} voxels  [x,y,z,colorIndex]
 * @param {object} [opts]
 * @param {number} [opts.unit=1]   world size of one voxel before entity scale
 * @returns {{positions:Float32Array, indices:Uint32Array, normals:Float32Array, colors:Float32Array, vertexCount:number, voxelCount:number, bounds:object}}
 */
export function buildVoxelMesh(voxels, opts = {}) {
    const unit = opts.unit ?? 1;
    const occ = new Set();
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const v of voxels) {
        const x = v[0] | 0, y = v[1] | 0, z = v[2] | 0;
        occ.add(x + "," + y + "," + z);
        if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    // Center on centroid of the bounding box so the entity origin is sensible.
    const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2, oz = (minZ + maxZ) / 2;

    const pos = [], nrm = [], col = [], idx = [];
    let vcount = 0;
    const built = new Set();
    for (const v of voxels) {
        const x = v[0] | 0, y = v[1] | 0, z = v[2] | 0;
        const k = x + "," + y + "," + z;
        if (built.has(k)) continue;   // defensive: skip duplicate coords
        built.add(k);
        let ci = v[3] | 0; if (ci < 0 || ci > 7) ci = 0;
        const rgb = CREATURE_PALETTE[ci];
        for (const f of FACES) {
            // Cull faces shared with an occupied neighbor.
            if (occ.has((x + f.d[0]) + "," + (y + f.d[1]) + "," + (z + f.d[2]))) continue;
            const base = vcount;
            for (const corner of f.c) {
                pos.push((x - ox + corner[0]) * unit, (y - oy + corner[1]) * unit, (z - oz + corner[2]) * unit);
                nrm.push(f.n[0], f.n[1], f.n[2]);
                col.push(rgb[0], rgb[1], rgb[2]);
                vcount++;
            }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
    }

    return {
        positions: new Float32Array(pos),
        normals:   new Float32Array(nrm),
        colors:    new Float32Array(col),
        indices:   new Uint32Array(idx),
        vertexCount: vcount,
        voxelCount: voxels.length,
        bounds: { minX, minY, minZ, maxX, maxY, maxZ },
    };
}
