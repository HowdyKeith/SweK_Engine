// physics/xpbd/sampledField.js
//
// The coupling that reaches outside the engine. Every field so far has been one the engine computed for itself --
// temperature, density, an activation signal. This one is handed in from the world: a regular 3D grid of vectors,
// exactly the shape a volumetric radar return or a Doppler-velocity volume takes, sampled at each particle's position
// and applied as a force. The fluid billows along a wind it did not generate. It is the modulation spine with an
// external field driving it, and the only new machinery is the sampling.
//
// The sampling is trilinear -- the eight grid corners around a point, blended by the fractional position in each axis.
// Trilinear reproduces any affine field exactly, which nearest-neighbour cannot, and it is pure arithmetic, so it is
// bit-identical across machines. Out-of-range points clamp to the grid edge rather than read past it. Pure +,-,*,/.

// Sample a vector grid (component-interleaved, index ((k*ny + j)*nx + i)*3 + c) trilinearly at world (x,y,z).
export function sampleVec(grid, nx, ny, nz, ox, oy, oz, sp, x, y, z, out) {
    let gx = (x - ox) / sp, gy = (y - oy) / sp, gz = (z - oz) / sp;
    if (gx < 0) gx = 0; else if (gx > nx - 1) gx = nx - 1;         // clamp to the grid
    if (gy < 0) gy = 0; else if (gy > ny - 1) gy = ny - 1;
    if (gz < 0) gz = 0; else if (gz > nz - 1) gz = nz - 1;
    const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz);
    const i1 = i0 + 1 < nx ? i0 + 1 : i0, j1 = j0 + 1 < ny ? j0 + 1 : j0, k1 = k0 + 1 < nz ? k0 + 1 : k0;
    const fx = gx - i0, fy = gy - j0, fz = gz - k0;
    const at = (i, j, k) => ((k * ny + j) * nx + i) * 3;
    for (let c = 0; c < 3; c++) {
        const c000 = grid[at(i0, j0, k0) + c], c100 = grid[at(i1, j0, k0) + c], c010 = grid[at(i0, j1, k0) + c], c110 = grid[at(i1, j1, k0) + c];
        const c001 = grid[at(i0, j0, k1) + c], c101 = grid[at(i1, j0, k1) + c], c011 = grid[at(i0, j1, k1) + c], c111 = grid[at(i1, j1, k1) + c];
        const c00 = c000 * (1 - fx) + c100 * fx, c10 = c010 * (1 - fx) + c110 * fx, c01 = c001 * (1 - fx) + c101 * fx, c11 = c011 * (1 - fx) + c111 * fx;
        const c0 = c00 * (1 - fy) + c10 * fy, c1 = c01 * (1 - fy) + c11 * fy;
        out[c] = c0 * (1 - fz) + c1 * fz;
    }
    return out;
}

// Build a vector grid by evaluating fn(x,y,z) -> [vx,vy,vz] at each cell centre. Used to make test / demo fields.
export function buildVectorGrid(nx, ny, nz, ox, oy, oz, sp, fn) {
    const grid = new Float64Array(nx * ny * nz * 3);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const v = fn(ox + i * sp, oy + j * sp, oz + k * sp), o = ((k * ny + j) * nx + i) * 3;
        grid[o] = v[0]; grid[o + 1] = v[1]; grid[o + 2] = v[2];
    }
    return grid;
}

// One substep: each particle samples the external field and takes it as a force (a wind it did not generate).
export function sampledFieldSubstep(state, field, opts = {}) {
    const { pos, vel, invMass } = state, N = invMass.length;
    const dt = opts.dt ?? 0.016, strength = opts.strength ?? 1.0, damping = opts.damping ?? 0.0;
    const { nx, ny, nz, ox, oy, oz, sp } = field.dims, grid = field.grid;
    const s = [0, 0, 0];
    for (let a = 0; a < N; a++) {
        if (invMass[a] === 0) continue;
        const o = 3 * a;
        sampleVec(grid, nx, ny, nz, ox, oy, oz, sp, pos[o], pos[o + 1], pos[o + 2], s);
        vel[o] += strength * s[0] * dt; vel[o + 1] += strength * s[1] * dt; vel[o + 2] += strength * s[2] * dt;
        if (damping) { vel[o] *= (1 - damping); vel[o + 1] *= (1 - damping); vel[o + 2] *= (1 - damping); }
        pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
    }
    return state;
}
