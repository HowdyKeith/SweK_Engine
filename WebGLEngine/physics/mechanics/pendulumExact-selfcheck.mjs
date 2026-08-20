// WebGLEngine/physics/mechanics/pendulumExact-selfcheck.mjs -- v3625
//
// Run: node physics/mechanics/pendulumExact-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GRADES AN INTEGRATOR WITH A CLOSED FORM, which is the only direction that proves anything. T = 4 sqrt(L/g) K(m)
// with m = sin^2(theta0/2) is a function of ONE ANGLE -- no grid, no timestep, no machine -- so RK4 is the thing
// on trial and the elliptic integral is the judge. The discriminator needs no chosen tolerance: the small-angle
// prediction is wrong by an amount that GROWS WITH AMPLITUDE, from 0.06% at 0.1 rad to tens of percent at 3 rad,
// so the fixture separates the two predictions by itself.
//
// AND IT ENDS ON A SHIPPED CLAIM. physics/pendulumWave.js re-synchronises "to the bit" because it integrates
// SIMPLE HARMONIC MOTION exactly. A real pendulum is not harmonic. Section 3 measures what that costs, section 4
// is the control that says why the demo survives it anyway, and section 5 turns it into a tolerance the demo
// never had. NOTHING IN pendulumWave.js IS EDITED BY THIS ROUND -- it is correct about the equation it solves,
// and section 6 asserts that it still solves that one, so a future rewrite to a nonlinear stepper turns this
// section red and gets rewritten rather than deleted.

import { readFileSync } from "node:fs";
import {
    pendulumPeriod, pendulumPeriodFactor, integratePendulum,
    trueWaveRow, phaseSpread, trueCycle, amplitudeTolerance,
} from "./pendulumExact.mjs";
import { makePendulumWave } from "../pendulumWave.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (got, want) => Math.abs(got - want) / Math.max(Math.abs(want), 1e-300);

// --- 1. the key against a real integration ---------------------------------------------------------------------
{
    say("1. THE CLOSED FORM GRADES RK4. Predicted 4 sqrt(L/g) K(sin^2(theta0/2)) vs the measured return time.");
    const T0 = 2 * Math.PI / Math.sqrt(9.80665);
    let worstExact = 0, smallest = Infinity, largest = 0, worstDrift = 0;
    for (const th of [0.1, 0.3, 1.0, 2.0, 3.0]) {
        const P = pendulumPeriod({ theta0: th });
        const r = integratePendulum({ theta0: th, dt: 1e-4 });
        const eExact = rel(r.period, P), eSmall = rel(r.period, T0);
        worstExact = Math.max(worstExact, eExact);
        smallest = Math.min(smallest, eSmall); largest = Math.max(largest, eSmall);
        worstDrift = Math.max(worstDrift, r.energyDrift);
        say("     theta0 " + th.toFixed(2) + "   predicted " + P.toFixed(9) + "   measured " + r.period.toFixed(9) +
            "   rel " + eExact.toExponential(3) + "   small-angle is out by " + (100 * eSmall).toFixed(3) + "%");
    }
    ok("the elliptic prediction lands on the measured period at every amplitude", worstExact < 1e-11,
        "worst rel " + worstExact.toExponential(3) + " over 0.1 to 3.0 rad");
    ok("!! the small-angle prediction FAILS, and by more as the amplitude grows", smallest < 1e-3 && largest > 0.5,
        "from " + (100 * smallest).toFixed(3) + "% at 0.1 rad to " + (100 * largest).toFixed(1) + "% at 3.0 rad");
    ok("the integrator earns the right to be a witness: energy is conserved to round-off", worstDrift < 1e-12,
        "worst relative energy drift " + worstDrift.toExponential(2));
    say("   THE SECOND LINE IS THE LOAD-BEARING NEGATIVE: a fixture at 0.1 rad alone would pass BOTH predictions,");
    say("   so a small-amplitude-only test could not tell an exact period from an approximate one.");
}

// --- 2. the timestep is not doing the work ----------------------------------------------------------------------
{
    say("2. REFINEMENT. RK4 is 4th order, so halving dt should cut the error ~16x until round-off takes over.");
    const P = pendulumPeriod({ theta0: 2.0 });
    const errs = [4e-3, 2e-3, 1e-3].map((dt) => rel(integratePendulum({ theta0: 2.0, dt }).period, P));
    const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
    say("     errors " + errs.map((e) => e.toExponential(2)).join("  ") + "   orders " + orders.map((o) => o.toFixed(3)).join(", "));
    ok("the measured convergence order is 4, DERIVED not typed", orders.every((o) => o > 3.6 && o < 4.6),
        "so the agreement in section 1 is the integrator converging on the closed form, not a coincidence at one dt");
    const floor = rel(integratePendulum({ theta0: 2.0, dt: 2.5e-4 }).period, P);
    ok("!! and it STOPS converging at ~1e-13, which is round-off and not the method", floor > 1e-14 && floor < 1e-11,
        "dt 2.5e-4 reads " + floor.toExponential(3) + ", no better than dt 1e-3 -- the sweep is deliberately stopped above it");
    say("   THE CROSSING LOCATOR HAD TO BE FIXED BEFORE THIS COULD BE MEASURED AT ALL: with LINEAR interpolation the");
    say("   error is non-monotone (1.22e-9, 1.65e-9, 6.51e-11, 1.34e-11) and an order fitted through it reads -0.44,");
    say("   because an O(dt^2) crossing estimate had become the accuracy floor of an O(dt^4) integrator.");
}

// --- 3. THE SHIPPED CLAIM. What the harmonic assumption costs pendulumWave.js -------------------------------------
{
    say("3. physics/pendulumWave.js RE-SYNCHRONISES TO THE BIT -- of the equation it solves. Here is the real one.");
    const wave = makePendulumWave({});                       // the shipped defaults: N 15, k 20, cycle 60, amp 0.3
    const f = pendulumPeriodFactor(wave.amp);
    const tc = trueCycle({ cycle: wave.cycle, amp: wave.amp });
    const trueRow = trueWaveRow({ N: wave.N, k: 20, cycle: wave.cycle, amp: wave.amp });
    const atNominal = phaseSpread(trueRow, wave.cycle), atTrue = phaseSpread(trueRow, tc);
    say("     amp " + wave.amp + " rad  ->  every pendulum runs " + (100 * (f - 1)).toFixed(3) + "% slow");
    say("     the row is in step at t = " + tc.toFixed(4) + " s, NOT at its own nominal cycle of " + wave.cycle + " s");
    ok("at the NOMINAL cycle the real row is visibly out of step", atNominal > 0.4,
        "phase spread " + atNominal.toFixed(4) + " rad across the row");
    ok("at the PREDICTED true cycle it is in step to round-off", atTrue < 1e-12,
        "phase spread " + atTrue.toExponential(3) + " rad -- and the predicted time carries nothing fitted, only K");
    ok("the stretch is the elliptic factor and nothing else", rel(tc / wave.cycle, f) < 1e-15,
        "trueCycle / cycle = K(sin^2(amp/2))/(pi/2) = " + f.toFixed(9));
}

// --- 4. THE CONTROL: find the regime where the effect must vanish, and show it vanishing ---------------------------
{
    say("4. WHY THE DEMO SURVIVES IT. Equal amplitudes take equal stretches, so the RATIOS are untouched.");
    const row = trueWaveRow({}).row;
    const spreadOfFactors = Math.max(...row.map((p) => p.factor)) - Math.min(...row.map((p) => p.factor));
    ok("every pendulum's period factor is identical to the last bit", spreadOfFactors === 0,
        "so the row is not detuned -- it is CLOCKED SLOWER, which is a different claim");
    const ratios = row.map((p) => p.T / row[0].T), nominal = row.map((p) => p.T0 / row[0].T0);
    ok("the frequency ratios are exactly the shipped ones", ratios.every((r, i) => rel(r, nominal[i]) < 1e-15),
        "the pattern between re-syncs is unchanged; only the clock moved");
    ok("...and the pattern is therefore periodic on the TRUE cycle too", (() => {
        const w = trueWaveRow({});
        return phaseSpread(w, 2 * trueCycle({})) < 1e-11 && phaseSpread(w, 3 * trueCycle({})) < 1e-10;
    })());
    say("   SO THE DEMO'S EXACTNESS RESTS ON THE AMPLITUDES BEING EQUAL, NOT ON THEIR BEING SMALL. That had never");
    say("   been written down, and it is the opposite of what 'at small amplitude' in the header leads you to expect.");
}

// --- 5. the tolerance that falls out, derived then measured --------------------------------------------------------
{
    say("5. HOW MUCH AMPLITUDE SPREAD THE ROW TOLERATES. Derived from dK/dtheta, then measured by simulating it.");
    const rows = [];
    for (const budget of [0.4, 0.2, 0.1, 0.05, 0.025, 0.0125]) {
        const tol = amplitudeTolerance({ budget });
        const w = trueWaveRow({ ampSpread: tol.halfSpread / 0.3, pattern: "worst" });
        const meas = phaseSpread(w, trueCycle({}));
        rows.push({ budget, dAmp: tol.halfSpread, meas, ratio: meas / budget });
        say("     budget " + budget.toFixed(4) + " rad   tolerated amplitude excess " + tol.halfSpread.toExponential(3) +
            " rad   measured " + meas.toFixed(6) + "   ratio " + (meas / budget).toFixed(6));
    }
    ok("the derived tolerance is right, and its error is FIRST ORDER in the budget", (() => {
        const ex = rows.map((r) => r.ratio - 1);
        const ords = ex.slice(1).map((e, i) => Math.log2(ex[i] / e));
        say("     linearisation excess halves with the budget: orders " + ords.map((o) => o.toFixed(3)).join(", "));
        return ords.every((o) => o > 0.9 && o < 1.1) && Math.abs(rows[rows.length - 1].ratio - 1) < 0.01;
    })(), "which is what a LINEARISED slope of a nonlinear K should do -- reported as an order, not as an error");
    const at01 = amplitudeTolerance({ budget: 0.1 });
    ok("the number the demo actually wants: a stated fraction of the release amplitude", at01.fraction > 0.02 && at01.fraction < 0.08,
        "for 0.1 rad of phase at re-sync, amplitudes must match to " + (100 * at01.fraction).toFixed(2) +
        "% -- the fastest pendulum does " + at01.worst + " swings and accumulates the most");
}

// --- 6. THE OBSERVABLE TRAP, and why the picture is a weak instrument ------------------------------------------------
{
    say("6. AT RE-SYNC EVERY PENDULUM IS AT ITS TURNING POINT, where d(theta)/d(phase) = 0.");
    const amp = 0.3;
    const angleErr = (eps) => amp * (1 - Math.cos(eps));      // what a phase error eps does to a DRAWN angle
    ok("!! a phase error shows up in the angles only QUADRATICALLY", (() => {
        const a = angleErr(0.1), b = angleErr(0.05);
        say("     phase 0.100 rad -> drawn angle moves " + a.toExponential(3) + " rad");
        say("     phase 0.050 rad -> drawn angle moves " + b.toExponential(3) + " rad   (ratio " + (a / b).toFixed(2) + ", i.e. squared)");
        return a < 2e-3 && Math.abs(a / b - 4) < 0.05;
    })(), "so a visibly late pendulum moves the picture by ~0.0015 rad, which is nothing");
    ok("every claim in this gate is therefore measured in PHASE, never in drawn angle", (() => {
        const src = readFileSync(new URL("./pendulumExact.mjs", import.meta.url), "utf8");
        return /phaseSpread/.test(src) && /QUADRATICALLY SUPPRESSED/.test(src) && !/angleSpread/.test(src);
    })());
    say("   THIS IS v3619'S LESSON IN A NEW COSTUME: an observable that cannot resolve the perturbation you care");
    say("   about is not a weak check, it is the WRONG check. The page draws the row because a picture is worth");
    say("   drawing; the number beside it is what grades it, and the page says so in the same breath.");
}

// --- 7. nothing was edited in the shipped module, and the antidote for when it is --------------------------------------
{
    say("7. pendulumWave.js IS NOT EDITED BY THIS ROUND. It is correct about the equation it solves.");
    const src = readFileSync(new URL("../pendulumWave.js", import.meta.url), "utf8");
    ok("it still steps the EXACT harmonic rotation, which is what makes this whole section true", /EXACT harmonic rotation/.test(src) && /strictSin|strictCos/.test(src));
    ok("it still declares the small-amplitude assumption in its own header", /at small amplitude, is a simple harmonic oscillator/.test(src));
    say("   ANTIDOTE: IF SOMEBODY GIVES pendulumWave.js A NONLINEAR STEPPER, THE TWO LINES ABOVE GO RED. THE RIGHT");
    say("   RESPONSE IS TO REWRITE THEM TO GRADE ITS MEASURED RE-SYNC AGAINST trueCycle() -- NOT TO WEAKEN THEM,");
    say("   AND NOT TO DELETE THEM. The claim in section 4 depends on which equation that file is solving.");
}

console.log("pendulumExact-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
