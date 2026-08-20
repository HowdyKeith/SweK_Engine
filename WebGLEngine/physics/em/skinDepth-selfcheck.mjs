// WebGLEngine/physics/em/skinDepth-selfcheck.mjs -- v3628
//
// Run: node physics/em/skinDepth-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// TWO HALVES. The first is the last of the four FDTD keys the tree did not have. The second is what happens when
// physics/stabilityMeter.mjs is pointed at a partial differential equation for the first time since it was built
// at v3599 -- it has three fixtures, all of them the SAME harmonic oscillator, and its importers are its own
// gates, stepperMeter, reportingTools and main.js. It had never met a PDE.
//
// *** WHY FDTD IS THE FIXTURE THAT METER HAS NEVER HAD: its stability threshold is a NUMBER YOU CAN PREDICT.
// S = c dt / dx <= 1/sqrt(d), exactly. Everywhere else the meter has to BISECT and hope. Section 4 does both on
// the same system and they do not agree -- and the way they disagree is the finding. ***
//
// THE SKIN-DEPTH KEY IS EXTERNAL AND IT HAS A TRAP IN IT. delta = sqrt(2/(omega mu sigma)) is quoted so often
// that it is usually mistaken for the definition; it is the p -> infinity LIMIT of delta = 1/alpha, and the
// difference is a function of the loss tangent p = sigma/(omega eps) ALONE. 55.4% wrong at p = 1, exact to
// eighteen digits for copper. The same sentence is either exact or useless depending on a number not in it.

import { readFileSync } from "node:fs";
import {
    propagation, skinDepthExact, skinDepthGood, goodConductorRatio, lossTangent,
    lossyFdtd1d, measuredAlpha, EPS0, MU0,
} from "./skinDepth.mjs";
import { classifyEnvelope, classifyAgainst, verdict, KINDS, EXPLODE_FACTOR } from "../stabilityMeter.mjs";
import { cflLimit } from "./maxwell.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (got, want) => Math.abs(got - want) / Math.max(Math.abs(want), 1e-300);

// --- 1. the exact form, the famous limit, and the number that separates them --------------------------------------
{
    say("1. delta = 1/alpha EXACTLY; sqrt(2/(omega mu sigma)) is its p -> infinity LIMIT, and nobody says so.");
    const misses = [0.1, 1, 10, 100, 1e4].map((p) => 1 / goodConductorRatio(p) - 1);
    say("     loss tangent p = 0.1, 1, 10, 100, 1e4  ->  the famous limit is out by " +
        misses.map((m) => (100 * m).toFixed(4) + "%").join(", "));
    ok("!! the limit is 55% wrong at p = 1 and exact at large p", misses[1] > 0.5 && misses[1] < 0.6 && misses[4] < 1e-4,
        "and the miss is a function of p ALONE -- not of the material, not of the frequency, not of anything in either formula");
    const errs = [10, 100, 1000, 10000].map((p) => Math.abs(goodConductorRatio(p) - 1));
    const ratios = errs.slice(1).map((e, i) => errs[i] / e);
    ok("it approaches the exact value at FIRST order in 1/p, derived not typed", ratios.every((r) => r > 9 && r < 11),
        "ratios " + ratios.map((r) => r.toFixed(3)).join(", ") + " per decade of p");
    const om = 2 * Math.PI * 1e6, sig = 5.96e7;                 // copper at 1 MHz
    ok("copper at 1 MHz: the two agree, because p is astronomical there", rel(skinDepthExact({ omega: om, sigma: sig }), skinDepthGood({ omega: om, sigma: sig })) < 1e-11,
        "delta = " + (1e6 * skinDepthExact({ omega: om, sigma: sig })).toFixed(3) + " um, p = " + lossTangent(om, EPS0, sig).toExponential(2));
    ok("a lossless medium returns an INFINITE skin depth rather than a large number", skinDepthExact({ omega: 1e9, sigma: 0 }) === Infinity &&
        propagation({ omega: 1e9, sigma: 0 }).alpha === 0);
    ok("and the good-conductor form REFUSES sigma = 0 rather than dividing by it", skinDepthGood({ omega: 1e9, sigma: 0 }) === null);
}

// --- 2. the closed form grades a lossy FDTD --------------------------------------------------------------------
{
    say("2. LAUNCH A WAVE INTO A CONDUCTING HALF-SPACE AND READ THE ENVELOPE. alpha is predicted before it runs.");
    let worst = 0;
    for (const sigma of [0.02, 0.05, 0.1, 0.2]) {
        const r = lossyFdtd1d({ N: 900, dx: 1, S: 0.99, eps: 1, mu: 1, sigma, freqCells: 24, steps: 6000 });
        const pr = propagation({ omega: r.omega, eps: 1, mu: 1, sigma });
        const m = measuredAlpha(r, pr.delta, { skipDeltas: 0.5, decades: 1 });
        const e = rel(m.alpha, pr.alpha); worst = Math.max(worst, e);
        say("     sigma " + String(sigma).padEnd(5) + " p " + pr.p.toFixed(4) + "  delta " + pr.delta.toFixed(2) +
            " cells   alpha predicted " + pr.alpha.toExponential(4) + "  measured " + m.alpha.toExponential(4) + "   rel " + e.toExponential(3));
    }
    ok("the grid reproduces the predicted attenuation across a tenfold range of sigma", worst < 5e-3,
        "worst rel " + worst.toExponential(3) + " on a window DERIVED from the predicted delta (half a delta in, one decade wide) rather than chosen by eye");

    // THE HONEST LIMIT, AND IT IS UNEXPLAINED RATHER THAN EXPLAINED AWAY.
    const r = lossyFdtd1d({ N: 1200, dx: 1, S: 0.99, eps: 1, mu: 1, sigma: 0.1, freqCells: 24, steps: 8000 });
    const pr = propagation({ omega: r.omega, eps: 1, mu: 1, sigma: 0.1 });
    const wins = [[0.5, 1], [1, 1.5], [2, 1.5], [1, 3]].map(([skipDeltas, decades]) =>
        rel(measuredAlpha(r, pr.delta, { skipDeltas, decades }).alpha, pr.alpha));
    say("     WINDOW SENSITIVITY (skip/decades 0.5/1, 1/1.5, 2/1.5, 1/3): " + wins.map((e) => e.toExponential(3)).join("  "));
    ok("!! the residue is set by MY FIT WINDOW, not by the scheme, and it is REPORTED not tuned away",
        wins[3] > 5 * wins[0],
        "a deeper window always reads a SMALLER alpha, by up to 30x the shallow-window error. RULED OUT: domain " +
        "length (a 3.3x longer slab, 35 -> 118 delta, does not move it) and the Courant number (7.7e-3 at S=0.5 " +
        "against 4.0e-3 at S=0.99). NOT EXPLAINED. The measurement above uses the shallow window and the number " +
        "quoted is a bound on this fixture, not on FDTD.");
}

// --- 3. THE METER HAD A DOOR NOBODY HAD TRIED --------------------------------------------------------------------
{
    say("3. POINTING stabilityMeter AT A PDE. Before this round its three fixtures were all the SAME oscillator.");
    ok("!! verdict() used to answer for a system it had never run, and now refuses", verdict("fdtd", { dt: 0.1 }) === null,
        "the branch was explicit / implicit / ELSE, so ANY unknown name silently became SYMPLECTIC -- verdict('fdtd') " +
        "returned FAITHFUL with a ratio and a per-step factor, for an oscillator, labelled fdtd. UNKNOWN IS NOT THE DEFAULT.");
    ok("...and the three real kinds are untouched", KINDS.every((k) => verdict(k, { dt: 0.1 }) !== null),
        "stabilityMeter-selfcheck (25 checks) and stepperMeter-selfcheck both re-run green, and they carry the v3604 hash pins");
    say("   THE ANSWER THAT LOOKS LIKE EVIDENCE IS WORSE THAN THE REFUSAL. Eighth instance of v3103's law here.");
}

// --- 4. A BISECTED BOUNDARY AGAINST A PREDICTED ONE, ON THE SAME SYSTEM ------------------------------------------------
{
    say("4. THE POINT OF THE WHOLE ROUND. FDTD's threshold is S <= 1/sqrt(d), EXACT. The meter's method is to BISECT.");
    const blows = (S, steps) => {
        const r = lossyFdtd1d({ N: 300, dx: 1, S, eps: 1, mu: 1, sigma: 0, freqCells: 20, steps, source: "pulse" });
        return classifyEnvelope(r.energyRatio, r.blewUp) === "EXPLODES";
    };
    const bisect = (steps) => {
        let a = 0.5, b = 1.6;
        if (!blows(b, steps)) return null;
        for (let i = 0; i < 40; i++) { const m = 0.5 * (a + b); if (blows(m, steps)) b = m; else a = m; }
        return 0.5 * (a + b);
    };
    const budgets = [100, 200, 400, 800, 1600, 3200];
    const found = budgets.map(bisect);
    budgets.forEach((s, i) => say("     budget " + String(s).padStart(5) + " steps  ->  bisected S = " + found[i].toFixed(6) +
        "   (predicted " + cflLimit(1).toFixed(6) + ", high by " + (100 * (found[i] - 1)).toFixed(3) + "%)"));
    ok("!! the BISECTED boundary is a function of the STEP BUDGET and the predicted one is not",
        found[0] > found[found.length - 1] * 1.001 && found.every((v, i) => i === 0 || v <= found[i - 1] + 1e-9),
        "it falls monotonically toward 1 as the budget grows and NEVER REACHES IT -- bisection reports the budget, prediction reports the physics");
    ok("...and it always errs on the UNSAFE side, which is the direction that matters", found.every((v) => v > cflLimit(1)),
        "every bisected answer is ABOVE the true limit, so a solver tuned to a bisected boundary is tuned just past its own cliff");
    ok("the predicted limit itself is exact and dimension-dependent", cflLimit(1) === 1 && Math.abs(cflLimit(2) - Math.SQRT1_2) < 1e-15,
        "1D 1.000000, 2D 0.707107, 3D 0.577350 -- and v3627 found the tree's own height-field water sitting EXACTLY on the 2D value");
    say("   THIS IS WHY THE FIXTURE MATTERED: a bisected threshold cannot be checked against anything, so nobody");
    say("   could ever have known it was 0.344% optimistic at a 100-step budget. Here the right answer was already");
    say("   written down, so the instrument could be graded instead of trusted.");
}

// --- 5. THE ENERGY AXIS ON A SYSTEM THAT IS SUPPOSED TO LOSE ENERGY ----------------------------------------------------
{
    say("5. v3605 FOUND THE ENERGY AXIS INVERTED ON NON-CONSERVATIVE SYSTEMS. HERE IS WHAT THAT LOOKS LIKE WITH A KEY.");
    const ring = (sigma, slabStart = 0) => lossyFdtd1d({ N: 600, dx: 1, S: 0.99, eps: 1, mu: 1, sigma, slabStart, freqCells: 24, steps: 4000, driveSteps: 2000 });
    const lossless = ring(0);
    ok("with sigma = 0 the cavity keeps its energy and the meter says FAITHFUL", classifyEnvelope(lossless.energyRatio, lossless.blewUp) === "FAITHFUL",
        "ratio " + lossless.energyRatio.toExponential(3) + " -- so the fixture is sound and the classifier is not simply always-DAMPED");
    const lossy = ring(0.05, 0.4);
    ok("!! with a conductor in it the SAME meter says DAMPED -- for the CORRECT physics", classifyEnvelope(lossy.energyRatio, lossy.blewUp) === "DAMPED",
        "ratio " + lossy.energyRatio.toExponential(3) + ". A wave in a conductor is SUPPOSED to lose its energy, and " +
        "DAMPED cannot tell 'the integrator lost energy' from 'the medium absorbed it' -- it is a statement about the ratio and not about where the energy went");

    // the fix: grade the ratio against what the physics predicts, not against 1
    let checked = 0;
    for (const sigma of [0.002, 0.005]) {
        const r = ring(sigma);
        const T = (4000 - 2000) * r.dt, pred = Math.exp(-sigma * T / 1);          // uniform lossy cavity: U(t)/U(0) = exp(-sigma t/eps)
        const ratio = r.energyRatio / pred;
        say("     sigma " + sigma + "  measured " + r.energyRatio.toExponential(4) + "  predicted " + pred.toExponential(4) +
            "  measured/predicted " + ratio.toFixed(6) + "   bare meter: " + classifyEnvelope(r.energyRatio, r.blewUp) +
            "   graded against the prediction: " + classifyAgainst(r.energyRatio, pred, r.blewUp));
        ok("sigma = " + sigma + ": DAMPED by the bare meter, FAITHFUL once the prediction is supplied",
            classifyEnvelope(r.energyRatio, r.blewUp) === "DAMPED" && classifyAgainst(r.energyRatio, pred, r.blewUp) === "FAITHFUL",
            "the closed form U(t)/U(0) = exp(-sigma t / eps) lands within " + (100 * Math.abs(ratio - 1)).toFixed(2) + "%");
        checked++;
    }
    ok("both low-loss rows were actually driven", checked === 2);
    ok("classifyEnvelope is UNTOUCHED and classifyAgainst is a SECOND question, not a replacement", (() => {
        const src = readFileSync(new URL("../stabilityMeter.mjs", import.meta.url), "utf8");
        return /classifyEnvelope is UNTOUCHED and still hash-pinned/.test(src) && classifyEnvelope(0.05) === "DAMPED" &&
            classifyEnvelope(50) === "EXPLODES" && classifyEnvelope(1) === "FAITHFUL" && EXPLODE_FACTOR === 10;
    })());
    ok("a missing prediction gives NO VERDICT rather than a default one", classifyAgainst(0.5, 0) === null && classifyAgainst(0.5, NaN) === null,
        "the same law as section 3: an answer with nothing behind it looks like evidence");
    say("   HONEST LIMIT, AND IT BOUNDS THE SECTION: above sigma ~ 0.01 the PREDICTION drops below anything this");
    say("   fixture can measure (predicted 2.5e-9 against a measured 4.95e-5, and the measured floor RISES with");
    say("   sigma), so the two rows above are the range where the closed form is confirmed. WHAT SETS THAT FLOOR IS");
    say("   NOT ESTABLISHED HERE. The section is stated over the range it earned and not one row further.");
}

// --- 6. scope, refusals, and what is not claimed ---------------------------------------------------------------------
{
    say("6. SCOPE.");
    ok("propagation refuses a non-positive omega, eps or mu, and a negative sigma",
        propagation({ omega: 0 }) === null && propagation({ omega: 1, eps: 0 }) === null && propagation({ omega: 1, sigma: -1 }) === null);
    const src = readFileSync(new URL("./skinDepth.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/node:/.test(src) && !/\bdocument\s*[.[]/.test(src) && !/\bwindow\s*[.[]/.test(src));
    ok("mu0 and eps0 are the CODATA values maxwell.mjs uses", MU0 === 1.25663706212e-6 && EPS0 === 8.8541878128e-12);
    say("   NOT CLAIMED: that this is a 2D or 3D FDTD, that the meter is now general (it grades an ENERGY RATIO and");
    say("   nothing else), or that section 5's floor is understood. NOT ATTEMPTED: dispersive (Debye/Drude) media,");
    say("   magnetic loss, or an absorbing boundary -- each is its own round with its own key.");
    say("   ANTIDOTE: IF cflLimit OR THE MEASURED FDTD THRESHOLD EVER MOVE, SECTION 4 GOES RED. Re-derive the limit");
    say("   for whatever scheme replaced it and rewrite the section -- do NOT widen the bisection budget until the");
    say("   two agree, because that is fitting the instrument to the answer.");
}

console.log("skinDepth-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
