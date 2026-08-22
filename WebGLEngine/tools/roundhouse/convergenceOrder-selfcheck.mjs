// WebGLEngine/tools/roundhouse/convergenceOrder-selfcheck.mjs -- v3414
//
// *** AN ORDER IS A STRONGER KEY THAN A MAGNITUDE. *** A wrong constant fails one number; a wrong ORDER says the
// scheme is not what its author thinks it is. Halve the step and a second-order method's error falls by four.
//
// AND THE REFUSAL IS THE LOAD-BEARING HALF, because the first two candidates in this lab could not be used:
// twobody's periodErrFrac is A QUANTISATION OFFSET (the period is measured by COUNTING STEPS, so it lands exactly
// on a grid line at 3200 and reads ZERO), and figureeight's energyDriftFrac is SATURATED at 1.0 for every step
// count. A least-squares fit through either returns a confident, meaningless exponent.
"use strict";
import { fitOrder, resolutionKnobs, knobsAreNested, sweep, RATIO_SPREAD } from "./convergenceOrder.mjs";
import { getDevice } from "./devices.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const HS = [1, 0.5, 0.25, 0.125];

// ---- 1. KNOWN ORDERS IN, THE SAME ORDERS OUT ------------------------------------------------------------
{
    const p2 = fitOrder(HS, HS.map((h) => 3 * h * h));
    const p4 = fitOrder(HS, HS.map((h) => 0.7 * h ** 4));
    const p1 = fitOrder(HS, HS.map((h) => 5 * h));
    say(`planted h^1 -> ${p1.p.toFixed(4)}, h^2 -> ${p2.p.toFixed(4)}, h^4 -> ${p4.p.toFixed(4)}`);
    ok("!! *** a planted order comes back exactly ***",
        Math.abs(p2.p - 2) < 1e-9 && Math.abs(p4.p - 4) < 1e-9 && Math.abs(p1.p - 1) < 1e-9,
        "AN INSTRUMENT THAT CANNOT RECOVER AN ORDER IT WAS TOLD CANNOT BE TRUSTED WITH ONE IT WAS NOT");
    const noisy = fitOrder(HS, HS.map((h, i) => 3 * h * h * (1 + [0.01, -0.02, 0.03, -0.01][i])));
    ok("...and 3% noise on a real h^2 sequence still reads 2, so the bar is not brittle",
        noisy.ok && Math.abs(noisy.p - 2) < 0.05, noisy.ok ? "p=" + noisy.p.toFixed(4) : "REFUSED " + noisy.refused);
}

// ---- 2. THE FOUR REFUSALS, EACH SHOWN FIRING ------------------------------------------------------------
{
    const cases = [
        ["exact-zero", [1e-3, 1e-4, 0, 1e-6], "a discretised measurement landing on a grid line"],
        ["saturated", [1, 1, 1, 1], "figureeight.energyDriftFrac reads 1.0 at 2000, 4000, 8000 and 16000 steps"],
        ["not-monotone", [1e-4, 1e-5, 2e-5, 1e-6], "a truncation error cannot rise"],
        ["too-few-points", [1e-3, 1e-4], "two points define a slope and prove nothing about it"],
    ];
    for (const [name, errs, why] of cases) {
        const r = fitOrder(HS.slice(0, errs.length), errs);
        ok("refuses " + name, !r.ok && r.refused === name, (r.ok ? "returned p=" + r.p.toFixed(3) : r.refused) + " -- " + why);
    }
}

// ---- 3. THE ADVERSARIAL CASE, AND THE THRESHOLD IT MOVED ------------------------------------------------
{
    // The REAL twobody sequence, measured: 7.89e-4 / 1.97e-4 / 6.58e-5 / 1.64e-5.
    const real = [7.894737e-4, 1.973684e-4, 6.578947e-5, 1.644737e-5];
    const r = fitOrder(HS, real);
    ok("!! *** the real quantised sequence is REFUSED, not fitted ***",
        !r.ok && r.refused === "inconsistent-ratio",
        r.ok ? "returned p=" + r.p.toFixed(3) : r.refused);
    // *** AND THE FIRST THRESHOLD I PICKED LET IT THROUGH. *** At RATIO_SPREAD 0.35 this fit cleanly at
    // p = 1.834 with r-squared 0.9979 -- the exact confident-meaningless number the tool exists to refuse. Its
    // per-step exponents are 2.000, 1.585, 2.000, and the 1.585 is log2(3): the period jumped THREE step-widths
    // instead of four. THE BAR IS MEASURED, NOT CHOSEN: exact sequences spread 0.000, this one 0.232.
    ok("!! *** and r-squared does NOT catch it, which is why the ratio test exists ***",
        (() => { const a = real, rr = []; for (let i = 1; i < a.length; i++) rr.push(Math.log(a[i - 1] / a[i]) / Math.log(HS[i - 1] / HS[i]));
                 const lo = Math.min(...rr), hi = Math.max(...rr); return (hi - lo) / ((hi + lo) / 2) > RATIO_SPREAD; })(),
        "a quantised sequence is still very nearly a straight line in log-log (r2 = 0.9979), so GOODNESS OF FIT " +
        "SAYS NOTHING ABOUT WHETHER THE THING BEING FITTED IS A TRUNCATION ERROR. Only the agreement between " +
        "consecutive halvings separates them");
}

// ---- 4. THE CENSUS READS BOTH SHAPES, WHICH MY FIRST ONE DID NOT ----------------------------------------
{
    const flat = resolutionKnobs({ mode: "period", steps: 20000 });
    const nested = resolutionKnobs({ mode: "orbit", config: { m1: 3, stepsPerOrbit: 400, orbits: 40 } });
    ok("!! *** knobs are found whether they sit FLAT or NESTED under config ***",
        flat.includes("steps") && nested.includes("stepsPerOrbit") && knobsAreNested({ config: { stepsPerOrbit: 400 } }, "stepsPerOrbit"),
        "figureeight is flat, twobody is nested. MY FIRST CENSUS READ THE TOP LEVEL ALONE AND REPORTED ONE " +
        "DEVICE OF SIXTY-THREE; reading both reports TWENTY-SIX. THE IMPLAUSIBLE NUMBER IS WHAT CAUGHT IT");
}

// ---- 5. A REAL ORDER, RECOVERED FROM A REAL DEVICE ------------------------------------------------------
{
    const kepler = await getDevice("kepler");
    const def = kepler.defaults({});
    const knob = "stepsPerOrbit", nested = knobsAreNested(def, knob);
    const base = (nested ? def.config : def)[knob];
    const r = await sweep(kepler, { mode: def.mode, knob, values: [base, base * 2, base * 4], observable: "energyErrFirstHalf", nested });
    say(`kepler.energyErrFirstHalf over ${knob} ${base}/${base * 2}/${base * 4}: ` +
        (r.ok ? `p=${r.p.toFixed(3)} r2=${r.r2.toFixed(4)}` : "REFUSED " + r.refused));
    ok("!! *** kepler's energy error is SECOND ORDER, measured ***",
        r.ok && Math.abs(r.p - 2) < 0.1 && r.r2 > 0.99,
        "p=" + (r.ok ? r.p.toFixed(3) : "-") + " -- the symplectic integrator's energy error falls by four when " +
        "the step halves, which is what its scheme claims and NOTHING IN THE LAB HAD EVER CHECKED");
}

console.log(failed ? "\n[convergenceOrder-selfcheck] FAILED " + failed : "\n[convergenceOrder-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
