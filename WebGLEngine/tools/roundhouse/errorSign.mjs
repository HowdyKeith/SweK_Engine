// tools/roundhouse/errorSign.mjs
//
// v3534 -- VERDICT INTEGRITY, THE SIGN OF AN ERROR. Every graded key in this lab is a magnitude compared against a
// tolerance: the verdict is `err < tol`. That comparison has a silent hole -- it passes for ANY negative err. An
// error metric that can go negative is therefore a verdict the physics cannot enforce: a sign slip (a missing
// Math.abs, a residual computed as a-b instead of |a-b|, a normalisation that flipped) would make `err < tol`
// return GREEN for an arbitrarily large discrepancy, and every relationship gate downstream would inherit the lie.
//
// suspiciousZero guards the value 0; valueMatch guards coincidences; nothing guarded the SIGN. This module does:
// every err-named numeric observable must be >= 0, everywhere, on correct AND planted builds. It reads the frozen
// lab-results baseline for the comprehensive sweep (every captured correct-mode output, no device re-runs) and the
// gate spot-checks a handful of planted builds live. The check is one line of physics: a distance is not negative.
//
// A curated SIGNED_OK carries any err-named observable that is legitimately signed, with a stated reason -- the
// exactZeroRegister discipline applied to sign. It is empty: across the lab every error is a magnitude.
//
// ONE convention has to be respected: a mode that does not compute a given key returns the lab's not-applicable
// SENTINEL, -1, rather than null -- so err-named fields carry -1 in the modes they do not apply to (frictionBind,
// gyroscopeBind, figureEightBind and others do this). -1 is therefore NOT a sign fault; a real error is a
// non-negative magnitude, so any negative value OTHER than the -1 sentinel is the fault this gate hunts.

// Match error observables by name. errorSign asserts a value is a NON-NEGATIVE MAGNITUDE, and that is true of more
// than the things named "Err": a DRIFT is a magnitude of change, a SPREAD is a range, an EXCESS is an overflow --
// each >= 0 by construction, never signed for any sane definition. So the predicate covers err / residual /
// deviation / drift / spread / excess. A v3546 census across all 74 devices confirmed every observable this catches
// is >= 0 (25 drift/spread/excess names among them), so the widening removes a real blind spot without a single
// false fault.
//
// It deliberately stops short of two tempting-but-wrong additions. (1) "frac": a v3546 scan found every *Frac in the
// lab non-negative TODAY, but a "fractional CHANGE" is (a - b)/b, which is signed by nature, so a name-level rule
// would be a false fault waiting to happen; and "frac" is a substring of refract/diffract, so it cannot even be
// matched cleanly. The genuinely-bounded fractions-of-a-whole (an escape fraction, an occupancy) belong in
// observableRange's declared [0, 1] set, where the bound is stated, not guessed. (2) physical MEASUREMENTS that
// merely happen to be non-negative on today's runs -- a Doppler shift, a refraction angle, a mass-discrepancy
// FACTOR, a count -- are quantities, not magnitudes; a signed one would be a false fault, so shift/angle/factor/
// discrepancy stay out.
export const ERR_NAME = /err|residual|deviation|drift|spread|excess/i;
export const isErrorObservable = (k) => ERR_NAME.test(k);

// The lab's not-applicable sentinel for a numeric observable a mode does not compute.
export const NA_SENTINEL = -1;

// "device.mode.field" -> reason it is an err-named observable that may legitimately be negative. Empty by design.
export const SIGNED_OK = {};

// Return the negative err-named numeric observables in one outputs bag, keyed with an optional prefix
// ("device/mode."). Booleans, strings, non-finite values, the -1 not-applicable sentinel, and non-error names are
// all ignored; only a finite negative error OTHER than the sentinel is a fault.
export function negativeErrors(outputs, prefix = "") {
    const hits = [];
    for (const [k, v] of Object.entries(outputs || {})) {
        if (!isErrorObservable(k)) continue;
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        if (v < 0 && v !== NA_SENTINEL && !SIGNED_OK[prefix + k]) hits.push({ key: prefix + k, value: v });
    }
    return hits;
}

// Scan a whole lab-results baseline object (its `devices` rows and `pairs` rows) for negative errors.
export function scanBaseline(base) {
    const hits = [];
    for (const [n, row] of Object.entries(base.devices || {})) {
        if (row && row.outputs) hits.push(...negativeErrors(row.outputs, n + "/" + (row.mode || "-") + "."));
    }
    for (const [key, row] of Object.entries(base.pairs || {})) {
        if (row && row.outputs) hits.push(...negativeErrors(row.outputs, key + "."));
    }
    return hits;
}
