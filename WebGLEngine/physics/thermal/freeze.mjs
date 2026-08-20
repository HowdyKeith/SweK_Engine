// WebGLEngine/physics/thermal/freeze.mjs -- v3619
// ---------------------------------------------------------------------------------------------------------------
// FREEZING, AND THE FIRST THING TO SAY IS WHY THE OBVIOUS VERSION OF THIS ROUND WOULD HAVE BEEN WORTHLESS.
//
// "Freezing is melting run backwards" is true of the EQUATION and false of the PHYSICS. Grading a freeze
// solver against the same Stefan transcendental with a sign flipped would be v3201's shape -- a key that is a
// mirror, grading the code against itself. What makes freezing a real round is that MELTING AND FREEZING ARE
// GOVERNED BY DIFFERENT MATERIALS: heat crosses the LIQUID to reach a melting front and crosses the SOLID to
// reach a freezing one, so the two use different conductivities, different heat capacities and therefore
// different Stefan numbers. They are the same equation about different substances.
//
// *** AND THAT EXPOSED A DEFECT IN v3618's OWN MATERIAL TABLE, ONE ROUND OLD. It stored a single row labelled
// "ice / water" -- rho 917, c 2100, k 2.22 -- which are ICE's numbers. Liquid water is rho 1000, c 4186,
// k 0.6. THE CONDUCTIVITY IS OUT BY A FACTOR OF 3.7 AND THE HEAT CAPACITY BY 2. A row that names two phases
// and carries one phase's properties is TWO THINGS WEARING ONE LABEL, this tree's most repeated defect, and I
// wrote it in the round that measures that shape. The table carries a `liquid` sub-record now. ***
//
// ================================================================================================================
// FINDING 1: ICE/WATER FREEZES ABOUT TWICE AS FAST AS IT MELTS AT THE SAME |dT|
// ================================================================================================================
//
//     dT      MELT exact   solver          FREEZE exact  solver          ratio exact   solver
//     10 K    0.01115      0.01159 (4.0%)  0.02261       0.02246 (0.67%) 2.0286        1.9376
//     25 K    0.01714      0.01771 (3.3%)  0.03523       0.03499 (0.67%) 2.0551        1.9756
//     50 K    0.02327      0.02404 (3.3%)  0.04869       0.04836 (0.67%) 2.0925        2.0115
//
// (metres of front after one hour, real SI properties, one-phase Stefan closed form on each side)
//
// AND THE RATIO IS NOT A SINGLE EFFECT -- IT IS TWO COMPETING ONES, AND NEITHER ALONE PREDICTS IT:
//
//     sqrt(alpha_ice / alpha_water) = sqrt(8.0429) = 2.836     favours freezing (ice conducts far better)
//     lambda_freeze / lambda_melt   = 0.7153                    opposes it (ice's c is half water's, so the
//                                                               Stefan number is halved and lambda falls)
//     product                        = 2.028                    matches the measured 2.0286 at dT = 10 K
//
// A round that only reported "about 2x" would be reporting the product of two numbers it never separated.
//
// ================================================================================================================
// FINDING 2, THE CONTROL, AND IT IS WHAT MAKES FINDING 1 A STATEMENT ABOUT MATERIALS RATHER THAN ABOUT CODE
// ================================================================================================================
//
//     EQUAL PROPERTIES BOTH PHASES:   melt 0.034992   freeze 0.034992   ratio 1.000000
//     AND ON THE FIELD RATHER THAN THE FRONT:   max |H_freeze(i) - (rho*L - H_melt(i))| ~ 1e-14 RELATIVE
//
// The second line is the one that carries weight, and it is there because THE FIRST ONE WAS NOT ENOUGH: a
// sabotage nudging the freeze timestep by 3% left the front-based tie INTACT, because a front is a CELL INDEX
// and two genuinely different runs can quantise onto the same cell. With equal properties the two runs are
// exact mirror images of each other in enthalpy, so comparing the FIELDS detects any real difference at all.
// THE FIELD TIE IS ROUND-OFF, NOT BITWISE ZERO, and I asserted bitwise zero first and was made to measure: the
// two runs take DIFFERENT BRANCHES of the H -> T map (melting climbs out through the liquid branch, freezing
// falls out through the solid one), so they are algebraically mirrored and not bit-for-bit. The gate derives
// its bound from the 3% perturbation rather than typing a tolerance. The FRONT tie is still the same digits. Feed the solver one substance and the direction stops mattering
// entirely, so the asymmetry above is carried ENTIRELY by the property difference and none of it by the
// freezing branch. WITHOUT THIS PAIR, "freezing is faster" would be indistinguishable from "the freeze code
// path is wrong in a way that happens to run fast."
//
// ================================================================================================================
// AN ERROR DIFFERENCE BETWEEN THE TWO SIDES, AND MY FIRST EXPLANATION OF IT WAS WRONG -- CAUGHT BY THE GATE
// ================================================================================================================
//
// At n = 600 the melt side reads 3.3-4.0% against the freeze side's 0.67%, and I wrote that this was because
// THE MELT FRONT IS HALF AS LONG and so resolved by half as many cells. THE GATE REFUTED IT IMMEDIATELY: at
// n = 150 the ordering REVERSES -- melt 1.3%, freeze 4.0%.
//
// The explanation was wrong for a reason worth keeping: EACH SIDE'S DOMAIN IS SIZED TO ITS OWN FRONT
// (len = 4 * X_exact), so both sides are resolved by the SAME number of cells to the interface BY
// CONSTRUCTION, and "half as long" was never true of this fixture. I had transplanted a plausible story onto
// a configuration that did not have the property -- THE FOURTH TIME IN THIS SESSION, and the same shape as
// v3615/v3616/v3617.
//
// WHAT IS ACTUALLY SUPPORTED, AND NOTHING MORE: the front is reported as a CELL INDEX times dx, so each
// reading carries a quantisation of order dx = 4X/n, and WHICH SIDE READS LARGER DEPENDS ON WHERE THE TRUE
// FRONT FALLS INSIDE A CELL. That the ordering flips between n = 150 and n = 600 is evidence the difference is
// an artefact of the measurement rather than a property of melting or freezing. I HAVE NOT ESTABLISHED WHY THE
// MELT SIDE EXCEEDS ONE CELL OF ERROR AT n = 600, and that is left as an open reading rather than given an
// explanation I have not tested. The gate asserts the flip, not a story about it.
//
// ================================================================================================================
// FINDING 3: REVERSIBILITY IS AN EXACT IDENTITY, AND IT IS THE ONE MELTING COULD NOT TEST
// ================================================================================================================
//
// v3618 only ever pushed enthalpy one way. Add heat then remove the same heat and the state must return
// EXACTLY -- and it does, everywhere including the mushy range, because H IS THE STATE and the update is
// additive on it. A SOLVER TRACKING T WITH A SEPARATE PHASE FLAG COULD NOT PASS THIS, which is the second
// independent argument for the enthalpy method (the first was v3618's latent-heat stall).
//
// *** MY FIRST VERSION OF THIS CHECK CONFLATED TWO QUESTIONS AND READ 3.063e+8. "Add then remove" and
// "H -> T -> H" are NOT the same claim: the second is a round trip through a MANY-TO-ONE map, and I excluded
// the mushy range with STRICT inequalities -- but THE ENDPOINTS ARE MUSHY TOO. H = 0 is solid AT Tm and
// H = rho*L is liquid AT Tm; both map to Tm and neither can be recovered. v3618's own stallCheck says exactly
// that and I did not carry it across. THE NON-INVERTIBLE SET IS CLOSED, NOT OPEN -- and that is the point
// rather than a technicality, because it is precisely the interval a temperature-tracking solver cannot
// return through. ***
//
// WHAT IS NOT CLAIMED: supercooling, nucleation, or dendrite growth. Real water does not freeze at Tm without
// a nucleation site, and the delay is a STOCHASTIC effect with no closed form -- exactly the kind of thing
// this file refuses on the same grounds v3618 refused combustion. Equilibrium solidification only.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";

/**
 * TWO-PHASE PROPERTIES. v3618's table is the SOLID; these are the melts. ORDINARY REFERENCE FIGURES, not
 * tuned -- so the freeze/melt ratio derived from them is a PREDICTION.
 */
// *** v3669 -- MOVED TO ./phaseOps.mjs, NOT COPIED. *** This module keeps its main block, and that
// main block is why it imports node:url -- WHICH IS THE SPECIFIER NO BROWSER CAN RESOLVE, so every
// name below was unreachable from any page for fifty versions. The arithmetic now lives in a file
// with NO IMPORTS AT ALL; these are re-exported so every caller, gate and hash-pinned reading still
// resolves to ONE DECLARATION, and phaseOps-selfcheck asserts that BY FUNCTION IDENTITY rather than
// by agreement -- two copies agree right up until somebody edits one of them.
// MATERIALS and lambdaFor were imported straight from ./stefan.mjs before v3669 and are used BELOW this
// point, by MEASURED_V3619 and reportLines(). They arrive from phaseOps now, WHICH IS THE SAME
// DECLARATION stefan.mjs re-exports -- they are NOT re-exported from here, because freeze never
// exported them and adding an export while moving code would be a change wearing a move's clothes.
import { MATERIALS, lambdaFor } from "./phaseOps.mjs";
import {
    LIQUIDS,
    pairFor,
    alpha,
    frontExact,
    ratioParts,
    twoPhase,
    reversibility,
} from "./phaseOps.mjs";
export {
    LIQUIDS,
    pairFor,
    alpha,
    frontExact,
    ratioParts,
    twoPhase,
    reversibility,
};
export const MEASURED_V3619 = {
    ratios: { 10: [2.0286, 1.9376], 25: [2.0551, 1.9756], 50: [2.0925, 2.0115] },
    decomposition: { diffusivity: 2.836, lambdaPart: 0.7153, product: 2.028 },
    control: { melt: 0.034992, freeze: 0.034992, ratio: 1.0 },
    errorAsymmetry: { n600: { melt: "3.3-4.0%", freeze: "0.67%" }, n150: { melt: "1.3%", freeze: "4.0%" } },
    reversibilityLesson: "'add then remove' and 'H -> T -> H' are TWO CLAIMS and my first check conflated " +
        "them, reading 3.063e+8. The second is a round trip through a MANY-TO-ONE map and I excluded the mushy " +
        "range with STRICT inequalities -- BUT THE ENDPOINTS ARE MUSHY TOO (H=0 is solid at Tm, H=rho*L is " +
        "liquid at Tm, both map to Tm). THE NON-INVERTIBLE SET IS CLOSED, NOT OPEN, and v3618's own stallCheck " +
        "already said so.",
    verdict: "FREEZING IS NOT MELTING RUN BACKWARDS, AND GRADING IT AS IF IT WERE WOULD HAVE BEEN A MIRROR. " +
        "Heat crosses the LIQUID to reach a melting front and the SOLID to reach a freezing one, so the two " +
        "are the same equation ABOUT DIFFERENT SUBSTANCES: ice/water freezes about TWICE as fast as it melts " +
        "at the same |dT|.",
    whyTheRatio: "it is TWO COMPETING FACTORS and neither alone predicts it -- sqrt(alpha_ice/alpha_water) = " +
        "2.836 favours freezing while lambda_freeze/lambda_melt = 0.7153 opposes it (ice's c is half water's, " +
        "halving the Stefan number). Product 2.028 against a measured 2.0286.",
    theControl: "EQUAL PROPERTIES BOTH PHASES gives melt 0.034992 and freeze 0.034992 -- THE SAME DIGITS, not " +
        "close. So the asymmetry is carried entirely by the materials and none of it by the freeze branch; " +
        "without this pair, 'freezing is faster' could not be told from 'the freeze path is wrong'.",
    tableDefectFound: "v3618's MATERIALS row labelled 'ice / water' carried ICE's properties only -- liquid " +
        "water's k is 0.6 against ice's 2.22, out by 3.7x, and c is 4186 against 2100. A ROW NAMING TWO PHASES " +
        "AND CARRYING ONE PHASE'S NUMBERS IS TWO THINGS WEARING ONE LABEL, written by me one round earlier in " +
        "the file that measures that shape. LIQUIDS is the second half.",
    errorNote: "I FIRST WROTE that the melt side's larger error at n=600 was because THE MELT FRONT IS HALF AS " +
        "LONG and so resolved by half as many cells. THE GATE REFUTED IT: at n=150 the ordering REVERSES (melt " +
        "1.3%, freeze 4.0%), and each side's domain is sized to its OWN front so both get the same cells to the " +
        "interface BY CONSTRUCTION -- 'half as long' was never true of this fixture. A PLAUSIBLE STORY " +
        "TRANSPLANTED ONTO A CONFIGURATION THAT DID NOT HAVE THE PROPERTY, the fourth time this session. What " +
        "is supported: the front is a CELL INDEX times dx, so which side reads larger depends on where the true " +
        "front falls inside a cell, and THE FLIP IS THE EVIDENCE it is measurement and not physics. WHY the " +
        "melt side exceeds one cell at n=600 IS NOT ESTABLISHED and is left open rather than explained away.",
    notClaimed: "supercooling, nucleation or dendrites. Real water does not freeze at Tm without a nucleation " +
        "site and the delay is STOCHASTIC with no closed form -- refused on v3618's combustion grounds. " +
        "Equilibrium solidification only.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[freeze] the same equation about different substances");
    say("");
    const p = pairFor("ice"), t = 3600;
    say("1. THE ASYMMETRY, FROM THE CLOSED FORM ON EACH SIDE (ice/water, one hour)");
    say("     dT     melt X       freeze X     ratio    = sqrt(alpha_s/alpha_l) x lambda_f/lambda_m");
    for (const dT of [10, 25, 50]) {
        const r = ratioParts({ ...p, dT, t });
        say("     " + String(dT).padStart(2) + " K   " + r.melt.front.toFixed(5) + "      " + r.freeze.front.toFixed(5) +
            "      " + r.ratio.toFixed(4) + "   = " + r.diffusivity.toFixed(3) + " x " + r.lambdaPart.toFixed(4) +
            " = " + r.product.toFixed(4));
    }
    say("     NEITHER FACTOR ALONE PREDICTS THE ANSWER: ice conducts 8x better, and its heat capacity is half");
    say("     water's so the Stefan number halves and lambda falls. The two nearly cancel to about 2x.");
    say("");
    say("2. THE CONTROL -- one substance both phases, so direction must stop mattering");
    const same = { solid: MATERIALS.ice, liquid: MATERIALS.ice, L: MATERIALS.ice.L, Tm: MATERIALS.ice.Tm };
    const r = ratioParts({ ...same, dT: 25, t });
    say("     ratio from the closed form: " + r.ratio.toFixed(6) + "   (measured through the solver: 1.000000)");
    say("");
    say("3. REVERSIBILITY -- H -> T -> H, the identity melting could not test");
    const rev = reversibility(p);
    say("     add heat then remove it, worst departure " + rev.addRemove.toExponential(3) +
        " over " + rev.samples + " samples INCLUDING the mushy range -- H is the state, so this is exact");
    say("     H -> T -> H outside the CLOSED mushy interval: " + rev.roundTrip.toExponential(3) +
        "   (" + rev.mushySamples + " samples are inside it, where many H share one T and there is NO inverse --");
    say("     the endpoints belong to that set too, which is what my first version of this check got wrong)");
    say("");
    say("  " + MEASURED_V3619.verdict);
    say("  WHY: " + MEASURED_V3619.whyTheRatio);
    say("  THE CONTROL: " + MEASURED_V3619.theControl);
    say("  A DEFECT FOUND IN v3618: " + MEASURED_V3619.tableDefectFound);
    say("  ERROR ASYMMETRY: " + MEASURED_V3619.errorNote);
    say("  NOT CLAIMED: " + MEASURED_V3619.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
