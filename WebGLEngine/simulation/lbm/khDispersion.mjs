// simulation/lbm/khDispersion.mjs -- the Kelvin-Helmholtz test, done properly this time.
//
// v2445 tried this three times and failed three times, and the diagnosis is worth keeping because every one of the
// failures was in the QUESTION rather than the fluid:
//   1. The seed was spread through the bulk, so the measurement reported the seed's own viscous decay (-nu*k^2, dead
//      on) instead of the instability. It was measuring the wrong thing very accurately.
//   2. Localised onto the layer, it grew -- but the mode sat below the unstable band, so it crept.
//   3. Moved into the band, it decayed -- because the doubly-periodic box has TWO shear layers, and at that
//      wavelength the two were half a box apart and interfering with each other.
// Plus the measurement was RMS over the whole box, which sums every mode and both layers into one number.
//
// So: ONE layer, held between free-slip walls that stop the flow leaving without shearing it, so the only shear in the
// box is the one we put there. And a real FOURIER PROJECTION onto the seeded wavenumber, which ignores every other
// mode by construction.
//
// The prize is Michalke's 1964 dispersion relation for a tanh layer, which makes two exact claims: the layer is
// unstable only for k*delta < 1, and growth peaks at k*delta = 0.4446 with sigma = 0.1897 * U0/delta. Neither number
// is anywhere in this code. A sweep across the band has to find them.
"use strict";
import { makeLBM, viscosityOf } from "./lbm2d.js";

const MICHALKE = { neutral: 1.0, peakKD: 0.4446, peakSigma: 0.1897 };   // sigma is in units of U0/delta

function khRun(opts = {}) {
    const nx = opts.nx || 128, ny = opts.ny || 128, tau = opts.tau == null ? 0.52 : opts.tau;
    const U0 = opts.U0 == null ? 0.04 : opts.U0, delta = opts.delta || 6, mode = opts.mode || 1;
    const amp = opts.amp == null ? 1e-5 : opts.amp, steps = opts.steps || 4000;
    const k = 2 * Math.PI * mode / nx, yc = (ny - 1) / 2;
    // one layer, free-slip walls far away. u = U0 tanh((y-yc)/delta) is exactly Michalke's profile.
    const lbm = makeLBM({ nx, ny, tau, slip: true, init: (x, y) => ({
        rho: 1,
        ux: U0 * Math.tanh((y - yc) / delta),
        uy: amp * Math.sin(k * x) * Math.exp(-(((y - yc) / delta) ** 2))
    }) });
    // FOURIER PROJECTION: the amplitude of the seeded wavenumber alone. Every other mode is orthogonal to this sum
    // and contributes nothing -- which is the whole point, and what RMS-over-the-box could never do.
    function amplitude() {
        let re = 0, im = 0;
        for (let y = 1; y < ny - 1; y++) for (let x = 0; x < nx; x++) {
            const v = lbm.uy[y * nx + x], p = k * x;
            re += v * Math.cos(p); im += v * Math.sin(p);
        }
        return Math.hypot(re, im) / (nx * ny);
    }
    const hist = [];
    for (let s = 0; s < steps; s++) { lbm.step(); if (s % 10 === 0) hist.push(amplitude()); }
    // *** v3766 -- `thicknessConvention` DEFAULTS TO THE CORRECT "vorticity" AND EXISTS SO A PLANT CAN SIT ON
    // THE ABSCISSA. Michalke's relation is stated in k*delta with delta the VORTICITY THICKNESS, and the
    // HALF-THICKNESS is an equally common convention in the same literature -- so k*delta/2 is not a scrambled
    // number, it is THE SAME LAYER MEASURED THE OTHER WAY. Getting it wrong moves THE BAND EDGE BY A FACTOR OF
    // TWO while every growth rate stays exactly as measured: the fluid is untouched and only the x-axis lies. ***
    const kd = k * delta * (opts.thicknessConvention === "half" ? 0.5 : 1);
    return { hist, k, kd, U0, delta, nu: viscosityOf(tau), lbm, sampleEvery: 10 };
}
// growth rate from the LINEAR phase -- fitted before anything can saturate and flatten it (the v2447 lesson)
function fitGrowth(hist, sampleEvery, a, b) {
    const i0 = Math.floor(hist.length * (a == null ? 0.12 : a)), i1 = Math.floor(hist.length * (b == null ? 0.45 : b));
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = i0; i < i1; i++) { const Y = Math.log(Math.max(1e-300, hist[i])); n++; sx += i; sy += Y; sxx += i * i; sxy += i * Y; }
    return ((n * sxy - sx * sy) / (n * sxx - sx * sx)) / sampleEvery;   // per lattice step
}
// the dispersion curve: growth against wavenumber, in Michalke's units so it can be laid against his numbers
function dispersion(modes, opts = {}) {
    const rows = [];
    for (const mode of modes) {
        const r = khRun({ ...opts, mode });
        const sigma = fitGrowth(r.hist, r.sampleEvery, opts.fitA, opts.fitB);
        rows.push({ mode, kd: r.kd, sigma, sigmaNorm: sigma * r.delta / r.U0, grew: r.hist[r.hist.length - 1] > r.hist[0] });
    }
    return rows;
}
export { khRun, fitGrowth, dispersion, MICHALKE };
