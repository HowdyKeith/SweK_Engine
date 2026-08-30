// math/inverseSolve.mjs -- v4201
//
// INVERT ANY PURE FUNCTION NUMERICALLY: given f(x) -> y and a target y*, find an x that produces it, using
// nothing but evaluations of f. No derivatives, no symbolic anything, no cooperation from f.
//
// Idea from bijection/g9 (MIT), whose trick is that you write a DRAW function and it becomes draggable:
// drag a shape and it minimises a cost over the DATA to find values that put the shape where you let go.
// Written here rather than vendored, because what this tree needs is the inversion and not the dragging.
//
// *** THE GAP, AND IT IS SHARPER THAN "THERE IS NO SOLVER". *** physics/hmc/inference.js already recovers
// parameters from data -- Bayesian, graded against a closed-form posterior. But its header says it plainly:
// "Gradients are ANALYTIC throughout (HMC's requirement)". So it can invert a model only if somebody first
// differentiated that model BY HAND. physics/reaction/brusselator.js has an analytic `jacobian(A, B)` for
// exactly that reason. Everything else in this tree -- every procedural planet, every spell cost, every
// material knob -- has no derivative written anywhere, and nobody is going to write hundreds of them.
//
// *** AND THE TREE IS ALREADY COMPUTING THE HARD PART, THEN THROWING IT AWAY. ***
// tools/roundhouse/knobLiveness.mjs perturbs every knob of every device and asks whether any observable
// moved. Its probe returns { state, moved: string[] } -- WHICH observables changed, compared with
// sameValue(). That is a one-sided finite difference whose MAGNITUDE is discarded at the comparison. Keep the
// magnitude and liveness becomes SENSITIVITY; collect sensitivity over every input and it is a JACOBIAN; and
// a Jacobian is the thing that inverts a function. The same measurement, kept rather than rounded to a
// boolean, is the whole of this file.
//
// So the two ideas meet exactly: a knob knobLiveness calls "moves nothing" is a ZERO COLUMN here, and a zero
// column is what makes the normal equations singular. The damping below is what turns that from an explosion
// into "that input simply does not move".
"use strict";

/** Relative step, near the cube root of machine epsilon -- the classic central-difference compromise. */
export const DEFAULT_STEP = 6.06e-6;

const isVec = (v) => Array.isArray(v) && v.every((n) => typeof n === "number" && Number.isFinite(n));

/**
 * Central-difference Jacobian: J[i][j] = d f_i / d x_j.
 *
 * *** CENTRAL AND NOT FORWARD, AND THE STEP IS RELATIVE. *** A forward difference has error O(h); central is
 * O(h^2) for one extra evaluation per input, which is the cheapest accuracy in numerical analysis. And the
 * step scales with |x| because an absolute step that is sensible at x = 1 is meaningless at x = 1e6 (lost
 * entirely to rounding) and enormous at x = 1e-6 (straight past the local behaviour).
 *
 * There is no step that is right for every function -- too small and the difference is float noise, too large
 * and it measures curvature instead of slope. The default is the standard compromise; a caller who knows
 * their function's scale should say so.
 */
export function jacobian(f, x, { step = DEFAULT_STEP } = {}) {
    if (typeof f !== "function") throw new TypeError("inverseSolve.jacobian: f is not a function");
    if (!isVec(x)) throw new TypeError("inverseSolve.jacobian: x must be an array of finite numbers");
    const y0 = f(x);
    if (!isVec(y0)) throw new TypeError("inverseSolve.jacobian: f(x) must return an array of finite numbers");
    const m = y0.length, n = x.length;
    const J = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
        const h = step * Math.max(1, Math.abs(x[j]));
        const xp = x.slice(), xm = x.slice();
        xp[j] += h; xm[j] -= h;
        const yp = f(xp), ym = f(xm);
        // *** A NON-FINITE PROBE IS A REFUSAL, NOT A ZERO. *** f may be undefined just past x -- a sqrt of a
        // negative, a log of zero. Writing 0 into the column would say "this input moves nothing", which is
        // the OPPOSITE of what happened: the function declined to be measured there. NaN carries that through
        // to the caller, and solve() treats a NaN column as an input it must not step along.
        for (let i = 0; i < m; i++) {
            const d = (yp[i] - ym[i]) / (2 * h);
            J[i][j] = Number.isFinite(d) ? d : NaN;
        }
    }
    return J;
}

/**
 * How much each input moves the output, as a column norm.
 *
 * *** THIS IS THE NUMBER tools/roundhouse/knobLiveness.mjs COMPUTES AND DISCARDS. *** Its probe answers
 * "did anything move" with a boolean; this answers "by how much" with the magnitude that was already in hand.
 * A zero here is precisely its "moves nothing" verdict, arrived at by the same perturbation.
 */
export function sensitivity(f, x, opts = {}) {
    const J = jacobian(f, x, opts);
    const n = x.length;
    const out = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
        let s = 0, bad = false;
        for (let i = 0; i < J.length; i++) {
            if (!Number.isFinite(J[i][j])) { bad = true; break; }
            s += J[i][j] * J[i][j];
        }
        out[j] = bad ? NaN : Math.sqrt(s);
    }
    return out;
}

/** Solve A z = b for small dense A by Gaussian elimination with partial pivoting. Returns null if singular. */
function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        if (!(Math.abs(M[piv][c]) > 1e-14)) return null;              // singular: the caller adds damping
        [M[c], M[piv]] = [M[piv], M[c]];
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const k = M[r][c] / M[c][c];
            for (let cc = c; cc <= n; cc++) M[r][cc] -= k * M[c][cc];
        }
    }
    // row[i] is this row's pivot after Gauss-Jordan. The first version wrote row[i][i], which indexes a
    // NUMBER and yields undefined -- so every solve returned NaN and every step was rejected as uphill. It
    // failed silently and looked exactly like "no downhill step exists": the solver reported a local minimum
    // on a LINEAR function. Found by replaying one iteration by hand, not by reading it again.
    return M.map((row, i) => row[n] / row[i]);
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const norm = (v) => Math.sqrt(v.reduce((s, q) => s + q * q, 0));

/**
 * Find x with f(x) ~= target, starting from x0. Levenberg-Marquardt: damped least squares on the residual.
 *
 * @returns { ok, x, residual, iterations, why, sensitivity }
 *
 * *** ok IS ABOUT THE RESIDUAL, NEVER ABOUT STOPPING. *** An iteration can stop for three quite different
 * reasons -- it reached the target, it reached a local minimum that is not the target, or it ran out of
 * steps -- and only the first is success. A solver that returned ok:true whenever its loop exited would be
 * confidently wrong on the two cases a caller most needs to know about, so `why` names which happened and
 * `ok` is decided by the residual alone.
 *
 * *** AND THE DAMPING IS WHAT MAKES A DEAD INPUT SURVIVABLE. *** An input that moves nothing gives a zero
 * column; the normal equations J'J are then singular, and an undamped step divides by that. With damping the
 * system is (J'J + lambda I), which is invertible for any lambda > 0 -- so a dead knob is simply an input the
 * solver never moves, instead of an exception or an infinity. That is the same fact knobLiveness reports as
 * "moves nothing", meeting the arithmetic where it actually bites.
 */
export function solve(f, target, x0, opts = {}) {
    const { maxIterations = 60, tolerance = 1e-9, step = DEFAULT_STEP,
            lambda0 = 1e-3, bounds = null } = opts;
    if (!isVec(target)) throw new TypeError("inverseSolve.solve: target must be an array of finite numbers");
    if (!isVec(x0)) throw new TypeError("inverseSolve.solve: x0 must be an array of finite numbers");

    let x = x0.slice();
    let y = f(x);
    if (!isVec(y)) throw new TypeError("inverseSolve.solve: f(x0) must return an array of finite numbers");
    if (y.length !== target.length) {
        throw new RangeError(`inverseSolve.solve: f returns ${y.length} values, target has ${target.length}`);
    }
    let r = norm(sub(target, y));
    let lambda = lambda0, it = 0, why = "max iterations reached";

    const clamp = (v) => (bounds ? v.map((q, i) => Math.max(bounds[i][0], Math.min(bounds[i][1], q))) : v);

    for (; it < maxIterations; it++) {
        if (r <= tolerance) { why = "reached the target"; break; }
        const J = jacobian(f, x, { step });
        const n = x.length, m = target.length;
        // Normal equations, with NaN columns (inputs f refused to be measured along) frozen out entirely.
        const live = [];
        for (let j = 0; j < n; j++) {
            let good = true;
            for (let i = 0; i < m; i++) if (!Number.isFinite(J[i][j])) { good = false; break; }
            if (good) live.push(j);
        }
        if (!live.length) { why = "every input is unmeasurable here -- f refused every probe"; break; }
        const d = sub(target, y);
        const A = live.map((j1) => live.map((j2) => {
            let s = 0; for (let i = 0; i < m; i++) s += J[i][j1] * J[i][j2]; return s;
        }));
        const g = live.map((j) => { let s = 0; for (let i = 0; i < m; i++) s += J[i][j] * d[i]; return s; });

        let stepped = false;
        for (let tryN = 0; tryN < 12 && !stepped; tryN++) {
            const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v + lambda : v)));
            const dz = solveLinear(Ad, g);
            if (!dz) { lambda *= 10; continue; }
            const cand = clamp(x.map((v, i) => { const k = live.indexOf(i); return k < 0 ? v : v + dz[k]; }));
            const yc = f(cand);
            const rc = isVec(yc) ? norm(sub(target, yc)) : Infinity;
            if (rc < r) { x = cand; y = yc; r = rc; lambda = Math.max(1e-12, lambda / 3); stepped = true; }
            else lambda *= 10;                                  // uphill: trust the gradient less, step shorter
        }
        if (!stepped) { why = "no downhill step exists from here -- a local minimum, or f is not smooth"; break; }
    }
    if (r <= tolerance && why === "max iterations reached") why = "reached the target";
    return {
        // *** DECIDED BY THE RESIDUAL, NOT BY HOW THE LOOP EXITED. ***
        ok: r <= tolerance,
        x, residual: r, iterations: it, why,
        sensitivity: sensitivity(f, x, { step }),
    };
}
