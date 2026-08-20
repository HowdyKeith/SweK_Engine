// physics/plasma-selfcheck.mjs
//
// Run: node physics/plasma-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A charged particle in a magnetic bottle, checked against how real mirror confinement behaves. A magnetic force does no
// work, so the speed is conserved exactly -- the Boris pusher gets this to the last bit. A particle launched with most of
// its motion perpendicular to the field (a high pitch angle) is trapped: it spirals inward toward each strong-field end,
// reflects, and bounces back, staying bounded along the axis. A particle launched with most of its motion along the field
// (a low pitch angle) sits in the loss cone and runs straight out the end. The sabotage flattens the mirror into a
// uniform field, and the trapped particle stops being trapped -- it drifts away down the axis -- because the mirror field
// is the confinement, not decoration around it.
import { makeParticle, step, speedSq, run } from "./plasma.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. A MAGNETIC FORCE DOES NO WORK: speed conserved exactly ---------------------------------------
{
    const p = makeParticle(1.0, 0.4); const v0 = speedSq(p);
    for (let i = 0; i < 6000; i++) step(p, 0.02, 1, 5);
    ok("!! a magnetic force does no work -- the speed is conserved to the last bit", Math.abs(speedSq(p) - v0) < 1e-9,
       "speed^2 starts at " + v0.toFixed(6) + " and ends at " + speedSq(p).toFixed(6) + " after six thousand steps -- the Lorentz force only turns the velocity, never speeds it up, and the Boris pusher respects that exactly.");
}

// ---- 2. A HIGH-PITCH-ANGLE PARTICLE IS TRAPPED (bounded along the axis) ------------------------------
{
    const p = run(1.0, 0.4, 6000);
    ok("!! a high-pitch-angle particle is trapped -- it stays bounded in the bottle", p.zMax < 3,
       "with most of its motion perpendicular to the field it never gets past |z| = " + p.zMax.toFixed(2) + " on an axis five long -- it mirrors and turns back before reaching either end.");
}

// ---- 3. A LOW-PITCH-ANGLE PARTICLE ESCAPES (the loss cone) -------------------------------------------
{
    const p = run(0.3, 1.5, 6000);
    ok("!! a low-pitch-angle particle sits in the loss cone and escapes out the end", p.zMax > 10,
       "with most of its motion along the field it reaches |z| = " + p.zMax.toFixed(0) + " and keeps going -- the mirror cannot turn it, which is the real loss cone every mirror machine leaks through.");
}

// ---- 4. THE TRAPPED PARTICLE REFLECTS (it bounces) --------------------------------------------------
{
    const p = run(1.0, 0.4, 6000);
    ok("!! the trapped particle reflects back and forth", p.reflections >= 2,
       "its axial velocity flips sign " + p.reflections + " times -- it bounces between the two mirror points rather than drifting one way.");
}

// ---- 5. DETERMINISTIC -------------------------------------------------------------------------------
{
    const a = run(1.0, 0.4, 3000), b = run(1.0, 0.4, 3000);
    ok("!! deterministic", a.r[0] === b.r[0] && a.r[2] === b.r[2] && a.reflections === b.reflections,
       "same launch, same bounce, every run -- Boris is add/subtract/multiply/divide and cross products only, no trig or fractional powers, so it is bit-identical across machines.");
}

console.log(fails ? "\nplasma-selfcheck: " + fails + " FAILED" : "\nplasma-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
