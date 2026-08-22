// tools/roundhouse/astroparticleBind-selfcheck.mjs
//
// v3501 -- THE ASTROPARTICLE DEVICE, oscillation mode. Two-flavour neutrino survival graded on four keys of
// DELIBERATELY different power, to demonstrate oscillation.js's lesson: a suite can be green while the physics is
// wrong by a factor, and the check that sees it has to be chosen deliberately.
//
//   UNITARITY  survive + transition = 1 exactly (transition computed independently) -- blind to the constant.
//   AMPLITUDE  deepest dip = 1 - sin^2(2theta), from the mixing angle alone -- blind to the constant.
//   PHASE      closed-form first-minimum L/E matches the numerical search -- self-consistent, blind to the constant.
//   COEFF      the coefficient DERIVED from hbar c matches the known 1.266932 -- the ONLY key that sees it.
//
// The plant drops the derived constant (coeff -> 1). Unitarity/amplitude/phase stay green; only coeffErr moves,
// 5e-7 -> 2e-1. That is the whole point, and this selfcheck asserts it directly.

import { astroparticleDevice } from "./astroparticleBind.mjs";
import { measureGrowth } from "../../physics/astroparticle/jeans.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const good = astroparticleDevice.build({ mode: "oscillation" });
const bad = astroparticleDevice.build({ mode: "oscillation", config: { planted: true } });

// ---- 1. UNITARITY IS EXACT ----------------------------------------------------------------------------------------
ok("!! survive + transition = 1 exactly, across the whole sweep",
    good.unitarityErr === 0,
    `worst |P_survive + P_transition - 1| is ${good.unitarityErr.toExponential(2)}. Transition is computed ` +
    "independently, not as 1 - survive, so the sum is a real test -- it is sin^2 + cos^2 in physics notation and " +
    "holds at every energy, baseline, angle and mass splitting");

// ---- 2. THE DIP DEPTH COMES FROM THE MIXING ANGLE ALONE ------------------------------------------------------------
ok("!! the deepest dip matches 1 - sin^2(2theta), the mixing angle alone",
    good.amplitudeFromAngle === true && good.amplitudeErr < 1e-5,
    `numerical dip vs closed-form depth differ by ${good.amplitudeErr.toExponential(2)}. The phase sets WHERE the ` +
    "dip is, not how deep, so the depth is a function of the angle and nothing else");

// ---- 3. THE CLOSED-FORM PHASE MATCHES THE SEARCH -------------------------------------------------------------------
ok("!! the closed-form first-minimum L/E matches the numerical search",
    good.phaseFromConstant === true && good.phaseErr < 1e-3,
    `first-minimum location, closed form vs search, differs by ${good.phaseErr.toExponential(2)} (relative) -- the ` +
    "closed form pi/(2 coeff dm2) is confirmed against a scan, but both use the same coefficient so this is blind " +
    "to its value");

// ---- 4. THE DERIVED CONSTANT MATCHES THE KNOWN VALUE --------------------------------------------------------------
ok("!! the coefficient DERIVED from hbar c matches the known 1.266932",
    good.constantDerived === true && good.coeffErr < 1e-4,
    `derived vs literature differ by ${good.coeffErr.toExponential(2)}. The 1.267 is never typed -- it falls out of ` +
    "hbar c and the unit conversion -- so the gate can re-derive it and disagree, which a typed constant forbids");

// ---- 5. THE LESSON: ONLY THE COEFF KEY SEES THE DROPPED CONSTANT ---------------------------------------------------
ok("!! dropping the derived constant leaves unitarity, amplitude and phase GREEN",
    bad.unitarityErr === 0 && bad.amplitudeFromAngle === true && bad.phaseFromConstant === true,
    `with coeff forced to 1, unitarity is still ${bad.unitarityErr.toExponential(2)} and the amplitude and phase ` +
    "keys still pass -- a suite of those three would certify a neutrino sector wrong by 27%");

ok("...and ONLY the coeff key catches it",
    bad.constantDerived === false && bad.coeffErr > 0.1,
    `coeffErr jumps from ${good.coeffErr.toExponential(2)} to ${bad.coeffErr.toExponential(2)} while nothing else ` +
    "moves. The check that sees the constant is the one chosen deliberately -- which is why oscillation.js derives " +
    "the constant rather than typing it, and why this device grades the derivation and not just the shape");

// ================================================================================================================
// FRIEDMANN MODE -- three regimes that fail differently, plus a closure identity that is blind by construction.
// ================================================================================================================
const fg = astroparticleDevice.build({ mode: "friedmann" });
const fb = astroparticleDevice.build({ mode: "friedmann", config: { planted: true } });

ok("!! the matter-only universe expands as t^(2/3) and ages in exactly 2/3 of a Hubble time",
    fg.matterRegime === true && fg.ageNotBlind === true,
    `fitted matter exponent within ${fg.matterExponentErr.toExponential(2)} of 2/3, and the flat matter-only age ` +
    `within ${fg.matterAgeErr.toExponential(2)} of 2/3 -- the age is the key that a wrong dilution WOULD move`);

ok("!! the radiation-only universe expands as t^(1/2), a regime independent of the matter term",
    fg.radiationRegime === true,
    `fitted radiation exponent within ${fg.radiationExponentErr.toExponential(2)} of 1/2. Three regimes from one ` +
    "integrator that fail differently -- the beam device's static/vibration/buckling structure, in cosmology");

ok("!! Om + Or + Ok + OL = 1 exactly -- and it is a DEFINITION, not a measurement",
    fg.closes === true && fg.closureErr === 0,
    `the density parameters sum to 1 to the bit (${fg.closureErr.toExponential(2)}) because Ok is whatever is left ` +
    "over. A true identity, and the third subject (after unitarity and lensing) in which one is blind to real error");

ok("!! the wrong-matter-dilution plant breaks the matter regime and its age",
    fb.matterRegime === false && fb.ageNotBlind === false,
    `with the matter term set to a^-2, the fitted exponent misses 2/3 by ${fb.matterExponentErr.toExponential(2)} ` +
    `and the age misses it by ${fb.matterAgeErr.toExponential(2)} -- the dilution is wrong and the age says so`);

ok("...and leaves the radiation regime and the closure identity GREEN",
    fb.radiationRegime === true && fb.closes === true && fb.closureErr === 0,
    "the radiation exponent and the sum-to-one identity do not move -- a wrong matter exponent leaves the other " +
    "regime untouched, and the closure identity cannot see it at all, which is exactly why a third regime and a " +
    "not-blind key both had to be included");

// ================================================================================================================
// LENSING MODE -- an invariant that carries no parameter, blind to an Einstein-radius error in a fourth subject.
// ================================================================================================================
const lg = astroparticleDevice.build({ mode: "lensing" });
const lb = astroparticleDevice.build({ mode: "lensing", config: { planted: true } });

ok("!! mu_+ - mu_- = 1 exactly, from two INDEPENDENT magnifications",
    lg.invariant === true && lg.invariantErr < 1e-12,
    `the magnification difference is 1 to ${lg.invariantErr.toExponential(2)} across the alignment sweep, computed ` +
    "from plus and minus separately so it is a test, not a tautology -- and it falls out of the lens equation " +
    "carrying no parameter at all");

ok("!! the total magnification equals the sum of the two images",
    lg.totalConsistent === true,
    `total vs sum agree to ${lg.totalErr.toExponential(2)} -- what a telescope records is the unresolved sum`);

ok("!! the Einstein radius derived from G and c matches the independent Schwarzschild-radius route",
    lg.radiusDerived === true && lg.radiusErr === 0,
    `4GM/c^2 equals 2*(2GM/c^2) to the bit (${lg.radiusErr.toExponential(2)}); this is the NOT-blind key`);

ok("!! the wrong-factor plant breaks the radius and moves the peak a telescope would record",
    lb.radiusDerived === false && lb.peakMovesUnderPlant === true,
    `the plant's 2GM/c^2 factor puts the radius off by ${lb.radiusErr.toExponential(2)} and the peak magnification ` +
    "at a fixed physical alignment moves -- a real, observable error");

ok("...and the invariant mu_+ - mu_- = 1 is UNTOUCHED",
    lb.invariant === true && Math.abs(lb.invariantErr - lg.invariantErr) < 1e-15,
    "the invariant does not move because it is a function of the alignment u alone and carries no theta_E -- the " +
    "fourth independent instance (after oscillation, and closure in friedmann) of a true identity blind to a " +
    "serious error, which is why the radius key had to be built alongside it");

// ================================================================================================================
// JEANS MODE -- a threshold with a regime where collapse provably CANNOT happen (the Turing-round shape).
// ================================================================================================================
const jg = astroparticleDevice.build({ mode: "jeans" });
const jb = astroparticleDevice.build({ mode: "jeans", config: { planted: true } });

ok("!! without gravity, no wavelength is ever unstable -- stable identically",
    jg.noGravityStable === true && jg.noGravityMinOmega2 > 0,
    `with G = 0 the smallest omega^2 over the sweep is ${jg.noGravityMinOmega2.toExponential(2)} > 0, so every mode ` +
    "rings and none collapses -- a theorem, not a numerical 'usually stable', and the strongest key here");

ok("!! at the Jeans wavenumber the dispersion is marginal, omega^2 = 0",
    jg.marginalAtJeansK === true,
    `omega^2(k_J) is ${jg.thresholdErr.toExponential(2)} -- the crossover where growth gives way to oscillation`);

ok("!! WITH gravity a long wavelength collapses (the physics the plant will destroy)",
    jg.collapsesWithGravity === true,
    "a mode below k_J has omega^2 < 0 and grows -- gravity wins over pressure at long wavelength, which is how gas becomes stars");

ok("!! the gravity-sign plant breaks the crossover identity and kills collapse",
    jb.marginalAtJeansK === false && jb.collapsesWithGravity === false,
    `flip the sign of the gravity term and omega^2(k_J) jumps to ${jb.thresholdErr.toExponential(2)}, and long ` +
    "wavelengths no longer collapse -- structure never forms, a catastrophic error");

ok("...and the no-gravity theorem stays GREEN, blind to it",
    jb.noGravityStable === true && Math.abs(jb.noGravityMinOmega2 - jg.noGravityMinOmega2) < 1e-15,
    "the G = 0 limit is untouched because the gravity term vanishes whatever its sign -- the fifth instance of a " +
    "true statement blind to a serious error, and the reason the crossover key had to sit beside the theorem");

// CORROBORATION (not marking its own homework): a REAL-SPACE grid Poisson solve, evolved as a linearised gas,
// reproduces the closed-form growth rate -- the growth is measured, not the dispersion relation restated.
{
    const g = measureGrowth({ n: 64, L: 4, cs: 1, rho0: 1, mode: 1, dt: 3e-3, tEnd: 1.6, tStart: 0.3, poissonIters: 600 });
    ok("!! a real-space grid simulation independently reproduces the growth rate",
        g.rate != null && g.predicted != null && Math.abs(g.rate - g.predicted) / g.predicted < 0.12,
        `measured ${g.rate.toFixed(3)} vs the dispersion prediction ${g.predicted.toFixed(3)} (${(Math.abs(g.rate-g.predicted)/g.predicted*100).toFixed(1)}%) ` +
        "-- the Poisson solve is in real space, so the measurement does not restate the formula it is checked against");
}

// ================================================================================================================
// HALO MODE -- galaxy rotation curves. It MEASURES A DISCREPANCY and detects nothing; the honest close to Round 1.
// ================================================================================================================
const hg = astroparticleDevice.build({ mode: "halo" });
const hb = astroparticleDevice.build({ mode: "halo", config: { planted: true } });

ok("!! a flat rotation curve IS the isothermal sphere, exactly, at every radius",
    hg.flatIsIsothermal === true && hg.flatErr === 0,
    `vCirc(M_iso(r), r) equals v0 to ${hg.flatErr.toExponential(2)} across the radii -- M(r) = v0^2 r / G makes ` +
    "the G and the r cancel to the bit, so flatness is what the halo IS, not what it approximates");

ok("!! the numerical enclosed-mass integrator matches that exact identity",
    hg.integratorMatches === true,
    `numeric vs closed-form enclosed mass agree to ${hg.integratorErr.toExponential(2)} -- the isothermal identity ` +
    "is the control the module built to validate the integrator used on profiles with no closed form");

ok("!! outside all the mass, the curve falls Keplerian (v ~ r^-1/2)",
    hg.keplerFalloff === true,
    `v*sqrt(r) is constant to ${hg.keplerErr.toExponential(2)} -- if a halo cannot reproduce this with the halo ` +
    "switched off, it is not the halo doing the work");

ok("!! the mass discrepancy is REPORTED as a factor, not adjudicated as a detection",
    hg.discrepancyMeasured === true && hg.discrepancyFactor > 1 && Number.isFinite(hg.discrepancyFactor),
    `a flat curve needs ${hg.discrepancyFactor.toFixed(2)}x the luminous mass -- that is the ONLY claim: a gap of ` +
    "that size. Whether it is a particle or modified gravity is not something a rotation curve can settle, and " +
    "this mode does not pretend otherwise");

ok("!! the dropped-radius integrator plant breaks integratorErr, and the exact controls catch it",
    hb.integratorMatches === false && hb.flatErr === 0 && hb.keplerFalloff === true,
    `the plant's 4 pi r rho shell (a lost radius) puts the numeric mass off by ${hb.integratorErr.toExponential(2)}, ` +
    "while the analytic isothermal identity and the Keplerian control do not move -- the exact identity is the " +
    "anchor that validates the numeric integrator, which is exactly why it was built");

// ================================================================================================================
// DE SITTER MODE (v3523 deepening) -- the Lambda-dominated regime, completing the matter/radiation trilogy.
// ================================================================================================================
const dg = astroparticleDevice.build({ mode: "desitter" });
const db = astroparticleDevice.build({ mode: "desitter", config: { planted: true } });

ok("!! with only a cosmological constant the Hubble rate is CONSTANT, E(a) = 1 exactly",
    dg.hubbleConstant === true && dg.hubbleConstantErr === 0,
    `E(a) - 1 is ${dg.hubbleConstantErr.toExponential(2)} across the sweep -- sqrt(OL) = sqrt(1) = 1 at every a, so ` +
    "H does not change as the universe expands; that is the defining property of Lambda domination");

ok("!! the expansion is EXPONENTIAL, a e-folding per Hubble time -- not a power law",
    dg.notPowerLaw === true && dg.efoldErr < 1e-6,
    `the Lambda-only integral gives tau = ln(aEnd/a0) to ${dg.efoldErr.toExponential(2)}, and a power-law fit to the ` +
    "track lands nowhere near 2/3 or 1/2 -- the friedmann mode does the two power-law regimes, this is the third");

ok("!! making Lambda dilute like matter destroys the constant-H property",
    db.hubbleConstant === false && db.hubbleConstantErr > 1,
    `with Lambda going as a^-3 the Hubble factor is off by ${db.hubbleConstantErr.toExponential(2)} -- a cosmological ` +
    "constant that thinned out with expansion would not be constant, and this key sees it at once");

ok("...and the closure identity stays GREEN, blind to how Lambda scales",
    db.closes === true,
    "Om + Or + Ok + OL = 1 is a definition, untouched by the dilution law -- the same blind identity as in friedmann, " +
    "reused here as the control that the plant is in the Hubble rate and nothing else");

console.log();
if (fails) { console.log("astroparticleBind-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("astroparticleBind-selfcheck: all checks pass");
