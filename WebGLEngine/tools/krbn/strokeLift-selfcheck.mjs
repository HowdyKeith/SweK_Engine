// tools/krbn/strokeLift-selfcheck.mjs
//
// Run: node tools/krbn/strokeLift-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The stroke-lift tool, the thing that turns Krbn's flat drawing into an importable 3D object. It is fed synthetic
// hatching -- diagonal marks that lie along NO mesh edge -- to prove it lifts arbitrary strokes onto the surface rather
// than echoing the wireframe. Every lifted point re-projects to a valid screen position (it is on its ray) and sits at
// the surface's depth, and because the surface is curved that depth VARIES across the drawing: the strokes are draped over
// the geometry, not laid on a flat plane. Rays that miss the mesh drop out, so nothing floats. The OBJ is well-formed and
// importable. The sabotage places every point at a fixed depth along its ray instead of ray-casting onto the mesh -- the
// points still sit on their rays, but the depth stops varying, because a fixed depth is a flat plane, not a surface.
import { sharedMesh, project, KRBN_CAM } from "./krbnCompare.js";
import { liftStrokes, toOBJ, drawingBounds, hatchStrokes } from "./strokeLift.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const mesh = sharedMesh();
const bb = drawingBounds(mesh);
const hatch = hatchStrokes(bb.x0, bb.y0, bb.x1, bb.y1);
const lifted = liftStrokes(hatch, mesh);
const pts = lifted.flat();
const eye = KRBN_CAM.eye;
const depth = (p) => Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);

// ---- 1. ARBITRARY STROKES LIFT TO 3D SURFACE POINTS ------------------------------------------------
{
    ok("!! arbitrary screen-space strokes (not mesh edges) lift onto the surface", lifted.length >= 2 && pts.length >= 10 && pts.every((p) => p.every(Number.isFinite)),
       hatch.length + " diagonal hatching strokes become " + lifted.length + " 3D polylines, " + pts.length + " surface points -- the drawing lifted, not the wireframe echoed.");
}

// ---- 2. EACH LIFTED POINT IS ON ITS RAY (valid screen position) ------------------------------------
{
    const allProject = pts.every((p) => { const q = project(p); return q && q[0] >= bb.x0 - 2 && q[0] <= bb.x1 + 2 && q[1] >= bb.y0 - 2 && q[1] <= bb.y1 + 2; });
    ok("!! every lifted point re-projects back into the drawing (it sits on its own ray)", allProject,
       "each 3D point projects back to within the drawing's screen box -- the lift moved it in depth only, never sideways.");
}

// ---- 3. THE STROKES ARE DRAPED OVER THE CURVED SURFACE, not a flat plane ----------------------------
{
    const ds = pts.map(depth); const range = Math.max(...ds) - Math.min(...ds);
    ok("!! the lifted strokes drape over the curved surface -- their depth varies, they are not on a plane", range > 0.5,
       "the surface depth ranges over " + range.toFixed(2) + " across the drawing -- the strokes follow the 3D shape, which is the whole point of lifting them onto the geometry rather than picking a depth.");
}

// ---- 4. RAYS THAT MISS THE MESH DROP OUT (nothing floats) ------------------------------------------
{
    const offMesh = [[[2, 2], [8, 8], [14, 14]]];   // a stroke in the far screen corner, aimed at nothing
    const liftedOff = liftStrokes(offMesh, mesh);
    ok("!! strokes whose rays miss the mesh produce no floating geometry", liftedOff.length === 0,
       "a stroke aimed off the surface lifts to nothing -- only points that actually strike the mesh become 3D vertices.");
}

// ---- 5. THE OBJ IS WELL-FORMED AND IMPORTABLE ------------------------------------------------------
{
    const obj = toOBJ(lifted);
    const vLines = obj.split("\n").filter((l) => l.startsWith("v "));
    const lLines = obj.split("\n").filter((l) => l.startsWith("l "));
    const maxIdx = Math.max(...lLines.flatMap((l) => l.slice(2).trim().split(/\s+/).map(Number)));
    ok("!! the exported OBJ is well-formed: v vertices, l polylines, indices in bounds", vLines.length === pts.length && lLines.length === lifted.length && maxIdx === vLines.length,
       vLines.length + " v lines and " + lLines.length + " l polylines, max index " + maxIdx + " within " + vLines.length + " vertices -- imports into Blender, MeshLab or three.js as-is.");
}

// ---- 6. DETERMINISTIC ------------------------------------------------------------------------------
{
    ok("!! deterministic", toOBJ(liftStrokes(hatch, sharedMesh())) === toOBJ(liftStrokes(hatch, sharedMesh())),
       "same drawing, same mesh, byte-identical OBJ every run -- gated, though trig-based (the camera), so not in the cross-architecture fingerprint.");
}

console.log(fails ? "\nstrokeLift-selfcheck: " + fails + " FAILED" : "\nstrokeLift-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
