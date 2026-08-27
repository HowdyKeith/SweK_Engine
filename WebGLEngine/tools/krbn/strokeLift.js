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

// ---------------------------------------------------------------------------------------------------------------
// v4047 -- THE RIGGED LIFT. Keith: "would we be able to export the krbn skinned model and export it rigged and
// then play that?"
//
// *** THE PREMISE NEEDED ONE CORRECTION: THERE IS NO KRBN MODEL TO EXPORT. *** Krbn holds no 3D scene of its
// own -- it takes OUR mesh and draws it flat, and this file's neighbour says so outright ("the OUTPUT is flat,
// and it cannot be lifted back to 3D, because the projection throws depth away"). What CAN be exported is the
// line-work draped back onto the surface it was drawn from, which liftStrokes() above already does.
//
// *** AND THE DRAPED LINE-WORK CAN BE RIGGED EXACTLY, NOT APPROXIMATELY. *** Every lifted point lands ON a
// triangle. Linear blend skinning is LINEAR IN THE VERTEX POSITION, so a point at barycentric (u,v,w) of a
// triangle deforms to precisely that blend of the triangle's three deformed corners. Pin each stroke point to
// (triangle, barycentric) instead of to a position and it follows any pose of the skeleton with no error term
// -- and it needs no skin weights of its own, because the triangle's corners already carry them.
//
// THE CONSEQUENCE THAT MAKES IT USABLE: a pencil frame costs ~500 ms, but re-blending pinned points costs a
// few multiplies. So the drawing is rendered by Krbn ONCE and then ANIMATES at frame rate -- which is the only
// reason "play that" is possible at all.
//
// *** WHAT IS AND IS NOT TRUE OF THE RESULT, BECAUSE HALF OF IT IS VIEW-DEPENDENT. *** Hatch and crease marks
// live ON the surface, so they deform correctly and stay correct in any pose. A SILHOUETTE DOES NOT: it is the
// set of places where the surface turns away from THIS camera, and moving the model moves where that is. A
// rigged silhouette is therefore a baked outline of the pose it was drawn in, carried along -- right at t=0
// and progressively a lie after it. liftStrokesRigged records each stroke's kind so a caller can treat the two
// differently (draw silhouettes only near the source pose, or re-derive them per frame), rather than shipping
// one array that quietly mixes a fact with an artefact.
// ---------------------------------------------------------------------------------------------------------------
import { backProjectHit, baryPoint } from "./krbnCompare.js";

/**
 * Lift 2D strokes onto the mesh AND pin each point to (triangle, barycentric) so it can be re-posed.
 * @param strokes  [[ [x,y], ... ], ...]  -- Krbn's own RenderStroke.path arrays
 * @param kinds    optional parallel array of stroke kinds ("silhouette" | "crease" | "hatch" | ...)
 * @returns [{ kind, pins: [{tri, bary}, ...] }, ...]
 */
export function liftStrokesRigged(strokes, mesh, cam, kinds = null) {
    const out = [];
    for (let s = 0; s < strokes.length; s++) {
        const kind = (kinds && kinds[s]) || "unknown";
        let cur = [];
        for (const [x, y] of strokes[s]) {
            const h = backProjectHit(x, y, mesh, cam);
            // a miss BREAKS the polyline rather than bridging the gap: joining across a hole draws a line
            // through empty space that was never in the drawing
            if (h) cur.push({ tri: h.tri, bary: h.bary });
            else { if (cur.length >= 2) out.push({ kind, pins: cur }); cur = []; }
        }
        if (cur.length >= 2) out.push({ kind, pins: cur });
    }
    return out;
}

/** Evaluate rigged strokes against a posed vertex set -- the per-frame half, and it is only arithmetic. */
export function poseRiggedStrokes(rigged, triangles, positions) {
    return rigged.map((r) => r.pins.map((p) => baryPoint(positions, triangles[p.tri], p.bary)));
}
