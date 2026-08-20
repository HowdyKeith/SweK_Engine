// physics/tomography/ct-selfcheck.mjs
//
// Run: node physics/tomography/ct-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// CT reconstruction held to what makes it a benchmark and not a picture. We define a phantom exactly, forward-project it
// into a sinogram, reconstruct with filtered back-projection, and grade the reconstruction against the phantom we own. It
// must recover the phantom -- high correlation -- and it must get BETTER with more projection angles, the way real CT
// does. And the ramp filter is the thing that makes back-projection reconstruct rather than blur: filtered recovers the
// phantom, unfiltered stays a smear no matter how many angles you feed it. The sabotage turns the ramp filter into a no-op
// -- the exact difference between filtered and plain back-projection -- and the reconstruction collapses to the blur,
// which the gate refuses. The straight-ray model this all rests on is believable only in the weak-scattering regime born.js
// bounds, and that bound is checked too.
import { analyticRadon, analyticRadonEllipse } from "./ct.js";
import { phantomField, radon, filteredBackProjection, scoreRecon, angleSet, straightRayValidPhase } from "./ct.js";
import { ramLakKernel, filterSino, backProject } from "./ct.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const N = 64, nDet = 90;
const phantom = [{ cx: 0, cy: 0, a: 0.7, b: 0.9, rho: 1 }, { cx: -0.25, cy: 0.1, a: 0.22, b: 0.28, rho: -0.6 }, { cx: 0.3, cy: -0.2, a: 0.16, b: 0.16, rho: 0.7 }, { cx: 0.1, cy: 0.45, a: 0.1, b: 0.1, rho: 0.9 }];
const truth = phantomField(N, phantom);
const recon = (nA, filter = true) => { const ang = angleSet(nA); return scoreRecon(filteredBackProjection(radon(truth, N, ang, nDet), N, ang, nDet, filter), truth); };

// ---- 1. FILTERED BACK-PROJECTION RECOVERS THE PHANTOM ----------------------------------------------
{
    const s = recon(120, true);
    ok("!! filtered back-projection reconstructs the phantom we defined", s.corr > 0.95,
       "the reconstruction correlates with the known phantom at " + s.corr.toFixed(3) + " over 120 angles -- graded against a truth we own, and the sinogram is the only thing the reconstructor sees.");
}

// ---- 2. MORE PROJECTION ANGLES GIVE A BETTER RECONSTRUCTION -----------------------------------------
{
    const few = recon(30, true), many = recon(180, true);
    ok("!! the reconstruction improves as more projection angles are added", many.corr > few.corr && many.rms < few.rms,
       "correlation rises from " + few.corr.toFixed(3) + " at 30 angles to " + many.corr.toFixed(3) + " at 180, and the error falls -- more data, better image, as real CT must.");
}

// ---- 3. THE RAMP FILTER IS WHAT RECONSTRUCTS; PLAIN BACK-PROJECTION ONLY BLURS ---------------------
{
    const filtered = recon(120, true), plain = recon(120, false);
    const bound = straightRayValidPhase(0.05), expect = Math.sqrt(0.1);
    ok("!! the ramp filter reconstructs where plain back-projection blurs, and the straight-ray bound is the born.js value", filtered.corr - plain.corr > 0.05 && Math.abs(bound - expect) < 1e-12,
       "filtered correlates at " + filtered.corr.toFixed(3) + " vs plain back-projection at " + plain.corr.toFixed(3) + "; and the straight-ray validity phase is " + bound.toFixed(4) + " rad (sqrt(2*tol) from born.js) -- the regime where the line-integral model is the right physics.");
}

// --- v3073: THE FORWARD MODEL STOPS BEING CHECKED ONLY AGAINST ITSELF -----------------------------------------
// radon() integrates rays through a RASTERISED phantom and filteredBackProjection inverts it. Every check here
// compared the reconstruction to that same rasterised phantom -- so the forward model and the inverse share any
// error the forward model has. THE INVERSE CRIME: a pipeline can be perfectly self-consistent and wrong, and it
// looks excellent doing it. A uniform ellipse has an exact projection that owes nothing to the grid, so
// comparing radon() against THAT disagrees exactly where the rasterisation is wrong and nowhere else.
{
    const N = 256, nDet = 256;
    const E = [{ cx: 0, cy: 0, a: 0.7, b: 0.45, rho: 1 }];
    const ang = angleSet(60);
    const num = radon(phantomField(N, E), N, ang, nDet);
    const ana = analyticRadon(E, ang, nDet, N);

    let peak = 0, worst = 0, sq = 0, n = 0, edgeErr = 0, interiorErr = 0;
    for (let i = 0; i < ang.length; i++) for (let d = 0; d < nDet; d++) {
        peak = Math.max(peak, ana[i][d]);
        const e = Math.abs(num[i][d] - ana[i][d]);
        worst = Math.max(worst, e); sq += e * e; n++;
    }
    const rms = Math.sqrt(sq / n);
    ok("!! the numerical Radon matches the ANALYTIC one, which owes nothing to the grid",
        rms < 0.01 * peak, "rms " + (100 * rms / peak).toFixed(3) + "% of peak, max " + (100 * worst / peak).toFixed(2) + "%");

    // WHERE the error lives is the finding. Rasterisation error belongs at the boundary; error in the INTERIOR
    // would mean the ray integration itself is wrong, which is a different and much worse thing.
    for (let i = 0; i < ang.length; i++) for (let d = 1; d < nDet - 1; d++) {
        const on = ana[i][d] > 0, nb = ana[i][d - 1] > 0 && ana[i][d + 1] > 0;
        const e = Math.abs(num[i][d] - ana[i][d]);
        if (on && nb && ana[i][d] > 0.35 * peak) interiorErr = Math.max(interiorErr, e);
        else if (on) edgeErr = Math.max(edgeErr, e);
    }
    ok("!! the disagreement is concentrated at the EDGE, not in the interior",
        interiorErr < edgeErr, "interior " + interiorErr.toFixed(2) + " vs edge " + edgeErr.toFixed(2) +
        " -- a staircased boundary is expected; interior error would mean the ray integration is wrong");

    // A value nothing here derived: a chord straight through the centre of a disc is 2*rho*R, every angle.
    const R = 0.6, disc = [{ cx: 0, cy: 0, a: R, b: R, rho: 1 }];
    const dAna = analyticRadon(disc, angleSet(8), nDet, N);
    ok("!! a disc's central chord is 2*rho*R at EVERY angle -- geometry, not this formula", (() => {
        for (const row of dAna) { const c = row[nDet / 2]; if (Math.abs(c / (N / 2) - 2 * R) > 0.02) return false; }
        return true;
    })(), "2R = " + (2 * R) + ", measured " + (dAna[0][nDet / 2] / (N / 2)).toFixed(4));
    ok("...and it is zero outside the support", dAna[0][2] === 0 && dAna[0][nDet - 3] === 0);

    // Linearity, which the sum path relies on
    const two = [{ cx: -0.3, cy: 0.1, a: 0.3, b: 0.2, rho: 1 }, { cx: 0.35, cy: -0.2, a: 0.25, b: 0.4, rho: 0.6 }];
    ok("the Radon transform is linear, and analyticRadon sums correctly", (() => {
        const both = analyticRadon(two, ang, nDet, N);
        const a1 = analyticRadon([two[0]], ang, nDet, N), a2 = analyticRadon([two[1]], ang, nDet, N);
        for (let i = 0; i < ang.length; i++) for (let d = 0; d < nDet; d++)
            if (Math.abs(both[i][d] - (a1[i][d] + a2[i][d])) > 1e-9) return false;
        return true;
    })());
    ok("...and radon() agrees with the analytic sum on a two-ellipse phantom", (() => {
        const nu = radon(phantomField(N, two), N, ang, nDet), an = analyticRadon(two, ang, nDet, N);
        let pk = 0, s2 = 0, c2 = 0;
        for (let i = 0; i < ang.length; i++) for (let d = 0; d < nDet; d++) { pk = Math.max(pk, an[i][d]); const e = nu[i][d] - an[i][d]; s2 += e * e; c2++; }
        return Math.sqrt(s2 / c2) < 0.02 * pk;
    })());

    // THE UNITS SABOTAGE. radon() sums PIXELS; the closed form is a length where the field spans [-1,1]. Drop
    // the N/2 conversion and the curve keeps its exact SHAPE and loses its scale -- which a correlation check
    // passes without blinking. This is the error an independent key exists to catch.
    const unscaled = ana.map((row) => Float64Array.from(row, (v) => v / (N / 2)));
    const corr = (A, B) => { let sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, k = 0;
        for (let i = 0; i < A.length; i++) for (let d = 0; d < nDet; d++) { const x = A[i][d], y = B[i][d]; sa += x; sb += y; sab += x * y; saa += x * x; sbb += y * y; k++; }
        return (k * sab - sa * sb) / Math.sqrt((k * saa - sa * sa) * (k * sbb - sb * sb)); };
    ok("!! SABOTAGE(units dropped): a CORRELATION check passes the wrong scale", corr(num, unscaled) > 0.999,
        "r = " + corr(num, unscaled).toFixed(6) + " -- perfect shape, wrong magnitude, and a correlation cannot tell");
    ok("...while the absolute comparison catches it", (() => {
        let s3 = 0, c3 = 0, pk = 0;
        for (let i = 0; i < ang.length; i++) for (let d = 0; d < nDet; d++) { pk = Math.max(pk, ana[i][d]); const e = num[i][d] - unscaled[i][d]; s3 += e * e; c3++; }
        return Math.sqrt(s3 / c3) > 0.1 * pk;
    })(), "which is why the units note is in the source rather than in someone's head");
}

// ---- v3903: THREE DEFINITIONS THIS GATE IMPORTED THROUGH filteredBackProjection AND NEVER NAMED ---------------
// definitionGates-selfcheck found ramLakKernel, filterSino and backProject unmentioned by this file. They were
// reachable -- filteredBackProjection calls all three -- but reachable is not named, and the whole reason that
// gate exists is that horizon(M) was reachable through six other functions when a 1% error in it passed five
// gates. A DEFECT IN A COMPOSITE IS ATTRIBUTED TO THE COMPOSITE; these give the three parts their own keys.
{
    // RAM-LAK IS A CLOSED FORM, NOT A DESIGN CHOICE: h[0] = 1/4, h[odd n] = -1/(pi^2 n^2), h[even n] = 0.
    const h = ramLakKernel(32);
    ok("ramLakKernel is the exact spatial ramp: 1/4 at the centre, -1/(pi^2 n^2) on odds, 0 on evens",
        h.length === 65 && h[32] === 0.25 &&
        Math.abs(h[33] - (-1 / (Math.PI * Math.PI))) < 1e-15 &&
        Math.abs(h[35] - (-1 / (9 * Math.PI * Math.PI))) < 1e-15 && h[34] === 0,
        "h[0]=" + h[32] + ", h[1]=" + h[33].toPrecision(10) + ", h[2]=" + h[34] + ", h[3]=" + h[35].toPrecision(10));

    // *** AND THE KERNEL SUMS TO ZERO IN THE LIMIT, WHICH IS THE WHOLE POINT OF A RAMP. *** sum h = 1/4 - 2/pi^2 *
    // sum_{odd} 1/n^2 = 1/4 - 2/pi^2 * pi^2/8 = 0 exactly. A filter with nonzero DC response would let the
    // back-projection keep the blur it exists to remove. Finite truncation leaves O(1/len), and it HALVES as len
    // DOUBLES -- measured, not asserted from the algebra.
    const sums = [16, 32, 64, 128, 256].map((L) => { let s2 = 0; for (const v of ramLakKernel(L)) s2 += v; return s2; });
    const halves = sums.slice(1).every((v, i) => Math.abs(v / sums[i] - 0.5) < 0.01);
    ok("...and its DC response vanishes as 1/len -- the ramp kills the constant it is there to kill",
        sums.every((v) => v > 0) && halves && sums[sums.length - 1] < 5e-4,
        sums.map((v) => v.toExponential(3)).join(" -> ") + " across len 16..256, each half the last");

    // filterSino IS the convolution, so a CONSTANT projection must come back near zero everywhere except the
    // truncation edge -- the same DC fact, now measured through the function that applies it.
    const nDet = 64, flat = [Float64Array.from({ length: nDet }, () => 1)];
    const filtered = filterSino(flat, nDet)[0];
    const mid = filtered.slice(nDet / 4, 3 * nDet / 4);
    ok("filterSino applies that kernel, so a FLAT projection filters to ~0 away from the edges",
        Math.max(...mid.map(Math.abs)) < 0.05,
        "worst |filtered| in the middle half = " + Math.max(...mid.map(Math.abs)).toExponential(3) +
        " for an input that is 1 everywhere -- the edges are truncation, not filter error");

    // *** backProject's NORMALISATION IS pi/nAngles, AND THE CONSEQUENCE IS ANGLE-COUNT INDEPENDENT. *** An
    // all-ones sinogram deposits pi at every pixel every ray reaches, whether that is 4 rays or 32. A wrong
    // constant here rescales every reconstruction while leaving every SHAPE check passing.
    const N = 16;
    const maxima = [4, 8, 16, 32].map((K) => {
        const angles = Array.from({ length: K }, (_, i) => (i * Math.PI) / K);
        const img = backProject(angles.map(() => Float64Array.from({ length: N }, () => 1)), N, angles, N);
        return Math.max(...img);
    });
    ok("!! backProject deposits EXACTLY pi for an all-ones sinogram, at every angle count",
        maxima.every((m) => m === Math.PI),
        "K = 4, 8, 16, 32 all give " + maxima[0].toPrecision(12) + " and Math.PI is " + Math.PI.toPrecision(12) +
        " -- BIT-EQUAL, not within a tolerance. The pi/nAngles normalisation is what makes the answer independent " +
        "of how finely the scan was sampled, and nothing else in this gate would notice if that constant moved");
}

console.log(fails ? "\nct-selfcheck: " + fails + " FAILED" : "\nct-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
