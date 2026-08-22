// WebGLEngine/fluid/multigrid3d-selfcheck.mjs -- v3354
//
// *** multigrid3d.mjs WAS REACHED BY NO GATE, AND flip3d.mjs USES IT. *** Found at v3353 by asking gateReach's
// render/voxel population question of fluid/ -- the 2D CPU path is covered (multigridGPU-selfcheck uses it as
// its reference) and the GPU path by three, and the 3D one by none. A wrong answer there would be silent.
//
// *** THE KEY IS GRID INDEPENDENCE, WHICH IS MULTIGRID'S DEFINING PROPERTY AND NOT A TOLERANCE. *** A plain
// smoother's iteration count grows with the grid because information crosses one cell per sweep; a V-cycle
// carries it to the coarse grids and back, so the count should grow far more slowly. That is a RATE, and this
// tree already trusts rates over residual sizes -- a residual that is merely small proves nothing.
//
// *** THE FIRST FIXTURE I WROTE DID NOT CONVERGE AND THE SOLVER WAS FINE. *** An all-FLUID box is PURE NEUMANN:
// pressure is defined only up to a constant, the system is SINGULAR, and 200 iterations left the residual at
// 1.0. A real FLIP domain has SOLID walls and an AIR layer whose free surface supplies the Dirichlet condition
// that makes it solvable. THE SINGULAR CASE IS KEPT BELOW AS A CONTROL, because "it did not converge" is the
// correct behaviour there and a gate that only ever saw the easy domain could not tell the two apart.
//
// *** AND THE OBVIOUS COMPARISON IS A TRAP I ALMOST PUBLISHED: THE ONE-LEVEL CONTROL NEEDS FEWER ITERATIONS. ***
// 10 / 14 / 22 against the V-cycle's 31 / 36 / 46. That is not the V-cycle losing -- a one-level preconditioner
// runs coarseIters (60) smoothing sweeps per application, so it is a far STRONGER and far more EXPENSIVE
// preconditioner. ITERATION COUNTS ACROSS DIFFERENT PRECONDITIONERS ARE NOT COMPARABLE AS WORK, and reporting
// "fewer iterations" as "better" would have been exactly that error. What IS comparable is how each count GROWS.
import { PoissonMG3D, AIR, FLUID, SOLID } from "./multigrid3d.mjs";

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

/** A physical FLIP box: solid shell, AIR lid (the free surface), fluid below, structured divergence. */
function domain(n, allFluid = false) {
    const N = n * n * n, type = new Uint8Array(N), div = new Float32Array(N);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = i + n * (j + n * k);
        const wall = (i === 0 || j === 0 || k === 0 || i === n - 1 || k === n - 1);
        type[c] = allFluid ? FLUID : (wall ? SOLID : (j >= n - 3 ? AIR : FLUID));
        if (type[c] === FLUID) div[c] = Math.sin(Math.PI * i / n) * Math.sin(2 * Math.PI * j / n) * Math.sin(3 * Math.PI * k / n);
    }
    return { type, div, N };
}
const run = (n, opts, allFluid = false) => {
    const { type, div, N } = domain(n, allFluid);
    const mg = new PoissonMG3D(n, n, n, opts), p = new Float32Array(N);
    mg.solveCG(type, div, 1 / 60, p, { maxIters: 400, tol: 1e-8 });
    return { iters: mg.iters, res: mg.res, levels: mg.levels.length, p };
};

const SIZES = [16, 24, 32];
const full = SIZES.map((n) => run(n, { pre: 2, post: 2 }));
const flat = SIZES.map((n) => run(n, { pre: 2, post: 2, minDim: n }));   // one level: smoothing only
say("V-cycle  " + SIZES.map((n, i) => n + "^3:" + full[i].iters + "it/" + full[i].levels + "lv").join("  "));
say("1 level  " + SIZES.map((n, i) => n + "^3:" + flat[i].iters + "it/" + flat[i].levels + "lv").join("  "));

const growFull = full[2].iters / full[0].iters, growFlat = flat[2].iters / flat[0].iters;
say("iteration growth over a 2x refinement (16 -> 32): V-cycle " + growFull.toFixed(2) + "x, one level " + growFlat.toFixed(2) + "x");

ok("!! it converges on a physical domain at every size",
    full.every((r) => r.res < 1e-7 && r.iters < 400),
    "solid shell, AIR lid, structured divergence. residuals " + full.map((r) => r.res.toExponential(1)).join(", "));

ok("!! *** the V-cycle's iteration count GROWS MORE SLOWLY than the one-level control's ***",
    growFull < growFlat * 0.85,
    growFull.toFixed(2) + "x against " + growFlat.toFixed(2) + "x. THAT IS THE GRID-INDEPENDENCE CLAIM AND IT " +
    "IS A RATE, NOT A TOLERANCE. Information crosses one cell per smoothing sweep; the coarse grids are what " +
    "carry it further, so removing them must make the count chase the grid");

ok("!! *** and the one-level control uses FEWER iterations, which is NOT the V-cycle losing ***",
    flat[0].iters < full[0].iters,
    "a one-level preconditioner runs coarseIters (60) sweeps per application -- far stronger and far more " +
    "EXPENSIVE per iteration. ITERATION COUNTS ACROSS DIFFERENT PRECONDITIONERS ARE NOT COMPARABLE AS WORK. " +
    "Asserted so nobody later reads the growth check as a speed claim");

ok("...and the coarse hierarchy is really built, so the control is a real control",
    full[0].levels > 1 && full[2].levels > full[0].levels && flat.every((r) => r.levels === 1),
    "levels " + full.map((r) => r.levels).join("/") + " against " + flat.map((r) => r.levels).join("/") +
    ". A 'V-cycle' that had silently collapsed to one level would pass a growth check by being the control");

// THE SINGULAR CONTROL. Correct behaviour is NOT converging, and a gate that never saw it could not tell a
// broken solver from a degenerate problem.
const sing = run(16, { pre: 2, post: 2 }, true);
say("all-FLUID (pure Neumann, singular): " + sing.iters + " iterations, residual " + sing.res.toExponential(2));
ok("!! *** an all-FLUID box does NOT converge, and that is CORRECT ***",
    sing.res > 1e-2 && sing.iters >= 200,
    "pressure is defined only up to a constant with no Dirichlet condition anywhere. I WROTE THIS FIXTURE " +
    "FIRST AND READ ITS FAILURE AS THE SOLVER'S. Kept so the difference between a degenerate problem and a " +
    "broken solver is visible rather than remembered");

// ---- OPTION HANDLING (v3754) ------------------------------------------------------------------------------
// *** THESE KNOBS USED `opts.x || default`, SO A REQUESTED ZERO WAS SILENTLY REWRITTEN. Found at v3753 while
// mapping the solver's option space: { pre: 0, post: 4 } came back reporting SIX smoothing sweeps instead of
// four, because `0 || 2` is 2. THE REQUEST WAS REWRITTEN AND NOTHING SAID SO. ***
// *** AND THE READING IT PRODUCED WAS FICTION, WHICH IS THE PART WORTH KEEPING: that configuration was
// measured at 30 ITERATIONS while the silent rewrite was in place, and IT IS 111 once the zero is honoured.
// The bug did not just ignore a knob, IT REPORTED A NUMBER FOR A SOLVER NOBODY HAD ASKED FOR. ***
{
    const zeroPre = run(24, { pre: 0, post: 4 });
    ok("!! a requested pre: 0 is honoured, not rewritten to the default",
        zeroPre.iters === 111 || zeroPre.iters > 60,
        zeroPre.iters + " iterations. Under `|| 2` this ran as pre 2 / post 4 and reported 30 -- A NUMBER FOR A "
        + "SOLVER NOBODY ASKED FOR");
    ok("!! ...and post: 0 does not converge at all, which is a real fact about the method",
        run(24, { pre: 4, post: 0 }).res > 1e-8,
        "post-smoothing is load-bearing here; the old default silently hid that by never letting anyone ask");

    // *** ZERO IS MEANINGFUL FOR SOME KNOBS AND NONSENSE FOR OTHERS, WHICH IS WHY THIS WAS NOT A BLANKET `??`.
    // minDim 0 and stencilRadius 0 describe no solver at all, so they are REFUSED BY NAME rather than quietly
    // corrected -- v3738's choice again: a loud failure beats a silent downgrade. ***
    const refuses = (o) => { try { new PoissonMG3D(16, 16, 16, o); return false; } catch { return true; } };
    ok("!! minDim 0 and stencilRadius 0 are REFUSED BY NAME, not defaulted",
        refuses({ minDim: 0 }) && refuses({ stencilRadius: 0 }) && refuses({ pre: -1 }),
        "a coarsest level of zero cells and a one-point stencil are not solvers. NOTE omega AND tol ON THE SAME "
        + "TWO LINES ALREADY USED `!= null` -- the correct idiom was in this file the whole time, two knobs away");
    ok("!! and the zero-able knobs still take their defaults when unset",
        (() => { const mg = new PoissonMG3D(16, 16, 16, {}); return mg.pre === 2 && mg.post === 2 && mg.minDim === 4; })(),
        "the fix must not change what an existing caller passing nothing gets -- asserted, not assumed");
}

console.log(failed ? "multigrid3d-selfcheck: " + failed + " FAILED" : "multigrid3d-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
