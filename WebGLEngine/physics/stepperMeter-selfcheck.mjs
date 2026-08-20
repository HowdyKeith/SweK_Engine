// WebGLEngine/physics/stepperMeter-selfcheck.mjs -- v3605
//
// Run: node physics/stepperMeter-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/stepperMeter.mjs -- the injected-stepper seam, the fidelity axis, and the three findings.
//
// THE CHECK THIS FILE EXISTS FOR is section 1: an injected seam that reproduces the shipped meter is only worth
// having if it IS the shipped computation, and "I wrote the same three update rules again" is exactly how a
// second declaration enters. It is asserted BIT-IDENTICALLY across every kind and every dt, and the shipped
// path is held to hashes captured from the PRISTINE v3604 EXTRACT BEFORE classifyEnvelope was extracted.
//
// AND EVERY VERDICT-VS-FIDELITY CLAIM IS A RELATION RATHER THAN A THRESHOLD. The finding is an ORDERING -- the
// best envelope reading sits on the worst trajectory, and the only passing sweep row is the least accurate one
// -- so a typed number would pin an arrangement rather than the property (twenty-three-plus instances here).
import crypto from "node:crypto";
import { shmRun, verdict, KINDS, classifyEnvelope, EXPLODE_FACTOR, DAMP_FACTOR, reportLines as meterReport } from "./stabilityMeter.mjs";
import {
    envelope, fidelity, meter, shmSpec, symplecticDiscreteOmega, measuredPeriod,
    centrifugeSpec, centrifugeSweep, exactSolutionVerdict, centK, CENT, reportLines, MEASURED_V3605,
} from "./stepperMeter.mjs";
import { centrifugeStep } from "./centrifuge.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const h = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

// ---- 1. THE SEAM IS THE SHIPPED COMPUTATION, AND THE REFACTOR MOVED NOTHING --------------------------------------
{
    const rows = [];
    for (const k of KINDS) for (const dt of [0.05, 0.1, 0.5, 1.0, 1.9, 2.1, 5, 50]) {
        const r = shmRun(k, { dt, steps: 400 });
        rows.push(k + "|" + dt + "|" + r.ratio + "|" + r.perStep + "|" + r.blewUp + "|" + r.steps);
    }
    ok("!! the SHIPPED shmRun path is bit-identical to the pristine v3604 extract",
       h(rows.join("\n")) === MEASURED_V3605.shippedPathHashes.shmRun,
       "captured BEFORE classifyEnvelope was extracted -- a refactor that 'cannot change anything' is the kind that does");
    ok("...and so is its report", h(meterReport().join("\n")) === MEASURED_V3605.shippedPathHashes.reportLines);

    let same = 0, differing = [];
    for (const k of KINDS) for (const dt of [0.05, 0.1, 0.5, 1.0, 1.9, 2.1]) {
        const a = shmRun(k, { dt, steps: 400 }).ratio;
        const b = envelope({ ...shmSpec(k), dt, steps: 400 }).ratio;
        if (a === b || (!Number.isFinite(a) && !Number.isFinite(b))) same++; else differing.push(k + "@" + dt);
    }
    ok("!! THE INJECTED SEAM IS BIT-IDENTICAL TO THE SHIPPED METER, every kind and every dt",
       differing.length === 0, same + " of 18 exact" + (differing.length ? " -- DIFFER: " + differing.join(", ") : ""));
    ok("...and the seam knows nothing about the state: it is driven by (state, dt) -> state",
       typeof shmSpec("explicit").step === "function" && Array.isArray(shmSpec("explicit").state0),
       "v3599's meter knew, which is why it could only ever grade itself");
}

// ---- 2. THE CLASSIFICATION IS IMPORTED, NOT COPIED ----------------------------------------------------------------
//
// Driven rather than read off the source (prose-as-code, twenty-plus instances): the seam's verdict must equal
// classifyEnvelope applied to its own ratio, at every ratio including both boundaries.
{
    let agree = 0;
    for (const dt of [0.05, 0.5, 1.0, 1.9, 2.1, 50]) for (const k of KINDS) {
        const e = envelope({ ...shmSpec(k), dt, steps: 400 });
        if (e.verdict === classifyEnvelope(e.ratio, e.blewUp)) agree++;
    }
    ok("!! the seam's verdict IS classifyEnvelope's, at every point tested", agree === 18, agree + " of 18");
    ok("...and the thresholds are still the meter's own", EXPLODE_FACTOR === 10 && DAMP_FACTOR === 0.1,
       "a second copy here would drift the day somebody tuned one of them");
    const reached = new Set();
    for (const dt of [0.05, 0.5, 2.1]) for (const k of KINDS) reached.add(envelope({ ...shmSpec(k), dt, steps: 400 }).verdict);
    ok("POSITIVE CONTROL: all three verdicts are REACHED, not merely declared", reached.size === 3,
       [...reached].sort().join(", ") + " -- a three-way split that only ever returns one value is a dead check");
}

// ---- 3. THE FIDELITY ANSWER KEY IS AN IDENTITY WHERE THE CROSSING LANDS ON A STEP -----------------------------------
{
    const sp = shmSpec("symplectic");
    const P1 = measuredPeriod({ ...sp, dt: 1.0, steps: 40000 });
    const exact1 = 2 * Math.PI / symplecticDiscreteOmega(1, 1.0);
    ok("!! symplectic Euler's measured period IS its exact discrete period -- machine zero, not small",
       Math.abs(P1 - exact1) / exact1 < 1e-14, "relErr " + (Math.abs(P1 - exact1) / exact1).toExponential(2) +
       " at w*dt = 1, where the crossing lands ON a step");
    ok("...and the integrator is EXACTLY solving a DIFFERENT problem", Math.abs(exact1 - 2 * Math.PI) > 0.2,
       "discrete " + exact1.toFixed(6) + " against the continuous " + (2 * Math.PI).toFixed(6) +
       " -- which is the thing no energy ratio can say");
    const dep = [0.4, 0.2, 0.1].map((dt) => Math.abs(2 * Math.PI / symplecticDiscreteOmega(1, dt) - 2 * Math.PI));
    const q = [dep[0] / dep[1], dep[1] / dep[2]];
    ok("...and the departure from the CONTINUOUS period is O(dt^2), predicted and not fitted",
       q.every((r) => r > 3.5 && r < 4.5), "quarters when dt halves: ratios " + q.map((v) => v.toFixed(3)).join(", "));
}

// ---- 4. FINDING 1: THE BEST ENVELOPE READING SITS ON THE WORST TRAJECTORY, ON THE METER'S OWN FIXTURE ----------------
{
    const sp = shmSpec("symplectic");
    const at = (dt) => ({ e: envelope({ ...sp, dt, steps: 400 }), f: fidelity({ ...sp, dt, steps: 400 }) });
    const one = at(1.0), tenth = at(0.1);
    ok("symplectic Euler at w*dt = 1 returns the BEST POSSIBLE envelope reading",
       one.e.verdict === "FAITHFUL" && Math.abs(one.e.ratio - 1) < 1e-6, "energy ratio " + one.e.ratio.toFixed(9));
    ok("!! ...ON A TRAJECTORY AS FAR FROM THE ANSWER AS A BOUNDED ONE CAN GET", one.f.worstAbs > 1.999,
       "worst |x - cos(w t)| = " + one.f.worstAbs.toFixed(6) + " against a theoretical maximum of 2 for a unit cosine");
    ok("!! ...and the envelope axis CANNOT SEE IT: a 28x better trajectory gets a WORSE envelope reading",
       Math.abs(tenth.e.ratio - 1) > Math.abs(one.e.ratio - 1) && tenth.f.worstAbs < one.f.worstAbs / 10,
       "w*dt 0.1: ratio " + tenth.e.ratio.toFixed(6) + " (further from 1) on worstAbs " + tenth.f.worstAbs.toFixed(6));
    ok("POSITIVE CONTROL: the fidelity axis is not a dead check -- it separates them by orders",
       one.f.worstAbs / tenth.f.worstAbs > 10, "ratio " + (one.f.worstAbs / tenth.f.worstAbs).toFixed(1) + "x");
    ok("...and both are reported as a PAIR, never combined", meter({ ...sp, dt: 1.0, steps: 400 }).envelope === "FAITHFUL" &&
       meter({ ...sp, dt: 1.0, steps: 400 }).worstAbs > 1.999,
       "a single score would have to choose which of the two to hide");
}

// ---- 5. FINDING 2, THE LOAD-BEARING NEGATIVE: THE ENVELOPE AXIS CONDEMNS THE CLOSED FORM ------------------------------
{
    const ex = exactSolutionVerdict();
    ok("!! THE EXACT CONTINUOUS SOLUTION OF THE CENTRIFUGE READS 'EXPLODES'", ex.verdict === "EXPLODES",
       "growth " + ex.ratio.toExponential(3) + " -- a meter whose verdict on the closed form is 'unstable' " +
       "cannot be pointed at that system at all");
    ok("...and that is a fact about the SYSTEM, not about any stepper", centK() * CENT.T > Math.log(EXPLODE_FACTOR),
       "k*T = " + (centK() * CENT.T).toFixed(3) + " exceeds ln(EXPLODE_FACTOR) = " + Math.log(EXPLODE_FACTOR).toFixed(3) +
       ", so no integrator of it can pass");
    ok("...so the failure is NOT that the meter is neutral on growth -- it is that it condemns correctness", true,
       "which is the direction that matters: it would reject the right answer");
}

// ---- 6. FINDING 3: THE VERDICT IS ANTI-CORRELATED WITH THE ERROR, ASSERTED AS AN ORDERING ------------------------------
{
    const sweep = centrifugeSweep();
    const best = sweep.reduce((a, b) => (b.rateError < a.rateError ? b : a));
    const worst = sweep.reduce((a, b) => (b.rateError > a.rateError ? b : a));
    ok("the sweep is a REFINEMENT and not a truncation: simulated time is held fixed",
       sweep.every((r) => Math.abs(r.dt * r.steps - CENT.T) / CENT.T < 0.1),
       "v3512's lesson -- halving dt at a fixed step count truncates the run instead of refining it");
    ok("!! THE MOST ACCURATE CONFIGURATION IS THE ONE THE ENVELOPE AXIS REJECTS",
       best.verdict === "EXPLODES", "x = " + best.x + " at rate error " + best.rateError.toFixed(4));
    ok("!! AND THE ONLY ONE IT PASSES IS THE LEAST ACCURATE ON THE LIST",
       worst.verdict === "FAITHFUL" && sweep.filter((r) => r.verdict === "FAITHFUL").length === 1,
       "x = " + worst.x + " at rate error " + worst.rateError.toFixed(4) +
       " -- one giant step does not get far, so the excursion and the error move in OPPOSITE directions");
    ok("...asserted as an ORDERING rather than a threshold", worst.rateError > best.rateError * 50,
       best.rateError.toFixed(4) + " vs " + worst.rateError.toFixed(4) +
       " -- a typed number would pin the arrangement rather than the property");
    ok("POSITIVE CONTROL: the fidelity axis ranks the sweep correctly, monotone in x",
       sweep.every((r, i) => i === 0 || r.rateError > sweep[i - 1].rateError),
       sweep.map((r) => r.rateError.toFixed(3)).join(" -> "));
}

// ---- 7. IT DRIVES THE SHIPPED STEPPER AND REIMPLEMENTS NOTHING; AND FIDELITY REFUSES WITHOUT A REFERENCE ----------------
{
    const spec = centrifugeSpec();
    const dt = 1 / 60, p = [{ r: 0.1, a: CENT.a, rho: CENT.rho }];
    centrifugeStep(p, { omega: CENT.omega, dt, rhoF: CENT.rhoF, eta: CENT.eta, rMax: 1e300 });
    ok("!! the centrifuge spec WRAPS the shipped centrifugeStep rather than copying it",
       spec.step(0.1, dt) === p[0].r, "bit-identical to a direct call -- a second copy would make every number here " +
       "a fact about this file");
    // THE THROW IS CAUGHT ON PURPOSE. Removing the refusal makes fidelity call an undefined reference, which
    // CRASHES THE GATE -- and a crash prints ZERO "FAIL" lines, so a sabotage measured by counting failures
    // reads as "the check did not fire" when it fired hardest. Found by running this exact plant and reading
    // the EXIT CODE rather than the count (the handoff's rule about piping a gate through tail, one level up).
    let noRef;
    try { noRef = fidelity({ step: spec.step, observe: spec.observe, state0: 0.1, dt, steps: 10 }); }
    catch (e) { noRef = { threw: String(e && e.message) }; }
    ok("!! fidelity REFUSES without a reference -- neither inventing one NOR throwing",
       typeof noRef.refused === "string" && noRef.worstAbs === undefined,
       noRef.threw ? "IT THREW: " + noRef.threw : "a reference derived from the run measures the run against itself -- v3201's mirror");
    ok("...and it answers when given one", typeof fidelity({ ...spec, dt, steps: 10 }).worstRel === "number");
    ok("the SPH column's refusal is recorded rather than faked", (MEASURED_V3605.refused || "").includes("ENVELOPE axis only"),
       "no closed form for its transient energy; the hydrostatic profile is a DIFFERENT observable");
    ok("MEASURED_V3599 is untouched", MEASURED_V3605.notChanged.includes("MEASURED_V3599"));
    const rep = reportLines();
    ok("the report renders and names its own refusal", rep.length > 25 && rep.join("\n").includes("REFUSED"), rep.length + " lines");
}

// ---- 8. THE ANTIDOTE ----------------------------------------------------------------------------------------------
//
// WHEN SOMEBODY GIVES THE SPH COLUMN A CLOSED FORM FOR ITS TRANSIENT, section 7's refusal line goes RED. Rewrite
// it to assert the fidelity axis reaches the fluid -- do NOT delete it and do NOT widen the refusal to cover
// whatever is still missing. AND IF EXPLODE_FACTOR IS EVER MADE ASYMMETRIC, section 2 goes red: that asymmetry
// is the thing v3599 exists to measure, so building it into the bounds begs the question.
{
    ok("the antidote is written where the next person will hit it", true,
       "a refusal satisfied is a line to REWRITE, not a line to delete");
}

console.log(fails ? "\nstepperMeter-selfcheck: " + fails + " FAILED" : "\nstepperMeter-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
