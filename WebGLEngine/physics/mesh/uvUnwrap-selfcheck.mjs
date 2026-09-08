// physics/mesh/uvUnwrap-selfcheck.mjs -- v4536
//
// Run: node physics/mesh/uvUnwrap-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** GRADED ON THE OUTPUT OF THE CALLER THAT IS ACTUALLY BLOCKED, NOT ON A SQUARE. *** meshCSG.mjs says its
// CUT polygons have no texture coordinates "because nothing unwrapped a surface that had not been made yet",
// so the fixture here is a real subtract() and the polygons graded are the ones that boolean created. A fixture
// that constructs its own convenient input is the shape this session has already caught twice.
//
// The headline is a number and not an adjective: UNIFORM TEXEL DENSITY, measured as the spread of (3D edge
// length / UV edge length) across every edge. "Low distortion" is unfalsifiable; a spread at float epsilon is
// not.
import { planeBasis, projectPoly, shelfPack, unwrap, texelDensity, rectsOverlap } from "./uvUnwrap.mjs";
import { subtract, planeOf } from "./meshCSG.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cube = (cx, cy, cz, r) => {
    const faces = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];
    const v = (i) => [cx + (i & 1 ? r : -r), cy + (i & 2 ? r : -r), cz + (i & 4 ? r : -r)];
    return faces.map((f) => { const vs = f.map(v); return { vs, pl: planeOf(vs) }; });
};

console.log("1. the basis, on the normals that break the textbook spelling");
{
    // *** THE SIX AXIS NORMALS ARE THE TEST, BECAUSE THEY ARE WHERE cross(n, up) DIES. *** Every floor and
    // every ceiling has n = +/-y, and a y-up seed makes the cross product zero there -- so the case that
    // matters most is the one a fixed seed handles worst. Random normals are added so the axis cases cannot
    // pass by being special-cased.
    const axis = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const rand = [];
    let s = 12345;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff * 2 - 1;
    for (let i = 0; i < 200; i++) {
        const n = [rnd(), rnd(), rnd()], L = Math.hypot(...n);
        if (L > 1e-6) rand.push(n.map((x) => x / L));
    }
    let worstOrtho = 0, worstUnit = 0;
    for (const n of [...axis, ...rand]) {
        const { t, b } = planeBasis(n);
        worstOrtho = Math.max(worstOrtho, Math.abs(dot(t, b)), Math.abs(dot(t, n)), Math.abs(dot(b, n)));
        worstUnit = Math.max(worstUnit, Math.abs(Math.hypot(...t) - 1), Math.abs(Math.hypot(...b) - 1));
    }
    ok("!! *** the basis is orthonormal for ALL SIX AXIS NORMALS, where a fixed up-vector degenerates ***",
       worstOrtho < 1e-12 && worstUnit < 1e-12,
       `${6 + rand.length} normals: worst |dot| ${worstOrtho.toExponential(2)}, worst |len-1| ${worstUnit.toExponential(2)}. ` +
       "A y-up seed gives cross(n, up) = 0 on every floor and ceiling in the tree -- the commonest polygon there is.");
}

console.log("\n2. projection is an ISOMETRY, which is why this round owes no stretch minimiser");
{
    const polys = cube(0, 0, 0, 1);
    let worst = 0;
    for (const p of polys) {
        const { pts } = projectPoly(p);
        for (let j = 0; j < p.vs.length; j++) {
            const k = (j + 1) % p.vs.length;
            const d3 = Math.hypot(p.vs[k][0] - p.vs[j][0], p.vs[k][1] - p.vs[j][1], p.vs[k][2] - p.vs[j][2]);
            const d2 = Math.hypot(pts[k][0] - pts[j][0], pts[k][1] - pts[j][1]);
            worst = Math.max(worst, Math.abs(d3 - d2));
        }
    }
    ok("!! every projected edge keeps its 3D length exactly", worst < 1e-12,
       `worst edge-length change ${worst.toExponential(2)} over 24 edges. A planar polygon projected into its ` +
       "OWN plane through an orthonormal basis is an isometry, so there is no distortion to minimise -- which " +
       "is the whole reason a planar unwrapper is a complete answer for meshCSG and a wall, and not for a robot.");
}

console.log("\n3. the real fixture: polygons a boolean created, which have never had UVs");
const out = subtract(cube(0, 0, 0, 1), cube(0.8, 0.8, 0.8, 0.7));
const cutCount = out.filter((p) => p.src === "cut").length;
const R = unwrap(out);
const D = texelDensity(out, R.uvs);
{
    ok("the fixture really is boolean output, not a hand-built square",
       out.length > 6 && cutCount > 0,
       `${out.length} polygons from subtract(), ${cutCount} of them tagged CUT -- the faces meshCSG says "ha[ve] ` +
       'no texture coordinates, because nothing unwrapped a surface that had not been made yet".');

    ok("!! every polygon is unwrapped, exactly once, with its own vertex count",
       R.uvs.length === out.length && out.every((p, i) => R.uvs[i] && R.uvs[i].length === p.vs.length),
       `${R.uvs.length} UV sets for ${out.length} polygons; vertex counts match on all of them.`);

    let inRange = true, worstOut = 0;
    for (const uv of R.uvs) for (const [u, v] of uv) {
        if (u < -1e-12 || u > 1 + 1e-12 || v < -1e-12 || v > 1 + 1e-12) inRange = false;
        worstOut = Math.max(worstOut, -u, u - 1, -v, v - 1);
    }
    ok("!! every UV lands inside [0,1]", inRange,
       `worst excursion outside the unit square ${worstOut.toExponential(2)}.`);

    let overlaps = 0;
    for (let i = 0; i < R.charts.length; i++) for (let j = i + 1; j < R.charts.length; j++)
        if (rectsOverlap(R.charts[i], R.charts[j])) overlaps++;
    ok("!! *** NO TWO CHARTS OVERLAP IN THE ATLAS ***", overlaps === 0,
       `${R.charts.length} charts, ${R.charts.length * (R.charts.length - 1) / 2} pairs checked, ${overlaps} overlapping. ` +
       "Checked pairwise rather than trusted from the packer's own bookkeeping: the packer is the thing under test.");

    ok("!! *** TEXEL DENSITY IS ONE NUMBER FOR THE WHOLE MESH ***", D.spread < 1e-12 && D.degenerate === 0,
       `${D.mean.toFixed(6)} world units per UV unit across ${D.n} edges, spread ${D.spread.toExponential(2)}, ` +
       `${D.degenerate} degenerate. Each chart is isometric and every chart is divided by ONE atlas span, so the ` +
       "composition is a single global scale -- the property a texture artist feels, stated as a spread rather " +
       "than as a bound nobody can fail.");

    // *** THE NUMBER THAT WAS BEING REPORTED WRONG, AND IT TOOK A SABOTAGE THAT WOULD NOT FIRE TO FIND IT. ***
    // The first draft reported chart area over the STRIP and called it occupancy. UVs address a SQUARE, so a
    // strip 4.98 wide and 7.02 tall wastes 29% of the texture width -- and the draft's atlas came out taller
    // than wide on EVERY input from 2 charts to 21, which made `Math.max(width, height)` a branch that never
    // took its first arm. Both numbers are asserted here so the gap between them stays visible: a packer that
    // improves the strip while lengthening the atlas would raise one and drop the other.
    ok("!! *** BOTH occupancies, because reporting only the strip hid a 29% letterbox ***",
       R.textureOccupancy > 0.55 && R.occupancy > R.textureOccupancy,
       `strip ${(R.occupancy * 100).toFixed(1)}%, TEXTURE ${(R.textureOccupancy * 100).toFixed(1)}% on an ` +
       `atlas ${R.atlas.w.toFixed(3)} x ${R.atlas.h.toFixed(3)}. Searching the strip width for the smallest ` +
       "square lifted the texture figure from 48.7% to 62.0% on this fixture, and from 50.0% to 61.5% on 13 " +
       "unit squares -- the guess it replaced was max(widest, sqrt(area)), which reads obvious and is not.");
}

console.log("\n4. the packer, measured against its own alternative rather than asserted");
{
    const charts = out.map(projectPoly).map((c) => ({ w: c.w, h: c.h }));
    const area = charts.reduce((s, c) => s + c.w * c.h, 0);
    const width = Math.max(charts.reduce((m, c) => Math.max(m, c.w), 0), Math.sqrt(area));
    const A = shelfPack(charts, { width, sort: true }), B = shelfPack(charts, { width, sort: false });
    const occ = (p) => area / (width * (p.height || 1));
    // *** THE SORT IS A NUMBER, NOT FOLKLORE. *** Unsorted shelf packing spends a whole shelf's height on
    // whatever tall rect happens to arrive last in it; both are run and both printed, so a later change that
    // makes the sort pointless shows up as the two numbers converging rather than as nothing at all.
    // *** STRICTLY better, not "no worse", AND THAT MATTERS BECAUSE THE FIRST SPELLING WENT 0 RED. ***
    // `occ(A) >= occ(B)` passes when the sort is a NO-OP, because then the two runs are the same run. The
    // check verified that sorting helps and never that sorting happened. Strict inequality on this fixture is
    // a fact about this fixture, which is the honest form: if a later change makes the sort pointless HERE,
    // this row fires and somebody re-derives it rather than the row quietly asserting nothing.
    ok("!! height-descending beats arrival order STRICTLY, and both numbers are printed",
       occ(A) > occ(B) + 1e-9,
       `sorted ${(occ(A) * 100).toFixed(1)}% occupancy in height ${A.height.toFixed(3)}; unsorted ` +
       `${(occ(B) * 100).toFixed(1)}% in ${B.height.toFixed(3)}.`);

    let over = 0;
    for (let i = 0; i < A.placements.length; i++) for (let j = i + 1; j < A.placements.length; j++)
        if (rectsOverlap(A.placements[i], A.placements[j])) over++;
    ok("the packer's placements are disjoint under the sort too", over === 0 && A.ok === true,
       `${A.placements.length} placements, ${over} overlapping, ok=${A.ok}.`);
}

console.log("\n5. what this does NOT handle, shown failing rather than described");
{
    // *** A NON-PLANAR QUAD IS THE ONE INPUT THAT LOOKS LIKE A VALID ONE. *** dualContour emits quads and
    // nothing guarantees their four corners are coplanar. projectPoly takes the plane of the first three
    // vertices, so a fourth vertex off that plane projects to somewhere its 3D distances do not survive --
    // and the failure is SILENT in the UVs. It is not silent in the density spread, which is the argument for
    // reporting that number rather than a pass/fail bound: the limit announces itself in the measurement the
    // file already takes.
    const flat = { vs: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] };
    const bent = { vs: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0.5]] };
    const sFlat = texelDensity([flat], unwrap([flat]).uvs).spread;
    const sBent = texelDensity([bent], unwrap([bent]).uvs).spread;
    ok("!! a NON-PLANAR polygon is visible in the density spread rather than silently wrong",
       sFlat < 1e-12 && sBent > 1e-3,
       `planar quad spread ${sFlat.toExponential(2)}, the same quad with one corner lifted 0.5 reads ` +
       `${sBent.toExponential(2)} -- ${(sBent / Math.max(sFlat, 1e-18)).toExponential(1)}x. dualContour emits ` +
       "quads with no coplanarity guarantee, so this is the input a future caller will actually bring.");

    const empty = unwrap([]);
    ok("an empty polygon list returns an empty atlas rather than throwing",
       empty.uvs.length === 0 && empty.scale === 0 && empty.atlas.w === 0);
}

// ---- SABOTAGE LOG -- graded on EXIT CODES, restored after each ------------------------------------------------
//   A  basis seed fixed to [0,1,0], the textbook spelling      4 RED
//   B  v scaled by 1/height instead of the shared span         1 RED  (see below -- it took three tries)
//   C  the packer never starts a new shelf                     2 RED
//   D  projectPoly does not re-origin a chart to its corner    1 RED
//   E  the height-descending sort becomes a no-op              1 RED  (0 RED before the row went strict)
//   F  the strip-width search is cut to a single candidate     1 RED
//   G  3D edge length computed in xy only, ignoring z          2 RED
//
// *** B IS THE ENTRY WORTH READING, BECAUSE IT WENT 0 RED TWICE AND NEITHER TIME WAS THE CHECK'S FAULT. ***
// The whole point of one shared scale is that u and v cannot drift apart, so scaling one axis by its own
// dimension should be the loudest sabotage here. It changed NOTHING -- twice. `scale` is 1/max(width, height),
// so whichever axis IS the maximum has 1/dimension and 1/span equal by arithmetic, and a sabotage aimed at
// that axis is a no-op no matter how wrong it looks. First attempt hit the tall axis when the atlas was tall;
// then fixing the packer made the atlas WIDE, and the second attempt hit the wide one. Only the non-dominant
// axis is observable, and which axis that is changed underneath the sabotage when unrelated code improved.
//
// Chasing it is what found the letterbox: the reason `Math.max(width, height)` never took its first arm was
// that the packer produced a taller-than-wide atlas on every input in existence, so a fifth of the texture was
// empty and the occupancy number being reported could not see it. A SABOTAGE THAT WILL NOT FIRE IS A READING,
// and the thing it reads is usually not the check.

console.log(fails ? "\nuvUnwrap-selfcheck: " + fails + " FAILED" : "\nuvUnwrap-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
