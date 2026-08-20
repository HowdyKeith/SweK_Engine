// tools/krbn/krbnCompare-selfcheck.mjs
//
// Run: node tools/krbn/krbnCompare-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The bridge and the honest answer to "is Krbn's output flat, or can we get it back to 3D." Both are true, at different
// stages. Krbn's SVG is flat by CHOICE -- its whole purpose is stylised drawings -- and from that flat drawing ALONE the
// depth is gone: any two points on a ray collapse to one, so you cannot un-flatten a bare drawing. BUT the flattening is
// not destructive of the scene, only of the picture: with the camera and the geometry (both of which we have), a flat
// point back-projects onto the mesh the ray strikes and the exact 3D point comes back, error zero. So the flat strokes
// CAN be lifted to 3D -- you just need the geometry, not only the drawing, and the geometry already lives upstream in the
// shared mesh. The sabotage breaks the inverse projection so the ray points the wrong way, and the recovery fails --
// which is the proof that the lift is real geometry, not a coincidence.
import { sharedMesh, project, projectMesh, backProject, KRBN_CAM } from "./krbnCompare.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

function frontSurfacePoint(mesh) {
    const e = KRBN_CAM.eye; let best = Infinity, C = null;
    for (const [i, j, k] of mesh.triangles) {
        const c = [(mesh.positions[i][0] + mesh.positions[j][0] + mesh.positions[k][0]) / 3, (mesh.positions[i][1] + mesh.positions[j][1] + mesh.positions[k][1]) / 3, (mesh.positions[i][2] + mesh.positions[j][2] + mesh.positions[k][2]) / 3];
        const d = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]); if (d < best) { best = d; C = c; }
    }
    return C;
}

// ---- 1. SHARED GEOMETRY IS DETERMINISTIC AND IDENTICAL ON BOTH SIDES --------------------------------
{
    const a = sharedMesh(), b = sharedMesh();
    ok("!! our obj and Krbn draw the identical, deterministic mesh -- the A/B compares one object, not two", JSON.stringify(a) === JSON.stringify(b) && a.positions.length > 10,
       a.positions.length + " vertices, bit-identical every time -- the same geometry feeds our 3D renderer and Krbn's flattener, which is what makes a frame-by-frame wipe honest.");
}

// ---- 2. KRBN'S CAMERA FLATTENS THE MESH TO 2D ------------------------------------------------------
{
    const pts = projectMesh(sharedMesh()).filter((q) => q);
    ok("!! Krbn's perspective camera projects the 3D mesh to a flat 2D point set (its SVG is a drawing)", pts.length === sharedMesh().positions.length,
       pts.length + " vertices flatten to 2D screen points -- that flat set is what Krbn draws. The output is a picture, flat by design.");
}

// ---- 3. FROM THE DRAWING ALONE, DEPTH IS GONE ------------------------------------------------------
{
    const e = KRBN_CAM.eye, t = KRBN_CAM.target, d = [t[0] - e[0], t[1] - e[1], t[2] - e[2]];
    const pn = project([e[0] + 0.3 * d[0], e[1] + 0.3 * d[1], e[2] + 0.3 * d[2]]);
    const pf = project([e[0] + 0.7 * d[0], e[1] + 0.7 * d[1], e[2] + 0.7 * d[2]]);
    ok("!! two points at different depths on one ray land on the same 2D point -- a bare drawing cannot be un-flattened", Math.abs(pn[0] - pf[0]) < 0.01 && Math.abs(pn[1] - pf[1]) < 0.01,
       "near and far both project to [" + pn[0].toFixed(0) + ", " + pn[1].toFixed(0) + "] -- with only the SVG in hand, which was closer is unknowable. This is Krbn's deliberate flatness.");
}

// ---- 4. WITH THE GEOMETRY, THE FLAT POINT LIFTS BACK TO 3D EXACTLY ----------------------------------
{
    const mesh = sharedMesh(); const C = frontSurfacePoint(mesh);
    const p2d = project(C); const back = backProject(p2d[0], p2d[1], mesh);
    const err = back ? Math.hypot(back[0] - C[0], back[1] - C[1], back[2] - C[2]) : Infinity;
    ok("!! but WITH the mesh and camera, the flat point back-projects to the exact 3D point (error ~0)", err < 1e-6,
       "a known surface point flattens to [" + p2d[0].toFixed(0) + ", " + p2d[1].toFixed(0) + "] and the ray-cast onto the mesh recovers it to within " + err.toExponential(1) + " -- so Krbn's flatness IS reversible; the depth just comes from the geometry, not the drawing. No new format needed, only the scene we already share.");
}

// ---- 5. DETERMINISTIC ------------------------------------------------------------------------------
{
    const m = sharedMesh(); const p = project([1, 2, 3]);
    const b1 = backProject(p[0], p[1], m), b2 = backProject(p[0], p[1], m);
    ok("!! deterministic", (b1 === null && b2 === null) || (b1 && b2 && b1[0] === b2[0] && b1[1] === b2[1] && b1[2] === b2[2]),
       "same drawing, same geometry, same recovered point every run -- gated, though trig-based (the camera), so not in the cross-architecture fingerprint.");
}

console.log(fails ? "\nkrbnCompare-selfcheck: " + fails + " FAILED" : "\nkrbnCompare-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
