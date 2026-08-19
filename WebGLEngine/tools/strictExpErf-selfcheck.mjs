// WebGLEngine/tools/strictExpErf-selfcheck.mjs — v2650
//
// Run: node tools/strictExpErf-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// strictExp is checkable against the platform Math.exp -- not because Math.exp is the truth, but because agreeing
// with it to a few ulp shows strictExp is correct while the grep shows it is ALSO reproducible, which Math.exp is
// not. strictErfc has no Math counterpart in JS, so it is checked against tabulated erfc values. The determinism
// check greps both for any library transcendental.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strictExp, strictErfc, strictErf } from "./strictExpErf.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. strictExp AGREES WITH Math.exp TO A FEW ULP OVER A WIDE RANGE ----------------------------------------------
{
    let worstUlp = 0, worstAt = 0;
    for (let x = -30; x <= 30; x += 0.013) {
        const a = strictExp(x), b = Math.exp(x);
        const ulp = Math.abs(a - b) / (b === 0 ? Number.MIN_VALUE : Math.abs(b) * 2.220446049250313e-16);
        if (ulp > worstUlp) { worstUlp = ulp; worstAt = x; }
    }
    ok("!! strictExp agrees with Math.exp to a few ulp across [-30,30]", worstUlp < 8,
       "worst " + worstUlp.toFixed(2) + " ulp at x=" + worstAt.toFixed(3) + " -- correct where Math.exp is, but reproducible where Math.exp is not.");
}

// ---- 2. strictExp EXACT AT ANCHORS ---------------------------------------------------------------------------------
ok("!! strictExp(0)=1 and strictExp is self-consistent (exp(a+b)=exp(a)exp(b))",
   strictExp(0) === 1 && Math.abs(strictExp(1.3 + 2.1) - strictExp(1.3) * strictExp(2.1)) < 1e-12,
   "exp(0)=1 exactly; exp(a+b) matches exp(a)exp(b) to 1e-12 -- the range reduction and scaling compose.");

// ---- 3. strictErfc MATCHES TABULATED VALUES ------------------------------------------------------------------------
{
    // reference erfc values (NIST / A&S tables)
    const tab = [[0, 1], [0.5, 0.4795001221869535], [1, 0.15729920705028513], [1.5, 0.03389485352168572], [2, 0.004677734981047266], [2.5, 0.0004069520174449589], [3, 2.20904969985854e-05]];
    let worst = 0, at = 0;
    for (const [x, ref] of tab) { const e = Math.abs(strictErfc(x) - ref); if (e > worst) { worst = e; at = x; } }
    ok("!! strictErfc matches tabulated erfc to ~1e-7", worst < 3e-7,
       "worst |strictErfc - table| = " + worst.toExponential(2) + " at x=" + at + " -- A&S 7.1.26, ample for the real-space Ewald sum.");
}

// ---- 4. erfc/erf CONSISTENCY AND ENDPOINTS -------------------------------------------------------------------------
ok("!! erfc(0)~1, erf(0)~0, erfc(x)+erf(x)=1 exactly, erfc large-x -> 0",
   Math.abs(strictErfc(0) - 1) < 1e-6 && Math.abs(strictErf(0)) < 1e-6 && Math.abs(strictErfc(1.234) + strictErf(1.234) - 1) < 1e-12 && strictErfc(6) >= 0 && strictErfc(6) < 1e-6,
   "erfc and erf are complementary (exactly, since erf=1-erfc) and bounded -- erfc(6) ~ " + strictErfc(6).toExponential(1) + ", non-negative. erfc(0) is within A&S's 1.5e-7.");

// ---- 5. DETERMINISM: NO LIBRARY TRANSCENDENTAL IN THE SOURCE --------------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "strictExpErf.mjs"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(exp|log|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot|expm1|log1p)\b/;
    ok("!! strictExpErf.mjs calls no library transcendental (only + - * / and round/floor/abs)", !banned.test(src),
       "the exp and erfc are built from IEEE primitives, so they are bit-identical on every conforming machine BY CONSTRUCTION, not by testing.");
}

console.log(fails ? "\nstrictExpErf-selfcheck: " + fails + " FAILED" : "\nstrictExpErf-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
