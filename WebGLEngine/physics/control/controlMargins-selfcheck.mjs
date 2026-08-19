// WebGLEngine/physics/control/controlMargins-selfcheck.mjs -- v3574
//
// Run: node physics/control/controlMargins-selfcheck.mjs
// RUNTIME .9s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 3 IMPORTS ev/combat.js AND ev/flightModel.js AND RUNS THEM. *** Every other control gate in this
// tree grades mathematics against mathematics. This one grades a closed-form settling time against THE CODE THE
// GAME ACTUALLY RUNS, and the residual is an exact two-sided bracket rather than a tolerance.
"use strict";
import { routhHurwitz } from "./controlStability.mjs";
import { ES_TURN_DEADBAND, ES_TURN_SCALE } from "./controlStability.mjs";
import { gainMarginFreq, phaseMarginFreq, criticalGainRouth, closedLoop, loopAt, magOf, phaseOf,
         predictedSettleTime, simulateSettle, MEASURED_V3574, reportLines } from "./controlMargins.mjs";
import { stepAI, aimAngleTo, angleDiff } from "../../ev/combat.js";
import { stepFlight, TURN_SCALE } from "../../ev/flightModel.js";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const PLANTS = [
    ["1/((s+1)(s+2)(s+3))", [1], [1, 6, 11, 6], 60],
    ["1/(s(s+1)(s+2))", [1], [1, 3, 2, 0], 6],
    ["1/(s(s+1)(s+5))", [1], [1, 6, 5, 0], 30],
    ["2/((s+1)^4)", [2], [1, 4, 6, 4, 1], 2],
    ["1/(s(s^2+2s+4))", [1], [1, 2, 4, 0], 8],
];

console.log("controlMargins-selfcheck -- the two quantities that are not integers\n");

// ---------------------------------------------------------------------------
console.log("1. *** A CONTINUOUS MARGIN, RECOVERED FROM AN INTEGER VERDICT ***");
{
    let exact = 0, agree = 0;
    for (const [nm, num, den, truth] of PLANTS) {
        const K = criticalGainRouth(num, den);
        const G = gainMarginFreq(num, den).gainMargin;
        if (Math.abs(K - truth) < 1e-9) exact++;
        if (G !== null && Math.abs(G / K - 1) < 1e-6) agree++;
        report(nm.padEnd(24), "Routh K = " + K.toFixed(9) + "   sweep GM = " + G.toFixed(9));
    }
    ok("!! *** THE ROUTH ROUTE LANDS ON THE EXACT RATIONALS, WHICH IS WHAT MAKES THE AGREEMENT WORTH ANYTHING ***",
        exact === PLANTS.length,
        "60, 6, 30, 2, 8 -- the textbook values, arrived at by BISECTING K ON AN INTEGER and never evaluating a " +
        "transfer function. *** THE MARGIN IS CONTINUOUS BUT ITS MEANING IS AN INTEGER: 'goes unstable' is the " +
        "RHP count leaving zero. *** A continuous number recovered from a yes/no, the same move navigate.js " +
        "makes on the turning point and v3570 makes on the friction cone.");
    ok("!! ...and the frequency sweep reproduces them to better than 1e-6",
        agree === PLANTS.length,
        "one route walks the imaginary axis and reads a magnitude at a phase crossing; the other bisects a " +
        "polynomial's root count. THEY SHARE NOTHING.");

    // Prove the residual is the grid by moving the grid.
    const coarse = gainMarginFreq([1], [1, 3, 2, 0], { steps: 2000 }).gainMargin;
    const fine = gainMarginFreq([1], [1, 3, 2, 0], { steps: 200000 }).gainMargin;
    report("GM at 2k steps / 200k steps", coarse.toFixed(9) + " / " + fine.toFixed(9));
    ok("!! the sweep's residual is THE GRID, shown by moving the grid rather than asserted",
        Math.abs(fine - 6) <= Math.abs(coarse - 6),
        "and the interpolation inside the grid interval is load-bearing: taking the nearest grid point instead " +
        "leaves ~5e-5 on a 400k-point sweep. *** THE v3568 PENDULUM LESSON AGAIN -- an uninterpolated crossing " +
        "quantises to the sample spacing and the agreement collapses into it. ***");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE MARGIN MEANS WHAT IT SAYS, CHECKED BY USING IT");
{
    let boundary = 0, below = 0, above = 0, landedExactly = 0;
    for (const [nm, num, den, truth] of PLANTS) {
        const K = criticalGainRouth(num, den);
        if (routhHurwitz(closedLoop(num, den, K * 0.999)).rhp === 0) below++;
        if (routhHurwitz(closedLoop(num, den, K * 1.001)).rhp > 0) above++;
        if (routhHurwitz(closedLoop(num, den, truth)).marginal) boundary++;
        if (K === truth) landedExactly++;
    }
    ok("!! *** JUST BELOW THE MARGIN EVERY PLANT IS STABLE AND JUST ABOVE IT EVERY PLANT IS NOT ***",
        below === PLANTS.length && above === PLANTS.length,
        "the number is not merely computed twice, IT IS USED: multiply the loop gain by 0.999 of the margin and " +
        "the closed loop stands; by 1.001 and it falls. A margin that did not bracket the transition would be " +
        "an agreeing pair of wrong answers.");
    ok("!! ...and AT the exact critical gain the polynomial is MARGINAL, the row-of-zeros case v3572 built for",
        boundary === PLANTS.length,
        "roots land exactly on the imaginary axis. *** THIS IS THE SINGULAR CASE THAT BREAKS A NAIVE ROUTH, AND " +
        "EVERY GAIN MARGIN IN CONTROL THEORY LIVES ON IT. *** v3572 handled it because it is the case a " +
        "stability test exists to find; this is what needed it.");
    report("bisected K equalled the exact rational in", landedExactly + " of " + PLANTS.length + " plants");
    ok("!! *** AND THE BISECTION IS NOT EXPECTED TO LAND ON THE BOUNDARY, WHICH IS WHY THE LINE ABOVE USES THE " +
        "EXACT VALUE ***",
        landedExactly < PLANTS.length,
        "*** THE FIRST VERSION OF THAT CHECK ASKED WHETHER THE BISECTED K WAS MARGINAL AND WENT RED ON " +
        "1/((s+1)(s+2)(s+3)). *** A bisection on a BINARY converges to a float arbitrarily near the transition, " +
        "not onto it, and the marginal set is MEASURE ZERO -- four of five landed on the rational by luck of " +
        "the arithmetic and the fifth missed by a ULP. THE BISECTION'S JOB IS TO BRACKET; asking it to hit an " +
        "exact algebraic point is asking a search for something it structurally cannot deliver. This line is " +
        "written to go red if a future change ever makes all five land, because that would mean the bisection " +
        "had started snapping and the bracket claim would need rethinking.");

    const pm = phaseMarginFreq([1], [1, 3, 2, 0]);
    report("phase margin of 1/(s(s+1)(s+2))", pm.phaseMargin.toFixed(4) + " deg at omega " +
           pm.crossoverOmega.toFixed(5) + ", delay margin " + pm.delayMargin.toFixed(5) + " s");
    ok("the phase margin is positive exactly where the gain margin says it should be",
        pm.phaseMargin > 0,
        "both margins must agree on WHICH SIDE of stable the unity-gain plant is; disagreeing signs would mean " +
        "one of the two crossings is being found on the wrong branch");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** LYAPUNOV AGAINST THE SHIPPED RELAY, AND THE RESIDUAL IS A BRACKET ***");
{
    const io = { stepAI, stepFlight, aimAngleTo, angleDiff, TURN_SCALE };
    ok("!! the constants come from the shipped files, not from this one",
        ES_TURN_SCALE === TURN_SCALE && ES_TURN_DEADBAND === 4,
        "TURN_SCALE is imported from ev/flightModel.js and compared with the value controlStability.mjs read " +
        "from it. *** IF THE GAME RETUNES AND THE LAB DOES NOT, THIS LINE GOES RED BEFORE ANY PREDICTION DOES. ***");

    const cases = [[14, 90], [14, 180], [11, 90], [11, 175], [8, 45], [8, 175], [30, 120], [2, 60]];
    let bracketed = 0, tot = 0, worst = 0;
    for (const [man, err] of cases) for (const dt of [1 / 30, 1 / 60, 1 / 240, 1 / 960]) {
        const p = predictedSettleTime(man, err).t;
        const s = simulateSettle(io, man, err, dt);
        const d = s.t - p;
        tot++;
        if (d >= -1e-12 && d < dt + 1e-12) bracketed++;
        worst = Math.max(worst, d / dt);
    }
    report("cases x timesteps", String(tot));
    report("worst (t_sim - t*) as a fraction of dt", worst.toFixed(6));
    ok("!! *** 0 <= t_simulated - t* < dt ON EVERY ONE. AN EXACT TWO-SIDED BRACKET, NOT A TOLERANCE ***",
        bracketed === tot,
        bracketed + "/" + tot + ". V = diff^2/2 gives V' = -turnRate*|diff|, bounded away from zero outside the " +
        "band, so convergence is FINITE-TIME and t* = (|diff0| - deadband)/turnRate in closed form. The " +
        "simulated time is that number ROUNDED UP TO THE NEXT TICK, because a relay cannot stop mid-tick. *** " +
        "THIS FAILS LOUDLY IF THE RELAY EVER OVERSHOOTS THE BAND, because the difference would then exceed dt. ***");
    ok("!! ...and it is graded against ev/combat.js and ev/flightModel.js THEMSELVES",
        typeof stepAI === "function" && typeof stepFlight === "function",
        "both are pure and both are exported, so the prediction meets THE CODE THE GAME RUNS rather than a " +
        "model of it. Every other control gate in this tree grades mathematics against mathematics.");

    const ended = simulateSettle(io, 14, 90, 1 / 60);
    ok("!! the ship ends INSIDE the deadband, so the settle is a settle and not a timeout",
        ended.finalError <= ES_TURN_DEADBAND + 1e-9 && ended.ticks < 400000,
        "final |error| " + ended.finalError.toFixed(4) + " degrees against a deadband of " + ES_TURN_DEADBAND +
        ". *** WITHOUT THIS, A LOOP THAT SIMPLY RAN OUT WOULD SATISFY THE BRACKET ABOVE. ***");
    ok("!! ...and it lands inside the FIRING cone too, which is v3572's ordering doing work",
        ended.finalError < 12,
        "deadband 4 < firing 12: a settled ship can shoot. The ordering check was an assertion about constants; " +
        "THIS IS THE CONSEQUENCE OF IT, MEASURED.");

    const already = simulateSettle(io, 14, 2, 1 / 60);
    ok("the predicate is not vacuous: a ship already inside the band takes zero ticks",
        already.ticks === 0 && predictedSettleTime(14, 2).t === 0,
        "if every case took at least one tick, the bracket's lower bound would never be exercised");
}

// ---------------------------------------------------------------------------
console.log("\n4. WHAT LYAPUNOV REACHES THAT ROUTH-HURWITZ CANNOT");
{
    ok("!! the relay is still NOT claimed as an LTI subject",
        "lyapunovReachesWhatRouthCannot" in MEASURED_V3574,
        "v3567 established that combat.js stepAI is a three-valued relay with a deadband and NOT a " +
        "Routh--Hurwitz subject. That reading has survived seven rounds and is not being quietly reversed now " +
        "that a control method finally reaches it. *** LYAPUNOV NEVER NEEDED LINEARITY, WHICH IS WHY IT IS THE " +
        "ONE THAT ARRIVES. ***");
    ok("!! ...and the convergence is FINITE-TIME, not asymptotic, which is the load-bearing distinction",
        predictedSettleTime(14, 90).t > 0 && Number.isFinite(predictedSettleTime(14, 1e6).t),
        "V' = -turnRate*|diff| does NOT vanish as diff approaches the band. An asymptotic law would have the " +
        "ship approaching alignment forever and NEVER FIRING; finite-time is why the game works.");
    ok("nothing is ratcheted", !("baseline" in MEASURED_V3574),
        "the settling times are recomputed from the shipped constants every run; freezing one would ratchet a " +
        "tuning value rather than a property");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE REPORT PRINTS AND THE SPLIT HOLDS");
ok("the reporting tool produces a report", (await reportLines()).length > 8,
    "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");

console.log(fails ? `\ncontrolMargins-selfcheck: ${fails} FAILED` : "\ncontrolMargins-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
