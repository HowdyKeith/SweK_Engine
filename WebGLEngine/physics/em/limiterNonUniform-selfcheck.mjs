// WebGLEngine/physics/em/limiterNonUniform-selfcheck.mjs -- v3636
//
// Run: node physics/em/limiterNonUniform-selfcheck.mjs
//
// *** I PREDICTED, FOR THE SECOND ROUND RUNNING, THAT THE LIMITER GUARANTEE WOULD BREAK. IT DOES NOT -- AND THIS
// TIME THE MEASUREMENT ALSO SHOWED ME WHICH GUARANTEE I HAD BEEN WATCHING. Monotonicity survives non-uniform
// spacing for BOTH spellings, with a factor-of-two margin that does not depend on the widths at all. What breaks
// is ACCURACY, only at the seam, and only for the spelling almost everyone writes. ***
//
// THE JOIN: v3632 measured what a refinement interface costs; v3635 proved per-axis minmod monotone on a
// Cartesian cell and named the untested case in as many words -- "with NON-UNIFORM SPACING the offsets are not
// 1/2 and the argument does not run". A refinement interface IS non-uniform spacing and was already in the tree.
//
// THE TWO SPELLINGS:
//   naive   minmod of the BARE DIFFERENCES, reconstruction u +/- s/2. Correct on a uniform grid BY COINCIDENCE.
//   slope   minmod of the TRUE one-sided slopes (difference / centre-to-centre distance), applied over h[i]/2.

import { readFileSync } from "node:fs";
import {
    minmod, interfaceWidths, centres, analyticCells, halfExcess, escapes,
    excessFactor, refineNonUniform, accuracyByRegion,
} from "./limiterNonUniform.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const F = (x) => Math.exp(-Math.pow((x - 45) / 14, 2));
const RATIOS = [1, 2, 4, 8];

// --- 1. THE PREDICTION, REFUTED AGAIN -----------------------------------------------------------------------
{
    say("1. DOES THE MONOTONICITY GUARANTEE SURVIVE A REFINEMENT INTERFACE? Expected no. Measured: yes, for BOTH.");
    for (const ratio of RATIOS) {
        const { h } = interfaceWidths({ nCoarse: 60, nFine: 60 * ratio, ratio });
        const u = analyticCells(F, h);
        const n = escapes(u, h, "naive"), s = escapes(u, h, "slope");
        say("     ratio " + String(ratio).padEnd(2) + "  naive " + n.count + " escapes   slope " + s.count + " escapes");
    }
    ok("!! neither spelling leaves its 3-point neighbourhood, at any refinement ratio", RATIOS.every((ratio) => {
        const { h } = interfaceWidths({ nCoarse: 60, nFine: 60 * ratio, ratio });
        const u = analyticCells(F, h);
        return escapes(u, h, "naive").count === 0 && escapes(u, h, "slope").count === 0;
    }), "SECOND ROUND RUNNING THAT THIS PREDICTION HAS BEEN WRONG, and the reason is one line: minmod already " +
        "bounds its output by the SMALLER of the two differences, and half of the smaller difference cannot leave " +
        "a neighbourhood whose half-span is at least that difference");
    ok("the margin is a factor of two and does NOT depend on the widths", RATIOS.every((r) =>
        excessFactor(1, 1 / r, "naive") === 0.5 && excessFactor(1, 1 / r) < 1 && excessFactor(1 / r, 1) < 1),
        "naive sits at a flat 0.5000 for every ratio; the slope form runs 0.6667 / 0.8000 / 0.8889 for a coarse " +
        "cell beside a fine one and 0.3333 / 0.2000 / 0.1111 for the reverse -- ALL STRICTLY BELOW 1, which is the " +
        "condition, so both are safe and the naive one is actually the more conservative at the face");
    ok("...and the instrument can see an escape when there is one", (() => {
        // an UNLIMITED centred slope on the same grid, which has no such bound
        const { h } = interfaceWidths({ nCoarse: 60, nFine: 240, ratio: 4 });
        const u = analyticCells(F, h);
        let found = 0;
        for (let i = 1; i < u.length - 1; i++) {
            const s = 0.5 * ((u[i + 1] - u[i - 1]) / 2);
            const lo = Math.min(u[i - 1], u[i], u[i + 1]), hi = Math.max(u[i - 1], u[i], u[i + 1]);
            if (u[i] + Math.abs(s) > hi + 1e-15 || u[i] - Math.abs(s) < lo - 1e-15) found++;
        }
        say("     the same grid with an UNLIMITED centred slope: " + found + " escapes");
        return found > 0;
    })(), "A ZERO FROM AN INSTRUMENT THAT CANNOT REGISTER A NONZERO IS NOT A RESULT -- v3635's lesson, applied here");
}

// --- 2. WHAT ACTUALLY BREAKS, AND WHY IT IS INVISIBLE UNTIL IT ISN'T ---------------------------------------------
{
    say("2. ACCURACY, REPORTED SEPARATELY FOR THE UNIFORM INTERIOR AND FOR THE CELLS AT THE WIDTH CHANGE.");
    const rows = RATIOS.map((ratio) => {
        const { h, splitAt } = interfaceWidths({ nCoarse: 60, nFine: 60 * ratio, ratio });
        return { ratio, n: accuracyByRegion(F, h, splitAt, 2, "naive"), s: accuracyByRegion(F, h, splitAt, 2, "slope") };
    });
    for (const r of rows) say("     ratio " + String(r.ratio).padEnd(2) + " NAIVE interior " + r.n.interior.toExponential(2) +
        " seam " + r.n.seam.toExponential(2) + " (x" + r.n.ratioSeamToInterior.toFixed(1) + ")   |   SLOPE interior " +
        r.s.interior.toExponential(2) + " seam " + r.s.seam.toExponential(2) + " (x" + r.s.ratioSeamToInterior.toFixed(1) + ")");
    ok("!! on a UNIFORM grid the two spellings are identical, which is why the defect is invisible",
        rows[0].n.interior === rows[0].s.interior && rows[0].n.seam === rows[0].s.seam,
        "ratio 1: both read " + rows[0].n.interior.toExponential(3) + " / " + rows[0].n.seam.toExponential(3) +
        ". A difference IS the slope times the spacing when the spacing is one number, so the two agree BY COINCIDENCE");
    ok("!! and the interiors stay identical even when the grid is not uniform", rows.every((r) => r.n.interior === r.s.interior),
        "all four ratios read " + rows[3].n.interior.toExponential(3) + " in the interior for both -- so a " +
        "whole-domain error number would have called this fine");
    ok("!! the naive spelling degrades AT THE SEAM AND ONLY THERE, by more as the ratio grows",
        rows.slice(1).every((r) => r.n.ratioSeamToInterior > 2) && rows[3].n.ratioSeamToInterior > rows[1].n.ratioSeamToInterior,
        "seam/interior " + rows.slice(1).map((r) => r.n.ratioSeamToInterior.toFixed(1)).join(", ") + "x at ratios 2, 4, 8 " +
        "-- against the slope form's " + rows[3].s.ratioSeamToInterior.toFixed(1) + "x, which is BELOW one because the " +
        "seam cells are finer and a correct reconstruction gets that for free");
    ok("the naive seam error saturates rather than growing without bound", rows[3].n.seam / rows[2].n.seam < 1.3,
        "5.66e-3 at ratio 8 against 4.91e-3 at ratio 4 -- the penalty approaches a ceiling, which is an engineering " +
        "number: going from 4x to 8x refinement costs almost nothing extra at the seam and the first step costs it all");
    say("   *** SO THE GUARANTEE THAT SURVIVES IS MONOTONICITY AND THE THING THAT BREAKS IS ORDER, WHICH IS THE");
    say("   OPPOSITE OF WHAT I WENT LOOKING FOR. A limiter that never overshoots can still be quietly wrong, and");
    say("   the check that would catch it is not the one the literature warns you to write. ***");
}

// --- 3. the unit, stated as a unit rather than a tolerance ---------------------------------------------------------
{
    say("3. THE FIX IS A UNIT, NOT A TOLERANCE.");
    const { h } = interfaceWidths({ nCoarse: 6, nFine: 24, ratio: 4 });
    const x = centres(h);
    ok("centre-to-centre distance across the seam is neither width", (() => {
        const gap = x[6] - x[5];
        say("     h[5] = " + h[5] + ", h[6] = " + h[6] + ", centre gap = " + gap.toFixed(4) +
            " = (h[5] + h[6]) / 2 = " + (0.5 * (h[5] + h[6])).toFixed(4));
        return Math.abs(gap - 0.5 * (h[5] + h[6])) < 1e-15;
    })(), "the naive spelling divides by neither, because on a uniform grid it never had to divide at all");
    ok("the half-excesses differ at the seam and agree away from it", (() => {
        const u = analyticCells(F, h);
        const a = halfExcess(u, h, "naive"), b = halfExcess(u, h, "slope");
        const atSeam = Math.abs(a[6] - b[6]) > 1e-9;
        const { h: hu } = interfaceWidths({ nCoarse: 15, nFine: 15, ratio: 1 });
        const uu = analyticCells(F, hu);
        const au = halfExcess(uu, hu, "naive"), bu = halfExcess(uu, hu, "slope");
        let sameEverywhere = true;
        for (let i = 0; i < uu.length; i++) if (au[i] !== bu[i]) sameEverywhere = false;
        return atSeam && sameEverywhere;
    })(), "bit-identical on a uniform grid, different at a width change -- which is the whole shape of this defect");
    ok("minmod itself is the same definition as the 1D and 2D modules'", minmod(1, -1) === 0 && minmod(2, 5) === 2 && minmod(-5, -2) === -2);
}

// --- 4. scope --------------------------------------------------------------------------------------------------------
{
    say("4. SCOPE.");
    const src = readFileSync(new URL("./limiterNonUniform.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("refineNonUniform gives every subcell its parent's width divided by the ratio", (() => {
        const { h } = interfaceWidths({ nCoarse: 4, nFine: 8, ratio: 2 });
        const r = refineNonUniform(analyticCells(F, h), h, 2, "slope");
        return r.h[0] === 0.5 && r.h[r.h.length - 1] === 0.25;
    })());
    say("   NOT CLAIMED: that the naive spelling is present anywhere in this tree. IT IS A SHAPE, MEASURED, and no");
    say("   file here is accused of it -- physics/em/gridRefine.mjs uses no limiter at all and physics/em/regrid.mjs");
    say("   and remap2d.mjs are uniform by construction. NOT TESTED: TRIANGLES, which is still the case v3635's");
    say("   scope note names and which this round does NOT close -- a triangle's vertex offsets are not a width");
    say("   ratio and the argument in section 1 does not transfer to them.");
    say("   NOT DONE: a smoothly graded mesh (this is one abrupt jump), and the same question for the SECOND");
    say("   derivative, where the naive spelling's error would enter at a different order.");
}

console.log("limiterNonUniform-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
