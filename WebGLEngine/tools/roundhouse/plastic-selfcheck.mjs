// tools/roundhouse/plastic-selfcheck.mjs
//
// Run: node tools/roundhouse/plastic-selfcheck.mjs   (~0.3s -- 261ms measured at v4191, up from 0.2s: section 4a
//      builds creepFree at five yieldStrains so the budget is checked over a grid rather than at one point)
//
// v3211 -- PLASTICITY GRADED, AND BOTH OF ITS PARAMETERS RECOVERED FROM BEHAVIOUR.
//
// This is the last of the four xpbd modules v3200 found with a checkable external key. muscle was REFUSED on
// the rule that killed it -- A KEY IS EXTERNAL WHEN THE ROUTE THAT MEASURES THE VALUE IS INDEPENDENT OF THE
// ROUTE THAT SET IT -- so the first question for this device was whether it survives the same test. It does:
// nothing here reads opts back. The yield is BISECTED out of a yes/no about permanent set, and creep is
// REGRESSED out of six of them.
//
// *** WHAT THIS GRADES THAT plastic-selfcheck DOES NOT, STATED PLAINLY, BECAUSE A DEVICE RESTATING ITS MODULE'S
// OWN GATE MOVES THE COVERAGE COUNT AND GRADES NOTHING NEW: ***
//   - the module's gate proves the closed form AT ONE POINT (strain 0.3, yield 0.1, creep 0.5). This recovers
//     the yield across five settings and creep as a SLOPE. One point is arithmetic; a slope is the rule.
//   - the module's gate exercises TENSION only. The compression branch is a separate `sign` path in the same
//     function, and until this device nothing in 604 gates had ever run it.
//   - the module's gate asserts the cap is never EXCEEDED. That is one-sided, and A MODULE THAT NEVER YIELDED
//     AT ALL WOULD PASS IT VACUOUSLY. This asserts the cap is ATTAINED and then BIT-STILL.
//   - the module's gate reads "below yield nothing is permanent" through a cloth simulation with a 1e-12
//     tolerance. This reads it directly, at a strain ONE ULP short of the yield, and the answer is EXACTLY 0.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
// v3204's rule, and this file needed it TWICE on its first run: IF THE TREE ALREADY ANSWERS A QUESTION, IMPORT
// THE ANSWER. Both prose checks below failed at first -- one because the sentence WRAPPED across a comment line
// break, one because I typed it in lower case and the source SHOUTS it. prose() collapses the wrapping and the
// match is case-insensitive, so neither can recur. Only 15 of the 117 gates reading shipping source go through
// sourceScan; the two nearest neighbours to this file (gyroscope, md) still hand-roll their own strip.
import { noComments, proseHas } from "../ship/sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);
const G = await import(pathToFileURL(path.join(HERE, "gradedCoverage.mjs")).href);
const dev = await D.getDevice("plastic");
const src = fsMod.readFileSync(path.join(HERE, "plasticBind.mjs"), "utf8");

const y = await dev.build({ mode: "yield" });
const cr = await dev.build({ mode: "creep" });
const cap = await dev.build({ mode: "cap" });
const cf = await dev.build({ mode: "creepFree" });

// ---- 1. THE KEY IS THE YIELD ITSELF, BISECTED OUT OF A YES/NO ------------------------------------------------------
{
    ok("!! *** yieldStrain is RECOVERED BY BISECTION, in tension and in compression ***",
        y.yieldWorstErrAbs < 1e-14 && Math.abs(y.yieldTension - y.yieldKey) < 1e-14 &&
        Math.abs(y.yieldCompression + y.yieldKey) < 1e-14,
        "worst " + y.yieldWorstErrAbs.toExponential(2) + " across yield = 0.02 to 0.35. Tension " +
        y.yieldTension.toPrecision(17) + ", compression " + y.yieldCompression.toPrecision(17) + ". NOTHING " +
        "HERE READS THE PARAMETER BACK -- the bisection only ever asks whether a permanent set appeared, which " +
        "is the rule muscle's key failed and this one has to satisfy");

    ok("!! *** and below yield the permanent set is EXACTLY ZERO, not small ***",
        y.belowYieldExactlyZero === 1,
        "zero at 0, 0.01, 0.05, 0.099 and at ONE ULP BELOW THE YIELD ITSELF. friction's bisection needed a " +
        "1e-3 moving line because a stuck particle still creeps 6e-19 of float noise; THIS NEEDS NO LINE AT " +
        "ALL, because the yield test is a BRANCH and not an accumulation. A leaky yield would leave 1e-18 -- " +
        "which every magnitude tolerance in the module's own gate accepts, and which this rejects");

    ok("...and the compression branch had never been run before this device",
        proseHas(src, /compression branch is a separate `sign` path/i),
        "the module's gate stretches ONE constraint to strain 0.3 and stops. A branch nothing exercises is a " +
        "branch nothing can report on");
}

// ---- 2. THE SECOND KEY IS A SLOPE ----------------------------------------------------------------------------------
{
    ok("!! *** creep comes back by REGRESSION over six strains ***",
        cr.creepErrAbs < 1e-14 && cr.creepPoints === 6,
        "regressed " + cr.creepRegressed.toPrecision(17) + " against a declared " + cr.creepKey + ", error " +
        cr.creepErrAbs.toExponential(2) + ". A SLOPE CANNOT BE SATISFIED BY GETTING ONE POINT RIGHT, which is " +
        "all a single-strain check asks for -- and only the EXCESS beyond yield flows, so the slope is the rule " +
        "rather than the arithmetic");

    ok("...and the cap is lifted so it cannot clip the line being fitted",
        /maxStrain: 50/.test(noComments(src)) && proseHas(src, /cap lifted so it cannot clip the line being fitted/i),
        "a cap inside the fitted range would flatten the top of the line and the regression would return a " +
        "creep smaller than the declared one, for a reason that has nothing to do with creep");
}

// ---- 3. THE CAP IS ATTAINED, NOT MERELY RESPECTED ------------------------------------------------------------------
{
    ok("!! *** sustained overload SATURATES on exactly the cap, and then stops moving ***",
        cap.capErrAbs === 0 && cap.capRatchets === 0,
        "final permanent strain " + cap.capAttained.toPrecision(17) + " against a cap of " + cap.capKey +
        ", bit-exact at 0.25, 0.5 and 1.0, and BIT-STILL for the remaining 494 passes. THE MODULE'S OWN GATE " +
        "ASSERTS THE CAP IS NEVER EXCEEDED, WHICH A MODULE THAT NEVER YIELDED AT ALL WOULD PASS VACUOUSLY");

    ok("...and it cannot ratchet, because the cap is taken against restOrig and not against its own output",
        cap.capRatchets === 0 && proseHas(src, /cap taken against the CURRENT base rather than the original would grow/i),
        "a cap measured against the CURRENT base would grow by (1+cap) every pass and never settle. 'Does it " +
        "stop moving' is the observable; 'is it under the line' is not");
}

// ---- 4. THE LOAD-BEARING NEGATIVE, AND IT FAILS BY A PREDICTED AMOUNT -----------------------------------------------
{
    ok("!! *** creep does not decide WHETHER the material yields -- and the residue is eps, shown not assumed ***",
        cf.creepFreeWorstBudgetUsed <= 1 && cf.creepFreeSamples === 5,
        "worst budget usage " + cf.creepFreeWorstBudgetUsed.toFixed(4) + " of eps/(2*creep) + eps, raw spread " +
        cf.creepFreeSpread.toExponential(2) + ". md's alphaFree pointed at a different question: VARY THE " +
        "PARAMETER THAT HAS NO BUSINESS AFFECTING THE ANSWER AND DEMAND THE ANSWER NOT MOVE. The budget is " +
        "DERIVED FROM eps, not chosen. *** AND THIS LINE QUOTED 0.96 AND PASSED WHILE THE OLD BUDGET WAS BEING " +
        "EXCEEDED BY 41% AT A YIELDSTRAIN IT NEVER RAN -- see section 4a, which is why the claim is no longer " +
        "checked at a single point ***");

    ok("!! *** and the residue FALLS AS 1/creep, which is what tells a resolution limit from an entanglement ***",
        cf.creepFreeFallsWithCreep === 1,
        "98.8, 28.8 and 8.8 ULP at creep 0.05, 0.2 and 0.5. rest0*(1 + creep*excess) is still exactly rest0 " +
        "until creep*excess clears half an ULP, so the bisection sees the yield late by eps/(2*creep). A creep " +
        "that genuinely fed the yield DECISION would move the onset in a way that grew or wandered -- IT WOULD " +
        "CERTAINLY NOT SHRINK AS THE PARAMETER GREW");

    // THE CODE HALF IS A COUNT, NOT AN ABSENCE. The module MUST be named once -- by the import -- so "does not
    // mention plastic.js" is the wrong question and would fail a correct file. The right one is that it is named
    // ONCE and that the one mention is the import statement: any second reference is a path being reached for.
    ok("...and no sabotage is applied to the module being graded",
        (noComments(src).match(/plastic\.js/g) || []).length === 1 &&
        /^import \{ applyPlasticity \} from "\.\.\/\.\.\/physics\/xpbd\/plastic\.js";$/m.test(noComments(src)) &&
        proseHas(src, /applied HERE and never in the module being graded/i),
        "A DEVICE MUST NOT EDIT THE THING IT GRADES (v3197). creepFree varies a legitimate, exported parameter; " +
        "plastic.js is imported unchanged");
}

// ---- 4a. THE BUDGET, CHECKED OVER THE GRID IT IS CLAIMED OVER AND NOT AT ONE POINT ----------------------------------
//
// *** v4191 -- THE CLAIM ABOVE WAS TRUE AT THE ONE CONFIGURATION ANYBODY EVER RAN IT AT. *** creepFree varies
// creep at a SINGLE yieldStrain -- its own default 0.1 -- and the old budget's second term was `8 * |yieldStrain|
// * eps`, an allowance RELATIVE to a quantity the residual it covers does not depend on. So the allowance shrank
// as the yield got smaller and the residual did not, and MEASURED on the shipped module the old budget was
// exceeded: usage 1.4101 at yieldStrain 0.02 / creep 2.0 and 1.0577 at yieldStrain 0.05 / creep 2.0.
//
// *** AND THE OBSERVABLE NAMED FOR EXACTLY THIS WAS DEAD. *** `yieldWorstBudgetUsed` has been in
// PLASTIC_OBSERVABLES since the list was written and was ASSIGNED BY NO MODE -- it read the NONE sentinel -1 in
// all five modes and both arms, and -1 is what lab-results-baseline.json froze. The `yield` mode's sweep already
// runs yieldStrain 0.02 and 0.05, the two settings where the old budget fails, and never formed the ratio.
{
    const YS = [0.02, 0.05, 0.1, 0.2, 0.35];
    const grid = [];
    for (const ys of YS) {
        const g = await dev.build({ mode: "creepFree", config: { yieldStrain: ys } });
        grid.push({ ys, used: g.creepFreeWorstBudgetUsed, falling: g.creepFreeFallsWithCreep });
    }
    const worst = grid.reduce((a, g) => (g.used > a.used ? g : a));

    ok("!! *** THE BUDGET HOLDS ACROSS THE WHOLE yieldStrain x creep GRID, NOT AT ITS DEFAULT ***",
        grid.every((g) => g.used <= 1),
        "5 yieldStrains x 5 creeps = 25 points, worst usage " + worst.used.toFixed(4) + " at yieldStrain " +
        worst.ys + ". Per yieldStrain: " + grid.map((g) => g.ys + "->" + g.used.toFixed(4)).join(", ") + ". " +
        "THE SAME SWEEP AGAINST THE OLD eps/(2*creep) + 8*|yieldStrain|*eps REACHED 1.4101, while the line above " +
        "quoted 0.96 in prose and computed 0.9144, because it only ever asked at yieldStrain 0.1");

    ok("...and the residue still falls with creep at EVERY yieldStrain, not just the default",
        grid.every((g) => g.falling === 1),
        "the 1/creep signature is what separates a resolution limit from an entanglement, and a budget repair " +
        "that quietly broke it would be a wider allowance wearing a physics explanation");

    // THE CODE HALF. A prose correction with the old formula still in the source would be the v4170 shape: the
    // sentence says one thing and the arithmetic does another.
    const fn = noComments(src).match(/function resolutionBudget[\s\S]*?\n}/);
    ok("!! *** and the allowance is ABSOLUTE in the source, not scaled by the yield being recovered ***",
        !!fn && !/yieldStrain/.test(fn[0]) && /Number\.EPSILON \/ \(2 \* creep\) \+ Number\.EPSILON/.test(fn[0]) &&
        /resolutionBudget\(creep\)/.test(noComments(src)),
        "yieldStrain IS NOT IN THE FUNCTION AT ALL, signature included -- a parameter the body ignores is a " +
        "vestigial field (v4170) and this is the exact one that carried the fault. permanentSet feeds the " +
        "strain in as the POSITION `1 + s`, so the finest representable step is one ULP " +
        "of 1 -- eps, flat, whatever yieldStrain is. MEASURED: once eps/(2*creep) drops below that floor the " +
        "residual stops falling and sits at 0.578, 0.688, 0.875, 1.250 and 1.000 eps for the five yieldStrains, " +
        "ABSOLUTE and flat in creep across 0.5, 0.9 and 2.0");
}

// ---- 4b. THE DEAD OBSERVABLE IS LIVE, AND IT IS SHARPER UNDER THE PLANT ---------------------------------------------
{
    const ty = await dev.build({ mode: "tensiononly" });
    ok("!! *** yieldWorstBudgetUsed CARRIES A READING -- it was declared and assigned by no mode ***",
        Number.isFinite(y.yieldWorstBudgetUsed) && y.yieldWorstBudgetUsed > 0 && y.yieldWorstBudgetUsed < 1,
        "yield mode reports " + y.yieldWorstBudgetUsed.toFixed(6) + " across yieldStrain 0.02 to 0.35 at creep " +
        "0.5. IT READ -1 -- the NONE sentinel -- IN ALL FIVE MODES AND BOTH ARMS, and -1 is what the lab's " +
        "value baseline froze. A DECLARED OBSERVABLE THAT IS A SENTINEL EVERYWHERE IS A VESTIGIAL FIELD (v4170): " +
        "it inflates the observable count and answers nothing");

    ok("...and the plant drives it 15 orders of magnitude over budget, so it separates the arms too",
        ty.yieldWorstBudgetUsed > 1e12 && y.yieldWorstBudgetUsed < 1,
        "honest " + y.yieldWorstBudgetUsed.toFixed(6) + " -> planted " + ty.yieldWorstBudgetUsed.toExponential(3) +
        ". `tensiononly` measures the compression onset with sign = +1, so the sweep's worst |c + y| becomes 2y " +
        "rather than ~1e-16 -- against an eps-scale budget that is a ratio of order 1e15. The device's declared " +
        "plantFlips stays yieldWorstErrAbs; this is a second reading of the same separation, in budget units");
}

// ---- 5. THE MODES, AND THE COUNT MOVED AGAIN ------------------------------------------------------------------------
{
    // *** v3941 -- THE HEADING SAID "THE COUNT MOVED FOR A REASON" AND THE LINE UNDER IT PINNED THE COUNT. ***
    // It moved again, for a reason of exactly the same kind: v3902 added `tensiononly` as this device's declared
    // PLANT -- plantMode: "tensiononly", plantFlips: "yieldWorstErrAbs" -- and its own comment beside it calls
    // it "THE BLIND SPOT THIS MODE WAS BUILT TO CLOSE". So `dev.modes.length === 4` went red ON THE ROUND THAT
    // COMPLETED THE DEVICE, which is the same thing heidler-selfcheck's `modes.length === 3` did when its plant
    // landed. A COUNT IS NOT A PROPERTY, and a heading that says the count moves is not a reason to pin it.
    //
    // The count is REPORTED. What is asserted is that every declared mode validates, that a nonsense mode is
    // refused, and that THE DECLARED PLANT IS AMONG THEM -- which is the requirement with teeth, because a
    // plantMode absent from `modes` cannot be driven and the census would score a device that only proves its
    // own apparatus as a whole one. (This device declares no controlMode, so unlike heidler there is no second
    // half to pair it with, and that is said rather than quietly not checked.)
    const declared = Array.isArray(dev.modes) ? dev.modes : [];
    ok("!! the modes are EXPORTED and every one of them validates, nonsense refused",
        declared.length > 1 &&
        declared.every((m) => K.checkMode(dev, m).ok !== false) &&
        K.checkMode(dev, "zzz_no_mode").ok === false,
        declared.length + " declared: " + declared.join(", ") + ". THE COUNT IS REPORTED, NOT ASSERTED -- " +
        "pinning it at four is how this line went red when v3902 added the plant.");

    ok("!! ...and the declared PLANT is one of them, so it can actually be driven",
        !!dev.plantMode && declared.includes(dev.plantMode),
        'plantMode "' + dev.plantMode + '" (flips ' + dev.plantFlips + ", kind " + dev.plantKind + ") is in the " +
        "list. A PLANT MODE THAT IS NOT AMONG THE MODES CANNOT BE DRIVEN -- the census would count this device " +
        "whole while the arm that catches anything was unreachable. No controlMode is declared here, so the " +
        "control half is NOT checked, which is stated rather than silently skipped.");

    const cov = G.gradedCoverage(path.resolve(HERE, "..", ".."));
    ok("!! *** and physics/xpbd/plastic.js is graded because something CALLS it ***",
        cov.graded.includes("physics/xpbd/plastic.js"),
        cov.graded.length + " graded of " + cov.proven + ". AN IMPORT MOVES THE COUNT AND GRADES NOTHING -- " +
        "applyPlasticity is called on every bisection step of every mode here, which is several thousand times " +
        "per run");

    ok("...and xpbd/muscle.js is still NOT graded, because its key is still a mirror",
        cov.ungraded.includes("physics/xpbd/muscle.js"),
        "v3201 refused it and volume-selfcheck section 6 carries the refusal WITH THE ANTIDOTE. THE REFUSAL " +
        "EXPIRES IF SOMEBODY STATES THE BEAM PARAMETERS -- it does not expire because the neighbouring module " +
        "got graded");
}

console.log();
console.log("  ----  THE FOUR xpbd MODULES WITH EXTERNAL KEYS ARE NOW THREE GRADED AND ONE REFUSED: friction");
console.log("  ----  (v3200), volume (v3201), plastic (here), muscle REFUSED. The other thirteen claim");
console.log("  ----  DETERMINISM, GPU/CPU EQUIVALENCE or COUPLING, which is what a solver is, and they are");
console.log("  ----  properly gated where they already live. DO NOT PROPOSE THEM AS DEVICES.");
if (fails) { console.log("plastic-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("plastic-selfcheck: all checks pass");
