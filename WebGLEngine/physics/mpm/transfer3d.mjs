// physics/mpm/transfer3d.mjs -- v3804
//
// *** MPM IN 3D. Every key from the 2D transfer (v3789) LIFTS DIRECTLY -- partition of unity, linear momentum,
// angular momentum under APIC -- which is exactly why this is worth doing as a transfer first rather than
// porting the whole loop: IF THE IDENTITIES HOLD IN 3D, THE PIECES ABOVE THEM PORT MECHANICALLY. ***
//
// *** THE THREE THINGS THAT ARE GENUINELY DIFFERENT, AND EACH IS A PLACE TO GET IT WRONG:
//   THE STENCIL IS 27 NODES, NOT 9. Partition of unity is now a product of THREE one-dimensional sums, so a
//     slip on ONE axis is diluted by the other two rather than shouting.
//   ANGULAR MOMENTUM IS A VECTOR, NOT A SCALAR. In 2D it is one number; in 3D it is three components, and
//     they are REPORTED SEPARATELY rather than as |L| -- but AS A PRECAUTION, NOT ON EVIDENCE. I tried to
//     justify it by dropping the z-row of C, expecting two components to survive and one to break, AND IT
//     MOVED NOTHING: 0.00% on all three. That is correct behaviour, not a missed bug -- changing C on BOTH
//     sides consistently just describes a DIFFERENT rigid motion, which is still conserved. The only plant
//     that separates here (PIC) makes the two halves DISAGREE about C, and it hits all three components
//     EQUALLY at 55.56%. SO THE PER-COMPONENT REPORTING IS UNEXERCISED BY ANY PLANT I HAVE.
//   THE DEVIATOR SUBTRACTS trace/3, NOT trace/2 -- carried by whatever constitutive code follows, and the
//     single likeliest silent import from a 2D file. ***

/** Quadratic B-spline weights for one axis -- identical to 2D; the dimension is in how they are COMBINED. */
export function quadWeights(x, h) {
    const xi = x / h;
    const base = Math.floor(xi - 0.5);
    const fx = xi - base;
    return { base, w: [0.5 * (1.5 - fx) * (1.5 - fx), 0.75 - (fx - 1) * (fx - 1), 0.5 * (fx - 0.5) * (fx - 0.5)] };
}

export function makeGrid3(nx, ny, nz, h) {
    const n = (nx + 1) * (ny + 1) * (nz + 1);
    return { nx, ny, nz, h, n, mass: new Float64Array(n),
             mvx: new Float64Array(n), mvy: new Float64Array(n), mvz: new Float64Array(n), normalised: false };
}

const idx3 = (g, i, j, k) => (k * (g.ny + 1) + j) * (g.nx + 1) + i;

/** PARTICLES TO GRID over the 27-node stencil. Mass and momentum scatter with THE SAME weights. */
export function p2g3(particles, g, { affine = true } = {}) {
    g.mass.fill(0); g.mvx.fill(0); g.mvy.fill(0); g.mvz.fill(0);
    g.normalised = false;                       // the grid holds MOMENTUM after this (v3794's lesson, ported)
    let touched = 0;
    for (const p of particles) {
        const X = quadWeights(p.x, g.h), Y = quadWeights(p.y, g.h), Z = quadWeights(p.z, g.h);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
            const i = X.base + a, j = Y.base + b, k = Z.base + c;
            if (i < 0 || j < 0 || k < 0 || i > g.nx || j > g.ny || k > g.nz) continue;
            const w = X.w[a] * Y.w[b] * Z.w[c], q = idx3(g, i, j, k);
            const dx = i * g.h - p.x, dy = j * g.h - p.y, dz = k * g.h - p.z;
            // APIC: C is a 3x3 affine matrix, row-major [xx xy xz; yx yy yz; zx zy zz]
            const C = p.C || [0, 0, 0, 0, 0, 0, 0, 0, 0];
            const vx = affine ? p.vx + (C[0] * dx + C[1] * dy + C[2] * dz) : p.vx;
            const vy = affine ? p.vy + (C[3] * dx + C[4] * dy + C[5] * dz) : p.vy;
            const vz = affine ? p.vz + (C[6] * dx + C[7] * dy + C[8] * dz) : p.vz;
            g.mass[q] += w * p.m;
            g.mvx[q] += w * p.m * vx; g.mvy[q] += w * p.m * vy; g.mvz[q] += w * p.m * vz;
            touched++;
        }
    }
    return touched;
}

/** GRID TO PARTICLES. Reads g.normalised, exactly as the 2D version does since v3794. */
export function g2p3(particles, g, { affine = true } = {}) {
    const D_inv = 4 / (g.h * g.h);
    const alreadyVelocity = g.normalised === true;
    for (const p of particles) {
        const X = quadWeights(p.x, g.h), Y = quadWeights(p.y, g.h), Z = quadWeights(p.z, g.h);
        let vx = 0, vy = 0, vz = 0;
        const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
            const i = X.base + a, j = Y.base + b, k = Z.base + c;
            if (i < 0 || j < 0 || k < 0 || i > g.nx || j > g.ny || k > g.nz) continue;
            const q = idx3(g, i, j, k), m = g.mass[q];
            if (m <= 0) continue;
            const w = X.w[a] * Y.w[b] * Z.w[c];
            const nvx = alreadyVelocity ? g.mvx[q] : g.mvx[q] / m;
            const nvy = alreadyVelocity ? g.mvy[q] : g.mvy[q] / m;
            const nvz = alreadyVelocity ? g.mvz[q] : g.mvz[q] / m;
            const dx = i * g.h - p.x, dy = j * g.h - p.y, dz = k * g.h - p.z;
            vx += w * nvx; vy += w * nvy; vz += w * nvz;
            if (affine) {
                C[0] += w * nvx * dx; C[1] += w * nvx * dy; C[2] += w * nvx * dz;
                C[3] += w * nvy * dx; C[4] += w * nvy * dy; C[5] += w * nvy * dz;
                C[6] += w * nvz * dx; C[7] += w * nvz * dy; C[8] += w * nvz * dz;
            }
        }
        p.vx = vx; p.vy = vy; p.vz = vz;
        p.C = affine ? C.map((v) => D_inv * v) : [0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
}

export function particleMomentum3(ps) {
    let x = 0, y = 0, z = 0;
    for (const p of ps) { x += p.m * p.vx; y += p.m * p.vy; z += p.m * p.vz; }
    return [x, y, z];
}

export function gridMomentum3(g) {
    let x = 0, y = 0, z = 0;
    for (let q = 0; q < g.n; q++) { x += g.mvx[q]; y += g.mvy[q]; z += g.mvz[q]; }
    return [x, y, z];
}

/**
 * *** ANGULAR MOMENTUM AS A VECTOR. L = m (r x v) plus the affine term, which in 3D is the ANTISYMMETRIC part
 * of C scaled by the kernel's second moment (h^2/4 per axis). Returning THREE COMPONENTS rather than a
 * magnitude is deliberate: a plant can conserve two and destroy the third, and |L| would hide it. ***
 */
export function particleAngular3(ps, h) {
    const D = (h * h) / 4;
    let lx = 0, ly = 0, lz = 0;
    for (const p of ps) {
        lx += p.m * (p.y * p.vz - p.z * p.vy);
        ly += p.m * (p.z * p.vx - p.x * p.vz);
        lz += p.m * (p.x * p.vy - p.y * p.vx);
        const C = p.C || [0, 0, 0, 0, 0, 0, 0, 0, 0];
        lx += p.m * D * (C[7] - C[5]);          // zy - yz
        ly += p.m * D * (C[2] - C[6]);          // xz - zx
        lz += p.m * D * (C[3] - C[1]);          // yx - xy
    }
    return [lx, ly, lz];
}

export function gridAngular3(g) {
    let lx = 0, ly = 0, lz = 0;
    for (let k = 0; k <= g.nz; k++) for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) {
        const q = idx3(g, i, j, k), x = i * g.h, y = j * g.h, z = k * g.h;
        lx += y * g.mvz[q] - z * g.mvy[q];
        ly += z * g.mvx[q] - x * g.mvz[q];
        lz += x * g.mvy[q] - y * g.mvx[q];
    }
    return [lx, ly, lz];
}

/** A rigidly rotating block about an ARBITRARY axis, so all three components of L are non-zero. */
export function spinningBlock3({ n = 4, spacing = 0.4, x0 = 2, y0 = 2, z0 = 2, m = 0.5,
                                 omega = [0.7, 1.1, -0.5] } = {}) {
    const ps = [];
    const cx = x0 + (n - 1) * spacing / 2, cy = y0 + (n - 1) * spacing / 2, cz = z0 + (n - 1) * spacing / 2;
    const [ox, oy, oz] = omega;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) {
        const x = x0 + a * spacing, y = y0 + b * spacing, z = z0 + c * spacing;
        const rx = x - cx, ry = y - cy, rz = z - cz;
        ps.push({ x, y, z,
                  vx: oy * rz - oz * ry, vy: oz * rx - ox * rz, vz: ox * ry - oy * rx,
                  m,
                  // C for a rigid rotation is the antisymmetric spin matrix
                  C: [0, -oz, oy, oz, 0, -ox, -oy, ox, 0] });
    }
    return ps;
}
