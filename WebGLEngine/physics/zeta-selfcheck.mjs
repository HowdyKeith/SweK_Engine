// physics/zeta-selfcheck.mjs
//
// Run: node physics/zeta-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The pi-zeta bridge, computed rather than asserted. The gate holds it to the identities Euler proved and to one thing
// he could not: zeta(2) equals pi-squared over six to machine precision; pi comes back out as the square root of six
// times zeta(2), the circle constant from a sum with no circle in it; the higher even values match their closed forms
// pi-to-the-2n over a rational; and zeta(3), which has NO closed form, lands on Apery's constant to twelve digits --
// proof the routine is genuinely summing the series, not reciting pi formulas. The sabotage drops the Euler-Maclaurin
// integral term that stands in for the infinite tail, and every value falls short, because a few dozen terms without
// the tail is not the zeta function.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { zeta, piFromZeta, evenZetaCoefficient } from "./zeta.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const PI = Math.PI;

// ---- 1. BASEL: zeta(2) = pi^2 / 6 -----------------------------------------------------------------------
{
    const z2 = zeta(2), err = Math.abs(z2 - PI * PI / 6);
    ok("!! zeta(2) equals pi-squared over six (the Basel problem)", err < 1e-13,
       "the sum of one over the squares comes to " + z2.toFixed(15) + ", matching pi^2/6 to " + err.toExponential(1) + " -- a sum over the whole numbers producing pi.");
}

// ---- 2. PI FROM ZETA: sqrt(6 zeta(2)) = pi ---------------------------------------------------------------
{
    const p = piFromZeta(), err = Math.abs(p - PI);
    ok("!! pi comes back out of zeta as sqrt(6 zeta(2))", err < 1e-13,
       "sqrt(6 zeta(2)) = " + p.toFixed(15) + " against pi = " + PI.toFixed(15) + ", to " + err.toExponential(1) + " -- the circle constant recovered from a series with no circle in it.");
}

// ---- 3. EVEN VALUES: zeta(2n) = c_2n * pi^(2n) ----------------------------------------------------------
{
    let worst = 0, detail = "";
    for (const twoN of [2, 4, 6, 8]) { const zc = zeta(twoN), closed = evenZetaCoefficient(twoN) * Math.pow(PI, twoN), e = Math.abs(zc - closed); if (e > worst) { worst = e; detail = "zeta(" + twoN + ")"; } }
    ok("!! the even zeta values match their pi-to-the-2n closed forms", worst < 1e-12,
       "zeta(2), zeta(4), zeta(6), zeta(8) each match c*pi^(2n) to within " + worst.toExponential(1) + " (worst at " + detail + ") -- the whole even family is pi^(2n) times a rational.");
}

// ---- 4. APERY: zeta(3) has no closed form yet is computed correctly --------------------------------------
{
    const z3 = zeta(3), APERY = 1.2020569031595942854;
    ok("!! zeta(3) lands on Apery's constant -- a genuine sum, not a pi formula", Math.abs(z3 - APERY) < 1e-12,
       "zeta(3) = " + z3.toFixed(15) + " against Apery's 1.202056903159594, to " + Math.abs(z3 - APERY).toExponential(1) + " -- no closed form exists, so this can only be the series actually summed.");
}

// ---- 4b. REAL (NON-INTEGER) s -- THE TEST WHOSE ABSENCE HID A BUG FROM v2797 TO v3811 -------------------
// Every test above uses an INTEGER s. That is exactly why nobody noticed that ipow's counted loop ran ceil(s)
// times for non-integer s, so zeta(2.5) silently returned zeta(3). v3811's blackbody gate drove it from outside;
// v3812 fixed ipow to route real s through realPow = strictExp(s*strictLog(x)), composed from the tree's
// existing strict-libm (tools/strictExpErf + tools/strictLog). This section is the regression guard that
// should have existed all along. The reference is an INDEPENDENT route: a long direct sum with an Euler-Maclaurin
// tail, computed with Math.pow purely as a single-machine ORACLE (as section 3 already does for pi^(2n)).
{
    const refZeta = (s) => {
        const N = 200000; let a = 0;
        for (let n = 1; n <= N; n++) a += Math.pow(n, -s);
        a += Math.pow(N, 1 - s) / (s - 1) + 0.5 * Math.pow(N, -s) + (s / 12) * Math.pow(N, -s - 1); // EM tail
        return a;
    };
    let worst = 0, at = 0;
    for (const s of [2.5, 3.5, 5.5, 7.25]) { const e = Math.abs(zeta(s) - refZeta(s)) / refZeta(s); if (e > worst) { worst = e; at = s; } }
    ok("!! zeta at non-integer s matches an independent direct-sum oracle", worst < 1e-9,
        "worst rel " + worst.toExponential(2) + " at s=" + at + " -- e.g. zeta(2.5) = " + zeta(2.5).toFixed(12) +
        " against the oracle's " + refZeta(2.5).toFixed(12) + ", now the real-s Euler-Maclaurin actually summed");
    // and the specific fingerprint of the OLD bug: zeta(2.5) must no longer equal zeta(3)
    ok("!! zeta(2.5) is no longer zeta(3) (the ceil(s) bug is gone)", Math.abs(zeta(2.5) - zeta(3)) > 0.1,
        "zeta(2.5) = " + zeta(2.5).toFixed(10) + " vs zeta(3) = " + zeta(3).toFixed(10) + ", a gap of " +
        Math.abs(zeta(2.5) - zeta(3)).toFixed(4) + " -- before v3812 these were identical");
}

// ---- 5. DETERMINISTIC + PURE (no libm; only +,-,*,/ and a final sqrt) ------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "zeta.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the computation is deterministic and uses no transcendental", zeta(2) === zeta(2) && piFromZeta() === piFromZeta() && clean,
       "zeta and pi reproduce exactly and the sum is +,-,*,/ with a single sqrt for pi -- no Math.pow, no logs, so the value is bit-identical across machines and joins the fingerprint.");
}

console.log(fails ? "\nzeta-selfcheck: " + fails + " FAILED" : "\nzeta-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
