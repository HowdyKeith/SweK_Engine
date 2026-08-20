// physics/em/remap2d.mjs
//
// THE 1D GUARANTEE DOES NOT SURVIVE THE SECOND DIMENSION.
//
// v3634 built a conservative cell-average remap in one dimension and found the trade: order 3 with overshoot,
// order 2 without, order 1 without. minmod bought monotonicity EXACTLY -- zero new extrema, an exact boolean
// with no tolerance chosen. This asks whether that survives in two dimensions, and the answer is the reason the
// round exists.
//
// *** I PREDICTED THAT PER-AXIS LIMITING WOULD FAIL IN 2D AND IT DOES NOT. The reasoning that made me expect it
// is right as far as it goes -- the reconstruction is u + sx*xi + sy*eta and THE CORNERS ADD BOTH SLOPES AT ONCE,
// where 1D has no corners. But the corner offsets are +/-1/2 in EACH axis, so the corner takes HALF of each
// slope, and with minmod |sx| <= dx and |sy| <= dy the worst corner excess is (dx + dy)/2 against a neighbourhood
// half-span of max(dx, dy). THE MEAN OF TWO NUMBERS NEVER EXCEEDS THEIR MAXIMUM. So per-axis minmod IS monotone
// on a Cartesian cell -- and the bound is TIGHT, attained with equality whenever dx = dy, which is why the
// measurement sits exactly on zero rather than comfortably below it. ***
//
// *** WHAT DOES BREAK IT IS EVALUATING THE RECONSTRUCTION OUTSIDE THE CELL, which is precisely what an unsplit
// corner-transport scheme does when it reaches to a diagonal neighbour. At an offset of 1 -- the neighbouring
// cell centre -- per-axis minmod escapes its own neighbourhood by 33% of the local span. AND THE FIELD THAT
// BREAKS IT IS THE SMOOTH ONE: on a step minmod zeroes the slope and never leaves, at any offset. The failure is
// where nobody looks for a limiter to fail. ***
//
// THE FIX IS A DIFFERENT SHAPE, NOT A BETTER 1D LIMITER: scale the WHOLE gradient by ONE factor alpha in [0,1],
// chosen so that no reconstructed point anywhere in the cell leaves the neighbourhood's range (Barth-Jespersen).
// One number for both axes, because the constraint couples them. It restores the exact zero -- and it costs.
//
// CONSERVATION IS AGAIN EXACT FOR ANY GRADIENT, for the same reason as in 1D: the subcell offsets are symmetric
// about the cell centre in BOTH axes, so both slope terms cancel in the mean. So the round trip is AGAIN the
// identity and AGAIN proves nothing -- third time this shape has appeared, stated up front for the second.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

export const minmod = (a, b) => (a * b <= 0 ? 0 : (Math.abs(a) < Math.abs(b) ? a : b));

const at = (u, nx, ny, i, j) => u[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];

/** Per-cell gradients. mode: "none" | "centered" | "minmod" (per axis) | "bj" (Barth-Jespersen scaled centered). */
export function gradients(u, nx, ny, mode = "centered") {
    const sx = new Float64Array(nx * ny), sy = new Float64Array(nx * ny);
    if (mode === "none") return { sx, sy };
    for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
            const k = j * nx + i;
            const bx = u[k] - at(u, nx, ny, i - 1, j), fx = at(u, nx, ny, i + 1, j) - u[k];
            const by = u[k] - at(u, nx, ny, i, j - 1), fy = at(u, nx, ny, i, j + 1) - u[k];
            if (mode === "minmod") { sx[k] = minmod(bx, fx); sy[k] = minmod(by, fy); }
            else { sx[k] = 0.5 * (bx + fx); sy[k] = 0.5 * (by + fy); }
        }
    }
    if (mode !== "bj") return { sx, sy };
    // *** BARTH-JESPERSEN: ONE alpha FOR BOTH AXES, because the constraint couples them. The extreme values of a
    // linear reconstruction over a square cell are at its CORNERS, so it is enough to hold the four corners
    // inside the 5-point neighbourhood's range -- and holding them holds everything between, since a plane over
    // a convex cell attains its bounds at the vertices. ***
    for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
            const k = j * nx + i, c = u[k];
            let lo = c, hi = c;
            for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const v = at(u, nx, ny, i + di, j + dj);
                lo = Math.min(lo, v); hi = Math.max(hi, v);
            }
            let alpha = 1;
            for (const ex of [-0.5, 0.5]) for (const ey of [-0.5, 0.5]) {
                const d = sx[k] * ex + sy[k] * ey;
                if (d > 0 && c + d > hi) alpha = Math.min(alpha, (hi - c) / d);
                else if (d < 0 && c + d < lo) alpha = Math.min(alpha, (lo - c) / d);
            }
            sx[k] *= alpha; sy[k] *= alpha;
        }
    }
    return { sx, sy };
}

/** Coarse cell averages -> fine cell averages. Conserves the integral EXACTLY for any gradient. */
export function refineCells2d(u, nx, ny, ratio, mode = "centered") {
    const { sx, sy } = gradients(u, nx, ny, mode);
    const NX = nx * ratio, NY = ny * ratio, out = new Float64Array(NX * NY);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        for (let b = 0; b < ratio; b++) for (let a = 0; a < ratio; a++) {
            const ex = (a + 0.5) / ratio - 0.5, ey = (b + 0.5) / ratio - 0.5;
            out[(j * ratio + b) * NX + (i * ratio + a)] = u[k] + sx[k] * ex + sy[k] * ey;
        }
    }
    return out;
}

export function coarsenCells2d(f, NX, NY, ratio) {
    const nx = Math.floor(NX / ratio), ny = Math.floor(NY / ratio), out = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        let s = 0;
        for (let b = 0; b < ratio; b++) for (let a = 0; a < ratio; a++) s += f[(j * ratio + b) * NX + (i * ratio + a)];
        out[j * nx + i] = s / (ratio * ratio);
    }
    return out;
}

export const cellIntegral2d = (u, h = 1) => { let s = 0; for (let i = 0; i < u.length; i++) s += u[i]; return s * h * h; };

/** Exact 2D cell averages of an analytic field, by a tensor Simpson rule per cell. */
export function analyticCells2d(f, nx, ny, { x0 = 0, y0 = 0, h = 1 } = {}) {
    const w = [1 / 6, 4 / 6, 1 / 6], out = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        let s = 0;
        for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
            s += w[a] * w[b] * f(x0 + (i + a * 0.5) * h, y0 + (j + b * 0.5) * h);
        }
        out[j * nx + i] = s;
    }
    return out;
}

/**
 * NEW EXTREMA IN 2D, measured against each cell's OWN 5-POINT NEIGHBOURHOOD rather than the global range.
 * The global range is the weaker question and it is the one that hides this defect: a reconstruction can stay
 * inside the whole field's min and max while leaving its own neighbourhood, which is what "monotone" means.
 */
export function newExtrema2d(u, nx, ny, ratio, mode = "centered") {
    const f = refineCells2d(u, nx, ny, ratio, mode), NX = nx * ratio;
    let count = 0, worst = 0, span = 0;
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const c = u[j * nx + i];
        let lo = c, hi = c;
        for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const v = at(u, nx, ny, i + di, j + dj); lo = Math.min(lo, v); hi = Math.max(hi, v);
        }
        span = Math.max(span, hi - lo);
        for (let b = 0; b < ratio; b++) for (let a = 0; a < ratio; a++) {
            const v = f[(j * ratio + b) * NX + (i * ratio + a)];
            if (v > hi) { count++; worst = Math.max(worst, v - hi); }
            else if (v < lo) { count++; worst = Math.max(worst, lo - v); }
        }
    }
    return { count, worst, span, relative: worst / Math.max(span, 1e-300) };
}

/**
 * THE BOUNDARY OF THE GUARANTEE. Evaluate the reconstruction at corner offsets of `offset` in each axis and ask
 * whether it left its own 5-point neighbourhood. offset = 0.5 is the cell's own corner; offset = 1 is the
 * NEIGHBOURING CELL CENTRE, which is where an unsplit corner-transport step samples. Separated from
 * newExtrema2d on purpose: that one asks about the cells actually produced by a refinement (whose centres sit
 * strictly inside the cell), and this one asks how much margin the guarantee has.
 */
export function escapesAt(u, nx, ny, mode = "minmod", offset = 0.5) {
    const g = gradients(u, nx, ny, mode);
    let count = 0, worst = 0, span = 0;
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i, c = u[k];
        let lo = c, hi = c;
        for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const v = at(u, nx, ny, i + di, j + dj); lo = Math.min(lo, v); hi = Math.max(hi, v);
        }
        span = Math.max(span, hi - lo);
        for (const ex of [-offset, offset]) for (const ey of [-offset, offset]) {
            const v = c + g.sx[k] * ex + g.sy[k] * ey;
            if (v > hi) { count++; worst = Math.max(worst, v - hi); }
            else if (v < lo) { count++; worst = Math.max(worst, lo - v); }
        }
    }
    return { count, worst, span, relative: worst / Math.max(span, 1e-300) };
}

/** A diagonal step: the 2D field a limiter is usually expected to be tested on. */
export function diagonalStep(n) {
    const u = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) u[j * n + i] = (i + j < n) ? 1 : 0;
    return u;
}

/** Worst relative departure from the analytic cell averages on the fine grid, interior only. */
export function refineAccuracy2d(f, nx, ny, ratio, { h = 1, mode = "centered" } = {}) {
    const coarse = analyticCells2d(f, nx, ny, { h });
    const got = refineCells2d(coarse, nx, ny, ratio, mode);
    const truth = analyticCells2d(f, nx * ratio, ny * ratio, { h: h / ratio });
    const NX = nx * ratio, skip = 2 * ratio;
    let worst = 0, peak = 0;
    for (let j = skip; j < ny * ratio - skip; j++) for (let i = skip; i < NX - skip; i++) {
        const t = truth[j * NX + i];
        peak = Math.max(peak, Math.abs(t));
        worst = Math.max(worst, Math.abs(got[j * NX + i] - t));
    }
    return { worst, peak, relative: worst / Math.max(peak, 1e-300) };
}
