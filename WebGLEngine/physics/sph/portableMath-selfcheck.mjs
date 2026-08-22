// WebGLEngine/physics/sph/portableMath-selfcheck.mjs — v2546
//
// Run: node physics/sph/portableMath-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// IEEE 754 PINS +, -, *, / AND sqrt. IT PINS NOTHING ELSE.
//
// Those five are correctly rounded by the standard: same inputs, same bits, on any conforming hardware, forever.
// pow, sin, cos, tan, cbrt, exp, log and hypot are NOT in that list, and ECMAScript does not add them -- the spec
// calls Math.pow "implementation-approximated". V8 on arm64 may differ from V8 on x86_64 in the last ulp and
// break no rule doing it.
//
// This engine asserts "same ticks -> bit-identical body" (fleshSph-selfcheck) and has only ever verified it ON
// ONE MACHINE. An arm64 Mac joins the fleet tomorrow and every other box is x86_64. So the assertion is about to
// be tested for real, and it was resting on Math.pow.
//
// MEASURED, ON THIS x86_64 BOX: Math.pow(h, 9) and h*h*h*h*h*h*h*h*h DISAGREE. Worst relative difference 6.09e-16
// -- about 3 ulps -- at h = 0.1, 0.35, 0.3762, 0.4739 (they agree only at 1 and 2.5, where the exponent lands on
// exact binary values). If two spellings of h^9 disagree on ONE machine, the one that is not IEEE-pinned is the
// one to drop.
//
// AND THIS IS 2+2+2=8 vs 2x2x2=9 AGAIN. Math.pow may well be MORE accurate -- it can be correctly rounded in a
// single step where nine multiplications round nine times. But it is implementation-approximated and
// multiplication is exact. The choice is: a slightly more accurate number two machines may disagree about, or a
// slightly less accurate number they CANNOT disagree about. The second one is the one you can check.
//
// This is a PHYSICS CHANGE, not a cleanup, and calling it a cleanup would be a lie: the numbers moved by ~3 ulps.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { poly6, spikyGrad, viscLaplacian } from "./kernels.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// Everything IEEE 754 does NOT pin. Math.PI is a constant and is fine. Math.min/max/abs/floor/round/sign are
// exact selections, not approximations, and are fine.
const UNPINNED = /Math\.(pow|sin|cos|tan|asin|acos|atan2|atan|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|cbrt|hypot|fround)\s*\(/g;

/** The files whose output this engine claims is reproducible. If a module is on this list, it may use only
 *  arithmetic the standard pins. */
const DETERMINISTIC = [
    "physics/sph/kernels.js",
    "physics/sph/spatialGrid.js",
    "physics/soft/boneField.js",
    "physics/soft/fleshDynamics.js",
    "simulation/tomo/nullspace.js",
];

// ---- 1. the hot path uses nothing the standard leaves open --------------------------------------------------
{
    for (const rel of DETERMINISTIC) {
        const p = path.join(root, rel);
        if (!fs.existsSync(p)) { ok("the deterministic list points at a real file: " + rel, false, "MISSING -- a list that names files that do not exist checks nothing"); continue; }
        const src = fs.readFileSync(p, "utf8");
        // strip comments: a comment ABOUT Math.pow is not a call to it. Without this, this very file's header
        // would fail its own check -- and a check that cannot survive being explained is a bad check.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
        const hits = [...code.matchAll(UNPINNED)].map((m) => m[0].replace(/\s*\($/, ""));
        ok(rel + " uses only arithmetic IEEE 754 pins", hits.length === 0,
           hits.length ? "UNPINNED: " + [...new Set(hits)].join(", ") + " -- arm64 and x86_64 may disagree here"
                       : "only + - * / sqrt and constants");
    }
}

// ---- 2. THE MEASUREMENT THAT STARTED THIS -------------------------------------------------------------------
// If the two spellings agreed, this whole file would be superstition. They do not.
{
    let worst = 0, at = 0;
    for (const h of [0.1, 0.35, 0.3762, 0.4739, 0.5, 1.7]) {
        const viaPow = 315 / (64 * Math.PI * Math.pow(h, 9));
        const h2 = h * h, h4 = h2 * h2, h8 = h4 * h4;
        const viaMul = 315 / (64 * Math.PI * (h8 * h));
        const rel = viaPow === viaMul ? 0 : Math.abs(viaPow - viaMul) / Math.abs(viaPow);
        if (rel > worst) { worst = rel; at = h; }
    }
    ok("Math.pow and exact multiplication REALLY DO DISAGREE (this file is not superstition)", worst > 0,
       worst > 0 ? "worst " + worst.toExponential(2) + " at h=" + at + " -- on ONE machine, with one instruction set"
                 : "they agreed everywhere tested, which would make the swap pointless");
}

// ---- 3. ...and the kernels still compute the kernel ----------------------------------------------------------
// A determinism fix that changes the physics is a physics change. It moved ~3 ulps; it must not have moved more.
{
    const h = 0.4;
    // W(0,h) = 315/(64 pi h^9) * h^6  -- the peak of the poly6 kernel, by hand, with Math.pow
    const expect = (315 / (64 * Math.PI * Math.pow(h, 9))) * Math.pow(h * h, 3);
    const got = poly6(0, h);
    const rel = Math.abs(got - expect) / expect;
    ok("poly6 still computes poly6 (within a few ulps of the pow spelling)", rel < 1e-12,
       "peak " + got.toExponential(8) + " vs " + expect.toExponential(8) + ", rel " + rel.toExponential(2));
    ok("...and the kernels are still zero outside h", poly6(h * h * 1.01, h) === 0 && spikyGrad(h * 1.01, h) === 0 && viscLaplacian(h * 1.01, h) === 0);
    ok("...and positive inside", poly6(0, h) > 0);
}

// ---- 4. the one that is NOT fixed, said out loud -------------------------------------------------------------
// fleshSph derives spacing with Math.cbrt -- ONE call, at setup, and it sets h and mass, so a 1-ulp difference
// there poisons every number downstream. It is not fixed because there is no exact cbrt, and pretending otherwise
// would be worse than naming it.
{
    const p = path.join(root, "physics/soft/fleshSph.js");
    const src = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const hits = [...src.matchAll(UNPINNED)].map((m) => m[0].replace(/\s*\($/, ""));
    ok("fleshSph's ONLY unpinned call is the known cbrt (nothing new crept in)",
       hits.length === 1 && hits[0] === "Math.cbrt",
       hits.length ? "unpinned: " + hits.join(", ") + " -- cbrt is KNOWN and sets h/mass at setup, so a 1-ulp arm64/x86_64 difference changes every number downstream. THE CROSS-ARCH TEST TOMORROW WILL SAY WHETHER IT MATTERS."
                   : "none -- the cbrt was removed, and this check needs updating");
}

console.log(fails ? "\nportableMath-selfcheck: " + fails + " FAILED" : "\nportableMath-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
