// physics/xpbd/muscleVolume.js
//
// A biological actuator, built by composing two constraints that already exist: the volume constraint that conserves a
// closed mesh's enclosed volume, and the contraction that shortens a flagged fibre's rest length. Put them on the same
// elongated closed mesh -- a muscle belly -- and flag the longitudinal fibres as contractile. When they fire, the
// muscle shortens along its axis, and because the volume constraint will not let the enclosed volume shrink, the mesh
// has nowhere to put the displaced volume except outward: it bulges. That is a real muscle, and the bulge is not a
// separate effect bolted on -- it IS the conserved volume, forced sideways by the shortening. Neither constraint knows
// about the other; the behaviour emerges from running both. Pure +,-,*,/ and sqrt.
import { generateIcosphere, buildEdges, enclosedVolume, solveVolume } from "./volume.js";

// An elongated closed mesh with its longitudinal (mostly-axial) edges flagged as contractile fibres.
export function buildMuscleBelly(subdiv = 2, elongation = 2.2) {
    const sph = generateIcosphere(subdiv);
    const pos = Float64Array.from(sph.pos);
    for (let i = 0; i < sph.n; i++) pos[3 * i + 1] *= elongation;      // stretch along the muscle axis (y)
    const edges = buildEdges(pos, sph.tris, 0.0003);
    for (const e of edges) {
        const dx = pos[3 * e.i] - pos[3 * e.j], dy = pos[3 * e.i + 1] - pos[3 * e.j + 1], dz = pos[3 * e.i + 2] - pos[3 * e.j + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        e.rest0 = e.rest;                                             // remember the relaxed length
        e.muscle = len > 1e-9 && Math.abs(dy) / len > 0.5;           // mostly-axial edges are the fibres
    }
    return { pos, tris: sph.tris, n: sph.n, edges };
}

// Fire the muscle: contractile fibres shorten to rest0*(1 - contraction*activation); others hold their relaxed length.
export function contractMuscle(edges, activation, contraction) {
    for (const e of edges) e.rest = e.muscle ? e.rest0 * (1 - contraction * activation) : e.rest0;
}

// One substep: predict, solve the mesh edges (with whatever rest lengths contraction set), then -- if enabled -- the
// single volume constraint conserving the enclosed volume. With the volume constraint off, contraction merely shrinks.
export function muscleVolumeSubstep(state, edges, edgeBatches, tris, restVol, opts = {}) {
    const { pos, vel, invMass } = state, N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 8, useVolume = opts.useVolume ?? true, volCompliance = opts.volumeCompliance ?? 0.0;
    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) { const o = 3 * a; pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; }
    const lamE = new Float64Array(edges.length); let lamV = 0;
    for (let it = 0; it < iters; it++) {
        for (let b = 0; b < edgeBatches.length; b++) { const batch = edgeBatches[b]; for (let bi = 0; bi < batch.length; bi++) { const ci = batch[bi], c = edges[ci]; const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2; if (wsum === 0) continue; const ax = 3 * c.i, bx = 3 * c.j; const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2]; const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-12) continue; const C = len - c.rest, aTilde = c.compliance / (dt * dt); const dL = (-C - aTilde * lamE[ci]) / (wsum + aTilde); lamE[ci] += dL; const s = dL / len; pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz; pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz; } }
        if (useVolume) lamV = solveVolume(pred, invMass, tris, restVol, 1.0, volCompliance, dt, lamV);
    }
    for (let a = 0; a < N; a++) { const o = 3 * a; pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2]; }
    return state;
}

// Axial length (y-extent) and girth (max of x- and z-extent) of the belly.
export function bellyShape(pos, n) {
    let yl = Infinity, yh = -Infinity, xl = Infinity, xh = -Infinity, zl = Infinity, zh = -Infinity;
    for (let i = 0; i < n; i++) { const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; if (y < yl) yl = y; if (y > yh) yh = y; if (x < xl) xl = x; if (x > xh) xh = x; if (z < zl) zl = z; if (z > zh) zh = z; }
    return { length: yh - yl, girth: Math.max(xh - xl, zh - zl) };
}

export { enclosedVolume };
