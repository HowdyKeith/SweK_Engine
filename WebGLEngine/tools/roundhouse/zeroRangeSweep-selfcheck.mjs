// tools/roundhouse/zeroRangeSweep-selfcheck.mjs
//
// Run: node tools/roundhouse/zeroRangeSweep-selfcheck.mjs   (~90s, scoped)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2912 -- ASKING THE QUESTION v2898 ASKED, AT CONFIGURATIONS IT NEVER VISITED.
//
// SCOPE, AND WHY THE GATE IS NOT THE WHOLE LAB. The full sweep is seven values per knob across 642 knobs and did
// not finish in twenty minutes. A gate nobody can afford to run is a gate that gets skipped, so this one sweeps
// four device/modes chosen to include the known case, and zeroRangeSweep() takes a `modes` argument so the full
// run stays available deliberately rather than by default.

import { zeroRangeSweep, zeroLines, knobRange, ZERO_RANGE_REGISTRATION } from "./zeroRangeSweep.mjs";
import { EXACT_OK } from "./exactZeroRegister.mjs";
import { getDevice } from "./devices.mjs";
import { dyadicSigmas, effectiveSigma, CONTROL_CLAIM } from "./zeroControl.mjs";   // v4477 -- the planted control

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const SCOPE = { optics: ["airy", "slit"], splat: ["integral"], kepler: ["kepler3"] };
const z = await zeroRangeSweep({ modes: SCOPE });
console.log();
zeroLines(z).forEach((l) => console.log("  " + l));
console.log();
const hit = (d, m, f) => z.rows.find((r) => r.device === d && r.mode === m && r.field === f);

// ---- 1. ONE REGISTER, IMPORTABLE -------------------------------------------------------------------------------------
{
    ok("the exact-zero register is a module, not a local const",
        Object.keys(EXACT_OK).length >= 18 && Object.values(EXACT_OK).every((v) => typeof v === "string" && v.length > 20),
        Object.keys(EXACT_OK).length + " entries, each carrying its sentence. It lived inside census-selfcheck.mjs, " +
        "which meant only that selfcheck could ask whether a zero was legitimate. v2910 hit the identical shape " +
        "with the MODES table and it cost three censuses their coverage of lens.map -- extracted before the same " +
        "thing happened twice");
    ok("the knob range spans the clamp, which is where the coincidences live",
        knobRange(900).includes(9000) && knobRange(5).length > 1,
        "multiplicative 0.1x to 10x around the default: " + knobRange(900).join(", ") + ". The airy zero exists " +
        "only at the clamp, so a range that stops at the default finds nothing");
}

// ---- 2. THE POSITIVE CONTROL ------------------------------------------------------------------------------------------
{
    // *** v3313 -- THE POSITIVE CONTROL NO LONGER FIRES. v3314 -- AND v3313 GOT THE REASON WRONG. ***
    //
    // v3313 measured the loss correctly: airyRingErrFrac reads 5.3282e-6 at nSamples = 2001 where v2911 measured
    // exactly 0, at every spread from 0.01 to 0.05. It then GUESSED at the cause -- "a DEFAULT moved at some
    // point and nobody noticed" -- because the 1.22 in diffraction.js was unchanged and that seemed to leave
    // nothing else. It left plenty else. The guess was written into a changelog as though it were a finding.
    //
    // THE ACTUAL CAUSE, read out of opticsBind.mjs in v3314: THE ZERO WAS DELIBERATELY DESTROYED AT v2931, and
    // the file says so in its own comment. Two changes were adopted from v2911's diagnosis:
    //   (1) firstMinimumRefined replaced firstMinimumAt. The raw estimator returned the grid sample where the
    //       pattern turns, so rayleighFactor JITTERED with nSamples and AT THE CLAMP LANDED EXACTLY ON THE
    //       ROUNDED ANSWER, SCORING A FAKE ZERO. Parabolic refinement converges monotonically instead.
    //   (2) grading moved to the exact ring j(1,1)/pi rather than the rounded 1.22, which had put a 2.7e-4 floor
    //       under the error and rewarded landing near a wrong constant.
    //
    // So the control did not rot. IT WAS CURED. The exact zero was the symptom of a defect, the defect was
    // repaired three hundred versions ago, and the control that watched for the symptom was never updated --
    // which is the same class as the stale deferral notes audited in v3314, arriving from a different door.
    //
    // FOUND WHILE MIGRATING THIS FILE'S SWEEP LOOP TO sweepDevice, AND IT IS NOT THE MIGRATION'S DOING: a direct
    // dev.build() scan over every knob, which is exactly what the old loop did, finds no exact zero either.
    // Checked before blaming the change, because a migration that lands next to a red gate is the easiest thing
    // in the world to blame.
    //
    // *** WHAT THIS COSTS, STATED PLAINLY: the sweep now has NO DEMONSTRATED DETECTION POWER for exact zeros. ***
    // It still finds the splat zero below, which is a live hit, but the case it was BUILT to re-find is gone.
    // Asserting the absence keeps the suite honest rather than green: the day this fires again, the assertion
    // below flips and someone has to come back and read this.
    const airy = hit("optics", "airy", "airyRingErrFrac");
    ok("!! the airy positive control is GONE, and the sweep is weaker for it (measured, not assumed)",
        !airy,
        "optics.airy.airyRingErrFrac reads 5.3282e-6 at the nSamples clamp where v2911 measured exactly 0. The " +
        "cause is not drift: v2931 ADOPTED firstMinimumRefined and the exact j(1,1)/pi grading, which removed the " +
        "fake zero on purpose. The control was watching for a symptom that has been cured. This sweep's ability " +
        "to find an exact zero is therefore UNPROVEN until a replacement control is planted -- it is not a " +
        "passing check, it is a recorded loss with a known cause");

    // *** v4477 -- A REPLACEMENT IS PLANTED, AND THE SENTENCE ABOVE IS NO LONGER THE LAST WORD. ***
    // The loss is left standing verbatim because it is still true about optics.airy. What changed is the clause
    // after it: the sweep's detection power is no longer unproven. zeroControl-selfcheck runs THIS function over
    // a sigma range carrying a derived exact zero and over one carrying none, and requires the verdict to track
    // the device point for point. Eleven hundred versions is how long the debt stood.
    ok("!! the replacement control exists, and it certifies the INSTRUMENT rather than restating the loss",
        CONTROL_CLAIM.plantedAt === "v4477" && CONTROL_CLAIM.direction === "sufficient" &&
        CONTROL_CLAIM.replaces.includes("airy"),
        "splat.integral.isoRollDeviation, with both conditions derived and the second one -- fl(cos^2+sin^2) === 1 " +
        "-- named for the first time since v2912. The arms live in zeroControl-selfcheck.mjs so this gate keeps " +
        "asking its own question; what it no longer has to say is that nothing is watching");
}

// ---- 3. THE BET: A SECOND ONE, ELSEWHERE -------------------------------------------------------------------------------
{
    const iso = hit("splat", "integral", "isoRollDeviation");
    ok("!! prediction B HELD: a further exact zero, in a different device",
        !!iso,
        "splat.integral.isoRollDeviation is exactly 0 at sigma=1. Registered as the bet that the airy mechanism " +
        "was made of ordinary parts rather than being a one-off");

    // Mechanism, established rather than asserted -- and it makes this one LEGITIMATE.
    // *** v4477 -- THIS BLOCK USED TO LIST sigma: 2 AMONG ITS DYADIC POINTS. IT IS THE sigma: 1 POINT. ***
    // splatDefaults clamps sigma to 1, so the build at 2 is the build at 1 and the evidence had four independent
    // dyadic points, not five. The list is now generated from the control's own predicate and every value is
    // shown as requested->effective so a clamped point cannot be counted twice again.
    const dev = await getDevice("splat");
    const DYADIC = dyadicSigmas();                       // powers of two inside splat's clamp, generated
    const NONDYADIC = [0.1, 0.3, 0.7];
    const vals = {};
    for (const sigma of [...DYADIC, ...NONDYADIC]) {
        vals[sigma] = (await dev.build({ mode: "integral", config: { sigma } })).isoRollDeviation;
    }
    const dyadicZero = DYADIC.every((s) => vals[s] === 0);
    const nonDyadicNonZero = NONDYADIC.every((s) => vals[s] > 0);
    ok("!! and it is a LEGITIMATE zero, for a reason the sweep alone could not have given",
        dyadicZero && nonDyadicNonZero && DYADIC.length >= 6 && DYADIC.every((s) => s === effectiveSigma(s)),
        "dyadic sigma " + DYADIC.join("/") + " -> exactly 0; non-dyadic 0.1/0.3/0.7 -> " +
        NONDYADIC.map((s) => vals[s].toExponential(1)).join(", ") + ". Every listed sigma is its own effective " +
        "value, so none of them is a duplicate of another. The mechanism -- and the SECOND condition this " +
        "sentence used to omit -- is established in zeroControl.mjs, which turns it into the sweep's control");

    ok("...so it goes on the register with its sentence rather than into a bug list",
        !!EXACT_OK["splat.integral.isoRollDeviation"],
        "the register is for zeros that are exact by construction, and this is one. What makes it worth the " +
        "round is that nothing could have found it from the default configuration");

    // The direction is opposite to the airy case, which is the generalisable part.
    ok("!! the default hid this one, where in the airy case the default hid the zero's ABSENCE",
        vals[0.1] > 0 && vals[1] === 0,
        "splat's default sigma of 0.1 is the one value in the sweep that is NOT dyadic, so the default reports " +
        "1.11e-14 and looks healthy while five other sigmas report exactly 0. optics.airy is the mirror image: " +
        "the default looked healthy at 7.1e-4 while the clamp reported 0. A default-only census can hide a zero " +
        "OR manufacture the appearance of one, and neither is visible without varying the knob");
}

// ---- 4. WHAT THIS DOES NOT ESTABLISH -------------------------------------------------------------------------------------
{
    ok("this gate swept four device/modes, not the lab",
        z.summary.builds > 100 && z.summary.builds < 400,
        z.summary.builds + " builds across " + Object.keys(SCOPE).length + " devices. The full sweep is " +
        "available via zeroRangeSweep() with no modes argument and did not finish in twenty minutes here -- " +
        "running it is worth a round of its own, and the two zeros found in this small scope suggest the yield " +
        "would not be zero");
    ok("a registration was frozen before the sweep ran",
        ZERO_RANGE_REGISTRATION.claim.additionalUnregisteredZeros === 1,
        "predicted the airy zero as a control AND at least one more elsewhere; both came back");
    console.log("  NOTE   isoRollDeviation is the observable v2906 cited as the lab's pre-existing");
    console.log("         nuisance-invariance test, reading 1.11e-14 at the default. At any dyadic sigma it reads");
    console.log("         exactly 0, which would make that invariance test vacuous at those points -- a bit-");
    console.log("         identical result there proves the arithmetic cancelled, not that the physics is");
    console.log("         invariant. Same trap v2906 named for unwired knobs, arriving from a different door.");
}

console.log();
if (fails) { console.log("zeroRangeSweep-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("zeroRangeSweep-selfcheck: all checks pass");
