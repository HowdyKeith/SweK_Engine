// WebGLEngine/physics/quantum/schrodinger1d-selfcheck.mjs -- v2822
//
// Run: node physics/quantum/schrodinger1d-selfcheck.mjs   (~0.1s)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/quantum/schrodinger1d.js -- the lab's first quantum instrument.
//
// FOUR INDEPENDENT EXACT KEYS, and the two spectra are the point:
//   SQUARE WELL       E_n = n^2 pi^2 / (2 m L^2)  -- levels go as n SQUARED, so the spacing WIDENS.
//   OSCILLATOR        E_n = (n + 1/2) omega       -- levels are EQUALLY SPACED, ground state at half a quantum.
//   These are OPPOSITE SHAPES from the SAME solver on the SAME grid. A solver tuned to reproduce one would
//   break the other, which is why both are gated together rather than either alone.
//   TUNNELLING        closed-form transmission through a rectangular barrier: nonzero below the top, where
//                     classical mechanics says exactly zero.
//   NORM              Crank-Nicolson is unitary by construction, so probability must total 1 forever. Measured
//                     drift is 1e-15 -- round-off, not tuning.
//
// The eigenvalues come from STURM SEQUENCE BISECTION on the tridiagonal Hamiltonian: counting how many
// eigenvalues lie below a trial energy is exact INTEGER arithmetic, so the only error in a level is the grid.

import { wellLevel, oscillatorLevel, barrierTransmission, hamiltonian, countBelow, eigenvalue, levels, squareWellLevels, oscillatorLevels, evolve, PI2 } from "./schrodinger1d.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. the closed forms are what they claim
{
    ok("well: E_1 = pi^2/2 for L=m=1", Math.abs(wellLevel(1, 1, 1) - PI2 / 2) < 1e-12);
    ok("well: E_n scales as n^2", Math.abs(wellLevel(3) / wellLevel(1) - 9) < 1e-12);
    ok("oscillator: ground state is half a quantum, not zero", oscillatorLevel(0, 1) === 0.5);
    ok("oscillator: levels are equally spaced", oscillatorLevel(3, 2) - oscillatorLevel(2, 2) === 2);
}

// 2. SQUARE WELL recovered from the grid
{
    const E = squareWellLevels({ L: 1, N: 800, count: 5 });
    let worst = 0;
    E.forEach((v, i) => { worst = Math.max(worst, Math.abs(v - wellLevel(i + 1)) / wellLevel(i + 1)); });
    ok("square well: five levels match n^2 pi^2 / 2", worst < 1e-4, "worst " + (worst * 100).toFixed(4) + "%");
    ok("square well: E2/E1 = 4 and E3/E1 = 9 (the n^2 signature)",
        Math.abs(E[1] / E[0] - 4) < 1e-3 && Math.abs(E[2] / E[0] - 9) < 1e-3, `${(E[1] / E[0]).toFixed(5)}, ${(E[2] / E[0]).toFixed(5)}`);
    ok("square well: SPACING WIDENS with n", (E[2] - E[1]) > (E[1] - E[0]) * 1.5);
}

// 3. HARMONIC OSCILLATOR from the SAME solver -- the opposite shape
{
    const E = oscillatorLevels({ omega: 1, N: 1200, span: 14, count: 5 });
    let worst = 0;
    E.forEach((v, n) => { worst = Math.max(worst, Math.abs(v - oscillatorLevel(n)) / oscillatorLevel(n)); });
    ok("oscillator: five levels match (n + 1/2) omega", worst < 1e-3, "worst " + (worst * 100).toFixed(4) + "%");
    const gaps = E.slice(1).map((v, i) => v - E[i]);
    const spread = Math.max(...gaps) - Math.min(...gaps);
    ok("oscillator: levels are EQUALLY SPACED (all gaps = omega)", spread < 1e-3 && Math.abs(gaps[0] - 1) < 1e-3, "gaps " + gaps.map((g) => g.toFixed(6)).join(", "));
    ok("oscillator: the ground state sits at half a quantum above the floor", Math.abs(E[0] - 0.5) < 1e-3, E[0].toFixed(6));
    // omega scaling: double the stiffness, double every gap
    const E2 = oscillatorLevels({ omega: 2, N: 1200, span: 14, count: 3 });
    ok("oscillator: doubling omega doubles the spacing", Math.abs((E2[1] - E2[0]) - 2) < 5e-3, (E2[1] - E2[0]).toFixed(6));
}

// 4. THE LOAD-BEARING CROSS-CHECK: one solver, two opposite spectra
{
    const w = squareWellLevels({ L: 1, N: 600, count: 4 });
    const o = oscillatorLevels({ omega: 1, N: 900, span: 14, count: 4 });
    const wGaps = w.slice(1).map((v, i) => v - w[i]);
    const oGaps = o.slice(1).map((v, i) => v - o[i]);
    const wWidens = wGaps.every((g, i) => i === 0 || g > wGaps[i - 1]);
    const oFlat = Math.max(...oGaps) - Math.min(...oGaps) < 1e-3;
    ok("SAME solver gives WIDENING gaps for the well and CONSTANT gaps for the oscillator", wWidens && oFlat,
        `well ${wGaps.map((g) => g.toFixed(1)).join("/")}  osc ${oGaps.map((g) => g.toFixed(4)).join("/")}`);
}

// 5. grid convergence -- a finer grid must be closer to the exact answer
{
    const coarse = Math.abs(squareWellLevels({ L: 1, N: 100, count: 1 })[0] - wellLevel(1)) / wellLevel(1);
    const fine = Math.abs(squareWellLevels({ L: 1, N: 1600, count: 1 })[0] - wellLevel(1)) / wellLevel(1);
    ok("finer grid gives a smaller error (discretisation, not a bug)", fine < coarse / 10, `N=100 ${(coarse * 100).toFixed(4)}% -> N=1600 ${(fine * 100).toFixed(6)}%`);
}

// 6. STURM COUNT mechanics -- the thing the whole eigensolver rests on
{
    const H = hamiltonian({ N: 50, L: 1, potential: () => 0 });
    ok("countBelow: zero eigenvalues below a very negative energy", countBelow(H.diag, H.off, -1e6) === 0);
    ok("countBelow: all N eigenvalues below a very positive energy", countBelow(H.diag, H.off, 1e9) === 50);
    ok("countBelow: monotone non-decreasing in energy", countBelow(H.diag, H.off, 100) <= countBelow(H.diag, H.off, 1000));
    const e0 = eigenvalue(H.diag, H.off, 0);
    ok("the k-th eigenvalue has exactly k eigenvalues below it", countBelow(H.diag, H.off, e0 - 1e-6) === 0 && countBelow(H.diag, H.off, e0 + 1e-6) === 1);
}

// 7. TUNNELLING -- the classically impossible part
{
    ok("below the barrier top, transmission is NONZERO (classically it is exactly zero)", barrierTransmission(0.2, 1, 1) > 0.1, barrierTransmission(0.2, 1, 1).toExponential(3));
    const seq = [0.2, 0.5, 0.9].map((E) => barrierTransmission(E, 1, 1));
    ok("transmission rises with energy below the top", seq[0] < seq[1] && seq[1] < seq[2], seq.map((t) => t.toFixed(4)).join(" < "));
    ok("a WIDER barrier transmits less", barrierTransmission(0.5, 1, 3) < barrierTransmission(0.5, 1, 0.5) / 10,
        `a=0.5 ${barrierTransmission(0.5, 1, 0.5).toFixed(4)} vs a=3 ${barrierTransmission(0.5, 1, 3).toExponential(2)}`);
    ok("at E = V0 the formula takes its algebraic limit rather than dividing by zero", Number.isFinite(barrierTransmission(1, 1, 1)) && barrierTransmission(1, 1, 1) > 0);
    ok("far above the barrier transmission approaches 1", barrierTransmission(50, 1, 1) > 0.95);
    ok("zero energy transmits nothing", barrierTransmission(0, 1, 1) === 0);
}

// 8. NORM CONSERVATION -- unitary by construction, so this is round-off not tuning
{
    const psi0 = (x) => { const g = Math.exp(-((x - 0.35) ** 2) / (2 * 0.05 * 0.05)); return [g * Math.cos(40 * x), g * Math.sin(40 * x)]; };
    const a = evolve({ N: 400, L: 1, dt: 2e-5, steps: 100, psi0 });
    const b = evolve({ N: 400, L: 1, dt: 2e-5, steps: 1200, psi0 });
    ok("norm is 1 after evolution", Math.abs(a.norm - 1) < 1e-10, a.norm.toFixed(14));
    ok("norm drift stays at round-off even after 12x the steps", b.normDrift < 1e-10, `100 steps ${a.normDrift.toExponential(2)} -> 1200 steps ${b.normDrift.toExponential(2)}`);
    ok("the wavefunction actually moved (the evolution is not a no-op)", b.re.some((v, i) => Math.abs(v - a.re[i]) > 1e-6));
}

// 9. SABOTAGE: the kinetic term carries the 1/dx^2. Drop it and the spectrum is nonsense, which proves the
// levels come from the discretised operator rather than from anything hard-coded.
{
    const N = 400, L = 1, dx = L / (N + 1);
    const tBad = 0.5;                                   // the hopping term WITHOUT 1/dx^2
    const diag = new Float64Array(N).fill(2 * tBad), off = new Float64Array(N - 1).fill(-tBad);
    const bad = eigenvalue(diag, off, 0);
    const good = squareWellLevels({ L, N, count: 1 })[0];
    ok("SABOTAGE: dropping 1/dx^2 from the kinetic term wrecks the spectrum", Math.abs(bad - wellLevel(1)) / wellLevel(1) > 0.5 && Math.abs(good - wellLevel(1)) / wellLevel(1) < 1e-3,
        `sabotaged ${bad.toExponential(3)} vs correct ${good.toFixed(4)} (exact ${wellLevel(1).toFixed(4)})`);
}

// 10. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./schrodinger1d.js", import.meta.url), "utf8");
    ok("schrodinger1d.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("schrodinger1d-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
