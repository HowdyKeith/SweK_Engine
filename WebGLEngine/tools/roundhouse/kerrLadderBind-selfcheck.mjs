// tools/roundhouse/kerrLadderBind-selfcheck.mjs
//
// v3730 -- THE ANSWER KEYS FOR THE kerrladder DEVICE, BESIDE THE BIND (v3724's split, applied since v3728).
// Registry-shape checks live in tools/ship/labDevices-selfcheck.mjs. The instrument row's `gate` points here
// because deviceInstrumentMap takes a row's GATE IMPORTS as the modules that row exercises -- so this file
// imports physics/blackhole/kerrLadder.mjs directly AND USES IT (v3729's lesson, one round old).
//
// *** WHAT IS GRADED, AND WHY IT IS NOT THE FORMULAS: kerrLadder was HANDED Bardeen-Press-Teukolsky and its
// header prints them, so checking E(r) against BPT is a diff, not a grade -- and the shipped gate already does
// the a = 0 reduction against probe.js. WHAT EMERGES INSTEAD ARE TWO RADII THE FILE NEVER COMPUTES: the
// PHOTON ORBIT (where L diverges) and the ISCO (where E bottoms out). Both have exact closed forms sharing no
// operation with the algebra that must produce them, and the a = 0 anchors appear in NEITHER file. ***
//
// WHEN A CHECK HERE GOES RED:
//   section 1 -> the discriminant r^2 - 3Mr +- 2a sqrt(Mr) has moved. The trigonometric closed form is not a
//     tolerance to widen; it is exact.
//   section 2 -> read the two bars BEFORE touching either. The RADIUS bar is 1e-6 because sqrt(machine
//     epsilon) is 1.49e-8 and locating the ARGUMENT of a smooth minimum cannot beat it; the ENERGY bar is
//     1e-12 because the VALUE at a minimum is quadratic there and is limited by nothing of the sort. IF A
//     FUTURE METHOD LOCATES THE ARGUMENT BETTER, TIGHTEN THE RADIUS BAR -- do not loosen the energy one to
//     match it (v3724: two numbers are only comparable if the thing limiting them is the same).
//   section 3 -> the extremal limit is APPROACHED, never evaluated. a = M is singular. If this goes red the
//     approach has stopped being monotone, which is a finding about the solver, NOT a reason to evaluate at
//     a = 1 or to call 0.403324 agreement with 0.422650.

import { buildKerrLadder, kerrLadderDevice, kerrLadderDefaults, photonEdge, energyMinimum } from "./kerrLadderBind.mjs";
import { kerrCircularE, kerrCircularL } from "../../physics/blackhole/kerrLadder.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

// ---- 1. THE PHOTON ORBIT ---------------------------------------------------------------------------------
console.log("1. THE PHOTON ORBIT -- where the shipped L diverges, which the module never computes");
const p = await buildKerrLadder({ mode: "photon" });
ok("!! the radius where the SHIPPED angular momentum stops being finite IS the photon orbit, to machine precision",
    !p.error && p.photonWorstErr < 1e-12,
    `worst ${p.photonWorstErr.toExponential(3)} over ${p.photonRows} spin/sense rows (a = ${p.spins.join(", ")}, ` +
    `both senses) against a bar of 1e-12 -- ${(1e-12 / p.photonWorstErr).toFixed(0)}x. The algebra is ` +
    `r^2 - 3Mr +- 2a sqrt(Mr) = 0; the answer is 2M(1 + cos((2/3) acos(-+a/M))), WHICH SHARES NO OPERATION WITH IT`);

ok("...and at zero spin it is 3M exactly, an anchor that appears in NEITHER file",
    Math.abs(photonEdge(1, 0, true) - 3) < 1e-12 && Math.abs(photonEdge(1, 0, false) - 3) < 1e-12,
    `prograde ${photonEdge(1, 0, true).toFixed(12)}, retrograde ${photonEdge(1, 0, false).toFixed(12)} -- ` +
    `Schwarzschild has no preferred sense and the two searches are separate calls`);

// *** THE FINDING THAT COST THIS ROUND ITS FIRST TWO MEASUREMENTS. ***
const a998 = 0.998, insideL = kerrCircularL(1, a998, 0.5, true);
ok("!! *** 'WHERE L STOPS BEING FINITE' IS A BAND, NOT A HALF-LINE -- ASSERTED SO NOBODY RE-BRACKETS IT ***",
    Number.isFinite(insideL) && !Number.isFinite(kerrCircularL(1, a998, 1.0, true)),
    `at a = 0.998 the discriminant is NEGATIVE at r = 1.0 (L is NaN) and POSITIVE AGAIN at r = 0.5, INSIDE the ` +
    `horizon at 1.0632, returning a perfectly finite L = ${insideL.toFixed(6)}. A bisection from an arbitrary ` +
    `small floor converges on THAT edge and reports the photon orbit at 0.5. THE BRACKET STARTS AT THE OUTER ` +
    `HORIZON FOR THIS REASON -- v3708's lesson (capture is a band; bisection's premise is monotonicity) in a new place`);

// ---- 2. THE ISCO, AND TWO BARS THAT ARE DIFFERENT ON PURPOSE ---------------------------------------------
console.log("\n2. THE ISCO -- where the shipped E bottoms out, and the two limits are not the same limit");
const i = await buildKerrLadder({ mode: "isco" });
ok("!! the minimum of the SHIPPED energy sits at the ISCO across spin and sense",
    !i.error && i.iscoWorstRadiusErr < 1e-6,
    `worst radius error ${i.iscoWorstRadiusErr.toExponential(3)} against a bar of 1e-6 -- and the bar is 1e-6 ` +
    `because sqrt(machine epsilon) is ${i.sqrtEps.toExponential(3)} AND LOCATING THE ARGUMENT OF A SMOOTH ` +
    `MINIMUM CANNOT BEAT IT. The measurement is ${(i.iscoWorstRadiusErr / i.sqrtEps).toFixed(1)}x that floor, ` +
    `so this bar is NOT slack -- it is the method`);

ok("!! ...and the ENERGY there matches sqrt(8/9) to ONE ULP, which no reference implementation supplied",
    i.energyErr < 1e-12,
    `${i.energyAtIsco.toFixed(15)} vs ${i.energyAnchor.toFixed(15)}, err ${i.energyErr.toExponential(3)}. ` +
    `*** THE VALUE AT A MINIMUM IS QUADRATIC THERE AND IS NOT LIMITED BY sqrt(eps) THE WAY THE ARGUMENT IS -- ` +
    `that is why these two bars differ by six orders and why matching them would be wrong either way. ***`);

ok("...and the binding energy is the textbook 5.7191%",
    Math.abs(i.bindingFraction - 0.0571909) < 1e-6,
    `1 - E = ${(i.bindingFraction * 100).toFixed(4)}% -- the fraction of rest mass an accretion disc can radiate ` +
    `around a NON-spinning hole`);

report("WHY THE ISCO IS A KEY AND NOT A DIFF",
    "kerrLadder IMPORTS isco() from kerr.js to REFUSE stations, so it uses the number without ever deriving " +
    "it -- there is no minimisation, no derivative and no ISCO formula anywhere in the file. The minimum of " +
    "its own E is therefore something it was never told. AND THE a = 0 ENERGY ANCHOR NEEDS NEITHER FILE TO BE " +
    "RIGHT: sqrt(8/9) is external, so that check would survive kerr.js being wrong about everything.");

// ---- 3. THE EXTREMAL LIMIT, APPROACHED RATHER THAN EVALUATED ---------------------------------------------
console.log("\n3. THE EXTREMAL LIMIT -- a = M is singular, so the check has to be the APPROACH");
const e = await buildKerrLadder({ mode: "extremal" });
ok("!! the binding energy rises MONOTONICALLY toward 1 - 1/sqrt(3) and closes the gap at every step",
    !e.error && e.monotone && e.approaches,
    `a = ${e.spins.join(", ")} -> ${e.bindings.map((b) => b.toFixed(6)).join(" -> ")}, limit ` +
    `${e.limitValue.toFixed(6)}, remaining gap ${e.limitGap.toFixed(6)}`);

ok("!! ...and the LIMIT IS NOT CLAIMED AS AGREEMENT, which is the honest form of this check",
    e.limitGap > 0.01,
    `0.403324 against 0.422650 is 4.6% short, and it SHOULD be -- a = 0.99999 is not a = 1. *** A LIMIT ` +
    `CHECKED BY EVALUATING AT THE LIMIT IS A CHECK THAT CANNOT RUN. *** This line goes red if some future ` +
    `change makes the gap vanish, WHICH WOULD MEAN THE SINGULARITY HAD BEEN SMOOTHED OVER, not that the ` +
    `physics improved`);

// ---- 4. THE DEVICE CONTRACT ------------------------------------------------------------------------------
console.log("\n4. THE DEVICE CONTRACT");
ok("every key measured in every mode is declared",
    [p, i, e].every((o) => Object.keys(o).every((k) => kerrLadderDevice.observables.includes(k))),
    `${kerrLadderDevice.observables.length} declared observables across ${kerrLadderDevice.modes.length} modes`);

ok("each mode carries its OWN claim rather than one claim with a mode label",
    kerrLadderDefaults({ mode: "photon" }).claim.observable === "photonWorstErr" &&
    kerrLadderDefaults({ mode: "isco" }).claim.observable === "iscoWorstRadiusErr" &&
    kerrLadderDefaults({ mode: "extremal" }).claim.observable === "limitGap");

ok("!! the device REFUSES a = M rather than dividing by a singularity",
    kerrLadderDefaults({ config: { spin: 5 } }).config.spin < 1,
    `spin is clamped to 0.99999M (asked for 5, got ${kerrLadderDefaults({ config: { spin: 5 } }).config.spin}) -- ` +
    `the extremal hole is a LIMIT, and a config that reaches it produces numbers no check could interpret`);

ok("the searches are EXPORTED and driven here, so this gate reads the same radii the device does",
    typeof photonEdge === "function" && typeof energyMinimum === "function" &&
    Number.isFinite(energyMinimum(1, 0.9, true).E) && Number.isFinite(kerrCircularE(1, 0.9, 6, true)),
    "two copies of a search are two declarations about one experiment that nobody ever compares");

report("THE THREE PLANTS, RUN AGAINST THE SHIPPED FILES AND REVERTED",
    "A -- the L discriminant's frame-dragging term halved (2a -> 1a): 3 checks here go red (photon 1.31e+0, " +
    "the band assertion, the ISCO sweep) AND the module's own gate goes red too, so this round did not weaken " +
    "what was already there. C -- the photon bracket started from an arbitrary floor instead of the outer " +
    "horizon: 3 red, which is why that bracket is derived and not typed. " +
    "*** B IS THE ONE THAT JUSTIFIES THE ROUND: the ENERGY numerator's spin term 2% high. physics/blackhole/" +
    "kerrLadder-selfcheck.mjs PASSES ALL CHECKS under it -- its keys are the a = 0 reduction and the " +
    "prograde/retrograde symmetry, and BOTH KILL THE SPIN TERM BY CONSTRUCTION. The a = 0 energy anchor above " +
    "stays green for exactly the same reason and that is NOT a miss (v3715: ask whether the observable ever " +
    "claimed to look). THE SWEEP ACROSS SPINS CATCHES IT AT 2.77e-1, 277,000x its bar. A KEY EVALUATED ONLY " +
    "WHERE ITS PARAMETER IS ZERO IS BLIND TO EVERY TERM THAT PARAMETER MULTIPLIES. ***");

report("WHAT THIS DOES NOT CLAIM",
    "That kerrLadder is correct. ladderCost, senseAsymmetry and stationAvailable are UNGRADED here, and the " +
    "transfer-orbit cost its header explicitly scopes out remains out. gradedCoverage moving by one module " +
    "means THIS MODULE NOW HAS A KEY, not that it is verified.");

// ---- THE PLANT (v3763) -------------------------------------------------------------------------------------
// *** UNLIKE ct, THE INTERFEROMETER AND KEPLER, THIS DEVICE IS NOT A MIRROR: energyMinimum() runs a
// golden-section search on the effective potential and isco() evaluates the closed form -- TWO ROUTES SHARING
// NO CODE, agreeing to 3e-8. So the plant does not need to dodge a shared constant; it needs to BREAK ONE
// ROUTE AND LEAVE THE OTHER. ***
// *** THE MISTAKE THE API INVITES: energyMinimum(M, a, pro, ...) and isco(M, a, pro) TAKE THE ORBIT SENSE IN
// THE SAME ARGUMENT POSITION AND NOTHING ENFORCES THAT THE TWO CALLS AGREE. ***
console.log("\nTHE PLANT -- the orbit sense, wrong in one call and right in the other");
{
    const honest = await buildKerrLadder({ mode: "isco", config: { spin: 0.5 } });
    const planted = await buildKerrLadder({ mode: "spinsense", config: { spin: 0.5 } });
    ok("!! *** THE SEARCH AND THE CLOSED FORM STOP AGREEING, BY 1.06e8 ***",
        honest.iscoRadiusErr < 1e-6 && planted.iscoRadiusErr > 1,
        honest.iscoRadiusErr.toExponential(3) + " -> " + planted.iscoRadiusErr.toExponential(3) +
        ". The planted error is 3.322 M, WHICH IS THE PROGRADE-RETROGRADE GAP AT chi=0.5 -- not a scrambled " +
        "number but THE OTHER CORRECT ANSWER, which is why no eye catches it");
    ok("!! it is ONE-SIDED: the reference is untouched and only the measurement moved",
        planted.iscoReference === honest.iscoReference && planted.iscoMeasured !== honest.iscoMeasured,
        "reference " + honest.iscoReference.toFixed(6) + " in both arms; measured " +
        honest.iscoMeasured.toFixed(6) + " -> " + planted.iscoMeasured.toFixed(6) +
        ". A PLANT THAT FLIPPED BOTH WOULD CANCEL AND PROVE NOTHING (v3733)");
    ok("!! and the device DECLARES it, with `isco` first so the contract compares like with like",
        kerrLadderDevice.plantMode === "spinsense" && kerrLadderDevice.plantFlips === "iscoWorstRadiusErr" &&
        kerrLadderDevice.plantKind === "mode" && kerrLadderDevice.modes[0] === "isco",
        "plantedCoverage compares a mode plant against the first OTHER mode, and the plant is a variant of " +
        "isco -- v3762's lesson, one round old");

    // *** WHERE THE PLANT IS INVISIBLE, WHICH IS THE PART WORTH KNOWING. ***
    const h0 = await buildKerrLadder({ mode: "isco", config: { spin: 0 } });
    const p0 = await buildKerrLadder({ mode: "spinsense", config: { spin: 0 } });
    ok("!! *** AT a = 0 THE PLANTED AND HONEST RUNS ARE INDISTINGUISHABLE, AND THAT IS PHYSICS ***",
        Math.abs(p0.iscoMeasured - h0.iscoMeasured) < 1e-6 && Math.abs(h0.iscoMeasured - 6) < 1e-5,
        "both read " + h0.iscoMeasured.toFixed(6) + " = 6M. A NON-ROTATING BLACK HOLE HAS NO PROGRADE AND NO " +
        "RETROGRADE, so the flag handed in cannot matter. *** THIS IS v3734's epsR=1 EXACTLY -- A KEY EVALUATED " +
        "ONLY WHERE ITS PARAMETER IS ZERO IS BLIND TO EVERY TERM THAT PARAMETER MULTIPLIES -- AND THE DEVICE'S " +
        "OWN DEFAULT IS spin: 0, so a check that never varied the spin would have called this a plant that " +
        "does not fire ***");
    ok("!! which is why iscoWorstRadiusErr sweeps every spin rather than reading the configured one",
        p0.iscoWorstRadiusErr > 1,
        "worst " + p0.iscoWorstRadiusErr.toExponential(3) + " AT spin: 0 -- the sweep catches the plant even " +
        "when the CONFIGURED spin is the one value where it hides. A SINGLE-POINT KEY WOULD HAVE BEEN " +
        "SATISFIED BY THE DEFAULT");
}

report("AND WHAT THE PLANT DOES NOT TOUCH",
    "The PHOTON edge and the EXTREMAL limit are untested against a deliberate defect -- the plant runs the " +
    "isco branch only. ONE PLANT TESTS ONE CLAIM. The energy anchor is not flipped either: it is evaluated at " +
    "a = 0, where the plant provably cannot reach.");

console.log("\nkerrLadderBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
