// physics/xpbd/xpbdDamped.js
//
// XPBD with damping -- the one piece of the Macklin-Muller paper the v2659 solver left out. Equation 26 adds a
// velocity-damping term to the multiplier update:
//
//   d_lambda = (-C - aTilde*lambda - gamma * gradC . (x - x_prev)) / ((1 + gamma) * (w1+w2) + aTilde)
//
// with aTilde = compliance/dt^2, betaTilde = dt^2 * beta, and gamma = (aTilde * betaTilde) / dt. The extra numerator
// term is the relative velocity along the constraint (x - x_prev is this substep's displacement), so the damping
// bleeds energy out of motion ALONG the constraint without touching the elastic response. Set beta = 0 and gamma
// becomes 0 and every added term vanishes, so this reduces EXACTLY to the v2659 solver -- the gate proves that
// reduction is byte-for-byte. Kept in its own file so xpbd.js stays untouched and the xpbd-cloth fingerprint does
// not move. Pure +,-,*,/ and sqrt; bit-identical.
import { colorConstraints } from "./xpbd.js";
export { colorConstraints };

export function xpbdSubstepDamped(state, constraints, batches, opts = {}) {
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, iterations = opts.iterations ?? 1, g = opts.gravity || [0, -10, 0], beta = opts.beta ?? 0;

    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) {
            vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt;
            pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt;
        } else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; }
    }

    const lambda = new Float64Array(constraints.length);
    for (let it = 0; it < iterations; it++) {
        for (let b = 0; b < batches.length; b++) {
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
                const aTilde = c.compliance / (dt * dt);
                const betaTilde = dt * dt * beta;
                const gamma = (aTilde * betaTilde) / dt;
                // gradC . (x - x_prev): relative displacement of the two endpoints projected on the constraint direction
                const rx = (pred[ax] - prev[ax]) - (pred[bx] - prev[bx]);
                const ry = (pred[ax + 1] - prev[ax + 1]) - (pred[bx + 1] - prev[bx + 1]);
                const rz = (pred[ax + 2] - prev[ax + 2]) - (pred[bx + 2] - prev[bx + 2]);
                const gradDotDv = (dx * rx + dy * ry + dz * rz) / len;
                const dLambda = (-C - aTilde * lambda[ci] - gamma * gradDotDv) / ((1 + gamma) * wsum + aTilde);   // Eq 26
                lambda[ci] += dLambda;
                const s = dLambda / len;
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
