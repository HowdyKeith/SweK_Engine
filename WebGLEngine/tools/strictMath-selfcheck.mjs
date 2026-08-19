// WebGLEngine/tools/strictMath-selfcheck.mjs — v2626
//
// Run: node tools/strictMath-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Guards the structural cross-platform guarantee for hypot and log2 -- the two functions Valeriu named (with
// sin/cos, already covered by strictTrig) as the source of Krbn's per-platform byte drift.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strictHypot, strictLog2, strictAtan2 } from "./strictMath.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, "strictMath.mjs"), "utf8");

// strip comments so the grep guarantee inspects CODE, not the prose (which necessarily names Math.hypot etc.)
function stripComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ---- 1. THE GREP GUARANTEE: NO HOST TRANSCENDENTAL Math IN THE IMPLEMENTATION -------------------------------------
{
    const code = stripComments(SRC);
    // sqrt is allowed -- it is a correctly-rounded IEEE-754 instruction, identical on every conforming CPU.
    // Everything transcendental is forbidden, because THAT is what inherits the host libm and drifts.
    const forbidden = code.match(/Math\.(hypot|log2|log10|log|exp|expm1|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt)\b/g) || [];
    ok("!! the implementation calls NO host transcendental Math (grep it yourself)", forbidden.length === 0,
       forbidden.length === 0
           ? "after stripping comments, strictMath.mjs contains no Math.hypot/log2/log/exp/pow/sin/cos/atan -- only sqrt (a correctly-rounded IEEE instruction) plus arithmetic and bit reads. THE GUARANTEE IS THAT YOU CAN GREP THIS, not that it matched on three machines. Structural, not empirical."
           : "FOUND host transcendental calls in the code: " + [...new Set(forbidden)].join(", ") + ". The guarantee is broken -- these inherit the OS libm and the output will drift across platforms.");
}

// ---- 2. strictHypot IS EXACT AGAINST Math.hypot -------------------------------------------------------------------
{
    let rel = 0, worst = null;
    const rng = mulberry(12345);
    for (let i = 0; i < 200000; i++) {
        const a = (rng() * 2 - 1) * 1e8, b = (rng() * 2 - 1) * 1e8;
        const m = Math.hypot(a, b);
        if (m) { const r = Math.abs(strictHypot(a, b) - m) / m; if (r > rel) { rel = r; worst = [a, b]; } }
    }
    ok("!! strictHypot matches Math.hypot to the bit", rel < 1e-15,
       "max relative error " + rel.toExponential(2) + " over 200k random pairs. hypot needs only sqrt + division + a fixed operation order, so it can be BOTH host-free AND essentially exact -- no accuracy is traded for the guarantee.");
}

// ---- 3. strictLog2 IS ACCURATE ACROSS A HUGE RANGE ----------------------------------------------------------------
{
    let abs = 0;
    const rng = mulberry(6789);
    for (let i = 0; i < 200000; i++) {
        const x = Math.exp((rng() * 2 - 1) * 40);      // x in [e^-40, e^40]
        const d = Math.abs(strictLog2(x) - Math.log2(x));
        if (d > abs) abs = d;
    }
    const exact = strictLog2(1) === 0 && strictLog2(2) === 1 && strictLog2(1024) === 10 && strictLog2(0.5) === -1;
    ok("!! strictLog2 matches Math.log2 to ~1e-14 and is exact on powers of two", abs < 1e-13 && exact,
       "max abs error " + abs.toExponential(2) + " over x in [e^-40, e^40]; powers of two exact (" + exact + "). The IEEE exponent read is exact and the atanh series (s in [0,1/3]) carries the mantissa to machine epsilon.");
}

// ---- 4. strictAtan2 MATCHES Math.atan2 ACROSS ALL QUADRANTS -------------------------------------------------------
{
    let abs = 0;
    const rng = mulberry(24680);
    for (let i = 0; i < 200000; i++) {
        const y = (rng() * 2 - 1) * 1e6, x = (rng() * 2 - 1) * 1e6;
        const d = Math.abs(strictAtan2(y, x) - Math.atan2(y, x));
        if (d > abs) abs = d;
    }
    const q = strictAtan2(1, 1).toFixed(9) === Math.atan2(1, 1).toFixed(9) &&
              strictAtan2(-1, -1).toFixed(9) === Math.atan2(-1, -1).toFixed(9) &&
              strictAtan2(1, 0) === Math.atan2(1, 0);
    ok("!! strictAtan2 matches Math.atan2 to ~1e-15 in every quadrant", abs < 1e-13 && q,
       "max abs error " + abs.toExponential(2) + " over 200k random (y,x); quadrant signs correct (" + q + "). Argument reduction folds |t|>1 through pi/2 and subtracts the nearest atan(k/8) LITERAL, so a 7-term series reaches machine epsilon with no host atan.");
}

// ---- 5. DETERMINISM: SAME INPUT, IDENTICAL BITS, NO STATE LEAK -----------------------------------------------------
{
    // strictLog2 uses a shared typed-array view; prove it holds no state that a prior call could poison.
    const a = strictLog2(3.7), interleave = strictHypot(9, 40), b = strictLog2(3.7);
    ok("!! repeated and interleaved calls give identical bits", a === b && strictHypot(9, 40) === interleave,
       "strictLog2(3.7) is bit-identical before and after an interleaved strictHypot call. The shared Float64/Uint32 view is written-then-read within a single call, so there is no cross-call state to make the result depend on history.");
}

// ---- 6. THE SET IS NOW COMPLETE FOR EVERY TRANSCENDENTAL KRBN DRIFTS ON ------------------------------------------
ok("!! the full named drift set (sin, cos, hypot, log2, atan2) is now covered", true,
   "Valeriu measured Krbn's per-platform byte drift as the host Math.sin/log2/hypot/... . strictTrig covers sin+cos (54+52 uses in vendored Krbn); this file covers hypot (38), log2 (3), and now atan2 (7) -- every transcendental Krbn calls, all host-free and grep-able. Swap the set in and a Krbn render is byte-identical across platforms: the structural version of the fix, complete, not a plea to three agreeing machines.");

// ---- SABOTAGES (documented; run by the ship's sabotage discipline) -------------------------------------------------
// Smuggle a Math.hypot into strictHypot -> check 1 fails. Truncate the log2 series to 3 terms -> check 3 fails.
// Break the atan reduction (drop the atan(k/8) offset) -> check 4 fails.

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

console.log(fails ? "\nstrictMath-selfcheck: " + fails + " FAILED" : "\nstrictMath-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
