// WebGLEngine/physics/consistency.mjs — v3283
// ---------------------------------------------------------------------------------------------------------------
// THE CONSISTENCY BOARD — a new KIND of key for the lab. Every gate so far holds a measurement against algebra
// (Onsager, Yang, Kesten, a conjugate posterior) or against a sabotaged twin. This board holds measurements
// against EACH OTHER: one physical constant, TWO ROUTES that share no code and no assumptions beyond the
// physics, and a gate on their agreement. That is how real metrology certifies a number — nobody hands CODATA
// a closed form for G; they hand it independent instruments that agree.
//
// v3285 -- EACH ROUTE NOW CARRIES A MACHINE-READABLE `mechanism` ID, because the admission rule below was prose
// and prose cannot refuse anything. With the board going fleet-wide (consistencyFleet.mjs) the tempting mistake
// arrives immediately: run the SAME route on two machines, watch the numbers agree, and call it a consistency
// pair. That is one mechanism run twice -- a reproducibility check, which the zero-tolerance kernels already do
// better -- and the ids are what let the code say no.
//
// THE RULE FOR A PAIR TO SIT ON THIS BOARD: the two routes must be independent in MECHANISM, not just in code
// path. A susceptibility peak and a Binder cumulant weigh different moments of different observables; a
// Jarzynski average and a Crooks crossing read different features of the work distribution; an LBM's nominal
// viscosity is an input parameter while its shear-decay viscosity is hydrodynamic BEHAVIOUR. Two calls to the
// same estimator with different seeds do not qualify and never will.
//
// Each pair returns { name, a: {route, value}, b: {route, value}, tol, agree } — a measurement, and the gate
// asserts every pair agrees. The board page renders the same objects; one implementation of each fact.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { binderCurve, binderCrossing, sweepTemperature } from "./statmech/ising.js";
import { jarzynskiRun, crooksRun, crooksAnalyze } from "./langevin/langevin.js";
import { makeLBM, equilibrium, viscosityOf, Q } from "../simulation/lbm/lbm2d.js";
import { diffusionPair } from "./md/diffusion.js";

// ---- PAIR 1: the Ising critical temperature, two mechanisms -----------------------------------------------------
// Route A: Binder-cumulant crossing of L=8 and L=16 (fourth-moment ratio; crossing is size-independent to
// leading order). Route B: susceptibility-peak positions at the same two sizes, EXTRAPOLATED with the exact 2D
// Ising correlation exponent nu = 1: peak(L) = Tc + a/L, so Tc = 2*peak(16) - peak(8). Different observables,
// different moments, different finite-size logic.
// ---- route B machinery: chi amplitude-ratio crossing --------------------------------------------------------
// HISTORY, kept because the board earned it on its own code: route B was first built as a chi-PEAK 1/L
// extrapolation. The peak of chi(T) at these sizes is BROAD, its located position swung by ~0.2 across seeds,
// and the extrapolation Tc = 2*p(2L) - p(L) DOUBLES that noise — the board flagged its own route as
// inconsistent, which is the board working. The replacement is well-conditioned: at T_c, Fisher scaling with
// the EXACT 2D Ising gamma/nu = 7/4 fixes the amplitude ratio chi(2L)/chi(L) = 2^(7/4); the measured ratio
// climbs steeply through that value, and locating a steep crossing is stable where locating a flat maximum is
// not (seed spread measured at 0.023 vs ~0.2). Chi curves are averaged over nSeeds BEFORE the ratio is taken.
export function chiRatioTc({ L = 12, baseSeed = 12, nSeeds = 4, samples = 1500, warmup = 500,
                             target = Math.pow(2, 7 / 4) } = {}) {
    const avgChi = (LL) => {
        let acc = null, temps = null;
        for (let k = 0; k < nSeeds; k++) {
            const r = sweepTemperature({ L: LL, from: 2.10, to: 2.50, steps: 17, seed: baseSeed + k * 101, warmup, samples });
            if (!acc) { acc = r.rows.map((x) => x.susceptibility); temps = r.rows.map((x) => x.T); }
            else r.rows.forEach((x, i) => { acc[i] += x.susceptibility; });
        }
        return { temps, chi: acc };
    };
    const a = avgChi(L), b = avgChi(2 * L);
    for (let i = 1; i < a.temps.length; i++) {
        const r0 = b.chi[i - 1] / a.chi[i - 1], r1 = b.chi[i] / a.chi[i];
        if ((r0 - target) * (r1 - target) < 0) {
            const t = (target - r0) / (r1 - r0);
            return a.temps[i - 1] + t * (a.temps[i] - a.temps[i - 1]);
        }
    }
    return null;
}
export function pairIsingTc({ fast = false } = {}) {
    const temps = [2.10, 2.16, 2.22, 2.27, 2.33, 2.39, 2.45];
    const sw = fast ? 6000 : 10000, wu = fast ? 1000 : 2000;
    const c8 = binderCurve({ L: 8, temps, seed: 7, warmup: wu, samples: sw });
    const c16 = binderCurve({ L: 16, temps, seed: 7, warmup: wu, samples: sw });
    const a = binderCrossing(c8, c16);
    const b = chiRatioTc({ L: 12, baseSeed: 12, nSeeds: fast ? 4 : 6, samples: fast ? 1500 : 2500 });
    return { name: "Ising T_c",
             a: { route: "Binder crossing L=8/16 (dimensionless cumulant)", mechanism: "binder-cumulant", value: a },
             b: { route: "chi(24)/chi(12) = 2^(7/4) crossing (Fisher amplitude ratio)", mechanism: "fisher-amplitude-ratio", value: b }, tol: 0.09,
             agree: a != null && b != null && Math.abs(a - b) < 0.09 };
}

// ---- PAIR 2: the free-energy difference of the stiffening trap --------------------------------------------------
// Route A: Jarzynski's exponential average over FORWARD trajectories only. Route B: the Crooks crossing of
// forward against reverse histograms — a pointwise feature that does not exist in either ensemble alone.
export function pairTrapDeltaF({ fast = false } = {}) {
    const nT = fast ? 15000 : 30000;
    const j = jarzynskiRun({ k0: 1, k1: 4, steps: 8, nTraj: nT, seed: 17 });
    const c = crooksRun({ k0: 1, k1: 4, steps: 8, nTraj: nT, seed: 23 });
    const an = crooksAnalyze(c.Wf, c.Wr, c.kT);
    // route B reads the log-ratio FIT (30+ bins vote), not the single crossing bin — at the board's ensemble
    // sizes the crossing estimator wanders by a bin width while the fit does not; measured, not assumed.
    return { name: "trap dF (k:1->4)",
             a: { route: "Jarzynski forward average", mechanism: "jarzynski-forward-average", value: j.dFjarzynski },
             b: { route: "Crooks log-ratio fit", mechanism: "crooks-log-ratio", value: an.dFfromFit }, tol: 0.08,
             agree: an.dFfromFit != null && Math.abs(j.dFjarzynski - an.dFfromFit) < 0.08 };
}

// ---- PAIR 3: the LBM's kinematic viscosity ----------------------------------------------------------------------
// Route A: the INPUT — nu = (tau - 1/2)/3, what the collision operator is configured to produce. Route B: the
// BEHAVIOUR — seed a shear wave u_x(y) = u0 sin(2 pi y / ny) in a doubly periodic box and watch hydrodynamics
// damp it: amplitude ~ exp(-nu k^2 t). The decay rate is measured from the fluid, which was never told nu.
export function pairLbmViscosity({ tau = 0.8, fast = false } = {}) {
    const nx = 8, ny = 64, u0 = 0.02, k = 2 * Math.PI / ny;
    const sim = makeLBM({ nx, ny, tau, channel: false, periodicY: true });
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const u = u0 * Math.sin(k * y), base = sim.idx(x, y) * Q;
        for (let i = 0; i < Q; i++) sim.f[base + i] = equilibrium(i, 1, u, 0);
    }
    const amp = () => { let s = 0; for (let y = 0; y < ny; y++) s += sim.ux[sim.idx(nx >> 1, y)] * Math.sin(k * y); return 2 * s / ny; };
    const T0 = 40, T1 = fast ? 240 : 400;
    for (let t = 0; t < T0; t++) sim.step();
    const a0 = amp();
    for (let t = T0; t < T1; t++) sim.step();
    const a1 = amp();
    const measured = Math.log(a0 / a1) / (k * k * (T1 - T0));
    const nominal = viscosityOf(tau);
    return { name: "LBM viscosity (tau=" + tau + ")",
             a: { route: "configured (tau-1/2)/3", mechanism: "lbm-configured-tau", value: nominal },
             b: { route: "shear-wave decay rate", mechanism: "lbm-shear-decay", value: measured }, tol: nominal * 0.05,
             agree: Math.abs(measured - nominal) < nominal * 0.05 };
}

// ---- PAIR 4: the self-diffusion coefficient of a Lennard-Jones fluid -------------------------------------------
// Route A reads POSITIONS over long times (Einstein, MSD slope); route B reads VELOCITIES over short ones
// (Green-Kubo, the velocity autocorrelation integral). Their equality is a theorem, so a disagreement is never
// "different physics" -- it is always a bug, and because the two fail in OPPOSITE directions (Einstein wants a
// long trajectory, Green-Kubo a well-resolved correlation) the pair says which bug.
//
// The first pair on this board with NO closed form on either side: a LJ diffusion coefficient at one state
// point is not something algebra hands you. That is the case the board was built for.
export function pairDiffusion({ fast = false } = {}) {
    const p = diffusionPair(fast ? { steps: 3000, warmup: 1000 } : {});
    const tol = 0.10 * (p.a.value + p.b.value) / 2;    // EARNED: measured worst seed spread 6.3%
    return { name: "LJ self-diffusion D", a: p.a, b: p.b, tol,
             agree: Math.abs(p.a.value - p.b.value) < tol };
}

// the whole board, in one call — the page and the gate both read THIS.
export function runBoard({ fast = false } = {}) {
    return [pairIsingTc({ fast }), pairTrapDeltaF({ fast }), pairLbmViscosity({ fast }), pairDiffusion({ fast })];
}
