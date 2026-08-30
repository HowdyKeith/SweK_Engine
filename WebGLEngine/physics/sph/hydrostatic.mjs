// WebGLEngine/physics/sph/hydrostatic.mjs -- v2881
//
// CAN THE FLUID HOLD UP A COLUMN OF ITS OWN WATER?
//
// physicsSuite has carried this since v2494, in its own words: "THE SPH BACKEND PASSES 3 GREEN GATES AND CANNOT
// HOLD UP A COLUMN OF WATER. v2484 tested kernels, momentum and density -- never WEIGHT. The fix is a proper
// equation of state (Tait, gamma = 7) and is a round of its own; RECORDED, NOT FAKED."
//
// This is that round. It did not go the way the note predicted, and both halves of that are recorded here.
//
// THE ANSWER KEY: a column at rest under gravity must STAY A COLUMN. Hydrostatic pressure rises linearly with
// depth, p = rho0 * g * h, and the fluid either supports that or it does not. Height retention is the blunt
// observable and it is the right one: a solver that cannot sit still cannot be trusted to move.
"use strict";
import { createSphWorld, REFERENCE_WALK } from "./sph.js";

/** A packed column. Returns the world plus the density its packing ACTUALLY produces, which is the whole story. */
// v3541 -- `viscosity` AND `gamma` WERE NOT IN THIS SIGNATURE AND THE OMISSION WAS SILENT. viscosity was
// hardcoded to 0.1 below and gamma was never mentioned at all, so a caller sweeping either got the DEFAULT on
// every run and read EXACTLY ZERO MOVEMENT. Under tait, gamma is a live knob (2.8e-1 relative movement in a
// box the fluid does not touch) and it would have been registered VACUOUS on that evidence. That is kepler's
// dead `mu` (v3517) in the fluid: INVARIANT BECAUSE UNREAD, with the register about to record the wrong
// reason. Both are now parameters; THE DEFAULTS ARE UNCHANGED, so every existing row is bit-identical, and
// materialKnobs-selfcheck asserts that by passing the defaults explicitly and demanding the same opts back.
// *** v3845 -- `surfacePacking` DEFAULTS FALSE AND EXISTS SO A PLANT CAN SIT ON THE INTERIOR FILTER BELOW,
// WHICH IS THE ONE JUDGEMENT THIS PROBE MAKES. *** An SPH density estimate is a kernel sum over neighbours, so
// a particle AT THE SURFACE has only half a neighbourhood and reads LOW -- not because the packing is looser
// there, but because the support is truncated. Averaging over all 686 particles instead of the 441 interior
// ones therefore reports the SURFACE DEFICIT as if it were the lattice's density. THE CANONICAL SPH MISTAKE,
// and this file's entire recorded history (v2484 / v2494 / v2881 / v2883) is about getting rho0 right.
// Every existing row is unchanged at the default.
// v4121 -- *** THIS FIXTURE PINS THE BRUTE-FORCE NEIGHBOUR WALK, AND THE REASON IS A REAL FAILURE. ***
// v4121 rewrote spatialGrid.js to index cells directly instead of hashing into a Map, which made the grid win
// at every size ever measured and dropped GRID_CROSSOVER from 1000 to 128. Every world built at 686 particles
// therefore SWITCHED PATH -- and materialKnobs-selfcheck went red. Not by much, and not because the grid is
// wrong: spatialGrid-selfcheck puts the two walks within 1.4e-14 on density and at ZERO drift over 60 steps.
//
// The cause is that this fixture's SHIPPED configuration is the deliberately UNSTABLE one -- physics/sph/
// settling.mjs records that its mechanical energy per particle QUADRUPLES over 2000 steps -- and an exploding
// system amplifies a 1e-14 change in summation order until it flips a sensitivity ORDERING that census()
// reports at the 8.4e-4 scale. The claim was never wrong, but it is a claim about one trajectory, and a
// trajectory of an unstable system is not reproducible across neighbour orders.
//
// So the fixture pins the walk its baselines were taken with, rather than the baselines being re-cut against a
// new one. That keeps every answer key built on makeColumn exactly as measured, and it is honest about what is
// being preserved: the ORDER OF A SUM, not a property of the fluid. Callers that want the fast path pass
// useGrid explicitly; the flesh and everything outside these fixtures get it by default.
export function makeColumn({ eos = "ideal", restDensity = null, soundSpeed = null, spacing = 0.05,
                             nx = 7, ny = 14, nz = 7, h = 0.1, mass = 0.02, stiffness = 8,
                             viscosity = 0.1, gamma = 7, surfacePacking = false,
                             useGrid = REFERENCE_WALK.useGrid } = {}) {
    // Measure the packing's density with gravity OFF before deciding anything.
    const probe = createSphWorld({ h, mass, restDensity: 1, gravity: [0, 0, 0] });
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++)
        probe.addParticle([0.15 + i * spacing, 0.05 + j * spacing, 0.15 + k * spacing]);
    probe.computeDensity();
    // v3845 -- the plant drops the interior filter. INTERIOR ONLY is the shipped, correct estimate.
    const sample = surfacePacking ? probe.particles : probe.particles.filter((p) => p.y > 0.15 && p.y < 0.6);
    const interior = sample.map((p) => p.rho);
    const packed = interior.reduce((a, b) => a + b, 0) / Math.max(1, interior.length);

    const rho0 = restDensity == null ? packed : restDensity;
    // useGrid is threaded through explicitly (default false) -- see the note above makeColumn. The baselines
    // built on this fixture were taken with the brute-force walk, and its shipped configuration is unstable
    // enough that a change of summation order moves them.
    const opts = { h, mass, restDensity: rho0, stiffness, viscosity, gravity: [0, -9.81, 0], eos, gamma, useGrid };
    if (eos === "tait") opts.soundSpeed = soundSpeed || 15;
    const w = createSphWorld(opts);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++)
        w.addParticle([0.15 + i * spacing, 0.05 + j * spacing, 0.15 + k * spacing]);
    return { world: w, packedDensity: packed, restDensity: rho0 };
}

export const BOX = [0, 0, 0, 0.6, 1.2, 0.6];

/** Settle and report what happened to the column. */
export function settle(col, { steps = 1500, dt = 1 / 1000 } = {}) {
    const w = col.world;
    const ys0 = w.particles.map((p) => p.y);
    const h0 = Math.max(...ys0) - Math.min(...ys0);
    for (let t = 0; t < steps; t++) w.step(dt, BOX);
    const ys = w.particles.map((p) => p.y);
    const finite = ys.every(Number.isFinite);
    w.computeDensity();
    const rhos = w.particles.map((p) => p.rho);
    const hf = finite ? Math.max(...ys) - Math.min(...ys) : NaN;
    return {
        startHeight: h0, endHeight: hf, retained: hf / h0, finite,
        rhoMax: Math.max(...rhos), rhoMean: rhos.reduce((a, b) => a + b, 0) / rhos.length,
        restDensity: col.restDensity, packedDensity: col.packedDensity,
        // A column that GREW has not settled -- it is bouncing off the lid, which is a different failure from
        // collapsing and must not be scored as a better one.
        expanded: finite && hf > h0 * 1.05,
        collapsed: finite && hf < h0 * 0.8,
    };
}

// ---- CORRECTION (v2883): MY v2881 WRITE-UP WAS WRONG, AND THE RECORD WAS RIGHT --------------------------------
//
// v2881 shipped this file claiming "THE RECORDED DIAGNOSIS WAS WRONG" -- that v2494 had blamed a soft equation of
// state when the real cause was a rest-density mismatch. THAT CLAIM IS FALSE AND I AM RETRACTING IT.
//
// I read the ONE-LINE SUMMARY in physicsSuite's UNGATED list and never read the note attached to the actual
// gated check twenty lines below it, which says, verbatim:
//
//     "AND THE SETUP IS THE TEST. rest density MUST equal m/d^3 for the lattice being built (v2484 gated exactly
//      that fact, and v2494's first attempt at this check ignored it -- set 400 against a lattice delivering 120,
//      watched the fluid hang together by TENSION at 30% of rest density, and reported the resulting collapse as
//      a discovery about the engine. IT WAS A DISCOVERY ABOUT THE TEST.)"
//
// That is precisely the mistake I made, precisely the correction I announced as new, already written down in the
// file I was quoting from. I made v2494's error and then reported the fix as a finding, which is the same error
// one level up.
//
// AND THE COLUMN GATE ALREADY EXISTS AND PASSES. physicsSuite's "a settled fluid presses with exactly its own
// weight" measures mean floor pressure against M*g/area -- Newton, no opinion involved -- and reports 15.55%
// against an honestly-argued 25% tolerance. The SPH hydrostatic hole was closed at v2494. It was never open.
//
// WHAT IS ACTUALLY NEW HERE, and all this file should ever have claimed:
//   - the equation of state is now a CHOICE (pressureOf), with the default unchanged
//   - Tait gamma=7 is implemented, with B = rho0 c^2 / gamma exposed rather than hidden
//   - the two laws are MEASURED against the same column, and Tait EXPANDS it (184%) rather than settling it
// That last one is a genuine negative result and it stands. The framing around it did not.
// Measurements stand; the story told about them in v2881 does not. Kept with the corrected reading: the first
// row is a MIS-CONFIGURED column (rest density mis-stated), which is a fact about the setup and not the engine.
export const MEASURED_V2881 = [
    { label: "ideal, restDensity mis-stated as 400", eos: "ideal", restDensity: 400, retained: 0.156 },
    { label: "ideal, restDensity = the actual packing", eos: "ideal", restDensity: 144, retained: 0.632 },
    { label: "tait gamma=7, c=8",  eos: "tait", restDensity: 144, retained: 1.845 },
    { label: "tait gamma=7, c=15", eos: "tait", restDensity: 144, retained: 1.842 },
    { label: "tait gamma=7, c=25", eos: "tait", restDensity: 144, retained: 1.844 },
];
