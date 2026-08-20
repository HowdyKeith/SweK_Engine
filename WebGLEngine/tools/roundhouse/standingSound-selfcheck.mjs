// tools/roundhouse/standingSound-selfcheck.mjs
//
// Run: node tools/roundhouse/standingSound-selfcheck.mjs   (~30s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3101 -- THE FOUR CRITERIA SAY THE NUMBER IS WELL BEHAVED. THEY DO NOT SAY IT IS MEANINGFUL.
//
// v3100 gave the lab assumptions that travel with a value, borrowed from wyrm_math. This applies that rule one
// layer up, to a STANDING -- and the demonstration is the point of the round.
//
// lens.deflect at the DEVICE DEFAULT b = 10 PASSES ALL FOUR CRITERIA. The pre-registration holds, the nuisance
// sweep is invariant, dphi converges, the libm shift moves nothing. And the ray is in the MID band, where
// deflectionErrFrac is null BY DESIGN and the 4M/b answer key does not apply at all. CONVERGENCE AND INVARIANCE
// ARE PROPERTIES OF THE ARITHMETIC; whether the number means anything is a separate claim, and until v3100 it
// lived in a comment.
//
// IT GETS ITS OWN VERDICT RATHER THAN BEING DOWNGRADED. "NOT CORROBORATED" would say the criteria failed, and
// they did not. "UNSOUND AT THIS OPERATING POINT" keeps "this number is wrong" and "this number was taken
// somewhere it does not apply" as the two different findings they are -- the two-things-one-label shape this
// tree has met more than any other, refused in advance this time.

import { corroborateFully } from "./corroborateFully.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { REFINEMENT_KNOBS } from "./refinementKnobs.mjs";
import { LENS_DEFLECT_REGISTRATION } from "./lensRegistration.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const at = async (rBase, nBase) => corroborateFully({
    device: "lens", mode: "deflect", field: "deflectionMeasured",
    refinement: { ...REFINEMENT_KNOBS.lens, base: rBase },
    nuisance: { ...NUISANCE_KNOBS.lens, base: nBase },
    registration: LENS_DEFLECT_REGISTRATION,
});

// ---- 1. THE SHIPPED STANDING SURVIVES --------------------------------------------------------------------------
const good = await at(REFINEMENT_KNOBS.lens.base, NUISANCE_KNOBS.lens.base);
{
    ok("!! the shipped operating point is still CORROBORATED",
        good.standing === "CORROBORATED" && good.soundAtPoint === true,
        "M=1 b=60 dphi=2e-4 -- " + good.assumptionNote + ". A rule that changed an existing correct standing " +
        "would be a rule nobody kept");
    ok("...and the standing now CARRIES the point it was taken at",
        good.operatingPoint && good.operatingPoint.b === 60 && Array.isArray(good.assumptions),
        JSON.stringify(good.operatingPoint) + " with " + good.assumptions.length + " conditions attached. A " +
        "standing whose operating point is not stated cannot be reproduced or disputed");
}

// ---- 2. THE DEMONSTRATION: FOUR PASSES, AND STILL NOT A RESULT ---------------------------------------------------
{
    const mid = await at({ M: 1, b: 10 }, { M: 1, b: 10, dphi: 2e-4 });
    const passes = Object.values(mid.criteria).filter((c) => c.pass).length;
    ok("!! at the DEVICE DEFAULT all four criteria still pass",
        passes === 4 && mid.failedCriteria.length === 0,
        "c1 through c4 all green at b = 10. Convergence and invariance are properties of the ARITHMETIC and " +
        "they do not care that the answer key does not apply here");
    ok("!! ...and the standing is UNSOUND AT THIS OPERATING POINT",
        mid.standing === "UNSOUND AT THIS OPERATING POINT" && mid.soundAtPoint === false,
        mid.assumptionNote.slice(0, 130));
    ok("...reported as its own verdict, NOT as NOT CORROBORATED",
        mid.standing !== "NOT CORROBORATED",
        "downgrading would say the criteria failed, and they did not. 'This number is wrong' and 'this number " +
        "was taken somewhere it does not apply' are two different findings and two different fixes");
}

// ---- 3. NO DECLARED ASSUMPTIONS IS NOT NO ASSUMPTIONS ---------------------------------------------------------------
{
    ok("!! a device with nothing declared says so instead of passing quietly",
        good.soundAtPoint === true &&
        (await (async () => {
            const q = await corroborateFully({
                device: "quantum", mode: "well", field: "ratio21",
                refinement: REFINEMENT_KNOBS.quantum, nuisance: { param: "L", values: [1, 2], base: { L: 1 } },
                registration: LENS_DEFLECT_REGISTRATION,
            });
            return q.soundAtPoint === null && /not the same as none applying/.test(q.assumptionNote);
        })()),
        "soundAtPoint is null and the note says so, rather than defaulting to true and reading as a pass. The " +
        "'audited versus never asked' distinction, third time this tree has had to draw it");
}

console.log();
if (fails) { console.log("standingSound-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("standingSound-selfcheck: all checks pass");
