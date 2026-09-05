// tools/roundhouse/zeroControl-selfcheck.mjs
//
// Run: node tools/roundhouse/zeroControl-selfcheck.mjs   (~2s)
// Gated by tools/ship/selfchecks.mjs (discovery gate -- this file is found by its name, not by a list).
//
// v4477 -- THE REPLACEMENT POSITIVE CONTROL, AND THE ARMS THAT MAKE IT ONE.
//
// The debt, the mechanism and the three tiers are documented in zeroControl.mjs. This file is the part that can
// go red. Read the arms in order: 1-2 certify the PREDICATE, 3-6 certify the CLAIM, 7-9 certify the INSTRUMENT,
// which is the only reason a positive control exists at all.
//
// *** THE PREDICATE HAD A ROUNDING BUG AND THE GATE'S OLD LITERALS WOULD HAVE HIDDEN IT. *** dyadicSquare was
// first written as Number.isInteger(Math.log2(q)). Math.log2 rounds onto the integer for arguments one ulp away
// from a power of two, so the predicate promised an exact zero at 252 of 2002 cells and did not get one. Every
// value in the register's own list -- 0.125, 0.25, 0.5, 1 -- is one the broken predicate gets right. Arm 2
// keeps the trap value in the suite so the fix cannot quietly regress to the obvious spelling.

// ---- SABOTAGE LOG -- 31 edits across this gate and sweepDevice-selfcheck, every one caught by name --------------
// Round one, 16 edits against this gate: claim direction flipped to biconditional (1 red); the power-of-two test
// reverted to the log2 spelling (7); tier A's angle condition dropped (3); guaranteedButNonZero hardcoded empty
// (1); a roll angle moved off the unit-circle-exact set (5); sweepDevice recording the request as the effective
// value (2); the coercion count pinned to zero (1); the at-string dropping requested->effective (1); the sweep
// reporting every error-like field as a zero (4); the sweep never reporting one (3); the knobs filter ignored
// (4); the ranges override ignored (6); splat's sigma clamp removed (2); the register entry renamed (1); rollAt
// comparing the base against itself (3).
//
// *** ONE WENT 0 RED AND IT WAS A FINDING. *** Replacing the device's `for (const th of ISO_ROLL_ANGLES)` with a
// literal [0.3, 1.1, 2.4] left this gate GREEN. The comparison of the control's probe against the device ran
// only at dyadic sigmas, where both sides are exactly zero by construction -- a column of zeros agrees with a
// column of zeros however the device is rolling. That is the trap v2912 recorded ABOUT THIS VERY OBSERVABLE:
// "a bit-identical result there proves the arithmetic cancelled, not that the physics is invariant." Closed by
// probing non-dyadic sigmas too AND by the source check, because the observable is a MAX and no assertion over
// its value can see a non-dominant angle change: swapping 2.7 for 2.4 moves the number at none of the eight
// sigmas probed.
//
// Round two, 15 more: the angle-literal sabotage above now reds by name; effectiveSigma echoing the request (1);
// cameraRotationIsNoOp pinned true (1) and pinned false (2); effectiveKnob swallowing the real answer (5) and
// reporting a throwing defaults() as the request (1); the reserved-key refusal removed (1); distinctEffective
// counted over undefineds (1); coerced treating unknown as false (1) and as not-coerced (2); answerable counting
// unanswerable points (1). Three of these were 0 RED on first pass -- effectiveSigma, cameraRotationIsNoOp, and
// sweepDevice's whole null branch -- and each was the same species: a component asserted, its ability to say the
// OTHER answer never asserted. Fixed by adding a discriminating arm to each, not by adding a stronger assertion
// to the same one.

import {
    CONTROL, CONTROL_CLAIM, dyadicSquare, isPowerOfTwo, unitCircleExact, guaranteedZero,
    effectiveSigma, cameraRotationIsNoOp, rollAt, deviceRoll, controlGrid, dyadicSigmas,
    angleLadder, splitAngles, coercionCensus, COERCION_CENSUS_V4477,
} from "./zeroControl.mjs";
import { ISO_ROLL_ANGLES } from "./splatBind.mjs";
import { zeroRangeSweep } from "./zeroRangeSweep.mjs";
import { EXACT_OK } from "./exactZeroRegister.mjs";
import { noComments } from "../ship/sourceScan.mjs";
import { readFile } from "node:fs/promises";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const DY = dyadicSigmas();
const OTHER = [0.005, 0.05, 0.09, 0.1, 0.13, 0.3, 0.7, 0.9];
const ANG = angleLadder();
const { exact: exactAngles, inexact: inexactAngles } = splitAngles(ANG);
const grid = controlGrid({ sigmas: [...DY, ...OTHER], angles: ANG });

// ---- 1. THE CLAIM IS FROZEN, AND IT CLAIMS ONE DIRECTION -------------------------------------------------------------
{
    ok("the control's claim is a frozen object, not prose in a comment",
        Object.isFrozen(CONTROL_CLAIM) && CONTROL_CLAIM.direction === "sufficient",
        "direction=" + CONTROL_CLAIM.direction + ". A control that claimed the biconditional would be a fitted " +
        "curve wearing a derivation's clothes -- see arm 5, where an exact zero appears outside the derivation");
    ok("it names BOTH conditions, and records that the second was silent for 1565 versions",
        CONTROL_CLAIM.conditions.length === 2 && CONTROL_CLAIM.secondConditionSilentSince === "v2912",
        "the register's sentence for this field names only the exponent shift. Arm 6 measures what that omission " +
        "costs: 322 cells where the one-condition reading predicts an exact zero and the deviation is non-zero");
    ok("the field it certifies is the field it is registered under",
        !!EXACT_OK[`${CONTROL.device}.${CONTROL.mode}.${CONTROL.field}`] &&
        CONTROL_CLAIM.field === `${CONTROL.device}.${CONTROL.mode}.${CONTROL.field}`,
        CONTROL_CLAIM.field + ". A control pointed at a field the register does not carry would certify nothing");
}

// ---- 2. THE PREDICATE ITSELF, INCLUDING THE TRAP IT FAILED ---------------------------------------------------------
{
    const TRAP = 0.031249999999999993;                 // one ulp below 2^-5
    ok("!! the obvious power-of-two test is WRONG, and the trap value is kept in the suite",
        Number.isInteger(Math.log2(TRAP)) && !isPowerOfTwo(TRAP) && isPowerOfTwo(0.03125),
        "Math.log2(" + TRAP + ") === " + Math.log2(TRAP) + " exactly, so Number.isInteger accepts a value that " +
        "is not a power of two. The mantissa test rejects it and accepts 2^-5. This is not hypothetical: it is " +
        "the bug this control shipped with for the length of one afternoon");
    ok("the mantissa test agrees with an independent spelling on the whole exponent range",
        (() => {
            for (let e = -60; e <= 60; e++) {
                const q = Math.pow(2, e);
                if (!isPowerOfTwo(q)) return false;
                if (isPowerOfTwo(q * (1 + Number.EPSILON)) && q * (1 + Number.EPSILON) !== q) return false;
            }
            return !isPowerOfTwo(0) && !isPowerOfTwo(-1) && !isPowerOfTwo(NaN) && !isPowerOfTwo(Infinity) &&
                   isPowerOfTwo(Number.MIN_VALUE) && !isPowerOfTwo(3 * Number.MIN_VALUE);
        })(),
        "121 exact powers of two accepted, each of their upward neighbours rejected, and the subnormal edge " +
        "tested in both directions -- Number.MIN_VALUE is 2^-1074 and is a power of two; three times it is not");
    ok("dyadicSquare asks about sigma SQUARED, which is where the arithmetic lives",
        dyadicSquare(0.125) && dyadicSquare(1) && !dyadicSquare(0.1) &&
        !dyadicSquare(Math.pow(2, -1.5)) && isPowerOfTwo(Math.pow(2, -1.5) * Math.pow(2, -1.5)) === false,
        "2^-1.5 squares to one ulp below 2^-3 -- an irrational sigma whose square LOOKS dyadic to the broken " +
        "test. dyadicSigmas() generates exactly these candidates, which is how the bug surfaced");
}

// ---- 3. THE GUARANTEE: TIER A HAS NO COUNTEREXAMPLE ------------------------------------------------------------------
{
    ok("the grid is generated, not listed, and contains both answers",
        DY.length >= 6 && exactAngles.length > 20 && inexactAngles.length > 20 && grid.zeros > 0 && grid.nonZeros > 0,
        DY.length + " dyadic sigmas from powers of two, " + exactAngles.length + " angles satisfying the unit-circle " +
        "condition and " + inexactAngles.length + " violating it, over " + grid.cells.length + " cells: " +
        grid.zeros + " exactly zero, " + grid.nonZeros + " not. A grid that was all one answer would grade nothing");
    ok("!! TIER A: every cell the derivation guarantees reads EXACTLY zero, with no counterexample",
        grid.guaranteed > 500 && grid.guaranteedButNonZero.length === 0,
        grid.guaranteed + " guaranteed cells, 0 non-zero. This is the control: a generator of zeros derived from " +
        "the exponent arithmetic, checked against the shipped projection. It read 252 counterexamples before the " +
        "predicate was fixed, which is what a working control looks like when the claim is wrong");
    // A POSITIVE CONTROL FOR THE POSITIVE CONTROL. "0 counterexamples" grades nothing unless the list can fill.
    const wrong = controlGrid({ sigmas: [...DY, ...OTHER], angles: ANG, predict: (s) => dyadicSquare(s) });
    ok("!! the counterexample path FIRES when the prediction is wrong -- the empty list above is not hardcoded",
        wrong.guaranteedButNonZero.length > 200 && grid.guaranteedButNonZero.length === 0,
        "re-running the same grid with the REGISTER'S reading -- dyadic sigma, angle condition dropped -- yields " +
        wrong.guaranteedButNonZero.length + " counterexamples. Same cells, same measurements, one weaker rule. " +
        "An assertion that only ever sees an empty list cannot tell an empty list from a broken accumulator");
    // Tier B must be able to say NO, or "it never rotates at a guaranteed cell" is a tautology. Found by
    // searching the same grid rather than named as a literal.
    const rotates = grid.cells.filter((c) => !cameraRotationIsNoOp(c.sigma, c.theta));
    ok("tier B discriminates: the camera-space rotation IS a no-op somewhere and is NOT elsewhere",
        rotates.length > 100 && rotates.length < grid.cells.length,
        rotates.length + " of " + grid.cells.length + " cells rotate the covariance to a different bit pattern. " +
        "A predicate that answered 'no-op' everywhere would make the arm below pass with no content");
    ok("A implies B: at every guaranteed cell the camera-space rotation is a bit-for-bit no-op",
        grid.guaranteedButRotating.length === 0,
        "the exponent argument is a claim about W*diag(s2)*W^T, one level below the observable. If it held at the " +
        "projected number and not at the covariance, the agreement would be coincidence rather than mechanism");
}

// ---- 4. THE CONTROL IS ABOUT THE SHIPPED OBSERVABLE, NOT A LOCAL COPY ------------------------------------------------
{
    const dev = await Promise.all(DY.map(deviceRoll));
    const local = DY.map((s) => Math.max(...ISO_ROLL_ANGLES.map((t) => rollAt(s, t))));
    ok("the device's own isoRollDeviation is exactly zero at every dyadic sigma",
        dev.every((v) => v === 0),
        "through splatDevice.build(), which is the object zeroRangeSweep builds. " + DY.length + " sigmas");
    // Non-dyadic sigmas too, so this is not a comparison of zero against zero. v2912's own note on this field
    // says a bit-identical result "proves the arithmetic cancelled, not that the physics is invariant" -- and
    // the first version of this arm compared local against device ONLY at dyadic sigmas, where both are zero
    // by construction. Sabotaging the device's angle list left it green.
    const probe = [...OTHER, ...DY];
    const devP = await Promise.all(probe.map(deviceRoll));
    const locP = probe.map((s) => Math.max(...ISO_ROLL_ANGLES.map((t) => rollAt(s, t))));
    ok("...and the control's probe reproduces it at non-dyadic sigmas, where the numbers are not all zero",
        locP.every((v, i) => v === devP[i]) && devP.filter((v) => v > 0).length >= 5,
        probe.length + " sigmas, " + devP.filter((v) => v > 0).length + " of them non-zero. Comparing only the " +
        "dyadic rows would agree on a column of zeros however the device were rolling");

    // *** THE VALUE CANNOT CLOSE THIS GAP, SO THE SOURCE DOES, AND THE REASON IS STATED. ***
    // isoRollDeviation is a MAX over three angles. Changing a non-dominant angle -- 2.7 to 2.4, say -- leaves
    // the reported number bit-identical at every sigma tested, because the maximum comes from elsewhere. No
    // assertion over the device's output can see that edit. What the control needs is that the angles it
    // predicts with ARE the angles the device rolls through, and that is a structural fact, not a numeric one.
    const src = noComments(await readFile(new URL("./splatBind.mjs", import.meta.url), "utf8"));
    ok("!! the device rolls through ISO_ROLL_ANGLES itself -- checked in its source, because a max cannot show it",
        /for\s*\(const th of ISO_ROLL_ANGLES\)/.test(src) && !/for\s*\(const th of \[/.test(src) &&
        ISO_ROLL_ANGLES.length === 3,
        "the observable maxes over three angles, so replacing one with a value the control does not know about " +
        "is invisible in the number -- measured: swapping 2.7 for 2.4 changes nothing at any of the eight " +
        "sigmas probed above. The export is the one home; this asserts the loop reads it and holds no literal");
    const def = effectiveSigma(0.1);
    ok("the observable is not constantly zero: the DEFAULT configuration reads non-zero",
        (await deviceRoll(def)) > 0,
        "sigma " + def + " -> " + (await deviceRoll(def)).toExponential(3) + ". A field that were always zero " +
        "would make arm 3 vacuous, and this is the direction v2912 already noted: the default HIDES this zero");
}

// ---- 5. SUFFICIENT, NOT NECESSARY -- THE RESIDUE IS EXHIBITED, NOT ASSERTED AWAY -------------------------------------
{
    // Found by searching, so the counterexample is a property of the arithmetic rather than a literal that passes.
    const found = [];
    for (let i = 1; i <= 400 && found.length < 3; i++) {
        const s = effectiveSigma(i / 400);
        if (!dyadicSquare(s) && ISO_ROLL_ANGLES.every((t) => rollAt(s, t) === 0)) found.push(s);
    }
    ok("!! an exact zero exists OUTSIDE the derivation, and the search finds it",
        found.length > 0 && grid.unexplainedZero.length > 0,
        "non-dyadic sigmas reading exactly zero at all three roll angles: " + found.join(", ") + ". Two mechanisms " +
        "produce these -- the camera-space product rounds back onto s2 by coincidence, or the J M J^T chain " +
        "absorbs a real difference. Neither is derivable in advance, so the control does not claim them");
    ok("...which is why the claim is one-directional, in the frozen object and not only in prose",
        CONTROL_CLAIM.doesNotPredict.includes("0.13") && !guaranteedZero(0.13) && (await deviceRoll(0.13)) === 0,
        "sigma 0.13 is not dyadic, is not guaranteed, and reads exactly 0. A biconditional control would be red " +
        "right now for a legitimate reason, which is the failure mode that makes people delete controls");
}

// ---- 6. WHAT THE REGISTER'S MISSING CONDITION COSTS -------------------------------------------------------------------
{
    let cells = 0, zero = 0;
    for (const s of DY) for (const t of inexactAngles) { cells++; if (rollAt(s, t) === 0) zero++; }
    ok("!! the one-condition reading mispredicts EVERY cell where the angle condition fails",
        cells > 200 && zero === 0,
        cells + " cells with a dyadic sigma and fl(cos^2+sin^2) != 1: " + zero + " read zero. The register says " +
        "'exactly zero for power-of-two sigma' full stop, which would predict a zero at all " + cells + ". The " +
        "device's three angles all satisfy the silent condition, so nothing in the tree ever noticed");
    ok("the device's own three angles are on the satisfying side, measured rather than assumed",
        ISO_ROLL_ANGLES.every(unitCircleExact),
        "[" + ISO_ROLL_ANGLES.join(", ") + "] all give fl(cos^2 t + sin^2 t) === 1. " + inexactAngles.length +
        " of " + ANG.length + " angles on the ladder do not -- about one in six. Three for three is luck, not design");
}

// ---- 7. THE INSTRUMENT ARM: THE SWEEP ITSELF, IN BOTH DIRECTIONS ------------------------------------------------------
// This is the part that makes it a POSITIVE CONTROL rather than a fact about splat. The arms above certify a
// generator of exact zeros; these run zeroRangeSweep over it and require its verdict to track the device.
{
    const key = `${CONTROL.device}.${CONTROL.mode}.${CONTROL.knob}`;
    const withZero = [0.01, 0.03, 0.07, 0.09, 0.11, 0.17, 0.125];       // one guaranteed zero, six not
    const without = [0.01, 0.03, 0.07, 0.09, 0.11, 0.17, 0.19];         // the same six, and no guaranteed zero
    const run = (values) => zeroRangeSweep({ modes: { splat: ["integral"] }, knobs: [CONTROL.knob], ranges: { [key]: values } });
    const pos = await run(withZero), neg = await run(without);
    const hit = (z) => z.rows.some((r) => r.device === CONTROL.device && r.mode === CONTROL.mode && r.field === CONTROL.field);

    ok("!! the sweep FINDS the planted zero",
        hit(pos) && pos.builds === withZero.length,
        "sigma range " + withZero.join(", ") + " -> " + pos.rows.length + " zero field(s) over " + pos.checked +
        " error-like values checked. This is the assertion v3314 said could not be made and v4353 declined to make");
    ok("!! and it reports NOTHING when the same range carries no zero -- it is not answering yes to everything",
        !hit(neg) && neg.builds === without.length && neg.checked > 0,
        "sigma range " + without.join(", ") + " -> " + neg.rows.length + " zero fields over " + neg.checked +
        " values checked. Six of the seven sigmas are shared with the run above, so the difference is the plant");

    // The bidirectional form: the sweep's verdict must match the device at EVERY point, not just in aggregate.
    for (const [label, values, z] of [["planted", withZero, pos], ["control", without, neg]]) {
        const truth = [];
        for (const v of values) if ((await deviceRoll(v)) === 0) truth.push(effectiveSigma(v));
        const row = z.rows.find((r) => r.field === CONTROL.field);
        const reported = row ? row.at.map((a) => Number(a.split("=").pop().split("->").pop())) : [];
        ok("the " + label + " run's hits equal the device's own zeros, point for point",
            truth.length === reported.length && truth.every((t) => reported.includes(t)),
            "device zero at [" + truth.join(", ") + "], sweep reported [" + reported.join(", ") + "]. An aggregate " +
            "match can hide a hit at the wrong point; this cannot");
    }
}

// ---- 8. THE COORDINATE THE HIT IS RECORDED IN -------------------------------------------------------------------------
{
    const key = `${CONTROL.device}.${CONTROL.mode}.${CONTROL.knob}`;
    // 2 and 3 are BEYOND splat's clamp of 1, which is exactly the shape that manufactured the false mechanism.
    const z = await zeroRangeSweep({ modes: { splat: ["integral"] }, knobs: [CONTROL.knob], ranges: { [key]: [0.1, 0.3, 0.7, 2, 3] } });
    const row = z.rows.find((r) => r.field === CONTROL.field);
    ok("!! a request beyond the clamp is recorded as requested->effective, not as the request",
        !!row && row.at.every((a) => a.includes("->")) && row.at.every((a) => a.endsWith("->1")),
        (row ? row.at.join("  ") : "NO ROW") + ". Before v4477 these read 'sigma=2' and 'sigma=3' -- two labels " +
        "for one build at sigma=1, and the seven such rows are what produced the phantom second disjunct");
    ok("the sweep totals its own coercion rather than leaving it to be rediscovered",
        z.coercion.points === 5 && z.coercion.coerced === 2 && z.coercion.collapsedRanges === 1,
        JSON.stringify(z.coercion) + ". Two of five points were coerced and the five requested values built four " +
        "distinct configurations. Across the full device table the figures are 5612 of 17759 coerced");
    // effectiveSigma is what the control PREDICTS at. Predicting at the request while measuring at the clamp
    // is the entire false-mechanism story, so the clamp is asserted here rather than assumed from splatBind.
    ok("!! effectiveSigma reports the clamp, which is the value the false mechanism came from mis-reading",
        effectiveSigma(3) === 1 && effectiveSigma(1.05) === 1 && effectiveSigma(0.001) === 0.005 &&
        effectiveSigma(0.125) === 0.125 &&
        !guaranteedZero(3) && guaranteedZero(effectiveSigma(3)) && (await deviceRoll(3)) === 0,
        "sigma 3 and 1.05 both become 1; 0.001 becomes 0.005; 0.125 is untouched. And the two questions give " +
        "OPPOSITE answers: guaranteedZero(3) is false because 9 is not a power of two, guaranteedZero of the " +
        "EFFECTIVE 1 is true, and the device reads exactly 0. The predicate takes the value the arithmetic uses; " +
        "asking it about the request is the mistake that produced the phantom 'sigma >= 1' disjunct");
    // THE WIDE NUMBER, RE-DERIVED RATHER THAN QUOTED. Every count this round states about the full sweep is
    // this call's output; it runs no device builds, so a gate can afford to check the figure it cites.
    const census = await coercionCensus();
    ok("!! the coercion census re-derives to the frozen record, so the round's wide numbers are checkable",
        census.sweptPoints === COERCION_CENSUS_V4477.sweptPoints &&
        census.coerced === COERCION_CENSUS_V4477.coerced &&
        census.collapsedRanges === COERCION_CENSUS_V4477.collapsedRanges &&
        census.knobDropped === COERCION_CENSUS_V4477.knobDropped &&
        census.coerced / census.sweptPoints > 0.3,
        JSON.stringify(census) + " against the record. 5612 of 17759 points -- 31.6% -- are labelled with a " +
        "configuration the device did not use, and 1225 knob-ranges build fewer configurations than they " +
        "request. A number in a round note that the gate cannot re-derive is a number nobody will check again");
    ok("...and splat's sigma is NOT among the collapsed ranges, which is why this survived a full sweep",
        COERCION_CENSUS_V4477.splatSigmaCollapsesUnderKnobRange === false &&
        new Set([0.01, 0.025, 0.05, 0.1, 0.2, 0.4, 1].map(effectiveSigma)).size === 7,
        "knobRange(0.1) stops at 1.0, so the sweep never asks splat for a sigma past its clamp. The clamp was " +
        "hit by a hand-chosen range walked while READING the field, not by the instrument -- v4353 ran the full " +
        "sweep and the mislabelling did not show itself there");
    ok("an unanswerable coercion reports null, not false",
        (await zeroRangeSweep({ modes: { splat: ["integral"] }, knobs: [CONTROL.knob], ranges: { [key]: [0.1, 0.125] } })).coercion.answerable === 2,
        "a device with no defaults() cannot say what it used, and 'unknown' must not read as 'not coerced'. splat " +
        "answers for both points here; the null path is exercised by sweepDevice-selfcheck");
}

// ---- 9. WHAT THIS ROUND DOES NOT DO -----------------------------------------------------------------------------------
{
    ok("this does NOT restore the airy control, and does not claim to",
        CONTROL_CLAIM.replaces.includes("airy") && CONTROL_CLAIM.replaces.includes("cured"),
        "optics.airy.airyRingErrFrac was cured at v2931 on purpose. It is not coming back and should not. What " +
        "was owed was A control, not THAT control");
    ok("one control, one device, one knob -- the sweep's power over the other 85 device/modes is still unproven",
        CONTROL.device === "splat" && CONTROL.knob === "sigma",
        "arm 7 certifies that zeroRangeSweep detects an exact zero in splat.integral when one is present and " +
        "declines when it is not. It does NOT establish that the sweep would find a zero in kerr, wolff or " +
        "percolation -- a second control elsewhere is a round of its own");
    console.log("  NOTE   the 5612 mislabelled points are FIXED IN THE RECORDING and not in the ranges: knobRange");
    console.log("         still generates values past every clamp, so the sweep still spends about a third of its");
    console.log("         builds re-measuring configurations it has already visited. Making the range clamp-aware");
    console.log("         would change what the sweep covers, which is a different question from what it reports.");
}

console.log();
if (fails) { console.log("zeroControl-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("zeroControl-selfcheck: all checks pass");
