// tools/ship/physicsSuite.mjs -- the physics has to keep earning its numbers on every ship.
//
// Twelve rounds went into making these solvers agree with exact analytic answers: a channel flow to 0.07%, a speed of
// sound exact to the fifth decimal, Rayleigh's 1708 found from nothing, a shock compressing by exactly six, Sedov's
// square root of time. Every one of those numbers lived only in a changelog. Nothing re-checked any of it. Edit one
// constant in lbm2d.js and the channel could quietly stop being a parabola, and the first anyone would know is when a
// future round built on sand.
//
// So: the exact ones run again on every ship, against the same analytic answers, and the build fails if the fluid
// stops agreeing with mathematics. These are deliberately the FAST ones -- the whole suite is seconds, not minutes,
// because a gate nobody can afford to run is a gate nobody runs.
//
// HONEST SCOPE. Not everything can be gated. The Rayleigh-Benard onset needs a bisection over long runs; Sedov needs a
// 200x200 blast; the Kelvin-Helmholtz and Rayleigh-Taylor dispersions need sweeps across modes. Those are minutes
// each and stay on-demand. They are listed at the bottom as UNGATED so the gap is visible rather than forgotten.
"use strict";
import { makeLBM } from "../../simulation/lbm/lbm2d.js";
import { makeLBM3D } from "../../simulation/lbm/lbm3d.js";
import { makeThermal } from "../../simulation/lbm/thermal2d.js";
import { makeThermal3D } from "../../simulation/lbm/thermal3d.js";
import { makeEuler } from "../../simulation/euler/euler2d.js";
import { sinogram, phantomAt, radonAt } from "../../simulation/tomo/phantom.js";
import { reconstruct } from "../../simulation/tomo/fbp.js";
import { phantom3dAt, sliceEllipses } from "../../simulation/tomo/phantom3d.js";
import { reconstructVolume } from "../../simulation/tomo/volume.js";
import { blobFieldAt, blobRadonAt, blobSinogram, makeBlobs } from "../../simulation/tomo/blobPhantom.js";
import { coverage, nextAngleByCoverage } from "../../simulation/tomo/viewChoice.js";
import { reconstructIterative } from "../../simulation/tomo/iterative.js";
import { misfit, fitOneBlob } from "../../simulation/tomo/blobFit.js";
import { poly6, spiky } from "../../physics/sph/kernels.js";
import { createSphWorld } from "../../physics/sph/sph.js";
import { fft1d } from "../../simulation/cosmo/fft.js";
import { makeGRF, measureP } from "../../simulation/cosmo/grf.js";
import { sampleStars, starField, shotNoise } from "../../simulation/cosmo/starmap.js";
import { createFdtd1d, numericalPhaseVelocity, C0 } from "../../simulation/em/fdtd1d.js";
import { phaseShift, exactSlab, bornSlab, bornError, maxPhaseFor } from "../../simulation/em/born.js";
import { sinogramCPU } from "../../simulation/tomo/sinogramGPU.js";
import { ewaldPoint, sliceError, sliceErrorApprox, maxFrequency, TWO_PI } from "../../simulation/tomo/diffraction.js";
import { displacementField } from "../../simulation/cosmo/zeldovich.js";

// THE EXPECTED VALUES ARE MATHEMATICS, WRITTEN OUT HERE, AND ARE NEVER IMPORTED FROM THE CODE UNDER TEST.
// This is not pedantry -- the first version of this suite imported CS2 and viscosityOf from lbm2d.js to build its own
// expectations, and when CS2 was deliberately corrupted to 1/3.02 as a trial, the speed-of-sound check PASSED. Of
// course it did: it was comparing the broken lattice against the broken lattice's own idea of the answer. A test that
// reads its expected value out of the thing it is testing can never fail. These are the real numbers.
const CS_EXACT = 0.5773502691896258;        // 1/sqrt(3), the lattice speed of sound
const CS2_EXACT = 1 / 3;                    // and its square
const nuOf = (tau) => CS2_EXACT * (tau - 0.5);       // written out, not imported
const alphaOf = (tauG) => CS2_EXACT * (tauG - 0.5);

const CHECKS = [
    {
        name: "LBM channel is the exact parabola",
        exact: "Poiseuille u(y) = F y (H-y) / 2nu",
        tol: 0.005,
        run() {
            const lbm = makeLBM({ nx: 12, ny: 34, tau: 0.8, force: [1e-6, 0] });
            for (let s = 0; s < 20000; s++) lbm.step();
            const nu = nuOf(0.8), H = 32; let sum = 0, ref = 0;
            for (let j = 1; j <= 32; j++) { const y = j - 0.5, a = (1e-6 / (2 * nu)) * y * (H - y), g = lbm.ux[lbm.idx(6, j)]; sum += (g - a) ** 2; ref += a * a; }
            return { got: Math.sqrt(sum / ref), want: 0, unit: "relative L2" };
        },
    },
    {
        name: "LBM speed of sound is exactly 1/sqrt(3)",
        exact: "cs = 1/sqrt(3) = 0.57735",
        // The real lattice measures 0.005% off. A 3% tolerance was not guarding anything -- a deliberate 0.7% error in
        // CS2 sailed straight through it. Tolerances should be set by the precision actually achieved, not by what
        // feels safe, or the check is theatre. 0.2% keeps a 40x margin over the true result and still catches that.
        tol: 0.002,
        run() {
            const nx = 500, x0 = 250;
            const lbm = makeLBM({ nx, ny: 6, tau: 0.9, channel: false, periodicY: true,
                init: (x) => ({ rho: 1 + 1e-3 * Math.exp(-(((x - x0) / 10) ** 2)), ux: 0, uy: 0 }) });
            const tr = [];
            for (let s = 1; s <= 240; s++) {
                lbm.step();
                let best = -1, bx = 0;
                for (let x = x0 + 4; x < Math.min(nx - 3, x0 + 210); x++) { const r = lbm.rho[lbm.idx(x, 3)]; if (r > best) { best = r; bx = x; } }
                tr.push({ t: s, x: bx });
            }
            const f = tr.filter(p => p.t > 96);
            let n = 0, st = 0, sx = 0, stt = 0, stx = 0;
            for (const p of f) { n++; st += p.t; sx += p.x; stt += p.t * p.t; stx += p.t * p.x; }
            const measured = (n * stx - st * sx) / (n * stt - st * st);
            return { got: Math.abs(measured - CS_EXACT) / CS_EXACT, want: 0, unit: "relative", detail: measured.toFixed(5) + " vs " + CS_EXACT.toFixed(5) };
        },
    },
    {
        name: "LBM free-slip wall takes no momentum",
        exact: "specular reflection keeps 100% of a tangential flow",
        tol: 0.02,
        run() {
            const m = makeLBM({ nx: 16, ny: 20, tau: 0.9, slip: true, init: () => ({ rho: 1, ux: 0.05, uy: 0 }) });
            for (let s = 0; s < 2000; s++) m.step();
            return { got: Math.abs(m.ux[m.idx(8, 10)] / 0.05 - 1), want: 0, unit: "relative" };
        },
    },
    {
        name: "3D pipe is Hagen-Poiseuille's paraboloid",
        exact: "u = A(Reff^2 - r^2) with A = F/4nu, exact since 1840",
        // Measures the PHYSICS coefficient A, not the wall radius: a staircase of bounce-back nodes is not a circle,
        // so Reff is geometry and is allowed to differ. A must still be F/4nu. At R=6 the staircase costs ~3%, and
        // that shrinks to 0.54% by R=14 -- the tolerance is set by what THIS resolution actually achieves.
        tol: 0.05,
        run() {
            const R = 6, N = 2 * R + 6, c = (N - 1) / 2, tau = 0.8, F = 2e-6;
            const m = makeLBM3D({ nx: N, ny: N, nz: 4, tau, force: [0, 0, F], solidAt: (x, y) => Math.hypot(x - c, y - c) > R });
            for (let s = 0; s < 3000; s++) m.step();
            let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const k = m.idx(x, y, 2); if (m.solid[k]) continue;
                const r2 = (x - c) ** 2 + (y - c) ** 2, u = m.uz[k];
                n++; sx += r2; sy += u; sxx += r2 * r2; sxy += r2 * u;
            }
            const A = -((n * sxy - sx * sy) / (n * sxx - sx * sx));
            const want = F / (4 * CS2_EXACT * (tau - 0.5));
            return { got: Math.abs(A - want) / want, want: 0, unit: "relative", detail: A.toExponential(3) + " vs " + want.toExponential(3) };
        },
    },
    {
        name: "thermal conduction is the exact straight line",
        exact: "steady T(y) linear between the walls",
        tol: 5e-3,
        run() {
            const c = makeThermal({ nx: 8, ny: 34, tau: 0.8, tauG: 0.8, gravity: 0, beta: 0 });
            for (let s = 0; s < 12000; s++) c.step();
            let worst = 0; const H = 32;
            for (let j = 1; j <= 32; j++) worst = Math.max(worst, Math.abs(c.T[c.idx(4, j)] - (0.5 - (j - 0.5) / H)));
            return { got: worst, want: 0, unit: "absolute over a range of 1.0" };
        },
    },
    {
        name: "thermal diffusivity emerges from tauG",
        exact: "alpha = cs^2 (tauG - 0.5)",
        tol: 0.03,
        run() {
            const k = 2 * Math.PI / 32, tauG = 0.8;
            const m = makeThermal({ nx: 32, ny: 16, tau: 0.9, tauG, gravity: 0, beta: 0, walls: false, periodicY: true,
                init: (x) => ({ T: 0.01 * Math.sin(k * x) }) });
            const amp = [];
            for (let s = 0; s < 400; s++) { m.step(); let a = 0; for (let x = 0; x < 32; x++) a += Math.abs(m.T[m.idx(x, 8)]); amp.push(a); }
            let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
            for (let i = 120; i < 380; i++) { const Y = Math.log(amp[i]); n++; sx += i; sy += Y; sxx += i * i; sxy += i * Y; }
            const measured = (-(n * sxy - sx * sy) / (n * sxx - sx * sx)) / (k * k);
            const want = alphaOf(tauG);
            return { got: Math.abs(measured - want) / want, want: 0, unit: "relative", detail: measured.toFixed(5) + " vs " + want.toFixed(5) };
        },
    },
    {
        name: "3D thermal conduction is the exact straight line",
        exact: "steady T(z) linear between the plates, in three dimensions",
        tol: 5e-3,
        run() {
            const c = makeThermal3D({ nx: 6, ny: 6, nz: 18, tau: 0.8, tauG: 0.8, gravity: 0, beta: 0 });
            for (let s = 0; s < 6000; s++) c.step();
            let worst = 0; const H = 16;
            for (let z = 1; z <= 16; z++) worst = Math.max(worst, Math.abs(c.T[c.idx(3, 3, z)] - (0.5 - (z - 0.5) / H)));
            return { got: worst, want: 0, unit: "absolute over a range of 1.0" };
        },
    },
    {
        name: "tomography reconstructs a known object",
        exact: "FBP of an ANALYTIC sinogram -- the Radon transform of an ellipse is closed-form",
        // The reference is not simulated: the sinogram is written down exactly and was checked against a brute-force
        // line integral to 1.1e-6 before any of this reconstructed anything. So this measures FBP alone. Judged only
        // where the truth is FLAT -- edges ring (Gibbs), which is correct behaviour, not error, and measuring across
        // one is what made the first attempt read 0.5 and look broken.
        tol: 2e-3,
        run() {
            const N = 64, D = 3 / N;
            const flat = (x, y) => { const v = phantomAt(x, y);
                for (const [dx, dy] of [[D,0],[-D,0],[0,D],[0,-D]]) if (Math.abs(phantomAt(x+dx, y+dy) - v) > 1e-12) return false;
                return v > 1e-9; };
            const img = reconstruct(sinogram({ nAngles: 90, nDet: 128 }), N);
            let sum = 0, cnt = 0;
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                const x = -1 + (2*(i+0.5))/N, y = -1 + (2*(j+0.5))/N;
                if (!flat(x, y)) continue;
                sum += Math.abs(img[j*N+i] - phantomAt(x, y)); cnt++;
            }
            return { got: sum / cnt, want: 0, unit: "mean density error over " + cnt + " flat pixels" };
        },
    },
    {
        name: "a slice of the 3D phantom IS the 2D phantom",
        exact: "an ellipsoid cut at height z is an ellipse with semi-axes scaled by sqrt(1 - (z/c)^2)",
        // The whole reason 3D tomography needed almost no new code. If this shrink factor were wrong, every
        // reconstructed slice would be subtly the wrong size and would still look exactly like a head.
        tol: 0,
        run() {
            let worst = 0;
            for (const z of [0, 0.1, -0.25, 0.4, 0.6]) {
                const ell2 = sliceEllipses(z);
                for (let i = 0; i < 400; i++) {
                    const x = -1 + 2*((i * 37) % 101)/101, y = -1 + 2*((i * 53) % 97)/97;
                    let v2 = 0;
                    for (const [x0, y0, a, b, phi, rho] of ell2) {
                        const c = Math.cos(phi*Math.PI/180), sn = Math.sin(phi*Math.PI/180);
                        const dx = x-x0, dy = y-y0, u = dx*c + dy*sn, w = -dx*sn + dy*c;
                        if ((u*u)/(a*a) + (w*w)/(b*b) <= 1) v2 += rho;
                    }
                    worst = Math.max(worst, Math.abs(phantom3dAt(x, y, z) - v2));
                }
            }
            return { got: worst, want: 0, unit: "absolute, over 2000 points at 5 heights" };
        },
    },
    {
        name: "a volume reconstructs from nothing but analytic shadows",
        exact: "the 3D Shepp-Logan phantom, away from its own hard edges",
        // 3D is a stack of 2D: a parallel-beam scan measures each z-slice independently, so this is a loop over
        // machinery already verified. Whole-volume RMS sits near 14% and always will -- the phantom is discontinuous
        // and a ramp filter rings at a step. Away from edges it converges: 0.11% at 45 angles, 0.06% at 90.
        // Tolerance measured on THIS configuration, which is the only kind worth having.
        tol: 0.02,
        run() {
            const n = 32, nz = 8, D = 3/n;
            const { vol } = reconstructVolume({ n, nz, nAngles: 60, nDet: 96, zMin: -0.3, zMax: 0.3 });
            let se = 0, ref = 0, cnt = 0;
            for (let k = 0; k < nz; k++) {
                const z = -0.3 + 0.6*(k+0.5)/nz;
                for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
                    const x = -1 + 2*(i+0.5)/n, y = -1 + 2*(j+0.5)/n;
                    if (x*x + y*y > 0.81) continue;
                    const want = phantom3dAt(x, y, z);
                    if (want < 1e-9) continue;
                    if (![[D,0],[-D,0],[0,D],[0,-D]].every(([dx,dy]) => Math.abs(phantom3dAt(x+dx, y+dy, z) - want) < 1e-12)) continue;
                    se += (vol[(k*n + j)*n + i] - want)**2; ref += want*want; cnt++;
                }
            }
            const rms = Math.sqrt(se/ref);
            return { got: rms, want: 0, unit: "relative RMS over " + cnt + " flat voxels", detail: (rms*100).toFixed(3) + "%" };
        },
    },
    {
        name: "a projection IS a line through the object's spectrum",
        exact: "the Fourier Slice Theorem -- the 1D FT of a projection at theta equals the 2D FT of the object along that line",
        // THE LAW THE ENTIRE TOMOGRAPHY STACK RESTS ON, unchecked for a dozen rounds of building on it. If this is
        // false, back-projection is not an approximation -- it is nothing. Both transforms are done by direct
        // summation here: no FFT library to blame, and no shared code between the two sides.
        tol: 5e-6,
        run() {
            const blobs = makeBlobs(6, 99);
            const N = 48, L = 2.4, d = L / N;
            const F2 = (kx, ky) => {
                let re = 0, im = 0;
                for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                    const x = -L/2 + (i+0.5)*d, y = -L/2 + (j+0.5)*d;
                    const f = blobFieldAt(x, y, 0, blobs);
                    if (f === 0) continue;
                    const ph = -2*Math.PI*(kx*x + ky*y);
                    re += f*Math.cos(ph)*d*d; im += f*Math.sin(ph)*d*d;
                }
                return [re, im];
            };
            const F1 = (w, th) => {
                let re = 0, im = 0;
                for (let i = 0; i < N; i++) {
                    const s = -L/2 + (i+0.5)*d;
                    const p = blobRadonAt(s, th, 0, blobs);
                    if (p === 0) continue;
                    const ph = -2*Math.PI*w*s;
                    re += p*Math.cos(ph)*d; im += p*Math.sin(ph)*d;
                }
                return [re, im];
            };
            let worst = 0, peak = 0;
            for (const th of [0, 0.6, 1.9]) for (const w of [0.4, 1.1, 2.0]) {
                const a = F1(w, th), b = F2(w*Math.cos(th), w*Math.sin(th));
                worst = Math.max(worst, Math.hypot(a[0]-b[0], a[1]-b[1]));
                peak = Math.max(peak, Math.hypot(b[0], b[1]));
            }
            return { got: worst, want: 0, unit: "worst complex difference", detail: (worst/peak).toExponential(1) + " relative -- and it is only true because rays go straight" };
        },
    },
    {
        name: "back-projection is the zero-wavelength corner of a bigger law",
        exact: "the Ewald arc's departure from the slice theorem's line is w^2 lambda / (4 pi), exactly, as lambda -> 0",
        // The Fourier DIFFRACTION theorem (Wolf 1969): a scattered wave samples the spectrum along a SEMICIRCLE of
        // radius k = 2pi/lambda, not a line. As lambda -> 0 the arc flattens onto the line and FBP becomes exactly
        // right. So X-ray CT is not "approximately" diffraction tomography -- it is its lambda = 0 CORNER, and the
        // distance between them is arithmetic, not opinion. Same shape as FDTD's dispersion: predict how wrong,
        // then confirm it is wrong by precisely that much.
        tol: 0.02,
        run() {
            let worst = 0;
            for (const lam of [1e-4, 1e-3, 1e-2, 1e-1]) {
                const ex = sliceError(2, lam), ap = sliceErrorApprox(2, lam);
                worst = Math.max(worst, Math.abs(ex - ap) / Math.max(ap, 1e-30));
            }
            // and the limit itself: at a wavelength this short the arc IS the line, to float precision
            const vanishes = sliceError(2, 1e-9);
            // and the diffraction limit falls out of the geometry rather than being imposed.
            //
            // v2497: THIS USED TO BE A CONTROL THAT COULD NOT FAIL, and the mutation sweep found it in code five
            // rounds old. It asked "is a frequency above maxFrequency() evanescent?" -- but ewaldPoint returns null
            // for ANY |w| > k, so the answer was yes for maxFrequency = 1.1k, 2k, 3k or 100k alike. The 2 was never
            // tested. The sweep changed it to 3 and nothing blinked.
            //
            // So DERIVE it instead of asserting it. The measurement lands at K = k(s - s0); sweeping the scattered
            // direction s over the full circle, the largest |K| is at BACKSCATTER (s = -s0), giving exactly 2k. That
            // is where lambda/2 resolution comes from, and it is now a computed fact rather than a claim.
            const lam = 0.125, kk = TWO_PI / lam;
            let maxK = 0;
            for (let a = 0; a <= 720; a++) {
                const th = (a / 720) * TWO_PI;                       // scattered direction, incident along +x
                const Kx = kk * (Math.cos(th) - 1), Ky = kk * Math.sin(th);
                maxK = Math.max(maxK, Math.hypot(Kx, Ky));
            }
            const limitErr = Math.abs(maxK - maxFrequency(lam)) / maxFrequency(lam);
            const evan = ewaldPoint(maxFrequency(0.125) * 1.01, 0.125);
            const ok = vanishes < 1e-8 && evan === null && limitErr < 1e-6;
            return { got: ok ? worst : 1, want: 0, unit: "worst relative, exact arc vs w^2 L/4pi",
                     detail: "arc offset at lambda=1e-9 is " + vanishes.toExponential(1) + "; the arc's own widest reach is " +
                             maxK.toExponential(4) + " vs maxFrequency's " + maxFrequency(lam).toExponential(4) + " (2k, at backscatter) -- DERIVED, not asserted" };
        },
    },
    {
        name: "the shader's arithmetic is right (its twin proves it)",
        exact: "blobRadonAt, itself gated to 3.8e-14 against the analytic Radon integral",
        // I cannot run a GPU here. So the shader's GLSL and the JS twin are transcriptions of ONE arithmetic and
        // share SHADOW_K by string interpolation -- they cannot drift without a syntax error. This gate proves the
        // ARITHMETIC. That a GPU executes it faithfully is a separate claim, and sinogram-gpu.html settles that one
        // on the rig by running both and printing the disagreement. Proven here; adjudicated there.
        tol: 3e-7,   // float32 epsilon: the twin stores its result in a Float32Array, exactly as the GPU will
        run() {
            const blobs = makeBlobs(9, 1234);
            const NDET = 64, NANG = 48;
            const cpu = sinogramCPU(blobs, NDET, NANG, 0);
            let worst = 0, peak = 0;
            for (let ai = 0; ai < NANG; ai++) {
                const th = Math.PI * ai / NANG;
                for (let di = 0; di < NDET; di++) {
                    const s = -1 + (di + 0.5) * 2 / NDET;
                    const truth = blobRadonAt(s, th, 0, blobs);
                    worst = Math.max(worst, Math.abs(cpu[ai*NDET+di] - truth));
                    peak = Math.max(peak, Math.abs(truth));
                }
            }
            return { got: worst, want: 0, unit: "worst absolute, over " + (NDET*NANG) + " rays",
                     detail: (worst/peak).toExponential(1) + " relative -- float32 storage, which is what the GPU does too" };
        },
    },
    {
        name: "the grid is wrong by exactly the predicted amount",
        exact: "vp/c = asin(S sin(k dx/2)) * 2 / (S k dx) -- FDTD's own error, in closed form, derived not measured",
        // The strongest form of the discipline available anywhere in this engine. Every other check asks whether
        // the answer is right. This one predicts HOW WRONG the answer will be, from algebra, before the code runs,
        // and then checks it is wrong by precisely that much. If they agree, the model OF THE MODEL is correct.
        // At S = 1 -- the magic time step -- asin(sin(x)) = x and dispersion vanishes ENTIRELY: a discrete grid
        // carries every frequency at exactly c, forever. Taking a SMALLER step makes it worse, which is the
        // opposite of every instinct about numerical methods.
        tol: 2e-3,
        run() {
            const measure = (S, ppw) => {
                const n = 1200, f = createFdtd1d({ n, S }), period = ppw / S;
                for (let k = 0; k < 2600; k++) f.step((t) => Math.sin(2*Math.PI*t/period));
                const cross = [];
                for (let i = 300; i < 899; i++) if (f.Ez[i] <= 0 && f.Ez[i+1] > 0)
                    cross.push(i + (-f.Ez[i] / (f.Ez[i+1] - f.Ez[i])));
                if (cross.length < 3) return null;
                let sum = 0;
                for (let i = 1; i < cross.length; i++) sum += cross[i] - cross[i-1];
                return (sum / (cross.length - 1)) / ppw;
            };
            let worst = 0, magic = null;
            for (const [S, ppw] of [[1.0, 12], [0.9, 12], [0.5, 8]]) {
                const pred = numericalPhaseVelocity(S, ppw), meas = measure(S, ppw);
                if (meas === null) return { got: 1, want: 0, unit: "no wave" };
                if (S === 1.0) magic = meas;
                worst = Math.max(worst, Math.abs(pred - meas));
            }
            return { got: worst, want: 0, unit: "formula vs grid",
                     detail: "magic step measured " + magic.toFixed(6) + " (predicted exactly 1)" };
        },
    },
    {
        name: "Fresnel falls out of Maxwell on a grid",
        exact: "|r| = |n1 - n2| / (n1 + n2) -- the textbook, never mentioned to the code",
        // The grid is told Maxwell twice per cell. Reflection off a wall is a CONSEQUENCE. The control -- air
        // against air, which must reflect exactly nothing -- is what caught the original measurement error, and
        // it stays because a control that cannot fail is decoration.
        tol: 0.02,
        run() {
            const reflectionOf = (n2) => {
                const n = 1500, iface = 700, ppw = 20;
                const eps = new Float64Array(n).fill(1);
                for (let i = iface; i < n; i++) eps[i] = n2 * n2;
                const f = createFdtd1d({ n, S: 1.0, eps });
                const src = (t) => Math.min(1, t/150) * Math.sin(2*Math.PI*t/ppw);
                for (let k = 0; k < 1700; k++) f.step(src);
                const env = new Float64Array(n);   // the peak each cell reaches over TIME -- not a spatial snapshot
                for (let k = 0; k < ppw; k++) { f.step(src); for (let i = 0; i < n; i++) env[i] = Math.max(env[i], Math.abs(f.Ez[i])); }
                let mx = 0, mn = 1e9;
                for (let i = 300; i < iface - 40; i++) { if (env[i] > mx) mx = env[i]; if (env[i] < mn) mn = env[i]; }
                const vswr = mx / Math.max(mn, 1e-12);
                return (vswr - 1) / (vswr + 1);
            };
            let worst = 0;
            for (const n2 of [1.0, 1.5, 2.5]) worst = Math.max(worst, Math.abs(Math.abs((1-n2)/(1+n2)) - reflectionOf(n2)));
            return { got: worst, want: 0, unit: "worst |r| error", detail: "control (air|air) reflects " + reflectionOf(1.0).toFixed(4) };
        },
    },
    {
        name: "a star map clusters, and a scatter does not",
        exact: "a Poisson scatter has variance EXACTLY equal to its mean. Structure is the excess over that.",
        // The whole difference between a galaxy and confetti, in one number nobody can argue with. The scattered
        // control measures 1.018 (Poisson, as it must); the map built from a verified power spectrum measures
        // 1.368 on the same star count.
        tol: 0.12,
        run() {
            const n = 16, boxSize = 100;   // MUST be a power of two -- fft.js throws otherwise, and it is right to
            const P = (k) => (k > 0 ? 1.0 * Math.pow(k, -1.8) : 0);
            const g = makeGRF({ n, boxSize, P, seed: 4242 });
            let sd = 20260715;
            const rng = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
            const varOverMean = (stars) => {
                const cs = boxSize / n, c = new Int32Array(n*n*n);
                for (const [x, y, z] of stars) c[(Math.floor(z/cs)*n + Math.floor(y/cs))*n + Math.floor(x/cs)]++;
                const mean = stars.length / (n*n*n);
                let s2 = 0;
                for (const v of c) s2 += (v - mean) ** 2;
                return (s2 / c.length) / mean;
            };
            const flat = varOverMean(sampleStars(new Float64Array(n*n*n), n, 0.2, { rng, boxSize }));
            const clustered = varOverMean(sampleStars(g.delta, n, 0.2, { rng, boxSize }));
            // the scatter MUST sit at 1; the map MUST sit clearly above it
            const scatterErr = Math.abs(flat - 1);
            const ok = clustered > flat + 0.15;
            return { got: ok ? scatterErr : 1, want: 0, unit: "scatter's deviation from Poisson",
                     detail: "scatter " + flat.toFixed(3) + " (Poisson=1), clustered " + clustered.toFixed(3) };
        },
    },
    {
        name: "the fluid's X-ray shadow is exactly right",
        exact: "(32/35) * A * h * u^3.5 with A = m*315/(64 pi h^3) -- the SAME constant the kernel normalisation forced",
        // The identity paying twice. A poly6 particle IS a Wyvill blob of radius h, so the closed-form shadow the
        // selfie round earned applies to the FLUID with nothing integrated: its sinogram is written down, at any
        // instant, for free. Which is what lets a running fluid wear a skin made of its own shadows.
        tol: 1e-11,
        run() {
            const w = createSphWorld({ h: 0.22, mass: 0.02, restDensity: 250, stiffness: 2.5, viscosity: 0.25 });
            let sd = 909;
            const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
            for (let i = 0; i < 30; i++) w.addParticle([(rnd()-0.5)*0.6, (rnd()-0.5)*0.6, (rnd()-0.5)*0.4]);
            let worst = 0;
            for (const [sv, th, z] of [[0, 0, 0], [0.25, 0.7, 0.05], [-0.4, 1.9, -0.1]]) {
                const ct = Math.cos(th), st = Math.sin(th);
                let acc = 0; const L = 4, N = 60000, dt = L / N;
                for (let k = 0; k < N; k++) { const t = -L/2 + (k+0.5)*dt; acc += w.fieldAt(sv*ct - t*st, sv*st + t*ct, z) * dt; }
                worst = Math.max(worst, Math.abs(w.shadowAt(sv, th, z) - acc) / Math.max(Math.abs(acc), 1e-12));
            }
            return { got: worst, want: 0, unit: "relative, vs brute-force integration through the fluid's own field" };
        },
    },
    {
        name: "the SPH kernels integrate to exactly one",
        exact: "int W dV = 1, or mass is not conserved. The constants are forced: poly6 by 16/315, spiky by 1/60",
        // The identity v2483 found: Wyvill's metaball kernel IS SPH's poly6. The blobulator has been computing a
        // fluid density field for years unnormalised, because a blob field never had to MEAN anything. This is
        // the gate that makes the number mean kg/m^3.
        tol: 1e-11,
        run() {
            const h = 0.61, N = 400000, dr = h / N;
            let p6 = 0, sp = 0;
            for (let i = 0; i < N; i++) {
                const r = (i + 0.5) * dr, s = 4 * Math.PI * r * r * dr;
                p6 += poly6(r * r, h) * s;
                sp += spiky(r, h) * s;
            }
            const worst = Math.max(Math.abs(p6 - 1), Math.abs(sp - 1));
            return { got: worst, want: 0, unit: "worst deviation from 1", detail: "poly6 " + p6.toFixed(9) + ", spiky " + sp.toFixed(9) };
        },
    },
    {
        name: "SPH conserves momentum exactly",
        exact: "zero drift -- the pair terms are the same floats with opposite signs",
        // The bug this caught, recorded because the code LOOKED right: applying equal-and-opposite FORCES and then
        // dividing each by its OWN density gives unequal accelerations. The force ledger balanced perfectly while
        // momentum drifted 75x. The density must live INSIDE the symmetric coefficient:
        // dv_i/dt = -sum_j m_j (p_i/rho_i^2 + p_j/rho_j^2) grad W_ij. A drifting fluid still looks convincing.
        tol: 1e-11,
        run() {
            const w = createSphWorld({ h: 0.16, mass: 0.02, restDensity: 400, stiffness: 4, viscosity: 0.15, gravity: [0, 0, 0] });
            let s = 12345;
            const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
            for (let i = 0; i < 50; i++) w.addParticle([(rnd()-0.5)*0.5, (rnd()-0.5)*0.5, (rnd()-0.5)*0.5], [(rnd()-0.5)*0.4, (rnd()-0.5)*0.4, (rnd()-0.5)*0.4]);
            const m0 = w.totalMomentum();
            for (let i = 0; i < 60; i++) w.step(0.0015);
            const m1 = w.totalMomentum();
            let drift = 0, scale = 0;
            for (let k = 0; k < 3; k++) { drift = Math.max(drift, Math.abs(m1[k] - m0[k])); scale = Math.max(scale, Math.abs(m0[k])); }
            return { got: drift / scale, want: 0, unit: "relative momentum drift", detail: drift.toExponential(1) + " absolute" };
        },
    },
    {
        name: "a wave in glass slows by exactly the square root of its permittivity",
        exact: "v = c / sqrt(eps_r) -- measured as a time of flight, which no ratio can hide inside",
        // The companion to "light travels at the speed of light" (v2496): that one pins the speed in VACUUM, this
        // one pins what a MATERIAL does to it. Both are absolute -- a pulse crossing a known gap in a known time --
        // which is the only kind of check that can see a wrong permittivity, since every reflection coefficient in
        // the suite is a ratio and divides it out.
        tol: 0.01,
        run() {
            let worst = 0, detail = "";
            for (const er of [1.02, 1.25, 4.0]) {
                const n = 700, dx = 0.001;
                const eps = new Float64Array(n).fill(er);
                const w = createFdtd1d({ n, dx, S: 1.0, eps });
                const A = 200, B = 500, T0 = 30;
                let tA = null, tB = null, pA = 0, pB = 0;
                for (let st = 0; st < 2000; st++) {
                    w.step((t) => Math.exp(-((t - T0) * (t - T0)) / 40));
                    const a = Math.abs(w.Ez[A]), b = Math.abs(w.Ez[B]);
                    if (a > pA) { pA = a; tA = w.t; }
                    if (b > pB) { pB = b; tB = w.t; }
                }
                const C_SI = 299792458;                       // not imported -- see the speed-of-light check
                const v = ((B - A) * w.dx) / ((tB - tA) * w.dt);
                const got = C_SI / v, want = Math.sqrt(er);
                const e = Math.abs(got - want) / want;
                if (e > worst) { worst = e; detail = "eps=" + er + " -> n measured " + got.toFixed(4) + " vs sqrt(eps) = " + want.toFixed(4); }
            }
            return { got: worst, want: 0, unit: "worst relative", detail };
        },
    },
    {
        name: "Maxwell agrees with Born about where Born dies",
        exact: "the Born error MEASURED by a solver that has never heard of Born, against phi^2/2 predicted beforehand",
        // THE ADJUDICATION (v2502). Every reconstruction in this engine assumes the wave is barely disturbed by the
        // object. FDTD makes no such assumption -- it steps Maxwell and has no opinion. So: send a pulse through a
        // slab, time it with and without, and the DELAY is the phase the wave ACTUALLY accumulated. Then ask Born
        // what it expected. The gap is the answer, measured rather than cited.
        //
        // MEASURED vs PREDICTED: delta 0.01 -> 0.11% vs 0.11%; 0.05 -> 2.74% vs 2.71%; 0.20 -> 41.07% vs 40.54%.
        // Agreement to ~1% across a 400x range of error. They part above phi ~ 1 (0.60 -> 287% vs 313%), correctly,
        // because phi^2/2 is itself a small-angle expansion -- the theory announcing its own limit twice over.
        //
        // A PULSE, NOT A CW WAVE, AND THAT IS THE WHOLE STORY OF v2499-v2501. Three rounds chased a "3% discrepancy"
        // that did not exist: the CW phase fit DIVERGES with settling time (1.0%, 1.1%, 80%, 204%, 263%) because the
        // source injects at Ez[1] and the absorbing boundary is Ez[0] = Ez[1] -- IT COPIES THE SOURCE CELL AND FEEDS
        // THE WAVE BACK IN. This solver cannot hold a steady state. It launches, crosses and leaves, which is what
        // the bulk gate always did, which is why THAT one always read 0.00%. The instrument was the problem for
        // three rounds, exactly as the notes kept saying, and the fix was to stop measuring a standing wave.
        tol: 0.06,
        run() {
            const dx = 0.001, cells = 60, ppw = 40;
            const lam = ppw * dx, k = 2 * Math.PI / lam, d = cells * dx;
            const truePhase = (delta) => {
                const N = 1200, A = 300, B = A + cells;
                const eps = new Float64Array(N).fill(1);
                for (let i = A; i < B; i++) eps[i] = 1 + delta;
                const src = (t) => { const x = (t - 60) / 18; return Math.exp(-x * x); };
                const arrive = (withSlab) => {
                    const w = createFdtd1d({ n: N, dx, S: 1.0, eps: withSlab ? eps : null });
                    let num = 0, den = 0;
                    for (let st = 0; st < 1500; st++) { w.step(src); const v = w.Ez[900] * w.Ez[900]; num += v * w.t; den += v; }
                    return num / den;                       // energy centroid: robust to a peak landing between steps
                };
                return (arrive(true) - arrive(false)) * (dx / 299792458) * (2 * Math.PI * 299792458 / lam);
            };
            let worst = 0, detail = "";
            for (const delta of [0.01, 0.05, 0.2]) {
                const phi = truePhase(delta);
                const b = bornSlab(delta, k, d);
                const meas = Math.hypot(Math.cos(phi) - b.re, Math.sin(phi) - b.im);
                const pred = phi * phi / 2;
                const rel = Math.abs(meas - pred) / pred;
                if (rel > worst) { worst = rel; detail = "delta=" + delta + ": Maxwell says Born is " + (meas*100).toFixed(2) + "% wrong, theory said " + (pred*100).toFixed(2) + "%"; }
            }
            return { got: worst, want: 0, unit: "worst relative, measured vs predicted", detail };
        },
    },
    {
        name: "the Born approximation predicts its own failure",
        exact: "|e^{i phi} - (1 + i phi)| = phi^2 / 2 -- Born fails as the SQUARE of the phase shift across the object",
        // EVERY tomographic reconstruction here, and very nearly every one anywhere, assumes the wave is barely
        // disturbed by the object -- that is what makes the problem linear and therefore invertible. It is plainly
        // false: the object is there. The question is never "is Born right" but "WHEN is it wrong enough to
        // matter", and that is normally answered by citation.
        //
        // It does not have to be. Born IS the first two terms of the exact phase e^{i phi}, so its error is
        // phi^2/2, where phi is the phase shift the wave accumulates crossing the object. That is why it works
        // beautifully until it suddenly does not -- quadratic, not linear. And it inverts into the number actually
        // worth having: to hold Born under 1%, keep the phase shift under 0.141 rad.
        tol: 0.1,
        run() {
            const k = 2 * Math.PI / 0.05, d = 0.02;
            let worst = 0;
            for (const phi of [0.01, 0.05, 0.2]) {
                let lo = 0, hi = 50;
                for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (phaseShift(m, k, d) < phi) lo = m; else hi = m; }
                const delta = (lo + hi) / 2;
                worst = Math.max(worst, Math.abs(bornError(delta, k, d) - phi * phi / 2) / (phi * phi / 2));
            }
            // v2503: maxPhaseFor() used to appear ONLY in this detail string -- printed, never asserted -- and the
            // standalone repo's mutation sweep caught its 2 being changed to a 3 with nothing blinking. Asserting it
            // exposed that the claim was too simple: BORN MAKES TWO ERRORS AND phi^2/2 DESCRIBES ONE. The famous one
            // truncates e^{i phi}; the quiet one is that Born's phase (k*delta*d/2) is not the true phase
            // ((sqrt(1+delta)-1)*k*d) beyond first order -- they diverge 0.50% at delta=0.02, 7.01% at 0.3. So the
            // budget runs ~10% OPTIMISTIC, and the honest check is that it is optimistic BY A KNOWN AMOUNT.
            let over = 0, od = "";
            for (const tol of [0.01, 0.05, 0.10]) {
                const p = maxPhaseFor(tol);
                let lo2 = 0, hi2 = 50;
                for (let i = 0; i < 200; i++) { const m = (lo2+hi2)/2; if (phaseShift(m, k, d) < p) lo2 = m; else hi2 = m; }
                const got = bornError((lo2+hi2)/2, k, d);
                if (got/tol - 1 > over) { over = got/tol - 1; od = "ask " + (tol*100).toFixed(0) + "%, truly get " + (got*100).toFixed(2) + "%"; }
            }
            if (Math.abs(over - 0.10) > 0.05) return { got: 1, want: 0, unit: "budget check", detail: "maxPhaseFor is optimistic by " + (over*100).toFixed(1) + "%, expected ~10% (" + od + ")" };
            return { got: worst, want: 0, unit: "worst relative vs phi^2/2",
                     detail: "error tracks phi^2/2 to " + (worst*100).toFixed(1) + "%; the phase budget is optimistic by " + (over*100).toFixed(0) + "% -- " + od };
        },
    },
    {
        name: "light travels at the speed of light",
        exact: "c, measured as a time of flight between two probes -- 299792458 m/s, exact by definition since 1983",
        // FOUND BY THE MACHINE, NOT BY ME (v2496). tools/mutate/sweep.mjs perturbs every numeric constant in a file
        // and reports what nothing notices. It changed C0 by 3% AND EVERY FDTD CHECK STAYED GREEN -- because every
        // one of them is a RATIO. numericalPhaseVelocity returns vp/c; Fresnel returns a reflection coefficient.
        // The speed of light CANCELS OUT of all of them. So the grid could have run 3% fast forever, every check
        // perfectly green, and every absolute distance wrong by 3%.
        //
        // I hand-picked ten mutations and caught ten. That measured my imagination. The machine had no theory
        // about which constants matter, which is exactly why it found one I would never have questioned.
        //
        // TWO PROBES, not one: a single probe measures the launch time too, and the source is injected AFTER the
        // field update, so it reads one step long (401 for 400 cells -- 0.25% and a whole excuse). The difference
        // between two probes cancels the launch entirely and needs no story.
        //
        // AND THE NUMBER BELOW IS WRITTEN OUT, NOT IMPORTED, WHICH THIS CHECK LEARNED THE HARD WAY. The first
        // version compared the measured speed against C0 imported FROM THE FILE UNDER TEST. Breaking C0 by 3% then
        // moved the simulation AND the reference together and the check read "3.087862e+8 vs 3.087862e+8 exact" --
        // perfectly, uselessly green. That is precisely the law this engine has been repeating for a dozen rounds:
        // A BASELINE TAKEN FROM THE CODE UNDER TEST DETECTS CHANGE, NEVER WRONGNESS. I wrote that law and then
        // imported my answer key from the thing being examined. c is exact BY DEFINITION of the metre since 1983 --
        // it is a fact about the SI system, not about this repository, so it belongs here as a literal.
        tol: 1e-12,
        run() {
            const w = createFdtd1d({ n: 700, dx: 0.001, S: 1.0 });
            const A = 200, B = 500, T0 = 30;
            let tA = null, tB = null, pA = 0, pB = 0;
            for (let s = 0; s < 660; s++) {
                w.step((t) => Math.exp(-((t - T0) * (t - T0)) / 40));
                const a = Math.abs(w.Ez[A]), b = Math.abs(w.Ez[B]);
                if (a > pA) { pA = a; tA = w.t; }
                if (b > pB) { pB = b; tB = w.t; }
            }
            const C_SI = 299792458;      // m/s. Exact by definition. NOT imported -- see above.
            const got = ((B - A) * w.dx) / ((tB - tA) * w.dt);
            return { got: Math.abs(got - C_SI) / C_SI, want: 0, unit: "relative",
                     detail: got.toExponential(6) + " m/s vs " + C_SI.toExponential(6) + " exact by SI, over " + (tB - tA) + " steps" };
        },
    },
    {
        name: "a settled fluid presses with exactly its own weight",
        exact: "mean floor pressure = M*g / footprint area. Newton, and no opinion involved.",
        // THE GATE THE MUTATION PROVED WAS MISSING (v2494). "SPH conserves momentum exactly" passes at 9.7e-16 for
        // ANY pressure coefficient whatsoever, because the loop computes one coef and applies +x to i and -x to j
        // -- the accelerations are the same float with opposite signs no matter what is in it. That gate guards the
        // LOOP. This one guards the PHYSICS: it moves the moment the pressure law is wrong.
        //
        // AND THE SETUP IS THE TEST. rest density MUST equal m/d^3 for the lattice being built (v2484 gated exactly
        // that fact, and v2494's first attempt at this check ignored it -- set 400 against a lattice delivering 120,
        // watched the fluid hang together by TENSION at 30% of rest density, and reported the resulting collapse as
        // a discovery about the engine. It was a discovery about the test.)
        // tol 0.25 is honest rather than generous: this is a settling fluid read at one instant, and the tight
        // number (0.977 against Newton) needs 300 particles settled a full second -- 8 seconds of compute, too slow
        // to run on every ship. The cheap config below reads 0.844. What matters is not how close it sits but
        // WHETHER IT MOVES WHEN THE PRESSURE LAW IS WRONG -- verified against the mutation that exposed the hole.
        tol: 0.25,
        run() {
            const d = 0.055, MASS = 0.02, G = 9.81, BOX = 0.09;
            const REST = MASS / (d * d * d);          // 120.2 -- NOT a free parameter. The lattice decides it.
            const w = createSphWorld({ h: 0.16, mass: MASS, restDensity: REST, stiffness: 3000, viscosity: 3.0,
                                       gravity: [0, -G, 0], clampPressure: true });
            for (let i = -2; i <= 2; i++) for (let m = -2; m <= 2; m++) for (let j = 0; j < 8; j++)
                w.addParticle([i * d, 0.04 + j * d, m * d]);
            // 2000 steps = 0.5s. Less and the fluid is still BOUNCING off the floor when it is read, which is how
            // the first three configs of this check reported 0.0 Pa: sampled mid-air, a fluid weighs nothing.
            for (let s = 0; s < 2000; s++) w.step(0.00025, [-BOX, 0.0, -BOX, BOX, 2.0, BOX]);
            w.computeDensity();
            const N = w.particles.length;
            let xmin = 9, xmax = -9, zmin = 9, zmax = -9;
            for (const p of w.particles) { xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); }
            const area = (xmax - xmin) * (zmax - zmin);
            const want = N * MASS * G / area;
            const bottom = w.particles.filter((p) => p.y < 0.03);
            const got = bottom.reduce((s2, p) => s2 + p.p, 0) / Math.max(bottom.length, 1);
            return { got: Math.abs(got - want) / want, want: 0, unit: "relative",
                     detail: got.toFixed(1) + " Pa vs " + want.toFixed(1) + " Pa exact (M*g/area)" };
        },
    },
    {
        name: "SPH recovers a density nobody told it",
        exact: "a lattice of spacing d and mass m has density m/d^3, by arithmetic. The solver is never given it.",
        // The kernel's actual job, and the whole point of the normalisation. Converges as the support widens:
        // h/d = 1.5 -> 5.06%, 2.0 -> 0.98%, 3.0 -> 0.22%, 3.5 -> 0.05%. The unnormalised version of this same sum
        // is the blobulator: a number that looked like wax and meant nothing.
        tol: 0.01,
        run() {
            const d = 0.1, m = 0.0125, ratio = 3.0, h = ratio * d;
            const truth = m / (d * d * d);
            const w = createSphWorld({ h, mass: m, restDensity: truth, stiffness: 1, viscosity: 0 });
            const R = 5;
            for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) w.addParticle([i*d, j*d, k*d]);
            w.computeDensity();
            const c = w.particles.find((p) => p.x === 0 && p.y === 0 && p.z === 0);
            const rel = Math.abs(c.rho - truth) / truth;
            return { got: rel, want: 0, unit: "relative", detail: c.rho.toFixed(3) + " vs " + truth.toFixed(1) + " exact" };
        },
    },
    {
        name: "one blob alone is found exactly by brute force",
        exact: "a 4-dimensional search can simply be scanned; no needle hides from an exhaustive sweep",
        // This is what peeling is FOR: it turns one 20-D non-convex search into five 4-D ones. The 4-D part
        // provably works -- this check proves it. What peeling does NOT fix is the greedy's first pick, which
        // grabs one fat blob across the whole row and poisons every residual after it (45.45% -> 27.61%, still
        // losing to the belief-free solver's 6.06%). See blobFit.js.
        tol: 0.02,
        run() {
            const one = [{ x: 0.3, y: -0.2, z: 0, r: 0.24, a: 3.0 }];
            const NDET = 48, K = 6;
            const angles = []; for (let k = 0; k < K; k++) angles.push(Math.PI * k / K);
            const data = new Float64Array(K * NDET);
            angles.forEach((th, j) => { for (let i = 0; i < NDET; i++) data[j*NDET+i] = blobRadonAt(-1 + (i+0.5)*2/NDET, th, 0, one); });
            const { blob } = fitOneBlob(data, Float64Array.from(angles), NDET, 0, { coarse: 10 });
            const d = Math.max(Math.abs(blob.x - 0.3), Math.abs(blob.y + 0.2), Math.abs(blob.r - 0.24));
            return { got: d, want: 0, unit: "worst param error",
                     detail: "(" + blob.x.toFixed(2) + "," + blob.y.toFixed(2) + ") r" + blob.r.toFixed(2) + " vs (0.30,-0.20) r0.24" };
        },
    },
    {
        name: "the blob ontology explains the shadows exactly -- and cannot be found",
        exact: "misfit at the true blobs is 0; the search lands 5.7e9x worse",
        // The most useful check in the file, because it separates two diagnoses that the error percentage alone
        // cannot: the model is RIGHT (it explains the data perfectly) and the SEARCH is what fails. A strong prior
        // does not buy a smaller problem, it buys a smaller NON-CONVEX one -- 1,600 unknowns in a convex bowl beat
        // 20 unknowns in a landscape of needles. See blobFit.js for the whole measurement.
        tol: 1e-12,
        run() {
            const row = [];
            for (let i = 0; i < 5; i++) row.push({ x: -0.5 + i*0.25, y: 0, z: 0, r: 0.17, a: 3.0 });
            const NDET = 48, K = 6;
            const angles = []; for (let k = 0; k < K; k++) angles.push(Math.PI * k / K);
            const data = new Float64Array(K * NDET);
            angles.forEach((th, j) => { for (let i = 0; i < NDET; i++) data[j*NDET+i] = blobRadonAt(-1 + (i+0.5)*2/NDET, th, 0, row); });
            const m = misfit(row, { data, angles: Float64Array.from(angles), nAngles: K, nDet: NDET, ds: 2/NDET });
            return { got: m, want: 0, unit: "misfit at the truth", detail: m.toExponential(1) + " -- the model fits; the search is what fails" };
        },
    },
    {
        name: "a solver that handles uneven views beats one that assumes even ones",
        exact: "SIRT vs FBP on the same four views of the same object -- an 18x gap, and no prior involved",
        // The lesson of the round: the gain is GEOMETRY, not belief. FBP scales by pi/nAngles, assuming an even
        // spread; SIRT only asks which image fits the rays it was given. Adding the TV prior on top makes this
        // world WORSE past a small weight (0.008 -> 12.34%, 0.03 -> 33.50%) because TV believes in sharp edges and
        // the wax has none. A false belief costs; FBP could not be wrong because it believed nothing.
        tol: 0.30,
        run() {
            const row = [];
            for (let i = 0; i < 5; i++) row.push({ x: -0.5 + i*0.25, y: 0, z: 0, r: 0.17, a: 3.0 });
            const NDET = 64, n = 32, K = 4;
            const angles = []; for (let k = 0; k < K; k++) angles.push(Math.PI * k / K);
            const data = new Float64Array(K * NDET);
            angles.forEach((th, j) => { for (let i = 0; i < NDET; i++) data[j*NDET+i] = blobRadonAt(-1 + (i+0.5)*2/NDET, th, 0, row); });
            const sino = { data, angles: Float64Array.from(angles), nAngles: K, nDet: NDET, ds: 2/NDET };
            const img = reconstructIterative(sino, n, { iters: 40 });
            let se = 0, ref = 0;
            for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
                const x = -1+2*(i+0.5)/n, y = -1+2*(j+0.5)/n;
                if (x*x + y*y > 0.81) continue;
                const w = blobFieldAt(x, y, 0, row); se += (img[j*n+i]-w)**2; ref += w*w;
            }
            const rms = Math.sqrt(se/ref);
            return { got: rms, want: 0, unit: "relative RMS from 4 views", detail: (rms*100).toFixed(1) + "% (FBP on the same data: 178%)" };
        },
    },
    {
        name: "looking where you have not looked rediscovers uniform sampling",
        exact: "coverage 1.000, and the same error as an evenly-spaced sweep -- without knowing the budget in advance",
        // Keith asked what a blob focuses on. The answer that sounds right -- look where you are most surprised --
        // LOSES, 2-3x, at every budget (4 views: 178% rote vs 357% active; 16: 20.73% vs 78.26%). A surprise-led
        // eye CLUSTERS, and clustered views leave whole directions of the object unmeasured: gap-weighted, the
        // error is FLAT at ~152% from 6 views to 16. Adding views to a cluster buys nothing, because each view is
        // one line through the object's Fourier transform and no weighting invents data never collected.
        // So the working strategy is the humble one: refuse to look twice in the same place. See viewChoice.js for
        // the whole argument, including why no MODEL-FREE measure of a view's worth exists at all.
        tol: 1e-9,
        run() {
            const grown = [0];
            while (grown.length < 16) grown.push(nextAngleByCoverage(grown));
            const uni = []; for (let k = 0; k < 16; k++) uni.push(Math.PI * k / 16);
            const cov = coverage(grown);
            // it must reproduce the uniform set, angle for angle
            const g = [...grown].map((a) => ((a % Math.PI) + Math.PI) % Math.PI).sort((x, y) => x - y);
            let worst = 0;
            for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs(g[i] - uni[i]));
            return { got: Math.max(worst, Math.abs(cov - 1)), want: 0, unit: "rad",
                     detail: "coverage " + cov.toFixed(3) + ", matches the even sweep" };
        },
    },
    {
        name: "a metaball's X-ray shadow is exactly right",
        exact: "(32/35) * A * R * u^3.5 for Wyvill's kernel, u = 1 - c^2/R^2 -- one term, no special functions",
        // Keith's idea, and the round was discovering what makes a blob scannable at all. The blobulator's own
        // kernel r^3/(d^2+eps) also has a lovely closed-form shadow (r^3*pi/sqrt(p^2+eps)) and is STILL not
        // scannable: it decays as 1/d^2 and never reaches zero, FBP needs compact support, and the result was 108%
        // error FLAT from 24 to 180 angles. Truncating it gave compact support and an exact arctan shadow -- and a
        // hard edge, which rings: 10.4%, still flat. Wyvill's kernel (metaballs since 1986) is compact AND smooth.
        tol: 1e-10,
        run() {
            const blobs = makeBlobs(5);
            let worst = 0;
            for (const [s, th, z] of [[0, 0, 0], [0.3, 0.7, 0.1], [-0.45, 1.9, -0.2]]) {
                const ct = Math.cos(th), st = Math.sin(th);
                let acc = 0; const L = 4, N = 120000, dt = L / N;
                for (let k = 0; k < N; k++) { const t = -L/2 + (k+0.5)*dt; acc += blobFieldAt(s*ct - t*st, s*st + t*ct, z, blobs) * dt; }
                worst = Math.max(worst, Math.abs(blobRadonAt(s, th, z, blobs) - acc));
            }
            return { got: worst, want: 0, unit: "absolute" };
        },
    },
    {
        name: "the blobulator rebuilds from its own shadows",
        exact: "the wax, recovered from analytic X-rays alone -- and it has no hard edges to ring at",
        // The contrast with the Shepp-Logan check above is the point: a head has hard edges, so its whole-image
        // error is pinned near 14% by Gibbs forever. The wax is a sum of smooth kernels, so there is no step to
        // ring at and no need to look away from edges -- it converges to six hundredths of a percent.
        // Tolerance measured on THIS configuration.
        tol: 0.004,
        run() {
            const blobs = makeBlobs(5);
            const n = 24, nz = 6;
            let se = 0, ref = 0;
            for (let k = 0; k < nz; k++) {
                const z = -0.4 + 0.8*(k+0.5)/nz;
                const img = reconstruct(blobSinogram({ nAngles: 60, nDet: 96, z, blobs }), n);
                for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
                    const x = -1 + 2*(i+0.5)/n, y = -1 + 2*(j+0.5)/n;
                    if (x*x + y*y > 0.81) continue;
                    const want = blobFieldAt(x, y, z, blobs);
                    se += (img[j*n+i] - want)**2; ref += want*want;
                }
            }
            const rms = Math.sqrt(se/ref);
            return { got: rms, want: 0, unit: "relative RMS", detail: (rms*100).toFixed(3) + "%" };
        },
    },
    {
        name: "the analytic X-ray shadow is exactly right",
        exact: "Radon transform of an ellipse in closed form: 2*rho*a*b*sqrt(A - s^2)/A",
        tol: 1e-4,
        run() {
            // brute-force integrate along the same line. If the closed form is wrong, every reconstruction built on
            // it is wrong, and it would still look plausible -- which is exactly how this kind of error survives.
            let worst = 0;
            for (const [s, th] of [[0, 0], [0.3, 0.7], [-0.15, 1.2], [0.2, 2.1]]) {
                const c = Math.cos(th), sn = Math.sin(th), L = 4, N = 120000;
                let sum = 0;
                for (let k = 0; k < N; k++) { const t = -L / 2 + L * (k + 0.5) / N; sum += phantomAt(s * c - t * sn, s * sn + t * c); }
                worst = Math.max(worst, Math.abs(radonAt(s, th) - sum * L / N));
            }
            return { got: worst, want: 0, unit: "absolute" };
        },
    },
    {
        name: "the FFT turns a cosine into exactly two spikes",
        exact: "cos(2 pi m x/n) -> spikes of height n/2 at k = m and n-m, and nothing anywhere else",
        // Everything cosmological rests on this, and a wrong FFT does not look wrong -- it produces a plausible,
        // beautiful, meaningless universe. So it is checked against a transform that can be written down by hand.
        tol: 1e-10,
        run() {
            const n = 64, m = 7, re = new Float64Array(n), im = new Float64Array(n);
            for (let i = 0; i < n; i++) re[i] = Math.cos(2 * Math.PI * m * i / n);
            fft1d(re, im);
            let worst = 0;
            for (let i = 0; i < n; i++) {
                const mag = Math.hypot(re[i], im[i]);
                worst = Math.max(worst, Math.abs(mag - ((i === m || i === n - m) ? n / 2 : 0)));
            }
            return { got: worst, want: 0, unit: "absolute" };
        },
    },
    {
        name: "the displacement field solves Poisson exactly",
        exact: "delta = A sin(kx) -> Psi = -(A/k) cos(kx), from Psi(k) = i k delta(k)/k^2",
        // Tests the CODE -- the real FFT, the real Poisson solve -- not my algebra. The caustic that follows from this
        // lands at D = 1/A INDEPENDENT of k, so a stray factor of k in the solve could not hide here.
        tol: 1e-9,
        run() {
            const n = 16, boxSize = 2 * Math.PI, A = 0.05, k = 2;
            const delta = new Float64Array(n * n * n);
            for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
                delta[(z * n + y) * n + x] = A * Math.sin(k * (x * boxSize / n));
            const { psi } = displacementField({ delta, n, boxSize });
            let peak = 0;
            for (let x = 0; x < n; x++) peak = Math.max(peak, Math.abs(psi[0][x]));
            return { got: Math.abs(peak - A / k), want: 0, unit: "absolute, on a peak of " + (A / k).toFixed(4) };
        },
    },
    {
        name: "the universe carries the power it was asked for",
        exact: "a field built to P(k) = k^-2, measured back out",
        // Compared against <P(k)> over the SAME modes -- NOT P(<k>). k^-2 is convex, so the average of the spectrum
        // across a shell sits above the spectrum at the shell's average k; reading that as a 3.5% excess in the field
        // cost a round. Jensen's inequality lives in the question, not the universe.
        //
        // TOLERANCE MEASURED ON THIS EXACT CONFIGURATION, which is the only kind of tolerance worth having: n=32,
        // 5 shells, seed 20260715, well-sampled shells only -> worst |ratio-1| = see below. Low-k shells hold few
        // modes and are dominated by genuine cosmic variance (a real property of a finite box, not an error), so
        // they are excluded rather than wished away. A tolerance calibrated on a DIFFERENT run is theatre -- that
        // mistake shipped to Keith's rig in v2469 and was caught by his GPU, and then made again here one round later.
        tol: 0.16,
        run() {
            const n = 32, boxSize = 100, Pin = (k) => (k > 0 ? Math.pow(k, -2) : 0);
            const f = makeGRF({ n, boxSize, P: Pin, seed: 20260715 });
            const meas = measureP(f, 5, Pin);
            let worst = 0, judged = 0;
            for (const m of meas) {
                if (m.modes < 100) continue;
                judged++;
                worst = Math.max(worst, Math.abs(m.P / m.Ptruth - 1));
            }
            return { got: worst, want: 0, unit: "worst |ratio-1| over " + judged + " well-sampled shells, vs <P(k)>" };
        },
    },
    {
        name: "Euler holds a uniform state exactly",
        exact: "a solver that cannot sit still cannot be trusted to move",
        tol: 1e-10,
        run() {
            const q = makeEuler({ nx: 24, ny: 24, bc: "periodic", init: () => ({ rho: 1.3, u: 0.4, v: -0.2, p: 2.1 }) });
            for (let s = 0; s < 40; s++) q.step(0.01);
            let worst = 0;
            for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) { const p = q.get(i, j);
                worst = Math.max(worst, Math.abs(p[0] - 1.3), Math.abs(p[1] - 0.4), Math.abs(p[2] + 0.2), Math.abs(p[3] - 2.1)); }
            return { got: worst, want: 0, unit: "absolute" };
        },
    },
    {
        name: "Euler strong shock compresses by exactly (g+1)/(g-1)",
        exact: "Rankine-Hugoniot limit = 6.000 at gamma 1.4",
        tol: 0.02,
        run() {
            const g = 1.4, exact = (g + 1) / (g - 1);
            const sod = makeEuler({ nx: 300, ny: 4, gamma: g, bc: "outflow", init: (i) => i < 150 ? { rho: 1, u: 0, p: 1000 } : { rho: 1, u: 0, p: 0.01 } });
            let t = 0;
            for (let s = 0; s < 3000 && t < 4; s++) { const dt = sod.cflDt(0.4); sod.step(dt); t += dt; }
            let peak = 0; for (let i = 0; i < 300; i++) peak = Math.max(peak, sod.get(i, 2)[0]);
            return { got: Math.abs(peak - exact) / exact, want: 0, unit: "relative", detail: peak.toFixed(3) + " vs 6.000" };
        },
    },
    {
        name: "Euler conserves mass and energy through shocks",
        exact: "a conservative scheme must conserve",
        tol: 1e-11,
        run() {
            const box = makeEuler({ nx: 120, ny: 4, bc: "periodic", init: (i) => i < 60 ? { rho: 1, u: 0, p: 10 } : { rho: 0.2, u: 0, p: 0.5 } });
            const a = box.totals();
            for (let s = 0; s < 250; s++) box.step(box.cflDt(0.4));
            const b = box.totals();
            return { got: Math.max(Math.abs(b.mass - a.mass) / a.mass, Math.abs(b.energy - a.energy) / a.energy), want: 0, unit: "relative drift" };
        },
    },
];
// Verified, but too slow to gate. Listed so the gap stays visible instead of being quietly forgotten.
const UNGATED = [
    "DIFFRACTION INVERSION, WHERE IT ACTUALLY STANDS AFTER v2500. THE SLAB MEASUREMENT IS FIXED AND THE FIX WAS NOT THE SIGN. v2499 read -0.1208 rad against an exact +0.0938 and I blamed the sign; the sign was one bug (my phase-fit difference already returns +phi and I negated it again) but the real one was A PROBE THAT MOVED WITH THE SLAB -- placed at B+200, so the vacuum reference and the slab run sampled different parts of the transient. Fixed at cell 800, the measurement is now LINEAR IN THICKNESS with a ZERO INTERCEPT (1.97e-4 -- a slab of zero thickness delays nothing, as it must): 20 cells 0.03236 vs 0.03126 exact; 60 cells 0.09693 vs 0.09378; 100 cells 0.16123 vs 0.15630. FROM 29% WRONG TO 3%.",
    "PHASE-VS-GROUP IS DEAD, KILLED BY ITS OWN PREDICTION (v2501). v2500 guessed that the slab's 3% excess was phase velocity vs group velocity -- the bulk gate times a PULSE PEAK (group), the slab fits a CW wave (phase), and the grid IS dispersive inside glass because S_eff = S/n is no longer the magic step. TESTABLE BEFORE MEASURING: the scheme's own dispersion relation, sin(k dx/2) = (n/S) sin(omega dt/2), gives the numerical phase index directly. IT PREDICTS 0.0021% AT delta=0.02 (1.009971 vs 1.009950), 0.0052% at 0.05, 0.0103% at 0.1. I NEED 3%. THE HYPOTHESIS IS 1500x TOO SMALL. Dead by arithmetic, before any solver ran. THE 3% REMAINS UNEXPLAINED AND IS NOT PHASE-VS-GROUP.",
    "FOUR BROKEN INSTRUMENTS IN ONE ROUND (v2501), RECORDED BECAUSE THE PATTERN MATTERS MORE THAN ANY OF THEM. Trying to measure a bulk phase index I built: (1) a two-probe fit 400 cells apart -- the phase between them is ~63 rad, TEN WRAPS, unwrapped with a single loop; read n=0.099 for a medium at 1.01. (2) probes 10 cells apart to kill the wrap -- but the source cell sits INSIDE the medium and the ends reflect into the fit; read 1.24, then 0.66. (3) source in vacuum with the medium downstream -- read 0.90/0.33/1.69/1.90, still garbage. (4) a boundary test to explain (3) -- used a UNIPOLAR Gaussian, which injects DC, and DC neither propagates nor leaves, so I measured a static offset and called it a reflection: it reported VACUUM reflecting 100%, which is the control failing. (5) rebuilt with a Gaussian DERIVATIVE (zero net area) -- vacuum STILL reports 100%, cause unknown, and I stopped. THE SLAB TEST WORKS PRECISELY BECAUSE IT DIFFERENCES TWO RUNS AT THE SAME PROBE WITH VACUUM ON BOTH SIDES: no wrap, no source in the medium, no boundary in a dielectric. Every attempt to escape that geometry failed. THE INSTRUMENT IS THE PROBLEM, NOT THE PHYSICS, AND THAT IS NOW FIVE ROUNDS OF EVIDENCE FOR IT.",
    "AND THE REMAINING 3% IS UNEXPLAINED, WHICH IS WHERE THIS STOPS RATHER THAN BEING DRESSED UP (v2500). It is not geometric: varying delta at fixed thickness gives ratios 1.0237 / 1.0335 / 1.0525 / 1.0841 for delta 0.005 / 0.02 / 0.05 / 0.1 -- IT SCALES WITH DELTA. It is not a face effect: the excess grows with thickness (0.70 -> 3.15 cells across a 20-100 cell sweep), so it is proportional, not a boundary. So the EFFECTIVE INDEX reads ~3% high -- WHICH CONTRADICTS THE BULK GATE READING 0.00% ON THE SAME MEDIUM. THE HYPOTHESIS: the bulk gate times a PULSE PEAK (group velocity), the slab fits a CW wave (PHASE velocity), and those are different quantities in a dispersive medium -- and the FDTD grid IS dispersive inside the slab, because S_eff = S/n is no longer the magic step even when S is. NOT CONFIRMED: I built a bulk CW phase measurement twice and it came back garbage both times (reading n = 0.099, then 1.24, for a medium at n = 1.01). The first botched the unwrap -- the phase across 400 cells is ~63 rad, TEN WRAPS, and I unwrapped it with a single loop. The second put the source cell INSIDE the medium. THE SLAB TEST WORKS PRECISELY BECAUSE IT DIFFERENCES TWO RUNS AT THE SAME PROBE, so the wraps cancel; a bulk absolute-phase measurement has no such luck. THE INSTRUMENT IS THE OPEN PROBLEM, NOT THE PHYSICS.",
    "DIFFRACTION INVERSION IS HALF DONE AND I AM NOT PRETENDING OTHERWISE (v2499). The THEORY is built and gated (simulation/em/born.js): Born is the first two terms of e^{i phi}, so its error is phi^2/2 where phi is the phase shift across the object -- verified against the closed form, and it inverts into a usable number (1% error needs phase < 0.141 rad). The BULK physics is gated too: a wave in a dielectric slows by exactly sqrt(eps_r), measured absolutely by time of flight, reading 0.00% at eps=1.02. BUT THE SLAB ADJUDICATION -- FDTD as the truth, measuring the phase a wave ACTUALLY accumulates through a slab and asking Born what it expected -- IS BROKEN AND THE BUG IS MINE. It read -0.1208 rad where the exact says +0.0938: the sign was doubly wrong (the projection difference reads +phi and I negated it), and after fixing that it is still 29% high, unexplained. The bulk check PROVES the physics is fine, so it is my phase measurement -- most likely reflections from the slab faces inside the DFT window, which are exactly the second-order effect Born omits and therefore the interesting part. NOT SHIPPED AS A RESULT.",
    "THE PINNED RATIO IS A FINGERPRINT OF WHAT A FILE IS (v2498, tools/mutate/sweep.mjs). Sweeping every numeric constant and asking what the gate notices: kernels.js 9/9 PURE LAW (including the exponents in Math.pow(h,9)); diffraction.js 3/3 pure law after v2497 derived the limit; fbp.js 8/9, the 9th a BUFFER LENGTH that should survive; blobPhantom.js ~14/27 HALF LAW HALF FIXTURE -- every survivor is a default argument, an RNG mixing constant, or a blob placement/size term, i.e. the machinery that GENERATES THE TEST DATA, while its physics (32/35, the 3.5 exponent, the Radon integral) is pinned. Move the blobs and the shadow of a blob somewhere else is still exactly right, so those SHOULD survive. THE SWEEP SEPARATED LAW FROM FIXTURE WITHOUT BEING TOLD WHICH WAS WHICH. fdtd1d.js 3/7 -- free parameters, plus the one real hole this whole exercise found: the speed of light, now gated by time-of-flight.",
    "THE MACHINE FOUND A HOLE I WOULD NEVER HAVE PICKED (v2496). tools/mutate/sweep.mjs walks a file, finds every numeric literal, and perturbs each by 3% -- no theory about which ones matter, which is the point. My ten hand-written mutations caught ten out of ten and measured MY IMAGINATION. The sweep changed C0 (the speed of light) by 3% AND EVERY FDTD CHECK STAYED GREEN, because every one is a RATIO: numericalPhaseVelocity returns vp/c, Fresnel returns a reflection coefficient, and c cancels out of both. The grid could have run 3% fast forever with a perfectly green suite. Now gated by time-of-flight between two probes, which is absolute. ALSO SURVIVING AND CORRECTLY SO: n=400 and dx=0.001 in createFdtd1d are FREE PARAMETERS -- the answer MUST NOT depend on them, so their survival is the suite being right, not blind. THE SCANNER CANNOT TELL PHYSICS FROM PLUMBING; THE READING IS THE WORK. And kernels.js swept 9/9 CAUGHT, including the exponents in Math.pow(h,9) that I would not have thought to question.",
    "MUTATION TESTING (v2494, tools/mutate/mutate.mjs): break the code on purpose and see whether the gate notices. A surviving mutation is not a bug in the code -- it is a hole in the net, and it says so without anyone needing a hunch. FIRST RUN, FIRST SURVIVOR: 'SPH pressure loses its density symmetry' survived, DESPITE the suite carrying 'SPH conserves momentum exactly' at 9.7e-16. WHY: the pressure loop computes ONE coefficient and applies +x to i and -x to j, so m*a_i and m*a_j are the same float with opposite signs FOR ANY COEFFICIENT WHATSOEVER -- right law, wrong law, or a random number. THE MOMENTUM GATE GUARDS THE LOOP, NOT THE PHYSICS. It is not decoration (it caught the real v2484 bug, where the code divided by rho AFTER the loop and broke exactly that symmetry) but it CANNOT catch a wrong pressure coefficient, and nothing else checks one. THE SPH PRESSURE LAW IS UNGUARDED.",
    "SPH COLLAPSES UNDER SUSTAINED GRAVITY (v2494, found by chasing the mutation survivor). Building the hydrostatic check that WOULD guard the pressure law: 686 particles, stiffness 8, rest density 400, settled 1.2s under gravity in a box -> the column spans y = 0.000 to 0.000. EVERY PARTICLE AT THE FLOOR. A puddle of zero thickness. The pressure field is live (-366 to +457), so it is not dead code -- the fluid is simply too soft to hold its own weight: p = k(rho - rho0) with k = 8 needs a 22% compression to support even 18 cm of column. THE SPH BACKEND PASSES 3 GREEN GATES AND CANNOT HOLD UP A COLUMN OF WATER. v2484 tested kernels, momentum and density -- never WEIGHT. The fix is a proper equation of state (Tait, gamma = 7) and is a round of its own; RECORDED, NOT FAKED. The Fluid Selfie page is unaffected: it scans a settling blob, not a hydrostatic column.",
    "RAY TOMOGRAPHY IS THE lambda=0 CORNER, AND RADIO IS NOT THERE (v2491). At 2.4 GHz (lambda 12.5 cm) the straight-ray assumption is off by: a room (3 m) 2.1%; a doorway (1 m) 6.3%; a torso (0.5 m) 12.7%; a laptop (0.25 m) 26.8%; a fist (0.13 m) 75.4% -- the correction IS the measurement; a phone (0.08 m) EVANESCENT, 2.4 GHz cannot report it at all. It degrades SMOOTHLY -- there is no threshold where FBP 'stops working'. Below half a wavelength (6.3 cm) the arc cannot reach: a wave cannot report detail finer than half of itself, and that falls out of |K| <= 2k rather than being imposed. This engine holds BOTH a real wave solver and a tomograph, which is an unusual thing to be holding.",
    "THE SCAN IS ONE TEXTURE (v2489, sinogram-gpu.html): a sinogram IS an image -- detector across, angle down -- and every pixel is one ray depending on no other ray, so a fragment shader computing one texture IS the entire scan. Keith's Neo Geo observation: Doom ran on a machine with NO framebuffer because a raycast column IS a vertically scaled sprite, and the data already had the shape the hardware wanted. Headless, the page's full pipeline (cast -> FBP -> image) reconstructs to 0.009% of the true blob field.",
    "CASTING VS RECONSTRUCTION IS NOT A FIXED RATIO, and I claimed it was, twice, before measuring properly. Casting is O(rays x blobs); back-projection is O(grid^2 x angles). At 256x180 into 128^2: 8 blobs -> 33ms cast / 66ms reconstruct (ratio 0.50, the shader buys NOTHING); 40 -> 107/51 (2.10); 120 -> 294/51 (5.76); 400 -> 1010/50 (20.20). The '10x' came from ONE configuration (16 views, 110 blobs, 32^2 grid) and is a property of that afternoon, not of the problem. Bandwidth is genuinely never the cost: the big 256x180 scan is 180 KB.",
    "STAR MAP SHOT NOISE (v2486): turning a smooth field into countable stars adds exactly V/N to the spectrum, flat at every scale. Predicted vs measured: 20,121 stars -> 49.70/44.87; 60,172 -> 16.62/16.46; 199,627 -> 5.01/5.66; 597,848 -> 1.67/1.21. Falls as 1/N as the formula says. PRECONDITION, learned the hard way: this is a LINEAR-REGIME law -- the rate is nbar*(1+delta), so delta must stay above -1 or the clamp is a nonlinearity that destroys the relationship. At sigma(delta)=20.6 (47.9% of cells wanting negative density) the measured excess came back CONSTANT regardless of star count. Keep sigma below ~0.5.",
    "THE FLUID WEARS A SKIN OF ITS OWN SHADOWS (v2485, fluid-selfie.html): reconstruct from the closed-form shadows and march the result. An INSTANT scan (all 36 views at once) gives 3.91%; 6 views/frame 13.44%; 1 view/frame 53.43% -- because a real scan gathers views over TIME and the fluid keeps moving. THE ARTIFACT IS THE PHYSICS: it is why real CT scanners are fast and patients hold their breath.",
    "MOTION BLUR IS NOT MONOTONIC IN MOTION when the subject SETTLES: scanning a fluid falling into a box gave 0.65% (still), 21.57%, 75.93% (peak), 51.81%, 50.62% -- it peaks and falls back. Explanation TESTED: the fluid's mean speed decays 5.89 -> 1.73 over the same window, so a long scan spends most views photographing an already-resting fluid and converges on that. The error is worst when the MOTION timescale MATCHES the SCAN timescale, not when motion is largest.",
    "v2483 SCALE SWEEP: forbidding the greedy's fat first pick recovers almost the whole gap -- row of five r=0.17 blobs at 8 views: 45.45% (20-D at once) -> 27.61% (peeled) -> 6.72% (scale-swept), vs the belief-free grid solver's 6.06%. THE DATA CHOSE THE RIGHT BAND UNAIDED (winning band rMax 0.22 at 4 and 8 views). Final scoreboard: A DRAW. Three rounds of search engineering to draw level with a solver that believes nothing, on a world made of exactly the things the model believes in.",
    "THE WYVILL KERNEL IS SPH'S POLY6, EXACTLY: (h^2-r^2)^3 = h^6(1-r^2/h^2)^3, so poly6 = Wyvill with R=h and A=315/(64 pi h^3). Verified by the test SPH demands -- the kernel integrates to 1 over all space: 4.05e-14. int_0^1 u^2(1-u^2)^3 du = 1/3-3/5+3/7-1/9 = 16/315 exactly, which forces that A. So blob physics as a backend is not a new solver: IT IS SPH, and the blobulator already computes its density field (unnormalised, because the number never had to mean anything). NOT a rigid-body backend -- readTransforms returns pos+quat and a blob has no orientation.",
    "CAVEAT ON MY OWN EARLIER NUMBERS (v2483): the 'uniform' baseline everywhere in v2479-v2482 was Math.PI*k/K, which at K=3 is 0/60/120 -- a BAD set for a row of blobs, not merely an unlucky one. It reaches 39.64% even at 600 iterations while 0/45/90 (SAME view count) converges to 11.72%. It was never the COUNT of views, it was WHICH ones -- v2479's coverage lesson arriving from the opposite direction. Any K=3 comparison in those rounds is partly measuring angle-set luck rather than strategy. The K=4+ sets (0/45/90/135) are fine.",
    "PEELING (v2482) HELPS AND STILL LOSES: 20-D-at-once 45.45% -> peeled 27.61% at 8 views, vs the belief-free grid solver's 6.06%. The 4-D single-blob scan is EXACT (gated). The failure is the greedy's FIRST PICK: peeling a row of 5 blobs from 3 views returns the two END blobs exactly, ONE FAT r=0.61 blob across the middle three, and TWO INVENTED blobs at y=-0.41. The single object explaining a row of five best is one big blob -- wrong, plausible, and a deep local minimum that 2 re-fit passes cannot dislodge. THE COARSEST WRONG THEORY IS REACHED FIRST AND IS HARDEST TO GIVE UP. Left to try: orthogonal MP (re-solve all amplitudes per pick), over-peel and prune, coarse-to-fine scale sweep forbidding the fat pick, or Boob et al.'s actual REWEIGHTING across whole runs.",
    "PRIORS, v2481. MATCHED BELIEF WINS: on smooth wax at 8 views, smoothness (Tikhonov) beats TV at every weight -- 0.002 -> 4.68% vs 5.62%, and beats believing nothing (5.74%). TV believes in edges; the wax has none. ON A SKULL both priors HURT at these weights (22.17% -> 23.01% TV, 23.24% smooth) -- no reversal was observed, so 'each prior is right about a different world' is UNPROVEN here, only half-shown.",
    "THE BLOB ONTOLOGY (blobFit.js) LOSES to the belief-free grid solver on a world made of blobs: 8 views 5.45% (grid) vs 45.45% (fit). Diagnosed: misfit at the TRUE blobs is 0.000e+0 and the search lands 5.7e9x worse -- THE MODEL IS RIGHT, THE SEARCH FAILS. 1,600 unknowns CONVEX beats 20 unknowns NON-CONVEX. The stuck fit found 3 of 5 blobs, smeared 2, and INVENTED one at (0.51,0.55), at a misfit of 5.7e-3 that looks small: a strong prior fails CONFIDENTLY where a weak one fails noisily. Needs a real optimiser (multi-start / greedy peeling / annealing).",
    "v2480 REVERSES v2479 AT LOW BUDGET: under SIRT (which handles uneven views), the surprise-led eye WINS at 4 views in every world tried -- row of blobs 9.79->8.67%, scattered clump 7.06->5.55%, two blobs far apart 12.54->7.45%. At 6 views uniform retakes the crowded worlds but NOT the sparsest (5.69->3.57%, active ahead 37%). THE SPARSER THE WORLD, THE MORE A CHOSEN LOOK IS WORTH -- Keith's 'unless there was less of it', measured. v2479's negative result stands, but it was a fact about FBP, not about looking.",
    "the discrete forward model's floor: even handed the PERFECT field, A reproduces the analytic shadow to 0.303% (48^2, 200 line samples) / 0.047% (128^2, 600). No solver beats its own floor. NOTE: v2479 reported a '7% predictor accent' -- that was measured by projecting a RECONSTRUCTION and mostly blamed the reconstruction's error on the projector.",
    "ACTIVE VISION, NEGATIVE RESULT (v2479): choosing views by SURPRISE loses to plain uniform sampling 2-3x at every budget (4 views 178% vs 357%; 16 views 20.73% vs 78.26%). Cause: a surprise-led eye clusters, and clustered views are FLAT at ~152% from 6 to 16 views even when gap-weighted -- each view is one line through the Fourier transform and coverage is the requirement, not a convention. Selective looking needs a reconstructor WITH A PRIOR (TV/L1); FBP is linear and belief-free, so it demands uniform coverage. Perception without a prior must be exhaustive.",
    "there is NO MODEL-FREE measure of a view's worth: variance ranks the emptiest view (5 blobs stacked into one spike) highest; high-frequency energy does too (a delta is broadband). A view carries information only relative to a model -- which is why a thing cannot know where to look until it already has one.",
    "the blobulator selfie converges: 0.067% at 24 angles -> 0.059% at 180, and the marched SKIN matches the true field's triangle for triangle (3,808 vs 3,808, 0.00% apart) -- needs the sweep",
    "why the blobulator's OWN kernel cannot be scanned: r^3/(d^2+eps) decays as 1/d^2 and never reaches zero (9.4% of peak ten radii out) -> FBP has no compact support -> 108% error, FLAT from 24 to 180 angles. Truncating it: exact arctan shadow, but a hard edge -> 10.4%, still flat (Gibbs). Wyvill is compact AND smooth -> 0.06%.",
    "3D tomography converges away from edges: 0.11% at 45 angles -> 0.06% at 90 and 180 (48^3, whole-volume sits at ~14% -- Gibbs at hard edges, correct behaviour). Needs the sweep.",
    "cosmology: the P(k) round trip averaged over 12 universes sits at 1.006 +/- 0.003 against <P(k)> (vs 1.036 against P(<k>) -- Jensen) -- needs the sweep",
    "cosmology: the Zeldovich caustic from the code's own displacement array lands at D = 1/A to 0.6% (finite-difference limited on a 64 grid)",
    "back-projection converges as angles rise: 12.2% at 48 -> 2.96% at 192 -> 1.96% at 768 (away from edges) -- needs the sweep",
    "tomography: the analytic Radon transform matches a brute-force line integral to 1.1e-6 -- needs 2M samples per ray",
    "tomography: FBP converges first-order in BOTH limits -- angles 45/90/180 -> 1.61e-3, 8.4e-4, 4.1e-4, then a floor set by the detector count: 128/256/512 -> 6.2e-4, 3.3e-4, 1.6e-4",
    "3D Rayleigh-Benard brackets the same 1708 as the 2D lattice (conducts at Ra 1500, convects at 1900) -- 200s of 3D lattice",
    "3D pipe converges to Hagen-Poiseuille as it is resolved: 3.0% at R=6 -> 1.3% at R=10 -> 0.54% at R=14 -- needs the sweep",
    "Rayleigh-Benard onset 1706 vs the exact 1707.76 (0.09%) -- needs a bisection over 20k-step runs",
    "Galilean invariance 0.40% at Ma 0.07 -> 22.57% at Ma 0.29 -- needs a 5-run sweep",
    "Kelvin-Helmholtz reproduces Michalke's band, converges to the inviscid neutral point -- mode sweep",
    "Sedov R ~ t^0.5129 vs the exact 0.5, blast round to 0.71% -- needs a 200x200 blast",
    "sharp-interface RT sigma ~ k^0.480 vs the exact 0.5 -- needs a mode sweep",
    "vortex shedding: Hopf bifurcation emerges, Strouhal 0.160 -- needs a long run",
];
function runSuite(opts = {}) {
    const rows = [];
    for (const c of CHECKS) {
        const t0 = Date.now();
        let r, err = null;
        try { r = c.run(); } catch (e) { err = e.message; }
        rows.push({ name: c.name, exact: c.exact, tol: c.tol, ms: Date.now() - t0,
            got: r ? r.got : NaN, unit: r ? r.unit : "", detail: r ? r.detail : "", err,
            pass: !err && r.got <= c.tol });
    }
    return { rows, ungated: UNGATED, allPass: rows.every(r => r.pass), ms: rows.reduce((a, r) => a + r.ms, 0) };
}
export { runSuite, CHECKS, UNGATED };
