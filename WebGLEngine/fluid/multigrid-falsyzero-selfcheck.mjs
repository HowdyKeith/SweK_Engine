// fluid/multigrid-falsyzero-selfcheck.mjs -- v3785
//
// *** THE SAME DEFECT v3784 FOUND IN multigrid3d.mjs, IN ITS 2D SIBLING -- AND IT WAS THREE LINKS LONG.
// v3754 moved five knobs to `??` in the 3D file and NEVER TOUCHED THIS ONE, which carried the identical shape
// for thirty-one versions. What made it worth its own gate is that fixing it took THREE edits, and the first
// two changed nothing observable:
//
//   1. `this.pre = opts.pre || 2` (and post, minDim, coarseIters) -- the constructor knobs.
//   2. `_precond(...) { for (let v = 0; v < (cycles || 1); v++) ... }` -- the inner guard.
//   3. `pc = opts.pcCycles || 1` in solveCG -- THE OUTER GUARD, AND THE ONLY ONE THAT MATTERED.
//
// TWO GUARDS ON ONE VALUE. Fixing (2) alone was invisible because (3) turned the 0 into a 1 before _precond
// ever saw it: I measured after (2) and got IDENTICAL NUMBERS, which read exactly like a fix that did nothing.
// *** A CHAIN OF DEFAULTS IS ONLY AS PERMISSIVE AS ITS OUTERMOST LINK, AND THE OUTERMOST IS THE ONE NOBODY
// GREPS FOR BECAUSE THE INNER ONE IS WHERE THE VALUE IS USED. ***

import { PoissonMG, FLUID, SOLID } from "./multigrid.mjs";
import { codeOnly } from "../tools/ship/sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "multigrid.mjs"), "utf8");

function solve(n, pcCycles) {
    const N = n * n, type = new Uint8Array(N), div = new Float32Array(N), p = new Float32Array(N), fl = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const s = (i === 0 || j === 0 || i === n - 1 || j === n - 1);
        type[j * n + i] = s ? SOLID : FLUID;
        if (!s) { div[j * n + i] = Math.sin(2 * Math.PI * i / n) * Math.sin(2 * Math.PI * j / n); fl.push(j * n + i); }
    }
    let t = 0; for (const c of fl) t += div[c];
    const m = t / fl.length; for (const c of fl) div[c] -= m;   // the compatibility condition for all-Neumann
    const mg = new PoissonMG(n, n);
    mg.solveCG(type, div, 1 / 60, p, pcCycles === undefined ? { maxIters: 600, tol: 1e-6 } : { maxIters: 600, tol: 1e-6, pcCycles });
    return { iters: mg.iters, res: mg.res };
}

console.log("1. THE KNOB REACHES THE SOLVER");
{
    const a32 = solve(32, 1), b32 = solve(32, 0);
    ok("!! *** pcCycles 0 IS PLAIN CG AND COSTS 93 ITERATIONS AGAINST 19 ***",
        b32.iters > a32.iters * 3,
        "n=32: " + a32.iters + " -> " + b32.iters + ". *** BEFORE THE FIX BOTH READ 19 ITERATIONS AND A " +
        "BIT-IDENTICAL RESIDUAL OF 8.144e-7. IDENTICAL FLOATING-POINT RESIDUALS MEAN THE SAME ARITHMETIC RAN " +
        "-- equal counts alone could have been coincidence ***");
    ok("!! and both arms still SOLVE, so the knob changes cost and not correctness",
        a32.res < 1e-6 && b32.res < 1e-6,
        "residuals " + a32.res.toExponential(3) + " and " + b32.res.toExponential(3) + ". Plain CG is a CORRECT " +
        "Poisson solve; it is simply not multigrid");
}

console.log("\n2. THE SCALING THAT MAKES IT MULTIGRID");
{
    const mg32 = solve(32, 1).iters, mg64 = solve(64, 1).iters;
    const cg32 = solve(32, 0).iters, cg64 = solve(64, 0).iters;
    ok("!! *** WITH THE PRECONDITIONER 19 -> 25 (1.32x); WITHOUT IT 93 -> 185 (1.99x) ***",
        (mg64 / mg32) < 1.5 && (cg64 / cg32) > 1.7,
        "cells rise 4x from 32^2 to 64^2. *** THE PRECONDITIONED COUNT BARELY MOVES AND THE PLAIN ONE NEARLY " +
        "DOUBLES -- that gap IS the multigrid property, and it is invisible to any check that only asks " +
        "whether the solve converged ***");
}

console.log("\n3. THE CHAIN, PINNED SO IT CANNOT COME BACK");
{
    const src = codeOnly(SRC);
    ok("!! *** ALL THREE LINKS USE `??`, NOT `||` ***",
        /opts\.pre \?\? 2/.test(src) && /opts\.post \?\? 2/.test(src) &&
        /opts\.pcCycles \?\? 1/.test(src) && /opts\.maxIters \?\? 40/.test(src) &&
        !/cycles \|\| 1/.test(src),
        "constructor knobs, solveCG's pcCycles and maxIters, and _precond's loop bound. *** FIXING THE INNER " +
        "GUARD ALONE CHANGED NOTHING MEASURABLE, because solveCG's `|| 1` turned the 0 into a 1 BEFORE " +
        "_precond ever saw it. TWO GUARDS ON ONE VALUE ***");
    ok("!! zero cycles means the IDENTITY preconditioner rather than a skipped call",
        /if \(n <= 0\) \{ z\.set\(r\); return; \}/.test(src),
        "z = r IS plain CG by definition. Leaving z untouched would have left whatever was in the buffer");
    // *** THIS CHECK WAS WRONG FIRST AND ITS OWN FAILURE IS THE LESSON: it grepped `codeOnly(SRC)` for
    // "minDim must be >= 1", WHICH LIVES INSIDE A STRING LITERAL -- and codeOnly STRIPS STRING CONTENTS as
    // well as comments, so it could never match however correct the code was. VERIFIED against a fixture:
    // codeOnly keeps `this.minDim >= 1` and drops the identical text inside quotes.
    // *** GREP codeOnly FOR STRUCTURE, NEVER FOR MESSAGE TEXT. The guard was present and the check was blind
    // to it, which is a FALSE RED -- the cheapest kind to chase and the easiest to "fix" by weakening. ***
    ok("!! and minDim still REFUSES zero, because that one is not a meaningful setting",
        /this\.minDim >= 1/.test(src) && /throw new Error/.test(src),
        "*** THE DISTINCTION MATTERS: pre 0 and post 0 SKIP A LEG OF THE SMOOTHING AND ARE ASKABLE; minDim 0 " +
        "DESCRIBES NO SOLVER AT ALL. `??` plus validation says which is which, where `||` said neither ***");
    ok("!! the SHIPPED defaults are unchanged, so no caller moves",
        solve(32).iters === solve(32, 1).iters,
        "absent pcCycles still means one V-cycle. THE FIX MAKES A DOCUMENTED OPTION WORK; IT DOES NOT CHANGE " +
        "WHAT ANYBODY GETS BY DEFAULT -- and flip2d, multigridGPU and instruments.mjs all call this solver");
}

report("WHY THIS IS A SEPARATE FILE FROM multigrid-selfcheck",
    "That gate grades the SOLVER. This one grades THE OPTION PLUMBING -- whether a documented knob reaches the " +
    "code it names -- and the two fail for different reasons. A solver gate would have stayed green through " +
    "all thirty-one versions of this defect, because THE SOLVER WAS ALWAYS CORRECT: it just always did the " +
    "same thing.");

report("WHAT THIS DOES NOT CLAIM",
    "That every falsy-zero in the tree is gone. THREE FILES HAVE NOW BEEN FIXED FOR THIS SHAPE (v3754's five " +
    "knobs in multigrid3d, v3784's _precond there, and these three links here) AND THE PATTERN KEEPS TURNING " +
    "UP ONE LINK AT A TIME. A sweep is refused for v3202's reason -- a scripted rewrite of every `|| n` would " +
    "hit hundreds of sites where zero is genuinely meaningless -- so this stays one file at a time, with the " +
    "measurement (identical residuals across a knob change) as the tell.");

console.log("\nmultigrid-falsyzero-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
