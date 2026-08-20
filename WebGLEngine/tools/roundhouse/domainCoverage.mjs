// tools/roundhouse/domainCoverage.mjs
//
// v3545 -- THE DOMAIN-INTEGRITY TRIO WATCHES ITSELF. Three checks now guard how a graded number can be quietly
// meaningless while still satisfying `err < tol`: errorSign (>= 0), observableRange ([lo, hi]) and observableFinite
// (a real number at all). Each reaches a DIFFERENT set:
//
//   FINITE reaches EVERY numeric observable        -- it filters on nothing but typeof === "number".
//   SIGN   reaches the ERR-NAMED numerics          -- errorSign.isErrorObservable decides.
//   RANGE  reaches the DECLARED/INFERRED-bounded    -- observableRange.rangeFor decides.
//
// The guarantee "no graded observable slips through ungated by all three" rests on ONE load-bearing fact: FINITE
// IS UNIVERSAL OVER NUMERICS. Sign and range are narrow by design, so finite is the floor beneath them; if it ever
// stopped being universal -- the obvious future edit is to give it a name filter, the way errorSign has one -- a
// plain measurement would fall to ZERO coverage and go completely unchecked, silently. That is the regression this
// meta-gate exists to make impossible to ship.
//
// It reads the three gates' ACTUAL predicates (isErrorObservable, rangeFor) rather than copies, so it cannot drift
// from what they really do, and reports a census: how many observables each check reaches, and -- the invariant --
// that finite's reach contains the union of the other two and of the numerics themselves.

import { isErrorObservable } from "./errorSign.mjs";
import { rangeFor } from "./observableRange.mjs";

// FINITE's reach is exactly "is a number" -- the universality this gate protects. Written as its own predicate so
// the assertion below has something to compare the union against.
export const reachesFinite = (k, v) => typeof v === "number";
export const reachesSign = (k, v) => typeof v === "number" && isErrorObservable(k);
export const reachesRange = (k, v, prefix = "") => typeof v === "number" && !!rangeFor(prefix + k, k);

// Classify one observable: which checks reach it, and how deep the coverage is (0..3).
export function classify(k, v, prefix = "") {
    const finite = reachesFinite(k, v), sign = reachesSign(k, v), range = reachesRange(k, v, prefix);
    return { numeric: typeof v === "number", finite, sign, range, depth: (finite ? 1 : 0) + (sign ? 1 : 0) + (range ? 1 : 0) };
}

// Census over one outputs bag. `uncovered` = numeric observables NO check reaches (must be empty). `finiteGap` =
// numeric observables reached by sign or range but NOT by finite (must be empty -- finite is the floor).
export function census(outputs, prefix = "", acc) {
    const c = acc || { numeric: 0, finite: 0, sign: 0, range: 0, uncovered: [], finiteGap: [], nonNumeric: 0 };
    for (const [k, v] of Object.entries(outputs || {})) {
        if (typeof v !== "number") { c.nonNumeric++; continue; }
        const z = classify(k, v, prefix);
        c.numeric++;
        if (z.finite) c.finite++;
        if (z.sign) c.sign++;
        if (z.range) c.range++;
        if (z.depth === 0) c.uncovered.push(prefix + k);
        if ((z.sign || z.range) && !z.finite) c.finiteGap.push(prefix + k);
    }
    return c;
}
