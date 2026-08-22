// WebGLEngine/simulation/ferroThermal.js — v2558
//
// CAN WE BAKE IT? IN A SUN? DOES IT HAVE TO DIE?
//
// No. And the reason is the best thing in this corner of physics.
//
// ---- WHAT HEAT DOES TO A FERROFLUID ---------------------------------------------------------------------------
//
// Web-verified (Elveflow / MAMI, "Magnetic fluids and microfluidics: a short review"): "As the temperature
// exceeds the Curie temperature the magnetic moments become randomly oriented and the ferrofluid LOSES ITS NET
// MAGNETIZATION. An applied thermal gradient thus results in a NON-UNIFORM MAGNETIZATION and the ferrofluid will
// experience a body force, THE KELVIN BODY FORCE, inducing a fluid flow along the thermal gradient. THIS
// THERMOMAGNETIC CONVECTION CAN DRIVE THE FERROFLUID WITHOUT A PUMP."
//
// And the mechanism, from Love et al.'s magnetocaloric pump (same review): a plug of ferrofluid is attracted into
// a magnet, HEATS UP, ITS MAGNETIC ATTRACTION WEAKENS, and COOLER FLUID IS ATTRACTED IN AND DISPLACES IT. The
// displaced plug cools, becomes magnetic again, and is pulled back. A HEAT ENGINE WITH NO MOVING PARTS.
//
// SO THE BLOB DOES NOT DIE OF HEAT. IT DIES OF *UNIFORM* HEAT. Bake it evenly and the gradient vanishes, the
// Kelvin force vanishes, and it stops. Bake it on ONE SIDE -- put it near a sun -- and it circulates for as long
// as the difference lasts. THE ENGINE IS NOT THE HEAT. THE ENGINE IS THE DIFFERENCE.
//
// ---- BUT THE SPIKES DIE FIRST, AND THAT IS THE MEASURABLE PART -----------------------------------------------
//
// v2554's threshold: M_c^2 = (2/mu0)(1 + 1/r_c) sqrt(g rho sigma). BOTH SIDES MOVE WITH TEMPERATURE, IN OPPOSITE
// DIRECTIONS, WHICH IS WHY THIS IS WORTH COMPUTING RATHER THAN ASSERTING:
//
//   M(T) FALLS  -- toward zero at the Curie point. Fewer aligned moments, less magnetisation to work with.
//   sigma(T) FALLS TOO -- surface tension drops roughly linearly with temperature (Eotvos). A LOWER sigma means
//                         a LOWER threshold: the surface is easier to break.
//
// So heating makes the fluid less able to spike AND makes spiking easier. Which wins? M falls like a critical
// exponent near T_c -- steeply, ~(1 - T/T_c)^beta -- while sigma just slides. The prediction is that M loses,
// and the spikes should vanish at a temperature strictly BELOW the Curie point, with the fluid still magnetic.
//
// HONEST LIMIT, STATED UP FRONT: this is v2554's 1D linear-stability model with T-dependent coefficients bolted
// on. It is not a ferrohydrodynamics solver and it does not model the convection cell -- it computes the KELVIN
// FORCE that drives one, and the threshold that kills the spikes, and says which happens first. Nothing here
// selects hexagons, and nothing here integrates a flow.
"use strict";

import { MU0, criticalMagnetisation, criticalWavenumber, growthRate } from "./ferro.js";

/**
 * Magnetisation vs temperature. Mean-field critical exponent beta = 1/2: M(T) = M0 * (1 - T/Tc)^(1/2).
 * Real ferrofluids are messier (superparamagnetic, Langevin), but the SHAPE is what matters here: it falls
 * STEEPLY near T_c, and it is exactly zero at and above it.
 * @param {number} T   kelvin
 * @param {number} Tc  Curie temperature, kelvin
 */
export function magnetisationAt(T, M0, Tc, beta = 0.5) {
    if (T >= Tc) return 0;                    // above Curie the moments randomise: no net magnetisation at all
    return M0 * Math.pow(1 - T / Tc, beta);
}

/**
 * Surface tension vs temperature. Eotvos-like: falls roughly linearly, hitting zero at the critical point of the
 * CARRIER LIQUID (which is far above the ferrofluid's Curie point for anything oil-based).
 */
export function surfaceTensionAt(T, sigma0, T0 = 293, Tcrit = 800) {
    const s = sigma0 * ((Tcrit - T) / (Tcrit - T0));
    return Math.max(s, 0);
}

/**
 * DOES IT STILL SPIKE AT THIS TEMPERATURE?
 * Compares what magnetisation the fluid HAS against what the Rosensweig threshold DEMANDS -- both at T.
 * @returns {{T, M, sigma, Mc, spikes, margin}}
 */
export function spikesAt(T, opts = {}) {
    const { M0 = 20000, Tc = 600, sigma0 = 0.025, rho = 1236, rc = 1.6, g = 9.81 } = opts;
    const M = magnetisationAt(T, M0, Tc);
    const sigma = surfaceTensionAt(T, sigma0);
    const Mc = sigma > 0 ? criticalMagnetisation(rho, sigma, rc, g) : 0;
    return { T, M, sigma, Mc, spikes: M > Mc && sigma > 0, margin: M - Mc };
}

/** The temperature where the spikes give out. Bisection -- no algebra to get wrong. */
export function spikeDeathTemperature(opts = {}) {
    const Tc = opts.Tc ?? 600;
    if (!spikesAt(280, opts).spikes) return null;         // never spiked to begin with
    let lo = 280, hi = Tc;
    for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (spikesAt(mid, opts).spikes) lo = mid; else hi = mid;
    }
    return lo;
}

/**
 * THE KELVIN BODY FORCE -- the thing that pumps.
 *
 * A thermal gradient makes magnetisation non-uniform, and non-uniform magnetisation in a field gradient is a
 * force. This is the magnitude per unit volume along a 1D temperature ramp: f ~ mu0 * M(T) * dH/dx, with the
 * COLD end (high M) pulled hardest toward the magnet.
 *
 * THE CYCLE THIS DRIVES, from Love et al.: cold fluid is pulled in -> it heats -> M drops -> the fluid behind it
 * (still cold, still magnetic) is pulled harder and DISPLACES it -> the displaced plug cools -> it becomes
 * magnetic again -> it is pulled back in. Round and round, with a static magnet and a hot side. No pump.
 *
 * @returns {number} force per unit volume, N/m^3. Positive = pulled toward the magnet.
 */
export function kelvinForce(T, gradH, opts = {}) {
    const { M0 = 20000, Tc = 600 } = opts;
    return MU0 * magnetisationAt(T, M0, Tc) * gradH;
}

/**
 * WILL IT CIRCULATE? The pump runs on the DIFFERENCE in Kelvin force between the cold end and the hot end.
 * Uniform temperature -> zero difference -> no flow -> the blob is dead. NOT because it is too hot. Because it
 * is EVENLY hot.
 * @returns {{cold, hot, drive, circulates}}
 */
export function convectionDrive(Tcold, Thot, gradH, opts = {}) {
    const cold = kelvinForce(Tcold, gradH, opts);
    const hot = kelvinForce(Thot, gradH, opts);
    return { cold, hot, drive: cold - hot, circulates: cold - hot > 1e-9 };
}

// ---- CLI -----------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith("ferroThermal.js")) {
    const opts = { M0: 20000, Tc: 600, sigma0: 0.025, rho: 1236, rc: 1.6 };
    console.log("\n  BAKING THE BLOB. Curie point " + opts.Tc + " K (" + (opts.Tc - 273).toFixed(0) + " C).\n");
    console.log("  " + "T (K)".padStart(7) + "M (kA/m)".padStart(11) + "M_c needed".padStart(12) + "sigma (mN/m)".padStart(14) + "   spikes?");
    for (const T of [293, 400, 500, 550, 580, 595, 600, 650]) {
        const s = spikesAt(T, opts);
        console.log("  " + String(T).padStart(7) + (s.M / 1000).toFixed(2).padStart(11) + (s.Mc / 1000).toFixed(2).padStart(12) +
                    (s.sigma * 1000).toFixed(2).padStart(14) + "   " + (s.spikes ? "YES" : "no"));
    }
    const death = spikeDeathTemperature(opts);
    console.log("\n  THE SPIKES DIE AT " + death.toFixed(1) + " K (" + (death - 273).toFixed(0) + " C) -- " +
                (opts.Tc - death).toFixed(1) + " K BELOW the Curie point.");
    console.log("  The fluid is still magnetic there (" + (magnetisationAt(death, opts.M0, opts.Tc) / 1000).toFixed(2) +
                " kA/m). It just cannot muster the threshold any more.");
    console.log("\n  BUT DOES IT DIE?\n");
    for (const [label, Tc2, Th] of [["a sun on one side", 300, 500], ["hotter sun, same side", 300, 590],
                                     ["baked EVENLY at 500 K", 500, 500], ["everything past Curie", 650, 700]]) {
        const c = convectionDrive(Tc2, Th, 1e6, opts);
        console.log("  " + label.padEnd(24) + "drive " + c.drive.toExponential(2).padStart(10) + "   " +
                    (c.circulates ? "IT CIRCULATES" : "dead -- no gradient, no Kelvin force, no flow"));
    }
    console.log("\n  The engine is not the heat. THE ENGINE IS THE DIFFERENCE.");
}
