// physics/mpm/gpuKernel-selfcheck.mjs -- v3809
//
// Run: node physics/mpm/gpuKernel-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** THERE IS NO GPU HERE AND THIS KERNEL HAS NEVER BEEN RUN. That is stated in gpuKernel.mjs's header and it
// is the reason this file exists: everything about a compute kernel that CAN be graded without hardware should
// be graded without hardware, so that mpm-gpu-check.html -- which needs Keith's machine -- is left holding only
// the questions that genuinely need it. ***
//
// THE FOUR THINGS GRADED HERE:
//
//   1. THE STENCIL, AS NUMBERS. The nine B-spline weights and their gradients are the only arithmetic that had
//      to be retyped into WGSL. So they are PARSED BACK OUT OF THE SHIPPED SOURCE TEXT, evaluated as
//      JavaScript, and compared to transfer.mjs quadWeights and forces.mjs quadWeightsGrad over a sweep of
//      positions and cell sizes. v2977's lbm gate could only check that a weight TABLE matched; a spline is an
//      expression rather than a table, and an expression can be run.
//
//   2. THE FIXED-POINT ACCUMULATION, which is the one thing the GPU loop does that the CPU loop never did.
//      Graded by running the graded loop WITH THE SAME QUANTISATION APPLIED and reading the free-fall key off
//      the far end.
//
//   3. THAT THE MIRROR USED FOR (2) IS FAITHFUL. It is a second copy of step.mjs's composition, which is
//      normally the exact thing this tree forbids -- so it is checked against step.mjs with the quantiser
//      turned off and must agree TO THE LAST BIT. A copy that has been proven identical where it should be is
//      evidence; a copy nobody compared is a fork.
//
//   4. THAT NOTHING ELSE CAN DRIFT, because nothing else was retyped: no material constant appears in the
//      WGSL at all.
//
// AND ALL FOUR SABOTAGES RUN, because a check nobody has watched fail is a check nobody should trust.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { quadWeights, makeGrid, g2p } from "./transfer.mjs";
import { quadWeightsGrad } from "./forces.mjs";
import { normalise, applyBodyForce, enforceWalls } from "./gridSolve.mjs";
import { lame, firstPiola, advanceF } from "./constitutive.mjs";
import { returnMap } from "./plasticity.mjs";
import { restBlock, centreOfMass, step } from "./step.mjs";
import { MPM_WGSL, clampLimits, fixedPointScales, scaleFor, quantise, comAccumulatorPossible, peaksAt,
         MEASURED_PEAKS, HEADROOM, packParams, PARAM_SCALARS } from "./gpuKernel.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const H = 0.5, DT = 1 / 240, GY = -9.81;
const PARAMS = lame(500, 0.3);

// ================================================================================================================
console.log("1. THE STENCIL: THE WGSL IS PARSED BACK OUT AND RUN AGAINST THE GRADED FUNCTIONS");
// ================================================================================================================
//
// The weight block in the kernel is written once, in fn wts(), and used by both p2g and g2p -- so there is ONE
// copy to check here rather than two that could disagree with each other as well as with the module.

function expr(src, name) {
    const m = src.match(new RegExp("o\\." + name + "\\s*=\\s*([^;]+);"));
    return m ? m[1].trim() : null;
}
/** Turn a WGSL scalar expression into a JS function of (fx, h). Both languages share this arithmetic exactly. */
function asJs(e) {
    // eslint-disable-next-line no-new-func
    return new Function("fx", "h", "return (" + e + ");");
}

const NAMES = ["w0", "w1", "w2", "d0", "d1", "d2"];
const EXPR = Object.fromEntries(NAMES.map((n) => [n, expr(MPM_WGSL, n)]));
{
    ok("every weight and gradient expression is found in the shipped WGSL",
        NAMES.every((n) => EXPR[n] && EXPR[n].length > 3),
        NAMES.map((n) => n + "=" + (EXPR[n] || "MISSING")).join("   ").slice(0, 150) + "...");

    const baseM = MPM_WGSL.match(/let\s+base\s*=\s*i32\(floor\(([^)]+)\)\)/);
    ok("!! the base node index is floor(xi - 0.5), the quadratic kernel's own offset",
        !!baseM && baseM[1].replace(/\s/g, "") === "xi-0.5",
        "getting this wrong is the classic stencil slip, and partition of unity catches it immediately");
}
{
    // The sweep deliberately includes positions right on a node (x/h integral) and exactly half way between,
    // because those are where a wrong offset is most likely to still look plausible.
    const fns = Object.fromEntries(NAMES.map((n) => [n, asJs(EXPR[n])]));
    let worstW = 0, worstD = 0, n = 0, exactW = true, exactD = true;
    for (const h of [0.5, 1, 0.25, 0.3333333333333333]) {
        for (let t = 0; t < 400; t++) {
            const x = t * 0.017 * h * 7 + 0.0001;
            const jw = quadWeights(x, h), jd = quadWeightsGrad(x, h);
            const xi = x / h, base = Math.floor(xi - 0.5), fx = xi - base;
            for (let i = 0; i < 3; i++) {
                const gw = fns["w" + i](fx, h), gd = fns["d" + i](fx, h);
                if (gw !== jw.w[i]) exactW = false;
                if (gd !== jd.dw[i]) exactD = false;
                worstW = Math.max(worstW, Math.abs(gw - jw.w[i]));
                worstD = Math.max(worstD, Math.abs(gd - jd.dw[i]));
                n++;
            }
        }
    }
    ok("!! *** THE WGSL WEIGHTS EQUAL transfer.mjs quadWeights BIT FOR BIT ***", exactW && worstW === 0,
        n + " evaluations over four cell sizes, worst difference " + worstW.toExponential(3) +
        " -- not close, IDENTICAL, because it is the same arithmetic in the same order");
    ok("!! *** AND THE GRADIENTS EQUAL forces.mjs quadWeightsGrad BIT FOR BIT ***", exactD && worstD === 0,
        "worst difference " + worstD.toExponential(3) + ". The 1/h is the chain rule and dropping it is a UNITS " +
        "error that leaves the forces looking entirely plausible at h = 1");
}
{
    // SABOTAGE 1 -- the reader must be able to fail, and on the kind of mistake that actually happens: one
    // digit of one coefficient.
    const bad = MPM_WGSL.replace("o.w1 = 0.75 -", "o.w1 = 0.755 -");
    const e = expr(bad, "w1");
    const f = asJs(e);
    let caught = false;
    for (let t = 0; t < 50 && !caught; t++) {
        const x = 1.37 + t * 0.021, h = 0.5, xi = x / h, base = Math.floor(xi - 0.5), fx = xi - base;
        if (f(fx, h) !== quadWeights(x, h).w[1]) caught = true;
    }
    ok("!! SABOTAGE: 0.75 mistyped as 0.755 IS caught by the mirror", caught,
        "and it is worth knowing what that typo alone would do: the weights no longer sum to one, so mass and " +
        "momentum are scattered short and the transfer leaks -- silently, as a slightly light material");
    ok("...and the unmodified source still passes the same reader",
        asJs(expr(MPM_WGSL, "w1"))(1.2, 0.5) === 0.75 - (1.2 - 1) * (1.2 - 1),
        "so the sabotage proves the check rather than a broken parser");
}

// ================================================================================================================
console.log("\n2. THE MIRROR IS FAITHFUL BEFORE IT IS USED TO JUDGE ANYTHING");
// ================================================================================================================
//
// *** THIS IS A SECOND COPY OF step.mjs's COMPOSITION AND THAT IS NORMALLY THE DEFECT, NOT THE TOOL. *** It
// exists to differ from the graded loop in EXACTLY ONE WAY -- where the scatter lands -- so it is worth
// nothing unless it is identical everywhere else. With the quantiser switched off it must reproduce step.mjs
// to the last bit, and that is checked before any conclusion is drawn from it.

const IDENTITY_Q = (v) => v;

function mirrorStep(ps, g, { dt, gy, params, walls, q, S }) {
    g.mass.fill(0); g.mvx.fill(0); g.mvy.fill(0); g.normalised = false;
    for (const p of ps) {
        const X = quadWeights(p.x, g.h), Y = quadWeights(p.y, g.h);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
            const i = X.base + a, j = Y.base + b;
            if (i < 0 || j < 0 || i > g.nx || j > g.ny) continue;
            const w = X.w[a] * Y.w[b], k = j * (g.nx + 1) + i;
            const dx = i * g.h - p.x, dy = j * g.h - p.y;
            const vx = p.vx + (p.cxx * dx + p.cxy * dy), vy = p.vy + (p.cyx * dx + p.cyy * dy);
            g.mass[k] += q(w * p.m, S.mass);
            g.mvx[k] += q(w * p.m * vx, S.mom);
            g.mvy[k] += q(w * p.m * vy, S.mom);
        }
    }
    normalise(g);
    const fx = new Float64Array(g.n), fy = new Float64Array(g.n);
    for (const p of ps) {
        const { P } = firstPiola(p.F, params);
        if (!P || !Number.isFinite(P[0])) continue;
        const X = quadWeightsGrad(p.x, g.h), Y = quadWeightsGrad(p.y, g.h);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
            const i = X.base + a, j = Y.base + b;
            if (i < 0 || j < 0 || i > g.nx || j > g.ny) continue;
            const gx = X.dw[a] * Y.w[b], gy2 = X.w[a] * Y.dw[b], k = j * (g.nx + 1) + i;
            fx[k] += q(-p.vol0 * (P[0] * gx + P[1] * gy2), S.force);
            fy[k] += q(-p.vol0 * (P[2] * gx + P[3] * gy2), S.force);
        }
    }
    for (let k = 0; k < g.n; k++) {
        const m = g.mass[k];
        if (m > 0) { g.mvx[k] += (fx[k] / m) * dt; g.mvy[k] += (fy[k] / m) * dt; }
    }
    applyBodyForce(g, 0, gy, dt);
    if (walls) enforceWalls(g, walls);
    g2p(ps, g, { affine: true });
    for (const p of ps) {
        p.F = advanceF(p.F, [p.cxx, p.cxy, p.cyx, p.cyy], dt);
        const r = returnMap(p.F, p.Fp); p.F = r.Fe; p.Fp = r.Fp;
        p.x += p.vx * dt; p.y += p.vy * dt;
    }
}

const NOSCALE = { mass: 1, mom: 1, force: 1 };
{
    const N = 120;
    const a = restBlock(), ga = makeGrid(16, 16, H);
    const b = restBlock(), gb = makeGrid(16, 16, H);
    for (let i = 0; i < N; i++) step(a, ga, { dt: DT, gy: GY, params: PARAMS, plastic: true });
    for (let i = 0; i < N; i++) mirrorStep(b, gb, { dt: DT, gy: GY, params: PARAMS, walls: null, q: IDENTITY_Q, S: NOSCALE });
    let worst = 0, allExact = true;
    for (let i = 0; i < a.length; i++) {
        for (const key of ["x", "y", "vx", "vy"]) {
            if (a[i][key] !== b[i][key]) allExact = false;
            worst = Math.max(worst, Math.abs(a[i][key] - b[i][key]));
        }
    }
    ok("!! *** THE UNQUANTISED MIRROR REPRODUCES step.mjs EXACTLY ***", allExact && worst === 0,
        N + " steps, " + a.length + " particles, worst difference " + worst.toExponential(3) +
        ". Any difference measured below is therefore the QUANTISATION and nothing else");
}

// ================================================================================================================
console.log("\n3. THE FIXED POINT: WHAT THE ATOMICS COST, MEASURED RATHER THAN ARGUED");
// ================================================================================================================
//
// The free-fall key is the one claim only the whole loop can make: a freely falling block's centre of mass
// follows the DISCRETE fall g*dt^2*n(n+1)/2, whatever the material does internally. It is the right key to
// measure the quantiser against, because quantising the scatter is precisely the kind of change that could
// leak momentum without changing anything a person would notice on screen.

function keyUnder(q, S, N = 240) {
    const ps = restBlock(), g = makeGrid(16, 16, H), c0 = centreOfMass(ps);
    for (let i = 0; i < N; i++) mirrorStep(ps, g, { dt: DT, gy: GY, params: PARAMS, walls: null, q, S });
    const c1 = centreOfMass(ps);
    const want = c0.y + GY * DT * DT * (N * (N + 1) / 2);
    return { err: Math.abs(c1.y - want), drift: Math.abs(c1.x - c0.x) };
}

const SCALES = fixedPointScales();
const FP = (v, s) => quantise(v, s);
const F32 = (v) => Math.fround(v);

let exact, fp, f32;
{
    exact = keyUnder(IDENTITY_Q, NOSCALE);
    fp = keyUnder(FP, SCALES);
    f32 = keyUnder(F32, NOSCALE);

    ok("the clean f64 loop puts the free-fall key at round-off", exact.err < 1e-12, exact.err.toExponential(3));
    ok("!! *** THE KEY SURVIVES THE FIXED-POINT SCATTER ***", fp.err < 1e-5,
        "parabola error " + fp.err.toExponential(3) + " at mass 2^" + Math.log2(SCALES.mass) + " / mom 2^" +
        Math.log2(SCALES.mom) + " / force 2^" + Math.log2(SCALES.force));
    ok("!! *** AND THE ATOMICS ARE NOT WHAT LIMITS IT: PLAIN f32 ROUNDING AT THE SAME POINTS COSTS THE SAME ORDER ***",
        f32.err > fp.err / 100 && f32.err < 1e-5,
        "fixed point " + fp.err.toExponential(3) + " against f32 " + f32.err.toExponential(3) +
        " -- the hardware's single precision would have set this floor with or without the integer atomics, " +
        "so the scatter design is not the thing to blame or to tune");
    ok("the sideways drift stays at zero under quantisation too", fp.drift < 1e-12,
        fp.drift.toExponential(3) + " -- gravity is vertical and NOTHING ELSE MAY PUSH; a quantiser that " +
        "rounded with a bias would show up here first");
}
{
    // SABOTAGE 2 -- a scale coarse enough to matter must visibly break the key, or the check above is
    // measuring nothing.
    const coarse = { mass: 2 ** 10, mom: 2 ** 8, force: 2 ** 6 };
    const bad = keyUnder(FP, coarse);
    ok("!! SABOTAGE: at 2^10 / 2^8 / 2^6 the key BREAKS", bad.err > 1e-2,
        "parabola error " + bad.err.toExponential(3) + " against " + fp.err.toExponential(3) +
        " at the shipped scale -- so the measurement above has teeth");
}
{
    // SABOTAGE 3 -- truncation instead of rounding. This is the mistake the header warns about, and it is
    // worth having a number for rather than an argument.
    const trunc = (v, s) => Math.trunc(v * s) / s;
    const bad = keyUnder(trunc, SCALES);
    ok("!! SABOTAGE: TRUNCATING instead of rounding biases the transfer and the key sees it",
        bad.err > fp.err * 5,
        "parabola error " + bad.err.toExponential(3) + " against " + fp.err.toExponential(3) +
        ". Every contribution short by up to half a step, nine per particle, always toward zero -- which is a " +
        "systematic MASS LOSS and would read on screen as a slightly light material rather than as a bug");
}

// ================================================================================================================
console.log("\n4. THE RANGE IS DERIVED FROM A MEASUREMENT, AND THE MEASUREMENT IS RE-TAKEN HERE");
// ================================================================================================================
//
// A fixed-point accumulator that overflows does not crash. It wraps, and the material does something plausible
// and wrong. So the peaks gpuKernel.mjs ships are re-measured against the graded loop every run: if the
// physics changes so that the forces grow, this fails rather than the kernel quietly clipping.

const WALL = { lo: 3, hi: 3, sticky: false };
function peaksOf(preset, steps) {
    const ps = restBlock(preset.block), g = makeGrid(preset.nx, preset.ny, H);
    const pk = { mass: 0, mom: 0, force: 0 };
    for (let n = 0; n < steps; n++) {
        // measured on the honest loop, through the mirror, with the quantiser off
        mirrorStep(ps, g, { dt: DT, gy: GY, params: PARAMS, walls: preset.walls, q: IDENTITY_Q, S: NOSCALE });
        for (let k = 0; k < g.n; k++) {
            pk.mass = Math.max(pk.mass, g.mass[k]);
            pk.mom = Math.max(pk.mom, Math.abs(g.mvx[k] * g.mass[k]), Math.abs(g.mvy[k] * g.mass[k]));
        }
    }
    return pk;
}
{
    // The mirror leaves the grid holding VELOCITY, so momentum is re-weighted by mass above. The force peak
    // needs the scatter itself and is taken from the shipped figure's provenance rather than re-derived here;
    // what matters is that mass and momentum -- the two that scale with the scene -- are still bounded.
    const a = peaksOf({ nx: 16, ny: 16, block: {}, walls: null }, 240);
    const b = peaksOf({ nx: 16, ny: 16, block: { n: 6, spacing: 0.2, x0: 3, y0: 2.2, m: 0.1, vol0: 0.04 }, walls: WALL }, 240);
    const seenMass = Math.max(a.mass, b.mass), seenMom = Math.max(a.mom, b.mom);
    ok("!! the shipped mass peak still bounds what the loop produces", MEASURED_PEAKS.mass >= seenMass * 0.99,
        "shipped " + MEASURED_PEAKS.mass + "   re-measured " + seenMass.toFixed(4));
    ok("!! the shipped momentum peak still bounds what the loop produces", MEASURED_PEAKS.mom >= seenMom * 0.99,
        "shipped " + MEASURED_PEAKS.mom + "   re-measured " + seenMom.toFixed(4));

    for (const [name, peak, scale] of [["mass", MEASURED_PEAKS.mass, SCALES.mass],
                                       ["momentum", MEASURED_PEAKS.mom, SCALES.mom],
                                       ["force", MEASURED_PEAKS.force, SCALES.force]]) {
        const head = (2147483647 / scale) / peak;
        ok("the " + name + " accumulator keeps at least " + HEADROOM + "x headroom", head >= HEADROOM,
            "range " + (2147483647 / scale).toFixed(1) + " against a peak of " + peak + " -- " + head.toFixed(1) + "x");
    }
    ok("!! every scale is a power of two", [SCALES.mass, SCALES.mom, SCALES.force]
        .every((s) => Number.isInteger(Math.log2(s))),
        "so the multiply and the divide are both exact in binary and the ONLY error introduced is the rounding " +
        "to integer, not a second one from the scaling");

    // SABOTAGE 4 -- the headroom rule must reject a peak it cannot cover.
    ok("!! SABOTAGE: a peak 1000x larger forces the rule to a smaller scale", scaleFor(MEASURED_PEAKS.force * 1000) < SCALES.force,
        "the rule is arithmetic on the measurement, not a number somebody picked and defended afterwards");
}
{
    // *** THE SCALE HAS TO FOLLOW THE CELL SIZE, AND THE FIRST VERSION OF THIS DID NOT. ***
    // The peaks were measured on mpm.html's grid at h = 0.5. mpm-gpu.html runs down to h = 0.03125, where the
    // same physics puts about 256 times less mass on a node. A FIXED SCALE WOULD HAVE BEEN MEASURED AS
    // COMPARABLE TO f32 AT THE CELL SIZE IT WAS DERIVED ON AND BEEN SEVERAL HUNDRED TIMES WORSE AT THE ONE THE
    // PAGE ACTUALLY USES -- right on its own fixture, wrong everywhere else, which is the hardest shape to see.
    let allHeld = true;
    const rows = [];
    for (const h of [0.5, 0.25, 0.125, 0.0625, 0.03125]) {
        const s = fixedPointScales({ h });
        const rel = { mass: (1 / (2 * s.mass)) / s.expectedPeaks.mass,
                      mom: (1 / (2 * s.mom)) / s.expectedPeaks.mom,
                      force: (1 / (2 * s.force)) / s.expectedPeaks.force };
        // half a step of rounding, as a fraction of the value being accumulated, must stay near f32's own
        // relative resolution rather than drifting away from it as the grid refines
        if (!(rel.mass < 1e-6 && rel.mom < 1e-6 && rel.force < 1e-6)) allHeld = false;
        rows.push("        h=" + String(h).padEnd(8) + " mass 2^" + Math.log2(s.mass) + "  mom 2^" + Math.log2(s.mom) +
            "  force 2^" + Math.log2(s.force) + "   half-step as a fraction of the peak: " +
            rel.mass.toExponential(2) + " / " + rel.mom.toExponential(2) + " / " + rel.force.toExponential(2));
    }
    rows.forEach((r) => console.log(r));
    ok("!! *** THE ACCUMULATOR'S RELATIVE RESOLUTION HOLDS AS THE GRID REFINES ***", allHeld,
        "the scale tracks h^2 for mass and momentum and h^1 for force, so the fixed point stays near f32's own " +
        "relative resolution at every cell size instead of only at the one it was measured on");
    ok("...and at h = " + 0.5 + " the rule still returns exactly what every measurement above was taken with",
        fixedPointScales({ h: 0.5 }).mass === SCALES.mass && fixedPointScales({ h: 0.5 }).mom === SCALES.mom,
        "mass 2^" + Math.log2(SCALES.mass) + " / mom 2^" + Math.log2(SCALES.mom) + " / force 2^" +
        Math.log2(SCALES.force) + " -- so the quantised free-fall number in section 3 is still about THIS kernel");
}
report("WHY THE SCALE IS NOT TUNED TO THE ERROR ABOVE",
    "*** THE QUANTISED KEY IS NOT MONOTONE IN THE SCALE. *** Measured: 2^26/2^24/2^22 gives 1.18e-6 and the " +
    "COARSER-RANGED 2^26/2^23/2^20 gives 2.6e-7. Quantisation error is pseudo-random and partly cancels, so " +
    "which scale reads lowest on one fixture is luck. The rule is therefore RANGE-BASED and uniform across all " +
    "three channels -- deterministic, and re-derived from the measurement above every run -- and the error is " +
    "CONFIRMED acceptable rather than minimised. Fitting the scale to that number would be fitting to noise.");

// ================================================================================================================
console.log("\n5. THE READOUT THAT CAME BACK OUT, AND THE ARITHMETIC THAT SAYS IT HAD TO");
// ================================================================================================================
//
// *** THE CENTRE OF MASS WAS ACCUMULATED IN FIXED POINT IN THE SAME SCATTER, FOR FREE, AND IT WAS WRONG TO. ***
// The first interpreter run measured about 2.5e-5 of rounding noise in that readout against the 2.6e-7 physics
// floor it exists to display: AN INSTRUMENT A HUNDRED TIMES COARSER THAN ITS SUBJECT, which is exactly the
// shape that invites somebody to tune a correct loop until the number on screen improves.
//
// It is kept here as a check rather than as a paragraph because the tempting fix -- "use a finer scale" -- is
// arithmetically unavailable, and the next person to look at a spare accumulator slot deserves the numbers.
{
    const cases = [
        ["the adjudicator's fixture", { n: 25, totalMass: 2.5, ymax: 8 }, true],
        ["a thousand particles", { n: 1024, totalMass: 6, ymax: 8 }, true],
        ["sixteen thousand", { n: 16384, totalMass: 15, ymax: 8 }, false],
        ["the size this page exists for", { n: 65536, totalMass: 15, ymax: 8 }, false],
    ];
    let allAsExpected = true;
    for (const [name, cfg, want] of cases) {
        const r = comAccumulatorPossible(cfg);
        if (r.possible !== want) allAsExpected = false;
        console.log("        " + name.padEnd(30) + " n=" + String(cfg.n).padStart(6) +
            "   needs scale >= " + r.needScale.toExponential(2) +
            "   range allows <= " + r.maxScale.toExponential(2) +
            "   " + (r.possible ? "possible" : "IMPOSSIBLE"));
    }
    ok("!! *** A SINGLE i32 CENTRE-OF-MASS ACCUMULATOR WORKS SMALL AND FAILS LARGE ***", allAsExpected,
        "a fixed-point add rounds by half a step REGARDLESS OF THE MAGNITUDE, so N contributions cost about " +
        "sqrt(N)/(2*scale) while the range must still cover M*ymax -- and those pull apart as N grows. *** IT " +
        "WOULD HAVE PASSED ON EVERY FIXTURE SMALL ENOUGH TO CHECK AGAINST THE CPU AND FAILED ONLY WHERE " +
        "NOTHING COULD CHECK IT ***");
    ok("!! and the kernel therefore does not accumulate it", !/comBase|sCom/.test(MPM_WGSL),
        "the host reads the particles back and sums in f64, which is what lbm3d-gpu.html already does with a " +
        "buffer two and a half times larger");
    ok("...and the uniform block carries no dead scale field", !/sCom/.test(MPM_WGSL) && /pad0: f32, pad1: f32, pad2: f32/.test(MPM_WGSL),
        "the slot is DECLARED PADDING rather than an unused named field -- a knob that is present and inert is " +
        "the deaf-knob shape this tree keeps finding");
}

// ================================================================================================================
console.log("\n6. THERE IS NOTHING ELSE TO DRIFT: THE KERNEL HOLDS NO MATERIAL CONSTANT");
// ================================================================================================================
{
    const code = MPM_WGSL.replace(/^\s*\/\/.*$/gm, "");
    ok("!! *** NO PLASTIC CLAMP LIMIT IS TYPED INTO THE WGSL ***", !/0\.025|0\.0075/.test(code),
        "thetaC and thetaS arrive as uniforms, MEASURED from returnMap by clampLimits() -- so plasticity.mjs " +
        "remains the only place they exist");
    const cl = clampLimits();
    ok("...and clampLimits reads them off the graded function correctly",
        Math.abs(cl.thetaC - 0.025) < 1e-12 && Math.abs(cl.thetaS - 0.0075) < 1e-12,
        "thetaC " + cl.thetaC.toPrecision(6) + "   thetaS " + cl.thetaS.toPrecision(6) +
        " -- obtained by handing returnMap singular values of 10 and 0.001 and reading what came back clamped");
    ok("no elastic modulus, Poisson ratio or friction angle appears in the WGSL",
        !/\b500\.0\b|\b0\.3\b|\b45\.0\b|\b30\.0\b/.test(code),
        "mu, lambda and alpha are computed by lame() and alphaOf() and passed in");

    // The one tolerance that IS shared, and therefore the one that can drift: check it against its source.
    const dp = readFileSync(path.join(HERE, "druckerPrager.mjs"), "utf8");
    ok("!! the Drucker-Prager expansion tolerance matches druckerPrager.mjs",
        /1e-12 \* max\(1\.0, devNorm\)/.test(code) && /1e-12 \* Math\.max\(1, y\.devNorm\)/.test(dp),
        "a volume-preserving shear has a log-strain trace of exactly zero and floating point makes it a hair " +
        "positive; a strict trace > 0 would send every shearing particle to the apex and detach it");
}

// ================================================================================================================
console.log("\n7. THE STRUCTURE A READER CANNOT CHECK WITHOUT HARDWARE, CHECKED IN THE SOURCE");
// ================================================================================================================
{
    const code = MPM_WGSL.replace(/^\s*\/\/.*$/gm, "");

    // gridSolve.mjs's key, as an ordering property of the text.
    const divide = code.indexOf("/ P.sMom) / m");
    const gravity = code.indexOf("P.gy * P.dt");
    ok("!! *** THE GRID KERNEL DIVIDES BY MASS BEFORE IT ADDS GRAVITY ***", divide > 0 && gravity > divide,
        "on a MOMENTUM field the same line gives every node the same momentum kick regardless of its mass, so " +
        "the total impulse becomes (node count)*g*dt instead of M*g*dt: right units, plausible motion, and it " +
        "scales with the GRID RESOLUTION instead of with the material");
    const force = code.indexOf("(fx / m) * P.dt");
    ok("...and the stress kick lands between them, as step.mjs orders it", force > divide && force < gravity);

    ok("!! *** atan2 IS GUARDED, BECAUSE WGSL LEAVES atan2(0,0) UNDEFINED AND JAVASCRIPT DEFINES IT AS 0 ***",
        /fn satan2/.test(code) && !/[^s]atan2\(g, f\)/.test(code) && /return atan2\(y, x\)/.test(code),
        "an undeformed particle has F = identity, which hits atan2(0,0) on BOTH half-angles -- so on a backend " +
        "returning NaN there, EVERY PARTICLE AT REST WOULD GO NaN ON STEP ONE and the page would show an empty " +
        "canvas with no error anywhere");

    ok("!! the scatter counts saturation rather than wrapping quietly",
        /atomicAdd\(&flags\[0\], 1u\)/.test(code) && /clamp\(x, -CLIP, CLIP\)/.test(code),
        "an i32 accumulator that overflows does not crash, it wraps, and the material then does something " +
        "plausible and wrong. The clamp keeps the float-to-int conversion in range -- out of range is an " +
        "INDETERMINATE VALUE in WGSL, not a wrap -- and the counter makes the event sayable");

    ok("!! the scatter rounds rather than truncates", /i32\(round\(/.test(code) && !/i32\(trunc\(/.test(code),
        "measured above: truncation costs the free-fall key a factor of " +
        "several through a systematic, always-toward-zero mass loss");

    ok("!! the transfer carries the affine term, so it is APIC and not PIC",
        /p\.cxx \* dx \+ p\.cxy \* dy/.test(code) && /dInv = 4\.0 \/ \(h \* h\)/.test(code),
        "dropping C leaves linear momentum PERFECT and bleeds angular momentum away -- one key blind, one key " +
        "firing, which is transfer.mjs's declared plant");

    ok("!! g2p skips massless nodes rather than reading zero from them",
        /if \(node\.z <= 0\.0\) \{ continue; \}/.test(code),
        "an empty node CONTRIBUTES NOTHING; it does not contribute zero, and the difference is the weights no " +
        "longer summing to one over the nodes that did contribute");

    ok("the walls zero only the normal component, matching enforceWalls' free-slip branch",
        /if \(onX\) \{ vx = 0\.0; \}/.test(code) && /if \(onY\) \{ vy = 0\.0; \}/.test(code));

    ok("the four stages are all present as entry points",
        ["clear", "p2g", "grid", "g2p"].every((f) => new RegExp("fn " + f + "\\(").test(code)));
}

// ================================================================================================================
console.log("\n8. THE HOST-SIDE ASSUMPTIONS THE KERNEL MAKES ARE TRUE OF THE FIXTURE");
// ================================================================================================================
//
// The kernel takes ONE mass and ONE volume for every particle, as uniforms, and assumes the reference
// deformation F0 is the identity. Those are real restrictions and they are silent ones -- a fixture that
// violated them would simulate something nobody asked for. So they are checked against the fixture the pages
// actually use.
{
    const ps = restBlock({ n: 7 });
    ok("!! restBlock gives every particle the same mass and volume", ps.every((p) => p.m === ps[0].m && p.vol0 === ps[0].vol0),
        "which is what lets the kernel carry them as uniforms instead of two more floats per particle");
    ok("!! and its reference deformation F0 is the identity",
        ps.every((p) => p.F0[0] === 1 && p.F0[1] === 0 && p.F0[2] === 0 && p.F0[3] === 1),
        "the force scatter wants -V0 * P * F0^T; with F0 = I that is -V0 * P, which is what the kernel computes. " +
        "A FIXTURE WITH A NON-IDENTITY F0 WOULD BE SIMULATED WRONG AND LOOK FINE");
    ok("the uniform block is 24 scalars, a multiple of 16 bytes as the uniform address space requires",
        PARAM_SCALARS === 24 && (PARAM_SCALARS * 4) % 16 === 0, PARAM_SCALARS * 4 + " bytes");
    const buf = packParams({ nx: 16, ny: 16, nParticles: 25, plasticMode: 1, h: H, dt: DT, gx: 0, gy: GY,
                             mu: PARAMS.mu, lambda: PARAMS.lambda, alpha: 0.3, pmass: 0.1, pvol: 0.0625,
                             thetaC: 0.025, thetaS: 0.0075, walls: WALL, scales: SCALES });
    const u = new Uint32Array(buf), f = new Float32Array(buf), i32 = new Int32Array(buf);
    ok("packParams places the fields where the WGSL struct reads them",
        u[0] === 16 && u[2] === 25 && u[3] === 1 && Math.fround(f[5]) === Math.fround(DT) &&
        u[15] === 1 && i32[16] === 3 && f[18] === SCALES.mass,
        "nx, nParticles, plasticMode, dt, wallsOn, wallLo and the mass scale all read back");
}

{
    const code = MPM_WGSL.replace(/^\s*\/\/.*$/gm, "");
    // *** THE PROPERTY physics/mpm/gpuKernelInterp.mjs SILENTLY DEPENDS ON. *** That harness lowers the
    // workgroup size textually before running the kernel, because the interpreter it uses drops invocations
    // above 8. That substitution is only legitimate while nothing in the kernel cares how invocations are
    // grouped. THE DAY SOMEBODY ADDS A BARRIER, THE HARNESS STARTS MEASURING A DIFFERENT PROGRAM AND SAYS
    // NOTHING -- so the assumption is asserted here rather than left in a comment over there.
    ok("!! *** NO BARRIER, NO WORKGROUP MEMORY, NO local_invocation_id ***",
        !/workgroupBarrier|storageBarrier|var<workgroup>|local_invocation_id|subgroup/.test(code),
        "every invocation reads global_invocation_id and nothing else, so REGROUPING THEM CANNOT CHANGE A " +
        "RESULT -- which is what makes gpuKernelInterp's workgroup-size substitution a harness adaptation " +
        "rather than a second kernel");
}

report("THE KERNEL HAS BEEN RUN, AND HERE IS WHAT IT DID",
    "*** gpuKernel.mjs's header was written saying THIS KERNEL HAS NEVER BEEN RUN. It has now. *** " +
    "wgsl_reflect carries a WGSL interpreter, so physics/mpm/gpuKernelInterp.mjs executes the shipped kernel " +
    "on the CPU and compares it to step.mjs particle by particle. MEASURED at v3809, 15 steps, 25 particles: " +
    "free fall agrees to 1.2e-6 (1.6e-7 relative), the column to 3.5e-7, the Drucker-Prager pile to 3.5e-7; " +
    "no NaN and no saturation in any of the three. Over 120 steps the kernel earns the discrete free-fall " +
    "parabola on its own at 4.7e-6 with a sideways drift of EXACTLY zero, and two identical runs come back " +
    "BIT-IDENTICAL, which is the determinism the integer atomics were chosen for. *** THAT 4.7e-6 IS THE " +
    "NUMBER THE PAGE MUST SHOW, NOT THE CPU'S 8.9e-16: the gap is single precision and a page claiming " +
    "round-off on hardware that cannot deliver it would be inviting somebody to tune a correct loop. *** " +
    "The harness is NOT gated -- it needs an npm package that is not in the tree, and a gate that fails for a " +
    "missing dependency teaches you to ignore gates.");

report("WHAT THIS GATE STILL CANNOT DO",
    "IT CANNOT RUN THE KERNEL. There is no GPU and no browser here, so nothing above is evidence that the " +
    "shader COMPILES, that the atomics are contended correctly, or that the dispatch order is right. What is " +
    "established is that the stencil is numerically identical to the graded modules, that the quantisation " +
    "costs the free-fall key about 2.6e-7 against f32's own 4.2e-7, that the range covers the measured peaks " +
    "with " + HEADROOM + "x to spare, and that nothing else was retyped. *** THE REST IS mpm-gpu-check.html'S " +
    "JOB AND IT NEEDS KEITH'S HARDWARE. Until that page has been opened once, the honest status of this kernel " +
    "is UNRUN. ***");

console.log("\ngpuKernel-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
