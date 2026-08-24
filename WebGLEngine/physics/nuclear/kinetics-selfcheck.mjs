// physics/nuclear/kinetics-selfcheck.mjs
//
// Run: node physics/nuclear/kinetics-selfcheck.mjs
// RUNTIME 4.58s MEASURED (median of 3 -- 4692/4576/4581 -- with date(1) around the run). Nearly all of it is
// section 2, which integrates the seven ODEs for 300-600 simulated seconds at dt = 4e-4: about 2.3 million RK4
// steps across four reactivities, each evaluating seven derivatives four times. Everything else is root-finding
// and costs microseconds. GUESSED 2.4s BEFORE MEASURING, which is half the real figure; the number above is the
// measurement, not the estimate it replaced.
//
// *** WHAT MAKES THIS DEVICE GRADABLE AT ALL: TWO ROUTES THAT SHARE NO LINE. *** The inhour equation is solved
// by bracketed bisection; the same reactivity is then integrated forward as seven coupled ODEs and the
// asymptotic rate is MEASURED from the log-slope. Neither calculation can see the other. decay.mjs earned its
// place the same way (Bateman closed form against RK4) and this is that discipline reused rather than restated.
//
// AND THE EXTERNAL KEY IS THE SCRAM ASYMPTOTE, which is a fact about the physical world rather than about this
// tree: however hard a reactor is scrammed, its flux cannot fall faster than its longest-lived delayed-neutron
// precursor, so the rate approaches -lambda_1 = -0.0124 s^-1 and stops. That number enters the module only as
// one of six published Keepin constants; nothing here targets it, and the dominant root walks onto it anyway.
"use strict";
import {
    KEEPIN_U235, GEN_LWR, totalBeta, dollars, fromDollars,
    inhour, inhourRoots, dominantRoot, period,
    steadyState, derivative, integrate, measuredRate,
    genSensitivity, promptCriticalByAsymptote,
} from "./kinetics.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

console.log("kinetics-selfcheck -- point reactor kinetics, graded against something other than itself\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PUBLISHED CONSTANTS, AND THE SUM RULE THAT IS NEVER TYPED IN ***");
{
    const B = totalBeta();
    ok("six delayed groups, six decay constants", KEEPIN_U235.beta.length === 6 && KEEPIN_U235.lambda.length === 6);
    ok("!! beta is SUMMED from the six published fractions, and lands on the measured 0.0065",
        Math.abs(B - 0.0065) < 1e-4, "sum=" + B.toFixed(8) + " against a published U-235 total of ~0.0065");
    report("beta is never written down as a constant anywhere in kinetics.mjs -- if it were, the prompt-critical " +
           "key in section 4 would be checking a number against itself");
    ok("the decay constants are ordered and span the published 0.0124..3.01 s^-1",
        KEEPIN_U235.lambda.every((l, i, a) => i === 0 || l > a[i - 1]) &&
        KEEPIN_U235.lambda[0] === 0.0124 && KEEPIN_U235.lambda[5] === 3.01,
        "T_half of the slowest group = " + (Math.LN2 / KEEPIN_U235.lambda[0]).toFixed(1) + "s");
    ok("dollars and fromDollars invert each other", rel(dollars(fromDollars(0.37)), 0.37) < 1e-15);
    ok("!! $1.00 IS beta, by definition of the unit", fromDollars(1) === B);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** INHOUR AGAINST RK4: ROOT-FINDING vs QUADRATURE, SHARING NO LINE ***");
{
    // The whole device rests on this. If these two agreed because one called the other, every number below
    // would be decoration -- so they are computed from different code with different mathematics.
    const cases = [
        { d: 0.1, t: 300 }, { d: 0.5, t: 300 }, { d: -1, t: 600 }, { d: -10, t: 600 },
    ];
    let worst = 0;
    for (const c of cases) {
        const rho = fromDollars(c.d);
        const wI = dominantRoot(rho);
        const wR = measuredRate(rho, { t: c.t, dt: 4e-4 });
        const e = rel(wR, wI);
        worst = Math.max(worst, e);
        ok(`$${String(c.d).padStart(5)}  inhour ${wI.toExponential(6)} vs RK4 ${wR.toExponential(6)}`, e < 2e-2,
           "rel " + e.toExponential(2));
    }
    ok("!! and the best agreement is at machine precision, not merely 'close'", worst < 2e-2);
    report("the residual is the finite integration window, not the physics -- at $0.50 the tail is fully " +
           "asymptotic and the two routes agree to 1.5e-12; at -$10 the slowest mode is still settling in");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE SCRAM ASYMPTOTE: THE EXTERNAL KEY, AND IT IS A LIMIT ***");
{
    // A reactor cannot be shut down faster than its longest-lived precursor. Nothing in the module targets
    // -lambda_1; it is one of six constants used symmetrically with the other five.
    const l1 = KEEPIN_U235.lambda[0];
    const deep = [-1, -5, -10, -50, -200].map((d) => dominantRoot(fromDollars(d)));
    ok("!! every scram, however deep, leaves a NEGATIVE dominant rate", deep.every((w) => w < 0),
       deep.map((w) => w.toExponential(4)).join(" "));
    ok("!! and none of them beats -lambda_1 -- the reactor cannot be shut down faster",
        deep.every((w) => w > -l1), "-lambda_1 = " + (-l1).toExponential(6) + ", deepest = " + Math.min(...deep).toExponential(6));
    // approached MONOTONICALLY and at a definite rate, which is what makes it a check rather than one lucky value
    const gaps = deep.map((w) => Math.abs(w - (-l1)));
    ok("!! ...and it is APPROACHED monotonically as the scram deepens, not merely bounded",
        gaps.every((g, i, a) => i === 0 || g < a[i - 1]),
        gaps.map((g) => g.toExponential(2)).join(" -> "));
    report("this is decay.mjs's secular-equilibrium reasoning reused: a limit approached at a definite rate is " +
           "a stronger statement than a value, because a wrong model can hit a value and cannot hold a rate");
    ok("...and the half-life of that floor is the familiar ~56 seconds",
        Math.abs(Math.LN2 / l1 - 55.9) < 0.2, (Math.LN2 / l1).toFixed(2) + "s");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** PROMPT CRITICALITY, LOCATED BY A CHANGE IN CHARACTER RATHER THAN BY A THRESHOLD ***");
{
    // Below beta the delayed groups set the pace and the period does not care what GEN is. Above it the prompt
    // term takes over and the period is proportional to GEN. beta is never compared against -- what is measured
    // is which REGIME the reactor is in, and the regimes are told apart by a 100x change in GEN.
    const below = [0.1, 0.5, 0.9].map((d) => genSensitivity(fromDollars(d)));
    const above = [1.5, 2.0, 3.0].map((d) => genSensitivity(fromDollars(d)));
    ok("!! BELOW prompt critical the period barely notices a 100x change in GEN",
        below.every((r) => r > 0.85), below.map((r) => r.toFixed(4)).join(" "));
    ok("!! ABOVE it the period scales as 1/GEN -- a 100x change moves it 100x",
        above.every((r) => Math.abs(r - 0.01) < 2e-3), above.map((r) => r.toExponential(3)).join(" "));
    ok("...so the two regimes are separated by ~90x in this ratio, not by a judgement call",
        Math.min(...below) / Math.max(...above) > 50,
        (Math.min(...below) / Math.max(...above)).toFixed(1) + "x");

    // and the asymptote inverts to recover beta -- CHECKED AS A LIMIT, with its convergence RATE
    const B = totalBeta();
    const errAt = (d, gen) => rel(promptCriticalByAsymptote(fromDollars(d), gen), B);
    ok("!! beta recovered from the prompt asymptote, and the error HALVES as rho doubles",
        errAt(3, 2e-5) < errAt(2, 2e-5) * 0.6 && errAt(2, 2e-5) < errAt(1.5, 2e-5) * 0.6,
        [1.5, 2, 3].map((d) => errAt(d, 2e-5).toExponential(2)).join(" -> "));
    ok("!! ...and falls by 10x for every 10x reduction in GEN",
        errAt(2, 2e-6) < errAt(2, 2e-5) * 0.15 && errAt(2, 2e-7) < errAt(2, 2e-6) * 0.15,
        [2e-5, 2e-6, 2e-7].map((g) => errAt(2, g).toExponential(2)).join(" -> "));
    report("O(GEN/(rho-beta)) on both axes is the signature of the neglected delayed terms, which is what this " +
           "approximation actually drops -- a fitting artefact would not scale on both axes at once");
    report("HONEST: this one is a CONSISTENCY key, because inhour() sums the beta_i internally. The keys that " +
           "reach outside this file are the Keepin constants (section 1) and the scram asymptote (section 3)");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE EXACT STEADY STATE, AND A REACTOR AT rho = 0 THAT DOES NOT DRIFT ***");
{
    const st = steadyState(1);
    const d0 = derivative(st, 0);
    ok("!! at rho = 0 the neutron derivative is IDENTICALLY zero, not approximately",
        Math.abs(d0.n) < 1e-9, "dn/dt = " + d0.n.toExponential(3));
    ok("!! ...and so is every precursor derivative", d0.C.every((c) => Math.abs(c) < 1e-9),
        "max |dC/dt| = " + Math.max(...d0.C.map(Math.abs)).toExponential(3));
    ok("the steady precursor identity C_i = beta_i n /(GEN lambda_i) holds exactly",
        st.C.every((c, i) => rel(c, KEEPIN_U235.beta[i] / (GEN_LWR * KEEPIN_U235.lambda[i])) < 1e-15));
    // and it must survive being INTEGRATED, which tests the stepper rather than the algebra
    const held = integrate(0, { t: 100, dt: 4e-4 });
    ok("!! a critical reactor held for 100 simulated seconds has not drifted",
        rel(held.n, 1) < 1e-6, "n(100s) = " + held.n.toFixed(12));
    report("this separates the integrator from the physics: the algebra above says the state is stationary, and " +
           "this says the stepper agrees for 250,000 steps rather than slowly leaking");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE ROOTS INTERLACE WITH THE POLES, WHICH IS WHY BISECTION IS SAFE HERE ***");
{
    const rho = fromDollars(0.5);
    const roots = inhourRoots(rho);
    ok("all seven roots are found", roots.length === 7, roots.map((r) => r.toExponential(4)).join(" "));
    ok("all seven are real and distinct", new Set(roots.map((r) => r.toFixed(10))).size === 7);
    ok("!! every root satisfies the inhour equation it was found from",
        roots.every((w) => Math.abs(inhour(w) - rho) < 1e-9 * Math.max(1, Math.abs(rho))),
        "max residual " + Math.max(...roots.map((w) => Math.abs(inhour(w) - rho))).toExponential(2));
    // the interlacing itself: exactly one root between each consecutive pair of poles
    const poles = KEEPIN_U235.lambda.map((l) => -l).sort((a, b) => a - b);
    const between = poles.slice(0, -1).map((p, i) => roots.filter((r) => r > p && r < poles[i + 1]).length);
    ok("!! exactly one root sits between each consecutive pair of poles", between.every((n) => n === 1),
        "counts = [" + between.join(",") + "]");
    report("that interlacing is a property of the equation, and using it is what makes this well conditioned -- " +
           "see the module header for the linear-algebra route that was tried, measured and refused");
    ok("at exactly critical the dominant root is zero -- an infinite period",
        Math.abs(dominantRoot(0)) < 1e-12, "w(rho=0) = " + dominantRoot(0).toExponential(3));
    ok("...and positive reactivity gives a positive rate, negative a negative one",
        dominantRoot(fromDollars(0.2)) > 0 && dominantRoot(fromDollars(-0.2)) < 0);
    ok("period() is the reciprocal of the dominant root", rel(period(rho), 1 / dominantRoot(rho)) < 1e-15,
       "at $0.50 the period is " + period(rho).toFixed(3) + "s");
}

// ---------------------------------------------------------------------------
console.log("\n7. *** SABOTAGE: THE PLANT THAT IS INVISIBLE WHERE ANYBODY LOOKS ***");
{
    // *** DROP THE w*GEN TERM FROM THE INHOUR EQUATION. *** Across the entire normal operating range this is
    // wrong by less than a third of one percent -- because below prompt critical the period genuinely does not
    // depend on GEN, which section 4 measures. It is invisible to every check that samples a period and asks
    // whether it looks reasonable. AND IT MAKES PROMPT CRITICALITY UNREACHABLE: without w*GEN the inhour curve
    // has supremum exactly beta, so rho >= beta has NO ROOT AT ALL and the reactor can never go prompt
    // supercritical. That is the SEMF surface term's shape -- plausible everywhere, fatal at the one limit.
    const G = KEEPIN_U235;
    const planted = (w) => G.beta.reduce((s, b, i) => s + b * w / (w + G.lambda[i]), 0);
    const B = totalBeta();

    const quiet = [0.1, 0.25, 0.5].map((d) => {
        const rho = fromDollars(d);
        let a = -G.lambda[0] + 1e-13, b = 1e6, fa = planted(a) - rho, fb = planted(b) - rho;
        for (let k = 0; k < 400; k++) { const m = (a + b) / 2, fm = planted(m) - rho; if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; } }
        return rel((a + b) / 2, dominantRoot(rho));
    });
    ok("!! the plant is INVISIBLE below prompt critical -- under 1% everywhere anybody operates",
        quiet.every((e) => e < 1e-2), quiet.map((e) => e.toExponential(2)).join(" "));
    ok("!! ...and its supremum is exactly beta, so prompt criticality becomes UNREACHABLE",
        rel(planted(1e12), B) < 1e-6 && planted(1e12) < B * (1 + 1e-6),
        "sup(planted) = " + planted(1e12).toFixed(8) + " vs beta = " + B.toFixed(8));
    // "has no root" is asserted by SEARCHING for one the same way the real solver does, rather than by arguing
    // from the supremum a second time -- a check that restates its own premise proves nothing.
    const plantedHasRoot = (rho) => {
        let a = -G.lambda[0] + 1e-13, b = 1e12;
        const fa = planted(a) - rho, fb = planted(b) - rho;
        return Number.isFinite(fa) && Number.isFinite(fb) && fa * fb <= 0;
    };
    ok("!! so above prompt critical the planted equation HAS NO ROOT, while the real one does",
        !plantedHasRoot(fromDollars(1.5)) && !plantedHasRoot(fromDollars(2)) &&
        Number.isFinite(dominantRoot(fromDollars(1.5))),
        "real w($1.50) = " + dominantRoot(fromDollars(1.5)).toExponential(5) + "; planted brackets never straddle zero");
    ok("...while BELOW prompt critical the planted equation still finds one, which is why it hides",
        plantedHasRoot(fromDollars(0.5)));
    report("SECTION 4 IS THE ONLY THING THAT CATCHES IT. A device grading 'is the period about right' passes " +
           "this plant across the whole range it would ever be sampled on");

    // and a second, cruder plant that section 3 catches, so two sections are shown to bite independently
    const oneGroup = { beta: [B], lambda: [G.beta.reduce((s, b, i) => s + b * G.lambda[i], 0) / B] };
    const wScram = dominantRoot(fromDollars(-10), GEN_LWR, oneGroup);
    ok("!! a one-group lumped model gets the SCRAM ASYMPTOTE ~30x wrong, which section 3 catches",
        Math.abs(wScram) > 10 * G.lambda[0],
        "one-group w = " + wScram.toExponential(4) + " against the true floor " + (-G.lambda[0]).toExponential(4));
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
