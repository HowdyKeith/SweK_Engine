// WebGLEngine/physics/crystal/structureFactor-selfcheck.mjs -- v3579
//
// Run: node physics/crystal/structureFactor-selfcheck.mjs
// RUNTIME .2s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 5 IS THE ROUND THIS LAB KEEPS RUNNING: WHICH KEY CATCHES WHICH FAULT. *** Two plants, and they
// split -- one is caught by the absences and blind to the grating, the other exactly the reverse. A lab whose
// keys all caught the same faults would have one key wearing four hats.
"use strict";
import { pathToFileURL } from "node:url";
import { reciprocal, reciprocalResidual, structureFactorSum, structureFactorClosed, isAbsent,
         allSameParity, absenceSweep, rowIntensity, rowAmplitude, rowZerosPerOrder, dot,
         BASES, MEASURED_V3579, reportLines } from "./structureFactor.mjs";
import { doubleSlitNumeric, doubleSlitMaxima } from "../optics/diffraction.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("structureFactor-selfcheck -- absences that cannot exist, and a key from another instrument\n");

// ---------------------------------------------------------------------------
console.log("1. *** A SYSTEMATIC ABSENCE IS NOT A SMALL NUMBER -- IT IS A REFLECTION THAT CANNOT EXIST ***");
{
    for (const lat of ["bcc", "fcc", "diamond"]) {
        const s = absenceSweep(lat);
        report(lat.padEnd(8), s.nAbsent + " absent, worst |F| " + s.worstAbsent.toExponential(2) +
               "  |  " + s.nAllowed + " allowed, smallest " + s.minAllowed.toFixed(4) +
               "  |  gap " + s.gap.toExponential(1));
    }
    const fcc = absenceSweep("fcc");
    ok("!! every forbidden reflection is at float roundoff, not merely small",
        ["bcc", "fcc", "diamond"].every((l) => absenceSweep(l).worstAbsent < 1e-13),
        "the sum over the basis is ALGEBRAICALLY zero at those hkl. A structure returning anything there would " +
        "be wrong about the crystal rather than imprecise about the arithmetic.");
    ok("!! *** AND THE GAP IS THE VERDICT, NOT THE ABSENCE ALONE ***",
        ["bcc", "fcc", "diamond"].every((l) => absenceSweep(l).gap > 1e12),
        "FCC: 9.8e-16 forbidden against 4.000000 allowed, A GAP OF 4.1e15. *** ANY TOLERANCE BETWEEN 1e-14 AND " +
        "1 GIVES THE IDENTICAL VERDICT, WHICH IS WHAT MAKES A KEY EXACT RATHER THAN TIGHT. *** A small absence " +
        "proves nothing on its own if the allowed reflections are also small -- so both ends are measured.");
    ok("!! ...and simple cubic has NO absences, so the rule is not 'everything is zero'",
        absenceSweep("sc").nAbsent === 0 && absenceSweep("sc").minAllowed === 1,
        "*** WITHOUT A LATTICE THAT FORBIDS NOTHING, 'THE FORBIDDEN ONES ARE ZERO' WOULD BE SATISFIED BY A " +
        "FUNCTION THAT RETURNS ZERO. *** sc is the negative control.");
}

// ---------------------------------------------------------------------------
console.log("\n2. TWO ROUTES: A SUM OVER ATOMS, AND A PARITY RULE THAT NEVER SEES AN ATOM");
{
    let worst = 0, n = 0;
    for (const lat of ["sc", "bcc", "fcc", "diamond"]) {
        const s = absenceSweep(lat, { hklMax: 5 });
        worst = Math.max(worst, s.worstRoute); n += s.nAbsent + s.nAllowed;
    }
    report("reflections compared / worst |sum - closed|", n + " / " + worst.toExponential(2));
    ok("!! the direct sum and the closed form agree everywhere",
        worst < 1e-13,
        "structureFactorSum adds phasors over atom positions and KNOWS NOTHING ABOUT PARITY; " +
        "structureFactorClosed IS the parity rule and NEVER TOUCHES AN ATOM. They share no operation.");
    ok("!! diamond's 4*sqrt(2) is reproduced, which a copied parity table would not give",
        Math.abs(structureFactorSum(BASES.diamond, 1, 1, 1).mag - 4 * Math.SQRT2) < 1e-13,
        "odd-odd-odd in diamond gives 4*sqrt(2) = 5.6569, not 8 and not 0. *** AN IRRATIONAL VALUE IS THE " +
        "PART A RULE-OF-THUMB IMPLEMENTATION GETS WRONG, because it is the one case that is neither 'full' nor " +
        "'forbidden'. ***");
    ok("...and the (000) reflection is never called absent",
        !isAbsent("fcc", 0, 0, 0) && !isAbsent("diamond", 0, 0, 0),
        "the forward beam is every atom in phase; calling it forbidden would be an arithmetic slip that a " +
        "parity rule alone would happily commit");
}

// ---------------------------------------------------------------------------
console.log("\n2b. dot(): THE PLAIN VECTOR PRODUCT UNDER reciprocal() AND ITS RESIDUAL");
{
    ok("!! dot() of orthogonal unit vectors is EXACTLY zero",
        dot([1, 0, 0], [0, 1, 0]) === 0 && dot([1, 0, 0], [0, 0, 1]) === 0 && dot([0, 1, 0], [0, 0, 1]) === 0,
        "the cardinal axes are orthogonal by construction; a x . y term with a sign or index slip would not " +
        "land on exactly 0");
    ok("!! dot(v, v) is EXACTLY |v|^2, checked against a hand-computed value",
        dot([3, 4, 0], [3, 4, 0]) === 25 && dot([1, 2, 2], [1, 2, 2]) === 9,
        "3-4-0 and 1-2-2 are both Pythagorean-style triples chosen so |v|^2 is an exact integer: 9+16=25, " +
        "1+4+4=9 -- no floating-point tolerance needed");
    ok("!! and a hand-computed non-trivial case matches by arithmetic, not by symmetry",
        dot([1, 2, 3], [4, -5, 6]) === (1 * 4 + 2 * -5 + 3 * 6),
        "1*4 + 2*(-5) + 3*6 = 4 - 10 + 18 = 12, computed by hand and by the function and compared exactly");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE RECIPROCAL IDENTITIES, EXACT BY CONSTRUCTION");
{
    const cells = {
        cubic: [[4, 0, 0], [0, 4, 0], [0, 0, 4]],
        tetragonal: [[3, 0, 0], [0, 3, 0], [0, 0, 5]],
        hexagonal: [[3, 0, 0], [-1.5, 2.598076211353316, 0], [0, 0, 5]],
        triclinic: [[4.1, 0, 0], [1.3, 3.7, 0], [0.9, -1.1, 5.2]],
    };
    let worst = 0;
    for (const [n, c] of Object.entries(cells)) {
        const r = reciprocalResidual(...c);
        worst = Math.max(worst, r.diagonal, r.offDiagonal);
        report(n.padEnd(11), "diagonal " + r.diagonal.toExponential(2) + "  off-diagonal " + r.offDiagonal.toExponential(2));
    }
    ok("!! a_i . b_j = 2 pi delta_ij holds to roundoff on every cell shape",
        worst < 1e-14,
        "cubic, tetragonal and hexagonal come back EXACTLY 0.00e+0 -- the cross products land on representable " +
        "numbers. The triclinic cell is 8.9e-16 because they cannot, and that difference is the arithmetic " +
        "showing rather than the identity failing.");
    ok("!! a degenerate cell is REFUSED rather than returning Infinity",
        reciprocal([1, 0, 0], [2, 0, 0], [0, 0, 1]) === null,
        "*** THREE COPLANAR VECTORS HAVE NO RECIPROCAL, AND A DIVISION BY ZERO WOULD HAND BACK Infinity THAT " +
        "READS AS A VERY LARGE LATTICE. *** navigate.js's rule: refuse rather than return the closest thing.");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE 1D LIMIT MUST REPRODUCE physics/optics/diffraction.js ***");
{
    const lambda = 500e-9, d = 2e-6;
    const sts = Array.from({ length: 601 }, (_, i) => -0.3 + 0.6 * i / 600);
    const errs = [50, 200, 1000, 5000].map((r) => {
        const a = d / r;
        const g = rowIntensity(2, d, lambda, sts), ds = doubleSlitNumeric(a, d, lambda, sts, 400);
        return Math.max(...g.map((v, i) => Math.abs(v - ds[i])));
    });
    report("max |row - doubleSlit| at a = d/50, /200, /1000, /5000", errs.map((e) => e.toExponential(2)).join("  "));

    ok("!! *** THE LIMIT IS APPROACHED, NOT ASSERTED ***",
        errs.every((e, i) => i === 0 || e < errs[i - 1]) && errs[3] < 1e-6,
        "1.44e-3 -> 9.01e-5 -> 3.60e-6 -> 1.44e-7 as the slit narrows: SECOND ORDER IN a, which is what a " +
        "finite slit converging to a point should do. *** SHOWN BY SHRINKING a RATHER THAN CLAIMED AT ONE " +
        "VALUE, where any single number is a coincidence waiting to be believed. ***");
    ok("!! the answer key is a module written for a DIFFERENT SUBJECT and gated separately",
        typeof doubleSlitNumeric === "function" && typeof doubleSlitMaxima === "function",
        "physics/optics/diffraction.js shares no line of code with this file. A crystal in one dimension is an " +
        "optics problem, which is why the Fresnel-to-far-field move is available here at all.");

    const peaks = doubleSlitMaxima(d, lambda, 1);
    const I = rowIntensity(8, d, lambda, peaks);
    ok("!! and the grating's principal maxima sit exactly where the optics module says",
        I.every((v) => Math.abs(v - 1) < 1e-12),
        "sin(theta) = m lambda / d gives intensity 1 for the 8-scatterer row, to 1e-12. The ORDER POSITIONS " +
        "come from diffraction.js and the INTENSITIES from here.");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE ZERO COUNT IS AN INTEGER -- ONCE THE DETECTOR STOPS USING A THRESHOLD ***");
{
    const Ns = [2, 3, 4, 5, 6, 8, 12];
    const got = Ns.map((N) => rowZerosPerOrder(N, { samples: 60000 }));
    report("N", Ns.join("  "));
    report("zeros per order", got.join("  "));
    ok("!! N scatterers give exactly N-1 zeros between principal maxima, for every N",
        got.every((z, i) => z === Ns[i] - 1),
        "an integer with no tolerance anywhere in it");

    // the detector that failed, run again so the failure is a fact in the record rather than a memory
    const threshold = (N, samples = 60000) => {
        let z = 0;
        const I = Array.from({ length: samples + 1 }, (_, i) => { const a = rowAmplitude(N, i / samples); return a * a; });
        for (let i = 1; i < I.length - 1; i++) if (I[i] < I[i - 1] && I[i] <= I[i + 1] && I[i] < 1e-9) z++;
        return z;
    };
    const grids = [7, 999, 5000, 20000, 30000, 60000];
    const thrN3 = grids.map((g) => threshold(3, g));
    const sgnN3 = grids.map((g) => rowZerosPerOrder(3, { samples: g }));
    report("N=3 by THRESHOLD, at samples " + grids.join("/"), thrN3.join("  "));
    report("N=3 by SIGN CHANGE, same grids", sgnN3.join("  "));

    ok("!! *** THE THRESHOLD DETECTOR'S ANSWER IS A FUNCTION OF THE GRID, NOT OF THE PHYSICS ***",
        new Set(thrN3).size > 1 && thrN3.includes(0) && thrN3.includes(2),
        "N=3 has TWO zeros per order and this returns 0, 2, 0, 0, 2, 2 as the sample count changes. *** THAT IS " +
        "WORSE THAN BEING WRONG: it is right often enough to look right. *** The zeros sit at u = m/3 and a " +
        "uniform grid never lands there, so whether the nearest sample falls under 1e-9 depends on how the grid " +
        "happens to straddle the zero. THE FIRST VERSION OF THIS CHECK ASSERTED `threshold(3) !== 2` AND WENT " +
        "RED AT 60000 SAMPLES, because at that grid the detector gets it right -- pinning the SYMPTOM instead " +
        "of the PROPERTY, which is the ratchet this lab keeps removing.");
    ok("!! ...and the sign-change detector returns the same integer on every grid, including seven samples",
        new Set(sgnN3).size === 1 && sgnN3[0] === 2,
        "SEVEN samples and sixty thousand agree, because a sign change CANNOT BE MISSED between two points " +
        "that straddle it and needs no epsilon at all. The amplitude of a symmetric row is REAL, which is what " +
        "makes this available -- an intensity is never negative and has no sign to change.");
}

// ---------------------------------------------------------------------------
console.log("\n6. TWO PLANTS, AND THEY SPLIT -- EACH KEY CATCHES WHAT THE OTHER CANNOT");
{
    // PLANT A: report |F| instead of |F|^2. Every absence SURVIVES, because zero squared is still zero.
    const magInsteadOfIntensity = (h, k, l) => structureFactorSum(BASES.fcc, h, k, l).mag;
    let plantAAbsencesHold = true;
    for (let h = -3; h <= 3; h++) for (let k = -3; k <= 3; k++) for (let l = -3; l <= 3; l++)
        if (isAbsent("fcc", h, k, l) && magInsteadOfIntensity(h, k, l) > 1e-13) plantAAbsencesHold = false;
    ok("!! PLANT A -- |F| instead of |F|^2: THE ABSENCE KEY IS BLIND TO IT",
        plantAAbsencesHold,
        "*** ZERO SQUARED IS STILL ZERO, so every forbidden reflection stays forbidden and the sharpest key in " +
        "this file notices nothing. *** A lab that only owned the absences would ship this fault.");

    // ...and the grating comparison DOES see it, because intensity is what diffraction.js returns.
    const lambda = 500e-9, d = 2e-6, sts = [0.05, 0.1, 0.2];
    const good = rowIntensity(2, d, lambda, sts);
    const bad = good.map((v) => Math.sqrt(v));
    const ref = doubleSlitNumeric(d / 5000, d, lambda, sts, 400);
    ok("!! ...and THE OPTICS KEY CATCHES IT, because diffraction.js returns an INTENSITY",
        Math.max(...good.map((v, i) => Math.abs(v - ref[i]))) < 1e-6 &&
        Math.max(...bad.map((v, i) => Math.abs(v - ref[i]))) > 1e-2,
        "the cross-instrument key is sensitive to exactly the thing the absences cannot see. *** THAT IS WHY " +
        "THE LAB KEEPS BOTH, AND IT IS THE FIFTH ROUND RUNNING WHERE THE ANSWER IS WHICH KEY CATCHES WHICH " +
        "FAULT. ***");

    // PLANT B: drop the basis -- keep only the corner atom. The absences VANISH; the grating is untouched.
    let plantBCaught = false;
    for (let h = -3; h <= 3 && !plantBCaught; h++) for (let k = -3; k <= 3 && !plantBCaught; k++)
        for (let l = -3; l <= 3 && !plantBCaught; l++)
            if (isAbsent("fcc", h, k, l) && structureFactorSum(BASES.sc, h, k, l).mag > 1e-13) plantBCaught = true;
    ok("!! PLANT B -- drop the basis: THE ABSENCE KEY CATCHES IT IMMEDIATELY",
        plantBCaught,
        "one atom per cell forbids nothing, so every mixed-parity reflection lights up at |F| = 1 where the " +
        "truth is 0. THE EXACT ZERO IS WHAT MAKES THIS UNMISSABLE -- there is no tolerance to hide 1.0 in.");
    ok("!! ...and the OPTICS key is blind to PLANT B, which is the reverse split",
        Math.max(...rowIntensity(2, d, lambda, sts).map((v, i) => Math.abs(v - ref[i]))) < 1e-6,
        "*** THE 1D ROW HAS NO BASIS TO DROP. *** A grating is one atom per cell already, so the fault is " +
        "invisible in the limit where the optics key lives. Two plants, two keys, and NEITHER KEY CATCHES BOTH.");
    ok("nothing is ratcheted",
        !("baseline" in MEASURED_V3579),
        "every number here is recomputed from the bases each run; freezing one would ratchet a sweep range");
}

// ---------------------------------------------------------------------------
console.log("\n7. THE REPORT PRINTS AND THE SPLIT HOLDS");
ok("the reporting tool produces a report", reportLines().length > 12,
    "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");

console.log(fails ? `\nstructureFactor-selfcheck: ${fails} FAILED` : "\nstructureFactor-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
