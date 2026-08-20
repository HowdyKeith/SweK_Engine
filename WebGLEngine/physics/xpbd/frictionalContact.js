// physics/xpbd/frictionalContact.js
//
// Coulomb friction on the contacts BETWEEN particles, not just against a plane. Each overlapping pair is pushed apart
// along its normal, then the tangential motion it made since the previous step is resisted -- bounded, as always, by
// mu times the normal correction, and split between the two particles by inverse mass so it is two-way. That single
// bound is enough to make a heap of particles hold a slope: drop them and they pile up at an angle of repose instead
// of spreading into a flat pancake, and the steeper the friction the steeper the pile. The angle of repose is the
// friction angle made visible by a crowd.
//
// A worthwhile determinism point lives here. A pile is chaotic -- nudge one grain and the whole heap settles
// differently -- yet it is still perfectly deterministic: the contacts are discovered by a sorted spatial hash and
// solved in a fixed graph-coloured order, and the friction reads only current and previous positions, so the same
// start yields the same heap to the last bit, on any machine. Chaos is not the enemy of reproducibility; unpinned
// order is. Pure +,-,*,/ and sqrt.
import { colorConstraints } from "./xpbd.js";
import { findCollisionPairs } from "./selfCollide.js";
import { solvePlaneFriction } from "./friction.js";

// Push overlapping pairs apart and apply two-way Coulomb friction to their tangential motion since `prev`.
export function solveFrictionalContacts(pred, prev, invMass, pairs, batches, radius, mu) {
    const rest = 2 * radius;
    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        for (let k = 0; k < batch.length; k++) {
            const [i, j] = pairs[batch[k]];
            const wi = invMass[i], wj = invMass[j], wsum = wi + wj;
            if (wsum === 0) continue;
            const ai = 3 * i, aj = 3 * j;
            let dx = pred[ai] - pred[aj], dy = pred[ai + 1] - pred[aj + 1], dz = pred[ai + 2] - pred[aj + 2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-12 || len >= rest) continue;             // unilateral: only when overlapping
            const depth = rest - len, nx = dx / len, ny = dy / len, nz = dz / len;
            const s = depth / wsum;
            pred[ai] += wi * s * nx; pred[ai + 1] += wi * s * ny; pred[ai + 2] += wi * s * nz;   // push i out
            pred[aj] -= wj * s * nx; pred[aj + 1] -= wj * s * ny; pred[aj + 2] -= wj * s * nz;   // push j out
            // relative tangential motion since the previous step
            let rx = (pred[ai] - prev[ai]) - (pred[aj] - prev[aj]), ry = (pred[ai + 1] - prev[ai + 1]) - (pred[aj + 1] - prev[aj + 1]), rz = (pred[ai + 2] - prev[ai + 2]) - (pred[aj + 2] - prev[aj + 2]);
            const rn = rx * nx + ry * ny + rz * nz;
            rx -= rn * nx; ry -= rn * ny; rz -= rn * nz;          // tangential part
            const tLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
            if (tLen < 1e-12) continue;
            const scale = (tLen <= mu * depth ? 1 : mu * depth / tLen) / wsum;
            pred[ai] -= wi * scale * rx; pred[ai + 1] -= wi * scale * ry; pred[ai + 2] -= wi * scale * rz;   // resist, two-way
            pred[aj] += wj * scale * rx; pred[aj + 1] += wj * scale * ry; pred[aj + 2] += wj * scale * rz;
        }
    }
}

// One substep of a granular pile: gravity, a frictional floor, and frictional pairwise contacts.
export function frictionalPileSubstep(state, floorN, floorD, mu, opts = {}) {
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 4, g = opts.gravity || [0, -10, 0], radius = opts.radius ?? 0.1, muFloor = opts.muFloor ?? mu;
    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; } else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; } }
    for (let it = 0; it < iters; it++) {
        const pairs = findCollisionPairs(pred, N, 2 * radius, 2 * radius, new Set(), opts.contactOrder);
        const batches = colorConstraints(pairs.map(([i, j]) => ({ i, j })));
        solveFrictionalContacts(pred, prev, invMass, pairs, batches, radius, mu);
        solvePlaneFriction(pred, prev, invMass, floorN, floorD, muFloor);
    }
    for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; } pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2]; }
    return state;
}

// Horizontal spread (max radius from the vertical axis) and height of a settled pile -- the shape of the heap.
export function pileShape(pos, n) {
    let maxR = 0, maxY = -Infinity, minY = Infinity;
    for (let i = 0; i < n; i++) { const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; const r = Math.sqrt(x * x + z * z); if (r > maxR) maxR = r; if (y > maxY) maxY = y; if (y < minY) minY = y; }
    return { radius: maxR, height: maxY - minY };
}
