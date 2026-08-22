// tools/roundhouse/refinementKnobs.mjs
//
// v2907 -- CRITERION 3, AND THE DIFFERENCE BETWEEN A NUMBER THAT SETTLES AND ONE THAT MERELY EXISTS.
//
// v2904 measured the gap: 302 of the lab's 315 unkeyed observables live in modes with no declared refinement
// knob, so convergence has never been ASKED of them, let alone failed. That matters more than the other gaps
// because criterion 3 has the lab's only track record of catching something -- v2891 pointed it at the
// blobarium's "temperature nobody set" and found a grid artefact. One for one.
//
// WHAT A REFINEMENT KNOB IS, AND THE TRAP THE REGISTER EXISTS TO CLOSE. A refinement knob discretises the SAME
// problem more finely: more quadrature points, smaller timestep, denser grid. It is not any knob that happens to
// take a number. ising's L looks like a grid knob and is not one -- changing the lattice size changes the
// physical system, and the magnetisation is SUPPOSED to move with it (finite-size scaling). A sweep that cannot
// tell those apart will report real physics as non-convergence and congratulate itself. So every entry below
// carries the sentence saying why the knob refines the problem rather than replacing it.
//
// THE VERDICT IS THREE-VALUED, FOR THE SAME REASON v2906'S WAS. Successive differences that shrink mean the
// quantity is settling on something. Differences that do not shrink mean it is drifting, and a drifting number
// is not a measurement of anything -- it is a function of how hard you looked. And bit-identical values across
// every resolution mean the knob never reached the computation, which looks exactly like perfect convergence
// and must never be scored as one.

import { getDevice } from "./devices.mjs";
import { preRegister } from "./corroborate.mjs";

/**
 * THE REGISTER. `why` must state that this knob refines rather than redefines. `invariants` is not used here --
 * criterion 3 watches every number the mode reports, because the interesting failures are the ones nobody
 * thought to nominate.
 */
export const REFINEMENT_KNOBS = {
    // *** v3514 -- THE FIRST PROMOTION SINCE corroborationReach STARTED COUNTING. The census called blackhole
    // one knob short and named a REFINEMENT knob as what it lacked; escTol is one, measured rather than
    // assumed. It went looking for a different thing entirely -- v3512 suspected escTol of QUANTISING escapeV
    // and thereby faking the nuisance knob's bit-identical pass. IT DOES NOT (see knobCandidates), and the
    // sweep done to test that suspicion is what revealed a clean convergence sequence nobody had run.
    blackhole: {
        mode: "escape",
        param: "escTol",
        why: "escTol is the bracket width of the bisection that finds the escape velocity. The trajectory, the " +
             "integrator and the escape criterion are all unchanged; tightening it refines the ROOT-FIND of the " +
             "same function. MEASURED escapeV 0.532069109143, 0.532186557931, 0.532157195734, 0.532171876833, " +
             "0.532175547107 over escTol 1e-3 .. 1e-5, with steps 1.17e-4, 2.94e-5, 1.47e-5, 3.67e-6 -- " +
             "MONOTONE SHRINKING AND EACH STEP THE SIZE OF THE TOLERANCE ITSELF, which is what a converging " +
             "bisection looks like. *** AND THE GRADED ERROR DOES NOT FOLLOW IT DOWN: escapeErrFrac sits at " +
             "4.4250e-3 at escTol 1e-4 and 4.3907e-3 at 1e-6. THAT RESIDUAL IS THE MODEL'S, NOT THE SOLVER'S, " +
             "and no tolerance reduces a model error -- lens's 5.2% in a second device. Refining escTol " +
             "settles WHERE the root is, not whether the theory it is compared against applies. ***",
        values: [1e-3, 3e-4, 1e-4, 3e-5],
        base: 1e-4,
    },
    splat: {
        mode: "integral",
        param: "gridN",
        why: "gridN is the rasterisation resolution used to numerically integrate a projected Gaussian whose " +
             "exact integral is known in closed form. Refining it samples the SAME Gaussian more finely; the " +
             "underlying covariance, depth and focal length are untouched. This is the cleanest refinement knob " +
             "in the lab and serves as the POSITIVE CONTROL: integralErrFrac is a pure discretisation error and " +
             "must shrink, so if it does not, the sweep is blind and every other verdict here is worthless.",
        values: [64, 128, 256, 512],
        positiveControl: "integralErrFrac",
    },
    optics: {
        mode: "airy",
        param: "nSamples",
        why: "nSamples is the number of quadrature points across the aperture in the diffraction integral. " +
             "The aperture, wavelength and propagation distance are unchanged; only the sampling of the same " +
             "integral is refined.",
        values: [300, 600, 900, 1800],
    },
    quantum: {
        mode: "well",
        param: "N",
        why: "N is the number of spatial grid points used to discretise the Hamiltonian on a fixed domain of " +
             "length L. The potential and the box are unchanged; refining N is a finer discretisation of the " +
             "same eigenvalue problem, and the eigenvalues have a closed form to settle onto.",
        values: [200, 400, 800, 1600],
    },
    kepler: {
        mode: "conserve",
        param: "stepsPerOrbit",
        why: "stepsPerOrbit is the integrator timestep expressed per orbit. The orbit itself -- a, e, mu -- is " +
             "fixed; refining it integrates the SAME trajectory with a smaller h, and a symplectic integrator's " +
             "energy drift is a pure function of h.",
        values: [100, 200, 400, 800],
    },
    lens: {
        mode: "deflect",
        param: "dphi",
        why: "dphi is the RK4 step in the orbit equation d^2u/dphi^2 = 3M u^2 - u that tracePhoton integrates " +
             "from infinity and back. M and b -- the entire physical content of the problem -- are untouched; " +
             "refining dphi integrates the SAME null geodesic more finely, and the deflection has a series " +
             "expansion in M/b to settle onto. v3081 registers it because the device already had a nuisance " +
             "knob and lacked only this to face the full battery; measured CONVERGING with a final relative " +
             "step of 4.0e-11.",
        // OPERATING POINT, DECLARED. b = 60 puts the ray in the WEAK regime (b/bCrit = 11.55) where the 4M/b
        // answer key is valid. Without this the sweep runs at the device default b = 10, which is the MID band.
        base: { M: 1, b: 60 },
        // VALUES CHOSEN FROM A MEASURED CROSSOVER, not from habit. RK4 truncation falls as dphi^4 while
        // ACCUMULATED ROUND-OFF grows as 1/dphi, so below the crossover refining stops helping.
        //
        // v3132 -- THIS NOTE USED TO CONTRADICT ITS OWN VALUE LIST. It named the crossover at "about 4e-4" and
        // then said the four values "sit entirely above it" -- WITH 2e-4 IN THE LIST, which is below 4e-4. The
        // same shape v3131 found in lens.deflect's assumption, one file over: a stated bound and a thing that
        // violates it, both written by the same hand, neither ever compared to the other.
        //
        // AND THE STEP MAGNITUDES HID IT. Measured on deflectionMeasured at M=1, b=60: steps 8.0e-10, 1.0e-10,
        // 1.2e-11 -- shrinking the whole way, which is why c3 passed and why the note read as correct. WHAT
        // REVERSES IS THE DIRECTION: the value goes down, UP, then down again. A damped oscillation, not an
        // approach to a limit. Truncation error has a consistent sign; round-off does not.
        //
        // *** WORSE: THE NOISE FLOOR SCORES BETTER THAN REAL CONVERGENCE. *** contraction is last/first, so once
        // the value stops moving the last step is tiny and the ratio looks superb. The old list scored 1.52e-2;
        // these values, staying in the asymptotic regime, score 1.27e-1. CRITERION 3 REWARDED SWEEPING PAST THE
        // CROSSOVER, and the further past you went the better it looked.
        //
        // MEASURED for these three: signs ++ , zero reversals -- the value approaches from ONE SIDE. Adding a
        // coarser 1.28e-2 point reintroduces a reversal (signs -++), so there is an upper bound too: the step
        // gets too coarse for the asymptotic regime. THE KNOB HAS A WINDOW, NOT A FLOOR.
        crossover: 8e-4,          // v3132 -- declared, so a gate can check the values against it
        values: [6.4e-3, 3.2e-3, 1.6e-3],
    },
    chaos: {
        mode: "feigenbaum",
        param: "count",
        why: "count is how many period-doubling bifurcation points are located before the delta estimates are " +
             "formed. Each additional point refines the estimate of the SAME constant -- delta is a property of " +
             "the logistic map, not of how many doublings you bothered to find. NOTE the device's own comment " +
             "warns that locating a high-period bifurcation is precision-limited, which is the reason this entry " +
             "is the interesting one rather than a formality.",
        values: [3, 4, 5, 6],
    },
};

const isNum = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * Classify a sequence of values taken at increasing resolution.
 *
 * Uses successive absolute differences rather than distance from a limit, because for most of these there is no
 * answer key -- that is the whole point of criterion 3. A quantity that is settling has |v4-v3| < |v3-v2| <
 * |v2-v1|; one that is drifting does not.
 */
export function classifySequence(vals, knobValues = null) {
    if (vals.some((v) => !isNum(v))) return { verdict: "NON-FINITE" };
    // ECHO: the device is handing the knob back under another name. quantum reports `gridN` for what it was
    // given as `N`, chaos reports `cascadePoints` for `count`. Classifying those measures nothing.
    if (knobValues && vals.length === knobValues.length && vals.every((v, i) => v === knobValues[i])) {
        return { verdict: "ECHO", note: "the device reports the knob back under another name", vals };
    }
    if (vals.every((v) => Object.is(v, vals[0]))) {
        return { verdict: "SUSPECT-bit-identical", note: "knob may not have reached this quantity", vals };
    }
    // v3133 -- SIGNED FIRST, so the DIRECTION survives. The line below used to take Math.abs immediately and
    // the sign was gone before anything could look at it: classifySequence tested MAGNITUDE ONLY while
    // classifyPlacement (three points, same job) required strict monotonicity. Two classifiers, one question,
    // different strictness -- and the four-value one was the lenient one.
    const signed = [];
    for (let i = 1; i < vals.length; i++) signed.push(vals[i] - vals[i - 1]);
    // A ZERO STEP IS NOT A DIRECTION CHANGE. My first census counted them as reversals and reported 4 across
    // the registers; the true number is 2. Math.sign(0) is 0 and differs from both neighbours, which turns a
    // sequence that simply stopped moving into one that supposedly turned round.
    const nz = signed.filter((x) => x !== 0);
    let reversals = 0;
    for (let i = 1; i < nz.length; i++) if (Math.sign(nz[i]) !== Math.sign(nz[i - 1])) reversals++;

    const d = signed.map(Math.abs);
    const shrinking = d.every((x, i) => i === 0 || x <= d[i - 1]);
    const last = d[d.length - 1], first = d[0];
    const scale = Math.max(...vals.map(Math.abs), Number.MIN_VALUE);
    const contraction = first > 0 ? last / first : 0;

    // FLOOR-LIMITED, and this guard exists because the first run of this file did not have it and reported
    // splat's integralErrFrac and kepler's angularMomentumErr as DRIFTING. Both are error-like quantities whose
    // entire sequence lives below 1e-12: at that magnitude the differences are accumulated summation rounding,
    // not the discretisation the knob controls, and calling that "drift" is the same mistake v2905 caught in the
    // amplification table -- a relative statement about a number at the numerical floor. A sequence that never
    // leaves the floor has nothing to converge, and saying so is different from saying it failed to.
    if (scale < 1e-12 || (Math.max(...vals) - Math.min(...vals)) / scale < 1e-12) {
        return { verdict: "FLOOR-LIMITED", diffs: d, contraction, finalStepRel: last / scale, vals,
            note: "sequence, or its entire variation, sits at the double-precision floor; the differences are " +
                  "summation rounding rather than the discretisation the knob controls" };
    }
    return {
        // v3133 -- THE VERDICT IS UNCHANGED. `reversals` is REPORTED, not judged, and the measurement is why.
        //
        // I proposed promoting a sign test to a criterion and the census said DO NOT. 22 moving quantities
        // across the six registers; TWO genuinely reverse. One of them is chaos/deltaBest: 4.7588, 4.6485,
        // 4.6772, 4.6772 -- STRADDLING 4.6692, THE FEIGENBAUM CONSTANT, with the steps shrinking 1.1e-1 ->
        // 2.9e-2 -> 0. THAT IS ALTERNATING CONVERGENCE, and it is convergence: a criterion built on sign would
        // have failed a correct estimate of a real mathematical constant.
        //
        // The other, kepler/energyGrowthRatio, has steps 6.3e-9, 9.1e-9, 9.0e-9 -- NOT shrinking -- so the test
        // that already exists catches it. The sign added nothing there and would have cost chaos.
        //
        // SO A REVERSAL IS A SIGNAL, NOT A FAULT. It says the sequence approaches from both sides, which is
        // true of an alternating series AND of round-off wander, and NOTHING IN THE SIGN ALONE SEPARATES THEM.
        // What separated them for lens at v3132 was the crossover -- a measured property of the instrument, not
        // of the sequence. Reported here so the next person has the number without inheriting a verdict.
        verdict: contraction <= 0.5 ? "CONVERGING" : "DRIFTING",
        diffs: d, signedDiffs: signed, reversals, contraction, monotoneShrinking: shrinking,
        finalStepRel: last / scale,
        vals,
    };
}

export async function runRefinement(name, knob = REFINEMENT_KNOBS[name]) {
    const dev = await getDevice(name);
    const runs = [];
    for (const v of knob.values) {
        runs.push({ v, obs: await dev.build({ mode: knob.mode, config: { [knob.param]: v } }) });
    }
    const keys = new Set(runs.flatMap((r) => Object.keys(r.obs || {})));
    const fields = [];
    for (const k of keys) {
        const vals = runs.map((r) => r.obs?.[k]);
        if (!vals.every(isNum)) continue;
        // the knob itself is echoed back by several devices; classifying it is noise
        if (k === knob.param) continue;
        fields.push({ field: k, ...classifySequence(vals, knob.values) });
    }
    const live = fields.some((f) => ["CONVERGING", "DRIFTING", "FLOOR-LIMITED", "ECHO"].includes(f.verdict));
    return {
        device: name, mode: knob.mode, param: knob.param, values: knob.values, live, fields,
        positiveControl: knob.positiveControl
            ? fields.find((f) => f.field === knob.positiveControl) || { field: knob.positiveControl, verdict: "ABSENT" }
            : null,
    };
}

export async function refinementSweep(knobs = REFINEMENT_KNOBS) {
    const out = [];
    for (const [name, knob] of Object.entries(knobs)) {
        try { out.push(await runRefinement(name, knob)); }
        catch (e) { out.push({ device: name, error: String(e.message || e) }); }
    }
    return out;
}

/**
 * PRE-REGISTERED before the sweep was run, and deliberately a prediction that something FAILS -- every
 * pre-registration in this tree so far has predicted a pass, which is its own selection effect.
 *
 * v2905 measured that chaos.feigenbaum.deltaSpread moves from 0.110 to 12.23 under a one-ulp libm shift, an
 * amplification of 8.7e17, and identified it as a difference of ratios whose denominators nearly vanish near a
 * precision-limited bifurcation. If that reading is right, then adding cascade points cannot make deltaSpread
 * settle -- each new point is harder to locate than the last, so the SPREAD of the estimates should grow rather
 * than contract. Meanwhile deltaBest, which is the estimate closest to the constant, should converge toward
 * 4.6692016 because that is what the device claims it does.
 *
 * So: deltaSpread DRIFTING and deltaBest CONVERGING, in the same sweep, on the same knob. If deltaSpread
 * converges, my v2905 reading of it was wrong and I should say so. If deltaBest also drifts, the device's
 * headline claim is weaker than its comment says.
 */
export const REFINEMENT_REGISTRATION = preRegister({
    quantity: "chaos.feigenbaum deltaSpread vs deltaBest under cascade refinement",
    claim: { observable: "deltaSpreadDrifts", target: true },
    rationale: "v2905 found deltaSpread amplifies a one-ulp libm shift by 8.7e17 because it is a difference of " +
        "ratios taken across precision-limited bifurcation points. A quantity limited by how well you can locate " +
        "a high-period doubling cannot settle as you add harder-to-locate doublings. Predicting deltaSpread " +
        "DRIFTING and deltaBest CONVERGING on the same knob in the same sweep. Registered as a predicted FAILURE " +
        "because every prior registration in this tree predicted a pass.",
});

export function refinementLines(rows) {
    const L = [];
    for (const r of rows) {
        if (r.error) { L.push(`  ${r.device}: ERROR ${r.error}`); continue; }
        L.push(`  ${r.device}.${r.mode} -- refine '${r.param}' over ${r.values.join(", ")}` + (r.live ? "" : "   [KNOB NOT LIVE]"));
        for (const f of r.fields.sort((a, b) => (a.verdict > b.verdict ? 1 : -1))) {
            const tail = f.contraction !== undefined ? `  contraction ${f.contraction.toExponential(2)}` : "";
            L.push(`      ${f.field}: ${f.verdict}${tail}`);
        }
    }
    return L;
}
