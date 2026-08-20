// tools/roundhouse/multigridGPUBind.mjs
//
// v3724 -- roundhouse device: the WebGPU MULTIGRID PORT (fluid/multigridGPU.js). The curriculum proposed
// GRADE fluid/multigridGPU.js; gradedCoverage's rule is this file existing and importing it.
//
// *** THE KEY IS AN OPERATOR IDENTITY THE CODE IS NEVER TOLD: THE GATHER RESTRICTION IS THE EXACT TRANSPOSE OF
// THE GATHER PROLONGATION. <P x, y> over the fine grid must equal <x, P^T y> over the coarse grid, for every
// x and y, on every level pair the coarsener actually produces. MEASURED on the real hierarchy (solid shell,
// a solid obstacle and an AIR lid, so the coarse types carry real structure): worst relative gap 2.2e-16 at
// n=16, 7.2e-16 at n=32, 1.1e-15 at n=64 -- machine precision across every level pair. ***
//
// *** AND THE REASON IT IS A KEY RATHER THAN A RESTATEMENT IS THAT IT IS NOT STRUCTURAL HERE. In multigrid.mjs
// ONE helper (_pcols) serves both directions, so PoissonMG's scatter pair is adjoint BY CONSTRUCTION and could
// not fail. The GPU port rewrote both directions as GATHERS -- prolong gathers coarse columns, restrict gathers
// a window of fine cells and filters for the column it wants -- and in that form adjointness is CONTINGENT on
// the gather window being wide enough to cover every fine cell whose interpolation stencil reaches the coarse
// cell. NOTHING IN EITHER FILE STATES THAT REQUIREMENT. It is exactly the thing a gather rewrite gets wrong. ***
//
// THE WINDOW IS BRACKETED FROM BOTH SIDES, WHICH IS WHAT MAKES IT A MEASUREMENT RATHER THAN A PREFERENCE. The
// shipped window is [2c-1 .. 2c+2]. NARROWER (the 2x2 block, the obvious "one coarse cell owns four fine cells"
// rewrite) breaks the identity by 9.9e-2. WIDER, and wider still, reproduce the shipped inner product TO THE
// LAST BIT -- the extra cells contribute exactly zero. So the shipped window is the NARROWEST ONE THAT WORKS,
// and that is a two-sided result: it is wide enough, and it is not padded.
//
// *** WHAT THIS KEY IS NOT: THE ONLY THING THAT WOULD CATCH THAT DEFECT, AND SAYING OTHERWISE WOULD INFLATE IT.
// MEASURED: truncating the window to the 2x2 block ALSO reddens multigridGPU-selfcheck's existing parity check
// (relative 9.2e-2 at 32x32 against PoissonMG). WHAT THE NEW KEY ADDS IS TWO THINGS PARITY CANNOT HAVE.
// (1) IT IS REFERENCE-FREE. Parity's verdict is "the port agrees with PoissonMG", so it is only ever as right
//     as PoissonMG and is blind by construction to any defect the two share -- the v3714 shape, a
//     self-consistency check that cannot see a coherent error.
// (2) IT IS EXACT, SO THERE IS NO TOLERANCE TO ARGUE ABOUT. Parity reports a ~9% field difference, which is a
//     number somebody can decide to live with; the adjoint gap is 1e-15 against 1e-1, fourteen orders, and the
//     bar is machine epsilon rather than a chosen constant. ***
//
// WHAT THIS DOES NOT CLAIM, AND IT IS THE BIGGEST LIMIT IN THE FILE: THE WGSL IS UNGRADED. multigridGPU.js says
// its JS shadow kernels have indexing and math identical to the compute shaders, and NOTHING IN THIS SANDBOX
// CAN CHECK THAT -- there is no WebGPU here, GpuMultigrid never runs, and the existing selfcheck skips device
// parity by name rather than faking it. This device grades THE SHADOW. If the WGSL and the shadow ever diverge,
// every number below stays green and says nothing about the code that actually runs on the rig.

import { shadowSolve } from "../../fluid/multigridGPU.js";
import { shadowProlong, shadowRestrict } from "../../fluid/mgGpuKernels.js";
import { PoissonMG, FLUID, SOLID, AIR } from "../../fluid/multigrid.mjs";

// v3902 -- ONE declaration of the mode list. It lived in mggpuDefaults' whitelist AND in the device object,
// and on splatBind this same round the second copy SILENTLY COERCED a new plant mode to the primary and made
// both arms read bit-identical numbers. THE SECOND COPY IS NEVER THE ONE THAT GETS UPDATED.
export const MGGPU_MODES = ["adjoint", "window", "reference", "solve", "narrowwindow"];

export const MGGPU_OBSERVABLES = [
    "n", "cells", "levels", "pairs", "adjointWorst", "innerFine", "innerCoarse",
    "narrowInner", "narrowRel", "codeInner", "codeRel", "shippedRel", "widerRel", "widerExact",
    "refWorst", "fieldMax", "wgslGraded",
];

const DEF = { n: 32, seed: 991 };

export function mggpuDefaults(hyp) {
    const h = { mode: "adjoint", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // powers of two only: the coarsener halves, and a non-power-of-two grid changes what "level pair" means
    const n = Math.min(128, Math.max(8, num(c.n, DEF.n) | 0));
    c.n = 1 << Math.round(Math.log2(n));
    c.seed = Math.max(1, num(c.seed, DEF.seed) | 0);
    h.config = c;
    if (!MGGPU_MODES.includes(h.mode)) h.mode = "adjoint";   // v3902 -- ONE declaration, read here and by the device
    if (!h.claim || !h.claim.observable) h.claim = { observable: "adjointWorst", max: 1e-12 };
    return h;
}

function rand(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

/**
 * A hierarchy with REAL coarse structure: a solid shell, a solid obstacle and an AIR lid, coarsened by
 * PoissonMG's own _coarsenType. A hierarchy of all-FLUID levels would make the type filters in both transfers
 * vacuous, and a check whose filters never fire is the v3551 shape -- an answer that is structurally guaranteed.
 */
function hierarchy(n) {
    const mg = new PoissonMG(n, n), F = mg.levels[0];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const wall = (i === 0 || j === 0 || i === n - 1 || j === n - 1);
        const obstacle = (i >= n * 0.35 && i < n * 0.55 && j >= n * 0.30 && j < n * 0.70);
        F.type[i + n * j] = (wall || obstacle) ? SOLID : (j > n * 0.8 ? AIR : FLUID);
    }
    for (let L = 0; L < mg.levels.length - 1; L++) mg._coarsenType(mg.levels[L], mg.levels[L + 1]);
    return mg;
}

function fluidNoise(level, rnd) {
    const v = new Float64Array(level.nx * level.ny);
    for (let i = 0; i < v.length; i++) v[i] = level.type[i] === FLUID ? rnd() * 2 - 1 : 0;
    return v;
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const relGap = (a, b) => Math.abs(a - b) / Math.max(1e-30, Math.abs(a) + Math.abs(b));

/** <P x, y>_fine against <x, P^T y>_coarse on one level pair, through the shipped gather kernels. */
// *** v3902 -- `narrow` IS THE PLANT: THE GATHER WINDOW THAT IS NOT THE TRANSPOSE. ***
// P^T is not a choice, it is P's transpose, and this file's `window` mode ALREADY MEASURES what the naive
// window costs -- at(0,1), "just the two fine cells under the coarse one", against the shipped at(-1,2). The
// header states the separation: "the adjoint gap is 1e-15 against 1e-1, fourteen orders". THAT MEASUREMENT WAS
// UNREACHABLE BY THE CENSUS, because `window` reports it as narrowRel/widerRel -- observables that do not
// exist in the `adjoint` mode -- and the mode-plant contract needs ONE observable that means the same thing in
// both arms. So the plant re-states the same defect in `adjoint`'s own shape, on `adjointWorst`.
// THE PLANTED RESTRICTION IS BUILT FROM P'S OWN COLUMNS (restrictAtWindow), not from a second copy of the
// weight arithmetic -- the same reasoning pColumn's docstring gives for why the bracket is honest.
function adjointOnPair(F, C, seed, narrow = false) {
    const rnd = rand(seed);
    const x = fluidNoise(C, rnd), y = fluidNoise(F, rnd);
    const Px = new Float64Array(F.nx * F.ny);
    shadowProlong(x, C.type, F.type, Px, F.nx, F.ny, C.nx, C.ny);
    let innerCoarse;
    if (narrow) {
        innerCoarse = dot(x, restrictAtWindow(y, F, C, 0, 1));
    } else {
        const PTy = new Float64Array(C.nx * C.ny);
        shadowRestrict(y, F.type, C.type, PTy, F.nx, F.ny, C.nx, C.ny);
        innerCoarse = dot(x, PTy);
    }
    const innerFine = dot(Px, y);
    return { innerFine, innerCoarse, rel: relGap(innerFine, innerCoarse) };
}

/**
 * Column cc of P, read through shadowProlong ITSELF by applying it to a coarse unit vector. That is the
 * DEFINITION of a matrix column, not a second copy of the weight arithmetic -- re-deriving the weights here
 * would make the bracket below a comparison of this file against itself.
 */
function pColumn(cc, F, C) {
    const x = new Float64Array(C.nx * C.ny); x[cc] = 1;
    const out = new Float64Array(F.nx * F.ny);
    shadowProlong(x, C.type, F.type, out, F.nx, F.ny, C.nx, C.ny);
    return out;
}

/** P^T y computed with the gather window forced to [2c+lo .. 2c+hi], to bracket the shipped [-1 .. +2]. */
function restrictAtWindow(y, F, C, lo, hi) {
    const out = new Float64Array(C.nx * C.ny);
    for (let cj = 0; cj < C.ny; cj++) for (let ci = 0; ci < C.nx; ci++) {
        const c = ci + C.nx * cj; if (C.type[c] !== FLUID) continue;
        const col = pColumn(c, F, C);
        let acc = 0;
        for (let fj = 2 * cj + lo; fj <= 2 * cj + hi; fj++) for (let fi = 2 * ci + lo; fi <= 2 * ci + hi; fi++) {
            if (fi < 0 || fj < 0 || fi >= F.nx || fj >= F.ny) continue;
            const f = fi + F.nx * fj; if (F.type[f] !== FLUID) continue;
            acc += col[f] * y[f];
        }
        out[c] = acc;
    }
    return out;
}

/**
 * THE CONTROL, AND IT IS A CONTROL AND NOT A PLANT (v3690: a control moves the observable TO its ideal).
 * PoissonMG's scatter pair runs both directions through ONE weight helper, so it is adjoint by construction.
 * Measuring it says the identity is the right thing to ask for -- and it is the reason parity cannot confirm
 * the property in the port: the reference satisfies it automatically, so agreeing with the reference is not
 * evidence that the rewrite kept it.
 */
function referenceAdjoint(mg, lvl, seed) {
    const F = mg.levels[lvl], C = mg.levels[lvl + 1], rnd = rand(seed);
    const x = fluidNoise(C, rnd), y = fluidNoise(F, rnd);
    // *** THE LEVEL BUFFERS ARE Float32Array AND THAT ALONE SETS THE FLOOR. Measured through them the control
    // reads 4.9e-8 -- f32 epsilon, not a defect -- while the port is measured through Float64 arrays this file
    // allocates and reads 1e-15. Comparing those two numbers as if they were both accuracies would say the
    // port is seven orders BETTER than the reference it was ported from, which is nonsense. So the control is
    // measured at the SAME precision: the four buffers _restrict and _prolongAdd touch are swapped for f64 for
    // the duration. TWO NUMBERS ARE ONLY COMPARABLE IF THE THING LIMITING THEM IS THE SAME. ***
    const saved = { Fr: F.r, Fp: F.p, Cb: C.b, Cp: C.p };
    F.r = new Float64Array(F.r.length); F.p = new Float64Array(F.p.length);
    C.b = new Float64Array(C.b.length); C.p = new Float64Array(C.p.length);
    try {
        F.r.set(y); mg._restrict(F, C);                      // C.b = P^T y
        const PTy = Float64Array.from(C.b);
        C.p.set(x); F.p.fill(0); mg._prolongAdd(C, F);       // F.p = P x
        const Px = Float64Array.from(F.p);
        return relGap(dot(Px, y), dot(x, PTy));
    } finally { F.r = saved.Fr; F.p = saved.Fp; C.b = saved.Cb; C.p = saved.Cp; }
}

export function buildMGGPU(hyp, base = {}) {
    const h = mggpuDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const { n, seed } = h.config;
    const mg = hierarchy(n);
    const levels = mg.levels.length, cells = n * n;

    if (h.mode === "solve") {
        // Exercises multigridGPU.js's own headless path. NOT a key: the existing selfcheck already grades the
        // shadow against PoissonMG. It is here so the graded module is DRIVEN and not merely imported.
        const type = new Uint8Array(mg.levels[0].type), div = new Float32Array(cells), p = new Float32Array(cells);
        for (let i = 0; i < cells; i++) if (type[i] === FLUID) div[i] = Math.sin((i % n) * 0.3) * Math.cos(((i / n) | 0) * 0.3);
        shadowSolve(new PoissonMG(n, n), type, div, 0.016, p, 8);
        let fieldMax = 0; for (let i = 0; i < cells; i++) fieldMax = Math.max(fieldMax, Math.abs(p[i]));
        return { kind: "solve", n, cells, levels, fieldMax, wgslGraded: 0 };
    }

    if (h.mode === "reference") {
        let refWorst = 0;
        for (let l = 0; l < levels - 1; l++) refWorst = Math.max(refWorst, referenceAdjoint(mg, l, seed + 13 * l));
        return { kind: "reference", n, cells, levels, pairs: levels - 1, refWorst, wgslGraded: 0 };
    }

    if (h.mode === "window") {
        const F = mg.levels[0], C = mg.levels[1], rnd = rand(seed);
        const x = fluidNoise(C, rnd), y = fluidNoise(F, rnd);
        const Px = new Float64Array(F.nx * F.ny);
        shadowProlong(x, C.type, F.type, Px, F.nx, F.ny, C.nx, C.ny);
        const innerFine = dot(Px, y);
        const at = (lo, hi) => dot(x, restrictAtWindow(y, F, C, lo, hi));
        const narrow = at(0, 1), shipped = at(-1, 2), wider = at(-2, 3);
        // *** AND THE RECONSTRUCTION IS TIED BACK TO THE SHIPPED CODE, WHICH IT WAS NOT IN MY FIRST VERSION.
        // restrictAtWindow re-derives P^T from P's own columns, so it never calls shadowRestrict -- and a plant
        // that truncated the SHIPPED restrict left all three bracket numbers untouched and this check PASSED
        // while the adjoint key went red. A bracket that cannot see the code it is about is a statement of
        // arithmetic, not a test. codeRel compares the shipped kernel against the reconstruction at the shipped
        // window, so the bracket now fails with the thing it describes. ***
        const PTy = new Float64Array(C.nx * C.ny);
        shadowRestrict(y, F.type, C.type, PTy, F.nx, F.ny, C.nx, C.ny);
        const codeInner = dot(x, PTy);
        // NOTE ON THE DENOMINATOR: narrowRel is a RATIO, so it saturates at 1 when the inner product itself
        // happens to be near zero -- at n=16 with this noise <Px,y> is 0.199 and narrowRel reads 1.00 rather
        // than the 0.14/0.08 it reads at n=32/64. A ratio against a small number is not a bigger effect, and
        // the checks below run at n=32 for that reason. Reported, not smoothed.
        return {
            kind: "window", n, cells, levels, innerFine, innerCoarse: shipped,
            narrowInner: narrow,
            codeInner,
            codeRel: relGap(codeInner, shipped),
            narrowRel: relGap(innerFine, narrow),
            shippedRel: relGap(innerFine, shipped),
            widerRel: relGap(innerFine, wider),
            widerExact: wider === shipped ? 1 : 0,
            wgslGraded: 0,
        };
    }

    let adjointWorst = 0, innerFine = 0, innerCoarse = 0;
    const narrow = h.mode === "narrowwindow";
    for (let l = 0; l < levels - 1; l++) {
        const r = adjointOnPair(mg.levels[l], mg.levels[l + 1], seed + 7 * l + n, narrow);
        if (r.rel >= adjointWorst) { adjointWorst = r.rel; innerFine = r.innerFine; innerCoarse = r.innerCoarse; }
    }
    // wgslGraded is 0 ON PURPOSE and is an observable rather than a comment: the compute shaders are not
    // executed here, and a limit that only lives in prose is a limit nothing can read.
    return { kind: "adjoint", n, cells, levels, pairs: levels - 1, adjointWorst, innerFine, innerCoarse, wgslGraded: 0 };
}

export const multigridGPUDevice = {
    modes: MGGPU_MODES,
    name: "multigridgpu-transfer-adjoint",
    observables: MGGPU_OBSERVABLES,
    build: buildMGGPU,
    defaults: mggpuDefaults,
    // `adjointWorst` -- the device's own claim observable (its default claim is adjointWorst <= 1e-12), so the
    // plant is measured against the number this device already stakes itself on. NOT innerFine/innerCoarse:
    // those move together under a change of test vector and their AGREEMENT is the property, which is exactly
    // why `window` mode's pair could not be declared.
    plantMode: "narrowwindow", plantFlips: "adjointWorst", plantKind: "knob",
};

// ---- front door ------------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log("[multigridgpu] the property the gather rewrite had to keep and is never told: RESTRICT IS THE");
    console.log("               EXACT TRANSPOSE OF PROLONG.\n");
    for (const n of [16, 32, 64]) {
        const a = buildMGGPU({ mode: "adjoint", config: { n } });
        console.log(`  ${String(n).padStart(3)}x${n}: ${a.pairs} level pairs, worst relative gap ${a.adjointWorst.toExponential(2)}` +
            `   <Px,y>=${a.innerFine.toFixed(9)}  <x,PTy>=${a.innerCoarse.toFixed(9)}`);
    }
    const w = buildMGGPU({ mode: "window", config: { n: 32 } });
    console.log(`\n  AND THE WINDOW IS BRACKETED FROM BOTH SIDES, so it is a measurement and not a preference:`);
    console.log(`  NARROWER (the 2x2 block, the obvious rewrite) breaks it by ${w.narrowRel.toExponential(2)}` +
        ` -- <x,PTy> reads ${w.narrowInner.toFixed(6)} against <Px,y>=${w.innerFine.toFixed(6)};`);
    console.log(`  the SHIPPED window [2c-1 .. 2c+2] gives ${w.shippedRel.toExponential(2)}; WIDER reproduces it` +
        ` ${w.widerExact ? "TO THE LAST BIT" : "only approximately"} (${w.widerRel.toExponential(2)}).`);
    const r = buildMGGPU({ mode: "reference", config: { n: 32 } });
    console.log(`\n  THE CONTROL, NOT A PLANT: PoissonMG's SCATTER pair runs both directions through one weight`);
    console.log(`  helper, so it is adjoint BY CONSTRUCTION -- worst ${r.refWorst.toExponential(2)}. That is exactly why`);
    console.log(`  agreeing with PoissonMG is not evidence the GATHER rewrite kept the property.`);
    console.log("\n  NOT CLAIMED: that the WGSL is graded. There is no WebGPU here, GpuMultigrid never runs, and");
    console.log("  this device grades THE JS SHADOW. If the shaders and the shadow diverge, every number above");
    console.log("  stays green and says nothing about the code that runs on the rig.");
}
