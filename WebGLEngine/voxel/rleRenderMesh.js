// voxel/rleRenderMesh.js
//
// Wire-up (v2774): convert rleMesh's indexed geometry into the format the live renderer actually uploads.
// world/chunkMesherCore.js hands render/voxelrenderer.js three parallel Float32Arrays -- verts (3/vertex,
// world-space), cols (3/vertex, RGB 0..1 from a palette by voxel id), aos (1/vertex, corner ambient occlusion)
// -- NON-indexed, 6 vertices per quad (two triangles). rleMesh emits indexed {positions, normals, indices} with
// 4 vertices + 6 indices per quad. This adapter bridges the two so the RLE mesh can drop into that renderer.
//
// Colour by type without changing rleMesh: each quad's solid voxel is the one HALF A STEP back along the
// inward normal from the quad centroid (a +Y face at Y=y+1 sits over voxel y; centroid - 0.5*normal lands inside
// it). getRLE reads the type there; the palette maps it to a colour. Greedy side spans are single-material (the
// merge only overlaps one run of each column), so one sample per span is exact.
//
// AO is a flat placeholder (1.0 = full ambient) for now -- real corner AO needs neighbour sampling and is the
// next refinement; the geometry and colour are correct today. Browser-safe: imports only voxelRLE.

import { getRLE, SOLID_NONZERO } from "./voxelRLE.js";
import { vertexAO, tangents } from "./voxelAO.js";

// mesh: rleMesh output. rle: the source RLE chunk (for type lookup). opts.palette[type] = [r,g,b] 0..1 (pass the
// renderer's own PALETTE so colours match). opts.offset = [ox,oy,oz] world offset (renderer offsets by cx*S).
// opts.ao = constant AO (default 1). opts.defaultColor for unknown types.
// v2790 -- AO span-split refinement. A greedy side span emits ONE quad [y0,y1); rleMeshToRenderMesh then samples
// AO only at the y0/y1 ends and the GPU interpolates between, so a mid-span occluder is smoothed not sharp. This
// splits a tall side span at heights where the per-unit-face AO stops being uniform, so occluders read sharply
// while flat uniform runs stay merged (one quad). +-Y faces and 1-tall spans are untouched. Returns a refined
// mesh {positions, normals, indices, quadCount}; feed it straight into rleMeshToRenderMesh.
export function splitSideSpansByAO(mesh, rle, isSolid) {
    const P = mesh.positions, N = mesh.normals, IX = mesh.indices, q = mesh.quadCount;
    const positions = [], normals = [], indices = [];
    let vbase = 0;
    const emit = (n, c) => {
        for (let k = 0; k < 4; k++) { positions.push(c[k][0], c[k][1], c[k][2]); normals.push(n[0], n[1], n[2]); }
        indices.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3); vbase += 4;
    };
    // AO at the 4 corners of a quad, using the same centroid-relative tangent logic as the renderer (order-agnostic).
    const cornersAO = (n, corners) => {
        let cx = 0, cy = 0, cz = 0; for (const p of corners) { cx += p[0]; cy += p[1]; cz += p[2]; } cx *= 0.25; cy *= 0.25; cz *= 0.25;
        const [u, w] = tangents(n);
        return corners.map((pk) => {
            const dvx = pk[0] - cx, dvy = pk[1] - cy, dvz = pk[2] - cz;
            const du = Math.sign(dvx * u[0] + dvy * u[1] + dvz * u[2]);
            const dw = Math.sign(dvx * w[0] + dvy * w[1] + dvz * w[2]);
            return vertexAO(rle, pk, n, du, dw, isSolid);
        });
    };

    for (let i = 0; i < q; i++) {
        const nb = i * 4 * 3;
        const n = [N[nb], N[nb + 1], N[nb + 2]];
        const c = []; for (let k = 0; k < 4; k++) { const b = (i * 4 + k) * 3; c.push([P[b], P[b + 1], P[b + 2]]); }
        const ys = c.map((p) => p[1]); const yMin = Math.min(...ys), yMax = Math.max(...ys);
        const isSide = n[1] === 0 && (n[0] !== 0 || n[2] !== 0);
        if (!isSide || (yMax - yMin) <= 1) { emit(n, c); continue; }

        // sub-quad [ya,yb): keep each original corner's (x,z) + winding, remap its y to ya (was bottom) or yb (was top)
        const sub = (ya, yb) => c.map((p) => [p[0], (p[1] === yMin ? ya : yb), p[2]]);
        // per unit face: is its 4-corner AO uniform, and what value?
        const faceUniform = [], faceVal = [];
        for (let y = yMin; y < yMax; y++) {
            const ao = cornersAO(n, sub(y, y + 1));
            const uni = ao[0] === ao[1] && ao[1] === ao[2] && ao[2] === ao[3];
            faceUniform.push(uni); faceVal.push(uni ? ao[0] : NaN);
        }
        // greedily merge consecutive uniform faces with the same value into one quad; others stay unit quads
        let start = yMin;
        for (let y = yMin; y < yMax; y++) {
            const idx = y - yMin;
            const runEnds = (y + 1 >= yMax) || !faceUniform[idx] || !faceUniform[idx + 1] || faceVal[idx] !== faceVal[idx + 1];
            if (runEnds) { emit(n, sub(start, y + 1)); start = y + 1; }
        }
    }
    return { positions, normals, indices, quadCount: vbase / 4 };
}

export function rleMeshToRenderMesh(mesh, rle, opts = {}) {
    const palette = opts.palette || {};
    const off = opts.offset || [0, 0, 0];
    const isSolidFn = opts.isSolid || SOLID_NONZERO;
    const computeAO = opts.computeAO !== false;         // real corner AO by default
    const aoConst = opts.ao == null ? 1 : opts.ao;      // fallback flat AO when computeAO is false
    const def = opts.defaultColor || [0.8, 0.8, 0.8];
    const keep = opts.keepVoxel || null;                // optional: keep only faces of solid voxels passing this
    // v3154 -- REUSE isSolidFn, do not build a SECOND predicate. This file made one for the mesh and another
    // for the AO split: identical today, two objects, and nothing tying them. The AO of a span and the span
    // itself disagreeing about what is solid would shade geometry that is not there.
    if (opts.splitSpansByAO && computeAO) mesh = splitSideSpansByAO(mesh, rle, isSolidFn);  // v2790 sharp mid-span AO
    const P = mesh.positions, N = mesh.normals, IX = mesh.indices;
    const q = mesh.quadCount;

    const verts = new Float32Array(q * 6 * 3);
    const cols = new Float32Array(q * 6 * 3);
    const aos = new Float32Array(q * 6);
    let vp = 0, cp = 0, ap = 0;

    for (let i = 0; i < q; i++) {
        const nb = i * 4 * 3;
        const nx = N[nb], ny = N[nb + 1], nz = N[nb + 2];   // quad normal (uniform across its 4 verts)
        let cx = 0, cy = 0, cz = 0;                          // quad centroid
        for (let k = 0; k < 4; k++) { const b = (i * 4 + k) * 3; cx += P[b]; cy += P[b + 1]; cz += P[b + 2]; }
        cx *= 0.25; cy *= 0.25; cz *= 0.25;
        // half a step back along the inward normal lands inside the solid voxel this face belongs to
        const svx = Math.floor(cx - 0.5 * nx), svy = Math.floor(cy - 0.5 * ny), svz = Math.floor(cz - 0.5 * nz);
        if (keep && !keep(svx, svy, svz)) continue;         // drop faces outside the kept region (e.g. padding ring)
        const t = getRLE(rle, svx, svy, svz);
        const c = palette[t] || def;

        // per-corner AO (0..3 corners of this quad), sampled from neighbour voxels around each corner
        const ao4 = [aoConst, aoConst, aoConst, aoConst];
        if (computeAO) {
            const n = [nx, ny, nz];
            const [u, w] = tangents(n);
            for (let k = 0; k < 4; k++) {
                const b = (i * 4 + k) * 3;
                const pk = [P[b], P[b + 1], P[b + 2]];
                const dvx = pk[0] - cx, dvy = pk[1] - cy, dvz = pk[2] - cz;
                const du = Math.sign(dvx * u[0] + dvy * u[1] + dvz * u[2]);
                const dw = Math.sign(dvx * w[0] + dvy * w[1] + dvz * w[2]);
                ao4[k] = vertexAO(rle, pk, n, du, dw, isSolidFn);
            }
        }

        for (let e = 0; e < 6; e++) {                        // de-index the quad's two triangles -> 6 verts
            const gi = IX[i * 6 + e];
            const vi = gi * 3;
            verts[vp++] = P[vi] + off[0]; verts[vp++] = P[vi + 1] + off[1]; verts[vp++] = P[vi + 2] + off[2];
            cols[cp++] = c[0]; cols[cp++] = c[1]; cols[cp++] = c[2];
            aos[ap++] = ao4[gi - i * 4];                     // local corner index 0..3
        }
    }
    // when a filter dropped quads the arrays are over-allocated -- return exactly what was written
    if (keep && vp !== verts.length) return { verts: verts.slice(0, vp), cols: cols.slice(0, cp), aos: aos.slice(0, ap), count: vp / 3 };
    return { verts, cols, aos, count: vp / 3 };
}
