// WebGLEngine/tools/roundhouse/pulsarBind.mjs -- v3381
//
// *** DEVICE 57: PULSAR TIMING RESIDUALS. Third of the five fields with a module, a gate and no bind. ***
//
// pulsar-selfcheck is THIN -- four checks, and NOT ONE IS AN EXTERNAL KEY: the train is deterministic, the
// phase is a whole number of turns at every arrival, the interval lengthens, and the arrival solve rests on a
// correctly-rounded square root. All true, all SELF-CONSISTENCY. Nothing said what the numbers should BE.
//
// *** THE KEY IS HOW SPIN-DOWN IS ACTUALLY DISCOVERED: FIT THE WRONG MODEL AND READ THE RESIDUALS. *** Fit a
// CONSTANT-PERIOD line to the arrival times -- the naive model, which assumes no spin-down at all -- and what
// is left over is a PARABOLA whose curvature IS the spin-down rate. That is real pulsar astronomy, and it is a
// route this module's gate never takes: it checks the FORWARD model is self-consistent and never inverts it.
//
// *** AND MY FIRST DERIVATION WAS WRONG BY EXACTLY f0, WHICH THE MEASUREMENT CAUGHT. *** I predicted the
// curvature would be -fdot/(2 f0^2) and measured a ratio of 1.501335 against it -- which IS f0 = 1.5, not a
// tolerance failure. Working it properly: phase f0 t + fdot t^2 / 2 = N gives t ~ tau - (fdot/(2 f0)) tau^2
// with tau = N/f0, so THE CURVATURE IS -fdot/(2 f0). One f0, not two. A RATIO THAT COMES BACK AS A CLEAN
// PARAMETER RATHER THAN A SMALL NUMBER IS AN ALGEBRA ERROR ANNOUNCING ITSELF, and this tree has seen it before
// -- the CT units sabotage at v3073, where the shape was exactly right and the scale was not.
"use strict";
import { pulseArrivalTimes, periodAt, phaseAt } from "../../physics/pulsar/pulsar.js";

const DEF = { f0: 1.5, fdot: -1e-6, nPulses: 4000 };
export const MODES = ["residualCurvature", "spindownAge", "linearIsWrong"];

/** Least-squares line through (index, arrivalTime), then a quadratic through what is left. */
export function residualFit(times) {
    const n = times.length, idx = [...Array(n).keys()];
    const sx = idx.reduce((a, b) => a + b, 0), sy = times.reduce((a, b) => a + b, 0);
    const sxy = idx.reduce((a, x, i) => a + x * times[i], 0), sxx = idx.reduce((a, x) => a + x * x, 0);
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - m * sx) / n;
    const res = times.map((v, i) => v - (m * i + c));
    const S = (f) => times.reduce((s, x, i) => s + f(x, res[i]), 0);
    const A = [[S((x) => x ** 4), S((x) => x ** 3), S((x) => x * x)],
               [S((x) => x ** 3), S((x) => x * x), S((x) => x)],
               [S((x) => x * x), S((x) => x), n]];
    const B = [S((x, r) => x * x * r), S((x, r) => x * r), S((x, r) => r)];
    for (let i = 0; i < 3; i++) {
        const p = A[i][i];
        for (let j = i; j < 3; j++) A[i][j] /= p;
        B[i] /= p;
        for (let k = 0; k < 3; k++) { if (k === i) continue; const f = A[k][i]; for (let j = i; j < 3; j++) A[k][j] -= f * A[i][j]; B[k] -= f * B[i]; }
    }
    return { curvature: B[0], slope: m, residuals: res,
             peakToPeak: Math.max(...res) - Math.min(...res), span: times[n - 1] - times[0] };
}

export function defaults({ mode = "residualCurvature" } = {}) {
    return MODES.includes(mode) ? { mode, config: { ...DEF } } : null;
}

export function build({ mode = "residualCurvature", config = {} } = {}) {
    if (!MODES.includes(mode)) throw new Error("pulsar: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const t = pulseArrivalTimes(c.f0, c.fdot, c.nPulses);
    const fit = residualFit(t);

    if (mode === "residualCurvature") {
        const predicted = -c.fdot / (2 * c.f0);            // ONE f0. My first version had two.
        return { curvature: fit.curvature, predicted, ratio: fit.curvature / predicted,
                 error: Math.abs(fit.curvature / predicted - 1),
                 recoveredFdot: -2 * c.f0 * fit.curvature, trueFdot: c.fdot,
                 peakToPeak: fit.peakToPeak, span: fit.span };
    }
    if (mode === "spindownAge") {
        // tau = P / (2 Pdot) = -f / (2 fdot), from quantities RECOVERED from the train rather than the inputs.
        const recoveredFdot = -2 * c.f0 * fit.curvature;
        const P0 = periodAt(0, c.f0, c.fdot);
        return { characteristicAge: -c.f0 / (2 * c.fdot), fromResiduals: -c.f0 / (2 * recoveredFdot),
                 P0, recoveredFdot, trueFdot: c.fdot,
                 agreement: Math.abs((-c.f0 / (2 * recoveredFdot)) / (-c.f0 / (2 * c.fdot)) - 1) };
    }
    // THE NEGATIVE: with NO spin-down the residuals must be flat. Curvature is not a fitting artefact.
    const flat = residualFit(pulseArrivalTimes(c.f0, 0, c.nPulses));
    return { spinningDownPeakToPeak: fit.peakToPeak, steadyPeakToPeak: flat.peakToPeak,
             steadyCurvature: flat.curvature, ratio: fit.peakToPeak / Math.max(flat.peakToPeak, 1e-300) };
}

export const PULSAR_OBSERVABLES = ["curvature", "predicted", "ratio", "error", "recoveredFdot", "trueFdot",
    "peakToPeak", "span", "characteristicAge", "fromResiduals", "P0", "agreement",
    "spinningDownPeakToPeak", "steadyPeakToPeak", "steadyCurvature"];
export const pulsarDevice = { modes: MODES, name: "pulsar-timing-residuals", observables: PULSAR_OBSERVABLES, build, defaults };
export default pulsarDevice;
