// physics/xpbd/anisotropy.js
//
// Real cloth is not equally stiff in every direction. Woven fabric has a warp and a weft -- two thread directions --
// and it gives more easily along one than the other, which is why a shirt stretches differently across the shoulders
// than down the back. In XPBD this is almost nothing to express: a distance constraint already carries a compliance,
// so anisotropy is just handing the warp-direction edges one compliance and the weft-direction edges another. Under
// the same pull the softer direction stretches more, and the ratio of the two stretches follows the ratio of the two
// compliances. No new solver, no new constraint -- only which number each edge is given, decided by its direction.
//
// This is the modulation spine seen from another angle: the field driving the compliance is not temperature or a
// signal but the fixed geometric direction of the edge. Pure +,-,*,/ and sqrt.

// Cloth in the x-z plane. Warp edges run along x, weft edges along z; each direction gets its own compliance.
export function buildAnisotropicCloth(W, H, sp, warpComp, weftComp) {
    const cons = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (x < W - 1) cons.push({ i, j: i + 1, rest: sp, compliance: warpComp, dir: "warp" });   // along x
        if (z < H - 1) cons.push({ i, j: i + W, rest: sp, compliance: weftComp, dir: "weft" });   // along z
    }
    return cons;
}

// Standard XPBD relaxation under a uniform body force -- the per-edge compliance is what makes it anisotropic.
export function anisotropicSubstep(state, cons, batches, opts = {}) {
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 12, f = opts.force || [0, 0, 0];
    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] += f[0] * dt; vel[o + 1] += f[1] * dt; vel[o + 2] += f[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; } else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; } }
    const lam = new Float64Array(cons.length);
    for (let it = 0; it < iters; it++) for (let b = 0; b < batches.length; b++) { const batch = batches[b]; for (let bi = 0; bi < batch.length; bi++) { const ci = batch[bi], c = cons[ci]; const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2; if (wsum === 0) continue; const ax = 3 * c.i, bx = 3 * c.j; const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2]; const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-12) continue; const C = len - c.rest, aTilde = c.compliance / (dt * dt); const dL = (-C - aTilde * lam[ci]) / (wsum + aTilde); lam[ci] += dL; const s = dL / len; pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz; pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz; } }
    for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; } pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2]; }
    return state;
}

// Extent of the cloth along an axis (0=x, 2=z) -- used to measure how far it stretched.
export function extent(pos, n, axis) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { const v = pos[3 * i + axis]; if (v < lo) lo = v; if (v > hi) hi = v; } return hi - lo; }
