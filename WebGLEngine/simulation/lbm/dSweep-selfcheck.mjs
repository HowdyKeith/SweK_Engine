// WebGLEngine/simulation/lbm/dSweep-selfcheck.mjs -- v3347
// Grades the recorded sweep. The three runs cost ~120s each; a gate spending six minutes of fluid stops
// being run, which is the lesson the 179-second lab sweep already taught.
import { D_SWEEP_V3347, branchFor } from "./dSweep.mjs";
import { D_SWEEP_PREDICTION } from "./liftPersistence.mjs";

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const [d8, d12, d16] = D_SWEEP_V3347;
const big = branchFor(d12, d16), small = branchFor(d8, d12);

say("D 12->16: f ratio " + big.fRatio.toFixed(4) + " (shedding needs " + big.sheddingWouldNeed.toFixed(2) +
    "), St ratio " + big.stRatio.toFixed(4) + " against D ratio " + big.dRatio.toFixed(4));

ok("!! *** the frequency is CONSTANT across a 33% change in body size -- the DOMAIN-MODE branch ***",
    big.fixedFrequency === true,
    "0.9799. Reynolds changed by the same 33% across that pair, so a frequency invariant to both is set by " +
    "neither the body nor the flow speed");

ok("!! *** ...and its quantitative consequence holds: with f fixed, St must scale as D ***",
    big.stTracksD === true,
    "St ratio 1.3064 against the predicted 1.3333 -- within 2%. THE PREDICTION WAS RECORDED AT v3346 BEFORE " +
    "THIS RAN, so this is a test rather than a description");

ok("!! *** shedding is EXCLUDED, not merely unsupported ***",
    big.sheddingExcluded && small.sheddingExcluded,
    "it needs f PROPORTIONAL TO 1/D, so f should have FALLEN 0.75x from D=12 to D=16. It did not fall at all. " +
    "And St, which shedding holds roughly flat over this Reynolds range, varies FOUR-FOLD across the sweep -- " +
    "both halves of the signature fail at once");

ok("!! the D=8 point fits NEITHER branch and is kept anyway",
    small.fixedFrequency === false && small.stTracksD === false,
    "f there is HALF the other two. At Re 43.2 the flow is plausibly below any instability, and a DFT on a " +
    "featureless signal RETURNS A NUMBER REGARDLESS -- dominantFrequency cannot say 'there is no tone here'. " +
    "So it is evidence of nothing, which is different from evidence against. A SWEEP THAT QUIETLY KEPT ONLY " +
    "ITS TWO AGREEING POINTS WOULD BE THE SHAPE OF EVERY RESULT THIS PROJECT DISTRUSTS");

ok("!! the prediction it was tested against is the one on file, unedited",
    /St stays near/.test(D_SWEEP_PREDICTION.ifShedding) && /f stays fixed/.test(D_SWEEP_PREDICTION.ifDomainMode),
    "if this ever goes red because the prediction was reworded to fit the result, that is the failure it " +
    "exists to catch");

say("NOT CLAIMED: WHAT the mode is. A standing wave set by the domain length, a recirculation-bubble " +
    "oscillation, or an artefact of the outlet condition are all live, and separating them needs the DOMAIN " +
    "varied rather than the body.");

console.log(failed ? "dSweep-selfcheck: " + failed + " FAILED" : "dSweep-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
