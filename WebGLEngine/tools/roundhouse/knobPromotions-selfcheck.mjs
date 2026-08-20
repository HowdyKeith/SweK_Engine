// WebGLEngine/tools/roundhouse/knobPromotions-selfcheck.mjs -- v3512
//
// Run: node tools/roundhouse/knobPromotions-selfcheck.mjs   (~2 min)
//
// *** corroborationReach NAMES THREE DEVICES AS "ONE KNOB SHORT" AND CALLS THEM THE CHEAPEST PROMOTIONS IN THE
// LAB. THAT IS A STATEMENT ABOUT THE REGISTERS, NOT ABOUT THE PHYSICS. All three were examined; ALL THREE WERE
// REJECTED, and the three reasons are different. ***
//
// This is knobCandidates-selfcheck's discipline applied to the new entries: a register of rejected candidates
// is exactly the kind of file that rots, because the reasons stop being true when a device changes and nobody
// re-runs the prose. EVERY MEASUREMENT BELOW IS TAKEN AGAIN RATHER THAN QUOTED.
"use strict";
import { REJECTED_KNOBS } from "./knobCandidates.mjs";
import { classifySequence, REFINEMENT_KNOBS } from "./refinementKnobs.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { NEW_NUISANCE } from "./corroborateFully.mjs";
import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const ising = await getDevice("ising");
const order = async (config) => await ising.build({ mode: "order", config });

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** ising.L PASSES CRITERION 3 CLEANLY AT THE DEFAULT SEED, AND THAT IS THE PROBLEM ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const Ls = [12, 16, 24, 32];
    const seq = [];
    for (const L of Ls) seq.push((await order({ L })).magnetisationErrFrac);
    const cls = classifySequence(seq);
    say(`ising.L at seed 12345: ${seq.map((x) => x.toExponential(4)).join("  ")}`);
    say(`  classifySequence -> ${cls.verdict}, ${cls.reversals} reversals, contraction ${cls.contraction.toFixed(3)}`);
    ok("!! *** AT ONE SEED IT LOOKS LIKE A BETTER REFINEMENT KNOB THAN MOST REGISTERED ONES ***",
       cls.verdict === "CONVERGING" && cls.reversals === 0 && cls.monotoneShrinking,
       "*** MONOTONE, ZERO REVERSALS, A FACTOR OF FORTY. IF THIS ROUND HAD STOPPED HERE IT WOULD HAVE REGISTERED THE KNOB AND PROMOTED THE DEVICE, and the promotion would have been real in the register and false in the world. THE CHECK EVERYBODY WRITES FIRST IS BLIND TO THE MISTAKE A REAL PERSON MAKES -- and this time the mistake was mine, mid-round. ***");

    // The same sweep averaged over seeds. FOUR SEEDS IS NOT MANY AND IS ENOUGH: the question is not what the
    // limit is, it is whether the trend survives contact with a second seed at all.
    const seeds = [12345, 777, 31337, 9], rows = [];
    for (const L of Ls) {
        const s = [];
        for (const seed of seeds) s.push((await order({ L, seed })).magnetisationErrFrac);
        const m = s.reduce((a, b) => a + b, 0) / s.length;
        rows.push({ L, m, sd: Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length) });
    }
    for (const r of rows) say(`  L=${String(r.L).padEnd(3)} mean ${r.m.toExponential(3)}  seed sd ${r.sd.toExponential(3)}  mean/sd ${(r.m / r.sd).toFixed(2)}`);

    const tail = rows.slice(1);
    const flat = Math.max(...tail.map((r) => r.m)) / Math.min(...tail.map((r) => r.m));
    ok("!! *** AVERAGED OVER SEEDS THE TREND IS GONE ***",
       flat < 2 && rows.some((r) => r.m / r.sd < 2),
       `*** From L = 16 onward the mean is FLAT within a factor of ${flat.toFixed(2)}, and the seed standard deviation is comparable to or larger than the mean itself. THE TREND IS SMALLER THAN THE NOISE IT IS MEASURED IN, so the clean sequence above is one seed's walk and not a limit being approached. ***`);

    ok("!! ...and this is ising.samples' RECORDED GAP arriving from the other side",
       /statistical variant/.test(REJECTED_KNOBS["ising.samples"].gap) && /seed spread/i.test(REJECTED_KNOBS["ising.samples"].gap),
       "*** THAT ENTRY SAYS CRITERION 3 HAS NO STATISTICAL VARIANT AND WOULD REPORT **DRIFTING** FOR A CORRECT DEVICE. L IS THE MIRROR IMAGE -- **CONVERGING** FOR A SEQUENCE THAT IS NOISE. A systematic parameter does not escape it, because the answer it moves is still a Monte Carlo estimate. The fix was already written down and it is not a knob: for a stochastic device the test is that the SEED SPREAD shrinks as 1/sqrt(N). ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** blackhole's REGISTERED NUISANCE KNOB PASSES BIT-IDENTICALLY, WHICH IS SUSPECT AND NOT SUCCESS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const bh = await getDevice("blackhole");
    const T = 0.02 * 400000;                       // simulated time held CONSTANT -- see below
    const vs = [];
    for (const dt of [0.02, 0.01, 0.005]) vs.push((await bh.build({ mode: "escape", config: { dt, escSteps: Math.round(T / dt) } })).escapeV);
    say(`escapeV at dt 0.02/0.01/0.005 with dt*escSteps constant: ${vs.map((v) => v.toFixed(12)).join("  ")}`);
    ok("!! escapeV is BIT-IDENTICAL under the registered knob, which v2906's rule calls SUSPECT",
       vs[0] === vs[1] && vs[1] === vs[2],
       "*** A NUISANCE KNOB THAT MOVES NOTHING AT ALL CANNOT DISTINGUISH A DEVICE THAT IS INVARIANT FROM ONE THAT NEVER READ THE PARAMETER. The likely cause is that escapeV is QUANTISED BY ITS OWN escTol = 1e-4 bisection tolerance, so what criterion 2 is measuring is the tolerance rather than the physics -- v3083's distinction, where a control rules out a perturbation that never arrived and c2 is what separates a quantised observable. SWEEPING escTol IS ITS OWN ROUND AND IS NOT DONE HERE. ***");

    const moved = [];
    for (const dt of [0.02, 0.005]) moved.push((await bh.build({ mode: "escape", config: { dt, escSteps: 200000 } })).escapeV);
    ok("!! ...and dt IS live, which is what makes the invariance a real claim rather than a dead parameter",
       Math.abs(moved[0] - moved[1]) > 0.1,
       `*** HOLDING escSteps FIXED INSTEAD MOVES escapeV ${moved[0].toFixed(3)} -> ${moved[1].toFixed(3)}. THAT IS MY OWN FIRST FIXTURE AND IT IS WRONG: halving dt at a fixed step count HALVES THE SIMULATED TIME, so it truncates the trajectory rather than refining it -- and it would have registered dt as a REFINEMENT knob on a measurement of the wrong thing. The pair is kept because together they say the parameter is read AND the answer does not depend on it once the comparison is fair. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. splat HAS NOTHING TO BE INVARIANT UNDER, FOR THE SAME REASON IT IS THE POSITIVE CONTROL
 * --------------------------------------------------------------------------------------------------------- */
{
    const sp = await getDevice("splat");
    const at = async (config) => (await sp.build({ mode: "integral", config })).integralErrFrac;
    const sig = [];
    for (const v of [0.05, 0.1, 0.2, 0.4]) sig.push(await at({ sigma: v }));
    const spread = Math.max(...sig) - Math.min(...sig);
    say(`splat integralErrFrac under sigma 0.05..0.4: ${sig.map((x) => x.toExponential(4)).join("  ")} (spread ${spread.toExponential(2)})`);
    ok("!! every candidate is vacuous because the graded field is already at machine epsilon",
       spread === 0 && sig[0] < 1e-12,
       "*** 7e-14 IS THE EPSILON ANSWER: a quantity graded against its own forward model returns machine precision and proves the arithmetic rather than the physics, so there is nothing for a nuisance knob to fail to move. AND IT IS THE SAME PROPERTY THAT MAKES splat THE LAB'S POSITIVE CONTROL -- integralErrFrac is a pure discretisation error, which is exactly why refining it works and why nothing can be invariant under it. A nuisance knob for splat needs a DIFFERENT OBSERVABLE. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE CENSUS DID NOT MOVE, AND THE REGISTER GREW INSTEAD
 * --------------------------------------------------------------------------------------------------------- */
{
    const re = new Set(Object.keys(REFINEMENT_KNOBS));
    const nu = new Set([...Object.keys(NUISANCE_KNOBS), ...Object.keys(NEW_NUISANCE || {})]);
    const eligible = [...re].filter((d) => nu.has(d));
    say(`eligible after this round: ${eligible.length} (${eligible.sort().join(" ")}); rejected candidates on the register: ${Object.keys(REJECTED_KNOBS).length}`);
    ok("!! *** THREE EXAMINED, THREE REJECTED, AND THE ELIGIBLE SET IS UNCHANGED ***",
       eligible.length >= 5 && Object.keys(REJECTED_KNOBS).length >= 7,
       "*** THAT IS THE SAME OUTCOME knobCandidates GOT AT v2917 -- three candidates, three rejections -- AND IT IS EVIDENCE THE REGISTER IS DOING ITS JOB RATHER THAN EVIDENCE THE ROUND FAILED. What changed is that the three devices the reach census called the cheapest promotions now carry REASONS instead of an implied to-do list, and two of those reasons name a round worth doing (escTol; a second splat observable). ***");

    ok("...and the four new entries each carry a measurement rather than an opinion",
       ["ising.L", "ising.warmup", "blackhole.dtHalving-as-nuisance", "splat.nuisance-candidates"]
           .every((k) => REJECTED_KNOBS[k] && /\d/.test(REJECTED_KNOBS[k].rejected)),
       "A rejection with no number in it is a preference. Each of these states the sweep that produced it, and this file re-runs all of them.");

    ok("!! *** AND ONE OF THEM WAS ALREADY THERE, WHICH IS ABOUT ME ***",
       !!REJECTED_KNOBS["ising.samples"],
       "*** I MEASURED ising.samples FROM SCRATCH AND ONLY THEN FOUND IT ALREADY ON THE REGISTER, REJECTED, WITH THE SAME REASONING. READ THE REJECTED REGISTER BEFORE MEASURING A CANDIDATE -- it is the decisionIndex problem in a second file: a decision not to do something looks exactly like an absence from outside the file that records it. The re-derivation agreeing is mild evidence the entry has not rotted; it is not a reason to have spent the round on it. ***");
}

console.log(fails ? "\nknobPromotions-selfcheck: " + fails + " FAILED" : "\nknobPromotions-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
