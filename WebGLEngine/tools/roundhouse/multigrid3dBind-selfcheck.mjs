// tools/roundhouse/multigrid3dBind-selfcheck.mjs -- v3784
//
// *** THE KEY IS THE DEFINING PROPERTY OF MULTIGRID: THE ITERATION COUNT BARELY MOVES WHEN THE GRID GROWS.
// Cells rise 8x from 16^3 to 32^3 and iterations go 20 -> 28. A plain Krylov solver cannot do that -- its
// count grows with the grid -- so this is a claim about the PRECONDITIONER, and the solver is never told it. ***
//
// *** AND THE PLANT COULD NOT BE BUILT UNTIL A REAL BUG WAS FIXED, WHICH IS THE ROUND'S FIRST HALF.
// _precond read `for (let v = 0; v < (cycles || 1); v++)` -- THE FALSY-ZERO DEFAULT. solveCG reads
// `pc = opts.pcCycles ?? 1` CORRECTLY and its own comment says "pcCycles 0 means plain CG. Both are askable",
// and then handed the 0 to _precond, WHICH TURNED IT BACK INTO 1. Asking for plain CG silently got you one
// V-cycle -- the shipped default -- SO THE KNOB WAS INERT.
// MEASURED BEFORE THE FIX: pcCycles 1 and 0 gave IDENTICAL iterations AND BIT-IDENTICAL RESIDUALS, 20 iters /
// 6.33e-7 at n=16 and 28 / 6.20e-7 at n=32. AFTER: 20 -> 43 and 28 -> 93.
// *** v3754 FIXED EXACTLY THIS SHAPE IN THIS FILE -- pre, post, minDim, coarseIters and stencilRadius all
// moved to `??` -- AND MISSED THIS ONE, ONE FUNCTION ABOVE THE COMMENT THAT DOCUMENTS THE RULE. A SWEEP THAT
// FIXES A PATTERN BY NAME MISSES THE INSTANCE THAT SPELLS IT DIFFERENTLY. ***

import { multigrid3dDevice, MG3D_OBSERVABLES, buildMG3D } from "./multigrid3dBind.mjs";
import { PoissonMG3D, FLUID, SOLID } from "../../fluid/multigrid3d.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const MOD = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fluid/multigrid3d.mjs"), "utf8");

const honest = await buildMG3D({ mode: "scaling" });
const planted = await buildMG3D({ mode: "nopreconditioner" });

console.log("1. THE SCALING KEY");
{
    ok("!! *** CELLS RISE 8x AND ITERATIONS RISE 1.4x -- THAT IS WHAT MULTIGRID MEANS ***",
        honest.cellRatio === 8 && honest.iterRatio < 1.8,
        "16^3 -> 32^3, iterations " + honest.itersSmall + " -> " + honest.itersLarge + ", iterRatio " +
        honest.iterRatio.toFixed(3) + ". A PLAIN KRYLOV SOLVER CANNOT DO THIS, so the claim is about the " +
        "PRECONDITIONER rather than about convergence");
}

console.log("\n2. THE KNOB THAT DID NOTHING, AND THE FIX");
{
    ok("!! *** _precond NO LONGER USES THE FALSY-ZERO DEFAULT ***",
        !/cycles \|\| 1/.test(codeOnly(MOD)) && /if \(n <= 0\) \{ z\.set\(r\)/.test(codeOnly(MOD)),
        "`(cycles || 1)` turned an asked-for 0 back into 1, so `pcCycles: 0` ran the SHIPPED DEFAULT while " +
        "reporting nothing. *** THE TELL WAS BIT-IDENTICAL RESIDUALS, NOT JUST EQUAL ITERATION COUNTS -- equal " +
        "counts could be coincidence; identical floating-point residuals mean THE SAME ARITHMETIC RAN ***");
    ok("!! zero cycles now means the IDENTITY preconditioner, which is plain CG by definition",
        (() => {
            const n = 16, N = n * n * n, type = new Uint8Array(N), div = new Float32Array(N), p = new Float32Array(N);
            const idx = (i, j, k) => (k * n + j) * n + i; const fl = [];
            for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
                const solid = (i === 0 || j === 0 || k === 0 || i === n - 1 || j === n - 1 || k === n - 1);
                type[idx(i, j, k)] = solid ? SOLID : FLUID;
                if (!solid) { div[idx(i, j, k)] = Math.sin(2 * Math.PI * i / n) * Math.sin(2 * Math.PI * j / n); fl.push(idx(i, j, k)); }
            }
            let s = 0; for (const c of fl) s += div[c]; const m = s / fl.length; for (const c of fl) div[c] -= m;
            const mg = new PoissonMG3D(n, n, n);
            mg.solveCG(type, div, 1 / 60, p, { maxIters: 400, tol: 1e-6, pcCycles: 0 });
            const withPc = new PoissonMG3D(n, n, n);
            const p2 = new Float32Array(N);
            withPc.solveCG(type, div, 1 / 60, p2, { maxIters: 400, tol: 1e-6, pcCycles: 1 });
            return mg.iters > withPc.iters * 1.5;
        })(),
        "43 against 20 at n=16 -- ASKED FOR AND ACTUALLY DELIVERED. Before the fix these were equal");
    ok("!! and the SHIPPED default is untouched, so no caller changes",
        /opts\.pcCycles \?\? 1/.test(codeOnly(MOD)),
        "absent pcCycles still means one V-cycle. THE FIX MAKES A DOCUMENTED OPTION WORK; IT DOES NOT CHANGE " +
        "WHAT ANYBODY GETS BY DEFAULT");
}

console.log("\n3. THE PLANT THE FIX UNLOCKED");
{
    ok("!! *** REMOVING THE PRECONDITIONER BREAKS THE SCALING WHILE THE SOLVE STAYS CORRECT ***",
        planted.iterRatio > honest.iterRatio * 1.4 && planted.itersLarge > honest.itersLarge * 2,
        "iterRatio " + honest.iterRatio.toFixed(3) + " -> " + planted.iterRatio.toFixed(3) + ", iterations " +
        honest.itersSmall + "/" + honest.itersLarge + " -> " + planted.itersSmall + "/" + planted.itersLarge +
        ". *** BOTH ARMS STILL CONVERGE TO THE SAME TOLERANCE -- plain CG is a CORRECT Poisson solve. A DEVICE " +
        "WATCHING ONLY 'DID IT SOLVE' WOULD SEE NOTHING AT ALL, which is why the graded observable is a RATIO " +
        "ACROSS TWO SIZES and not a residual ***");
    ok("!! the device DECLARES the plant, and the mode VALIDATOR lists it",
        multigrid3dDevice.plantMode === "nopreconditioner" && multigrid3dDevice.plantFlips === "iterRatio" &&
        multigrid3dDevice.modes[0] === "scaling" && multigrid3dDevice.modes.includes("nopreconditioner"),
        "a validator that does not list the plant mode SILENTLY REWRITES IT to the default, and the plant then " +
        "runs the HONEST path while appearing to fire -- reachable and findable, a fourth time this session");
}

report("*** THE PLANT LOOKED DEAD TWICE BEFORE IT WORKED, AND BOTH CAUSES WERE MINE TO RULE OUT ***",
    "FIRST I put pcCycles on the CONSTRUCTOR instead of solveCG's options -- AN OPTIONS OBJECT TAKES ANY KEY " +
    "YOU HAND IT AND IGNORES THE ONES IT DOES NOT READ, so nothing threw and the arms matched. THEN, with it " +
    "in the right place, the arms STILL matched -- and that one was not my bug at all but the falsy-zero " +
    "above. A PLANT THAT DOES NOT FIRE IS RULED OUT AS A BAD PLANT BEFORE IT IS BELIEVED (v3715), and doing " +
    "that twice is what turned a failed round into a real defect found in shipped physics.");

report("WHAT THIS DOES NOT CLAIM",
    "That the solver is verified. Grading the SCALING does not grade the discretisation, the Galerkin " +
    "coarsening, the boundary handling, or the answer's accuracy against an analytic field -- the bind's own " +
    "header says so and this gate does not widen the claim. Nor is 1.4 an asymptotic constant: it is TWO " +
    "SIZES, and a third would say more about whether it is flat or creeping.");

console.log("\nmultigrid3dBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
