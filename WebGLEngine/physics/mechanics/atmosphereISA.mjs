// WebGLEngine/physics/mechanics/atmosphereISA.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE AIR AT A HEIGHT: the International Standard Atmosphere's troposphere, from sea level to 11,000 m. A jet flies where the air thins -- its lift, its drag and its engine all follow the density, and its speed limit follows the SPEED OF SOUND, which falls as the air cools --
// and the trainer (physics/mechanics/flightModel6dof.mjs) never needed any of that: it flies the lowest few hundred metres and holds the sea-level density. This is the function a model that does asks.
//
//   temperature   T = 288.15 K - 0.0065 K/m x h                          the standard lapse rate
//   pressure      p = 101325 Pa x (T / 288.15)^5.25588                   (g / (L R) with g = 9.80665, L = 0.0065, R = P0 / (RHO0 T0) = 287.0529)
//   density       rho = p / (R T) = 1.225 kg/m^3 x (T / 288.15)^4.25588  (the ideal gas law: the sea-level value is p0 / (R T0) = 1.2250)
//   sound         a = sqrt(gamma R T) with gamma 1.4                      340.29 m/s at sea level, 295.07 at 11,000 m
//
// WHAT IT DOES NOT HAVE, SAID PLAINLY: nothing above the tropopause (an altitude over 11,000 m is read as 11,000 m: a ceiling and not a stratosphere), no humidity, no weather, and a day that is always the standard day (15 C at sea level). A height under 0 is read as 0.
// HEIGHT IS TAKEN AS GEOPOTENTIAL, which is what the formulas above are written in (the ICAO tables by geopotential height give the values the gate pins: 1.1117 kg/m^3 at 1,000 m, 0.7361 at 5,000, 0.4127 at 10,000, 0.3639 at 11,000). The engine's z is a
// geometric height and the two differ by 0.16% at 10,000 m (the US Standard Atmosphere's table by geometric height reads 0.4135 there, and 0.7364 at 5,000): an error of that size is far under every other number in the airframes that use this.
//
// Pure: no DOM, no clock, no random.
"use strict";

export const T0 = 288.15, P0 = 101325, RHO0 = 1.225, LAPSE = 0.0065, GAMMA = 1.4, G0 = 9.80665;
export const R_AIR = P0 / (RHO0 * T0);   // 287.0529: the gas constant the standard's own sea-level pressure, density and temperature imply (the textbook 287.05287), so that rho(0) is 1.225 and not 1.2250000181
export const TROPOPAUSE = 11000;
const EXPONENT = G0 / (LAPSE * R_AIR);   // 5.25588

/** { T (K), p (Pa), rho (kg/m^3), a (m/s), sigma (rho / sea level rho) } at a height in metres (clamped to 0..11,000; a non-finite height is read as 0). */
export function atmosphere(altitude) {
    const h = Number.isFinite(altitude) ? Math.min(TROPOPAUSE, Math.max(0, altitude)) : 0;
    const T = T0 - LAPSE * h, p = P0 * Math.pow(T / T0, EXPONENT), rho = p / (R_AIR * T);
    return { T, p, rho, a: Math.sqrt(GAMMA * R_AIR * T), sigma: rho / RHO0 };
}

export function reportLines() {
    return ["[atmosphereISA] the standard atmosphere's troposphere: density, pressure, temperature and the speed of sound from sea level to 11,000 m",
        ...[0, 1000, 5000, 10000, 11000].map((h) => { const a = atmosphere(h); return `  ${String(h).padStart(5)} m: ${a.rho.toFixed(4)} kg/m^3  ${a.p.toFixed(0)} Pa  ${(a.T - 273.15).toFixed(1)} C  sound ${a.a.toFixed(2)} m/s`; })];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
