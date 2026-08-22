// physics/xpbd/windCloth.js
//
// The sampled field, from last round, pushing a body that answers back. A free particle in a wind simply goes where
// the wind sends it; a cloth cannot, because its edges hold it together, so the wind and the constraints negotiate --
// the fabric bellies out downwind, stretched taut where it is pinned and slack where it is free, and settles into the
// shape a flag takes in a steady breeze. This is the sampled-field coupling doing what a coupling is for: driving a
// deformable body, not just carrying loose points. The wind is sampled trilinearly at each node and added to gravity
// before the ordinary XPBD cloth solve; nothing about the solver changes. Pure +,-,*,/ and sqrt.
import { sampleVec } from "./sampledField.js";

// One substep of a cloth in a sampled wind: predict under gravity + sampled wind, solve the cloth edges, finalize.
export function windClothSubstep(state, cons, batches, field, opts = {}) {
    const { pos, vel, invMass } = state, N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 10, g = opts.gravity || [0, -3, 0], wind = opts.windStrength ?? 1.0;
    const { nx, ny, nz, ox, oy, oz, sp } = field.dims, grid = field.grid;
    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos), s = [0, 0, 0];
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (invMass[a] > 0) {
            sampleVec(grid, nx, ny, nz, ox, oy, oz, sp, pos[o], pos[o + 1], pos[o + 2], s);
            vel[o] += (g[0] + wind * s[0]) * dt; vel[o + 1] += (g[1] + wind * s[1]) * dt; vel[o + 2] += (g[2] + wind * s[2]) * dt;
            pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt;
        } else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; }
    }
    const lam = new Float64Array(cons.length);
    for (let it = 0; it < iters; it++) for (let b = 0; b < batches.length; b++) { const batch = batches[b]; for (let bi = 0; bi < batch.length; bi++) { const ci = batch[bi], c = cons[ci]; const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2; if (wsum === 0) continue; const ax = 3 * c.i, bx = 3 * c.j; const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2]; const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-12) continue; const C = len - c.rest, aTilde = (c.compliance ?? 0) / (dt * dt); const dL = (-C - aTilde * lam[ci]) / (wsum + aTilde); lam[ci] += dL; const t = dL / len; pred[ax] += w1 * t * dx; pred[ax + 1] += w1 * t * dy; pred[ax + 2] += w1 * t * dz; pred[bx] -= w2 * t * dx; pred[bx + 1] -= w2 * t * dy; pred[bx + 2] -= w2 * t * dz; } }
    for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; } pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2]; }
    return state;
}

// Mean position of the free (unpinned) nodes -- used to measure how far the flag has bellied out.
export function freeCentroid(pos, invMass, N) { let sx = 0, sy = 0, sz = 0, c = 0; for (let i = 0; i < N; i++) if (invMass[i] > 0) { sx += pos[3 * i]; sy += pos[3 * i + 1]; sz += pos[3 * i + 2]; c++; } return [sx / c, sy / c, sz / c]; }

// Worst edge strain -- |len/rest - 1| over all edges; near zero means the constraints are holding the cloth together.
export function maxStrain(pos, cons) { let m = 0; for (const c of cons) { const dx = pos[3 * c.i] - pos[3 * c.j], dy = pos[3 * c.i + 1] - pos[3 * c.j + 1], dz = pos[3 * c.i + 2] - pos[3 * c.j + 2]; const len = Math.sqrt(dx * dx + dy * dy + dz * dz); const st = Math.abs(len / c.rest - 1); if (st > m) m = st; } return m; }
