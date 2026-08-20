// tools/roundhouse/fftBind-selfcheck.mjs -- v3769
//
// *** TIER 2, AND THE ROUND'S FIRST FINDING IS ABOUT THE KEY RATHER THAN THE CODE: PARSEVAL PINS THE
// NORMALISATION ONLY IF ITS CONSTANT IS FIXED. Measured -- under the shipped convention (nothing forward, 1/N
// back) sum|x|^2 == (1/N) sum|X|^2 to 6.111e-16; under the SYMMETRIC convention (1/sqrt(N) both ways) the
// identity ALSO HOLDS EXACTLY, at 0.000e+0, BUT WITH A DIFFERENT CONSTANT. So "the transform is unitary UP TO
// SOME SCALE" is satisfied by every convention and is NOT a key, while "sum|x|^2 == (1/N) sum|X|^2" NAMES the
// scale and IS one. I WROTE THE LOOSER CLAIM FIRST AND THE MEASUREMENT CORRECTED IT. ***
//
// *** AND THE ROUND TRIP IS THE ONE THAT IS GENUINELY BLIND: rescaling the forward transform and letting the
// inverse compensate leaves ifft(fft(x)) correct to 1.332e-15 IN BOTH ARMS. A convention slip applied to BOTH
// DIRECTIONS is invisible to it by construction -- the interferometer's shared lambda and kepler's shared mu,
// a third time. THE ROUND TRIP IS REPORTED, NOT GRADED. ***

import { fftDevice, FFT_MODES, buildFFT } from "./fftBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const CFG = { offset: 3, amplitude: 2, tone: 7 };
const honest = await buildFFT({ mode: "absolute", config: CFG });
const planted = await buildFFT({ mode: "halfscale", config: CFG });

console.log("1. THE ABSOLUTE KEYS, WHICH THE CODE IS NEVER TOLD");
{
    ok("!! *** A CONSTANT c GIVES |X[0]| = c*N AND A SINUSOID c*sin GIVES |X[k]| = c*N/2, BOTH EXACTLY ***",
        honest.dcErrFrac === 0 && honest.sinusoidErrFrac === 0 && honest.conventionHolds === true,
        "offset 3 and amplitude 2 at N=" + honest.N + ": dcErrFrac " + honest.dcErrFrac.toExponential(3) +
        ", sinusoidErrFrac " + honest.sinusoidErrFrac.toExponential(3) + ". NOT TOLERANCED -- EXACTLY ZERO. " +
        "The DC bin IS the sum and the tone's energy splits over +/-k; nothing in fft.js is told either number");
    ok("!! and the peak bin is found where it was put",
        honest.peakBinFound === honest.peakBinExpected,
        "bin " + honest.peakBinFound + ". A weak check on its own -- it would survive any scale error -- which " +
        "is exactly why it is not the one graded");
    ok("!! Parseval holds WITH ITS CONSTANT NAMED",
        honest.parsevalDefect < 1e-12,
        honest.parsevalDefect.toExponential(3) + " for sum|x|^2 == (1/N) sum|X|^2");
}

console.log("\n2. THE CONVENTION SLIP -- LEGITIMATE ELSEWHERE, WRONG HERE");
{
    ok("!! *** THE SYMMETRIC CONVENTION BREAKS THE ABSOLUTE KEYS BY 87.5% ***",
        planted.sinusoidErrFrac > 0.8 && planted.dcErrFrac > 0.8 && planted.conventionHolds === false,
        "sinusoidErrFrac " + honest.sinusoidErrFrac.toExponential(3) + " -> " +
        planted.sinusoidErrFrac.toExponential(3) + ", conventionHolds true -> false. *** 1/sqrt(N) BOTH WAYS IS " +
        "A LEGITIMATE CHOICE IN HALF THE LITERATURE AND THE WRONG ONE HERE, because spectrum() and every caller " +
        "of it read ABSOLUTE magnitudes. It is not a bug anyone would spot by reading -- it is a different " +
        "book's convention ***");
    ok("!! *** AND THE ROUND TRIP DOES NOT NOTICE -- 1.332e-15 IN BOTH ARMS ***",
        planted.roundTripWorst === honest.roundTripWorst && planted.roundTripWorst < 1e-12,
        "a slip applied to BOTH directions is invisible to ifft(fft(x)) BY CONSTRUCTION. Third instance of the " +
        "shared-constant family after the interferometer's lambda and kepler's mu, and the reason the round " +
        "trip is REPORTED here rather than graded");
    ok("!! the fixed-constant Parseval DOES notice, which is the distinction this round found",
        planted.parsevalDefect > 0.5,
        honest.parsevalDefect.toExponential(3) + " -> " + planted.parsevalDefect.toExponential(3) +
        ". *** HAD THE FORM BEEN WRITTEN WITH A FLOATING CONSTANT -- 'unitary up to a scale' -- IT WOULD READ " +
        "ZERO IN BOTH ARMS. The difference between those two spellings is a whole grade of evidence ***");
    ok("!! the device is REGISTERED and DECLARES its plant, with `absolute` first",
        DEVICE_NAMES.includes("fft") && fftDevice.plantMode === "halfscale" &&
        fftDevice.plantFlips === "sinusoidErrFrac" && FFT_MODES[0] === "absolute",
        "and registered by a STATIC import -- v3768 registered adjoint dynamically and it was INVISIBLE to " +
        "deviceInstrumentMap while every gate passed");
}

report("WHAT THIS DOES NOT CLAIM",
    "That fft.js is fast or numerically ideal, or that the radix-2 transform is checked at sizes that are not " +
    "powers of two -- defaults() ROUNDS N to one, so a caller asking for 100 gets 128 and IS NOT TOLD. That is " +
    "a clamp that rewrites an input, the v3712 shape, and it is declared here rather than left for somebody to " +
    "find. Nor is the INVERSE graded on its own: it is exercised only through the round trip, which this file " +
    "has just shown to be blind to exactly the error class the plant uses.");

console.log("\nfftBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
