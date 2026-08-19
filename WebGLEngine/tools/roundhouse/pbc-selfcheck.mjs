// tools/roundhouse/pbc-selfcheck.mjs
//
// v3301 -- PERIODIC BOUNDARIES BECOME THE 49th GRADED DEVICE, AND THE AGREEMENT IS AT MACHINE PRECISION.
//
// Most devices in this run grade a measurement against a closed form with a tolerance argued for. This one has
// two routes to the same forces and they agree to 2.3e-15 -- floating-point noise, not a tolerance:
//
//   computeForcesPBC     MINIMUM IMAGE. Each pair interacts with exactly one image, the nearest. Justified by
//                        L - r_c > r_c, so it holds only for r_c < L/2 -- and makeBox REFUSES a larger cutoff at
//                        construction rather than letting the convention quietly stop being equivalent.
//   computeForcesImages  an explicit 3x3x3 SHELL of image boxes. Brutally literal. No shortcut to be wrong in.
//
// The clever route could be wrong in a clever way. The literal one has nowhere to hide it.
//
// *** THE TRAP THIS DEVICE HAD TO AVOID, AND IT CAUGHT ME FIRST. *** makeFluid builds a PERFECT LATTICE, and on
// a perfect lattice every force cancels by symmetry. The first measurement compared the two routes and got exact
// agreement -- on max|force| = 0.0000. Two routes agreeing perfectly on ZERO is the emptiest pass available, and
// it looked like the strongest possible result. The device jitters the positions, and this gate asserts the
// forces are NON-ZERO before it asserts anything about agreement.
//
// PLANTED ERROR: wrapWRONG disables the minimum-image displacement, and the forces differ by 1.05 -- the same
// magnitude as the forces themselves. The wrong pairs are interacting entirely.

import { getDevice } from "./devices.mjs";
import { makeBox } from "./pbcBind.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("pbc");
const o = await dev.build({ mode: "agreement" });

// ---- 1. THE COMPARISON HAS CONTENT -- asserted first, because zeros agree perfectly ------------------------------
{
    ok("!! the forces are non-zero, so the agreement below means something",
        o.maxForceMagnitude > 0.1,
        `max |force| = ${o.maxForceMagnitude.toFixed(4)} across ${o.N} particles. makeFluid returns a PERFECT ` +
        "LATTICE where every force cancels by symmetry -- the first version of this measurement compared two " +
        "routes that both returned 0.0000 and agreed exactly. That is the emptiest pass available and it looks " +
        "like the strongest result, so the positions are jittered and this check comes first");
}

// ---- 2. TWO ROUTES, MACHINE PRECISION -----------------------------------------------------------------------------
{
    ok("!! minimum image matches an explicit 3x3x3 image shell to floating-point noise",
        o.worstForceDiff < 1e-12,
        `worst component difference ${o.worstForceDiff.toExponential(2)} on forces up to ` +
        `${o.maxForceMagnitude.toFixed(4)}. Not a tolerance -- the two routes compute the same sum by different ` +
        "means and differ only by summation order. The literal route has no shortcut to be wrong in the same way");

    ok("...and the virials agree too, which is the pressure route",
        Math.abs(o.virialPBC - o.virialImages) / Math.abs(o.virialImages) < 1e-10,
        `${o.virialPBC.toFixed(6)} vs ${o.virialImages.toFixed(6)}. Forces and virial are computed in the same ` +
        "loop, so agreeing on one and not the other would indicate a bug in the accumulation rather than the " +
        "convention");
}

// ---- 3. THE PLANTED ERROR IS THE SIZE OF THE ANSWER ------------------------------------------------------------------
{
    ok("!! wrapWRONG differs by the magnitude of the forces themselves",
        o.plantedForceDiff > o.maxForceMagnitude * 0.5,
        `${o.plantedForceDiff.toExponential(2)} against a max force of ${o.maxForceMagnitude.toFixed(4)}. ` +
        "Disabling minimum image does not perturb the answer, it interacts entirely different pairs -- a particle " +
        "near one face pairs with a distant partner instead of its neighbour through the wall");
}

// ---- 4. MOMENTUM IS CONSERVED EXACTLY, NOT TO TOLERANCE -----------------------------------------------------------------
{
    ok("!! total momentum is zero to machine precision",
        o.momentumDrift < 1e-12,
        `${o.momentumDrift.toExponential(2)}. Every pair force is applied equal and opposite, so the same quantity ` +
        "is added and subtracted -- this is exact in floating point, not approximate, and a wrapping bug breaks " +
        "it instantly");
}

// ---- 5. THE CONVENTION'S PRECONDITION IS ENFORCED, NOT ASSUMED ------------------------------------------------------------
{
    let threw = null;
    try { makeBox({ L: 8, cutoff: 4 }); } catch (e) { threw = e.message; }
    ok("!! makeBox REFUSES a cutoff of L/2 or more",
        !!threw && /L\/2/.test(threw),
        "minimum image is equivalent to the lattice sum only while L - r_c > r_c. At r_c = L/2 that stops being " +
        "true and the convention silently becomes a different calculation. Checking it at construction is the " +
        "difference between a documented precondition and an enforced one");

    ok("...and a valid cutoff is accepted",
        !!makeBox({ L: 8, cutoff: 2.5 }),
        "the guard is strict, not broken");
}

// ---- 6. DECLARED ------------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("pbc declares its mode -- 49 graded of 124 proven",
        m.source === "exported" && m.declared.includes("agreement"),
        `source "${m.source}", modes ${JSON.stringify(m.declared)}`);
}

// ---- 7. THE MODE PLANT, DECLARED SO THE CENSUS CAN ADJUDICATE IT (v3845) --------------------------------------
// *** THE PLANT IS NOT NEW. THE DECLARATION IS. *** wrapWRONG has been computed here since v3301 and reported
// as `plantedForceDiff` -- and plantedCoverage listed pbc as UNCOVERED the whole time, because its source scan
// tests /\bplanted\b/ and `plantedForceDiff` fails that word boundary on the capital F. This section pins the
// declaration itself, so the thing that was invisible cannot go quiet again.
{
    const planted = await dev.build({ mode: "wrapwrong" });

    ok("!! the plant is DECLARED in the shape the census adjudicates -- plantMode / plantFlips / plantKind",
        dev.plantMode === "wrapwrong" && dev.plantFlips === "worstForceDiff" && dev.plantKind === "mode" &&
        dev.modes.includes("wrapwrong") && dev.modes[0] === "agreement",
        'modes ' + JSON.stringify(dev.modes) + ' -- "agreement" stays FIRST so the contract compares the plant ' +
        "against the mode that owns the key. A mode that is not in the list is not a plant, and probeModePlant " +
        "checks exactly that before it builds anything");

    ok("!! and the DECLARED observable actually flips, which is the whole contract",
        Number.isFinite(planted.worstForceDiff) && Number.isFinite(o.worstForceDiff) &&
        planted.worstForceDiff > 1e6 * o.worstForceDiff,
        `worstForceDiff ${o.worstForceDiff.toExponential(3)} -> ${planted.worstForceDiff.toExponential(3)}. ` +
        "A DECLARATION IS NOT A CAPABILITY (v3081): reading `plantMode` off a config proves the identifier " +
        "exists, not that the mode moves anything. This builds both arms and compares");

    ok("!! the plant is the SIZE OF THE ANSWER, not a drift",
        planted.worstForceDiff > 0.5 * o.maxForceMagnitude,
        `${planted.worstForceDiff.toFixed(4)} against forces up to ${o.maxForceMagnitude.toFixed(4)}. Disabling ` +
        "minimum image does not perturb the answer -- the wrong pairs are interacting entirely");

    ok("!! the ANSWER KEY does not move under the plant, so the separation is the route's and not the key's",
        Math.abs(planted.virialImages - o.virialImages) < 1e-9 * Math.abs(o.virialImages),
        `virialImages ${o.virialImages.toFixed(6)} -> ${planted.virialImages.toFixed(6)}. The plant sits on the ` +
        "minimum-image route under test; the explicit 3x3x3 shell it is graded against is untouched. A plant " +
        "that moved BOTH arms would be measuring nothing");

    ok("...and the validator LISTS the plant mode, so it cannot silently revert",
        (await dev.build({ mode: "nonsense-mode" })).worstForceDiff < 1e-12 &&
        dev.defaults({ mode: "wrapwrong" }).mode === "wrapwrong",
        "v3806 wrote a validator as `if (mode !== primary) mode = primary` and SILENTLY REVERTED the plant -- " +
        "both arms read an identical number and the plant fired at nothing. An unrecognised mode falls back to " +
        "`agreement`; `wrapwrong` survives the validator");
}

console.log();
if (fails) { console.log("pbc-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("pbc-selfcheck: all checks pass");
