// physics/mesh/marchingCubes-selfcheck.mjs
//
// Run: node physics/mesh/marchingCubes-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The surface extractor held to the surface it is supposed to be extracting. We march a field we know exactly, so the mesh
// is checkable three ways. It must be watertight -- a closed manifold, every edge shared by exactly two triangles, no holes
// -- for both a plain sphere and an organic metaball blob. The volume it encloses must converge to the analytic 4/3 pi R^3
// as the grid refines, a number nobody feeds it. And every vertex it places must sit ON the isosurface, closer as the grid
// tightens, because the crossing is found by interpolating the field, not by snapping to a midpoint. The sabotage does
// exactly that -- snaps every vertex to its edge midpoint instead of the field crossing -- and the vertices leave the
// surface and the volume goes wrong, which the gate refuses.
import {
    sphereField, wyvill, wyvillGrad, marchingTets, meshVolume, watertight, maxSurfaceDeviation,
    boxField, slabBoxField, surfaceDistance, ambientOcclusion, occlusionRamp,
} from "./marchingCubes.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const R = 1.0, sph = sphereField(R);
const balls = [{ cx: -0.3, cy: 0, cz: 0, r: 0.9, s: 1 }, { cx: 0.4, cy: 0.2, cz: 0, r: 0.8, s: 1 }, { cx: 0.1, cy: -0.4, cz: 0.3, r: 0.7, s: 1 }];
const wf = (x, y, z) => wyvill(balls, x, y, z), wg = (x, y, z) => wyvillGrad(balls, x, y, z);

// ---- 1. THE MESH IS A WATERTIGHT CLOSED MANIFOLD (sphere and metaball blob) -------------------------
{
    const s = watertight(marchingTets(sph.f, sph.g, { N: 32 }).tris);
    const b = watertight(marchingTets(wf, wg, { N: 32, lo: -1.6, hi: 1.6, iso: 0.25 }).tris);
    ok("!! the extracted surface is watertight -- a closed manifold with no holes", s.watertight && b.watertight,
       "both the sphere and a three-ball metaball blob close up: every edge is shared by exactly two triangles (" + s.boundaryEdges + " and " + b.boundaryEdges + " boundary edges) -- the six-tet decomposition is consistent across cells.");
}

// ---- 2. THE ENCLOSED VOLUME CONVERGES TO THE ANALYTIC 4/3 pi R^3 -----------------------------------
{
    const vLo = meshVolume(...Object.values(pick(marchingTets(sph.f, sph.g, { N: 16 }))));
    const vHi = meshVolume(...Object.values(pick(marchingTets(sph.f, sph.g, { N: 48 }))));
    const eLo = Math.abs(vLo - sph.volume) / sph.volume, eHi = Math.abs(vHi - sph.volume) / sph.volume;
    ok("!! the enclosed volume converges to the analytic 4/3 pi R^3", eHi < 0.005 && eHi < eLo,
       "mesh volume approaches " + sph.volume.toFixed(4) + ": error falls from " + (eLo * 100).toFixed(2) + "% at N=16 to " + (eHi * 100).toFixed(2) + "% at N=48 -- the surface tightens onto the sphere it was cut from.");
}

// ---- 3. EVERY VERTEX SITS ON THE ISOSURFACE, CLOSER AS THE GRID TIGHTENS ---------------------------
{
    const m32 = marchingTets(sph.f, sph.g, { N: 32 }), m64 = marchingTets(sph.f, sph.g, { N: 64 });
    const d32 = maxSurfaceDeviation(m32.verts, sph.f, 0), d64 = maxSurfaceDeviation(m64.verts, sph.f, 0);
    const unit = m32.normals.every((n) => Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) < 1e-9);
    ok("!! vertices lie on the isosurface (from interpolation) with unit gradient normals", d64 < d32 && d64 < 1e-2 && unit,
       "the worst vertex sits " + d64.toExponential(1) + " off the surface at N=64, down from " + d32.toExponential(1) + " at N=32, and every normal is a unit vector from the analytic gradient -- the flesh shades smoothly.");
}

function pick(m) { return { verts: m.verts, tris: m.tris }; }

// ---- 4. THE SHARP-FEATURE FIELDS ARE EXACT WHERE THE ANSWER IS KNOWN BY HAND ------------------------
// boxField is a TRUE Euclidean SDF (positive inside); slabBoxField is a min-of-slabs field describing the
// SAME cube. They must agree along an axis (where the nearest feature is a single face) and DISAGREE off-axis
// at a corner region (where the true distance is the diagonal, but min-of-slabs only sees the nearer slab).
{
    const A = 1.0, B = boxField(A), S = slabBoxField(A);
    ok("!! boxField(1) at the center is exactly +1 -- positive inside, magnitude = distance to nearest face",
        B.f(0, 0, 0) === 1);
    ok("!! boxField outside along an axis is EXACTLY the signed Euclidean distance to the face",
        Math.abs(B.f(1.3, 0, 0) - (-0.3)) < 1e-14, "f(1.3,0,0) = " + B.f(1.3, 0, 0) + " = -(1.3-1) exactly");
    ok("!! boxField's analytic gradient points -x there, so outward (-g) is +x -- the correct face normal",
        B.g(1.3, 0, 0)[0] === -1 && B.g(1.3, 0, 0)[1] === 0 && B.g(1.3, 0, 0)[2] === 0,
        "g(1.3,0,0) = [" + B.g(1.3, 0, 0).join(",") + "]");
    ok("!! boxField is 0 exactly ON the surface -- face center and corner both", B.f(1, 0, 0) === 0 && B.f(1, 1, 1) === 0);
    ok("!! boxField's volume field matches (2a)^3 for the cube it actually describes", B.volume === 8 * A * A * A);
    // (2,2,0) sits exactly 1 unit past each of two faces -> diagonal distance sqrt(2) by the Pythagorean theorem
    ok("!! boxField is the TRUE diagonal Euclidean distance off-axis, at a point known by the Pythagorean theorem",
        Math.abs(B.f(2, 2, 0) - (-Math.SQRT2)) < 1e-12, "f(2,2,0) = " + B.f(2, 2, 0) + " vs -sqrt(2) = " + (-Math.SQRT2));
    ok("!! slabBoxField, by contrast, is NOT the Euclidean distance at that same off-axis point -- min-of-slabs " +
        "sees only the nearer slab (-1), not the true diagonal (-sqrt(2))",
        S.f(2, 2, 0) === -1 && Math.abs(S.f(2, 2, 0) - B.f(2, 2, 0)) > 0.4,
        "slabBoxField(2,2,0) = " + S.f(2, 2, 0) + " while boxField(2,2,0) = " + B.f(2, 2, 0).toFixed(4) +
        " -- exactly the 'not a Euclidean distance' the source comment states");
    ok("...yet the two fields AGREE exactly along a pure axis, where the nearest feature IS a single slab",
        Math.abs(S.f(1.3, 0, 0) - B.f(1.3, 0, 0)) < 1e-14 && S.f(0, 0, 0) === B.f(0, 0, 0),
        "both read " + S.f(1.3, 0, 0).toFixed(4) + " on-axis and " + S.f(0, 0, 0) + " at the center");
}

// ---- 5. surfaceDistance IS EXACT POINT-TO-TRIANGLE ON A HAND-BUILT TRIANGLE --------------------------
// One right triangle A=(0,0,0) B=(1,0,0) C=(0,1,0) in the z=0 plane, with four probes whose answers are
// knowable by hand: a perpendicular foot inside the triangle, a point outside past a vertex, a point exactly
// on an edge, and a point whose projection lands inside a different part of the triangle.
{
    const verts = [[0, 0, 0], [1, 0, 0], [0, 1, 0]], tris = [[0, 1, 2]];
    ok("!! a point straight above the triangle's interior is EXACTLY its height off the plane",
        surfaceDistance(verts, tris, [0.2, 0.2, 5]) === 5);
    ok("!! a point past vertex A (outside the triangle's Voronoi region) clamps to A -- exact distance 1",
        Math.abs(surfaceDistance(verts, tris, [-1, 0, 0]) - 1) < 1e-12);
    ok("!! a point exactly ON the hypotenuse (its own midpoint) reads a distance of 0",
        surfaceDistance(verts, tris, [0.5, 0.5, 0]) < 1e-12);
    ok("!! a point whose projection lands INSIDE the triangle is exactly its perpendicular offset, not clamped",
        Math.abs(surfaceDistance(verts, tris, [0.3, 0.3, 1]) - 1) < 1e-12);
    // AB and AC are orthogonal and equal-length here, so a probe with px == py cannot tell u and v apart -- a
    // barycentric u/v swap is invisible on every symmetric probe above. This one is deliberately ASYMMETRIC:
    // clamping to B (not C) gives sqrt(0.5); a swapped u/v would clamp to C instead and give sqrt(4.5).
    ok("!! an ASYMMETRIC outside point clamps to the correct edge -- catches a u/v swap the symmetric probes can't",
        Math.abs(surfaceDistance(verts, tris, [1.5, -0.5, 0]) - Math.sqrt(0.5)) < 1e-12,
        "surfaceDistance([1.5,-0.5,0]) = " + surfaceDistance(verts, tris, [1.5, -0.5, 0]).toFixed(6) +
        " = sqrt(0.5), clamped to B=(1,0,0); a u<->v swap would instead clamp to C and read sqrt(4.5) = " + Math.sqrt(4.5).toFixed(6));
}

// ---- 6. ambientOcclusion IS EXACT AT TWO SYNTHETIC EXTREMES: A FLAT WALL AND A FULLY-ENCLOSED POINT ---
// Every one of the fixed AO_DIRS has a non-negative component along the surface normal (the hemisphere never
// samples backward), so a vertex on an infinite flat wall must see AO = 0 EXACTLY -- moving along the outward
// normal by any positive radius always lands outside. And a field that reads > iso EVERYWHERE, in every
// direction, must give AO = 1 EXACTLY: there is no direction left that isn't occluded.
{
    const wallF = (x) => -x, wallG = () => [-1, 0, 0]; // f>0 (inside) for x<0: a wall at x=0, inside is -x
    const aoWall = ambientOcclusion([[0, 0, 0]], wallF, wallG, { iso: 0, radius: 0.3 });
    ok("!! a vertex on an infinite FLAT wall reads AO = 0 EXACTLY -- every sample direction leaves the surface",
        aoWall[0] === 0, "ao = " + aoWall[0] + " (all 12 fixed hemisphere samples read outside, f < iso)");
    const fullF = () => 1, fullG = () => [1, 0, 0]; // field is > iso everywhere, in every direction
    const aoFull = ambientOcclusion([[0, 0, 0]], fullF, fullG, { iso: 0, radius: 0.3 });
    ok("!! a vertex where the field exceeds iso in every sampled direction reads AO = 1 EXACTLY",
        aoFull[0] === 1, "ao = " + aoFull[0] + " (all 12 fixed hemisphere samples read f > iso, fully enclosed)");
}

// ---- 7. occlusionRamp IS THE STATED LINEAR LERP, EXACTLY AT ITS ENDPOINTS AND MIDPOINT ----------------
{
    const dark = [0.1, 0.2, 0.3], bright = [0.9, 0.8, 0.7];
    const rgb0 = occlusionRamp(Float32Array.from([0]), { dark, bright });
    const rgb1 = occlusionRamp(Float32Array.from([1]), { dark, bright });
    const rgbH = occlusionRamp(Float32Array.from([0.5]), { dark, bright });
    ok("!! AO = 0 (fully exposed) reads EXACTLY `bright`, and AO = 1 (fully enclosed) reads EXACTLY `dark`",
        Math.abs(rgb0[0] - bright[0]) < 1e-6 && Math.abs(rgb0[1] - bright[1]) < 1e-6 && Math.abs(rgb0[2] - bright[2]) < 1e-6 &&
        Math.abs(rgb1[0] - dark[0]) < 1e-6 && Math.abs(rgb1[1] - dark[1]) < 1e-6 && Math.abs(rgb1[2] - dark[2]) < 1e-6,
        "t=0 -> [" + Array.from(rgb0).join(",") + "]   t=1 -> [" + Array.from(rgb1).join(",") + "]");
    ok("!! and AO = 0.5 is EXACTLY the midpoint of dark and bright -- a linear lerp, not some other curve",
        Math.abs(rgbH[0] - (dark[0] + bright[0]) / 2) < 1e-6 && Math.abs(rgbH[1] - (dark[1] + bright[1]) / 2) < 1e-6 &&
        Math.abs(rgbH[2] - (dark[2] + bright[2]) / 2) < 1e-6,
        "midpoint = [" + Array.from(rgbH).join(",") + "] against the hand-averaged [" +
        [(dark[0] + bright[0]) / 2, (dark[1] + bright[1]) / 2, (dark[2] + bright[2]) / 2].join(",") + "]");
}

console.log(fails ? "\nmarchingCubes-selfcheck: " + fails + " FAILED" : "\nmarchingCubes-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
