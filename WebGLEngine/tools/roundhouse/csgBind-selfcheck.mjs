// tools/roundhouse/csgBind-selfcheck.mjs
//
// v3519 -- THE CSG DEVICE (Round 2). physics/mesh/csg.mjs is a tree of EXACT signed-distance primitives with
// analytic gradients, built so a mesh can be graded against a corner known in closed form. Four exact facts, and
// the plant is the module's own named shortcut -- the cheap max() box, wrong exactly at the corners.

import { csgDevice } from "./csgBind.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const g = csgDevice.build({ mode: "tree" });
const b = csgDevice.build({ mode: "tree", config: { planted: true } });

ok("!! the EXACT box distance at a corner equals the closed-form Euclidean distance",
    g.boxExactAtCorner === true,
    `outside a box corner the distance matches the true corner distance to ${g.cornerErr.toExponential(2)} -- the ` +
    "exact SDF, not the cheap max(); this is the one place the round measures, because it is where a mesh's " +
    "corner has to land");

ok("!! the analytic gradient is a unit vector -- the normal is a FACT, not a finite difference",
    g.unitGradient === true,
    `|grad| - 1 is ${g.eikonalErr.toExponential(2)} across the sample points; an exact Euclidean distance has ` +
    "|grad| = 1 everywhere, and that gradient IS the Hermite normal a mesher places its vertex from");

ok("!! edgeCrossing lands ON the surface, found by bisection not lerp",
    g.crossingOnSurface === true,
    `the crossing sits at |p - c| = r to ${g.crossingErr.toExponential(2)} -- bisection on the sign, so a crease's ` +
    "kink does not throw the point off the way lerping the values would");

ok("!! union(A, A) = A to the bit -- a set identity",
    g.idempotent === true && g.idempotenceErr === 0,
    `the self-union equals the operand to ${g.idempotenceErr.toExponential(2)} because min(x, x) = x exactly`);

ok("!! a point inside one of two disjoint shapes is inside their union",
    g.unionMembership === true,
    "union is min of distances, so being inside either child is being inside the union -- the semantics the corner key relies on");

ok("!! the cheap max() box plant is WRONG exactly at the corners",
    b.boxExactAtCorner === false && b.cornerErr > 0.1,
    `built from max() alone, the box underestimates the corner distance by ${b.cornerErr.toExponential(2)} -- the ` +
    "SDF everyone writes first, and the error is entirely at the corners, which is what dual contouring meshes");

ok("...and the sphere's eikonal, crossing and idempotence keys stay GREEN",
    b.unitGradient === true && b.crossingOnSurface === true && b.idempotent === true,
    "the plant is in the box alone, so the exact facts that never touch it do not move -- the corner key is the " +
    "one that had to be built to catch the shortcut");

console.log();
if (fails) { console.log("csgBind-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("csgBind-selfcheck: all checks pass");
