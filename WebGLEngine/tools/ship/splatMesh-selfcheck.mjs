#!/usr/bin/env node
// WebGLEngine/tools/ship/splatMesh-selfcheck.mjs -- v4511
//
// A COLLIDER OUT OF A SPLAT CLOUD (task 58): physics/splat/splatMesh.mjs, after isaac-mason/splatmesh (MIT), headless. Section 1, the
// volume: densities set, read, max-accumulated, negative coordinates, bounds. Section 2, the rasteriser on a hand cloud: centers mode
// stamps exactly the voxel under each centre; coverage mode stamps the analytic count of voxels within the footprint; minOpacity and
// maxSplatScale drop by name; two splats in one voxel leave the MAX, not the sum. Section 3, surface nets on an analytic ball: the mesh
// is watertight (every undirected edge in two triangles, every directed edge once with its reverse present), Euler characteristic 2,
// one vertex per straddling cell counted the slow way, every vertex inside its cell and within 1.5 cells of the sphere, the front
// facing outward (a triangle's normal against its centroid). Section 4, THE REFERENCE MESHER: a second surface nets written the other
// way round -- crossings by explicit corner coordinates, quads found by walking every grid edge of the bounds -- must give the SAME
// vertex multiset and the SAME triangle set on the ball AND on a rasterised cloud. Section 5, the cloud: a thick shell is watertight with
// Euler characteristic 4 (two closed surfaces), a thin one is non-manifold (measured and said), one volume one hash. Section 6, the consumer: mesh/meshBVH.mjs raycasts the ball collider
// and hits it where the sphere is.
//
// MEASURED AT v4511: the ball of radius 1 at 0.1 cells meshes to 1,994 vertices, 3,984 triangles and 5,976 edges with 0 boundary, 0
// non-manifold and 0 inconsistent, Euler 2, every vertex within 0.135 of the sphere, 0 triangles inward; the reference mesher gives
// the same 1,994 / 3,984 on the ball and the same 4,140 / 7,856 on a rasterised cloud of 3,000 splats, and again over a shifted grid;
// the thick shell (8,994 voxels) is watertight at Euler 4, the thin shell (1,389 voxels) has 221 non-manifold edges and 0 boundary; a
// splat at opacity exactly 0.5 meshes to a 176-vertex ball; the BVH hits the collider at t 2.0483 where the sphere is at 2.0253. TWO
// CORRECTIONS: both meshers' first drafts started the stitching pass at the bound instead of the apron voxel below it and AGREED on a
// mesh with 122 boundary edges -- the watertight hold caught what the twin could not; and the first draft wrote Euler 0 for a thick
// shell (two closed surfaces read 4) and "pinholes" for the thin one (its defect is non-manifold edges).
//
// SABOTAGE (v4511): A  the quad winding not flipped by the near voxel's inside-ness   -> 5 red: 1,992 triangles inward, directed edges
//                                                                                        inconsistent, the reference disagrees three times.
//                   B  the vertex placed at the cell's centre (crossings ignored)      -> 4 red: worst 0.203 off the sphere, the reference
//                                                                                        disagrees three times.
//                   C  the solid test '>' instead of '>=' at the iso                   -> 0 RED THE FIRST TIME: nothing sat exactly on the
//                                                                                        iso. A hold was added that rasterises one splat at
//                                                                                        opacity 0.5 (123 voxels on the iso): 1 red, the
//                                                                                        strict test meshes 0 vertices where 176 stand.
//                   D  maxDensity summing instead of taking the max                     -> 2 red: the volume hold (0.4 + 0.2 + 0.9) and the
//                                                                                        centers hold (0.8 + 0.5 in one voxel).
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/splatMesh-selfcheck.mjs      (~3 s)
"use strict";
import { createVolume, getDensity, setDensity, maxDensity, voxelOf, voxelBounds, rasterise, surfaceNets, meshStats, meshHash, meshTriples, sphereCloud, ballVolume, EDGES, ISO } from "../../physics/splat/splatMesh.mjs";
import { trianglesFrom, MeshBVH } from "../../mesh/meshBVH.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/** THE REFERENCE: surface nets written the other way round. Corner coordinates spelled out, quads by walking every grid edge. */
function referenceNets(vol, iso) {
    const b = voxelBounds(vol), { cellSize, origin } = vol, verts = new Map(), positions = [], tris = [];
    const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const solid = (x, y, z) => getDensity(vol, x, y, z) >= iso;
    const lo = [b.min[0] - 1, b.min[1] - 1, b.min[2] - 1], hi = b.max;
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
        const cd = CORNERS.map(([i, j, k]) => getDensity(vol, x + i, y + j, z + k)), ins = cd.map((v) => v >= iso);
        if (ins.every((v) => v) || ins.every((v) => !v)) continue;
        const sum = [0, 0, 0]; let n = 0;
        for (let a = 0; a < 8; a++) for (let c = a + 1; c < 8; c++) {
            const diff = (CORNERS[a][0] !== CORNERS[c][0]) + (CORNERS[a][1] !== CORNERS[c][1]) + (CORNERS[a][2] !== CORNERS[c][2]);
            if (diff !== 1 || ins[a] === ins[c]) continue;
            const t = (iso - cd[a]) / (cd[c] - cd[a]);
            for (let k = 0; k < 3; k++) sum[k] += CORNERS[a][k] + t * (CORNERS[c][k] - CORNERS[a][k]); n++;
        }
        verts.set(`${x},${y},${z}`, positions.length / 3);
        positions.push(origin[0] + (x + sum[0] / n) * cellSize, origin[1] + (y + sum[1] / n) * cellSize, origin[2] + (z + sum[2] / n) * cellSize);
    }
    // every grid edge from voxel p to voxel p + axis, from the apron voxel (min - 1) to max -- the first draft started at min, the same
    // off-by-one as the mesher's first draft, and the two agreed on a mesh with 122 boundary edges
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
        for (let axis = 0; axis < 3; axis++) {
            const q = [x, y, z]; q[axis] += 1;
            const s0 = solid(x, y, z), s1 = solid(q[0], q[1], q[2]); if (s0 === s1) continue;
            // the four cells sharing the edge: back-step along the two other axes
            const A = (axis + 1) % 3, B = (axis + 2) % 3, cell = (da, db) => { const c = [x, y, z]; c[A] -= da; c[B] -= db; return verts.get(c.join(",")); };
            const v00 = cell(0, 0), v10 = cell(1, 0), v01 = cell(0, 1), v11 = cell(1, 1);
            if ([v00, v10, v01, v11].some((v) => v === undefined)) continue;
            // the mesher's convention: along x back-steps are (y, z); along y (z, x); along z (x, y) -- so u is axis + 1 and v is axis + 2
            if (s0) { tris.push([v00, v10, v11], [v00, v11, v01]); } else { tris.push([v00, v01, v11], [v00, v11, v10]); }
        }
    }
    return { positions: Float32Array.from(positions), indices: Uint32Array.from(tris.flat()) };
}
const vertexList = (m) => { const out = []; for (let i = 0; i < m.positions.length; i += 3) out.push([m.positions[i], m.positions[i + 1], m.positions[i + 2]].map((v) => v.toFixed(6)).join(",")); return out.sort(); };
const triangleSet = (m) => { const out = []; for (let t = 0; t < m.indices.length; t += 3) { const p = [0, 1, 2].map((k) => { const i = m.indices[t + k]; return [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]].map((v) => v.toFixed(6)).join(","); }); const r = p.indexOf([...p].sort()[0]); out.push([p[r], p[(r + 1) % 3], p[(r + 2) % 3]].join("|")); } return out.sort(); };
const sameMesh = (a, b) => { const va = vertexList(a), vb = vertexList(b), ta = triangleSet(a), tb = triangleSet(b); return { verts: va.length === vb.length && va.every((v, i) => v === vb[i]), tris: ta.length === tb.length && ta.every((v, i) => v === tb[i]), nv: va.length, nt: ta.length }; };

sec("1. THE VOLUME");
{
    const v = createVolume({ cellSize: 0.25, origin: [1, 2, 3] });
    setDensity(v, -3, 0, 7, 0.4); maxDensity(v, -3, 0, 7, 0.2); maxDensity(v, -3, 0, 7, 0.9); maxDensity(v, 5, 5, 5, 0.3);
    ok("set, get, max-accumulate and negative coordinates: a lower stamp leaves 0.4, a higher makes 0.9, an empty voxel reads 0", getDensity(v, -3, 0, 7) === 0.9 && getDensity(v, 9, 9, 9) === 0 && getDensity(v, 5, 5, 5) === 0.3);
    ok("voxelOf floors against the origin and cell size; voxelBounds spans the allocated cells", voxelOf(v, 1.26, 1.99, 3.5).join() === "1,-1,2" && JSON.stringify(voxelBounds(v)) === '{"min":[-3,0,5],"max":[5,5,7]}' && voxelBounds(createVolume()) === null);
}

sec("2. THE RASTERISER ON A HAND CLOUD");
{
    // Float32 like the loader's arrays: the holds below compare within 1e-6, because 0.9 in f32 is 0.89999997 (a first draft compared with ===)
    const cloud = { count: 4, positions: Float32Array.from([0.05, 0.05, 0.05, 0.55, 0.05, 0.05, 0.05, 0.55, 0.05, 0.06, 0.06, 0.06]), scales: Float32Array.from([0.02, 0.02, 0.02, 0.25, 0.1, 0.1, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02]), opacities: Float32Array.from([0.8, 0.9, 0.1, 0.5]) };
    const c = createVolume({ cellSize: 0.1 }); const r = rasterise(c, cloud, { mode: "centers", minOpacity: 0.2 });
    ok("centers mode: the voxel under each centre takes the opacity, the faint splat is skipped, two splats in one voxel leave the MAX", r.stamped === 3 && r.skipped === 1 && c.cells.size === 2 && near(getDensity(c, 0, 0, 0), 0.8, 1e-6) && near(getDensity(c, 5, 0, 0), 0.9, 1e-6) && getDensity(c, 0, 5, 0) === 0);
    const cov = createVolume({ cellSize: 0.1 }); rasterise(cov, { count: 1, positions: Float32Array.from([0.55, 0.05, 0.05]), scales: Float32Array.from([0.25, 0.1, 0.1]), opacities: Float32Array.from([0.9]) }, { mode: "coverage", maxRadius: 0.5, splatRadius: 1 });
    let want = 0; for (let z = -2; z <= 2; z++) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if ((x * x + y * y + z * z) * 0.01 <= 0.25 * 0.25 + 1e-12) want++;
    ok(`coverage mode: the footprint is the LARGEST scale (0.25) over 0.1 cells, so ${want} voxels within the sphere of offsets take the opacity`, cov.cells.size === want && [...cov.cells.values()].every((d) => near(d, 0.9, 1e-6)), `${cov.cells.size}`);
    const big = createVolume({ cellSize: 0.1 }); const rb = rasterise(big, cloud, { mode: "centers", minOpacity: 0, maxSplatScale: 0.2 });
    ok("maxSplatScale drops the splat whose largest scale exceeds it (the 0.25 one), by name", rb.skipped === 1 && getDensity(big, 5, 0, 0) === 0 && near(getDensity(big, 0, 5, 0), 0.1, 1e-6));
}

let ballMesh = null, ball = null;
sec("3. SURFACE NETS ON AN ANALYTIC BALL");
{
    ball = ballVolume({ radius: 1, cellSize: 0.1 }); ballMesh = surfaceNets(ball, ISO); const st = meshStats(ballMesh);
    report(`ball of radius 1 at 0.1 cells: ${st.vertices} vertices, ${st.triangles} triangles, ${st.edges} edges, ${st.boundary} boundary, ${st.nonManifold} non-manifold, ${st.inconsistent} inconsistent, Euler ${st.euler}`);
    ok("*** the mesh is watertight and consistently wound: no boundary edge, no non-manifold edge, every directed edge once with its reverse, Euler characteristic 2 ***", st.boundary === 0 && st.nonManifold === 0 && st.inconsistent === 0 && st.euler === 2);
    let straddling = 0; const b = voxelBounds(ball); for (let z = b.min[2] - 1; z <= b.max[2]; z++) for (let y = b.min[1] - 1; y <= b.max[1]; y++) for (let x = b.min[0] - 1; x <= b.max[0]; x++) { let inn = 0; for (let c = 0; c < 8; c++) if (getDensity(ball, x + (c & 1), y + ((c >> 1) & 1), z + ((c >> 2) & 1)) >= ISO) inn++; if (inn > 0 && inn < 8) straddling++; }
    ok("one vertex per straddling cell, counted the slow way", st.vertices === straddling, `${st.vertices} against ${straddling}`);
    let outside = 0, worstR = 0; for (let i = 0; i < ballMesh.positions.length; i += 3) { const p = [ballMesh.positions[i], ballMesh.positions[i + 1], ballMesh.positions[i + 2]]; worstR = Math.max(worstR, Math.abs(Math.hypot(...p) - 1)); const cell = p.map((v) => Math.floor(v / 0.1)); if (p.some((v, k) => v < cell[k] * 0.1 - 1e-9 || v > (cell[k] + 1) * 0.1 + 1e-9)) outside++; }
    ok(`every vertex lies inside a cell and within 1.5 cells of the sphere (worst ${worstR.toFixed(4)})`, outside === 0 && worstR < 0.15);
    let inward = 0; for (let t = 0; t < ballMesh.indices.length; t += 3) { const P = [0, 1, 2].map((k) => { const i = ballMesh.indices[t + k]; return [ballMesh.positions[i * 3], ballMesh.positions[i * 3 + 1], ballMesh.positions[i * 3 + 2]]; }); const e1 = P[1].map((v, k) => v - P[0][k]), e2 = P[2].map((v, k) => v - P[0][k]); const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const c = P[0].map((v, k) => (v + P[1][k] + P[2][k]) / 3); if (nrm[0] * c[0] + nrm[1] * c[1] + nrm[2] * c[2] < 0) inward++; }
    ok("the front faces outward: no triangle's normal points against its centroid's direction from the centre", inward === 0, `${inward} inward`);
}

sec("4. THE REFERENCE MESHER: the same mesh, written the other way round");
{
    const ref = referenceNets(ball, ISO), s = sameMesh(ballMesh, ref);
    ok(`*** on the ball: ${s.nv} vertices as one multiset and ${s.nt} triangles as one set, vertex for vertex and triangle for triangle ***`, s.verts && s.tris && s.nv > 1000);
    const cloud = sphereCloud({ n: 3000, scale: 0.3 }), vol = createVolume({ cellSize: 0.1 }); rasterise(vol, cloud, { mode: "coverage", maxRadius: 0.5 });
    const m = surfaceNets(vol, ISO), r2 = referenceNets(vol, ISO), s2 = sameMesh(m, r2);
    ok(`*** on a rasterised cloud (3,000 splats, 0.3 footprint): ${s2.nv} vertices and ${s2.nt} triangles, the same ***`, s2.verts && s2.tris && s2.nv > 500);
    const shifted = createVolume({ cellSize: 0.1, origin: [0.3, -0.2, 0.05] }); rasterise(shifted, cloud, { mode: "coverage", maxRadius: 0.5 });
    const s3 = sameMesh(surfaceNets(shifted, ISO), referenceNets(shifted, ISO));
    ok("and on the same cloud over a shifted origin (a different voxel grid)", s3.verts && s3.tris);
}

sec("5. THE CLOUD: a thick shell is a solid, a thin one is not, one volume one hash");
{
    const thick = createVolume({ cellSize: 0.1 }); rasterise(thick, sphereCloud({ n: 3000, scale: 0.3 }), { mode: "coverage", maxRadius: 0.5 }); const tm = surfaceNets(thick, ISO), ts = meshStats(tm);
    const thin = createVolume({ cellSize: 0.1 }); rasterise(thin, sphereCloud({ n: 3000, scale: 0.08 }), { mode: "coverage", maxRadius: 0.5 }); const nm = surfaceNets(thin, ISO), ns = meshStats(nm);
    report(`thick shell (0.3 footprint, 3 cells): ${thick.cells.size} voxels, ${ts.vertices} vertices, ${ts.boundary} boundary, ${ts.nonManifold} non-manifold, Euler ${ts.euler}; thin (0.08, under a cell): ${thin.cells.size} voxels, ${ns.boundary} boundary, ${ns.nonManifold} non-manifold`);
    // a solid spherical shell is bounded by TWO closed surfaces, each of Euler characteristic 2, so the mesh reads 4 (a first draft wrote 0)
    ok("a splat shell three cells thick meshes watertight on both its faces: no boundary or non-manifold edge, Euler characteristic 4 (two spheres)", ts.boundary === 0 && ts.nonManifold === 0 && ts.euler === 4);
    // and a footprint under a cell is centers by another name: voxels meet at edges and corners, and surface nets stitch those into
    // non-manifold edges (a first draft expected pinholes -- boundary edges -- and every boundary edge it saw was the off-by-one above)
    ok("a thin shell is not a solid: non-manifold edges where voxels meet only at an edge -- measured, not hidden -- and no boundary edge", ns.nonManifold > 0 && ns.boundary === 0);
    ok("one volume one hash, twice", meshHash(tm) === meshHash(surfaceNets(thick, ISO)) && meshHash(tm) !== meshHash(nm));
    // A DENSITY ON THE ISO ITSELF: the convention is "solid when density >= iso", and nothing above puts a voxel exactly at 0.5, so a
    // sabotage that made the test strict changed no cell and went 0 red (v4511). One splat at opacity 0.5, a three-cell footprint:
    // every stamped voxel sits exactly on the iso, so the mesher must wrap a ball around it and the strict test would wrap nothing.
    const onIso = createVolume({ cellSize: 0.1 }); rasterise(onIso, { count: 1, positions: Float32Array.from([0.05, 0.05, 0.05]), scales: Float32Array.from([0.3, 0.3, 0.3]), opacities: Float32Array.from([0.5]) }, { mode: "coverage", maxRadius: 0.5, minOpacity: 0 });
    const im = surfaceNets(onIso, ISO), is = meshStats(im), ir = sameMesh(im, referenceNets(onIso, ISO));
    ok(`a splat whose opacity is exactly the iso is SOLID: ${onIso.cells.size} voxels at 0.5 mesh to a closed ball (${is.vertices} vertices, Euler ${is.euler}), and the reference agrees`, onIso.cells.size > 100 && is.vertices > 0 && is.boundary === 0 && is.euler === 2 && ir.verts && ir.tris);
}

sec("6. THE CONSUMER: mesh/meshBVH.mjs raycasts the collider");
{
    const tp = meshTriples(ballMesh), bvh = new MeshBVH(trianglesFrom(tp.positions, tp.indices));
    const hit = bvh.raycastFirst(3, 0.2, 0.1, -1, 0, 0), want = 3 - Math.sqrt(1 - 0.05), miss = bvh.raycastFirst(3, 2, 2, -1, 0, 0);
    report(`a ray from (3, 0.2, 0.1) along -x: ${hit ? "hit at t " + hit.t.toFixed(4) : "no hit"} (the sphere's surface at t = ${want.toFixed(4)}); a ray past the sphere: ${miss ? "hit" : "no hit"}`);
    ok("the ray hits the collider within 1.5 cells of where the sphere is, and a ray past the sphere misses", hit != null && Math.abs(hit.t - want) < 0.15 && miss === null);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a real capture (the tree's viewer pages load them; none is a fixture in the repo); chunking for a million-splat scene (a sparse map here, said in the header); splatmesh's editor, edit flags, heightfield and greedy meshers (not taken).");
process.exit(fails ? 1 : 0);
