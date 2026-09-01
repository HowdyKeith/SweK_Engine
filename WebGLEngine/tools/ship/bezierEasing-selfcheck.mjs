#!/usr/bin/env node
// tools/ship/bezierEasing-selfcheck.mjs -- v4224
//
// Run: node tools/ship/bezierEasing-selfcheck.mjs      (pure, no DOM)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/bezierEasing.mjs and the rig/RigSystem.js solver it replaced.
//
// *** EASING IS AN INVERSE PROBLEM, WHICH IS WHY IT HAS A FAILURE MODE AT ALL. *** A CSS timing function is a
// curve x(t), y(t). Progress arrives as x and the answer wanted is y, so t must be recovered by solving
// x(t) = u. Newton-Raphson does that quickly and needs dx/dt -- and dx/dt is EXACTLY ZERO at t=0 whenever x1
// is 0, which `cubic-bezier(0, ...)` is and which is one of the most common curves anyone writes.
//
// The old solver's whole answer to that was `if (Math.abs(dx) < 1e-6) break;`, returning whatever t it held.
import {
    bezierEasing, calcBezier, slope, newtonRaphson, binarySubdivide, parseCubicBezier, easingFromCSS,
    CSS_KEYWORDS, A, B, C,
} from "../../ui/bezierEasing.mjs";
import { applyEasing } from "../../rig/RigSystem.js";
import { codeOnly } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("bezierEasing-selfcheck -- solving x(t) = u where the slope will not help\n");

/** Ground truth: bisect x(t) = u for 200 iterations, then read y(t). Slow, derivative-free, and right. */
function truth(x1, y1, x2, y2, u) {
    const X = (t) => { const c = 1 - t; return 3 * c * c * t * x1 + 3 * c * t * t * x2 + t * t * t; };
    const Y = (t) => { const c = 1 - t; return 3 * c * c * t * y1 + 3 * c * t * t * y2 + t * t * t; };
    let lo = 0, hi = 1;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (X(m) < u) lo = m; else hi = m; }
    return Y((lo + hi) / 2);
}
/** The solver rig/RigSystem.js used to carry, kept here so the improvement is asserted, not remembered. */
function oldSolver(x1, y1, x2, y2) {
    return (u) => {
        if (u <= 0) return 0;
        if (u >= 1) return 1;
        let t = u;
        for (let i = 0; i < 8; i++) {
            const ct = 1 - t;
            const x = 3 * ct * ct * t * x1 + 3 * ct * t * t * x2 + t * t * t;
            const dx = 3 * ct * ct * (x1) + 6 * ct * t * (x2 - x1) + 3 * t * t * (1 - x2);
            if (Math.abs(dx) < 1e-6) break;
            const next = t - (x - u) / dx;
            if (Math.abs(next - t) < 1e-6) { t = next; break; }
            t = Math.max(0, Math.min(1, next));
        }
        const ct = 1 - t;
        return 3 * ct * ct * t * y1 + 3 * ct * t * t * y2 + t * t * t;
    };
}
const GRID = [0, 0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98, 1];
const YS = [0, 0.5, 1];

// ---- 1. THE CURVE ------------------------------------------------------------------------------------------
console.log("1. the polynomial, against the form everyone writes by hand");
{
    const long = (t, a1, a2) => { const c = 1 - t; return 3 * c * c * t * a1 + 3 * c * t * t * a2 + t * t * t; };
    let worst = 0;
    for (const a1 of GRID) for (const a2 of GRID) for (let i = 0; i <= 50; i++) {
        const t = i / 50;
        worst = Math.max(worst, Math.abs(calcBezier(t, a1, a2) - long(t, a1, a2)));
    }
    ok("!! the Horner form agrees with the expanded Bernstein form", worst < 1e-15, `worst ${worst.toExponential(2)}`);
    ok("x(0) is 0 and x(1) is 1, for every control pair", GRID.every((a) => calcBezier(0, a, a) === 0 && Math.abs(calcBezier(1, a, a) - 1) < 1e-15));
    // the slope, against a numerical derivative
    let ds = 0;
    for (const a1 of [0, 0.25, 0.42, 1]) for (const a2 of [0, 0.58, 1]) for (const t of [0.1, 0.3, 0.7, 0.9]) {
        const h = 1e-6, num = (calcBezier(t + h, a1, a2) - calcBezier(t - h, a1, a2)) / (2 * h);
        ds = Math.max(ds, Math.abs(slope(t, a1, a2) - num));
    }
    ok("the analytic slope matches a numerical derivative", ds < 1e-6, `worst ${ds.toExponential(2)}`);
    ok("A, B and C are the standard coefficients", A(0, 1) === 1 - 3 + 0 && B(0, 1) === 3 && C(0.5) === 1.5);
}

// ---- 2. WHY NEWTON FAILS -----------------------------------------------------------------------------------
console.log("\n2. *** dx/dt IS EXACTLY ZERO AT t=0 WHENEVER x1 IS 0, AND THAT IS AN ORDINARY CURVE ***");
{
    ok("!! slope(0) is exactly 0 for cubic-bezier(0, ...)", slope(0, 0, 1) === 0 && slope(0, 0, 0) === 0,
        "so a Newton step divides by zero, or is skipped -- either way it makes no progress");
    ok("...while an ordinary curve has slope to work with", slope(0, 0.42, 1) > 1,
        `ease-in starts at slope ${slope(0, 0.42, 1)}`);
    ok("!! bisection needs no derivative at all, which is the whole reason it is the fallback",
        Math.abs(calcBezier(binarySubdivide(0.5, 0, 1, 0, 0), 0, 0) - 0.5) < 1e-7,
        "10+ halvings of the bracket, with no assumption about the curve");
    // and the old solver's actual behaviour at that point
    const old = oldSolver(0, 1, 0, 1);
    ok("!! the old solver returns visibly the wrong answer there", Math.abs(old(5e-4) - truth(0, 1, 0, 1, 5e-4)) > 0.1,
        `old ${old(5e-4).toFixed(4)} vs true ${truth(0, 1, 0, 1, 5e-4).toFixed(4)}`);
}

// ---- 3. ACCURACY, OLD AGAINST NEW --------------------------------------------------------------------------
console.log("\n3. *** THE WHOLE LEGAL CONTROL-POINT GRID, AGAINST A 200-ITERATION BISECTION ***");
let ordinary = null, tail = null;
{
    const sweep = (us) => {
        let wo = { e: 0 }, wn = { e: 0 };
        for (const x1 of GRID) for (const x2 of GRID) for (const y1 of YS) for (const y2 of YS) {
            const fn = bezierEasing(x1, y1, x2, y2), old = oldSolver(x1, y1, x2, y2);
            for (const u of us) {
                const t = truth(x1, y1, x2, y2, u);
                const eo = Math.abs(old(u) - t); if (eo > wo.e) wo = { e: eo, c: `(${x1},${y1},${x2},${y2})`, u };
                const en = Math.abs(fn(u) - t); if (en > wn.e) wn = { e: en, c: `(${x1},${y1},${x2},${y2})`, u };
            }
        }
        return { old: wo, now: wn };
    };
    ordinary = sweep(Array.from({ length: 200 }, (_, i) => (i + 1) / 201));
    tail = sweep([1e-7, 1e-6, 1e-5, 1e-4, 5e-4, 1e-3, 2.5e-3, 5e-3, 1e-2]);
    console.log(`  ordinary sampling: old ${ordinary.old.e.toExponential(3)}  ->  new ${ordinary.now.e.toExponential(3)}`);
    console.log(`  the small-u tail : old ${tail.old.e.toExponential(3)} at ${tail.old.c} u=${tail.old.u}  ->  new ${tail.now.e.toExponential(3)}`);
    ok("!! *** THE NEW SOLVER IS AT MACHINE PRECISION AT ORDINARY SAMPLING ***", ordinary.now.e < 1e-12,
        `${ordinary.now.e.toExponential(3)}, against the old solver's ${ordinary.old.e.toExponential(3)}`);
    ok("!! *** AND IT IS NOT WORSE ANYWHERE -- the first draft WAS, which is why this check exists ***",
        ordinary.now.e < ordinary.old.e,
        "a fallback that fixes the tail and regresses the middle is not an improvement");
    ok("!! the small-u tail improves by orders of magnitude", tail.now.e < tail.old.e / 1000,
        `${(tail.old.e / tail.now.e).toFixed(0)}x better; the old error was ${(tail.old.e * 100).toFixed(1)}% of the output range`);
    ok("...and the worst old case really is a curve someone would write", /^\(0,/.test(tail.old.c),
        `${tail.old.c} -- an x1 of 0 is what makes the slope vanish`);
}

// ---- 4. NEWTON IS CHECKED, NOT TRUSTED ---------------------------------------------------------------------
console.log("\n4. *** THE DEPARTURE FROM gre/bezier-easing: the residual is verified ***");
{
    // the exact case that forced it
    const x1 = 1, y1 = 0, x2 = 0, y2 = 1, u = 0.5012468827930174;
    const guessInterval = 5, STEP = 0.1;
    const guess = 0.5311719;
    const s = slope(guess, x1, x2);
    ok("!! the slope at the guess CLEARS the library's 0.001 threshold, so Newton is chosen", s >= 0.001,
        `slope ${s.toExponential(3)}`);
    // *** FOUR ITERATIONS IS THE LIBRARY'S CONSTANT, SO THE COMPARISON HAS TO USE FOUR. *** The first draft of
    // this check called the SHIPPED newtonRaphson, which runs eight -- and eight converges here, so the check
    // failed against the very code it was written to justify. The claim is about gre/bezier-easing's tuning,
    // not about Newton, so it reproduces that tuning explicitly.
    const newton4 = (target, g) => {
        let t = g;
        for (let i = 0; i < 4; i++) { const d = slope(t, x1, x2); if (d === 0) return t; t -= (calcBezier(t, x1, x2) - target) / d; }
        return t;
    };
    const nt4 = newton4(u, guess);
    const bt = binarySubdivide(u, guessInterval * STEP, guessInterval * STEP + STEP, x1, x2);
    const tTrue = (() => { let lo = 0, hi = 1; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (calcBezier(m, x1, x2) < u) lo = m; else hi = m; } return (lo + hi) / 2; })();
    ok("!! ...and the library's FOUR Newton steps land further off than bisection does",
        Math.abs(nt4 - tTrue) > Math.abs(bt - tTrue),
        `newton(4) |dt| ${Math.abs(nt4 - tTrue).toExponential(2)} vs bisect ${Math.abs(bt - tTrue).toExponential(2)}`);
    ok("...which is why the shipped solver runs eight AND verifies the residual",
        Math.abs(newtonRaphson(u, guess, x1, x2) - tTrue) < 1e-12,
        "more iterations fix THIS curve; the residual check is what covers the ones nobody measured");
    const fn = bezierEasing(x1, y1, x2, y2);
    ok("!! so the shipped solver checks |x(t) - u| and falls back -- and lands at machine precision here",
        Math.abs(fn(u) - truth(x1, y1, x2, y2, u)) < 1e-12,
        "the slope alone cannot tell you Newton has run out of iterations");
    const src = codeOnly(fs.readFileSync(path.join(ROOT, "ui", "bezierEasing.mjs"), "utf8"));
    ok("...and that check is in the source, not just in this run",
        /Math\.abs\(calcBezier\(t, x1, x2\) - u\) <= ACCEPT_EPS/.test(src));
}

// ---- 5. THE PROPERTIES AN EASING MUST HAVE -----------------------------------------------------------------
console.log("\n5. endpoints, monotonicity, and the identity");
{
    let bad = 0;
    for (const x1 of GRID) for (const x2 of GRID) {
        const f = bezierEasing(x1, 0, x2, 1);
        if (f(0) !== 0 || f(1) !== 1) bad++;
    }
    ok("!! every curve returns EXACTLY 0 and 1 at the endpoints", bad === 0,
        "every solver here is iterative, so without the shortcut an animation would end at 0.9999999");
    let nonMono = 0;
    for (const x1 of GRID) for (const x2 of GRID) {
        const f = bezierEasing(x1, 0, x2, 1);
        let prev = -Infinity;
        for (let i = 0; i <= 300; i++) { const v = f(i / 300); if (v < prev - 1e-9) nonMono++; prev = v; }
    }
    ok("!! a monotone y gives a monotone easing, over the whole grid", nonMono === 0);
    const lin = bezierEasing(0, 0, 1, 1);
    let linExact = true;
    for (let i = 0; i <= 200; i++) { const u = i / 200; if (lin(u) !== u) linExact = false; }
    ok("!! linear is the EXACT identity, returned without sampling anything", linExact);
    // overshoot: y outside [0,1] is legal and must not be clamped
    const back = bezierEasing(0.68, -0.55, 0.265, 1.55);
    let overshot = false, undershot = false;
    for (let i = 0; i <= 200; i++) { const v = back(i / 200); if (v > 1.0001) overshot = true; if (v < -0.0001) undershot = true; }
    ok("!! an overshoot curve really overshoots -- y is unconstrained, and clamping it would be wrong",
        overshot && undershot, "ease-out-back is a legal cubic-bezier and this is how it is written");
}

// ---- 6. VALIDATION -----------------------------------------------------------------------------------------
console.log("\n6. what is refused");
{
    let threw = 0;
    for (const bad of [[1.5, 0, 0.5, 1], [-0.1, 0, 0.5, 1], [0.5, 0, 2, 1], [0.5, 0, -1, 1]]) {
        try { bezierEasing(...bad); } catch { threw++; }
    }
    ok("!! an x outside [0,1] THROWS rather than returning something that is not a timing curve", threw === 4,
        "x must be in [0,1] for x(t) to be monotonic, which is what makes it invertible at all");
    ok("...but y outside [0,1] is accepted", (() => { try { bezierEasing(0.5, -2, 0.5, 3); return true; } catch { return false; } })());
    ok("parseCubicBezier reads a CSS string", JSON.stringify(parseCubicBezier("cubic-bezier(0.4, 0, 0.2, 1)")) === "[0.4,0,0.2,1]");
    ok("...and negatives, and whitespace", JSON.stringify(parseCubicBezier("cubic-bezier( 0.68 , -0.55 , 0.265 , 1.55 )")) === "[0.68,-0.55,0.265,1.55]");
    ok("...and returns null for anything else", parseCubicBezier("ease-in") === null && parseCubicBezier("") === null);
    ok("the CSS keywords resolve to the spec's control points",
        JSON.stringify(CSS_KEYWORDS.ease) === "[0.25,0.1,0.25,1]" && JSON.stringify(CSS_KEYWORDS["ease-in"]) === "[0.42,0,1,1]");
    ok("easingFromCSS takes a keyword or a function", typeof easingFromCSS("ease-in-out") === "function"
        && typeof easingFromCSS("cubic-bezier(0,0,1,1)") === "function" && easingFromCSS("wobble") === null);
}

// ---- 7. ONE SOLVER -----------------------------------------------------------------------------------------
console.log("\n7. *** ONE SOLVER IN THE TREE, WHICH IS THE HALF OF THIS THAT IS NOT ACCURACY ***");
{
    const rig = codeOnly(fs.readFileSync(path.join(ROOT, "rig", "RigSystem.js"), "utf8"));
    ok("!! RigSystem imports the solver rather than carrying one", /bezierEasing/.test(rig));
    ok("...and its own Newton loop is gone", !/Math\.abs\(dx\) < 1e-6/.test(rig) && !/for \(let i = 0; i < 8; i\+\+\)/.test(rig));
    ok("!! applyEasing now gets the accurate answer on the pathological curve",
        Math.abs(applyEasing("cubic-bezier(0, 1, 0, 1)", 5e-4) - truth(0, 1, 0, 1, 5e-4)) < 1e-4,
        "it was 0.22 out");
    ok("...and the named keywords it already had still work",
        applyEasing("linear", 0.3) === 0.3 && Math.abs(applyEasing("easeOutCubic", 0.5) - 0.875) < 1e-9);
    ok("...and an unparseable easing still falls through to linear rather than throwing",
        applyEasing("cubic-bezier(2, 0, 0.2, 1)", 0.5) === 0.5);
    // no third copy
    const files = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (["node_modules", ".git", "vendor"].includes(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
        }
    })(ROOT);
    // THIS FILE IS EXCLUDED, AND FOR A STATED REASON: it deliberately carries a copy of the OLD solver, so
    // that the improvement in section 3 is asserted against it rather than remembered from a session.
    const SELF = path.join("tools", "ship", "bezierEasing-selfcheck.mjs");
    const owners = files.filter((f) => /3 \* ct \* ct \* t \* x1|calcBezier\(t, a1, a2\)/.test(codeOnly(fs.readFileSync(f, "utf8"))))
        .map((f) => path.relative(ROOT, f)).filter((f) => f !== SELF);
    ok("!! exactly one file in the tree computes the bezier basis, and it is the shared module",
        owners.length === 1 && owners[0] === path.join("ui", "bezierEasing.mjs"),
        (owners.join(", ") || "none") + "  (this gate excluded: it keeps the old solver as a reference)");
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT ANYTHING WAS VISIBLY BROKEN. The old solver's error reached 22% of the output range,");
console.log("      but only for u below about 0.0025 -- inside the FIRST FRAME of any animation, on curves");
console.log("      with x1 = 0. At ordinary sampling it was 1.7e-4, which nobody could see. This is a");
console.log("      correctness hole that was not hurting anything, and saying so is more useful than");
console.log("      inventing a symptom for it.");

console.log("\nbezierEasing-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
