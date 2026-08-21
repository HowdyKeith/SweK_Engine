// WebGLEngine/physics/astroparticle/astroparticle-selfcheck.mjs — v3426
//
// Run: node physics/astroparticle/astroparticle-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// TWO DEVICES, AND EACH ONE IS ABOUT WHAT A CHECK CANNOT SEE.
//
// OSCILLATION -- three keys, and DROPPING THE 1.267 LEAVES TWO OF THEM PERFECTLY GREEN. Unitarity is
// sin^2 + cos^2 in physics notation and holds however wrong the phase is; the dip depth is set by the mixing
// angle and does not care where the dip sits. Only the PHASE key -- where the first minimum falls in L/E -- can
// see the constant, and it is the one an experiment actually measures. The suite can be green while the physics
// is wrong by a factor of a million, and this file demonstrates that rather than asserting it.
//
// AND THE 1.267 IS DERIVED FROM hbar c, NEVER TYPED. A typed constant is one nobody can check; a derived one is
// one the gate can re-derive and disagree with. Every input is an exact SI definition, so it carries no
// experimental uncertainty at all.
//
// HALO -- *** WHAT IT MEASURES IS A DISCREPANCY, AND IT DETECTS NOTHING. *** A rotation curve says there is more
// enclosed mass than the light accounts for. Whether that is a particle or a modification of gravity is not
// something it can settle, and a device printing "dark matter" would be claiming past its data.

import { HBAR_C_EV_M, OSC_COEFF, survival, transition, minSurvival, firstMinimumLE, findFirstMinimum }
    from "./oscillation.js";
import { G_ASTRO, vCirc, mPoint, mIsothermal, mNFW, mDisk, mSum, enclosedNumeric, curve, massDiscrepancy }
    from "./halo.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const theta = Math.asin(Math.sqrt(0.85)) / 2, dm2 = 2.5e-3;

// ---- 1. THE CONSTANT IS DERIVED, AND IT COMES OUT AT THE TEXTBOOK VALUE ------------------------------------------
{
    ok("!! hbar*c is built from exact SI definitions alone, so it carries no experimental uncertainty",
       Math.abs(HBAR_C_EV_M - 1.973269804e-7) < 1e-15,
       HBAR_C_EV_M.toExponential(9) + " eV*m from h, c and e, every one exact by definition");
    ok("!! ...and the oscillation coefficient DERIVED from it is the textbook 1.267",
       Math.abs(OSC_COEFF - 1.267) < 5e-4,
       OSC_COEFF.toFixed(9) + " — NEVER TYPED. A typed constant is one nobody can check; this one the gate " +
       "re-derives and could disagree with");
}

// ---- 2. UNITARITY IS EXACT, AND IT IS EXACT FOR THE WRONG REASON TO TRUST IT ---------------------------------------
{
    let worst = 0;
    for (const [L, E] of [[295, 0.6], [810, 2.5], [1300, 3.5], [12000, 0.02], [1, 100]]) {
        const s = survival({ theta, dm2, L, E }), t = transition({ theta, dm2, L, E });
        worst = Math.max(worst, Math.abs(s + t - 1));
    }
    ok("!! survival + transition = 1 exactly, at every baseline and energy tried",
       worst < 1e-15,
       "worst deviation " + worst.toExponential(1) + " — and the two are computed INDEPENDENTLY rather than one as 1 minus the other, so this is a test and not a tautology");
}

// ---- 3. *** THE DEMONSTRATION: DROP THE 1.267 AND TWO OF THREE KEYS STAY GREEN. *** ---------------------------------
{
    const WRONG = 1;                                  // the constant simply omitted
    // key A: unitarity -- blind
    let uWorst = 0;
    for (const [L, E] of [[295, 0.6], [810, 2.5], [1300, 3.5]]) {
        const s = survival({ theta, dm2, L, E, coeff: WRONG }), t = transition({ theta, dm2, L, E, coeff: WRONG });
        uWorst = Math.max(uWorst, Math.abs(s + t - 1));
    }
    ok("!! with the constant DELETED, unitarity is still exact -- the key is blind to it",
       uWorst < 1e-15,
       "worst " + uWorst.toExponential(1) + " — sin^2 + cos^2 is true whatever the phase is, so this key cannot see a factor error");
    // key B: amplitude -- blind
    // EVALUATED AT THE MINIMUM RATHER THAN SEARCHED FOR IT. A scan over L/E out to 4e6 in 400k samples cannot
    // land on the dip exactly and reported 0.150038 against 0.150000 -- a difference of 3.8e-5 that is the
    // SAMPLING STEP and not the physics. The depth is exact by construction at the analytic minimum, so the
    // blindness is shown there; a resolution artefact dressed up as a near-miss would have muddled the one
    // point this check exists to make.
    const leWrong = firstMinimumLE(dm2, WRONG);
    const dipWrong = survival({ theta, dm2, L: leWrong, E: 1, coeff: WRONG });
    ok("!! ...and the dip still reaches exactly 1 - sin^2(2theta) -- that key is blind too",
       Math.abs(dipWrong - minSurvival(theta)) < 1e-12,
       "deepest survival " + dipWrong.toFixed(12) + " against " + minSurvival(theta).toFixed(12) +
       " — identical to twelve decimals with the constant DELETED. The mixing angle sets HOW DEEP, the phase " +
       "sets WHERE, and these two keys only ever look at the depth");
    // key C: phase -- the only one that sees it
    const right = firstMinimumLE(dm2), wrong = firstMinimumLE(dm2, WRONG);
    ok("!! ONLY the phase key sees the difference -- and it sees it by a factor of " + (wrong / right).toFixed(2),
       wrong / right > 1.2,
       "first minimum at L/E = " + right.toFixed(1) + " km/GeV with the derived constant, " + wrong.toExponential(3) +
       " without it. TWO OF THREE KEYS PASS A PHYSICS ERROR OF THIS SIZE, which is why the phase check had to be chosen deliberately");
}

// ---- 4. AND THE PHASE KEY AGREES WITH A NUMERICAL SEARCH, SO IT IS NOT JUST ALGEBRA RESTATED --------------------------
{
    const closed = firstMinimumLE(dm2);
    const found = findFirstMinimum({ theta, dm2 });
    ok("!! the first minimum found by scanning L/E matches the closed form",
       Math.abs(found.LE - closed) / closed < 1e-4,
       "scan " + found.LE.toFixed(3) + " vs closed form " + closed.toFixed(3) +
       " km/GeV — the search knows nothing about pi/2, it just looks for the dip");
    ok("...and the dip it finds is as deep as the mixing angle allows",
       Math.abs(found.p - minSurvival(theta)) < 1e-5,
       found.p.toFixed(9) + " against " + minSurvival(theta).toFixed(9));
}

// ---- 5. THE HALO: TWO EXACT IDENTITIES BEFORE ANY CLAIM IS MADE ---------------------------------------------------------
{
    const v0 = 220;
    const iso = mIsothermal(v0);
    const speeds = [2, 10, 30, 60, 120].map((r) => vCirc(iso(r), r));
    const spread = Math.max(...speeds) - Math.min(...speeds);
    ok("!! a singular isothermal sphere gives EXACTLY v0 at every radius -- flat is what it IS, not what it approximates",
       spread < 1e-11,
       "v = " + speeds[0].toFixed(12) + " across a sixtyfold range in radius, spread " + spread.toExponential(1));
    const p = mPoint(1e11);
    ok("!! and outside all the mass the speed falls as r^-1/2 exactly (the Keplerian control)",
       Math.abs(vCirc(p(10), 10) / vCirc(p(40), 40) - 2) < 1e-12,
       "v(10)/v(40) = " + (vCirc(p(10), 10) / vCirc(p(40), 40)).toFixed(12) + " against sqrt(4) = 2 — if a halo model " +
       "cannot reproduce this with the halo switched off, it is not the halo doing the work");
    // the numerical integrator, checked against the identity it will be used beyond
    const num = enclosedNumeric((r) => v0 * v0 / (4 * Math.PI * G_ASTRO * r * r), 30);
    ok("...and the numerical enclosed-mass integrator reproduces that identity, so it can be trusted on profiles with no closed form",
       Math.abs(num - iso(30)) / iso(30) < 1e-6,
       num.toExponential(6) + " vs exact " + iso(30).toExponential(6));
}

// ---- 6. THE CLAIM, AND ITS LIMITS, STATED TOGETHER -----------------------------------------------------------------------
{
    const disk = mDisk(6e10, 3);
    const d = massDiscrepancy({ mVisible: disk, vObserved: 220, r: 30 });
    ok("!! at 30 kpc a flat 220 km/s needs " + d.factor.toFixed(1) + "x the enclosed mass the luminous disk provides",
       d.factor > 3,
       "needed " + d.needed.toExponential(3) + " Msun against " + d.seen.toExponential(3) + " seen — " +
       "THAT IS THE ENTIRE CLAIM. It is a statement about gravity and light, and it detects nothing");
    // the visible component alone must fail in the observed way, or the discrepancy is an artefact of the model
    const inner = vCirc(disk(5), 5), outer = vCirc(disk(30), 30);
    ok("!! ...and the luminous disk ALONE falls off, which is the observation that needs explaining",
       outer < inner * 0.75,
       "disk-only speed " + inner.toFixed(1) + " km/s at 5 kpc down to " + outer.toFixed(1) + " at 30 kpc");
    // NFW is a DIFFERENT claim from flat, and must not be confused with it
    const nfw = mNFW(1e7, 20);
    const vs = [10, 30, 60, 120].map((r) => vCirc(nfw(r), r));
    ok("!! an NFW halo PEAKS and then declines -- a different claim from 'flat', and not to be conflated with it",
       Math.max(...vs) > vs[vs.length - 1] * 1.05,
       "v = " + vs.map((x) => x.toFixed(1)).join(", ") + " km/s — isothermal is exactly flat, NFW is not, and " +
       "a rotation curve that cannot tell them apart is not evidence for either");
}

console.log(fails ? ("[astroparticle-selfcheck] FAILED " + fails) : "[astroparticle-selfcheck] all passed");
process.exit(fails ? 1 : 0);
