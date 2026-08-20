// WebGLEngine/tools/ship/floors-selfcheck.mjs -- v2991
//
// Run: node tools/ship/floors-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/floors.mjs -- the answer to "which of these green checks can actually fail?"
//
// v2990 characterised ONE tolerance and the obvious next step was to sweep the physics suite. IT CANNOT BE
// SWEPT, AND THAT IS THE FINDING: zero of the 38 suite checks accept an argument. Every one is a closure with
// its grid, its tau and its forcing welded shut, so there is no knob to perturb and no way to ask what any of
// them would catch. Their tolerances remain justified the circular way plantedError warned about, and not one
// can be characterised without being rewritten first.
//
// THAT IS WHY plantedError SAT UNUSED FOR A HUNDRED ROUNDS. Not forgotten -- its subject was shaped so it could
// not be applied, and nothing said so. A more interesting kind of orphan than the census was built to find.
import { POISEUILLE, THERMAL_LINE, SOUND_SPEED, THERMAL_DIFFUSIVITY, CONVERTED, FINDINGS_V3032, coverage, perturbed, characterisableCount, knobMoves } from "./floors.mjs";
import { REJECTED_KNOBS } from "../roundhouse/knobCandidates.mjs";
import { detectionFloor, sensitivityLine } from "../roundhouse/plantedError.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE STRUCTURAL FINDING, measured rather than asserted -------------------------------------------------
{
    const c = await characterisableCount();
    ok("the suite is large enough for this to matter", c.total >= 30, c.total + " checks");
    // *** v3536 -- THIS ASSERTED `characterisable === 0` AS A FINDING, AND THE FIELD IT READ WAS MEASURING THE
    // WRONG THING. *** It counted CHECKS whose run() takes an argument. All 38 have arity zero, so the number
    // was structurally pinned at 0 -- it could never have been anything else, and it read as "NONE OF THESE CAN
    // EVER BE CONVERTED" while FOUR CONVERSIONS SAT IN THE REGISTRY. A capacity metric saying the line is
    // impossible, beside the line. A SECOND DECLARATION NOBODY COMPARED, in the tool whose job is counting the
    // work left.
    //
    // Rewritten to the PROPERTY rather than the arrangement: what is true is that NO CHECK CARRIES ITS OWN KNOB
    // -- their physics is welded into a zero-argument closure -- WHICH IS WHY A CONVERSION NEEDS A HAND-WRITTEN
    // SPEC. That is the same fact the old line was reaching for, stated so it cannot be read as capacity.
    ok("!! no check carries its own knob, which is WHY a conversion needs a hand-written spec",
       c.checksTakingAKnobArgument === 0,
       c.checksTakingAKnobArgument + " of " + c.total + " take a knob argument. THE PHYSICS IS WELDED INTO A " +
       "ZERO-ARGUMENT CLOSURE, so nothing can be perturbed from outside and the knobs have to be declared by " +
       "hand -- with each one PROVEN to move the observable (POISEUILLE's `force` is the counterexample: a 20% " +
       "error moves the answer by EXACTLY 0.000000%, and a floor on it would have read BLIND at every epsilon).");
    ok("!! and the line's real progress is converted/total, both DERIVED",
       // *** v3537 -- THIS PINNED `converted === 4` AND WENT RED WHEN THE FIFTH CONVERSION LANDED. I WROTE IT
       // ONE ROUND AGO, IN THE ROUND THAT FIXED A COUNT PINNED WHERE PROGRESS WAS THE POINT. Twenty-three-plus
       // instances and the shortest gap yet between writing the law and breaking it. THE RATCHET RUNS ONE WAY:
       // a RISING converted count is the whole purpose of the line and must never fail a build. ***
       c.converted >= 4 && c.converted <= c.total && c.total >= 30,
       c.converted + " of " + c.total + " (was 4 at v3536; a RISING count is progress, never a failure). *** THERE IS NO DERIVABLE 'characterisable' FIGURE AND SAYING SO " +
       "BEATS A ZERO THAT READS AS 'NONE ARE POSSIBLE': sizing the remainder IS the conversion, because " +
       "deciding which knobs are real is the work. v3511's rule -- a rate wants BOTH terms derived -- arriving " +
       "at a case where one of them honestly cannot be. ***");
}

// ---- 2. THE PATTERN THAT FIXES IT, demonstrated on a real quantity ------------------------------------------------
{
    ok("a characterisable check exposes its knobs as DATA", Array.isArray(POISEUILLE.knobs) && POISEUILLE.knobs.length >= 1,
       POISEUILLE.knobs.join(", ") + " -- perturbable from outside, which is the whole difference");

    // ---- A KNOB THAT DOES NOT MOVE THE OBSERVABLE IS NOT A KNOB (v2992) ----------------------------------------
    //
    // I declared ["tau", "force"] and force is VACUOUS. Stokes flow is linear in the forcing, so the measured
    // profile and the analytic target scale together and the RELATIVE residual is invariant. A floor measured on
    // it would report BLIND AT EVERY EPSILON -- which reads as "this check is useless" when the truth is "that
    // knob is meaningless". THE SWEEP ITSELF CANNOT TELL THE TWO APART, because "the observable never moved" is
    // exactly what a blind check looks like. So vacuity must be tested BEFORE any floor is trusted.
    for (const k of POISEUILLE.knobs) {
        const m = knobMoves(POISEUILLE, k);
        ok("!! declared knob '" + k + "' actually MOVES the observable", m.isKnob,
           (100 * m.relativeMovement).toFixed(4) + "% movement at eps=0.20");
    }
    const vac = knobMoves(POISEUILLE, "force");
    ok("!! ...and the REJECTED knob provably does not", !vac.isKnob,
       "force moves the relative residual by " + (100 * vac.relativeMovement).toFixed(6) + "% at a 20% error -- exactly zero, and a floor on it would have read as a blind check");
    ok("...and the rejection is recorded WITH its reason", /invariant under forcing/i.test((POISEUILLE.vacuousKnobs || {}).force || ""),
       "a knob dropped without a reason gets re-added by the next reader");
    ok("knobCandidates' rejected-knob register is reachable", REJECTED_KNOBS && typeof REJECTED_KNOBS === "object",
       "written at v2917 for exactly this class -- 'each would have produced a knob that LOOKED declarable and then quietly poisoned a verdict' -- and unwired until now");
    ok("...and carries the tolerance it is measured against", POISEUILLE.tol > 0, "tol " + POISEUILLE.tol);

    const nominal = POISEUILLE.measure();
    ok("!! the UNPERTURBED run passes its own tolerance", nominal < POISEUILLE.tol,
       nominal.toExponential(3) + " vs " + POISEUILLE.tol + " -- my first nominal was 5.6e-2, ELEVEN TIMES the tolerance, which would have made every floor below it meaningless");
}

// ---- 3. THE FLOOR ITSELF ---------------------------------------------------------------------------------------------
{
    const r = await detectionFloor({ id: "lbm-parabola", measure: async (e) => perturbed(POISEUILLE, "tau", e),
                                     tol: POISEUILLE.tol, knob: "tau", epsMin: 1e-4, epsMax: 0.1, ratio: 2 });
    console.log("        " + sensitivityLine(r));
    ok("!! the check is NOT blind", r.floor != null && r.floor > 0 && r.floor < 0.1,
       "catches a planted error in tau of " + (100 * r.floor).toFixed(3) + "% or more");
    ok("...and a clean run does not trip it", !r.nullTrips,
       "if it did, nothing measured above would mean anything -- plantedError's own first run reported EVERY gate blind because it read an observable off a promise");
    ok("!! the observable AMPLIFIES the error", r.gain > 1,
       r.gain.toFixed(2) + "x -- a tolerance on the residual is a much tighter bound on the physics, and that is knowable only by planting the error");
    ok("...and it is sharper than the fleetBench twin", r.floor < 0.0128,
       (100 * r.floor).toFixed(3) + "% against fleetBench's 1.28% -- a tenfold tighter tolerance buys an eightfold tighter detection, which is the kind of statement a bare tolerance cannot make");
}

// ---- 4. THE SECOND CONVERSION, and it undoes its own headline (v2995) --------------------------------------------
{
    const nominal = THERMAL_LINE.measure();
    ok("!! the thermal check has ELEVEN ORDERS OF MAGNITUDE of headroom", nominal < 1e-12 && THERMAL_LINE.tol > 1e-3,
       nominal.toExponential(2) + " against a tolerance of " + THERMAL_LINE.tol +
       " -- the measured quantity is at MACHINE PRECISION while the bound sits eleven decades above it");

    // A COMPENSATED PAIR: each knob is multiplied by the other, and the other is zero.
    for (const k of ["beta", "gravity"]) {
        const m = knobMoves(THERMAL_LINE, k);
        ok("!! '" + k + "' is VACUOUS, and vacuous as a PAIR", !m.isKnob,
           "buoyancy enters as beta*gravity*T and both are 0 here, so each is multiplied by zero. Measured " +
           (100 * m.relativeMovement).toFixed(4) + "% movement");
        ok("...and the rejection is recorded with its reason", ((THERMAL_LINE.vacuousKnobs || {})[k] || "").length > 40);
    }
    ok("the surviving knob does move", knobMoves(THERMAL_LINE, "tauG").isKnob);

    // THE FINDING THAT UNDOES THE FLOOR.
    ok("!! the tauG sweep is declared NON-MONOTONE", THERMAL_LINE.nonMonotone === true,
       "a LARGER planted error slips through where a smaller one trips, so 'detects >= X' is NOT a valid summary of this check -- there is no threshold above which it reliably notices");
    ok("...and the likely cause is recorded rather than guessed at silently", /convergence artifact/i.test(THERMAL_LINE.note + " " + (THERMAL_LINE.nonMonotone ? "" : "")) || /NON-MONOTONE/.test(THERMAL_LINE.note || ""),
       "conduction between fixed-temperature walls is linear REGARDLESS of diffusivity, so tauG changes only how fast it converges -- the apparent sensitivity is about 12,000 steps, not about the physics the check names");
}

// ---- 5. THIRD CONVERSION: verifying a tolerance's RECORDED REASONING (v2996) -----------------------------------
//
// This check was already characterised INFORMALLY, rounds before plantedError existed. Its physicsSuite comment
// records that a 3% tolerance let a deliberate 0.7% error in CS2 "sail straight through", and that it was
// tightened to 0.2% as a result. Someone planted an error, watched it pass, and moved the bound -- the right
// method, arrived at by hand, written in prose, and NEVER RE-RUN.
//
// So the question is not "what does this catch?" but "IS THE RECORDED REASONING STILL TRUE?" -- the v2887 rule
// applied to a tolerance's justification rather than to a claim.
{
    const base = SOUND_SPEED.measure();
    ok("!! the recorded nominal reproduces", Math.abs(base - 5e-5) < 3e-5,
       (100 * base).toFixed(4) + "% against the comment's claimed 0.005% -- prose written rounds ago, now re-derived");
    ok("...and it passes its own tolerance", base < SOUND_SPEED.tol);

    const planted = SOUND_SPEED.measure({ cs2: (1 / 3) * (1 + 0.007) });
    ok("!! the 0.7% planted error IS caught by the tightened 0.2% bound", planted > SOUND_SPEED.tol,
       (100 * planted).toFixed(4) + "% observable -- the tightening was justified and the justification holds");
    ok("!! ...and WOULD have sailed through the old 3%", planted < 0.03,
       "which is exactly what the comment says happened, and why the bound moved");

    // The odd one of the three: this check ATTENUATES.
    const gain = planted / 0.007;
    ok("!! this check ATTENUATES rather than amplifies", gain < 1,
       "gain " + gain.toFixed(2) + "x -- a 0.7% error in the lattice constant shows up as only 0.35% in the observable. The LBM parabola amplifies 5.24x and thermal 68x, so 'gain' is not a property of the method, it is a property of each check, and a tolerance cannot be reasoned about without it.");
    ok("the recorded claim is carried as DATA, not only prose", SOUND_SPEED.recordedClaim &&
       SOUND_SPEED.recordedClaim.plantedError === 0.007 && SOUND_SPEED.recordedClaim.tolWas === 0.03,
       "so it can be re-derived rather than re-read");
    ok("the knob is a LATTICE CONSTANT, not a physical parameter", SOUND_SPEED.knobs[0] === "cs2",
       "perturbing it perturbs the arithmetic the whole solver is built on -- a different class from tau or beta");
}

// ---- 6. FOURTH CONVERSION: the same knob, the opposite role (v3031) --------------------------------------------
//
// This is the MIRROR of THERMAL_LINE and that is why it was worth doing next. There, tauG was a CONVERGENCE
// ARTIFACT: the steady linear profile is independent of diffusivity, so tauG changed only how fast the check
// got there, and the sweep flagged itself NON-MONOTONE. HERE THE DIFFUSIVITY IS THE MEASUREMENT -- a sinusoidal
// temperature field decays at a rate set by alpha, and alpha = cs^2 (tauG - 0.5) exactly.
//
// SAME KNOB. OPPOSITE ROLE. A tolerance cannot tell you which situation you are in, and neither can the name of
// the check; only planting an error can.
{
    const nominal = THERMAL_DIFFUSIVITY.measure();
    ok("!! the unperturbed run passes its own tolerance", nominal < THERMAL_DIFFUSIVITY.tol,
       nominal.toExponential(3) + " against " + THERMAL_DIFFUSIVITY.tol + " -- about fifteen times of headroom, against the ELEVEN ORDERS the conduction check had. Two thermal checks, wildly different margins.");
    ok("!! tauG is LOAD-BEARING here", knobMoves(THERMAL_DIFFUSIVITY, "tauG").isKnob,
       (100 * knobMoves(THERMAL_DIFFUSIVITY, "tauG").relativeMovement).toFixed(2) + "% movement -- in the conduction check the same knob only changed how fast it converged");

    // THE PREDICTION, MADE BEFORE MEASURING AND THEN CHECKED.
    const t = knobMoves(THERMAL_DIFFUSIVITY, "tau");
    ok("!! tau is VACUOUS here, exactly as predicted", !t.isKnob,
       (100 * t.relativeMovement).toFixed(4) + "% -- gravity and beta are zero so nothing advects, and the momentum solver is along for the ride. If tau HAD moved the answer, something was coupling that should not be.");

    const r = await detectionFloor({ id: "thermal-alpha", measure: async (e) => perturbed(THERMAL_DIFFUSIVITY, "tauG", e),
                                     tol: THERMAL_DIFFUSIVITY.tol, knob: "tauG", epsMin: 1e-3, epsMax: 0.2, ratio: 2 });
    console.log("        " + sensitivityLine(r));
    ok("!! it has a REAL floor, unlike its mirror", r.floor != null && r.floor > 0 && !/NON-MONOTONE/.test(sensitivityLine(r)),
       "catches " + (100 * r.floor).toFixed(2) + "% in tauG, monotone -- the conduction check flagged itself non-monotone and could not be summarised by a floor at all");
    ok("...and a clean run does not trip it", !r.nullTrips);
    ok("the gain is a THIRD data point on a spread that is now 136-fold", r.gain > 1 && r.gain < 10,
       r.gain.toFixed(2) + "x here, against 5.24x (parabola), 68x (conduction) and 0.50x (sound speed). GAIN IS A PROPERTY OF EACH CHECK, and four samples now span more than two orders of magnitude.");
}

// ---- 7. THE REGISTRY, AND A COUNT NOBODY MAINTAINS (v3032) ------------------------------------------------------
//
// Keith agreed to characterise all 38, which is a PRODUCTION LINE rather than a round. A production line needs
// somewhere to record what is done -- and that record is the exact shape of thing this tree has watched rot
// three times (v2976) and then three more times (v2999). A registry declaring "4 of 38" in a comment would be
// the seventh hand-written number waiting to go stale.
//
// SO BOTH NUMBERS ARE DERIVED. Done is the registry's own length; total is read from physicsSuite at run time.
{
    const c = await coverage();
    ok("!! the covered count is the registry's LENGTH, not a literal", c.done === CONVERTED.length,
       c.done + " converted -- adding a spec to CONVERTED is the whole act of recording progress");
    ok("!! ...and the total is read from physicsSuite", c.total === (await import("./physicsSuite.mjs")).CHECKS.length,
       c.total + " checks -- if someone adds a 39th, the remaining count moves on its own");
    ok("remaining is arithmetic, not a claim", c.remaining === c.total - c.done, c.remaining + " left");
    ok("every converted spec has a finding recorded", CONVERTED.every((s) => !!FINDINGS_V3032[s.id]),
       "a conversion whose result was not written down would have to be re-run to be known");
    ok("...and every finding names a converted spec", Object.keys(FINDINGS_V3032).every((k) => CONVERTED.some((s) => s.id === k)),
       "a finding with no spec is a claim about something that is not here");

    ok("!! the gain spread is RECOMPUTED from the findings", c.gainSpread > 100,
       c.gainSpread.toFixed(0) + "x across four samples -- the number that justifies the remaining work, and it must never be a sentence someone typed");
    ok("...and the floorless count too", c.floorless === 1,
       "one of four cannot be summarised by a floor at all, which is precisely why the other 34 cannot be assumed");
}

console.log(fails ? "\nfloors-selfcheck: " + fails + " FAILED" : "\nfloors-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
