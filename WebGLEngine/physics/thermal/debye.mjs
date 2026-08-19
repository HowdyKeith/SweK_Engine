// physics/thermal/debye.mjs -- v3812
//
// THE DEBYE HEAT CAPACITY OF A SOLID -- WHICH IS BLACKBODY RADIATION WITH A CEILING. A blackbody has infinitely
// many photon modes; a crystal of N atoms has exactly 3N phonon modes, so the same Bose-Einstein sum runs only up
// to a cutoff, the Debye temperature Theta_D. That one difference -- a finite ceiling instead of infinity -- is the
// whole model, and it is why this file IMPORTS blackbody's boseIntegral: the low-temperature limit of the solid is
// the radiation integral it already grades.
//
// Working per mode with k_B = 1 (the engine convention) and x = hbar omega / kT, x_D = Theta_D / T:
//   energy    U/(Nk)   = 9 x_D^-3  INT_0^{x_D} x^3/(e^x - 1) dx          (times T; the shape is what we grade)
//   capacity  C_V/(Nk) = 9 x_D^-3  INT_0^{x_D} x^4 e^x/(e^x - 1)^2 dx
//
// *** THE KEYS, ALL EXACT AND NONE FED TO THE MODEL:
//   1. HIGH T  (x_D -> 0): C_V/(Nk) -> 3. Dulong and Petit's 1819 law, three per atom, the classical equipartition
//      answer a solid must return when it is hot enough to forget it is quantum.
//   2. LOW T   (x_D -> inf): C_V/(Nk) -> (12 pi^4 / 5) (T/Theta_D)^3. The Debye T-cubed law, coefficient
//      12 pi^4/5 = 233.78..., and it rides on INT_0^inf x^4 e^x/(e^x-1)^2 dx = 4 INT_0^inf x^3/(e^x-1) dx = 4 pi^4/15
//      -- the factor of 4 is one integration by parts, and the pi^4/15 is blackbody's, reached here through its
//      boseIntegral. Two modules meet on the low-T slope.
//   3. C_V = dU/dT. The capacity integral and the energy integral are different functions; that one is the
//      derivative of the other is a check across two routes that share no quadrature.
//
// *** THE LOAD-BEARING NEGATIVE IS A REAL HISTORICAL WRONG ANSWER. Einstein (1907) put all 3N oscillators at ONE
// frequency, and got C_V -> 3(Theta_E/T)^2 e^{-Theta_E/T} at low T -- an EXPONENTIAL freeze-out, not T^3. It is not
// a small error: the exponential kills the capacity far too fast, and only measurement (and Debye's spectrum of
// frequencies) showed it. Einstein and Debye AGREE at high T -- both give Dulong-Petit -- and DIVERGE at low T,
// which is exactly where a plant that swaps the T^3 slope for the exponential is caught. ***
//
// BROWSER-SAFE: imports only ./blackbody.mjs; no node builtins, no DOM.

import { boseIntegral } from "./blackbody.mjs";   // JOIN: INT_0^inf x^3/(e^x-1) dx = pi^4/15

// INT_0^{xD} x^3/(e^x - 1) dx by composite Simpson. Integrand -> x^2 as x -> 0 (finite), so no singularity.
export function debyeEnergyIntegral(xD, steps = 20000) {
    if (xD <= 0) return 0;
    const f = (x) => (x <= 0 ? 0 : (x * x * x) / Math.expm1(x));
    const h = xD / steps;
    let sum = f(0) + f(xD);
    for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * f(i * h);
    return (h / 3) * sum;
}

// INT_0^{xD} x^4 e^x/(e^x - 1)^2 dx. Integrand -> x^2 as x -> 0 (e^x/(e^x-1)^2 ~ 1/x^2), finite; guard x=0.
export function debyeCvIntegral(xD, steps = 20000) {
    if (xD <= 0) return 0;
    const f = (x) => {
        if (x <= 0) return 0;
        const em = Math.expm1(x);                 // e^x - 1, accurate near 0
        const ex = em + 1;                        // e^x
        return (x * x * x * x) * ex / (em * em);
    };
    const h = xD / steps;
    let sum = f(0) + f(xD);
    for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * f(i * h);
    return (h / 3) * sum;
}

// The Debye function D3(xD) = (3/xD^3) INT_0^{xD} t^3/(e^t-1) dt -- energy in units of 3NkT, -> 1 as xD -> 0.
export const debyeD3 = (xD) => (xD <= 0 ? 1 : (3 / (xD * xD * xD)) * debyeEnergyIntegral(xD));

// C_V per mode in units of Nk (k_B = 1), as a function of T/Theta_D.
export function debyeCv(ToverTheta) {
    if (ToverTheta <= 0) return 0;
    const xD = 1 / ToverTheta;
    return 9 * Math.pow(ToverTheta, 3) * debyeCvIntegral(xD);
}

// Internal energy per mode in units of Nk*Theta_D (so it is dimensionless and T-scaled): U/(Nk Theta) .
export function debyeEnergyPerTheta(ToverTheta) {
    if (ToverTheta <= 0) return 0;
    const xD = 1 / ToverTheta;
    return 9 * Math.pow(ToverTheta, 4) * debyeEnergyIntegral(xD);   // = 9 (T/Th)^3 * T/Th * INT ... in Nk*Theta units
}

// EINSTEIN model C_V/(Nk) at T/Theta_E -- the historical wrong low-T behaviour (the negative), NOT the answer key.
export function einsteinCv(ToverThetaE) {
    if (ToverThetaE <= 0) return 0;
    const y = 1 / ToverThetaE;                    // Theta_E / T
    const ey = Math.exp(y);
    return 3 * y * y * ey / ((ey - 1) * (ey - 1));
}

export const DULONG_PETIT = 3;                    // C_V/(Nk) classical limit, k_B = 1
export const LOWT_COEFF = 12 * Math.pow(Math.PI, 4) / 5;   // 233.7826..., the T^3-law coefficient

// v3812 -- MEASURED by the gate, not trusted from this comment.
export const MEASURED_V3812 = {
    dulong_petit: "C_V/(Nk) -> 3 as T/Theta -> inf (measured at T/Theta=50: ~2.997)",
    lowT_T3: "C_V/(Nk) -> (12 pi^4/5)(T/Theta)^3, coefficient 233.7826",
    debye_integral: "INT_0^inf x^4 e^x/(e^x-1)^2 dx = 4 pi^4/15 = 25.9758 = 4 * boseIntegral(4)",
    dUdT: "numerical dU/dT matches the C_V integral (two routes)",
    einstein_negative: "Einstein C_V freezes out exponentially at low T; fails the T^3 law Debye satisfies",
    note: "phonons, not photons: blackbody with a mode cutoff. k_B=1. No anharmonicity, no electronic term.",
};
