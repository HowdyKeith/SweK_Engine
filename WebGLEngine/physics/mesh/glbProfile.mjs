// WebGLEngine/physics/mesh/glbProfile.mjs -- v3037
//
// DE-EXTRUDE: a 3D triangle soup back down to the 2D solid profile the wind tunnel actually consumes.
//
// WHY PROJECTION AND NOT SLICING, AND WHY THAT DISSOLVES THE WATERTIGHT PROBLEM.
//
// There are two ways to get 2D out of a mesh and they are NOT the same operation:
//
//   SLICE at a plane   -> the true cross-section at that height. Requires a CLOSED mesh, because only a closed
//                         manifold guarantees the cut yields closed loops. An open shell gives open chains with
//                         no defined interior, and the inside/outside test that sets solid-vs-fluid lattice
//                         flags is then undefined -- you do not get an ugly answer, you get LEAKING SOLIDS.
//   PROJECT + rasterize -> the silhouette. Works on ANY mesh, open or closed, because it COVERS cells with
//                         triangles instead of asking whether a point is inside anything. There is no interior
//                         test, so there is nothing to be undefined.
//
// The tunnel's consumer is a solid/fluid raster mask, so projection lands directly in the right representation
// and the watertight question never comes up. That is the whole reason this module exists instead of a mesh
// repair dependency: WE WERE ABOUT TO BUY A FIX FOR A PROBLEM THE PIPELINE DOES NOT HAVE.
//
// WHAT IT COSTS, STATED PLAINLY: silhouette is not section. The silhouette is the MAXIMUM cross-section -- what
// the shadow would be. For a symmetric body they often coincide; for a hull with a bulge they do not. Which one
// is correct depends on what is being asked of the tunnel, and this module does not decide that. It reports
// which it computed.
//
// AND THE TRAP THAT LOOKS LIKE A SHORTCUT. svgProfile's rasterProfile() is RIGHT THERE and takes polygons, and a
// triangle IS a polygon -- so feeding it the soup looks free. It is wrong: rasterProfile fills by EVEN-ODD
// across all polygons together, which is exactly correct for an outline with a hole drawn inside it, and exactly
// backwards for overlapping triangles, where two overlapping triangles CANCEL. Adjacent triangles in a mesh
// share edges and overlap under projection constantly. The result is a mask full of holes that looks like a
// lattice artefact. So the union rasterizer below is a deliberate second fill rule, not a duplicate -- and
// bounds() and profileArea() ARE imported rather than re-written, because those two do not change.
"use strict";
import { bounds, profileArea } from "./svgProfile.mjs";

export { profileArea };

const AXES = { x: [1, 2], y: [0, 2], z: [0, 1] };   // project ALONG this axis -> keep the other two, in order

/**
 * Drop one axis from a triangle soup. positions is a flat [x,y,z,...] array; indices is optional (soup order is
 * assumed when absent). Returns an array of [[x,y],[x,y],[x,y]] triangles in the surviving plane.
 */
export function projectTriangles(positions, indices = null, axis = "z") {
    const keep = AXES[axis];
    if (!keep) throw new Error("projectTriangles: axis must be x, y or z -- got " + axis);
    if (!positions || positions.length < 9) throw new Error("projectTriangles: need at least one triangle (9 floats)");
    const idx = indices || null;
    const n = idx ? idx.length : positions.length / 3;
    if (n % 3 !== 0) throw new Error("projectTriangles: vertex count " + n + " is not a whole number of triangles");
    const tris = [];
    for (let t = 0; t < n; t += 3) {
        const tri = [];
        for (let k = 0; k < 3; k++) {
            const v = (idx ? idx[t + k] : t + k) * 3;
            tri.push([positions[v + keep[0]], positions[v + keep[1]]]);
        }
        tris.push(tri);
    }
    return tris;
}

// Half-plane sign test. A cell centre is inside the triangle when it is on the same side of all three edges;
// comparing against BOTH signs makes it winding-agnostic, which matters because a projected mesh carries both
// front and back faces and they wind opposite ways. Requiring one winding would drop half the soup.
function inTriangle(px, py, [a, b, c]) {
    const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
    const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
    const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
    const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(neg && pos);
}

/**
 * UNION fill: a cell is solid if its centre is inside ANY triangle. Same cell-centre convention as
 * rasterProfile, deliberately -- the round-trip gate compares the two, and a different sampling convention
 * would show up as a real disagreement when nothing was wrong.
 *
 * Returns the SAME SHAPE rasterProfile returns, so profileArea and every downstream consumer work unchanged.
 */
export function rasterFromTriangles(tris, { nx, ny, pad = 0.05, lo, hi, axis: opts_axis } = {}) {
    if (!(nx > 0 && ny > 0)) throw new Error("rasterFromTriangles needs positive nx, ny");
    if (!tris || !tris.length) throw new Error("rasterFromTriangles: no triangles -- an empty mask would render as 'the model has no cross-section', which is a lie about the input, not a measurement");
    let b = { lo, hi };
    if (!lo || !hi) {
        b = bounds(tris);                     // triangles ARE polygons for the purpose of a bounding box
        const sx = (b.hi[0] - b.lo[0]) * pad || 1e-6, sy = (b.hi[1] - b.lo[1]) * pad || 1e-6;
        b = { lo: [b.lo[0] - sx, b.lo[1] - sy], hi: [b.hi[0] + sx, b.hi[1] + sy] };
    }
    const cw = (b.hi[0] - b.lo[0]) / nx, ch = (b.hi[1] - b.lo[1]) / ny;
    const mask = new Uint8Array(nx * ny);
    let filled = 0;
    for (let j = 0; j < ny; j++) {
        const py = b.lo[1] + (j + 0.5) * ch;
        for (let i = 0; i < nx; i++) {
            const px = b.lo[0] + (i + 0.5) * cw;
            for (let t = 0; t < tris.length; t++) {
                if (inTriangle(px, py, tris[t])) { mask[j * nx + i] = 1; filled++; break; }
            }
        }
    }
    // v3037 -- THE GATE CAUGHT MY OWN OVERCLAIM. I argued projection "works on ANY mesh, open or closed". It
    // does not: a face PARALLEL to the projection axis collapses to a line and contributes no area. A tube open
    // at both ends, viewed down its own axis, genuinely has no silhouette -- that is a true fact about the
    // model, not a defect. What projection actually drops is the WATERTIGHT requirement, not the requirement
    // that the mesh present area to the camera. A closed mesh always presents some; an open one may not.
    //
    // So zero is refused rather than returned. A zero-area mask renders downstream as "this model has no cross
    // section", and the tunnel would compute a drag coefficient on nothing.
    if (filled === 0) throw new Error("every triangle is edge-on to the '" + (opts_axis || "?") +
        "' axis, so the silhouette has zero area -- this is a real property of the model, not an empty result. Project along a different axis.");
    return { mask, filled, nx, ny, cell: [cw, ch], lo: b.lo, hi: b.hi, fill: "union", source: "glb" };
}

/** The whole path in one call. */
export function profileFromMesh(positions, indices, opts = {}) {
    const axis = opts.axis || "z";
    const p = rasterFromTriangles(projectTriangles(positions, indices, axis), opts);
    p.axis = axis;
    p.kind = "silhouette";                    // NOT a section. Recorded so a reader never has to infer it.
    return p;
}

/**
 * Mask -> editable SVG. Run-length rectangles per row: compact, valid, and openable in Inkscape, which is the
 * point -- the raster is what the solver wants, the SVG is what a HUMAN wants when the silhouette needs a nose
 * shortened before it goes in the tunnel.
 *
 * It is BLOCKY AT GRID RESOLUTION and says so in its own title element, because an SVG that looks hand-drawn
 * invites the belief that it carries more precision than the mask it came from.
 */
export function maskToSVG(p) {
    const [cw, ch] = p.cell, rects = [];
    for (let j = 0; j < p.ny; j++) {
        let run = -1;
        for (let i = 0; i <= p.nx; i++) {
            const on = i < p.nx && p.mask[j * p.nx + i] === 1;
            if (on && run < 0) run = i;
            else if (!on && run >= 0) {
                rects.push('<rect x="' + (p.lo[0] + run * cw) + '" y="' + (p.lo[1] + j * ch) +
                           '" width="' + ((i - run) * cw) + '" height="' + ch + '"/>');
                run = -1;
            }
        }
    }
    const w = p.hi[0] - p.lo[0], h = p.hi[1] - p.lo[1];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + p.lo[0] + " " + p.lo[1] + " " + w + " " + h + '">' +
           "<title>silhouette along " + (p.axis || "?") + ", quantised to a " + p.nx + "x" + p.ny +
           " grid -- edges are grid-blocky by construction, not smooth geometry</title>" +
           '<g fill="#000" stroke="none">' + rects.join("") + "</g></svg>";
}

/**
 * Adapter for the mesh shape parseGLB already returns, so nothing has to unpack it at the call site.
 * v3037 -- glb.mjs/voxelize.mjs ALREADY EXISTED and already do the closed path (parseGLB, isClosed,
 * crossSection). This is not a replacement for any of it. crossSection SLICES and needs a closed surface;
 * this PROJECTS and does not. They answer different questions and both are worth having.
 */
export function profileFromGLBMesh(mesh, opts = {}) {
    if (!mesh || !mesh.positions) throw new Error("profileFromGLBMesh: not a parseGLB mesh");
    return profileFromMesh(mesh.positions, mesh.indices || null, opts);
}
