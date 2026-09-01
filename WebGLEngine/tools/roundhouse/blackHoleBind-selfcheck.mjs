// tools/roundhouse/blackHoleBind-selfcheck.mjs
//
// Run: node tools/roundhouse/blackHoleBind-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Device #2 held to the same standard as device #1: the loop crystallizes on what the SIMULATION measured, and the
// measurements themselves are held to independent theory. The PW potential admits an exact epicyclic derivation --
// precession per orbit = 2*pi*(sqrt((r-rs)/(r-3rs)) - 1) -- and an exact ISCO at 6GM/c^2, so unlike a mock, the
// checks here crystallize the real integrator against closed-form truth it was never told about. Then the loop
// contract: a true claim about the measured capture onset crystallizes, a false one refuses, and an evaluator that
// agrees with everything still cannot exit the loop while the claim misses the measurement.

import { roundhouseDevice, numericVerdict } from "./deviceBind.mjs";
import { blackHoleDevice, buildBH, bhDefaults } from "./blackHoleBind.mjs";
import { schwarzschildRadius, iscoRadius } from "../../physics/blackHole.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const rs = schwarzschildRadius(1, 1, 1);
const pwPrecession = (r) => 2 * Math.PI * (Math.sqrt((r - rs) / (r - 3 * rs)) - 1);

// ---- 1. STABILITY STRUCTURE: inside the ISCO plunges, outside persists ------------------------------------------
{
    const inside = buildBH({ mode: "orbit", r0: 4, config: { steps: 50000 } });
    const outside = buildBH({ mode: "orbit", r0: 8, config: { steps: 300000 } });
    ok("!! a near-circular start inside the ISCO is captured", inside.captured === true,
        "rMin " + inside.rMin.toFixed(2) + " -- the unstable band does what the potential says it must");
    ok("!! a near-circular start outside the ISCO persists", outside.captured === false && outside.orbits > 10,
        outside.orbits + " apoapsis passages without capture");
    ok("!! energy is conserved to integrator precision", outside.energyDriftFrac < 1e-6,
        "fractional drift " + outside.energyDriftFrac.toExponential(1) + " -- PW energy is exactly conserved, so drift is pure Verlet error");
}

// ---- 2. PRECESSION vs CLOSED-FORM PW THEORY (the integrator was never told the formula) -------------------------
{
    const weak = buildBH({ mode: "orbit", r0: 60, config: { steps: 2000000 } });
    const mid = buildBH({ mode: "orbit", r0: 12, config: { steps: 300000 } });
    const strong = buildBH({ mode: "orbit", r0: 8, config: { steps: 300000 } });
    const relErr = (m, r) => Math.abs(m - pwPrecession(r)) / pwPrecession(r);
    ok("!! weak-field precession matches the PW epicyclic formula", relErr(weak.precessionPerOrbit, 60) < 0.02,
        "measured " + weak.precessionPerOrbit.toFixed(4) + " vs theory " + pwPrecession(60).toFixed(4) + " at r0=60 (" + (relErr(weak.precessionPerOrbit, 60) * 100).toFixed(1) + "%)");
    ok("!! mid-field precession matches", relErr(mid.precessionPerOrbit, 12) < 0.03,
        "measured " + mid.precessionPerOrbit.toFixed(4) + " vs theory " + pwPrecession(12).toFixed(4));
    ok("!! strong-field precession matches (near-ISCO, > pi per orbit -- the unwrapped tracker earns its keep)",
        relErr(strong.precessionPerOrbit, 8) < 0.03,
        "measured " + strong.precessionPerOrbit.toFixed(4) + " vs theory " + pwPrecession(8).toFixed(4));
    ok("precession grows toward the hole", strong.precessionPerOrbit > mid.precessionPerOrbit && mid.precessionPerOrbit > weak.precessionPerOrbit);
}

// ---- 3. CAPTURE ONSET measures the ISCO from dynamics alone -----------------------------------------------------
{
    const on = buildBH({ mode: "onset" });
    // *** v3712 -- THE REFUSAL HAS TO BE READ BEFORE THE NUMBER. This check reached straight into
    // captureOnsetRBracket[1], so any run that REFUSED by name (the bind returns { error } and no bracket)
    // crashed the gate with a TypeError instead of failing. MEASURED by a plant that moved onsetHi onto the
    // boundary: the whole file exited 1 with SEVEN PASS LINES AND NO FAIL LINE, which reads exactly like a
    // check that never fired. AN HONEST REFUSAL FROM THE BIND DESERVES AN HONEST FAILURE LINE FROM THE GATE. ***
    ok("!! the nominal onset run does not refuse, and says so by name if it does",
        on.error === undefined, on.error || "no refusal");
    const width = on.error ? NaN : on.captureOnsetRBracket[1] - on.captureOnsetRBracket[0];
    ok("!! the bisected capture boundary lands on the exact ISCO", !on.error && Math.abs(on.captureOnsetR - iscoRadius(1, 1, 1)) < 0.1,
        "measured " + (on.error ? "REFUSED: " + on.error : on.captureOnsetR.toFixed(3)) + " vs exact 6 (bracket width " + width.toFixed(3) + ") -- the ISCO recovered from trajectories, not from the formula");
}

// ---- 3c. THE ONSET BRACKET ITSELF (v3709) -----------------------------------------------------------------------
// v3708 fixed the lower bound and left the fix UNPROTECTED: the refusal that saved that round was exercised by
// nothing. MEASURED at v3709 -- delete the `survives(lo)` line from onsetRun and EVERY CHECK IN THIS FILE STILL
// PASSES, because the default run self-recovers (its first midpoints land inside the band and re-establish the
// invariant). A guard nobody has seen fail might not fire; these plants make it fail on purpose.
// *** WHEN ONE OF THESE GOES RED the fix is to restore the named refusal in onsetRun, NEVER to relax the check
// here: a bisection over a non-monotonic predicate reporting a number from a bad bracket is the failure this
// device exists to make impossible. ***
{
    const bad = (cfg) => buildBH({ mode: "onset", config: cfg });
    // Print a run's onset, or its refusal, WITHOUT throwing -- see the note on the detail string below.
    const fx = (r) => (r && r.error ? "REFUSED(" + r.error.split(":")[0] + ")" : r.captureOnsetR.toFixed(4));
    const rsNow = schwarzschildRadius(1, 1, 1);          // DERIVED, never typed -- 2 at G=M=c=1

    // (a) INSIDE THE HORIZON. Before v3709 this returned a plausible 6.03: a hole captures everything, so the
    // "did it capture" test read a swallowed start as a valid captured-side endpoint.
    const inHole = bad({ onsetLo: rsNow / 2 });
    ok("!! a lower bound INSIDE the horizon refuses by name, and does not return a number",
        typeof inHole.error === "string" && inHole.error.startsWith("onset-lo-inside-horizon") && inHole.captureOnsetR === undefined,
        "onsetLo " + (rsNow / 2) + " vs rs " + rsNow + " -- this returned 6.03 at v3708");

    // (b) BELOW the band but outside the horizon. The band's lower edge moves with rs (0.5*ISCO survives at
    // rs=2), so this is the non-monotonicity itself, refused rather than bisected across.
    const below = bad({ onsetLo: 0.5 * iscoRadius(1, 1, 1) });
    ok("!! a lower bound below the band's lower edge refuses by name",
        typeof below.error === "string" && below.error.startsWith("onset-lo-survives") && below.captureOnsetR === undefined,
        "onsetLo 3.0 survives at rs 2 -- measured, and the reason 0.7*ISCO held for hundreds of versions by luck");

    // (c) ABOVE the band. This is the one that returns a LIE when unguarded: hi walks down onto lo and the
    // device reports lo + tol/2 as the capture onset -- measured 11.008 with the guard removed.
    const above = bad({ onsetLo: 11 });
    ok("!! a lower bound above the band refuses instead of reporting lo+tol/2",
        typeof above.error === "string" && above.error.startsWith("onset-lo-survives") && above.captureOnsetR === undefined,
        "unguarded this returns 11.008 -- a plausible number from a bracket with no boundary in it");

    // (d) THE DEFAULT BOUND IS ON THE CAPTURED SIDE FOR BOTH rs IN PLAY -- the property v3708 actually bought,
    // asserted through the shipped path rather than by re-deriving the multiple here.
    const nom = bad({}), pl = bad({ planted: true });
    ok("!! the default lower bound brackets the boundary under BOTH the nominal and the planted rs",
        nom.error === undefined && pl.error === undefined && nom.captureOnsetR > 0 && pl.captureOnsetR > 0,
        // *** THE DETAIL MUST SURVIVE THE FAILURE IT DESCRIBES. The condition above guards on `error`, but a
        // detail string is an ARGUMENT and is built FIRST -- so an unguarded .toFixed() here crashed the gate
        // at the exact moment the check correctly failed (v3712, found by a plant). A message that cannot be
        // printed when the thing goes wrong is not a message. `fx` is the shared spelling of that guard.
        "nominal " + fx(nom) + " / planted " + fx(pl) +
        " -- a bound derived from a constant the run does not use can only find answers near the one assumed");

    // (f) THE UPPER BOUND SCALES WITH THE rs IN PLAY (v3712). Before this, onsetHi was a typed 12 under a
    // typed floor of 8 and the device REFUSED BY NAME from M = 2 up, because ISCO = 6M crosses 12. The refusal
    // was honest, so this was a NAMED LIMIT rather than a silent hole -- but a bound that does not move with
    // the mass can only bracket the boundary for the masses somebody happened to try.
    // *** WHEN THIS GOES RED, re-derive the multiple from the rs IN PLAY -- NEVER type a number back in. ***
    const masses = [0.5, 1, 1.5, 2, 3, 5];
    const runs = masses.map((M) => ({ M, r: bad({ M }) }));
    ok("!! the onset is measurable at every mass tried, not just the ones under a typed ceiling",
        runs.every(({ r }) => r.error === undefined && Number.isFinite(r.captureOnsetR)),
        "M = " + masses.join(", ") + " -> " + runs.map(({ r }) => r.error ? "REFUSED" : r.captureOnsetR.toFixed(3)).join(", ") +
        "; M >= 2 REFUSED with onset-hi-captured before v3712");

    // The fractional error against the exact ISCO must not GROW with mass -- that is the property a scaling
    // bound buys, and a typed one cannot have. Derived from each run, never typed.
    const errs = runs.map(({ M, r }) => Math.abs(r.captureOnsetR - iscoRadius(M, 1, 1)) / iscoRadius(M, 1, 1));
    ok("!! the fractional error stays flat across a factor of ten in mass",
        Math.max(...errs) < 0.02 && Math.max(...errs) / Math.min(...errs) < 3,
        "worst " + Math.max(...errs).toExponential(2) + ", best " + Math.min(...errs).toExponential(2) +
        " -- a bracket that scales keeps the same finite-time bias at every mass");

    // (g) NOMINAL IS UNCHANGED BY CONSTRUCTION, NOT BY LUCK: 6*rs IS 12 at the textbook rs = 2, which is what
    // the typed constant was. Asserted through the shipped path against the derived value.
    const dflt = bhDefaults({ mode: "onset", config: {} });
    ok("!! the derived default equals the constant it replaced, at the rs that constant was chosen for",
        dflt.config.onsetHi === 6 * rsNow && 6 * rsNow === 12,
        "6 * rs = " + (6 * rsNow) + " at rs = " + rsNow + " -- the nominal reading does not move");

    // (h) *** THE FLOOR SILENTLY OVERRODE WHAT I THOUGHT I WAS MEASURING. At v3709 I probed the planted arm by
    // passing onsetHi: 6 and reported the result as "what 6*rs gives" -- but the old normalisation was
    // Math.max(8, ...), so it RAN AT 8 and the figure I quoted (2.9847) was never the one I named. The true
    // 6*rs planted reading is 2.8998. A CLAMP THAT REWRITES AN INPUT MUST NOT BE INVISIBLE TO THE CALLER. ***
    ok("!! a requested bound below the floor is not silently rewritten to a typed number",
        bhDefaults({ mode: "onset", config: { M: 1, planted: true, onsetHi: 6 } }).config.onsetHi === 6,
        "the floor is now the IMPLIED ISCO (3*rs), derived -- the old typed 8 rewrote a legitimate request and reported nothing");

    // (e) THE ANSWER MUST NOT DEPEND ON THE SEARCH THAT FOUND IT. `survives` is a FINITE-TIME predicate, so the
    // boundary is fuzzy and the bisection lands somewhere inside the fuzz -- where, depends on the endpoints.
    // MEASURED at v3709 sweeping onsetHi over 8/10/12/16/24/48: nominal spans 5.9358..6.0396, a spread of 0.104,
    // FIVE TIMES the reported bracket width of ~0.013. captureOnsetRBracket says where the bisection STOPPED,
    // NOT how well the onset is known, and the 15 digits it prints are an artefact of halving.
    const his = [8, 10, 12, 16, 24, 48].map((hi) => bad({ onsetHi: hi }).captureOnsetR);
    const worst = Math.max(...his.map((v) => Math.abs(v - iscoRadius(1, 1, 1))));
    ok("!! the measured onset stays within the claim tolerance no matter which bracket found it",
        his.every((v) => Number.isFinite(v)) && worst < 0.1,
        "worst deviation from exact 6 across six brackets: " + worst.toFixed(4) + " (claim tol 0.1); spread " +
        (Math.max(...his) - Math.min(...his)).toFixed(4) + " vs reported bracket width ~0.013 -- THE BRACKET IS NOT AN ERROR BAR");
}

// ---- 3b. ESCAPE SPEED vs closed form (v2806) --------------------------------------------------------------------
{
    const esc = buildBH({ mode: "escape", r0: 8 });
    ok("!! the bisected escape boundary lands within 1% of sqrt(2GM/(r-rs))", esc.escapeErrFrac < 0.01,
        "measured " + esc.escapeV.toFixed(5) + " vs theory " + esc.escapeTheory.toFixed(5) +
        " (" + (esc.escapeErrFrac * 100).toFixed(2) + "%) -- a finite-horizon boundary that converges to theory " +
        "as the horizon grows (0.573792/0.573792/0.575180 at escRFar 200/400/800, re-measured v4303: the first " +
        "two are BIT-IDENTICAL even at escTol 1e-5, so the bias is quantised by the orbit rather than smooth), " +
        "same honest-bias family as the ISCO onset");
}

// ---- 4. SLOPPY HYPOTHESES STILL BUILD (the local-model contract) ------------------------------------------------
{
    const h = bhDefaults({ mode: "orbit", r0: NaN, config: { dt: 99, steps: 1e12, v0Frac: -5 } });
    ok("!! defaults clamp a garbage hypothesis into a physical, bounded run",
        h.r0 > rs && h.config.dt <= 0.1 && h.config.steps <= 2e6 && h.config.v0Frac >= 0.1,
        "r0 " + h.r0.toFixed(1) + ", dt " + h.config.dt + ", steps " + h.config.steps + " -- a wild proposal cannot start inside the horizon or hang the builder");
    const built = buildBH(h);
    ok("and the clamped hypothesis produces measurements", built.captured === false || built.captured === true);
}

// ---- 5. THE LOOP over the real device: true claims crystallize, false claims refuse -----------------------------
{
    const caller = (proposals, evalFn) => { let i = 0; return async (role, payload) => role === "proposer" ? proposals[Math.min(i++, proposals.length - 1)] : evalFn(payload); };
    const agreeable = () => ({ reading: "looks done to me", done: true });

    const good = await roundhouseDevice({
        callModel: caller([{ mode: "onset", claim: { observable: "captureOnsetR", target: 6, tol: 0.1 } }], agreeable),
        device: blackHoleDevice, question: "where is the ISCO?", maxRounds: 3,
    });
    ok("!! a true claim about the measured onset crystallizes", good.crystallized === true && good.rounds === 1,
        // Same guard as section 3c: when the device REFUSES there is no verdict to read, and the message must
        // still print. THIRD SITE FOUND BY ONE PLANT (v3712) -- the shape is systemic, not a one-off typo.
        "measured " + (good.verdict && typeof good.verdict.measured === "number"
            ? good.verdict.measured.toFixed(3) + " within 0.1 of claimed 6"
            : "NO VERDICT -- the device refused, so there is nothing to compare against 6"));

    const bad = await roundhouseDevice({
        callModel: caller([{ mode: "onset", claim: { observable: "captureOnsetR", target: 10, tol: 0.2 } }], agreeable),
        device: blackHoleDevice, question: "where is the ISCO?", maxRounds: 3,
    });
    ok("!! a false claim does NOT crystallize -- even with an evaluator that agrees with everything",
        bad.crystallized === false,
        "claimed 10, sim measured ~6, agreeable evaluator overruled by the number -- same anti-echo-chamber contract as the LBM rig");

    ok("the report says WHICH device was judged", good.device === "paczynski-wiita-black-hole",
        "the conformance lesson carried over");
}

// ---- 6. numericVerdict never crystallizes without a measurable claim --------------------------------------------
{
    ok("claims without an observable refuse", numericVerdict({}, { captured: true }).done === false);
    ok("claims about missing observables refuse", numericVerdict({ observable: "nope", target: 1, tol: 9 }, { captured: true }).done === false);
    ok("comparator-free claims refuse", numericVerdict({ observable: "rMin" }, { rMin: 3 }).done === false);
}

console.log();
if (fails) { console.log("blackHoleBind-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("blackHoleBind-selfcheck: all checks pass");
