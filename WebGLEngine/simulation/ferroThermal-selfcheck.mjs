// WebGLEngine/simulation/ferroThermal-selfcheck.mjs — v2558
//
// Run: node simulation/ferroThermal-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// "Can we bake it? In a sun? Does it have to die?"
//
// No. It dies of UNIFORM heat, which is a different thing, and the distinction is the whole finding.
//
// TWO DEATHS, AND THEY ARE NOT THE SAME DEATH:
//
//   1. THE SPIKES die at 552.8 K -- 47 K BELOW the Curie point, WITH THE FLUID STILL MAGNETIC (5.61 kA/m).
//      Heating drops sigma, which LOWERS the Rosensweig bar; but M falls like a critical exponent while sigma
//      just slides, so M loses the race. It does not stop being magnetic. IT STOPS BEING MAGNETIC ENOUGH.
//
//   2. THE PUMP dies only when the gradient does. Web-verified (Elveflow/MAMI review; Love et al.'s magnetocaloric
//      pump): a thermal gradient makes magnetisation non-uniform, non-uniform magnetisation in a field gradient is
//      the KELVIN BODY FORCE, and "this thermomagnetic convection can drive the ferrofluid WITHOUT A PUMP". Cold
//      fluid is pulled into the magnet, heats, loses its attraction, and is DISPLACED BY THE COLD FLUID BEHIND IT.
//      Round and round, static magnet, no moving parts.
//
// So: bake it evenly and it dies AT ANY TEMPERATURE, even a comfortable one. Bake it on ONE SIDE and it lives.
// THE ENGINE IS NOT THE HEAT. THE ENGINE IS THE DIFFERENCE.
import { magnetisationAt, surfaceTensionAt, spikesAt, spikeDeathTemperature, kelvinForce, convectionDrive } from "./ferroThermal.js";
import { criticalMagnetisation } from "./ferro.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const O = { M0: 20000, Tc: 600, sigma0: 0.025, rho: 1236, rc: 1.6 };

// ---- 1. the two curves move in OPPOSITE directions, which is why this needed computing ------------------------
{
    ok("heating DROPS the magnetisation", magnetisationAt(500, O.M0, O.Tc) < magnetisationAt(293, O.M0, O.Tc),
       (magnetisationAt(293, O.M0, O.Tc) / 1000).toFixed(2) + " -> " + (magnetisationAt(500, O.M0, O.Tc) / 1000).toFixed(2) + " kA/m");
    ok("...and heating also drops SURFACE TENSION, which LOWERS the bar",
       criticalMagnetisation(O.rho, surfaceTensionAt(500, O.sigma0), O.rc) < criticalMagnetisation(O.rho, surfaceTensionAt(293, O.sigma0), O.rc),
       "M_c needed: " + (criticalMagnetisation(O.rho, surfaceTensionAt(293, O.sigma0), O.rc) / 1000).toFixed(2) +
       " -> " + (criticalMagnetisation(O.rho, surfaceTensionAt(500, O.sigma0), O.rc) / 1000).toFixed(2) + " kA/m. HEATING MAKES SPIKING EASIER AND THE FLUID LESS ABLE TO DO IT. Which wins is a computation, not an opinion.");
    ok("at and above Curie there is NO magnetisation at all", magnetisationAt(600, O.M0, O.Tc) === 0 && magnetisationAt(700, O.M0, O.Tc) === 0,
       "the moments randomise -- not 'a little', exactly none");
}

// ---- 2. THE SPIKES DIE BEFORE THE MAGNETISM DOES -------------------------------------------------------------
{
    const death = spikeDeathTemperature(O);
    ok("cold, it spikes", spikesAt(293, O).spikes, "M " + (spikesAt(293, O).M / 1000).toFixed(2) + " vs M_c " + (spikesAt(293, O).Mc / 1000).toFixed(2) + " kA/m");
    ok("THE SPIKES DIE STRICTLY BELOW THE CURIE POINT", death !== null && death < O.Tc - 10,
       death.toFixed(1) + " K, which is " + (O.Tc - death).toFixed(1) + " K below Curie");
    ok("...WITH THE FLUID STILL MAGNETIC (it stops being magnetic ENOUGH, not magnetic)",
       magnetisationAt(death, O.M0, O.Tc) > 1000,
       (magnetisationAt(death, O.M0, O.Tc) / 1000).toFixed(2) + " kA/m still there -- M falls like a critical exponent, sigma just slides, so M LOSES THE RACE");
    ok("...and past it, no field strength in the model brings them back", !spikesAt(590, O).spikes && !spikesAt(650, O).spikes,
       "580 K: M " + (spikesAt(580, O).M / 1000).toFixed(2) + " vs needs " + (spikesAt(580, O).Mc / 1000).toFixed(2));
}

// ---- 3. DOES IT HAVE TO DIE? NO. IT DIES OF *UNIFORM* HEAT. --------------------------------------------------
{
    const sun = convectionDrive(300, 500, 1e6, O);
    ok("A SUN ON ONE SIDE MAKES IT CIRCULATE (no pump, static magnet)", sun.circulates,
       "drive " + sun.drive.toExponential(2) + " N/m^3 -- cold fluid is pulled in, heats, loses its grip, and is displaced by the cold fluid behind it. Love et al.'s magnetocaloric pump.");
    const hotter = convectionDrive(300, 590, 1e6, O);
    ok("...and a HOTTER sun pumps it HARDER (the hot side has more magnetism to lose)", hotter.drive > sun.drive,
       sun.drive.toExponential(2) + " -> " + hotter.drive.toExponential(2));
    const even = convectionDrive(500, 500, 1e6, O);
    ok("BAKED EVENLY, IT DIES -- AT A TEMPERATURE WHERE IT IS PERFECTLY HAPPY", !even.circulates,
       "drive " + even.drive.toExponential(2) + " at a uniform 500 K, where it still has " +
       (magnetisationAt(500, O.M0, O.Tc) / 1000).toFixed(2) + " kA/m AND still spikes. NO GRADIENT, NO KELVIN FORCE, NO FLOW. THE ENGINE IS NOT THE HEAT, IT IS THE DIFFERENCE.");
    const gone = convectionDrive(650, 700, 1e6, O);
    ok("...and past Curie on BOTH ends there is nothing left to pump with", !gone.circulates,
       "drive " + gone.drive.toExponential(2) + " -- M is exactly 0 at both ends, so the difference is 0 too");
}

// ---- 4. the force is the force ---------------------------------------------------------------------------------
{
    ok("the Kelvin force is proportional to the magnetisation that is actually there",
       Math.abs(kelvinForce(293, 1e6, O) / kelvinForce(500, 1e6, O) - magnetisationAt(293, O.M0, O.Tc) / magnetisationAt(500, O.M0, O.Tc)) < 1e-9,
       "cold pulls harder than hot, in exactly the ratio of their magnetisations -- that ratio IS the pump");
    ok("...and above Curie there is no force at all", kelvinForce(650, 1e6, O) === 0);
    ok("no field gradient, no force (a uniform field cannot pull on anything)", kelvinForce(293, 0, O) === 0,
       "the same rule as v2554's k=0 case: uniform fields do not push");
}

console.log(fails ? "\nferroThermal-selfcheck: " + fails + " FAILED" : "\nferroThermal-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
