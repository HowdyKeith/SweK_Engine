// physics/xpbd/friction.js
//
// Coulomb friction on a contact. Once a normal constraint has pushed a particle out of a surface by some depth, the
// tangential motion it made while penetrating is resisted -- but only up to a limit: the friction correction can be at
// most mu times the normal correction. Below that limit the tangential motion is cancelled entirely (the particle
// sticks, static friction); above it the motion is only reduced (the particle slides, kinetic friction). That single
// bound is the whole of Coulomb friction, and it is what makes a particle hold on a gentle slope and slide down a
// steep one -- the transition sits exactly where the slope's tangent passes mu.
//
// The solve is trig-free: a slope is given as a surface NORMAL, never an angle, so no sin/cos ever runs (a slope
// specified by angle would seed the whole thing with libm trig). Per particle, reading only its own position and its
// position last step -- deterministic. Pure +,-,*,/ and sqrt.

// Resolve a particle set against a static plane (n . x = d, n unit) with Coulomb friction. Mutates pred; prev is the
// pre-step position, used to measure the tangential motion to resist.
/**
 * *** v3852 -- `constantBound` DEFAULTS FALSE AND EXISTS SO A PLANT CAN SIT ON WHAT MAKES THIS COULOMB
 * FRICTION RATHER THAN A DRAG CAP: THE BOUND IS PROPORTIONAL TO THE NORMAL LOAD. *** maxFric = mu * depth is
 * the whole law -- press harder, hold harder. Replacing it with a constant mu still sticks, still slides,
 * still bounds the tangential correction, and still produces a perfectly ordinary trajectory. WHAT IT LOSES
 * IS THE ONLY THING THE DEVICE MEASURES: the transition stops sitting at tan(theta) = mu, because the bound
 * no longer scales with the slope's normal component. Every existing figure is unchanged at the default.
 */
export function solvePlaneFriction(pred, prev, invMass, n, d, mu, { constantBound = false } = {}) {
    const nx = n[0], ny = n[1], nz = n[2], N = invMass.length;
    for (let i = 0; i < N; i++) {
        if (invMass[i] === 0) continue;
        const o = 3 * i;
        const dist = pred[o] * nx + pred[o + 1] * ny + pred[o + 2] * nz - d;
        if (dist >= 0) continue;                          // above the surface, no contact
        const depth = -dist;                              // normal correction magnitude
        pred[o] += depth * nx; pred[o + 1] += depth * ny; pred[o + 2] += depth * nz;   // push out to the surface
        // tangential motion since last step (perpendicular to the normal)
        let dxx = pred[o] - prev[o], dxy = pred[o + 1] - prev[o + 1], dxz = pred[o + 2] - prev[o + 2];
        const dn = dxx * nx + dxy * ny + dxz * nz;
        dxx -= dn * nx; dxy -= dn * ny; dxz -= dn * nz;   // tangential component
        const tLen = Math.sqrt(dxx * dxx + dxy * dxy + dxz * dxz);
        if (tLen < 1e-12) continue;
        const maxFric = constantBound ? mu : mu * depth;   // v3852 -- the plant drops the normal-load factor
        const scale = tLen <= maxFric ? 1 : maxFric / tLen;   // static: cancel all; kinetic: bounded by mu*depth
        pred[o] -= scale * dxx; pred[o + 1] -= scale * dxy; pred[o + 2] -= scale * dxz;
    }
}

// One substep of particles falling onto a static inclined plane with friction.
export function planeFrictionSubstep(state, n, d, mu, opts = {}) {
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, g = opts.gravity || [0, -10, 0];
    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; } else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; } }
    solvePlaneFriction(pred, prev, invMass, n, d, mu, { constantBound: !!opts.constantBound });
    for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; } pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2]; }
    return state;
}

// Build the up-pointing unit normal of a slope that rises `s` units per unit of x (s = tan of the slope angle). No trig.
export function slopeNormal(s) { const l = Math.sqrt(s * s + 1); return [-s / l, 1 / l, 0]; }
