// fx/spritemesh/blueprint.js -- turn a sprite-derived mesh into a clean LCARS vector BLUEPRINT: project the mesh from
// a view angle, keep only the edges that read as structure (the outer silhouette + sharp feature/crease edges), and
// remove the ones hidden behind the solid (occlusion). This is the game-appropriate cousin of the SIGGRAPH "occlusion-
// aware 3D vectorization" -- not the full robust-planar-map machinery, but the same intent: solid, correct line art.
//
// Silhouette edges: shared by one front-facing and one back-facing triangle (the outline for this view). Feature
// edges: shared by two faces whose normals differ sharply (a real crease). An edge's visibility is tested at its
// midpoint against the mesh depth, so lines behind the hull are dropped. Output is 2D segments ready for SVG/Canvas2D.
"use strict";

function rotProject(positions, ry, rx, persp) {
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    return positions.map(([x, y, z]) => { const X = x * cy + z * sy, Z = -x * sy + z * cy, Y = y * cx - Z * sx, Z2 = y * sx + Z * cx; const p = persp / (persp - Z2); return { x: X * p, y: Y * p, z: Z2, X, Y, Z: Z2 }; });
}
function faceNormal(P, a, b, c) { const ux = P[b].X - P[a].X, uy = P[b].Y - P[a].Y, uz = P[b].Z - P[a].Z, vx = P[c].X - P[a].X, vy = P[c].Y - P[a].Y, vz = P[c].Z - P[a].Z; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l]; }

// build blueprint line segments (view space, before screen scale). creaseDeg: crease threshold in degrees.
function blueprint(mesh, ry, rx, opts = {}) {
    const persp = opts.persp || 3.0, creaseCos = Math.cos((opts.creaseDeg || 40) * Math.PI / 180);
    const P = rotProject(mesh.positions, ry, rx, persp);
    // map each undirected edge -> list of {face index, facing sign, normal}
    const edges = new Map(); const faceN = [], faceFacing = [];
    mesh.cells.forEach((c, fi) => { const n = faceNormal(P, c[0], c[1], c[2]); faceN.push(n); faceFacing.push(n[2] >= 0 ? 1 : -1);
        for (let k = 0; k < 3; k++) { const a = c[k], b = c[(k + 1) % 3], key = a < b ? a + "_" + b : b + "_" + a; (edges.get(key) || edges.set(key, []).get(key)).push(fi); } });
    const segs = [];
    for (const [key, faces] of edges) {
        const [a, b] = key.split("_").map(Number); let keep = false;
        if (faces.length === 1) keep = true;                                   // boundary edge
        else if (faces.length === 2) {
            if (faceFacing[faces[0]] !== faceFacing[faces[1]]) keep = true;     // silhouette (front meets back)
            else { const d = faceN[faces[0]][0] * faceN[faces[1]][0] + faceN[faces[0]][1] * faceN[faces[1]][1] + faceN[faces[0]][2] * faceN[faces[1]][2]; if (d < creaseCos) keep = true; }  // crease
        }
        if (!keep) continue;
        // occlusion: is the edge midpoint in front of the solid? test against front-facing tri depths at that xy
        const mx = (P[a].x + P[b].x) / 2, my = (P[a].y + P[b].y) / 2, mz = (P[a].Z + P[b].Z) / 2;
        let hidden = false;
        for (let fi = 0; fi < mesh.cells.length && !hidden; fi++) { if (faceFacing[fi] < 0) continue; const c = mesh.cells[fi];
            const za = triDepthAt(P, c, mx, my); if (za != null && za > mz + 0.02) hidden = true; }
        segs.push({ x0: P[a].x, y0: P[a].y, x1: P[b].x, y1: P[b].y, hidden });
    }
    return segs;
}
// depth of triangle (in view Z) at screen xy via barycentric; null if outside
function triDepthAt(P, c, px, py) {
    const ax = P[c[0]].x, ay = P[c[0]].y, bx = P[c[1]].x, by = P[c[1]].y, cx = P[c[2]].x, cy = P[c[2]].y;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(d) < 1e-9) return null;
    const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d, l3 = 1 - l1 - l2;
    if (l1 < -0.01 || l2 < -0.01 || l3 < -0.01) return null;
    return l1 * P[c[0]].Z + l2 * P[c[1]].Z + l3 * P[c[2]].Z;
}
function toSVG(segs, W, H, opts = {}) {
    const sc = Math.min(W, H) * 0.4, ox = W / 2, oy = H / 2; let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#04060d"/>`;
    for (const g of segs) { if (g.hidden && !opts.showHidden) continue; s += `<line x1="${(ox + g.x0 * sc).toFixed(1)}" y1="${(oy + g.y0 * sc).toFixed(1)}" x2="${(ox + g.x1 * sc).toFixed(1)}" y2="${(oy + g.y1 * sc).toFixed(1)}" stroke="${g.hidden ? "#2a3a56" : "#f6a623"}" stroke-width="${g.hidden ? 0.6 : 1.4}"${g.hidden ? ' stroke-dasharray="3 3"' : ''}/>`; }
    return s + `</svg>`;
}

export { blueprint, toSVG, rotProject };
if (typeof module !== "undefined" && module.exports) module.exports = { blueprint, toSVG, rotProject };
