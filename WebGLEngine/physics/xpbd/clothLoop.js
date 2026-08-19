// physics/xpbd/clothLoop.js
//
// The two rounds joined into one GPU loop. A cloth substep becomes a chain of buffer-to-buffer passes with no CPU
// readback: a PREDICT transform-feedback pass integrates gravity into a prediction buffer, a SOLVE pass per color
// per iteration relaxes the constraints in place on that buffer, a self-collision pass resolves contacts, and a
// FINALIZE transform-feedback pass writes the new positions and velocities. The position buffer that finalize writes
// is exactly the buffer predict reads next frame -- ping-pong, frame to frame, the data never leaving the device.
//
// Determinism comes from both rounds at once. Predict and finalize are PER-VERTEX: each vertex reads and writes only
// its own slot, so vertex order cannot matter (the transform-feedback property). The solve is PER-COLOR: within a
// color no two constraints share a vertex, so constraint order cannot matter (the graph-coloring property). And the
// whole decomposition must not change the physics -- clothFrame is byte-for-byte the v2661 clothSubstep, which the
// gate proves by running both and comparing. Only +,-,*,/ and sqrt; bit-identical.
import { colorConstraints } from "./xpbd.js";
import { findCollisionPairs } from "./selfCollide.js";

const iota = (n) => Array.from({ length: n }, (_, i) => i);

// PREDICT transform-feedback pass: pos,vel -> prev (saved), vel (integrated), pred. Per vertex, order-free.
export function predictPass(buf, invMass, dt, g, order) {
    const N = invMass.length; const o = order || iota(N);
    for (const a of o) {
        const k = 3 * a;
        buf.prev[k] = buf.pos[k]; buf.prev[k + 1] = buf.pos[k + 1]; buf.prev[k + 2] = buf.pos[k + 2];
        if (invMass[a] > 0) {
            buf.vel[k] += g[0] * dt; buf.vel[k + 1] += g[1] * dt; buf.vel[k + 2] += g[2] * dt;
            buf.pred[k] = buf.pos[k] + buf.vel[k] * dt; buf.pred[k + 1] = buf.pos[k + 1] + buf.vel[k + 1] * dt; buf.pred[k + 2] = buf.pos[k + 2] + buf.vel[k + 2] * dt;
        } else { buf.pred[k] = buf.pos[k]; buf.pred[k + 1] = buf.pos[k + 1]; buf.pred[k + 2] = buf.pos[k + 2]; }
    }
}

// SOLVE pass for ONE color: relax its constraints in place on pred. Within a color no shared vertices -> order-free.
export function solveColorPass(pred, invMass, constraints, colorBatch, lambda, dt, unilateral) {
    for (let bi = 0; bi < colorBatch.length; bi++) {
        const ci = colorBatch[bi], c = constraints[ci];
        const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2;
        if (wsum === 0) continue;
        const ax = 3 * c.i, bx = 3 * c.j;
        const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-12) continue;
        const C = len - c.rest;
        if (unilateral && C >= 0) continue;
        const aTilde = c.compliance / (dt * dt);
        const dLambda = (-C - aTilde * lambda[ci]) / (wsum + aTilde);
        lambda[ci] += dLambda;
        const s = dLambda / len;
        pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz;
        pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz;
    }
}

// FINALIZE transform-feedback pass: pred,prev -> pos (new), vel. Per vertex, order-free.
export function finalizePass(buf, invMass, dt, order) {
    const N = invMass.length; const o = order || iota(N);
    for (const a of o) {
        const k = 3 * a;
        if (invMass[a] > 0) { buf.vel[k] = (buf.pred[k] - buf.prev[k]) / dt; buf.vel[k + 1] = (buf.pred[k + 1] - buf.prev[k + 1]) / dt; buf.vel[k + 2] = (buf.pred[k + 2] - buf.prev[k + 2]) / dt; }
        buf.pos[k] = buf.pred[k]; buf.pos[k + 1] = buf.pred[k + 1]; buf.pos[k + 2] = buf.pred[k + 2];
    }
}

// One frame as a sequence of passes. opts may carry shuffled orders (vtxOrder, colorOrder maps, collisionOrder) so
// the gate can prove order does not matter. No buffer contents are read to steer control flow -- no CPU readback.
export function clothFrame(buf, invMass, fixed, fixedColors, opts = {}) {
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 5, g = opts.gravity || [0, -10, 0];
    const radius = opts.radius ?? 0, adj = opts.adj || new Set();
    const cellSize = opts.cellSize ?? (radius > 0 ? 2 * radius : 1);
    // v3603 -- THE COLLISION PASS'S TWO CONSTANTS BECOME PARAMETERS, DEFAULTS UNCHANGED (1 sweep, rigid).
    // They were HARDCODED, so a sweep over either read exactly zero movement and would have been registered
    // VACUOUS WITH THE WRONG REASON ATTACHED -- v3541's finding, in a second solver. Exposing them does not
    // change what ships: collisionKnobs-selfcheck holds the default path to a frozen v3602 state hash.
    const collIters = opts.collisionIterations ?? 1;
    const collCompliance = opts.collisionCompliance ?? 0;
    const perColor = (batches) => (opts.shuffleColor ? batches.map((b) => opts.shuffleColor(b)) : batches);

    predictPass(buf, invMass, dt, g, opts.vtxOrder);
    const colors = perColor(fixedColors);
    const lam = new Float64Array(fixed.length);
    for (let it = 0; it < iters; it++) for (let c = 0; c < colors.length; c++) solveColorPass(buf.pred, invMass, fixed, colors[c], lam, dt, false);
    if (radius > 0) {
        const pairs = findCollisionPairs(buf.pred, invMass.length, cellSize, 2 * radius, adj, opts.collisionOrder);
        const coll = pairs.map(([i, j]) => ({ i, j, rest: 2 * radius, compliance: collCompliance }));
        const collColors = perColor(colorConstraints(coll));
        const lamC = new Float64Array(coll.length);
        for (let it = 0; it < collIters; it++)
            for (let c = 0; c < collColors.length; c++) solveColorPass(buf.pred, invMass, coll, collColors[c], lamC, dt, true);
    }
    finalizePass(buf, invMass, dt, opts.vtxOrder);
    return buf;
}

// Run the loop for N frames. buf.pos persists (finalize writes it, next predict reads it): ping-pong, no readback.
export function clothLoop(init, invMass, fixed, fixedColors, frames, opts = {}) {
    const n = init.pos.length;
    const buf = { pos: Float64Array.from(init.pos), vel: Float64Array.from(init.vel), pred: new Float64Array(n), prev: new Float64Array(n) };
    for (let f = 0; f < frames; f++) clothFrame(buf, invMass, fixed, fixedColors, opts);
    return { pos: buf.pos, vel: buf.vel };
}
