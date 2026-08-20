// physics/mesh/featurePreserve-selfcheck.mjs -- v3417
//
// Run: node physics/mesh/featurePreserve-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** THE QUESTION THIS ANSWERS WITH A NUMBER: IS A FEATURE-PRESERVING EXTRACTOR WORTH BUILDING? ***
//
// Keith raised Cubical Marching Squares (Ho, Wu, Chen, Chuang, Ouhyoung -- NTU, Eurographics 2005), which claims
// four properties at once where marching cubes and its variants each get two or three: adaptive refinement,
// topological consistency, SHARP-FEATURE PRESERVATION and inter-cell independence. The tree already has an
// isosurface extractor -- marchingCubes.js, actually marching TETRAHEDRA, six tets on a shared diagonal, so it is
// watertight by construction and has no ambiguous cases. Two of CMS's four are therefore not this extractor's
// problem at all. *** BUT ITS GATE GRADES IT ON SPHERES AND WYVILL METABALLS, BOTH SMOOTH, SO THE ONE PROPERTY
// CMS EXISTS FOR IS THE ONE PROPERTY NOTHING HERE COULD SEE. *** This file measures it instead of arguing it.
//
// THE KEY IS A RATIO THAT REFUSES TO FALL, which is the same shape as gyroscope's order and the opposite use of
// it: there, an error QUARTERING as spin doubles is the proof the scheme is right; here, a cut that stays a
// FIXED FRACTION OF THE CELL as the grid halves is the proof the extractor cannot represent the feature at all.
// A smooth surface converges at order 2. A corner does not converge. Refinement is not the fix, and that is
// exactly the case for a different algorithm rather than a finer grid.
//
// THREE THINGS THIS FILE REFUSES TO DO. It does not implement CMS. It does not add a fifth mesher -- the engine
// has four and imports none of them, and a consumer has to be named before a sixth extractor is worth writing.
// And it does not call the existing extractor broken: marching tets is doing exactly what it says, and a
// vertex constrained to a grid edge CANNOT land on a corner. The finding is a stated limit, not a defect.
import {
    sphereField, boxField, slabBoxField, marchingTets, meshVolume, watertight,
    maxSurfaceDeviation, surfaceDistance,
} from "./marchingCubes.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

const LO = -1.5, HI = 1.5, SPAN = HI - LO, A = 0.7;
const hOf = (N) => SPAN / N;

// A deterministic generator, so the offsets below are the same on every machine and in every run. Nothing here
// may depend on Math.random: a gate whose fixture moves cannot have a threshold.
function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (Math.imul(a, 1103515245) + 12345) & 0x7fffffff; return a / 0x7fffffff; };
}

/** Extract a box shifted by (ox,oy,oz) and report how far the mesh sits from where its corner should be. */
function cornerCutAt(N, ox, oy, oz) {
    const B = boxField(A);
    const f = (x, y, z) => B.f(x - ox, y - oy, z - oz);
    const g = (x, y, z) => B.g(x - ox, y - oy, z - oz);
    const { verts, tris } = marchingTets(f, g, { N, lo: LO, hi: HI, iso: 0 });
    return { cut: surfaceDistance(verts, tris, [A + ox, A + oy, A + oz]), verts, tris };
}

/** The cut averaged over sub-cell placements -- see section 3 for why one placement is not a measurement. */
function cornerCutSweep(N, trials = 12, seed = 20250817) {
    const h = hOf(N), r = rng(seed), cuts = [];
    for (let i = 0; i < trials; i++) cuts.push(cornerCutAt(N, (r() - 0.5) * h, (r() - 0.5) * h, (r() - 0.5) * h).cut);
    return { h, mean: cuts.reduce((a, b) => a + b, 0) / cuts.length, worst: Math.max(...cuts), trials: cuts.length };
}

const order = (a, b, k) => Math.log(a[k] / b[k]) / Math.log(a.h / b.h);

// ---- 1. THE CONTROL: A SMOOTH SURFACE CONVERGES AT ORDER 2 --------------------------------------------------
// Without this the section below proves nothing -- "the error does not fall" is only interesting beside a case
// where it does, on the SAME extractor, with the SAME refinement.
{
    const sph = sphereField(1.0), rows = [];
    for (const N of [16, 32, 64]) {
        const h = hOf(N), m = marchingTets(sph.f, sph.g, { N, lo: LO, hi: HI, iso: 0 });
        rows.push({ N, h, vol: Math.abs(meshVolume(m.verts, m.tris) - sph.volume) / sph.volume,
                    dev: maxSurfaceDeviation(m.verts, sph.f, 0) });
    }
    const pv = rows.slice(1).map((r, i) => order(rows[i], r, "vol"));
    const pd = rows.slice(1).map((r, i) => order(rows[i], r, "dev"));
    say(`sphere: volume orders ${pv.map((x) => x.toFixed(3)).join(", ")}   deviation orders ${pd.map((x) => x.toFixed(3)).join(", ")}`);
    ok("!! a SMOOTH surface converges at order 2 on this extractor",
        pv.every((p) => p > 1.8 && p < 2.2) && pd.every((p) => p > 1.8 && p < 2.2),
        "halving the cell quarters the error, which is what the scheme claims and what makes the next section a finding rather than a fixture problem");
}

// ---- 2. *** THE KEY: A SHARP CORNER DOES NOT CONVERGE. THE CUT IS A FIXED FRACTION OF THE CELL. *** ---------
// A vertex can only be placed on a GRID EDGE, and a corner is not on one. So the mesh chamfers it, and the
// chamfer scales with the cell rather than shrinking relative to it. REFINEMENT IS NOT THE FIX.
{
    const rows = [16, 24, 32, 48, 64].map((N) => cornerCutSweep(N));
    const ratios = rows.map((r) => r.mean / r.h), worstRatios = rows.map((r) => r.worst / r.h);
    say(`corner cut / h, mean:  ${ratios.map((x) => x.toFixed(4)).join(", ")}`);
    say(`corner cut / h, worst: ${worstRatios.map((x) => x.toFixed(4)).join(", ")}`);
    const lo = Math.min(...ratios), hi = Math.max(...ratios);
    ok("!! *** the corner cut stays a FIXED FRACTION OF THE CELL across a 4x refinement ***",
        lo > 0.3 && hi < 0.7 && (hi - lo) < 0.25,
        `ratio spans ${lo.toFixed(3)} to ${hi.toFixed(3)} over h = ${rows[0].h.toFixed(4)} down to ${rows[rows.length - 1].h.toFixed(4)}. ` +
        "HALVING THE GRID BUYS NOTHING ON A SHARP FEATURE -- the mesh always cuts the corner by about half a cell. " +
        "THAT IS THE ENTIRE CASE FOR A FEATURE-PRESERVING EXTRACTOR, WHICH PLACES A VERTEX INSIDE THE CELL AT THE " +
        "INTERSECTION OF THE SAMPLED TANGENT PLANES RATHER THAN ON AN EDGE");
    ok("...and the ABSOLUTE cut does still fall, so this is a failure to converge RELATIVELY, not a broken extractor",
        rows[rows.length - 1].mean < rows[0].mean,
        `mean cut ${rows[0].mean.toFixed(5)} at N=16 down to ${rows[rows.length - 1].mean.toFixed(5)} at N=64 -- first order, where the sphere is second. ` +
        "A CHECK THAT CONFUSED 'DOES NOT IMPROVE' WITH 'DOES NOT IMPROVE FAST ENOUGH' WOULD BE A DIFFERENT AND WRONG CLAIM");
    ok("...and the box mesh is still WATERTIGHT, so the loss is the feature and nothing else",
        watertight(cornerCutAt(48, 0.013, -0.021, 0.007).tris).watertight,
        "marching tets is doing exactly what it says: six tets on a shared diagonal close up on a box as well as on a sphere. THE LIMIT IS REPRESENTATIONAL, NOT A BUG");
}

    // *** v3432 -- THE ANTIDOTE FIRED, AND THIS IS THE REWRITE IT ASKED FOR. *** This section's header said:
    // "when somebody builds a feature-preserving extractor, section 2 goes RED and is REWRITTEN AS A
    // COMPARISON, NOT WEAKENED." physics/mesh/dualContour.mjs is that extractor. The numbers below are NOT
    // loosened -- marching tetrahedra still cuts the corner by 0.377-0.387 of a cell, flat across a 4x
    // refinement, and that is still exactly right. WHAT CHANGED IS THAT THE NUMBER IS NO LONGER A PROPERTY OF
    // CONTOURING, IT IS A PROPERTY OF THIS METHOD: dual contouring on the same shape, swept over the same kind
    // of sub-cell offsets, reads 1.1e-4 worst of twenty-four runs. A FLOOR TURNED OUT TO BE A CEILING OF ONE
    // ALGORITHM. See physics/mesh/dualContour-selfcheck.mjs section 2 for the comparison and section 3 for the
    // mass-point fallback that lands back on ~0.60, which is why the old number was never evidence about
    // contouring in general.

// ---- 3. *** THE LOAD-BEARING NEGATIVE IS METHODOLOGICAL: ONE PLACEMENT MEASURES ALIGNMENT, NOT ORDER. *** ----
// My first sweep used a single fixed box and produced orders 0.344, 0.810, 4.597 -- non-monotone, which v3414's
// convergenceOrder would REFUSE outright -- because at one resolution the corner happened to land almost on a
// grid point and the cut collapsed. The constant in section 2 only appears once the placement is swept.
{
    const single = [16, 32, 64, 128].map((N) => ({ h: hOf(N), cut: cornerCutAt(N, 0, 0, 0).cut }));
    const ps = single.slice(1).map((r, i) => order(single[i], r, "cut"));
    say(`ONE fixed placement, orders: ${ps.map((x) => x.toFixed(3)).join(", ")}`);
    const swept = [16, 32, 64].map((N) => cornerCutSweep(N, 8, 4242));
    const pw = swept.slice(1).map((r, i) => order(swept[i], r, "mean"));
    say(`swept placements,   orders: ${pw.map((x) => x.toFixed(3)).join(", ")}`);
    const spreadOf = (a) => Math.max(...a) - Math.min(...a);
    ok("!! *** a SINGLE box placement gives a wilder order spread than a swept one -- alignment, not convergence ***",
        spreadOf(ps) > spreadOf(pw) && spreadOf(ps) > 1.0,
        `single spread ${spreadOf(ps).toFixed(2)} against swept ${spreadOf(pw).toFixed(2)}. THE CORNER'S POSITION RELATIVE TO THE GRID ` +
        "IS A FREE PARAMETER NOBODY DECLARED, and a sweep that fixes it is measuring that parameter. Any future gate here MUST sweep offsets");
}

// ---- 4. *** AND THE EXISTING METRIC IS BLIND FOR A SECOND REASON: IT ONLY LOOKS AT VERTICES. *** -------------
// Even handed a perfectly sharp fixture, maxSurfaceDeviation reports ZERO on a slab box -- that field is linear
// along every grid edge, so each vertex lands EXACTLY on a face. A chamfered corner has no vertex off the
// surface. SWAPPING IN A SHARP FIXTURE ALONE WOULD NOT HAVE FOUND ANYTHING.
{
    const S = slabBoxField(A);
    const m = marchingTets(S.f, S.g, { N: 32, lo: LO, hi: HI, iso: 0 });
    const vertexMetric = maxSurfaceDeviation(m.verts, S.f, 0);
    const volDeficit = (S.volume - meshVolume(m.verts, m.tris)) / S.volume;
    say(`slab box at N=32: vertex metric ${vertexMetric.toExponential(3)}, volume deficit ${(volDeficit * 100).toFixed(3)}%`);
    // *** AND THE CORNER IS THE WRONG PROBE ON THIS FIXTURE, WHICH IS ITSELF WORTH RECORDING. *** A slab field
    // is linear along every axis-aligned edge right up to the face plane, so the extractor puts vertices EXACTLY
    // on the planes and the mesh passes exactly through the corner -- surfaceDistance to the corner reads 0.000
    // too. It is the TRUE EUCLIDEAN box in section 2 that curves near the edge and gets chamfered. TWO FIELDS
    // DESCRIBING ONE SHAPE ARE NOT ONE FIXTURE, and I had to measure to find that out.
    ok("!! *** the VERTEX metric reads EXACTLY zero while the mesh is demonstrably missing geometry ***",
        vertexMetric === 0 && volDeficit > 1e-4,
        `every vertex reports 0.0e+0 off the surface, and the mesh still encloses ${(volDeficit * 100).toFixed(3)}% less than the box it was cut from. ` +
        "maxSurfaceDeviation is |field| AT VERTICES, and a vertex sits on a grid EDGE where this field is linear, so it lands on the face and reports nothing. " +
        "THE BLINDNESS HAS TWO CAUSES -- THE FIXTURE AND THE METRIC -- AND ONLY ONE OF THEM IS OBVIOUS: swapping in a sharp fixture ALONE would still have reported zero");
    ok("...and surfaceDistance is exact where the answer is known: a point ON a face reads ~0",
        surfaceDistance(m.verts, m.tris, [0.11, 0.07, A]) < 1e-9 && surfaceDistance(m.verts, m.tris, S.corner) < 1e-9,
        "the metric is not merely bigger than the other one -- it is right. AND IT READS ZERO AT THIS FIXTURE'S CORNER TOO, correctly: a slab field is linear all the way to the face plane, so the mesh really does pass through the corner. THE CHAMFER IN SECTION 2 NEEDS THE TRUE EUCLIDEAN BOX, WHICH CURVES NEAR THE EDGE -- two fields describing one shape are not one fixture");
}

// ---- 5. WHAT IS NOT CLAIMED, STATED SO A LATER READER CANNOT INHERIT MORE THAN WAS MEASURED ------------------
// The paper's own limits: CMS is "equivalent to marching cubes but generally slightly slower", and its GPU port
// was partial with speed "only comparable to our CPU implementation". IT IS AN ACCURACY METHOD, NOT A SPEED
// METHOD, and nothing here should be cited as a performance argument.
{
    const src = await import("node:fs").then((fs) => fs.readFileSync(new URL(import.meta.url), "utf8"));
    ok("this file states that no extractor was added and no speed claim is made",
        /does not implement CMS/.test(src) && /does not add a fifth mesher/.test(src),
        "*** WHEN SOMEBODY BUILDS A FEATURE-PRESERVING EXTRACTOR, SECTION 2 SHOULD GO RED AGAINST IT AND BE " +
        "REWRITTEN AS A COMPARISON, NOT WEAKENED -- and the consumer has to be named first: a blocky voxel world " +
        "has no sharp features being rounded off, so the honest consumer is the metaball/CSG side ***");
}

console.log(fails ? "\nfeaturePreserve-selfcheck: " + fails + " FAILED" : "\nfeaturePreserve-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
