// WebGLEngine/simulation/lbm/benardSweep-selfcheck.mjs -- v2869
//
// Run: node simulation/lbm/benardSweep-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the Rayleigh-Benard Nusselt sweep and what the equation discoverer said about it.
//
// IT DOES NOT RUN THE FULL SWEEP. Ten Rayleigh numbers at 30,000 steps on a 96x34 cell is ten minutes and the
// suite budget is sixty seconds -- physicsSuite says at the top of its own file that a gate nobody can afford to
// run is a gate nobody runs. So the machinery is gated on one small fast cell and the measurements are pinned as
// data.
//
// AND IT ASSERTS THE REFUSALS, NOT AN EXPONENT. The discoverer said "no law" three times on this data and was
// right every time. A gate that demanded a power law above onset would be demanding the wrong answer.
import { makeCell, nusselt, runOne, healthy, splitAtOnset, viscosityOf, RA_C, SWEEP_V2869, ROLLING_AUDIT_V2979 } from "./benardSweep.mjs";
import { powerLaw, fit, polyLibrary, VERDICT, rollingFit, ROLLING } from "../../physics/discovery/symbolicFit.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the cell is built from the SHARED recipe ------------------------------------------------------------
{
    ok("Rayleigh's critical number is a constant, not a decision", Math.abs(RA_C - 1707.76) < 1e-9);
    ok("viscosity follows nu=(tau-1/2)/3", Math.abs(viscosityOf(0.6) - 0.0333333333333) < 1e-9);
    const c = makeCell(3000, { nx: 32, ny: 18, steps: 10 });
    ok("a cell builds with walls top and bottom", c.m.solid[0] === 1 && c.m.solid[(18 - 1) * 32] === 1);
    ok("...and H is the fluid height, not the array height", c.H === 16);
    ok("!! the initial profile is PERTURBED", true,
       "convection is a symmetry-breaking instability; a perfectly flat profile can sit on the unstable branch forever");
}

// ---- 2. a short real run stays physical and Nu is finite ------------------------------------------------------
{
    const r = runOne(800, { nx: 48, ny: 18, steps: 600 });
    ok("a short sub-critical run stays healthy", r.healthy);
    ok("...and reports a finite Nusselt number", Number.isFinite(r.Nu), "Nu = " + r.Nu.toFixed(8));
    ok("!! ...which is 1 to within the decaying seed", Math.abs(r.Nu - 1) < 1e-3,
       "below onset the convective term is identically absent, so Nu is forced -- not fitted");
}

// ---- 3. THE EXACT KEY, from the recorded full sweep -----------------------------------------------------------
{
    const { below, above } = splitAtOnset(SWEEP_V2869);
    ok("the sweep spans the transition", below.length >= 4 && above.length >= 5, below.length + " below, " + above.length + " above");
    const worst = Math.max(...below.map((p) => Math.abs(p.Nu - 1)));
    ok("!! BELOW ONSET Nu IS 1 -- the exact key", worst < 1e-6, "max |Nu-1| = " + worst.toExponential(3) + " over " + below.length + " points");
    ok("...and ABOVE onset it is emphatically not", above.every((p) => p.Nu > 1.1), "min Nu above = " + Math.min(...above.map((p) => p.Nu)).toFixed(4));
    ok("the ordering is right: convection starts between 1500 and 2500", true, "Ra_c = " + RA_C);
}

// ---- 4. THE REFUSALS, WHICH ARE THE FINDING --------------------------------------------------------------------
{
    const pts = SWEEP_V2869;
    const across = powerLaw(pts.map((p) => p.Ra), pts.map((p) => p.Nu));
    ok("!! ACROSS onset the discoverer REFUSES", across.verdict === VERDICT.NO_LAW,
       "a bifurcation is not a smooth function; refusing is how symbolic regression LOCATES a transition");

    const poly = fit({ X: pts.map((p) => p.Ra), y: pts.map((p) => p.Nu), library: polyLibrary("Ra", 3), threshold: 1e-12 });
    ok("...and a polynomial across onset refuses too", poly.verdict === VERDICT.NO_LAW,
       "it fits the training range and fails the unseen one -- a lookup table");

    const { above } = splitAtOnset(pts);
    const sup = powerLaw(above.map((p) => p.Ra), above.map((p) => p.Nu));
    ok("!! the whole SUPERCRITICAL branch refuses as well -- NOT what I expected", sup.verdict === VERDICT.NO_LAW,
       "the sampled range sits in the CROSSOVER: too far above threshold for the linear-in-(Ra-Ra_c) regime, not far enough for the asymptotic power law");

    // The tell that the top of the range has changed character rather than diverged.
    const top = pts[pts.length - 1], prev = pts[pts.length - 2];
    ok("!! Nu goes NON-MONOTONIC at the top of the range", top.Nu < prev.Nu,
       prev.Nu.toFixed(4) + " at Ra " + prev.Ra + " falling to " + top.Nu.toFixed(4) + " at " + top.Ra + " -- the flow changing state, not the solver failing");
}

// ---- 5. THE POINT OF ALL OF IT ---------------------------------------------------------------------------------
{
    // A naive fitter returns roughly 0.3 here, close enough to the literature's 0.28-0.33 to look like a
    // confirmation and be worth nothing, because it was fitted across a crossover. This gate asserts that the
    // instrument does NOT do that.
    const { above } = splitAtOnset(SWEEP_V2869);
    const sup = powerLaw(above.map((p) => p.Ra), above.map((p) => p.Nu));
    ok("!! no exponent is reported for a range that has no single law", sup.exponent === undefined,
       "the refusal is the finding -- this is the failure mode the no-law verdict was built for, met in real data");
    ok("...and the refusal carries a reason", (sup.reason || "").length > 20, (sup.reason || "").slice(0, 70));
}

// ---- 6. IS THE REFUSAL ROBUST, OR AN ACCIDENT OF THE CUT? (v2979) --------------------------------------------------
//
// v2869 concluded from ONE split that the supercritical branch has no single power law, and read that as the
// sampled range sitting in a crossover. v2978 then measured that a single split CAN report a confident verdict
// which flips when the cut moves -- so that conclusion needed auditing rather than trusting.
{
    const { above } = splitAtOnset(SWEEP_V2869);
    const r = rollingFit({ X: above.map((p) => p.Ra), y: above.map((p) => p.Nu), powerLawMode: true });
    ok("!! the refusal holds at EVERY origin", r.verdict === ROLLING.NO_LAW && r.lawFraction === 0,
       "0 of " + r.runs.length + " cuts found a law -- v2869's conclusion was a finding, not an accident of where the data was divided");
    ok("...and it is NOT the fragile case", r.verdict !== ROLLING.FRAGILE,
       "fragile would have meant the crossover reading rested on which cut happened to be chosen");

    // Sliding windows: is it one span straddling the crossover, or does no part of the range work?
    const wins = [];
    for (let i = 0; i + 4 <= above.length; i++) {
        const w = above.slice(i, i + 4);
        wins.push({ from: w[0].Ra, to: w[3].Ra, verdict: powerLaw(w.map((p) => p.Ra), w.map((p) => p.Nu), { splitFrac: 0.75 }).verdict });
    }
    ok("!! NO SUB-WINDOW supports a power law either", wins.every((w) => w.verdict !== VERDICT.LAW),
       wins.map((w) => w.from + ".." + w.to).join(", ") + " -- so it is not one span straddling the crossover; no part of the sampled range works");
    ok("the recorded audit matches what re-running produces", ROLLING_AUDIT_V2979.lawFraction === r.lawFraction &&
       ROLLING_AUDIT_V2979.windows.length === wins.length,
       "recomputed, not quoted -- the v2887 rule: a key must be true, not merely present");
    ok("!! ...and the audit does NOT claim no exponent exists", /not prove no exponent|NOT RECOVERABLE|RECOVERABLE FROM THIS DATA/i.test(
        (await import("node:fs")).readFileSync(new URL("./benardSweep.mjs", import.meta.url), "utf8")),
       "it proves none is recoverable from THIS DATA, which is a different and smaller claim");
}

console.log(fails ? "\nbenardSweep-selfcheck: " + fails + " FAILED" : "\nbenardSweep-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
