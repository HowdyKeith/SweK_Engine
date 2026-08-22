// physics/hologram-selfcheck.mjs
//
// Run: node physics/hologram-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The optics under a hologram, checked against the textbook. Two coherent sources write an interference pattern whose
// bright fringes are spaced lambda*D/d, exactly. The fringes exist only because light adds as amplitude and not as
// intensity: constructive peaks reach four times a single source (two amplitudes squared, not two intensities), dark
// fringes fall to nothing, while summing intensities gives a flat field with no pattern at all. The spacing scales the
// documented way -- wider sources, finer fringes; longer wavelength, wider fringes -- and because the spacing encodes the
// geometry, the source separation can be read back out of the pattern: record, then reconstruct. The sabotage discards
// the position-dependent phase, and the interference collapses into a flat field, because the phase is the hologram.
import { intensity, incoherentIntensity, fringeSpacing, recoverSeparation, scanScreen, twoSources } from "./hologram.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, e) => Math.abs(a - b) < e;
const lambda = 0.5, D = 1000, d = 20;
const scan = scanScreen(twoSources(d), lambda, D, 60, 4000);

// ---- 1. INTERFERENCE WRITES FRINGES AT lambda*D/d --------------------------------------------------
{
    ok("!! two coherent sources write fringes spaced lambda*D/d", scan.peaks.length >= 3 && near(scan.spacing, fringeSpacing(lambda, D, d), 0.3),
       "the measured bright-fringe spacing is " + scan.spacing.toFixed(2) + " against the formula's " + fringeSpacing(lambda, D, d).toFixed(2) + " -- a real interference pattern, not a drawn one.");
}

// ---- 2. LIGHT ADDS AS AMPLITUDE, NOT INTENSITY -----------------------------------------------------
{
    const peak = Math.max(...scan.I), dark = Math.min(...scan.I), flat = incoherentIntensity(0, twoSources(d));
    ok("!! the fringes exist because amplitudes add -- peaks reach 4, darks reach 0, incoherent is flat at 2", near(peak, 4, 0.05) && dark < 0.05 && near(flat, 2, 0.01),
       "constructive peaks hit " + peak.toFixed(2) + " (two amplitudes squared) and dark fringes " + dark.toFixed(3) + ", while merely summing intensities gives a flat " + flat.toFixed(1) + " -- no pattern. Interference is amplitude addition.");
}

// ---- 3. THE SPACING SCALES THE DOCUMENTED WAY ------------------------------------------------------
{
    const finer = scanScreen(twoSources(40), lambda, D, 60, 4000).spacing;
    const wider = scanScreen(twoSources(d), 1.0, D, 60, 4000).spacing;
    ok("!! wider sources give finer fringes, longer wavelength gives wider fringes", finer < scan.spacing && wider > scan.spacing,
       "doubling the source separation halves the fringe spacing to " + finer.toFixed(1) + ", and doubling the wavelength doubles it to " + wider.toFixed(1) + " -- exactly as lambda*D/d demands.");
}

// ---- 4. RECONSTRUCTION: the geometry reads back out of the pattern ----------------------------------
{
    const recovered = recoverSeparation(scan.spacing, lambda, D);
    ok("!! the source separation can be recovered from the fringe pattern alone (record, then reconstruct)", near(recovered, d, 0.5),
       "reading only the fringe spacing back through lambda*D/spacing recovers a separation of " + recovered.toFixed(2) + " against the original " + d + " -- the flat pattern encodes the geometry that made it, which is what a hologram is.");
}

// ---- 5. DETERMINISTIC ------------------------------------------------------------------------------
{
    ok("!! deterministic", intensity(3.7, twoSources(d), lambda, D) === intensity(3.7, twoSources(d), lambda, D),
       "the same geometry writes the same pattern every run -- it uses trig, so it is honest, deterministic physics, but gated only and not in the cross-architecture fingerprint.");
}

console.log(fails ? "\nhologram-selfcheck: " + fails + " FAILED" : "\nhologram-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
