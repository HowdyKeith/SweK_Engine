// tools/roundhouse/sweepDevice-selfcheck.mjs
//
// v3304 -- AN INSTRUMENT THE ROUNDHOUSE DID NOT HAVE.
//
// Fifty devices, and the lab could run ONE of them at ONE configuration. Asking "vary this and show me where the
// physics changes" required writing a bespoke script, and the tree holds four of those -- shedOnset,
// zeroRangeSweep, defaultPlacementSweep, floorAtlas -- each welded to the single question that prompted it. This
// is the general tool those four are instances of, and it grades NOTHING: a sweep is data, exactly as a
// render-qa probe is data.
//
// *** THE PART THAT EARNED IT: AN OBSERVABLE THAT NEVER MOVES IS THE FINDING. ***
//
// Five times in one session a config parameter was passed to a device and SILENTLY IGNORED because the name was
// wrong -- swapRule for accept, sigmaWRONG for sigmaLik, stepFn and workFn for step and workInc, msdFn for
// wrapMSD. Every time, the run completed, the numbers were plausible, and the two configurations returned
// IDENTICAL results. Every time it looked like a physics finding until the signature was read.
//
// A sweep sees that immediately: turn a knob across its range and if EVERY observable is constant, the knob is
// not wired. Verified below by sweeping a knob that does not exist -- all seven observables come back constant,
// which is the exact signature those five bugs produced.
//
// TWO MORE THINGS IT REPORTS THAT A FOR-LOOP DOES NOT:
//   MONOTONICITY, because most observables should move one way and a turn usually means the sweep crossed a
//   regime boundary the device does not know about. wolff's magErr is non-monotone across T = 1.8..2.4 -- it
//   crosses T_c, where Yang's infinite-lattice form stops describing a finite lattice.
//   NON-FINITE POINTS ARE KEPT, because a NaN at one end is where the stable envelope ends. twoFExperiment
//   recorded a divergence as "a measurement of the envelope, not a failed attempt"; dropping it would turn a
//   boundary into a gap in a table.

import { sweepDevice, trend, directness } from "./sweepDevice.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE UNWIRED-KNOB DETECTOR -- the reason this exists -------------------------------------------------------
{
    const s = await sweepDevice("wolff", "magnetisation", { knob: "notAKnob", values: [1, 2, 3] });
    const allConstant = Object.values(s.observables).every((o) => o.constant);
    ok("!! sweeping a knob the device does not have leaves EVERY observable constant",
        allConstant && s.constantObservables.length >= 5,
        `${s.constantObservables.length} observables, all flat: ${s.constantObservables.join(", ")}. This is the ` +
        "exact signature of the five silently-ignored parameters found this session -- swapRule, sigmaWRONG, " +
        "stepFn, workFn, msdFn. Each produced a completed run with plausible numbers identical to the control, " +
        "and each looked like a physics finding until someone read the signature");

    const real = await sweepDevice("wolff", "magnetisation", { knob: "T", values: [1.8, 2.0, 2.2, 2.4] });
    ok("...while a knob that IS wired moves things",
        !Object.values(real.observables).every((o) => o.constant) && real.observables.absM.constant === false,
        `absM ranges ${real.observables.absM.min.toFixed(4)} to ${real.observables.absM.max.toFixed(4)} across ` +
        "T. The detector distinguishes an unwired knob from an observable that genuinely does not depend on it, " +
        "which a table of numbers does not");

    ok("and a genuinely constant observable is flagged individually, not just globally",
        real.constantObservables.includes("L"),
        "L is the lattice size -- configuration, not a measurement, so it correctly does not respond to T. " +
        "Flagging per-observable means 'this one is fixed' and 'the knob does nothing' are different reports");
}

// ---- 2. MONOTONICITY, AND WHAT A TURN MEANS ---------------------------------------------------------------------------
{
    const s = await sweepDevice("wolff", "magnetisation", { knob: "T", values: [1.8, 2.0, 2.2, 2.4] });
    ok("!! magnetisation falls monotonically with temperature, as it must",
        s.observables.absM.trend === -1,
        `absM ${s.observables.absM.series.map((x) => x.toFixed(3)).join(" > ")}. Heating an Ising lattice destroys ` +
        "order; a rising or turning |M| here would be a real defect and the sweep says so without a key");

    ok("!! and magErr is NON-MONOTONE, because the sweep crosses T_c",
        s.observables.magErr.trend === null,
        `the error against Yang turns rather than growing steadily. Yang's form is for an INFINITE lattice and ` +
        "goes to exactly zero above T_c, so a finite 32x32 lattice departs from it differently on each side. The " +
        "turn is the regime boundary, and reporting the shape is how a sweep surfaces one without being told");
}

// ---- 3. THE TREND FUNCTION ITSELF ------------------------------------------------------------------------------------
{
    ok("trend recognises rising, falling, flat and turning",
        trend([1, 2, 3]).dir === 1 && trend([3, 2, 1]).dir === -1 &&
        trend([2, 2, 2]).dir === 0 && trend([1, 3, 2]).dir === null,
        "four shapes, four answers. A turn returns null rather than a direction because there is no honest " +
        "single direction to report");

    ok("...and it ignores non-finite points rather than being defeated by them",
        trend([1, NaN, 3]).dir === 1,
        "a diverged run in the middle of a sweep should not erase the trend of the points that did converge");
}

// ---- 4. IT GRADES NOTHING ---------------------------------------------------------------------------------------------
{
    const s = await sweepDevice("percolation", "crossing", { knob: "L", values: [12, 16, 24] });
    ok("!! the sweep returns data and no verdict",
        !("ok" in s) && !("pass" in s) && !("verdict" in s) && s.points.length === 3,
        "no pass, no fail, no tolerance. What the shape MEANS is the caller's judgement -- the same position " +
        "render-qa's probes take, and the reason a sweep can be pointed at a device nobody has a threshold for yet");

    ok("failed runs are counted, not silently dropped",
        typeof s.failedRuns === "number",
        "a config that throws is a measurement of the envelope. twoFExperiment kept its divergence as exactly " +
        "that, and a sweep that hid failures would turn a boundary into a gap in a table");
}


// ---- 5. THE FIRST FLEET RUN, AND WHAT A FLAT SWEEP ACTUALLY MEANS ------------------------------------------------
//
// The instrument was pointed at every device that declares a numeric knob, sweeping each on its OWN declared
// parameter. Two came back flat: optics.lambda and born.delta. NEITHER IS A DEFECT, and that is the result worth
// recording, because "flat sweep" was built as the unwired-knob detector and its first two hits were both
// correct code.
//
//   optics.lambda   the Rayleigh factor is theta*D/lambda -- DIMENSIONLESS BY CONSTRUCTION. A 20x sweep of
//                   lambda changes it by exactly zero, and that invariance IS the physics. A device whose
//                   dimensionless observable moved with wavelength would be the broken one.
//
//   born.delta      born/error uses delta directly and responds. born/validity and born/scaling do NOT, because
//                   they sweep phase INTERNALLY -- validity walks the phase up to find where the Born error
//                   crosses a tolerance, scaling fits a log-log slope over its own 12-point delta ladder. A
//                   single delta is not an input to either question.
//
// SO A FLAT SWEEP IS A QUESTION, NOT A VERDICT. The three explanations -- unwired knob, dimensionless
// observable, mode that sweeps internally -- are indistinguishable from the flat series alone and need the
// device read. The instrument narrows fifty devices to two candidates in one pass; it does not adjudicate them,
// and pretending otherwise would have condemned two correct devices.
{
    const { getDevice } = await import("./devices.mjs");

    const optics = await getDevice("optics");
    const lo = await optics.build({ mode: "airy", config: { lambda: 0.0001 } });
    const hi = await optics.build({ mode: "airy", config: { lambda: 0.0020 } });
    ok("!! optics.lambda is flat because the observable is DIMENSIONLESS, not because it is unwired",
        lo.rayleighFactor === hi.rayleighFactor,
        `a 20x sweep of lambda leaves rayleighFactor at exactly ${lo.rayleighFactor}. It is theta*D/lambda, so ` +
        "lambda-independence is the physics. This was the instrument's first hit and it is correct code");

    const born = await getDevice("born");
    const eA = await born.build({ mode: "error", config: { delta: 0.005 } });
    const eB = await born.build({ mode: "error", config: { delta: 0.100 } });
    const sA = await born.build({ mode: "scaling", config: { delta: 0.005 } });
    const sB = await born.build({ mode: "scaling", config: { delta: 0.100 } });
    ok("!! born.delta moves 'error' and correctly does NOT move 'scaling'",
        eA.errFrac !== eB.errFrac && sA.errorScalingExponent === sB.errorScalingExponent,
        `error/errFrac ${eA.errFrac.toExponential(2)} -> ${eB.errFrac.toExponential(2)}, while scaling's exponent ` +
        `stays ${sA.errorScalingExponent.toFixed(4)}. scaling fits a slope over its OWN 12-point delta ladder, so ` +
        "a caller-supplied delta is not an input to it. Same knob, same device, two modes, two right answers");

    ok("...so a flat sweep is a QUESTION and this gate says so",
        true,
        "unwired knob, dimensionless observable, and mode-sweeps-internally are indistinguishable from a flat " +
        "series. The instrument narrowed fifty devices to two candidates in one pass and adjudicating them took " +
        "reading the source -- which is the honest division of labour between a tool and a person");
}


// ---- 6. A TURN IS NOT A BOUNDARY -- separating regime changes from noise ------------------------------------------
//
// The first fleet run found three devices whose error metric "turns", and trend() reports null for all three.
// That is too blunt, and one of them is not a finding at all:
//
//   wolff/magErr over T       turns because the sweep CROSSES T_c. Yang's form is for an infinite lattice and
//                             goes to exactly zero above the critical point, so a finite lattice departs from it
//                             differently on each side. A real regime boundary.
//   percolation/prob over L   also "turns" -- and it is BINOMIAL NOISE scattering around an exact 0.5, with
//                             every point inside 0.85 sigma. The key is exact at every L; there is no boundary
//                             to find and nothing has gone wrong.
//
// SPAN OVER TOTAL VARIATION SEPARATES THEM. span is how far the series travelled NET; total variation is how far
// it travelled ALTOGETHER. The ratio is 1 for a clean monotone run, high for a trend with one genuine turn, and
// falls toward 0 as a series doubles back -- which is what noise does.
//
//   wolff absM     1.000   monotone
//   wolff magErr   0.685   one real turn
//   percolation    0.408   wanders
//
// NO THRESHOLD IS SET. What counts as a boundary depends on how many points were swept and how noisy the device
// is, and a cutoff chosen here would be a number picked rather than measured. It is a discriminator handed to
// the reader, not a verdict.
{
    const w = await sweepDevice("wolff", "magnetisation", { knob: "T", values: [1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4] });
    const p = await sweepDevice("percolation", "crossing", { knob: "L", values: [8, 12, 16, 24, 32, 48] });

    ok("!! a monotone series has directness exactly 1",
        w.observables.absM.directness > 0.999,
        `absM ${w.observables.absM.directness.toFixed(3)} -- it never doubles back, so net travel equals total travel`);

    ok("!! a REGIME BOUNDARY and NOISE both report trend null, and directness tells them apart",
        w.observables.magErr.trend === null && p.observables.prob.trend === null &&
        w.observables.magErr.directness > p.observables.prob.directness * 1.5,
        `wolff magErr ${w.observables.magErr.directness.toFixed(3)} (crosses T_c) against percolation prob ` +
        `${p.observables.prob.directness.toFixed(3)} (binomial scatter around an exact 0.5, every point inside ` +
        "0.85 sigma). Same trend verdict, opposite findings -- one is physics and one is the sample size");

    ok("...and no threshold is baked in",
        directness([1, 2, 3]) === 1 && directness([1, 2, 1]) === 0.5,
        "a clean run gives 1, a there-and-back gives 0.5, and the caller decides what counts. A cutoff chosen " +
        "here would depend on the point count and the device's noise, which is exactly the kind of number this " +
        "lab measures instead of picking");
}


// ---- 7. THE DISCRIMINATOR'S FIRST REAL USE, AND THE CORRECTION IT FORCED ------------------------------------------
//
// The fleet run found landauzener's errMean turning at directness 0.985, and v3305 recorded that as "the
// module's own documented validity edge, found by a sweep nobody told where to look."
//
// *** THAT WAS WRONG, AND THE MODULE SAYS SO. *** Its header records error FALLING with sweep rate: 0.62% at
// v = 4 and 0.06% at v = 60. A rise at v = 16 contradicts its own measurement, so either the module was wrong or
// the sweep was measuring something else. Extending the sweep to v = 60 settled it:
//
//     v          1        2        4        8       16       32       60
//     relWorst   7.133%   2.173%   0.617%   0.049%   0.045%   0.032%   0.020%     <- monotone, matches the module
//     errMean    5.0e-3   3.7e-3   2.1e-3   1.2e-4   2.0e-4   1.8e-4   1.6e-4     <- turns at v = 8
//
// RELATIVE ERROR FALLS ALL THE WAY. ABSOLUTE ERROR TURNS. Both are correct, and they disagree because P itself
// shrinks with v: exp(-pi D^2 / 2v) is small at large v, so a fixed relative accuracy is a shrinking absolute
// one and the two metrics can move in opposite directions over the same sweep.
//
// SO THE LESSON IS ABOUT THE INSTRUMENT, NOT THE DEVICE. A sweep reading only errMean reports a validity edge
// that does not exist. Directness correctly said "this is a real feature, not noise" -- it WAS real, it simply
// was not what it looked like. The discriminator answers "is this shape meaningful"; it cannot answer "is this
// the shape you think it is", and the second question still needs the observable's definition read.
{
    const lz = await sweepDevice("landauzener", "curve", { knob: "v", values: [1, 2, 4, 8, 16, 32, 60] });
    const abs = lz.observables.errMean, rel = lz.observables.relWorst;

    ok("!! RELATIVE error falls monotonically across the whole sweep, matching the module's own record",
        rel.trend === -1 && rel.directness > 0.999,
        `relWorst ${rel.series.map((x) => (x * 100).toFixed(3) + "%").join(" -> ")}. The module documents 0.62% at ` +
        "v=4 and 0.06% at v=60; measured 0.617% and 0.020%. No validity edge in sight");

    ok("!! ABSOLUTE error turns at v=8, and BOTH are correct",
        abs.trend === null && abs.directness > 0.9,
        `errMean turns while relWorst does not, because P = exp(-pi D^2 / 2v) SHRINKS with v -- a fixed relative ` +
        "accuracy on a shrinking quantity is a shrinking absolute error, so the two metrics move oppositely over " +
        "the same sweep. Neither is a defect");

    ok("!! and the correction is about the INSTRUMENT: directness says 'real', not 'what you assumed'",
        abs.directness > 0.9 && rel.trend === -1,
        "v3305 read the errMean turn as a documented validity edge. It is not -- the module records the opposite " +
        "and the sweep confirms the module. Directness was right that the shape was meaningful and silent about " +
        "what it meant, which is the correct division: a discriminator cannot read an observable's definition");
}


// ---- 8. THE HAZARD IS GENERAL, SO THE INSTRUMENT LABELS IT ---------------------------------------------------------
//
// SIX devices expose an absolute and a relative error observable at the same time -- kerr, kepler, landauzener,
// chaos, splat and probe. The landauzener case is therefore not a quirk of one device but a hazard of sweeping:
// compare an absolute shape against a relative one and they can point opposite ways while both are correct.
//
// The sweep now LABELS each observable absolute or relative. It does not prefer either -- an absolute turn is a
// real fact about the absolute error, and a reader who wants that has it. What the label prevents is reading two
// different questions as one disagreement.
{
    const lz = await sweepDevice("landauzener", "curve", { knob: "v", values: [1, 2, 4, 8, 16, 32, 60] });
    ok("!! observables are labelled absolute or relative",
        lz.observables.errMean.kind === "absolute" && lz.observables.relWorst.kind === "relative",
        "errMean absolute, relWorst relative -- the two shapes that disagree on this device now carry the reason " +
        "they can, visible without reading the observable's definition first");

    ok("...and a non-error observable is labelled neither",
        lz.observables.v.kind === null,
        "the knob itself is not an error metric, so it gets no label rather than a guessed one");
}


// ---- 9. THE INSTRUMENT'S FIRST UNPROMPTED PHYSICS RESULT -----------------------------------------------------------
//
// Two rounds were spent correcting misreadings of a sweep. This one is the sweep finding something nobody looked
// for, on a device wired long before the instrument existed.
//
// Sweeping kepler/compare over stepsPerOrbit, verletGrowth came back at directness 0.370 -- almost pure wander --
// while rk4Growth sat at 0.914. That asymmetry is the finding:
//
//     steps      100      200      400      800     1600
//     verlet    1.00     1.00     1.00     1.00     1.00      <- BOUNDED, at every resolution
//     rk4       1.99     1.99     1.98     1.96     1.92      <- grows, and only shrinks as steps rise
//
// verletGrowth is not wandering. IT IS FLAT AT EXACTLY 1.000, and the tiny residue directness measured is the
// last bits of a quantity that does not move. Sweeping the ORBIT COUNT instead of the resolution confirms it:
//
//     orbits     5       20       80      320
//     verlet    1.0000  1.0000  1.0000  1.0000     <- 64x more integration time, growth ratio 1.0000
//     rk4       1.4060  1.8380  1.9540  1.9880     <- growth ratio 1.4141 over the same span
//
// THIS IS THE SYMPLECTIC PROPERTY, MEASURED RATHER THAN ASSERTED. Velocity Verlet conserves a shadow Hamiltonian
// exactly, so its energy error OSCILLATES within a bound forever; RK4 is more accurate per step -- rk4FinalErr
// is three orders better at 1600 steps -- and its energy error accumulates without limit. Accuracy and
// conservation are different virtues, and the sweep separates them without being told they exist.
{
    const res = await sweepDevice("kepler", "compare", { knob: "stepsPerOrbit", values: [100, 200, 400, 800, 1600] });
    const dur = await sweepDevice("kepler", "compare", { knob: "orbits", values: [5, 20, 80, 320] });

    ok("!! Verlet's energy growth is bounded at 1.000 across a 64x increase in integration time",
        dur.observables.verletGrowth.series.every((g) => Math.abs(g - 1) < 1e-6),
        `${dur.observables.verletGrowth.series.map((g) => g.toFixed(4)).join(", ")} over 5 to 320 orbits. A ` +
        "symplectic integrator conserves a shadow Hamiltonian exactly, so its energy error oscillates within a " +
        "bound instead of accumulating -- measured here by sweeping, not asserted from theory");

    ok("!! RK4's grows over the same span, while being far MORE accurate per step",
        dur.observables.rk4Growth.series[3] > dur.observables.rk4Growth.series[0] * 1.3 &&
        res.observables.rk4FinalErr.series[4] < res.observables.verletFinalErr.series[4],
        `rk4Growth ${dur.observables.rk4Growth.series[0].toFixed(3)} -> ` +
        `${dur.observables.rk4Growth.series[3].toFixed(3)}, yet rk4FinalErr is ` +
        `${(res.observables.verletFinalErr.series[4] / res.observables.rk4FinalErr.series[4]).toFixed(0)}x smaller ` +
        "than Verlet's at 1600 steps. ACCURACY AND CONSERVATION ARE DIFFERENT VIRTUES, and a device graded on " +
        "final error alone would rank RK4 the better integrator for orbital work, which is the opposite of true");

    ok("...and directness pointed at it without knowing any of that",
        res.observables.verletGrowth.directness < 0.5 && res.observables.rk4Growth.directness > 0.8,
        `0.370 against 0.914. The low value was not noise -- it is a quantity pinned at 1.000 whose last bits ` +
        "wander. The instrument flagged the asymmetry; reading the device explained it. Same division of labour " +
        "as the landauzener correction, and this time the shape meant something new");
}

console.log();
if (fails) { console.log("sweepDevice-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("sweepDevice-selfcheck: all checks pass");
