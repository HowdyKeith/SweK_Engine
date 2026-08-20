// WebGLEngine/tools/ship/glbProfile-selfcheck.mjs -- v3037
//
// THE KEY IS FREE, BECAUSE THE FORWARD PATH ALREADY WORKS.
//
// glbProfile is the INVERSE of an operation this tree already performs: battleship3d.html extrudes an SVG
// outline into 3D. So the answer key does not have to be invented or eyeballed -- extrude a known profile,
// de-extrude it, and the recovered area must match the original. Nothing external is trusted; the reference is
// the forward path itself. Same shape as the RLE codec's lossless round-trip.
//
// The extrusion here is done in four lines rather than by importing the page, on purpose: extruding a 2D polygon
// along an axis IS four lines, and importing a browser page into a gate to get them would drag THREE and a DOM
// in for no gain. What matters is that the SHAPE going in is known and the AREA coming out is compared to it.
"use strict";
import { rasterProfile, profileArea } from "../../physics/mesh/svgProfile.mjs";
import { projectTriangles, rasterFromTriangles, profileFromMesh, maskToSVG } from "../../physics/mesh/glbProfile.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);

// --- extrude a closed 2D polygon along +Z into a triangle soup (the forward path, minimally) ------------------
function extrude(poly, depth) {
    const pos = [], n = poly.length;
    const push = (p, z) => pos.push(p[0], p[1], z);
    for (let i = 0; i < n; i++) {                              // side walls: two triangles per edge
        const a = poly[i], b = poly[(i + 1) % n];
        push(a, 0); push(b, 0); push(b, depth);
        push(a, 0); push(b, depth); push(a, depth);
    }
    for (let i = 1; i < n - 1; i++) {                          // fan caps at both ends (convex fixtures only)
        push(poly[0], 0); push(poly[i], 0); push(poly[i + 1], 0);
        push(poly[0], depth); push(poly[i], depth); push(poly[i + 1], depth);
    }
    return new Float32Array(pos);
}

const SQUARE = [[0, 0], [2, 0], [2, 1], [0, 1]];               // area 2.0, exactly
const GRID = { nx: 120, ny: 120, lo: [-0.5, -0.5], hi: [2.5, 1.5] };   // FIXED bounds both ways: differing
                                                                       // auto-padding would move the cells and
                                                                       // show up as a fake disagreement.

// ---- 1. THE ROUND TRIP: extrude, de-extrude, areas agree ----------------------------------------------------
{
    const before = profileArea(rasterProfile([SQUARE], GRID));
    const p = profileFromMesh(extrude(SQUARE, 3.0), null, { ...GRID, axis: "z" });
    const after = profileArea(p);
    ok("!! extrude -> de-extrude recovers the profile area", relErr(after, before) < 0.02,
       "before " + before.toFixed(4) + ", after " + after.toFixed(4) + ", rel " + (relErr(after, before) * 100).toFixed(2) + "%");
    ok("...and both agree with the analytic area of the fixture", relErr(after, 2.0) < 0.03,
       "true area 2.0, measured " + after.toFixed(4) + " -- the key is closed-form, not just self-consistent");
    ok("the result labels itself a silhouette, not a section", p.kind === "silhouette" && p.axis === "z" && p.fill === "union");
}

// ---- 2. SABOTAGE, AND ITS FIRST FORM WAS WRONG -------------------------------------------------------------
{
    // My first sabotage dropped a triangle from a CLOSED box and nothing moved. That is not a weak gate, it is
    // a true property I had not accounted for: under projection the front and back caps land on top of each
    // other, so the union is REDUNDANT and losing one face of a doubled pair is invisible by construction.
    //
    // An area invariant can only see coverage that nothing else replaces. So the sabotage uses a SINGLE cap --
    // where every triangle is the only thing covering its cells -- and now a lost triangle has to show.
    const cap = (drop) => {
        const v = [];
        for (let i = 1; i < SQUARE.length - 1 - (drop ? 1 : 0); i++)
            v.push(SQUARE[0][0], SQUARE[0][1], 0, SQUARE[i][0], SQUARE[i][1], 0, SQUARE[i + 1][0], SQUARE[i + 1][1], 0);
        return new Float32Array(v);
    };
    const a = profileArea(profileFromMesh(cap(false), null, { ...GRID, axis: "z" }));
    const b = profileArea(profileFromMesh(cap(true), null, { ...GRID, axis: "z" }));
    ok("!! SABOTAGE: dropping a triangle nothing else covers makes the area come up SHORT", b < a * 0.995,
       "full " + a.toFixed(4) + " vs mutilated " + b.toFixed(4) + " -- the area invariant is load-bearing where coverage is not doubled");
    ok("...and the redundancy is stated, not hidden", true,
       "on a closed body the same mutilation is INVISIBLE to this check -- that is a limit of area invariants, recorded rather than papered over");
}

// ---- 3. OPEN IS FINE; EDGE-ON IS REFUSED. THIS SECTION FAILED FIRST AND CORRECTED THE MODULE. ---------------
{
    // (a) An OPEN mesh that presents area: the two caps, no side walls. Not closed by any definition, and a
    // slicer would produce open chains from it. The projector does not care -- it never asks what is inside.
    const caps = [];
    for (const z of [0, 3]) for (let i = 1; i < SQUARE.length - 1; i++)
        caps.push(SQUARE[0][0], SQUARE[0][1], z, SQUARE[i][0], SQUARE[i][1], z, SQUARE[i + 1][0], SQUARE[i + 1][1], z);
    const open = profileArea(rasterFromTriangles(projectTriangles(new Float32Array(caps), null, "z"), { ...GRID, axis: "z" }));
    ok("!! an OPEN shell still yields a usable profile", relErr(open, 2.0) < 0.03,
       "area " + open.toFixed(4) + " from a capped-but-wall-less mesh -- no repair, no watertight requirement");

    // (b) THE OVERCLAIM THIS CAUGHT. I wrote that projection "works on ANY mesh". It does not: side walls are
    // PARALLEL to +Z, so down Z they collapse to lines and contribute nothing. Zero is the honest answer for
    // that model on that axis -- and it must be REFUSED, not returned, because downstream a zero-area mask
    // reads as "no cross-section" and the tunnel would compute a coefficient on nothing.
    const walls = [];
    for (let i = 0; i < SQUARE.length; i++) {
        const a = SQUARE[i], b = SQUARE[(i + 1) % SQUARE.length];
        walls.push(a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], 3);
        walls.push(a[0], a[1], 0, b[0], b[1], 3, a[0], a[1], 3);
    }
    const w = new Float32Array(walls);
    let msg = "";
    try { rasterFromTriangles(projectTriangles(w, null, "z"), { ...GRID, axis: "z" }); }
    catch (e) { msg = e.message; }
    ok("!! an EDGE-ON projection refuses and names the axis", /edge-on/.test(msg) && /'z'/.test(msg), msg.slice(0, 84));
    ok("...and the SAME mesh projects fine down a different axis",
       profileArea(rasterFromTriangles(projectTriangles(w, null, "y"), { nx: 100, ny: 100, axis: "y" })) > 0.5,
       "which is why the refusal says to try another axis rather than calling the model broken");
}

// ---- 4. AXIS IS A REAL KNOB, AND GETTING IT WRONG IS VISIBLE -------------------------------------------------
{
    const m = extrude(SQUARE, 3.0);
    const alongZ = profileArea(profileFromMesh(m, null, { nx: 100, ny: 100, axis: "z" }));
    const alongY = profileArea(profileFromMesh(m, null, { nx: 100, ny: 100, axis: "y" }));
    // 2x1 extruded 3 deep: down Z sees 2x1, down Y sees 2x3. Different by construction -- so a wrong axis
    // produces a plausible-looking shape with the wrong area, which is exactly why this is checked.
    ok("!! projecting down the wrong axis gives a different profile", relErr(alongY, alongZ) > 0.5,
       "z-axis " + alongZ.toFixed(3) + " vs y-axis " + alongY.toFixed(3) + " -- a silent axis mismatch would be a wrong answer that looks right");
}

// ---- 5. IT REFUSES RATHER THAN RETURNING AN EMPTY MASK -------------------------------------------------------
{
    const threw = (fn) => { try { fn(); return false; } catch { return true; } };
    ok("!! no triangles REFUSES instead of returning a zero-area mask", threw(() => rasterFromTriangles([], GRID)),
       "an empty mask renders as 'this model has no cross-section', which is a claim about the input, not a measurement");
    ok("a bad axis refuses", threw(() => projectTriangles(new Float32Array(9), null, "w")));
    ok("a partial triangle refuses", threw(() => projectTriangles(new Float32Array(12), null, "z")));
}

// ---- 6. THE SVG IT EMITS IS VALID AND HONEST ABOUT ITSELF ----------------------------------------------------
{
    const svg = maskToSVG(profileFromMesh(extrude(SQUARE, 3.0), null, { nx: 40, ny: 40, ...GRID, axis: "z" }));
    ok("emits a well-formed svg root with a viewBox", /^<svg [^>]*viewBox="/.test(svg) && svg.endsWith("</svg>"));
    ok("contains rectangles, not an empty group", (svg.match(/<rect /g) || []).length > 3, (svg.match(/<rect /g) || []).length + " rects");
    ok("!! the svg admits it is grid-quantised", /grid-blocky by construction/.test(svg),
       "an svg that looks hand-drawn invites belief in precision the mask does not have");
}

// ---- 7. IT DOES NOT REIMPLEMENT WHAT SVGPROFILE ALREADY OWNS -------------------------------------------------
{
    const src = (await import("node:fs")).readFileSync(new URL("../../physics/mesh/glbProfile.mjs", import.meta.url), "utf8");
    ok("!! imports bounds and profileArea rather than re-deriving them", /import \{ bounds, profileArea \} from "\.\/svgProfile\.mjs"/.test(src) &&
       !/function (bounds|profileArea)\s*\(/.test(src),
       "two definitions of an area is the law this tree has paid for nine times");
    ok("the union fill rule is documented as deliberate, not accidental", /even-odd|EVEN-ODD/i.test(src) && /union/i.test(src));
}

// ---- 8. THROUGH THE REAL FILE FORMAT, NOT A HAND-ROLLED EXTRUDER ---------------------------------------------
{
    // glb.mjs already has boxMesh and writeGLB, so the round trip can close through an ACTUAL .glb rather than
    // through my own four-line extruder. A gate whose reference is a fixture I also wrote proves less.
    const { boxMesh, writeGLB, parseGLB } = await import("../../physics/mesh/glb.mjs");
    const { profileFromGLBMesh } = await import("../../physics/mesh/glbProfile.mjs");
    const back = parseGLB(new Uint8Array(writeGLB(boxMesh(2, 1, 3))));
    const a = profileArea(profileFromGLBMesh(back, { nx: 160, ny: 160, pad: 0.02, axis: "z" }));
    ok("!! a real GLB round-trips to its analytic silhouette", relErr(a, 2.0) < 0.05,
       "2x1x3 box down z -> expect 2.0, got " + a.toFixed(4));
    const { isClosed } = await import("../../physics/mesh/voxelize.mjs");
    ok("...and the closed path still agrees it is closed", isClosed(back).closed === true,
       "silhouette does not REPLACE crossSection -- a closed mesh can still be sliced, and should be");
}

console.log("\nglbProfile-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
