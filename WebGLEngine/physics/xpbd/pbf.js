// physics/xpbd/pbf.js
//
// A real position-based-fluids density solver for the fluid-fluid slot -- pressure that comes from density, not just
// beads that refuse to overlap. Each particle carries a density constraint C_i = rho_i/rho0 - 1; where the fluid is
// packed too tight, C_i is positive and the projection spreads the particles apart until the density relaxes to rest.
// This is the Macklin-Muller PBF, and it fits this engine for two reasons. Its kernels are POLYNOMIAL -- poly6 is
// (h^2 - r^2)^3 and the spiky gradient is (h - r)^2 -- so there is no transcendental and the math stays bit-identical.
//
// The determinism subtlety that PBF forces into the open: density is a SUM over neighbours, and floating-point sums
// are order-sensitive (a+b+c is not a+c+b to the last bit). So the neighbour lists are SORTED by index before any sum
// is taken, which makes every density, every lambda, and every position correction a pure function of position. Leave
// the lists unsorted and the sums drift with bucket-walk order -- that is the sabotage. Pure +,-,*,/ and sqrt.

const PI = Math.PI;

// poly6 W(r,h) and spiky gradient magnitude |gradW|(r,h) -- polynomial, evaluated only for 0 < r < h. h^9 and h^6
// are built by multiplication (no Math.pow: it is a libm call and not guaranteed bit-identical across machines).
function poly6(r2, h) { const h2 = h * h; if (r2 >= h2) return 0; const h9 = h2 * h2 * h2 * h2 * h; const d = h2 - r2; return (315 / (64 * PI * h9)) * d * d * d; }
function spikyGradMag(r, h) { if (r >= h || r <= 0) return 0; const h6 = h * h * h * h * h * h; const d = h - r; return (45 / (PI * h6)) * d * d; }

const cellOf = (v, cs) => Math.floor(v / cs);
const keyOf = (x, y, z) => x + "," + y + "," + z;

// Sorted neighbour lists: for each particle, the indices of particles within h, in ascending order. Deterministic.
// visitOrder lets the gate scramble the build; sorted output does not change.
export function buildNeighbors(pos, n, h, visitOrder) {
    const order = visitOrder || Array.from({ length: n }, (_, i) => i);
    const buckets = new Map();
    for (const i of order) { const k = keyOf(cellOf(pos[3 * i], h), cellOf(pos[3 * i + 1], h), cellOf(pos[3 * i + 2], h)); (buckets.get(k) || buckets.set(k, []).get(k)).push(i); }  // within-bucket order follows the walk
    const h2 = h * h;
    const nbr = new Array(n);
    for (let i = 0; i < n; i++) {
        const list = [];
        const cx = cellOf(pos[3 * i], h), cy = cellOf(pos[3 * i + 1], h), cz = cellOf(pos[3 * i + 2], h);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            const b = buckets.get(keyOf(cx + dx, cy + dy, cz + dz)); if (!b) continue;
            for (const j of b) { if (j === i) continue; const ex = pos[3 * i] - pos[3 * j], ey = pos[3 * i + 1] - pos[3 * j + 1], ez = pos[3 * i + 2] - pos[3 * j + 2]; if (ex * ex + ey * ey + ez * ez < h2) list.push(j); }
        }
        list.sort((a, b) => a - b);                 // canonical order -> the density sum is the same bits on any machine
        nbr[i] = list;
    }
    return nbr;
}

// One PBF density projection over `iterations`: compute lambda per particle, then the position correction. In place.
export function pbfProject(pred, n, invMass, nbr, opts = {}) {
    const h = opts.h ?? 0.25, rho0 = opts.rho0 ?? 1.0, eps = opts.eps ?? 1e-4, iterations = opts.iterations ?? 3;
    // artificial pressure (s_corr): a small repulsion that cures the tensile instability -- particles clumping into
    // clusters and voids in stretched regions. sCorrK 0 disables it. The exponent is an integer power built by
    // multiplication (no Math.pow), so it stays bit-identical.
    const sCorrK = opts.sCorrK ?? 0, sCorrDq = opts.sCorrDq ?? 0.2;
    const wDq = poly6((sCorrDq * h) * (sCorrDq * h), h);
    const lambda = new Float64Array(n);
    for (let it = 0; it < iterations; it++) {
        for (let i = 0; i < n; i++) {
            if (invMass[i] === 0) { lambda[i] = 0; continue; }
            const list = nbr[i];
            let rho = poly6(0, h);                  // self contribution
            for (let a = 0; a < list.length; a++) { const j = list[a]; const ex = pred[3 * i] - pred[3 * j], ey = pred[3 * i + 1] - pred[3 * j + 1], ez = pred[3 * i + 2] - pred[3 * j + 2]; rho += poly6(ex * ex + ey * ey + ez * ez, h); }
            const C = rho / rho0 - 1;
            // sum of squared gradients: grad_i C and grad_j C
            let sumGrad2 = 0, gix = 0, giy = 0, giz = 0;
            for (let a = 0; a < list.length; a++) {
                const j = list[a]; const ex = pred[3 * i] - pred[3 * j], ey = pred[3 * i + 1] - pred[3 * j + 1], ez = pred[3 * i + 2] - pred[3 * j + 2];
                const r = Math.sqrt(ex * ex + ey * ey + ez * ez); if (r < 1e-12) continue;
                const g = spikyGradMag(r, h) / rho0, gx = g * ex / r, gy = g * ey / r, gz = g * ez / r;
                gix += gx; giy += gy; giz += gz;
                sumGrad2 += gx * gx + gy * gy + gz * gz;           // |grad_j C|^2
            }
            sumGrad2 += gix * gix + giy * giy + giz * giz;         // |grad_i C|^2
            lambda[i] = -C / (sumGrad2 + eps);
        }
        for (let i = 0; i < n; i++) {
            if (invMass[i] === 0) continue;
            const list = nbr[i]; let dx = 0, dy = 0, dz = 0;
            for (let a = 0; a < list.length; a++) {
                const j = list[a]; const ex = pred[3 * i] - pred[3 * j], ey = pred[3 * i + 1] - pred[3 * j + 1], ez = pred[3 * i + 2] - pred[3 * j + 2];
                const r = Math.sqrt(ex * ex + ey * ey + ez * ez); if (r < 1e-12) continue;
                const g = spikyGradMag(r, h) / rho0;
                let sc = 0;
                if (sCorrK) { const ratio = poly6(r * r, h) / wDq, r2 = ratio * ratio; sc = -sCorrK * r2 * r2; }   // -k (W/Wdq)^4, integer power
                const coeff = (lambda[i] + lambda[j] + sc);
                dx -= coeff * g * ex / r; dy -= coeff * g * ey / r; dz -= coeff * g * ez / r;   // gradW = -spikyGradMag * rhat
            }
            pred[3 * i] += dx; pred[3 * i + 1] += dy; pred[3 * i + 2] += dz;
        }
    }
    return lambda;
}

// XSPH viscosity: nudge each particle's velocity toward the poly6-weighted average of its neighbours, making the flow
// coherent instead of noisy. The blend is normalised by the total weight so it is a bounded weighted average (c in
// [0,1] is the blend fraction), independent of the kernel's scale. Deterministic -- same canonical sorted neighbours.
export function applyXSPH(pos, vel, n, nbr, h, c) {
    const dv = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) {
        const list = nbr[i]; let wsum = 0, ax = 0, ay = 0, az = 0;
        for (let a = 0; a < list.length; a++) {
            const j = list[a]; const ex = pos[3 * i] - pos[3 * j], ey = pos[3 * i + 1] - pos[3 * j + 1], ez = pos[3 * i + 2] - pos[3 * j + 2];
            const w = poly6(ex * ex + ey * ey + ez * ez, h); wsum += w;
            ax += w * (vel[3 * j] - vel[3 * i]); ay += w * (vel[3 * j + 1] - vel[3 * i + 1]); az += w * (vel[3 * j + 2] - vel[3 * i + 2]);
        }
        if (wsum > 1e-12) { dv[3 * i] = c * ax / wsum; dv[3 * i + 1] = c * ay / wsum; dv[3 * i + 2] = c * az / wsum; }
    }
    for (let i = 0; i < 3 * n; i++) vel[i] += dv[i];
}

// Mean and spread of density -- the gate uses these to show the projection drives density toward rest.
export function densityStats(pos, n, nbr, h, rho0) {
    let sum = 0, sum2 = 0;
    for (let i = 0; i < n; i++) { const list = nbr[i]; let rho = poly6(0, h); for (let a = 0; a < list.length; a++) { const j = list[a]; const ex = pos[3 * i] - pos[3 * j], ey = pos[3 * i + 1] - pos[3 * j + 1], ez = pos[3 * i + 2] - pos[3 * j + 2]; rho += poly6(ex * ex + ey * ey + ez * ez, h); } const e = rho / rho0 - 1; sum += e; sum2 += e * e; }
    return { meanErr: sum / n, rms: Math.sqrt(sum2 / n) };
}

export { poly6, spikyGradMag };
