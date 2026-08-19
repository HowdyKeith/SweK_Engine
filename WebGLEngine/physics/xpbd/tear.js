// physics/xpbd/tear.js
//
// Tearing is self-collision run backwards. Self-collision ADDS constraints discovered from a snapshot of positions;
// tearing REMOVES constraints whose strain, measured against a snapshot, has exceeded a breaking threshold. The same
// determinism discipline applies: evaluate every constraint's strain against a FROZEN snapshot, decide per constraint
// (each reads only its own two endpoints), and collect the torn indices in ascending order -- a pure function of the
// snapshot, independent of any scan order. And a tear is PERMANENT: an active flag only ever goes 1 -> 0, never back,
// so a snapped thread does not heal when the cloth happens to relax. The solve simply skips inactive constraints; the
// fixed coloring is unchanged. Pure +,-,*,/ and sqrt; bit-identical.

// Strains measured against the snapshot `pos`. Returns torn constraint indices in ascending order (deterministic).
// scanOrder is only for the gate to prove the result does not depend on visitation order.
export function evaluateTears(pos, constraints, active, tearStrain, scanOrder) {
    const order = scanOrder || Array.from({ length: constraints.length }, (_, i) => i);
    const torn = [];
    for (const ci of order) {
        if (!active[ci]) continue;
        const c = constraints[ci];
        const ax = 3 * c.i, bx = 3 * c.j;
        const dx = pos[ax] - pos[bx], dy = pos[ax + 1] - pos[bx + 1], dz = pos[ax + 2] - pos[bx + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len / c.rest > tearStrain) torn.push(ci);
    }
    return torn.sort((p, q) => p - q);
}

export function applyTears(active, torn) { for (const ci of torn) active[ci] = 0; }   // 1 -> 0 only; never reverses

// One substep with tearing: predict, solve (skipping inactive constraints), finalize, then evaluate tears against
// the settled positions and remove them for next frame. active is a Uint8Array (1 = intact, 0 = torn), mutated.
export function tearSubstep(state, constraints, batches, active, opts = {}) {
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 5, g = opts.gravity || [0, -10, 0];
    const tearStrain = opts.tearStrain ?? Infinity;

    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) { vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; }
        else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; }
    }

    // tear against the PREDICTED positions (pre-solve): that is where a constraint's stress under load is highest,
    // before projection pulls it back. A frozen snapshot, evaluated per constraint -> order-free and deterministic.
    applyTears(active, evaluateTears(pred, constraints, active, tearStrain));

    const lambda = new Float64Array(constraints.length);
    for (let it = 0; it < iters; it++) for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        for (let bi = 0; bi < batch.length; bi++) {
            const ci = batch[bi];
            if (!active[ci]) continue;                    // torn constraints are skipped
            const c = constraints[ci];
            const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2;
            if (wsum === 0) continue;
            const ax = 3 * c.i, bx = 3 * c.j;
            const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-12) continue;
            const C = len - c.rest;
            const aTilde = c.compliance / (dt * dt);
            const dLambda = (-C - aTilde * lambda[ci]) / (wsum + aTilde);
            lambda[ci] += dLambda;
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
    return active;
}

export function activeCount(active) { let n = 0; for (let i = 0; i < active.length; i++) n += active[i]; return n; }
