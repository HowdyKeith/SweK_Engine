// WebGLEngine/tools/ship/extrudePolygon-selfcheck.mjs
//
// Run: node tools/ship/extrudePolygon-selfcheck.mjs   (~0.04s -- MEASURED)
//
// v3279 -- THE HALF OF SVG-TO-3D THAT HAS AN ANSWER KEY.
//
// Keith asked about renatoworks/3dsvg's extrusion technique. That repo fails the no-npm bar (React + Next.js),
// but the technique splits in two and THE HALVES ARE NOT THE SAME KIND OF WORK:
//
//   SVG path -> polygon   beziers, arcs, holes, winding. A PARSER, where a wrong answer looks right.
//   polygon  -> solid     triangulate, cap, wall. ARITHMETIC, AND CHECKABLE AGAINST A CLOSED FORM.
//
// *** THE ANSWER KEY OWES NOTHING TO THE CODE THAT BUILT THE MESH. *** A prism's volume is cross-section times
// depth, and a simple polygon's area is the SHOELACE FORMULA -- exact, independent of how the triangulation
// went. That is the difference between a test and a restatement, and it is why this half was worth building and
// the parser half was not.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { extrudePolygon, watertight, shoelace, triangulate } =
    await import(pathToFileURL(path.join(ROOT, "mesh", "extrudePolygon.mjs")).href);

{
    const sq = [[0, 0], [4, 0], [4, 3], [0, 3]];
    const r = extrudePolygon(sq, 2);
    ok("!! *** volume matches the shoelace answer key exactly ***",
        r.volume === 24 && Math.abs(shoelace(sq)) === 12,
        "4x3 cross-section, depth 2 -> 24. THE KEY IS CLOSED-FORM AND OWES NOTHING TO THE TRIANGULATION -- a " +
        "check derived from the same code that built the mesh would agree with itself no matter how wrong both were");

    ok("!! ...and the mesh is WATERTIGHT: every edge shared by exactly two triangles",
        watertight(r.indices).ok,
        JSON.stringify(watertight(r.indices)) + ". The side walls REUSE THE CAP'S VERTEX RING; generating fresh " +
        "vertices would produce a mesh that LOOKS IDENTICAL and carries a seam of duplicate points -- invisible " +
        "until something asks whether it is closed, or a normal is smoothed across it");
}
{
    // CONCAVE, BECAUSE A SQUARE PROVES ALMOST NOTHING. Ear clipping's whole difficulty is reflex vertices.
    const L = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3]];
    const r = extrudePolygon(L, 1);
    ok("!! *** a CONCAVE polygon triangulates, and its volume still matches ***",
        r.volume === 6 && watertight(r.indices).ok && r.tris === 20,
        "an L-shape, area 6, 20 triangles, watertight. A CONVEX FIXTURE WOULD PASS ON A ROUTINE THAT CANNOT " +
        "HANDLE REFLEX VERTICES AT ALL, which is the only interesting case ear clipping has");

    ok("...and winding does not change the result",
        extrudePolygon([...L].reverse(), 1).volume === 6 &&
        watertight(extrudePolygon([...L].reverse(), 1).indices).ok,
        "the routine normalises to one winding rather than handling both. A ROUTINE THAT TRIED TO SUPPORT EITHER " +
        "WOULD BE TWO ROUTINES SHARING A NAME, and ear clipping's convexity test flips sign with the winding");
}
{
    let threw = false;
    try { extrudePolygon([[0, 0], [1, 1]], 1); } catch { threw = true; }
    ok("!! a degenerate input REFUSES rather than returning a broken solid",
        threw && triangulate([[0, 0], [1, 1]]).length === 0,
        "two points are not a polygon. RETURNING AN EMPTY MESH would let a caller render nothing and conclude " +
        "the extrusion worked -- the convincing-nothing failure this tree has now refused five times");

    // A self-intersecting figure-eight has no valid ear decomposition. The loop is BOUNDED so it stops instead
    // of hanging: A ROUTINE THAT HANGS ON BAD INPUT IS WORSE THAN ONE THAT RETURNS LESS THAN IT SHOULD.
    const bow = [[0, 0], [2, 2], [2, 0], [0, 2]];
    let finished = false;
    try { triangulate(bow); finished = true; } catch { finished = true; }
    ok("...and a self-intersecting polygon terminates",
        finished,
        "no ear exists, so the loop stops rather than spinning. The result is NOT claimed to be correct for such " +
        "input -- only that the caller gets control back");
}

console.log();
console.log("  ----  WHAT THIS DELIBERATELY IS NOT: an SVG loader. Path parsing -- beziers, arcs, holes, winding");
console.log("  ----  rules -- is where a wrong answer LOOKS RIGHT, and three's SVGLoader is not vendored here.");
console.log("  ----  Holes are also not supported: they need the ring to be bridged before ear clipping, and a");
console.log("  ----  letter O would come out solid. SAID HERE RATHER THAN DISCOVERED ON A RIG.");
if (fails) { console.log("extrudePolygon-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("extrudePolygon-selfcheck: all checks pass");
