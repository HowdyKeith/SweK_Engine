// WebGLEngine/physics/md/diffusion.js — v3286
// ---------------------------------------------------------------------------------------------------------------
// THE SELF-DIFFUSION COEFFICIENT, BY TWO ROUTES THAT SHARE NO OBSERVABLE — the fourth pair for the consistency
// board, and the first one built on molecular dynamics.
//
//   EINSTEIN:    D = lim(t -> inf) <|r(t) - r(0)|^2> / 6t          -- from POSITIONS, integrated over long times
//   GREEN-KUBO:  D = (1/3) integral_0^inf <v(0) . v(t)> dt         -- from VELOCITIES, integrated over short ones
//
// They are provably equal (the MSD is the double time integral of the velocity autocorrelation), and that is
// exactly what makes the pair worth having: the equality is a THEOREM, so a disagreement is never "different
// physics", it is always a bug. And they fail in opposite directions -- Einstein needs LONG trajectories and is
// ruined by too short a run; Green-Kubo needs a WELL-RESOLVED correlation function and is ruined by too coarse a
// timestep or a truncated tail. A single estimator has no way to tell you which of its own problems it has.
//
// *** THE UNWRAPPED POSITIONS ARE THE WHOLE TRICK, AND THE CLASSIC BUG. *** Under periodic boundaries a particle
// crossing the wall jumps a box-width, and an MSD computed from wrapped coordinates measures the wall rather
// than the motion -- it saturates at ~L^2/6 and looks like a beautifully converged plateau. So the integrator
// wraps for FORCES and this device accumulates displacement UNWRAPPED for the MSD. msdWrappedWRONG is exported
// to measure the difference, because "it saturated, so it converged" is the most persuasive wrong answer in
// this whole subject.
//
// HONEST SCOPE: at this system size and run length the two routes agree to a few percent, not to five digits.
// The tolerance is earned from a measured seed spread rather than chosen, and the pair is admitted to the board
// with that tolerance stated. A Lennard-Jones D at one state point has no closed form to check against, which
// is precisely why two mechanisms are the check.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { velocityVerlet } from "./md.js";
import { makeBox, computeForcesPBC, makeFluid, wrapAll } from "./pbc.js";

/**
 * Run an equilibrated trajectory and record BOTH observables from the same run: unwrapped displacement (for
 * Einstein) and velocities (for Green-Kubo). Same trajectory, two independent readings of it.
 */
// *** MULTIPLE TIME ORIGINS, AND WHY THE FIRST VERSION WITHOUT THEM WAS NOT WORTH SHIPPING. *** Reading MSD and
// VACF from a SINGLE starting instant uses one sample per lag: the two routes disagreed by 38%, 14% and 5% on
// three seeds, which is not a pair, it is noise with two names. Averaging over many origins along one trajectory
// costs memory and nothing else, and it is what every real implementation does.
//
// DENSITY MATTERS TOO: the first attempt ran rho = 0.088, a dilute gas where the motion is nearly ballistic for
// the whole window and D came out around 2.5 -- an honest number for a system nobody meant to simulate.
export function runTrajectory({ n = 4, L = 6.2, kT = 1.4, dt = 0.004, steps = 6000, warmup = 2000,
                                cutoff = 3, seed = 17, eps = 1, sig2 = 1, wrapMSD = false,
                                maxLagFrac = 0.25, originStride = 5 } = {}) {
    const box = makeBox({ L, cutoff });
    const f = makeFluid({ n, L, kT, seed });
    const N = f.N;
    const state = { pos: f.pos, vel: f.vel, masses: f.masses, forces: computeForcesPBC(f.pos, N, eps, sig2, box).forces };
    const force = (pos) => computeForcesPBC(wrapAll(pos, N, box.L), N, eps, sig2, box);

    for (let s = 0; s < warmup; s++) velocityVerlet(state, dt, force);

    // UNWRAPPED trajectory: undo the wrap the integrator applies, so displacement measures motion and not walls.
    const posHist = new Float64Array(3 * N * steps);
    const velHist = new Float64Array(3 * N * steps);
    const disp = new Float64Array(3 * N);
    let prev = Float64Array.from(state.pos);
    for (let s = 0; s < steps; s++) {
        velocityVerlet(state, dt, force);
        for (let k = 0; k < 3 * N; k++) {
            let d = state.pos[k] - prev[k];
            if (!wrapMSD) { if (d > box.L / 2) d -= box.L; else if (d < -box.L / 2) d += box.L; }
            disp[k] += d;
            posHist[s * 3 * N + k] = disp[k];
            velHist[s * 3 * N + k] = state.vel[k];
        }
        prev.set(state.pos);
    }

    // average over time origins: lag tau, origins t0 = 0, stride, 2*stride, ...
    const maxLag = Math.floor(steps * maxLagFrac);
    const msd = new Float64Array(maxLag), vacf = new Float64Array(maxLag);
    const counts = new Float64Array(maxLag);
    for (let t0 = 0; t0 + maxLag < steps; t0 += originStride) {
        const o = t0 * 3 * N;
        for (let lag = 0; lag < maxLag; lag++) {
            const a = (t0 + lag) * 3 * N;
            let acc = 0, cv = 0;
            for (let i = 0; i < N; i++) {
                const x = posHist[a + 3 * i] - posHist[o + 3 * i];
                const y = posHist[a + 3 * i + 1] - posHist[o + 3 * i + 1];
                const z = posHist[a + 3 * i + 2] - posHist[o + 3 * i + 2];
                acc += x * x + y * y + z * z;
                cv += velHist[o + 3 * i] * velHist[a + 3 * i]
                    + velHist[o + 3 * i + 1] * velHist[a + 3 * i + 1]
                    + velHist[o + 3 * i + 2] * velHist[a + 3 * i + 2];
            }
            msd[lag] += acc / N; vacf[lag] += cv / N; counts[lag]++;
        }
    }
    for (let lag = 0; lag < maxLag; lag++) { msd[lag] /= counts[lag]; vacf[lag] /= counts[lag]; }
    return { msd, vacf, dt, N, steps, box, kT, origins: counts[0], density: N / box.volume };
}

/**
 * EINSTEIN: fit the slope of MSD(t) over the DIFFUSIVE window -- the late portion, after the ballistic start
 * and the cage rattle. Fitting from t = 0 measures the ballistic regime and reports a D several times too high,
 * which is a real answer to a question nobody asked.
 */
export function einsteinD({ msd, dt, from = 0.5, to = 1.0 }) {
    const i0 = Math.floor(msd.length * from), i1 = Math.floor(msd.length * to);
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    for (let i = i0; i < i1; i++) { const t = i * dt; sx += t; sy += msd[i]; sxx += t * t; sxy += t * msd[i]; n++; }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return { D: slope / 6, slope, window: [i0 * dt, i1 * dt] };
}

/**
 * GREEN-KUBO: integrate the velocity autocorrelation with the trapezoid rule, normalised by its t=0 value times
 * 3kT/m... no -- <v(0).v(0)> = 3kT/m already, so the integral of the RAW correlation over 3 IS D. The cut is
 * where the tail stops carrying signal; it is a real choice and it is returned so a caller can see it.
 */
// THE CUT IS CHOSEN WHERE THE CORRELATION HAS DECAYED INTO NOISE, and 0.25 was measured to be too early: the
// integral was still climbing there (D = 0.777 at cut 1.5, 0.830 at 2.4, 0.860 at 3.6, 0.830 at 5.1), which is
// exactly why Green-Kubo sat systematically BELOW Einstein on every seed. A truncated tail is a one-signed
// error and it reads like a real disagreement. The default now sits in the PLATEAU, and the gate checks that a
// plateau exists rather than trusting this number -- an integral that never stops changing with its own cut has
// not converged, whatever value you stop at.
export function greenKuboD({ vacf, dt, cutFraction = 0.6 }) {
    const cut = Math.max(2, Math.floor(vacf.length * cutFraction));
    let integral = 0;
    for (let i = 1; i < cut; i++) integral += 0.5 * (vacf[i - 1] + vacf[i]) * dt;
    return { D: integral / 3, cutTime: cut * dt, vacf0: vacf[0] };
}

/** The pair, from ONE trajectory read two ways. */
export function diffusionPair(opts = {}) {
    const tr = runTrajectory(opts);
    const e = einsteinD({ msd: tr.msd, dt: tr.dt });
    const g = greenKuboD({ vacf: tr.vacf, dt: tr.dt });
    return {
        name: "self-diffusion D",
        a: { route: "Einstein MSD slope (positions)", mechanism: "einstein-msd", value: e.D },
        b: { route: "Green-Kubo velocity autocorrelation (velocities)", mechanism: "green-kubo-vacf", value: g.D },
        detail: { einstein: e, greenKubo: g, N: tr.N, steps: tr.steps, dt: tr.dt },
    };
}

/** NAMED WRONG: MSD from wrapped coordinates. Saturates, looks converged, measures the box. */
export const msdWrappedWRONG = (opts = {}) => runTrajectory({ ...opts, wrapMSD: true });
