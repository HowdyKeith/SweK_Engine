// tools/roundhouse/assumptions.mjs
//
// v3100 -- AN ASSUMPTION THAT LIVES IN A COMMENT DOES NOT TRAVEL WITH THE NUMBER.
//
// Borrowed from dicroce/wyrm_math (verified this session; MIT-spirit, pure TypeScript, zero dependencies), and
// borrowed as an IDEA rather than as a package -- the same call this tree made on iroh at v3089. wyrm_math is
// TypeScript with a build step and an npm install, and SweK boots with neither. What transfers is free.
//
// THEIR MOVE: a symbolic algebra engine where "legal moves are possible, illegal moves are impossible" --
// equations are never VALIDATED, only TRANSFORMED by rewrite rules, so every reachable state is sound by
// construction. And the part worth stealing: moves that are only valid UNDER A CONDITION are not forbidden.
// Dividing by b requires b != 0, so that condition becomes a FIRST-CLASS, VISIBLE ASSUMPTION THAT TRAVELS WITH
// THE EQUATION. The result carries the terms on which it is true.
//
// WHY THIS LAB NEEDS IT, WITH EXAMPLES ALL FROM THE LAST TWENTY ROUNDS. Every graded number here is valid only
// under conditions, and every one of those conditions currently lives in a COMMENT:
//   lens.deflect        the 4M/b answer key is valid in the WEAK regime. At the DEVICE DEFAULT b = 10 the ray
//                       is in the MID band and deflectionErrFrac is null BY DESIGN -- v3081 lost an hour to it.
//   lens nuisance       lambda must be NON-DYADIC. Powers of two are exact in IEEE-754, so the sweep returns
//                       bit-identical values and reports SUSPECT on an invariance that is exactly true (v3081).
//   lens refinement     dphi must sit ABOVE the round-off crossover near 4e-4, below which refining makes the
//                       answer WORSE and classifySequence returns whichever verdict the samples support (v3082).
//   kerr schwarz*Err    valid ONLY at a = 0, because mode "limit" forces it -- so they say nothing whatsoever
//                       about a rotating hole (v3095).
//   kh                  measurable at all only on a reduced grid; at defaults one build is 38.6s and the sweep
//                       dies against the gate budget (v3098).
// A caller reading iscoErrFrac = 3.3e-8 out of a JSON payload gets NONE of that. The number looks unconditional
// and is not.
//
// THE RULE, WHICH IS THEIRS: A VALUE CARRYING AN UNMET ASSUMPTION IS NOT A RESULT. It does not throw -- throwing
// would lose the number and the reason together, and sometimes you genuinely want to look at a value outside its
// regime. It comes back with sound:false and the failed condition NAMED, so the disclaimer cannot be separated
// from the figure by a copy-paste.
//
// AND AN ASSUMPTION MUST BE A PREDICATE, NOT A SENTENCE. Prose describing a condition is a comment with
// ceremony; only something that can be EVALUATED can be found false. That is the whole difference between this
// and the comments it replaces.

/**
 * Declare a condition under which a value is meaningful.
 * @param id     short stable name, e.g. "weak-field"
 * @param holds  (ctx) => boolean -- REQUIRED and must be a function
 * @param why    what goes wrong when it does not hold. Not decoration: it is what the reader acts on.
 */
export function assume({ id, holds, why, bound = null }) {
    // v3131 -- AN OPTIONAL DECLARED BOUND: { field, min }. A gate can then check that the PREDICATE and the
    // REASON agree about the same number instead of trying to parse a threshold out of prose. My first version
    // of that gate DID parse it, and pulled every number in the sentence -- the threshold AND the measurement
    // details -- then failed the predicate for not holding at 8.4e-10. PARSING A THRESHOLD OUT OF PROSE IS
    // GUESSING; DECLARING IT IS KNOWING, and this project has made that same trade five times already.
    if (typeof holds !== "function") {
        // REFUSE AT DECLARATION, not at evaluation. An assumption that cannot be checked would sit in the list
        // looking like protection and never fail -- a control that cannot fail is decoration, and this module
        // exists to stop exactly that.
        throw new TypeError("assumption '" + id + "' has no predicate -- prose is a comment, not an assumption");
    }
    if (!why || String(why).length < 20) {
        throw new TypeError("assumption '" + id + "' needs a WHY: what does a reader do when it fails?");
    }
    return Object.freeze({ id, holds, why: String(why), bound });
}

/**
 * Attach assumptions to a value and evaluate them against the context the value was produced in.
 *
 * Returns a PLAIN object so it survives JSON: the conditions have to travel through a serialisation boundary,
 * because that is exactly where a number gets separated from its caveats.
 */
export function withAssumptions(value, assumptions, ctx = {}) {
    const checked = assumptions.map((a) => {
        let held = false, error = null;
        try { held = !!a.holds(ctx); } catch (e) { error = String((e && e.message) || e); }
        return { id: a.id, held: error ? false : held, why: a.why, error };
    });
    const unmet = checked.filter((c) => !c.held);
    return {
        value,
        sound: unmet.length === 0,
        assumptions: checked,
        unmet: unmet.map((u) => u.id),
        // ONE LINE A HUMAN READS. A structured field nobody prints is a field nobody sees.
        note: unmet.length === 0
            ? "all " + checked.length + " assumptions hold"
            : "NOT SOUND -- " + unmet.map((u) => u.id + " (" + u.why + ")").join("; "),
    };
}

/**
 * THE REAL ONES, for devices this session measured. Each is a predicate over the device config, so it can be
 * evaluated against the operating point a number was actually produced at rather than against the one somebody
 * assumed.
 */
// v3131 -- MEASURED, NOT CHOSEN. The sweep is recorded in the note below; this constant is named so the
// predicate and its stated reason cannot drift apart again without one of them mentioning a different number.
export const DPHI_CROSSOVER = 8e-4;

export const LAB_ASSUMPTIONS = {
    "lens.deflect": [
        assume({
            id: "weak-field",
            holds: (c) => (c.b || 0) / (3 * Math.sqrt(3) * (c.M || 1)) > 10,
            why: "the 4M/b answer key only applies where b/bCrit > 10; in the MID band deflectionErrFrac is null " +
                 "by design and a caller sees an absent key rather than a failed one",
        }),
        assume({
            // v3131 -- ALL THREE NUMBERS HERE USED TO DISAGREE. The predicate said 2e-4, this `why` said 4e-4,
            // and A SWEEP SAYS 8e-4. Each half looked right on its own and nobody had compared them, so the
            // assumption reported SOUND across a band ITS OWN STATED REASON CALLS UNSOUND -- by a factor of
            // four against the measurement.
            //
            // MEASURED at M=1, b=60 over dphi 1.6e-3 down to 1e-5 (a 160x range): deflectionErrFrac falls
            // 0.05226212549 -> 0.05226212465 between 1.6e-3 and 8e-4, AND THEN STOPS. Below 8e-4 it does not
            // improve at all -- it jitters within 8.4e-10, which is the round-off floor and not a trend.
            // Refining past the crossover buys nothing and a convergence verdict there is decided by sampling
            // luck, exactly as the reason says; the reason simply had the wrong number in it.
            //
            // AND THE RESIDUAL IS NOT THE INTEGRATOR'S. 5.2% survives every refinement because it is the
            // APPROXIMATION ERROR OF THE 4M/b KEY ITSELF at this b. No step size can reduce a model error, and
            // reading that 5.2% as something convergence should fix is the mistake this note exists to prevent.
            id: "above-roundoff-crossover",
            bound: { field: "dphi", min: DPHI_CROSSOVER },   // the ONE number that is the threshold
            holds: (c) => (c.dphi || 0) >= DPHI_CROSSOVER,
            why: "RK4 truncation falls as dphi^4 while accumulated round-off grows as 1/dphi, so below " +
                 "8e-4 refining stops helping (MEASURED: no improvement from 8e-4 down to 1e-5, jitter 8.4e-10) " +
                 "and a convergence verdict is decided by sampling luck",
        }),
    ],
    "lens.scale": [
        assume({
            id: "non-dyadic",
            holds: (c) => Array.isArray(c.values) && c.values.every((v, i) =>
                c.values.every((w, j) => i === j || Math.abs(Math.log2(v / w) - Math.round(Math.log2(v / w))) > 1e-9)),
            why: "scaling by a power of two is EXACT in IEEE-754, so the sweep returns bit-identical values and " +
                 "reports SUSPECT on an invariance that is exactly true -- indistinguishable from an unwired knob",
        }),
    ],
    // v3137 -- MEASURED, and two other candidates died on the bench. See the gate for the ones that did not survive.
    "optics.converge": [
        assume({
            id: "far-field",
            bound: { field: "fresnelNumber", max: 0.1 },
            holds: (c) => Number.isFinite(c.fresnelNumber) && c.fresnelNumber <= 0.1,
            why: "the Fraunhofer key compares a near-field integral against a far-field one, and the " +
                 "disagreement grows as the SQUARE of the Fresnel number -- MEASURED nearFarRms 1.228e-8, " +
                 "1.228e-6, 1.228e-4, 1.259e-2 at F = 1e-3, 1e-2, 0.1, 1.0, a hundredfold per decade. At " +
                 "F = 0.1 the two agree to 1e-4; at F = 1.0 the far-field approximation has simply failed and " +
                 "the comparison measures the approximation rather than the optics",
        }),
    ],
    "chaos.fixed": [
        assume({
            id: "below-first-bifurcation",
            // EXCLUSIVE: r = 3 is exactly where the bifurcation happens, so the fixed point is not stable AT it.
            // A bound has a DIRECTION and an INCLUSIVITY and guessing either is wrong -- the coherence gate
            // tested "holds at the bound" and this one correctly refuses there.
            bound: { field: "r", max: 3, exclusive: true },
            holds: (c) => Number.isFinite(c.r) && c.r < 3,
            why: "the logistic fixed point 1 - 1/r is STABLE only below r = 3; at and above it the map " +
                 "period-doubles and there is no single fixed point to be right about. MEASURED: fixedPointErr " +
                 "is 5.55e-17, 0 and 3.33e-16 at r = 1.5, 2.5, 2.9 -- machine precision -- and NULL at r = 3.0, " +
                 "3.2 and 3.6. The device already refuses rather than lying, and this makes the refusal legible: " +
                 "without it a caller reading null cannot tell NOT APPLICABLE HERE from BROKEN",
        }),
    ],
    "kerr.limit": [
        assume({
            id: "schwarzschild-only",
            holds: (c) => (c.a || 0) === 0,
            why: "mode 'limit' FORCES a = 0, where the Kerr expressions reduce algebraically and every schwarz* " +
                 "error returns exactly zero -- these say nothing at all about a rotating hole",
        }),
    ],
};

/** One line per assumption, for a report a person reads rather than parses. */
export function assumptionLines(result) {
    return result.assumptions.map((a) =>
        "    " + (a.held ? "holds " : "FAILS ") + a.id + (a.error ? "  [predicate threw: " + a.error + "]" : "") +
        (a.held ? "" : "  -- " + a.why));
}
