// physics/xpbd/clothLoopKey.mjs
//
// v3479 -- GRADING THE GPU BUFFER-PASS LOOP, AND THE KEY IS AN EQUIVALENCE PLUS A CLOSED FORM.
//
// clothLoop.js runs a cloth substep as a chain of GPU buffer passes -- predict, per-color solve, collision,
// finalize -- ping-ponged frame to frame with no CPU readback. Its header states the property the GPU port
// rests on: "clothFrame is byte-for-byte the v2661 clothSubstep." clothLoop already has a passing selfcheck, so
// -- like the weave and tear modes before it -- WHAT A DEVICE ADDS IS LAB REACH: the equivalence is a claim about
// EVERY config, and the selfcheck proves it at one; here it is SWEPT across iterations and grid sizes and put
// under the lab's baseline and sensitivity harness. Two keys, neither the tautology of grading the loop against
// the loop:
//
//   FREE-FALL CLOSED FORM   one frame of a single free particle lands at pos = g*dt^2 with vel = g*dt -- the
//                           semi-implicit Euler integral, to the bit. The reference is the closed form, not the
//                           integrator re-run, and NO existing xpbd device grades the predict/finalize integrator
//                           against it (they all grade the constraint solve).
//   EQUIVALENCE (SWEPT)     the decomposed loop reproduces the monolithic clothSubstep byte-for-byte across a
//                           sweep of {iterations x grid}, worst position difference exactly 0.
//
// *** THE PLANT DROPS THE XPBD FEEDBACK TERM -aTilde*lambda FROM THE SOLVE, AND IT IS HONEST: at compliance 0 the
// term is zero anyway, so the broken loop is byte-identical to the monolith; only at positive compliance do they
// part. *** The compliance-key discipline (agree at the one place the term vanishes, diverge everywhere else),
// here reaching the GPU loop.

import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints, cloneState } from "./xpbd.js";
import { clothSubstep } from "./clothStep.js";
import { clothLoop, clothFrame, predictPass, finalizePass } from "./clothLoop.js";

const DT = 0.016, G = [0, -10, 0];

// A hanging cloth: top row pinned, the rest free, laid flat so gravity does real work. compliance knobs default
// to the selfcheck's (shear/bending > 0) so the equivalence is exercised where the feedback term is live.
function scene(W, H, stiff = { structural: 0.0, shear: 0.001, bending: 0.01 }) {
    const { cons, adj } = buildClothConstraints(W, H, 0.3, stiff);
    const colors = colorConstraints(cons);
    const N = W * H, pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; pos[3 * i] = x * 0.3; pos[3 * i + 1] = 0; pos[3 * i + 2] = -y * 0.3; invMass[i] = (y === 0) ? 0 : 1;
    }
    return { cons, adj, colors, init: { pos, vel, invMass } };
}
const opt = (adj, iters, radius = 0.08) => ({ dt: DT, iterations: iters, gravity: G, radius, adj });
const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };

/** One frame of a single free particle lands at the semi-implicit Euler closed form pos = g*dt^2, vel = g*dt. */
export function freeFall() {
    const buf = { pos: new Float64Array(3), vel: new Float64Array(3), pred: new Float64Array(3), prev: new Float64Array(3) };
    clothFrame(buf, [1], [], [], { dt: DT, iterations: 5, gravity: G, radius: 0 });
    const posErr = Math.abs(buf.pos[1] - G[1] * DT * DT), velErr = Math.abs(buf.vel[1] - G[1] * DT);
    return { freeFallErr: Math.max(posErr, velErr), freeFallDrop: Math.abs(buf.pos[1]) };
}

/** The decomposed loop equals clothSubstep byte-for-byte across a sweep of iterations and grid sizes. */
export function equivalenceSweep() {
    let equivErr = 0, moved = 0;
    for (const iters of [1, 3, 5, 8]) for (const [W, H] of [[4, 4], [5, 5], [6, 4]]) {
        const { cons, adj, colors, init } = scene(W, H);
        const s = cloneState(init);
        for (let f = 0; f < 20; f++) clothSubstep(s, cons, colors, opt(adj, iters));
        const loop = clothLoop(init, init.invMass, cons, colors, 20, opt(adj, iters));
        equivErr = Math.max(equivErr, maxDiff(s.pos, loop.pos));
        moved = Math.max(moved, maxDiff(s.pos, init.pos));
    }
    return { equivErr, moved };
}

// A frame whose solve DROPS the -aTilde*lambda feedback term (and the lambda accumulation with it).
function brokenSolve(pred, invMass, cons, batch, dt) {
    for (const ci of batch) {
        const c = cons[ci], w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2;
        if (wsum === 0) continue;
        const ax = 3 * c.i, bx = 3 * c.j;
        const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-12) continue;
        const C = len - c.rest, aTilde = c.compliance / (dt * dt);
        const dLambda = -C / (wsum + aTilde);                    // NOTE: no -aTilde*lambda, no accumulation
        const s = dLambda / len;
        pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz;
        pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz;
    }
}
function brokenLoop(init, invMass, cons, colors, frames, o) {
    const buf = { pos: Float64Array.from(init.pos), vel: Float64Array.from(init.vel), pred: new Float64Array(init.pos.length), prev: new Float64Array(init.pos.length) };
    for (let f = 0; f < frames; f++) {
        predictPass(buf, invMass, o.dt, o.gravity);
        for (let it = 0; it < o.iterations; it++) for (const col of colors) brokenSolve(buf.pred, invMass, cons, col, o.dt);
        finalizePass(buf, invMass, o.dt);
    }
    return buf;
}

/** The dropped-feedback plant diverges from the monolith at positive compliance, and AGREES at compliance 0. */
export function droppedLambdaPlant() {
    // positive compliance: shear/bending live -> the term matters -> divergence
    const hot = scene(5, 5);
    const sh = cloneState(hot.init);
    for (let f = 0; f < 20; f++) clothSubstep(sh, hot.cons, hot.colors, opt(hot.adj, 5, 0));
    const plantHot = brokenLoop(hot.init, hot.init.invMass, hot.cons, hot.colors, 20, opt(hot.adj, 5, 0));
    const plantEquivErr = maxDiff(sh.pos, plantHot.pos);
    // all-zero compliance: the term vanishes -> broken loop == monolith
    const cold = scene(5, 5, { structural: 0, shear: 0, bending: 0 });
    const sc = cloneState(cold.init);
    for (let f = 0; f < 20; f++) clothSubstep(sc, cold.cons, cold.colors, opt(cold.adj, 5, 0));
    const plantCold = brokenLoop(cold.init, cold.init.invMass, cold.cons, cold.colors, 20, opt(cold.adj, 5, 0));
    const plantAgreesAtZero = maxDiff(sc.pos, plantCold.pos);
    return { plantEquivErr, plantAgreesAtZero };
}

/** The graded keys in the shape the xpbd device mode reports. */
export function clothLoopKeys() {
    const ff = freeFall();
    const eq = equivalenceSweep();
    return {
        freeFallErr: ff.freeFallErr,
        equivErr: eq.equivErr,
        freeFallDrop: ff.freeFallDrop,
        freeFallExact: ff.freeFallErr === 0,
        equivalent: eq.equivErr === 0,
        clothMoves: eq.moved > 1e-3,
    };
}
