// WebGLEngine/simulation/lbm/liftPersistence-selfcheck.mjs -- v3346
//
// Grades the RECORDED sweep, not a re-run: the three runs behind it cost 120s, 120s and 182s, and a gate that
// spent seven minutes of fluid would stop being run -- the lesson the 179-second lab sweep already taught.
// What it CAN check cheaply is that the numbers say what the header claims they say, and that the retraction
// and the un-run prediction are both present rather than quietly dropped.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SETTLE_SWEEP_V3346, liftVsWake, D_SWEEP_PREDICTION } from "./liftPersistence.mjs";
import { prose } from "../../tools/ship/sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const r = liftVsWake();
say("lift shrank " + r.liftShrinkFactor.toFixed(2) + "x when the settle tripled, while stWake moved " +
    (r.stWakeDriftFrac * 100).toFixed(2) + "%");

ok("!! *** more settling COLLAPSES the force oscillation and LEAVES the wake frequency alone ***",
    r.liftShrinkFactor > 5 && r.stWakeDriftFrac < 0.05,
    "0.05188 -> 0.00661 lift against 0.1290 -> 0.1301 stWake. Two observables of one flow and only one of them " +
    "survives settling. A von Karman street exerts an oscillating lift; a frequency at a downstream probe with " +
    "a vanishing force on the body is not obviously a street");

ok("...and no configuration has EVER sustained the lift", r.everSustained === false,
    "three runs across two offsets and a tripled settle. The arc's premise -- that the right settings would " +
    "make it sustain -- has not been met by any setting tried");

ok("!! the isSustained test is exonerated rather than blamed",
    SETTLE_SWEEP_V3346[2].liftAmplitude < SETTLE_SWEEP_V3346[1].liftAmplitude,
    "it compares the second half against 0.85x the first, so a startup transient in the first half would read " +
    "as decay -- that was my first guess and settling past the transient was its fix. THE LIFT STILL FAILS, " +
    "from a LOWER starting amplitude. The test was reporting the truth");

// THE RETRACTION, PINNED. v3341 gated that the repaired stWake agreeing with v2797 is what made it a fix rather
// than a value. That still holds for v2797 -- a genuinely different rig -- and NOT for the configs of my own I
// stacked beside it, which shared D and very nearly U, so a constant St across them is close to restating that
// f did not change.
const src = fs.readFileSync(path.join(HERE, "liftPersistence.mjs"), "utf8");
ok("!! *** the weakened corroboration is RETRACTED in the source, not just softened in a changelog ***",
    prose(src).includes("THE COMPARISON IS WEAKER THAN I SAID"),
    "matched through prose() so re-wrapping cannot defeat it. A retraction that lives only in a changelog is " +
    "one the next reader of this module never sees");

ok("!! and the un-run discriminating test is written down BEFORE it is run",
    /D \(body diameter\)/.test(D_SWEEP_PREDICTION.vary) &&
    /St stays near/.test(D_SWEEP_PREDICTION.ifShedding) && /f stays fixed/.test(D_SWEEP_PREDICTION.ifDomainMode),
    "shedding scales f as U/D so St holds and f MOVES; a domain mode holds f and St moves instead. A prediction " +
    "recorded after the result is not a prediction, and this arc has spent five rounds on hypotheses proposed " +
    "once the answer was already in view");

ok("...and it names its own confound rather than being sold as clean",
    /Blockage moves with D/.test(D_SWEEP_PREDICTION.note),
    "D cannot move without blockage moving, so the prediction is about the DIRECTION of two quantities, and a " +
    "partial answer is the honest ceiling");

console.log(failed ? "liftPersistence-selfcheck: " + failed + " FAILED" : "liftPersistence-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
