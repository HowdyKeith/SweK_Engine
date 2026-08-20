// WebGLEngine/physics/sph/cfl-selfcheck.mjs — v2563
//
// Run: node physics/sph/cfl-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// ONE OF THE SEVEN MILLENNIUM PRIZE PROBLEMS IS RUNNING IN THIS ENGINE EVERY FRAME.
//
// Navier-Stokes existence and smoothness: in 3D, do smooth solutions exist for all time, or can a smooth initial
// condition BLOW UP IN FINITE TIME? Nobody knows. $1M. (Poincare is the only one of the seven solved -- Perelman,
// 2003, who declined both the money and the Fields Medal.)
//
// fleshSph.js integrates Navier-Stokes every frame and HAS NEVER ONCE SAID IT DID NOT KNOW.
//
// MEASURED (500 particles, h=0.3492, DT=1/120 fixed forever):
//
//     kick        max|v|      CFL
//     none          0.78     0.019
//     v=50         44.39     1.059   OVER
//     v=1e6     887923.39  1189.821  OVER
//
// NEVER NaN. NEVER A COMPLAINT. ALWAYS A NUMBER. At CFL 1189 a particle crosses ELEVEN HUNDRED SMOOTHING LENGTHS
// PER STEP -- past every neighbour it was supposed to interact with -- and the solver returns a tidy finite
// field. THE PHYSICS IS FICTION AND THE SOLVER IS SERENE.
//
// THE CLAY PROBLEM ASKS WHETHER THE TRUE SOLUTION CAN BLOW UP. THIS SOLVER CANNOT BLOW UP. It quietly stops
// solving Navier-Stokes and solves something else, and the something else looks exactly like an answer.
//
// THIS FILE DOES NOT FIX THAT. It reports it. Sub-stepping or clamping would change every determinism hash in
// the engine -- lockstep, cross-arch, replay validation -- and this engine does not break working things for a
// bite nobody has taken yet. simulation/euler/ has had cflDt() all along; the SPH never had the number, so
// nobody could ask. YOU CANNOT DECIDE ABOUT A NUMBER YOU HAVE NEVER SEEN.
import fs from "node:fs";
import { FleshSph, DT } from "../soft/fleshSph.js";
import { cflNumber, cflStep, cflVerdict } from "./cfl.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const BONES = [{ a: [0, 0, 0], b: [1, 0, 0], r: 0.3 }, { a: [1, 0, 0], b: [2, 0, 0], r: 0.26 }];
// v2581 -- IMPORTED, not re-declared. This file used to carry its own `const DT`, a SECOND COPY of the
// number that decides whether the verdict is true. THE CFL NUMBER IS maxSpeed * dt / h: if dt is a copy of a
// constant living somewhere else, THE VERDICT IS ABOUT A STEP THE SOLVER MAY NOT BE TAKING. Two files
// disagreeing, and the disagreement would look like a pass.

const settle = (kick) => {
    const f = new FleshSph(BONES, { count: 500, seed: 42 });
    if (kick) f.world.particles[0].vx = kick;
    for (let i = 0; i < 120; i++) f.step(BONES);
    return f;
};

/**
 * THE PEAK CFL ACROSS THE TRANSIENT -- not the CFL after it settles.
 *
 * This distinction cost me the first version of this file, and it is the interesting half of the finding. The
 * flesh DAMPS (fleshSph.js's `this.damp`). Kick a particle to 50 m/s, wait 120 steps, and the CFL reads 0.001 --
 * the kick is GONE. The settled state is innocent. THE MOMENT THAT BROKE THE PHYSICS IS ALREADY OVER, AND IT
 * LEFT NO MARK.
 *
 * So a panel that samples CFL once a second would report a healthy solver through an event that made the frame
 * meaningless. THE THING YOU MUST MEASURE IS THE PEAK, AND THE PEAK IS THE THING A SETTLED STATE HAS FORGOTTEN.
 */
const peak = (kick, steps = 120) => {
    const f = new FleshSph(BONES, { count: 500, seed: 42 });
    if (kick) f.world.particles[0].vx = kick;
    let worst = { courant: 0, maxSpeed: 0, ok: true, finite: true };
    for (let i = 0; i < steps; i++) {
        f.step(BONES);
        const c = cflNumber(f.world, f.h, DT);
        if (c.courant > worst.courant || !c.finite) worst = c;
    }
    return { f, worst };
};

// ---- 1. the number exists now, and it is right ---------------------------------------------------------------
{
    const f = settle(0);
    const c = cflNumber(f.world, f.h, DT);
    ok("at rest the flesh is well under the CFL limit", c.ok && c.courant < 0.1,
       "CFL " + c.courant.toFixed(3) + ", max|v| " + c.maxSpeed.toFixed(2) + " -- the step IS supported by the physics here");
    ok("...and the number is max|v|*dt/h, not a vibe", Math.abs(c.courant - (c.maxSpeed * DT) / f.h) < 1e-12,
       "h = " + f.h.toFixed(4) + ", dt = 1/120");
}

// ---- 2. THE FINDING: it blows the limit and says nothing ------------------------------------------------------
{
    const { worst } = peak(50);
    ok("A 50 m/s KICK BLOWS THE CFL LIMIT DURING THE TRANSIENT", worst.courant > 1,
       "peak CFL " + worst.courant.toFixed(3) + " from max|v| " + worst.maxSpeed.toFixed(2) +
       " -- the threshold is about 44 m/s in the flesh's own units. A KAIJU PUNCH DOES THAT.");
    ok("...AND THE SOLVER RETURNED PERFECTLY FINITE NUMBERS ANYWAY", worst.finite,
       "no NaN, no warning, no complaint. THE CLAY PROBLEM ASKS WHETHER THE TRUE SOLUTION BLOWS UP; THIS ONE CANNOT -- it stops solving Navier-Stokes and solves something else, and the something else looks exactly like an answer.");

    const wild = peak(1e6);
    ok("...and at a MILLION m/s it is still finite and still silent", wild.worst.finite && wild.worst.courant > 100,
       "peak CFL " + wild.worst.courant.toFixed(1) + " -- the fastest particle crosses " + wild.worst.courant.toFixed(0) +
       " smoothing lengths PER STEP, interacting with neighbours it never met. A NUMERICAL SOLVER ALWAYS RETURNS A NUMBER; THE QUESTION IS WHETHER THE NUMBER IS ABOUT YOUR PROBLEM.");

    // !! THE HALF I GOT WRONG FIRST, AND THE MORE USEFUL HALF.
    const after = cflNumber(settle(50).world, settle(50).h, DT);
    ok("!! AND BY THE TIME IT SETTLES, THE EVIDENCE IS GONE", after.courant < 0.1 && worst.courant > 1,
       "peak CFL " + worst.courant.toFixed(2) + " during the transient -> " + after.courant.toFixed(3) +
       " once damped. THE MOMENT THAT BROKE THE PHYSICS IS ALREADY OVER AND IT LEFT NO MARK. A panel sampling CFL once a second would report a healthy solver straight through the frame that meant nothing. THE PEAK IS THE MEASUREMENT; A SETTLED STATE HAS FORGOTTEN IT.");
}

// ---- 3. it reports rather than fixes, and says so --------------------------------------------------------------
{
    // Build the verdict from a state that IS over -- the transient, sampled while it is happening.
    const f = new FleshSph(BONES, { count: 500, seed: 42 });
    f.world.particles[0].vx = 500;
    f.step(BONES);
    const v = cflVerdict(f.world, f.h, DT);
    ok("the verdict NAMES the problem in a sentence a person can act on", /OVER THE LIMIT/.test(v) && /not a solution to anything/.test(v),
       v.slice(0, 96) + "...");
    ok("...and tells you the step it WOULD need", cflStep(f.world, f.h) < DT,
       "needs <= " + cflStep(f.world, f.h).toExponential(2) + "s, taking " + DT.toExponential(2) + "s");
    const calm = settle(0);
    ok("...while a healthy state gets a boring verdict", /supported by the physics/.test(cflVerdict(calm.world, calm.h, DT)));

    // THE PROMISE THAT THIS CHANGES NOTHING. If it altered a single trajectory, every determinism hash in the
    // lockstep stack would move and the cross-arch test would start reporting a difference that is mine.
    const a = settle(5), b = settle(5);
    cflNumber(a.world, a.h, DT); cflStep(a.world, a.h); cflVerdict(a.world, a.h, DT);
    const same = a.world.particles.every((q, i) => q.x === b.world.particles[i].x && q.vx === b.world.particles[i].vx);
    ok("MEASURING DOES NOT PERTURB: identical states after the report", same,
       "sub-stepping or clamping here would move every determinism hash in the engine -- lockstep, cross-arch, replay. THIS ONLY LOOKS.");
}

// ---- 4. honest about NaN, which is the case where it DOES tell you ---------------------------------------------
{
    const fake = { particles: [{ vx: NaN, vy: 0, vz: 0 }] };
    const c = cflNumber(fake, 0.3, DT);
    ok("a NaN velocity is reported as NOT finite", !c.finite && !c.ok,
       "the one case where the solver DOES tell you something is wrong -- and it is the case that almost never happens, because the arithmetic stays finite while the meaning does not");
    ok("...and gets its own verdict line", /at least it told you/.test(cflVerdict(fake, 0.3, DT)));
    ok("an empty world does not divide by zero", cflStep({ particles: [] }, 0.3) === Infinity);
}

// ---- v2581: THE NUMBER IS ON A PANEL NOW, AND THE PANEL MUST NOT LIE --------------------------------------------
{
    const page = fs.readFileSync(new URL("../../flesh.html", import.meta.url), "utf8");
    ok("flesh.html SHOWS the CFL number", /cflNumber\(sph\.world \?\? sph, sph\.h, DT\)/.test(page),
       "v2563 measured this and NOTHING SHOWED IT FOR EIGHTEEN VERSIONS. The number lived in THIS FILE'S STDOUT, which is a place nobody visits on purpose. A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE.");
    ok("...and it imports DT rather than typing 1/120", /import \{ FleshSph, hybridGrid, DT \}/.test(page),
       "A HARDCODED 1/120 WOULD BE A SECOND COPY OF THE NUMBER THAT DECIDES WHETHER THE VERDICT IS TRUE, and the copy would go stale in silence. THIS FILE USED TO CARRY EXACTLY THAT SECOND COPY -- v2581 exported DT from fleshSph.js and made both read the one value.");
    ok("...and the failing case is LOUD, not dark", /NOT SOLVING NAVIER-STOKES/.test(page) && /CFL unavailable/.test(page),
       "over 1 it says NOT SOLVING NAVIER-STOKES in red, and a THROW says so too. A SILENT CATCH WOULD LEAVE THE LIGHT DARK BECAUSE IT IS BROKEN -- INDISTINGUISHABLE FROM THE LIGHT BEING DARK BECAUSE EVERYTHING IS FINE.");
    ok("...and it is guarded to the fluid modes", /if \(mode !== "spring" && sph\)/.test(page),
       "the spring solver has no smoothing length, so a CFL number there would be arithmetic about nothing");
}

console.log(fails ? "\ncfl-selfcheck: " + fails + " FAILED" : "\ncfl-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
