// tools/roundhouse/physicsBaseline.mjs
//
// v2891 -- THE BASELINE THE FINGERPRINT DELIBERATELY DOES NOT COVER.
//
// tools/fingerprint/BASELINE.md pins fifty subsystem HASHES: it answers "did the bits change", which is the
// right question for cross-architecture reproducibility and the wrong question for physics. A hash tells you
// something moved; it cannot tell you WHAT, or whether the new number is still right. Change the Ising RNG and
// the hash moves -- as it should -- but so does the hash if you fix a typo in a comment-adjacent constant, and
// neither says whether the critical temperature is still 2.269.
//
// This is the other baseline: MEASURED OBSERVABLES, pinned with the tolerance each one has earned. It answers
// "did the physics move", and it is the regression test for every device in the registry.
//
// THREE KINDS OF ENTRY, and the distinction is the whole point of this phase:
//
//   "keyed"        The value has a closed form (Onsager's Tc, ln 2, exactly 6M). The tolerance is the
//                  integrator's earned error. A drift here means the SIMULATION broke.
//   "unkeyed"      No closed form exists. The value is what this engine measures, corroborated by
//                  corroborate.mjs (pre-registered, seed-stable, resolution-stable, portable). A drift here
//                  means either the simulation changed or the measurement was never a property in the first
//                  place -- and the corroboration record is what lets you tell those apart.
//   "artefact"     A number that is KNOWN NOT to be a property -- it depends on resolution or another knob.
//                  Recorded ON PURPOSE, with its condition, because the engine's own history shows how easily
//                  such a number gets quoted as if it were physics (v2596's "temperature nobody set" was quoted
//                  as 0.0187 for 295 versions; it is 0.0261 at n=24 and 0.0114 at n=48).
//
// An artefact entry is not a failure. Pinning it WITH its condition is how a number stops being a rumour.

import { corroborate, preRegister, crossCheck } from "./corroborate.mjs";

// ---- the pinned measurements -------------------------------------------------------------------------------------
// Every value here was measured on x86_64 by the runner below. `tol` is relative unless noted absolute.
export const BASELINE = [
    {
        id: "logistic-lyapunov-r4",
        kind: "keyed",
        quantity: "Lyapunov exponent of the logistic map at r=4",
        value: 0.693145632,
        tol: 1e-5,
        key: "ln 2 = 0.6931471805599453 (exact for the fully chaotic logistic map)",
        note: "the estimator's OWN validation: it recovers the one point that has a closed form to 9 digits, which is what earns it the right to be used where there is none",
    },
    {
        id: "logistic-lyapunov-r38",
        kind: "unkeyed",
        quantity: "Lyapunov exponent of the logistic map at r=3.8",
        value: 0.431928,
        tol: 2e-3,
        key: null,
        note: "no closed form exists at generic r. Corroborated: pre-registered, seed-stable across four initial conditions (~0.01%), resolution-stable in iteration count (~0.03% at the last refinement), and portable by construction (strictLog2, zero raw libm calls -- the Math.log spelling of the SAME quantity makes 20,000 unspecified calls and is per-platform)",
    },
    {
        id: "isco-schwarzschild",
        kind: "keyed",
        quantity: "ISCO radius, exact Schwarzschild geodesic (M=1)",
        value: 6,
        tol: 1e-12,
        key: "6M, exact",
    },
    {
        id: "isco-pw-onset",
        kind: "unkeyed",
        quantity: "Paczynski-Wiita capture onset radius (M=1), under a 1e-5 sub-circular perturbation",
        value: 6.0357421875,
        tol: 5e-3,
        key: null,
        condition: "M=1 EXACTLY, onsetTol=0.02, onsetV0Frac=0.99999 -- DISCONTINUOUS IN M",
        note: "the PW approximation's cost at the ISCO. Not 6M and not supposed to be -- see the cross-check below, where the GAP is the measurement. " +
            "v2893 CAVEAT, found by the planted-error sweep: this observable is deterministic but NOT CONTINUOUS in the central mass. " +
            "At nominal M it is stable under refinement of both the search tolerance (6.0434/6.0357/6.0319/6.0338 at onsetTol 0.05/0.02/0.01/0.005) and the step budget (identical at 100k/200k/400k). " +
            "But perturbing M by 1e-5 moves the answer to 5.411, and onsetR/M -- a ratio that must be constant, since the ISCO scales with M -- ranges over 5.15..6.04 across perturbations of 1e-7..1e-2. " +
            "The bisection predicate is evidently not stable near the boundary for off-nominal M; the mechanism is NOT fully diagnosed. " +
            "Consequence: this entry supports a claim about the nominal configuration ONLY, its apparent sensitivity in a planted-error sweep is that discontinuity rather than physics, and it should not be used as a cross-machine or cross-version regression signal until the bisection is made robust",
    },
    {
        id: "blobarium-scheme-D",
        kind: "artefact",
        quantity: "blobarium advection scheme implicit diffusivity",
        value: 0.0187185,
        tol: 1e-3,
        condition: "n=32, ext=2, steps=15, v=1, dt=1/60 -- RESOLUTION DEPENDENT",
        note: "v2596 called this 'the temperature nobody set' and the number entered the tree as if it were a property. It is not: 0.026122 at n=24, 0.018719 at n=32, 0.011407 at n=48, still falling 25% per refinement at the finest grid tested. It is the grid's diffusivity, not the scheme's, and it cools as the grid refines. Pinned WITH its condition so the next person to quote it inherits the caveat",
    },

    // ---- v2916 (folded into v2926 tree): entries whose STANDING was established by v2905-v2914 -----------------
    // Merged carefully: the v2926 tree independently added logistic-lyapunov-r38, which is preserved untouched.
    { id: "quantum-well-ratio21", kind: "keyed", quantity: "second-to-first energy level ratio, infinite square well",
      value: 3.99998461729, tol: 1e-5, key: "exactly 4 -- E_n proportional to n^2, so E2/E1 = 4 for every box length",
      note: "CORROBORATED under all four criteria (v2908), first quantity in this lab to face them all. L-invariance earned: ratio moves 6.3e-12 across L=0.5,1,2.5 while every ENERGY moves with L. Converges at second order in N (v2907), bit-identical under a one-ulp libm shift (v2905)" },
    { id: "quantum-well-ratio31", kind: "keyed", quantity: "third-to-first energy level ratio, infinite square well",
      value: 8.99990770381, tol: 2e-5, key: "exactly 9 -- E3/E1 = 3^2, the same n^2 spectrum that fixes ratio21 at 4",
      note: "corroborated alongside ratio21 (v2908). Looser tol because the third level is worse resolved on the same grid, the expected n^2 scaling of the discretisation error" },
    { id: "edge-first-fringe", kind: "keyed", quantity: "knife-edge first fringe peak intensity",
      value: 1.37044291970, tol: 1e-8, key: "max of 0.5*((0.5+C(v))^2+(0.5+S(v))^2); no elementary closed form, locatable to machine precision",
      note: "v2914 verified against a golden-section optimum over an INDEPENDENTLY WRITTEN Fresnel quadrature, agree to 8.2e-12. Peak VALUE this accurate, peak POSITION only 1.7e-6: at a smooth max an h error in location costs O(h^2) in value. Pin the value" },
    { id: "airy-rayleigh-factor", kind: "keyed", quantity: "Airy first-ring position in lambda/D, REFINED estimator at default nSamples 900",
      value: 1.21969504720, tol: 5e-5, key: "j(1,1)/pi = 1.2196698912665045, the exact first zero of J1 over pi",
      note: "v2931 RE-PINNED. Was an ARTEFACT at 1.21913237 (raw grid estimator, graded against the rounded 1.22). v2931 adopted the v2911 refined estimator + exact constant: rayleighFactor is now 1.21969505, agreeing with the exact ring to 2.06e-5 where the raw value jittered at 4.4e-4 and did not converge. Now KEYED, not artefact -- it approaches a known closed form as resolution grows instead of landing on a grid sample" },
    { id: "slit-first-min-factor", kind: "keyed", quantity: "single-slit first minimum in lambda/a, REFINED estimator at default nSamples 900",
      value: 1.00001619731, tol: 5e-5, key: "exactly 1 -- analytic first minimum at sin(theta)=lambda/a",
      note: "v2931 RE-PINNED. Was an ARTEFACT at 1.00111235 (raw estimator, reading exactly 1 only when (nSamples-1)%4==0 and ~1e-3 otherwise). v2931 adopted the v2913 refined estimator: slitFirstMinFactor is now 1.00001620, converging toward the analytic 1 instead of alternating between a grid-hit and a grid-miss. Now KEYED" },
    { id: "chaos-delta-spread", kind: "artefact", quantity: "spread of Feigenbaum delta estimates across the cascade",
      value: 0.110295422303, tol: 1e-6, key: null,
      note: "ARTEFACT (v2905,v2907). STABLE under refinement of the cascade count (criterion 3 passes: the spread does not shrink as count grows from 4 to 6) yet moves a FACTOR OF 110 under a one-ulp libm shift. A quantity can be perfectly converged in its grid and still not be a measurement. Reproducible on one machine, not across two. v2930: note now names the knob (count) it is an artefact of, per the coverage check" },
    { id: "ising-magnetisation-T2", kind: "unkeyed", quantity: "Ising magnetisation at T=2.0, L=24, seed 12345",
      value: 0.912725694444, tol: 2e-2, key: null,
      note: "first genuine criterion-2 pass (v2906): spread 7.05e-3 across five seeds, inside tol and NOT bit-identical. TOLERANCE VALID ONLY HERE: at T=2.27 spread is 7.4e-2 and would FAIL; critical slowing down means a fixed 400-sweep warmup equilibrates well at T=2.0, poorly at Tc" },
];

// ---- the cross-device consistency claims -------------------------------------------------------------------------
export const CROSS_CHECKS = [
    {
        id: "isco-two-roads",
        quantity: "ISCO radius (M=1)",
        aId: "isco-schwarzschild",
        bId: "isco-pw-onset",
        tol: 2e-3,
        expectedGap: "PW replaces Schwarzschild geometry with a Newtonian potential, so its capture boundary sits OUTSIDE the exact ISCO. The gap is what the approximation costs -- about 0.6% at M=1 -- and a run where it VANISHES is more alarming than one where it persists",
    },
];

// ---- the runner ---------------------------------------------------------------------------------------------------
const LN2 = Math.LN2;

/** The portable Lyapunov estimator: strictLog2 only, so the code path has nothing for two libms to disagree about. */
export function lyapunov(r, iterations, x0, strictLog2) {
    let x = x0;
    for (let i = 0; i < 200; i++) x = r * x * (1 - x);       // burn-in: leave the transient behind
    let s = 0;
    for (let i = 0; i < iterations; i++) {
        s += strictLog2(Math.abs(r * (1 - 2 * x)));           // |f'(x)| = |r(1-2x)|
        x = r * x * (1 - x);
    }
    return (s / iterations) * LN2;
}

/**
 * The measurement FUNCTIONS, one per baseline id. Exposed separately from measureBaseline so a caller can RE-RUN
 * a measurement under instrumentation (peerReport arms the libm tripwire around each of these to decide whether
 * the quantity is portable). A caller handed only the finished numbers cannot do that -- and a portability flag
 * derived from re-reading a finished number is a flag that always says yes, which is worse than none.
 */
export async function measureFns() {
    const { getDevice } = await import("./devices.mjs");
    const { strictLog2 } = await import("../strictMath.mjs");
    const { measureAquariumD } = await import("../../physics/blobThermal.js");
    const { buildProbe } = await import("./probeBind.mjs");
    const { buildBH } = await import("./blackHoleBind.mjs");
    return {
        "logistic-lyapunov-r4": () => lyapunov(4, 320000, 0.1234, strictLog2),
        "logistic-lyapunov-r38": () => lyapunov(3.8, 320000, 0.1234, strictLog2),
        // NOTE the await: buildProbe/buildBH are declared async (their bodies are synchronous, but the
        // declaration still wraps the result in a promise). v2893's sensitivity sweep caught this being missed
        // here -- ".iscoR" off a promise is undefined, and a portability flag measured on undefined is clean and
        // worthless. Any caller wanting the flag must use measurePortabilityAsync.
        "isco-schwarzschild": async () => (await buildProbe({ mode: "isco" })).iscoR,
        "isco-pw-onset": async () => (await buildBH({ mode: "onset" })).captureOnsetR,
        "blobarium-scheme-D": () => measureAquariumD({ x: 0, y: 0, z: 0, r: 1, a: 1 }, { n: 32, ext: 2, steps: 15, v: 1, dt: 1 / 60, rounds: 2 }).D,
        // v2916 (merged): through the device registry, the surface every census measures
        "quantum-well-ratio21": async () => (await (await getDevice("quantum")).build({ mode: "well" })).ratio21,
        "quantum-well-ratio31": async () => (await (await getDevice("quantum")).build({ mode: "well" })).ratio31,
        "edge-first-fringe": async () => (await (await getDevice("optics")).build({ mode: "edge" })).edgeFirstFringe,
        "airy-rayleigh-factor": async () => (await (await getDevice("optics")).build({ mode: "airy" })).rayleighFactor,
        "slit-first-min-factor": async () => (await (await getDevice("optics")).build({ mode: "slit" })).slitFirstMinFactor,
        "chaos-delta-spread": async () => (await (await getDevice("chaos")).build({ mode: "feigenbaum" })).deltaSpread,
        "ising-magnetisation-T2": async () => (await (await getDevice("ising")).build({ mode: "order" })).magnetisation,
    };
}

/** Measure every baseline entry. Returns [{ id, expected, measured, drift, within }]. */
export async function measureBaseline() {
    // v2916 SINGLE SOURCE (folded into v2926): this used to carry its own copy of the id -> measurement map.
    // With the 7 v2916 entries added to BASELINE, the second copy would silently lack them and corroborate-
    // selfcheck would read undefined. Collapsed onto measureFns() so there is exactly one map. r38 (added in the
    // v2926 line) is in measureFns already, so it survives this.
    const fns = await measureFns();
    const out = [];
    for (const e of BASELINE) {
        const fn = fns[e.id];
        if (!fn) { out.push({ ...e, measured: undefined, drift: Infinity, within: false, missing: true }); continue; }
        const m = await fn();
        const drift = Math.abs(m - e.value) / Math.max(Math.abs(e.value), 1e-300);
        out.push({ ...e, measured: m, drift, within: drift <= e.tol });
    }
    return out;
}

/** Run the declared cross-device consistency claims against freshly measured values. */
export async function runCrossChecks(rows) {
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    return CROSS_CHECKS.map((c) => crossCheck({
        quantity: c.quantity,
        a: { source: by[c.aId].quantity, value: by[c.aId].measured },
        b: { source: by[c.bId].quantity, value: by[c.bId].measured },
        tol: c.tol,
        expectedGap: c.expectedGap,
    }));
}

/** Corroborate the unkeyed Lyapunov value from scratch -- the evidence behind its baseline entry. */
export async function corroborateLyapunov(r = 3.8) {
    const { strictLog2 } = await import("../strictMath.mjs");
    return corroborate({
        quantity: `Lyapunov exponent of the logistic map at r=${r}`,
        measure: ({ seed, resolution }) => lyapunov(r, resolution ?? 320000, seed, strictLog2),
        seeds: [0.1234, 0.5, 0.77, 0.31],          // initial conditions: the "seed" of a deterministic map
        resolutions: [40000, 80000, 160000, 320000],
        registration: preRegister({
            quantity: `lyapunov(r=${r})`,
            claim: { observable: "lyapunov", target: 0.4319, tol: 2e-3 },
            rationale: "stated before the sweep: the estimator validated against ln 2 at r=4, so its reading at r=3.8 is a measurement of something with no closed form",
        }),
    });
}
