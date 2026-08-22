// voxel/rleMeshOpt.js
//
// RLE mesh optimisation (v2795) -- the two wins the v2794 benchmark identified. Measured there: meshChunkRLE was
// 4.5-6x slower than the greedy mesher AND emitted 2.3x-512x the triangles. The triangle blowup had two causes,
// and this module fixes both without changing what the player sees:
//
//   1. INVISIBLE WORLD FLOOR. meshChunkRLE emits the full S*S downward face slab at the world floor; the greedy
//      mesher deliberately skips it because it can never be seen. skipFloorY drops exactly those faces.
//   2. UNMERGED +-Y FACES. rleMesh emits +-Y as UNIT quads while greedy merges in all three dimensions, so flat
//      ground costs 1024 triangles where greedy spends 2. mergeYFaces does a greedy 2D rectangle merge per
//      Y-plane.
//
// AO CORRECTNESS (the reason this isn't a naive merge): a merged quad only samples AO at its four corners, so
// merging faces with differing AO would smooth an occluder away -- the same trap splitSideSpansByAO fixes for
// side spans. So a face is only a merge candidate when its OWN four corner AO values are all equal, and faces
// only merge with neighbours sharing that same value (and voxel type). Anything with varying AO stays a unit
// quad. The result is AO-identical to the unmerged mesh, just cheaper.
//
// Browser/worker-safe (imports only the pure voxel modules).

import { yFacesFromRLE } from "./rleSurface.js";
import { sideFacesFromRLE } from "./rleSideFaces.js";
import { getRLE } from "./voxelRLE.js";
import { vertexAO } from "./voxelAO.js";

// The 4 corners of a Y face, with each corner's (du,dw) lean -- shared by the AO probe and the emitter.
function yCorners(x, y, z, dir) {
    const Y = dir > 0 ? y + 1 : y;
    return dir > 0
        ? [[[x, Y, z], -1, -1], [[x, Y, z + 1], -1, 1], [[x + 1, Y, z + 1], 1, 1], [[x + 1, Y, z], 1, -1]]
        : [[[x, Y, z], -1, -1], [[x + 1, Y, z], 1, -1], [[x + 1, Y, z + 1], 1, 1], [[x, Y, z + 1], -1, 1]];
}

// AO of a single unit Y face -> [ao0..ao3] in the emitter's corner order.
export function faceAO(rle, f, isSolid) {
    const n = f.dir > 0 ? [0, 1, 0] : [0, -1, 0];
    return yCorners(f.x, f.y, f.z, f.dir).map(([pos, du, dw]) => vertexAO(rle, pos, n, du, dw, isSolid));
}

// Greedy 2D rectangle merge of +-Y faces.
// opts: { skipFloorY, mergeY: true, computeAO: true, keepFace(x,y,z) }
// keepFace is LOAD-BEARING when meshing a padded chunk: faces must be filtered to the real chunk BEFORE merging,
// because a merged rectangle spanning the padded shell cannot be trimmed afterwards (the downstream keepVoxel
// filter tests one centroid per quad, so it would keep or drop the whole rectangle -- silently pulling neighbour
// faces into the chunk). Filtering first keeps every merged rectangle inside the real chunk.
// Returns { rects, units } -- rects are merged [x0,x1) x [z0,z1) regions, units are unmergeable single faces.
export function mergeYFaces(rle, isSolid, opts = {}) {
    const mergeY = opts.mergeY !== false;
    const computeAO = opts.computeAO !== false;
    const skipFloorY = opts.skipFloorY === undefined ? null : opts.skipFloorY;

    const keepFace = typeof opts.keepFace === "function" ? opts.keepFace : null;
    const faces = [];
    for (const f of yFacesFromRLE(rle, isSolid)) {
        if (skipFloorY !== null && f.dir < 0 && f.y === skipFloorY) continue;   // the never-visible world floor
        if (keepFace && !keepFace(f.x, f.y, f.z)) continue;                     // trim to the real chunk BEFORE merging
        faces.push(f);
    }
    if (!mergeY) return { rects: [], units: faces };

    // bucket by (dir, y); within a bucket a cell's merge key is type + its uniform AO value
    const buckets = new Map();
    const units = [];
    for (const f of faces) {
        const type = getRLE(rle, f.x, f.y, f.z);
        let key = null;
        if (computeAO) {
            const ao = faceAO(rle, f, isSolid);
            const uniform = ao[0] === ao[1] && ao[1] === ao[2] && ao[2] === ao[3];
            if (!uniform) { units.push({ ...f, ao }); continue; }   // varying AO -> never merge, stays exact
            key = type + "|" + ao[0];
        } else {
            key = String(type);
        }
        const bk = f.dir + "," + f.y;
        if (!buckets.has(bk)) buckets.set(bk, new Map());
        buckets.get(bk).set(f.x + "," + f.z, { x: f.x, z: f.z, key, dir: f.dir, y: f.y });
    }

    const rects = [];
    for (const cells of buckets.values()) {
        const taken = new Set();
        const at = (x, z) => cells.get(x + "," + z);
        const sorted = [...cells.values()].sort((a, b) => (a.x - b.x) || (a.z - b.z));
        for (const c of sorted) {
            const id = c.x + "," + c.z;
            if (taken.has(id)) continue;
            // extend along +x while same key and free
            let x1 = c.x + 1;
            while (true) { const n = at(x1, c.z); if (!n || n.key !== c.key || taken.has(x1 + "," + c.z)) break; x1++; }
            // extend along +z while the WHOLE x-run matches
            let z1 = c.z + 1;
            outer: while (true) {
                for (let x = c.x; x < x1; x++) { const n = at(x, z1); if (!n || n.key !== c.key || taken.has(x + "," + z1)) break outer; }
                z1++;
            }
            for (let x = c.x; x < x1; x++) for (let z = c.z; z < z1; z++) taken.add(x + "," + z);
            rects.push({ x0: c.x, x1, z0: c.z, z1, y: c.y, dir: c.dir, key: c.key });
        }
    }
    return { rects, units };
}

// Full optimised mesh: merged +-Y quads + the existing +-X/+-Z greedy span quads, in the rleMesh contract
// { positions, normals, indices, quadCount }.
export function rleMeshOptimized(rle, isSolid, opts = {}) {
    const positions = [], normals = [], indices = [];
    let vbase = 0;
    const quad = (n, c) => {
        for (let i = 0; i < 4; i++) { positions.push(c[i][0], c[i][1], c[i][2]); normals.push(n[0], n[1], n[2]); }
        indices.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
        vbase += 4;
    };

    const { rects, units } = mergeYFaces(rle, isSolid, opts);
    for (const r of rects) {
        const Y = r.dir > 0 ? r.y + 1 : r.y;
        if (r.dir > 0) quad([0, 1, 0], [[r.x0, Y, r.z0], [r.x0, Y, r.z1], [r.x1, Y, r.z1], [r.x1, Y, r.z0]]);
        else quad([0, -1, 0], [[r.x0, Y, r.z0], [r.x1, Y, r.z0], [r.x1, Y, r.z1], [r.x0, Y, r.z1]]);
    }
    for (const f of units) {
        const Y = f.dir > 0 ? f.y + 1 : f.y;
        if (f.dir > 0) quad([0, 1, 0], [[f.x, Y, f.z], [f.x, Y, f.z + 1], [f.x + 1, Y, f.z + 1], [f.x + 1, Y, f.z]]);
        else quad([0, -1, 0], [[f.x, Y, f.z], [f.x + 1, Y, f.z], [f.x + 1, Y, f.z + 1], [f.x, Y, f.z + 1]]);
    }

    // side faces unchanged -- already greedy vertical spans
    for (const s of sideFacesFromRLE(rle, isSolid)) {
        const { x, z, y0, y1, dir } = s;
        if (dir === "+x") { const X = x + 1; quad([1, 0, 0], [[X, y0, z], [X, y1, z], [X, y1, z + 1], [X, y0, z + 1]]); }
        else if (dir === "-x") { const X = x; quad([-1, 0, 0], [[X, y0, z], [X, y0, z + 1], [X, y1, z + 1], [X, y1, z]]); }
        else if (dir === "+z") { const Z = z + 1; quad([0, 0, 1], [[x, y0, Z], [x + 1, y0, Z], [x + 1, y1, Z], [x, y1, Z]]); }
        else if (dir === "-z") { const Z = z; quad([0, 0, -1], [[x, y0, Z], [x, y1, Z], [x + 1, y1, Z], [x + 1, y0, Z]]); }
    }

    const Idx = vbase > 65535 ? Uint32Array : Uint16Array;
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Idx(indices), quadCount: vbase / 4 };
}
