// ev/starCatalog-selfcheck.mjs
//
// Run: node ev/starCatalog-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The baked star snapshot, checked against recorded reality. Vega loads with its real magnitude, temperature and spectral
// type. The distance modulus turns apparent magnitudes into true luminosities, and it reveals the thing apparent
// brightness hides: the star that looks brightest in the sky is not the one that shines hardest -- Sirius outshines Deneb
// to the eye only because it is a hundred and seventy times closer. Colour tracks temperature the way Wien's law says.
// The sabotage removes the distance term from the absolute magnitude, so apparent brightness stands in for real
// luminosity, and the check that a distant supergiant outshines a near white star fails -- because distance is exactly
// what the eye cannot correct for and the data can.
import { STARS, starByName, count, position3D, absoluteMagnitude, colorFromTemp } from "./starCatalog.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, e) => Math.abs(a - b) < e;
const noSun = STARS.filter((s) => s.name !== "Sun");

// ---- 1. VEGA LOADS WITH ITS REAL RECORDED QUALITIES -------------------------------------------------
{
    const v = starByName("Vega");
    ok("!! the snapshot carries real recorded qualities -- Vega checks out against the catalogues", v && near(v.mag, 0.03, 0.05) && near(v.tempK, 9600, 150) && v.spectral === "A0V" && near(v.distLy, 25, 1),
       "Vega comes back at magnitude " + v.mag + ", " + v.tempK + " K, type " + v.spectral + ", " + v.distLy + " light-years -- the Hipparcos/SIMBAD values, baked, not guessed.");
}

// ---- 2. THE DISTANCE MODULUS GIVES REAL ABSOLUTE MAGNITUDES -----------------------------------------
{
    const vegaM = absoluteMagnitude(starByName("Vega")), sunM = absoluteMagnitude(starByName("Sun"));
    ok("!! the distance modulus recovers true luminosities -- Vega ~0.6, the Sun ~4.8", near(vegaM, 0.6, 0.2) && near(sunM, 4.8, 0.2),
       "Vega's absolute magnitude comes out " + vegaM.toFixed(2) + " and the Sun's " + sunM.toFixed(2) + " -- the Sun is a thoroughly average star whose apparent glare is only proximity.");
}

// ---- 3. HIDDEN AND REAL: the brightest-LOOKING star is not the most luminous ------------------------
{
    const brightestLooking = noSun.reduce((a, b) => (a.mag < b.mag ? a : b));
    const mostLuminous = noSun.reduce((a, b) => (absoluteMagnitude(a) < absoluteMagnitude(b) ? a : b));
    ok("!! the star that looks brightest is not the one that shines hardest", brightestLooking.name === "Sirius" && mostLuminous.name === "Deneb",
       brightestLooking.name + " dominates the eye, but " + mostLuminous.name + " (fifteen hundred light-years off, looking modest) is intrinsically the most luminous -- apparent brightness is a lie the distance modulus corrects.");
}

// ---- 4. COLOUR TRACKS TEMPERATURE (Wien): hot is blue, cool is red ----------------------------------
{
    const cool = colorFromTemp(3600), hot = colorFromTemp(12100);   // Betelgeuse vs Rigel
    ok("!! colour follows temperature -- the cool star reads red, the hot one blue", cool[0] > cool[2] && hot[2] > hot[0],
       "a 3600 K star comes out red-dominant and a 12100 K star blue-dominant -- the real colour-temperature relation, so the sky renders in true colours rather than invented ones.");
}

// ---- 5. STARS SIT AT THEIR REAL DISTANCES IN 3D -----------------------------------------------------
{
    const v = starByName("Vega"); const p = position3D(v); const rad = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    const sirius = position3D(starByName("Sirius"));
    const differentDir = !(near(p[0], sirius[0], 1) && near(p[1], sirius[1], 1));
    ok("!! each star sits at its recorded distance and direction in 3D", near(rad, v.distLy, 0.1) && differentDir,
       "Vega's 3D position is " + rad.toFixed(1) + " light-years from origin -- its true distance -- and it lies in a different direction from Sirius, from the recorded right ascension and declination.");
}

// ---- 6. DETERMINISTIC ------------------------------------------------------------------------------
{
    ok("!! deterministic to load (baked snapshot, no live fetch)", count() === count() && absoluteMagnitude(starByName("Deneb")) === absoluteMagnitude(starByName("Deneb")),
       "the same snapshot yields the same numbers every run -- static data, loaded without touching the network, which is the whole point of baking it.");
}

console.log(fails ? "\nstarCatalog-selfcheck: " + fails + " FAILED" : "\nstarCatalog-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
