// tools/roundhouse/refinementWindow-selfcheck.mjs
//
// Run: node tools/roundhouse/refinementWindow-selfcheck.mjs   (~10s)
//
// v3132 -- A REGISTER'S NOTE CONTRADICTED ITS OWN VALUE LIST, AND CRITERION 3 REWARDED THE ERROR.
//
// lens's refinement note named the round-off crossover at "about 4e-4" and then stated its four values
// "sit entirely above it" -- WITH 2e-4 IN THE LIST. Below 4e-4. Written by the same hand, in the same comment,
// never compared. That is exactly the shape v3131 found in lens.deflect's ASSUMPTION, one file over: a declared
// bound and a thing that violates it, each correct-looking alone.
//
// *** AND THE STEP MAGNITUDES HID IT. *** Measured on deflectionMeasured at M=1 b=60, the steps are 8.0e-10,
// 1.0e-10, 1.2e-11 -- shrinking the whole way. c3 passed. The note read as correct. WHAT REVERSES IS THE
// DIRECTION: the value goes down, UP, then down. A damped oscillation, not an approach to a limit. TRUNCATION
// ERROR HAS A CONSISTENT SIGN; ROUND-OFF DOES NOT, and only the sign tells them apart.
//
// *** AND THE NOISE FLOOR SCORES BETTER THAN REAL CONVERGENCE. *** contraction is last/first, so once the value
// stops moving the last step is tiny and the ratio looks superb. The old list scored 1.52e-2; values staying in
// the asymptotic regime score 1.27e-1 -- an order of magnitude "worse" for being right. CRITERION 3 REWARDED
// SWEEPING PAST THE CROSSOVER.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const R = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "refinementKnobs.mjs")).href);
const D = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);
const A = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "assumptions.mjs")).href);

// ---- 1. A DECLARED CROSSOVER MUST NOT BE VIOLATED BY THE VALUES BESIDE IT ---------------------------------------
{
    let checked = 0; const violating = [];
    for (const [dev, k] of Object.entries(R.REFINEMENT_KNOBS)) {
        if (!Number.isFinite(k.crossover)) continue;      // nothing declared, nothing to contradict
        checked++;
        const bad = (k.values || []).filter((v) => v < k.crossover);
        if (bad.length) violating.push({ dev, crossover: k.crossover, below: bad });
    }
    ok("!! no refinement value sits below its own declared crossover",
        violating.length === 0 && checked > 0,
        checked + " register(s) declare one" + (violating.length ? "; VIOLATING " + JSON.stringify(violating) : "") +
        ". The note said 4e-4 and the list contained 2e-4 -- a bound and a violation in the same comment");

    ok("!! and the crossover is DECLARED, not left in the prose to be re-read",
        R.REFINEMENT_KNOBS.lens.crossover === 8e-4,
        "v3131 learned this the expensive way: parsing a threshold out of a sentence pulls the measurement " +
        "details too. The author knows which number is the bound, so the author states it as a field");

    ok("...and it agrees with the assumption that uses the same physics",
        R.REFINEMENT_KNOBS.lens.crossover === A.DPHI_CROSSOVER,
        "the refinement register and lens.deflect's above-roundoff-crossover assumption are two statements " +
        "about ONE number. They now come from one measurement instead of two habits");
}

// ---- 2. THE SIGN TEST, WHICH IS WHAT MAGNITUDES CANNOT DO -----------------------------------------------------------
{
    const lens = await D.getDevice("lens");
    const cfg0 = lens.defaults({ mode: "deflect" }).config;
    const seq = async (vals) => {
        const v = [];
        for (const dphi of vals) v.push((await lens.build({ mode: "deflect", config: { ...cfg0, M: 1, b: 60, dphi } })).deflectionMeasured);
        const d = []; for (let i = 1; i < v.length; i++) d.push(v[i] - v[i - 1]);
        return d.slice(1).filter((x, i) => Math.sign(x) !== Math.sign(d[i])).length;
    };

    ok("!! the CURRENT register approaches from one side -- zero sign reversals",
        (await seq(R.REFINEMENT_KNOBS.lens.values)) === 0,
        JSON.stringify(R.REFINEMENT_KNOBS.lens.values) + ". Truncation error has a consistent sign");

    ok("!! and the OLD register OSCILLATES, which no magnitude test can see",
        (await seq([1.6e-3, 8e-4, 4e-4, 2e-4])) === 2,
        "down, UP, down -- two reversals, while the step MAGNITUDES shrank the whole way (8.0e-10, 1.0e-10, " +
        "1.2e-11). That is why c3 passed on it and why the note read as correct");

    ok("...and a too-COARSE point reintroduces one, so the knob has a WINDOW not a floor",
        (await seq([1.28e-2, 6.4e-3, 3.2e-3, 1.6e-3])) === 1,
        "1.28e-2 is outside the asymptotic regime at the other end. Fixing only the lower bound would have " +
        "left the upper one to be discovered by somebody adding a coarser point in good faith");
}

// ---- 3. THE METRIC REWARDED THE ERROR -------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "refinementKnobs.mjs"), "utf8");
    ok("!! and it is written down that the noise floor SCORES BETTER",
        /THE NOISE FLOOR SCORES BETTER THAN REAL CONVERGENCE/.test(src) && /contraction is last\/first/.test(src),
        "1.52e-2 past the crossover against 1.27e-1 staying in the asymptotic regime -- an order of magnitude " +
        "'better' for being wrong. Anyone tuning a register toward a nicer contraction number is being pulled " +
        "straight into the noise, and nothing in the metric says so");
    console.log("  NOTE   c3 STILL PASSES ON BOTH REGISTERS, so this is not a corroboration that collapsed -- it is");
    console.log("         one that was resting on a sweep half inside the noise. THE SIGN TEST ABOVE IS NOT WIRED");
    console.log("         INTO classifyPlacement; it is asserted here for lens only. Making it a criterion is a");
    console.log("         change to the battery every device must then survive, and that is its own round.");
}

// ---- 4. v3133: THE SIGN TEST WAS PROPOSED AS A CRITERION AND THE CENSUS SAID NO ---------------------------------------
// v3132 closed by suggesting the sign test be promoted into classifySequence as a pass/fail criterion, and
// predicted casualties. THE CENSUS PRODUCED TWO, AND ONE OF THEM IS CORRECT.
{
    const alternating = R.classifySequence([4.758791247046138, 4.648495824742758, 4.677208080595588, 4.677208080595588]);
    ok("!! chaos/deltaBest ALTERNATES and is genuinely CONVERGING",
        alternating.reversals >= 1 && alternating.verdict === "CONVERGING",
        "4.7588, 4.6485, 4.6772, 4.6772 -- STRADDLING 4.6692, THE FEIGENBAUM CONSTANT, with steps shrinking " +
        "1.1e-1 -> 2.9e-2 -> 0. ALTERNATING CONVERGENCE IS CONVERGENCE. A sign criterion would have failed a " +
        "correct estimate of a real mathematical constant, which is why the promotion did not happen");

    ok("!! the OTHER casualty is already caught without the sign",
        R.classifySequence([1.0000000063650518, 1.0000000000259248, 1.0000000091216914, 1.000000000082108]).monotoneShrinking === false,
        "kepler/energyGrowthRatio's steps are 6.3e-9, 9.1e-9, 9.0e-9 -- NOT shrinking, so the existing test " +
        "already has it. The sign added nothing there and would have cost chaos");

    ok("!! so reversals are REPORTED and the verdict is untouched",
        Number.isInteger(alternating.reversals) && Array.isArray(alternating.signedDiffs) &&
        R.classifySequence([4, 2, 1]).verdict === "CONVERGING"   /* steps 2,1 -> contraction 0.5; [3,2,1] has EQUAL steps and is correctly DRIFTING */,
        "a reversal says the sequence approaches from BOTH SIDES, which is true of an alternating series AND " +
        "of round-off wander, and NOTHING IN THE SIGN ALONE SEPARATES THEM. What separated them for lens at " +
        "v3132 was the CROSSOVER -- a measured property of the instrument, not of the sequence");

    ok("!! and a ZERO step is not a direction change",
        R.classifySequence([1, 0.5, 0.25, 0.25]).reversals === 0,
        "my first census counted zeros as reversals and reported FOUR across the registers; the true number is " +
        "TWO. Math.sign(0) is 0 and differs from both neighbours, turning a sequence that simply STOPPED into " +
        "one that supposedly turned round");

    ok("...and the signed deltas survive to be read",
        R.classifySequence([1, 2, 1.5]).signedDiffs.join(",") === "1,-0.5",
        "the old line took Math.abs immediately and the direction was gone before anything could look at it");
}

// ---- 5. v3134: ONE QUANTITY, ONE OPERATING POINT ----------------------------------------------------------------------
// v3132 moved the REFINEMENT register above the crossover and left the NUISANCE base at 2e-4. So c2 swept
// invariance at a point c3 had just been moved off -- and because corroborateFully reports the operating point
// from the NUISANCE base, THE WHOLE STANDING CAME BACK "UNSOUND AT THIS OPERATING POINT" WITH ALL FOUR CRITERIA
// PASSING. Every criterion green, the standing red, and the reason was a base nobody had thought to move.
//
// That is v3081's harness bug in a new coat: TWO CRITERIA ABOUT ONE QUANTITY AT TWO DIFFERENT OPERATING POINTS.
// v3081 fixed it by giving knobs a `base` and PRINTING it. What was missing is that the two bases must AGREE.
{
    const N = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "nuisanceKnobs.mjs")).href);
    let compared = 0; const split = [];
    for (const [dev, ref] of Object.entries(R.REFINEMENT_KNOBS)) {
        if (!Number.isFinite(ref.crossover)) continue;
        const nui = N.NUISANCE_KNOBS[dev];
        if (!nui || !nui.base || !(ref.param in nui.base)) continue;
        compared++;
        // The nuisance base pins the refinement PARAM at some value. It must sit on the sound side of the
        // crossover, or c2 measures invariance somewhere c3 has declared unusable.
        if (nui.base[ref.param] < ref.crossover) split.push({ dev, param: ref.param, nuisanceBase: nui.base[ref.param], crossover: ref.crossover });
    }
    ok("!! a nuisance base does not pin the refinement param below its own crossover",
        split.length === 0 && compared > 0,
        compared + " device(s) where both knobs name the same param" +
        (split.length ? "; SPLIT: " + JSON.stringify(split) : "") +
        ". lens's nuisance base held dphi=2e-4 while the refinement register had moved to 1.6e-3 and above -- " +
        "ALL FOUR CRITERIA PASSED AND THE STANDING WAS UNSOUND, because the operating point is read from the " +
        "nuisance base");

    ok("...and the two bases now agree by construction",
        N.NUISANCE_KNOBS.lens.base.dphi === 1.6e-3 && R.REFINEMENT_KNOBS.lens.values.includes(1.6e-3),
        "1.6e-3 is inside the measured window AND is one of the refinement values, so they coincide rather " +
        "than merely both happening to be legal");
}

console.log();
if (fails) { console.log("refinementWindow-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("refinementWindow-selfcheck: all checks pass");
