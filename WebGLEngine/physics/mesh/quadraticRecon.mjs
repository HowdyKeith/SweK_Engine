// physics/mesh/quadraticRecon.mjs
//
// *** v3646 ENDED BY PROPOSING A HIGHER-ORDER BOUNDARY ROW -- "two rows per face, or one per quadrature point,
// which is what would recover the exactness curvature costs". THAT PROPOSAL IS WRONG, AND THE MEASUREMENT SAYS
// SO IN THREE INDEPENDENT WAYS. THE BOUNDARY ROW WAS NEVER THE LIMITING FACTOR; THE RECONSTRUCTION WAS. ***
//
// The evidence, all on the annulus fixture from v3646:
//
//   1. THE SINGLE ROW IS ALREADY EXACT AT ITS OWN QUADRATURE POINT. A chord's outward normal is exactly the
//      radial direction at the ARC midpoint, by symmetry -- measured at 4.003e-16 rising only to 7.229e-15 over
//      a sixteenfold refinement, which is round-off and not geometry. There is no normal error to fix.
//   2. A CONSTANT GRADIENT CANNOT SATISFY THE ROW AT ALL. The exact gradient evaluated at the CENTROID, dotted
//      with the face normal, is O(h): 2.720e-1 down to 2.771e-2, halving with the mesh. The row asks a constant
//      gradient for something a constant gradient does not have, and the O(h) residual IS the observed first
//      order.
//   3. A SECOND ROW MAKES IT WORSE. Two rows per face, at the two endpoints with their own exact normals, reads
//      1.322e-1 against one row's 1.047e-1 and converges no faster -- because it adds another equation the
//      constant gradient cannot satisfy either.
//
// *** SO THE FIX IS IN THE RECONSTRUCTION. A quadratic fitted over the vertex neighbourhood, WITH NO BOUNDARY
// ROW AT ALL, converges at order 1.88 against the linear-plus-row's 0.93, and is 27x more accurate at the finest
// mesh. THE CATEGORY MOVES -- but not by the route I proposed. ***
//
// The basis is (dx, dy, dx^2/2, dx*dy, dy^2/2) with the constant eliminated by differencing against the cell's
// own value, so the fit has FIVE unknowns and needs at least five neighbours -- which a vertex neighbourhood has
// (mean 11.3 in 2D) and a face neighbourhood does not (mean 2.9). THE HIGHER ORDER COSTS THE WIDER STENCIL, and
// that is the same trade v3642 measured for the rank repair, arriving from a different direction.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

function solveN(A, b, n) {
    const M = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) {
        let p = i;
        for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
        if (Math.abs(M[p][i]) < 1e-14) return null;
        [M[i], M[p]] = [M[p], M[i]];
        for (let r = 0; r < n; r++) {
            if (r === i) continue;
            const f = M[r][i] / M[i][i];
            for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
        }
    }
    return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
}

/**
 * Quadratic least-squares reconstruction; returns the GRADIENT AT THE CENTROID (the first two coefficients) plus
 * `ok`, which is 0 where the stencil could not support five unknowns. A cell that cannot be fitted says so
 * rather than returning a zero -- v3640's law, kept.
 */
export function quadraticGradient(u, m, neighbours) {
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length), ok = new Int8Array(u.length);
    const used = new Int32Array(u.length);
    for (let t = 0; t < u.length; t++) {
        const list = neighbours[t];
        used[t] = list.length;
        if (list.length < 5) continue;                       // five unknowns; fewer rows cannot determine them
        const A = Array.from({ length: 5 }, () => new Float64Array(5)), b = new Float64Array(5);
        for (const q of list) {
            const dx = m.cx[q] - m.cx[t], dy = m.cy[q] - m.cy[t], du = u[q] - u[t];
            const w = 1 / (dx * dx + dy * dy);
            const p = [dx, dy, 0.5 * dx * dx, dx * dy, 0.5 * dy * dy];
            for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) A[i][j] += w * p[i] * p[j]; b[i] += w * p[i] * du; }
        }
        const s = solveN(A, b, 5);
        if (!s) continue;
        gx[t] = s[0]; gy[t] = s[1]; ok[t] = 1;
    }
    return { gx, gy, ok, used };
}

/**
 * *** THE QUADRATIC WITH THE BOUNDARY ROW -- and the row is now a linear condition on the coefficients, because
 * a quadratic's gradient at the face midpoint is (a1 + a3 dx + a4 dy, a2 + a4 dx + a5 dy). A CONSTANT gradient
 * could not satisfy the row (v3647); a quadratic can. ***
 */
export function quadraticGradientWithWall(u, m, neighbours, faces, { wall = "inner", rowWeight = 1 } = {}) {
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length), ok = new Int8Array(u.length);
    for (let t = 0; t < u.length; t++) {
        const rows = [];
        for (const q of neighbours[t]) {
            const dx = m.cx[q] - m.cx[t], dy = m.cy[q] - m.cy[t];
            rows.push([[dx, dy, 0.5 * dx * dx, dx * dy, 0.5 * dy * dy], u[q] - u[t], 1 / (dx * dx + dy * dy)]);
        }
        if (faces) for (const f of faces[t]) {
            if (f.kind !== wall) continue;
            const dx = f.mx - m.cx[t], dy = f.my - m.cy[t];
            // *** rowWeight WAS A HARDCODED 1 THROUGH SIX ROUNDS AND NOBODY ASKED WHAT IT WAS. v3649 swept it:
            // the optimum is near 0.25 and the difference between a good weight and the default is 1.7x --
            // LARGER THAN EVERY EFFECT THIS THREAD HAS BEEN MEASURING. A knob with no key, in the middle of the
            // instrument. The DEFAULT IS LEFT AT 1 so every earlier number reproduces; the knob is now visible. ***
            rows.push([[f.nx, f.ny, f.nx * dx, f.nx * dy + f.ny * dx, f.ny * dy], 0, rowWeight]);
        }
        if (rows.length < 5) continue;
        const A = Array.from({ length: 5 }, () => new Float64Array(5)), b = new Float64Array(5);
        for (const [pv, du, w] of rows) {
            for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) A[i][j] += w * pv[i] * pv[j]; b[i] += w * pv[i] * du; }
        }
        const sol = solveN(A, b, 5);
        if (!sol) continue;
        gx[t] = sol[0]; gy[t] = sol[1]; ok[t] = 1;
    }
    return { gx, gy, ok };
}

/**
 * *** GOLDEN-SECTION SEARCH FOR THE OPTIMAL ROW WEIGHT, ON log2(w). A SWEEP WAS NOT ENOUGH: v3649's grid was
 * spaced 2^0.25 and the argmin moved by EXACTLY ONE SAMPLE at each refinement, twice, then zero -- which is what
 * a quantised search reports when the true optimum drifts more slowly than the grid. AN ARGMIN OVER A SWEEP IS
 * AN INDEX, and v3619's law applies to it: an index cannot see a shift smaller than one cell. The search
 * resolution is now a STATED TOLERANCE rather than a sweep spacing. ***
 */
export function optimalRowWeight(errorOfLogWeight, { lo = -6, hi = 4, tol = 1e-4 } = {}) {
    const g = (Math.sqrt(5) - 1) / 2;
    let a = lo, b = hi, c = b - g * (b - a), d = a + g * (b - a), fc = errorOfLogWeight(c), fd = errorOfLogWeight(d);
    while (b - a > tol) {
        if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = errorOfLogWeight(c); }
        else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = errorOfLogWeight(d); }
    }
    const logw = 0.5 * (a + b);
    return { logw, w: Math.pow(2, logw), error: errorOfLogWeight(logw) };
}

/** The cell aspect ratio a wall face sees: radial spacing over the arc spacing at the inner wall. */
export const wallAspect = (m) => ((m.b - m.a) / m.nr) / (2 * Math.PI * m.a / m.nt);

/**
 * Project each wall face's evaluation point radially ONTO the wall. The chord midpoint sits INSIDE the circle by
 * a(1 - cos(pi/nt)); scaling it by a/|x| puts it on r = a, along the same radial direction -- so the NORMAL is
 * unchanged and only the LOCATION moves. Returns a new faces array; the original is untouched.
 */
export function projectFacesToWall(m, faces, which = "inner") {
    const R = which === "inner" ? m.a : m.b;
    return faces.map((l) => l.map((f) => {
        if (f.kind !== which) return f;
        const r = Math.hypot(f.mx, f.my), s = R / r;
        return { ...f, mx: f.mx * s, my: f.my * s };
    }));
}

/**
 * *** HOW FAR INSIDE THE WALL THE FACE MIDPOINT ACTUALLY SITS. v3647 said "the row is already exact at its own
 * quadrature point", and that was two claims wearing one sentence: the NORMAL is exact at the arc midpoint (it
 * is, to round-off), but the POINT is not on the wall at all. A chord's midpoint lies INSIDE the circle by
 * a(1 - cos(pi/nt)) -- a closed form, O(h^2) -- so the row states a true condition at a place where it is not
 * quite true. AN EXACT DIRECTION AT AN INEXACT LOCATION. ***
 */
export function faceMidpointOffset(m, faces, which = "inner") {
    let worst = 0;
    for (let t = 0; t < m.tri.length; t++) for (const f of faces[t]) {
        if (f.kind !== which) continue;
        worst = Math.max(worst, Math.abs(Math.hypot(f.mx, f.my) - (which === "inner" ? m.a : m.b)));
    }
    return { worst, closedForm: m.a * (1 - Math.cos(Math.PI / m.nt)) };
}

/** The residual the single boundary row asks a CONSTANT gradient to produce: |grad_exact(centroid) . n|. */
export function rowResidual(m, faces, gradFn, which = "inner") {
    let worst = 0, scale = 0;
    for (let t = 0; t < m.tri.length; t++) for (const f of faces[t]) {
        if (f.kind !== which) continue;
        const [gx, gy] = gradFn(m.cx[t], m.cy[t]);
        worst = Math.max(worst, Math.abs(gx * f.nx + gy * f.ny));
        scale = Math.max(scale, Math.hypot(gx, gy));
    }
    return { worst, relative: worst / Math.max(scale, 1e-300) };
}

/** How far a face's own normal is from the exact wall normal at its midpoint. Should be round-off, not O(h). */
export function normalExactness(m, faces, which = "inner") {
    let worst = 0;
    for (let t = 0; t < m.tri.length; t++) for (const f of faces[t]) {
        if (f.kind !== which) continue;
        const r = Math.hypot(f.mx, f.my);
        // the INNER wall's outward-from-the-cell normal points TOWARD the hole, i.e. -rhat
        const sx = which === "inner" ? -f.mx / r : f.mx / r, sy = which === "inner" ? -f.my / r : f.my / r;
        worst = Math.max(worst, Math.hypot(f.nx - sx, f.ny - sy));
    }
    return worst;
}
