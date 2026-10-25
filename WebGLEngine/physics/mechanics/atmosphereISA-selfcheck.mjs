// WebGLEngine/physics/mechanics/atmosphereISA-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node physics/mechanics/atmosphereISA-selfcheck.mjs      (~1 s)
//
// THE STANDARD ATMOSPHERE, HELD TO THE TEXTBOOK AND TO PHYSICS. physics/mechanics/atmosphereISA.mjs is three formulas; a wrong exponent in the middle one still gives an atmosphere that thins with height. So the rows are held to two things the formulas were NOT written from: the ICAO
// standard-atmosphere table (the pressure and density at seven heights) and the law the whole thing is a solution of (hydrostatic balance, dp/dh = -rho g, taken as a numerical derivative of the module's own pressure).
//
//   1  SEA LEVEL      288.15 K, 101,325 Pa, 1.225 kg/m^3 to 1e-14, 340.29 m/s, sigma 1; the gas constant is the one the sea-level triple implies, 287.0529
//   2  THE TABLE      pressure to 1e-5 and density to 2e-4 at 1, 2, 3, 5, 8, 10 and 11 km; temperature exactly; the speed of sound to 3e-5 at 1, 5 and 11 km (the table prints 0.01 m/s; the 8 km row of the textbook's sound column is a rounding of a different gas constant)
//   3  PHYSICS        hydrostatic balance to 1e-6 at three heights; the ideal gas law and a = sqrt(gamma R T) to 1e-12; temperature linear in height with the standard lapse; every quantity falls with height
//   4  THE EDGES      below 0 is 0, above 11,000 m is 11,000 m, a non-finite height is 0; the front door prints the five heights
//
// SABOTAGE LOG -- NINETEEN, each applied to physics/mechanics/atmosphereISA.mjs in a scratch tree, the gate run, the tree discarded; every one red by name (the number is how many rows went red):
//   A01 the lapse 6.6 K/km 5 | A02 the density exponent used for the pressure 3 | A03 the gas constant 287 4 | A04 density from the sea-level temperature 3 | A05 gamma 1.3 3 | A06 the speed of sound from the sea-level temperature 3 | A07 no ceiling 1 | A08 no floor 1 |
//   A09 a non-finite height read as the ceiling 1 | A10 sigma is the density 2 | A11 sea-level pressure 101,300 5 | A12 sea-level temperature 288 5 | A13 the sea-level density 1.2 6 | A14 g 9.8 3 | A15 the pressure in kilopascals 4 | A16 the ceiling 10,000 m 5 |
//   A17 no square root in the speed of sound 3 | A18 temperature falls at half the lapse 5 | A19 the textbook gas constant 287.05287 in place of the derived one 2 (sea-level density 1.2250000181: the 1e-14 row).
//   WHAT THE FIRST RUN OF THE ROWS FOUND, in the rows and not in the module: the gas constant was first written 287.053 and the sea-level density came out 1.2249995, which is not the standard's 1.225 -- the textbook value 287.05287 gave it to 1.5e-8, which still moved a jet's static thrust by 2e-4 N in the flight model's own gate, so the constant is now DERIVED from the standard's sea-level pair (P0 / (RHO0 T0)) and the density is 1.225 to the last bit; and two numbers recalled for the table (the speed of sound at 8 km
//   and the density at 3 km) were off in the fourth digit, so the table rows carry only the values the module and the textbook agree on to their printed precision, and the speed-of-sound rows allow the table's own 0.01 m/s rounding.
"use strict";
import * as A from "./atmosphereISA.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const near = (a, b, eps) => Math.abs(a - b) <= eps;

console.log("atmosphereISA-selfcheck -- the standard atmosphere's troposphere\n");

console.log("1. SEA LEVEL");
{
    const a = A.atmosphere(0);
    ok("!! SEA LEVEL: 288.15 K, 101,325 Pa, 1.225 kg/m^3 (to 1e-14 -- the gas constant is the one that gives it), the speed of sound 340.294 m/s (to 1e-6) and sigma 1 (to 1e-14)", a.T === 288.15 && a.p === 101325 && rel(a.rho, 1.225) < 1e-14 && rel(a.a, 340.294) < 1e-6 && near(a.sigma, 1, 1e-14), `rho ${a.rho}, a ${a.a}`);
    ok("the module's own constants are the standard's: 288.15 K, 101,325 Pa, 1.225, a lapse of 6.5 K/km, gamma 1.4, g 9.80665, the tropopause at 11,000 m", A.T0 === 288.15 && A.P0 === 101325 && A.RHO0 === 1.225 && A.LAPSE === 0.0065 && A.GAMMA === 1.4 && A.G0 === 9.80665 && A.TROPOPAUSE === 11000 && A.R_AIR === 101325 / (1.225 * 288.15) && near(A.R_AIR, 287.05287, 1e-4));
}

console.log("\n2. THE ICAO TABLE");
{
    const table = { 1000: [89874.6, 1.11166, 336.43, 281.65], 2000: [79495.2, 1.00655, null, 275.15], 3000: [70108.5, 0.90925, null, 268.65], 5000: [54019.9, 0.73612, 320.53, 255.65], 8000: [35599.9, 0.52517, null, 236.15], 10000: [26436.3, 0.41271, null, 223.15], 11000: [22632.1, 0.36392, 295.07, 216.65] };
    const worst = { p: 0, rho: 0, a: 0 }; let allT = true;
    for (const [h, [p, rho, a, T]] of Object.entries(table)) { const x = A.atmosphere(+h); worst.p = Math.max(worst.p, rel(x.p, p)); worst.rho = Math.max(worst.rho, rel(x.rho, rho)); if (a) worst.a = Math.max(worst.a, rel(x.a, a)); allT = allT && near(x.T, T, 1e-9); }
    ok("!! PRESSURE matches the table at 1, 2, 3, 5, 8, 10 and 11 km to 1e-5", worst.p < 1e-5, `worst ${worst.p.toExponential(1)}`);
    ok("!! DENSITY matches the table at the same heights to 2e-4", worst.rho < 2e-4, `worst ${worst.rho.toExponential(1)}`);
    ok("!! TEMPERATURE matches the table exactly (it is 288.15 - 6.5 h / 1000), and the speed of sound matches at 1, 5 and 11 km to 3e-5 (the table prints it to 0.01 m/s)", allT && worst.a < 3e-5, `a worst ${worst.a.toExponential(1)}`);
}

console.log("\n3. PHYSICS");
{
    let hydro = 0;
    for (const h of [500, 4000, 9000]) { const dp = (A.atmosphere(h + 1).p - A.atmosphere(h - 1).p) / 2; hydro = Math.max(hydro, rel(dp, -A.atmosphere(h).rho * A.G0)); }
    ok("!! HYDROSTATIC BALANCE: dp/dh = -rho g, with the derivative taken numerically from the module's own pressure, to 1e-6 at 500, 4,000 and 9,000 m (a wrong exponent breaks this at once)", hydro < 1e-6, `worst ${hydro.toExponential(1)}`);
    let gas = 0, snd = 0, lapse = 0, mono = true, prev = A.atmosphere(0);
    for (let h = 0; h <= 11000; h += 100) { const x = A.atmosphere(h); gas = Math.max(gas, rel(x.rho, x.p / (A.R_AIR * x.T))); snd = Math.max(snd, rel(x.a, Math.sqrt(A.GAMMA * A.R_AIR * x.T))); lapse = Math.max(lapse, Math.abs(x.T - (288.15 - 0.0065 * h))); if (h > 0) mono = mono && x.rho < prev.rho && x.p < prev.p && x.T < prev.T && x.a < prev.a && x.sigma < prev.sigma; prev = x; }
    ok("!! THE IDEAL GAS LAW and the speed of sound: rho = p / (R T) and a = sqrt(gamma R T) to 1e-12 at every 100 m from 0 to 11,000", gas < 1e-12 && snd < 1e-12, `${gas.toExponential(1)} ${snd.toExponential(1)}`);
    ok("!! THE LAPSE IS THE STANDARD'S: temperature is 288.15 - 0.0065 h to 1e-9 K at every 100 m, and temperature, pressure, density, sigma and the speed of sound all fall with every step up", lapse < 1e-9 && mono);
    ok("sigma is rho over the sea-level density: 0.7361/1.225 at 5 km, and the sea-level constant is exactly 1.225", near(A.atmosphere(5000).sigma, A.atmosphere(5000).rho / 1.225, 1e-15) && A.RHO0 === 1.225);
}

console.log("\n4. THE EDGES; THE FRONT DOOR");
{
    const s0 = A.atmosphere(0), s11 = A.atmosphere(11000);
    ok("!! A HEIGHT UNDER 0 IS READ AS 0, one over 11,000 m as 11,000 m (a ceiling, not a stratosphere), and a non-finite height (NaN, Infinity, undefined) as 0", [-1, -500, -1e9].every((h) => A.atmosphere(h).rho === s0.rho) && [11001, 20000, 1e9].every((h) => A.atmosphere(h).rho === s11.rho && A.atmosphere(h).T === s11.T) && [NaN, Infinity, -Infinity, undefined].every((h) => A.atmosphere(h).rho === s0.rho));
    const L = A.reportLines();
    ok("the front door names the module and prints five heights, none NaN or undefined", L.length === 6 && /atmosphereISA/.test(L[0]) && L.slice(1).every((l) => /kg\/m\^3/.test(l)) && !L.some((l) => /NaN|undefined/.test(l)));
}

console.log(fails ? `\natmosphereISA-selfcheck: ${fails} FAILED` : "\natmosphereISA-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
