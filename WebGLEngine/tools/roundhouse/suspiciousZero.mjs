// tools/roundhouse/suspiciousZero.mjs
//
// v2896 -- THE HOUSE RULE THAT KEPT BEING LEARNED BY HAND.
//
// Three rounds, three tautologies, one signature. v2892's peer report measured portability by calling an async
// build without awaiting it, so the flag was computed on a promise and came back clean every time. v2894's Roche
// mode computed the tidal field from the same closed form it was graded against, and returned an error of
// exactly 0.0. v2895's dispersion mode graded blobRadonAt against (32/35)ar -- which IS blobRadonAt -- and
// returned exactly 0.0 again. Each was caught by a human noticing a zero and feeling uneasy. That is not a
// process; that is luck with good habits.
//
// THE RULE: a numerical measurement that agrees with its answer key to the last bit has, almost always, not been
// measured. Independent computations of the same quantity differ somewhere in the last few ulps -- different
// operation order, different quadrature, different integrator. When the error is EXACTLY zero the usual cause is
// that both sides are the same expression, and the check is a mirror.
//
// THE EXCEPTIONS ARE REAL, so this is a guard and not a ban. An exact zero is legitimate when the quantity is
// exact BY CONSTRUCTION:
//   - integer or exactly-representable arithmetic (ISCO = 6M with M = 1; a count; a bit pattern)
//   - a comparison of two runs of the SAME deterministic code (determinism checks -- the point is bit-equality)
//   - an algebraic identity being asserted deliberately, and labelled as such
// So the guard takes a stated reason. Passing one is cheap; being unable to state one is the finding.

/**
 * Flag a suspicious exact-zero error.
 *
 *   err       the measured error (relative or absolute)
 *   exactOk   a REASON the zero is legitimate, or null/false if none. Stating a reason is the whole ceremony:
 *             it forces the author to answer "why can these two ever agree exactly?" at the moment of writing.
 *
 * Returns { suspicious, verdict, note }.
 */
export function suspiciousZero(err, exactOk = null) {
    const isZero = err === 0 || Object.is(err, -0);
    if (!isZero) return { suspicious: false, verdict: "nonzero", note: null };
    if (exactOk) return { suspicious: false, verdict: "exact-by-construction", note: String(exactOk) };
    return {
        suspicious: true,
        verdict: "SUSPICIOUS-ZERO",
        note: "error is exactly 0 with no stated reason -- the usual cause is that the measurement and its answer " +
            "key are the same expression (v2894 Roche, v2895 dispersion). Either measure it independently, or " +
            "state why exactness is expected here.",
    };
}

/**
 * The assertion form, for selfchecks: returns true when the error is acceptable, i.e. genuinely nonzero and
 * within tol, OR exactly zero WITH a stated reason. Use in place of a bare `err < tol`.
 */
export function gradedAgainstKey(err, tol, exactOk = null) {
    const s = suspiciousZero(err, exactOk);
    return { ok: !s.suspicious && Number.isFinite(err) && Math.abs(err) <= tol, ...s };
}

/** Scan a whole observable object for error-like fields that are exactly zero and unexplained. */
export function scanForTautologies(obs, { exactOk = {} } = {}) {
    const hits = [];
    for (const [k, v] of Object.entries(obs || {})) {
        if (!/err|error|residual|delta|deviation/i.test(k)) continue;
        if (typeof v !== "number") continue;
        const s = suspiciousZero(v, exactOk[k] || null);
        if (s.suspicious) hits.push({ field: k, value: v, note: s.note });
    }
    return hits;
}
