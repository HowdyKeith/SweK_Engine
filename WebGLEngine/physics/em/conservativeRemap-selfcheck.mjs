// WebGLEngine/physics/em/conservativeRemap-selfcheck.mjs -- v3634
//
// Run: node physics/em/conservativeRemap-selfcheck.mjs
//
// v3633 ENDED BY SAYING A SECOND-ORDER CONSERVATIVE REMAP EXISTS AND IS WHAT TO REACH FOR. IT DOES, IT IS BUILT,
// AND THE TRADE IT WAS SUPPOSED TO SETTLE DOES NOT VANISH -- IT MOVES TO THE PEAK OF THE WAVE.
//
// *** SECTION 1 IS THE CHECK THAT CANNOT FAIL, DECLARED IN ADVANCE THIS TIME. v3633 discovered mid-round that
// its refine/coarsen pair was a left inverse and the round trip proved nothing. Here the round trip is the
// identity FOR ANY SLOPE WHATSOEVER, because the subcell offsets are symmetric about the cell centre and the
// slope term cancels in the mean -- so it is written down as trivial BEFORE it is measured, not after. ***
//
// AND THE FORMULATION CHANGED, WHICH IS NOT COSMETIC: v3633 moved NODE VALUES, these move CELL AVERAGES.
// "Conservative" means a preserved sum for the first and THE INTEGRAL OF THE FIELD for the second, which is what
// a finite-volume scheme actually evolves. The two sets of numbers are NOT put in one table.

import { readFileSync } from "node:fs";
import {
    minmod, slopes, refineCells, coarsenCells, cellIntegral, analyticCells,
    refineAccuracy, newExtrema, stepCells,
} from "./conservativeRemap.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const MODES = ["none", "centered", "minmod"];
const gauss = (x) => Math.exp(-Math.pow((x - 100) / 20, 2));

// --- 1. conservation, and the trivial round trip -------------------------------------------------------------
{
    say("1. CONSERVATION IS EXACT FOR ANY SLOPE, AND THAT IS ALSO WHY THE ROUND TRIP PROVES NOTHING.");
    const u = analyticCells(gauss, 201, {});
    for (const mode of MODES) {
        const f = refineCells(u, 2, mode);
        const drift = Math.abs(cellIntegral(f, 0.5) - cellIntegral(u, 1)) / Math.abs(cellIntegral(u, 1));
        const back = coarsenCells(f, 2);
        let worst = 0; for (let i = 0; i < u.length; i++) worst = Math.max(worst, Math.abs(back[i] - u[i]));
        say("     " + mode.padEnd(9) + " integral drift " + drift.toExponential(3) + "   round trip " + worst.toExponential(3));
    }
    ok("all three slopes conserve the cell integral to round-off", MODES.every((mode) => {
        const f = refineCells(u, 2, mode);
        return Math.abs(cellIntegral(f, 0.5) - cellIntegral(u, 1)) / Math.abs(cellIntegral(u, 1)) < 1e-14;
    }), "the subcell offsets are symmetric about the cell centre, so the slope term cancels in the mean -- CONSERVATION IS STRUCTURAL, not tuned");
    ok("!! and the round trip is therefore the IDENTITY for all three, which discriminates nothing",
        MODES.every((mode) => {
            const back = coarsenCells(refineCells(u, 2, mode), 2);
            let w = 0; for (let i = 0; i < u.length; i++) w = Math.max(w, Math.abs(back[i] - u[i]));
            return w < 1e-15;
        }), "SAID IN ADVANCE THIS TIME. v3633 found the same shape mid-round and had to relabel a result as a non-result");
    ok("the module states it too, so the next reader is not left to rediscover it", (() => {
        const src = readFileSync(new URL("./conservativeRemap.mjs", import.meta.url), "utf8");
        return /THE ROUND TRIP IS AGAIN THE IDENTITY BY\n\/\/ CONSTRUCTION/.test(src) || /IDENTITY BY CONSTRUCTION/.test(src);
    })());
}

// --- 2. THE ORDERS, and one of them corrected me ---------------------------------------------------------------
{
    say("2. GRADED AGAINST ANALYTIC CELL AVERAGES ON THE FINE GRID -- a truth no operator here is told.");
    const measured = {};
    for (const mode of MODES) {
        const errs = [4, 2, 1, 0.5].map((h) => refineAccuracy(gauss, Math.round(200 / h), 2, { h, mode }).relative);
        const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
        measured[mode] = { errs, orders, order: orders[orders.length - 1] };
        say("     " + mode.padEnd(9) + errs.map((e) => e.toExponential(2)).join("  ") + "   orders " + orders.map((o) => o.toFixed(2)).join(", "));
    }
    ok("piecewise constant is FIRST order", Math.abs(measured.none.order - 1) < 0.1);
    ok("!! the UNLIMITED slope is THIRD order, and I had predicted second", Math.abs(measured.centered.order - 3) < 0.15,
        "measured " + measured.centered.order.toFixed(3) + ". A centred-slope reconstruction of CELL AVERAGES is third " +
        "order in the average, because the leading error term is symmetric about the cell centre and cancels -- a " +
        "standard finite-volume result I did not anticipate, AND THE MEASUREMENT IS WHAT CORRECTED THE PREDICTION. " +
        "Had I asserted 'second order' with a tolerance wide enough to pass, the round would have shipped a true " +
        "check hiding a wrong belief");
    ok("!! and the LIMITED slope is SECOND -- limiting costs a full order", Math.abs(measured.minmod.order - 2) < 0.1,
        "measured " + measured.minmod.order.toFixed(3) + ". SECTION 4 EXPLAINS WHY, AND IT IS NOT THE REASON I " +
        "FIRST WROTE HERE: I had said a limiter acts only at extrema so the max norm must be picking up the peak. " +
        "IT IS NOT LOCAL AT ALL -- see section 4");
    ok("the three are genuinely ordered none < minmod < centered in accuracy",
        measured.none.errs[3] > measured.minmod.errs[3] && measured.minmod.errs[3] > measured.centered.errs[3]);
}

// --- 3. WHAT THE THIRD ORDER COSTS -------------------------------------------------------------------------------
{
    say("3. NEW EXTREMA: values outside the range of the data they came from. In an EM grid that is A SOURCE.");
    const step = stepCells(41, 20);
    const rows = MODES.map((mode) => ({ mode, step: newExtrema(step, 4, mode), smooth: newExtrema(analyticCells(gauss, 201, {}), 4, mode) }));
    for (const r of rows) say("     " + r.mode.padEnd(9) + " on a STEP: " + String(r.step.count).padStart(3) + " new extrema, worst " +
        (100 * r.step.relative).toFixed(4) + "% of range   |   on a SMOOTH PEAK: " + String(r.smooth.count).padStart(3) +
        ", worst " + (100 * r.smooth.relative).toFixed(6) + "%");
    ok("!! the unlimited slope INVENTS field, by 18.75% of the range on a step", rows[1].step.count > 0 && rows[1].step.relative > 0.15,
        "not a rounding error and not a tolerance question -- it is a value the data never contained");
    ok("!! and it does so even on a SMOOTH gaussian peak, where nothing is discontinuous", rows[1].smooth.count > 0,
        "worst " + (100 * rows[1].smooth.relative).toFixed(6) + "% -- so 'only near shocks' would have been false here");
    ok("both the constant and the limited slope create NONE, exactly", rows[0].step.count === 0 && rows[2].step.count === 0 &&
        rows[0].smooth.count === 0 && rows[2].smooth.count === 0,
        "an exact boolean, no tolerance chosen -- and it is what a limiter is FOR");
    say("   *** SO THE v3633 TRADE IS RELOCATED, NOT DEFEATED: order 3 WITH overshoot, order 2 WITHOUT, or order 1");
    say("   without. YOU CANNOT HAVE THREE AND NO OVERSHOOT, and the place you pay is the peak of the wave --");
    say("   which in an EM grid is the part of the field anybody cared about refining around. Godunov's barrier");
    say("   showing up in a remap operator. THAT IS THE HONEST END OF THIS THREAD RATHER THAN A WIN. ***");
}

// --- 4. the limiter itself ----------------------------------------------------------------------------------------
{
    say("4. minmod, checked directly rather than through a field.");
    ok("it returns zero when the differences disagree in sign -- the definition of an extremum",
        minmod(1, -1) === 0 && minmod(-2, 3) === 0 && minmod(0, 5) === 0);
    ok("and the smaller magnitude when they agree", minmod(2, 5) === 2 && minmod(-5, -2) === -2 && minmod(3, 3) === 3);
    const u = analyticCells(gauss, 201, {});
    const sc = slopes(u, "centered"), sm = slopes(u, "minmod");
    let differs = 0, same = 0, bigDiff = 0;
    for (let i = 1; i < u.length - 1; i++) {
        if (sc[i] !== sm[i]) { differs++; if (Math.abs(sm[i] - sc[i]) > 0.1 * Math.abs(sc[i])) bigDiff++; } else same++;
    }
    // *** MY BELIEF WENT RED HERE AND IT WAS THE USEFUL RED OF THE ROUND. I wrote "it clips only a few cells" and
    // it clips 199 of 201. minmod returns the SMALLER MAGNITUDE of the two one-sided differences; the centred
    // slope is their AVERAGE. Those coincide ONLY where the two differences are exactly equal, which on a smooth
    // curve is almost nowhere. SO minmod IS NOT A LIMITER THAT ACTS AT EXTREMA AND LEAVES THE REST ALONE -- against
    // a centred slope it is a DIFFERENT, SYSTEMATICALLY SMALLER SLOPE NEARLY EVERYWHERE, and THAT is why it costs a
    // full order globally. My "local action, global order" story in section 2 was wrong and is retracted there. ***
    say("     minmod differs from the centred slope in " + differs + " of " + (u.length - 2) + " interior cells (" +
        same + " identical), and by more than 10% in " + bigDiff);
    ok("!! minmod is NOT local: it differs from the centred slope almost everywhere", differs > 0.9 * (u.length - 2),
        "it takes the SMALLER of the two one-sided differences where centred takes their AVERAGE, and those agree " +
        "only where the differences are exactly equal. THE ORDER LOSS IS UNIFORM, NOT A PEAK EFFECT -- which is the " +
        "opposite of what I asserted before measuring it");
    ok("the ends carry a zero slope and the accuracy window excludes them, stated not hidden", (() => {
        const src = readFileSync(new URL("./conservativeRemap.mjs", import.meta.url), "utf8");
        return sc[0] === 0 && sc[u.length - 1] === 0 && /the exclusion is STATED/.test(src);
    })(), "a boundary reconstruction is its own problem with its own literature; borrowing the interior's numbers for it would be a claim about code that does not exist");
}

// --- 5. scope ------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./conservativeRemap.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("!! these numbers are NOT comparable with v3633's, and the module says why", /YOU CANNOT COMPARE THE TWO SETS OF NUMBERS DIRECTLY/.test(src),
        "v3633 moved NODE VALUES and this moves CELL AVERAGES -- 'conservative' names a preserved sum there and " +
        "THE INTEGRAL OF THE FIELD here. Putting them in one table would be the two-things-wearing-one-label shape");
    say("   NOT DONE: applying any of this to a running solver -- still the honest unit is the operator alone.");
    say("   NOT DONE: higher-order reconstructions (PPM would raise the unlimited order again and buy no");
    say("   monotonicity), other limiters (van Leer, superbee -- they trade sharpness against clipping and the");
    say("   ranking depends on the field, so a ranking here would be a claim about my fixture), and 2D, where a");
    say("   slope is a GRADIENT and the limiter has to choose a direction. STILL REFUSED: an adaptive grid.");
}

console.log("conservativeRemap-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
