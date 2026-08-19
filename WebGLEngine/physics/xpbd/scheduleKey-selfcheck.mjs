// WebGLEngine/physics/xpbd/scheduleKey-selfcheck.mjs -- v3600
// ---------------------------------------------------------------------------------------------------------------
// THE CLAIM UNDER TEST IS "THE CONVERGED RESULT MUST NOT DEPEND ON THE PARALLEL SCHEDULE", AND THE POINT OF
// THIS GATE IS THAT THE RESIDUAL ANYBODY WOULD TEST IT WITH IS UNDER-DETERMINED.
//
// Section 2 is the round and it DRIVES the blindness rather than asserting it: the naive key -- drive
// C + aTilde*lambda to zero under both schedules and compare -- is reconstructed here exactly as somebody who
// stopped at the obvious residual would have written it, and it PASSES both schedules at 1.110e-16 while they
// sit 8.496e-12 apart. A blindness nobody has watched happen is a story.
//
// Section 4 is the discriminator: round-off scales as displacement^1 and this scales as ^4, on two fixtures.
//
// Section 6 is entirely a correction to my own first measurement, kept because it is the most useful thing
// here: a timeout reported as a failure, twice, in the function whose job is to report a boundary.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scene, runSchedule, constraintResidual, momentumResidual, maxDiff, scheduleGap,
         colourOrderGap, gapExponent, convergenceBoundary, divergenceBoundary, relaxationBracket,
         convergenceTrace, COMPLIANT, RIGID, MEASURED_V3600 } from "./scheduleKey.mjs";

let pass = 0, fail = 0;
const ok = (n, c, note = "") => { if (c) { pass++; console.log("  ok   " + n + (note ? "  -- " + note : "")); }
                                  else { fail++; console.log("  FAIL " + n + (note ? "  -- " + note : "")); } };
const section = (n) => console.log("\n== " + n + " ==");

const sc = scene(5, 5, COMPLIANT);
const rg = scene(5, 5, RIGID);
const sc2 = scene(6, 4, COMPLIANT);
const g = scheduleGap(sc);

section("1. THE COMPARATOR IS PROVEN BEFORE ANY GAP IS BELIEVED");
{
    // A comparator that reported differences it invented would make every number below meaningless.
    const a = runSchedule(sc, 400, "colour"), b = runSchedule(sc, 400, "colour");
    ok("the same schedule twice is BIT-IDENTICAL (positive control)", maxDiff(a.pred, b.pred) === 0,
       "gap exactly " + maxDiff(a.pred, b.pred));
    const j1 = runSchedule(sc, 400, "jacobi"), j2 = runSchedule(sc, 400, "jacobi");
    ok("the same jacobi schedule twice is BIT-IDENTICAL", maxDiff(j1.pred, j2.pred) === 0);
    ok("and the comparator CAN see a difference when there is one", maxDiff(a.pred, j1.pred) > 0);
}

section("2. THE OBVIOUS RESIDUAL IS UNDER-DETERMINED, AND THE NAIVE KEY IS DRIVEN RATHER THAN DESCRIBED");
{
    const eqs = sc.cons.length, unk = sc.freeDof + sc.cons.length;
    ok("the constraint residual is " + eqs + " equations in " + unk + " unknowns -- it cannot pin a point",
       unk > eqs, "derived from the fixture, not typed");

    // THE NAIVE KEY, reconstructed exactly as somebody stopping at the obvious residual would write it.
    const naivePasses = g.constraintColour < 1e-12 && g.constraintJacobi < 1e-12;
    ok("!! the NAIVE key PASSES both schedules", naivePasses,
       "colour " + g.constraintColour.toExponential(3) + ", jacobi " + g.constraintJacobi.toExponential(3));
    ok("!! ...while the two states disagree by four orders MORE than the number it printed",
       g.posGap > 1e4 * Math.max(g.constraintColour, g.constraintJacobi),
       "gap " + g.posGap.toExponential(3));

    // The pair is what satisfies it, not the position -- which is WHY the residual is blind.
    ok("x_colour graded against lambda_jacobi is NOT machine zero: the PAIR satisfies it",
       g.crossPair > 1e3 * g.constraintColour, "crossPair " + g.crossPair.toExponential(3));
}

section("3. THE HALF THAT PINS THE ANSWER, WHICH NOTHING IN THIS TREE HAD COMPUTED");
{
    ok("the momentum residual is orders ABOVE the constraint residual under colouring",
       g.momentumColour > 1e4 * g.constraintColour, g.momentumColour.toExponential(3));
    ok("...and under jacobi", g.momentumJacobi > 1e4 * g.constraintJacobi, g.momentumJacobi.toExponential(3));
    ok("the two schedules DISAGREE on it", Math.abs(g.momentumColour - g.momentumJacobi) > 1e-12,
       g.momentumColour.toExponential(3) + " vs " + g.momentumJacobi.toExponential(3));
    ok("!! and the position gap is the SIZE of the momentum residual, not of the constraint residual",
       g.posGap > 0.1 * Math.min(g.momentumColour, g.momentumJacobi) &&
       g.posGap < 10 * Math.max(g.momentumColour, g.momentumJacobi),
       "gap " + g.posGap.toExponential(3) + " against momentum residuals " +
       g.momentumJacobi.toExponential(3) + ".." + g.momentumColour.toExponential(3));
    // A momentum residual of zero would mean the iteration reached the true KKT point; neither does.
    ok("neither schedule reaches the KKT point (both momentum residuals are nonzero)",
       g.momentumColour > 0 && g.momentumJacobi > 0);
}

section("4. THE GAP IS STRUCTURAL: ROUND-OFF WOULD SCALE AS ^1 AND THIS SCALES AS ^4");
{
    const rows = gapExponent(sc).filter((r) => r.exponent !== null && r.moved > 1e-3);
    ok("the local exponent lands on 4 across the sweep", rows.every((r) => Math.abs(r.exponent - 4) < 0.05),
       rows.map((r) => r.exponent.toFixed(3)).join(" / "));
    ok("!! and it is NOWHERE NEAR 1, which is what a floating-point account would give",
       rows.every((r) => r.exponent > 3), "round-off would read " + MEASURED_V3600.roundOffWouldBe);
    const rows2 = gapExponent(sc2, [-5, -10, -20, -50]).filter((r) => r.exponent !== null);
    ok("the exponent holds on a SECOND fixture (6x4), so it is not one cloth",
       rows2.every((r) => Math.abs(r.exponent - 4) < 0.05), rows2.map((r) => r.exponent.toFixed(3)).join(" / "));

    // A gap still shrinking with iterations would be incomplete convergence rather than a fixed-point property.
    const gaps = [200, 1000, 4000].map((it) => scheduleGap(sc, it).posGap);
    ok("the gap PLATEAUS in iteration count -- a fixed-point property, not incomplete convergence",
       Math.abs(gaps[2] - gaps[0]) / gaps[0] < 0.01, gaps.map((x) => x.toExponential(3)).join(" -> "));
}

section("5. COLOURING IS NOT ONE SCHEDULE, WHICH REFRAMES THE QUESTION");
{
    const co = colourOrderGap(sc);
    ok("reversing the colour order still converges", co.residualFwd < 1e-12 && co.residualRev < 1e-12,
       co.residualFwd.toExponential(3) + " / " + co.residualRev.toExponential(3));
    ok("!! but the two COLOURINGS disagree by MORE than colouring disagrees with jacobi",
       co.posGap > g.posGap,
       "colour-vs-colour " + co.posGap.toExponential(3) + " against colour-vs-jacobi " + g.posGap.toExponential(3));
    ok("...so a two-way comparison would have installed colouring as a reference it is not",
       MEASURED_V3600.colourOrderGapExceedsSchedule === true);
}

section("6. THE BOUNDARY IS TWO QUANTITIES -- AND THIS SECTION IS A CORRECTION TO MY OWN MEASUREMENT");
{
    // SLOW IS NOT DIVERGENT. The first bisection called the rigid fixture unstable; it is slow.
    const tr = convergenceTrace(rg, "jacobi", [400, 2000]);
    ok("!! the rigid fixture is SLOW, not divergent: the residual FALLS with iterations",
       tr[1].residual < tr[0].residual / 1e5,
       tr.map((t) => t.iters + ":" + t.residual.toExponential(3)).join("  "));
    ok("...and colouring reaches machine zero on it inside the budget that called jacobi unstable",
       convergenceTrace(rg, "colour", [400])[0].residual < 1e-14);

    // THE CONVERGENCE BISECTION IS A RATE, AND THE EVIDENCE IS THAT IT MOVES WITH THE BUDGET.
    const bs = [400, 1000, 4000].map((it) => convergenceBoundary(sc, { iters: it }));
    ok("!! the convergence bisection MOVES with the iteration budget -- so it is a RATE, not a boundary",
       bs[0].boundary < bs[1].boundary && bs[1].boundary < bs[2].boundary,
       bs.map((b) => b.boundary.toFixed(6)).join(" -> "));
    ok("a stability boundary would not move with the iteration count", bs[2].boundary - bs[0].boundary > 0.1);
    ok("and a budget too short to reach tol reports budgetBound rather than a number",
       convergenceBoundary(sc, { iters: 200 }).budgetBound === true,
       "which is exactly what the first version of this function got wrong");

    // THE TWO BISECTIONS BRACKET IT FROM OPPOSITE SIDES, AND THE BRACKET NARROWS.
    const brs = [400, 1000, 4000].map((it) => relaxationBracket(sc, { iters: it }));
    ok("the divergence bisection (on FINITENESS, no tolerance) sits ABOVE the convergence one at every budget",
       brs.every((b) => b.upper > b.lower), brs.map((b) => "[" + b.lower.toFixed(3) + "," + b.upper.toFixed(3) + "]").join(" "));
    ok("!! and the bracket NARROWS monotonically with the budget -- the two ends approach the real boundary",
       (brs[0].upper - brs[0].lower) > (brs[1].upper - brs[1].lower) &&
       (brs[1].upper - brs[1].lower) > (brs[2].upper - brs[2].lower),
       brs.map((b) => (b.upper - b.lower).toFixed(3)).join(" > "));
    ok("16-GPUCloth.py's shipped 0.2 sits below both ends on this cloth",
       MEASURED_V3600.shippedJacobiScale < brs[2].lower);
    ok("the correction is on the record rather than tidied away",
       /BUDGET WEARING A STABILITY VERDICT/.test(MEASURED_V3600.myOwnDefect));
}

section("7. WHAT IS NOT CLAIMED -- ASSERTED AS AN ABSENT MECHANISM, NOT AN ABSENT MENTION");
{
    const here = dirname(fileURLToPath(import.meta.url));
    const loop = readFileSync(join(here, "clothLoop.js"), "utf8");
    ok("clothLoop.js does NOT import this instrument -- the shipped path is untouched",
       !/from\s+["'][^"']*scheduleKey/.test(loop));
    ok("and no jacobi sweep exists in the shipped loop", !/\bjacobi/i.test(loop));
    ok("nothing is vendored and no claim is made about anybody else's code",
       /NOT a port and NOT a claim about matthias-research/.test(MEASURED_V3600.whatThisIsNot));
    ok("no device, no baseline row", /No device, no baseline row/.test(MEASURED_V3600.whatThisIsNot));
    // ANTIDOTE (v3196): if a jacobi schedule is ever wired into clothLoop this line goes RED and must be
    // rewritten to assert the MOMENTUM residual of the shipped path -- not weakened, not deleted.
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
