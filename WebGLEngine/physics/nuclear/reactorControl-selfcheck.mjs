// physics/nuclear/reactorControl-selfcheck.mjs
//
// Run: node physics/nuclear/reactorControl-selfcheck.mjs
// RUNTIME 60.6s MEASURED (median of 3 -- 60478/61146/60634 -- with date(1) around the run; 47s was written
// here as a guess before measuring and is named rather than overwritten). Nearly all of it is sections 3 and 4,
// which bisect the critical gain out of a NONLINEAR simulation: each probe integrates seven ODEs through a
// delay line for 300-1200 simulated seconds at dt = 1e-3, and a bisection is eighteen probes deep. That cost IS
// the section -- the cheap frequency-domain route is the thing it exists to check, so buying the answer a
// second expensive way is the whole point rather than an inefficiency to optimise away.
//
// *** THE DEVICE'S BEST FINDING IS A NEGATIVE ONE, AND IT SURVIVED BEING DISAPPOINTING. *** The round was
// scoped as "find the gain where the rod controller starts fighting the reactor". There is no such gain: a
// proportional controller on zero-power point kinetics is stable at EVERY gain, and so is one with a
// first-order rod-drive lag. Routh says so (criticalGainRouth returns null, an infinite margin) and the root
// locus explains why -- the prompt mode near -beta/LAMBDA = -325 s^-1 pulls the asymptote centroid to about
// -162, so every branch leaves into the left half plane however hard the loop pushes. The instability a real
// control room worries about is NOT in the neutronics; it is in the DELAY between measuring power and having
// moved a rod. That is what section 3 measures, and section 1 pins the negative result so it cannot quietly
// become "we never checked".
"use strict";
import {
    inhourComplex, plantAt, plantPolynomials,
    criticalGain, simulateLoop, criticalGainSimulated, simulatedPeriod, gainDollars,
} from "./reactorControl.mjs";
import { inhour, KEEPIN_U235, GEN_LWR, totalBeta } from "./kinetics.mjs";
import { criticalGainRouth, gainMarginFreq } from "../control/controlMargins.mjs";
import { routhHurwitz } from "../control/controlStability.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
const evalPoly = (c, x) => c.reduce((a, k) => a * x + k, 0);

console.log("reactorControl-selfcheck -- can a controller hold this reactor, and what breaks first?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PLANT IS kinetics.mjs's inhour EQUATION, IN TWO REPRESENTATIONS THAT MUST AGREE ***");
{
    // This module adds no plant model. It evaluates the one already gated -- once as a complex expression and
    // once as a ratio of polynomials assembled from the same six constants. If those two ever disagreed, one of
    // them would be a second, private model of the reactor wearing the same name.
    const { num, den } = plantPolynomials();
    ok("the polynomial plant has the expected degrees", num.length - 1 === 6 && den.length - 1 === 7,
        `num ${num.length - 1}, den ${den.length - 1}`);
    let worst = 0;
    for (const s of [0.1, 1, 5, -0.5, -2]) worst = Math.max(worst, rel(evalPoly(den, s) / evalPoly(num, s), inhour(s)));
    ok("!! den(s)/num(s) IS inhour(s) -- two representations of one plant, to machine precision",
        worst < 1e-12, "worst relative difference " + worst.toExponential(3));
    // and the complex continuation agrees with the real function on the real axis
    ok("...and the complex continuation reduces to inhour() on the real axis",
        rel(inhourComplex([0.7, 0])[0], inhour(0.7)) < 1e-14 && Math.abs(inhourComplex([0.7, 0])[1]) < 1e-18);
    ok("the plant has a pole at the origin -- a reactor integrates reactivity into power",
        Math.abs(evalPoly(den, 0)) < 1e-30, "den(0) = " + evalPoly(den, 0));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE NEGATIVE RESULT: WITHOUT DELAY THERE IS NO CRITICAL GAIN AT ALL ***");
{
    const { num, den } = plantPolynomials();
    ok("!! *** a proportional rod controller on this plant is stable at EVERY gain ***",
        criticalGainRouth(num, den) === null,
        "criticalGainRouth returns null -- an infinite gain margin, not a large one");
    ok("...confirmed directly: the closed loop has no right-half-plane root at any gain tried",
        [1, 1e2, 1e4, 1e6, 1e9].every((K) => {
            const cl = den.slice();
            for (let i = 0; i < num.length; i++) cl[den.length - num.length + i] += K * num[i];
            return routhHurwitz(cl).rhp === 0;
        }), "K = 1 through 1e9, all stable");
    ok("...and the frequency route agrees there is no -180 crossing to find",
        gainMarginFreq(num, den).gainMargin === null);
    // the root-locus reason, stated as a number rather than as an argument
    const fastest = totalBeta() / GEN_LWR;
    ok("!! the reason is the prompt mode at -beta/LAMBDA, which drags every branch left",
        fastest > 300, "-" + fastest.toFixed(0) + " s^-1 against delayed groups no faster than -3.01");
    report("this round was SCOPED as 'find the gain where the rods fight the reactor' and there is no such " +
           "gain. The finding is kept rather than quietly replaced by the delay result, because a device that " +
           "only reports what it set out to find cannot tell you when you were asking the wrong question");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** WITH TRANSPORT DELAY: TWO ROUTES TO THE CRITICAL GAIN, SHARING NO LINE ***");
{
    // One solves phase(G(jw)) - w*T = -pi in closed form. The other integrates seven nonlinear ODEs through a
    // real delay buffer and asks whether the envelope is still shrinking. They have no code in common beyond
    // the six published constants.
    const cases = [
        { T: 1, seconds: 300, tol: 5e-3 },
        { T: 2, seconds: 600, tol: 5e-3 },
        { T: 5, seconds: 1200, tol: 5e-3 },
    ];
    for (const c of cases) {
        const a = criticalGain(c.T);
        const b = criticalGainSimulated(c.T, { seconds: c.seconds });
        ok(`T=${c.T}s: exact ${a.K.toExponential(5)} vs simulated ${b.toExponential(5)}`,
            rel(b, a.K) < c.tol, "rel " + rel(b, a.K).toExponential(2));
    }
    report("the simulation window grows with the delay on purpose -- see the convergence check below");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE RESIDUAL IS THE MEASUREMENT, NOT THE PHYSICS -- SHOWN BY MAKING IT SHRINK ***");
{
    // *** THIS IS THE CHECK THAT TURNED A DISAGREEMENT INTO EVIDENCE. *** At T = 5 s the two routes first
    // differed by 2.45e-2, which is large enough to be a real disagreement about the reactor. It is not: the
    // oscillation period there is 11.2 s, so a 300 s window holds only a couple of dozen cycles and the
    // envelope test cannot resolve the boundary. Lengthening the window collapses the gap, which is what a
    // MEASUREMENT error does and what a physics error does not.
    const a = criticalGain(5);
    const errs = [300, 600, 1200].map((s) => rel(criticalGainSimulated(5, { seconds: s }), a.K));
    ok("!! the two routes converge as the simulation window lengthens",
        errs[1] < errs[0] / 5 && errs[2] < errs[1],
        errs.map((e) => e.toExponential(2)).join(" -> ") + "  (300s / 600s / 1200s)");
    ok("...to better than 1e-5, which no residual physics disagreement would allow", errs[2] < 1e-5,
        errs[2].toExponential(2));
}

// ---------------------------------------------------------------------------
console.log("\n5. *** AND THE FREQUENCY ROUTE PREDICTS THE OSCILLATION PERIOD, A SECOND INDEPENDENT NUMBER ***");
{
    // A gain is one number and could be matched by luck. The frequency-domain route also says HOW FAST the
    // reactor will oscillate when it goes, and the simulation can be asked that separately.
    for (const T of [1, 2, 5]) {
        const a = criticalGain(T);
        const p = simulatedPeriod(a.K, T, { seconds: T >= 5 ? 900 : 300 });
        ok(`T=${T}s: predicted period ${a.periodSeconds.toFixed(4)}s vs measured ${p ? p.toFixed(4) : "n/a"}s`,
            p !== null && rel(p, a.periodSeconds) < 5e-3, p ? "rel " + rel(p, a.periodSeconds).toExponential(2) : "no crossings");
    }
    report("matching a gain AND the frequency it rings at is a much harder coincidence than matching a gain");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE CRITICAL GAIN IS beta, RECOVERED FROM A QUESTION THAT NEVER MENTIONS REACTIVITY ***");
{
    const B = totalBeta();
    const ratio = (T) => gainDollars(criticalGain(T).K);
    ok("!! at T = 0.2s the critical gain IS beta, to four figures", rel(ratio(0.2), 1) < 1e-3,
        "K/beta = " + ratio(0.2).toFixed(6));
    report("beta reaches this section only as six published fractions inside inhour(); nothing here compares " +
           "anything to it, and the control problem is a different question from the period problem");

    // *** A PLATEAU, NOT A LIMIT, AND IT ENDS AT BOTH EDGES FOR TWO DIFFERENT REASONS. *** A one-sided check
    // would have read the low end as agreement and the high end as noise.
    const long = ratio(20), mid = ratio(0.2), short = ratio(0.01);
    ok("!! at LONG delay the gain falls BELOW beta -- the delayed groups have not saturated",
        long < 0.6, "K/beta = " + long.toFixed(4) + " at T=20s");
    ok("!! at SHORT delay it rises ABOVE beta -- the prompt term w*LAMBDA takes over",
        short > 1.2, "K/beta = " + short.toFixed(4) + " at T=0.01s");
    ok("...with a plateau between them where it is beta", Math.abs(mid - 1) < 1e-3 && long < mid && mid < short);
    // the stated cause, checked as a number rather than asserted
    const wShort = criticalGain(0.01).omega, wLong = criticalGain(20).omega;
    ok("...and the causes are the ones named: w*LAMBDA is significant at the short end and w << lambda_6 at the long end",
        wShort * GEN_LWR > 1e-3 && wLong / KEEPIN_U235.lambda[5] < 0.1,
        `short: w*LAMBDA=${(wShort * GEN_LWR).toExponential(2)}  long: w/lambda_6=${(wLong / KEEPIN_U235.lambda[5]).toFixed(3)}`);
}

// ---------------------------------------------------------------------------
console.log("\n7. *** SABOTAGE ***");
{
    // the envelope test must be able to say "unstable"
    const a = criticalGain(1);
    ok("!! well above the critical gain the simulation genuinely diverges", simulateLoop(a.K * 4, 1).grows);
    ok("!! and well below it, it genuinely settles", !simulateLoop(a.K / 4, 1).grows);
    // *** THIS LINE WAS `ok(..., true)` IN THE FIRST DRAFT -- A CONTROL THAT CANNOT FAIL, WRITTEN AS PROSE
    // WEARING AN ASSERTION. *** What it was gesturing at is real and is checkable: the verdict must be
    // MONOTONE in the gain, i.e. a single crossing rather than a speckle, because bisection on a
    // non-monotone predicate converges to whichever edge it happened to bracket.
    const ladder = [0.25, 0.5, 0.9, 1.1, 2, 4].map((f) => simulateLoop(a.K * f, 1).grows);
    const firstGrow = ladder.indexOf(true);
    ok("!! the stability verdict is MONOTONE in the gain -- one crossing, so bisection means something",
        firstGrow > 0 && ladder.slice(firstGrow).every(Boolean) && ladder.slice(0, firstGrow).every((g) => !g),
        "x0.25 .. x4 -> [" + ladder.map((g) => (g ? "grow" : "settle")).join(", ") + "]");

    // a wrong plant must move the answer
    const halfBeta = { beta: KEEPIN_U235.beta.map((b) => b / 2), lambda: KEEPIN_U235.lambda };
    const bent = criticalGain(1, { groups: halfBeta });
    ok("!! halving every delayed fraction halves the critical gain", rel(bent.K, a.K / 2) < 0.05,
        bent.K.toExponential(5) + " against " + (a.K / 2).toExponential(5));
    report("that is the beta result again from the other side: the gain a loop can hold IS the delayed " +
           "fraction, so a reactor with half the delayed neutrons is half as controllable");
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
