// tools/roundhouse/khBind.mjs
//
// v2818 -- roundhouse device: KELVIN-HELMHOLTZ (simulation/lbm/khDispersion.mjs). A shear layer between two
// streams is unstable, but only for long enough waves, and it grows fastest at one particular wavelength.
// Michalke's 1964 dispersion relation for a tanh layer makes TWO exact claims, and neither number appears
// anywhere in the solver:
//
//     the layer is unstable ONLY for k*delta < 1
//     growth peaks at k*delta = 0.4446, with sigma = 0.1897 * U0/delta
//
// TWO INDEPENDENT THINGS TO BE WRONG ABOUT, which is what makes it a good device: a solver could find a peak in
// the wrong place, or grow where it should be neutral, and those are different failures.
//
// HOW THE BAND IS SWEPT. k*delta = 2 pi * mode * delta / nx, so varying the LAYER THICKNESS at fixed mode
// traverses the band at constant cost -- no change in grid size, no change in run time per point. Michalke's
// relation is stated in k*delta, so this is a legitimate traversal rather than a trick.
//
// AN HONEST GAP, MEASURED NOT HIDDEN: the peak growth rate comes out around 0.11 rather than Michalke's 0.1897.
// That is viscous damping at finite Reynolds number on a coarse lattice -- his result is inviscid. So the
// device reports peakSigmaNorm as a measurement and the SHARP claims are the ones with clean answers: where the
// band ends, and that a peak exists inside it.
//
// This module's own header records that v2445 tried this three times and failed three times, every failure in
// the question rather than the fluid. The device inherits the fixed question.

import { khRun, fitGrowth, dispersion, MICHALKE } from "../../simulation/lbm/khDispersion.mjs";

export const KH_OBSERVABLES = [
    "kd", "sigmaNorm", "grew",
    "peakKD", "peakSigmaNorm", "michalkePeakKD", "michalkePeakSigma", "peakKDErrFrac", "peakSigmaErrFrac",
    "neutralRespected", "unstableCount", "stableCount", "points",
];

const DEF = { nx: 96, ny: 96, tau: 0.52, U0: 0.04, delta: 9, mode: 1, steps: 1500 };
const SWEEP_DELTAS = [4, 6, 9, 13, 18];        // kd from ~0.26 to ~1.18 at nx=96: across the band and past it

export function khDefaults(hyp) {
    const h = { mode: "sweep", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.nx = Math.min(160, Math.max(48, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(160, Math.max(48, num(c.ny, DEF.ny) | 0));
    c.tau = Math.min(1, Math.max(0.51, num(c.tau, DEF.tau)));
    c.U0 = Math.min(0.12, Math.max(0.005, num(c.U0, DEF.U0)));       // above ~0.12 the lattice is compressible
    c.delta = Math.min(30, Math.max(2, num(c.delta, DEF.delta)));
    c.mode = Math.min(4, Math.max(1, num(c.mode, DEF.mode) | 0));
    c.steps = Math.min(8000, Math.max(400, num(c.steps, DEF.steps) | 0));
    h.config = c;
    if (!["single", "sweep", "neutral", "halfthickness"].includes(h.mode)) h.mode = "sweep";
    return h;
}

function one(c, delta, halfThickness = false) {
    // *** v3766 -- THE PLANT: `halfthickness` REPORTS k*delta/2 AS THE ABSCISSA. Michalke's relation is stated
    // in k*delta with delta the VORTICITY thickness, and the HALF-THICKNESS is an equally common convention in
    // the same literature -- so this is THE SAME LAYER MEASURED THE OTHER WAY, not a scrambled number. THE
    // FLUID IS UNTOUCHED: every growth rate is exactly as measured and only the x-axis lies, which moves THE
    // BAND EDGE BY A FACTOR OF TWO. It is one-sided by construction -- MICHALKE.neutral is a typed external
    // and never sees the simulation. ***
    const r = khRun({ nx: c.nx, ny: c.ny, tau: c.tau, U0: c.U0, delta, mode: c.mode, steps: c.steps,
                      thicknessConvention: halfThickness ? "half" : "vorticity" });
    const sigma = fitGrowth(r.hist, r.sampleEvery);
    return { kd: r.kd, sigmaNorm: sigma * r.delta / r.U0, grew: r.hist[r.hist.length - 1] > r.hist[0] };
}

export async function buildKH(hyp, base = {}) {
    const h = khDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;

    if (h.mode === "single") {
        const r = one(c, c.delta);
        return { kd: r.kd, sigmaNorm: r.sigmaNorm, grew: r.grew, michalkePeakKD: MICHALKE.peakKD, michalkePeakSigma: MICHALKE.peakSigma };
    }

    if (h.mode === "neutral") {
        // one wave comfortably inside the band, one comfortably outside it
        const inside = one(c, Math.max(2, Math.round(0.45 * c.nx / (2 * Math.PI * c.mode))));
        const outside = one(c, Math.round(1.18 * c.nx / (2 * Math.PI * c.mode)));
        return {
            kd: inside.kd, sigmaNorm: inside.sigmaNorm, grew: inside.grew,
            neutralRespected: inside.sigmaNorm > 0 && outside.sigmaNorm < 0,
            unstableCount: inside.sigmaNorm > 0 ? 1 : 0,
            stableCount: outside.sigmaNorm < 0 ? 1 : 0,
            michalkePeakKD: MICHALKE.peakKD, points: 2,
        };
    }

    const half = h.mode === "halfthickness";
    const rows = SWEEP_DELTAS.map((d) => one(c, d, half));
    let best = rows[0];
    for (const r of rows) if (r.sigmaNorm > best.sigmaNorm) best = r;
    // the sharp claim: every wave inside the band grows, every wave outside it does not
    const neutralRespected = rows.every((r) => (r.kd < MICHALKE.neutral ? r.sigmaNorm > 0 : r.sigmaNorm < 0));
    return {
        peakKD: best.kd,
        peakSigmaNorm: best.sigmaNorm,
        michalkePeakKD: MICHALKE.peakKD,
        michalkePeakSigma: MICHALKE.peakSigma,
        peakKDErrFrac: Math.abs(best.kd - MICHALKE.peakKD) / MICHALKE.peakKD,
        // v3092 -- THE SECOND ANSWER KEY WAS ALREADY COMPUTED AND NEVER GRADED.
        //
        // michalkePeakSigma has sat in this object since the device was written, next to the measured
        // peakSigmaNorm, with nothing comparing them. At the default configuration they are 0.1059 against
        // 0.1897 -- A 44 PERCENT SHORTFALL, reported and ungraded. Same shape as v3089's asset hash: the number
        // was in the manifest, looking like a guarantee, and the one job it existed for was the one job nobody
        // asked it to do.
        //
        // IT IS INDEPENDENT OF peakKDErrFrac IN THE WAY v3091 SAYS A KEY MUST BE -- by what it looks at. peakKD
        // is the ARGMAX, the position along k where growth is largest; peakSigma is the VALUE there. A dispersion
        // curve can peak in the right place with the wrong magnitude, or carry the right magnitude at the wrong
        // wavenumber, and neither error is visible to the other.
        //
        // AND THE 44 PERCENT IS PHYSICS, NOT A DEFECT, which is why this ships as a graded number rather than as
        // a bug report. Michalke's value is the INVISCID tanh shear layer; this is an LBM at finite viscosity,
        // which damps the instability. Measured across tau: -0.0607 at 1.2 (damped, the sign is negative),
        // -0.0364 at 0.9, +0.0198 at 0.7, +0.0570 at 0.6, +0.0855 at 0.55, +0.1059 at the default 0.52 --
        // MONOTONE toward 0.1897 as viscosity falls, with a sign change on the way. That trend is the real
        // claim and the gate asserts it, because a fixed tolerance here would be a number somebody chose.
        peakSigmaErrFrac: Number.isFinite(best.sigmaNorm) && MICHALKE.peakSigma > 0
            ? Math.abs(best.sigmaNorm - MICHALKE.peakSigma) / MICHALKE.peakSigma : undefined,
        neutralRespected,
        unstableCount: rows.filter((r) => r.sigmaNorm > 0).length,
        stableCount: rows.filter((r) => r.sigmaNorm < 0).length,
        points: rows.length,
    };
}

export const khDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    // v3766 -- "sweep" stays FIRST so the mode-plant contract compares the plant against the mode that owns
    // neutralRespected; the plant is a variant of sweep, so sweep is its correct baseline (v3762's lesson).
    modes: ["sweep", "single", "neutral", "halfthickness"],
    plantMode: "halfthickness", plantFlips: "peakKDErrFrac", plantKind: "mode",
    name: "kelvin-helmholtz-dispersion", observables: KH_OBSERVABLES, build: buildKH, defaults: khDefaults };
