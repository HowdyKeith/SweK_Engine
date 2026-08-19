// tools/roundhouse/plantedError.mjs
//
// v2893 -- WHAT WOULD THIS GATE HAVE CAUGHT?
//
// Every gate in this tree has only ever passed. That is a pleasant fact and an epistemically empty one: a check
// that has never failed on real physics has never demonstrated it CAN. And the tolerances make it worse rather
// than better -- every tolerance in the physics baseline was chosen during calibration by looking at where the
// measurement landed. A bound justified by "this is what we measured" cannot tell you what it would have caught.
// It is circular, and the circle is invisible from inside.
//
// So: PLANT AN ERROR OF KNOWN SIZE AND SEE WHETHER THE GATE NOTICES.
//
// A planted error is a relative perturbation eps injected into a PHYSICS KNOB the measurement depends on -- a
// mass, a coupling, an advection speed, a map parameter. The gate is then asked its ordinary question: is the
// observable still within the tolerance pinned in the baseline? Sweeping eps upward finds the DETECTION FLOOR:
// the smallest planted error this gate detects. Everything below the floor is what the gate is blind to, stated
// as a number instead of assumed to be zero.
//
// That converts every future green from a vibe into a quantified statement:
//
//     "isco-schwarzschild passed" -> "isco-schwarzschild passed, and it would have caught any error above 4e-12
//                                     in the underlying mass, and would not have caught 1e-12."
//
// THREE DESIGN CHOICES, EACH BECAUSE THE OBVIOUS VERSION IS WRONG:
//
//   SCAN, DO NOT BISECT. Bisection assumes the response is monotone in eps. Real instruments are not: a bisected
//   onset radius is quantised by its own search tolerance, so a bigger planted error can land in the SAME bucket
//   and trip nothing while a smaller one trips. A geometric ladder finds the first trip AND reports whether every
//   larger perturbation also trips -- and a non-monotone response is a finding about the instrument, not noise
//   to be smoothed away.
//
//   PERTURB THE PHYSICS, NOT THE NUMBER. Adding eps to the measured value would only test the comparator, which
//   is arithmetic and was never in doubt. The perturbation has to enter where the physics enters, so that the
//   whole path from knob to observable is what gets graded.
//
//   THE NULL TEST IS PART OF THE MEASUREMENT. eps = 0 must NOT trip the gate. A "sensitive" gate that also fires
//   on an unperturbed run is not sensitive, it is broken, and every floor it reports is meaningless.
//
// WHAT A BLIND RESULT MEANS: if nothing up to epsMax trips the gate, that gate cannot see errors of the kind
// planted, at any size tested. That is the most valuable output this module produces and it is not a failure of
// the harness -- it is the harness working.

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

/**
 * Sweep a planted error upward and find the smallest one the gate detects.
 *
 *   measure(eps) -> value      the FULL measurement, with a relative perturbation eps injected into a physics knob
 *   tol                        the gate's tolerance (relative), as pinned in the baseline
 *   epsMin/epsMax/ratio        the geometric ladder of planted errors to try
 *
 * Returns the detection floor, the gain (how much the observable moves per unit of planted error -- an
 * amplification below 1 means the instrument ATTENUATES the error it was asked to find), and the honest flags.
 */
export async function detectionFloor({ id, measure, tol, epsMin = 1e-12, epsMax = 0.1, ratio = 2, knob = "?" }) {
    // ASYNC THROUGHOUT, because several device builds are declared async and a harness that read `.observable`
    // off a promise would measure undefined and report every gate BLIND -- which is precisely what the first run
    // of this module did, and precisely the bug it then found in v2892's peer report.
    const nominal = await measure(0);

    // NULL TEST FIRST. If an unperturbed run already trips the gate, nothing below is meaningful.
    const nullDeviation = rel(await measure(0), nominal);
    const nullTrips = nullDeviation > tol;

    const ladder = [];
    for (let e = epsMin; e <= epsMax * (1 + 1e-9); e *= ratio) ladder.push(e);

    const rungs = [];
    for (const eps of ladder) {
        let value, error = null;
        try { value = await measure(eps); } catch (err) { error = err.message || String(err); }
        const bad = error !== null || !Number.isFinite(value);
        const deviation = bad ? null : rel(value, nominal);
        rungs.push({ eps, value, deviation, trips: bad ? null : deviation > tol, error: error || (bad ? "non-finite measurement" : null) });
    }

    const firstTrip = rungs.find((r) => r.trips === true) || null;
    const afterFirst = firstTrip ? rungs.slice(rungs.indexOf(firstTrip)) : [];
    const monotone = firstTrip ? afterFirst.every((r) => r.trips !== false) : null;

    // A nominal that is not a finite number means the measure function is wired wrong (a promise read as a
    // value, a typo'd observable name). Report it as BROKEN rather than as a blind gate: they look identical
    // from the outside and mean opposite things.
    const wired = Number.isFinite(nominal);

    return {
        id, knob, tol, nominal, wired,
        floor: firstTrip ? firstTrip.eps : null,
        floorDeviation: firstTrip ? firstTrip.deviation : null,
        // gain > 1: the instrument amplifies the planted error. gain < 1: it attenuates it, and the gate is
        // duller than its tolerance suggests -- the tolerance is on the OBSERVABLE, the error is in the PHYSICS,
        // and the two are only the same number when the gain is exactly 1.
        gain: firstTrip ? firstTrip.deviation / firstTrip.eps : null,
        blind: firstTrip === null,
        blindAbove: firstTrip === null ? epsMax : null,
        monotone,
        nullTrips,
        nullDeviation,
        rungs,
    };
}

/** Run a set of planted-error specs. */
export async function sensitivitySuite(specs) {
    const out = [];
    for (const s of specs) out.push(await detectionFloor(s));
    return out;
}

/** The line a gate should be able to print about itself after this round. */
export function sensitivityLine(r) {
    if (!r.wired) return `${r.id}: BROKEN -- the measure function returned ${r.nominal} (a promise read as a value? a misspelled observable?); a mis-wired probe looks exactly like a blind gate and means the opposite`;
    if (r.nullTrips) return `${r.id}: BROKEN -- an UNPERTURBED run already exceeds the tolerance (${r.nullDeviation.toExponential(2)} > ${r.tol}); every floor below is meaningless`;
    if (r.blind) return `${r.id}: BLIND up to ${r.blindAbove * 100}% planted error in ${r.knob} -- this gate cannot see errors of that kind at any size tested`;
    const pct = (x) => (x * 100 < 0.001 ? (x * 100).toExponential(2) : (x * 100).toPrecision(3)) + "%";
    return `${r.id}: catches >= ${pct(r.floor)} planted error in ${r.knob}; blind below it. ` +
        `gain ${r.gain.toPrecision(3)}x (observable moves ${r.gain < 1 ? "LESS" : "more"} than the error)` +
        (r.monotone === false ? " -- NON-MONOTONE: a larger planted error can slip through where a smaller one trips" : "");
}

/**
 * REPLACE A HAND-CHOSEN TOLERANCE WITH A MEASURED ONE.
 *
 * Given a detection floor and the measurement's own noise (its spread under conditions that should not matter --
 * seeds, or a repeat run), the defensible tolerance sits ABOVE the noise (or the gate cries wolf) and BELOW the
 * error you want to catch (or it sleeps through it). This returns that window, and says plainly when it is
 * EMPTY -- which means no tolerance can both stay quiet on this instrument and catch that error, and the
 * instrument needs fixing rather than the number tuning.
 */
export function toleranceWindow({ noise, targetError, gain }) {
    const lower = noise;                                  // must not fire on the instrument's own scatter
    const upper = gain != null ? targetError * gain : null; // must fire on the error we care about
    return {
        lower, upper,
        viable: upper != null && upper > lower,
        recommendation: upper != null && upper > lower ? Math.sqrt(lower * upper) : null,   // geometric middle
        note: upper == null ? "no gain measured -- run detectionFloor first"
            : upper > lower ? null
            : "EMPTY WINDOW: the instrument's own scatter is larger than the signal it is being asked to detect; no tolerance can do both",
    };
}
