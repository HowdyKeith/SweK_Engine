// WebGLEngine/physics/md/coulomb-selfcheck.mjs — v2645
//
// Run: node physics/md/coulomb-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Coulomb's law is the inverse square with a sign, and both are checkable directly: halving the distance must
// quadruple the force, like charges must push apart and opposite ones pull together, the force from several charges
// must be the sum of the individual forces, and the pair force must be equal and opposite so momentum is conserved.
// A bound pair must conserve energy under integration. And it is transcendental-free.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coulombForces } from "./coulomb.js";
import { kinetic, velocityVerlet } from "./md.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= t;

// ---- 1. THE INVERSE-SQUARE LAW: HALVE r, QUADRUPLE F --------------------------------------------------------------
{
    const q = new Float64Array([1, 1]);
    const far = coulombForces(new Float64Array([0, 0, 0, 2, 0, 0]), 2, q, 1, 0).forces;   // r = 2
    const near_ = coulombForces(new Float64Array([0, 0, 0, 1, 0, 0]), 2, q, 1, 0).forces; // r = 1
    ok("!! the force follows the inverse-square law", near(Math.abs(near_[0]) / Math.abs(far[0]), 4, 1e-9),
       "|F| at r=1 over |F| at r=2 = " + (Math.abs(near_[0]) / Math.abs(far[0])).toFixed(4) + " = 4. Coulomb is 1/r^2.");
}

// ---- 2. LIKE CHARGES REPEL, OPPOSITE ATTRACT ---------------------------------------------------------------------
{
    const pos = new Float64Array([0, 0, 0, 1, 0, 0]);
    const like = coulombForces(pos, 2, new Float64Array([1, 1]), 1, 0).forces;     // atom0 pushed -x
    const opp = coulombForces(pos, 2, new Float64Array([1, -1]), 1, 0).forces;      // atom0 pulled +x
    ok("!! like charges repel and opposite charges attract", like[0] < 0 && opp[0] > 0,
       "two + charges: atom 0 pushed away (Fx=" + like[0].toFixed(2) + "); + and -: atom 0 pulled toward (Fx=" + opp[0].toFixed(2) + ").");
}

// ---- 3. SUPERPOSITION: THE FORCE IS THE SUM OF THE INDIVIDUAL FORCES -----------------------------------------------
{
    // atom 0 between two others; force on 0 from {1,2} == force from 1 alone + force from 2 alone
    const pos = new Float64Array([0, 0, 0, 1.5, 0, 0, -1, 0.5, 0]);
    const both = coulombForces(pos, 3, new Float64Array([1, 1, -1]), 1, 0).forces;
    const only1 = coulombForces(pos, 3, new Float64Array([1, 1, 0]), 1, 0).forces;
    const only2 = coulombForces(pos, 3, new Float64Array([1, 0, -1]), 1, 0).forces;
    let good = true;
    for (let c = 0; c < 3; c++) if (!near(both[c], only1[c] + only2[c], 1e-12)) good = false;
    ok("!! forces from several charges superpose (linear)", good,
       "force on atom 0 from both neighbours equals the sum of the force from each alone -- Coulomb is linear in the sources.");
}

// ---- 4. EQUAL AND OPPOSITE -> MOMENTUM CONSERVED ------------------------------------------------------------------
{
    let seed = 5; const rnd = () => (seed = (1103515245 * seed + 12345) & 0x7fffffff) / 0x7fffffff;
    const N = 10, pos = new Float64Array(3 * N), q = new Float64Array(N);
    for (let i = 0; i < 3 * N; i++) pos[i] = (rnd() - 0.5) * 5;
    for (let i = 0; i < N; i++) q[i] = rnd() < 0.5 ? 1 : -1;
    const f = coulombForces(pos, N, q, 1, 0).forces;
    let sx = 0, sy = 0, sz = 0; for (let i = 0; i < N; i++) { sx += f[3 * i]; sy += f[3 * i + 1]; sz += f[3 * i + 2]; }
    ok("!! the total Coulomb force on the system is zero", near(sx, 0, 1e-9) && near(sy, 0, 1e-9) && near(sz, 0, 1e-9),
       "sum of forces ~0 -> momentum conserved; a charged cluster does not accelerate itself.");
}

// ---- 5. A BOUND +/- PAIR CONSERVES ENERGY (orbit) ----------------------------------------------------------------
{
    const N = 2, masses = new Float64Array([1, 1]), q = new Float64Array([1, -1]);
    // give a transverse velocity so they orbit rather than collapse; energy = KE + Coulomb PE stays constant
    const pos = new Float64Array([0, 0, 0, 1.2, 0, 0]);
    const vel = new Float64Array([0, -0.3, 0, 0, 0.3, 0]);
    const forceFn = (p) => coulombForces(p, N, q, 1, 0);
    const state = { pos, vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    const E0 = kinetic(vel, masses) + state.pe;
    let maxD = 0;
    for (let s = 0; s < 5000; s++) { velocityVerlet(state, 0.002, forceFn); maxD = Math.max(maxD, Math.abs(kinetic(state.vel, masses) + state.pe - E0)); }
    ok("!! a bound +/- pair conserves energy under integration", maxD < 1e-2 * Math.abs(E0) + 1e-3,
       "an orbiting +/- pair over 5000 steps: energy drift " + maxD.toExponential(2) + " -- bounded. Coulomb composes with Verlet like the other forces.");
}

// ---- 6. DETERMINISTIC: NO TRANSCENDENTAL (sqrt ONLY) --------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "coulomb.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|cbrt|sinh|cosh|tanh|hypot)\b/;
    ok("!! Coulomb uses no transcendental (sqrt only)", !banned.test(src),
       "one sqrt for r, otherwise arithmetic -- deterministic across architectures.");
}

console.log(fails ? "\ncoulomb-selfcheck: " + fails + " FAILED" : "\ncoulomb-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
