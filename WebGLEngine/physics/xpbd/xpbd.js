// physics/xpbd/xpbd.js
//
// XPBD (Macklin, Muller, Chentanez 2016) done the way this engine insists on: deterministic, graph-colored, no
// atomics. XPBD is the cloth / soft-body / rope pillar the engine was missing -- position-based, unconditionally
// stable, with a compliance parameter that makes stiffness independent of iteration count.
//
// Two things separate real XPBD from the "PBD-with-compliance" that tutorials usually ship (and that the reference
// doc we reviewed shipped):
//   1. The Lagrange multiplier lambda is ACCUMULATED per constraint across the solve (lambda_0 = 0 each substep).
//   2. Eq (18) carries a regularization term:  d_lambda = (-C - aTilde*lambda) / (w1 + w2 + aTilde),
//      with aTilde = compliance / dt^2. Drop the -aTilde*lambda term and you are back to iteration-dependent PBD.
//   Then Eq (17):  dx = w * grad(C) * d_lambda,  and  lambda += d_lambda.
//
// Determinism: the solve is GRAPH-COLORED -- constraints are partitioned into batches where no two share a particle,
// so within a batch the updates are independent and their ORDER CANNOT MATTER. That is what a GPU dispatch needs to
// stay bit-identical (no atomics, no race), and it is what the gate proves by shuffling within-batch order. The only
// floats are +,-,*,/ and sqrt (all IEEE-exact); no library trig, so the result is bit-identical across machines.

// Greedy edge coloring: assign each constraint to the lowest-indexed batch in which neither of its particles is used.
// Returns an array of batches; each batch is an array of constraint indices, no two of which share a particle.
export function colorConstraints(constraints) {
    const batches = [];
    const usedInBatch = [];   // usedInBatch[b] = Set of particle indices already claimed in batch b
    for (let ci = 0; ci < constraints.length; ci++) {
        const { i, j } = constraints[ci];
        let b = 0;
        for (; ;) {
            if (!usedInBatch[b]) { usedInBatch[b] = new Set(); batches[b] = []; }
            const set = usedInBatch[b];
            if (!set.has(i) && !set.has(j)) { set.add(i); set.add(j); batches[b].push(ci); break; }
            b++;
        }
    }
    return batches;
}

export function cloneState(s) {
    return { pos: Float64Array.from(s.pos), vel: Float64Array.from(s.vel), invMass: Float64Array.from(s.invMass) };
}

// One XPBD substep. state = { pos:Float64Array(3N), vel:Float64Array(3N), invMass:Float64Array(N) } (mutated in place).
// constraints = [{ i, j, rest, compliance }]. batches from colorConstraints (the gate may pass shuffled batches).
// opts: { dt, iterations, gravity:[gx,gy,gz] }. Returns { lambda: Float64Array } (per-constraint total multiplier).
export function xpbdSubstep(state, constraints, batches, opts = {}) {
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016;
    const iterations = opts.iterations ?? 1;
    const g = opts.gravity || [0, -10, 0];

    const pred = new Float64Array(pos.length);
    const prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) {
            vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt;
            pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt;
        } else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; }
    }

    const lambda = new Float64Array(constraints.length);   // lambda_0 = 0 at the start of each substep
    for (let it = 0; it < iterations; it++) {
        for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];
            for (let bi = 0; bi < batch.length; bi++) {
                const ci = batch[bi];
                const c = constraints[ci];
                const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2;
                if (wsum === 0) continue;
                const ax = 3 * c.i, bx = 3 * c.j;
                const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2];
                const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (len < 1e-12) continue;
                const C = len - c.rest;
                const aTilde = c.compliance / (dt * dt);
                const dLambda = (-C - aTilde * lambda[ci]) / (wsum + aTilde);   // Eq (18) -- the -aTilde*lambda term is the point
                lambda[ci] += dLambda;
                const s = dLambda / len;                                        // Eq (17): dx = w * (grad C) * dLambda, grad C = (dx,dy,dz)/len
                pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz;
                pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz;
            }
        }
    }

    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; }
        pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2];
    }
    return { lambda };
}
