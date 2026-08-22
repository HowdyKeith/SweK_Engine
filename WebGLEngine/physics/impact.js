// physics/impact.js
//
// An asteroid hitting a planet, with only the parts that are real and none of the fireball. Four honest stages:
//
//  1. APPROACH. Gravity bends the incoming path. A planet catches more than its own width, because gravity pulls grazing
//     trajectories in -- gravitational focusing -- and the slower the asteroid, the more it is focused. This is the pure,
//     sqrt-only part, and it is what gets fingerprinted.
//  2. ENTRY. Crossing the thin sliver of atmosphere, the body feels drag, and the deceleration goes as 1/radius -- so a
//     small body sheds far more speed than a large one. That is why small meteors burn up and big ones punch through.
//     (Uses an exponential atmosphere, so it is gated but not fingerprinted -- exp is not bit-identical across machines.)
//  3. ENERGY. It arrives carrying one-half m v-squared, and by energy conservation it can never arrive slower than the
//     escape speed no matter how gently it started.
//  4. CRATER. The crater size follows an empirical scaling law, growing as roughly the cube root of the energy -- a
//     thousand times the energy is only about eight times the crater. (Fractional power, so gated, not fingerprinted.)

// ---- Stage 1: gravitational-focusing approach (pure, sqrt-only -> fingerprinted) --------------------
export function escapeSpeed(GM, R) { return Math.sqrt(2 * GM / R); }
export function impactSpeed(GM, R, vInf) { return Math.sqrt(vInf * vInf + 2 * GM / R); }        // never below escape speed
export function criticalImpactParameter(GM, R, vInf) { return R * Math.sqrt(1 + 2 * GM / (R * vInf * vInf)); }   // focusing radius > R

export function makeApproach(x0, y0, vx0, vy0) { return { r: [x0, y0], v: [vx0, vy0], hit: false, missed: false, rMin: Math.sqrt(x0 * x0 + y0 * y0) }; }
export function stepApproach(p, dt, GM, R) {
    if (p.hit || p.missed) return p;
    const acc = (rx, ry) => { const r2 = rx * rx + ry * ry; const r = Math.sqrt(r2); const f = -GM / (r2 * r); return [f * rx, f * ry]; };
    const a0 = acc(p.r[0], p.r[1]);
    p.r[0] += p.v[0] * dt + 0.5 * a0[0] * dt * dt;
    p.r[1] += p.v[1] * dt + 0.5 * a0[1] * dt * dt;
    const a1 = acc(p.r[0], p.r[1]);
    p.v[0] += 0.5 * (a0[0] + a1[0]) * dt;
    p.v[1] += 0.5 * (a0[1] + a1[1]) * dt;
    const rr = Math.sqrt(p.r[0] * p.r[0] + p.r[1] * p.r[1]);
    if (rr < p.rMin) p.rMin = rr;
    if (rr <= R) p.hit = true;
    else if (rr > 60) p.missed = true;                                     // flew past into a hyperbolic escape
    return p;
}

// ---- Stage 2: atmospheric drag (gated, not fingerprinted -- uses exp) -------------------------------
export function airDensity(h, rho0, H) { return rho0 * Math.exp(-h / H); }
// deceleration magnitude for a spherical body: a = 3 rho Cd v^2 / (8 r rho_body). Note the 1/r: small bodies decelerate more.
export function entryDeceleration(rho, v, Cd, r, rhoBody) { return (3 * rho * Cd * v * v) / (8 * r * rhoBody); }
// integrate an entry from the top of the atmosphere down to the surface; return the speed that survives to impact.
export function atmosphericEntry(vTop, r, rhoBody, opt, steps = 400) {
    const { rho0 = 1.2, H = 8000, hAtm = 100000, Cd = 1.0 } = opt || {};
    let v = vTop, h = hAtm; const dh = hAtm / steps; const dt = dh / (v > 1 ? v : 1);
    for (let i = 0; i < steps && h > 0; i++) {
        const rho = airDensity(h, rho0, H);
        v -= entryDeceleration(rho, v, Cd, r, rhoBody) * (dh / (v > 1 ? v : 1));
        if (v < 0) v = 0;
        h -= dh;
    }
    return v;
}

// ---- Stage 3: impact energy (arithmetic) -----------------------------------------------------------
export function sphereMass(r, rhoBody) { return (4 / 3) * Math.PI * r * r * r * rhoBody; }
export function impactEnergy(m, v) { return 0.5 * m * v * v; }

// ---- Stage 4: crater scaling (gated, not fingerprinted -- fractional power) -------------------------
// simplified gravity-regime scaling: crater diameter grows as ~ energy^(1/3.4).
export function craterDiameter(E, k = 1.0) { return k * Math.pow(E, 1 / 3.4); }
