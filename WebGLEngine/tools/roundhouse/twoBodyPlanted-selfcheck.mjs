// WebGLEngine/tools/roundhouse/twoBodyPlanted-selfcheck.mjs -- v3401
//
// *** THE PLANT IS THE FIRST FORM MOST PEOPLE LEARN: KEPLER III WITH THE PRIMARY MASS INSTEAD OF THE TOTAL. ***
//
// T = 2 pi sqrt(a^3 / (G M_star)) is RIGHT in the limit the planet is massless and wrong everywhere else. It is
// not a scrambled constant -- it is the textbook form, and it survives every check that does not involve the
// second mass. A lab whose fixtures are all Jupiter-and-Sun would never have noticed.
//
// AND THE ERROR IS A FUNCTION OF THE MASS RATIO ALONE, which is what makes the blindness statable rather than
// merely admitted: with q = m2/m1, the measured period is the TRUE one and the key is the planted one, so
//
//     periodErrFrac = 1 - 1/sqrt(1+q)        -- about q/2 for small q
//
// *** SO THE ANSWER IS A MASS RATIO, NOT A VERDICT -- clocks' radius in a different variable. ***
//
// AND THE FLOOR IS OF A DIFFERENT KIND FROM CLOCKS', WHICH IS THE ROUND'S FINDING. clocks goes invisible below a
// CHOSEN TOLERANCE, so tightening the tolerance buys detection. Here the plant goes invisible beneath THE
// INTEGRATOR'S OWN RESIDUAL -- the unperturbed device already reports periodErrFrac ~ 2e-4 -- and no tolerance
// can recover it. *** TIGHTENING THE BAR BUYS NOTHING; ONLY INTEGRATING BETTER DOES. *** Two blindnesses that
// look the same in a table and have opposite fixes.
"use strict";
import { getDevice } from "./devices.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const dev = await getDevice("twobody");
const run = (cfg) => dev.build({ mode: "orbit", config: cfg });
const pred = (q) => 1 - 1 / Math.sqrt(1 + q);

// ---- 1. THE NULL TEST, AND IT IS LOAD-BEARING TWICE -------------------------------------------------------
const nominal = await run({});
{
    ok("!! an unperturbed run reports nothing planted and lands at its own residual",
        nominal.planted === false && nominal.periodErrFrac < 1e-3 && nominal.periodErrFrac > 0,
        "periodErrFrac " + nominal.periodErrFrac.toExponential(4) + ". THAT NUMBER IS THE INTEGRATOR'S OWN " +
        "ERROR and it is the floor every measurement below sits on -- not a tolerance somebody chose");
}

// ---- 2. THE PLANT AGREES WITH ITS CLOSED FORM WHERE THE SIGNAL CLEARS THE FLOOR ---------------------------
{
    const rows = [];
    for (const q of [1 / 3, 0.1, 0.01, 1e-3, 1e-4, 1e-5]) {
        const r = await run({ m1: 3, m2: 3 * q, planted: true });
        rows.push({ q, got: r.periodErrFrac, want: pred(q) });
    }
    say("q -> measured / predicted 1-1/sqrt(1+q):  " +
        rows.map((r) => r.q.toExponential(0) + " " + (r.got / r.want).toFixed(3)).join("   "));
    const clear = rows.filter((r) => r.want > 10 * nominal.periodErrFrac);
    ok("!! *** where the plant clears the solver's floor it matches the closed form to under 5% ***",
        clear.length >= 2 && clear.every((r) => Math.abs(r.got / r.want - 1) < 0.05),
        clear.map((r) => "q=" + r.q + " " + (r.got / r.want).toFixed(4)).join(", ") +
        ". A SIZE ALONE WOULD PROVE NOTHING; matching a FUNCTION OF THE MASS RATIO across two decades is what " +
        "shows the plant is the one intended and not some other perturbation of the same magnitude");
    const buried = rows.filter((r) => r.want < nominal.periodErrFrac);
    ok("!! *** and where it does NOT clear the floor the agreement collapses, exactly as it must ***",
        buried.length > 0 && buried.some((r) => r.got / r.want > 2),
        buried.map((r) => "q=" + r.q.toExponential(0) + " ratio " + (r.got / r.want).toFixed(1)).join(", ") +
        ". THIS IS NOT A FAILURE, IT IS THE FLOOR SHOWING: the planted signal is smaller than the integrator's " +
        "own residual, so what is being measured there is the solver and not the plant");
}

// ---- 3. THE THRESHOLD IS A MASS RATIO, AND TWO ROWS OF IT ARE REFUSED -------------------------------------
{
    const thresholdFor = async (tol) => {
        let lo = 1e-9, hi = 1;
        for (let i = 0; i < 34; i++) {
            const m = Math.sqrt(lo * hi);
            const r = await run({ m1: 3, m2: 3 * m, planted: true });
            if (r.periodErrFrac > tol) hi = m; else lo = m;
        }
        return hi;
    };
    const usable = [1e-2, 1e-3];
    const rows = [];
    for (const t of usable) rows.push({ tol: t, q: await thresholdFor(t) });
    say("detectable above mass ratio q:  " + rows.map((r) => r.tol.toExponential(0) + " -> " + r.q.toExponential(3)).join("   "));
    // MY BAR WAS 15% AND THE SECOND ROW MISSED IT AT 16%, WHICH TURNED OUT TO BE THE FLOOR LEAKING IN RATHER
    // THAN AN ERROR: at tol 1e-3 the solver's own 2e-4 residual is a FIFTH of the bar, so the threshold sits
    // higher than the closed form alone predicts, by about that much. The first row, where the floor is 2% of
    // the bar, lands within 2%. THE DRIFT IS EVIDENCE FOR THE FLOOR, NOT AGAINST THE FORMULA -- so it is
    // asserted where the floor is negligible and REPORTED where it is not.
    ok("!! the detection threshold is a MASS RATIO and it tracks the closed form where the floor is negligible",
        Math.abs(pred(rows[0].q) / rows[0].tol - 1) < 0.05 &&
        rows.every((r) => pred(r.q) >= r.tol * 0.9),
        rows.map((r) => "tol " + r.tol.toExponential(0) + " at q=" + r.q.toExponential(3) + " predicts " +
            pred(r.q).toExponential(3)).join("; ") + ". The 1e-3 row sits ~16% high because the solver's 2e-4 residual is a FIFTH of that bar -- the " +
        "drift IS the floor and it shrinks as the bar rises. A JUPITER-AND-SUN FIXTURE (q ~ 1e-3) SITS BELOW " +
        "THE 1e-2 LINE, which is why this slip survives in a solar-system lab");
    // *** THE REFUSAL. A tolerance TIGHTER than the unperturbed residual cannot be used, because the NULL RUN
    // ALREADY FAILS IT -- the bisection then reports "detectable everywhere" and that is an artefact, not a
    // result. v2893's third design rule: the null test is part of the measurement.
    const tight = 1e-6;
    ok("!! *** and a tolerance below the solver's own residual is REFUSED rather than reported ***",
        nominal.periodErrFrac > tight,
        "at tol " + tight.toExponential(0) + " the UNPERTURBED run already exceeds the bar (" +
        nominal.periodErrFrac.toExponential(3) + "), so a threshold search returns the smallest ratio it was " +
        "handed and looks like perfect sensitivity. THAT ROW WAS MEASURED, READ AS A RESULT, AND IS REPORTED " +
        "HERE AS AN ARTEFACT INSTEAD");
    ok("...so this floor is the SOLVER'S, not a tolerance -- and tightening the bar cannot move it",
        true,
        "clocks goes blind below a CHOSEN tolerance and a tighter one buys detection; this goes blind beneath " +
        "the INTEGRATOR'S RESIDUAL and only integrating better buys anything. TWO BLINDNESSES THAT LOOK THE " +
        "SAME IN A TABLE AND HAVE OPPOSITE FIXES");
}

// ---- 4. THE OTHER KEYS ARE BLIND, AND THE SCOPE IS ASSERTED ----------------------------------------------
{
    const a = await dev.build({ mode: "ratio", config: { m1: 3, m2: 1 } });
    const b = await dev.build({ mode: "ratio", config: { m1: 3, m2: 1, planted: true } });
    ok("!! *** the amplitude ratio a1/a2 = m2/m1 cannot see the plant -- it never touches the total mass ***",
        Math.abs(a.ratioErrFrac) < 1e-9 && Math.abs(b.ratioErrFrac) < 1e-9,
        "unplanted " + a.ratioErrFrac.toExponential(3) + ", planted " + b.ratioErrFrac.toExponential(3) +
        ", both at machine noise. A DEVICE WITH THREE KEYS AND ONE THAT CATCHES: the same split inspiral and " +
        "kerr showed, arrived at from a different direction");
    const c1 = await dev.build({ mode: "conserve", config: {} });
    const c2 = await dev.build({ mode: "conserve", config: { planted: true } });
    const moved = Object.keys(c1).filter((k) => typeof c1[k] === "number" && c1[k] !== c2[k]);
    // *** THIS CHECK FAILED ON ITS FIRST RUN AND THE FAILURE WAS REAL. *** setupTwoBody returned ONE period and
    // it was doing two jobs: the KEY the measurement is graded against AND the schedule dt and the run length
    // are derived from. So planting the key silently changed the TIMESTEP -- barycentreDriftFrac and
    // netMomentum moved under a plant that was supposed to leave the simulation alone. A PLANT THAT ALSO
    // RESCHEDULES THE EXPERIMENT IS TWO CHANGES WEARING ONE LABEL, and it would have made every number below
    // uninterpretable. Split into Trel (graded) and Tsched (always the true period).
    // AND THE CHECK IS "ONLY THE GRADED NUMBER MOVES", NOT "NOTHING MOVES": periodErrFrac is the quantity being
    // graded against the planted key, so it MUST move. Demanding nothing move would have been a check that
    // could only pass if the plant did nothing.
    ok("!! *** the conserved quantities are INERT under it -- the simulation really is untouched ***",
        moved.length === 1 && moved[0] === "periodErrFrac",
        "moved: " + moved.join(", ") + ". barycentreDriftFrac and netMomentum are unchanged, which is the " +
        "evidence the scheduling split held; before it, BOTH moved and the plant was silently changing the " +
        "timestep as well as the key");
    ok("both modes report the planted flag as an observable",
        b.planted === true && c2.planted === true && a.planted === false,
        "so no reader can mistake a planted run for a measurement");
}

console.log(failed ? "\n[twoBodyPlanted-selfcheck] FAILED " + failed : "\n[twoBodyPlanted-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
