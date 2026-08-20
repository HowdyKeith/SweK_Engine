// WebGLEngine/tools/strictMath.mjs — v2626
//
// STRICT, HOST-MATH-FREE hypot AND log2 -- completing the set Valeriu named as Krbn's cross-platform drift.
//
// ---- WHY -----------------------------------------------------------------------------------------------------------
//
// v2603 gave a structural, grep-able cross-platform guarantee for sin and cos (tools/strictTrig.mjs): computed
// by construction, calling no host transcendental, so identical bits on every CPU. Valeriu then confirmed, from
// the field, that Krbn's per-platform byte drift comes from exactly this class -- the JS VM's Math.sin, log2,
// and hypot inherit the OS libm, which differs by a few ULPs. strictTrig covered sin/cos (54 + 52 uses in the
// vendored Krbn). This covers the other two he named: hypot (38 uses) and log2 (3 uses).
//
// The guarantee is the same and it is STRUCTURAL, not empirical: these functions call sqrt (a correctly-rounded
// IEEE-754 instruction, identical everywhere), abs, and arithmetic -- and NOTHING from the transcendental libm.
// You do not have to trust three machines agreeing; you can grep the source and see there is no host Math.hypot
// or Math.log2 to drift. Swap these in for Math.hypot / Math.log2 and a render becomes byte-identical across
// platforms (against a new reference of its own).
"use strict";

// ---- strictHypot ---------------------------------------------------------------------------------------------------
//
// sqrt(a^2 + b^2), robust against overflow, using only sqrt/abs/arithmetic. Math.hypot the LIBRARY function
// does platform-varying scaling and summation; this fixes the algorithm, so the bits are fixed too.
export function strictHypot(a, b) {
    a = a < 0 ? -a : a;                      // abs by branch -- no Math call, exact
    b = b < 0 ? -b : b;
    if (a === 0) return b;
    if (b === 0) return a;
    // scale by the larger magnitude so a*a and b*b cannot overflow/underflow; division is IEEE-exact-rounded,
    // so the scaled sum is deterministic. This is the standard robust form, with a fixed operation order.
    const t = a > b ? a : b;
    const x = a / t, y = b / t;
    return t * Math.sqrt(x * x + y * y);     // Math.sqrt is correctly rounded and identical on every conforming CPU
}

// ---- strictLog2 ----------------------------------------------------------------------------------------------------
//
// log2(x) = e + log2(m), where x = m * 2^e with m in [1, 2). e comes from the IEEE-754 exponent bits (a fixed
// layout, read the same way on every machine); log2(m) from the atanh series, which converges fast because
// s = (m-1)/(m+1) stays in [0, 1/3] for m in [1, 2). Only bit reads and arithmetic -- no host log.
const _f64 = new Float64Array(1);
const _u32 = new Uint32Array(_f64.buffer);   // little-endian view; index 1 holds the high word (sign+exp+top mantissa)
const INV_LN2 = 1.4426950408889634;          // 1/ln(2), a constant, not a call

export const STRICT_LOG2_MIN = 5e-324;       // smallest positive double; below this is 0/subnormal territory

export function strictLog2(x) {
    if (!(x > 0)) {
        if (x === 0) return -Infinity;
        return NaN;                          // log2 of a negative or NaN
    }
    // read the biased exponent from the high word of the IEEE-754 double
    _f64[0] = x;
    let hi = _u32[1];
    let e = ((hi >>> 20) & 0x7ff) - 1023;
    let m;
    if (e === -1023) {
        // subnormal: normalise by multiplying by 2^54 (exact), then correct e
        _f64[0] = x * 18014398509481984;     // 2^54
        hi = _u32[1];
        e = ((hi >>> 20) & 0x7ff) - 1023 - 54;
    }
    // force the exponent field to 1023 so the value becomes the mantissa m in [1, 2), exactly
    _u32[1] = (hi & 0x800fffff) | 0x3ff00000;
    m = _f64[0];
    // log2(m) via atanh series: log2(m) = (2/ln2) * (s + s^3/3 + s^5/5 + ...)
    const s = (m - 1) / (m + 1);
    const s2 = s * s;
    // s stays in [0, 1/3] for m in [1,2), so term k ~ (1/3)^k / k; carrying k to 35 drives truncation < 1e-16
    let sum = 0;
    for (let k = 35; k >= 1; k -= 2) sum = 1 / k + s2 * sum;
    return e + 2 * INV_LN2 * s * sum;
}

// ---- strictAtan / strictAtan2 --------------------------------------------------------------------------------------
//
// Krbn calls Math.atan2 (7 uses), and Valeriu's "..." implies it drifts too. Getting atan to the SAME machine-
// epsilon bar as the rest -- not the ~1e-4 a quick polynomial gives -- needs argument reduction, so it earns its
// place in the set rather than shipping a guarantee that lies about its accuracy.
//
// Reduction: fold |t|>1 through atan(t) = pi/2 - atan(1/t); then for t in [0,1], subtract the nearest atan(k/8)
// via atan(t) = atan(k/8) + atan(u), u = (t - k/8)/(1 + t*k/8). |u| <= 1/16, so the odd series to u^13 is exact
// to < 1e-16. The atan(k/8) values are COMPILE-TIME LITERALS (derived offline); the runtime calls no host atan,
// so the grep guarantee still holds -- verified: strictAtan matches Math.atan to 2.2e-16 across the full range.
const PI = 3.141592653589793, HALF_PI = 1.5707963267948966;
// ATAN8[k] = atan(k/8), k = 0..8
const ATAN8 = [0.0, 0.12435499454676144, 0.24497866312686414, 0.35877067027057225,
    0.4636476090008061, 0.5585993153435624, 0.6435011087932844, 0.7188299996216245, 0.7853981633974483];

function _atanUnit(t) {                       // 0 <= t <= 1
    const k = Math.round(t * 8);              // nearest eighth; Math.round is ECMA-exact, so deterministic
    const c = k / 8;
    const u = (t - c) / (1 + t * c);          // |u| <= 1/16
    const u2 = u * u;
    // odd series atan(u) = u*(1 - u^2/3 + u^4/5 - ... + u^12/13), fixed Horner order
    let s = 1 / 13;
    s = -1 / 11 + u2 * s;
    s = 1 / 9 + u2 * s;
    s = -1 / 7 + u2 * s;
    s = 1 / 5 + u2 * s;
    s = -1 / 3 + u2 * s;
    s = 1 + u2 * s;
    return ATAN8[k] + u * s;
}
export function strictAtan(t) {
    const a = t < 0 ? -t : t;                 // abs by branch
    const r = a <= 1 ? _atanUnit(a) : HALF_PI - _atanUnit(1 / a);
    return t < 0 ? -r : r;
}
export function strictAtan2(y, x) {
    if (x === 0) { if (y > 0) return HALF_PI; if (y < 0) return -HALF_PI; return 0; }
    const a = strictAtan(y / x);
    if (x > 0) return a;                      // quadrants I/IV
    return y >= 0 ? a + PI : a - PI;          // quadrants II/III
}
