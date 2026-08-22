// WebGLEngine/fluid/flip3d-selfcheck.mjs — v3427
//
// Run: node fluid/flip3d-selfcheck.mjs   (~31s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// THE 3D EXTENSION OF THE SOLVER GATED AT v3410, and the last module the coverage triage called GATEABLE. Named
// there rather than quietly left out, so that gating it is a decision somebody made instead of an oversight
// nobody noticed.
//
// The three keys transfer unchanged, and so do the two traps -- both of which are DEMONSTRATED here rather than
// merely avoided, because a warning nobody can see is a warning nobody heeds:
//   a block still in free fall has nothing to project, so every iteration count looks equally good;
//   PIC and FLIP are indistinguishable until it lands, because neither has done anything yet.
//
// AND TWO THINGS ARE GENUINELY DIFFERENT IN 3D, both worth recording rather than glossing:
//   THE PROJECTION CONVERGES MONOTONICALLY HERE. In 2D it did not -- five iterations measured worse than two --
//   and that was recorded as an honest wart. In 3D it falls 9.5e-1 -> 5.5e-2 -> 3.5e-3 -> 2.0e-5, cleanly, a
//   factor of 48,000. Same algorithm, better-behaved convergence, and the difference is real rather than a
//   fixture accident.
//   *** AND step() IS SYNCHRONOUS HERE WHILE THE 2D step() IS ASYNC. *** The 3D file's own header says "the step
//   pipeline is identical". The pipeline is; the CALL CONTRACT is not. In 2D an unawaited step silently does
//   nothing and the measurement reads a stationary fluid -- which is exactly how the 2D round began, with a
//   solver that appeared frozen. Here awaiting is harmless and omitting it is fine, so the same mistake is
//   impossible. Two sibling files, one sentence claiming they match, and a difference that changes how you must
//   call them.

import { Flip3D } from "./flip3d.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const G = 9.81;
// *** THE FIXTURES ARE SEEDED, AND THEY WERE NOT AT FIRST -- WHICH BROKE TWO CHECKS FOR A REASON THAT HAD
// NOTHING TO DO WITH WHAT THEY WERE TESTING. *** fillBlock defaults to Math.random, so every make() call built a
// DIFFERENT fluid. The two checks that compare one setting against another -- 2 pressure iterations against 120,
// and PIC against FLIP -- were therefore comparing different particle layouts as well, and failed on the layout
// difference rather than on the setting. The determinism check at the bottom of this file says exactly that
// about unseeded runs, and the fixtures above it were unseeded. One rng, threaded through, and the only thing
// that differs between two runs is the thing under test.
const seededRng = (seed = 20260804) => { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
const make = (opts = {}, seed = 20260804) => {
    const f = new Flip3D(24, 24, 24, opts);
    f.fillBlock(6, 14, 6, 18, 22, 18, 2, seededRng(seed));
    return f;
};
const run = async (f, steps, dt = 1 / 60) => { for (let s = 0; s < steps; s++) await f.step(dt); return f; };
const count = (f) => (f.count ? f.count() : f.px.length);

// ---- 1. FREE FALL IS EXACT, AND IT TESTS THE INTEGRATOR ALONE ----------------------------------------------------
{
    const rows = [];
    for (const steps of [6, 12, 24]) {
        const f = await run(make(), steps);
        rows.push({ t: steps / 60, meas: f.meanSpeed(), exact: G * steps / 60 });
    }
    const worst = Math.max(...rows.map((r) => Math.abs(r.meas - r.exact) / r.exact));
    ok("!! before it lands, the fluid falls at exactly g in three dimensions",
       worst < 5e-7,
       rows.map((r) => "t=" + r.t.toFixed(2) + ": " + r.meas.toFixed(6)).join(", ") +
       " — worst relative " + worst.toExponential(2) + ", f32 epsilon territory rather than a chosen tolerance");
    // TOLERANCE EARNED, NOT GUESSED, AND MY FIRST ONE WAS TIGHTER THAN f32 ALLOWS. With the fixtures seeded the
    // residual is 1.75e-8 -- single-precision accumulation over 24 steps, on a grid whose velocities are
    // Float32Array. Asking for 1e-9 was asking the arithmetic for a digit it does not carry.
    const a = await run(make({ iters: 2 }), 24), b = await run(make({ iters: 120 }), 24);
    ok("...and the pressure solve is idle there, so this is the integrator and not the projection",
       Math.abs(a.meanSpeed() - b.meanSpeed()) / a.meanSpeed() < 1e-6,
       "2 and 120 pressure iterations differ by " + Math.abs(a.meanSpeed() - b.meanSpeed()).toExponential(2) +
       " in falling speed, which is f32 round-off over 24 steps rather than the projection doing anything");
}

// ---- 2. PARTICLE CONSERVATION IS AN EXACT INTEGER -----------------------------------------------------------------------
{
    const f = make();
    const n0 = count(f);
    await run(f, 200);
    ok("!! no particle is created or destroyed across 200 steps, landing and splash included",
       count(f) === n0,
       n0 + " in, " + count(f) + " out — an exact integer in 3D as in 2D, so a leak of one is visible rather than averaged into a fraction");
}

// ---- 3. THE PROJECTION CONVERGES, AND UNLIKE 2D IT DOES SO MONOTONICALLY -------------------------------------------------
{
    const rows = [];
    for (const iters of [2, 10, 40, 120]) rows.push({ iters, div: (await run(make({ iters }), 150)).maxDivergence() });
    const monotone = rows.every((r, i) => i === 0 || r.div < rows[i - 1].div);
    ok("!! after landing, more pressure iterations drive the divergence down by a factor of " + (rows[0].div / rows[3].div).toExponential(1),
       rows[3].div < rows[0].div * 1e-3,
       rows.map((r) => r.iters + ": " + r.div.toExponential(3)).join(", "));
    ok("!! ...and MONOTONICALLY, which the 2D solver did not manage",
       monotone,
       "in 2D five iterations measured WORSE than two and that was recorded as an honest wart. Same algorithm, " +
       "better-behaved convergence in 3D — a real difference between the two files rather than a fixture accident");
}

// ---- 4. THE TWO TRAPS FROM THE 2D ROUND, DEMONSTRATED RATHER THAN AVOIDED ------------------------------------------------
{
    const falling = await run(make({ iters: 2 }), 24);
    ok("!! a block still in free fall reports negligible divergence at ANY iteration count (trap one)",
       falling.maxDivergence() < 1e-4,
       "maxDivergence " + falling.maxDivergence().toExponential(3) + " at 2 iterations after 24 steps, against 9.5e-1 " +
       "once it lands — measure too early and every iteration count looks equally good");
    const pic60 = await run(make({ flipRatio: 0 }), 60), flip60 = await run(make({ flipRatio: 1 }), 60);
    ok("!! and PIC and FLIP are INDISTINGUISHABLE until it lands (trap two)",
       Math.abs(pic60.meanSpeed() - flip60.meanSpeed()) / pic60.meanSpeed() < 1e-6 && Math.abs(pic60.meanSpeed() - G) < 1e-3,
       "both read " + pic60.meanSpeed().toFixed(6) + " at 60 steps against g*1s = 9.81, differing by " + Math.abs(pic60.meanSpeed() - flip60.meanSpeed()).toExponential(2) + " which is f32 round-off — neither blend has " +
       "done anything yet, and a comparison there measures gravity");
}

// ---- 5. PAST THE LANDING THE BLEND SEPARATES, AND IN THE DIRECTION THEORY REQUIRES ----------------------------------------
{
    const pic = await run(make({ flipRatio: 0 }), 240);
    const flip = await run(make({ flipRatio: 1 }), 240);
    ok("!! FLIP retains far more energy than PIC once the fluid is actually moving",
       flip.meanSpeed() > pic.meanSpeed() * 10,
       "PIC " + pic.meanSpeed().toFixed(4) + " vs FLIP " + flip.meanSpeed().toFixed(4) + " km/s-equivalent at 240 steps — " +
       "PIC averages onto the grid and damps almost to rest, FLIP carries the grid CHANGE back. The direction is " +
       "what theory requires; the size is far larger than the 2D case, where they differed by about two");
}

// ---- 6. THE API ASYMMETRY BETWEEN THE TWO SIBLING FILES -------------------------------------------------------------------
// The 3D header says "the step pipeline is identical" to 2D. The pipeline is; the call contract is not.
{
    const fs = await import("node:fs");
    const twoD = fs.readFileSync("fluid/flip2d.mjs", "utf8");
    const threeD = fs.readFileSync("fluid/flip3d.mjs", "utf8");
    ok("!! flip2d's step() is ASYNC and flip3d's is not, despite the header calling the pipeline identical",
       /async\s+step\s*\(/.test(twoD) && !/async\s+step\s*\(/.test(threeD),
       "in 2D an unawaited step silently does nothing and the fluid reads as frozen — which is exactly how the 2D " +
       "round began. Here omitting the await is harmless, so that mistake is impossible. The pipeline matches; " +
       "the contract does not, and only one of those is in the sentence");
}

// ---- 7. determinism -------------------------------------------------------------------------------------------------------
{
    const seeded = () => { let s = 987654321; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
    const a = new Flip3D(16, 16, 16, {}); a.fillBlock(4, 9, 4, 12, 14, 12, 2, seeded());
    const b = new Flip3D(16, 16, 16, {}); b.fillBlock(4, 9, 4, 12, 14, 12, 2, seeded());
    await run(a, 40); await run(b, 40);
    ok("with a seeded particle layout the run is bit-identical",
       a.meanSpeed() === b.meanSpeed() && count(a) === count(b),
       "fillBlock takes an rng and defaults to Math.random, so an unseeded run is NOT reproducible — worth knowing before chasing a disagreement");
}

console.log(fails ? ("[flip3d-selfcheck] FAILED " + fails) : "[flip3d-selfcheck] all passed");
process.exit(fails ? 1 : 0);
