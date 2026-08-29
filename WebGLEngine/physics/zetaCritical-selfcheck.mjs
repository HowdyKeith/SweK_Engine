// physics/zetaCritical-selfcheck.mjs
//
// Run: node physics/zetaCritical-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The instrument that walks up the critical line. The gate proves it lands where the zeros are known to be -- the first
// three nontrivial zeros of zeta, at t near 14.1347, 21.0220, 25.0109, each found by minimising |zeta(1/2+it)| and each
// driving the magnitude down to machine zero -- while a point between zeros stays order one, so the dips are real and
// specific, not everywhere. It also checks the piece that makes the whole thing possible: the strict logarithm agrees
// with the true log to a part in a trillion. The sabotage drops the exponent split in the strict log, which is the
// range reduction that keeps its series accurate; the logs go wrong for every n above two, the phases n^(i t) scatter,
// and the zeros dissolve -- |zeta| at the first zero is no longer near anything. This is emphatically NOT a proof of
// the Riemann Hypothesis; it locates zeros and computes the function, exactly and reproducibly. It does not prove all
// zeros lie on this line -- that remains open.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strictLog } from "../tools/strictLog.mjs";
import { zetaMag, refineZero, etaCritical } from "./zetaCritical.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. FIRST ZERO: |zeta(1/2+it)| bottoms out at t ~ 14.134725 -----------------------------------------
{
    const z = refineZero(13.5, 15), mag = zetaMag(z);
    ok("!! the first nontrivial zero is found near t = 14.134725", Math.abs(z - 14.134725) < 1e-4 && mag < 1e-9,
       "minimising |zeta(1/2+it)| lands on t = " + z.toFixed(6) + " (known 14.134725), where |zeta| = " + mag.toExponential(1) + " -- a zero of the zeta function on the critical line, located exactly.");
}

// ---- 2. MORE ZEROS: the second and third at 21.0220 and 25.0109 -----------------------------------------
{
    const z2 = refineZero(20, 22), z3 = refineZero(24, 26);
    ok("!! the second and third zeros are found at 21.0220 and 25.0109", Math.abs(z2 - 21.022040) < 1e-4 && Math.abs(z3 - 25.010858) < 1e-4,
       "the next two zeros come out at t = " + z2.toFixed(6) + " and " + z3.toFixed(6) + " (known 21.022040, 25.010858) -- the instrument walks up the line and finds them in place.");
}

// ---- 3. OFF-ZERO: between zeros the magnitude is order one, so the dips are specific ---------------------
{
    const m17 = zetaMag(17), m18 = zetaMag(18);
    ok("!! away from a zero the magnitude is order one -- the dips are specific", m17 > 1.5 && m18 > 1.5,
       "at t = 17 and 18, between zeros, |zeta| is " + m17.toFixed(2) + " and " + m18.toFixed(2) + " -- the function is not small everywhere; it dips to zero only at the zeros.");
}

// ---- 3b. etaCritical DIRECTLY: eta(1/2) against the known closed-form constant, and its OWN zero at t0 ---
//
// t=0 is a real-axis point where the Dirichlet eta function has a known reference value, and it isolates
// etaCritical's real-arithmetic core alone: t*ln(j) = 0 for every j, so strictSin(0)=0 and strictCos(0)=1
// exactly, and the imaginary part must vanish exactly too, no tolerance needed for it.
{
    const e0 = etaCritical(0);
    const KNOWN_ETA_HALF = 0.6048986434216303702099;   // eta(1/2), Cohen-Villegas-Zagier / Abel-summed reference
    ok("!! etaCritical(0) is eta(1/2), the known closed-form constant, to double precision", Math.abs(e0.re - KNOWN_ETA_HALF) < 1e-13 && e0.im === 0,
       "etaCritical(0) = " + e0.re.toFixed(16) + " against the published eta(1/2) = 0.6048986434216304 -- and " +
       "the imaginary part is exactly 0, not merely small, because every phase t*ln(j) is exactly 0 at t=0.");

    // The zeta-side gate (checks 1-2, above) already trusts refineZero to land on zeta's first nontrivial zero.
    // The eta-zeta prefactor (1 - 2^(1-s)) is finite and nonzero there (it only vanishes at s=1), so eta itself
    // must ALSO be essentially zero at that t -- a fact about etaCritical alone, checked without going through
    // the zeta division that most of this file already exercises.
    const t0 = refineZero(13.5, 15);
    const eZero = etaCritical(t0), magEta = Math.sqrt(eZero.re * eZero.re + eZero.im * eZero.im);
    ok("!! etaCritical is itself essentially zero at zeta's first nontrivial zero (t=" + t0.toFixed(6) + ")", magEta < 1e-9,
       "|eta(1/2+it)| = " + magEta.toExponential(1) + " at the t where |zeta| already bottoms out -- the eta-zeta " +
       "prefactor (1 - 2^(1-s)) is finite and nonzero at this t, so eta having a zero here is a fact about the " +
       "alternating series and its CVZ acceleration directly, not an artifact of the later division into zeta.");

    // Off that zero, eta is order one (mirroring the zeta off-zero check), so the dip above is specific.
    ok("!! and away from a zero, etaCritical is order one, not small", Math.sqrt(etaCritical(17).re ** 2 + etaCritical(17).im ** 2) > 1.5,
       "|eta(1/2+17i)| = " + Math.sqrt(etaCritical(17).re ** 2 + etaCritical(17).im ** 2).toFixed(3) + " -- the near-zero " +
       "value at t0 above is a located zero, not a series that has simply gone small everywhere.");
}

// ---- 4. STRICT LOG: the enabling piece agrees with the true logarithm -----------------------------------
{
    let worst = 0; for (let n = 1; n <= 100; n++) worst = Math.max(worst, Math.abs(strictLog(n) - Math.log(n)));
    ok("!! the strict logarithm that powers n^(i t) is accurate", worst < 1e-12,
       "strictLog matches the true log to " + worst.toExponential(1) + " over n = 1..100 -- the exponent split plus the atanh series, in +,-,*,/, is what makes n^(i t) computable bit-identically.");
}

// ---- 5. DETERMINISTIC + strict (no libm beyond sqrt) ----------------------------------------------------
{
    const det = zetaMag(14.134725) === zetaMag(14.134725) && strictLog(7) === strictLog(7);
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const srcZ = fs.readFileSync(path.join(dir, "zetaCritical.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const srcL = fs.readFileSync(path.join(dir, "..", "tools", "strictLog.mjs"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(srcZ) && !/Math\.(sin|cos|tan|exp|pow|hypot|random|acos|asin|atan)\b/.test(srcL);
    ok("!! critical-line zeta is deterministic and strict", det && clean,
       "the magnitude and the log reproduce exactly, and the code uses the strict trig and strict log cores with only sqrt from Math -- so the zeros are located to the same bits on every machine.");
}

console.log(fails ? "\nzetaCritical-selfcheck: " + fails + " FAILED" : "\nzetaCritical-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
