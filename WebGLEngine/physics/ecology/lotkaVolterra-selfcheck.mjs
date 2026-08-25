// WebGLEngine/physics/ecology/lotkaVolterra-selfcheck.mjs
//
// Run: node physics/ecology/lotkaVolterra-selfcheck.mjs
// RUNTIME 0.78s MEASURED (median of 3 -- 800/777/779 -- with date(1) around the run). Section 2's run-length
// ladder (50, 200 and 800 cycles x three integrators) dominates it. Measured with date(1), not guessed.
//
// GATES physics/ecology/lotkaVolterra.mjs -- predator and prey, and the reason it earns a place beside kepler:
// its exact keys include one that is FAMOUS FOR BEING COUNTERINTUITIVE AND TRUE.
//
// Killing BOTH species indiscriminately raises the average PREY population. That is Volterra's principle, it
// answers D'Ancona's Adriatic fish puzzle, and it is not an extra assumption -- it falls straight out of the
// time-average theorem, which is itself exact at ANY amplitude. Sections 5 and 6 gate both, and section 6 gets
// its prediction from section 5's theorem rather than from a second formula, so the two cannot drift apart.
//
// *** THE PLANT IS CORRECT ECOLOGY FOR A DIFFERENT MODEL, AND THE MOST INTERESTING KEY HERE CANNOT SEE IT. ***
// A logistic self-limitation on the prey is the standard textbook refinement; it leaves the prey fixed point
// EXACTLY where it was, leaves the period alone to 3e-6, and leaves the time-averaged prey population at 4.000
// -- because the spiral converges to the very point the average is supposed to equal. Section 8 states that
// failure explicitly rather than hoping nobody asks.
"use strict";
import { DEFAULTS, fixedPoint, firstIntegral, smallOscillationPeriod, INTEGRATORS, SYMPLECTIC, ORDER,
         stepSymplectic, integrate, timeAverages, volterraPrinciple, amplitudeDecay, PLANT_SIGMA }
    from "./lotkaVolterra.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
const P = DEFAULTS, FP = fixedPoint(P);

console.log("lotkaVolterra-selfcheck -- do the exact keys hold, including the one that says harvesting helps the prey?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE CLOSED FORMS, AND THE CROSSING THAT MAKES THEM SURPRISING ***");
{
    ok("the fixed point is (gamma/delta, alpha/beta)", FP.x === P.gamma / P.delta && FP.y === P.alpha / P.beta,
        `(${FP.x}, ${FP.y})`);
    // *** NEITHER SPECIES SETS ITS OWN EQUILIBRIUM. *** Doubling the prey's growth rate alpha does not move the
    // prey equilibrium by one part in 1e16 -- it moves the PREDATOR's. That is not intuition, so it is checked.
    const fastPrey = fixedPoint({ ...P, alpha: P.alpha * 2 });
    ok("!! doubling the PREY growth rate leaves the PREY equilibrium bit-identical", fastPrey.x === FP.x,
        `x* ${fastPrey.x} vs ${FP.x} -- what moved is y*: ${FP.y} -> ${fastPrey.y}`);
    const fastPred = fixedPoint({ ...P, gamma: P.gamma * 2 });
    ok("...and doubling the PREDATOR death rate is what moves the prey equilibrium", fastPred.x === 2 * FP.x,
        `x* ${FP.x} -> ${fastPred.x}`);
    ok("the first integral is finite and well-defined at the fixed point",
        Number.isFinite(firstIntegral(FP.x, FP.y, P)));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE FIRST INTEGRAL IS CONSERVED, AND EACH INTEGRATOR FAILS IT DIFFERENTLY ***");
{
    ok("all three integrators are registered and declared in both tables",
        Object.keys(INTEGRATORS).sort().join(",") === "euler,rk4,symplectic" &&
        Object.keys(INTEGRATORS).every((k) => k in SYMPLECTIC && k in ORDER));

    const runs = {};
    for (const k of Object.keys(INTEGRATORS)) runs[k] = integrate({ integrator: k, cycles: 200 });

    ok("!! *** EXPLICIT EULER DOES NOT MERELY DRIFT -- IT DESTROYS THE SYSTEM ***",
        runs.euler.blewUpAtCycle !== null && runs.euler.blewUpAtCycle < 200,
        `populations left the positive quadrant at cycle ${runs.euler.blewUpAtCycle.toFixed(1)}`);
    ok("!! symplectic-in-log keeps the first integral BOUNDED", Math.abs(runs.symplectic.driftGrowthRatio - 1) < 1e-3,
        `ratio ${runs.symplectic.driftGrowthRatio.toFixed(6)}, max|dV| ${runs.symplectic.driftSecondHalf.toExponential(3)}`);
    ok("!! RK4 drifts SECULARLY -- the ratio sits near 2, meaning each half doubles the error",
        runs.rk4.driftGrowthRatio > 1.5, `ratio ${runs.rk4.driftGrowthRatio.toFixed(3)}`);

    // *** THE BOUND DOES NOT MOVE WITH RUN LENGTH, AND THAT IS THE ENTIRE CLAIM. ***
    const lens = [50, 200, 800].map((c) => integrate({ integrator: "symplectic", cycles: c }).driftSecondHalf);
    const spread = Math.max(...lens) / Math.min(...lens);
    ok("!! ...and 16x the run length does not move that bound", spread < 1.01,
        lens.map((v) => v.toExponential(3)).join(" -> ") + `  (spread ${spread.toFixed(5)}x)`);
    const rkLens = [50, 200, 800].map((c) => integrate({ integrator: "rk4", cycles: c }).driftSecondHalf);
    ok("!! ...while RK4's grows roughly in proportion to it", Math.max(...rkLens) / Math.min(...rkLens) > 8,
        rkLens.map((v) => v.toExponential(2)).join(" -> "));

    // AND THE HONEST HALF: RK4 IS STILL THE BETTER CHOICE HERE, BY EIGHT ORDERS OF MAGNITUDE.
    ok("!! HONEST: RK4 is nonetheless FAR more accurate over any run anybody will actually do",
        runs.rk4.driftSecondHalf < runs.symplectic.driftSecondHalf / 1e4,
        `rk4 ${runs.rk4.driftSecondHalf.toExponential(2)} vs symplectic ${runs.symplectic.driftSecondHalf.toExponential(2)}`);
    report("the claim that survives is the SHAPE of the two errors -- one bounded forever, one growing without " +
           "limit -- not a ranking. A gate that only proved 'symplectic wins' would be teaching the wrong lesson");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE SMALL-OSCILLATION PERIOD, AND THE TWO PARAMETERS THAT CANNOT TOUCH IT ***");
{
    const T0 = smallOscillationPeriod(P);
    const near = integrate({ x0: FP.x * 1.001, integrator: "symplectic", cycles: 40, stepsPerCycle: 2000 });
    ok("!! the measured period matches 2*pi/sqrt(alpha*gamma) in the small-amplitude limit",
        near.periodErrFrac < 1e-5, `measured ${near.measuredPeriod.toFixed(9)} vs ${T0.toFixed(9)} (err ${near.periodErrFrac.toExponential(2)})`);

    // beta and delta both MOVE THE FIXED POINT, so each run starts at the same RELATIVE amplitude -- otherwise
    // this would be measuring a different orbit each time and calling the agreement a result.
    const seen = [];
    for (const [beta, delta] of [[P.beta, P.delta], [P.beta * 5, P.delta], [P.beta, P.delta * 30]]) {
        const q = { ...P, beta, delta }, f = fixedPoint(q);
        const r = integrate({ p: q, x0: f.x * 1.001, y0: f.y, integrator: "symplectic", cycles: 40, stepsPerCycle: 2000 });
        seen.push({ beta, delta, T: r.measuredPeriod });
    }
    const spread = Math.max(...seen.map((s) => s.T)) - Math.min(...seen.map((s) => s.T));
    ok("!! *** beta varied 5x and delta 30x leave the period untouched ***", spread / T0 < 1e-6,
        seen.map((s) => `b=${s.beta} d=${s.delta} -> ${s.T.toFixed(6)}`).join("  |  ") + `  spread ${spread.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
console.log("\n4. *** ...AND IT IS A LIMIT, NOT A CONSTANT: THIS CENTRE IS NOT ISOCHRONOUS ***");
{
    const T0 = smallOscillationPeriod(P);
    const amps = [1.001, 1.01, 1.1, 1.5, 2.0, 3.0];
    const Ts = amps.map((a) => integrate({ x0: FP.x * a, integrator: "symplectic", cycles: 40, stepsPerCycle: 2000 }).measuredPeriod / T0);
    let monotone = true;
    for (let i = 1; i < Ts.length; i++) if (Ts[i] <= Ts[i - 1]) monotone = false;
    ok("!! the period GROWS with amplitude, monotonically", monotone,
        amps.map((a, i) => `${a}x -> ${Ts[i].toFixed(6)}`).join("  "));
    ok("...so a period check at the module's own default amplitude is 1% off the closed form, and BOTH are right",
        Ts[amps.indexOf(1.5)] > 1.005 && Ts[amps.indexOf(1.5)] < 1.02, `1.5x gives T/T0 = ${Ts[amps.indexOf(1.5)].toFixed(6)}`);
    report("a harmonic oscillator would give 1.000000 down that row. Asserting the closed form without naming " +
           "an amplitude would be asserting isochrony, which this system does not have");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE TIME-AVERAGE THEOREM: <x> = gamma/delta AND <y> = alpha/beta, AT ANY AMPLITUDE ***");
{
    for (const amp of [1.05, 1.5, 3.0]) {
        const m = timeAverages({ x0: FP.x * amp, cycles: 40 });
        ok(`!! starting at ${amp}x equilibrium, both averages hit the fixed point over whole cycles`,
            m.errX < 1e-5 && m.errY < 1e-4,
            `<x>=${m.meanX.toFixed(8)} (exact ${m.exactX})  <y>=${m.meanY.toFixed(8)} (exact ${m.exactY})  over ${m.cycles} cycles`);
    }
    // *** WHOLE CYCLES ARE LOAD-BEARING. *** The theorem is exact over a closed orbit and merely approximate
    // over any other interval, so a run-length average is a DIFFERENT quantity -- reported separately by
    // integrate() precisely so the two can be compared instead of confused.
    const r = integrate({ x0: FP.x * 3.0, integrator: "symplectic", cycles: 40.5 });
    const trimmed = timeAverages({ x0: FP.x * 3.0, cycles: 40.5 });
    ok("!! averaging a PARTIAL cycle is measurably worse than trimming to whole ones",
        Math.abs(r.runMeanX - FP.x) > Math.abs(trimmed.meanX - FP.x) * 5,
        `run-length mean ${r.runMeanX.toFixed(6)} vs whole-cycle mean ${trimmed.meanX.toFixed(6)}, exact ${FP.x}`);
}

// ---------------------------------------------------------------------------
console.log("\n6. *** VOLTERRA'S PRINCIPLE: HARVEST BOTH SPECIES AND THE PREY AVERAGE GOES UP ***");
{
    const ladder = [0, 0.1, 0.2, 0.3].map((h) => volterraPrinciple({ harvest: h, cycles: 30 }));
    let preyRises = true, predFalls = true;
    for (let i = 1; i < ladder.length; i++) {
        if (!(ladder[i].after.x > ladder[i - 1].after.x)) preyRises = false;
        if (!(ladder[i].after.y < ladder[i - 1].after.y)) predFalls = false;
    }
    ok("!! *** THE AVERAGE PREY POPULATION RISES WITH THE HARVEST RATE, MONOTONICALLY ***", preyRises,
        ladder.map((l) => `h=${l.harvest} -> <x>=${l.after.x.toFixed(3)}`).join("  "));
    ok("!! ...and the average PREDATOR population falls", predFalls,
        ladder.map((l) => `h=${l.harvest} -> <y>=${l.after.y.toFixed(3)}`).join("  "));

    // *** THE PREDICTION IS FALSIFIABLE BECAUSE THE SIMULATION IS RUN AND AVERAGED, NOT BECAUSE THE ALGEBRA IS
    // RESTATED. *** predicted comes from the time-average theorem on the harvested parameters; measured comes
    // from integrating those parameters and averaging over whole cycles. Nothing links them but the physics.
    const v = ladder[2];
    ok("!! ...and a real integration of the harvested system lands on the predicted averages",
        v.measuredErrX < 1e-5 && v.measuredErrY < 1e-4,
        `predicted (${v.after.x.toFixed(4)}, ${v.after.y.toFixed(4)}) measured (${v.measured.x.toFixed(6)}, ${v.measured.y.toFixed(6)})`);
    ok("...at h=0.2 the prey average is up by exactly half", Math.abs(v.preyFactor - 1.5) < 1e-12,
        `factor ${v.preyFactor}`);

    let threw = false;
    try { volterraPrinciple({ harvest: 2 }); } catch { threw = true; }
    ok("a harvest that exceeds the prey growth rate is REFUSED rather than averaged", threw,
        "past alpha the system collapses and there is no cycle to average over -- returning a number there " +
        "would be the most confident kind of wrong");
}

// ---------------------------------------------------------------------------
console.log("\n7. *** THE GROWTH RATIO CANNOT RANK A CATASTROPHE, SO IT REFUSES TO TRY ***");
{
    const e = integrate({ integrator: "euler", cycles: 200 });
    ok("!! explicit Euler's drift ratio is NaN, not the 0.000 a truncated run would compute",
        Number.isNaN(e.driftGrowthRatio),
        "it died at cycle " + e.blewUpAtCycle.toFixed(1) + " of 200, so the second half never ran and maxSecond " +
        "stayed 0 -- a PERFECT bounded score for the method that destroyed the ecosystem");
    ok("...and NaN cannot be sorted ahead of anything", !(e.driftGrowthRatio < 1) && !(e.driftGrowthRatio > 1));
    ok("...while blewUpAtCycle carries the fact the ratio cannot",
        e.blewUpAtCycle !== null && integrate({ integrator: "symplectic", cycles: 200 }).blewUpAtCycle === null);
}

// ---------------------------------------------------------------------------
console.log("\n8. *** THE PLANT: CORRECT ECOLOGY FOR A DIFFERENT MODEL, AND WHAT IT DOES NOT MOVE ***");
{
    const S = PLANT_SIGMA;
    // ---- what it leaves alone. Each of these is a check somebody would plausibly run, and each one passes.
    ok("!! the PREY fixed point is bit-identical under the plant", fixedPoint(P).x === FP.x,
        "sigma never appears in x* = gamma/delta, so a fixed-point check cannot see the plant at all");
    // *** THE PERIOD DOES SHIFT, AND MY FIRST ESTIMATE OF THE SHIFT WAS 55x TOO SMALL. *** I predicted ~0.01%
    // from the sigma^2 damping correction while HOLDING y* FIXED. The planted Jacobian at its own fixed point
    // is [[-sigma*x*, -beta*x*], [delta*y*, 0]], and the dominant effect is that y* ITSELF MOVED inside the
    // determinant. This gate asserts the CLOSED FORM rather than a tolerance, so it cannot be satisfied by a
    // guess -- and the honest headline is that the shift is 0.93%, the size a real observer writes off.
    const xs = P.gamma / P.delta, ysPlanted = (P.alpha - S * xs) / P.beta;
    const wd = Math.sqrt(P.beta * P.delta * xs * ysPlanted - S * S * xs * xs / 4);
    const Tpred = 2 * Math.PI / wd;
    const plaT = integrate({ x0: xs * 1.001, y0: ysPlanted, cycles: 40, stepsPerCycle: 4000, sigma: S }).measuredPeriod;
    ok("!! the planted period matches the closed form for ITS OWN moved fixed point",
        Math.abs(plaT - Tpred) / Tpred < 1e-4,
        `measured ${plaT.toFixed(9)} vs predicted ${Tpred.toFixed(9)} (${(Math.abs(plaT - Tpred) / Tpred).toExponential(2)})`);
    const T0 = smallOscillationPeriod(P);
    const naiveShift = (2 * Math.PI / Math.sqrt(P.alpha * P.gamma - S * S * xs * xs / 4) - T0) / T0;
    ok("!! ...and the shift comes from the MOVED y*, not from the damping term -- which is where I first looked",
        (Tpred - T0) / T0 > 20 * naiveShift,
        `real shift ${((Tpred - T0) / T0 * 100).toFixed(3)}% vs ${(naiveShift * 100).toFixed(4)}% if y* were held fixed`);
    ok("...so the period is a WEAK detector: under one percent, which is parameter noise in any real setting",
        (Tpred - T0) / T0 < 0.02, `${((Tpred - T0) / T0 * 100).toFixed(3)}%`);

    // *** AND THE TIME-AVERAGE THEOREM GETS MORE RIGHT THE LONGER YOU LOOK, WHICH IS WORSE THAN INSENSITIVE. ***
    const conv = [20, 100, 400].map((c) => timeAverages({ cycles: c, sigma: S }).errX);
    let shrinking = true;
    for (let i = 1; i < conv.length; i++) if (!(conv[i] < conv[i - 1])) shrinking = false;
    ok("!! *** THE BEST KEY THIS MODULE HAS CONVERGES BACK ONTO THE PLANTED SYSTEM AS THE RUN GROWS ***",
        shrinking && conv[conv.length - 1] < 5e-4,
        `planted <x> error: ` + conv.map((v, i) => `${[20, 100, 400][i]}cyc ${v.toExponential(2)}`).join(" -> ") +
        ` -- the spiral settles onto the very point the average must equal, so running LONGER hides the plant better`);

    // ---- and what it destroys.
    const nomV = integrate({ cycles: 200 }).driftSecondHalf;
    const plaV = integrate({ cycles: 200, sigma: S }).driftSecondHalf;
    ok("!! the first integral STOPS being integral", plaV > 50 * nomV,
        `nominal ${nomV.toExponential(2)} planted ${plaV.toExponential(2)} -- ${(plaV / nomV).toFixed(0)}x`);
    const nomA = amplitudeDecay({ cycles: 60 }), plaA = amplitudeDecay({ cycles: 60, sigma: S });
    ok("!! *** AND THE ORBIT CLOSES ON THE HONEST MODEL AND SPIRALS IN ON THE PLANTED ONE ***",
        Math.abs(nomA.ratio - 1) < 1e-3 && plaA.ratio < 0.05,
        `last/first prey amplitude: nominal ${nomA.ratio.toFixed(7)} planted ${plaA.ratio.toExponential(3)}`);
    report("the amplitude detector is only readable because the stepper is KNOWN not to damp -- section 2's " +
           "ratio of 1.000 at 800 cycles is what licenses reading a decay as the MODEL rather than the METHOD");
}

// ---------------------------------------------------------------------------
console.log("\n9. *** SABOTAGE: EACH FINDING MUST BE ABLE TO FAIL ***");
{
    // (a) swap the two lines of the symplectic stepper -- it becomes explicit Euler in log space, and the
    // conservation claim must die. Same sabotage shape kepler uses, and for the same reason: the "broken"
    // version is a real integrator, so a check that survived it would be reading the name, not the arithmetic.
    const sabotaged = (x, y, dt, p) => {
        let u = Math.log(x), v = Math.log(y);
        const uOld = u;
        u = u - dt * (p.beta * Math.exp(v) - p.alpha);      // prey FIRST, on the OLD predator
        v = v + dt * (p.delta * Math.exp(uOld) - p.gamma);
        return [Math.exp(u), Math.exp(v)];
    };
    const runWith = (step) => {
        let x = FP.x * 1.5, y = FP.y; const V0 = firstIntegral(x, y, P);
        const dt = smallOscillationPeriod(P) / 400; let f = 0, s = 0; const total = 400 * 200, half = total >> 1;
        for (let i = 0; i < total; i++) { [x, y] = step(x, y, dt, P);
            const e = Math.abs(firstIntegral(x, y, P) - V0);
            if (i < half) f = Math.max(f, e); else s = Math.max(s, e); }
        return { max: s, ratio: s / f };
    };
    const good = runWith(stepSymplectic), bad = runWith(sabotaged);
    ok("!! SABOTAGE: swapping the symplectic stepper's two lines breaks the bounded-drift claim",
        Math.abs(good.ratio - 1) < 1e-3 && bad.ratio > 1.01,
        `real ratio ${good.ratio.toFixed(6)} vs swapped ${bad.ratio.toFixed(6)} (max|dV| ${bad.max.toExponential(2)})`);

    // (b) a plant that moved nothing would be no plant at all
    const nomA = amplitudeDecay({ cycles: 60 }).ratio, zeroA = amplitudeDecay({ cycles: 60, sigma: 0 }).ratio;
    ok("SABOTAGE: sigma = 0 really is the honest model -- it reproduces the nominal run exactly", nomA === zeroA);

    // (c) the Volterra direction must be a measurement, not a tautology: reverse the harvest and it must reverse
    const up = volterraPrinciple({ harvest: 0.2, cycles: 20 });
    const down = volterraPrinciple({ p: { ...P, alpha: P.alpha + 0.2, gamma: P.gamma - 0.2 }, harvest: 0.2, cycles: 20 });
    ok("!! SABOTAGE: undoing the harvest on the parameters returns the averages to where they started",
        Math.abs(down.after.x - FP.x) < 1e-12 && Math.abs(down.after.y - FP.y) < 1e-12,
        `back to (${down.after.x}, ${down.after.y}) from the harvested (${up.after.x.toFixed(3)}, ${up.after.y.toFixed(3)})`);
}

// ---------------------------------------------------------------------------
console.log("\n10. *** BROWSER-SAFE ***");
{
    const src = (await import("node:fs")).readFileSync(new URL("./lotkaVolterra.mjs", import.meta.url), "utf8");
    ok("imports nothing and touches no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("\nlotkaVolterra-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
