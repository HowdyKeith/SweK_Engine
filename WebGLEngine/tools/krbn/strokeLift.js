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

// v4048 -- *** THIS WAS ONCE A STRING-KEY MATCH, AND IT NEVER MATCHED ANYTHING. *** The first draft (in
// krbn-rigged.html and again, independently, in riggedExport.js) tried to tell a silhouette render-stroke
// from a surface one by rounding coordinates to a string and comparing `renderStroke.path` against
// `classifiedStroke.screen.pts`. Krbn's own pipeline (pipeline/emit.js's emitStroke) SAMPLES, SIMPLIFIES and
// WOBBLES the classified curve on the way to a render stroke -- RenderStroke.path is a DIFFERENT, PERTURBED
// set of points from Stroke.screen, so the string keys almost never coincided. MEASURED on RobotExpressive:
// 12 real silhouette features existed and the string match reported 0 every time -- a check that looked like
// classification and was actually a constant.
//
// *** THE FIX IS PROXIMITY, AND THE GAP IS NOT CLOSE. *** classifyScene(sources, cam) (exported by Krbn's own
// pipeline/visibility.js) is the SAME classification scene.render() runs internally, callable directly with
// no wobble applied -- an independent, exact ground truth. MEASURED distance from each render stroke's own
// points to the nearest silhouette curve point: the closest ~5% of strokes sit within 0.03-0.45px (wobble's
// own perturbation and nothing more), the median is 118.9px away. There is no ambiguous middle to tune around;
// TOL_PX=3 sits inside the gap with room on both sides.
const TOL_PX = 3;

/**
 * Which of `renderStrokes` (each a Vec2 path, e.g. RenderStroke.path) are silhouettes, by proximity to Krbn's
 * OWN classifyScene() output rather than by re-deriving or guessing. Returns a parallel string array,
 * "silhouette" | "surface", because a caller (the rigged player, the rigged exporter) needs to know which
 * marks are baked to a pose and which live on the surface -- see krbn-rigged.html's header for why that
 * distinction is drawn at all.
 */
export function classifyRenderStrokes(renderStrokes, classifiedStrokes) {
    const silCurves = classifiedStrokes
        .filter((s) => s.feature && s.feature.type === "silhouette" && s.screen && s.screen.pts)
        .map((s) => s.screen.pts);
    if (!silCurves.length) return renderStrokes.map(() => "surface");
    const d2 = (a, b) => { const dx = a[0]-b[0], dy = a[1]-b[1]; return dx*dx + dy*dy; };
    const tol2 = TOL_PX * TOL_PX;
    const near = (pt) => { for (const c of silCurves) for (const q of c) if (d2(pt, q) <= tol2) return true; return false; };
    return renderStrokes.map((path) => (path.some(near) ? "silhouette" : "surface"));
}

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
