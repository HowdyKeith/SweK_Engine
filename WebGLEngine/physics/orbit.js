// physics/orbit.js
//
// Gravity, integrated the way an orbit demands. Newton's law gives each body an acceleration -G*m*r/|r|^3 toward every
// other, and the naive thing -- forward Euler -- quietly adds energy every step, so a planet started on a circle
// spirals outward and the ellipse is a lie. The fix is a symplectic integrator: velocity-Verlet, which does not
// conserve energy exactly but keeps it bounded forever, so the orbit closes and Kepler's laws hold over many periods.
// The whole force is +,-,*,/ and one sqrt (|r| = sqrt(r.r), 1/|r|^3 = G/(r2*sqrt(r2))), no transcendental, so an orbit
// is bit-identical across machines. This is the same lesson the pendulum wave taught with its exact rotation: for a
// system that must come back to where it started, the integrator is not a detail.
//
// N bodies with pairwise gravity, so the two-body Kepler ellipse is the gated case but a three-body dance is a config.

export function makeSystem(bodies, { G = 1 } = {}) {
    // bodies: [{ m, r:[x,y,z], v:[x,y,z] }]
    const state = { bodies: bodies.map((b) => ({ m: b.m, r: [...b.r], v: [...b.v] })), G, acc: null };
    state.acc = computeAcc(state);
    return state;
}

function computeAcc(state) {
    const { bodies, G } = state, n = bodies.length, acc = bodies.map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const bi = bodies[i], bj = bodies[j];
        const dx = bj.r[0] - bi.r[0], dy = bj.r[1] - bi.r[1], dz = bj.r[2] - bi.r[2];
        const r2 = dx * dx + dy * dy + dz * dz, inv = G / (r2 * Math.sqrt(r2));   // G / |r|^3
        acc[i][0] += inv * bj.m * dx; acc[i][1] += inv * bj.m * dy; acc[i][2] += inv * bj.m * dz;
        acc[j][0] -= inv * bi.m * dx; acc[j][1] -= inv * bi.m * dy; acc[j][2] -= inv * bi.m * dz;
    }
    return acc;
}

// One velocity-Verlet step: r += v dt + 1/2 a dt^2 ; recompute a ; v += 1/2 (a_old + a_new) dt.
export function orbitStep(state, dt = 1 / 60) {
    const b = state.bodies, a = state.acc, hdt2 = 0.5 * dt * dt;
    for (let i = 0; i < b.length; i++) for (let k = 0; k < 3; k++) b[i].r[k] += b[i].v[k] * dt + a[i][k] * hdt2;
    const a2 = computeAcc(state);
    for (let i = 0; i < b.length; i++) for (let k = 0; k < 3; k++) b[i].v[k] += 0.5 * (a[i][k] + a2[i][k]) * dt;
    state.acc = a2;
    return state;
}

// Total mechanical energy: sum of kinetic minus sum of pairwise potential. Bounded under Verlet, drifting under Euler.
export function totalEnergy(state) {
    const { bodies, G } = state; let ke = 0, pe = 0;
    for (const b of bodies) ke += 0.5 * b.m * (b.v[0] * b.v[0] + b.v[1] * b.v[1] + b.v[2] * b.v[2]);
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const dx = bodies[j].r[0] - bodies[i].r[0], dy = bodies[j].r[1] - bodies[i].r[1], dz = bodies[j].r[2] - bodies[i].r[2];
        pe -= G * bodies[i].m * bodies[j].m / Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return ke + pe;
}

// Total angular momentum magnitude about the origin: |sum m (r x v)|. Conserved -- Kepler's equal-areas law.
export function angularMomentum(state) {
    let lx = 0, ly = 0, lz = 0;
    for (const b of state.bodies) { lx += b.m * (b.r[1] * b.v[2] - b.r[2] * b.v[1]); ly += b.m * (b.r[2] * b.v[0] - b.r[0] * b.v[2]); lz += b.m * (b.r[0] * b.v[1] - b.r[1] * b.v[0]); }
    return Math.sqrt(lx * lx + ly * ly + lz * lz);
}

// Separation between the first two bodies -- periapsis and apoapsis over an orbit define the ellipse.
export function separation(state) {
    const a = state.bodies[0].r, b = state.bodies[1].r, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Set up a two-body system started at periapsis with a chosen semi-major axis and eccentricity, barycentre at rest.
export function keplerPair({ G = 1, m1 = 1, m2 = 0.001, a = 1, e = 0.4 } = {}) {
    const mu = G * (m1 + m2), rp = a * (1 - e);
    const vp = Math.sqrt(mu * (1 + e) / (a * (1 - e)));   // relative speed at periapsis
    const f1 = m2 / (m1 + m2), f2 = m1 / (m1 + m2);
    const bodies = [
        { m: m1, r: [-f1 * rp, 0, 0], v: [0, -f1 * vp, 0] },
        { m: m2, r: [f2 * rp, 0, 0], v: [0, f2 * vp, 0] },
    ];
    return makeSystem(bodies, { G });
}
