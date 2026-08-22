// WebGLEngine/tools/roundhouse/clocksPlanted-selfcheck.mjs -- v3391
//
// *** THE MOST CONSPICUOUS GAP IN PLANTED-ERROR COVERAGE, CLOSED -- AND THE INTERESTING PART IS NOT THAT THE
// GATE CATCHES THE ERROR, IT IS THE RADIUS AT WHICH IT STOPS. ***
//
// clocks has four exact closed forms and a gate that has only ever passed, which plantedError.mjs calls
// "a pleasant fact and an epistemically empty one". So an error of known size is planted and the device is asked
// its ordinary question.
//
// THE ERROR IS THE ONE A CAREFUL PERSON ACTUALLY MAKES, not a scrambled constant: compose the gravitational
// factor sqrt(1 - 2M/r) with a special-relativistic factor sqrt(1 - v^2) at the Newtonian orbital speed
// v^2 = M/r. Dimensionally sound, correct at infinity, and wrong by EXACTLY 2 M^2 / r^2 -- second order, where
// the true answer differs from the static clock at first.
//
// A SCRAMBLED CONSTANT WOULD HAVE PROVEN NOTHING. Any check catches a factor of two. What makes this planted
// error worth having is that it is INVISIBLE FAR AWAY BY CONSTRUCTION, so the gate's answer is not "caught" or
// "missed" but a RADIUS -- and that radius is the honest statement of what a green run on this device means.
"use strict";
import { getDevice } from "./devices.mjs";
import { orbitingDilation, orbitingDilationNaive, staticDilation } from "../../physics/blackhole/clocks.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const dev = await getDevice("clocks");
const at = (r, planted) => dev.build({ mode: "rates", config: { r, planted } });

// ---- 1. THE NULL TEST COMES FIRST, BECAUSE EVERY FLOOR BELOW IT IS MEANINGLESS OTHERWISE ------------------
{
    const rows = [6, 9, 12, 30, 100].map((r) => at(r, false));
    const worst = Math.max(...rows.map((o) => o.crossoverResidual));
    say("unperturbed crossover residual across r = 6, 9, 12, 30, 100: worst " + worst.toExponential(3));
    ok("!! *** an unperturbed run does NOT trip the check -- and the residual is EXACTLY zero, not merely small ***",
        worst === 0 && rows.every((o) => o.planted === false),
        "plantedError.mjs's third design rule: a 'sensitive' gate that also fires on an unperturbed run is not " +
        "sensitive, it is broken. Here there is nothing to be within -- sqrt(1-3M/r) at r and sqrt(1-2M/(r/1.5)) " +
        "are the SAME EXPRESSION, so the crossover is an algebraic identity and IEEE-754 returns it bit-exactly");
    ok("...and the order statistic reads zero when nothing is planted",
        rows.every((o) => o.crossoverErrOrder === 0));
}

// ---- 2. THE PLANTED ERROR IS CAUGHT, AND ITS ORDER IS EXACT ----------------------------------------------
{
    const radii = [6, 8, 12, 20, 50, 100];
    const rows = radii.map((r) => ({ r, o: at(r, true) }));
    say("planted:  " + rows.map(({ r, o }) => "r=" + r + " -> " + o.crossoverResidual.toExponential(2)).join("  "));
    ok("!! the naive composition trips the crossover check at every radius tested",
        rows.every(({ o }) => o.crossoverResidual > 0 && o.planted === true),
        "worst " + rows[0].o.crossoverResidual.toExponential(3) + " at r = 6, least " +
        rows[rows.length - 1].o.crossoverResidual.toExponential(3) + " at r = 100");
    const orders = rows.map(({ o }) => o.crossoverErrOrder);
    ok("!! *** AND THE ERROR IS EXACTLY 2 M^2 / r^2 -- the ORDER is the same number at every radius ***",
        orders.every((v) => Math.abs(v - 2) < 1e-11),
        "(naive^2 - true^2) r^2 / M^2 = " + orders.map((v) => v.toFixed(9)).join(", ") + ". A SIZE SHRINKS " +
        "WITH RADIUS AND SAYS NOTHING; AN ORDER IS INVARIANT AND IS WHAT MAKES THE BLINDNESS STATABLE. The 2 is " +
        "derivable by hand: (1-2M/r)(1-M/r) = 1 - 3M/r + 2M^2/r^2, and the true rate is 1 - 3M/r");
}

// ---- 3. THE DETECTION FLOOR IS A RADIUS, AND IT SCALES THE WAY THE ORDER SAYS IT MUST ---------------------
{
    const firstInvisible = (tol) => { let r = 6; while (r < 1e9 && at(r, true).crossoverResidual >= tol) r *= 1.05; return r; };
    const tols = [1e-3, 1e-6, 1e-9, 1e-12];
    const radii = tols.map(firstInvisible);
    say("detection radius: " + tols.map((t, i) => t.toExponential(0) + " -> r ~ " + radii[i].toFixed(0) + "M").join("   "));
    ok("!! *** a green run on this device means 'correct, OR measured too far out to tell' -- and here is where ***",
        radii.every((r, i) => i === 0 || r > radii[i - 1]),
        "at a tolerance of 1e-6 the naive derivation is indistinguishable from the correct one beyond about " +
        radii[1].toFixed(0) + "M. THAT IS THE MOST VALUABLE OUTPUT HERE AND IT IS NOT A FAILURE OF THE HARNESS");
    // The ratios are DERIVED from the measured radii, never typed: a 1/r^2 error crosses a tolerance 1000x
    // smaller at a radius sqrt(1000) larger, so consecutive ratios must all be ~31.6 -- and if the error were
    // FIRST order they would be 1000. The two hypotheses are 30x apart, so this cannot pass by luck.
    const ratios = radii.slice(1).map((r, i) => r / radii[i]);
    ok("!! and the scaling CONFIRMS the order independently of section 2",
        ratios.every((x) => Math.abs(x / Math.sqrt(1000) - 1) < 0.05),
        "consecutive radii scale by " + ratios.map((x) => x.toFixed(1)).join(", ") + " against sqrt(1000) = " +
        Math.sqrt(1000).toFixed(1) + ". A FIRST-ORDER error would give 1000 -- the alternatives are thirty times " +
        "apart, so agreement here is evidence and not arithmetic luck");
}

// ---- 4. THE PERTURBATION ENTERS THE PHYSICS, NOT THE COMPARISON -------------------------------------------
{
    const n = at(12, false), p = at(12, true);
    ok("!! the planted run moves the ORBITING RATE itself, not just the residual",
        p.orbitingRate !== n.orbitingRate && p.staticRate === n.staticRate,
        "orbiting " + n.orbitingRate.toFixed(12) + " -> " + p.orbitingRate.toFixed(12) + " while the static " +
        "clock is untouched. Perturbing the measured number would have graded the comparator, which is " +
        "arithmetic and was never in doubt");
    ok("...and the naive function is a real second derivation, not the true one with a fudge added",
        Math.abs(orbitingDilationNaive(1, 12) - Math.sqrt((1 - 2 / 12) * (1 - 1 / 12))) === 0 &&
        orbitingDilation(1, 12) !== orbitingDilationNaive(1, 12),
        "it computes sqrt((1-2M/r)(1-M/r)) from the radius, so the whole path from knob to observable is what " +
        "gets graded");
    ok("the planted knob is REPORTED as an observable, so a reader can never mistake a planted run for a measurement",
        n.planted === false && p.planted === true && dev.observables.includes("planted"),
        "the convention the other thirteen binds already use");
}

// ---- 5. WHAT THIS DOES NOT CLAIM -------------------------------------------------------------------------
{
    // Honest scope, asserted rather than left as an impression.
    const other = ["spin", "signal", "epicyclic"].filter((m) => dev.modes.includes(m));
    const inert = other.filter((m) => JSON.stringify(dev.build({ mode: m })) === JSON.stringify(dev.build({ mode: m, config: { planted: true } })));
    ok("the planted error is scoped to the RATES mode and the other modes are unaffected, which is stated not hidden",
        inert.length === other.length,
        "inert under this plant: " + (inert.join(", ") || "none") + ". A planted error targets ONE derivation; " +
        "claiming it exercises the clock effect or the Shapiro delay too would be a coverage number bought with " +
        "a sentence. THOSE MODES REMAIN UNPLANTED AND THE COVERAGE CENSUS COUNTS THEM AS SUCH");
}

console.log(failed ? "\n[clocksPlanted-selfcheck] FAILED " + failed : "\n[clocksPlanted-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
