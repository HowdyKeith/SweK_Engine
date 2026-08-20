// WebGLEngine/physics/md/thermostat.js — v2644
//
// Temperature control. Left alone, an MD system sits at whatever energy it started with; a thermostat holds it at a
// target temperature so you can simulate a molecule "at room temperature" instead of at an accidental one.
//
// Temperature comes from equipartition: each degree of freedom carries 1/2 kB T of kinetic energy on average, so
// T = 2 KE / (dof kB). In reduced units kB = 1. The thermostat is Berendsen velocity rescaling: each step the
// velocities are scaled by a factor that nudges the temperature a fraction of the way to the target, gently rather
// than all at once. The scale factor is a sqrt -- IEEE-exact -- so the thermostat is deterministic across
// architectures like everything else here.

// Instantaneous temperature. dof is the number of degrees of freedom (3N, or 3N-3 if COM motion is removed).
export function temperature(vel, masses, dof) {
    let ke = 0;
    for (let i = 0; i < masses.length; i++) {
        const vx = vel[3 * i], vy = vel[3 * i + 1], vz = vel[3 * i + 2];
        ke += 0.5 * masses[i] * (vx * vx + vy * vy + vz * vz);
    }
    return (2 * ke) / dof;   // kB = 1
}

// Remove centre-of-mass drift so the thermostat controls thermal motion, not bulk translation.
export function removeCOMMotion(vel, masses) {
    let px = 0, py = 0, pz = 0, M = 0;
    for (let i = 0; i < masses.length; i++) { px += masses[i] * vel[3 * i]; py += masses[i] * vel[3 * i + 1]; pz += masses[i] * vel[3 * i + 2]; M += masses[i]; }
    const vx = px / M, vy = py / M, vz = pz / M;
    for (let i = 0; i < masses.length; i++) { vel[3 * i] -= vx; vel[3 * i + 1] -= vy; vel[3 * i + 2] -= vz; }
    return vel;
}

// Scale every velocity by s (in place).
function scale(vel, s) { for (let i = 0; i < vel.length; i++) vel[i] *= s; }

// Instant rescale to hit the target temperature exactly this step.
export function rescaleToT(vel, masses, Ttarget, dof) {
    const T = temperature(vel, masses, dof);
    if (T > 0) scale(vel, Math.sqrt(Ttarget / T));
    return vel;
}

// Berendsen thermostat: nudge temperature toward the target with coupling time tau. lambda^2 = 1 + (dt/tau)(Tt/T - 1).
/**
 * *** v3773 -- `skipSqrt` DEFAULTS TO FALSE AND EXISTS SO A PLANT CAN SIT ON THE ONE STEP THAT MATTERS.
 * lam2 is a ratio of ENERGIES; velocities scale as its SQUARE ROOT. Applying lam2 directly to the velocities
 * is the classic Berendsen slip -- it still relaxes toward the target, still converges, still looks like a
 * working thermostat, AND IT RELAXES AT THE WRONG RATE, so the trajectory no longer obeys
 * dT/dt = (T0 - T)/tau. Nothing about the final temperature gives it away; only the LAW does. ***
 */
export function berendsenStep(vel, masses, Ttarget, dof, dt, tau, skipSqrt = false) {
    const T = temperature(vel, masses, dof);
    if (T <= 0) return vel;
    let lam2 = 1 + (dt / tau) * (Ttarget / T - 1);
    if (lam2 < 0) lam2 = 0;                 // never invert velocities
    scale(vel, skipSqrt ? lam2 : Math.sqrt(lam2));
    return vel;
}
