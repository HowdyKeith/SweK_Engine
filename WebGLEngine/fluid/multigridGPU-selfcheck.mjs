// fluid/multigridGPU-selfcheck.mjs
//
// v3126 -- A FINISHED GPU SOLVER THAT NOTHING CALLS, AND THE FIRST TEST IT HAS EVER HAD.
//
// fluid/multigridGPU.js is a complete WebGPU port of the 2D pressure solve -- the whole V-cycle (smooth,
// residual, restrict, prolong) on device, reusing the proven CPU assembly from multigrid.mjs. It had no gate and
// no caller: flip2d.mjs imports PoissonMG from multigrid.mjs and runs the V-cycle on the CPU. So the answer to
// "is there a GPU optimisation available to the physics side" was yes, already written, and connected to nothing.
//
// WHAT CAN BE PROVEN WITHOUT A GPU, which is more than it first appears. The module exports shadowSolve: a pure
// CPU walk of the EXACT V-cycle structure the GPU kernels implement, evidently built as a reference and never
// compared against anything. Running it beside the live PoissonMG tests the part most likely to be wrong -- the
// restructured V-cycle -- and needs no device at all.
//
// WHAT BLOCKS ADOPTION, stated because it is the real cost and it is not the code being wrong:
//   GpuMultigrid.solve is ASYNC; PoissonMG.solve is synchronous, and flip2d.mjs calls it inside a step loop.
//   Swapping them is not a one-line change, it is an await rippling through the simulation step. That is a
//   decision about the step loop, not a bug in the solver.

import { PoissonMG } from "./multigrid.mjs";
import { shadowSolve, GpuMultigrid } from "./multigridGPU.js";
// v3724 -- the answer key is DERIVED IN THE BIND and consumed here, so this gate and labDevices-selfcheck read
// ONE derivation rather than two spellings of it.
import { buildMGGPU } from "../tools/roundhouse/multigridGPUBind.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const FLUID = 1, SOLID = 2;
function rig(nx, ny) {
    const N = nx * ny;
    const type = new Int32Array(N);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++)
        type[y * nx + x] = (x === 0 || y === 0 || x === nx - 1 || y === ny - 1) ? SOLID : FLUID;
    const div = new Float32Array(N);
    for (let y = (ny >> 2); y < ny - (ny >> 2); y++)
        for (let x = (nx >> 2); x < nx - (nx >> 2); x++)
            div[y * nx + x] = Math.sin(x * 0.3) * Math.cos(y * 0.3);
    return { N, type, div };
}

// ---- 1. THE SOLVE ACTUALLY RUNS -- guarded, because a zero field agrees with anything -------------------------
{
    const nx = 32, ny = 32, { N, type, div } = rig(nx, ny);
    const p = new Float32Array(N);
    new PoissonMG(nx, ny).solve(type, div, 0.016, p, 8);
    let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(p[i]));
    ok("!! the reference solve produces a non-zero pressure field",
        mx > 1,
        "field max " + mx.toExponential(3) + ". The first version of this test filled `type` with 0 -- which is " +
        "AIR, not FLUID -- so every right-hand side was zero, both solvers returned zeros, and they agreed " +
        "perfectly on nothing. A comparison of two empty arrays is the same false pass as a loop that never runs");
}

// ---- 2. THE GPU PORT'S V-CYCLE AGREES WITH THE PROVEN SOLVER --------------------------------------------------
{
    for (const n of [16, 32, 64]) {
        const { N, type, div } = rig(n, n);
        const a = new Float32Array(N), b = new Float32Array(N);
        new PoissonMG(n, n).solve(type, div, 0.016, a, 8);
        shadowSolve(new PoissonMG(n, n), type, div, 0.016, b, 8);
        let worst = 0, norm = 0;
        for (let i = 0; i < N; i++) { worst = Math.max(worst, Math.abs(a[i] - b[i])); norm = Math.max(norm, Math.abs(a[i])); }
        ok(`the GPU port's V-cycle matches PoissonMG at ${n}x${n}`,
            norm > 1 && worst / norm < 1e-5,
            "relative " + (worst / norm).toExponential(2) + " on a field of max " + norm.toExponential(2) +
            ". shadowSolve walks the same restructured V-cycle the compute kernels implement, so this checks the " +
            "part a port most easily gets wrong -- level ordering, restriction, prolongation -- with no device");
    }
}

// ---- 3. THE ADOPTION BLOCKER IS A SIGNATURE, NOT A DEFECT ------------------------------------------------------
{
    ok("!! GpuMultigrid.solve is async while PoissonMG.solve is not",
        GpuMultigrid.prototype.solve.constructor.name === "AsyncFunction" &&
        PoissonMG.prototype.solve.constructor.name === "Function",
        // *** v3370 -- THIS NOTE SAID "the port is unwired" FOR 145 VERSIONS AFTER IT WAS WIRED, AND THIS IS
        // ALMOST CERTAINLY WHERE EVERY COPY CAME FROM. *** The same sentence reached my own memory (repeated to
        // Keith at v3352), multigrid.html (corrected v3353), and an outside status report (v3366) -- three
        // records that had to be fixed one at a time while THE ORIGINAL SAT HERE, inside the port's own gate,
        // still saying it. The ASSERTION above was always true and remains true; only the note rotted, and a
        // note nothing re-derives is the twelfth instance of that shape this session.
        //
        // WHAT ACTUALLY HAPPENED: v3224 took the port OFF the unwired register (entry deleted, not edited) and
        // v3225 wired it as solver "mggpu" in flip2d.mjs, WHICH REFUSES WITHOUT A DEVICE rather than silently
        // running on the CPU. The async problem was SOLVED, not deferred: step() is async and the jacobi /
        // rbgs / mgpcg branches contain NO await, so an async function runs its body eagerly and a caller that
        // does not await gets exactly the old behaviour -- ONLY the mggpu branch suspends. That property is
        // gated by tools/ship/flip2dAsync-selfcheck.mjs.
        "the async/sync signature difference is real and is the thing this check pins. IT IS NOT A BLOCKER AND " +
        "THE PORT IS NOT UNWIRED: flip2d dispatches to solver 'mggpu' since v3225, and flip2dAsync-selfcheck " +
        "gates that the synchronous branches still complete synchronously. WHAT REMAINS IS A DEFAULT, NOT A " +
        "WIRING -- nothing forces the live fluid onto the GPU path, deliberately, and multigrid.html exists to " +
        "produce the numbers that would justify switching it");
}

// ---- 4. A REAL DEVICE COMPARISON, WHEN THERE IS ONE ------------------------------------------------------------
{
    const hasGpu = typeof navigator !== "undefined" && navigator.gpu;
    ok("device parity is SKIPPED here rather than faked",
        !hasGpu,
        "no WebGPU in this runtime, so GpuMultigrid itself is not executed and this gate does not pretend " +
        "otherwise. Running it on the rig would compare device output against shadowSolve directly -- the same " +
        "shape as the render-QA probe: measure where the hardware is, adjudicate where the reference is");
}


// ---- *** multigridgpu: THE GATHER TRANSFERS ARE AN EXACT TRANSPOSE PAIR (v3724) *** -----------------------------
// <P x, y> over the fine grid must equal <x, P^T y> over the coarse grid. NOTHING IN EITHER FILE STATES IT, and
// unlike the scatter reference -- where ONE weight helper serves both directions and adjointness cannot fail --
// the gather rewrite keeps the property only if its window covers every fine cell whose stencil reaches the
// coarse cell. WHEN THIS GOES RED the fix is the transfer pair, NEVER a looser bar: the gap is measured in
// machine epsilon and there is no tolerance here to relax.
//
// *** BOTH PLANTS RUN AND THEY SEPARATE, WHICH IS THE POINT OF RUNNING TWO. (A) TRUNCATE THE GATHER WINDOW to
// the 2x2 block: the adjoint key goes red at 8.2e-1 and the window check with it -- AND SO DO THE THREE PARITY
// CHECKS ABOVE (9.2e-2 at 32x32). This key is NOT the only thing that would catch that defect and claiming so
// would inflate it; what it adds is being REFERENCE-FREE and EXACT. (B) CORRUPT THE SHIPPED SMOOTHER instead
// (relax by 0.55*omega), leaving the transfers alone: EXACTLY the three parity checks go red and ALL THREE OF
// THESE STAY GREEN. That is the second half doing its job -- the new scaffolding did not weaken what was
// already here, and the new checks are not restating it. THE BLINDNESS IS DECLARED, NOT A GAP: an operator
// identity between two transfers never claimed to see the smoother, and asserting it would be a different key.
{
    const a = buildMGGPU({ mode: "adjoint", config: { n: 64 } });
    ok("!! multigridgpu: restrict is the EXACT transpose of prolong on every level pair",
        a.adjointWorst < 1e-12 && a.pairs >= 4 && Math.abs(a.innerFine) > 0.1,
        `${a.pairs} level pairs at 64x64, worst relative gap ${a.adjointWorst.toExponential(2)} -- ` +
        `<Px,y>=${a.innerFine.toFixed(9)} against <x,PTy>=${a.innerCoarse.toFixed(9)}. The inner product is ` +
        `asserted non-trivial beside it, because two zeros are adjoint too`);

    // THE WINDOW, BRACKETED FROM BOTH SIDES. A one-sided result would say the window is wide ENOUGH and leave
    // open that it is padded; this says it is the NARROWEST window that works.
    const w = buildMGGPU({ mode: "window", config: { n: 32 } });
    ok("!! multigridgpu: the shipped gather window is the NARROWEST one that preserves the transpose",
        w.shippedRel < 1e-12 && w.narrowRel > 1e-2 && w.widerExact === 1 && w.codeRel < 1e-12,
        `narrower (the 2x2 block) breaks it by ${w.narrowRel.toExponential(2)} (<x,PTy> ${w.narrowInner.toFixed(6)} ` +
        `against <Px,y> ${w.innerFine.toFixed(6)}); the shipped window gives ${w.shippedRel.toExponential(2)}; ` +
        `wider reproduces the shipped inner product TO THE LAST BIT; and the SHIPPED KERNEL agrees with the ` +
        `reconstruction at that window to ${w.codeRel.toExponential(2)}, which is what stops this being a ` +
        `statement about arithmetic that no change to the code could falsify`);

    // *** A CONTROL, NOT A PLANT (v3690: a control moves the observable TO its ideal). It is measured at the
    // SAME precision on purpose -- through the shipped Float32 level buffers the reference reads 4.9e-8, which
    // is f32 epsilon and not a defect, and comparing that against the port's 1e-15 would say the port is seven
    // orders better than the code it was ported from. ***
    const r = buildMGGPU({ mode: "reference", config: { n: 32 } });
    ok("multigridgpu: the scatter reference is adjoint BY CONSTRUCTION, which is why parity cannot confirm it",
        r.refWorst < 1e-12,
        `worst ${r.refWorst.toExponential(2)} across ${r.pairs} pairs -- PoissonMG runs both directions through one ` +
        `weight helper, so agreeing with PoissonMG is not evidence the gather rewrite kept the property`);

}

console.log();
if (fails) { console.log("multigridGPU-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("multigridGPU-selfcheck: all checks pass");
