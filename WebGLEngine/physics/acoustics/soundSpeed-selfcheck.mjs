// physics/acoustics/soundSpeed-selfcheck.mjs
//
// v3386 -- WHERE c COMES FROM, AND A PLANTED ERROR THAT NEWTON ACTUALLY MADE.
//
// waves.mjs takes the sound speed as a PARAMETER, so the acoustics device could never be wrong about c -- it was
// never asked to compute it. Seismology computes Vp = sqrt((K + 4mu/3)/rho), and a fluid has no shear modulus,
// so the acoustic sound speed IS the seismic P-wave speed at mu = 0. Two fields, one formula, and the identity
// sat unclaimed from the moment seismology landed.
//
// This module does not re-derive it. soundSpeedFluid CALLS vP -- the same function, so the two fields cannot
// drift apart rather than merely agreeing today.
//
// *** THE PLANTED ERROR IS HISTORICAL, AND IT IS THE BEST ONE IN THE LAB. ***
//
// Newton computed the speed of sound in 1687 as sqrt(P/rho), treating compression as ISOTHERMAL. That gives
// 290.09 m/s against a measured 343.2 -- 15.5% low, and the discrepancy stood for over a century. Laplace saw
// that the compressions are ADIABATIC: they happen far too fast for heat to move, so the stiffness is gamma*P,
// not P. The same calculation then gives 343.23.
//
// Newton's arithmetic was perfect. No internal consistency check would ever have caught him, and none of this
// tree's structural checks would either -- only a comparison against MEASUREMENT. That is precisely the class of
// error a lab full of self-consistent devices is blind to.

import {
    soundSpeedFluid, soundSpeedSolid, soundSpeedGas, soundSpeedNewton,
    laplaceCorrection, gasBulkModulus, MEASURED, GAMMA_AIR, R_GAS, M_AIR,
} from "./soundSpeed.mjs";
import { vP, vS } from "../seismic/rays.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE CROSS-FIELD IDENTITY, BY CONSTRUCTION RATHER THAN BY COINCIDENCE ------------------------------------
{
    ok("!! the acoustic sound speed IS the seismic P-wave speed with no shear",
        [[2.2e9, 1000], [1.42e5, 1.204], [5e10, 2700]].every(([K, rho]) => soundSpeedFluid(K, rho) === vP(K, 0, rho)),
        "bit-identical at three materials spanning air, water and rock, because soundSpeedFluid CALLS vP rather " +
        "than repeating its algebra. Two copies of one formula agree today and drift the moment either is edited; " +
        "one function cannot");

    ok("...and a fluid carries no shear wave, which is the same statement",
        vS(0, 1000) === 0 && soundSpeedFluid(2.2e9, 1000) > 0,
        "the missing shear modulus is exactly what makes the acoustic case a special case of the seismic one. " +
        "Sound in a fluid and a P wave in rock are the same physics with mu set to zero");

    ok("!! and shear STIFFENS a solid, so rock carries sound faster than its bulk modulus alone",
        soundSpeedSolid(5.2e10, 3.1e10, 2700) > soundSpeedFluid(5.2e10, 2700),
        `granite ${soundSpeedSolid(5.2e10, 3.1e10, 2700).toFixed(0)} m/s against ${soundSpeedFluid(5.2e10, 2700).toFixed(0)} ` +
        "from bulk alone. The 4mu/3 term is real stiffness, not a correction factor");
}

// ---- 2. GRADED AGAINST MEASUREMENT, WHICH IS THE ONLY CHECK THAT CATCHES NEWTON ---------------------------------------
{
    const air = soundSpeedGas(293.15), water = soundSpeedFluid(2.2e9, 1000), rock = soundSpeedSolid(5.2e10, 3.1e10, 2700);
    ok("!! air, water and granite all land within a percent of measured values",
        Math.abs(air - MEASURED.airAt20C) / MEASURED.airAt20C < 0.01 &&
        Math.abs(water - MEASURED.water) / MEASURED.water < 0.01 &&
        Math.abs(rock - MEASURED.granitePwave) / MEASURED.granitePwave < 0.02,
        `air ${air.toFixed(2)} vs ${MEASURED.airAt20C}, water ${water.toFixed(1)} vs ${MEASURED.water}, granite ` +
        `${rock.toFixed(0)} vs ${MEASURED.granitePwave}. Three states of matter, three independent measurements, ` +
        "and the numbers come from moduli and molar mass rather than from anything in this tree");
}

// ---- 3. NEWTON'S ERROR -- plausible, self-consistent, and 15% wrong ----------------------------------------------------
{
    const laplace = soundSpeedGas(293.15), newton = soundSpeedNewton(293.15);
    ok("!! the isothermal calculation is 15% low, and nothing internal would catch it",
        newton < laplace * 0.9 && Math.abs(newton - 290.1) < 1,
        `${newton.toFixed(2)} m/s isothermal against ${laplace.toFixed(2)} adiabatic and ${MEASURED.airAt20C} ` +
        "measured. Newton's arithmetic was correct; his thermodynamics was not. A plausible number in the right " +
        "units and the right order -- the class of error a lab of self-consistent devices is blind to, and only " +
        "measurement finds");

    ok("!! the correction is exactly sqrt(gamma), independent of temperature and gas",
        [200, 293.15, 400, 1000].every((T) => Math.abs(soundSpeedGas(T) / soundSpeedNewton(T) - laplaceCorrection()) < 1e-12) &&
        Math.abs(laplaceCorrection(1.667) - Math.sqrt(1.667)) < 1e-15,
        `ratio ${(laplace / newton).toFixed(9)} against sqrt(1.4) = ${laplaceCorrection().toFixed(9)}, constant ` +
        "across a fivefold temperature range and correct for a monatomic gamma too. The whole of Laplace's fix " +
        "is one square root of the heat-capacity ratio");

    ok("...and the adiabatic bulk modulus is gamma times the isothermal one",
        Math.abs(gasBulkModulus(101325) / 101325 - GAMMA_AIR) < 1e-12,
        "which is the same statement expressed as a stiffness rather than a speed. Air resists fast compression " +
        "more than slow compression, because fast compression heats it");
}

// ---- 4. TEMPERATURE SCALING -------------------------------------------------------------------------------------------
{
    ok("!! sound speed goes as sqrt(T), not as T",
        [[273.15, 293.15], [200, 800]].every(([T1, T2]) =>
            Math.abs(soundSpeedGas(T2) / soundSpeedGas(T1) - Math.sqrt(T2 / T1)) < 1e-12),
        `quadrupling the absolute temperature doubles the speed: ${soundSpeedGas(200).toFixed(1)} m/s at 200 K ` +
        `and ${soundSpeedGas(800).toFixed(1)} at 800 K. Pressure and density both change with T and their ratio ` +
        "does not, which is why the speed depends on temperature alone and not on altitude");
}

console.log();
if (fails) { console.log("soundSpeed-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("soundSpeed-selfcheck: all checks pass");
