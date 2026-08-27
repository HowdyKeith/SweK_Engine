// tools/roundhouse/mpmStepBind.mjs -- v3794, v4031
//
// *** THE ASSEMBLY, AND THE FIRST MPM DEVICE THAT GRADES A PROPERTY OF THE COMPOSITION RATHER THAN OF A PIECE.
// A FREELY FALLING BLOCK'S CENTRE OF MASS FOLLOWS THE ANALYTIC PARABOLA, WHATEVER THE MATERIAL DOES
// INTERNALLY. Internal stress cannot move it (v3793), plasticity cannot, and the transfer conserves momentum
// (v3789) -- so the block may wobble, squash, rotate and yield AND ITS CENTRE OF MASS STILL TRACES A PARABOLA.
// MEASURED: 8.882e-16 after 0.5 s, with sideways drift EXACTLY ZERO, plasticity on or off. ***
//
// *** v4031 -- WHAT THE KNOB CENSUS FOUND HERE, AND WHY TWO OF THE THREE ANSWERS ARE THE KEY BEING TRUE.
// knobLiveness reported mpmstep.nu and mpmstep.nx as MOVING NOTHING. Both readings were correct and neither
// was a dead knob.
//
//   nu   IS FLAT EXACTLY BECAUSE THE KEY HOLDS. Poisson's ratio enters through lame(E, nu) into the internal
//        stress, and internal stress cannot move a centre of mass -- that is the sentence at the top of this
//        file. MEASURED bit-identical at nu = 0, 0.15, 0.3, 0.45, 0.49, 1e-6, -0.3 and 3e5, in all four modes
//        and both plant states. The last two are not admissible Poisson ratios and the observables do not
//        notice, which is the point: NO KEY THIS DEVICE CARRIES CAN GRADE THE CONSTITUTIVE MODEL. Registered
//        in knobLiveness's STILL_OK with that sentence rather than fixed, because there is nothing to fix.
//        *** AND E IS THE SAME PHYSICS: it reads "live" in the census on a ONE-ULP difference at E = 250
//        (8.882e-16 -> 1.776e-15) and on the run at E = 5e8 where the explicit step violates CFL and the
//        particles leave the grid. The live/still line between E and nu here is ROUNDING, NOT GRADING. ***
//
//   nx   IS FLAT ABOVE THE GRID THAT CONTAINS THE BLOCK'S STENCIL, and wakes at the boundary. restBlock spans
//        x in [2,3] and y in [6,7]; the quadratic kernel reaches one node past that; h = 0.5. So the parabola
//        needs nx >= 7 and ny >= 15, and MEASURED it is exact (8.882e-16) at nx = 7 and broken at nx = 6
//        (errY 2.257e-1), exact at ny = 15 and broken at ny = 14 (1.261e-1). THE THRESHOLD IS DERIVED FROM
//        THE FIXTURE'S EXTENT AND THE KERNEL'S SUPPORT, NOT TUNED. The census called ny live and nx still for
//        one reason only: its near ladder's 0.5x rung is 8, which is above 7 and below 15. *** A VERDICT THAT
//        DEPENDS ON WHETHER A LADDER RUNG HAPPENS TO STRADDLE A PHYSICAL THRESHOLD IS A READING ABOUT THE
//        LADDER. *** The two knobs are the same knob and the block is taller than it is wide.
//
// *** AND THE ANALYTIC VALUE IS THE DISCRETE ONE. Symplectic-Euler advects with the velocity AFTER the kick,
// so the fall after n steps is g*dt^2*n(n+1)/2 -- which differs from the textbook g t^2 / 2 by exactly one
// half-step of drift. USING THE CONTINUOUS FORM WOULD HAVE MANUFACTURED AN O(dt) "ERROR" THAT IS REALLY THE
// INTEGRATOR BEING WHAT IT IS, and then somebody would have tuned a correct loop to hide it. ***

import { makeGrid } from "../../physics/mpm/transfer.mjs";
import { lame } from "../../physics/mpm/constitutive.mjs";
import { restBlock, centreOfMass, freeFallError, step } from "../../physics/mpm/step.mjs";

export const MPMSTEP_OBSERVABLES = [
    "errY", "parabolaHolds", "driftX", "noSidewaysDrift", "fell", "gotY", "wantY",
    "errNoPlastic", "plasticIrrelevant", "steps", "dt",
    // v4031 -- `blockFell` is REPORTED SEPARATELY rather than folded into noSidewaysDrift, for the reason
    // render/silhouette.mjs gives about hard gates: two facts averaged into one observable is a number that
    // means neither. noSidewaysDrift stays the pure statement "nothing pushed sideways"; blockFell is the
    // precondition that makes it worth anything, and the gate requires both.
    //
    // *** nx AND ny ARE NOT HERE, AND THEY WERE FOR ONE DRAFT OF THIS ROUND. *** Echoing them made the knob
    // census report nx as LIVE IN ONE OBSERVABLE -- itself. An observable that is the input handed straight
    // back grades nothing, and a knob that reads live off its own echo is worse than one that reads dead,
    // because dead invites a look and live closes the question. `steps` and `dt` were already echoed here
    // before this round, so knobLiveness now discards echoes at the source (probeKnob, v4031) instead of
    // every bind having to remember not to publish one.
    "blockFell",
];

export const MPMSTEP_MODES = ["freefall", "noplastic", "sideways", "continuous"];

const DEF = { steps: 120, dt: 1 / 240, gy: -9.81, E: 500, nu: 0.3, nx: 16, ny: 16, h: 0.5 };

export function mpmStepDefaults(hyp) {
    const h = { mode: "freefall", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.steps = Math.min(600, Math.max(10, num(c.steps, DEF.steps) | 0));
    c.dt = Math.min(1 / 60, Math.max(1e-4, num(c.dt, DEF.dt)));
    c.h = Math.min(2, Math.max(0.1, num(c.h, DEF.h)));
    // *** v4031 -- nx AND ny ARE CLAMPED AND E, nu AND gy ARE NOT, AND THE DIFFERENCE IS ALLOCATION. ***
    // A knob that computes can be handed a ridiculous value and will return a ridiculous number, which is a
    // reading. A knob that SIZES AN ARRAY hands the machine a ridiculous allocation instead: makeGrid builds
    // three Float64Arrays of (nx+1)*(ny+1), so knobLiveness's wide ladder at 1e6x asked for nx = 1.6e7 and
    // 6 GB, and the census did not come back -- which is exactly why mpmstep never produced a wide-ladder
    // answer for nx and the knob sat unresolved in the still list. 128 is not tuned: it is an order of
    // magnitude above the largest grid any key here needs (ny >= 15) and 400 KB instead of 6.5 GB.
    c.nx = Math.min(128, Math.max(2, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(128, Math.max(2, num(c.ny, DEF.ny) | 0));
    h.config = c;
    if (!MPMSTEP_MODES.includes(h.mode)) h.mode = "freefall";
    return h;
}

export async function buildMpmStep(hyp, base = {}) {
    const h = mpmStepDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const params = lame(c.E, c.nu);
    const run = (plastic) => freeFallError(restBlock(), makeGrid(c.nx, c.ny, c.h),
                                           { steps: c.steps, dt: c.dt, gy: c.gy, params, plastic });
    const out = { steps: c.steps, dt: c.dt };

    if (h.mode === "continuous") {
        // *** THE PLANT: grade against the CONTINUOUS g t^2 / 2 instead of the discrete sum the integrator
        // actually produces. It is not a wrong simulation -- IT IS A WRONG EXPECTATION, and it is the more
        // dangerous kind, because the natural response is to "fix" a correct loop until it matches. ***
        const r = run(true);
        const t = c.steps * c.dt;
        const cont = (r.gotY + r.fell) + 0.5 * c.gy * t * t;
        out.gotY = r.gotY; out.wantY = cont;
        out.errY = Math.abs(r.gotY - cont);
        out.parabolaHolds = out.errY < 1e-9;
        out.driftX = r.driftX;
        out.noSidewaysDrift = r.driftX === 0;
        out.blockFell = r.fell > 0;
        return out;
    }

    if (h.mode === "sideways") {
        const r = run(true);
        out.driftX = r.driftX;
        out.noSidewaysDrift = r.driftX === 0;   // EXACTLY zero: gravity is vertical and nothing else may push
        // *** v4031 -- THE NEGATIVE PASSED VACUOUSLY AND THE KNOB CENSUS IS WHAT WALKED INTO IT. *** Probing
        // nx down to 2 puts the whole block outside the grid: p2g's bounds guard drops every scatter, no node
        // ever carries mass, nothing is gathered back, and THE BLOCK DOES NOT MOVE AT ALL. driftX is then
        // exactly 0 and `noSidewaysDrift` reads true -- the strongest form of this key, satisfied by a
        // simulation that did nothing. (nx = 3 is the honest failure and it fires: the grid clips the block
        // asymmetrically and driftX goes to 3.113e-8.) A LOAD-BEARING NEGATIVE NEEDS A WITNESS THAT THE RUN
        // HAPPENED, so the fall is reported beside it and the gate asks for both.
        out.fell = r.fell;
        out.blockFell = r.fell > 0;
        return out;
    }

    const r = run(h.mode !== "noplastic");
    out.gotY = r.gotY; out.wantY = r.wantY; out.errY = r.errY; out.fell = r.fell;
    out.parabolaHolds = r.errY < 1e-9;
    out.driftX = r.driftX;
    out.noSidewaysDrift = r.driftX === 0;
    out.blockFell = r.fell > 0;
    if (h.mode === "freefall") {
        out.errNoPlastic = run(false).errY;
        // The centre of mass cannot care whether the material yielded -- that is the whole point of the key.
        out.plasticIrrelevant = Math.abs(out.errNoPlastic - out.errY) < 1e-12;
    }
    return out;
}

export const mpmStepDevice = {
    modes: MPMSTEP_MODES,
    // "freefall" is FIRST so the contract compares the plant against the mode that owns the parabola.
    plantMode: "continuous", plantFlips: "errY", plantKind: "mode",
    name: "mpm-freefall-parabola", observables: MPMSTEP_OBSERVABLES,
    build: buildMpmStep, defaults: mpmStepDefaults,
};
