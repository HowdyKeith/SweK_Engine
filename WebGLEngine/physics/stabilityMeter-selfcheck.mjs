// WebGLEngine/physics/stabilityMeter-selfcheck.mjs -- v3599
// ---------------------------------------------------------------------------------------------------------------
// THE CLAIM UNDER TEST IS "STABLE AT ANY TIME-STEP", AND THE POINT OF THIS GATE IS THAT IT IS HALF A CLAIM.
//
// Section 2 is the round: E_explicit x E_implicit = 1 to twelve decimals at every dt. Explosion and damping
// are the SAME error with opposite signs, and only one of them looks like a bug -- so a meter that asks only
// "did it blow up" is not a weak meter, it is one that SELECTS the failure nobody notices.
//
// Section 4 is the load-bearing negative and it fails in the direction that matters: the unconditionally
// stable integrator is the one that has destroyed the oscillator, and a two-state stable/unstable report
// would rank it FIRST.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { reportLines } from "./stabilityMeter.mjs";
import { KINDS, shmRun, predictedAmplification, verdict, reciprocity, stabilityBoundary,
         EXPLODE_FACTOR, DAMP_FACTOR, MEASURED_V3599 } from "./stabilityMeter.mjs";

let pass = 0, fail = 0;
const ok = (n, c, note = "") => { if (c) { pass++; console.log("  ok   " + n + (note ? "  -- " + note : "")); }
                                  else { fail++; console.log("  FAIL " + n + (note ? "  -- " + note : "")); } };
const section = (n) => console.log("\n== " + n + " ==");

section("1. THE ANSWER KEY IS A CLOSED FORM PER STEP, AND THE INTEGRATOR IS NEVER TOLD IT");
{
    for (const dt of [0.05, 0.1, 0.4]) {
        for (const k of ["explicit", "implicit"]) {
            const r = shmRun(k, { dt, steps: 500 }), p = predictedAmplification(k, dt);
            ok(k + " at w*dt=" + dt + " matches sqrt(1+(w dt)^2) to 10 digits",
               Math.abs(r.perStep - p) / p < 1e-10,
               r.perStep.toFixed(10) + " vs " + p.toFixed(10));
        }
    }
    // SYMPLECTIC HAS NO SECULAR FACTOR AND THAT IS ITS PROPERTY, so predicting one would be wrong.
    ok("symplectic is declared to have NO closed-form drift factor", predictedAmplification("symplectic", 0.1) === null);
    ok("...and measurably does not drift over a long run",
       Math.abs(shmRun("symplectic", { dt: 0.1, steps: 20000 }).ratio - 1) < 0.2,
       "ratio " + shmRun("symplectic", { dt: 0.1, steps: 20000 }).ratio.toFixed(6) + " over 20000 steps");
}

section("2. *** THE IDENTITY: EXPLOSION AND DAMPING ARE THE SAME ERROR ***");
{
    for (const dt of [0.1, 0.5, 1.0]) {
        const r = reciprocity({ dt, steps: 400 });
        ok("E_explicit x E_implicit = 1 at w*dt=" + dt, Math.abs(r.product - 1) < 1e-9,
           r.explicit.toExponential(2) + " x " + r.implicit.toExponential(2) + " = " + r.product.toFixed(12));
    }
    ok("...and per-step too, which is where it comes from",
       Math.abs(reciprocity({ dt: 0.5 }).perStepProduct - 1) < 1e-12);
    ok("the record states the consequence rather than the arithmetic",
       /ONLY ONE OF THEM LOOKS LIKE A BUG/.test(MEASURED_V3599.explosionAndDampingAreTheSameError));
}

section("3. THE BOUNDARIES ARE RECOVERED BY BISECTION, NOT TYPED");
{
    const s = stabilityBoundary("symplectic");
    // Symplectic Euler on the SHM is bounded for w dt < 2 -- a textbook result the bisection is never told,
    // and it lands just under it because the verdict is taken over a FINITE run.
    ok("symplectic has a FINITE boundary near w*dt = 2", !s.unconditional && s.wdt > 1.5 && s.wdt < 2.1,
       "w*dt = " + s.wdt.toFixed(6));
    ok("explicit's boundary is far tighter", stabilityBoundary("explicit").wdt < s.wdt,
       "explicit " + stabilityBoundary("explicit").wdt.toFixed(6));
    ok("*** implicit is UNCONDITIONAL -- it never blows up at any dt tested ***",
       stabilityBoundary("implicit").unconditional === true);
    ok("...including w*dt = 50", verdict("implicit", { dt: 50, steps: 400 }).verdict !== "EXPLODES");
}

section("4. *** AND THE UNCONDITIONALLY STABLE ONE IS THE DEAD ONE ***");
{
    const imp = verdict("implicit", { dt: 0.1, steps: 2000 });
    ok("implicit at a MODEST step has lost the oscillator entirely", imp.ratio < 1e-6,
       "energy ratio " + imp.ratio.toExponential(3) + " after 2000 steps");
    ok("...and the meter names it DAMPED rather than passing it", imp.verdict === "DAMPED");
    // THE NEGATIVE: a two-state report would rank the dead integrator first, and that is driven rather than
    // asserted -- the naive predicate is reconstructed here and its ordering is shown.
    const naive = (k, o) => (Number.isFinite(shmRun(k, o).ratio) && shmRun(k, o).ratio < 1e300);
    const o = { dt: 50, steps: 400 };
    ok("*** a stable/unstable report calls the dead integrator the ONLY survivor at w*dt=50 ***",
       naive("implicit", o) && !naive("explicit", o) && !naive("symplectic", o),
       "implicit survives with energy ratio " + shmRun("implicit", o).ratio.toExponential(2));
    ok("...while the three-way meter separates DAMPED from FAITHFUL",
       new Set(KINDS.map((k) => verdict(k, { dt: 0.1, steps: 2000 }).verdict)).size === 3,
       KINDS.map((k) => k + "=" + verdict(k, { dt: 0.1, steps: 2000 }).verdict).join(" "));
    // The bounds are SYMMETRIC on purpose: the asymmetry between explode and damp is the thing being
    // measured, so building it into the meter's own thresholds would beg the question.
    ok("the meter's own bounds are symmetric in the ratio", Math.abs(EXPLODE_FACTOR * DAMP_FACTOR - 1) < 1e-12,
       EXPLODE_FACTOR + " and " + DAMP_FACTOR);
}

section("5. WHAT IS NOT CLAIMED");
{
    ok("no MPM is implemented and the record says so", /NOT an MPM implementation/.test(MEASURED_V3599.whatThisIsNot));
    ok("no claim is made about anybody else's code", /NOT a claim about EA's code/.test(MEASURED_V3599.whatThisIsNot));
    ok("and it is pointed at THIS tree's integrators first",
       /centrifuge|SPH column/.test(MEASURED_V3599.whatThisIsNot));
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
       L.join("\n").includes("[stabilityMeter]"),
       L.length + " lines, self-named");
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
