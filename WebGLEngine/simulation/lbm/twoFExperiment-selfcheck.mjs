// WebGLEngine/simulation/lbm/twoFExperiment-selfcheck.mjs -- v2862
//
// Run: node simulation/lbm/twoFExperiment-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the fixed-inflow rig for the f_drag = 2 f_lift question.
//
// THIS GATE DOES NOT RUN THE FULL EXPERIMENT. The real run is 24,000 steps and three minutes; the suite budget is
// sixty seconds. So it gates the MACHINERY on short runs and pins the recorded RESULTS as data. A gate that took
// three minutes would be excluded from the suite, and an excluded gate is not a gate.
//
// AND IT DELIBERATELY DOES NOT ASSERT THAT 2f REPRODUCES. It did not. What is asserted is that the rig behaves
// the way the measurement requires and that the VERDICT MACHINERY REFUSES to score a run that does not qualify --
// because the way this measurement goes wrong is by reporting a confident ratio from a flow that never shed.
import { makeRig, runTwoF, verdictTwoF, nuOf, reOf, DEFAULT_RIG, RUNS_V2862, INLET_DRIFT_BUDGET, STABLE_TAU_FLOOR, VALIDITY_U } from "./twoFExperiment.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the rig obeys the constraints that three earlier rounds established --------------------------------
{
    const c = DEFAULT_RIG;
    ok("tau is above the Zou-He inlet stability limit", c.tau >= 0.54,
       "tau=" + c.tau + " -- v2835 MEASURED divergence below ~0.54");
    ok("inlet speed is inside LBM validity", c.U <= 0.1, "U=" + c.U + " (compressibility error above ~0.1)");
    ok("Reynolds number is past the unconfined onset", reOf(c.U, c.D, c.tau) > 50,
       "Re=" + reOf(c.U, c.D, c.tau).toFixed(1) + " vs unconfined ~47");
    ok("viscosity follows nu=(tau-1/2)/3", Math.abs(nuOf(0.6) - 0.033333333333333) < 1e-12);
    ok("!! the symmetry is deliberately broken", (c.yOffset || 0) > 0,
       "a symmetric discrete problem can sit on the unstable symmetric branch and report 'no shedding' past onset");
}

// ---- 2. the rig builds and is stable on a short run ---------------------------------------------------------
{
    const { lbm } = makeRig({ nx: 120, ny: 41, D: 8, cx: 30 });
    for (let i = 0; i < 400; i++) lbm.step();
    const healthy = [...lbm.rho].every((v) => Number.isFinite(v) && v > 0.5 && v < 2);
    ok("a short run stays finite and physical", healthy);
    ok("...and the cylinder is actually in the field", [...lbm.solid].some(Boolean),
       "a rig with no obstacle would shed nothing and look like a negative result");
}

// ---- 3. THE VERDICT REFUSES TO SCORE AN UNQUALIFIED RUN ------------------------------------------------------
//
// This is the check that matters. The failure mode for this measurement is not a wrong number -- it is a
// CONFIDENT number taken from a flow that never oscillated.
{
    const base = { healthy: true, liftSustained: true, inletDriftFrac: 0.001, fLift: 0.001, dragOverLift: 2.0 };
    ok("a qualified run near 2 reports reproduction", verdictTwoF({ ...base }).reproduces2f);

    ok("!! a run whose lift never sustained is DISQUALIFIED, not scored",
       verdictTwoF({ ...base, liftSustained: false }).qualified === false);
    ok("!! a run with no lift frequency is DISQUALIFIED even if a ratio exists",
       verdictTwoF({ ...base, fLift: null }).qualified === false,
       "null/null can produce a number; it must never become a result");
    ok("!! a drifting inlet is DISQUALIFIED -- that is the v2834 loop returning",
       verdictTwoF({ ...base, inletDriftFrac: 0.15 }).qualified === false,
       "12-21% drift is exactly what killed every earlier attempt");
    ok("a diverged field is disqualified", verdictTwoF({ ...base, healthy: false }).qualified === false);

    const off = verdictTwoF({ ...base, dragOverLift: 0.615 });
    ok("a QUALIFIED run away from 2 is an honest negative, not a disqualification", off.qualified && !off.reproduces2f,
       off.text);
}

// ---- 4. the recorded findings are self-consistent, INCLUDING the divergence -----------------------------------
{
    ok("three full runs are recorded", RUNS_V2862.length === 3);
    const healthy = RUNS_V2862.filter((r) => r.healthy);
    ok("!! the inlet HELD on every run that stayed healthy -- the thing v2835 was built for",
       healthy.every((r) => r.inletDriftFrac < INLET_DRIFT_BUDGET),
       healthy.map((r) => (100 * r.inletDriftFrac).toFixed(2) + "%").join(" and ") + " against a 12-21% failure before");
    ok("no run shed, and that is recorded rather than smoothed", RUNS_V2862.every((r) => r.shed === false));
    ok("...run two extends v2749's non-shedding point to higher Re and lower blockage",
       RUNS_V2862[1].re > 58 && RUNS_V2862[1].blockage < 0.21,
       "Re " + RUNS_V2862[1].re + " at " + (100 * RUNS_V2862[1].blockage).toFixed(0) + "%");
    ok("...and breaking the symmetry measurably grew the lift", RUNS_V2862[1].liftAmplitude > 4 * RUNS_V2862[0].liftAmplitude,
       "0.023 -> 0.115: the perturbation took, it just did not become sustained");

    // THE DIVERGENCE IS DATA, NOT AN EMBARRASSMENT. It is the measurement that turns "run it bigger" into a
    // specific prescription, so it must survive in the record rather than being quietly dropped.
    const diverged = RUNS_V2862.filter((r) => !r.healthy);
    ok("!! the DIVERGED run is kept, not deleted", diverged.length === 1,
       "Re " + diverged[0].re + " at tau " + diverged[0].tau + " and U " + diverged[0].U + " left the stable envelope");
    ok("...and it sat on BOTH limits at once", diverged[0].U >= VALIDITY_U && diverged[0].tau < STABLE_TAU_FLOOR,
       "U at the 0.1 validity ceiling AND tau below the 0.55 safe floor -- the two constraints met and there was no room");
    ok("!! the recommended tau floor is a MARGIN over what diverged", STABLE_TAU_FLOOR > diverged[0].tau,
       "0.55 recommended vs 0.545 measured-diverging -- a prescription derived from a failure, not from taste");
    ok("...and every healthy run respected that ceiling on U", healthy.every((r) => r.U < VALIDITY_U));
}

// ---- 5. an actual (tiny) end-to-end run returns the full observable set ----------------------------------------
{
    const r = runTwoF({ nx: 100, ny: 31, D: 6, cx: 25, settle: 150, record: 400, sampleEvery: 2 });
    for (const k of ["healthy", "inletDriftFrac", "liftSustained", "fLift", "dragOverLift", "reNominal", "blockageFrac"]) {
        if (!(k in r)) { ok("observable present: " + k, false); }
    }
    ok("a full (tiny) run returns every observable, including the disqualifying ones", "liftSustained" in r && "inletDriftFrac" in r);
    ok("...and a 400-step run is correctly NOT qualified", verdictTwoF(r).qualified === false,
       "far too short to sustain anything -- if this ever passed, the qualifier would be broken");
}

console.log(fails ? "\ntwoFExperiment-selfcheck: " + fails + " FAILED" : "\ntwoFExperiment-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
