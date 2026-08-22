// physics/zeta.js
//
// The Riemann zeta function, and the bridge that first tied it to pi. zeta(s) is the sum of 1 over n-to-the-s over all
// whole numbers n, and Euler found the astonishing fact that zeta(2) -- one plus a quarter plus a ninth plus a
// sixteenth, forever -- is exactly pi-squared over six. That is the Basel problem, and it is the cleanest thing zeta
// has to say: a sum over the integers that has no circle in it anywhere produces pi. This computes zeta(s) for real s
// by Euler-Maclaurin summation -- a few dozen terms plus a tail correction from the Bernoulli numbers -- which reaches
// machine precision where naive summation would still be crawling, and it does so in +,-,*,/ alone, so pi comes back
// bit-identical on every machine. It is the pi-zeta bridge as an exact, reproducible computation.
//
// Real s is now honest: for NON-integer s the direct powers go through realPow = strictExp(s * strictLog(x)),
// composed from the tree's EXISTING strict-libm -- tools/strictExpErf.mjs and tools/strictLog.mjs, the same
// libm-free exp/log that physics/zetaCritical.js already uses on the critical line. (Before v3812, ipow's counted
// loop ran ceil(s) times, so zeta(2.5) silently returned zeta(3); zeta-selfcheck only ever tested integers, so
// nothing noticed.) The complex case -- n-to-the-i-t -- is already handled by zetaCritical via strictTrig.
import { strictExp } from "../tools/strictExpErf.mjs";
import { strictLog } from "../tools/strictLog.mjs";
const realPow = (x, s) => strictExp(s * strictLog(x));   // x > 0; integer s never reaches here (see ipow)

// Bernoulli numbers B_2, B_4, B_6, B_8, B_10 and the factorials (2k)! for the Euler-Maclaurin tail.
const B2K = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66];
const FACT2K = [2, 24, 720, 40320, 3628800];   // 2!, 4!, 6!, 8!, 10!

// zeta(s) for real s > 1 by Euler-Maclaurin. M is the number of leading terms summed directly; K the tail corrections.
export function zeta(s, { M = 12, K = 5 } = {}) {
    let sum = 0;
    for (let n = 1; n < M; n++) sum += 1 / ipow(n, s);   // direct terms 1..M-1; term M enters via the endpoint below
    // tail from the integral + endpoint + Bernoulli corrections, all in terms of M^{-...}
    const Ms = ipow(M, s);
    sum += 1 / ((s - 1) * ipow(M, s - 1));   // integral of the tail
    sum += 0.5 / Ms;                          // endpoint
    // Bernoulli terms: B_{2k}/(2k)! * (rising factorial s..s+2k-2) / M^{s+2k-1}
    let rising = s, Mp = Ms * M;              // Mp = M^{s+1}
    for (let k = 0; k < K; k++) {
        sum += B2K[k] / FACT2K[k] * rising / Mp;
        rising *= (s + 2 * k + 1) * (s + 2 * k + 2);   // extend the rising factorial by two
        Mp *= M * M;                                    // M^{s+2k+1} -> M^{s+2k+3}
    }
    return sum;
}

// x^s. INTEGER s: repeated multiplication, exact and byte-for-byte unchanged from before v3812 -- +,-,*,/ only,
// the Basel/Apery path, so every integer zeta value (and everything downstream) is untouched. NON-INTEGER s:
// realPow = strictExp(s * strictLog(x)) from the existing tools/ strict-libm, also libm-free, so the sum stays
// bit-identical across the fleet. This is the line that carried the zeta(2.5)=zeta(3) bug: the old loop ran ceil(s).
function ipow(x, s) {
    if (Number.isInteger(s)) { let r = 1; for (let i = 0; i < s; i++) r *= x; return r; }
    return realPow(x, s);
}

// pi recovered from the Basel identity: pi = sqrt(6 * zeta(2)). The circle constant out of a sum over the integers.
export function piFromZeta() { return Math.sqrt(6 * zeta(2)); }

// The known closed forms zeta(2n) = rational * pi^(2n): return the rational coefficient c so that zeta(2n) = c * pi^(2n).
export function evenZetaCoefficient(twoN) {
    // c_2 = 1/6, c_4 = 1/90, c_6 = 1/945, c_8 = 1/9450
    const table = { 2: 1 / 6, 4: 1 / 90, 6: 1 / 945, 8: 1 / 9450 };
    return table[twoN];
}
