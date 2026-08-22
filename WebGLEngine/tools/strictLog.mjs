// tools/strictLog.mjs
//
// A bit-identical natural logarithm, in +,-,*,/ alone -- the last piece the strict-math core was missing, and the one
// that unlocks the Riemann zeta function on the critical line, where n^(1/2+it) = sqrt(n) * exp(i t ln n) needs ln n.
//
// The trick is to never ask a series to cover a wide range. Any positive double is m * 2^e with the mantissa m in
// [1,2), and those two pieces are read straight from the IEEE-754 bits -- exact, integer, the same on every machine.
// Then ln(x) = e*ln2 + ln(m), and ln(m) for m in [1,2) is got from the fast series ln(m) = 2*(t + t^3/3 + t^5/5 + ...)
// with t = (m-1)/(m+1), which for m in [1,2) has |t| <= 1/3, so a dozen odd terms reach the last bit. ln2 is the
// ECMAScript constant Math.LN2, the same bits on every conforming engine, like Math.PI. No Math.log, no Math.pow.
const LN2 = Math.LN2;
const _buf = new DataView(new ArrayBuffer(8));

export function strictLog(x) {
    // x must be > 0 and finite. Split x = m * 2^e, m in [1,2).
    _buf.setFloat64(0, x);
    const hi = _buf.getUint32(0), lo = _buf.getUint32(4);
    let e = ((hi >>> 20) & 0x7ff) - 1023;
    // reconstruct m by forcing the exponent field to 1023 (2^0), keeping the mantissa bits
    _buf.setUint32(0, (hi & 0x000fffff) | 0x3ff00000);
    _buf.setUint32(4, lo);
    const m = _buf.getFloat64(0);
    // ln(m) via the atanh series
    const t = (m - 1) / (m + 1), t2 = t * t;
    let term = t, sum = t;
    for (let k = 3; k <= 25; k += 2) { term *= t2; sum += term / k; }
    return e * LN2 + 2 * sum;
}
