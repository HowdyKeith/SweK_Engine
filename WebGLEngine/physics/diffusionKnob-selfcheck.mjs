// WebGLEngine/physics/diffusionKnob-selfcheck.mjs -- v3598
// ---------------------------------------------------------------------------------------------------------------
// A REFUSAL IS A CLAIM AND HAS TO BE SHOWN, NOT ARGUED. This gate drives the thing the round refused.
//
// THE ROUND EXPECTED A STATISTICS PROBLEM AND FOUND A STRUCTURAL ONE. The plan was v3513's rule -- for a
// stochastic device the test is the SEED SPREAD rather than the value -- and the spread behaves perfectly
// well. IT BUYS NOTHING, because D cancels out of the round trip: T sets D, D scales sigma, sigma scales a
// FIXED random stream, the MSD scales with D exactly, and inverting returns D. That/T is ONE NUMBER FOR THE
// WHOLE SLIDER, on one seed and on an ensemble, at every sample size.
//
// SECTION 2 IS THE PROOF AND IT IS AN IDENTITY RATHER THAN A TOLERANCE: the recovered/commanded ratio is the
// same double at 260 K and at 373 K. Section 3 shows the statistics ARE fine, so the refusal cannot be read
// as "we did not sample enough" -- which is the reading that would send somebody to build a bigger fixture.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { recoverOnce, seedEnsemble, singleSeedRatioSpread, ensembleRatioSpread, knobHalfRange,
         REFUSED, SHIPPED, KNOB, SCEN } from "./diffusionKnob.mjs";
import { warmthOfKelvin, kelvinOfWarmth } from "./blobKelvin.js";
import { SCENE_TRIAGE, refused as refusedRows } from "./labScenes.mjs";
import { listProposers, resetRegistry } from "./proposers.mjs";
import { registerAll } from "./knobRegistry.mjs";

let pass = 0, fail = 0;
const ok = (n, c, note = "") => { if (c) { pass++; console.log("  ok   " + n + (note ? "  -- " + note : "")); }
                                  else { fail++; console.log("  FAIL " + n + (note ? "  -- " + note : "")); } };
const section = (n) => console.log("\n== " + n + " ==");

section("1. THE ALGEBRA ROUTE IS A CONTROL THAT CANNOT FAIL (the row said so; here it is)");
{
    const rt = [250, 300, 373].map((T) => kelvinOfWarmth(warmthOfKelvin(T, SCEN), SCEN) / T);
    ok("kelvinOfWarmth(warmthOfKelvin(T)) returns T to rounding",
       rt.every((r) => Math.abs(r - 1) < 1e-14), rt.map((r) => r.toFixed(15)).join(" "));
    ok("...so an adjudicator on the exposed pair would pass anything", Math.abs(rt[0] - rt[2]) < 1e-14);
}

section("2. *** AND SO IS THE TRAJECTORY ROUTE -- THE RATIO IS ONE NUMBER FOR THE WHOLE SLIDER ***");
{
    const one = singleSeedRatioSpread([260, 300, 340, 373]);
    ok("a single seed gives the SAME That/T at every temperature",
       one.spread < 1e-14, one.ratios.map((r) => r.toFixed(9)).join(" ") + "  spread " + one.spread.toExponential(2));
    // AN IDENTITY, NOT A TOLERANCE: asserted between the extreme ends of the slider as exact doubles.
    const lo = recoverOnce(KNOB.min).That / KNOB.min, hi = recoverOnce(KNOB.max).That / KNOB.max;
    ok("*** and it is the same DOUBLE at 250 K and 373 K ***", Math.abs(lo - hi) <= Number.EPSILON * 4,
       lo.toPrecision(17) + " vs " + hi.toPrecision(17));
    // THE ENSEMBLE DOES NOT RESCUE IT, which is the half that kills the round.
    for (const o of [{ N: 7, steps: 120 }, { N: 112, steps: 480 }]) {
        const e = ensembleRatioSpread([250, 300, 373], { ...o, seeds: 16 });
        ok("a 16-seed ensemble at n=" + o.N * o.steps + " ALSO gives one ratio", e.spread < 1e-14,
           e.ratios[0].toFixed(9) + "  spread " + e.spread.toExponential(2));
    }
    ok("the refusal states the mechanism rather than a symptom", /D cancels/i.test(REFUSED.why));
}

section("3. THE STATISTICS ARE FINE, WHICH IS WHY THE REFUSAL IS NOT 'SAMPLE HARDER'");
{
    const a = seedEnsemble(300, { N: SHIPPED.N, steps: SHIPPED.steps, seeds: 16 });
    const b = seedEnsemble(300, { N: 112, steps: 480, seeds: 16 });
    ok("the seed spread FALLS as the sample grows", b.rel < a.rel / 2,
       a.rel.toExponential(3) + " at n=" + a.samples + " -> " + b.rel.toExponential(3) + " at n=" + b.samples);
    ok("*** so the refusal is STRUCTURAL, not a small-sample complaint ***",
       /NOT the small-sample problem/i.test(REFUSED.notStatistical));
    // SEPARATELY, AND IT WOULD BITE EVEN IF THE KEY WERE SOUND: the shipped fixture's spread is wider than
    // the slider it is meant to resolve, so every temperature sits inside every other's error bar.
    ok("the shipped fixture's spread exceeds the knob's own half-range", a.rel > knobHalfRange(),
       a.rel.toExponential(3) + " against " + knobHalfRange().toFixed(4) + " (250-373 K)");
    ok("...and that is recorded as a SECOND reason, not the first", /TWO INDEPENDENT REASONS/.test(REFUSED.alsoRecorded));
}

section("4. THE REFUSAL IS WIRED, AND NOTHING WAS REGISTERED ON IT");
{
    const row = SCENE_TRIAGE.find((r) => r.scene === "diffusion");
    ok("the triage row is now REFUSED", row.eligible === "refused" && row.responds === "no");
    ok("it names a reason", !!row.reason && row.reason.length > 80);
    ok("and carries NO live key", row.key === null);
    // *** THE REFUTED KEY IS KEPT UNDER A DEAD NAME (v3202): deleting it would lose the fact that the
    // question was asked and settled, and somebody would propose it again. ***
    ok("*** but the refuted key is preserved under a name that cannot read as live ***",
       typeof row.refutedKey === "string" && row.refutedKey.length > 60);
    ok("every refused row still names a reason", refusedRows().every((r) => r.reason && !r.key));
    resetRegistry(); registerAll();
    ok("NO proposer was registered for diffusion",
       !listProposers().some((p) => /diffus/i.test(p.id) || /diffus/i.test(String(p.instrument))));
    ok("the antidote names what would make it askable", /thermostat|fluctuation-dissipation|trap/i
       .test(REFUSED.whatWouldMakeItAskable));
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
