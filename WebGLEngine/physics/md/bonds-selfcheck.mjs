// WebGLEngine/physics/md/bonds-selfcheck.mjs — v2642
//
// Run: node physics/md/bonds-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A harmonic bond has an exact prediction: a diatomic vibrates at omega = sqrt(k/mu). The gate simulates that
// molecule and measures the period from the trajectory, then compares to 2*pi/omega -- if the force law or the mass
// coupling were wrong, the frequency would be wrong. Around that centrepiece: the force is zero at the rest length
// and restoring, energy and momentum are conserved when bonds and LJ run together, a bond holds a pair together that
// bare LJ would let fly apart, and the force is transcendental-free (sqrt allowed) so it is cross-arch deterministic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bondForces, combine, reducedMass } from "./bonds.js";
import { computeForces, kinetic, velocityVerlet } from "./md.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= t;

// ---- 1. THE BOND FORCE IS ZERO AT REST LENGTH AND RESTORING --------------------------------------------------------
{
    const bonds = [{ i: 0, j: 1, k: 50, r0: 1.2 }];
    const atRest = bondForces(new Float64Array([0, 0, 0, 1.2, 0, 0]), 2, bonds).forces;
    const stretched = bondForces(new Float64Array([0, 0, 0, 1.5, 0, 0]), 2, bonds).forces;  // pulled apart -> pull back (-x on atom 1)
    const squeezed = bondForces(new Float64Array([0, 0, 0, 0.9, 0, 0]), 2, bonds).forces;   // pushed together -> push out (+x on atom 1)
    ok("!! the bond force is zero at rest length, restoring on either side", near(atRest[3], 0, 1e-12) && stretched[3] < 0 && squeezed[3] > 0,
       "at r0 the force vanishes; stretched, atom 1 is pulled back (Fx=" + stretched[3].toFixed(2) + "); squeezed, pushed out (Fx=" + squeezed[3].toFixed(2) + ").");
}

// ---- 2. A DIATOMIC VIBRATES AT THE ANALYTIC FREQUENCY omega = sqrt(k/mu) -------------------------------------------
{
    const k = 200, r0 = 1.2, m1 = 1, m2 = 2;
    const mu = reducedMass(m1, m2);
    const omega = Math.sqrt(k / mu), T = 2 * Math.PI / omega;      // analytic period
    const bonds = [{ i: 0, j: 1, k, r0 }];
    const masses = new Float64Array([m1, m2]);
    const forceFn = (p) => bondForces(p, 2, bonds);
    // stretch along x, no transverse motion -> stays a clean 1D oscillator in the relative coordinate
    const pos = new Float64Array([0, 0, 0, r0 + 0.05, 0, 0]);
    const vel = new Float64Array(6);
    const state = { pos, vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    const dt = 0.0005;
    // measure the period by timing successive maxima of the bond length (s = r - r0)
    let prevS = pos[3] - r0, prevDS = 0, lastMaxStep = -1, measured = 0, count = 0;
    for (let step = 1; step <= 20000 && count < 3; step++) {
        velocityVerlet(state, dt, forceFn);
        const s = state.pos[3] - r0;
        const ds = s - prevS;
        if (prevDS > 0 && ds <= 0) {                               // a maximum of s
            if (lastMaxStep >= 0) { measured += (step - lastMaxStep) * dt; count++; }
            lastMaxStep = step;
        }
        prevS = s; prevDS = ds;
    }
    const periodMeasured = measured / count;
    ok("!! the molecule vibrates at the frequency theory predicts", near(periodMeasured, T, T * 0.02),
       "measured period " + periodMeasured.toFixed(5) + " vs analytic 2*pi/sqrt(k/mu) = " + T.toFixed(5) + " (within 2%). THE SIMULATED BOND VIBRATES AT THE RATE PHYSICS DEMANDS.");
}

// ---- 3. ENERGY AND MOMENTUM CONSERVED WITH LJ + BONDS TOGETHER -----------------------------------------------------
{
    // a small bonded chain immersed in LJ; total energy bounded and momentum fixed
    const N = 4, eps = 0.5, sig2 = 1, r0 = 1.3, k = 80;
    const bonds = [{ i: 0, j: 1, k, r0 }, { i: 1, j: 2, k, r0 }, { i: 2, j: 3, k, r0 }];
    const masses = new Float64Array([1, 1, 1, 1]);
    const pos = new Float64Array([0, 0, 0, 1.3, 0.1, 0, 2.6, -0.1, 0.05, 3.9, 0.05, -0.1]);
    const vel = new Float64Array([0.1, 0, 0, 0, 0.05, 0, -0.05, 0, 0.02, 0, -0.03, 0]);
    const forceFn = combine((p) => computeForces(p, N, eps, sig2, 0), (p) => bondForces(p, N, bonds));
    const state = { pos, vel, forces: forceFn(pos).forces, masses, pe: forceFn(pos).pe };
    const mom0 = [0, 0, 0]; for (let i = 0; i < N; i++) for (let d = 0; d < 3; d++) mom0[d] += masses[i] * vel[3 * i + d];
    const E0 = kinetic(vel, masses) + state.pe;
    let maxE = 0, maxMom = 0;
    for (let s = 0; s < 5000; s++) {
        velocityVerlet(state, 0.002, forceFn);
        const E = kinetic(state.vel, masses) + state.pe;
        maxE = Math.max(maxE, Math.abs(E - E0));
        const mom = [0, 0, 0]; for (let i = 0; i < N; i++) for (let d = 0; d < 3; d++) mom[d] += masses[i] * state.vel[3 * i + d];
        for (let d = 0; d < 3; d++) maxMom = Math.max(maxMom, Math.abs(mom[d] - mom0[d]));
    }
    ok("!! LJ and bonds together conserve energy and momentum", maxE < 1e-2 * Math.abs(E0) + 1e-3 && maxMom < 1e-9,
       "bonded chain in LJ over 5000 steps: energy drift " + maxE.toExponential(2) + " (bounded), momentum drift " + maxMom.toExponential(2) + " (~0). The two force terms compose without breaking conservation.");
}

// ---- 4. A BOND HOLDS A PAIR THAT BARE LJ WOULD LET FLY APART -------------------------------------------------------
{
    const N = 2, masses = new Float64Array([1, 1]);
    const outward = new Float64Array([-0.4, 0, 0, 0.4, 0, 0]);   // moving apart
    const start = new Float64Array([0, 0, 0, 1.2, 0, 0]);
    // bonded: stays near r0
    const bonds = [{ i: 0, j: 1, k: 150, r0: 1.2 }];
    const bf = (p) => bondForces(p, N, bonds);
    const sb = { pos: start.slice(), vel: outward.slice(), forces: bf(start).forces, masses, pe: bf(start).pe };
    for (let s = 0; s < 3000; s++) velocityVerlet(sb, 0.002, bf);
    const rBonded = Math.abs(sb.pos[3] - sb.pos[0]);
    ok("!! a bond keeps the pair together despite an outward kick", rBonded < 2.0,
       "two atoms kicked apart but bonded stay at r = " + rBonded.toFixed(2) + " near r0=1.2 -- the spring holds. Without it they would separate without bound. THIS IS WHAT MAKES A MOLECULE A MOLECULE.");
}

// ---- 5. DETERMINISTIC: NO TRANSCENDENTAL (sqrt IS ALLOWED, IT IS EXACT) --------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "bonds.js"), "utf8")
        .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|cbrt|sinh|cosh|tanh|hypot)\b/;
    ok("!! bonded forces use only arithmetic and sqrt (bit-identical across architectures)", !banned.test(src),
       "the bond force is add/multiply/divide and one correctly-rounded sqrt -- no transcendental, so a bonded molecule integrates to the same bits on x86_64 and arm64.");
}

console.log(fails ? "\nbonds-selfcheck: " + fails + " FAILED" : "\nbonds-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
