// tools/roundhouse/nuisanceKnobs.mjs
//
// v2906 -- CRITERION 2, FOR THE FIRST TIME.
//
// v2891 asked for seed stability. v2902 found that asking was nearly meaningless: the lab is deterministic, so a
// seed sweep returns bit-identical values almost everywhere and passes for free. It replaced the criterion with
// NUISANCE-PARAMETER INVARIANCE -- vary a knob the physics says cannot matter, and the answer must not move --
// and then, correctly, refused to let a device declare determinism without supplying such a knob.
//
// Nobody ever supplied one. v2904's census counted it: zero devices declare a nuisance parameter, so criterion 2
// has been untested lab-wide since the machinery was built. This file is the first four.
//
// WHY THIS IS THE STRONGEST OF THE FOUR CRITERIA WHEN IT CAN BE RUN. Pre-registration is bookkeeping.
// Convergence asks whether a number is stable against ITS OWN discretisation, which the number's author chose.
// Portability asks whether the machine agrees. But a nuisance parameter is a claim about the PHYSICS: rotate the
// frame, restart the stream, change the units, and a real property is unmoved. There is no tolerance to negotiate
// downward, because the expected answer is invariance. Anything else is a finding.
//
// TWO THINGS THE LAB WAS ALREADY DOING AND NOT CALLING BY THIS NAME:
//   - chaos's Lyapunov entry passes `seeds`, which are initial conditions of a deterministic map. corroborate.mjs
//     already records that this was a nuisance parameter misnamed.
//   - splat.integral computes `isoRollDeviation`: it rotates an isotropic covariance through 0.3, 1.1 and 2.7
//     radians and reports the largest change in the projected 2D covariance. That is a nuisance invariance test,
//     written into the device, never labelled as one. It currently reads 1.11e-14 -- the invariance holds.
//
// THE LIVENESS PROBLEM, WHICH IS THE WHOLE DIFFICULTY. An unwired knob looks exactly like a perfect invariance.
// If a nuisance parameter never reaches the arithmetic, every value comes back bit-identical and the criterion
// reports a flawless pass -- the same failure shape as v2902's vacuous seed sweep and v2891's portability flag
// measured on an un-awaited promise. So every knob below must be shown to REACH the computation, and the sweep
// records bit-identical outcomes as SUSPECT rather than as success. For a genuine invariance the values should
// agree to within tolerance while NOT being bit-identical -- the arithmetic differed and the answer did not.

import { getDevice } from "./devices.mjs";
import { preRegister } from "./corroborate.mjs";

/**
 * THE REGISTER. A knob may not be added without the sentence saying why the physics forbids it from mattering.
 * `invariants` names the observables the claim covers; anything else the device reports is allowed to move, and
 * listing them explicitly is what stops this from being a sweep that quietly ignores its own failures.
 */
export const NUISANCE_KNOBS = {
    ising: {
        mode: "order",
        param: "seed",
        why: "Metropolis is a stochastic sampler. The equilibrium magnetisation and energy per spin are " +
             "properties of (L, T); which pseudorandom stream visited that equilibrium is not a property of " +
             "anything. This is criterion 2 in its ORIGINAL sense -- ising is the one device in the lab with " +
             "genuine stochastic input, which is why v2902's 'this lab has no unseeded randomness' is true of " +
             "the default build and not of the device.",
        values: [12345, 777, 31337, 9, 20260724],
        apply: (cfg, v) => ({ ...cfg, seed: v }),
        invariants: ["magnetisation", "energy"],
        tol: 0.02,
    },
    kepler: {
        mode: "kepler3",
        param: "scale",
        why: "The two-body problem is scale invariant: a -> lambda*a together with mu -> lambda^3*mu leaves the " +
             "orbital period unchanged, because T = 2*pi*sqrt(a^3/mu). The eccentricity is dimensionless and " +
             "cannot move at all. Every floating-point operation in the integrator sees different numbers, so " +
             "this knob is emphatically live -- and the exponent in Kepler's third law is exactly the quantity " +
             "that must not notice. *** THAT LAST SENTENCE WAS FALSE FOR 436 VERSIONS AND v3517 FIXED THE CAUSE: " +
             "keplerBind PASSED NEITHER `mu` NOR `a` INTO THE SLOPE PATH, so mu 1 -> 1000 left every observable " +
             "BIT-IDENTICAL and the compensating half of a compensated pair was dropped on the floor. What was " +
             "under test was invariance under `a` alone, a WEAKER claim than the one written here. ***",
        // NON-DYADIC ADDED AT v3517 for the reason splat's entry records: 1 and 2 are dyadic and perturb only
        // the exponent, so two of the three original values could not move a mantissa between them.
        values: [1, 2, 7.3, 0.31],
        apply: (cfg, lam) => ({ ...cfg, a: (cfg.a ?? 1) * lam, mu: (cfg.mu ?? 1) * lam ** 3 }),
        // energyDimensionless and angMomDimensionless are STRONGER than the two above, because they are built
        // from the very quantities the knob moves: E*a/mu is exactly -1/2 and L/sqrt(mu*a*(1-e^2)) exactly 1,
        // so they cannot be satisfied by a device that ignores its config.
        invariants: ["slopeMeasured", "periodErrFrac", "energyDimensionless", "angMomDimensionless"],
        tol: 1e-6,
    },
    chaos: {
        mode: "lyapunov",
        param: "x0",
        why: "For almost every initial condition in the chaotic regime the logistic map has the SAME Lyapunov " +
             "exponent -- that is what makes the exponent a property of r rather than of the trajectory. The " +
             "device already varied this and called it a seed; naming it correctly is most of the work.",
        values: [0.1, 0.2718, 0.5, 0.83],
        apply: (cfg, v) => ({ ...cfg, x0: v }),
        invariants: ["lyapunovValue"],
        tol: 0.02,
        // FINDING, recorded rather than deleted: this knob CANNOT BE APPLIED through the device interface.
        // chaosBind's config accepts r, warmup and count -- there is no x0. The Lyapunov corroboration in
        // physicsBaseline.mjs reaches past the device and calls the physics module directly, which is why the
        // lab's one pre-existing nuisance test was never expressible as a device-level one. The sweep reports
        // this as NOT LIVE, which is the correct verdict and is why the entry stays: deleting it would hide the
        // gap. Exposing x0 on chaosBind is a small scoped round.
        unreachable: "chaosBind config exposes r/warmup/count only; x0 is not a device parameter",
    },
    lens: {
        mode: "deflect",
        param: "scale",
        why: "SCHWARZSCHILD DEFLECTION DEPENDS ONLY ON M/b. M and b are the only length scales in the problem " +
             "and the deflection angle is dimensionless, so alpha is a function of the single ratio M/b -- the " +
             "series alpha = 4(M/b) + (15pi/4)(M/b)^2 + (128/3)(M/b)^3 says so term by term. Scaling both by " +
             "lambda is therefore an EXACT invariance with a physical reason, not a tolerance to negotiate. " +
             "It reaches the integrator: tracePhoton carries u = 1/r and du/dphi = 1/b, and accel(u) = 3M u^2 - " +
             "u, so u -> u/lambda scales the ENTIRE RK4 state by 1/lambda while phi and dphi are untouched. " +
             "Every float in the loop differs and the angle must not.",
        // NON-DYADIC ON PURPOSE, and this is the finding that shaped the entry. Scaling by a POWER OF TWO is
        // exact in IEEE-754 -- it only moves the exponent -- so it distributes over every add and multiply in
        // the RK4 and the answer comes back BIT-IDENTICAL. Measured: lambda in {1,2,4,8} gives
        // 0.070150808316456370 four times. The sweep would report SUSPECT and be unable to tell an exact
        // invariance from a knob that was never wired, which is precisely the failure this module exists to
        // detect. A dyadic lambda is a knob that moves nothing; 3, 7.3 and 0.37 perturb every mantissa.
        values: [1, 3, 7.3, 0.37],
        // The SAME operating point the refinement knob declares, so criteria 2 and 3 are two statements about
        // one quantity rather than two quantities sharing a name. apply is a pure transform of it.
        base: { M: 1, b: 60, dphi: 1.6e-3 }   /* v3134 -- WAS 2e-4, BELOW THE 8e-4 CROSSOVER. v3132 corrected the
        // REFINEMENT register and left this one, so c2 swept invariance at a point c3 had just been moved off.
        // And because corroborateFully reports the OPERATING POINT from the nuisance base, the whole standing
        // came back UNSOUND with all four criteria passing -- v3081's harness bug in a new coat: TWO CRITERIA
        // ABOUT ONE QUANTITY AT TWO DIFFERENT OPERATING POINTS. 1.6e-3 is inside the measured window AND is one
        // of the refinement values, so the two agree by construction rather than by coincidence. */,
        apply: (cfg, lam) => ({ ...cfg, M: (cfg.M ?? 1) * lam, b: (cfg.b ?? 60) * lam }),
        // v3518 -- *** deflectionErrFrac IS ADDED BECAUSE IT WAS ALREADY ONE. *** In the weak regime the bind
        // assigns `deflectionErrFrac = relWeak` and in the strong regime `= relStrong`, so at this operating
        // point it is BIT-FOR-BIT the declared invariant relWeak UNDER A SECOND NAME. Leaving it undeclared
        // made it count as LIVENESS EVIDENCE while its twin counted as the thing being held still: the same
        // number was simultaneously proof the knob reaches the arithmetic and proof the physics ignores it.
        // Two declarations about one quantity that nobody compared, deciding a whole device's verdict.
        //
        // rMinOverB is STRONGER than either of the two originals: r_min/b is a nontrivial function of M/b with
        // NO CLOSED FORM ANYWHERE IN THIS TREE -- it comes out of the RK4 and nowhere else -- so it cannot be
        // satisfied by a device that ignores its config, and it is built from the one quantity the knob moves.
        invariants: ["deflectionMeasured", "relWeak", "deflectionErrFrac", "rMinOverB"],
        // DERIVED, NOT CHOSEN. The integrator's own refinement residual for this quantity is 4.0e-11
        // (dphi over 8e-4..1e-4, classifySequence finalStepRel). An invariance judged looser than the
        // discretisation error of the method would be judged inside its own noise. 1e-10 sits just above that
        // residual; the measured spread is 2.1e-14, roughly 1900x smaller, and the gate asserts the ordering
        // rather than trusting this number.
        tol: 1e-10,
        // b is handed straight back as impactParameter and bCrit is the closed form 3 sqrt(3) M. Both are
        // LENGTHS, so both scale by lambda -- and neither has been anywhere near the integrator. See the
        // liveness note on runNuisance.
        echoes: ["impactParameter", "bCrit"],
    },
    splat: {
        mode: "perspective",
        param: "scale",
        why: "THE 1/z^2 FALLOFF IS A PROPERTY OF PERSPECTIVE PROJECTION AND OF NOTHING ELSE. A Gaussian's " +
             "world-space extent (sigma) and the camera's focal length (f) are PURE MULTIPLICATIVE SCALE " +
             "FACTORS on the projected area: area = (f*sigma/z)^2, so scaling either multiplies every area " +
             "by a constant. In log-log that ADDS A CONSTANT TO EVERY y, WHICH MOVES THE INTERCEPT AND " +
             "CANNOT MOVE THE SLOPE. So the graded quantity -- the measured exponent -- must not notice, " +
             "while every float in the fit differs. v3500's shape: a constant factor shifts the intercept " +
             "of a convergence line and not its slope.",
        // NON-DYADIC, AND THE LENS ENTRY IS WHY. A power-of-two lambda only moves the exponent in IEEE-754,
        // so it distributes exactly and the answer comes back BIT-IDENTICAL -- SUSPECT rather than a pass.
        // MEASURED HERE AND IT BIT HARDER THAN EXPECTED: sigma alone is bit-identical across 0.023, 0.07,
        // 0.31 AND 0.53 -- NON-DYADIC VALUES ARE NOT ENOUGH ON THEIR OWN when the parameter enters as a
        // single squared factor. Scaling sigma AND f together perturbs two independent mantissas and the
        // sweep is not bit-identical: spread 6.41e-17 with the slope holding at -2.
        //
        // Both stay inside the device's own clamps at these lambdas (sigma 0.023..0.3 of [0.005, 1];
        // f 184..2400 of [50, 4000]), so no value is silently clamped into agreeing with its neighbour.
        values: [1, 3, 0.37, 0.23],
        base: { sigma: 0.1, f: 800 },
        apply: (cfg, lam) => ({ ...cfg, sigma: (cfg.sigma ?? 0.1) * lam, f: (cfg.f ?? 800) * lam }),
        // ONLY THE SLOPE. areaSlopeErr is |slope + 2| and sits at ~1e-16, so runNuisance's RELATIVE spread
        // would divide a round-off difference by a round-off mean and report a violation on a correct device
        // -- a tolerance quietly indexed to a quantity that is supposed to be zero.
        invariants: ["areaSlope"],
        // DERIVED, NOT CHOSEN. The measured spread is 6.41e-17; the fit's own round-off floor is one ulp of 2,
        // i.e. 2.2e-16. 1e-12 sits four orders above the floor and fourteen below anything the physics could
        // do, and the gate asserts the ORDERING rather than trusting this number.
        tol: 1e-12,
        // NOT echoes. areaIntercept and areaAtUnitDepth are COMPUTED BY THE FIT, not handed back from the
        // config, and they are the whole reason this knob can be shown live at all -- see the note below.
    },
    blackhole: {
        mode: "escape",
        param: "dtHalving",
        why: "NOT a nuisance parameter, and it is here as a NEGATIVE CONTROL. Halving the timestep is a " +
             "refinement knob: the physics says the answer should CONVERGE, not stay put, so a sweep over it " +
             "must show movement. If this comes back invariant while the others move, the sweep is measuring " +
             "nothing and every pass above is vacuous.",
        values: [0.02, 0.01, 0.005],
        apply: (cfg, v) => ({ ...cfg, dt: v }),
        invariants: ["escapeV"],
        tol: 0,
        negativeControl: true,
    },
};

const isNum = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * Sweep one device's nuisance knob and report, per declared invariant, whether it moved.
 *
 * Reports three outcomes rather than two, because the middle one is the trap:
 *   INVARIANT   values differ in the last bits but agree within tolerance -- the knob reached the arithmetic and
 *               the physics did not care. This is the only real pass.
 *   SUSPECT     every value bit-identical. Consistent with a perfect invariance AND with a knob that was never
 *               wired up, and this sweep cannot tell those apart. Reported, never counted as a pass.
 *   VIOLATED    spread exceeds tolerance.
 */
export async function runNuisance(name, knob = NUISANCE_KNOBS[name]) {
    const dev = await getDevice(name);
    const runs = [];
    for (const v of knob.values) {
        const cfg = knob.apply(knob.base ? { ...knob.base } : {}, v);
        runs.push({ v, obs: await dev.build({ mode: knob.mode, config: cfg }) });
    }
    const fields = [];
    for (const f of knob.invariants) {
        const vals = runs.map((r) => r.obs?.[f]).filter(isNum);
        if (vals.length !== runs.length) { fields.push({ field: f, verdict: "ABSENT", note: "device did not report it" }); continue; }
        const bitIdentical = vals.every((x) => Object.is(x, vals[0]));
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1));
        const spread = Math.abs(mean) > 0 ? sd / Math.abs(mean) : (sd > 0 ? Infinity : 0);
        const verdict = bitIdentical ? "SUSPECT-bit-identical"
            : spread <= knob.tol ? "INVARIANT"
            : "VIOLATED";
        fields.push({ field: f, vals, mean, spread, bitIdentical, verdict });
    }
    // LIVENESS, AND AN ECHOED INPUT IS NOT EVIDENCE OF IT.
    //
    // v3081 -- the original test asked whether ANY reported number moved. lens broke it: the deflect mode hands
    // back impactParameter (which IS the config's b) and bCrit (the closed form 3 sqrt(3) M). Both are lengths,
    // both scale by lambda, and NEITHER has been through the integrator -- so a device whose physics ignored its
    // configuration entirely would still report LIVE by 107% movement, and every invariance verdict resting on
    // that would be unearned. Demonstrated with a stub in the gate rather than argued here.
    //
    // TWO CLAIMS WERE WEARING ONE LABEL, the shape this tree keeps meeting. They are now separate:
    //   delivered  the config reached the device -- something it reports changed, echoes included.
    //   live       the COMPUTATION used it -- something that is not an echo of the input changed.
    // A knob may only be `live` on the second. `echoes` defaults to empty, so every knob written before this
    // keeps exactly the verdict it had.
    // v3516 -- AND A THIRD THING IS WEARING THE LABEL: **ROUND-OFF IN THE INVARIANT ITSELF**.
    //
    // splat's knob is registered with `invariants: ["areaSlope"]`, and the sabotage that should have taken its
    // gate red DID NOT: with every other reported field stripped out, areaSlope STILL "moved" -- BY ONE ULP --
    // and the sweep read LIVE. THE SAME 6.4e-17 WOBBLE WAS SIMULTANEOUSLY THE EVIDENCE THAT THE KNOB REACHES
    // THE ARITHMETIC AND THE EVIDENCE THAT THE PHYSICS DOES NOT CARE. A quantity cannot be its own liveness
    // witness: a knob wired to nothing but the last mantissa bit is indistinguishable from one wired to
    // nothing at all. v3081 split `delivered` from `live` because an ECHOED INPUT is not evidence; this is
    // that defect one step further in.
    //
    // *** IT IS **REPORTED** AND NOT ENFORCED, AND THAT IS v3132'S RULE RATHER THAN TIMIDITY. Enforcing it
    // was tried and MEASURED FIRST: it turns kepler NOT LIVE, because the only field that moves under its
    // scale knob is periodErrFrac -- AN INVARIANT -- at 2.45e-10, everything else bit-identical. lens survives
    // only via deflectionErrFrac (5.64e-13), which is a DERIVED FUNCTION of its own invariant, so its evidence
    // is the same round-off one derivation removed. So the honest split across the five live registrations is:
    //   ising  magnetisationErrFrac 7.1e-1, susceptibility 5.9e-1, specificHeat 1.5e-1   REAL
    //   splat  areaIntercept 6.2e-1, areaAtUnitDepth 2.0e+0                              REAL
    //   lens   deflectionErrFrac 5.6e-13, derived from the invariant                     SHADOW
    //   kepler nothing but periodErrFrac itself                                          NONE
    // TURNING THAT INTO A FAILING RULE IS A BATTERY CHANGE EVERY DEVICE MUST SURVIVE, and two would not on
    // first contact -- v3132's standing warning, which is why the sign test never became a criterion either.
    // NAMED, NOT SLIPPED IN. The fix for kepler is the fix splat just got: a second observable the knob is
    // ALLOWED to move. ITS OWN ROUND. ***
    const echoes = new Set(knob.echoes || []);
    const invariantSet = new Set(knob.invariants || []);
    const allFields = new Set(runs.flatMap((r) => Object.keys(r.obs || {})));
    const movedField = (f) => {
        const vals = runs.map((r) => r.obs?.[f]).filter(isNum);
        return vals.length === runs.length && !vals.every((x) => Object.is(x, vals[0]));
    };
    const liveEvidenceList = [...allFields].filter((f) => movedField(f) && !echoes.has(f) && !invariantSet.has(f));
    let anyMoved = false, anyDelivered = false;
    for (const f of allFields) {
        if (!movedField(f)) continue;
        anyDelivered = true;
        if (!echoes.has(f)) { anyMoved = true; }
    }
    return {
        device: name, param: knob.param, mode: knob.mode, values: knob.values,
        live: anyMoved, delivered: anyDelivered, echoes: [...echoes], negativeControl: !!knob.negativeControl, fields,
        // WHICH fields supplied the liveness, and whether ANY of them is something the knob is allowed to
        // move. `liveEvidence` empty while `live` is true means the verdict rests on round-off in the
        // invariant -- see the note above. Reported so it cannot go unnoticed again.
        liveEvidence: liveEvidenceList,
        verdict: (() => {
            const comparable = fields.filter((f) => f.verdict !== "ABSENT");
            // A sweep with nothing to compare must never read as a pass. The first run of this file reported
            // blackhole INVARIANT while every declared field was ABSENT -- a green verdict resting on zero
            // evidence, which is the exact shape of the bug this module is built to detect elsewhere.
            if (!comparable.length) return "NO COMPARABLE FIELDS -- every declared invariant was absent from the build";
            if (!anyMoved) {
                // Naming which of the two it is, because the fixes are different: an undelivered knob is a
                // wiring problem, a delivered-but-dead one means the device accepted the parameter and the
                // arithmetic ignored it -- worse, and invisible before echoes were named.
                return anyDelivered
                    ? "KNOB DELIVERED BUT NOT LIVE -- only ECHOES of the input moved (" + [...echoes].join(", ") +
                      "); nothing computed noticed, so invariance here is unearned"
                    : "KNOB NOT LIVE -- no reported number moved; invariance here is unearned";
            }
            // v3518 -- *** PROMOTED FROM A REPORT TO A RULE, AND ONLY BECAUSE THE COST WAS MEASURED FIRST. ***
            // v3516 found that `live` could rest entirely on ROUND-OFF IN A DECLARED INVARIANT and reported
            // liveEvidence rather than enforcing it, because enforcing it then would have turned kepler NOT
            // LIVE and left lens on one derived field -- v3132's rule that a new criterion is a BATTERY change
            // every device must survive. Since then kepler's dead `mu` was found and wired (v3517) and lens
            // gained rMin (v3518), and ALL FIVE live registrations now carry admissible evidence: ising 3
            // fields, kepler 3, splat 3, lens 1, blackhole 1. THE RULE COSTS NOTHING TODAY BECAUSE THE TWO
            // ROUNDS THAT PAID FOR IT CAME FIRST. Not a threshold anybody had to choose -- an emptiness test.
            if (!liveEvidenceList.length) {
                return "LIVE ONLY ON ROUND-OFF -- every field that moved is an ECHO or a DECLARED INVARIANT, " +
                       "so the knob has no witness it is ALLOWED to move and the invariance is unearned";
            }
            // For a negative control the semantics invert: the knob is a REFINEMENT knob, so movement is the
            // pass and invariance is the failure.
            if (knob.negativeControl) {
                return comparable.some((f) => f.verdict === "VIOLATED")
                    ? "CONTROL OK -- the refinement knob moved the answer, so the sweep can detect movement"
                    : "CONTROL FAILED -- a refinement knob left the answer put; every INVARIANT above is suspect";
            }
            if (comparable.some((f) => f.verdict === "VIOLATED")) return "VIOLATED";
            if (comparable.some((f) => f.verdict === "SUSPECT-bit-identical")) return "SUSPECT";
            return "INVARIANT";
        })(),
    };
}

export async function nuisanceSweep(knobs = NUISANCE_KNOBS) {
    const out = [];
    for (const [name, knob] of Object.entries(knobs)) {
        try { out.push(await runNuisance(name, knob)); }
        catch (e) { out.push({ device: name, error: String(e.message || e) }); }
    }
    return out;
}

/**
 * PRE-REGISTERED, and the sequencing is stated because it matters.
 *
 * An exploratory run was made first: ising's magnetisation across five seeds at the default T = 2.0, giving a
 * relative spread of 7.05e-3, comfortably inside the 2% tolerance. That measurement is EXPLORATORY and is not
 * offered as criterion-1 evidence -- it was taken before any claim was frozen, and retrofitting a prediction to
 * it is exactly the move the four criteria exist to prevent.
 *
 * What follows has not been measured. The logistic prediction is that seed spread is not a fixed property of the
 * device but a function of temperature, and that it blows up approaching the critical point at Tc = 2/ln(1+sqrt2)
 * = 2.269, because critical slowing down means the correlation time diverges and 400 warmup sweeps stop being
 * anywhere near equilibration. If that is right, the device's magnetisation is trustworthy at T = 2.0 and
 * untrustworthy near Tc, and reporting it as one number with one tolerance is wrong.
 */
export const NUISANCE_REGISTRATION = preRegister({
    quantity: "ising magnetisation seed spread at T = 2.27 versus T = 2.0",
    claim: { observable: "spreadRatio", min: 3 },
    rationale: "critical slowing down: the correlation time diverges at Tc = 2.269, so a fixed 400-sweep warmup " +
        "equilibrates well at T = 2.0 and poorly at Tc. Predicting the near-critical seed spread exceeds the " +
        "T = 2.0 spread by at least 3x. The T = 2.0 figure (7.05e-3) was measured exploratorily beforehand and " +
        "is disclosed as such; the ratio is the untested claim. Failure mode worth naming: if the spread does " +
        "NOT grow, either the sampler is better than I think or the magnetisation is being averaged in a way " +
        "that hides the fluctuation, and both are worth knowing.",
});

export function nuisanceLines(rows) {
    const L = [];
    for (const r of rows) {
        if (r.error) { L.push(`  ${r.device}: ERROR ${r.error}`); continue; }
        L.push(`  ${r.device}.${r.mode} -- nuisance '${r.param}' over ${r.values.length} values: ${r.verdict}` +
            (r.negativeControl ? "  [NEGATIVE CONTROL: movement expected]" : ""));
        for (const f of r.fields) {
            L.push(`      ${f.field}: ${f.verdict}` + (f.spread !== undefined ? `  spread ${f.spread.toExponential(2)}` : "") +
                (f.note ? `  (${f.note})` : ""));
        }
    }
    return L;
}
