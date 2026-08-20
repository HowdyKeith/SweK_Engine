// WebGLEngine/simulation/lbm/benardSweep.mjs -- v2869
//
// THE COUPLED SYSTEM, MEASURED, AND HANDED TO THE DISCOVERER.
//
// thermal2d.js is already a COUPLING: temperature rides on momentum and, through buoyancy, momentum rides back on
// temperature. That loop is convection, and it has an exact onset -- Rayleigh's 1707.76, which the lab has
// already bracketed. This module does not re-derive any of that. It measures the NUSSELT NUMBER across the
// transition and hands the result to the equation discoverer, which is where the two halves of this project meet.
//
// WHAT NUSSELT IS: total vertical heat transport divided by what pure conduction alone would carry.
//
//     Nu = 1 + <uy*T> * H / (kappa * dT)
//
// Below onset there is no flow, so <uy*T> is zero and Nu is EXACTLY ONE -- not approximately, exactly, because
// the convective term is identically absent. Above onset the fluid organises into rolls and carries heat itself.
//
// THREE REGIMES, AND THE MIDDLE ONE IS THE POINT:
//
//   BELOW ONSET   Nu = 1 exactly. An EXACT KEY -- nothing is fitted, the number is forced by the physics.
//   ABOVE ONSET   Nu follows a power law in Ra. The exponent is a MEASUREMENT, NOT A KEY: it is
//                 regime-dependent (literature puts it near 0.28-0.33 depending on Ra range, geometry and
//                 Prandtl number), so grading against a specific value would be dressing a preference up as
//                 physics. It is reported and not asserted.
//   ACROSS ONSET  THERE IS NO SINGLE LAW AT ALL, because a bifurcation is not a smooth function. So the
//                 discoverer must REFUSE -- and that refusal is how symbolic regression LOCATES a phase
//                 transition rather than papering over it.
//
// That third case is the reason this is worth building. A fitter that returns a confident power law spanning a
// bifurcation has hidden the most interesting thing in the data.
//
// A PRACTICAL LIMIT, MEASURED NOT ASSUMED: near onset the instability grows exponentially but SLOWLY -- critical
// slowing down. At 20,000 steps Ra=1900 read Nu=1.000041, which is not converged; it is a transient caught early.
// So the near-onset weakly-nonlinear exponent (exactly 1 from the pitchfork normal form) is NOT claimed here:
// resolving it needs runs long exactly where they are slowest. Saying so is cheaper than a wrong number.
"use strict";
import { makeThermal } from "./thermal2d.js";

export const RA_C = 1707.76;          // Rayleigh's critical number. Nothing below decides anything with it.

export const DEFAULT_CELL = { nx: 96, ny: 34, tau: 0.6, steps: 30000, dT: 1.0 };

export const viscosityOf = (tau) => (tau - 0.5) / 3;

/**
 * Build a Rayleigh-Benard cell at a target Rayleigh number. The recipe -- hot floor, cold ceiling, walls that
 * HOLD their temperature, a linear profile seeded with a small sinusoidal perturbation -- is taken from the
 * existing thermal-flow.html rather than reinvented, so the page and this module cannot disagree about what
 * "Rayleigh 3000" means.
 *
 * The perturbation is not decoration: convection is a SYMMETRY-BREAKING instability, and a perfectly flat
 * initial profile can sit on the unstable branch indefinitely. Same lesson the splat shear sabotage taught.
 */
export function makeCell(Ra, opts = {}) {
    const c = { ...DEFAULT_CELL, ...opts };
    const H = c.ny - 2;
    const nu = viscosityOf(c.tau), alpha = nu;          // Prandtl = 1: momentum and heat relax alike
    const gbeta = (Ra * nu * alpha) / (c.dT * H * H * H);
    const m = makeThermal({
        nx: c.nx, ny: c.ny, tau: c.tau, tauG: c.tau,
        gravity: -1, beta: -gbeta, Thot: 0.5, Tcold: -0.5,
        init: (x, y) => ({ T: 0.5 - (y - 0.5) / H + 0.02 * Math.sin(7 * Math.PI * x / c.nx) * Math.sin(Math.PI * (y - 0.5) / H) }),
    });
    return { m, cfg: c, H, nu, alpha };
}

/** Nu = 1 + <uy*T> H / (kappa dT), averaged over the fluid interior (the walls are solid and carry no flow). */
export function nusselt(cell) {
    const { m, cfg, H, alpha } = cell;
    let s = 0, n = 0;
    for (let y = 1; y < cfg.ny - 1; y++) {
        for (let x = 0; x < cfg.nx; x++) { const k = y * cfg.nx + x; s += m.uy[k] * m.T[k]; n++; }
    }
    return n ? 1 + (s / n) * H / (alpha * cfg.dT) : NaN;
}

export function healthy(cell) {
    return [...cell.m.T].every((v) => Number.isFinite(v)) && [...cell.m.rho].every((v) => Number.isFinite(v) && v > 0.5 && v < 2);
}

/** Run one Rayleigh number to a fixed step count and report Nu. Returns the health flag too -- a diverged cell's
 *  Nusselt number is a number, and it means nothing. */
export function runOne(Ra, opts = {}) {
    const cell = makeCell(Ra, opts);
    const steps = cell.cfg.steps;
    for (let i = 0; i < steps; i++) cell.m.step();
    const ok = healthy(cell);
    return { Ra, Nu: ok ? nusselt(cell) : NaN, healthy: ok, steps };
}

export function sweep(RaList, opts = {}, onPoint) {
    const out = [];
    for (const Ra of RaList) {
        const r = runOne(Ra, opts);
        out.push(r);
        if (onPoint) onPoint(r);
    }
    return out;
}

// ---- what a full sweep measured (v2869) ---------------------------------------------------------------------
//
// Recorded as data so the gate can assert the shape without paying for the run: ten Rayleigh numbers at 30,000
// steps on a 96x34 cell is minutes, and the suite budget is sixty seconds. A gate nobody can afford to run is a
// gate nobody runs -- physicsSuite says exactly this at the top of its own file.
export const SWEEP_V2869 = [
    { Ra: 600,   Nu: 1.0000000000004006 },
    { Ra: 900,   Nu: 1.0000000000312785 },
    { Ra: 1200,  Nu: 1.0000000015833512 },
    { Ra: 1500,  Nu: 1.0000000703790657 },
    { Ra: 2500,  Nu: 1.170272039203092 },
    { Ra: 3500,  Nu: 1.7047559279478177 },
    { Ra: 5000,  Nu: 2.051840052829831 },
    { Ra: 7000,  Nu: 2.3451875379197253 },
    { Ra: 10000, Nu: 2.6436863607938386 },
    { Ra: 14000, Nu: 2.6122228217054952 },
];   // 96x34, tau 0.6, 30,000 steps each, all healthy. ~10 minutes of lattice.

// ---- WHAT THE DISCOVERER SAID, AND IT REFUSED THREE TIMES -----------------------------------------------------
//
// THE ONE EXACT THING HELD. Below onset, max |Nu - 1| over four Rayleigh numbers is 7.0e-8 -- the seeded
// perturbation decaying, not quite to zero at 30,000 steps. Nothing is fitted there; the convective term is
// identically absent and the number is forced.
//
// AND THEN THE FITTER SAID NO, THREE TIMES, AND WAS RIGHT EVERY TIME:
//
//   ACROSS ONSET      no law. Expected and designed for -- a bifurcation is not a smooth function, and this is
//                     how symbolic regression LOCATES a transition instead of papering over it.
//   THE WHOLE SUPERCRITICAL BRANCH   no law, validation R2 -19 even after dropping the top point. NOT expected.
//   THE WEAKLY-NONLINEAR FORM        no law: Nu-1 against (Ra/Ra_c - 1), whose exponent the pitchfork normal
//                     form puts at exactly 1, does not fit either.
//
// THE READING, and it is a real result rather than a failure: THE SAMPLED RANGE SITS IN THE CROSSOVER. Ra/Ra_c
// runs from 1.5 to 8, which is already too far above threshold for the weakly-nonlinear linear-in-(Ra-Ra_c)
// regime and not far enough for the asymptotic power law. Neither form owns this range, so no single exponent
// describes it -- and there is a bonus tell at the top, where Nu goes NON-MONOTONIC (2.6437 at Ra 10,000 falling
// to 2.6122 at 14,000) with the field still healthy, which is the flow changing character rather than diverging.
//
// WHY THAT MATTERS MORE THAN AN EXPONENT WOULD HAVE. A naive fitter hands back about 0.3 here, which is close
// enough to the literature's 0.28-0.33 to look like a confirmation and be worth nothing, because it was fitted
// across a crossover. THE REFUSAL IS THE FINDING. This is precisely the failure mode the no-law verdict was
// built for, met in real data on the first coupled system it was pointed at.
//
// TO ACTUALLY RESOLVE EITHER EXPONENT you need points much closer to onset -- blocked by critical slowing down,
// since the growth is slowest exactly where you need it -- or much higher Ra, blocked by grid resolution and the
// onset of unsteadiness. Both are rig jobs, and neither is "run it longer".

/** Convenience for the discoverer: split a sweep at the critical number. */
export function splitAtOnset(points, Rac = RA_C) {
    return {
        below: points.filter((p) => p.Ra < Rac),
        above: points.filter((p) => p.Ra > Rac),
        all: points.slice(),
    };
}

// ---- v2979: AUDITING v2869's REFUSAL WITH ROLLING ORIGINS ----------------------------------------------------------
//
// v2869 handed the supercritical branch to the discoverer, got NO LAW, and concluded that the sampled range sits
// in the CROSSOVER between the weakly-nonlinear regime and the asymptotic power law. That conclusion rested on a
// SINGLE train/validate split -- and v2978 measured that a single split can report a confident verdict which
// flips when you move the cut. So the honest question is whether v2869's refusal was a finding or an accident of
// where the data happened to be divided.
//
// IT WAS A FINDING. Rolling the origin over five cut fractions: no-law at EVERY ONE. lawFraction 0.
//
// AND NO SUB-WINDOW SUPPORTS ONE EITHER. Sliding a 4-point window along the supercritical branch:
//
//     Ra  2500..7000    no-law
//     Ra  3500..10000   no-law
//     Ra  5000..14000   no-law
//
// So it is not that one particular span straddles the crossover while a narrower one would behave. NO PART of
// the sampled range supports a single power law, which is a stronger statement than v2869 was able to make and
// it is the one its "the sampled range sits in the crossover" always meant.
//
// WHAT THIS DOES NOT SHOW, and the distinction matters: it does not prove no exponent exists. It proves none is
// RECOVERABLE FROM THIS DATA. Resolving one still needs points much closer to onset -- blocked by critical
// slowing down -- or much higher Ra, blocked by grid resolution and the onset of unsteadiness. Both are rig jobs.
export const ROLLING_AUDIT_V2979 = {
    branch: "supercritical",
    origins: [0.4, 0.5, 0.6, 0.7, 0.8],
    lawFraction: 0,
    windows: [
        { from: 2500, to: 7000, verdict: "no-law" },
        { from: 3500, to: 10000, verdict: "no-law" },
        { from: 5000, to: 14000, verdict: "no-law" },
    ],
    reading: "the refusal is robust to WHERE the data is cut and to WHICH part is looked at -- so v2869's crossover reading holds, and is now measured rather than inferred from one split",
};
