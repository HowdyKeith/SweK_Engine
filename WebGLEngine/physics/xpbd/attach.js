// physics/xpbd/attach.js
//
// Attachments pin cloth particles to arbitrary points in the WORLD -- not to other particles -- so a sheet can hang
// from fixed hooks, curtain rings, or a moving hand. Each attachment is an XPBD point constraint C = |x - target|:
//
//   d_lambda = (-C - aTilde*lambda) / (w + aTilde),   aTilde = compliance/dt^2,   dx = w * (x-target)/|x-target| * d_lambda
//
// With compliance 0 the correction is exactly -(x - target), so the particle snaps onto the anchor in one step; with
// positive compliance it is a soft spring to the anchor. The target may be updated every frame, so a moving anchor
// simply drags the particle along -- deterministically, since the update is the caller's own arithmetic. Each
// attachment touches ONE particle, so attachments to distinct particles are independent and order-free. A particle
// pinned dead (invMass 0) needs no attachment; attachments are for anchors that pull a movable particle. Pure math.

// Solve all attachments once on the prediction buffer. attachments: [{ p, tx, ty, tz, compliance }]. lambda persists
// across iterations. order is only for the gate to prove independence.
export function solveAttachments(pred, invMass, attachments, lambda, dt, order) {
    const idx = order || Array.from({ length: attachments.length }, (_, i) => i);
    for (const ai of idx) {
        const a = attachments[ai];
        const w = invMass[a.p];
        if (w === 0) continue;                      // a dead-pinned particle cannot be pulled
        const o = 3 * a.p;
        const dx = pred[o] - a.tx, dy = pred[o + 1] - a.ty, dz = pred[o + 2] - a.tz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-12) continue;                  // already on the anchor
        const C = len;                              // C = |x - target|, rest 0
        const aTilde = a.compliance / (dt * dt);
        const dLambda = (-C - aTilde * lambda[ai]) / (w + aTilde);
        lambda[ai] += dLambda;
        const s = dLambda / len;
        pred[o] += w * s * dx; pred[o + 1] += w * s * dy; pred[o + 2] += w * s * dz;
    }
}

// One cloth substep with attachments. fixed/fixedBatches are the ordinary distance constraints; attachments pull
// chosen particles toward their (possibly moving) world targets each iteration.
export function attachSubstep(state, fixed, fixedBatches, attachments, opts = {}) {
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 5, g = opts.gravity || [0, -10, 0];

    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) { vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; }
        else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; }
    }

    const lamF = new Float64Array(fixed.length), lamA = new Float64Array(attachments.length);
    for (let it = 0; it < iters; it++) {
        for (let b = 0; b < fixedBatches.length; b++) {
            const batch = fixedBatches[b];
            for (let bi = 0; bi < batch.length; bi++) {
                const ci = batch[bi], c = fixed[ci];
                const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2;
                if (wsum === 0) continue;
                const ax = 3 * c.i, bx = 3 * c.j;
                const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
                const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (len < 1e-12) continue;
                const C = len - c.rest, aTilde = c.compliance / (dt * dt);
                const dLambda = (-C - aTilde * lamF[ci]) / (wsum + aTilde); lamF[ci] += dLambda;
                const s = dLambda / len;
                pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz;
                pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz;
            }
        }
        solveAttachments(pred, invMass, attachments, lamA, dt, opts.attachOrder);
    }

    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; }
        pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2];
    }
    return state;
}
