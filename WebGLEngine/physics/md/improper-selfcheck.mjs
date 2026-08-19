// WebGLEngine/physics/md/improper-selfcheck.mjs — v2648
//
// Run: node physics/md/improper-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The signed-volume restraint is checkable against geometry: it is zero when the four atoms are coplanar and its
// sign flips with chirality, its force pushes an out-of-plane atom back toward the plane, the analytic force equals
// minus the numerical gradient, and it neither translates nor spins the group. And it is transcendental-free -- in
// fact sqrt-free.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { improperForces } from "./improper.js";
import { kinetic, velocityVerlet } from "./md.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= t;
const imp = [{ i: 0, j: 1, k: 2, l: 3, kimp: 10, v0: 0 }];
// atoms j,k,l in the z=0 plane; i lifted by height h out of plane
const config = (h) => new Float64Array([0, 0, h, 1, 0, 0, 0, 1, 0, 0, 0, 0]);

// ---- 1. THE ENERGY IS ZERO WHEN COPLANAR, POSITIVE WHEN NOT --------------------------------------------------------
{
    const flat = improperForces(config(0), 4, imp).pe;
    const bent = improperForces(config(0.5), 4, imp).pe;
    ok("!! the restraint is zero when the four atoms are coplanar, positive otherwise", near(flat, 0, 1e-12) && bent > 0,
       "coplanar -> V=0; lifted out of plane -> V=" + bent.toFixed(3) + ">0. The signed volume vanishes in the plane.");
}

// ---- 2. THE FORCE PUSHES AN OUT-OF-PLANE ATOM BACK TOWARD THE PLANE ------------------------------------------------
{
    const f = improperForces(config(0.5), 4, imp).forces;   // atom 0 lifted +z -> force should be -z on it
    ok("!! the force restores an out-of-plane atom toward the plane", f[2] < 0,
       "atom 0 lifted to +z feels Fz=" + f[2].toFixed(3) + " < 0 -- pushed back down toward coplanarity.");
}

// ---- 3. CHIRALITY: THE SIGNED VOLUME FLIPS SIGN WHEN THE ATOM CROSSES THE PLANE ------------------------------------
{
    const impC = [{ i: 0, j: 1, k: 2, l: 3, kimp: 10, v0: 1 }];   // target a POSITIVE volume (a handedness)
    const up = improperForces(config(0.6), 4, impC).forces[2];    // above plane
    const down = improperForces(config(-0.6), 4, impC).forces[2]; // below plane (wrong handedness) -> pushed harder up
    ok("!! a nonzero target volume enforces a handedness", down > 0 && down > Math.abs(up),
       "with target volume +1, the atom on the wrong side (below) feels a strong restoring Fz=" + down.toFixed(2) + " up -- chirality is held, not just planarity.");
}

// ---- 4. ANALYTIC FORCE EQUALS -GRAD V (finite difference) ---------------------------------------------------------
{
    const pos = new Float64Array([0.2, 0.3, 0.5, 1.1, -0.2, 0.1, -0.1, 1.2, -0.3, 0.05, 0.1, 0.2]);
    const V = (pp) => improperForces(pp, 4, imp).pe;
    const ana = improperForces(pos, 4, imp).forces;
    const h = 1e-6; let worst = 0;
    for (let c = 0; c < 12; c++) { const pp = pos.slice(), pm = pos.slice(); pp[c] += h; pm[c] -= h; worst = Math.max(worst, Math.abs(-(V(pp) - V(pm)) / (2 * h) - ana[c])); }
    ok("!! the analytic force equals minus the numerical gradient", worst < 1e-5,
       "central-difference matches the coded force to " + worst.toExponential(1) + " -- the cross-product gradient of the triple product is correct.");
}

// ---- 5. NO NET FORCE, NO NET TORQUE, ENERGY CONSERVED -------------------------------------------------------------
{
    const pos = config(0.4), masses = new Float64Array([1, 1, 1, 1]);
    const f = improperForces(pos, 4, imp).forces;
    const nf = [f[0] + f[3] + f[6] + f[9], f[1] + f[4] + f[7] + f[10], f[2] + f[5] + f[8] + f[11]];
    let tx = 0, ty = 0, tz = 0;
    for (let a = 0; a < 4; a++) { const rx = pos[3 * a], ry = pos[3 * a + 1], rz = pos[3 * a + 2]; tx += ry * f[3 * a + 2] - rz * f[3 * a + 1]; ty += rz * f[3 * a] - rx * f[3 * a + 2]; tz += rx * f[3 * a + 1] - ry * f[3 * a]; }
    const forceFn = (pp) => improperForces(pp, 4, imp);
    const vel = new Float64Array(12); vel[2] = 0.15;
    const state = { pos: pos.slice(), vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    const E0 = kinetic(vel, masses) + state.pe; let maxD = 0;
    for (let s = 0; s < 3000; s++) { velocityVerlet(state, 0.003, forceFn); maxD = Math.max(maxD, Math.abs(kinetic(state.vel, masses) + state.pe - E0)); }
    ok("!! no net force, no net torque, and energy conserved", nf.every((v) => near(v, 0, 1e-9)) && near(tx, 0, 1e-9) && near(ty, 0, 1e-9) && near(tz, 0, 1e-9) && maxD < 1e-2 * Math.abs(E0) + 1e-3,
       "net force and torque ~0, energy drift " + maxD.toExponential(2) + " over 3000 steps -- an internal restraint that conserves everything it should.");
}

// ---- 6. DETERMINISTIC: NO TRANSCENDENTAL, NO SQRT -----------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "improper.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|sqrt|cbrt|sinh|cosh|tanh|hypot)\b/;
    ok("!! the improper uses only dot and cross products (no sqrt, no transcendental)", !banned.test(src),
       "the triple product and its gradient are pure multiply-add -- the most exactly deterministic term in the whole force field.");
}

console.log(fails ? "\nimproper-selfcheck: " + fails + " FAILED" : "\nimproper-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
