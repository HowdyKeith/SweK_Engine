// tools/roundhouse/inspiralScaling-selfcheck.mjs
//
// Run: node tools/roundhouse/inspiralScaling-selfcheck.mjs   (~25s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3102 -- inspiral's TWO ERRORS GRADE THE SOLVER, NOT THE LAW.
//
// v3098 audited the five devices reporting two or more error fractions and found inspiral INDEPENDENT: no
// algebraic family reproduces one error from the other. It then flagged, without claiming, that BOTH live at
// 1e-10 to 1e-6 -- the round-trip-tautology signature. This settles it, and the suspicion was right.
//
// mergerErrFrac compares an adaptive RK4 integration of da/dt = -(64/5) Mc / a^3 against (5/256) a0^4 / Mc,
// which is the EXACT ANALYTIC INTEGRAL OF THAT SAME RATE. worstBulkErrFrac does the same thing pointwise along
// the trajectory instead of at the endpoint. Both therefore measure how well RK4 integrates a function whose
// antiderivative is already known -- WHICH IS WHY THEY SIT AT INTEGRATOR PRECISION rather than at physics
// agreement.
//
// PROVEN, NOT ARGUED: a rate law with the WRONG POWER, integrated against its own matching closed form, returns
// 1.7e-8 -- the same order as the correct pair's 6.4e-9. A COMPLETELY WRONG PHYSICAL LAW IS INVISIBLE TO BOTH
// CHECKS. And independence does not save them: v3098's lock test could only ask whether the two errors restate
// each other, and INDEPENDENCE AND TAUTOLOGY ARE ORTHOGONAL -- two quantities can be genuinely independent of
// one another and both be graded against the same forward model.
//
// THE INDEPENDENT KEY IS THE SCALING, and it needs no closed form at all. Peters says the merger time goes as
// a0^4 and as 1/[m1 m2 (m1+m2)]. Those exponents are claims about the LAW, and they can be MEASURED from the
// integrator alone by running it twice and taking a ratio. A wrong power in the rate changes the measured
// exponent; it cannot cancel, because nothing analytic is being compared against.

import { integrateInspiral } from "../../physics/orbits/inspiral.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const tMerge = (cfg) => integrateInspiral(cfg).mergerMeasured;

// ---- 1. WHAT THE EXISTING CHECKS ARE BLIND TO, EXHIBITED --------------------------------------------------------
{
    // Reimplemented locally so BOTH sides can be corrupted -- patching the shipping module to prove a point
    // about it would be the wrong trade, and the point is about the SHAPE of the comparison, not this code.
    const pair = (p) => {
        const Mc = 12, a0 = 10;
        const rate = (a) => -(64 / 5) * Mc / Math.pow(a, p);
        const closed = Math.pow(a0, p + 1) * 5 / (64 * (p + 1) * Mc);   // the exact integral OF THAT rate
        let a = a0, t = 0;
        for (let i = 0; i < 3e6 && a > a0 * 0.01; i++) {
            const dt = 0.01 * a / Math.abs(rate(a));
            const k1 = rate(a), k2 = rate(a + 0.5 * dt * k1), k3 = rate(a + 0.5 * dt * k2), k4 = rate(a + dt * k3);
            a += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4); t += dt;
        }
        return Math.abs(t + Math.pow(a, p + 1) * 5 / (64 * (p + 1) * Mc) - closed) / closed;
    };
    const right = pair(3), wrong = pair(4);
    ok("!! a WRONG power law, integrated against its own matching closed form, is INVISIBLE",
        wrong < 1e-6 && wrong / right < 100,
        "correct law " + right.toExponential(3) + " versus p = 4 " + wrong.toExponential(3) + " -- the same " +
        "order. Both checks measure how well RK4 integrates a function whose antiderivative is already known, " +
        "so the physics can be wrong and the residual stays at integrator precision");
}

// ---- 2. THE SCALING KEY, WHICH NEEDS NO CLOSED FORM -------------------------------------------------------------
{
    // t ~ a0^4: measure the exponent from two runs and a ratio. Nothing analytic is compared against, so a
    // wrong power in the rate cannot cancel out of it.
    const t1 = tMerge({ a0: 8 }), t2 = tMerge({ a0: 16 });
    const nA = Math.log(t2 / t1) / Math.log(2);
    ok("!! the measured a0 exponent is 4, from the integrator alone",
        Math.abs(nA - 4) < 1e-3,
        "t(16)/t(8) = " + (t2 / t1).toFixed(4) + " gives exponent " + nA.toFixed(6) + ". Peters says a0^4, and " +
        "this is measured by RATIO -- no closed form appears anywhere in it, so there is nothing for a wrong " +
        "power to cancel against");

    // t ~ 1/[m1 m2 (m1+m2)]: same trick on the mass combination.
    const mc = (m1, m2) => m1 * m2 * (m1 + m2);
    const A = { m1: 3, m2: 1 }, B = { m1: 6, m2: 2 };
    const tA = tMerge(A), tB = tMerge(B);
    const predicted = mc(A.m1, A.m2) / mc(B.m1, B.m2);
    ok("!! and the merger time scales as 1/[m1 m2 (m1+m2)]",
        Math.abs((tB / tA) / predicted - 1) < 1e-3,
        "measured ratio " + (tB / tA).toExponential(4) + " against " + predicted.toExponential(4) +
        " -- a factor of " + (1 / predicted).toFixed(0) + " from doubling both masses, and it lands. This is a " +
        "statement about the LAW that the merger-time check cannot make");

    ok("...and the two exponents are DIFFERENT claims, so one cannot stand in for the other",
        Math.abs(nA - 4) < 1e-3 && Math.abs(1 / predicted - 8) < 1e-9,
        "a0^4 and Mc^-1 are separate dependencies of the same rate law; getting one right says nothing about " +
        "the other, which is why both are measured rather than one being taken as evidence for the pair");
}

// ---- 3. WHAT IS STILL NOT GRADED -----------------------------------------------------------------------------------
{
    ok("the shipped device still reports its solver residuals, unchanged",
        (() => { const r = integrateInspiral({}); return r.mergerErrFrac < 1e-6 && r.worstBulkErrFrac < 1e-5; })(),
        "they are kept, because a solver residual is worth having -- it is worth having as a SOLVER residual, " +
        "which is the label this round attaches to it rather than removing the number");
    console.log("  NOTE   the scaling key tests that the coded rate has Peters' EXPONENTS. It does not test that");
    console.log("         Peters (1964) is the right law -- nothing in this lab compares any of it to an external");
    console.log("         gravitational-wave result, and no rearrangement of the same rate ever will. That is the");
    console.log("         boundary of what a single-repository lab can corroborate about itself.");
}

console.log();
if (fails) { console.log("inspiralScaling-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("inspiralScaling-selfcheck: all checks pass");
