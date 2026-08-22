// WebGLEngine/simulation/tomo/nullspace-selfcheck.mjs — v2543
//
// Run: node simulation/tomo/nullspace-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The claim is: this builds an image the measurements CANNOT SEE. That claim has exactly one honest test -- the
// image must cast no shadow at the angles that were measured. Everything else in the module is a story told on
// top of that number.
//
// AND THE TEST THAT MATTERS MOST IS THE SEPARATION. A construction that returns "lots of null space" for EVERY
// scan is not finding the null space, it is failing to converge and calling the leftovers a discovery. Full
// 180-degree coverage must collapse; a 45-degree wedge must not.
import { nullSpaceImage, residualOf, indistinguishablePair, uncertaintyMap } from "./nullspace.js";
import { project } from "./iterative.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const energy = (x) => { let e = 0; for (const v of x) e += v * v; return e / x.length; };

const N = 28;
const wedge = [];
for (let i = 0; i < 14; i++) wedge.push(-Math.PI / 8 + (i / 13) * (Math.PI / 4));   // 45 degrees of coverage
const full = [];
for (let i = 0; i < 44; i++) full.push((i / 44) * Math.PI);                          // the whole thing

// ---- 1. THE CONTROL: a null-space image casts (almost) no shadow -------------------------------------------
{
    const ns = nullSpaceImage(N, wedge, { iters: 300 });
    ok("a null-space image casts almost no shadow at the measured angles", ns.residual < 0.02,
       "residual " + ns.residual.toExponential(2) + " (relative to its own scale)");
    // ...and it must not have collapsed to nothing, which would pass the residual test trivially
    ok("...and it is not just a blank image", energy(ns.img) > 0.01, "energy " + energy(ns.img).toFixed(4));
}

// ---- 2. THE ONE THAT MATTERS: coverage decides how much you cannot see --------------------------------------
// If this fails, the construction is not finding a null space -- it is failing to converge and calling the
// residue a result. It took 1600 iterations to see this separation clearly, which is itself the finding:
// Landweber leaves the null space alone and shrinks everything else at a rate set by the singular values, so
// nearly-invisible directions die SLOWLY.
{
    const w = nullSpaceImage(N, wedge, { iters: 1400 });
    const f = nullSpaceImage(N, full, { iters: 1400 });
    const ew = energy(w.img), ef = energy(f.img);
    ok("A 45-DEGREE WEDGE LEAVES MORE UNSEEN THAN A FULL SCAN", ew > ef * 1.25,
       "wedge " + ew.toFixed(4) + " vs full " + ef.toFixed(4) + "  (" + (ew / ef).toFixed(2) + "x)");
    // and the full scan must be actively collapsing, not merely smaller by luck
    const fShort = nullSpaceImage(N, full, { iters: 200 });
    ok("...and a full scan's null space SHRINKS with iterations (it is converging to nothing)",
       energy(f.img) < energy(fShort.img) * 0.75,
       "200 iters " + energy(fShort.img).toFixed(4) + " -> 1400 iters " + ef.toFixed(4));
    // ...while the wedge's does NOT: that residue is real, not unconverged
    const wShort = nullSpaceImage(N, wedge, { iters: 200 });
    ok("...while the wedge's null space PERSISTS (the data really cannot see it)",
       energy(w.img) > energy(wShort.img) * 0.6,
       "200 iters " + energy(wShort.img).toFixed(4) + " -> 1400 iters " + ew.toFixed(4));
}

// ---- 3. THE ARGUMENT: two different pictures, the same data -------------------------------------------------
{
    const truth = new Float64Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = (x - N / 2) / N, dy = (y - N / 2) / N;
        truth[y * N + x] = dx * dx + dy * dy < 0.06 ? 1 : 0;   // a disc
    }
    const p = indistinguishablePair(truth, N, wedge, { iters: 300, amp: 0.6 });
    ok("TWO VISIBLY DIFFERENT IMAGES PRODUCE THE SAME MEASUREMENTS", p.projDiff < 0.05 && p.imgDiff > 0.2,
       "the DATA differs by " + (100 * p.projDiff).toFixed(2) + "%, the PICTURE by " + (100 * p.imgDiff).toFixed(0) + "%");
    // If that holds, no algorithm can choose between them FROM THE DATA. Any that does is reporting its prior.
}

// ---- 4. the uncertainty map is a map, not a mood -------------------------------------------------------------
{
    const u = uncertaintyMap(N, wedge, { iters: 220, samples: 3 });
    ok("the uncertainty map has the shape of the image", u.map.length === N * N && u.map.every(Number.isFinite));
    ok("...and is not uniform (it says WHERE, not just how much)",
       Math.max(...u.map) - Math.min(...u.map) > 0.3,
       "range " + Math.min(...u.map).toFixed(3) + " to " + Math.max(...u.map).toFixed(3));
    ok("...and averaging several seeds did not cancel it to zero", energy(u.map) > 0.005, "energy " + energy(u.map).toFixed(4));
}

// ---- 5. residualOf is honest about a NON-null image ------------------------------------------------------------
// The control must be able to FAIL. If residualOf says "zero shadow" for a solid disc, it measures nothing.
{
    const disc = new Float64Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = (x - N / 2) / N, dy = (y - N / 2) / N;
        disc[y * N + x] = dx * dx + dy * dy < 0.06 ? 1 : 0;
    }
    const rDisc = residualOf(disc, N, wedge);
    const rNull = nullSpaceImage(N, wedge, { iters: 300 }).residual;
    // The question is DISCRIMINATION, not a magic number. The first version of this asserted rDisc > 0.05 -- a
    // threshold picked out of the air -- and the disc read 3.6e-2 and "failed" while being 23x the null image.
    // residualOf normalises by peak*n and a disc is mostly zeros, so its absolute residual is small and its
    // RELATIVE one is damning. Compare the two things the test actually needs to tell apart.
    ok("A SOLID DISC IS NOT NULL (the control can fail)", rDisc > rNull * 8,
       "disc " + rDisc.toExponential(2) + " vs null " + rNull.toExponential(2) + " = " + (rDisc / rNull).toFixed(0) + "x -- a disc casts a shadow");
}

console.log(fails ? "\nnullspace-selfcheck: " + fails + " FAILED" : "\nnullspace-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
