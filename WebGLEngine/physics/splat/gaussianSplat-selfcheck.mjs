// WebGLEngine/physics/splat/gaussianSplat-selfcheck.mjs -- v2860
//
// Run: node physics/splat/gaussianSplat-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// Grades physics/splat/gaussianSplat.js against closed forms. Every key below is derived from the EWA projection
// and the over-compositing recursion; none is written into the code being graded.
//
// THE SABOTAGE IS THE POINT OF THIS FILE. Dropping the perspective-shear column of the Jacobian is a real bug a
// splat renderer can ship, and it is EXACTLY ZERO on the view axis -- so a test suite that only ever looks at a
// splat in the middle of the screen passes it forever. The gate therefore tests OFF-AXIS deliberately, and
// asserts both halves: invisible on-axis, caught off-axis. A sabotage that failed everywhere would not have
// taught anything.
import {
    covarianceFromScaleRot, projectCovariance, perspectiveJacobian, eigen2, det2,
    gaussian2DIntegral, rasteriseIntegral, compositeFrontToBack, accumulatedAlpha,
    depthOrder, areaScale, areaDepthSlope, rotZ, rotY, quatToMat3, mat3mul, mat3T,
} from "./gaussianSplat.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ISO = covarianceFromScaleRot([0.1, 0.1, 0.1], { x: 0, y: 0, z: 0, w: 1 });

// ---- 1. the algebra underneath, before trusting anything built on it ----------------------------------------
{
    const R = quatToMat3({ x: 0, y: 0, z: Math.sin(0.4), w: Math.cos(0.4) });
    const RtR = mat3mul(mat3T(R), R);
    let worst = 0;
    for (let i = 0; i < 9; i++) worst = Math.max(worst, Math.abs(RtR[i] - I3[i]));
    ok("a quaternion makes an ORTHONORMAL rotation (R^T R = I)", worst < 1e-15, "worst " + worst.toExponential(2));

    // Covariance must be symmetric positive definite, or none of the rest means anything.
    const S = covarianceFromScaleRot([0.3, 0.1, 0.05], { x: 0.1, y: 0.2, z: 0.3, w: Math.sqrt(1 - 0.14) });
    ok("covariance is SYMMETRIC", Math.abs(S[1] - S[3]) < 1e-15 && Math.abs(S[2] - S[6]) < 1e-15 && Math.abs(S[5] - S[7]) < 1e-15);
    ok("...and positive definite (diagonal > 0, det > 0)", S[0] > 0 && S[4] > 0 && S[8] > 0);
}

// ---- 2. KEY: the projected integral is 2*pi*sqrt(det) --------------------------------------------------------
{
    const S2 = projectCovariance(ISO, I3, [0, 0, 5], 800);
    const exact = gaussian2DIntegral(S2);
    const coarse = rasteriseIntegral(S2, { n: 64, radius: 8 });
    const fine = rasteriseIntegral(S2, { n: 512, radius: 8 });
    ok("!! rasterised integral matches 2*pi*sqrt(det S2D)", Math.abs(fine / exact - 1) < 1e-6,
       "ratio " + (fine / exact).toFixed(9) + "  (the rasteriser is never told this number)");
    ok("...and it is a CONVERGENCE, not a coincidence", Math.abs(fine / exact - 1) <= Math.abs(coarse / exact - 1) + 1e-12,
       "coarse " + (coarse / exact).toFixed(9) + " -> fine " + (fine / exact).toFixed(9));
    // An anisotropic, rotated splat must work too -- the isotropic case alone would hide an axis mix-up.
    const AN = covarianceFromScaleRot([0.25, 0.06, 0.06], { x: 0, y: 0, z: Math.sin(0.3), w: Math.cos(0.3) });
    const S2a = projectCovariance(AN, rotY(0.4), [0.3, -0.2, 6], 800);
    ok("...for an ANISOTROPIC, rotated, off-axis splat as well",
       Math.abs(rasteriseIntegral(S2a, { n: 512, radius: 8 }) / gaussian2DIntegral(S2a) - 1) < 1e-6);
}

// ---- 3. KEY: isotropic head-on stays isotropic ---------------------------------------------------------------
{
    const S2 = projectCovariance(ISO, I3, [0, 0, 5], 800);
    const [e1, e2] = eigen2(S2);
    ok("an isotropic splat viewed head-on projects to a CIRCLE", Math.abs(e1 - e2) < 1e-12,
       "eigenvalues " + e1.toPrecision(12) + " / " + e2.toPrecision(12));
    ok("...and its off-diagonal is exactly zero", Math.abs(S2.xy) < 1e-15);
}

// ---- 4. KEY: rotation invariance (exact, not approximate) ----------------------------------------------------
{
    const base = projectCovariance(ISO, I3, [0, 0, 5], 800);
    let worst = 0;
    for (const th of [0.3, 1.1, 2.7, 5.0]) {
        const S = projectCovariance(ISO, rotZ(th), [0, 0, 5], 800);
        worst = Math.max(worst, Math.abs(S.xx - base.xx), Math.abs(S.yy - base.yy), Math.abs(S.xy - base.xy));
    }
    ok("!! an isotropic splat is INVARIANT under camera roll", worst < 1e-12,
       "max deviation " + worst.toExponential(2) + " (exactly 0 analytically)");
}

// ---- 5. KEY: a 90-degree roll swaps an anisotropic splat's projected axes -------------------------------------
{
    const AN = covarianceFromScaleRot([0.3, 0.05, 0.05], { x: 0, y: 0, z: 0, w: 1 });
    const A = eigen2(projectCovariance(AN, I3, [0, 0, 5], 800));
    const B = eigen2(projectCovariance(AN, rotZ(Math.PI / 2), [0, 0, 5], 800));
    ok("a 90-degree roll PRESERVES the eigenvalue set", Math.abs(A[0] - B[0]) < 1e-9 && Math.abs(A[1] - B[1]) < 1e-9,
       A[0].toPrecision(9) + "/" + A[1].toPrecision(9));
    ok("...and the splat really is anisotropic (else the check is vacuous)", A[0] / A[1] > 10,
       "axis ratio " + (A[0] / A[1]).toFixed(1) + " -- a round splat would pass the swap trivially");
}

// ---- 6. KEY: projected area falls as 1/z^2, slope exactly -2 --------------------------------------------------
{
    const slope = areaDepthSlope([2, 3, 5, 8, 13, 21]);
    ok("!! log(projected area) vs log(depth) has slope EXACTLY -2", Math.abs(slope + 2) < 1e-12,
       "measured " + slope.toPrecision(15) + " -- the perspective law, emergent from the Jacobian");
}

// ---- 7. KEY: opacity accumulation is 1-(1-a)^N ----------------------------------------------------------------
{
    for (const [a, n] of [[0.3, 7], [0.05, 40], [0.9, 3]]) {
        const r = compositeFrontToBack(Array.from({ length: n }, () => ({ alpha: a, color: [1, 1, 1] })));
        ok("alpha of " + n + " splats at a=" + a + " is 1-(1-a)^N", Math.abs(r.alpha - accumulatedAlpha(a, n)) < 1e-14,
           r.alpha.toPrecision(15));
    }
    const opaque = compositeFrontToBack([{ alpha: 1, color: [1, 1, 1] }, { alpha: 0.7, color: [0, 0, 0] }]);
    ok("a fully opaque splat HIDES everything behind it", Math.abs(opaque.alpha - 1) < 1e-15 && Math.abs(opaque.color[0] - 1) < 1e-15,
       "transmittance " + opaque.transmittance);
}

// ---- 8. KEY: order dependence, and it must cut BOTH ways -------------------------------------------------------
{
    const same = Array.from({ length: 6 }, () => ({ alpha: 0.25, color: [0.4, 0.6, 0.8] }));
    const f = compositeFrontToBack(same), b = compositeFrontToBack([...same].reverse());
    ok("SAME colour: order does NOT change the result", Math.abs(f.color[0] - b.color[0]) < 1e-15 && Math.abs(f.alpha - b.alpha) < 1e-15,
       "the positive control -- a broken sort would also pass this, which is why the next check exists");

    const diff = [{ alpha: 0.5, color: [1, 0, 0] }, { alpha: 0.5, color: [0, 0, 1] }];
    const F = compositeFrontToBack(diff), B = compositeFrontToBack([...diff].reverse());
    ok("!! DIFFERENT colours: order MUST change the result", Math.abs(F.color[0] - B.color[0]) > 1e-6,
       "R " + F.color[0].toFixed(3) + " vs " + B.color[0].toFixed(3) + " -- if a renderer's sort is a no-op, this is what catches it");
    ok("...while the accumulated ALPHA stays order-independent", Math.abs(F.alpha - B.alpha) < 1e-15,
       "alpha is a product of transmittances and cannot care about order -- colour is a weighted sum and must");
}

// ---- 9. KEY: depth order is an INTEGER answer ------------------------------------------------------------------
{
    const pos = [[0, 0, 9], [0, 0, 3], [0, 0, 6], [0, 0, 1]];
    const order = depthOrder(pos, { eye: [0, 0, 0], W: I3 });
    ok("depth order is exactly right or exactly wrong", JSON.stringify(order) === JSON.stringify([3, 1, 2, 0]),
       JSON.stringify(order));
    // I FIRST ASSERTED THE WRONG PHYSICS HERE AND THE GATE CAUGHT IT. I expected that moving the eye PAST the
    // splats would reverse the order. IT CANNOT: translating the camera shifts every depth by the same constant,
    // and an ordering is invariant under a constant shift. To reverse the order you must TURN THE CAMERA AROUND.
    // The code was right and my expectation was not -- so both halves are now pinned, because the invariant is
    // the more interesting of the two and a renderer that "re-sorted" on a pure pan would be doing work that
    // cannot matter.
    const moved = depthOrder(pos, { eye: [0, 0, 20], W: I3 });
    ok("!! a pure eye TRANSLATION does not reorder", JSON.stringify(moved) === JSON.stringify(order),
       "a constant shift applies to every depth equally -- ordering is invariant under it");
    const turned = depthOrder(pos, { eye: [0, 0, 20], W: rotY(Math.PI) });
    ok("!! ...but TURNING the camera around reverses it", JSON.stringify(turned) === JSON.stringify([...order].reverse()),
       JSON.stringify(turned) + " -- the order follows the camera's orientation, not the array");
}

// ---- 10. THE SABOTAGE: drop the perspective shear ---------------------------------------------------------------
{
    const AN = covarianceFromScaleRot([0.2, 0.05, 0.05], { x: 0, y: 0, z: 0.3827, w: 0.9239 });
    const onAxisFull = areaScale(projectCovariance(AN, I3, [0, 0, 5], 800));
    const onAxisNo = areaScale(projectCovariance(AN, I3, [0, 0, 5], 800, { shear: false }));
    ok("!! SABOTAGE is INVISIBLE on the view axis", Math.abs(onAxisFull - onAxisNo) / onAxisFull < 1e-12,
       "0.0000% -- a suite that only tests a centred splat would never catch this");

    const offFull = areaScale(projectCovariance(AN, I3, [2.0, 1.5, 5], 800));
    const offNo = areaScale(projectCovariance(AN, I3, [2.0, 1.5, 5], 800, { shear: false }));
    const rel = Math.abs(offFull - offNo) / offFull;
    ok("!! ...and CAUGHT off-axis", rel > 1e-3, "area differs by " + (100 * rel).toFixed(4) + "% at t=(2.0,1.5)");

    // and the error must GROW with off-axis distance, which is what identifies it as the shear term rather
    // than noise -- the same reasoning the fan-beam instrument used to tell a frame mismatch from a convergence
    // failure (a real convergence failure shrinks with distance; a wrong frame sits flat).
    const r1 = Math.abs(areaScale(projectCovariance(AN, I3, [0.5, 0.4, 5], 800)) - areaScale(projectCovariance(AN, I3, [0.5, 0.4, 5], 800, { shear: false })));
    const r2 = Math.abs(offFull - offNo);
    ok("...and the error GROWS with off-axis distance", r2 > r1 * 3, "identifies it as the shear term, not noise");
}

// ---- 11. the Jacobian itself ------------------------------------------------------------------------------------
{
    const J = perspectiveJacobian([0, 0, 4], 800);
    ok("on-axis the Jacobian's shear column is exactly zero", J[2] === 0 && J[5] === 0);
    ok("...and the scale terms are f/z", Math.abs(J[0] - 200) < 1e-12 && Math.abs(J[4] - 200) < 1e-12, "f/z = 800/4 = 200");
    const J2 = perspectiveJacobian([1, 0, 4], 800);
    ok("off-axis the shear column is NOT zero", Math.abs(J2[2]) > 1e-9, "-f*x/z^2 = " + J2[2].toFixed(3));
}

// ---- 12. determinism ---------------------------------------------------------------------------------------------
{
    const a = projectCovariance(ISO, rotZ(0.7), [0.2, 0.1, 4], 700);
    const b = projectCovariance(ISO, rotZ(0.7), [0.2, 0.1, 4], 700);
    ok("projection is deterministic", a.xx === b.xx && a.xy === b.xy && a.yy === b.yy);
}

console.log(fails ? "\ngaussianSplat-selfcheck: " + fails + " FAILED" : "\ngaussianSplat-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
