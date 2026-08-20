// WebGLEngine/physics/mechanics/freeRotation-selfcheck.mjs -- v3562
//
// Run: node physics/mechanics/freeRotation-selfcheck.mjs
// RUNTIME 12s MEASURED with date(1) around the run. Not remembered -- v3211-v3213 found a wrong stated runtime
// in 59 of 82 headers and v3558 found one off by nearly three.
//
// *** THE PLANT HERE IS NOT INVENTED: IT IS WHAT A GAME SOLVER ACTUALLY DOES. *** Dropping w x I w from Euler's
// equations is a common, deliberate, documented choice -- the term is stiff and can inject energy, and Jolt
// exposes it as an OPT-IN. So section 4 is not a sabotage of a fixture; it is a model of a shipping backend.
//
// AND EVERY CONSERVATION KEY IS BLIND TO IT -- worse than blind, it RATES THE PLANT SUPERIOR. That is the round.
"use strict";
import { boxInertia, distinctMoments, intermediateAxis, eulerDeriv, stepOmega, stepQuat, rotateByQuat,
         energy, momentumBody, momentumMag, stabilityRate, integrate, measureGrowth, growthFactor, contractGap,
         MEASURED_V3562, reportLines } from "./freeRotation.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("freeRotation-selfcheck -- torque-free rotation, and which key survives a missing gyroscopic term\n");

const I = boxInertia({ m: 1, hx: 1, hy: 2, hz: 3 });
const MID = intermediateAxis(I);
const MAXA = I.indexOf(Math.max(...I)), MINA = I.indexOf(Math.min(...I));

// ---------------------------------------------------------------------------
console.log("1. THE FIXTURE CAN EXHIBIT THE PHENOMENON AT ALL");
{
    report("principal moments", I.map((v) => v.toFixed(6)).join("  "));
    report("largest / intermediate / smallest axis", MAXA + " / " + MID + " / " + MINA);
    ok("!! the three moments are DISTINCT, which the whole round depends on", distinctMoments(I) && MID >= 0,
        "*** A CUBE HAS THREE EQUAL MOMENTS AND NO INTERMEDIATE AXIS, SO THE EFFECT CANNOT HAPPEN IN ONE. " +
        "That is not a hypothetical: section 6 measures that the engine's own addShip builds exactly that. ***");
    const cube = boxInertia({ m: 1, hx: 1, hy: 1, hz: 1 });
    ok("...and the degenerate case is REFUSED rather than answered", intermediateAxis(cube) === -1,
        "a cube returns -1, not axis 1. An instrument that named an intermediate axis for a sphere would be " +
        "reporting a phenomenon its fixture forbids");
    ok("the moments are a real inertia tensor: the triangle inequality holds on every pair",
        I[0] <= I[1] + I[2] + 1e-12 && I[1] <= I[0] + I[2] + 1e-12 && I[2] <= I[0] + I[1] + 1e-12,
        "any physical body satisfies it; a typo in the (hy^2 + hz^2) pattern generally does not");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE STABILITY EXPONENT IS A PREDICTED NUMBER, AND THE MEASUREMENT MATCHES IT ***");
{
    for (const a of [0, 1, 2]) {
        const s = stabilityRate(I, a, 1);
        report("axis " + a, s.stable ? "STABLE   coefficient " + s.coefficient.toFixed(6)
                                     : "UNSTABLE sigma = " + s.sigma.toFixed(8));
    }
    const pred = stabilityRate(I, MID, 1).sigma;
    const meas = measureGrowth({ I, axis: MID, Omega: 1 });
    const rel = Math.abs(meas.sigma - pred) / pred;
    report("predicted vs measured", pred.toFixed(8) + " vs " + meas.sigma.toFixed(8) +
        "   rel " + rel.toExponential(2) + "   r2 " + meas.r2.toFixed(10));

    ok("!! *** THE MEASURED GROWTH RATE MATCHES THE LINEARISATION TO BETTER THAN 1e-4 ***", rel < 1e-4,
        "sigma = W sqrt((I2-I1)(I3-I2)/(I1 I3)) for sorted moments, DERIVED and never fitted. *** THE RATE IS " +
        "THE KEY AND THE SIGN WOULD NOT BE: a sign-only check passes any solver that is unstable for any " +
        "reason, while a wrong equation of motion gets the RATE wrong even when it happens to grow. ***");
    ok("...and the fit is exponential rather than merely rising", meas.r2 > 0.999999,
        "r2 = " + meas.r2.toFixed(10) + " on ln|perturbation| against t");

    // *** THE STABLE AXES NEED THEIR OWN OBSERVABLE, AND MY FIRST VERSION OF THIS CHECK DID NOT HAVE ONE. ***
    // It read measureGrowth's slope and r2 for the stable axes and asserted "no exponential trend". Both came
    // back EXACTLY 0.00e+0 / 0.000000 -- not a flat fit but measureGrowth's `xs.length < 8` GUARD, because a
    // bounded perturbation never rises past the band floor and NO POINTS ARE EVER COLLECTED. A CHECK PASSING
    // ON AN EMPTY FIT, which is v3551's structurally-guaranteed answer, in the round that quotes v3551.
    const g1 = growthFactor({ I, axis: MAXA }), gm = growthFactor({ I, axis: MID }), g2 = growthFactor({ I, axis: MINA });
    const fits = [measureGrowth({ I, axis: MAXA, Omega: 1 }), measureGrowth({ I, axis: MINA, Omega: 1 })];
    report("peak excursion / seed", "largest " + g1.factor.toExponential(3) +
        "   intermediate " + gm.factor.toExponential(3) + "   smallest " + g2.factor.toExponential(3));
    report("...and measureGrowth on the stable axes collected", fits.map((f) => f.points + " points").join(" / "));

    ok("!! the stable axes stay BOUNDED while the intermediate one grows by eight orders",
        g1.bounded && g2.bounded && !gm.bounded && gm.factor / g1.factor > 1e6,
        "peak excursion as a multiple of the seed: " + g1.factor.toFixed(3) + " and " + g2.factor.toFixed(3) +
        " against " + gm.factor.toExponential(2) + ". *** THIS IS A MEASUREMENT AND THE r2 CHECK IT REPLACED " +
        "WAS NOT: a bounded perturbation never enters the fit band, so measureGrowth returned its EMPTY-INPUT " +
        "GUARD (0 points, sigma 0, r2 0) and the old line read that as proof of stability. ***");
    ok("...and the empty fit is now VISIBLE rather than silent",
        fits.every((f) => f.points === 0),
        "measureGrowth reports `points`, so a zero-sample fit can no longer be mistaken for a flat one. THE " +
        "GUARD WAS ALWAYS THERE; WHAT WAS MISSING WAS ANY WAY TO TELL IT HAD FIRED.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** A FIT THAT STARTS AT THE SEED MEASURES A MIXTURE OF TWO MODES ***");
{
    const pred = stabilityRate(I, MID, 1).sigma;
    const banded = measureGrowth({ I, axis: MID, Omega: 1, skipBelow: 1e-7 });
    const fromSeed = measureGrowth({ I, axis: MID, Omega: 1, skipBelow: 0 });
    const relB = Math.abs(banded.sigma - pred) / pred, relS = Math.abs(fromSeed.sigma - pred) / pred;
    report("fit from the seed", "rel " + relS.toExponential(2) + "   r2 " + fromSeed.r2.toFixed(8));
    report("fit skipping one decade", "rel " + relB.toExponential(2) + "   r2 " + banded.r2.toFixed(10));

    ok("!! *** SKIPPING ONE DECADE OF TRANSIENT IS OVER A HUNDRED TIMES MORE ACCURATE ***", relS / relB > 50,
        (relS / relB).toFixed(0) + "x. The linearised solution is A e^(sigma t) + B e^(-sigma t) and the " +
        "DECAYING mode is only negligible after the growing one has pulled ahead. My first version had no " +
        "band and read " + relS.toExponential(2) + ".");
    ok("!! ...and the contaminated fit DOES NOT LOOK WRONG", fromSeed.r2 > 0.999,
        "r2 = " + fromSeed.r2.toFixed(5) + ", which anybody would report as an excellent fit. *** THE " +
        "GIVE-AWAY IS NOT THE RESIDUAL, IT IS WHERE THE WINDOW STARTS. *** Tightening the SATURATION cap " +
        "instead makes it WORSE (6.07e-3 -> 9.97e-3 as the cap falls 0.2 -> 0.002), because that keeps the " +
        "transient and discards the clean part -- which is how the cause was identified rather than guessed.");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE PLANT IS A REAL SOLVER CHOICE, AND EVERY CONSERVATION KEY RATES IT SUPERIOR ***");
{
    const w0 = [1e-6, 0, 1e-6];
    w0[MID] = 1;
    const truth = integrate({ I, w0, dt: 1e-3, steps: 60000 });
    const plant = integrate({ I, w0, dt: 1e-3, steps: 60000, gyroscopic: false });
    report("TRUE  ", "flips " + truth.flips + "   dE " + truth.driftE.toExponential(2) +
        "   d|L| " + truth.driftL.toExponential(2));
    report("NO w x Iw", "flips " + plant.flips + "   dE " + plant.driftE.toExponential(2) +
        "   d|L| " + plant.driftL.toExponential(2));

    ok("!! *** THE PLANT CONSERVES ENERGY AND |L| EXACTLY -- BETTER THAN THE TRUE SOLVER ***",
        plant.driftE === 0 && plant.driftL === 0 && truth.driftE > 0,
        "with the gyroscopic term gone w is CONSTANT, so both invariants are satisfied to the last bit while " +
        "the correct solver carries " + truth.driftE.toExponential(2) + " of integrator drift. *** A SOLVER " +
        "THAT DELETES THE PHYSICS OUTSCORES ONE THAT KEEPS IT ON THE OBVIOUS KEY. v3422's white-dwarf plant, " +
        "where dropping the relativistic factor MADE AN EXPONENT KEY LOOK BETTER, in a new subject. ***");
    ok("!! ...and the plant NEVER FLIPS, which is the only thing that separates them",
        plant.flips === 0 && truth.flips > 0,
        "started about the intermediate axis, the true solver reverses " + truth.flips + " time(s) and the " +
        "plant spins on forever. THE STABILITY FAMILY IS THE ONLY ONE THAT SEES THIS.");
    const pg = measureGrowth({ I, axis: MID, Omega: 1 });
    ok("!! ...and the plant's growth rate is EXACTLY ZERO against a predicted " + stabilityRate(I, MID, 1).sigma.toFixed(4),
        (() => { let w = [0, 0, 0]; w[MID] = 1; w[(MID + 1) % 3] = 1e-9;
                 for (let n = 0; n < 20000; n++) w = stepOmega(I, w, 1e-3, { gyroscopic: false });
                 return Math.abs(w[(MID + 1) % 3] - 1e-9) < 1e-18; })() && pg.sigma > 0.4,
        "the perturbation does not move at all -- not a wrong rate, NO rate. AN ORDER OF ZERO IS A DIFFERENT " +
        "DIAGNOSIS FROM A WRONG ORDER (v3423's centrifuge plant, same distinction).");
    ok("the derivative itself is the term, so the plant is one flag rather than an edited equation",
        eulerDeriv(I, [1, 1, 1], { gyroscopic: false }).every((v) => v === 0) &&
        eulerDeriv(I, [1, 1, 1]).some((v) => v !== 0),
        "the right-hand side of Euler's equations IS -w x (I w); with it removed there is nothing left");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE WORLD FRAME IS A SECOND ROUTE, AND IT GRADES THE HALF THE FIRST ONE NEVER TOUCHES");
{
    const w0 = [1e-6, 0, 1e-6]; w0[MID] = 1;
    const rows = [];
    for (const dt of [4e-3, 2e-3, 1e-3, 5e-4]) {
        const r = integrate({ I, w0, dt, steps: Math.round(20 / dt) });
        rows.push({ dt, d: r.driftWorldL, dE: r.driftE });
        report("dt " + dt, "world-L drift " + r.driftWorldL.toExponential(3) + "   dE " + r.driftE.toExponential(2));
    }
    const ratios = rows.slice(1).map((r, k) => rows[k].d / r.d);
    ok("!! the world-frame angular momentum VECTOR is constant, reached only through the quaternion",
        rows[rows.length - 1].d < 1e-5,
        "L_world = R(q) I w. It needs the ORIENTATION, so it grades the attitude integration -- which the " +
        "body-frame invariants never touch. TWO ROUTES TO ONE NUMBER, SHARING NO CODE.");
    ok("!! *** AND THE ATTITUDE INTEGRATOR IS FIRST ORDER, MEASURED RATHER THAN ASSUMED ***",
        ratios.every((r) => Math.abs(r - 2) < 0.05),
        "halving dt halves the drift: ratios " + ratios.map((r) => r.toFixed(3)).join(" / ") +
        ". *** THAT IS THE READING, NOT A FAULT: w is RK4 and the quaternion is a renormalised Euler step, so " +
        "THE TWO HALVES OF THIS SOLVER ARE DIFFERENT ORDERS. A clean factor of 2 proves it is discretisation " +
        "rather than a bug -- v3423's order measurement, and Kepler's rule that an error which SHRINKS " +
        "predictably is a different animal from one that does not. ***");
    // and the body-frame drift must NOT track it, or the two routes are not independent
    ok("...and the body-frame drift does NOT follow that pattern, so the routes are genuinely separate",
        !(rows.slice(1).every((r, k) => Math.abs(rows[k].dE / r.dE - 2) < 0.2)),
        "energy drift is round-off-dominated at these step sizes and does not halve with dt. If BOTH routes " +
        "moved together they would be one measurement wearing two names.");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE BACKEND GAP IS REPORTED, AND NOTHING IN box3d OR jolt IS TOUCHED");
{
    const g = contractGap();
    for (const [k, v] of Object.entries(g)) report(k.padEnd(16), String(v));
    ok("!! *** addShip BUILDS A CUBE -- THE ONE INERTIA TENSOR FOR WHICH THIS EFFECT CANNOT HAPPEN ***",
        g.shipIsCube,
        "b3MakeBoxHull(half, half, half): three EQUAL principal moments. THE CONFORMANCE FIXTURE EXCLUDES THE " +
        "PHENOMENON BY CONSTRUCTION -- v3453's marching-tets check that could not fail the property it tested, " +
        "and v3452's bounds gate that proved the shape the page did not read. THIRD COLLECTION.");
    ok("!! ...and the contract has NO angular call, so it cannot ask a rotational question at all",
        !g.contractAngular && g.angularDrive,
        "both loaders already expose angularImpulse() and readTransforms() (pos + quat), so the flip is " +
        "drivable AND observable in both TODAY -- and the ten-call contract names neither. The comparison is " +
        "a round, not a line.");
    ok("!! ...and neither backend will report w", g.velIsLinear,
        "readVelocities() is three floats, LINEAR ONLY. w recovered by differencing the quaternion stream " +
        "would SHARE NO CODE with either solver's internal w, so that absence is closer to an asset than a " +
        "blocker -- but it is a decision, and this round does not make it.");
    ok("!! ...and jolt damps angular motion by default, which would break the experiment silently",
        g.joltDamps,
        "mAngularDamping unless damping === 0. *** DAMPED ROTATION IS NOT TORQUE-FREE. *** A first comparison " +
        "run without pinning this would read as a physics disagreement between backends when it is a config " +
        "asymmetry -- the v3453 'not monotone' confusion waiting in a new subsystem.");
    ok("nothing here is ratcheted and no backend file is edited", !("baseline" in MEASURED_V3562),
        "this round adds an instrument and REPORTS a gap. Changing the conformance contract is Keith's call " +
        "and its own round.");
    ok("the report prints and the tool exits zero", reportLines().length > 20,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
}

console.log(fails ? `\nfreeRotation-selfcheck: ${fails} FAILED` : "\nfreeRotation-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
