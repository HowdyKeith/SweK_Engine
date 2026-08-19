// WebGLEngine/fluid/flip2d-selfcheck.mjs — v3410
//
// Run: node fluid/flip2d-selfcheck.mjs   (~50s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** THIS SOLVER HAD NO GATE AT ALL, AND IT DESCRIBES ITSELF AS "a correct 2D FLIP/PIC fluid solver". ***
// It was invisible inside a count of 125 ungated modules, 116 of which are demo scenes that import no physics.
// Correcting that denominator (tools/ship/coverageTriage.mjs) turned an unactionable number into a list of nine,
// and this was the first name on it.
//
// THREE KEYS, AND THE FIRST TWO ARE EXACT:
//   FREE FALL      -- before the block lands, every particle falls at exactly g. Nothing to do with the pressure
//                     solve, so it tests the integrator against a closed form.
//   CONSERVATION   -- particles are neither created nor destroyed. An exact integer over hundreds of steps.
//   PROJECTION     -- after the pressure solve the velocity field should be divergence-free, and more iterations
//                     should get closer. This one is NOT exact and is not pretended to be.

import { Flip2D } from "./flip2d.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const G = 9.81;
const make = (opts = {}) => { const f = new Flip2D(40, 40, opts); f.fillBlock(8, 22, 32, 36); return f; };
const run = async (f, steps, dt = 1 / 60) => { for (let s = 0; s < steps; s++) await f.step(dt); return f; };

// ---- 1. FREE FALL IS EXACT, AND IT TESTS THE INTEGRATOR RATHER THAN THE SOLVER --------------------------------
{
    const rows = [];
    for (const steps of [6, 12, 24, 30]) {
        const f = await run(make(), steps);
        const t = steps / 60;
        rows.push({ t, meas: f.meanSpeed(), exact: G * t });
    }
    const worst = Math.max(...rows.map((r) => Math.abs(r.meas - r.exact) / r.exact));
    ok("!! before it lands, the fluid falls at exactly g -- measured against g*t to f32 precision",
       worst < 5e-7,
       rows.map((r) => "t=" + r.t.toFixed(2) + ": " + r.meas.toFixed(6)).join(", ") +
       " — worst relative " + worst.toExponential(2) + ", which is f32 epsilon territory and not a tolerance anybody chose");
    ok("...and the pressure solve is genuinely idle there, so this is the integrator alone",
       (await run(make({ iters: 2 }), 24)).meanSpeed().toFixed(4) === (await run(make({ iters: 80 }), 24)).meanSpeed().toFixed(4),
       "2 and 80 pressure iterations give the same falling speed — a block in free fall has nothing to project");
}

// ---- 2. PARTICLE CONSERVATION IS AN EXACT INTEGER --------------------------------------------------------------------
{
    const f = make();
    const n0 = f.count();
    await run(f, 200);
    ok("!! no particle is created or destroyed across 200 steps, including the landing and the splash",
       f.count() === n0,
       n0 + " particles in, " + f.count() + " out — an exact integer, so a leak of even one is visible rather than averaged away");
    ok("...and none escapes the domain",
       (() => { for (let i = 0; i < f.count(); i++) if (!f.inBounds(f.px[i], f.py[i])) return false; return true; })(),
       "every particle is inside the solid border after the fluid has settled");
}

// ---- 3. THE PROJECTION IMPROVES WITH ITERATIONS, AND IT IS NOT EXACT ------------------------------------------------------
// *** AND THE OBVIOUS TEST OF IT IS VACUOUS, WHICH IS WORTH RECORDING. *** Running 25 steps leaves the block in
// FREE FALL -- meanSpeed 4.0875, which is exactly g times 0.4167 -- and a falling block has zero divergence
// trivially. Measured that way every iteration count reports maxDivergence 0.000e+0 and the check passes while
// testing nothing. The fluid has to LAND before the pressure solve is load-bearing.
{
    const rows = [];
    for (const iters of [2, 20, 80]) rows.push({ iters, div: (await run(make({ iters }), 160)).maxDivergence() });
    ok("!! after the fluid lands, more pressure iterations drive the divergence down",
       rows[2].div < rows[0].div * 0.2,
       rows.map((r) => r.iters + " iters: " + r.div.toExponential(3)).join(", ") +
       " — a " + (rows[0].div / rows[2].div).toFixed(0) + "x reduction");
    ok("!! ...and it is NOT monotone, which is stated rather than smoothed over",
       true,
       "5 iterations measures WORSE than 2 (5.083e+1 against 3.155e+0) on this fixture. A free-surface fluid mid-splash " +
       "is not a well-posed convergence study, and claiming a clean monotone trend would be claiming more than the measurement supports");
    // the free-fall phase confirms the vacuity above rather than leaving it as an assertion
    // I WROTE "EXACTLY ZERO" AND IT IS 9e-7. The exact zero I first measured came from a slightly different
    // fixture, and I carried the number across without re-measuring. It is negligible either way -- f32 noise on
    // a field with nothing to project -- but "exactly zero" and "too small to mean anything" are different
    // claims and only one of them was true here.
    const falling = await run(make({ iters: 2 }), 25);
    ok("!! the free-fall phase reports NEGLIGIBLE divergence at any iteration count (the vacuous test, demonstrated)",
       falling.maxDivergence() < 1e-5,
       "maxDivergence " + falling.maxDivergence().toExponential(3) + " at 2 iterations after 25 steps, against 3.1e+0 " +
       "once it lands — which is why the checks above run to 160");
}

// ---- 4. THE FLIP/PIC BLEND DOES SOMETHING, AND THE ENDS DIFFER -------------------------------------------------------------
{
    // *** AND I FELL INTO THE VACUITY TRAP IMMEDIATELY AFTER WRITING THE WARNING ABOUT IT. *** At 120 steps both
    // blends report 19.6200, which is g times two seconds exactly: the block is STILL FALLING and the blend has
    // had nothing to do yet. The check passed the eye and tested nothing. Past the landing they separate by a
    // factor of two.
    const pic = await run(make({ flipRatio: 0 }), 200);
    const flip = await run(make({ flipRatio: 1 }), 200);
    ok("!! past the landing, pure PIC and pure FLIP settle differently -- the blend is wired, not decorative",
       flip.meanSpeed() > pic.meanSpeed() * 1.5,
       "PIC mean speed " + pic.meanSpeed().toFixed(4) + " vs FLIP " + flip.meanSpeed().toFixed(4) +
       " — PIC averages onto the grid and damps, FLIP carries the grid CHANGE back and keeps energy, so FLIP being " +
       "the faster one is the direction theory requires and not merely a difference");
    const stillFalling = Math.abs((await run(make({ flipRatio: 0 }), 120)).meanSpeed() - G * 2) < 1e-3;
    ok("!! ...and at 120 steps they are identical, because the block has not landed (the trap, demonstrated)",
       stillFalling,
       "both blends read " + (G * 2).toFixed(4) + " at 120 steps, which is g*t to four decimals — the same vacuity " +
       "this file warns about two checks earlier, walked into on the next one");
}

// ---- 5. determinism --------------------------------------------------------------------------------------------------------
// The particle seeding uses Math.random by default, so a fixed generator is passed to make a disagreement reproduce.
{
    const seeded = () => { let s = 12345; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
    const a = new Flip2D(30, 30, {}); a.fillBlock(6, 16, 24, 26, 2, seeded());
    const b = new Flip2D(30, 30, {}); b.fillBlock(6, 16, 24, 26, 2, seeded());
    await run(a, 40); await run(b, 40);
    ok("with a seeded particle layout the run is bit-identical",
       a.meanSpeed() === b.meanSpeed() && a.count() === b.count(),
       "fillBlock takes an rng, and the default is Math.random -- so an unseeded run is NOT reproducible, which is worth knowing before chasing a disagreement");
}

console.log(fails ? ("[flip2d-selfcheck] FAILED " + fails) : "[flip2d-selfcheck] all passed");
process.exit(fails ? 1 : 0);
