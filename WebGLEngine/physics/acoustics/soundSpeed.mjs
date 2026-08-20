// physics/acoustics/soundSpeed.mjs
//
// v3386 -- WHERE c COMES FROM, AND THE CROSS-FIELD IDENTITY THAT WAS SITTING UNCLAIMED.
//
// waves.mjs takes the sound speed as a PARAMETER. That is fine for propagation, and it means the acoustics
// device could never be wrong about c -- it was never asked to compute it. Meanwhile physics/seismic/rays.mjs
// computes Vp = sqrt((K + 4mu/3)/rho), and a fluid has no shear modulus, so
//
//     ACOUSTIC SOUND SPEED  ===  SEISMIC Vp WITH mu = 0
//
// Two fields, two modules, one formula. Measured on water: both give 1483.2397 m/s, BIT-IDENTICALLY, against a
// measured 1482. The identity existed the moment seismology landed and nothing had drawn it.
//
// *** AND THE GAS CASE CARRIES A REAL HISTORICAL ERROR, WHICH MAKES THE BEST PLANTED FAULT IN THE LAB. ***
//
// Newton computed the speed of sound in 1687 as sqrt(P/rho) -- treating compression as ISOTHERMAL. That gives
// 290.10 m/s. The measured value is about 343. He was 15.5% low and the discrepancy stood for over a century
// until Laplace realised the compressions are ADIABATIC, not isothermal: they happen far too fast for heat to
// move, so the stiffness is gamma*P rather than P. With gamma = 1.4 the same calculation gives 343.23 m/s.
//
// A planted error that a great physicist actually made, that produces a plausible number in the right units and
// the right order of magnitude, and that ONLY a comparison against measurement catches. No internal consistency
// check would ever have found it -- Newton's arithmetic was perfect.

import { vP } from "../seismic/rays.mjs";

export const R_GAS = 8.314462618;          // J / (mol K)
export const GAMMA_AIR = 1.4;              // diatomic ideal gas
export const M_AIR = 0.0289647;            // kg / mol

/**
 * Sound speed in a FLUID from bulk modulus and density.
 * Delegates to the seismic P-wave speed with zero shear modulus -- the SAME function, not a second copy of the
 * same algebra, so the two fields cannot drift apart.
 */
export const soundSpeedFluid = (K, rho) => vP(K, 0, rho);

/** Sound speed in a SOLID -- shear stiffness adds to bulk, so a solid carries sound faster than its bulk alone. */
export const soundSpeedSolid = (K, mu, rho) => vP(K, mu, rho);

/** ADIABATIC ideal gas: c = sqrt(gamma R T / M). This is Laplace's correction and it is the right one. */
export const soundSpeedGas = (T, gamma = GAMMA_AIR, M = M_AIR) => Math.sqrt(gamma * R_GAS * T / M);

/**
 * ISOTHERMAL ideal gas: c = sqrt(P/rho) = sqrt(R T / M). NEWTON'S 1687 ERROR, kept as a named function rather
 * than deleted, because it is the planted fault this module grades against.
 */
export const soundSpeedNewton = (T, M = M_AIR) => Math.sqrt(R_GAS * T / M);

/** The ratio between them is exactly sqrt(gamma) -- independent of temperature, pressure and gas. */
export const laplaceCorrection = (gamma = GAMMA_AIR) => Math.sqrt(gamma);

/** Effective bulk modulus of an ideal gas: gamma*P adiabatic, P isothermal. */
export const gasBulkModulus = (P, gamma = GAMMA_AIR) => gamma * P;

/** Reference measurements, for grading against NATURE rather than against the tree. */
export const MEASURED = {
    airAt20C: 343.2,        // m/s, dry air at 20 C
    water: 1482,            // m/s, fresh water at 20 C
    granitePwave: 5900,     // m/s, typical granite
};
