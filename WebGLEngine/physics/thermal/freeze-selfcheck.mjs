// WebGLEngine/physics/thermal/freeze-selfcheck.mjs -- v3619
//
// Run: node physics/thermal/freeze-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/thermal/freeze.mjs -- the freeze/melt asymmetry, its decomposition, the equal-properties
// control, and the two reversibility claims.
//
// THE CHECK THIS FILE EXISTS FOR is section 3: the equal-properties control. "Ice freezes twice as fast as it
// melts" is indistinguishable from "the freeze branch is wrong in a way that happens to run fast" UNTIL the
// same solver is fed ONE substance and the direction stops mattering. That pair is what makes the asymmetry a
// statement about materials rather than about code, and it is asserted as an EXACT tie.
//
// KEPT CHEAP ON PURPOSE: the SI runs at n=600 that produced the header numbers take minutes each. This gate
// runs the decisive pair at a coarse grid, where the CONTROL IS STILL EXACT (it does not depend on resolution)
// and the asymmetry is still unmistakable.
import { MATERIALS, lambdaFor } from "./stefan.mjs";
import {
    LIQUIDS, pairFor, alpha, frontExact, ratioParts, twoPhase, reversibility, MEASURED_V3619, reportLines,
} from "./freeze.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const P = pairFor("ice"), T = 3600;

// ---- 1. THE TABLE HAS TWO PHASES NOW, AND v3618's DID NOT ----------------------------------------------------------
{
    ok("!! every solid in the table has a LIQUID counterpart", Object.keys(LIQUIDS).every((k) => MATERIALS[k]),
       Object.keys(LIQUIDS).join(", ") + " -- v3618's row labelled 'ice / water' carried ICE's numbers only");
    ok("!! ...and the two phases really do differ, which is why the round exists",
       LIQUIDS.ice.k !== MATERIALS.ice.k && LIQUIDS.ice.c !== MATERIALS.ice.c,
       "k " + MATERIALS.ice.k + " vs " + LIQUIDS.ice.k + " (" + (MATERIALS.ice.k / LIQUIDS.ice.k).toFixed(1) +
       "x), c " + MATERIALS.ice.c + " vs " + LIQUIDS.ice.c + " -- A ROW NAMING TWO PHASES AND CARRYING ONE " +
       "PHASE'S NUMBERS IS TWO THINGS WEARING ONE LABEL");
    ok("...and the defect is recorded rather than quietly fixed", (MEASURED_V3619.tableDefectFound || "").includes("v3618"),
       "written by me one round earlier, in the file that measures that shape");
}

// ---- 2. THE ASYMMETRY, AND ITS DECOMPOSITION -- THE PRODUCT IS THE CLAIM ----------------------------------------------
{
    for (const dT of [10, 25, 50]) {
        const r = ratioParts({ ...P, dT, t: T });
        ok("!! freezing outruns melting at dT=" + dT + "K, and the two factors MULTIPLY to it",
           r.freeze.front > r.melt.front && Math.abs(r.product - r.ratio) / r.ratio < 1e-9,
           "ratio " + r.ratio.toFixed(4) + " = sqrt(alpha_s/alpha_l) " + r.diffusivity.toFixed(3) +
           " x lambda_f/lambda_m " + r.lambdaPart.toFixed(4) + " = " + r.product.toFixed(4));
    }
    const r = ratioParts({ ...P, dT: 10, t: T });
    ok("!! NEITHER FACTOR ALONE PREDICTS IT -- they pull OPPOSITE ways", r.diffusivity > 1 && r.lambdaPart < 1,
       "diffusivity " + r.diffusivity.toFixed(3) + " favours freezing (ice conducts " +
       (alpha(P.solid) / alpha(P.liquid)).toFixed(2) + "x better); lambda " + r.lambdaPart.toFixed(4) +
       " opposes it (ice's c is half water's, so the Stefan number halves). A ROUND REPORTING ONLY 'about 2x' " +
       "would be reporting the product of two numbers it never separated.");
    ok("...and the ratio DRIFTS with dT, so it is not a constant somebody could have typed",
       ratioParts({ ...P, dT: 50, t: T }).ratio > ratioParts({ ...P, dT: 10, t: T }).ratio,
       "2.0286 at 10K rising to 2.0925 at 50K -- lambda's nonlinearity");
    ok("the closed form's own residual is still machine zero on both sides",
       Math.max(frontExact({ ...P, dT: 25, t: T, freeze: true }).residual,
                frontExact({ ...P, dT: 25, t: T, freeze: false }).residual) < 1e-12,
       "so the asymmetry is not a badly solved transcendental");
}

// ---- 3. THE CONTROL: ONE SUBSTANCE, AND DIRECTION MUST STOP MATTERING --------------------------------------------------
{
    const same = { solid: MATERIALS.ice, liquid: MATERIALS.ice, L: MATERIALS.ice.L, Tm: MATERIALS.ice.Tm };
    const r = ratioParts({ ...same, dT: 25, t: T });
    ok("!! WITH EQUAL PROPERTIES THE CLOSED FORM TIES EXACTLY", r.ratio === 1,
       "ratio " + r.ratio.toFixed(6) + " -- not close, the same number");
    // AND THROUGH THE SOLVER, which is the half that could actually have a bug in it.
    const XE = r.melt.front;
    const m = twoPhase({ ...same, dT: 25, freeze: false, n: 150, len: 4 * XE, tEnd: T });
    const f = twoPhase({ ...same, dT: 25, freeze: true, n: 150, len: 4 * XE, tEnd: T });
    ok("!! ...AND SO DOES THE SOLVER, WHICH IS THE HALF THAT COULD BE WRONG", m.front === f.front,
       "melt " + m.front.toFixed(6) + "   freeze " + f.front.toFixed(6) + " -- IDENTICAL, so the asymmetry in " +
       "section 2 is carried ENTIRELY by the materials and none of it by the freeze branch");
    // THE CONTROL THAT ACTUALLY BITES. With one substance the two runs are exact mirrors in enthalpy:
    // H_freeze(i) = rho*L - H_melt(i). A FRONT-ONLY COMPARISON MISSED A 3% TIMESTEP SABOTAGE because a front
    // is a quantised cell index; the field comparison catches it.
    const mirrorOf = (a, b) => { let w = 0; for (let i = 0; i < a.H.length; i++) w = Math.max(w, Math.abs(b.H[i] - (a.rhoL - a.H[i]))); return w; };
    const mirror = mirrorOf(m, f);
    // I FIRST WROTE `mirror === 0` AND IT WENT RED AT 9.596e-6 -- I typed an expectation instead of measuring
    // one, which is the thing the notes warn about most often. The two runs take DIFFERENT BRANCHES of the
    // H -> T map (melting climbs out through the liquid branch, freezing falls out through the solid one), so
    // they are algebraically mirrored but not bitwise, and thousands of steps of round-off accumulate.
    // THE BOUND IS DERIVED FROM A LIVE PERTURBATION rather than typed: re-run the freeze side with a 3%
    // smaller timestep -- the sabotage the front-based control could not see -- and require the clean reading
    // to sit orders below it.
    const perturbed = twoPhase({ ...same, dT: 25, freeze: true, n: 150, len: 4 * XE, tEnd: T, cfl: 0.2 * 0.97 });
    const mirrorPerturbed = mirrorOf(m, perturbed);
    ok("!! ...AND THE ENTHALPY FIELDS MIRROR TO ROUND-OFF, which a front comparison cannot check",
       mirror * 1e3 < mirrorPerturbed,
       "clean " + mirror.toExponential(3) + " against " + mirrorPerturbed.toExponential(3) + " for a 3% " +
       "freeze-only timestep -- a factor of " + (mirrorPerturbed / mirror).toExponential(2) + ", and rho*L is " +
       m.rhoL.toExponential(3) + " so the clean reading is ~" + (mirror / m.rhoL).toExponential(1) + " relative. " +
       "THE FRONT-ONLY VERSION OF THIS CONTROL SURVIVED THAT SAME SABOTAGE -- a front is a CELL INDEX, so two " +
       "genuinely different runs can quantise onto the same cell and read identical.");
    ok("...and both actually moved a front, so the tie is not between two nulls",
       m.front !== null && m.front > 0 && m.transformedFraction > 0 && m.transformedFraction < 1,
       "transformed fraction " + m.transformedFraction.toFixed(4));
}

// ---- 4. THE SOLVER FINDS THE ASYMMETRY, NOT JUST THE FORMULA ------------------------------------------------------------
{
    const dT = 25;
    const em = frontExact({ ...P, dT, t: T, freeze: false }), ef = frontExact({ ...P, dT, t: T, freeze: true });
    const m = twoPhase({ ...P, dT, freeze: false, n: 150, len: 4 * em.front, tEnd: T });
    const f = twoPhase({ ...P, dT, freeze: true, n: 150, len: 4 * ef.front, tEnd: T });
    ok("!! THE SOLVER REPRODUCES THE ASYMMETRY, not merely the closed form", f.front / m.front > 1.5,
       "solver ratio " + (f.front / m.front).toFixed(4) + " against the exact " + (ef.front / em.front).toFixed(4) +
       " -- two independent routes to the same physics");
    ok("each side is within a few percent of its own exact answer",
       Math.abs(m.front - em.front) / em.front < 0.12 && Math.abs(f.front - ef.front) / ef.front < 0.12,
       "melt " + (100 * Math.abs(m.front - em.front) / em.front).toFixed(1) + "%, freeze " +
       (100 * Math.abs(f.front - ef.front) / ef.front).toFixed(1) + "% at this coarse gate grid");
    // THIS CHECK REPLACES ONE THAT WENT RED ON ITS FIRST RUN AND DESERVED TO. I had asserted the melt side
    // always carries the larger error "because the melt front is half as long" -- but each side's domain is
    // sized to its OWN front, so both are resolved by the same cells to the interface BY CONSTRUCTION, and at
    // n=150 the ordering REVERSES. The property that is actually true is that the difference is a MEASUREMENT
    // artefact, and the way to show that is THE FLIP.
    const coarseMelt = Math.abs(m.front - em.front) / em.front, coarseFreeze = Math.abs(f.front - ef.front) / ef.front;
    ok("!! THE ERROR ORDERING FLIPS WITH n, SO IT IS THE MEASUREMENT AND NOT THE PHYSICS", coarseMelt < coarseFreeze,
       "at n=150 melt " + (100 * coarseMelt).toFixed(1) + "% < freeze " + (100 * coarseFreeze).toFixed(1) +
       "%, while at n=600 the header records the REVERSE (melt 3.3-4.0%, freeze 0.67%). The front is a CELL " +
       "INDEX times dx, so which side reads larger depends on where the true front falls inside a cell. WHEN " +
       "THIS LINE GOES RED, CHECK WHETHER THE FLIP IS GONE BEFORE WEAKENING IT -- a stable ordering would mean " +
       "a real bias and should be investigated, not tolerated.");
    ok("...and my first explanation of that difference is recorded as REFUTED, not quietly dropped",
       (MEASURED_V3619.errorNote || "").includes("REFUTED"),
       "'half as long' was never true of this fixture -- a plausible story transplanted onto a configuration " +
       "that did not have the property, the fourth time this session");
}

// ---- 5. THE TWO REVERSIBILITY CLAIMS, WHICH MY FIRST CHECK CONFLATED ------------------------------------------------------
{
    const rev = reversibility(P);
    ok("!! ADD HEAT THEN REMOVE IT AND THE STATE RETURNS EXACTLY -- EVERYWHERE, MUSHY RANGE INCLUDED",
       rev.addRemove === 0,
       "worst departure " + rev.addRemove.toExponential(3) + " over " + rev.samples + " samples. H IS THE " +
       "STATE and the update is additive on it; a solver tracking T with a phase flag could not pass this.");
    ok("!! H -> T -> H is exact OUTSIDE the mushy interval", rev.roundTrip < 1e-12,
       rev.roundTrip.toExponential(3));
    ok("!! ...and the NON-INVERTIBLE SET IS CLOSED, NOT OPEN -- the endpoints belong to it", rev.mushySamples > 0,
       rev.mushySamples + " of " + rev.samples + " samples inside [0, rho*L]. H=0 is solid AT Tm and H=rho*L is " +
       "liquid AT Tm; both map to Tm. MY FIRST VERSION EXCLUDED THE RANGE WITH STRICT INEQUALITIES AND READ " +
       "3.063e+8 -- v3618's own stallCheck already said the endpoints read Tm and I did not carry it across.");
    ok("the two claims are recorded as separate", (MEASURED_V3619.reversibilityLesson || "").includes("TWO CLAIMS"),
       "'add then remove' and a round trip through a MANY-TO-ONE map are not the same question");
}

// ---- 6. WHAT IS NOT CLAIMED, AND THE ANTIDOTE --------------------------------------------------------------------------
//
// ANTIDOTE: if a later round adds supercooling or nucleation, section 2's ratio MOVES and should -- REWRITE IT
// TO THE NEW PREDICTION AND NAME WHAT CHANGED rather than loosening it, because the ratio being PREDICTED from
// properties is the whole point. Section 3's control must stay EXACT whatever else changes; if it ever ties
// only approximately, the freeze branch has grown something the melt branch has not.
{
    ok("supercooling and nucleation are refused with a reason", (MEASURED_V3619.notClaimed || "").includes("STOCHASTIC"),
       "real water does not freeze at Tm without a nucleation site, and the delay has no closed form -- " +
       "refused on v3618's combustion grounds");
    ok("the error asymmetry is named rather than hidden", (MEASURED_V3619.errorNote || "").includes("HALF AS LONG"),
       "so the 4% is not later read as a finding about melting");
    const rep = reportLines();
    ok("the report renders and names the decomposition", rep.length > 15 && rep.join("\n").includes("NEITHER FACTOR ALONE"), rep.length + " lines");
}

console.log(fails ? "\nfreeze-selfcheck: " + fails + " FAILED" : "\nfreeze-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
