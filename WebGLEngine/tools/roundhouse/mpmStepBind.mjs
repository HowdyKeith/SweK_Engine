// tools/roundhouse/mpmStepBind.mjs -- v3794
//
// *** THE ASSEMBLY, AND THE FIRST MPM DEVICE THAT GRADES A PROPERTY OF THE COMPOSITION RATHER THAN OF A PIECE.
// A FREELY FALLING BLOCK'S CENTRE OF MASS FOLLOWS THE ANALYTIC PARABOLA, WHATEVER THE MATERIAL DOES
// INTERNALLY. Internal stress cannot move it (v3793), plasticity cannot, and the transfer conserves momentum
// (v3789) -- so the block may wobble, squash, rotate and yield AND ITS CENTRE OF MASS STILL TRACES A PARABOLA.
// MEASURED: 8.882e-16 after 0.5 s, with sideways drift EXACTLY ZERO, plasticity on or off. ***
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
        return out;
    }

    if (h.mode === "sideways") {
        const r = run(true);
        out.driftX = r.driftX;
        out.noSidewaysDrift = r.driftX === 0;   // EXACTLY zero: gravity is vertical and nothing else may push
        return out;
    }

    const r = run(h.mode !== "noplastic");
    out.gotY = r.gotY; out.wantY = r.wantY; out.errY = r.errY; out.fell = r.fell;
    out.parabolaHolds = r.errY < 1e-9;
    out.driftX = r.driftX;
    out.noSidewaysDrift = r.driftX === 0;
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
