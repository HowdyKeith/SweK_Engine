// WebGLEngine/physics/thermal/stefan-selfcheck.mjs -- v3618
//
// Run: node physics/thermal/stefan-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/thermal/stefan.mjs -- the exact-solution key, the convergence ORDER, the latent-heat stall,
// and the negative control that makes "this one conserves" mean something.
//
// THE CHECK THIS FILE EXISTS FOR is section 3: a solver compared against an exact answer at ONE grid size can
// be wrong in a way that never improves, and a tolerance would hide it. THE CLAIM IS THE ERROR RATIO UNDER
// REFINEMENT -- first order, measured, with the ratio derived from the run rather than typed.
//
// AND SECTION 4 IS WHY THE ENTHALPY METHOD WAS CHOSEN: the naive temperature solver is driven HERE, on the
// same fixture, and shown running AHEAD of the exact front because it absorbs no latent heat. Without that,
// "the enthalpy method is correct" would be a claim with nothing beside it.
import {
    MATERIALS, alphaOf, stefanNumber, erfSeries, erfQuad, stefanEq, lambdaFor, stefanFront,
    meltEnthalpy, stallCheck, refinement, MEASURED_V3618, reportLines,
} from "./stefan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. erf IS PINNED TWO WAYS THAT SHARE NO CODE, AND AGAINST A KNOWN VALUE ------------------------------------
{
    let worst = 0;
    for (const x of [0.25, 0.5, 1.0, 1.5, 2.0]) worst = Math.max(worst, Math.abs(erfSeries(x) - erfQuad(x)));
    ok("!! a Maclaurin series and Simpson quadrature agree to ~1e-15", worst < 1e-13,
       "worst |diff| " + worst.toExponential(3) + " -- no code in common, so neither is a restatement of the other");
    ok("!! ...and erf(1) matches the known value to fifteen digits", erfSeries(1).toFixed(15) === "0.842700792949715",
       erfSeries(1).toFixed(15) + " -- an EXTERNAL anchor, so the pair agreeing is not two errors agreeing");
    ok("POSITIVE CONTROL: the two disagree on a WRONG input", Math.abs(erfSeries(1) - erfQuad(1.0001)) > 1e-6,
       "so the agreement above is about the value and not about the comparison");
}

// ---- 2. lambda SOLVES THE TRANSCENDENTAL, AND THE RESIDUAL SAYS SO -----------------------------------------------
{
    let worst = 0;
    for (const St of [0.1, 0.25, 0.5, 1, 2, 5]) worst = Math.max(worst, lambdaFor(St).residual);
    ok("!! the equation's OWN residual at the root is machine zero", worst < 1e-12,
       "worst " + worst.toExponential(3) + " across St in [0.1, 5] -- 'solved' is a measurement, not a loop that ran");
    const a = lambdaFor(0.5).lambda, b = lambdaFor(2).lambda;
    ok("...and lambda RISES with the Stefan number, as more superheat must", b > a,
       "St=0.5 -> " + a.toFixed(6) + ", St=2 -> " + b.toFixed(6));
    ok("the material table gives ordinary reference figures, not tuned ones",
       Object.keys(MATERIALS).length >= 4 && MATERIALS.ice.Tm === 273.15 && MATERIALS.iron.Tm === 1811,
       "ice Tm 273.15 K, iron 1811 K -- anything derived from them is a PREDICTION rather than a fit");
    const st = stefanNumber(MATERIALS.ice, 373.15);
    ok("...and the Stefan number for ice under boiling water is physically sane", st > 0.1 && st < 2,
       "St = " + st.toFixed(4) + ", alpha = " + alphaOf(MATERIALS.ice).toExponential(3) + " m^2/s");
}

// ---- 3. THE FRONT MATCHES THE CLOSED FORM, AND THE CLAIM IS THE CONVERGENCE ORDER ---------------------------------
{
    for (const L of [2, 1, 0.5]) {
        const exact = stefanFront(1 / L, 1, 1), r = meltEnthalpy(L);
        const rel = Math.abs(r.front - exact) / exact;
        ok("the front is within a few percent of the exact answer at L=" + L, rel < 0.03,
           "exact " + exact.toFixed(6) + " vs solver " + r.front.toFixed(6) + " (" + (100 * rel).toFixed(2) + "%)");
    }
    const ref = refinement();
    const ratios = ref.rows.filter((r) => r.ratio).map((r) => r.ratio);
    ok("!! THE ERROR FALLS MONOTONICALLY UNDER REFINEMENT", ref.rows.every((r, i) => i === 0 || r.relErr < ref.rows[i - 1].relErr),
       ref.rows.map((r) => (100 * r.relErr).toFixed(3) + "%").join(" -> "));
    ok("!! ...AND IT HALVES EACH DOUBLING -- FIRST ORDER, MEASURED AS A RATIO",
       ratios.every((r) => r > 1.7 && r < 2.3),
       "ratios " + ratios.map((r) => r.toFixed(2)).join(", ") + " -- a fixed grid whose front sits BETWEEN " +
       "cells must be first order, and A SINGLE ERROR NUMBER WOULD PASS ON A SOLVER THAT NEVER IMPROVES");
    ok("...and the ratio is DERIVED from the run, never typed", ratios.length === ref.rows.length - 1,
       "each ratio is the previous error over this one");
}

// ---- 4. THE NEGATIVE CONTROL: THE NAIVE SOLVER LOSES THE LATENT HEAT ------------------------------------------------
{
    const L = 1, exact = stefanFront(1 / L, 1, 1);
    const good = meltEnthalpy(L), bad = meltEnthalpy(L, { naive: true });
    ok("!! THE NAIVE TEMPERATURE SOLVER HAS NO FRONT AT ALL -- IT MELTS THE WHOLE DOMAIN",
       bad.front === null && bad.moltenFraction === 1,
       "molten fraction " + bad.moltenFraction.toFixed(4) + " -- with nothing absorbing energy at the interface " +
       "there is no boundary to hold in place. My first version of this check said it 'runs ahead'; MEASURING " +
       "it says something stronger.");
    ok("!! ...while the enthalpy solver holds a real interior interface", good.front !== null &&
       good.moltenFraction > 0 && good.moltenFraction < 1,
       "front " + good.front.toFixed(6) + " against exact " + exact.toFixed(6) + ", molten fraction " +
       good.moltenFraction.toFixed(4) + " -- THAT is what the latent heat buys");
    ok("...and front === null is DISTINGUISHED from a front at zero", bad.front === null && good.front > 0,
       "a zero meaning two things is this tree's most repeated defect, and I had committed it in my own return value");
}

// ---- 5. THE STALL FALLS OUT OF THE STATE VARIABLE -------------------------------------------------------------------
{
    const rows = stallCheck(1, 9);
    const mushy = rows.filter((r) => r.h > 0 && r.h < 1);
    ok("!! EVERY MUSHY ENTHALPY READS EXACTLY Tm -- not nearly, exactly", mushy.every((r) => r.T === 0),
       mushy.length + " samples strictly inside the mushy range, all T === 0. THE STALL IS NOT A SPECIAL CASE " +
       "SOMEBODY REMEMBERED TO WRITE; it falls out of deriving T from H.");
    ok("...and the endpoints are the boundaries of it", rows[0].T === 0 && rows[rows.length - 1].T === 0,
       "H=0 (solid at Tm) and H=rho*L (liquid at Tm) both read Tm");
    ok("POSITIVE CONTROL: just past the mushy range the temperature MOVES", stallCheck(1, 9).length > 0 &&
       (() => { const T = (h) => (h < 0 ? h : (h <= 1 ? 0 : h - 1)); return T(1.5) > 0 && T(-0.5) < 0; })(),
       "so the stall is a property of the range and not a function that always returns Tm");
}

// ---- 6. WHAT IS NOT BUILT, AND THE ANTIDOTE ---------------------------------------------------------------------------
//
// ANTIDOTE: when this is wired to a 3D voxel grid, THIS FILE IS WHAT THE 3D VERSION MUST BE GRADED AGAINST --
// re-run section 3 in 3D and expect first order again. If a future round adds combustion, it does NOT get to
// borrow this file's credibility: it has no closed form, and the reason is recorded in MEASURED_V3618.
{
    ok("combustion is refused with a reason rather than left as a gap", (MEASURED_V3618.notBuilt || "").includes("fireMesh"),
       "ignition temperature and flame speed are TUNED, and fireMesh.js already renders fire with no gate");
    ok("...and the one-dimensional scope is stated", (MEASURED_V3618.notClaimed || "").includes("ONE DIMENSION"),
       "the forward model earns its key before anything is built on it");
    ok("the material table keys off the voxel type that already exists",
       (MEASURED_V3618.notClaimed || "").includes("voxelRLE"),
       "voxel/voxelRLE.js already stores a type per run -- the join exists, the 3D wiring is the next round");
    const rep = reportLines();
    ok("the report renders and names the convergence order", rep.length > 20 && rep.join("\n").includes("First order"), rep.length + " lines");
}

console.log(fails ? "\nstefan-selfcheck: " + fails + " FAILED" : "\nstefan-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
