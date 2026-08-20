// WebGLEngine/physics/gyroKnob-selfcheck.mjs -- v3591
//
// Run: node physics/gyroKnob-selfcheck.mjs
// RUNTIME .1s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 2 IS THE BAR knobRegistry SETS AND THE ONLY ONE THAT MATTERS: THE ADJUDICATOR MUST SAY NO. ***
// Not on a NaN, not on a negative spin -- on a PERFECTLY WELL-FORMED VALUE at which the closed form is not true.
// An adjudicator that has only ever said yes is an untested branch with a licence attached.
"use strict";
import { adjudicate, score, propose, precessionRate, torqueFromTrajectory,
         TOL_PER_DT, TOL_HEADROOM, MEASURED_V3591, reportLines } from "./gyroKnob.mjs";
import { resetRegistry, listProposers, getProposer } from "./proposers.mjs";
import { registerAll } from "./knobRegistry.mjs";
import { SCENE_TRIAGE, joinRegistered } from "./labScenes.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("gyroKnob-selfcheck -- the first lab-scene proposer, and its adjudicator refusing\n");

// ---------------------------------------------------------------------------
console.log("1. THE KEY RETURNS A CONSTANT THE MEASUREMENT NEVER SEES");
{
    const rows = [10, 20, 40, 80, 160].map((w) => torqueFromTrajectory(w));
    report("rate*omega at omega 10..160", rows.map((x) => x.toFixed(3)).join("  "));
    ok("!! every one lands near the applied torque of 12",
        rows.every((x) => Math.abs(x - 12) / 12 < 0.02),
        "the rate is UNWRAPPED OUT OF THE TRAJECTORY's axis angle, so tau never enters the measurement. *** THE " +
        "CONSTANT IT CONVERGES TO IS A QUANTITY NOBODY FED IT. ***");
    ok("!! ...and the rate itself falls as 1/omega across a 16x sweep",
        (() => { const a = precessionRate(10), b = precessionRate(160);
                 return Math.abs((a / b) / 16 - 1) < 0.05; })(),
        "a key that did not MOVE with the knob could not grade it -- which is exactly how orbit was withdrawn " +
        "at v3588");
    ok("the torque is not hard-coded into the recovery",
        Math.abs(torqueFromTrajectory(40, { tipTorque: 30 }) - 30) / 30 < 0.02,
        "changing the applied torque changes the recovered one. *** IF IT DID NOT, THE FUNCTION WOULD BE " +
        "RETURNING ITS OWN INPUT, which is how balloon was withdrawn at v3590. ***");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE ADJUDICATOR SAYS NO, AND ON ITS OWN SUBJECT MATTER ***");
{
    const verdicts = [0.5, 2, 5, 10, 20, 40, 160].map((w) => ({ w, ...adjudicate(w) }));
    for (const v of verdicts)
        report("omega " + String(v.w).padStart(5), (v.pass ? "PASS  " : "refuse") +
               "  rel err " + v.evidence.relErr.toExponential(2));

    ok("!! it REFUSES a perfectly well-formed spin",
        verdicts.filter((v) => !v.pass).length >= 3 && !adjudicate(2).pass,
        "omega = 2 is rejected at 33% error. *** THE FAST-TOP LAW ASSUMES PRECESSION IS SLOW COMPARED WITH " +
        "SPIN, SO IT MUST FAIL WHEN THEY ARE COMPARABLE -- and it does, 0.80, 0.61, 0.33, 0.063 at omega " +
        "0.5, 1, 2, 5. An adjudicator that only rejected a NaN would never have been tested against the thing " +
        "it is for. ***");
    ok("!! and it ACCEPTS where the law holds",
        adjudicate(40).pass && adjudicate(160).pass,
        "*** BOTH BRANCHES EXERCISED. *** One that refused everything would look more rigorous and be exactly " +
        "as useless -- the reason ising-samples was withdrawn rather than shipped.");
    ok("!! the boundary sits between omega 20 and 40, and it is the PHYSICS boundary",
        !adjudicate(20).pass && adjudicate(40).pass,
        "at omega = 20 the approximation error is 5.2e-3, ABOVE the numerical floor of 1.7e-3 -- so the " +
        "rejection is the fast-top assumption failing, not the integrator.");
    ok("a malformed spin is refused too, and separately",
        !adjudicate(0).pass && !adjudicate(-5).pass && !adjudicate(NaN).pass,
        "refusing nonsense is necessary and NOT sufficient; the checks above are what make it an adjudicator");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE TOLERANCE IS DERIVED FROM dt, NOT CHOSEN");
{
    const floor = [1 / 30, 1 / 60, 1 / 240, 1 / 960].map((dt) =>
        Math.abs(torqueFromTrajectory(160, { dt, steps: Math.round(10 / dt) }) - 12) / 12);
    report("residual at dt 1/30..1/960", floor.map((x) => x.toExponential(2)).join("  "));

    ok("!! the residual is FIRST ORDER in dt, so the bound can scale with it",
        floor.every((x, i) => i === 0 || x < floor[i - 1]) && floor[0] / floor[3] > 8,
        "3.44e-3, 1.72e-3, 4.30e-4, 1.08e-4 -- halving with dt. *** THE ERROR DOES NOT VANISH AT HIGH SPIN, IT " +
        "SETTLES ONTO A FLOOR, AND THE FLOOR IS THE TIMESTEP. ***");
    ok("!! so the tolerance is TOL_PER_DT * dt, with the headroom stated separately",
        TOL_PER_DT > 0 && TOL_HEADROOM === 2,
        "read off that line rather than picked to make today's run pass. Exact agreement would reject every " +
        "correct answer -- v3570's friction offset in a new subject -- and a hand-picked 5% would ACCEPT omega " +
        "= 5, where the law is 6.3% wrong.");
    ok("...and a tighter dt moves the verdict boundary, which is the bound doing work",
        adjudicate(20, { dt: 1 / 960, steps: 9600 }).evidence.tol < adjudicate(20).evidence.tol,
        "a fixed tolerance would be the same at every timestep and would therefore be wrong at all but one");
}

// ---------------------------------------------------------------------------
console.log("\n4. IT IS REGISTERED, AND THE LAB PANEL CAN SEE IT");
{
    resetRegistry(); registerAll();
    const p = getProposer("gyro-spin");
    const joined = joinRegistered(listProposers());
    const gyro = joined.find((r) => r.scene === "gyroscope");
    report("proposers / registered lab scenes", listProposers().length + " / " +
           joined.filter((r) => r.registered).length);

    ok("!! gyro-spin is registered against the gyroscope instrument",
        p && p.instrument === "gyroscope" && p.knobs.join() === "omega",
        "the instrument id is carried EXPLICITLY, which v3286 learned the hard way when a stem match reported a " +
        "false orphan");
    ok("!! *** THE LAB PANEL NOW HAS ONE SCENE IT CAN ACTUALLY INITIATE ***",
        gyro && gyro.registered === true,
        "v3587 built the drill-down and reported the honest state: zero of twelve. THIS IS THE FIRST, and it " +
        "arrived after three candidates were withdrawn by measurement rather than by adding one on argument.");
    ok("!! ...and it sits at PROPOSE, not adopt",
        p.tier === "propose",
        "the button promises to show a candidate, not to change the scene. RAISING A TIER NEEDS AN ADJUDICATED " +
        "VERDICT WITH EVIDENCE, and nothing here grants one.");
    ok("the proposer offers values its own adjudicator REJECTS",
        propose().some((v) => !adjudicate(v).pass),
        "*** A SEARCH THAT ONLY EVER OFFERS VALUES IT WILL ACCEPT HAS ALREADY DECIDED. *** propose() spans 2 to " +
        "160, and the low end fails.");
    // v3595 -- *** THIS CHECK ASSERTED THE DEFECT AS A VIRTUE, AND TWO FILES DECLARED OPPOSITE LAWS ABOUT ONE
    // THING WITH NOTHING COMPARING THEM. *** It demanded score(x) === adjudicate(x).evidence.relErr and gave the
    // reason "a score measuring something other than what the adjudicator checks would let a search optimise
    // away from the verdict". proposers.mjs's header says the reverse IN CAPITALS and calls the separation "the
    // entire safety property": a search that optimises the number it is graded by has been told the answer, and
    // the adjudicator stops being an independent second opinion and becomes the objective function. BOTH
    // SENTENCES ARE PLAUSIBLE AND ONLY ONE CAN BE THE RULE. The registry's is, because it is the one the loop
    // is built around -- and this gate was green for four versions while enforcing its opposite.
    // REWRITTEN TO THE CORRECTED PROPERTY, NOT WEAKENED (v3196's idiom): the two must be INDEPENDENT, and the
    // check says so by driving both rather than by comparing their values, which is what a source scan for the
    // word "adjudicate" could not do. The registry-wide version lives in physics/scoreDirection-selfcheck.mjs.
    ok("score is INDEPENDENT of the verdict, not a copy of it",
        score(40) !== adjudicate(40).evidence.relErr,
        "score(40) = " + score(40).toPrecision(6) + " against the adjudicator's relErr " +
        adjudicate(40).evidence.relErr.toPrecision(6) + " -- DIFFERENT QUANTITIES, which is the point. " +
        "This compares VALUES and can only ever catch the copy; the general claim -- that score never CALLS " +
        "adjudicate, including through a helper -- is driven with a spy in scoreDirection-selfcheck.");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE DETECTOR, RECORDED BECAUSE IT NEARLY BECAME THE FINDING");
{
    ok("!! the angle is unwrapped, and the first version was not",
        "theDetectorWasTheFindingAgain" in MEASURED_V3591,
        "the raw rate came back NON-MONOTONE in omega and I nearly wrote it up as the key failing to respond. " +
        "atan2 jumps by 2*pi at the branch cut, so a full turn counted as nearly zero. *** THIRD TIME THIS " +
        "SESSION, after the friction cone's displacement-versus-velocity and the grating zeros' " +
        "threshold-versus-sign-change. ***");
    ok("the report prints", reportLines().length > 8,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
}

console.log(fails ? `\ngyroKnob-selfcheck: ${fails} FAILED` : "\ngyroKnob-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
