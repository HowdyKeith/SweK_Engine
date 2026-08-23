// WebGLEngine/physics/reaction/brusselator-selfcheck.mjs — v3319
//
// Run: node physics/reaction/brusselator-selfcheck.mjs   (~0.97s — MEASURED v3941, was ~0.4s)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Turing's 1952 result: DIFFUSION, the process that smooths everything, can destabilise a uniform state and make
// stripes. The Brusselator is used rather than Gray-Scott because its algebra is exact -- the homogeneous steady
// state is u* = A, v* = B/A with no quadratic to solve -- so the growth rate of every mode is a CLOSED FORM and
// the threshold is closed form too:
//
//     B_c = (1 + A sqrt(Du/Dv))^2
//
// which the simulation is never told. What is graded is not "a pattern appeared" but "THIS MODE GREW AT EXACTLY
// THIS RATE", the same idiom as FDTD's predicted dispersion error.

import { steadyState, jacobian, growthRate, criticalB, criticalK, hopfB, discreteK,
         makeField, step, modeAmplitude, measureGrowth } from "./brusselator.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const A = 3, Du = 1, Dv = 8;

// ---- 1. THE STEADY STATE IS EXACT, NOT SOLVED FOR ------------------------------------------------------------
{
    const ss = steadyState(A, 9);
    ok("the homogeneous steady state is exactly (A, B/A) — no root-finding anywhere",
       ss.u === 3 && ss.v === 3, "u* = " + ss.u + ", v* = " + ss.v);
    const J = jacobian(A, 9);
    ok("...and the Jacobian there has closed-form entries",
       J.a11 === 8 && J.a12 === 9 && J.a21 === -9 && J.a22 === -9,
       "[[B-1, A^2],[-B, -A^2]] = [[" + J.a11 + ", " + J.a12 + "],[" + J.a21 + ", " + J.a22 + "]]");
}

// ---- 2. THE KEY: EVERY MODE GROWS AT THE RATE THE FORMULA PREDICTS -----------------------------------------------
{
    const rows = [];
    for (const [B, mode] of [[9, 4], [9, 6], [6, 4], [12, 5], [5, 3]]) {
        const r = measureGrowth({ A, B, Du, Dv, mode, n: 128, L: 32 });
        if (r.rate === null) { ok("growth at B=" + B + " mode " + mode, false, "no usable linear window"); continue; }
        rows.push({ B, mode, ...r });
    }
    const worst = Math.max(...rows.map((r) => Math.abs(r.rate - r.predicted)));
    ok("!! measured growth matches the linear-stability formula across five settings",
       rows.length === 5 && worst < 5e-4,
       rows.map((r) => "B=" + r.B + "/m" + r.mode + ": " + r.rate.toFixed(5) + " vs " + r.predicted.toFixed(5)).join(", ") +
       " — worst " + worst.toExponential(2));
    const decaying = rows.find((r) => r.rate < 0);
    ok("!! ...including a mode that DECAYS, so the formula is checked in both directions",
       decaying && Math.abs(decaying.rate - decaying.predicted) < 5e-4,
       "B=" + decaying.B + " mode " + decaying.mode + ": " + decaying.rate.toFixed(5) + " vs " + decaying.predicted.toFixed(5) +
       " — a growth law that only ever predicted growth would be half a law");
}

// ---- 3. THE PREDICTION USES THE DISCRETE LAPLACIAN, WHICH IS WHAT THE GRID ACTUALLY HAS ----------------------------
{
    const k = 2 * Math.PI * 4 / 32, dx = 32 / 128;
    const kd = discreteK(k, dx);
    ok("!! the grid's Laplacian eigenvalue is (2/dx^2)(1-cos(k dx)), not k^2, and the prediction uses it",
       Math.abs(kd * kd - 0.614871) < 1e-5 && kd < k,
       "discrete k^2 = " + (kd * kd).toFixed(6) + " against continuum " + (k * k).toFixed(6) +
       " — a 0.3% difference, larger than the agreement being claimed, so comparing to the continuum formula would be comparing two different operators");
}

// ---- 4. THE THRESHOLD IS EXACT AND THE SIMULATION IS NEVER TOLD IT ----------------------------------------------------
{
    const Bc = criticalB(A, Du, Dv);
    ok("!! B_c = (1 + A sqrt(Du/Dv))^2 = " + Bc.toFixed(4) + ", a number the integrator never sees",
       Math.abs(Bc - 4.24632) < 1e-4);
    // below it, every mode must decay however long you wait
    const below = [2, 4, 6, 8].map((mode) => measureGrowth({ A, B: 3.5, Du, Dv, mode, n: 128, L: 32 }));
    ok("!! below B_c every mode DECAYS — no pattern can form, at any wavelength",
       below.every((r) => r.rate < 0),
       below.map((r, i) => "m" + [2, 4, 6, 8][i] + ": " + r.rate.toFixed(3)).join(", "));
    // above it, the band grows
    const above = [4, 6].map((mode) => measureGrowth({ A, B: 9, Du, Dv, mode, n: 128, L: 32 }));
    ok("!! above B_c the band GROWS, so the threshold separates two regimes rather than labelling one",
       above.every((r) => r.rate > 0),
       above.map((r, i) => "m" + [4, 6][i] + ": +" + r.rate.toFixed(3)).join(", "));
}

// ---- 5. THE THEOREM, STATED CORRECTLY AFTER THE MEASUREMENT CORRECTED IT ----------------------------------------------
// The first version of this claim was "with equal diffusion there is no instability, ever". Measured, Du = Dv at
// B = 20 GROWS at +0.295 -- because the homogeneous state is ALREADY unstable there without any diffusion: the
// Brusselator's trace is B - 1 - A^2, so a uniform Hopf oscillation sets in above B = 1 + A^2 = 10. Diffusion
// destabilised nothing; it arrived at a state that was already unstable. The correct theorem is that DIFFUSION
// CANNOT DESTABILISE A STATE THAT IS STABLE WITHOUT IT, which is a claim about B BELOW the Hopf line.
{
    ok("the Hopf line is B = 1 + A^2 = " + hopfB(A) + " (uniform oscillation, no diffusion involved)",
       hopfB(A) === 10);
    const eq = [2, 4, 6, 8].map((mode) => measureGrowth({ A, B: 9, Du: 1, Dv: 1, mode, n: 128, L: 32 }));
    ok("!! with EQUAL diffusion and B below the Hopf line, every mode decays — diffusion cannot destabilise a stable state",
       eq.every((r) => r.rate < 0),
       eq.map((r, i) => "m" + [2, 4, 6, 8][i] + ": " + r.rate.toFixed(3)).join(", ") +
       " — the Turing mechanism REQUIRES the inhibitor to diffuse faster, and this is that requirement measured rather than asserted");
    const hopf = measureGrowth({ A, B: 20, Du: 1, Dv: 1, mode: 4, n: 128, L: 32 });
    ok("!! ...and ABOVE the Hopf line equal diffusion does grow, which is why the claim needed the qualifier",
       hopf.rate > 0,
       "B=20 > 10: rate +" + hopf.rate.toFixed(4) + ". A sabotage that ignored the Hopf line would have 'disproved' a real theorem");
}

// ---- 6. determinism ----------------------------------------------------------------------------------------------------
{
    const a = measureGrowth({ A, B: 9, Du, Dv, mode: 4, n: 64, L: 32 });
    const b = measureGrowth({ A, B: 9, Du, Dv, mode: 4, n: 64, L: 32 });
    ok("seeded runs are bit-identical (a failure reproduces)", a.rate === b.rate);
}


// ---- v3321: criticalK WAS IMPORTED AND NEVER CALLED -------------------------------------------------------------
//
// The definition gate at v3321 checks that a module's gate NAMES each one-line definition it exports, and says
// plainly that naming is not testing. This is what that gap looks like: criticalK appeared exactly once in this
// file, in the import list, and a 5% error planted in it PASSED EVERY ASSERTION HERE.
//
// Its siblings were fine -- criticalB is used at line 67, hopfB at line 89 -- so the file looked covered.
//
// AND IT HAS AN EXACT KEY THAT COST NOTHING TO USE. criticalB is the B at which the Turing instability first
// appears; criticalK is the WAVENUMBER that appears there -- the wavelength of the resulting pattern. At B = B_c
// the growth rate must be EXACTLY ZERO at k = k_c and negative at every other k: that is what "marginal" means,
// and it makes k_c the maximiser of a function this module already computes.
//
// Measured at A=3, Du=1, Dv=8:  k_c = 1.029884, growth(k_c) = 0.000e+0 exactly, growth(0.7 k_c) = -2.30e-1,
// growth(1.4 k_c) = -3.44e-1, and k_c maximises growth across every factor tried.
{
    const A = 3, Du = 1, Dv = 8;
    const kc = criticalK(A, Du, Dv), Bc = criticalB(A, Du, Dv);
    const g = (k) => growthRate(k, { A, B: Bc, Du, Dv });

    ok("!! at B_c the growth rate is EXACTLY zero at k_c -- the marginal mode",
        Math.abs(g(kc)) < 1e-12,
        `k_c = ${kc.toFixed(6)}, growth = ${g(kc).toExponential(2)} at B_c = ${Bc.toFixed(6)}. Marginal means ` +
        "the instability neither grows nor decays there, and it is the definition of the critical point");

    ok("!! and every other wavenumber decays, so k_c is the mode that appears first",
        [0.5, 0.7, 0.9, 1.1, 1.4, 2].every((f) => g(kc * f) <= g(kc) + 1e-12) &&
        g(kc * 0.7) < -0.1 && g(kc * 1.4) < -0.1,
        `growth at 0.7 k_c is ${g(kc * 0.7).toExponential(2)} and at 1.4 k_c is ${g(kc * 1.4).toExponential(2)}. ` +
        "k_c maximises a function this module already computed -- the key was available and unused");

    ok("...and a 5% error in k_c is now caught, where it passed silently before",
        Math.abs(g(kc * 1.05)) > 1e-3,
        `growth at 1.05 k_c is ${g(kc * 1.05).toExponential(2)}, not zero. criticalK appeared once in this file, ` +
        "in the import list, and every assertion passed with it perturbed. Naming a definition is not testing it");
}

console.log(fails ? ("[brusselator-selfcheck] FAILED " + fails) : "[brusselator-selfcheck] all passed");
process.exit(fails ? 1 : 0);
