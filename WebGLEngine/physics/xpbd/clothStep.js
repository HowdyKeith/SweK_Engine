// physics/xpbd/clothStep.js
//
// One cloth substep: predict, solve the fixed structural/shear/bending distance constraints (graph-colored), then
// resolve self-collision (dynamically discovered pairs, colored fresh this frame), then finalize velocities. The
// collision constraint is a UNILATERAL distance constraint -- it only pushes two particles apart when they are
// closer than the contact distance (C < 0); farther apart it does nothing, so it never pulls particles together.
//
// The inner solve is the exact v2659 XPBD update (Eq 18/17 with lambda accumulation and aTilde = compliance/dt^2),
// with one added guard for the unilateral case. The gate proves this solver reproduces xpbdSubstep byte-for-byte
// when collisions are off, so the shared math has not drifted from the verified reference.
import { colorConstraints } from "./xpbd.js";
import { findCollisionPairs } from "./selfCollide.js";

function solveInto(pred, invMass, constraints, batches, lambda, dt, iterations, unilateral) {
    for (let it = 0; it < iterations; it++) for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        for (let bi = 0; bi < batch.length; bi++) {
            const ci = batch[bi], c = constraints[ci];
            const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2;
            if (wsum === 0) continue;
            const ax = 3 * c.i, bx = 3 * c.j;
            const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-12) continue;
            const C = len - c.rest;
            if (unilateral && C >= 0) continue;                 // contact only pushes apart, never pulls together
            const aTilde = c.compliance / (dt * dt);
            const dLambda = (-C - aTilde * lambda[ci]) / (wsum + aTilde);
            lambda[ci] += dLambda;
            const s = dLambda / len;
            pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz;
            pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz;
        }
    }
}

// state = { pos, vel, invMass }; fixed/fixedBatches from buildClothConstraints + colorConstraints.
// opts: { dt, iterations, gravity, radius (contact half-distance; 0 disables collision), adj, cellSize, collisionOrder,
//         collisionIterations (default 1), collisionCompliance (default 0) -- the v3603 pair, added here at v3606 }.
export function clothSubstep(state, fixed, fixedBatches, opts = {}) {
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 5, g = opts.gravity || [0, -10, 0];
    const radius = opts.radius ?? 0, adj = opts.adj || new Set();
    const cellSize = opts.cellSize ?? (radius > 0 ? 2 * radius : 1);
    // v3606 -- THE SAME TWO KNOBS clothLoop GAINED AT v3603, AND LEAVING THEM OUT MADE THE EQUIVALENCE CLAIM
    // CONDITIONAL ON THE DEFAULTS WITH NOTHING SAYING SO. These two solvers are gated against each other
    // byte-for-byte; from v3603 to v3605 one of them read collisionIterations and the other silently did not,
    // so the pair agreed at the defaults and diverged by up to 5.461e-2 (18% of the mesh spacing) the moment
    // anybody set a knob. Defaults unchanged and held to a hash captured from the pristine v3605 extract
    // BEFORE this edit -- physics/xpbd/solverParity.mjs.
    const collIters = opts.collisionIterations ?? 1;
    const collCompliance = opts.collisionCompliance ?? 0;

    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) { vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; }
        else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; }
    }

    solveInto(pred, invMass, fixed, fixedBatches, new Float64Array(fixed.length), dt, iters, false);

    if (radius > 0) {
        const pairs = findCollisionPairs(pred, N, cellSize, 2 * radius, adj, opts.collisionOrder);
        const coll = pairs.map(([i, j]) => ({ i, j, rest: 2 * radius, compliance: collCompliance }));
        const collBatches = colorConstraints(coll);
        solveInto(pred, invMass, coll, collBatches, new Float64Array(coll.length), dt, collIters, true);
    }

    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; }
        pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2];
    }
    return state;
}
