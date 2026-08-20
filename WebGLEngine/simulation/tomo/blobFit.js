// simulation/tomo/blobFit.js -- the strongest prior in the building: "the world is made of things".
//
// TV and Tikhonov are nudges. They say the world is probably flat-ish, or probably gentle, and then let the data
// say almost anything. This is a different kind of belief entirely: it says the world IS a sum of Wyvill blobs,
// full stop, and the only open questions are where they are and how big. That is not regularisation, it is an
// ONTOLOGY -- the caveman's "there are things, and they persist".
//
// The payoff is enormous and the cost is exact. Reconstructing a 40x40 image means solving for 1,600 unknowns.
// Fitting five blobs means solving for 20 (x, y, r, amplitude each). Eighty times fewer questions, so vastly less
// evidence is needed to answer them -- which is the whole reason a caveman can learn "the sun comes back" from a
// handful of dawns rather than from a complete survey of the sky.
//
// And there is no discretisation floor here at all. The forward model is blobRadonAt -- the EXACT closed-form
// shadow, (32/35)*A*R*u^3.5 -- so the fit is compared against reality with nothing lost in between. Unlike the
// grid solver, which can never beat its own 0.303% projection floor.
//
// WHAT ACTUALLY HAPPENED WHEN THIS WAS MEASURED (v2481), which is not what was predicted above:
//
//   THE FIT LOSES. Badly. Against the grid solver on the same shadows of a world literally made of five blobs:
//   1 view 93.79% vs 96.77%, 2 views 13.17% vs 74.27%, 4 views 12.37% vs 47.82%, 8 views 5.45% vs 45.45%. The
//   solver with no ontology at all beats the one that knows exactly what kind of world it is in, eight-fold.
//
//   AND THE DIAGNOSTIC SEPARATES THE TWO POSSIBLE REASONS. Scored AT THE TRUE BLOBS the misfit is 0.000e+0 -- the
//   model explains the data perfectly. Where the search lands it is 5.669e-3, FIVE POINT SEVEN BILLION times
//   worse. THE ONTOLOGY IS RIGHT AND THE SEARCH IS WHAT FAILED. Those are completely different diagnoses and the
//   error percentage alone cannot tell them apart -- which is exactly why it was worth running.
//
//   THE REAL TRADE, AND IT IS THE FINDING: a strong prior does not merely buy fewer questions, IT CHANGES THE
//   SHAPE OF THE SEARCH. The grid problem has 1,600 unknowns and is CONVEX -- least squares, one bowl, slide
//   straight down, and no amount of dimensionality hurts. This has 20 unknowns in a landscape of needles: sliding
//   one blob along x, the misfit is bad everywhere except one notch about 0.2 wide. A coordinate step of 0.09
//   walks straight past it. Fewer unknowns, each one non-convex. FEWER QUESTIONS, HARDER ANSWERS.
//
//   AND THE FAILURE MODE IS THE ONE TO FEAR, exactly as suspected but for a subtler reason than a wrong ontology:
//   the search found three of the five blobs almost perfectly (-0.50, -0.25, 0.49), smeared the middle two into
//   one fat blob, AND INVENTED A FIFTH AT (0.51, 0.55) THAT IS NOT THERE -- with a misfit of 5.7e-3, a number that
//   looks small. Confident, clean, plausible, and 45% wrong about the world, and the data barely complains. A weak
//   prior that is wrong gets NOISY and you notice. A strong prior gets CONFIDENT and you do not. That asymmetry is
//   the whole risk of thinking with beliefs, and it is why back-projection's refusal to believe anything is a real
//   virtue rather than merely a limitation.
//
// So this file is HONEST MACHINERY WITH A FAILING SEARCH. The model is proven exact (gated). Making the search
// find it needs a real optimiser -- multi-start, or blob-by-blob greedy peeling, or simulated annealing. Until
// then, the grid solver is better at seeing a world of blobs than the blob model is.
"use strict";
import { blobRadonAt } from "./blobPhantom.js";

// how badly does this set of blobs explain the shadows we actually measured?
function misfit(blobs, sino, z = 0) {
    const { data, angles, nAngles, nDet } = sino;
    let se = 0;
    for (let j = 0; j < nAngles; j++) {
        for (let i = 0; i < nDet; i++) {
            const s = -1 + (i + 0.5) * 2 / nDet;
            se += (blobRadonAt(s, angles[j], z, blobs) - data[j * nDet + i]) ** 2;
        }
    }
    return se / (nAngles * nDet);
}

// Fit blob parameters to a sinogram by coordinate descent with numerical gradients. Crude, and it does not need to
// be clever: there are only 4 numbers per blob, and the forward model is exact and costs almost nothing.
function fitBlobs(sino, { nBlobs = 5, iters = 220, seed = 7, z = 0 } = {}) {
    let a = seed >>> 0;
    const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const blobs = [];
    for (let i = 0; i < nBlobs; i++) blobs.push({ x: (rnd()-0.5)*0.8, y: (rnd()-0.5)*0.8, z: 0, r: 0.3 + rnd()*0.2, a: 1.5 + rnd() });
    const keys = ["x", "y", "r", "a"];
    let stepv = { x: 0.09, y: 0.09, r: 0.05, a: 0.25 };
    let cur = misfit(blobs, sino, z);
    for (let it = 0; it < iters; it++) {
        let improved = false;
        for (const b of blobs) for (const k of keys) {
            for (const dir of [1, -1]) {
                const old = b[k];
                b[k] = old + dir * stepv[k];
                if (b.r < 0.08 || b.r > 0.9 || b.a < 0 || Math.abs(b.x) > 1.2 || Math.abs(b.y) > 1.2) { b[k] = old; continue; }
                const m = misfit(blobs, sino, z);
                if (m < cur) { cur = m; improved = true; break; }
                b[k] = old;
            }
        }
        if (!improved) { for (const k of keys) stepv[k] *= 0.62; if (stepv.x < 1e-4) break; }
    }
    return { blobs, misfit: cur };
}
// ---- v2482: PEELING. The fix for the failure above, and it is a change of SHAPE, not of effort. --------------
//
// v2481 established that the ontology is exactly right (misfit 0.000e+0 at the true blobs) and that searching for
// it fails: 20 unknowns in a landscape of needles, and coordinate descent walks past the notch. Throwing more
// iterations at that does not help, because the problem is not slowness, it is geometry.
//
// Peeling changes the geometry. Find the ONE blob that best explains the shadows, subtract its shadow exactly,
// and look for the next in what remains. That turns a single 20-dimensional non-convex search into five
// 4-dimensional ones -- and 4 dimensions can simply be BRUTE-FORCED. No needle can hide from an exhaustive scan.
// The subtraction is exact because the shadow is closed-form: (32/35)*A*R*u^3.5, with nothing discretised.
//
// Keith pointed at the densest-subgraph peeling literature (Charikar's greedy, Boob et al.'s flowless/Greedy++).
// That is a different problem -- graph mining, not curve fitting; this is matching pursuit. But ONE idea carries
// across exactly, and it is the one that matters: GREEDY ONCE IS AN APPROXIMATION; GREEDY ITERATED CONVERGES.
// After peeling, each blob is re-fit against the residual of all the others, repeatedly. The first pass is a
// guess made while four blobs were still hidden inside the residual; later passes get to see what it missed.
//
// MEASURED (v2482), AND IT IS A PARTIAL WIN THAT STILL LOSES:
//
//   The 4-D search works perfectly in isolation. Given ONE blob at (0.30,-0.20) r0.24 a3.00, the exhaustive scan
//   returns (0.30,-0.20) r0.24 a3.00 -- exactly, in 0.2s. No needle hides from brute force.
//
//   Peeling roughly halves the error of the 20-D-at-once fit: 45.45% -> 27.61% at 8 views. Real improvement.
//   AND IT STILL LOSES TO THE SOLVER THAT BELIEVES NOTHING (6.06%). Ontology 0, empiricism 2.
//
//   THE FAILURE MODE IS THE INTERESTING PART, and Charikar's 1/2-approximation bound would have predicted the
//   shape of it. Peeling a row of five blobs from three views returns: the two END blobs exactly (-0.49, 0.49),
//   ONE FAT BLOB of r=0.61 laid across the middle three, and TWO INVENTED blobs at y=-0.41 that do not exist.
//   The greedy's FIRST pick is the single object that explains the most -- and the thing that explains a row of
//   five small blobs best, all by itself, is one big blob. That first pick is wrong, plausible, and it poisons
//   every residual after it. Two passes of re-fitting cannot dislodge it, because a fat blob sitting on top of
//   three real ones is a deep local minimum: every small move makes the fit worse.
//
//   The coarsest wrong theory is the one a greedy learner reaches first, and it is the hardest to give up.
//
// SO PEELING IS NOT THE ANSWER EITHER, AND THE HONEST SCOREBOARD IS: the ontology is exactly right (misfit 0 at
// the truth, gated), and NO search tried so far recovers it. What is left to try: orthogonal matching pursuit
// (re-solve ALL amplitudes after each pick rather than only the new one); peeling MORE blobs than needed and
// pruning; a coarse-to-fine scale sweep that forbids the fat first pick; or Boob et al.'s actual mechanism, which
// is REWEIGHTING across whole greedy runs rather than re-fitting within one.

// Exhaustively scan for the single blob that best explains a residual sinogram, then refine it locally.
// Cheap because it is only 4 numbers, and cheap is the whole point: an exhaustive scan cannot get stuck.
function fitOneBlob(resid, angles, nDet, z = 0, { coarse = 14, radii = null, rMin = 0.06, rMax = 0.9 } = {}) {
    const score = (b) => {
        let se = 0;
        for (let j = 0; j < angles.length; j++)
            for (let i = 0; i < nDet; i++) {
                const s = -1 + (i + 0.5) * 2 / nDet;
                se += (blobRadonAt(s, angles[j], z, [b]) - resid[j * nDet + i]) ** 2;
            }
        return se;
    };
    let best = null;
    for (let ix = 0; ix < coarse; ix++) for (let iy = 0; iy < coarse; iy++) {
        const x = -0.85 + 1.7 * ix / (coarse - 1), y = -0.85 + 1.7 * iy / (coarse - 1);
        if (x*x + y*y > 0.9) continue;
        for (const r of (radii || [0.12, 0.17, 0.24, 0.34, 0.46, 0.6])) {
            for (const a of [0.5, 1.0, 1.8, 3.0, 4.5]) {
                const m = score({ x, y, z, r, a });
                if (!best || m < best.m) best = { m, b: { x, y, z, r, a } };
            }
        }
    }
    // local refinement, now that we are certainly in the right basin
    const b = { ...best.b };
    let cur = best.m, step = { x: 0.06, y: 0.06, r: 0.04, a: 0.4 };
    for (let it = 0; it < 160; it++) {
        let moved = false;
        for (const k of ["x", "y", "r", "a"]) for (const d of [1, -1]) {
            const old = b[k];
            b[k] = old + d * step[k];
            if (b.r < rMin || b.r > rMax || b.a < 0) { b[k] = old; continue; }
            const m = score(b);
            if (m < cur) { cur = m; moved = true; break; }
            b[k] = old;
        }
        if (!moved) { for (const k in step) step[k] *= 0.6; if (step.x < 5e-4) break; }
    }
    return { blob: b, misfit: cur };
}

// Peel blobs out one at a time, then iterate the greedy until it stops improving.
function peelBlobs(sino, { nBlobs = 5, passes = 4, z = 0, radii = null, rMin = 0.06, rMax = 0.9 } = {}) {
    const { data, angles, nDet } = sino;
    const found = [];
    const resid = Float64Array.from(data);
    // --- the peel: one blob at a time, each found by exhaustive scan, each shadow subtracted EXACTLY
    for (let k = 0; k < nBlobs; k++) {
        const { blob } = fitOneBlob(resid, angles, nDet, z, { radii, rMin, rMax });
        found.push(blob);
        for (let j = 0; j < angles.length; j++)
            for (let i = 0; i < nDet; i++)
                resid[j * nDet + i] -= blobRadonAt(-1 + (i + 0.5) * 2 / nDet, angles[j], z, [blob]);
    }
    // --- iterate the greedy (the one idea that carries over from the densest-subgraph literature): re-fit each
    //     blob against the residual of ALL THE OTHERS. Pass one was guessed while the rest were still hidden.
    for (let p = 0; p < passes; p++) {
        for (let k = 0; k < found.length; k++) {
            const others = found.filter((_, i) => i !== k);
            const r2 = new Float64Array(angles.length * nDet);
            for (let j = 0; j < angles.length; j++)
                for (let i = 0; i < nDet; i++) {
                    const s = -1 + (i + 0.5) * 2 / nDet;
                    r2[j * nDet + i] = data[j * nDet + i] - blobRadonAt(s, angles[j], z, others);
                }
            found[k] = fitOneBlob(r2, angles, nDet, z, { radii, rMin, rMax }).blob;
        }
    }
    return { blobs: found, misfit: misfit(found, sino, z) };
}
// ---- v2483: the scale sweep. The fix aimed at the FIRST PICK, which is where all the damage was. -----------
//
// v2482's diagnosis: peeling a row of five small blobs, the greedy's first pick is one FAT blob laid across the
// whole row, because that single object explains more than any small one can. Wrong, plausible, and a deep local
// minimum nothing afterwards can escape. Every later blob is then fitting the mess that pick left behind.
//
// So do not let it make that pick. Restrict the peel to a band of radii, and run the whole peel once per band --
// then keep whichever band explains the shadows best. THE DATA CHOOSES THE SCALE, not me: the bands are handed to
// it, and the misfit picks the winner. That distinction matters, because "restrict r to about 0.17" would just be
// me writing the answer in and calling it a discovery.
//
// MEASURED (v2483), and it worked: the row of five r=0.17 blobs, peeled at 8 views --
//     v2481, all 20 unknowns at once ......... 45.45%
//     v2482, peeled ........................... 27.61%
//     v2483, peeled with the scale swept ....... 6.72%     vs the belief-free grid solver's 6.06%
// AND THE DATA PICKED THE RIGHT BAND ON ITS OWN: at 4 and 8 views the winning band was rMax 0.22, when the true
// blobs are r = 0.17. Nobody told it the scale; the misfit found it. Forbidding the fat first pick recovered
// almost the entire gap -- the damage really was all in that one decision.
//
// AND THE HONEST SCOREBOARD IS STILL: A DRAW, AT BEST. Three rounds of search engineering to draw level with a
// solver that believes nothing at all, on a world literally made of the things this model believes in. Knowing
// what the world is made of bought nothing here, because the cost of FINDING the answer inside the ontology ate
// the whole advantage. That is the honest result and it should stay written down.
function peelScaleSwept(sino, { nBlobs = 5, passes = 2, z = 0, bands = null } = {}) {
    const B = bands || [
        { radii: [0.10, 0.14, 0.18], rMin: 0.07, rMax: 0.22 },   // fine
        { radii: [0.16, 0.22, 0.30], rMin: 0.12, rMax: 0.36 },   // medium
        { radii: [0.28, 0.40, 0.55], rMin: 0.22, rMax: 0.70 },   // coarse
        { radii: [0.12, 0.17, 0.24, 0.34, 0.46, 0.6], rMin: 0.06, rMax: 0.9 },  // unrestricted -- the v2482 control
    ];
    let best = null;
    const tried = [];
    for (const band of B) {
        const r = peelBlobs(sino, { nBlobs, passes, z, ...band });
        tried.push({ rMax: band.rMax, misfit: r.misfit });
        if (!best || r.misfit < best.misfit) best = r;
    }
    return { ...best, tried };
}
export { misfit, fitBlobs, fitOneBlob, peelBlobs, peelScaleSwept };
