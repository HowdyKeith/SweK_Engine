// physics/xpbd/plastic.js
//
// Plasticity is tearing performed on the parameter instead of the existence. Tearing removed a constraint once its
// strain passed a threshold; plasticity permanently lengthens (or shortens) a constraint's REST once its elastic
// strain passes a yield point -- so the object dents and stays dented instead of snapping back. It rides the same
// spine discipline: every frame the elastic rest is reset from the plastic base rest0, and plasticity's only job is
// to permanently move that base. That reset is exactly why the base update is what makes the set permanent -- fail to
// carry rest0 forward and next frame's reset wipes the dent.
//
// Elastic strain is measured against the PREDICTED positions (pre-solve, where the stress shows), the same lesson as
// tearing: a stiff constraint hides its stress after projection. Only the excess beyond yield flows to permanent
// (plastic) strain, capped against the ORIGINAL length so a dent cannot run away. Each constraint reads only its own
// endpoints -> a pure per-constraint function of the snapshot, order-free. Pure +,-,*,/ and sqrt; bit-identical.

// Permanently move rest0 for constraints whose elastic strain exceeds yield. restOrig (immutable) bounds the dent.
export function applyPlasticity(pred, constraints, opts = {}, order) {
    const yieldStrain = opts.yieldStrain ?? 0.1, creep = opts.creep ?? 0.5, maxStrain = opts.maxStrain ?? 0.5;
    const idx = order || Array.from({ length: constraints.length }, (_, i) => i);
    let yielded = 0;
    for (const ci of idx) {
        const c = constraints[ci];
        if (c.restOrig === undefined) { c.restOrig = c.rest; c.rest0 = c.rest; }
        const ax = 3 * c.i, bx = 3 * c.j;
        const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const strain = (len - c.rest0) / c.rest0;                 // elastic strain relative to the current plastic rest
        if (strain > yieldStrain || strain < -yieldStrain) {
            const sign = strain > 0 ? 1 : -1;
            const excess = strain - sign * yieldStrain;           // only the part beyond yield becomes permanent
            let newRest0 = c.rest0 * (1 + creep * excess);
            const totalPlastic = (newRest0 - c.restOrig) / c.restOrig;   // cap the dent against the original length
            if (totalPlastic > maxStrain) newRest0 = c.restOrig * (1 + maxStrain);
            else if (totalPlastic < -maxStrain) newRest0 = c.restOrig * (1 - maxStrain);
            c.rest0 = newRest0; c.rest = newRest0;
            yielded++;
        }
    }
    return yielded;
}

// One substep with plasticity. The elastic rest is reset from the plastic base first (spine discipline), then a
// pre-solve plasticity pass permanently updates the base where the stress exceeds yield, then the solve runs.
export function plasticSubstep(state, constraints, batches, opts = {}) {
    for (let ci = 0; ci < constraints.length; ci++) { const c = constraints[ci]; if (c.rest0 !== undefined) c.rest = c.rest0; }

    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 5, g = opts.gravity || [0, -10, 0];

    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) { vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; }
        else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; }
    }

    applyPlasticity(pred, constraints, opts);                     // permanent base update from pre-solve stress

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

export function meanRest0(constraints) { let s = 0; for (const c of constraints) s += (c.rest0 ?? c.rest); return s / constraints.length; }
