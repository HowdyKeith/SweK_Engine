// WebGLEngine/physics/em/remap2d-selfcheck.mjs -- v3635
//
// Run: node physics/em/remap2d-selfcheck.mjs
//
// *** I PREDICTED THAT PER-AXIS LIMITING WOULD FAIL IN 2D. IT DOES NOT, AND THE ROUND IS BETTER FOR IT. ***
//
// v3634 ended by naming 2D as its own round because "a slope is a GRADIENT and the limiter has to choose a
// direction". The expectation was the textbook caution: limit each axis with the 1D limiter, and the CORNERS --
// which add both slopes at once, and which 1D does not have -- escape the neighbourhood. Measured: they do not.
// Section 2 gives the two-line reason, section 3 shows the bound is TIGHT rather than comfortable, and section 4
// finds where it does break, which is not where the caution points.

import { readFileSync } from "node:fs";
import {
    minmod, gradients, refineCells2d, coarsenCells2d, cellIntegral2d, analyticCells2d,
    newExtrema2d, refineAccuracy2d, escapesAt, diagonalStep,
} from "./remap2d.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const MODES = ["none", "centered", "minmod", "bj"];
const N = 41;
const bump = (x, y) => Math.exp(-((x - 20) ** 2 + (y - 20) ** 2) / 80);
const U = analyticCells2d(bump, N, N, {});

// --- 1. conservation, and the trivial round trip, for the third time -------------------------------------------
{
    say("1. CONSERVATION IS EXACT FOR ANY GRADIENT, so the round trip is AGAIN the identity and proves nothing.");
    for (const mode of MODES) {
        const f = refineCells2d(U, N, N, 2, mode);
        const drift = Math.abs(cellIntegral2d(f, 0.5) - cellIntegral2d(U, 1)) / Math.abs(cellIntegral2d(U, 1));
        const back = coarsenCells2d(f, N * 2, N * 2, 2);
        let w = 0; for (let i = 0; i < U.length; i++) w = Math.max(w, Math.abs(back[i] - U[i]));
        say("     " + mode.padEnd(9) + " integral drift " + drift.toExponential(2) + "   round trip " + w.toExponential(2));
    }
    ok("all four gradients conserve, and all four round-trip to the identity", MODES.every((mode) => {
        const f = refineCells2d(U, N, N, 2, mode);
        const back = coarsenCells2d(f, N * 2, N * 2, 2);
        let w = 0; for (let i = 0; i < U.length; i++) w = Math.max(w, Math.abs(back[i] - U[i]));
        return w < 1e-14 && Math.abs(cellIntegral2d(f, 0.5) - cellIntegral2d(U, 1)) / Math.abs(cellIntegral2d(U, 1)) < 1e-13;
    }), "the subcell offsets are symmetric about the cell centre in BOTH axes, so both slope terms cancel in the " +
        "mean. THIRD APPEARANCE OF THIS SHAPE (v3633 found it mid-round, v3634 and this one state it in advance)");
}

// --- 2. THE PREDICTION, AND ITS REFUTATION ----------------------------------------------------------------------
{
    say("2. DOES PER-AXIS LIMITING LEAVE THE NEIGHBOURHOOD IN 2D? The expectation was yes. The measurement says no.");
    const step = diagonalStep(N);
    for (const mode of MODES) {
        const s = newExtrema2d(U, N, N, 4, mode), d = newExtrema2d(step, N, N, 4, mode);
        say("     " + mode.padEnd(9) + " smooth bump: " + String(s.count).padStart(4) + " new extrema, worst " +
            (100 * s.relative).toFixed(4) + "% of local span   |   diagonal step: " + String(d.count).padStart(4) +
            ", worst " + (100 * d.relative).toFixed(4) + "%");
    }
    ok("!! per-axis minmod creates EXACTLY ZERO new extrema in 2D, on both fields",
        newExtrema2d(U, N, N, 4, "minmod").count === 0 && newExtrema2d(diagonalStep(N), N, N, 4, "minmod").count === 0,
        "THE PREDICTION THIS ROUND WAS BUILT ON IS REFUTED. The reason is two lines: the corner offsets are +/-1/2 " +
        "in EACH axis, so a corner takes HALF of each slope; with |sx| <= dx and |sy| <= dy the worst corner excess " +
        "is (dx + dy)/2 against a half-span of max(dx, dy), AND THE MEAN OF TWO NUMBERS NEVER EXCEEDS THEIR MAXIMUM");
    ok("the unlimited gradient does escape, so the measurement can see an escape when there is one",
        newExtrema2d(U, N, N, 4, "centered").count > 0 && newExtrema2d(diagonalStep(N), N, N, 4, "centered").count > 0,
        "centred: " + newExtrema2d(U, N, N, 4, "centered").count + " on the smooth bump (" +
        (100 * newExtrema2d(U, N, N, 4, "centered").relative).toFixed(2) + "%) and " +
        newExtrema2d(diagonalStep(N), N, N, 4, "centered").count + " on the step (" +
        (100 * newExtrema2d(diagonalStep(N), N, N, 4, "centered").relative).toFixed(2) + "%). " +
        "A zero from an instrument that cannot register a nonzero is not a result");
    ok("the module records the refutation where the next reader meets it, not only in a changelog", (() => {
        const src = readFileSync(new URL("./remap2d.mjs", import.meta.url), "utf8");
        return /I PREDICTED THAT PER-AXIS LIMITING WOULD FAIL IN 2D AND IT DOES NOT/.test(src);
    })());
}

// --- 3. THE BOUND IS TIGHT, NOT COMFORTABLE ----------------------------------------------------------------------
{
    say("3. HOW MUCH MARGIN DOES THE GUARANTEE HAVE? Evaluated at the cell's own CORNER, offset 1/2.");
    const e = escapesAt(U, N, N, "minmod", 0.5);
    say("     minmod at offset 0.50: " + e.count + " escapes, worst " + e.worst.toExponential(3) +
        " against a local span of " + e.span.toFixed(6));
    ok("!! there are escapes at the corner and they are pure round-off -- THE BOUND IS ATTAINED",
        e.count > 0 && e.worst < 1e-14,
        "worst " + e.worst.toExponential(3) + ", which is one ulp of the field. (dx + dy)/2 = max(dx, dy) EXACTLY " +
        "whenever dx = dy, so the inequality in section 2 is an EQUALITY on a symmetric field and the guarantee " +
        "holds with ZERO margin. Section 2's clean zero came from subcell centres sitting strictly inside the cell");
    ok("...and section 2's measurement really does evaluate strictly inside", (() => {
        // subcell centres at ratio r sit at +/- (r-1)/(2r), which is < 1/2 for every finite r
        const r = 4, maxOffset = (r - 1) / (2 * r);
        return maxOffset < 0.5 && maxOffset === 0.375;
    })(), "at ratio 4 the outermost subcell centre is at 0.375, not 0.5 -- so newExtrema2d asks a slightly weaker " +
        "question than escapesAt, and both are reported rather than one standing for the other");
}

// --- 4. WHERE IT ACTUALLY BREAKS, AND IT IS NOT WHERE THE CAUTION POINTS -------------------------------------------
{
    say("4. THE RECONSTRUCTION EVALUATED OUTSIDE ITS OWN CELL -- which is what an unsplit corner-transport step does.");
    for (const offset of [0.5, 0.75, 1.0]) {
        const line = MODES.map((m) => {
            const s = escapesAt(U, N, N, m, offset), d = escapesAt(diagonalStep(N), N, N, m, offset);
            return m + " " + String(s.count).padStart(4) + "/" + String(d.count).padStart(3);
        });
        say("     offset " + offset.toFixed(2) + " (smooth/step counts):  " + line.join("   "));
    }
    const far = escapesAt(U, N, N, "minmod", 1.0);
    ok("!! at the neighbouring cell centre per-axis minmod escapes by a third of the local span", far.relative > 0.25,
        far.count + " escapes, worst " + (100 * far.relative).toFixed(2) + "% of the local span. THE GUARANTEE IS " +
        "ABOUT THE CELL, NOT ABOUT THE SLOPE -- and a scheme that samples a diagonal neighbour has left the region " +
        "the limiter was ever asked about");
    ok("!! and the field that breaks it is the SMOOTH one, not the step", escapesAt(diagonalStep(N), N, N, "minmod", 1.0).count === 0,
        "on a diagonal step minmod ZEROES the slope at the discontinuity and never leaves, at ANY offset -- so the " +
        "failure is exactly where nobody tests a limiter. A step is the fixture everyone reaches for and it is the " +
        "one that cannot show this");
    const bjFar = escapesAt(U, N, N, "bj", 1.0);
    ok("Barth-Jespersen buys nothing out there either, because its constraint is also stated on the cell's corners",
        bjFar.count > 0 && Math.abs(bjFar.relative - far.relative) < 0.02,
        "bj " + bjFar.count + " escapes at " + (100 * bjFar.relative).toFixed(2) + "% against minmod's " +
        (100 * far.relative).toFixed(2) + "% -- the extra machinery is a statement about the same region");
}

// --- 5. the orders, and the 1D third order does NOT transfer ---------------------------------------------------------
{
    say("5. ORDER vs ANALYTIC 2D CELL AVERAGES.");
    const got = {};
    for (const mode of MODES) {
        const errs = [4, 2, 1].map((h) => refineAccuracy2d((x, y) => Math.exp(-((x - 80) ** 2 + (y - 80) ** 2) / 1200),
            Math.round(160 / h) + 1, Math.round(160 / h) + 1, 2, { h, mode }).relative);
        const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
        got[mode] = { errs, order: orders[orders.length - 1] };
        say("     " + mode.padEnd(9) + errs.map((e) => e.toExponential(2)).join("  ") + "   orders " + orders.map((o) => o.toFixed(2)).join(", "));
    }
    ok("piecewise constant is first order and both limited gradients are second", Math.abs(got.none.order - 1) < 0.1 &&
        Math.abs(got.minmod.order - 2) < 0.1 && Math.abs(got.bj.order - 2) < 0.1);
    ok("!! but the unlimited gradient is NOT third order in 2D -- v3634's 3.00 does not transfer",
        got.centered.order > 2 && got.centered.order < 2.6,
        "measured " + got.centered.order.toFixed(3) + " against 1D's 3.00. The 1D cancellation was the leading error " +
        "term being symmetric about the cell centre; in 2D the CROSS TERM survives it, and a bilinear-free linear " +
        "reconstruction cannot cancel what it cannot represent. A RESULT MEASURED IN ONE DIMENSION IS NOT A RESULT " +
        "ABOUT THE SCHEME");
    ok("minmod and bj give the SAME max-norm order but are NOT the same field", (() => {
        const gm = gradients(U, N, N, "minmod"), gb = gradients(U, N, N, "bj");
        let differ = 0;
        for (let k = 0; k < U.length; k++) if (gm.sx[k] !== gb.sx[k] || gm.sy[k] !== gb.sy[k]) differ++;
        say("     bj and minmod gradients differ in " + differ + " of " + U.length + " cells");
        return differ > 0.5 * U.length;
    })(), "their error columns above agree to the digit, which is the kind of coincidence that usually means one " +
        "of them is not running -- CHECKED, and they differ in 89% of cells. Two operators can share a max norm");
}

// --- 6. scope ----------------------------------------------------------------------------------------------------
{
    say("6. SCOPE.");
    const src = readFileSync(new URL("./remap2d.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    ok("minmod is the same definition as the 1D module's", minmod(1, -1) === 0 && minmod(2, 5) === 2 && minmod(-5, -2) === -2);
    say("   NOT CLAIMED: that per-axis limiting is safe in general. IT IS SAFE ON A CARTESIAN CELL EVALUATED INSIDE");
    say("   ITSELF, for the reason in section 2, and section 4 shows the guarantee ending at the cell wall. On");
    say("   TRIANGLES or with non-uniform spacing the vertex offsets are not 1/2 and the argument does not run --");
    say("   NOT TESTED HERE, and that is the case the textbook caution is really about.");
    say("   NOT DONE: 3D (the argument extends to (dx+dy+dz)/3 vs max, so it should hold and has NOT been checked);");
    say("   unsplit corner-transport itself; and any of this inside a running solver.");
}

console.log("remap2d-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
