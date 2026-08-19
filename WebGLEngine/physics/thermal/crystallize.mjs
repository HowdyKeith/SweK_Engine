// WebGLEngine/physics/thermal/crystallize.mjs -- v3621
// ---------------------------------------------------------------------------------------------------------------
// CRYSTALLISATION, THE LAST OF THE FIVE PHASE CHANGES KEITH ASKED FOR, AND THE ONE v3618 RANKED WEAKEST.
//
// Its stated risk was specific rather than general: physics/statmech/ising.js is already graded and would be
// the obvious host, AND ising.L IS THIS LAB'S STANDING EXAMPLE OF A BEAUTIFUL CONVERGENCE THAT IS NOISE. At the
// default seed it reads 1.1811e-2, 4.4674e-3, 1.5432e-3, 2.9045e-4 over L 12/16/24/32 -- converging, zero
// reversals, contraction 0.171, a cleaner pass than most registered knobs produce. AVERAGED OVER FOUR SEEDS THE
// SWEEP IS FLAT. The trend was smaller than the noise it was measured in, and one round nearly promoted a
// device on it.
//
// SO THIS ROUND MEASURES THE SEED SPREAD FIRST AND STATES THE CLAIM AGAINST IT, rather than measuring one seed
// and being caught later. That ordering is the whole design.
//
// ================================================================================================================
// THE KEY: THE AVRAMI EXPONENT IS SET BY GEOMETRY, NOT FITTED
// ================================================================================================================
//
// Johnson-Mehl-Avrami-Kolmogorov: X(t) = 1 - exp(-k t^n), and n is decided by HOW MANY DIMENSIONS THE GRAINS
// GROW IN AND WHEN THE NUCLEI APPEAR -- not by anything in our code:
//
//     3D growth, SITE-SATURATED (every nucleus present at t=0)   n = 3
//     3D growth, CONSTANT NUCLEATION RATE                        n = 4
//
// The extra power is the nucleation rate integrated over time. NOTHING HERE COMES FROM THE LATTICE, which is
// what makes it a key rather than a restatement -- the same role erf plays for melting and the Radon transform
// for tomography. AND IT IS AN EXPONENT RATHER THAN AN ERROR, v3618's lesson: a single error number passes on a
// model that is wrong and never improves.
//
// THE SIMULATION IS ON A VOXEL LATTICE AND IMPINGEMENT IS REAL. Grains nucleate at random sites, grow at unit
// velocity, and a cell belongs to whichever grain reaches it first: t_cell = min over i of (tau_i + dist_i).
// Overlap is resolved by that minimum, which is exactly what impingement is, so the departure from a naive
// non-overlapping volume is in the measurement rather than assumed away. Distances are MINIMUM-IMAGE PERIODIC,
// or cells near the boundary would be starved of nuclei and transform late for a reason that is not physics.
//
// ================================================================================================================
// FINDING 1: THE LATTICE RECOVERS BOTH EXPONENTS, AND THE SEED SPREAD IS REPORTED BESIDE THEM
// ================================================================================================================
//
//     (L = 64, 30 nuclei, six seeds, fitted over X in [0.05, 0.85])
//
//     site-saturated   2.9577 2.9640 2.7981 3.1412 3.0877 3.1883    mean 3.0228   sd 0.1441   predicted 3
//     continuous       3.6504 4.0540 3.5959 4.1995 3.8970 4.1023    mean 3.9165   sd 0.2480   predicted 4
//
// Both means land on their predicted integer -- 0.023 out and 0.083 out -- and NEITHER NUMBER WAS FITTED TO
// ANYTHING. The prediction comes from counting dimensions.
//
// ================================================================================================================
// FINDING 2, AND IT IS THE ONE ising.L PAID FOR: THE CLAIM IS STATED AGAINST THE NOISE, NOT BESIDE IT
// ================================================================================================================
//
// The two predictions are ONE APART, and the per-seed spread is 0.1441 and 0.2480 -- so the effect is between
// FOUR AND SEVEN TIMES the noise it is measured in. THAT RATIO IS THE RESULT. ising.L's defect was a trend
// SMALLER than its seed noise; this is the same measurement run in advance and coming out the other way, and
// the round would have had to say so had it come out the same.
//
// AND THE HONEST MARGIN IS TIGHTER THAN THE MEANS SUGGEST: the worst site-saturated seed reads 3.1883 and the
// best continuous seed 3.5959, SO THE TWO POPULATIONS ARE SEPARATED BY 0.41 -- under two per-seed standard
// deviations. THE ENSEMBLE DISCRIMINATES THE TWO NUCLEATION MODES AND A SINGLE SEED IS ONLY ABOUT TWO SIGMA
// FROM THE WRONG ANSWER. A round quoting one seed would have been right by luck, which is the ising.L story
// exactly.
//
// ================================================================================================================
// WHAT IS NOT CLAIMED
// ================================================================================================================
//
// NO NUCLEATION THEORY. Where nuclei appear and how often is IMPOSED here rather than derived -- classical
// nucleation theory needs an interfacial energy and a critical radius, and this tree has neither, so deriving a
// rate would be tuning a knob with no key. NO GRAIN BOUNDARIES, no anisotropy, no dendrites (refused on
// v3618's combustion grounds and v3619's). NO CLAIM THAT ising.js IS THE HOST: the Ising model grades ORDERING
// at equilibrium and this grades the KINETICS of a transformation, which are different questions, and joining
// them because both are called crystallisation is how ising.L happened.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";

/** THE PREDICTIONS. Derived by counting dimensions and nucleation mode -- never fitted, never tuned. */
// *** v3669 -- MOVED TO ./phaseOps.mjs, NOT COPIED. *** This module keeps its main block, and that
// main block is why it imports node:url -- WHICH IS THE SPECIFIER NO BROWSER CAN RESOLVE, so every
// name below was unreachable from any page for fifty versions. The arithmetic now lives in a file
// with NO IMPORTS AT ALL; these are re-exported so every caller, gate and hash-pinned reading still
// resolves to ONE DECLARATION, and phaseOps-selfcheck asserts that BY FUNCTION IDENTITY rather than
// by agreement -- two copies agree right up until somebody edits one of them.
import {
    AVRAMI,
    MODE_GAP,
    transformTimes,
    fitExponent,
    seedEnsemble,
    discriminationPower,
} from "./phaseOps.mjs";
export {
    AVRAMI,
    MODE_GAP,
    transformTimes,
    fitExponent,
    seedEnsemble,
    discriminationPower,
};
export const MEASURED_V3621 = {
    at64: {
        saturated: { ns: [2.9577, 2.9640, 2.7981, 3.1412, 3.0877, 3.1883], mean: 3.0228, sd: 0.1441, predicted: 3 },
        continuous: { ns: [3.6504, 4.0540, 3.5959, 4.1995, 3.8970, 4.1023], mean: 3.9165, sd: 0.2480, predicted: 4 },
    },
    theKey: "THE AVRAMI EXPONENT IS SET BY GEOMETRY AND NOT FITTED -- 3 for three-dimensional site-saturated " +
        "growth, 4 when nuclei keep appearing, the extra power being the nucleation rate integrated over time. " +
        "NOTHING IN IT COMES FROM THE LATTICE, and it is an EXPONENT rather than an error, so a model that is " +
        "wrong and never improves cannot pass it.",
    theOrdering: "THE SEED SPREAD WAS MEASURED BEFORE THE CLAIM WAS MADE, WHICH IS THE WHOLE DESIGN. ising.L " +
        "converges beautifully at its default seed and is FLAT over four -- a trend smaller than its own noise, " +
        "and a device was nearly promoted on it. Here the two predictions are ONE apart and the per-seed spread " +
        "is 0.1441 and 0.2480, so THE EFFECT IS FOUR TO SEVEN TIMES THE NOISE. That ratio is the result, and " +
        "the round would have had to report the other answer had it come out the other way.",
    theHonestMargin: "the MEANS separate comfortably but THE POPULATIONS DO NOT: worst site-saturated seed " +
        "3.1883 against best continuous seed 3.5959, A MARGIN OF 0.41 -- UNDER TWO PER-SEED STANDARD " +
        "DEVIATIONS. The ensemble discriminates the two nucleation modes; A SINGLE SEED IS ABOUT TWO SIGMA " +
        "FROM THE WRONG ANSWER, so a round quoting one seed would have been right by luck.",
    fitWindow: "X in [0.05, 0.85] AND THE REASON IS STATED RATHER THAN TUNED: below a few percent the lattice " +
        "has transformed a handful of cells so the log of a quantised fraction is noise, and above ~0.9 the " +
        "untransformed remnant is single cells. BOTH ENDS ARE LATTICE ARTEFACTS, NOT KINETICS.",
    notClaimed: "NO NUCLEATION THEORY -- where nuclei appear and how often is IMPOSED, since classical " +
        "nucleation theory needs an interfacial energy and a critical radius this tree does not have, and " +
        "deriving a rate without them would be tuning a knob with no key. No grain boundaries, no anisotropy, " +
        "no dendrites. AND NOT THAT ising.js IS THE HOST: it grades ORDERING at equilibrium, this grades the " +
        "KINETICS of a transformation, and joining them because both are called crystallisation is how ising.L " +
        "happened.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[crystallize] the exponent is geometry, and the seed spread was measured first");
    say("");
    say("1. THE KEY -- predicted by counting dimensions, never fitted");
    for (const [k, v] of Object.entries(AVRAMI)) say("     " + k.padEnd(22) + " n = " + v.n + "   (" + v.why + ")");
    say("");
    say("2. MEASURED ON A VOXEL LATTICE AT L = 64, SIX SEEDS (recorded; the gate re-derives at L = 32)");
    for (const [k, m] of Object.entries(MEASURED_V3621.at64)) {
        say("     " + k.padEnd(12) + " " + m.ns.map((x) => x.toFixed(4)).join(" ") +
            "   mean " + m.mean.toFixed(4) + "   sd " + m.sd.toFixed(4) + "   predicted " + m.predicted);
    }
    say("");
    say("3. THE CLAIM AGAINST THE NOISE -- the two predictions are " + MODE_GAP + " apart");
    const s = MEASURED_V3621.at64.saturated, c = MEASURED_V3621.at64.continuous;
    say("     effect / worst per-seed spread = " + (MODE_GAP / Math.max(s.sd, c.sd)).toFixed(2) + "x");
    say("     BUT THE POPULATION MARGIN IS TIGHTER: worst saturated " + Math.max(...s.ns).toFixed(4) +
        " against best continuous " + Math.min(...c.ns).toFixed(4) + " = " +
        (Math.min(...c.ns) - Math.max(...s.ns)).toFixed(4));
    say("     -- UNDER TWO PER-SEED SIGMA. The ENSEMBLE discriminates; ONE SEED IS TWO SIGMA FROM BEING WRONG.");
    say("");
    say("  THE KEY: " + MEASURED_V3621.theKey);
    say("  THE ORDERING: " + MEASURED_V3621.theOrdering);
    say("  THE HONEST MARGIN: " + MEASURED_V3621.theHonestMargin);
    say("  NOT CLAIMED: " + MEASURED_V3621.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
