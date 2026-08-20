// physics/zetaCritical.js
//
// The Riemann zeta function on the critical line, s = 1/2 + i t, where the famous unsolved question lives: are ALL the
// nontrivial zeros here, on the line where the real part is one-half? This does not answer that -- nothing can, yet --
// but it builds the instrument to walk up the line and watch the zeros arrive, exactly and the same on every machine.
//
// The plain zeta sum does not converge here, so we use the Dirichlet eta function, eta(s) = sum (-1)^(n-1) n^-s, which
// converges for real part > 0 and equals (1 - 2^(1-s)) zeta(s). Each term n^-s = n^(-1/2) (cos(t ln n) - i sin(t ln n))
// is built from the strict log and the strict trig core, so it is bit-identical. The alternating series is slow, so it
// is accelerated by the Cohen-Villegas-Zagier method, whose weights are an integer power (3+sqrt8)^n built by repeated
// multiplication -- strict as well. Then zeta = eta / (1 - 2^(1-s)) by complex division. Where |zeta(1/2+it)| dips to
// zero, a nontrivial zero sits; the first are near t = 14.1347, 21.0220, 25.0109.
import { strictLog } from "../tools/strictLog.mjs";
import { strictSin, strictCos } from "../tools/strictTrig.mjs";

// eta(1/2 + i t) by Cohen-Villegas-Zagier acceleration of the alternating series, N terms.
export function etaCritical(t, N = 44) {
    const base = 3 + Math.sqrt(8);
    let d = 1; for (let i = 0; i < N; i++) d *= base; d = (d + 1 / d) / 2;
    let b = -1, c = -d, sre = 0, sim = 0;
    for (let k = 0; k < N; k++) {
        c = b - c;
        const j = k + 1, lnj = strictLog(j), inv = 1 / Math.sqrt(j);
        sre += c * (inv * strictCos(t * lnj));
        sim += c * (-inv * strictSin(t * lnj));
        b = (k + N) * (k - N) * b / ((k + 0.5) * (k + 1));
    }
    return { re: sre / d, im: sim / d };
}

// zeta(1/2 + i t) = eta / (1 - 2^(1-s)), s = 1/2 + i t, by complex division.
export function zetaCritical(t, N = 44) {
    const eta = etaCritical(t, N), ln2 = strictLog(2), r2 = Math.sqrt(2);
    // 2^(1-s) = 2^(1/2 - i t) = sqrt(2) (cos(t ln2) - i sin(t ln2))
    const pre = r2 * strictCos(t * ln2), pim = -r2 * strictSin(t * ln2);
    const dre = 1 - pre, dim = -pim, den = dre * dre + dim * dim;
    return { re: (eta.re * dre + eta.im * dim) / den, im: (eta.im * dre - eta.re * dim) / den };
}

// |zeta(1/2 + i t)| -- dips to zero at a nontrivial zero.
export function zetaMag(t, N = 44) { const z = zetaCritical(t, N); return Math.sqrt(z.re * z.re + z.im * z.im); }

// Refine a zero near t0 by golden-section minimisation of |zeta| on [a,b] -- returns the t of least magnitude.
export function refineZero(a, b, N = 44) {
    const gr = (Math.sqrt(5) - 1) / 2; let lo = a, hi = b;
    let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo), fc = zetaMag(c, N), fd = zetaMag(d, N);
    for (let it = 0; it < 80; it++) {
        if (fc < fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = zetaMag(c, N); }
        else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = zetaMag(d, N); }
    }
    return (lo + hi) / 2;
}
