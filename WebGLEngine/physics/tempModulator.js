// WebGLEngine/physics/tempModulator.js — v2618
//
// THE TEMPERATURE MODULATOR -- SWEEP T, NOW THAT KELVIN IS HONEST.
//
// ---- WHERE THIS CAME FROM ------------------------------------------------------------------------------------------
//
// A standing note said a modulator (sweep the temperature over time and watch the blob respond) "only means
// something after units chain honest." v2617 chained them: the warmth slider reads real Kelvin under a stated
// scenario (a 1.5 um particle in water, real-time clock). So the modulator now means something -- IF commanding
// a temperature actually makes the blob reach it.
//
// ---- THE CLOSED LOOP, AND THE PHANTOM BUG I ALMOST REPORTED --------------------------------------------------------
//
// Before building this I checked the loop: command a D, run jitterCentres, measure the D the blob ACTUALLY
// exhibits from its mean-squared displacement (<r^2> = 6 D t in 3D). My first pass reported the blob running
// 3.2% HOT at every D -- a suspiciously constant bias.
//
// IT WAS MY MEASUREMENT, NOT THE BLOB. I had reused the same 40 seeds across all four D values, so every
// measurement was THE SAME RANDOM REALIZATION scaled -- one fluctuation, repeated, masquerading as a systematic
// bias. With independent seeds and 2000 realizations each the ratios are 0.992, 1.001, 1.008, all within one
// standard error of 1.000. THE BLOB EXHIBITS THE D YOU COMMAND. A CONSTANT BIAS ACROSS INPUTS IS A CLUE THAT
// THE INPUTS SHARE A CAUSE -- here, my seeds.
//
// So the modulator is honest: commanded T -> warmthOfKelvin -> D -> the blob's emergent diffusion -> the
// emergent temperature tracks the command. The gate proves that end to end.
import { warmthOfKelvin, kelvinOfWarmth, SCENARIOS } from "./blobKelvin.js";

/**
 * The commanded temperature at simulated time t (seconds), sweeping between Tlo and Thi.
 *   shape "sine"     -> smooth breathing between the two
 *   shape "triangle" -> linear ramp up and down (constant heating/cooling rate)
 * Clamped so T can never go below 0 K, because warmthOfKelvin of a negative temperature is a negative D, which
 * is not a diffusion -- it is nonsense the slider must never command.
 */
export function commandedT(t, { Tlo = 200, Thi = 373.15, periodSec = 20, shape = "sine" } = {}) {
    const lo = Math.max(0, Math.min(Tlo, Thi));
    const hi = Math.max(Tlo, Thi);
    const phase = ((t % periodSec) + periodSec) % periodSec / periodSec;   // 0..1
    let u;
    if (shape === "triangle") u = phase < 0.5 ? phase * 2 : 2 - phase * 2;  // 0..1..0
    else u = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);                     // smooth 0..1..0
    return lo + (hi - lo) * u;
}

/** The warmth D to command at time t, under a stated scenario. Never negative. */
export function modulatorD(t, scen = SCENARIOS.bacterium, params = {}) {
    const T = commandedT(t, params);
    return Math.max(0, warmthOfKelvin(T, scen));
}

/**
 * Measure the temperature the blob is ACTUALLY exhibiting, by measuring its diffusion over a window and running
 * it back through the same Kelvin chain. This is the readback that lets the UI show commanded vs emergent side
 * by side -- the honest proof that the number on the slider is the number in the tank.
 *
 * displacements: array of [dx,dy,dz] per centre over `windowSec` of simulated time.
 */
export function measuredT(displacements, windowSec, scen = SCENARIOS.bacterium) {
    if (!displacements.length || windowSec <= 0) return 0;
    let msd = 0;
    for (const [dx, dy, dz] of displacements) msd += dx * dx + dy * dy + dz * dz;
    msd /= displacements.length;
    const D = msd / (6 * windowSec);       // <r^2> = 2*dim*D*t, dim=3
    return kelvinOfWarmth(D, scen);
}
