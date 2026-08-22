// WebGLEngine/physics/md/dihedrals-selfcheck.mjs — v2647
//
// Run: node physics/md/dihedrals-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A 4-body torsion force is the easiest place in MD to slip a sign, so the gate's spine is a finite-difference
// check: the analytic force must equal minus the numerical gradient of the potential, at several multiplicities and
// several geometries. Around it: the Chebyshev cos(n phi) must equal the true cosine at known angles, the force
// must have no net force and no net torque (it only twists), energy is conserved under integration, and the term is
// transcendental-free.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dihedralForces } from "./dihedrals.js";
import { kinetic, velocityVerlet } from "./md.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= t;

// place 4 atoms i-j-k-l with a given dihedral angle phi (degrees) about the j-k axis along x
const geom = (phiDeg) => {
    const p = phiDeg * Math.PI / 180;
    // i and l are off the j-k (x) axis; rotating l's transverse direction by phi sets the dihedral
    return new Float64Array([
        0, 1, 0,          // i
        1, 0, 0,          // j
        2, 0, 0,          // k
        3, Math.cos(p), Math.sin(p),   // l
    ]);
};

// ---- 1. THE ANALYTIC FORCE EQUALS -GRAD V (finite difference), across multiplicities -------------------------------
{
    let worst = 0;
    for (const n of [1, 2, 3]) {
        const dih = [{ i: 0, j: 1, k: 2, l: 3, kd: 1.5, n }];
        for (const phi of [20, 55, 110, 200, 300]) {
            const pos = geom(phi);
            const V = (pp) => dihedralForces(pp, 4, dih).pe;
            const ana = dihedralForces(pos, 4, dih).forces;
            const h = 1e-6;
            for (let c = 0; c < 12; c++) {
                const pp = pos.slice(), pm = pos.slice(); pp[c] += h; pm[c] -= h;
                const num = -(V(pp) - V(pm)) / (2 * h);
                worst = Math.max(worst, Math.abs(num - ana[c]));
            }
        }
    }
    ok("!! the analytic torsion force equals minus the gradient of the potential", worst < 1e-4,
       "central-difference vs coded force across n=1,2,3 and five angles: worst mismatch " + worst.toExponential(1) + ". THE 4-BODY FORCE REALLY DIFFERENTIATES ITS OWN POTENTIAL -- no sign slipped.");
}

// ---- 2. CHEBYSHEV cos(n phi) MATCHES THE TRUE COSINE --------------------------------------------------------------
{
    // the potential at phi with gamma=0 is k(1 + cos(n phi)); read it back and compare to the analytic cosine
    let worst = 0;
    for (const n of [1, 2, 3, 4]) for (const phi of [15, 47, 133, 265]) {
        const pe = dihedralForces(geom(phi), 4, [{ i: 0, j: 1, k: 2, l: 3, kd: 1, n }]).pe;   // = 1 + cos(n phi)
        const truth = 1 + Math.cos(n * phi * Math.PI / 180);
        worst = Math.max(worst, Math.abs(pe - truth));
    }
    ok("!! the Chebyshev cos(n phi) equals the true cosine", worst < 1e-9,
       "T_n(cos phi) reproduces cos(n phi) to " + worst.toExponential(1) + " for n up to 4 -- the multiply-only recurrence is exact, no library trig needed.");
}

// ---- 3. NO NET FORCE AND NO NET TORQUE ---------------------------------------------------------------------------
{
    const dih = [{ i: 0, j: 1, k: 2, l: 3, kd: 2, n: 2 }];
    const pos = geom(75), f = dihedralForces(pos, 4, dih).forces;
    const netF = [0, 0, 0]; for (let a = 0; a < 4; a++) for (let c = 0; c < 3; c++) netF[c] += f[3 * a + c];
    let tx = 0, ty = 0, tz = 0;
    for (let a = 0; a < 4; a++) {
        const rx = pos[3 * a], ry = pos[3 * a + 1], rz = pos[3 * a + 2], fx = f[3 * a], fy = f[3 * a + 1], fz = f[3 * a + 2];
        tx += ry * fz - rz * fy; ty += rz * fx - rx * fz; tz += rx * fy - ry * fx;
    }
    ok("!! the torsion force has no net force and no net torque", netF.every((v) => near(v, 0, 1e-9)) && near(tx, 0, 1e-9) && near(ty, 0, 1e-9) && near(tz, 0, 1e-9),
       "net force and net torque both ~0 -- a torsion twists the molecule about the bond but cannot make it fly or spin as a whole.");
}

// ---- 4. ENERGY CONSERVED WHILE THE TORSION OSCILLATES ------------------------------------------------------------
{
    const dih = [{ i: 0, j: 1, k: 2, l: 3, kd: 1.5, n: 3 }];
    const masses = new Float64Array([1, 1, 1, 1]);
    const pos = geom(40), vel = new Float64Array(12); vel[11] = 0.2; vel[2] = -0.2;
    const forceFn = (pp) => dihedralForces(pp, 4, dih);
    const state = { pos, vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    const E0 = kinetic(vel, masses) + state.pe;
    let maxD = 0;
    for (let s = 0; s < 4000; s++) { velocityVerlet(state, 0.003, forceFn); maxD = Math.max(maxD, Math.abs(kinetic(state.vel, masses) + state.pe - E0)); }
    ok("!! energy stays bounded as the torsion twists", maxD < 1e-2 * Math.abs(E0) + 1e-3,
       "the torsion oscillates for 4000 steps with energy drift " + maxD.toExponential(2) + " -- composes with the integrator like the other terms.");
}

// ---- 5. DETERMINISTIC: NO TRANSCENDENTAL (Chebyshev + sqrt only) --------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "dihedrals.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|cbrt|sinh|cosh|tanh|hypot)\b/;
    ok("!! the torsion uses no library trig (Chebyshev recurrence + sqrt)", !banned.test(src),
       "no cos, no atan2 -- cos(n phi) and sin(n phi) come from a multiply-only recurrence on the geometry, so the torsion is bit-identical across architectures.");
}

console.log(fails ? "\ndihedrals-selfcheck: " + fails + " FAILED" : "\ndihedrals-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
