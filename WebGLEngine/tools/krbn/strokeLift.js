// tools/krbn/strokeLift.js
//
// The end result: Krbn's flat drawing turned into a standalone 3D object you can import and orbit. Where krbnCompare.js
// proved a single flat point lifts back to 3D, this runs the lift over EVERY point of EVERY stroke and writes the result
// to disk as OBJ polylines lying on the surface. It is the drawing, laid onto the geometry, as a real 3D asset -- not a
// live view, a file.
//
// Input is a set of 2D screen-space strokes (polylines). In production those are Krbn's actual SVG strokes; here the gate
// also feeds it synthetic hatching that is NOT along any mesh edge, to prove the tool lifts arbitrary marks onto the
// surface rather than merely echoing the wireframe back. A stroke splits into several 3D polylines where its ray leaves
// the mesh, so nothing is emitted floating in space -- only the parts that actually land on the surface.

import { backProject, project, rayThroughScreen, projectMesh, KRBN_CAM } from "./krbnCompare.js";

// Lift 2D strokes onto the mesh. strokes: [[x,y],...][]. Returns 3D polylines; a stroke breaks where its ray misses.
export function liftStrokes(strokes, mesh, cam = KRBN_CAM) {
    const out = [];
    for (const stroke of strokes) {
        let cur = [];
        for (const [x, y] of stroke) {
            const p = backProject(x, y, mesh, cam);          // ray-cast the flat point onto the surface
            if (p) cur.push(p);
            else { if (cur.length >= 2) out.push(cur); cur = []; }
        }
        if (cur.length >= 2) out.push(cur);
    }
    return out;
}

// Emit 3D polylines as OBJ: v vertices + l line elements. Importable into Blender, MeshLab, three.js, anything.
export function toOBJ(polylines) {
    let v = "", l = "", idx = 1;
    for (const poly of polylines) {
        const start = idx;
        for (const p of poly) { v += "v " + p[0].toFixed(6) + " " + p[1].toFixed(6) + " " + p[2].toFixed(6) + "\n"; idx++; }
        l += "l " + Array.from({ length: poly.length }, (_, i) => start + i).join(" ") + "\n";
    }
    const nv = idx - 1;
    return "# Krbn drawing lifted to 3D -- flat strokes back-projected onto the surface\n# " + polylines.length + " polylines, " + nv + " vertices\n" + v + l;
}

// The projected mesh's 2D bounding box -- where the drawing lives on screen.
export function drawingBounds(mesh, cam = KRBN_CAM) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of projectMesh(mesh, cam)) if (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return { x0, y0, x1, y1 };
}

// Demo strokes: screen-space diagonal hatching across a box. These lie along no mesh edge -- arbitrary marks, on purpose.
export function hatchStrokes(x0, y0, x1, y1, spacing = 26, step = 5) {
    const strokes = [];
    for (let c = x0 - y1; c < x1 - y0; c += spacing) {         // diagonal x - y = c, spanning the box
        const stroke = [];
        for (let y = y0; y <= y1; y += step) { const x = c + y; if (x >= x0 && x <= x1) stroke.push([x, y]); }
        if (stroke.length >= 2) strokes.push(stroke);
    }
    return strokes;
}
