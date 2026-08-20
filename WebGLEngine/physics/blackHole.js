// physics/blackHole.js
//
// A black hole with nothing imaginary in it. The gravity is real; the trick is the potential. A Paczynski-Wiita
// pseudo-Newtonian potential -- Phi(r) = -GM/(r - rs), with rs the event-horizon radius -- reproduces, in pure
// arithmetic, the real relativistic structure a Newtonian point mass cannot: an event horizon you cannot climb back out
// of, a photon sphere, an innermost stable circular orbit at exactly 6GM/c^2, orbits that precess instead of closing,
// and a plunge to capture once you cross inside the ISCO. Every one of those is real and invisible around an actual
// black hole; this makes them computable and therefore showable. No wormhole, no invented effect -- just the hidden
// made visible.
//
// Units are geometric-ish: pass G, M, c and everything scales. Pure +,-,*,/ and sqrt -> deterministic, cross-arch.

export function schwarzschildRadius(M, G, c) { return 2 * G * M / (c * c); }   // event horizon
export function photonSphere(M, G, c) { return 3 * G * M / (c * c); }          // 1.5 rs -- last unstable photon orbit
export function iscoRadius(M, G, c) { return 6 * G * M / (c * c); }            // 3 rs -- innermost STABLE circular orbit

// Paczynski-Wiita acceleration on a test particle at pos=[x,y] around a mass M at the origin (rs = horizon radius).
export function accel(pos, M, G, rs) {
    const x = pos[0], y = pos[1];
    const r = Math.sqrt(x * x + y * y);
    const d = r - rs;
    const mag = -G * M / (d * d);           // inward magnitude along r-hat; diverges at the horizon
    return [mag * x / r, mag * y / r];
}

// Circular-orbit speed at radius r in the PW potential: v^2 = GM r / (r - rs)^2.
export function circularSpeed(r, M, G, rs) { const d = r - rs; return Math.sqrt(G * M * r) / d; }

// A test particle. Start it at (r0, 0) moving in +y at speed v0.
export function makeParticle(r0, v0) { return { r: [r0, 0], v: [0, v0], t: 0, captured: false, rMin: r0, rMax: r0, turns: 0 }; }

// One velocity-Verlet step under PW gravity. Marks captured once inside the horizon.
export function step(p, dt, M, G, rs) {
    if (p.captured) return p;
    const a0 = accel(p.r, M, G, rs);
    p.r[0] += p.v[0] * dt + 0.5 * a0[0] * dt * dt;
    p.r[1] += p.v[1] * dt + 0.5 * a0[1] * dt * dt;
    const a1 = accel(p.r, M, G, rs);
    p.v[0] += 0.5 * (a0[0] + a1[0]) * dt;
    p.v[1] += 0.5 * (a0[1] + a1[1]) * dt;
    p.t += dt;
    const rr = Math.sqrt(p.r[0] * p.r[0] + p.r[1] * p.r[1]);
    if (rr < p.rMin) p.rMin = rr;
    if (rr > p.rMax) p.rMax = rr;
    if (rr <= rs) { p.captured = true; }
    return p;
}

// Conserved quantities for the test particle (energy per unit mass, and angular momentum).
export function energy(p, M, G, rs) {
    const r = Math.sqrt(p.r[0] * p.r[0] + p.r[1] * p.r[1]);
    return 0.5 * (p.v[0] * p.v[0] + p.v[1] * p.v[1]) - G * M / (r - rs);
}
export function angularMomentum(p) { return p.r[0] * p.v[1] - p.r[1] * p.v[0]; }

// Run a particle for N steps; returns it (with rMin/rMax filled and captured set if it plunged).
export function run(p, N, dt, M, G, rs) { for (let i = 0; i < N && !p.captured; i++) step(p, dt, M, G, rs); return p; }

// Run and record the ANGLE at each apoapsis (local maximum of r). A closed orbit returns to the same apoapsis angle
// every revolution; a precessing one advances. The gap between consecutive apoapsis angles is the precession per orbit
// -- real for a relativistic (PW) potential, zero for a Newtonian ellipse. Returns the list of apoapsis angles.
export function apoapsisAngles(p, N, dt, M, G, rs) {
    const angles = [];
    let rPrev = Math.sqrt(p.r[0] * p.r[0] + p.r[1] * p.r[1]), rising = false;
    for (let i = 0; i < N && !p.captured; i++) {
        step(p, dt, M, G, rs);
        const r = Math.sqrt(p.r[0] * p.r[0] + p.r[1] * p.r[1]);
        if (r > rPrev) rising = true;
        else if (rising && r < rPrev) { angles.push(Math.atan2(p.r[1], p.r[0])); rising = false; }
        rPrev = r;
    }
    return angles;
}
