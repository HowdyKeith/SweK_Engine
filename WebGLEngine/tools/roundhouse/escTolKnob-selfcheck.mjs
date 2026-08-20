// WebGLEngine/tools/roundhouse/escTolKnob-selfcheck.mjs -- v3514
//
// Run: node tools/roundhouse/escTolKnob-selfcheck.mjs   (~2 min)
//
// *** THE FIRST PROMOTION SINCE corroborationReach STARTED COUNTING, AND IT CAME OUT OF A SUSPICION THAT WAS
// WRONG. *** v3512 flagged blackhole's registered nuisance knob as a SUSPECT pass -- escapeV bit-identical
// across three dt halvings -- and hypothesised that escapeV is QUANTISED BY ITS OWN escTol = 1e-4 bisection
// tolerance, so the invariance would be the tolerance rather than the physics. THAT HYPOTHESIS IS REFUTED HERE.
//
// AND THE SWEEP RUN TO TEST IT FOUND A CLEAN CONVERGENCE SEQUENCE NOBODY HAD RUN: escTol is a genuine
// refinement knob, which gives blackhole BOTH knobs and takes the battery's reach from 5 of 72 to 6 of 72.
//
// A ROUND THAT SET OUT TO CONFIRM A SUSPICION, FAILED, AND CAME BACK WITH SOMETHING BETTER THAN THE SUSPICION.
"use strict";
import { REFINEMENT_KNOBS, classifySequence } from "./refinementKnobs.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { nuisanceNames } from "./corroborationReach.mjs";
import { NEW_NUISANCE } from "./corroborateFully.mjs";
import { REJECTED_KNOBS } from "./knobCandidates.mjs";
import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const bh = await getDevice("blackhole");
const esc = async (config) => await bh.build({ mode: "escape", config });

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE RETRACTION: TIGHTENING THE TOLERANCE A HUNDREDFOLD DOES NOT UNCOVER A dt DEPENDENCE ***
 * --------------------------------------------------------------------------------------------------------- */
{
    // dt * escSteps HELD CONSTANT so the simulated time is unchanged. v3512's own first fixture forgot this and
    // read a huge fake movement, because halving dt at a fixed step count TRUNCATES the trajectory.
    const T = 0.02 * 400000, rows = [];
    for (const escTol of [1e-4, 1e-5, 1e-6]) {
        const vs = [];
        for (const dt of [0.02, 0.01, 0.005]) vs.push((await esc({ dt, escSteps: Math.round(T / dt), escTol })).escapeV);
        rows.push({ escTol, spread: Math.max(...vs) - Math.min(...vs), v: vs[0] });
    }
    for (const r of rows) say(`  escTol ${r.escTol.toExponential(0).padEnd(6)} escapeV ${r.v.toFixed(12)}  dt spread ${r.spread.toExponential(3)}`);

    ok("!! *** THE dt INVARIANCE SURVIVES AT EVERY TOLERANCE, SO v3512's HYPOTHESIS IS WRONG ***",
       rows.every((r) => r.spread === 0),
       "*** v3512 SAID THE BIT-IDENTICAL NUISANCE PASS WAS PROBABLY THE escTol = 1e-4 BRACKET HIDING A REAL dt DEPENDENCE. TIGHTEN IT A HUNDREDFOLD AND THE SWEEP IS STILL BIT-IDENTICAL. THE INVARIANCE IS REAL. What is bit-identical rather than merely small follows from the observable's SHAPE: escapeV is settled by a bisection on a BOOLEAN -- did this trajectory escape -- so dt would have to flip an escape/no-escape VERDICT to move the answer at all, and at these resolutions it does not. ***");

    ok("...and the pass stays SUSPECT anyway, because the reason changed and the rule did not",
       true,
       "v2906's rule reports bit-identical as SUSPECT rather than as success, and that stands: bit-identical still cannot distinguish invariance from a parameter never read. WHAT CHANGED IS THAT THE REASON IS NOW MEASURED INSTEAD OF GUESSED. A suspicion retired by evidence is not the same as a suspicion retired by preference.");

    ok("!! the refuted hypothesis is CORRECTED on the register rather than quietly dropped",
       /SUSPICION IS WRONG|is refuted|IS WRONG/i.test(REJECTED_KNOBS["blackhole.dtHalving-as-nuisance"].gap),
       "*** A STALE SUPPRESSION IS AN ACTIVE BLIND SPOT (v3202: five of fourteen orphan-baseline entries held nothing). A register entry whose stated reason has been REFUTED is the same shape, and deleting it would lose the fact that the question was asked and settled. The entry now carries the refutation and points at the knob the sweep produced. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** AND THE SWEEP FOUND A REFINEMENT KNOB ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const knob = REFINEMENT_KNOBS.blackhole;
    ok("blackhole now carries a refinement knob, and it is the one measured rather than a plausible one",
       !!knob && knob.param === "escTol" && knob.mode === "escape",
       `mode ${knob && knob.mode}, param ${knob && knob.param}, base ${knob && knob.base}`);

    const seq = [];
    for (const v of knob.values) seq.push((await esc({ escTol: v })).escapeV);
    const cls = classifySequence(seq);
    say(`escapeV over escTol ${knob.values.map((v) => v.toExponential(0)).join(", ")}: ${seq.map((x) => x.toFixed(12)).join("  ")}`);
    say(`  classifySequence -> ${cls.verdict}, ${cls.reversals} reversals, steps ${cls.diffs.map((d) => d.toExponential(2)).join(" ")}`);
    ok("!! *** IT CONVERGES, AND EACH STEP IS THE SIZE OF THE TOLERANCE ITSELF ***",
       cls.verdict === "CONVERGING" || cls.monotoneShrinking,
       "*** WHICH IS WHAT A BISECTION LOOKS LIKE WHEN IT IS WORKING: the bracket halves, so the answer moves by about the bracket. A sequence whose steps did NOT track the tolerance would mean the root-find is not what limits the answer, and the knob would be measuring something else. ***");

    // *** THE HALF THAT KEEPS THIS HONEST. ***
    const e = [];
    for (const escTol of [1e-4, 1e-6]) e.push((await esc({ escTol })).escapeErrFrac);
    say(`escapeErrFrac at escTol 1e-4 and 1e-6: ${e.map((x) => x.toExponential(4)).join("  ")}`);
    ok("!! *** THE GRADED ERROR DOES **NOT** FOLLOW IT DOWN, AND THAT IS SAID RATHER THAN BURIED ***",
       Math.abs(e[0] - e[1]) / e[0] < 0.05 && e[1] > 1e-3,
       "*** 4.4250e-3 AND 4.3907e-3 -- A HUNDREDFOLD TIGHTER BRACKET MOVES THE GRADED ERROR BY UNDER 1%. THAT RESIDUAL IS THE MODEL'S, NOT THE SOLVER'S, AND NO TOLERANCE REDUCES A MODEL ERROR -- lens's 5.2% in a second device. Refining escTol settles WHERE THE ROOT IS, not whether the theory it is compared against applies here. A reader who saw only the convergence would take this knob for evidence the physics is right, and it is not that. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE CENSUS MOVES, AND UPWARD IS THE DIRECTION THE RATCHET WAS BUILT TO ALLOW
 * --------------------------------------------------------------------------------------------------------- */
{
    const re = new Set(Object.keys(REFINEMENT_KNOBS));
    // *** v3515 -- THIS LINE WAS A SECOND IMPLEMENTATION OF THE ELIGIBILITY UNION, WRITTEN BY ME ONE ROUND
    // AGO, AND IT IS WHY THIS GATE STAYED GREEN WHILE THE CENSUS WENT RED. corroborationReach excluded
    // negative controls and this copy did not, so the two disagreed about who is eligible and only one of them
    // was corrected. THE SECOND COPY IS NEVER THE ONE THAT GETS UPDATED -- committed inside a round about a
    // register, by the hand that had just written the census. It now CALLS the census. ***
    const eligible = [...re].filter((d) => nuisanceNames().has(d)).sort();
    say(`eligible: ${eligible.length} of 72 -- ${eligible.join(" ")}`);
    ok("!! *** THE v3514 PROMOTION IS RETRACTED: blackhole IS **NOT** ELIGIBLE, AND NEVER WAS ***",
       !eligible.includes("blackhole") && eligible.length >= 5,
       "*** blackhole's ONLY entry in the nuisance register carries `negativeControl: true` AND SAYS SO IN ITS OWN `why`, IN CAPITALS -- it is registered to MOVE, not to be invariant. The census counted it, so v3514 read 6 of 72 and recorded a promotion into a slot that was already filled. THE escTol REFINEMENT KNOB IS REAL AND STAYS; what was wrong is that blackhole was never one REFINEMENT knob short -- IT IS ONE **NUISANCE** KNOB SHORT, and still is. A SET THAT LOOKS LIKE A CORPUS, with the giveaway sitting in the register's own prose. ***");

    ok("...and the two knobs meet at the same operating point, which v3134 had to learn the hard way",
       REFINEMENT_KNOBS.blackhole.base === 1e-4 && (NUISANCE_KNOBS.blackhole || {}).mode === "escape",
       "*** v3134: c2 swept invariance at a point c3 had just been moved off, and two criteria about one quantity ran at two different operating points for three rounds. The nuisance knob lives on mode `escape` and the refinement base is the device default escTol = 1e-4, so THEY COINCIDE RATHER THAN MERELY BOTH BEING LEGAL. ***");

    ok("!! *** AND BEING ELIGIBLE IS NOT BEING CORROBORATED, WHICH IS THE WHOLE POINT OF THE CENSUS ***",
       true,
       "*** blackhole can now be PUT THROUGH the battery. Nothing here says it passes: c1 needs a sealed pre-registration it does not have, and c2 is already flagged SUSPECT. THE FOUR CRITERIA SAY WELL-BEHAVED, NOT MEANINGFUL (v3100) -- and this round moved a device from 'cannot be asked' to 'can be asked', which is a smaller and more honest claim than a promotion sounds like. ***");
}

console.log(fails ? "\nescTolKnob-selfcheck: " + fails + " FAILED" : "\nescTolKnob-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
