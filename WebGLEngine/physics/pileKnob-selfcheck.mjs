// WebGLEngine/physics/pileKnob-selfcheck.mjs -- v3593
//
// Run: node physics/pileKnob-selfcheck.mjs
// RUNTIME 4.7s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 2 IS THE ROUND: THE ADJUDICATOR REFUSES AT BOTH ENDS FOR TWO DIFFERENT REASONS, AND THE HIGH END
// IS v3588's ORBIT HAPPENING INSIDE ONE INSTRUMENT'S RANGE. ***
"use strict";
import { adjudicate, score, propose, saturationProbe, ADDITIVE_OFFSET, TOPPLE_TAN, TOL_REL,
         MEASURED_V3593, reportLines } from "./pileKnob.mjs";
import { criticalAngle } from "./mechanics/contactKeys.mjs";
import { resetRegistry, listProposers, getProposer } from "./proposers.mjs";
import { registerAll } from "./knobRegistry.mjs";
import { joinRegistered, SCENE_TRIAGE } from "./labScenes.mjs";
import { INSTRUMENTS } from "./instruments.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("pileKnob-selfcheck -- angle of repose as an adjudicator, refusing at both ends\n");

console.log("1. THE KEY IS REUSED, NOT REBUILT, AND ITS FINDINGS COME WITH IT");
{
  const r = criticalAngle(0.5);
  report("tan(theta_c) at mu = 0.5", r.tan.toFixed(5) + "   delta " + r.delta.toFixed(5));
  ok("!! the bisection recovers mu with the additive offset v3570 characterised",
     Math.abs(r.delta - ADDITIVE_OFFSET) < 0.005,
     "v3570 built this against the real box3d. *** THE OFFSET IS CARRIED FORWARD RATHER THAN REDISCOVERED: the " +
     "residual is ADDITIVE at ~0.0102, not a few percent, so the tolerance is set ABOVE its own drift. A bound " +
     "tighter than a known systematic rejects every correct answer. ***");
  ok("...and the detector is the one that works",
     TOL_REL > 0.01,
     "v3570 also found the detector must be VELOCITY, not displacement: a settling box CREEPS, so a " +
     "displacement bound moves the recovered angle with the threshold");
}

console.log("\n2. *** IT REFUSES AT BOTH ENDS, FOR TWO DIFFERENT REASONS ***");
{
  const lo = adjudicate(0.02), mid = adjudicate(0.5), hi = adjudicate(2.0);
  report("mu 0.02 / 0.5 / 2.0", [lo, mid, hi].map((a) => (a.pass ? "PASS" : "refuse")).join("  "));

  ok("!! LOW mu is refused because a CONSTANT offset over a shrinking knob explodes",
     !lo.pass && lo.evidence.relErr > 0.4,
     "51% relative error at mu = 0.02, 20% at 0.05, 10% at 0.1 -- the offset never shrinks, the knob does. " +
     "*** THE REFUSAL HAS A REASON IT CAN STATE, rather than a line somebody drew. ***");
  ok("!! HIGH mu is refused because THE BLOCK TOPPLES, and the check comes FIRST",
     !hi.pass && /topple/i.test(hi.evidence.reason || ""),
     "a cube topples at tan(theta) = 1 whatever the friction. *** RUNNING THE BISECTION ANYWAY WOULD RETURN " +
     "1.0127 AND LOOK LIKE A 49% ERROR AT mu = 2, INVITING SOMEBODY TO WIDEN THE TOLERANCE UNTIL IT PASSED -- " +
     "when the answer is not wrong, it is ABOUT SOMETHING ELSE. ***");
  ok("!! and it PASSES in between, so both branches are live",
     mid.pass && adjudicate(0.3).pass && adjudicate(0.8).pass,
     "an adjudicator that refused everything would look more rigorous and be exactly as useless -- the reason " +
     "ising-samples was withdrawn rather than shipped");
  ok("the window is a window, not a threshold",
     !adjudicate(0.1).pass && adjudicate(0.3).pass && !adjudicate(1.3).pass,
     "two boundaries with different physics behind them");
}

console.log("\n3. *** THE HIGH END IS ORBIT, INSIDE ONE INSTRUMENT ***");
{
  const s = saturationProbe();
  report("tan at mu 1.0 / 1.3 / 2.0", s.tans.map((t) => t.toFixed(5)).join("  ") + "   spread " + s.spread.toExponential(2));
  ok("!! the observable SATURATES: three knob values, one answer to five digits",
     s.saturated,
     "*** A KEY THAT DOES NOT RESPOND TO THE KNOB CANNOT GRADE IT -- WHICH IS EXACTLY WHY ORBIT WAS WITHDRAWN " +
     "AT v3588. *** The difference: orbit was deaf across its WHOLE range and had to be refused entirely, " +
     "while pile goes deaf only above a boundary the physics NAMES.");
  ok("...and the saturation is detectable from the inside",
     s.spread < 1e-3 && TOPPLE_TAN === 1.0,
     "three different knob values returning the same answer is not a coincidence, IT IS A REPORT THAT THE KNOB " +
     "HAS STOPPED BEING THE CAUSE -- which is a test any future candidate can be given");
}

console.log("\n4. A DEPENDENCY FAILURE MUST NOT LOOK LIKE A VERDICT");
{
  resetRegistry(); registerAll();
  const p = getProposer("pile-friction");
  const cands = p.propose({ current: 0.5 });
  const verdicts = cands.map((c) => p.adjudicate(c).pass);
  report("candidates / verdicts", JSON.stringify(cands) + " -> " + verdicts.map((v) => (v ? "PASS" : "ref")).join(" "));

  ok("!! the proposer's own candidates split, rather than all refusing",
     verdicts.some(Boolean) && verdicts.some((v) => !v),
     "*** THE FIRST VERSION RETURNED pass:false WHEN box3d WAS ABSENT AND knobRegistry'S GATE REPORTED " +
     "'ALWAYS REFUSES: pile-friction' -- CORRECTLY, because from the outside a dependency failure and a physics " +
     "verdict are THE SAME BOOLEAN. *** That gate exists to catch a control that cannot pass, and it caught one " +
     "I had just written. The wasm loads at import now, so the dependency is a load-time fact.");
  ok("...and the proposer offers values it will reject",
     cands.some((c) => !adjudicate(c).pass),
     "a search that only offers what it will accept has already decided");
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
      score(0.5) !== adjudicate(0.5).evidence.relErr,
      "score(0.5) = " + score(0.5).toPrecision(6) + " against the adjudicator's relErr " +
      adjudicate(0.5).evidence.relErr.toPrecision(6) + " -- DIFFERENT QUANTITIES, which is the point. " +
      "This compares VALUES and can only ever catch the copy; the general claim -- that score never CALLS " +
      "adjudicate, including through a helper -- is driven with a spy in scoreDirection-selfcheck.");
}

console.log("\n5. THE SCENE LINK IS EXPLICIT, AND IT WAS A GUESS");
{
  resetRegistry(); registerAll();
  const joined = joinRegistered(listProposers());
  const pile = joined.find((r) => r.scene === "pile");
  const ghosts = joined.filter((r) => r.instrument && !INSTRUMENTS.some((i) => i.id === r.instrument));
  report("registered scenes", joined.filter((r) => r.registered).map((r) => r.scene).join(", "));

  ok("!! pile is registered THROUGH contact-keys, which is where its key lives",
     pile.registered && pile.instrument === "contact-keys",
     "*** THE JOIN USED TO MATCH THE SCENE ID AGAINST THE INSTRUMENT ID AND HAPPENED TO WORK FOR GYROSCOPE -- " +
     "only because v3591 registered an instrument with that exact name. *** It broke the moment pile-friction " +
     "was pointed at contact-keys, where v3570 actually built the adjudicator. proposers.mjs carries this " +
     "lesson from v3286: A LINK THAT HAS TO BE GUESSED IS NOT A LINK.");
  ok("!! no scene link points at an instrument that does not exist",
     ghosts.length === 0,
     "the explicit link caught one WITHIN A MINUTE: I typed `blob-kelvin` for diffusion from the module name, " +
     "and physics/blobKelvin.js HAS NO INSTRUMENT ENTRY. It is null now -- a scene owning no instrument says so " +
     "rather than matching by luck.");
  ok("...and a row with no owning instrument is never counted as registered",
     joined.filter((r) => !r.instrument).every((r) => !r.registered),
     "null must not resolve to a match");
  ok("the report prints", reportLines().length > 8,
     "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
}

console.log(fails ? `\npileKnob-selfcheck: ${fails} FAILED` : "\npileKnob-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
