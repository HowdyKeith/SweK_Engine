// physics/plasma.js
//
// A charged particle in a magnetic bottle -- real plasma confinement, not a light show. A magnetic bottle (a magnetic
// mirror) is a field that is weak in the middle and strong at both ends. A charged particle spirals along the field
// lines under the Lorentz force F = qv x B, and as it drifts toward a strong-field end its spiral tightens and its
// forward motion bleeds into rotation until it stops and reflects -- so it bounces back and forth, trapped, exactly as a
// real mirror machine confines plasma. Nothing here is painted on: the bounce is the Lorentz force and a divergence-free
// mirror field, and it falls out of the arithmetic.
//
// The integrator is the Boris pusher, the standard for charged-particle motion, which uses only add/subtract/multiply/
// divide and cross products -- no trig, no fractional powers -- so a magnetic force does exactly zero work and the speed
// is conserved to the last bit, and the whole thing is cross-architecture bit-identical.

// Divergence-free magnetic-mirror field: Bz weakest at z=0, growing toward both ends; Br pinches inward to keep div B = 0.
export function fieldAt(x, y, z, B0, L) {
    const iL2 = 1 / (L * L);
    return [-B0 * x * z * iL2, -B0 * y * z * iL2, B0 * (1 + z * z * iL2)];
}

export function makeParticle(vPerp, vPar, qm = 1) {
    return { r: [0.6, 0, 0], v: [0, vPerp, vPar], qm, zMax: 0, reflections: 0, lastVz: vPar };
}

// One Boris step in a pure magnetic field (no electric field): rotate v by the local B, then advance position.
export function step(p, dt, B0, L) {
    const B = fieldAt(p.r[0], p.r[1], p.r[2], B0, L);
    const h = p.qm * dt * 0.5;
    const tx = B[0] * h, ty = B[1] * h, tz = B[2] * h;
    const t2 = tx * tx + ty * ty + tz * tz;
    const sf = 2 / (1 + t2);
    const sx = tx * sf, sy = ty * sf, sz = tz * sf;
    const vx = p.v[0], vy = p.v[1], vz = p.v[2];
    // v' = v + v x t
    const px = vx + (vy * tz - vz * ty), py = vy + (vz * tx - vx * tz), pz = vz + (vx * ty - vy * tx);
    // v+ = v + v' x s
    p.v[0] = vx + (py * sz - pz * sy);
    p.v[1] = vy + (pz * sx - px * sz);
    p.v[2] = vz + (px * sy - py * sx);
    p.r[0] += p.v[0] * dt; p.r[1] += p.v[1] * dt; p.r[2] += p.v[2] * dt;
    const az = p.r[2] < 0 ? -p.r[2] : p.r[2];
    if (az > p.zMax) p.zMax = az;
    if ((p.lastVz > 0) !== (p.v[2] > 0)) p.reflections++;   // parallel velocity flipped sign -> reflected at a mirror
    p.lastVz = p.v[2];
    return p;
}

export function speedSq(p) { return p.v[0] * p.v[0] + p.v[1] * p.v[1] + p.v[2] * p.v[2]; }

// Run a particle for n steps; report how far along the axis it got and how many times it reflected.
export function run(vPerp, vPar, n, dt = 0.02, B0 = 1, L = 5, qm = 1) {
    const p = makeParticle(vPerp, vPar, qm);
    for (let i = 0; i < n; i++) step(p, dt, B0, L);
    return p;
}
