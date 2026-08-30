// WebGLEngine/tools/ship/inverseSolve-selfcheck.mjs -- v4201
//
// GATES math/inverseSolve.mjs -- inverting a pure function using nothing but evaluations of it.
//
// *** THE JACOBIAN IS GRADED AGAINST ALGEBRA, NOT AGAINST ITSELF. *** physics/reaction/brusselator.js exports
// an EXACT analytic Jacobian at the steady state, written by hand for HMC's benefit. Section 1 computes the
// same matrix by finite differences and compares. That is this tree's standard: no numerical method is graded
// against another run of itself when a closed form exists.
//
// *** AND THE GAP THIS FILLS IS SHARPER THAN "NO SOLVER". *** physics/hmc/inference.js already recovers
// parameters, and its header says why it cannot help here: "Gradients are ANALYTIC throughout (HMC's
// requirement)". It inverts only models somebody differentiated by hand. Nothing else in this tree has a
// derivative written anywhere.
//
// *** WHILE tools/roundhouse/knobLiveness.mjs COMPUTES THE HARD PART AND DISCARDS IT. *** It perturbs every
// knob and asks whether any observable moved, returning { state, moved: string[] } -- WHICH ones, compared
// with sameValue(). That is a one-sided finite difference rounded to a boolean. Section 3 keeps the
// magnitude, and a knob it would call "moves nothing" is exactly a zero column here.
//
// Run: node tools/ship/inverseSolve-selfcheck.mjs

import { jacobian, sensitivity, solve, DEFAULT_STEP } from "../../math/inverseSolve.mjs";
import { jacobian as brusselatorJacobian, steadyState } from "../../physics/reaction/brusselator.js";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// 1) *** THE JACOBIAN, AGAINST AN EXACT ANALYTIC ONE THIS FILE DID NOT WRITE. ***
{
    for (const [A, B] of [[1.5, 3.2], [1.0, 2.0], [2.5, 5.5]]) {
        const ss = steadyState(A, B);
        const rhs = ([u, v]) => [A - (B + 1) * u + u * u * v, B * u - u * u * v];
        const num = jacobian(rhs, [ss.u, ss.v]);
        const ana = brusselatorJacobian(A, B);
        const err = Math.max(Math.abs(num[0][0] - ana.a11), Math.abs(num[0][1] - ana.a12),
                             Math.abs(num[1][0] - ana.a21), Math.abs(num[1][1] - ana.a22));
        ok(err < 1e-8, `Brusselator A=${A} B=${B}: finite differences match the analytic Jacobian to ${err.toExponential(2)}`);
    }
    ok(jacobian(([x]) => [x * x * x], [2])[0][0] > 11.999 && jacobian(([x]) => [x * x * x], [2])[0][0] < 12.001,
        "d/dx of x^3 at x=2 is 12");
    // Shape, and a rectangular case so m and n are not silently assumed equal.
    const J = jacobian(([a, b, c]) => [a + b, b * c], [1, 2, 3]);
    ok(J.length === 2 && J[0].length === 3, `a 2-output 3-input function gives a 2x3 Jacobian, not a square one`);
    ok(Math.abs(J[0][2]) < 1e-9, "and the entry for an input that output does not use is zero");
}

// 2) *** THE STEP SIZE IS A TRADEOFF WITH TWO FAILURE MODES, MEASURED IN BOTH DIRECTIONS. ***
{
    const f = ([x]) => [x * x * x];                     // derivative at 2 is exactly 12
    const err = (h) => Math.abs(jacobian(f, [2], { step: h })[0][0] - 12);
    const big = err(1e-1), dflt = err(DEFAULT_STEP), tiny = err(1e-13);
    ok(dflt < big / 1000,
        `too LARGE a step measures curvature instead of slope: ${big.toExponential(2)} at h=1e-1 against ${dflt.toExponential(2)} at the default`);
    ok(dflt < tiny / 1000,
        `too SMALL a step is lost to float noise: ${tiny.toExponential(2)} at h=1e-13 against ${dflt.toExponential(2)}`);
    ok(dflt < 1e-8, `and the default sits near the bottom of that U at ${dflt.toExponential(2)}`);
    // *** THE STEP IS RELATIVE, AND x=1e6 IS TOO GENTLE TO PROVE IT. *** The first version of this check
    // tested there, and sabotaging the relative step to an absolute one left it GREEN -- 6.06e-6 is still far
    // above the ULP of 1e6 (2.2e-10), so an absolute step works fine. It only fails once the step falls below
    // the ULP, at x * 2.2e-16 > 6.06e-6, i.e. beyond about 2.7e10. There, x + h === x exactly and the
    // derivative reads as ZERO.
    const g = ([x]) => [x * x];
    const relErr = (x) => Math.abs(jacobian(g, [x])[0][0] - 2 * x) / (2 * x);
    const absAt = (x) => { const h = DEFAULT_STEP; return Math.abs(((x + h) * (x + h) - (x - h) * (x - h)) / (2 * h) - 2 * x) / (2 * x); };
    ok(relErr(1e11) < 1e-6, `a relative step still differentiates at x=1e11 (relative error ${relErr(1e11).toExponential(2)})`);
    ok(absAt(1e11) > 0.5,
        `*** and an absolute one is 100% wrong there (${(absAt(1e11) * 100).toFixed(0)}%): x + h === x in float, ` +
        "so the difference is zero and the derivative reads as a dead input ***");
    ok(absAt(1e6) < 1e-5, "control: at x=1e6 the absolute step is still fine, which is why the first version of this check passed on sabotage");
}

// 3) *** SENSITIVITY IS THE NUMBER knobLiveness THROWS AWAY, AND A DEAD KNOB IS A ZERO COLUMN. ***
{
    const f = ([a, b]) => [a * 2 + 1];                   // b moves nothing at all
    const s = sensitivity(f, [0, 5]);
    ok(Math.abs(s[0] - 2) < 1e-6, `the live input has sensitivity ${s[0].toFixed(6)}`);
    ok(s[1] === 0, "*** and the dead one is exactly 0 -- which is knobLiveness's 'moves nothing', with the magnitude kept ***");
    // And the solver survives it, which is the whole reason for damping.
    const r = solve(f, [7], [0, 5]);
    ok(r.ok && Math.abs(r.x[0] - 3) < 1e-6,
        `*** the solve still succeeds with a dead input present: a=${r.x[0].toFixed(6)} ***`);
    ok(r.x[1] === 5, "and the dead input never moved from where it started -- damping made it inert, not explosive");
    ok(r.sensitivity[1] === 0, "the result carries the sensitivity, so a caller learns which inputs did nothing");
}

// 4) SOLVING, AND THE THREE WAYS A LOOP CAN STOP.
{
    const f = ([a, b]) => [a * a + b, Math.sin(a) * b];
    const target = f([1.3, 0.7]);
    const r = solve(f, target, [0.2, 2.0]);
    ok(r.ok && r.residual < 1e-9, `a solvable inverse converges: residual ${r.residual.toExponential(2)} in ${r.iterations} iterations`);
    ok(/reached the target/.test(r.why), `and says so: "${r.why}"`);

    // *** SOLVING f(x) = y DOES NOT RECOVER THE x THAT PRODUCED y. ***
    const found = f(r.x);
    ok(Math.abs(found[0] - target[0]) < 1e-6 && Math.abs(found[1] - target[1]) < 1e-6,
        "the x it found really does produce the target");
    ok(Math.abs(r.x[0] - 1.3) > 0.5,
        `*** and it is NOT the x that generated it: found a=${r.x[0].toFixed(4)} against the truth 1.3. ` +
        `The inverse of a function is not unique, and a caller who reads the answer as "the original parameters" ` +
        `will be wrong on any system with more than one solution ***`);

    // Unreachable: the target is outside the range entirely.
    const u = solve(([a]) => [a * a], [-4], [1]);
    ok(!u.ok && u.residual > 1, `an unreachable target reports ok:false with residual ${u.residual.toFixed(2)}`);
    ok(/local minimum|not smooth/.test(u.why), `and names the reason: "${u.why}"`);
    // Out of range, stopping at the nearest reachable point rather than wandering.
    const s = solve(([a]) => [Math.sin(a)], [2], [0]);
    ok(!s.ok && Math.abs(s.x[0] - Math.PI / 2) < 1e-3,
        `sin can never reach 2, so it climbs to the maximum at pi/2 (x=${s.x[0].toFixed(4)}) and stops`);
    ok(Math.abs(s.residual - 1) < 1e-3, `with residual ${s.residual.toFixed(4)} -- exactly how far short it fell`);
    // Underdetermined: four inputs, one output.
    const w = solve((v) => [v.reduce((a, q) => a + q * q, 0)], [10], [1, 1, 1, 1]);
    ok(w.ok, `four inputs to one output still solves (sum of squares ${w.x.reduce((a, q) => a + q * q, 0).toFixed(9)})`);
}

// 5) ok IS DECIDED BY THE RESIDUAL, NEVER BY HOW THE LOOP EXITED.
{
    // One iteration is not enough for this, so it exits on the iteration cap -- and must NOT claim success.
    const f = ([a]) => [Math.exp(a)];
    const capped = solve(f, [Math.exp(3)], [-8], { maxIterations: 1 });
    ok(!capped.ok, "hitting the iteration cap short of the target reports ok:false");
    ok(capped.residual > 0, `with the residual it actually reached (${capped.residual.toExponential(2)})`);
    const done = solve(f, [Math.exp(3)], [-8], { maxIterations: 200 });
    ok(done.ok && Math.abs(done.x[0] - 3) < 1e-6, "and the same problem with enough iterations converges to a=3");
    ok(!/max iterations/.test(done.why), `so the cap message is not emitted on success: "${done.why}"`);
}

// 6) A FUNCTION THAT REFUSES A PROBE IS NOT A FUNCTION THAT RETURNS ZERO.
{
    // f is undefined below zero. A forward step from x=0 lands on NaN.
    const f = ([a, b]) => [Math.sqrt(a) + b];
    const J = jacobian(f, [0, 1]);
    ok(!Number.isFinite(J[0][0]), "*** probing where f is undefined yields NaN, not 0 -- 'it refused' is not 'it moves nothing' ***");
    ok(Number.isFinite(J[0][1]), "while the input that IS measurable there stays finite");
    ok(Number.isNaN(sensitivity(f, [0, 1])[0]), "sensitivity carries the refusal through rather than reporting a dead input");
    // The solver freezes that input instead of stepping into the undefined region.
    const r = solve(f, [5], [0, 1]);
    ok(r.x[0] === 0, "and solve leaves the unmeasurable input exactly where it was");
    ok(r.ok && Math.abs(r.x[1] - 5) < 1e-6, `while still solving through the one it can measure (b=${r.x[1].toFixed(6)})`);
}

// 7) INPUT VALIDATION AND PURITY.
{
    const bad = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
    ok(bad(() => jacobian(null, [1])) !== null, "a non-function is refused");
    ok(bad(() => jacobian(([x]) => [x], [NaN])) !== null, "a non-finite input is refused");
    ok(bad(() => jacobian(([x]) => x, [1])) !== null, "an f that does not return an array is refused");
    ok(bad(() => solve(([x]) => [x], [1, 2], [0])) !== null,
        "and a target whose length disagrees with f's output is refused -- silently padding would invent a residual");
    const src = codeOnly(read("math/inverseSolve.mjs"));
    ok(!/\bdocument\b|\bwindow\b|Math\.random|Date\.now|readFileSync/.test(src),
        "pure: no DOM, no clock, no randomness, no disk -- a solve is reproducible");
    ok(/knobLiveness/.test(prose(read("math/inverseSolve.mjs"))),
        "the module records where this tree was already computing the hard part");
    ok(/ANALYTIC/.test(prose(read("math/inverseSolve.mjs"))), "and why physics/hmc/inference.js does not cover it");
    // Determinism: no randomness anywhere, so two solves of the same problem agree exactly.
    const f = ([a]) => [a * a * a - 2 * a];
    const a1 = solve(f, [4], [1.5]), a2 = solve(f, [4], [1.5]);
    ok(a1.x[0] === a2.x[0] && a1.iterations === a2.iterations, "two identical solves give identical results");
}

// 8) THE WIRING, BY STATEMENT AND CALL.
{
    const m = noComments(read("main.js"));
    ok(/import\s*\{[^}]*\bsolve\b[^}]*\}\s*from\s*["']\.\/math\/inverseSolve\.mjs["']/.test(m),
        "main.js imports the solver by statement");
    ok(/solve\s*\(\s*fn/.test(codeOnly(read("main.js"))), "*** and window.solveFor calls it ***");
    ok(/sensitivity/.test(codeOnly(read("main.js"))), "and surfaces which inputs did nothing, not just the answer");
}

console.log(`inverseSolve-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether a solve of a REAL engine function converges usefully -- that
depends on the function. What is checked is that the Jacobian matches an analytic one this file did not write,
that the step size fails in both directions around the default, that a dead input is a zero column rather than
an explosion, and that ok is decided by the residual and never by the loop exiting.`);
process.exit(fail ? 1 : 0);
