// WebGLEngine/physics/blobKelvin-selfcheck.mjs — v2617
//
// Run: node physics/blobKelvin-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES the warmth-to-Kelvin chain, and the reason "pick a viscosity" was not enough.
import {
    K_BOLTZMANN, stokesEinsteinD, stokesEinsteinT, kelvinOfWarmth, warmthOfKelvin, SCENARIOS,
} from "./blobKelvin.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. THE FORMULA IS ITS OWN INVERSE -----------------------------------------------------------------------------
{
    const eta = 1e-3, r = 8e-6;
    const round = stokesEinsteinT(stokesEinsteinD(300, eta, r), eta, r);
    ok("!! Stokes-Einstein round-trips", Math.abs(round - 300) < 1e-9,
       "D(300K) -> T gives " + round.toFixed(6) + " K. If D->T and T->D do not invert each other the whole slider is untrustworthy in both directions.");

    ok("...and Boltzmann is the exact SI value", K_BOLTZMANN === 1.380649e-23,
       "1.380649e-23 J/K, exact since the 2019 redefinition. A guessed constant here would put every temperature off by a hidden factor.");
}

// ---- 2. PICKING A VISCOSITY IS NOT ENOUGH: T DEPENDS ON L^3 / tau --------------------------------------------------
{
    const base = SCENARIOS.cell_realtime;
    const D = 0.01141;
    const tSlow = kelvinOfWarmth(D, { ...base, tau: 10 });
    const tFast = kelvinOfWarmth(D, base);
    const tBig = kelvinOfWarmth(D, { ...base, L: base.L * 2 });

    ok("!! SAME eta, SAME r, SAME D -- and T MOVES BY ORDERS OF MAGNITUDE", tFast / tSlow > 9.5 && tBig / tFast > 7,
       "10x slower clock -> " + (tFast / tSlow).toFixed(1) + "x cooler (T ~ 1/tau); 2x bigger particle -> " + (tBig / tFast).toFixed(1) +
       "x hotter (T ~ L^3). THE STANDING PLAN SAID 'PICK A VISCOSITY AND KELVIN BECOMES REAL'. IT DOES NOT: T = 6 pi eta r_sim D_sim L^3 / (tau k), so picking eta leaves the LENGTH and TIME scales free and the temperature undetermined. A REASON THAT EXPIRED IS A HABIT -- and this one was incomplete from the start, not expired, which is worse: it would have shipped a Kelvin reading that was really L and tau in disguise.");
}

// ---- 3. THE NATURAL IDENTIFICATION RUNS THE AQUARIUM HOT -----------------------------------------------------------
{
    const tMax = kelvinOfWarmth(0.02, SCENARIOS.cell_realtime);
    const roomFrac = warmthOfKelvin(293, SCENARIOS.cell_realtime) / 0.02;
    ok("!! the '10 um cell, real-time' reading is STYLISED, not physical", tMax > 5e4 && roomFrac < 0.01,
       "slider max D=0.02 -> " + tMax.toExponential(1) + " K, and room temperature sits at " + (roomFrac * 100).toFixed(2) +
       "% of travel. UNDER THE OBVIOUS IDENTIFICATION THE AQUARIUM RUNS TENS OF THOUSANDS OF KELVIN HOT. That is not a bug -- it is what the sim is -- but a slider labelled 'Kelvin' that read 60,000 K would be a lie dressed as a measurement. THIS SCENARIO IS KEPT ONLY SO THE GATE CAN PROVE IT.");
}

// ---- 4. THE PHYSICAL SCENARIO IS ACTUALLY PHYSICAL -----------------------------------------------------------------
{
    const b = SCENARIOS.bacterium;
    const tRest = kelvinOfWarmth(0, b);
    const tMax = kelvinOfWarmth(0.02, b);
    const tWarm = kelvinOfWarmth(0.01141, b);
    const roomFrac = warmthOfKelvin(293, b) / 0.02;

    ok("!! the default scenario reads real temperatures", Math.abs(tRest) < 1e-9 && Math.abs(tMax - 373) < 2 && roomFrac > 0.6 && roomFrac < 0.95,
       "D=0 -> " + tRest.toFixed(1) + " K (rest), D=0.02 -> " + tMax.toFixed(0) + " K (boiling), room temp 293K at " + (roomFrac * 100).toFixed(0) +
       "% of travel. THAT IS A USABLE PHYSICAL SLIDER, and it is real BECAUSE THE SCENARIO IS STATED (a 1.5 um particle in water, real-time clock), not because a viscosity was guessed. The honesty is in the label, not the number.");

    ok("...and the measured warmth lands somewhere sane", tWarm > 150 && tWarm < 260,
       "the aquarium's measured warmth D=0.01141 -> " + tWarm.toFixed(0) + " K under this scenario -- a cold day, not a star. The number is only meaningful WITH the scenario printed beside it, which is why the module ships `models`, a plain-English sentence for every scenario.");
}

// ---- 5. EVERY SCENARIO CARRIES ITS ASSUMPTIONS IN WORDS -----------------------------------------------------------
{
    ok("!! no scenario hides what it assumes", Object.values(SCENARIOS).every((s) => typeof s.models === "string" && s.models.length > 40 && s.L > 0 && s.tau > 0),
       "each scenario names its length scale, time scale, viscosity, AND an English sentence for what the blob is being modelled as. A KELVIN READING WITHOUT ITS SCENARIO IS A NUMBER PRETENDING TO BE A MEASUREMENT.");
}

console.log(fails ? "\nblobKelvin-selfcheck: " + fails + " FAILED" : "\nblobKelvin-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
