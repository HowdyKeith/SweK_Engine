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
import { makeParticle, step, speedSq, run, fieldAt } from "./plasma.js";

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

// ---- 6. fieldAt: THE CLOSED-FORM MIRROR FIELD, AGAINST HAND-COMPUTED VALUES --------------------------
{
    // B0=2, L=5, at (x,y,z)=(1,0,2): iL2=1/25=0.04, Bx=-B0*x*z*iL2=-0.16, By=0, Bz=B0*(1+z^2*iL2)=2*1.16=2.32
    const B = fieldAt(1, 0, 2, 2, 5);
    ok("!! fieldAt matches a hand-computed value off-axis", Math.abs(B[0] - (-0.16)) < 1e-12 && B[1] === 0 && Math.abs(B[2] - 2.32) < 1e-12,
       "fieldAt(1,0,2,2,5) = [" + B.map((v) => v.toFixed(6)).join(", ") + "], hand-computed [-0.16, 0, 2.32] from Bx=-B0 x z/L^2, By=-B0 y z/L^2, Bz=B0(1+z^2/L^2)");

    // On axis (x=y=0) the field must be PURELY AXIAL: Bx=By=0 exactly, for any z, B0, L -- the pinch terms vanish.
    let onAxisPure = true;
    for (const z of [-4, -1, 0, 1.5, 4.9]) { const b = fieldAt(0, 0, z, 1, 5); if (b[0] !== 0 || b[1] !== 0) onAxisPure = false; }
    ok("!! on the axis (x=y=0) the field is EXACTLY axial -- Bx and By vanish identically, not approximately",
       onAxisPure, "the pinch terms -B0 x z/L^2 and -B0 y z/L^2 multiply by x=0 and y=0, so they are exact zeros by construction, not a small residual");

    // At z=0 (the midplane) Bz = B0 exactly and the pinch is zero regardless of x,y -- the weakest point of the bottle.
    const mid = fieldAt(0.7, -0.3, 0, 3, 5);
    ok("!! at the midplane z=0, Bz is exactly B0 and Bx=By=0 even off-axis", mid[0] === 0 && mid[1] === 0 && mid[2] === 3,
       "fieldAt(0.7,-0.3,0,3,5) = [" + mid.map((v) => v.toFixed(6)).join(", ") + "] -- every term carrying z vanishes at z=0, leaving the bare mirror strength B0");

    // divergence-free by construction (per the module's own comment): dBx/dx + dBy/dy + dBz/dz = 0. Verify
    // NUMERICALLY by central difference at an off-axis, off-midplane point, independent of the analytic argument.
    const h = 1e-4, x0 = 0.8, y0 = -0.4, z0 = 1.3, B0 = 1.7, L = 4.2;
    const dBxdx = (fieldAt(x0 + h, y0, z0, B0, L)[0] - fieldAt(x0 - h, y0, z0, B0, L)[0]) / (2 * h);
    const dBydy = (fieldAt(x0, y0 + h, z0, B0, L)[1] - fieldAt(x0, y0 - h, z0, B0, L)[1]) / (2 * h);
    const dBzdz = (fieldAt(x0, y0, z0 + h, B0, L)[2] - fieldAt(x0, y0, z0 - h, B0, L)[2]) / (2 * h);
    const div = dBxdx + dBydy + dBzdz;
    ok("!! div B = 0 to numerical precision at a generic off-axis point (Maxwell's constraint, not painted on)",
       Math.abs(div) < 1e-6,
       "central-difference divergence " + div.toExponential(3) + " at (x,y,z)=(0.8,-0.4,1.3) -- a real magnetic field " +
       "has no sources, and this is the property that lets the module call itself a magnetic-mirror FIELD rather " +
       "than an arbitrary vector function");
}

console.log(fails ? "\nplasma-selfcheck: " + fails + " FAILED" : "\nplasma-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
