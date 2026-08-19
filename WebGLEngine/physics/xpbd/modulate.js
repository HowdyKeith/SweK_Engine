// physics/xpbd/modulate.js
//
// The multi-physics spine. Fluid pressure, plasticity, thermal expansion, neural actuation -- they all reduce to the
// SAME operation: before the XPBD projection loop runs, rewrite each constraint's rest length and compliance from an
// external field. The solver never changes; only the parameters it projects toward do. So this file is the one pass
// every coupling plugs into, and the couplings differ only in the pure field->parameter function they hand it.
//
// The stability rule the whole pipeline rests on: modulation ALWAYS recomputes from a stored BASE (rest0, compliance0),
// never from the value it wrote last frame. Read from the live value instead and heat compounds every frame, the mesh
// drifts, and the "stable, convergence-friendly" promise is gone. Storing the base makes each frame's parameters a
// pure function of the current field alone -- idempotent, order-free, and returning exactly to base when the field is
// zero. Pure +,-,*,/; bit-identical.

// Snapshot the base rest/compliance once, so modulation always has an un-modulated reference to compute from.
export function initBaseParams(constraints) {
    for (let ci = 0; ci < constraints.length; ci++) {
        const c = constraints[ci];
        if (c.rest0 === undefined) c.rest0 = c.rest;
        if (c.compliance0 === undefined) c.compliance0 = c.compliance;
    }
}

// The generic spine: rewrite every constraint's rest/compliance from its BASE via a pure map(c, rest0, compliance0).
// order is only for the gate to prove the result does not depend on which constraint is visited first.
export function modulateConstraints(constraints, map, order) {
    initBaseParams(constraints);
    const idx = order || Array.from({ length: constraints.length }, (_, i) => i);
    for (const ci of idx) {
        const c = constraints[ci];
        const out = map(c, c.rest0, c.compliance0);
        c.rest = out.rest;
        c.compliance = out.compliance;
    }
}

// THERMAL coupling: a per-node temperature field swells rest length (expansion) and raises compliance (softening).
// The edge temperature is the mean of its two endpoints -- reads only the field snapshot and the constraint's own
// nodes, so it is a pure per-constraint function. expansion and soften are non-negative coefficients.
export function thermalModulate(constraints, temp, opts = {}, order) {
    const expansion = opts.expansion ?? 0.1, soften = opts.soften ?? 4.0;
    modulateConstraints(constraints, (c, rest0, compliance0) => {
        const tEdge = 0.5 * (temp[c.i] + temp[c.j]);
        return { rest: rest0 * (1 + expansion * tEdge), compliance: compliance0 * (1 + soften * tEdge) };
    }, order);
}

// One substep of the unified loop: modulate the constraint parameters from the field, THEN run the XPBD projection.
// modulate(constraints) is any function that rewrites rest/compliance (e.g. a closure over thermalModulate).
export function modulatedSubstep(state, constraints, batches, modulate, opts = {}) {
    modulate(constraints);
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 5, g = opts.gravity || [0, -10, 0];

    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) { vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; }
        else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; }
    }
    const lambda = new Float64Array(constraints.length);
    for (let it = 0; it < iters; it++) for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        for (let bi = 0; bi < batch.length; bi++) {
            const ci = batch[bi], c = constraints[ci];
            const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2;
            if (wsum === 0) continue;
            const ax = 3 * c.i, bx = 3 * c.j;
            const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-12) continue;
            const C = len - c.rest, aTilde = c.compliance / (dt * dt);
            const dLambda = (-C - aTilde * lambda[ci]) / (wsum + aTilde); lambda[ci] += dLambda;
            const s = dLambda / len;
            pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz;
            pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz;
        }
    }
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; }
        pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2];
    }
    return state;
}

// Mean edge length -- a simple size proxy the gate uses to detect swelling.
export function meanEdgeLength(pos, constraints) {
    let sum = 0;
    for (const c of constraints) { const ax = 3 * c.i, bx = 3 * c.j; const dx = pos[ax] - pos[bx], dy = pos[ax + 1] - pos[bx + 1], dz = pos[ax + 2] - pos[bx + 2]; sum += Math.sqrt(dx * dx + dy * dy + dz * dz); }
    return sum / constraints.length;
}
