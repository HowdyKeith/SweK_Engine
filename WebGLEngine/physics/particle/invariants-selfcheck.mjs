// WebGLEngine/physics/particle/invariants-selfcheck.mjs -- v3425
//
// Run: node physics/particle/invariants-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The module's own gate: the ALGEBRA, checked directly. The device gate (tools/roundhouse/
// invariantsDevice-selfcheck.mjs) asks the same physics through the bind and adds the registry hygiene; this
// one exists so the module can be graded at all, and so an instrument row naming it has a link that RESOLVES.
"use strict";
import {
    gammaOf, fromMassBeta, massless, massSq, invariantS, invariantSPair,
    boostX, addBeta, thresholdHeadOn, sHeadOnPhoton, naiveEcm,
} from "./invariants.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const MP = 0.938272, MPI = 0.134977, EG = 6.35e-13;

// ---- 1. A CONSTRUCTED PARTICLE IS ON ITS MASS SHELL, AND STAYS THERE UNDER A BOOST -------------------------
{
    const p = fromMassBeta(MP, 0.9);
    const shell0 = Math.abs(massSq(p) - MP * MP) / (MP * MP);
    const shell1 = Math.abs(massSq(boostX(p, 0.8)) - MP * MP) / (MP * MP);
    ok("!! a particle is on its mass shell before and after a boost", shell0 < 1e-14 && shell1 < 1e-13,
       `${shell0.toExponential(2)} then ${shell1.toExponential(2)} -- construction is one claim and TRANSFORMATION IS ANOTHER, and only the second tests the boost.`);
}

// ---- 2. A PHOTON IS EXACTLY MASSLESS, AND MUST STAY SO ----------------------------------------------------
{
    const g = massless(0.5, [1, 0, 0]);
    ok("!! a photon's invariant mass is EXACTLY zero, in every frame", massSq(g) === 0 && Math.abs(massSq(boostX(g, 0.9))) < 1e-16,
       "an exact zero rather than a small number: |p| = E by construction, and a boost that broke it would give light a rest mass.");
}

// ---- 3. *** s IS INVARIANT, WHICH IS THE WHOLE POINT OF THE FILE *** ---------------------------------------
{
    const sys = [fromMassBeta(MP, 0.9, [1, 0, 0]), massless(0.5, [-1, 0, 0])];
    const s0 = invariantS(sys);
    let worst = 0;
    for (const b of [0.1, 0.5, 0.9, 0.99, 0.999]) worst = Math.max(worst, Math.abs(invariantS(sys.map((p) => boostX(p, b))) - s0) / Math.abs(s0));
    ok("!! *** the invariant mass of a system does not change under a boost ***", worst < 1e-13,
       `worst relative drift ${worst.toExponential(2)} out to beta = 0.999 -- an IDENTITY, not a tolerance.`);
}

// ---- 4. THE WRONG BOOST BREAKS BOTH, AND IS EXACTLY RIGHT AT REST -----------------------------------------
{
    const p = fromMassBeta(MP, 0.9);
    const atRest = boostX(p, 0, { wrong: true });
    const moved = boostX(p, 0.9, { wrong: true });
    ok("!! *** the plausible wrong boost is EXACTLY right at beta = 0 and destroys the mass shell above it ***",
       Math.abs(massSq(atRest) - MP * MP) / (MP * MP) < 1e-15 && Math.abs(massSq(moved) - MP * MP) / (MP * MP) > 1,
       "E' = gamma E rather than gamma(E - beta p) is what you write if a boost is 'scale everything by gamma'. AT REST IT IS THE IDENTITY, WHICH IS THE ONLY PLACE ANYBODY CHECKS IT BY HAND.");
}

// ---- 5. VELOCITY ADDITION: TWO BOOSTS ARE ONE, AND NOTHING EXCEEDS c ---------------------------------------
{
    const p = fromMassBeta(MP, 0.4);
    let worst = 0;
    for (const [a, b] of [[0.3, 0.4], [0.6, 0.7], [0.9, 0.95]]) {
        const two = boostX(boostX(p, a), b), one = boostX(p, addBeta(a, b));
        worst = Math.max(worst, Math.abs(two.E - one.E) / one.E, Math.abs(two.px - one.px) / Math.abs(one.px));
    }
    ok("!! boosting twice equals one boost by the relativistic sum", worst < 1e-13 && addBeta(0.9, 0.95) < 1,
       `worst ${worst.toExponential(2)}; 0.9 and 0.95 give ${addBeta(0.9, 0.95).toFixed(9)}, and NOTHING ADDS PAST 1.`);
}

// ---- 6. *** THREE ROUTES TO s, AND ONLY ONE SURVIVES A COSMIC RAY *** --------------------------------------
{
    const E = 1e11;
    const pr = { E, px: Math.sqrt(Math.max(0, E * E - MP * MP)), py: 0, pz: 0 }, ph = massless(EG, [-1, 0, 0]);
    const a = invariantS([pr, ph]), b = invariantSPair(pr, ph), c = sHeadOnPhoton(MP, E, EG);
    // At parity all three agree -- which is exactly what makes the failure above invisible.
    const lo = 1e2;
    const prLo = { E: lo, px: Math.sqrt(lo * lo - MP * MP), py: 0, pz: 0 };
    const agree = Math.abs(invariantS([prLo, ph]) - sHeadOnPhoton(MP, lo, EG)) / sHeadOnPhoton(MP, lo, EG);
    ok("!! *** squaring the summed four-vector returns EXACTLY 0.0 at 1e11 GeV against a 1e-12 GeV photon ***",
       a === 0 && b > 0 && c > b,
       `sum-square ${a}, expanded ${b.toExponential(4)}, mass-carrying ${c.toExponential(4)}. TWO SILENT LOSSES: p = sqrt(E^2 - m^2) rounds to E so the particle lands on the MASSLESS shell, and then E + Eg rounds to E so THE PHOTON VANISHES. Fixing one is not enough.`);
    ok("...and at comparable energies all three agree, which is why nobody notices", agree < 1e-12,
       `${agree.toExponential(2)} at a ratio of 1e14. A CHECK RUN AT PARITY WOULD HAVE CERTIFIED THE ROUTE THAT COLLAPSES.`);
}

// ---- 7. THE THRESHOLD, TWO INDEPENDENT ROUTES -------------------------------------------------------------
{
    const mOut = MP + MPI, target = mOut * mOut, closed = thresholdHeadOn(MP, mOut, EG);
    let lo = 1e5, hi = 1e14;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (sHeadOnPhoton(MP, mid, EG) < target) lo = mid; else hi = mid; }
    const bis = (lo + hi) / 2;
    ok("!! the photopion threshold agrees between a bisection and a closed form", Math.abs(bis - closed) / closed < 1e-14,
       `${closed.toExponential(8)} GeV both ways. The bisection reads only THE SIGN OF A COMPARISON; the closed form inverts the algebra. NO REMEMBERED CUTOFF IS COMPARED AGAINST ANYWHERE.`);
}

// ---- 8. THE NAIVE CENTRE-OF-MASS ENERGY IS WRONG BY EXACTLY gamma ------------------------------------------
{
    const at = [fromMassBeta(MP, 0), fromMassBeta(MPI, 0)];
    let worst = 0;
    for (const b of [0.3, 0.5, 0.9, 0.99]) {
        const q = at.map((p) => boostX(p, b));
        worst = Math.max(worst, Math.abs(naiveEcm(q) / Math.sqrt(invariantS(q)) - gammaOf(b)) / gammaOf(b));
    }
    ok("!! adding lab energies is wrong by EXACTLY the boost's gamma, and exactly right at rest",
       worst < 1e-12 && naiveEcm(at) / Math.sqrt(invariantS(at)) === 1,
       `worst departure from gamma ${worst.toExponential(2)}; the ratio is 1.000000000000000 in the CM frame. A PREDICTED FACTOR, NOT A VAGUE ERROR.`);
}

console.log(fails ? "\ninvariants-selfcheck: " + fails + " FAILED" : "\ninvariants-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
