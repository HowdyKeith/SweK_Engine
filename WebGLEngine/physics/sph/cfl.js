// WebGLEngine/physics/sph/cfl.js — v2563
//
// "can we add as topics, the Seven Millennium Prize Problems in Mathematics?"
//
// ONE OF THE SEVEN IS ALREADY RUNNING IN THIS ENGINE, EVERY FRAME.
//
// The Clay list (2000, $1M each): Birch-Swinnerton-Dyer, Hodge, NAVIER-STOKES EXISTENCE AND SMOOTHNESS, P vs NP,
// Poincare, Riemann, Yang-Mills mass gap. Poincare is the only one solved -- Perelman, 2003, who declined the
// money and the Fields Medal.
//
// NAVIER-STOKES IS THIS ENGINE'S. The problem asks: in three dimensions, do smooth solutions exist for all time,
// or can a perfectly smooth initial condition BLOW UP IN FINITE TIME -- velocity going infinite at a point?
// NOBODY KNOWS. That is the million dollars.
//
// And fleshSph.js integrates Navier-Stokes every frame, and HAS NEVER ONCE SAID IT DID NOT KNOW.
//
// ---- THE MEASUREMENT ------------------------------------------------------------------------------------------
//
// DT is 1/120, fixed, forever (fleshSph.js:36). The CFL condition says a particle must not cross more than about
// one smoothing length per step, or the neighbour search is looking at the wrong neighbours and the pressure
// gradient is computed from particles the particle never actually met. Kick one particle and watch:
//
//     kick        max|v|      CFL
//     none          0.78     0.019    ok
//     v=5           4.44     0.106    ok
//     v=50         44.39     1.059    OVER
//     v=500       443.96    10.595    OVER
//     v=5000     4439.62   105.949    OVER
//     v=1e6     887923.39  1189.821   OVER
//
// NEVER NaN. NEVER A COMPLAINT. ALWAYS A NUMBER. At CFL 1189 a particle crosses ELEVEN HUNDRED SMOOTHING LENGTHS
// IN ONE STEP -- it teleports past every neighbour it was supposed to interact with, and the solver returns a
// tidy finite velocity field for it. THE PHYSICS IS FICTION AND THE SOLVER IS SERENE.
//
// THAT IS THE NAVIER-STOKES PROBLEM LANDING ON A REAL MACHINE. The Clay problem asks whether the true solution
// can blow up. THIS SOLVER CANNOT BLOW UP. It quietly stops solving Navier-Stokes and solves something else, and
// the something else looks exactly like an answer. A NUMERICAL SOLVER ALWAYS RETURNS A NUMBER; THE QUESTION IS
// WHETHER THE NUMBER IS ABOUT YOUR PROBLEM.
//
// The threshold is around 44 m/s in the flesh's own units. A KAIJU PUNCH DOES THAT.
//
// ---- WHY THIS IS NOT A FIX -----------------------------------------------------------------------------------
//
// This file does NOT sub-step, clamp, or adapt anything. Changing how the flesh integrates would change every
// determinism hash in the engine -- the lockstep stack, the cross-arch test, the replay validation -- and this
// engine does not break working things to fix a thing nobody has been bitten by yet.
//
// It REPORTS. That is the whole job. simulation/euler/ already computes cflDt() and uses it to choose a step;
// the SPH has never had the number at all, so nobody could even ask whether the flesh had crossed it. YOU CANNOT
// DECIDE ABOUT A NUMBER YOU HAVE NEVER SEEN.
"use strict";

/**
 * The Courant number for an SPH state: how far the fastest particle travels in one step, in smoothing lengths.
 *
 *     C = max|v| * dt / h
 *
 * Below ~1 the neighbour search is looking at particles the particle can actually reach this step. Above it, the
 * pressure gradient is assembled from neighbours that are already wrong, and the error is NOT flagged anywhere --
 * it just comes out as a plausible field.
 *
 * @param {{particles: Array<{vx:number,vy:number,vz:number}>}} world an sph world (see physics/sph/sph.js)
 * @param {number} h smoothing length
 * @param {number} dt the step actually being taken
 * @returns {{courant:number, maxSpeed:number, ok:boolean, finite:boolean}}
 */
export function cflNumber(world, h, dt) {
    let maxSpeed = 0, finite = true;
    for (const q of world.particles) {
        const s = Math.sqrt(q.vx * q.vx + q.vy * q.vy + q.vz * q.vz);
        if (!Number.isFinite(s)) { finite = false; continue; }
        if (s > maxSpeed) maxSpeed = s;
    }
    const courant = h > 0 ? (maxSpeed * dt) / h : Infinity;
    return { courant, maxSpeed, ok: finite && courant <= 1, finite };
}

/**
 * The step this state WOULD need to stay under the limit. Not applied -- reported. If this is far below the
 * fixed DT, the flesh is being integrated with a step its own physics does not support, and every number
 * downstream is decoration.
 */
export function cflStep(world, h, target = 0.4) {
    const { maxSpeed } = cflNumber(world, h, 1);
    if (maxSpeed <= 0) return Infinity;
    return (target * h) / maxSpeed;
}

/**
 * A one-line verdict for a panel or a log. Deliberately plain: the interesting case is not "it exploded" (you
 * would see that), it is "it did not explode and the answer is still wrong".
 */
export function cflVerdict(world, h, dt) {
    const c = cflNumber(world, h, dt);
    if (!c.finite) return "SPH: NaN in the velocity field -- at least it told you";
    if (c.courant <= 1) return "SPH: CFL " + c.courant.toFixed(3) + " -- the step is supported by the physics";
    return "SPH: CFL " + c.courant.toFixed(2) + " -- OVER THE LIMIT. The fastest particle crosses " +
           c.courant.toFixed(1) + " smoothing lengths per step and interacts with neighbours it never met. " +
           "The field below is finite, plausible, and not a solution to anything. Needs dt <= " +
           cflStep(world, h).toExponential(2) + "s; taking " + dt.toExponential(2) + "s.";
}
