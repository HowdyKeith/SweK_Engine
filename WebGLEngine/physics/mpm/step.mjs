// physics/mpm/step.mjs -- v3794
//
// *** THE ASSEMBLY. Five pieces were graded one at a time -- transfer (v3789), grid step (v3790), stress
// (v3791), return mapping (v3792), force scatter (v3793) -- and every entry said the same thing: THE PIECES
// ARE GRADED, THE ASSEMBLY IS NOT WRITTEN. This writes it, and writing it found a composition bug that no
// piece's own gate could have caught (see g2p's header in transfer.mjs: DOUBLE NORMALISATION, 90x). ***
//
// *** THE KEY IS THE ONE CLAIM ONLY A WHOLE LOOP CAN MAKE: A FREELY FALLING BLOCK'S CENTRE OF MASS FOLLOWS
// y0 - g t^2 / 2, WHATEVER THE MATERIAL DOES INTERNALLY. Internal stress cannot move it (v3793's third law),
// plasticity cannot, and the transfer conserves momentum (v3789) -- so the block may wobble, squash, rotate
// and yield, AND ITS CENTRE OF MASS STILL TRACES A PARABOLA. That is a property OF THE COMPOSITION and it is
// invisible to every piece tested alone. ***
//
// The loop is deliberately explicit rather than clever: a reader should be able to point at each of the five
// modules in it.

import { makeGrid, p2g, g2p } from "./transfer.mjs";
import { normalise, applyBodyForce, enforceWalls } from "./gridSolve.mjs";
import { lame, firstPiola, advanceF } from "./constitutive.mjs";
import { stressForces } from "./forces.mjs";
import { returnMap } from "./plasticity.mjs";
import { dpReturn, alphaOf } from "./druckerPrager.mjs";

export function restBlock({ n = 5, spacing = 0.25, x0 = 2, y0 = 6, m = 0.1, vol0 = 0.0625 } = {}) {
    const ps = [];
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        ps.push({ x: x0 + a * spacing, y: y0 + b * spacing, vx: 0, vy: 0,
                  cxx: 0, cxy: 0, cyx: 0, cyy: 0,
                  m, vol0, F: [1, 0, 0, 1], F0: [1, 0, 0, 1], Fp: [1, 0, 0, 1] });
    }
    return ps;
}

export function centreOfMass(ps) {
    let m = 0, x = 0, y = 0;
    for (const p of ps) { m += p.m; x += p.m * p.x; y += p.m * p.y; }
    return { x: x / m, y: y / m, m };
}

/** ONE FULL MPM STEP. Each of the five graded modules appears exactly once, in order. */
export function step(ps, g, { dt = 1 / 240, gy = -9.81, params, plastic = true, walls = null,
                              noForces = false } = {}) {
    p2g(ps, g, { affine: true });                     // 1. v3789 -- grid now holds MOMENTUM
    normalise(g);                                     // 2. v3790 -- grid now holds VELOCITY, and says so
    if (!noForces) {                                  // 3. v3793 joining v3791 -- internal force as f/m * dt
        const { fx, fy } = stressForces(ps, g, (F, p) => firstPiola(F, (p && p.mat) || params), {});
        for (let k = 0; k < g.n; k++) {
            const m = g.mass[k];
            if (m > 0) { g.mvx[k] += (fx[k] / m) * dt; g.mvy[k] += (fy[k] / m) * dt; }
        }
    }
    applyBodyForce(g, 0, gy, dt);                     // 4. v3790 -- on the VELOCITY field, so impulse = M*g*dt
    if (walls) enforceWalls(g, walls);
    g2p(ps, g, { affine: true });                     // 5. v3789 -- reads g.normalised, does NOT divide again
    for (const p of ps) {
        p.F = advanceF(p.F, [p.cxx, p.cxy, p.cyx, p.cyy], dt);   // 6. v3791
        // *** v3800 -- THE PLASTICITY MODEL IS NOW A CHOICE, AND THE DEFAULT IS UNCHANGED ON PURPOSE.
        // `plastic: true` still means v3792's SINGULAR-VALUE CLAMP, so every number v3794 through v3799
        // reported still reproduces. `plastic: "dp"` selects the Drucker-Prager surface, which is the model
        // with a FRICTION ANGLE in it. SWITCHING THE DEFAULT WOULD HAVE SILENTLY MOVED EVERY SHIPPED FIGURE
        // -- the column's dissipation, its settle height, its creep -- and buried a model change inside
        // numbers nobody was looking at. ***
        if (plastic === "dp") {
            const pm = p.mat || params;
            const r = dpReturn(p.F, p.Fp, { mu: pm.mu, lambda: pm.lambda,
                                            alpha: pm.alpha != null ? pm.alpha : alphaOf(30) });
            p.F = r.Fe;
            // dpReturn returns Fp = null on the projecting paths: the plastic part is not tracked by this
            // surface, and pretending otherwise would invent a quantity it never computed.
            if (r.Fp) p.Fp = r.Fp;
        } else if (plastic) {
            const r = returnMap(p.F, p.Fp); p.F = r.Fe; p.Fp = r.Fp;                  // v3792
        }
        p.x += p.vx * dt; p.y += p.vy * dt;           // 7. advect
    }
    return ps;
}

/** Run n steps and report how far the centre of mass strayed from the analytic parabola. */
export function freeFallError(ps, g, { steps = 120, dt = 1 / 240, gy = -9.81, params, plastic = true } = {}) {
    const c0 = centreOfMass(ps);
    for (let i = 0; i < steps; i++) step(ps, g, { dt, gy, params, plastic });
    const c1 = centreOfMass(ps);
    const t = steps * dt;
    // *** THE ANALYTIC VALUE IS THE DISCRETE ONE, NOT THE CONTINUOUS ONE. Symplectic-Euler advection uses the
    // velocity AFTER the kick, so the fall after n steps is g*dt^2 * n(n+1)/2, which differs from g t^2 / 2 by
    // exactly one half-step of drift. USING THE TEXTBOOK CONTINUOUS FORM WOULD MANUFACTURE AN O(dt) "ERROR"
    // THAT IS REALLY THE INTEGRATOR BEING WHAT IT IS. ***
    const n = steps;
    const wantY = c0.y + gy * dt * dt * (n * (n + 1) / 2);
    return { t, gotY: c1.y, wantY, errY: Math.abs(c1.y - wantY),
             driftX: Math.abs(c1.x - c0.x), fell: c0.y - c1.y };
}

// *** GUARDED, BECAUSE THIS MODULE IS LOADED BY A BROWSER AND `process` IS A NODE GLOBAL. *** Unguarded,
// this line threw ReferenceError at module scope, which kills the WHOLE import graph -- so mpm.html
// rendered its headings and then nothing at all. VERIFIED IN A REAL CHROMIUM at v3809, before and after.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    const params = lame(500, 0.3);
    for (const plastic of [true, false]) {
        const g = makeGrid(16, 16, 0.5);
        const r = freeFallError(restBlock(), g, { params, plastic });
        console.log("[step] plastic " + String(plastic).padEnd(6) + " t " + r.t.toFixed(3) + "s  y " +
                    r.gotY.toFixed(9) + " against " + r.wantY.toFixed(9) +
                    "  err " + r.errY.toExponential(3) + "  drift x " + r.driftX.toExponential(3));
    }
}
