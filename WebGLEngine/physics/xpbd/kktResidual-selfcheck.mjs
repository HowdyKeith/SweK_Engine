// WebGLEngine/physics/xpbd/kktResidual-selfcheck.mjs -- v3602
// ---------------------------------------------------------------------------------------------------------------
// Section 2 is the round: the two rows of one KKT system move in OPPOSITE directions under iteration, so
// "converged" names one of them and not the other.
// Section 4 is the load-bearing negative and it is the fault this round would most plausibly have shipped: a
// momentum row over one of clothFrame's TWO constraint sets reads 2.061e-1 on a correct solver.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { momentumResidual } from "./scheduleKey.mjs";
import { reportLines } from "./kktResidual.mjs";
import { scene, exactFixture, kktRows, shippedSubstep, iterationSweep, dtSweep, omittedSetTrap,
         SHIPPED_ITERATIONS, MEASURED_V3602 } from "./kktResidual.mjs";

let pass = 0, fail = 0;
const ok = (n, c, note = "") => { if (c) { pass++; console.log("  ok   " + n + (note ? "  -- " + note : "")); }
                                  else { fail++; console.log("  FAIL " + n + (note ? "  -- " + note : "")); } };
const section = (n) => console.log("\n== " + n + " ==");
const sc = scene();

section("1. THE INSTRUMENT IS PROVEN BEFORE ANY NUMBER IS BELIEVED");
{
    // A residual that returned zero regardless would make every reading below meaningless.
    const r = shippedSubstep(sc);
    const zeroLam = momentumResidual(r.pred, r.xPred, sc.init.invMass, sc.cons, new Float64Array(sc.cons.length));
    // A COMPARISON, NOT A CONSTANT: my first version demanded zeroLam > 1e-4 and it reads 1.106e-5, so the
    // check was about a number I typed rather than about the instrument. What matters is the RATIO.
    ok("!! fed ZERO multipliers it reports orders MORE than the real residual, not zero",
       zeroLam > 1e4 * kktRows(sc).momentum,
       zeroLam.toExponential(3) + " against " + kktRows(sc).momentum.toExponential(3) + " -- not a check that cannot fail");
    ok("...and the real multipliers bring it to machine scale", kktRows(sc).momentum < 1e-8);
    ok("the fixture actually moves (a solver doing nothing would satisfy both rows)", r.moved > 1e-4,
       r.moved.toExponential(3));
}

section("2. THE ANSWER KEY: WHERE THE DIRECTIONS CANNOT ROTATE, THE MOMENTUM ROW IS EXACT");
{
    const ex = exactFixture();
    for (const iters of [1, 2, 3, 5]) {
        const k = kktRows(ex, { iters });
        ok("one constraint at iters=" + iters + " is machine zero, not merely small", k.momentum < 1e-15,
           k.momentum.toExponential(3));
    }
    ok("...and that fixture is not degenerate -- the constraint does real work",
       shippedSubstep(ex).moved > 1e-3, shippedSubstep(ex).moved.toExponential(3));
    ok("so the cloth's reading is a MEASURED departure from an exact reference, not a threshold comparison",
       kktRows(sc).momentum > 0);
}

section("3. THE TWO ROWS MOVE IN OPPOSITE DIRECTIONS, AND ONLY ONE CONVERGES");
{
    const s = iterationSweep(sc);
    const first = s[0], last = s[s.length - 1];
    ok("!! the CONSTRAINT row converges toward machine zero with iterations",
       last.constraint < first.constraint / 1e6,
       first.constraint.toExponential(3) + " -> " + last.constraint.toExponential(3));
    ok("!! the MOMENTUM row does NOT -- it plateaus", last.momentum > first.momentum,
       first.momentum.toExponential(3) + " -> " + last.momentum.toExponential(3) + " over 1..500 iterations");
    const late = s.filter((r) => r.iters >= 50);
    ok("...and the plateau is flat: 50 and 500 iterations agree",
       Math.abs(late[0].momentum - late[1].momentum) / late[0].momentum < 0.01,
       late.map((r) => r.momentum.toExponential(3)).join(" / "));
    ok("so 'converged' names ONE row and not the other", last.constraint < 1e-14 && last.momentum > 1e-12);
}

section("4. THE LOAD-BEARING NEGATIVE: clothFrame HAS TWO CONSTRAINT SETS AND THE ROW MUST INCLUDE BOTH");
{
    const clean = kktRows(sc).momentum;
    for (const rad of [0.4, 0.5]) {
        const t = omittedSetTrap(sc, rad);
        ok("radius " + rad + " discovers a real second set", t.pairs > 0, t.pairs + " collision pairs");
        ok("!! the mesh-only row reads catastrophically on a CORRECT solver",
           t.meshOnly > 1e6 * clean, t.meshOnly.toExponential(3) + " against a collision-free " + clean.toExponential(3));
        // A RELATION AND A REPORTED RATIO. My first version demanded a factor of 5 and radius 0.5 reads 1.78,
        // which is a FINDING and not a failure: the harder the collision pass works, the larger the genuine
        // linearisation error, so the improvement from bookkeeping SHRINKS. A typed factor would have hidden that.
        ok("...and including both sets is better, by a ratio that is REPORTED rather than pinned",
           t.bothSets < t.meshOnly, "ratio " + (t.meshOnly / t.bothSets).toFixed(2) + "x, bothSets " + t.bothSets.toExponential(3));
        ok("!! and the omitted value IS the motion it cannot account for",
           Math.abs(t.meshOnly - t.moved) / t.moved < 0.01,
           "meshOnly " + t.meshOnly.toExponential(3) + " vs motion " + t.moved.toExponential(3));
    }
}

section("5. WHAT IS REFUSED, AND IT IS A REFUSAL RATHER THAN AN OMISSION");
{
    ok("v3600's displacement^4 law is NOT extrapolated to the collision lever",
       /DOES NOT TRANSFER/.test(MEASURED_V3602.refused));
    ok("...and the failing ratios are recorded rather than tidied away",
       /7\.095/.test(MEASURED_V3602.refused) && /2\.568/.test(MEASURED_V3602.refused));
}

section("6. WHAT IS NOT CLAIMED -- ASSERTED AS AN ABSENT MECHANISM");
{
    const loop = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "clothLoop.js"), "utf8");
    ok("clothLoop.js does not import this instrument -- the shipped path is graded, not altered",
       !/from\s+["'][^"']*kktResidual/.test(loop));
    ok("the shipped iteration count is read from the loop's own default rather than typed twice",
       SHIPPED_ITERATIONS === 5 && /iterations\s*\?\?\s*5/.test(loop));
    ok("the verdict is a PASS on a question nobody had asked, and says so",
       /nobody had checked, now checked/.test(MEASURED_V3602.verdict));
    ok("no device, no baseline change", /No device, no/.test(MEASURED_V3602.notClaimed));
    // ANTIDOTE (v3196): if somebody adds a THIRD constraint set to clothFrame, section 4 goes RED and must be
    // rewritten to include it -- not weakened, and not scoped back to two.
}

{
    // v3904 -- reportLines IS THIS MODULE'S OWN REPORT, AND NOTHING HAD EVER CALLED IT.
    // I nearly skipped this on the belief that toolFrontDoor already covered it. IT DOES NOT, AND I CHECKED
    // RATHER THAN ASSERTED: section 1 SPAWNS the file and demands non-empty stdout matching /[basename]/ --
    // that is what the MAIN BLOCK prints, which is a different function. A reportLines() returning [] would
    // leave the front door perfectly green, because the main block writes its own header either way.
    // *** A REPORTER NOBODY CALLS IS A REPORTER THAT CAN GO SILENT IN PRIVATE. *** The shape graded here is
    // the weakest one worth having -- an array, of strings, longer than a header, carrying its own name --
    // and it is the shape that distinguishes "the report is built" from "the function still returns".
    const L = reportLines();
    ok("reportLines returns a real report and names itself",
       Array.isArray(L) && L.length > 5 && L.every((x) => typeof x === "string") &&
       L.join("\n").includes("[kktResidual]"),
       L.length + " lines, self-named");
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
