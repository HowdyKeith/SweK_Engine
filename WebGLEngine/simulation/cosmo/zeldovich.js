// simulation/cosmo/zeldovich.js -- how the web actually forms, and the one moment in it that is exact.
//
// Zel'dovich (1970): instead of integrating gravity step by step, notice that in the early universe each parcel of
// matter simply COASTS along its initial impulse. So give every particle a displacement field once and slide it:
//
//     x(q, t) = q + D(t) * Psi(q)
//
// where q is the particle's undisturbed lattice position, Psi is the displacement, and D(t) is the growth factor --
// a single number that says how far cosmic time has carried the collapse. Astonishingly, this is not a cartoon: in
// ONE dimension it is EXACT, right up to the instant neighbouring sheets of matter cross each other.
//
// And that instant is analytic, which is the whole reason this file can be trusted. For a single mode of amplitude A
// and wavenumber k, the map x = q + D*A*sin(kq) stops being one-to-one exactly when dx/dq first touches zero:
//
//     dx/dq = 1 - D*A*k*cos(kq) = 0   ->   COLLAPSE AT  D = 1/(A k)
//
// Not approximately. Exactly. That is a caustic -- infinite density, the sheet folding on itself -- and it is the
// seed of every filament and cluster in the picture. So the code can be asked: at what D did YOUR sheet cross? and
// the answer must be 1/(Ak), and if it is not, nothing built on top means anything.
//
// Psi comes from the density field by solving Poisson in Fourier space, where the gradient is just a multiply:
//     Psi(k) = i * k_vec * delta(k) / |k|^2
"use strict";
import { fft3d } from "./fft.js";

const kOf = (i, n) => (i <= n / 2 ? i : i - n);

// The displacement field for a density contrast. Returns three real fields, Psi_x, Psi_y, Psi_z, in box units.
function displacementField({ delta, n, boxSize }) {
    const N = n * n * n;
    const dre = Float64Array.from(delta), dim = new Float64Array(N);
    fft3d(dre, dim, n, false);
    const kf = 2 * Math.PI / boxSize;
    const out = [];
    for (const axis of [0, 1, 2]) {
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            const kv = [kOf(x, n) * kf, kOf(y, n) * kf, kOf(z, n) * kf];
            const k2 = kv[0]*kv[0] + kv[1]*kv[1] + kv[2]*kv[2];
            const j = (z*n + y)*n + x;
            if (k2 === 0) { re[j] = 0; im[j] = 0; continue; }
            // Psi = i * k * delta / k^2  -- multiplying by i swaps re/im and flips a sign
            const s = kv[axis] / k2;
            re[j] = -dim[j] * s;
            im[j] =  dre[j] * s;
        }
        fft3d(re, im, n, true);
        out.push(re);
    }
    return { psi: out, n, boxSize };
}

// Slide the particles. D is the growth factor: 0 is the smooth early universe, larger D is later and lumpier.
function advect({ psi, n, boxSize }, D) {
    const N = n*n*n, pos = new Float64Array(N * 3);
    const dx = boxSize / n;
    let p = 0;
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const j = (z*n + y)*n + x;
        pos[p++] = x*dx + D * psi[0][j];
        pos[p++] = y*dx + D * psi[1][j];
        pos[p++] = z*dx + D * psi[2][j];
    }
    return pos;
}

// Bin the particles back onto a grid to get the density they now make -- cloud-in-cell, so the field is smooth
// enough to isosurface. THIS is the bridge: the output is a 3D scalar field, which marchScalarField already eats.
function densityGrid(pos, n, boxSize, nOut = n) {
    const g = new Float64Array(nOut*nOut*nOut);
    const cell = boxSize / nOut, np = pos.length / 3;
    const wrap = (i) => ((i % nOut) + nOut) % nOut;
    for (let i = 0; i < np; i++) {
        const fx = pos[i*3]/cell, fy = pos[i*3+1]/cell, fz = pos[i*3+2]/cell;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
        const tx = fx - x0, ty = fy - y0, tz = fz - z0;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
            const w = (a ? tx : 1-tx) * (b ? ty : 1-ty) * (c ? tz : 1-tz);
            g[(wrap(z0+c)*nOut + wrap(y0+b))*nOut + wrap(x0+a)] += w;
        }
    }
    const mean = np / (nOut*nOut*nOut);
    for (let i = 0; i < g.length; i++) g[i] = g[i]/mean - 1;    // density CONTRAST, as delta
    return g;
}
export { displacementField, advect, densityGrid };
