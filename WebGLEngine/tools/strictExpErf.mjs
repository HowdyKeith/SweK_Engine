// WebGLEngine/tools/strictExpErf.mjs — v2650
//
// exp and erfc THAT ARE THE SAME BITS ON EVERY CONFORMING MACHINE, BY CONSTRUCTION -- the two transcendentals the
// Ewald sum needs that strictTrig did not already cover. Same doctrine as strictTrig.mjs: this file calls NO library
// transcendental. It uses + - * / and Math.round/floor/abs, which ECMA-262 specifies exactly, so its output cannot
// differ between machines. The gate greps this file for Math.exp/log/pow/sin/cos and fails if it finds any.
//
// strictExp: Cody-Waite range reduction x = k ln2 + r with |r| <= ln2/2, then a degree-13 Taylor of exp(r) (whose
// remainder at |r|=ln2/2 is about 4e-18, sub-ulp), then an EXACT scale by 2^k (powers of two are exact in IEEE, and
// so is multiplication by them until overflow). strictErfc: Abramowitz and Stegun 7.1.26, a fifth-degree polynomial
// in 1/(1+px) times strictExp(-x^2) -- about 1.5e-7 absolute, which is ample for electrostatics, and deterministic
// because every operation in it is either an IEEE primitive or strictExp.

export const STRICT = true;

const LN2_HI = 6.93147180369123816490e-01;   // high bits of ln2 (trailing zeros -> k*LN2_HI is exact for moderate k)
const LN2_LO = 1.90821492927058770002e-10;   // the tail
const INV_LN2 = 1.44269504088896338700e+00;  // 1/ln2
// 1/n! for n = 0..13
const IF = [1, 1, 0.5, 1 / 6, 1 / 24, 1 / 120, 1 / 720, 1 / 5040, 1 / 40320, 1 / 362880, 1 / 3628800, 1 / 39916800, 1 / 479001600, 1 / 6227020800];

// exact multiply by 2^k (k integer) by repeated doubling/halving -- every step is exact in IEEE
function scale2(v, k) {
    if (k === 0) return v;
    const base = k > 0 ? 2 : 0.5;
    let n = k > 0 ? k : -k;
    while (n-- > 0) v *= base;
    return v;
}

export function strictExp(x) {
    if (x !== x) return NaN;
    if (x === Infinity) return Infinity;
    if (x === -Infinity) return 0;
    const k = Math.round(x * INV_LN2);
    const r = (x - k * LN2_HI) - k * LN2_LO;      // Cody-Waite reduced argument, |r| <= ln2/2
    let e = IF[13];
    for (let i = 12; i >= 0; i--) e = e * r + IF[i];   // Horner Taylor of exp(r)
    return scale2(e, k);
}

// A&S 7.1.26 constants
const P = 0.3275911, A1 = 0.254829592, A2 = -0.284496736, A3 = 1.421413741, A4 = -1.453152027, A5 = 1.061405429;

export function strictErfc(x) {
    if (x < 0) return 2 - strictErfc(-x);
    const t = 1 / (1 + P * x);
    const poly = t * (A1 + t * (A2 + t * (A3 + t * (A4 + t * A5))));
    return poly * strictExp(-x * x);
}

export function strictErf(x) { return 1 - strictErfc(x); }
