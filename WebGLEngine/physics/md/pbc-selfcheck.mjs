// WebGLEngine/physics/md/pbc-selfcheck.mjs — v3285
//
// Run: node physics/md/pbc-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Periodic boundaries are the layer every transport measurement needs, and they are the layer where a sign
// error hides best: a system with a wrapping bug runs, looks like a fluid, conserves nothing it is not asked
// about, and reports a density that is off by whatever fraction of the box is surface.
//
// The first key is the one worth having: minimum image is a SHORTCUT for a lattice sum, so it is checked against
// an explicit 3x3x3 image sum that contains no shortcut. Two mechanisms inside one device -- the consistency
// board's admission rule applied locally.

import { velocityVerlet, kinetic } from "./md.js";
import { makeBox, minimumImage, wrap, wrapAll, computeForcesPBC, computeForcesImages, wrapWRONG,
         pressure, makeFluid, totalMomentum } from "./pbc.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const EPS = 1, SIG2 = 1;

// ---- 1. THE INEQUALITY THAT MAKES MINIMUM IMAGE VALID IS ENFORCED, NOT ASSUMED --------------------------------
{
    let threw = false;
    try { makeBox({ L: 8, cutoff: 4 }); } catch { threw = true; }
    ok("!! a cutoff of L/2 or more is REFUSED at construction (past it a pair has two images inside the cutoff)",
       threw, "minimum image is only equivalent to the lattice sum when r_c < L/2, and a box that breaks it would quietly stop meaning what it says");
    ok("...and a valid box is accepted", makeBox({ L: 8, cutoff: 3 }).cutoff2 === 9);
    ok("minimumImage picks the nearest image on each axis",
       minimumImage(7.5, 8) === -0.5 && minimumImage(-7.5, 8) === 0.5 && minimumImage(1, 8) === 1);
    ok("wrap folds into [0, L) for both signs", wrap(-0.5, 8) === 7.5 && wrap(8.5, 8) === 0.5 && wrap(0, 8) === 0);
}

// ---- 2. THE KEY: MINIMUM IMAGE == AN EXPLICIT IMAGE SUM, TO MACHINE PRECISION -----------------------------------
{
    const box = makeBox({ L: 8, cutoff: 3 });
    const f = makeFluid({ n: 3, L: 8, kT: 1.0, seed: 5 });
    const a = computeForcesPBC(f.pos, f.N, EPS, SIG2, box);
    const b = computeForcesImages(f.pos, f.N, EPS, SIG2, box, { shell: 1 });
    let worstF = 0;
    for (let k = 0; k < 3 * f.N; k++) worstF = Math.max(worstF, Math.abs(a.forces[k] - b.forces[k]));
    ok("!! minimum image reproduces an EXPLICIT 3x3x3 image sum, force for force, at machine precision",
       worstF < 1e-12, "worst force component diff " + worstF.toExponential(2) + " over " + (3 * f.N) + " components — the shortcut and the brute-force route are the same physics");
    ok("!! ...and the same for potential energy and virial (the shortcut is not merely close on one observable)",
       Math.abs(a.pe - b.pe) < 1e-12 && Math.abs(a.virial - b.virial) < 1e-12,
       "pe " + a.pe.toFixed(9) + " vs " + b.pe.toFixed(9) + ", virial " + a.virial.toFixed(6) + " vs " + b.virial.toFixed(6));
    // widening the shell must change nothing: everything beyond the first shell is outside the cutoff
    const c = computeForcesImages(f.pos, f.N, EPS, SIG2, box, { shell: 2 });
    ok("...and a 5x5x5 shell adds nothing, because r_c < L/2 means the second shell cannot reach",
       Math.abs(a.pe - c.pe) < 1e-12, "the inequality doing its job, measured rather than argued");
}

// ---- 3. MOMENTUM IS CONSERVED EXACTLY, NOT TO TOLERANCE ---------------------------------------------------------
{
    const box = makeBox({ L: 8, cutoff: 3 });
    const f = makeFluid({ n: 3, L: 8, kT: 1.2, seed: 11 });
    const state = { pos: f.pos, vel: f.vel, masses: f.masses, forces: computeForcesPBC(f.pos, f.N, EPS, SIG2, box).forces };
    const p0 = totalMomentum(state.vel, state.masses);
    for (let s = 0; s < 400; s++) {
        velocityVerlet(state, 0.004, (pos) => computeForcesPBC(wrapAll(pos, f.N, box.L), f.N, EPS, SIG2, box));
    }
    const p1 = totalMomentum(state.vel, state.masses);
    const drift = Math.max(...p1.map((x, i) => Math.abs(x - p0[i])));
    ok("!! total momentum does not drift across 400 steps and many boundary crossings",
       drift < 1e-12, "worst component drift " + drift.toExponential(2) + " — every pair force is applied equal and opposite, so this is arithmetic, not a tolerance");
}

// ---- 4. ENERGY ACROSS WRAPS, AND THE CUTOFF SHIFT THIS CHECK FORCED INTO EXISTENCE ------------------------------
// The first version of this check measured 0.354% at dt=0.008 and 0.355% at dt=0.004 -- a flat null result that
// looked like a broken convergence test and was a broken POTENTIAL. Truncating LJ at r_c without shifting leaves
// a step of u(r_c) = -5.479e-3, and ~80 pairs sit within 0.4 sigma of the cutoff at any moment, so the energy
// wanders by an amount no timestep can touch. Both settings are measured here, because the contrast IS the
// finding and deleting the failing configuration would have deleted the evidence.
{
    const box = makeBox({ L: 8, cutoff: 3 });
    const run = (dt, steps, shift) => {
        const f = makeFluid({ n: 3, L: 8, kT: 0.8, seed: 3 });
        const state = { pos: f.pos, vel: f.vel, masses: f.masses, forces: computeForcesPBC(f.pos, f.N, EPS, SIG2, box, { shift }).forces };
        const e0 = kinetic(state.vel, state.masses) + computeForcesPBC(state.pos, f.N, EPS, SIG2, box, { shift }).pe;
        let worst = 0, crossings = 0;
        for (let s = 0; s < steps; s++) {
            const before = state.pos.slice();
            velocityVerlet(state, dt, (pos) => computeForcesPBC(wrapAll(pos, f.N, box.L), f.N, EPS, SIG2, box, { shift }));
            for (let k = 0; k < before.length; k++) if (Math.abs(state.pos[k] - before[k]) > box.L / 2) crossings++;
            const e = kinetic(state.vel, state.masses) + computeForcesPBC(state.pos, f.N, EPS, SIG2, box, { shift }).pe;
            worst = Math.max(worst, Math.abs(e - e0) / Math.abs(e0));
        }
        return { worst, crossings };
    };
    const coarse = run(0.008, 250, true), fine = run(0.004, 500, true), finer = run(0.002, 1000, true);
    ok("!! with the shifted potential, energy is conserved across hundreds of boundary crossings",
       fine.worst < 0.001 && fine.crossings > 0,
       "worst relative excursion " + (fine.worst * 100).toFixed(4) + "% over 500 steps with " + fine.crossings + " wraps");
    const r1 = coarse.worst / fine.worst, r2 = fine.worst / finer.worst;
    ok("!! ...and halving the timestep quarters it: SECOND ORDER, so what remains is the integrator and not a leak",
       r1 > 3 && r1 < 6 && r2 > 3 && r2 < 6,
       "ratios " + r1.toFixed(2) + " and " + r2.toFixed(2) + " against the expected 4.00 (" +
       (coarse.worst * 100).toFixed(4) + "% -> " + (fine.worst * 100).toFixed(4) + "% -> " + (finer.worst * 100).toFixed(4) + "%)");
    const uc = run(0.008, 250, false), uf = run(0.004, 500, false);
    ok("!! and UNSHIFTED it does not converge at all — the null result that diagnosed the potential",
       Math.abs(uc.worst / uf.worst - 1) < 0.1 && uf.worst > fine.worst * 20,
       "unshifted " + (uc.worst * 100).toFixed(4) + "% -> " + (uf.worst * 100).toFixed(4) + "% (ratio " + (uc.worst / uf.worst).toFixed(2) +
       ", not 4) — a cutoff step is not integrator error, and no timestep can reach it");
}

// ---- 5. THE IDEAL-GAS LIMIT OF THE VIRIAL PRESSURE ------------------------------------------------------------------
// The first version diluted from a box where the nearest neighbour already sat BEYOND the cutoff, so the virial
// was exactly zero at every density and PV/NkT read 1.0000 three times: a test that could not fail. It now
// starts dense enough for the interaction term to matter.
{
    const kT = 1.5;
    const rows = [];
    for (const L of [4.5, 6.5, 11, 20]) {
        const box = makeBox({ L, cutoff: Math.min(2.2, L / 2 - 0.05) });
        const f = makeFluid({ n: 3, L, kT, seed: 9 });
        const { virial } = computeForcesPBC(f.pos, f.N, EPS, SIG2, box);
        const P = pressure({ N: f.N, kT, virial, box });
        rows.push({ density: f.N / box.volume, ratio: P * box.volume / (f.N * kT) });
    }
    const dense = Math.abs(rows[0].ratio - 1), dilute = Math.abs(rows[rows.length - 1].ratio - 1);
    ok("!! the dense box is measurably NOT an ideal gas (so the limit below is approached, not assumed)",
       dense > 0.05, "rho=" + rows[0].density.toFixed(3) + ": PV/NkT=" + rows[0].ratio.toFixed(4));
    ok("!! ...and as density falls the virial term vanishes and PV/NkT -> 1",
       dilute < 0.02 && dilute < dense / 5,
       rows.map((r) => "rho=" + r.density.toFixed(4) + ": " + r.ratio.toFixed(4)).join(", ") +
       " — a closed form the code never contains, approached from data");
}

// ---- 6. SABOTAGE: WRAP THE POSITIONS, FORGET THE MINIMUM IMAGE ---------------------------------------------------------
{
    const box = makeBox({ L: 8, cutoff: 3 });
    const f = makeFluid({ n: 3, L: 8, kT: 1.0, seed: 5 });
    // move one atom just across the boundary: physically it has not moved at all
    // THE FIRST VERSION DID NOT ACTUALLY CROSS ANYTHING: makeFluid puts the first atom at 1.33 and shifting it
    // by 0.3 left it at 1.03, nowhere near a boundary, so the difference measured was just a moved atom. Put it
    // genuinely at the edge, where the nearest images of its neighbours are across the wall.
    const shifted = f.pos.slice();
    shifted[0] = 0.05; shifted[1] = 0.05; shifted[2] = 0.05;
    const good = computeForcesPBC(shifted, f.N, EPS, SIG2, box);
    const bad = wrapWRONG(shifted, f.N, EPS, SIG2, box);
    let worst = 0;
    for (let k = 0; k < 3 * f.N; k++) worst = Math.max(worst, Math.abs(good.forces[k] - bad.forces[k]));
    ok("!! dropping minimum image while still wrapping positions changes the forces (detection power, measured)",
       worst > 0.01, "worst force difference " + worst.toFixed(4) +
       " (tol 0.01 EARNED: the agreement floor between two faithful routes is 7e-17, so this is fourteen orders above noise)" + " — the atom crossed a boundary and became a box-width from its neighbours; nothing throws, nothing looks wrong, and it is not the same system");
    ok("...and it loses energy too, so the damage is not confined to one observable",
       Math.abs(good.pe - bad.pe) > 0.01, "pe " + good.pe.toFixed(4) + " vs " + bad.pe.toFixed(4));
}

// ---- 7. determinism -------------------------------------------------------------------------------------------------
{
    const box = makeBox({ L: 8, cutoff: 3 });
    const a = computeForcesPBC(makeFluid({ n: 3, L: 8, seed: 21 }).pos, 27, EPS, SIG2, box);
    const b = computeForcesPBC(makeFluid({ n: 3, L: 8, seed: 21 }).pos, 27, EPS, SIG2, box);
    ok("seeded configurations give bit-identical forces (a failure reproduces)", a.pe === b.pe && a.virial === b.virial);
}

console.log(fails ? ("[pbc-selfcheck] FAILED " + fails) : "[pbc-selfcheck] all passed");
process.exit(fails ? 1 : 0);
