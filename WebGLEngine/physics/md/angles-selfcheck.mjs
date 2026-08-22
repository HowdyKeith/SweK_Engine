// WebGLEngine/physics/md/angles-selfcheck.mjs — v2643
//
// Run: node physics/md/angles-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// An angle force is checkable against symmetry: at the preferred angle it vanishes, and everywhere it must neither
// push the molecule sideways (no net force) nor spin it (no net torque), because the angle depends only on the
// molecule's internal shape. A finite-difference check confirms the analytic gradient matches the potential it
// claims to differentiate. Energy is conserved under integration, and the whole thing is transcendental-free.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { angleForces } from "./angles.js";
import { kinetic, velocityVerlet } from "./md.js";
import { combine } from "./bonds.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= t;

// a bent triatomic i-j-k, j at the vertex; preferred angle 104.5 deg
const cos0 = Math.cos(104.5 * Math.PI / 180);
const angles = [{ i: 0, j: 1, k: 2, kang: 40, cos0 }];
const bent = (deg) => {           // build positions with the given opening angle at j (in the xy-plane)
    const h = deg * Math.PI / 360; // half-angle
    return new Float64Array([Math.cos(h), Math.sin(h), 0, 0, 0, 0, Math.cos(h), -Math.sin(h), 0]);
};

// ---- 1. THE FORCE VANISHES AT THE PREFERRED ANGLE ----------------------------------------------------------------
{
    const f = angleForces(bent(104.5), 3, angles).forces;
    let mag = 0; for (let i = 0; i < 9; i++) mag += f[i] * f[i];
    ok("!! the angle force is zero at the preferred angle", near(Math.sqrt(mag), 0, 1e-9),
       "at 104.5 degrees the angle term produces no force -- the molecule sits at its equilibrium bend.");
}

// ---- 2. NO NET FORCE AND NO NET TORQUE (does not translate or spin the molecule) ----------------------------------
{
    const pos = bent(80), f = angleForces(pos, 3, angles).forces;    // away from equilibrium -> real forces
    const netF = [f[0] + f[3] + f[6], f[1] + f[4] + f[7], f[2] + f[5] + f[8]];
    // torque about the origin: sum r_a x F_a
    let tx = 0, ty = 0, tz = 0;
    for (let a = 0; a < 3; a++) {
        const rx = pos[3 * a], ry = pos[3 * a + 1], rz = pos[3 * a + 2], fx = f[3 * a], fy = f[3 * a + 1], fz = f[3 * a + 2];
        tx += ry * fz - rz * fy; ty += rz * fx - rx * fz; tz += rx * fy - ry * fx;
    }
    ok("!! the angle force has no net force and no net torque", near(netF[0], 0, 1e-9) && near(netF[1], 0, 1e-9) && near(netF[2], 0, 1e-9) && near(tx, 0, 1e-9) && near(ty, 0, 1e-9) && near(tz, 0, 1e-9),
       "net force ~0 and net torque ~0 -- an internal term cannot make the molecule drift or spin, only bend. This is the signature of a correct 3-body gradient.");
}

// ---- 3. THE ANALYTIC FORCE MATCHES A FINITE-DIFFERENCE OF THE POTENTIAL --------------------------------------------
{
    const pos = bent(70);
    const V = (p) => angleForces(p, 3, angles).pe;
    const ana = angleForces(pos, 3, angles).forces;
    const h = 1e-6; let worst = 0;
    for (let c = 0; c < 9; c++) {
        const pp = pos.slice(), pm = pos.slice(); pp[c] += h; pm[c] -= h;
        const numF = -(V(pp) - V(pm)) / (2 * h);   // F = -dV/dx
        worst = Math.max(worst, Math.abs(numF - ana[c]));
    }
    ok("!! the analytic force equals the numerical gradient of the potential", worst < 1e-5,
       "central-difference of V matches the coded force to " + worst.toExponential(1) + " -- the force really is minus the gradient of the potential it reports.");
}

// ---- 4. ENERGY CONSERVED WHILE THE MOLECULE BENDS ----------------------------------------------------------------
{
    const masses = new Float64Array([1, 1, 1]);
    const pos = bent(90), vel = new Float64Array([0, 0.1, 0, 0, 0, 0, 0, -0.1, 0]);
    const forceFn = (p) => angleForces(p, 3, angles);
    const state = { pos, vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    const E0 = kinetic(vel, masses) + state.pe;
    let maxD = 0;
    for (let s = 0; s < 4000; s++) { velocityVerlet(state, 0.003, forceFn); maxD = Math.max(maxD, Math.abs(kinetic(state.vel, masses) + state.pe - E0)); }
    ok("!! energy stays bounded as the angle oscillates", maxD < 1e-2 * Math.abs(E0) + 1e-4,
       "the bend oscillates for 4000 steps with energy drift " + maxD.toExponential(2) + " -- bounded, so the angle term composes cleanly with the integrator.");
}

// ---- 5. DETERMINISTIC: NO TRANSCENDENTAL (sqrt ONLY) --------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "angles.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|cbrt|sinh|cosh|tanh|hypot)\b/;
    ok("!! the angle term uses no transcendental (cosine-harmonic, sqrt only)", !banned.test(src),
       "no acos -- the cosine-harmonic form keeps it to dot products, magnitudes and one division, so the bend is bit-identical across architectures.");
}

console.log(fails ? "\nangles-selfcheck: " + fails + " FAILED" : "\nangles-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
