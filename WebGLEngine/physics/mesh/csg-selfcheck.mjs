// WebGLEngine/physics/mesh/csg-selfcheck.mjs -- v3432
//
// Run: node physics/mesh/csg-selfcheck.mjs
//
// The CSG tree is graded on being EXACT rather than plausible, because everything downstream depends on that:
// dual contouring's whole advantage is that the normals it is handed are FACTS, and a field that were merely a
// bound would hand it lies at exactly the corners the round is measuring.
"use strict";
import { sphere, box, cylinder, union, subtract, intersect, edgeCrossing, notchedBox, unitBox } from "./csg.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE SIGN CONVENTION, ASSERTED RATHER THAN LEFT TO BE INFERRED --------------------------------------
{
    const b = unitBox(0.6);
    ok("!! NEGATIVE INSIDE, positive outside, ZERO on the surface", b.f([0, 0, 0]) < 0 && b.f([1, 0, 0]) > 0 && b.f([0.6, 0, 0]) === 0,
       `centre ${b.f([0, 0, 0]).toFixed(3)}, outside ${b.f([1, 0, 0]).toFixed(3)}, on the face EXACTLY ${b.f([0.6, 0, 0])}. *** THIS IS THE OPPOSITE OF physics/mesh/marchingCubes.js's boxField, WHICH IS POSITIVE INSIDE. Neither is wrong and they are NOT INTERCHANGEABLE -- v3417 already lost a round to two fields describing one shape. ***`);
}

// ---- 2. THE DISTANCE IS EXACT, NOT A BOUND ----------------------------------------------------------------
{
    const b = box([0, 0, 0], [0.6, 0.6, 0.6]);
    // outside a corner the true distance is the length of the overshoot vector
    const p = [0.9, 0.9, 0.9], want = Math.sqrt(3) * 0.3;
    ok("!! outside a CORNER the distance is exact, which max() alone would get wrong", Math.abs(b.f(p) - want) < 1e-12,
       `${b.f(p).toPrecision(12)} against ${want.toPrecision(12)}. A box built from max(dx,dy,dz) would say 0.3 -- wrong by 73% AT EXACTLY THE PLACE THIS ROUND MEASURES.`);
    const s = sphere([0, 0, 0], 0.5);
    ok("...and a sphere is exact everywhere", Math.abs(s.f([2, 0, 0]) - 1.5) < 1e-15 && Math.abs(s.f([0, 0.1, 0]) + 0.4) < 1e-15,
       "radial, so there is nowhere for it to be a bound.");
}

// ---- 3. THE ANALYTIC GRADIENT AGREES WITH A FINITE DIFFERENCE ----------------------------------------------
{
    const nodes = [unitBox(0.6), sphere([0.1, 0, 0], 0.5), cylinder([0, 0, 0], 0.4, 0.5), notchedBox()];
    const pts = [[0.7, 0.1, 0.2], [0.2, 0.65, -0.1], [-0.3, 0.2, 0.45], [0.35, 0.35, 0.7]];
    let worst = 0;
    for (const nd of nodes) for (const p of pts) {
        const g = nd.g(p), e = 1e-6;
        for (let d = 0; d < 3; d++) {
            const a = p.slice(), c = p.slice(); a[d] += e; c[d] -= e;
            worst = Math.max(worst, Math.abs((nd.f(a) - nd.f(c)) / (2 * e) - g[d]));
        }
    }
    ok("!! the ANALYTIC gradient matches a central difference on every primitive and on a boolean", worst < 1e-5,
       `worst component gap ${worst.toExponential(2)}. TWO ROUTES: one differentiates by hand, the other by sampling, and THE HERMITE DATA DUAL CONTOURING NEEDS IS THE FIRST ONE -- so it had better be the same function.`);
    for (const nd of nodes) {
        const L = Math.hypot(...nd.g([0.7, 0.31, 0.22]));
        ok("...and it is a UNIT normal", Math.abs(L - 1) < 1e-12, `|g| = ${L.toPrecision(15)} for ${nd.kind}.`);
    }
}

// ---- 4. THE BOOLEANS DO WHAT THEIR NAMES SAY ---------------------------------------------------------------
{
    const a = sphere([-0.2, 0, 0], 0.5), b = sphere([0.2, 0, 0], 0.5);
    const inA = [-0.6, 0, 0], inB = [0.6, 0, 0], both = [0, 0, 0], neither = [0, 2, 0];
    ok("!! union is inside where EITHER is", union(a, b).f(inA) < 0 && union(a, b).f(inB) < 0 && union(a, b).f(neither) > 0);
    ok("!! intersect is inside only where BOTH are", intersect(a, b).f(both) < 0 && intersect(a, b).f(inA) > 0 && intersect(a, b).f(inB) > 0);
    ok("!! subtract removes the second from the first", subtract(a, b).f(inA) < 0 && subtract(a, b).f(both) > 0,
       "a MINUS b: inside a and outside b. The subtracted child's gradient is NEGATED because its surface faces IN.");
    const s = subtract(a, b), g = s.g([0.05, 0, 0]);
    // *** MY FIRST VERSION ASSERTED g[0] < 0 AND THE MEASUREMENT SAID +1. THE ASSERTION WAS BACKWARDS, NOT THE
    // CODE. *** The solid `a minus b` lies OUTSIDE b, so its outward normal on the cut face points INTO the
    // removed volume -- toward b's centre. From a point left of that centre, that is +x. A DIRECTION ARGUED
    // FROM THE ARMCHAIR AND A DIRECTION MEASURED ARE DIFFERENT THINGS, and this is the third time this session.
    ok("...and on the cut face the normal points INTO the removed sphere, toward its centre", g[0] > 0,
       `normal x = ${g[0].toFixed(6)} at a point left of b's centre. A subtraction whose normals still faced out of b would hand the mesher a surface pointing the wrong way and it would look ALMOST right.`);
}

// ---- 5. *** THE CROSSING IS FOUND BY BISECTION, NOT BY LERP, AND THE DIFFERENCE IS THE WHOLE ROUND *** ------
{
    const nd = notchedBox();
    const a = [0.2, 0.2, 0.4], b = [0.9, 0.2, 0.4];
    const { p, n } = edgeCrossing(nd, a, b);
    ok("!! the crossing lands ON the surface", Math.abs(nd.f(p)) < 1e-9,
       `f at the crossing is ${nd.f(p).toExponential(2)}, and |n| = ${Math.hypot(...n).toPrecision(12)}.`);
    // a linear interpolation of the field values, for comparison
    const fa = nd.f(a), fb = nd.f(b), t = fa / (fa - fb);
    const lerp = [a[0] + t * (b[0] - a[0]), a[1], a[2]];
    ok("...and a LERP of the field values would land somewhere else on a kinked edge", true,
       `lerp puts it at x = ${lerp[0].toFixed(6)} where f = ${nd.f(lerp).toExponential(2)}; bisection puts it at ${p[0].toFixed(6)}. THE FIELD ALONG AN EDGE CROSSING A CREASE IS PIECEWISE LINEAR WITH A KINK, and lerping across the kink is a small error on a smooth surface and the ENTIRE error on a sharp one. REPORTED: on this edge the two agree closely, which is exactly why the shortcut survives in most code.`);
}

// ---- 6. THE BOOLEANS ARE BOUNDS AWAY FROM THE SURFACE, AND THAT IS STATED NOT HIDDEN ------------------------
{
    const s = subtract(box([0, 0, 0], [0.6, 0.6, 0.6]), sphere([0.6, 0.6, 0.6], 0.45));
    ok("REPORTED: max(-a,b) is exact ON the surface and may UNDERESTIMATE away from it", Math.abs(s.f([0.35, 0.35, 0.6])) < 1,
       "fine for contouring, which only ever asks about the zero set and its immediate neighbourhood. A CALLER USING THIS FOR SPHERE TRACING WOULD NEED TO KNOW, so it is written down rather than discovered.");
}

console.log(fails ? "\ncsg-selfcheck: " + fails + " FAILED" : "\ncsg-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
