// tools/roundhouse/corroborate.mjs
//
// v2891 -- MEASURING WHAT NOBODY OWNS THE ANSWER TO.
//
// Twenty-two devices, and every one of them grades against an answer key: Onsager, Airy, Feigenbaum, Kepler,
// the exact ISCO. That is the right way to earn trust in an instrument, and it worked -- but it means the
// roundhouse has never yet produced a fact nobody already had. "Crystallised" has only ever meant "matched the
// textbook".
//
// It has also, twice, produced facts nobody had -- by accident. blobThermal's advection scheme has an IMPLICIT
// diffusivity that nobody chose and nobody wrote down (v2596: "the temperature nobody set", ~0.0187). The
// terrain erosion work found that a 1-ulp sin/cos difference amplifies chaotically inside a 128x128 tile. Both
// are true facts about this engine. Neither has an answer key. Neither was, at the time, held to any standard
// at all -- they were just numbers that got printed.
//
// THIS MODULE IS THE STANDARD. A measured quantity with no closed form is knowledge, rather than an anecdote,
// when it survives four INDEPENDENT attacks -- none of which needs to know the right answer:
//
//   1. PRE-REGISTRATION  The claim is stated BEFORE the run. The roundhouse loop already enforces this
//                        structurally (the proposer commits, then the sim measures), so it is inherited free --
//                        but preRegister() makes it explicit and auditable for measurements made outside a loop.
//   2. SEED STABILITY    Re-measure under different RNG seeds. A number that moves with the seed is a draw, not
//                        a property. Reported as relative spread, with the ensemble's own bar as the yardstick
//                        (blobThermal's discipline, generalised).
//   3. RESOLUTION        Re-measure at increasing resolution. A number that keeps moving as the grid refines is
//      CONVERGENCE       a discretisation artefact wearing a lab coat. Cauchy-style: successive differences must
//                        SHRINK (geometry's `converged` observable, generalised), and the extrapolated limit is
//                        reported alongside the finest value.
//   4. PORTABILITY       Re-measure on another architecture and get the same bits. That normally needs a second
//                        machine -- but v2889 established the single-machine version: a measurement whose code
//                        path touches ONLY IEEE-specified operations (+ - * / sqrt fma) and strict libm CANNOT
//                        differ across conforming machines, because there is nothing left for two libms to
//                        disagree about. So portability is checked here by arming the same tripwire and running
//                        the measurement: zero raw transcendental calls == portable by construction. A
//                        measurement that DOES call libm is not rejected -- it is marked `portable: false`, which
//                        is an honest and useful thing to know about a number.
//
// A quantity that passes all four is CORROBORATED: stable under the things that could have made it up, and the
// same everywhere. That is what "measured" has to mean when there is no key to check against.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it does not decide whether the number is PHYSICALLY correct. Nothing can,
// without a key. Corroboration says the measurement is a property of the system rather than of the run -- the
// strongest claim available, and the exact claim the roundhouse's refusal contract is built to protect.

const UNSPEC = [
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "exp", "log", "log2", "log10",
    "log1p", "expm1", "pow", "hypot", "cbrt", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
];

/** Pre-registration: freeze a claim before any measurement runs. Returns a sealed record. */
export function preRegister({ quantity, claim, rationale = "" }) {
    if (!quantity) throw new Error("preRegister: name the quantity");
    if (!claim || typeof claim !== "object") throw new Error("preRegister: a pre-registration without a claim is a diary entry");
    return Object.freeze({ quantity, claim: Object.freeze({ ...claim }), rationale, registeredAt: "before-measurement" });
}

/** Run `fn` with the libm tripwire armed. Returns { value, rawCalls, sites }. */
export function measurePortability(fn) {
    const sites = new Map();
    const originals = {};
    for (const name of UNSPEC) {
        originals[name] = Math[name].bind(Math);
        Math[name] = (...a) => {
            const frame = (new Error().stack.split("\n")[2] || "").trim().replace(/^at /, "");
            const key = name + " @ " + frame.replace(/file:\/\/\/.*?WebGLEngine\//, "");
            sites.set(key, (sites.get(key) || 0) + 1);
            return originals[name](...a);
        };
    }
    let value, err = null;
    try { value = fn(); } catch (e) { err = e; }
    for (const name of UNSPEC) Math[name] = originals[name];
    if (err) throw err;
    let rawCalls = 0;
    for (const n of sites.values()) rawCalls += n;
    return { value, rawCalls, sites: [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => n + "x " + k) };
}

/**
 * ASYNC-CAPABLE PORTABILITY. v2893 caught the reason this is needed: several device builds are declared `async`
 * even though their bodies contain no await, so calling one returns a promise and reading `.value` off it yields
 * undefined -- a portability flag measured on a promise-creation, which is always clean and always meaningless.
 *
 * The fix leans on a guarantee of the language: an async function body runs SYNCHRONOUSLY up to its first await,
 * and these have none. So every Math call has already happened by the time fn() hands back its promise. We arm,
 * call, DISARM IMMEDIATELY, and only then await -- so the awaited continuation is never inside the armed window
 * and cannot be miscounted.
 */
export async function measurePortabilityAsync(fn) {
    const sites = new Map();
    const originals = {};
    for (const name of UNSPEC) {
        originals[name] = Math[name].bind(Math);
        Math[name] = (...a) => {
            const frame = (new Error().stack.split("\n")[2] || "").trim().replace(/^at /, "");
            const key = name + " @ " + frame.replace(/file:\/\/\/.*?WebGLEngine\//, "");
            sites.set(key, (sites.get(key) || 0) + 1);
            return originals[name](...a);
        };
    }
    let pending, err = null;
    try { pending = fn(); } catch (e) { err = e; }
    for (const name of UNSPEC) Math[name] = originals[name];     // disarm BEFORE awaiting
    if (err) throw err;
    const value = await pending;
    let rawCalls = 0;
    for (const n of sites.values()) rawCalls += n;
    return { value, rawCalls, sites: [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => n + "x " + k) };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
};

/**
 * Corroborate a measured quantity that has NO answer key.
 *
 *   measure({ seed, resolution }) -> number      the measurement under stated conditions
 *   seeds        RNG seeds to vary (criterion 2). One seed means "deterministic by construction" -- stated, not assumed.
 *   resolutions  increasing grid/step counts (criterion 3). Fewer than three means convergence is UNTESTED, and
 *                the report says so rather than quietly passing.
 *   registration a preRegister() record (criterion 1).
 *
 * Returns the full evidence record; `corroborated` is true only when every criterion that COULD be tested passed
 * and none was skipped silently.
 */
export function corroborate({ quantity, measure, seeds = [1], resolutions = [], registration = null, seedTol = 0.02, resTol = 0.02, baseResolution = null,
    nuisance = null, nuisanceTol = null, controls = null, controlTol = 1e-9, deterministic = null }) {
    if (typeof measure !== "function") throw new Error("corroborate: measure must be a function");
    // DECLARING DETERMINISM DOES NOT BUY CRITERION 2, IT SWAPS IT. A subject with no stochastic input cannot be
    // seed-tested, and the census measured that this is nearly the whole lab (26/26 device modes bit-identical on
    // re-run). The old shape left criterion 2 permanently `untested` for all of them, which is honest but useless.
    // The replacement is not a waiver: declare WHY the subject is deterministic, and then a NUISANCE PARAMETER --
    // a knob the physics says cannot matter -- must be supplied and must survive. Otherwise the criterion is
    // simply untested, as before.
    if (deterministic && !nuisance) throw new Error("corroborate: a subject declared deterministic must supply a nuisance parameter -- declaring determinism swaps criterion 2 for the invariance test, it does not waive it");
    const res0 = baseResolution ?? (resolutions.length ? resolutions[resolutions.length - 1] : null);

    // v2902 -- a measurement may now return either a bare number (the original contract, unchanged) or
    // { value, controls: {...} }. The second form is what makes criterion 3 falsifiable for a device whose
    // refinement knob also moves the physics -- see the CONTROL VARIABLES note below.
    const take = (o) => (o !== null && typeof o === "object" && "value" in o ? o : { value: o, controls: null });
    const call = (args) => take(measure(args));

    // --- criterion 2: seed stability -----------------------------------------------------------------------------
    const seedValues = seeds.map((seed) => call({ seed, resolution: res0, nuisance: nuisance ? nuisance.values[0] : undefined }).value);
    const seedMean = mean(seedValues);
    const seedSpread = seedValues.length > 1 ? sd(seedValues) / Math.abs(seedMean) : 0;
    // SEED VACUITY. v2902's census measured that all 26 roundhouse device/modes are bit-identical on re-run:
    // this lab has no unseeded randomness anywhere, so "vary the seed and the answer holds" passes for free
    // almost everywhere it is asked. A criterion that cannot fail is not evidence -- the same house rule that
    // produced suspiciousZero.mjs. So a seed sweep whose values are BIT-IDENTICAL is reported as UNTESTED
    // (the knob never reached the computation), not as a pass.
    const seedVacuous = seedValues.length > 1 && seedValues.every((v) => Object.is(v, seedValues[0]));
    const seedTested = seedValues.length > 1 && !seedVacuous;
    const seedStable = seedTested ? seedSpread <= seedTol : null;

    // --- criterion 2b: NUISANCE-PARAMETER INVARIANCE ---------------------------------------------------------------
    // The generalisation of criterion 2 to a deterministic lab. A nuisance parameter is a knob the physics says
    // CANNOT matter -- where the grid sits relative to the body, which way the gantry started, the initial
    // condition of an ergodic map. Vary it and the answer must not move. (Retroactively this is what the
    // Lyapunov entry's `seeds` always were: initial conditions of a deterministic map, correctly used and
    // misnamed.) Note the asymmetry with the seed rule above, which is deliberate: for a seed, identical values
    // mean the knob did nothing and the test is vacuous; for a nuisance parameter, identical values are the
    // IDEAL RESULT. So invariance is not downgraded -- but `live` records whether the knob demonstrably reached
    // the computation, because an unwired nuisance knob looks exactly like a perfect invariance.
    let nuisanceBlock = null, nuisanceInvariant = null;
    if (nuisance) {
        if (!Array.isArray(nuisance.values) || nuisance.values.length < 2) throw new Error("corroborate: a nuisance parameter needs at least two values");
        const nTol = nuisanceTol ?? seedTol;
        const vals = nuisance.values.map((nv) => call({ seed: seeds[0], resolution: res0, nuisance: nv }).value);
        const m = mean(vals);
        const spread = (Math.max(...vals) - Math.min(...vals)) / Math.max(Math.abs(m), 1e-300);
        nuisanceInvariant = spread <= nTol;
        nuisanceBlock = {
            name: nuisance.name || "nuisance", why: nuisance.why || "", values: nuisance.values, measured: vals,
            mean: m, relativeSpread: spread, tol: nTol, invariant: nuisanceInvariant,
            live: !vals.every((v) => Object.is(v, vals[0])),
        };
    }

    // --- criterion 3: resolution convergence ---------------------------------------------------------------------
    // CONTROL VARIABLES, v2902. Refinement is only a test of DISCRETISATION if everything else holds still.
    // The census found windtunnel's drag coefficient failing this criterion for a reason that had nothing to do
    // with the drag coefficient: scaling the lattice in a body-force-driven channel raises the velocity, so the
    // Reynolds number went 8.2 -> 33.3 across the sweep and each point measured Cd of a DIFFERENT flow. Reporting
    // that as "not resolution-stable" would have been a false finding about the number. A subject may therefore
    // declare controls -- quantities the sweep promises to hold fixed -- and a sweep that moves one is REFUSED
    // (verdict `sweep-invalid`) rather than graded. This is the dual of the house rule about experiments that did
    // not run: an experiment that changed underneath the measurement.
    const resRuns = resolutions.map((resolution) => call({ seed: seeds[0], resolution, nuisance: nuisance ? nuisance.values[0] : undefined }));
    const resValues = resRuns.map((r) => r.value);
    let controlBlock = null, sweepValid = true;
    if (controls && controls.length && resRuns.length >= 2) {
        controlBlock = controls.map((name) => {
            const series = resRuns.map((r) => (r.controls ? r.controls[name] : undefined));
            const known = series.filter((v) => typeof v === "number" && Number.isFinite(v));
            if (known.length < 2) return { name, held: null, reason: "control not reported by the measurement" };
            const lo = Math.min(...known), hi = Math.max(...known);
            const drift = (hi - lo) / Math.max(Math.abs(lo), Math.abs(hi), 1e-300);
            const held = drift <= controlTol;
            if (!held) sweepValid = false;
            return { name, held, drift, tol: controlTol, series };
        });
    }
    let converged = null, convergenceRatio = null, extrapolated = null, convergenceRelStep = null, monotone = null;
    if (resValues.length >= 3 && sweepValid) {
        const d1 = Math.abs(resValues[resValues.length - 2] - resValues[resValues.length - 3]);
        const d2 = Math.abs(resValues[resValues.length - 1] - resValues[resValues.length - 2]);
        convergenceRatio = d1 > 0 ? d2 / d1 : 0;
        // A SHRINKING DIFFERENCE IS NOT ENOUGH, and calibration caught this criterion being wrong. The blobarium's
        // implicit diffusivity falls 0.0261 -> 0.0187 -> 0.0143 -> 0.0114 across the sweep: each successive change
        // is smaller than the last, so "differences shrink" says CONVERGED while the quantity is quietly heading
        // for zero. Any O(1/n) artefact passes that test. So the last change must also be small RELATIVE TO THE
        // VALUE ITSELF -- the value has to stop moving, not merely slow down on its way out.
        // TWO CONVERGENCE REGIMES, ONE TEST. Grid refinement shrinks its differences monotonically; a chaotic
        // ergodic average (a Lyapunov exponent, say) falls as 1/sqrt(N) with steps that FLUCTUATE -- calibration
        // caught a correctly-converged Lyapunov value being failed for a last step that happened to exceed its
        // predecessor. So the gate is the SPREAD of the final window relative to the value: has the quantity
        // stopped moving, whatever path it took to stop. Monotonicity is still reported (it distinguishes the
        // regimes and a non-monotone grid refinement is worth a look) but it is not the gate.
        const tail = resValues.slice(-3);
        const spread = Math.max(...tail) - Math.min(...tail);
        const last = Math.abs(resValues[resValues.length - 1]);
        const relStep = last > 0 ? spread / last : Infinity;
        converged = relStep <= resTol;
        convergenceRelStep = relStep;
        monotone = d2 <= d1;
        // Aitken-style limit from the last three, when the differences behave
        const denom = resValues[resValues.length - 1] - 2 * resValues[resValues.length - 2] + resValues[resValues.length - 3];
        extrapolated = Math.abs(denom) > 1e-300
            ? resValues[resValues.length - 1] - (resValues[resValues.length - 1] - resValues[resValues.length - 2]) ** 2 / denom
            : resValues[resValues.length - 1];
    }

    // --- criterion 4: portability by construction ------------------------------------------------------------------
    const port = measurePortability(() => call({ seed: seeds[0], resolution: res0, nuisance: nuisance ? nuisance.values[0] : undefined }).value);

    const criteria = {
        preRegistered: !!registration,
        ...(deterministic ? {} : { seedStable: seedTested ? seedStable : null }),
        ...(nuisance ? { nuisanceInvariant } : {}),
        resolutionConverged: converged,
        portable: port.rawCalls === 0,
    };
    const untested = Object.entries(criteria).filter(([, v]) => v === null).map(([k]) => k);
    const failed = Object.entries(criteria).filter(([, v]) => v === false).map(([k]) => k);

    return {
        quantity,
        value: port.value,
        registration,
        criteria,
        untested,
        failed,
        corroborated: failed.length === 0 && untested.length === 0 && sweepValid,
        // `sweep-invalid` is a THIRD verdict, not a flavour of failure: the harness is saying it cannot grade this
        // subject with the knobs it was given, which is a fact about the apparatus rather than about the number.
        verdict: !sweepValid ? "sweep-invalid" : (failed.length === 0 && untested.length === 0) ? "corroborated" : failed.length ? "not-corroborated" : "untested",
        seed: { values: seedValues, mean: seedMean, relativeSpread: seedSpread, tol: seedTol, tested: seedTested, vacuous: seedVacuous },
        determinism: deterministic ? { declared: true, why: deterministic } : { declared: false, why: null },
        nuisance: nuisanceBlock,
        resolution: { list: resolutions, values: resValues, converged, monotone, convergenceRatio, relStep: convergenceRelStep, tol: resTol, extrapolated },
        controls: controlBlock,
        sweepValid,
        portability: { rawLibmCalls: port.rawCalls, sites: port.sites },
    };
}

/** One-line human summary -- the form a lab notebook entry should take. */
export function corroborationLine(r) {
    const bits = [
        r.criteria.preRegistered ? "pre-registered" : "NOT pre-registered",
        r.seed.vacuous ? `seed sweep VACUOUS (${r.seed.values.length} seeds, bit-identical -- the knob never reached the computation)`
            : r.seed.tested ? `seed-stable to ${(r.seed.relativeSpread * 100).toFixed(3)}%` : "single-seed (deterministic by construction)",
    ];
    if (r.nuisance) bits.push(r.nuisance.invariant
        ? `invariant under ${r.nuisance.name} (${(r.nuisance.relativeSpread * 100).toFixed(4)}%${r.nuisance.live ? "" : ", but the knob moved NOTHING -- invariance unverified"})`
        : `NOT invariant under ${r.nuisance.name} (${(r.nuisance.relativeSpread * 100).toFixed(2)}% > tol ${(r.nuisance.tol * 100).toFixed(2)}%)`);
    if (!r.sweepValid) {
        const moved = (r.controls || []).filter((c) => c.held === false);
        bits.push("REFINEMENT SWEEP INVALID -- " + moved.map((c) => `${c.name} moved ${(c.drift * 100).toFixed(1)}% across it`).join(", ") + "; the sweep changed the physics, not the discretisation");
    } else {
        bits.push(r.resolution.converged === null ? "convergence UNTESTED" : r.resolution.converged ? `resolution-stable (tail spread ${(r.resolution.relStep * 100).toFixed(3)}% of value${r.resolution.monotone ? '' : ', non-monotone'})` : `NOT resolution-stable (tail spread ${(r.resolution.relStep * 100).toFixed(1)}% of value)`);
    }
    bits.push(r.criteria.portable ? "portable (zero raw libm)" : `NOT portable (${r.portability.rawLibmCalls} raw libm calls)`);
    const head = r.verdict === "sweep-invalid" ? "REFUSED (sweep-invalid)" : r.corroborated ? "CORROBORATED" : "not corroborated";
    return `${r.quantity} = ${r.value} -- ${head}: ${bits.join("; ")}`;
}

/**
 * CROSS-DEVICE CONSISTENCY. Two instruments that each pass their own gates can still disagree with each other,
 * and no single device can catch that -- it is the bug class the whole lab is otherwise blind to.
 *
 * The comparison is deliberately three-valued rather than pass/fail:
 *   "agree"      -- within tol: one quantity, two roads, no contradiction
 *   "disagree"   -- outside tol AND the two roads measure the SAME thing: a real finding, somebody is wrong
 *   "expected-gap"-- outside tol but the routes model DIFFERENT physics (declared via expectedGap), so the GAP
 *                   ITSELF is the measurement -- e.g. the exact Schwarzschild ISCO (6M) vs the Paczynski-Wiita
 *                   capture onset (~6.04M): the discrepancy is what PW's approximation costs, not an error.
 */
export function crossCheck({ quantity, a, b, tol, expectedGap = null }) {
    const diff = Math.abs(a.value - b.value);
    const scale = Math.max(Math.abs(a.value), Math.abs(b.value), 1e-300);
    const relDiff = diff / scale;
    const within = relDiff <= tol;
    let verdict;
    // A DECLARED GAP THAT VANISHES GETS ITS OWN VERDICT rather than being filed as "agree". Numerically the two
    // values do agree -- but they were declared NOT to, so agreement means the approximation's cost disappeared,
    // and something either changed or was never true. Folding that into "agree" would hide it in the one bucket
    // nobody re-reads.
    if (within && expectedGap) verdict = "gap-vanished";
    else if (within) verdict = "agree";
    else if (expectedGap) verdict = "expected-gap";
    else verdict = "disagree";
    return {
        quantity, verdict, agree: within, relDiff, diff,
        a: { source: a.source, value: a.value },
        b: { source: b.source, value: b.value },
        tol,
        expectedGap: expectedGap || null,
        // an expected gap that turns out to be WITHIN tolerance is itself notable: the approximation cost
        // vanished, which means either the claim about it was wrong or something changed.
        note: expectedGap && within ? "declared gap did NOT appear -- the approximation cost vanished; investigate" : null,
    };
}
