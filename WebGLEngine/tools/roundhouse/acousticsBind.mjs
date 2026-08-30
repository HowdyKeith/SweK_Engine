// tools/roundhouse/acousticsBind.mjs
//
// v3385 -- THE ACOUSTICS DEVICE. Third and last of the new fields.
//
// MODES:
//   "propagate"  d'Alembert against FDTD, and the magic time step at Courant number 1
//   "stability"  the CFL cliff -- exact at 1.00, divergent at 1.01
//   "doppler"    source-moving against observer-moving, which are NOT the same
//   "modes"      open-open and open-closed pipe harmonics
//
// THE PLANTED ERROR IS THE "SAFE" COURANT NUMBER. Setting C = 0.5 instead of 1 is what a cautious person does,
// it is perfectly stable, it produces a pulse that still looks like a pulse -- and it is FIFTEEN ORDERS OF
// MAGNITUDE less accurate. Nothing warns, nothing diverges, and only comparison against the analytic solution
// shows it.

import {
    gaussianPulse, propagationError, peakAmplitude, courant,
    dopplerMovingSource, dopplerMovingObserver, dopplerAsymmetry,
    modeOpenOpen, modeOpenClosed, phaseVelocity, groupVelocity, omegaOf,
} from "../../physics/acoustics/waves.mjs";
import {
    soundSpeedFluid, soundSpeedSolid, soundSpeedGas, soundSpeedNewton, laplaceCorrection, MEASURED,
} from "../../physics/acoustics/soundSpeed.mjs";
import { vP } from "../../physics/seismic/rays.mjs";

export const ACOUSTIC_OBSERVABLES = [
    "courantNumber", "propagationError", "exactAtMagicStep",
    "peakAtLimit", "peakOverLimit", "cflIsCliff",
    "shiftSource", "shiftObserver", "dopplerAsymmetry", "asymmetryVanishesAtZero",
    "modesOpenOpen", "modesOpenClosed", "oddHarmonicsOnly", "nonDispersive", "planted",
    "cAir", "cWater", "cGranite", "cNewton", "laplaceRatio", "matchesSeismic", "airErrFrac",
];

// v3388 -- DEFAULTS ARE CHOSEN TO BE UNREMARKABLE, NOT ROUND.
//
// v = 0.5 makes dopplerAsymmetry EXACTLY 1/3, which collided with a mass ratio, an eccentricity and a beam
// closed form -- NINE false candidates in the value-match census from one round number. 0.47 says exactly the
// same physics and collides with nothing. L = 1 is kept: a unit pipe length is a scale choice that cancels out
// of the harmonic RATIOS being graded, and changing it would obscure the mode arithmetic for no gain.
const DEF = {
    // v3435 -- DECLARED, NOT ADDED: every key below was ALREADY READ by this bind and ALREADY had this
    // exact fallback. defaults() simply never said so, and strictBuild therefore REJECTED A PARAMETER THAT
    // DEMONSTRABLY WORKS -- blackhole's iscoKm moves 12.40 -> 17.72 when nsMass is set. THE GUARD WAS
    // BLOCKING THE THING IT WAS BUILT TO PROTECT. Declaring costs nothing at run time because the value is
    // the one the code already fell back to; what it buys is that the contract now matches the behaviour.
    T: 293.15,
 C: 1.0, N: 400, steps: 100, v: 0.47, c: 343, L: 1 };

function buildAcoustics({ mode = "propagate", config = {} } = {}) {
    const cfg = { ...DEF, ...config };
    const shape = gaussianPulse(80, 12);
    const blank = {
        courantNumber: null, propagationError: null, exactAtMagicStep: null,
        peakAtLimit: null, peakOverLimit: null, cflIsCliff: null,
        shiftSource: null, shiftObserver: null, dopplerAsymmetry: null, asymmetryVanishesAtZero: null,
        modesOpenOpen: null, modesOpenClosed: null, oddHarmonicsOnly: null, nonDispersive: null,
        planted: !!config.planted,
        cAir: null, cWater: null, cGranite: null, cNewton: null, laplaceRatio: null,
        matchesSeismic: null, airErrFrac: null,
    };

    // v3386 -- WHERE c COMES FROM. The planted error here is NEWTON'S: an isothermal sound speed, which is
    // self-consistent, plausible, and 15% low. Only measurement catches it.
    if (mode === "speed") {
        const T = Number.isFinite(cfg.T) ? cfg.T : 293.15;
        const air = config.planted ? soundSpeedNewton(T) : soundSpeedGas(T);
        const water = soundSpeedFluid(2.2e9, 1000);
        return {
            ...blank,
            cAir: air, cWater: water, cGranite: soundSpeedSolid(5.2e10, 3.1e10, 2700),
            cNewton: soundSpeedNewton(T), laplaceRatio: soundSpeedGas(T) / soundSpeedNewton(T),
            // the cross-field identity: the acoustic fluid speed IS the seismic P speed with no shear
            matchesSeismic: water === vP(2.2e9, 0, 1000),
            airErrFrac: Math.abs(air - MEASURED.airAt20C) / MEASURED.airAt20C,
        };
    }
    if (mode === "stability") {
        const at = peakAmplitude(shape, 200, 1.00, 300), over = peakAmplitude(shape, 200, 1.01, 300);
        return { ...blank, peakAtLimit: at, peakOverLimit: over, cflIsCliff: over > at * 1e10 };
    }
    if (mode === "doppler") {
        return {
            ...blank,
            shiftSource: dopplerMovingSource(1, cfg.v, 1),
            shiftObserver: dopplerMovingObserver(1, cfg.v, 1),
            dopplerAsymmetry: dopplerAsymmetry(cfg.v, 1),
            asymmetryVanishesAtZero: Math.abs(dopplerAsymmetry(1e-6, 1)) < 1e-11,
        };
    }
    if (mode === "modes") {
        const oo = [1, 2, 3].map((n) => modeOpenOpen(n, cfg.c, cfg.L));
        const oc = [1, 2, 3].map((n) => modeOpenClosed(n, cfg.c, cfg.L));
        return {
            ...blank, modesOpenOpen: oo, modesOpenClosed: oc,
            oddHarmonicsOnly: [1, 2, 3].every((n) => Math.abs(oc[n - 1] / oc[0] - (2 * n - 1)) < 1e-12),
            nonDispersive: [0.1, 1, 10, 1000].every((k) => Math.abs(phaseVelocity(omegaOf(cfg.c, k), k) - groupVelocity(cfg.c)) < 1e-9),
        };
    }

    // the planted error is the CAUTIOUS choice: a stable, plausible, far less accurate Courant number
    const C = config.planted ? 0.5 : cfg.C;
    const err = propagationError(shape, cfg.N, C, cfg.steps);
    return {
        ...blank,
        courantNumber: C, propagationError: err, exactAtMagicStep: err < 1e-15,
    };
}

export const acousticsDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // *** v4088 -- NAMED, THE SAME COMPLETION v3851 GAVE born/chaos/box3d. *** This device carries TWO plants
    // behind the SAME config.planted flag -- propagate's Courant number (1 -> 0.5) and speed's sound-speed law
    // (real gas -> Newton's isothermal) -- and neither was ever named as data, only in prose. `propagate` is
    // the primary: it is modes[0] and the header's headline finding. MEASURED, both arms:
    //   propagationError   5.26e-21 -> 3.63e-3   (the "fifteen orders of magnitude" the header quotes)
    //   airErrFrac         1.02e-4 -> 1.55e-1    (speed mode's Newton plant, ~15% low, reported separately)
    planted: { knob: "planted", observable: "propagationError",
               note: "Courant number 1 (exact at the magic time step) vs the 'safe' 0.5 -- stable, plausible, and 15 orders of magnitude less accurate. A second plant on the same flag lives in `speed` mode (Newton's isothermal sound speed vs the real adiabatic one, airErrFrac 1.02e-4 -> 1.55e-1) and is not this declaration's target." },
    modes: ["propagate", "stability", "doppler", "modes", "speed"],
    name: "acoustic-waves", observables: ACOUSTIC_OBSERVABLES, build: buildAcoustics,
    defaults: ({ mode } = {}) => ({ mode: mode || "propagate", config: { ...DEF } }),
};
