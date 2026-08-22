// WebGLEngine/tools/roundhouse/centrifugeBind.mjs -- v3423
// ---------------------------------------------------------------------------------------------------------------
// THE CENTRIFUGE AS A LAB DEVICE, GRADED ON THE TRAJECTORY ITS OWN GATE NEVER INTEGRATES.
//
// The module's gate already claims the INSTANTANEOUS law and the SCALINGS OF s: that the mixture bands in order
// of sedimentation coefficient, that s goes as a^2 and linearly with excess density, that the terminal radial
// speed reads s*omega^2*r to machine precision, that a neutrally buoyant particle holds still, that a faster
// spin separates faster, and that the whole thing is deterministic. *** ALL OF THAT IS ONE STEP AT A TIME. THE
// SOLUTION OF dr/dt = s omega^2 r IS r(t) = r0 exp(s omega^2 t), AND NOTHING ANYWHERE CHECKS THE INTEGRAL. ***
// So every key here is a fact about the path rather than the step.
//
// *** THE SHARPEST ONE SPLITS TWO CLAIMS THAT ARE USUALLY CONFLATED. *** Forward Euler turns dr/dt = k r into
// r_{n+1} = r_n (1 + k dt), whose EXACT growth rate is ln(1 + k dt)/dt -- not k. So the trajectory has two
// different right answers: it must reproduce THE DISCRETE MAP'S rate to machine precision (does the stepper do
// what it says), and that rate must converge on THE CONTINUOUS k as dt shrinks (does the stepper approximate the
// physics). MEASURED: the relative gap to k falls 3.334e-7 -> 8.296e-8 -> 2.080e-8 as dt is quartered, which is
// FIRST ORDER, and it is what forward Euler claims. A single check against k alone would have called the exact
// discrete answer an error, and a single check against ln(1+k dt)/dt alone would pass an integrator that never
// converged on anything.
//
// THE PLANT IS THE PLAUSIBLE WRONG DERIVATION AGAIN: evaluate the centrifugal field at a FIXED radius instead of
// the particle's own -- which is what you get by reasoning from gravitational settling, where the field really is
// uniform. The motion becomes LINEAR instead of exponential. Over a short run the two are nearly the same curve;
// over a decade of growth the log-fit's r2 falls from 1.0000000000 to 0.9610, and the doubling time stops being
// a property of the fluid and becomes proportional to where you started: 0.050 / 0.501 / 5.001 for r0 =
// 0.001 / 0.01 / 0.1. *** A CENTRIFUGE WHOSE DOUBLING TIME DEPENDS ON WHERE THE PARTICLE STARTED IS NOT
// SEPARATING BY SEDIMENTATION COEFFICIENT AT ALL, AND EVERY SINGLE-STEP CHECK IN THE MODULE'S GATE PASSES ON IT.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { sedCoeff, centrifugeStep, radialSpeed, bandR } from "../../physics/centrifuge.js";

export const CF_MODES = ["rate", "order", "doubling", "neutral", "bands"];

const DEF = { a: 1e-3, rho: 1.2, rhoF: 1, eta: 1, omega: 3000, r0: 0.01, dt: 1e-3, steps: 2000, refR: 0.05 };

export const CF_OBSERVABLES = [
    "sedCoefficient", "rateContinuous", "rateDiscreteExact", "rateRecovered", "logFitR2",
    "recoveredVsDiscrete", "recoveredVsContinuous",
    "orderMeasured", "orderTheory", "errRatios", "dtCoarse",
    "doublingTimes", "doublingSpread", "doublingTheory",
    "neutralDensityRecovered", "neutralDensityConfigured", "neutralRelErr", "driftAtNeutral",
    "bandOrderCorrect", "bands", "planted",
];

function fit(xs, ys) {
    const n = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0), sxx = xs.reduce((a, x) => a + x * x, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - slope * sx) / n;
    const my = sy / n;
    let ss = 0, st = 0;
    for (let i = 0; i < n; i++) { const p = slope * xs[i] + b; ss += (ys[i] - p) ** 2; st += (ys[i] - my) ** 2; }
    return { slope, r2: st === 0 ? 1 : 1 - ss / st };
}

/** One step, real or planted. The plant reads the field at a FIXED radius -- the gravitational-settling slip. */
function stepper(c) {
    const opt = { omega: c.omega, rhoF: c.rhoF, eta: c.eta, rMax: 1e9 };
    if (!c.planted) return (parts, dt) => centrifugeStep(parts, { ...opt, dt });
    const w2 = c.omega * c.omega;
    return (parts, dt) => {
        for (const p of parts) p.r += sedCoeff(p.a, p.rho, c.rhoF, c.eta) * w2 * c.refR * dt;
        return parts;
    };
}

/** Run one particle and regress log r against t -- the whole path, not the step. */
function trajectory(c, dt, steps, r0) {
    const step = stepper(c), parts = [{ a: c.a, rho: c.rho, r: r0, species: "x" }];
    const ts = [], ys = [];
    for (let i = 0; i < steps; i++) { step(parts, dt); ts.push((i + 1) * dt); ys.push(Math.log(parts[0].r)); }
    return { ...fit(ts, ys), rFinal: parts[0].r };
}

export function defaults({ mode = "rate", config = {} } = {}) {
    if (!CF_MODES.includes(mode)) return null;   // a refusal, not a silent substitution
    return { mode, config: { ...DEF, ...config } };
}

export function build({ mode = "rate", config = {} } = {}) {
    if (!CF_MODES.includes(mode)) throw new Error("centrifuge: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const s = sedCoeff(c.a, c.rho, c.rhoF, c.eta);
    const k = s * c.omega * c.omega;              // the continuous growth rate
    const blank = { planted: !!c.planted };

    if (mode === "rate") {
        // TWO RIGHT ANSWERS, KEPT APART. The discrete map's exact rate is ln(1 + k dt)/dt; the continuous law's
        // is k. The trajectory must match the first to machine precision and the second only to O(dt).
        const t = trajectory(c, c.dt, c.steps, c.r0);
        const discrete = Math.log(1 + k * c.dt) / c.dt;
        return {
            ...blank,
            sedCoefficient: s, rateContinuous: k, rateDiscreteExact: discrete,
            rateRecovered: t.slope, logFitR2: t.r2,
            recoveredVsDiscrete: Math.abs(t.slope - discrete) / discrete,
            recoveredVsContinuous: Math.abs(t.slope - k) / k,
        };
    }

    if (mode === "order") {
        // *** THE ORDER IS THE KEY AND IT IS FORWARD EULER'S OWN CLAIM. *** Quarter dt, quarter the gap to k.
        const dts = [c.dt * 16, c.dt * 4, c.dt];
        const errs = dts.map((dt) => Math.abs(trajectory(c, dt, Math.round(c.steps * c.dt / dt), c.r0).slope - k) / k);
        const ratios = errs.slice(1).map((e, i) => errs[i] / e);
        // order p from err ~ dt^p over a 4x refinement: p = log4(ratio)
        const orders = ratios.map((r) => Math.log(r) / Math.log(4));
        return {
            ...blank,
            orderMeasured: orders[orders.length - 1], orderTheory: 1, errRatios: ratios, dtCoarse: dts[0],
            rateContinuous: k,
        };
    }

    if (mode === "doubling") {
        // *** EXPONENTIAL GROWTH HAS A DOUBLING TIME THAT DOES NOT KNOW WHERE IT STARTED. *** That invariance is
        // what separation BY SEDIMENTATION COEFFICIENT means, and it is exactly what the uniform-field plant
        // destroys: the planted doubling time is proportional to r0.
        const step = stepper(c);
        const times = [c.r0 * 0.1, c.r0, c.r0 * 10].map((r0) => {
            const parts = [{ a: c.a, rho: c.rho, r: r0, species: "x" }];
            let n = 0;
            while (parts[0].r < 2 * r0 && n < 2e6) { step(parts, c.dt); n++; }
            return n * c.dt;
        });
        const spread = (Math.max(...times) - Math.min(...times)) / Math.max(...times);
        return { ...blank, doublingTimes: times, doublingSpread: spread, doublingTheory: Math.log(2) / k, rateContinuous: k };
    }

    if (mode === "neutral") {
        // THE KEY IS A BIFURCATION, RECOVERED FROM BEHAVIOUR: bisect the particle density on WHICH WAY IT MOVES.
        // Nothing here reads rhoF -- the sign of one step is the only input -- so the recovered value is an
        // external key rather than a mirror (v3201: the measuring route is independent of the setting route).
        const step = stepper(c);
        let lo = c.rhoF * 0.5, hi = c.rhoF * 1.5;
        for (let i = 0; i < 80; i++) {
            const mid = (lo + hi) / 2;
            const parts = [{ a: c.a, rho: mid, r: c.r0, species: "x" }];
            const before = parts[0].r;
            step(parts, 1);
            if (parts[0].r > before) hi = mid; else lo = mid;
        }
        const recovered = (lo + hi) / 2;
        const neutral = [{ a: c.a, rho: c.rhoF, r: c.r0, species: "x" }];
        step(neutral, 1);
        return {
            ...blank,
            neutralDensityRecovered: recovered, neutralDensityConfigured: c.rhoF,
            neutralRelErr: Math.abs(recovered - c.rhoF) / c.rhoF,
            driftAtNeutral: Math.abs(neutral[0].r - c.r0),
        };
    }

    // bands -- REPORTED. The module's own gate already claims the banding order, so grading it here would be a
    // second copy of somebody else's check. It is carried because a device that separates and cannot show the
    // separation is missing the thing the machine is for.
    const step = stepper(c);
    const parts = [
        { a: 2e-3, rho: 1.4, r: c.r0, species: "heavy" },
        { a: 1e-3, rho: 1.2, r: c.r0, species: "medium" },
        { a: 5e-4, rho: 1.05, r: c.r0, species: "light" },
    ];
    for (let i = 0; i < c.steps; i++) step(parts, c.dt);
    const bands = ["heavy", "medium", "light"].map((sp) => bandR(parts, sp));
    return { ...blank, bands, bandOrderCorrect: bands[0] > bands[1] && bands[1] > bands[2] };
}

export const centrifugeDevice = {
    // KNOB PLANT: `planted` replaces the FIELD LAW (omega^2 r -> omega^2 refR), so the whole path from the wrong
    // derivation to every reported number is graded. Not a nudged constant.
    plantKind: "knob",
    modes: CF_MODES, name: "centrifuge-sedimentation",
    observables: CF_OBSERVABLES, build, defaults,
};
export default centrifugeDevice;
