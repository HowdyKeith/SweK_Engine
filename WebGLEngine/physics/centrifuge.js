// physics/centrifuge.js
//
// A centrifuge is mechanics, not chemistry. A particle suspended in a fluid and spun feels a centrifugal force
// pushing it outward -- the buoyancy-corrected weight of the fluid it displaces, V*(rho_p - rho_f)*omega^2*r -- and a
// Stokes drag, 6*pi*eta*a*v, resisting whatever motion that force produces. In the overdamped limit the two balance
// almost instantly and the particle drifts outward at a terminal speed, and the algebra collapses to one clean fact:
// dr/dt = s * omega^2 * r, where s = 2*a^2*(rho_p - rho_f)/(9*eta) is the sedimentation coefficient (the Svedberg).
// Because s grows with the square of the particle radius and with its excess density, big dense particles race to the
// wall while small light ones lag, and the mixture SEPARATES INTO BANDS by s. That separation is the whole purpose of
// a centrifuge, and it is the same Stokes drag the thermal coupling uses -- only +,-,*,/,so it is bit-identical.

// Sedimentation coefficient s = 2 a^2 (rho_p - rho_f) / (9 eta). Grows with a^2 and with excess density.
export function sedCoeff(a, rhoP, rhoF, eta) { return 2 * a * a * (rhoP - rhoF) / (9 * eta); }

// One overdamped step for each particle: dr/dt = s * omega^2 * r, clamped to the tube [0, rMax].
export function centrifugeStep(parts, { omega = 30, dt = 1 / 60, rhoF = 1, eta = 1, rMax = 1 } = {}) {
    const w2 = omega * omega;
    for (const p of parts) {
        const s = sedCoeff(p.a, p.rho, rhoF, eta);
        p.r += s * w2 * p.r * dt;
        if (p.r > rMax) p.r = rMax; else if (p.r < 0) p.r = 0;
    }
    return parts;
}

// Mean radial position of the particles of a given species -- the centre of a band.
export function bandR(parts, species) {
    let sum = 0, n = 0;
    for (const p of parts) if (p.species === species) { sum += p.r; n++; }
    return n ? sum / n : 0;
}

// Terminal radial speed of a particle right now -- s * omega^2 * r. Used to check the sedimentation law directly.
export function radialSpeed(p, { omega, rhoF, eta }) { return sedCoeff(p.a, p.rho, rhoF, eta) * omega * omega * p.r; }
