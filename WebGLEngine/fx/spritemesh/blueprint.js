// fx/spritemesh/blueprint.js -- turn a sprite-derived mesh into a clean LCARS vector BLUEPRINT: project the mesh from
// a view angle, keep only the edges that read as structure (the outer silhouette + sharp feature/crease edges), and
// remove the ones hidden behind the solid (occlusion). This is the game-appropriate cousin of the SIGGRAPH "occlusion-
// aware 3D vectorization" -- not the full robust-planar-map machinery, but the same intent: solid, correct line art.
//
// Silhouette edges: shared by one front-facing and one back-facing triangle (the outline for this view). Feature
// edges: shared by two faces whose normals differ sharply (a real crease). THIS PART IS UNCHANGED.
//
// Occlusion is a TRUE 3D line-of-sight test against mesh/meshBVH.mjs's BVH, not the old brute-force stand-in: the
// previous version sampled ONE point (an edge's midpoint), compared it to every FRONT-FACING triangle's depth at
// that screen XY (O(edges * faces), no acceleration structure), and marked the WHOLE edge hidden or not as a
// single unit -- so an edge that is half-occluded (crosses the silhouette partway along its length, which any
// crease near the horizon does) came back entirely wrong on whichever side lost the single sample. This version
// samples several points ALONG each kept edge, casts a real 3D visibility ray from the implied eye to each one,
// and emits one output segment per maximal run of same-visibility samples -- so a half-occluded edge comes back
// as two segments, correctly split, not one guess.
//
// *** THE EYE POSITION IS NOT A GUESS -- IT FALLS OUT OF rotProject's OWN FORMULA. *** rotProject's perspective
// divide is `p = persp / (persp - Z2)`. Parametrise the ray from an eye E=(0,0,e) through a view-space point
// Q=(X,Y,Z) as E + t*(Q-E) and solve for where its Z-component crosses the screen plane Z=0: the Z-component is
// e + t*(Z-e), zero at t = e/(e-Z) -- exactly rotProject's own `p`, with e = persp. So the camera rotProject
// implicitly assumes is a pinhole sitting at view-space (0,0,persp), looking toward -Z, IN THE SAME COORDINATE
// SYSTEM as P[i].X/Y/Z (the pre-divide view-space fields rotProject already returns for every vertex) -- which is
// exactly what MeshBVH.intersectsSegment needs: no separate camera abstraction, no re-deriving a ray from screen
// space, the mesh's own already-rotated vertices feed the BVH directly.
//
// *** NO FRONT-FACE FILTER, UNLIKE THE OLD CODE -- AND THAT IS A SIMPLIFICATION, NOT AN OVERSIGHT. *** The old
// 2D depth-compare only trusted front-facing triangles as occluders (a screen-space heuristic: a back face at the
// same XY is not simply "the thing in front"). A true 3D segment test needs no such filter: ANYTHING between the
// eye and the sample point blocks the view, front-facing or not, so the query is just "does the open segment
// (eye, point) cross the mesh anywhere" -- MeshBVH.intersectsSegment, unfiltered, is already exactly that.
//
// *** SELF-GRAZING AT THE SAMPLE POINT ITSELF IS NOT A BUG TO WORK AROUND -- intersectsSegment ALREADY HANDLES
// IT. *** Every sample lies exactly ON the mesh (it's a point on one of the mesh's own edges), so the ray to it
// always grazes that edge's own 1-2 adjacent triangles at essentially t=1 (floating-point-exact, since the
// triangle is planar and the sample sits exactly in that plane). intersectsSegment's own `t > eps && t < 1-eps`
// cutoff excludes exactly that self-hit, the same way a shadow ray is biased off the surface it leaves -- a
// genuine occluder elsewhere on the mesh still crosses at some t clear of both ends and is still caught.
"use strict";

import { MeshBVH, trianglesFrom } from "../../mesh/meshBVH.mjs";

function rotProject(positions, ry, rx, persp) {
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    return positions.map(([x, y, z]) => { const X = x * cy + z * sy, Z = -x * sy + z * cy, Y = y * cx - Z * sx, Z2 = y * sx + Z * cx; const p = persp / (persp - Z2); return { x: X * p, y: Y * p, z: Z2, X, Y, Z: Z2 }; });
}
function faceNormal(P, a, b, c) { const ux = P[b].X - P[a].X, uy = P[b].Y - P[a].Y, uz = P[b].Z - P[a].Z, vx = P[c].X - P[a].X, vy = P[c].Y - P[a].Y, vz = P[c].Z - P[a].Z; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l]; }
const lerp3 = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];

// build blueprint line segments (view space, before screen scale). creaseDeg: crease threshold in degrees.
// samples: number of INTERIOR occlusion-test points per kept edge, between its two endpoints (default 7, so 9
// points total per edge) -- raise it for a mesh with edges that cross the silhouette at a shallow angle (a long
// near-tangent crease can hide a short mis-split run between two coarse samples), lower it to spend less per frame.
function blueprint(mesh, ry, rx, opts = {}) {
    const persp = opts.persp || 3.0, creaseCos = Math.cos((opts.creaseDeg || 40) * Math.PI / 180);
    const interior = opts.samples != null ? opts.samples : 7;
    const P = rotProject(mesh.positions, ry, rx, persp);
    // map each undirected edge -> list of {face index, facing sign, normal}
    const edges = new Map(); const faceN = [], faceFacing = [];
    mesh.cells.forEach((c, fi) => { const n = faceNormal(P, c[0], c[1], c[2]); faceN.push(n); faceFacing.push(n[2] >= 0 ? 1 : -1);
        for (let k = 0; k < 3; k++) { const a = c[k], b = c[(k + 1) % 3], key = a < b ? a + "_" + b : b + "_" + a; (edges.get(key) || edges.set(key, []).get(key)).push(fi); } });

    // the pinhole this projection implies (see header), in the SAME view-space coords as P[i].X/Y/Z -- so the
    // mesh's own already-projected vertices feed the BVH with no separate transform.
    const EYE = [0, 0, persp];
    const bvh = new MeshBVH(trianglesFrom(P.map((p) => [p.X, p.Y, p.Z]), mesh.cells));
    const project = (X, Y, Z) => { const p = persp / (persp - Z); return [X * p, Y * p]; };

    const segs = [];
    for (const [key, faces] of edges) {
        const [a, b] = key.split("_").map(Number); let keep = false;
        if (faces.length === 1) keep = true;                                   // boundary edge
        else if (faces.length === 2) {
            if (faceFacing[faces[0]] !== faceFacing[faces[1]]) keep = true;     // silhouette (front meets back)
            else { const d = faceN[faces[0]][0] * faceN[faces[1]][0] + faceN[faces[0]][1] * faceN[faces[1]][1] + faceN[faces[0]][2] * faceN[faces[1]][2]; if (d < creaseCos) keep = true; }  // crease
        }
        if (!keep) continue;
        // occlusion: real 3D visibility from EYE to several points along the edge, walked into maximal
        // same-visibility runs so a partially-occluded edge splits into its own visible and hidden segments.
        const va = [P[a].X, P[a].Y, P[a].Z], vb = [P[b].X, P[b].Y, P[b].Z];
        const pts = [va];
        for (let i = 1; i <= interior; i++) pts.push(lerp3(va, vb, i / (interior + 1)));
        pts.push(vb);
        const hid = pts.map((q) => bvh.intersectsSegment(EYE[0], EYE[1], EYE[2], q[0], q[1], q[2]));
        for (let runStart = 0, i = 1; i <= pts.length; i++) {
            if (i === pts.length || hid[i] !== hid[runStart]) {
                const s0 = project(pts[runStart][0], pts[runStart][1], pts[runStart][2]);
                const s1 = project(pts[i - 1][0], pts[i - 1][1], pts[i - 1][2]);
                segs.push({ x0: s0[0], y0: s0[1], x1: s1[0], y1: s1[1], hidden: hid[runStart] });
                runStart = i;
            }
        }
    }
    return segs;
}
function toSVG(segs, W, H, opts = {}) {
    const sc = Math.min(W, H) * 0.4, ox = W / 2, oy = H / 2; let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#04060d"/>`;
    for (const g of segs) { if (g.hidden && !opts.showHidden) continue; s += `<line x1="${(ox + g.x0 * sc).toFixed(1)}" y1="${(oy + g.y0 * sc).toFixed(1)}" x2="${(ox + g.x1 * sc).toFixed(1)}" y2="${(oy + g.y1 * sc).toFixed(1)}" stroke="${g.hidden ? "#2a3a56" : "#f6a623"}" stroke-width="${g.hidden ? 0.6 : 1.4}"${g.hidden ? ' stroke-dasharray="3 3"' : ''}/>`; }
    return s + `</svg>`;
}

export { blueprint, toSVG, rotProject };
if (typeof module !== "undefined" && module.exports) module.exports = { blueprint, toSVG, rotProject };
