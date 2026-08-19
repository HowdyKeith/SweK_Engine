// WebGLEngine/physics/blobKelvin.js — v2617
//
// THE WARMTH SLIDER IN KELVIN -- AND WHY "PICK A VISCOSITY" WAS NOT ENOUGH.
//
// ---- WHERE THIS CAME FROM ------------------------------------------------------------------------------------------
//
// The warmth slider drives D, the diffusion coefficient (v2596 measured D=0.01141 for the aquarium). A standing
// plan said: to show a real temperature, use Stokes-Einstein D = kT/(6 pi eta r); we have r, we lack the
// viscosity eta, so PICK ONE and Kelvin becomes real.
//
// THAT PLAN WAS INCOMPLETE, AND THE INCOMPLETENESS IS THE WHOLE POINT.
//
// D is measured in SIM units: [sim-length^2 / sim-time]. Stokes-Einstein is SI. To use it I must convert:
//
//     D_SI = D_sim * L^2 / tau        L  = metres per sim length unit
//     r_SI = r_sim * L                tau = seconds per sim time unit
//
// Substituting: T = 6 pi eta r_sim D_sim * L^3 / (tau k). SO T DEPENDS ON L^3 / tau. Picking eta alone leaves
// BOTH the length scale and the time scale free, and T then ranges over ORDERS OF MAGNITUDE:
//
//     eta=1e-3, r_sim=0.5, D_sim=0.01141, and:
//        L=2e-5, tau=1   -> 6.2e4 K
//        L=2e-5, tau=10  -> 6.2e3 K      (10x slower clock, 10x cooler)
//        L=4e-5, tau=1   -> 5.0e5 K      (2x bigger particle, 8x hotter -- L^3)
//
// SAME VISCOSITY, SAME RADIUS, SAME DIFFUSION, AND THE TEMPERATURE IS ANYTHING YOU LIKE. You cannot get a
// number in Kelvin out of a diffusion coefficient without committing to a length scale AND a time scale for the
// whole simulation. This module makes that commitment EXPLICIT and refuses to hide it.
//
// ---- THE NATURAL COMMITMENT RUNS THE AQUARIUM AT 60,000 K ----------------------------------------------------------
//
// The obvious identification -- the blob is a ~10 um cell, the sim clock is real time -- puts the whole slider
// (D = 0 .. 0.02) at 0 .. ~1.1e5 K, with ROOM TEMPERATURE AT 0.27% OF TRAVEL, pinned to the bottom. Under that
// reading the aquarium is not at any physical temperature; it is STYLISED WARMTH running tens of thousands of
// kelvin hot. That is not a bug to fix -- it is what the sim IS -- but a slider labelled "Kelvin" that reads
// 60,000 K would be a lie dressed as a measurement.
//
// ---- THE HONEST PHYSICAL COMMITMENT --------------------------------------------------------------------------------
//
// To make the slider span a physical range you rescale ONE knob. Shrinking the particle to a ~1.5 um radius
// (a small bacterium), sim clock = real time, gives a slider that reads:
//
//     D = 0        -> 0 K (rest)
//     D = 0.01141  -> 213 K   (the measured warmth: a cold day)
//     293 K        -> D = 0.0157 = 79% of travel (room temperature, usable middle)
//     D = 0.02     -> 373 K   (boiling, slider max)
//
// THAT is a real Kelvin slider. It is real BECAUSE the scenario is stated, not because a viscosity was guessed.
// Every SCENARIO below names its length scale, time scale, viscosity, and what the blob is being MODELLED as.
export const K_BOLTZMANN = 1.380649e-23;   // J/K, exact (SI 2019)
export const ETA_WATER_20C = 1.0016e-3;    // Pa*s

// ---- pure Stokes-Einstein, both directions, strict SI --------------------------------------------------------------
/** D (m^2/s) from temperature. */
export function stokesEinsteinD(T_kelvin, eta, r_metres, dragK = STICK_DRAG) {
    return (K_BOLTZMANN * T_kelvin) / (dragK * Math.PI * eta * r_metres);
}
/** Temperature (K) from D. The inverse; they must round-trip. */
export function stokesEinsteinT(D_si, eta, r_metres, dragK = STICK_DRAG) {
    return (D_si * dragK * Math.PI * eta * r_metres) / K_BOLTZMANN;
}

// *** v3714 -- THE DRAG COEFFICIENT IS NAMED BECAUSE IT IS A CHOICE, NOT A CONSTANT. Stokes drag on a sphere is
// 6*pi*eta*r under a STICK (no-slip) boundary condition and 4*pi*eta*r under a SLIP one. Both are real physics;
// STICK is right for a particle in water and is what every number in this file was calibrated against. A
// scenario may override it with `dragK`, which is where the planted error lives -- see blobKelvinBind. ***
export const STICK_DRAG = 6;
export const SLIP_DRAG = 4;

/**
 * A stated scenario. NOTHING here is discovered -- it is all CHOSEN, and named so it cannot masquerade as fact.
 *   L    metres per sim length unit
 *   tau  seconds per sim time unit
 *   eta  Pa*s
 *   models  the honest sentence: what is the blob being treated as?
 */
export const SCENARIOS = {
    // The physical one -- the default, because a slider that reads real temperatures should read them honestly.
    bacterium: {
        name: "1.5 um particle in water, real-time clock",
        L: 3.010628e-6, tau: 1, eta: ETA_WATER_20C, r_sim: 0.5,   // calibrated so D=0.02 -> 373.15 K exactly
        models: "the blob as a ~1.5 um radius particle (a small bacterium) diffusing in water, with the sim clock running at real time. Slider spans 0 K to boiling; room temperature sits at 79% of travel.",
    },
    // The stylised one -- kept so the gate can prove the natural identification runs hot.
    cell_realtime: {
        name: "10 um cell, real-time clock (STYLISED -- runs ~1e5 K hot)",
        L: 2.0e-5, tau: 1, eta: ETA_WATER_20C, r_sim: 0.5,
        models: "the blob as a ~10 um cell with a real-time clock. This is the OBVIOUS identification and it puts the slider at 0..1.1e5 K -- the aquarium is stylised warmth, not physical temperature, under this reading.",
    },
};

/** Full chain: warmth D_sim -> Kelvin, under a stated scenario. */
export function kelvinOfWarmth(D_sim, scen) {
    const D_si = D_sim * scen.L ** 2 / scen.tau;
    return stokesEinsteinT(D_si, scen.eta, scen.r_sim * scen.L, scen.dragK ?? STICK_DRAG);
}
/** Inverse: what warmth D_sim yields temperature T, under a stated scenario. */
export function warmthOfKelvin(T_kelvin, scen) {
    const D_si = stokesEinsteinD(T_kelvin, scen.eta, scen.r_sim * scen.L, scen.dragK ?? STICK_DRAG);
    return D_si * scen.tau / scen.L ** 2;
}
