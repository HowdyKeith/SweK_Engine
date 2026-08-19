// WebGLEngine/physics/tomography/ambiguity-selfcheck.mjs -- v3612
//
// Run: node physics/tomography/ambiguity-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/tomography/ambiguity.mjs -- the exact ghost, the binary pair, and the score that cannot
// separate them.
//
// THE CHECK THIS FILE EXISTS FOR is the OFF-DIRECTION CONTROL. "The line sums are zero" is a claim about
// absence and this tree requires an absence to be shown failing: the ZERO FUNCTION would satisfy it
// trivially, so every zero row is paired with a NONZERO reading along a direction the ghost was not built
// for. Without that column the whole table proves nothing.
//
// AND THE SINOGRAM IDENTITY IS ASSERTED AS EXACT ZERO RATHER THAN A TOLERANCE, because it is: the ghost is
// integer and the two images are 0/1, so their column and row sums agree bit for bit. A tolerance here would
// be hiding the strength of the result.
import {
    ghost, lineSums, worstLineSum, ghostBox, ghostTable, DIR_SEQUENCE, blocks, binaryPair, pixelsDiffering,
    sinogramGap, scoreAgainstBoth, LATTICE_ANGLES, PLUS_DIAGONALS, PAIR, MEASURED_V3612, reportLines,
} from "./ambiguity.mjs";
import { radon, phantomField, analyticRadon } from "./ct.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE GHOST IS EXACT, AND IT IS NOT THE ZERO FUNCTION ------------------------------------------------------
{
    const rows = ghostTable();
    ok("every ghost's line sums are EXACTLY zero along its own directions", rows.every((r) => r.own === 0),
       rows.map((r) => r.n + "d:" + r.own).join(" ") + " -- integer arithmetic, so no tolerance enters");
    ok("!! ...AND NONZERO along a direction it was not built for", rows.every((r) => r.off > 0),
       "off-direction (3,1): " + rows.map((r) => r.off).join(" ") +
       " -- WITHOUT THIS THE ZEROS PROVE NOTHING, because the zero function satisfies them all");
    ok("...and the ghost is not empty and grows with the direction count", rows.every((r) => r.cells >= 4) &&
       rows[rows.length - 1].w >= rows[0].w,
       rows.map((r) => r.n + "d " + r.cells + " cells " + r.w + "x" + r.h).join(", "));
    ok("the coefficients are INTEGERS", [...ghost(DIR_SEQUENCE.slice(0, 4)).values()].every(Number.isInteger),
       "so 'zero' means zero rather than 'below a threshold somebody chose'");
    // Driven, not argued: the line-sum grouping must actually separate lines.
    const g = ghost([[1, 0], [0, 1]]);
    ok("POSITIVE CONTROL: the line-sum grouping really groups", lineSums(g, [1, 0]).size === 2 && lineSums(g, [3, 1]).size === 4,
       "2 lines along (1,0) and 4 along (3,1) over a 2x2 support -- a grouping that returned one bucket " +
       "would make every sum zero by construction");
}

// ---- 2. THE PAIR IS BINARY AND GENUINELY DIFFERENT ----------------------------------------------------------------
{
    const { a, c } = binaryPair();
    ok("both members take only the values 0 and 1", [...a, ...c].every((v) => v === 0 || v === 1),
       "so a PERFECT DISCRETE MATERIAL PRIOR is satisfied by each -- the prior cannot break this tie");
    const d = pixelsDiffering(a, c);
    ok("!! ...and they are genuinely different, not a rounding apart", d === 4 * PAIR.block * PAIR.block,
       d + " of " + (PAIR.N * PAIR.N) + " pixels (" + (100 * d / (PAIR.N * PAIR.N)).toFixed(1) +
       "%) -- four blocks of " + PAIR.block + "x" + PAIR.block + ", DERIVED from the fixture rather than typed");
    ok("...and neither is empty", a.some((v) => v > 0) && c.some((v) => v > 0));
}

// ---- 3. THE IDENTITY: EXACTLY THE SAME PROJECTIONS, THROUGH THE SHIPPED FORWARD MODEL --------------------------------
{
    const g1 = sinogramGap(LATTICE_ANGLES);
    ok("!! TWO DIFFERENT BINARY IMAGES HAVE EXACTLY IDENTICAL PROJECTIONS at the two lattice directions",
       g1.worst === 0, "worst |gap| " + g1.worst.toExponential(3) + " against a peak of " + g1.peak.toFixed(3) +
       " -- EXACT ZERO, asserted as zero because it IS zero and a tolerance would hide that");
    ok("...and it is the SHIPPED radon() that says so, not a re-implementation here",
       typeof radon === "function" && g1.peak > 0,
       "the forward model under test is the one the ct device uses");
    const g2 = sinogramGap(PLUS_DIAGONALS);
    ok("!! POSITIVE CONTROL: adding 45 and 135 SEPARATES THEM COMPLETELY", g2.relative > 0.9,
       "relative gap " + g2.relative.toExponential(3) + " -- so the identity above is a property of the ANGLE " +
       "SET and not an artefact of the fixture, and 'more angles' is not the lever, THE RIGHT ANGLE is");
    ok("...so the ambiguity is not simply 'too few angles'", g1.angles === 2 && g2.angles === 4 && g2.relative > g1.relative,
       "two angles ambiguous, four not -- but it is WHICH four, and the ghost names them");
}

// ---- 4. THE SCORE CANNOT SEPARATE THE TWO CLAIMS, SHOWN RATHER THAN ARGUED ------------------------------------------
{
    // MACHINE ZERO, NOT EXACT EQUALITY, AND THE DIFFERENCE IS WORTH STATING. My first version demanded
    // s.vsA === s.vsC and it failed by ONE ULP: the two scores are 0.238720109165946 apart by 8.327e-17. The
    // projections are identical, so the reconstruction is the same object and the two correlations agree to
    // round-off -- but a correlation is a sum of products and the summation order differs, so bit-equality was
    // the wrong claim. Asserted against the ULP of the value, and beside the separating case as a RATIO.
    const s = scoreAgainstBoth(), sep0 = scoreAgainstBoth(PLUS_DIAGONALS);
    const gap = Math.abs(s.vsA - s.vsC), sepGap = Math.abs(sep0.vsA - sep0.vsC);
    ok("!! FBP SCORES IDENTICALLY AGAINST BOTH TRUTHS, TO MACHINE ZERO", gap <= 4 * Math.abs(s.vsA) * Number.EPSILON,
       s.vsA.toFixed(15) + " and " + s.vsC.toFixed(15) + ", apart by " + gap.toExponential(3) +
       " -- so a falling fbpCorr is TWO THINGS WEARING ONE LABEL: 'FBP is doing badly' and 'no method could " +
       "do better' read the same on this number");
    ok("!! ...and the separating angle set moves it " + (sepGap / gap).toExponential(2) + " times further apart",
       sepGap / gap > 1e12, "ambiguous gap " + gap.toExponential(3) + " against separating gap " +
       sepGap.toExponential(3) + " -- A COMPARISON, not a threshold I chose");
    ok("...and the reconstruction is a poor match to EITHER, which is the honest reading", s.vsA < 0.5,
       "corr " + s.vsA.toFixed(6) + " -- it is not that FBP picked the wrong one, it is that the data does not " +
       "contain the answer");
    const sep = scoreAgainstBoth(PLUS_DIAGONALS);
    ok("POSITIVE CONTROL: with the separating angles the score DOES distinguish them", sep.vsA !== sep.vsC && sep.vsA > sep.vsC,
       "vsA " + sep.vsA.toFixed(6) + " vs vsC " + sep.vsC.toFixed(6) +
       " -- so the tie above is a reading and not a broken scorer");
}

// ---- 5. WHAT IS NOT CLAIMED, AND THE ANTIDOTE ------------------------------------------------------------------------
//
// ANTIDOTE: if somebody ever exhibits a ghost for the EQUALLY-SPACED angleSet(n), section 3's scoping note
// goes stale -- REPLACE IT WITH THAT CONSTRUCTION rather than widening the claim by assertion, because the
// whole strength here is that the null space is EXHIBITED and not argued. And if a second reconstruction
// method is ever added to the ct device, section 4's tie must be re-run against IT: the claim is about what
// projections contain, so a new method must tie too, and if it does not, the ghost was not what it seemed.
{
    ok("the scoping is stated rather than glossed", (MEASURED_V3612.notClaimed || "").includes("LATTICE directions"),
       "angleSet(n) = pi*i/n is not a lattice set in general, so the exact construction is scoped to sets " +
       "where the null space can be EXHIBITED");
    ok("no discrete tomography is built", (MEASURED_V3612.notClaimed || "").includes("greedyMesh3d"),
       "no optimiser, no material table, no consumer -- the round GRADES a claim about ambiguity and adopts nothing");
    ok("the tree's own analytic key is still available beside this", typeof analyticRadon === "function" &&
       typeof phantomField === "function",
       "ct.js's closed-form Radon of an ellipse remains the forward model's answer key; this round adds the " +
       "INVERSE question, which that key cannot answer");
    const rep = reportLines();
    ok("the report renders and names the prior", rep.length > 15 && rep.join("\n").includes("DISCRETE MATERIAL PRIOR"),
       rep.length + " lines");
}

console.log(fails ? "\nambiguity-selfcheck: " + fails + " FAILED" : "\nambiguity-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
