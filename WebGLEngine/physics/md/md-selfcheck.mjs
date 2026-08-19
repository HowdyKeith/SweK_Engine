// WebGLEngine/physics/md/md-selfcheck.mjs — v2641
//
// Run: node physics/md/md-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Molecular dynamics has conserved quantities you can check against physics itself: total momentum is exactly
// conserved because forces are equal and opposite, total energy stays bounded because velocity Verlet is
// symplectic, and the trajectory is time-reversible because Verlet is. The pair potential has a known minimum. And
// the whole thing is transcendental-free, so it is bit-identical across architectures. Each of these is a property a
// wrong integrator or a wrong force would break.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ljCoeff, ljPotential, computeForces, kinetic, velocityVerlet, LJ_RMIN2_OVER_SIG2 } from "./md.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= t;

// ---- 1. THE POTENTIAL HAS ITS MINIMUM WHERE THE FORCE IS ZERO ------------------------------------------------------
{
    const eps = 1, sig2 = 1;                         // sigma = 1
    const rmin2 = LJ_RMIN2_OVER_SIG2 * sig2;         // r0^2
    const fAtMin = ljCoeff(rmin2, eps, sig2);
    const fInside = ljCoeff(rmin2 * 0.8, eps, sig2); // closer than r0 -> repulsive (k > 0)
    const fOutside = ljCoeff(rmin2 * 1.3, eps, sig2);// farther than r0 -> attractive (k < 0)
    const vMin = ljPotential(rmin2, eps, sig2);      // potential at the minimum = -eps
    ok("!! the force is zero at the potential minimum, repulsive inside, attractive outside", near(fAtMin, 0, 1e-12) && fInside > 0 && fOutside < 0 && near(vMin, -eps, 1e-12),
       "at r0^2 = 2^(1/3) sigma^2 the force vanishes and V = -eps (" + vMin.toFixed(6) + "); k>0 when closer, k<0 when farther. The atom sits in the well.");
}

// ---- 2. NEWTON'S THIRD LAW -> TOTAL FORCE (AND MOMENTUM) IS ZERO ---------------------------------------------------
{
    // random cluster
    let seed = 42; const rnd = () => (seed = (1103515245 * seed + 12345) & 0x7fffffff) / 0x7fffffff;
    const N = 12; const pos = new Float64Array(3 * N);
    for (let i = 0; i < 3 * N; i++) pos[i] = (rnd() - 0.5) * 4;
    const { forces } = computeForces(pos, N, 1, 1, 0);
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < N; i++) { sx += forces[3 * i]; sy += forces[3 * i + 1]; sz += forces[3 * i + 2]; }
    ok("!! forces are equal and opposite: the total force on the system is zero", near(sx, 0, 1e-9) && near(sy, 0, 1e-9) && near(sz, 0, 1e-9),
       "sum of all forces = (" + sx.toExponential(1) + ", " + sy.toExponential(1) + ", " + sz.toExponential(1) + ") ~ 0, so total momentum never changes -- a cluster does not push itself across the box.");
}

// ---- 3. ENERGY IS CONSERVED OVER A LONG RUN (Verlet is symplectic) ------------------------------------------------
{
    // two atoms oscillating in the well: place them near r0 with a small inward kick
    const N = 2, eps = 1, sig2 = 1;
    const r0 = Math.sqrt(LJ_RMIN2_OVER_SIG2);
    const pos = new Float64Array([0, 0, 0, r0 * 1.15, 0, 0]);
    const vel = new Float64Array([0, 0, 0, -0.15, 0, 0]);
    const masses = new Float64Array([1, 1]);
    const forceFn = (p) => computeForces(p, N, eps, sig2, 0);
    const state = { pos, vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    const E0 = kinetic(vel, masses) + state.pe;
    let maxDrift = 0;
    for (let step = 0; step < 4000; step++) {
        velocityVerlet(state, 0.005, forceFn);
        const E = kinetic(state.vel, masses) + state.pe;
        maxDrift = Math.max(maxDrift, Math.abs(E - E0));
    }
    ok("!! total energy stays bounded over 4000 steps (symplectic integration)", maxDrift < 1e-3 * Math.abs(E0) + 1e-4,
       "an oscillating pair over 4000 Verlet steps: max energy drift " + maxDrift.toExponential(2) + " against E0 " + E0.toFixed(4) + " -- bounded, not growing. Forward Euler would spiral out.");
}

// ---- 4. THE TRAJECTORY IS TIME-REVERSIBLE -------------------------------------------------------------------------
{
    let seed = 7; const rnd = () => (seed = (1103515245 * seed + 12345) & 0x7fffffff) / 0x7fffffff;
    const N = 6, eps = 1, sig2 = 1;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N);
    for (let i = 0; i < 3 * N; i++) { pos[i] = (rnd() - 0.5) * 3; vel[i] = (rnd() - 0.5) * 0.2; }
    const start = pos.slice();
    const masses = new Float64Array(N).fill(1);
    const forceFn = (p) => computeForces(p, N, eps, sig2, 0);
    const state = { pos, vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    for (let s = 0; s < 500; s++) velocityVerlet(state, 0.004, forceFn);
    for (let i = 0; i < 3 * N; i++) state.vel[i] = -state.vel[i];        // flip velocities
    state.forces = forceFn(state.pos).forces;
    for (let s = 0; s < 500; s++) velocityVerlet(state, 0.004, forceFn); // retrace
    let maxErr = 0;
    for (let i = 0; i < 3 * N; i++) maxErr = Math.max(maxErr, Math.abs(state.pos[i] - start[i]));
    ok("!! flipping velocities retraces the path back to the start (reversible)", maxErr < 1e-6,
       "500 steps forward, negate velocities, 500 more: atoms return to their start positions within " + maxErr.toExponential(2) + ". Time symmetry is the signature of a correct symplectic integrator.");
}

// ---- 5. DETERMINISTIC: NO TRANSCENDENTAL MATH IN THE MD CORE -------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "md.js"), "utf8")
        .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|sqrt|cbrt|sinh|cosh|tanh|hypot)\b/;
    ok("!! the MD core uses no transcendental or sqrt (bit-identical across architectures)", !banned.test(src),
       "LJ is built from r^2 powers (multiply/divide only) and Verlet from add/multiply -- so the whole simulation is IEEE-exact. THE SAME MOLECULE RUNS THE SAME BITS ON x86_64 AND arm64, lockstep-safe.");
}

console.log(fails ? "\nmd-selfcheck: " + fails + " FAILED" : "\nmd-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
